import {
  absolute, addrLink, api, blockLink, cellList, ckb, esc, facts, int, pageHead, panel, scriptName, short,
  sourceBadge, tags, txLink, when, outPointLink, copyBtn, txKind, table, stat, progress, tabs, pager, delta, tokenDelta,
} from "./ui.js";

// Each page returns { title, html } and may set refresh: true for live updates.

const plural = (n, word) => `${int(n)} ${word}${n === 1 ? "" : "s"}`;
const viewAll = (href, label) => `<a class="view-all" href="${href}">${label} →</a>`;
const ageCell = (ms) => `<td class="r nowrap muted">${when(ms)}</td>`;

// ---------------------------------------------------------------- home

export async function home() {
  const h = await api("/api/home");
  const epochFraction = h.epoch.length ? (h.epoch.index + 1) / h.epoch.length : 0;
  const pool = h.pool.pending + h.pool.proposed;

  const stats = `<div class="stats">
    ${stat({ label: "Latest block", value: `#${int(h.tip)}`, sub: when(h.tipTimestamp), href: `#/block/${h.tip}` })}
    ${stat({ label: "Epoch", value: int(h.epoch.number), sub: `block ${int(h.epoch.index + 1)} of ${int(h.epoch.length)}`, extra: progress(epochFraction, "Epoch progress") })}
    ${stat({ label: "Block time", value: h.blockTime != null ? `${(h.blockTime / 1000).toFixed(1)}<small>s</small>` : "—", sub: "median of the last 20 blocks" })}
    ${stat({ label: "Transactions", value: int(h.transactionCount), sub: "on this chain, not counting block rewards", href: "#/transactions" })}
    ${stat({ label: "Tx pool", value: int(pool), sub: pool ? `${int(h.pool.pending)} pending · ${int(h.pool.proposed)} proposed` : "nothing waiting", href: "#/transactions?tab=pending" })}
    ${stat({ label: "Min fee rate", value: int(h.pool.minFeeRate), sub: "shannons per kB to enter the pool" })}
    ${stat({ label: "Difficulty", value: int(h.difficulty), sub: "fixed: a devnet's proof of work is a dummy" })}
    ${stat({ label: "Known scripts", value: int(h.knownScripts.genesis + h.knownScripts.project), sub: `${h.knownScripts.genesis} genesis · ${h.knownScripts.project} from your projects` })}
  </div>`;

  const blockRows = h.blocks.map((b) => `<tr>
      <td>${blockLink(b.number)}</td>
      <td class="r">${b.txs ? int(b.txs) : '<span class="muted">0</span>'}</td>
      <td class="r mono opt">${b.liveCellsChange > 0 ? "+" : ""}${int(b.liveCellsChange)}</td>
      <td class="opt">${b.miner ? addrLink(b.miner) : '<span class="muted">—</span>'}</td>
      ${ageCell(b.timestamp)}
    </tr>`);

  const txRows = h.transactions.map((t) => `<tr>
      <td>${txLink(t.hash)}</td>
      <td>${txKind(t)}</td>
      <td class="opt">${blockLink(t.blockNumber)}</td>
      ${ageCell(t.timestamp)}
    </tr>`);

  const html = `
    ${pageHead({ eyebrow: `Devnet <span class="pill ok">${esc(h.chain)}</span>`, title: "Your devnet at a glance" })}
    ${stats}
    <div class="grid-even">
      ${panel({
        title: "Latest blocks",
        aside: viewAll("#/blocks", "All blocks"),
        body: table([["Height"], ["Txs", "r"], ["Live cells", "r opt"], ["Miner", "opt"], ["Age", "r"]], blockRows),
      })}
      ${panel({
        title: "Latest transactions",
        aside: viewAll("#/transactions", "All transactions"),
        body: h.transactions.length ? table([["Hash"], ["What it did"], ["Block", "opt"], ["Age", "r"]], txRows) : "",
        empty: "No transactions yet. Deploy a contract or send CKB and it shows up here.",
      })}
    </div>
    ${yourScripts(h.scripts)}`;
  return { title: "Home", html, refresh: true };
}

function yourScripts(scripts) {
  const count = (c) => (c.n ? `${int(c.n)}${c.more ? "+" : ""}` : '<span class="muted">0</span>');
  const rows = scripts.map((s) => `<tr>
      <td><a class="script-name" href="#/script/${s.codeHash}/${s.hashType}">${esc(s.name)}</a></td>
      <td>${sourceBadge(s.source)}</td>
      <td>${s.deployed ? '<span class="pill ok">Deployed</span>' : '<span class="pill bad" title="The code cell in this deployment isn\'t on the chain">Not on this chain</span>'}</td>
      <td>${s.location ? outPointLink(s.location) : '<span class="muted">—</span>'}</td>
      <td class="r">${s.deployed ? count(s.asType) : "—"}</td>
      <td class="r">${s.deployed ? count(s.asLock) : "—"}</td>
    </tr>`);
  const stale = scripts.filter((s) => !s.deployed).length;
  return panel({
    title: "Your scripts",
    count: scripts.length || null,
    aside: stale ? `<span class="warn-text">${plural(stale, "deployment")} not on this chain: run <code>offckb deploy</code> again</span>` : "From your projects' deployment/scripts.json",
    body: scripts.length ? table([["Script"], ["Project"], ["Status"], ["Code cell"], ["Live cells as type", "r"], ["As lock", "r"]], rows) : "",
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
      <td class="opt"><a class="mono muted" href="#/block/${b.hash}" title="${b.hash}">${short(b.hash, 10, 6)}</a></td>
      <td class="r">${b.txs ? int(b.txs) : '<span class="muted">0</span>'}</td>
      <td class="r mono opt">${b.liveCellsChange > 0 ? "+" : ""}${int(b.liveCellsChange)}</td>
      <td class="r nowrap">${b.reward != null ? ckb(b.reward) : '<span class="muted" title="A block reward is final 11 blocks later">pending</span>'}</td>
      <td class="opt">${b.miner ? addrLink(b.miner) : '<span class="muted">Genesis</span>'}</td>
      ${ageCell(b.timestamp)}
    </tr>`);
  const html = `
    ${pageHead({ eyebrow: "Chain", title: "Blocks", sub: `${int(p.total)} blocks, newest first. An empty devnet still mines a block every few seconds.` })}
    ${panel({
      title: "Blocks",
      aside: `Page ${int(p.page)} of ${int(p.pages)}`,
      body: table([["Height"], ["Hash", "opt"], ["Txs", "r"], ["Live cells", "r opt"], ["Reward", "r"], ["Miner", "opt"], ["Age", "r"]], rows) + `<div class="panel-foot">${pager(p, "#/blocks")}</div>`,
    })}`;
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
    { label: "Committed", href: "#/transactions", current: !pending, count: list?.total },
    { label: "Pending", href: "#/transactions?tab=pending", current: pending, count: pool.transactions.length },
  ]);

  let body;
  if (pending) {
    const rows = pool.transactions.map((t) => `<tr>
        <td>${txLink(t.hash)}</td>
        <td><span class="pill ${t.status === "proposed" ? "ok" : "wait"}">${t.status === "proposed" ? "Proposed" : "Pending"}</span></td>
        <td>${tags(t.tags) || '<span class="muted">CKB transfer</span>'}</td>
        <td class="r nowrap">${ckb(t.fee)}</td>
        <td class="r nowrap mono">${t.feeRate != null ? int(t.feeRate) : "—"}</td>
        <td class="r mono">${int(t.size)}</td>
        <td class="r mono">${int(t.cycles)}</td>
        ${ageCell(t.timestamp)}
      </tr>`);
    body = panel({
      title: "In the tx pool",
      aside: `min fee rate ${int(pool.info.minFeeRate)} shannons/kB`,
      body: rows.length ? table([["Hash"], ["Status"], ["What it does"], ["Fee", "r"], ["Fee rate", "r"], ["Size", "r"], ["Cycles", "r"], ["Seen", "r"]], rows) : "",
      empty: "Nothing waiting. A transaction you send sits here until it's proposed and then committed, usually within a few blocks.",
    });
  } else {
    const rows = list.items.map((t) => `<tr>
        <td>${txLink(t.hash)}</td>
        <td>${txKind(t)}</td>
        <td class="opt">${blockLink(t.blockNumber)}</td>
        <td class="r nowrap mono opt">${int(t.inputs)} → ${int(t.outputs)}</td>
        <td class="r nowrap opt">${ckb(t.capacity)}</td>
        ${ageCell(t.timestamp)}
      </tr>`);
    body = panel({
      title: "Committed transactions",
      aside: list.total ? `Page ${int(list.page)} of ${int(list.pages)} · block rewards not listed` : "Block rewards (cellbase) not listed",
      body: rows.length ? table([["Hash"], ["What it did"], ["Block", "opt"], ["Cells", "r opt"], ["Output capacity", "r opt"], ["Age", "r"]], rows) + `<div class="panel-foot">${pager(list, "#/transactions")}</div>` : "",
      empty: "No transactions yet. Deploy a contract or send CKB and it shows up here.",
    });
  }
  const html = `
    ${pageHead({ eyebrow: "Chain", title: "Transactions" })}
    ${tabBar}
    ${body}`;
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
const statusPill = (s) => `<span class="pill ${STATUS[s]?.[0] ?? ""}">${STATUS[s]?.[1] ?? esc(s)}</span>`;

