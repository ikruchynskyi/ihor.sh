// A 2D puppet from one picture: the cut-out (base.png) becomes a mesh bent by a skeleton placed on the picture
// (rig.json: joints, regions, spring chains, the face box). Each mesh point follows the bone it is closest to *inside*
// the silhouette; arms draw in front of the body and the tail behind; hair, tails and ears swing on springs; faces
// are whole pictures swapped in (faces/*.png, the same picture with only the face redrawn); her feet stay on the ground.
// Clips (clips/*.json) pose the bones over time; any clip works on any character.
import * as THREE from "three";

const D = Math.PI / 180;
// "smooth" (the default) is a curve through the keys: motion flows through a key that carries on the same way, and
// eases in and out where it turns back or holds; the others ease each stretch between two keys on its own
export const EASE = {
	linear: (u) => u, smooth: (u) => u * u * (3 - 2 * u), in: (u) => u * u * u, out: (u) => 1 - (1 - u) ** 3,
	back: (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2, snap: (u) => (u < 1 ? 0 : 1),
};
// Joint tree: each joint is a bone that turns everything after it. Pose names are what clips use.
const TREE = { hips: null, spine: "hips", chest: "spine", neck: "chest", head: "neck",
	shoulderR: "chest", elbowR: "shoulderR", wristR: "elbowR", handR: "wristR", shoulderL: "chest", elbowL: "shoulderL", wristL: "elbowL", handL: "wristL",
	hipR: "hips", kneeR: "hipR", ankleR: "kneeR", toeR: "ankleR", hipL: "hips", kneeL: "hipL", ankleL: "kneeL", toeL: "ankleL" };
// pose name -> [the joint it turns, side: +1 her left (turning counter-clockwise on screen raises/opens), -1 her right, 0 centre]
export const POSE = { body: ["hips", 0], waist: ["spine", 0], chest: ["chest", 0], head: ["neck", 0],
	upperArmL: ["shoulderL", 1], foreArmL: ["elbowL", 1], handL: ["wristL", 1], upperArmR: ["shoulderR", -1], foreArmR: ["elbowR", -1], handR: ["wristR", -1],
	thighL: ["hipL", 1], shinL: ["kneeL", 1], footL: ["ankleL", 1], thighR: ["hipR", -1], shinR: ["kneeR", -1], footR: ["ankleR", -1] };
// which layer a bone's mesh draws in (low first)
const LAYER_OF = (j) => (/^(hip|knee|ankle|toe)[LR]$/.test(j) ? 1 : /^(shoulder|elbow|wrist|hand)[LR]$/.test(j) ? 5 : j === "neck" || j === "head" ? 4 : 2);
// follow-through springs per joint: [stiffness, damping] (lower stiffness lags more; damping under 2·√stiffness overshoots)
const FOLLOW = { hips: [320, 28], spine: [320, 28], chest: [300, 26], neck: [220, 20], shoulder: [240, 21], elbow: [170, 15], wrist: [130, 12], hip: [320, 28], knee: [320, 28], ankle: [320, 28] };
const FOLLOWS = new Set(Object.values(POSE).map(([j]) => j));
// named poses (poses.json) a clip key can start from: {"use": "fists_chest"} or {"use": ["fists_chest", "knees_bent"]}
export const POSES = {};
const LAYERS = { back: 0, legs: 1, body: 2, hair: 3, head: 4, arms: 5, front: 6 };
const TRUNK = ["hips", "spine", "chest"], LIMB = /^(shoulder|elbow|wrist|hip|knee|ankle)[LR]$/;
const STEP = 1 / 120, SETTLE = 1.5; // physics step (s); how far back a jump in time re-runs (s)

export async function loadImage(url) {
	const img = new Image();
	img.src = url;
	await img.decode();
	return img;
}

// ---- clips: keys -> per-track lists -> values at time t ----
export function compileClip(clip) {
	const tracks = new Map(), push = (k, t, v, ease) => { if (!tracks.has(k)) tracks.set(k, []); tracks.get(k).push({ t, v, ease }); };
	for (const k of clip.keys ?? []) {
		const ease = k.ease && k.ease !== "smooth" ? EASE[k.ease] ?? null : null, t = Math.max(0, +k.t || 0);
		const used = [k.use ?? []].flat().reduce((acc, n) => ({ ...acc, ...(POSES[n]?.pose ?? {}) }), {});
		for (const f of ["face", "squash", "lift"]) if (k[f] === undefined && [k.use ?? []].flat().some((n) => POSES[n]?.[f] !== undefined)) k[f] = [k.use].flat().map((n) => POSES[n]?.[f]).filter((x) => x !== undefined).at(-1);
		for (const [b, v] of Object.entries({ ...used, ...(k.pose ?? {}) })) push("pose:" + b, t, Array.isArray(v) ? [+v[0] || 0, v[1] ?? 1, v[2] ?? 0] : [+v || 0, 1, 0], ease);
		for (const f of ["pos", "squash"]) if (k[f]) push(f, t, [...k[f]], ease);
		for (const f of ["lift", "turn"]) if (k[f] !== undefined) push(f, t, +k[f], ease);
		if (k.face) push("face", t, k.face, EASE.snap);
	}
	const duration = +clip.duration || Math.max(0.1, ...[...tracks.values()].flat().map((k) => k.t));
	for (const list of tracks.values()) {
		list.sort((a, b) => a.t - b.t);
		if (clip.loop && list.at(-1).t < duration) list.push({ ...list[0], t: duration });
		// each key's slope (per number): none at a turn or a hold, else a weighted mean of the slopes either side, which
		// never overshoots a key (Fritsch–Butland). A loop's ends see round the loop.
		if (typeof list[0].v === "string") continue;
		const n = list.length, num = (k) => [k.v].flat(), at = (i) => (i < 0 ? (clip.loop && n > 2 ? { ...list[n - 2], t: list[n - 2].t - duration } : null)
			: i >= n ? (clip.loop && n > 2 ? { ...list[1], t: list[1].t + duration } : null) : list[i]);
		list.forEach((k, i) => {
			const a = at(i - 1), b = at(i + 1);
			k.m = num(k).map((x, c) => {
				if (!a || !b) return 0;
				const h0 = k.t - a.t, h1 = b.t - k.t, d0 = (x - num(a)[c]) / Math.max(1e-6, h0), d1 = (num(b)[c] - x) / Math.max(1e-6, h1);
				return d0 * d1 <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
			});
		});
	}
	return { ...clip, duration, tracks, events: [...(clip.events ?? [])].sort((a, b) => a.t - b.t) };
}
const NEUTRAL = (k) => (k.startsWith("pose:") ? [0, 1, 0] : k === "squash" ? [1, 1] : k === "pos" ? [0, 0] : k === "turn" ? 1 : 0);
const lerp = (a, b, u) => (Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * u) : typeof a === "number" ? a + (b - a) * u : u < 1 ? a : b);
export function sampleClip(c, t) {
	const out = new Map();
	for (const [k, list] of c.tracks) {
		const i = list.findIndex((x) => x.t > t);
		if (i <= 0) out.set(k, i === 0 ? list[0].v : list.at(-1).v);
		else {
			const a = list[i - 1], b = list[i], h = Math.max(1e-6, b.t - a.t), u = (t - a.t) / h;
			if (b.ease || typeof a.v === "string") out.set(k, lerp(a.v, b.v, (b.ease ?? EASE.snap)(u)));
			else { // the curve through the keys (cubic Hermite)
				const h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = 3 * u * u - 2 * u ** 3, h11 = u ** 3 - u * u;
				const v = [a.v].flat().map((x, c) => h00 * x + h10 * h * a.m[c] + h01 * [b.v].flat()[c] + h11 * h * b.m[c]);
				out.set(k, Array.isArray(a.v) ? v : v[0]);
			}
		}
	}
	return out;
}

