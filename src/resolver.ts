import { key, type KnownScript } from "./scripts.ts";
import type { RpcScript } from "./rpc.ts";

const HASH_TYPES: Record<number, string> = { 0: "data", 1: "type", 2: "data1", 4: "data2" };

export type Resolved = {
  name: string | null;
  source: string | null;
  inner?: Resolved;
};

export class Resolver {
  // A script points at its code in one of two ways (RFC 0022): with a data hash type its
  // code_hash is the hash of the code cell's data, with "type" it's the hash of the code
  // cell's own type script. Indexing both lets us recognise the code cells themselves.
  private byDataHash = new Map<string, KnownScript>();
  private byTypeHash = new Map<string, KnownScript>();

  constructor(private known: Map<string, KnownScript>) {
    for (const [k, v] of known) {
      const [codeHash, hashType] = k.split(":");
      (hashType === "type" ? this.byTypeHash : this.byDataHash).set(codeHash, v);
    }
  }

  resolve(script: RpcScript): Resolved {
    const hit = this.known.get(key(script.code_hash, script.hash_type));
    if (!hit) return { name: null, source: null };
    const resolved: Resolved = { name: hit.name, source: hit.source };
    // JS contracts are run by ckb_js_vm: the lock/type points at the interpreter, and the
    // real contract's code hash sits in the args right after 2 flag bytes.
    if (hit.name === "ckb_js_vm") {
      const inner = this.innerJsScript(script.args);
      if (inner) resolved.inner = this.resolve(inner);
    }
    return resolved;
  }

  all(): KnownScript[] {
    return [...this.known.values()];
  }

  lookup(codeHash: string, hashType: string): KnownScript | null {
    return this.known.get(key(codeHash, hashType)) ?? null;
  }

  // The script prefixes a cell carries when it uses this script: the script itself, and,
  // for JS contracts, ckb_js_vm with the contract's code hash and hash type at the start of
  // the args. Searching only the first misses every cell of a JS contract.
  usagePrefixes(s: { codeHash: string; hashType: string }): RpcScript[] {
    const prefixes: RpcScript[] = [{ code_hash: s.codeHash, hash_type: s.hashType, args: "0x" }];
    const vm = this.all().find((k) => k.name === "ckb_js_vm");
    const byte = Object.entries(HASH_TYPES).find(([, t]) => t === s.hashType)?.[0];
    if (vm && byte !== undefined && s.codeHash !== vm.codeHash)
      prefixes.push({ code_hash: vm.codeHash, hash_type: vm.hashType, args: "0x0000" + s.codeHash.slice(2) + Number(byte).toString(16).padStart(2, "0") });
    return prefixes;
  }

  codeCell(dataHash: string | null, typeHash: string | null): { script: KnownScript; matchedBy: "data hash" | "type hash" } | null {
    const byData = dataHash && this.byDataHash.get(dataHash.toLowerCase());
    if (byData) return { script: byData, matchedBy: "data hash" };
    const byType = typeHash && this.byTypeHash.get(typeHash.toLowerCase());
    if (byType) return { script: byType, matchedBy: "type hash" };
    return null;
  }

  describe(script: RpcScript | null): string {
    if (!script) return "-";
    return label(this.resolve(script), script.code_hash);
  }

  private innerJsScript(args: string): RpcScript | null {
    const hex = args.replace(/^0x/, "");
    if (hex.length < (2 + 32 + 1) * 2) return null;
    return {
      code_hash: "0x" + hex.slice(4, 68),
      hash_type: HASH_TYPES[parseInt(hex.slice(68, 70), 16)] ?? "?",
      args: "0x",
    };
  }
}

export function label(r: Resolved, codeHash: string): string {
  if (!r.name) return `unknown (${codeHash.slice(0, 10)}…)`;
  const base = `${r.name} (${r.source})`;
  return r.inner ? `${base} -> ${label(r.inner, "")}` : base;
}
