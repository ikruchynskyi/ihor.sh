// Mochi Studio's world: the room, Mochi and the dog, the camera director, speech, the control panel, and the command
// link to server.mjs (an LLM's MCP calls arrive here as commands; window.world.fast runs the same commands for
// scripts with time fast-forwarded).
import * as THREE from "three";
import { makeStage, loadActor, loadClips, sheet, getJSON } from "./stage.js";
import { buildRoom, spot } from "./room.js";
import { Dog } from "./dog.js";
import { MOODS } from "./actor.js";

const q = new URLSearchParams(location.search);
const headless = q.has("headless");
document.body.classList.toggle("headless", headless);
const $ = (id) => document.getElementById(id);
const stage = makeStage("#f3e6d8");
const { renderer, scene, camera } = stage;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const D = Math.PI / 180;

let mochi, room, dog;
try {
	room = await buildRoom(scene, await getJSON(`content/rooms/${q.get("room") ?? "cozy"}.json`), stage.sun);
	[mochi, dog] = await Promise.all([loadActor(scene, q.get("character") ?? "mochi", q.get("vrm")), new Dog(scene, room).load(room.def.dog)]);
} catch (e) { window.worldError = String(e?.stack ?? e); throw e; }
stage.actor = mochi;
const start = room.def.start ?? {};
const place = (who, [x, z, turn = 0]) => { who.root.position.set(x, 0, z); who.root.rotation.y = turn * D; };
place(mochi, start.mochi ?? [0, 0, 0]);
mochi.heading = mochi.root.rotation.y;
place(dog, start.dog ?? [1, 0.5, 0]);
const BASE = new Set(["stand", "walk", "run", "sit"]); // poses she holds, not actions

// ---- what names mean: objects, the dog, the camera, or "x,z" ----
function resolve(name) {
	const n = String(name ?? "").trim().toLowerCase();
	if (n === "dog") return { kind: "dog", point: dog.position.clone().setY(0.4), x: dog.position.x, z: dog.position.z };
	if (n === "camera" || n === "you") return { kind: "camera", point: camera.position.clone() };
	const xy = n.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
	if (xy) return { kind: "point", x: +xy[1], z: +xy[2], point: V(+xy[1], 1.2, +xy[2]) };
	const o = room.objects.get(n) ?? room.props.get(n);
	if (!o) throw new Error(`no "${name}" here; try: ${[...room.objects.keys()].join(", ")}, dog`);
	const s = spot(room, n), c = new THREE.Box3().setFromObject(o.node).getCenter(V());
	return { kind: "object", id: n, entry: o, ...s, point: c };
}
const near = (x, z, d) => Math.hypot(mochi.root.position.x - x, mochi.root.position.z - z) <= d;
async function goNearDog(d = 0.7) {
	const p = dog.position, m = mochi.root.position, dist = Math.hypot(p.x - m.x, p.z - m.z) || 1;
	if (dist > d + 0.25) await mochi.walkTo(room, p.x + ((m.x - p.x) / dist) * d, p.z + ((m.z - p.z) / dist) * d);
	await mochi.turnTo(Math.atan2(dog.position.x - mochi.root.position.x, dog.position.z - mochi.root.position.z));
}

// ---- events inside clips: grabbing and putting down props, the dog being petted ----
mochi.onEvent = (e) => {
	if (e.grab) { const p = room.props.get(e.grab); if (p) mochi.hold(p, e.hand ?? "right", e.offset, e.turn); }
	if (e.put) mochi.drop();
	if (e.dog === "petted") dog.petted(e.seconds ?? 3);
	if (e.say) say(e.say);
};

// ---- speech: a bubble over her head, her mouth moving, and (if switched on) a voice ----
let voiceOn = false;
try { voiceOn = localStorage.getItem("mochi-voice") === "1"; } catch { /* private mode */ }
let saying = null;
async function say(text, mood) {
	text = String(text ?? "").slice(0, 300);
	const secs = Math.min(12, Math.max(1.6, 0.9 + text.length * 0.06));
	if (MOODS.includes(mood)) mochi.setMood(mood, secs + 1.5);
	saying = { text, until: mochi.time + secs };
	$("bubble").textContent = text;
	$("bubble").classList.add("show");
	mochi.talk = secs - 0.4;
	if (voiceOn && !headless && "speechSynthesis" in window) {
		const v = mochi.def.voice ?? {}, u = new SpeechSynthesisUtterance(text);
		Object.assign(u, { lang: v.lang ?? "en-US", pitch: v.pitch ?? 1.3, rate: v.rate ?? 1.05 });
		speechSynthesis.cancel(); speechSynthesis.speak(u);
	}
	await mochi.after(secs);
	if (saying?.text === text) { $("bubble").classList.remove("show"); saying = null; }
	return `said "${text}"`;
}

