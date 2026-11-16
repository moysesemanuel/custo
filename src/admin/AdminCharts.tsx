import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Metrics } from './adminClient';

/** Cores validadas (contraste e daltonismo) — as mesmas do gráfico do app. Série 1 = verde, série 2 = laranja. */
const C1 = '#00917C', C2 = '#D9603F', GRID = '#E3EBE6', INK = '#586660';
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const axis = { stroke: INK, fontSize: 12, tickLine: false, axisLine: false } as const;
const legendText = (v: string) => <span style={{ color: '#1F2326' }}>{v}</span>; // texto do legenda em tinta, não na cor da série
const tooltip = { contentStyle: { borderRadius: 10, border: '1px solid #D5E1DB', fontSize: 13 }, labelStyle: { fontWeight: 700, color: '#1F2326' }, cursor: { fill: '#F0F5F2' } } as const;

function ChartCard({ title, hint, children, table }: { title: string; hint: string; children: React.ReactNode; table?: React.ReactNode }) {
  return <section className="card admin-chart" aria-label={title}><h2 className="section-title">{title}</h2><p className="muted" style={{ marginTop: 0 }}>{hint}</p>
    <div className="admin-chart-plot" aria-hidden="true">{children}</div>
    {table && <details className="chart-table"><summary>Ver em tabela</summary><div className="table-wrap">{table}</div></details>}</section>;
}

export function AdminCharts({ m }: { m: Metrics }) {
  const weeks = m.weeks.map(w => ({ ...w, label: shortDate(w.start) }));
  const statuses = [
    { name: 'Permanentes', value: m.licenses.permanent },
    { name: 'Em teste', value: m.licenses.trialRunning },
    { name: 'Teste vence em 3 dias', value: m.licenses.trialEnding },
    { name: 'Aguardando 1º acesso', value: m.licenses.trialNotStarted },
    { name: 'Teste encerrado', value: m.licenses.trialEnded },
    { name: 'Suspensas', value: m.licenses.suspended },
  ];
  const funnel = [
    { name: 'Cadastrados', value: m.funnel.registered },
    { name: 'Já entraram', value: m.funnel.loggedIn },
    { name: 'Com pedido', value: m.funnel.withOrders },
    { name: 'Usaram em 7 dias', value: m.funnel.active7d },
  ];
  const weekTable = <table><thead><tr><th>Semana de</th><th>Cadastros</th><th>1º acesso</th><th>Pedidos</th><th>Links</th></tr></thead><tbody>{weeks.map(w => <tr key={w.start}><td>{shortDate(w.start)}</td><td>{w.signups}</td><td>{w.firstLogins}</td><td>{w.orders}</td><td>{w.quotes}</td></tr>)}</tbody></table>;
  const listTable = (rows: { name: string; value: number }[]) => <table><tbody>{rows.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.value}</td></tr>)}</tbody></table>;
  const hbarHeight = (n: number) => 36 * n + 20;

  return <div className="admin-charts">
    <ChartCard title="Novos clientes por semana" hint="Cadastros feitos no painel e primeiros acessos ao app, nas últimas 12 semanas." table={weekTable}>
      <ResponsiveContainer width="100%" height={240}><BarChart data={weeks} barGap={2} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltip} labelFormatter={l => `Semana de ${l}`} /><Legend iconType="square" wrapperStyle={{ fontSize: 13 }} formatter={legendText} />
        <Bar dataKey="signups" name="Cadastros" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="firstLogins" name="Primeiro acesso" fill={C2} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart></ResponsiveContainer>
    </ChartCard>
    <ChartCard title="Uso do app por semana" hint="Quantos pedidos foram registrados e quantos links de orçamento foram publicados (só a contagem)." table={weekTable}>
      <ResponsiveContainer width="100%" height={240}><LineChart data={weeks} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltip} cursor={{ stroke: GRID }} labelFormatter={l => `Semana de ${l}`} /><Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} formatter={legendText} />
        <Line type="monotone" dataKey="orders" name="Pedidos registrados" stroke={C1} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="quotes" name="Links publicados" stroke={C2} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart></ResponsiveContainer>
    </ChartCard>
    <ChartCard title="Situação das licenças" hint="Como estão hoje as licenças cadastradas." table={listTable(statuses)}>
      <ResponsiveContainer width="100%" height={hbarHeight(statuses.length)}><BarChart data={statuses} layout="vertical" margin={{ top: 0, right: 36, left: 8, bottom: 0 }}>
        <XAxis type="number" hide allowDecimals={false} /><YAxis type="category" dataKey="name" width={150} {...axis} />
        <Tooltip {...tooltip} formatter={v => [v, 'Licenças']} />
        <Bar dataKey="value" fill={C1} radius={[0, 4, 4, 0]} maxBarSize={18}><LabelList dataKey="value" position="right" style={{ fill: '#1F2326', fontSize: 12, fontWeight: 700 }} /></Bar>
      </BarChart></ResponsiveContainer>
    </ChartCard>
    <ChartCard title="Do cadastro ao uso" hint="Quantos clientes chegaram a cada etapa." table={listTable(funnel)}>
      <ResponsiveContainer width="100%" height={hbarHeight(funnel.length)}><BarChart data={funnel} layout="vertical" margin={{ top: 0, right: 36, left: 8, bottom: 0 }}>
        <XAxis type="number" hide allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} {...axis} />
        <Tooltip {...tooltip} formatter={v => [v, 'Clientes']} />
        <Bar dataKey="value" fill={C1} radius={[0, 4, 4, 0]} maxBarSize={18}><LabelList dataKey="value" position="right" style={{ fill: '#1F2326', fontSize: 12, fontWeight: 700 }} /></Bar>
      </BarChart></ResponsiveContainer>
    </ChartCard>
  </div>;
}
