// Mochi's voice (yomu/chat.html): Irodori-TTS with the stories' young woman's voice, on this Mac's GPU (server/voice.py,
// in ~/Irodori-TTS/.venv). host.ts starts one worker with the site; it takes one line at a time, is started again if
// it crashes or gets stuck, and quits after 10 idle minutes to give its ~2.4 GB back; the next line loads it again
// (~12 s). The site runs in Docker (no Mac GPU there), so it asks through host.ts's bridge, like OCR. If the voice is down, the page falls back to the browser's voice.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

const PY = process.env.VOICE_PY ?? "/Users/irishdash/Irodori-TTS/.venv/bin/python";
const SCRIPT = path.join(import.meta.dirname, "voice.py");
type Worker = { p: ChildProcessWithoutNullStreams; lines: AsyncIterator<string> };

let ready: Promise<Worker> | null = null;
let line: Promise<unknown> = Promise.resolve(); // one synthesis at a time
let backoff = 5_000;
const IDLE_MS = Number(process.env.VOICE_IDLE_MS ?? 10 * 60_000);
let idle: ReturnType<typeof setTimeout> | undefined;
/** (Re)starts the 10-minute countdown to unloading the model. */
function armIdle() {
  clearTimeout(idle);
  idle = setTimeout(async () => {
    const w = ready;
    if (!w) return;
    ready = null; // first, so its exit isn't taken for a crash and restarted
    (await w.catch(() => null))?.p.kill();
    console.log(`voice: idle ${IDLE_MS / 60_000} min, model unloaded`);
  }, IDLE_MS);
}

function boot(): Promise<Worker> {
  const p = spawn(PY, [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
  p.stderr.resume(); // its logs: not needed, but must not fill the pipe
  const lines = readline.createInterface({ input: p.stdout })[Symbol.asyncIterator]();
  const w = lines.next().then((first) => { // {"ready": true} once the model is loaded (~12 s)
    if (first.done) throw new Error("voice worker didn't start");
    backoff = 5_000;
    armIdle();
    return { p, lines };
  });
  w.catch(() => {});
  p.on("error", () => {}); // no venv: "exit" follows, and the retries back off to every 10 minutes
  p.on("exit", (code) => {
    if (ready !== w) return;
    ready = null;
    console.warn(`voice: worker exited (${code}), restarting in ${backoff / 1000} s`);
    setTimeout(startVoice, backoff);
    backoff = Math.min(backoff * 2, 600_000);
  });
  return w;
}
/** Starts the worker (host.ts, at boot) or returns the running one. */
export const startVoice = () => (ready ??= boot());

/** Speech for `text` as MP3, made here (on the Mac). */
export function voiceLocal(text: string): Promise<Buffer> {
  const run = line.then(async () => {
    clearTimeout(idle);
    const w = await startVoice(); // loads it again if it was unloaded
    const t = setTimeout(() => w.p.kill(), 90_000); // a stuck GPU: killed, and started again
    try {
      w.p.stdin.write(JSON.stringify({ text }) + "\n");
      const r = await w.lines.next();
      if (r.done) throw new Error("voice worker stopped");
      const j = JSON.parse(r.value);
      if (j.error) throw new Error(j.error);
      return Buffer.from(j.mp3, "base64");
    } finally { clearTimeout(t); armIdle(); }
  });
  line = run.catch(() => {});
  return run;
}

/** Speech for `text` as MP3: through the host bridge when this runs in Docker. */
export async function voice(text: string): Promise<Buffer> {
  if (!process.env.HOST_BRIDGE) return voiceLocal(text);
  const r = await fetch(`${process.env.HOST_BRIDGE}/voice`, { method: "POST", body: JSON.stringify({ text }), signal: AbortSignal.timeout(100_000) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `voice: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
