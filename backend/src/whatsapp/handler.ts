import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { processIncomingMessage } from '../ai/orchestrator.js';
import { logIncoming } from './providers/service.js';
import type { ProviderName } from './providers/types.js';

export type IncomingMessage = {
  clinicId: string;
  provider: ProviderName;
  fromPhone: string;
  text: string;
  pushName?: string;
  /** wamId (meta) or evolution key.id */
  externalId: string;
};

export const incomingQueue = new Queue('wa-incoming', { connection: redis });

/** Enqueues an incoming message received via either provider webhook. */
export async function enqueueIncomingMessage(msg: IncomingMessage): Promise<void> {
  await incomingQueue.add(
    `${msg.clinicId}:${msg.fromPhone}`,
    msg,
    {
      jobId: `${msg.provider}:${msg.externalId}`, // dedupe retries from either provider
      removeOnComplete: 1000,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  );
}

/** Starts the worker that processes incoming messages serially per (clinic, phone). */
export function startIncomingWorker() {
  const worker = new Worker<IncomingMessage>(
    'wa-incoming',
    async (job) => {
      const { clinicId, fromPhone, text, pushName, provider, externalId } = job.data;
      logger.info({ clinicId, fromPhone, text, provider }, 'Incoming WhatsApp message');
      await logIncoming({ clinicId, provider, fromPhone, text, externalId });
      await processIncomingMessage({ clinicId, phone: fromPhone, text, pushName });
    },
    {
      connection: redis,
      concurrency: 8,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'WhatsApp worker job failed');
  });

  return worker;
}
