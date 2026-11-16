# Suporte (botão no app + caixa no /admin)

- **Cliente:** botão laranja no canto inferior direito de todas as telas do app. Tipos: **Dúvida** (passa pelo assistente de IA), **Sugestão** e **Reclamação** (vão direto para a equipe). A conversa continua no mesmo painel; resposta da equipe aparece como "Resposta nova". Depois de uma resposta da IA, "Ainda preciso de ajuda" encaminha para a equipe.
- **Equipe:** `/admin` → **Suporte**. Filtro "Aguardando você" (status `open`) ou todas; abre a conversa (com o que a IA respondeu), responde e encerra.
- **Dados:** tabelas `support_tickets` e `support_messages` (migração 0015). Mensagens até 2.000 caracteres; 20 mensagens por pessoa por dia.

## Assistente de IA

- Responde **só** com base no manual em `shared/supportKnowledge.ts` (atualize quando uma tela mudar). Recebe **apenas o texto da conversa** — nenhum dado de receitas, pedidos ou clientes. Fora do manual (problema técnico, pedido de mais tempo, cobrança, reclamação), responde `[ENCAMINHAR]` e a conversa fica para a equipe.
- **Provedor padrão:** Workers AI (binding `AI` no `wrangler.toml`), modelo `@cf/meta/llama-4-scout-17b-16e-instruct`, na **cota gratuita** (10.000 neurons/dia). O app limita a `SUPPORT_AI_DAILY_LIMIT` respostas por dia (padrão 80); acima disso, ou em qualquer erro, a dúvida vai para a equipe. Uso do dia: card "Plano gratuito" na Visão geral do /admin.
- **Trocar pelo Claude (pago, melhor qualidade):**
  1. Crie a chave em platform.claude.com (conta de API, créditos pré-pagos; a assinatura do Claude não serve).
  2. Grave a chave como segredo, digitando você mesmo: `npx wrangler secret put ANTHROPIC_API_KEY --env production` (dentro de `worker/`).
  3. Defina `SUPPORT_AI_PROVIDER = "anthropic"` em `[env.production.vars]` (modelo padrão `claude-haiku-5-5`; `SUPPORT_AI_MODEL` troca) e publique o Worker.
  4. **Atualize a Política de Privacidade:** inclua a Anthropic entre os fornecedores (hoje o texto cita só a Cloudflare para a IA).
  Custo estimado: cerca de US$ 0,0007 por pergunta (manual em cache), ou seja, cerca de US$ 0,70 a cada mil perguntas.
