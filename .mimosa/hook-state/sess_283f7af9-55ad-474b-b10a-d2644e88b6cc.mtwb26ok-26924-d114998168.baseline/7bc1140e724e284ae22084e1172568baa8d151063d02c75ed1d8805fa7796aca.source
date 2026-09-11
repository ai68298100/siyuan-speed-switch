// 简易结构化 logger：统一 [speed-switch] 前缀，可在 release 时直接 tree-shake 掉 debug。
// 目的：替换零散的 console.warn，把"是否输出"集中到一个开关上，方便排查 & 量产打包静音。

// 日志开关由 webpack DefinePlugin 构建时注入（开发 true / 生产 false）。
// 开关以内联形式写在每个方法体内：生产构建替换为 false 后方法体被 esbuild 折叠清空，
// 辅助函数与前缀常量不再被引用，产物中不残留任何日志字符串与输出调用。
declare const __LOG_ENABLED__: boolean;

export const logger = {
    warn(...parts: unknown[]): void {
        if (__LOG_ENABLED__) {
            // eslint-disable-next-line no-console
            console.warn("[speed-switch]", ...parts);
        }
    },
    error(...parts: unknown[]): void {
        if (__LOG_ENABLED__) {
            // eslint-disable-next-line no-console
            console.error("[speed-switch]", ...parts);
        }
    },
    info(...parts: unknown[]): void {
        if (__LOG_ENABLED__) {
            // eslint-disable-next-line no-console
            console.info("[speed-switch]", ...parts);
        }
    },
    debug(...parts: unknown[]): void {
        if (__LOG_ENABLED__) {
            // eslint-disable-next-line no-console
            console.debug("[speed-switch]", ...parts);
        }
    },
};
