# ihor.sh

Hobby projects behind [ihor.sh](https://ihor.sh): radio, NYC, and learning in public.

## The site

`index.html` is the home page (projects as game worlds), `theme.css` is the look the server adds to every project page (the pixel Arcade theme by default, plus five cinematic glass themes and more in the reader panel, `reader.js`, which also holds the site search box and the "still working" bar), `companion.js` is Blip, the companion that rides along on every page (d3-force soft body, chat through `/api/ask` streamed step by step, page context and page actions), and `server.ts` serves everything: `/`, the worlds, `/api/*` for the site's own pages, `/mcp` (the same tools for AI agents over the Model Context Protocol), `/llms.txt`, `/sitemap.xml`, SEO meta and JSON-LD per page kind. Blip answers with Ollama Cloud and falls back to a local [Ollama](https://ollama.com) model; Yomu's chat (`yomu-chat.ts`) uses the local model only.

Top-level modules: `blip.ts` (the agent and its 28 tools), `mcp.ts`, `search.ts` (site search, FTS5 in memory), `jobs.ts` + `jobs-ai.ts` (the jobs radar: ATS boards, NYC jobs, Adzuna, remote boards; embeddings and résumé matching), `evening.ts` (the evening planner), `transit.ts`, `nycapi.ts`, `archive.ts`, `sky.ts` (aircraft, ISS, storms, weather), `sat.ts` (SGP4 passes), `ships.ts` (AIS from aisstream.io), `ride.ts` (bike routing, Overpass), `deals.ts`, `events.ts`, `orna.ts`, `session.ts`. Keys live in `.env` (git-ignored). Tests: `node <file>.test.*` for each module; `npm run check` fetches every page and API after a deploy.

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

Server, tunnel, the dongle server (`radio/server.ts`, which opens the dongle only while someone listens) and Ollama run as LaunchDaemons that start at boot (no login needed) as the normal user, and restart on crash: `/Library/LaunchDaemons/sh.ihor.{server,tunnel,sdr,ollama}.plist` (logs in `~/Library/Logs/ihor-*.log`). Deploy = `git pull && npm run build && ./restart.sh server sdr`, then `npm run check` (every page and API answers; `BASE=https://ihor.sh npm run check` for the live site). The dongle by hand: `./dongle.sh` (status), `./dongle.sh free` (drop all listeners/viewers), `./dongle.sh aprs|adsb`.

Live receivers from `~/aprs-web` are published under `/radio/aprs/` and `/radio/adsb/` (page + WebSocket proxied, themed "off the air" page when stopped). They share the one dongle with the server SDR, so start one at a time: `cd ~/aprs-web && PORT=3000 MODE=aprs npm start` (APRS) or `PORT=3001 MODE=adsb npm start` (ADS-B). The home page lights their level cards from `/api/radio/status`.

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

Tools built on NYC open data: the **NYC Live Map** (`index.html`: alerts, live trains, buses, ferries, ships, aircraft, Citi Bike, cameras, 311, events, inspections, a trip planner), **Free NYC**, the **MTA Archive** (`archive.html`), **Tonight** (`tonight.html`, the evening planner), the **Jobs radar** (`jobs.html`) and the **résumé check** (`resume.html`, parsed and scored in the browser). `archive.ts` polls the MTA alert and elevator/escalator outage feeds every 5 minutes into `data/mta.db` (SQLite, not in git), because that history can't be backfilled; the page reads it from `/api/nyc/archive`.

## ai/, learn/, yomu/, ride/, orna/

**ai/**: AI from scratch, ten interactive chapters (matrices to a tiny transformer trained in the browser, `tinygpt.js`) with `learn-kit.js` questions, runnable code and KaTeX. **learn/**: electronics from scratch (16 chapters) solved live by `circuit.js`, and the circuit lab (`lab.html`, parts/engine/templates in `lab/`). **yomu/**: Japanese from zero: hand-written stories (`stories/`, from `src/n*.py`), grammar, kanji and word decks to N1 (`data/`), kana, handwriting (`handwriting.js`), spoken scenes (`talk.js`), free chat at a level (`chat.html`), photos (`img/`, from `src/images.py`). **ride/**: the bikepacking route notebook and bike + train escapes (`escapes.js`). **orna/**: the guild shop planner.

## ideas-page/

The template for a browsable version of the project backlog.