const inPoly = (x, y, poly) => {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i], [xj, yj] = poly[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
};
const segDist = (px, py, [ax, ay], [bx, by]) => {
	const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
	return [Math.hypot(px - ax - u * dx, py - ay - u * dy), u];
};

const segDistRaw = (px, py, [ax, ay], [bx, by]) => {
	const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, u = ((px - ax) * dx + (py - ay) * dy) / L, c = Math.max(0, Math.min(1, u));
	return [Math.hypot(px - ax - c * dx, py - ay - c * dy), u];
};

export class Puppet {
	constructor(scene) {
		this.scene = scene;
		this.root = new THREE.Group();  // where she stands on the stage (the stage moves this)
		this.group = new THREE.Group(); // her pose: squash, turn, facing (scale.x = -1 faces the other way)
		this.root.add(this.group);
		scene.add(this.root);
		this.clips = {};
		this.time = 0;
		this.face = "base"; this.faceUntil = 0; this.blinkAt = 2; this.talk = 0;
		this.base = null; this.action = null;
	}

	async load(dir, opts = {}) {
		this.dir = dir; this.isBack = !!opts.back;
		const rig = (this.rig = await (await fetch(`${dir}/rig.json`, { cache: "no-store" })).json());
		const img = await loadImage(`${dir}/${rig.image ?? "base.png"}`);
		const W = (this.W = img.width), H = (this.H = img.height);
		// faces: every faces/*.png listed in the rig (or tried by the usual names)
		const names = rig.faces ?? ["blink", "talk", "joy", "wink", "surprised", "sad", "angry", "shy"];
		this.faces = { base: new THREE.Texture(img) };
		await Promise.all(names.map(async (n) => { try { this.faces[n] = new THREE.Texture(await loadImage(`${dir}/faces/${n}.png`)); } catch { /* not made yet */ } }));
		for (const t of Object.values(this.faces)) { t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; }
		this.material = new THREE.MeshBasicMaterial({ map: this.faces.base, transparent: true, depthTest: false, side: THREE.DoubleSide });
		// world space: picture pixels, y up, the feet's ground line at y = 0, centred on the hips
		const J = rig.joints, gx = J.hips[0], gy = rig.ground ?? H;
		this.toWorld = ([x, y]) => [x - gx, gy - y];
		// bones: the joint tree, then the spring chains
		this.bones = {}; this.rest = {};
		// each bone points along its limb (toward its main child), so a length scale shortens the limb along itself
		const ang = {};
		const make = (name, at, parent, toward) => {
			const b = new THREE.Bone(), [x, y] = this.toWorld(at);
			b.name = name;
			const pa = parent ? ang[parent] : 0, [px, py] = parent ? this.rest[parent] : [0, 0];
			const a = toward ? Math.atan2(this.toWorld(toward)[1] - y, this.toWorld(toward)[0] - x) : pa;
			const dx = x - px, dy = y - py, c = Math.cos(-pa), sn = Math.sin(-pa);
			b.position.set(dx * c - dy * sn, dx * sn + dy * c, 0);
			b.rotation.z = a - pa;
			(parent ? this.bones[parent] : this.group).add(b);
			this.bones[name] = b; this.rest[name] = [x, y]; ang[name] = a;
		};
		const MAIN = { hips: "spine", chest: "neck" };
		const childOf = (j) => MAIN[j] ?? Object.keys(TREE).find((c) => TREE[c] === j && J[c]);
		for (const [j, p] of Object.entries(TREE)) if (J[j]) make(j, J[j], p && J[p] ? p : p ? TREE[p] : null, J[childOf(j)]);
		// each joint's own part of the picture hangs on a leaf bone ("elbowR~"), so shortening a forearm scales only the
		// forearm: the hand after it moves in but isn't squashed
		this.leaf = {};
		for (const j of Object.keys(TREE)) if (this.bones[j]) { const l = (this.leaf[j] = new THREE.Bone()); l.name = j + "~"; this.bones[j].add(l); this.bones[l.name] = l; }
		this.springs = (rig.springs ?? []).map((s) => {
			const parent = s.parent === "head" ? "neck" : s.parent, names = s.points.map((_, i) => `${s.name}${i}`);
			s.points.forEach((pt, i) => make(names[i], pt, i ? names[i - 1] : parent, s.points[i + 1]));
			return { ...s, names, pts: null };
		});
		// soft regions (a skirt hem, sleeves, ears, a chest): a bone at the region's middle that lags behind its parent and
		// settles back; points inside follow it most at the middle and not at all at the edge
		this.softs = (rig.regions ?? []).filter((r) => r.soft).map((r) => {
			const n = r.poly.length, cx = r.poly.reduce((a, p) => a + p[0], 0) / n, cy = r.poly.reduce((a, p) => a + p[1], 0) / n;
			const parent = POSE[r.soft.bone]?.[0] ?? (r.soft.bone === "head" ? "neck" : r.soft.bone);
			const name = `soft_${r.name}`;
			make(name, [cx, cy], parent);
			return { r, name, o: new THREE.Vector3(), ov: new THREE.Vector3(), prev: null, pv: null };
		});
		const order = Object.keys(this.bones);
		this.root.updateMatrixWorld(true); // the skeleton's bind pose is the picture's pose
		this.skeleton = new THREE.Skeleton(order.map((n) => this.bones[n]));
		const index = Object.fromEntries(order.map((n, i) => [n, i])), skin = (b) => index[this.leaf[b] ? b + "~" : b];
		// segments: [the bone that turns it (the joint it starts at), from, to, spring chain, far joint] — a mesh point near a
		// segment follows that bone (the clavicle follows the chest, the pelvis the hips)
		const segs = [];
		for (const [j, p] of Object.entries(TREE)) if (p && J[j] && J[p]) segs.push([p, J[p], J[j], null, j]);
		for (const s of this.springs) for (let i = 0; i + 1 < s.points.length; i++) segs.push([s.names[i], s.points[i], s.points[i + 1], s.name, null]);
		// ---- the mesh: a grid over the picture's opaque pixels ----
		const c = document.createElement("canvas");
		c.width = W; c.height = H;
		const g = c.getContext("2d");
		g.drawImage(img, 0, 0);
		const A = g.getImageData(0, 0, W, H).data, step = rig.meshStep ?? 6, nx = Math.ceil(W / step) + 1, ny = Math.ceil(H / step) + 1;
		const solid = (x, y) => { for (let dy = -step; dy <= step; dy += step / 2) for (let dx = -step; dx <= step; dx += step / 2) { const X = Math.round(x + dx), Y = Math.round(y + dy); if (X >= 0 && Y >= 0 && X < W && Y < H && A[(Y * W + X) * 4 + 3] > 8) return true; } return false; };
		const vid = new Int32Array(nx * ny).fill(-1), pos = [], uv = [], px = [];
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
			const x = Math.min(W, i * step), y = Math.min(H, j * step);
			if (!solid(x, y)) continue;
			vid[j * nx + i] = pos.length / 3;
			const [wx, wy] = this.toWorld([x, y]);
			pos.push(wx, wy, 0); uv.push(x / W, 1 - y / H); px.push([x, y]);
		}
		// labels: regions first; the rest by the cheapest path inside the silhouette from the bones, where crossing a dark
		// outline (or the see-through edge around her) costs a lot (anime line art closes each part: sleeve vs coat, thigh vs shorts). Limb bones are seeded only
		// from partway down the limb, so a shoulder or a hip inside the body's outline doesn't claim the body.
		const n = px.length, label = new Array(n).fill(null), dist = new Float32Array(n).fill(Infinity), regionLayer = new Array(n).fill(null), fixed = new Uint8Array(n);
		// an outline pixel is a thin dark line: dark, and darker than what's around it (a navy coat is dark but not a line)
		const blur = document.createElement("canvas");
		blur.width = W; blur.height = H;
		const bg2 = blur.getContext("2d");
		bg2.filter = "blur(4px)"; bg2.drawImage(img, 0, 0);
		const B = bg2.getImageData(0, 0, W, H).data, L = (d, i) => (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
		const wall = (x, y) => { const i = (Math.round(Math.min(H - 1, y)) * W + Math.round(Math.min(W - 1, x))) * 4; if (A[i + 3] < 40) return true; const l = L(A, i); return l < 0.32 && l < L(B, i) - 0.09; };
		const heap = []; // [cost, vertex] binary heap
		const pushH = (c2, v) => { heap.push([c2, v]); let i = heap.length - 1; while (i) { const p2 = (i - 1) >> 1; if (heap[p2][0] <= heap[i][0]) break; [heap[p2], heap[i]] = [heap[i], heap[p2]]; i = p2; } };
		const popH = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
		for (let v = 0; v < n; v++) {
			const [x, y] = px[v];
			const reg = (rig.regions ?? []).find((r) => inPoly(x, y, r.poly));
			if (reg) {
				regionLayer[v] = reg.layer ?? (reg.spring ? (reg.name.startsWith("hair") ? "hair" : "back") : null);
				fixed[v] = 1;
				if (reg.bone === "head") { label[v] = { seg: ["neck", J.neck, J.head, null, "head"] }; regionLayer[v] ??= "head"; continue; }
				if (reg.bone) { // any other joint: this area follows it (e.g. a coat pinned to the chest so a sleeve can't take it)
					const j = POSE[reg.bone]?.[0] ?? reg.bone;
					if (J[j]) { label[v] = { seg: [j, J[j], J[j], null, "body"], u: 1 }; regionLayer[v] ??= "body"; continue; }
				}
				let best = null;
				for (const sg of segs.filter((q) => q[3] === reg.spring)) { const [d, u] = segDist(x, y, sg[1], sg[2]); if (!best || d < best.d) best = { d, u, seg: sg }; }
				if (best) { label[v] = best; continue; }
				fixed[v] = 0;
			}
			for (const sg of segs) {
				if (sg[3] || /^(shoulder|elbow|wrist|hip|knee|ankle)[LR]$/.test(sg[0])) continue;
				const [d, u] = segDist(x, y, sg[1], sg[2]), from = Object.keys(J).find((k) => J[k] === sg[1]);
				if (d < step * 1.3 && u >= (/^(shoulder|hip)[LR]$/.test(from) ? 0.45 : 0) && d < dist[v]) { dist[v] = d * 0.01; label[v] = { d, u, seg: sg }; }
			}
			if (label[v]) pushH(dist[v], v);
		}
		// arms and legs are tubes in this pose: every point within a limb's thickness of its bone is the limb's (a cuff or a
		// shoe stays whole); the outline-aware fill below only settles the body
		const START = (from) => (/^shoulder[LR]$/.test(from) ? 0.25 : /^hip[LR]$/.test(from) ? 0.4 : -0.15);
		// half-thickness of each limb in picture pixels: rig.thickness {upperArm, foreArm, hand, thigh, shin, foot} (both
		// sides), else a share of her height; check them with the labels picture
		const tall = (rig.ground ?? H) - Math.min(...px.map((p) => p[1]));
		const THICK = { shoulder: ["upperArm", 0.032], elbow: ["foreArm", 0.032], wrist: ["hand", 0.024], hip: ["thigh", 0.04], knee: ["shin", 0.038], ankle: ["foot", 0.045] };
		const limbs = segs.filter((sg) => /^(shoulder|elbow|wrist|hip|knee|ankle)[LR]$/.test(sg[0])).map((sg) => {
			const [key, share] = THICK[sg[0].slice(0, -1)];
			return { sg, r: rig.thickness?.[key] ?? share * tall, u0: START(sg[0]) };
		});
		for (let v = 0; v < n; v++) {
			if (fixed[v]) continue;
			const [x, y] = px[v];
			let best = null;
			for (const L of limbs) { const [d, u] = segDistRaw(x, y, L.sg[1], L.sg[2]); if (u >= L.u0 && u <= 1.15 && d <= L.r && (!best || d / L.r < best.k)) best = { k: d / L.r, d, u: Math.max(0, u), u0: L.u0, seg: L.sg }; }
			if (best) { label[v] = best; fixed[v] = 2; } // keeps its bone, and doesn't spread into the body
		}
		const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny ? vid[j * nx + i] : -1);
		const ij = new Array(n);
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (vid[j * nx + i] >= 0) ij[vid[j * nx + i]] = [i, j];
		const done = new Uint8Array(n);
		while (heap.length) {
			const [c0, v] = popH();
			if (done[v] || c0 > dist[v]) continue;
			done[v] = 1;
			const [i, j] = ij[v], [x0, y0] = px[v];
			for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
				const w = at(i + di, j + dj);
				if (w < 0 || fixed[w] || done[w]) continue; // regions and limb tubes keep their bone
				const [x1, y1] = px[w];
				let crosses = false;
				for (const f of [0.2, 0.4, 0.6, 0.8, 1]) crosses ||= wall(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
				const c2 = c0 + Math.hypot(di, dj) * (crosses ? 40 : 1);
				if (c2 < dist[w]) { dist[w] = c2; const sg = label[v].seg, [d, u] = segDist(x1, y1, sg[1], sg[2]); label[w] = { d, u, seg: sg }; pushH(c2, w); }
			}
		}
		// what the body reaches only across an outline, near a limb, is the limb's (spread fingers, the tip of a shoe)
		for (let v = 0; v < n; v++) {
			if (fixed[v] || dist[v] < 40) continue;
			const [x, y] = px[v];
			let best = null;
			for (const L of limbs) { const [d, u] = segDistRaw(x, y, L.sg[1], L.sg[2]); if (u >= L.u0 && u <= 1.7 && d <= L.r * 2.2 && (!best || d / L.r < best.k)) best = { k: d / L.r, d, u: Math.max(0, u), u0: L.u0, seg: L.sg }; }
			if (best) label[v] = best;
		}
		// the soft see-through edge around her takes the bone of its most solid neighbour (twice: two points deep), so an
		// edge never belongs to something on the other side of a gap
		const alphaV = px.map(([x, y]) => A[(Math.min(H - 1, Math.round(y)) * W + Math.min(W - 1, Math.round(x))) * 4 + 3]);
		for (let pass = 0; pass < 2; pass++) for (let v = 0; v < n; v++) {
			if (alphaV[v] >= 60 || fixed[v] === 1) continue;
			const [i, j] = ij[v];
			let best = -1;
			for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const w = at(i + di, j + dj); if (w >= 0 && label[w] && (best < 0 || alphaV[w] > alphaV[best])) best = w; }
			if (best >= 0 && alphaV[best] > alphaV[v]) { label[v] = label[best]; alphaV[v] = alphaV[best] - 1; }
		}
		// a point no bone reached (a dot walled in by outlines) takes its neighbours' bone
		for (let grew = true; grew;) {
			grew = false;
			for (let v = 0; v < n; v++) if (!label[v]) {
				const [i, j] = ij[v], w = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => at(i + di, j + dj)).find((w) => w >= 0 && label[w]);
				if (w !== undefined) { label[v] = label[w]; grew = true; }
			}
		}
		// weights: the bone, blended with its parent near the joint it turns on (soft elbows, shoulders, knees); the trunk
		// (coat, dress) bends smoothly along the spine by height, so a bow or a lean never tears it; the layer from the far
		// joint (arms in front, legs behind the coat, the head over the body) or the region
		const chain = TRUNK.filter((b) => J[b] && J[childOf(b)]).map((b) => [b, J[b], J[childOf(b)]]);
		const trunkWeights = (x, y) => {
			let best = null;
			chain.forEach(([, a, c], i) => { const [d, u] = segDistRaw(x, y, a, c); if (!best || d < best.d) best = { d, i, u: Math.max(0, Math.min(1, u)) }; });
			const { i, u } = best, b = chain[i][0];
			if (u < 0.5 && i > 0) return [b, chain[i - 1][0], 0.5 + u];
			if (u >= 0.5 && i + 1 < chain.length) return [b, chain[i + 1][0], 1.5 - u];
			return [b, b, 1];
		};
		const parentOf = (b) => (this.bones[b].parent?.isBone ? this.bones[b].parent.name : b);
		const layerOf = (L) => L.layer ?? (L.seg[3] ? LAYERS.hair : /^(elbow|wrist|hand)[LR]$/.test(L.seg[4]) ? LAYERS.arms
			: /^(knee|ankle|toe)[LR]$/.test(L.seg[4]) ? LAYERS.legs : L.seg[4] === "head" ? LAYERS.head : LAYERS.body);
		const skinIndex = [], skinWeight = [], vLayer = new Array(n);
		for (let v = 0; v < n; v++) {
			const L = label[v] ?? { seg: ["hips", J.hips, J.spine, null, "spine"], u: 0.5 }, b = L.seg[0], u0 = Math.max(0, L.u0 ?? 0);
			if (TRUNK.includes(b) && fixed[v] !== 1 && chain.length) { const [b1, b2, w] = trunkWeights(...px[v]); skinIndex.push(skin(b1), skin(b2), 0, 0); skinWeight.push(w, 1 - w, 0, 0); }
			else {
				const blend = b !== "hips" && L.u < u0 + 0.25 ? 0.5 * (1 - Math.max(0, L.u - u0) / 0.25) : 0;
				skinIndex.push(skin(b), skin(parentOf(b)), 0, 0);
				skinWeight.push(1 - blend, blend, 0, 0);
			}
			vLayer[v] = regionLayer[v] !== null ? LAYERS[regionLayer[v]] : layerOf(L);
		}
		for (const sf of this.softs) { // points in a soft region: onto its bone, fading out toward the region's edge
			const poly = sf.r.poly, edge = (x, y) => Math.min(...poly.map((p, i) => segDist(x, y, p, poly[(i + 1) % poly.length])[0]));
			const inner = Math.max(...px.filter(([x, y]) => inPoly(x, y, poly)).map(([x, y]) => edge(x, y)), 1);
			for (let v = 0; v < n; v++) {
				const [x, y] = px[v];
				if (!inPoly(x, y, poly)) continue;
				const w = Math.min(1, edge(x, y) / (inner * 0.7)) * (sf.r.soft.amount ?? 1);
				skinIndex[v * 4] = index[sf.name]; skinWeight[v * 4] = w;
				skinIndex[v * 4 + 1] = skin(label[v]?.seg[0] ?? "hips"); skinWeight[v * 4 + 1] = 1 - w;
			}
		}
		// triangles, sorted into layers by their vertices' layer
		const tris = Array.from({ length: 7 }, () => []), seams = Array.from({ length: 7 }, () => []);
		for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
			const a = at(i, j), b = at(i + 1, j), c2 = at(i, j + 1), d = at(i + 1, j + 1);
			for (const t of [[a, b, c2], [b, d, c2]]) {
				if (t.some((x) => x < 0)) continue;
				// a see-through triangle joining two bones only bridges a gap (between an arm and the coat): it would stretch
				const cx = (px[t[0]][0] + px[t[1]][0] + px[t[2]][0]) / 3, cy = (px[t[0]][1] + px[t[1]][1] + px[t[2]][1]) / 3;
				const seeThrough = A[(Math.min(H - 1, Math.round(cy)) * W + Math.min(W - 1, Math.round(cx))) * 4 + 3] < 160;
				if (seeThrough && new Set(t.map((x) => label[x]?.seg[0])).size > 1) continue;
				const l = Math.max(...t.map((x) => vLayer[x])), lo = Math.min(...t.map((x) => vLayer[x]));
				const layer = lo !== l && l === LAYERS.arms && lo <= LAYERS.body ? lo : l; // a seam between arm and body stays with the body
				// a triangle joining two parts that don't bend together (arm and coat, thigh and shorts) is a seam: it's checked
				// every frame and hidden while it's stretched (the underlay below shows instead). The trunk bends as one, and a
				// limb bends with its own parts (upper arm and forearm), not with the trunk it hangs from.
				const bones = [...new Set(t.map((x) => label[x]?.seg[0]))];
				const linked = bones.length === 2 && bones.some((b) => bones.some((c) => b !== c && this.bones[b]?.parent?.name === c && !(TRUNK.includes(c) && LIMB.test(b))));
				const together = bones.every((b) => TRUNK.includes(b) || b === "neck") || linked;
				(bones.length > 1 && !together ? seams : tris)[layer].push(...t);
			}
		}
		this.debug = { px, label, vLayer, W, H };
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
		geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
		geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
		geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
		this.meshes = tris.map((t, layer) => {
			if (!t.length) return null;
			const g2 = geo.clone();
			g2.setIndex(t);
			const m = new THREE.SkinnedMesh(g2, this.material);
			m.renderOrder = layer; m.frustumCulled = false;
			this.group.add(m);
			m.updateMatrixWorld(true);
			m.bind(this.skeleton, m.matrixWorld);
			return m;
		}).filter(Boolean);
		this.seams = seams.map((t, layer) => {
			if (!t.length) return null;
			const g2 = geo.clone();
			g2.setIndex(new THREE.BufferAttribute(new Uint32Array(t), 1));
			const m = new THREE.SkinnedMesh(g2, this.material);
			m.renderOrder = layer; m.frustumCulled = false;
			this.group.add(m);
			m.updateMatrixWorld(true);
			m.bind(this.skeleton, m.matrixWorld);
			const area = (P) => Math.abs((P[1].x - P[0].x) * (P[2].y - P[0].y) - (P[2].x - P[0].x) * (P[1].y - P[0].y));
			const v = (i) => new THREE.Vector3().fromBufferAttribute(g2.attributes.position, i);
			const rest = [], edges = [], longest = (P) => Math.max(P[0].distanceTo(P[1]), P[1].distanceTo(P[2]), P[2].distanceTo(P[0]));
			for (let k = 0; k < t.length; k += 3) { const P = [v(t[k]), v(t[k + 1]), v(t[k + 2])]; rest.push(Math.max(1, area(P))); edges.push(longest(P)); }
			return { mesh: m, all: t, rest, edges, area, longest, shown: new Uint32Array(t.length) };
		}).filter(Boolean);
		// The underlay: what was behind her arms and legs was never drawn, so under everything lies her trunk again, where
		// the parts a limb covered (inside the trunk's outline closed over the limb) take the nearest plain trunk colour
		// and move with the trunk. A limb moving away, or a seam hiding, shows coat there instead of a hole.
		{
			const r = Math.max(1, Math.round((rig.thickness?.upperArm ?? 0.032 * tall) / step)), disk = [];
			for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r) disk.push([di, dj]);
			const isTrunk = (v) => TRUNK.includes(label[v]?.seg[0]);
			const grid = (f) => { const g = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = f(i, j); return g; };
			const cell = (g, i, j) => i >= 0 && j >= 0 && i < nx && j < ny && g[j * nx + i];
			const trunk = grid((i, j) => vid[j * nx + i] >= 0 && isTrunk(vid[j * nx + i]));
			const grown = grid((i, j) => disk.some(([di, dj]) => cell(trunk, i + di, j + dj)));
			const closed = grid((i, j) => disk.every(([di, dj]) => cell(grown, i + di, j + dj)));
			const alpha = (v) => A[(Math.min(H - 1, Math.round(px[v][1])) * W + Math.min(W - 1, Math.round(px[v][0]))) * 4 + 3];
			const plain = [];
			for (let v = 0; v < n; v++) if (isTrunk(v) && alpha(v) > 200 && !wall(...px[v])) plain.push(v);
			const from = new Map();
			for (let v = 0; v < n; v++) {
				if (isTrunk(v) || !LIMB.test(label[v]?.seg[0] ?? "") || !closed[ij[v][1] * nx + ij[v][0]]) continue;
				let best = -1, bd = Infinity;
				for (const w of plain) { const d = (px[w][0] - px[v][0]) ** 2 + (px[w][1] - px[v][1]) ** 2; if (d < bd) { bd = d; best = w; } }
				if (best >= 0) from.set(v, best);
			}
			const under = [];
			for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
				const a = at(i, j), b = at(i + 1, j), c2 = at(i, j + 1), d = at(i + 1, j + 1);
				for (const t of [[a, b, c2], [b, d, c2]]) if (t.every((x) => x >= 0 && (isTrunk(x) || from.has(x))) && t.some((x) => from.has(x))) under.push(...t);
			}
			if (under.length) {
				const uv2 = [...uv], si = [...skinIndex], sw = [...skinWeight];
				for (const [v, w] of from) { uv2.splice(v * 2, 2, uv[w * 2], uv[w * 2 + 1]); si.splice(v * 4, 4, ...skinIndex.slice(w * 4, w * 4 + 4)); sw.splice(v * 4, 4, ...skinWeight.slice(w * 4, w * 4 + 4)); }
				const g2 = geo.clone();
				g2.setAttribute("uv", new THREE.Float32BufferAttribute(uv2, 2));
				g2.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
				g2.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
				g2.setIndex(under);
				const m = new THREE.SkinnedMesh(g2, this.material);
				m.renderOrder = 0.5; m.frustumCulled = false; // over a tail behind her, under her legs
				this.group.add(m);
				m.updateMatrixWorld(true);
				m.bind(this.skeleton, m.matrixWorld);
				this.meshes.push(m);
				this.debug.under = from;
			}
		}
		this.restLocal = Object.fromEntries(Object.entries(this.bones).map(([k, b]) => [k, b.position.clone()]));
		this.restRot = Object.fromEntries(Object.entries(this.bones).map(([k, b]) => [k, b.rotation.z]));
		// Poses are angles from one standard stance, the same on every character: upper arms 45° out from the body, forearms
		// straight, thighs 15° apart, shins straight. Each picture is drawn a little differently (arms level, arms down), so
		// measure how far its limbs already are from that stance and take it off: "arms up" is arms up on everyone.
		const STANCE = { upperArm: [45, "chestDown"], foreArm: [0, "shoulder"], thigh: [15, "hipsDown"], shin: [0, "hip"] };
		const heading = (a, b) => Math.atan2(-(J[b][1] - J[a][1]), J[b][0] - J[a][0]);
		this.offsets = {};
		for (const side of ["L", "R"]) {
			const s1 = side === "L" ? 1 : -1, back = opts.back ? -1 : 1;
			const ref = { chestDown: heading("neck", "chest"), hipsDown: heading("spine", "hips"), shoulder: heading("shoulder" + side, "elbow" + side), hip: heading("hip" + side, "knee" + side) };
			const limb = { upperArm: ["shoulder", "elbow"], foreArm: ["elbow", "wrist"], thigh: ["hip", "knee"], shin: ["knee", "ankle"] };
			for (const [name, [a, b]] of Object.entries(limb)) {
				if (!J[a + side] || !J[b + side]) continue;
				let d = heading(a + side, b + side) - ref[STANCE[name][1]];
				d = Math.atan2(Math.sin(d), Math.cos(d)) * 180 / Math.PI;
				this.offsets[name + side] = back * s1 * d - STANCE[name][0]; // in pose units: + raises / opens
			}
		}
		this.height = gy - Math.min(...px.map((p) => p[1])); // her height in picture pixels, ground to the top of her head
		this.lowRest = this.lowestFoot();
		// her back view (back/rig.json), drawn the same height, in the same place
		if (!opts.back && (await fetch(`${dir}/back/rig.json`, { method: "HEAD" })).ok) {
			this.back = await new Puppet(this.scene).load(`${dir}/back`, { back: true });
			this.root.add(this.back.root);
			this.back.root.scale.setScalar(this.height / this.back.height);
			this.back.group.visible = false;
		}
		return this;
	}
	// Which bone each mesh point follows, as a picture (each bone its own colour; layer as the dot size) — to check a rig.
	labelsImage() {
		const { px, label, vLayer, W, H } = this.debug, c = document.createElement("canvas");
		c.width = W; c.height = H;
		const g = c.getContext("2d");
		g.globalAlpha = 0.35; g.drawImage(this.faces.base.image, 0, 0); g.globalAlpha = 1;
		const names = Object.keys(this.bones).filter((b) => !b.endsWith("~")), hue = (b) => (names.indexOf(b) * 137.5) % 360;
		px.forEach(([x, y], v) => { const b = label[v]?.seg[0] ?? "none"; g.fillStyle = b === "none" ? "#000" : `hsl(${hue(b)} 80% 50%)`; g.fillRect(x - 1 - vLayer[v] / 3, y - 1 - vLayer[v] / 3, 2 + vLayer[v] / 1.5, 2 + vLayer[v] / 1.5); });
		g.font = "13px sans-serif";
		names.forEach((b, i) => { g.fillStyle = `hsl(${hue(b)} 80% 40%)`; g.fillText(b, 6 + (i % 4) * 110, 16 + Math.floor(i / 4) * 16); });
		return c.toDataURL("image/png");
	}

	lowestFoot() {
		this.group.updateMatrixWorld(true);
		const v = new THREE.Vector3();
		let low = Infinity;
		for (const j of ["toeL", "toeR", "ankleL", "ankleR"]) if (this.bones[j]) low = Math.min(low, this.group.worldToLocal(this.bones[j].getWorldPosition(v)).y);
		return low;
	}

	setClips(raw) { for (const [name, c] of Object.entries(raw)) this.clips[name] = compileClip({ name, ...c }); }
	setBase(name) { if (this.clips[name]) { this.base = { clip: this.clips[name], t: 0 }; } }
	play(name, { times = 1 } = {}) {
		const clip = this.clips[name];
		if (!clip) return Promise.reject(new Error(`no clip "${name}"`));
		if (this.action) this.action.resolve("stopped");
		return new Promise((resolve) => { this.action = { clip, t: 0, w: 0, times, resolve, fired: -1 }; });
	}
	stop() { if (this.action) this.action.ending = true; }
	setFace(name, seconds = 0) { this.face = this.faces[name] ? name : "base"; this.faceUntil = seconds ? this.time + seconds : 0; }

	// Time passes. Motion is worked out in fixed steps (STEP), so it's the same at any frame rate: on a screen, on a sheet,
	// in a video. A clip held at a moment (`pinned`: the scrubber, sheets, videos) is followed forward step by step; a jump
	// (scrubbing back, a new clip) re-runs the moments before it, so what you see paused is exactly what plays.
	update(dt) {
		if (!this.meshes) return;
		this.time += dt;
		const pin = this.pinned, last = this.simAt;
		if (pin) {
			const c = pin.clip, at = (t) => (c.loop ? t % c.duration : t);
			let span = last?.clip === c ? pin.t - last.t : -1;
			if (c.loop && last?.clip === c && span < 0) span += c.duration; // round the loop
			if (span < 0 || span > 0.25) this.seek(c, pin.t);
			else for (let n = Math.ceil(span / STEP - 1e-9), i = 1; i <= n; i++) this.step(this.poseAt(c, at(last.t + (span * i) / n)), span / n);
			this.simAt = { clip: c, t: pin.t };
		} else {
			this.simAt = null;
			for (let n = Math.ceil(dt / STEP - 1e-9), i = 0; i < n; i++) this.step(this.sample(dt / n), dt / n);
		}
		if (!this.pose) return;
		this.draw(this.pose, dt);
		if (this.back) { // she shows her back view while turned round (turn < 0)
			const behind = (this.pose.get("turn") ?? 1) < 0;
			this.group.visible = !behind; this.back.group.visible = behind;
			this.back.time = this.time;
			this.back.draw(this.pose, 0);
		}
	}

	// Re-run the moments before T (SETTLE seconds: springs have settled by then) from her exact pose.
	seek(c, T) {
		for (const p of [this, this.back]) if (p) { p.follow = {}; p.plants = {}; p.jelly = null; p.lastTurn = undefined; for (const s of p.springs) s.pts = null; for (const sf of p.softs) sf.p = null; }
		const start = c.loop ? T - SETTLE : Math.max(0, T - SETTLE), at = (t) => this.poseAt(c, c.loop ? ((t % c.duration) + c.duration) % c.duration : t);
		this.step(at(start), 0);
		for (let n = Math.ceil((T - start) / STEP - 1e-9), i = 1; i <= n; i++) this.step(at(start + ((T - start) * i) / n), (T - start) / n);
	}

	// one step of h seconds (0: exactly the pose, nothing swinging)
	step(pose, h) {
		const ground = (this.pinned ?? this.action ?? this.base)?.clip.ground !== false;
		this.apply(pose, h, ground);
		if (this.back) this.back.apply(pose, h, ground, true);
		this.pose = pose;
	}

	// A held clip at time t, over the idle (at the same time, so it's the same every time).
	poseAt(c, t) {
		const pose = new Map();
		if (this.base) for (const [k, v] of sampleClip(this.base.clip, t % this.base.clip.duration)) pose.set(k, v);
		for (const [k, v] of sampleClip(c, t)) pose.set(k, v);
		return pose;
	}

	// The pose now, live: the base clip with the action faded over it.
	sample(h) {
		const pose = new Map(), fade = (c) => Math.max(0.05, c.fade ?? 0.25);
		if (this.base) { this.base.t = (this.base.t + h) % this.base.clip.duration; for (const [k, v] of sampleClip(this.base.clip, this.base.t)) pose.set(k, v); }
		const a = this.action;
		if (a) {
			a.t += h;
			const c = a.clip, end = c.loop ? (a.times ? a.times * c.duration : Infinity) : c.duration;
			if (a.t >= end - (c.loop ? 0 : fade(c) * 0.5)) a.ending = true;
			a.w = a.ending ? a.w - h / fade(c) : Math.min(1, a.w + h / fade(c));
			const lt = c.loop ? a.t % c.duration : Math.min(a.t, c.duration);
			for (const e of c.events) if (e.t <= lt && e.t > a.fired) this.onEvent?.(e);
			a.fired = lt < a.fired ? -1 : lt;
			const w = Math.max(0, a.w);
			for (const [k, v] of sampleClip(c, lt)) pose.set(k, k === "face" ? (w > 0.5 ? v : pose.get(k)) : lerp(pose.get(k) ?? NEUTRAL(k), v, w));
			if (a.w <= 0) { this.action = null; a.resolve("done"); }
		}
		return pose;
	}

	// A pose name's angle as drawn now (after follow-through), in clip units.
	drawnPose(name) {
		const [joint, side] = POSE[name], b = this.bones[joint];
		return (b.rotation.z - this.restRot[joint]) / D / ((this.isBack ? -1 : 1) * (side || -1)) + (this.offsets[name] ?? 0);
	}

	// Put this view of her in a pose and move her springs h seconds on. The back view is the front mirrored (her left is
	// on the picture's left), so every turn goes the other way round on screen.
	apply(pose, h, ground = true, backView = false) {
		const flip = backView ? -1 : 1, width = {};
		for (const [k, b] of Object.entries(this.bones)) { b.rotation.z = this.restRot[k]; b.scale.set(1, 1, 1); b.position.copy(this.restLocal[k]); }
		for (const [k, v] of pose) {
			if (!k.startsWith("pose:")) continue;
			const [joint, side] = POSE[k.slice(5)] ?? [];
			const b = this.bones[joint];
			if (!b) continue;
			const a = v[0] - (this.offsets[k.slice(5)] ?? 0); // from the standard stance, not from this picture's pose
			b.rotation.z = this.restRot[joint] + flip * (side === 0 ? -a : side * a) * D; // centre bones: + leans toward her left (screen right from the front)
			if (v[1] !== 1) { // along the bone (a forearm reaching toward us, a bent knee): its picture shortens, what hangs after it moves in
				this.leaf[joint].scale.x = v[1];
				for (const ch of b.children) if (ch.isBone && ch !== this.leaf[joint]) ch.position.x = this.restLocal[ch.name].x * v[1];
			}
			width[joint] = v[2];
		}
		this.followThrough(h);
		// across the bone: -1 shows its other side. A forearm folded back over the upper arm turns over by itself as it's
		// drawn past ~110° (it narrows, then shows its other side), so a fist at her chest shows the sleeve the right way up
		for (const [joint, w] of Object.entries(width)) if (w) this.bones[joint].scale.y = w;
		for (const s of ["L", "R"]) {
			const b = this.bones["elbow" + s];
			if (!b || width["elbow" + s]) continue;
			const u = Math.min(1, Math.max(0, (Math.abs(this.drawnPose("foreArm" + s)) - 95) / 30)), w = Math.cos(Math.PI * u * u * (3 - 2 * u));
			b.scale.y = Math.sign(w || 1) * Math.max(0.15, Math.abs(w));
		}
		// the whole of her: feet on the ground, then position, hop, squash and stretch, turning
		const [px = 0, py = 0] = pose.get("pos") ?? [], lift = pose.get("lift") ?? 0, [sx = 1, sy = 1] = pose.get("squash") ?? [], turn = pose.get("turn") ?? 1;
		this.group.position.set(0, 0, 0);
		this.group.scale.set(1, 1, 1);
		const hips = this.bones.hips;
		if (ground) hips.position.y += this.lowRest - this.lowestFoot();
		hips.position.x += px * this.height; hips.position.y += (py + lift) * this.height;
		this.plantFeet(h, ground);
		// a little jelly: she squashes as she's pushed up or lands and stretches as she flies (a weight on a spring
		// riding on her hips), keeping her volume
		const hy = hips.position.y, j = (this.jelly = h > 0 && this.jelly ? this.jelly : { p: hy, v: 0, at: hy });
		if (h > 0) { const carried = (hy - j.at) / h; j.at = hy; j.v += (300 * (hy - j.p) - 20 * (j.v - carried)) * h; j.p += j.v * h; }
		const q = Math.max(-0.07, Math.min(0.07, ((j.p - hy) / this.height) * 2));
		// turning round (turn 1 → -1): she narrows, then shows her back (or, with no back view, her front mirrored), the
		// way anime cuts a spin; how fast she turns flings her hair, tail and hems out sideways
		this.fling = h > 0 && this.lastTurn !== undefined ? ((turn - this.lastTurn) / h) * 1.5 * this.height : 0;
		this.lastTurn = turn;
		const wide = Math.max(0.4, Math.abs(turn)), mirror = this.back || backView ? 1 : Math.sign(turn || 1);
		this.group.scale.set((sx / Math.sqrt(1 + q)) * wide * mirror * (this.facing ?? 1), sy * (1 + q), 1);
		this.springsStep(h);
		this.softStep(h);
	}

	// Feet stay where they land: a foot on the floor is planted, and its leg bends (two-bone IK) to keep it there while
	// the body moves over it, so feet don't slide. A foot the clip lifts lets go; one the clip carries far along the
	// floor takes a quick little step there and plants again.
	plantFeet(h, ground) {
		if (!ground || !(h > 0)) { this.plants = {}; return; }
		this.plants ??= {};
		this.group.updateMatrixWorld(true);
		const inv = this.group.matrixWorld.clone().invert(), v = new THREE.Vector3();
		const at = (j) => this.group.worldToLocal(this.bones[j].getWorldPosition(v.clone())).clone();
		const angle = (j) => { const e = inv.clone().multiply(this.bones[j].matrixWorld).elements; return Math.atan2(e[1], e[0]); };
		const turnBy = (j, a) => { this.bones[j].rotation.z += Math.atan2(Math.sin(a - angle(j)), Math.cos(a - angle(j))); this.group.updateMatrixWorld(true); };
		const floor = this.lowRest, tol = 0.015 * this.height, far = 0.05 * this.height, STEP_S = 0.15;
		for (const s of ["L", "R"]) {
			const [hip, knee, ankle, toe] = ["hip", "knee", "ankle", "toe"].map((n) => n + s);
			if (!this.bones[hip] || !this.bones[knee] || !this.bones[ankle] || this.bones[knee].scale.y < 0) continue;
			const H0 = at(hip), K0 = at(knee), A0 = at(ankle), down = Math.min(A0.y, this.bones[toe] ? at(toe).y : A0.y) <= floor + tol;
			let p = this.plants[s];
			if (!p) { if (down) this.plants[s] = { at: A0 }; continue; }
			if (!p.step && (!down || Math.abs(A0.x - p.at.x) > far)) p.step = { from: p.at, s: 0, lift: down }; // let go, or step
			let T = p.at;
			if (p.step) {
				p.step.s = Math.min(1, p.step.s + h / STEP_S);
				const u = p.step.s * p.step.s * (3 - 2 * p.step.s);
				T = p.step.from.clone().lerp(A0, u);
				if (p.step.lift) T.y += Math.sin(Math.PI * p.step.s) * 0.025 * this.height;
				if (p.step.s >= 1) { if (down) this.plants[s] = { at: A0 }; else delete this.plants[s]; continue; }
			}
			// two-bone IK: the thigh and shin that put the ankle at T, the knee bending the way it bends now (or out)
			const l1 = H0.distanceTo(K0), l2 = K0.distanceTo(A0), D2 = T.clone().sub(H0);
			const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D2.length()));
			const cross = (K0.x - H0.x) * (A0.y - K0.y) - (K0.y - H0.y) * (A0.x - K0.x);
			const bend = Math.abs(cross) > 0.1 * l1 * l2 ? Math.sign(cross) : (s === "L" ? -1 : 1) * (this.isBack ? -1 : 1);
			const thigh = Math.atan2(D2.y, D2.x) - bend * Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
			const K1 = H0.clone().add(new THREE.Vector3(Math.cos(thigh), Math.sin(thigh), 0).multiplyScalar(l1)), foot = angle(ankle);
			turnBy(hip, thigh);
			turnBy(knee, Math.atan2(T.y - K1.y, T.x - K1.x));
			turnBy(ankle, foot); // the shoe keeps the angle the pose gave it
		}
	}

	// What's drawn this frame: the face, and which seams show.
	draw(pose, dt) {
		// face: the clip's, else a mood set by a command; blinking and talking on top
		let face = pose.get("face") ?? (this.faceUntil === 0 || this.time < this.faceUntil ? this.face : "base");
		if (this.talk > 0) { this.talk -= dt; if (this.faces.talk && (face === "base" || face === "talk") && this.time % 0.24 < 0.12) face = "talk"; }
		if (face === "base" && this.faces.blink) {
			if (this.time > this.blinkAt + 0.13) this.blinkAt = this.time + 2.2 + Math.random() * 3;
			if (this.time > this.blinkAt) face = "blink";
		}
		this.material.map = this.faces[face] ?? this.faces.base;
		this.hideStretchedSeams();
	}

	// Follow-through and overlapping action: each posed bone chases its pose like a soft spring (a little lag, a little
	// overshoot, then it settles), and it chases it on screen, carried by its parent as drawn: when the upper arm swings,
	// the forearm and then the hand trail behind and catch up; when the body leans, the head follows a moment later.
	// Hands lag most, the body least.
	followThrough(h) {
		this.follow ??= {};
		const drawn = {}; // each joint's angle on screen (in her frame)
		for (const j of Object.keys(TREE)) {
			const b = this.bones[j];
			if (!b) continue;
			const up = b.parent?.isBone ? drawn[b.parent.name] ?? 0 : 0, want = up + b.rotation.z;
			if (!FOLLOWS.has(j)) { drawn[j] = want; continue; }
			const [k, c] = FOLLOW[j.replace(/[LR]$/, "")] ?? [300, 26], st = (this.follow[j] ??= { a: want, w: 0 });
			if (h > 0) { st.w += (k * (want - st.a) - c * st.w) * h; st.a += st.w * h; }
			else { st.a = want; st.w = 0; } // exactly the pose
			b.rotation.z = st.a - up;
			drawn[j] = st.a;
		}
	}

	// Soft regions: each soft bone is carried by its parent; it lags behind as the parent moves and springs back.
	softStep(h) {
		if (!this.softs.length) return;
		this.group.updateMatrixWorld(true);
		const tmp = new THREE.Vector3();
		for (const sf of this.softs) {
			const b = this.bones[sf.name], at = this.group.worldToLocal(b.getWorldPosition(tmp.set(0, 0, 0))).clone();
			if (!sf.p || !(h > 0)) { sf.p = at.clone(); sf.v = new THREE.Vector3(); sf.at = at; continue; }
			const { stiffness: k = 90, damping: c = 7, max = 0.035 } = sf.r.soft, carried = at.clone().sub(sf.at).divideScalar(h);
			sf.at = at;
			sf.v.addScaledVector(at.clone().sub(sf.p), k * h).addScaledVector(sf.v.clone().sub(carried), -c * h);
			sf.v.x += this.fling * h;
			sf.p.addScaledVector(sf.v, h);
			const o = sf.p.clone().sub(at), cap = max * this.height;
			if (o.length() > cap) sf.p.copy(at).add(o.setLength(cap));
			b.position.copy(b.parent.worldToLocal(this.group.localToWorld(sf.p.clone())));
		}
	}

	// Seams between parts that move apart: show each one only while it's less than about twice its size in the picture
	// and none of its edges is drawn out (a sliver from an armpit when the arm goes up).
	hideStretchedSeams() {
		if (!this.seams.length) return;
		this.group.updateMatrixWorld(true);
		const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], pos = new Map();
		for (const s of this.seams) {
			const g = s.mesh.geometry, at = g.attributes.position;
			pos.clear();
			let n = 0;
			for (let k = 0; k < s.all.length; k += 3) {
				for (let c = 0; c < 3; c++) {
					const i = s.all[k + c];
					if (!pos.has(i)) pos.set(i, s.mesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(at, i)));
					P[c].copy(pos.get(i));
				}
				if (s.area(P) < s.rest[k / 3] * 2.2 && s.longest(P) < s.edges[k / 3] * 1.8) { s.shown[n++] = s.all[k]; s.shown[n++] = s.all[k + 1]; s.shown[n++] = s.all[k + 2]; }
			}
			g.index.array.set(s.shown.subarray(0, n));
			g.index.needsUpdate = true;
			g.setDrawRange(0, n);
		}
	}

	// Spring chains (hair, tail): their points lag behind where the pose puts them and bounce back (a pull to the posed
	// shape, damping, gravity, fixed lengths); the bones are turned to point along them. Stiffness and damping are what
	// the chains were tuned with at 60 fps, now the same at any frame rate.
	springsStep(h) {
		if (!this.springs.length) return;
		this.group.updateMatrixWorld(true);
		const v = new THREE.Vector3(), local = (n) => this.group.worldToLocal(this.bones[n].getWorldPosition(v.clone())).clone();
		for (const s of this.springs) {
			const target = s.names.map(local);
			if (!s.pts || !(h > 0)) { s.pts = target.map((p) => ({ p: p.clone(), v: new THREE.Vector3(), q: p.clone() })); continue; }
			const K = (s.stiffness ?? 40) * 30, damp = Math.exp(-(s.damping ?? 6) * h), g = (s.gravity ?? 0.2) * this.height * 4;
			for (let i = 1; i < target.length; i++) {
				const pt = s.pts[i];
				pt.q.copy(pt.p);
				pt.v.multiplyScalar(damp).addScaledVector(target[i].clone().sub(pt.p), K * h);
				pt.v.y -= g * h;
				pt.v.x += this.fling * h;
				pt.p.addScaledVector(pt.v, h);
			}
			s.pts[0].p.copy(target[0]);
			for (let i = 1; i < target.length; i++) { // keep the lengths; what that moved is velocity too
				const pt = s.pts[i], L = target[i].distanceTo(target[i - 1]), d = pt.p.clone().sub(s.pts[i - 1].p);
				pt.p.copy(s.pts[i - 1].p).addScaledVector(d.normalize(), L);
				pt.v.copy(pt.p).sub(pt.q).divideScalar(h);
			}
			for (let i = 0; i + 1 < target.length; i++) { // turn each bone by the angle between where its child should be and where it is
				const want = Math.atan2(target[i + 1].y - target[i].y, target[i + 1].x - target[i].x), got = Math.atan2(s.pts[i + 1].p.y - s.pts[i].p.y, s.pts[i + 1].p.x - s.pts[i].p.x);
				let d = got - want; d = Math.atan2(Math.sin(d), Math.cos(d));
				const lim = (s.limit ?? 60) * D;
				this.bones[s.names[i]].rotation.z += Math.max(-lim, Math.min(lim, d));
				this.group.updateMatrixWorld(true);
				for (let j = i + 1; j < target.length; j++) target[j] = local(s.names[j]);
			}
		}
	}
}
