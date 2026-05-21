import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; clinicId: string; role: string };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; clinicId: string; role: string };
    user: { userId: string; clinicId: string; role: string };
  }
}

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    const payload = req.user as { userId: string; clinicId: string; role: string };
    req.auth = payload;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

export function requireRole(role: 'ADMIN' | 'STAFF') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.status(401).send({ error: 'Unauthorized' });
    if (role === 'ADMIN' && req.auth.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}
