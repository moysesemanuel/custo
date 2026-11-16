import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, LifeBuoy, MessageSquarePlus, Send, UserRound, X } from 'lucide-react';
import { useAccount } from '../../account/AccountContext';
import type { SupportKind, SupportTicket } from './supportClient';
import { SUPPORT_EMAIL } from '../../support';
import { ASSISTANTS, assistantOf } from '../../../shared/supportPersona';

const KIND_LABEL: Record<SupportKind, string> = { question: 'Dúvida', suggestion: 'Sugestão', complaint: 'Reclamação' };
const STATUS_LABEL: Record<SupportTicket['status'], string> = { open: 'Aguardando a equipe', answered: 'Respondida', closed: 'Encerrada' };
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

type View = { name: 'list' } | { name: 'new' } | { name: 'thread'; id: string };

/** Botão de suporte (canto inferior direito, em todas as telas do app): dúvidas respondidas pelo assistente; sugestões e reclamações vão para a equipe. */
export function SupportWidget() {
  const acc = useAccount();
  const client = acc.support;
  const signedIn = acc.status === 'signed-in' && !!client;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ name: 'list' });
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [err, setErr] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!client) return;
    const r = await client.list();
    if (r.ok) { setTickets(r.value); setErr(''); } else setErr(r.message);
  }, [client]);
  // Uma leitura ao entrar (para o aviso de resposta nova); depois só quando o painel abre.
  useEffect(() => { if (signedIn) void load(); }, [signedIn, load]);
  useEffect(() => { if (open && signedIn) void load(); }, [open, signedIn, load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('[data-autofocus], button, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, view]);

  const unread = tickets?.filter(t => t.unread).length ?? 0;
  const put = (t: SupportTicket) => setTickets(list => [t, ...(list ?? []).filter(x => x.id !== t.id)]);
  const current = view.name === 'thread' ? tickets?.find(t => t.id === view.id) : undefined;
  useEffect(() => {
    if (current?.unread && client) { void client.markRead(current.id); setTickets(list => list?.map(t => (t.id === current.id ? { ...t, unread: false } : t)) ?? null); }
  }, [current?.id, current?.unread, client]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <button ref={trigger} type="button" className="support-fab" aria-label={unread ? `Suporte (${unread} resposta${unread > 1 ? 's' : ''} nova${unread > 1 ? 's' : ''})` : 'Suporte'} aria-expanded={open} aria-controls="support-panel" onClick={() => setOpen(o => !o)}>
      {open ? <X size={22} aria-hidden="true" /> : <LifeBuoy size={22} aria-hidden="true" />}{!open && unread > 0 && <span className="support-badge" aria-hidden="true">{unread}</span>}
    </button>
    {open && <div ref={panel} id="support-panel" className="support-panel" role="dialog" aria-label="Suporte">
      <div className="support-head">
        {view.name !== 'list' && <button type="button" className="inline-icon" aria-label="Voltar" onClick={() => setView({ name: 'list' })}><ArrowLeft size={18} /></button>}
        <strong>{view.name === 'new' ? 'Nova mensagem' : current ? KIND_LABEL[current.kind] : 'Suporte'}</strong>
        <button type="button" className="inline-icon" aria-label="Fechar suporte" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={18} /></button>
      </div>
      <div className="support-body">
        {!signedIn ? <p className="muted">Entre na sua conta para falar com o suporte pelo app, ou escreva para <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
          : view.name === 'new' ? <NewMessage onSent={t => { put(t); setView({ name: 'thread', id: t.id }); }} />
          : current ? <Thread ticket={current} onChange={put} />
          : <>
            <p className="muted" style={{ marginTop: 0 }}>Tire dúvidas sobre o app, mande sugestões ou reclamações. Dúvidas são respondidas pela Bianca ou pelo Davi, nossos assistentes virtuais; se não resolverem, a equipe responde aqui.</p>
            <button type="button" className="primary" data-autofocus style={{ width: '100%' }} onClick={() => setView({ name: 'new' })}><MessageSquarePlus size={17} /> Nova mensagem</button>
            {err && <div className="notice warn" role="alert" style={{ marginTop: 12 }}>{err}</div>}
            {tickets && tickets.length > 0 && <><h3 className="support-subtitle">Suas conversas</h3><ul className="support-list">{tickets.map(t => <li key={t.id}><button type="button" onClick={() => setView({ name: 'thread', id: t.id })}>
              <span className="support-list-top"><strong>{KIND_LABEL[t.kind]}</strong>{t.unread && <span className="tag orange">Resposta nova</span>}<span className="muted">{when(t.updatedAt)}</span></span>
              <span className="support-list-text">{t.messages[0]?.body}</span><span className="muted" style={{ fontSize: 12 }}>{STATUS_LABEL[t.status]}</span></button></li>)}</ul></>}
            {tickets?.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Você ainda não enviou mensagens.</p>}
          </>}
      </div>
    </div>}
  </>;
}

function NewMessage({ onSent }: { onSent: (t: SupportTicket) => void }) {
  const acc = useAccount();
  const [kind, setKind] = useState<SupportKind>('question');
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!acc.support || !text.trim()) return;
    setBusy(true); setErr('');
    const r = await acc.support.create(kind, text.trim()); setBusy(false);
    if (r.ok) onSent(r.value); else setErr(r.message);
  }
  return <form className="stack" onSubmit={submit} style={{ gap: 12 }}>
    <fieldset className="support-kinds"><legend className="sr-only">Tipo de mensagem</legend>{(Object.keys(KIND_LABEL) as SupportKind[]).map(k => <label key={k} className={kind === k ? 'active' : ''}><input type="radio" name="support-kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />{KIND_LABEL[k]}</label>)}</fieldset>
    <label htmlFor="support-text" className="sr-only">Mensagem</label>
    <textarea id="support-text" data-autofocus className="support-textarea" rows={5} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder={kind === 'question' ? 'Ex.: Como cadastro uma embalagem?' : kind === 'suggestion' ? 'Conte sua ideia para melhorar o app.' : 'Conte o que aconteceu.'} />
    {busy && kind === 'question' && <p className="muted" role="status" style={{ margin: 0 }}>Escrevendo a resposta. Pode levar até 2 minutos.</p>}
    {err && <div className="notice warn" role="alert">{err}</div>}
    <button className="primary" disabled={busy || !text.trim()}><Send size={16} /> {busy ? 'Enviando…' : 'Enviar'}</button>
    {kind !== 'question' && <p className="footnote" style={{ margin: 0 }}>Vai direto para a equipe. A resposta aparece aqui.</p>}
  </form>;
}

function Thread({ ticket, onChange }: { ticket: SupportTicket; onChange: (t: SupportTicket) => void }) {
  const acc = useAccount();
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [ticket.messages.length]);
  const last = ticket.messages[ticket.messages.length - 1];
  const aiWaiting = ticket.status === 'answered' && last?.author === 'ai';
  async function run(fn: () => Promise<{ ok: true; value: SupportTicket } | { ok: false; message: string }>) {
    setBusy(true); setErr(''); const r = await fn(); setBusy(false);
    if (r.ok) { onChange(r.value); setText(''); } else setErr(r.message);
  }
  return <div className="stack" style={{ gap: 10 }}>
    <ul className="support-thread">{ticket.messages.map(m => <li key={m.id} className={`msg ${m.author}`}>
      <span className="msg-who">{m.author === 'user' ? 'Você' : m.author === 'ai' ? <><img className="support-avatar" src={ASSISTANTS[assistantOf(ticket.assistant)].avatar} alt="" width={28} height={28} /><strong>{ASSISTANTS[assistantOf(ticket.assistant)].name}</strong> · assistente virtual</> : <><UserRound size={13} aria-hidden="true" /> Equipe Custô</>} · {when(m.createdAt)}</span>
      <div className="msg-body">{m.body}</div></li>)}</ul>
    <div ref={end} />
    {ticket.status === 'open' && <p className="muted" role="status" style={{ margin: 0, fontSize: 13 }}>Recebemos sua mensagem. A equipe responde por aqui; avisamos com "Resposta nova".</p>}
    {aiWaiting && <div className="support-ai-actions"><span className="muted" style={{ fontSize: 13 }}>A resposta ajudou?</span><button type="button" className="secondary" disabled={busy} onClick={() => void run(() => acc.support!.escalate(ticket.id))}>Ainda preciso de ajuda</button></div>}
    {ticket.status === 'closed' ? <p className="muted" style={{ fontSize: 13 }}>Conversa encerrada. Para outro assunto, mande uma nova mensagem.</p>
      : <form className="support-reply" onSubmit={e => { e.preventDefault(); if (text.trim()) void run(() => acc.support!.reply(ticket.id, text.trim())); }}>
        <label htmlFor="support-reply" className="sr-only">Responder</label>
        <textarea id="support-reply" className="support-textarea" rows={2} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Escreva aqui…" />
        <button className="primary" aria-label="Enviar resposta" disabled={busy || !text.trim()}><Send size={16} /></button>
      </form>}
    {busy && ticket.kind === 'question' && <p className="muted" role="status" style={{ margin: 0, fontSize: 13 }}>Enviando… se for uma dúvida, a resposta pode levar até 2 minutos.</p>}
    {err && <div className="notice warn" role="alert">{err}</div>}
  </div>;
}
