// Run: node monitor.test.ts — the callsign finder on caption text (a broken filter here once crashed the server).
import assert from "node:assert/strict";
import { findCallsigns } from "./monitor.ts";

assert.deepEqual(findCallsigns("this is kilo two alpha bravo charlie, W2VL and G4ABC"), [{ call: "W2VL", how: "spoken" }, { call: "G4ABC", how: "spoken" }, { call: "K2ABC", how: "phonetic" }]);
assert.deepEqual(findCallsigns("golf four alpha bravo charlie"), []); // spelled-out calls only count when they're US ones
assert.deepEqual(findCallsigns("nothing to see here"), []);
console.log("monitor ok");
process.exit(0);
