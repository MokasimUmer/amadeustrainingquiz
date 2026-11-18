/**
 * Phase router for the host game flow.
 *
 * URL: /host/game/:quizId
 *
 * On mount:
 *   1. Opens settings modal.
 *   2. Host clicks "Start game" → emits host:create → receives PIN.
 *   3. Routes between lobby / question / reveal / leaderboard screens
 *      based on the phase in the host store.
 *
 * Also attempts host:resume from sessionStorage on hard refresh.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useHostStore, createGame, resumeGame, registerHostSocketHandlers } from '../../store/hostStore';
import { socket } from '../../lib/socket';
import { SettingsModal } from './SettingsModal';
import { HostLobby } from './HostLobby';
import { HostQuestion } from './HostQuestion';
import { HostReveal } from './HostReveal';
import { HostLeaderboard } from './HostLeaderboard';
import { HostPodium } from './HostPodium';
import type { GameSettings } from './SettingsModal';

export function HostGame() {
  const { quizId = '' } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const phase = useHostStore((s) => s.phase);
  const pin = useHostStore((s) => s.pin);
  const error = useHostStore((s) => s.error);

  const [showSettings, setShowSettings] = useState(false);
  const [starting, setStarting] = useState(false);

  // Register socket handlers once
  useEffect(() => {
    registerHostSocketHandlers();
  }, []);

  // On mount: try to resume from sessionStorage, else show settings modal
  useEffect(() => {
    const stored = sessionStorage.getItem('aaa_host_game');
    if (stored) {
      const { pin: p, hostToken } = JSON.parse(stored) as {
        pin: string;
        hostToken: string;
      };
      if (!socket.connected) socket.connect();
      void resumeGame(p, hostToken).then((res) => {
        if (!res.ok) {
          sessionStorage.removeItem('aaa_host_game');
          setShowSettings(true);
        }
      });
    } else {
      setShowSettings(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSettingsConfirm(settings: GameSettings) {
    setShowSettings(false);
    setStarting(true);
    if (!socket.connected) socket.connect();
    const res = await createGame(quizId, settings as unknown as Record<string, unknown>);
    setStarting(false);
    if (!res.ok) {
      setShowSettings(true);
    }
  }

  if (showSettings) {
    return (
      <SettingsModal
        onConfirm={handleSettingsConfirm}
        onCancel={() => navigate('/host')}
      />
    );
  }

  if (starting) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-muted">Creating game…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-bad">{error}</p>
      </main>
    );
  }

  switch (phase) {
    case 'lobby':
      return <HostLobby pin={pin} />;
    case 'question':
      return <HostQuestion pin={pin} />;
    case 'reveal':
      return <HostReveal pin={pin} />;
    case 'leaderboard':
      return <HostLeaderboard pin={pin} />;
    case 'podium':
    case 'ended':
      return <HostPodium pin={pin} />;
    default:
      return (
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-muted">Connecting…</p>
        </main>
      );
  }
}
