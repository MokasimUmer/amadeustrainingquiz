import { describe, expect, it } from 'vitest';
import { defaultGameSettings } from './index.js';

describe('defaultGameSettings', () => {
  it('matches the v1 game defaults', () => {
    expect(defaultGameSettings).toEqual({
      scoringMode: 'speed',
      tieBreak: 'time',
      showLeaderboardEachQuestion: true,
      maxPlayers: 100,
      lockLobbyOnStart: true,
    });
  });
});
