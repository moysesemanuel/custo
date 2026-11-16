import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bot, Send, UserRound } from 'lucide-react';
import { ADMIN_MESSAGES, type AdminClient, type AdminFailure, type SupportInboxTicket } from './adminClient';

const KIND: Record<SupportInboxTicket['kind'], [string, string]> = { question: ['Dúvida', 'tag'], suggestion: ['Sugestão', 'tag green'], complaint: ['Reclamação', 'tag red'] };
const STATUS: Record<SupportInboxTicket['status'], [string, string]> = { open: ['Aguardando você', 'tag orange'], answered: ['Respondida', 'tag green'], closed: ['Encerrada', 'tag'] };
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Caixa de suporte: conversas dos clientes, com o que a IA respondeu; a equipe responde e encerra. */
export function SupportPanel({ api, fail, inform }: { api: AdminClient; fail: (r: AdminFailure) => void; inform: (m: string) => void }) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [data, setData] = useState<{ openCount: number; tickets: SupportInboxTicket[] } | null>(null);
  const [err, setErr] = useState(''); const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await api.support(filter); if (r.ok) { setData(r.value); setErr(''); } else { setErr(ADMIN_MESSAGES[r.reason]); fail(r.reason); } }, [api, filter, fail]);
  useEffect(() => { void load(); }, [load]);
  const t = data?.tickets.find(x => x.id === selected);
  return <>
    <div className="head"><div><h1>Suporte</h1><p className="muted">Dúvidas, sugestões e reclamações enviadas pelo botão de suporte do app. Dúvidas passam antes pelo assistente de IA.</p></div>
      <div className="admin-actions"><select aria-label="Filtrar conversas" value={filter} onChange={e => { setFilter(e.target.value as 'open' | 'all'); setSelected(null); }} style={{ height: 44 }}><option value="open">Aguardando você{data ? ` (${data.openCount})` : ''}</option><option value="all">Todas (últimas 50)</option></select><button className="secondary" onClick={() => void load()}>Atualizar</button></div></div>
    {err && <div className="notice error" role="alert">{err}</div>}
    <div className="support-admin">
      <ul className="admin-rows" aria-label="Conversas de suporte">{data?.tickets.map(x => <li key={x.id} className={`admin-row${x.id === selected ? ' is-selected' : ''}`}><div className="main"><strong>{x.customer.name ?? x.customer.email ?? 'Cliente removido'}</strong>
        <div className="meta"><span className={KIND[x.kind][1]}>{KIND[x.kind][0]}</span><span className={STATUS[x.status][1]}>{STATUS[x.status][0]}</span><span>{when(x.updatedAt)}</span></div>
        <p className="support-preview">{x.messages[0]?.body}</p></div><button className="secondary" onClick={() => setSelected(x.id)} aria-label={`Abrir conversa de ${x.customer.name ?? x.customer.email ?? 'cliente'}`}>Abrir</button></li>)}</ul>
      {data && !data.tickets.length && <div className="empty">{filter === 'open' ? 'Nenhuma conversa aguardando resposta.' : 'Nenhuma conversa ainda.'}</div>}
      {t && <Conversation key={t.id} t={t} api={api} fail={fail} done={async msg => { inform(msg); await load(); }} />}
    </div>
  </>;
}

function Conversation({ t, api, fail, done }: { t: SupportInboxTicket; api: AdminClient; fail: (r: AdminFailure) => void; done: (msg: string) => Promise<void> }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function reply(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await api.supportReply(t.id, text.trim()); setBusy(false);
    if (!r.ok) { setErr(ADMIN_MESSAGES[r.reason]); fail(r.reason); return; }
    setText(''); await done('Resposta enviada. O cliente vê "Resposta nova" no botão de suporte.');
  }
  async function close() { setBusy(true); const r = await api.supportClose(t.id); setBusy(false); if (!r.ok) { setErr(ADMIN_MESSAGES[r.reason]); fail(r.reason); return; } await done('Conversa encerrada.'); }
  return <section className="card stack" aria-label="Conversa" style={{ marginTop: 16 }}>
    <h2 className="section-title" style={{ margin: 0 }}>{KIND[t.kind][0]} de {t.customer.name ?? t.customer.email}</h2>
    {t.customer.email && <p className="muted" style={{ margin: 0 }}>{t.customer.email} · aberta em {when(t.createdAt)}</p>}
    <ul className="support-thread">{t.messages.map(m => <li key={m.id} className={`msg ${m.author === 'user' ? 'customer' : m.author}`}>
      <span className="msg-who">{m.author === 'user' ? 'Cliente' : m.author === 'ai' ? <><Bot size={13} aria-hidden="true" /> Assistente (IA)</> : <><UserRound size={13} aria-hidden="true" /> Equipe</>} · {when(m.createdAt)}</span>
      <div className="msg-body">{m.body}</div></li>)}</ul>
    {t.status !== 'closed' && <form className="stack" onSubmit={reply} style={{ gap: 10 }}>
      <label htmlFor="admin-support-reply" style={{ margin: 0 }}>Sua resposta</label>
      <textarea id="admin-support-reply" className="support-textarea" rows={4} maxLength={2000} value={text} onChange={e => setText(e.target.value)} />
      {err && <div className="notice error" role="alert">{err}</div>}
      <div className="admin-actions"><button className="primary" disabled={busy || !text.trim()}><Send size={16} /> Responder</button><button type="button" className="secondary" disabled={busy} onClick={() => void close()}>Encerrar conversa</button></div>
    </form>}
  </section>;
}
