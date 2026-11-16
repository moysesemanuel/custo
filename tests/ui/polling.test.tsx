// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from '../../src/usePolling';

const setVisibility = (v: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });

describe('usePolling (mensagens de suporte chegam sem recarregar)', () => {
  beforeEach(() => { vi.useFakeTimers(); setVisibility('visible'); });
  afterEach(() => { vi.useRealTimers(); setVisibility('visible'); });

  it('chama a cada intervalo com a aba visível', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 15_000));
    vi.advanceTimersByTime(45_000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('não chama com a aba escondida e busca logo ao voltar', () => {
    const fn = vi.fn();
    renderHook(() => usePolling(fn, 15_000));
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    expect(fn).not.toHaveBeenCalled();
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus')); // mesmo retorno: uma chamada só
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('null desliga e desmontar para o timer', () => {
    const fn = vi.fn();
    const { rerender, unmount } = renderHook(({ ms }) => usePolling(fn, ms), { initialProps: { ms: null as number | null } });
    vi.advanceTimersByTime(60_000);
    expect(fn).not.toHaveBeenCalled();
    rerender({ ms: 10_000 });
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(60_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
