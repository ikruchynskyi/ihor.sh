// The 2D studio page: a cute stage with one character, a picker for characters and clips, a scrubber, faces, a line to
// say, and the link to server.mjs (an LLM's MCP calls arrive as commands). window.studio is the same API for scripts
// (tools/shot.mjs): fast-forwarded commands, snapshots and contact sheets.
import * as THREE from "three";
import { Puppet, POSES } from "./puppet.js";

const q = new URLSearchParams(location.search);
const headless = q.has("headless");
document.body.classList.toggle("headless", headless);
document.body.classList.toggle("ui0", q.get("ui") === "0");
document.body.classList.toggle("transparent", q.get("bg") === "transparent");
const $ = (id) => document.getElementById(id);
const getJSON = async (url) => (await fetch(url, { cache: "no-store" })).json();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

let puppet = null, clips = {}, chosen = null, t = 0, playing = true, speed = 1, live = false;
function fit() {
	renderer.setSize(innerWidth, innerHeight);
	const h = (puppet?.height ?? 1000) * 1.32, w = h * (innerWidth / innerHeight);
	Object.assign(camera, { left: -w / 2, right: w / 2, top: h * 0.86, bottom: -h * 0.14 });
	camera.updateProjectionMatrix();
}
addEventListener("resize", fit);

async function loadClips() {
	Object.assign(POSES, await getJSON("api/poses")); // named poses clips can start from ("use")
	clips = await getJSON("api/clips");
	puppet?.setClips(clips);
	$("clip").replaceChildren(...Object.keys(clips).filter((n) => n !== "idle").map((n) => new Option(n.replace(/_/g, " "), n)));
	if (chosen && clips[chosen]) $("clip").value = chosen;
}
async function loadCharacter(name) {
	const p = await new Puppet(scene).load(`characters/${name}`);
	if (puppet) scene.remove(puppet.root);
	puppet = p;
	puppet.name = name;
	puppet.onEvent = (e) => { if (e.say) say(e.say); if (e.face) puppet.setFace(e.face, e.seconds ?? 2); };
	puppet.setClips(clips);
	puppet.setBase("idle");
	$("name").textContent = puppet.rig.name ?? name;
	$("about").textContent = puppet.rig.about ?? "";
	$("character").value = name;
	$("faces").replaceChildren(...Object.keys(puppet.faces).map((f) => {
		const b = document.createElement("button");
		b.type = "button"; b.textContent = f === "base" ? "🙂" : f; b.title = `face: ${f}`;
		b.onclick = () => puppet.setFace(f, f === "base" ? 0 : 4);
		return b;
	}));
	fit();
	for (let i = 0; i < 20; i++) puppet.update(1 / 30); // springs settle
	return puppet;
}
function choose(name) {
	if (!clips[name]) return;
	chosen = name; t = 0; live = false;
	$("clip").value = name;
	history.replaceState(null, "", `?${new URLSearchParams({ ...Object.fromEntries(q), character: puppet?.name ?? "", clip: name })}`);
}

// ---- speech bubble ----
let saying = null;
async function say(text, face) {
	text = String(text ?? "").slice(0, 200);
	const secs = Math.min(10, Math.max(1.5, 0.8 + text.length * 0.06));
	saying = { text, until: puppet.time + secs };
	$("bubble").textContent = text;
	$("bubble").classList.add("show");
	puppet.talk = secs - 0.3;
	if (face) puppet.setFace(face, secs + 1);
	await after(secs);
	if (saying?.text === text) { $("bubble").classList.remove("show"); saying = null; }
	return `said "${text}"`;
}
const waits = [];
const after = (s) => new Promise((r) => waits.push({ at: puppet.time + s, r }));

