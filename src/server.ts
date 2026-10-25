import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { Explorer } from "./explorer.ts";

const WEB_DIR = fileURLToPath(new URL("./web/", import.meta.url));
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

type Route = [RegExp, (m: RegExpMatchArray, url: URL) => Promise<unknown>, (m: RegExpMatchArray) => string];

export function startServer(explorer: Explorer, port: number, rpcUrl: string, projects: string[]) {
  // [pattern, handler, message when the handler finds nothing]
  const routes: Route[] = [
    [/^\/api\/info$/, async () => ({ rpcUrl, projects, tip: await explorer.tip() }), () => ""],
    [/^\/api\/overview$/, () => explorer.overview(), () => ""],
    [/^\/api\/transactions$/, (_, url) => explorer.recentTransactions(Number(url.searchParams.get("limit") ?? 30)), () => ""],
    [/^\/api\/tx\/(0x[0-9a-fA-F]{64})$/, (m) => explorer.transaction(m[1].toLowerCase()), (m) => `No transaction ${m[1]} on this devnet.`],
    [/^\/api\/block\/(\d+|0x[0-9a-fA-F]{64})$/, (m) => explorer.blockDetail(m[1]), (m) => `Block ${m[1]} doesn't exist on this devnet yet.`],
    [/^\/api\/address\/(ck[bt]1[0-9a-z]+)$/i, (m) => explorer.address(m[1]), (m) => `Couldn't read address ${m[1]}.`],
    [/^\/api\/script\/(0x[0-9a-fA-F]{64})\/(type|data|data1|data2)$/, (m) => explorer.script(m[1], m[2]), () => ""],
    [/^\/api\/search$/, (_, url) => explorer.search(url.searchParams.get("q") ?? ""), () => ""],
  ];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
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
  server.listen(port, () => console.log(`ckb-devnet-explorer running at http://localhost:${port}`));
  return server;
}
