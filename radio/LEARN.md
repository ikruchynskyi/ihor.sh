# Learn SDR by rebuilding Spectrum Lab

Goal: be able to write every line of `src/dsp.ts` yourself, then go past it (live radio, digital decoders, WebSDR).
Each step: read → do the exercise → compare with the code here. Keep a notebook (Jupyter + numpy) next to this repo; prototyping in Python and then porting to TS is how most SDR people work.

## 0. Hardware + tools (one evening)

```sh
brew install librtlsdr          # rtl_test, rtl_sdr, rtl_tcp, rtl_fm
rtl_test -t                     # dongle detected? (Ctrl-C)
brew install --cask sdrpp       # SDR++: GUI receiver, the "known good" reference
python3 -m pip install numpy scipy matplotlib jupyter
```

- RTL-SDR covers ~24 MHz – 1.7 GHz. A V4 dongle (or a V3 in direct-sampling mode) also gets HF, but poorly; HF really wants an upconverter or a different SDR.
- Sample rate: stay at ≤ 2.4 MS/s. Rates above that drop samples on most dongles.
- Antenna matters more than the dongle. The telescopic dipole from the kit works for FM/NOAA/airband when you set each element to ¼λ (≈ 75 cm for FM, ≈ 46 cm for 162 MHz).
- First listen in SDR++: FM broadcast (88–108 MHz), NOAA weather 162.400–162.550 MHz NFM, airband 118–137 MHz AM (JFK tower 119.1, LGA 118.7), ADS-B bursts at 1090 MHz.

Make your first capture (≈10 s):
```sh
rtl_sdr -f 100.3e6 -s 2.4e6 -g 30 -n 24000000 fm_100.3M_2.4M.cu8
```
Load it in Spectrum Lab. The file name sets the center frequency and sample rate.

## 1. Complex (I/Q) signals: the one idea everything rests on
Read: [PySDR](https://pysdr.org) ch. 1–3 (free, the best intro). Ch. 2 "Frequency Domain" and ch. 3 "IQ Sampling".
- Why one real sample stream can't tell +100 kHz from −100 kHz, but I+jQ can.
- `e^{jωt}` is a point spinning around a circle; a frequency is how fast it spins.

**Do:** in numpy, build `np.exp(2j*np.pi*f*t)` for f = +50 kHz and −50 kHz, plot I and Q against time, then plot the FFT of each. Then decode a `.cu8` yourself: `(np.fromfile(f, np.uint8) - 127.5) / 127.5`, then view it as complex. → compare with `decodeCU8` in `src/iq.ts`.

## 2. FFT, windows, and the waterfall
Read: PySDR ch. 2 + "Windowing". Optional depth: Lyons, *Understanding DSP*, ch. 3.
**Do:** write a radix-2 FFT (≈30 lines) and check it against `np.fft.fft`. Plot a tone's spectrum with no window and with a Hann window, and look at the leakage.
→ compare with `fft` and `powerSpectrum`. Why does `powerSpectrum` do an fftshift?

## 3. Mixing (frequency shift)
**Do:** multiply your capture by `exp(-2j*pi*f0*n/fs)` and watch the station move to 0 Hz. → `mix`.
Question: what happens to the spectrum if you multiply by `cos` instead of a complex exponential? (Two copies appear, which is exactly why we use I/Q.)

## 4. FIR filters
Read: PySDR ch. "Filters". Design one with `scipy.signal.firwin` first, then write your own windowed-sinc.
**Do:** plot `|H(f)|` while varying the tap count and the window (rectangular / Hamming / Blackman), and note the stopband depth vs. transition width.
→ `firLowpass`, `freqResponse`. Rule of thumb in the code: Hamming taps ≈ 3.3 / transition (normalized).
**Break it in the lab:** set bandwidth to 400 kHz on the demo WFM signal and watch the AM station leak in.

## 5. Decimation and aliasing
**Do:** decimate by 10 *without* filtering first and listen: neighboring stations fold onto yours.
Then filter first. → `firDecimate` only computes the outputs it keeps. Why is that legal? (The samples you drop are never needed.)
Stretch: a polyphase decimator, then a CIC filter (how real hardware does it cheaply).

## 6. Demodulation
- **FM:** instantaneous frequency = phase difference = `angle(x[n] * conj(x[n-1]))`. → `demodFM`. Then de-emphasis (`deemphasis`): turn it off and hear the hiss.
- **AM:** envelope `|x|`. → `demodAM`. Try it on airband at JFK/LGA.
- **SSB:** select one sideband. → `demodSSB` uses the "shift, filter, shift back" trick. Also read about the Hilbert-transform and Weaver methods.
**Do:** write all three in numpy against your own captures before reading the TS.

## 7. Go live: streaming instead of files
`rtl_tcp -a 0.0.0.0 -s 2.4e6 -f 100.3e6` serves raw cu8 over TCP. Write a Python client that reads blocks of 2^18 bytes, runs your chain block by block, and plays the audio with `sounddevice`.
New problems you will hit (and must solve): filter state across block edges (overlap or keeping history), and the dongle clock vs. the soundcard clock drifting (resampling). This is v3 of the plan (WebSDR): the same chain, but on a server, with WebSocket to the browser.

## 8. Digital modes: where it gets fun
Pick in this order. Each is a classic first decoder and teaches one new idea:
1. **ADS-B (1090 MHz, 2 MS/s):** pulse-position modulation, preamble detection, CRC. Plot the planes over NYC. Reference: *The 1090 MHz Riddle* (free online book, mode-s.org).
2. **APRS (144.390 MHz NFM):** 1200-baud AFSK → Bell 202 tones → NRZI → HDLC/AX.25 frames.
3. **Meteor-M weather satellites (137 MHz):** LRPT image decoding (QPSK, 72–80 kbps) plus Doppler and pass prediction. The classic NOAA APT satellites (NOAA-15/18/19) were all decommissioned in 2025, so old tutorials about them no longer work. For an easier first satellite, try the ISS (145.800 MHz FM voice/SSTV, 145.825 MHz APRS).
4. **RDS on broadcast FM:** the 57 kHz subcarrier and BPSK; you already have the FM demod.

## 9. Theory to keep growing
- *Software Receiver Design* (Johnson, Sethares, Klein): builds a full receiver step by step.
- *Understanding Digital Signal Processing* (Lyons): the intuition book.
- Michael Ossmann's free SDR video course (Great Scott Gadgets) + GNU Radio tutorials (wiki.gnuradio.org).
- ARRL Handbook + Technician/General license study, so you can transmit too.

## Legal (US)
Receiving is generally legal. Do not divulge or publish the contents of private communications you intercept (ECPA, 47 USC 605); cellular calls are off-limits entirely. Transmitting needs a license; Technician is the first step.
