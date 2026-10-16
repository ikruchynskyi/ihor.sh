// Meteor-M weather satellite recorder: dongle samples around 137.9 / 137.1 MHz, shifted to 0 Hz, cut down to ~205 kS/s,
// shown on a waterfall with a live orbit map, decoded in the browser (meteor.ts), and recorded as 8-bit IQ for SatDump.
import "./ham/ham.css";
import { lab } from "./course/lab.ts";
import { Mixer, FirDecimator, firLowpass } from "./dsp.ts";
import { spectrumOfIQ, Waterfall } from "./waterfall.ts";
import { MeteorReceiver, WIDTH, composite, align, Channel } from "./meteor.ts";
import { PRESETS, canMake, render, irApid, fillGaps, rotate180, Spread, MapView, type Picture } from "./meteor-image.ts";
import { synthesize, score } from "./meteor-sim.ts";
import { SignalMeter, pictureQuality } from "./meteor-health.ts";
import { Projector, rowTimes, drawLines, graticule, drawCities, drawHome, drawCaption, GEOMETRY, type Proj } from "./meteor-map.ts";
import { passClock } from "./pass-clock.ts";

declare const L: any;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = el("status"), cv = el<HTMLCanvasElement>("wf"), g = cv.getContext("2d")!, wf = new Waterfall(512, 300);
let chain: { key: string; mix: Mixer; dec: FirDecimator; fs: number } | null = null, rx: MeteorReceiver | null = null;
// Recordings live in this tab's memory (about 30 MB a minute), never on the server: cap their length and how many are kept.
const MAX_REC_S = 20 * 60, MAX_KEPT = 3;
let chunks: Uint8Array[] = [], bytes = 0, recording = false, outFs = 0, rms = 0.05, recStart = new Date();
// dropped samples: the dongle's samples counted against the clock while recording (if this tab falls behind, the dongle's
// buffer overflows and samples vanish without an error)
let rawSamples = 0, rawT0 = 0, rawRate = 0;
// overload: the share of raw 8-bit samples stuck at 0 or 255, over the last few chunks
let clipShare = 0;
const recBlobs = new Map<string, Blob>();

const freq = () => el<HTMLSelectElement>("sat").selectedOptions[0].dataset.f!; // MHz
{
  const want = new URLSearchParams(location.search).get("sat"), sel = el<HTMLSelectElement>("sat"); // ?sat=meteor-m2-4 from repeaters page
  const i = Array.from(sel.options).findIndex((o) => o.value === want);
  if (i >= 0) sel.selectedIndex = i;
}

el<HTMLSelectElement>("sat").addEventListener("change", () => {
  const f = el("rd-lab").querySelector<HTMLInputElement>(".lab-f");
  if (f) {
    f.value = freq();
    f.dispatchEvent(new Event("change"));
  }
  mapSatId = "";
  updateSatMap(true);
  refreshPasses();
});

lab(el("rd-lab"), {
  freqMHz: +freq(), everyChunk: true,
  onSamples: (cu8, rate, center, target) => {
    const key = `${rate}|${center}|${target}`;
    if (!chain || chain.key !== key) {
      const m = Math.max(1, Math.floor(rate / 200e3)); // 1.024 MS/s → 204.8k, 1.2 MS/s → 240k: room for the ~110 kHz signal ± Doppler
      chain = { key, mix: new Mixer(rate, target - center), dec: new FirDecimator(firLowpass(80e3 / rate, 40e3 / rate), m, 2), fs: rate / m };
      if (recording && outFs && outFs !== chain.fs) stopRec(); // ponytail: a rate change mid-pass ends the file rather than resampling
    }
    let clipped = 0; for (let i = 0; i < cu8.length; i++) if (cu8[i] === 0 || cu8[i] === 255) clipped++;
    clipShare = 0.8 * clipShare + 0.2 * (clipped / cu8.length);
    showLevel();
    const iq = chain.dec.process(chain.mix.process(Float32Array.from(cu8, (v) => (v - 127.5) / 127.5)));
    const spec = spectrumOfIQ(iq, 512, 8);
    wf.push(spec); snrDb = meter.push(spec, chain.fs); lastChunk = performance.now(); source = "dongle";
    if (!decodingFile && el<HTMLInputElement>("live").checked) {
      if (!rx || rx.fs !== chain.fs) newDecoder(chain.fs);
      rx!.push(iq);
    }
    if (!recording) return;
    if (!rawT0 || rawRate !== rate) { rawT0 = performance.now(); rawSamples = 0; rawRate = rate; } else rawSamples += cu8.length / 2;
    // slow AGC: keep RMS around 32 counts so weak signals use the byte range without clipping
    let p = 0;
    for (const v of iq) p += v * v;
    rms = 0.9 * rms + 0.1 * Math.sqrt(p / iq.length || 1e-12);
    const k = 32 / rms, out = new Uint8Array(iq.length);
    for (let i = 0; i < iq.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(127.5 + iq[i] * k)));
    chunks.push(out); bytes += out.length; outFs = chain.fs;
    if (bytes / 2 / outFs >= MAX_REC_S) {
      stopRec();
      status.textContent += ` Stopped at ${MAX_REC_S / 60} minutes (longer than any pass).`;
      return;
    }
    const elapsed = (performance.now() - rawT0) / 1000, lost = elapsed > 5 ? 1 - rawSamples / (rate * elapsed) : 0;
    status.textContent = `Recording: ${(bytes / 2 / outFs).toFixed(0)} s, ${(bytes / 1e6).toFixed(0)} MB at ${outFs / 1000} kS/s.` +
      (lost > 0.02 ? ` ⚠ About ${(lost * 100).toFixed(0)}% of the dongle's samples are being lost: this computer can't keep up. Untick "decode live" (the recording matters more), close other tabs.` : "");
  },
});

