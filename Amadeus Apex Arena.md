# Amadeus Apex Arena

*Repo name:* `amadeustrainingquiz` · *Product name:* **Amadeus Apex Arena** · *Tagline:* "Train fast. Think faster."

A minimalist, real-time, Kahoot-style quiz platform for live training sessions. One host, up to **100 simultaneous players**, server-authoritative timer, speed-based or flat scoring, live ranking and an animated top-3 podium.

> **How to use this doc with Cursor:** put it in the repo root as `SPEC.md`, copy the "Cursor Rules" section into `.cursorrules`, then feed Cursor the milestone prompts in order (Section 15). Build milestone by milestone; do not ask for everything at once.

> **Originality note:** replicate the *flow and feel* of Kahoot, not its logo, name, exact colors, fonts or shape icons. Use the original design tokens below.

## 1. Goals and non-goals

**Goals**

- Host creates or loads a quiz, starts a game, gets a 6-digit PIN.
- Players join from any phone browser with PIN and nickname. No accounts.
- Questions with 2 to 4 answer options, a per-question timer, server-validated answers.
- Scoring by speed (default) or flat points, chosen by the host per game.
- After each question: correct answer, answer distribution, top 5. At the end: animated podium for the top 3 and full ranking.
- Handles 100 concurrent players on one small server instance with sub-200 ms perceived latency.

**Non-goals (v1)**

- User accounts, payments, public quiz marketplace, images or video in questions, teams mode.

## 2. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript everywhere | Shared types between client and server |
| Monorepo | npm workspaces | `apps/server`, `apps/web`, `packages/shared` |
| Server | Node 20, Express, Socket.IO 4 | Rooms, reconnection and fallbacks built in |
| Validation | Zod | Runtime validation of every socket payload |
| Game state | In-memory `Map<pin, Game>` | 100 players is tiny; no Redis needed |
| Quiz storage | SQLite via `better-sqlite3` (file `data/quizzes.db`) | Zero-ops persistence for saved quizzes |
| Frontend | React 18, Vite, React Router, Tailwind CSS, Framer Motion | Fast, animation-friendly |
| State (client) | Zustand | Small, simple |
| Tests | Vitest (unit), Playwright (e2e), custom load script | See Section 12 |
| Deploy | Single Docker container on Render, Railway or Fly.io; server also serves `apps/web/dist` | One URL, no CORS |

## 3. Repository layout

```
amadeustrainingquiz/
├─ package.json                # workspaces
├─ SPEC.md
├─ .cursorrules
├─ Dockerfile
├─ packages/shared/
│  └─ src/
│     ├─ types.ts              # Game, Player, Question, enums
│     ├─ events.ts             # socket event names + Zod payload schemas
│     └─ scoring.ts            # pure scoring functions (unit tested)
├─ apps/server/
│  └─ src/
│     ├─ index.ts              # express + socket.io bootstrap
│     ├─ config.ts             # env, limits
│     ├─ db.ts                 # sqlite + quiz repository
│     ├─ routes/quizzes.ts     # REST CRUD for quizzes
│     ├─ game/
│     │  ├─ GameManager.ts     # map of games, PIN generation, cleanup
│     │  ├─ Game.ts            # state machine + timers
│     │  └─ leaderboard.ts     # ranking and tie-breaks
│     ├─ sockets/
│     │  ├─ hostHandlers.ts
│     │  ├─ playerHandlers.ts
│     │  └─ middleware.ts      # rate limit, validation
│     └─ util/{pin.ts,sanitize.ts,clock.ts}
└─ apps/web/
   └─ src/
      ├─ main.tsx, App.tsx, routes.tsx
      ├─ lib/{socket.ts,api.ts,format.ts}
      ├─ store/{hostStore.ts,playerStore.ts}
      ├─ theme/tokens.css
      ├─ components/{Button.tsx,AnswerTile.tsx,TimerRing.tsx,Podium.tsx,LeaderboardRow.tsx,Confetti.tsx}
      └─ pages/
         ├─ Landing.tsx        # PIN entry (players) + "Host a game"
         ├─ Join.tsx           # nickname step
         ├─ play/{Lobby,Question,Result,Final}.tsx
         ├─ host/{Dashboard,QuizEditor,HostLobby,HostQuestion,HostReveal,HostFinal}.tsx
```

## 4. Data models (`packages/shared/src/types.ts`)