export async function transaction(hash) {
  const tx = await api(`/api/tx/${hash}`);
  if (tx.rejected) return rejected(tx);
  const inputsTotal = tx.inputs.reduce((a, c) => a + (c.capacity ? BigInt(c.capacity) : 0n), 0n);
  const inBlock = tx.blockNumber != null;

  const deps = tx.cellDeps.map((d) => `<tr>
      <td>${outPointLink(d)}</td>
      <td>${d.depType === "dep_group" ? "dep group" : "code"}</td>
      <td>${d.provides.length ? d.provides.map((p) => `<a class="script-name" href="#/script/${p.codeHash}/${p.hashType}">${esc(p.name)}</a> ${sourceBadge(p.source)}`).join(", ") : '<span class="muted">not a known script</span>'}</td>
    </tr>`);

  const changes = tx.changes.map((c) => `<tr>
      <td>${addrLink(c.address)}<span class="sub">${esc(c.lockName ?? "unknown lock")}</span></td>
      <td class="r nowrap">${delta(c.ckb)}</td>
      <td>${c.tokens.length ? c.tokens.map((t) => `<span class="token-change">${tokenDelta(t.amount)} <span class="chip k-udt">${t.standard}</span> ${scriptName(t.type, { badge: false })}</span>`).join("") : '<span class="muted">—</span>'}</td>
    </tr>`);

  const witnesses = tx.witnesses.map((w, i) => `<tr>
      <td class="muted mono">${i}</td>
      <td class="r mono">${int(w.size)} B</td>
      <td>${w.args ? `<span class="wa">WitnessArgs</span> ${[["lock", w.args.lock], ["input_type", w.args.inputType], ["output_type", w.args.outputType]].map(([k, v]) => `<span class="wa-field${v == null ? " none" : ""}">${k} ${v == null ? "—" : `${int(v)} B`}</span>`).join("")}` : w.size ? '<span class="muted">raw bytes</span>' : '<span class="muted">empty</span>'}</td>
      <td>${w.size ? `<details class="hex"><summary>hex</summary><code>${esc(w.preview)}${w.size > 512 ? "…" : ""}</code></details>` : ""}</td>
    </tr>`);

  const actions = `<button class="btn" type="button" data-copy-url="/api/tx/${tx.hash}/raw">Copy JSON</button>
    <a class="btn" href="/api/tx/${tx.hash}/raw" download="${tx.hash}.json">Download JSON</a>`;

  const html = `
    ${pageHead({ eyebrow: `Transaction ${statusPill(tx.status)}`, title: tx.hash, hash: tx.hash, aside: actions })}
    ${inBlock ? "" : `<div class="notice warn"><p><b>Not in a block yet.</b> The node accepted it into the tx pool. It's committed once a block includes it, usually within a few blocks on a devnet.</p></div>`}
    ${facts([
      ["Block", inBlock ? `${blockLink(tx.blockNumber)} <small>${plural(tx.confirmations, "confirmation")}</small>` : "Not in a block yet"],
      ["Time", tx.timestamp ? `${absolute(tx.timestamp)} <small>${when(tx.timestamp)}</small>` : absolute(tx.timestamp)],
      ["Cells", `${tx.inputs.length} consumed → ${tx.outputs.length} created`],
      ["Fee", tx.fee != null ? `<span class="num">${ckb(tx.fee)}</span> <small>${int(tx.feeRate)} shannons/kB</small>` : tx.cellbase ? "None (block reward)" : "—", "Input capacity minus output capacity"],
      ["Size", `<span class="num">${int(tx.size)}</span> <small>bytes</small>`],
      ["Cycles", tx.cycles != null ? `<span class="num">${int(tx.cycles)}</span>` : "—", "CKB-VM cycles used by all the scripts this transaction ran"],
    ])}
    ${changes.length ? panel({
      title: "Balance changes",
      aside: "What each address gained or paid, fee included",
      body: table([["Address"], ["CKB", "r"], ["Tokens"]], changes),
    }) : ""}
    ${panel({
      title: "Consumed cells",
      count: tx.inputs.length,
      aside: inputsTotal ? ckb(inputsTotal) : "",
      body: cellList(tx.inputs, { role: "input", openAll: tx.inputs.length + tx.outputs.length <= 3 }),
    })}
    ${panel({
      title: "Created cells",
      count: tx.outputs.length,
      aside: ckb(tx.outputs.reduce((a, c) => a + BigInt(c.capacity), 0n)),
      body: cellList(tx.outputs, { role: "output", openAll: tx.inputs.length + tx.outputs.length <= 3 }),
    })}
    <div class="grid-even">
      ${panel({
        title: "Cell deps",
        count: tx.cellDeps.length,
        aside: "Code read without being consumed",
        body: tx.cellDeps.length ? table([["Out point"], ["Kind"], ["Provides"]], deps) : "",
        empty: "None.",
      })}
      ${panel({
        title: "Header deps",
        count: tx.headerDeps.length,
        aside: "Headers its scripts can read",
        body: tx.headerDeps.length ? `<ul class="block-list">${tx.headerDeps.map((h) => `<li>
          <span class="n">${h.number != null ? blockLink(h.number) : "?"}</span>
          <a class="mono muted" href="#/block/${h.hash}" title="${h.hash}">${short(h.hash)}</a>
        </li>`).join("")}</ul>` : "",
        empty: "None. The Nervos DAO uses these to check when a deposit was made.",
      })}
    </div>
    ${panel({
      title: "Witnesses",
      count: tx.witnesses.length,
      aside: "Signatures and other proof, one per input group",
      body: tx.witnesses.length ? table([["#"], ["Size", "r"], ["Layout"], [""]], witnesses) : "",
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
    ${pageHead({ eyebrow: `Transaction ${statusPill("rejected")}`, title: tx.hash, hash: tx.hash })}
    <div class="notice error"><div>
      <p><b>The node rejected this transaction${type ? ` (${esc(type)})` : ""}.</b> ${esc(REJECT_TYPES[type] ?? "")}${code ? ` A script returned error code <b>${esc(code)}</b>${script ? ` (the ${esc(script[3].toLowerCase())} script of ${esc(script[1].toLowerCase().replace(/s$/, ""))} #${esc(script[2])})` : ""}.` : ""}</p>
      ${description ? `<pre class="reason">${esc(description)}</pre>` : ""}
      <p class="muted">The node only remembers a rejected transaction's hash and reason, not its contents, and forgets them after a while.</p>
    </div></div>`;
  return { title: `Rejected ${short(tx.hash)}`, html };
}

// ---------------------------------------------------------------- block

export async function block(id) {
  const b = await api(`/api/block/${id}`);
  const nav = `<a class="btn" href="#/block/${b.number - 1}"${b.number === 0 ? ' aria-disabled="true"' : ""}>← #${int(Math.max(0, b.number - 1))}</a>
    <a class="btn" href="#/block/${b.number + 1}"${b.number >= b.tip ? ' aria-disabled="true"' : ""}>#${int(b.number + 1)} →</a>`;
  const rows = b.transactions.map((t, i) => `<tr>
      <td class="muted mono">${i}</td>
      <td>${txLink(t.hash)}</td>
      <td>${t.cellbase ? '<span class="muted">Cellbase (block reward)</span>' : txKind({ ...t, blockNumber: b.number })}</td>
      <td class="r nowrap mono">${t.cellbase ? "—" : int(t.inputs)} → ${int(t.outputs)}</td>
      <td class="r nowrap">${ckb(t.capacity)}</td>
      <td class="r mono">${t.cycles != null ? int(t.cycles) : '<span class="muted">—</span>'}</td>
    </tr>`);
  const r = b.reward;
  const reward = r
    ? `<span class="num">${ckb(r.total)}</span><span class="breakdown">base ${ckb(r.base)} · secondary ${ckb(r.secondary)} · fees ${ckb(BigInt(r.committed) + BigInt(r.proposal))}</span>`
    : b.number === 0 ? '<span class="muted">None for genesis</span>' : `<span class="muted">Final in ${plural(b.finalizedIn, "block")}</span>`;

  const headerFields = Object.entries(b.header).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  const html = `
    ${pageHead({ eyebrow: "Block", title: `#${int(b.number)}`, aside: nav })}
    ${facts([
      ["Hash", `<span class="mono">${short(b.hash, 12, 8)}</span> ${copyBtn(b.hash, "block hash")}`],
      ["Time", b.timestamp ? `${absolute(b.timestamp)} <small>${when(b.timestamp)}</small>` : absolute(b.timestamp)],
      ["Miner", b.miner ? addrLink(b.miner) : '<span class="muted">Genesis</span>', "The lock in the cellbase witness. Its reward is paid 11 blocks later."],
      ["Reward", reward, "What the miner of this block earns"],
      ["Transactions", `<span class="num">${int(b.transactions.length - 1)}</span> <small>plus the cellbase</small>`],
      ["Epoch", `<span class="num">${int(b.epoch.number)}</span> <small>block ${int(b.epoch.index + 1)} of ${int(b.epoch.length)}</small>`],
      ["Confirmations", `<span class="num">${int(b.confirmations)}</span>`],
      ["Size", b.size != null ? `<span class="num">${int(b.size)}</span> <small>bytes</small>` : "—"],
      ["Cycles", `<span class="num">${int(b.cycles)}</span>`, "CKB-VM cycles of every transaction in the block"],
      ["Difficulty", `<span class="num">${int(b.difficulty)}</span>`],
      ["Nonce", `<span class="mono">${esc(b.nonce)}</span>`],
      ["Miner message", b.minerMessage ? `<span class="mono">${esc(b.minerMessage)}</span>` : '<span class="muted">—</span>', "Free text in the cellbase witness. offckb's node writes its version here."],
      ["Parent", b.number > 0 ? `<a class="mono" href="#/block/${b.number - 1}" title="${b.parentHash}">${short(b.parentHash, 10, 6)}</a>` : '<span class="muted">Genesis has no parent</span>'],
      ["Proposals", `<span class="num">${int(b.proposals.length)}</span>`, "Transactions this block proposes for inclusion within the next few blocks"],
      ["Uncles", `<span class="num">${int(b.uncles.length)}</span>`],
      ["Version", `<span class="num">${int(Number(b.header.version))}</span>`],
    ], 4)}
    ${panel({
      title: "Transactions",
      count: b.transactions.length,
      body: table([["#"], ["Hash"], ["What it did"], ["Cells", "r"], ["Output capacity", "r"], ["Cycles", "r"]], rows),
    })}
    ${b.proposals.length ? panel({
      title: "Proposals",
      count: b.proposals.length,
      aside: "Short ids (first 10 bytes of the tx hash)",
      body: `<ul class="plain-list mono">${b.proposals.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`,
    }) : ""}
    ${b.uncles.length ? panel({
      title: "Uncles",
      count: b.uncles.length,
      body: `<ul class="block-list">${b.uncles.map((u) => `<li><span class="n">#${int(u.number)}</span><span class="mono muted">${short(u.hash)}</span></li>`).join("")}</ul>`,
    }) : ""}
    <details class="panel raw-panel">
      <summary class="panel-head"><h2>Raw header</h2><span class="aside">As the node returns it</span></summary>
      <div class="raw"><dl>${headerFields}</dl></div>
    </details>`;
  return { title: `Block #${b.number}`, html };
}

// ---------------------------------------------------------------- address

export async function address(addr) {
  const a = await api(`/api/address/${addr}`);
  const tokens = a.tokens.map((t) => `<tr>
      <td><span class="chip k-udt">${t.standard}</span> ${scriptName(t.type)}</td>
      <td class="mono" title="${t.owner}">${short(t.owner, 10, 6)}</td>
      <td class="r mono"><b>${BigInt(t.amount).toLocaleString("en-US")}</b></td>
      <td class="r">${t.cells}</td>
    </tr>`).join("");
  const txs = a.transactions.map((t) => `<tr>
      <td>${txLink(t.hash)}</td>
      <td>${blockLink(t.blockNumber)}</td>
      <td>${t.spent ? `<span class="muted">spent ${t.spent} cell${t.spent === 1 ? "" : "s"}</span>` : ""}${t.spent && t.received ? " · " : ""}${t.received ? `received ${t.received} cell${t.received === 1 ? "" : "s"}` : ""}</td>
      <td class="r nowrap muted">${when(t.timestamp)}</td>
    </tr>`).join("");

  const html = `
    ${pageHead({ eyebrow: "Address", title: a.address, hash: a.address })}
    ${facts([
      ["Balance", `<span class="num">${ckb(a.balance)}</span>`, "Capacity of every live cell this address owns"],
      ["Live cells", `<span class="num">${int(a.liveCells)}${a.moreCells ? "+" : ""}</span>`],
      ["Lock", scriptName(a.lock)],
      ["Bytes in use", `<span class="num">${int(a.occupied)}</span> <small>across these cells</small>`],
      ["Tokens", a.tokens.length ? `${a.tokens.length} kind${a.tokens.length === 1 ? "" : "s"}` : '<span class="muted">none</span>'],
      ["Lock args", `<span class="mono">${short(a.lock.args, 12, 8)}</span>`],
    ])}
    ${a.tokens.length ? panel({
      title: "Tokens",
      count: a.tokens.length,
      aside: "One row per type script",
      body: `<div class="table-scroll"><table class="table"><thead><tr><th>Token</th><th>Issuer lock hash</th><th class="r">Balance</th><th class="r">Cells</th></tr></thead><tbody>${tokens}</tbody></table></div>`,
    }) : ""}
    ${panel({
      title: "Live cells",
      count: `${int(a.liveCells)}${a.moreCells ? "+" : ""}`,
      aside: a.cells.length < a.liveCells ? `newest ${a.cells.length} shown` : "",
      body: a.cells.length ? cellList(a.cells, { role: "output" }) : "",
      empty: "This address owns no live cells.",
    })}
    ${panel({
      title: "Transactions",
      aside: a.transactions.length === 25 ? "latest 25" : "",
      body: a.transactions.length ? `<div class="table-scroll"><table class="table"><thead><tr><th>Transaction</th><th>Block</th><th>Cells</th><th class="r">When</th></tr></thead><tbody>${txs}</tbody></table></div>` : "",
      empty: "No transactions touch this address yet.",
    })}`;
  return { title: `Address ${short(a.address, 10, 6)}`, html };
}

// ---------------------------------------------------------------- script

export async function script(codeHash, hashType) {
  const s = await api(`/api/script/${codeHash}/${hashType}`);
  const count = (c) => (c ? `${c.n}${c.more ? "+" : ""}` : "—");
  const missing = s.location && s.locationLive === false;
  const usedBy = (c) => `<span class="num">${count(c)}</span> <small>live cell${c?.n === 1 && !c.more ? "" : "s"}</small>`;
  const html = `
    ${pageHead({
      eyebrow: "Script",
      title: s.name ? `${esc(s.name)} ${sourceBadge(s.source)}` : "Unknown script",
      sub: s.name ? null : "Not in offckb's system scripts or any project passed with --project.",
    })}
    ${missing ? `<div class="notice warn"><p><b>This deployment isn't on the chain.</b> The deployment file points at a code cell this devnet doesn't have, usually because <code>offckb clean</code> reset the chain after it was deployed. Run <code>offckb deploy</code> again and restart the explorer.</p></div>` : ""}
    ${facts([
      ["Code hash", `<span class="mono">${short(s.codeHash, 14, 10)}</span> ${copyBtn(s.codeHash, "code hash")}`],
      ["Hash type", `<span class="mono">${esc(s.hashType)}</span> <small>${s.hashType === "type" ? "matched against a code cell's type script hash" : "matched against a code cell's data hash"}</small>`],
      ["Code cell", s.location ? `${outPointLink(s.location)} ${s.locationLive ? '<span class="pill ok">Live</span>' : '<span class="pill bad">Missing</span>'}${s.location.depType === "depGroup" ? " <small>dep group</small>" : ""}` : '<span class="muted">Unknown</span>'],
      ["Used as type", usedBy(s.counts?.asType ?? (s.asType.length ? { n: s.asType.length, more: s.asType.length === 20 } : null))],
      ["Used as lock", usedBy(s.counts?.asLock ?? (s.asLock.length ? { n: s.asLock.length, more: s.asLock.length === 20 } : null))],
      ["Source", s.source === "genesis" ? "Built into the devnet" : s.source ? `Your project <b>${esc(s.source)}</b>` : "—"],
    ])}
    ${s.asType.length || !s.asLock.length ? panel({
      title: "Cells using it as type",
      aside: s.asType.length === 20 ? "newest 20" : "",
      body: s.asType.length ? cellList(s.asType, { role: "output" }) : "",
      empty: "No live cell uses this script as its type.",
    }) : ""}
    ${s.asLock.length ? panel({
      title: "Cells using it as lock",
      aside: s.asLock.length === 20 ? "newest 20" : "",
      body: cellList(s.asLock, { role: "output" }),
    }) : ""}`;
  return { title: s.name ? `Script ${s.name}` : "Unknown script", html };
}
