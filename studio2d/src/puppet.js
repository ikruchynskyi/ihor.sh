// A 2D puppet from one picture: the cut-out (base.png) becomes a mesh bent by a skeleton placed on the picture
// (rig.json: joints, regions, spring chains, the face box). Each mesh point follows the bone it is closest to *inside*
// the silhouette; arms draw in front of the body and the tail behind; hair, tails and ears swing on springs; faces
// are whole pictures swapped in (faces/*.png, the same picture with only the face redrawn); her feet stay on the ground.
// Clips (clips/*.json) pose the bones over time; any clip works on any character.
import * as THREE from "three";

const D = Math.PI / 180;
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
const LAYERS = { back: 0, legs: 1, body: 2, hair: 3, head: 4, arms: 5, front: 6 };

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
		const ease = EASE[k.ease] ?? EASE.smooth, t = Math.max(0, +k.t || 0);
		for (const [b, v] of Object.entries(k.pose ?? {})) push("pose:" + b, t, Array.isArray(v) ? [+v[0] || 0, v[1] ?? 1] : [+v || 0, 1], ease);
		for (const f of ["pos", "squash"]) if (k[f]) push(f, t, [...k[f]], ease);
		for (const f of ["lift", "turn"]) if (k[f] !== undefined) push(f, t, +k[f], ease);
		if (k.face) push("face", t, k.face, EASE.snap);
	}
	const duration = +clip.duration || Math.max(0.1, ...[...tracks.values()].flat().map((k) => k.t));
	for (const list of tracks.values()) {
		list.sort((a, b) => a.t - b.t);
		if (clip.loop && list.at(-1).t < duration) list.push({ ...list[0], t: duration });
	}
	return { ...clip, duration, tracks, events: [...(clip.events ?? [])].sort((a, b) => a.t - b.t) };
}
const NEUTRAL = (k) => (k.startsWith("pose:") ? [0, 1] : k === "squash" ? [1, 1] : k === "pos" ? [0, 0] : k === "turn" ? 1 : 0);
const lerp = (a, b, u) => (Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * u) : typeof a === "number" ? a + (b - a) * u : u < 1 ? a : b);
export function sampleClip(c, t) {
	const out = new Map();
	for (const [k, list] of c.tracks) {
		const i = list.findIndex((x) => x.t > t);
		if (i <= 0) out.set(k, i === 0 ? list[0].v : list.at(-1).v);
		else { const a = list[i - 1], b = list[i]; out.set(k, lerp(a.v, b.v, b.ease((t - a.t) / Math.max(1e-6, b.t - a.t)))); }
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
		this.dir = dir;
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
		const make = (name, at, parent) => {
			const b = new THREE.Bone(), [x, y] = this.toWorld(at);
			b.name = name;
			const p = parent ? this.rest[parent] : [0, 0];
			b.position.set(x - p[0], y - p[1], 0);
			(parent ? this.bones[parent] : this.group).add(b);
			this.bones[name] = b; this.rest[name] = [x, y];
		};
		for (const [j, p] of Object.entries(TREE)) if (J[j]) make(j, J[j], p && J[p] ? p : p ? TREE[p] : null);
		this.springs = (rig.springs ?? []).map((s) => {
			const parent = s.parent === "head" ? "neck" : s.parent, names = s.points.map((_, i) => `${s.name}${i}`);
			s.points.forEach((pt, i) => make(names[i], pt, i ? names[i - 1] : parent));
			return { ...s, names, pts: null };
		});
		const order = Object.keys(this.bones);
		this.root.updateMatrixWorld(true); // the skeleton's bind pose is the picture's pose
		this.skeleton = new THREE.Skeleton(order.map((n) => this.bones[n]));
		const index = Object.fromEntries(order.map((n, i) => [n, i]));
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
		// weights: the bone, blended with its parent near the joint it turns on (soft elbows, shoulders, knees); the layer
		// from the far joint (arms in front, legs behind the coat, the head over the body) or the region
		const parentOf = (b) => (this.bones[b].parent?.isBone ? this.bones[b].parent.name : b);
		const layerOf = (L) => L.layer ?? (L.seg[3] ? LAYERS.hair : /^(elbow|wrist|hand)[LR]$/.test(L.seg[4]) ? LAYERS.arms
			: /^(knee|ankle|toe)[LR]$/.test(L.seg[4]) ? LAYERS.legs : L.seg[4] === "head" ? LAYERS.head : LAYERS.body);
		const skinIndex = [], skinWeight = [], vLayer = new Array(n);
		for (let v = 0; v < n; v++) {
			const L = label[v] ?? { seg: ["hips", J.hips, J.spine, null, "spine"], u: 0.5 }, b = L.seg[0], u0 = Math.max(0, L.u0 ?? 0);
			const blend = b !== "hips" && L.u < u0 + 0.25 ? 0.5 * (1 - Math.max(0, L.u - u0) / 0.25) : 0;
			skinIndex.push(index[b], index[parentOf(b)], 0, 0);
			skinWeight.push(1 - blend, blend, 0, 0);
			vLayer[v] = regionLayer[v] !== null ? LAYERS[regionLayer[v]] : layerOf(L);
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
				// every frame and hidden while it's stretched (what was behind the arm was never drawn)
				const bones = new Set(t.map((x) => label[x]?.seg[0]));
				const linked = bones.size === 2 && [...bones].some((b) => [...bones].some((c) => b !== c && this.bones[b]?.parent?.name === c));
				(bones.size > 1 && !linked ? seams : tris)[layer].push(...t);
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
			const rest = []; for (let k = 0; k < t.length; k += 3) rest.push(Math.max(1, area([v(t[k]), v(t[k + 1]), v(t[k + 2])])));
			return { mesh: m, all: t, rest, area, shown: new Uint32Array(t.length) };
		}).filter(Boolean);
		this.restLocal = Object.fromEntries(Object.entries(this.bones).map(([k, b]) => [k, b.position.clone()]));
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
		const names = Object.keys(this.bones), hue = (b) => (names.indexOf(b) * 137.5) % 360;
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

	update(dt) {
		if (!this.meshes) return;
		const pose = this.sample(dt);
		this.apply(pose, dt, (this.pinned ?? this.action ?? this.base)?.clip.ground !== false);
		if (this.back) { // her back view takes the same pose; she shows it while turned round (turn < 0)
			this.back.time = this.time;
			this.back.apply(pose, dt, (this.pinned ?? this.action ?? this.base)?.clip.ground !== false, true);
			const behind = (pose.get("turn") ?? 1) < 0;
			this.group.visible = !behind; this.back.group.visible = behind;
		}
	}

	// The pose now: the base clip, then a clip held at one moment (sheets, the scrubber) or the action faded over it.
	sample(dt) {
		this.time += dt;
		const pose = new Map(), fade = (c) => Math.max(0.05, c.fade ?? 0.25);
		if (this.base) { this.base.t = (this.base.t + dt) % this.base.clip.duration; for (const [k, v] of sampleClip(this.base.clip, this.base.t)) pose.set(k, v); }
		const a = this.pinned ? null : this.action;
		if (this.pinned) for (const [k, v] of sampleClip(this.pinned.clip, this.pinned.t)) pose.set(k, v);
		if (a) {
			a.t += dt;
			const c = a.clip, end = c.loop ? (a.times ? a.times * c.duration : Infinity) : c.duration;
			if (a.t >= end - (c.loop ? 0 : fade(c) * 0.5)) a.ending = true;
			a.w = a.ending ? a.w - dt / fade(c) : Math.min(1, a.w + dt / fade(c));
			const lt = c.loop ? a.t % c.duration : Math.min(a.t, c.duration);
			for (const e of c.events) if (e.t <= lt && e.t > a.fired) this.onEvent?.(e);
			a.fired = lt < a.fired ? -1 : lt;
			const w = Math.max(0, a.w);
			for (const [k, v] of sampleClip(c, lt)) pose.set(k, k === "face" ? (w > 0.5 ? v : pose.get(k)) : lerp(pose.get(k) ?? NEUTRAL(k), v, w));
			if (a.w <= 0) { this.action = null; a.resolve("done"); }
		}
		return pose;
	}

	// Put this view of her in a pose. The back view is the front mirrored (her left is on the picture's left), so every
	// turn goes the other way round on screen.
	apply(pose, dt, ground = true, backView = false) {
		const flip = backView ? -1 : 1;
		for (const [k, b] of Object.entries(this.bones)) { b.rotation.z = 0; b.scale.set(1, 1, 1); b.position.copy(this.restLocal[k]); }
		for (const [k, v] of pose) {
			if (!k.startsWith("pose:")) continue;
			const [joint, side] = POSE[k.slice(5)] ?? [];
			const b = this.bones[joint];
			if (!b) continue;
			b.rotation.z = flip * (side === 0 ? -v[0] : side * v[0]) * D; // centre bones: + leans toward her left (screen right from the front)
			if (v[1] !== 1) b.scale.y = v[1];
		}
		// the whole of her: feet on the ground, then position, hop, squash and stretch, turning
		const [px = 0, py = 0] = pose.get("pos") ?? [], lift = pose.get("lift") ?? 0, [sx = 1, sy = 1] = pose.get("squash") ?? [], turn = pose.get("turn") ?? 1;
		this.group.position.set(0, 0, 0);
		this.group.scale.set(1, 1, 1);
		const hips = this.bones.hips;
		if (ground) hips.position.y += this.lowRest - this.lowestFoot();
		hips.position.x += px * this.height; hips.position.y += (py + lift) * this.height;
		// turning round (turn 1 → -1): she narrows to a quarter, then shows her back (or, with no back view, her front
		// mirrored), the way anime cuts a spin
		const width = Math.max(0.22, Math.abs(turn)), mirror = this.back || backView ? 1 : Math.sign(turn || 1);
		this.group.scale.set(sx * width * mirror * (this.facing ?? 1), sy, 1);
		this.springsStep(dt);
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

	// Seams between parts that move apart: show each one only while it's less than twice its size in the picture.
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
				if (s.area(P) < s.rest[k / 3] * 2.2) { s.shown[n++] = s.all[k]; s.shown[n++] = s.all[k + 1]; s.shown[n++] = s.all[k + 2]; }
			}
			g.index.array.set(s.shown.subarray(0, n));
			g.index.needsUpdate = true;
			g.setDrawRange(0, n);
		}
	}

	// Spring chains (hair, tail): their points lag behind where the pose puts them and bounce back (Verlet with a pull
	// to the posed shape, gravity, and fixed lengths); the bones are turned to point along them.
	springsStep(dt) {
		if (!this.springs.length) return;
		this.group.updateMatrixWorld(true);
		const v = new THREE.Vector3();
		for (const s of this.springs) {
			const target = s.names.map((n) => this.group.worldToLocal(this.bones[n].getWorldPosition(v.clone())).clone());
			if (!s.pts || !dt) { s.pts = target.map((p) => ({ p: p.clone(), q: p.clone() })); continue; }
			const k = s.stiffness ?? 40, damp = Math.exp(-(s.damping ?? 6) * dt), g = (s.gravity ?? 0.2) * this.height * 4;
			for (let i = 1; i < target.length; i++) {
				const pt = s.pts[i], vel = pt.p.clone().sub(pt.q).multiplyScalar(damp);
				pt.q.copy(pt.p);
				pt.p.add(vel).addScaledVector(target[i].clone().sub(pt.p), Math.min(1, k * dt * dt * 30)).add(new THREE.Vector3(0, -g * dt * dt, 0));
			}
			s.pts[0].p.copy(target[0]); s.pts[0].q.copy(target[0]);
			for (let i = 1; i < target.length; i++) { // keep the lengths
				const L = target[i].distanceTo(target[i - 1]), d = s.pts[i].p.clone().sub(s.pts[i - 1].p);
				s.pts[i].p.copy(s.pts[i - 1].p).addScaledVector(d.normalize(), L);
			}
			for (let i = 0; i + 1 < target.length; i++) { // turn each bone by the angle between where its child should be and where it is
				const want = Math.atan2(target[i + 1].y - target[i].y, target[i + 1].x - target[i].x), got = Math.atan2(s.pts[i + 1].p.y - s.pts[i].p.y, s.pts[i + 1].p.x - s.pts[i].p.x);
				let d = got - want; d = Math.atan2(Math.sin(d), Math.cos(d));
				const lim = (s.limit ?? 60) * D;
				this.bones[s.names[i]].rotation.z += Math.max(-lim, Math.min(lim, d));
				this.group.updateMatrixWorld(true);
				for (let j = i + 1; j < target.length; j++) target[j] = this.group.worldToLocal(this.bones[s.names[j]].getWorldPosition(v.clone())).clone();
			}
		}
	}
}
