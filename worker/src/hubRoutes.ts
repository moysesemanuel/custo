import { addMs, normalizeEmail } from './accounts';
import { AUDIT_RETENTION_DAYS, HUB_ACTOR_PREFIX, auditStatement, extendTrial, getCustomer, listCustomers, overview, pruneAudit, type CustomerRow } from './adminStore';
import { apiError, json, readJsonBody } from './http';
import {
  HUB_ACCOUNT_SEARCH, HUB_CONTRACT_VERSION, HUB_PATHS, HUB_TRIAL_EXTENSION,
  type HubAccount, type HubAccountCapability, type HubAccountList, type HubAccountActionResult, type HubHealth, type HubHealthCheck, type HubOverview,
} from './hubContract';
import { LICENSE_ID_PATTERN } from './licenses';
import { consumeRateLimit, type D1Like } from './store';

/**
 * Integração com o Dabi Hub (painel central da Dabi Tech). Contrato em `./hubContract.ts`.
 *
 * Dois segredos, cada um só vale nas suas rotas (sem sessão nem cookie; sem o segredo configurado: 503):
 * - `DABI_HUB_TOKEN`: /health e /overview. Somente leitura e só contagens agregadas, nunca dados de cliente.
 * - `DABI_HUB_ADMIN_TOKEN`: /accounts (busca por e-mail/nome, bloquear, desbloquear, prorrogar teste). Precisa ser
 *   DIFERENTE do de leitura. Toda ação vai para `admin_audit` com autor `hub:<e-mail de quem agiu no hub>`.
 * Receitas, orçamentos, encomendas e afins nunca saem por aqui.
 */
export type HubEnv = { DB: D1Like; DABI_HUB_TOKEN?: string; DABI_HUB_ADMIN_TOKEN?: string; APP_ENV?: string };
export type HubDeps = { now: () => Date };

