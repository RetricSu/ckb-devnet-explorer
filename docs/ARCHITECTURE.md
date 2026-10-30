# Architecture

```
browser ──HTTP──▶ Node server (src/server.ts) ──JSON-RPC──▶ CKB devnet node :8114
                        │                                    (incl. built-in indexer)
                        ├─ at startup: `offckb system-scripts -o` (genesis scripts)
                        └─ at startup: <project>/deployment/scripts.json (your scripts)
```

One Node process. No database: detail pages ask the node for what they need. A devnet gets wiped by
`offckb clean` all the time, so anything that has to persist an index would spend most of its life
re-indexing.

Lists (all blocks, all transactions) still need to know the whole chain, so the server keeps a small
in-memory index: one summary per block and per transaction. It reads the chain in JSON-RPC batches of
200 blocks (4,500 blocks take about 0.3 s), then follows the tip every 3 seconds. If the block it last
read has a different hash, the chain was reset, so it throws the index away and builds it again; the
page shows a toast when that happens.

## Modules

| File | Job |
|------|-----|
| `src/rpc.ts` | Minimal JSON-RPC client over `fetch`, with batch requests. |
| `src/chain.ts` | The in-memory chain index (block and transaction summaries, reset detection) and the cellbase witness parser that finds a block's miner. |
| `src/txfields.ts` | Packed fields: `since` (RFC 0017), `WitnessArgs`, epoch numbers, difficulty from `compact_target`. |
| `src/scripts.ts` | Loads script names: genesis scripts from `offckb system-scripts -o` (asked fresh every run, never cached on disk) and each project's `deployment/scripts.json`. |
| `src/resolver.ts` | Turns a script (`code_hash` + `hash_type`) into a name. Also indexes code hashes the other way round to recognise the cells that *hold* the code. Looks through `ckb_js_vm` to the JS contract it runs. |
| `src/decode.ts` | Reads cell data by the standard its type script implements: Nervos DAO, sUDT, xUDT, Spore, Spore cluster, Type ID. |
| `src/explorer.ts` | Builds the views: home, block and transaction lists, the tx pool, transaction (every input traced back to the cell it consumed, live/spent status of every output, balance changes, witnesses, fee, size, cycles, deps), block (miner, reward, size, cycles), address, script, and search. |
| `src/server.ts` | `node:http` server: the JSON API below and the static files. |
| `src/web/` | The page. Plain HTML/CSS/JS modules, no build step, fonts bundled in `fonts/`, so it works offline. `js/ui.js` has the shared pieces (detail card, label/value columns, pager, capacity bar, cell row, script name), `js/pages.js` one function per page, `js/charts.js` the SVG charts, `js/app.js` the hash router, search, node status and live refresh. |
| `src/cli.ts` | `serve` starts the server; with no command it prints recent transactions to the terminal. |
| `bin/ckb-devnet-explorer.js` | Entry point for `npx` and global installs. Registers tsx and imports `src/cli.ts`, so there's still no build step. |

## API

| Route | Returns |
|-------|---------|
| `GET /api/info` | RPC URL, tip block number and how many chain resets the server has seen (the top bar polls this). |
| `GET /api/home` | Chain stats (tip, epoch, block time, tx count, tx pool, min fee rate, difficulty), latest blocks and transactions, your scripts with deployed/not-deployed state. |
| `GET /api/blocks?page=&size=` | Blocks, newest first, with miner, live cell change and reward. |
| `GET /api/transactions?page=&size=` | Committed transactions (not cellbase), newest first. |
| `GET /api/pool` | Pending and proposed transactions with fee, fee rate, size and cycles. |
| `GET /api/tx/:hash` | One transaction with resolved inputs, outputs, balance changes, witnesses, deps, fee, size, cycles. For a rejected one, the node's reason. |
| `GET /api/tx/:hash/raw` | The transaction exactly as the node returns it. |
| `GET /api/block/:numberOrHash` | Header fields, miner, reward breakdown, size, cycles, proposals, uncles and transactions. |
| `GET /api/address/:address` | Balance, live cells, token balances, recent transactions. |
| `GET /api/script/:codeHash/:hashType` | Name, code location, cells using it as lock or type. |
| `GET /api/search?q=` | Which page a query points at. |

Detail pages read straight from the node, so they're never stale. Home, the first page of each list, the
pending tab and a pending transaction re-render every 5 seconds.

