# Privacidade, termos e operação (LGPD): minutas e pendências

> As páginas `/privacidade` e `/termos` (`src/legal/LegalPage.tsx`) estão publicadas como versão vigente (desde 14/11/2026), com os textos jurídicos fornecidos pelo proprietário. Nada aqui é parecer jurídico.

## Informações fornecidas e pendentes

Fornecido pelo proprietário em 2026-11-14 e publicado (texto literal, sem acréscimos):

- Controlador/fornecedor: 57.936.721 Moyses Emanuel Costa Silva, CNPJ 57.936.721/0001-25; endereço Rua Frederico Maurer, Boqueirão, Curitiba/PR, Brasil.
- Canal de privacidade e suporte: contato@dabitech.com.br (seg–qui 9h–18h, sex 9h–16h, Brasília).
- Bases legais e papéis (Custô controlador dos dados das contas; operador dos dados de clientes finais) — política, seção 4.
- Transferência internacional (Cloudflare, Resend) — política, seção 5.
- Condições do beta fechado (14 dias gratuitos, sem cobrança automática; alterado de 90 para 14 em 2026-11-14, antes de qualquer cliente) — termos, seção 7.
- Cancelamento e encerramento (aviso de 30 dias) e foro (Comarca de Curitiba/PR, ressalvados os direitos do consumidor) — termos, seções 8 e 9.

- Retenção: base ativa até a exclusão; até 7 dias no Time Travel do D1; até 90 dias nos backups agendados (`BACKUP_E_RECUPERACAO.md`); auditoria administrativa 365 dias.
- Resposta aos titulares: sem prazo fixo, "observados os prazos previstos na legislação" (atenção: a LGPD, art. 19, II, prevê 15 dias para a declaração completa quando pedida).
- Vigência: 14 de novembro de 2026. O aviso de minuta foi removido por decisão do proprietário.

Não há pendências marcadas nas páginas.

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

- **Canal:** contato@dabitech.com.br (suporte e privacidade). Horário: seg–qui 9h–18h, sex 9h–16h (Brasília), sem prazo garantido de resposta durante o beta.
- **Incidente com dados:** seguir `MONITORAMENTO.md` §5 (conter, preservar evidências, avaliar o risco, comunicar).
