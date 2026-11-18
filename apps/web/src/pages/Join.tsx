import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BrandLockup } from '../components/BrandLockup';
import { Button } from '../components/Button';
import { socket } from '../lib/socket';
import { joinGame } from '../store/playerStore';

export function Join() {
  const { pin = '' } = useParams<{ pin: string }>();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('Enter a nickname.');
      return;
    }
    if (!socket.connected) socket.connect();
    setLoading(true);
    setError('');

    const result = await joinGame(pin, trimmed);
    setLoading(false);

    if (!result.ok) {
      const msg: Record<string, string> = {
        NICKNAME_TAKEN: 'That nickname is already taken.',
        NICKNAME_INVALID: 'Nickname must be 1–20 characters.',
        GAME_NOT_FOUND: 'Game not found. Check the PIN.',
        GAME_LOCKED: 'This game has already started.',
        GAME_FULL: 'The game is full.',
      };
      setError(msg[result.error ?? ''] ?? result.error ?? 'Could not join.');
      return;
    }

    navigate('/play');
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandLockup />
      <p className="mt-2 text-base text-muted">PIN: {pin}</p>

      <form className="mt-10 space-y-3" onSubmit={handleSubmit} noValidate>
        <label className="block">
          <span className="sr-only">Nickname</span>
          <input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value.slice(0, 20));
              setError('');
            }}
            autoFocus
            autoComplete="nickname"
            maxLength={20}
            placeholder="Your name"
            className="w-full rounded-arena bg-surface px-5 py-4 text-center font-display text-2xl text-text ring-1 ring-white/10 placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-brand"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'nick-error' : undefined}
          />
        </label>

        {error && (
          <p id="nick-error" className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" fullWidth disabled={!nickname.trim() || loading}>
          {loading ? 'Joining…' : 'Join arena'}
        </Button>
      </form>
    </main>
  );
}
