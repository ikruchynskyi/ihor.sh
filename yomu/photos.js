// A scene photo with its credit (yomu/img/credits.json): fills <figure class="scene"><img><figcaption></figure>.
let credits;
export async function photo(key, fig) {
  if (!fig) return;
  credits ??= fetch("/yomu/img/credits.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const c = (await credits)[key];
  if (!c) return;
  const img = fig.querySelector("img"), cap = fig.querySelector("figcaption");
  img.src = `/yomu/img/${key}.jpg`;
  cap.innerHTML = `Photo: <a href="${c.page}" target="_blank" rel="noopener">${c.author || "Wikimedia Commons"}</a> · <a href="${c.licenseUrl || c.page}" target="_blank" rel="noopener">${c.license}</a>`;
  fig.hidden = false;
}
