// Mochi, Yomu chat's Live2D partner (from mochi-vtuber/web/overlay.js). The chat page (yomu/chat.html) sends
// commands with postMessage; the local model picks her mood and emote for each reply (server/yomu-chat.ts).
// Runs inside an iframe with pointer-events: none, so it never takes clicks from the page.
//
// Layers: moods (motion + expression, held >= 6 s), emotes (a short anime reaction: face params,
// manga symbols around the head, camera close-up, shake), a speech bubble, and a face camera that
// zooms in while she talks.

const MODEL_BASE = "/yomu/mochi/model/";
const MIN_HOLD_MS = 6000;      // a mood stays at least this long before the next one shows
const DEFAULT_HOLD_MS = 12000; // then the avatar falls back to the base mood
const SAY_MS_PER_CHAR = 70;
const FACE = { x: 0.5, y: 0.17 };   // face centre as a fraction of the model's canvas (calibrated)
const FACE_R = 0.085;              // face radius as a fraction of the model's canvas width
const BAND = 0.34;                 // top part of the frame kept free for her speech bubble
const ANTICS_AFTER_MS = 18000;     // quiet this long -> a random hyper antic (she can't sit still)

// motion: looped while the mood lasts; exp: expression files (added); params: offsets (added);
// blink: false stops idle blinking.
const MOODS = {
	// hyper: the default. Gremlin energy: bobbing head, darting eyes, a grin, little hops.
	hyper:   { energy: 1, params: { ParamEyeLSmile: 0.3, ParamEyeRSmile: 0.3, ParamMouthForm: 0.9, ParamMouthOpenY: 0.25, ParamCheek: 0.3 } },
	idle:    { energy: 0.4 },
	happy:   { params: { ParamCheek: 1, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1 } },
	smug:    { params: { ParamEyeLSmile: 0.7, ParamEyeRSmile: 0.7, ParamMouthForm: 0.8, ParamAngleZ: 9, ParamBodyAngleZ: 4 } },
	curious: { motion: "haoqi" },
	cheer:   { motion: "qizi" },
	proud:   { exp: ["qizi1"], params: { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1 } },
	no:      { motion: "yaotou" },
	angry:   { motion: "yaotou", exp: ["angry"] },
	scared:  { motion: "zhentou" },
	hug:     { exp: ["baozhen"], params: { ParamCheek: 1 } },
	cry:     { motion: "zhentou", exp: ["cry"] },
	shocked: { exp: ["white eyes"], params: { ParamMouthOpenY: 0.8 } },
	soul:    { motion: "linghun", exp: ["white eyes"] },
	sleepy:  { motion: "keshui", blink: false },
};

