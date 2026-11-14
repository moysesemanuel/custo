/**
 * Backups: manifesto SHA-256, verificação por restauração em memória e proteção contra sobrescrita.
 * Tudo local, em diretório temporário fora do repositório, com dados fictícios criados pelo Worker real.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { uniqueQuoteCode } from '../shared/quoteCode';
import { createOrder } from '../src/domain/orders';
import type { DataSet } from '../src/domain/types';
import { manifestPath, verifyBackup, writeManifest } from '../scripts/backup.mjs';
import { runD1Cli } from '../worker/scripts/d1Cli';
import { Device } from './helpers/device';
import { makeServer, type Server } from './helpers/server';

/** Exporta o banco no formato de um dump SQL (esquema + INSERTs), como o `wrangler d1 export` produz. */
function dump(s: Server, skip: string[] = []): string {
  const raw = s.db.raw;
  const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const tables = raw.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string; sql: string }[];
  for (const t of skip) tables.splice(tables.findIndex(x => x.name === t), 1);
  const indexes = (raw.prepare("SELECT sql, tbl_name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").all() as { sql: string; tbl_name: string }[]).filter(i => !skip.includes(i.tbl_name));
  return ['PRAGMA defer_foreign_keys=TRUE;', ...tables.flatMap(t => [`${t.sql};`, ...(raw.prepare(`SELECT * FROM "${t.name}"`).all() as Record<string, unknown>[]).map(r => `INSERT INTO "${t.name}" (${Object.keys(r).map(k => `"${k}"`).join(',')}) VALUES (${Object.values(r).map(lit).join(',')});`)]), ...indexes.map(i => `${i.sql};`)].join('\n');
}

let dir: string, s: Server;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'custo-backup-'));
  s = makeServer(new Date('2026-11-14T12:00:00.000Z')); await s.issueFor('ana@exemplo.com');
  const D = new Device(s, await s.login('ana@exemplo.com'));
  D.edit(d => ({ ...d, ingredients: [{ id: 'i1', name: 'Base', unit: 'un', purchaseQuantity: 10, purchasePrice: 5 }],
    recipes: ['r1', 'r2'].map(id => ({ id, name: id, yield: 1, items: [{ ingredientId: 'i1', quantity: 1 }], packagingPerUnit: 0, laborTotal: 0, extraTotal: 0, desiredMargin: 50 })) }));
  D.edit(d => ({ ...d, orders: [createOrder(d as DataSet, { customer: 'Cliente', deliveryDate: '2026-12-20', deposit: 0, items: [{ recipeId: 'r1', quantity: 2, unitPrice: 3 }, { recipeId: 'r2', quantity: 1, unitPrice: 4 }] }, { id: 'o1', quoteCode: uniqueQuoteCode(new Set()) })] }));
  expect((await D.sync()).status).toBe('synced');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('verificação de backup (restauração em memória)', () => {
  it('backup íntegro: SHA-256 confere com o manifesto e o dump restaura com os dados (inclusive itens de encomenda)', async () => {
    const file = join(dir, 'staging-2026-11-14.sql'); writeFileSync(file, dump(s));
    const m = writeManifest(file, 'staging', new Date('2026-11-14T12:30:00.000Z'));
    expect(m).toMatchObject({ env: 'staging', database: 'dabi-orcamentos-staging', file: 'staging-2026-11-14.sql' });
    expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    const r = await verifyBackup(file);
    expect(r).toMatchObject({ ok: true, problems: [], integrity: 'ok', counts: { users: 1, orders: 1, order_items: 2, licenses: 1 } });
  });
  it('arquivo alterado depois do manifesto: recusado (SHA-256 diferente)', async () => {
    const file = join(dir, 'b.sql'); writeFileSync(file, dump(s)); writeManifest(file, 'production');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n-- alterado`);
    const r = await verifyBackup(file);
    expect(r.ok).toBe(false); expect(r.problems.join()).toMatch(/SHA-256 diferente/);
  });
  it('sem manifesto, dump que não restaura ou tabela essencial ausente: recusado com o motivo', async () => {
    const file = join(dir, 'c.sql'); writeFileSync(file, dump(s));
    expect((await verifyBackup(file)).problems.join()).toMatch(/sem manifesto/);
    const broken = join(dir, 'd.sql'); writeFileSync(broken, 'CREATE TABLE x (;'); writeManifest(broken, 'staging');
    expect((await verifyBackup(broken)).problems.join()).toMatch(/não restaura/);
    const partial = join(dir, 'e.sql'); writeFileSync(partial, dump(s, ['order_items'])); writeManifest(partial, 'staging');
    expect((await verifyBackup(partial)).problems.join()).toMatch(/tabela ausente no backup: order_items/);
  });
  it('o manifesto nunca é sobrescrito e exige ambiente válido', () => {
    const file = join(dir, 'f.sql'); writeFileSync(file, dump(s)); writeManifest(file, 'staging');
    expect(() => writeManifest(file, 'staging')).toThrow(/nunca é sobrescrito/);
    expect(() => writeManifest(file, 'prod')).toThrow(/ambiente inválido/);
    expect(JSON.parse(readFileSync(manifestPath(file), 'utf8')).env).toBe('staging');
  });
});

describe('export protegido contra sobrescrita', () => {
  it('um export para um arquivo que já existe é recusado antes de chamar o Wrangler', async () => {
    const calls: string[][] = [], errs: string[] = [];
    const deps = { exec: (a: string[]) => void calls.push(a), out: () => {}, err: (l: string) => void errs.push(l), isTTY: false, prompt: async () => '' };
    expect(await runD1Cli(['export', '--env', 'staging', '--output', 'backups/x.sql'], { ...deps, exists: () => true })).toBe(1);
    expect(calls).toEqual([]); expect(errs.join()).toMatch(/já existe/);
    expect(await runD1Cli(['export', '--env', 'staging', '--output', 'backups/x.sql'], { ...deps, exists: () => false })).toBe(0);
    expect(calls[0].slice(0, 4)).toEqual(['wrangler', 'd1', 'export', 'dabi-orcamentos-staging']);
  });
});
