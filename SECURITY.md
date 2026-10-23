# Security review

Reviewed 2026-10-19 (IDEAS.md, "Security review and containment"). Scope: `server.ts` (88 routes), `radio/server.ts` (9
routes, on :8073 and :8074), `mcp.ts` (/mcp, /a2a), the modules they call, and the pages that render model output.

## Who can call what

| Group | Routes | Gate |
|---|---|---|
| Pages and files | `/`, `/terms`, the world folders (`/radio/`, `/nyc/`, `/ai/`, `/yomu/`, `/ride/`, `/learn/`, `/orna/`), fonts, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/.well-known/*` | anyone. Files are resolved inside their world folder (`path.resolve` + prefix check); dot-folders, `node_modules`, `__pycache__` and `ai/review/` are never served (`search.ts` `PRIVATE`) |
| Agent endpoints | `/mcp`, `/a2a` | bearer token (`MCP_TOKEN`, ≥ 24 chars, constant-time compare); without it only `site_search`; 300 requests / 10 min per IP |
| Open read-only | `/search`, `/jobs/feed.xml`, `/api/memes/*`, `/api/memegen/*` (GET/HEAD only) | per-IP limits |
| The site's API | everything else under `/api/` | a request from an ihor.sh page (`Sec-Fetch-Site` / Origin / Referer) **and** a signed session cookie that only loading a page hands out; keyed services have per-session and per-IP budgets (`METERED`), Blip one question per session every 30 s |
| Owner | `/api/meteor/settings`, `/api/mesh/send`, `/clear-nodes`, `/logs`, `/traceroute`, the Meteor and mesh owner views | the owner key (`MESH_OWNER_KEY`, 144 bits) exchanged once for an HttpOnly, SameSite=Strict, HMAC-signed cookie; 10 tries an hour per IP |
| Radio servers | `/api/state`, `/api/stream`, `/api/slice`, `/api/overview`, `/api/scan/fm`, `/api/receiver`, `/api/viewer`, `/api/aprs|adsb/events` via ihor.sh's proxy | the proxy marks requests `x-via-ihor`; gains and the raw full-window stream need a request from this machine without that mark; `/api/admin/free` is this machine only |

## What was checked

- **Command injection:** every child process (`meteor-record.ts`, Whisper in `monitor.ts`, `upscale.ts`, edge TTS, `unzip`, `stty`, `git`) gets an argument array, never a shell; the Python scripts built as strings interpolate only constants. Visitor text reaches edge TTS as one argument.
- **Path traversal:** static files as above (`/learn/../.env`, `/ai/%2e%2e/.env` → 404); `/api/meteor/file` takes a whitelisted id and file name.
- **Server-side request forgery:** no route or Blip tool fetches a URL the visitor or the model chooses. Blip's tools call fixed services with typed parameters; web search goes to search APIs; the camera upscaler and `/api/nyc/camera-image` fetch only pictures from the site's own camera list (the page plays NYSDOT's video and YouTube's streams itself); `/api/memegen/*` forwards a path to the local memegen or api.memegen.link only, GET/HEAD.
- **Model output in pages (XSS):** Blip's chat escapes first and allows only bold, code and http(s) links (other sites in a new tab); Yomu chat, the résumé check, the Spectrum Lab room and search snippets escape model and visitor text.
- **Prompt injection:** Blip's tools only read; page actions run in the visitor's own page; nothing a model says reaches owner routes or files.
- **Secrets:** `.env` is git-ignored, mode 600, never served; a pattern scan of the whole git history found no API keys, tokens or private keys. Dependencies: the server has none; `radio` has 0 known vulnerabilities (`npm audit`).

## Fixed (2026-10-19)

1. **The radio servers trusted the LAN as their owner.** They listened on every interface, and "owner" meant "no `x-via-ihor` header", so any device on the network could change the gains or take the raw stream. They now listen on 127.0.0.1 (`RADIO_HOST` to change), and owner controls also need a connection from this machine.
2. **Visitor addresses could be forged.** Rate limits read `CF-Connecting-IP` from any client; a request reaching the server directly (the LAN, with `HOST=0.0.0.0`) could name any address and dodge every limit, or fake the chat room's country flag. Cloudflare's headers now count only from the tunnel (`clientIp`, `clientCountry` in `session.ts`; `TRUSTED_PROXY` for a tunnel container; `session.test.ts`).
3. **No security headers.** Every response now sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'`, `Referrer-Policy: strict-origin-when-cross-origin`, and HSTS on ihor.sh.
4. **Container containment (2026-10-21).** `web` (`server.ts` + Meteor recorder), `tts` (`edge_tts_server.py`), `memegen`, and `tunnel` (`cloudflared`) now run inside Docker containers (`compose.yaml`) on an isolated bridge network (`ihor`, `172.30.0.0/24`) as non-root users (`node`, `nobody`, `memegen`, `nonroot`) with `read_only: true` root filesystems (`tmpfs: [/tmp]`), `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, no Docker socket, and no home-directory mounts (only `./data`, `./.env:ro`, `./.git:ro`, and Yomu's cache files). Host-only hardware/MLX services (`sdr` :8073, `sdr-sat` :8074, `host.ts` :8075/:8076 for `mlx_whisper`, `mflux` SeedVR2, and Meshtastic serial, plus `ollama` :11434) listen on `127.0.0.1` only.

## Open

- **Host service user separation.** The USB/MLX host daemons (`sdr`, `sdr-sat`, `host.ts`, `ollama`) still run as the owner's macOS user; running them under a dedicated non-admin macOS account would further isolate host services.
- **A full CSP** (scripts and styles) needs the inline scripts moved out of the pages first; today's policy covers framing, plugins and `<base>`.
- **Run a dedicated secret scanner** (gitleaks) for the record; the pattern scan above isn't exhaustive.
