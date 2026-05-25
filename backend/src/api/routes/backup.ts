import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { writeLog } from '../../lib/observability.js';
import { env } from '../../config/env.js';

export async function backupRoutes(app: FastifyInstance) {
  app.get('/backup/config', { preHandler: app.auth }, async (req) => {
    const config = await prisma.backupConfig.findUnique({
      where: { clinicId: req.auth!.clinicId },
    });
    return { config };
  });

  app.put('/backup/config', { preHandler: app.auth }, async (req) => {
    const data = z.object({
      enabled: z.boolean().default(true),
      frequencyHours: z.number().int().min(1).max(168).default(24),
      retentionDays: z.number().int().min(1).max(90).default(30),
    }).parse(req.body);

    const clinicId = req.auth!.clinicId;
    const config = await prisma.backupConfig.upsert({
      where: { clinicId },
      create: { ...data, clinicId, nextRunAt: new Date(Date.now() + data.frequencyHours * 3600 * 1000) },
      update: { ...data, nextRunAt: new Date(Date.now() + data.frequencyHours * 3600 * 1000) },
    });
    return { config };
  });

  app.get('/backup/runs', { preHandler: app.auth }, async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().default(20) }).parse(req.query);
    const runs = await prisma.backupRun.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return { runs };
  });

  app.post('/backup/trigger', { preHandler: app.auth }, async (req, reply) => {
    const clinicId = req.auth!.clinicId;
    const run = await prisma.backupRun.create({
      data: { clinicId, status: 'RUNNING', trigger: 'manual' },
    });

    // Trigger async — responde imediatamente
    setImmediate(async () => {
      try {
        await writeLog(clinicId, 'INFO', 'backup', `Backup manual iniciado: ${run.id}`);
        // TODO: invocar pg_dump e upload em produção
        await prisma.backupRun.update({
          where: { id: run.id },
          data: { status: 'SUCCESS', finishedAt: new Date() },
        });
      } catch (err) {
        await prisma.backupRun.update({
          where: { id: run.id },
          data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
        });
      }
    });

    return reply.status(202).send({ run });
  });
}
