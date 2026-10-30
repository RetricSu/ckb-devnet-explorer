import {
  addrLink, api, ckbIcon, claimCkb, blockLink, card, cellCard, cellList, ckb, detailCard, esc, icon, iconBtn, iconLink, int, plural,
  scriptName, short, sourceBadge, stamp, tags, txLink, when, outPointLink, copyBtn, txKind, table, progress, tabs, pager,
  delta, tokenDelta,
} from "./ui.js";
import { chartFigure } from "./charts.js";

// Each page returns { title, html } and may set refresh: true for live updates.

const viewAll = (href, label) => `<a class="latest-foot" href="${href}">${label}</a>`;
const timeCell = (ms) => `<td class="nowrap">${stamp(ms)}</td>`;

// ---------------------------------------------------------------- home

export async function home() {
  const h = await api("/api/home");
  const epochFraction = h.epoch.length ? (h.epoch.index + 1) / h.epoch.length : 0;
  const pool = h.pool.pending + h.pool.proposed;

  // Their dashboard: a dark panel with headline numbers and a chart on each half, a white
  // strip underneath. Block time instead of their hash rate (a devnet's PoW is a dummy).
  const { blockTimes, activity } = h.charts;
  const dash = `<section aria-label="Chain stats">
    <div class="dash">
      <div class="dash-half">
        <div class="dash-stats">
          <div class="dash-item"><span>Latest Block</span><b>${int(h.tip)}</b><em>${when(h.tipTimestamp)}</em></div>
          <div class="dash-item"><span>Average Block Time</span><b>${h.blockTime != null ? `${(h.blockTime / 1000).toFixed(2)}<small>s</small>` : "—"}</b><em>median of the last 20 blocks</em></div>
        </div>
        ${chartFigure({
          kind: "line",
          title: "Block time (s), last 100 blocks",
          series: blockTimes,
          label: ["Block", "Seconds since the previous block"],
          table: blockTimes.map((p) => [`#${int(p.n)}`, p.s.toFixed(2)]),
        })}
      </div>
      <div class="dash-half">
        <div class="dash-stats">
          <div class="dash-item"><span>Transactions</span><b>${int(h.transactionCount)}</b><em>not counting block rewards</em></div>
          <div class="dash-item"><span>Epoch</span><b>${int(h.epoch.number)}</b><em>block ${int(h.epoch.index + 1)} of ${int(h.epoch.length)}</em>${progress(epochFraction, "Epoch progress")}</div>
        </div>
        ${chartFigure({
          kind: "bar",
          title: "Transactions across the chain's history",
          series: activity,
          label: ["Blocks", "Transactions"],
          table: activity.map((x) => [`${int(x.from)}–${int(x.to)}`, int(x.txs)]),
        })}
      </div>
    </div>
    <div class="dash-strip">
      <a class="dash-link" href="#/transactions?tab=pending"><span>Tx Pool</span><b>${int(pool)}<em>${pool ? `${int(h.pool.pending)} pending · ${int(h.pool.proposed)} proposed` : "nothing waiting"}</em></b></a>
      <div><span>Min Fee Rate</span><b>${int(h.pool.minFeeRate)}<em>shannons/kB</em></b></div>
      <div><span>Known Scripts</span><b>${int(h.knownScripts.genesis + h.knownScripts.project)}<em>${h.knownScripts.genesis} genesis · ${h.knownScripts.project} yours</em></b></div>
      <div><span>Your Scripts Deployed</span><b>${int(h.scripts.filter((s) => s.deployed).length)} / ${int(h.scripts.length)}<em>on this chain</em></b></div>
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
      body: table([["Address"], [`${ckbIcon} CKB`, "r"], ["Tokens"]], changes),
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