// Anime reaction emotes. deco: manga symbols placed in face-radius units from the face centre
// (x right, y down); zoom: camera close-up; shake: px of screen shake; ms: how long it lasts.
const EMOTES = {
	rage:     { exp: ["angry"], params: { ParamBrowLY: -1, ParamBrowRY: -1, ParamMouthForm: -1 }, zoom: 2.1, shake: 7, ms: 4500,
	            deco: [{ s: "💢", x: 1.0, y: -1.0, size: 1.1, a: "pulse" }, { s: "💢", x: -1.1, y: -0.7, size: 0.7, a: "pulse late" }] },
	sweat:    { params: { ParamEyeLSmile: 0.6, ParamEyeRSmile: 0.6, ParamMouthForm: -0.4, ParamAngleZ: -6 }, zoom: 1.7, ms: 4000,
	            deco: [{ s: "💦", x: 1.05, y: -0.7, size: 0.9, a: "drip" }] },
	shock:    { exp: ["white eyes"], params: { ParamMouthOpenY: 1, ParamBrowLY: 1, ParamBrowRY: 1 }, zoom: 2.4, snap: true, shake: 5, ms: 3500,
	            deco: [{ s: "‼", x: 1.15, y: -1.15, size: 1.3, a: "pop", cls: "red" }, { s: "!", x: -1.2, y: -1.0, size: 1.0, a: "pop late", cls: "red" }] },
	confused: { params: { ParamAngleZ: 16, ParamEyeBallX: 0.6, ParamMouthForm: -0.3 }, zoom: 1.5, ms: 4500,
	            deco: [{ s: "❓", x: 1.1, y: -1.1, size: 1.0, a: "bob" }, { s: "❔", x: 1.6, y: -0.5, size: 0.7, a: "bob late" }] },
	sob:      { exp: ["cry"], motion: "zhentou", params: { ParamMouthOpenY: 0.6, ParamMouthForm: -1 }, zoom: 1.9, ms: 5500,
	            deco: [{ s: "", x: -0.38, y: 0.05, size: 1, a: "river", cls: "river" }, { s: "", x: 0.38, y: 0.05, size: 1, a: "river late", cls: "river" }] },
	blush:    { exp: ["baozhen"], params: { ParamCheek: 1, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamAngleZ: -8 }, zoom: 1.8, ms: 4500,
	            // the cheeks flush in the model itself (ParamCheek); "///" drawn over them slid off as her face turned
	            deco: [{ s: "💓", x: 1.15, y: -0.85, size: 0.75, a: "pulse" }] },
	sparkle:  { params: { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.4, ParamCheek: 0.6 }, zoom: 1.7, ms: 4000,
	            deco: [{ s: "✨", x: -1.2, y: -0.9, size: 0.8, a: "twinkle" }, { s: "✨", x: 1.2, y: -0.4, size: 1.0, a: "twinkle late" },
	                   { s: "✦", x: 0.9, y: 0.9, size: 0.6, a: "twinkle", cls: "gold" }] },
	dead:     { motion: "linghun", exp: ["white eyes"], params: { ParamMouthOpenY: 0.5 }, zoom: 1.0, ms: 6000,
	            deco: [{ s: "👻", x: 0.3, y: -1.4, size: 1.0, a: "rise" }] },
	gloom:    { params: { ParamAngleY: -22, ParamEyeLOpen: -0.4, ParamEyeROpen: -0.4, ParamMouthForm: -1 }, zoom: 1.3, ms: 6000, tint: "gloom",
	            deco: [{ s: "", x: 0, y: -1.7, size: 1, a: "fade", cls: "gloomlines" }] },
	sleep:    { motion: "keshui", blink: false, zoom: 1.2, ms: 6000,
	            deco: [{ s: "Z", x: 1.0, y: -1.0, size: 0.9, a: "zz", cls: "zz" }, { s: "z", x: 1.4, y: -1.6, size: 0.6, a: "zz late", cls: "zz" }] },
	love:     { params: { ParamCheek: 1, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1 }, zoom: 1.6, ms: 4500,
	            deco: [{ s: "💕", x: 1.0, y: -0.9, size: 0.9, a: "rise" }, { s: "💗", x: -1.1, y: -0.5, size: 0.7, a: "rise late" }] },
	doya:     { params: { ParamEyeLSmile: 0.9, ParamEyeRSmile: 0.9, ParamMouthForm: 1, ParamAngleZ: 12, ParamAngleY: 10 }, zoom: 1.9, ms: 4000,
	            deco: [{ s: "ドヤァ", x: -1.5, y: -0.6, size: 1.0, a: "slam", cls: "doya" }, { s: "ドヤァ", x: 1.5, y: 0.2, size: 0.8, a: "slam late", cls: "doya" }] },
	hop:      { energy: 1.6, hops: 3, params: { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.6, ParamCheek: 0.5 }, zoom: 1.15, ms: 2200, deco: [] },
	paw:      { params: { ParamEyeLSmile: 0.8, ParamEyeRSmile: 0.8, ParamMouthForm: 1, ParamCheek: 0.5 }, zoom: 1.3, ms: 3500,
	            deco: [{ s: "🐾", x: 1.0, y: -0.6, size: 0.8, a: "rise" }, { s: "🐾", x: -1.0, y: -0.2, size: 0.6, a: "rise late" }] },
	purr:     { params: { ParamEyeLOpen: -0.7, ParamEyeROpen: -0.7, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamCheek: 1, ParamAngleZ: 10 }, blink: false, zoom: 1.6, ms: 4000,
	            deco: [{ s: "♪", x: 1.1, y: -0.9, size: 0.8, a: "rise", cls: "note" }, { s: "♫", x: -1.1, y: -0.6, size: 0.7, a: "rise late", cls: "note" }] },
	dots:     { params: { ParamEyeBallX: -0.5, ParamMouthForm: -0.2 }, zoom: 1.4, ms: 4500,
	            deco: [{ s: "", x: 1.25, y: -1.0, size: 1, a: "fade", cls: "dots" }] },
};
// Accessories drawn over the model, following the head: none now (a bell on her collar slid about as she moved, 2026-11-21)
const ACCESSORIES = {};
// her random antics when nobody talks (no にゃ: she is a catgirl, not a cat)
const ANTICS = ["sparkle", "doya", "love", "confused", "hop", "paw", "purr"];
const MOTIONS = ["haoqi", "keshui", "linghun", "qizi", "yaotou", "zhentou"];
const EXPRESSIONS = ["angry", "baozhen", "cry", "qizi1", "qizi2", "white eyes"];

