/**
 * Assistentes virtuais do suporte (IA). Os nomes homenageiam os gêmeos do fundador; cada conversa fica com um deles do começo ao fim,
 * e as conversas novas de cada cliente alternam entre os dois.
 */
export type AssistantId = 'bianca' | 'davi';
export const ASSISTANTS: Record<AssistantId, { name: string; avatar: string }> = {
  bianca: { name: 'Bianca', avatar: '/support/bianca.webp' },
  davi: { name: 'Davi', avatar: '/support/davi.webp' },
};
/** Conversas antigas (sem assistente gravado) são da Bianca. */
export const assistantOf = (id: string | null | undefined): AssistantId => (id === 'davi' ? 'davi' : 'bianca');
/** Alterna pelo número de conversas que a pessoa já abriu: 1ª Bianca, 2ª Davi, 3ª Bianca... */
export const nextAssistant = (previousTickets: number): AssistantId => (previousTickets % 2 === 0 ? 'bianca' : 'davi');
