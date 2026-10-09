# ihor.sh

Hobby projects behind [ihor.sh](https://ihor.sh): radio, NYC, and learning in public.

## The site

`index.html` is the home page (projects as game worlds), `theme.css` is the game look the server adds to every project page, `companion.js` is Blip, the companion that rides along on every page (d3-force soft body, chat through `/api/ask`), and `server.ts` serves `/`, the built radio site under `/radio/`, and `/api/ask`, answered by a local [Ollama](https://ollama.com) model.

```sh
npm run build          # builds radio/dist
npm start              # http://localhost:8080  (env: PORT, OLLAMA_MODEL=gpt-oss:20b, OLLAMA_URL)
```

It listens on 127.0.0.1 only; a Cloudflare tunnel publishes it:

```sh
cloudflared tunnel login                      # once: pick the ihor.sh zone in the browser
cloudflared tunnel create ihor-sh
cloudflared tunnel route dns ihor-sh ihor.sh
# ingress lives in ~/.cloudflared/config.yml (ihor.sh, www → localhost:8080)
```

Server, tunnel and Ollama run as LaunchDaemons that start at boot (no login needed) as the normal user, and restart on crash: `/Library/LaunchDaemons/sh.ihor.{server,tunnel,ollama}.plist` (logs in `~/Library/Logs/ihor-*.log`). Deploy = `git pull && npm run build && pkill -f "node server.ts"` (launchd starts it again).

## radio/

A software-defined radio that runs in the browser, written from scratch in TypeScript (no SDR libraries), plus a course that teaches how it works.

- **Spectrum Lab** (`index.html`): a receiver you can watch stage by stage: waterfall, mixer, filter, decimation, FM/AM/SSB demodulation, audio. Sources: a recording, demo signals, your own RTL-SDR over WebUSB, or a dongle on a server.
- **Radio from scratch** (`course/`): 17 interactive chapters in the style of 3Blue1Brown, from "a dot on a wheel draws a sine wave" to the USB driver, with live labs on a real dongle and a runnable script per chapter (`course/code/`).
- **SSTV decoder** (`sstv.html`, engine in `src/sstv.ts`): slow-scan TV pictures from the ISS (145.800 MHz), a recording, a microphone or a built-in transmitter; Robot 36, Martin, Scottie and PD modes with VIS detection and slant correction. Course chapter 17 explains it.
- **Ham radio license, visually** (`ham/`): exam prep for Technician, General and Amateur Extra with the official NCVEC pools (spaced repetition, mock exams built one question per group, a pass-probability estimate), 16 interactive lessons covering every exam group, and a section-by-section **ARRL Handbook companion** (`ham/handbook/`) with extra RF design and workshop labs.
- **Build for your own dongle** (`build.html`): a developer guide to WebUSB, the RTL2832U/R820T protocols, the sample data and the server API, with interactive source viewers; `examples/hello-dongle.html` is an 80-line starter app.
- **Driver**: `src/rtlsdr.ts` (RTL2832U over WebUSB) and `src/r820t.ts` (R820T/R820T2 tuner).
- **Server**: `server.ts` streams a dongle on your network to browsers (plain HTTP, meant for a home network).

```sh
cd radio
npm install
npm run dev            # live-reload preview
npm run serve          # build, then serve the site + the server SDR on port 8073
npm test               # DSP, SSTV and license-engine tests
npm run course-check   # every course chapter's script (HW=1 also runs the ones needing a dongle)
npm run hw-test        # driver + DSP against a real dongle: checks the 19 kHz FM stereo pilot
```

WebUSB needs Chrome, Edge or Opera on an `https://` or `localhost` page.

## nyc/

Small pages built on NYC open data: **Subway Bailout** (live MTA alerts → nearest Citi Bike stations), **Free NYC** (free and pay-what-you-wish museums, gardens and ferries on any day) and the **MTA Archive** (`archive.html`). `archive.ts` polls the MTA alert and elevator/escalator outage feeds every 5 minutes into `data/mta.db` (SQLite, not in git), because that history can't be backfilled; the page reads it from `/api/nyc/archive`.

## ideas-page/

The template for a browsable version of the project backlog.
