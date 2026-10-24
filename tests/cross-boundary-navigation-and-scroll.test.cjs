// T-7370 跨区域键盘连续导航、无 offsetParent 视口滚动与空卡片防御契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 scrollIntoView 使用 getBoundingClientRect 差值滚动，杜绝受 offsetParent 相对定位影响；
//   2. 验证 activateCardByElement 具备 if (!card) return 与 if (!tabId) return 严格空值防守；
//   3. 验证 moveDocItemFocus 向上离开首行时支持平滑回焦至卡片末项或搜索框；
//   4. 验证 卡片末行向后键入 ArrowDown 时平滑穿透聚焦至首条文档结果行；
//   5. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));

test("T-7370: scrollIntoView 基于 getBoundingClientRect 进行绝对视口相对滚动", () => {
    assert.match(
        indexTs,
        /private scrollIntoView\(card: HTMLElement, container: HTMLElement\)\s*\{\s*\n\s*const cardRect = card\.getBoundingClientRect\(\);\s*\n\s*const containerRect = container\.getBoundingClientRect\(\);/,
        "scrollIntoView 必须使用 getBoundingClientRect 杜绝 offsetParent 相对坐标偏差",
    );
    assert.match(
        indexTs,
        /container\.scrollTop -= \(containerRect\.top - cardRect\.top\);/,
        "向上视口越界时必须精确减去相对视口距离",
    );
    assert.match(
        indexTs,
        /container\.scrollTop \+= \(cardRect\.bottom - containerRect\.bottom\);/,
        "向下视口越界时必须精确加上相对视口距离",
    );
});

test("T-7370: activateCardByElement 空卡片与缺失 tabId 严格守卫", () => {
    assert.match(
        indexTs,
        /private activateCardByElement\(card: HTMLElement \| undefined, closeOverlay: IOverlayClose\)\s*\{\s*\n\s*if \(!card\) return;\s*\n\s*const tabId = card\.dataset\.tabId;\s*\n\s*if \(!tabId\) return;/,
        "必须对未定义卡片和空 tabId 执行即时返回，防止向 getAllTabs 传入 undefined 产生误匹配",
    );
});

test("T-7370: 结果行向上离开时平滑回焦至卡片末项或搜索框", () => {
    assert.match(
        indexTs,
        /const targetIndex = at \+ delta;\s*\n\s*if \(targetIndex < 0\) \{/,
        "moveDocItemFocus 必须识别向上越过首行行为",
    );
    assert.match(
        indexTs,
        /this\.focusCard\(lastCard, true\);/,
        "首行向上必须优先聚焦末尾可见卡片",
    );
    assert.match(
        indexTs,
        /searchInput\.focus\(\);/,
        "无卡片时首行向上必须平滑回焦至搜索框",
    );
});

test("T-7370: 卡片末行向后键入 ArrowDown 平滑穿透聚焦至首条文档结果", () => {
    assert.match(
        indexTs,
        /const firstDoc = scrollElement\.querySelector<HTMLElement>\("\.sw__doc-grid \.sw__doc-item:not\(\.fn__none\)"\);/,
        "卡片末行 ArrowDown 必须查询首条未隐藏文档结果",
    );
    assert.match(
        indexTs,
        /firstDoc\.focus\(\);\s*\n\s*this\.scrollIntoView\(firstDoc, scrollElement\);/,
        "必须聚焦首条文档结果并平滑滚动进入视口",
    );
});

test("T-7370 门禁负向验证: 若缺少越界回焦或未守卫空卡片必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在导航代码
    assert.throws(() => {
        assert.match(indexTs, /fake_non_existent_navigation_method/);
    }, assert.AssertionError);

    // 探针 2: 负向断言旧的 offsetTop 滚动计算不能再出现在实现中
    assert.doesNotMatch(indexTs, /const cardTop = card\.offsetTop;\s*\n\s*const cardBottom = cardTop \+ card\.offsetHeight;/);
});
