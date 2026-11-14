/**
 * Exclusão de conta a pedido do titular (LGPD, art. 18, VI). Este módulo SÓ GERA SQL; nunca executa nada.
 * Procedimento, decisões de retenção e ordem de execução: docs/EXCLUSAO_DE_CONTA.md.
 *
 * Política aplicada:
 *  - APAGADO: dados comerciais (ingredientes, receitas, embalagens, encomendas, itens, recebimentos), configurações
 *    (nome/telefone do negócio), estado de sincronização, sessões, códigos de login, links públicos de orçamento, contadores
 *    de limite ligados à licença e ao e-mail, e o usuário.
 *  - ANONIMIZADO: a licença (sem e-mail e sem usuário; status revogado, rótulo "conta excluída"). Fica só o identificador
 *    opaco, porque a auditoria administrativa (retenção de 365 dias, segurança) aponta para ele.
 *  - MANTIDO: a auditoria administrativa (ações, horários e identificadores opacos; o e-mail só aparecia por junção com a licença).
 *  - RECUSADO: conta com administração ativa (revogue o admin antes, conscientemente). O SQL vira "nada a fazer" nesse caso.
 * Idempotente: repetir não muda nada. Os dados que ficaram no aparelho do titular não são alcançados pelo servidor.
 */
import { normalizeEmail, sha256Hex } from '../src/accounts';

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type ErasureSql = { email: string; preview: string; erase: string };

export async function accountErasureSql(rawEmail: string, nowIso: string): Promise<ErasureSql> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error('E-mail inválido.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(nowIso)) throw new Error('Data inválida.');
  const E = lit(email), NOW = lit(nowIso);
  // Usuário-alvo: o dono do e-mail, SE não tiver administração ativa (senão, nada casa e nenhum comando muda dados).
  const USER = `(SELECT u.id FROM users u WHERE u.email = ${E} AND NOT EXISTS (SELECT 1 FROM admins a WHERE a.user_id = u.id AND a.revoked_at IS NULL))`;
  const NOT_ADMIN = `NOT EXISTS (SELECT 1 FROM users u JOIN admins a ON a.user_id = u.id AND a.revoked_at IS NULL WHERE u.email = ${E})`;
  const LICENSES = `(SELECT id FROM licenses WHERE (user_id = ${USER} OR email = ${E}) AND ${NOT_ADMIN})`;
  const emailKey = lit(`e_${await sha256Hex(`email:${email}`)}`);
  const userTables = ['order_payments', 'order_items', 'orders', 'recipe_packaging_items', 'recipe_items', 'recipes', 'ingredients', 'packagings', 'sync_state', 'sessions'];

  const preview = [
    `-- PRÉVIA (somente leitura) da exclusão de ${email}. Confira antes de executar o arquivo de exclusão.`,
    `SELECT (SELECT COUNT(*) FROM users WHERE email = ${E}) AS usuarios,`,
    `  (SELECT COUNT(*) FROM users u JOIN admins a ON a.user_id = u.id AND a.revoked_at IS NULL WHERE u.email = ${E}) AS admin_ativo,`,
    `  (SELECT COUNT(*) FROM licenses WHERE email = ${E} OR user_id = (SELECT id FROM users WHERE email = ${E})) AS licencas,`,
    `  (SELECT COUNT(*) FROM quotes WHERE owner_id IN (SELECT id FROM licenses WHERE email = ${E} OR user_id = (SELECT id FROM users WHERE email = ${E}))) AS links_publicos,`,
    ...userTables.map((t, i) => `  (SELECT COUNT(*) FROM ${t} WHERE user_id = (SELECT id FROM users WHERE email = ${E})) AS ${t}${i === userTables.length - 1 ? ',' : ','}`),
    `  (SELECT COUNT(*) FROM auth_codes WHERE email = ${E}) AS auth_codes;`,
  ].join('\n');

  const erase = [
    `-- EXCLUSÃO da conta ${email} (gerado em ${nowIso}). Recusa contas com administração ativa (nada muda). Idempotente.`,
    `-- Execute SÓ depois do backup e da prévia: veja docs/EXCLUSAO_DE_CONTA.md.`,
    `DELETE FROM quotes WHERE owner_id IN ${LICENSES};`,
    `DELETE FROM rate_limits WHERE license_id IN ${LICENSES} OR (license_id = ${emailKey} AND ${NOT_ADMIN});`,
    ...userTables.map(t => `DELETE FROM ${t} WHERE user_id = ${USER};`),
    `DELETE FROM auth_codes WHERE email = ${E} AND ${NOT_ADMIN};`,
    `UPDATE licenses SET email = NULL, user_id = NULL, label = 'conta excluída', status = 'revoked', revoked_at = COALESCE(revoked_at, ${NOW}) WHERE id IN ${LICENSES};`,
    `DELETE FROM users WHERE id = ${USER};`,
  ].join('\n');
  return { email, preview, erase };
}
