# Plano B: implantação da produção em `https://custo.dabitech.com.br`

Preparado na Etapa 13 (14/11/2026); substitui as seções de produção de `ETAPA_7_PREPARACAO_PRODUCAO.md`.

**Estado em 14/11/2026: produção no ar em https://custo.dabitech.com.br.**
- **Concluído:**
  - PR #1 na `main`;
  - D1 `dabi-custo-producao` com as 12 migrações, vazio (sem dados de staging);
  - Worker `dabi-custo-api` e `AUTH_SECRET` exclusivo;
  - Pages `dabi-custo` com `APP_ENV=production` e `API` → `dabi-custo-api` (Preview sem binding);
  - CNAME `custo` → `dabi-custo.pages.dev` na Vercel, sem tocar no wildcard;
  - certificado emitido;
  - licença do proprietário;
  - backup inicial verificado.
- **Falta:**
  - `RESEND_API_KEY` de produção (o login responde 503 até lá);
  - primeiro login e `grant-admin` do proprietário;
  - `clientIpReceived` (passo 14);
  - validação funcional (passos 15 a 18);
  - revisão jurídica das minutas e canal de suporte. Nomes e guardas: [`NOMES_E_AMBIENTES.md`](NOMES_E_AMBIENTES.md).

## Já pronto localmente

- `worker/wrangler.toml` `[env.production]`:
  - Worker `dabi-custo-api`, `workers_dev=false`, `APP_ENV=production`;
  - `PUBLIC_BASE_URL` e `ALLOWED_ORIGINS` = `https://custo.dabitech.com.br`;
  - remetente `Custô <acesso@mail.dabitech.com.br>`, o mesmo endereço já verificado no Resend, com o nome novo;
  - D1 `dabi-custo-producao`, com id **marcador**: a publicação é recusada até o banco real existir.
- **Scripts:** `worker:dry-run:production`, `worker:deploy:production`, `pages:deploy:production(:dry)`, com validação de configuração, SHA aprovado, checkout limpo, branch `main` e confirmação digitada.
- **Páginas `/privacidade` e `/termos`:** minutas, com pendências jurídicas listadas em `PRIVACIDADE_E_TERMOS.md`.
- **Operação:**
  - exclusão de conta (`account:erasure-sql`);
  - backup com manifesto e verificação (`backup:manifest`, `backup:verify`);
  - diagnóstico do IP real em `/api/admin/me` (`clientIpReceived`).

## Sequência

