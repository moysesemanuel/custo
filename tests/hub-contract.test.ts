import { beforeEach, describe, expect, it } from 'vitest';
import { HUB_CONTRACT_VERSION } from '../worker/src/hubContract';
import { makeServer, type Server } from './helpers/server';

// Integração com o Dabi Hub: Worker real + SQLite com as migrações reais. Nada toca a rede.
const TOKEN = 'h'.repeat(43);
let srv: Server;
const hub = (path: string, o: { token?: string | null; method?: string; env?: Partial<Server['env']> } = {}) =>
  srv.handle(new Request(`https://api.exemplo.test/api/hub/v1${path}`, {
    method: o.method ?? 'GET',
    headers: o.token === null ? {} : { authorization: `Bearer ${o.token ?? TOKEN}` },
  }), { ...srv.env, DABI_HUB_TOKEN: TOKEN, ...o.env });
const j = async (r: Response) => (await r.json()) as Record<string, any>;

beforeEach(async () => {
  srv = makeServer();
  await srv.issueFor('ana@exemplo.com'); await srv.issueFor('bruno@exemplo.com');
  await srv.login('ana@exemplo.com', 'Celular da Ana', '10.0.0.2');
});

describe('Autorização do hub', () => {
  it('sem segredo configurado: 503 em todas as rotas', async () => {
    for (const p of ['/health', '/overview']) expect((await hub(p, { env: { DABI_HUB_TOKEN: undefined } })).status, p).toBe(503);
  });
  it('segredo curto demais é tratado como não configurado', async () => {
    expect((await hub('/health', { token: 'curto', env: { DABI_HUB_TOKEN: 'curto' } })).status).toBe(503);
  });
  it('sem token, token errado ou sem o prefixo Bearer: 401', async () => {
    for (const p of ['/health', '/overview']) {
      expect((await hub(p, { token: null })).status, p).toBe(401);
      expect((await hub(p, { token: `${TOKEN}x` })).status, p).toBe(401);
    }
    const noPrefix = await srv.handle(new Request('https://api.exemplo.test/api/hub/v1/health', { headers: { authorization: TOKEN } }), { ...srv.env, DABI_HUB_TOKEN: TOKEN });
    expect(noPrefix.status).toBe(401);
  });
  it('sessão de cliente não serve como credencial do hub', async () => {
    const s = await srv.login('bruno@exemplo.com', 'Notebook', '10.0.0.3');
    const r = await srv.handle(new Request('https://api.exemplo.test/api/hub/v1/overview', { headers: { cookie: s.cookie } }), { ...srv.env, DABI_HUB_TOKEN: TOKEN });
    expect(r.status).toBe(401);
  });
  it('só GET e só as rotas do contrato', async () => {
    expect((await hub('/overview', { method: 'POST' })).status).toBe(405);
    expect((await hub('/customers')).status).toBe(404);
  });
});

describe('Contrato v1', () => {
  it('health informa o banco e o ambiente', async () => {
    const r = await hub('/health', { env: { APP_ENV: 'staging' } });
    expect(r.status).toBe(200);
    const body = await j(r);
    expect(body).toMatchObject({ contract: HUB_CONTRACT_VERSION, system: 'preco-certo', environment: 'staging', status: 'ok' });
    expect(body.checks).toEqual([expect.objectContaining({ name: 'database', status: 'ok' })]);
  });
  it('overview traz só contagens agregadas, sem dados de clientes', async () => {
    srv.db.raw.prepare("UPDATE licenses SET status = 'revoked' WHERE email = 'bruno@exemplo.com'").run();
    const r = await hub('/overview');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const body = await j(r);
    expect(body).toMatchObject({ contract: HUB_CONTRACT_VERSION, system: 'preco-certo', accounts: { total: 2, active: 1, new30d: 2 }, support: { open: 0 } });
    const metric = (key: string) => body.metrics.find((m: { key: string }) => m.key === key)?.value;
    expect(metric('suspended')).toBe(1);
    expect(metric('pending_first_login')).toBe(1);
    expect(metric('recent_users_7d')).toBe(1);
    expect(JSON.stringify(body)).not.toMatch(/@exemplo\.com/);
  });
});

