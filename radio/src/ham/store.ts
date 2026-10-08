// Browser side of the license track: load a pool, and keep progress in this browser (localStorage).
import type { Memory, Pool } from "./srs.ts";

export type PoolId = "T" | "G" | "E";
export const POOL_IDS: PoolId[] = ["T", "G", "E"];
const loaders: Record<PoolId, () => Promise<{ default: unknown }>> = {
  T: () => import("./pool-T.json"), G: () => import("./pool-G.json"), E: () => import("./pool-E.json"),
};
export const loadPool = async (id: PoolId) => (await loaders[id]()).default as Pool;

export interface ExamResult { date: number; score: number; of: number; pass: number; bySub: Record<string, [number, number]> }

const get = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? "") ?? fallback; } catch { return fallback; } };
const put = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: progress lasts for this page only */ } };

export const loadMemory = (id: PoolId): Memory => get(`ham-mem-${id}`, {});
export const saveMemory = (id: PoolId, m: Memory) => put(`ham-mem-${id}`, m);
export const loadExams = (id: PoolId): ExamResult[] => get(`ham-exams-${id}`, []);
export const saveExam = (id: PoolId, r: ExamResult) => put(`ham-exams-${id}`, [...loadExams(id), r].slice(-50));
export const lastPool = (): PoolId => { const p = get<string>("ham-pool", "T"); return POOL_IDS.includes(p as PoolId) ? (p as PoolId) : "T"; };
export const setLastPool = (id: PoolId) => put("ham-pool", id);
export const resetPool = (id: PoolId) => { try { localStorage.removeItem(`ham-mem-${id}`); localStorage.removeItem(`ham-exams-${id}`); } catch { /* nothing stored */ } };

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
