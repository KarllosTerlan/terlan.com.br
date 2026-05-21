import dayjs from 'dayjs';
import { Queue, Worker } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';
import { notifyClient } from '../scheduler/notification.service.js';

export const reminderQueue = new Queue('reminders', { connection: redis });

export function startReminderJob() {
  reminderQueue
    .add(
      'scan',
      {},
      {
        repeat: { every: 5 * 60 * 1000 }, // every 5 min
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    )
    .catch((err) => logger.error({ err }, 'Failed to register reminder repeat'));

  const worker = new Worker(
    'reminders',
    async () => {
      const lead = env.REMINDER_LEAD_MINUTES;
      const now = dayjs();
      const windowStart = now.add(lead - 5, 'minute').toDate();
      const windowEnd = now.add(lead + 5, 'minute').toDate();

      const appts = await prisma.appointment.findMany({
        where: {
          status: { in: ['PENDING', 'CONFIRMED'] },
          reminderSent: false,
          dateTime: { gte: windowStart, lte: windowEnd },
        },
      });
      for (const a of appts) {
        try {
          await notifyClient(a.clinicId, a.clientId, a.id, 'REMINDER');
          await prisma.appointment.update({
            where: { id: a.id },
            data: { reminderSent: true },
          });
        } catch (err) {
          logger.error({ err, apptId: a.id }, 'Failed to send reminder');
        }
      }
    },
    { connection: redis },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Reminder worker failed');
  });
  return worker;
}
