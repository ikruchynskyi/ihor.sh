// A live room on a page: who's here (masked IP + country flag), a chat, and the page's actions ("listening to
// 100.3 MHz WFM") with a button to join someone. Server side: room.ts in the site root.
export type RoomEv = { id: number; at: number; who: { name: string; flag: string; key: string }; kind: "say" | "action" | "join" | "leave"; text: string; data?: Record<string, string | number> };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function joinRoom(root: HTMLElement, name: string, opts: { title: string; join?: (data: Record<string, string | number>) => void; joinLabel?: string }) {
  root.innerHTML = `<div class="room"><div class="room-head"><b>${esc(opts.title)}</b> <span class="room-people"></span></div>
    <ol class="room-log" aria-live="polite" aria-label="Messages and actions"></ol>
    <form class="room-say"><input maxlength="300" placeholder="Say something to everyone on this page" aria-label="Message" autocomplete="off"><button>Send</button></form>
    <p class="room-note">Names are a masked IP and a country flag. Everyone on this page sees what you write.</p></div>`;
  const log = root.querySelector<HTMLOListElement>(".room-log")!, people = root.querySelector<HTMLElement>(".room-people")!;
  const input = root.querySelector<HTMLInputElement>("input")!, events = new Map<number, RoomEv>();
  let me = "";
  const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const line = (e: RoomEv) => {
    events.set(e.id, e);
    const mine = e.who.key === me, who = `${e.who.flag} <b>${mine ? "you" : esc(e.who.name)}</b>`;
    const li = document.createElement("li");
    li.className = `room-${e.kind}`;
    li.innerHTML = `<span class="room-t">${hm(e.at)}</span> ${who} ${e.kind === "say" ? `: ${esc(e.text)}` : `<i>${esc(e.text)}</i>`}${e.kind === "action" && e.data && opts.join && !mine ? ` <button class="room-go" data-ev="${e.id}">${esc(opts.joinLabel ?? "join")}</button>` : ""}`;
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.append(li);
    while (log.children.length > 100) log.firstElementChild!.remove();
    if (atEnd) log.scrollTop = log.scrollHeight;
  };
  const es = new EventSource(`/api/room/${name}/events`);
  es.addEventListener("hello", (m) => { const d = JSON.parse((m as MessageEvent).data); me = d.me.key; log.innerHTML = ""; events.clear(); d.log.forEach(line); log.scrollTop = log.scrollHeight; });
  es.addEventListener("ev", (m) => line(JSON.parse((m as MessageEvent).data)));
  es.addEventListener("people", (m) => {
    const list: RoomEv["who"][] = JSON.parse((m as MessageEvent).data);
    people.innerHTML = `${list.length} here: ${list.map((p) => `${p.flag} ${p.key === me ? "you" : esc(p.name)}`).join(", ")}`;
  });
  es.onerror = () => (people.textContent = "reconnecting…");
  log.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>(".room-go"); if (b) opts.join?.(events.get(+b.dataset.ev!)!.data!); });
  const post = (body: object) => fetch(`/api/room/${name}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "offline" }));
  root.querySelector("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const r = await post({ text });
    if (r.error) input.placeholder = r.error; else input.value = "";
  });
  addEventListener("pagehide", () => es.close());
  return {
    act: (text: string, data?: Record<string, string | number>) => post({ action: text, data }),
    /** for Blip: who's here and the last things said and done */
    summary: () => ({ here: people.textContent, recent: [...events.values()].slice(-12).map((e) => `${e.who.key === me ? "you" : e.who.name}: ${e.text}`) }),
  };
}
