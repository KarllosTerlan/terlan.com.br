import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { retry } from '../lib/retry.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type ClaudeMessage = { role: 'user' | 'assistant'; content: string };

export async function askClaude(system: string, messages: ClaudeMessage[]): Promise<string> {
  return retry(
    async () => {
      const res = await anthropic.messages.create({
        model: env.CLAUDE_MODEL,
        max_tokens: env.CLAUDE_MAX_TOKENS,
        system,
        messages,
      });
      const block = res.content.find((c) => c.type === 'text');
      return block && block.type === 'text' ? block.text : '';
    },
    { retries: 2, baseMs: 800, label: 'claude' },
  );
}
