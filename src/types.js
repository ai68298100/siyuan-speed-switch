"use strict";
// 思源全局对象 window.siyuan 的类型定义（仅覆盖本插件实际访问到的字段）
// 注意：思源没有官方公开发布 .d.ts，部分字段来自反推 / 社区插件沉淀。
// 类型尽量写成"宽进宽出"的反推形式，避免 TypeScript 把 callSite 与实际签名不一致时硬性报错。
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSiyuan = getSiyuan;
// ── 缩略图 IntersectionObserver 反挂标记（避免重复挂载） ──
// 通用 helper：从 window 安全读取思源全局（避免每次写 (window as any).siyuan）
function getSiyuan() {
    // 用 unknown 双步收窄，避开 Window 全局类型与自定义字段类型冲突
    const w = window;
    return w.siyuan;
}
