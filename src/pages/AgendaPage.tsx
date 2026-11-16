import { itemsSummary } from '../domain/orders';
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { balanceDue } from '../domain/payments';
import { money } from '../domain/pricing';
import { buildAgenda, FORECAST_DISCLAIMER, formatMinutes, MONTH_NAMES, monthGrid, shiftMonth, WEEKDAY_NAMES, weekdayOf, workloadForecast, type Viability } from '../domain/schedule';
import type { Order } from '../domain/types';
import { brDate, localToday, type PageProps } from '../utils';

const VIABILITY: Record<Exclude<Viability, 'unknown'>, { label: string; className: string }> = {
  ok: { label: 'Com folga', className: 'tag green' }, tight: { label: 'Apertado', className: 'tag orange' }, overload: { label: 'Sobrecarga', className: 'tag red' },
};
const STATUSES: Order['status'][] = ['Orçamento', 'Confirmado', 'Produção', 'Entregue'];

export function AgendaPage({ data, update, focus, openOrder }: PageProps) {
  const today = localToday();
  const [includeQuotes, setIncludeQuotes] = useState(false);
  const agenda = useMemo(() => buildAgenda(data.orders, today, includeQuotes), [data.orders, today, includeQuotes]);
  const forecast = useMemo(() => workloadForecast(data, today, 14), [data, today]);
  const setStatus = (id: string, status: Order['status']) => update(d => ({ ...d, orders: d.orders.map(o => (o.id === id ? { ...o, status } : o)) }));
  const hasCapacity = !!data.settings?.dailyCapacityMinutes;
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  // No calendário entram também as entregas já feitas (histórico); orçamentos só com "Incluir orçamentos".
  const byDate = useMemo(() => { const m = new Map<string, Order[]>(); for (const o of data.orders) { if (o.status === 'Orçamento' && !includeQuotes) continue; m.set(o.deliveryDate, [...(m.get(o.deliveryDate) ?? []), o]); } return m; }, [data.orders, includeQuotes]);
  const dayOrders = byDate.get(selected) ?? [];
  const pick = (date: string) => { setSelected(date); setMonth(date.slice(0, 7)); };
  const [yy, mm] = month.split('-').map(Number);
  const dayLabel = (date: string) => `${WEEKDAY_NAMES[weekdayOf(date)]}, ${Number(date.slice(8))} de ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]}`;
  const hiddenQuotes = includeQuotes ? 0 : data.orders.filter(o => o.status === 'Orçamento').length;

  const Row = ({ order, late }: { order: Order; late?: number }) => (
    <li className="agenda-row">
      <div><strong>{order.customer}</strong><div className="muted" style={{ fontSize: 13 }}>{itemsSummary(order, data.recipes)} · entrega {brDate(order.deliveryDate)}</div>
        <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {late !== undefined && <span className="tag red">{late} dia(s) de atraso</span>}
          {balanceDue(order) > 0 && <span className="tag orange">A receber {money(balanceDue(order))}</span>}
        </div></div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><button type="button" className="secondary" style={{ minHeight: 38, padding: '6px 12px' }} onClick={() => openOrder(order.id)} aria-label={`Ver pedido de ${order.customer}`}>Ver</button><select aria-label={`Status do pedido de ${order.customer}`} value={order.status} onChange={e => setStatus(order.id, e.target.value as Order['status'])} style={{ width: 150, height: 38 }}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
    </li>
  );
  const List = ({ items }: { items: { order: Order; late?: number }[] }) => <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{items.map(i => <Row key={i.order.id} order={i.order} late={i.late} />)}</ul>;

  return <>
    <div className="head"><div><div className="eyebrow">Organização das entregas</div><h1>Agenda</h1><p className="muted">Entregas de hoje, dos próximos dias e atrasos, e uma estimativa da carga de produção.</p></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: 0 }}><input type="checkbox" checked={includeQuotes} onChange={e => setIncludeQuotes(e.target.checked)} style={{ width: 18, height: 18 }} /> Incluir orçamentos</label></div>

    {hiddenQuotes > 0 && <div className="notice" role="status" style={{ marginBottom: 19 }}>{hiddenQuotes} encomenda(s) em <strong>Orçamento</strong> não aparecem aqui até serem confirmadas. Mude o status em Encomendas, ou marque “Incluir orçamentos”.</div>}

    {agenda.overdue.length > 0 && <section className="card" style={{ marginBottom: 19, borderColor: 'var(--color-error-border)' }}><h2 className="section-title" style={{ color: 'var(--color-error)' }}>Atrasados ({agenda.overdue.length})</h2><List items={agenda.overdue.map(o => ({ order: o.order, late: o.daysLate }))} /></section>}

    <div className="two agenda-top">
      <section className="card" aria-labelledby="cal-title">
        <div className="cal-head"><h2 className="section-title" id="cal-title" style={{ margin: 0 }}>{MONTH_NAMES[mm - 1][0].toUpperCase() + MONTH_NAMES[mm - 1].slice(1)} de {yy}</h2>
          <div className="cal-nav"><button type="button" className="inline-icon" aria-label="Mês anterior" onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft size={18} /></button>
            <button type="button" className="secondary" style={{ minHeight: 34, padding: '4px 12px' }} onClick={() => pick(today)}>Hoje</button>
            <button type="button" className="inline-icon" aria-label="Próximo mês" onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight size={18} /></button></div></div>
        <table className="cal" aria-label="Calendário de entregas"><thead><tr>{WEEKDAY_NAMES.map(w => <th key={w} scope="col" abbr={w}>{w.slice(0, 3)}</th>)}</tr></thead>
          <tbody>{monthGrid(month).map(week => <tr key={week[0].date}>{week.map(({ date, inMonth }) => {
            const list = byDate.get(date) ?? []; const open = list.filter(o => o.status !== 'Entregue').length;
            const late = date < today && open > 0;
            return <td key={date}><button type="button" className={`cal-day${inMonth ? '' : ' out'}${date === today ? ' today' : ''}${date === selected ? ' selected' : ''}`} aria-pressed={date === selected}
              aria-label={`${dayLabel(date)}${list.length ? `, ${list.length} ${list.length === 1 ? 'entrega' : 'entregas'}${late ? ', com atraso' : ''}` : ', sem entregas'}`} onClick={() => pick(date)}>
              <span className="cal-num">{Number(date.slice(8))}</span>
              {list.length > 0 && <span className={`cal-count${late ? ' late' : open === 0 ? ' done' : ''}`} aria-hidden="true">{list.length}</span>}</button></td>;
          })}</tr>)}</tbody></table>
        <p className="footnote" style={{ marginTop: 10 }}>O número em cada dia é a quantidade de entregas. Vermelho: entrega em atraso. Cinza: todas entregues.</p>
      </section>
      <section className="card" aria-live="polite"><h2 className="section-title">{selected === today ? `Hoje · ${brDate(today)}` : dayLabel(selected)}</h2>
        {dayOrders.length ? <List items={dayOrders.map(order => ({ order }))} /> : <div className="empty"><CalendarDays size={30} />{selected === today ? 'Nenhuma entrega para hoje.' : 'Nenhuma entrega neste dia.'}</div>}
        {agenda.week.some(d => d.orders.length) && <><h2 className="section-title" style={{ marginTop: 22 }}>Próximos 6 dias</h2>
          <ul className="agenda-next">{agenda.week.filter(d => d.orders.length).map(d => <li key={d.date}><button type="button" className="secondary" onClick={() => pick(d.date)}><span>{d.weekday}, {brDate(d.date)}</span><strong>{d.orders.length} {d.orders.length === 1 ? 'entrega' : 'entregas'}</strong></button></li>)}</ul></>}
      </section>
    </div>
    <div style={{ marginTop: 19 }}>
      <section className="card"><h2 className="section-title">Carga de produção</h2>
        <p className="muted">Próximos 14 dias, com a carga acumulada até cada entrega.</p>
        {!hasCapacity && <div className="notice warn" style={{ margin: '12px 0' }}>Informe a capacidade diária em <button type="button" className="secondary" style={{ minHeight: 32, padding: '4px 10px' }} onClick={() => focus('settings')}>Configurações</button> para ver a estimativa.</div>}
        {forecast.length ? <div className="table-wrap"><table><thead><tr><th>Data</th><th>Pedidos</th><th>Carga / disponível</th><th>Situação</th></tr></thead><tbody>{forecast.map(f => <tr key={f.date}><td>{brDate(f.date)}</td><td>{f.orders}</td><td>{hasCapacity ? `${formatMinutes(f.requiredMinutes)} / ${formatMinutes(f.availableMinutes)}` : '—'}</td><td>{f.status === 'unknown' ? <span className="muted">—</span> : <span className={VIABILITY[f.status].className}>{VIABILITY[f.status].label}</span>}</td></tr>)}</tbody></table></div> : <div className="empty">Sem entregas nos próximos 14 dias.</div>}
        {forecast.some(f => f.ignored.length) && <p className="footnote">Alguns pedidos estão sem tempo de produção na receita e não entram na conta.</p>}
        <p className="footnote">{FORECAST_DISCLAIMER}</p>
      </section>
    </div>
  </>;
}
