// The ARRL Handbook (100th edition) table of contents, section by section, mapped to this site's visual explanations.
// Only section titles are listed (for navigation alongside the book); all explanations are this site's own.
// Link keys: L7#yagi = license lesson 7, C4#fft = "Radio from scratch" chapter 4, rf#… / ws#… = companion labs,
// build#… = developer guide, app = Spectrum Lab, ham = license dashboard.

export const PARTS: [string, number[]][] = [
  ["Fundamentals of radio electronics", [1, 2, 3, 4]],
  ["Principles of radio technology, part 1", [5, 6, 7, 8, 9, 10, 11]],
  ["Principles of radio technology, part 2", [12, 13, 14, 15, 16, 17, 18]],
  ["Propagation and antenna systems", [19, 20, 21]],
  ["Safe practices and station construction", [22, 23, 24]],
  ["Test equipment, troubleshooting and RFI", [25, 26, 27]],
];

export const TOC = `
1 What Is Amateur (Ham) Radio?
1.2 Structure of Amateur Radio | L13#emergency L12#control
1.3 Amateur Radio Licensing in the US | ham L12#licensing
1.4 Resources | ham
2 Electrical Fundamentals
2.1 Introduction to Electricity | L1#electrons
2.2 Resistance and Conductance | L1#ohm L1#line
2.3 Basic Circuit Principles | L1#series
2.4 Power and Energy | L1#power
2.5 Circuit Control Components | L3#drawer
2.6 Capacitance and Capacitors | L3#capacitor L3#combining
2.7 Inductance and Inductors | L3#inductor L3#cores
2.8 Semiconductor Devices | L5#junction L5#transistor
3 Radio Fundamentals
3.1 AC Waveforms | L1#ac C1#wheel
3.2 Measuring AC Voltage, Current, and Power | L2#rms L2#pep
3.3 Effective Radiated Power | L7#erp
3.4 AC in Capacitors and Inductors | L3#reactance
3.5 Working with Reactance | L3#phase
3.6 Impedance | L3#phase L4#plane
3.7 Quality Factor (Q) of Components | L4#curve
3.8 Resonant Circuits | L4#tank L4#seriespar
3.9 Analog Signal Processing | L10#mixing C5#shift
3.10 Electromagnetic Waves | L6#em L6#lambda
4 Circuits and Components
4.1 EIA and Industry Standards | L3#drawer
4.2 Practical Resistors | L1#ohm L4#power
4.3 Practical Capacitors | L3#capacitor L4#power
4.4 Practical Inductors | L3#cores
4.5 Transformers | L3#transformer
4.6 Practical Semiconductors | L5#family L5#transistor
4.7 Amplifiers | L5#transistor L11#classes
4.8 Operational Amplifiers | L16#opamp
4.9 Miscellaneous Analog ICs | L16#comparator L5#regulator
4.10 Analog-Digital Interfacing | C3#ruler L16#families
4.11 Heat Management | rf#heat
5 RF Techniques
5.2 Lumped-Element versus Distributed Characteristics | L8#stubs L8#velocity
5.3 Effects of Parasitic (Stray) Characteristics | L4#power rf#simulation
5.4 Semiconductor Circuits at RF | L5#ics
5.5 Ferrite Materials | L3#cores ws#balun
5.6 Impedance Matching Networks | rf#matching L4#filters
5.7 RF Transformers | L3#transformer ws#balun
5.8 Noise | rf#cascade L11#noise
5.9 Two-Port Networks | L15#instruments
6 Electronic Design Automation (EDA)
6.1 Circuit Simulation Overview | rf#simulation
6.2 Interests and Limitations of Circuit Simulation | rf#simulation
6.3 Limitations of Simulation at RF | rf#simulation
6.4 Electromagnetic Analysis of RF Circuits | L7#zoo
7 Power Sources
7.1 Power Processing | L5#rectifier
7.2 AC-AC Power Conversion | L3#transformer
7.3 Power Transformers | L3#transformer
7.4 AC-DC Power Conversion | L5#rectifier
7.5 Voltage Multipliers | L5#rectifier
7.7 Rectifier Types | L5#rectifier
7.8 Power Filtering | L5#rectifier
7.9 Power Supply Regulation | L5#regulator
7.10 "Crowbar" Protective Circuits | L5#regulator
7.11 DC-DC Switchmode Power Conversion | L5#regulator
7.12 High-Voltage Techniques | L5#rectifier L14#shock
7.13 Batteries | L3#drawer L15#power
8 DSP and SDR Fundamentals
8.1 Introduction to DSP | C4#spectrum C6#average
8.2 Introduction to SDR | C16#map L11#sdr
8.3 Analog-Digital Conversion | C3#fold C3#ruler
8.4 Data Converters for SDR and DSP | C12#path
8.5 Digital Signal Processors | C16#speed
8.6 Digital (Discrete-time) Signals | C3#strip C2#spin
8.7 The Fourier Transform | C4#spectrum C4#fft
9 Oscillators and Synthesizers
9.1 How Oscillators Work | L11#oscillators L4#tank
9.2 LC Variable Frequency Oscillator (VFO) Circuits | L11#oscillators
9.4 Crystal Oscillators | L3#cores L11#oscillators
9.6 Frequency Synthesizers | C12#pll C5#nco L11#oscillators
9.7 Phase Noise | rf#phase-noise
10 Analog and Digital Filtering
10.2 Filter Basics | C6#why L4#filters
10.3 Passive LC Filters | L4#filters
10.4 Active Audio Filters | L16#opamp
10.5 Digital Filters | C6#weights C7#skip
10.6 Quartz Crystal Filters | L4#filters
10.7 SAW Filters | L4#filters
10.8 Transmission Line VHF/UHF/Microwave Filters | L8#stubs
10.9 Cavity and Helical Filters | L4#filters
10.10 HF Transmitting Filters | rf#simulation
11 Modulation
11.1 Introduction | C1#fm L10#modes
11.2 Amplitude Modulation (AM) | C10#am L10#modes
11.3 Angle Modulation | C9#demod L10#fm
11.4 FSK and PSK | L10#digital
11.5 I-Q Modulation | C2#two L10#digital
11.6 Applications of I/Q Modulation | C5#copies L11#sdr
11.7 Image Modulation | L10#tv
11.8 Spread Spectrum Modulation | L10#digital
11.9 Pulse Modulation | C16#next
11.10 Modulation Bandwidth and Impairments | L10#dirty rf#predistortion
12 Receiving
12.1 Characterizing Receivers | L11#noise L11#dynamic
12.2 Heterodyne Receivers | C12#image L11#chain
12.3 SDR Receivers | C16#map app
12.4 Mixing and Mixers | C5#shift L10#mixing
12.5 Demodulation and Detection | C9#demod C10#ssb
12.6 Automatic Gain Control (AGC) | C11#agc
12.7 Noise Management | L15#controls rf#phase-noise
13 Transmitting
13.1 Characterizing Transmitters | L10#dirty L15#scope
13.2 Transmitter Architecture | L11#chain
13.3 Modulators | L11#modulators
13.4 Transmitting CW and Data | L10#dirty
13.5 Transmitting AM and SSB | L11#modulators C10#sidebands
13.6 Transmitting Angle Modulation | L11#modulators C9#deemph
13.7 Effects of Transmitted Noise | rf#phase-noise
13.8 Microphones and Speech Processing | L2#pep
13.9 Voice Operation | L13#hf
13.10 Transmitter Power Stages | L11#classes
14 Transceiver Design Topics
14.1 Signal Chains in SDR Transceivers | C16#map L11#sdr
14.2 User Interfaces | app
14.3 Configuration and Control Interfaces | C13#tree C14#trace
14.4 SDR Design Tools | build#code
14.5 Transverters | L11#chain
15 Digital Protocols and Modes
15.1 Digital "Modes" | L10#digital
15.2 Unstructured Digital Modes | L10#digital L13#digital
15.3 Fuzzy Modes | L10#tv
15.4 Structured Digital Modes | L10#zoo L13#digital
15.5 Networking Modes and Systems | L10#zoo
15.6 Digital Mode Table | L13#digital
16 Amateur Radio Data Platforms
16.3 Navigation Data and Telemetry | L13#digital L12#thirdparty
16.5 High Altitude Balloon Platforms | L13#digital
16.9 Fixed Stations | L12#thirdparty
17 RF Power Amplifiers
17.1 High Power, Who Needs It? | L12#power L14#rf
17.2 Types of Power Amplifiers | L11#classes
17.3 Vacuum Tube Basics | L5#transistor L15#hookup
17.4 Tank Circuits | L4#filters rf#matching
17.7 Tube Amplifier Cooling | rf#heat
17.8 Vacuum Tube Amplifier Stabilization | L11#classes
17.9 MOSFET Design for RF Amplifiers | L5#transistor
17.10 Solid State RF Amplifiers | L11#classes rf#heat
17.11 Solid-State Amplifiers and Intermodulation Distortion | L10#mixing L11#dynamic
17.12 Adaptive Predistortion | rf#predistortion
18 Repeater Systems
18.2 Repeater Overview | L13#repeater
18.3 FM Voice Repeaters | L13#repeater C11#squelch
18.4 D-STAR Repeater Systems | L13#repeater
18.5 Digital Mobile Radio (DMR) | L13#repeater L10#digital
18.6 System Fusion | L13#repeater
19 Propagation of Radio Signals
19.1 Fundamentals of Radio Wave Propagation | L6#em L9#horizon
19.2 The Sun and Solar Activity | L9#sun
19.3 Sky-Wave or Ionospheric Propagation | L9#ionosphere
19.4 VHF/UHF Non-Ionospheric Propagation | L9#vhf
19.5 Propagation Predictions for HF Operation | L9#muf
19.6 VHF/UHF Mobile Propagation | L6#multipath
19.7 Special Propagation Modes and Topics | L9#more L9#vhf
20 Transmission Lines
20.1 Transmission Line Basics | L8#z0 L8#reflect
20.2 Transmission Lines — Practical Considerations | L8#loss L8#weather
20.3 The Transmission Line as Impedance Transformer | L8#stubs L8#smith
20.4 Matching Impedances in the Antenna System | L8#matching L8#tuner rf#matching
20.5 Baluns and Transmission Line Transformers | ws#balun
20.6 PC Transmission Lines | L8#matching
21 Antennas
21.1 Antenna Basics | L7#pattern
21.2 Dipoles and the Half-Wave Antenna | L7#dipole L7#length
21.3 Vertical (Ground-Plane) Antennas | L7#ground
21.4 T and Inverted-L Antennas | L7#short
21.5 Slopers and Vertical Dipoles | L7#zoo
21.6 Yagi Antennas | L7#yagi
21.7 Quad and Loop Antennas | L7#receive
21.8 HF Mobile Antennas | L7#short L15#power
21.9 VHF/UHF Mobile Antennas | L7#short
21.11 VHF/UHF Beams | L7#yagi
21.12 Radio Direction Finding Antennas | L7#receive
21.13 Rotators | L13#hf
22 Safe Practices
22.1 Electrical Safety | L14#shock L14#lightning
22.2 Antenna and Tower Safety | L14#towers
22.3 RF Safety | L14#rf L14#distance
23 Construction Techniques
23.1 Electronic Shop Safety | L14#shock
23.3 Soldering Tools and Techniques | L1#meters
23.4 Surface Mount Technology (SMT) | L5#ics
23.5 Constructing Electronic Circuits | L5#symbols
24 Assembling a Station
24.1 Fixed Stations | L15#hookup L14#lightning
24.2 Mobile Installations | L15#power
24.3 Portable Stations | L15#power
24.4 Remote Stations | L12#control
25 Test Equipment and Measurement
25.2 Basic Test Meters | L1#meters L15#instruments
25.3 Frequency Counters | L15#instruments
25.4 Signal Generators | ws#troubleshoot
25.6 Oscilloscopes | L15#scope
25.7 Spectrum Analyzers | L15#instruments C4#spectrum
25.8 Impedance, Antenna, and Network Analyzers | L8#measure L15#instruments
25.9 Testing Digital Modulation | L10#digital
25.10 Software-Based Instruments | app
25.14 Using a Spectrum Analyzer | L10#mixing
25.15 Antenna System Measurements | L8#measure
25.16 Receiver Measurements | L11#noise L11#dynamic
25.17 Transmitter Measurements | L15#scope rf#predistortion
26 Troubleshooting and Maintenance
26.3 Getting Started | ws#troubleshoot
26.5 Testing at the Circuit Level | ws#troubleshoot
26.8 Typical Symptoms and Faults | L11#controls
26.9 Radio Troubleshooting Hints | ws#troubleshoot L11#chain
26.10 Antenna Systems | L8#measure
27 RFI and EMC
27.1 FCC Rules and Regulations | L12#neighbors
27.2 Elements of RFI | L15#rfi
27.3 Tools for RFI Control | L15#rfi ws#balun
27.4 Types of RFI | L15#rfi
27.6 Identifying the Type of RFI Source | L15#rfi
27.7 Locating Sources of RFI | L7#receive L13#contests
27.8 Television Interference (TVI) | L11#controls
27.10 Power-Line Noise | L15#rfi
27.11 Automotive RFI | L15#power
27.12 EMC Topics | ws#balun
`;

