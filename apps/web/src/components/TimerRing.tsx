/**
 * Circular countdown ring.
 *
 * Renders an SVG circle whose stroke-dashoffset animates from full (time
 * remaining = 100%) down to 0 (time is up). The numeric seconds count is
 * displayed in the centre.
 *
 * The animation is driven by a CSS transition on stroke-dashoffset so it
 * stays smooth even when the React render interval is longer than 1 s.
 * prefers-reduced-motion skips the transition entirely.
 */
import { useEffect, useRef, useState } from 'react';
import { msToSec } from '../lib/format';

interface Props {
  endsAt: number;    // epoch ms
  serverTime: number; // server time at the moment the event was received
  totalSec: number;  // question time limit
}

const SIZE = 100;
const STROKE = 7;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function TimerRing({ endsAt, serverTime, totalSec }: Props) {
  const clientOffset = serverTime - Date.now();
  const getRemaining = () => endsAt - (Date.now() + clientOffset);

  const [remainingMs, setRemainingMs] = useState(getRemaining);
  const raf = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const ms = getRemaining();
      setRemainingMs(ms);
      if (ms > 0) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, serverTime]);

  const fraction = Math.min(Math.max(remainingMs / (totalSec * 1000), 0), 1);
  const offset = CIRCUMFERENCE * (1 - fraction);
  const secs = msToSec(remainingMs);

  // Colour shifts: green → amber → red as time runs out
  const colour =
    fraction > 0.5 ? 'var(--ok)' : fraction > 0.25 ? 'var(--accent)' : 'var(--bad)';

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-label={`${secs} seconds remaining`}
      role="timer"
    >
      {/* Track */}
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="var(--surface-2)"
        strokeWidth={STROKE}
      />
      {/* Progress arc — starts at 12 o'clock */}
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke={colour}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.4s ease' }}
        className="motion-reduce:transition-none"
      />
      {/* Countdown number */}
      <text
        x={SIZE / 2}
        y={SIZE / 2}
        dominantBaseline="central"
        textAnchor="middle"
        fill="var(--text)"
        fontSize="26"
        fontFamily="'Space Grotesk', system-ui"
        fontWeight="600"
      >
        {secs}
      </text>
    </svg>
  );
}
