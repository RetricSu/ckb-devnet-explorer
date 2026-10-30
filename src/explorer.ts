import { ccc } from "@ckb-ccc/core";
import { getBlock, rpc, rpcBatch, type RpcBlock, type RpcOutput, type RpcScript, type RpcTransaction } from "./rpc.ts";
import { Resolver, type Resolved } from "./resolver.ts";
import { dataHash, decodeByType, scriptHash, type Decoded } from "./decode.ts";
import { ChainIndex, parseCellbaseWitness, type BlockSummary, type TxSummary } from "./chain.ts";
import { decodeSince, difficultyOf, epochOf, parseWitness, type Since } from "./txfields.ts";
import type { KnownScript } from "./scripts.ts";

const ZERO_HASH = "0x" + "0".repeat(64);
const hex = (n: number | bigint) => "0x" + n.toString(16);
const num = (h: string) => Number(BigInt(h));

export type ScriptView = RpcScript & { resolved: Resolved; bytes: number; hash: string };
export type CellStatus = { state: "live" } | { state: "spent"; by: string | null } | { state: "pending" };
export type CellView = {
  capacity: string; // shannons, decimal string
  lock: ScriptView;
  type: ScriptView | null;
  address: string;
  dataLength: number;
  dataPreview: string; // hex, first 256 bytes
  dataHash: string | null;
  occupied: number; // bytes, i.e. minimum CKB
  decoded: Decoded | null;
  outPoint?: { txHash: string; index: number };
  status?: CellStatus;
  blockNumber?: number;
  since?: Since;
};
export type Unresolved = { unresolved: string };

type RpcInput = { previous_output: { tx_hash: string; index: string }; since: string };
type FullTx = RpcTransaction & {
  version: string;
  cell_deps: { out_point: { tx_hash: string; index: string }; dep_type: string }[];
  header_deps: string[];
  inputs: RpcInput[];
  witnesses: string[];
};
type FullHeader = {
  number: string; hash: string; parent_hash: string; timestamp: string; epoch: string; compact_target: string;
  nonce: string; version: string; transactions_root: string; proposals_hash: string; extra_hash: string; dao: string;
};
type FullBlock = { header: FullHeader; transactions: FullTx[]; proposals: string[]; uncles: { header: FullHeader }[] };
type TxStatus = { status: string; block_number: string | null; block_hash?: string | null; reason?: string | null };
type TxResponse = { transaction: FullTx | null; cycles?: string | null; tx_status: TxStatus };
type IndexerCell = { block_number: string; out_point: { tx_hash: string; index: string }; output: RpcOutput; output_data: string | null };
type SearchKey = Record<string, unknown>;
type PoolEntry = { cycles: string; size: string; fee: string; timestamp: string; ancestors_count: string };
type EconomicState = {
  issuance: { primary: string; secondary: string };
  miner_reward: { primary: string; secondary: string; committed: string; proposal: string };
  txs_fee: string;
  finalized_at: string;
};

const scriptBytes = (s: RpcScript) => 32 + 1 + (s.args.length - 2) / 2;
const toCcc = (s: RpcScript) => ccc.Script.from({ codeHash: s.code_hash, hashType: s.hash_type as ccc.HashType, args: s.args });
// Address encoding only needs the prefix, not a network connection.
const DEVNET_PREFIX = { addressPrefix: "ckt" } as unknown as ccc.Client;
const addressOf = (s: RpcScript) => ccc.Address.fromScript(toCcc(s), DEVNET_PREFIX).toString();

// Serialized size of a transaction as the node counts it for fees (the extra 4 bytes are its
// offset in the block). CCC can't take the RPC's snake_case JSON directly, hence the mapping.
function txSize(t: FullTx) {
  const s = (x: RpcScript | null) => x && { codeHash: x.code_hash, hashType: x.hash_type as ccc.HashType, args: x.args };
  return ccc.Transaction.from({
    version: t.version,
    cellDeps: t.cell_deps.map((d) => ({ outPoint: { txHash: d.out_point.tx_hash, index: d.out_point.index }, depType: d.dep_type === "dep_group" ? "depGroup" : "code" })),
    headerDeps: t.header_deps,
    inputs: t.inputs.map((i) => ({ previousOutput: { txHash: i.previous_output.tx_hash, index: i.previous_output.index }, since: i.since })),
    outputs: t.outputs.map((o) => ({ capacity: o.capacity, lock: s(o.lock)!, type: s(o.type) })),
    outputsData: t.outputs_data,
    witnesses: t.witnesses,
  }).toBytes().length + 4;
}

