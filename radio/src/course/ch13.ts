// Chapter 13: USB from zero. Descriptors, setup packets, bus time, and raw WebUSB calls.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, Scene, controls, val, line, label } from "./anim.ts";

const el = (id: string) => document.getElementById(id)!;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hex = (v: number, w = 2) => "0x" + v.toString(16).toUpperCase().padStart(w, "0");

// --- 1. The descriptor tree of the dongle on this site's server (read on 2026-10-08) ------------------------------------
const TREE: { id: string; depth: number; title: string; facts: string; text: string }[] = [
  { id: "dev", depth: 0, title: "Device", facts: "USB 2.0 · vendor 0x0BDA (Realtek) · product 0x2838 · \"Nooelec NESDR SMArt v5\" · serial 28695281 · 1 configuration",
    text: "The first thing a computer asks any new USB device: who are you? The answer is the <b>device descriptor</b>. The vendor and product numbers are how software recognizes a dongle; our page asks the browser for devices matching 0x0BDA:0x2838. The names are optional text strings stored on the device." },
  { id: "ep0", depth: 1, title: "Endpoint 0 (control)", facts: "both directions · 64-byte packets · every device has it",
    text: "Every USB device has endpoint 0, a two-way channel for <b>control transfers</b>: short, checked messages. The computer uses it to read descriptors and set the device up, and our driver uses it for every register read and write." },
  { id: "cfg", depth: 1, title: "Configuration 1", facts: "the only one · its name string can't be read (\"invalid descriptor\")",
    text: "A device can offer several ways of working, called configurations; almost all offer one. This dongle's configuration has a name string that its firmware doesn't serve correctly, which is why Node's WebUSB package crashed on it in the hardware tests (the driver chapter's article tells the story): real hardware has quirks." },
  { id: "if0", depth: 2, title: "Interface 0", facts: "class 255 = vendor-specific · 1 endpoint",
    text: "An interface is one function of the device. Class 255 means <b>vendor-specific</b>: no standard driver understands it (unlike a keyboard or a USB stick), so a program must know the chip's own protocol. That's why the dongle needs our driver, and why Windows needs WinUSB installed for it." },
  { id: "ep81", depth: 3, title: "Endpoint 0x81 (bulk in)", facts: "endpoint 1, device → computer · bulk · 512-byte packets",
    text: "The sample stream. 0x81 means endpoint number 1, direction in (the top bit set). <b>Bulk</b> transfers are for large amounts of data: they use whatever bus time is free and are checked for errors, but have no guaranteed timing, which is why the driver keeps several requests waiting (chapter 8 and the build guide's timeline)." },
];
{
  const box = el("desc-tree");
  box.innerHTML = TREE.map((n) => `<button class="dt-node" data-id="${n.id}" style="margin-left:${n.depth * 22}px;width:calc(100% - ${n.depth * 22}px)"><b>${n.title}</b><span>${n.facts}</span></button>`).join("") + `<div class="dt-text" id="dt-text" aria-live="polite"></div>`;
  const pick = (id: string) => {
    box.querySelectorAll(".dt-node").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.id === id));
    el("dt-text").innerHTML = TREE.find((n) => n.id === id)!.text;
  };
  box.querySelectorAll<HTMLButtonElement>(".dt-node").forEach((b) => b.addEventListener("click", () => pick(b.dataset.id!)));
  pick("dev");
}

