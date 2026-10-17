# Architecture

```
browser ──HTTP──▶ Node server (src/server.ts) ──JSON-RPC──▶ CKB devnet node :8114
                        │                                    (incl. built-in indexer)
                        ├─ at startup: `offckb system-scripts -o` (genesis scripts)
                        └─ at startup: <project>/deployment/scripts.json (your scripts)
```

One Node process. No database, no background sync: every page asks the node for what it needs.
A devnet gets wiped by `offckb clean` all the time, so anything that has to index the chain first
would spend most of its life re-indexing.

## Modules

| File | Job |
|------|-----|
| `src/rpc.ts` | Minimal JSON-RPC client over `fetch`. |
| `src/scripts.ts` | Loads script names: genesis scripts from `offckb system-scripts -o` (asked fresh every run, never cached on disk) and each project's `deployment/scripts.json`. |
| `src/resolver.ts` | Turns a script (`code_hash` + `hash_type`) into a name. Also indexes code hashes the other way round to recognise the cells that *hold* the code. Looks through `ckb_js_vm` to the JS contract it runs. |
| `src/decode.ts` | Reads cell data by the standard its type script implements: Nervos DAO, sUDT, xUDT, Spore, Spore cluster, Type ID. |
| `src/explorer.ts` | Builds the views: recent transactions, a transaction with every input traced back to the cell it consumed, live/spent status of every output, fee, cycles. Caches blocks (they never change on a devnet) and drops the cache if the tip goes backwards. |
| `src/server.ts` | `node:http` server: the JSON API and the static page. |
| `src/web/` | The page. Plain HTML/CSS/JS, no build step, system fonts only, so it works offline. |
| `src/cli.ts` | `serve` starts the server; with no command it prints recent transactions to the terminal. |

## How the hard parts work

**Naming a script.** A script is identified by its `code_hash` + `hash_type`. The same pair appears in
offckb's system scripts and in a project's `deployment/scripts.json`, so naming is a map lookup.

**Recognising code cells.** Per [RFC 0022](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md),
a script with hash type `data`/`data1`/`data2` loads code from the cell whose `ckbhash(data)` equals its
`code_hash`; with `type` it loads from the cell whose type script hashes to `code_hash`. The explorer hashes
each cell's data and type script and checks both against the known scripts. That labels your own
deployments (by data hash) and the upgradable genesis cells (by type hash).

**Inputs.** `get_transaction` only gives an input as a pointer (`previous_output`), so each consumed cell is
fetched from the transaction that created it.

**Spent or live.** `get_live_cell` says whether an output is still live. If it isn't, the node's built-in
indexer (`get_transactions` on the cell's lock, ascending from the block that created it) finds the first
transaction with an input pointing back at it.

**Capacity bar.** Occupied bytes = 8 (capacity) + 33 + args for each script + data. 1 CKB pays for 1 byte, so
the bar is the cell's capacity split into what it pays for. When free capacity is more than 3x the used bytes
(change cells hold millions of CKB) the free part is cut short and marked with a break.

## Data formats

- **Nervos DAO** ([RFC 0023](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0023-dao-deposit-withdraw/0023-dao-deposit-withdraw.md)): 8 bytes of data. All zero = deposit; otherwise the little-endian block number of the deposit, meaning a withdrawal was requested.
- **sUDT** ([RFC 0025](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0025-simple-udt/0025-simple-udt.md)) and **xUDT** ([RFC 0052](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md)): a 16-byte little-endian amount; xUDT may carry extra data after it. The type script args start with the owner's lock hash.
- **Spore / cluster**: molecule-encoded `SporeData` (`content_type`, `content`, `cluster_id`) and `ClusterData` (`name`, `description`), decoded with the codecs from `@ckb-ccc/spore`.

## Prior art

The official [CKB Explorer](https://github.com/nervosnetwork/ckb-explorer-frontend) shows a cell's lock, type,
data and capacity usage, marks outputs as live or dead with a link to the consuming transaction, and has a
backend that classifies about twenty cell types. It needs a Rails backend, PostgreSQL, Redis and a block syncer.
This project borrows the presentation ideas and keeps the deployment to one command.
