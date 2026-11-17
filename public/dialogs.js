// Every pop-up (a <dialog> opened with showModal) closes with Back (a phone's back gesture, a TV remote's Back key, the
// browser's back button) or a click anywhere outside it (user, 2026-11-16). Loaded by reader.js on every page, and by
// the bare pages that have dialogs (nyc/today.html).
const top = () => [...document.querySelectorAll("dialog[open]")].at(-1);
// Back: opening a pop-up adds a history step, so Back closes it instead of leaving the page
let ours = 0; // history.back() calls this script made itself (a pop-up closed by its ✕ or a click outside), not the visitor's Back
const showModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  showModal.call(this);
  if (this.dataset.backStep) return;
  this.dataset.backStep = "1";
  history.pushState({ ...(history.state ?? {}), dialog: true }, "");
  this.addEventListener("close", () => { delete this.dataset.backStep; if (history.state?.dialog) { ours++; history.back(); } }, { once: true });
};
addEventListener("popstate", () => { if (ours) { ours--; return; } top()?.close(); });
// TV remotes whose Back key arrives as a key instead (LG webOS 461, Samsung Tizen 10009); Escape closes dialogs natively
addEventListener("keydown", (e) => {
  const d = top(); if (!d) return;
  if (e.key === "GoBack" || e.key === "BrowserBack" || e.keyCode === 461 || e.keyCode === 10009 || (e.key === "Backspace" && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) { e.preventDefault(); d.close(); }
}, true);
// a click outside the pop-up's box (on its backdrop); a click made with a key (Enter) has no position and is left alone
addEventListener("click", (e) => {
  const d = top(); if (!d || e.target !== d || e.detail === 0) return;
  const r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
});
