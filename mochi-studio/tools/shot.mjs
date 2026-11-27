#!/usr/bin/env node
// See the world without a screen: runs commands in a headless browser, fast-forwarding time, and saves the pictures.
// Agents use it to check what they made. Each step is a JSON object with one key: a world command (the MCP tools'
// names: walk_to, sit, act, say, feel, look_at, camera, dog, ...) or one of these:
//   {"wait": 2}                         let 2 s pass
//   {"snapshot": "name"}                save the camera's view as <out>/name.jpg
//   {"sheet": {"clip": "wave"}}         a contact sheet of a clip (frames over time, front and side) -> <out>/sheet-wave.jpg
//   {"view": [[x,y,z], [x,y,z]]}        put the camera at a point, looking at a point (metres)
//   {"eval": "js"}                      run JavaScript in the page (window.world) and print the result
// Options: --out DIR (default ./shots), --size WxH (default 960x540), --query "room=cozy&vrm=..." (page URL options).
//   node mochi-studio/tools/shot.mjs '{"snapshot":"start"}' '{"sit":{"on":"sofa"}}' '{"snapshot":"sitting"}'
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { start } from "../server.mjs";

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv.splice(i, 2)[1]; };
const out = opt("--out", path.join(path.dirname(new URL(import.meta.url).pathname), "..", "shots")), [W, H] = opt("--size", "960x540").split("x").map(Number), query = opt("--query", "");
const steps = argv.map((a) => JSON.parse(a));

async function chromium() {
	try { return (await import("playwright")).chromium; } catch { /* not installed here: use the npx cache */ }
	const npx = path.join(os.homedir(), ".npm/_npx");
	for (const d of existsSync(npx) ? readdirSync(npx) : []) {
		try { return createRequire(path.join(npx, d, "node_modules/"))("playwright").chromium; } catch { /* next */ }
	}
	throw new Error("Playwright not found: run `npx playwright install chromium` once");
}
// a headless shell already on this Mac, newest first (the npx Playwright may expect a build that isn't installed)
function shell() {
	const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
	for (const d of existsSync(base) ? readdirSync(base).filter((d) => d.startsWith("chromium_headless_shell")).sort().reverse() : []) {
		const p = path.join(base, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
		if (existsSync(p)) return p;
	}
}

const server = await start(0);
const port = server.address().port;
const pw = await chromium();
const browser = await pw.launch({ executablePath: process.env.MOCHI_CHROME ?? shell(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/GL Driver|deprecated/.test(m.text())) console.error("[page]", m.text()); });
page.on("pageerror", (e) => console.error("[page error]", e.message));
await page.goto(`http://127.0.0.1:${port}/?headless&${query}`);
await page.waitForFunction(() => window.worldReady || window.worldError, null, { timeout: 120_000 });
const err = await page.evaluate(() => window.worldError);
if (err) { console.error("world failed:", err); process.exit(1); }

await mkdir(out, { recursive: true });
let n = 0;
const save = async (name, dataUrl) => {
	const f = path.join(out, `${name || `shot-${++n}`}.${dataUrl.startsWith("data:image/png") ? "png" : "jpg"}`);
	await writeFile(f, Buffer.from(dataUrl.split(",")[1], "base64"));
	console.log("saved", f);
};
for (const step of steps) {
	const [[cmd, args]] = Object.entries(step);
	if (cmd === "snapshot") await save(args, await page.evaluate(() => world.shot()));
	else if (cmd === "sheet") await save(`sheet-${args.clip}`, await page.evaluate((a) => world.sheet(a), args));
	else if (cmd === "view") await page.evaluate((a) => world.view(...a), args);
	else if (cmd === "eval") console.log(JSON.stringify(await page.evaluate((js) => eval(js), args)));
	else if (cmd === "wait") await page.evaluate((s) => world.fast(null, null, s), args);
	else console.log(cmd, "→", JSON.stringify(await page.evaluate(([c, a]) => world.fast(c, a), [cmd, args])));
}
await browser.close();
server.close();
