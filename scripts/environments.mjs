// Fonte única dos ambientes publicáveis do Custô e das regras que impedem publicações inseguras.
// Nada aqui fala com a Cloudflare: são dados e validações locais, usados por scripts/pages.mjs e scripts/worker.mjs.
//
// Convenção de nomes (Etapa 13): recursos NOVOS usam o prefixo `dabi-custo`. Recursos que já existem e guardam dados
// continuam com o nome antigo (o Worker e o D1 de staging `dabi-orcamentos-staging`) — renomeá-los exigiria recriar o banco.
import { readFileSync } from 'node:fs';

export const PRODUCTION_URL = 'https://custo.dabitech.com.br';
export const STAGING_URL = 'https://dabi-custo-staging.pages.dev';
/** Endereço anterior do staging. Continua no ar durante a convivência (links públicos já enviados usam este host). */
export const LEGACY_STAGING_URL = 'https://dabi-preco-certo-staging.pages.dev';
const LOCAL_DEV_ORIGINS = ['http://localhost:5174', 'http://127.0.0.1:5174'];

/** Ambientes do Worker (seções `[env.*]` do worker/wrangler.toml). */
export const WORKER_ENVIRONMENTS = {
  staging: {
    worker: 'dabi-orcamentos-staging', d1: 'dabi-orcamentos-staging', appEnv: 'staging',
    /** Durante a convivência, o link público pode apontar para o endereço novo ou para o antigo. */
    publicBaseUrls: [STAGING_URL, LEGACY_STAGING_URL],
    /** Origens que precisam estar liberadas (sem elas, login e envio falham com 403 de CSRF). */
    requiredOrigins: [STAGING_URL, LEGACY_STAGING_URL],
    allowedExtraOrigins: LOCAL_DEV_ORIGINS,
    workersDev: true, releaseBranch: null, confirm: null, emailDisplayName: 'Custô',
  },
  production: {
    worker: 'dabi-custo-api', d1: 'dabi-custo-producao', appEnv: 'production',
    publicBaseUrls: [PRODUCTION_URL], requiredOrigins: [PRODUCTION_URL], allowedExtraOrigins: [],
    workersDev: false, releaseBranch: 'main', confirm: 'dabi-custo-api', emailDisplayName: 'Custô',
  },
};

/** Projetos Pages. Cada um aponta (por Service Binding `API`, configurado no projeto) para um ambiente de Worker. */
export const PAGES_ENVIRONMENTS = {
  staging: { project: 'dabi-custo-staging', branch: 'staging', url: STAGING_URL, workerEnv: 'staging', releaseBranch: null, confirm: null },
  /** Projeto antigo, preservado durante a convivência. Só para republicação de emergência; nunca é excluído por script. */
  'staging-legacy': { project: 'dabi-preco-certo-staging', branch: 'staging', url: LEGACY_STAGING_URL, workerEnv: 'staging', releaseBranch: null, confirm: null },
  production: { project: 'dabi-custo', branch: 'main', url: PRODUCTION_URL, workerEnv: 'production', releaseBranch: 'main', confirm: 'dabi-custo' },
};

// ---------------------------------------------------------------------------------------------------------------------
// Leitor TOML RESTRITO ao que o worker/wrangler.toml usa: comentários, [tabela], [[lista.de.tabelas]] e
// `chave = "texto" | true | false | número`. Qualquer outra construção é erro (melhor recusar do que ler errado).
// ---------------------------------------------------------------------------------------------------------------------
export function parseWranglerToml(text) {
  const root = {};
  let current = root;
  const at = (path, makeArray) => {
    let node = root;
    path.forEach((key, i) => {
      const last = i === path.length - 1;
      if (last && makeArray) { node[key] ??= []; if (!Array.isArray(node[key])) throw new Error(`[[${path.join('.')}]] conflita com uma tabela.`); const t = {}; node[key].push(t); node = t; return; }
      node[key] ??= {};
      node = Array.isArray(node[key]) ? node[key][node[key].length - 1] : node[key];
    });
    return node;
  };
  text.split(/\r?\n/).forEach((raw, n) => {
    const line = raw.replace(/^\s+|\s+$/g, '');
    if (!line || line.startsWith('#')) return;
    let m;
    if ((m = line.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/))) { current = at(m[1].split('.'), true); return; }
    if ((m = line.match(/^\[([A-Za-z0-9_.-]+)\]$/))) { current = at(m[1].split('.'), false); return; }
    m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*(#.*)?$/);
    if (!m) throw new Error(`wrangler.toml linha ${n + 1}: construção não suportada.`);
    const value = m[2];
    if (/^"(?:[^"\\]|\\.)*"$/.test(value)) current[m[1]] = JSON.parse(value);
    else if (value === 'true' || value === 'false') current[m[1]] = value === 'true';
    else if (/^-?\d+(\.\d+)?$/.test(value)) current[m[1]] = Number(value);
    else throw new Error(`wrangler.toml linha ${n + 1}: valor não suportado (${m[1]}).`);
  });
  return root;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRealDatabaseId = id => typeof id === 'string' && UUID.test(id) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id);
