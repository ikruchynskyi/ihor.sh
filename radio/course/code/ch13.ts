// Radio from scratch, chapter 13: USB from zero.
// Run it:  node course/code/ch13.ts     (the dongle must be free: nobody listening to the server)
// Talks to the dongle with raw USB control transfers only, no driver: the same calls a web page makes.
import { WebUSB } from "usb";

const dev: any = (await new WebUSB({ allowAllDevices: true }).getDevices()).find((d) => d.vendorId === 0x0bda);
if (!dev) throw new Error("plug in the dongle");

// 1. The device descriptor: who it is.
console.log(`device: ${dev.manufacturerName} ${dev.productName}, serial ${dev.serialNumber}, USB ${dev.usbVersionMajor}.${dev.usbVersionMinor}, vendor 0x${dev.vendorId.toString(16)}, product 0x${dev.productId.toString(16)}`);

// 2. Open it and claim interface 0 (the one with the bulk endpoint).
await dev.open();
await dev.claimInterface(0);
const setup = (value: number, index: number) => ({ requestType: "vendor", recipient: "device", request: 0, value, index });
const out = (value: number, index: number, bytes: number[]) => dev.controlTransferOut(setup(value, index), new Uint8Array(bytes));
const inp = async (value: number, index: number, len: number) => new Uint8Array((await dev.controlTransferIn(setup(value, index), len)).data.buffer);
const hex = (b: number) => "0x" + b.toString(16).padStart(2, "0");

// 3. A plain register write: USB block (1), register USB_SYSCTL (0x2000) = 0x09. index = block << 8 | 0x10 (write).
await out(0x2000, (1 << 8) | 0x10, [0x09]);
console.log(`wrote 0x09 to USB register 0x2000           (value 0x2000, index ${hex((1 << 8) | 0x10)})`);

// 4. Read it back: index = block << 8 (no 0x10 = read).
console.log(`read back USB register 0x2000: ${hex((await inp(0x2000, 1 << 8, 1))[0])}`);

// 5. Power up the demodulator part of the chip (system block 2), or its registers won't answer ("endpoint stalled").
await out(0x300b, (2 << 8) | 0x10, [0x22]);   // DEMOD_CTL_1
await out(0x3000, (2 << 8) | 0x10, [0xe8]);   // DEMOD_CTL: power on
console.log("demodulator powered on");

// 6. Turn on the I2C repeater (demod page 1, register 1 = 0x18), so the tuner chip can hear us.
//    Demod registers: value = addr << 8 | 0x20, index = page | 0x10; then a dummy read of page 0x0a register 1.
await out((0x01 << 8) | 0x20, 0x10 | 1, [0x18]);
await inp((0x01 << 8) | 0x20, 0x0a, 1);
console.log("I2C repeater on");

// 7. Ask the tuner (I2C address 0x34) for its register 0: an R820T answers 0x69.
await out(0x34, (6 << 8) | 0x10, [0x00]);          // I2C write: "start at register 0"
const id = (await inp(0x34, 6 << 8, 1))[0];        // I2C read: one byte
console.log(`tuner at I2C address 0x34, register 0: ${hex(id)} ${id === 0x69 ? "→ an R820T-family tuner" : "→ not an R820T"}`);

await out((0x01 << 8) | 0x20, 0x10 | 1, [0x10]);   // repeater off
await inp((0x01 << 8) | 0x20, 0x0a, 1);
await dev.releaseInterface(0); await dev.close();
console.log("all checks passed");
