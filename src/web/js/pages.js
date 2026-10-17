import {
  absolute, addrLink, api, blockLink, cellList, ckb, esc, facts, int, pageHead, panel, scriptName, short,
  sourceBadge, tags, txLink, when, outPointLink, copyBtn,
} from "./ui.js";

// Each page returns { title, html } and may return a refresh() for live updates.

// ---------------------------------------------------------------- overview

export async function overview() {
  const o = await api("/api/overview");
  const seconds = o.blockTime != null ? (o.blockTime / 1000).toFixed(1) : null;

  const txRows = o.transactions.map((t) => `<tr>
      <td>${txLink(t.hash)}</td>
      <td>${blockLink(t.blockNumber)}</td>
      <td>${tags(t.tags) || '<span class="muted">CKB transfer</span>'}</td>
      <td class="r nowrap">${t.outputs}</td>
      <td class="r nowrap muted">${when(t.timestamp)}</td>
    </tr>`).join("");

  const scripts = o.scripts.map((s) => {
    const used = (c) => `${c.n}${c.more ? "+" : ""}`;
    const usage = [s.asType.n ? `${used(s.asType)} as type` : "", s.asLock.n ? `${used(s.asLock)} as lock` : ""].filter(Boolean).join(", ") || "no live cells use it";
    return `<li>
      <span><a class="script-name" href="#/script/${s.codeHash}/${s.hashType}">${esc(s.name)}</a> ${sourceBadge(s.source)}</span>
      ${s.deployed ? `<span class="pill ok">Deployed</span>` : `<span class="pill bad" title="The code cell in this deployment isn't on the chain">Not on this chain</span>`}
      <span class="meta">${s.deployed ? usage : "Redeploy it with <code>offckb deploy</code>: the deployment file points at a cell this chain doesn't have."}</span>
    </li>`;
  }).join("");

  const blocks = o.blocks.slice(0, 8).map((b) => `<li>
      <span class="n">${blockLink(b.number)}</span>
      <span class="${b.transactions ? "" : "muted"}">${b.transactions ? `${b.transactions} tx${b.transactions === 1 ? "" : "s"}` : "empty"}</span>
      <span class="when">${when(b.timestamp)}</span>
    </li>`).join("");

  const html = `
    ${pageHead({ eyebrow: "Overview", title: "Your devnet" })}
    <section class="panel"><div class="status-line">
      <span class="item">Tip <b>#${int(o.tip)}</b></span>
      ${seconds ? `<span class="item">Block time <b>${seconds}s</b></span>` : ""}
      <span class="item">Scripts known <b>${o.knownScripts.genesis + o.knownScripts.project}</b> <span>(${o.knownScripts.project} from your projects)</span></span>
    </div></section>
    <div class="grid-2">
      <div>
        ${panel({
          title: "Latest transactions",
          aside: "Cellbase rewards hidden",
          body: o.transactions.length ? `<div class="table-scroll"><table class="table">
            <thead><tr><th>Transaction</th><th>Block</th><th>What it did</th><th class="r">Outputs</th><th class="r">When</th></tr></thead>
            <tbody>${txRows}</tbody></table></div>` : "",
          empty: "No transactions yet. Deploy a contract or send CKB and it shows up here.",
        })}
      </div>
      <div>
        ${panel({
          title: "Your scripts",
          count: o.scripts.length || null,
          body: o.scripts.length ? `<ul class="script-list">${scripts}</ul>` : "",
          empty: "No project scripts loaded. Start the explorer with <code>--project path/to/your-project</code> to name your own contracts.",
        })}
        ${panel({ title: "Latest blocks", body: `<ul class="block-list">${blocks}</ul>` })}
      </div>
    </div>`;
  return { title: "Overview", html, refresh: true };
}

// ---------------------------------------------------------------- transaction

