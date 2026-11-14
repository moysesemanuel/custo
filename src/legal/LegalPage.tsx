/**
 * Páginas públicas /privacidade e /termos (abrem sem login). CONTEÚDO EM MINUTA: descreve fielmente o que o sistema faz hoje,
 * mas depende de revisão jurídica e das informações marcadas como pendentes (lista em docs/PRIVACIDADE_E_TERMOS.md).
 * Nada aqui pede consentimento: a base do tratamento é a execução do contrato do serviço (a definir na revisão jurídica).
 */
import type { ReactNode } from 'react';
import './legal.css';

export const LEGAL_PATHS = ['/privacidade', '/termos'] as const;
export type LegalPath = (typeof LEGAL_PATHS)[number];
export const isLegalPath = (path: string): path is LegalPath => (LEGAL_PATHS as readonly string[]).includes(path.replace(/\/+$/, '') || '/');

/** Informação que ainda não foi fornecida: aparece destacada, nunca inventada. */
const Pending = ({ children }: { children: ReactNode }) => <mark className="legal-pending">[PENDENTE: {children}]</mark>;

function Privacy() {
  return <>
    <h1>Política de privacidade</h1>
    <h2>1. Quem trata os dados</h2>
    <p>O Custô é um serviço da DaBi Tech. Controlador: <Pending>razão social e CNPJ</Pending>. Endereço: <Pending>endereço</Pending>. Canal de privacidade e encarregado (art. 41 da LGPD): <Pending>nome e e-mail de contato</Pending>.</p>
    <h2>2. Quais dados o Custô guarda</h2>
    <ul>
      <li><strong>Conta:</strong> seu e-mail, a data de criação e de confirmação, e as sessões abertas (nome do dispositivo informado no login, datas de criação, último uso e expiração).</li>
      <li><strong>Login:</strong> o código enviado por e-mail é guardado só como resumo criptográfico (hash), com validade de 10 minutos e uso único.</li>
      <li><strong>Seus dados de trabalho:</strong> ingredientes, receitas, embalagens, encomendas (incluindo o nome que você informar para cada cliente), recebimentos e observações, e as configurações do negócio (nome e telefone, usados nos orçamentos).</li>
      <li><strong>Orçamentos publicados por link:</strong> o que você decidir mostrar ao cliente final (nome do negócio, telefone, produtos, valores, validade e observações). Custos internos, margens e dados do seu cliente não são publicados.</li>
      <li><strong>Proteção contra abuso:</strong> contadores temporários de tentativas, identificados por resumos criptográficos do e-mail e do endereço IP (o IP não é guardado em texto).</li>
      <li><strong>No seu aparelho:</strong> uma cópia dos seus dados fica no armazenamento do navegador (IndexedDB) para funcionar sem internet.</li>
    </ul>
    <h2>3. Para que usamos</h2>
    <p>Para prestar o serviço: identificar você, sincronizar seus dados entre dispositivos, calcular custos e preços, publicar os orçamentos que você escolher e proteger o serviço contra abuso. Não vendemos dados e não usamos seus dados para publicidade. Base legal: <Pending>definição na revisão jurídica (ex.: execução de contrato, art. 7º, V)</Pending>.</p>
    <h2>4. Dados dos seus clientes</h2>
    <p>Os nomes e informações dos seus clientes que você registra nas encomendas são tratados pelo Custô em seu nome, apenas para a finalidade do serviço. <Pending>papéis de controlador e operador e responsabilidades, a definir na revisão jurídica</Pending>.</p>
    <h2>5. Com quem compartilhamos</h2>
    <p>Com fornecedores necessários ao funcionamento: Cloudflare (hospedagem, processamento e banco de dados) e Resend (envio dos e-mails de acesso). Esses serviços podem processar dados fora do Brasil. <Pending>análise de transferência internacional (arts. 33 a 36 da LGPD)</Pending>.</p>
    <h2>6. Por quanto tempo</h2>
    <p>Mantemos os dados enquanto a conta existir. Após a exclusão, os dados são apagados conforme o procedimento de exclusão. Cópias de segurança são substituídas pelo ciclo de retenção dos backups. Prazos específicos: <Pending>prazos definitivos de retenção (proposta técnica em revisão)</Pending>.</p>
    <h2>7. Seus direitos</h2>
    <p>Você pode pedir confirmação, acesso, correção, portabilidade e exclusão dos seus dados, e informações sobre o compartilhamento. Seus dados de trabalho podem ser exportados a qualquer momento em <strong>Backup</strong>, dentro do aplicativo. Pedidos pelo canal: <Pending>e-mail do canal de privacidade</Pending>, com resposta em <Pending>prazo de atendimento</Pending>.</p>
    <h2>8. Segurança</h2>
    <p>Conexões cifradas (HTTPS), cookies de sessão protegidos (HttpOnly, Secure), proteção contra requisições forjadas, códigos e tokens guardados só como hash, isolamento entre contas e limites contra tentativas repetidas. Em caso de incidente relevante, comunicaremos os titulares afetados e a ANPD conforme a lei.</p>
    <h2>9. Alterações</h2>
    <p>Esta política pode ser atualizada; a data da versão vigente aparece no topo. <Pending>data de vigência</Pending>.</p>
  </>;
}

