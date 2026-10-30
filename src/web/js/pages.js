import {
  addrLink, api, blockLink, card, cellCard, cellList, ckb, detailCard, esc, icon, iconBtn, iconLink, int, plural,
  scriptName, short, sourceBadge, stamp, tags, txLink, when, outPointLink, copyBtn, txKind, table, progress, tabs, pager,
  delta, tokenDelta,
} from "./ui.js";

// Each page returns { title, html } and may set refresh: true for live updates.

const viewAll = (href, label) => `<a class="latest-foot" href="${href}">${label}</a>`;
const timeCell = (ms) => `<td class="nowrap">${stamp(ms)}</td>`;

// ---------------------------------------------------------------- home

export async function home() {
  const h = await api("/api/home");
  const epochFraction = h.epoch.length ? (h.epoch.index + 1) / h.epoch.length : 0;
  const pool = h.pool.pending + h.pool.proposed;

  // Their dashboard: a dark panel with the headline numbers, a white strip underneath.
  const dash = `<section aria-label="Chain stats">
    <div class="dash">
      <div class="dash-half">
        <div class="dash-item"><span>Latest Block</span><b>${int(h.tip)}</b><em>${when(h.tipTimestamp)}</em></div>
        <div class="dash-item"><span>Average Block Time</span><b>${h.blockTime != null ? `${(h.blockTime / 1000).toFixed(2)}<small>s</small>` : "—"}</b><em>median of the last 20 blocks</em></div>
        <div class="dash-item"><span>Transactions</span><b>${int(h.transactionCount)}</b><em>not counting block rewards</em></div>
        <div class="dash-item"><span>Known Scripts</span><b>${int(h.knownScripts.genesis + h.knownScripts.project)}</b><em>${h.knownScripts.genesis} genesis · ${h.knownScripts.project} from your projects</em></div>
      </div>
      <div class="dash-half">
        <div class="dash-item"><span>Epoch</span><b>${int(h.epoch.number)}</b><em>block ${int(h.epoch.index + 1)} of ${int(h.epoch.length)}</em>${progress(epochFraction, "Epoch progress")}</div>
        <div class="dash-item"><span>Mining Difficulty</span><b>${int(h.difficulty)}</b><em>fixed: the devnet's proof of work is a dummy</em></div>
        <div class="dash-item"><span>Chain</span><b>${esc(h.chain)}</b><em>your local OffCKB node</em></div>
        <div class="dash-item"><span>Chain Resets Seen</span><b>${int(h.resets)}</b><em>offckb clean while the explorer ran</em></div>
      </div>
    </div>
    <div class="dash-strip">
      <a class="dash-link" href="#/transactions?tab=pending"><span>Tx Pool</span><b>${int(pool)}<em>${pool ? `${int(h.pool.pending)} pending · ${int(h.pool.proposed)} proposed` : "nothing waiting"}</em></b></a>
      <div><span>Min Fee Rate</span><b>${int(h.pool.minFeeRate)}<em>shannons/kB</em></b></div>
      <a class="dash-link" href="#/blocks"><span>Blocks</span><b>${int(h.tip + 1)}<em>including genesis</em></b></a>
      <div><span>Your Scripts</span><b>${int(h.scripts.filter((s) => s.deployed).length)} / ${int(h.scripts.length)}<em>deployed on this chain</em></b></div>
    </div>
  </section>`;

  const blockItems = h.blocks.map((b) => `<li>
      <div><div class="l1"># ${blockLink(b.number)}</div><div class="l2">${when(b.timestamp)}</div></div>
      <div class="mid"><div class="l1 ellipsis"><span class="label">Miner</span>${b.miner ? addrLink(b.miner, { head: 12, tail: 10 }) : '<span class="muted">—</span>'}</div><div class="l2"><span class="label">Live cells</span>${b.liveCellsChange > 0 ? "+" : ""}${int(b.liveCellsChange)}</div></div>
      <div class="end"><div class="l1">${plural(b.txs, "TX")}</div><div class="l2">${b.txs ? "" : "empty"}</div></div>
    </li>`).join("");

  const txItems = h.transactions.map((t) => `<li>
      <div><div class="l1">${txLink(t.hash, { head: 8, tail: 6 })}</div><div class="l2">${when(t.timestamp)}</div></div>
      <div class="mid"><div class="l1"><span class="label">Block #</span>${blockLink(t.blockNumber)}</div><div class="l2">${txKind(t)}</div></div>
      <div class="end"><div class="l1">${ckb(t.capacity)}</div><div class="l2">${int(t.inputs)} → ${int(t.outputs)} cells</div></div>
    </li>`).join("");

  const html = `
    ${dash}
    <div class="grid-even">
      <section class="latest">
        <h2 class="latest-head">${icon("blocks")} Latest Blocks</h2>
        <ul>${blockItems}</ul>
        ${viewAll("#/blocks", "View all blocks")}
      </section>
      <section class="latest">
        <h2 class="latest-head">${icon("txs")} Latest Transactions</h2>
        ${h.transactions.length ? `<ul>${txItems}</ul>${viewAll("#/transactions", "View all transactions")}` : `<p class="latest-empty">No transactions yet. Deploy a contract or send CKB and it shows up here.</p>`}
      </section>
    </div>
    ${yourScripts(h.scripts)}`;
  return { title: "Home", html, refresh: true };
}