```ts
export type AnswerIndex = 0 | 1 | 2 | 3;

export interface Question {
  id: string;
  text: string;            // max 200 chars
  options: string[];       // 2..4 items, each max 100 chars
  correct: AnswerIndex[];  // v1: exactly one index; array for future multi-select
  timeLimitSec: number;    // 5..120, default 20
  basePoints: number;      // default 1000
}

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];   // 1..50
  createdAt: number;
  updatedAt: number;
}

export type ScoringMode = 'speed' | 'flat';
export type TieBreak = 'time' | 'host';   // time = lowest cumulative response time wins

export interface GameSettings {
  scoringMode: ScoringMode;   // default 'speed'
  tieBreak: TieBreak;         // default 'time'
  showLeaderboardEachQuestion: boolean; // default true
  maxPlayers: number;         // default 100, hard cap 100
  lockLobbyOnStart: boolean;  // default true
}

export type GamePhase = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'podium' | 'ended';

export interface Player {
  id: string;                 // server-generated uuid
  nickname: string;           // 1..20 chars, sanitized, unique per game (case-insensitive)
  socketId: string | null;    // null when disconnected
  reconnectToken: string;     // secret, stored in localStorage on the client
  score: number;
  streak: number;
  totalResponseMs: number;    // for tie-breaks
  answers: Record<string, { choice: AnswerIndex; ms: number; correct: boolean; points: number }>;
  connected: boolean;
}

export interface RankedPlayer { id: string; nickname: string; score: number; rank: number; streak: number; delta: number }
```

SQLite table:

```sql
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY, title TEXT NOT NULL,
  json TEXT NOT NULL,           -- full Quiz JSON
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
```

## 5. Game state machine (server-authoritative)

```
lobby ──host:start──▶ question(i) ──timer ends OR all answered──▶ reveal(i)
  reveal(i) ──host:next──▶ leaderboard(i) ──host:next──▶ question(i+1)
  (last question) leaderboard ──host:next──▶ podium ──host:end──▶ ended
```

Rules:

- Only the host socket (validated by `hostToken`) may trigger transitions.
- The server holds one `setTimeout` per question. It **ends early** if every connected player has answered.
- Phase changes are broadcast with a `serverTime` (ms epoch) and `endsAt` so clients can render the countdown locally, corrected by a measured clock offset.
- A game with no host or players for 30 minutes is garbage-collected. A finished game is removed 10 minutes after `ended`.

## 6. Scoring and ranking (`packages/shared/src/scoring.ts`)

```ts
export function computePoints(opts: {
  correct: boolean; mode: 'speed' | 'flat';
  elapsedMs: number; timeLimitMs: number; basePoints: number; streak: number;
}): number {
  if (!opts.correct) return 0;
  if (opts.mode === 'flat') return opts.basePoints;
  const t = Math.min(Math.max(opts.elapsedMs / opts.timeLimitMs, 0), 1);
  const speed = Math.round(opts.basePoints * (1 - t / 2)); // 100% → 50%
  const streakBonus = Math.min(opts.streak, 5) * 50;        // +50 per consecutive correct, cap 250
  return speed + streakBonus;
}
```

- `elapsedMs` is computed **on the server**: `receivedAt - questionStartedAt`. Never trust client timestamps. Answers arriving after `endsAt + 300 ms` grace are rejected.
- Ranking sort: score desc, then (if `tieBreak = 'time'`) `totalResponseMs` asc, then nickname asc. Equal score and time share the same rank (competition ranking: 1, 2, 2, 4).
- **Winner by choice:** if `tieBreak = 'host'` and the top positions are tied, the server emits `host:tieDetected` with the tied player ids. The host picks the order in the UI and sends `host:resolveTie`. The podium then uses that order. Also allow the host to manually override the winner on the podium screen (a "Crown a different winner" action) in case the host wants a judgment call.

## 7. Realtime protocol (`packages/shared/src/events.ts`)

All payloads validated with Zod on the server. Use acknowledgements (callbacks) for every client→server event: `{ ok: true, data } | { ok: false, error: { code, message } }`.

**Client → Server (host)**

| Event | Payload | Notes |
| --- | --- | --- |
| `host:create` | `{ quizId, settings }` | Returns `{ pin, hostToken, gameId }` |
| `host:resume` | `{ pin, hostToken }` | Reattach after refresh |
| `host:start` | `{ pin }` | Phase lobby → question(0) |
| `host:skip` | `{ pin }` | End current question now |
| `host:next` | `{ pin }` | Advance from reveal / leaderboard |
| `host:kick` | `{ pin, playerId }` | Remove a player |
| `host:resolveTie` | `{ pin, orderedPlayerIds }` | Only when tieBreak = host |
| `host:end` | `{ pin }` | Terminate game |

