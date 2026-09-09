import { VISUAL_STYLE } from './visual-style';
import {
  biomeAt,
  TOTAL_ROOMS,
  tideDamage,
  move,
  endTurn,
  castSkill,
  bindingPreview,
  consumePotion,
  chooseReward,
  rerollTreasure,
  canRerollTreasure,
  routeMap,
  enterRoom,
  buy,
  leaveRoom,
  rest,
  eventChoice,
  pauseTrial,
  nextRooms,
  validMoves,
  intent,
  FAMILIES,
  equipmentBonus,
  equipmentForRun,
  offerForRun,
  previewMove,
  restOptions,
  type State,
  type Result,
  type Family,
} from './engine';

const actions = [
  'shift',
  'cast',
  'end_turn',
  'potion',
  'select_target',
  'choose_reward',
  'reroll_treasure',
  'enter_room',
  'buy',
  'leave_shop',
  'rest',
  'event',
  'pause_trial',
];
export const actionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: { type: 'string', enum: actions },
    axis: { type: 'string', enum: ['row', 'col'] },
    line: { type: 'integer', minimum: 0, maximum: 5 },
    amount: { type: 'integer', minimum: -5, maximum: 5 },
    id: { type: ['string', 'null'] },
    slot: { type: 'integer', minimum: 0, maximum: 1 },
    index: { type: 'integer', minimum: 0, maximum: 35 },
    secondIndex: { type: 'integer', minimum: 0, maximum: 35 },
    family: { type: 'string', enum: FAMILIES },
    target: { type: 'integer' },
    paused: { type: 'boolean' },
  },
};
const fields: Record<string, string[]> = {
  shift: ['axis', 'line', 'amount'],
  cast: ['id', 'index', 'family', 'secondIndex'],
  end_turn: [],
  potion: [],
  select_target: ['target'],
  choose_reward: ['id', 'slot'],
  reroll_treasure: [],
  enter_room: ['id'],
  buy: ['id', 'slot'],
  leave_shop: [],
  rest: ['id'],
  event: ['id'],
  pause_trial: ['paused'],
};
export function gameAction(s: State, input: unknown): Result {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Ожидается объект действия.');
  const p = input as Record<string, unknown>;
  if (typeof p.action !== 'string' || !actions.includes(p.action))
    throw Error('Неизвестное действие.');
  if (
    Object.keys(p).some(
      (k) => k !== 'action' && !fields[p.action as string].includes(k),
    )
  )
    throw Error('Лишние параметры действия.');
  const integer = (name: string, min: number, max: number) => {
    const n = p[name];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max)
      throw Error(`Некорректный ${name}.`);
    return n;
  };
  const id = () => {
    if (typeof p.id !== 'string' || !p.id)
      throw Error('Нужен id из текущего состояния.');
    return p.id;
  };
  const slot = p.slot === undefined ? undefined : integer('slot', 0, 1);
  const need = (phase: string) => {
    if (s.phase !== phase) throw Error(`Действие доступно только в ${phase}.`);
  };
  switch (p.action) {
    case 'shift': {
      if (p.axis !== 'row' && p.axis !== 'col')
        throw Error('Ось: row или col.');
      const amount = integer('amount', -5, 5);
      if (!amount) throw Error('Сдвиг не может быть нулевым.');
      return move(s, p.axis, integer('line', 0, 5), amount);
    }
    case 'cast': {
      const index = p.index === undefined ? 0 : integer('index', 0, 35);
      const family = p.family ?? 'blade';
      if (!FAMILIES.includes(family as Family))
        throw Error('Неизвестное семейство.');
      return castSkill(
        s,
        id(),
        index,
        family as Family,
        p.secondIndex === undefined ? undefined : integer('secondIndex', 0, 35),
      );
    }
    case 'end_turn':
      need('battle');
      return endTurn(s);
    case 'potion':
      return consumePotion(s);
    case 'select_target': {
      need('battle');
      const target = integer('target', 0, Number.MAX_SAFE_INTEGER);
      if (!s.enemies.some((e) => e.id === target && e.hp > 0))
        throw Error('Цель недоступна.');
      return { state: { ...s, target }, frames: [] };
    }
    case 'reroll_treasure':
      return rerollTreasure(s);
    case 'choose_reward':
      if (p.id !== null) id();
      return chooseReward(s, p.id as string | null, slot);
    case 'enter_room':
      return enterRoom(s, id());
    case 'buy':
      need('shop');
      return buy(s, id(), slot);
    case 'leave_shop':
      need('shop');
      return leaveRoom(s);
    case 'rest':
      need('rest');
      return rest(s, id());
    case 'event':
      need('event');
      return eventChoice(s, id());
    case 'pause_trial':
      need('trial');
      if (typeof p.paused !== 'boolean')
        throw Error('Нужен paused: true или false.');
      return pauseTrial(s, p.paused);
    default:
      throw Error('Неизвестное действие.');
  }
}
export function gameSnapshot(s: State, busy: boolean, hidden = false) {
  return {
    phase: s.phase,
    rulesVersion:
      s.rulesVersion === 4
        ? 'v0.2-stage3'
        : s.rulesVersion === 3
          ? 'v0.2-stage2'
          : s.rulesVersion === 2
            ? 'v0.2'
            : 'classic',
    hero: s.hero ?? 'wanderer',
    challenge: s.challenge ?? null,
    difficulty: s.difficulty ?? 0,
    redaction: s.redaction ?? null,
    echo: s.echo ?? null,
    bindingPreview: s.relics.includes('binding') ? bindingPreview(s) : null,
    seal: s.seal ?? null,
    rewardSource: s.rewardSource ?? null,
    canRerollTreasure: canRerollTreasure(s),
    map: routeMap(s),
    weapon: equipmentForRun(s, s.equipment.weapon),
    runeReady: s.flags.includes('turn:rune-armed'),
    restOptions: s.phase === 'rest' ? restOptions(s) : [],
    seed: s.seed >>> 0,
    room: s.room,
    totalRooms: TOTAL_ROOMS,
    biome: biomeAt(s.room),
    tide: s.tide ? { ...s.tide, damage: tideDamage(s) } : null,
    round: s.round,
    busy,
    hp: s.hp,
    maxHp: s.maxHp,
    block: s.block,
    energy: s.energy,
    focus: s.focus,
    gold: s.gold,
    heroPoison: s.heroPoison,
    moved: s.moved,
    cast: s.cast,
    consumed: s.consumed,
    target: s.target,
    enemies: s.enemies.map((e) => ({ ...e, intent: intent(s, e) })),
    board: s.trial?.paused || hidden ? null : s.board,
    skills: [
      ...s.skills,
      ...((s.rulesVersion ?? 0) >= 4 && s.relics.includes('binding')
        ? ['binding']
        : []),
    ],
    potions: s.potions,
    relics: s.relics,
    equipment: s.equipment,
    equipmentBonuses: {
      bladeDamage: equipmentBonus(s, 'weapon'),
      shieldBlock: equipmentBonus(s, 'clothing'),
      health: equipmentBonus(s, 'helmet'),
      focusCapacity: equipmentBonus(s, 'trousers'),
    },
    modifiers: s.modifiers,
    offers: s.offers.map((o) => offerForRun(s, o)),
    routes: s.phase === 'map' ? nextRooms(s) : [],
    trial: s.trial,
    validMoves:
      !busy &&
      !hidden &&
      !s.moved &&
      ['battle', 'trial'].includes(s.phase) &&
      !s.trial?.paused
        ? validMoves(s.board).map(({ axis, line, amount }) => ({
            axis,
            line,
            amount,
            firstWave: previewMove(s, axis, line, amount),
          }))
        : [],
  };
}
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerGameTools(
  read: () => Record<string, unknown>,
  act: (input: unknown) => Promise<unknown>,
) {
  const context = (document as Document & { modelContext?: Context })
    .modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const list: Tool[] = [
    {
      name: 'read_game',
      title: 'Прочитать состояние игры',
      description:
        'Read the current visible run, board, enemy intentions, available routes and rewards. Board is hidden while a timed trial is paused. Coordinates are zero based.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).length
        )
          throw Error('Нужен пустой объект.');
        return { ...read(), visualStyle: VISUAL_STYLE.id };
      },
    },
    {
      name: 'perform_game_action',
      title: 'Выполнить действие в игре',
      description:
        'Execute one action in the current local game and update the visible interface. Read read_game first. shift needs axis/line/amount; cast needs equipped skill id (or edit), optionally index/family; Double Edit requires two distinct index/secondIndex cells and one family; select_target needs enemy target; reroll_treasure costs 20 gold once per treasure; choose_reward needs offer id or null to skip (normal fight: +8 gold, seal: decline and heal), and slot 0/1 when replacing; enter_room/buy/rest/event need id; rest id is heal or a current restOptions id (including sharpen in v0.2); event id is relic or supplies; in room 17 use repair (30 gold, reduces tides by 2) or supplies; pause_trial needs paused. end_turn, potion and leave_shop take no other parameters. Does not start or reset runs.',
      inputSchema: actionSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: act,
    },
  ];
  for (const tool of list) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch((e) => console.warn('Game tools unavailable', e));
    } catch (e) {
      console.warn('Game tools unavailable', e);
    }
  }
  return () => lifecycle.abort();
}
