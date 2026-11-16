/**
 * Nome da pessoa titular (migração 0014): informado pelo painel administrativo e devolvido na sessão,
 * para o app cumprimentar a pessoa pelo nome. Licenças antigas ficam sem nome (null).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanPersonName, firstName } from '../shared/personName';
import { greetingFor } from '../src/pages/DashboardPage';
import { makeServer, type Server, type Session } from './helpers/server';

let srv: Server; let admin: Session;
beforeEach(async () => {
  srv = makeServer(new Date('2026-11-16T12:00:00.000Z'));
  await srv.issueFor('dono@exemplo.com'); admin = await srv.login('dono@exemplo.com');
  const userId = (srv.db.raw.prepare("SELECT id FROM users WHERE email = 'dono@exemplo.com'").get() as { id: string }).id;
  srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', '2026-11-16T12:00:00.000Z', 'cli')").run(userId);
});
const api = (method: string, path: string, body?: unknown) => srv.request(method, `/api/admin${path}`, { session: admin, ...(body !== undefined ? { body } : {}) });
const holder = (email: string) => (srv.db.raw.prepare('SELECT holder_name FROM licenses WHERE email = ?').get(email) as { holder_name: string | null }).holder_name;

describe('nome da pessoa', () => {
  it('cadastro com nome: normaliza espaços e devolve o nome na sessão da pessoa', async () => {
    expect((await api('POST', '/customers', { email: 'lana@exemplo.com', name: '  Lana   Costa ' })).status).toBe(201);
    expect(holder('lana@exemplo.com')).toBe('Lana Costa');
    const s = await srv.login('lana@exemplo.com');
    const body = await (await srv.request('GET', '/api/auth/session', { session: s })).json() as { license: { holderName: string | null } };
    expect(body.license.holderName).toBe('Lana Costa');
  });

  it('nome inválido é recusado; sem nome continua aceito pela API (cadastros antigos e CLI)', async () => {
    for (const bad of ['Ana 123', '<b>', 'x'.repeat(61), 42]) expect((await api('POST', '/customers', { email: 'a@exemplo.com', name: bad })).status, String(bad)).toBe(400);
    expect((await api('POST', '/customers', { email: 'sem@exemplo.com' })).status).toBe(201);
    expect(holder('sem@exemplo.com')).toBeNull();
    const s = await srv.login('sem@exemplo.com');
    expect(((await (await srv.request('GET', '/api/auth/session', { session: s })).json()) as { license: { holderName: unknown } }).license.holderName).toBeNull();
  });

  it('alterar o nome: valida, grava, aparece na lista/pesquisa e fica no histórico', async () => {
    const id = (await (await api('POST', '/customers', { email: 'bia@exemplo.com' })).json() as { id: string }).id;
    expect((await api('POST', `/customers/${id}/name`, { name: '' })).status).toBe(400);
    expect(await (await api('POST', `/customers/${id}/name`, { name: "Beatriz D'Ávila" })).json()).toMatchObject({ name: "Beatriz D'Ávila", changed: true });
    expect(await (await api('POST', `/customers/${id}/name`, { name: "Beatriz D'Ávila" })).json()).toMatchObject({ changed: false });
    const list = await (await api('GET', '/customers?q=beatriz')).json() as { customers: { email: string; name: string | null }[] };
    expect(list.customers).toEqual([expect.objectContaining({ email: 'bia@exemplo.com', name: "Beatriz D'Ávila" })]);
    expect(srv.table('admin_audit').filter(a => a.action === 'customer.rename').map(a => a.result)).toEqual(['ok', 'noop']);
  });
});

describe('saudação', () => {
  it('bom dia / boa tarde / boa noite pela hora do aparelho', () => {
    expect([4, 5, 11, 12, 17, 18, 23, 0].map(greetingFor)).toEqual(['Boa noite', 'Bom dia', 'Bom dia', 'Boa tarde', 'Boa tarde', 'Boa noite', 'Boa noite', 'Boa noite']);
  });
  it('usa só o primeiro nome', () => {
    expect(firstName('Lana Costa')).toBe('Lana'); expect(firstName(null)).toBeNull();
    expect(cleanPersonName(' José  da   Silva ')).toBe('José da Silva'); expect(cleanPersonName('')).toBeNull();
  });
});
