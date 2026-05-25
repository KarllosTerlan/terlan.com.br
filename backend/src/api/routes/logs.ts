import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function logsRoutes(app: FastifyInstance) {
  app.get('/logs', { preHandler: app.auth }, async (req) => {
    const q = z.object({
      level: z.enum(['INFO', 'WARNING', 'ERROR']).optional(),
      scope: z.string().optional(),
      hours: z.coerce.number().int().min(1).max(168).default(24),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(req.query);

    const since = new Date(Date.now() - q.hours * 60 * 60 * 1000);
    const where: Record<string, unknown> = {
      clinicId: req.auth!.clinicId,
      createdAt: { gte: since },
    };
    if (q.level) where.level = q.level;
    if (q.scope) where.scope = q.scope;

    const logs = await prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    });
    return { logs };
  });

  app.delete('/logs', { preHandler: app.auth }, async (req) => {
    const { hours } = z.object({ hours: z.coerce.number().int().default(720) }).parse(req.query);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const { count } = await prisma.systemLog.deleteMany({
      where: { clinicId: req.auth!.clinicId, createdAt: { lt: cutoff } },
    });
    return { deleted: count };
  });
}