**Client → Server (player)**

| Event | Payload | Notes |
| --- | --- | --- |
| `player:join` | `{ pin, nickname }` | Returns `{ playerId, reconnectToken }` |
| `player:rejoin` | `{ pin, playerId, reconnectToken }` | After refresh or network drop |
| `player:answer` | `{ pin, questionId, choice }` | First valid answer wins; later ones ignored |

**Server → Clients**

| Event | To | Payload |
| --- | --- | --- |
| `lobby:update` | room | `{ players: {id, nickname}[], count }` |
| `game:phase` | room | `{ phase, questionIndex, total, serverTime }` |
| `question:start` | room | Host: full question. Players: `{ questionId, optionCount, endsAt, serverTime }` (players see only colored shapes/letters, never question text on their device, like Kahoot; make this a setting `showTextOnPlayer`, default true for training sessions with small phone text) |
| `question:progress` | host | `{ answered, total }` |
| `question:reveal` | room | `{ correct, distribution: number[], top5 }` plus per-player private result via `player:result` |
| `player:result` | one player | `{ correct, pointsEarned, score, rank, streak, behind: {nickname, gap} \| null }` |
| `leaderboard:show` | room | `{ ranked: RankedPlayer[] (top 10) }` |
| `podium:show` | room | `{ top3: RankedPlayer[], all: RankedPlayer[] }` |
| `game:ended` | room | `{}` |
| `player:kicked` | one player | `{}` |

**Anti-leak rule:** never send `correct` to players before `question:reveal`. The server strips it from the `question:start` payload.

**Error codes:** `GAME_NOT_FOUND`, `GAME_LOCKED`, `GAME_FULL`, `NICKNAME_TAKEN`, `NICKNAME_INVALID`, `NOT_HOST`, `BAD_PHASE`, `ALREADY_ANSWERED`, `TOO_LATE`, `RATE_LIMITED`.

## 8. Server implementation details

- **PIN generation:** 6 random digits, regenerate on collision with active games.
- **Capacity:** reject `player:join` with `GAME_FULL` when players ≥ `maxPlayers` (100).
- **Nickname rules:** trim, collapse whitespace, 1 to 20 chars, strip control characters, reject a small profanity list (configurable file `profanity.txt`), unique case-insensitively within the game.
- **Reconnection:** the client stores `{pin, playerId, reconnectToken}` in `localStorage`. On socket reconnect it emits `player:rejoin`. The server rebinds `socketId`, marks `connected = true`, then sends the current phase snapshot (`game:snapshot` with whatever the player needs to render the current screen, including remaining time).
- **Host reconnect:** same via `hostToken` stored in `sessionStorage`. If the host is disconnected during a question, keep the game running; pause only transitions that need the host.
- **Timers:** one `NodeJS.Timeout` per game, cleared on transition. Use `performance.now()`-based elapsed tracking plus wall-clock `endsAt` for clients.
- **Broadcast efficiency:** use `io.to(pin)` rooms. At 100 players a leaderboard payload of top 10 is under 2 KB. For `question:progress`, throttle to at most 5 updates/second.
- **Rate limiting:** per-socket token bucket, 10 events/second; `player:join` 5 attempts per minute per IP.
- **Security:** Helmet, strict CORS (same origin in prod), Zod on every payload, `hostToken` is a 32-byte random hex compared with `crypto.timingSafeEqual`, escape nicknames on render (React does this by default; never use `dangerouslySetInnerHTML`).
- **Quiz REST API** (`/api/quizzes`): `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`. Protect with a single `ADMIN_PASSWORD` env var sent as `Authorization: Bearer` (simple gate for a training tool). Validate with Zod. Import and export JSON: `POST /import`, `GET /:id/export`.
- **Env vars:** `PORT`, `ADMIN_PASSWORD`, `NODE_ENV`, `DB_PATH`, `MAX_PLAYERS` (default 100).
- **Health:** `GET /healthz` returns `{ ok: true, games, players }`.

## 9. Frontend: screens and behavior

### Player (mobile first, 360 px and up)

