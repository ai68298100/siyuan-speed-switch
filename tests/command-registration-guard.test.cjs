// T-6301 命令注册守卫契约（issue #1）
//
// 背景：内核 sendGlobalShortcut 固定读取 window.siyuan.languages["_trayMenu"]，
// languages 未就绪的宿主时序下，注册带 globalCallback 的命令会抛
// TypeError（Cannot read properties of undefined (reading '_trayMenu')），
// 异常冒泡中断插件 onload，跳过其后全部 Agent 能力注册。
//
// 本门禁三层：
//   A. util 纯函数行为（isGlobalShortcutHostReady / safeRegisterPluginCommand）
//   B. index.ts 源码契约：两处命令注册必须走 safeRegisterPluginCommand，
//      且不得残留任何裸 this.addCommand( 调用
//   C. 探测器自检：契约正则必须能识别注入的违规（防正则失效恒绿）
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {readSourceText} = require('./source-scan.cjs');
const {isGlobalShortcutHostReady, safeRegisterPluginCommand} = require('../src/util.js');

// ---------- A1: 全局快捷键宿主就绪判定 ----------
test('global shortcut host readiness requires siyuan.languages', () => {
    assert.equal(isGlobalShortcutHostReady(undefined), false);
    assert.equal(isGlobalShortcutHostReady(null), false);
    assert.equal(isGlobalShortcutHostReady({}), false);
    assert.equal(isGlobalShortcutHostReady({languages: undefined}), false);
    assert.equal(isGlobalShortcutHostReady({languages: {}}), true);
    assert.equal(isGlobalShortcutHostReady({languages: {"_trayMenu": "x"}}), true);
});

// ---------- A2: 注册成功直接返回，不重试 ----------
test('safeRegisterPluginCommand passes through on success', () => {
    const registered = [];
    const host = {addCommand: (cmd) => registered.push(cmd), commands: registered};
    const command = {langKey: "switchTabs", hotkey: "Ctrl+G", callback: () => {}};
    assert.equal(safeRegisterPluginCommand(host, command), true);
    assert.deepEqual(registered, [command]);
});

// ---------- A3: 未入队就抛错 → 去 globalCallback 重试一次（保应用内热键） ----------
test('safeRegisterPluginCommand retries without globalCallback when push never happened', () => {
    const calls = [];
    const host = {
        addCommand: (cmd) => {
            calls.push(cmd);
            if (cmd.globalCallback) {
                throw new TypeError("Cannot read properties of undefined (reading '_trayMenu')");
            }
        },
        commands: [],
    };
    const onError = [];
    const ok = safeRegisterPluginCommand(host, {
        langKey: "secondPanel", hotkey: "Alt+G", callback: () => {}, globalCallback: () => {},
    }, (langKey, error) => onError.push([langKey, error.message]));
    assert.equal(ok, true);
    assert.equal(calls.length, 2);
    assert.equal("globalCallback" in calls[1], false);
    assert.equal(calls[1].langKey, "secondPanel");
    assert.equal(onError.length, 1);
    assert.match(onError[0][1], /_trayMenu/);
});

// ---------- A4: 已入队后抛错 → 不重试（防重复注册），降级丢全局热键 ----------
test('safeRegisterPluginCommand does not duplicate when command already pushed', () => {
    let attempts = 0;
    const host = {
        addCommand: (cmd) => {
            attempts += 1;
            host.commands.push(cmd);
            throw new TypeError("tray ipc failed after push");
        },
        commands: [],
    };
    const onError = [];
    const ok = safeRegisterPluginCommand(host, {
        langKey: "secondPanel", hotkey: "Alt+G", callback: () => {}, globalCallback: () => {},
    }, (langKey) => onError.push(langKey));
    assert.equal(ok, false);
    assert.equal(attempts, 1, "已入队后抛错只允许一次 addCommand 调用");
    assert.equal(host.commands.length, 1, "命令保留在 commands 中（应用内热键仍有效）");
    assert.equal(onError.length, 1);
    assert.equal(onError[0], "secondPanel");
});

// ---------- A5: 不带 globalCallback 的命令抛错 → 不重试 ----------
test('safeRegisterPluginCommand never retries plain commands', () => {
    let attempts = 0;
    const host = {addCommand: () => { attempts += 1; throw new Error("boom"); }, commands: []};
    const ok = safeRegisterPluginCommand(host, {langKey: "x", hotkey: "", callback: () => {}});
    assert.equal(ok, false);
    assert.equal(attempts, 1);
});

// ---------- A6: 两次都失败 → false 且 onError 两次 ----------
test('safeRegisterPluginCommand reports both failures', () => {
    let attempts = 0;
    const host = {addCommand: () => { attempts += 1; throw new Error("boom"); }, commands: []};
    const errors = [];
    const ok = safeRegisterPluginCommand(host, {
        langKey: "secondPanel", hotkey: "", callback: () => {}, globalCallback: () => {},
    }, (langKey) => errors.push(langKey));
    assert.equal(ok, false);
    assert.equal(attempts, 2);
    assert.equal(errors.length, 2);
});

// ---------- A7: 非法入参防御 ----------
test('safeRegisterPluginCommand rejects invalid host or command', () => {
    assert.equal(safeRegisterPluginCommand(null, {langKey: "x"}), false);
    assert.equal(safeRegisterPluginCommand({}, {langKey: "x"}), false);
    assert.equal(safeRegisterPluginCommand({addCommand: () => {}}, null), false);
    assert.equal(safeRegisterPluginCommand({addCommand: () => {}}, {hotkey: ""}), false);
});

// ---------- B: index.ts 源码契约（剥注释后判定） ----------
const indexSource = readSourceText(path.join(__dirname, '..', 'src', 'index.ts'));

test('both plugin commands register through the safe guard', () => {
    const guarded = indexSource.match(/safeRegisterPluginCommand\(this,/g) || [];
    assert.equal(guarded.length, 5, "switchTabs/secondPanel/openSettings/openJournal/clipboardEntry 五处都必须走 safeRegisterPluginCommand（T-6821 起含剪贴板入口）");
});

test('no bare this.addCommand call remains in index.ts', () => {
    const bare = indexSource.match(/this\.addCommand\(/g) || [];
    assert.deepEqual(bare, [], "裸 this.addCommand( 会把内核异常直接引入 onload");
});

test('globalCallback registration is gated on host languages readiness', () => {
    assert.match(indexSource, /isGlobalShortcutHostReady\(\(window as/);
    assert.match(indexSource, /\{languages\?: unknown\}/);
});

// ---------- C: 探测器自检——契约必须能识别注入的违规 ----------
test('detector self-check: injected violations are caught (gate is armed)', () => {
    const injected = "safeRegisterPluginCommand(this, {langKey: \"a\"});\n" +
        "this.addCommand({langKey: \"rogue\"});\n" +
        "safeRegisterPluginCommand(this, {langKey: \"b\"});";
    assert.equal((injected.match(/safeRegisterPluginCommand\(this,/g) || []).length, 2);
    assert.equal((injected.match(/this\.addCommand\(/g) || []).length, 1, "裸调用必须被识别为违规");
    const ungated = "safeRegisterPluginCommand(this, {langKey: \"a\"});";
    assert.doesNotMatch(ungated, /isGlobalShortcutHostReady\(/, "缺失能力门控的样本必须探测不到就绪判定");
});