const LESSON_FILES = ["", "01-volts-amps-ohms", "02-decibels-and-prefixes", "03-capacitors-and-inductors", "04-resonance", "05-diodes-and-transistors", "06-waves-and-wavelength", "07-antennas", "08-feed-lines-and-swr", "09-propagation", "10-signals-and-modes", "11-receivers-and-transmitters", "12-rules-and-bands", "13-operating", "14-safety", "15-station-and-test-gear", "16-logic-and-op-amps"];
const COURSE_FILES = ["", "01-spinning-arrows", "02-arrows-as-numbers", "03-taking-snapshots", "04-winding-machine", "05-moving-a-station", "06-averaging-is-filtering", "07-throwing-away-snapshots", "08-chunks-of-a-live-stream", "09-fm-listening-to-the-speed", "10-am-ssb-and-morse", "11-numbers-to-speakers", "12-inside-the-dongle", "13-usb-from-zero", "14-writing-the-driver", "15-the-network-source", "16-the-whole-receiver"];

/** A link key → { href relative to ham/handbook/, label }. */
export function resolve(key: string): { href: string; text: string; kind: string } {
  const [k, anchor] = key.split("#"), hash = anchor ? `#${anchor}` : "";
  if (k.startsWith("L")) return { href: `../lessons/${LESSON_FILES[+k.slice(1)]}.html${hash}`, text: `Lesson ${+k.slice(1)}`, kind: "lesson" };
  if (k.startsWith("C")) return { href: `../../course/${COURSE_FILES[+k.slice(1)]}.html${hash}`, text: `Course ch. ${+k.slice(1)}`, kind: "course" };
  if (k === "rf") return { href: `./rf-design.html${hash}`, text: "RF lab", kind: "lab" };
  if (k === "ws") return { href: `./workshop.html${hash}`, text: "Workshop lab", kind: "lab" };
  if (k === "build") return { href: `../../build.html${hash}`, text: "Build guide", kind: "course" };
  if (k === "app") return { href: "../../", text: "Spectrum Lab", kind: "course" };
  return { href: "../", text: "License practice", kind: "lesson" };
}

export interface Chapter { num: number; title: string; sections: { num: string; title: string; links: string[] }[] }
export function chapters(): Chapter[] {
  const out: Chapter[] = [];
  for (const raw of TOC.trim().split("\n")) {
    const m = raw.match(/^(\d+)\s+(.*)$/), sm = raw.match(/^(\d+\.\d+)\s+(.*?)\s*\|\s*(.*)$/);
    if (sm) out.at(-1)!.sections.push({ num: sm[1], title: sm[2], links: sm[3].split(/\s+/).filter(Boolean) });
    else if (m) out.push({ num: +m[1], title: m[2], sections: [] });
  }
  return out;
}
