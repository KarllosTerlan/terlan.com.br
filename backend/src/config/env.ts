import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),

  APP_NAME: z.string().default('ClinicBot Pro'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  CRON_SECRET: z.string().default('change-me-cron-secret'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Anthropic Claude (default AI)
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-5'),
  CLAUDE_MAX_TOKENS: z.coerce.number().default(1024),

  // OpenAI — optional, used if clinic selects gpt-4o or for audio transcription (Whisper)
  OPENAI_API_KEY: z.string().optional(),

  // Google Calendar OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  // Encryption key for sensitive tokens (64 hex chars = 32 bytes AES-256)
  ENCRYPTION_KEY: z.string().optional(),

  // WhatsApp Evolution API (primary, self-hosted)
  EVOLUTION_API_URL: z.string().default('http://evolution:8080'),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_WEBHOOK_TOKEN: z.string().min(1),

  // WhatsApp Cloud API (Meta — fallback, optional)
  WHATSAPP_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default('clinic-bot-verify'),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v19.0'),

  FRONTEND_URL: z.string().default('http://localhost:3001'),
  PUBLIC_API_URL: z.string().default('http://localhost:3000'),

  RATE_LIMIT_MS: z.coerce.number().default(2000),
  REMINDER_LEAD_MINUTES: z.coerce.number().default(60),
  CONVERSATION_RETENTION_DAYS: z.coerce.number().default(30),

  // Backup
  BACKUP_DIR: z.string().default('/app/backups'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