// ---- the camera director: anime shots that cut when the shot changes and glide while it holds ----
const director = { shot: "auto", current: "", pos: V(), look: V(), want: { pos: V(), look: V() } };
function inside(p) { const b = room.bounds; return p.x > b.x0 + 0.25 && p.x < b.x1 - 0.25 && p.z > b.z0 + 0.3 && p.z < b.z1 + 2.5 && p.y < b.H - 0.15; }
function frame(shot) {
	const m = mochi.root.position, f = mochi.root.rotation.y, head = mochi.raw("head").getWorldPosition(V());
	const fwd = V(Math.sin(f), 0, Math.cos(f)), side = V(Math.cos(f), 0, -Math.sin(f));
	const around = (dist, y, aside, lookY) => { // in front of her; if that's in a wall, from her sides, then from behind
		for (const [f, s] of [[1, aside], [1, -aside], [0.35, 0.9], [0.35, -0.9], [-1, aside]]) {
			const p = m.clone().addScaledVector(fwd, dist * f).addScaledVector(side, dist * s * (f === 1 || f === -1 ? 1 / dist : 1)).setY(y);
			if (inside(p)) return { pos: p, look: m.clone().setY(lookY) };
		}
		return frame("wide");
	};
	switch (shot) {
		// framed on her head, wherever it is (standing, sitting, crouching)
		case "closeup": return around(1.0, head.y + 0.03, 0.25, head.y - 0.03);
		case "medium": return around(2.5, head.y - 0.25, 0.6, head.y - 0.5);
		case "follow": return { pos: m.clone().addScaledVector(fwd, -2.2).addScaledVector(side, 0.9).setY(1.6), look: m.clone().addScaledVector(fwd, 1).setY(0.9) };
		case "two_shot": {
			const mid = m.clone().lerp(dog.position, 0.5), d = dog.position.clone().sub(m).setY(0), n = V(-d.z, 0, d.x).normalize();
			for (const s of [1, -1]) { const p = mid.clone().addScaledVector(n, 2.3 * s).setY(1.25); if (inside(p)) return { pos: p, look: mid.clone().setY(0.55) }; }
			return frame("wide");
		}
		default: { // wide: from the open front corner of the room, looking past her at the room
			const b = room.bounds;
			return { pos: V(b.x1 - 0.5, 2.05, b.z1 + 0.6), look: V(-0.4, 0.75, -0.9).lerp(m.clone().setY(0.9), 0.45) };
		}
	}
}
function autoShot() {
	if (saying) return "closeup";
	if (mochi.action?.clip.needs === "dog") return "two_shot";
	if (mochi.path.length) return "wide";
	if (mochi.action) return "medium";
	return mochi.seat ? "medium" : "medium";
}
function direct(dt, snap = false) {
	if (director.shot === "fixed") return; // a script placed the camera (world.view)
	const shot = director.shot === "auto" ? autoShot() : director.shot;
	const want = frame(shot);
	if (shot !== director.current || snap) { // a cut
		director.current = shot;
		director.pos.copy(want.pos); director.look.copy(want.look);
	} else {
		const k = Math.min(1, dt * (shot === "follow" ? 3 : 1.6));
		director.pos.lerp(want.pos, k); director.look.lerp(want.look, k);
	}
	camera.position.copy(director.pos);
	camera.lookAt(director.look);
}

