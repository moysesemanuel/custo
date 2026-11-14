import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWorkerArgs, preflight, workerDeployArgs, workerDryRunArgs } from '../scripts/worker.mjs';
import { blockingProblems, LEGACY_STAGING_URL, PAGES_ENVIRONMENTS, parseWranglerToml, PRODUCTION_URL, STAGING_URL, validateWorkerConfig, WORKER_ENVIRONMENTS } from '../scripts/environments.mjs';
import { main as pagesMain, verifyTargetConfig } from '../scripts/pages.mjs';

const TOML = readFileSync('worker/wrangler.toml', 'utf8');
const REAL_ID = '11111111-2222-3333-4444-555555555555';
/** Configuração de produção como ficará depois de criar o banco (o ID aqui é fictício, só para o teste). */
/** ID REAL de produção registrado no wrangler.toml (banco criado em 14/11/2026). */
const PROD_ID = parseWranglerToml(TOML).env.production.d1_databases[0].database_id as string;
/** A mesma configuração com o banco de produção ainda não criado (marcador): prova que a publicação seria recusada. */
const PLACEHOLDER = TOML.replace(`database_id = "${PROD_ID}"`, 'database_id = "SUBSTITUIR-PELO-ID-DO-D1-DE-PRODUCAO"');
const withProdId = (t = TOML, id = REAL_ID) => t.replace(`database_id = "${PROD_ID}"`, `database_id = "${id}"`).replace('database_id = "SUBSTITUIR-PELO-ID-DO-D1-DE-PRODUCAO"', `database_id = "${id}"`);
const stagingId = () => parseWranglerToml(TOML).env.staging.d1_databases[0].database_id as string;
const section = (t: string, env: string) => t.split(`[env.${env}.vars]`)[1]?.split('\n[')[0] ?? '';
const replaceIn = (t: string, env: string, from: RegExp, to: string) => { const s = section(t, env); return t.replace(s, s.replace(from, to)); };

describe('publicação reproduzível do Worker', () => {
  const sha = 'c'.repeat(40);
  it('exige ambiente e revisão explícitos; produção exige a confirmação digitada', () => {
    expect(parseWorkerArgs(['deploy']).ok).toBe(false);
    expect(parseWorkerArgs(['deploy', 'prod']).ok).toBe(false);
    expect(parseWorkerArgs(['deploy', 'staging', '--publish']).ok).toBe(false);
    expect(parseWorkerArgs(['deploy', 'staging', '--publish', '--approved-commit', 'abc']).ok).toBe(false);
    expect(parseWorkerArgs(['deploy', 'staging', '--publish', '--approved-commit', sha])).toMatchObject({ ok: true, plan: { env: 'staging', publish: true, approvedCommit: sha } });
    expect(parseWorkerArgs(['deploy', 'production', '--publish', '--approved-commit', sha]).ok).toBe(false);
    expect(parseWorkerArgs(['deploy', 'production', '--publish', '--approved-commit', sha, '--confirm-production', 'dabi-orcamentos']).ok).toBe(false);
    expect(parseWorkerArgs(['deploy', 'production', '--publish', '--approved-commit', sha, '--confirm-production', 'dabi-custo-api'])).toMatchObject({ ok: true, plan: { env: 'production', publish: true } });
    expect(parseWorkerArgs(['deploy', 'staging', '--confirm-production', 'dabi-custo-api']).ok).toBe(false);
    expect(parseWorkerArgs(['deploy', 'production'])).toMatchObject({ ok: true, plan: { publish: false } }); // dry-run
  });
  it('registra o mesmo SHA como mensagem e tag; o dry-run nunca publica', () => {
    expect(workerDeployArgs(sha)).toEqual(['deploy', '--env', 'staging', '--config', 'worker/wrangler.toml', '--message', `Custô staging release ${sha}`, '--tag', sha, '--strict']);
    expect(workerDeployArgs(sha, 'production')).toContain('production');
    expect(workerDryRunArgs('production')).toContain('--dry-run');
  });
  it('o remetente mantém o endereço verificado e mostra o nome Custô nos dois ambientes', () => {
    for (const env of ['staging', 'production']) expect(section(TOML, env).match(/^EMAIL_FROM\s*=\s*"([^"]+)"/m)?.[1], env).toBe('Custô <acesso@mail.dabitech.com.br>');
  });
});

