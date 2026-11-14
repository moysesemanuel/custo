// Publicação explícita e reproduzível do Worker (staging ou produção).
//   node scripts/worker.mjs deploy staging|production                         → valida a configuração e faz dry-run (nada é enviado)
//   node scripts/worker.mjs deploy staging --publish --approved-commit SHA40
//   node scripts/worker.mjs deploy production --publish --approved-commit SHA40 --confirm-production dabi-custo-api
// Antes de publicar: configuração do ambiente válida (APP_ENV, banco do próprio ambiente, origens, sem marcadores),
// SHA completo aprovado, checkout limpo e, em produção, a branch main e a confirmação digitada. Migrações nunca são aplicadas aqui.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyRelease } from './pages.mjs';
import { blockingProblems, readWranglerToml, validateWorkerConfig, WORKER_ENVIRONMENTS } from './environments.mjs';

const USAGE = 'Uso: node scripts/worker.mjs deploy staging|production [--publish --approved-commit SHA40] [--confirm-production dabi-custo-api]';

export function parseWorkerArgs(argv) {
  const [command, env, ...rest] = argv;
  if (command !== 'deploy') return { ok: false, error: 'comando inválido (deploy).' };
  if (!(env in WORKER_ENVIRONMENTS)) return { ok: false, error: `ambiente inválido: informe ${Object.keys(WORKER_ENVIRONMENTS).join(' ou ')} (não há padrão).` };
  let publish = false, approvedCommit, confirm;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--publish') publish = true;
    else if (rest[i] === '--approved-commit') approvedCommit = rest[++i];
    else if (rest[i] === '--confirm-production') confirm = rest[++i];
    else return { ok: false, error: `opção desconhecida: ${rest[i]}` };
  }
  const spec = WORKER_ENVIRONMENTS[env];
  if (approvedCommit !== undefined && !publish) return { ok: false, error: '--approved-commit só se aplica a uma publicação.' };
  if (confirm !== undefined && !spec.confirm) return { ok: false, error: '--confirm-production só se aplica a production.' };
  if (publish && !/^[0-9a-f]{40}$/i.test(approvedCommit ?? '')) return { ok: false, error: `publicar em ${env} exige --approved-commit com o SHA completo de 40 caracteres.` };
  if (publish && spec.confirm && confirm !== spec.confirm) return { ok: false, error: `publicar em PRODUÇÃO exige --confirm-production ${spec.confirm}.` };
  return { ok: true, plan: { command, env, publish, approvedCommit } };
}

export const workerDeployArgs = (approvedCommit, env = 'staging') => [
  'deploy', '--env', env, '--config', 'worker/wrangler.toml',
  '--message', `Custô ${env} release ${approvedCommit}`, '--tag', approvedCommit, '--strict',
];
export const workerDryRunArgs = env => ['deploy', '--dry-run', '--env', env, '--config', 'worker/wrangler.toml', '--outdir', `.wrangler/dry-run-${env}`];

/** Tudo o que precisa estar certo antes de chamar o Wrangler. Devolve a lista de problemas (vazia = pode publicar). */
export function preflight(env, { publish, approvedCommit }, deps = { cwd: process.cwd(), toml: undefined }) {
  const toml = deps.toml ?? readWranglerToml();
  const config = validateWorkerConfig(toml, env, { forPublish: publish });
  const problems = blockingProblems(config);
  if (publish) problems.push(...verifyRelease(deps.cwd, env, approvedCommit));
  return { problems, warnings: config.filter(p => p.startsWith('(aviso)')) };
}

function main(argv, run = (args) => execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit' })) {
  const parsed = parseWorkerArgs(argv);
  if (!parsed.ok) { console.error(`Erro: ${parsed.error}\n${USAGE}`); return 1; }
  const { env, publish, approvedCommit } = parsed.plan;
  const spec = WORKER_ENVIRONMENTS[env];
  const { problems, warnings } = preflight(env, { publish, approvedCommit });
  for (const w of warnings) console.error(w);
  if (problems.length) { console.error(`Worker ${spec.worker} (${env}) — ${publish ? 'publicação recusada' : 'configuração inválida'}:\n${problems.map(p => `  - ${p}`).join('\n')}`); return 1; }
  console.error(`\n=== worker ${env} ===\n  Worker:  ${spec.worker}\n  Banco:   ${spec.d1}\n  APP_ENV: ${spec.appEnv}\n  ${publish ? `PUBLICA o commit ${approvedCommit}` : 'Dry-run local: nada é enviado à Cloudflare'}\n`);
  try { run(publish ? workerDeployArgs(approvedCommit, env) : workerDryRunArgs(env)); return 0; }
  catch { console.error(`O Wrangler não concluiu ${publish ? 'a publicação' : 'o dry-run'} do Worker ${env}.`); return 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
