import { api, esc, int } from "./ui.js";
import * as pages from "./pages.js";

const $ = (s) => document.querySelector(s);
const page = $("#page");

const routes = [
  [/^#?\/?$/, () => pages.overview()],
  [/^#\/tx\/(0x[0-9a-f]{64})$/i, (m) => pages.transaction(m[1].toLowerCase())],
  [/^#\/block\/(\d+|0x[0-9a-f]{64})$/i, (m) => pages.block(m[1])],
  [/^#\/address\/(ck[bt]1[0-9a-z]+)$/i, (m) => pages.address(m[1])],
  [/^#\/script\/(0x[0-9a-f]{64})\/(type|data|data1|data2)$/i, (m) => pages.script(m[1].toLowerCase(), m[2])],
];

let refreshTimer = null;
let renderId = 0;

async function render({ quiet = false } = {}) {
  const id = ++renderId;
  const hash = location.hash || "#/";
  const route = routes.find(([re]) => re.test(hash));
  clearInterval(refreshTimer);
  if (!quiet) page.innerHTML = `<p class="loading">Loading…</p>`;
  try {
    if (!route) throw new Error("There's no page at this address. Use the search box, or go back to the overview.");
    const result = await route[1](hash.match(route[0]));
    if (id !== renderId) return; // a newer navigation started while this one loaded
    // Keep expanded cells expanded across live refreshes.
    const openCells = [...page.querySelectorAll("details.cell")].flatMap((d, i) => (d.open ? [i] : []));
    page.innerHTML = result.html;
    if (quiet) openCells.forEach((i) => page.querySelectorAll("details.cell")[i]?.setAttribute("open", ""));
    document.title = `${result.title} · ckb-devnet-explorer`;
    if (!quiet) { window.scrollTo(0, 0); page.focus({ preventScroll: true }); }
    if (result.refresh) refreshTimer = setInterval(() => render({ quiet: true }), 5000);
  } catch (err) {
    if (id !== renderId) return;
    page.innerHTML = `<div class="notice error"><p>${esc(err.message)}</p></div><p><a href="#/">← Back to the overview</a></p>`;
    document.title = "Not found · ckb-devnet-explorer";
  }
}

// ---- node status in the top bar ----

let lastTip = null;
async function pollNode() {
  const node = $("#node");
  try {
    const info = await api("/api/info");
    node.classList.add("up");
    node.classList.remove("down");
    node.title = `Connected to ${info.rpcUrl}`;
    $("#node-label").innerHTML = `devnet <b>#${int(info.tip)}</b>`;
    if (lastTip !== null && info.tip !== lastTip) {
      node.classList.remove("tick");
      void node.offsetWidth;
      node.classList.add("tick");
    }
    lastTip = info.tip;
  } catch (err) {
    node.classList.add("down");
    node.classList.remove("up");
    node.title = err.message;
    $("#node-label").textContent = "devnet offline";
  }
}

// ---- search ----

$("#search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (!q) return;
  try {
    const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (res.route) {
      $("#q").value = "";
      $("#q").blur();
      if (location.hash === res.route) render(); else location.hash = res.route;
    } else toast(res.error);
  } catch (err) {
    toast(err.message);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    $("#q").focus();
  }
});

// ---- copy buttons ----

let toastTimer;
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    toast("Copied");
  } catch {
    toast("Couldn't copy. Select the text and copy it instead.");
  }
});

window.addEventListener("hashchange", () => render());
render();
pollNode();
setInterval(pollNode, 4000);
