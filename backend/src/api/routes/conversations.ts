import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export async function conversationRoutes(app: FastifyInstance) {
  app.get('/conversations', { preHandler: app.auth }, async (req) => {
    const list = await prisma.conversation.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
    return { conversations: list };
  });

  app.get('/conversations/:phone', { preHandler: app.auth }, async (req, reply) => {
    const { phone } = z.object({ phone: z.string() }).parse(req.params);
    const conv = await prisma.conversation.findUnique({
      where: { clinicId_clientPhone: { clinicId: req.auth!.clinicId, clientPhone: phone } },
    });
    if (!conv) return reply.status(404).send({ error: 'Not found' });
    return { conversation: conv };
  });
}
