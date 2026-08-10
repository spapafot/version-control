// Tiny static server for the exported site (used by the browser smoke test).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.env.PORT ?? 8788);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    if (!extname(path)) path += "/index.html";
    const data = await readFile(join(root, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    try {
      const notFound = await readFile(join(root, "404.html"));
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(notFound);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
}).listen(port, () => console.log(`serving ./out on http://localhost:${port}`));
