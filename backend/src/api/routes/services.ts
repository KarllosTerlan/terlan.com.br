import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480).default(30),
  price: z.number().positive().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#9e3d22'),
  active: z.boolean().default(true),
});

const updateSchema = createSchema.partial();

export async function serviceRoutes(app: FastifyInstance) {
  app.get('/services', { preHandler: app.auth }, async (req) => {
    const services = await prisma.service.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { name: 'asc' },
    });
    return { services };
  });

  app.post('/services', { preHandler: app.auth }, async (req, reply) => {
    const data = createSchema.parse(req.body);
    const service = await prisma.service.create({
      data: { ...data, clinicId: req.auth!.clinicId },
    });
    return reply.status(201).send({ service });
  });

  app.put('/services/:id', { preHandler: app.auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateSchema.parse(req.body);
    const existing = await prisma.service.findFirst({ where: { id, clinicId: req.auth!.clinicId } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const service = await prisma.service.update({ where: { id }, data });
    return { service };
  });

  app.delete('/services/:id', { preHandler: app.auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const existing = await prisma.service.findFirst({ where: { id, clinicId: req.auth!.clinicId } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await prisma.service.update({ where: { id }, data: { active: false } });
    return { ok: true };
  });
}
