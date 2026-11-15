/**
 * Página de vendas (/ para quem ainda não usa o app), no layout da referência aprovada pelo proprietário.
 * Promete só o que o Custô faz e as condições publicadas nos termos (beta gratuito por 14 dias, sem cobrança automática,
 * cancelamento a qualquer momento). A tela do notebook é captura real do app com dados FICTÍCIOS.
 * O depoimento foi fornecido pelo proprietário (TESTIMONIAL abaixo).
 */
import { ArrowRight, Box, Cake, Calculator, CalendarDays, CircleCheck, Clock, CreditCard, FileText, Heart, Layers, Play, ShoppingBag, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import { TRIAL_DAYS } from '../../shared/trial';
import './landing.css';

const CONTACT = 'contato@dabitech.com.br';
export const BETA_MAILTO = `mailto:${CONTACT}?subject=${encodeURIComponent('Quero testar o Custô grátis')}&body=${encodeURIComponent('Olá! Quero participar do beta gratuito do Custô.\n\nMeu nome:\nNome do meu negócio:\nO que eu produzo:\nCidade:\n')}`;
export { TRIAL_DAYS } from '../../shared/trial';

export const TESTIMONIAL = {
  quote: 'O Custô mudou a forma como eu precifico meus produtos. Hoje eu tenho clareza do meu custo, sei exatamente o meu lucro e consigo planejar o crescimento da minha confeitaria com muito mais segurança.',
  name: 'Lana Costa',
  role: 'Confeiteira e proprietária da Lana Costa Doces',
};

const features = [
  { icon: Calculator, title: 'Controle de custos', text: 'Saiba o custo real de cada receita e produza com segurança.' },
  { icon: Layers, title: 'Fichas técnicas', text: 'Padronize suas receitas, calcule rendimentos e evite desperdícios.' },
  { icon: Box, title: 'Embalagens', text: 'Inclua o custo das embalagens e veja o preço final completo.' },
  { icon: ShoppingBag, title: 'Pedidos', text: 'Organize e acompanhe seus pedidos do começo ao fim.' },
  { icon: FileText, title: 'Orçamentos', text: 'Crie orçamentos profissionais e envie para seus clientes em poucos cliques.' },
  { icon: Wallet, title: 'Recebimentos', text: 'Registre sinal e parcelas, confirme pedidos e saiba quanto falta receber.' },
];

const Mark = ({ className }: { className: string }) => <img src="/brand/favicon-custo-white.svg" alt="" aria-hidden="true" className={className} width={202} height={266} />;

export function Landing() {
  return <div className="lp">
    <a className="lp-skip" href="#conteudo">Pular para o conteúdo</a>
    <header className="lp-header">
      <div className="lp-wrap lp-header-row">
        <a href="/" aria-label="Custô — início"><img src="/brand/custo-green.svg" alt="Custô" className="lp-logo" width={140} height={50} /></a>
        <nav className="lp-nav" aria-label="Seções"><a href="#solucoes">Soluções</a><a href="#numeros">Seus números</a><a href="#clientes">Clientes</a><span className="lp-nav-off" aria-disabled="true" title="Em breve">Planos <small>em breve</small></span></nav>
        <div className="lp-header-cta"><a className="lp-link" href="/entrar">Entrar</a><a className="lp-btn lp-btn-sm" href={BETA_MAILTO}>Testar grátis</a></div>
      </div>
    </header>

    <main id="conteudo">
      <section className="lp-hero">
        <img className="lp-hero-photo" src="/landing/hero-confeiteira.webp" alt="Confeiteira sorridente com avental do Custô ao lado de um bolo decorado" width={1280} height={924} fetchPriority="high" />
        <div className="lp-wrap lp-hero-copy">
          <img src="/brand/custo-color.svg" alt="" aria-hidden="true" className="lp-hero-logo" width={230} height={82} />
          <h1>Seu custo na ponta do lápis. <span>Seu lucro na mão.</span></h1>
          <p className="lp-lead">O sistema completo para confeiteiras, cake designers e pequenos negócios de alimentos que querem precificar com segurança, organizar a produção, controlar pedidos e acompanhar recebimentos.</p>
          <div className="lp-cta-row">
            <a className="lp-btn" href={BETA_MAILTO}>Testar grátis</a>
            <a className="lp-btn lp-btn-ghost" href="#numeros"><Play size={20} aria-hidden="true" /> Quero conhecer</a>
          </div>
          <ul className="lp-trust">
            <li><CalendarDays size={24} aria-hidden="true" /><span>Teste grátis<br />por {TRIAL_DAYS} dias</span></li>
            <li><CreditCard size={24} aria-hidden="true" /><span>Sem cartão<br />de crédito</span></li>
            <li><CircleCheck size={24} aria-hidden="true" /><span>Cancelamento<br />sem burocracia</span></li>
          </ul>
        </div>
        <span className="lp-hero-wave" aria-hidden="true" />
      </section>

      <section className="lp-wrap" aria-label="Destaques">
        <div className="lp-strip">
          <p><Cake size={30} aria-hidden="true" /> Feito para quem vive da confeitaria e da produção artesanal</p>
          <p><Sparkles size={30} aria-hidden="true" /> Mais organização, lucratividade e tempo para criar</p>
          <p><Heart size={30} aria-hidden="true" /> Pensado para empreendedores como você</p>
        </div>
      </section>

      <section className="lp-section lp-wrap lp-features" id="solucoes">
        <div>
          <p className="lp-eyebrow">Tudo o que você precisa<br />em um só lugar</p>
          <h2>Do custo ao pagamento, mais controle e lucro para o seu negócio.</h2>
          <span className="lp-bar" aria-hidden="true" />
        </div>
        <ul className="lp-feature-grid">
          {features.map(({ icon: Icon, title, text }) => <li key={title}><span className="lp-icon"><Icon size={26} aria-hidden="true" /></span><div><h3>{title}</h3><p>{text}</p></div></li>)}
        </ul>
      </section>

      <section className="lp-showcase" id="numeros">
        <img className="lp-cake" src="/landing/bolo-morango.webp" alt="" aria-hidden="true" width={410} height={600} loading="lazy" />
        <Mark className="lp-mark lp-mark-showcase" />
        <div className="lp-showcase-grid">
          <div className="lp-laptop">
            <div className="lp-laptop-screen"><img src="/landing/app-dashboard.webp" alt="Painel do Custô com pedidos em aberto, valores a receber, pedidos confirmados e saldo estimado" width={1600} height={1000} loading="lazy" /></div>
            <div className="lp-laptop-base" aria-hidden="true" />
          </div>
          <div>
            <h2>Visualize seus números, tome decisões melhores e lucre mais.</h2>
            <p className="lp-text">Acompanhe custos, pedidos, orçamentos e recebimentos em um painel simples, intuitivo e feito para a sua rotina.</p>
            <ul className="lp-checks">
              <li><CircleCheck size={24} aria-hidden="true" /> Visão clara do seu lucro</li>
              <li><CircleCheck size={24} aria-hidden="true" /> Receitas e custos sempre atualizados</li>
              <li><CircleCheck size={24} aria-hidden="true" /> Gestão completa do seu negócio</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-wrap" id="clientes" aria-label="Depoimento">
        <div className="lp-proof">
          <figure className="lp-quote">
            <img className="lp-avatar" src="/landing/lana-costa.webp" alt="Lana Costa, confeiteira" width={600} height={400} loading="lazy" />
            <div>
              <span className="lp-quote-mark" aria-hidden="true">“</span>
              <blockquote>{TESTIMONIAL.quote}</blockquote>
              <figcaption><strong>{TESTIMONIAL.name}</strong><span>{TESTIMONIAL.role}</span></figcaption>
            </div>
          </figure>
          <ul className="lp-benefits">
            <li><TrendingUp size={36} aria-hidden="true" /><strong>Preço certo</strong><span>para cada receita</span></li>
            <li><Clock size={36} aria-hidden="true" /><strong>Mais tempo</strong><span>para produzir e criar</span></li>
            <li><Heart size={36} aria-hidden="true" /><strong>Mais confiança</strong><span>para vender e crescer</span></li>
          </ul>
        </div>
      </section>

      <section className="lp-final" id="comecar">
        <Mark className="lp-mark lp-mark-final" />
        <div className="lp-wrap lp-final-row">
          <h2>Pronta para levar a sua confeitaria a outro nível?</h2>
          <p>Teste o Custô grátis por {TRIAL_DAYS} dias, sem cartão de crédito, e descubra como é simples ter mais controle, lucro e organização no seu negócio.</p>
          <a className="lp-btn" href={BETA_MAILTO}>Testar grátis <ArrowRight size={22} aria-hidden="true" /></a>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-row">
        <p>57.936.721 Moyses Emanuel Costa Silva · CNPJ 57.936.721/0001-25 · <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
        <nav aria-label="Documentos"><a href="/privacidade">Política de privacidade</a><a href="/termos">Termos de uso</a></nav>
      </div>
    </footer>
  </div>;
}
