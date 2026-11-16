// @vitest-environment jsdom
/** Links publicados (Configurações): cada link mostra, só para você, o cliente, os produtos e a entrega do pedido deste aparelho. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { emptyData, saveData } from '../../src/storage/db';
import type { DataSet } from '../../src/domain/types';
import { resetStorage } from './setup';

const BASE = 'https://api.exemplo.test';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const memory = new Map<string, string>();
const recipe = (id: string, name: string) => ({ id, name, yield: 1, items: [{ ingredientId: 'base', quantity: 1, unit: 'un' as const }], packagingPerUnit: 0, laborTotal: 0, extraTotal: 0, desiredMargin: 50 });
const quote = (id: string, quoteNumber: string) => ({ id, status: 'active', quoteNumber, businessName: 'Doces', issuedAt: '2026-11-14T10:00:00.000Z', validUntil: null, totalCents: 12500, createdAt: '2026-11-14T10:00:00.000Z', url: `${BASE}/o/${id}` });

describe('links de orçamentos publicados', () => {
  it('mostra cliente, produtos e entrega; "Ver pedido" abre a encomenda; pedido ausente é avisado', async () => {
    memory.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() });
    await resetStorage();
    await saveData({ ...emptyData(), ingredients: [{ id: 'base', name: 'Base', unit: 'un', purchaseQuantity: 100, purchasePrice: 50 }], recipes: [recipe('brig', 'Brigadeiro Gourmet')],
      orders: [{ id: 'o1', customer: 'Carla Mendes', deposit: 0, deliveryDate: '2026-12-20', status: 'Orçamento', createdAt: '2026-11-14T10:00:00.000Z', quoteCode: 'ORC-K7M42P', items: [{ id: 'a', recipeId: 'brig', recipeName: 'Brigadeiro Gourmet', quantity: 50, unitPrice: 2.5 }] }] as DataSet['orders'] });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = url.replace(BASE, '');
      if (path === '/api/auth/session') return json(200, { user: { id: 'usr_1', email: 'lana@exemplo.com' }, csrfToken: 'csrf', sessionId: 'ses_aaaaaaaaaaaaaaaa', license: { status: 'active', quotaActive: 100, quotaDaily: 30, expiresAt: null, holderName: 'Lana' } });
      if (path === '/api/quotes') return json(200, { quotes: [quote('q1', 'ORC-K7M42P'), quote('q2', 'ORC-ZZZZZZ')] });
      if (path === '/api/sessions') return json(200, { maxSessions: 2, sessions: [] });
      if (path.startsWith('/api/sync/v2')) return json(503, {});
      return json(404, {});
    }));
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', BASE); vi.stubEnv('VITE_QUOTES_API_URL', BASE); vi.stubEnv('VITE_REQUIRE_LOGIN', 'on');
    window.history.replaceState({}, '', '/configuracoes');
    const { default: App } = await import('../../src/App');
    render(<App />);
    const u = userEvent.setup();
    expect(await screen.findByText('Carla Mendes')).toBeTruthy();
    expect(screen.getByText(/Brigadeiro Gourmet · 50 un\./)).toBeTruthy();
    expect(screen.getByText(/Entrega: 20\/12\/2026 · Orçamento/)).toBeTruthy();
    expect(screen.getByText(/não está neste aparelho/)).toBeTruthy(); // ORC-ZZZZZZ não tem pedido aqui
    await u.click(screen.getByRole('button', { name: 'Ver pedido' }));
    await waitFor(() => expect(window.location.pathname).not.toBe('/configuracoes'));
  });
});
