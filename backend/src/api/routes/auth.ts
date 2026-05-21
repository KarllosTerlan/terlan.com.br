import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerClinicSchema = z.object({
  clinicName: z.string().min(2),
  adminName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { clinic: true },
    });
    if (!user || !user.active) return reply.status(401).send({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return reply.status(401).send({ error: 'Invalid credentials' });

    const token = await reply.jwtSign({
      userId: user.id,
      clinicId: user.clinicId,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clinic: { id: user.clinic.id, name: user.clinic.name },
      },
    };
  });

  app.post('/auth/register-clinic', async (req, reply) => {
    const body = registerClinicSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) return reply.status(409).send({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(body.password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: { name: body.clinicName, phone: body.phone },
      });
      const user = await tx.user.create({
        data: {
          clinicId: clinic.id,
          name: body.adminName,
          email: body.email,
          passwordHash,
          role: 'ADMIN',
        },
      });
      return { clinic, user };
    });

    const token = await reply.jwtSign({
      userId: result.user.id,
      clinicId: result.clinic.id,
      role: 'ADMIN',
    });

    return reply.status(201).send({
      token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        clinic: { id: result.clinic.id, name: result.clinic.name },
      },
    });
  });

  app.get('/auth/me', { preHandler: app.auth }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      include: { clinic: true },
    });
    if (!user) return { user: null };
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clinic: { id: user.clinic.id, name: user.clinic.name },
      },
    };
  });
}