export async function transaction(hash) {
  const tx = await api(`/api/tx/${hash}`);
  const statusPill = tx.status === "committed" ? `<span class="pill ok">Committed</span>` : `<span class="pill wait">${esc(tx.status)}</span>`;
  const inputsTotal = tx.inputs.reduce((a, c) => a + (c.capacity ? BigInt(c.capacity) : 0n), 0n);

  const deps = tx.cellDeps.map((d) => `<tr>
      <td>${outPointLink(d)}</td>
      <td>${d.depType === "dep_group" ? "dep group" : "code"}</td>
      <td>${d.provides.length ? d.provides.map((p) => `<a class="script-name" href="#/script/${p.codeHash}/${p.hashType}">${esc(p.name)}</a> ${sourceBadge(p.source)}`).join(", ") : '<span class="muted">not a known script</span>'}</td>
    </tr>`).join("");

  const html = `
    ${pageHead({ eyebrow: `Transaction ${statusPill}`, title: tx.hash, hash: tx.hash })}
    ${facts([
      ["Block", tx.blockNumber != null ? `${blockLink(tx.blockNumber)} <small>${int(tx.confirmations)} confirmation${tx.confirmations === 1 ? "" : "s"}</small>` : "Not in a block yet"],
      ["Time", tx.timestamp ? `${absolute(tx.timestamp)} <small>${when(tx.timestamp)}</small>` : "—"],
      ["Cells", `${tx.inputs.length} consumed → ${tx.outputs.length} created`],
      ["Fee", tx.fee != null ? `<span class="num">${ckb(tx.fee)}</span> <small>${int(tx.feeRate)} shannons/kB</small>` : tx.cellbase ? "None (block reward)" : "—", "Input capacity minus output capacity"],
      ["Size", `<span class="num">${int(tx.size)}</span> <small>bytes</small>`],
      ["Cycles", tx.cycles != null ? `<span class="num">${int(tx.cycles)}</span>` : "—", "CKB-VM cycles used by all the scripts this transaction ran"],
    ])}
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
    ${panel({
      title: "Cell deps",
      count: tx.cellDeps.length,
      aside: "Cells this transaction reads code from without consuming them",
      body: tx.cellDeps.length ? `<div class="table-scroll"><table class="table"><thead><tr><th>Out point</th><th>Kind</th><th>Provides</th></tr></thead><tbody>${deps}</tbody></table></div>` : "",
      empty: "None.",
    })}`;
  return { title: `Transaction ${short(tx.hash)}`, html };
}

// ---------------------------------------------------------------- block

export async function block(id) {
  const b = await api(`/api/block/${id}`);
  const nav = `<a class="btn" href="#/block/${b.number - 1}"${b.number === 0 ? ' aria-disabled="true"' : ""}>← #${int(Math.max(0, b.number - 1))}</a>
    <a class="btn" href="#/block/${b.number + 1}"${b.number >= b.tip ? ' aria-disabled="true"' : ""}>#${int(b.number + 1)} →</a>`;
  const rows = b.transactions.map((t, i) => `<tr>
      <td class="muted mono">${i}</td>
      <td>${txLink(t.hash)}</td>
      <td>${t.cellbase ? '<span class="muted">Cellbase (block reward)</span>' : tags(t.tags) || '<span class="muted">CKB transfer</span>'}</td>
      <td class="r nowrap">${t.cellbase ? "—" : t.inputs} → ${t.outputs}</td>
      <td class="r nowrap">${ckb(t.capacity)}</td>
    </tr>`).join("");
  const html = `
    ${pageHead({ eyebrow: "Block", title: `#${int(b.number)}`, aside: nav })}
    ${facts([
      ["Hash", `<span class="mono">${short(b.hash, 14, 10)}</span> ${copyBtn(b.hash, "block hash")}`],
      ["Time", `${absolute(b.timestamp)} <small>${when(b.timestamp)}</small>`],
      ["Confirmations", `<span class="num">${int(b.confirmations)}</span>`],
      ["Epoch", `<span class="num">${int(b.epoch.number)}</span> <small>block ${int(b.epoch.index)} of ${int(b.epoch.length)}</small>`],
      ["Parent", b.number > 0 ? `<a class="mono" href="#/block/${b.number - 1}" title="${b.parentHash}">${short(b.parentHash, 10, 6)}</a>` : "Genesis has no parent"],
      ["Transactions", `<span class="num">${b.transactions.length - 1}</span> <small>plus the cellbase</small>`],
    ])}
    ${panel({
      title: "Transactions",
      count: b.transactions.length,
      body: `<div class="table-scroll"><table class="table"><thead><tr><th>#</th><th>Transaction</th><th>What it did</th><th class="r">Cells</th><th class="r">Output capacity</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    })}`;
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
      ["Used as type", `<span class="num">${count(s.counts?.asType ?? (s.asType.length ? { n: s.asType.length, more: s.asType.length === 20 } : null))}</span> <small>live cells</small>`],
      ["Used as lock", `<span class="num">${count(s.counts?.asLock ?? (s.asLock.length ? { n: s.asLock.length, more: s.asLock.length === 20 } : null))}</span> <small>live cells</small>`],
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