function yourScripts(scripts) {
  const count = (c) => (c.n ? `${int(c.n)}${c.more ? "+" : ""}` : '<span class="muted">0</span>');
  const rows = scripts.map((s) => `<tr>
      <td><a class="script-name" href="#/script/${s.codeHash}/${s.hashType}">${esc(s.name)}</a></td>
      <td>${sourceBadge(s.source)}</td>
      <td>${s.deployed ? '<span class="status ok">Deployed</span>' : '<span class="status bad" title="The code cell in this deployment isn\'t on the chain">Not on this chain</span>'}</td>
      <td class="opt">${s.location ? outPointLink(s.location) : '<span class="muted">—</span>'}</td>
      <td class="r">${s.deployed ? count(s.asType) : "—"}</td>
      <td>${s.deployed ? count(s.asLock) : "—"}</td>
    </tr>`);
  const stale = scripts.filter((s) => !s.deployed).length;
  return card({
    title: "Your Scripts",
    count: scripts.length || null,
    flush: true,
    aside: stale ? `<span class="warn-text">${plural(stale, "deployment")} not on this chain: run <code>offckb deploy</code> again</span>` : "From your projects' deployment/scripts.json",
    body: scripts.length ? table([["Script"], ["Project"], ["Status"], ["Code Cell", "opt"], ["Live Cells as Type", "r"], ["As Lock"]], rows) : "",
    empty: "No project scripts loaded. Start the explorer inside your project folder, or pass <code>--project path/to/your-project</code>, to name your own contracts.",
  });
}

// ---------------------------------------------------------------- block list

export async function blocks(q) {
  const page = Number(q.get("page")) || 1;
  const size = Number(q.get("size")) || 20;
  const p = await api(`/api/blocks?page=${page}&size=${size}`);
  const rows = p.items.map((b) => `<tr>
      <td>${blockLink(b.number)}</td>
      <td class="r">${int(b.txs)}</td>
      <td class="r opt">${b.liveCellsChange > 0 ? "+" : ""}${int(b.liveCellsChange)}</td>
      <td class="r">${b.reward != null ? ckb(b.reward, { unit: false }) : '<span class="muted" title="A block reward is final 11 blocks later">pending</span>'}</td>
      <td class="opt">${b.miner ? addrLink(b.miner, { head: 20, tail: 20 }) : '<span class="muted">Genesis</span>'}</td>
      ${timeCell(b.timestamp)}
    </tr>`);
  const html = card({
    flush: true,
    body: table([["Height"], ["Transactions", "r"], ["Live Cells", "r opt"], ["Reward (CKB)", "r"], ["Miner", "opt"], ["Time"]], rows),
    foot: `<div class="card-foot">${pager(p, "#/blocks")}</div>`,
  });
  return { title: page > 1 ? `Blocks, page ${page}` : "Blocks", html, refresh: p.page === 1 };
}

// ---------------------------------------------------------------- transaction list

