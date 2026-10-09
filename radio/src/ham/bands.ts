// US amateur privileges (FCC Part 97.301/97.305, ITU Region 2), simplified to what the license exams ask about.
// Each segment lists which classes may transmit there and which kinds of emission are allowed.

export type Cls = "T" | "G" | "E";
export type Kind = "cw" | "data" | "phone"; // phone includes image (SSTV etc.) except where noted
export interface Segment { lo: number; hi: number; classes: Cls[]; kinds: Kind[]; note?: string }
export interface Band { name: string; lo: number; hi: number; segments: Segment[]; power?: string }

const TGE: Cls[] = ["T", "G", "E"], GE: Cls[] = ["G", "E"], E: Cls[] = ["E"];
const CWD: Kind[] = ["cw", "data"], ALL: Kind[] = ["cw", "data", "phone"], CW: Kind[] = ["cw"];
// On HF, RTTY/data belongs in the CW/data segments; phone/image segments allow phone, image and CW (97.305).
const PH: Kind[] = ["cw", "phone"];

export const BANDS: Band[] = [
  { name: "160 m", lo: 1.8, hi: 2.0, segments: [{ lo: 1.8, hi: 2.0, classes: GE, kinds: ALL }] },
  { name: "80 m", lo: 3.5, hi: 4.0, segments: [
    { lo: 3.5, hi: 3.525, classes: E, kinds: CWD }, { lo: 3.525, hi: 3.6, classes: TGE, kinds: CWD, note: "Technicians: CW only, 200 W" },
    { lo: 3.6, hi: 3.8, classes: E, kinds: PH }, { lo: 3.8, hi: 4.0, classes: GE, kinds: PH }] },
  { name: "60 m", lo: 5.3305, hi: 5.4065, power: "100 W PEP ERP", segments: [5.332, 5.348, 5.3585, 5.373, 5.405].map((c) => ({ lo: c - 0.0015, hi: c + 0.0015, classes: GE, kinds: ALL, note: "five 2.8 kHz channels; CW at the channel center" })) },
  { name: "40 m", lo: 7.0, hi: 7.3, segments: [
    { lo: 7.0, hi: 7.025, classes: E, kinds: CWD }, { lo: 7.025, hi: 7.125, classes: TGE, kinds: CWD, note: "Technicians: CW only, 200 W" },
    { lo: 7.125, hi: 7.175, classes: E, kinds: PH }, { lo: 7.175, hi: 7.3, classes: GE, kinds: PH }] },
  { name: "30 m", lo: 10.1, hi: 10.15, power: "200 W PEP", segments: [{ lo: 10.1, hi: 10.15, classes: GE, kinds: CWD, note: "no phone or image" }] },
  { name: "20 m", lo: 14.0, hi: 14.35, segments: [
    { lo: 14.0, hi: 14.025, classes: E, kinds: CWD }, { lo: 14.025, hi: 14.15, classes: GE, kinds: CWD },
    { lo: 14.15, hi: 14.225, classes: E, kinds: PH }, { lo: 14.225, hi: 14.35, classes: GE, kinds: PH }] },
  { name: "17 m", lo: 18.068, hi: 18.168, segments: [{ lo: 18.068, hi: 18.11, classes: GE, kinds: CWD }, { lo: 18.11, hi: 18.168, classes: GE, kinds: PH }] },
  { name: "15 m", lo: 21.0, hi: 21.45, segments: [
    { lo: 21.0, hi: 21.025, classes: E, kinds: CWD }, { lo: 21.025, hi: 21.2, classes: TGE, kinds: CWD, note: "Technicians: CW only, 200 W" },
    { lo: 21.2, hi: 21.275, classes: E, kinds: PH }, { lo: 21.275, hi: 21.45, classes: GE, kinds: PH }] },
  { name: "12 m", lo: 24.89, hi: 24.99, segments: [{ lo: 24.89, hi: 24.93, classes: GE, kinds: CWD }, { lo: 24.93, hi: 24.99, classes: GE, kinds: PH }] },
  { name: "10 m", lo: 28.0, hi: 29.7, segments: [
    { lo: 28.0, hi: 28.3, classes: TGE, kinds: CWD, note: "Technicians: CW and data, 200 W; beacons at 28.2–28.3" },
    { lo: 28.3, hi: 28.5, classes: TGE, kinds: PH, note: "Technicians: CW and SSB phone, 200 W" },
    { lo: 28.5, hi: 29.7, classes: GE, kinds: PH, note: "repeaters above 29.5 MHz" }] },
  { name: "6 m", lo: 50, hi: 54, segments: [{ lo: 50, hi: 50.1, classes: TGE, kinds: CW, note: "CW only" }, { lo: 50.1, hi: 54, classes: TGE, kinds: ALL }] },
  { name: "2 m", lo: 144, hi: 148, segments: [{ lo: 144, hi: 144.1, classes: TGE, kinds: CW, note: "CW only" }, { lo: 144.1, hi: 148, classes: TGE, kinds: ALL }] },
  { name: "1.25 m", lo: 222, hi: 225, segments: [{ lo: 222, hi: 225, classes: TGE, kinds: ALL }] },
  { name: "70 cm", lo: 420, hi: 450, segments: [{ lo: 420, hi: 450, classes: TGE, kinds: ALL, note: "420–430 MHz off-limits north of Line A" }] },
];

export const CLASS_NAME: Record<Cls, string> = { T: "Technician", G: "General", E: "Amateur Extra" };

/** Is a signal occupying lo…hi MHz, of this kind, allowed for this class? Every part must sit inside allowed segments. */
export function check(lo: number, hi: number, kind: Kind, cls: Cls): { ok: boolean; why: string } {
  const band = BANDS.find((b) => lo >= b.lo - 1e-9 && hi <= b.hi + 1e-9);
  if (!band) {
    const near = BANDS.find((b) => hi > b.lo && lo < b.hi);
    return { ok: false, why: near ? `part of the signal is outside the ${near.name} band` : "not in an amateur band" };
  }
  // walk the signal through the segments it touches
  const parts = band.segments.filter((s) => hi > s.lo + 1e-9 && lo < s.hi - 1e-9);
  let covered = lo;
  for (const s of parts.sort((a, b) => a.lo - b.lo)) {
    if (s.lo > covered + 1e-9) return { ok: false, why: "part of the signal falls between allowed segments" };
    if (!s.classes.includes(cls)) return { ok: false, why: `${s.lo.toFixed(3)}–${s.hi.toFixed(3)} MHz is not a ${CLASS_NAME[cls]} segment` };
    if (!s.kinds.includes(kind)) return { ok: false, why: `${kind === "phone" ? "phone" : kind === "cw" ? "CW" : "data"} isn't allowed in ${s.lo.toFixed(3)}–${s.hi.toFixed(3)} MHz${s.note ? ` (${s.note})` : ""}` };
    covered = s.hi;
  }
  if (covered < hi - 1e-9) return { ok: false, why: "part of the signal is outside the allowed segment" };
  const note = parts.find((s) => s.note)?.note;
  return { ok: true, why: `${band.name}${note ? `: ${note}` : ""}${band.power ? `; power limit ${band.power}` : ""}` };
}
