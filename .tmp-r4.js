const fs = require('fs');
let v = fs.readFileSync('src/home-view.js', 'utf8');

// 条目比例条：count 驱动（如标签出现次数），宽度 = count / maxCount
const oldRow = `            if (options.onItem) button.addEventListener("click", () => options.onItem(item, view));
            row.appendChild(button);`;
if (!v.includes(oldRow)) { console.error('row anchor missing'); process.exit(1); }
const newRow = `            if (Number.isFinite(item.count) && item.count > 0) {
                const bar = doc.createElement("span");
                bar.className = "sw__home-item-bar";
                const fill = doc.createElement("span");
                fill.className = "sw__home-item-bar-fill";
                bar.appendChild(fill);
                row.appendChild(bar);
            }
            if (options.onItem) button.addEventListener("click", () => options.onItem(item, view));
            row.appendChild(button);`;
v = v.replace(oldRow, newRow);

// 计算列表内 count 最大值，写入行内比例（渲染前先收集）
const oldReadyHead = `    if (view.status === "ready") {
        const list = doc.createElement("ul");
        list.className = "sw__home-module-list";
        list.setAttribute("role", "list");`;
if (!v.includes(oldReadyHead)) { console.error('ready head anchor missing'); process.exit(1); }
const newReadyHead = `    if (view.status === "ready") {
        const list = doc.createElement("ul");
        list.className = "sw__home-module-list";
        list.setAttribute("role", "list");
        const countItems = (Array.isArray(view.items) ? view.items : []).filter((item) => Number.isFinite(item.count) && item.count > 0);
        const maxCount = countItems.length > 0 ? Math.max(...countItems.map((item) => item.count)) : 0;`;
v = v.replace(oldReadyHead, newReadyHead);

fs.writeFileSync('src/home-view.js', v);
console.log('count bar scaffolding done');