/** The overload meter: how many raw samples hit the ends of the 8-bit range. */
function showLevel() {
  const pct = clipShare * 100, lvl = el("lvl");
  lvl.textContent = pct < 0.01 ? "Input level: fine (no clipping)." : pct < 0.5 ? `Input level: ${pct.toFixed(2)}% of samples clipped, close to the limit.` : `⚠ Overload: ${pct.toFixed(1)}% of samples clipped. Lower the gain until this goes away: strong nearby signals (aircraft radio, pagers) are swamping the dongle.`;
  lvl.dataset.bad = String(pct >= 0.5);
}

function draw() {
  g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height); wf.draw(g, 0, 0, cv.width, cv.height);
  g.strokeStyle = "#f4d35e"; g.globalAlpha = 0.5; // where a 72k-symbol LRPT signal sits (±54 kHz: roll-off 0.5) at this rate
  if (chain) {
    for (const f of [-54e3, 54e3]) {
      const x = (0.5 + f / chain.fs) * cv.width;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke();
    }
  }
  g.globalAlpha = 1; requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function stopRec() {
  recording = false; el("rec").textContent = "Start recording";
  if (!bytes) { status.textContent = "Nothing recorded (is the dongle running?)."; return; }
  const name = `${el<HTMLSelectElement>("sat").value}-${freq()}MHz-${recStart.toISOString().slice(0, 16).replace(/[:T]/g, "")}-${outFs}sps.cu8`; // UTC start time
  const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
  recBlobs.set(name, blob);
  const url = URL.createObjectURL(blob);
  el("saves").insertAdjacentHTML("afterbegin", `<li data-url="${url}" data-name="${name}"><a href="${url}" download="${name}">${name}</a> · ${(bytes / 2 / outFs / 60).toFixed(1)} min, ${(bytes / 1e6).toFixed(0)} MB · <button type="button" class="btn" data-act="decode">Decode</button> <button type="button" class="btn" data-act="download">Download</button> <button type="button" class="btn" data-act="delete">Delete</button></li>`);
  const kept = el("saves").querySelectorAll<HTMLElement>("li");
  for (let i = MAX_KEPT; i < kept.length; i++) {
    const kUrl = kept[i].dataset.url, kName = kept[i].dataset.name;
    if (kUrl) URL.revokeObjectURL(kUrl);
    if (kName) recBlobs.delete(kName);
    kept[i].remove();
  }
  status.textContent = `Saved below: Decode turns it into pictures here, or click Download to save for SatDump.${kept.length > MAX_KEPT ? ` (Only the last ${MAX_KEPT} are kept; download the ones you want.)` : ""}`;
  chunks = []; bytes = 0;
}

el("saves").addEventListener("click", async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]"), li = b?.closest<HTMLElement>("li");
  if (!b || !li) return;
  const { url, name } = li.dataset as { url: string; name: string };
  if (b.dataset.act === "delete") {
    URL.revokeObjectURL(url);
    recBlobs.delete(name);
    li.remove();
    return;
  }
  if (b.dataset.act === "download") {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  if (b.dataset.act === "decode") {
    const blob = recBlobs.get(name) ?? await fetch(url).then((r) => r.blob()).catch(() => null);
    if (blob) decodeFile(blob, name);
    else status.textContent = `Could not load recording ${name}.`;
  }
});

el("rec").addEventListener("click", () => {
  if (recording) return stopRec();
  recording = true; chunks = []; bytes = 0; outFs = 0; recStart = new Date(); rawT0 = 0; el("rec").textContent = "Stop and save";
  status.textContent = "Recording… start the dongle above if it isn't running.";
});

// --- the decoder: pictures per channel, constellation, and Doppler tracking ---------------------------------
const cg = el<HTMLCanvasElement>("iq").getContext("2d")!, drawn = new Map<number, number>();
/** Which satellite and roughly when: for putting picture on map. */
let dctx = { sat: "meteor-m2-3", ref: Date.now() };

function newDecoder(fs: number, sat = el<HTMLSelectElement>("sat").value, ref = Date.now()) {
  dctx = { sat, ref };
  rx = new MeteorReceiver(fs); seen = { acquired: false, frames: 0, proven: false, images: 0, locked: false };
  drawn.clear();
  el("pics").innerHTML = "";
  el("combine").hidden = el("c-fig").hidden = true;
  comboSet = "";
}

