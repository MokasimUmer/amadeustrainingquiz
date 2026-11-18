import { Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Join } from './pages/Join';
import { Play } from './pages/play/Play';
import { HostArea } from './pages/host/HostArea';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/join/:pin?" element={<Join />} />
      <Route path="/play" element={<Play />} />
      <Route path="/host/*" element={<HostArea />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
