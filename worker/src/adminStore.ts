import type { BoundStatement, D1Like } from './store';

/** Consultas do painel administrativo. Todas parametrizadas; nenhuma lê receitas, ingredientes, encomendas, orçamentos, tokens ou códigos. */
export const AUDIT_RETENTION_DAYS = 365;
/** Autor das ações feitas pelo Dabi Hub na auditoria: `hub:<e-mail de quem agiu no hub>`. */
export const HUB_ACTOR_PREFIX = 'hub:';
export const PAGE_DEFAULT = 25;
export const CUSTOMERS_PAGE_MAX = 50;
export const AUDIT_PAGE_MAX = 100;

export type AdminRow = { user_id: string; role: string; granted_at: string; granted_by: string; revoked_at: string | null };
export const getActiveAdmin = (db: D1Like, userId: string) => db.prepare('SELECT user_id, role, granted_at, granted_by, revoked_at FROM admins WHERE user_id = ? AND revoked_at IS NULL').bind(userId).first<AdminRow>();

export type Overview = { total: number; active: number; suspended: number; pending_first_login: number; new_30d: number; active_sessions: number; recent_users_7d: number };
/** UMA consulta agregada (leituras por índice/contagem); sem polling, sem estimativas. */
export const overview = (db: D1Like, nowIso: string, since30: string, since7: string) => db.prepare(
  `SELECT
     (SELECT COUNT(*) FROM licenses WHERE email IS NOT NULL) AS total,
     (SELECT COUNT(*) FROM licenses WHERE email IS NOT NULL AND status = 'active') AS active,
     (SELECT COUNT(*) FROM licenses WHERE email IS NOT NULL AND status = 'revoked') AS suspended,
     (SELECT COUNT(*) FROM licenses WHERE email IS NOT NULL AND user_id IS NULL) AS pending_first_login,
     (SELECT COUNT(*) FROM licenses WHERE email IS NOT NULL AND created_at >= ?2) AS new_30d,
     (SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL AND expires_at > ?1) AS active_sessions,
     (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE last_seen_at >= ?3) AS recent_users_7d`,
).bind(nowIso, since30, since7).first<Overview>();