const page = <T>(all: T[], pageNo: number, size: number) => {
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, pageNo), pages);
  // Newest first: page 1 is the end of the array.
  const end = total - (p - 1) * size;
  return { page: p, pages, size, total, items: all.slice(Math.max(0, end - size), end).reverse() };
};

export class Explorer {
  // Full blocks for detail pages. Small, since the index keeps the summaries.
  private blocks = new Map<number, RpcBlock | null>();
  private tags = new Map<string, string[]>();
  readonly index: ChainIndex;

  constructor(private url: string, private resolver: Resolver) {
    this.index = new ChainIndex(url, (b) => this.summarize(b as unknown as FullBlock), () => {
      this.blocks.clear();
      this.tags.clear();
    });
  }

  async tip() {
    await this.index.sync();
    return this.index.tip;
  }

  private async block(n: number) {
    if (!this.blocks.has(n)) {
      if (this.blocks.size > 500) this.blocks.delete(this.blocks.keys().next().value!);
      this.blocks.set(n, await getBlock(this.url, n));
    }
    return this.blocks.get(n)!;
  }

  private timestampOf(block: RpcBlock) {
    return num((block.header as unknown as { timestamp: string }).timestamp);
  }

  private summarize(b: FullBlock): { block: BlockSummary; txs: TxSummary[] } {
    const number = num(b.header.number);
    const timestamp = num(b.header.timestamp);
    const consumed = b.transactions.slice(1).reduce((a, t) => a + t.inputs.length, 0);
    const created = b.transactions.reduce((a, t) => a + t.outputs.length, 0);
    return {
      block: {
        number, hash: b.header.hash, timestamp, txs: b.transactions.length - 1,
        miner: parseCellbaseWitness(b.transactions[0]?.witnesses[0])?.lock ?? null,
        liveCellsChange: created - consumed,
      },
      txs: b.transactions.slice(1).map((t) => ({
        hash: t.hash, blockNumber: number, timestamp, inputs: t.inputs.length, outputs: t.outputs.length,
        capacity: t.outputs.reduce((a, o) => a + BigInt(o.capacity), 0n).toString(),
        tags: this.tagsFor(t),
      })),
    };
  }

  // ---- home -----------------------------------------------------------------------------

  async home() {
    const tip = await this.tip();
    const recent = this.index.blocks.slice(-21).reverse();
    // Median, not mean: the devnet only mines while `offckb node` runs, so the gap across a
    // restart would otherwise swamp the real block time.
    const gaps = recent.slice(1).map((b, i) => recent[i].timestamp - b.timestamp).sort((a, b) => a - b);
    const [info, epoch, pool, scripts] = await Promise.all([
      rpc<{ chain: string; difficulty: string }>(this.url, "get_blockchain_info"),
      rpc<{ number: string; start_number: string; length: string }>(this.url, "get_current_epoch"),
      rpc<{ pending: string; proposed: string; min_fee_rate: string }>(this.url, "tx_pool_info"),
      Promise.all(this.resolver.all().filter((s) => s.source !== "genesis").map((s) => this.scriptSummary(s))),
    ]);
    return {
      chain: info.chain,
      tip,
      tipTimestamp: recent[0]?.timestamp ?? null,
      blockTime: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      epoch: { number: num(epoch.number), index: tip - num(epoch.start_number), length: num(epoch.length) },
      difficulty: BigInt(info.difficulty).toString(),
      transactionCount: this.index.txs.length,
      pool: { pending: num(pool.pending), proposed: num(pool.proposed), minFeeRate: num(pool.min_fee_rate) },
      knownScripts: { genesis: this.resolver.all().filter((s) => s.source === "genesis").length, project: scripts.length },
      blocks: recent.slice(0, 10).map((b) => this.blockRow(b)),
      transactions: this.index.txs.slice(-10).reverse(),
      scripts,
      resets: this.index.resets,
    };
  }

