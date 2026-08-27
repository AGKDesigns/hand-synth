// Static server for one file. It exists only because getUserMedia needs a
// secure context, and while Chrome counts file:// as one, the module import
// from a file:// page lands on origin "null" and CORS rejects it. localhost
// is a secure context and a real origin, so both problems go away at once.
//
// No dependencies - Node's standard library covers all of it.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;

  // normalize() collapses any ../ before it can be used to climb out of ROOT.
  const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(path);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Hand Synth  ->  http://localhost:${PORT}`);
  console.log("Ctrl-C to stop.");
});
