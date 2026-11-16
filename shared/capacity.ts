/**
 * Capacidade estimada do plano gratuito (Cloudflare Workers/D1 + Resend), em CONTAS ATIVAS POR DIA, até 50% da cota que mais aperta
 * (escritas no D1). Fonte: `npm run costs` e docs/POLITICA_DE_CUSTOS.md (medição de 14/11/2026). São PROJEÇÕES com hipóteses explícitas,
 * não capacidade garantida: os números oficiais estão nos painéis dos provedores. Atualize ao rodar `npm run costs` de novo.
 */
export const FREE_TIER_CAPACITY = {
  measuredAt: '14/11/2026',
  /** Cenário pessimista (uso intenso): meta para continuar grátis com folga. */
  pessimistic: 64,
  /** Cenário típico. */
  typical: 201,
} as const;

/**
 * A meta (`pessimistic`) equivale a 50% da cota que mais aperta. A política de custos manda alertar em 60% da cota e agir em 80%,
 * ou seja, em 1,2× e 1,6× a meta.
 */
export function capacityLevel(active: number, goal: number): 'ok' | 'above-goal' | 'alert' | 'action' {
  const r = goal > 0 ? active / goal : 0;
  return r >= 1.6 ? 'action' : r >= 1.2 ? 'alert' : r >= 1 ? 'above-goal' : 'ok';
}

/** Referência de preço dos planos pagos (em dólar, por mês). Confira os valores atuais nas páginas antes de decidir. */
export const PAID_PLANS = [
  { name: 'Cloudflare Workers Paid (Workers + D1)', from: 'US$ 5/mês', url: 'https://developers.cloudflare.com/workers/platform/pricing/' },
  { name: 'Resend Pro (e-mails)', from: 'US$ 20/mês', url: 'https://resend.com/pricing' },
] as const;
