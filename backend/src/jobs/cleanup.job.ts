import dayjs from 'dayjs';
import { Queue, Worker } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';

export const cleanupQueue = new Queue('cleanup', { connection: redis });

export function startCleanupJob() {
  cleanupQueue
    .add(
      'daily',
      {},
      {
        repeat: { pattern: '0 4 * * *' }, // every day at 04:00
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    )
    .catch((err) => logger.error({ err }, 'Failed to register cleanup repeat'));

  const worker = new Worker(
    'cleanup',
    async () => {
      const cutoff = dayjs().subtract(env.CONVERSATION_RETENTION_DAYS, 'day').toDate();
      const old = await prisma.conversation.findMany({
        where: { lastMessageAt: { lt: cutoff } },
        select: { id: true, messages: true },
      });
      let truncated = 0;
      for (const c of old) {
        const msgs = (c.messages as any[]) || [];
        if (msgs.length > 0) {
          await prisma.conversation.update({
            where: { id: c.id },
            data: { messages: [], context: {} },
          });
          truncated++;
        }
      }
      logger.info({ truncated }, 'Cleanup job complete');
    },
    { connection: redis },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Cleanup worker failed');
  });
  return worker;
}
