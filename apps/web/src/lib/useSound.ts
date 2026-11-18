/**
 * Sound toggle hook.
 *
 * Default: muted (spec requirement).
 * Stored in localStorage so the preference survives a refresh.
 *
 * playDrumroll() uses the Web Audio API to synthesise a short drumroll
 * rather than loading an audio file — zero assets, works offline.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'aaa_sound';

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'on';
  } catch {
    return true;
  }
}

export function useSound() {
  const [muted, setMuted] = useState(readMuted);

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'off' : 'on');
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const playDrumroll = useCallback(() => {
    if (muted) return;
    try {
      const ctx = new AudioContext();
      const totalDuration = 1.2;
      const startTime = ctx.currentTime;

      // Rapid noise bursts that fade out like a snare roll
      for (let i = 0; i < 24; i++) {
        const t = startTime + (i / 24) * totalDuration;
        const bufferSize = ctx.sampleRate * 0.03;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let s = 0; s < bufferSize; s++) {
          data[s] = (Math.random() * 2 - 1) * (1 - s / bufferSize) * 0.3;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.03);
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(t);
      }

      // Final accent hit
      const hit = ctx.createOscillator();
      const hitGain = ctx.createGain();
      hit.type = 'sine';
      hit.frequency.setValueAtTime(220, startTime + totalDuration);
      hitGain.gain.setValueAtTime(0.6, startTime + totalDuration);
      hitGain.gain.exponentialRampToValueAtTime(0.001, startTime + totalDuration + 0.5);
      hit.connect(hitGain);
      hitGain.connect(ctx.destination);
      hit.start(startTime + totalDuration);
      hit.stop(startTime + totalDuration + 0.5);

      void ctx.close;
    } catch { /* AudioContext not available */ }
  }, [muted]);

  return { muted, toggle, playDrumroll };
}
