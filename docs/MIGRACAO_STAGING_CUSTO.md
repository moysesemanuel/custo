# Plano A: migrar o staging para `dabi-custo-staging.pages.dev`

Preparado na Etapa 13 (14/11/2026).

**Estado (14/11/2026):**
- **Passos 1 a 8 (Etapa 14.1):** executados e homologados. O Worker `2e4da2b3` liberou as duas origens e o Pages `dabi-custo-staging` foi publicado (deployment `fe36eee1`).
- **Passo 9 (Etapa 14.2):** `PUBLIC_BASE_URL` de staging trocado para o endereço novo.
- **Pages antigo:** continua no ar; os critérios de desligamento estão no fim deste documento.

## Por que é um projeto novo

O subdomínio `*.pages.dev` é o nome do projeto e não pode ser renomeado. O endereço novo exige o projeto `dabi-custo-staging`.

O **Worker e o D1 de staging continuam os mesmos** (`dabi-orcamentos-staging`): só o front-end muda de endereço. Nenhum dado é copiado, migrado ou recriado.

## O que muda e o que não muda

| Item | Efeito | Preparado |
|---|---|---|
| Origem e CSRF (`ALLOWED_ORIGINS`) | As duas origens precisam estar liberadas no Worker durante a convivência | `worker/wrangler.toml` já inclui as duas; vale no próximo deploy do Worker de staging (passo 1) |
| Cookies `__Host-dabi_session` | São presos ao host: quem abrir o endereço novo precisa entrar de novo (novo código por e-mail). **Os dados da conta não se perdem**: estão no D1 e voltam na primeira sincronização | Nada a mudar no código |
| Limite de 2 sessões | Entrar no endereço novo ocupa uma sessão. Com 2 já abertas (ex.: notebook e celular no endereço antigo), o login pede para encerrar uma | Orientar quem homologar |
| Dados locais (IndexedDB) | São por origem: o endereço novo começa vazio e baixa tudo da conta. Alterações **pendentes** no endereço antigo só existem lá: sincronize antes de trocar | Passo 6 |
| Links públicos `/o/<id>` já enviados | Continuam funcionando no endereço **antigo** enquanto o Pages antigo existir, pois os dois encaminham `/o/*` ao mesmo Worker. O mesmo id também abre no endereço novo | Não desligar o Pages antigo (seção final) |
| Links públicos **novos** | Usam `PUBLIC_BASE_URL`, que continua no endereço antigo até o passo 9 | Trocar só depois da validação |
| WhatsApp | O texto usa a URL devolvida pelo Worker (`PUBLIC_BASE_URL`) | Segue o passo 9 |
| Duas versões do front-end no mesmo Worker | Seguro enquanto as duas falarem o protocolo `/api/sync/v2`. Uma versão antiga recebe 426 e pede para recarregar, sem perder dados locais | Publicar a **mesma** revisão nos dois enquanto conviverem |

## Sequência

**Pré-requisitos:**
- revisão aprovada (SHA completo) na branch de publicação;
- `npm test` verde;
- backup recente do D1 de staging, com manifesto: `npm run d1 -- export --env staging --output <arquivo>.sql` e depois `npm run backup:manifest -- --file <arquivo>.sql --env staging`.

1. **Worker de staging com a origem nova:**
   - `npm run worker:dry-run:staging`: a validação precisa passar e o resumo mostra as duas origens.
   - `npm run worker:deploy:staging -- --approved-commit <SHA>`.
   - Evidência: login no endereço **antigo** continua funcionando.
2. **Criar o projeto:** `npx wrangler pages project create dabi-custo-staging --production-branch staging`.
3. **Configurar o projeto no painel** (*Settings → Functions/Variables*), em Production **e** em Preview:
   - `APP_ENV=staging`;
   - Service Binding `API` → `dabi-orcamentos-staging`.
   - Não toque no projeto antigo.
4. **Publicar:**
   - `npm run pages:deploy:staging:dry`;
   - `npm run pages:deploy:staging -- --approved-commit <SHA>`.
5. **Saúde:** `curl -s https://dabi-custo-staging.pages.dev/api/_edge/health` deve responder `{"ok":true,"env":"staging","binding":true}`. Confira também:
   - `/` e `/admin` → 200;
   - `/api/auth/session` e `/api/admin/me` sem login → 401;
   - `/api/sync` (rota antiga) → 426.
6. **Login:** no endereço antigo, sincronize, até "Sincronizado" e sem pendências. Depois entre no endereço novo com o mesmo e-mail.
7. **Sincronização e dados:** os dados da conta aparecem no endereço novo e uma edição feita lá aparece no antigo, e vice-versa. Use `localStorage['custo:debug-sync']='1'` para ver o ciclo no console.
8. **Encomendas, pagamentos e links:**
   - criar uma encomenda com vários itens;
   - registrar recebimento (confirma o orçamento);
   - publicar um link: a URL ainda é do endereço antigo, por causa do `PUBLIC_BASE_URL`;
   - abrir o mesmo `/o/<id>` nos **dois** hosts;
   - revogar;
   - compartilhar pelo WhatsApp;
   - repetir no celular.
9. **Trocar o endereço dos links novos:**
   - em `[env.staging.vars]`, trocar `PUBLIC_BASE_URL` para `https://dabi-custo-staging.pages.dev` (a validação aceita os dois);
   - commit, revisão, `npm run worker:deploy:staging -- --approved-commit <SHA>`;
   - links antigos continuam válidos no host antigo.
10. **Confirmar a preservação:**
    - `npx wrangler deployments list --name dabi-orcamentos-staging` mostra só as versões publicadas por você;
    - `npm run d1 -- migrations-list --env staging` responde "No migrations to apply";
    - as contagens do D1 (`npm run d1 -- query --env staging --command "SELECT COUNT(*) FROM orders"`) são coerentes com antes.

**Recuperação:** se algo falhar nos passos 2 a 8, basta não usar o projeto novo. O endereço antigo continua intacto, e o Worker e o D1 não mudaram de dados. O passo 1 só **acrescenta** uma origem.

## Quando desligar o Pages antigo

**Não nesta etapa e nunca por script.** Critérios, todos necessários:
1. O endereço novo foi homologado (passos 5 a 8) e é o `PUBLIC_BASE_URL` há pelo menos o prazo de validade dos orçamentos já enviados, ou não há links ativos publicados pelo host antigo (painel → links, ou `SELECT COUNT(*) FROM quotes WHERE revoked_at IS NULL`).
2. Ninguém mais usa o endereço antigo. Avise quem homologa, porque dados **pendentes** em um navegador no endereço antigo só existem lá.
3. Existe uma decisão sobre o que o endereço antigo mostra depois. Opção recomendada: publicar no projeto antigo uma página estática que aponta para o endereço novo, **mantendo** `/o/*` funcionando via Function. Excluir o projeto quebra links já enviados.

Só depois disso: remover a origem antiga de `ALLOWED_ORIGINS` e de `WORKER_ENVIRONMENTS.staging` (`scripts/environments.mjs`) e publicar o Worker.
