/**
 * Password gate for the host area.
 * The password is never validated here — the server rejects API calls with
 * 401 if it's wrong. We just store whatever the host types and let the first
 * real API call surface the error.
 */
import { useState } from 'react';
import { BrandLockup } from '../../components/BrandLockup';
import { Button } from '../../components/Button';
import { saveAuth } from '../../store/hostStore';

export function HostAuth() {
  const [pw, setPw] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.trim()) saveAuth(pw.trim());
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandLockup />
      <p className="mt-2 text-sm text-muted">Host access</p>

      <form className="mt-10 space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="sr-only">Admin password</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            placeholder="Admin password"
            className="w-full rounded-arena bg-surface px-5 py-4 text-text ring-1 ring-white/10 placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
        <Button type="submit" fullWidth disabled={!pw.trim()}>
          Continue
        </Button>
      </form>
    </main>
  );
}