export type CustomerRow = { id: string; email: string; label: string | null; status: 'active' | 'revoked'; created_at: string; revoked_at: string | null; user_id: string | null; active_sessions: number; last_seen_at: string | null; is_admin: number; trial_days: number | null; expires_at: string | null; holder_name: string | null };
const escapeLike = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`);

/** Paginação por cursor (created_at, id): custo constante por página, sem OFFSET e sem carregar a tabela inteira. */
export async function listCustomers(db: D1Like, o: { q?: string; status?: 'active' | 'revoked'; cursor?: { createdAt: string; id: string }; limit: number; nowIso: string }): Promise<CustomerRow[]> {
  const where: string[] = ['l.email IS NOT NULL']; const args: unknown[] = [o.nowIso];
  if (o.status) { where.push(`l.status = ?${args.push(o.status)}`); }
  if (o.q) { const p = `%${escapeLike(o.q.toLowerCase())}%`; where.push(`(l.email LIKE ?${args.push(p)} ESCAPE '\\' OR lower(COALESCE(l.label, '')) LIKE ?${args.push(p)} ESCAPE '\\' OR lower(COALESCE(l.holder_name, '')) LIKE ?${args.push(p)} ESCAPE '\\')`); }
  if (o.cursor) { const a = args.push(o.cursor.createdAt), b = args.push(o.cursor.id); where.push(`(l.created_at < ?${a} OR (l.created_at = ?${a} AND l.id < ?${b}))`); }
  const lim = args.push(o.limit + 1);
  const r = await db.prepare(
    `SELECT l.id, l.email, l.label, l.status, l.created_at, l.revoked_at, l.user_id, l.trial_days, l.expires_at, l.holder_name,
       (SELECT COUNT(*) FROM sessions s WHERE s.user_id = l.user_id AND s.revoked_at IS NULL AND s.expires_at > ?1) AS active_sessions,
       (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = l.user_id) AS last_seen_at,
       (SELECT COUNT(*) FROM admins a WHERE a.user_id = l.user_id AND a.revoked_at IS NULL) AS is_admin
     FROM licenses l WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC, l.id DESC LIMIT ?${lim}`,
  ).bind(...args).all<CustomerRow>();
  return r.results;
}

export const getCustomer = (db: D1Like, licenseId: string) => db.prepare(
  `SELECT l.id, l.email, l.label, l.status, l.quota_active, l.quota_daily, l.created_at, l.revoked_at, l.user_id, l.trial_days, l.expires_at, l.holder_name,
     u.email_verified_at, u.created_at AS user_created_at, u.disabled_at,
     (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = l.user_id) AS last_seen_at,
     (SELECT COUNT(*) FROM admins a WHERE a.user_id = l.user_id AND a.revoked_at IS NULL) AS is_admin
   FROM licenses l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = ?1 AND l.email IS NOT NULL`,
).bind(licenseId).first<{ id: string; email: string; label: string | null; status: 'active' | 'revoked'; quota_active: number; quota_daily: number; created_at: string; revoked_at: string | null; user_id: string | null; email_verified_at: string | null; user_created_at: string | null; disabled_at: string | null; last_seen_at: string | null; is_admin: number; trial_days: number | null; expires_at: string | null; holder_name: string | null }>();

export type SessionSummary = { id: string; device_label: string | null; created_at: string; last_seen_at: string; expires_at: string };
/** Nunca seleciona token_hash nem csrf_token. */
export async function activeSessionsOf(db: D1Like, userId: string, nowIso: string): Promise<SessionSummary[]> {
  return (await db.prepare('SELECT id, device_label, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at').bind(userId, nowIso).all<SessionSummary>()).results;
}

export type AuditRow = { id: number; at: string; action: string; result: string; detail: string | null; license_id: string | null; admin_email: string | null; admin_user_id: string; license_email: string | null };
export async function listAudit(db: D1Like, o: { licenseId?: string; beforeId?: number; limit: number }): Promise<AuditRow[]> {
  const where: string[] = []; const args: unknown[] = [];
  if (o.licenseId) where.push(`a.license_id = ?${args.push(o.licenseId)}`);
  if (o.beforeId !== undefined) where.push(`a.id < ?${args.push(o.beforeId)}`);
  const lim = args.push(o.limit + 1);
  return (await db.prepare(
    `SELECT a.id, a.at, a.action, a.result, a.detail, a.license_id, a.admin_user_id, u.email AS admin_email, l.email AS license_email
     FROM admin_audit a LEFT JOIN users u ON u.id = a.admin_user_id LEFT JOIN licenses l ON l.id = a.license_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT ?${lim}`,
  ).bind(...args).all<AuditRow>()).results;
}

/** Instrução de auditoria. `resultSql` pode usar changes() da instrução anterior do mesmo lote (ação + auditoria atômicas). */
export const auditStatement = (db: D1Like, a: { at: string; adminUserId: string; action: string; licenseId?: string | null; targetUserId?: string | null; detailSql?: string }): BoundStatement =>
  db.prepare(
    `INSERT INTO admin_audit (at, admin_user_id, action, license_id, target_user_id, result, detail)
     VALUES (?1, ?2, ?3, ?4, ?5, CASE WHEN changes() > 0 THEN 'ok' ELSE 'noop' END, ${a.detailSql ?? 'NULL'})`,
  ).bind(a.at, a.adminUserId, a.action, a.licenseId ?? null, a.targetUserId ?? null);
/** Retenção: apaga eventos com mais de 1 ano (consulta por índice; roda só em ações administrativas, que são raras). */
export const pruneAudit = (db: D1Like, cutoffIso: string) => db.prepare('DELETE FROM admin_audit WHERE at < ?').bind(cutoffIso).run();

/**
 * Métricas da Visão geral do painel (só contagens agregadas: nenhum dado de negócio dos clientes, como nomes ou valores).
 * Lê poucas linhas por tabela (cadastros/links/pedidos das últimas semanas agrupados por dia) e roda só quando um administrador abre a tela.
 */
export async function metrics(db: D1Like, nowIso: string, sinceIso: string) {
  const day = (iso: string) => iso.slice(0, 10);
  const since = day(sinceIso);
  const [lic, firsts, quotes, orders, status, activity, funnel] = await Promise.all([
    db.prepare("SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM licenses WHERE email IS NOT NULL AND created_at >= ?1 GROUP BY d").bind(since).all<{ d: string; n: number }>(),
    db.prepare('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM users WHERE created_at >= ?1 GROUP BY d').bind(since).all<{ d: string; n: number }>(),
    db.prepare('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM quotes WHERE created_at >= ?1 GROUP BY d').bind(since).all<{ d: string; n: number }>(),
    db.prepare('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM orders WHERE created_at >= ?1 GROUP BY d').bind(since).all<{ d: string; n: number }>(),
    db.prepare(`SELECT
        SUM(status = 'revoked') AS suspended,
        SUM(status = 'active' AND trial_days IS NULL AND expires_at IS NULL) AS permanent,
        SUM(status = 'active' AND trial_days IS NOT NULL AND expires_at IS NULL) AS trial_not_started,
        SUM(status = 'active' AND expires_at > ?1 AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '+3 days')) AS trial_running,
        SUM(status = 'active' AND expires_at > ?1 AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '+3 days')) AS trial_ending,
        SUM(status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?1) AS trial_ended
      FROM licenses WHERE email IS NOT NULL`).bind(nowIso).first<Record<string, number | null>>(),
    db.prepare(`SELECT
        (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-1 days')) AS d1,
        (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-7 days')) AS d7,
        (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-30 days')) AS d30`).bind(nowIso).first<{ d1: number; d7: number; d30: number }>(),
    db.prepare(`SELECT
        (SELECT COUNT(*) FROM licenses WHERE email IS NOT NULL) AS registered,
        (SELECT COUNT(*) FROM licenses WHERE email IS NOT NULL AND user_id IS NOT NULL) AS logged_in,
        (SELECT COUNT(DISTINCT l.user_id) FROM licenses l JOIN orders o ON o.user_id = l.user_id WHERE l.email IS NOT NULL) AS with_orders,
        (SELECT COUNT(DISTINCT l.user_id) FROM licenses l JOIN sessions s ON s.user_id = l.user_id WHERE l.email IS NOT NULL AND s.last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-7 days')) AS active_7d`).bind(nowIso).first<{ registered: number; logged_in: number; with_orders: number; active_7d: number }>(),
  ]);
  return { lic: lic.results, firsts: firsts.results, quotes: quotes.results, orders: orders.results, status, activity, funnel };
}