const bubble = document.getElementById("bubble");
const tag = document.getElementById("tag");
const decoLayer = document.getElementById("deco");
const accLayer = document.getElementById("acc");
const stage = document.getElementById("stage");
let model, core;
// ?companion: the site companion in a page's corner (public/companion.js): always full body, no face close-ups
const q = new URLSearchParams(location.search);
// ?room: her room behind her (room.js; ?room=1–5 picks one, else the visitor's time of day picks)
const cfg = { model: "huohuo.model3.json", theme: "catgirl", companion: q.has("companion"), room: q.has("room") && !q.has("companion") };
if (cfg.room) MochiRoom.start(q.get("room"));
document.body.classList.toggle("companion", cfg.companion);
// reduced motion: a calm resting mood and no random antics
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
let base = calm ? "idle" : "hyper";
let current = { name: "idle", since: 0, until: Infinity };
let emote = null;          // {name, def, until, els}
let holdTimer = null;
let expData = {};          // expression name -> [{Id, Value}]
let weights = {};          // parameter id -> current added offset (eased)
let talkingUntil = 0;
let nextBlink = performance.now() + 2500;
let lastActivity = Date.now();
let antics = !calm;
const cam = { z: 1, tz: 1, speed: 0.08, shake: 0, baseScale: 1, baseX: 0, baseY: 0, hopT: 0, hops: 0 };
const eyes = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
// The head anchor: a face mesh whose two outermost vertices give the real head position and tilt
// every frame (head turn, tilt, body sway), so accessories stick to the head.
const head = { idx: -1, li: 0, ri: 0, restAngle: 0, restDx: 0, restDy: 0 };

async function load() {
	const url = MODEL_BASE + encodeURIComponent(cfg.model);
	const settings = await (await fetch(url)).json();
	settings.url = url;
	settings.FileReferences.Motions = { Idle: [{ File: cfg.idle || "Scene1.motion3.json" }] };
	for (const m of MOTIONS) settings.FileReferences.Motions[m] = [{ File: m + ".motion3.json" }];
	await Promise.all(EXPRESSIONS.map(async (e) => { // all at once: one by one they held her up seconds on a phone
		try {
			const j = await (await fetch(MODEL_BASE + encodeURIComponent(e + ".exp3.json"))).json();
			expData[e] = j.Parameters || [];
		} catch (_) { expData[e] = []; }
	}));
	// drawn at the screen's pixel density (at 1× she was blurry on phones and retina screens); capped at 2× for speed
	const app = new PIXI.Application({ view: stage, resizeTo: window, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true });
	model = await PIXI.live2d.Live2DModel.from(settings, { autoInteract: false });
	core = model.internalModel.coreModel;
	app.stage.addChild(model);
	fit();
	window.addEventListener("resize", fit);
	app.ticker.add(camera);

	model.internalModel.on("beforeModelUpdate", animate);
	model.internalModel.motionManager.on("motionFinish", () => {
		const m = (emote && emote.def.motion) || (MOODS[current.name] || {}).motion;
		if (m) model.motion(m, 0, 3);
	});
	for (const acc of ACCESSORIES[cfg.theme] || []) {
		const el = document.createElement("div");
		el.className = "acc";
		el.innerHTML = acc.html;
		el.acc = acc;
		accLayer.appendChild(el);
	}
	setTimeout(findHead, 600);
	setMood(base, Infinity);
	setInterval(idleAntics, 5000);
	listen();
}

