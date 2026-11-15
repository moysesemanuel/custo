// @vitest-environment jsdom
/** Página de vendas: aparece em "/" só para quem nunca entrou; condições iguais às dos termos. */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BETA_MAILTO, Landing, TESTIMONIAL, TRIAL_DAYS } from '../../src/landing/Landing';

const memory = new Map<string, string>();
const stubStorage = () => vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() });
afterEach(() => { document.body.innerHTML = ''; memory.clear(); window.history.replaceState({}, '', '/'); vi.resetModules(); vi.unstubAllGlobals(); });

const boot = async (path: string) => {
  const fetch = vi.fn(async () => new Response('{}', { status: 401 })); vi.stubGlobal('fetch', fetch);
  stubStorage(); window.history.replaceState({}, '', path);
  document.body.innerHTML = '<div id="root"></div>';
  await import('../../src/main');
  return fetch;
};

describe('página de vendas', () => {
  it('a mensagem principal e as chamadas aparecem logo no topo; todas levam ao pedido de acesso', () => {
    render(<Landing />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Seu custo na ponta do lápis. Seu lucro na mão.');
    const ctas = screen.getAllByRole('link', { name: /testar grátis/i });
    expect(ctas.length).toBe(3);
    expect(ctas.every(a => a.getAttribute('href') === BETA_MAILTO)).toBe(true);
    expect(BETA_MAILTO).toMatch(/^mailto:contato@dabitech\.com\.br\?subject=/);
    expect(screen.getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe('/entrar');
  });
  it('condições iguais às dos termos (14 dias, sem cartão, cancelamento) e nenhum número de resultado inventado', () => {
    render(<Landing />);
    const text = document.body.textContent ?? '';
    expect(TRIAL_DAYS).toBe(14);
    for (const s of ['Teste grátispor 14 dias', 'Sem cartãode crédito', 'Cancelamentosem burocracia', 'grátis por 14 dias, sem cartão de crédito']) expect(text, s).toContain(s);
    expect(text).not.toMatch(/90 dias|\+\d+\s*%|receba online|pagamentos online/i);
    expect(text).toContain('CNPJ 57.936.721/0001-25');
  });
  it('depoimento com a atribuição fornecida pelo proprietário, sem foto de outra pessoa', () => {
    render(<Landing />);
    const fig = document.querySelector('figure')!;
    expect(fig.querySelector('blockquote')!.textContent).toBe(TESTIMONIAL.quote);
    expect(fig.textContent).toContain('Lana Costa');
    expect(fig.textContent).toContain('Confeiteira e proprietária da Lana Costa Doces');
    expect(fig.querySelector('img')).toBeNull();
  });
  it('só a foto do topo tem prioridade alta; as demais carregam sob demanda e a tela do app tem texto alternativo', () => {
    render(<Landing />);
    const imgs = [...document.querySelectorAll('img')].filter(i => i.src.includes('/landing/'));
    expect(imgs.map(i => i.getAttribute('fetchpriority'))).toEqual(['high', null, null]);
    expect(imgs.slice(1).every(i => i.getAttribute('loading') === 'lazy')).toBe(true);
    expect(imgs.find(i => i.src.includes('app-dashboard'))!.getAttribute('alt')!.length).toBeGreaterThan(20);
  });
});

describe('rota "/"', () => {
  it('visitante (nunca entrou neste navegador): página de vendas, sem chamar a API', async () => {
    const fetch = await boot('/');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /Seu custo na ponta do lápis/ })).toBeTruthy());
    expect(fetch).not.toHaveBeenCalled();
  });
  it('quem já entrou neste navegador vai direto ao app', async () => {
    memory.set('pedidocerto.lastAccess', String(Date.now()));
    const fetch = vi.fn(async () => new Response('{}', { status: 401 })); vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() });
    window.history.replaceState({}, '', '/'); document.body.innerHTML = '<div id="root"></div>';
    await import('../../src/main');
    await waitFor(() => expect(document.getElementById('root')!.childElementCount).toBeGreaterThan(0), { timeout: 5000 });
    expect(document.querySelector('.lp')).toBeNull();
  });
  it('"/entrar" sempre abre o app, nunca a página de vendas', async () => {
    await boot('/entrar');
    await waitFor(() => expect(document.getElementById('root')!.childElementCount).toBeGreaterThan(0), { timeout: 5000 });
    expect(document.querySelector('.lp')).toBeNull();
  });
});