export async function transactions(q) {
  const pending = q.get("tab") === "pending";
  const page = Number(q.get("page")) || 1;
  const size = Number(q.get("size")) || 20;
  // On the pending tab, still ask for one committed row so its tab can show the total.
  const [list, pool] = await Promise.all([api(`/api/transactions?page=${pending ? 1 : page}&size=${pending ? 1 : size}`), api("/api/pool")]);
  const tabBar = tabs([
    { label: `Transactions (${int(list.total)})`, href: "#/transactions", current: !pending },
    { label: `Pending Transactions (${int(pool.transactions.length)})`, href: "#/transactions?tab=pending", current: pending },
  ]);

  let body;
  if (pending) {
    const rows = pool.transactions.map((t) => `<tr>
        <td>${txLink(t.hash, { head: 20, tail: 20 })}</td>
        <td><span class="status ${t.status === "proposed" ? "ok" : "wait"}">${t.status === "proposed" ? "Proposed" : "Pending"}</span></td>
        <td class="opt">${tags(t.tags) || '<span class="muted">CKB transfer</span>'}</td>
        <td class="r">${ckb(t.fee, { unit: false })}</td>
        <td class="r opt">${t.feeRate != null ? int(t.feeRate) : "—"}</td>
        <td class="r opt">${int(t.size)}</td>
        <td class="r opt">${int(t.cycles)}</td>
        <td>${when(t.timestamp)}</td>
      </tr>`);
    body = rows.length
      ? table([["Transaction Hash"], ["Status"], ["What It Does", "opt"], ["Fee (CKB)", "r"], ["Fee Rate (shannons/kB)", "r opt"], ["Size", "r opt"], ["Cycles", "r opt"], ["Seen"]], rows)
      : `<p class="card-empty" style="padding:28px 40px">Nothing waiting. A transaction you send sits here until a block proposes and then commits it, usually within a few blocks. Min fee rate: ${int(pool.info.minFeeRate)} shannons/kB.</p>`;
  } else {
    const rows = list.items.map((t) => `<tr>
        <td>${txLink(t.hash, { head: 20, tail: 20 })}</td>
        <td class="opt">${txKind(t)}</td>
        <td>${blockLink(t.blockNumber)}</td>
        <td class="r opt">${int(t.inputs)} → ${int(t.outputs)}</td>
        <td class="r">${ckb(t.capacity, { unit: false })}</td>
        ${timeCell(t.timestamp)}
      </tr>`);
    body = rows.length
      ? table([["Transaction Hash"], ["What It Did", "opt"], ["Height"], ["Cells", "r opt"], ["Capacity (CKB)", "r"], ["Time"]], rows)
      : `<p class="card-empty" style="padding:28px 40px">No transactions yet. Deploy a contract or send CKB and it shows up here.</p>`;
  }
  const html = `<section class="card flush">${tabBar}${body}${!pending && list.total ? `<div class="card-foot">${pager(list, "#/transactions")}</div>` : ""}</section>`;
  return { title: pending ? "Pending transactions" : "Transactions", html, refresh: pending || list.page === 1 };
}

// ---------------------------------------------------------------- transaction

const STATUS = {
  committed: ["ok", "Committed"],
  proposed: ["wait", "Proposed"],
  pending: ["wait", "Pending"],
  rejected: ["bad", "Rejected"],
  unknown: ["", "Unknown"],
};
const statusText = (s) => `<span class="status ${STATUS[s]?.[0] ?? ""}">${STATUS[s]?.[1] ?? esc(s)}</span>`;

