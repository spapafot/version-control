// Real-browser smoke test: loads a challenge, types git commands into the
// terminal, expects the success overlay, and saves screenshots.
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:8788";
const SHOTS = process.env.SHOTS ?? "screenshots";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

await mkdir(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1"],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
const errors = [];
/**
 * The local static server has no backend, so the quiz page's leaderboard fetch
 * is expected to fail when BASE points at serve-out.mjs. Ignore failures from
 * the API origin only; everything else still counts as a browser error.
 */
const OFFLINE_API = /api\.versioncontrol\.gr/;
page.on("response", (r) => { if (r.status() === 404) console.error("404 URL:", r.url()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // A failed request reports the URL in location(), not in the message text
  // ("Failed to load resource: ... 404"), so both have to be checked.
  if (OFFLINE_API.test(m.text()) || OFFLINE_API.test(m.location()?.url ?? "")) return;
  errors.push(`console.error: ${m.text()}`);
});

async function typeInTerminal(text) {
  await page.click(".xterm");
  await page.type(".xterm textarea", text, { delay: 8 });
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 350));
}

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

try {
  // ── cookie consent: must be answered first, or the bottom-anchored
  //    banner intercepts clicks on the terminal in every later step ────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));
  const bannerShown = await page.evaluate(() =>
    Boolean(document.querySelector('[aria-label="Cookie consent"]')),
  );
  if (!bannerShown) fail("cookie consent banner did not appear on first visit");

  await page.$$eval("button", (btns) => {
    const b = btns.find((x) => x.textContent?.trim().toUpperCase() === "DECLINE");
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  const bannerGone = await page.evaluate(() =>
    !document.querySelector('[aria-label="Cookie consent"]'),
  );
  if (!bannerGone) fail("cookie consent banner did not dismiss after Decline");

  // declining must mean no Google request at all
  const gaHits = [];
  page.on("request", (r) => {
    if (r.url().includes("googletagmanager.com")) gaHits.push(r.url());
  });

  // ── challenge 1: git init flow ─────────────────────────────────────
  await page.goto(`${BASE}/challenge/first-repository/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".xterm textarea", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${SHOTS}/01-challenge-initial.png` });

  // ── lesson notes: in the HTML, but in a dialog rather than on the page ──
  //    (the whole point is that the game fits one screen with no scrolling)
  const pageScrolls = await page.evaluate(
    () => document.scrollingElement.scrollHeight > window.innerHeight + 2,
  );
  if (pageScrolls) fail("challenge page scrolls at 1440x900; notes belong in the dialog");
  const beforeNotes = await page.evaluate(() => document.body.innerText);
  if (beforeNotes.includes("LESSON NOTES —"))
    fail("lesson notes are rendered on the page instead of inside the dialog");

  await page.$$eval("button", (btns) => {
    const b = btns.find((x) => x.textContent?.toUpperCase().includes("NOTES"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const notesText = await page.evaluate(
    () => document.querySelector('[role="dialog"]')?.innerText ?? "",
  );
  if (!notesText.includes("YOUR OBJECTIVE")) fail("lesson notes dialog did not open");
  await page.screenshot({ path: `${SHOTS}/01b-lesson-notes.png` });

  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  const stillOpen = await page.evaluate(() =>
    Boolean(document.querySelector('[role="dialog"]')),
  );
  if (stillOpen) fail("lesson notes dialog did not close on Escape");

  await typeInTerminal("git status");
  await typeInTerminal("git init");

  const overlay = await page
    .waitForFunction(() => document.body.innerText.includes("COMPLETED"), { timeout: 8000 })
    .catch(() => null);
  if (!overlay) fail("success overlay did not appear after git init");

  // the completion card must not cover the terminal: the command that finishes
  // a mission is usually the one whose output is worth reading
  const cardClears = await page.evaluate(() => {
    const card = document.querySelector('[role="status"]')?.getBoundingClientRect();
    const term = document.querySelector(".xterm")?.getBoundingClientRect();
    if (!card || !term) return null;
    return card.right < term.left || card.left > term.right || card.bottom < term.top;
  });
  if (cardClears === null) fail("completion card or terminal not found");
  else if (!cardClears) fail("completion card overlaps the terminal");
  const outputStillVisible = await page.evaluate(() =>
    document.querySelector(".xterm").innerText.includes("Initialized empty Git repository"),
  );
  if (!outputStillVisible) fail("last command output is not readable behind the completion card");
  await page.screenshot({ path: `${SHOTS}/02-challenge-success.png` });

  // navigate to the next challenge via the overlay Link
  await page.$$eval("a", (links) => {
    const a = links.find((x) => x.textContent?.includes("Next mission"));
    if (a) a.click();
  });
  const navigated = await page
    .waitForFunction(() => document.body.innerText.includes("MISSION 10"), { timeout: 10000 })
    .catch(() => null);
  if (!navigated) fail("next-challenge Link navigation failed");

  // ── conflict challenge: markers + editor + resolution ──────────────
  await page.goto(`${BASE}/challenge/resolve-the-conflict/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".xterm textarea", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${SHOTS}/03-conflict-initial.png` });

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (!bodyText.includes("conflict")) fail("conflict badge not visible in file explorer");

  await typeInTerminal("cat menu.html");
  const termText = await page.evaluate(() => document.querySelector(".xterm").innerText);
  if (!termText.includes("<<<<<<<")) fail("conflict markers not shown in terminal cat");

  // resolve via terminal
  await typeInTerminal('echo "<h2>Menu</h2>" > menu.html');
  await typeInTerminal('echo "<p>Iced Espresso 2.50</p>" >> menu.html');
  await typeInTerminal("git add menu.html");
  const done2 = await page
    .waitForFunction(() => document.body.innerText.includes("COMPLETED"), { timeout: 8000 })
    .catch(() => null);
  if (!done2) fail("conflict challenge did not complete");
  await page.screenshot({ path: `${SHOTS}/04-conflict-success.png` });

  // ── graph rendering on a merge-history challenge ───────────────────
  await page.goto(`${BASE}/challenge/clean-up-branches/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".xterm textarea", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 600));
  const svgNodes = await page.$$eval("svg rect", (r) => r.length);
  if (svgNodes < 2) fail(`git graph looks empty (${svgNodes} rects)`);
  await page.screenshot({ path: `${SHOTS}/05-graph-history.png` });

  // ── editor modal opens ─────────────────────────────────────────────
  await page.$$eval("button", (btns) => {
    const b = btns.find((x) => x.textContent?.includes("menu.html"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  const editorVisible = await page.evaluate(() =>
    Boolean(document.querySelector(".cm-editor")),
  );
  if (!editorVisible) fail("editor modal did not open");
  await page.screenshot({ path: `${SHOTS}/06-editor.png` });

  // ── landing, level map, playground ─────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${SHOTS}/07-landing.png`, fullPage: true });

  await page.goto(`${BASE}/stages/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));
  const mapText = await page.evaluate(() => document.body.innerText);
  if (!mapText.includes("74")) fail("level map missing progress counts");
  await page.screenshot({ path: `${SHOTS}/08-map.png`, fullPage: true });

  await page.goto(`${BASE}/playground/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".xterm textarea", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));
  await typeInTerminal("git init");
  await typeInTerminal('echo "hello" > test.txt');
  await typeInTerminal("git add test.txt");
  await typeInTerminal('git commit -m "First experiment"');
  await new Promise((r) => setTimeout(r, 400));
  const playNodes = await page.$$eval("svg rect", (r) => r.length);
  if (playNodes < 1) fail("playground graph did not render a commit");
  await page.screenshot({ path: `${SHOTS}/09-playground.png` });

  // ── disasters: reflog recovery playthrough ─────────────────────────
  await page.goto(`${BASE}/challenge/lost-commits/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".xterm textarea", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 600));
  await typeInTerminal("git reflog");
  const reflogText = await page.evaluate(() => document.querySelector(".xterm").innerText);
  if (!reflogText.includes("reset: moving to HEAD~2"))
    fail("git reflog did not show the reset entry");
  await typeInTerminal("git reset --hard HEAD@{1}");
  const disasterDone = await page
    .waitForFunction(() => document.body.innerText.includes("COMPLETED"), { timeout: 8000 })
    .catch(() => null);
  if (!disasterDone) fail("lost-commits disaster did not complete via reflog recovery");
  await page.screenshot({ path: `${SHOTS}/12-disaster-reflog.png` });

  // ── stash: shelve, handle the interruption, pick it back up ────────
  await page.goto(`${BASE}/challenge/stash-and-switch/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".xterm textarea", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 600));

  await typeInTerminal("git switch main");
  const refusal = await page.evaluate(() => document.querySelector(".xterm").innerText);
  if (!refusal.includes("stash them before you switch branches"))
    fail("switch with a dirty tree was not refused");

  await typeInTerminal("git stash");
  const shelved = await page.evaluate(() => document.body.innerText);
  if (!shelved.includes("stash@{0}")) fail("stash panel did not show the shelved entry");

  await typeInTerminal("git switch main");
  await typeInTerminal('echo "<h2>Closed 15-20 August</h2>" > anakoinosi.html');
  await typeInTerminal("git add anakoinosi.html");
  await typeInTerminal('git commit -m "Holiday notice"');
  await typeInTerminal("git switch feature/menu");
  await typeInTerminal("git stash pop");
  const stashDone = await page
    .waitForFunction(() => document.body.innerText.includes("COMPLETED"), { timeout: 8000 })
    .catch(() => null);
  if (!stashDone) fail("stash-and-switch did not complete after stash → switch → pop");
  await page.screenshot({ path: `${SHOTS}/13-stash.png` });

  // ── progress persisted on the map ──────────────────────────────────
  await page.goto(`${BASE}/stages/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));
  const mapAfter = await page.evaluate(() => document.body.innerText);
  if (!mapAfter.includes("4/74")) fail(`progress not persisted on map (expected 4/74)`);
  if (!mapAfter.includes("THE TERMINAL")) fail("terminal world missing from map");
  if (!mapAfter.includes("GIT DISASTERS")) fail("disasters world missing from map");
  if (!mapAfter.includes("THE REMOTE")) fail("remote world missing from map");

  // ── account page: signed-out forms render without console errors ───
  //    (Cognito/API are unreachable here; nothing may throw uncaught)
  await page.goto(`${BASE}/account/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  const accountText = await page.evaluate(() => document.body.innerText);
  if (!accountText.includes("SIGN IN")) fail("account page did not render the sign-in panel");
  if (!accountText.includes("CREATE ACCOUNT")) fail("account page missing create-account toggle");
  if (!accountText.includes("GIT CERTIFICATE")) fail("account page missing the certificate explainer");
  await page.screenshot({ path: `${SHOTS}/10-account.png`, fullPage: true });

  // ── quiz hub: renders and offers both modes ────────────────────────
  //    NOTE: the API is unreachable here, so this covers the hub and the
  //    crawlable About section only. Playing a run needs the real backend:
  //    BASE=https://versioncontrol.gr pnpm smoke, or `pnpm dev`.
  await page.goto(`${BASE}/quiz/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  const quizText = await page.evaluate(() => document.body.innerText);
  // HUD text is uppercased in CSS, so innerText comes back uppercase.
  if (!quizText.includes("GIT QUIZ")) fail("quiz page did not render the hub panel");
  if (!quizText.includes("SPRINT")) fail("quiz hub missing the sprint mode");
  if (!quizText.includes("SET OF 20")) fail("quiz hub missing the set-of-20 mode");
  // Difficulty is dealt as a balanced mix, so a player never picks one.
  if (quizText.includes("DIFFICULTY")) fail("quiz hub still offers a difficulty picker");
  if (!quizText.includes("LEADERBOARD")) fail("quiz hub missing the leaderboard panel");
  await page.screenshot({ path: `${SHOTS}/13-quiz.png`, fullPage: true });

  // ── verify page: bare shell with the ID lookup form ────────────────
  //    NOTE: per-credential URLs (/verify/VC-GIT-F-XXXXXXXX/) are served by
  //    the Cloudflare worker, which serve-out.mjs does not run. Check those
  //    manually with `wrangler dev` — this only covers the static shell.
  await page.goto(`${BASE}/verify/`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  const verifyText = await page.evaluate(() => document.body.innerText);
  if (!verifyText.includes("VERIFY A VERSIONCONTROL.GR CERTIFICATE"))
    fail("verify page heading missing");
  const verifyInput = await page.evaluate(() => Boolean(document.querySelector("#verify-id")));
  if (!verifyInput) fail("verify page did not render the credential ID input");
  await page.screenshot({ path: `${SHOTS}/11-verify.png`, fullPage: true });

  // ── legal pages reachable from the footer ──────────────────────────
  await page.goto(`${BASE}/privacy/`, { waitUntil: "networkidle0" });
  const privacyText = await page.evaluate(() => document.body.innerText);
  if (!privacyText.includes("G-GZDXV866QK"))
    fail("privacy page missing the analytics disclosure");
  await page.goto(`${BASE}/terms/`, { waitUntil: "networkidle0" });
  const termsText = await page.evaluate(() => document.body.innerText);
  if (!termsText.includes("TERMS OF USE")) fail("terms page did not render");

  if (gaHits.length) fail(`analytics loaded despite Decline: ${gaHits[0]}`);
  if (!mapAfter.includes("THE STASH")) fail("stash world missing from map");
} catch (e) {
  fail(e.message);
  await page.screenshot({ path: `${SHOTS}/99-error.png` }).catch(() => {});
}

if (errors.length) {
  console.error("BROWSER ERRORS:");
  for (const e of errors) console.error(" ", e);
  process.exitCode = 1;
}

console.log(process.exitCode ? "SMOKE: FAILED" : "SMOKE: OK");
await browser.close();
