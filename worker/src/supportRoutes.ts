import { apiError, json, readJsonBody } from './http';
import { checkCsrf, resolveSession, type SessionEnv } from './session';
import { consumeRateLimit, windowCount, type D1Like } from './store';
import { randomToken } from './accounts';
import { askSupportAi, type SupportAiEnv, type Turn } from './supportAi';

export type SupportEnv = SessionEnv & SupportAiEnv & { SUPPORT_AI_DAILY_LIMIT?: string };
type Deps = { now: () => Date };
export type Kind = 'question' | 'suggestion' | 'complaint';
const KINDS: Kind[] = ['question', 'suggestion', 'complaint'];
export const SUPPORT_LIMITS = { bodyMax: 2000, perUserPerDay: 20, aiPerDayDefault: 80, ticketsListed: 20 } as const;
const AI_SCOPE = 'support-ai-day';
const DAY = 86_400;

const ticketId = () => `stk_${randomToken(9)}`;
const messageId = () => `smg_${randomToken(9)}`;
const aiDailyLimit = (env: SupportEnv) => { const n = Number(env.SUPPORT_AI_DAILY_LIMIT); return Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : SUPPORT_LIMITS.aiPerDayDefault; };
const cleanBody = (v: unknown): string | null => { if (typeof v !== 'string') return null; const t = v.replace(/\r\n/g, '\n').trim(); return t && t.length <= SUPPORT_LIMITS.bodyMax ? t : null; };

type TicketRow = { id: string; kind: Kind; status: 'open' | 'answered' | 'closed'; created_at: string; updated_at: string; unread_for_user: number };
type MessageRow = { id: string; ticket_id: string; author: Turn['author']; body: string; created_at: string };

async function messagesOf(db: D1Like, ids: string[]): Promise<Map<string, MessageRow[]>> {
  const map = new Map<string, MessageRow[]>();
  if (!ids.length) return map;
  const rows = (await db.prepare(`SELECT id, ticket_id, author, body, created_at FROM support_messages WHERE ticket_id IN (${ids.map((_, i) => `?${i + 1}`).join(',')}) ORDER BY rowid`).bind(...ids).all<MessageRow>()).results;
  for (const r of rows) map.set(r.ticket_id, [...(map.get(r.ticket_id) ?? []), r]);
  return map;
}
export const publicTicket = (t: TicketRow, msgs: MessageRow[]) => ({ id: t.id, kind: t.kind, status: t.status, createdAt: t.created_at, updatedAt: t.updated_at, unread: t.unread_for_user > 0,
  messages: msgs.map(m => ({ id: m.id, author: m.author, body: m.body, createdAt: m.created_at })) });

async function auth(request: Request, env: SupportEnv, now: Date, write: boolean) {
  const r = await resolveSession(request, env, now);
  if (!r.ok) return { ok: false as const, res: apiError(r.status, r.error, r.message) };
  if (write) { const c = checkCsrf(request, env, r.ctx.session); if (c) return { ok: false as const, res: apiError(c.status, c.error, c.message) }; }
  if (!r.ctx.license) return { ok: false as const, res: apiError(403, 'NO_ACTIVE_LICENSE', 'Esta conta não tem licença.') };
  return { ok: true as const, userId: r.ctx.user.id, licenseId: r.ctx.license.id };
}

/** Responde com a IA (só dúvidas) e grava a resposta; sem IA disponível ou fora do alcance dela, a conversa fica aberta para a equipe. */
async function answerWithAi(env: SupportEnv, ticketIdValue: string, turns: Turn[], now: Date): Promise<void> {
  const iso = now.toISOString();
  const budget = await consumeRateLimit(env.DB, 'global', AI_SCOPE, aiDailyLimit(env), DAY, now.getTime());
  const out = budget.allowed ? await askSupportAi(env, turns) : { kind: 'unavailable' as const };
  if (out.kind === 'answer') {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO support_messages (id, ticket_id, author, body, created_at) VALUES (?1, ?2, \'ai\', ?3, ?4)').bind(messageId(), ticketIdValue, out.text, iso),
      env.DB.prepare("UPDATE support_tickets SET status = 'answered', updated_at = ?1 WHERE id = ?2").bind(iso, ticketIdValue),
    ]);
  }
}

async function loadTicket(db: D1Like, id: string, userId: string) {
  return db.prepare('SELECT id, kind, status, created_at, updated_at, unread_for_user FROM support_tickets WHERE id = ?1 AND user_id = ?2').bind(id, userId).first<TicketRow>();
}

