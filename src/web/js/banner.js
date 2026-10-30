// The home banner, the devnet's take on the CKB Explorer's "Knowledge Size" banner.
//
// Background: Conway's Game of Life on a grid of squares, the motif of the Nervos brand's
// "Cell Model" (a grid of squares whose movement hints at cells being added, re-created
// and dismantled). A newborn square lights up in the primary colour, then settles into a
// faint white; a dying one fades out. It pauses when hidden or off screen, and draws a
// single still frame for people who prefer reduced motion.
//
// Foreground: two slides that rotate every 9 seconds (paused on hover or focus).

const CELL = 16; // grid pitch: a 14px square and a 2px gap
const STEP_MS = 240;
const BLUE = [52, 109, 255];

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

export function initBanner(root) {
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const slides = [...root.querySelectorAll(".slide")];
  const dots = [...root.querySelectorAll("[data-go]")];
  const number = root.querySelector("#knowledge");

  // ---- the grid ----
  let cols = 0, rows = 0, alive, age, fade, gen = 0;
  const idx = (x, y) => ((y + rows) % rows) * cols + ((x + cols) % cols);

  function seed(density = 0.2) {
    for (let i = 0; i < alive.length; i++) {
      alive[i] = Math.random() < density ? 1 : 0;
      age[i] = alive[i] ? 8 : 0;
    }
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = root.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = Math.ceil(width / CELL), r = Math.ceil(height / CELL);
    if (c !== cols || r !== rows) {
      cols = c; rows = r;
      alive = new Uint8Array(cols * rows);
      age = new Uint16Array(cols * rows);
      fade = new Float32Array(cols * rows);
      seed();
    }
    draw();
  }

  // A glider somewhere, so the board never settles into still life for long.
  function glider() {
    const x = Math.floor(Math.random() * cols), y = Math.floor(Math.random() * rows);
    const shape = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
    const flipX = Math.random() < 0.5 ? -1 : 1, flipY = Math.random() < 0.5 ? -1 : 1;
    for (const [dx, dy] of shape) { const i = idx(x + dx * flipX, y + dy * flipY); alive[i] = 1; age[i] = 0; }
  }

  function step() {
    const next = new Uint8Array(alive.length);
    let count = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += alive[idx(x + dx, y + dy)];
        const i = y * cols + x;
        const lives = n === 3 || (n === 2 && alive[i]);
        next[i] = lives ? 1 : 0;
        if (lives) { age[i] = alive[i] ? Math.min(age[i] + 1, 999) : 0; count++; }
        else if (alive[i]) { fade[i] = 1; age[i] = 0; }
      }
    }
    alive = next;
    gen++;
    if (gen % 30 === 0) glider();
    // Reseed when the board has mostly died out.
    if (count < cols * rows * 0.03) seed(0.18);
  }

  function draw() {
    const w = cols * CELL, h = rows * CELL;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < alive.length; i++) {
      const x = (i % cols) * CELL, y = Math.floor(i / cols) * CELL;
      if (alive[i]) {
        // Newborn: primary blue, fading to a faint white over a few generations.
        const t = Math.min(1, age[i] / 6);
        const r = Math.round(BLUE[0] + (255 - BLUE[0]) * t), g = Math.round(BLUE[1] + (255 - BLUE[1]) * t), b = 255;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.55 - 0.42 * t})`;
        ctx.fillRect(x, y, CELL - 2, CELL - 2);
      } else if (fade[i] > 0.02) {
        ctx.fillStyle = `rgba(255,255,255,${0.12 * fade[i]})`;
        ctx.fillRect(x, y, CELL - 2, CELL - 2);
        fade[i] *= 0.7;
      }
    }
  }

  // ---- animation loop, only while visible ----
  let running = false, onScreen = true, last = 0;
  const shouldRun = () => !root.hidden && onScreen && !document.hidden && !reduced.matches;
  function frame(t) {
    if (!shouldRun()) { running = false; return; }
    if (t - last >= STEP_MS) { last = t; step(); draw(); }
    requestAnimationFrame(frame);
  }
  function wake() {
    if (!running && shouldRun()) { running = true; requestAnimationFrame(frame); }
  }
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); }).observe(root);
  document.addEventListener("visibilitychange", wake);
  reduced.addEventListener?.("change", wake);
  new ResizeObserver(() => { if (!root.hidden) resize(); }).observe(root);

  // ---- slides ----
  let current = 0, timer = null, paused = false;
  function go(n) {
    current = (n + slides.length) % slides.length;
    slides.forEach((s, i) => { s.classList.toggle("is-active", i === current); s.inert = i !== current; });
    dots.forEach((d, i) => d.setAttribute("aria-pressed", String(i === current)));
  }
  function schedule() {
    clearInterval(timer);
    timer = setInterval(() => { if (!paused && !root.hidden) go(current + 1); }, 9000);
  }
  dots.forEach((d) => d.addEventListener("click", () => { go(Number(d.dataset.go)); schedule(); }));
  root.addEventListener("pointerenter", () => (paused = true));
  root.addEventListener("pointerleave", () => (paused = false));
  root.addEventListener("focusin", () => (paused = true));
  root.addEventListener("focusout", () => (paused = false));
  go(0);
  schedule();

  // ---- the Knowledge Size number, ticking towards each new value ----
  let shown = null, tick = null;
  function setKnowledge(value) {
    if (value == null) return;
    const from = shown ?? Math.max(0, value - Math.min(value, 2000));
    if (from === value) return;
    cancelAnimationFrame(tick);
    const start = performance.now(), dur = reduced.matches ? 0 : 1200;
    const run = (t) => {
      const p = dur ? Math.min(1, (t - start) / dur) : 1;
      const v = Math.round(from + (value - from) * (1 - (1 - p) ** 3));
      number.textContent = v.toLocaleString("en-US");
      if (p < 1) tick = requestAnimationFrame(run);
    };
    shown = value;
    tick = requestAnimationFrame(run);
  }

  return {
    show(visible) {
      if (root.hidden === !visible) return;
      root.hidden = !visible;
      if (visible) { resize(); wake(); }
    },
    setKnowledge,
  };
}
