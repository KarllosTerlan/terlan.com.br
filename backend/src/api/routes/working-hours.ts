import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const hourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  breakEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  slotIntervalMinutes: z.number().int().min(5).max(120).default(30),
  active: z.boolean().default(true),
});

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allDay: z.boolean().default(true),
  vipOnly: z.boolean().default(false),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  reason: z.string().optional().nullable(),
});

export async function workingHoursRoutes(app: FastifyInstance) {
  // ── Working Hours ──
  app.get('/working-hours', { preHandler: app.auth }, async (req) => {
    const hours = await prisma.workingHours.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { weekday: 'asc' },
    });
    return { hours };
  });

  app.put('/working-hours', { preHandler: app.auth }, async (req) => {
    const items = z.array(hourSchema).parse(req.body);
    const clinicId = req.auth!.clinicId;

    // Replace all working hours for this clinic
    await prisma.workingHours.deleteMany({ where: { clinicId } });
    const hours = await prisma.workingHours.createMany({
      data: items.map((h) => ({ ...h, clinicId })),
    });
    return { count: hours.count };
  });

  // ── Schedule Exceptions ──
  app.get('/schedule-exceptions', { preHandler: app.auth }, async (req) => {
    const q = z.object({ month: z.string().optional() }).parse(req.query);
    const where: Record<string, unknown> = { clinicId: req.auth!.clinicId };
    if (q.month) {
      where.date = { startsWith: q.month }; // "2026-12"
    }
    const exceptions = await prisma.scheduleException.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    return { exceptions };
  });

  app.post('/schedule-exceptions', { preHandler: app.auth }, async (req, reply) => {
    const data = exceptionSchema.parse(req.body);
    const exc = await prisma.scheduleException.create({
      data: { ...data, clinicId: req.auth!.clinicId },
    });
    return reply.status(201).send({ exception: exc });
  });

  app.delete('/schedule-exceptions/:id', { preHandler: app.auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const existing = await prisma.scheduleException.findFirst({
      where: { id, clinicId: req.auth!.clinicId },
    });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await prisma.scheduleException.delete({ where: { id } });
    return { ok: true };
  });
}
