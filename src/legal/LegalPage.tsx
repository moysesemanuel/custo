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
    <p>O Custô é um serviço da DaBi Tech. Controlador: 57.936.721 Moyses Emanuel Costa Silva, CNPJ 57.936.721/0001-25. Endereço: Rua Frederico Maurer, Boqueirão, Curitiba/PR, Brasil. Canal de privacidade (art. 41 da LGPD): <a href="mailto:contato@dabitech.com.br">contato@dabitech.com.br</a>, com atendimento de segunda a quinta, das 9h às 18h, e sexta, das 9h às 16h (horário de Brasília).</p>
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
    <p>Para prestar o serviço: identificar você, sincronizar seus dados entre dispositivos, calcular custos e preços, publicar os orçamentos que você escolher e proteger o serviço contra abuso. Não vendemos dados e não usamos seus dados para publicidade.</p>
    <h2>4. Bases legais e responsabilidades</h2>
    <p>O Custô trata os dados pessoais dos usuários para disponibilizar a plataforma, autenticar contas, administrar licenças, prestar suporte e proteger a segurança do serviço.</p>
    <p>Conforme a finalidade, o tratamento poderá estar fundamentado na execução de contrato ou de procedimentos preliminares, no cumprimento de obrigações legais ou regulatórias e no legítimo interesse, quando aplicável e devidamente avaliado.</p>
    <p>Em relação aos dados pessoais de clientes finais cadastrados pelos estabelecimentos usuários, estes são, em regra, os controladores, responsáveis por determinar a finalidade da coleta e do tratamento.</p>
    <p>O Custô atua como operador desses dados quando realiza o tratamento em nome dos estabelecimentos, de acordo com as funcionalidades contratadas e as instruções aplicáveis.</p>
    <p>O Custô permanece responsável pelos tratamentos em que atua como controlador, incluindo a gestão de suas próprias contas e a segurança operacional da plataforma.</p>
    <h2>5. Com quem compartilhamos e transferência internacional</h2>
    <p>O Custô utiliza fornecedores tecnológicos para hospedagem, armazenamento, processamento e envio de mensagens transacionais, incluindo Cloudflare e Resend.</p>
    <p>A utilização desses serviços poderá envolver tratamento de dados pessoais fora do Brasil ou transferência internacional de dados, conforme a infraestrutura e as operações efetivamente utilizadas.</p>
    <p>Quando houver transferência internacional, ela deverá observar os requisitos da Lei Geral de Proteção de Dados Pessoais (LGPD) e os mecanismos legais aplicáveis.</p>
    <p>O Custô adotará medidas contratuais, técnicas e organizacionais adequadas para proteger os dados pessoais tratados por seus fornecedores.</p>
    <h2>6. Por quanto tempo</h2>
    <p>Mantemos os dados enquanto a conta existir. Após a exclusão, os dados são apagados conforme o procedimento de exclusão. Cópias de segurança são substituídas pelo ciclo de retenção dos backups. Prazos específicos: <Pending>prazos definitivos de retenção (proposta técnica em revisão)</Pending>.</p>
    <h2>7. Seus direitos</h2>
    <p>Você pode pedir confirmação, acesso, correção, portabilidade e exclusão dos seus dados, e informações sobre o compartilhamento. Seus dados de trabalho podem ser exportados a qualquer momento em <strong>Backup</strong>, dentro do aplicativo. Pedidos pelo canal <a href="mailto:contato@dabitech.com.br">contato@dabitech.com.br</a>, com resposta em <Pending>prazo de atendimento</Pending>.</p>
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
    <p>O Custô ajuda pequenos produtores de alimentos a calcular custos e preços, organizar encomendas e recebimentos e enviar orçamentos. Fornecedor: 57.936.721 Moyses Emanuel Costa Silva, CNPJ 57.936.721/0001-25. Canal oficial de atendimento: <a href="mailto:contato@dabitech.com.br">contato@dabitech.com.br</a>.</p>
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
    <p>O Custô está disponível inicialmente em modalidade de <strong>beta fechado e gratuito</strong>, destinada a um grupo limitado de usuários convidados para testar suas funcionalidades e contribuir com a evolução da plataforma.</p>
    <h3>7.1. Duração e gratuidade</h3>
    <p>O período de participação no beta será de 90 (noventa) dias, contados a partir da ativação da conta, sem cobrança de mensalidades ou taxas de adesão.</p>
    <h3>7.2. Funcionalidades e disponibilidade</h3>
    <p>Durante o beta, os participantes poderão utilizar as funcionalidades disponibilizadas no Custô, incluindo precificação de receitas, gerenciamento de ingredientes, embalagens, encomendas, recebimentos e orçamentos.</p>
    <p>Por se tratar de uma versão em avaliação, funcionalidades poderão ser modificadas, aprimoradas ou descontinuadas. Poderão ocorrer falhas, interrupções temporárias e períodos de manutenção, que serão tratados conforme a disponibilidade operacional do serviço.</p>
    <h3>7.3. Encerramento do beta</h3>
    <p>Ao término do período gratuito, o Custô poderá oferecer planos comerciais para continuidade da utilização.</p>
    <p>A adesão a eventual plano pago será opcional e dependerá da aceitação expressa do usuário. <strong>Não haverá cobrança automática ao final do beta.</strong></p>
    <p>Caso o usuário opte por não continuar, poderá solicitar a exportação dos seus dados, observadas as funcionalidades disponíveis, a política de privacidade e os prazos de retenção aplicáveis.</p>
    <p>O encerramento, a suspensão ou a prorrogação do beta serão comunicados com antecedência razoável, sempre que possível.</p>
    <h3>7.4. Suporte</h3>
    <p>Durante o beta, os participantes poderão entrar em contato pelos canais oficiais de atendimento informados na plataforma.</p>
    <p>O atendimento será realizado, em regra, de segunda a quinta-feira, das 9h às 18h, e às sextas-feiras, das 9h às 16h, no horário de Brasília, exceto feriados.</p>
    <p>O suporte será prestado conforme a disponibilidade da equipe, sem garantia de prazo específico de resposta ou resolução.</p>
    <h3>7.5. Feedback dos participantes</h3>
    <p>Os participantes poderão encaminhar sugestões, relatos de erros e comentários sobre a experiência de utilização. As contribuições poderão ser consideradas no desenvolvimento e aprimoramento do Custô, sem obrigação de implementação.</p>
    <h2>8. Cancelamento e encerramento</h2>
    <p>O participante poderá solicitar o cancelamento de sua conta no Custô a qualquer momento, sem cobrança de multa durante o período gratuito do beta fechado.</p>
    <p>O Custô poderá encerrar o programa beta ou descontinuar o serviço, mediante comunicação com antecedência mínima de 30 (trinta) dias, sempre que possível.</p>
    <p>Em situações de risco à segurança, uso indevido da plataforma, determinação legal ou necessidade técnica urgente, o acesso poderá ser suspenso imediatamente, mediante justificativa quando cabível.</p>
    <p>Antes do encerramento programado, será disponibilizada ao usuário a possibilidade de exportar seus dados pelos recursos existentes na plataforma.</p>
    <p>A exclusão dos dados pessoais observará a Política de Privacidade, os prazos de retenção aplicáveis e as obrigações legais.</p>
    <h2>9. Legislação e resolução de conflitos</h2>
    <p>Estes Termos são regidos pela legislação brasileira.</p>
    <p>Eventuais conflitos deverão ser preferencialmente resolvidos por meio de contato direto com o suporte do Custô.</p>
    <p>Quando necessária a solução judicial, será observada a competência legal aplicável, respeitados os direitos do consumidor, inclusive quanto ao foro competente.</p>
    <p>Para relações em que a eleição de foro seja juridicamente válida, as partes elegem o foro da Comarca de Curitiba, Paraná.</p>
  </>;
}

export function LegalPage({ path }: { path: LegalPath }) {
  return <div className="legal-page">
    <header className="legal-head"><a href="/" aria-label="Custô — voltar ao aplicativo"><img src="/brand/custo-green.svg" alt="Custô" className="legal-logo" /></a></header>
    <main className="legal-card">
      <p className="legal-draft" role="note"><strong>Minuta em revisão.</strong> Este texto ainda não é a versão definitiva e depende de revisão jurídica.</p>
      {path === '/privacidade' ? <Privacy /> : <Terms />}
      <nav className="legal-nav" aria-label="Documentos"><a href="/privacidade">Política de privacidade</a><a href="/termos">Termos de uso</a><a href="/">Voltar ao Custô</a></nav>
    </main>
  </div>;
}
