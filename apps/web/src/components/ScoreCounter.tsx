/**
 * Animates a numeric score from `from` to `to` over `durationMs`.
 * Uses requestAnimationFrame for a smooth eased count-up.
 * Respects prefers-reduced-motion by jumping to the final value immediately.
 */
import { useEffect, useRef, useState } from 'react';
import { formatScore } from '../lib/format';

interface Props {
  from: number;
  to: number;
  durationMs?: number;
  className?: string;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function ScoreCounter({ from, to, durationMs = 800, className = '' }: Props) {
  const [value, setValue] = useState(from);
  const raf = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || from === to) {
      setValue(to);
      return;
    }

    startRef.current = null;
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(elapsed / durationMs, 1);
      setValue(Math.round(from + (to - from) * easeOut(t)));
      if (t < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [from, to, durationMs]);

  return (
    <span className={`tabular-nums ${className}`} aria-live="polite" aria-atomic="true">
      {formatScore(value)}
    </span>
  );
}
