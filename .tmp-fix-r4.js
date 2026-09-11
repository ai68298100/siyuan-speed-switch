const fs = require('fs');
let v = fs.readFileSync('src/home-view.js', 'utf8');

// 条目比例条：count 驱动
const oldRow = `            if (options.onItem) button.addEventListener("click", () => options.onItem(item, view));
            row.appendChild(button);`;
if (!v.includes(oldRow)) { console.error('row anchor missing'); process.exit(1); }
const newRow = `            if (options.onItem) button.addEventListener("click", () => options.onItem(item, view));
            if (Number.isFinite(item.count) && item.count > 0 && Number.isFinite(maxCount) && maxCount > 0) {
                const barWrap = doc.createElement("span");
                barWrap.className = "sw__home-item-bar";
                const fill = doc.createElement("span");
                fill.className = "sw__home-item-bar-fill";
                fill.style.width = Math.min(100, Math.round(item.count / maxCount * 100)) + "%";
                barWrap.appendChild(fill);
                row.appendChild(barWrap);
            }
            row.appendChild(button);`;
v = v.replace(oldRow, newRow);

// ready 头部计算 maxCount
const oldReady = `    if (view.status === "ready") {
        const list = doc.createElement("ul");
        list.className = "sw__home-module-list";
        list.setAttribute("role", "list");`;
if (!v.includes(oldReady)) { console.error('ready head anchor missing'); process.exit(1); }
const newReady = `    if (view.status === "ready") {
        const list = doc.createElement("ul");
        list.className = "sw__home-module-list";
        list.setAttribute("role", "list");
        const countValues = (Array.isArray(view.items) ? view.items : []).filter((item) => Number.isFinite(item.count) && item.count > 0).map((item) => item.count);
        const maxCount = countValues.length > 0 ? Math.max(...countValues) : 0;`;
v = v.replace(oldReady, newReady);

fs.writeFileSync('src/home-view.js', v);
console.log('count bar rendering applied');
