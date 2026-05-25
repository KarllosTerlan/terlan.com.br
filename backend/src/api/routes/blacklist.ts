import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function blacklistRoutes(app: FastifyInstance) {
  app.get('/blacklist', { preHandler: app.auth }, async (req) => {
    const list = await prisma.phoneBlacklist.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { blockedAt: 'desc' },
    });
    return { blacklist: list };
  });

  app.post('/blacklist', { preHandler: app.auth }, async (req, reply) => {
    const { phone, reason } = z.object({
      phone: z.string().min(8),
      reason: z.string().optional(),
    }).parse(req.body);

    const entry = await prisma.phoneBlacklist.upsert({
      where: { clinicId_phone: { clinicId: req.auth!.clinicId, phone } },
      create: { clinicId: req.auth!.clinicId, phone, reason },
      update: { reason },
    });
    return reply.status(201).send({ entry });
  });

  app.delete('/blacklist/:phone', { preHandler: app.auth }, async (req, reply) => {
    const { phone } = z.object({ phone: z.string() }).parse(req.params);
    const existing = await prisma.phoneBlacklist.findUnique({
      where: { clinicId_phone: { clinicId: req.auth!.clinicId, phone } },
    });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await prisma.phoneBlacklist.delete({
      where: { clinicId_phone: { clinicId: req.auth!.clinicId, phone } },
    });
    return { ok: true };
  });
}
