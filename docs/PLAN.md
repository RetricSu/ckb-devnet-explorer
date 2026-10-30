# ckb-devnet-explorer — plan

## Problem
Working on an OffCKB devnet, the only way to look at a block, a transaction or a cell is to curl the RPC
and read raw hex. The tools that exist each cover part of it:

- The official CKB Explorer can point at a devnet node, but it needs a Rails backend, PostgreSQL, Redis and a
  background block syncer. That is a lot to run for a chain that gets wiped with every `offckb clean`.
- `offckb system-scripts` names the genesis scripts, but knows nothing about scripts a project deploys itself.
- `offckb debug --tx-hash` verifies a transaction you already know the hash of. It doesn't help you browse.
- `offckb status` (ckb-tui) shows the mempool and some live info, with limited block/transaction data.

## What this is
A lightweight explorer for OffCKB devnets:

- No database and no indexer. It reads the node's RPC directly, on demand.
- It names every lock and type script: genesis scripts (from `offckb system-scripts`) and the scripts of
  your own projects (from their `deployment/scripts.json`). JS contracts run by ckb-js-vm are resolved
  through to the contract they wrap.
- It decodes cell data (hex / UTF-8 / u128) and recognizes common formats (xUDT amounts, DAO deposits, spores).

## Not in scope
- Testnet or mainnet. The official explorer already covers those.
- Historical indexing, search over all addresses, analytics.
- Writing transactions, with one exception: the devnet faucet, which sends CKB from one of offckb's
  test accounts and refuses to run on anything but a devnet.

## Plan
| Week | Goal |
|------|------|
| 9  | Repo, plan, core: RPC client + script name resolver as a CLI |
| 10 | Web UI: transaction feed, transaction view with inputs resolved, capacity bars. Plain HTML/JS served by the same Node process, no build step |
| 11 | Code cells recognised by data hash and type hash; decoders for Nervos DAO, sUDT, xUDT, Spore, cluster, Type ID; live/spent status with the spending tx; addresses, fee, cycles; raw fields view. Redesigned UI: overview, block, address and script pages, search |
| 12 | One-command run (`npx github:wildanrhmn/ckb-devnet-explorer serve`), README, demo. Checked on a fresh devnet on macOS: JS contract usage through `ckb_js_vm`, DAO withdrawal request with its header dep, genesis code cells matched by type hash |
| 13 | Buffer, final report, demo video |
