// The clip preview (preview.html?clip=NAME): Mochi on a little stage playing one clip on a loop, with a scrubber, speed,
// camera presets and orbiting. It reloads by itself when a clip file changes, so you can watch an agent edit it.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makeStage, loadActor, loadClips } from "./stage.js";
import { toon } from "./actor.js";

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const { renderer, scene, camera } = makeStage("#e9e2ff");
const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.15, 0.06, 64), toon("#fff3fb"));
disc.position.y = -0.03;
disc.receiveShadow = true;
scene.add(disc);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.012, 8, 96).rotateX(Math.PI / 2), toon("#b9a2ff"));
scene.add(ring);

const actor = await loadActor(scene, q.get("character") ?? "mochi");
const h = actor.def.height ?? 1.55;
$("name").textContent = actor.def.name ?? "character";
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const CAMS = { front: [[0, h * 0.55, h * 2.6], [0, h * 0.4, 0]], side: [[h * 2.6, h * 0.55, 0.2], [0, h * 0.4, 0]], face: [[0.3, h * 0.92, 1.15], [0, h * 0.86, 0]] };
function cam(name) {
	const [p, t] = CAMS[name];
	camera.position.set(...p); controls.target.set(...t); controls.update();
}
cam("front");

let clip, t = 0, playing = true, speed = 1, hold = 0;
function fillClips() {
	const names = Object.keys(actor.clips).filter((n) => !n.startsWith("zz_"));
	$("clip").replaceChildren(...names.map((n) => new Option(n, n)));
}
function choose(name) {
	clip = actor.clips[name] ?? Object.values(actor.clips)[0];
	$("clip").value = clip.name;
	$("about").textContent = clip.about ?? "";
	$("name").textContent = `${actor.def.name ?? "character"} · ${clip.name}`;
	history.replaceState(null, "", `?clip=${encodeURIComponent(clip.name)}`);
	t = 0; hold = 0;
}
fillClips();
choose(q.get("clip") ?? "cheer_dance");

$("clip").onchange = () => choose($("clip").value);
const setPlaying = (on) => { playing = on; $("play").textContent = on ? "⏸ Pause" : "▶ Play"; $("play").setAttribute("aria-pressed", on); };
$("play").onclick = () => setPlaying(!playing);
addEventListener("keydown", (e) => { if (e.code === "Space" && e.target.tagName !== "SELECT") { e.preventDefault(); setPlaying(!playing); } });
$("scrub").oninput = () => { setPlaying(false); t = Number($("scrub").value) * clip.duration; };
for (const b of document.querySelectorAll("[data-speed]")) b.onclick = () => {
	speed = Number(b.dataset.speed);
	for (const o of document.querySelectorAll("[data-speed]")) o.setAttribute("aria-pressed", o === b);
};
for (const b of document.querySelectorAll("[data-cam]")) b.onclick = () => cam(b.dataset.cam);

// an agent saved a clip: load it again and keep playing the one on screen
try {
	new EventSource("events?watch=1").onmessage = async (e) => {
		const m = JSON.parse(e.data);
		if (!m.reload?.startsWith("clips")) return;
		actor.setClips(await loadClips());
		fillClips();
		choose(clip.name);
	};
} catch { /* opened without the server: no live reload */ }

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
	timer.update();
	const dt = Math.min(timer.getDelta(), 0.1);
	if (playing) {
		if (hold > 0) { hold -= dt; if (hold <= 0) t = 0; }
		else {
			t += dt * speed;
			if (t >= clip.duration) { if (clip.loop) t %= clip.duration; else { t = clip.duration; hold = 0.8; } }
		}
	}
	actor.pinned = { clip, t };
	actor.update(dt * (playing ? speed : 1));
	$("scrub").value = t / clip.duration;
	$("time").textContent = `${t.toFixed(2)} / ${clip.duration.toFixed(2)} s`;
	controls.update();
	renderer.render(scene, camera);
});
