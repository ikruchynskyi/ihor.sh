// The visual lessons behind the license track, and which exam groups each one teaches.
// `ready: false` lessons are planned; the practice pages only link to ready ones.

export interface Lesson { slug: string; title: string; blurb: string; groups: string[]; ready: boolean }

export const LESSONS: Lesson[] = [
  { slug: "01-volts-amps-ohms", title: "Volts, amps and ohms", blurb: "Pressure, flow and resistance; Ohm's law, power, series and parallel, meters.", groups: ["T5A", "T5C", "T5D", "T7D", "G5B", "G5C"], ready: true },
  { slug: "02-decibels-and-prefixes", title: "Decibels, prefixes, RMS and PEP", blurb: "Mega to pico, the decibel ladder, what an S-meter counts, average versus peak power.", groups: ["T5B", "G5B", "G4D", "E8A"], ready: false },
  { slug: "03-capacitors-and-inductors", title: "Capacitors and inductors", blurb: "A tank of charge and a flywheel of current; reactance, time constants, transformers.", groups: ["T5C", "T6A", "G5A", "G5C", "G6A", "E5B", "E6D"], ready: false },
  { slug: "04-resonance", title: "Resonance and Q", blurb: "The swinging LC tank, tuning, bandwidth, impedance as an arrow, filters and matching.", groups: ["T6D", "G5A", "E5A", "E5C", "E5D", "E7C"], ready: false },
  { slug: "05-diodes-and-transistors", title: "Diodes, transistors and power supplies", blurb: "One-way valves and controlled valves; rectifiers, regulators, schematics.", groups: ["T6B", "T6C", "T6D", "G6A", "G6B", "G7A", "E6A", "E6B", "E6E", "E6F", "E7D"], ready: false },
  { slug: "06-waves-and-wavelength", title: "Waves and wavelength", blurb: "What a radio wave is, 300 ÷ MHz, band names, polarization, fading.", groups: ["T3A", "T3B", "E5D"], ready: false },
  { slug: "07-antennas", title: "Antennas", blurb: "Current on a dipole, lengths, verticals, gain and patterns, Yagis, loops and direction finding.", groups: ["T9A", "G9B", "G9C", "G9D", "E9A", "E9B", "E9C", "E9D", "E9H"], ready: false },
  { slug: "08-feed-lines-and-swr", title: "Feed lines and SWR", blurb: "Waves that bounce back, standing waves, SWR, loss, tuners, the Smith chart.", groups: ["T7C", "T9B", "G9A", "E9E", "E9F", "E9G"], ready: false },
  { slug: "09-propagation", title: "Propagation", blurb: "Line of sight, the ionosphere by day and night, skip, MUF, the sun, sporadic E, meteors.", groups: ["T3C", "G3A", "G3B", "G3C", "E3A", "E3B", "E3C"], ready: false },
  { slug: "10-signals-and-modes", title: "Signals and modes", blurb: "Bandwidths, deviation, sidebands, digital modes and constellations, TV and SSTV.", groups: ["T8A", "T8D", "G8A", "G8B", "G8C", "E8B", "E8C", "E8D", "E2B"], ready: false },
  { slug: "11-receivers-and-transmitters", title: "Receivers and transmitters", blurb: "Superhets and SDRs, overload and intermod, amplifier classes, oscillators and PLLs.", groups: ["T7A", "T7B", "T4B", "G7B", "G7C", "G4D", "E4C", "E4D", "E7B", "E7E", "E7F", "E7H"], ready: false },
  { slug: "12-rules-and-bands", title: "Rules and bands", blurb: "Who may transmit where: an interactive band chart, power limits, identification, licensing.", groups: ["T1A", "T1B", "T1C", "T1D", "T1E", "T1F", "G1A", "G1B", "G1C", "G1D", "G1E", "E1A", "E1B", "E1C", "E1D", "E1E", "E1F"], ready: false },
  { slug: "13-operating", title: "On the air", blurb: "Phonetics and Q codes, repeaters and tones, nets and emergencies, satellites, contests, DX.", groups: ["T2A", "T2B", "T2C", "T8B", "T8C", "G2A", "G2B", "G2C", "G2D", "G2E", "E2A", "E2C", "E2D", "E2E"], ready: false },
  { slug: "14-safety", title: "Safety", blurb: "Shock and lightning, towers, and RF exposure: how close is too close, by frequency.", groups: ["T0A", "T0B", "T0C", "G0A", "G0B", "E0A"], ready: false },
  { slug: "15-station-and-test-gear", title: "Your station and test gear", blurb: "Hooking it up, grounding, meters, scopes and analyzers, interference hunting.", groups: ["T4A", "G4A", "G4B", "G4C", "G4E", "E4A", "E4B", "E4E"], ready: false },
  { slug: "16-logic-and-op-amps", title: "Logic and op-amps", blurb: "Gates and truth tables, counters and dividers, the ideal amplifier.", groups: ["E6C", "E7A", "E7G"], ready: false },
];

/** Groups that the "Radio from scratch" course already explains, with where. */
export const COURSE: Record<string, { ch: string; title: string }[]> = {
  T4B: [{ ch: "11-numbers-to-speakers.html#squelch", title: "Squelch and AGC" }],
  T8A: [{ ch: "10-am-ssb-and-morse.html#sidebands", title: "AM, SSB and Morse" }, { ch: "09-fm-listening-to-the-speed.html", title: "FM" }],
  T7A: [{ ch: "12-inside-the-dongle.html#image", title: "Inside a receiver" }],
  G4D: [{ ch: "10-am-ssb-and-morse.html#ssb", title: "Single sideband" }],
  G7C: [{ ch: "06-averaging-is-filtering.html", title: "Digital filters" }, { ch: "12-inside-the-dongle.html#image", title: "Superheterodyne" }],
  G8A: [{ ch: "10-am-ssb-and-morse.html", title: "AM, FM and SSB" }],
  G8B: [{ ch: "05-moving-a-station.html", title: "Mixing" }, { ch: "12-inside-the-dongle.html#image", title: "IF and image" }],
  E4C: [{ ch: "12-inside-the-dongle.html#image", title: "Image rejection" }, { ch: "03-taking-snapshots.html#ruler", title: "Dynamic range of 8 bits" }],
  E5C: [{ ch: "02-arrows-as-numbers.html", title: "Arrows as numbers (phasors)" }],
  E7E: [{ ch: "05-moving-a-station.html", title: "Mixers" }, { ch: "09-fm-listening-to-the-speed.html#demod", title: "FM detector" }, { ch: "10-am-ssb-and-morse.html#am", title: "AM detector" }],
  E7F: [{ ch: "03-taking-snapshots.html", title: "Sampling" }, { ch: "06-averaging-is-filtering.html", title: "FIR filters" }, { ch: "07-throwing-away-snapshots.html", title: "Decimation" }],
  E7H: [{ ch: "12-inside-the-dongle.html#pll", title: "The PLL" }, { ch: "05-moving-a-station.html#nco", title: "The NCO (direct digital synthesis)" }],
  E8A: [{ ch: "04-winding-machine.html", title: "Fourier analysis" }, { ch: "03-taking-snapshots.html#ruler", title: "Analog to digital" }],
  E8B: [{ ch: "09-fm-listening-to-the-speed.html", title: "FM deviation" }],
};

export const lessonsFor = (group: string) => LESSONS.filter((l) => l.ready && l.groups.includes(group));
