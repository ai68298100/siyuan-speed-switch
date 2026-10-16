const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "docs", "design");
const port = 8765;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const urlPath = decodeURIComponent(req.url.replace(/^\//, "")).split("?")[0].split("#")[0];
  const file = path.join(dir, urlPath);
  if (!urlPath || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
    res.end("Not Found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {"Content-Type": types[ext] || "text/plain; charset=utf-8"});
  res.end(fs.readFileSync(file));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Prototype server running at http://127.0.0.1:${port}/`);
});