  // A project script is only usable if the cell its deployment points at is still live.
  // After `offckb clean` the deployment file still lists it, but the chain doesn't have it.
  private async scriptSummary(s: KnownScript) {
    const deployed = s.location ? (await this.liveState(s.location.txHash, s.location.index)) === "live" : false;
    const [asType, asLock] = await Promise.all([this.countCells(s, "type"), this.countCells(s, "lock")]);
    return { name: s.name, source: s.source, codeHash: s.codeHash, hashType: s.hashType, location: s.location, deployed, asType, asLock };
  }

  // ---- lists ----------------------------------------------------------------------------

  private blockRow(b: BlockSummary) {
    return { ...b, miner: b.miner ? addressOf(b.miner) : null };
  }

  async blockList(pageNo: number, size: number) {
    await this.tip();
    const p = page(this.index.blocks, pageNo, size);
    // Rewards are only known once a block is finalized, 11 blocks later on a devnet.
    const states = await rpcBatch<EconomicState | null>(this.url, p.items.map((b) => ["get_block_economic_state", [b.hash]]));
    return {
      ...p,
      items: p.items.map((b, i) => ({ ...this.blockRow(b), reward: states[i] ? minerReward(states[i]!).toString() : null })),
    };
  }

  async transactionList(pageNo: number, size: number) {
    await this.tip();
    return page(this.index.txs, pageNo, size);
  }

  // Transactions the node has accepted but not yet put in a block.
  async pool() {
    const [info, raw] = await Promise.all([
      rpc<{ pending: string; proposed: string; orphan: string; min_fee_rate: string; total_tx_size: string; total_tx_cycles: string }>(this.url, "tx_pool_info"),
      rpc<{ pending: Record<string, PoolEntry>; proposed: Record<string, PoolEntry> }>(this.url, "get_raw_tx_pool", [true]),
    ]);
    const entries = [
      ...Object.entries(raw.pending).map(([hash, e]) => ({ hash, status: "pending", e })),
      ...Object.entries(raw.proposed).map(([hash, e]) => ({ hash, status: "proposed", e })),
    ];
    const txs = await Promise.all(entries.map(({ hash }) => rpc<TxResponse | null>(this.url, "get_transaction", [hash])));
    return {
      info: {
        pending: num(info.pending), proposed: num(info.proposed), orphan: num(info.orphan),
        minFeeRate: num(info.min_fee_rate), totalSize: num(info.total_tx_size), totalCycles: num(info.total_tx_cycles),
      },
      transactions: entries.map(({ hash, status, e }, i) => {
        const t = txs[i]?.transaction;
        const size = num(e.size);
        return {
          hash, status, fee: BigInt(e.fee).toString(), size, cycles: num(e.cycles), timestamp: num(e.timestamp),
          feeRate: size ? Number((BigInt(e.fee) * 1000n) / BigInt(size)) : null,
          inputs: t?.inputs.length ?? null, outputs: t?.outputs.length ?? null, tags: t ? this.tagsFor(t) : [],
        };
      }).sort((a, b) => b.timestamp - a.timestamp),
    };
  }

  // ---- transaction ----------------------------------------------------------------------

