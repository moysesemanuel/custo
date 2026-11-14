/**
 * Exclusão de conta: o SQL gerado é executado SÓ em SQLite local com dados fictícios, criados pelo Worker real
 * (login, sincronização com encomenda de vários itens e recebimento, link público). Nada remoto.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { uniqueQuoteCode } from '../shared/quoteCode';
import { createOrder } from '../src/domain/orders';
import { addPayment } from '../src/domain/payments';
import type { DataSet } from '../src/domain/types';
import { accountErasureSql } from '../worker/scripts/accountErasure';
import { Device } from './helpers/device';
import { makeServer, type Server } from './helpers/server';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const TABLES = ['users', 'sessions', 'auth_codes', 'licenses', 'sync_state', 'ingredients', 'recipes', 'recipe_items', 'recipe_packaging_items', 'packagings', 'orders', 'order_items', 'order_payments', 'quotes', 'rate_limits', 'admins', 'admin_audit'];
let s: Server;

async function customer(email: string) {
  await s.issueFor(email); const session = await s.login(email, 'Celular', '10.0.0.9');
  const D = new Device(s, session);
  D.edit(d => ({ ...d, settings: { cupSizeMl: 240, businessName: `Doces ${email}`, businessPhone: '5541999990000' },
    ingredients: [{ id: 'i1', name: 'Base', unit: 'un', purchaseQuantity: 10, purchasePrice: 5 }],
    packagings: [{ id: 'p1', name: 'Forminha', purchasePrice: 1, purchaseQuantity: 10, active: true }],
    recipes: [{ id: 'r1', name: 'Brigadeiro', yield: 1, items: [{ ingredientId: 'i1', quantity: 1 }], packagingItems: [{ packagingId: 'p1', quantityPerUnit: 1 }], packagingPerUnit: 0, laborTotal: 0, extraTotal: 0, desiredMargin: 50 },
      { id: 'r2', name: 'Beijinho', yield: 1, items: [{ ingredientId: 'i1', quantity: 1 }], packagingPerUnit: 0, laborTotal: 0, extraTotal: 0, desiredMargin: 50 }] }));
  D.edit(d => ({ ...d, orders: [createOrder(d as DataSet, { customer: 'Cliente Final Fictício', deliveryDate: '2026-12-20', deposit: 10, items: [{ recipeId: 'r1', quantity: 10, unitPrice: 3 }, { recipeId: 'r2', quantity: 5, unitPrice: 2 }] }, { id: 'o1', quoteCode: uniqueQuoteCode(new Set()), now: NOW })] }));
  D.edit(d => addPayment(d, 'o1', { id: 'pay1', amount: 5, receivedAt: '2026-11-15', note: 'Pix da cliente' }));
  expect((await D.sync()).status).toBe('synced');
  const quote = { version: 1, quoteNumber: 'ORC-K7M42P', businessName: 'Doces', issuedAt: '2026-11-14', items: [{ description: 'Brigadeiro', quantity: 10, unitPriceCents: 300 }] };
  const pub = await s.request('POST', '/api/quotes', { session, body: quote });
  expect(pub.status).toBe(201);
  const { id } = await pub.json() as { id: string };
  return { session, quoteId: id, userId: (s.db.raw.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id };
}
const counts = (userId: string, email: string) => Object.fromEntries(TABLES.map(t => {
  const cols = (s.db.raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map(c => c.name);
  const where = cols.includes('user_id') ? 'user_id = ?' : cols.includes('email') ? 'email = ?' : t === 'quotes' ? 'owner_id IN (SELECT id FROM licenses WHERE user_id = ? )' : '0 = ?';
  const arg = cols.includes('email') && !cols.includes('user_id') ? email : userId;
  return [t, (s.db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).get(arg) as { n: number }).n];
}));
const run = (sql: string) => s.db.raw.exec(sql);

beforeEach(() => { s = makeServer(NOW); });

describe('exclusão de conta (SQL gerado, executado só localmente)', () => {
  it('apaga todos os dados do titular, anonimiza a licença, derruba os links públicos e não toca outra conta', async () => {
    const ana = await customer('ana@exemplo.com'), bia = await customer('bia@exemplo.com');
    const before = counts(ana.userId, 'ana@exemplo.com'), biaBefore = counts(bia.userId, 'bia@exemplo.com');
    expect(before).toMatchObject({ users: 1, orders: 1, order_items: 2, order_payments: 1, recipes: 2, sync_state: 1, sessions: 1 });
    const { preview, erase } = await accountErasureSql('  ANA@exemplo.com ', NOW.toISOString());
    expect(s.db.raw.prepare(preview).get()).toMatchObject({ usuarios: 1, admin_ativo: 0, licencas: 1, links_publicos: 1, orders: 1, order_items: 2 });
    const licenseId = (s.db.raw.prepare('SELECT id FROM licenses WHERE email = ?').get('ana@exemplo.com') as { id: string }).id;
    run(erase);
    const after = counts(ana.userId, 'ana@exemplo.com');
    for (const t of TABLES.filter(t => !['licenses', 'admin_audit', 'admins', 'rate_limits'].includes(t))) expect(after[t], t).toBe(0);
    expect(s.db.raw.prepare('SELECT email, user_id, status, label FROM licenses WHERE id = ?').get(licenseId)).toEqual({ email: null, user_id: null, status: 'revoked', label: 'conta excluída' });
    expect(s.db.raw.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE license_id = ?').get(licenseId)).toEqual({ n: 0 });
    expect((await s.request('GET', `/o/${ana.quoteId}`)).status).toBe(404); // link público derrubado
    expect(JSON.stringify(s.db.raw.prepare('SELECT * FROM users').all())).not.toContain('ana@exemplo.com');
    expect(JSON.stringify(s.db.raw.prepare("SELECT settings_json FROM sync_state").all())).not.toContain('ana@exemplo.com');
    // A outra conta fica intacta e continua funcionando.
    expect(counts(bia.userId, 'bia@exemplo.com')).toEqual(biaBefore);
    expect((await s.request('GET', `/o/${bia.quoteId}`)).status).toBe(200);
    expect((await s.request('GET', '/api/sync/v2?since=0', { session: bia.session })).status).toBe(200);
    // A sessão antiga do titular não vale mais.
    expect((await s.request('GET', '/api/auth/session', { session: ana.session })).status).toBe(401);
    // Repetir não muda nada (idempotente).
    const snapshot = JSON.stringify(TABLES.map(t => s.db.raw.prepare(`SELECT * FROM ${t}`).all()));
    run(erase); expect(JSON.stringify(TABLES.map(t => s.db.raw.prepare(`SELECT * FROM ${t}`).all()))).toBe(snapshot);
  });
  it('conta com administração ativa: o SQL não muda NADA (revogar o admin é uma decisão separada)', async () => {
    const ana = await customer('ana@exemplo.com');
    s.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', ?, 'cli')").run(ana.userId, NOW.toISOString());
    const snapshot = JSON.stringify(TABLES.map(t => s.db.raw.prepare(`SELECT * FROM ${t}`).all()));
    const { preview, erase } = await accountErasureSql('ana@exemplo.com', NOW.toISOString());
    expect(s.db.raw.prepare(preview).get()).toMatchObject({ admin_ativo: 1 });
    run(erase);
    expect(JSON.stringify(TABLES.map(t => s.db.raw.prepare(`SELECT * FROM ${t}`).all()))).toBe(snapshot);
  });
  it('recusa e-mail inválido e escapa aspas (sem injeção de SQL)', async () => {
    await expect(accountErasureSql('não é e-mail', NOW.toISOString())).rejects.toThrow(/inválido/);
    const { erase } = await accountErasureSql("o'brien@exemplo.com", NOW.toISOString());
    expect(erase).toContain("'o''brien@exemplo.com'");
    expect(() => s.db.raw.exec(erase)).not.toThrow();
  });
});
