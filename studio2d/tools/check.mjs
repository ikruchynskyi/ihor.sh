#!/usr/bin/env node
// The engine's motion checks: what plays, what's scrubbed, what's on a sheet and what's in a video must be the same
// motion, at any frame rate. Runs headless (tools/shot.mjs) on a character and exits 1 if a check fails.
//   node studio2d/tools/check.mjs [character]
import { execFileSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname), character = process.argv[2] ?? "mochi";
const probe = `(() => {
	const P = studio.puppet, V = studio.THREE.Vector3, R = {};
	const bend = (pre) => Object.keys(P.bones).filter((k) => k.startsWith(pre)).reduce((a, k) => a + Math.abs(P.bones[k].rotation.z - P.restRot[k]), 0) * 57.3;
	const run = (clip, dt, fn, until) => { const c = P.clips[clip]; P.action = null; P.pinned = { clip: c, t: 0 }; P.update(0);
		for (let t = dt; t <= (until ?? c.duration) + 1e-9; t += dt) { P.pinned = { clip: c, t: Math.min(t, c.duration) }; P.update(dt); fn(t); } };
	// hair and tail swing as far at 25 fps (videos) as at 60 or 120 (screens)
	R.swing = {};
	for (const fps of [25, 30, 60, 120]) { let tail = 0; run("happy_jump", 1 / fps, () => { tail = Math.max(tail, bend("tail")); }); R.swing[fps] = tail; }
	// scrubbing to a moment shows what playing to it shows
	const hand = () => P.bones.handR.getWorldPosition(new V());
	let played;
	run("cheer_dance", 1 / 60, () => { played = { hand: hand(), tail: bend("tail") }; }, 2.0);
	P.pinned = { clip: P.clips.cheer_dance, t: 5 }; P.update(0);
	P.pinned = { clip: P.clips.cheer_dance, t: 2.0 }; P.update(0);
	R.scrub = { handPx: hand().distanceTo(played.hand), tailDeg: Math.abs(bend("tail") - played.tail) };
	// a forearm turns over only where it's drawn folded past ~110°
	R.flips = [];
	let last = 1;
	run("happy_jump", 1 / 60, () => { for (const s of ["L", "R"]) { const b = P.bones["elbow" + s], w = Math.sign(b.scale.y);
		if (s === "R" && w !== last) R.flips.push(Math.abs(P.drawnPose("foreArm" + s))); if (s === "R") last = w; } });
	// a shortened forearm or shin doesn't skew the hand or shoe (squashing all of her is meant)
	R.skew = 0;
	run("happy_jump", 1 / 60, () => { for (const j of ["handR", "handL", "toeL", "toeR"]) {
		const e = P.group.matrixWorld.clone().invert().multiply(P.bones[j].matrixWorld).elements, ax = new V(e[0], e[1], 0), ay = new V(e[4], e[5], 0);
		if (Math.abs(Math.abs(P.bones["elbow" + j.at(-1)].scale.y) - 1) < 1e-6) R.skew = Math.max(R.skew, Math.abs(90 - ax.angleTo(ay) * 57.3)); } });
	return R;
})()`;
const out = execFileSync("node", [path.join(here, "shot.mjs"), "--query", `character=${character}`, JSON.stringify({ eval: probe })], { encoding: "utf8" });
const R = JSON.parse(out.trim().split("\n").at(-1));
const swings = Object.values(R.swing), fails = [];
const check = (ok, what) => { console.log(ok ? "ok  " : "FAIL", what); if (!ok) fails.push(what); };
check(Math.min(...swings) > 0.85 * Math.max(...swings), `tail swing the same at 25/30/60/120 fps: ${swings.map((s) => s.toFixed(1)).join(" / ")}°`);
check(R.scrub.handPx < 2 && R.scrub.tailDeg < 2, `scrubbed = played: hand ${R.scrub.handPx.toFixed(1)} px off, tail ${R.scrub.tailDeg.toFixed(1)}° off`);
check(R.flips.every((a) => a > 95 && a < 125), `forearm turns over at ${R.flips.map((a) => a.toFixed(0)).join(", ") || "-"}° (95–125)`);
check(R.skew < 1, `hands and shoes not skewed: ${R.skew.toFixed(1)}°`);
process.exit(fails.length ? 1 : 0);
