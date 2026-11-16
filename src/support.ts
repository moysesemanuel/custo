/**
 * Contato de atendimento usado no app (faixa do período de teste, avisos).
 * WhatsApp: só dígitos com DDI e DDD (ex.: '5541999990000'). Enquanto for null, o app usa o e-mail.
 */
export const SUPPORT_EMAIL = 'contato@dabitech.com.br';
export const SUPPORT_WHATSAPP: string | null = null;

const TRIAL_MESSAGE = 'Olá! Estou usando o Custô no período de teste e gostaria de conversar sobre mais tempo de teste ou a assinatura.';
/** Link para pedir mais tempo ou assinar. Não leva dados da pessoa no endereço (só uma mensagem genérica). */
export const trialContactLink = (): { href: string; label: string; external: boolean } => SUPPORT_WHATSAPP
  ? { href: `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(TRIAL_MESSAGE)}`, label: 'Falar no WhatsApp', external: true }
  : { href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Custô: período de teste')}&body=${encodeURIComponent(TRIAL_MESSAGE)}`, label: 'Falar com a gente', external: false };