// --- 2. Setup packets: the exact bytes ---------------------------------------------------------------------------------------
type Xfer = { dir: "out" | "in"; value: number; index: number; data: number[]; note: string };
const OPS: Record<string, { name: string; xfers: Xfer[] }> = {
  usb: { name: "Write USB register 0x2000 = 0x09", xfers: [{ dir: "out", value: 0x2000, index: 0x0110, data: [0x09], note: "block 1 (USB) << 8, + 0x10 = write" }] },
  pwr: { name: "Power on the demodulator (system register 0x3000 = 0xE8)", xfers: [{ dir: "out", value: 0x3000, index: 0x0210, data: [0xe8], note: "block 2 (system) << 8, + 0x10 = write" }] },
  rep: { name: "Turn on the I2C repeater (demod page 1, register 1 = 0x18)", xfers: [
    { dir: "out", value: 0x0120, index: 0x0011, data: [0x18], note: "value = register 1 << 8 | 0x20, index = page 1 | 0x10" },
    { dir: "in", value: 0x0120, index: 0x000a, data: [0x00], note: "the dummy read the chip expects after every demod write" }] },
  i2c: { name: "Read the tuner's register 0 (I2C address 0x34)", xfers: [
    { dir: "out", value: 0x0034, index: 0x0610, data: [0x00], note: "I2C write to 0x34: \"start at register 0\" (block 6, + 0x10)" },
    { dir: "in", value: 0x0034, index: 0x0600, data: [0x69], note: "I2C read from 0x34: the tuner answers 0x69 (block 6, read)" }] },
};
const FIELD_COLORS = [C.pink, C.text, C.green, C.green, C.yellow, C.yellow, C.blue, C.blue];
{
  const sel = el("sp-op") as HTMLSelectElement;
  sel.innerHTML = Object.entries(OPS).map(([k, o]) => `<option value="${k}">${o.name}</option>`).join("");
  const bytesOf = (x: Xfer) => [x.dir === "out" ? 0x40 : 0xc0, 0x00, x.value & 0xff, x.value >> 8, x.index & 0xff, x.index >> 8, x.data.length & 0xff, x.data.length >> 8];
  const render = () => {
    const op = OPS[sel.value];
    el("sp-bytes").innerHTML = op.xfers.map((x, i) => `
      <div class="sp-x"><div class="sp-h">Transfer ${i + 1}: ${x.dir === "out" ? "computer → dongle" : "dongle → computer"} · ${x.note}</div>
      <div class="sp-row">${bytesOf(x).map((b, k) => `<span class="sp-b" style="border-color:${FIELD_COLORS[k]}">${hex(b)}</span>`).join("")}
      <span class="sp-d">then ${x.dir === "out" ? "sends" : "receives"} ${x.data.map((d) => hex(d)).join(" ")}</span></div></div>`).join("");
  };
  sel.addEventListener("input", () => { render(); s.t = 0; });
  render();
  const s = new Scene(el("s-packet"), (g, w, h, t) => {
    const op = OPS[sel.value], L = 70, R = w - 70, y = h / 2;
    g.fillStyle = "#1e2530"; g.fillRect(8, y - 30, 64, 60); g.fillRect(w - 72, y - 30, 64, 60);
    label(g, "computer", 40, y + 4, C.text, "center", 11); label(g, "dongle", w - 40, y + 4, C.text, "center", 11);
    line(g, L, y, R, y, C.grid, 2);
    // each transfer: setup packet out, then data out (or data back), then a short "ok"
    const per = 2.2, total = per * op.xfers.length, tt = still ? per * 0.45 : t % (total + 0.6), k = Math.min(op.xfers.length - 1, Math.floor(tt / per)), ph = (tt - k * per) / per;
    const x = op.xfers[k];
    const pkt = (p: number, toRight: boolean, text: string, col: string) => {
      const px = toRight ? L + (R - L) * p : R - (R - L) * p;
      g.fillStyle = col; g.fillRect(px - 34, y - 12, 68, 24);
      label(g, text, px, y + 4, "#14171d", "center", 10);
    };
    if (ph < 0.45) pkt(ph / 0.45, true, "setup 8 B", C.pink);
    else if (ph < 0.85) pkt((ph - 0.45) / 0.4, x.dir === "out", x.dir === "out" ? `data ${hex(x.data[0])}` : `reply ${hex(x.data[0])}`, x.dir === "out" ? C.yellow : C.green);
    label(g, `transfer ${k + 1} of ${op.xfers.length}`, w / 2, 18, C.muted, "center", 11);
  }, 120, { label: "A control transfer: a setup packet travels to the dongle, followed by data out or a reply back" });
}

