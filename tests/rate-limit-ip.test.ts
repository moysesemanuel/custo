/**
 * Limite por IP pelo caminho de produção (Pages Function → Service Binding → Worker), separando:
 *  - cabeçalho recebido (cf-connecting-ip, definido pela borda da Cloudflare);
 *  - IP interpretado pelo Worker (só cf-connecting-ip; X-Forwarded-For/X-Real-IP são ignorados);
 *  - limite efetivamente aplicado (30 pedidos de código por hora por IP; contador por resumo do IP, nunca o IP em texto).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { proxy, type ProxyEnv } from '../functions/_shared/proxy';
import { LOGIN_LIMITS } from '../worker/src/authRoutes';
import { sha256Hex } from '../worker/src/accounts';
import { makeServer, type Server } from './helpers/server';

const HOST = 'https://custo.dabitech.com.br';
let srv: Server, penv: ProxyEnv;
beforeEach(() => {
  srv = makeServer(); srv.env.ALLOWED_ORIGINS = HOST; (srv.env as { APP_ENV?: string }).APP_ENV = 'production';
  penv = { API: { fetch: (r: Request) => srv.handle(r, srv.env) }, APP_ENV: 'production' };
});
const ask = (email: string, headers: Record<string, string> = {}) =>
  proxy(new Request(`${HOST}/api/auth/request-code`, { method: 'POST', body: JSON.stringify({ email }), headers: { origin: HOST, 'content-type': 'application/json', ...headers } }), penv);
const ipKey = async (ip: string) => `i_${await sha256Hex(`ip:${ip}`)}`;

describe('limite por IP pelo Pages + Service Binding', () => {
  it('o IP da borda chega ao Worker, o contador usa só o resumo do IP e o limite vale por IP', async () => {
    for (let i = 0; i < LOGIN_LIMITS.requestPerIp; i++) expect((await ask(`u${i}@exemplo.com`, { 'cf-connecting-ip': '203.0.113.7' })).status).toBe(202);
    expect((await ask('mais@exemplo.com', { 'cf-connecting-ip': '203.0.113.7' })).status).toBe(429);
    expect((await ask('mais@exemplo.com', { 'cf-connecting-ip': '198.51.100.4' })).status).toBe(202); // outro IP não é afetado
    const keys = srv.table('rate_limits').map(r => r.license_id as string);
    expect(keys).toContain(await ipKey('203.0.113.7'));
    expect(JSON.stringify(srv.table('rate_limits'))).not.toContain('203.0.113.7'); // o IP nunca é guardado em texto
  });
  it('X-Forwarded-For e X-Real-IP enviados pelo navegador são ignorados (não dá para trocar de balde forjando cabeçalho)', async () => {
    for (let i = 0; i < LOGIN_LIMITS.requestPerIp; i++) await ask(`f${i}@exemplo.com`, { 'cf-connecting-ip': '203.0.113.8', 'x-forwarded-for': `10.0.0.${i}`, 'x-real-ip': `10.1.0.${i}` });
    expect((await ask('outro@exemplo.com', { 'cf-connecting-ip': '203.0.113.8', 'x-forwarded-for': '10.9.9.9' })).status).toBe(429);
  });
  it('sem cf-connecting-ip, todos caem no MESMO contador "unknown" (risco documentado; o diagnóstico do admin acusa)', async () => {
    for (let i = 0; i < LOGIN_LIMITS.requestPerIp; i++) await ask(`n${i}@exemplo.com`);
    expect((await ask('terceiro@exemplo.com')).status).toBe(429); // um cliente qualquer ficaria bloqueado pelos outros
    expect(srv.table('rate_limits').map(r => r.license_id)).toContain(await ipKey('unknown'));
  });
  it('o administrador vê se o IP chegou (sem ver o valor)', async () => {
    await srv.issueFor('dono@exemplo.com'); const ses = await srv.login('dono@exemplo.com');
    const userId = (srv.db.raw.prepare("SELECT id FROM users WHERE email = 'dono@exemplo.com'").get() as { id: string }).id;
    srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', '2026-11-12T15:00:00.000Z', 'cli')").run(userId);
    const me = (headers: Record<string, string>) => proxy(new Request(`${HOST}/api/admin/me`, { headers: { cookie: ses.cookie, origin: HOST, ...headers } }), penv).then(r => r.json() as Promise<Record<string, unknown>>);
    expect(await me({ 'cf-connecting-ip': '203.0.113.9' })).toMatchObject({ admin: true, clientIpReceived: true });
    const without = await me({});
    expect(without).toMatchObject({ clientIpReceived: false }); expect(JSON.stringify(without)).not.toMatch(/203\.0\.113/);
  });
});
