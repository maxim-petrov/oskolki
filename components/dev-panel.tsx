'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CardBadge, RoomThumb, Sprite } from '@/components/dev-previews';
import type { CharId, DevOp, DevState, Finish } from '@/game/types';
import type { DevApi, DevBuild, DevCard, DevPlace, DevStart } from '@/render/dev';

/**
 * The dev panel («Отдел тестов»), drawn in the game's own look: ink panels with pixel bevels, the
 * Tiny5 type, gold for what is chosen — and a preview for everything (heroes, cards as the game
 * draws them, items, pockets, enemies, events, rooms rendered with their lights, the map's icons).
 * ` or Ё opens it, F9 repeats the last test. All of it goes through render/dev.ts.
 */

type Catalog = ReturnType<DevApi['catalog']>;
type Snapshot = ReturnType<DevApi['snapshot']>;
type Tab = 'start' | 'build' | 'fight' | 'world' | 'office' | 'settings';

const TABS: [Tab, string, string][] = [
  ['start', 'Старт', 'map_fight'],
  ['build', 'Сборка', 'ui_deck'],
  ['fight', 'Бой', 'ui_hp'],
  ['world', 'Мир', 'ui_map'],
  ['office', 'Офис', 'ui_shard'],
  ['settings', 'Настройки', 'ui_pause'],
];

const FAMS: [string, string, string][] = [
  ['blade', 'Удар', 'tile_blade'],
  ['shield', 'Защита', 'tile_shield'],
  ['ink', 'Чернила', 'tile_ink'],
  ['coin', 'Деньги', 'tile_coin'],
  ['status', 'Волокита', 'tile_junk'],
];
const FINISHES: [Finish | '', string][] = [
  ['', 'без отделки'],
  ['sharp', 'заточка'],
  ['gild', 'позолота'],
  ['seal', 'печать'],
  ['copy', 'копия'],
  ['laminate', 'ламинат'],
];
const POOLS: [string, string][] = [
  ['', 'все'],
  ['starter', 'старт'],
  ['common', 'обычные'],
  ['uncommon', 'необычные'],
  ['rare', 'редкие'],
  ['boss', 'босс'],
  ['shop', 'касса'],
];
const KIND_ICON: Record<string, string> = { fight: 'map_fight', elite: 'map_elite', boss: 'map_boss', event: 'map_event', shop: 'map_shop', rest: 'map_rest', treasure: 'map_treasure' };
const PHASE_NAME: Record<string, string> = {
  map: 'карта',
  combat: 'бой',
  reward: 'награда',
  shop: 'касса',
  rest: 'кулер',
  event: 'событие',
  treasure: 'сейф',
  bossReward: 'награда босса',
  pick: 'выбор фишки',
  dead: 'смерть',
  won: 'победа',
};
const MODE_NAME: Record<string, string> = { title: 'титул', hub: 'офис', intro: 'вступление', run: 'смена' };
const BOSSES: [string, string][] = [
  ['supervisor', 'пустеет стол соседа'],
  ['tide', 'лифт открыт'],
  ['mirror', 'пропуск в дирекцию'],
];

const num = (v: string): number | undefined => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

function defaultStart(char: CharId = 'intern'): DevStart {
  return { char, act: 0, place: 'fight', enemies: [], cheats: {} };
}

export function DevPanel({ dev, onClose }: { dev: DevApi; onClose: () => void }) {
  const catalog = useMemo<Catalog>(() => dev.catalog(), [dev]);
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('oskolki.dev.tab') as Tab) || 'start');
  const [snap, setSnap] = useState<Snapshot>(() => dev.snapshot());
  const [cfg, setCfg] = useState<DevStart>(() => dev.last() ?? defaultStart());
  const [useBuild, setUseBuild] = useState<boolean>(() => !!dev.last()?.build);
  const [build, setBuild] = useState<DevBuild>(() => dev.last()?.build ?? dev.starter('intern'));
  const [note, setNote] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setSnap(dev.snapshot()), 400);
    return () => window.clearInterval(id);
  }, [dev]);
  useEffect(() => {
    try {
      localStorage.setItem('oskolki.dev.tab', tab);
    } catch {
      /* storage unavailable */
    }
  }, [tab]);

  const say = (s: string) => {
    setNote(s);
    window.setTimeout(() => setNote((n) => (n === s ? '' : n)), 2400);
  };
  const apply = (op: DevOp, done = 'Готово') => say(dev.apply(op) ?? done);
  const fullCfg = (): DevStart => ({ ...cfg, build: useBuild ? build : undefined });
  const launch = () => say(`Смена началась · сид ${dev.start(fullCfg())}`);
  const run = snap.run;

  return (
    <aside className="dev-panel" aria-label="Отдел тестов">
      <header className="dp-head">
        <span className="dp-title">ОТДЕЛ ТЕСТОВ</span>
        <span className="dp-status">
          <b>{MODE_NAME[snap.mode] ?? snap.mode}</b>
          {run && (
            <>
              <span>{PHASE_NAME[run.phase] ?? run.phase}</span>
              <span>отдел {run.act + 1}</span>
              <span className="dp-stat">
                <Sprite id="ui_hp" scale={2} /> {run.hp}/{run.maxHp}
              </span>
              <span className="dp-stat">
                <Sprite id="ui_coin" scale={2} /> {run.coins}
              </span>
              {run.custom && <span className="dp-badge">ТЕСТ</span>}
            </>
          )}
        </span>
        <button className="dp-x" onClick={onClose} title="Закрыть (`)">
          ✕
        </button>
      </header>
      <nav className="dp-tabs">
        {TABS.map(([id, name, icon]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Sprite id={icon} scale={2} />
            {name}
          </button>
        ))}
      </nav>
      <div className="dp-body">
        {tab === 'start' && (
          <StartTab dev={dev} catalog={catalog} cfg={cfg} setCfg={setCfg} useBuild={useBuild} setUseBuild={setUseBuild} build={build} setBuild={setBuild} fullCfg={fullCfg} say={say} goBuild={() => setTab('build')} />
        )}
        {tab === 'build' && <BuildTab dev={dev} catalog={catalog} build={build} setBuild={setBuild} char={cfg.char} say={say} apply={apply} setUseBuild={setUseBuild} />}
        {tab === 'fight' && <FightTab catalog={catalog} snap={snap} apply={apply} />}
        {tab === 'world' && <WorldTab catalog={catalog} snap={snap} apply={apply} />}
        {tab === 'office' && <OfficeTab dev={dev} snap={snap} say={say} />}
        {tab === 'settings' && <SettingsTab dev={dev} snap={snap} />}
      </div>
      <footer className="dp-foot">
        <button className="dp-btn gold big" onClick={launch}>
          ▶ ЗАПУСТИТЬ
        </button>
        <button className="dp-btn" onClick={() => dev.restart()} title="F9">
          ↻ ПОВТОРИТЬ
        </button>
      </footer>
      {note && <div className="dp-note">{note}</div>}
    </aside>
  );
}

