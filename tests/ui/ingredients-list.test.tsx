// @vitest-environment jsdom
/** Ingredientes: lista primeiro, formulário só sob demanda, ações no botão ⋯. Visão geral: primeiros passos somem quando concluídos. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { emptyData, saveData } from '../../src/storage/db';
import { resetStorage } from './setup';

const loaded = async () => waitFor(() => expect(screen.queryByText('Carregando seus dados…')).toBeNull());
const nav = async (u: ReturnType<typeof userEvent.setup>, name: string) => u.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name }));
const memory = new Map<string, string>();
beforeEach(async () => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k), clear: () => memory.clear() });
  await resetStorage(); window.history.replaceState({}, '', '/');
});

describe('Ingredientes', () => {
  it('sem ingredientes o formulário já aparece; com ingredientes, só a lista até clicar em "Novo ingrediente"', async () => {
    const u = userEvent.setup(); render(<App />); await loaded(); await nav(u, 'Ingredientes');
    expect(screen.getByLabelText('Nome do ingrediente')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull(); // nada para fechar com a lista vazia
    await u.type(screen.getByLabelText('Nome do ingrediente'), 'Sal'); fireEvent.change(screen.getByLabelText('Preço pago (R$)'), { target: { value: '3' } });
    await u.click(screen.getByRole('button', { name: /Adicionar ingrediente/ }));
    expect(within(screen.getByRole('list', { name: 'Ingredientes cadastrados' })).getByText('Sal')).toBeTruthy();
    // depois do primeiro, a lista basta: o formulário só volta pelo botão
    await nav(u, 'Visão geral'); await nav(u, 'Ingredientes');
    expect(screen.queryByLabelText('Nome do ingrediente')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Novo ingrediente' }));
    expect(screen.getByLabelText('Nome do ingrediente')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByLabelText('Nome do ingrediente')).toBeNull();
  });

  it('o botão ⋯ abre Editar/Excluir; Editar abre o formulário com os dados; Esc fecha o menu', async () => {
    await saveData({ ...emptyData(), ingredients: [{ id: 'f', name: 'Farinha', unit: 'g', purchaseQuantity: 1000, purchasePrice: 6.9 }] });
    const u = userEvent.setup(); render(<App />); await loaded(); await nav(u, 'Ingredientes');
    const trigger = screen.getByRole('button', { name: 'Ações de Farinha' });
    await u.click(trigger); expect(screen.getByRole('menu', { name: 'Ações de Farinha' })).toBeTruthy();
    await u.keyboard('{Escape}'); expect(screen.queryByRole('menu')).toBeNull(); expect(document.activeElement).toBe(trigger);
    await u.click(trigger); await u.click(screen.getByRole('menuitem', { name: 'Editar Farinha' }));
    expect((screen.getByLabelText('Nome do ingrediente') as HTMLInputElement).value).toBe('Farinha');
    await u.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(screen.queryByLabelText('Nome do ingrediente')).toBeNull();
  });
});

describe('Visão geral: primeiros passos', () => {
  const done = { ...emptyData(), ingredients: [{ id: 'f', name: 'Farinha', unit: 'g' as const, purchaseQuantity: 1000, purchasePrice: 6.9 }],
    recipes: [{ id: 'r', name: 'Bolo', yield: 1, items: [{ ingredientId: 'f', quantity: 100, unit: 'g' as const }], packagingPerUnit: 0, laborTotal: 0, extraTotal: 0, desiredMargin: 50 }],
    orders: [{ id: 'o', customer: 'Ana', deposit: 0, deliveryDate: '2026-12-20', status: 'Orçamento' as const, createdAt: '2026-11-14T10:00:00.000Z', quoteCode: 'ORC-K7M42P', items: [{ id: 'a', recipeId: 'r', recipeName: 'Bolo', quantity: 1, unitPrice: 50 }] }] };

  it('o backup só conta depois de baixado; com tudo feito, o quadro e a boas-vindas somem', async () => {
    await saveData(done);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    const u = userEvent.setup(); render(<App />); await loaded();
    expect(screen.getByRole('heading', { name: 'Primeiros passos' })).toBeTruthy();
    await nav(u, 'Backup');
    await u.click(screen.getByRole('button', { name: /Baixar backup|Exportar/ }));
    await nav(u, 'Visão geral');
    expect(screen.queryByRole('heading', { name: 'Primeiros passos' })).toBeNull();
    expect(screen.queryByText('Seu negócio, no caminho certo.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Últimas encomendas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vendas por mês' })).toBeTruthy(); // gráfico ocupa o lugar dos primeiros passos
    expect(screen.getByText(/O gráfico aparece quando houver pedidos confirmados/)).toBeTruthy(); // só há um orçamento
  });
});