/** Rotas do cliente: GET /api/support, POST /api/support, POST /api/support/:id/messages, POST /api/support/:id/escalate, POST /api/support/:id/read. */
export async function supportRoute(request: Request, env: SupportEnv, deps: Deps, pathname: string): Promise<Response | undefined> {
  const path = pathname.replace(/\/+$/, '');
  if (path !== '/api/support' && !path.startsWith('/api/support/')) return undefined;
  const method = request.method.toUpperCase();
  const now = deps.now(); const iso = now.toISOString();
  const m = path.match(/^\/api\/support\/(stk_[A-Za-z0-9_-]{12})\/(messages|escalate|read)$/);
  if (path !== '/api/support' && !m) return apiError(404, 'NOT_FOUND', 'Rota não encontrada.');
  if (path === '/api/support' ? method !== 'GET' && method !== 'POST' : method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
  const a = await auth(request, env, now, method !== 'GET');
  if (!a.ok) return a.res;

  if (path === '/api/support' && method === 'GET') {
    const tickets = (await env.DB.prepare('SELECT id, kind, status, created_at, updated_at, unread_for_user FROM support_tickets WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT ?2').bind(a.userId, SUPPORT_LIMITS.ticketsListed).all<TicketRow>()).results;
    const msgs = await messagesOf(env.DB, tickets.map(t => t.id));
    return json({ tickets: tickets.map(t => publicTicket(t, msgs.get(t.id) ?? [])) });
  }

  // Escritas: limite por pessoa (protege a cota e evita abuso).
  const rate = await consumeRateLimit(env.DB, a.licenseId, 'support', SUPPORT_LIMITS.perUserPerDay, DAY, now.getTime());
  if (!rate.allowed) return json({ error: 'RATE_LIMITED', message: 'Você já enviou muitas mensagens hoje. Tente de novo amanhã ou escreva para contato@dabitech.com.br.', retryAfterSeconds: rate.retryAfterSeconds }, 429);

  if (path === '/api/support') {
    const body = await readJsonBody(request, 8192);
    if (!body.ok) return apiError(body.status, body.error, 'Corpo da requisição inválido.');
    const b = (body.data ?? {}) as { kind?: unknown; message?: unknown };
    const kind = KINDS.includes(b.kind as Kind) ? (b.kind as Kind) : null;
    const text = cleanBody(b.message);
    if (!kind || !text) return apiError(400, 'INVALID_REQUEST', `Escreva a mensagem (até ${SUPPORT_LIMITS.bodyMax} caracteres).`);
    const id = ticketId();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO support_tickets (id, user_id, kind, status, created_at, updated_at, unread_for_user) VALUES (?1, ?2, ?3, 'open', ?4, ?4, 0)").bind(id, a.userId, kind, iso),
      env.DB.prepare("INSERT INTO support_messages (id, ticket_id, author, body, created_at) VALUES (?1, ?2, 'user', ?3, ?4)").bind(messageId(), id, text, iso),
    ]);
    if (kind === 'question') await answerWithAi(env, id, [{ author: 'user', body: text }], now);
    const t = await loadTicket(env.DB, id, a.userId);
    return json({ ticket: publicTicket(t!, (await messagesOf(env.DB, [id])).get(id) ?? []) }, 201);
  }

  const id = m![1]; const action = m![2];
  const t = await loadTicket(env.DB, id, a.userId);
  if (!t) return apiError(404, 'NOT_FOUND', 'Conversa não encontrada.');
  if (action === 'read') {
    await env.DB.prepare('UPDATE support_tickets SET unread_for_user = 0 WHERE id = ?1 AND user_id = ?2').bind(id, a.userId).run();
    return json({ ok: true });
  }
  if (action === 'escalate') { // "Ainda preciso de ajuda": a conversa vai para a equipe
    await env.DB.prepare("UPDATE support_tickets SET status = 'open', updated_at = ?1 WHERE id = ?2 AND user_id = ?3").bind(iso, id, a.userId).run();
  } else {
    if (t.status === 'closed') return apiError(409, 'CLOSED', 'Esta conversa foi encerrada. Abra uma nova mensagem.');
    const body = await readJsonBody(request, 8192);
    if (!body.ok) return apiError(body.status, body.error, 'Corpo da requisição inválido.');
    const text = cleanBody((body.data as { message?: unknown } | null)?.message);
    if (!text) return apiError(400, 'INVALID_REQUEST', `Escreva a mensagem (até ${SUPPORT_LIMITS.bodyMax} caracteres).`);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO support_messages (id, ticket_id, author, body, created_at) VALUES (?1, ?2, 'user', ?3, ?4)").bind(messageId(), id, text, iso),
      env.DB.prepare("UPDATE support_tickets SET status = 'open', updated_at = ?1 WHERE id = ?2").bind(iso, id),
    ]);
    // Dúvida que a IA ainda acompanha (nenhuma resposta da equipe): a IA responde de novo com o histórico.
    const msgs = (await messagesOf(env.DB, [id])).get(id) ?? [];
    if (t.kind === 'question' && !msgs.some(x => x.author === 'team')) await answerWithAi(env, id, msgs.map(x => ({ author: x.author, body: x.body })), now);
  }
  const fresh = await loadTicket(env.DB, id, a.userId);
  return json({ ticket: publicTicket(fresh!, (await messagesOf(env.DB, [id])).get(id) ?? []) });
}

/** Quantas respostas da IA já foram usadas hoje (para o painel). */
export const aiUsedToday = (env: SupportEnv, nowMs: number) => windowCount(env.DB, 'global', AI_SCOPE, DAY, nowMs);
export { aiDailyLimit };
