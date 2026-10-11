// The local model: what Blip and Jobs AI fall back to when Ollama Cloud fails or its free credits run out, and Yomu's
// only model (its chat promises nothing leaves this machine). An MLX build on this Mac's Ollama: fast on Apple silicon.
// OLLAMA_MODEL in .env overrides it.
export const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const LOCAL_MODEL = process.env.OLLAMA_MODEL ?? "nemotron-3.5-lightning:30b-mlx";
/** Thinking for the local model: gpt-oss takes an effort level. Other models think freely, which can use up a JSON
 *  reply's whole budget before any answer is written, so they skip thinking when a schema'd answer is wanted. */
export const localThink = (json: boolean) => (LOCAL_MODEL.startsWith("gpt-oss") ? "low" : !json);
