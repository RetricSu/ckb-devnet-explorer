import { ccc } from "@ckb-ccc/core";
import { ClusterData, SporeData } from "@ckb-ccc/spore/advanced";
import { rpc } from "./rpc.ts";
import type { Resolver } from "./resolver.ts";

// The Tools page, like the CKB Explorer's: address <-> script, a CKB hasher, a molecule decoder
// and transaction broadcast (with a dry run first). Everything but broadcast is pure computation.

const PREFIXES = { ckb: "mainnet", ckt: "testnet or devnet" } as const;
const clientFor = (prefix: string) => ({ addressPrefix: prefix }) as unknown as ccc.Client;
const HASH_TYPES = ["type", "data", "data1", "data2"];

const plain = (v: unknown): unknown =>
  typeof v === "bigint" ? v.toString()
    : v instanceof Uint8Array ? ccc.hexFrom(v)
      : Array.isArray(v) ? v.map(plain)
        : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
          : v;

export class Tools {
  constructor(private url: string, private resolver: Resolver) {}

  // Address in, script out, plus the same script's address on every network.
  async address(address: string) {
    const prefix = address.slice(0, 3);
    if (!(prefix in PREFIXES)) throw new Error("A CKB address starts with ckb1 (mainnet) or ckt1 (testnet and devnet).");
    const parsed = await ccc.Address.fromString(address, { ckb: clientFor("ckb"), ckt: clientFor("ckt") });
    return this.describe(parsed.script, PREFIXES[prefix as keyof typeof PREFIXES]);
  }

  // Script in, addresses out.
  async script(codeHash: string, hashType: string, args: string) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(codeHash)) throw new Error("The code hash is 32 bytes of hex: 0x and 64 characters.");
    if (!HASH_TYPES.includes(hashType)) throw new Error(`The hash type is one of ${HASH_TYPES.join(", ")}.`);
    if (!/^0x([0-9a-fA-F]{2})*$/.test(args)) throw new Error("Args are hex bytes starting with 0x (0x on its own for none).");
    return this.describe(ccc.Script.from({ codeHash, hashType: hashType as ccc.HashType, args }), null);
  }

  private describe(script: ccc.Script, network: string | null) {
    const rpcScript = { code_hash: script.codeHash, hash_type: script.hashType, args: script.args };
    const r = this.resolver.resolve(rpcScript);
    return {
      network,
      script: rpcScript,
      name: r.inner?.name ?? r.name,
      source: r.inner?.source ?? r.source,
      scriptHash: script.hash(),
      devnet: ccc.Address.fromScript(script, clientFor("ckt")).toString(),
      mainnet: ccc.Address.fromScript(script, clientFor("ckb")).toString(),
    };
  }

  // ckbhash: BLAKE2b-256 with CKB's personalisation, of hex bytes or UTF-8 text.
  hash(input: string, as: string) {
    let bytes: Uint8Array;
    if (as === "hex") {
      if (!/^(0x)?([0-9a-fA-F]{2})*$/.test(input.trim())) throw new Error("That isn't hex: an even number of 0-9 and a-f characters.");
      bytes = ccc.bytesFrom(input.trim().startsWith("0x") ? input.trim() : `0x${input.trim()}`);
    } else bytes = ccc.bytesFrom(input, "utf8");
    return { bytes: bytes.length, hash: ccc.hashCkb(bytes) };
  }

  // Decode molecule-encoded bytes as one of the common CKB types.
  molecule(type: string, hex: string) {
    const h = hex.trim().startsWith("0x") ? hex.trim() : `0x${hex.trim()}`;
    if (!/^0x([0-9a-fA-F]{2})*$/.test(h)) throw new Error("That isn't hex: an even number of 0-9 and a-f characters.");
    const bytes = ccc.bytesFrom(h);
    const codecs: Record<string, () => unknown> = {
      Script: () => ccc.Script.decode(bytes),
      OutPoint: () => ccc.OutPoint.decode(bytes),
      CellOutput: () => ccc.CellOutput.decode(bytes),
      CellInput: () => ccc.CellInput.decode(bytes),
      WitnessArgs: () => ccc.WitnessArgs.decode(bytes),
      Transaction: () => ccc.Transaction.decode(bytes),
      SporeData: () => {
        const s = SporeData.decode(bytes);
        const content = ccc.bytesFrom(s.content);
        return { ...s, content: /^(text\/|application\/json)/.test(s.contentType) ? new TextDecoder().decode(content) : ccc.hexFrom(content) };
      },
      ClusterData: () => ClusterData.decode(bytes),
      Uint64: () => ({ value: ccc.numLeFromBytes(bytes.slice(0, 8)), bytes: bytes.length }),
      Uint128: () => ({ value: ccc.numLeFromBytes(bytes.slice(0, 16)), bytes: bytes.length }),
      Bytes: () => {
        if (bytes.length < 4) throw new Error("Bytes starts with a 4-byte length.");
        const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
        if (len !== bytes.length - 4) throw new Error(`Length says ${len} bytes but ${bytes.length - 4} follow.`);
        const body = bytes.slice(4);
        const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
        return { length: len, hex: ccc.hexFrom(body), text: /^[\x20-\x7e\n]*$/.test(text) ? text : null };
      },
    };
    const decode = codecs[type];
    if (!decode) throw new Error(`Pick one of: ${Object.keys(codecs).join(", ")}.`);
    try {
      return { type, bytes: bytes.length, value: plain(decode()) };
    } catch (err) {
      throw new Error(`Couldn't decode it as ${type}: ${(err as Error).message}`);
    }
  }

  static types = ["Script", "OutPoint", "CellOutput", "CellInput", "WitnessArgs", "Transaction", "SporeData", "ClusterData", "Bytes", "Uint64", "Uint128"];

  // A transaction in the node's JSON format (what "Download JSON" gives you). A dry run asks
  // the node whether it would accept it, without sending it; otherwise it's sent for real.
  async broadcast(tx: Record<string, unknown>, dryRun: boolean) {
    const { hash: _hash, ...body } = tx;
    for (const field of ["version", "cell_deps", "header_deps", "inputs", "outputs", "outputs_data", "witnesses"])
      if (!(field in body)) throw new Error(`The transaction is missing "${field}". Paste it in the node's JSON format (snake_case), e.g. from a transaction page's Download JSON.`);
    if (dryRun) {
      const r = await rpc<{ cycles: string; fee: string }>(this.url, "test_tx_pool_accept", [body, "passthrough"]);
      return { dryRun: true, cycles: Number(BigInt(r.cycles)), fee: BigInt(r.fee).toString() };
    }
    const hash = await rpc<string>(this.url, "send_transaction", [body, "passthrough"]);
    return { dryRun: false, hash };
  }
}