| # | Ação | Comando ou procedimento | Evidência para avançar | Se falhar |
|---|---|---|---|---|
| 1 | Integrar a branch | Revisar o PR #1 (`moysesemanuel/custo`), tirar do rascunho, merge na `main`; anotar o SHA | CI verde na `main`; `npm test` local verde no SHA | Não implantar; corrigir na branch |
| 2 | Criar o D1 | `npx wrangler d1 create dabi-custo-producao` | Id real retornado | Excluir **só** esse banco vazio |
| 3 | Registrar o id | Trocar o marcador em `[env.production.d1_databases]`, commit na `main`, novo SHA | `npm run worker:dry-run:production` **sem avisos** | Reverter o commit |
| 4 | Migrar o banco vazio | `npm run d1 -- migrate --env production` (pede `dabi-custo-producao`) | `npm run d1 -- query --env production --command "SELECT COUNT(*) FROM d1_migrations"` = 12; última `0012_order_items.sql` | Banco vazio: recriar |
| 5 | Publicar o Worker | `npm run worker:deploy:production -- --approved-commit <SHA> --confirm-production dabi-custo-api` | `npx wrangler deployments list --name dabi-custo-api` mostra a tag `<SHA>` | Sem tráfego ainda: corrigir e republicar |
| 6 | Secrets **novos** | `npx wrangler secret put AUTH_SECRET --env production --config worker/wrangler.toml` (valor aleatório novo, ≥ 32 bytes); `... RESEND_API_KEY ...` (chave própria de produção) | `npx wrangler secret list --env production --config worker/wrangler.toml` lista os 2 nomes | Repetir o `put` |
| 7 | Criar o Pages | `npx wrangler pages project create dabi-custo --production-branch main` | Projeto listado | Excluir o projeto vazio |
| 8 | Binding e variáveis (painel) | **Production:** `APP_ENV=production` e `API` → `dabi-custo-api`. **Preview:** `APP_ENV=staging` e **sem** `API` | Conferir no painel; o health do Preview responde `binding:false` | Corrigir antes do passo 9 |
| 9 | Publicar o front-end | Na `main` limpa: `npm run pages:deploy:production:dry`, depois `npm run pages:deploy:production -- --approved-commit <SHA> --confirm-production dabi-custo` | `https://dabi-custo.pages.dev/api/_edge/health` → `env=production`, `binding=true` | Republicar a revisão anterior do Pages |
| 10 | Domínio no Pages | *Custom domains* do projeto `dabi-custo` → `custo.dabitech.com.br`; copiar o alvo CNAME **mostrado** | Domínio "pendente de verificação" | Remover o domínio do projeto |
| 11 | DNS (Vercel) | Conferir `vercel dns ls dabitech.com.br` (sem registro `custo`); criar **só** `vercel dns add dabitech.com.br custo CNAME <alvo-real>`. Não tocar no wildcard `*`, no apex nem nos nameservers | `dig custo.dabitech.com.br CNAME` responde o alvo; o domínio fica "ativo" no Pages | **Não remova** o CNAME (o nome cairia no wildcard do Agendaí): aponte para uma página de manutenção |
| 12 | HTTPS | Esperar o certificado | `curl -sI https://custo.dabitech.com.br` → 200 com HSTS e CSP; health `env=production` | Aguardar ou rever o passo 10 |
| 13 | Administrador | `npm run licenses -- issue --env production --email <dono>`; login normal; `npm run licenses -- grant-admin --env production --email <dono>` | `/admin` abre; `npm run licenses -- list-admins --env production` | `revoke-admin` |
| 14 | IP real | Logado como admin: `GET /api/admin/me` | `clientIpReceived: true` (se `false`, **parar**: limite por IP compartilhado) | Investigar antes de clientes |
| 15 | Login e e-mail | Login com uma conta de teste **licenciada em produção** | E-mail chega com remetente "Custô" | Conferir `RESEND_API_KEY` e `EMAIL_FROM` |
| 16 | Sincronização | Dois navegadores, encomenda com vários itens, recebimento | "Sincronizado" nos dois; sem `POST` em laço | Ver `MONITORAMENTO.md` |
| 17 | Orçamento público | Publicar, abrir `/o/<id>`, revogar, WhatsApp, celular | Link no domínio novo; 410 após revogar | — |
| 18 | Isolamento | Segunda conta de teste | Não vê nada da primeira | **Parar** |
| 19 | Backup inicial | `npm run d1 -- export --env production --output <fora-do-repo>/custo-prod-AAAA-MM-DD.sql`; `backup:manifest`; `backup:verify`; cifrar e guardar (ver `BACKUP_E_RECUPERACAO.md`) | `verify` ok | Repetir |
| 20 | Beta fechado | Aceite das minutas **revisadas**, canal de suporte definido, monitoramento ativo; convidar de 3 a 5 clientes | Checklist abaixo | — |

## Antes do primeiro cliente

As minutas jurídicas precisam estar revisadas, com as pendências preenchidas. Também é preciso:
- canal de suporte definido;
- backup do passo 19 verificado;
- `clientIpReceived: true`;
- runbook de monitoramento lido.

## Atualizações depois do lançamento: só para a frente

- **Nunca volte o Worker** para uma versão anterior à Etapa 11 (migração `0012`). Ela leria só o primeiro item de encomendas com vários produtos e um app antigo poderia regravá-las incompletas. Isso vale também para versões entre releases quando houver mudança de esquema ou de protocolo.
- **Ordem de cada release:**
  1. backup com manifesto;
  2. migrações novas, sempre aditivas;
  3. Worker;
  4. Pages.
- Entre o Worker e o Pages, abas antigas podem ver 426 ("recarregue"), sem perda de dados locais.
- **Em caso de defeito:**
  - **front-end:** republicar a revisão anterior do Pages, desde que fale o mesmo protocolo (v2);
  - **Worker:** corrigir num commit novo e publicar com o script;
  - **esquema:** nova migração aditiva que corrige. Nunca editar migração aplicada.
  - **dados:** Time Travel (até 7 dias no plano gratuito) ou restauração de um backup **em banco separado** para conferir antes. `restore-file` nunca roda em produção.
- Laço de gravações (padrão do incidente de 14/11/2026): `MONITORAMENTO.md`, procedimento 1.
