import { cn } from '../lib/cn.js';
import { useRef, useState, type JSX, type KeyboardEvent, type ReactNode } from 'react';

// Pestañas de la ficha de un registro (numeral 16.3, B22B), con el patrón de pestañas de
// WAI-ARIA: flechas izquierda y derecha, Inicio y Fin; solo la pestaña activa recibe el foco con
// Tab. En celular, si no caben, se deslizan en una sola fila.

export interface SectionTab {
  readonly id: string;
  readonly label: string;
  readonly content: () => ReactNode;
}

const MOVES: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

function tabClass(selected: boolean): string {
  return cn(
    '-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-200',
    selected
      ? 'border-primary text-primary'
      : 'border-transparent text-muted-foreground hover:text-foreground',
  );
}

interface TabListProps {
  readonly tabs: readonly SectionTab[];
  readonly label: string;
  readonly active: number;
  readonly onSelect: (index: number) => void;
}

function TabList({ tabs, label, active, onSelect }: TabListProps): JSX.Element {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const move = MOVES[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = move(active, tabs.length);
    onSelect(next);
    buttons.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="tab"
          id={`pestana-${tab.id}`}
          aria-selected={index === active}
          aria-controls={`panel-${tab.id}`}
          tabIndex={index === active ? 0 : -1}
          onKeyDown={onKeyDown}
          onClick={() => {
            onSelect(index);
          }}
          className={tabClass(index === active)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTabs(props: {
  readonly tabs: readonly SectionTab[];
  readonly label: string;
}): JSX.Element {
  const [active, setActive] = useState(0);
  const current = props.tabs[active];
  return (
    <div className="flex flex-col gap-5">
      <TabList {...props} active={active} onSelect={setActive} />
      {current === undefined ? null : (
        <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`pestana-${current.id}`}>
          {current.content()}
        </div>
      )}
    </div>
  );
}
