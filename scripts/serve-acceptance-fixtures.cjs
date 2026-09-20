// 验收夹具伺服器（T-6743b 配套，runbook 5d 节）：
// 用零依赖的 node 起一个带 CORS 头的静态服务——插件的浏览器上下文拉取
// 跨源地址时需要响应带 Access-Control-Allow-Origin，python -m http.server
// 不带该头会导致夹具拉取失败。
//
// 用法：node scripts/serve-acceptance-fixtures.cjs [端口，默认 8000]
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fixtureDir = path.join(root, "docs", "acceptance-fixtures");
const port = Math.min(65535, Math.max(1024, Math.trunc(Number(process.argv[2])) || 8000));

const types = {".ics": "text/calendar; charset=utf-8", ".xml": "text/xml; charset=utf-8", ".md": "text/markdown; charset=utf-8"};

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const name = decodeURIComponent((req.url || "/").replace(/^\//, "")).split("?")[0].split("#")[0];
    const file = path.join(fixtureDir, name);
    if (!name || name.includes("..") || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, {"content-type": "text/plain; charset=utf-8"});
        res.end("not found");
        return;
    }
    res.writeHead(200, {"content-type": types[path.extname(file).toLowerCase()] || "text/plain; charset=utf-8"});
    res.end(fs.readFileSync(file));
});

server.listen(port, "127.0.0.1", () => {
    console.log(`acceptance fixtures serving:`);
    console.log(`  http://127.0.0.1:${port}/bysetpos-last-weekday.ics`);
    console.log(`  http://127.0.0.1:${port}/daily-weekdays.ics`);
    console.log(`  http://127.0.0.1:${port}/yearly-quarterly-dates.ics`);
    console.log(`  http://127.0.0.1:${port}/bysetpos-alone-invalid.ics`);
    console.log(`  http://127.0.0.1:${port}/rss-date-fallback.xml`);
    console.log(`(Ctrl+C 停止)`);
});