// Like the CKB Explorer's address page: an Overview card (balance, occupied, DAO, live cells,
// blocks mined, lock script), then a card with tabs, each paginated.
export async function address(addr, q) {
  const tab = q.get("tab") ?? "";
  const pageNo = Number(q.get("page")) || 1;
  const size = Number(q.get("size")) || 20;
  const a = await api(`/api/address/${addr}?tab=${encodeURIComponent(tab)}&page=${pageNo}&size=${size}`);
  const base = `#/address/${a.address}`;

  const overview = detailCard({
    title: "Address",
    hash: a.address,
    small: true,
    actions: faucetPopover(a.address),
    left: [
      [`${ckbIcon} CKB Balance`, ckb(a.balance), "Capacity of every live cell this address owns"],
      ["Occupied", ckb(BigInt(a.occupied) * 100000000n), "Capacity its cells need for the bytes they hold (1 CKB per byte)"],
      ["Nervos DAO Deposit", ckb(a.daoDeposited), "Capacity in DAO deposit cells this address owns"],
      ...(BigInt(a.daoWithdrawing) ? [["Nervos DAO Withdrawing", ckb(a.daoWithdrawing), "Deposits with a withdrawal requested, waiting for the lock period"]] : []),
    ],
    right: [
      ["Live Cells", int(a.counts.cells)],
      ["Transactions", int(a.counts.transactions)],
      ["Blocks Mined", int(a.blocksMined), "Blocks whose cellbase names this address as the miner"],
      ["Lock Script", scriptName(a.lock)],
    ],
    extra: `<details class="lock-hash">
      <summary>Lock Script Hash</summary>
      <div class="code-box"><span class="mono">${a.lock.hash}</span> ${copyBtn(a.lock.hash, "lock script hash")}</div>
      <dl class="raw-inline"><dt>Code hash</dt><dd class="mono">${a.lock.code_hash}</dd><dt>Hash type</dt><dd class="mono">${esc(a.lock.hash_type)}</dd><dt>Args</dt><dd class="mono">${a.lock.args}</dd></dl>
    </details>`,
  });

  const note = a.account
    ? `<div class="notice info"><p>${a.account.index != null ? `This is offckb's test account <b>#${a.account.index}</b>${a.account.role ? `, ${esc(a.account.role)}` : ""}.` : `This is ${esc(a.account.role)}.`} <a href="#/accounts">All accounts</a></p></div>`
    : "";

  const tabBar = tabs([
    { label: `Transactions (${int(a.counts.transactions)})`, href: base, current: a.tab === "transactions" },
    { label: `Live Cells (${int(a.counts.cells)})`, href: `${base}?tab=cells`, current: a.tab === "cells" },
    { label: `Tokens (${int(a.counts.tokens)})`, href: `${base}?tab=tokens`, current: a.tab === "tokens" },
  ]);

  let body = "";
  let foot = "";
  if (a.tab === "transactions") {
    const rows = a.list.items.map((t) => `<tr>
        <td>${txLink(t.hash, { head: 20, tail: 20 })}</td>
        <td>${blockLink(t.blockNumber)}</td>
        <td class="nowrap opt">${stamp(t.timestamp)}</td>
        <td class="r">${delta(t.change)}</td>
      </tr>`);
    body = rows.length ? table([["Transaction Hash"], ["Height"], ["Time", "opt"], [`${ckbIcon} Change`, "r"]], rows) : empty("No transactions touch this address yet.");
    if (a.list.total) foot = pager(a.list, base);
  } else if (a.tab === "cells") {
    body = a.list.items.length ? `<div class="card-pad">${cellList(a.list.items, { role: "output", indexFrom: (a.list.page - 1) * a.list.size })}</div>` : empty("This address owns no live cells.");
    if (a.list.total) foot = pager(a.list, base, "tab=cells");
  } else {
    const rows = a.list.map((t) => `<tr>
        <td><b>${t.standard}</b> ${scriptName(t.type)}</td>
        <td class="opt"><span class="mono" title="${t.owner}">${short(t.owner, 10, 8)}</span></td>
        <td>${int(t.cells)}</td>
        <td class="r"><b>${BigInt(t.amount).toLocaleString("en-US")}</b></td>
      </tr>`);
    body = rows.length ? table([["Token"], ["Issuer Lock Hash", "opt"], ["Cells"], ["Balance", "r"]], rows) : empty("No sUDT or xUDT tokens at this address.");
  }

  const html = `${overview}${note}<section class="card flush">${tabBar}${body}${foot ? `<div class="card-foot">${foot}</div>` : ""}</section>`;
  return { title: `Address ${short(a.address, 10, 6)}`, html };
}

const empty = (text) => `<p class="card-empty" style="padding:28px 40px">${text}</p>`;

// The CKB Explorer's faucet popover on address pages, here for devnet CKB.
const faucetPopover = (addr) => addr.startsWith("ckt1") ? `<details class="pop">
    <summary class="icon-btn" aria-label="Get devnet CKB" title="Get devnet CKB">${icon("faucet")}</summary>
    <div class="pop-menu">
      <button type="button" data-claim="${esc(addr)}" data-amount="10000">Claim 10,000 devnet CKB</button>
      <button type="button" data-claim="${esc(addr)}" data-amount="100000">Claim 100,000 devnet CKB</button>
      <a href="#/faucet?to=${encodeURIComponent(addr)}">Other amount on the Faucet page</a>
    </div>
  </details>` : "";

// ---------------------------------------------------------------- script

