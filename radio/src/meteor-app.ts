// Meteor-M pass recorder: the dongle's samples around 137.9 / 137.1 MHz, shifted to 0 Hz, cut down to ~240 kS/s,
// shown as a waterfall and kept as an 8-bit IQ file you can save and decode into a picture (SatDump's "METEOR M2-x LRPT").
import "./ham/ham.css";
import { lab } from "./course/lab.ts";
import { Mixer, FirDecimator, firLowpass } from "./dsp.ts";
import { spectrumOfIQ, Waterfall } from "./waterfall.ts";
import { MeteorReceiver, WIDTH, composite } from "./meteor.ts";
import { Projector, rowTimes, drawLines } from "./meteor-map.ts";

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = el("status"), cv = el<HTMLCanvasElement>("wf"), g = cv.getContext("2d")!, wf = new Waterfall(512, 300);
let chain: { key: string; mix: Mixer; dec: FirDecimator; fs: number } | null = null, rx: MeteorReceiver | null = null;
// Recordings live in this tab's memory (about 30 MB a minute), never on the server: cap their length and how many are kept.
const MAX_REC_S = 20 * 60, MAX_KEPT = 3;
let chunks: Uint8Array[] = [], bytes = 0, recording = false, outFs = 0, rms = 0.05;

const freq = () => el<HTMLSelectElement>("sat").selectedOptions[0].dataset.f!; // MHz
{ const want = new URLSearchParams(location.search).get("sat"), sel = el<HTMLSelectElement>("sat"); // ?sat=meteor-m2-4 from the repeaters page
  const i = Array.from(sel.options).findIndex((o) => o.value === want); if (i >= 0) sel.selectedIndex = i; }
el<HTMLSelectElement>("sat").addEventListener("change", () => {
  const f = el("rd-lab").querySelector<HTMLInputElement>(".lab-f")!;
  f.value = freq(); f.dispatchEvent(new Event("change"));
});

lab(el("rd-lab"), {
  freqMHz: +freq(), everyChunk: true,
  onSamples: (cu8, rate, center, target) => {
    const key = `${rate}|${center}|${target}`;
    if (!chain || chain.key !== key) {
      const m = Math.max(1, Math.floor(rate / 200e3)); // 1.2 MS/s → 240k, 1.024 MS/s → 256k: room for the 120 kHz signal ± Doppler
      chain = { key, mix: new Mixer(rate, target - center), dec: new FirDecimator(firLowpass(80e3 / rate, 40e3 / rate), m, 2), fs: rate / m };
      if (recording && outFs && outFs !== chain.fs) stopRec(); // ponytail: a rate change mid-pass ends the file rather than resampling
    }
    const iq = chain.dec.process(chain.mix.process(Float32Array.from(cu8, (v) => (v - 127.5) / 127.5)));
    wf.push(spectrumOfIQ(iq, 512, 8));
    if (!decodingFile) { if (!rx || rx.fs !== chain.fs) newDecoder(chain.fs); rx!.push(iq); }
    if (!recording) return;
    // slow AGC: keep the RMS around 32 counts so the weak signal uses the bytes' range without clipping
    let p = 0; for (const v of iq) p += v * v; rms = 0.9 * rms + 0.1 * Math.sqrt(p / iq.length || 1e-12);
    const k = 32 / rms, out = new Uint8Array(iq.length);
    for (let i = 0; i < iq.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(127.5 + iq[i] * k)));
    chunks.push(out); bytes += out.length; outFs = chain.fs;
    if (bytes / 2 / outFs >= MAX_REC_S) { stopRec(); status.textContent += ` Stopped at ${MAX_REC_S / 60} minutes (longer than any pass).`; return; }
    status.textContent = `Recording: ${(bytes / 2 / outFs).toFixed(0)} s, ${(bytes / 1e6).toFixed(0)} MB at ${outFs / 1000} kS/s.`;
  },
});

