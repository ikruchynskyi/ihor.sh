// A VRM character: loads the model, recolours it, gives her cat ears and a tail, and plays clips (content/clips/*.json,
// format in AGENTS.md): a looping base clip (stand, sit, walk) with an action clip blended over it, her face (clip,
// mood, blinking, talking) and her feet kept on the floor.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { findPath } from "./room.js";

const D = Math.PI / 180;
export const EASE = {
	linear: (u) => u,
	smooth: (u) => u * u * (3 - 2 * u),
	in: (u) => u * u * u,
	out: (u) => 1 - (1 - u) ** 3,
	back: (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2, // overshoots a little, then settles
	snap: (u) => (u < 1 ? 0 : 1),
};
// Hand shapes: curl of thumb, index, middle, ring, little (0 open, 1 closed). A clip may also give the five numbers.
export const HANDS = { open: [0, 0, 0, 0, 0], relaxed: [0.25, 0.2, 0.28, 0.34, 0.4], fist: [0.85, 1, 1, 1, 1], point: [0.85, 0, 1, 1, 1],
	peace: [0.85, 0, 0, 1, 1], cup: [0.45, 0.5, 0.55, 0.6, 0.65], paw: [0.3, 0.75, 0.75, 0.75, 0.75] };
const FINGERS = [["Thumb", ["Metacarpal", "Proximal", "Distal"], [15, 30, 45]], ["Index", ["Proximal", "Intermediate", "Distal"], [70, 90, 60]],
	["Middle", ["Proximal", "Intermediate", "Distal"], [75, 90, 60]], ["Ring", ["Proximal", "Intermediate", "Distal"], [80, 90, 60]],
	["Little", ["Proximal", "Intermediate", "Distal"], [85, 90, 60]]];
export const MOODS = ["happy", "angry", "sad", "relaxed", "surprised", "neutral"];

// A clip's keys as tracks: per bone a list of {t, q (quaternion), ease}; per face expression and hand {t, v}; the hips' offset.
export function compileClip(clip, vrm0) {
	const tracks = new Map(), sx = vrm0 ? -1 : 1; // VRM 0.x rigs are turned 180°: x and z rotations flip
	const push = (name, t, v, ease) => { if (!tracks.has(name)) tracks.set(name, []); tracks.get(name).push({ t, v, ease }); };
	for (const k of clip.keys ?? []) {
		const ease = EASE[k.ease] ?? EASE.smooth, t = Math.max(0, Number(k.t) || 0);
		for (const [b, r] of Object.entries(k.pose ?? {})) {
			const [x = 0, y = 0, z = 0] = r;
			push("bone:" + b, t, new THREE.Quaternion().setFromEuler(new THREE.Euler(sx * x * D, y * D, sx * z * D)), ease);
		}
		for (const [e, v] of Object.entries(k.face ?? {})) push("face:" + e, t, Number(v) || 0, ease);
		for (const [side, h] of Object.entries(k.hands ?? {})) push("hand:" + side, t, typeof h === "string" ? HANDS[h] ?? HANDS.relaxed : typeof h === "number" ? Array(5).fill(h) : h, ease);
		if (k.pos) push("pos", t, new THREE.Vector3(sx * (k.pos[0] || 0), k.pos[1] || 0, sx * (k.pos[2] || 0)), ease);
		if (k.lift !== undefined) push("lift", t, Number(k.lift) || 0, ease);
	}
	const duration = Number(clip.duration) || Math.max(0.1, ...[...tracks.values()].flat().map((k) => k.t));
	for (const list of tracks.values()) {
		list.sort((a, b) => a.t - b.t);
		if (clip.loop && list[list.length - 1].t < duration) list.push({ ...list[0], t: duration, ease: list[0].ease }); // wrap to the start
	}
	return { ...clip, duration, tracks, events: [...(clip.events ?? [])].sort((a, b) => a.t - b.t) };
}

const mix = (a, b, u) => {
	if (a.isQuaternion) return a.clone().slerp(b, u);
	if (a.isVector3) return a.clone().lerp(b, u);
	if (Array.isArray(a)) return a.map((x, i) => x + (b[i] - x) * u);
	return a + (b - a) * u;
};
// The clip's values at time t (seconds): Map name -> quaternion / number / array / vector.
export function sampleClip(c, t) {
	const out = new Map();
	for (const [name, list] of c.tracks) {
		if (t <= list[0].t || list.length === 1) { out.set(name, list[0].v); continue; }
		let i = list.findIndex((k) => k.t > t);
		if (i < 0) { out.set(name, list[list.length - 1].v); continue; }
		const a = list[i - 1], b = list[i], u = b.ease((t - a.t) / Math.max(1e-6, b.t - a.t));
		out.set(name, mix(a.v, b.v, u));
	}
	return out;
}

export class Actor {
	constructor(scene) {
		this.scene = scene;
		this.root = new THREE.Group(); // her place and heading on the floor; the model faces +Z inside it
		scene.add(this.root);
		this.clips = {};    // name -> compiled clip
		this.base = null;   // {clip, t}: the looping pose underneath (stand, sit, walk)
		this.action = null; // {clip, t, w, times, resolve}: a clip played over it
		this.mood = { name: "neutral", w: 0, until: Infinity };
		this.talk = 0;      // seconds of talking left (her mouth moves)
		this.blinkAt = 2;
		this.time = 0;
		this.path = [];       // where she's walking: [[x, z], ...]
		this.seat = null;     // the seat spot she's on
		this.look = { yaw: 0, pitch: 0, target: null }; // head turned toward a point (THREE.Vector3) or null
		this.held = null;     // {prop, home} in her hand
		this.waits = [];
	}

	// a promise that settles after `s` seconds of world time (fast-forwarded scripts stay in step)
	after(s) { return new Promise((r) => this.waits.push({ at: this.time + s, r })); }
	get doing() {
		if (this.path.length) return "walking";
		if (this.action) return `playing ${this.action.clip.name}`;
		return this.seat ? `sitting on the ${this.seat.id}` : "standing";
	}

	// Walk along a path around the furniture to (x, z), then turn to `face` (radians; 0 = +Z). Resolves on arrival.
	async walkTo(room, x, z, face, { run = false } = {}) {
		if (this.seat) await this.standUp();
		this.arrived?.(); // a walk that was still going ends here
		this.path = findPath(room, this.root.position.x, this.root.position.z, x, z);
		this.gait = this.clips[run ? "run" : "walk"] ? (run ? "run" : "walk") : "walk";
		this.setBase(this.gait);
		await new Promise((r) => (this.arrived = r));
		this.setBase("stand");
		if (face !== undefined) await this.turnTo(face);
	}
	turnTo(face) { this.heading = face; return this.after(0.45); }
	// Sit on a seat spot {x, z, face}: she stands in front of it facing out, then lowers herself back onto it.
	async sitOn(room, seat) {
		if (this.seat === seat) return;
		const fx = seat.x + Math.sin(seat.face) * 0.42, fz = seat.z + Math.cos(seat.face) * 0.42;
		await this.walkTo(room, fx, fz, seat.face);
		this.setBase("sit");
		this.slide = { from: this.root.position.clone(), to: new THREE.Vector3(seat.x, 0, seat.z), t: 0, d: 0.7 };
		this.seat = seat;
		await this.after(0.8);
	}
	async standUp() {
		if (!this.seat) return;
		const s = this.seat;
		this.seat = null;
		this.setBase("stand");
		this.slide = { from: this.root.position.clone(), to: new THREE.Vector3(s.x + Math.sin(s.face) * 0.42, 0, s.z + Math.cos(s.face) * 0.42), t: 0, d: 0.6 };
		await this.after(0.7);
	}
	// Turn her head and eyes toward a point (a THREE.Vector3 that may move, like the dog's position), or null for ahead.
	lookAt(point) { this.look.target = point; }

	// Hold a prop (a room prop entry) in a hand; `offset` (metres) and `turn` (degrees) place it in the palm.
	hold(prop, hand = "right", offset = [0, 0, 0], turn = [0, 0, 0]) {
		this.drop();
		const holder = new THREE.Group(); // hand-bone space turned to the VRM 1.0 convention, in metres
		holder.scale.setScalar(1 / this.scale);
		if (this.vrm0) holder.rotation.y = Math.PI;
		this.raw(`${hand}Hand`).add(holder);
		holder.add(prop.node);
		prop.node.position.set(...offset);
		prop.node.rotation.set(...turn.map((a) => a * D));
		this.held = { prop, holder };
	}
	drop() {
		if (!this.held) return;
		const { prop, holder } = this.held;
		prop.home.parent.add(prop.node);
		prop.node.position.copy(prop.home.pos);
		prop.node.rotation.copy(prop.home.rot);
		holder.removeFromParent();
		this.held = null;
	}

	async load(def) {
		this.def = def;
		const loader = new GLTFLoader();
		loader.register((p) => new VRMLoaderPlugin(p));
		const gltf = await loader.loadAsync(def.model);
		const vrm = (this.vrm = gltf.userData.vrm);
		this.vrm0 = vrm.meta?.metaVersion === "0";
		VRMUtils.removeUnnecessaryVertices(gltf.scene);
		VRMUtils.combineSkeletons(gltf.scene);
		VRMUtils.rotateVRM0(vrm); // VRM 0.x models face -Z; turn them to +Z like VRM 1.0
		vrm.scene.traverse((o) => { o.frustumCulled = false; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
		this.body = new THREE.Group(); // scaled model, lifted so her feet stay on the floor
		this.body.add(vrm.scene);
		this.root.add(this.body);
		this.bone = (name) => vrm.humanoid.getNormalizedBoneNode(name);
		this.raw = (name) => vrm.humanoid.getRawBoneNode(name);
		this.shape(def.body ?? {});
		vrm.update(0);
		const box = new THREE.Box3().setFromObject(vrm.scene);
		this.scale = (def.height ?? 1.55) / (box.max.y - box.min.y);
		this.body.scale.setScalar(this.scale);
		this.hipsRest = this.bone("hips").position.clone();
		this.footRest = this.footY();
		this.recolor(def.colors ?? {});
		if (def.ears) this.addEars(def.ears);
		if (def.tail) this.addTail(def.tail);
		this.springs(def.springs ?? {});
		vrm.springBoneManager?.setInitState(); // her hair and clothes start from the scaled, posed body
		return this;
	}

	// Body proportions as bone scales (1 = as modelled): head, legs (thighs down), bust (the model's Bust1 bones).
	shape({ head = 1, legs = 1, bust = 1 } = {}) {
		this.raw("head").scale.setScalar(head);
		for (const s of ["left", "right"]) this.raw(`${s}UpperLeg`).scale.setScalar(legs);
		this.vrm.scene.traverse((o) => { if (/bust1$/i.test(o.name)) o.scale.setScalar(bust); });
	}

	// Physics of the model's spring bones (hair, skirt, sleeves, bust…): for each key, the joints whose bone name contains
	// it get stiffness (spring back), gravity (pull down), drag (damping: low = bouncier) and limit (the most a bone may
	// swing from rest, degrees, so a big jump doesn't fling it).
	springs(groups) {
		this.limits = [];
		for (const j of this.vrm.springBoneManager?.joints ?? []) {
			for (const [key, g] of Object.entries(groups)) {
				if (!j.bone.name.toLowerCase().includes(key.toLowerCase())) continue;
				if (g.stiffness !== undefined) j.settings.stiffness = g.stiffness;
				if (g.gravity !== undefined) j.settings.gravityPower = g.gravity;
				if (g.drag !== undefined) j.settings.dragForce = g.drag;
				if (g.limit) this.limits.push({ bone: j.bone, rest: j.bone.quaternion.clone(), max: g.limit * D });
			}
		}
	}

	// Tint materials whose name contains a key (e.g. "HAIR", "Onepice", "Shoes"): multiplies the texture, so light parts take the colour best.
	recolor(colors) {
		this.vrm.scene.traverse((o) => {
			for (const m of o.isMesh ? [o.material].flat() : []) {
				for (const [key, c] of Object.entries(colors)) {
					if (!m.name.includes(key)) continue;
					m.color?.set(c);
					m.shadeColorFactor?.set(c).multiplyScalar(0.72);
				}
			}
		});
	}

	// Cat ears on her head: a hair-coloured outer cone and a pink inner one. `at` is metres from the head bone (x out to
	// the side, y up, z forward), `tilt` leans them outward (degrees).
	addEars({ color = "#f2cf8a", inner = "#ffb3c6", size = 1, at = [0.06, 0.12, -0.01], tilt = 18 } = {}) {
		const holder = new THREE.Group(); // head-bone space turned to the VRM 1.0 convention (+Z forward), in metres
		holder.scale.setScalar(1 / this.scale);
		if (this.vrm0) holder.rotation.y = Math.PI;
		this.raw("head").add(holder);
		this.ears = [];
		for (const side of [1, -1]) {
			const ear = new THREE.Group();
			const outer = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 3, 1), toon(color));
			const innerM = new THREE.Mesh(new THREE.ConeGeometry(0.033, 0.065, 3, 1), toon(inner));
			for (const m of [outer, innerM]) { m.rotation.y = Math.PI; m.scale.z = 0.55; m.castShadow = true; } // a flat face to the front
			innerM.position.set(0, -0.01, 0.012);
			ear.add(outer, innerM);
			ear.position.set(side * at[0], at[1], at[2]);
			ear.scale.setScalar(size);
			ear.rotation.set(-0.12, side * 0.25, -side * tilt * D);
			holder.add(ear);
			this.ears.push(ear);
		}
	}

	// A fluffy tail from her lower back: a tube along a curve that sways (faster when she's happy, curled when sitting).
	addTail({ color = "#f2cf8a", tip = "#fff4dc", length = 0.75, thickness = 0.035 } = {}) {
		this.tailDef = { length, thickness };
		this.tail = new THREE.Mesh(new THREE.BufferGeometry(), toon(color));
		this.tail.castShadow = true;
		this.tailTip = new THREE.Mesh(new THREE.SphereGeometry(thickness * 1.25, 10, 8), toon(tip));
		this.tailTip.castShadow = true;
		this.root.add(this.tail, this.tailTip);
	}

	updateTail(dt) {
		if (!this.tail) return;
		const hips = this.raw("hips"), p0 = new THREE.Vector3();
		hips.updateWorldMatrix(true, false);
		p0.setFromMatrixPosition(hips.matrixWorld);
		this.root.worldToLocal(p0);
		p0.y -= 0.06; p0.z -= 0.1;
		const { length: L, thickness: r } = this.tailDef, t = this.time, happy = this.mood.name === "happy" ? this.mood.w : 0;
		const speed = 2 + happy * 3, amp = 0.08 + happy * 0.06, seated = this.base?.clip.seated;
		const pts = [];
		for (let i = 0; i <= 8; i++) {
			const f = i / 8, sway = Math.sin(t * speed - f * 2.4) * amp * f * f;
			const y = seated ? -0.02 * f : L * (-0.22 * Math.sin(Math.PI * f) + 0.42 * f * f), z = -L * (seated ? 0.8 : 0.55) * f;
			pts.push(new THREE.Vector3(p0.x + sway, p0.y + y, p0.z + z));
		}
		const curve = new THREE.CatmullRomCurve3(pts), seg = 32, rad = 10;
		const geo = new THREE.TubeGeometry(curve, seg, r, rad, false), pos = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
		for (let i = 0; i <= seg; i++) {
			curve.getPointAt(i / seg, c);
			const k = 0.65 + 0.75 * (i / seg) ** 1.5; // fluffier toward the tip
			for (let j = 0; j <= rad; j++) {
				const n = i * (rad + 1) + j;
				v.fromBufferAttribute(pos, n).sub(c).multiplyScalar(k).add(c);
				pos.setXYZ(n, v.x, v.y, v.z);
			}
		}
		geo.computeVertexNormals();
		this.tail.geometry.dispose();
		this.tail.geometry = geo;
		this.tailTip.position.copy(pts[pts.length - 1]);
		this.tailTip.scale.setScalar(1.1);
	}

	// ---- clips ----
	setClips(raw) { for (const [name, c] of Object.entries(raw)) this.clips[name] = compileClip({ name, ...c }, this.vrm0); }
	setBase(name) {
		const clip = this.clips[name];
		if (!clip || this.base?.clip === clip) return;
		this.prevBase = this.base && { ...this.base, w: 1 };
		this.base = { clip, t: 0 };
		this.baseFade = 0;
	}
	// Play a clip over the base; resolves when it ends (a looping clip ends after `times` loops; times 0 = until stopped).
	play(name, { times = 1 } = {}) {
		const clip = this.clips[name];
		if (!clip) return Promise.reject(new Error(`no clip "${name}"`));
		this.stop();
		return new Promise((resolve) => { this.action = { clip, t: 0, w: 0, times, resolve, firedTo: -1 }; });
	}
	stop() { if (this.action) { this.action.ending = true; } }

	setMood(name, seconds = 4) {
		this.mood = { name: MOODS.includes(name) ? name : "neutral", w: this.mood.name === name ? this.mood.w : 0, until: seconds ? this.time + seconds : Infinity };
	}

	footY() {
		let y = Infinity;
		for (const b of ["leftToes", "rightToes", "leftFoot", "rightFoot"]) {
			const n = this.raw(b);
			if (!n) continue;
			n.updateWorldMatrix(true, false);
			y = Math.min(y, new THREE.Vector3().setFromMatrixPosition(n.matrixWorld).y);
		}
		return y;
	}

	update(dt) {
		const vrm = this.vrm;
		if (!vrm) return;
		this.time += dt;
		this.waits = this.waits.filter((w) => (this.time >= w.at ? (w.r(), false) : true));
		this.move(dt);
		const pose = new Map(), fade = (c) => Math.max(0.05, c.fade ?? 0.25);
		// base pose (cross-faded from the previous one)
		if (this.base) {
			this.base.t = (this.base.t + dt) % this.base.clip.duration;
			const b = sampleClip(this.base.clip, this.base.t);
			if (this.prevBase && this.baseFade < 1) {
				this.baseFade = Math.min(1, this.baseFade + dt / fade(this.base.clip));
				this.prevBase.t = (this.prevBase.t + dt) % this.prevBase.clip.duration;
				for (const [k, v] of sampleClip(this.prevBase.clip, this.prevBase.t)) pose.set(k, v);
				for (const [k, v] of b) pose.set(k, pose.has(k) ? mix(pose.get(k), v, this.baseFade) : v);
			} else for (const [k, v] of b) pose.set(k, v);
		}
		// a clip held at one moment (contact sheets, the preview's scrubber), else the action over the base, faded in and out
		const a = this.pinned ? null : this.action;
		if (this.pinned) for (const [k, v] of sampleClip(this.pinned.clip, this.pinned.t)) pose.set(k, v);
		if (a) {
			a.t += dt;
			const c = a.clip, end = c.loop ? (a.times ? a.times * c.duration : Infinity) : c.duration;
			if (a.t >= end - (c.loop ? 0 : fade(c) * 0.5)) a.ending = true;
			a.w = a.ending ? a.w - dt / fade(c) : Math.min(1, a.w + dt / fade(c));
			for (const e of c.events) if (e.t <= a.t % c.duration && e.t > a.firedTo) this.onEvent?.(e);
			a.firedTo = a.t % c.duration;
			const s = sampleClip(c, c.loop ? a.t % c.duration : Math.min(a.t, c.duration));
			const w = Math.max(0, a.w);
			for (const [k, v] of s) pose.set(k, pose.has(k) ? mix(pose.get(k), v, w) : k.startsWith("face:") ? v * w : v);
			if (a.w <= 0) { this.action = null; a.resolve(); }
		}
		// apply: bones, hands, hips offset
		const h = vrm.humanoid;
		for (const name of Object.keys(h.humanBones)) h.getNormalizedBoneNode(name)?.quaternion.identity();
		const hips = this.bone("hips");
		hips.position.copy(this.hipsRest);
		for (const [k, v] of pose) {
			if (k.startsWith("bone:")) this.bone(k.slice(5))?.quaternion.copy(v);
			else if (k === "pos") hips.position.add(v.clone().divideScalar(this.scale));
			else if (k.startsWith("hand:")) this.curl(k.slice(5), v);
		}
		// her head turned toward what she looks at (on top of the clip), eased
		let yaw = 0, pitch = 0;
		if (this.look.target) {
			const p = this.root.worldToLocal(this.look.target.clone()), head = h.getNormalizedBoneNode("head");
			yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(p.x, p.z)));
			pitch = Math.max(-0.5, Math.min(0.5, -Math.atan2(p.y - (this.def.height ?? 1.55) * 0.9, Math.hypot(p.x, p.z))));
			if (Math.abs(Math.atan2(p.x, p.z)) > 2) yaw = pitch = 0; // behind her: don't twist round
		}
		if (this.vrm.lookAt) { // her eyes
			this.lookDummy ??= new THREE.Object3D();
			if (this.look.target) this.lookDummy.position.copy(this.look.target);
			this.vrm.lookAt.target = this.look.target ? this.lookDummy : null;
		}
		this.look.yaw += (yaw - this.look.yaw) * Math.min(1, dt * 5);
		this.look.pitch += (pitch - this.look.pitch) * Math.min(1, dt * 5);
		const sx = this.vrm0 ? -1 : 1;
		for (const [b, k] of [["neck", 0.4], ["head", 0.6]]) {
			h.getNormalizedBoneNode(b)?.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sx * this.look.pitch * k, this.look.yaw * k, 0)));
		}
		// face: clip, then mood, blinking and talking on top
		const em = vrm.expressionManager;
		if (em) {
			for (const e of [...MOODS, "aa", "ih", "ou", "ee", "oh", "blink"]) em.setValue(e, 0);
			if (this.time > this.mood.until) this.setMood("neutral", 0);
			this.mood.w = Math.min(1, this.mood.w + dt * 4);
			const moodW = this.mood.name === "neutral" ? 0 : this.mood.w;
			if (moodW) em.setValue(this.mood.name, moodW * 0.9);
			for (const [k, v] of pose) if (k.startsWith("face:")) em.setValue(k.slice(5), Math.min(1, (em.getValue(k.slice(5)) ?? 0) + v));
			if (!pose.has("face:blink")) {
				if (this.time > this.blinkAt + 0.15) this.blinkAt = this.time + 2 + Math.random() * 3.5;
				const u = (this.time - this.blinkAt) / 0.15;
				const shut = Math.max(em.getValue("happy") ?? 0, em.getValue("blink") ?? 0); // a smile with closed eyes doesn't blink
				if (u > 0 && u < 1) em.setValue("blink", Math.max(em.getValue("blink"), Math.sin(u * Math.PI) * (1 - shut)));
			}
			if (this.talk > 0) {
				this.talk -= dt;
				const m = Math.abs(Math.sin(this.time * 13)) * 0.7 + Math.abs(Math.sin(this.time * 7.3)) * 0.3;
				em.setValue(this.time % 0.9 < 0.45 ? "aa" : "oh", Math.max(0.1, m) * 0.8);
			}
		}
		vrm.update(dt);
		for (const { bone, rest, max } of this.limits ?? []) {
			const a = bone.quaternion.angleTo(rest);
			if (a > max) bone.quaternion.copy(rest.clone().slerp(bone.quaternion, max / a));
		}
		// feet on the floor: lift or lower her so the lowest foot is where it was at rest (a clip with "ground": false can jump)
		const ground = ((this.pinned ?? a)?.clip.ground ?? true) && (this.base?.clip.ground ?? true);
		this.body.position.y = 0;
		if (ground) this.body.position.y = this.footRest - this.footY();
		this.body.position.y += pose.get("lift") ?? 0;
		this.updateTail(dt);
	}

	// along her path at the gait's speed, turning toward where she goes; sliding onto or off a seat; turning on the spot
	move(dt) {
		const r = this.root;
		if (this.path.length) {
			const [x, z] = this.path[0], dx = x - r.position.x, dz = z - r.position.z, d = Math.hypot(dx, dz);
			const speed = this.clips[this.gait]?.speed ?? 1, step = speed * dt;
			if (d > 0.05) this.heading = Math.atan2(dx, dz);
			if (d <= step) { r.position.x = x; r.position.z = z; this.path.shift(); if (!this.path.length) { this.arrived?.(); this.arrived = null; } }
			else { r.position.x += (dx / d) * step; r.position.z += (dz / d) * step; }
		}
		if (this.slide) {
			const s = this.slide;
			s.t = Math.min(1, s.t + dt / s.d);
			r.position.lerpVectors(s.from, s.to, EASE.smooth(s.t));
			if (s.t >= 1) this.slide = null;
		}
		if (this.heading !== undefined) {
			const d = Math.atan2(Math.sin(this.heading - r.rotation.y), Math.cos(this.heading - r.rotation.y));
			r.rotation.y += d * Math.min(1, dt * 7);
		}
	}

	curl(side, v) {
		const s = (side === "left" ? -1 : 1) * (this.vrm0 ? -1 : 1);
		FINGERS.forEach(([f, joints, deg], i) => joints.forEach((j, n) => {
			const b = this.bone(`${side}${f}${j}`);
			if (!b) return;
			if (f === "Thumb") b.quaternion.setFromEuler(new THREE.Euler(0, -s * deg[n] * D * v[i] * (n ? 1 : 0.5), s * deg[n] * D * v[i] * 0.4));
			else b.quaternion.setFromEuler(new THREE.Euler(0, 0, s * deg[n] * D * v[i]));
		}));
	}
}

const GRADIENT = (() => { const t = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
export const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT });
