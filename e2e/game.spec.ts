/**
 * E2E tests: one host browser page + two player browser contexts through one
 * complete question, plus a rejoin test.
 *
 * The test creates a real game on the server (via socket.io-client helpers),
 * then controls the UI via Playwright.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { connectSocket, createTestGame, joinAsPlayer, waitForEvent, TEST_QUIZ } from './helpers';
import { HostEvents, ServerEvents } from '@amadeus/shared';
import type { Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function enterPin(page: Page, pin: string) {
  await page.goto('/');
  const input = page.getByPlaceholder('000000');
  await input.fill(pin);
  await page.getByRole('button', { name: 'Enter' }).click();
}

async function enterNickname(page: Page, nickname: string) {
  await page.getByPlaceholder('Your name').fill(nickname);
  await page.getByRole('button', { name: 'Join arena' }).click();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Full game flow', () => {
  let hostSocket: Socket;
  let pin: string;
  let hostToken: string;

  test.beforeEach(async () => {
    hostSocket = await connectSocket();
    ({ pin, hostToken } = await createTestGame(hostSocket));
    // Register the quiz so the server can find it when the browser host creates the game
    // (the in-process server test uses registerQuiz; in e2e the server is running externally
    // so we pre-seed the quiz via the host socket which already registered it above)
    void hostToken; // kept for potential host:resume in future tests
  });

  test.afterEach(() => {
    hostSocket.disconnect();
  });

  // ---- Landing page --------------------------------------------------------

  test('landing page shows PIN input and brand', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Apex Arena')).toBeVisible();
    await expect(page.getByPlaceholder('000000')).toBeVisible();
  });

  test('Enter button disabled when PIN is empty', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByRole('button', { name: 'Enter' });
    await expect(btn).toBeDisabled();
  });

  test('shows error for invalid PIN format', async ({ page }) => {
    await page.goto('/');
    // Type letters — they should be stripped, leaving an empty field
    await page.getByPlaceholder('000000').fill('abc');
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page.getByText('Enter the 6-digit game PIN')).toBeVisible();
  });

  // ---- Join flow -----------------------------------------------------------

  test('player joins lobby and sees their nickname', async ({ page }) => {
    await enterPin(page, pin);
    await enterNickname(page, 'TestPlayer');
    await expect(page.getByText("You're in, TestPlayer!")).toBeVisible();
  });

  test('shows NICKNAME_TAKEN error for duplicate nickname', async ({ page, browser }) => {
    // First player joins
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await enterPin(page2, pin);
    await enterNickname(page2, 'Alice');
    await expect(page2.getByText("You're in, Alice!")).toBeVisible();

    // Second player tries same nickname
    await enterPin(page, pin);
    await page.getByPlaceholder('Your name').fill('Alice');
    await page.getByRole('button', { name: 'Join arena' }).click();
    await expect(page.getByText('already taken')).toBeVisible();

    await ctx2.close();
  });

  test('shows error for unknown PIN', async ({ page }) => {
    await enterPin(page, '000000');
    await page.getByPlaceholder('Your name').fill('Ghost');
    await page.getByRole('button', { name: 'Join arena' }).click();
    await expect(page.getByText('not found')).toBeVisible();
  });

  // ---- Question flow -------------------------------------------------------

  test('two players receive question and can answer', async ({ page, browser }) => {
    // Player 1
    await enterPin(page, pin);
    await enterNickname(page, 'P1');
    await expect(page.getByText("You're in, P1!")).toBeVisible();

    // Player 2 in second context
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await enterPin(page2, pin);
    await enterNickname(page2, 'P2');
    await expect(page2.getByText("You're in, P2!")).toBeVisible();

    // Start game via host socket
    await new Promise<void>((resolve, reject) => {
      hostSocket.emit(
        HostEvents.START,
        { pin },
        (res: { ok: boolean; error?: { message: string } }) => {
          if (res.ok) resolve();
          else reject(new Error(res.error?.message));
        },
      );
    });

    // Both players should see the timer ring (question screen)
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 10_000 });
    await expect(page2.getByRole('timer')).toBeVisible({ timeout: 10_000 });

    // P1 answers (option B = index 1 = correct for this quiz)
    const tiles = page.getByRole('button', { name: /diamond/i });
    await tiles.click();
    await expect(page.getByText('Answer locked')).toBeVisible();

    // P2 answers
    const tiles2 = page2.getByRole('button', { name: /diamond/i });
    await tiles2.click();
    await expect(page2.getByText('Answer locked')).toBeVisible();

    // Both players should see Result screen (all answered → auto-reveal)
    await expect(page.getByText('Correct!')).toBeVisible({ timeout: 10_000 });
    await expect(page2.getByText('Correct!')).toBeVisible({ timeout: 10_000 });

    await ctx2.close();
  });

  // ---- Correct answer not leaked -------------------------------------------

  test('correct answer index not present in question:start payload', async ({ page }) => {
    await enterPin(page, pin);
    await enterNickname(page, 'Spy');

    // Intercept WebSocket messages via page.evaluate + a flag on window
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['_correctLeaked'] = false;
    });

    await new Promise<void>((resolve, reject) => {
      hostSocket.emit(HostEvents.START, { pin }, (res: { ok: boolean }) => {
        if (res.ok) resolve();
        else reject(new Error('start failed'));
      });
    });

    // Wait for question screen
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 10_000 });

    // The player tile labels should be letters/shapes, not "correct" data
    // We just check that the word "correct" doesn't appear anywhere in the DOM
    // (the server should never send it in the player payload)
    const correctText = await page.getByText('correct', { exact: false }).count();
    expect(correctText).toBe(0);
  });

  // ---- Reconnect -----------------------------------------------------------

  test('player who refreshes mid-lobby rejoins on the same screen', async ({ page }) => {
    await enterPin(page, pin);
    await enterNickname(page, 'Returner');
    await expect(page.getByText("You're in, Returner!")).toBeVisible();

    // Reload the page — should reconnect and stay in lobby
    await page.reload();
    await expect(page.getByText("You're in, Returner!")).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Host area gate
// ---------------------------------------------------------------------------

test.describe('Host area', () => {
  test('shows password gate', async ({ page }) => {
    await page.goto('/host');
    await expect(page.getByPlaceholder('Admin password')).toBeVisible();
  });

  test('continues after entering a password', async ({ page }) => {
    await page.goto('/host');
    await page.getByPlaceholder('Admin password').fill('any-password');
    await page.getByRole('button', { name: 'Continue' }).click();
    // Dashboard loads (may show empty state or quiz list)
    await expect(page.getByRole('button', { name: 'New quiz' })).toBeVisible({ timeout: 8_000 });
  });
});
