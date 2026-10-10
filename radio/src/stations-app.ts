// NYC radio stations: FCC-licensed FM stations around the city, what our antenna hears of each (the dongle's FM band
// scan), their internet streams, and internet-only stations. Data from ihor.sh's /api/radio/stations (sky.ts).
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
type Stream = { name: string; url: string; https: boolean };
type Station = { call: string; mhz: number; city: string; state: string; km: number; erpKw: number; licensee: string; snrDb: number | null; heard: string; sharesWith?: string; streams: Stream[] };
type Dial = { scan: { at: number; gain: number | null } | null; stations: Station[]; internet: { name: string; tags: string[]; url: string; https: boolean; homepage: string | null; claimsFm: number | null }[] };
let data: Dial | null = null, playing: string | null = null;

const HEARD: Record<string, string> = { clear: "clear", heard: "heard, weak", spillover: "only a neighbor's spillover", "co-channel": "its channel is taken here by", "not heard": "not heard here", "not scanned": "not scanned yet" };
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

function play(name: string, url: string, https: boolean) {
  if (!https) return void window.open(url, "_blank", "noopener"); // an http stream can't play inside an https page
  const a = $<HTMLAudioElement>("audio");
  a.src = url; a.play().catch(() => {});
  playing = name;
  $("player").hidden = false;
  $("player").innerHTML = `▶ <b>${esc(name)}</b> <button id="stop">■ Stop</button>`;
  $("stop").onclick = stop;
}
function stop() { const a = $<HTMLAudioElement>("audio"); a.pause(); a.removeAttribute("src"); $("player").hidden = true; playing = null; }

function render() {
  if (!data) return;
  const q = $<HTMLInputElement>("q").value.trim().toLowerCase(), only = $<HTMLInputElement>("onlyHeard").checked;
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const rows = data.stations.filter((s) => (!only || s.heard === "clear" || s.heard === "heard") && match(`${s.mhz} ${s.call} ${s.city} ${s.state} ${s.licensee} ${s.streams.map((x) => x.name).join(" ")}`));
  $("rows").innerHTML = rows.map((s) => `<tr>
    <td class="f">${s.mhz.toFixed(1)}</td>
    <td><b>${esc(s.call)}</b>${s.streams[0] ? `<br><span class="muted">${esc(s.streams[0].name)}</span>` : ""}</td>
    <td class="hide-sm muted">${esc(s.city)}, ${esc(s.state)} · ${Math.round(s.km)} km · ${s.erpKw} kW</td>
    <td class="heard-${s.heard === "co-channel" ? "not" : s.heard.split(" ")[0]}">${s.snrDb !== null ? `<span class="meter" title="${s.snrDb} dB over the noise"><i style="width:${Math.max(0, Math.min(100, (s.snrDb / 40) * 100))}%"></i></span>` : ""}${esc(HEARD[s.heard] ?? s.heard)}${s.sharesWith ? ` ${esc(s.sharesWith)}` : ""}${s.snrDb !== null && !s.sharesWith ? ` <span class="muted">${s.snrDb.toFixed(0)} dB</span>` : ""}</td>
    <td class="acts">${s.heard === "clear" || s.heard === "heard" ? `<a href="../?listen=${s.mhz}" title="Tune this site's radio to ${s.mhz} MHz (Spectrum Lab: press 'Listen to server SDR')">📡 ${s.mhz}</a>` : ""}${s.streams.slice(0, 2).map((x, i) => `<button class="play" data-call="${esc(s.call)}" data-i="${i}" title="${esc(x.name)}${x.https ? "" : " (opens a new tab)"}">▶${s.streams.length > 1 ? ` ${i + 1}` : ""}</button>`).join("")}</td>
  </tr>`).join("") || `<tr><td colspan="5" class="muted">No station matches.</td></tr>`;
  $("internet").innerHTML = data.internet.filter((s) => match(`${s.name} ${s.tags.join(" ")}`)).map((s, i) => `<li><button class="play" data-net="${data!.internet.indexOf(s)}">▶</button> <b>${esc(s.name)}</b> <span class="muted">${esc(s.tags.slice(0, 4).join(", "))}${s.claimsFm ? ` · says "${s.claimsFm}" in its name, but no licensed station matches` : ""}${s.https ? "" : " · opens in a new tab"}</span>${s.homepage ? ` <a href="${esc(s.homepage)}" target="_blank" rel="noopener">site</a>` : ""}</li>`).join("");
}

