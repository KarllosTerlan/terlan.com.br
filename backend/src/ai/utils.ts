// Utilitários do agente: find-or-create client, upsert conversation.

import { prisma } from '../lib/prisma.js';

/** Encontra ou cria um cliente pelo telefone. */
export async function findOrCreateClient(
  phone: string,
  pushName?: string | null,
): Promise<{ id: string; name: string | null; isVip: boolean; isNew: boolean }> {
  let client = await prisma.client.findUnique({ where: { phone } });

  if (!client) {
    client = await prisma.client.create({
      data: { phone, name: pushName ?? null, lastContact: new Date() },
    });
    return { id: client.id, name: client.name, isVip: false, isNew: true };
  }

  // Atualiza nome se ainda não tem
  if (!client.name && pushName) {
    client = await prisma.client.update({
      where: { id: client.id },
      data: { name: pushName, lastContact: new Date() },
    });
  } else {
    // Só atualiza lastContact
    await prisma.client.update({
      where: { id: client.id },
      data: { lastContact: new Date() },
    }).catch(() => {});
  }

  return { id: client.id, name: client.name, isVip: client.isVip, isNew: false };
}

/** Upsert de conversa com estado e histórico. */
export async function upsertConversation(
  clinicId: string,
  clientPhone: string,
  clientId: string,
  updates: { messages?: unknown; context?: unknown; active?: boolean; outcome?: string; messageCount?: number },
) {
  return prisma.conversation.upsert({
    where: { clinicId_clientPhone: { clinicId, clientPhone } },
    create: {
      clinicId,
      clientPhone,
      clientId,
      messages: (updates.messages ?? []) as never,
      context: (updates.context ?? {}) as never,
      active: updates.active ?? true,
      messageCount: updates.messageCount ?? 0,
      lastMessageAt: new Date(),
    },
    update: {
      clientId,
      messages: updates.messages as never | undefined,
      context: updates.context as never | undefined,
      active: updates.active,
      outcome: updates.outcome as never | undefined,
      messageCount: updates.messageCount,
      lastMessageAt: new Date(),
    },
  });
}

/** Parse seguro dos argumentos de uma tool call. */
export function safeParseToolArgs<T = Record<string, unknown>>(
  input: unknown,
): T {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input) as T;
    } catch {
      return {} as T;
    }
  }
  return (input ?? {}) as T;
}
