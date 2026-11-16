// @vitest-environment jsdom
/** Agenda em calendário, botão de arquivo do backup, um só "Nova encomenda" em Pedidos, referências no conversor. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/App';
import { emptyData, saveData } from '../../src/storage/db';
import { monthGrid, shiftMonth } from '../../src/domain/schedule';
import { localToday } from '../../src/utils';
import { resetStorage } from './setup';

const loaded = async () => waitFor(() => expect(screen.queryByText('Carregando seus dados…')).toBeNull());
const nav = async (u: ReturnType<typeof userEvent.setup>, name: string) => u.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name }));
beforeEach(async () => { await resetStorage(); window.history.replaceState({}, '', '/'); });

describe('grade do calendário', () => {
  it('semanas de domingo a sábado, completando com dias vizinhos', () => {
    const g = monthGrid('2026-11'); // 1/11/2026 é domingo
    expect(g[0][0]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(g.every(w => w.length === 7)).toBe(true);
    expect(g.flat().filter(d => d.inMonth)).toHaveLength(30);
    expect(monthGrid('2026-02')[0][0].date).toBe('2026-02-01');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01'); expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('telas', () => {
  it('Agenda: calendário com contagem por dia; clicar no dia mostra os pedidos dele', async () => {
    const today = localToday(); const other = `${today.slice(0, 7)}-${today.slice(8) === '15' ? '16' : '15'}`;
    const order = (id: string, customer: string, date: string) => ({ id, customer, deposit: 0, deliveryDate: date, status: 'Confirmado' as const, createdAt: '2026-11-01T00:00:00.000Z', quoteCode: `ORC-K7M4${id}P`, items: [{ id: 'a', recipeId: 'r', recipeName: 'Bolo', quantity: 1, unitPrice: 50 }] });
    await saveData({ ...emptyData(), ingredients: [{ id: 'f', name: 'Farinha', unit: 'g', purchaseQuantity: 1000, purchasePrice: 10 }],
      recipes: [{ id: 'r', name: 'Bolo', yield: 1, items: [{ ingredientId: 'f', quantity: 100, unit: 'g' }], packagingPerUnit: 0, laborTotal: 0, extraTotal: 0, desiredMargin: 50 }],
      orders: [order('1', 'Ana', other), order('2', 'Bia', other)] });
    const u = userEvent.setup(); render(<App />); await loaded(); await nav(u, 'Agenda');
    expect(screen.getByRole('table', { name: 'Calendário de entregas' })).toBeTruthy();
    expect(screen.getByText('Nenhuma entrega para hoje.')).toBeTruthy();
    const day = screen.getByRole('button', { name: new RegExp(`^\\S+, ${Number(other.slice(8))} de .*2 entregas`) });
    await u.click(day);
    expect(day.getAttribute('aria-pressed')).toBe('true');
    const dayCard = screen.getByRole('heading', { name: new RegExp(`${Number(other.slice(8))} de `) }).closest('section')!;
    expect(within(dayCard).getByText('Ana')).toBeTruthy(); expect(within(dayCard).getByText('Bia')).toBeTruthy();
    await u.click(within(dayCard).getByRole('button', { name: 'Ver pedido de Ana' }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/pedidos\//));
  });

  it('Pedidos vazio tem um só botão "Nova encomenda"', async () => {
    const u = userEvent.setup(); render(<App />); await loaded(); await nav(u, 'Pedidos');
    expect(screen.getAllByRole('button', { name: /Nova encomenda/ }).filter(b => !b.closest('nav'))).toHaveLength(1);
  });

  it('Backup: escolher arquivo é um botão com rótulo claro', async () => {
    const u = userEvent.setup(); render(<App />); await loaded(); await nav(u, 'Backup');
    const input = screen.getByLabelText(/Escolher arquivo de backup/) as HTMLInputElement;
    expect(input.type).toBe('file'); expect(input.accept).toContain('.json');
  });

  it('Conversor: mostra as medidas de referência e as dos ingredientes', async () => {
    await saveData({ ...emptyData(), settings: { cupSizeMl: 240 }, ingredients: [{ id: 'f', name: 'Farinha', unit: 'g', purchaseQuantity: 1000, purchasePrice: 10, densityGPerMl: 0.5 }] });
    const u = userEvent.setup(); render(<App />); await loaded(); await nav(u, 'Conversor');
    const ref = screen.getByRole('region', { name: 'Medidas de referência' });
    expect(within(ref).getByText('240 mL')).toBeTruthy(); expect(within(ref).getByText('Farinha')).toBeTruthy(); expect(within(ref).getByText(/1 xícara = 120 g/)).toBeTruthy();
  });
});
