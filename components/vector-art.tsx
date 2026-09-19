import type { ReactNode } from 'react';
import type { Pose } from '@/game/motion';
import type { IconName } from '@/game/icon-names';

export const INK = '#28323c';
export const TINT = {
  red: '#b34f60',
  blue: '#466dcc',
  gold: '#946b22',
  green: '#278376',
};
const icons: Record<IconName, ReactNode> = {
  blade: <path d="m10 22 12-16 3 3-12 16m-5-5 7 5m-5-1-4 5" />,
  shield: <path d="M16 4 26 8v9c0 6-10 12-10 12S6 23 6 17V8Z M16 10v12" />,
  spark: <path d="m18 3-12 16h9l-1 10 12-17h-9Z" />,
  focus: (
    <>
      <circle cx="16" cy="16" r="9" />
      <circle cx="16" cy="16" r="3" />
      <path d="M16 2v4m0 20v4M2 16h4m20 0h4" />
    </>
  ),
  venom: (
    <>
      <path d="M16 3S7 14 7 20a9 9 0 0 0 18 0C25 14 16 3 16 3Z" />
      <path d="m12 20 3 3 5-6" />
    </>
  ),
  bomb: (
    <>
      <circle cx="15" cy="20" r="9" />
      <path d="m17 11 1-5h5l2-3m0 8 3 2" />
    </>
  ),
  heart: <path d="M16 28 5 17C-2 8 9 0 16 9 23 0 34 8 27 17Z" />,
  coin: (
    <>
      <circle cx="16" cy="16" r="12" />
      <path d="M19 10h-5a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6h-5m3-15v18" />
    </>
  ),
  potion: (
    <>
      <path d="M12 3h8m-7 0v9L6 23q-2 6 5 6h10q7 0 5-6l-7-11V3M10 20h12" />
    </>
  ),
  relic: (
    <>
      <path d="m16 3 12 13-12 13L4 16Z M16 10l6 6-6 6-6-6Z" />
    </>
  ),
  crown: <path d="M5 25h22L29 9l-8 6-5-10-5 10-8-6Zm2-5h18" />,
  star: <path d="m16 3 4 8 9 2-6 7 1 9-8-4-8 4 1-9-6-7 9-2Z" />,
};
const iconColors: Partial<Record<IconName, string>> = {
  blade: TINT.red,
  heart: TINT.red,
  shield: TINT.blue,
  spark: TINT.gold,
  coin: TINT.gold,
  focus: TINT.green,
  venom: TINT.green,
};
export function VectorIcon({
  name,
  size = 30,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`palace-icon vector-icon ${className}`}
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      fill="none"
      stroke={iconColors[name] ?? INK}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  );
}
const weaponPaths: Record<string, string> = {
  'gear-ruler': 'M12 3h8v19h-8Z M12 8h4m-4 5h4m-4 5h4',
  'gear-cash-hammer': 'M5 5h22v10H5Z',
  'gear-cutter': 'M14 21V11l5-7v17Z',
  'gear-rusty-dagger': 'm16 3-5 17h10Z',
  'gear-cleaver': 'M13 5h13v17H13Z',
  'gear-axe': 'M16 7 27 4v15l-11-3Z',
  'gear-rune-sword': 'm16 2-5 7v12h10V9Z',
};
export const vectorWeaponId = (id: string | null) =>
  id && Object.hasOwn(weaponPaths, id) ? id : 'gear-cutter';
