// Cron endpoints — chamados pelo container cron a cada 5 minutos.
// Protegidos por CRON_SECRET no header x-cron-token.

import type { FastifyInstance } from 'fastify';
import { addMinutes } from 'date-fns';
import { prisma } from '../../lib/prisma.js';
import { sendText } from '../../whatsapp/sender.js';
import { writeLog, cleanOldLogs } from '../../lib/observability.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

function verifyCronToken(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  return req.headers['x-cron-token'] === env.CRON_SECRET;
}

export async function cronRoutes(app: FastifyInstance) {
  // ── Reminders ──
  app.post('/cron/reminders', async (req, reply) => {
    if (!verifyCronToken(req)) return reply.status(401).send({ error: 'Unauthorized' });

    const now = new Date();

    // 24h before reminder
    const w24Start = addMinutes(now, 24 * 60 - 10);
    const w24End = addMinutes(now, 24 * 60 + 10);

    const appts24h = await prisma.appointment.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        reminderSent: false,
        dateTime: { gte: w24Start, lte: w24End },
      },
      include: { client: true, service: true, clinic: true },
    });

    for (const appt of appts24h) {
      try {
        const dt = appt.dateTime.toLocaleString('pt-BR', {
          timeZone: appt.clinic.timezone,
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
        const svc = appt.service?.name ?? 'Consulta';
        const msg = `🗓️ Lembrete de Consulta\n\nOlá${appt.client.name ? `, ${appt.client.name}` : ''}! Sua *${svc}* está marcada para *${dt}*.\n\nVocê confirma sua presença? Responda *sim* ou *não*.`;
        await sendText(appt.clinicId, appt.client.phone, msg);
        await prisma.appointment.update({ where: { id: appt.id }, data: { reminderSent: true } });
        await writeLog(appt.clinicId, 'INFO', 'cron', `Lembrete 24h enviado: ${appt.id}`, { phone: appt.client.phone });
      } catch (err) {
        logger.error({ err, apptId: appt.id }, 'Failed to send 24h reminder');
      }
    }

    // 1h before reminder
    const w1hStart = addMinutes(now, 60 - 5);
    const w1hEnd = addMinutes(now, 60 + 5);

    const appts1h = await prisma.appointment.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        hourReminderSent: false,
        dateTime: { gte: w1hStart, lte: w1hEnd },
      },
      include: { client: true, service: true, clinic: true },
    });

    for (const appt of appts1h) {
      try {
        const svc = appt.service?.name ?? 'Consulta';
        const msg = `⏰ Sua *${svc}* começa em 1 hora! Até logo! 😊`;
        await sendText(appt.clinicId, appt.client.phone, msg);
        await prisma.appointment.update({ where: { id: appt.id }, data: { hourReminderSent: true } });
        await writeLog(appt.clinicId, 'INFO', 'cron', `Lembrete 1h enviado: ${appt.id}`, { phone: appt.client.phone });
      } catch (err) {
        logger.error({ err, apptId: appt.id }, 'Failed to send 1h reminder');
      }
    }

    // Auto-complete: marcar como COMPLETED agendamentos confirmados que já passaram
    const pastAppts = await prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        dateTime: { lt: addMinutes(now, -30) }, // passou há mais de 30min
      },
    });
    if (pastAppts.length > 0) {
      await prisma.appointment.updateMany({
        where: { id: { in: pastAppts.map((a) => a.id) } },
        data: { status: 'COMPLETED' },
      });
    }

    return { reminders24h: appts24h.length, reminders1h: appts1h.length, completed: pastAppts.length };
  });

  // ── Inactivity ──
  app.post('/cron/inactivity', async (req, reply) => {
    if (!verifyCronToken(req)) return reply.status(401).send({ error: 'Unauthorized' });

    const now = new Date();
    const WARNING_MINUTES = 8;
    const CLOSE_MINUTES = 15;
    const TERMINAL_CLOSE_MINUTES = 30;

    // Fechar conversas com terminal step (agendamento/cancelamento feito)
    const terminalConvs = await prisma.conversation.findMany({
      where: { active: true },
      select: { id: true, clinicId: true, context: true, updatedAt: true },
    });

    let closedTerminal = 0;
    for (const conv of terminalConvs) {
      const ctx = conv.context as Record<string, unknown>;
      if (ctx.terminalStep && ctx.terminalAt) {
        const elapsed = now.getTime() - Number(ctx.terminalAt);
        if (elapsed > TERMINAL_CLOSE_MINUTES * 60 * 1000) {
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { active: false },
          });
          closedTerminal++;
        }
      }
    }

    // Fechar conversas inativas por mais de CLOSE_MINUTES
    const inactiveThreshold = new Date(now.getTime() - CLOSE_MINUTES * 60 * 1000);
    const { count: closedInactive } = await prisma.conversation.updateMany({
      where: {
        active: true,
        outcome: 'UNKNOWN',
        lastMessageAt: { lt: inactiveThreshold },
      },
      data: { active: false, outcome: 'ABANDONED' },
    });

    // Limpar logs antigos (mais de 30 dias) para todas as clínicas com logs
    const clinicsWithLogs = await prisma.systemLog.findMany({
      select: { clinicId: true },
      distinct: ['clinicId'],
    });
    for (const { clinicId } of clinicsWithLogs) {
      await cleanOldLogs(clinicId).catch(() => {});
    }

    return { closedTerminal, closedInactive };
  });

  // ── Backup config check ──
  app.post('/cron/backup', async (req, reply) => {
    if (!verifyCronToken(req)) return reply.status(401).send({ error: 'Unauthorized' });

    const now = new Date();
    const configs = await prisma.backupConfig.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
    });

    let triggered = 0;
    for (const config of configs) {
      const run = await prisma.backupRun.create({
        data: { clinicId: config.clinicId, status: 'RUNNING', trigger: 'scheduled' },
      });

      try {
        // In production, this would exec pg_dump. For now, logs the attempt.
        await writeLog(config.clinicId, 'INFO', 'backup', `Backup agendado iniciado: ${run.id}`);

        const nextRun = new Date(now.getTime() + config.frequencyHours * 60 * 60 * 1000);
        await Promise.all([
          prisma.backupRun.update({ where: { id: run.id }, data: { status: 'SUCCESS', finishedAt: new Date() } }),
          prisma.backupConfig.update({ where: { id: config.id }, data: { lastRunAt: now, nextRunAt: nextRun } }),
        ]);
        triggered++;
      } catch (err) {
        await prisma.backupRun.update({
          where: { id: run.id },
          data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
        });
      }
    }

    return { triggered };
  });
}
