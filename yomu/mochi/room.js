// Mochi's room (yomu/mochi/bg/, made with Qwen-Image on this machine) as part of her scene, not a page background
// (overlay.html?room): picked by the visitor's time of day, it moves a little with her camera (parallax) and drifts like
// a held camera, goes out of focus when the camera comes close to her, lights her in its own colours, and has a little
// life of its own: rain or snow in the window, sakura petals, steam over the tea, dust in the light, lamps that flicker.
// Positions are fractions of the square picture. overlay.js calls MochiRoom.camera() every frame.
const ROOMS = {
	1: { when: "night", grade: "brightness(.84) sepia(.16)", light: { x: .37, y: .39, rgb: "255,186,110", r: .55, flicker: true },
	     fx: [{ type: "rain", rect: [.75, .02, .99, .55] }, { type: "motes", rect: [.18, .25, .55, .62], rgb: "255,214,150", n: 22 }, { type: "glow", at: [[.37, .39]], r: .07, rgb: "255,200,120" }] },
	2: { when: "day", grade: "brightness(1.02) sepia(.06)", light: { x: .12, y: .3, rgb: "255,240,214", r: .9 },
	     fx: [{ type: "steam", at: [.21, .73] }, { type: "motes", rect: [.02, .05, .55, .72], rgb: "255,248,226", n: 30 }] },
	3: { when: "day", grade: "brightness(1.05) saturate(1.05)", light: { x: .66, y: .22, rgb: "255,232,238", r: .9 },
	     fx: [{ type: "petals", rect: [.32, 0, .99, .55], n: 16 }, { type: "motes", rect: [.25, .15, .95, .85], rgb: "255,250,240", n: 24 }], front: { type: "petals", n: 4 } },
	4: { when: "night", grade: "brightness(.82) sepia(.2)", light: { x: .57, y: .56, rgb: "255,196,118", r: .5, flicker: true },
	     fx: [{ type: "snow", rect: [.05, .05, .28, .65] }, { type: "glow", at: [[.57, .56]], r: .09, rgb: "255,205,130" }] },
	5: { when: "evening", grade: "brightness(.92) saturate(1.06)", light: { x: .5, y: .18, rgb: "255,196,170", r: 1 },
	     fx: [{ type: "glow", twinkle: true, r: .03, rgb: "220,255,200", at: [[.04, .26], [.17, .28], [.3, .28], [.42, .28], [.53, .26], [.64, .24], [.74, .2], [.82, .16], [.89, .13]] },
	          { type: "fireflies", rect: [0, .55, 1, .95], n: 9 }] },
};
const WHEN = (h) => h >= 6 && h < 16 ? "day" : h >= 16 && h < 19 ? "evening" : "night";

