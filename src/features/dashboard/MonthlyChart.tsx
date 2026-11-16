import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { DataSet } from '../../domain/types';
import { money } from '../../domain/pricing';
import { monthlySummary, niceAxis, type MonthSummary } from '../../domain/monthly';

/** "R$ 1,2 mil" para eixos e rótulos curtos. */
const compact = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : money(v).replace(/,00$/, ''));

function tip(s: MonthSummary) {
  const saldo = s.cost === undefined ? undefined : s.revenue - s.cost;
  return { title: `${s.longLabel} · ${s.orders} ${s.orders === 1 ? 'pedido' : 'pedidos'}`, rows: [['Vendido', money(s.revenue)], ['Custo estimado', s.cost === undefined ? 'não calculável' : money(s.cost)], ['Saldo estimado', saldo === undefined ? '—' : money(saldo)]] as [string, string][] };
}

/**
 * Vendas por mês (últimos 6 meses, pela data de entrega dos pedidos confirmados): cada coluna é o valor vendido,
 * dividida em custo estimado (base) e saldo estimado (topo). Passe o mouse ou o foco numa coluna para ver os valores;
 * a mesma informação está em "Ver em tabela".
 */
export function MonthlyChart({ data, today }: { data: DataSet; today: string }) {
  const months = useMemo(() => monthlySummary(data, today), [data, today]);
  const [active, setActive] = useState<number | null>(null);
  const ticks = niceAxis(Math.max(...months.map(m => m.revenue)));
  const top = ticks[ticks.length - 1];
  const hasData = months.some(m => m.orders > 0);
  const anyUnavailable = months.some(m => m.orders > 0 && m.cost === undefined);
  const pct = (v: number) => `${top ? (v / top) * 100 : 0}%`;
  const current = months[months.length - 1];

  return <section className="card chart-card" aria-labelledby="chart-title">
    <h2 className="section-title" id="chart-title">Vendas por mês</h2>
    <p className="muted">Pedidos confirmados nos últimos 6 meses, pela data de entrega. Custo e saldo são estimativas.</p>
    {!hasData ? <div className="empty"><BarChart3 size={30} />O gráfico aparece quando houver pedidos confirmados com entrega nos últimos 6 meses.</div> : <>
      <ul className="chart-legend" aria-label="Legenda">
        <li><span className="swatch" style={{ background: 'var(--chart-cost)' }} />Custo estimado</li>
        <li><span className="swatch" style={{ background: 'var(--chart-margin)' }} />Saldo estimado</li>
        {anyUnavailable && <li><span className="swatch" style={{ background: 'var(--chart-unknown)' }} />Vendido (custo não calculável)</li>}
      </ul>
      <div className="chart-plot" aria-hidden="true">
        <div className="chart-grid">{ticks.map(t => <div key={t} className="chart-tick" style={{ bottom: pct(t) }}><span>{compact(t)}</span></div>)}</div>
        <div className="chart-cols">{months.map((m, i) => {
          const cost = m.cost === undefined ? undefined : Math.min(m.cost, m.revenue);
          const margin = cost === undefined ? 0 : m.revenue - cost;
          const t = tip(m);
          return <div key={m.key} className={`chart-col${active === i ? ' is-active' : ''}`} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(a => (a === i ? null : a))}>
            <div className="chart-bar" style={{ height: pct(m.revenue) }}>
              {cost === undefined ? <span className="seg" style={{ flexGrow: 1, background: 'var(--chart-unknown)' }} /> : <>
                {margin > 0 && <span className="seg seg-top" style={{ flexGrow: margin, background: 'var(--chart-margin)' }} />}
                {cost > 0 && <span className="seg" style={{ flexGrow: cost, background: 'var(--chart-cost)' }} />}</>}
              {m === current && m.revenue > 0 && active !== i && <span className="chart-cap">{compact(m.revenue)}</span>}
              {active === i && m.orders > 0 && <div className={`chart-tip${i >= months.length - 2 ? ' left' : ''}`}><strong>{t.title}</strong>{t.rows.map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}</div>}
            </div>
            <span className="chart-x">{m.label}</span>
          </div>;
        })}</div>
      </div>
      <details className="chart-table"><summary>Ver em tabela</summary>
        <div className="table-wrap"><table><thead><tr><th>Mês</th><th>Pedidos</th><th>Vendido</th><th>Custo estimado</th><th>Saldo estimado</th></tr></thead>
          <tbody>{months.map(m => <tr key={m.key}><td>{m.longLabel}</td><td>{m.orders}</td><td>{money(m.revenue)}</td><td>{m.cost === undefined ? 'não calculável' : money(m.cost)}</td><td>{m.cost === undefined ? '—' : money(m.revenue - m.cost)}</td></tr>)}</tbody></table></div>
      </details></>}
  </section>;
}
