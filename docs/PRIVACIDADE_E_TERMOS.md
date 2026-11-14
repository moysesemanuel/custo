# Privacidade, termos e operação (LGPD): minutas e pendências

> **Minutas pendentes de revisão jurídica.** Nada aqui é parecer jurídico nem garante conformidade. As páginas `/privacidade` e `/termos` (`src/legal/LegalPage.tsx`) descrevem o que o sistema faz hoje e deixam **visíveis** as informações que faltam, marcadas `[PENDENTE: …]`.

## Informações pendentes (precisam ser fornecidas antes do beta)

1. ~~Razão social e CNPJ~~ — fornecidos em 2026-11-14: 57.936.721 Moyses Emanuel Costa Silva, CNPJ 57.936.721/0001-25. **Endereço continua pendente.**
2. ~~Canal de privacidade (art. 41)~~ — contato@dabitech.com.br (também é o canal de suporte). Nome do encarregado não informado; a revisão jurídica decide se é exigido.
3. Base legal de cada tratamento (proposta técnica: execução de contrato, art. 7º, V, para conta e dados de trabalho; legítimo interesse ou segurança para limites anti-abuso e auditoria).
4. Papéis em relação aos **dados dos clientes finais** que o confeiteiro registra (o Custô como operador?) e as responsabilidades.
5. Transferência internacional: Cloudflare e Resend podem processar fora do Brasil (arts. 33 a 36).
6. Prazos de retenção definitivos (proposta em `EXCLUSAO_DE_CONTA.md`) e prazo de resposta aos titulares.
7. Condições comerciais do beta (preço, duração, o que acontece ao fim), horário de suporte (canal: contato@dabitech.com.br), cancelamento, foro.
8. Data de vigência dos documentos.

## Dados tratados (inventário verificado no esquema)

| Categoria | Onde | Observação |
|---|---|---|
| E-mail do usuário | `users`, `licenses`, `auth_codes` | Identificação e login |
| Sessões | `sessions` | Nome do dispositivo, datas, hash do token |
| Configurações do negócio | `sync_state.settings_json` | Nome e telefone, publicados nos orçamentos |
| Dados de trabalho | ingredientes, receitas, embalagens, encomendas, itens, recebimentos | Inclui **nomes de clientes finais** e observações livres |
| Orçamentos públicos | `quotes` | Só o que o usuário publica (sem custos e sem cliente final) |
| Anti-abuso | `rate_limits` | Hashes de e-mail e de IP, contadores temporários |
| Auditoria administrativa | `admin_audit` | Ações do administrador, ids opacos |
| No navegador | IndexedDB, `localStorage` | Cópia local para uso offline |

Fornecedores: Cloudflare (Pages, Workers, D1) e Resend (e-mail). Não há analytics, publicidade nem cookies de terceiros. O único cookie é o de sessão (`__Host-dabi_session`, HttpOnly, Secure, SameSite=Lax), que é necessário e não exige consentimento.

## O que é obrigação, boa prática e opcional

| Item | Classificação | Situação |
|---|---|---|
| Aviso de privacidade com finalidade, controlador e contato | Obrigação (transparência, art. 9º) | Minuta pronta, com pendências |
| Atender a pedidos do titular (acesso, correção, portabilidade, exclusão) | Obrigação (art. 18) | Exportação no app (*Backup*); exclusão em `EXCLUSAO_DE_CONTA.md`; correção pelo próprio app |
| Comunicar incidente relevante à ANPD e aos titulares | Obrigação (art. 48) | Procedimento em `MONITORAMENTO.md` (seção 5) |
| Medidas de segurança | Obrigação (art. 46) | Já implementadas (ver auditorias) |
| Termos de uso e condições do beta | Boa prática contratual | Minuta pronta |
| Registro das operações de tratamento | Boa prática; obrigação conforme o porte (regulamentação da ANPD) | A definir na revisão |
| Retenção com limpeza automática | Boa prática (minimização) | Proposta, não implementada |
| Banner de cookies | **Desnecessário** hoje: só há cookie estritamente necessário | — |
| Consentimento para usar o serviço | **Não introduzido**: a base proposta é a execução do contrato | — |

## Canal de suporte e incidentes

- **Canal:** contato@dabitech.com.br (suporte e privacidade). Falta definir horário e prazo de resposta.
- **Incidente com dados:** seguir `MONITORAMENTO.md` §5 (conter, preservar evidências, avaliar o risco, comunicar).
