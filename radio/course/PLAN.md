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

**Status 2026-10-15: all 21 chapters are built** (`course/01-…` to `21-weather-satellites.html`), each with its runnable script in `course/code/` (`npm run course-check`: all pass). Track B (ham licenses) and Track C (ARRL companion) are built too. What follows is the design each chapter was built from.

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

---

# Next tracks (planned 2026-10-08)

Same style throughout: picture first, notation last, a runnable script per chapter, live labs where the dongle can show it. The two receiver-course chapters below (video) extend Part III; the license track and the Handbook companion are separate tracks that link back into the receiver course wherever it already explains a topic.

## Part VI: A receiver you'd actually use ✅ built 2026-10-10
18. ✅ **Reading the band** (`course/18-reading-the-band.html`, runnable `course/code/ch18.ts`): FFT size and resolution, averaging spectra, the noise floor as a median and SNR, dB to colors and contrast, click-to-frequency with snapping and bin centers, filter shift, a squelch in the chart's own dB. Lab: a live spectrum with the FFT size, averaging and floor.
19. ✅ **Cleaner sound** (`course/19-cleaner-sound.html`, runnable `course/code/ch19.ts`): the voice filter (biquads, the RBJ cookbook), noise reduction (√Hann overlap-add, per-bin gains, musical noise, a log-domain noise tracker), AGC hang, a tanh soft limiter, the AudioWorklet ring buffer with a drift control loop, recording. Lab: a live voice with each control, through the continuous stream.
The video chapters below move to 20 and 21.

## Track A: Pictures over radio (video)
Honest constraints first: US analog TV is gone (full-power stations stopped in 2009, the last low-power ones in July 2021), an analog TV channel is 6 MHz wide while the RTL-SDR captures at most ~3 MHz, and digital TV in the US (ATSC) isn't what the dongle's chip was built for. So the track teaches video with signals we *can* receive or make:
17. ✅ **Slow-scan TV (SSTV).** Built 2026-10-08 as `course/17-pictures-over-radio.html` plus the `sstv.html` decoder. A picture sent as audio tones: pitch = brightness, line by line, with a header that names the mode (Robot36, PD120…). Decode the ISS's SSTV events on 145.800 MHz (narrow FM, chapter 9) and ham SSTV. Scenes: paint a picture by sweeping a tone; sync pulses; slant from a sample-rate error (chapter 11's drifting clocks) and how to fix it. Lab: record an ISS pass, decode the picture in the browser.
20. **How analog TV worked, and decoding it.** Scanlines and sync pulses, interlace, why 15 734 lines per second, AM with a vestigial sideband, the color subcarrier at 3.58 MHz (chroma as a spinning arrow: hue = angle, saturation = length, chapter 2 again). A built-in NTSC *transmitter* in software (any image or webcam → composite video → RF samples) and a receiver that decodes it in real time, including what happens when you only capture 3 MHz of the 6 (black-and-white, softer picture). Lab: ham amateur TV (ATV, 70 cm / 23 cm) where active, else the synthetic transmitter.
21. **Digital pictures: weather satellites.** Meteor-M LRPT at 137 MHz: QPSK symbols, a constellation you can watch, Doppler correction, error correction, and the image building up as the satellite passes.

## Track B: Ham radio licenses (Technician → General → Amateur Extra) ✅ built 2026-10-08 (`ham/`: dashboard, practice/exams, 16 lessons)
US exams use public-domain NCVEC question pools: Technician 2026–2030 (409 questions, 35 on the exam), General 2023–2027 (429, 35; a new pool is due for July 2027), Amateur Extra 2024–2028 (602, 50). Pass mark 74%.
- **Topic map:** every pool question tagged by subelement (rules, operating, propagation, practices, electrical principles, components, circuits, signals & emissions, antennas & feed lines, safety) and linked to the visual chapter that explains it. Many already exist in the receiver course (modulation, filters, SSB, mixing, sampling).
- **New visual chapters** for what the receiver course doesn't cover: Ohm's law and power as water flow; capacitors and inductors as springs and flywheels; reactance and resonance (an animated LC tank); impedance and SWR (a standing wave you can drag); decibels and ERP; antennas (current along a dipole, radiation patterns in 3D, gain); feed lines and matching; propagation (the ionosphere layers through a day and the solar cycle, skip zones, MUF); safety (RF exposure distances calculator); and the rules, summarized as interactive band charts per license class.
- **Practice:** quizzes drawn from the official pools, spaced repetition on weak topics, "why" explanations linking to scenes, a readiness meter per subelement, and full mock exams with the real question counts.

