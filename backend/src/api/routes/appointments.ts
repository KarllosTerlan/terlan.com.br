import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma.js';
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from '../../scheduler/booking.service.js';

const listQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  professionalId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
});

const createSchema = z.object({
  professionalId: z.string().uuid(),
  clientPhone: z.string().min(8),
  clientName: z.string().optional(),
  dateTime: z.string(),
  duration: z.number().int().min(5).max(480).default(30),
  notes: z.string().optional(),
});

const rescheduleSchema = z.object({
  dateTime: z.string(),
  duration: z.number().int().optional(),
});

export async function appointmentRoutes(app: FastifyInstance) {
  app.get('/appointments', { preHandler: app.auth }, async (req) => {
    const q = listQuery.parse(req.query);
    const where: any = { clinicId: req.auth!.clinicId };
    if (q.professionalId) where.professionalId = q.professionalId;
    if (q.status) where.status = q.status;
    if (q.from || q.to) {
      where.dateTime = {};
      if (q.from) where.dateTime.gte = new Date(q.from);
      if (q.to) where.dateTime.lte = new Date(q.to);
    }
    const list = await prisma.appointment.findMany({
      where,
      include: { professional: true, client: true },
      orderBy: { dateTime: 'asc' },
      take: 500,
    });
    return { appointments: list };
  });

  app.get('/appointments/:id', { preHandler: app.auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const appt = await prisma.appointment.findFirst({
      where: { id, clinicId: req.auth!.clinicId },
      include: { professional: true, client: true },
    });
    if (!appt) return reply.status(404).send({ error: 'Not found' });
    return { appointment: appt };
  });

  app.post('/appointments', { preHandler: app.auth }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    let client = await prisma.client.findUnique({ where: { phone: body.clientPhone } });
    if (!client) {
      client = await prisma.client.create({
        data: { phone: body.clientPhone, name: body.clientName },
      });
    }
    const appt = await bookAppointment({
      clinicId: req.auth!.clinicId,
      professionalId: body.professionalId,
      clientId: client.id,
      dateTime: new Date(body.dateTime),
      duration: body.duration,
      notes: body.notes,
    });
    return reply.status(201).send({ appointment: appt });
  });

  app.post('/appointments/:id/cancel', { preHandler: app.auth }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const updated = await cancelAppointment(req.auth!.clinicId, id, body.reason);
    return { appointment: updated };
  });

  app.post('/appointments/:id/reschedule', { preHandler: app.auth }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = rescheduleSchema.parse(req.body);
    const updated = await rescheduleAppointment(
      req.auth!.clinicId,
      id,
      new Date(body.dateTime),
      body.duration,
    );
    return { appointment: updated };
  });
}
