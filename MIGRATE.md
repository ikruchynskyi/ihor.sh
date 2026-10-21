# Running ihor.sh in Docker (macOS & Linux)

## Architecture on the Mac mini

`compose.yaml` runs the internet-facing services in hardened Docker containers on an isolated bridge network (`ihor`, `172.30.0.0/24`), while USB and Apple Silicon Metal/MLX services stay on the macOS host (`127.0.0.1` only) and are reached from `web` via `host.docker.internal`:

| Service | Where | Port / Address | Purpose |
|---|---|---|---|
| `web` | Docker (`ihor-web`) | `127.0.0.1:8080` (`172.30.0.2`) | `server.ts` and the Meteor pass recorder (`meteor-rec.ts`) |
| `tts` | Docker (`ihor-tts`) | `http://tts:5056` | Edge neural TTS (`yomu/src/edge_tts_server.py`) |
| `memegen` | Docker (`memegen`) | `http://memegen:5000` | Local meme generator for Blip and Yomu |
| `tunnel` | Docker (`ihor-tunnel`) | `172.30.0.10` | `cloudflared` tunnel (`ihor.sh`, `www.ihor.sh` → `http://web:8080`) |
| `host` | Mac (`sh.ihor.server`) | `127.0.0.1:8075`, `:8076` | `host.ts`: starts Docker Desktop + Compose on boot; bridges `mlx_whisper` (`:8075/whisper`), `mflux` SeedVR2 upscaler (`:8075/upscale`), and Meshtastic USB serial (`:8076`) |
| `sdr` | Mac (`sh.ihor.sdr`) | `127.0.0.1:8073` | `radio/server.ts` (`SDR_DEVICE=rtl`, Nooelec RTL-SDR) |
| `sdr-sat` | Mac (`sh.ihor.sdr-sat`) | `127.0.0.1:8074` | `radio/server.ts` (`SDR_DEVICE=hackrf`, HackRF Pro for weather satellites) |
| `ollama` | Mac (`Ollama.app`) | `127.0.0.1:11434` | Local LLM & embeddings (`qwen3.8:27b-mlx`, `nomic-embed-text`) |

## Managing from the host

Use `./manage.sh` (or the matching `npm run` scripts):

```sh
./manage.sh status              # container health + host services (sdr, sdr-sat, host-bridge, ollama)
./manage.sh rebuild             # build radio/dist, rebuild & restart Docker containers (npm run rebuild)
./manage.sh deploy              # rebuild containers, restart host daemons, run npm run check (npm run deploy)
./manage.sh restart [service]   # restart web, tts, memegen, tunnel, host, sdr, sdr-sat, ollama (./restart.sh)
./manage.sh test [file...]      # run unit tests inside the web container (npm test)
./manage.sh check               # run lint.py + scripts/check.ts + scripts/aso-check.ts (npm run check)
./manage.sh logs [service]      # follow container logs, or ~/Library/Logs/ihor-*.log for sdr/sdr-sat/host
./manage.sh shell               # open a shell inside the web container
```

## Boot startup on macOS

1. `/Library/LaunchDaemons/sh.ihor.{server,sdr,sdr-sat,tunnel}.plist` start at boot before any user logs in (`sudo ./daemons/install.sh`).
2. On macOS, `sh.ihor.server` runs `node server.ts` → `host.ts`.
3. `host.ts` checks `docker info` (starting Docker Desktop if needed; `AutoStart: true` is also enabled in `~/Library/Group Containers/group.com.docker/settings-store.json`), ensures Ollama is serving on `127.0.0.1:11434`, and runs `docker compose up -d` (with `restart: unless-stopped` on every container). A 60 s watchdog loop keeps Docker and the compose stack up.
4. To run `server.ts` directly on macOS without Docker (for local debugging), set `HOST_DIRECT=1 node server.ts`.

## Moving to another host (Linux)

```sh
NEW=user@newhost:ihor.sh
git clone <repo> ihor.sh                                   # on the new host
rsync -a .env data cloudflared $NEW/                       # data/ is ~900 MB (jobs.db, mta.db, meteor passes)
```

Also copy `radio/gains.json` (per-band tuned gains). On a Linux host with USB passthrough, `sdr`, `sdr-sat`, and `ollama` can either run as systemd services on the host (reached via `host.docker.internal`) or as additional services in `compose.yaml` with `devices: ["/dev/bus/usb:/dev/bus/usb"]`.
