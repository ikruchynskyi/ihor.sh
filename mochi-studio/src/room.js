// A room from content/rooms/NAME.json (format in AGENTS.md): floor, walls with a window and its light, furniture from
// assets/furniture (Kenney's CC0 kit) or simple shapes, the spots where Mochi sits or uses things, and a walking grid.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toon } from "./actor.js";

const D = Math.PI / 180;
const KIT = 2; // Kenney's furniture is modelled at half size: ×2 makes a sofa 0.9 m tall
const loader = new GLTFLoader();
const cache = new Map();
async function model(name) {
	const url = name.includes("/") ? name : `assets/furniture/${name}.glb`;
	if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
	const g = await cache.get(url);
	const m = g.scene.clone(true);
	m.traverse((o) => {
		if (o.isLine || o.isPoints) o.visible = false; // stray edge lines in some kit models
		if (!o.isMesh) return;
		o.castShadow = o.receiveShadow = true;
		o.material = toon(o.material.color); // the flat-shaded kit drawn with the same cel shading as Mochi
	});
	return m;
}

// Small props built from shapes (no file needed): what she holds or what sits on tables.
const SHAPES = {
	cup: () => { // a tea cup with a handle and tea inside, 7 cm tall
		const g = new THREE.Group();
		const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.07, 20, 1, true), toon("#ffffff"));
		cup.material.side = THREE.DoubleSide;
		const base = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20).rotateX(Math.PI / 2), toon("#ffffff"));
		base.position.y = -0.035;
		const tea = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20).rotateX(-Math.PI / 2), toon("#b5652b"));
		tea.position.y = 0.02;
		const handle = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), toon("#ffffff"));
		handle.position.x = 0.045;
		g.add(cup, base, tea, handle);
		g.traverse((o) => { if (o.isMesh) o.position.y += 0.035; });
		return g;
	},
	teapot: () => {
		const g = new THREE.Group();
		const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 12), toon("#f4a7b9"));
		body.scale.y = 0.8; body.position.y = 0.056;
		const lid = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 6), toon("#ffffff"));
		lid.position.y = 0.115;
		const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.08, 8), toon("#f4a7b9"));
		spout.position.set(0.08, 0.07, 0); spout.rotation.z = -0.9;
		g.add(body, lid, spout);
		return g;
	},
	kettle: () => {
		const g = new THREE.Group();
		const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.13, 18), toon("#e6edf2"));
		body.position.y = 0.065;
		const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 14, Math.PI), toon("#333333"));
		handle.position.y = 0.13;
		g.add(body, handle);
		return g;
	},
	cushion: () => new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.1, 24).translate(0, 0.05, 0), toon("#ffb3c6")),
	box: ({ size = [0.3, 0.3, 0.3], color = "#cccccc" }) => new THREE.Mesh(new THREE.BoxGeometry(...size).translate(0, size[1] / 2, 0), toon(color)),
};