// ---- commands: the MCP tools that act on the stage (server.mjs), and the bar's controls ----
const COMMANDS = {
	async play({ clip, times = 1 }) {
		if (!clips[clip]) throw new Error(`no clip "${clip}"; clips: ${Object.keys(clips).join(", ")}`);
		live = true; puppet.pinned = null;
		const r = await puppet.play(clip, { times });
		return `${clip}: ${r}`;
	},
	stop() { puppet.stop(); return "stopping"; },
	face({ name, seconds = 4 }) {
		if (!puppet.faces[name]) throw new Error(`faces: ${Object.keys(puppet.faces).join(", ")}`);
		puppet.setFace(name, seconds); return `face ${name}`;
	},
	say: ({ text, face }) => say(text, face),
	async character({ name }) { await loadCharacter(name); return `on stage: ${name}`; },
	reload: async () => { // a file changed: new characters join the picker, and clips and the one on stage load again
		const names = await getJSON("api/characters");
		$("character").replaceChildren(...names.map((n) => new Option(n, n)));
		await loadClips();
		await loadCharacter(names.includes(puppet.name) ? puppet.name : names[0]);
		return "reloaded";
	},
	snapshot() { frame(0); return { image: renderer.domElement.toDataURL("image/png") }; },
	sheet: (args) => ({ image: sheet(args) }),
	state: () => ({ character: puppet.name, faces: Object.keys(puppet.faces), clips: Object.keys(clips), playing: puppet.action?.clip.name ?? (live ? null : chosen), saying: saying?.text ?? null }),
};
async function run(cmd, args = {}) {
	if (!COMMANDS[cmd]) throw new Error(`unknown command ${cmd}`);
	$("status").textContent = `▶ ${cmd}`;
	try { return await COMMANDS[cmd](args ?? {}); } finally { $("status").textContent = ""; }
}

// ---- a contact sheet of a clip: frames over time, for agents to check their work ----
function sheet({ clip, frames = 10, cell = 180 }) {
	const c = puppet.clips[clip];
	if (!c) throw new Error(`no clip "${clip}"`);
	const W = renderer.domElement.width, H = renderer.domElement.height, ch = Math.round(cell * 1.4);
	const out = document.createElement("canvas");
	out.width = cell * Math.min(frames, 8); out.height = ch * Math.ceil(frames / 8) + 4;
	const g = out.getContext("2d");
	g.fillStyle = "#fff4fa"; g.fillRect(0, 0, out.width, out.height);
	const keep = { pinned: puppet.pinned, action: puppet.action };
	puppet.action = null;
	const times = Array.from({ length: frames }, (_, i) => (c.duration * i) / (c.loop ? frames : frames - 1));
	for (let k = 0; k < frames; k++) {
		puppet.pinned = { clip: c, t: times[k] };
		puppet.update(0); // the puppet runs her motion up to this moment, exactly as it plays
		renderer.render(scene, camera);
		const sw = H * (cell / ch), x = (k % 8) * cell, y = Math.floor(k / 8) * ch;
		g.drawImage(renderer.domElement, (W - sw) / 2, 0, sw, H, x, y, cell, ch);
		g.fillStyle = "#7a6290"; g.font = "13px system-ui"; g.fillText(`${times[k].toFixed(2)} s`, x + 6, y + 16);
	}
	Object.assign(puppet, keep);
	return out.toDataURL("image/jpeg", 0.88);
}

// A clip with "fps" (e.g. 12: anime "on twos") shows a new drawing only on its own frames, holding each one in
// between; everything still moves underneath at full rate.
let shownTick;
const newDrawing = (c, ct) => { const tick = c?.fps ? Math.floor(ct * c.fps) : NaN, show = tick !== shownTick; shownTick = tick; return show; };

// ---- the loop ----
function frame(dt) {
	if (!puppet) return;
	for (let i = waits.length - 1; i >= 0; i--) if (puppet.time >= waits[i].at) waits.splice(i, 1)[0].r();
	if (!live && chosen) {
		const c = puppet.clips[chosen];
		if (playing) { t += dt * speed; if (t > c.duration) t = c.loop ? t % c.duration : 0; }
		puppet.pinned = { clip: c, t };
		$("scrub").value = t / c.duration;
		$("time").textContent = `${t.toFixed(2)} / ${c.duration.toFixed(2)} s`;
	} else if (live) $("time").textContent = puppet.action ? `${puppet.action.clip.name}` : "";
	puppet.update(dt * (live || playing ? speed : 0));
	const c = live ? puppet.action?.clip : puppet.clips[chosen];
	if (newDrawing(c, live ? puppet.action?.t : t) || !dt) renderer.render(scene, camera);
	const head = puppet.bones.neck.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, puppet.height * 0.42, 0)).project(camera);
	$("bubble").style.left = `${(head.x + 1) * 50}%`;
	$("bubble").style.top = `${Math.max(12, (1 - head.y) * 50)}%`;
}

