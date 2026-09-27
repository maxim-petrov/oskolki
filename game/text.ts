/** Russian text helpers shared by the engine and the renderer: plurals and hearts. */

/** Russian plural: 1 заряд, 2 заряда, 5 зарядов. */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/**
 * Health is counted in half-hearts: 1 → «½», 8 → «4», 7 → «3,5» (the pixel font draws «½» as a small
 * «1/2», so «3½» would read «31/2»).
 */
export function heartText(half: number): string {
  const n = Math.abs(half);
  const sign = half < 0 ? '−' : '';
  if (n === 1) return `${sign}½`;
  return `${sign}${Math.floor(n / 2)}${n % 2 ? ',5' : ''}`;
}

/** «3,5 сердца», «1 сердце», «½ сердца», «5 сердец». */
export function heartsText(half: number): string {
  const n = heartText(half);
  if (Math.abs(half) % 2) return `${n} сердца`;
  return `${n} ${plural(Math.abs(half) / 2, 'сердце', 'сердца', 'сердец')}`;
}