function draw() {
  g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height); wf.draw(g, 0, 0, cv.width, cv.height);
  g.strokeStyle = "#f4d35e"; g.globalAlpha = 0.5; // where a 72k-symbol LRPT signal sits (±60 kHz) at this rate
  if (chain) for (const f of [-60e3, 60e3]) { const x = (0.5 + f / chain.fs) * cv.width; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); }
  g.globalAlpha = 1; requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function stopRec() {
  recording = false; el("rec").textContent = "Start recording";
  if (!bytes) { status.textContent = "Nothing recorded (is the dongle running?)."; return; }
  const name = `${el<HTMLSelectElement>("sat").value}-${freq()}MHz-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}-${outFs}sps.cu8`;
  const url = URL.createObjectURL(new Blob(chunks as BlobPart[]));
  el("saves").insertAdjacentHTML("afterbegin", `<li data-url="${url}" data-name="${name}"><a href="${url}" download="${name}">${name}</a> · ${(bytes / 2 / outFs / 60).toFixed(1)} min, ${(bytes / 1e6).toFixed(0)} MB · <button type="button" data-act="decode">Decode</button> <button type="button" data-act="delete">Delete</button></li>`);
  const kept = el("saves").querySelectorAll<HTMLElement>("li");
  for (let i = MAX_KEPT; i < kept.length; i++) { URL.revokeObjectURL(kept[i].dataset.url!); kept[i].remove(); }
  status.textContent = `Saved below: Decode turns it into pictures here, the link downloads it.${kept.length > MAX_KEPT ? ` (Only the last ${MAX_KEPT} are kept; download the ones you want.)` : ""}`;
  chunks = []; bytes = 0;
}
el("saves").addEventListener("click", async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]"), li = b?.closest<HTMLElement>("li"); if (!b || !li) return;
  const { url, name } = li.dataset as { url: string; name: string };
  if (b.dataset.act === "delete") { URL.revokeObjectURL(url); li.remove(); return; }
  decodeFile(await fetch(url).then((r) => r.blob()), name);
});
el("rec").addEventListener("click", () => {
  if (recording) return stopRec();
  recording = true; chunks = []; bytes = 0; outFs = 0; el("rec").textContent = "Stop and save";
  status.textContent = "Recording… start the dongle above if it isn't running.";
});

// --- the decoder: pictures per channel, the constellation, and the Doppler it is tracking ---------------------------------
const cg = el<HTMLCanvasElement>("iq").getContext("2d")!, drawn = new Map<number, number>();
/** Which satellite and roughly when: for putting the picture on the map. */
let dctx = { sat: "meteor-m2-3", ref: Date.now() };
function newDecoder(fs: number, sat = el<HTMLSelectElement>("sat").value, ref = Date.now()) {
  dctx = { sat, ref }; rx = new MeteorReceiver(fs); drawn.clear(); el("pics").innerHTML = ""; el("combine").hidden = el("c-fig").hidden = true; comboSet = "";
}
function paint() {
  if (!rx) return;
  const st = rx.stats, pk = rx.packets.stats;
  el("dstat").textContent = `${st.locked ? "🔒 locked" : "searching"} · offset ${(st.freqHz / 1000).toFixed(2)} kHz (Doppler + dongle error, tracked automatically) · ${st.frames} frames · ${pk.packets} packets · ${pk.images} picture strips · error correction: ${st.rsProven ? `${st.rsFixed} bytes repaired, ${st.rsBad} frames beyond repair` : st.frames ? `no frame passed yet (${st.rsBad} tried)` : "waiting"}`;
  cg.fillStyle = "#000"; cg.fillRect(0, 0, 160, 160); cg.fillStyle = st.locked ? "#4de1ff" : "#888";
  for (const [i, q] of rx.constellation.slice(-600)) cg.fillRect(80 + i * 50, 80 - q * 50, 1.5, 1.5);
  for (const [apid, ch] of rx.packets.channels) {
    let c = document.getElementById(`ch${apid}`) as HTMLCanvasElement | null;
    if (!c) { el("pics").insertAdjacentHTML("beforeend", `<figure><canvas id="ch${apid}" width="${WIDTH}" height="0"></canvas><figcaption>Channel ${apid - 63} (APID ${apid}) · <a href="#" data-save="${apid}">save PNG</a></figcaption></figure>`); c = document.getElementById(`ch${apid}`) as HTMLCanvasElement; drawn.set(apid, 0); }
    const need = ch.rows.length * 8;
    if (need > c.height) { // growing a canvas clears it: grow in steps, then repaint everything
      const g = c.getContext("2d")!, keep = c.height ? g.getImageData(0, 0, WIDTH, c.height) : null;
      c.height = need + 128; if (keep) g.putImageData(keep, 0, 0);
    }
    const g = c.getContext("2d")!;
    for (let r = Math.max(0, drawn.get(apid)! - 1); r < ch.rows.length; r++) { // the last row may have filled in since
      const img = new ImageData(WIDTH, 8), row = ch.rows[r];
      for (let i = 0; i < row.length; i++) { img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = row[i]; img.data[4 * i + 3] = 255; }
      g.putImageData(img, 0, r * 8);
    }
    drawn.set(apid, ch.rows.length);
  }
  comboMenus();
}
setInterval(paint, 1000);

