/**
 * Phase router for the player flow.
 *
 * A single `/play` URL covers all in-game phases. The store phase field
 * determines which screen renders. This keeps the URL stable so a browser
 * refresh triggers a rejoin rather than a 404.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore, registerPlayerSocketHandlers } from '../../store/playerStore';
import { socket } from '../../lib/socket';
import { Lobby } from './Lobby';
import { Question } from './Question';
import { Result } from './Result';
import { Final } from './Final';

let _handlersRegistered = false;

export function Play() {
  const phase = usePlayerStore((s) => s.phase);
  const pin = usePlayerStore((s) => s.pin);
  const playerId = usePlayerStore((s) => s.playerId);
  const reconnectToken = usePlayerStore((s) => s.reconnectToken);
  const navigate = useNavigate();

  // Register socket handlers exactly once per app lifetime
  useEffect(() => {
    if (!_handlersRegistered) {
      registerPlayerSocketHandlers();
      _handlersRegistered = true;
    }
  }, []);

  // Reconnect if the socket dropped and we have stored credentials
  useEffect(() => {
    if (!phase) {
      // No live session — try to reconnect from localStorage
      const stored = localStorage.getItem('aaa_reconnect');
      if (stored) {
        const creds = JSON.parse(stored) as {
          pin: string;
          playerId: string;
          reconnectToken: string;
        };
        if (!socket.connected) socket.connect();
        socket.emit('player:rejoin', creds, (res: { ok: boolean }) => {
          if (!res.ok) {
            localStorage.removeItem('aaa_reconnect');
            navigate('/');
          }
        });
      } else {
        navigate('/');
      }
    }
  }, [phase, navigate]);

  // If the player was kicked, navigate home
  useEffect(() => {
    if (phase === 'ended') {
      localStorage.removeItem('aaa_reconnect');
    }
  }, [phase]);

  void pin; void playerId; void reconnectToken;

  switch (phase) {
    case 'lobby':
      return <Lobby />;
    case 'question':
      return <Question />;
    case 'reveal':
    case 'leaderboard':
      return <Result />;
    case 'podium':
    case 'ended':
      return <Final />;
    default:
      return (
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-muted">Connecting…</p>
        </main>
      );
  }
}
