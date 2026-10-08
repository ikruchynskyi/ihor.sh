// An interactive source viewer: real code on one side, explanations on the other.
// Click a highlighted part of the code and its explanation scrolls into view (and the other way round).

export interface Note {
  title: string;
  from: string; // text that appears on the first line of the part (first match after the previous note)
  to?: string; // text on its last line (default: the same line as `from`)
  html: string; // the explanation
}

const KEYWORDS = /\b(const|let|var|function|return|async|await|for|while|if|else|new|class|export|import|from|private|static|readonly|this|of|in|throw|try|catch|finally|type|interface)\b/g;

function escape(s: string) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!); }

/** Minimal highlighting (comments, strings, numbers, keywords), scanning one line left to right. */
function highlight(line: string) {
  let out = "", i = 0;
  const plain = (t: string) => escape(t).replace(KEYWORDS, '<span class="cv-k">$1</span>').replace(/\b(0x[0-9a-f]+|\d[\d_.]*(?:e\d+)?)\b/gi, '<span class="cv-n">$1</span>');
  while (i < line.length) {
    const ch = line[i];
    if (ch === "/" && line[i + 1] === "/") { out += `<span class="cv-c">${escape(line.slice(i))}</span>`; break; }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      out += `<span class="cv-s">${escape(line.slice(i, j + 1))}</span>`; i = j + 1; continue;
    }
    let j = i;
    while (j < line.length && !"\"'`".includes(line[j]) && !(line[j] === "/" && line[j + 1] === "/")) j++;
    out += plain(line.slice(i, j)); i = j;
  }
  return out;
}

/** Render `code` with `notes` into `root`. `file` is shown as the title. */
export function codeView(root: HTMLElement, file: string, code: string, notes: Note[]) {
  const lines = code.replace(/\s+$/, "").split("\n");
  // Resolve each note to a line range, searching forward so repeated text maps to the right place.
  // A note without `to` runs until just before the next note starts (blank lines trimmed).
  let cursor = 0;
  const starts = notes.map((n) => {
    const a = lines.findIndex((l, i) => i >= cursor && l.includes(n.from));
    if (a < 0) throw new Error(`codeView: "${n.from}" not found in ${file}`);
    cursor = a + 1;
    return a;
  });
  const ranges = notes.map((n, k) => {
    const a = starts[k];
    let b = n.to ? lines.findIndex((l, i) => i >= a && l.includes(n.to!)) : (k + 1 < notes.length ? starts[k + 1] - 1 : lines.length - 1);
    if (b < 0) throw new Error(`codeView: "${n.to}" not found in ${file}`);
    while (!n.to && b > a && !lines[b].trim()) b--;
    return [a, b] as const;
  });
  const owner = lines.map((_, i) => ranges.findIndex(([a, b]) => i >= a && i <= b));

  root.classList.add("cv");
  root.innerHTML = `
    <div class="cv-code" tabindex="0" aria-label="Source code of ${escape(file)}">
      <div class="cv-file">${escape(file)} · ${lines.length} lines · click a highlighted part</div>
      <pre>${lines.map((l, i) => `<span class="cv-line${owner[i] >= 0 ? " cv-region" : ""}" data-n="${owner[i]}"><span class="cv-num">${i + 1}</span>${highlight(l) || " "}</span>`).join("")}</pre>
    </div>
    <ol class="cv-notes">${notes.map((n, k) => `<li data-n="${k}" tabindex="0"><b>${escape(n.title)}</b><span class="cv-where">lines ${ranges[k][0] + 1}${ranges[k][1] > ranges[k][0] ? `–${ranges[k][1] + 1}` : ""}</span><div>${n.html}</div></li>`).join("")}</ol>`;

  const codeBox = root.querySelector(".cv-code") as HTMLElement, notesBox = root.querySelector(".cv-notes") as HTMLElement;
  const scrollWithin = (box: HTMLElement, el: HTMLElement) => {
    const stacked = getComputedStyle(root).gridTemplateColumns.split(" ").length < 2;
    if (stacked && box === notesBox) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
    box.scrollTo({ top: el.offsetTop - box.offsetTop - 24, behavior: "smooth" });
  };
  const select = (k: number, from: "code" | "note") => {
    root.querySelectorAll(".cv-on").forEach((e) => e.classList.remove("cv-on"));
    if (k < 0) return;
    const linesOf = root.querySelectorAll<HTMLElement>(`.cv-line[data-n="${k}"]`), note = notesBox.querySelector<HTMLElement>(`li[data-n="${k}"]`)!;
    linesOf.forEach((e) => e.classList.add("cv-on")); note.classList.add("cv-on");
    if (from === "code") scrollWithin(notesBox, note); else scrollWithin(codeBox, linesOf[0]);
  };
  root.querySelectorAll<HTMLElement>(".cv-region").forEach((e) => e.addEventListener("click", () => select(+e.dataset.n!, "code")));
  notesBox.querySelectorAll<HTMLElement>("li").forEach((e) => {
    e.addEventListener("click", () => select(+e.dataset.n!, "note"));
    e.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(+e.dataset.n!, "note"); } });
  });
}
