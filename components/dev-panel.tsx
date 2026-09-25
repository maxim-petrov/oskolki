'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CharId, DevOp, DevState, Finish } from '@/game/types';
import type { DevApi, DevBuild, DevCard, DevPlace, DevStart } from '@/render/dev';

/**
 * Dev panel over the game (` or Ё opens it, F9 repeats the last test setup): start a test run with
 * any hero, build, act, place, enemies and room; edit the live run; cheats and knobs; the office and
 * the profile; presets and links. All of it goes through render/dev.ts; test runs never count.
 */

type Catalog = ReturnType<DevApi['catalog']>;
type Snapshot = ReturnType<DevApi['snapshot']>;
type Tab = 'start' | 'build' | 'fight' | 'world' | 'office' | 'settings';

const TABS: [Tab, string][] = [
  ['start', 'Старт'],
  ['build', 'Сборка'],
  ['fight', 'Бой'],
  ['world', 'Мир'],
  ['office', 'Офис'],
  ['settings', 'Настройки'],
];

const FAM_NAME: Record<string, string> = { blade: 'удар', shield: 'защита', ink: 'чернила', coin: 'бухгалтерия', status: 'волокита' };
const FINISH_NAME: Record<string, string> = { sharp: 'заточка', gild: 'позолота', seal: 'печать', copy: 'копия', laminate: 'ламинат' };
const KIND_NAME: Record<string, string> = { fight: 'бой', elite: 'начальство', event: 'событие', shop: 'касса', rest: 'кулер', treasure: 'сейф', boss: 'босс' };
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
const BOSSES: [string, string][] = [
  ['supervisor', 'Надзирательница (пустеет стол соседа)'],
  ['tide', 'Хранитель прилива (лифт открыт)'],
  ['mirror', 'Кривое зеркало (пропуск в дирекцию)'],
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
    window.setTimeout(() => setNote((n) => (n === s ? '' : n)), 2500);
  };
  const apply = (op: DevOp, done = 'Готово') => {
    const err = dev.apply(op);
    say(err ?? done);
  };
  const fullCfg = (): DevStart => ({ ...cfg, build: useBuild ? build : undefined });
  const run = snap.run;

  return (
    <aside className="dev-panel" aria-label="Dev-панель">
      <div className="dev-head">
        <b>DEV</b>
        <span className="dev-status">
          {snap.mode}
          {run ? ` · ${PHASE_NAME[run.phase] ?? run.phase} · отдел ${run.act + 1} · ${run.hp}/${run.maxHp} ♥ · ${run.coins} ¤${run.custom ? ' · тест' : ''}` : ''}
        </span>
        <button className="dev-x" onClick={onClose} title="Закрыть (`)">
          ×
        </button>
      </div>
      <div className="dev-tabs">
        {TABS.map(([id, name]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      <div className="dev-body">
        {tab === 'start' && (
          <StartTab dev={dev} catalog={catalog} cfg={cfg} setCfg={setCfg} useBuild={useBuild} setUseBuild={setUseBuild} build={build} setBuild={setBuild} fullCfg={fullCfg} say={say} />
        )}
        {tab === 'build' && <BuildTab dev={dev} catalog={catalog} build={build} setBuild={setBuild} char={cfg.char} say={say} apply={apply} setUseBuild={setUseBuild} />}
        {tab === 'fight' && <FightTab catalog={catalog} snap={snap} apply={apply} />}
        {tab === 'world' && <WorldTab catalog={catalog} snap={snap} apply={apply} />}
        {tab === 'office' && <OfficeTab dev={dev} snap={snap} say={say} />}
        {tab === 'settings' && <SettingsTab dev={dev} snap={snap} />}
      </div>
      {note && <div className="dev-note">{note}</div>}
    </aside>
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
}) {
  const { dev, catalog, cfg, setCfg, useBuild, setUseBuild, build, fullCfg, say } = props;
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState(() => dev.presets());
  const set = (patch: Partial<DevStart>) => setCfg({ ...cfg, ...patch });
  const cheat = (patch: Partial<DevState>) => set({ cheats: { ...cfg.cheats, ...patch } });
  const fightish = cfg.place === 'fight' || cfg.place === 'elite' || cfg.place === 'boss';
  const enemies = cfg.enemies ?? [];
  const setEnemy = (k: number, id: string) => {
    const next = [...enemies];
    next[k] = id;
    set({ enemies: next.filter((e, i) => e || i < k).slice(0, 3) });
  };
  const act = catalog.acts[cfg.act];

  return (
    <>
      <Row label="Герой">
        <select value={cfg.char} onChange={(e) => set({ char: e.target.value as CharId })}>
          {catalog.chars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Сид">
        <input type="number" placeholder="случайный" value={cfg.seed ?? ''} onChange={(e) => set({ seed: num(e.target.value) })} />
        <button onClick={() => set({ seed: Math.floor(Math.random() * 2 ** 31) })}>🎲</button>
        <button onClick={() => set({ seed: undefined })}>×</button>
      </Row>
      <Row label="Отдел">
        <select value={cfg.act} onChange={(e) => set({ act: Number(e.target.value), enemies: [] })}>
          {catalog.acts.map((a) => (
            <option key={a.index} value={a.index}>
              {a.index + 1}. {a.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Куда">
        <select value={cfg.place} onChange={(e) => set({ place: e.target.value as DevPlace })}>
          {catalog.places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
      {fightish && (
        <>
          <Row label="Враги">
            <span className="dev-hint">пусто — обычная встреча отдела</span>
          </Row>
          {[0, 1, 2].map((k) => (
            <Row key={k} label={`  ${k + 1}`}>
              <EnemySelect catalog={catalog} value={enemies[k] ?? ''} onChange={(id) => setEnemy(k, id)} />
            </Row>
          ))}
          {act && (
            <div className="dev-chips">
              {[...(cfg.place === 'boss' ? [[act.boss]] : cfg.place === 'elite' ? act.elites : [...act.weak, ...act.strong])].map((g) => (
                <button key={g.join('+')} onClick={() => set({ enemies: [...g] })}>
                  {g.map((id) => catalog.enemies.find((e) => e.id === id)?.name ?? id).join(' + ')}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {cfg.place === 'event' && (
        <Row label="Событие">
          <select value={cfg.event ?? ''} onChange={(e) => set({ event: e.target.value || undefined })}>
            <option value="">случайное</option>
            {catalog.events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </Row>
      )}
      <Row label="Комната">
        <RoomSelect catalog={catalog} value={cfg.room ?? ''} onChange={(room) => set({ room: room || undefined })} />
        <label className="dev-check">
          <input type="checkbox" checked={cfg.dark ?? true} onChange={(e) => set({ dark: e.target.checked })} /> тёмная
        </label>
      </Row>
      <Row label="Сборка">
        <label className="dev-check">
          <input type="radio" checked={!useBuild} onChange={() => setUseBuild(false)} /> стартовая
        </label>
        <label className="dev-check">
          <input type="radio" checked={useBuild} onChange={() => setUseBuild(true)} /> из вкладки ({build.deck.length} фишек, {build.relics.length} предм.)
        </label>
      </Row>
      <Row label="Герой">
        <input type="number" placeholder="♥" title="Здоровье" value={cfg.hero?.hp ?? ''} onChange={(e) => set({ hero: { ...cfg.hero, hp: num(e.target.value) } })} />
        <input type="number" placeholder="макс ♥" title="Максимум здоровья" value={cfg.hero?.maxHp ?? ''} onChange={(e) => set({ hero: { ...cfg.hero, maxHp: num(e.target.value) } })} />
        <input type="number" placeholder="¤" title="Монеты" value={cfg.hero?.coins ?? ''} onChange={(e) => set({ hero: { ...cfg.hero, coins: num(e.target.value) } })} />
      </Row>
      <Cheats value={cfg.cheats ?? {}} onChange={cheat} />
      <div className="dev-actions">
        <button className="primary" onClick={() => say(`Запущено, сид ${dev.start(fullCfg())}`)}>
          Запустить
        </button>
        <button onClick={() => dev.restart()} title="F9">
          Повторить последний
        </button>
        <button
          onClick={() => {
            const url = dev.link(fullCfg());
            void navigator.clipboard?.writeText(url).then(
              () => say('Ссылка скопирована'),
              () => say(url),
            );
          }}
        >
          Ссылка
        </button>
      </div>
      <h4>Пресеты</h4>
      <Row label="Имя">
        <input value={presetName} placeholder="например, босс-2 с бомбами" onChange={(e) => setPresetName(e.target.value)} />
        <button
          disabled={!presetName.trim()}
          onClick={() => {
            dev.savePreset(presetName.trim(), fullCfg());
            setPresets(dev.presets());
            say('Сохранено');
          }}
        >
          Сохранить
        </button>
      </Row>
      {Object.keys(presets).length === 0 && <div className="dev-hint">Пресетов пока нет.</div>}
      {Object.entries(presets).map(([name, p]) => (
        <div key={name} className="dev-list-row">
          <span className="grow">{name}</span>
          <button onClick={() => dev.start(p)}>▶</button>
          <button
            onClick={() => {
              props.setCfg(p);
              props.setUseBuild(!!p.build);
              if (p.build) props.setBuild(p.build);
              say('Загружено в форму');
            }}
          >
            в форму
          </button>
          <button
            onClick={() => {
              dev.deletePreset(name);
              setPresets(dev.presets());
            }}
          >
            ×
          </button>
        </div>
      ))}
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
  const [add, setAdd] = useState(catalog.cards[0]?.id ?? '');
  const [filter, setFilter] = useState('');
  const [json, setJson] = useState('');
  const edit = (b: Partial<DevBuild>) => {
    setBuild({ ...build, ...b });
    setUseBuild(true);
  };
  const setCard = (k: number, patch: Partial<DevCard>) => edit({ deck: build.deck.map((c, i) => (i === k ? { ...c, ...patch } : c)) });
  const cardName = (id: string) => catalog.cards.find((c) => c.id === id)?.name ?? id;
  const relics = catalog.relics.filter((r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase()) || r.id.includes(filter));

  return (
    <>
      <div className="dev-actions">
        <button onClick={() => edit(dev.starter(char))}>Стартовая</button>
        <button
          onClick={() => {
            const b = dev.build();
            if (b) {
              edit(b);
              say('Взято из забега');
            } else say('Нет забега');
          }}
        >
          Из забега
        </button>
        <button className="primary" onClick={() => apply({ op: 'build', ...build }, 'Сборка применена к забегу')}>
          Применить к забегу
        </button>
      </div>
      <h4>Колода · {build.deck.length} фишек</h4>
      <Row label="Добавить">
        <select value={add} onChange={(e) => setAdd(e.target.value)}>
          {Object.keys(FAM_NAME).map((fam) => (
            <optgroup key={fam} label={FAM_NAME[fam]}>
              {catalog.cards
                .filter((c) => c.fam === fam)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.rarity}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <button onClick={() => edit({ deck: [...build.deck, { id: add, up: false }] })}>+1</button>
        <button onClick={() => edit({ deck: [...build.deck, { id: add }, { id: add }, { id: add }] })}>+3</button>
      </Row>
      <div className="dev-hint">{catalog.cards.find((c) => c.id === add)?.text}</div>
      {build.deck.map((c, k) => (
        <div key={k} className="dev-list-row">
          <span className={`fam fam-${catalog.cards.find((x) => x.id === c.id)?.fam ?? 'status'}`} />
          <span className="grow">{cardName(c.id)}</span>
          <label className="dev-check" title="Улучшена">
            <input type="checkbox" checked={!!c.up} onChange={(e) => setCard(k, { up: e.target.checked })} />+
          </label>
          <select value={c.finish ?? ''} onChange={(e) => setCard(k, { finish: (e.target.value || undefined) as Finish | undefined })}>
            <option value="">—</option>
            {catalog.finishes.map((f) => (
              <option key={f} value={f}>
                {FINISH_NAME[f] ?? f}
              </option>
            ))}
          </select>
          <button onClick={() => edit({ deck: build.deck.filter((_, i) => i !== k) })}>×</button>
        </div>
      ))}
      <h4>Навык и карманы</h4>
      <Row label="Навык">
        <select value={build.active ?? ''} onChange={(e) => edit({ active: e.target.value || null })}>
          <option value="">нет</option>
          {catalog.actives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.charge} чернил
            </option>
          ))}
        </select>
      </Row>
      {[0, 1, 2].map((k) => (
        <Row key={k} label={`Карман ${k + 1}`}>
          <select
            value={build.pockets[k] ?? ''}
            onChange={(e) => {
              const p = [...build.pockets];
              while (p.length < 3) p.push(null);
              p[k] = e.target.value || null;
              edit({ pockets: p });
            }}
          >
            <option value="">пусто</option>
            {catalog.pockets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
      ))}
      <h4>Предметы · {build.relics.length}</h4>
      <Row label="Поиск">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="название" />
        <button onClick={() => edit({ relics: [] })}>Снять все</button>
      </Row>
      <div className="dev-grid">
        {relics.map((r) => (
          <label key={r.id} className="dev-check" title={r.desc}>
            <input
              type="checkbox"
              checked={build.relics.includes(r.id)}
              onChange={(e) => edit({ relics: e.target.checked ? [...build.relics, r.id] : build.relics.filter((x) => x !== r.id) })}
            />
            {r.name} <small>{r.pool}</small>
          </label>
        ))}
      </div>
      <h4>Экспорт / импорт</h4>
      <div className="dev-actions">
        <button onClick={() => setJson(JSON.stringify(build))}>Показать JSON</button>
        <button
          onClick={() => {
            try {
              edit(JSON.parse(json) as DevBuild);
              say('Сборка загружена');
            } catch {
              say('Не JSON');
            }
          }}
        >
          Загрузить из поля
        </button>
      </div>
      <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={4} placeholder='{"deck":[{"id":"fist"}],"relics":[],"active":null,"pockets":[]}' />
    </>
  );
}

// ── Fight (the live run) ─────────────────────────────────────────────

function FightTab({ catalog, snap, apply }: { catalog: Catalog; snap: Snapshot; apply: (op: DevOp, done?: string) => void }) {
  const run = snap.run;
  const [hero, setHero] = useState<{ hp?: number; maxHp?: number; coins?: number; charge?: number; armor?: number }>({});
  const [foes, setFoes] = useState<string[]>([]);
  const [kind, setKind] = useState<'fight' | 'elite' | 'boss'>('fight');
  const [event, setEvent] = useState('');
  if (!run) return <div className="dev-hint">Забега нет — запусти его на вкладке «Старт».</div>;
  const name = (id: string) => catalog.enemies.find((e) => e.id === id)?.name ?? id;
  return (
    <>
      {!run.custom && <div className="dev-warn">Это обычный забег: любая правка сделает его тестовым, он не пойдёт в статистику.</div>}
      <h4>Читы (сразу)</h4>
      <Cheats value={run.dev} onChange={(patch) => apply({ op: 'set', dev: patch })} />
      <h4>Герой</h4>
      <Row label="♥ / макс">
        <input type="number" placeholder={String(run.hp)} value={hero.hp ?? ''} onChange={(e) => setHero({ ...hero, hp: num(e.target.value) })} />
        <input type="number" placeholder={String(run.maxHp)} value={hero.maxHp ?? ''} onChange={(e) => setHero({ ...hero, maxHp: num(e.target.value) })} />
      </Row>
      <Row label="¤ / чернила / броня">
        <input type="number" placeholder={String(run.coins)} value={hero.coins ?? ''} onChange={(e) => setHero({ ...hero, coins: num(e.target.value) })} />
        <input type="number" placeholder={`${run.charge}/${run.cost}`} value={hero.charge ?? ''} onChange={(e) => setHero({ ...hero, charge: num(e.target.value) })} />
        <input type="number" placeholder={String(run.armor)} value={hero.armor ?? ''} onChange={(e) => setHero({ ...hero, armor: num(e.target.value) })} />
      </Row>
      <div className="dev-actions">
        <button className="primary" onClick={() => apply({ op: 'hero', ...hero })}>
          Применить
        </button>
        <button onClick={() => apply({ op: 'hero', hp: run.maxHp }, 'Вылечен')}>Вылечить</button>
        <button onClick={() => apply({ op: 'hero', coins: run.coins + 100 })}>+100 ¤</button>
        <button onClick={() => apply({ op: 'hero', charge: run.cost })}>Полные чернила</button>
      </div>
      <h4>Бой</h4>
      {run.enemies.length > 0 && (
        <div className="dev-hint">
          {run.enemies.map((e, k) => (
            <span key={k}>
              {name(e.def)} {e.hp}/{e.maxHp}
              {k < run.enemies.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>
      )}
      <div className="dev-actions">
        <button onClick={() => apply({ op: 'win' }, 'Победа')} disabled={run.phase !== 'combat'}>
          Победить
        </button>
        <button onClick={() => apply({ op: 'lose' }, 'Поражение')}>Проиграть</button>
        <button onClick={() => apply({ op: 'enter', kind: 'fight', enemies: run.enemies.map((e) => e.def) }, 'Бой заново')} disabled={!run.enemies.length}>
          Этот бой заново
        </button>
      </div>
      <Row label="Новый бой">
        <select value={kind} onChange={(e) => setKind(e.target.value as 'fight' | 'elite' | 'boss')}>
          <option value="fight">обычный</option>
          <option value="elite">начальство</option>
          <option value="boss">босс</option>
        </select>
        <button className="primary" onClick={() => apply({ op: 'enter', kind, enemies: foes.filter(Boolean) }, 'Новый бой')}>
          В бой
        </button>
      </Row>
      {[0, 1, 2].map((k) => (
        <Row key={k} label={`  враг ${k + 1}`}>
          <EnemySelect
            catalog={catalog}
            value={foes[k] ?? ''}
            onChange={(id) => {
              const next = [...foes];
              next[k] = id;
              setFoes(next);
            }}
          />
        </Row>
      ))}
      <h4>Место</h4>
      <div className="dev-actions">
        <button onClick={() => apply({ op: 'enter', kind: 'shop' })}>Касса</button>
        <button onClick={() => apply({ op: 'enter', kind: 'rest' })}>Кулер</button>
        <button onClick={() => apply({ op: 'enter', kind: 'treasure' })}>Сейф</button>
        <button onClick={() => apply({ op: 'enter', kind: 'bossReward' })}>Награда босса</button>
        <button onClick={() => apply({ op: 'enter', kind: 'map' })}>Карта</button>
      </div>
      <Row label="Событие">
        <select value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="">случайное</option>
          {catalog.events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
        <button onClick={() => apply({ op: 'enter', kind: 'event', event: event || undefined })}>Открыть</button>
      </Row>
    </>
  );
}

// ── World: acts, the map, rooms ──────────────────────────────────────

function WorldTab({ catalog, snap, apply }: { catalog: Catalog; snap: Snapshot; apply: (op: DevOp, done?: string) => void }) {
  const run = snap.run;
  const [act, setAct] = useState(run?.act ?? 0);
  const [room, setRoom] = useState(run?.dev.room ?? '');
  const [dark, setDark] = useState(run?.dev.dark ?? true);
  if (!run) return <div className="dev-hint">Забега нет — запусти его на вкладке «Старт».</div>;
  const rows = new Map<number, typeof run.map>();
  for (const n of run.map) rows.set(n.row, [...(rows.get(n.row) ?? []), n]);
  return (
    <>
      <Row label="Отдел">
        <select value={act} onChange={(e) => setAct(Number(e.target.value))}>
          {catalog.acts.map((a) => (
            <option key={a.index} value={a.index}>
              {a.index + 1}. {a.name}
            </option>
          ))}
        </select>
        <button className="primary" onClick={() => apply({ op: 'act', act }, `Отдел ${act + 1}`)}>
          Перейти
        </button>
      </Row>
      <Row label="Комната">
        <RoomSelect catalog={catalog} value={room} onChange={setRoom} />
        <label className="dev-check">
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> тёмная
        </label>
      </Row>
      <div className="dev-actions">
        <button className="primary" onClick={() => apply({ op: 'set', dev: { room: room || undefined, dark } }, room ? 'Комната сменена' : 'Комната по отделу')}>
          Сменить комнату
        </button>
        <button onClick={() => apply({ op: 'set', dev: { room: undefined } }, 'Комната по отделу')}>Авто</button>
      </div>
      <label className="dev-check">
        <input type="checkbox" checked={!!run.dev.anywhere} onChange={(e) => apply({ op: 'set', dev: { anywhere: e.target.checked } })} /> ходить по карте куда угодно
      </label>
      <h4>Карта отдела · узлы</h4>
      <div className="dev-map">
        {[...rows.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([r, nodes]) => (
            <div key={r} className="dev-map-row">
              <span className="dev-hint">{r + 1}</span>
              {nodes
                .sort((a, b) => a.col - b.col)
                .map((n) => (
                  <button key={n.id} className={`${n.visited ? 'visited' : ''} ${run.node === n.id ? 'here' : ''} k-${n.kind}`} onClick={() => apply({ op: 'travel', node: n.id }, KIND_NAME[n.kind] ?? n.kind)} title={`узел ${n.id}`}>
                    {KIND_NAME[n.kind] ?? n.kind}
                  </button>
                ))}
            </div>
          ))}
      </div>
    </>
  );
}

// ── Office and profile ───────────────────────────────────────────────

function OfficeTab({ dev, snap, say }: { dev: DevApi; snap: Snapshot; say: (s: string) => void }) {
  const p = snap.profile;
  const [shards, setShards] = useState<number | undefined>(undefined);
  return (
    <>
      <h4>Куда</h4>
      <div className="dev-actions">
        <button onClick={() => dev.go('title')}>Титул</button>
        <button onClick={() => dev.go('hub')}>Офис</button>
        <button onClick={() => dev.go('wake')}>Проснуться за столом</button>
        <button onClick={() => dev.go('intro')}>Вступление</button>
        <button onClick={() => dev.go('continue')}>Продолжить сохранённый</button>
      </div>
      <h4>Странности офиса</h4>
      <div className="dev-actions">
        <button onClick={() => dev.office('hush')} disabled={snap.mode !== 'hub'}>
          Все замирают
        </button>
        <button onClick={() => dev.office('phone')} disabled={snap.mode !== 'hub'}>
          Звонит телефон
        </button>
      </div>
      <h4>Профиль</h4>
      <Row label="Осколки">
        <input type="number" placeholder={String(p.shards)} value={shards ?? ''} onChange={(e) => setShards(num(e.target.value))} />
        <button
          onClick={() => {
            if (shards === undefined) return;
            dev.profile({ shards });
            say('Осколки заданы');
          }}
        >
          Задать
        </button>
        <button onClick={() => dev.profile({ shards: p.shards + 20 })}>+20</button>
      </Row>
      <div className="dev-actions">
        <button
          onClick={() => {
            dev.profile({ unlockAll: true });
            say('Открыто всё');
          }}
        >
          Открыть всё (герои, заявки)
        </button>
        <button
          onClick={() => {
            dev.profile({ lockAll: true });
            say('Закрыто');
          }}
        >
          Закрыть всё
        </button>
      </div>
      <label className="dev-check">
        <input type="checkbox" checked={p.introDone} onChange={(e) => dev.profile({ introDone: e.target.checked })} /> вступление просмотрено
      </label>
      <Row label="Смертей">
        <input type="number" value={p.deaths} onChange={(e) => dev.profile({ deaths: num(e.target.value) ?? 0 })} />
        <span className="dev-hint">после 1-й — записка на доске</span>
      </Row>
      <h4>Побеждённые боссы (меняют офис)</h4>
      {BOSSES.map(([id, label]) => (
        <label key={id} className="dev-check">
          <input type="checkbox" checked={p.bosses.includes(id)} onChange={(e) => dev.profile({ boss: { id, on: e.target.checked } })} /> {label}
        </label>
      ))}
      <div className="dev-hint">Офис перечитывает профиль при входе: нажми «Офис».</div>
      <div className="dev-actions">
        <button
          className="danger"
          onClick={() => {
            if (window.confirm('Сбросить профиль: осколки, открытия, историю смен?')) {
              dev.profile({ reset: true });
              say('Профиль сброшен');
            }
          }}
        >
          Сбросить профиль
        </button>
      </div>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────

function SettingsTab({ dev, snap }: { dev: DevApi; snap: Snapshot }) {
  return (
    <>
      <Row label="Скорость">
        {[0.5, 1, 1.5, 2, 3, 4].map((s) => (
          <button key={s} className={snap.speed === s ? 'on' : ''} onClick={() => dev.settings({ speed: s })}>
            ×{s}
          </button>
        ))}
      </Row>
      <label className="dev-check">
        <input type="checkbox" checked={snap.auto} onChange={(e) => dev.settings({ auto: e.target.checked })} /> бот играет сам
      </label>
      <label className="dev-check">
        <input type="checkbox" checked={!snap.muted} onChange={(e) => dev.settings({ muted: !e.target.checked })} /> звук
      </label>
      <label className="dev-check">
        <input type="checkbox" checked={dev.showPerf} onChange={(e) => dev.settings({ perf: e.target.checked })} /> мс на кадр в углу ({snap.perf} мс)
      </label>
      <div className="dev-actions">
        <button onClick={() => dev.lightLab()}>Лаборатория света (F2)</button>
      </div>
      <h4>Клавиши</h4>
      <div className="dev-hint">
        ` или Ё — эта панель · F9 — повторить последний тест · F2 — свет · F — полный экран · M — карта · D — колода · Q — навык · 1–3 — карманы · Esc — пауза
      </div>
      <h4>Ссылки</h4>
      <div className="dev-hint">
        ?dev — открыть с панелью · ?hub — офис · ?intro — вступление · ?seed=N — забег с сидом · «Ссылка» на вкладке «Старт» запускает сразу тест.
      </div>
    </>
  );
}

// ── Small parts ──────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dev-row">
      <span className="dev-label">{label}</span>
      <span className="dev-ctl">{children}</span>
    </div>
  );
}

function Cheats({ value, onChange }: { value: DevState; onChange: (patch: Partial<DevState>) => void }) {
  return (
    <>
      <div className="dev-grid">
        <label className="dev-check">
          <input type="checkbox" checked={!!value.god} onChange={(e) => onChange({ god: e.target.checked })} /> бессмертие
        </label>
        <label className="dev-check">
          <input type="checkbox" checked={!!value.ink} onChange={(e) => onChange({ ink: e.target.checked })} /> навык всегда заряжен
        </label>
        <label className="dev-check">
          <input type="checkbox" checked={!!value.freeze} onChange={(e) => onChange({ freeze: e.target.checked })} /> враги не ходят
        </label>
      </div>
      <Row label="Множители">
        <Knob title="Здоровье врагов (новых)" label="♥ врагов" value={value.enemyHp} onChange={(v) => onChange({ enemyHp: v })} />
        <Knob title="Урон врагов (новых)" label="урон врагов" value={value.enemyDmg} onChange={(v) => onChange({ enemyDmg: v })} />
        <Knob title="Урон героя" label="урон героя" value={value.heroDmg} onChange={(v) => onChange({ heroDmg: v })} />
      </Row>
    </>
  );
}

function Knob({ label, title, value, onChange }: { label: string; title: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="dev-knob" title={title}>
      <small>{label}</small>
      <input type="number" step="0.25" min="0" placeholder="×1" value={value ?? ''} onChange={(e) => onChange(num(e.target.value))} />
    </label>
  );
}

function EnemySelect({ catalog, value, onChange }: { catalog: Catalog; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {catalog.acts.map((a) => (
        <optgroup key={a.index} label={`Отдел ${a.index + 1}: ${a.name}`}>
          {catalog.enemies
            .filter((e) => e.acts[0] === a.index)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.size} · {e.hp}♥
              </option>
            ))}
        </optgroup>
      ))}
      <optgroup label="Прочие">
        {catalog.enemies
          .filter((e) => e.acts.length === 0)
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {e.size} · {e.hp}♥
            </option>
          ))}
      </optgroup>
    </select>
  );
}

function RoomSelect({ catalog, value, onChange }: { catalog: Catalog; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">по отделу</option>
      {catalog.rooms.map((g) => (
        <optgroup key={g.biome} label={g.biome}>
          {g.rooms.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
