/** rtl_sdr output: interleaved unsigned 8-bit I/Q, 127.5 = zero. */
export function decodeCU8(buf: ArrayBuffer | Uint8Array): Float32Array {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const out = new Float32Array(u.length & ~1);
  for (let i = 0; i < out.length; i++) out[i] = (u[i] - 127.5) / 127.5;
  return out;
}

/** GQRX / GNU Radio: interleaved little-endian float32 I/Q. */
export function decodeCF32(buf: ArrayBuffer): Float32Array {
  return new Float32Array(buf, 0, (buf.byteLength >> 3) * 2);
}

const UNIT: Record<string, number> = { "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

/**
 * Center frequency and sample rate from the last two numbers in a file name:
 * "fm_100.3M_2.4M.cu8" and "gqrx_20240101_120000_100300000_2400000_fc.raw" both work.
 */
export function parseName(name: string): { center?: number; rate?: number } {
  const nums = [...name.replace(/\.[^.]+$/, "").matchAll(/(\d+(?:\.\d+)?)([kKMG]?)(?![\d.])/g)]
    .map((m) => parseFloat(m[1]) * UNIT[m[2]]);
  if (nums.length < 2) return {};
  return { center: nums[nums.length - 2], rate: nums[nums.length - 1] };
}
