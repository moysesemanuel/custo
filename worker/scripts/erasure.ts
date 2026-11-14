/**
 * Gera (NÃO executa) os arquivos SQL de exclusão de conta: `<saida>-previa.sql` (somente leitura) e `<saida>-exclusao.sql`.
 *   npm run account:erasure-sql -- --email titular@exemplo.com --output /caminho/fora-do-repositorio/pedido-123
 * Execução, sempre manual e depois do backup: docs/EXCLUSAO_DE_CONTA.md. Recusa sobrescrever arquivos existentes.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { accountErasureSql } from './accountErasure.ts';

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const email = opt('--email'), output = opt('--output');
if (!email || !output) { console.error('Uso: npm run account:erasure-sql -- --email <e-mail> --output <prefixo-dos-arquivos>'); process.exit(1); }
const sql = await accountErasureSql(email, new Date().toISOString());
const files = [[`${output}-previa.sql`, sql.preview], [`${output}-exclusao.sql`, sql.erase]] as const;
for (const [f] of files) if (existsSync(f)) { console.error(`Recusado: ${f} já existe (nada foi gravado).`); process.exit(1); }
for (const [f, content] of files) writeFileSync(f, `${content}\n`, { flag: 'wx', mode: 0o600 });
console.error(`Gerados (nada foi executado):\n  ${files.map(([f]) => f).join('\n  ')}\nSiga docs/EXCLUSAO_DE_CONTA.md (backup → prévia → exclusão → conferência).`);
