// Opens an RTL-SDR from Node with our own driver, using the `usb` package's WebUSB implementation
// for raw USB access. Shared by the LAN server and the hardware test.
import { WebUSB } from "usb";
import { RtlSdr, isDongle, type UsbDevice } from "../src/rtlsdr.ts";

export async function openDongle(): Promise<RtlSdr> {
  // A fresh WebUSB object each attempt: after a reset the dongle re-enumerates as a new device.
  return RtlSdr.openWithRetry(async () => {
    const dev = (await new WebUSB({ allowAllDevices: true }).getDevices()).find(isDongle);
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