export async function transaction(hash) {
  const tx = await api(`/api/tx/${hash}`);
  if (tx.rejected) return rejected(tx);
  const inBlock = tx.blockNumber != null;
  const actions = iconBtn("json", "Copy raw JSON", `data-copy-url="/api/tx/${tx.hash}/raw"`)
    + iconLink("download", "Download raw JSON", `href="/api/tx/${tx.hash}/raw" download="${tx.hash}.json"`);

  const deps = tx.cellDeps.map((d) => `<tr>
      <td>${outPointLink(d)}</td>
      <td>${d.depType === "dep_group" ? "dep group" : "code"}</td>
      <td>${d.provides.length ? d.provides.map((p) => `<a class="script-name" href="#/script/${p.codeHash}/${p.hashType}">${esc(p.name)}</a> ${sourceBadge(p.source)}`).join(", ") : '<span class="muted">not a known script</span>'}</td>
    </tr>`);

  const changes = tx.changes.map((c) => `<tr>
      <td>${addrLink(c.address)}<span class="lockname">${esc(c.lockName ?? "unknown lock")}</span></td>
      <td class="r">${delta(c.ckb)}</td>
      <td>${c.tokens.length ? c.tokens.map((t) => `<span class="token-change">${tokenDelta(t.amount)} <span class="chip k-udt">${t.standard}</span> ${scriptName(t.type, { badge: false })}</span>`).join("") : '<span class="muted">—</span>'}</td>
    </tr>`);

  const witnesses = tx.witnesses.map((w, i) => `<tr>
      <td>${i}</td>
      <td class="r">${int(w.size)} B</td>
      <td class="opt">${w.args ? `<span class="wa">WitnessArgs</span>${[["lock", w.args.lock], ["input_type", w.args.inputType], ["output_type", w.args.outputType]].map(([k, v]) => `<span class="wa-field${v == null ? " none" : ""}">${k} ${v == null ? "—" : `${int(v)} B`}</span>`).join("")}` : w.size ? '<span class="muted">raw bytes</span>' : '<span class="muted">empty</span>'}</td>
      <td>${w.size ? `<details class="hex"><summary>Hex</summary><code>${esc(w.preview)}${w.size > 512 ? "…" : ""}</code></details>` : ""}</td>
    </tr>`);

  const html = `
    ${detailCard({
      title: "Transaction",
      hash: tx.hash,
      actions,
      left: [
        ["Block Height", inBlock ? blockLink(tx.blockNumber) : '<span class="muted">Not in a block yet</span>', "The block that committed this transaction"],
        ["Transaction Fee | Fee Rate", tx.fee != null ? `${ckb(tx.fee)} | ${int(tx.feeRate)} shannons/kB` : tx.cellbase ? "None (block reward)" : "—", "Input capacity minus output capacity, and that per 1,000 bytes"],
        ["Size", `${int(tx.size)} Bytes`, "Serialized size, as the node counts it for fees"],
      ],
      right: [
        ["Timestamp", stamp(tx.timestamp)],
        ["Status", inBlock ? `${statusText(tx.status)} <small>${plural(tx.confirmations, "Confirmation")}</small>` : statusText(tx.status)],
        ["Cycles", tx.cycles != null ? int(tx.cycles) : "—", "CKB-VM cycles used by all the scripts this transaction ran"],
      ],
    })}
    ${inBlock ? "" : `<div class="notice warn"><p><b>Not in a block yet.</b> The node accepted it into the tx pool. It's committed once a block includes it, usually within a few blocks on a devnet.</p></div>`}
    ${changes.length ? card({
      title: "Balance Changes",
      aside: "What each address gained or paid, fee included",
      flush: true,
      body: table([["Address"], ["CKB", "r"], ["Tokens"]], changes),
    }) : ""}
    ${cellCard("Input", tx.inputs, { role: "input", openAll: tx.inputs.length + tx.outputs.length <= 3 })}
    ${cellCard("Output", tx.outputs, { role: "output", openAll: tx.inputs.length + tx.outputs.length <= 3 })}
    <div class="grid-even">
      ${card({
        title: "Cell Deps",
        count: tx.cellDeps.length,
        flush: true,
        body: tx.cellDeps.length ? table([["Out Point"], ["Dep Type"], ["Provides"]], deps) : "",
        empty: "None.",
      })}
      ${card({
        title: "Header Deps",
        count: tx.headerDeps.length,
        flush: true,
        body: tx.headerDeps.length ? table([["Block"], ["Hash"]], tx.headerDeps.map((h) => `<tr>
          <td>${h.number != null ? blockLink(h.number) : "?"}</td>
          <td><a class="mono" href="#/block/${h.hash}" title="${h.hash}">${short(h.hash)}</a></td>
        </tr>`)) : "",
        empty: "None. The Nervos DAO uses these to check when a deposit was made.",
      })}
    </div>
    ${card({
      title: "Witnesses",
      count: tx.witnesses.length,
      flush: true,
      aside: "Signatures and other proof, one per input group",
      body: tx.witnesses.length ? table([["#"], ["Size", "r"], ["Layout", "opt"], [""]], witnesses) : "",
      empty: "None.",
    })}`;
  return { title: `Transaction ${short(tx.hash)}`, html, refresh: !inBlock };
}

// What the node's reject types mean (ckb tx-pool `Reject`), in plain words.
const REJECT_TYPES = {
  Resolve: "An input or cell dep couldn't be found, or was already spent.",
  Verification: "A script or a transaction rule failed.",
  Malformed: "The transaction isn't well-formed.",
  LowFeeRate: "The fee rate is below the node's minimum.",
  RBFRejected: "It spends the same inputs as a transaction already in the pool, without paying enough extra fee to replace it.",
  Duplicated: "The same transaction is already in the pool.",
  Full: "The tx pool is full.",
  ExceededMaximumAncestorsCount: "Too many unconfirmed transactions before it in the pool.",
  ExceededTransactionSizeLimit: "The transaction is too large.",
  Expiry: "It sat in the pool too long and expired.",
  Invalidated: "Another transaction spent one of its inputs first.",
};

// The node keeps the reason for recently rejected transactions, not their contents.
function rejected(tx) {
  let type = null;
  let description = tx.reason ?? "";
  try {
    ({ type, description } = JSON.parse(tx.reason));
  } catch {}
  const code = description.match(/error code (-?\d+)/i)?.[1];
  const script = description.match(/(Inputs|Outputs)\[(\d+)\]\.(Lock|Type)/);
  const html = `
    ${detailCard({
      title: "Transaction",
      hash: tx.hash,
      left: [["Status", statusText("rejected")], ["Reject Type", type ? esc(type) : "—"]],
      right: [["Script Error Code", code ? esc(code) : "—"], ["Failed Script", script ? `${esc(script[3])} of ${esc(script[1].toLowerCase().replace(/s$/, ""))} #${esc(script[2])}` : "—"]],
    })}
    <div class="notice error">
      <p><b>The node rejected this transaction.</b> ${esc(REJECT_TYPES[type] ?? "")}</p>
      ${description ? `<pre class="reason">${esc(description)}</pre>` : ""}
      <p>The node only remembers a rejected transaction's hash and reason, not its contents, and forgets them after a while.</p>
    </div>`;
  return { title: `Rejected ${short(tx.hash)}`, html };
}

// ---------------------------------------------------------------- block

export async function block(id) {
  const b = await api(`/api/block/${id}`);
  const nav = `<a class="btn" href="#/block/${b.number - 1}"${b.number === 0 ? ' aria-disabled="true"' : ""}>‹ ${int(Math.max(0, b.number - 1))}</a>
    <a class="btn" href="#/block/${b.number + 1}"${b.number >= b.tip ? ' aria-disabled="true"' : ""}>${int(b.number + 1)} ›</a>`;
  const rows = b.transactions.map((t, i) => `<tr>
      <td>${i}</td>
      <td>${txLink(t.hash, { head: 16, tail: 16 })}</td>
      <td class="opt">${t.cellbase ? '<span class="muted">Cellbase (block reward)</span>' : txKind({ ...t, blockNumber: b.number })}</td>
      <td class="r opt">${t.cellbase ? "—" : int(t.inputs)} → ${int(t.outputs)}</td>
      <td class="r">${ckb(t.capacity, { unit: false })}</td>
      <td>${t.cycles != null ? int(t.cycles) : '<span class="muted">—</span>'}</td>
    </tr>`);
  const r = b.reward;
  const reward = r
    ? `${ckb(r.total)}<span class="sub">base ${ckb(r.base, { unit: false })} + secondary ${ckb(r.secondary, { unit: false })} + fees ${ckb(BigInt(r.committed) + BigInt(r.proposal), { unit: false })}</span>`
    : b.number === 0 ? '<span class="muted">None for genesis</span>' : `<span class="muted">Final in ${plural(b.finalizedIn, "block")}</span>`;

  const headerFields = Object.entries(b.header).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  const html = `
    ${detailCard({
      title: "Block",
      hash: b.hash,
      hashText: `#${int(b.number)}`,
      nav,
      left: [
        ["Block Hash", `<span class="mono" title="${b.hash}">${short(b.hash, 14, 12)}</span> ${copyBtn(b.hash, "block hash")}`],
        ["Timestamp", stamp(b.timestamp)],
        ["Miner", b.miner ? addrLink(b.miner, { head: 16, tail: 10 }) : '<span class="muted">Genesis</span>', "The lock in the cellbase witness. Its reward is paid 11 blocks later."],
        ["Miner Reward", reward, "Base issuance, secondary issuance and this block's share of fees"],
        ["Miner Message", b.minerMessage ? `<span class="mono">${esc(b.minerMessage)}</span>` : '<span class="muted">—</span>', "Free text in the cellbase witness. offckb's node writes its version here."],
        ["Transactions", `${int(b.transactions.length - 1)} <small>+ cellbase</small>`],
        ["Proposals", int(b.proposals.length), "Transactions this block proposes for inclusion within the next few blocks"],
        ["Uncles", int(b.uncles.length)],
      ],
      right: [
        ["Epoch", `${int(b.epoch.number)} <small>${int(b.epoch.index + 1)}/${int(b.epoch.length)}</small>`],
        ["Confirmations", int(b.confirmations)],
        ["Size", b.size != null ? `${int(b.size)} Bytes` : "—"],
        ["Cycles", int(b.cycles), "CKB-VM cycles of every transaction in the block"],
        ["Difficulty", int(b.difficulty)],
        ["Nonce", `<span class="mono">${esc(b.nonce)}</span>`],
        ["Parent Hash", b.number > 0 ? `<a class="mono" href="#/block/${b.number - 1}" title="${b.parentHash}">${short(b.parentHash, 10, 8)}</a>` : '<span class="muted">—</span>'],
        ["Version", int(Number(b.header.version))],
      ],
    })}
    ${card({
      title: "Transactions",
      count: b.transactions.length,
      flush: true,
      body: table([["#"], ["Transaction Hash"], ["What It Did", "opt"], ["Cells", "r opt"], ["Capacity (CKB)", "r"], ["Cycles"]], rows),
    })}
    ${b.proposals.length ? card({
      title: "Proposals",
      count: b.proposals.length,
      aside: "Short ids: the first 10 bytes of each tx hash",
      body: `<ul class="plain-list">${b.proposals.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`,
    }) : ""}
    ${b.uncles.length ? card({
      title: "Uncles",
      count: b.uncles.length,
      body: `<ul class="block-list">${b.uncles.map((u) => `<li><span>#${int(u.number)}</span><span class="mono muted">${short(u.hash)}</span></li>`).join("")}</ul>`,
    }) : ""}
    <details class="card raw-card">
      <summary class="card-head"><h2>Raw Header</h2><span class="aside">As the node returns it</span></summary>
      <div class="raw"><dl>${headerFields}</dl></div>
    </details>`;
  return { title: `Block #${b.number}`, html };
}

