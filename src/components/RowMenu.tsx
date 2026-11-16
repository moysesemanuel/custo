import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

export type RowAction = { label: string; /** Nome completo para leitores de tela (ex.: "Editar Farinha"); começa pelo texto visível. */ ariaLabel?: string; icon?: ReactNode; danger?: boolean; onSelect: () => void };

/** Botão ⋯ de uma linha de lista, com as ações dela (Editar, Excluir...). Esc ou clique fora fecha; setas percorrem as opções. */
export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };
  return <div className="row-menu" ref={wrap}>
    <button ref={trigger} type="button" className="inline-icon row-menu-trigger" aria-label={label} title="Ações" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(o => !o)}><MoreVertical size={17} aria-hidden="true" /></button>
    {open && <div className="row-menu-list" id={id} role="menu" aria-label={label} onKeyDown={onMenuKey}>
      {actions.map(a => <button key={a.label} type="button" role="menuitem" aria-label={a.ariaLabel} className={a.danger ? 'danger' : undefined} onClick={() => { setOpen(false); a.onSelect(); }}>{a.icon}{a.label}</button>)}
    </div>}
  </div>;
}
