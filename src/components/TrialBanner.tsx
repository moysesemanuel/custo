import { Clock } from 'lucide-react';
import { useAccount } from '../account/AccountContext';
import { trialDaysLeft } from '../../shared/trial';
import { trialContactLink } from '../support';

/** Faixa no topo durante o teste: quantos dias faltam e um atalho para pedir mais tempo ou assinar. Some em licenças sem prazo. */
export function TrialBanner() {
  const acc = useAccount();
  const lic = acc.session?.license;
  if (acc.status !== 'signed-in' || lic?.status !== 'active' || !lic.expiresAt) return null;
  const left = trialDaysLeft(lic.expiresAt, new Date().toISOString());
  const day = new Date(lic.expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const link = trialContactLink();
  const text = left <= 0 ? 'Seu teste grátis termina hoje.' : left === 1 ? 'Falta 1 dia do seu teste grátis' : `Faltam ${left} dias do seu teste grátis`;
  return <div className={`trial-banner${left <= 3 ? ' urgent' : ''}`} role="status">
    <Clock size={16} aria-hidden="true" /><span>{text}{left > 0 && <> (até {day})</>}. Quer mais tempo ou assinar?</span>
    <a href={link.href} {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{link.label}</a>
  </div>;
}