1. **Landing `/`**: big PIN input (numeric keypad), "Enter" button; small link "Host a game".
2. **Join**: nickname input, "Join arena" button, inline error messages.
3. **Lobby**: "You're in, {nickname}!" with a gentle pulsing animation and the live player count.
4. **Question**: top bar with a circular countdown ring and question number; below it 2 to 4 full-width answer tiles (large tap targets, min height 72 px), each with a distinct **color and shape glyph** (accessibility: never color alone). After tapping: tile locks, others dim, show "Answer locked in… waiting".
5. **Result**: full-screen green (correct) or red (wrong) flash, points earned counting up, current rank "You're #7", streak flame, and "{gap} pts behind {nickname}".
6. **Final**: your final rank, score, and a celebratory animation if top 3.

### Host (desktop/projector, 1280 px and up)

1. **Dashboard `/host`**: list of quizzes, "New quiz", "Start game". Password gate.
2. **Quiz editor**: title, question list (reorderable with drag handle), per-question text, 2 to 4 options with a radio to mark correct, time limit select (5, 10, 20, 30, 60, 90, 120 s), points. Autosave. Import/export JSON.
3. **Settings modal before start**: scoring mode, tie-break, leaderboard on/off.
4. **Host lobby**: giant PIN and join URL, QR code (use `qrcode.react`), animated list of joined players popping in, count "37 / 100", "Start" button (disabled with 0 players), kick button on hover.
5. **Host question**: question text large, countdown ring, live "answered 42/58" counter, option tiles, "Skip" button.
6. **Host reveal**: correct option highlighted, wrong ones faded; animated bar chart of answer distribution; "Next" button.
7. **Host leaderboard**: top 5 rows with animated rank changes (Framer Motion `layout` animations) and score counting up, plus up/down arrows showing rank movement.
8. **Host podium**: see below. Buttons: "Show full ranking", "Crown different winner" (when tie-break is host), "Export results CSV", "End game".

### Podium (the "in style" part)

- Three columns on a stage: 2nd on the left, 1st center and tallest, 3rd on the right.
- Reveal sequence with Framer Motion: 3rd place rises (0.8 s) → 2nd rises → short drumroll pause (1.2 s, pulsing spotlight) → 1st rises with confetti burst (`canvas-confetti`) and a gold shimmer on the nickname.
- Each podium block shows rank number, nickname and score count-up. Respect `prefers-reduced-motion` (skip to final state, no confetti).
- Optional sound effects behind a mute toggle (default off).

## 10. Design system (original, minimalist)

CSS variables in `theme/tokens.css`, used through Tailwind config:

```css
:root {
  --bg: #0B1020;          /* deep navy */
  --surface: #141B34;
  --surface-2: #1D2646;
  --text: #F4F6FF;
  --muted: #9AA4C7;
  --brand: #5B8CFF;       /* electric blue */
  --accent: #FFC857;      /* gold, winners */
  --ok: #2ED47A;
  --bad: #FF5A6E;
  --opt-a: #FF5A6E;  /* ▲ triangle */
  --opt-b: #4DA3FF;  /* ◆ diamond */
  --opt-c: #FFC857;  /* ● circle */
  --opt-d: #2ED47A;  /* ■ square */
  --radius: 16px;
}
```

- Typography: `Inter` (UI), `Space Grotesk` (headings, PIN, scores). Tabular numerals for scores.
- Minimalism rules: one primary action per screen, generous spacing, no decorative clutter, motion only where it conveys state (timer, rank change, reveal).
- Dark theme only in v1. Contrast ratio ≥ 4.5:1 for text.
- Name lockup: "AMADEUS" in small tracked caps above "Apex Arena" in the heading font.

## 11. Client implementation details

- **Socket singleton** in `lib/socket.ts` with `autoConnect: false`, `reconnection: true`, exponential backoff.
- **Clock sync:** on connect, emit `time:ping` 5 times, keep the median offset = `serverTime - (clientTime + rtt/2)`. Countdown = `endsAt - (Date.now() + offset)`. Clients never decide correctness or score.
- **Stores:** `playerStore` (pin, playerId, phase, currentQuestion, myResult, rank) and `hostStore` (game settings, players, phase, distribution, leaderboard). Update only in socket handlers registered once at app start.
- **Routes:** `/`, `/join/:pin?` (QR deep link), `/play`, `/host`, `/host/quiz/:id`, `/host/game/:pin`.
- **Optimistic UI** for tapping an answer (lock immediately), roll back on `ok: false`.
- **Wake lock:** request `navigator.wakeLock` on the player question screen to keep phones awake.
- **Accessibility:** buttons are real `<button>`s, focus rings visible, aria-live region announcing "Correct, +874 points".

## 12. Testing and 100-player load test

