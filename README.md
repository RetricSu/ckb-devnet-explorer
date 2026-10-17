# ckb-devnet-explorer

A lightweight explorer for [OffCKB](https://github.com/ckb-devrel/offckb) devnets. No database, no indexer:
it reads your devnet node directly and labels every script by name, including the ones your own projects deploy.

![A spore transaction: the consumed cell on the left, the spore cell and change cell on the right](docs/screenshot.png)

## What it shows

- **Every script by name.** Genesis scripts come from `offckb system-scripts`; your own come from your
  project's `deployment/scripts.json`. JS contracts run by ckb-js-vm are named as the contract, not the VM.
- **What each cell holds.** Contract code (your deployments and the genesis scripts), Nervos DAO deposits and
  withdrawals, sUDT and xUDT amounts, spores and clusters, Type ID cells.
- **What each cell's capacity pays for.** 1 CKB of capacity pays for 1 byte, so every cell gets a bar split into
  its capacity field, lock, type, data and leftover capacity.
- **Where cells come from and go.** Inputs are traced back to the transaction that created them; outputs show
  whether they're still live or which transaction spent them.
- **Fee and cycles** for every transaction, and a live feed of recent transactions.

How it works: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Roadmap: [docs/PLAN.md](docs/PLAN.md).

## Run it

Needs Node 22, `offckb` on your PATH, and a running devnet (`offckb node`).

```bash
npm install
npm run serve -- --project ~/path/to/your-ckb-project
```

Then open http://localhost:7070.

`--project` can be passed more than once. Each one should be a project deployed with `offckb deploy`
(the explorer reads its `deployment/scripts.json` to name your scripts).

Other options: `--rpc` (default `http://127.0.0.1:8114`) and `--port` (default `7070`).

There's also a terminal version that prints the latest transactions:

```bash
npm run scan -- --project ~/path/to/your-ckb-project --txs 10
```

`npm run check` type-checks the project.
