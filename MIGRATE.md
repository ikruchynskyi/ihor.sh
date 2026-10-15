# Moving ihor.sh to another host (Docker)

`compose.yaml` runs everything that the Mac runs as LaunchDaemons:

| service   | what                                                        | Mac equivalent       |
|-----------|-------------------------------------------------------------|----------------------|
| `web`     | `server.ts` on :8080 (and the Meteor recorder it starts)    | `sh.ihor.server`     |
| `sdr`     | `radio/server.ts` on :8073 + HackRF (else the RTL-SDR)      | `sh.ihor.sdr`        |
| `sdr-sat` | `radio/server.ts` on :8074 + RTL-SDR (`SDR_DEVICE=rtl`)     | `sh.ihor.sdr-sat`    |
| `tunnel`  | cloudflared, same tunnel and ingress                        | `sh.ihor.tunnel`     |
| `ollama`  | local fallback model (gpt-oss:20b)                          | the Ollama app       |

`sdr`, `sdr-sat` and `tunnel` share `web`'s network namespace, so `127.0.0.1:8073` and `:8074` in the code, the SDR's "local only" admin API and
`service: http://localhost:8080` in the tunnel config work unchanged.

## 1. Old host (Mac): stop, so data is consistent and only one tunnel runs

```sh
for s in server sdr sdr-sat tunnel; do sudo launchctl bootout system/sh.ihor.$s; done
```

## 2. Copy what git doesn't have

```sh
NEW=user@newhost:ihor.sh
git clone <repo> ihor.sh                                   # on the new host
rsync -a .env data $NEW/                                   # data/ is ~200 MB, mostly jobs.db
ssh user@newhost mkdir -p ihor.sh/cloudflared
scp ~/.cloudflared/config.yml $NEW/cloudflared/
scp ~/.cloudflared/8c3e4fe3-0e26-426d-8531-2ba7ea4a2c90.json $NEW/cloudflared/tunnel.json
```

Also `radio/gains.json` (the gain each band was tuned to; worth keeping). Optional: `radio/fm-scan.json` (last FM scan; rebuilt on the next scan anyway). `data/` includes the Meteor recordings (`data/meteor`).

## 3. New host: hardware

- **Radios**: `sdr` takes the HackRF (else the RTL-SDR), `sdr-sat` only the RTL-SDR. With one radio, keep `sdr` and delete
  the `sdr-sat` service (the Meteor recorder then uses `sdr`); with none, also delete the `devices:` line under `sdr`.
- **Meshtastic radio**: uncomment `devices:` under `web` and set `MESH_PORT=/dev/ttyACM0` (or `ttyUSB0`) in `.env`;
  the auto-detect only knows macOS names (`/dev/cu.usbmodem*`).
- USB passthrough needs a **Linux** host; Docker Desktop on macOS/Windows can't pass USB devices.
- **Ollama**: an NVIDIA GPU needs the commented `deploy:` line in `compose.yaml`; on CPU gpt-oss:20b is very slow.
  No local model wanted: delete the `ollama` service (Blip and Jobs AI use Ollama Cloud first; Yomu chat is local only).

## 4. Start and check

```sh
docker compose up -d --build
docker compose exec ollama ollama pull gpt-oss:20b
docker compose exec web node check.ts                      # every page and API answers
docker compose logs -f web sdr sdr-sat tunnel
```

Deploy afterwards: `git pull && docker compose up -d --build`.

## Rolling back to the Mac

`docker compose down` on the new host, copy `data/` back, then
`for s in server sdr sdr-sat tunnel; do sudo launchctl bootstrap system /Library/LaunchDaemons/sh.ihor.$s.plist; done`.
