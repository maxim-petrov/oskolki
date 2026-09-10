import './helpers/component-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
const office = await import('../game/office.ts');
const engine = await import('../game/engine.ts');
const { GameMenu, OfficeHub, OfficeSprite } =
  await import('../components/office-hub.tsx');
const { PalaceActorArt } = await import('../components/palace-actor-art.tsx');
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const noop = () => {};

test('a fresh profile starts at the desk; opening the menu does not create a combat save', () => {
  const o = office.readOffice(null, null);
  assert.deepEqual(o, office.emptyOffice());
  assert.equal(office.continueDestination(o, null), 'office');
  assert.equal(o.introduced, false);
  const html = render(GameMenu, {
    ready: true,
    resumable: false,
    inRun: false,
    onContinue: noop,
    onOffice: noop,
    onSettings: noop,
    onJournal: noop,
    onHelp: noop,
  });
  assert.match(html, /Приступить к работе/);
  assert.doesNotMatch(html, /Продолжить спуск/);
  for (const label of ['Настройки', 'Открытия и история', 'Как играть'])
    assert.ok(html.includes(label));
});

test('legacy and separately restored saves resume their exact run rather than replacing it', () => {
  for (const rules of [undefined, 2, 3, 4, 5]) {
    const run = engine.startRun(551, undefined, rules);
    const before = JSON.stringify(run);
    const memory = office.readOffice(null, run);
    assert.equal(office.continueDestination(memory, run), 'run');
    const previous = {
      ...office.emptyOffice(),
      runId: 'different',
      inRun: false,
    };
    assert.equal(
      office.continueDestination(office.readOffice(previous, run), run),
      'run',
    );
    assert.equal(JSON.stringify(run), before);
  }
});

test('only defeat wakes the hero, once per run, with memories and achievements intact', () => {
  const run = engine.startAdventure(
    883,
    engine.DEFAULT_BALANCE,
    engine.EMPTY_META,
  );
  let memory = {
    ...office.emptyOffice(),
    introduced: true,
    discoveredDoor: true,
    inRun: true,
    runId: run.runId,
    talked: ['vera'],
    position: { x: 810, y: 370 },
  };
  for (const phase of [
    'battle',
    'reward',
    'map',
    'shop',
    'rest',
    'event',
    'trial',
    'victory',
  ]) {
    assert.equal(office.wakeFromRun(memory, { ...run, phase }), memory);
  }
  const dead = { ...run, phase: 'defeat', hp: 0 };
  const snapshot = JSON.stringify(dead);
  const oldMeta = {
    ...engine.EMPTY_META,
    unlocked: ['three-edits'],
    wins: 2,
    best: 2,
    streak: 2,
  };
  const meta = engine.updateMeta(oldMeta, dead);
  memory = office.wakeFromRun(memory, dead);
  assert.equal(memory.awakenings, 1);
  assert.equal(memory.inRun, false);
  assert.equal(memory.discoveredDoor, true);
  assert.deepEqual(memory.talked, ['vera']);
  assert.deepEqual(memory.position, office.DESK_POSITION);
  assert.equal(office.continueDestination(memory, dead), 'office');
  assert.deepEqual(
    office.wakeFromRun(
      office.readOffice(JSON.parse(JSON.stringify(memory)), dead),
      dead,
    ),
    memory,
  );
  assert.deepEqual(engine.updateMeta(meta, dead), meta);
  assert.ok(meta.unlocked.includes('three-edits'));
  assert.equal(meta.wins, 2);
  assert.equal(JSON.stringify(dead), snapshot);
  assert.equal(
    office.wakeFromRun(memory, { ...dead, runId: 'second-loss' }).awakenings,
    2,
  );
});

