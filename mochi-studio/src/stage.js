// What the world page and the clip preview share: the renderer and light, loading a character with its clips, and the
// contact sheet agents read to check a clip (frames over time, front and side).
import * as THREE from "three";
import { Actor } from "./actor.js";

export function makeStage(background = "#c9d8e8") {
	const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.setSize(innerWidth, innerHeight);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	document.body.prepend(renderer.domElement);
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(background);
	const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 60);
	scene.add(new THREE.HemisphereLight("#fff6ea", "#b8a6c4", 1.9));
	const sun = new THREE.DirectionalLight("#fff1dc", 2.3);
	sun.position.set(2.5, 5, 3.5);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 });
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.02;
	scene.add(sun, sun.target);
	const fill = new THREE.DirectionalLight("#fff4f0", 0.7); // soft light from the camera's side so faces and walls aren't muddy
	fill.position.set(-1, 2.5, 5);
	scene.add(fill);
	addEventListener("resize", () => {
		renderer.setSize(innerWidth, innerHeight);
		camera.aspect = innerWidth / innerHeight;
		camera.updateProjectionMatrix();
	});
	return { renderer, scene, camera, sun };
}

export const getJSON = async (url) => (await fetch(url, { cache: "no-store" })).json();

export async function loadClips() {
	const names = Object.keys((await getJSON("content-index")).clips);
	return Object.fromEntries(await Promise.all(names.map(async (n) => [n, await getJSON(`content/clips/${n}.json`)])));
}

export async function loadActor(scene, character = "mochi", vrm) {
	const def = await getJSON(`content/characters/${character}.json`);
	if (vrm) def.model = vrm;
	const actor = new Actor(scene);
	await actor.load(def);
	actor.setClips(await loadClips());
	actor.setBase(def.base ?? "stand");
	for (let i = 0; i < 45; i++) actor.update(1 / 30); // let her hair and clothes settle
	return actor;
}

// A contact sheet of one clip: `frames` moments across it, a row per view (front, three, side, back); focus body, face or chest.
// Time runs from 0 at 30 fps so her hair and skirt move as they would.
export function sheet({ renderer, scene, camera, actor }, { clip, frames = 8, cell = 200, views = ["front", "side"], focus = "body" }) {
	const c = actor.clips[clip];
	if (!c) throw new Error(`no clip "${clip}"`);
	const at = actor.root.position.clone(), h = actor.def.height ?? 1.55, [dist, lookY] = { body: [h * 2.3, h * 0.5], face: [0.95, h * 0.92], chest: [1.25, h * 0.74] }[focus] ?? [h * 2.3, h * 0.5];
	const VIEWS = { front: [0, 0, 1], three: [0.7, 0, 0.7], side: [1, 0, 0], back: [0, 0, -1] };
	const out = document.createElement("canvas");
	out.width = cell * frames; out.height = Math.round(cell * 1.35) * views.length + 20;
	const g = out.getContext("2d");
	g.fillStyle = "#222"; g.fillRect(0, 0, out.width, out.height);
	const W = renderer.domElement.width, H = renderer.domElement.height, ch = Math.round(cell * 1.35);
	const saved = { aspect: camera.aspect, pos: camera.position.clone(), q: camera.quaternion.clone() };
	camera.aspect = W / H; camera.updateProjectionMatrix();
	actor.pinned = { clip: c, t: 0 };
	const times = Array.from({ length: frames }, (_, i) => (c.duration * i) / (c.loop ? frames : frames - 1));
	for (let t = -(c.loop ? c.duration : 0.5); t < 0; t += 1 / 30) { actor.pinned.t = c.loop ? t + c.duration : 0; actor.update(1 / 30); } // run in first
	let next = 0;
	for (let t = 0; next < frames; t += 1 / 30) {
		actor.pinned.t = Math.min(t, c.duration);
		actor.update(1 / 30);
		if (t + 1e-6 < times[next]) continue;
		views.forEach((v, row) => {
			const d = new THREE.Vector3(...VIEWS[v]).multiplyScalar(dist).applyQuaternion(actor.root.quaternion);
			camera.position.copy(at).add(d).setY(at.y + lookY + (focus === "body" ? h * 0.05 : 0));
			camera.lookAt(at.x, at.y + lookY, at.z);
			renderer.render(scene, camera);
			const sw = H * (cell / ch); // crop the middle of the frame to the cell's shape
			g.drawImage(renderer.domElement, (W - sw) / 2, 0, sw, H, next * cell, row * ch, cell, ch);
		});
		g.fillStyle = "#fff"; g.font = "14px system-ui";
		g.fillText(`${times[next].toFixed(2)} s`, next * cell + 6, views.length * ch + 15);
		next++;
	}
	actor.pinned = null;
	camera.position.copy(saved.pos); camera.quaternion.copy(saved.q); camera.aspect = saved.aspect; camera.updateProjectionMatrix();
	return out.toDataURL("image/jpeg", 0.85);
}
