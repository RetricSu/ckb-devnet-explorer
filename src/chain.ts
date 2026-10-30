import { getTipNumber, rpc, rpcBatch, type RpcBlock, type RpcScript } from "./rpc.ts";

export type BlockSummary = {
  number: number;
  hash: string;
  timestamp: number;
  txs: number; // not counting the cellbase
  miner: RpcScript | null;
  liveCellsChange: number; // cells created minus cells consumed
};

export type TxSummary = {
  hash: string;
  blockNumber: number;
  timestamp: number;
  inputs: number;
  outputs: number;
  capacity: string; // total output capacity, shannons
  tags: string[];
};

type Summarize = (block: RpcBlock) => { block: BlockSummary; txs: TxSummary[] };

// A list of every block and transaction on the devnet, kept in memory. It's what lets the
// explorer page through history and count totals without a database: a devnet is small
// (reading 4,500 blocks takes about 0.3 s in batches), so building it is cheap, and after
// `offckb clean` it notices the chain changed and builds it again.
export class ChainIndex {
  blocks: BlockSummary[] = [];
  txs: TxSummary[] = []; // oldest first
  resets = 0;
  private running: Promise<void> | null = null;

  constructor(private url: string, private summarize: Summarize, private onReset: () => void) {}

  get tip() {
    return this.blocks.length - 1;
  }

  // Concurrent callers share one sync.
  sync(): Promise<void> {
    this.running ??= this.catchUp().finally(() => (this.running = null));
    return this.running;
  }

  private async catchUp() {
    const tip = await getTipNumber(this.url);
    const last = this.blocks.at(-1);
    if (last) {
      // Same height but a different hash means the chain was rebuilt between two syncs.
      const header = tip >= last.number ? await rpc<{ hash: string } | null>(this.url, "get_header_by_number", [hex(last.number)]) : null;
      if (header?.hash !== last.hash) this.reset();
    }
    for (let from = this.blocks.length; from <= tip; from += 200) {
      const numbers = Array.from({ length: Math.min(200, tip - from + 1) }, (_, i) => from + i);
      const blocks = await rpcBatch<RpcBlock | null>(this.url, numbers.map((n) => ["get_block_by_number", [hex(n)]]));
      for (const block of blocks) {
        if (!block) return; // the tip moved under us; the next sync picks it up
        const s = this.summarize(block);
        this.blocks.push(s.block);
        this.txs.push(...s.txs);
      }
    }
  }

  private reset() {
    this.blocks = [];
    this.txs = [];
    this.resets++;
    this.onReset();
  }
}

const hex = (n: number) => "0x" + n.toString(16);

// ---- the cellbase witness: who mined the block ----------------------------------------
// CellbaseWitness is a molecule table { lock: Script, message: Bytes }. The lock is the
// miner's; the message is free text, which offckb's node fills with its version.

const HASH_TYPES: Record<number, string> = { 0: "data", 1: "type", 2: "data1", 4: "data2" };

export function parseCellbaseWitness(witness: string | undefined): { lock: RpcScript; message: string } | null {
  if (!witness) return null;
  try {
    const b = Buffer.from(witness.slice(2), "hex");
    const u32 = (o: number) => b.readUInt32LE(o);
    if (u32(0) !== b.length || u32(4) !== 12) return null;
    const [lockStart, msgStart] = [u32(4), u32(8)];
    const s = b.subarray(lockStart, msgStart);
    const so = (o: number) => s.readUInt32LE(o);
    const codeHash = "0x" + s.subarray(so(4), so(4) + 32).toString("hex");
    const hashType = HASH_TYPES[s[so(8)]] ?? "data";
    const argsLen = so(so(12));
    const args = "0x" + s.subarray(so(12) + 4, so(12) + 4 + argsLen).toString("hex");
    // The genesis cellbase has an all-zero lock: nobody mined block 0.
    if (/^0x0+$/.test(codeHash)) return null;
    const msg = b.subarray(msgStart + 4, msgStart + 4 + b.readUInt32LE(msgStart));
    // The node puts a few zero bytes before its version string; keep the readable part.
    const text = msg.toString("latin1").replace(/^\0+/, "").trim();
    return { lock: { code_hash: codeHash, hash_type: hashType, args }, message: /^[\x20-\x7e]*$/.test(text) ? text : "0x" + msg.toString("hex") };
  } catch {
    return null;
  }
}
