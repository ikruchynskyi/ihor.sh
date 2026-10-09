// Morse code: the code table, timing, a keying decoder and scoring. Pure functions, so node tests them.

export const CODE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "'": ".----.", "@": ".--.-.",
};
export const DECODE: Record<string, string> = Object.fromEntries(Object.entries(CODE).map(([c, m]) => [m, c]));

/** Koch method order (as on LCWO): learn at full speed, two characters first, add one when copy reaches 90%. */
export const KOCH = "KMURESNAPTLWI.JZ=FOY,VG5/Q92H38B?47C1D60X".split("");

/** Milliseconds per dit at `wpm` (PARIS: 50 dit units per word). */
export const ditMs = (wpm: number) => 1200 / wpm;

/** Gaps for character speed `wpm` and Farnsworth effective speed `eff` (ARRL formula); eff >= wpm means standard spacing. */
export function spacing(wpm: number, eff = wpm) {
  const dit = ditMs(wpm);
  if (eff >= wpm) return { dit, charGap: 3 * dit, wordGap: 7 * dit };
  const ta = ((60 * wpm - 37.2 * eff) / (wpm * eff)) * 1000; // total extra delay per word, ms
  return { dit, charGap: (3 * ta) / 19, wordGap: (7 * ta) / 19 };
}

/** Key-down intervals [startMs, endMs) for `text`, starting at 0, and when each character starts and ends (spaces too,
 *  so a page can reveal the text as it plays). Unknown characters are skipped. */
export function schedule(text: string, wpm: number, eff = wpm) {
  const { dit, charGap, wordGap } = spacing(wpm, eff);
  const tones: [number, number][] = [], chars: { c: string; at: number; end: number }[] = [];
  let t = 0;
  const words = text.toUpperCase().trim().split(/\s+/).filter(Boolean);
  words.forEach((word, wi) => {
    const letters = [...word].filter((c) => CODE[c]);
    letters.forEach((c, ci) => {
      chars.push({ c, at: t, end: 0 });
      [...CODE[c]].forEach((el, ei) => {
        const len = el === "." ? dit : 3 * dit;
        tones.push([t, t + len]);
        t += len + (ei < CODE[c].length - 1 ? dit : 0);
      });
      chars[chars.length - 1].end = t;
      if (ci < letters.length - 1) t += charGap;
    });
    if (wi < words.length - 1) { t += wordGap; chars.push({ c: " ", at: t, end: t }); }
  });
  return { tones, chars, duration: t };
}

/**
 * Turns keying into text. Feed it elements (from paddles) or key-down/up times (straight key);
 * it adapts its dit estimate to the sender and splits characters and words by the gaps.
 */
export class KeyDecoder {
  dit: number;
  text = "";
  current = ""; // dots and dashes of the character being keyed
  private downAt = 0;
  private lastUp = 0;
  /** The least silence (ms) that ends a letter / a word. Farnsworth spacing stretches these, which gives a
   *  sender on a keyboard or paddles time between letters. */
  letterGap = 0;
  wordGap = 0;
  constructor(wpm: number, eff = wpm) { this.dit = ditMs(wpm); this.setSpeed(wpm, eff); }
  /** Gaps halfway between what separates elements and letters, and between letters and words, at this spacing. */
  setSpeed(wpm: number, eff = wpm) {
    const { dit, charGap, wordGap } = spacing(wpm, eff);
    this.dit = dit; this.letterGap = (dit + charGap) / 2; this.wordGap = (charGap + wordGap) / 2;
  }

  private held = false; // a key (or a keyer's element) is sounding: silence isn't being counted
  /** Straight key: the key went down at `t` ms. */
  down(t: number) { this.gap(t); this.downAt = t; this.held = true; }
  /** Paddle keyer: an element starts sounding at `t` ms (it's added when it ends, with element()). */
  start(t: number) { this.gap(t); this.held = true; }
  /** Straight key: the key went up at `t` ms. Returns the element it was read as. */
  up(t: number) {
    this.held = false;
    const d = t - this.downAt;
    const el = d < 2 * this.dit ? "." : "-";
    // adapt to the sender: a dit is one unit, a dah three
    this.dit = 0.8 * this.dit + 0.2 * Math.min(Math.max(el === "." ? d : d / 3, this.dit / 2), this.dit * 2);
    return this.element(el, t);
  }
  /** Paddle keyer: a whole element that ended at `t` ms. */
  element(el: "." | "-", t: number) { this.held = false; this.current += el; this.lastUp = t; return el; }

