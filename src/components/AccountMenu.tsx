import { useEffect, useId, useRef, useState } from 'react';
import { LogOut, Settings, UserRound } from 'lucide-react';
import { useAccount } from '../account/AccountContext';
import type { Page } from '../utils';

/**
 * Menu do ícone de perfil (canto superior direito): quem está conectado, atalho para Configurações e o botão Sair.
 * Fecha com Esc, clique fora ou ao escolher uma opção; o foco volta para o ícone.
 */
export function AccountMenu({ focus, inform, className = '' }: { focus: (p: Page) => void; inform: (msg: string) => void; className?: string }) {
  const acc = useAccount();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const signedIn = acc.status === 'signed-in' && !!acc.session;
  const name = acc.session?.license?.holderName ?? null;
  const email = acc.session?.user.email ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  async function signOut() {
    setBusy(true);
    const r = await acc.signOut();
    setBusy(false); setOpen(false);
    inform(r.ok ? 'Você saiu desta conta. Seus dados continuam neste dispositivo.' : r.message);
  }
  // Setas para cima/baixo percorrem as opções (padrão de menu).
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return <div className={`account-menu ${className}`} ref={wrap}>
    <button ref={trigger} type="button" className="avatar avatar-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label="Menu da conta" title="Conta" onClick={() => setOpen(o => !o)}><UserRound size={16} aria-hidden="true" /></button>
    {open && <div className="account-dropdown" id={menuId} role="menu" aria-label="Conta" onKeyDown={onMenuKey}>
      <div className="account-who">{signedIn ? <><strong>{name ?? email}</strong>{name && <span>{email}</span>}</> : <><strong>Sem conta conectada</strong><span>Dados salvos neste dispositivo</span></>}</div>
      <button type="button" role="menuitem" onClick={() => { close(); focus('settings'); }}><Settings size={16} aria-hidden="true" /> Configurações</button>
      {signedIn && <button type="button" role="menuitem" className="danger" disabled={busy} onClick={() => void signOut()}><LogOut size={16} aria-hidden="true" /> {busy ? 'Saindo…' : 'Sair'}</button>}
    </div>}
  </div>;
}