function paint() {
  health();
  if (!rx) return;
  const st = rx.stats, pk = rx.packets.stats;
  el("dstat").textContent = `${st.locked ? "🔒 locked" : "searching"} · offset ${(st.freqHz / 1000).toFixed(2)} kHz (Doppler + dongle error, tracked automatically) · ${st.frames} frames · ${pk.packets} packets · ${pk.images} picture strips · error correction: ${st.rsProven ? `${st.rsFixed} bytes repaired, ${st.rsBad} frames beyond repair` : st.frames ? `no frame passed yet (${st.rsBad} tried)` : "waiting"}`;
  cg.fillStyle = "#000"; cg.fillRect(0, 0, 160, 160); cg.fillStyle = st.locked ? "#4de1ff" : "#888";
  for (const [i, q] of rx.constellation.slice(-600)) cg.fillRect(80 + i * 50, 80 - q * 50, 1.5, 1.5);
  for (const [apid, ch] of rx.packets.channels) {
    let c = document.getElementById(`ch${apid}`) as HTMLCanvasElement | null;
    if (!c) {
      el("pics").insertAdjacentHTML("beforeend", `<figure><canvas id="ch${apid}" width="${WIDTH}" height="0"></canvas><figcaption>Channel ${apid - 63} (APID ${apid}) · <a href="#" data-save="${apid}">save PNG</a></figcaption></figure>`);
      c = document.getElementById(`ch${apid}`) as HTMLCanvasElement;
      drawn.set(apid, 0);
    }
    const need = ch.rows.length * 8;
    if (need > c.height) { // growing canvas clears it: grow in steps, then repaint
      const ctx = c.getContext("2d")!, keep = c.height ? ctx.getImageData(0, 0, WIDTH, c.height) : null;
      c.height = need + 128;
      if (keep) ctx.putImageData(keep, 0, 0);
    }
    const ctx = c.getContext("2d")!;
    for (let r = Math.max(0, drawn.get(apid)! - 1); r < ch.rows.length; r++) {
      const img = new ImageData(WIDTH, 8), row = ch.rows[r];
      for (let i = 0; i < row.length; i++) {
        img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = row[i];
        img.data[4 * i + 3] = 255;
      }
      ctx.putImageData(img, 0, r * 8);
    }
    drawn.set(apid, ch.rows.length);
  }
  comboMenus();
}
setInterval(paint, 1000);

// --- "is it working?": the five stages in plain words, a log of what happened, and the self-test ---
let source: "dongle" | "file" | "self-test" | "server" | null = null, lastChunk = 0, snrDb = 0;
const meter = new SignalMeter();
let seen = { acquired: false, frames: 0, proven: false, images: 0, locked: false };
function hlog(text: string) {
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  el("hlog").insertAdjacentHTML("afterbegin", `<li>${t} · ${text}</li>`);
}
function health() {
  const live = source === "dongle" && performance.now() - lastChunk < 3000, st = rx?.stats, pk = rx?.packets.stats;
  const good = st ? st.frames - st.rsBad : 0, clarity = st && st.evm > 0 ? -10 * Math.log10(st.evm) : 0;
  const row = (light: string, title: string, text: string) => `<li>${light} <b>${title}:</b> ${text}</li>`;
  const items = [
    !source ? row("⚪", "Dongle", "not started. Pick a source at the top, or decode a recording below.")
      : source !== "dongle" ? row("🟢", "Input", source === "file" ? "reading the recording." : source === "server" ? "the server's recording of the pass, already decoded there (its full report card is on the recorded passes page)." : "the self-test's synthetic pass.")
      : !live ? row("🔴", "Dongle", "no samples in the last 3 seconds: is it still connected?")
      : clipShare * 100 >= 0.5 ? row("🟡", "Dongle", "samples arriving, but overloaded: lower the gain until the input level line says fine.")
      : row("🟢", "Dongle", "samples arriving, no overload."),
    source !== "dongle" ? row("⚪", "Signal", "measured live only (from the waterfall).")
      : snrDb >= 2 ? row("🟢", "Signal", `the satellite's band stands ${snrDb.toFixed(1)} dB above the noise: enough to decode (it takes about 2 dB on this meter).`)
      : snrDb >= 0.7 ? row("🟡", "Signal", `${snrDb.toFixed(1)} dB above the noise: there is a signal, maybe too weak to decode (about 2 dB is needed).`)
      : row("⚪", "Signal", `nothing above the noise (${snrDb.toFixed(1)} dB). Normal while the satellite is below the horizon; during a pass, the antenna isn't hearing it (obstruction, low pass, or the wrong frequency).`),
    !rx ? row("⚪", "Carrier", "the decoder hasn't started.")
      : rx.acquired || (st as { acquired?: boolean }).acquired ? row("🟢", "Carrier", `found the satellite's exact frequency, ${(st!.freqHz / 1000).toFixed(2)} kHz from where we're tuned (that's Doppler plus the dongle's own error), and following it.`)
      : row("⚪", "Carrier", "searching for the satellite's frequency."),
    !st?.frames ? row("⚪", "Data", rx?.acquired ? `no frames yet. Signal clarity about ${clarity.toFixed(1)} dB; frames need about 2 dB or more.` : "no frames yet.")
      : st.rsProven ? row(good >= st.frames / 2 ? "🟢" : "🟡", "Data", `${st.frames} frames; error correction accepted ${good} (${((100 * good) / st.frames).toFixed(0)}%) and repaired ${st.rsFixed} bytes in them. Error correction accepting a frame means it is genuine Meteor-format data, not noise.`)
      : row("🟡", "Data", `${st.frames} frames, but error correction hasn't accepted one yet: the signal is too noisy so far.`),
    !pk?.images ? row("⚪", "Pictures", "none yet.")
      : row("🟢", "Pictures", `${pk.images} strips in ${rx!.packets.channels.size} channel${rx!.packets.channels.size > 1 ? "s" : ""}. Make a picture below and check that the coastlines fit.`),
  ];
  el("health").innerHTML = items.join("");
  if (!rx) return;
  if (rx.acquired && !seen.acquired) hlog(`carrier found, ${(st!.freqHz / 1000).toFixed(2)} kHz off`);
  if (!rx.acquired && seen.acquired) hlog("lost the carrier: searching again");
  if (st!.frames && !seen.frames) hlog("first frame decoded");
  if (st!.rsProven && !seen.proven) hlog("error correction accepted a frame: this is genuine Meteor-format data, not noise");
  if (pk!.images && !seen.images) hlog("first picture strip");
  if (seen.locked && !st!.locked) hlog(`signal lost after ${st!.frames} frames`);
  seen = { acquired: rx.acquired, frames: st!.frames, proven: st!.rsProven, images: pk!.images, locked: st!.locked };
}
setInterval(() => { if (!rx) health(); }, 1000);

