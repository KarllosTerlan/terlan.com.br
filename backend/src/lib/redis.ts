import IORedis from 'ioredis';
import { env } from '../config/env.js';

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err) => {
  // logged centrally; avoid crashing on transient errors
  console.error('[redis]', err.message);
});
