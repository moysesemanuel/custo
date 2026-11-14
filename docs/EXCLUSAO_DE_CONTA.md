# Exclusão de conta (pedido do titular)

Procedimento administrativo manual. O gerador **só cria arquivos SQL**: `worker/scripts/accountErasure.ts`, chamado por `npm run account:erasure-sql`. Ele foi testado em SQLite local com dados fictícios (`tests/account-erasure.test.ts`). Nenhuma exclusão real foi executada.

## Onde estão os dados de uma conta

| Tabela | Ligação | Conteúdo | Na exclusão |
|---|---|---|---|
| `users` | `id`, `email` | E-mail, datas | **Apagada** |
| `sessions` | `user_id` | Dispositivo, datas, hash do token | **Apagadas** (o login deixa de valer) |
| `auth_codes` | `email` | Hash do código, datas | **Apagados** |
| `licenses` | `user_id`, `email` | Licença | **Anonimizada**: sem e-mail e sem usuário, `revoked`, rótulo "conta excluída". O id opaco fica para a auditoria |
| `sync_state` | `user_id` | Revisão e configurações (nome e telefone do negócio) | **Apagado** |
| `ingredients`, `recipes`, `recipe_items`, `recipe_packaging_items`, `packagings` | `user_id` | Dados de trabalho | **Apagados** |
| `orders`, `order_items`, `order_payments` | `user_id` | Encomendas (nomes de clientes finais), itens, recebimentos e observações | **Apagados** |
| `quotes` | `owner_id` = licença | Orçamentos públicos | **Apagados** (o link passa a responder 404) |
| `rate_limits` | licença; `e_<sha256(email)>` | Contadores temporários | **Apagados**. Os contadores por IP não identificam a conta e expiram sozinhos |
| `admins` | `user_id` | Papel de administrador | **Recusa**: com administração ativa, o SQL não muda nada. Revogue o admin antes, por decisão consciente |
| `admin_audit` | ids opacos | Ações administrativas (sem e-mail gravado) | **Mantida** (segurança, 365 dias de retenção) |

**Fora do alcance do servidor:** a cópia no navegador do titular (IndexedDB), arquivos de backup exportados pelo próprio titular e backups do operador (removidos pelo ciclo de retenção; ver `BACKUP_E_RECUPERACAO.md`).

## Procedimento

1. **Confirmar a identidade:** o pedido vem do e-mail da conta. Registre a data do pedido.
2. **Oferecer exportação:** o titular pode baixar os próprios dados em *Backup* antes.
3. **Backup do ambiente:** `npm run d1 -- export --env production --output <fora-do-repo>/antes-exclusao-<data>.sql`, depois `backup:manifest`.
4. **Gerar os arquivos, fora do repositório:** `npm run account:erasure-sql -- --email <e-mail> --output <fora-do-repo>/exclusao-<data>`. O comando recusa sobrescrever arquivos existentes.
5. **Prévia** (somente leitura): `npx wrangler d1 execute dabi-custo-producao --env production --config worker/wrangler.toml --remote --file <...>-previa.sql`. Conferir `usuarios=1`, `admin_ativo=0` e as contagens.
6. **Exclusão:** o mesmo comando com `<...>-exclusao.sql`. É idempotente: repetir não muda nada.
7. **Conferir:** rodar a prévia de novo; tudo deve estar em 0, com `licencas` = 0 porque a licença ficou sem e-mail.
8. **Responder ao titular** com a data. Registrar o pedido e a data da execução, sem guardar os dados apagados.

A prévia e a exclusão rodam sem passar pelo CLI protegido, porque o `npm run d1 -- query` só aceita uma instrução de leitura. Por isso os passos 3, 5 e 7 são obrigatórios.

## Retenção proposta (para validar com assessoria jurídica)

São propostas técnicas, **não aplicadas**: não há limpeza automática hoje.

| Dado | Proposta | Situação hoje |
|---|---|---|
| Códigos de login (`auth_codes`) | Apagar 24 h após expirar | Nunca apagados |
| Sessões encerradas ou expiradas | Apagar 30 dias após o fim | Nunca apagadas |
| Contadores de limite | Apagar ao fim da janela | Apagados na virada da janela da mesma chave |
| Auditoria administrativa | 365 dias | Já aplicado (poda a cada ação administrativa) |
| Dados comerciais | Enquanto a conta existir; apagados na exclusão | Este procedimento |
| Backups do operador | Ver `BACKUP_E_RECUPERACAO.md` (4 semanais e 3 mensais) | Manual |
| Logs da Cloudflare | Retenção da plataforma; o Custô não grava logs próprios com dados pessoais | — |

Implementar a limpeza automática dos dois primeiros itens exige mudar o código, com algumas gravações a mais: fica para depois do beta.
