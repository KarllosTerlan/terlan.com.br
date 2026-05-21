import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const updateClinicSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  timezone: z.string().optional(),
  businessHours: z.record(z.union([z.tuple([z.string(), z.string()]), z.null()])).optional(),
  welcomeMessage: z.string().optional(),
  offHoursMessage: z.string().optional(),
  googleCalendarId: z.string().optional(),
});

const professionalSchema = z.object({
  name: z.string().min(2),
  specialty: z.string().optional(),
  whatsappNumber: z.string().optional(),
  calendarId: z.string().optional(),
  defaultDuration: z.number().int().min(5).max(480).optional(),
  active: z.boolean().optional(),
});

export async function clinicRoutes(app: FastifyInstance) {
  app.get('/clinic', { preHandler: app.auth }, async (req) => {
    const clinic = await prisma.clinic.findUnique({ where: { id: req.auth!.clinicId } });
    return { clinic };
  });

  app.put('/clinic', { preHandler: app.auth }, async (req) => {
    const data = updateClinicSchema.parse(req.body);
    const clinic = await prisma.clinic.update({ where: { id: req.auth!.clinicId }, data });
    return { clinic };
  });

  app.get('/professionals', { preHandler: app.auth }, async (req) => {
    const list = await prisma.professional.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { name: 'asc' },
    });
    return { professionals: list };
  });

  app.post('/professionals', { preHandler: app.auth }, async (req, reply) => {
    const data = professionalSchema.parse(req.body);
    const pro = await prisma.professional.create({
      data: { ...data, clinicId: req.auth!.clinicId },
    });
    return reply.status(201).send({ professional: pro });
  });

  app.put('/professionals/:id', { preHandler: app.auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = professionalSchema.partial().parse(req.body);
    const existing = await prisma.professional.findFirst({
      where: { id, clinicId: req.auth!.clinicId },
    });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const pro = await prisma.professional.update({ where: { id }, data });
    return { professional: pro };
  });

  app.delete('/professionals/:id', { preHandler: app.auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const existing = await prisma.professional.findFirst({
      where: { id, clinicId: req.auth!.clinicId },
    });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await prisma.professional.update({ where: { id }, data: { active: false } });
    return { ok: true };
  });
}
