// @vitest-environment jsdom
/** Teste encerrado: o app fecha a interface e deixa só sair e baixar o backup do aparelho (decisão do proprietário). */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStorage } from './setup';

const BASE = 'https://api.exemplo.test';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const memory = new Map<string, string>();
const sessionWith = (license: unknown) => ({ user: { id: 'usr_1', email: 'bia@exemplo.com' }, csrfToken: 'csrf', sessionId: 'ses_aaaaaaaaaaaaaaaa', license });

async function boot(license: unknown) {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() });
  await resetStorage();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace(BASE, '');
    if (path === '/api/auth/session') return json(200, sessionWith(license));
    if (path === '/api/sessions') return json(200, { maxSessions: 2, sessions: [] });
    if (path.startsWith('/api/sync/v2')) return json(403, { error: 'TRIAL_EXPIRED' });
    return json(404, {});
  }));
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', BASE); vi.stubEnv('VITE_QUOTES_API_URL', ''); vi.stubEnv('VITE_REQUIRE_LOGIN', 'on');
  const { default: App } = await import('../../src/App');
  render(<App />);
}

describe('teste encerrado', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('mostra o aviso de fim do teste, o backup e o botão de sair; nenhuma tela do app', async () => {
    await boot({ status: 'expired', quotaActive: 100, quotaDaily: 30, expiresAt: '2026-11-01T12:00:00.000Z' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Seu período de teste terminou/));
    expect(screen.getByRole('alert').textContent).toMatch(/não foram apagados/);
    expect(screen.getByRole('button', { name: /Baixar backup dos dados deste dispositivo/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sair desta conta/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ingredientes' })).toBeNull();
  });
  it('durante o teste o app abre normalmente', async () => {
    await boot({ status: 'active', quotaActive: 100, quotaDaily: 30, expiresAt: '2099-01-01T12:00:00.000Z' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ingredientes' })).toBeTruthy());
    expect(screen.queryByText(/Seu período de teste terminou/)).toBeNull();
  });
});