- **Unit (Vitest):** `computePoints` (boundaries 0%, 50%, 100% of time, streak cap), ranking with ties and competition ranking, nickname sanitizer, PIN collision.
- **Integration:** spin up the server in-process and use `socket.io-client` to simulate a full game with 3 players: join, start, answer, reveal, podium.
- **Load script** `scripts/loadtest.ts`: spawns 100 bot clients, each joins, answers every question at a random delay, and asserts: (a) all 100 receive every phase event, (b) server event-loop lag stays under 50 ms, (c) p95 answer ack under 150 ms, (d) memory stable. Run with `npm run loadtest -- --pin 123456 --bots 100`.
- **E2E (Playwright):** one host page plus two player contexts through one question.

## 13. Deployment

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
```

- Server serves `apps/web/dist` statically and falls back to `index.html` for client routes.
- Mount a persistent volume at `/data` for the SQLite file.
- Enable WebSocket support and sticky sessions if you ever run more than one instance. For v1 run exactly **one instance** (state is in memory).
- Use HTTPS (required for wake lock and good mobile behavior).

## 14. Cursor Rules (paste into `.cursorrules`)

```
You are building "Amadeus Apex Arena", a real-time quiz app. Follow SPEC.md exactly.
- TypeScript strict mode. No `any`.
- All socket payloads are validated with Zod schemas from packages/shared.
- The server is the single source of truth for time, phase and scores. Never trust client time or client-computed scores.
- Never send correct answers to players before the reveal event.
- Keep game logic in pure, testable functions; keep socket handlers thin.
- Every new function in scoring/leaderboard gets a Vitest test.
- Minimalist UI: Tailwind utility classes using the CSS variables in theme/tokens.css. No new UI libraries without asking.
- Respect prefers-reduced-motion. Never use color as the only signal.
- Work milestone by milestone. After each, run lint, typecheck and tests, then summarize what changed.
```

## 15. Milestones and prompts to give Cursor

**M1: Scaffold.** "Create an npm-workspaces monorepo with `apps/server`, `apps/web`, `packages/shared` per SPEC.md section 3. Set up TypeScript strict, ESLint, Prettier, Vitest, Vite + React + Tailwind, Express + Socket.IO. Add `npm run dev` that starts both. Add the shared types from section 4."

**M2: Scoring and leaderboard (pure logic).** "Implement `scoring.ts` and `leaderboard.ts` per sections 6, with competition ranking and tie-breaks, and full Vitest coverage."

**M3: Game engine.** "Implement `Game.ts` and `GameManager.ts` as the state machine in section 5, with injectable clock and timers so it is unit-testable. No sockets yet. Test all transitions and early-end when all players answered."

**M4: Sockets.** "Wire host and player handlers per section 7 with Zod validation, acknowledgements, rate limiting, and reconnection (`rejoin`, `host:resume`, `game:snapshot`). Add an integration test with 3 simulated players."

**M5: Quiz storage and REST.** "Add SQLite repository, the `/api/quizzes` endpoints, admin password middleware, JSON import/export."

**M6: Player UI.** "Build all player screens from section 9 with the design tokens in section 10, mobile first, including the countdown ring, answer tiles with shapes, and result screens."

**M7: Host UI.** "Build the dashboard, quiz editor, lobby with QR, question, reveal (animated distribution bars) and leaderboard screens."

**M8: Podium and polish.** "Build the podium reveal sequence with Framer Motion and canvas-confetti, the host 'crown a different winner' flow, CSV export, sound toggle, reduced-motion support."

**M9: Hardening and load test.** "Write `scripts/loadtest.ts` with 100 bots, fix any bottlenecks, add Playwright e2e, add Dockerfile and deployment notes."

## 16. Acceptance checklist

- [ ] 100 bots finish a 10-question game with every phase event received and no errors.
- [ ] A player who refreshes mid-question lands back on the same question with the right remaining time.
- [ ] Answering twice, answering late, or answering with a wrong `questionId` is rejected cleanly.
- [ ] Correct answers never appear in any player-bound payload before reveal (verify in the network tab).
- [ ] Speed scoring gives 1000 for an instant correct answer and about 500 at the buzzer; flat mode gives exactly `basePoints`.
- [ ] Ties resolve by response time, or by the host's pick when configured.
- [ ] Podium plays 3rd → 2nd → 1st with confetti, and respects reduced-motion.
- [ ] Works on iOS Safari, Android Chrome, and desktop Chrome/Edge.

## 17. Future ideas

Images in questions, team mode, true/false and multi-select questions, per-session report PDF, SSO for hosts, Redis adapter for multi-instance scaling, localization.
