# Building a WebSDR, part 1: talking to the dongle

*Draft. Code: [`src/rtlsdr.ts`](../src/rtlsdr.ts), [`src/r820t.ts`](../src/r820t.ts). Tested on a Nooelec NESDR SMArt v5 (R820T2 tuner) on an M4 Mac mini, 2026-10-08.*

The goal of this series is a radio you can open in a browser tab, using either your own RTL-SDR dongle or mine in NYC. Part 1 is the foundation: **making a $35 USB dongle stream radio samples into JavaScript with no drivers, no libraries and nothing to install.** Just WebUSB and about 500 lines of TypeScript.

## What's inside the dongle

An RTL-SDR is two chips that were never meant for this:

```
antenna ─▶ R820T2 tuner ──── IF 3.57 MHz ───▶ RTL2832U ────── USB 2.0 ──▶ your code
           LNA → mixer → IF filter            8-bit ADC @ 28.8 MS/s
           PLL (local oscillator)             digital mixer → resampler → I/Q
           └──────── I2C, through the RTL2832U ───────┘
```

- **The tuner (Rafael Micro R820T2)** amplifies the antenna signal and mixes it down to a fixed *intermediate frequency* (IF) of 3.57 MHz, using a local oscillator (LO) it synthesizes with a PLL. It also filters out most of what we don't want.
- **The RTL2832U** was designed as a DVB-T TV demodulator. Hidden inside is a mode that skips demodulation and just ships the raw samples: an 8-bit ADC running at 28.8 MS/s, a digital mixer that moves the 3.57 MHz IF to 0 Hz, a resampler that brings 28.8 MS/s down to the rate we ask for, and a USB 2.0 bulk endpoint that delivers interleaved 8-bit **I/Q**.
- Both chips share one **28.8 MHz crystal**. The SMArt v5 uses a 0.5 ppm temperature-compensated one, so we can skip frequency correction.

The tuner isn't on the USB bus at all. It hangs off the RTL2832U's I2C bus, behind a **repeater** we have to switch on whenever we talk to it.

## Talking over USB: four kinds of messages

Everything goes through USB **vendor control transfers** (request 0). The `value` and `index` fields encode *what* we're addressing:

| What | value | index | Notes |
|---|---|---|---|
| USB/system block register | register address | `block << 8`, plus `0x10` to write | big-endian data |
| Demodulator register | `(addr << 8) \| 0x20` | `page`, plus `0x10` to write | every write needs a dummy read after it |
| I2C (the tuner) | I2C address (`0x34`) | `6 << 8`, plus `0x10` to write | the repeater must be on |
| Samples | n/a | n/a | bulk endpoint `0x81` |

In WebUSB that is `device.controlTransferOut({requestType: "vendor", recipient: "device", request: 0, value, index}, bytes)`. The quirks you only learn by reading other people's drivers: demodulator *writes* are big-endian while *reads* come back little-endian, and the R820T returns every byte you read **bit-reversed**.

## Bringing the RTL2832U up

`initBaseband()` is about 20 register writes:
- power on the demodulator and soft-reset it;
- load the default coefficients of the resampler's decimation FIR (eight 8-bit and eight 12-bit coefficients, packed into 20 registers);
- switch into **SDR mode** with the digital AGC off;
- turn on DC-offset cancellation and I/Q-imbalance correction.

Then, because the R820T outputs a 3.57 MHz IF rather than zero IF, we:
- turn zero-IF mode off and use only the in-phase ADC;
- program the demod's own mixer with `−3.57 MHz × 2²² / 28.8 MHz`;
- enable spectrum inversion, because the tuner flips the spectrum.

**Finding the tuner:** read register 0 at I2C address `0x34` (R820T) or `0x74` (R828D). Both answer `0x69`.

## The tuner: a PLL you program by hand

Tuning to a station means putting the LO at `station + IF`. Worked example: listening to 98.7 FM, the driver parks the dongle 250 kHz below it (more on why later), at **98.45 MHz**:

1. **LO** = 98.45 + 3.57 = **102.02 MHz**.
2. The PLL's VCO only runs between 1.77 and 3.54 GHz, so pick the power-of-two divider that lands inside: ×16 gives 1.63 GHz (too low), and **×32 gives 3.26464 GHz**.
3. The PLL multiplies the crystal: VCO / (2 × 28.8 MHz) = **56.67778**, split into an integer part `nint = 56` and a 16-bit fraction for the sigma-delta modulator: `sdm = 0.67778 × 65536 ≈ 44419 (0xAD83)`.
4. `nint` is written in an odd split form: `ni = (56 − 13) / 4 = 10`, `si = 56 − 4·10 − 13 = 3`, so register `0x14 = ni + (si << 6) = 0xCA`. The fraction goes into `0x15`/`0x16`.
5. Wait about 10 ms and check the lock bit (register 2, bit 6). If it hasn't locked, raise the VCO current and try once more.

