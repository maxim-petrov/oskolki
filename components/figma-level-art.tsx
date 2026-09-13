/* eslint-disable nextjs/no-img-element, jsx-a11y/prefer-tag-over-role -- Exact exported Figma artwork with an accessible, art-backed resource group. */
import type { CSSProperties } from 'react';
import type { Family } from '@/game/engine';
export const ART = '/art/figma-office/';
export function Cutout({
  file,
  source,
  crop,
  className = '',
  style,
}: {
  file: string;
  source: readonly [number, number];
  crop: readonly [number, number, number, number];
  className?: string;
  style?: CSSProperties;
}) {
  const [x, y, w, h] = crop;
  return (
    <span
      className={`level-cutout ${className}`}
      style={style}
      aria-hidden="true"
    >
      <img
        src={ART + file}
        alt=""
        draggable={false}
        style={{
          width: `${(source[0] / w) * 100}%`,
          height: `${(source[1] / h) * 100}%`,
          left: `${(-x / w) * 100}%`,
          top: `${(-y / h) * 100}%`,
        }}
      />
    </span>
  );
}
export function FigmaTile({ family }: { family: Family }) {
  const crops = {
    shield: [58, 60, 546, 530],
    blade: [653, 46, 551, 541],
    spark: [57, 635, 540, 547],
    focus: [657, 634, 542, 551],
  } as const;
  return (
    <Cutout
      file={family === 'shield' ? 'imgImage54.png' : 'imgImage58.png'}
      source={[1254, 1254]}
      crop={crops[family]}
    />
  );
}
export function HeroHUD({
  hp,
  maxHp,
  energy,
}: {
  hp: number;
  maxHp: number;
  energy: number;
}) {
  const fill = (value: number, i: number): CSSProperties => ({
    clipPath: `inset(0 ${100 - Math.max(0, Math.min(1, value * 5 - i)) * 100}% 0 0)`,
  });
  return (
    <div
      className="level-health-hud"
      role="group"
      aria-label={`Здоровье ${hp} из ${maxHp}. Энергия ${energy} из 12`}
    >
      <img className="hud-base" src={ART + 'imgImage37.png'} alt="" />
      {Array.from({ length: 5 }, (_, i) => (
        <span
          className="level-heart"
          key={i}
          style={{ left: `${((790 + i * 220) / 2041) * 100}%` }}
        >
          <Cutout
            file="imgImage37.png"
            source={[2041, 770]}
            crop={[1666, 255, 202, 193]}
          />
          <span className="resource-fill" style={fill(hp / maxHp, i)}>
            <Cutout
              file="imgImage37.png"
              source={[2041, 770]}
              crop={[790, 255, 196, 193]}
            />
          </span>
        </span>
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <span
          className="level-drop"
          key={i}
          style={{ left: `${((807 + i * 149) / 2041) * 100}%` }}
        >
          <Cutout
            file="imgImage37.png"
            source={[2041, 770]}
            crop={[1402, 493, 115, 154]}
          />
          <span className="resource-fill" style={fill(energy / 12, i)}>
            <Cutout
              file="imgImage37.png"
              source={[2041, 770]}
              crop={[807, 493, 115, 154]}
            />
          </span>
        </span>
      ))}
      <span className="level-resource-caption">
        {hp}/{maxHp} HP <span>Энергия {energy}/12</span>
      </span>
    </div>
  );
}
export const ABILITIES = [
  {
    id: 'pierce',
    name: 'Режущий лист',
    text: '8 урона сквозь защиту',
    cost: '3 фокуса · 1 действие',
    x: 594,
  },
  {
    id: 'seal',
    name: 'Горящий отчёт',
    text: '16 урона',
    cost: '3 энергии + 2 здоровья · 1 действие',
    x: 797,
  },
  {
    id: 'guard',
    name: 'Бумажный заслон',
    text: '+8 защиты до конца хода',
    cost: '4 энергии · 1 действие',
    x: 1000,
  },
  {
    id: 'edit',
    name: 'Правка',
    text: 'Замени выбранную фишку',
    cost: '3 фокуса · 1 действие',
    x: 1203,
  },
  {
    id: 'bolt',
    name: 'Разряд',
    text: '12 урона',
    cost: '6 энергии · 1 действие',
    x: 1406,
  },
] as const;
