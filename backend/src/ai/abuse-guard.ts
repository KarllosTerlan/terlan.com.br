// Proteção contra abuso: blacklist, rate limits, bot detection.

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { writeLog } from '../lib/observability.js';

const MAX_ACTIVE_APPOINTMENTS = 3;
const MAX_BOOKINGS_PER_HOUR = 4;
const MAX_CANCELLATIONS_PER_DAY = 3;
const ABUSE_BAN_SECONDS = 60 * 60 * 2; // 2h

export type AbuseCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: string };

async function incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
  const pipeline = redis.multi();
  pipeline.incr(key);
  pipeline.ttl(key);
  const result = await pipeline.exec();

  const count = Number(result?.[0]?.[1] ?? 0);
  const ttl = Number(result?.[1]?.[1] ?? -1);

  if (Number.isFinite(count) && (ttl === -1 || ttl === -2)) {
    await redis.expire(key, ttlSeconds).catch(() => {});
  }
  return Number.isFinite(count) ? count : 0;
}

/** Verifica se o número está bloqueado (banco ou Redis temporário). */
export async function isPhoneBlocked(
  clinicId: string,
  phone: string,
): Promise<AbuseCheckResult> {
  // 1. Blacklist permanente no banco
  const blocked = await prisma.phoneBlacklist.findUnique({
    where: { clinicId_phone: { clinicId, phone } },
  });
  if (blocked) {
    return { allowed: false, reason: blocked.reason ?? 'Número bloqueado.', code: 'BLACKLISTED' };
  }

  // 2. Ban temporário no Redis (bot detection / abuse)
  const banKey = `abuse:ban:${clinicId}:${phone}`;
  const banned = await redis.exists(banKey).catch(() => 0);
  if (banned) {
    return { allowed: false, reason: 'Muitas tentativas. Tente novamente mais tarde.', code: 'TEMP_BANNED' };
  }

  return { allowed: true };
}

/** Verifica se pode criar agendamento (limites de agendamentos ativos e taxa horária). */
export async function canCreateAppointment(
  clinicId: string,
  clientId: string,
  phone: string,
): Promise<AbuseCheckResult> {
  // 1. Máx agendamentos ativos
  const active = await prisma.appointment.count({
    where: {
      clinicId,
      clientId,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
  });
  if (active >= MAX_ACTIVE_APPOINTMENTS) {
    return {
      allowed: false,
      reason: `Você já tem ${active} agendamentos ativos. Cancele um antes de criar outro.`,
      code: 'TOO_MANY_ACTIVE',
    };
  }

  // 2. Taxa de criação por hora
  const hourKey = `abuse:book:${clinicId}:${phone}`;
  const hourCount = await incrementWithTtl(hourKey, 3600);
  if (hourCount > MAX_BOOKINGS_PER_HOUR) {
    await redis.setex(`abuse:ban:${clinicId}:${phone}`, ABUSE_BAN_SECONDS, '1').catch(() => {});
    await writeLog(clinicId, 'WARNING', 'abuse-guard', `Agendamentos excessivos: ${phone}`, { phone, hourCount });
    return { allowed: false, reason: 'Muitas tentativas de agendamento. Aguarde um momento.', code: 'RATE_LIMITED' };
  }

  return { allowed: true };
}

/** Rastreia cancelamentos para detect abuse. */
export async function trackCancellation(clinicId: string, phone: string): Promise<void> {
  const dayKey = `abuse:cancel:${clinicId}:${phone}`;
  const count = await incrementWithTtl(dayKey, 86400);
  if (count > MAX_CANCELLATIONS_PER_DAY) {
    await redis.setex(`abuse:ban:${clinicId}:${phone}`, ABUSE_BAN_SECONDS, '1').catch(() => {});
    await writeLog(clinicId, 'WARNING', 'abuse-guard', `Cancelamentos excessivos: ${phone}`, { phone, count });
  }
}

/** Anti-bot: rastreia velocidade de resposta. Ban se <800ms repetidamente. */
const BOT_FAST_THRESHOLD_MS = 800;
const BOT_SCORE_LIMIT = 8;
const BOT_BAN_SECONDS = 10 * 60;

export async function trackBotScore(clinicId: string, phone: string): Promise<void> {
  const lastKey = `bot:last:${clinicId}:${phone}`;
  const scoreKey = `bot:score:${clinicId}:${phone}`;

  const lastStr = await redis.get(lastKey).catch(() => null);
  const now = Date.now();

  if (lastStr) {
    const elapsed = now - parseInt(lastStr, 10);
    if (elapsed < BOT_FAST_THRESHOLD_MS) {
      const score = await incrementWithTtl(scoreKey, 3600);
      if (score >= BOT_SCORE_LIMIT) {
        await redis.setex(`abuse:ban:${clinicId}:${phone}`, BOT_BAN_SECONDS, '1').catch(() => {});
        await writeLog(clinicId, 'WARNING', 'abuse-guard', `Bot detectado: ${phone}`, { phone, score });
      }
    } else {
      await redis.del(scoreKey).catch(() => {});
    }
  }

  await redis.setex(lastKey, 3600, String(now)).catch(() => {});
}