export async function buildRoom(scene, def, sun) {
	const room = { def, group: new THREE.Group(), objects: new Map(), props: new Map() };
	scene.add(room.group);
	const [W, Dp] = def.size ?? [6, 5], H = def.height ?? 2.7;
	room.bounds = { x0: -W / 2, x1: W / 2, z0: -Dp / 2, z1: Dp / 2, H };
	// floor and walls (back and left, plus a short right wall: the camera looks in from the front)
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp).rotateX(-Math.PI / 2), toon(def.floor ?? "#d9a877"));
	floor.receiveShadow = true;
	room.group.add(floor);
	// floorboards: thin darker lines
	for (let x = -W / 2 + 0.25; x < W / 2; x += 0.25) {
		const line = new THREE.Mesh(new THREE.PlaneGeometry(0.008, Dp).rotateX(-Math.PI / 2), toon(def.floorLines ?? "#c38f60"));
		line.position.set(x, 0.001, 0);
		room.group.add(line);
	}
	const wallMat = toon(def.wall ?? "#f6e7d6");
	const win = def.window ?? { at: 0, width: 2.2, bottom: 0.8, top: 2.2 };
	const wall = (w, h, x, y, z, ry = 0) => {
		const m = new THREE.Mesh(new THREE.BoxGeometry(w, h + 0.2, 0.1), wallMat); // taller than the room: no gap under the open ceiling
		m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = m.castShadow = true;
		room.group.add(m);
	};
	const bz = -Dp / 2 - 0.05, wl = win.at - win.width / 2, wr = win.at + win.width / 2;
	// the walls overlap at the corners (0.2 m past them): a seam lets the sun leak through as a bright line
	wall(wl + W / 2 + 0.2, H, (-W / 2 - 0.2 + wl) / 2, H / 2, bz);           // back wall left of the window
	wall(W / 2 + 0.2 - wr, H, (wr + W / 2 + 0.2) / 2, H / 2, bz);            // right of it
	wall(win.width, win.bottom, win.at, win.bottom / 2, bz);                  // under it
	wall(win.width, H - win.top, win.at, (H + win.top) / 2, bz);              // over it
	wall(Dp + 0.2, H, -W / 2 - 0.05, H / 2, -0.1, Math.PI / 2);              // left wall
	wall(Dp * 0.35 + 0.2, H, W / 2 + 0.05, H / 2, -Dp / 2 + Dp * 0.175 - 0.1, Math.PI / 2); // a short right wall
	const skirting = toon(def.trim ?? "#ffffff");
	for (const [w, x, z, ry] of [[W, 0, -Dp / 2 + 0.005, 0], [Dp, -W / 2 + 0.005, 0, Math.PI / 2]]) {
		const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.02), skirting);
		s.position.set(x, 0.04, z); s.rotation.y = ry;
		room.group.add(s);
	}
	// the window: a frame, a cross bar, the sky behind and curtains
	const frame = toon(def.trim ?? "#ffffff"), fw = 0.06;
	for (const [w, h, x, y] of [[win.width, fw, win.at, win.bottom], [win.width, fw, win.at, win.top], [fw, win.top - win.bottom, wl, (win.top + win.bottom) / 2],
		[fw, win.top - win.bottom, wr, (win.top + win.bottom) / 2], [fw * 0.6, win.top - win.bottom, win.at, (win.top + win.bottom) / 2], [win.width, fw * 0.6, win.at, (win.top + win.bottom) / 2 + 0.15]]) {
		const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frame);
		m.position.set(x, y, bz); m.castShadow = true;
		room.group.add(m);
	}
	const sky = new THREE.Mesh(new THREE.PlaneGeometry(win.width * 3, (win.top - win.bottom) * 3), new THREE.ShaderMaterial({
		uniforms: { top: { value: new THREE.Color(def.skyTop ?? "#7fb7ff") }, bottom: { value: new THREE.Color(def.skyBottom ?? "#ffe3c2") } },
		vertexShader: "varying vec2 v; void main() { v = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
		fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec2 v; void main() { gl_FragColor = vec4(mix(bottom, top, smoothstep(0.25, 0.85, v.y)), 1.0); }",
	}));
	sky.position.set(win.at, (win.top + win.bottom) / 2, bz - 1.2);
	room.group.add(sky);
	for (const s of [-1, 1]) {
		const c = new THREE.Mesh(new THREE.BoxGeometry(0.35, win.top - win.bottom + 0.5, 0.04), toon(def.curtains ?? "#ffc2d1"));
		c.position.set(win.at + s * (win.width / 2 + 0.12), (win.top + win.bottom) / 2 + 0.1, bz + 0.12);
		c.castShadow = true;
		room.group.add(c);
	}
	// sunlight through the window
	if (sun) {
		sun.position.set(win.at + 1.5, 4.2, bz - 3.2);
		sun.target.position.set(win.at - 0.4, 0, 0.6);
		sun.color.set(def.sun ?? "#ffe9c9");
	}
	// furniture and props
	await Promise.all((def.objects ?? []).map(async (o) => {
		const obj = await (SHAPES[o.model] ? SHAPES[o.model](o) : model(o.model));
		const fit = new THREE.Group();
		fit.add(obj);
		if (!SHAPES[o.model]) { // centre the kit model on its footprint, at real size
			obj.scale.setScalar(KIT * (o.scale ?? 1));
			const b = new THREE.Box3().setFromObject(obj);
			obj.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
		} else if (o.scale) obj.scale.setScalar(o.scale);
		if (o.color) obj.traverse((m) => { if (m.isMesh && (!o.colorOnly || m.material.color.getHexString() === o.colorOnly.replace("#", ""))) m.material = toon(o.color); });
		const place = new THREE.Group();
		place.add(fit);
		place.position.set(o.at[0], 0, o.at[1]);
		place.rotation.y = (o.turn ?? 0) * D;
		const box = new THREE.Box3().setFromObject(place);
		const entry = { def: o, node: place, box, top: box.max.y };
		(o.prop ? room.props : room.objects).set(o.id, entry);
		room.group.add(place);
	}));
	// props stand on what they're "on" (e.g. a cup on the table), at an offset from its centre
	for (const p of room.props.values()) {
		const host = room.objects.get(p.def.on);
		if (host) p.node.position.set(p.def.at[0], p.def.y ?? host.top, p.def.at[1]);
		p.home = { parent: room.group, pos: p.node.position.clone(), rot: p.node.rotation.clone() };
	}
	room.grid = makeGrid(room);
	return room;
}