// ── Shared parts ─────────────────────────────────────────────────────

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="dp-sec">
      <h3>
        <span>{title}</span>
        {right}
      </h3>
      {children}
    </section>
  );
}

function Tile({ on, onClick, title, children, className = '' }: { on?: boolean; onClick?: () => void; title?: string; children: ReactNode; className?: string }) {
  return (
    <button className={`dp-tile ${on ? 'on' : ''} ${className}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function Chip({ on, onClick, icon, children, title }: { on?: boolean; onClick: () => void; icon?: string; children: ReactNode; title?: string }) {
  return (
    <button className={`dp-chip ${on ? 'on' : ''}`} onClick={onClick} title={title}>
      {icon && <Sprite id={icon} scale={2} />}
      {children}
    </button>
  );
}

function Stepper({ icon, label, value, placeholder, step = 1, onChange }: { icon?: string; label: string; value?: number; placeholder?: string; step?: number; onChange: (v: number | undefined) => void }) {
  const base = value ?? (placeholder !== undefined && !Number.isNaN(Number(placeholder)) ? Number(placeholder) : 0);
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className="dp-step" title={label}>
      <span className="dp-step-label">
        {icon && <Sprite id={icon} scale={2} />}
        {label}
      </span>
      <span className="dp-step-ctl">
        <button onClick={() => onChange(round(base - step))}>−</button>
        <input type="number" step={step} value={value ?? ''} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(num(e.target.value))} />
        <button onClick={() => onChange(round(base + step))}>+</button>
      </span>
    </div>
  );
}

function Cheats({ value, onChange }: { value: DevState; onChange: (patch: Partial<DevState>) => void }) {
  return (
    <>
      <div className="dp-row wrap">
        <Chip on={!!value.god} onClick={() => onChange({ god: !value.god })} icon="ui_hp" title="Герой не получает урона">
          бессмертие
        </Chip>
        <Chip on={!!value.ink} onClick={() => onChange({ ink: !value.ink })} icon="ui_charge" title="Навык всегда заряжен">
          навык заряжен
        </Chip>
        <Chip on={!!value.freeze} onClick={() => onChange({ freeze: !value.freeze })} icon="ui_pause" title="Таймеры врагов стоят">
          враги стоят
        </Chip>
      </div>
      <div className="dp-grid three">
        <Stepper label="♥ врагов ×" value={value.enemyHp} placeholder="1" step={0.5} onChange={(v) => onChange({ enemyHp: v })} />
        <Stepper label="урон врагов ×" value={value.enemyDmg} placeholder="1" step={0.5} onChange={(v) => onChange({ enemyDmg: v })} />
        <Stepper label="урон героя ×" value={value.heroDmg} placeholder="1" step={0.5} onChange={(v) => onChange({ heroDmg: v })} />
      </div>
    </>
  );
}

function EnemyTile({ catalog, id, on, onClick }: { catalog: Catalog; id: string; on?: boolean; onClick: () => void }) {
  const e = catalog.enemies.find((x) => x.id === id);
  return (
    <Tile on={on} onClick={onClick} title={e ? `${e.name} · ${e.hp} ♥ · ${e.size}` : id} className="enemy">
      <span className="dp-pic box64">
        <Sprite id={id} box={{ w: 64, h: 64 }} max={2} />
      </span>
      <span className="dp-name">{e?.name ?? id}</span>
    </Tile>
  );
}

/** Three slots for the fight's enemies and the whole bestiary by act. */
function EnemyPicker({ catalog, act, kind, value, onChange }: { catalog: Catalog; act: number; kind: string; value: string[]; onChange: (v: string[]) => void }) {
  const a = catalog.acts[act];
  const groups = a ? (kind === 'boss' ? [[a.boss]] : kind === 'elite' ? a.elites : [...a.weak, ...a.strong]) : [];
  const add = (id: string) => onChange(value.length >= 3 ? [...value.slice(1), id] : [...value, id]);
  return (
    <>
      <div className="dp-row">
        {[0, 1, 2].map((k) => (
          <Tile key={k} className="slot" onClick={() => onChange(value.filter((_, i) => i !== k))} title={value[k] ? 'Убрать' : 'Пусто — выбери ниже'}>
            <span className="dp-pic box64">{value[k] ? <Sprite id={value[k]} box={{ w: 64, h: 64 }} max={2} /> : <span className="dp-empty">+</span>}</span>
            <span className="dp-name">{value[k] ? (catalog.enemies.find((e) => e.id === value[k])?.name ?? value[k]) : `враг ${k + 1}`}</span>
          </Tile>
        ))}
      </div>
      <div className="dp-hint">Пусто — обычная встреча отдела. Готовые встречи:</div>
      <div className="dp-row wrap">
        {groups.map((g) => (
          <Chip key={g.join('+')} onClick={() => onChange([...g])}>
            {g.map((id) => catalog.enemies.find((e) => e.id === id)?.name ?? id).join(' + ')}
          </Chip>
        ))}
      </div>
      {catalog.acts.map((ac) => (
        <div key={ac.index}>
          <div className="dp-sub">
            Отдел {ac.index + 1} · {ac.name}
          </div>
          <div className="dp-grid five">
            {catalog.enemies
              .filter((e) => e.acts[0] === ac.index)
              .map((e) => (
                <EnemyTile key={e.id} catalog={catalog} id={e.id} on={value.includes(e.id)} onClick={() => add(e.id)} />
              ))}
          </div>
        </div>
      ))}
      {catalog.enemies.some((e) => e.acts.length === 0) && (
        <>
          <div className="dp-sub">Вне отделов</div>
          <div className="dp-grid five">
            {catalog.enemies
              .filter((e) => e.acts.length === 0)
              .map((e) => (
                <EnemyTile key={e.id} catalog={catalog} id={e.id} on={value.includes(e.id)} onClick={() => add(e.id)} />
              ))}
          </div>
        </>
      )}
    </>
  );
}

function RoomPicker({ catalog, value, dark, onPick, onDark }: { catalog: Catalog; value: string; dark: boolean; onPick: (room: string) => void; onDark: (d: boolean) => void }) {
  return (
    <>
      <div className="dp-row wrap">
        <Chip on={!value} onClick={() => onPick('')} icon="ui_map">
          по отделу
        </Chip>
        <Chip on={dark} onClick={() => onDark(!dark)} icon="ui_pause">
          тёмная
        </Chip>
      </div>
      {catalog.rooms.map((g) => (
        <div key={g.biome}>
          <div className="dp-sub">{g.biome}</div>
          <div className="dp-grid three">
            {g.rooms.map((r) => (
              <Tile key={r} on={value === r} onClick={() => onPick(r)} className="room" title={r}>
                <RoomThumb room={r} dark={dark} width={150} />
                <span className="dp-name">{catalog.roomNames[r] ?? r}</span>
              </Tile>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function EventPicker({ catalog, value, onPick }: { catalog: Catalog; value: string; onPick: (id: string) => void }) {
  return (
    <div className="dp-grid three">
      <Tile on={!value} onClick={() => onPick('')} className="event">
        <span className="dp-pic ev">
          <Sprite id="map_event" scale={4} />
        </span>
        <span className="dp-name">Случайное</span>
      </Tile>
      {catalog.events.map((ev) => (
        <Tile key={ev.id} on={value === ev.id} onClick={() => onPick(ev.id)} className="event" title={ev.title}>
          <span className="dp-pic ev">
            <Sprite id={ev.art} scale={2} />
          </span>
          <span className="dp-name">{ev.title}</span>
        </Tile>
      ))}
    </div>
  );
}

function BuildStrip({ catalog, build }: { catalog: Catalog; build: DevBuild }) {
  const icon = (id: string) => catalog.relics.find((r) => r.id === id)?.icon ?? catalog.actives.find((r) => r.id === id)?.icon ?? '';
  return (
    <span className="dp-strip">
      {build.deck.slice(0, 18).map((c, k) => (
        <Sprite key={k} id={`card_${c.id}`} scale={1} />
      ))}
      {build.deck.length > 18 && <span className="dp-hint">+{build.deck.length - 18}</span>}
      <span className="dp-sep" />
      {build.relics.map((r) => (
        <Sprite key={r} id={icon(r)} scale={1} />
      ))}
      {build.active && <Sprite id={icon(build.active)} scale={1} />}
    </span>
  );
}

// ── Start ────────────────────────────────────────────────────────────

function StartTab(props: {
  dev: DevApi;
  catalog: Catalog;
  cfg: DevStart;
  setCfg: (c: DevStart) => void;
  useBuild: boolean;
  setUseBuild: (b: boolean) => void;
  build: DevBuild;
  setBuild: (b: DevBuild) => void;
  fullCfg: () => DevStart;
  say: (s: string) => void;
  goBuild: () => void;
}) {
  const { dev, catalog, cfg, setCfg, useBuild, setUseBuild, build, fullCfg, say, goBuild } = props;
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState(() => dev.presets());
  const set = (patch: Partial<DevStart>) => setCfg({ ...cfg, ...patch });
  const fightish = cfg.place === 'fight' || cfg.place === 'elite' || cfg.place === 'boss';
  const placeIcon = (p: DevPlace) => catalog.places.find((x) => x.id === p)?.icon ?? 'map_fight';

  return (
    <>
      <Section title="Кто идёт в смену">
        <div className="dp-grid three">
          {catalog.chars.map((c) => (
            <Tile key={c.id} on={cfg.char === c.id} onClick={() => set({ char: c.id as CharId })} className="hero" title={c.desc}>
              <span className="dp-pic hero">
                <Sprite id={`hero_${c.id}`} frame="idle0" scale={2} crop={46} />
              </span>
              <span className="dp-name">{c.name}</span>
              <span className="dp-cap">
                ♥ {c.maxHp} · ¤ {c.coins}
              </span>
            </Tile>
          ))}
        </div>
      </Section>
      <Section title="Отдел">
        <div className="dp-grid two">
          {catalog.acts.map((a) => (
            <Tile key={a.index} on={cfg.act === a.index} onClick={() => set({ act: a.index, enemies: [] })} className="act">
              <RoomThumb room={a.room} width={236} />
              <span className="dp-name">
                {a.index + 1} · {a.name}
              </span>
            </Tile>
          ))}
        </div>
      </Section>
      <Section title="Куда">
        <div className="dp-grid three">
          {catalog.places.map((p) => (
            <Tile key={p.id} on={cfg.place === p.id} onClick={() => set({ place: p.id })} className="place">
              <Sprite id={p.icon} scale={3} />
              <span className="dp-name">{p.name}</span>
            </Tile>
          ))}
        </div>
      </Section>
      {fightish && (
        <Section title="Враги">
          <EnemyPicker catalog={catalog} act={cfg.act} kind={cfg.place} value={cfg.enemies ?? []} onChange={(enemies) => set({ enemies })} />
        </Section>
      )}
      {cfg.place === 'event' && (
        <Section title="Событие">
          <EventPicker catalog={catalog} value={cfg.event ?? ''} onPick={(id) => set({ event: id || undefined })} />
        </Section>
      )}
      <Section title="Комната">
        <RoomPicker catalog={catalog} value={cfg.room ?? ''} dark={cfg.dark ?? true} onPick={(room) => set({ room: room || undefined })} onDark={(dark) => set({ dark })} />
      </Section>
      <Section
        title="Сборка"
        right={
          <button className="dp-link" onClick={goBuild}>
            редактор →
          </button>
        }
      >
        <div className="dp-grid two">
          <Tile on={!useBuild} onClick={() => setUseBuild(false)} className="build">
            <span className="dp-name">Стартовая</span>
            <BuildStrip catalog={catalog} build={dev.starter(cfg.char)} />
          </Tile>
          <Tile on={useBuild} onClick={() => setUseBuild(true)} className="build">
            <span className="dp-name">
              Своя · {build.deck.length} фишек, {build.relics.length} предм.
            </span>
            <BuildStrip catalog={catalog} build={build} />
          </Tile>
        </div>
      </Section>
      <Section title="Герой на старте">
        <div className="dp-grid three">
          <Stepper icon="ui_hp" label="здоровье" value={cfg.hero?.hp} placeholder="полное" onChange={(v) => set({ hero: { ...cfg.hero, hp: v } })} />
          <Stepper icon="ui_hp" label="максимум" value={cfg.hero?.maxHp} placeholder="обычный" step={5} onChange={(v) => set({ hero: { ...cfg.hero, maxHp: v } })} />
          <Stepper icon="ui_coin" label="монеты" value={cfg.hero?.coins} placeholder="обычно" step={25} onChange={(v) => set({ hero: { ...cfg.hero, coins: v } })} />
        </div>
      </Section>
      <Section title="Читы">
        <Cheats value={cfg.cheats ?? {}} onChange={(patch) => set({ cheats: { ...cfg.cheats, ...patch } })} />
      </Section>
      <Section title="Сид">
        <div className="dp-row">
          <input className="dp-input" type="number" placeholder="случайный" aria-label="Сид" value={cfg.seed ?? ''} onChange={(e) => set({ seed: num(e.target.value) })} />
          <button className="dp-btn" onClick={() => set({ seed: Math.floor(Math.random() * 2 ** 31) })}>
            🎲
          </button>
          <button className="dp-btn" onClick={() => set({ seed: undefined })}>
            случайный
          </button>
          <button
            className="dp-btn"
            onClick={() => {
              const url = dev.link(fullCfg());
              void navigator.clipboard?.writeText(url).then(
                () => say('Ссылка на этот тест скопирована'),
                () => say(url),
              );
            }}
          >
            ссылка
          </button>
        </div>
      </Section>
      <Section title="Пресеты">
        <div className="dp-row">
          <input className="dp-input grow" value={presetName} placeholder="название, например «босс-2 с бомбами»" aria-label="Название пресета" onChange={(e) => setPresetName(e.target.value)} />
          <button
            className="dp-btn gold"
            disabled={!presetName.trim()}
            onClick={() => {
              dev.savePreset(presetName.trim(), fullCfg());
              setPresets(dev.presets());
              say('Пресет сохранён');
            }}
          >
            сохранить
          </button>
        </div>
        {Object.keys(presets).length === 0 && <div className="dp-hint">Пресетов пока нет.</div>}
        <div className="dp-grid two">
          {Object.entries(presets).map(([name, p]) => (
            <div key={name} className="dp-card">
              <span className="dp-pic mini">
                <Sprite id={`hero_${p.char}`} frame="idle0" scale={1} crop={40} />
                <Sprite id={placeIcon(p.place)} scale={2} />
              </span>
              <span className="dp-name grow">{name}</span>
              <span className="dp-row tight">
                <button className="dp-btn gold" onClick={() => dev.start(p)} title="Запустить">
                  ▶
                </button>
                <button
                  className="dp-btn"
                  title="В форму"
                  onClick={() => {
                    props.setCfg(p);
                    setUseBuild(!!p.build);
                    if (p.build) props.setBuild(p.build);
                    say('Пресет в форме');
                  }}
                >
                  ✎
                </button>
                <button
                  className="dp-btn"
                  title="Удалить"
                  onClick={() => {
                    dev.deletePreset(name);
                    setPresets(dev.presets());
                  }}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

// ── Build ────────────────────────────────────────────────────────────

function BuildTab(props: {
  dev: DevApi;
  catalog: Catalog;
  build: DevBuild;
  setBuild: (b: DevBuild) => void;
  char: CharId;
  say: (s: string) => void;
  apply: (op: DevOp, done?: string) => void;
  setUseBuild: (b: boolean) => void;
}) {
  const { dev, catalog, build, setBuild, char, say, apply, setUseBuild } = props;
  const [fam, setFam] = useState('blade');
  const [pool, setPool] = useState('');
  const [find, setFind] = useState('');
  const [slot, setSlot] = useState(0);
  const [json, setJson] = useState('');
  const edit = (b: Partial<DevBuild>) => {
    setBuild({ ...build, ...b });
    setUseBuild(true);
  };
  const setCard = (k: number, patch: Partial<DevCard>) => edit({ deck: build.deck.map((c, i) => (i === k ? { ...c, ...patch } : c)) });
  const nextFinish = (f?: Finish) => {
    const k = FINISHES.findIndex(([id]) => id === (f ?? ''));
    const n = FINISHES[(k + 1) % FINISHES.length][0];
    return n || undefined;
  };
  const relics = catalog.relics.filter((r) => (!pool || r.pool === pool) && (!find || r.name.toLowerCase().includes(find.toLowerCase())));
  const pockets = [...build.pockets, null, null, null].slice(0, 3);

  return (
    <>
      <div className="dp-row wrap">
        <button className="dp-btn gold" onClick={() => apply({ op: 'build', ...build }, 'Сборка у героя')}>
          применить к забегу
        </button>
        <button className="dp-btn" onClick={() => edit(dev.starter(char))}>
          стартовая
        </button>
        <button
          className="dp-btn"
          onClick={() => {
            const b = dev.build();
            if (b) {
              edit(b);
              say('Взято из забега');
            } else say('Забега нет');
          }}
        >
          из забега
        </button>
      </div>
      <Section title={`Колода · ${build.deck.length}`} right={<span className="dp-hint">▲ улучшить · ✦ отделка · ✕ убрать</span>}>
        <div className="dp-grid five cards">
          {build.deck.map((c, k) => (
            <div key={k} className="dp-cardcell">
              <CardBadge card={c} scale={2} />
              <span className="dp-row tight">
                <button className={`dp-mini ${c.up ? 'on' : ''}`} onClick={() => setCard(k, { up: !c.up })} title="Улучшить">
                  ▲
                </button>
                <button className={`dp-mini ${c.finish ? 'on' : ''}`} onClick={() => setCard(k, { finish: nextFinish(c.finish) })} title={FINISHES.find(([id]) => id === (c.finish ?? ''))?.[1]}>
                  ✦
                </button>
                <button className="dp-mini" onClick={() => edit({ deck: build.deck.filter((_, i) => i !== k) })} title="Убрать">
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Добавить фишку" right={<span className="dp-hint">клик — +1</span>}>
        <div className="dp-row wrap">
          {FAMS.map(([id, name, icon]) => (
            <Chip key={id} on={fam === id} onClick={() => setFam(id)} icon={icon}>
              {name}
            </Chip>
          ))}
        </div>
        <div className="dp-grid five">
          {catalog.cards
            .filter((c) => c.fam === fam)
            .map((c) => (
              <Tile key={c.id} onClick={() => edit({ deck: [...build.deck, { id: c.id }] })} title={`${c.name} (${c.rarity}): ${c.text}`} className="card">
                <Sprite id={`card_${c.id}`} scale={2} />
                <span className="dp-name">{c.name}</span>
              </Tile>
            ))}
        </div>
      </Section>
      <Section title="Навык">
        <div className="dp-grid four">
          <Tile on={!build.active} onClick={() => edit({ active: null })} className="item">
            <span className="dp-empty">—</span>
            <span className="dp-name">нет</span>
          </Tile>
          {catalog.actives.map((a) => (
            <Tile key={a.id} on={build.active === a.id} onClick={() => edit({ active: a.id })} title={`${a.name}: ${a.desc}`} className="item">
              <Sprite id={a.icon} scale={2} />
              <span className="dp-name">{a.name}</span>
              <span className="dp-cap">{a.charge} чернил</span>
            </Tile>
          ))}
        </div>
      </Section>
      <Section title="Карманы" right={<span className="dp-hint">выбери карман, потом вещь</span>}>
        <div className="dp-row">
          {pockets.map((p, k) => (
            <Tile key={k} on={slot === k} onClick={() => setSlot(k)} className="slot" title={`Карман ${k + 1}`}>
              <span className="dp-pic box48">{p ? <Sprite id={catalog.pockets.find((x) => x.id === p)?.icon ?? ''} scale={2} /> : <span className="dp-empty">{k + 1}</span>}</span>
              <span className="dp-name">{p ? (catalog.pockets.find((x) => x.id === p)?.name ?? p) : 'пусто'}</span>
            </Tile>
          ))}
        </div>
        <div className="dp-grid five">
          <Tile
            onClick={() => {
              const next = [...pockets];
              next[slot] = null;
              edit({ pockets: next });
            }}
            className="item"
          >
            <span className="dp-empty">✕</span>
            <span className="dp-name">пусто</span>
          </Tile>
          {catalog.pockets.map((p) => (
            <Tile
              key={p.id}
              onClick={() => {
                const next = [...pockets];
                next[slot] = p.id;
                edit({ pockets: next });
              }}
              title={p.desc}
              className="item"
            >
              <Sprite id={p.icon} scale={2} />
              <span className="dp-name">{p.name}</span>
            </Tile>
          ))}
        </div>
      </Section>
      <Section
        title={`Предметы · ${build.relics.length}`}
        right={
          build.relics.length > 0 && (
            <button className="dp-link" onClick={() => edit({ relics: [] })}>
              снять все
            </button>
          )
        }
      >
        <div className="dp-row wrap">
          {POOLS.map(([id, name]) => (
            <Chip key={id} on={pool === id} onClick={() => setPool(id)}>
              {name}
            </Chip>
          ))}
          <input className="dp-input" value={find} placeholder="поиск" aria-label="Поиск предмета" onChange={(e) => setFind(e.target.value)} />
        </div>
        <div className="dp-grid five">
          {relics.map((r) => {
            const on = build.relics.includes(r.id);
            return (
              <Tile key={r.id} on={on} onClick={() => edit({ relics: on ? build.relics.filter((x) => x !== r.id) : [...build.relics, r.id] })} title={`${r.name}: ${r.desc}`} className="item">
                <Sprite id={r.icon} scale={2} />
                <span className="dp-name">{r.name}</span>
              </Tile>
            );
          })}
        </div>
      </Section>
      <details className="dp-details">
        <summary>Экспорт / импорт сборки</summary>
        <div className="dp-row">
          <button className="dp-btn" onClick={() => setJson(JSON.stringify(build))}>
            показать
          </button>
          <button
            className="dp-btn"
            onClick={() => {
              try {
                edit(JSON.parse(json) as DevBuild);
                say('Сборка загружена');
              } catch {
                say('Это не JSON сборки');
              }
            }}
          >
            загрузить
          </button>
        </div>
        <textarea className="dp-input" value={json} aria-label="JSON сборки" onChange={(e) => setJson(e.target.value)} rows={4} />
      </details>
    </>
  );
}

// ── Fight (the live run) ─────────────────────────────────────────────

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span className="dp-bar">
      <span style={{ width: `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`, background: color }} />
    </span>
  );
}

function FightTab({ catalog, snap, apply }: { catalog: Catalog; snap: Snapshot; apply: (op: DevOp, done?: string) => void }) {
  const run = snap.run;
  const [hero, setHero] = useState<{ hp?: number; maxHp?: number; coins?: number; charge?: number; armor?: number }>({});
  const [foes, setFoes] = useState<string[]>([]);
  const [kind, setKind] = useState<'fight' | 'elite' | 'boss'>('fight');
  const [event, setEvent] = useState('');
  if (!run) return <div className="dp-empty-tab">Смены нет. Запусти её на вкладке «Старт».</div>;
  const name = (id: string) => catalog.enemies.find((e) => e.id === id)?.name ?? id;
  return (
    <>
      {!run.custom && <div className="dp-warn">Это обычная смена: любая правка сделает её тестовой, в статистику она не пойдёт.</div>}
      <Section title="Герой">
        <div className="dp-herocard">
          <span className="dp-pic hero">
            <Sprite id={`hero_${run.char}`} frame="idle0" scale={2} crop={46} />
          </span>
          <span className="dp-col grow">
            <span className="dp-stat">
              <Sprite id="ui_hp" scale={2} /> {run.hp}/{run.maxHp}
            </span>
            <Bar value={run.hp} max={run.maxHp} color="#df3f44" />
            <span className="dp-stat">
              <Sprite id="ui_charge" scale={2} /> {run.charge}/{run.cost}
            </span>
            <Bar value={run.charge} max={run.cost} color="#a26ae6" />
            <span className="dp-row tight">
              <span className="dp-stat">
                <Sprite id="ui_armor" scale={2} /> {run.armor}
              </span>
              <span className="dp-stat">
                <Sprite id="ui_coin" scale={2} /> {run.coins}
              </span>
            </span>
          </span>
        </div>
        <div className="dp-grid three">
          <Stepper icon="ui_hp" label="здоровье" value={hero.hp} placeholder={String(run.hp)} onChange={(v) => setHero({ ...hero, hp: v })} />
          <Stepper icon="ui_hp" label="максимум" value={hero.maxHp} placeholder={String(run.maxHp)} step={5} onChange={(v) => setHero({ ...hero, maxHp: v })} />
          <Stepper icon="ui_coin" label="монеты" value={hero.coins} placeholder={String(run.coins)} step={25} onChange={(v) => setHero({ ...hero, coins: v })} />
          <Stepper icon="ui_charge" label="чернила" value={hero.charge} placeholder={String(run.charge)} onChange={(v) => setHero({ ...hero, charge: v })} />
          <Stepper icon="ui_armor" label="броня" value={hero.armor} placeholder={String(run.armor)} step={5} onChange={(v) => setHero({ ...hero, armor: v })} />
        </div>
        <div className="dp-row wrap">
          <button className="dp-btn gold" onClick={() => apply({ op: 'hero', ...hero })}>
            применить
          </button>
          <button className="dp-btn" onClick={() => apply({ op: 'hero', hp: run.maxHp }, 'Вылечен')}>
            вылечить
          </button>
          <button className="dp-btn" onClick={() => apply({ op: 'hero', coins: run.coins + 100 })}>
            +100 ¤
          </button>
          <button className="dp-btn" onClick={() => apply({ op: 'hero', charge: run.cost })}>
            полные чернила
          </button>
        </div>
      </Section>
      <Section title="Читы · сразу">
        <Cheats value={run.dev} onChange={(patch) => apply({ op: 'set', dev: patch })} />
      </Section>
      <Section title="Этот бой">
        {run.enemies.length > 0 ? (
          <div className="dp-row wrap">
            {run.enemies.map((e, k) => (
              <div key={k} className="dp-foe">
                <span className="dp-pic box64">
                  <Sprite id={e.def} box={{ w: 64, h: 64 }} max={2} dim={e.hp <= 0} />
                </span>
                <span className="dp-name">{name(e.def)}</span>
                <Bar value={e.hp} max={e.maxHp} color="#df3f44" />
                <span className="dp-cap">
                  {e.hp}/{e.maxHp}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="dp-hint">Сейчас не бой.</div>
        )}
        <div className="dp-row wrap">
          <button className="dp-btn gold" onClick={() => apply({ op: 'win' }, 'Победа')} disabled={run.phase !== 'combat'}>
            победить
          </button>
          <button className="dp-btn red" onClick={() => apply({ op: 'lose' }, 'Поражение')}>
            проиграть
          </button>
          <button className="dp-btn" onClick={() => apply({ op: 'enter', kind: 'fight', enemies: run.enemies.map((e) => e.def) }, 'Бой заново')} disabled={!run.enemies.length}>
            этот бой заново
          </button>
        </div>
      </Section>
      <Section title="Новый бой">
        <div className="dp-row wrap">
          {(['fight', 'elite', 'boss'] as const).map((k) => (
            <Chip key={k} on={kind === k} onClick={() => setKind(k)} icon={KIND_ICON[k]}>
              {k === 'fight' ? 'обычный' : k === 'elite' ? 'начальство' : 'босс'}
            </Chip>
          ))}
          <button className="dp-btn gold" onClick={() => apply({ op: 'enter', kind, enemies: foes }, 'В бой')}>
            ▶ в бой
          </button>
        </div>
        <EnemyPicker catalog={catalog} act={run.act} kind={kind} value={foes} onChange={setFoes} />
      </Section>
      <Section title="Место">
        <div className="dp-grid three">
          {(
            [
              ['shop', 'Касса', 'map_shop'],
              ['rest', 'Кулер', 'map_rest'],
              ['treasure', 'Сейф', 'map_treasure'],
              ['bossReward', 'Награда босса', 'ui_mult'],
              ['map', 'Карта', 'ui_map'],
            ] as const
          ).map(([k, label, icon]) => (
            <Tile key={k} onClick={() => apply({ op: 'enter', kind: k }, label)} className="place">
              <Sprite id={icon} scale={3} />
              <span className="dp-name">{label}</span>
            </Tile>
          ))}
        </div>
        <div className="dp-sub">Событие</div>
        <EventPicker
          catalog={catalog}
          value={event}
          onPick={(id) => {
            setEvent(id);
            apply({ op: 'enter', kind: 'event', event: id || undefined }, 'Событие');
          }}
        />
      </Section>
    </>
  );
}

// ── World: acts, rooms, the map ──────────────────────────────────────

function WorldTab({ catalog, snap, apply }: { catalog: Catalog; snap: Snapshot; apply: (op: DevOp, done?: string) => void }) {
  const run = snap.run;
  const [dark, setDark] = useState(run?.dev.dark ?? true);
  if (!run) return <div className="dp-empty-tab">Смены нет. Запусти её на вкладке «Старт».</div>;
  const rows = new Map<number, typeof run.map>();
  for (const n of run.map) rows.set(n.row, [...(rows.get(n.row) ?? []), n]);
  return (
    <>
      <Section title="Отдел · клик — перейти">
        <div className="dp-grid two">
          {catalog.acts.map((a) => (
            <Tile key={a.index} on={run.act === a.index} onClick={() => apply({ op: 'act', act: a.index }, `Отдел ${a.index + 1}`)} className="act">
              <RoomThumb room={a.room} width={236} />
              <span className="dp-name">
                {a.index + 1} · {a.name}
              </span>
            </Tile>
          ))}
        </div>
      </Section>
      <Section
        title="План эвакуации"
        right={
          <Chip on={!!run.dev.anywhere} onClick={() => apply({ op: 'set', dev: { anywhere: !run.dev.anywhere } })}>
            ходить куда угодно
          </Chip>
        }
      >
        <div className="dp-map">
          {[...rows.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([r, nodes]) => (
              <div key={r} className="dp-map-row">
                <span className="dp-cap">{r + 1}</span>
                {nodes
                  .sort((a, b) => a.col - b.col)
                  .map((n) => (
                    <button key={n.id} className={`dp-node ${run.node === n.id ? 'here' : ''}`} onClick={() => apply({ op: 'travel', node: n.id })} title={`${n.kind} · узел ${n.id}`}>
                      <Sprite id={KIND_ICON[n.kind] ?? 'map_fight'} frame={n.visited && run.node !== n.id ? 'done' : 'idle0'} scale={2} />
                    </button>
                  ))}
              </div>
            ))}
        </div>
      </Section>
      <Section title="Комната · клик — сменить">
        <RoomPicker
          catalog={catalog}
          value={run.dev.room ?? ''}
          dark={dark}
          onDark={setDark}
          onPick={(room) => apply({ op: 'set', dev: { room: room || undefined, dark } }, room ? 'Комната сменена' : 'Комната по отделу')}
        />
      </Section>
    </>
  );
}

// ── Office and profile ───────────────────────────────────────────────

function OfficeTab({ dev, snap, say }: { dev: DevApi; snap: Snapshot; say: (s: string) => void }) {
  const p = snap.profile;
  return (
    <>
      <Section title="Куда">
        <div className="dp-grid three">
          <Tile onClick={() => dev.go('title')} className="place">
            <Sprite id="logo" box={{ w: 120, h: 40 }} />
            <span className="dp-name">Титул</span>
          </Tile>
          <Tile onClick={() => dev.go('hub')} className="place">
            <RoomThumb room="hub" dark={false} width={130} />
            <span className="dp-name">Офис</span>
          </Tile>
          <Tile onClick={() => dev.go('wake')} className="place">
            <span className="dp-pic mini">
              <Sprite id="os_chair" scale={1} />
              <Sprite id="hero_intern" frame="wake" scale={1} />
            </span>
            <span className="dp-name">Проснуться за столом</span>
          </Tile>
          <Tile onClick={() => dev.go('intro')} className="place">
            <Sprite id="kipa" frame="form2" box={{ w: 60, h: 48 }} />
            <span className="dp-name">Вступление</span>
          </Tile>
          <Tile onClick={() => dev.go('continue')} className="place">
            <Sprite id="ui_deck" scale={3} />
            <span className="dp-name">Сохранённая смена</span>
          </Tile>
        </div>
      </Section>
      <Section title="Странности офиса">
        <div className="dp-grid two">
          <Tile onClick={() => dev.office('hush')} className="place" title={snap.mode === 'hub' ? '' : 'Только в офисе'}>
            <Sprite id="npc_sil_sit_a" frame="sit0" scale={1} />
            <span className="dp-name">Все замирают</span>
          </Tile>
          <Tile onClick={() => dev.office('phone')} className="place" title={snap.mode === 'hub' ? '' : 'Только в офисе'}>
            <Sprite id="os_desk" frame="ring0" box={{ w: 100, h: 40 }} />
            <span className="dp-name">Звонит телефон</span>
          </Tile>
        </div>
      </Section>
      <Section title="Профиль">
        <div className="dp-grid three">
          <Stepper icon="ui_shard" label="осколки" value={p.shards} step={5} onChange={(v) => dev.profile({ shards: v ?? 0 })} />
          <Stepper icon="ui_hp" label="смертей" value={p.deaths} onChange={(v) => dev.profile({ deaths: v ?? 0 })} />
        </div>
        <div className="dp-row wrap">
          <Chip on={p.introDone} onClick={() => dev.profile({ introDone: !p.introDone })}>
            вступление просмотрено
          </Chip>
          <button
            className="dp-btn"
            onClick={() => {
              dev.profile({ unlockAll: true });
              say('Открыто всё');
            }}
          >
            открыть всё
          </button>
          <button
            className="dp-btn"
            onClick={() => {
              dev.profile({ lockAll: true });
              say('Закрыто');
            }}
          >
            закрыть всё
          </button>
        </div>
      </Section>
      <Section title="Побеждённые боссы · меняют офис">
        <div className="dp-grid three">
          {BOSSES.map(([id, what]) => (
            <Tile key={id} on={p.bosses.includes(id)} onClick={() => dev.profile({ boss: { id, on: !p.bosses.includes(id) } })} className="enemy">
              <span className="dp-pic box64">
                <Sprite id={id} box={{ w: 64, h: 64 }} max={2} />
              </span>
              <span className="dp-cap">{what}</span>
            </Tile>
          ))}
        </div>
        <div className="dp-hint">Офис перечитывает профиль при входе — нажми «Офис».</div>
      </Section>
      <Section title="Опасно">
        <button
          className="dp-btn red"
          onClick={() => {
            if (window.confirm('Сбросить профиль: осколки, открытия, историю смен?')) {
              dev.profile({ reset: true });
              say('Профиль сброшен');
            }
          }}
        >
          сбросить профиль
        </button>
      </Section>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────

function SettingsTab({ dev, snap }: { dev: DevApi; snap: Snapshot }) {
  return (
    <>
      <Section title="Скорость анимаций">
        <div className="dp-row wrap">
          {[0.5, 1, 1.5, 2, 3, 4].map((s) => (
            <Chip key={s} on={snap.speed === s} onClick={() => dev.settings({ speed: s })}>
              ×{s}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Поведение">
        <div className="dp-row wrap">
          <Chip on={snap.auto} onClick={() => dev.settings({ auto: !snap.auto })} icon="map_fight">
            бот играет сам
          </Chip>
          <Chip on={!snap.muted} onClick={() => dev.settings({ muted: !snap.muted })}>
            звук
          </Chip>
          <Chip on={dev.showPerf} onClick={() => dev.settings({ perf: !dev.showPerf })}>
            мс на кадр · {snap.perf}
          </Chip>
          <button className="dp-btn" onClick={() => dev.lightLab()}>
            лаборатория света
          </button>
        </div>
      </Section>
      <Section title="Клавиши">
        <div className="dp-keys">
          {[
            ['` Ё', 'эта панель'],
            ['F9', 'повторить тест'],
            ['F2', 'свет'],
            ['F', 'полный экран'],
            ['M', 'карта'],
            ['D', 'колода'],
            ['Q', 'навык'],
            ['1–3', 'карманы'],
            ['Esc', 'пауза'],
          ].map(([k, v]) => (
            <span key={k} className="dp-key">
              <kbd>{k}</kbd>
              {v}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Адреса">
        <div className="dp-hint">?dev — с панелью · ?hub — офис · ?intro — вступление · ?seed=N — смена с сидом · «ссылка» на вкладке «Старт» — сразу в тест.</div>
      </Section>
    </>
  );
}
