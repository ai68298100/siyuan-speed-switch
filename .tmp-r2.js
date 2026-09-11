const fs = require('fs');
let v = fs.readFileSync('src/home-view.js', 'utf8');

// 1. normalizeHomeViewResult：条目 count + stat.progress 透传
const oldNormItems = `    const items = rawItems.slice(0, MAX_ITEMS).map((item) => ({
        label: text(item?.label),
        value: text(item?.value),
        href: text(item?.href, 512),
        command: text(item?.command, 128),
    })).filter((item) => item.label || item.value || item.href);`;
if (!v.includes(oldNormItems)) { console.error('view items anchor missing'); process.exit(1); }
const newNormItems = `    const items = rawItems.slice(0, MAX_ITEMS).map((item) => {
        const entry = {
            label: text(item?.label),
            value: text(item?.value),
            href: text(item?.href, 512),
            command: text(item?.command, 128),
        };
        if (typeof item?.done === "boolean") entry.done = item.done;
        if (Number.isFinite(item?.count) && item.count >= 0) entry.count = Math.trunc(item.count);
        return entry;
    }).filter((item) => item.label || item.value || item.href);`;
v = v.replace(oldNormItems, newNormItems);

const oldStatRet = `        stat: rawSnapshot.stat && typeof rawSnapshot.stat === "object"
            ? {value: text(rawSnapshot.stat.value, 32), label: text(rawSnapshot.stat.label, 32)}
            : null,`;
if (!v.includes(oldStatRet)) { console.error('view stat ret anchor missing'); process.exit(1); }
const newStatRet = `        stat: rawSnapshot.stat && typeof rawSnapshot.stat === "object"
            ? {
                value: text(rawSnapshot.stat.value, 32),
                label: text(rawSnapshot.stat.label, 32),
                progress: Number.isFinite(rawSnapshot.stat.progress) ? Math.min(100, Math.max(0, rawSnapshot.stat.progress)) : null,
            }
            : null,`;
v = v.replace(oldStatRet, newStatRet);

// buildHomeModuleView：stat 透传（progress 已含在 normalized 内）
const oldBuild = `        stat: normalized.stat,`;
if (!v.includes(oldBuild)) { console.error('build stat anchor missing'); process.exit(1); }
// 已是 normalized.stat 透传，无需改

// 2. renderHomeModuleView：stat 英雄区下渲染进度条；条目渲染比例条（count 驱动）
const oldHero = `    if (view.stat && view.stat.value) {
        const hero = doc.createElement("div");
        hero.className = "sw__home-stat";
        const value = doc.createElement("span");
        value.className = "sw__home-stat-value";
        value.textContent = view.stat.value;
        const label = doc.createElement("span");
        label.className = "sw__home-stat-label";
        label.textContent = view.stat.label || "";
        hero.append(value, label);
        body.appendChild(hero);
    }`;
if (!v.includes(oldHero)) { console.error('hero anchor missing'); process.exit(1); }
const newHero = `    if (view.stat && view.stat.value) {
        const hero = doc.createElement("div");
        hero.className = "sw__home-stat";
        const value = doc.createElement("span");
        value.className = "sw__home-stat-value";
        value.textContent = view.stat.value;
        const label = doc.createElement("span");
        label.className = "sw__home-stat-label";
        label.textContent = view.stat.label || "";
        hero.append(value, label);
        body.appendChild(hero);
        if (Number.isFinite(view.stat.progress)) {
            const bar = doc.createElement("div");
            bar.className = "sw__home-progress";
            bar.setAttribute("role", "progressbar");
            bar.setAttribute("aria-valuenow", String(Math.round(view.stat.progress)));
            bar.setAttribute("aria-valuemin", "0");
            bar.setAttribute("aria-valuemax", "100");
            const fill = doc.createElement("div");
            fill.className = "sw__home-progress-fill";
            fill.style.width = Math.min(100, Math.max(0, view.stat.progress)) + "%";
            bar.appendChild(fill);
            body.appendChild(bar);
        }
    }`;
v = v.replace(oldHero, newHero);

fs.writeFileSync('src/home-view.js', v);
console.log('home-view progress+count done');
