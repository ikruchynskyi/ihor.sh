# Course plan: "Radio from scratch"

**Goal:** someone who knows school math and a little programming ends up understanding, and having built, a radio receiver: **from raw bytes (USB or network) to sound from their speakers**.

**Style: 3Blue1Brown.** Understanding comes from pictures that move, not from formulas.
1. **Start from a question** the reader can almost answer themselves ("how can circles draw a square wave?").
2. **Show it moving** before naming it. Every idea is a scene with play/pause and sliders, plus a "try this".
3. **Name things only after they've been seen.** Words like frequency or phase arrive as labels for something already watched.
4. **Notation last**, as a short summary of what's already understood, color-coded to match the animation (blue = the arrow, yellow = height/sine, green = sideways/cosine, pink = speed/the music).
5. **Pause and ponder** moments: small questions to answer before reading on.
6. **Games and predictions** where possible (chapter 1's "which way is it spinning?").
7. **Check yourself** questions at the end, with answers hidden.
8. **Labs on real radio.** As soon as a chapter's idea can be seen in real signals, it ends with a "Lab: try it on real radio" box (`src/course/lab.ts`): connect to the server's dongle or your own over USB and watch the idea live. Planned labs: ch3 samples and gain (built), ch4 a live spectrum, ch5 centering a real station, ch6 filtering out a neighbor, ch9 hearing FM you decoded yourself, ch11 a full receiver.
9. **Only then, the code.** From chapter 2 on, each chapter ends by turning the picture into a few lines of TypeScript and a test. These are the real lines that run the receiver on this site.

**Tooling:** `src/course/anim.ts` (scenes, drawing helpers, the color code) and `course.css`. One HTML page per chapter, built by Vite. Scenes only animate while on screen and respect reduced-motion settings. Math is written in MathML (built into browsers, no libraries).

## Chapters

### Part I: The language of waves (no radio hardware yet)
1. ✅ **Spinning arrows.** A dot on a wheel draws a sine; frequency, amplitude and phase; two shadows (sine and cosine); the direction game (why I/Q exists); adding arrows draws any shape; a station is a fast arrow and FM music is a wobble in its speed. *Built: `course/01-spinning-arrows.html`.*
2. ✅ **Arrows as numbers.** Complex numbers without the mystery: an arrow is two numbers (I, Q); adding = tip to tail; **multiplying = rotating and stretching** (the key fact of the course); i = "turn a quarter"; e^(iθ) as "the arrow at angle θ", built from many tiny turns. *Code:* store and multiply arrows. *Game:* hit a target by multiplying. *Built: `course/02-arrows-as-numbers.html`, runnable `course/code/ch02.ts`.*
3. ✅ **Sampling: taking snapshots.** A strobe light on a wheel; the wagon-wheel illusion; aliasing; Nyquist ("at least two snapshots per turn", or one with both shadows). Bits and quantization: why 8 bits means a ~48 dB range. *Code:* turn the dongle's bytes into arrows. *Built: `course/03-taking-snapshots.html` with the first live lab, runnable `course/code/ch03.ts`.*
4. **The winding machine: finding arrows inside a signal.** The 3Blue1Brown Fourier picture: wind a signal around a circle at a test speed and watch the center of mass jump when the speed matches. Then the DFT as "do that at many speeds", and the FFT as clever bookkeeping. Windows and leakage, dB. *Code:* our `fft()` and `powerSpectrum()`; the first real spectrum of the FM band.

### Part II: Pulling out one station
5. **Moving a station: mixing.** Multiplying every arrow by one spinning arrow slows them all down by the same amount, shifting the whole spectrum. *Code:* the `Mixer`.
6. **Averaging is filtering.** A moving average smooths fast wiggles. Sliding-and-multiplying (convolution) animated; testing a filter with every speed of arrow; why the best weights look like a sinc and why we smooth its ends. *Code:* `firLowpass()`, design your own filter.
7. **Throwing away snapshots: decimation.** Back to the strobe light: why filtering must come first. *Code:* `FirDecimator`.
8. **Chunks of a live stream.** Why every block must remember the end of the previous chunk; clicks you can hear when it doesn't. *Code:* the streaming classes and the bit-identical test.

### Part III: Getting the sound out
9. **FM: listening to the speed.** Measure how far the arrow turned since the last snapshot: multiply by the previous arrow mirrored (the conjugate) and read off the angle. De-emphasis; the 19 kHz pilot. *Code:* `FmDemod`; the pilot test, where real radio comes out.
10. **AM, SSB and Morse.** Listening to length instead of speed; keeping one side of the spectrum; making a carrier audible.
11. **From numbers to speakers.** Sound cards, the second sample rate, buffers, two clocks that never quite agree, automatic volume, squelch.

### Part IV: Talking to real hardware
12. **Inside the dongle.** The tuner as an analog mixer (chapter 5 in hardware), the PLL as a gear train for frequencies (interactive PLL calculator), the ADC.
13. **USB from zero.** Devices, endpoints, control and bulk transfers, the WebUSB permission picker, OS drivers. *Code:* open the dongle and read one register.
14. **Writing the driver.** Our `rtlsdr.ts` and `r820t.ts`, every register explained. *Checkpoint:* lock onto 98.7 MHz.
15. **The network source.** The same bytes from a server; bandwidth; why a public server must send each listener only a slice.
16. **The whole receiver.** Architecture, Web Workers, testing with fake signals, mock devices and real hardware.

## Build order
Chapters in order, each reviewed before the next: the style is set by chapter 1, so feedback on it shapes everything after.

## Companion pages
- `build.html`: **Build for your own dongle**, a developer guide: layers, per-OS setup, the WebUSB API, USB basics, the RTL2832U register protocol, tuning and sample rate, the data format, streaming without drops, our server's HTTP API (and rtl_tcp), project ideas, troubleshooting.
- `examples/hello-dongle.html`: an ~80-line starter app (connect over USB or the server, tune, live spectrum) that readers copy and extend.
- `learn.html`: one-page quick reference for Spectrum Lab's steps.