  async transaction(hash: string) {
    const tip = await this.tip();
    const res = await rpc<TxResponse | null>(this.url, "get_transaction", [hash]);
    if (!res) return null;
    // The node remembers recently rejected transactions and why, but not their contents.
    if (!res.transaction) {
      if (res.tx_status.status === "rejected") return { hash, status: "rejected", reason: res.tx_status.reason ?? null, rejected: true };
      return null;
    }
    const tx = res.transaction;
    const blockNumber = res.tx_status.block_number ? num(res.tx_status.block_number) : null;
    const block = blockNumber !== null ? await this.block(blockNumber) : null;
    const cellbase = tx.inputs.length === 1 && tx.inputs[0].previous_output.tx_hash === ZERO_HASH;

    const inputs: (CellView | Unresolved)[] = await Promise.all(tx.inputs.map(async ({ previous_output: p, since }) => {
      if (p.tx_hash === ZERO_HASH) return { unresolved: "Cellbase: newly mined CKB, no input cell" };
      const prev = await rpc<TxResponse | null>(this.url, "get_transaction", [p.tx_hash]);
      const i = num(p.index);
      const out = prev?.transaction?.outputs[i];
      if (!out) return { unresolved: `${p.tx_hash}:${i}` };
      return { ...this.cell(out, prev!.transaction!.outputs_data[i]), outPoint: { txHash: p.tx_hash, index: i }, since: decodeSince(since) };
    }));

    const outputs = await Promise.all(tx.outputs.map(async (o, i) => {
      const outPoint = { txHash: tx.hash, index: i };
      return { ...this.cell(o, tx.outputs_data[i]), outPoint, status: await this.status(outPoint, o.lock, blockNumber) };
    }));

    const resolvedInputs = inputs.filter((c): c is CellView => "capacity" in c);
    const fee = !cellbase && resolvedInputs.length === inputs.length
      ? resolvedInputs.reduce((a, c) => a + BigInt(c.capacity), 0n) - outputs.reduce((a, c) => a + BigInt(c.capacity), 0n)
      : null;
    const size = txSize(tx);

    return {
      hash: tx.hash,
      blockNumber,
      blockHash: block?.header.hash ?? null,
      timestamp: block ? this.timestampOf(block) : null,
      confirmations: blockNumber !== null ? tip - blockNumber : null,
      status: res.tx_status.status,
      cellbase,
      version: num(tx.version),
      fee: fee?.toString() ?? null,
      size,
      // Same unit the node's min fee rate uses: shannons per 1000 bytes.
      feeRate: fee !== null ? Number((fee * 1000n) / BigInt(size)) : null,
      cycles: res.cycles ? num(res.cycles) : null,
      cellDeps: tx.cell_deps.map((d) => {
        const txHash = d.out_point.tx_hash;
        const index = num(d.out_point.index);
        const provides = this.resolver.all().filter((s) => s.location?.txHash === txHash && s.location.index === index);
        return { txHash, index, depType: d.dep_type, provides: provides.map((s) => ({ name: s.name, source: s.source, codeHash: s.codeHash, hashType: s.hashType })) };
      }),
      headerDeps: await Promise.all(tx.header_deps.map(async (h) => {
        const header = await rpc<{ number: string } | null>(this.url, "get_header", [h]);
        return { hash: h, number: header ? num(header.number) : null };
      })),
      witnesses: tx.witnesses.map(parseWitness),
      changes: cellbase ? [] : balanceChanges(resolvedInputs, outputs),
      inputs,
      outputs,
    };
  }

  // The transaction exactly as the node returns it, for copying or saving.
  async rawTransaction(hash: string) {
    const res = await rpc<TxResponse | null>(this.url, "get_transaction", [hash]);
    return res?.transaction ?? null;
  }

  // ---- block ----------------------------------------------------------------------------

  async blockDetail(id: string) {
    const tip = await this.tip();
    const hash = /^0x[0-9a-f]{64}$/i.test(id) ? id.toLowerCase() : Number(id) <= tip ? this.index.blocks[Number(id)]?.hash : null;
    if (!hash) return null;
    const [withCycles, packed, state] = await rpcBatch<unknown>(this.url, [
      ["get_block", [hash, null, true]],
      ["get_block", [hash, "0x0"]],
      ["get_block_economic_state", [hash]],
    ]) as [{ block: FullBlock; cycles: string[] | null } | null, string | null, EconomicState | null];
    if (!withCycles) return null;
    const b = withCycles.block;
    const h = b.header;
    const n = num(h.number);
    const cellbase = parseCellbaseWitness(b.transactions[0]?.witnesses[0]);
    const reward = state && {
      total: minerReward(state).toString(),
      base: BigInt(state.miner_reward.primary).toString(),
      secondary: BigInt(state.miner_reward.secondary).toString(),
      committed: BigInt(state.miner_reward.committed).toString(),
      proposal: BigInt(state.miner_reward.proposal).toString(),
      fees: BigInt(state.txs_fee).toString(),
    };
    const cycles = withCycles.cycles ?? [];
    return {
      number: n,
      hash: h.hash,
      parentHash: h.parent_hash,
      timestamp: num(h.timestamp),
      epoch: epochOf(h.epoch),
      confirmations: tip - n,
      tip,
      miner: cellbase ? addressOf(cellbase.lock) : null,
      minerMessage: cellbase?.message || null,
      reward,
      finalizedIn: reward ? null : Math.max(0, n + 11 - tip),
      difficulty: difficultyOf(h.compact_target).toString(),
      nonce: BigInt(h.nonce).toString(),
      size: packed ? (packed.length - 2) / 2 : null,
      cycles: cycles.reduce((a, c) => a + num(c), 0),
      proposals: b.proposals,
      uncles: b.uncles.map((u) => ({ hash: u.header.hash, number: num(u.header.number) })),
      header: h,
      transactions: b.transactions.map((t, i) => ({
        hash: t.hash,
        cellbase: i === 0,
        inputs: i === 0 ? 0 : t.inputs.length,
        outputs: t.outputs.length,
        capacity: t.outputs.reduce((a, o) => a + BigInt(o.capacity), 0n).toString(),
        cycles: i === 0 ? null : cycles[i - 1] ? num(cycles[i - 1]) : null,
        tags: i === 0 ? [] : this.tagsFor(t),
      })),
    };
  }

