import { CreditCard, Gauge } from 'lucide-react';
import { capacityLevel, FREE_TIER_CAPACITY, PAID_PLANS } from '../../shared/capacity';
import type { Metrics } from './adminClient';

const LEVEL = {
  ok: { label: 'Dentro da meta', cls: 'tag green', text: 'Dá para continuar no plano gratuito com folga.' },
  'above-goal': { label: 'Acima da meta', cls: 'tag orange', text: 'Ainda cabe no gratuito, mas a folga acabou. Acompanhe os painéis da Cloudflare e do Resend.' },
  alert: { label: 'Alerta', cls: 'tag orange', text: 'Perto do limite gratuito. Hora de planejar o plano pago.' },
  action: { label: 'Migrar', cls: 'tag red', text: 'Uso próximo do limite gratuito: contrate o plano pago antes que o serviço seja interrompido.' },
} as const;

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, max ? (value / max) * 100 : 0);
  return <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><span style={{ width: `${pct}%` }} className={pct >= 100 ? 'over' : pct >= 80 ? 'warn' : ''} /></div>;
}

/** Plano gratuito (meta de contas para continuar sem custo) e Pagamentos (prepara o espaço para quando a venda de planos existir). */
export function AdminCapacity({ m }: { m: Metrics }) {
  const goal = FREE_TIER_CAPACITY.pessimistic;
  const active = m.activeUsers.d7;
  const level = LEVEL[capacityLevel(active, goal)];
  return <div className="admin-charts">
    <section className="card admin-chart" aria-label="Plano gratuito"><div className="cap-head"><span className="icon-box"><Gauge size={20} /></span><h2 className="section-title" style={{ margin: 0 }}>Plano gratuito</h2><span className={level.cls}>{level.label}</span></div>
      <p className="muted">{level.text}</p>
      <div className="cap-row"><div><strong className="cap-big">{active}</strong><span className="muted"> de {goal} contas ativas</span></div><Meter value={active} max={goal} label={`Contas ativas: ${active} de ${goal}`} /></div>
      <p className="footnote" style={{ marginTop: 6 }}>Contas que usaram o app nos últimos 7 dias (conta conservadora: como se todas usassem todo dia). A meta de {goal} contas é o cenário de uso intenso, com metade da cota gratuita de reserva; no uso típico cabem cerca de {FREE_TIER_CAPACITY.typical}. Estimativa medida em {FREE_TIER_CAPACITY.measuredAt}.</p>
      <div className="cap-row"><div><strong className="cap-big">{m.email.today}</strong><span className="muted"> de {m.email.dailyLimit} e-mails de login hoje</span></div><Meter value={m.email.today} max={m.email.dailyLimit} label={`E-mails hoje: ${m.email.today} de ${m.email.dailyLimit}`} /></div>
      <p className="footnote" style={{ marginTop: 6 }}>Limite que o próprio app impõe (o Resend gratuito permite 100 por dia). Zera à meia-noite UTC (21h em Brasília).</p>
      <div className="cap-row"><div><strong className="cap-big">{m.supportAi.today}</strong><span className="muted"> de {m.supportAi.dailyLimit} respostas da IA do suporte hoje</span></div><Meter value={m.supportAi.today} max={m.supportAi.dailyLimit} label={`Respostas da IA hoje: ${m.supportAi.today} de ${m.supportAi.dailyLimit}`} /></div>
      <p className="footnote" style={{ marginTop: 6 }}>{m.supportAi.provider === 'anthropic' ? 'Claude (pago por uso).' : 'Workers AI na cota gratuita da Cloudflare.'} Acima do limite, as dúvidas vão direto para a caixa de Suporte. Os números oficiais estão nos painéis da Cloudflare (Workers, D1 e Workers AI) e do Resend.</p>
    </section>
    <section className="card admin-chart" aria-label="Pagamentos"><div className="cap-head"><span className="icon-box"><CreditCard size={20} /></span><h2 className="section-title" style={{ margin: 0 }}>Pagamentos</h2><span className="tag">Em breve</span></div>
      <p className="muted">A venda de planos ainda não está ativa. Quando estiver, aqui aparecem os assinantes, a receita do mês e os pagamentos recentes, lado a lado com o custo da infraestrutura paga, para saber quando a receita cobre a migração.</p>
      <div className="cap-grid"><div><span className="metric-label">Assinantes ativos</span><strong className="cap-big">—</strong></div><div><span className="metric-label">Receita do mês</span><strong className="cap-big">—</strong></div></div>
      <h3 className="ref-subtitle">Planos pagos de referência</h3>
      <ul className="ref-list">{PAID_PLANS.map(p => <li key={p.name}><span>{p.name}</span><strong><a href={p.url} target="_blank" rel="noopener noreferrer">a partir de {p.from}</a></strong></li>)}</ul>
      <p className="footnote">Valores de referência em dólar; confira o preço atual antes de contratar.</p>
    </section>
  </div>;
}
