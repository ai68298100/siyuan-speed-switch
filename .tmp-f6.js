const fs = require('fs');
let s = fs.readFileSync('src/index.ts', 'utf8');

// 侧栏刷新合并：loaded/destroy 事件的连发（批量打开/关闭文档）合并为一次重建
const oldBind = `            this.eventBus.on("loaded-protyle-static", loadedProtyle);
            this.eventBus.on("destroy-protyle", destroyProtyle);`;
if (!s.includes(oldBind)) { console.error('event bind anchor missing'); process.exit(1); }
// 先定位字段区追加调度器状态
const fieldAnchor = '    private homeRefreshCleanup: (() => void) | null = null;';
if (!s.includes(fieldAnchor)) { console.error('field anchor missing'); process.exit(1); }
s = s.replace(fieldAnchor, fieldAnchor + '\n    private sidebarRefreshTimer = 0;');

// 新增调度方法（挂在 refreshSidebar 定义前）
const rsAnchor = '    // 重算容器内全部缩略图的缩放比例';
if (!s.includes(rsAnchor)) { console.error('rescale anchor missing'); process.exit(1); }
const scheduler = `    // 侧栏刷新合并：loaded/destroy 事件连发（如批量打开/关闭）时合并为一次重建，
    // 避免逐事件全量重建侧栏 DOM；150ms 尾沿触发
    private scheduleSidebarRefresh() {
        if (this.sidebarRefreshTimer) return;
        this.sidebarRefreshTimer = window.setTimeout(() => {
            this.sidebarRefreshTimer = 0;
            if (this.sidebarElement?.isConnected) this.refreshSidebar();
        }, 150);
    }

` + rsAnchor;
s = s.replace(rsAnchor, scheduler);

fs.writeFileSync('src/index.ts', s);
console.log('sidebar scheduler added');
