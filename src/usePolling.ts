import { useEffect, useRef } from 'react';

/**
 * Chama `fn` a cada `intervalMs` enquanto a aba estiver visível, e logo que a pessoa volta para a aba.
 * `intervalMs = null` desliga. Aba escondida não faz requisição (poupa a cota gratuita do Worker/D1).
 */
export function usePolling(fn: () => void, intervalMs: number | null) {
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; }, [fn]);
  useEffect(() => {
    if (intervalMs == null) return;
    let last = Date.now();
    const run = () => { if (document.visibilityState !== 'visible') return; last = Date.now(); latest.current(); };
    const timer = setInterval(run, intervalMs);
    // focus e visibilitychange costumam disparar juntos: uma chamada só.
    const onWake = () => { if (Date.now() - last > 5_000) run(); };
    document.addEventListener('visibilitychange', onWake); window.addEventListener('focus', onWake);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onWake); window.removeEventListener('focus', onWake); };
  }, [intervalMs]);
}
