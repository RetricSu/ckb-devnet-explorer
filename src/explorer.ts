import { ccc } from "@ckb-ccc/core";
import { getBlock, getTipNumber, rpc, type RpcBlock, type RpcOutput, type RpcScript, type RpcTransaction } from "./rpc.ts";
import { Resolver, type Resolved } from "./resolver.ts";
import { dataHash, decodeByType, scriptHash, type Decoded } from "./decode.ts";
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
type TxResponse = { transaction: FullTx; cycles?: string | null; tx_status: { status: string; block_number: string | null; block_hash?: string | null } };
type IndexerCell = { block_number: string; out_point: { tx_hash: string; index: string }; output: RpcOutput; output_data: string | null };
type SearchKey = Record<string, unknown>;

const scriptBytes = (s: RpcScript) => 32 + 1 + (s.args.length - 2) / 2;
const toCcc = (s: RpcScript) => ccc.Script.from({ codeHash: s.code_hash, hashType: s.hash_type as ccc.HashType, args: s.args });
// Address encoding only needs the prefix, not a network connection.
const DEVNET_PREFIX = { addressPrefix: "ckt" } as unknown as ccc.Client;

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

function epochOf(packed: string) {
  const e = BigInt(packed);
  return { number: Number(e & 0xffffffn), index: Number((e >> 24n) & 0xffffn), length: Number((e >> 40n) & 0xffffn) };
}

// Devnet blocks never change once mined, until `offckb clean` wipes the chain.
// Cache by number and drop everything if the tip ever goes backwards.
export class Explorer {
  private blocks = new Map<number, RpcBlock | null>();
  private tags = new Map<string, string[]>();
  private lastTip = -1;

  constructor(private url: string, private resolver: Resolver) {}

  async tip() {
    const tip = await getTipNumber(this.url);
    if (tip < this.lastTip) {
      this.blocks.clear();
      this.tags.clear();
    }
    this.lastTip = tip;
    return tip;
  }

  private async block(n: number) {
    if (!this.blocks.has(n)) this.blocks.set(n, await getBlock(this.url, n));
    return this.blocks.get(n)!;
  }

  private timestampOf(block: RpcBlock) {
    return num((block.header as unknown as { timestamp: string }).timestamp);
  }

  // ---- overview -------------------------------------------------------------------------

  async overview() {
    const tip = await this.tip();
    const recent = await Promise.all(Array.from({ length: Math.min(21, tip + 1) }, (_, i) => this.block(tip - i)));
    const blocks = recent.filter((b): b is RpcBlock => !!b);
    // Median, not mean: the devnet only mines while `offckb node` runs, so the gap across a
    // restart would otherwise swamp the real block time.
    const gaps = blocks.slice(1).map((b, i) => this.timestampOf(blocks[i]) - this.timestampOf(b)).sort((a, b) => a - b);
    const scripts = await Promise.all(this.resolver.all().filter((s) => s.source !== "genesis").map((s) => this.scriptSummary(s)));
    const { transactions } = await this.recentTransactions(12);
    return {
      tip,
      blockTime: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      knownScripts: { genesis: this.resolver.all().filter((s) => s.source === "genesis").length, project: scripts.length },
      blocks: blocks.slice(0, 10).map((b) => ({
        number: num(b.header.number),
        hash: b.header.hash,
        timestamp: this.timestampOf(b),
        transactions: b.transactions.length - 1,
      })),
      transactions,
      scripts,
    };
  }

  async recentTransactions(limit: number, maxBlocks = 5000) {
    const tip = await this.tip();
    const found: { hash: string; blockNumber: number; outputs: number; timestamp: number; tags: string[] }[] = [];
    for (let n = tip; n >= 0 && n > tip - maxBlocks && found.length < limit; n -= 50) {
      const numbers = Array.from({ length: Math.min(50, n + 1) }, (_, i) => n - i);
      const blocks = await Promise.all(numbers.map((b) => this.block(b)));
      for (const block of blocks) {
        if (!block) continue;
        for (const tx of block.transactions.slice(1)) {
          if (found.length >= limit) break;
          found.push({ hash: tx.hash, blockNumber: num(block.header.number), outputs: tx.outputs.length, timestamp: this.timestampOf(block), tags: this.tagsFor(tx) });
        }
      }
    }
    return { tip, transactions: found };
  }

  // A project script is only usable if the cell its deployment points at is still live.
  // After `offckb clean` the deployment file still lists it, but the chain doesn't have it.
  private async scriptSummary(s: KnownScript) {
    const deployed = s.location ? (await this.liveState(s.location.txHash, s.location.index)) === "live" : false;
    const [asType, asLock] = await Promise.all([this.countCells(s, "type"), this.countCells(s, "lock")]);
    return { name: s.name, source: s.source, codeHash: s.codeHash, hashType: s.hashType, location: s.location, deployed, asType, asLock };
  }

  // ---- transaction ----------------------------------------------------------------------