// ---------------------------------------------------------------- address

export async function address(addr) {
  const a = await api(`/api/address/${addr}`);
  const tokens = a.tokens.map((t) => `<tr>
      <td><span class="chip k-udt">${t.standard}</span> ${scriptName(t.type)}</td>
      <td class="opt"><span class="mono" title="${t.owner}">${short(t.owner, 10, 8)}</span></td>
      <td class="r"><b>${BigInt(t.amount).toLocaleString("en-US")}</b></td>
      <td>${t.cells}</td>
    </tr>`);
  const txs = a.transactions.map((t) => `<tr>
      <td>${txLink(t.hash, { head: 20, tail: 20 })}</td>
      <td>${blockLink(t.blockNumber)}</td>
      <td class="opt">${t.spent ? `spent ${plural(t.spent, "cell")}` : ""}${t.spent && t.received ? " · " : ""}${t.received ? `received ${plural(t.received, "cell")}` : ""}</td>
      ${timeCell(t.timestamp)}
    </tr>`);

  const html = `
    ${detailCard({
      title: "Address",
      hash: a.address,
      small: true,
      left: [
        ["CKB Balance", ckb(a.balance), "Capacity of every live cell this address owns"],
        ["Occupied", `${int(a.occupied)} Bytes <small>across the cells shown</small>`],
        ["Tokens", a.tokens.length ? plural(a.tokens.length, "kind") : '<span class="muted">none</span>'],
      ],
      right: [
        ["Live Cells", `${int(a.liveCells)}${a.moreCells ? "+" : ""}`],
        ["Lock Script", scriptName(a.lock)],
        ["Lock Args", `<span class="mono">${short(a.lock.args, 12, 8)}</span>`],
      ],
    })}
    ${a.tokens.length ? card({
      title: "Tokens",
      count: a.tokens.length,
      flush: true,
      aside: "One row per type script",
      body: table([["Token"], ["Issuer Lock Hash", "opt"], ["Balance", "r"], ["Cells"]], tokens),
    }) : ""}
    ${card({
      title: "Live Cells",
      count: `${int(a.liveCells)}${a.moreCells ? "+" : ""}`,
      aside: a.cells.length < a.liveCells ? `newest ${a.cells.length} shown` : "",
      body: a.cells.length ? cellList(a.cells, { role: "output" }) : "",
      empty: "This address owns no live cells.",
    })}
    ${card({
      title: "Transactions",
      flush: true,
      aside: a.transactions.length === 25 ? "latest 25" : "",
      body: a.transactions.length ? table([["Transaction Hash"], ["Height"], ["Cells", "opt"], ["Time"]], txs) : "",
      empty: "No transactions touch this address yet.",
    })}`;
  return { title: `Address ${short(a.address, 10, 6)}`, html };
}

