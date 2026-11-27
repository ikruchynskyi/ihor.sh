#!/usr/bin/env node
// See the studio without a screen: runs commands in a headless browser (time fast-forwarded) and saves pictures, so
// agents can check what they made. Each step is a JSON object with one key: a studio command (play, face, say,
// character, stop) or one of these:
//   {"wait": 2}                              let 2 s pass
//   {"snapshot": "name"}                     save the stage as <out>/name.png
//   {"sheet": {"clip": "wave", "frames": 12}}   a contact sheet of a clip -> <out>/sheet-wave.jpg
//   {"video": {"clip": "wave", "fps": 25, "reference": "/path/ref.gif"}}   <out>/wave.mp4, and with a reference GIF or
//                                            video also <out>/wave-vs-reference.mp4 and .gif (side by side, same time)
//   {"labels": "name"}                       which bone each part of the picture follows (a colour per bone);
//                                            {"labels": {"name": "x", "back": true}} for her back view
//   {"eval": "js"}                           run JavaScript in the page (window.studio) and print the result
// Options: --out DIR (default studio2d/shots), --size WxH (default 720x900), --query "character=mochi" (page options).
//   node studio2d/tools/shot.mjs --query character=mochi '{"sheet":{"clip":"cheer_dance"}}'
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { start } from "../server.mjs";

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv.splice(i, 2)[1]; };
const out = opt("--out", path.join(path.dirname(new URL(import.meta.url).pathname), "..", "shots")), [W, H] = opt("--size", "720x900").split("x").map(Number), query = opt("--query", "");
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
await page.waitForFunction(() => window.studioReady || window.studioError, null, { timeout: 120_000 });
const err = await page.evaluate(() => window.studioError);
if (err) { console.error("studio failed:", err); process.exit(1); }

await mkdir(out, { recursive: true });
async function video({ clip, fps = 25, reference, seconds }) {
	const { execFileSync } = await import("node:child_process");
	const dur = seconds ?? (await page.evaluate((c) => studio.puppet.clips[c]?.duration, clip));
	if (!dur) throw new Error(`no clip "${clip}"`);
	const dir = path.join(out, `frames-${clip}`);
	await mkdir(dir, { recursive: true });
	const n = Math.round(dur * fps);
	for (let i = 0; i < n; i++) {
		const url = await page.evaluate(([c, k, f]) => studio.frameAt(c, k, f), [clip, i, fps]);
		await writeFile(path.join(dir, `${String(i).padStart(4, "0")}.png`), Buffer.from(url.split(",")[1], "base64"));
	}
	const mp4 = path.join(out, `${clip}.mp4`), bg = "0xfff0f7";
	execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${bg}:s=${W}x${H}:r=${fps}`, "-framerate", String(fps), "-i", path.join(dir, "%04d.png"),
		"-filter_complex", "[0][1]overlay=shortest=1,format=yuv420p", "-c:v", "libx264", "-crf", "18", mp4]);
	console.log("saved", mp4);
	if (!reference) return;
	const both = path.join(out, `${clip}-vs-reference.mp4`), gif = path.join(out, `${clip}-vs-reference.gif`);
	execFileSync("ffmpeg", ["-v", "error", "-y", "-i", reference, "-i", mp4, "-filter_complex",
		`[0:v]fps=${fps},scale=-2:${H},setsar=1,pad=iw+20:ih:10:0:black[r];[1:v]scale=-2:${H},setsar=1[o];[r][o]hstack=shortest=1,format=yuv420p`, "-c:v", "libx264", "-crf", "20", both]);
	execFileSync("ffmpeg", ["-v", "error", "-y", "-i", both, "-vf", "fps=12.5,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse", gif]);
	console.log("saved", both); console.log("saved", gif);
}
let n = 0;
const save = async (name, dataUrl) => {
	const f = path.join(out, `${name || `shot-${++n}`}.${dataUrl.startsWith("data:image/png") ? "png" : "jpg"}`);
	await writeFile(f, Buffer.from(dataUrl.split(",")[1], "base64"));
	console.log("saved", f);
};
for (const step of steps) {
	const [[cmd, args]] = Object.entries(step);
	if (cmd === "snapshot") await save(args, await page.evaluate(() => studio.shot()));
	else if (cmd === "video") await video(args);
	else if (cmd === "labels") await save(args?.name ?? (args || "labels"), await page.evaluate((back) => (back ? studio.puppet.back : studio.puppet).labelsImage(), !!args?.back));
	else if (cmd === "sheet") await save(`sheet-${args.clip}${args.focus && args.focus !== "body" ? "-" + args.focus : ""}`, await page.evaluate((a) => studio.sheet(a), args));
	else if (cmd === "eval") console.log(JSON.stringify(await page.evaluate((js) => eval(js), args)));
	else if (cmd === "wait") await page.evaluate((s) => studio.fast(null, null, s), args);
	else console.log(cmd, "→", JSON.stringify(await page.evaluate(([c, a]) => studio.fast(c, a), [cmd, args])));
}
await browser.close();
server.close();
