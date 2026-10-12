// The US band plan, 24–1766 MHz (what our radios tune), as Spectrum Lab draws it over the spectrum when it's switched on:
// who is allowed where. Overlaps are real (marine and railroad inside VHF-high land mobile), so bands stack in lanes.

type Kind = "broadcast" | "air" | "marine" | "ham" | "safety" | "mobile" | "sat" | "cell" | "ism" | "gov";
export const KIND_COLOR: Record<Kind, string> = { broadcast: "#ff9f1c", air: "#4de1ff", marine: "#3a86ff", ham: "#5cff9d", safety: "#ff5c8a", mobile: "#c59bff", sat: "#ffd166", cell: "#9aa3cf", ism: "#f4a3c0", gov: "#8d99ae" };
// [from MHz, to MHz, name, kind]
export const BANDS: [number, number, string, Kind][] = [
  [24.89, 24.99, "12 m ham", "ham"], [26.965, 27.405, "CB radio", "mobile"], [28, 29.7, "10 m ham", "ham"],
  [30, 50, "VHF low band (land mobile, public safety)", "safety"], [50, 54, "6 m ham", "ham"],
  [54, 72, "TV ch 2–4", "broadcast"], [76, 88, "TV ch 5–6", "broadcast"], [88, 108, "FM broadcast", "broadcast"],
  [108, 118, "Air navigation (VOR, ILS)", "air"], [118, 137, "Airband voice (AM)", "air"], [137, 138, "Weather satellites (NOAA, Meteor)", "sat"],
  [138, 144, "Government, military", "gov"], [144, 148, "2 m ham", "ham"], [148, 150.8, "Government, military", "gov"],
  [150.8, 162, "VHF high band (police, fire, business)", "safety"], [156, 157.45, "Marine VHF", "marine"], [160.11, 161.61, "Railroad", "mobile"],
  [161.95, 162.05, "AIS (ships)", "marine"], [162.4, 162.55, "NOAA Weather Radio", "sat"], [174, 216, "TV ch 7–13", "broadcast"],
  [222, 225, "1.25 m ham", "ham"], [225, 400, "Military airband (AM)", "air"], [400.15, 406, "Radiosondes (weather balloons)", "sat"],
  [406, 406.1, "Emergency beacons (COSPAS-SARSAT)", "safety"], [420, 450, "70 cm ham", "ham"], [450, 470, "UHF land mobile (business, public safety)", "safety"],
  [462.55, 462.725, "FRS / GMRS", "mobile"], [467.5625, 467.7125, "FRS", "mobile"], [470, 512, "T-band: NYC public safety (TV 14–20 elsewhere)", "safety"],
  [512, 608, "TV ch 21–36", "broadcast"], [608, 614, "Radio astronomy", "sat"], [617, 652, "600 MHz cellular (down)", "cell"], [663, 698, "600 MHz cellular (up)", "cell"],
  [698, 758, "700 MHz cellular", "cell"], [758, 775, "FirstNet (public safety LTE)", "safety"], [775, 806, "700 MHz cellular, public safety", "cell"],
  [806, 824, "800 MHz trunked (radio → tower)", "safety"], [824, 849, "850 cellular (up)", "cell"], [851, 869, "800 MHz trunked (public safety)", "safety"], [869, 894, "850 cellular (down)", "cell"],
  [896, 901, "900 MHz land mobile", "mobile"], [902, 928, "33 cm ham, ISM (LoRa, Meshtastic)", "ism"], [929, 932, "Paging", "mobile"], [935, 940, "900 MHz land mobile", "mobile"],
  [960, 1164, "Air navigation (DME, TACAN)", "air"], [1087, 1093, "ADS-B (aircraft)", "air"], [1164, 1215, "GPS L5, Galileo", "sat"], [1215, 1240, "GPS L2", "sat"],
  [1240, 1300, "23 cm ham", "ham"], [1525, 1559, "Inmarsat (satellite downlinks)", "sat"], [1559, 1610, "GPS L1, GNSS", "sat"], [1610, 1626.5, "Iridium, Globalstar", "sat"],
  [1670, 1710, "Weather satellites (GOES, HRPT)", "sat"], [1710, 1780, "AWS cellular (up)", "cell"],
];

/** The widest band covering `hz` ("2 m ham", "FM broadcast"…), or its 10 MHz slot: what the server remembers gain by. */
export const bandKey = (hz: number) => BANDS.filter(([a, b]) => hz >= a * 1e6 && hz <= b * 1e6).sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0]?.[2] ?? `${Math.floor(hz / 1e7) * 10} MHz`;

/** Every band covering `hz`, narrowest first. */
export const bandsAt = (hz: number) => BANDS.filter(([a, b]) => hz >= a * 1e6 && hz <= b * 1e6).sort((x, y) => x[1] - x[0] - (y[1] - y[0])).map(([a, b, name]) => `${name} (${a}–${b} MHz)`);

/** Draw the bands between lo and hi (Hz) as labeled strips across a canvas, `lane` px tall each, from y0 down. */
export function drawBandPlan(g: CanvasRenderingContext2D, lo: number, hi: number, W: number, y0: number, lane: number, dpr: number) {
  const X = (mhz: number) => ((mhz * 1e6 - lo) / (hi - lo)) * W, ends: number[] = [];
  g.save(); g.font = `${Math.round(lane * 0.62)}px ui-sans-serif, system-ui, sans-serif`; g.textBaseline = "middle"; g.textAlign = "left";
  for (const [a, b, name, kind] of [...BANDS].sort((x, y) => x[0] - y[0] || y[1] - x[1])) {
    if (b * 1e6 < lo || a * 1e6 > hi) continue;
    const x0 = Math.max(0, X(a)), x1 = Math.min(W, X(b));
    let k = ends.findIndex((e) => e <= x0); if (k < 0) k = ends.push(0) - 1; // the first lane that's free here
    ends[k] = x1;
    const y = y0 + k * lane;
    g.globalAlpha = 0.45; g.fillStyle = KIND_COLOR[kind]; g.fillRect(x0, y + dpr, Math.max(dpr, x1 - x0), lane - 2 * dpr);
    g.globalAlpha = 1; g.fillStyle = "#fff";
    const label = x1 - x0 > g.measureText(name).width + 8 * dpr ? name : x1 - x0 > g.measureText(name.split(" (")[0]).width + 8 * dpr ? name.split(" (")[0] : "";
    if (label) { g.shadowColor = "#000"; g.shadowBlur = 3 * dpr; g.fillText(label, x0 + 4 * dpr, y + lane / 2); g.shadowBlur = 0; }
  }
  g.restore();
}