el("selftest").addEventListener("click", async () => {
  if (decodingFile) { status.textContent = "Already decoding; wait for it to finish."; return; }
  decodingFile = true; source = "self-test";
  hlog("self-test: building a synthetic Meteor-M2 3 pass (3 channels, Doppler, noise at about 3 dB)…");
  await new Promise((r) => setTimeout(r, 30));
  const fs = 204800, sim = synthesize({ lines: 12, apids: [64, 65, 68], qShift: -0.5, doppler: (t) => 2100 - 60 * t, sigma: 0.36, start: Date.now() - 60e3 });
  newDecoder(fs, "meteor-m2-3", Date.now());
  for (let i = 0; i < sim.iq.length; i += 65536) { rx!.push(sim.iq.subarray(i, i + 65536)); paint(); await new Promise((r) => setTimeout(r, 0)); }
  decodingFile = false; paint();
  const { good, checked } = score(rx!.packets.channels.get(64)?.rows ?? []), ok = rx!.stats.rsProven && checked >= 500 && good === checked;
  const verdict = ok ? `✓ Self-test passed: ${rx!.stats.frames} of ${sim.frames} frames decoded, ${checked} picture blocks, every one exactly right.`
    : `✗ Self-test failed: ${rx!.stats.frames} of ${sim.frames} frames, ${good} of ${checked} blocks right. The decoder is broken in this browser; please report it.`;
  hlog(verdict); status.textContent = verdict;
});

// --- combining channels into one color picture ---
let comboSet = "";
function comboMenus() {
  if (!rx) return;
  const apids = [...rx.packets.channels.keys()].sort((a, b) => a - b), key = apids.join();
  el("combine").hidden = apids.length < 1;
  if (key === comboSet || apids.length < 1) return;
  comboSet = key;
  const ps = el<HTMLSelectElement>("c-preset"), keepP = ps.value;
  ps.innerHTML = PRESETS.map((p) => `<option value="${p.id}"${canMake(p, apids) ? "" : " disabled"}>${p.name}${canMake(p, apids) ? "" : " (needs a channel this pass didn't send)"}</option>`).join("") + `<option value="custom">Custom: pick the channels below</option>`;
  ps.value = [keepP, ...PRESETS.filter((p) => canMake(p, apids)).map((p) => p.id), "custom"].find((v) => v && ps.querySelector(`option[value="${v}"]:not([disabled])`))!;
  el("c-custom").hidden = ps.value !== "custom";
  const has = (a: number) => apids.includes(a), pick = { "c-r": has(65) ? 65 : apids[1], "c-g": has(65) ? 65 : apids[1], "c-b": has(64) ? 64 : apids[0] };
  for (const [id, def] of Object.entries(pick)) {
    const sel = el<HTMLSelectElement>(id), keep = +sel.value;
    sel.innerHTML = apids.map((a) => `<option value="${a}">Channel ${a - 63}</option>`).join("");
    sel.value = String(has(keep) ? keep : def);
  }
}

el("c-preset").addEventListener("change", () => { el("c-custom").hidden = el<HTMLSelectElement>("c-preset").value !== "custom"; });
el("c-go").addEventListener("click", () => { if (rx) makePicture().catch((e) => { el("c-note").textContent = `Couldn't make the picture: ${(e as Error).message}`; }); });

// Pictures, like MeteorDemod's: a composite or infrared preset (meteor-image.ts), lost lines filled, then as scanned,
// spread, or redrawn on a map; and overlays (coastlines and borders from Natural Earth 1:50m, a 10° grid, capitals and
// big cities, the receiving station, a caption), all placed by the satellite's orbit, clock and pointing (meteor-map.ts).
let world: { coast: number[][]; borders: number[][] } | null = null, cities: [string, number, number, number, number][] | null = null;
const on = (id: string) => el<HTMLInputElement>(id).checked;