// Like the CKB Explorer's script page: an overview, then tabs for the cells that use the
// script, the transactions that touched them, and the cell its code lives in.
export async function script(codeHash, hashType, q) {
  const pageNo = Number(q.get("page")) || 1;
  const size = Number(q.get("size")) || 20;
  const s = await api(`/api/script/${codeHash}/${hashType}?tab=${encodeURIComponent(q.get("tab") ?? "")}&page=${pageNo}&size=${size}`);
  const base = `#/script/${s.codeHash}/${s.hashType}`;
  const missing = s.location && s.locationLive === false;

  const overview = detailCard({
    title: "Script",
    hash: s.codeHash,
    hashText: s.name ?? "Unknown script",
    left: [
      ["Name", s.name ? `${esc(s.name)}` : '<span class="muted">Not in offckb\'s system scripts or any project passed with --project</span>'],
      ["Source", s.source === "genesis" ? "Built into the devnet (genesis)" : s.source ? `Your project <b>${esc(s.source)}</b>` : "—"],
      ["Code Hash", `<span class="mono" title="${s.codeHash}">${short(s.codeHash, 14, 12)}</span> ${copyBtn(s.codeHash, "code hash")}`],
      ["Hash Type", `<span class="mono">${esc(s.hashType)}</span>`, s.hashType === "type" ? "Matched against a code cell's type script hash" : "Matched against a code cell's data hash"],
    ],
    right: [
      ["Code Cell", s.location ? `${outPointLink(s.location)} ${s.locationLive ? '<span class="status">Live</span>' : '<span class="status bad">Missing</span>'}${s.location.depType === "depGroup" ? " <small>dep group</small>" : ""}` : '<span class="muted">Unknown</span>'],
      ["Live Cells as Type", `${int(s.counts.type)} <small>holding ${ckb(s.capacity.type)}</small>`],
      ["Live Cells as Lock", `${int(s.counts.lock)} <small>holding ${ckb(s.capacity.lock)}</small>`],
      ["Transactions", int(s.counts.transactions), "Transactions that created or spent a cell using this script"],
    ],
  });

  const tabBar = tabs([
    { label: `Cells as Type (${int(s.counts.type)})`, href: `${base}?tab=type`, current: s.tab === "type" },
    { label: `Cells as Lock (${int(s.counts.lock)})`, href: `${base}?tab=lock`, current: s.tab === "lock" },
    { label: `Transactions (${int(s.counts.transactions)})`, href: `${base}?tab=transactions`, current: s.tab === "transactions" },
    ...(s.location ? [{ label: "Code Cell", href: `${base}?tab=code`, current: s.tab === "code" }] : []),
  ]);

  let body = "";
  let foot = "";
  if (s.tab === "type" || s.tab === "lock") {
    body = s.list.items.length
      ? `<div class="card-pad">${cellList(s.list.items, { role: "output", indexFrom: (s.list.page - 1) * s.list.size })}</div>`
      : empty(`No live cell uses this script as its ${s.tab}.`);
    if (s.list.total) foot = pager(s.list, base, `tab=${s.tab}`);
  } else if (s.tab === "transactions") {
    const rows = s.list.items.map((t) => `<tr>
        <td>${txLink(t.hash, { head: 20, tail: 20 })}</td>
        <td>${blockLink(t.blockNumber)}</td>
        <td class="nowrap">${stamp(t.timestamp)}</td>
      </tr>`);
    body = rows.length ? table([["Transaction Hash"], ["Height"], ["Time"]], rows) : empty("No transactions have used this script yet.");
    if (s.list.total) foot = pager(s.list, base, "tab=transactions");
  } else {
    body = s.list ? `<div class="card-pad">${cellList([s.list], { role: "output", openAll: true })}</div>` : empty("The code cell isn't on this chain.");
  }

  const html = `${overview}
    ${missing ? `<div class="notice warn"><p><b>This deployment isn't on the chain.</b> The deployment file points at a code cell this devnet doesn't have, usually because <code>offckb clean</code> reset the chain after it was deployed. Run <code>offckb deploy</code> again and restart the explorer.</p></div>` : ""}
    <section class="card flush">${tabBar}${body}${foot ? `<div class="card-foot">${foot}</div>` : ""}</section>`;
  return { title: s.name ? `Script ${s.name}` : "Unknown script", html };
}

// ---------------------------------------------------------------- scripts

