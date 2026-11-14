# Backup e recuperação

Há dois níveis: os dados **da pessoa** (no aparelho dela) e os dados **do servidor** (D1).

## 1. Dados da pessoa (aparelho)

- Em **Backup**, a pessoa exporta um arquivo `.json` com ingredientes, receitas, encomendas (com custos históricos e recebimentos) e configurações. A restauração **valida tudo antes** (ids duplicados, relacionamentos, valores, datas): se algo estiver inválido, nada é restaurado.
- O arquivo **não contém** senhas, sessões nem chaves, mas contém dados de clientes (nomes): orientar a guardá-lo com cuidado.
- Com conta, o servidor também guarda os dados; ainda assim, recomendar um backup antes de ações grandes (trocar de dispositivo, "Substituir dados deste dispositivo").

## 2. Dados do servidor (D1)

O que existe no banco: usuários, sessões, licenças, dados sincronizados (ingredientes, receitas, itens, encomendas, recebimentos) e orçamentos publicados.

### Backup manual (exportação SQL)

```bash
# Sempre FORA do repositório. O export recusa sobrescrever um arquivo existente.
npm run d1 -- export --env production --output /caminho/seguro/custo-production-AAAA-MM-DD.sql
npm run backup:manifest -- --file /caminho/seguro/custo-production-AAAA-MM-DD.sql --env production   # SHA-256, tamanho, ambiente, banco, data
npm run backup:verify -- --file /caminho/seguro/custo-production-AAAA-MM-DD.sql                       # confere o SHA-256 e RESTAURA em memória
```

O `verify` só passa se:
- o SHA-256 bate com o manifesto;
- o dump restaura num SQLite em memória;
- `integrity_check` = ok;
- todas as tabelas essenciais existem.

Ele também mostra as contagens e a última migração. É uma verificação **local**: nada é enviado à Cloudflare (`tests/backup-verify.test.ts`).

O arquivo contém e-mails, nomes de clientes finais e dados financeiros. **Cifre antes de guardar fora da máquina**, sem serviço novo:
- `age -p arquivo.sql > arquivo.sql.age` (senha forte guardada no gerenciador de senhas), ou `gpg --symmetric --cipher-algo AES256 arquivo.sql`;
- ou uma imagem de disco cifrada do macOS (Utilitário de Disco → APFS criptografado).

Guarde o `.manifest.json` junto (não é sigiloso). Apague a cópia em texto depois de conferir a cifrada.

**Rotina proposta** (responsável: o proprietário do Custô):

| Quando | O quê | Retenção |
|---|---|---|
| Antes de cada release (migração, Worker ou Pages) | export + manifest + verify | Até o release seguinte ser validado |
| Semanal | export + manifest + verify + cifrar + cópia fora da máquina | 4 semanais |
| Mensal | o semanal mais recente vira mensal | 3 mensais |
| Mensal | **ensaio de restauração**: `backup:verify` do backup mensal e, a cada trimestre, restauração completa no banco `restore` (abaixo) | Registrar a data e o resultado |

O **Time Travel não substitui** os backups externos: guarda só 7 dias no plano gratuito, fica na mesma conta e não protege contra um erro percebido tarde.

### Recuperação a um ponto no tempo (Time Travel)

O D1 oferece recuperação a um instante anterior (a retenção depende do plano: **confirme na documentação atual da Cloudflare**):

```bash
npm run d1 -- time-travel-info --env production
npm run d1 -- time-travel-restore --env production --timestamp <ISO-8601 em UTC, ex.: 2026-11-12T15:00:00Z>
```

Restaurar **substitui o estado atual do banco**: avise os usuários e anote o horário. Em produção o comando pede confirmação extra (digitar o nome do banco, ou `--confirm-production dabi-custo-producao` em execução não interativa autorizada). O mesmo vale para `migrate`.

### Restaurar de um arquivo `.sql`

Prefira restaurar **primeiro num banco novo** (homologação), conferir e só então decidir:

```bash
npx wrangler d1 create dabi-custo-restauracao               # depois troque SUBSTITUIR-PELO-ID-DO-D1-DE-RESTAURACAO em [env.restore] de worker/wrangler.toml
npm run d1 -- migrate --env restore                        # só se o dump não trouxer o esquema
npm run d1 -- restore-file --env restore --file backup-AAAA-MM-DD.sql
```

`restore-file` **não aceita produção** (restaurar um `.sql` por cima do banco real não é permitido por este comando; para produção use Time Travel). Aceita `local`, `staging` e `restore`.


**Ensaio já realizado (local):** exportar o D1 local e restaurá-lo em um banco novo preservou as 12 tabelas e os dados (licença e e-mail conferidos). Repita o ensaio em homologação antes de depender do procedimento em produção.

> **Antes de atualizar a homologação:** siga `docs/ATUALIZACAO_STAGING.md` (backup validado, ensaio local `npm run rehearse`, ponto de Time Travel e recuperação).

### Objetivos de recuperação (metas, **não garantias**)

Ainda não medidos em produção; confirmar no primeiro ensaio trimestral.
- **Perda máxima de dados (RPO):** minutos via Time Travel, dentro dos 7 dias; até 1 semana pelo backup externo. Os aparelhos guardam cópias locais e reenviam o que estiver pendente.
- **Tempo para voltar (RTO):** algumas horas, manual, com uma pessoa operando.

### Depois de um erro de sincronização

Antes de restaurar, lembre:
- o servidor é a cópia oficial;
- cada aparelho guarda a sua cópia, e as pendências locais ficam no IndexedDB;
- conflitos e pendências financeiras ficam em *Configurações* até alguém decidir.

1. Pare o laço se houver um (`MONITORAMENTO.md` §1). Nada local é apagado.
2. Exporte o D1 (com manifesto) **antes** de qualquer correção.
3. Se o servidor tem dados errados e um aparelho tem os certos: corrija pelo aparelho (editar e sincronizar) ou peça um backup `.json` do aparelho. Restaurar o D1 inteiro desfaz o trabalho de **todas** as contas desde o ponto escolhido.
4. Restauração do D1 só para corrupção ampla, e **primeiro no banco `restore`**, conferindo, antes de qualquer Time Travel em produção.

## Checklist de recuperação

1. Identifique o problema e o horário em que começou.
2. Pare de escrever, se possível (ex.: retirar a rota do Worker) para não piorar.
3. Escolha: Time Travel para um instante anterior ao problema, ou restauração de um `.sql` em banco novo.
4. Valide: contagem de usuários/licenças, uma conta de teste sincronizando, página pública de um orçamento.
5. Comunique os usuários afetados. Os aparelhos guardam cópia local e reenviam alterações pendentes ao reconectar (o servidor trata reenvios idênticos como "sem alteração").
6. Registre o ocorrido e o que mudar para evitar repetição.

## O que NÃO é recuperável

- Orçamentos **revogados** continuam no banco (revogação é lógica), mas estão indisponíveis ao público.
- Dados que só existiam em um aparelho, sem conta e sem backup `.json`, se o aparelho for perdido.
