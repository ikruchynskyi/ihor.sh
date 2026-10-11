// The local model: what Blip and Jobs AI fall back to when Ollama Cloud fails or its free credits run out, and Yomu's
// only model (its chat promises nothing leaves this machine). gpt-oss:20b: in a side-by-side test of every feature it
// beat nemotron-3.5-lightning (MLX) on Yomu's Japanese, and an MLX Qwen3.6 27B couldn't call tools or answer JSON.
// OLLAMA_MODEL in .env overrides it.
export const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const LOCAL_MODEL = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";
/** Thinking for the local model: gpt-oss takes an effort level. Other models think freely, which can use up a JSON
 *  reply's whole budget before any answer is written, so they skip thinking when a schema'd answer is wanted. */
export const localThink = (json: boolean) => (LOCAL_MODEL.startsWith("gpt-oss") ? "low" : !json);
