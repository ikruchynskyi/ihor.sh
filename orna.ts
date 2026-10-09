// ORNA guild-shop planner, ported from the Orna Telegram bot (~/orna-telegram-bot): which guild sells which
// crafting material when (a community "Material Forecast" Google Sheet), and how many guild proofs an amount
// costs (formula from OrnaCodex's ProofView.vue). Material tier/rarity: orna/materials.json from the bot's codex.
import { readFileSync } from "node:fs";
import path from "node:path";

export const GUILDS = ["Agony", "Despair", "Melancholy", "Torment", "Coral", "Deepshards", "Remembrance", "Sparring", "Trials", "Towers"];
export const PROOFS: Record<string, { currency: string; scaling: number }> = {
  Agony: { currency: "Proof of Agony", scaling: 1 }, Despair: { currency: "Proof of Despair", scaling: 1 },
  Melancholy: { currency: "Proof of Melancholy", scaling: 1 }, Torment: { currency: "Proof of Torment", scaling: 1 },
  Coral: { currency: "Coral", scaling: 20 }, Deepshards: { currency: "Deepshard", scaling: 20 },
  Remembrance: { currency: "Proof of Remembrance", scaling: 2 }, Sparring: { currency: "Proof of Sparring", scaling: 4 },
  Trials: { currency: "Proof of Trials", scaling: 2 }, Towers: { currency: "Tower Shard", scaling: 200 },
};
const RARITY: Record<string, number> = { common: 0, rare: 1, famed: 2, legendary: 3 };
export const baseRate = (tier: number, rarity: string) => tier * 10 + (RARITY[rarity.trim().toLowerCase()] ?? 0) * 5;
export const proofsNeeded = (count: number, guild: string, base: number) => Math.ceil((count * PROOFS[guild].scaling * base) / 100);

export const MATERIALS: Record<string, { tier: number; rarity: string; uk?: string }> = JSON.parse(readFileSync(path.join(import.meta.dirname, "orna", "materials.json"), "utf8"));

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "October 9" → the next date on or after `today` (this year, or next if it has passed). */
export function nextOccurrence(s: string, today: Date) {
  const m = s.trim().match(/^([A-Z][a-z]+)\s+(\d{1,2})$/);
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  if (month < 0) return null;
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let d = Date.UTC(today.getUTCFullYear(), month, Number(m![2]));
  if (d < t0) d = Date.UTC(today.getUTCFullYear() + 1, month, Number(m![2]));
  return new Date(d);
}

const SHEET = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.ORNA_SPREADSHEET_ID ?? "1gWTEeQnFlNePLTOLCbrzyMWljJjR01L84z2tpeaOAi8"}/values/${encodeURIComponent("Material Forecast!L6:W68")}`;
let cache: { at: number; rows: { material: string; dates: Record<string, string> }[] } | null = null;
async function forecast() {
  if (cache && cache.at > Date.now() - 3600_000) return cache.rows;
  const r = await fetch(`${SHEET}?key=${process.env.SHEETS_API_KEY ?? ""}`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`sheets ${r.status}`);
  const values: string[][] = (await r.json()).values ?? [];
  // row 0 is the header; column 1 (Anguish) is an outdated mechanic, the guilds follow in GUILDS order
  const rows = values.slice(1).filter((v) => v[0]).map((v) => ({ material: v[0].trim(), dates: Object.fromEntries(GUILDS.map((g, i) => [g, (v[i + 2] ?? "").trim()])) }));
  cache = { at: Date.now(), rows };
  return rows;
}

const nyToday = () => new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Every guild and the materials it sells today. */
export async function today() {
  const t = nyToday(), rows = await forecast();
  return { date: iso(t), guilds: GUILDS.map((g) => ({ guild: g, currency: PROOFS[g].currency, materials: rows.filter((r) => { const d = nextOccurrence(r.dates[g], t); return d && iso(d) === iso(t); }).map((r) => r.material) })) };
}

/** Where and when to buy `count` of a material: each guild's next date and the proofs it costs, soonest first. */
export async function plan(material: string, count = 0) {
  const rows = await forecast(), t = nyToday();
  const q = material.trim().toLowerCase();
  const row = rows.find((r) => r.material.toLowerCase() === q) ?? rows.find((r) => r.material.toLowerCase().includes(q) || MATERIALS[r.material]?.uk?.toLowerCase().includes(q));
  if (!row) return { error: `"${material}" isn't in the forecast.`, materials: rows.map((r) => r.material) };
  const meta = MATERIALS[row.material], base = meta ? baseRate(meta.tier, meta.rarity) : null;
  const guilds = GUILDS.map((g) => ({ g, d: nextOccurrence(row.dates[g], t) })).filter((x) => x.d).sort((a, b) => a.d!.getTime() - b.d!.getTime())
    .map(({ g, d }) => ({ guild: g, date: iso(d!), inDays: Math.round((d!.getTime() - t.getTime()) / 86400_000), currency: PROOFS[g].currency, proofs: base != null && count > 0 ? proofsNeeded(count, g, base) : null }));
  return { material: row.material, uk: meta?.uk ?? null, tier: meta?.tier ?? null, rarity: meta?.rarity ?? null, baseRate: base, count, guilds };
}

export async function materialNames() { return (await forecast()).map((r) => ({ en: r.material, uk: MATERIALS[r.material]?.uk ?? null })); }
