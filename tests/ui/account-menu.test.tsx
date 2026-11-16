// @vitest-environment jsdom
/** Saudação com o nome da pessoa (vem do cadastro no /admin) e o botão Sair no menu do ícone de perfil. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStorage } from './setup';

const BASE = 'https://api.exemplo.test';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const memory = new Map<string, string>();
let loggedOut = false;

async function boot(holderName: string | null, expiresAt: string | null = null) {
  memory.clear(); loggedOut = false;
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() });
  await resetStorage();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace(BASE, '');
    if (path === '/api/auth/session') return loggedOut ? json(401, { error: 'UNAUTHORIZED' }) : json(200, { user: { id: 'usr_1', email: 'lana@exemplo.com' }, csrfToken: 'csrf', sessionId: 'ses_aaaaaaaaaaaaaaaa', license: { status: 'active', quotaActive: 100, quotaDaily: 30, expiresAt, holderName } });
    if (path === '/api/auth/logout') { loggedOut = true; return json(200, { ok: true }); }
    if (path === '/api/sessions') return json(200, { maxSessions: 2, sessions: [] });
    if (path.startsWith('/api/sync/v2')) return json(200, { revision: 0, changes: { ingredients: [], recipes: [], orders: [], packagings: [] }, deleted: { ingredients: [], recipes: [], orders: [], packagings: [] } });
    return json(404, {});
  }));
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', BASE); vi.stubEnv('VITE_QUOTES_API_URL', ''); vi.stubEnv('VITE_REQUIRE_LOGIN', 'on');
  const { default: App } = await import('../../src/App');
  render(<App />);
}

describe('saudação e menu da conta', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('cumprimenta pelo primeiro nome cadastrado no /admin', async () => {
    await boot('Lana Costa');
    expect(await screen.findByRole('heading', { level: 1, name: /^(Bom dia|Boa tarde|Boa noite), Lana!$/ })).toBeTruthy();
    expect(screen.getByText(/Que bom ter você aqui/)).toBeTruthy(); // ainda sem nada cadastrado
  });

  it('sem nome cadastrado, a saudação não inventa um nome', async () => {
    await boot(null);
    expect(await screen.findByRole('heading', { level: 1, name: /^(Bom dia|Boa tarde|Boa noite)!$/ })).toBeTruthy();
  });

  it('o ícone de perfil abre o menu com o nome, o e-mail e o botão Sair; Sair encerra a sessão', async () => {
    const u = userEvent.setup();
    await boot('Lana Costa');
    await screen.findByRole('heading', { level: 1 });
    const trigger = screen.getAllByRole('button', { name: 'Menu da conta' })[0];
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await u.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Conta' });
    expect(within(menu).getByText('Lana Costa')).toBeTruthy(); expect(within(menu).getByText('lana@exemplo.com')).toBeTruthy();
    await u.keyboard('{Escape}'); expect(screen.queryByRole('menu')).toBeNull(); // Esc fecha
    await u.click(trigger);
    await u.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Sair' }));
    await waitFor(() => expect(loggedOut).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ingredientes' })).toBeNull()); // volta para a tela de entrada
  });

  it('Configurações também fica no menu', async () => {
    const u = userEvent.setup();
    await boot('Lana Costa');
    await screen.findByRole('heading', { level: 1 });
    await u.click(screen.getAllByRole('button', { name: 'Menu da conta' })[0]);
    await u.click(screen.getByRole('menuitem', { name: 'Configurações' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Configurações' })).toBeTruthy();
  });

  it('em teste, a faixa do topo mostra os dias que faltam e o contato (sem dados da pessoa no link); sem prazo, não aparece', async () => {
    await boot('Lana Costa', new Date(Date.now() + 5 * 86_400_000 - 60_000).toISOString());
    const banner = await screen.findByText(/Faltam 5 dias do seu teste grátis/);
    const link = within(banner.closest('.trial-banner') as HTMLElement).getByRole('link');
    expect(link.getAttribute('href')).toMatch(/^mailto:contato@dabitech\.com\.br/);
    expect(link.getAttribute('href')).not.toMatch(/lana/i);
  });
  it('licença sem prazo: sem faixa de teste', async () => {
    await boot('Lana Costa', null);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/do seu teste grátis/)).toBeNull();
  });

  it('o X fecha a faixa até o dia seguinte (fica guardado); no último dia não há X', async () => {
    const u = userEvent.setup();
    await boot('Lana Costa', new Date(Date.now() + 5 * 86_400_000 - 60_000).toISOString());
    await screen.findByText(/Faltam 5 dias/);
    await u.click(screen.getByRole('button', { name: 'Fechar aviso do teste até amanhã' }));
    expect(screen.queryByText(/Faltam 5 dias/)).toBeNull();
    expect(memory.get('pedidocerto.trialBannerHiddenOn')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // fechada hoje: ao abrir de novo no mesmo dia, continua fechada
    const saved = memory.get('pedidocerto.trialBannerHiddenOn')!;
    await boot('Lana Costa', new Date(Date.now() + 5 * 86_400_000 - 60_000).toISOString()); memory.set('pedidocerto.trialBannerHiddenOn', saved);
    document.body.innerHTML = '';
    const { default: App } = await import('../../src/App'); render(<App />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/do seu teste grátis/)).toBeNull();
    // num dia anterior (ontem), volta a aparecer
    memory.set('pedidocerto.trialBannerHiddenOn', '2000-01-01');
    document.body.innerHTML = ''; render(<App />);
    expect(await screen.findByText(/Faltam 5 dias/)).toBeTruthy();
  });
  it('no último dia a faixa não pode ser fechada, mesmo se tiver sido fechada antes no mesmo dia', async () => {
    await boot('Lana Costa', new Date(Date.now() + 86_400_000 - 60_000).toISOString());
    expect(await screen.findByText(/Falta 1 dia do seu teste grátis/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Fechar aviso do teste/ })).toBeNull();
  });
});
