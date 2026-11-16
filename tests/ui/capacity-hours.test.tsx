// @vitest-environment jsdom
/** Capacidade diária digitada em HORAS (antes era em minutos e "5" virava 5 minutos). Guardada em minutos, sem mudar dados existentes. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/App';
import { emptyData, loadData, saveData } from '../../src/storage/db';
import { minutesToHoursInput, parseHours } from '../../src/domain/schedule';
import { resetStorage } from './setup';

describe('parseHours / minutesToHoursInput', () => {
  it('entende horas inteiras, decimais e h:mm', () => {
    expect(['5', '4,5', '4.5', '4:30', '4h30', '4h', ' 4 h 30 min ', '0', '24', '0:05'].map(parseHours)).toEqual([300, 270, 270, 270, 270, 240, 270, 0, 1440, 5]);
    expect(parseHours('')).toBeUndefined();
    for (const bad of ['25', '4:60', 'abc', '-1', '4,555', '100']) expect(parseHours(bad), bad).toBeNull();
    expect([300, 270, 5, 0].map(minutesToHoursInput)).toEqual(['5', '4:30', '0:05', '0']);
  });
});

describe('Configurações: horas de produção por dia', () => {
  beforeEach(async () => { await resetStorage(); window.history.replaceState({}, '', '/'); });
  const open = async (u: ReturnType<typeof userEvent.setup>) => {
    render(<App />); await waitFor(() => expect(screen.queryByText('Carregando seus dados…')).toBeNull());
    await u.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'Configurações' }));
    return screen.getByLabelText('Horas de produção por dia') as HTMLInputElement;
  };

  it('"5" salva 5 horas (300 minutos) e mostra a confirmação em horas', async () => {
    const u = userEvent.setup(); const input = await open(u);
    await u.type(input, '5'); expect(screen.getByText('5 h por dia.')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect((await loadData()).settings?.dailyCapacityMinutes).toBe(300));
  });

  it('valor salvo em minutos aparece em horas; valor muito baixo ganha um aviso', async () => {
    await saveData({ ...emptyData(), settings: { cupSizeMl: 240, dailyCapacityMinutes: 5 } });
    const u = userEvent.setup(); const input = await open(u);
    expect(input.value).toBe('0:05');
    expect(screen.getByText(/Isso é só 5 min por dia/)).toBeTruthy();
    await u.clear(input); await u.type(input, '4:30'); expect(screen.getByText('4 h 30 min por dia.')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect((await loadData()).settings?.dailyCapacityMinutes).toBe(270));
  });
});
