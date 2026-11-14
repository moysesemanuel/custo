/**
 * Etapa 14.2: o Worker de staging gera os NOVOS links públicos no endereço novo, sem invalidar os já enviados.
 * Usa os valores reais de [env.staging.vars] do worker/wrangler.toml, o Worker real (SQLite local) e o proxy do Pages dos dois hosts.
 * Nada remoto: nenhum link real é criado.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { proxy, type ProxyEnv } from '../functions/_shared/proxy';
import { LEGACY_STAGING_URL, parseWranglerToml, PRODUCTION_URL, STAGING_URL, validateWorkerConfig } from '../scripts/environments.mjs';
import { createQuotesClient, whatsappShareUrl } from '../src/features/sharing/quotes';
import type { PublicQuote } from '../shared/publicQuote';
import { makeServer, type Server, type Session } from './helpers/server';

const TOML = readFileSync('worker/wrangler.toml', 'utf8');
const cfg = parseWranglerToml(TOML).env;
const quote: PublicQuote = { version: 1, quoteNumber: 'ORC-K7M42P', businessName: 'Doces da Bia', issuedAt: '2026-11-14', items: [{ description: 'Brigadeiro', quantity: 10, unitPriceCents: 250 }] };

let srv: Server, ses: Session;
const viaPages = (host: string, path: string, init: RequestInit = {}) => {
  const env: ProxyEnv = { API: { fetch: (r: Request) => srv.handle(r, srv.env) }, APP_ENV: 'staging' };
  return proxy(new Request(`${host}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), cookie: ses.cookie, 'x-csrf-token': ses.csrf } }), env);
};
beforeEach(async () => {
  srv = makeServer();
  Object.assign(srv.env, { PUBLIC_BASE_URL: cfg.staging.vars.PUBLIC_BASE_URL, ALLOWED_ORIGINS: cfg.staging.vars.ALLOWED_ORIGINS, APP_ENV: 'staging' });
  await srv.issueFor('bia@exemplo.com'); ses = await srv.login('bia@exemplo.com', 'Celular', '10.0.0.1');
});
const publish = async (host: string) => {
  const r = await viaPages(host, '/api/quotes', { method: 'POST', body: JSON.stringify(quote), headers: { origin: host, 'content-type': 'application/json' } });
  expect(r.status).toBe(201);
  return r.json() as Promise<{ id: string; url: string }>;
};

describe('configuração de staging (worker/wrangler.toml)', () => {
  it('novos links no endereço novo; as duas origens liberadas; mesmo Worker e mesmo D1; produção independente', () => {
    expect(cfg.staging.vars.PUBLIC_BASE_URL).toBe(STAGING_URL);
    expect(cfg.staging.vars.ALLOWED_ORIGINS.split(',')).toEqual(expect.arrayContaining([STAGING_URL, LEGACY_STAGING_URL]));
    expect(cfg.staging).toMatchObject({ name: 'dabi-orcamentos-staging', vars: { APP_ENV: 'staging' } });
    expect(cfg.staging.d1_databases[0]).toMatchObject({ binding: 'DB', database_name: 'dabi-orcamentos-staging', database_id: expect.stringMatching(/^6d6b478a-/) });
    expect(validateWorkerConfig(TOML, 'staging')).toEqual([]);
    expect(cfg.production.vars).toMatchObject({ PUBLIC_BASE_URL: PRODUCTION_URL, ALLOWED_ORIGINS: PRODUCTION_URL, APP_ENV: 'production' });
  });
});

describe('links públicos depois da troca do endereço', () => {
  it('um link novo usa o endereço novo, mesmo se publicado a partir do front-end antigo; o WhatsApp leva esse endereço', async () => {
    for (const host of [STAGING_URL, LEGACY_STAGING_URL]) {
      const { id, url } = await publish(host);
      expect(url).toBe(`${STAGING_URL}/o/${id}`);
      expect(whatsappShareUrl(quote, url)).toContain(encodeURIComponent(`${STAGING_URL}/o/${id}`));
    }
  });
  it('o cliente do app devolve a URL do Worker (e só usa o próprio host como reserva se o Worker não mandar URL)', async () => {
    const fetchImpl = (async (url: string, init: RequestInit = {}) => srv.handle(new Request(url, { ...init, headers: { ...(init.headers as Record<string, string>), cookie: ses.cookie, origin: STAGING_URL } }), srv.env)) as typeof fetch;
    const client = createQuotesClient(STAGING_URL, () => ses.csrf, fetchImpl);
    const r = await client.publish(quote);
    expect(r.ok && r.value.url.startsWith(`${STAGING_URL}/o/`)).toBe(true);
  });
  it('um link antigo (mesmo id) abre nos DOIS endereços; revogado responde 410 nos dois; a lista mostra o endereço novo', async () => {
    const { id } = await publish(LEGACY_STAGING_URL);
    for (const host of [LEGACY_STAGING_URL, STAGING_URL]) expect((await viaPages(host, `/o/${id}`)).status, host).toBe(200);
    const list = await (await viaPages(STAGING_URL, '/api/quotes', { headers: { origin: STAGING_URL } })).json() as { quotes: { id: string; url: string }[] };
    expect(list.quotes.find(q => q.id === id)?.url).toBe(`${STAGING_URL}/o/${id}`);
    expect((await viaPages(STAGING_URL, `/api/quotes/${id}`, { method: 'DELETE', headers: { origin: STAGING_URL } })).status).toBe(200);
    for (const host of [LEGACY_STAGING_URL, STAGING_URL]) expect((await viaPages(host, `/o/${id}`)).status, host).toBe(410);
  });
  it('o banco guarda só o id do link, nunca a URL (trocar o endereço não reescreve nem invalida registros)', async () => {
    await publish(STAGING_URL);
    expect(JSON.stringify(srv.table('quotes'))).not.toMatch(/pages\.dev|https?:\/\//);
  });
  it('origens desconhecidas continuam bloqueadas nas gravações autenticadas', async () => {
    const r = await viaPages(STAGING_URL, '/api/quotes', { method: 'POST', body: JSON.stringify(quote), headers: { origin: 'https://evil.example', 'content-type': 'application/json' } });
    expect(r.status).toBe(403); expect(srv.table('quotes')).toHaveLength(0);
  });
});