  // ---- address --------------------------------------------------------------------------

  async address(address: string) {
    const tip = await this.tip();
    const parsed = await ccc.Address.fromString(address, DEVNET_PREFIX);
    const lock: RpcScript = { code_hash: parsed.script.codeHash, hash_type: parsed.script.hashType, args: parsed.script.args };
    const key = { script: lock, script_type: "lock" };

    const [capacity, cellsPage, txPage] = await Promise.all([
      rpc<{ capacity: string } | null>(this.url, "get_cells_capacity", [key]),
      rpc<{ objects: IndexerCell[] }>(this.url, "get_cells", [key, "desc", "0xc8"]),
      rpc<{ objects: { tx_hash: string; block_number: string; cells: [string, string][] }[] }>(
        this.url, "get_transactions", [{ ...key, group_by_transaction: true }, "desc", "0x19"]),
    ]);

    const cells = cellsPage.objects.map((c) => this.indexerCell(c, { state: "live" }));

    // Token balances: sum every UDT cell this address holds, per token (its type script).
    const tokens = new Map<string, { standard: string; owner: string; amount: bigint; cells: number; type: ScriptView }>();
    for (const c of cells) {
      if (c.decoded?.kind !== "udt" || !c.type) continue;
      const t = tokens.get(c.type.hash) ?? { standard: c.decoded.standard, owner: c.decoded.owner, amount: 0n, cells: 0, type: c.type };
      t.amount += BigInt(c.decoded.amount);
      t.cells += 1;
      tokens.set(c.type.hash, t);
    }

    const transactions = txPage.objects.map((t) => {
      const block = this.index.blocks[num(t.block_number)];
      return {
        hash: t.tx_hash,
        blockNumber: num(t.block_number),
        timestamp: block?.timestamp ?? null,
        spent: t.cells.filter(([io]) => io === "input").length,
        received: t.cells.filter(([io]) => io === "output").length,
      };
    });

    return {
      address: parsed.toString(),
      lock: { ...lock, resolved: this.resolver.resolve(lock), bytes: scriptBytes(lock), hash: scriptHash(lock) },
      balance: capacity ? BigInt(capacity.capacity).toString() : "0",
      liveCells: cells.length,
      moreCells: cellsPage.objects.length === 200,
      occupied: cells.reduce((a, c) => a + c.occupied, 0),
      tokens: [...tokens.values()].map((t) => ({ ...t, amount: t.amount.toString() })),
      cells: cells.slice(0, 50),
      transactions,
      tip,
    };
  }

  // ---- script ---------------------------------------------------------------------------

  async script(codeHash: string, hashType: string) {
    await this.tip();
    const known = this.resolver.lookup(codeHash, hashType);
    const script: RpcScript = { code_hash: codeHash.toLowerCase(), hash_type: hashType, args: "0x" };
    const prefixes = this.resolver.usagePrefixes({ codeHash: script.code_hash, hashType });
    const [asType, asLock] = await Promise.all(
      (["type", "lock"] as const).map(async (role) => {
        const pages = await Promise.all(prefixes.map((prefix) => rpc<{ objects: IndexerCell[] }>(this.url, "get_cells", [
          { script: prefix, script_type: role, script_search_mode: "prefix" }, "desc", "0x14"])));
        return pages.flatMap((p) => p.objects).slice(0, 20).map((c) => this.indexerCell(c, { state: "live" }));
      }),
    );
    const location = known?.location ?? null;
    return {
      codeHash: script.code_hash,
      hashType,
      name: known?.name ?? null,
      source: known?.source ?? null,
      location,
      locationLive: location ? (await this.liveState(location.txHash, location.index)) === "live" : null,
      counts: known ? { asType: await this.countCells(known, "type"), asLock: await this.countCells(known, "lock") } : null,
      asType,
      asLock,
    };
  }

