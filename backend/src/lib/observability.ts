// Observabilidade: escreve logs no banco de dados (SystemLog).

import { prisma } from './prisma.js';
import { logger } from './logger.js';

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR';

export async function writeLog(
  clinicId: string,
  level: LogLevel,
  scope: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        clinicId,
        level,
        scope,
        message,
        metadata,
      },
    });
  } catch (err) {
    // Não deixa erro de log quebrar o fluxo principal
    logger.error({ err, scope, message }, 'Failed to write system log');
  }
}

/** Limpa logs antigos para manter o banco limpo. */
export async function cleanOldLogs(clinicId: string, retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.systemLog.deleteMany({
    where: {
      clinicId,
      createdAt: { lt: cutoff },
    },
  });
  return count;
}
