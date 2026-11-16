import { addMs, normalizeEmail } from './accounts';
import { activeSessionsOf, auditStatement, metrics, AUDIT_PAGE_MAX, AUDIT_RETENTION_DAYS, CUSTOMERS_PAGE_MAX, getActiveAdmin, getCustomer, listAudit, listCustomers, overview, PAGE_DEFAULT, pruneAudit } from './adminStore';
import { apiError, json, readJsonBody } from './http';
import { generateLicenseId, generateLicenseKey, hashLicenseKey, LICENSE_ID_PATTERN } from './licenses';
import { LABEL_PATTERN } from './licenseAdmin';
import { cleanPersonName, PERSON_NAME_MAX } from '../../shared/personName';
import { checkCsrf, resolveSession, type SessionEnv } from './session';
import { consumeRateLimit, windowCount } from './store';
import { EMAIL_BUDGET_SCOPE, emailDailyLimit, GLOBAL_EMAIL_KEY } from './authRoutes';
import { aiDailyLimit, aiUsedToday, publicTicket, SUPPORT_LIMITS, type SupportEnv } from './supportRoutes';
import { randomToken } from './accounts';

export type AdminDeps = { now: () => Date };
export const ADMIN_RATE = { readPerMinute: 120, writePerMinute: 30 } as const;
const SESSION_ID = /^ses_[0-9a-f]{16}$/;
const CURSOR = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|(lic_[0-9a-f]{16})$/;
const DAY = 86_400_000;

type Admin = { userId: string; email: string };
type Gate = { ok: true; admin: Admin } | { ok: false; response: Response };

/**
 * Autorização de TODA rota administrativa, feita no servidor e só com o que o servidor sabe:
 * sessão (cookie HttpOnly) → conta não desativada → licença ativa → linha ativa em `admins` → CSRF (se altera dados) → limite de taxa.
 * Nada vindo do corpo, de cabeçalhos personalizados ou do frontend (role, e-mail, flags) conta como prova de permissão.
 * Quem não é administrador recebe sempre o mesmo 403, sem pistas.
 */
async function authorizeAdmin(request: Request, env: SessionEnv, deps: AdminDeps, write: boolean): Promise<Gate> {
  const r = await resolveSession(request, env, deps.now());
  if (!r.ok) return { ok: false, response: apiError(r.status, r.error, r.message) };
  const forbidden = () => ({ ok: false as const, response: apiError(403, 'FORBIDDEN', 'Acesso negado.') });
  if (!r.ctx.license || r.ctx.license.status !== 'active') return forbidden(); // conta suspensa perde as permissões administrativas
  if (!(await getActiveAdmin(env.DB, r.ctx.user.id))) return forbidden();
  if (write) { const c = checkCsrf(request, env, r.ctx.session); if (c) return { ok: false, response: apiError(c.status, c.error, c.message) }; }
  const rate = await consumeRateLimit(env.DB, `adm_${r.ctx.user.id}`, write ? 'admin-write' : 'admin-read', write ? ADMIN_RATE.writePerMinute : ADMIN_RATE.readPerMinute, 60, deps.now().getTime());
  if (!rate.allowed) return { ok: false, response: apiError(429, 'RATE_LIMITED', 'Muitas requisições. Aguarde um instante.', { 'Retry-After': String(rate.retryAfterSeconds) }) };
  return { ok: true, admin: { userId: r.ctx.user.id, email: r.ctx.user.email } };
}

const pageSize = (raw: string | null, max: number) => { const n = Number(raw); return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : PAGE_DEFAULT; };
const publicCustomer = (c: { id: string; email: string; label: string | null; holder_name: string | null; status: string; created_at: string; revoked_at: string | null; user_id: string | null; last_seen_at: string | null; is_admin: number; trial_days: number | null; expires_at: string | null }) =>
  ({ id: c.id, email: c.email, label: c.label, name: c.holder_name, status: c.status, createdAt: c.created_at, suspendedAt: c.revoked_at, accountId: c.user_id, lastAccessAt: c.last_seen_at, isAdmin: c.is_admin > 0, trialDays: c.trial_days, trialEndsAt: c.expires_at });
