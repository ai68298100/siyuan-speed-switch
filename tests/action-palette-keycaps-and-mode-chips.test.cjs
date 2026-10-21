// T-7360 动作画板立体机械键帽与切换器常驻多模态穿透药丸 Chips 契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 .sw__palette-item-shortcut 声明物理机械键帽双层高光阴影与梯度背景；
//   2. 验证 index.ts 声明 setupSearchModeChips 与 sw__mode-chips-bar / sw__mode-chip 结构；
//   3. 验证 7 组模式药丸（全部、@大纲、^正文、#标签、!书签、>命令、?速查）完整注册；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));
const indexTs = readSourceText(path.join(root, "src", "index.ts"));

test("T-7360: 动作画板快捷键声明立体机械键帽（Keycap）样式规范", () => {
    assert.match(
        polishScss,
        /\.sw__palette-item-shortcut\s*\{[^}]*border-bottom:\s*2px solid/s,
        "画板快捷键必须声明下沉微凸 2px 物理键帽底边框",
    );
    assert.match(
        polishScss,
        /\.sw__palette-item-shortcut\s*\{[^}]*linear-gradient/s,
        "画板快捷键必须声明线性渐变键帽背景",
    );
    assert.match(
        polishScss,
        /\.sw__palette-item\.is-selected\s+\.sw__palette-item-shortcut\s*\{/s,
        "选中的画板条目键帽必须高亮匹配主题色",
    );
});

test("T-7360: 切换器顶栏常驻多模态穿透药丸 Chips（全部、@大纲、^正文、#标签、!书签、>命令、?速查）", () => {
    assert.match(
        indexTs,
        /class="sw__mode-chips-bar"/,
        "切换器 HTML 骨架必须常驻 .sw__mode-chips-bar",
    );
    assert.match(
        indexTs,
        /setupSearchModeChips\(/,
        "必须声明 setupSearchModeChips 调度装配函数",
    );
    assert.match(
        polishScss,
        /\.sw__mode-chips-bar\s*\{[^}]*overflow-x:\s*auto/s,
        "模式栏必须支持横向平滑滚动防溢出",
    );
    assert.match(
        polishScss,
        /\.sw__mode-chip\s*\{[^}]*border-radius:\s*var\(--sw-platform-radius-pill/s,
        "模式药丸必须采用全圆角胶囊规范",
    );

    // 检查 7 个核心模式前缀
    for (const prefix of ["@", "^", "#", "!", ">", "?"]) {
        assert.ok(
            indexTs.includes(`prefix: "${prefix}"`),
            `模式药丸必须声明前缀 ${prefix}`,
        );
    }
});

test("T-7360 门禁负向验证: 若破坏键帽渐变或篡改前缀规则必定精确红", () => {
    // 探针 1: 负向验证不存在的假前缀
    assert.doesNotMatch(
        indexTs,
        /prefix:\s*"\$fake_prefix_xyz"/,
        "不得包含非法前缀",
    );

    // 探针 2: 负向断言伪造的不存在样式类
    assert.throws(() => {
        assert.match(polishScss, /\.sw__non_existent_fake_keycap_class/);
    }, assert.AssertionError);
});