**Block reward and miner.** The miner is the lock in the cellbase witness (a molecule `CellbaseWitness`,
whose message offckb's node fills with its version). The reward comes from `get_block_economic_state`, which
only answers once the block is finalized, 11 blocks later; until then the page says how many blocks are left.

**Rejected transactions.** `get_transaction` on a hash the node rejected recently returns no transaction
but a status of `rejected` and a JSON reason (`{"type": "Resolve", "description": ...}`). The page shows the
type in plain words and the raw description.

## Design

The UI follows the design system of the official [CKB Explorer](https://github.com/nervosnetwork/ckb-explorer-frontend)
(MIT), so it feels familiar to anyone who uses that one: a black header, white cards on a grey page, Roboto,
monospace hashes shortened with `...`, amounts with grey decimals, label/value detail cards, its table, tab and
pager patterns, and its breakpoints (1440, 1200, 750 px). Its primary colour identifies the network (mainnet
green `#00CC9B`, testnet purple `#9A2CEC`), so the devnet gets its own blue, `#346DFF`, which can't be mistaken
for either. The logo is our own; the Nervos marks aren't used.

Kinds, statuses and script sources are plain text ("Deployed", "sUDT", "genesis"), not pills or badges.
The home dashboard has two charts in their dark panel: block time over the last 100 blocks (in place of their
hash rate, which means nothing on a devnet's dummy proof of work) and transactions across the chain's history.
They're drawn by `js/charts.js` as plain SVG, with hover tooltips and a hidden data table for screen readers.

What the official explorer doesn't have keeps its own components inside that system: the capacity bar with
one colour each for lock, type and data, decoded cell contents, balance changes, rejected-transaction
reasons and the "Your Scripts" table.

Roboto is bundled from [Fontsource](https://fontsource.org/fonts/roboto) (`src/web/fonts/`, Apache 2.0).

## How the hard parts work

**Naming a script.** A script is identified by its `code_hash` + `hash_type`. The same pair appears in
offckb's system scripts and in a project's `deployment/scripts.json`, so naming is a map lookup.

**Recognising code cells.** Per [RFC 0022](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md),
a script with hash type `data`/`data1`/`data2` loads code from the cell whose `ckbhash(data)` equals its
`code_hash`; with `type` it loads from the cell whose type script hashes to `code_hash`. The explorer hashes
each cell's data and type script and checks both against the known scripts. That labels your own
deployments (by data hash) and the upgradable genesis cells (by type hash).

**JS contracts.** A JS contract's cells don't carry its code hash: their lock or type is `ckb_js_vm`, and the
args start with 2 flag bytes, the contract's code hash and its hash type byte. Naming goes through the args
(see the resolver), and so does counting usage: for each project script the explorer runs two indexer prefix
searches, one on the script itself and one on `ckb_js_vm` with `0x0000 + code_hash + hash_type` as the args
prefix. Before this, a JS contract with live cells was reported as unused.

**Inputs.** `get_transaction` only gives an input as a pointer (`previous_output`), so each consumed cell is
fetched from the transaction that created it.

**Spent or live.** `get_live_cell` says whether an output is still live. If it isn't, the node's built-in
indexer (`get_transactions` on the cell's lock, ascending from the block that created it) finds the first
transaction with an input pointing back at it.

**Capacity bar.** Occupied bytes = 8 (capacity) + 33 + args for each script + data. 1 CKB pays for 1 byte, so
the bar is the cell's capacity split into what it pays for. When free capacity is more than 3x the used bytes
(change cells hold millions of CKB) the free part is cut short and marked with a break.

**Is my script deployed?** A project's `scripts.json` survives `offckb clean`, the chain doesn't. The
overview checks each project script's code cell with `get_live_cell`; if it's gone, the script is listed as
"Not on this chain" instead of being silently named.

**Header deps.** A transaction can list block hashes its scripts may read. The Nervos DAO needs one to request a
withdrawal: the script checks the deposit block's header to know when the deposit was made. Each header dep is
looked up with `get_header` so the page shows a block number instead of a bare hash.

**Transaction size and fee rate.** The RPC doesn't return a size, so the transaction is serialized with CCC
(`Transaction.toBytes()`) and 4 bytes are added for its offset in the block, which is how the node counts it.
Fee rate = fee × 1000 / size, in shannons per kB.

## Data formats

- **Nervos DAO** ([RFC 0023](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0023-dao-deposit-withdraw/0023-dao-deposit-withdraw.md)): 8 bytes of data. All zero = deposit; otherwise the little-endian block number of the deposit, meaning a withdrawal was requested.
- **sUDT** ([RFC 0025](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0025-simple-udt/0025-simple-udt.md)) and **xUDT** ([RFC 0052](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md)): a 16-byte little-endian amount; xUDT may carry extra data after it. The type script args start with the owner's lock hash.
- **Spore / cluster**: molecule-encoded `SporeData` (`content_type`, `content`, `cluster_id`) and `ClusterData` (`name`, `description`), decoded with the codecs from `@ckb-ccc/spore`.

## Prior art

The official [CKB Explorer](https://github.com/nervosnetwork/ckb-explorer-frontend) shows a cell's lock, type,
data and capacity usage, marks outputs as live or dead with a link to the consuming transaction, and has a
backend that classifies about twenty cell types. It needs a Rails backend, PostgreSQL, Redis and a block syncer.
This project borrows the presentation ideas and keeps the deployment to one command.
