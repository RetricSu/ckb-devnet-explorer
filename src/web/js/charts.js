// Small SVG charts, drawn to the width of their container. No library: the explorer has
// no build step and works offline. A chart is a <figure data-chart="line|bar"> whose
// data-series holds { points: [{ y, tip: [value, context] }], first, last }; mountCharts()
// draws every one on the page.
//
// Marks: 2px line with a 10% area wash; columns at most 24px wide with a 4px rounded top;
// 1px solid gridlines. Values are in the tooltip and in a visually hidden table.

const NS = "http://www.w3.org/2000/svg";
const PAD = { top: 10, right: 8, bottom: 22, left: 44 };

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");

// light: for white cards (the Charts page); otherwise drawn for the dark home dashboard.
export function chartFigure({ kind, title, points, first, last, label, table, light = false, height = 150 }) {
  return `<figure class="chart${light ? " light" : ""}" data-chart="${kind}" data-series='${escAttr(JSON.stringify({ points, first, last }))}' aria-label="${escAttr(title)}">
    <figcaption>${title}</figcaption>
    <div class="chart-plot" style="height:${height}px;min-height:${height}px"></div>
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

function compact(n) {
  const units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [d, u] of units) if (n >= d) return `${+(n / d).toFixed(1)}${u}`;
  return `${+n.toFixed(n < 10 && n % 1 ? 1 : 0)}`;
}

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

function frame(fig, min, max) {
  const plot = fig.querySelector(".chart-plot");
  plot.textContent = "";
  const W = Math.max(200, plot.clientWidth);
  const H = Math.max(100, plot.clientHeight || 150);
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "presentation" }, plot);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + ih - ((v - min) / (max - min || 1)) * ih;
  // Three gridlines with their tick labels; the bottom one is the baseline.
  for (const f of [1, 0.5, 0]) {
    const v = min + (max - min) * f;
    el("line", { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: f ? "grid" : "base" }, svg);
    const t = el("text", { x: PAD.left - 6, y: y(v) + 4, class: "tick", "text-anchor": "end" }, svg);
    t.textContent = compact(v);
  }
  return { svg, W, H, iw, ih, y };
}

function xLabels(svg, W, H, first, last) {
  const a = el("text", { x: PAD.left, y: H - 4, class: "tick" }, svg);
  a.textContent = first;
  const b = el("text", { x: W - PAD.right, y: H - 4, class: "tick", "text-anchor": "end" }, svg);
  b.textContent = last;
}

function showTip(fig, x, [strong, rest]) {
  const tip = fig.querySelector(".chart-tip");
  tip.textContent = "";
  const b = document.createElement("b");
  b.textContent = strong;
  tip.append(b, document.createTextNode(` ${rest}`));
  tip.hidden = false;
  const max = fig.clientWidth - tip.offsetWidth - 4;
  tip.style.left = `${Math.min(max, Math.max(4, x - tip.offsetWidth / 2))}px`;
}

function lineChart(fig, { points, first, last }) {
  if (points.length < 2) return;
  const ys = points.map((p) => p.y);
  // Values far from zero (Knowledge Size) get an axis that starts near them, so change shows.
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const min = lo > 0 && lo > (hi - lo) * 4 ? Math.floor(lo - (hi - lo) * 0.2) : 0;
  const max = min ? Math.ceil(hi + (hi - lo) * 0.2) || hi + 1 : niceMax(hi * 1.1);
  const { svg, W, H, iw, ih, y } = frame(fig, min, max);
  const x = (i) => PAD.left + (i / (points.length - 1)) * iw;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  el("path", { d: `${d}L${x(points.length - 1)},${PAD.top + ih}L${x(0)},${PAD.top + ih}Z`, class: "area" }, svg);
  el("path", { d, class: "line" }, svg);
  xLabels(svg, W, H, first, last);

  // Crosshair: a hairline that snaps to the nearest point, with a ringed dot on the line.
  const cross = el("line", { y1: PAD.top, y2: PAD.top + ih, class: "cross", visibility: "hidden" }, svg);
  const dot = el("circle", { r: 4, class: "dot", visibility: "hidden" }, svg);
  const hit = el("rect", { x: PAD.left, y: 0, width: iw, height: H, fill: "transparent", tabindex: 0 }, svg);
  const at = (i) => {
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(points[i].y));
    cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
    showTip(fig, x(i), points[i].tip);
  };
  let cur = points.length - 1;
  hit.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    cur = Math.min(points.length - 1, Math.max(0, Math.round(((e.clientX - r.left - PAD.left) / iw) * (points.length - 1))));
    at(cur);
  });
  hit.addEventListener("focus", () => at(cur));
  hit.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { cur = Math.min(points.length - 1, Math.max(0, cur + (e.key === "ArrowLeft" ? -1 : 1))); at(cur); }
  });
  const hide = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); fig.querySelector(".chart-tip").hidden = true; };
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("blur", hide);
}

// Columns, each its own hover target.
function barChart(fig, { points, first, last }) {
  if (!points.length) return;
  const max = niceMax(Math.max(1, ...points.map((p) => p.y)));
  const { svg, W, H, iw, y } = frame(fig, 0, max);
  const slot = iw / points.length;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const base = y(0);
  points.forEach((p, i) => {
    const cx = PAD.left + slot * i + slot / 2;
    const h = base - y(p.y);
    const r = Math.min(4, bw / 2, h);
    const x0 = cx - bw / 2;
    let bar = null;
    if (p.y) {
      // Rounded at the data end, square at the baseline.
      bar = el("path", { class: "bar", d: `M${x0},${base}V${base - h + r}Q${x0},${base - h} ${x0 + r},${base - h}H${x0 + bw - r}Q${x0 + bw},${base - h} ${x0 + bw},${base - h + r}V${base}Z` }, svg);
    }
    // The hit target is the whole slot, taller and wider than the column.
    const hit = el("rect", { x: PAD.left + slot * i, y: PAD.top, width: slot, height: base - PAD.top, fill: "transparent", class: "hit", tabindex: 0 }, svg);
    const show = () => {
      svg.querySelectorAll(".bar.on").forEach((e) => e.classList.remove("on"));
      bar?.classList.add("on");
      showTip(fig, cx, p.tip);
    };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("focus", show);
  });
  svg.addEventListener("pointerleave", () => { fig.querySelector(".chart-tip").hidden = true; svg.querySelectorAll(".bar.on").forEach((e) => e.classList.remove("on")); });
  xLabels(svg, W, H, first, last);
}