// Every script the explorer can name: your projects' first, then the genesis ones.
export async function scripts(q) {
  const list = await api("/api/scripts");
  const filter = q.get("tab") ?? "all";
  const shown = list.filter((s) => filter === "all" || (filter === "mine" ? s.source !== "genesis" : s.source === "genesis"));
  const count = (c) => (c.n ? `${int(c.n)}${c.more ? "+" : ""}` : '<span class="muted">0</span>');
  const rows = shown.map((s) => `<tr>
      <td><a class="script-name" href="#/script/${s.codeHash}/${s.hashType}">${esc(s.name)}</a></td>
      <td>${s.source === "genesis" ? '<span class="muted">genesis</span>' : esc(s.source)}</td>
      <td class="opt"><span class="mono" title="${s.codeHash}">${short(s.codeHash, 10, 8)}</span></td>
      <td class="opt mono">${esc(s.hashType)}</td>
      <td>${s.live == null ? '<span class="muted">—</span>' : s.live ? '<span class="status">Live</span>' : '<span class="status bad">Not on this chain</span>'}</td>
      <td class="r">${count(s.asType)}</td>
      <td>${count(s.asLock)}</td>
    </tr>`);
  const mine = list.filter((s) => s.source !== "genesis").length;
  const tabBar = tabs([
    { label: `All (${list.length})`, href: "#/scripts", current: filter === "all" },
    { label: `Your Projects (${mine})`, href: "#/scripts?tab=mine", current: filter === "mine" },
    { label: `Genesis (${list.length - mine})`, href: "#/scripts?tab=genesis", current: filter === "genesis" },
  ]);
  const html = `<section class="card flush">${tabBar}${rows.length
    ? table([["Script"], ["Source"], ["Code Hash", "opt"], ["Hash Type", "opt"], ["Code Cell"], ["Cells as Type", "r"], ["As Lock"]], rows)
    : empty("No scripts from your projects. Start the explorer inside your project folder, or pass <code>--project path/to/your-project</code>.")}</section>`;
  return { title: "Scripts", html };
}

// ---------------------------------------------------------------- accounts

// offckb's 20 prefunded test accounts. Their keys ship with offckb; they're only shown by number.
export async function accounts() {
  const r = await api("/api/accounts");
  if (!r.available) return { title: "Accounts", html: `<div class="notice warn"><p>Couldn't find offckb's test accounts. Is <code>offckb</code> on your PATH?</p></div>` };
  const rows = r.accounts.map((a) => `<tr>
      <td>#${a.index}</td>
      <td>${addrLink(a.address, { head: 20, tail: 12 })}${a.role ? `<span class="sub">${esc(a.role)}</span>` : ""}</td>
      <td class="r">${ckb(a.balance)}</td>
      <td class="r opt">${int(a.cells)}</td>
      <td class="r">${int(a.transactions)}</td>
    </tr>`);
  const html = `${card({
    title: "Test Accounts",
    count: r.accounts.length,
    flush: true,
    aside: "Funded with 42,000,000 CKB each in the devnet genesis",
    body: table([["#"], ["Address"], [`${ckbIcon} Balance`, "r"], ["Live Cells", "r opt"], ["Transactions", "r"]], rows),
  })}
  <p class="page-note">These are offckb's built-in devnet accounts (see <code>offckb accounts</code>). Their private keys ship with offckb and are public, so never use them outside a local devnet.</p>`;
  return { title: "Accounts", html, refresh: true };
}

// ---------------------------------------------------------------- tokens

const issuerText = (t) => t.issuer
  ? `${addrLink(t.issuer.address)}<span class="sub">offckb account #${t.issuer.account}</span>`
  : `<span class="mono" title="Issuer lock hash ${t.owner}">${short(t.owner, 10, 8)}</span><span class="sub">issuer lock hash</span>`;

// Every sUDT and xUDT on the chain, like the CKB Explorer's token lists.
export async function tokens(q) {
  const list = await api("/api/tokens");
  const filter = q.get("tab") ?? "all";
  const shown = list.filter((t) => filter === "all" || t.standard.toLowerCase() === filter);
  const rows = shown.map((t) => `<tr>
      <td><a class="script-name" href="#/token/${t.hash}">${t.standard}</a> <span class="mono muted" title="${t.hash}">${short(t.hash, 8, 6)}</span><span class="sub">${scriptName(t.type, { badge: true })}</span></td>
      <td class="opt">${issuerText(t)}</td>
      <td class="r"><b>${BigInt(t.supply).toLocaleString("en-US")}</b></td>
      <td class="r">${int(t.holders)}</td>
      <td class="r opt">${int(t.transactions)}</td>
      <td>${t.created ? `${blockLink(t.created.blockNumber)}<span class="sub">${stamp(t.created.timestamp)}</span>` : "—"}</td>
    </tr>`);
  const count = (s) => list.filter((t) => t.standard.toLowerCase() === s).length;
  const tabBar = tabs([
    { label: `All (${list.length})`, href: "#/tokens", current: filter === "all" },
    { label: `sUDT (${count("sudt")})`, href: "#/tokens?tab=sudt", current: filter === "sudt" },
    { label: `xUDT (${count("xudt")})`, href: "#/tokens?tab=xudt", current: filter === "xudt" },
  ]);
  const html = `<section class="card flush">${tabBar}${rows.length
    ? table([["Token"], ["Issuer", "opt"], ["Total Supply", "r"], ["Holders", "r"], ["Transactions", "r opt"], ["Created"]], rows)
    : empty("No tokens yet. Issue one with <code>offckb udt issue</code> or your own sUDT/xUDT script and it shows up here.")}</section>
    <p class="page-note">Amounts are raw units: sUDT and xUDT cells don't record decimals.</p>`;
  return { title: "Tokens", html };
}

