# Nomes e ambientes do Custô (Etapa 13, 14/11/2026)

Fonte única no código: [`scripts/environments.mjs`](../scripts/environments.mjs). Os scripts de publicação (`scripts/pages.mjs`, `scripts/worker.mjs`) e os testes (`tests/worker-release.test.ts`) leem dali.

## Convenção

- **Recursos novos:** prefixo `dabi-custo`.
- **Recursos existentes que guardam dados:** mantêm o nome antigo. Renomear um D1 exige criar outro banco e migrar os dados, o que não se justifica por estética.

| Ambiente | Pages | Endereço | Worker | D1 | APP_ENV | Estado |
|---|---|---|---|---|---|---|
| Staging (novo) | `dabi-custo-staging` | https://dabi-custo-staging.pages.dev | `dabi-orcamentos-staging` | `dabi-orcamentos-staging` | `staging` | **No ar** (Etapa 14.1); gera os links públicos novos (Etapa 14.2) |
| Staging (legado) | `dabi-preco-certo-staging` | https://dabi-preco-certo-staging.pages.dev | o mesmo acima | o mesmo acima | `staging` | **No ar e preservado** durante a convivência |
| Produção | `dabi-custo` | https://custo.dabitech.com.br | `dabi-custo-api` | `dabi-custo-producao` | `production` | **A criar** (Plano B) |
| Ensaio de restauração | — | — | — | `dabi-custo-restauracao` | — | A criar quando for ensaiar |
| Desenvolvimento local | — | http://localhost:5174 | `dabi-custo-local` (só `wrangler dev`) | `dabi-orcamentos` (arquivo local) | — | Local |

**Repositório:** `moysesemanuel/custo`. O nome antigo `dabi-preco-certo` redireciona para o mesmo repositório (id 1454208490), com histórico, branches e PR #1 preservados. O `origin` local usa `https://github.com/moysesemanuel/custo.git`.

## Referências ao nome antigo, por categoria

| Categoria | Ocorrências | Decisão |
|---|---|---|
| 1. Atuais, atualizadas | `package.json`/`package-lock.json` (`name`), README, `worker/README.md`, `.env.example`, comentários em `functions/_shared/proxy.ts` e `worker/src/index.ts`, `scripts/pages.mjs`, `worker/wrangler.toml` (produção, nome local, remetente), `worker/scripts/targets.ts` (bancos de produção e restauração), testes e docs operacionais | Trocadas por Custô e pelos nomes novos |
| 2. Legados necessários (não mudar) | IndexedDB `pedidocerto-v1`; `localStorage` `pedidocerto.lastAccess`; trava entre abas `dabi-preco-certo:editor` e canal `dabi-preco-certo:data` (`src/storage/coordination.ts`); cookies `__Host-dabi_session`/`dabi_session`; banco local `dabi-orcamentos` | Mudar apagaria visualmente os dados locais, derrubaria sessões ou deixaria uma aba antiga e uma nova editando ao mesmo tempo |
| 3. Histórico | `docs/ETAPA_*`, `AUDITORIA_*`, `PUBLICACAO_CLOUDFLARE.md`, `PROPOSTA_WRANGLER_TOML.diff`, `IMPLANTACAO_HOMOLOGACAO.md`, `POLITICA_DE_CUSTOS.md` | Mantidos, com aviso no topo apontando para este documento |
| 4. Recursos remotos que só mudam depois | Pages `dabi-preco-certo-staging` (preservado até o fim da convivência); Worker e D1 `dabi-orcamentos-staging` (permanentes); `EMAIL_FROM` remoto do staging (muda no próximo deploy do Worker) | Planos A e B |

## Guardas contra mistura de ambientes

1. **Configuração** (`validateWorkerConfig`), conferida antes de qualquer dry-run ou publicação do Worker e do Pages. Recusa:
   - `APP_ENV` ausente ou de outro ambiente;
   - nome de Worker errado;
   - banco de outro ambiente (mesmo nome ou mesmo `database_id`);
   - id marcador ou de zeros;
   - origem de outro ambiente em `ALLOWED_ORIGINS`, ou `localhost` em produção;
   - `PUBLIC_BASE_URL` errado;
   - `workers_dev` ligado em produção;
   - remetente sem o nome "Custô".
2. **Revisão:** SHA completo aprovado e checkout limpo. Produção exige ainda a branch `main` e a confirmação digitada (`--confirm-production dabi-custo` no Pages, `dabi-custo-api` no Worker).
3. **Em tempo de execução:** o Pages envia o ambiente esperado (`X-Dabi-Expect-Env`) e o Worker de outro ambiente responde 421. Um front-end de **produção** só é aceito por um Worker que se declare `production`, mesmo se o Worker não tiver `APP_ENV`. O proxy responde 503 se o projeto Pages não tiver o binding ou o `APP_ENV`.
4. **Preview do Pages de produção:** `APP_ENV=staging` e **sem** binding `API`, para que nunca alcance dados reais (Plano B, passo 8).

Os testes ficam em `tests/worker-release.test.ts` e `tests/pages-proxy.test.ts`. Cobrem as quatro combinações Pages × Worker, o Worker sem `APP_ENV` e cada configuração insegura.