// ---------------------------------------------------------------- script

export async function script(codeHash, hashType) {
  const s = await api(`/api/script/${codeHash}/${hashType}`);
  const count = (c) => (c ? `${c.n}${c.more ? "+" : ""}` : "—");
  const missing = s.location && s.locationLive === false;
  const usedBy = (c) => `${count(c)} <small>live cell${c?.n === 1 && !c.more ? "" : "s"}</small>`;
  const html = `
    ${detailCard({
      title: "Script",
      hash: s.codeHash,
      hashText: s.name ?? "Unknown script",
      left: [
        ["Name", s.name ? `${esc(s.name)} ${sourceBadge(s.source)}` : '<span class="muted">Not in offckb\'s system scripts or any project passed with --project</span>'],
        ["Code Hash", `<span class="mono" title="${s.codeHash}">${short(s.codeHash, 14, 12)}</span> ${copyBtn(s.codeHash, "code hash")}`],
        ["Hash Type", `<span class="mono">${esc(s.hashType)}</span>`, s.hashType === "type" ? "Matched against a code cell's type script hash" : "Matched against a code cell's data hash"],
      ],
      right: [
        ["Code Cell", s.location ? `${outPointLink(s.location)} ${s.locationLive ? '<span class="status ok">Live</span>' : '<span class="status bad">Missing</span>'}${s.location.depType === "depGroup" ? " <small>dep group</small>" : ""}` : '<span class="muted">Unknown</span>'],
        ["Used as Type", usedBy(s.counts?.asType ?? (s.asType.length ? { n: s.asType.length, more: s.asType.length === 20 } : null))],
        ["Used as Lock", usedBy(s.counts?.asLock ?? (s.asLock.length ? { n: s.asLock.length, more: s.asLock.length === 20 } : null))],
      ],
    })}
    ${missing ? `<div class="notice warn"><p><b>This deployment isn't on the chain.</b> The deployment file points at a code cell this devnet doesn't have, usually because <code>offckb clean</code> reset the chain after it was deployed. Run <code>offckb deploy</code> again and restart the explorer.</p></div>` : ""}
    ${s.asType.length || !s.asLock.length ? card({
      title: "Cells Using It as Type",
      aside: s.asType.length === 20 ? "newest 20" : "",
      body: s.asType.length ? cellList(s.asType, { role: "output" }) : "",
      empty: "No live cell uses this script as its type.",
    }) : ""}
    ${s.asLock.length ? card({
      title: "Cells Using It as Lock",
      aside: s.asLock.length === 20 ? "newest 20" : "",
      body: cellList(s.asLock, { role: "output" }),
    }) : ""}`;
  return { title: s.name ? `Script ${s.name}` : "Unknown script", html };
}
