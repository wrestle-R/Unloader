import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const fixturePath = fileURLToPath(new URL("../../test-fixtures/page.html", import.meta.url));

export async function startFixtureServer() {
  const page = await readFile(fixturePath);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/health") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    } else if (pathname.startsWith("/page/")) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(page);
    } else {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
  };
}
