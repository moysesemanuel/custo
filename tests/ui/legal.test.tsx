// @vitest-environment jsdom
/** /privacidade e /termos: abrem sem login, são minutas marcadas e nunca inventam dados jurídicos. */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLegalPath, LegalPage } from '../../src/legal/LegalPage';

afterEach(() => { document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); vi.resetModules(); vi.unstubAllGlobals(); });

describe('páginas jurídicas', () => {
  it.each([['/privacidade', 'Política de privacidade'], ['/termos', 'Termos de uso']] as const)('%s é minuta marcada, com os dados fornecidos pelo proprietário e pendências visíveis', (path, title) => {
    render(<LegalPage path={path} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toMatch(/Minuta em revisão/);
    const text = document.body.textContent ?? '';
    expect(text).toContain('57.936.721 Moyses Emanuel Costa Silva, CNPJ 57.936.721/0001-25');
    expect(text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)).toEqual(['57.936.721/0001-25']); // só o CNPJ informado
    expect(new Set(text.match(/[a-z0-9.-]+@[a-z0-9-]+(?:\.[a-z]+)+/gi))).toEqual(new Set(['contato@dabitech.com.br'])); // só o e-mail informado
    expect(text).toMatch(/\[PENDENTE: /); // o que não foi fornecido continua marcado
  });
  it('a política descreve os dados realmente guardados e os fornecedores reais', () => {
    render(<LegalPage path="/privacidade" />);
    const text = document.body.textContent ?? '';
    for (const s of ['e-mail', 'hash', 'IndexedDB', 'Cloudflare', 'Resend', 'Backup', 'nome que você informar para cada cliente']) expect(text, s).toContain(s);
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
