/**
 * Socket.IO singleton.
 *
 * autoConnect is false so the app controls exactly when to connect.
 * The reconnection strategy uses exponential back-off (Socket.IO default).
 * Clock-offset measurement runs once after the first connection.
 */
import { io } from 'socket.io-client';

export const socket = io({
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.4,
});

// ---------------------------------------------------------------------------
// Clock sync
// ---------------------------------------------------------------------------

let _clockOffset = 0; // ms to add to Date.now() to get server time

export function getServerTime(): number {
  return Date.now() + _clockOffset;
}

const PING_COUNT = 5;

export function syncClock(): void {
  const samples: number[] = [];

  for (let i = 0; i < PING_COUNT; i++) {
    const sent = Date.now();
    socket.emit('time:ping', sent, (serverNow: number) => {
      const rtt = Date.now() - sent;
      samples.push(serverNow - (sent + rtt / 2));
      if (samples.length === PING_COUNT) {
        const sorted = [...samples].sort((a, b) => a - b);
        _clockOffset = sorted[Math.floor(PING_COUNT / 2)] ?? 0;
      }
    });
  }
}

socket.once('connect', syncClock);
