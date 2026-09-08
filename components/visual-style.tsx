'use client';
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  useId,
} from 'react';
import {
  Crown,
  Moon,
  Check,
  Gamepad2,
  Scissors,
  Swords,
  Heart,
  MoonStar,
  Flame,
  Skull,
  Droplet,
  BookOpen,
  Mountain,
  Joystick,
  Palette,
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  isVisualStyle,
  VISUAL_STYLES,
  type VisualStyle,
} from '@/game/visual-style';
const key = 'oskolki.visual-style.v1';
let memoryStyle: VisualStyle = 'crypt';
let temporaryStyle = false;
const listeners = new Set<() => void>();
export function readVisualStyle(): VisualStyle {
  if (temporaryStyle) return memoryStyle;
  try {
    const value = localStorage.getItem(key);
    return isVisualStyle(value) ? value : memoryStyle;
  } catch {
    return memoryStyle;
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}
export function selectVisualStyle(value: unknown) {
  if (!isVisualStyle(value))
    throw Error(
      `Выбери стиль: ${VISUAL_STYLES.map((style) => style.id).join(', ')}.`,
    );
  memoryStyle = value;
  try {
    localStorage.setItem(key, value);
    temporaryStyle = false;
  } catch {
    temporaryStyle = true;
    /* The style still works until the tab closes. */
  }
  document.documentElement.dataset.skin = value;
  listeners.forEach((listener) => listener());
}
const StyleContext = createContext<VisualStyle>('crypt');
export function VisualStyleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const style = useSyncExternalStore(
    subscribe,
    readVisualStyle,
    () => 'crypt' as VisualStyle,
  );
  useEffect(() => {
    document.documentElement.dataset.skin = style;
  }, [style]);
  return (
    <StyleContext.Provider value={style}>{children}</StyleContext.Provider>
  );
}
export const useVisualStyle = () => useContext(StyleContext);
export function StylePicker({
  compact = false,
  disabled = false,
}: {
  compact?: boolean;
  disabled?: boolean;
}) {
  const style = useVisualStyle(),
    id = useId();
  return (
    <div className={`appearance-control ${compact ? 'compact' : ''}`}>
      <span className="appearance-label" id={`${id}-label`}>
        Оформление
      </span>
      <RadioGroup
        value={style}
        onValueChange={selectVisualStyle}
        aria-labelledby={`${id}-label`}
        className="style-picker"
        disabled={disabled}
      >
        {VISUAL_STYLES.map((option) => (
          <div
            key={option.id}
            className={`style-option ${style === option.id ? 'chosen' : ''}`}
          >
            <RadioGroupItem
              value={option.id}
              className="style-radio"
              aria-label={option.name}
            />
            {option.id === 'crypt' ? (
              <Moon size={16} />
            ) : option.id === 'royal' ? (
              <Crown size={18} />
            ) : option.id === 'pixel' ? (
              <Gamepad2 size={18} />
            ) : option.id === 'paper' ? (
              <Scissors size={18} />
            ) : option.id === 'cartoon' ? (
              <Swords size={18} />
            ) : option.id === 'darktale' ? (
              <Heart size={18} />
            ) : option.id === 'midnight' ? (
              <MoonStar size={18} />
            ) : option.id === 'underworld' ? (
              <Flame size={18} />
            ) : option.id === 'deadcells' ? (
              <Skull size={18} />
            ) : option.id === 'basement' ? (
              <Droplet size={18} />
            ) : option.id === 'palace' ? (
              <BookOpen size={18} />
            ) : option.id === 'palace-pop' ? (
              <Palette size={18} />
            ) : option.id === 'summit' ? (
              <Mountain size={18} />
            ) : (
              <Joystick size={18} />
            )}
            <span className="style-option-label">{option.name}</span>
            {style === option.id && <Check className="style-check" size={14} />}
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
