# ihor.sh

Hobby projects behind [ihor.sh](https://ihor.sh): radio, NYC, and learning in public.

## radio/

A software-defined radio that runs in the browser, written from scratch in TypeScript (no SDR libraries), plus a course that teaches how it works.

- **Spectrum Lab** (`index.html`): a receiver you can watch stage by stage: waterfall, mixer, filter, decimation, FM/AM/SSB demodulation, audio. Sources: a recording, demo signals, your own RTL-SDR over WebUSB, or a dongle on a server.
- **Radio from scratch** (`course/`): 16 interactive chapters in the style of 3Blue1Brown, from "a dot on a wheel draws a sine wave" to the USB driver, with live labs on a real dongle and a runnable script per chapter (`course/code/`).
- **Build for your own dongle** (`build.html`): a developer guide to WebUSB, the RTL2832U/R820T protocols, the sample data and the server API, with interactive source viewers; `examples/hello-dongle.html` is an 80-line starter app.
- **Driver**: `src/rtlsdr.ts` (RTL2832U over WebUSB) and `src/r820t.ts` (R820T/R820T2 tuner).
- **Server**: `server.ts` streams a dongle on your network to browsers (plain HTTP, meant for a home network).

```sh
cd radio
npm install
npm run dev            # live-reload preview
npm run serve          # build, then serve the site + the server SDR on port 8073
npm test               # DSP unit tests
npm run course-check   # every course chapter's script (HW=1 also runs the ones needing a dongle)
npm run hw-test        # driver + DSP against a real dongle: checks the 19 kHz FM stereo pilot
```

WebUSB needs Chrome, Edge or Opera on an `https://` or `localhost` page.

## nyc/

Small static pages built on NYC open data: **Subway Bailout** (live MTA alerts → nearest Citi Bike stations) and **Free NYC** (free and pay-what-you-wish museums, gardens and ferries on any day). Open `nyc/index.html` through any static file server.

## ideas-page/

The template for a browsable version of the project backlog.
