// Transaction and header fields that are packed into integers or molecule bytes.

// ---- since (RFC 0017) -----------------------------------------------------------------
// Bit 63: relative (1) or absolute (0). Bits 61-62: what the value counts, 00 block number,
// 01 epoch, 10 timestamp in seconds. The low 56 bits are the value.

export type Since =
  | { kind: "none" }
  | { kind: "block"; relative: boolean; value: number }
  | { kind: "epoch"; relative: boolean; number: number; index: number; length: number }
  | { kind: "timestamp"; relative: boolean; seconds: number }
  | { kind: "invalid"; raw: string };

export function decodeSince(raw: string): Since {
  const v = BigInt(raw);
  if (v === 0n) return { kind: "none" };
  const relative = (v >> 63n) === 1n;
  const metric = Number((v >> 61n) & 3n);
  const value = v & ((1n << 56n) - 1n);
  if (((v >> 56n) & 0x1fn) !== 0n) return { kind: "invalid", raw };
  if (metric === 0) return { kind: "block", relative, value: Number(value) };
  if (metric === 1) return { kind: "epoch", relative, ...epochOf(value) };
  if (metric === 2) return { kind: "timestamp", relative, seconds: Number(value) };
  return { kind: "invalid", raw };
}

// Epoch numbers with a fraction: number (24 bits), index (16 bits), length (16 bits).
export function epochOf(packed: string | bigint) {
  const e = BigInt(packed);
  return { number: Number(e & 0xffffffn), index: Number((e >> 24n) & 0xffffn), length: Number((e >> 40n) & 0xffffn) };
}

// ---- witnesses ------------------------------------------------------------------------
// Most locks expect WitnessArgs, a molecule table of three optional byte strings:
// lock (the signature), input_type and output_type. Anything else is shown as raw bytes.

export type WitnessView = {
  size: number;
  preview: string; // hex, first 512 bytes
  args: { lock: number | null; inputType: number | null; outputType: number | null } | null;
};

export function parseWitness(hex: string): WitnessView {
  const b = Buffer.from(hex.slice(2), "hex");
  return { size: b.length, preview: hex.slice(0, 2 + 1024), args: witnessArgs(b) };
}

function witnessArgs(b: Buffer): WitnessView["args"] {
  if (b.length < 16 || b.readUInt32LE(0) !== b.length || b.readUInt32LE(4) !== 16) return null;
  const offsets = [b.readUInt32LE(4), b.readUInt32LE(8), b.readUInt32LE(12), b.length];
  const fields: (number | null)[] = [];
  for (let i = 0; i < 3; i++) {
    const [start, end] = [offsets[i], offsets[i + 1]];
    if (end < start || end > b.length) return null;
    if (end === start) fields.push(null);
    else if (end - start < 4 || b.readUInt32LE(start) !== end - start - 4) return null;
    else fields.push(end - start - 4);
  }
  return { lock: fields[0], inputType: fields[1], outputType: fields[2] };
}

// ---- difficulty -----------------------------------------------------------------------
// compact_target packs the PoW target like Bitcoin's nBits; difficulty = 2^256 / target.
// On a devnet the PoW is a dummy, so this stays at its genesis value.

export function difficultyOf(compactTarget: string): bigint {
  const c = Number(BigInt(compactTarget));
  const exponent = c >>> 24;
  const mantissa = BigInt(c & 0xffffff);
  const target = exponent <= 3 ? mantissa >> BigInt(8 * (3 - exponent)) : mantissa << BigInt(8 * (exponent - 3));
  return target === 0n ? 0n : (1n << 256n) / target;
}
