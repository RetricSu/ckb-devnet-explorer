import { ccc } from "@ckb-ccc/core";
import { ClusterData, SporeData } from "@ckb-ccc/spore/advanced";
import type { RpcScript } from "./rpc.ts";
import type { Resolved } from "./resolver.ts";

export type Decoded =
  | { kind: "code"; name: string; source: string; matchedBy: "data hash" | "type hash" }
  | { kind: "dao-deposit" }
  | { kind: "dao-withdrawing"; depositBlock: number }
  | { kind: "udt"; standard: "sUDT" | "xUDT"; amount: string; owner: string; extraBytes: number }
  | { kind: "spore"; contentType: string; contentLength: number; text?: string; clusterId?: string }
  | { kind: "cluster"; name: string; description: string }
  | { kind: "type-id"; id: string }
  | { kind: "invalid"; standard: string; reason: string };

const TEXT_TYPES = /^(text\/|application\/json)/;

// Reads the cell's data according to the standard its type script implements. Returns
// null for cells whose type script isn't one of the formats we know how to read.
export function decodeByType(type: RpcScript | null, typeName: Resolved | null, data: string): Decoded | null {
  if (!type || !typeName?.name) return null;
  const bytes = ccc.bytesFrom(data);
  switch (typeName.name) {
    case "dao": {
      if (bytes.length !== 8) return { kind: "invalid", standard: "Nervos DAO", reason: `expected 8 bytes of data, found ${bytes.length}` };
      const block = ccc.numLeFromBytes(bytes);
      return block === 0n ? { kind: "dao-deposit" } : { kind: "dao-withdrawing", depositBlock: Number(block) };
    }
    case "sudt":
    case "xudt": {
      const standard = typeName.name === "sudt" ? "sUDT" : "xUDT";
      if (bytes.length < 16) return { kind: "invalid", standard, reason: `amount needs 16 bytes, found ${bytes.length}` };
      return {
        kind: "udt",
        standard,
        amount: ccc.numLeFromBytes(bytes.slice(0, 16)).toString(),
        owner: "0x" + type.args.slice(2, 66),
        extraBytes: bytes.length - 16,
      };
    }
    case "spore": {
      try {
        const spore = SporeData.decode(bytes);
        const content = ccc.bytesFrom(spore.content);
        return {
          kind: "spore",
          contentType: spore.contentType,
          contentLength: content.length,
          text: TEXT_TYPES.test(spore.contentType) ? new TextDecoder().decode(content.slice(0, 2000)) : undefined,
          clusterId: spore.clusterId ? ccc.hexFrom(spore.clusterId) : undefined,
        };
      } catch (err) {
        return { kind: "invalid", standard: "Spore", reason: (err as Error).message };
      }
    }
    case "spore_cluster": {
      try {
        const cluster = ClusterData.decode(bytes);
        return { kind: "cluster", name: cluster.name, description: cluster.description };
      } catch (err) {
        return { kind: "invalid", standard: "Spore cluster", reason: (err as Error).message };
      }
    }
    case "type_id":
      return { kind: "type-id", id: type.args };
  }
  return null;
}

export const dataHash = (data: string) => ccc.hashCkb(ccc.bytesFrom(data));

export const scriptHash = (s: RpcScript) =>
  ccc.Script.from({ codeHash: s.code_hash, hashType: s.hash_type as ccc.HashType, args: s.args }).hash();
