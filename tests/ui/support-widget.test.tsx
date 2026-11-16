// @vitest-environment jsdom
/** Botão de suporte: abre o painel, envia dúvida (resposta do assistente), mostra resposta nova da equipe e permite pedir ajuda humana. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStorage } from './setup';

const BASE = 'https://api.exemplo.test';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const memory = new Map<string, string>();
type T = { id: string; kind: string; status: string; createdAt: string; updatedAt: string; unread: boolean; messages: { id: string; author: string; body: string; createdAt: string }[] };
let tickets: T[]; let calls: { path: string; body?: unknown }[];
const at = '2026-11-16T15:00:00.000Z';

async function boot(signedIn = true) {
  memory.clear(); calls = [];
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() });
  await resetStorage();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(BASE, ''); const body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ path, body });
    if (path === '/api/auth/session') return signedIn ? json(200, { user: { id: 'usr_1', email: 'lana@exemplo.com' }, csrfToken: 'csrf', sessionId: 'ses_aaaaaaaaaaaaaaaa', license: { status: 'active', quotaActive: 100, quotaDaily: 30, expiresAt: null, holderName: 'Lana' } }) : json(401, {});
    if (path === '/api/sessions') return json(200, { maxSessions: 2, sessions: [] });
    if (path.startsWith('/api/sync/v2')) return json(503, {});
    if (path === '/api/support' && init?.method === 'POST') {
      const t: T = { id: 'stk_aaaaaaaaaaaa', kind: body.kind, status: 'answered', createdAt: at, updatedAt: at, unread: false, messages: [{ id: 'm1', author: 'user', body: body.message, createdAt: at }, { id: 'm2', author: 'ai', body: 'Clique em "Novo ingrediente".', createdAt: at }] };
      tickets = [t, ...tickets]; return json(201, { ticket: t });
    }
    if (path === '/api/support') return json(200, { tickets });
    const esc = path.match(/^\/api\/support\/(stk_\w+)\/(escalate|read)$/);
    if (esc) { const t = tickets.find(x => x.id === esc[1])!; if (esc[2] === 'escalate') t.status = 'open'; else t.unread = false; return json(200, esc[2] === 'read' ? { ok: true } : { ticket: t }); }
    return json(404, {});
  }));
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', BASE); vi.stubEnv('VITE_QUOTES_API_URL', ''); vi.stubEnv('VITE_REQUIRE_LOGIN', signedIn ? 'on' : 'off');
  const { default: App } = await import('../../src/App');
  render(<App />);
}

describe('botão de suporte', () => {
  beforeEach(() => { document.body.innerHTML = ''; tickets = []; });

  it('envia uma dúvida e mostra a resposta do assistente; "Ainda preciso de ajuda" encaminha à equipe', async () => {
    const u = userEvent.setup(); await boot();
    await u.click(await screen.findByRole('button', { name: 'Suporte' }));
    const panel = screen.getByRole('dialog', { name: 'Suporte' });
    await u.click(within(panel).getByRole('button', { name: /Nova mensagem/ }));
    await u.type(within(panel).getByLabelText('Mensagem'), 'Como cadastro um ingrediente?');
    await u.click(within(panel).getByRole('button', { name: /Enviar/ }));
    expect(await within(panel).findByText('Clique em "Novo ingrediente".')).toBeTruthy();
    expect(calls.find(c => c.path === '/api/support' && c.body)?.body).toEqual({ kind: 'question', message: 'Como cadastro um ingrediente?' });
    await u.click(within(panel).getByRole('button', { name: 'Ainda preciso de ajuda' }));
    expect(await within(panel).findByText(/Recebemos sua mensagem/)).toBeTruthy();
    await u.keyboard('{Escape}'); expect(screen.queryByRole('dialog', { name: 'Suporte' })).toBeNull();
  });

  it('resposta nova da equipe aparece no botão e é marcada como lida ao abrir', async () => {
    tickets = [{ id: 'stk_bbbbbbbbbbbb', kind: 'complaint', status: 'answered', createdAt: at, updatedAt: at, unread: true, messages: [{ id: 'm1', author: 'user', body: 'Está lento', createdAt: at }, { id: 'm2', author: 'team', body: 'Já corrigimos!', createdAt: at }] }];
    const u = userEvent.setup(); await boot();
    await u.click(await screen.findByRole('button', { name: 'Suporte (1 resposta nova)' }));
    await u.click(screen.getByRole('button', { name: /Reclamação/ }));
    expect(screen.getByText('Já corrigimos!')).toBeTruthy();
    await waitFor(() => expect(calls.some(c => c.path === '/api/support/stk_bbbbbbbbbbbb/read')).toBe(true));
  });

  it('sugestão vai direto para a equipe (o aviso diz isso)', async () => {
    const u = userEvent.setup(); await boot();
    await u.click(await screen.findByRole('button', { name: 'Suporte' }));
    await u.click(screen.getByRole('button', { name: /Nova mensagem/ }));
    await u.click(screen.getByText('Sugestão'));
    expect(screen.getByText(/Vai direto para a equipe/)).toBeTruthy();
  });
});