## Track C: An ARRL Handbook visual companion ✅ built 2026-10-08 (`ham/handbook/`: section map + RF design and workshop labs)
The ARRL Handbook (100th edition) runs from fundamentals to station building in 27 chapters. The companion is *original* interactive explanations organized by its chapters (no reproduction of the book's text or figures), each pointing to the matching visual chapters:
- **Fundamentals** (ch. 2–4): electricity, AC and reactance, resonant circuits, EM waves, components, amplifiers and op-amps, analog-digital interfacing → shared with Track B's new chapters.
- **Radio technology** (ch. 5–17): RF techniques and matching, power sources, DSP and SDR (this course's Parts I–III), oscillators and synthesizers (PLL: ch. 12), filters (ch. 6), modulation (ch. 9–10), receiving (the whole receiver course), transmitting and power amplifiers (new: class A/B/C/D efficiency animations), transceiver design, digital modes (FT8, PSK31, RTTY, packet: new chapters with decoders), data platforms.
- **Systems** (ch. 18–27): repeaters (offsets, tones: links to squelch, ch. 11), propagation, transmission lines, antennas, safety, construction, station assembly, test equipment (an oscilloscope and spectrum analyzer simulator), troubleshooting, RFI/EMC (finding interference with a waterfall, which this site's dongle needed in real life).

## Track D: closing the gaps (planned and built 2026-10-17 ✅)
A learner new to radio read the course cold (2026-10-17) and found terms used before they're taught. The full read of all
21 chapters is the "Already covered" search for every item below; each step is one commit.

**D0. A ledger and a checker.** `course/ledger.json` lists, per chapter, the terms it teaches (with their other names);
`scripts/course-ledger.ts` (run by `npm run course-check`) flags any use of a term in an earlier chapter's text, unless
that paragraph points to the chapter that teaches it ("chapter 10", "ch. 10"). It also requires a gist on every page and a
"Before you start" box from chapter 2 on. Gap: the course had no ledger (the guardrail's table: "no machine ledger").

**D1. Noise, RMS and one rule for decibels (ch. 3, ch. 4).**
- Topic: say what noise is, measure how big a wiggle is (RMS) and how often it hits the ruler's ends (clipping %), and use
  decibels for both power and length without a contradiction.
- Already covered: ch3 #ruler (bits, dB "10 dB = 10× power", clipping, gain), ch3 #real ("weaker stations and noise"),
  ch4 #cracks ("each 20 dB, the arrow 10× shorter"), ch4 #lab and its code output ("noise floor"), ch4 notation
  ("power is the length squared"), ch18 #floor (noise floor as a median, SNR), ham lesson 2 (RMS of a sine, dB), ham
  lesson 11 (thermal noise, noise figure).
- Gap: noise is used from ch3 and never explained; the noise floor is used in ch4 and defined in ch18; dB for lengths
  (×10 = 20 dB) is stated in ch4 before the reason (power = length²); RMS is taught nowhere in this course.
- Where it goes: ch3, a new section after #ruler, "Noise, and how big a wiggle is" (3b: it belongs next to gain and
  clipping); the dB sentence in #ruler gets the length rule (3a); ch4 #lab gets one sentence defining the noise floor with
  a pointer to ch18 (3a).
- Needs: samples and the 8-bit ruler (ch3), arrows' length (ch2), power as length² (moved into ch3 with this step),
  averaging (everyday). New here: noise as a random arrow added to every sample, RMS ("the typical size"), with a widget
  (noise cloud on the ruler, gain slider, RMS and clipping % readouts) → words → formula → `ch03.ts` checks.
- Verified by: course-check, npm test, build, the page at 390/1280, the cold read; numbers from `course/code/ch03.ts`.

**D2. Before the dongle: antenna, the first amplifier and gain staging (ch. 12).**
- Topic: say why an amplifier right at the antenna lets weak satellites through and why more gain later doesn't, and set
  the gains of a chain so nothing clips.
- Already covered: ch3 (gain, clipping), ch12 (tuner, IF, the analog half), ham lesson 6 and 7 (waves, antennas), ham
  lesson 11 (thermal noise, noise figure, preamps, attenuators), the site's own station (SAWbird+ NOAA, HackRF Pro,
  measured 2026-10-16/17).
- Gap: the receiver course never mentions an antenna, an LNA or noise figure.
- Where it goes: ch12, a new section "Before the dongle" before #journey (3b), linking ham lessons 7 and 11 for the
  physics instead of teaching it twice.
- Needs: noise and RMS (D1), dB (ch3), gain and clipping (ch3), the tuner (ch12). New here: each stage adds its own
  noise, so the first one decides (a stacked-noise widget), and the measured numbers from this site's station.

**D3. Going back: the inverse FFT (ch. 4).** Ch19 #overlap uses "inverse FFT" in its main text; ch4 teaches only the
forward direction. A short section in ch4 after #fft: wind the other way and add (3b). Ch19 then points to it.

**D4. Split chapter 21 (it teaches about ten new ideas).** Product decision made by the learner, 2026-10-17 ("fix all gaps").
- 21 (same URL, `21-weather-satellites.html`), *Digital radio from space*: the pass and Doppler, symbols and pulse shaping,
  the matched filter, finding the middle of each symbol (timing recovery, Gardner), QPSK and the constellation, Es/N0 as
  "SNR per symbol" (ch18's SNR), the 4th-power trick and the Costas loop.
- 22 (new, `22-surviving-errors.html`), *Pictures that survive errors*: XOR (with a pointer to Electronics), the
  convolutional code and Viterbi, the sync word and the rotation choice, checksums, the cliff effect, 8×8 DCT pictures,
  and the live pass lab.
- Needs: as listed per section in each page's "Before you start". Also touches: `index.html`, `vite.config.ts`,
  ch20's next link, `meteor.html` and `check.ts` (still valid: the URL stays), `course/code/ch21.ts` split into ch22.ts.

**D5. Names before their chapter.** Sidebands in ch4–6's labs (pointer to ch10), "USB/LSB" in ch7 (upper sideband, not
the cable; pointer to ch10), "crystal" defined in ch11 (where it's first used; ch12 links back), "passband" and
"crosstalk" defined in ch6, binary place values in ch3's bits sentence (ch17 needs "least significant bit"), "harmonics"
in ch20 (ch10's overtones), hexadecimal in ch3's code (moved from ch13's "Before you start"), logarithms in ch3's dB
sentence.

**D6. Gists and "Before you start".** A `<p class="gist">` for each chapter's core idea; "Before you start" for ch2–4 and 16.

## Track C, added 2026-10-17: Antennas in practice (`ham/handbook/antennas.html`)
- Topic: a learner can choose, build, trim, place and judge an antenna, and recognize the antennas around them (cellular
  panels, grid and solid dishes, patches and phased arrays, helices, discones, ferrite rods, NFC coils).
- Already covered (read): ham lesson 6 (wavelength, polarization, cross-polarization widget, multipath), lesson 7 (the
  dipole's standing wave and feed impedance, the 468/234 length calculator, patterns, dBi/dBd, ERP calculator, Yagi, phased
  verticals, ground and height, loading and efficiency, a one-line field guide, receiving and DF antennas), lesson 8 (Z0,
  SWR, analyzers, loss, tuners, stubs, matching, Smith chart), lesson 11 (thermal noise, noise figure), workshop#balun
  (common-mode current, chokes), rf#cascade (preamp placement), course ch3 (noise, SNR) and ch12 (the first amplifier).
- Gap: the practical side: how much an antenna collects (aperture), link budgets with a noise floor, what longer wires do
  to the pattern (lesson 7 says it in words), clearing the path (Fresnel zones), circular polarization for satellites,
  starting lengths and trimming, placement, and every non-ham antenna beyond one line each.
- Where it goes: a new companion lab page (3c: lesson 7 is already one of the longest lessons and is tied to exam pools),
  map key `ant`, linked from the Handbook's chapter 21 sections, lesson 7 and course ch12. It links to lessons 6–8, 11 and
  the workshop rather than teaching them again.
- Needs: dB and dBm (L2), wavelength and polarization (L6), dipole, patterns, gain in dBi (L7), SWR and analyzers (L8),
  noise floor and noise figure (L11), noise and SNR (C3). New here: effective aperture, the link budget, Fresnel zones,
  linear vs circular (3 dB), trimming, dish gain and beamwidth, each as widget → words → formula.
- Truth: every formula in `src/ham/antenna-math.ts`, checked against textbook values by `antenna-math.test.ts` (dipole
  2.15 dBi, short dipole 1.76, full wave 3.82, FSPL, dish gain, the 17.32 Fresnel rule, the 468 rule). Facts with a source:
  the SAWbird datasheet, GPS's −128.5 dBm minimum (IS-GPS-200), Meteor LRPT's RHCP (WMO OSCAR). No number without one.

**Status 2026-10-17:** D0–D6 built and committed one step each; `node scripts/course-ledger.ts` reports no findings, and `npm run course-check` now fails on any (a new term needs a ledger entry in the chapter that teaches it). Chapter 22 exists (D4).

## Track E: depth and intuition (planned 2026-10-17)
- Topic: every chapter's core idea gets the AI course's depth layers 3 and 4 (PEDAGOGY.md §6): an optional "Why …?" box
  (4–8 short steps, each with its reason) and a "Where it breaks" box (a concrete case with numbers and what people do
  about it); chapters short on intuition drills get a predict or estimate question.
- Already covered (counted 2026-10-17, by script over each page): predict questions (`.q`) 0 in ch. 1, 2, 5 and 1 in
  ch. 4, 6, 7, 8, 19, 22; "pause and ponder" only in ch. 1–5; extreme-case prompts mostly ch. 1–6 and 11; estimates almost
  none (ch. 11, 19, 21); "Why" check-yourself questions in every chapter; a script checking the claims in ch. 2–22; no
  `details.deeper` box anywhere (ch. 11–16's "The math, step by step" boxes are formula summaries, not reasons).
- Gap: layers 3 and 4 in all 22 chapters; predict questions for ch. 1, 2, 5; estimates for ch. 4, 7, 22.
- Where it goes: each box right after the chapter's gist or the section it deepens (3b); questions before the scene they
  predict. Boxes are optional: nothing after them depends on them.
- Needs: only terms the ledger already places at or before each chapter (the checker scans box text too).
- Truth: every new number is computed in that chapter's script (course/code/chNN.ts; a ch01.ts is added for chapter 1's
  square-wave overshoot) or is arithmetic shown in the box itself.
- Checks: course-ledger.ts requires both boxes in every chapter (strict, like lint.py --depth for the AI course).

## Track F: Motivating every step and bridging sections within each chapter (planned and built 2026-10-21)
- **User feedback (2026-10-21):** *"Explanations are fine and simple enough, [but] sometimes it feels that there are missing parts between topics even in one article and it's not clear why user receives explanation at all. I felt a couple of times like — 'ok, I got it, but why do I need it?'"*
- **Diagnosis (cold read across all 22 chapters):**
  - Several sections open with *what* a mathematical or hardware mechanism is (recording a second shadow, multiplying two arrows, the $(1+j\theta/n)^n$ limit for $e^{j\theta}$, the 8-bit ruler and RMS noise, the inverse FFT and Hann windows, the `sinc` curve, the 19 kHz pilot and de-emphasis, SSB/CW power trade-offs, the PLL divider loop, biquads and spectral overlap-add, VSB, QPSK after 1D symbols, XOR and 8×8 DCT blocks) *before* stating the concrete problem in our radio receiver that forces us to care.
  - Consecutive `<h2>` sections inside a chapter sometimes read as standalone mini-articles rather than a chain of cause-and-effect (*"We just solved X, which exposes problem Y; here is how our receiver solves Y"*).
- **Where it goes (3a — in-place narrative bridges and "why you need this" hooks across chapters 01–22):**
  - **Ch. 1 (`01-spinning-arrows.html`):** Bridge `#wheel → #shadows` (why one shadow isn't enough for radio: stations above and below your tuned frequency spin in opposite directions and collapse onto each other unless you record both shadows); bridge `#game → #add` (why adding arrows matters to a receiver: both complex waveforms and the 50 stations sharing your antenna wire arrive as one sum of arrows); bridge `#add → #fm` (how a station hides sound in its arrow: by varying length or spin speed).
  - **Ch. 2 (`02-arrows-as-numbers.html`):** Open `#multiply` with the three concrete receiver jobs arrow multiplication performs (generating a local oscillator arrow in `#spin`, sliding a station to 0 Hz in ch. 4–5, and measuring turn-per-sample for FM in ch. 9); bridge `#game → #spin` (why multiplying by a fixed step replaces millones of `sin`/`cos` calls); open `#euler` by explaining *why* we care about $e^{j\theta}$ (you already have the code; this 2-minute link connects our arrow picture to the shorthand every datasheet and chapters 4–6 use).
  - **Ch. 3 (`03-taking-snapshots.html`):** Bridge `#nyquist → #ruler` (a snapshot has two limits: *how often* in time, §§1–3, and *how finely* in height, §4); bridge `#ruler → #noise` (why RMS and SNR matter right now: to set the dongle's one physical knob — gain — without burying weak signals in rounding steps or clipping strong ones).
  - **Ch. 4 (`04-winding-machine.html`):** Open `#inverse` with *why* a receiver ever goes backwards from spectrum to time (designing ideal filter weights in ch. 6 and rebuilding speech after erasing hiss bins in ch. 19); open `#window` with what goes wrong on a real band without a window (a strong local FM station between FFT bins splatters fake skirts across weak neighbors).
  - **Ch. 5 (`05-moving-a-station.html`):** Bridge `#shift` (why every receiver slides the chosen station to 0 Hz instead of filtering it in place: a 0 Hz filter is just a simple moving average, ch. 6, reusable for every station on the dial); bridge `#band → #nco` (what breaks after 10 minutes of live listening if we don't normalize the local arrow).
  - **Ch. 6 (`06-averaging-is-filtering.html`):** Bridge `#conv → #weights` (connect `sinc` directly to chapter 4's inverse winding machine applied to a brick-wall passband rectangle, and connect `Windowed sinc` to chapter 4's Hann window curing the sharp cutoff edge).
  - **Ch. 7 (`07-throwing-away-snapshots.html`):** Open `#two` with why an FM receiver decimates in two stages ($2.4\text{ MS/s} \to 240\text{ kS/s} \to 48\text{ kS/s}$) instead of jumping straight to $48\text{ kS/s}$ (the FM signal in the air is $200\text{ kHz}$ wide until chapter 9 demodulates it into $15\text{ kHz}$ audio).
  - **Ch. 9 (`09-fm-listening-to-the-speed.html`):** Bridge `#idea → #mpx` (why we can't send raw `FmDemod` output straight to the speaker decimator: ultrasonic 19 kHz pilot, stereo, and 57 kHz RDS subcarriers would alias into audible whistles, and the 19 kHz pilot proves our demodulator works); bridge `#mpx → #deemph` (why raw FM audio sounds tinny and hissy until we undo the transmitter's treble boost).
  - **Ch. 10 (`10-am-ssb-and-morse.html`):** Bridge `#am → #ssb` (why AM wastes 5/6 of transmitter power on a silent carrier and duplicate sideband, motivating SSB); bridge `#ssb → #cw` (why shrinking a signal to a single switched arrow gets through when voice fails, and the puzzle of making a 0 Hz arrow audible).
  - **Ch. 11 (`11-numbers-to-speakers.html`):** Preview the three speaker-side problems in the intro and bridge `#resample → #agc → #squelch` as a chain (click-free clock matching → taming $1{,}000\times$ volume swings → silencing the roar when AGC amplifies empty-channel hiss).
  - **Ch. 12 (`12-inside-the-dongle.html`):** Bridge `#rf → #journey` and `#if → #pll` (why hardware needs a PLL gear train: generating any mixer frequency from a single fixed 28.8 MHz crystal, whose divider registers we program in ch. 14).
  - **Ch. 13–14 (`13-usb-from-zero.html`, `14-writing-the-driver.html`):** Bridge `#packets → #rtl` in ch. 13 (why this one 8-byte control transfer is the key to every register in ch. 14) and `#rate → #r820t` in ch. 14 (why the R820T tuner forces us to keep shadow registers in RAM).
  - **Ch. 17–22 (`17-pictures-over-radio.html` .. `22-surviving-errors.html`):** Bridge `#slant → #vis` in ch. 17 (why the receiver needs the VIS doorbell before line 1), `#avg → #floor` in ch. 18 (why automatic noise-floor estimation drives both waterfall contrast and dB squelch), `#voice → #nr` in ch. 19 (why biquads beat FIRs for audio tone shaping, and why hiss inside the voice band requires FFT + inverse FFT spectral subtraction), `#line → #vsb` in ch. 20 (why analog TV shaved one sideband to fit a 4.2 MHz video wave into a 6 MHz channel), `#pass → #symbols → #timing → #qpsk` in ch. 21 (how 1D symbols step up to 2D QPSK and meet the Doppler ring), and `#xor` + `#dct` in ch. 22 (why XOR is the reversible bit mixer for error correction and why 72 kbit/s forces 8×8 DCT compression).
- **Needs:** Only terms already taught at or before each chapter in `course/ledger.json` (or with an explicit `"chapter N"` forward-pointer).
- **Verified by:** `cd radio && npm run course-check && npm test && npm run build` and `npm run check`.

## Track G: purpose before mechanism (planned and built 2026-10-21)
- **User feedback (2026-10-21):** ch. 2's "The arrow at angle θ, built from tiny turns" cost about ten messages with an AI
  helper: the step (adding tiny sideways turns lands at angle θ) was clear, but not why it was there or what it taught.
  "Constant 'so what and why' questions."
- **Topic:** every section says what it's for, in the receiver's terms, before it starts building; a section whose only job
  is notation or curiosity says so and is optional.
- **Already covered:** Track F added "why you need this" openers and bridges; a read of every section opening in ch. 1–22
  (2026-10-21) found most now lead with their problem. Not yet: ch. 2 #euler (a limit construction for a name),
  ch. 2 #spin and #game, ch. 3 #freeze, ch. 4 #fft (internals with no stated payoff), ch. 6 #weights (fix without the
  problem), ch. 13 #tree, ch. 14 #source.
- **Where it goes (3a, in place):** ch. 2 #euler becomes "a name for the arrow at angle θ": the name exists because
  multiplying arrows adds angles the way multiplying powers adds exponents (2³ × 2² = 2⁵); the one fact ch. 4–6 use;
  a check question. The tiny-turns scene moves under "Optional: …", opening with its question (what if each tiny growth
  step is a turn?) and saying nothing later depends on it. The other seven sections get an opening sentence naming the
  problem or payoff; ch. 4 #fft and ch. 14 #source say they can be skipped (nothing later depends on their internals).
- **Needs:** powers of a number (school math, the course's stated prerequisite); everything else from ch. 1–2.
- **Verified by:** `cd radio && npm run course-check && npm test && npm run build`; ch. 2 rendered at 390 px (no
  horizontal scroll) and 900 px.