// ---- the commands (the MCP tools in server.mjs; the panel's buttons) ----
const describeRoom = () => [...room.objects.entries()].filter(([, o]) => o.def.about).map(([id, o]) => ({ id, about: o.def.about, ...(o.def.seat ? { can: "sit" } : {}) }));
const COMMANDS = {
	look: () => ({
		mochi: { at: [+mochi.root.position.x.toFixed(2), +mochi.root.position.z.toFixed(2)], doing: mochi.doing, mood: mochi.mood.name, holding: mochi.held?.prop.def.id ?? null, saying: saying?.text ?? null },
		dog: dog.describe(),
		room: { about: room.def.about, objects: describeRoom(), props: [...room.props.entries()].map(([id, p]) => ({ id, about: p.def.about, on: p.def.on })) },
		clips: Object.fromEntries(Object.entries(mochi.clips).filter(([n]) => !BASE.has(n)).map(([n, c]) => [n, c.about ?? ""])),
		moods: MOODS, camera: director.shot,
	}),
	async walk_to({ target, run }) {
		const t = resolve(target);
		if (t.kind === "dog") await goNearDog(0.75);
		else if (t.kind === "camera") throw new Error("she can't walk to the camera");
		else await mochi.walkTo(room, t.x, t.z, t.face, { run });
		return `arrived at ${target}`;
	},
	async sit({ on }) {
		const t = resolve(on);
		const s = t.id && spot(room, t.id, "seat");
		if (!s || s.height === undefined) throw new Error(`${on} isn't a seat; seats: ${describeRoom().filter((o) => o.can).map((o) => o.id).join(", ")}`);
		await mochi.sitOn(room, { ...s, id: t.id });
		return `sitting on the ${on}`;
	},
	async stand_up() { await mochi.standUp(); return "standing"; },
	async act({ clip, times = 1 }) {
		const c = mochi.clips[clip];
		if (!c) throw new Error(`no clip "${clip}"; clips: ${Object.keys(mochi.clips).filter((n) => !BASE.has(n)).join(", ")}`);
		if (BASE.has(clip)) throw new Error(`${clip} is a pose: use walk_to, sit or stand_up`);
		if (c.needs === "dog") { await goNearDog(c.near ?? 0.6); mochi.lookAt(dog.position.clone().setY(0.35)); }
		else if (c.needs) {
			const t = resolve(c.needs), host = t.entry.def.on ? resolve(t.entry.def.on) : t;
			if (!near(t.point.x, t.point.z, c.near ?? 1)) { await mochi.walkTo(room, host.x, host.z, host.face); }
			mochi.lookAt(t.point);
		}
		await mochi.play(clip, { times });
		mochi.lookAt(null);
		return `played ${clip}`;
	},
	say: ({ text, mood }) => say(text, mood),
	feel({ mood, seconds = 4 }) {
		if (!MOODS.includes(mood)) throw new Error(`moods: ${MOODS.join(", ")}`);
		mochi.setMood(mood, seconds);
		return `feeling ${mood}`;
	},
	look_at({ target }) {
		if (!target || target === "none") { mochi.lookAt(null); return "looking ahead"; }
		const t = resolve(target);
		mochi.lookAt(t.kind === "dog" ? dog.position : t.kind === "camera" ? camera.position : t.point); // live points follow
		return `looking at ${target}`;
	},
	camera({ shot }) {
		if (!["auto", "wide", "medium", "closeup", "two_shot", "follow"].includes(shot)) throw new Error("shots: auto, wide, medium, closeup, two_shot, follow");
		director.shot = shot;
		return `camera: ${shot}`;
	},
	async dog({ action, target }) {
		await dog.do(action, mochi, target ? resolve(target) : null);
		return `the dog: ${action}`;
	},
	snapshot() { direct(0); renderer.render(scene, camera); return { image: renderer.domElement.toDataURL("image/jpeg", 0.85) }; },
};
async function run(cmd, args = {}) {
	if (!COMMANDS[cmd]) throw new Error(`unknown command ${cmd}`);
	status(`${cmd} ${JSON.stringify(args)}`);
	try { return await COMMANDS[cmd](args ?? {}); } finally { status(""); }
}
dog.onBark = () => { if (!saying) bubbleDog = mochi.time + 1; };
let bubbleDog = 0;

// ---- the loop ----
function step(dt) {
	mochi.update(dt);
	dog.update(dt, mochi);
	direct(dt);
}
function bubbles() { // her bubble over her head; the dog's "Woof!"
	const head = mochi.raw("head").getWorldPosition(V()).add(V(0, 0.32, 0)).project(camera);
	const b = $("bubble");
	b.style.left = `${Math.max(12, Math.min(88, (head.x + 1) * 50))}%`;
	b.style.top = `${Math.max(16, Math.min(80, (1 - head.y) * 50))}%`;
	const w = $("woof"), dp = dog.position.clone().setY(0.75).project(camera);
	w.style.left = `${(dp.x + 1) * 50}%`; w.style.top = `${(1 - dp.y) * 50}%`;
	w.classList.toggle("show", mochi.time < bubbleDog);
}
const timer = new THREE.Timer();
direct(0, true);
renderer.setAnimationLoop(headless ? null : () => {
	timer.update();
	step(Math.min(timer.getDelta(), 0.1));
	bubbles();
	renderer.render(scene, camera);
});