// Where she goes to use an object: its `use` spot (or `seat` for seats), in room coordinates, and the way she faces there.
export function spot(room, id, kind = "use") {
	const o = room.objects.get(id) ?? room.props.get(id);
	if (!o) return null;
	const d = o.def, turn = (d.turn ?? 0) * D;
	const local = kind === "seat" && d.seat ? [d.seat[0], d.seat[1]] : d.use ?? [0, (o.box.max.z - o.box.min.z) / 2 + 0.45];
	const p = new THREE.Vector3(local[0], 0, local[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(o.node.position);
	// at a seat she faces the way the seat faces; elsewhere she faces the object
	const face = kind === "seat" ? turn : Math.atan2(o.node.position.x - p.x, o.node.position.z - p.z);
	return { x: p.x, z: p.z, face, height: d.seat?.[2] };
}

// ---- walking: a 10 cm grid of free floor, A* over it, and the path shortened to straight lines of sight ----
const CELL = 0.1, MARGIN = 0.22; // her half-width
function makeGrid(room) {
	const { x0, x1, z0, z1 } = room.bounds, nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
	const free = new Uint8Array(nx * nz).fill(1);
	for (const o of room.objects.values()) {
		if (o.def.walk || o.box.max.y < 0.05) continue; // rugs and other flat things are walked over
		for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
			const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
			if (x > o.box.min.x - MARGIN && x < o.box.max.x + MARGIN && z > o.box.min.z - MARGIN && z < o.box.max.z + MARGIN) free[i + j * nx] = 0;
		}
	}
	for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { // keep off the walls
		const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
		if (x < x0 + MARGIN || x > x1 - MARGIN || z < z0 + MARGIN) free[i + j * nx] = 0;
	}
	return { nx, nz, free, x0, z0 };
}
const cellOf = (g, x, z) => [Math.max(0, Math.min(g.nx - 1, Math.floor((x - g.x0) / CELL))), Math.max(0, Math.min(g.nz - 1, Math.floor((z - g.z0) / CELL)))];
const centre = (g, i, j) => [g.x0 + (i + 0.5) * CELL, g.z0 + (j + 0.5) * CELL];
function nearestFree(g, i, j) {
	for (let r = 0; r < 30; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
		const a = i + di, b = j + dj;
		if (a >= 0 && b >= 0 && a < g.nx && b < g.nz && g.free[a + b * g.nx]) return [a, b];
	}
	return [i, j];
}
function clear(g, ax, az, bx, bz) {
	const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 2));
	for (let k = 0; k <= n; k++) {
		const [i, j] = cellOf(g, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
		if (!g.free[i + j * g.nx]) return false;
	}
	return true;
}
// A path of points from (ax, az) to (bx, bz) around the furniture. Mochi may end just off the free floor (in front of a
// seat); with exact false (the dog) a blocked end becomes the nearest free floor.
export function findPath(room, ax, az, bx, bz, exact = true) {
	const g = room.grid;
	const s = nearestFree(g, ...cellOf(g, ax, az)), e = nearestFree(g, ...cellOf(g, bx, bz));
	const key = (i, j) => i + j * g.nx, goal = key(...e);
	const open = new Map([[key(...s), { i: s[0], j: s[1], g: 0, f: 0, from: null }]]), done = new Map();
	while (open.size) {
		let cur = null;
		for (const n of open.values()) if (!cur || n.f < cur.f) cur = n;
		const k = key(cur.i, cur.j);
		open.delete(k); done.set(k, cur);
		if (k === goal) break;
		for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
			const i = cur.i + di, j = cur.j + dj, nk = key(i, j);
			if (i < 0 || j < 0 || i >= g.nx || j >= g.nz || !g.free[nk] || done.has(nk)) continue;
			const cost = cur.g + Math.hypot(di, dj), old = open.get(nk);
			if (!old || cost < old.g) open.set(nk, { i, j, g: cost, f: cost + Math.hypot(e[0] - i, e[1] - j), from: cur });
		}
	}
	let n = done.get(goal);
	if (!n) return [[bx, bz]];
	const pts = [];
	for (; n; n = n.from) pts.unshift(centre(g, n.i, n.j));
	const [ei, ej] = cellOf(g, bx, bz);
	if (exact || g.free[ei + ej * g.nx]) pts.push([bx, bz]);
	const out = [];
	let a = [ax, az];
	for (let i = 0; i < pts.length; i++) { // keep a point only where the straight line from the last kept one is blocked
		if (i === pts.length - 1 || !clear(g, a[0], a[1], pts[i + 1][0], pts[i + 1][1])) { out.push(pts[i]); a = pts[i]; }
	}
	return out;
}