export async function token(hash, q) {
  const pageNo = Number(q.get("page")) || 1;
  const size = Number(q.get("size")) || 20;
  const t = await api(`/api/token/${hash}?tab=${encodeURIComponent(q.get("tab") ?? "")}&page=${pageNo}&size=${size}`);
  const base = `#/token/${t.hash}`;
  const overview = detailCard({
    title: t.standard,
    hash: t.hash,
    hashText: t.hash,
    small: true,
    left: [
      ["Standard", t.standard === "sUDT" ? "sUDT (RFC 0025)" : "xUDT (RFC 0052)"],
      ["Type Script", scriptName(t.type)],
      ["Issuer", t.issuer ? `${addrLink(t.issuer.address)} <small>account #${t.issuer.account}</small>` : `<span class="mono">${short(t.owner, 10, 8)}</span>`, "The lock whose hash starts the type script args: only it can mint"],
      ["Type Args", `<span class="mono" title="${t.type.args}">${short(t.type.args, 12, 10)}</span>`],
    ],
    right: [
      ["Total Supply", `<b>${BigInt(t.supply).toLocaleString("en-US")}</b> <small>units</small>`, "Sum of every live cell of this token"],
      ["Holders", int(t.holders)],
      ["Live Cells", int(t.cells)],
      ["Created", t.created ? `${blockLink(t.created.blockNumber)} <small>${stamp(t.created.timestamp)}</small>` : "—"],
    ],
  });
  const tabBar = tabs([
    { label: `Holders (${int(t.holders)})`, href: base, current: t.tab === "holders" },
    { label: `Transactions (${int(t.transactions)})`, href: `${base}?tab=transactions`, current: t.tab === "transactions" },
  ]);
  let body;
  if (t.tab === "holders") {
    const rows = t.list.items.map((h, i) => `<tr>
        <td>${int((t.list.page - 1) * t.list.size + i + 1)}</td>
        <td>${addrLink(h.address, { head: 20, tail: 12 })}</td>
        <td class="r"><b>${BigInt(h.amount).toLocaleString("en-US")}</b></td>
        <td class="r">${h.share.toFixed(2)}%</td>
      </tr>`);
    body = rows.length ? table([["Rank"], ["Address"], ["Balance", "r"], ["Share", "r"]], rows) : empty("Nobody holds this token any more.");
  } else {
    const rows = t.list.items.map((x) => `<tr>
        <td>${txLink(x.hash, { head: 20, tail: 20 })}</td>
        <td>${blockLink(x.blockNumber)}</td>
        <td class="nowrap">${stamp(x.timestamp)}</td>
      </tr>`);
    body = rows.length ? table([["Transaction Hash"], ["Height"], ["Time"]], rows) : empty("No transactions.");
  }
  const foot = t.list.total ? `<div class="card-foot">${pager(t.list, base, t.tab === "transactions" ? "tab=transactions" : "")}</div>` : "";
  return { title: `${t.standard} ${short(t.hash, 8, 6)}`, html: `${overview}<section class="card flush">${tabBar}${body}${foot}</section>` };
}

// ---------------------------------------------------------------- NFTs (Spore)

