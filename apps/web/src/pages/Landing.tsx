import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BrandLockup } from '../components/BrandLockup';
import { Button } from '../components/Button';
import { socket } from '../lib/socket';

export function Landing() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 6) {
      setError('Enter the 6-digit game PIN.');
      return;
    }
    if (!socket.connected) socket.connect();
    navigate(`/join/${pin}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandLockup />
      <p className="mt-2 text-base text-muted">Train fast. Think faster.</p>

      <form className="mt-10 space-y-3" onSubmit={handleSubmit} noValidate>
        <label className="block">
          <span className="sr-only">Game PIN</span>
          <input
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="w-full rounded-arena bg-surface px-5 py-4 text-center font-display text-3xl tabular-nums tracking-[0.4em] text-text ring-1 ring-white/10 placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-brand"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'pin-error' : undefined}
          />
        </label>

        {error && (
          <p id="pin-error" className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" fullWidth disabled={pin.length === 0}>
          Enter
        </Button>
      </form>

      <p className="mt-8 text-center">
        <Link
          to="/host"
          className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
        >
          Host a game
        </Link>
      </p>
    </main>
  );
}