// ---- start ----
try {
	const names = await getJSON("api/characters");
	$("character").replaceChildren(...names.map((n) => new Option(n, n)));
	await loadClips();
	await loadCharacter(q.get("character") && names.includes(q.get("character")) ? q.get("character") : names[0]);
	if (q.get("clip")) choose(q.get("clip"));
	else if (!headless) choose(Object.keys(clips).find((n) => n !== "idle"));
} catch (e) { window.studioError = String(e?.stack ?? e); throw e; }

$("character").onchange = () => loadCharacter($("character").value);
$("clip").onchange = () => choose($("clip").value);
const setPlaying = (on) => { playing = on; $("play").textContent = on ? "⏸" : "▶"; $("play").setAttribute("aria-pressed", on); };
$("play").onclick = () => { if (live) { live = false; choose($("clip").value); } setPlaying(!playing); };
addEventListener("keydown", (e) => { if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") { e.preventDefault(); $("play").click(); } });
$("scrub").oninput = () => { if (live) { live = false; choose($("clip").value); } setPlaying(false); t = +$("scrub").value * puppet.clips[chosen].duration; };
for (const b of document.querySelectorAll("[data-speed]")) b.onclick = () => { speed = +b.dataset.speed; for (const o of document.querySelectorAll("[data-speed]")) o.setAttribute("aria-pressed", o === b); };
$("say").onkeydown = (e) => { if (e.key === "Enter" && $("say").value.trim()) { say($("say").value.trim()); $("say").value = ""; } };

const timer = new THREE.Timer();
renderer.setAnimationLoop(headless ? null : () => { timer.update(); frame(Math.min(timer.getDelta(), 0.1)); });
if (!headless) {
	const events = new EventSource("events");
	events.onmessage = async (e) => {
		const m = JSON.parse(e.data);
		if (m.reload) { await COMMANDS.reload(); return; }
		let result, error;
		try { result = await run(m.cmd, m.args); } catch (err) { error = String(err.message ?? err); }
		fetch("done", { method: "POST", body: JSON.stringify({ id: m.id, result, error }) });
	};
}

window.studio = {
	THREE, scene, camera, renderer, run, get puppet() { return puppet; },
	shot() { frame(0); return renderer.domElement.toDataURL("image/png"); },
	// one frame of a clip for a video: call with i = 0, 1, 2… in order (her springs run on from the frame before)
	frameAt(clip, i, fps = 25) {
		const c = puppet.clips[clip];
		if (!c) throw new Error(`no clip "${clip}"`);
		puppet.action = null;
		if (i === 0) puppet.simAt = null; // start from her exact first pose
		puppet.pinned = { clip: c, t: Math.min(c.duration, i / fps) };
		puppet.update(1 / fps);
		if (newDrawing(c, puppet.pinned.t) || i === 0) renderer.render(scene, camera);
		return renderer.domElement.toDataURL("image/png");
	},
	sheet,
	async fast(cmd, args, seconds) { // a command with time fast-forwarded at 30 fps (or just `seconds` passing)
		let done = !cmd, result, error;
		if (cmd) run(cmd, args).then((r) => { done = true; result = r; }, (e) => { done = true; error = e; });
		for (let i = 0; i < 30 * 120 && (!done || seconds > 0); i++) {
			frame(1 / 30);
			if (seconds !== undefined) seconds -= 1 / 30;
			if (i % 10 === 0) await new Promise((r) => setTimeout(r));
		}
		if (error) throw error;
		return result?.image ? "(image)" : result;
	},
};
window.studioReady = true;