  // ---- search ---------------------------------------------------------------------------

  async search(q: string): Promise<{ route: string } | { error: string }> {
    const query = q.trim().replace(/,/g, "");
    if (/^#?\d+$/.test(query)) return { route: `#/block/${Number(query.replace("#", ""))}` };
    if (/^ck[bt]1[0-9a-z]+$/i.test(query)) return { route: `#/address/${query}` };
    if (/^0x[0-9a-f]{64}$/i.test(query)) {
      const h = query.toLowerCase();
      const tx = await rpc<TxResponse | null>(this.url, "get_transaction", [h]);
      if (tx?.transaction || tx?.tx_status.status === "rejected") return { route: `#/tx/${h}` };
      const block = await rpc<unknown>(this.url, "get_header", [h]);
      if (block) return { route: `#/block/${h}` };
      const script = this.resolver.all().find((s) => s.codeHash === h);
      if (script) return { route: `#/script/${h}/${script.hashType}` };
      return { error: `${short(h)} isn't a transaction, a block or a known script code hash on this devnet.` };
    }
    return { error: "Search takes a transaction hash, block number or hash, address, or script code hash." };
  }

  // ---- shared ---------------------------------------------------------------------------

  private async liveState(txHash: string, index: number) {
    const res = await rpc<{ status: string }>(this.url, "get_live_cell", [{ tx_hash: txHash, index: hex(index) }, false]);
    return res.status;
  }

  // Counts live cells that use a script, stopping at 100 so a busy lock doesn't stall the page.
  private async countCells(s: { codeHash: string; hashType: string }, role: "lock" | "type"): Promise<{ n: number; more: boolean }> {
    const pages = await Promise.all(this.resolver.usagePrefixes(s).map((script) => {
      const key: SearchKey = { script, script_type: role, script_search_mode: "prefix", with_data: false };
      return rpc<{ objects: unknown[] }>(this.url, "get_cells", [key, "asc", "0x64"]);
    }));
    const n = pages.reduce((a, p) => a + p.objects.length, 0);
    return { n: Math.min(n, 100), more: n >= 100 };
  }

  // Whether an output is still live, and if not, which transaction consumed it.
  private async status(outPoint: { txHash: string; index: number }, lock: RpcScript, createdIn: number | null): Promise<CellStatus> {
    if (createdIn === null) return { state: "pending" };
    if ((await this.liveState(outPoint.txHash, outPoint.index)) === "live") return { state: "live" };

    // The node's built-in indexer lists every transaction that touched this lock, so the
    // spender is the first one after creation with an input pointing back at this cell.
    let cursor: string | undefined;
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      const params: unknown[] = [
        { script: lock, script_type: "lock", filter: { block_range: [hex(createdIn), hex(this.index.tip + 1)] }, group_by_transaction: false },
        "asc",
        "0x64",
      ];
      if (cursor) params.push(cursor);
      const res = await rpc<{ objects: { tx_hash: string; io_type: string; io_index: string }[]; last_cursor: string }>(this.url, "get_transactions", params);
      for (const o of res.objects) {
        if (o.io_type !== "input") continue;
        const spender = await rpc<TxResponse | null>(this.url, "get_transaction", [o.tx_hash]);
        const input = spender?.transaction?.inputs[num(o.io_index)];
        if (input && input.previous_output.tx_hash === outPoint.txHash && num(input.previous_output.index) === outPoint.index)
          return { state: "spent", by: o.tx_hash };
      }
      if (res.objects.length < 100) break;
      cursor = res.last_cursor;
    }
    return { state: "spent", by: null };
  }

  private indexerCell(c: IndexerCell, status: CellStatus): CellView {
    return {
      ...this.cell(c.output, c.output_data ?? "0x"),
      outPoint: { txHash: c.out_point.tx_hash, index: num(c.out_point.index) },
      blockNumber: num(c.block_number),
      status,
    };
  }