// ---- the link to server.mjs: commands from the LLM, reloads when content files change ----
function status(text) { const s = $("status"); if (s) s.textContent = text ? `▶ ${text}` : ""; }
if (!headless) {
	const events = new EventSource("events");
	events.onmessage = async (e) => {
		const m = JSON.parse(e.data);
		if (m.reload) {
			if (m.reload.startsWith("clips")) mochi.setClips(await loadClips());
			else location.reload();
			return;
		}
		let result, error;
		try { result = await run(m.cmd, m.args); } catch (err) { error = String(err.message ?? err); }
		fetch("done", { method: "POST", body: JSON.stringify({ id: m.id, result, error }) });
	};
}

// ---- the panel: everything the LLM can do, as buttons ----
function panel() {
	const p = $("panel"), btn = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = () => fn().catch((e) => status(`⚠ ${e.message}`)); return b; };
	const section = (title, ...buttons) => { const h = document.createElement("h3"); h.textContent = title; p.append(h, ...buttons); };
	p.replaceChildren();
	const objs = describeRoom();
	section("Sit", ...objs.filter((o) => o.can).map((o) => btn(o.id, () => run("sit", { on: o.id }))), btn("stand up", () => run("stand_up")));
	section("Do", ...Object.keys(mochi.clips).filter((n) => !BASE.has(n)).map((n) => btn(n.replace(/_/g, " "), () => run("act", { clip: n }))));
	section("Walk to", ...objs.map((o) => btn(o.id.replace(/_/g, " "), () => run("walk_to", { target: o.id }))), btn("the dog", () => run("walk_to", { target: "dog" })));
	section("Dog", ...["come", "sit", "lie", "wander", "jump", "bark"].map((a) => btn(a, () => run("dog", { action: a }))));
	section("Camera", ...["auto", "wide", "medium", "closeup", "two_shot", "follow"].map((s) => btn(s.replace("_", " "), () => run("camera", { shot: s }))));
	const input = document.createElement("input");
	Object.assign(input, { placeholder: "Something for her to say…", maxLength: 300 });
	input.style.cssText = "width: 100%; box-sizing: border-box; margin: 2px 0; padding: 4px; border-radius: 6px; border: 1px solid #6b5a99; background: #1d1a24; color: inherit;";
	input.onkeydown = (e) => { if (e.key === "Enter" && input.value.trim()) { run("say", { text: input.value.trim(), mood: "happy" }); input.value = ""; } };
	const voice = btn(voiceOn ? "🔊 voice on" : "🔈 voice off", async () => {
		voiceOn = !voiceOn; voice.textContent = voiceOn ? "🔊 voice on" : "🔈 voice off";
		try { localStorage.setItem("mochi-voice", voiceOn ? "1" : "0"); } catch { /* private mode */ }
	});
	section("Say", input, voice);
}
if (!headless) {
	panel();
	const toggle = () => { $("panel").hidden = !$("panel").hidden; };
	$("toggle").onclick = toggle;
	addEventListener("keydown", (e) => { if (e.key === "h" && e.target.tagName !== "INPUT") toggle(); });
}

// For scripts (tools/shot.mjs) and the console.
window.world = {
	THREE, scene, camera, renderer, mochi, dog, room, director, run,
	view(pos, look) { director.shot = "fixed"; camera.position.set(...pos); camera.lookAt(...look); },
	shot() { if (director.shot !== "fixed") direct(0); bubbles(); renderer.render(scene, camera); return renderer.domElement.toDataURL("image/jpeg", 0.88); },
	sheet: (args) => sheet(stage, args),
	// run a command with time fast-forwarded at 30 fps (or just let `seconds` pass) and return its result
	async fast(cmd, args, seconds) {
		let done = !cmd, result, error;
		if (cmd) run(cmd, args).then((r) => { done = true; result = r; }, (e) => { done = true; error = e; });
		for (let i = 0; i < 30 * 120 && (!done || seconds > 0); i++) {
			step(1 / 30);
			if (seconds !== undefined) seconds -= 1 / 30;
			if (i % 10 === 0) await new Promise((r) => setTimeout(r));
		}
		if (error) throw error;
		return typeof result === "object" && result?.image ? "(image)" : result;
	},
};
window.worldReady = true;