  async transaction(hash: string) {
    // The spender search below needs a current tip for its block range.
    const tip = await this.tip();
    const res = await rpc<TxResponse | null>(this.url, "get_transaction", [hash]);
    if (!res?.transaction) return null;
    const tx = res.transaction;
    const blockNumber = res.tx_status.block_number ? num(res.tx_status.block_number) : null;
    const block = blockNumber !== null ? await this.block(blockNumber) : null;
    const cellbase = tx.inputs.length === 1 && tx.inputs[0].previous_output.tx_hash === ZERO_HASH;

    const inputs: (CellView | Unresolved)[] = await Promise.all(tx.inputs.map(async ({ previous_output: p }) => {
      if (p.tx_hash === ZERO_HASH) return { unresolved: "Cellbase: newly mined CKB, no input cell" };
      const prev = await rpc<TxResponse | null>(this.url, "get_transaction", [p.tx_hash]);
      const i = num(p.index);
      const out = prev?.transaction.outputs[i];
      if (!out) return { unresolved: `${p.tx_hash}:${i}` };
      return { ...this.cell(out, prev!.transaction.outputs_data[i]), outPoint: { txHash: p.tx_hash, index: i } };
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
      headerDeps: tx.header_deps,
      inputs,
      outputs,
    };
  }

  // ---- block ----------------------------------------------------------------------------

  async blockDetail(id: string) {
    const tip = await this.tip();
    let block: RpcBlock | null;
    if (/^0x[0-9a-f]{64}$/i.test(id)) block = await rpc<RpcBlock | null>(this.url, "get_block", [id.toLowerCase()]);
    else block = Number(id) <= tip ? await this.block(Number(id)) : null;
    if (!block) return null;
    const n = num(block.header.number);
    const header = block.header as unknown as { parent_hash: string; epoch: string; timestamp: string };
    return {
      number: n,
      hash: block.header.hash,
      parentHash: header.parent_hash,
      timestamp: this.timestampOf(block),
      epoch: epochOf(header.epoch),
      confirmations: tip - n,
      tip,
      transactions: block.transactions.map((t, i) => ({
        hash: t.hash,
        cellbase: i === 0,
        inputs: i === 0 ? 0 : (t as FullTx).inputs.length,
        outputs: t.outputs.length,
        capacity: t.outputs.reduce((a, o) => a + BigInt(o.capacity), 0n).toString(),
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

    const transactions = await Promise.all(txPage.objects.map(async (t) => {
      const block = await this.block(num(t.block_number));
      return {
        hash: t.tx_hash,
        blockNumber: num(t.block_number),
        timestamp: block ? this.timestampOf(block) : null,
        spent: t.cells.filter(([io]) => io === "input").length,
        received: t.cells.filter(([io]) => io === "output").length,
      };
    }));

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
    const [asType, asLock] = await Promise.all(
      (["type", "lock"] as const).map(async (role) => {
        const page = await rpc<{ objects: IndexerCell[] }>(this.url, "get_cells", [
          { script, script_type: role, script_search_mode: "prefix" }, "desc", "0x14"]);
        return page.objects.map((c) => this.indexerCell(c, { state: "live" }));
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
    const query = q.trim();
    if (/^\d+$/.test(query)) return { route: `#/block/${Number(query)}` };
    if (/^ck[bt]1[0-9a-z]+$/i.test(query)) return { route: `#/address/${query}` };
    if (/^0x[0-9a-f]{64}$/i.test(query)) {
      const h = query.toLowerCase();
      const tx = await rpc<TxResponse | null>(this.url, "get_transaction", [h]);
      if (tx?.transaction) return { route: `#/tx/${h}` };
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
    const key: SearchKey = { script: { code_hash: s.codeHash, hash_type: s.hashType, args: "0x" }, script_type: role, script_search_mode: "prefix" };
    const page = await rpc<{ objects: unknown[] }>(this.url, "get_cells", [{ ...key, with_data: false }, "asc", "0x64"]);
    return { n: page.objects.length, more: page.objects.length === 100 };
  }

  // Whether an output is still live, and if not, which transaction consumed it.
  private async status(outPoint: { txHash: string; index: number }, lock: RpcScript, createdIn: number | null): Promise<CellStatus> {
    if (createdIn === null) return { state: "pending" };
    if ((await this.liveState(outPoint.txHash, outPoint.index)) === "live") return { state: "live" };

    // The node's built-in indexer lists every transaction that touched this lock, so the
    // spender is the first one after creation with an input pointing back at this cell.
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const params: unknown[] = [
        { script: lock, script_type: "lock", filter: { block_range: [hex(createdIn), hex(this.lastTip + 1)] }, group_by_transaction: false },
        "asc",
        "0x64",
      ];
      if (cursor) params.push(cursor);
      const res = await rpc<{ objects: { tx_hash: string; io_type: string; io_index: string }[]; last_cursor: string }>(this.url, "get_transactions", params);
      for (const o of res.objects) {
        if (o.io_type !== "input") continue;
        const spender = await rpc<TxResponse | null>(this.url, "get_transaction", [o.tx_hash]);
        const input = spender?.transaction.inputs[num(o.io_index)];
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
        const tag = tagOf(this.cell(o, tx.outputs_data[i]).decoded);
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
      address: ccc.Address.fromScript(toCcc(out.lock), DEVNET_PREFIX).toString(),
      dataLength,
      dataPreview: data.slice(0, 2 + 512),
      dataHash: hashOfData,
      occupied: 8 + lock.bytes + (type?.bytes ?? 0) + dataLength,
      decoded,
    };
  }
}

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

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