async function load() {
  const r = await fetch("/api/radio/stations").catch(() => null);
  if (!r?.ok) { $("scanLine").textContent = "The station list is only available on ihor.sh."; return; }
  data = await r.json();
  const heard = data!.stations.filter((s) => s.heard === "clear" || s.heard === "heard").length;
  $("scanLine").innerHTML = data!.scan
    ? `${data!.stations.length} licensed stations within 100 km; my antenna hears <b>${heard}</b> of them (band scanned ${ago(data!.scan.at)}${data!.scan.gain !== null ? ` at ${data!.scan.gain} dB gain` : ""}). <button id="rescan">Scan again</button>`
    : `${data!.stations.length} licensed stations within 100 km. The antenna hasn't scanned the band yet. <button id="rescan">Scan now</button>`;
  $("rescan").onclick = rescan;
  if (!data!.scan) $<HTMLInputElement>("onlyHeard").checked = false; // nothing to filter by yet
  render();
}
async function rescan() {
  $("rescan").textContent = "Scanning (about 8 s)…";
  const r = await fetch("/api/scan/fm", { method: "POST" }).catch(() => null), d = await r?.json().catch(() => null);
  if (!r?.ok) $("scanLine").insertAdjacentHTML("beforeend", ` <span class="muted">${esc(d?.error ?? "The radio isn't answering.")}</span>`);
  else await load();
}
$("q").addEventListener("input", render);
$("onlyHeard").addEventListener("change", render);
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button.play");
  if (!b || !data) return;
  if (b.dataset.net) { const s = data.internet[+b.dataset.net]; return play(s.name, s.url, s.https); }
  const st = data.stations.find((s) => s.call === b.dataset.call)!, x = st.streams[+b.dataset.i!];
  play(`${st.call} ${st.mhz}: ${x.name}`, x.url, x.https);
});
load();

// What Blip sees and can do here.
(window as any).blipContext = () => ({
  page: "NYC radio stations: FCC-licensed FM stations, what the site's antenna hears (band scan), internet streams",
  playing, scannedAt: data?.scan ? new Date(data.scan.at).toISOString() : null,
  heardByMyAntenna: data?.stations.filter((s) => s.heard === "clear" || s.heard === "heard").map((s) => `${s.mhz} ${s.call} (${s.city}) ${s.snrDb} dB${s.streams.length ? ", has a stream" : ""}`),
  notHeard: data?.stations.filter((s) => s.heard === "not heard").slice(0, 30).map((s) => `${s.mhz} ${s.call} (${s.city}, ${Math.round(s.km)} km)`),
  internetOnly: data?.internet.slice(0, 30).map((s) => s.name),
});
(window as any).blipActions = {
  play_station: { label: "turned on the radio", description: "Play a station's internet stream: by call sign (WNYC), FM frequency (93.9), name or genre (jazz). Or 'stop'.", parameters: { query: { type: "string", description: "Call sign, frequency, name or genre, or 'stop'" } },
    run: ({ query }: { query: string }) => {
      const q = String(query ?? "").toLowerCase().trim();
      if (!data) return;
      if (q === "stop") return stop();
      const st = data.stations.find((s) => s.streams.length && (s.call.toLowerCase() === q || s.mhz.toFixed(1) === q || s.streams.some((x) => x.name.toLowerCase().includes(q))));
      if (st) return play(`${st.call} ${st.mhz}: ${st.streams[0].name}`, st.streams[0].url, st.streams[0].https);
      const net = data.internet.find((s) => s.name.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q)));
      if (net) play(net.name, net.url, net.https);
    } },
  listen_on_sdr: { label: "tuned my radio", description: "Open Spectrum Lab tuned to an FM station off the air (only for stations the antenna hears).", parameters: { mhz: { type: "number", description: "FM frequency, e.g. 93.9" } },
    run: ({ mhz }: { mhz: number }) => { const f = Number(mhz); if (f >= 87.9 && f <= 108) location.href = `../?listen=${f}`; } },
};