// --- 3. Bus time: how much of USB 2.0 the radio stream uses ----------------------------------------------------------------
{
  const s = new Scene(el("s-bus"), (g, w, h) => {
    const rate = val("bs-r") * 1e6, bytesPerUframe = (rate * 2) / 8000, pkts = bytesPerUframe / 512, cap = 13; // 13 × 512 B per 125 µs is USB 2.0's bulk limit
    const frames = 16, fw = (w - 24) / frames;
    for (let f = 0; f < frames; f++) {
      const x = 12 + f * fw;
      g.strokeStyle = C.grid; g.strokeRect(x + 1, 30, fw - 2, h - 70);
      // spread the fractional packets evenly over time
      const n = Math.floor((f + 1) * pkts) - Math.floor(f * pkts);
      for (let p = 0; p < n; p++) { g.fillStyle = C.blue; g.fillRect(x + 3, h - 42 - (p + 1) * ((h - 74) / cap), fw - 6, (h - 74) / cap - 2); }
    }
    label(g, "each box: 125 µs of USB time, room for 13 packets of 512 bytes; blue: the dongle's packets", 12, 18, C.muted, "left", 11);
    label(g, "2 ms of bus time →", 12, h - 14, C.muted, "left", 11);
    el("r-bus").innerHTML = `${val("bs-r")} MS/s × 2 bytes = <em class="y">${(rate * 2 / 1e6).toFixed(1)} MB/s</em> = ${pkts.toFixed(2)} packets per 125 µs, about <em class="y">${((pkts / cap) * 100).toFixed(0)}%</em> of what USB 2.0 can carry. The bus is not the bottleneck; keeping a request always waiting is (chapter 8, build guide).`;
  }, 230, { animated: false, label: "USB microframes and how many of the dongle's packets fit in them" });
  controls(s, ["bs-r"], () => { el("bs-ro").textContent = `${val("bs-r")} MS/s`; });
}

// --- Lab: the four raw calls, on your own dongle ------------------------------------------------------------------------------
{
  const log = el("lb-log"), step = (n: number) => el(`lb-${n}`) as HTMLButtonElement;
  let dev: any = null;
  const say = (s: string) => { log.textContent += s + "\n"; };
  const usb = (navigator as any).usb;
  if (!usb || !isSecureContext) {
    [1, 2, 3, 4].forEach((n) => (step(n).disabled = true));
    say(!usb ? "This browser has no WebUSB (use Chrome, Edge or Opera)." : "WebUSB needs an https:// or localhost page. On this site's server, open it as http://localhost:8073 on the Mac with the dongle.");
  } else [2, 3, 4].forEach((n) => (step(n).disabled = true));
  const setup = (value: number, index: number) => ({ requestType: "vendor", recipient: "device", request: 0, value, index });
  const out = (v: number, i: number, b: number[]) => dev.controlTransferOut(setup(v, i), new Uint8Array(b));
  const inp = async (v: number, i: number, n: number) => new Uint8Array((await dev.controlTransferIn(setup(v, i), n)).data.buffer);
  const guard = (n: number, fn: () => Promise<void>) => step(n).addEventListener("click", async () => {
    try { await fn(); if (n < 4) step(n + 1).disabled = false; } catch (e) { say(`✗ ${(e as Error).message}`); }
  });
  guard(1, async () => {
    dev = await usb.requestDevice({ filters: [{ vendorId: 0x0bda, productId: 0x2838 }, { vendorId: 0x0bda, productId: 0x2832 }] });
    say(`> navigator.usb.requestDevice(…)\n  ${dev.manufacturerName ?? "?"} ${dev.productName ?? "?"}, vendor ${hex(dev.vendorId, 4)}, product ${hex(dev.productId, 4)}, USB ${dev.usbVersionMajor}.${dev.usbVersionMinor}`);
  });
  guard(2, async () => {
    await dev.open(); if (!dev.configuration) await dev.selectConfiguration(1); await dev.claimInterface(0);
    say("> device.open(); device.claimInterface(0)\n  claimed: this page now owns the dongle");
  });
  guard(3, async () => {
    await out(0x300b, 0x0210, [0x22]); await out(0x3000, 0x0210, [0xe8]);
    await out(0x0120, 0x0011, [0x18]); await inp(0x0120, 0x000a, 1);
    say("> power on the demodulator, then I2C repeater on\n  controlTransferOut(value 0x0120, index 0x0011, [0x18]) + dummy read");
  });
  guard(4, async () => {
    await out(0x0034, 0x0610, [0x00]); const id = (await inp(0x0034, 0x0600, 1))[0];
    say(`> I2C write [0x00] to 0x34, then read 1 byte\n  tuner register 0 = ${hex(id)} ${id === 0x69 ? "→ an R820T tuner. You just talked to a chip through USB and I2C." : "→ not an R820T"}`);
    await out(0x0120, 0x0011, [0x10]); await inp(0x0120, 0x000a, 1);
    await dev.releaseInterface(0); await dev.close(); say("  (repeater off, device released)");
  });
}