window.MochiRoom = (() => {
	const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const room = document.getElementById("room"), back = document.getElementById("fx"), front = document.getElementById("fxFront");
	const light = document.getElementById("light");
	const cam = { z: 1, fx: innerWidth / 2, fy: innerHeight / 2, lx: 0, ly: 0 };
	let def = null, parts = [], frontParts = [], last = performance.now(), near = false;
	const rnd = (a, b) => a + Math.random() * (b - a);
	// the picture's square, covering the frame (as background-size: cover)
	const cover = () => { const s = Math.max(innerWidth, innerHeight); return { s, ox: (innerWidth - s) / 2, oy: (innerHeight - s) / 2 }; };

	function make(f, front) {
		const [x0, y0, x1, y1] = f.rect || [0, 0, 1, 1];
		const n = f.n ?? { rain: 40, snow: 60, steam: 9, fireflies: 9 }[f.type] ?? 12;
		const one = () => ({ f, x: rnd(x0, x1), y: rnd(y0, y1), a: rnd(0, 6.28), s: rnd(.6, 1.4), t: rnd(0, 1) });
		if (f.type === "glow") return f.at.map(([x, y]) => ({ f, x, y, a: rnd(0, 6.28), s: 1 }));
		if (f.type === "steam") return Array.from({ length: n }, (_, i) => ({ f, x: f.at[0], y: f.at[1], t: i / n, a: rnd(0, 6.28), s: rnd(.8, 1.2) }));
		return Array.from({ length: n }, front ? () => ({ ...one(), x: rnd(-.1, 1.1), y: rnd(-.2, 1), big: true }) : one);
	}

	function step(p, dt, now) {
		const f = p.f, [x0, y0, x1, y1] = f.rect || [0, 0, 1, 1];
		if (f.type === "rain") { p.y += dt * 1.1 * p.s; p.x -= dt * .08; if (p.y > y1) { p.y = y0 - .02; p.x = rnd(x0, x1); } }
		else if (f.type === "snow") { p.y += dt * .05 * p.s; p.x += Math.sin(now / 1100 + p.a) * dt * .012; if (p.y > y1) { p.y = y0; p.x = rnd(x0, x1); } }
		else if (f.type === "petals") { p.y += dt * .045 * p.s; p.x += dt * (.025 + Math.sin(now / 1300 + p.a) * .02); p.a += dt * 1.6;
			if (p.y > y1 + .05 || p.x > x1 + .05) { p.y = y0 - .03; p.x = rnd(x0 - .1, x1); } }
		else if (f.type === "steam") { p.t += dt / 4.5; if (p.t > 1) p.t -= 1; }
		else if (f.type === "motes" || f.type === "fireflies") {
			const sp = f.type === "fireflies" ? .03 : .008;
			p.x += Math.cos(p.a) * dt * sp; p.y += Math.sin(p.a) * dt * sp * .6; p.a += rnd(-1, 1) * dt * 1.5;
			if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) { p.a += Math.PI; p.x = Math.min(x1, Math.max(x0, p.x)); p.y = Math.min(y1, Math.max(y0, p.y)); }
		}
	}

	function draw(ctx, p, X, Y, S, now) {
		const f = p.f, x = X(p.x), y = Y(p.y);
		if (f.type === "rain") {
			ctx.strokeStyle = "rgba(200,220,255,.28)"; ctx.lineWidth = Math.max(1, S * .0016);
			ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + S * .004, y - S * .03 * p.s); ctx.stroke();
		} else if (f.type === "snow") {
			ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.arc(x, y, S * .0022 * p.s, 0, 6.28); ctx.fill();
		} else if (f.type === "petals") {
			const r = S * (p.big ? .016 : .005) * p.s;
			ctx.save(); ctx.translate(x, y); ctx.rotate(p.a); ctx.scale(1, .55 + .45 * Math.sin(p.a * 1.7));
			ctx.fillStyle = "rgba(255,190,214,.85)"; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .6, 0, 0, 6.28); ctx.fill(); ctx.restore();
		} else if (f.type === "steam") {
			const r = S * (.008 + p.t * .03), dy = p.t * S * .12, dx = Math.sin(p.t * 5 + p.a) * S * .012;
			const g = ctx.createRadialGradient(x + dx, y - dy, 0, x + dx, y - dy, r);
			g.addColorStop(0, `rgba(255,255,255,${.16 * Math.sin(p.t * Math.PI)})`); g.addColorStop(1, "rgba(255,255,255,0)");
			ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + dx, y - dy, r, 0, 6.28); ctx.fill();
		} else if (f.type === "motes") {
			ctx.fillStyle = `rgba(${f.rgb},${.25 + .35 * Math.abs(Math.sin(now / 900 + p.a * 3))})`;
			ctx.beginPath(); ctx.arc(x, y, Math.max(.8, S * .0013 * p.s), 0, 6.28); ctx.fill();
		} else if (f.type === "fireflies") {
			const on = Math.max(0, Math.sin(now / 700 * p.s + p.a)), r = S * .012;
			const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(230,255,140,${.9 * on})`); g.addColorStop(1, "rgba(230,255,140,0)");
			ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
		} else if (f.type === "glow") {
			const k = f.twinkle ? .65 + .35 * Math.sin(now / 600 + p.a * 5) : flicker(now), r = S * f.r;
			const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${f.rgb},${.5 * k})`); g.addColorStop(1, `rgba(${f.rgb},0)`);
			ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
		}
	}
	// a lamp's light: steady with a slow breath and now and then a small flicker
	const flicker = (now) => calm ? 1 : .9 + .06 * Math.sin(now / 1700) + (Math.sin(now / 97) > .985 ? -.12 : 0);

	function size(c) {
		const d = Math.min(devicePixelRatio || 1, 1.5);
		c.width = innerWidth * d; c.height = innerHeight * d; c.getContext("2d").setTransform(d, 0, 0, d, 0, 0);
	}

	function frame(now) {
		const dt = Math.min(.05, (now - last) / 1000); last = now;
		const { s, ox, oy } = cover();
		// parallax: the room zooms about her face a fifth as much as she does, and drifts slowly like a held camera
		const drift = calm ? [0, 0] : [Math.sin(now / 7000) * 6, Math.cos(now / 9000) * 4];
		const k = 1.08 + (cam.z - 1) * .2;
		room.style.transformOrigin = `${cam.fx}px ${cam.fy}px`;
		room.style.transform = `translate(${drift[0] - cam.lx * 10}px, ${drift[1] - cam.ly * 6}px) scale(${k})`;
		const n = cam.z > 1.25; // the camera's on her face: the room goes softer
		if (n !== near) { near = n; room.classList.toggle("near", near); }
		const bctx = back.getContext("2d"), fctx = front.getContext("2d");
		bctx.clearRect(0, 0, innerWidth, innerHeight); fctx.clearRect(0, 0, innerWidth, innerHeight);
		const X = (u) => ox + u * s, Y = (v) => oy + v * s;
		bctx.globalCompositeOperation = "source-over";
		for (const p of parts) {
			if (!calm) step(p, dt, now);
			bctx.globalCompositeOperation = p.f.type === "glow" || p.f.type === "fireflies" ? "lighter" : "source-over";
			if (p.f.rect && p.f.type !== "motes" && p.f.type !== "fireflies") { // rain, snow and petals stay in the window
				const [x0, y0, x1, y1] = p.f.rect; bctx.save(); bctx.beginPath(); bctx.rect(X(x0), Y(y0), (x1 - x0) * s, (y1 - y0) * s); bctx.clip();
				draw(bctx, p, X, Y, s, now); bctx.restore();
			} else draw(bctx, p, X, Y, s, now);
		}
		// in front of her: a few big petals drifting across the frame, out of focus
		for (const p of frontParts) { if (!calm) step(p, dt, now); draw(fctx, p, (u) => u * innerWidth, (v) => v * innerHeight, Math.max(innerWidth, innerHeight), now); }
		if (def.light.flicker) light.style.opacity = (.75 * flicker(now)).toFixed(3);
		if (!calm) requestAnimationFrame(frame);
	}

	// the canvases and the room's light, for this frame size
	function place() {
		for (const c of [back, front]) size(c);
		const { s, ox, oy } = cover(), L = def.light;
		light.style.background = `radial-gradient(circle at ${((ox + L.x * s) / innerWidth * 100).toFixed(1)}% ${((oy + L.y * s) / innerHeight * 100).toFixed(1)}%, rgba(${L.rgb},.55), rgba(${L.rgb},0) ${L.r * 100}%)`;
		if (calm) requestAnimationFrame(frame); // drawn once: nothing moves
	}

	/** Shows a room: `pick` ("1"–"5"), or one that fits the visitor's time of day. */
	function start(pick) {
		const ids = Object.keys(ROOMS).filter((id) => ROOMS[id].when === WHEN(new Date().getHours()));
		const id = ROOMS[pick] ? pick : ids[Math.floor(Math.random() * ids.length)];
		def = ROOMS[id];
		document.body.classList.add("roomed");
		document.body.style.setProperty("--grade", def.grade);
		room.querySelector(".pic").style.backgroundImage = `url(/yomu/mochi/bg/${id}.webp)`;
		parts = def.fx.flatMap((f) => make(f));
		frontParts = def.front ? make(def.front, true) : [];
		place();
		addEventListener("resize", place);
		if (!calm) requestAnimationFrame(frame);
		return id;
	}

	return {
		start,
		/** her camera this frame: zoom (1 = whole body) and her face on screen, so the room moves with it */
		camera(z, fx, fy) { cam.z = z; if (z < 1.02) { cam.fx = fx; cam.fy = fy; } },
		/** where the visitor's pointer is, -1..1 each way: the room shifts a little against it */
		look(x, y) { cam.lx = Math.max(-1, Math.min(1, x)); cam.ly = Math.max(-1, Math.min(1, y)); },
		/** things in the room she might glance at (its windows, its light), 0..1 across the frame */
		spots() {
			if (!def) return [];
			const { s, ox, oy } = cover(), at = (u, v) => ({ x: (ox + u * s) / innerWidth, y: (oy + v * s) / innerHeight });
			return [at(def.light.x, def.light.y), ...def.fx.filter((f) => f.rect && f.type !== "motes" && f.type !== "fireflies")
				.map((f) => at((f.rect[0] + f.rect[2]) / 2, (f.rect[1] + f.rect[3]) / 2))].filter((p) => p.x > 0 && p.x < 1);
		},
	};
})();
