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
