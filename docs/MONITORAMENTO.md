# Monitoramento: runbook do beta (só ferramentas gratuitas)

Nenhum serviço pago e nenhuma configuração remota nova. As consultas abaixo são **somente leitura**.

## Onde olhar

| Métrica | Como ver | Referência |
|---|---|---|
| Requisições, erros e CPU do Worker | Painel → Workers → `dabi-custo-api` (ou `dabi-orcamentos-staging`) → *Metrics*; *Invocation statuses* mostra `exceededCpu` e `error` | Limite gratuito: 100 mil requisições por dia (Pages Functions inclusas) e 10 ms de CPU por requisição |
| Pages Functions | Painel → Pages → `dabi-custo` → *Functions metrics* | Contam na mesma cota do Workers |
| Linhas lidas e gravadas no D1 (24 h) | `npx wrangler d1 info dabi-custo-producao` (`rows_read_24h`, `rows_written_24h`) | Gratuito: 5 milhões de leituras e 100 mil escritas por dia |
| Tamanho do D1 | o mesmo comando (`database_size`) | 500 MB por banco no plano gratuito |
| Uso do Resend | Painel do Resend → *Emails* | Gratuito: 100 por dia e 3.000 por mês. O app limita a 80 por dia |
| Saúde | `curl -s https://custo.dabitech.com.br/api/_edge/health` | `{"ok":true,"env":"production","binding":true}` |
| Sincronização de um usuário | No navegador dele: `localStorage.setItem('custo:debug-sync','1')`, recarregar e ver as linhas `[sync]` no console (fase, revisões e contagens; sem conteúdo) | — |

## Frequência e limiares

**Frequência:** diária na primeira semana; depois, 3 vezes por semana.

| Sinal | Investigar se | Agir já se |
|---|---|---|
| `rows_written_24h` | Mais de 300 por conta ativa (o modelo prevê cerca de 250 no típico e 780 no pessimista) | Mais de 50 mil por dia (50% da cota gratuita) |
| Requisições por dia | Mais de 400 por conta ativa | Mais de 50 mil por dia |
| `exceededCpu` ou `error` | Qualquer ocorrência repetida | Mais de 1% das invocações |
| Health | — | `ok:false`, `binding:false` ou `env` errado |
| E-mails por dia | Mais de 40 | Perto de 80 (limite do app) ou de 100 (Resend) |
| `clientIpReceived` (`/api/admin/me`) | — | `false` em produção (limite por IP compartilhado) |

## Procedimentos

### 1. Gravações aumentando sem atividade (padrão do laço de 14/11/2026)

**Sinal:** a revisão de uma conta sobe sozinha e uma mesma encomenda é regravada sem que ninguém edite.

1. Identifique a conta e o registro, só leitura:
   ```
   npm run d1 -- query --env production --command "SELECT user_id, revision, updated_at FROM sync_state ORDER BY updated_at DESC LIMIT 5"
   ```
   depois `SELECT id, rev FROM orders WHERE user_id = '<id>' ORDER BY rev DESC LIMIT 5`. Repita depois de 5 a 10 minutos e compare `rev`.
2. Peça a quem usa essa conta para **recarregar todas as abas**. Uma versão antiga em cache é a causa mais provável: foi o que aconteceu em 14/11.
3. Se continuar com todas as abas recarregadas:
   - ative `custo:debug-sync` e colete as linhas `[sync]`;
   - um `POST` aceito seguido de novo `POST` da mesma entidade indica eco divergente. A proteção do app para depois de 1 envio com "Precisa de atenção"; se não parar, é defeito novo;
   - siga `DIAGNOSTICO_SYNC_ETAPA_11.md`.
4. Não apague dados, não mude revisões e não restaure backup para "parar" o laço.

### 2. Falhas de login

1. Teste com uma conta própria.
2. **503:** e-mail não configurado. Confira os nomes dos secrets (`wrangler secret list`) e o `EMAIL_FROM`.
3. **429 para todos:** limite global de 80 e-mails por dia, ou IP compartilhado (`clientIpReceived=false`).
4. **E-mail não chega:** painel do Resend (rejeições e domínio verificado).

### 3. Indisponibilidade

1. Health e <https://www.cloudflarestatus.com/>.
2. Se for a Cloudflare, aguarde. Os usuários continuam trabalhando offline e as alterações ficam no aparelho até voltar.
3. Se for uma publicação nossa: republique a revisão anterior do **Pages** (mesmo protocolo). No Worker, corrija para a frente (`IMPLANTACAO_PRODUCAO.md`).

### 4. Escritas ou requisições perto da cota

Gargalo medido: as escritas no D1. Confira primeiro o procedimento 1, porque um laço explica picos. Sem laço e acima de 50% de forma sustentada, considere o Workers Paid (US$ 5/mês, decisão do proprietário).

### 5. Incidente com dados pessoais

1. **Conter:** revogue sessões ou licenças no painel e pare o vetor.
2. **Preservar:** exporte o D1 com manifesto e anote horários.
3. **Avaliar:** quais dados, quantos titulares, qual o risco.
4. **Comunicar** à ANPD e aos titulares quando houver risco ou dano relevante (art. 48 da LGPD), no prazo da regulamentação vigente. Confirme com a assessoria jurídica.
5. **Registrar** o ocorrido e a correção.
