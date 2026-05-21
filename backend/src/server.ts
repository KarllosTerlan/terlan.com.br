import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

import { authMiddleware } from './api/middlewares/auth.js';
import { authRoutes } from './api/routes/auth.js';
import { clinicRoutes } from './api/routes/clinics.js';
import { appointmentRoutes } from './api/routes/appointments.js';
import { whatsappRoutes } from './api/routes/whatsapp.js';
import { webhookRoutes } from './api/routes/webhook.js';
import { dashboardRoutes } from './api/routes/dashboard.js';
import { googleRoutes } from './api/routes/google.js';
import { conversationRoutes } from './api/routes/conversations.js';

import { startIncomingWorker } from './whatsapp/handler.js';
import { startReminderJob } from './jobs/reminder.job.js';
import { startCleanupJob } from './jobs/cleanup.job.js';

declare module 'fastify' {
  interface FastifyInstance {
    auth: typeof authMiddleware;
  }
}

async function buildApp() {
  const app = Fastify({ logger });

  await app.register(cors, {
    origin: [env.FRONTEND_URL, 'http://localhost:5173'],
    credentials: true,
  });

  await app.register(sensible);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    redis,
  });

  app.decorate('auth', authMiddleware);

  app.setErrorHandler((err, _req, reply) => {
    app.log.error({ err }, 'request error');
    const status = (err as any).statusCode ?? 500;
    reply.status(status).send({ error: err.message ?? 'Internal error' });
  });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await app.register(authRoutes);
  await app.register(clinicRoutes);
  await app.register(appointmentRoutes);
  await app.register(whatsappRoutes);
  await app.register(webhookRoutes);
  await app.register(dashboardRoutes);
  await app.register(googleRoutes);
  await app.register(conversationRoutes);

  return app;
}

async function main() {
  const app = await buildApp();

  await app.listen({ host: '0.0.0.0', port: env.PORT });
  logger.info({ port: env.PORT }, 'API listening');

  // Start workers (incoming messages enter via /webhook/whatsapp)
  const waWorker = startIncomingWorker();
  const reminderWorker = startReminderJob();
  const cleanupWorker = startCleanupJob();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    try {
      await app.close();
      await waWorker.close();
      await reminderWorker.close();
      await cleanupWorker.close();
      await prisma.$disconnect();
      await redis.quit();
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
