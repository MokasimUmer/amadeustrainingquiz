/**
 * Pre-game settings modal shown before the host creates the game.
 */
import { useState } from 'react';
import { Button } from '../../components/Button';
import type { ScoringMode, TieBreak } from '@amadeus/shared';

export interface GameSettings {
  scoringMode: ScoringMode;
  tieBreak: TieBreak;
  showLeaderboardEachQuestion: boolean;
}

interface Props {
  onConfirm: (settings: GameSettings) => void;
  onCancel: () => void;
}

export function SettingsModal({ onConfirm, onCancel }: Props) {
  const [scoringMode, setScoringMode] = useState<ScoringMode>('speed');
  const [tieBreak, setTieBreak] = useState<TieBreak>('time');
  const [showLb, setShowLb] = useState(true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-md rounded-arena bg-surface p-6 ring-1 ring-white/10">
        <h2 className="font-display text-xl font-semibold text-text">Game settings</h2>

        <div className="mt-6 space-y-5">
          {/* Scoring mode */}
          <fieldset>
            <legend className="text-sm font-medium text-muted">Scoring</legend>
            <div className="mt-2 flex gap-3">
              {(['speed', 'flat'] as ScoringMode[]).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="scoring"
                    value={m}
                    checked={scoringMode === m}
                    onChange={() => setScoringMode(m)}
                    className="accent-brand"
                  />
                  <span className="text-sm capitalize text-text">{m}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              {scoringMode === 'speed'
                ? 'Faster answers earn more points.'
                : 'All correct answers earn the same points.'}
            </p>
          </fieldset>

          {/* Tie-break */}
          <fieldset>
            <legend className="text-sm font-medium text-muted">Tie-break</legend>
            <div className="mt-2 flex gap-3">
              {(['time', 'host'] as TieBreak[]).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="tiebreak"
                    value={t}
                    checked={tieBreak === t}
                    onChange={() => setTieBreak(t)}
                    className="accent-brand"
                  />
                  <span className="text-sm capitalize text-text">{t}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              {tieBreak === 'time'
                ? 'Faster cumulative response time wins.'
                : 'You pick the winner when scores are tied.'}
            </p>
          </fieldset>

          {/* Leaderboard toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={showLb}
              onChange={(e) => setShowLb(e.target.checked)}
              className="accent-brand"
            />
            <span className="text-sm text-text">Show leaderboard after each question</span>
          </label>
        </div>

        <div className="mt-8 flex gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                scoringMode,
                tieBreak,
                showLeaderboardEachQuestion: showLb,
              })
            }
          >
            Start game
          </Button>
        </div>
      </div>
    </div>
  );
}
