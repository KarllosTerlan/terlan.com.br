import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { stringify } from 'csv-stringify/sync';

export async function exportRoutes(app: FastifyInstance) {
  app.get('/export/appointments.csv', { preHandler: app.auth }, async (req, reply) => {
    const appts = await prisma.appointment.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { dateTime: 'desc' },
      take: 10000,
      include: { client: true, service: true, professional: true },
    });

    const rows = appts.map((a) => ({
      id: a.id,
      data: a.dateTime.toISOString(),
      status: a.status,
      fonte: a.source,
      servico: a.service?.name ?? '',
      profissional: a.professional.name,
      paciente: a.client.name ?? a.client.phone,
      telefone: a.client.phone,
      email: a.client.email ?? '',
      notas: a.notes ?? '',
      criado_em: a.createdAt.toISOString(),
    }));

    const csv = stringify(rows, { header: true });
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="agendamentos.csv"');
    return reply.send(csv);
  });

  app.get('/export/patients.csv', { preHandler: app.auth }, async (req, reply) => {
    const clients = await prisma.client.findMany({
      where: {
        appointments: { some: { clinicId: req.auth!.clinicId } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const rows = clients.map((c) => ({
      id: c.id,
      nome: c.name ?? '',
      telefone: c.phone,
      email: c.email ?? '',
      cpf: c.cpf ?? '',
      convenio: c.insurance ?? '',
      vip: c.isVip ? 'Sim' : 'Não',
      criado_em: c.createdAt.toISOString(),
    }));

    const csv = stringify(rows, { header: true });
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="pacientes.csv"');
    return reply.send(csv);
  });

  app.get('/export/conversations.csv', { preHandler: app.auth }, async (req, reply) => {
    const convs = await prisma.conversation.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { lastMessageAt: 'desc' },
      take: 5000,
    });

    const rows = convs.map((c) => ({
      id: c.id,
      telefone: c.clientPhone,
      outcome: c.outcome,
      mensagens: c.messageCount,
      ativa: c.active ? 'Sim' : 'Não',
      ultima_msg: c.lastMessageAt.toISOString(),
      criado_em: c.createdAt.toISOString(),
    }));

    const csv = stringify(rows, { header: true });
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="conversas.csv"');
    return reply.send(csv);
  });
}
