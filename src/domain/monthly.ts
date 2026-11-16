import type { DataSet } from './types';
import { orderTotal } from './payments';
import { orderTotalCost } from './orderCost';

/** Um mês do gráfico da Visão geral: pedidos confirmados (não orçamentos) com entrega no mês. */
export type MonthSummary = { key: string; label: string; longLabel: string; orders: number; revenue: number;
  /** Custo estimado somado; `undefined` se algum pedido do mês não tem custo calculável (falta equivalência de medida). */
  cost: number | undefined };

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Os últimos `count` meses até o mês de `today` (AAAA-MM-DD), do mais antigo ao atual. */
export function monthlySummary(data: DataSet, today: string, count = 6): MonthSummary[] {
  const [y, m] = today.split('-').map(Number);
  const out: MonthSummary[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: MONTHS[d.getUTCMonth()], longLabel: `${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}`, orders: 0, revenue: 0, cost: 0 });
  }
  const byKey = new Map(out.map(s => [s.key, s]));
  for (const o of data.orders) {
    if (o.status === 'Orçamento') continue;
    const s = byKey.get(o.deliveryDate.slice(0, 7));
    if (!s) continue;
    s.orders++; s.revenue += orderTotal(o);
    const c = orderTotalCost(o, data);
    s.cost = c === undefined || s.cost === undefined ? undefined : s.cost + c;
  }
  return out;
}

/** Topo "redondo" do eixo e três marcas (0, metade, topo). */
export function niceAxis(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 2, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw)!;
  return [0, step, step * 2];
}
