// Auditoria de dependências do CI: falha em vulnerabilidade alta ou crítica,
// exceto alertas listados em EXCECOES (cada um com motivo e data de revisão).
// Uma exceção vencida volta a falhar, para ninguém esquecer dela.
import { execFileSync } from "node:child_process";

const EXCECOES = {
  "GHSA-fc5q-39xc-vjpf": {
    motivo:
      "picomatch <= 4.0.7 (ReDoS) sem versão corrigida publicada; chega só por ferramentas de build/teste (vite, vitest), que recebem padrões de glob nossos, não de usuários.",
    revisarAte: "2026-12-31",
  },
};
const NIVEIS_QUE_FALHAM = new Set(["high", "critical"]);

let saida;
try {
  saida = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (erro) {
  // npm audit sai com código != 0 quando encontra algo; o JSON vem no stdout mesmo assim.
  saida = erro.stdout;
}
const relatorio = JSON.parse(saida);
const hoje = new Date().toISOString().slice(0, 10);
const ghsa = (url) => url.split("/").pop();

const bloqueantes = [];
const ignorados = new Set();
for (const [pacote, info] of Object.entries(relatorio.vulnerabilities ?? {})) {
  // Só os alertas de origem (objetos em `via`); strings apontam para outro pacote da lista.
  for (const via of info.via.filter((v) => typeof v === "object")) {
    if (!NIVEIS_QUE_FALHAM.has(via.severity)) continue;
    const id = ghsa(via.url);
    const excecao = EXCECOES[id];
    if (excecao && excecao.revisarAte >= hoje) {
      ignorados.add(id);
      continue;
    }
    bloqueantes.push(`${pacote}: ${via.title} (${via.severity}) ${via.url}${excecao ? ` (exceção vencida em ${excecao.revisarAte})` : ""}`);
  }
}

for (const id of ignorados) console.log(`Ignorado por exceção até ${EXCECOES[id].revisarAte}: ${id}. ${EXCECOES[id].motivo}`);
if (bloqueantes.length > 0) {
  console.error(`Vulnerabilidades altas ou críticas:\n- ${bloqueantes.join("\n- ")}`);
  process.exit(1);
}
console.log("Nenhuma vulnerabilidade alta ou crítica fora das exceções.");
