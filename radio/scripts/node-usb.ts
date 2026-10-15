// Opens the radio from Node with our own drivers, using the `usb` package's WebUSB implementation
// for raw USB access: an RTL-SDR dongle, or a HackRF when that's what is plugged in. Shared by the LAN server and the hardware test.
import { WebUSB } from "usb";
import { RtlSdr, isDongle as isRtl, type UsbDevice } from "../src/rtlsdr.ts";
import { HackRf, isHackRf } from "../src/hackrf.ts";

export type Sdr = RtlSdr | HackRf;

// SDR_DEVICE=rtl: only the RTL-SDR (the satellite server on :8074 keeps to it). Unset: the HackRF, else the RTL-SDR.
const ONLY = process.env.SDR_DEVICE;

export async function openDongle(): Promise<Sdr> {
  const usb = () => new WebUSB({ allowAllDevices: true }).getDevices();
  const hack = ONLY !== "rtl" && (await usb()).find(isHackRf);
  if (hack) return HackRf.open(shim(hack));
  // A fresh WebUSB object each attempt: after a reset the dongle re-enumerates as a new device.
  return RtlSdr.openWithRetry(async () => {
    const dev = (await usb()).find(isRtl);
    return dev ? shim(dev) : undefined;
  });
}

function shim(dev: USBDevice): UsbDevice {
  // The shim's `configuration` getter reads a string descriptor some dongles don't have; the OS has
  // already configured the device, so report it as configured. (Browsers don't need this.)
  const shim = new Proxy(dev, {
    get: (t, k) => (k === "configuration" ? {} : typeof (t as any)[k] === "function" ? (t as any)[k].bind(t) : (t as any)[k]),
  });
  return shim as unknown as UsbDevice;
}

/**
 * USB-reset the dongle (it re-enumerates). Clears a stall where the RTL2832U keeps replaying one stale
 * buffer instead of samples, which otherwise needs unplugging. The dongle must be closed first.
 */
export async function resetDongle(hackrf: boolean): Promise<boolean> { // the one that was open, not the other server's
  const dev = (await new WebUSB({ allowAllDevices: true }).getDevices()).find(hackrf ? isHackRf : isRtl);
  if (!dev) return false;
  try { await dev.open(); await dev.reset(); return true; }
  catch { return false; }
  finally { await dev.close().catch(() => {}); }
}

/**
 * A stalled dongle replays one buffer, so the same 2,000 bytes come back within a chunk. Real samples never
 * do that, not even a near-silent channel at low gain (where short runs of 127/128 can repeat by chance).
 */
export function looksStalled(chunk: Uint8Array) {
  if (chunk.length < 20_000) return false;
  const b = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.length);
  for (let from = 1001; ; ) {
    const j = b.indexOf(b.subarray(1000, 1032), from);
    if (j === -1 || j + 2000 > b.length) return false;
    if (b.compare(b, 1000, 3000, j, j + 2000) === 0 && b.compare(b, j, j + 2000, 1000, 3000) === 0) return true;
    from = j + 1;
  }
}
