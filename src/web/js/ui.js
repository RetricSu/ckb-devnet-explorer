// Small rendering helpers shared by every page. Everything returns HTML strings.
// Components follow the CKB Explorer's design system; see the note at the top of style.css.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Hashes and addresses are shortened in the middle with "...", as the CKB Explorer does.
export const short = (h, head = 10, tail = 8) => (h.length > head + tail + 3 ? `${h.slice(0, head)}...${h.slice(-tail)}` : h);

export async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

// ---- numbers & time ----

// 1,234.56789000 CKB: always 8 decimals, the decimals smaller and grey.
export function ckb(shannons, { unit = true } = {}) {
  const v = BigInt(shannons);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = (a / 100000000n).toLocaleString("en-US");
  const frac = (a % 100000000n).toString().padStart(8, "0");
  return `<span class="amount">${neg ? "−" : ""}${whole}<span class="dec">.${frac}</span>${unit ? '<span class="unit">CKB</span>' : ""}</span>`;
}

export const int = (n) => Number(n).toLocaleString("en-US");
export const plural = (n, word) => `${int(n)} ${word}${n === 1 ? "" : "s"}`;

export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// 2026/10/30 13:09:28, the format the CKB Explorer uses.
export function stamp(ms) {
  if (ms == null) return "—";
  if (ms === 0) return "Genesis";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Relative time in a <time> element, with the exact time on hover.
// The devnet's genesis block has timestamp 0, which would read as "20000d ago".
export function when(ms) {
  if (ms == null) return "—";
  if (ms === 0) return "Genesis";
  return `<time datetime="${new Date(ms).toISOString()}" title="${stamp(ms)}">${ago(ms)}</time>`;
}

// ---- links ----

export const txLink = (h, { head = 10, tail = 8 } = {}) => `<a class="mono" href="#/tx/${h}" title="${h}">${short(h, head, tail)}</a>`;
export const blockLink = (n) => `<a href="#/block/${n}">${int(n)}</a>`;
export const addrLink = (a, { head = 13, tail = 8 } = {}) => `<a class="mono" href="#/address/${a}" title="${a}">${short(a, head, tail)}</a>`;
export const outPointLink = (op) => `<a class="mono" href="#/tx/${op.txHash}" title="${op.txHash}:${op.index}">${short(op.txHash, 8, 6)}:${op.index}</a>`;

export function sourceBadge(source) {
  if (!source) return "";
  return `<span class="source${source === "genesis" ? "" : " mine"}" title="${source === "genesis" ? "Built into the devnet" : `From your project ${esc(source)}`}">${esc(source)}</span>`;
}

// A script, named when we know it, linking to its script page.
export function scriptName(s, { badge = true } = {}) {
  const r = s.resolved ?? {};
  if (!r.name) return `<a class="mono" href="#/script/${s.code_hash}/${s.hash_type}" title="Unknown script ${s.code_hash}">unknown ${short(s.code_hash, 8, 4)}</a>`;
  const target = r.inner?.name ? r.inner : r;
  const link = `<a class="script-name" href="#/script/${s.code_hash}/${s.hash_type}">${esc(target.name)}</a>`;
  return `${link}${badge ? ` ${sourceBadge(target.source)}` : ""}${r.inner ? ` <span class="via">run by ${esc(r.name)}</span>` : ""}`;
}

const ICONS = {
  copy: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="6.5" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 13V4.5a1 1 0 0 1 1-1H13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  download: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  json: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4c-2 0-2 1.5-2 3s0 3-1.5 3C5 10 5 11.5 5 13s0 3 2 3M13 4c2 0 2 1.5 2 3s0 3 1.5 3C15 10 15 11.5 15 13s0 3-2 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11m0 0-4-4m4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  blocks: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 7h4a2 2 0 0 1 2 2v4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  txs: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14m0 0-4-4m4 4-4 4M20 16H6m0 0 4-4m-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
export const icon = (name) => ICONS[name];

export const copyBtn = (value, label) =>
  `<button class="copy" type="button" data-copy="${esc(value)}" aria-label="Copy ${esc(label)}" title="Copy ${esc(label)}">${ICONS.copy}</button>`;

export const iconBtn = (name, label, attrs) =>
  `<button class="icon-btn" type="button" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${ICONS[name]}</button>`;
export const iconLink = (name, label, attrs) =>
  `<a class="icon-btn" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${ICONS[name]}</a>`;

export const tip = (text) => `<span class="tip" title="${esc(text)}" aria-label="${esc(text)}"></span>`;

// ---- layout pieces ----

// The first card of a detail page: "Transaction  0x...  [copy] [download]", then label/value columns.
export function detailCard({ title, hash, hashText, small = false, status, actions = "", nav = "", left = [], right = [], extra = "" }) {
  return `<section class="card">
    <header class="hash-head">
      <h1>${title}</h1>
      ${hash ? `<span class="hash${small ? " small" : ""}">${esc(hashText ?? hash)}</span>` : ""}
      <span class="actions">${hash ? copyBtn(hash, title.toLowerCase()) : ""}${actions}</span>
      ${status ? `<span class="status-wrap">${status}</span>` : ""}
      ${nav ? `<span class="nav-btns">${nav}</span>` : ""}
    </header>
    ${left.length || right.length ? kv(left, right) : ""}
    ${extra}
  </section>`;
}

// Two columns of label/value rows split by a rule. Rows: [label, value, tipText?].
export function kv(left, right = []) {
  const col = (rows) => `<dl class="kv-col">${rows.filter(Boolean).map(([k, v, t]) =>
    `<div class="kv-row"><dt>${k}${t ? tip(t) : ""}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  return `<div class="kv">${col(left)}${right.length ? col(right) : ""}</div>`;
}

// A white card with a title row. flush: the body (a table) runs edge to edge.
export function card({ title, count, aside, body, empty, flush = false, foot = "" }) {
  const hasBody = body && body.trim();
  return `<section class="card${flush ? " flush" : ""}">
    ${title ? `<div class="card-head"><h2>${title}</h2>${count != null ? `<span class="count">(${count})</span>` : ""}${aside ? `<span class="aside">${aside}</span>` : ""}</div>` : ""}
    ${hasBody ? body : `<p class="card-empty">${empty ?? "Nothing here yet."}</p>`}
    ${foot}
  </section>`;
}

export const tags = (list) => (list?.length ? `<span class="tags">${list.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span>` : "");

// What a transaction did, for list rows: its tags, or a plain description.
export const txKind = (t) => tags(t.tags) || `<span class="muted">${t.blockNumber === 0 ? "Genesis" : "CKB transfer"}</span>`;

// A table. rows: array of <tr> strings. cols: [label, className?].
export function table(cols, rows) {
  return `<div class="table-scroll"><table class="table">
    <thead><tr>${cols.map(([label, cls]) => `<th${cls ? ` class="${cls}"` : ""}>${label}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table></div>`;
}

export const progress = (fraction, label) =>
  `<span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fraction * 100)}" aria-label="${esc(label)}"><i style="width:${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%"></i></span>`;

// Tabs are plain links, so every tab has its own URL.
export function tabs(items) {
  return `<nav class="tabs" aria-label="Views">${items.map(({ label, href, current }) =>
    `<a href="${href}"${current ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
}

// Their pager: First ‹ Page 1 of N › Last · Show rows · Page [ ] Goto.
// base is the route without a query string, e.g. "#/blocks".
export function pager({ page, pages, size }, base, extra = "") {
  const href = (p, s = size) => `${base}?${extra ? `${extra}&` : ""}page=${p}&size=${s}`;
  const link = (p, label, aria) => p < 1 || p > pages || p === page
    ? `<span class="btn" aria-disabled="true">${label}</span>`
    : `<a class="btn" href="${href(p)}" aria-label="${aria}">${label}</a>`;
  const sizes = [10, 20, 50, 100].map((s) => `<option value="${href(1, s)}"${s === size ? " selected" : ""}>${s}</option>`).join("");
  return `<div class="pager">
    <span class="pager-links">
      ${link(1, "First", "First page")}${link(page - 1, "‹", "Previous page")}
      <span class="pager-pos">Page ${int(page)} of ${int(pages)}</span>
      ${link(page + 1, "›", "Next page")}${link(pages, "Last", "Last page")}
    </span>
    <label>Show rows <select data-nav aria-label="Rows per page">${sizes}</select></label>
    <form data-goto="${esc(href("{p}"))}" data-pages="${pages}"><label>Page <input name="p" inputmode="numeric" aria-label="Page number"></label><button class="btn" type="submit">Goto</button></form>
  </div>`;
}

// A signed CKB amount: primary when an address gains, red when it pays.
export function delta(shannons) {
  const v = BigInt(shannons);
  if (v === 0n) return ckb(0n);
  return `<span class="delta ${v > 0n ? "pos" : "neg"}">${v > 0n ? "+" : ""}${ckb(v)}</span>`;
}

export const tokenDelta = (amount) => {
  const v = BigInt(amount);
  return `<span class="delta ${v > 0n ? "pos" : "neg"}">${v > 0n ? "+" : "−"}${(v > 0n ? v : -v).toLocaleString("en-US")}</span>`;
};

// ---- since (RFC 0017) ----

export function sinceText(s) {
  if (!s || s.kind === "none") return "";
  const rel = s.relative ? "relative" : "absolute";
  switch (s.kind) {
    case "block": return s.relative ? `${int(s.value)} blocks after the cell was created` : `not before block #${int(s.value)}`;
    case "epoch": return `${rel}: epoch ${int(s.number)}${s.length ? ` + ${s.index}/${s.length}` : ""}`;
    case "timestamp": return s.relative ? `${int(s.seconds)} s after the cell was created` : `not before ${new Date(s.seconds * 1000).toLocaleString()}`;
    default: return `unreadable since ${esc(s.raw)}`;
  }
}

// ---- the capacity bar: what a cell's capacity pays for (1 CKB pays for 1 byte) ----

export function capacityParts(cell) {
  return [
    ["head", 8, "capacity field"],
    ["lock", cell.lock.bytes, "lock"],
    ...(cell.type ? [["type", cell.type.bytes, "type"]] : []),
    ...(cell.dataLength ? [["data", cell.dataLength, "data"]] : []),
  ];
}

export function capacityBar(cell, { mini = false } = {}) {
  const capacityBytes = Number(BigInt(cell.capacity) / 100000000n);
  const free = Math.max(0, capacityBytes - cell.occupied);
  // Change cells hold millions of CKB; drawn to scale their bytes would vanish.
  // Past 3x the used bytes, the free part is cut short and marked with a break.
  const compressed = free > cell.occupied * 3;
  const segs = capacityParts(cell).map(([k, n, label]) => `<span class="s-${k}" style="flex:${n}" title="${n} B ${label}"></span>`).join("");
  const tail = free > 0
    ? `${compressed ? '<span class="s-break" aria-hidden="true"></span>' : ""}<span class="s-free" style="flex:${compressed ? cell.occupied * 1.5 : free}" title="unused capacity"></span>`
    : "";
  return `<div class="capbar${mini ? " mini" : ""}" role="img" aria-label="${cell.occupied} bytes used of ${int(capacityBytes)} CKB capacity">${segs}${tail}</div>`;
}

function capacityLegend(cell) {
  const colors = { head: "var(--head)", lock: "var(--lock)", type: "var(--type)", data: "var(--data)" };
  const freeShannons = BigInt(cell.capacity) - BigInt(cell.occupied) * 100000000n;
  return `<div class="cap-legend">${capacityParts(cell).map(([k, n, label]) => `<span><i style="background:${colors[k]}"></i>${n} B ${label}</span>`).join("")}
    <span>= ${int(cell.occupied)} B used</span>
    <span>${freeShannons > 0n ? `${ckb(freeShannons)} unused` : "no unused capacity"}</span></div>`;
}

// ---- what a cell holds ----

// The cell's data as text, if every byte we have is printable ASCII.
function dataText(cell) {
  if (!cell.dataLength) return null;
  const bytes = (cell.dataPreview.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16));
  if (!bytes.length || !bytes.every((b) => b === 10 || (b >= 32 && b < 127))) return null;
  return String.fromCharCode(...bytes) + (cell.dataLength > bytes.length ? "…" : "");
}

// The "Detail" column: what the cell is, in a few words.
export function decodedSummary(d, cell) {
  if (!d) {
    const text = dataText(cell);
    if (text !== null) return `<span class="chip">Text</span><span class="summary mono">"${esc(text)}"</span>`;
    if (cell.dataLength) return `<span class="summary">${int(cell.dataLength)} bytes of data</span>`;
    return `<span class="summary">CKB Capacity</span>`;
  }
  switch (d.kind) {
    case "code": return `<span class="chip k-code">Code</span><span class="summary">${esc(d.name)}</span>`;
    case "dao-deposit": return `<span class="chip k-dao-deposit">Nervos DAO</span><span class="summary">Deposit</span>`;
    case "dao-withdrawing": return `<span class="chip k-dao-withdrawing">Nervos DAO</span><span class="summary">Withdrawing, deposited at #${int(d.depositBlock)}</span>`;
    case "udt": return `<span class="chip k-udt">${d.standard}</span><span class="summary"><b>${BigInt(d.amount).toLocaleString("en-US")}</b> units</span>`;
    case "spore": return `<span class="chip k-spore">Spore</span><span class="summary">${d.text !== undefined ? esc(d.text) : esc(d.contentType)}</span>`;
    case "cluster": return `<span class="chip k-cluster">Cluster</span><span class="summary">${esc(d.name)}</span>`;
    case "type-id": return `<span class="chip">Type ID</span><span class="summary mono">${short(d.id, 8, 4)}</span>`;
    case "invalid": return `<span class="chip k-invalid">Bad ${esc(d.standard)}</span>`;
  }
  return "";
}

function decodedDetail(d) {
  if (!d) return "";
  let body = "";
  switch (d.kind) {
    case "code":
      body = `<div><span class="chip k-code">Contract code</span> <a class="script-name" href="#/script/${d.codeHash}/${d.hashType}">${esc(d.name)}</a> ${sourceBadge(d.source)}</div>
        <p>Scripts named ${esc(d.name)} load their code from this cell. Matched by ${d.matchedBy}.</p>`;
      break;
    case "dao-deposit":
      body = `<div><span class="chip k-dao-deposit">Nervos DAO deposit</span></div><p>Data is 8 zero bytes, so no withdrawal has been requested yet. The unused capacity is what earns DAO compensation.</p>`;
      break;
    case "dao-withdrawing":
      body = `<div><span class="chip k-dao-withdrawing">Nervos DAO withdrawal requested</span></div><p>Deposited at block <a href="#/block/${d.depositBlock}">#${int(d.depositBlock)}</a>. The final withdrawal can happen once the lock period ends.</p>`;
      break;
    case "udt":
      body = `<div class="big">${BigInt(d.amount).toLocaleString("en-US")} <small class="muted">units</small></div>
        <p>${d.standard} token, identified by this cell's type script. Issued by the lock with hash <span class="mono">${esc(d.owner)}</span>${d.extraBytes ? `. ${d.extraBytes} extra bytes after the amount.` : "."}</p>`;
      break;
    case "spore":
      body = `<div><span class="chip k-spore">Spore</span> ${esc(d.contentType)} · ${int(d.contentLength)} bytes</div>
        ${d.text !== undefined ? `<div class="spore-text">${esc(d.text)}</div>` : ""}
        ${d.clusterId ? `<p>In cluster <span class="mono">${esc(d.clusterId)}</span></p>` : ""}`;
      break;
    case "cluster":
      body = `<div><span class="chip k-cluster">Spore cluster</span> <b>${esc(d.name)}</b></div><p>${esc(d.description)}</p>`;
      break;
    case "type-id":
      body = `<div><span class="chip">Type ID</span> <span class="mono">${esc(d.id)}</span></div><p>A stable id that stays the same when this cell's contents are upgraded.</p>`;
      break;
    case "invalid":
      body = `<div><span class="chip k-invalid">Doesn't match ${esc(d.standard)}</span></div><p>${esc(d.reason)}</p>`;
      break;
  }
  return `<div class="detail-block"><h3>Contents</h3><div class="decoded">${body}</div></div>`;
}

function dataView(cell) {
  if (!cell.dataLength) return "";
  const hex = cell.dataPreview.slice(2);
  const bytes = (hex.match(/../g) ?? []).map((b) => parseInt(b, 16));
  const printable = bytes.length > 0 && bytes.every((b) => b === 10 || (b >= 32 && b < 127));
  const shown = hex.length > 128 ? hex.slice(0, 128) + "…" : hex;
  return `<div class="script-row data"><span class="role">Data</span><div>${int(cell.dataLength)} bytes
    ${printable ? `<span class="via">"${esc(String.fromCharCode(...bytes))}"</span>` : ""}
    <span class="args">0x${shown}</span></div></div>`;
}

function rawFields(cell) {
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const script = (label, s) => (s ? row(`${label} code hash`, s.code_hash) + row(`${label} hash type`, s.hash_type) + row(`${label} args`, s.args) + row(`${label} script hash`, s.hash) : "");
  return `<details class="raw detail-block"><summary>Raw fields</summary><dl>
    ${row("Out point", cell.outPoint ? `${cell.outPoint.txHash}:${cell.outPoint.index}` : "—")}
    ${cell.since ? row("Since", cell.since.kind === "none" ? "0 (no time lock)" : esc(sinceText(cell.since))) : ""}
    ${row("Capacity", `${BigInt(cell.capacity).toLocaleString("en-US")} shannons`)}
    ${row("Address", cell.address)}
    ${script("Lock", cell.lock)}${script("Type", cell.type)}
    ${row("Data", cell.dataLength ? `${int(cell.dataLength)} bytes${cell.dataLength > 256 ? " (first 256 shown)" : ""}: ${cell.dataPreview}` : "0x")}
    ${cell.dataHash ? row("Data hash", cell.dataHash) : ""}
  </dl></details>`;
}

const chevron = `<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Inputs show where the cell came from; outputs whether it's live or who spent it.
function stateCell(cell, role) {
  if (role === "input") {
    const since = sinceText(cell.since);
    return `<span class="from">${cell.outPoint ? `from ${outPointLink(cell.outPoint)}` : ""}${since ? `<span class="since" title="This input can't be spent before this point (since field)">⏱ ${since}</span>` : ""}</span>`;
  }
  const s = cell.status;
  if (!s) return "";
  if (s.state === "live") return `<span class="live-dot" title="Not consumed by any transaction yet">Live</span>`;
  if (s.state === "pending") return `<span class="status wait">Pending</span>`;
  return s.by ? `<a class="spent-link" href="#/tx/${s.by}" title="Consumed by ${s.by}">Spent by <b>${short(s.by, 6, 4)}</b></a>` : `<span class="muted">Spent</span>`;
}

// One cell as an expandable row: the summary is scannable, the detail is everything.
export function cellRow(cell, i, { role = "output", open = false } = {}) {
  if (cell.unresolved) return `<li class="cell"><div class="cell-note">${esc(cell.unresolved)}</div></li>`;
  const lockName = cell.lock.resolved?.inner?.name ?? cell.lock.resolved?.name;
  // Inputs get the CKB Explorer's arrow, linking back to the transaction that created the cell.
  const arrow = role === "input" && cell.outPoint
    ? `<a class="arrow" href="#/tx/${cell.outPoint.txHash}" title="Created in ${cell.outPoint.txHash}" aria-label="Go to the transaction that created this cell">${ICONS.arrow}</a>`
    : "";
  return `<li><details class="cell"${open ? " open" : ""}>
    <summary>
      <span class="cell-idx">#${i}</span>
      <span class="cell-owner">${arrow}<span class="who"><span class="addr">${addrLink(cell.address)}</span><span class="lockname">${esc(lockName ?? "unknown lock")}</span></span></span>
      <span class="cell-what">${decodedSummary(cell.decoded, cell)}</span>
      <span class="cell-cap">${ckb(cell.capacity)}${capacityBar(cell, { mini: true })}</span>
      <span class="cell-state">${stateCell(cell, role)}</span>
      ${chevron}
    </summary>
    <div class="cell-detail">
      <div class="detail-block"><h3>Capacity usage</h3>${capacityBar(cell)}${capacityLegend(cell)}</div>
      ${decodedDetail(cell.decoded)}
      <div class="detail-block"><h3>Scripts</h3><div class="scripts">
        <div class="script-row lock"><span class="role">Lock</span><div>${scriptName(cell.lock)}<span class="args">${cell.address}</span></div></div>
        ${cell.type ? `<div class="script-row type"><span class="role">Type</span><div>${scriptName(cell.type)}<span class="args">args ${esc(cell.type.args === "0x" ? "0x (empty)" : cell.type.args)}</span></div></div>` : ""}
        ${["code", "spore", "cluster"].includes(cell.decoded?.kind) ? "" : dataView(cell)}
      </div></div>
      ${rawFields(cell)}
    </div>
  </details></li>`;
}

// The CKB Explorer's Input/Output card: "Input (3)   Detail   Capacity/Amount" over the rows.
export function cellCard(title, cells, { role = "output", openAll = false, aside = "" } = {}) {
  return `<section class="card">
    <div class="cells-head"><span class="t">${title} (${cells.length})</span><span>Detail</span><span>Capacity/Amount</span><span class="aside">${aside}</span><span></span></div>
    <ul class="cells">${cells.map((c, i) => cellRow(c, i, { role, open: openAll })).join("")}</ul>
  </section>`;
}

export const cellList = (cells, opts = {}) =>
  `<ul class="cells">${cells.map((c, i) => cellRow(c, opts.indexFrom != null ? opts.indexFrom + i : i, { ...opts, open: opts.openAll ?? false })).join("")}</ul>`;