// What a spore looks like in a tile or on its own page: images drawn, text and JSON shown.
function sporePreview(s, { large = false } = {}) {
  if (/^image\//.test(s.contentType)) return `<img class="spore-img${large ? " large" : ""}" src="/api/spore/${s.id}/content" alt="Spore ${short(s.id, 8, 6)}, ${esc(s.contentType)}">`;
  if (s.text != null) {
    let text = s.text;
    if (s.contentType.startsWith("application/json")) { try { text = JSON.stringify(JSON.parse(s.text), null, 2); } catch {} }
    return `<pre class="spore-textview${large ? " large" : ""}">${esc(text)}</pre>`;
  }
  return `<div class="spore-blank">${esc(s.contentType)}<br>${int(s.size)} bytes</div>`;
}

export async function nfts() {
  const d = await api("/api/nfts");
  const tiles = d.spores.map((s) => `<a class="nft-tile" href="#/spore/${s.id}">
      <div class="nft-art">${sporePreview(s)}</div>
      <div class="nft-meta"><b class="mono">${short(s.id, 8, 6)}</b><span>${esc(s.contentType)} · ${int(s.size)} B</span></div>
    </a>`).join("");
  const rows = d.clusters.map((c) => `<tr>
      <td><b>${esc(c.name)}</b><span class="sub">${esc(c.description)}</span></td>
      <td class="opt"><span class="mono" title="${c.id}">${short(c.id, 10, 8)}</span></td>
      <td class="r">${int(c.spores)}</td>
      <td class="opt">${addrLink(c.owner)}</td>
      <td>${blockLink(c.blockNumber)}</td>
    </tr>`);
  const html = `
    ${card({
      title: "Spores",
      count: d.spores.length,
      aside: "Live spores on this chain, newest first",
      body: d.spores.length ? `<div class="nft-grid">${tiles}</div>` : "",
      empty: "No live spores. Mint one with <code>@ckb-ccc/spore</code> and it shows up here.",
    })}
    ${card({
      title: "Clusters",
      count: d.clusters.length,
      flush: true,
      aside: "Spore collections",
      body: rows.length ? table([["Cluster"], ["Cluster ID", "opt"], ["Spores", "r"], ["Owner", "opt"], ["Created"]], rows) : "",
      empty: "No clusters yet.",
    })}`;
  return { title: "NFTs", html };
}

export async function spore(id) {
  const d = await api(`/api/spore/${id}`);
  const s = d.spore;
  const overview = detailCard({
    title: "Spore",
    hash: d.id,
    small: true,
    left: s ? [
      ["Content Type", `<span class="mono">${esc(s.contentType)}</span>`],
      ["Content Size", `${int(s.size)} Bytes`],
      ["Cluster", s.clusterId ? `<span class="mono" title="${s.clusterId}">${short(s.clusterId, 10, 8)}</span>` : '<span class="muted">None</span>'],
      ["Owner", addrLink(s.owner)],
    ] : [["Status", '<span class="status bad">Melted</span>', "Destroyed by its owner; the capacity went back to them"]],
    right: s ? [
      ["Status", '<span class="status">Live</span>'],
      ["Capacity", ckb(s.capacity), "The cell's capacity: it pays for the content bytes, 1 CKB per byte"],
      ["Cell", outPointLink(s.outPoint)],
      ["Spore ID", `<span class="mono" title="${d.id}">${short(d.id, 10, 8)}</span>`, "The spore's type script args, the same for its whole life"],
    ] : [],
  });
  const rows = d.history.map((h) => `<tr>
      <td>${h.event}</td>
      <td>${txLink(h.hash, { head: 16, tail: 16 })}</td>
      <td>${blockLink(h.blockNumber)}</td>
      <td class="nowrap opt">${stamp(h.timestamp)}</td>
    </tr>`);
  const html = `${overview}
    ${s ? card({ title: "Content", body: `<div class="spore-stage">${sporePreview(s, { large: true })}</div>` }) : ""}
    ${card({ title: "History", count: d.history.length, flush: true, body: table([["Event"], ["Transaction Hash"], ["Height"], ["Time", "opt"]], rows) })}`;
  return { title: `Spore ${short(d.id, 8, 6)}`, html };
}

// ---------------------------------------------------------------- Nervos DAO

const epochText = (e) => `${int(e.number)}${e.length ? ` <small>${int(e.index)}/${int(e.length)}</small>` : ""}`;
const days = (ms) => (ms >= 86400000 ? `${(ms / 86400000).toFixed(1)} days` : `${(ms / 3600000).toFixed(1)} hours`);

export async function dao(q) {
  const pageNo = Number(q.get("page")) || 1;
  const size = Number(q.get("size")) || 20;
  const d = await api(`/api/dao?tab=${encodeURIComponent(q.get("tab") ?? "")}&page=${pageNo}&size=${size}`);
  const overview = detailCard({
    title: "Nervos DAO",
    left: [
      [`${ckbIcon} Deposited`, ckb(d.deposited), "Capacity in deposit cells that haven't asked to withdraw"],
      ["Withdrawing", ckb(d.withdrawing), "Deposits with a withdrawal requested (phase 1), waiting for the lock period"],
      ["Compensation (estimated)", ckb(d.compensation), "What all these cells would earn if withdrawn now, from the AR in their deposit and current headers (RFC 0023)"],
      ["Depositors", int(d.depositors)],
    ],
    right: [
      ["Current Epoch", epochText(d.epoch)],
      ["Lock Period", `180 epochs${d.lockPeriodMs ? ` <small>about ${days(d.lockPeriodMs)} on this devnet</small>` : ""}`, "A withdrawal completes after a whole number of 180-epoch cycles since the deposit"],
      ["DAO Cells", int(d.cells)],
      ["Transactions", int(d.transactions)],
    ],
  });
  const tabBar = tabs([
    { label: `Deposits (${int(d.cells)})`, href: "#/dao", current: d.tab === "deposits" },
    { label: `Depositors (${int(d.depositors)})`, href: "#/dao?tab=depositors", current: d.tab === "depositors" },
    { label: `Transactions (${int(d.transactions)})`, href: "#/dao?tab=transactions", current: d.tab === "transactions" },
  ]);
  let body;
  if (d.tab === "deposits") {
    const rows = d.list.items.map((c) => `<tr>
        <td>${addrLink(c.address)}</td>
        <td class="r">${ckb(c.capacity)}</td>
        <td>${c.status === "withdrawing" ? '<span class="status wait">Withdrawing</span>' : '<span class="status">Deposited</span>'}</td>
        <td>${blockLink(c.depositBlock)}</td>
        <td class="r opt">${ckb(c.compensation)}</td>
        <td>${c.unlock ? `epoch ${epochText(c.unlock)}<span class="sub">${c.unlock.number <= d.epoch.number ? "ready to withdraw" : `${int(c.unlock.number - d.epoch.number)} epochs to go`}</span>` : '<span class="muted">—</span>'}</td>
      </tr>`);
    body = rows.length ? table([["Owner"], ["Amount", "r"], ["Status"], ["Deposited At"], ["Compensation (est.)", "r opt"], ["Unlocks At"]], rows) : empty("No DAO deposits on this chain yet.");
  } else if (d.tab === "depositors") {
    const rows = d.list.items.map((x, i) => `<tr>
        <td>${int((d.list.page - 1) * d.list.size + i + 1)}</td>
        <td>${addrLink(x.address, { head: 20, tail: 12 })}</td>
        <td class="r">${int(x.cells)}</td>
        <td class="r">${ckb(x.deposited)}</td>
        <td class="r opt">${ckb(x.compensation)}</td>
      </tr>`);
    body = rows.length ? table([["Rank"], ["Address"], ["Cells", "r"], ["In the DAO", "r"], ["Compensation (est.)", "r opt"]], rows) : empty("No depositors yet.");
  } else {
    const rows = d.list.items.map((x) => `<tr>
        <td>${txLink(x.hash, { head: 20, tail: 20 })}</td>
        <td>${x.action}</td>
        <td>${blockLink(x.blockNumber)}</td>
        <td class="nowrap opt">${stamp(x.timestamp)}</td>
      </tr>`);
    body = rows.length ? table([["Transaction Hash"], ["Action"], ["Height"], ["Time", "opt"]], rows) : empty("No DAO transactions yet.");
  }
  const foot = d.list.total ? `<div class="card-foot">${pager(d.list, "#/dao", d.tab === "deposits" ? "" : `tab=${d.tab}`)}</div>` : "";
  return { title: "Nervos DAO", html: `${overview}<section class="card flush">${tabBar}${body}${foot}</section>` };
}

// ---------------------------------------------------------------- faucet

// Laid out like the official CKB faucet (faucet.nervos.org): a dark hero with the rules,
// "Send CKB to" and a Claim button, the faucet's balance, then the list of claims.
export async function faucet(q) {
  const f = await api("/api/faucet");
  const to = q.get("to") ?? "";
  const presets = [1000, 10000, 100000];
  const off = !f.available;

  const html = `
    <section class="faucet-hero">
      <img class="faucet-icon" src="/brand/ckb-token.png" width="72" height="72" alt="">
      <h1>CKB Devnet Faucet</h1>
      <p class="faucet-rules">Free CKB for your local devnet, sent from offckb's test account #${f.account?.index ?? 19}.
        Up to ${int(f.max)} CKB per claim. It only exists on this chain.</p>
      ${off ? `<div class="notice warn faucet-off"><p><b>The faucet is off.</b> ${esc(f.reason)}</p></div>` : ""}
      <form id="faucet-form" class="faucet-form" novalidate>
        <div class="faucet-row">
          <label for="faucet-to">Send CKB to</label>
          <input id="faucet-to" name="address" value="${esc(to)}" placeholder="Enter a devnet address (ckt1...)" autocomplete="off" spellcheck="false" required ${off ? "disabled" : ""}>
        </div>
        <div class="faucet-row">
          <span class="faucet-label" id="faucet-amount-label">Amount</span>
          <div class="segmented faucet-amounts" role="radiogroup" aria-labelledby="faucet-amount-label">
            ${presets.map((n, i) => `<label><input type="radio" name="preset" value="${n}"${i === 1 ? " checked" : ""} ${off ? "disabled" : ""}><span>${int(n)}</span></label>`).join("")}
            <label><input type="radio" name="preset" value="custom" ${off ? "disabled" : ""}><span>Custom</span></label>
          </div>
          <input class="faucet-custom" name="custom" type="number" inputmode="numeric" min="${f.min}" max="${f.max}" step="1" placeholder="CKB" aria-label="Custom amount in CKB" hidden>
        </div>
        <button class="btn primary faucet-claim" type="submit" ${off ? "disabled" : ""}>Claim</button>
        <p class="faucet-msg" role="status" aria-live="polite"></p>
      </form>
      <p class="faucet-balance" id="faucet-balance">${faucetBalance(f)}</p>
    </section>
    <div id="faucet-claims">${claimsCard(f.claims)}</div>`;

  // Live parts: the claims list and the balance update on their own, so the form keeps
  // whatever is being typed into it.
  const mount = (root) => {
    const form = root.querySelector("#faucet-form");
    const msg = form.querySelector(".faucet-msg");
    const custom = form.elements.custom;
    const refresh = async () => {
      try {
        const s = await api("/api/faucet");
        root.querySelector("#faucet-claims").innerHTML = claimsCard(s.claims);
        root.querySelector("#faucet-balance").innerHTML = faucetBalance(s);
      } catch {}
    };
    form.addEventListener("change", (e) => {
      if (e.target.name !== "preset") return;
      custom.hidden = e.target.value !== "custom";
      if (!custom.hidden) custom.focus();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const address = form.elements.address.value.trim();
      const preset = form.elements.preset.value;
      const amount = preset === "custom" ? Number(custom.value) : Number(preset);
      const say = (text, bad = false) => { msg.textContent = text; msg.classList.toggle("bad", bad); };
      if (!/^ckt1[0-9a-z]+$/.test(address)) return say("Enter a devnet address. It starts with ckt1.", true);
      if (!Number.isInteger(amount) || amount < f.min || amount > f.max) return say(`Choose a whole amount from ${int(f.min)} to ${int(f.max)} CKB.`, true);
      const button = form.querySelector(".faucet-claim");
      button.disabled = true;
      say(`Sending ${int(amount)} CKB… if another claim is still settling, this one waits for it.`);
      try {
        const claim = await claimCkb(address, amount);
        msg.classList.remove("bad");
        msg.innerHTML = `Sent ${int(amount)} CKB in ${txLink(claim.hash)}. It lands in the next few blocks.`;
        refresh();
      } catch (err) {
        say(err.message, true);
      } finally {
        button.disabled = false;
      }
    });
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  };

  return { title: "Faucet", html, mount };
}

function faucetBalance(f) {
  if (!f.account) return "";
  return `Faucet's current balance is ${f.balance != null ? ckb(f.balance) : "—"} · <a href="#/address/${f.account.address}">account #${f.account.index}</a>`;
}

function claimsCard(claims) {
  const status = (c) => c.status === "committed"
    ? `<span class="status">Committed</span> <small class="muted">${c.blockNumber != null ? `in ${blockLink(c.blockNumber)}` : ""}</small>`
    : c.status === "rejected" ? '<span class="status bad">Rejected</span>' : `<span class="status wait">${c.status === "proposed" ? "Proposed" : "Pending"}</span>`;
  const rows = claims.map((c) => `<tr>
      <td>${txLink(c.hash, { head: 12, tail: 10 })}</td>
      <td class="opt">${addrLink(c.to)}</td>
      <td class="r">${ckb(BigInt(c.amount) * 100000000n)}</td>
      <td>${status(c)}</td>
      <td class="nowrap opt">${stamp(c.time)}</td>
    </tr>`);
  return card({
    title: "Claims",
    count: claims.length || null,
    flush: true,
    aside: "Sent by this explorer since it started",
    body: claims.length ? table([["Transaction Hash"], ["To", "opt"], ["Amount", "r"], ["Status"], ["Time", "opt"]], rows) : "",
    empty: "No claims yet. Send some CKB to an address above and it shows up here.",
  }).replace('class="card-empty"', 'class="card-empty" style="padding:28px 40px"');
}
