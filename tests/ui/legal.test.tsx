// @vitest-environment jsdom
/** /privacidade e /termos: abrem sem login, são versões vigentes completas e só trazem os dados fornecidos pelo proprietário. */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLegalPath, LegalPage } from '../../src/legal/LegalPage';

afterEach(() => { document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); vi.resetModules(); vi.unstubAllGlobals(); });

describe('páginas jurídicas', () => {
  it.each([['/privacidade', 'Política de privacidade'], ['/termos', 'Termos de uso']] as const)('%s é versão vigente, com data, os dados fornecidos pelo proprietário e nenhuma pendência', (path, title) => {
    render(<LegalPage path={path} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toBe('Vigente desde 14 de novembro de 2026.');
    const text = document.body.textContent ?? '';
    expect(text).toContain('57.936.721 Moyses Emanuel Costa Silva, CNPJ 57.936.721/0001-25');
    expect(text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)).toEqual(['57.936.721/0001-25']); // só o CNPJ informado
    expect(new Set(text.match(/[a-z0-9.-]+@[a-z0-9-]+(?:\.[a-z]+)+/gi))).toEqual(new Set(['contato@dabitech.com.br'])); // só o e-mail informado
    expect(text).not.toMatch(/PENDENTE|Minuta|revisão jurídica/);
  });
  it('a política descreve os dados realmente guardados e os fornecedores reais', () => {
    render(<LegalPage path="/privacidade" />);
    const text = document.body.textContent ?? '';
    for (const s of ['e-mail', 'hash', 'IndexedDB', 'Cloudflare', 'Resend', 'Backup', 'nome que você informar para cada cliente']) expect(text, s).toContain(s);
  });
  it('os termos trazem as condições do beta fornecidas (90 dias, gratuito, sem cobrança automática, horário de suporte)', () => {
    render(<LegalPage path="/termos" />);
    const text = document.body.textContent ?? '';
    for (const s of ['beta fechado e gratuito', '90 (noventa) dias', 'Não haverá cobrança automática ao final do beta.', 'de segunda a quinta-feira, das 9h às 18h, e às sextas-feiras, das 9h às 16h', 'sem garantia de prazo específico']) expect(text, s).toContain(s);
    expect(text).not.toMatch(/PENDENTE: (condições comerciais|horário de suporte)/);
  });
  it('a política traz as bases legais, os papéis (controlador/operador) e a transferência internacional fornecidos; os termos, cancelamento e foro', () => {
    render(<LegalPage path="/privacidade" />);
    let text = document.body.textContent ?? '';
    for (const s of ['execução de contrato ou de procedimentos preliminares', 'estes são, em regra, os controladores', 'O Custô atua como operador desses dados', 'transferência internacional de dados', 'Rua Frederico Maurer, Boqueirão, Curitiba/PR, Brasil', 'de segunda a quinta, das 9h às 18h, e sexta, das 9h às 16h']) expect(text, s).toContain(s);
    expect(text).not.toMatch(/PENDENTE: (base legal|papéis|análise de transferência|endereço)/);
    document.body.innerHTML = '';
    render(<LegalPage path="/termos" />);
    text = document.body.textContent ?? '';
    for (const s of ['antecedência mínima de 30 (trinta) dias', 'sem cobrança de multa', 'foro da Comarca de Curitiba, Paraná', 'respeitados os direitos do consumidor']) expect(text, s).toContain(s);
  });
  it('retenção (7 dias no histórico do banco, 90 nas cópias de segurança) e resposta sem prazo fixo, ressalvada a lei', () => {
    render(<LegalPage path="/privacidade" />);
    const text = document.body.textContent ?? '';
    for (const s of ['até 7 dias no histórico de recuperação', 'até 90 dias nas cópias de segurança', 'Não há um prazo fixo de resposta', 'observados os prazos previstos na legislação']) expect(text, s).toContain(s);
  });
  it('reconhece só os dois caminhos (com ou sem barra final)', () => {
    expect(isLegalPath('/privacidade')).toBe(true); expect(isLegalPath('/termos/')).toBe(true);
    expect(isLegalPath('/admin')).toBe(false); expect(isLegalPath('/')).toBe(false);
  });
  it('a rota real abre a página SEM passar pela tela de login e sem chamar a API', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 401 })); vi.stubGlobal('fetch', fetch);
    window.history.replaceState({}, '', '/termos');
    document.body.innerHTML = '<div id="root"></div>';
    await import('../../src/main');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Termos de uso' })).toBeTruthy());
    expect(screen.queryByText(/Acesse sua conta/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
