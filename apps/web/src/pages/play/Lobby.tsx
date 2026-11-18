import { useEffect } from 'react';
import { usePlayerStore } from '../../store/playerStore';

export function Lobby() {
  const nickname = usePlayerStore((s) => s.nickname);
  const count = usePlayerStore((s) => s.lobbyCount);

  // Request wake lock so the phone screen stays on
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock
      .request('screen')
      .then((l) => { lock = l; })
      .catch(() => { /* ignore — not critical */ });
    return () => { void lock?.release(); };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div
        className="h-16 w-16 rounded-full bg-brand/20 ring-4 ring-brand"
        style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }}
        aria-hidden="true"
      />

      <div>
        <p className="text-2xl font-semibold text-text">
          You&rsquo;re in, <span className="text-brand">{nickname}</span>!
        </p>
        <p className="mt-1 text-sm text-muted">Waiting for the host to start…</p>
      </div>

      <p className="font-display text-5xl font-semibold tabular-nums text-text" aria-live="polite">
        {count}
      </p>
      <p className="text-sm text-muted">{count === 1 ? 'player' : 'players'} in the arena</p>
    </main>
  );
}
