// Small rendering helpers shared by every page. Everything returns HTML strings.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const short = (h, head = 10, tail = 6) => (h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);

export async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

// ---- numbers & time ----

export function ckb(shannons, { unit = true } = {}) {
  const v = BigInt(shannons);
  const whole = (v / 100000000n).toLocaleString("en-US");
  const frac = (v % 100000000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${whole}${frac ? `<span class="frac">.${frac}</span>` : ""}${unit ? ' <small class="muted">CKB</small>' : ""}`;
}

export const int = (n) => Number(n).toLocaleString("en-US");

export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function when(ms) {
  if (ms == null) return "—";
  const d = new Date(ms);
  return `<time datetime="${d.toISOString()}" title="${d.toLocaleString()}">${ago(ms)}</time>`;
}

export const absolute = (ms) => (ms == null ? "—" : new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }));

// ---- links ----

export const txLink = (h, { head, tail } = {}) => `<a class="mono" href="#/tx/${h}" title="${h}">${short(h, head, tail)}</a>`;
export const blockLink = (n) => `<a class="mono" href="#/block/${n}">#${int(n)}</a>`;
export const addrLink = (a, { full = false } = {}) => `<a class="mono" href="#/address/${a}" title="${a}">${full ? a : short(a, 14, 8)}</a>`;
export const outPointLink = (op) => `<a class="mono" href="#/tx/${op.txHash}" title="${op.txHash}:${op.index}">${short(op.txHash, 8, 4)}:${op.index}</a>`;

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

export const copyBtn = (value, label) =>
  `<button class="copy" type="button" data-copy="${esc(value)}" aria-label="Copy ${esc(label)}" title="Copy ${esc(label)}"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>`;

// ---- layout pieces ----

export function pageHead({ eyebrow, title, hash, sub, aside }) {
  return `<header class="page-head">
    <p class="eyebrow">${eyebrow}</p>
    <h1 class="title${hash ? " hash" : ""}">${title}${hash ? copyBtn(hash, eyebrow.replace(/<[^>]+>/g, "").trim().toLowerCase()) : ""}${aside ? `<span class="page-nav">${aside}</span>` : ""}</h1>
    ${sub ? `<p class="subtitle">${sub}</p>` : ""}
  </header>`;
}

export function facts(items, cols = 3) {
  const list = items.filter(Boolean);
  return `<div class="panel facts-wrap"><dl class="facts${cols === 4 ? " cols-4" : ""}">${list.map(([k, v, title]) =>
    `<div class="fact"${title ? ` title="${esc(title)}"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl></div>`;
}

export function panel({ title, count, aside, body, empty }) {
  const hasBody = body && body.trim();
  return `<section class="panel">
    <div class="panel-head"><h2>${title}</h2>${count != null ? `<span class="count">${count}</span>` : ""}${aside ? `<span class="aside">${aside}</span>` : ""}</div>
    ${hasBody ? body : `<p class="panel-empty">${empty ?? "Nothing here yet."}</p>`}
  </section>`;
}

export const tags = (list) => (list?.length ? `<span class="tags">${list.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span>` : "");

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

export function decodedSummary(d, cell) {
  if (!d) {
    const text = dataText(cell);
    if (text !== null) return `<span class="chip k-plain">Text</span><span class="summary mono">"${esc(text)}"</span>`;
    if (cell.dataLength) return `<span class="chip k-plain">${int(cell.dataLength)} bytes of data</span>`;
    return `<span class="chip k-plain">CKB only</span>`;
  }
  switch (d.kind) {
    case "code": return `<span class="chip k-code">Code</span><span class="summary">${esc(d.name)}</span>`;
    case "dao-deposit": return `<span class="chip k-dao-deposit">DAO deposit</span>`;
    case "dao-withdrawing": return `<span class="chip k-dao-withdrawing">DAO withdrawal</span><span class="summary">deposited at #${int(d.depositBlock)}</span>`;
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
      body = `<div><span class="chip k-dao-withdrawing">Nervos DAO withdrawal requested</span></div><p>Deposited at ${blockLink(d.depositBlock)}. The final withdrawal can happen once the lock period ends.</p>`;
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
  return `<details class="raw detail-block"><summary class="muted">Raw fields</summary><dl style="margin-top:10px">
    ${row("Out point", cell.outPoint ? `${cell.outPoint.txHash}:${cell.outPoint.index}` : "—")}
    ${row("Capacity", `${BigInt(cell.capacity).toLocaleString("en-US")} shannons`)}
    ${row("Address", cell.address)}
    ${script("Lock", cell.lock)}${script("Type", cell.type)}
    ${row("Data", cell.dataLength ? `${int(cell.dataLength)} bytes${cell.dataLength > 256 ? " (first 256 shown)" : ""}: ${cell.dataPreview}` : "0x")}
    ${cell.dataHash ? row("Data hash", cell.dataHash) : ""}
  </dl></details>`;
}

const chevron = `<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function stateCell(cell, role) {
  if (role === "input") return cell.outPoint ? `<span class="from">from ${outPointLink(cell.outPoint)}</span>` : "";
  const s = cell.status;
  if (!s) return "";
  if (s.state === "live") return `<span class="pill ok" title="Not consumed by any transaction yet">Live</span>`;
  if (s.state === "pending") return `<span class="pill wait">Pending</span>`;
  return s.by ? `<a class="pill" href="#/tx/${s.by}" title="Consumed by ${s.by}">Spent · <span class="mono">${short(s.by, 6, 4)}</span></a>` : `<span class="pill">Spent</span>`;
}

// One cell as an expandable row: the summary is scannable, the detail is everything.
export function cellRow(cell, i, { role = "output", open = false } = {}) {
  if (cell.unresolved) return `<li class="cell"><div class="cell-note">${esc(cell.unresolved)}</div></li>`;
  const lockName = cell.lock.resolved?.inner?.name ?? cell.lock.resolved?.name;
  return `<li><details class="cell"${open ? " open" : ""}>
    <summary>
      <span class="cell-idx">#${i}</span>
      <span class="cell-owner"><span class="addr">${addrLink(cell.address)}</span><span class="lockname">${esc(lockName ?? "unknown lock")}</span></span>
      <span class="cell-what">${decodedSummary(cell.decoded, cell)}</span>
      <span class="cell-cap"><span class="amount">${ckb(cell.capacity)}</span>${capacityBar(cell, { mini: true })}</span>
      <span class="cell-state">${stateCell(cell, role)}</span>
      ${chevron}
    </summary>
    <div class="cell-detail">
      <div class="detail-block"><h3>Capacity</h3>${capacityBar(cell)}${capacityLegend(cell)}</div>
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

export const cellList = (cells, opts = {}) =>
  `<ul class="cells">${cells.map((c, i) => cellRow(c, opts.indexFrom != null ? opts.indexFrom + i : i, { ...opts, open: opts.openAll ?? false })).join("")}</ul>`;
