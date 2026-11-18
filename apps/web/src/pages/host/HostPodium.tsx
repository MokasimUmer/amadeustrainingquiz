/**
 * Podium reveal screen.
 *
 * Reveal order: 3rd rises (0.8 s delay) → 2nd → drumroll pause (1.2 s) → 1st
 * with confetti burst and gold shimmer on the winner's nickname.
 *
 * prefers-reduced-motion: skip all animations, skip confetti.
 *
 * Layout: 2nd left | 1st centre (tallest) | 3rd right — matching the classic
 * podium shape. Each block shows rank number, nickname, score.
 *
 * Host actions:
 *   - Export results CSV
 *   - Crown a different winner (when tieDetectedIds is non-empty)
 *   - End game
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useHostStore, endGame, resolveTie } from '../../store/hostStore';
import { ScoreCounter } from '../../components/ScoreCounter';
import { Button } from '../../components/Button';
import { downloadResultsCsv } from '../../lib/csv';
import { useSound } from '../../lib/useSound';
import { formatScore } from '../../lib/format';
import type { RankedPlayer } from '@amadeus/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  pin: string;
}

// ---------------------------------------------------------------------------
// Sub-component: one podium block
// ---------------------------------------------------------------------------

interface BlockProps {
  player: RankedPlayer;
  heightClass: string;
  isFirst: boolean;
  animateIn: boolean;
  reduced: boolean;
}

function PodiumBlock({ player, heightClass, isFirst, animateIn, reduced }: BlockProps) {
  const medalEmoji = ['🥇', '🥈', '🥉'][player.rank - 1] ?? '';

  return (
    <motion.div
      className="flex flex-col items-center"
      initial={reduced ? false : { opacity: 0, y: 80 }}
      animate={animateIn ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Info above the block */}
      <div className="mb-2 flex flex-col items-center gap-1 text-center">
        <span className="text-3xl" aria-hidden="true">{medalEmoji}</span>
        <p
          className={`max-w-[120px] truncate font-display text-base font-semibold ${
            isFirst ? 'text-accent' : 'text-text'
          }`}
          style={
            isFirst && !reduced
              ? { textShadow: '0 0 20px rgba(255,200,87,0.6)' }
              : undefined
          }
        >
          {player.nickname}
        </p>
        <ScoreCounter
          from={0}
          to={player.score}
          durationMs={900}
          className={`font-display text-sm tabular-nums ${
            isFirst ? 'text-accent' : 'text-muted'
          }`}
        />
      </div>

      {/* The physical block */}
      <div
        className={`${heightClass} w-24 rounded-t-lg ${
          isFirst ? 'bg-accent' : 'bg-surface-2'
        } flex items-start justify-center pt-3`}
      >
        <span
          className={`font-display text-2xl font-bold ${
            isFirst ? 'text-bg' : 'text-muted'
          }`}
        >
          {player.rank}
        </span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HostPodium({ pin }: Props) {
  const top3 = useHostStore((s) => s.top3);
  const allRanked = useHostStore((s) => s.allRanked);
  const tieIds = useHostStore((s) => s.tieDetectedIds);
  const reduced = useReducedMotion() ?? false;
  const { muted, toggle: toggleSound, playDrumroll } = useSound();

  // Reveal sequence state: which blocks are visible
  const [revealed, setRevealed] = useState<Set<number>>(reduced ? new Set([1, 2, 3]) : new Set());
  const [showAll, setShowAll] = useState(false);
  const [showTieModal, setShowTieModal] = useState(false);
  const confettiFired = useRef(false);

  useEffect(() => {
    if (reduced) return;

    // 3rd place
    const t1 = setTimeout(() => setRevealed((s) => new Set([...s, 3])), 400);
    // 2nd place
    const t2 = setTimeout(() => setRevealed((s) => new Set([...s, 2])), 1200);
    // Drumroll pause then 1st place
    const t3 = setTimeout(() => playDrumroll(), 2000);
    const t4 = setTimeout(() => {
      setRevealed((s) => new Set([...s, 1]));
      if (!confettiFired.current) {
        confettiFired.current = true;
        void confetti({
          particleCount: 160,
          spread: 90,
          origin: { y: 0.55 },
          colors: ['#FFC857', '#5B8CFF', '#2ED47A', '#FF5A6E'],
        });
      }
    }, 3200);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Find the three podium players — may be fewer than 3 if the game had fewer players
  const first = top3.find((p) => p.rank === 1);
  const second = top3.find((p) => p.rank === 2);
  const third = top3.find((p) => p.rank === 3);

  const hasTie = tieIds.length >= 2;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-10">
      {/* Sound toggle */}
      <div className="flex w-full justify-end">
        <button
          onClick={toggleSound}
          className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
          aria-pressed={!muted}
          aria-label={muted ? 'Enable sounds' : 'Mute sounds'}
        >
          {muted ? '🔇 Sounds off' : '🔊 Sounds on'}
        </button>
      </div>

      <p className="mt-4 text-xs font-medium tracking-[0.35em] text-muted">AMADEUS</p>
      <h2 className="font-display text-3xl font-bold text-text">Apex Arena</h2>
      <p className="mt-1 text-sm text-muted">Final standings</p>

      {/* Podium stage — 2nd | 1st | 3rd */}
      <div className="mt-10 flex items-end justify-center gap-4">
        {second ? (
          <PodiumBlock
            player={second}
            heightClass="h-28"
            isFirst={false}
            animateIn={reduced || revealed.has(2)}
            reduced={reduced}
          />
        ) : (
          <div className="w-24" />
        )}

        {first ? (
          <PodiumBlock
            player={first}
            heightClass="h-40"
            isFirst
            animateIn={reduced || revealed.has(1)}
            reduced={reduced}
          />
        ) : (
          <div className="w-24" />
        )}

        {third ? (
          <PodiumBlock
            player={third}
            heightClass="h-20"
            isFirst={false}
            animateIn={reduced || revealed.has(3)}
            reduced={reduced}
          />
        ) : (
          <div className="w-24" />
        )}
      </div>

      {/* Stage base */}
      <div className="h-3 w-80 rounded-b-lg bg-surface-2" />

      {/* Action buttons */}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button
          variant="ghost"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Hide full ranking' : 'Show full ranking'}
        </Button>

        {hasTie && (
          <Button variant="ghost" onClick={() => setShowTieModal(true)}>
            👑 Crown a different winner
          </Button>
        )}

        <Button
          variant="ghost"
          onClick={() => downloadResultsCsv(allRanked, 'game')}
        >
          Export CSV
        </Button>

        <Button onClick={() => endGame(pin)}>End game</Button>
      </div>

      {/* Full ranking table */}
      {showAll && (
        <div className="mt-8 w-full">
          <p className="text-sm font-medium text-muted">All players</p>
          <ol className="mt-3 space-y-2">
            {allRanked.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 rounded-arena bg-surface px-5 py-3"
              >
                <span className="w-6 text-center font-display text-sm font-bold tabular-nums text-muted">
                  {p.rank}
                </span>
                <span className="flex-1 truncate font-medium text-text">{p.nickname}</span>
                {p.streak >= 3 && (
                  <span className="text-sm" aria-label={`${p.streak}-streak`}>🔥</span>
                )}
                <span className="tabular-nums text-sm font-semibold text-accent">
                  {formatScore(p.score)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Tie resolution modal */}
      {showTieModal && (
        <TieModal
          tiedIds={tieIds}
          players={allRanked}
          pin={pin}
          onClose={() => setShowTieModal(false)}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tie resolution modal
// ---------------------------------------------------------------------------

interface TieModalProps {
  tiedIds: string[];
  players: RankedPlayer[];
  pin: string;
  onClose: () => void;
}

function TieModal({ tiedIds, players, pin, onClose }: TieModalProps) {
  const tied = tiedIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is RankedPlayer => p !== undefined);

  const [order, setOrder] = useState<string[]>(tiedIds);

  function move(id: string, direction: -1 | 1) {
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  function handleConfirm() {
    resolveTie(pin, order);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crown a different winner"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-sm rounded-arena bg-surface p-6 ring-1 ring-white/10">
        <h3 className="font-display text-lg font-semibold text-text">Crown a winner</h3>
        <p className="mt-1 text-sm text-muted">
          Drag or use arrows to set the final order for tied players.
        </p>

        <ol className="mt-4 space-y-2">
          {order.map((id, i) => {
            const player = tied.find((p) => p.id === id);
            if (!player) return null;
            return (
              <li
                key={id}
                className="flex items-center gap-3 rounded-lg bg-surface-2 px-4 py-3"
              >
                <span className="w-5 text-center font-display text-sm font-bold text-muted">
                  {i + 1}
                </span>
                <span className="flex-1 font-medium text-text">{player.nickname}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => move(id, -1)}
                    disabled={i === 0}
                    className="rounded px-1.5 py-1 text-xs text-muted disabled:opacity-30 hover:text-text"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(id, 1)}
                    disabled={i === order.length - 1}
                    className="rounded px-1.5 py-1 text-xs text-muted disabled:opacity-30 hover:text-text"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}