// Pick the face mesh: the largest drawable centred near the face point with a face-like size.
function findHead() {
	const im = model.internalModel, w = im.width, h = im.height;
	const fx = w * FACE.x, fy = h * FACE.y;
	let best = null;
	for (let i = 0; i < im.coreModel.getDrawableCount(); i++) {
		const v = im.getDrawableVertices(i);
		if (!v || v.length < 6) continue;
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, li = 0, ri = 0;
		for (let k = 0; k < v.length; k += 2) {
			if (v[k] < x0) { x0 = v[k]; li = k / 2; }
			if (v[k] > x1) { x1 = v[k]; ri = k / 2; }
			y0 = Math.min(y0, v[k + 1]); y1 = Math.max(y1, v[k + 1]);
		}
		const bw = x1 - x0, bh = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
		if (bw < w * 0.08 || bw > w * 0.32 || bh < h * 0.03 || bh > h * 0.25) continue;
		if (Math.hypot(cx - fx, cy - fy) > w * 0.1) continue;
		if (!best || bw * bh > best.area) best = { i, li, ri, area: bw * bh };
	}
	if (!best) { console.warn("[vtuber] no face mesh found; accessories use the static face point"); return; }
	const v = im.getDrawableVertices(best.i);
	const L = [v[best.li * 2], v[best.li * 2 + 1]], R = [v[best.ri * 2], v[best.ri * 2 + 1]];
	Object.assign(head, { idx: best.i, li: best.li, ri: best.ri, restAngle: Math.atan2(R[1] - L[1], R[0] - L[0]),
		restDx: fx - (L[0] + R[0]) / 2, restDy: fy - (L[1] + R[1]) / 2 });
}

// Where the head really is now: face point (model px) and tilt (radians, 0 at rest).
function headPose() {
	const im = model.internalModel;
	if (head.idx < 0) return null;
	const v = im.getDrawableVertices(head.idx);
	const L = [v[head.li * 2], v[head.li * 2 + 1]], R = [v[head.ri * 2], v[head.ri * 2 + 1]];
	const a = Math.atan2(R[1] - L[1], R[0] - L[0]) - head.restAngle;
	const c = Math.cos(a), s = Math.sin(a);
	return { x: (L[0] + R[0]) / 2 + head.restDx * c - head.restDy * s,
	         y: (L[1] + R[1]) / 2 + head.restDx * s + head.restDy * c, a };
}

// In her room she's framed like a person in it, from about the knees up with her face under the bubble band (her whole
// body, small, stood on the desk or the bench like a doll); elsewhere her whole body stands on the frame's bottom.
const ROOM_SHOT = 1.75, ROOM_FACE_Y = 0.44;
function fit() {
	const w = model.internalModel.width, h = model.internalModel.height;
	cam.baseScale = Math.min(innerWidth / w, innerHeight * (1 - BAND) / h) * (cfg.room ? ROOM_SHOT : cfg.zoom || 1);
	cam.baseX = (innerWidth - w * cam.baseScale) / 2;
	cam.baseY = cfg.room ? innerHeight * ROOM_FACE_Y - h * FACE.y * cam.baseScale : innerHeight - h * cam.baseScale + (cfg.y || 0);
}

