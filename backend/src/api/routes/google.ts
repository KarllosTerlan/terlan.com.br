import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { exchangeCode, getAuthUrl } from '../../calendar/client.js';

export async function googleRoutes(app: FastifyInstance) {
  app.get('/google/auth-url', { preHandler: app.auth }, async (req) => {
    const url = getAuthUrl(req.auth!.clinicId);
    return { url };
  });

  // Public callback (Google redirects here); identifies clinic via `state`
  app.get('/google/callback', async (req, reply) => {
    const q = z.object({ code: z.string(), state: z.string().uuid() }).parse(req.query);
    try {
      const tokens = await exchangeCode(q.code);
      if (!tokens.refresh_token) {
        return reply
          .status(400)
          .send({ error: 'No refresh_token received. Revoke app access in Google and try again.' });
      }
      await prisma.clinic.update({
        where: { id: q.state },
        data: { googleRefreshToken: tokens.refresh_token },
      });
      return reply.redirect(`${env.FRONTEND_URL}/settings?google=connected`);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message ?? 'Google OAuth failed' });
    }
  });

  app.post('/google/disconnect', { preHandler: app.auth }, async (req) => {
    await prisma.clinic.update({
      where: { id: req.auth!.clinicId },
      data: { googleRefreshToken: null, googleCalendarId: null },
    });
    return { ok: true };
  });
}