function Terms() {
  return <>
    <h1>Termos de uso</h1>
    <h2>1. O serviço</h2>
    <p>O Custô ajuda pequenos produtores de alimentos a calcular custos e preços, organizar encomendas e recebimentos e enviar orçamentos. Fornecedor: <Pending>razão social e CNPJ da DaBi Tech</Pending>.</p>
    <h2>2. Acesso</h2>
    <p>O acesso é pessoal, por código enviado ao e-mail cadastrado, e depende de uma licença ativa. Cada conta pode ter até duas sessões abertas ao mesmo tempo. Você é responsável por manter seu e-mail seguro.</p>
    <h2>3. Seus dados e responsabilidades</h2>
    <p>Os dados que você cadastra continuam seus. Os cálculos de custo e preço são estimativas baseadas nas informações que você fornece: confira os valores antes de usá-los em negociações. O Custô não emite documento fiscal, não processa pagamentos e não substitui orientação contábil.</p>
    <h2>4. Orçamentos públicos</h2>
    <p>Ao publicar um orçamento por link, qualquer pessoa com o link pode vê-lo até que você o revogue. Publique apenas o que pode ser compartilhado.</p>
    <h2>5. Uso adequado</h2>
    <p>Não é permitido tentar acessar dados de outras contas, sobrecarregar o serviço ou usá-lo para fins ilegais. Contas que violarem estes termos podem ser suspensas.</p>
    <h2>6. Disponibilidade e cópias de segurança</h2>
    <p>Trabalhamos para manter o serviço disponível e fazemos cópias de segurança, mas não há garantia de funcionamento ininterrupto. Recomendamos exportar seus dados em <strong>Backup</strong> regularmente.</p>
    <h2>7. Condições do beta fechado</h2>
    <p>Durante o beta, o Custô está em evolução: funcionalidades podem mudar e falhas podem acontecer. Condições comerciais do beta (preço, duração e o que acontece ao final): <Pending>condições comerciais do beta</Pending>. Canal de suporte: <Pending>canal e horário de suporte</Pending>.</p>
    <h2>8. Encerramento</h2>
    <p>Você pode pedir o encerramento da conta e a exclusão dos dados a qualquer momento (veja a Política de privacidade). <Pending>regras de cancelamento e aviso prévio</Pending>.</p>
    <h2>9. Lei e foro</h2>
    <p>Aplica-se a legislação brasileira. Foro: <Pending>foro competente</Pending>.</p>
  </>;
}

export function LegalPage({ path }: { path: LegalPath }) {
  return <div className="legal-page">
    <header className="legal-head"><a href="/" aria-label="Custô — voltar ao aplicativo"><img src="/brand/custo-color.svg" alt="Custô" className="legal-logo" /></a></header>
    <main className="legal-card">
      <p className="legal-draft" role="note"><strong>Minuta em revisão.</strong> Este texto ainda não é a versão definitiva e depende de revisão jurídica.</p>
      {path === '/privacidade' ? <Privacy /> : <Terms />}
      <nav className="legal-nav" aria-label="Documentos"><a href="/privacidade">Política de privacidade</a><a href="/termos">Termos de uso</a><a href="/">Voltar ao Custô</a></nav>
    </main>
  </div>;
}
