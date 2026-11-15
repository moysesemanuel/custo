/**
 * Período de teste (migração 0013): o prazo começa no PRIMEIRO acesso, termina sozinho e, depois dele, a conta perde o acesso
 * (sincronização, links e login), sem apagar nada. Licenças sem prazo (todas as existentes) não mudam.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TRIAL_DAYS } from '../shared/trial';
import { makeServer, type Server, type Session } from './helpers/server';

const DAY = 86_400_000;
let srv: Server;
beforeEach(() => { srv = makeServer(new Date('2026-11-15T12:00:00.000Z')); });

const lic = (email: string) => srv.db.raw.prepare('SELECT id, trial_days, expires_at, user_id FROM licenses WHERE email = ?').get(email) as { id: string; trial_days: number | null; expires_at: string | null; user_id: string | null };
async function trialFor(email: string, days = TRIAL_DAYS) { const id = await srv.issueFor(email); srv.db.raw.prepare('UPDATE licenses SET trial_days = ? WHERE id = ?').run(days, id); return id; }
const advance = (ms: number) => { srv.state.clock = new Date(srv.state.clock.getTime() + ms); };
const session = (s: Session) => srv.request('GET', '/api/auth/session', { session: s }).then(async r => ({ status: r.status, body: await r.json() as { license: { status: string; expiresAt: string | null } } }));
const pull = (s: Session) => srv.request('GET', '/api/sync/v2?since=0', { session: s });

describe('licença de teste', () => {
  it('o prazo só começa no primeiro acesso: cadastro sem login não gasta dias', async () => {
    await trialFor('ana@exemplo.com');
    advance(30 * DAY); // cadastrada há 30 dias, nunca entrou
    expect(lic('ana@exemplo.com').expires_at).toBeNull();
    const s = await srv.login('ana@exemplo.com');
    const end = new Date(srv.state.clock.getTime() + TRIAL_DAYS * DAY).toISOString();
    expect(lic('ana@exemplo.com').expires_at).toBe(end);
    expect((await session(s)).body.license).toMatchObject({ status: 'active', expiresAt: end });
  });

  it('durante o teste tudo funciona; no fim, sincronização e sessão ficam bloqueadas, sem apagar dados', async () => {
    await trialFor('bia@exemplo.com');
    const s = await srv.login('bia@exemplo.com');
    expect((await pull(s)).status).toBe(200);
    advance(TRIAL_DAYS * DAY - 60_000); // 1 minuto antes do fim
    expect((await pull(s)).status).toBe(200);
    advance(120_000); // 1 minuto depois
    const r = await pull(s);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: 'TRIAL_EXPIRED' });
    const push = await srv.request('POST', '/api/sync/v2/push', { session: s, body: { baseRevision: 0, baseRevs: { ingredients: {}, recipes: {}, orders: {}, packagings: {} }, upserts: { ingredients: [], recipes: [], orders: [], packagings: [] }, deletes: { ingredients: [], recipes: [], orders: [], packagings: [] } } });
    expect(push.status).toBe(403);
    // a sessão ainda identifica a pessoa (o app mostra "teste encerrado" + backup), com a situação efetiva
    expect((await session(s)).body.license.status).toBe('expired');
    expect(lic('bia@exemplo.com').user_id).not.toBeNull(); // nada foi apagado
  });

  it('depois do fim, o login recebe o código mas não abre sessão (TRIAL_EXPIRED) e o código não pode ser reutilizado', async () => {
    await trialFor('cris@exemplo.com');
    await srv.login('cris@exemplo.com');
    advance((TRIAL_DAYS + 1) * DAY);
    expect((await srv.request('POST', '/api/auth/request-code', { body: { email: 'cris@exemplo.com' } })).status).toBe(202);
    const code = srv.mail.lastCode();
    const sessionsBefore = srv.table('sessions').length;
    const v = await srv.request('POST', '/api/auth/verify-code', { body: { email: 'cris@exemplo.com', code } });
    expect(v.status).toBe(403);
    expect(await v.json()).toMatchObject({ error: 'TRIAL_EXPIRED' });
    expect(v.headers.get('set-cookie')).toBeNull();
    expect(srv.table('sessions').length).toBe(sessionsBefore);
    expect((await srv.request('POST', '/api/auth/verify-code', { body: { email: 'cris@exemplo.com', code } })).status).toBe(401); // uso único
  });

  it('licenças sem prazo (as que já existem) não vencem nunca', async () => {
    await srv.issueFor('dona@exemplo.com');
    const s = await srv.login('dona@exemplo.com');
    advance(400 * DAY);
    srv.db.raw.prepare("UPDATE sessions SET expires_at = '2099-01-01T00:00:00.000Z', created_at = ?").run(srv.state.clock.toISOString()); // isola o prazo da sessão
    expect((await pull(s)).status).toBe(200);
    expect(lic('dona@exemplo.com')).toMatchObject({ trial_days: null, expires_at: null });
    expect((await session(s)).body.license).toMatchObject({ status: 'active', expiresAt: null });
  });
});

describe('painel administrativo: teste', () => {
  let admin: Session;
  beforeEach(async () => {
    await srv.issueFor('dono@exemplo.com'); admin = await srv.login('dono@exemplo.com');
    const userId = (srv.db.raw.prepare("SELECT id FROM users WHERE email = 'dono@exemplo.com'").get() as { id: string }).id;
    srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', '2026-11-15T12:00:00.000Z', 'cli')").run(userId);
  });
  const api = (method: string, path: string, body?: unknown) => srv.request(method, `/api/admin${path}`, { session: admin, ...(body !== undefined ? { body } : {}) });

  it('cadastra com teste de 14 dias (ou sem prazo) e mostra o prazo na lista', async () => {
    expect((await api('POST', '/customers', { email: 'novo@exemplo.com', trialDays: TRIAL_DAYS })).status).toBe(201);
    expect((await api('POST', '/customers', { email: 'fixo@exemplo.com' })).status).toBe(201);
    expect(lic('novo@exemplo.com')).toMatchObject({ trial_days: 14, expires_at: null });
    expect(lic('fixo@exemplo.com')).toMatchObject({ trial_days: null, expires_at: null });
    for (const bad of [0, 366, 1.5, '14']) expect((await api('POST', '/customers', { email: `x${String(bad)}@exemplo.com`, trialDays: bad })).status, String(bad)).toBe(400);
    const list = await (await api('GET', '/customers')).json() as { customers: { email: string; trialDays: number | null; trialEndsAt: string | null }[] };
    expect(list.customers.find(c => c.email === 'novo@exemplo.com')).toMatchObject({ trialDays: 14, trialEndsAt: null });
  });

  it('prorroga: antes do primeiro acesso soma dias; depois, avança o fim (a partir de hoje se já venceu); registra no histórico', async () => {
    const id = await trialFor('ped@exemplo.com');
    let r = await (await api('POST', `/customers/${id}/trial/extend`, { days: 7 })).json() as { trialDays: number; trialEndsAt: string | null };
    expect(r).toEqual({ id, trialDays: 21, trialEndsAt: null });
    await srv.login('ped@exemplo.com');
    const start = srv.state.clock.getTime();
    expect(lic('ped@exemplo.com').expires_at).toBe(new Date(start + 21 * DAY).toISOString());
    advance(22 * DAY); // já venceu (21 dias); a sessão do admin (30 dias sem uso) segue válida
    r = await (await api('POST', `/customers/${id}/trial/extend`, { days: 7 })).json() as typeof r;
    expect(r.trialEndsAt).toBe(new Date(srv.state.clock.getTime() + 7 * DAY).toISOString());
    expect((await api('POST', `/customers/${id}/trial/extend`, { days: 0 })).status).toBe(400);
    expect(srv.table('admin_audit').filter(a => a.action === 'customer.trial-extend')).toHaveLength(2);
  });

  it('tornar permanente remove o prazo e devolve o acesso a quem já tinha vencido', async () => {
    const id = await trialFor('lu@exemplo.com');
    const s = await srv.login('lu@exemplo.com');
    advance(20 * DAY);
    expect((await pull(s)).status).toBe(403);
    expect(await (await api('POST', `/customers/${id}/trial/permanent`)).json()).toMatchObject({ changed: true });
    expect(lic('lu@exemplo.com')).toMatchObject({ trial_days: null, expires_at: null });
    expect((await pull(s)).status).toBe(200);
    expect(await (await api('POST', `/customers/${id}/trial/permanent`)).json()).toMatchObject({ changed: false });
  });

  it('prorrogar uma licença sem prazo é recusado', async () => {
    const id = await srv.issueFor('perm@exemplo.com');
    expect((await api('POST', `/customers/${id}/trial/extend`, { days: 7 })).status).toBe(409);
  });
});
