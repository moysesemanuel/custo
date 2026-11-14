// Backups do D1: manifesto e verificação LOCAIS (nada aqui fala com a Cloudflare).
//   node scripts/backup.mjs manifest --file backup.sql --env staging|production   → grava backup.sql.manifest.json (SHA-256, tamanho, ambiente)
//   node scripts/backup.mjs verify --file backup.sql                              → confere o SHA-256 e RESTAURA em um SQLite em memória
// O export em si continua sendo `npm run d1 -- export --env <amb> --output <arquivo>.sql` (recusa sobrescrever).
// Procedimento completo (criptografia, retenção, ensaio): docs/BACKUP_E_RECUPERACAO.md.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORKER_ENVIRONMENTS } from './environments.mjs';

const DATABASES = { local: 'dabi-orcamentos', ...Object.fromEntries(Object.entries(WORKER_ENVIRONMENTS).map(([env, s]) => [env, s.d1])) };
export const sha256File = file => createHash('sha256').update(readFileSync(file)).digest('hex');
export const manifestPath = file => `${file}.manifest.json`;
/** Tabelas que todo backup do Custô precisa conter (a lista completa vem das migrações). */
export const REQUIRED_TABLES = ['users', 'sessions', 'licenses', 'sync_state', 'ingredients', 'recipes', 'orders', 'order_items', 'order_payments', 'packagings', 'quotes'];

export function writeManifest(file, env, now = new Date()) {
  if (!(env in DATABASES)) throw new Error(`ambiente inválido: ${Object.keys(DATABASES).join(', ')}`);
  if (!existsSync(file)) throw new Error(`${file} não existe.`);
  const out = manifestPath(file);
  if (existsSync(out)) throw new Error(`${out} já existe (o manifesto de um backup nunca é sobrescrito).`);
  const manifest = { file: basename(file), env, database: DATABASES[env], createdAt: now.toISOString(), bytes: statSync(file).size, sha256: sha256File(file) };
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return manifest;
}

/** Confere integridade (SHA-256 do manifesto, se houver) e restaura o dump em memória. Devolve o relatório; `ok=false` explica o motivo. */
export async function verifyBackup(file) {
  const problems = [];
  if (!existsSync(file)) return { ok: false, problems: [`${file} não existe.`] };
  const sha256 = sha256File(file);
  let manifest;
  if (existsSync(manifestPath(file))) {
    manifest = JSON.parse(readFileSync(manifestPath(file), 'utf8'));
    if (manifest.sha256 !== sha256) problems.push('SHA-256 diferente do manifesto: o arquivo foi alterado ou corrompido.');
  } else problems.push('sem manifesto: não há como provar que o arquivo é o mesmo exportado (gere com `manifest` logo após o export).');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  let tables = [], counts = {}, lastMigration = null, integrity = 'não verificado';
  try {
    db.exec(readFileSync(file, 'utf8'));
    integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => r.name);
    for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`tabela ausente no backup: ${t}`);
    counts = Object.fromEntries(REQUIRED_TABLES.filter(t => tables.includes(t)).map(t => [t, db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n]));
    if (tables.includes('d1_migrations')) lastMigration = db.prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1').get()?.name ?? null;
    if (integrity !== 'ok') problems.push(`integrity_check: ${integrity}`);
  } catch (e) { problems.push(`o dump não restaura: ${e instanceof Error ? e.message.split('\n')[0] : 'erro desconhecido'}`); }
  finally { db.close(); }
  return { ok: problems.length === 0, problems, sha256, manifest, tables: tables.length, counts, lastMigration, integrity };
}

async function main(argv) {
  const [command, ...rest] = argv;
  const opt = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
  const file = opt('--file');
  if (!file || !['manifest', 'verify'].includes(command)) { console.error('Uso: node scripts/backup.mjs manifest --file <arquivo.sql> --env staging|production | verify --file <arquivo.sql>'); return 1; }
  try {
    if (command === 'manifest') { const m = writeManifest(file, opt('--env')); console.log(JSON.stringify(m, null, 2)); return 0; }
    const r = await verifyBackup(file);
    console.log(JSON.stringify({ ...r, manifest: r.manifest ? { env: r.manifest.env, database: r.manifest.database, createdAt: r.manifest.createdAt } : null }, null, 2));
    return r.ok ? 0 : 1;
  } catch (e) { console.error(`Erro: ${e instanceof Error ? e.message : e}`); return 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
