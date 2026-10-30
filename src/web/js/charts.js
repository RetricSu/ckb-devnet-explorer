// Small SVG charts, drawn to the width of their container. No library: the explorer has
// no build step and works offline. A chart is a <figure data-chart="line|bar"> whose
// data-series holds the points; mountCharts() draws every one on the page.
//
// Marks: 2px line with a 10% area wash; columns at most 24px wide with a 4px rounded top;
// 1px solid gridlines. Values are in the tooltip and in a visually hidden table.

const NS = "http://www.w3.org/2000/svg";
const PAD = { top: 10, right: 8, bottom: 22, left: 36 };

export function chartFigure({ kind, title, series, label, table }) {
  return `<figure class="chart" data-chart="${kind}" data-series='${JSON.stringify(series).replace(/'/g, "&#39;")}' aria-label="${title}">
    <figcaption>${title}</figcaption>
    <div class="chart-plot"></div>
    <div class="chart-tip" hidden></div>
    <table class="sr-only"><caption>${title}</caption><thead><tr><th>${label[0]}</th><th>${label[1]}</th></tr></thead>
      <tbody>${table.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</tbody></table>
  </figure>`;
}

const observers = new WeakMap();

export function mountCharts(root) {
  root.querySelectorAll("figure.chart").forEach((fig) => {
    const draw = () => (fig.dataset.chart === "bar" ? barChart : lineChart)(fig, JSON.parse(fig.dataset.series));
    draw();
    if (!observers.has(fig)) {
      let w = fig.clientWidth;
      const ro = new ResizeObserver(() => { if (fig.clientWidth !== w) { w = fig.clientWidth; draw(); } });
      ro.observe(fig);
      observers.set(fig, ro);
    }
  });
}

// Round the axis maximum up to 1, 2 or 5 times a power of ten.
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v);
}

const compact = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : `${+n.toFixed(n < 10 && n % 1 ? 1 : 0)}`);

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

function frame(fig, max) {
  const plot = fig.querySelector(".chart-plot");
  plot.textContent = "";
  const W = Math.max(200, plot.clientWidth);
  const H = Math.max(100, plot.clientHeight || 150);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "presentation" }, plot);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + ih - (v / max) * ih;
  // Three gridlines with their tick labels; the baseline is the last.
  for (const f of [1, 0.5, 0]) {
    el("line", { x1: PAD.left, x2: W - PAD.right, y1: y(max * f), y2: y(max * f), class: f ? "grid" : "base" }, svg);
    const t = el("text", { x: PAD.left - 6, y: y(max * f) + 4, class: "tick", "text-anchor": "end" }, svg);
    t.textContent = compact(max * f);
  }
  return { svg, W, H, iw, ih, y };
}

function xLabels(svg, W, H, first, last) {
  const a = el("text", { x: PAD.left, y: H - 4, class: "tick" }, svg);
  a.textContent = first;
  const b = el("text", { x: W - PAD.right, y: H - 4, class: "tick", "text-anchor": "end" }, svg);
  b.textContent = last;
}

function showTip(fig, x, lines) {
  const tip = fig.querySelector(".chart-tip");
  tip.textContent = "";
  lines.forEach(([strong, rest]) => {
    const row = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = strong;
    row.append(b, document.createTextNode(` ${rest}`));
    tip.append(row);
  });
  tip.hidden = false;
  const max = fig.clientWidth - tip.offsetWidth - 4;
  tip.style.left = `${Math.min(max, Math.max(4, x - tip.offsetWidth / 2))}px`;
}

// Block time: seconds between consecutive blocks.
function lineChart(fig, pts) {
  if (pts.length < 2) return;
  const max = niceMax(Math.max(...pts.map((p) => p.s)) * 1.1);
  const { svg, W, H, iw, ih, y } = frame(fig, max);
  const x = (i) => PAD.left + (i / (pts.length - 1)) * iw;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.s).toFixed(1)}`).join("");
  el("path", { d: `${d}L${x(pts.length - 1)},${PAD.top + ih}L${x(0)},${PAD.top + ih}Z`, class: "area" }, svg);
  el("path", { d, class: "line" }, svg);
  xLabels(svg, W, H, `#${pts[0].n.toLocaleString("en-US")}`, `#${pts.at(-1).n.toLocaleString("en-US")}`);

  // Crosshair: a hairline that snaps to the nearest block, with a ringed dot on the line.
  const cross = el("line", { y1: PAD.top, y2: PAD.top + ih, class: "cross", visibility: "hidden" }, svg);
  const dot = el("circle", { r: 4, class: "dot", visibility: "hidden" }, svg);
  const hit = el("rect", { x: PAD.left, y: 0, width: iw, height: H, fill: "transparent", tabindex: 0 }, svg);
  const at = (i) => {
    const p = pts[i];
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.s));
    cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
    showTip(fig, x(i), [[`${p.s.toFixed(2)} s`, `before block #${p.n.toLocaleString("en-US")}`]]);
  };
  let cur = pts.length - 1;
  hit.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    cur = Math.round(((e.clientX - r.left - PAD.left) / iw) * (pts.length - 1));
    at(Math.min(pts.length - 1, Math.max(0, cur)));
  });
  hit.addEventListener("focus", () => at(cur));
  hit.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { cur = Math.min(pts.length - 1, Math.max(0, cur + (e.key === "ArrowLeft" ? -1 : 1))); at(cur); }
  });
  const hide = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); fig.querySelector(".chart-tip").hidden = true; };
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("blur", hide);
}

// Activity: transactions per stretch of blocks. Each column is its own hover target.
function barChart(fig, buckets) {
  if (!buckets.length) return;
  const max = niceMax(Math.max(1, ...buckets.map((b) => b.txs)));
  const { svg, W, H, iw, y } = frame(fig, max);
  const slot = iw / buckets.length;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const base = y(0);
  buckets.forEach((b, i) => {
    const cx = PAD.left + slot * i + slot / 2;
    const h = base - y(b.txs);
    const r = Math.min(4, bw / 2, h);
    const x0 = cx - bw / 2;
    if (b.txs) {
      // Rounded at the data end, square at the baseline.
      el("path", { class: "bar", d: `M${x0},${base}V${base - h + r}Q${x0},${base - h} ${x0 + r},${base - h}H${x0 + bw - r}Q${x0 + bw},${base - h} ${x0 + bw},${base - h + r}V${base}Z` }, svg);
    }
    // The hit target is the whole slot, taller and wider than the column.
    const hit = el("rect", { x: PAD.left + slot * i, y: PAD.top, width: slot, height: base - PAD.top, fill: "transparent", class: "hit", tabindex: 0 }, svg);
    const show = () => {
      svg.querySelectorAll(".bar.on").forEach((e) => e.classList.remove("on"));
      hit.previousElementSibling?.classList?.contains("bar") && hit.previousElementSibling.classList.add("on");
      showTip(fig, cx, [[`${b.txs.toLocaleString("en-US")} transaction${b.txs === 1 ? "" : "s"}`, `in blocks ${b.from.toLocaleString("en-US")}–${b.to.toLocaleString("en-US")}`]]);
    };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("focus", show);
  });
  svg.addEventListener("pointerleave", () => { fig.querySelector(".chart-tip").hidden = true; svg.querySelectorAll(".bar.on").forEach((e) => e.classList.remove("on")); });
  xLabels(svg, W, H, `#${buckets[0].from.toLocaleString("en-US")}`, `#${buckets.at(-1).to.toLocaleString("en-US")}`);
}
