import { ccc } from "@ckb-ccc/core";
import { getBlock, getTipNumber, rpc, type RpcOutput, type RpcScript, type RpcTransaction } from "./rpc.ts";
import { Resolver, type Resolved } from "./resolver.ts";
import { dataHash, decodeByType, scriptHash, type Decoded } from "./decode.ts";

const ZERO_HASH = "0x" + "0".repeat(64);
const hex = (n: number | bigint) => "0x" + n.toString(16);

export type ScriptView = RpcScript & { resolved: Resolved; bytes: number; hash: string };
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
  status?: { state: "live" } | { state: "spent"; by: string | null } | { state: "pending" };
};
export type TxView = {
  hash: string;
  blockNumber: number | null;
  status: string;
  cellbase: boolean;
  fee: string | null; // shannons
  cycles: number | null;
  inputs: (CellView | { unresolved: string })[];
  outputs: CellView[];
};

type FullTx = RpcTransaction & { inputs: { previous_output: { tx_hash: string; index: string } }[] };
type TxResponse = { transaction: FullTx; cycles?: string | null; tx_status: { status: string; block_number: string | null } };

const scriptBytes = (s: RpcScript) => 32 + 1 + (s.args.length - 2) / 2;
// Address encoding only needs the prefix, not a network connection.
const DEVNET_PREFIX = { addressPrefix: "ckt" } as unknown as ccc.Client;

// Devnet blocks never change once mined, until `offckb clean` wipes the chain.
// Cache by number and drop everything if the tip ever goes backwards.
export class Explorer {
  private blocks = new Map<number, Awaited<ReturnType<typeof getBlock>>>();
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
          found.push({
            hash: tx.hash,
            blockNumber: Number(BigInt(block.header.number)),
            outputs: tx.outputs.length,
            timestamp: Number(BigInt((block.header as unknown as { timestamp: string }).timestamp)),
            tags: this.tagsFor(tx),
          });
        }
      }
    }
    return { tip, transactions: found };
  }

  async transaction(hash: string): Promise<TxView | null> {
    // The spender search below needs a current tip for its block range.
    await this.tip();
    const res = await rpc<TxResponse | null>(this.url, "get_transaction", [hash]);
    if (!res?.transaction) return null;
    const tx = res.transaction;
    const blockNumber = res.tx_status.block_number ? Number(BigInt(res.tx_status.block_number)) : null;
    const cellbase = tx.inputs.length === 1 && tx.inputs[0].previous_output.tx_hash === ZERO_HASH;

    const inputs: (CellView | { unresolved: string })[] = await Promise.all(tx.inputs.map(async ({ previous_output: p }) => {
      if (p.tx_hash === ZERO_HASH) return { unresolved: "Cellbase: newly mined CKB, no input cell" };
      const prev = await rpc<TxResponse | null>(this.url, "get_transaction", [p.tx_hash]);
      const i = Number(BigInt(p.index));
      const out = prev?.transaction.outputs[i];
      if (!out) return { unresolved: `${p.tx_hash}:${i}` };
      return { ...this.cell(out, prev!.transaction.outputs_data[i]), outPoint: { txHash: p.tx_hash, index: i } };
    }));

    const outputs = await Promise.all(tx.outputs.map(async (o, i) => {
      const cell = this.cell(o, tx.outputs_data[i]);
      const outPoint = { txHash: tx.hash, index: i };
      return { ...cell, outPoint, status: await this.status(outPoint, o.lock, blockNumber) };
    }));

    const resolvedInputs = inputs.filter((c): c is CellView => "capacity" in c);
    const fee = !cellbase && resolvedInputs.length === inputs.length
      ? (resolvedInputs.reduce((a, c) => a + BigInt(c.capacity), 0n) - outputs.reduce((a, c) => a + BigInt(c.capacity), 0n)).toString()
      : null;

    return {
      hash: tx.hash,
      blockNumber,
      status: res.tx_status.status,
      cellbase,
      fee,
      cycles: res.cycles ? Number(BigInt(res.cycles)) : null,
      inputs,
      outputs,
    };
  }

  async blockTransactions(n: number) {
    const block = await this.block(n);
    if (!block) return null;
    return {
      number: n,
      hash: block.header.hash,
      transactions: block.transactions.map((t, i) => ({ hash: t.hash, cellbase: i === 0, outputs: t.outputs.length, tags: i === 0 ? [] : this.tagsFor(t) })),
    };
  }

  // Whether an output is still live, and if not, which transaction consumed it.
  private async status(outPoint: { txHash: string; index: number }, lock: RpcScript, createdIn: number | null): Promise<CellView["status"]> {
    if (createdIn === null) return { state: "pending" };
    const live = await rpc<{ status: string }>(this.url, "get_live_cell", [{ tx_hash: outPoint.txHash, index: hex(outPoint.index) }, false]);
    if (live.status === "live") return { state: "live" };

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
        const input = spender?.transaction.inputs[Number(BigInt(o.io_index))];
        if (input && input.previous_output.tx_hash === outPoint.txHash && Number(BigInt(input.previous_output.index)) === outPoint.index)
          return { state: "spent", by: o.tx_hash };
      }
      if (res.objects.length < 100) break;
      cursor = res.last_cursor;
    }
    return { state: "spent", by: null };
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
      ? { kind: "code", name: code.script.name, source: code.script.source, matchedBy: code.matchedBy }
      : decodeByType(out.type, type?.resolved ?? null, data);

    return {
      capacity: BigInt(out.capacity).toString(),
      lock,
      type,
      address: ccc.Address.fromScript(
        ccc.Script.from({ codeHash: out.lock.code_hash, hashType: out.lock.hash_type as ccc.HashType, args: out.lock.args }),
        DEVNET_PREFIX,
      ).toString(),
      dataLength,
      dataPreview: data.slice(0, 2 + 512),
      dataHash: hashOfData,
      occupied: 8 + lock.bytes + (type?.bytes ?? 0) + dataLength,
      decoded,
    };
  }
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
