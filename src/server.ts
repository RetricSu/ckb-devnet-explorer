import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { Explorer } from "./explorer.ts";
import type { Faucet } from "./faucet.ts";

const WEB_DIR = fileURLToPath(new URL("./web/", import.meta.url));
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };

type Route = [RegExp, (m: RegExpMatchArray, url: URL) => Promise<unknown>, (m: RegExpMatchArray) => string];

// ?page=2&size=20, with sane bounds.
const pageArgs = (url: URL) => {
  const pageNo = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get("size")) || 20));
  return [pageNo, size] as const;
};

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function startServer(explorer: Explorer, faucet: Faucet, port: number, rpcUrl: string, projects: string[]) {
  // Claims belong to one chain: forget them when `offckb clean` resets it.
  let resets = 0;
  const faucetStatus = async () => {
    if (explorer.index.resets !== resets) { resets = explorer.index.resets; faucet.reset(); }
    return faucet.status();
  };
  const noTx = (m: RegExpMatchArray) => `No transaction ${m[1]} on this devnet.`;
  // [pattern, handler, message when the handler finds nothing]
  const routes: Route[] = [
    [/^\/api\/info$/, async () => ({
      rpcUrl, projects, tip: await explorer.tip(), resets: explorer.index.resets,
      node: await explorer.nodeVersion(), knowledgeSize: await explorer.knowledgeSize(),
    }), () => ""],
    [/^\/api\/home$/, () => explorer.home(), () => ""],
    [/^\/api\/blocks$/, (_, url) => explorer.blockList(...pageArgs(url)), () => ""],
    [/^\/api\/transactions$/, (_, url) => explorer.transactionList(...pageArgs(url)), () => ""],
    [/^\/api\/pool$/, () => explorer.pool(), () => ""],
    [/^\/api\/tx\/(0x[0-9a-fA-F]{64})\/raw$/, (m) => explorer.rawTransaction(m[1].toLowerCase()), noTx],
    [/^\/api\/tx\/(0x[0-9a-fA-F]{64})$/, (m) => explorer.transaction(m[1].toLowerCase()), noTx],
    [/^\/api\/block\/(\d+|0x[0-9a-fA-F]{64})$/, (m) => explorer.blockDetail(m[1]), (m) => `Block ${m[1]} doesn't exist on this devnet yet.`],
    [/^\/api\/address\/(ck[bt]1[0-9a-z]+)$/i, (m) => explorer.address(m[1]), (m) => `Couldn't read address ${m[1]}.`],
    [/^\/api\/script\/(0x[0-9a-fA-F]{64})\/(type|data|data1|data2)$/, (m) => explorer.script(m[1], m[2]), () => ""],
    [/^\/api\/faucet$/, () => faucetStatus(), () => ""],
    [/^\/api\/search$/, (_, url) => explorer.search(url.searchParams.get("q") ?? ""), () => ""],
  ];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (url.pathname === "/api/faucet" && req.method === "POST") {
        // The one endpoint that writes to the chain. Only from this machine, only as JSON (a
        // page on another site can't send that without a CORS preflight, which we never
        // answer), and only from our own origin when the browser says where it came from.
        const origin = req.headers.origin;
        if (!LOCAL.has(req.socket.remoteAddress ?? "") || (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))
          return json(403, { error: "The faucet only takes requests from this machine." });
        if (!(req.headers["content-type"] ?? "").startsWith("application/json"))
          return json(415, { error: "Send the claim as JSON." });
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 2048) return json(413, { error: "Request too large." });
        }
        let body: { address?: unknown; amount?: unknown };
        try { body = JSON.parse(raw); } catch { return json(400, { error: "Send the claim as JSON." }); }
        const to = String(body.address ?? "").trim();
        const amount = Number(body.amount);
        const problem = await faucet.check(to, amount);
        if (problem) return json(400, { error: problem });
        try {
          return json(200, await faucet.claim(to, amount));
        } catch (err) {
          return json(502, { error: `offckb couldn't send it: ${(err as Error).message}` });
        }
      }
      if (req.method !== "GET" && req.method !== "HEAD") return json(405, { error: "Method not allowed." });
      if (url.pathname.startsWith("/api/")) {
        for (const [pattern, handler, notFound] of routes) {
          const m = url.pathname.match(pattern);
          if (!m) continue;
          const body = await handler(m, url);
          return body === null ? json(404, { error: notFound(m) }) : json(200, body);
        }
        return json(404, { error: "Unknown endpoint." });
      }

      // Everything else is the single-page UI and its modules.
      const file = url.pathname === "/" || !extname(url.pathname) ? "index.html" : normalize(url.pathname).replace(/^([/\\]|\.\.)+/, "");
      const body = await readFile(join(WEB_DIR, file));
      // no-cache: the browser revalidates, so an updated explorer never runs yesterday's page code.
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return json(404, { error: "Not found." });
      if (message.includes("fetch failed"))
        return json(503, { error: `Can't reach the devnet at ${rpcUrl}. Start it with \`offckb node\` and reload.` });
      json(500, { error: message });
    }
  });

  // Keep the chain index warm so list pages don't wait for new blocks to be read.
  const keepUp = () => explorer.index.sync().catch(() => {});
  keepUp();
  setInterval(keepUp, 3000).unref();

  server.listen(port, () => console.log(`ckb-devnet-explorer running at http://localhost:${port}`));
  return server;
}