test('bad office data never loses a valid combat save or permits off-floor coordinates', () => {
  const run = engine.startRun(778);
  for (const broken of [
    null,
    {},
    { ...office.emptyOffice(), awakenings: -1 },
    { ...office.emptyOffice(), position: { x: 1, y: 1 } },
    { ...office.emptyOffice(), talked: ['unknown'] },
    { ...office.emptyOffice(), wakeAcknowledged: {} },
  ]) {
    assert.equal(
      office.continueDestination(office.readOffice(broken, run), run),
      'run',
    );
    assert.ok(office.walkable(office.readOffice(broken, null).position));
  }
  const stale = { ...office.emptyOffice(), inRun: true, runId: 'lost' };
  assert.equal(
    office.continueDestination(office.readOffice(stale, null), null),
    'office',
  );
});

test('all desks, colleagues and the door are reachable without walking through furniture', () => {
  for (const from of office.OFFICE_TARGETS)
    for (const to of office.OFFICE_TARGETS) {
      let p = { ...from.point };
      for (const target of office.officeWaypoints(p, to.point)) {
        let ticks = 0;
        while (
          Math.hypot(target.x - p.x, target.y - p.y) > 0.01 &&
          ticks++ < 1000
        ) {
          const dx = target.x - p.x,
            dy = target.y - p.y,
            d = Math.hypot(dx, dy),
            step = Math.min(3, d);
          p = office.stepOffice(p, (dx / d) * step, (dy / d) * step);
          assert.ok(office.walkable(p));
        }
        assert.ok(ticks < 1000, `Stuck going from ${from.id} to ${to.id}`);
      }
      assert.equal(office.nearestTarget(p), to.id);
    }
  assert.equal(office.nearestTarget({ x: 80, y: 550 }), null);
  assert.deepEqual(office.stepOffice({ x: 65, y: 500 }, -5, 0), {
    x: 65,
    y: 500,
  });
});

test('dialogue reflects remembered losses and the discovered corridor without changing seed or stats', () => {
  const initial = office.emptyOffice();
  const later = { ...initial, awakenings: 2, discoveredDoor: true };
  assert.notDeepEqual(office.openingLines(initial), office.openingLines(later));
  for (const id of ['desk', 'vera', 'lev', 'door']) {
    for (const topic of [0, 1])
      assert.ok(
        office
          .officeDialogue(id, topic, later)
          .every((l) => l.speaker && l.text),
      );
    assert.notDeepEqual(
      office.officeDialogue(id, 0, initial),
      office.officeDialogue(id, 0, later),
    );
  }
  assert.match(
    office
      .officeDialogue('door', 0, initial)
      .map((l) => l.text)
      .join(' '),
    /Кабинета нет/,
  );
});

test('the office exposes walkable interactions and uses the original hero without combat weapon', () => {
  const html = render(OfficeHub, {
    office: { ...office.emptyOffice(), introduced: true },
    onChange: noop,
    onDepart: noop,
    onMenu: noop,
    blocked: false,
    lastRun: null,
  });
  for (const target of office.OFFICE_TARGETS)
    assert.ok(html.includes(`aria-label="${target.action}"`));
  assert.ok(html.includes('role="application"'));
  assert.ok(html.includes('actors-weaponless.png'));
  assert.doesNotMatch(html, /\/weapons\//);
  const battle = render(PalaceActorArt, {
    hero: true,
    pose: 'idle',
    weaponId: 'gear-axe',
  });
  assert.match(battle, /weapons\/gear-axe.png/);
});

test('office bitmaps load from the project and the top has four independently clipped rotation frames', () => {
  const art = JSON.parse(
    readFileSync(new URL('../game/office-art.json', import.meta.url)),
  );
  for (const [id, a] of Object.entries(art)) {
    assert.ok(
      readFileSync(new URL('../public' + a.src, import.meta.url)).length > 100,
    );
    if (id === 'background') continue;
    assert.ok(a.clip.startsWith('M'));
    assert.ok(a.crop[0] + a.crop[2] <= a.width);
    assert.ok(a.crop[1] + a.crop[3] <= a.height);
  }
  assert.equal(art.top.frames.length, 4);
  const html = render(OfficeSprite, { kind: 'top' });
  assert.equal((html.match(/class="top-frame top-frame-/g) ?? []).length, 4);
  const css = readFileSync(
    new URL('../app/office.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /office-top-cycle/);
});