const urlsOf = list => (typeof list === 'string' ? list.split(',').map(s => s.trim()).filter(Boolean) : []);
const allKnownUrls = () => [PRODUCTION_URL, STAGING_URL, LEGACY_STAGING_URL];

/**
 * Valida a seção `[env.<env>]` do wrangler.toml. Devolve a lista de problemas (vazia = ok).
 * `forPublish`: no dry-run, um banco ainda não criado (marcador) é só aviso; para publicar, é erro.
 * Impede: APP_ENV ausente/errado, nome do Worker errado, banco de OUTRO ambiente, marcadores, origens cruzadas entre
 * ambientes, localhost em produção, workers.dev em produção e remetente sem o nome Custô.
 */
export function validateWorkerConfig(text, env, { forPublish = true } = {}) {
  const spec = WORKER_ENVIRONMENTS[env];
  if (!spec) return [`ambiente de Worker desconhecido: ${env}`];
  let cfg;
  try { cfg = parseWranglerToml(text); } catch (e) { return [e.message]; }
  const section = cfg.env?.[env];
  if (!section) return [`worker/wrangler.toml não tem a seção [env.${env}].`];
  const problems = [], warnings = [];
  const vars = section.vars ?? {};
  if (section.name !== spec.worker) problems.push(`[env.${env}] name deve ser "${spec.worker}" (está "${section.name ?? ''}").`);
  if (vars.APP_ENV !== spec.appEnv) problems.push(`[env.${env}.vars] APP_ENV deve ser "${spec.appEnv}" (está "${vars.APP_ENV ?? 'ausente'}"): sem ele a guarda contra front-end de outro ambiente fica desligada.`);
  if (!spec.publicBaseUrls.includes(vars.PUBLIC_BASE_URL)) problems.push(`[env.${env}.vars] PUBLIC_BASE_URL deve ser ${spec.publicBaseUrls.join(' ou ')} (está "${vars.PUBLIC_BASE_URL ?? 'ausente'}").`);
  const origins = urlsOf(vars.ALLOWED_ORIGINS);
  for (const o of spec.requiredOrigins) if (!origins.includes(o)) problems.push(`[env.${env}.vars] ALLOWED_ORIGINS precisa incluir ${o}.`);
  for (const o of origins) {
    const allowed = spec.requiredOrigins.includes(o) || spec.allowedExtraOrigins.includes(o);
    if (!allowed) problems.push(`[env.${env}.vars] ALLOWED_ORIGINS não pode incluir ${o}${allKnownUrls().includes(o) ? ' (é de OUTRO ambiente)' : ''}.`);
  }
  if (section.workers_dev !== spec.workersDev) problems.push(`[env.${env}] workers_dev deve ser ${spec.workersDev}.`);
  if (vars.LEGACY_KEY_AUTH !== 'off') problems.push(`[env.${env}.vars] LEGACY_KEY_AUTH deve ser "off".`);
  if (vars.EMAIL_ADAPTER !== 'resend') problems.push(`[env.${env}.vars] EMAIL_ADAPTER deve ser "resend".`);
  if (typeof vars.EMAIL_FROM !== 'string' || !new RegExp(`^${spec.emailDisplayName} <[^<>\\s]+@[^<>\\s]+>$`).test(vars.EMAIL_FROM)) problems.push(`[env.${env}.vars] EMAIL_FROM deve ser "${spec.emailDisplayName} <remetente@domínio-verificado>".`);
  const dbs = Array.isArray(section.d1_databases) ? section.d1_databases : [];
  if (dbs.length !== 1 || dbs[0].binding !== 'DB') problems.push(`[env.${env}] deve ter exatamente um banco D1 com binding "DB".`);
  const db = dbs[0] ?? {};
  if (db.database_name !== spec.d1) problems.push(`[env.${env}] database_name deve ser "${spec.d1}" (está "${db.database_name ?? ''}").`);
  if (!isRealDatabaseId(db.database_id)) (forPublish ? problems : warnings).push(`[env.${env}] database_id ainda é um marcador: crie o banco "${spec.d1}" e informe o ID real.`);
  // Banco de OUTRO ambiente: o mesmo ID (ou o mesmo nome) que outra seção usa é sempre erro.
  for (const [other, otherSpec] of Object.entries(WORKER_ENVIRONMENTS)) {
    if (other === env) continue;
    const otherDb = cfg.env?.[other]?.d1_databases?.[0];
    if (db.database_name === otherSpec.d1) problems.push(`[env.${env}] aponta para o banco de ${other} (${otherSpec.d1}).`);
    if (otherDb && isRealDatabaseId(db.database_id) && db.database_id === otherDb.database_id) problems.push(`[env.${env}] usa o MESMO database_id de [env.${other}].`);
  }
  if (db.migrations_dir !== 'migrations') problems.push(`[env.${env}] migrations_dir deve ser "migrations".`);
  return forPublish ? problems : [...problems, ...warnings.map(w => `(aviso) ${w}`)];
}

export const readWranglerToml = (path = 'worker/wrangler.toml') => readFileSync(path, 'utf8');
/** Erros que bloqueiam (sem os avisos de dry-run). */
export const blockingProblems = problems => problems.filter(p => !p.startsWith('(aviso)'));
