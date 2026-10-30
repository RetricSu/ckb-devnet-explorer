import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

// offckb funds 20 test accounts in the devnet genesis (42,000,000 CKB each) and ships them,
// keys included, in its package as account/account.json. They're public test accounts and
// only worth anything on a local devnet.
export type OffckbAccount = { index: number; address: string; privkey: string; args: string };

// What offckb itself uses some of them for (its account module names them): #0-#2 are the
// example accounts, #19 is `deployerAccount`, the default signer of `offckb deploy`.
export const ACCOUNT_ROLES: Record<number, string> = {
  0: "Alice in offckb's examples",
  1: "Bob in offckb's examples",
  2: "Carol in offckb's examples",
  19: "offckb deploy's default deployer",
};

// The devnet miner (offckb's `ckbDevnetMinerAccount`) isn't one of the 20; block rewards go here.
export const MINER_ARGS = "0xa1db2eef3f29f3ef6f86c8d2a0772c705c449f4a";

let cached: OffckbAccount[] | null | undefined;

export function offckbAccounts(): OffckbAccount[] | null {
  if (cached !== undefined) return cached;
  try {
    // offckb's bin resolves to <package>/build/index.js; the accounts sit next to build/.
    const bin = realpathSync(execFileSync("sh", ["-c", "command -v offckb"], { encoding: "utf8" }).trim());
    const list = JSON.parse(readFileSync(join(dirname(dirname(bin)), "account", "account.json"), "utf8")) as Omit<OffckbAccount, "index">[];
    cached = list.map((a, index) => ({ index, address: a.address, privkey: a.privkey, args: a.args }));
  } catch {
    cached = null;
  }
  return cached;
}
