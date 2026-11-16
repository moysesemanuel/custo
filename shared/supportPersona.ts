/**
 * Assistentes virtuais do suporte (IA). Os nomes homenageiam os gêmeos do fundador; cada conversa fica com um deles do começo ao fim,
 * e as conversas novas alternam entre os dois (entre todos os clientes, não por cliente).
 */
export type AssistantId = 'bianca' | 'davi';
export const ASSISTANTS: Record<AssistantId, { name: string; avatar: string }> = {
  bianca: { name: 'Bianca', avatar: '/support/bianca.webp' },
  davi: { name: 'Davi', avatar: '/support/davi.webp' },
};
/** Conversas antigas (sem assistente gravado) são da Bianca. */
export const assistantOf = (id: string | null | undefined): AssistantId => (id === 'davi' ? 'davi' : 'bianca');
/** A conversa nova fica com quem NÃO atendeu a última conversa aberta no app (de qualquer cliente); a primeira de todas é da Bianca. */
export const nextAssistant = (lastAssistant: string | null | undefined): AssistantId => (lastAssistant == null ? 'bianca' : assistantOf(lastAssistant) === 'bianca' ? 'davi' : 'bianca');
