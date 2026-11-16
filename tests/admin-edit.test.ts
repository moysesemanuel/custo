/** Painel: trocar o e-mail do cliente (a pedido dele) e definir o prazo da licença numa data. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeServer, type Server, type Session } from './helpers/server';

let srv: Server; let admin: Session;
beforeEach(async () => {
  srv = makeServer(new Date('2026-11-16T15:00:00.000Z'));
  await srv.issueFor('dono@exemplo.com'); admin = await srv.login('dono@exemplo.com');
  const userId = (srv.db.raw.prepare("SELECT id FROM users WHERE email = 'dono@exemplo.com'").get() as { id: string }).id;
  srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', '2026-11-16T12:00:00.000Z', 'cli')").run(userId);
});
const api = (method: string, path: string, body?: unknown) => srv.request(method, `/api/admin${path}`, { session: admin, ...(body !== undefined ? { body } : {}) });
const lic = (id: string) => srv.db.raw.prepare('SELECT email, trial_days, expires_at, user_id FROM licenses WHERE id = ?').get(id) as { email: string; trial_days: number | null; expires_at: string | null; user_id: string | null };

describe('trocar o e-mail do cliente', () => {
  it('muda licença e conta juntas; a sessão e os dados continuam; o login passa a ser pelo e-mail novo', async () => {
    const id = await srv.issueFor('ana@exemplo.com'); const s = await srv.login('ana@exemplo.com');
    expect((await api('POST', `/customers/${id}/email`, { email: 'ana.nova@exemplo.com', confirmEmail: 'errado@exemplo.com' })).status).toBe(400);
    const r = await api('POST', `/customers/${id}/email`, { email: ' Ana.Nova@Exemplo.com ', confirmEmail: 'ana@exemplo.com' });
    expect(await r.json()).toMatchObject({ email: 'ana.nova@exemplo.com', changed: true });
    expect(lic(id).email).toBe('ana.nova@exemplo.com');
    expect((srv.db.raw.prepare('SELECT email FROM users WHERE id = ?').get(lic(id).user_id) as { email: string }).email).toBe('ana.nova@exemplo.com');
    const session = await (await srv.request('GET', '/api/auth/session', { session: s })).json() as { user: { email: string } };
    expect(session.user.email).toBe('ana.nova@exemplo.com'); // mesma sessão, e-mail novo
    expect((await srv.request('GET', '/api/sync/v2?since=0', { session: s })).status).toBe(200);
    expect(srv.table('admin_audit').filter(a => a.action === 'customer.email-change')).toHaveLength(1);
    // o e-mail antigo não recebe mais código (não tem licença); o novo recebe
    const before = srv.mail.outbox.filter(m => m.to === 'ana@exemplo.com').length;
    await srv.request('POST', '/api/auth/request-code', { body: { email: 'ana@exemplo.com' } });
    expect(srv.mail.outbox.filter(m => m.to === 'ana@exemplo.com')).toHaveLength(before);
    srv.state.clock = new Date(srv.state.clock.getTime() + 120_000);
    await srv.request('POST', '/api/auth/request-code', { body: { email: 'ana.nova@exemplo.com' } });
    expect(srv.mail.outbox.filter(m => m.to === 'ana.nova@exemplo.com')).toHaveLength(1);
  });

  it('recusa e-mail já usado por outra conta, e e-mail inválido', async () => {
    const id = await srv.issueFor('bia@exemplo.com'); await srv.issueFor('carla@exemplo.com');
    expect((await api('POST', `/customers/${id}/email`, { email: 'carla@exemplo.com', confirmEmail: 'bia@exemplo.com' })).status).toBe(409);
    expect((await api('POST', `/customers/${id}/email`, { email: 'não é e-mail', confirmEmail: 'bia@exemplo.com' })).status).toBe(400);
    expect(lic(id).email).toBe('bia@exemplo.com');
  });

  it('cliente que ainda não entrou: muda só a licença e ele entra com o e-mail novo', async () => {
    const id = await srv.issueFor('duda@exemplo.com');
    expect((await api('POST', `/customers/${id}/email`, { email: 'duda2@exemplo.com', confirmEmail: 'duda@exemplo.com' })).status).toBe(200);
    const s = await srv.login('duda2@exemplo.com');
    expect((await srv.request('GET', '/api/sync/v2?since=0', { session: s })).status).toBe(200);
  });
});

describe('prazo da licença numa data', () => {
  it('define o fim no fim do dia (Brasília); também dá prazo a licença permanente; registra no histórico', async () => {
    const id = await srv.issueFor('eva@exemplo.com'); const s = await srv.login('eva@exemplo.com');
    const r = await (await api('POST', `/customers/${id}/trial/until`, { date: '2026-11-30' })).json() as { trialEndsAt: string; trialDays: number };
    expect(r.trialEndsAt).toBe('2026-12-01T02:59:59.999Z'); expect(r.trialDays).toBe(15);
    expect((await srv.request('GET', '/api/sync/v2?since=0', { session: s })).status).toBe(200);
    srv.state.clock = new Date('2026-12-01T03:00:00.000Z');
    srv.db.raw.prepare("UPDATE sessions SET last_seen_at = ?").run(srv.state.clock.toISOString());
    expect((await srv.request('GET', '/api/sync/v2?since=0', { session: s })).status).toBe(403);
    expect(srv.table('admin_audit').find(a => a.action === 'customer.trial-until')?.detail).toBe('2026-11-30');
  });

  it('recusa data passada, inválida ou distante demais', async () => {
    const id = await srv.issueFor('fe@exemplo.com');
    for (const date of ['2026-11-15', '2026-02-30', 'amanhã', '2031-01-01']) expect((await api('POST', `/customers/${id}/trial/until`, { date })).status, date).toBe(400);
    expect(lic(id)).toMatchObject({ trial_days: null, expires_at: null });
  });

  it('hoje vale até o fim do dia; antes do primeiro acesso, a data fica fixa (não recomeça no login)', async () => {
    const id = await srv.issueFor('gi@exemplo.com'); srv.db.raw.prepare('UPDATE licenses SET trial_days = 14 WHERE id = ?').run(id);
    expect((await api('POST', `/customers/${id}/trial/until`, { date: '2026-11-16' })).status).toBe(200);
    await srv.login('gi@exemplo.com');
    expect(lic(id)).toMatchObject({ trial_days: 14, expires_at: '2026-11-17T02:59:59.999Z' });
  });
});
