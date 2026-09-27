// 小驴雷切 —— 工作台布局撤销/重做（T-6953，2026-09-27 计划阶段 B）。
// 编辑会话内的操作历史：每个布局操作提交后压入状态快照；撤销/重做在栈内移动。
// 边界（账本验收约定）：只恢复组件实例存在性、位置、尺寸，以及被删实例的既有
// 配置快照——存活实例的最新配置不被历史回滚（reconcileLayoutSnapshot 负责）。
// 历史最多 30 步且有总字节上限，退出编辑会话由调用方整体释放，不新增持久化真源。
"use strict";

const LAYOUT_HISTORY_MAX_STEPS = 30;
const LAYOUT_HISTORY_MAX_BYTES = 128 * 1024;

// 深拷贝一份布局状态并估算字节（JSON 序列化长度 ≈ 内存占用上界；不输出到日志）。
function layoutSnapshotOf(state) {
    const snapshot = JSON.parse(JSON.stringify(state));
    return {state: snapshot, bytes: JSON.stringify(snapshot).length};
}

function createLayoutHistory(snapshot, options) {
    const opts = options || {};
    const entry = {snapshot: snapshot.state, bytes: snapshot.bytes, label: opts.label || ""};
    return {stack: [entry], index: 0, max: opts.max || LAYOUT_HISTORY_MAX_STEPS, maxBytes: opts.maxBytes || LAYOUT_HISTORY_MAX_BYTES};
}

function totalBytes(stack) {
    return stack.reduce((sum, entry) => sum + entry.bytes, 0);
}

// 提交一个新状态：清除重做分支（走新路即弃用旧未来）；与栈顶相同则不重复入栈；
// 步数与总字节超限时从最旧端丢弃（至少保留当前态）。
function pushLayoutHistory(history, snapshot, label) {
    const top = history.stack[history.index];
    if (top && top.snapshot === snapshot) return history;
    const stack = history.stack.slice(0, history.index + 1);
    const entry = {snapshot: snapshot.state, bytes: snapshot.bytes, label: label || ""};
    if (top && JSON.stringify(top.snapshot) === JSON.stringify(entry.snapshot)) {
        return history;
    }
    stack.push(entry);
    let index = stack.length - 1;
    while (stack.length > 1 && (stack.length > history.max || totalBytes(stack) > history.maxBytes)) {
        stack.shift();
        index = Math.min(index, stack.length - 1);
    }
    return {stack, index, max: history.max, maxBytes: history.maxBytes};
}

function canUndoLayoutHistory(history) {
    return history.index > 0;
}

function canRedoLayoutHistory(history) {
    return history.index < history.stack.length - 1;
}

// 撤销：回到上一步快照；label = 被撤销操作的名字（供按钮读出）。
function undoLayoutHistory(history) {
    if (!canUndoLayoutHistory(history)) return {history, snapshot: null, label: ""};
    const index = history.index - 1;
    return {history: {...history, index}, snapshot: history.stack[index].snapshot, label: history.stack[history.index].label};
}

// 重做：前进到下一步快照；label = 将被重做的操作名。
function redoLayoutHistory(history) {
    if (!canRedoLayoutHistory(history)) return {history, snapshot: null, label: ""};
    const index = history.index + 1;
    return {history: {...history, index}, snapshot: history.stack[index].snapshot, label: history.stack[index].label};
}

function peekUndoLabel(history) {
    return canUndoLayoutHistory(history) ? history.stack[history.index].label : "";
}

function peekRedoLabel(history) {
    return canRedoLayoutHistory(history) ? history.stack[history.index + 1].label : "";
}

// 把历史快照落回当前态：存活实例（快照与当前都有）保留**当前配置**（配置编辑不回滚），
// 其余字段（存在性/启用/位置/尺寸）以快照为准；快照独有实例（曾删除）连同其配置恢复。
// 布局表按快照整体恢复。调用方随后过滤已卸载提供方并解释。
function reconcileLayoutSnapshot(snapshot, current) {
    const currentById = new Map();
    (Array.isArray(current?.instances) ? current.instances : []).forEach((inst) => {
        if (inst && inst.instanceId) currentById.set(inst.instanceId, inst);
    });
    const instances = (Array.isArray(snapshot?.instances) ? snapshot.instances : []).map((inst) => {
        const live = currentById.get(inst.instanceId);
        return live ? {...inst, config: live.config} : inst;
    });
    return {
        schemaVersion: current?.schemaVersion ?? snapshot?.schemaVersion ?? 1,
        instances,
        layouts: JSON.parse(JSON.stringify(snapshot?.layouts || {})),
    };
}

module.exports = {
    LAYOUT_HISTORY_MAX_STEPS,
    LAYOUT_HISTORY_MAX_BYTES,
    layoutSnapshotOf,
    createLayoutHistory,
    pushLayoutHistory,
    canUndoLayoutHistory,
    canRedoLayoutHistory,
    undoLayoutHistory,
    redoLayoutHistory,
    peekUndoLabel,
    peekRedoLabel,
    reconcileLayoutSnapshot,
};