// The face camera: eases the zoom toward its target and keeps the face framed while zoomed.
function camera() {
	const w = model.internalModel.width, h = model.internalModel.height;
	const talking = performance.now() < talkingUntil;
	cam.tz = cfg.companion ? 1 : emote && emote.def.zoom ? emote.def.zoom : (talking ? 1.6 : 1);
	if (cfg.room) cam.tz = 1 + (cam.tz - 1) * .45; // she's close already: a gentler push in
	cam.z += (cam.tz - cam.z) * (emote && emote.def.snap ? 0.3 : cam.speed);
	const s = cam.baseScale * cam.z;
	const t = Math.min(1, Math.max(0, (cam.z - 1) / 0.8));
	const baseFaceX = cam.baseX + w * FACE.x * cam.baseScale, baseFaceY = cam.baseY + h * FACE.y * cam.baseScale;
	const faceX = baseFaceX + (innerWidth / 2 - baseFaceX) * t;
	const faceY = baseFaceY + (innerHeight * (BAND + (1 - BAND) * 0.4) - baseFaceY) * t;
	let sx = 0, sy = 0;
	// little hops: a few quick bounces when she's excited
	const en = energy();
	if (cam.hops > 0) {
		cam.hopT += 1 / 60;
		sy -= Math.abs(Math.sin(cam.hopT * Math.PI * 3.2)) * innerHeight * 0.035;
		if (cam.hopT * 3.2 >= cam.hops) { cam.hops = 0; cam.hopT = 0; }
	} else if (en >= 1 && Math.random() < 0.0025) { cam.hops = 2; cam.hopT = 0; }
	if (cam.shake > 0.2) {
		sx = (Math.random() - 0.5) * 2 * cam.shake; sy = (Math.random() - 0.5) * 2 * cam.shake;
		cam.shake *= 0.9;
	}
	model.scale.set(s);
	model.x = faceX - w * FACE.x * s + sx;
	model.y = faceY - h * FACE.y * s + sy;
	if (cfg.room) MochiRoom.camera(cam.z, faceX, faceY);
	// manga symbols and accessories ride along with the face
	const r = w * FACE_R * s;
	const pose = headPose();
	const hx = pose ? model.x + pose.x * s : faceX + sx, hy = pose ? model.y + pose.y * s : faceY + sy;
	const tilt = pose ? pose.a : 0;
	const swing = Math.sin(performance.now() / 260) * 12;
	for (const el of accLayer.children) {
		const a = el.acc, dx = a.x * r, dy = a.y * r;
		const px = hx + dx * Math.cos(tilt) - dy * Math.sin(tilt);
		const py = hy + dx * Math.sin(tilt) + dy * Math.cos(tilt);
		el.style.width = (a.w * r * 1.6) + "px";
		el.style.left = px + "px"; el.style.top = py + "px";
		el.style.transform = `translate(-50%, -50%) rotate(${a.rot + tilt * 180 / Math.PI + (a.swing ? swing : 0)}deg)`;
	}
	decoLayer.style.setProperty("--r", r + "px");
	for (const el of decoLayer.children) { // turned with the head's tilt, like the accessories (tears stay on her cheeks)
		const dx = Number(el.dataset.x) * r, dy = Number(el.dataset.y) * r;
		el.style.left = (hx + dx * Math.cos(tilt) - dy * Math.sin(tilt)) + "px";
		el.style.top = (hy + dx * Math.sin(tilt) + dy * Math.cos(tilt)) + "px";
	}
}

function energy() {
	if (emote) return emote.def.energy || 0;
	return (MOODS[current.name] || {}).energy || 0;
}

