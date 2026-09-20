// 夹具伺服器门禁（T-6751，runbook 5d 配套工具）：
// scripts/serve-acceptance-fixtures.cjs 必须能起服务、带 CORS 头、
// 正确伺服夹具、并拒绝目录穿越——真机验收的夹具拉取全靠它。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFile} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const SCRIPT = path.join(root, 'scripts', 'serve-acceptance-fixtures.cjs');
const PORT = 8977;

function get(urlPath) {
    return new Promise((resolve, reject) => {
        const req = http.get({host: '127.0.0.1', port: PORT, path: urlPath}, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}));
        });
        req.on('error', reject);
    });
}

test('fixture server serves fixtures with CORS headers (T-6751)', async () => {
    const child = execFile(process.execPath, [SCRIPT, String(PORT)]);
    try {
        // 轮询等待端口就绪（最多 3 秒）
        let ready = false;
        for (let i = 0; i < 30 && !ready; i += 1) {
            await new Promise((r) => setTimeout(r, 100));
            ready = await new Promise((resolve) => {
                const req = http.get({host: '127.0.0.1', port: PORT, path: '/daily-weekdays.ics'}, (res) => {
                    res.resume();
                    resolve(true);
                });
                req.on('error', () => resolve(false));
            });
        }
        assert.ok(ready, 'fixture server must become reachable');

        const ics = await get('/bysetpos-last-weekday.ics');
        assert.equal(ics.status, 200);
        assert.equal(ics.headers['access-control-allow-origin'], '*', 'CORS header required');
        assert.ok(ics.body.includes('BYSETPOS=-1'), 'fixture content must be served');

        const missing = await get('/does-not-exist.ics');
        assert.equal(missing.status, 404, 'unknown fixture must 404');

        const traversal = await get('/..%2f..%2fpackage.json');
        assert.notEqual(traversal.status, 200, 'path traversal must not be served');
    } finally {
        child.kill();
    }
});