// ── Gestão de contas (segundo segredo, DABI_HUB_ADMIN_TOKEN) ──────────────
const ADMIN_TOKEN = 'k'.repeat(43);
const HUB_ADMIN = 'dono@dabi.tech';
const accounts = (path = '', o: { token?: string | null; method?: string; body?: unknown; env?: Partial<Server['env']> } = {}) =>
  srv.handle(new Request(`https://api.exemplo.test/api/hub/v1/accounts${path}`, {
    method: o.method ?? (o.body !== undefined ? 'POST' : 'GET'),
    headers: { ...(o.token === null ? {} : { authorization: `Bearer ${o.token ?? ADMIN_TOKEN}` }), ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
  }), { ...srv.env, DABI_HUB_TOKEN: TOKEN, DABI_HUB_ADMIN_TOKEN: ADMIN_TOKEN, ...o.env });
const idOf = (email: string) => (srv.db.raw.prepare('SELECT id FROM licenses WHERE email = ?').get(email) as { id: string }).id;
const act = (email: string, body: Record<string, unknown>) => accounts(`/${idOf(email)}/actions`, { body: { actor: HUB_ADMIN, ...body } });

describe('Contas: autorização', () => {
  it('sem o segredo de contas: 503, mesmo com o de leitura configurado', async () => {
    expect((await accounts('', { env: { DABI_HUB_ADMIN_TOKEN: undefined } })).status).toBe(503);
  });
  it('segredo de contas igual ao de leitura é tratado como não configurado', async () => {
    expect((await accounts('', { token: TOKEN, env: { DABI_HUB_ADMIN_TOKEN: TOKEN } })).status).toBe(503);
  });
  it('um token não vale nas rotas do outro', async () => {
    expect((await accounts('', { token: TOKEN })).status).toBe(401);
    expect((await hub('/overview', { token: ADMIN_TOKEN, env: { DABI_HUB_ADMIN_TOKEN: ADMIN_TOKEN } })).status).toBe(401);
    expect((await accounts('', { token: null })).status).toBe(401);
  });
  it('métodos e rotas', async () => {
    expect((await accounts('', { method: 'POST' })).status).toBe(405);
    expect((await accounts(`/${idOf('ana@exemplo.com')}/actions`, { method: 'GET' })).status).toBe(405);
    expect((await accounts('/lic_0000000000000000')).status).toBe(404);
  });
});

describe('Contas: busca', () => {
  it('lista com situação, capacidades e conta protegida', async () => {
    const userId = (srv.db.raw.prepare("SELECT user_id FROM licenses WHERE email = 'ana@exemplo.com'").get() as { user_id: string }).user_id;
    srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', ?, 'cli')").run(userId, srv.state.clock.toISOString());
    const r = await accounts();
    expect(r.status).toBe(200);
    const body = await j(r);
    expect(body).toMatchObject({ contract: HUB_CONTRACT_VERSION, system: 'preco-certo', capabilities: ['block', 'extend-trial'], truncated: false });
    const byEmail = Object.fromEntries(body.accounts.map((a: { email: string }) => [a.email, a]));
    expect(byEmail['ana@exemplo.com']).toMatchObject({ status: 'active', protected: true, trialEndsAt: null, trialDaysPending: null });
    expect(byEmail['ana@exemplo.com'].lastAccessAt).toBeTruthy();
    expect(byEmail['bruno@exemplo.com']).toMatchObject({ status: 'pending', protected: false, lastAccessAt: null });
  });
  it('filtra por e-mail ou nome', async () => {
    const body = await j(await accounts('?q=BRUNO'));
    expect(body.accounts.map((a: { email: string }) => a.email)).toEqual(['bruno@exemplo.com']);
  });
  it('marca teste vencido como expired', async () => {
    srv.db.raw.prepare("UPDATE licenses SET trial_days = 7, expires_at = '2026-11-01T00:00:00.000Z' WHERE email = 'ana@exemplo.com'").run();
    const body = await j(await accounts('?q=ana'));
    expect(body.accounts[0]).toMatchObject({ status: 'expired', trialEndsAt: '2026-11-01T00:00:00.000Z' });
  });
});

describe('Contas: ações', () => {
  it('bloquear exige o e-mail da conta digitado de novo', async () => {
    const r = await act('ana@exemplo.com', { action: 'block', confirmEmail: 'outra@exemplo.com' });
    expect(r.status).toBe(400);
    expect((await j(r)).error).toBe('CONFIRMATION_MISMATCH');
    expect((srv.db.raw.prepare("SELECT status FROM licenses WHERE email = 'ana@exemplo.com'").get() as { status: string }).status).toBe('active');
  });
  it('bloquear suspende, encerra as sessões e registra o autor do hub', async () => {
    const r = await act('ana@exemplo.com', { action: 'block', confirmEmail: 'ANA@exemplo.com' });
    expect(r.status).toBe(200);
    expect(await j(r)).toMatchObject({ changed: true, account: { email: 'ana@exemplo.com', status: 'blocked' } });
    const open = srv.db.raw.prepare("SELECT COUNT(*) AS n FROM sessions s JOIN licenses l ON l.user_id = s.user_id WHERE l.email = 'ana@exemplo.com' AND s.revoked_at IS NULL").get() as { n: number };
    expect(open.n).toBe(0);
    const audit = srv.table('admin_audit');
    expect(audit.map(a => [a.action, a.admin_user_id, a.result])).toEqual([
      ['customer.suspend', `hub:${HUB_ADMIN}`, 'ok'],
      ['session.revoke-all', `hub:${HUB_ADMIN}`, 'ok'],
    ]);
    // De novo: nada muda.
    expect(await j(await act('ana@exemplo.com', { action: 'block', confirmEmail: 'ana@exemplo.com' }))).toMatchObject({ changed: false });
  });
  it('desbloquear reativa', async () => {
    await act('bruno@exemplo.com', { action: 'block', confirmEmail: 'bruno@exemplo.com' });
    expect(await j(await act('bruno@exemplo.com', { action: 'unblock' }))).toMatchObject({ changed: true, account: { status: 'pending' } });
  });
  it('conta administrativa não é bloqueada', async () => {
    const userId = (srv.db.raw.prepare("SELECT user_id FROM licenses WHERE email = 'ana@exemplo.com'").get() as { user_id: string }).user_id;
    srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', ?, 'cli')").run(userId, srv.state.clock.toISOString());
    const r = await act('ana@exemplo.com', { action: 'block', confirmEmail: 'ana@exemplo.com' });
    expect(r.status).toBe(409);
    expect((await j(r)).error).toBe('PROTECTED_ACCOUNT');
  });
  it('estender teste: vencido conta a partir de agora; não iniciado só soma dias', async () => {
    srv.db.raw.prepare("UPDATE licenses SET trial_days = 7, expires_at = '2026-11-01T00:00:00.000Z' WHERE email = 'ana@exemplo.com'").run();
    srv.db.raw.prepare("UPDATE licenses SET trial_days = 7 WHERE email = 'bruno@exemplo.com'").run();
    expect(await j(await act('ana@exemplo.com', { action: 'extend-trial', days: 10 }))).toMatchObject({
      changed: true, account: { status: 'active', trialEndsAt: '2026-11-22T15:00:00.000Z' },
    });
    expect(await j(await act('bruno@exemplo.com', { action: 'extend-trial', days: 3 }))).toMatchObject({
      account: { trialEndsAt: null, trialDaysPending: 10 },
    });
  });
  it('estender teste em licença sem prazo, dias inválidos ou ação desconhecida', async () => {
    expect((await j(await act('ana@exemplo.com', { action: 'extend-trial', days: 5 }))).error).toBe('NOT_A_TRIAL');
    expect((await act('ana@exemplo.com', { action: 'extend-trial', days: 0 })).status).toBe(400);
    expect((await act('ana@exemplo.com', { action: 'extend-trial', days: 1.5 })).status).toBe(400);
    expect((await j(await act('ana@exemplo.com', { action: 'delete' }))).error).toBe('UNSUPPORTED_ACTION');
    expect((await act('ana@exemplo.com', { action: 'unblock', actor: 'não é e-mail' })).status).toBe(400);
  });
  it('conta inexistente: ACCOUNT_NOT_FOUND (diferente de rota inexistente)', async () => {
    const r = await accounts('/lic_0000000000000000/actions', { body: { action: 'unblock', actor: HUB_ADMIN } });
    expect(r.status).toBe(404);
    expect((await j(r)).error).toBe('ACCOUNT_NOT_FOUND');
    expect((await j(await accounts('/qualquer-coisa/actions', { body: { action: 'unblock', actor: HUB_ADMIN } }))).error).toBe('ACCOUNT_NOT_FOUND');
  });
  it('a auditoria do painel mostra que a ação veio do hub', async () => {
    await act('bruno@exemplo.com', { action: 'block', confirmEmail: 'bruno@exemplo.com' });
    const session = await srv.login('ana@exemplo.com', 'Painel');
    const userId = (srv.db.raw.prepare("SELECT user_id FROM licenses WHERE email = 'ana@exemplo.com'").get() as { user_id: string }).user_id;
    srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', ?, 'cli')").run(userId, srv.state.clock.toISOString());
    const r = await srv.request('GET', '/api/admin/audit', { session });
    expect(r.status).toBe(200);
    expect((await j(r)).events.map((e: { action: string; admin: string }) => [e.action, e.admin])).toEqual([
      ['session.revoke-all', `Dabi Hub (${HUB_ADMIN})`],
      ['customer.suspend', `Dabi Hub (${HUB_ADMIN})`],
    ]);
  });
});