async function makePicture() {
  const chs = rx!.packets.channels, have = [...chs.keys()], pid = el<HTMLSelectElement>("c-preset").value, note = el("c-note"), c = el<HTMLCanvasElement>("c-pic");
  let pic: Picture, base: number;
  if (pid === "custom") {
    const apids = ["c-r", "c-g", "c-b"].map((id) => +el<HTMLSelectElement>(id).value) as [number, number, number];
    pic = composite(chs, apids); base = apids[0];
  } else {
    const p = PRESETS.find((q) => q.id === pid)!;
    base = "rgb" in p ? p.rgb[0] : irApid(have)!;
    pic = render(p, chs, (b, a) => align(chs.get(b)!, b, chs.get(a)!, a));
  }
  if (!pic.height) return;
  if (on("c-fill")) fillGaps(pic);
  note.textContent = "Placing the picture…";
  const place = await placement(chs.get(base)!.rowMs).catch((e: Error) => e.message);
  let view = el<HTMLSelectElement>("c-view").value, proj: Proj | null = null, turned = false;
  if (typeof place === "string") view = "scan";
  else if (view === "spread") { const sp = new Spread(place.geo.scanDeg, place.altitude); pic = sp.apply(pic); proj = { toPixel: (la, lo) => { const p = place.raw.toPixel(la, lo); return p && [sp.x(p[0]), p[1]]; } }; }
  else if (view === "mercator" || view === "azeq") { const m = new MapView(view, place.area, place.center); pic = m.draw(pic, place.raw); proj = { toPixel: (la, lo) => m.fwd(la, lo) }; }
  else proj = place.raw;
  if (typeof place !== "string" && (view === "scan" || view === "spread") && place.northbound && on("c-north")) { // an evening pass scans south to north
    pic = rotate180(pic); turned = true; const inner = proj!, W = pic.width, H = pic.height;
    proj = { toPixel: (la, lo) => { const p = inner.toPixel(la, lo); return p && [W - p[0], H - p[1]]; } };
  }
  c.width = pic.width; c.height = pic.height; c.getContext("2d")!.putImageData(new ImageData(pic.data, pic.width, pic.height), 0, 0);
  el("c-fig").hidden = false;
  if (typeof place === "string") { note.textContent = `Shown as scanned, without map lines: ${place}`; return; }
  await drawOverlays(c.getContext("2d")!, proj!, place.times);
  const utc = (t: number) => new Date(t).toISOString().slice(11, 16), home = me ?? SERVER, homeSeen = !!proj!.toPixel(home.lat, home.lon);
  note.textContent = `${dctx.sat.replace("meteor-m2-", "Meteor-M2 ")}, ${utc(place.times[0])}–${utc(place.times.at(-1)!)} UTC, ${place.northbound ? "northbound (evening)" : "southbound (morning)"} pass${turned ? ", turned north-up" : ""}.` +
    (on("c-home") && !homeSeen ? " Your station is outside this picture." : "") + ' Check: do the yellow coastlines sit on the coasts you can see? If they run mirror-image to the land, tick "mirror".';
}

/** Where the picture lies: the satellite's track (server, from its orbit), each row's time, and the places it covers. */
async function placement(rowMs: number[]) {
  const times = rowTimes(rowMs, dctx.ref);
  if (!times) throw new Error("the picture's clock doesn't match the recording time");
  const tr = await fetch(`/api/radio/sat-ecef?id=${dctx.sat}&from=${Math.round(times[0] - 60e3)}&to=${Math.round(times[times.length - 1] + 60e3)}`).then((r) => r.json());
  if (!tr.points) throw new Error(tr.error ?? "no orbit for this satellite");
  const geo = GEOMETRY[dctx.sat], raw = new Projector(tr.points, times, on("c-mirror"), geo);
  const pts: number[][] = tr.points, northbound = pts.at(-1)![3] > pts[0][3];
  const sub = pts.filter((p) => p[0] >= times[0] && p[0] <= times.at(-1)!).map(([, x, y, z]) => [Math.atan2(z, Math.hypot(x, y)) / (Math.PI / 180), Math.atan2(y, x) / (Math.PI / 180)]);
  const altitude = pts.reduce((s, [, x, y, z]) => s + Math.hypot(x, y, z), 0) / pts.length - 6371;
  const area: [number, number][] = []; // places around the track that the scanner saw: sizes the maps
  for (const [la, lo] of sub.filter((_, i) => i % 10 === 0)) for (let dy = -16; dy <= 16; dy += 2) for (let dx = -24; dx <= 24; dx += 2) { const q: [number, number] = [la + dy, lo + dx / Math.max(0.3, Math.cos(((la + dy) * Math.PI) / 180))]; if (Math.abs(q[0]) < 88 && raw.toPixel(q[0], q[1])) area.push(q); }
  const center = sub[sub.length >> 1] as [number, number];
  return { raw, times, northbound, geo, altitude, area, center };
}

async function drawOverlays(ctx: CanvasRenderingContext2D, pr: Proj, times: number[]) {
  if (on("c-grid")) drawLines(ctx, pr, graticule(10), "rgba(225,230,240,0.85)", 1.5);
  if (on("c-map")) {
    world ??= await fetch("./data/world-lines.json").then((r) => r.json());
    drawLines(ctx, pr, world!.borders, "rgba(255,255,255,0.75)", 1.5);
    drawLines(ctx, pr, world!.coast, "#f4d35e", 2);
  }
  if (on("c-cities")) { cities ??= (await fetch("./data/cities.json").then((r) => r.json())).rows; drawCities(ctx, pr, cities!, "#b9a7ff"); }
  const home = me ?? SERVER;
  if (on("c-home")) drawHome(ctx, pr, home.lat, home.lon, "#fc6255");
  const utc = (t: number) => new Date(t).toISOString().slice(11, 16), name = dctx.sat.replace("meteor-m2-", "Meteor-M2 ");
  if (on("c-label")) drawCaption(ctx, [`${name} · ${new Date(times[0]).toISOString().slice(0, 10)} ${utc(times[0])}–${utc(times.at(-1)!)} UTC`], "#f4d35e");
}