// Adds mood + emote offsets, eased in and out, plus breathing, blinking and lip flaps.
function animate() {
	const now = performance.now();
	const en = energy();
	if (en) {
		// she can't keep still: head and body sway, darting eyes
		const t = now / 1000;
		core.addParameterValueById("ParamAngleX", en * 13 * Math.sin(t * 2.3));
		core.addParameterValueById("ParamAngleY", en * 7 * Math.sin(t * 1.9 + 1));
		core.addParameterValueById("ParamAngleZ", en * 9 * Math.sin(t * 1.5 + 2));
		core.addParameterValueById("ParamBodyAngleX", en * 6 * Math.sin(t * 2.1));
		core.addParameterValueById("ParamBodyAngleZ", en * 5 * Math.sin(t * 1.2));
		if (now > eyes.next) {
			eyes.tx = (Math.random() * 2 - 1) * 0.9; eyes.ty = (Math.random() * 2 - 1) * 0.5;
			eyes.next = now + 500 + Math.random() * 1400;
		}
		eyes.x += (eyes.tx - eyes.x) * 0.35; eyes.y += (eyes.ty - eyes.y) * 0.35;
		core.addParameterValueById("ParamEyeBallX", eyes.x * en);
		core.addParameterValueById("ParamEyeBallY", eyes.y * en);
	}
	const mood = MOODS[current.name] || {};
	const layers = emote ? [emote.def] : [mood];
	const target = {};
	for (const L of layers) {
		for (const [id, v] of Object.entries(L.params || {})) target[id] = (target[id] || 0) + v;
		for (const e of L.exp || []) for (const p of expData[e] || []) target[p.Id] = (target[p.Id] || 0) + p.Value;
	}
	for (const id of new Set([...Object.keys(weights), ...Object.keys(target)])) {
		const w = (weights[id] || 0) + ((target[id] || 0) - (weights[id] || 0)) * 0.15;
		weights[id] = Math.abs(w) < 0.001 && !target[id] ? 0 : w;
		if (weights[id]) core.addParameterValueById(id, weights[id]);
	}
	core.addParameterValueById("ParamBreath", (Math.sin(now / 900) + 1) / 2);
	const blink = emote ? emote.def.blink : mood.blink;
	if (blink !== false) {
		if (now > nextBlink + 160) nextBlink = now + 2500 + Math.random() * 3500;
		if (now > nextBlink) {
			const k = Math.abs((now - nextBlink) / 80 - 1); // 1 -> 0 -> 1 over 160 ms
			core.multiplyParameterValueById("ParamEyeLOpen", k);
			core.multiplyParameterValueById("ParamEyeROpen", k);
		}
	}
	if (now < talkingUntil) core.addParameterValueById("ParamMouthOpenY", (Math.sin(now / 55) + 1) * 0.35);
}

function setMood(name, holdMs) {
	if (!MOODS[name]) name = base;
	current = { name, since: Date.now(), until: Date.now() + holdMs };
	const m = MOODS[name];
	if (!emote) {
		if (m.motion) model.motion(m.motion, 0, 3);
		else model.internalModel.motionManager.stopAllMotions();
	}
	showTag();
	clearTimeout(holdTimer);
	if (holdMs !== Infinity) holdTimer = setTimeout(() => react({ mood: base, hold: 0 }), holdMs);
}

function showTag() {
	const name = emote ? emote.name : current.name;
	const quiet = name === "idle" || name === "hyper";
	tag.textContent = quiet ? "" : name;
	tag.style.display = quiet ? "none" : "";
}

function playEmote(name) {
	const def = EMOTES[name];
	if (!def) return;
	endEmote();
	const els = (def.deco || []).map((d) => {
		const el = document.createElement("div");
		el.className = "deco " + (d.cls || "") + " " + (d.a || "");
		el.textContent = d.s;
		el.dataset.x = d.x; el.dataset.y = d.y;
		el.style.setProperty("--s", d.size);
		decoLayer.appendChild(el);
		return el;
	});
	emote = { name, def, els, timer: setTimeout(endEmote, def.ms || 4000) };
	if (def.motion) model.motion(def.motion, 0, 3);
	if (def.shake) cam.shake = def.shake;
	if (def.hops) { cam.hops = def.hops; cam.hopT = 0; }
	document.body.dataset.tint = def.tint || "";
	showTag();
}

