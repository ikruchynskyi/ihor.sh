# ihor.sh

Hobby projects behind [ihor.sh](https://ihor.sh): radio, NYC, and learning in public.

## The site

`index.html` is the home page (projects as game worlds), `public/theme.css` is the look the server adds to every project page (the pixel Arcade theme by default, plus five cinematic glass themes and more in the reader panel, `public/reader.js`, which also holds the site search box and the "still working" bar), `companion.js` is Blip, the companion that rides along on every page (d3-force soft body, chat through `/api/ask` streamed step by step, page context and page actions), and `server.ts` serves everything: `/`, the worlds, `/api/*` for the site's own pages, `/mcp` (the same tools for AI agents over the Model Context Protocol), `/llms.txt`, `/sitemap.xml`, SEO meta and JSON-LD per page kind. Blip answers with Ollama Cloud and falls back to a local [Ollama](https://ollama.com) model; Yomu's chat (`yomu-chat.ts`) uses the local model only.

Layout: `server.ts` (the web server) and `host.ts` (the macOS host supervisor) are the two entry points, at the root because Docker and the boot daemon start them by name; everything they use is in `server/`; `scripts/` holds the post-deploy checks (`check.ts`, `aso-check.ts`); each project is a folder (`radio/`, `nyc/`, `ai/`, `learn/`, `yomu/`, `ride/`, `orna/`), `public/` holds what's served at the site root (`theme.css`, `reader.js`, `companion.js`, `learn-kit.js`, `maps.js`, `blip-wardrobe.js`, the icons and `fonts/`; the server serves exactly that list), while `index.html` and `terms.html` stay at the root as the home and terms pages. The modules in `server/`: `blip.ts` (the agent and its 28 tools), `mcp.ts`, `search.ts` (site search, FTS5 in memory), `jobs.ts` + `jobs-ai.ts` (the jobs radar: ATS boards, NYC jobs, Adzuna, remote boards; embeddings and résumé matching), `evening.ts` (the evening planner), `transit.ts`, `nycapi.ts`, `archive.ts`, `sky.ts` (aircraft, ISS, storms, weather), `sat.ts` (SGP4 passes of the ISS and the ham satellites), `spacewx.ts` (NOAA space weather and band conditions), `monitor.ts` (listen to a repeater on the server SDR with Whisper captions and a callsign detector), `ships.ts` (AIS from aisstream.io), `ride.ts` (bike routing, Overpass), `deals.ts`, `events.ts`, `orna.ts`, `session.ts`. Keys live in `.env` (git-ignored). Tests: `node server/<file>.test.ts` for each module; `npm run check` fetches every page and API after a deploy.

```sh
./manage.sh status     # Docker containers (web, tts, memegen, tunnel) + host services (sdr, sdr-sat, host-bridge, ollama)
./manage.sh rebuild    # build radio/dist, rebuild and restart Docker containers
./manage.sh deploy     # rebuild containers, restart host daemons, and run `npm run check`
./manage.sh test       # run unit tests inside the `web` container (or `./manage.sh test <file>`)
./manage.sh check      # lint + smoke check + ASO check against http://localhost:8080 (`npm run check`)
./manage.sh logs [svc] # tail container logs (or host logs for sdr / sdr-sat / host)
./restart.sh [svc...]  # restart web, tts, memegen, tunnel, host, sdr, sdr-sat, ollama (no args: all)
```

It listens on `127.0.0.1:8080` on the host; a Cloudflare tunnel publishes it:

```sh
cloudflared tunnel login                      # once: pick the ihor.sh zone in the browser
cloudflared tunnel create ihor-sh
cloudflared tunnel route dns ihor-sh ihor.sh
# ingress lives in cloudflared/config.yml (ihor.sh, www → http://web:8080)
```

The site (`web`: `server.ts` + the Meteor recorder it spawns), Edge neural TTS (`tts`), `memegen`, and `tunnel` (`cloudflared`) run in hardened Docker containers (`compose.yaml`, non-root, read-only root filesystem, `cap_drop: [ALL]`, `no-new-privileges`, isolated network `ihor`). Services that need USB hardware or Apple Silicon Metal/MLX stay on the Mac host (`127.0.0.1` only) and are reached from `web` via `host.docker.internal`: the two USB radio servers (`radio/server.ts`, which opens its radio only while someone listens), Ollama (`:11434`), and `host.ts` (`:8075` HTTP for `mlx_whisper` captions and `mflux` SeedVR2 camera upscaling; `:8076` TCP for the Meshtastic USB serial node `/dev/cu.usbmodem*`). Boot LaunchDaemons (`/Library/LaunchDaemons/sh.ihor.{server,sdr,sdr-sat,tunnel}.plist`, logs in `~/Library/Logs/ihor-*.log`) start at boot before anyone logs in: `sh.ihor.server` runs `host.ts`, which starts Docker Desktop (`AutoStart: true`), Ollama, and `docker compose up -d`, and self-heals them every 60 s so a macOS reboot never leaves the site down (`sudo ./daemons/install.sh` installs/updates the daemons; `--undo` goes back). Two radios: `sdr` (:8073, everything the site shows, `SDR_DEVICE=rtl`) opens the Nooelec (vertical 2 m antenna); `sdr-sat` (:8074, the same server with `SDR_DEVICE=hackrf`) keeps the HackRF Pro (horizontal V-dipole → choke → SAWbird+ NOAA LNA on its own USB power → Flamingo FM filter, since 2026-10-17) for weather satellites: the Meteor recorder, and live views at 137–138 MHz (the lab panel asks for `radio=sat`, which the site's proxy sends to :8074). Each opens only its own radio (`SDR_DEVICE`); a satellite view and the Meteor recorder fall back to `sdr` when `sdr-sat` can't stream, never the other way, so taking the Nooelec away can't tie up the HackRF. Streams from this machine (the recorder) don't count against `sdr-sat`'s upload budget, so visitors can't crowd a pass out. Gain is per band in `radio/gains.json` (git-ignored, shared by both): the HackRF at 2 m LNA 24 / VGA 40 and FM LNA 16 / VGA 24 (higher LNA overloads on the NOAA transmitter at 162.55 MHz); the pages show the server's gain but never set it, the owner does: `curl -XPOST 127.0.0.1:8074/api/tune -d '{"center":137.9e6,"gain":20}'`. Deploy = `./manage.sh deploy` (or `git pull && ./manage.sh rebuild && npm run check`; `BASE=https://ihor.sh npm run check` for the live site). The dongle by hand: `./dongle.sh` (status), `./dongle.sh free` (drop all listeners/viewers), `./dongle.sh aprs|adsb`. Container architecture and moving to another host: [MIGRATE.md](MIGRATE.md).

The APRS map (`/radio/aprs/`) and ADS-B radar (`/radio/adsb/`) are decoders inside the main radio server (`/api/aprs/events`, `/api/adsb/events`); one runs at a time, and Spectrum Lab listeners pause it. The home page lights their level cards from `/api/radio/status`. `./dongle.sh` shows and frees the main radio.

**Meteor recorder:** `meteor-rec.ts` (in the site server) plans 48 h of Meteor-M2 3 / M2 4 passes every 20 minutes and, a minute before each pass that peaks at 40° or more, starts `radio/scripts/meteor-record.ts` as its own process. It records a 240 kHz slice at 137.9 MHz from the satellite radio (else the main one), decodes it live and writes `data/meteor/<id>/` (a PNG per channel, a thumbnail, `meta.json`) plus `data/meteor/index.json` (not in git). Two raw files are kept: the newest pass whose picture shows the Earth and the newest that doesn't. `radio/meteor-passes.html` shows them; `meteor.html?pass=<id>` makes pictures and maps from one. The balcony faces north with towers close by, so high passes do best.

## radio/

A software-defined radio that runs in the browser, written from scratch in TypeScript (no SDR libraries), plus a course that teaches how it works.

- **Spectrum Lab** (`index.html`): a receiver you can watch stage by stage: waterfall, mixer, filter, decimation, FM/AM/SSB demodulation, audio. Sources: a recording, demo signals, your own RTL-SDR over WebUSB, or a dongle on a server.
- **Radio from scratch** (`course/`): 17 interactive chapters in the style of 3Blue1Brown, from "a dot on a wheel draws a sine wave" to the USB driver, with live labs on a real dongle and a runnable script per chapter (`course/code/`).
- **Meteor-M LRPT** (`meteor.html`, engine in `src/meteor.ts`): pictures from the Meteor-M2 3 / M2 4 weather satellites, live (your dongle or the server's satellite radio), from a recording or from the server's recorded passes (`meteor-passes.html`), with coastline maps and false-color composites.
- **SSTV decoder** (`sstv.html`, engine in `src/sstv.ts`): slow-scan TV pictures from the ISS (145.800 MHz), a recording, a microphone or a built-in transmitter; Robot 36, Martin, Scottie and PD modes with VIS detection and slant correction. Course chapter 17 explains it.
- **Ham radio license, visually** (`ham/`): exam prep for Technician, General and Amateur Extra with the official NCVEC pools (spaced repetition, mock exams built one question per group, a pass-probability estimate), 16 interactive lessons covering every exam group, and a section-by-section **ARRL Handbook companion** (`ham/handbook/`) with extra RF design and workshop labs.
- **Build for your own dongle** (`build.html`): a developer guide to WebUSB, the RTL2832U/R820T protocols, the sample data and the server API, with interactive source viewers; `examples/hello-dongle.html` is an 80-line starter app.
- **Drivers**: `src/rtlsdr.ts` (RTL2832U over WebUSB), `src/r820t.ts` (R820T/R820T2 tuner) and `src/hackrf.ts` (HackRF One / Pro, receive only).
- **Server**: `server.ts` streams a radio on your network to browsers (plain HTTP, meant for a home network): each listener gets a slice of a shared window, plus the APRS and ADS-B decoders. `SDR_DEVICE=rtl` keeps it to the RTL-SDR (otherwise the HackRF, else the RTL-SDR).

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

**ai/**: AI from scratch, a path of 60 lessons in eight stages plus electives (`index.html` is the order; `course.json` holds each lesson's goals, prerequisites and quiz), from what ML is through the math, networks, classic ML, CNNs, transformers (`tinygpt.js` trains one in the browser), LLM engineering and production. Each lesson has a gist, a "Why" box, a "Where it breaks" box, `learn-kit.js` questions and runnable Python (Pyodide); each has a practice notebook built from `ai/notebooks/src/*.py` by `build.py` (`build.py --kaggle NAME` publishes one to Kaggle). `ai/notebooks/PEDAGOGY.md` is the teaching standard and `lint.py` checks it (`npm run check` runs it). **learn/**: electronics from scratch, Part I (16 chapters) solved live by `circuit.js`, and Part II, real builds (`electronics/projects.js`: each circuit, why every part is there, its breadboard; drawn, simulated and cross-linked by `build.js`; `node learn/build.test.mjs` checks every breadboard against its schematic), and the circuit lab (`lab.html`, parts/engine/templates in `lab/`). **yomu/**: Japanese from zero: hand-written stories (`stories/`, from `src/n*.py`), grammar, kanji and word decks to N1 (`data/`), kana, handwriting (`handwriting.js`), spoken scenes (`talk.js`), free chat at a level (`chat.html`), photos (`img/`, from `src/images.py`). **ride/**: the bikepacking route notebook and bike + train escapes (`escapes.js`). **orna/**: the guild shop planner.

## ideas-page/

The template for a browsable version of the project backlog.