describe('configuração dos ambientes (worker/wrangler.toml)', () => {
  it('staging atual é válido e PRESERVA o Worker e o D1 existentes; os dois endereços de staging estão liberados', () => {
    expect(validateWorkerConfig(TOML, 'staging')).toEqual([]);
    const cfg = parseWranglerToml(TOML).env.staging;
    expect(cfg.name).toBe('dabi-orcamentos-staging'); expect(cfg.d1_databases[0].database_name).toBe('dabi-orcamentos-staging');
    expect(stagingId()).toMatch(/^6d6b478a-/); // o banco existente, não um novo
    expect(cfg.vars.ALLOWED_ORIGINS.split(',')).toEqual(expect.arrayContaining([STAGING_URL, LEGACY_STAGING_URL]));
  });
  it('produção usa o domínio aprovado, APP_ENV, nomes novos e banco próprio (criado); com o ID marcador a publicação seria recusada', () => {
    const cfg = parseWranglerToml(TOML).env.production;
    expect(cfg).toMatchObject({ name: 'dabi-custo-api', workers_dev: false, vars: { APP_ENV: 'production', PUBLIC_BASE_URL: PRODUCTION_URL, ALLOWED_ORIGINS: PRODUCTION_URL } });
    expect(PROD_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/); expect(PROD_ID).not.toBe(stagingId());
    expect(validateWorkerConfig(TOML, 'production')).toEqual([]); // configuração real de produção: publicável
    expect(validateWorkerConfig(PLACEHOLDER, 'production')).toEqual(['[env.production] database_id ainda é um marcador: crie o banco "dabi-custo-producao" e informe o ID real.']);
    expect(blockingProblems(validateWorkerConfig(PLACEHOLDER, 'production', { forPublish: false }))).toEqual([]); // dry-run: só aviso
    expect(validateWorkerConfig(withProdId(), 'production')).toEqual([]);
  });
  it.each([
    ['APP_ENV ausente', (t: string) => replaceIn(t, 'production', /^APP_ENV = .*\n/m, ''), /APP_ENV/],
    ['APP_ENV de outro ambiente', (t: string) => replaceIn(t, 'production', /APP_ENV = "production"/, 'APP_ENV = "staging"'), /APP_ENV/],
    ['origem de staging em produção', (t: string) => replaceIn(t, 'production', /ALLOWED_ORIGINS = ".*"/, `ALLOWED_ORIGINS = "${PRODUCTION_URL},${STAGING_URL}"`), /OUTRO ambiente/],
    ['localhost em produção', (t: string) => replaceIn(t, 'production', /ALLOWED_ORIGINS = ".*"/, `ALLOWED_ORIGINS = "${PRODUCTION_URL},http://localhost:5174"`), /localhost/],
    ['link público no domínio errado', (t: string) => replaceIn(t, 'production', /PUBLIC_BASE_URL = ".*"/, `PUBLIC_BASE_URL = "${STAGING_URL}"`), /PUBLIC_BASE_URL/],
    ['banco de staging em produção (mesmo ID)', (t: string) => t.replace(REAL_ID, stagingId()), /MESMO database_id/],
    ['banco de staging em produção (mesmo nome)', (t: string) => withProdId(t).replace('database_name = "dabi-custo-producao"', 'database_name = "dabi-orcamentos-staging"'), /banco de staging/],
    ['ID marcador de zeros', (t: string) => t.replace(REAL_ID, '00000000-0000-0000-0000-000000000000'), /marcador/],
    ['workers.dev ligado em produção', (t: string) => withProdId(t).replace(/(\[env\.production\]\nname = "dabi-custo-api"\n)workers_dev = false/, '$1workers_dev = true'), /workers_dev/],
    ['nome de Worker errado', (t: string) => withProdId(t).replace('name = "dabi-custo-api"', 'name = "dabi-orcamentos-staging"'), /name deve ser/],
    ['remetente sem o nome Custô', (t: string) => replaceIn(withProdId(t), 'production', /EMAIL_FROM = ".*"/, 'EMAIL_FROM = "DaBi Preço Certo <acesso@mail.dabitech.com.br>"'), /EMAIL_FROM/],
  ])('produção recusada: %s', (_name, mutate, expected) => {
    expect(validateWorkerConfig(mutate(withProdId()), 'production').join('\n')).toMatch(expected);
  });
  it('staging recusado se a origem de PRODUÇÃO for liberada nele ou se faltar a origem nova', () => {
    expect(validateWorkerConfig(replaceIn(TOML, 'staging', /ALLOWED_ORIGINS = "/, `ALLOWED_ORIGINS = "${PRODUCTION_URL},`), 'staging').join()).toMatch(/OUTRO ambiente/);
    expect(validateWorkerConfig(replaceIn(TOML, 'staging', /https:\/\/dabi-custo-staging\.pages\.dev,/, ''), 'staging').join()).toMatch(/precisa incluir https:\/\/dabi-custo-staging/);
  });
  it('o leitor TOML recusa construções que não entende (em vez de ler errado)', () => {
    expect(() => parseWranglerToml('a = [1, 2]')).toThrow(/não suportado/);
    expect(() => parseWranglerToml('chave sem valor')).toThrow(/não suportada/);
    expect(validateWorkerConfig('a = { b = 1 }', 'staging').join()).toMatch(/não suportado/);
  });
});

describe('Pages × Worker: cada projeto só publica contra o Worker do seu ambiente', () => {
  it('os projetos apontam para o ambiente certo e o staging antigo usa o MESMO Worker do novo', () => {
    expect(PAGES_ENVIRONMENTS.production).toMatchObject({ project: 'dabi-custo', workerEnv: 'production', url: PRODUCTION_URL, releaseBranch: 'main', confirm: 'dabi-custo' });
    expect(PAGES_ENVIRONMENTS.staging).toMatchObject({ project: 'dabi-custo-staging', workerEnv: 'staging' });
    expect(PAGES_ENVIRONMENTS['staging-legacy']).toMatchObject({ project: 'dabi-preco-certo-staging', workerEnv: 'staging' });
    expect(WORKER_ENVIRONMENTS.staging.worker).not.toBe(WORKER_ENVIRONMENTS.production.worker);
    expect(WORKER_ENVIRONMENTS.staging.d1).not.toBe(WORKER_ENVIRONMENTS.production.d1);
  });
  it('publicar o Pages de produção é recusado enquanto a configuração do Worker de produção estiver incompleta', () => {
    expect(verifyTargetConfig('production', PLACEHOLDER).join()).toMatch(/marcador/);
    expect(verifyTargetConfig('production', TOML)).toEqual([]);
    expect(verifyTargetConfig('production', withProdId())).toEqual([]);
    expect(verifyTargetConfig('production', PLACEHOLDER, { forPublish: false }).join()).toMatch(/^\(aviso\)/); // dry-run segue, com aviso
    expect(verifyTargetConfig('staging', TOML)).toEqual([]); expect(verifyTargetConfig('staging-legacy', TOML)).toEqual([]);
  });
  it('o preflight do Worker junta configuração e revisão: sem SHA aprovado e checkout limpo, nada é publicado', () => {
    const r = preflight('production', { publish: true, approvedCommit: 'f'.repeat(40) }, { cwd: process.cwd(), toml: withProdId() });
    expect(r.problems.join()).toMatch(/commit aprovado|branch main|limpo/);
    expect(preflight('production', { publish: false, approvedCommit: undefined }, { cwd: process.cwd(), toml: PLACEHOLDER })).toMatchObject({ problems: [], warnings: [expect.stringMatching(/marcador/)] });
  });
});

describe('script do Pages (executor simulado: nada é construído nem enviado)', () => {
  const silence = () => { const e = console.error; console.error = () => {}; return () => { console.error = e; }; };
  it('publicação de produção com a configuração do Worker incompleta para ANTES do build e do Wrangler (mesmo com commit aprovado na main)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'custo-release-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    const calls: string[][] = []; const restore = silence();
    try {
      git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test'); git('config', 'commit.gpgsign', 'false');
      writeFileSync(join(dir, 'x.txt'), 'x'); git('add', 'x.txt'); git('commit', '-m', 'release');
      const sha = git('rev-parse', 'HEAD');
      const deps = (toml: string) => ({ run: (cmd: string, args: string[]) => void calls.push([cmd, ...args]), toml, cwd: dir, validateDist: () => [] });
      const args = ['deploy', 'production', '--publish', '--approved-commit', sha, '--confirm-production', 'dabi-custo'];
      expect(pagesMain(args, deps(PLACEHOLDER))).toBe(1); expect(calls).toEqual([]); // só a configuração (banco marcador) bloqueia aqui
      expect(pagesMain(args, deps(withProdId()))).toBe(0); // com a configuração completa, seguiria para build e publicação (simulados)
      expect(calls.map(c => c.slice(0, 3).join(' '))).toEqual(['npm run build', 'npx wrangler pages']);
      expect(calls[1]).toEqual(expect.arrayContaining(['--project-name', 'dabi-custo', '--branch', 'main', '--commit-hash', sha]));
    } finally { restore(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('com a configuração válida, um commit não aprovado também para antes de qualquer comando', () => {
    const calls: string[][] = []; const restore = silence();
    try {
      expect(pagesMain(['deploy', 'staging', '--publish', '--approved-commit', 'a'.repeat(40)], { run: (cmd: string, args: string[]) => void calls.push([cmd, ...args]), toml: TOML, cwd: process.cwd(), validateDist: () => [] })).toBe(1);
      expect(calls).toEqual([]);
    } finally { restore(); }
  });
  it('o dry-run constrói e valida, mas nunca chama o Wrangler', () => {
    const calls: string[][] = []; const restore = silence();
    try {
      expect(pagesMain(['deploy', 'staging'], { run: (cmd: string, args: string[]) => void calls.push([cmd, ...args]), toml: TOML, cwd: process.cwd(), validateDist: () => [] })).toBe(0);
      expect(calls).toEqual([['npm', 'run', 'build']]);
    } finally { restore(); }
  });
});