// --- combining channels into one color picture ---
let comboSet = "";
function comboMenus() { // called from paint: offer the channels received so far, keeping the reader's picks
  const apids = [...rx!.packets.channels.keys()].sort((a, b) => a - b), key = apids.join();
  el("combine").hidden = apids.length < 2;
  if (key === comboSet || apids.length < 2) return;
  comboSet = key;
  const has = (a: number) => apids.includes(a), pick = { "c-r": has(65) ? 65 : apids[1], "c-g": has(65) ? 65 : apids[1], "c-b": has(64) ? 64 : apids[0] };
  for (const [id, def] of Object.entries(pick)) {
    const sel = el<HTMLSelectElement>(id), keep = +sel.value;
    sel.innerHTML = apids.map((a) => `<option value="${a}">Channel ${a - 63}</option>`).join("");
    sel.value = String(has(keep) ? keep : def);
  }
}
el("c-go").addEventListener("click", () => {
  if (!rx) return;
  const apids = ["c-r", "c-g", "c-b"].map((id) => +el<HTMLSelectElement>(id).value) as [number, number, number];
  const img = composite(rx.packets.channels, apids), c = el<HTMLCanvasElement>("c-pic");
  if (!img.height) return;
  c.width = img.width; c.height = img.height; c.getContext("2d")!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  el("c-fig").hidden = false; el("c-note").textContent = "";
  if (el<HTMLInputElement>("c-map").checked) addMap(c, rx.packets.channels.get(apids[0])!.rowMs);
});

