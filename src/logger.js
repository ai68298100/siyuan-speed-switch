"use strict";
// 简易结构化 logger：统一 [speed-switch] 前缀，可在 release 时直接 tree-shake 掉 debug。
// 目的：替换零散的 console.warn，把"是否输出"集中到一个开关上，方便排查 & 量产打包静音。
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logger = {
    warn(...parts) {
        if (__LOG_ENABLED__) {
            // eslint-disable-next-line no-console
            console.warn("[speed-switch]", ...parts);
        }
    },
    error(...parts) {
        if (__LOG_ENABLED__) {
            // eslint-disable-next-line no-console
            console.error("[speed-switch]", ...parts);
        }
    },
    info(...parts) {
        if (__LOG_ENABLED__) {
            // eslint-disable-next-line no-console
            console.info("[speed-switch]", ...parts);
        }
    },
    debug(...parts) {
        if (__LOG_ENABLED__) {
            // eslint-disable-next-line no-console
            console.debug("[speed-switch]", ...parts);
        }
    },
};
