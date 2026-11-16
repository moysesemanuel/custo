import { apiCall, field } from '../../account/http';

export type SupportKind = 'question' | 'suggestion' | 'complaint';
export type SupportMessage = { id: string; author: 'user' | 'ai' | 'team'; body: string; createdAt: string };
export type SupportTicket = { id: string; kind: SupportKind; status: 'open' | 'answered' | 'closed'; createdAt: string; updatedAt: string; unread: boolean; messages: SupportMessage[] };
export type SupportResult<T> = { ok: true; value: T } | { ok: false; message: string };

const GENERIC = 'Não foi possível falar com o suporte agora. Verifique a internet e tente de novo, ou escreva para contato@dabitech.com.br.';

/** Cliente das rotas /api/support (sessão + CSRF, como o resto da conta). */
export function createSupportClient(base: string, getCsrf: () => string | undefined, fetchImpl: typeof fetch = fetch) {
  const call = async <T,>(path: string, init: { method?: string; body?: unknown }, pick: (b: unknown) => T | undefined): Promise<SupportResult<T>> => {
    const res = await apiCall(base, path, { ...init, ...(init.method && init.method !== 'GET' ? { csrf: getCsrf() } : {}) }, fetchImpl);
    if (!res) return { ok: false, message: GENERIC };
    const v = res.status >= 200 && res.status < 300 ? pick(res.body) : undefined;
    return v !== undefined ? { ok: true, value: v } : { ok: false, message: field<string>(res.body, 'message') ?? GENERIC };
  };
  const ticket = (b: unknown) => field<SupportTicket>(b, 'ticket');
  return {
    list: () => call('/api/support', {}, b => field<SupportTicket[]>(b, 'tickets')),
    create: (kind: SupportKind, message: string) => call('/api/support', { method: 'POST', body: { kind, message } }, ticket),
    reply: (id: string, message: string) => call(`/api/support/${id}/messages`, { method: 'POST', body: { message } }, ticket),
    escalate: (id: string) => call(`/api/support/${id}/escalate`, { method: 'POST', body: {} }, ticket),
    markRead: (id: string) => call(`/api/support/${id}/read`, { method: 'POST', body: {} }, b => (b ? true : undefined)),
  };
}
export type SupportClient = ReturnType<typeof createSupportClient>;