The 16-bit fraction gives a resolution of 2 × 28.8 MHz / 65536 / 32 ≈ 27 Hz. Here the real LO lands **4.3 Hz** from where we asked, far below anything audible.

The same PLL is used once at start-up to **calibrate the IF filter**: tune it to 56 MHz, pulse a trigger bit, and read back a 4-bit calibration code.

**Gain** is a ladder: the LNA and mixer each have 16 steps of uneven size (0.9 dB, 0.5 dB, 1.3 dB, …), and we climb them alternately until we reach the requested total, which gives 29 gain settings from 0 to 48 dB.

## Sample rate: one division

The resampler ratio is `28.8 MHz × 2²² / rate`, as a fixed-point number with the low two bits cleared:

| rate | ratio | exact? |
|---|---|---|
| 2.4 MS/s | `0x3000000` (exactly 12 × 2²²) | yes |
| 2.048 MS/s | `0x3840000` | yes |
| 1.024 MS/s | `0x7080000` | yes |
| 250 kS/s | `0xCCCCCCC` | 250 000.0004 S/s |

Rates between 300 kS/s and 900 kS/s aren't supported, and above ~2.4 MS/s most dongles start dropping samples.

## Streaming

Samples arrive on bulk endpoint `0x81`. USB 2.0 needs the host to keep asking: if no transfer is pending, the dongle's FIFO overflows and samples are lost. So `stream()` keeps **four 256 KiB transfers in flight** (≈55 ms of radio each at 2.4 MS/s) and hands them to the caller **strictly in order**: await the oldest, immediately queue a new one, deliver. The format is unsigned 8-bit I/Q: subtract 127.5 and divide by 127.5 to get floats.

## Testing it without a browser

A browser won't let a script click the USB permission picker, which makes automated testing awkward. The trick: the npm `usb` package implements the **same WebUSB API** in Node, so the exact driver code that runs in the page can run in a script (`scripts/hw-test.ts`). It's a dev-only dependency; the page itself uses only `navigator.usb`.

Two things went wrong along the way, both instructive:
- The Node shim crashed reading a *configuration name string* the dongle doesn't have. That's a shim quirk, not a driver bug, so the test wraps the device and reports it as already configured.
- My first throughput test reported **2.307 MS/s** instead of 2.4, which looked like dropped samples. It was a measurement bug: the end time was taken after `close()`, which includes putting the tuner to sleep. Measured from the first to the last transfer, it's **2.400 MS/s, exactly**.

Also note: macOS's System Information lists the dongle as "Up to 12 Mb/s". That can't be the real link speed: 2.4 MS/s × 2 bytes is 38.4 Mbit/s, which only fits on a 480 Mbit/s high-speed link, and `rtl_test` confirmed zero lost samples.

## Proof it works: the 19 kHz pilot

An end-to-end check that doesn't need ears: stereo FM stations transmit a **19 kHz pilot tone**. If tuning, sample rate and I/Q handling are all right, our own FM demodulator (from Spectrum Lab) must show a sharp peak at exactly 19 kHz.

```
tuner R820T, NESDR SMArt v5
rate 2400000.0 S/s, center 98 MHz
steady state 2.400 MS/s (expected 2.400)
strongest: 98.7 MHz, 34.2 dB above the noise floor
19 kHz pilot: 53.3 dB above its neighbors → PASS: real FM stereo decoded
```

Across five runs the pilot stood **45–63 dB** above the spectrum around it.

Bonus: the waterfall shows flat rectangular blocks on both sides of each NYC station. That's **HD Radio**, digital audio sent in sidebands next to the analog signal.

## Why tune 250 kHz below the station?

Every RTL-SDR has a spike at exactly 0 Hz (DC offset from the ADC and leakage from the local oscillator). So the live mode never puts the station in the middle: it tunes the dongle 250 kHz low and lets our software mixer (stage 2 in Spectrum Lab) shift the station to 0 Hz instead. Digital mixing is free and perfect; analog mixing isn't.

## What's next

**Part 2: a waterfall over WebSocket.** The same samples, but coming from the dongle on the Mac mini in NYC, so people without a dongle can listen to mine.

## Exercises

1. Work out the PLL registers for **NOAA weather radio, 162.550 MHz** (remember the 250 kHz offset and the 3.57 MHz IF). Which divider? What `nint` and `sdm`?
2. In `rtlsdr.ts`, change `QUEUE` to 1 and `BUFFER_BYTES` to 16 KiB, then run `node scripts/hw-test.ts`. Do you lose samples? How can you tell from the steady-state rate?
3. Set the gain to 0 dB and then to 48 dB on a strong station. What happens to the pilot margin, and why does too much gain make it *worse*?

## Credits

There is no public R820T datasheet. The register meanings and init values come from years of community reverse-engineering: osmocom's **librtlsdr** (Steve Markgraf and others), the Linux kernel's `r820t` driver (Mauro Carvalho Chehab), and Rafael Micro's leaked reference code. The code here is our own TypeScript implementation, but the knowledge is theirs.