  private tagsFor(tx: RpcTransaction): string[] {
    if (!this.tags.has(tx.hash)) {
      const tags = new Set<string>();
      tx.outputs.forEach((o, i) => {
        const cell = this.cell(o, tx.outputs_data[i]);
        const tag = tagOf(cell.decoded) ?? scriptTag(cell.type?.resolved);
        if (tag) tags.add(tag);
      });
      this.tags.set(tx.hash, [...tags]);
    }
    return this.tags.get(tx.hash)!;
  }

  private cell(out: RpcOutput, data: string): CellView {
    const lock = { ...out.lock, resolved: this.resolver.resolve(out.lock), bytes: scriptBytes(out.lock), hash: scriptHash(out.lock) };
    const type = out.type
      ? { ...out.type, resolved: this.resolver.resolve(out.type), bytes: scriptBytes(out.type), hash: scriptHash(out.type) }
      : null;
    const dataLength = (data.length - 2) / 2;
    const hashOfData = dataLength ? dataHash(data) : null;

    const code = this.resolver.codeCell(hashOfData, type?.hash ?? null);
    const decoded: Decoded | null = code
      ? { kind: "code", name: code.script.name, source: code.script.source, matchedBy: code.matchedBy, codeHash: code.script.codeHash, hashType: code.script.hashType }
      : decodeByType(out.type, type?.resolved ?? null, data);

    return {
      capacity: BigInt(out.capacity).toString(),
      lock,
      type,
      address: addressOf(out.lock),
      dataLength,
      dataPreview: data.slice(0, 2 + 512),
      dataHash: hashOfData,
      occupied: 8 + lock.bytes + (type?.bytes ?? 0) + dataLength,
      decoded,
    };
  }
}

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

const minerReward = (s: EconomicState) =>
  BigInt(s.miner_reward.primary) + BigInt(s.miner_reward.secondary) + BigInt(s.miner_reward.committed) + BigInt(s.miner_reward.proposal);

// Net effect of a transaction on each address: CKB and every token it holds.
function balanceChanges(inputs: CellView[], outputs: CellView[]) {
  const by = new Map<string, { address: string; lockName: string | null; ckb: bigint; tokens: Map<string, { standard: string; type: ScriptView; amount: bigint }> }>();
  const apply = (c: CellView, sign: 1n | -1n) => {
    const e = by.get(c.address) ?? { address: c.address, lockName: c.lock.resolved.inner?.name ?? c.lock.resolved.name, ckb: 0n, tokens: new Map() };
    e.ckb += sign * BigInt(c.capacity);
    if (c.decoded?.kind === "udt" && c.type) {
      const t = e.tokens.get(c.type.hash) ?? { standard: c.decoded.standard, type: c.type, amount: 0n };
      t.amount += sign * BigInt(c.decoded.amount);
      e.tokens.set(c.type.hash, t);
    }
    by.set(c.address, e);
  };
  inputs.forEach((c) => apply(c, -1n));
  outputs.forEach((c) => apply(c, 1n));
  return [...by.values()].map((e) => ({
    address: e.address,
    lockName: e.lockName,
    ckb: e.ckb.toString(),
    tokens: [...e.tokens.values()].filter((t) => t.amount !== 0n).map((t) => ({ standard: t.standard, type: t.type, amount: t.amount.toString() })),
  }));
}

// Cells we can't decode still say something when their type is one of your own scripts
// (or a JS contract run by ckb_js_vm): the feed shows the contract's name.
function scriptTag(r: Resolved | undefined): string | null {
  if (r?.inner?.name) return r.inner.name;
  if (r?.name && r.source !== "genesis") return r.name;
  return null;
}

function tagOf(d: Decoded | null): string | null {
  if (!d) return null;
  switch (d.kind) {
    case "code": return `code: ${d.name}`;
    case "dao-deposit": return "DAO deposit";
    case "dao-withdrawing": return "DAO withdrawal";
    case "udt": return d.standard;
    case "spore": return "spore";
    case "cluster": return "cluster";
    case "type-id": return "Type ID";
    case "invalid": return `invalid ${d.standard}`;
  }
}
