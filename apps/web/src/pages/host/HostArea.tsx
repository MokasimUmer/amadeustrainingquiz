/**
 * Top-level host area.  Gates on auth then routes to dashboard or editor or game.
 */
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useHostStore, loadStoredAuth } from '../../store/hostStore';
import { HostAuth } from './HostAuth';
import { Dashboard } from './Dashboard';
import { QuizEditor } from './QuizEditor';
import { HostGame } from './HostGame';

export function HostArea() {
  const authed = useHostStore((s) => s.authed);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  if (!authed) return <HostAuth />;

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="quiz/:id" element={<QuizEditor />} />
      <Route path="game/:quizId" element={<HostGame />} />
      <Route path="*" element={<Navigate to="/host" replace />} />
    </Routes>
  );
}
