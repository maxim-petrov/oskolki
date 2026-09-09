/* eslint-disable nextjs/no-img-element, jsx-a11y/no-noninteractive-tabindex -- Native pixel art must stay unoptimized; the scrolling map needs keyboard focus. */
'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoomIcon } from '@/components/room-icon';
import {
  routeMap,
  nextRooms,
  TOTAL_ROOMS,
  biomeAt,
  type State,
} from '@/game/engine';
import { roomBackground } from '@/game/visual-style';

const statusText = {
  visited: 'Пройдено',
  current: 'Ты здесь',
  available: 'Можно идти',
  future: 'Впереди',
  skipped: 'Другой путь',
};
const position = (depth: number, index: number, count: number) => ({
  x: ((index + 0.5) / count) * 100,
  y: (TOTAL_ROOMS - depth) * 84 + 12,
});
export function NextStops({ game }: { game: State }) {
  return (
    <div className="next-stops">
      <span>После находки — выбор пути на карте</span>
      <div>
        {nextRooms(game).map((room) => (
          <span key={room.id}>
            <RoomIcon kind={room.kind} />
            {room.name}
          </span>
        ))}
      </div>
    </div>
  );
}
export function JourneyMap({
  game,
  busy,
  onEnter,
}: {
  game: State;
  busy: boolean;
  onEnter: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scroll = useRef<HTMLElement>(null);
  const rows = routeMap(game);
  const choices = rows.flat().filter((node) => node.status === 'available');
  const selected = choices.find((node) => node.id === selectedId) ?? choices[0];
  useEffect(() => {
    const el = scroll.current;
    if (el)
      el.scrollTop = Math.max(
        0,
        (TOTAL_ROOMS - 1 - game.room) * 84 - el.clientHeight / 2 + 48,
      );
  }, [game.room, game.runId]);
  return (
    <div className="journey-map">
      <div className="map-legend">
        <span>
          <i className="map-key visited" />
          Пройдено
        </span>
        <span>
          <i className="map-key available" />
          Можно идти
        </span>
        <span>
          <ArrowUp size={14} />
          Два биома · два босса
        </span>
      </div>
      <section
        className="map-scroll"
        ref={scroll}
        tabIndex={0}
        aria-label="Карта двух биомов. Двадцать комнат, боссы в десятой и двадцатой. Прокрути, чтобы увидеть весь путь."
      >
        <div className="map-paper" style={{ height: TOTAL_ROOMS * 84 }}>
          <svg
            className="map-paths"
            viewBox={`0 0 1000 ${TOTAL_ROOMS * 84}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {rows.slice(0, -1).flatMap((row, ri) =>
              row.flatMap((from, fi) =>
                rows[ri + 1].map((to, ti) => {
                  const a = position(from.depth, fi, row.length),
                    b = position(to.depth, ti, rows[ri + 1].length);
                  const taken =
                    ['visited', 'current'].includes(from.status) &&
                    ['visited', 'current'].includes(to.status);
                  const available =
                    from.status === 'current' && to.status === 'available';
                  return (
                    <path
                      key={`${from.id}-${to.id}`}
                      className={taken ? 'taken' : available ? 'available' : ''}
                      d={`M ${a.x * 10} ${a.y + 35} L ${b.x * 10} ${b.y + 35}`}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }),
              ),
            )}
          </svg>
          {rows.flatMap((row) =>
            row.map((node, index) => {
              const point = position(node.depth, index, row.length);
              const active = node.status === 'available';
              return (
                <button
                  key={node.id}
                  className={`map-node map-${node.status} ${selected?.id === node.id ? 'selected' : ''}`}
                  style={{
                    left: `${point.x}%`,
                    top: point.y,
                    maxWidth: `${84 / row.length}%`,
                  }}
                  disabled={!active || busy}
                  aria-pressed={active ? selected?.id === node.id : undefined}
                  aria-label={`Комната ${node.depth}: ${node.name}. ${statusText[node.status]}`}
                  onClick={() => setSelectedId(node.id)}
                >
                  <RoomIcon kind={node.kind} />
                  <span>
                    <small>
                      {node.depth} · {node.depth > 10 ? 'II' : 'I'} ·{' '}
                      {statusText[node.status]}
                    </small>
                    <strong>{node.name}</strong>
                  </span>
                </button>
              );
            }),
          )}
        </div>
      </section>
      <p className="map-scroll-hint">
        Прокрути карту, чтобы увидеть все развилки.
      </p>
      {selected && (
        <div className="map-destination">
          <img
            src={roomBackground(selected.depth).src}
            alt=""
            className="map-destination-art"
          />
          <div>
            <small className="destination-biome">
              {biomeAt(selected.depth).name}
            </small>
            <strong>{selected.name}</strong>
            <p>{selected.description}</p>
          </div>
          <Button disabled={busy} onClick={() => onEnter(selected.id)}>
            Идти сюда <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}
