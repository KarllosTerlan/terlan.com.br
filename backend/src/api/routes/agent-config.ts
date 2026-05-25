import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { runAgent } from '../../ai/agent.js';

const agentConfigSchema = z.object({
  agentSystemPrompt: z.string().min(10).optional(),
  agentRequiredFields: z.array(z.string()).optional(),
  agentCustomFields: z.array(z.object({ key: z.string(), label: z.string(), type: z.string() })).optional(),
  agentFaqEntries: z.array(z.object({ question: z.string(), answer: z.string(), whenToUse: z.string().optional() })).optional(),
  agentInstructionNotes: z.string().optional(),
  antiHallucinationMode: z.boolean().optional(),
  agentModel: z.string().optional(),
  agentTemperature: z.number().min(0).max(1).optional(),
  agentMaxTokens: z.number().int().min(200).max(4000).optional(),
  notifyWhatsappAlerts: z.string().optional().nullable(),
  notifyWhatsappSchedule: z.string().optional().nullable(),
});

export async function agentConfigRoutes(app: FastifyInstance) {
  app.get('/agent/config', { preHandler: app.auth }, async (req) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.auth!.clinicId },
      select: {
        agentSystemPrompt: true,
        agentRequiredFields: true,
        agentCustomFields: true,
        agentFaqEntries: true,
        agentInstructionNotes: true,
        antiHallucinationMode: true,
        agentModel: true,
        agentTemperature: true,
        agentMaxTokens: true,
        notifyWhatsappAlerts: true,
        notifyWhatsappSchedule: true,
      },
    });
    return { config: clinic };
  });

  app.put('/agent/config', { preHandler: app.auth }, async (req) => {
    const data = agentConfigSchema.parse(req.body);
    const clinic = await prisma.clinic.update({
      where: { id: req.auth!.clinicId },
      data: {
        ...(data.agentSystemPrompt !== undefined && { agentSystemPrompt: data.agentSystemPrompt }),
        ...(data.agentRequiredFields !== undefined && { agentRequiredFields: data.agentRequiredFields }),
        ...(data.agentCustomFields !== undefined && { agentCustomFields: data.agentCustomFields }),
        ...(data.agentFaqEntries !== undefined && { agentFaqEntries: data.agentFaqEntries }),
        ...(data.agentInstructionNotes !== undefined && { agentInstructionNotes: data.agentInstructionNotes }),
        ...(data.antiHallucinationMode !== undefined && { antiHallucinationMode: data.antiHallucinationMode }),
        ...(data.agentModel !== undefined && { agentModel: data.agentModel }),
        ...(data.agentTemperature !== undefined && { agentTemperature: data.agentTemperature }),
        ...(data.agentMaxTokens !== undefined && { agentMaxTokens: data.agentMaxTokens }),
        ...(data.notifyWhatsappAlerts !== undefined && { notifyWhatsappAlerts: data.notifyWhatsappAlerts }),
        ...(data.notifyWhatsappSchedule !== undefined && { notifyWhatsappSchedule: data.notifyWhatsappSchedule }),
      },
      select: {
        agentSystemPrompt: true,
        agentModel: true,
        agentTemperature: true,
        agentMaxTokens: true,
      },
    });
    return { config: clinic };
  });

  // Simulador — testa o agente sem enviar WhatsApp
  app.post('/agent/simulate', { preHandler: app.auth }, async (req, reply) => {
    const body = z.object({
      phone: z.string().default('+5500000000000'),
      message: z.string().min(1),
    }).parse(req.body);

    const clinicId = req.auth!.clinicId;
    const simulatorPhone = `sim_${clinicId}_${body.phone}`;

    // Captura a resposta do agente interceptando o sendText
    let capturedReply = '';
    const originalSendText = (await import('../../whatsapp/sender.js')).sendText;

    // Hack: substituímos temporariamente o sendText para capturar a resposta
    // Em vez disso, usamos o agente diretamente sem envio
    try {
      await runAgent({
        clinicId,
        phone: simulatorPhone,
        text: body.message,
        pushName: 'Simulador',
      });

      // Busca a última mensagem do assistente na conversa simulada
      const conv = await prisma.conversation.findUnique({
        where: { clinicId_clientPhone: { clinicId, clientPhone: simulatorPhone } },
        select: { messages: true },
      });

      const messages = Array.isArray(conv?.messages) ? conv.messages as Array<{role:string; content: string}> : [];
      const lastAssistant = messages.filter((m) => m.role === 'assistant').slice(-1)[0];
      capturedReply = lastAssistant?.content ?? 'Sem resposta.';
    } catch (err) {
      return reply.status(500).send({ error: String(err) });
    }

    return { reply: capturedReply };
  });

  // Reseta a conversa do simulador
  app.delete('/agent/simulate', { preHandler: app.auth }, async (req) => {
    const { phone } = z.object({ phone: z.string().optional() }).parse(req.query);
    const clinicId = req.auth!.clinicId;
    const simulatorPhone = `sim_${clinicId}_${phone ?? '+5500000000000'}`;
    await prisma.conversation.deleteMany({
      where: { clinicId, clientPhone: simulatorPhone },
    });
    return { ok: true };
  });
}
