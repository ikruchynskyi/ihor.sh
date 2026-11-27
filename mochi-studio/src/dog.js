// Mochi's dog (Quaternius' CC0 low-poly dog, coloured like a shiba): walks and idles with its own animations, wags,
// sits, lies down, hops and barks; follows Mochi when called, wanders when bored, and is happy when she pets it.
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { toon } from "./actor.js";
import { findPath } from "./room.js";

export class Dog {
	constructor(scene, room) {
		this.room = room;
		this.root = new THREE.Group();
		scene.add(this.root);
		this.state = "idle"; // idle, walk, sit, lie
		this.path = [];
		this.happy = 0;    // tail speed and hops while > 0 (seconds)
		this.time = 0;
		this.pose = 0;     // eased 0 standing .. 1 sitting / lying
		this.hop = 0;
		this.boredAt = 8;
	}

	async load(def = {}) {
		const fbx = await new FBXLoader().loadAsync(def.model ?? "assets/animals/Dog.fbx");
		const b = new THREE.Box3().setFromObject(fbx);
		const s = (def.height ?? 0.5) / (b.max.y - b.min.y);
		fbx.scale.setScalar(s);
		fbx.rotation.y = -Math.PI / 2; // the model walks along +X: turn it to +Z like Mochi
		fbx.traverse((o) => { if (o.isMesh) { o.material = toon(def.color ?? "#e2a15e"); o.castShadow = true; o.frustumCulled = false; } });
		this.body = new THREE.Group(); // tilted back when sitting
		this.body.add(fbx);
		this.root.add(this.body);
		this.mixer = new THREE.AnimationMixer(fbx);
		this.clips = Object.fromEntries(fbx.animations.map((a) => [a.name.split("|").pop().toLowerCase(), this.mixer.clipAction(a)]));
		this.clips.idle?.play();
		// the tail: the bone furthest back
		let back = null, p = new THREE.Vector3();
		fbx.updateMatrixWorld(true);
		fbx.traverse((o) => { if (o.isBone && /^Bone\d*$/.test(o.name)) { o.getWorldPosition(p); if (!back || p.z < back.z) back = { bone: o, z: p.z }; } });
		this.tail = back?.bone;
		this.tailRest = this.tail?.quaternion.clone();
		return this;
	}

	get position() { return this.root.position; }
	// a promise that settles after `s` seconds of world time (fast-forwarded scripts stay in step)
	after(s) { return new Promise((r) => (this.waits ??= []).push({ at: this.time + s, r })); }

	// Commands (the MCP "dog" tool). Returns a promise that settles when the dog has done it.
	do(action, mochi, target) {
		this.wander = false;
		this.boredAt = this.time + 20;
		switch (action) {
			case "come": { const p = mochi.root.position, f = mochi.root.rotation.y; return this.go(p.x + Math.sin(f) * 0.75 + Math.cos(f) * 0.3, p.z + Math.cos(f) * 0.75 - Math.sin(f) * 0.3, mochi); }
			case "go": return target ? this.go(target.x, target.z) : Promise.reject(new Error("go where?"));
			case "sit": case "lie": this.path = []; this.state = action; return this.after(0.8);
			case "stand": this.state = "idle"; return this.after(0.5);
			case "wander": this.wander = true; this.boredAt = this.time; return this.after(0.3);
			case "wag": this.happy = Math.max(this.happy, 4); return this.after(1.5);
			case "jump": this.hop = 0.01; this.happy = Math.max(this.happy, 3); return this.after(0.9);
			case "bark": this.bark = 0.6; this.onBark?.(); return this.after(0.9);
			default: return Promise.reject(new Error(`the dog can: come, go, sit, lie, stand, wander, wag, jump, bark`));
		}
	}
	go(x, z, face) {
		this.state = "walk";
		this.path = findPath(this.room, this.position.x, this.position.z, x, z, false);
		this.faceAfter = face;
		return new Promise((r) => (this.arrived = r));
	}
	petted(seconds = 4) { this.happy = Math.max(this.happy, seconds + 1.5); if (this.state === "walk") this.path = []; this.state = "sit"; }

	update(dt, mochi) {
		if (!this.mixer) return;
		this.time += dt;
		this.waits = (this.waits ?? []).filter((w) => (this.time >= w.at ? (w.r(), false) : true));
		this.happy = Math.max(0, this.happy - dt);
		// bored: wander to a random free spot now and then
		if (this.state !== "walk" && (this.wander || this.time > this.boredAt) && this.state !== "lie") {
			this.boredAt = this.time + 12 + Math.random() * 14;
			const b = this.room.bounds, x = b.x0 + 0.6 + Math.random() * (b.x1 - b.x0 - 1.2), z = b.z0 + 0.8 + Math.random() * (b.z1 - b.z0 - 1.2);
			this.go(x, z);
		}
		// walking along the path
		if (this.state === "walk") {
			const next = this.path[0];
			if (!next) {
				this.state = "idle";
				if (this.faceAfter) this.turnTo = Math.atan2(this.faceAfter.root.position.x - this.position.x, this.faceAfter.root.position.z - this.position.z);
				this.arrived?.(); this.arrived = null;
			} else {
				const dx = next[0] - this.position.x, dz = next[1] - this.position.z, d = Math.hypot(dx, dz), step = 1.3 * dt;
				this.turnTo = Math.atan2(dx, dz);
				if (d <= step) { this.position.x = next[0]; this.position.z = next[1]; this.path.shift(); }
				else { this.position.x += (dx / d) * step; this.position.z += (dz / d) * step; }
			}
		}
		if (this.turnTo !== undefined) {
			let d = this.turnTo - this.root.rotation.y;
			d = Math.atan2(Math.sin(d), Math.cos(d));
			this.root.rotation.y += d * Math.min(1, dt * 8);
		}
		const walking = this.state === "walk";
		this.clips.walk && (this.clips.walk.weight = walking ? 1 : 0, walking && !this.clips.walk.isRunning() && this.clips.walk.play());
		this.clips.idle && (this.clips.idle.weight = walking ? 0 : 1);
		this.mixer.update(dt);
		// sitting tilts the body back onto its haunches; lying lowers it flat
		const target = this.state === "sit" ? 1 : this.state === "lie" ? 2 : 0;
		this.pose += (target - this.pose) * Math.min(1, dt * 5);
		const sit = Math.min(1, this.pose), lie = Math.max(0, this.pose - 1);
		this.body.rotation.x = -0.45 * sit * (1 - lie);
		this.body.position.set(0, -0.08 * sit - 0.12 * lie, -0.08 * sit);
		// hops (jump, or now and then when very happy)
		if (this.hop > 0) { this.hop += dt; if (this.hop > 0.45) this.hop = 0; }
		else if (this.happy > 2 && !walking && Math.random() < dt * 0.25) this.hop = 0.01;
		this.root.position.y = this.hop > 0 ? Math.sin((this.hop / 0.45) * Math.PI) * 0.16 : 0;
		// the tail: a lazy sway, fast when happy
		if (this.tail) {
			const f = this.happy > 0 ? 16 : 4, a = this.happy > 0 ? 0.7 : 0.25;
			this.tail.quaternion.copy(this.tailRest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(this.time * f) * a));
		}
		if (this.bark > 0) this.bark -= dt;
	}

	describe() {
		const p = this.position, doing = { walk: "walking", sit: "sitting", lie: "lying down" }[this.state] ?? (this.happy ? "wagging its tail" : "standing");
		return { at: [+p.x.toFixed(2), +p.z.toFixed(2)], doing, happy: this.happy > 0 };
	}
}

