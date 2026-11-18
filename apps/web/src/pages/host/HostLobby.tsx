import { QRCodeSVG } from 'qrcode.react';
import { useHostStore, startGame, kickPlayer } from '../../store/hostStore';
import { Button } from '../../components/Button';

interface Props {
  pin: string;
}

export function HostLobby({ pin }: Props) {
  const players = useHostStore((s) => s.players);
  const joinUrl = `${window.location.origin}/join/${pin}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-muted">Join at {window.location.host}</p>
        <p className="font-display text-7xl font-bold tabular-nums tracking-widest text-brand">
          {pin}
        </p>
        <div className="mt-3 rounded-xl bg-white p-3">
          <QRCodeSVG value={joinUrl} size={160} />
        </div>
        <p className="mt-1 text-xs text-muted">{joinUrl}</p>
      </div>

      {/* Player count */}
      <p className="mt-8 text-center text-muted">
        <span className="font-display text-3xl font-semibold text-text">{players.length}</span>
        {' / 100 players'}
      </p>

      {/* Player list */}
      <ul
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
        aria-label="Players in lobby"
      >
        {players.map((p) => (
          <li
            key={p.id}
            className="group flex items-center justify-between rounded-lg bg-surface px-3 py-2"
          >
            <span className="truncate text-sm font-medium text-text">{p.nickname}</span>
            <button
              onClick={() => kickPlayer(pin, p.id)}
              className="ml-2 shrink-0 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad"
              aria-label={`Kick ${p.nickname}`}
            >
              Kick
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex justify-center">
        <Button
          onClick={() => startGame(pin)}
          disabled={players.length === 0}
          className="px-10"
        >
          Start game
        </Button>
      </div>
    </main>
  );
}