  /** Close the character / add a space if the silence since the last element is long enough. */
  gap(t: number) {
    if (!this.current || this.held) return;
    const silent = t - this.lastUp;
    if (silent >= Math.max(2 * this.dit, this.letterGap)) {
      this.text += DECODE[this.current] ?? "*";
      this.current = "";
      if (silent >= Math.max(5 * this.dit, this.wordGap)) this.text += " ";
    }
  }
  /** Call regularly while idle so the last character (and word) appear without waiting for the next key-down. */
  idle(t: number) {
    if (this.held) return;
    this.gap(t);
    if (!this.current && this.text && !this.text.endsWith(" ") && t - this.lastUp >= Math.max(5 * this.dit, this.wordGap)) this.text += " ";
  }
  reset() { this.text = ""; this.current = ""; }
}

/** Character-level comparison of what was expected and what was copied (spaces ignored). */
export function score(expected: string, got: string) {
  const a = expected.toUpperCase().replace(/\s+/g, ""), b = got.toUpperCase().replace(/\s+/g, "");
  // Levenshtein with a backtrace, so the page can show exactly which characters were missed or wrong.
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ops: { op: "ok" | "wrong" | "missed" | "extra"; want?: string; got?: string }[] = [];
  for (let i = a.length, j = b.length; i > 0 || j > 0; ) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.unshift({ op: a[i - 1] === b[j - 1] ? "ok" : "wrong", want: a[i - 1], got: b[j - 1] }); i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.unshift({ op: "missed", want: a[i - 1] }); i--; }
    else { ops.unshift({ op: "extra", got: b[j - 1] }); j--; }
  }
  const errors = d[a.length][b.length];
  return { accuracy: a.length ? Math.max(0, 1 - errors / a.length) : 1, errors, ops };
}

/** Random practice groups from `chars`, the newest one (last) a bit more often. */
export function groups(chars: string[], count = 5, size = 5, rand = Math.random) {
  const pick = () => (rand() < 0.3 ? chars[chars.length - 1] : chars[Math.floor(rand() * chars.length)]);
  return Array.from({ length: count }, () => Array.from({ length: size }, pick).join("")).join(" ");
}

export const WORDS = "THE OF AND TO IN IS IT YOU THAT WAS FOR ON ARE WITH AS HIS THEY BE AT ONE HAVE THIS FROM OR HAD BY HOT WORD BUT WHAT SOME WE CAN OUT OTHER WERE ALL THERE WHEN UP USE YOUR HOW SAID AN EACH SHE WHICH DO THEIR TIME IF WILL WAY ABOUT MANY THEN THEM WRITE WOULD LIKE SO THESE HER LONG MAKE THING SEE HIM TWO HAS LOOK MORE DAY COULD GO COME DID NUMBER SOUND NO MOST PEOPLE MY OVER KNOW WATER THAN CALL FIRST WHO MAY DOWN SIDE BEEN NOW FIND".split(" ");
export const QSO = ["CQ CQ DE", "RST 599", "QTH NEW YORK", "NAME IS", "TNX FER QSO", "73 ES GL", "QRZ?", "PSE QSL", "WX SUNNY", "RIG IS", "ANT DIPOLE", "HW CPY?", "BK", "SK"];

/** A plausible US-style amateur callsign: 1x2, 2x1, 2x3… */
export function callsign(rand = Math.random) {
  const L = () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(rand() * 26)], D = () => String(Math.floor(rand() * 10));
  const prefix = rand() < 0.5 ? (["K", "W", "N"][Math.floor(rand() * 3)]) : (["K", "W", "N", "A"][Math.floor(rand() * 4)] + L());
  return prefix + D() + Array.from({ length: 1 + Math.floor(rand() * 3) }, L).join("");
}
