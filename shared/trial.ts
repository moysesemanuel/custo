/**
 * Regra do período de teste, usada pelo Worker, pelo app e pela página de vendas (um único número para tudo).
 * A licença de teste guarda `trial_days`; o prazo começa no PRIMEIRO acesso (ativação da conta, termos 7.2).
 */
export const TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

export type LicenseStatusDb = 'active' | 'revoked';
/** Situação efetiva: uma licença ativa com o teste vencido vale como 'expired'. */
export type EffectiveStatus = 'active' | 'revoked' | 'expired';

export const isTrialOver = (expiresAt: string | null | undefined, nowIso: string): boolean => !!expiresAt && expiresAt <= nowIso;

export function effectiveStatus(l: { status: LicenseStatusDb; expires_at?: string | null }, nowIso: string): EffectiveStatus {
  if (l.status !== 'active') return 'revoked';
  return isTrialOver(l.expires_at, nowIso) ? 'expired' : 'active';
}

/** Fim do teste a partir do primeiro acesso. */
export const trialEndsAt = (activatedAtIso: string, days: number): string => new Date(new Date(activatedAtIso).getTime() + days * DAY_MS).toISOString();

/** Dias restantes (arredondado para cima; 0 quando já terminou). */
export const trialDaysLeft = (expiresAt: string, nowIso: string): number => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - new Date(nowIso).getTime()) / DAY_MS));
