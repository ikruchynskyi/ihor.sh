import "./env.ts";

// The local model: what Blip and Jobs AI fall back to when Ollama Cloud fails or its free credits run out, and Yomu's
// only model (its chat promises nothing leaves this machine). Default qwen3.5:35b (was gpt-oss:20b, which had beaten
// nemotron-3.5-lightning on Yomu's Japanese); OLLAMA_MODEL in .env overrides it.
export const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const LOCAL_MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:35b";

/** Models that take a reasoning effort level in Ollama ("low" / "medium" / "high"). */
export const supportsEffort = (model = LOCAL_MODEL) =>
  model.startsWith("gpt-oss") || model.startsWith("qwen3.5") || model.startsWith("qwen");

/** Thinking for the local model:
 *  - When a schema'd JSON answer is wanted (json = true): gpt-oss takes "low" effort, while models like qwen3.5
 *    skip thinking (false) so thinking doesn't consume the reply's token budget before JSON is written.
 *  - In conversational chat (json = false, e.g. Blip): reasoning models default to "low", or "high" when thinking hard. */
export const localThink = (json: boolean, deep = false, model = LOCAL_MODEL) => {
  if (json) return model.startsWith("gpt-oss") ? "low" : false;
  if (supportsEffort(model)) return deep ? "high" : "low";
  return true;
};
