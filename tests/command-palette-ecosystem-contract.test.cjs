// T-7364 命令模式生态命令与插件动作发现契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 renderCommandList 提取 this.getPluginCommands() 并装配 plugins 分组；
//   2. 验证 commandGroupPlugins 存在于中英文双语语言包中；
//   3. 验证 executeFloatingBallAction 支持 kind: "command" 执行链路；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const zhJson = JSON.parse(fs.readFileSync(path.join(root, "src", "i18n", "zh-CN.json"), "utf8"));
const enJson = JSON.parse(fs.readFileSync(path.join(root, "src", "i18n", "en.json"), "utf8"));
const {executeFloatingBallAction} = require("../src/floating-ball-actions.js");

test("T-7364: renderCommandList 装配 getPluginCommands() 与 plugins 命令组", () => {
    assert.match(
        indexTs,
        /const pluginCommands = this\.getPluginCommands\(\);/,
        "命令模式必须调用 this.getPluginCommands() 检索所有已安装插件的命令",
    );
    assert.match(
        indexTs,
        /key:\s*"plugins",\s*label:\s*this\.i18n\.commandGroupPlugins/,
        "必须声明独立的 plugins 命令组并使用 commandGroupPlugins 国际化标签",
    );
});

test("T-7364: commandGroupPlugins 完整声明在中英文双语字典中", () => {
    assert.ok(zhJson.commandGroupPlugins, "zh-CN.json 必须包含 commandGroupPlugins");
    assert.ok(enJson.commandGroupPlugins, "en.json 必须包含 commandGroupPlugins");
    assert.equal(typeof zhJson.commandGroupPlugins, "string");
    assert.equal(typeof enJson.commandGroupPlugins, "string");
});

test("T-7364: executeFloatingBallAction 原生支持 kind: command 执行链路", async () => {
    let executed = false;
    const fakePlugin = {
        name: "siyuan-quickgate",
        commands: [
            {
                langKey: "openGate",
                callback: () => {
                    executed = true;
                    return true;
                },
            },
        ],
    };

    const action = {
        kind: "command",
        value: "siyuan-quickgate::openGate",
    };

    const result = await executeFloatingBallAction(action, {
        plugins: [fakePlugin],
        context: {surface: "desktop"},
    });

    assert.equal(result.ok, true, "插件命令必须成功执行");
    assert.equal(executed, true, "插件命令回调必须被调用");
});

test("T-7364 门禁负向验证: 若缺少插件或命令键未找到必须安全返回 unavailable", async () => {
    // 探针 1: 不存在的插件
    const missingPlugin = await executeFloatingBallAction({
        kind: "command",
        value: "non-existent-plugin::someAction",
    }, {plugins: []});
    assert.equal(missingPlugin.ok, false);
    assert.equal(missingPlugin.reason, "unavailable");

    // 探针 2: 格式非法的 value
    const malformed = await executeFloatingBallAction({
        kind: "command",
        value: "invalid_value_without_colon",
    }, {plugins: []});
    assert.equal(malformed.ok, false);
    assert.equal(malformed.reason, "unavailable");
});