/**
 * Prorroga o teste em `days` dias: a partir do fim atual, ou de agora se já venceu. Se a pessoa ainda não entrou
 * (prazo não começou), só aumenta os dias que vão contar a partir do primeiro acesso. Ação e auditoria no mesmo lote.
 * Quem chama confere antes que a licença é de teste (`trial_days` não nulo) e que `days` é inteiro de 1 a 365.
 */
export async function extendTrial(db: D1Like, o: { iso: string; actorId: string; licenseId: string; targetUserId: string | null; days: number }) {
  if (!Number.isInteger(o.days) || o.days < 1 || o.days > 365) throw new Error('extendTrial: dias inválidos.');
  const r = await db.batch([
    db.prepare(`UPDATE licenses SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', CASE WHEN expires_at IS NULL OR expires_at < ?1 THEN ?1 ELSE expires_at END, '+' || ?2 || ' days'),
        trial_days = trial_days + ?2 WHERE id = ?3 AND trial_days IS NOT NULL AND (expires_at IS NOT NULL OR user_id IS NOT NULL)`).bind(o.iso, o.days, o.licenseId),
    auditStatement(db, { at: o.iso, adminUserId: o.actorId, action: 'customer.trial-extend', licenseId: o.licenseId, targetUserId: o.targetUserId, detailSql: `'+${o.days} dias'` }),
  ]);
  if ((r[0].meta.changes ?? 0) === 0) await db.prepare('UPDATE licenses SET trial_days = trial_days + ?1 WHERE id = ?2 AND trial_days IS NOT NULL').bind(o.days, o.licenseId).run();
  return db.prepare('SELECT trial_days, expires_at FROM licenses WHERE id = ?').bind(o.licenseId).first<{ trial_days: number; expires_at: string | null }>();
}