function endEmote() {
	if (!emote) return;
	clearTimeout(emote.timer);
	for (const el of emote.els) { el.classList.add("bye"); setTimeout(() => el.remove(), 400); }
	emote = null;
	document.body.dataset.tint = "";
	const m = MOODS[current.name] || {};
	if (m.motion) model.motion(m.motion, 0, 3);
	else model.internalModel.motionManager.stopAllMotions();
	showTag();
}

function idleAntics() {
	if (!antics || emote || current.name !== base || performance.now() < talkingUntil) return;
	if (Date.now() - lastActivity < ANTICS_AFTER_MS) return;
	lastActivity = Date.now() - ANTICS_AFTER_MS / 2; // next antic comes sooner than the first
	playEmote(ANTICS[Math.floor(Math.random() * ANTICS.length)]);
}

function say(text, kind) {
	if (!text) return;
	bubble.className = kind === "chat" ? "chat" : "hype";
	bubble.textContent = "";
	void bubble.offsetWidth; // restart the pop/float animation
	bubble.classList.add("show");
	const ms = Math.min(kind === "chat" ? 14000 : 9000, 2500 + text.length * SAY_MS_PER_CHAR);
	talkingUntil = performance.now() + Math.min(ms - 1500, text.length * 45);
	// typed out over its final size: the untyped rest is there but invisible, so the bubble doesn't grow letter by letter
	const shown = document.createElement("span"), rest = document.createElement("span");
	rest.style.visibility = "hidden"; rest.textContent = text;
	bubble.replaceChildren(shown, rest);
	let i = 0;
	clearInterval(say.typing);
	say.typing = setInterval(() => {
		shown.textContent = text.slice(0, ++i); rest.textContent = text.slice(i);
		if (i >= text.length) clearInterval(say.typing);
	}, 30);
	clearTimeout(say.timer);
	say.timer = setTimeout(() => bubble.classList.remove("show"), ms);
}

// A command: {mood, emote, say, kind ("chat" = the user's message), hold (s; 0 = until changed),
// base, antics (bool), talk (bool: her voice started or stopped)}. Other fields (monologue, alert, counters, goal) are for the other overlays.
function react(cmd) {
	if (cmd.build) { if (react.build && react.build !== cmd.build) location.reload(); react.build = cmd.build; }
	if (cmd.mood || cmd.emote || cmd.say) lastActivity = Date.now();
	if (typeof cmd.antics === "boolean") antics = cmd.antics;
	if (cmd.base && MOODS[cmd.base]) {
		base = cmd.base;
		if (!cmd.mood && (current.until === Infinity || current.name === "idle")) setMood(base, Infinity);
	}
	if (cmd.mood) {
		const hold = cmd.hold === 0 ? Infinity : (cmd.hold ? cmd.hold * 1000 : DEFAULT_HOLD_MS);
		const wait = current.since + MIN_HOLD_MS - Date.now();
		if (wait > 0 && current.name !== base && cmd.mood !== current.name) {
			clearTimeout(react.later);
			react.later = setTimeout(() => react({ mood: cmd.mood, hold: cmd.hold }), wait);
		} else if (cmd.mood !== current.name || hold !== Infinity) {
			setMood(cmd.mood, hold);
		}
	}
	if (cmd.emote) playEmote(cmd.emote);
	if (typeof cmd.talk === "boolean") {
		talkingUntil = cmd.talk ? Infinity : 0;
		clearTimeout(say.timer);
		if (!cmd.talk) say.timer = setTimeout(() => bubble.classList.remove("show"), 2500);
	}
	if (cmd.say) {
		say(cmd.say, cmd.kind);
		if (cmd.kind !== "chat" && !cmd.emote && !emote) { cam.hops = 2; cam.hopT = 0; }  // she bounces when she talks
	}
}

function listen() {
	addEventListener("message", (e) => { if (e.origin === location.origin && e.data?.mochi) react(e.data.mochi); });
	parent.postMessage({ mochiReady: true }, location.origin);
}

window.__vt = { react, EMOTES, cam };  // for tuning from the devtools console
load().catch((e) => console.error("[vtuber]", e));
