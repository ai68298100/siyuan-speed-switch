const fs = require('fs');
let s = fs.readFileSync('src/index.ts', 'utf8');
// 字段（homeRefreshCleanup 声明后）
const fieldAnchor = '    private homeRefreshCleanup: (() => void) | null = null;';
if (!s.includes(fieldAnchor)) { console.error('field anchor missing'); process.exit(1); }
if (!s.includes('private sidebarRefreshTimer')) {
    s = s.replace(fieldAnchor, fieldAnchor + '\n    private sidebarRefreshTimer = 0;');
}
// 方法（挂在 refreshSidebar 定义前）
if (!s.includes('private scheduleSidebarRefresh')) {
    const rsAnchor = '    // 重算容器内全部缩略图的缩放比例';
    if (!s.includes(rsAnchor)) { console.error('rs anchor missing'); process.exit(1); }
    const scheduler = `    // 侧栏刷新合并：loaded/destroy 事件连发（如批量打开/关闭）时合并为一次重建，
    // 避免逐事件全量重建侧栏 DOM；150ms 尾沿触发
    private scheduleSidebarRefresh() {
        if (this.sidebarRefreshTimer) return;
        this.sidebarRefreshTimer = window.setTimeout(() => {
            this.sidebarRefreshTimer = 0;
            if (this.sidebarElement?.isConnected) this.refreshSidebar();
        }, 150);
    }

`;
    s = s.replace(rsAnchor, scheduler);
}
fs.writeFileSync('src/index.ts', s);
console.log('scheduler + field ensured');