// coastlines and borders (Natural Earth 1:50m), where the scanner saw them
let world: { coast: number[][]; borders: number[][] } | null = null;
async function addMap(c: HTMLCanvasElement, rowMs: number[]) {
  const note = el("c-note"), times = rowTimes(rowMs, dctx.ref);
  if (!times) { note.textContent = "Can't place it on the map: the picture's clock doesn't match when it was recorded."; return; }
  note.textContent = "Drawing the map…";
  try {
    world ??= await fetch("./data/world-lines.json").then((r) => r.json());
    const tr = await fetch(`/api/radio/sat-ecef?id=${dctx.sat}&from=${Math.round(times[0] - 60e3)}&to=${Math.round(times[times.length - 1] + 60e3)}`).then((r) => r.json());
    if (!tr.points) throw new Error(tr.error ?? "no orbit");
    const pr = new Projector(tr.points, times, el<HTMLInputElement>("c-mirror").checked), g = c.getContext("2d")!;
    drawLines(g, pr, world!.borders, "rgba(255,255,255,0.75)", 1.5); drawLines(g, pr, world!.coast, "#f4d35e", 2);
    const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    note.textContent = `Map lines for ${dctx.sat.replace("meteor-m2-", "Meteor-M2 ")}, ${hm(times[0])}–${hm(times[times.length - 1])}. If the coast is a mirror image of the clouds' edges, tick "mirror" and combine again.`;
  } catch (e) { note.textContent = `Couldn't draw the map: ${(e as Error).message}`; }
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

// A saved recording (8-bit IQ centered on the satellite), decoded faster than real time.
let decodingFile = false;
el("file").addEventListener("change", () => { const f = el<HTMLInputElement>("file").files?.[0]; if (f) decodeFile(f, f.name); });
async function decodeFile(f: Blob, name: string) {
  if (decodingFile) { status.textContent = "Already decoding a recording; wait for it to finish."; return; }
  const fs = +(name.match(/(\d+)sps/)?.[1] ?? el<HTMLInputElement>("frate").value);
  // the satellite and the time, from our own file names (…meteor-m2-4-137.9MHz-2026-10-121524-240000sps.cu8, UTC)
  const nt = name.match(/(\d{4})-(\d{2})-(\d{2})(\d{2})(\d{2})-\d+sps/), ref = nt ? Date.UTC(+nt[1], +nt[2] - 1, +nt[3], +nt[4], +nt[5]) : (f as File).lastModified ?? Date.now();
  decodingFile = true; newDecoder(fs, name.match(/meteor-m2-\d/)?.[0] ?? el<HTMLSelectElement>("sat").value, ref);
  el("pics").scrollIntoView({ behavior: "smooth", block: "start" });
  const step = 4 << 20;
  for (let at = 0; at < f.size; at += step) {
    const b = new Uint8Array(await f.slice(at, at + step).arrayBuffer());
    rx!.push(Float32Array.from(b, (v) => (v - 127.5) / 127.5));
    status.textContent = `Decoding ${name}: ${((100 * Math.min(f.size, at + step)) / f.size).toFixed(0)}% (${fs / 1000} kS/s)`;
    await new Promise((r) => setTimeout(r));
  }
  decodingFile = false; paint();
  const n = rx!.packets.stats.images;
  status.textContent = n ? `Finished ${name}: ${n} picture strips.` : `Finished ${name}: no picture (${rx!.stats.frames ? "frames found but no image packets" : "the decoder never locked: the signal was too weak or absent"}).`;
}

// --- passes: over the server's dongle (New York, whoever is listening) and over the reader (for their own USB dongle) ---
const SERVER = { lat: 40.71, lon: -74.01 };
const hhmm = (iso: string, day = false) => new Date(iso).toLocaleString([], day ? { weekday: "short", hour: "numeric", minute: "2-digit" } : { hour: "numeric", minute: "2-digit" });
async function passList(where: { lat: number; lon: number }, ul: HTMLElement) {
  const d = await fetch(`/api/radio/sats?lat=${where.lat.toFixed(2)}&lon=${where.lon.toFixed(2)}&hours=48`).then((r) => r.json()).catch(() => null);
  const id = el<HTMLSelectElement>("sat").value, ps = d?.passes?.filter((p: any) => p.sat === id) ?? [];
  ul.innerHTML = !d?.passes ? "<li>Couldn't compute passes right now.</li>" : ps.length ? ps.map((p: any) => `<li>${p.upNow ? "<b>up now</b> · " : ""}${hhmm(p.riseIso, true)}–${hhmm(p.setIso)} · <b>${p.maxElevation}°</b>${p.maxElevation >= 40 ? " (good)" : p.maxElevation < 20 ? " (low)" : ""} · ${String(p.path).replace(/[<&]/g, "")}</li>`).join("") : "<li>None at least 10° up in the next 48 hours.</li>";
}
const qp = new URLSearchParams(location.search), qLat = parseFloat(qp.get("lat") ?? ""), qLon = parseFloat(qp.get("lon") ?? "");
let me: { lat: number; lon: number } | null = Number.isFinite(qLat) && Number.isFinite(qLon) ? { lat: qLat, lon: qLon } : null;
const refreshPasses = () => { passList(SERVER, el("p-srv")); if (me) { el("p-me-where").textContent = `(${me.lat.toFixed(1)}°, ${me.lon.toFixed(1)}°)`; passList(me, el("p-me")); } };
el("locate").addEventListener("click", () => {
  if (!navigator.geolocation) { el("p-me").innerHTML = "<li>This browser can't share its location.</li>"; return; }
  el("p-me").innerHTML = "<li>Asking your browser for your location…</li>";
  navigator.geolocation.getCurrentPosition((pos) => { me = { lat: pos.coords.latitude, lon: pos.coords.longitude }; refreshPasses(); },
    () => { el("p-me").innerHTML = '<li>Location not shared. Pick your spot on the <a href="./repeaters/#sats">repeaters map</a> instead.</li>'; });
});
el<HTMLSelectElement>("sat").addEventListener("change", refreshPasses);
refreshPasses(); setInterval(refreshPasses, 5 * 60e3);

// --- zoom: any picture, full size, smoothly scaled ---
const zoom = el<HTMLDialogElement>("zoom"), zimg = el<HTMLImageElement>("z-img");
function openZoom(src: HTMLCanvasElement, rows: number) {
  const out = document.createElement("canvas"); out.width = src.width; out.height = rows;
  out.getContext("2d")!.drawImage(src, 0, 0);
  zimg.src = out.toDataURL("image/png"); zimg.dataset.w = String(out.width);
  setZoom(); zoom.showModal();
}
function setZoom() { const pct = +el<HTMLInputElement>("z-r").value; el("z-o").textContent = `${pct}%`; zimg.style.width = `${(+zimg.dataset.w! * pct) / 100}px`; }
el("z-r").addEventListener("input", setZoom);
el("z-x").addEventListener("click", () => zoom.close());
el("pics").addEventListener("click", (e) => {
  const c = (e.target as HTMLElement).closest<HTMLCanvasElement>("canvas"); if (!c || !rx) return;
  openZoom(c, rx.packets.channels.get(+c.id.slice(2))!.rows.length * 8);
});
el("c-pic").addEventListener("click", () => { const c = el<HTMLCanvasElement>("c-pic"); openZoom(c, c.height); });
