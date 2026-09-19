// T-6685 一次性补丁脚本（用后即删）
const fs = require("fs");

// 1) rss-model: normalizeRssSubscriptionConfig 增加 hideRead
let rss = fs.readFileSync("src/rss-model.js", "utf8");
if (!rss.includes("hideRead")) {
    rss = rss.replace(
        "        showDate: source.showDate !== '否' && source.showDate !== false,",
        "        showDate: source.showDate !== '否' && source.showDate !== false,\n        hideRead: source.hideRead === '是' || source.hideRead === true,"
    );
    fs.writeFileSync("src/rss-model.js", rss);
    console.log("rss-model hideRead added");
} else {
    console.log("rss-model hideRead already present");
}

// 2) life-widget-model: buildRssSnapshot context + 只看未读 + onSeen
let w = fs.readFileSync("src/life-widget-model.js", "utf8");
if (!w.includes("buildRssSnapshot(feedText, config, labels = {}, now = Date.now(), status = \"fresh\", context = {})")) {
    w = w.replace(
        'function buildRssSnapshot(feedText, config, labels = {}, now = Date.now(), status = "fresh") {',
        'function buildRssSnapshot(feedText, config, labels = {}, now = Date.now(), status = "fresh", context = {}) {'
    );
}
if (!w.includes("const identities = latestAll.map(rssItemKey);")) {
    w = w.replace(
        "    const latest = latestRssItems(parsed.items, {maxItems: normalized.maxItems});",
        "    const latestAll = latestRssItems(parsed.items, {maxItems: normalized.maxItems});\n" +
        "    // T-6685 只看未读：seenLookup 判已读；展示后经 onSeen 回传展示键（宿主落盘）\n" +
        "    const identities = latestAll.map(rssItemKey);\n" +
        "    const seenLookup = typeof context.seenLookup === \"function\" ? context.seenLookup : null;\n" +
        "    const latest = [];\n" +
        "    const visibleKeys = [];\n" +
        "    latestAll.forEach((item, index) => {\n" +
        "        if (normalized.hideRead && seenLookup && seenLookup(identities[index])) return;\n" +
        "        latest.push(item);\n" +
        "        visibleKeys.push(identities[index]);\n" +
        "    });"
    );
}
if (!w.includes("context.onSeen(visibleKeys)")) {
    // items 构建循环后回传展示键
    w = w.replace(
        "            rank: normalized.showRank ? index + 1 : undefined,\n        };\n    });",
        "            rank: normalized.showRank ? index + 1 : undefined,\n        };\n    });\n    if (typeof context.onSeen === \"function\" && visibleKeys.length) context.onSeen(visibleKeys);"
    );
}
if (!w.includes('const {rssItemKey} = require("./rss-model");')) {
    w = w.replace('const {', 'const {rssItemKey} = require("./rss-model");\nconst {', 1);
}
fs.writeFileSync("src/life-widget-model.js", w);
console.log("life-widget-model patched");
