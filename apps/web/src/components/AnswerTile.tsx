/**
 * A single answer option tile.
 *
 * Color and glyph both identify the option so the design never relies on
 * color alone (accessibility requirement from the spec).
 *
 * States:
 *   default  — interactive, full opacity
 *   chosen   — border highlight, slightly scaled up
 *   dimmed   — another option was chosen; reduced opacity
 *   disabled — question over, no interaction
 */

interface Props {
  index: 0 | 1 | 2 | 3;
  label: string;
  state: 'default' | 'chosen' | 'dimmed' | 'disabled';
  onClick: () => void;
}

const OPTION_META: Record<
  number,
  { color: string; border: string; glyph: string; glyphLabel: string }
> = {
  0: { color: 'bg-opt-a',   border: 'ring-opt-a',   glyph: '▲', glyphLabel: 'triangle' },
  1: { color: 'bg-opt-b',   border: 'ring-opt-b',   glyph: '◆', glyphLabel: 'diamond'  },
  2: { color: 'bg-opt-c',   border: 'ring-opt-c',   glyph: '●', glyphLabel: 'circle'   },
  3: { color: 'bg-opt-d',   border: 'ring-opt-d',   glyph: '■', glyphLabel: 'square'   },
};

export function AnswerTile({ index, label, state, onClick }: Props) {
  const meta = OPTION_META[index]!;

  const base =
    'relative flex min-h-[72px] w-full items-center gap-4 rounded-arena px-5 py-4 text-left text-base font-semibold text-bg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

  const stateClasses = {
    default:  `${meta.color} opacity-100 active:scale-[0.98]`,
    chosen:   `${meta.color} opacity-100 ring-4 ${meta.border} scale-[1.02]`,
    dimmed:   `${meta.color} opacity-30 cursor-default`,
    disabled: `${meta.color} opacity-60 cursor-default`,
  }[state];

  return (
    <button
      className={`${base} ${stateClasses}`}
      onClick={state === 'default' ? onClick : undefined}
      disabled={state === 'dimmed' || state === 'disabled'}
      aria-pressed={state === 'chosen'}
      aria-label={`${meta.glyphLabel}: ${label}`}
    >
      {/* Shape glyph — visible at a glance, not color-only */}
      <span className="text-xl leading-none" aria-hidden="true">
        {meta.glyph}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
