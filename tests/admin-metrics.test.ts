/** Métricas da Visão geral do painel: só contagens agregadas, por semana e por situação. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeServer, type Server, type Session } from './helpers/server';

let srv: Server; let admin: Session;
beforeEach(async () => {
  srv = makeServer(new Date('2026-11-16T15:00:00.000Z')); // segunda-feira
  await srv.issueFor('dono@exemplo.com'); admin = await srv.login('dono@exemplo.com');
  const userId = (srv.db.raw.prepare("SELECT id FROM users WHERE email = 'dono@exemplo.com'").get() as { id: string }).id;
  srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', '2026-11-16T12:00:00.000Z', 'cli')").run(userId);
});
type M = { weeks: { start: string; signups: number; firstLogins: number; quotes: number; orders: number }[]; activeUsers: { d1: number; d7: number; d30: number }; licenses: Record<string, number>; funnel: Record<string, number> };
const get = async () => (await srv.request('GET', '/api/admin/metrics', { session: admin })).json() as Promise<M>;

describe('métricas do painel', () => {
  it('12 semanas começando na segunda; conta cadastros, primeiros acessos e situação das licenças', async () => {
    await srv.issueFor('ana@exemplo.com'); await srv.login('ana@exemplo.com');
    const t = await srv.issueFor('bia@exemplo.com'); srv.db.raw.prepare('UPDATE licenses SET trial_days = 14 WHERE id = ?').run(t);
    const e = await srv.issueFor('carla@exemplo.com'); srv.db.raw.prepare("UPDATE licenses SET trial_days = 14, expires_at = '2026-11-18T00:00:00.000Z' WHERE id = ?").run(e);
    const x = await srv.issueFor('duda@exemplo.com'); srv.db.raw.prepare("UPDATE licenses SET trial_days = 14, expires_at = '2026-11-10T00:00:00.000Z' WHERE id = ?").run(x);
    const sus = await srv.issueFor('eva@exemplo.com'); srv.db.raw.prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?").run(sus);
    const m = await get();
    expect(m.weeks).toHaveLength(12);
    expect(m.weeks[11].start).toBe('2026-11-16'); expect(m.weeks[0].start).toBe('2026-08-31');
    expect(m.weeks[11]).toMatchObject({ signups: 6, firstLogins: 2 });
    expect(m.licenses).toEqual({ permanent: 2, trialRunning: 0, trialEnding: 1, trialEnded: 1, trialNotStarted: 1, suspended: 1 });
    expect(m.funnel).toMatchObject({ registered: 6, loggedIn: 2, active7d: 2 });
    expect(m.activeUsers).toEqual({ d1: 2, d7: 2, d30: 2 });
  });
  it('só para administradores', async () => {
    await srv.issueFor('ana@exemplo.com'); const ana = await srv.login('ana@exemplo.com');
    expect((await srv.request('GET', '/api/admin/metrics', { session: ana })).status).toBe(403);
  });
});