const publicAudit = (a: Awaited<ReturnType<typeof listAudit>>[number]) => ({ id: a.id, at: a.at, action: a.action, result: a.result, detail: a.detail, admin: a.admin_email ?? (a.admin_user_id === 'cli' ? 'terminal (bootstrap)' : null), licenseId: a.license_id, customerEmail: a.license_email });

/** Roteador /api/admin/*. Devolve undefined se a rota não for administrativa. */
export async function adminRoute(request: Request, env: SessionEnv & SupportEnv, deps: AdminDeps, pathname: string): Promise<Response | undefined> {
  if (!pathname.startsWith('/api/admin/') && pathname !== '/api/admin') return undefined;
  const path = pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const iso = deps.now().toISOString();
  const write = method !== 'GET' && method !== 'HEAD';
  if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') return apiError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');

  const m = path.match(/^\/api\/admin\/customers\/(lic_[0-9a-f]{16})(?:\/(suspend|activate|sessions|trial|name|email)(?:\/(revoke-all|extend|permanent|until|ses_[0-9a-f]{16}))?)?$/);
  const sup = path.match(/^\/api\/admin\/support(?:\/(stk_[A-Za-z0-9_-]{12})\/(reply|close))?$/);
  const known = !!sup || path === '/api/admin/me' || path === '/api/admin/overview' || path === '/api/admin/metrics' || path === '/api/admin/customers' || path === '/api/admin/audit' || m;
  if (!known) return apiError(404, 'NOT_FOUND', 'Rota não encontrada.');
  const gate = await authorizeAdmin(request, env, deps, write);
  if (!gate.ok) return gate.response;
  const admin = gate.admin;

  // `clientIpReceived`: diagnóstico do limite por IP — diz SÓ se o IP real chegou ao Worker (pelo Service Binding), nunca o valor.
  // Falso em produção = todos os clientes dividiriam o mesmo contador por IP ("unknown"): investigar antes de ampliar o beta.
  if (path === '/api/admin/me' && method === 'GET') return json({ admin: true, email: admin.email, clientIpReceived: request.headers.has('cf-connecting-ip') });

  if (path === '/api/admin/overview' && method === 'GET') {
    const o = await overview(env.DB, iso, addMs(iso, -30 * DAY), addMs(iso, -7 * DAY));
    return json({ generatedAt: iso, customers: { total: o?.total ?? 0, active: o?.active ?? 0, suspended: o?.suspended ?? 0, pendingFirstLogin: o?.pending_first_login ?? 0, new30d: o?.new_30d ?? 0 }, activeSessions: o?.active_sessions ?? 0, recentUsers7d: o?.recent_users_7d ?? 0 });
  }

  // Suporte: conversas dos clientes (dúvidas, sugestões, reclamações). A equipe lê, responde e encerra.
  if (sup && !sup[1] && method === 'GET') {
    const status = url.searchParams.get('status');
    const filter = status === 'open' ? "WHERE t.status = 'open'" : '';
    const rows = (await env.DB.prepare(`SELECT t.id, t.kind, t.status, t.created_at, t.updated_at, t.unread_for_user, u.email, l.holder_name
       FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN licenses l ON l.user_id = t.user_id ${filter} ORDER BY t.updated_at DESC LIMIT 50`).bind().all<{ id: string; kind: 'question' | 'suggestion' | 'complaint'; status: 'open' | 'answered' | 'closed'; created_at: string; updated_at: string; unread_for_user: number; email: string | null; holder_name: string | null }>()).results;
    const ids = rows.map(r => r.id);
    const msgs = ids.length ? (await env.DB.prepare(`SELECT id, ticket_id, author, body, created_at FROM support_messages WHERE ticket_id IN (${ids.map((_, i) => `?${i + 1}`).join(',')}) ORDER BY rowid`).bind(...ids).all<{ id: string; ticket_id: string; author: 'user' | 'ai' | 'team'; body: string; created_at: string }>()).results : [];
    const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE status = 'open'").bind().first<{ n: number }>();
    return json({ openCount: open?.n ?? 0, tickets: rows.map(r => ({ ...publicTicket(r, msgs.filter(x => x.ticket_id === r.id)), customer: { email: r.email, name: r.holder_name } })) });
  }
  if (sup && sup[1] && method === 'POST') {
    const id = sup[1];
    const t = await env.DB.prepare('SELECT id FROM support_tickets WHERE id = ?').bind(id).first<{ id: string }>();
    if (!t) return apiError(404, 'NOT_FOUND', 'Conversa não encontrada.');
    if (sup[2] === 'close') {
      await env.DB.prepare("UPDATE support_tickets SET status = 'closed', updated_at = ?1 WHERE id = ?2").bind(iso, id).run();
      return json({ id, status: 'closed' });
    }
    const body = await readJsonBody(request, 8192);
    if (!body.ok) return apiError(body.status, body.error, 'Corpo da requisição inválido.');
    const raw = (body.data as { message?: unknown } | null)?.message;
    const text = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : '';
    if (!text || text.length > SUPPORT_LIMITS.bodyMax) return apiError(400, 'INVALID_REQUEST', `Escreva a resposta (até ${SUPPORT_LIMITS.bodyMax} caracteres).`);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO support_messages (id, ticket_id, author, body, created_at) VALUES (?1, ?2, 'team', ?3, ?4)").bind(`smg_${randomToken(9)}`, id, text, iso),
      env.DB.prepare("UPDATE support_tickets SET status = 'answered', unread_for_user = 1, updated_at = ?1 WHERE id = ?2").bind(iso, id),
    ]);
    return json({ id, status: 'answered' });
  }

  if (path === '/api/admin/metrics' && method === 'GET') {
    // 12 semanas (segunda a domingo, UTC), da mais antiga à atual.
    const WEEKS = 12;
    const dow = (new Date(iso).getUTCDay() + 6) % 7; // 0 = segunda
    const thisMonday = addMs(`${iso.slice(0, 10)}T00:00:00.000Z`, -dow * DAY).slice(0, 10);
    const starts = Array.from({ length: WEEKS }, (_, i) => addMs(`${thisMonday}T00:00:00.000Z`, -(WEEKS - 1 - i) * 7 * DAY).slice(0, 10));
    const m = await metrics(env.DB, iso, `${starts[0]}T00:00:00.000Z`);
    const bucket = (rows: { d: string; n: number }[]) => starts.map((s, i) => rows.filter(r => r.d >= s && (i === WEEKS - 1 || r.d < starts[i + 1])).reduce((a, r) => a + r.n, 0));
    const [signups, firstLogins, quotes, orders] = [bucket(m.lic), bucket(m.firsts), bucket(m.quotes), bucket(m.orders)];
    const n = (v: number | null | undefined) => v ?? 0;
    return json({
      generatedAt: iso,
      weeks: starts.map((start, i) => ({ start, signups: signups[i], firstLogins: firstLogins[i], quotes: quotes[i], orders: orders[i] })),
      activeUsers: { d1: n(m.activity?.d1), d7: n(m.activity?.d7), d30: n(m.activity?.d30) },
      licenses: { permanent: n(m.status?.permanent), trialRunning: n(m.status?.trial_running), trialEnding: n(m.status?.trial_ending), trialEnded: n(m.status?.trial_ended), trialNotStarted: n(m.status?.trial_not_started), suspended: n(m.status?.suspended) },
      // Uso real que o próprio banco registra: e-mails de login enviados hoje (o contador que segura a cota do Resend).
      supportAi: { today: await aiUsedToday(env, Date.parse(iso)), dailyLimit: aiDailyLimit(env), provider: env.SUPPORT_AI_PROVIDER === 'anthropic' ? 'anthropic' : 'workers-ai' },
      email: { today: await windowCount(env.DB, GLOBAL_EMAIL_KEY, EMAIL_BUDGET_SCOPE, 86_400, Date.parse(iso)), dailyLimit: emailDailyLimit(env as Parameters<typeof emailDailyLimit>[0]) },
      funnel: { registered: n(m.funnel?.registered), loggedIn: n(m.funnel?.logged_in), withOrders: n(m.funnel?.with_orders), active7d: n(m.funnel?.active_7d) },
    });
  }

  if (path === '/api/admin/customers' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
    const status = url.searchParams.get('status');
    if (status !== null && status !== 'active' && status !== 'revoked') return apiError(400, 'INVALID_REQUEST', 'Filtro de situação inválido.');
    const cur = url.searchParams.get('cursor'); const cm = cur ? CURSOR.exec(cur) : null;
    if (cur && !cm) return apiError(400, 'INVALID_REQUEST', 'Cursor inválido.');
    const limit = pageSize(url.searchParams.get('limit'), CUSTOMERS_PAGE_MAX);
    const rows = await listCustomers(env.DB, { q: q || undefined, status: status ?? undefined, cursor: cm ? { createdAt: cm[1], id: cm[2] } : undefined, limit, nowIso: iso });
    const page = rows.slice(0, limit); const last = page[page.length - 1];
    return json({ customers: page.map(c => ({ ...publicCustomer(c), activeSessions: c.active_sessions })), nextCursor: rows.length > limit && last ? `${last.created_at}|${last.id}` : null });
  }

  if (path === '/api/admin/customers' && method === 'POST') {
    const body = await readJsonBody(request, 2048);
    if (!body.ok) return apiError(body.status, body.error, 'Corpo da requisição inválido.');
    const b = (body.data ?? {}) as { email?: unknown; name?: unknown; label?: unknown; quotaActive?: unknown; quotaDaily?: unknown; trialDays?: unknown };
    const email = normalizeEmail(b.email);
    if (!email) return apiError(400, 'INVALID_EMAIL', 'Informe um e-mail válido.');
    const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim() : null;
    if (b.label !== undefined && b.label !== null && (typeof b.label !== 'string' || (label !== null && !LABEL_PATTERN.test(label)))) return apiError(400, 'INVALID_REQUEST', 'Rótulo inválido (até 60 letras, números e . _ @ # , ( ) - /).');
    // Nome da pessoa (para o app falar com ela pelo nome). Opcional na API (CLI e cadastros antigos); o painel exige.
    const holderName = b.name === undefined || b.name === null || b.name === '' ? null : cleanPersonName(b.name);
    if (holderName === null && b.name !== undefined && b.name !== null && b.name !== '') return apiError(400, 'INVALID_NAME', `Nome inválido (até ${PERSON_NAME_MAX} letras, espaços, apóstrofo, ponto e hífen).`);
    const quota = (v: unknown, d: number) => (v === undefined ? d : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10_000 ? (v as number) : NaN);
    const quotaActive = quota(b.quotaActive, 100), quotaDaily = quota(b.quotaDaily, 30);
    if (Number.isNaN(quotaActive) || Number.isNaN(quotaDaily)) return apiError(400, 'INVALID_REQUEST', 'Cotas devem ser inteiros entre 0 e 10.000.');
    // Teste: null/ausente = licença sem prazo; senão 1 a 365 dias, contados a partir do primeiro acesso.
    const trialDays = b.trialDays === undefined || b.trialDays === null ? null : Number.isInteger(b.trialDays) && (b.trialDays as number) >= 1 && (b.trialDays as number) <= 365 ? (b.trialDays as number) : NaN;
    if (Number.isNaN(trialDays)) return apiError(400, 'INVALID_REQUEST', 'Dias de teste devem ser um inteiro entre 1 e 365.');
    // Idempotente: já existe licença para o e-mail → nada é criado (sem duplicidade, sem sobrescrever) e a resposta aponta a existente.
    const id = generateLicenseId();
    const results = await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO licenses (id, key_hash, label, email, status, quota_active, quota_daily, created_at, trial_days, holder_name) VALUES (?, ?, ?, ?, \'active\', ?, ?, ?, ?, ?)').bind(id, await hashLicenseKey(generateLicenseKey()), label, email, quotaActive, quotaDaily, iso, trialDays, holderName),
      auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'customer.create', licenseId: id, detailSql: "CASE WHEN changes() > 0 THEN 'created' ELSE 'already-exists' END" }),
    ]);
    await pruneAudit(env.DB, addMs(iso, -AUDIT_RETENTION_DAYS * DAY));
    const created = (results[0].meta.changes ?? 0) > 0;
    if (created) return json({ created: true, id, email }, 201);
    const existing = await env.DB.prepare('SELECT id, status FROM licenses WHERE email = ?').bind(email).first<{ id: string; status: string }>();
    return json({ created: false, id: existing?.id ?? null, status: existing?.status ?? null, email }, 200);
  }

  if (path === '/api/admin/audit' && method === 'GET') {
    const licenseId = url.searchParams.get('licenseId');
    if (licenseId !== null && !LICENSE_ID_PATTERN.test(licenseId)) return apiError(400, 'INVALID_REQUEST', 'Identificador inválido.');
    const cur = url.searchParams.get('cursor');
    if (cur !== null && !/^\d{1,12}$/.test(cur)) return apiError(400, 'INVALID_REQUEST', 'Cursor inválido.');
    const limit = pageSize(url.searchParams.get('limit'), AUDIT_PAGE_MAX);
    const rows = await listAudit(env.DB, { licenseId: licenseId ?? undefined, beforeId: cur !== null ? Number(cur) : undefined, limit });
    const page = rows.slice(0, limit);
    return json({ events: page.map(publicAudit), nextCursor: rows.length > limit ? String(page[page.length - 1].id) : null });
  }

  if (m) {
    const licenseId = m[1]; const sub = m[2]; const arg = m[3];
    const c = await getCustomer(env.DB, licenseId);
    if (!c) return apiError(404, 'NOT_FOUND', 'Cliente não encontrado.');

    if (!sub && method === 'GET') {
      const sessions = c.user_id ? await activeSessionsOf(env.DB, c.user_id, iso) : [];
      const history = await listAudit(env.DB, { licenseId, limit: 20 });
      return json({
        customer: { ...publicCustomer(c), quotaActive: c.quota_active, quotaDaily: c.quota_daily, emailVerifiedAt: c.email_verified_at, accountCreatedAt: c.user_created_at, accountDisabledAt: c.disabled_at },
        sessions: sessions.map(s => ({ id: s.id, deviceLabel: s.device_label, createdAt: s.created_at, lastSeenAt: s.last_seen_at, expiresAt: s.expires_at })),
        history: history.slice(0, 20).map(publicAudit), historyHasMore: history.length > 20,
      });
    }

    // Ações que alteram dados: o e-mail do cliente precisa ser digitado de novo (confirmação checada NO SERVIDOR, além da tela).
    const needsConfirm = (sub === 'suspend') || (sub === 'sessions' && arg === 'revoke-all');
    if (write && needsConfirm) {
      const body = await readJsonBody(request, 2048);
      if (!body.ok) return apiError(body.status, body.error, 'Corpo da requisição inválido.');
      if (normalizeEmail((body.data as { confirmEmail?: unknown } | null)?.confirmEmail) !== c.email) return apiError(400, 'CONFIRMATION_MISMATCH', 'A confirmação não confere com o e-mail do cliente.');
    }
    // Contas administrativas não são suspensas nem desconectadas pelo painel (evita travar o próprio proprietário).
    if (c.is_admin > 0 && (sub === 'suspend' || sub === 'sessions')) return apiError(409, 'ADMIN_ACCOUNT', 'Contas administrativas não são gerenciadas por este painel.');

    const prune = () => pruneAudit(env.DB, addMs(iso, -AUDIT_RETENTION_DAYS * DAY));
    if (sub === 'suspend' && method === 'POST') {
      const r = await env.DB.batch([
        env.DB.prepare("UPDATE licenses SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'").bind(iso, licenseId),
        auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'customer.suspend', licenseId, targetUserId: c.user_id }),
      ]); await prune();
      return json({ id: licenseId, status: 'revoked', changed: (r[0].meta.changes ?? 0) > 0 });
    }
    if (sub === 'activate' && method === 'POST') {
      const r = await env.DB.batch([
        env.DB.prepare("UPDATE licenses SET status = 'active', revoked_at = NULL WHERE id = ? AND status = 'revoked'").bind(licenseId),
        auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'customer.activate', licenseId, targetUserId: c.user_id }),
      ]); await prune();
      return json({ id: licenseId, status: 'active', changed: (r[0].meta.changes ?? 0) > 0 });
    }
    // Teste: prorrogar N dias (a partir do fim atual, ou de agora se já venceu) ou tornar a licença permanente (sem prazo).
    if (sub === 'trial' && arg === 'extend' && method === 'POST') {
      const body = await readJsonBody(request, 512);
      const days = body.ok ? (body.data as { days?: unknown } | null)?.days : undefined;
      if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 365) return apiError(400, 'INVALID_REQUEST', 'Informe de 1 a 365 dias.');
      if (!c.trial_days) return apiError(409, 'NOT_A_TRIAL', 'Esta licença não é de teste.');
      const r = await env.DB.batch([
        env.DB.prepare(`UPDATE licenses SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', CASE WHEN expires_at IS NULL OR expires_at < ?1 THEN ?1 ELSE expires_at END, '+' || ?2 || ' days'),
            trial_days = trial_days + ?2 WHERE id = ?3 AND trial_days IS NOT NULL AND (expires_at IS NOT NULL OR user_id IS NOT NULL)`).bind(iso, days, licenseId),
        auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'customer.trial-extend', licenseId, targetUserId: c.user_id, detailSql: `'+${days as number} dias'` }),
      ]); await prune();
      // Ainda não entrou: o prazo nem começou; só aumenta os dias que vão contar a partir do primeiro acesso.
      if ((r[0].meta.changes ?? 0) === 0) await env.DB.prepare('UPDATE licenses SET trial_days = trial_days + ?1 WHERE id = ?2 AND trial_days IS NOT NULL').bind(days, licenseId).run();
      const now = await env.DB.prepare('SELECT trial_days, expires_at FROM licenses WHERE id = ?').bind(licenseId).first<{ trial_days: number; expires_at: string | null }>();
      return json({ id: licenseId, trialDays: now?.trial_days ?? null, trialEndsAt: now?.expires_at ?? null });
    }
    if (sub === 'name' && !arg && method === 'POST') {
      const body = await readJsonBody(request, 1024);
      if (!body.ok) return apiError(body.status, body.error, 'Corpo da requisição inválido.');
      const name = cleanPersonName((body.data as { name?: unknown } | null)?.name);
      if (!name) return apiError(400, 'INVALID_NAME', `Nome inválido (até ${PERSON_NAME_MAX} letras, espaços, apóstrofo, ponto e hífen).`);
      const r = await env.DB.batch([
        env.DB.prepare('UPDATE licenses SET holder_name = ?1 WHERE id = ?2 AND holder_name IS NOT ?1').bind(name, licenseId),
        auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'customer.rename', licenseId, targetUserId: c.user_id }),
      ]); await prune();
      return json({ id: licenseId, name, changed: (r[0].meta.changes ?? 0) > 0 });
    }
    // Troca do e-mail (pedido do cliente): muda o e-mail da licença e da conta juntos. Exige digitar o e-mail ATUAL (conferido aqui).
    // Os dados, os dispositivos conectados e o histórico continuam; o próximo login usa o e-mail novo. Códigos pendentes do e-mail antigo são anulados.
    if (sub === 'email' && !arg && method === 'POST') {
      const body = await readJsonBody(request, 1024);
      if (!body.ok) return apiError(body.status, body.error, 'Corpo da requisição inválido.');
      const b = (body.data ?? {}) as { email?: unknown; confirmEmail?: unknown };
      if (normalizeEmail(b.confirmEmail) !== c.email) return apiError(400, 'CONFIRMATION_MISMATCH', 'Para confirmar, digite o e-mail atual do cliente.');
      const next = normalizeEmail(b.email);
      if (!next) return apiError(400, 'INVALID_EMAIL', 'Informe um e-mail válido.');
      if (next === c.email) return json({ id: licenseId, email: next, changed: false });
      const taken = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM licenses WHERE email = ?1) + (SELECT COUNT(*) FROM users WHERE email = ?1) AS n').bind(next).first<{ n: number }>();
      if ((taken?.n ?? 0) > 0) return apiError(409, 'EMAIL_IN_USE', 'Este e-mail já está cadastrado em outra conta.');
      try {
        await env.DB.batch([
          env.DB.prepare('UPDATE licenses SET email = ?1 WHERE id = ?2 AND email = ?3').bind(next, licenseId, c.email),
          ...(c.user_id ? [env.DB.prepare('UPDATE users SET email = ?1 WHERE id = ?2').bind(next, c.user_id)] : []),
          env.DB.prepare('UPDATE auth_codes SET used_at = ?1 WHERE email = ?2 AND used_at IS NULL').bind(iso, c.email),
          auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'customer.email-change', licenseId, targetUserId: c.user_id }),
        ]);
      } catch { return apiError(409, 'EMAIL_IN_USE', 'Este e-mail já está cadastrado em outra conta.'); } // UNIQUE: corrida com outro cadastro
      await prune();
      return json({ id: licenseId, email: next, changed: true });
    }
    // Prazo da licença numa data escolhida (vale até o fim do dia, horário de Brasília). Serve também para dar prazo a uma licença permanente.
    if (sub === 'trial' && arg === 'until' && method === 'POST') {
      const body = await readJsonBody(request, 512);
      if (!body.ok) return apiError(body.status, body.error, 'Corpo da requisição inválido.');
      const date = (body.data as { date?: unknown } | null)?.date;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return apiError(400, 'INVALID_REQUEST', 'Data inválida.');
      const endsAt = new Date(`${date}T23:59:59.999-03:00`).toISOString();
      if (endsAt <= iso) return apiError(400, 'INVALID_REQUEST', 'Escolha uma data a partir de hoje. Para tirar o acesso agora, use "Suspender acesso".');
      if (endsAt > addMs(iso, 3 * 366 * DAY)) return apiError(400, 'INVALID_REQUEST', 'Escolha uma data em até 3 anos. Para não ter prazo, torne a licença permanente.');
      const days = Math.min(365, Math.max(1, Math.ceil((Date.parse(endsAt) - Date.parse(iso)) / DAY)));
      await env.DB.batch([
        env.DB.prepare('UPDATE licenses SET expires_at = ?1, trial_days = COALESCE(trial_days, ?2) WHERE id = ?3').bind(endsAt, days, licenseId),
        auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'customer.trial-until', licenseId, targetUserId: c.user_id, detailSql: `'${date}'` }),
      ]); await prune();
      const now = await env.DB.prepare('SELECT trial_days, expires_at FROM licenses WHERE id = ?').bind(licenseId).first<{ trial_days: number; expires_at: string | null }>();
      return json({ id: licenseId, trialDays: now?.trial_days ?? null, trialEndsAt: now?.expires_at ?? null });
    }
    if (sub === 'trial' && arg === 'permanent' && method === 'POST') {
      const r = await env.DB.batch([
        env.DB.prepare('UPDATE licenses SET trial_days = NULL, expires_at = NULL WHERE id = ? AND (trial_days IS NOT NULL OR expires_at IS NOT NULL)').bind(licenseId),
        auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'customer.trial-permanent', licenseId, targetUserId: c.user_id }),
      ]); await prune();
      return json({ id: licenseId, changed: (r[0].meta.changes ?? 0) > 0 });
    }
    if (sub === 'sessions' && arg === 'revoke-all' && method === 'POST') {
      if (!c.user_id) return json({ id: licenseId, revoked: 0 });
      const r = await env.DB.batch([
        env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(iso, c.user_id),
        auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'session.revoke-all', licenseId, targetUserId: c.user_id, detailSql: "'sessions=' || changes()" }),
      ]); await prune();
      return json({ id: licenseId, revoked: r[0].meta.changes ?? 0 });
    }
    if (sub === 'sessions' && arg && SESSION_ID.test(arg) && method === 'DELETE') {
      if (!c.user_id) return apiError(404, 'NOT_FOUND', 'Sessão não encontrada.');
      // A sessão precisa pertencer à conta DESTE cliente (id de sessão de outra conta = 404, igual a inexistente).
      const r = await env.DB.batch([
        env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').bind(iso, arg, c.user_id),
        auditStatement(env.DB, { at: iso, adminUserId: admin.userId, action: 'session.revoke', licenseId, targetUserId: c.user_id }),
      ]); await prune();
      if ((r[0].meta.changes ?? 0) === 0) return apiError(404, 'NOT_FOUND', 'Sessão não encontrada ou já encerrada.');
      return json({ id: licenseId, revoked: arg });
    }
    return apiError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
  }
  return apiError(404, 'NOT_FOUND', 'Rota não encontrada.');
}
