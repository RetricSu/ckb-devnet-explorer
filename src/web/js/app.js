import { api, int } from "./ui.js";
import * as pages from "./pages.js";
import { mountCharts } from "./charts.js";
import { initBanner } from "./banner.js";

const $ = (s) => document.querySelector(s);
const page = $("#page");
const banner = initBanner($("#banner"));

// [pattern on the path, page, nav section]. The query string (?page=2) is passed separately.
const routes = [
  [/^\/?$/, () => pages.home(), "home"],
  [/^\/blocks$/, (_, q) => pages.blocks(q), "blocks"],
  [/^\/transactions$/, (_, q) => pages.transactions(q), "transactions"],
  [/^\/tx\/(0x[0-9a-f]{64})$/i, (m) => pages.transaction(m[1].toLowerCase()), "transactions"],
  [/^\/block\/(\d+|0x[0-9a-f]{64})$/i, (m) => pages.block(m[1]), "blocks"],
  [/^\/address\/(ck[bt]1[0-9a-z]+)$/i, (m) => pages.address(m[1]), null],
  [/^\/script\/(0x[0-9a-f]{64})\/(type|data|data1|data2)$/i, (m) => pages.script(m[1].toLowerCase(), m[2]), null],
];

let refreshTimer = null;
let renderId = 0;

function parseHash() {
  const [path, query = ""] = (location.hash.replace(/^#/, "") || "/").split("?");
  return { path, query: new URLSearchParams(query) };
}

async function render({ quiet = false } = {}) {
  const id = ++renderId;
  const { path, query } = parseHash();
  const route = routes.find(([re]) => re.test(path));
  clearInterval(refreshTimer);
  banner.show(route?.[2] === "home");
  document.querySelectorAll(".nav a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.section === route?.[2]));
  if (!quiet) page.innerHTML = `<p class="loading">Loading…</p>`;
  try {
    if (!route) throw new Error("There's no page at this address. Use the search box, or go back home.");
    const result = await route[1](path.match(route[0]), query);
    if (id !== renderId) return; // a newer navigation started while this one loaded
    // Keep expanded rows expanded across live refreshes.
    const open = [...page.querySelectorAll("details")].flatMap((d, i) => (d.open ? [i] : []));
    page.innerHTML = result.html;
    mountCharts(page);
    if (quiet) open.forEach((i) => page.querySelectorAll("details")[i]?.setAttribute("open", ""));
    document.title = `${result.title} · ckb-devnet-explorer`;
    if (!quiet) { window.scrollTo(0, 0); page.focus({ preventScroll: true }); }
    if (result.refresh) refreshTimer = setInterval(() => render({ quiet: true }), 5000);
  } catch (err) {
    if (id !== renderId) return;
    page.innerHTML = `<div class="notice error"><p>${err.message.replace(/[<>&]/g, "")}</p></div><p><a href="#/">← Home</a></p>`;
    document.title = "Not found · ckb-devnet-explorer";
  }
}

// ---- node status in the top bar ----

let lastTip = null;
let lastResets = null;
async function pollNode() {
  const node = $("#node");
  try {
    const info = await api("/api/info");
    node.classList.add("up");
    node.classList.remove("down");
    node.title = `Connected to ${info.rpcUrl}`;
    $("#node-label").textContent = `#${int(info.tip)} · v${info.node.split(" ")[0]}`;
    if (lastTip !== null && info.tip !== lastTip) {
      node.classList.remove("tick");
      void node.offsetWidth;
      node.classList.add("tick");
    }
    // `offckb clean` wiped the chain while the page was open.
    if (lastResets !== null && info.resets !== lastResets) {
      toast("The devnet was reset. Showing the new chain.", 5000);
      render();
    }
    banner.setKnowledge(info.knowledgeSize?.bytes);
    lastTip = info.tip;
    lastResets = info.resets;
  } catch (err) {
    node.classList.add("down");
    node.classList.remove("up");
    node.title = err.message;
    $("#node-label").textContent = "offline";
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
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
    e.preventDefault();
    $("#q").focus();
  }
});

// ---- toasts, copy buttons, page-size selects ----

let toastTimer;
function toast(message, ms = 2600) {
  const t = $("#toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    toast("Couldn't copy. Select the text and copy it instead.");
  }
}

// The skip link can't use a #fragment: the hash is the router's.
$(".skip").addEventListener("click", (e) => {
  e.preventDefault();
  page.focus();
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy], [data-copy-url]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  if (btn.dataset.copy != null) return copy(btn.dataset.copy);
  // Copy what an API URL returns, pretty-printed (e.g. a transaction's raw JSON).
  try {
    const res = await fetch(btn.dataset.copyUrl);
    copy(JSON.stringify(await res.json(), null, 2));
  } catch (err) {
    toast(err.message);
  }
});

// The pager's "Page [ ] Goto" box.
document.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-goto]");
  if (!form) return;
  e.preventDefault();
  const p = Math.min(Number(form.dataset.pages), Math.max(1, Math.floor(Number(form.elements.p.value)) || 1));
  location.hash = form.dataset.goto.replace("{p}", p);
});

document.addEventListener("change", (e) => {
  if (e.target.matches("select[data-nav]")) location.hash = e.target.value;
});

window.addEventListener("hashchange", () => render());
render();
pollNode();
setInterval(pollNode, 4000);