const SYSTEM = 'preco-certo';
const MIN_TOKEN_LENGTH = 32;
const DAY = 86_400_000;

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Compara digests de tamanho fixo em tempo constante: não vaza tamanho nem prefixo do token. */
async function tokenMatches(received: string, secret: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(received), sha256(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Confere o Bearer contra o segredo. Devolve a resposta de erro, ou null se autorizado. */
async function authorize(request: Request, secret: string | undefined, notConfigured: boolean): Promise<Response | null> {
  if (notConfigured || !secret || secret.length < MIN_TOKEN_LENGTH) return apiError(503, 'HUB_NOT_CONFIGURED', 'Integração com o hub não configurada.');
  const match = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
  if (!match || !(await tokenMatches(match[1], secret))) return apiError(401, 'UNAUTHORIZED', 'Não autorizado.');
  return null;
}

const ACCOUNT_ACTIONS = /^\/api\/hub\/v1\/accounts\/([^/]+)\/actions$/;
/** Limite de ações do hub por minuto (todas as contas juntas). Leituras não contam. */
export const HUB_WRITE_PER_MINUTE = 30;

/** Roteador /api/hub/*. Devolve undefined se a rota não for do hub. */
export async function hubRoute(request: Request, env: HubEnv, deps: HubDeps, pathname: string): Promise<Response | undefined> {
  if (!pathname.startsWith('/api/hub/')) return undefined;
  const path = pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const iso = deps.now().toISOString();

  if (path === HUB_PATHS.health || path === HUB_PATHS.overview) {
    if (method !== 'GET') return apiError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
    const denied = await authorize(request, env.DABI_HUB_TOKEN, false);
    if (denied) return denied;
    if (path === HUB_PATHS.health) return json(await health(env, iso));
    return json(await summary(env, iso));
  }

  const action = ACCOUNT_ACTIONS.exec(path);
  if (path !== HUB_PATHS.accounts && !action) return apiError(404, 'NOT_FOUND', 'Rota não encontrada.');
  if (method !== (action ? 'POST' : 'GET')) return apiError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
  // O token de contas precisa ser outro: se for igual ao de leitura, quem só deveria ler também gerenciaria contas.
  const denied = await authorize(request, env.DABI_HUB_ADMIN_TOKEN, env.DABI_HUB_ADMIN_TOKEN === env.DABI_HUB_TOKEN);
  if (denied) return denied;

  if (!action) return json(await searchAccounts(env, iso, new URL(request.url).searchParams.get('q')));
  const rate = await consumeRateLimit(env.DB, 'hub', 'hub-write', HUB_WRITE_PER_MINUTE, 60, deps.now().getTime());
  if (!rate.allowed) return apiError(429, 'RATE_LIMITED', 'Muitas ações seguidas. Aguarde um instante.', { 'Retry-After': String(rate.retryAfterSeconds) });
  return accountAction(request, env, iso, decodeURIComponent(action[1]));
}

async function health(env: HubEnv, iso: string): Promise<HubHealth> {
  const startedAt = Date.now();
  let database: HubHealthCheck;
  try {
    await env.DB.prepare('SELECT 1 AS ok').bind().first();
    database = { name: 'database', status: 'ok', latencyMs: Date.now() - startedAt };
  } catch {
    database = { name: 'database', status: 'fail', latencyMs: Date.now() - startedAt, detail: 'Consulta ao D1 falhou.' };
  }
  const checks = [database];
  return {
    contract: HUB_CONTRACT_VERSION,
    system: SYSTEM,
    version: null,
    environment: env.APP_ENV ?? 'local',
    status: checks.every(c => c.status === 'ok') ? 'ok' : 'down',
    checks,
    generatedAt: iso,
  };
}

async function summary(env: HubEnv, iso: string): Promise<HubOverview> {
  const [o, open] = await Promise.all([
    overview(env.DB, iso, addMs(iso, -30 * DAY), addMs(iso, -7 * DAY)),
    env.DB.prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE status = 'open'").bind().first<{ n: number }>(),
  ]);
  const n = (v: number | null | undefined) => Number(v ?? 0);
  const openTickets = n(open?.n);
  return {
    contract: HUB_CONTRACT_VERSION,
    system: SYSTEM,
    generatedAt: iso,
    accounts: { total: n(o?.total), active: n(o?.active), new30d: n(o?.new_30d) },
    support: { open: openTickets },
    metrics: [
      { key: 'recent_users_7d', label: 'Usaram o app', value: n(o?.recent_users_7d), format: 'number', hint: 'últimos 7 dias' },
      { key: 'active_sessions', label: 'Sessões ativas', value: n(o?.active_sessions), format: 'number' },
      { key: 'pending_first_login', label: 'Aguardando 1º acesso', value: n(o?.pending_first_login), format: 'number' },
      { key: 'suspended', label: 'Contas suspensas', value: n(o?.suspended), format: 'number' },
      { key: 'support_open', label: 'Suporte em aberto', value: openTickets, format: 'number', attention: openTickets > 0 },
    ],
  };
}

// ── Gestão de contas ─────────────────────────────────────────────

const CAPABILITIES: HubAccountCapability[] = ['block', 'extend-trial'];
type AccountSource = Pick<CustomerRow, 'id' | 'email' | 'holder_name' | 'status' | 'created_at' | 'user_id' | 'last_seen_at' | 'is_admin' | 'trial_days' | 'expires_at'>;

function toHubAccount(c: AccountSource, iso: string): HubAccount {
  const status = c.status === 'revoked' ? 'blocked' : !c.user_id ? 'pending' : c.expires_at && c.expires_at <= iso ? 'expired' : 'active';
  return {
    id: c.id, email: c.email, name: c.holder_name, status, createdAt: c.created_at, lastAccessAt: c.last_seen_at,
    trialEndsAt: c.expires_at,
    // Teste que ainda não começou: os dias só contam a partir do primeiro acesso.
    trialDaysPending: c.expires_at === null && c.trial_days !== null ? c.trial_days : null,
    protected: c.is_admin > 0,
  };
}

async function searchAccounts(env: HubEnv, iso: string, rawQuery: string | null): Promise<HubAccountList> {
  const q = (rawQuery ?? '').trim().slice(0, HUB_ACCOUNT_SEARCH.queryMax);
  const rows = await listCustomers(env.DB, { q: q || undefined, limit: HUB_ACCOUNT_SEARCH.limit, nowIso: iso });
  return {
    contract: HUB_CONTRACT_VERSION, system: SYSTEM, generatedAt: iso, capabilities: CAPABILITIES,
    accounts: rows.slice(0, HUB_ACCOUNT_SEARCH.limit).map(c => toHubAccount(c, iso)),
    truncated: rows.length > HUB_ACCOUNT_SEARCH.limit,
  };
}

const notFound = () => apiError(404, 'ACCOUNT_NOT_FOUND', 'Conta não encontrada.');

async function accountAction(request: Request, env: HubEnv, iso: string, accountId: string): Promise<Response> {
  if (!LICENSE_ID_PATTERN.test(accountId)) return notFound();
  const body = await readJsonBody(request, 1024);
  if (!body.ok) return apiError(400, 'INVALID_REQUEST', 'Corpo da requisição inválido.');
  const b = (body.data ?? {}) as { action?: unknown; actor?: unknown; confirmEmail?: unknown; days?: unknown };
  const actor = normalizeEmail(b.actor);
  if (!actor) return apiError(400, 'INVALID_REQUEST', 'Informe quem está agindo (actor).');
  if (b.action !== 'block' && b.action !== 'unblock' && b.action !== 'extend-trial') return apiError(400, 'UNSUPPORTED_ACTION', 'Ação não suportada.');

  const c = await getCustomer(env.DB, accountId);
  if (!c) return notFound();
  const actorId = `${HUB_ACTOR_PREFIX}${actor}`;
  let changed: boolean;

  if (b.action === 'block') {
    if (normalizeEmail(b.confirmEmail) !== c.email) return apiError(400, 'CONFIRMATION_MISMATCH', 'A confirmação não confere com o e-mail da conta.');
    if (c.is_admin > 0) return apiError(409, 'PROTECTED_ACCOUNT', 'Contas administrativas não podem ser bloqueadas pelo hub.');
    // Suspende a licença e derruba os dispositivos conectados no mesmo lote (com auditoria de cada passo).
    const r = await env.DB.batch([
      env.DB.prepare("UPDATE licenses SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'").bind(iso, accountId),
      auditStatement(env.DB, { at: iso, adminUserId: actorId, action: 'customer.suspend', licenseId: accountId, targetUserId: c.user_id }),
      env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(iso, c.user_id),
      auditStatement(env.DB, { at: iso, adminUserId: actorId, action: 'session.revoke-all', licenseId: accountId, targetUserId: c.user_id, detailSql: "'sessions=' || changes()" }),
    ]);
    changed = (r[0].meta.changes ?? 0) > 0;
  } else if (b.action === 'unblock') {
    const r = await env.DB.batch([
      env.DB.prepare("UPDATE licenses SET status = 'active', revoked_at = NULL WHERE id = ? AND status = 'revoked'").bind(accountId),
      auditStatement(env.DB, { at: iso, adminUserId: actorId, action: 'customer.activate', licenseId: accountId, targetUserId: c.user_id }),
    ]);
    changed = (r[0].meta.changes ?? 0) > 0;
  } else {
    const days = b.days;
    if (!Number.isInteger(days) || (days as number) < HUB_TRIAL_EXTENSION.minDays || (days as number) > HUB_TRIAL_EXTENSION.maxDays) {
      return apiError(400, 'INVALID_REQUEST', `Informe de ${HUB_TRIAL_EXTENSION.minDays} a ${HUB_TRIAL_EXTENSION.maxDays} dias.`);
    }
    if (!c.trial_days) return apiError(409, 'NOT_A_TRIAL', 'Esta conta não está em teste (licença sem prazo).');
    if (c.status === 'revoked') return apiError(409, 'INVALID_REQUEST', 'Desbloqueie a conta antes de estender o teste.');
    await extendTrial(env.DB, { iso, actorId, licenseId: accountId, targetUserId: c.user_id, days: days as number });
    changed = true;
  }

  await pruneAudit(env.DB, addMs(iso, -AUDIT_RETENTION_DAYS * DAY));
  const after = await getCustomer(env.DB, accountId);
  if (!after) return notFound();
  const result: HubAccountActionResult = { contract: HUB_CONTRACT_VERSION, system: SYSTEM, account: toHubAccount(after, iso), changed };
  return json(result);
}