export function WeaponShape({
  id,
  mini = false,
}: {
  id: string | null;
  mini?: boolean;
}) {
  const key = vectorWeaponId(id);
  return (
    <g
      data-weapon-id={key}
      data-detail={mini ? 'mini' : 'full'}
      stroke={TINT.red}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="#f8e9ed"
    >
      <path d="M16 28V8" />
      <path d={weaponPaths[key]} />
      <path d="M12 22h9M16 23v6" />
      {!mini && (
        <g fill="none" strokeWidth="1">
          <path d="m14 25 4 1m-4 1 4 1" />
          {key === 'gear-rune-sword' ? (
            <path d="m16 8-2 4 2 4 2-4Z" />
          ) : (
            <path d="M18 10v7" />
          )}
        </g>
      )}
    </g>
  );
}
export function VectorWeapon({
  id,
  size = 48,
  mini = false,
}: {
  id: string | null;
  size?: number;
  mini?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={mini ? 'board-weapon-miniature' : 'equipment-icon'}
      aria-hidden="true"
    >
      <WeaponShape id={id} mini={mini} />
    </svg>
  );
}
const poses: Record<Pose, string> = {
  idle: '',
  windup: 'rotate(-9 50 94)',
  strike: 'translate(5 0) rotate(12 50 94)',
  guard: 'translate(0 4)',
  hurt: 'rotate(-12 50 94)',
  death: 'translate(0 55) scale(1 .4)',
};
export function VectorPerson({
  pose = 'idle',
  weaponId = null,
  unarmed = false,
  kind = 'wanderer',
  className = 'sprite-art palace-actor',
}: {
  pose?: Pose;
  weaponId?: string | null;
  unarmed?: boolean;
  kind?: string;
  className?: string;
}) {
  const accent =
    kind === 'warden'
      ? TINT.green
      : kind === 'vera'
        ? TINT.red
        : kind === 'lev'
          ? TINT.gold
          : kind === 'merchant'
            ? TINT.gold
            : TINT.blue;
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${className} vector-person pose-${pose}`}
      data-hero={kind}
      aria-hidden="true"
      fill="#fff"
      stroke={INK}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform={poses[pose]}>
        <path d="M40 66 37 94h12l2-23 4 23h12l-6-28" fill="#dae0e6" />
        <path d="M36 94h14m5 0h14" />
        <path
          d="m38 38-8 25 9 2 4-15-3 20h23l-2-20 7 12 8-5-14-19Z"
          fill={accent}
        />
        <path d="m44 38 7 8 6-8m-6 8v18" stroke="#fff" />
        <rect x="38" y="11" width="25" height="28" rx="10" fill="#f3f5f7" />
        <path
          d={
            kind === 'vera'
              ? 'M36 32V17q0-17 16-11 15-2 14 17v9L59 17 38 23'
              : 'M37 21V11l10-6 18 7-3 10-10-7Z'
          }
          fill={INK}
        />
        {kind === 'warden' && (
          <path d="M35 17q1-17 17-15 17 1 17 17Z" fill={accent} />
        )}
        <path d="M45 25v3m11-3v3m-8 5h5" />
        {kind === 'lev' && <path d="M40 25h9v6h-9Zm13 0h9v6h-9Zm-4 2h4" />}
        {kind === 'merchant' && (
          <>
            <path d="M34 17h36M39 16V5h23v11" fill={accent} />
            <path d="m51 30-8 4 8-1 8 1Z" fill={INK} />
            <rect x="62" y="61" width="23" height="27" rx="4" fill="#ebe1c9" />
            <path d="M69 61v-5h10v5" />
          </>
        )}
        {!unarmed && (
          <g
            className="held-weapon"
            transform="translate(71 59) rotate(20) scale(1.35) translate(-16 -28)"
          >
            <WeaponShape id={weaponId} />
          </g>
        )}
        <circle cx="71" cy="59" r="3" fill="#f3f5f7" />
      </g>
    </svg>
  );
}
// Each opponent has a different office-object silhouette, including legacy saves.
export const enemyShapes: Record<string, ReactNode> = {
  'paper-rat': (
    <>
      <path d="M20 82 29 57 69 52 85 77 71 87H25Z" />
      <path d="m29 58 1-22 19 18m11 0 17-20-1 26M21 81Q0 65 13 55M36 86l-4 7m32-7 4 7" />
    </>
  ),
  stapler: (
    <>
      <path d="m18 67 7-22 61 17-5 13Z" />
      <path d="M18 82h65v9H18ZM28 49v33m12-14 32 8" />
    </>
  ),
  'ink-slime': (
    <>
      <path d="M15 91q-8-17 9-20 4-30 20-15 22-40 31-5 30 9 13 40Z" />
      <path d="M32 77h5m22-8h5" />
    </>
  ),
  eraser: (
    <>
      <path d="m23 43 40-6 18 43-41 10-23-33Z" />
      <path d="m20 59 48-9m-40 25 46-9" />
    </>
  ),
  bell: (
    <>
      <path d="M22 82q12-9 12-28 0-27 32-16 9 4 8 19 0 16 8 25Z" />
      <path d="M42 88q9 13 17 0M50 33v-9" />
    </>
  ),
  moth: (
    <>
      <path d="M49 60Q3 13 15 78l33 12 37-12Q96 17 49 60Z" />
      <path d="M49 47v45m0-45-8-14m8 14 9-14M29 63l10 9m24-9-8 9" />
    </>
  ),
  librarian: (
    <>
      <path d="m30 42 41-3 8 51H21Z" />
      <circle cx="51" cy="27" r="16" />
      <path d="M34 23h14v8H34Zm20 0h14v8H54Zm-6 4h6M27 63l23 5 23-5v21l-23 5-23-5Z" />
    </>
  ),
  candle: (
    <>
      <path d="M37 45h27v45H37Zm-9 47h46" />
      <path d="M50 39Q29 21 53 7q-4 13 7 18 5 11-10 14Z" />
      <path d="M38 48v14q5 9 9 0V48" />
    </>
  ),
  safe: (
    <>
      <rect x="20" y="36" width="65" height="55" rx="5" />
      <rect x="29" y="45" width="47" height="37" rx="2" />
      <circle cx="52" cy="64" r="12" />
      <path d="M52 52v24m-12-12h24M25 91v5m52-5v5" />
    </>
  ),
  mirror: (
    <>
      <path d="M22 88V32q0-28 30-28t30 28v56Z" />
      <path d="M29 79V32q0-21 23-21t23 21v47ZM39 56l22-22m-13 30 16-16M22 91h60" />
    </>
  ),
  'reed-crab': (
    <>
      <path d="m29 60 35-3 16 25-27 11-32-9Z" />
      <path d="m23 70-12-8V49l-8-8m8 8 8-8m55 22 15-7V43l-8-7m8 7 8-7M27 87l-9 8m55-8 9 8" />
    </>
  ),
  'ink-eel': (
    <>
      <path d="M10 81Q35 40 52 67T90 53q12 50-35 37-17-14-45-9Z" />
      <path d="m77 59 5 2M19 81l-6 7" />
    </>
  ),
  leech: (
    <>
      <path d="M15 88q-10-33 12-46 20-7 19 17-8 24 26 12 34 24-20 25Z" />
      <ellipse cx="28" cy="54" rx="9" ry="12" />
      <path d="m21 54 14 0m-7-7v14" />
    </>
  ),
  'ink-scribe': (
    <>
      <path d="m30 42 40 1 10 49H19Z" />
      <path d="M34 35 43 9l18 2 10 24Z M25 58l28 3v26l-29-4Z M69 66l18-31m-15 14 10 2" />
    </>
  ),
  anchor: (
    <>
      <circle cx="50" cy="27" r="13" />
      <path d="M50 40v53M30 52h40M15 67q7 21 35 26 29-5 35-26M10 74l5-10 10 5m50 0 10-5 5 10" />
    </>
  ),
  'lantern-fish': (
    <>
      <path d="M19 72q21-31 54 0-23 35-54 0Zm54 0 18-15v32Z" />
      <path d="M39 56q-7-37 16-32v8" />
      <circle cx="55" cy="39" r="7" />
      <circle cx="31" cy="70" r="3" />
    </>
  ),
  censor: (
    <>
      <path d="M16 40h69v53H16Z M26 40V26h47v14M31 25l-8-14 18 6 9-13 12 13 16-6-9 14" />
      <path d="M25 50h52v16H25Z M28 78h44m-44 8h31" />
    </>
  ),
  'tide-keeper': (
    <>
      <path d="M12 93V46l17-11 12 15 11-30 13 30 15-13 10 13v43Z" />
      <path d="M18 76q15-12 31 0t33 0M44 18V5h16v13M29 59v7m43-7v7" />
    </>
  ),
  redactor: (
    <>
      <path d="M19 90 29 34h46l14 56Z M28 30l-7-19 21 8L53 3l13 16 18-8-9 19" />
      <path d="M27 43h52v16H27Z M34 77h34M50 65v24" />
    </>
  ),
  raider: (
    <>
      <rect x="25" y="36" width="52" height="54" rx="5" />
      <path d="M25 49h52m-52 18h52m-35-8h18m-18 19h18M22 90h58" />
    </>
  ),
  armored: (
    <>
      <path d="m20 36 31-15 31 15-4 47-27 11-27-11Z" />
      <path d="M51 22v71M29 45h44m-42 17h40" />
    </>
  ),
  cultist: (
    <>
      <path d="m14 92 36-80 37 80Z" />
      <path d="m39 44 11-14 11 14v18H39Z M31 82h40" />
    </>
  ),
  poisoner: (
    <>
      <path d="M39 16h24v28l17 32q9 17-10 17H30q-19 0-9-17l18-32Z" />
      <path d="M29 65h42M37 15h28M42 74l16 10m0-10L42 84" />
    </>
  ),
  rooter: (
    <>
      <path d="M31 64V28h39v36Z" />
      <path d="M38 63 17 91m30-28-5 30m15-30 4 30m5-30 20 28M39 41h23m-17 9h12" />
    </>
  ),
  boss: (
    <>
      <path d="M18 39h66v54H18Z M29 39V19h43v20M26 60h50M38 75h29" />
      <path d="m28 18 4-12 15 10 15-10 10 12" />
    </>
  ),
};
// Shared-board campaign silhouettes. All use the same simple vector outline.
Object.assign(enemyShapes, {
  'wet-catalog': (
    <>
      <path d="M22 24h57v63H22ZM31 37h39M31 46h28M31 56h36M31 66h18" />
      <path d="M15 88q9-6 18 0t18 0t18 0t18 0M60 8q-16 20 0 20t0-20Z" />
    </>
  ),
  'sluice-guard': (
    <>
      <path d="M24 86V33l26-16 27 16v53ZM33 45h36M33 57h36M33 69h36M50 33v50" />
      <circle cx="50" cy="21" r="10" />
      <path d="M45 21h10m-5-5v10" />
    </>
  ),
  'account-scribe': (
    <>
      <path d="M27 90V41h46v49ZM22 35h57L65 17H36Z" />
      <path d="M34 51h30m-30 10h30m-30 10h20M77 79l15-34M14 76l9-29" />
    </>
  ),
  collector: (
    <>
      <path d="M26 91V36l24-15 27 15v55Z" />
      <path d="M34 48h32v17H34ZM40 55h20M47 45v23M20 37H9v34h15M78 38h13v33H78" />
      <path d="M38 79h24" />
    </>
  ),
  'depth-keeper': (
    <>
      <path d="M17 92V42l17-9 16 13 16-13 18 9v50Z" />
      <path d="M50 42V17M36 17h28M40 17V8m20 9V8M24 74q13-10 27 0t27 0M29 54v9m43-9v9" />
      <circle cx="50" cy="58" r="5" />
    </>
  ),
  'coal-courier': (
    <>
      <path d="M26 90V43h49v47ZM21 41l11-20h39l10 20Z" />
      <path d="M34 57h13v13H34Zm20 0h13v13H54ZM41 78h20M34 28h34" />
      <path d="M12 88V59h12m53 0h12v29" />
    </>
  ),
  printer: (
    <>
      <path d="M17 49h69v37H17ZM29 49V20h45v29M29 75h45v19H29Z" />
      <path d="M37 30h27m-27 9h27M24 60h11M36 83h30" />
      <circle cx="74" cy="60" r="3" />
    </>
  ),
  'furnace-cashier': (
    <>
      <path d="M20 42h64v48H20ZM29 42V19h45v23M28 68h48v15H28Z" />
      <circle cx="51" cy="30" r="8" />
      <path d="M51 24v12m-9 17h19M34 77h7m7 0h7m7 0h7M42 59h19" />
    </>
  ),
  'hot-editor': (
    <>
      <path d="M23 43h55v47H23ZM32 43V27h36v16" />
      <path d="M48 25q-18-11 0-24-1 10 8 13 3 8-8 11ZM32 57h36M35 73l28 8m-28 0 28-8" />
    </>
  ),
  'press-boss': (
    <>
      <path d="M12 29h76v14H12ZM20 43v42h60V43M28 55h44v13H28ZM9 87h82v8H9Z" />
      <path d="M29 28V13h42v15M36 21h28M17 12v16m66-16v16M34 78h32" />
      <circle cx="50" cy="61" r="4" />
    </>
  ),
  auditor: (
    <>
      <path d="M24 90 32 43h39l9 47Z" />
      <circle cx="51" cy="27" r="16" />
      <circle cx="44" cy="26" r="6" />
      <circle cx="59" cy="26" r="6" />
      <path d="M50 26h3M27 62h49M41 71h24m-24 9h16M12 82l12-27" />
    </>
  ),
  'glass-adviser': (
    <>
      <path d="m28 34 23-23 24 23-7 55H35Z" />
      <path d="m28 34 23 17 24-17M51 11v78M35 68l16-17 17 17M17 89h68" />
    </>
  ),
  'shift-secretary': (
    <>
      <path d="M25 45h52v46H25Z" />
      <circle cx="51" cy="24" r="18" />
      <path d="M51 13v12l10 5M34 58h13v13H34Zm21 0h13v13H55ZM39 80h25M12 76l13-16m52 0 13 16" />
    </>
  ),
  deputy: (
    <>
      <path d="M21 91 28 40h47l7 51ZM33 35V12h37v23Z" />
      <path d="M39 25h6m13 0h6M42 42l9 15 11-15M51 57v28M27 68h18m14 0h18" />
    </>
  ),
  director: (
    <>
      <path d="M15 93V42h71v51ZM30 37V17h41v20Z" />
      <path d="m28 16-5-11 19 5 9-9 10 9 18-5-6 11M39 26h9m10 0h9M26 43l25 25 24-25M51 68v20M35 82h8m16 0h8" />
      <path d="M7 92h85M17 64h15m38 0h14" />
    </>
  ),
});
export function VectorEnemy({ kind, pose }: { kind: string; pose: Pose }) {
  const boss = [
    'censor',
    'tide-keeper',
    'redactor',
    'boss',
    'depth-keeper',
    'press-boss',
    'director',
  ].includes(kind);
  return (
    <svg
      viewBox="0 0 100 100"
      className={`sprite-art vector-enemy pose-${pose}`}
      aria-hidden="true"
      data-enemy-kind={kind}
      stroke={INK}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={boss ? '#eddce1' : '#e6eaf0'}
    >
      <g transform={poses[pose]}>{enemyShapes[kind] ?? enemyShapes.raider}</g>
    </svg>
  );
}
