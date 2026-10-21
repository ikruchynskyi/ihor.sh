import path from "node:path";
try { process.loadEnvFile(path.join(import.meta.dirname, "..", ".env")); } catch {}
