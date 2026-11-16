/** Gráfico "Vendas por mês" da Visão geral: soma por mês de entrega, só pedidos confirmados, custo indisponível sinalizado. */
import { describe, expect, it } from 'vitest';
import { monthlySummary, niceAxis } from '../src/domain/monthly';
import { emptyData as emptyDataSet } from '../src/storage/db';
import type { DataSet, Order } from '../src/domain/types';

const recipe = { id: 'r', name: 'Bolo', yield: 1, items: [{ ingredientId: 'f', quantity: 100, unit: 'g' as const }], packagingPerUnit: 0, laborTotal: 0, extraTotal: 0, desiredMargin: 50 };
const order = (id: string, deliveryDate: string, unitPrice: number, status: Order['status'] = 'Confirmado', recipeId = 'r'): Order =>
  ({ id, customer: 'Ana', deposit: 0, deliveryDate, status, createdAt: '2026-01-01T00:00:00.000Z', items: [{ id: 'a', recipeId, quantity: 1, unitPrice }] });
const data = (orders: Order[]): DataSet => ({ ...emptyDataSet(), ingredients: [{ id: 'f', name: 'Farinha', unit: 'g', purchaseQuantity: 1000, purchasePrice: 10 }], recipes: [recipe], orders });

describe('monthlySummary', () => {
  it('6 meses até o atual; soma vendido e custo por mês de entrega; orçamentos e meses fora da janela não entram', () => {
    const m = monthlySummary(data([order('1', '2026-11-03', 50), order('2', '2026-11-20', 30), order('3', '2026-09-10', 100), order('4', '2026-11-05', 999, 'Orçamento'), order('5', '2026-04-30', 77), order('6', '2026-12-01', 88)]), '2026-11-16');
    expect(m.map(x => x.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(m.map(x => x.label)).toEqual(['jun', 'jul', 'ago', 'set', 'out', 'nov']);
    expect(m[5]).toMatchObject({ orders: 2, revenue: 80, cost: 2 }); // 100 g de farinha a R$ 10/kg = R$ 1 por pedido
    expect(m[3]).toMatchObject({ orders: 1, revenue: 100, cost: 1 });
    expect(m[0]).toMatchObject({ orders: 0, revenue: 0, cost: 0 });
  });
  it('vira o ano corretamente', () => {
    expect(monthlySummary(data([]), '2027-02-10').map(x => x.longLabel)).toEqual(['set/2026', 'out/2026', 'nov/2026', 'dez/2026', 'jan/2027', 'fev/2027']);
  });
  it('pedido sem custo calculável deixa o custo do mês indisponível (não inventa zero)', () => {
    const m = monthlySummary(data([order('1', '2026-11-03', 50), order('2', '2026-11-04', 20, 'Confirmado', 'sumiu')]), '2026-11-16');
    expect(m[5].revenue).toBe(70); expect(m[5].cost).toBeUndefined();
  });
});

describe('niceAxis', () => {
  it('marca 0, metade e um topo redondo acima do máximo', () => {
    expect(niceAxis(0)).toEqual([0]);
    expect(niceAxis(80)).toEqual([0, 50, 100]);
    expect(niceAxis(1234)).toEqual([0, 1000, 2000]);
    expect(niceAxis(4600)).toEqual([0, 2500, 5000]);
  });
});
