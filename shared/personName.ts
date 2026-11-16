/** Nome da pessoa titular da licença: letras (com acento), espaços, apóstrofo, ponto e hífen; até 60 caracteres. */
export const PERSON_NAME_MAX = 60;
const PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

/** Normaliza (espaços repetidos, NFC). Devolve null se vazio ou inválido. */
export function cleanPersonName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!v || v.length > PERSON_NAME_MAX || !PATTERN.test(v)) return null;
  return v;
}

/** Primeiro nome, para a saudação ("Lana Costa" → "Lana"). */
export const firstName = (name: string | null | undefined): string | null => (name ? name.trim().split(' ')[0] || null : null);
