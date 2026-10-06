// README Studio capture harness for FloodText — captures README visuals from a LOCAL production build of site/.
// Outputs into assets/:
//   - flood-hero.png    : one mid-wave frame of the demo paragraphs
//   - flood-wave.gif    : the wave travelling through the text (frames stitched with ffmpeg)
//   - flood-effects.png : the same paragraph under each effect (wght, wdth, oblique, opacity, blur, rotation)
//
// Reproducible:
//   cd site && npx next build && cd ..
//   npm run capture                         # starts `next start` on PORT itself, then stops it
//   SITE_URL=http://localhost:5962 npm run capture   # or reuse a server you already started
// Never point this at the live site (Vercel bot mitigation); it is meant for a local build.
// Requires Playwright (root devDependency) and ffmpeg on PATH.
//
// Env: PORT (default 5962), SITE_URL (skip starting a server), HOST (default 127.0.0.1).

import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

/** Repo root (run from there). */
const ROOT = process.cwd();
/** The Next.js site directory. */
const SITE = join(ROOT, "site");
/** Port for the local `next start` server. */
const PORT = process.env.PORT ? Number(process.env.PORT) : 5962;
/** Host the local server binds to. */
const HOST = process.env.HOST ?? "127.0.0.1";
/** Base URL to capture; a given SITE_URL means a server is already running. */
const BASE = process.env.SITE_URL ?? `http://${HOST}:${PORT}`;
/** Output directory for README images. */
const ASSETS = join(ROOT, "assets");
/** Temporary GIF frames. */
const FRAMES = join(ASSETS, ".frames");
/** Effects shown in the grid, in order (size is left out: it changes line heights). */
const GRID_EFFECTS = ["wght", "wdth", "oblique", "opacity", "blur", "rotation"];

/** Waits a number of milliseconds. */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits until the server answers 200, or throws after timeoutMs. */
async function waitForServer(url, timeoutMs = 60000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			// Not up yet
		}
		await wait(500);
	}
	throw new Error(`Server did not start at ${url} within ${timeoutMs} ms`);
}

/** Runs ffmpeg with the given arguments; rejects on a non-zero exit. */
function ffmpeg(args) {
	return new Promise((resolve, reject) => {
		const proc = spawn("ffmpeg", args, { stdio: "inherit" });
		proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Ffmpeg exited ${code}`))));
		proc.on("error", reject);
	});
}

/** Screenshots a locator with `pad` CSS px around it: at the crest of a wght wave, locked lines run a few px past the column. */
async function shot(page, locator, pad = 16, path) {
	const box = await locator.boundingBox();
	return page.screenshot({ path, clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 } });
}

/** Makes `target` the only active effect by clicking the demo's effect toggles. */
async function selectOnly(page, target) {
	const group = page.getByRole("group", { name: "Effect" });
	const button = (name) => group.locator("button", { hasText: new RegExp(`^${name}$`) });
	if ((await button(target).getAttribute("aria-pressed")) !== "true") await button(target).click();
	for (const name of GRID_EFFECTS.concat("size")) {
		if (name !== target && (await button(name).getAttribute("aria-pressed")) === "true") await button(name).click();
	}
}

await mkdir(ASSETS, { recursive: true });
await rm(FRAMES, { recursive: true, force: true });
await mkdir(FRAMES, { recursive: true });

// 1. Start the production server unless one was given.
let server = null;
if (!process.env.SITE_URL) {
	console.log("Starting next start on %s ...", BASE);
	server = spawn("npx", ["next", "start", "-p", String(PORT), "-H", HOST], { cwd: SITE, stdio: "inherit" });
}

let browser;
try {
	await waitForServer(BASE);
	browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
	await page.goto(BASE, { waitUntil: "networkidle" });
	await page.evaluate(() => document.fonts.ready);

	// Dismiss the cookie banner so it never appears in a capture.
	const decline = page.getByRole("button", { name: /decline/i });
	if (await decline.count()) await decline.first().click().catch(() => {});

	// Capture-only: hide the before/after toggle, which sits inside the padded clip.
	await page.addStyleTag({ content: 'button[aria-label="Toggle before/after comparison"] { visibility: hidden !important }' });

	// The live paragraphs sit in the demo card's inner column (excludes the controls above it).
	const demoCard = page.locator("section:has(h2:has-text('Live demo')) > div").first();
	const flood = demoCard.locator("div.flex.flex-col.gap-8").first();
	await flood.waitFor({ state: "visible" });
	// In view, so pauseOffscreen lets the wave run.
	await flood.evaluate((el) => el.scrollIntoView({ block: "center" }));
	await wait(1500);

	// 2. Hero — one mid-wave frame (the demo's default wght + opacity).
	await shot(page, flood, 16, join(ASSETS, "flood-hero.png"));
	console.log("Captured assets/flood-hero.png");

	// 3. Wave GIF — 30 frames at 10 fps.
	const FRAME_COUNT = 30;
	for (let i = 0; i < FRAME_COUNT; i++) {
		await shot(page, flood, 16, join(FRAMES, `frame-${String(i).padStart(3, "0")}.png`));
		await wait(100);
	}
	await ffmpeg([
		"-y", "-loglevel", "error",
		"-framerate", "10",
		"-i", join(FRAMES, "frame-%03d.png"),
		"-vf", "fps=10,scale=680:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=2",
		"-loop", "0",
		join(ASSETS, "flood-wave.gif"),
	]);
	console.log("Captured assets/flood-wave.gif");

	// 4. Effects grid — the first paragraph under each single effect at its default amplitude.
	const firstPara = flood.locator("p").first();
	const tiles = [];
	for (const effect of GRID_EFFECTS) {
		await selectOnly(page, effect);
		await wait(1200);
		const png = await shot(page, firstPara, 16);
		tiles.push({ effect, src: `data:image/png;base64,${png.toString("base64")}` });
	}
	const bg = await page.evaluate(() => getComputedStyle(document.querySelector("section:has(h2) > div")).backgroundColor);
	const fg = await page.evaluate(() => getComputedStyle(document.body).color);
	const grid = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 });
	await grid.setContent(`<!doctype html><body style="margin:0;background:${bg};color:${fg};font:500 22px/1.2 ui-monospace,Menlo,monospace">
		<div id="g" style="display:grid;grid-template-columns:1fr 1fr;gap:28px;padding:32px;width:1336px">
		${tiles.map((t) => `<figure style="margin:0"><figcaption style="margin:0 0 10px">effect: '${t.effect}'</figcaption><img src="${t.src}" style="width:100%;display:block"></figure>`).join("")}
		</div></body>`);
	await grid.locator("#g").screenshot({ path: join(ASSETS, "flood-effects.png") });
	console.log("Captured assets/flood-effects.png");

	await rm(FRAMES, { recursive: true, force: true });
} finally {
	if (browser) await browser.close();
	if (server) {
		server.kill("SIGTERM");
		await wait(500);
	}
}

console.log("Done.");
