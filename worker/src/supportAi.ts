import Anthropic from '@anthropic-ai/sdk';
import { SUPPORT_HANDOFF, SUPPORT_SYSTEM_PROMPT } from '../../shared/supportKnowledge';

/** Binding do Workers AI (só o que usamos). */
export type WorkersAi = { run(model: string, input: { messages: { role: string; content: string }[]; max_tokens?: number }): Promise<unknown> };
export type SupportAiEnv = {
  AI?: WorkersAi;
  /** `workers-ai` (padrão, cota gratuita da Cloudflare) ou `anthropic` (Claude, pago; exige ANTHROPIC_API_KEY). */
  SUPPORT_AI_PROVIDER?: string;
  SUPPORT_AI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
};
export type Turn = { author: 'user' | 'ai' | 'team'; body: string };
export type AiAnswer = { kind: 'answer'; text: string } | { kind: 'handoff' } | { kind: 'unavailable' };

const DEFAULT_WORKERS_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';
const MAX_OUTPUT_TOKENS = 500;

/** Histórico da conversa no formato de chat: mensagens do cliente = user; IA e equipe = assistant (consecutivas são juntadas). */
function chat(turns: Turn[]): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const t of turns.slice(-12)) {
    const role = t.author === 'user' ? 'user' : 'assistant';
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${t.body}`; else out.push({ role, content: t.body });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** Cumprimento no começo da resposta (a saudação com o nome já vem do servidor): "Olá!", "Oi, tudo bem?", "Bom dia! Claro!"... */
const LEADING_GREETING = /^(?:(?:olá|ola|oi|bom dia|boa tarde|boa noite)(?=[\s,!.?])[^\n.!?]{0,40}[!.?,]?\s*)+(?:(?:claro|com certeza|certo|vamos lá|tudo bem)[!.,]?\s*)?/i;
export const stripGreeting = (text: string) => text.replace(LEADING_GREETING, '').replace(/^\s*vou te ajudar[^\n.!]*[.!]\s*/i, '').trim();

const clean = (text: string): AiAnswer => {
  const t = stripGreeting(text.replace(/<think>[\s\S]*?<\/think>/g, '').trim());
  if (!t || t.includes(SUPPORT_HANDOFF)) return { kind: 'handoff' };
  return { kind: 'answer', text: t.slice(0, 3500) };
};

/** Pergunta ao assistente. Qualquer falha (cota do dia, rede, configuração) vira `unavailable`: a conversa vai para a equipe. */
export async function askSupportAi(env: SupportAiEnv, turns: Turn[]): Promise<AiAnswer> {
  const messages = chat(turns);
  if (!messages.length) return { kind: 'unavailable' };
  try {
    if (env.SUPPORT_AI_PROVIDER === 'anthropic') {
      if (!env.ANTHROPIC_API_KEY) return { kind: 'unavailable' };
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 });
      const res = await client.messages.create({
        model: env.SUPPORT_AI_MODEL || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: SUPPORT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }], // o manual é igual em toda pergunta: cache
        messages,
      });
      if (res.stop_reason === 'refusal') return { kind: 'handoff' };
      return clean(res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n'));
    }
    if (!env.AI) return { kind: 'unavailable' };
    const out = await env.AI.run(env.SUPPORT_AI_MODEL || DEFAULT_WORKERS_MODEL, { messages: [{ role: 'system', content: SUPPORT_SYSTEM_PROMPT }, ...messages], max_tokens: MAX_OUTPUT_TOKENS });
    const text = typeof (out as { response?: unknown })?.response === 'string' ? (out as { response: string }).response : '';
    return clean(text);
  } catch {
    return { kind: 'unavailable' };
  }
}