el("c-save").addEventListener("click", (e) => {
  e.preventDefault();
  const link = document.createElement("a"); link.href = el<HTMLCanvasElement>("c-pic").toDataURL("image/png");
  link.download = `meteor-color-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.png`; link.click();
});

el("pics").addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("[data-save]"); if (!a || !rx) return;
  e.preventDefault();
  const apid = +a.dataset.save!, src = el<HTMLCanvasElement>(`ch${apid}`), out = document.createElement("canvas");
  out.width = WIDTH; out.height = rx.packets.channels.get(apid)!.rows.length * 8; out.getContext("2d")!.drawImage(src, 0, 0);
  const link = document.createElement("a"); link.href = out.toDataURL("image/png"); link.download = `meteor-ch${apid - 63}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.png`; link.click();
});

// A saved recording (8-bit IQ cu8 or Gqrx raw float32), decoded faster than real time.
let decodingFile = false;
el("file").addEventListener("change", () => {
  const f = el<HTMLInputElement>("file").files?.[0];
  if (f) decodeFile(f, f.name);
});

el("load-sample")?.addEventListener("click", async () => {
  const name = "meteor-m2-3-137.9MHz-sample-240000sps.cu8";
  status.textContent = `Downloading test sample ${name}…`;
  try {
    const res = await fetch(`./data/${name}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    decodeFile(blob, name);
  } catch (e) {
    status.textContent = `Failed to load sample: ${(e as Error).message}`;
  }
});

async function decodeFile(f: Blob, name: string) {
  if (decodingFile) { status.textContent = "Already decoding a recording; wait for it to finish."; return; }
  // Parse sample rate: our '204800sps', Gqrx 'gqrx_YYYYMMDD_HHMMSS_<freq>_<rate>_fc.raw', or the rate box
  const gqrxMatch = name.match(/gqrx_\d{8}_\d{6}_\d+_(\d+)_fc\.raw$/i);
  const spsMatch = name.match(/(\d+)sps/i);
  const fs = +(spsMatch?.[1] ?? gqrxMatch?.[1] ?? el<HTMLInputElement>("frate").value);
  if (!Number.isFinite(fs) || fs <= 0) {
    status.textContent = "Invalid sample rate. Enter sample rate in S/s.";
    return;
  }
  const nt = name.match(/(\d{4})-(\d{2})-(\d{2})(\d{2})(\d{2})-\d+sps/);
  const gqrxDate = name.match(/gqrx_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  const ref = nt
    ? Date.UTC(+nt[1], +nt[2] - 1, +nt[3], +nt[4], +nt[5])
    : gqrxDate
    ? Date.UTC(+gqrxDate[1], +gqrxDate[2] - 1, +gqrxDate[3], +gqrxDate[4], +gqrxDate[5])
    : (f as File).lastModified ?? Date.now();

  decodingFile = true; source = "file";
  const satMatch = name.match(/meteor-m2-\d/)?.[0] ?? el<HTMLSelectElement>("sat").value;
  newDecoder(fs, satMatch, ref);
  el("pics").scrollIntoView({ behavior: "smooth", block: "start" });

  // float32 interleaved IQ: .f32/.cf32, and Gqrx's .raw; any other .raw (rtl_sdr's) and .cu8/.bin are 8-bit unsigned
  const isFloat32 = /\.(?:f32|cf32)$/i.test(name) || /^gqrx_.*\.raw$/i.test(name);
  const step = isFloat32 ? 512 * 1024 : 256 * 1024;
  for (let at = 0; at < f.size; at += step) {
    const slice = await f.slice(at, at + step).arrayBuffer();
    if (isFloat32) {
      rx!.push(new Float32Array(slice));
    } else {
      const b = new Uint8Array(slice);
      rx!.push(Float32Array.from(b, (v) => (v - 127.5) / 127.5));
    }
    if ((at % (step * 8)) === 0) paint();
    status.textContent = `Decoding ${name}: ${((100 * Math.min(f.size, at + step)) / f.size).toFixed(0)}% (${fs / 1000} kS/s${isFloat32 ? ", Gqrx float32" : ", 8-bit cu8"})`;
    await new Promise((r) => setTimeout(r, 0));
  }
  decodingFile = false; paint();
  const n = rx!.packets.stats.images;
  status.textContent = n ? `Finished ${name}: ${n} picture strips.` : `Finished ${name}: no picture (${rx!.stats.frames ? "frames found but no image packets" : "the decoder never locked: signal too weak or absent"}).`;
}

// --- satellite map: orbit track, footprint, and 10-second live position refresh ---
const SERVER = { lat: 40.71, lon: -74.01 };
let satMap: any = null, satLayer: any = null, horizonLayer: any = null, mapSatId = "";
let satMarker: any = null, fp0: any = null, fp20: any = null;

const reachKm = (h: number, minEl = 0) => {
  const Re = 6371, th = (minEl * Math.PI) / 180;
  return Re * (Math.acos((Re / (Re + h)) * Math.cos(th)) - th);
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function initSatMap() {
  if (typeof L === "undefined" || satMap) return;
  const mapEl = document.getElementById("sat-map");
  if (!mapEl) return;
  satMap = L.map("sat-map", { attributionControl: false, minZoom: 1, maxZoom: 6 }).setView([SERVER.lat, SERVER.lon], 2);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    className: "dark-tiles",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(satMap);
  horizonLayer = L.layerGroup().addTo(satMap);
  satLayer = L.layerGroup().addTo(satMap);
}

async function updateSatMap(recenter = false) {
  initSatMap();
  if (!satMap) return;
  const satId = el<HTMLSelectElement>("sat").value;
  const home = me ?? SERVER;
  const t = await fetch(`/api/radio/sat-track?id=${encodeURIComponent(satId)}&lat=${home.lat.toFixed(2)}&lon=${home.lon.toFixed(2)}`)
    .then((r) => r.json())
    .catch(() => null);
  if (!t || t.error) return;

  const [lat, lon, alt] = t.now;
  const subText = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
  const subEl = document.getElementById("sat-subpoint");
  if (subEl) subEl.textContent = subText;
  const altEl = document.getElementById("sat-alt");
  if (altEl) altEl.textContent = `${alt} km`;
  const v = t.view;
  const elEl = document.getElementById("sat-el");
  if (elEl) {
    elEl.textContent = v ? `${v.aboveHorizon ? "🟢 " + v.elevation + "° (" + v.direction + ")" : "⚪ " + v.elevation + "° (below horizon)"}` : "—";
  }

  // Draw ground station and track if sat changed or on first run
  if (mapSatId !== satId) {
    mapSatId = satId;
    horizonLayer.clearLayers();
    satLayer.clearLayers();
    satMarker = null; fp0 = null; fp20 = null;

    // Ground station marker
    L.circleMarker([home.lat, home.lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#ff9f1c", fillOpacity: 1 })
      .bindTooltip(me ? "Your location" : "Server dongle (NYC)")
      .addTo(horizonLayer);

    // Orbit ground track
    const segs: number[][][] = [[]];
    for (const [la, lo] of t.track) {
      const seg = segs.at(-1)!;
      if (seg.length && Math.abs(lo - seg.at(-1)![1]) > 180) segs.push([]);
      segs.at(-1)!.push([la, lo]);
    }
    for (const seg of segs) {
      if (seg.length > 1) {
        L.polyline(seg, { color: "#000", weight: 5, opacity: 0.6 }).addTo(satLayer);
        L.polyline(seg, { color: "#ffd23f", weight: 2.5, opacity: 1 }).addTo(satLayer);
      }
    }
    if (recenter) satMap.setView([lat, lon], 2);
  }

  // Footprint circles (0° horizon and 20° elevation)
  const r0 = reachKm(alt, 0) * 1000, r20 = reachKm(alt, 20) * 1000;
  if (!fp0) {
    fp0 = L.circle([lat, lon], { radius: r0, color: "#4de1ff", weight: 1.5, opacity: 0.8, dashArray: "4 6", fill: true, fillOpacity: 0.05 }).addTo(satLayer);
  } else {
    fp0.setLatLng([lat, lon]); fp0.setRadius(r0);
  }
  if (!fp20) {
    fp20 = L.circle([lat, lon], { radius: r20, color: "#10b981", weight: 1.5, opacity: 0.85, dashArray: "3 5", fill: true, fillOpacity: 0.1 }).addTo(satLayer);
  } else {
    fp20.setLatLng([lat, lon]); fp20.setRadius(r20);
  }

  // Satellite icon marker
  const icon = L.divIcon({
    className: "",
    html: `<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 0 4px #000);transform:translate(-12px,-12px);cursor:pointer;" title="${esc(t.sat.name)}: ${alt} km">🛰️</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  const tip = `<b>${esc(t.sat.name)}</b><br>${alt} km altitude<br>${v?.aboveHorizon ? `<span style="color:#10b981;font-weight:bold;">Above horizon: ${v.elevation}° (${v.direction})</span>` : "Below horizon"}`;
  if (!satMarker) {
    satMarker = L.marker([lat, lon], { icon }).bindTooltip(tip).addTo(satLayer);
  } else {
    satMarker.setLatLng([lat, lon]);
    satMarker.setIcon(icon);
    satMarker.setTooltipContent(tip);
  }
}

// Refresh satellite map position every 10 seconds
setInterval(() => updateSatMap(false), 10_000);

// --- passes: over the server's dongle (New York) and over the user (for USB dongle) ---
const hhmm = (iso: string, day = false) => new Date(iso).toLocaleString([], day ? { weekday: "short", hour: "numeric", minute: "2-digit" } : { hour: "numeric", minute: "2-digit" });
async function passList(where: { lat: number; lon: number }, ul: HTMLElement) {
  const d = await fetch(`/api/radio/sats?lat=${where.lat.toFixed(2)}&lon=${where.lon.toFixed(2)}&hours=48`).then((r) => r.json()).catch(() => null);
  const id = el<HTMLSelectElement>("sat").value, ps = d?.passes?.filter((p: any) => p.sat === id) ?? [];
  ul.innerHTML = !d?.passes ? "<li>Couldn't compute passes right now.</li>" : ps.length ? ps.map((p: any) => `<li>${p.upNow ? "<b>up now</b> · " : ""}${hhmm(p.riseIso, true)}–${hhmm(p.setIso)} · <b>${p.maxElevation}°</b>${p.maxElevation >= 40 ? " (good)" : p.maxElevation < 20 ? " (low)" : ""} · ${String(p.path).replace(/[<&]/g, "")}</li>`).join("") : "<li>None at least 10° up in the next 48 hours.</li>";
  if (ps.length && (!me || where === me)) {
    const next = ps[0];
    const diffMin = Math.round((new Date(next.riseIso).getTime() - Date.now()) / 60000);
    const hintEl = document.getElementById("sat-next-hint");
    if (hintEl) {
      hintEl.textContent = next.upNow ? "🟢 LIVE NOW" : diffMin > 60 ? `in ${Math.round(diffMin / 60)}h (${next.maxElevation}° max)` : `in ${diffMin}m (${next.maxElevation}° max)`;
    }
  }
}

const qp = new URLSearchParams(location.search), qLat = parseFloat(qp.get("lat") ?? ""), qLon = parseFloat(qp.get("lon") ?? "");
let me: { lat: number; lon: number } | null = Number.isFinite(qLat) && Number.isFinite(qLon) ? { lat: qLat, lon: qLon } : null;
let stopClocks = () => {};

const refreshPasses = () => {
  passList(SERVER, el("p-srv"));
  if (me) {
    el("p-me-where").textContent = `(${me.lat.toFixed(1)}°, ${me.lon.toFixed(1)}°)`;
    passList(me, el("p-me"));
  }
  stopClocks();
  const sat = el<HTMLSelectElement>("sat").value, far = me && Math.hypot(me.lat - SERVER.lat, me.lon - SERVER.lon) > 0.5;
  const a = passClock(el("clk-srv"), sat, SERVER, "Server's dongle (New York)"), b = far ? passClock(el("clk-me"), sat, me!, "Your own dongle") : () => {};
  el("clk-me").hidden = !far;
  stopClocks = () => { a(); b(); };
};

el("locate").addEventListener("click", () => {
  if (!navigator.geolocation) { el("p-me").innerHTML = "<li>This browser can't share its location.</li>"; return; }
  el("p-me").innerHTML = "<li>Asking your browser for your location…</li>";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      refreshPasses();
      updateSatMap(true);
    },
    () => { el("p-me").innerHTML = '<li>Location not shared. Pick your spot on the <a href="./repeaters/#sats">repeaters map</a> instead.</li>'; }
  );
});

refreshPasses();
setInterval(refreshPasses, 5 * 60e3);
setTimeout(() => updateSatMap(true), 200);

// --- zoom dialog ---
const zoom = el<HTMLDialogElement>("zoom"), zimg = el<HTMLImageElement>("z-img");
function openZoom(src: HTMLCanvasElement, rows: number) {
  const out = document.createElement("canvas"); out.width = src.width; out.height = rows;
  out.getContext("2d")!.drawImage(src, 0, 0);
  zimg.src = out.toDataURL("image/png"); zimg.dataset.w = String(out.width);
  setZoom(); zoom.showModal();
}
function setZoom() {
  const pct = +el<HTMLInputElement>("z-r").value;
  el("z-o").textContent = `${pct}%`;
  zimg.style.width = `${(+zimg.dataset.w! * pct) / 100}px`;
}
el("z-r").addEventListener("input", setZoom);
el("z-x").addEventListener("click", () => zoom.close());
el("pics").addEventListener("click", (e) => {
  const c = (e.target as HTMLElement).closest<HTMLCanvasElement>("canvas");
  if (!c || !rx) return;
  openZoom(c, rx.packets.channels.get(+c.id.slice(2))!.rows.length * 8);
});
el("c-pic").addEventListener("click", () => {
  const c = el<HTMLCanvasElement>("c-pic");
  openZoom(c, c.height);
});

// --- a pass the server recorded and decoded (meteor-rec.ts): its channel pictures and timing, without the raw file ---
const passId = new URLSearchParams(location.search).get("pass");
if (passId) loadPass(passId).catch((e) => { status.textContent = `Couldn't open the server's recording: ${(e as Error).message}`; });
async function loadPass(id: string) {
  const f = (name: string) => `/api/meteor/file?id=${encodeURIComponent(id)}&f=${name}`;
  status.textContent = "Loading the server's recording…";
  const m = await fetch(f("meta.json")).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  source = "server"; decodingFile = true;
  newDecoder(m.fs, m.sat, m.start);
  for (const [apid, info] of Object.entries(m.channels as Record<string, { rowSeq: number[]; rowMs: number[] }>)) {
    const img = new Image(); img.src = f(`ch${apid}.png`); await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, img.width, img.height).data, ch = new Channel(), strip = WIDTH * 8;
    for (let r = 0; r < img.height / 8; r++) { const row = new Uint8Array(strip); for (let i = 0; i < strip; i++) row[i] = px[(r * strip + i) * 4]; ch.rows.push(row); }
    ch.rowSeq = info.rowSeq; ch.rowMs = info.rowMs;
    rx!.packets.channels.set(Number(apid), ch);
  }
  Object.assign(rx!.stats, m.stats); rx!.packets.stats.images = m.stats.images; rx!.packets.stats.packets = m.stats.packets;
  decodingFile = false; paint();
  const sel = el<HTMLSelectElement>("sat"); sel.value = m.sat;
  status.textContent = `${m.sat.replace("meteor-m2-", "Meteor-M2 ")} over New York, ${new Date(m.start).toLocaleString()}: recorded and decoded by the server (${m.quality.strips} strips). Make a picture below.`;
  el("combine").scrollIntoView({ behavior: "smooth", block: "start" });
}
