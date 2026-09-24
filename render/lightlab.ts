import { LIGHT_STYLE, resetLightCache } from './lighting.ts';
import { resetVignette } from './scene.ts';

/**
 * Light lab (F2): live sliders for the look of the light pools, so the style is tuned by eye
 * instead of by rebuilds. Values persist per browser; «Копировать» puts them on the clipboard
 * to paste into LIGHT_STYLE as new defaults.
 */
const KEY = 'oskolki.lightlab';
const DEFAULTS = { ...LIGHT_STYLE };

type Field = { key: keyof typeof LIGHT_STYLE; label: string; min: number; max: number; step: number };
const FIELDS: Field[] = [
  { key: 'mode', label: 'Режим: 0 плавно · 1 кольца · 2 зоны', min: 0, max: 2, step: 1 },
  { key: 'bands', label: 'Ступени света', min: 1, max: 9, step: 1 },
  { key: 'seam', label: 'Шов между ступенями', min: 0, max: 0.6, step: 0.02 },
  { key: 'falloff', label: 'Спад к краю', min: 0.5, max: 2.5, step: 0.05 },
  { key: 'ambient', label: 'Окружающий свет', min: 0.4, max: 2, step: 0.05 },
  { key: 'bloom', label: 'Ореол', min: 0, max: 0.6, step: 0.02 },
  { key: 'vignette', label: 'Виньетка', min: 0, max: 1.5, step: 0.05 },
];

export function loadLightStyle() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(LIGHT_STYLE, JSON.parse(raw));
  } catch {
    /* storage unavailable: defaults */
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(LIGHT_STYLE));
  } catch {
    /* storage unavailable */
  }
}

export function setLightStyle(patch: Partial<typeof LIGHT_STYLE>) {
  Object.assign(LIGHT_STYLE, patch);
  resetLightCache();
  resetVignette();
  save();
}

let panel: HTMLElement | null = null;

export function toggleLightLab(host: HTMLElement) {
  if (panel) {
    panel.remove();
    panel = null;
    return;
  }
  panel = document.createElement('div');
  panel.className = 'light-lab';
  const title = document.createElement('div');
  title.className = 'light-lab-title';
  title.textContent = 'Лаборатория света · F2';
  panel.appendChild(title);
  const inputs = new Map<string, [HTMLInputElement, HTMLSpanElement]>();
  for (const f of FIELDS) {
    const row = document.createElement('label');
    row.className = 'light-lab-row';
    const name = document.createElement('span');
    name.textContent = f.label;
    const value = document.createElement('span');
    value.className = 'light-lab-value';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(f.min);
    input.max = String(f.max);
    input.step = String(f.step);
    input.value = String(LIGHT_STYLE[f.key]);
    value.textContent = input.value;
    input.addEventListener('input', () => {
      value.textContent = input.value;
      setLightStyle({ [f.key]: Number(input.value) });
    });
    // appendChild: the worker typings shadow Element.append with HTMLRewriter's signature.
    row.appendChild(name);
    row.appendChild(value);
    row.appendChild(input);
    panel.appendChild(row);
    inputs.set(f.key, [input, value]);
  }
  const buttons = document.createElement('div');
  buttons.className = 'light-lab-buttons';
  const reset = document.createElement('button');
  reset.textContent = 'Сбросить';
  reset.addEventListener('click', () => {
    setLightStyle({ ...DEFAULTS });
    for (const [key, [input, value]] of inputs) {
      input.value = String(LIGHT_STYLE[key as keyof typeof LIGHT_STYLE]);
      value.textContent = input.value;
    }
  });
  const copy = document.createElement('button');
  copy.textContent = 'Копировать';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(JSON.stringify(LIGHT_STYLE, null, 2));
    copy.textContent = 'Скопировано';
    window.setTimeout(() => (copy.textContent = 'Копировать'), 1200);
  });
  buttons.appendChild(reset);
  buttons.appendChild(copy);
  panel.appendChild(buttons);
  host.appendChild(panel);
}

export const isLabEvent = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.('.light-lab');
