---
name: ihor-sh
description: Read ihor.sh as Markdown, find its pages, and get live NYC, sky and radio data from Blip, the site's assistant, over MCP or A2A.
---

# Using ihor.sh

ihor.sh is a set of hobby projects, free and without accounts: a software-defined radio with courses, NYC open-data tools (live subway map, jobs radar, evening planner, résumé check), AI and electronics courses, Yomu (Japanese from zero), a bikepacking notebook, and Blip, an assistant on every page.

## Reading pages

- Send `Accept: text/markdown` with any page request to get the page as Markdown (front matter with title, description and URL, then the content). Browsers get HTML.
- `https://ihor.sh/llms.txt` lists every page with a one-line description; `https://ihor.sh/sitemap.xml` lists every URL.
- Pages are interactive (JavaScript); the Markdown holds their text, not live widgets.

## Live data

Live NYC data (subway, buses, ferries, Citi Bike, trips, events, restaurant inspections, 311, traffic), the sky (weather, aircraft, ships, ISS, storms), radio (stations, callsigns, repeaters, propagation) and web search come from Blip:

- MCP (Streamable HTTP): `https://ihor.sh/mcp`. Card: `https://ihor.sh/.well-known/mcp/server-card.json`. Call `ask_blip` for a composed answer or any of its data tools directly.
- A2A (JSON-RPC, `SendMessage`): `https://ihor.sh/a2a`. Card: `https://ihor.sh/.well-known/agent-card.json`.
- Both want `Authorization: Bearer <token>`; the token comes from the site's owner (https://ihork.link/). Rate-limited per IP.
- In a browser tab on ihor.sh, the page registers WebMCP tools (`search_site`, `ask_blip`) on `navigator.modelContext`, no token needed.

## Don't

- Don't call `/api/`: it serves the site's own pages only and refuses other callers.
