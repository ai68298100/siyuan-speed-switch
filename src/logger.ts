// 简易结构化 logger：统一 [speed-switch] 前缀，可在 release 时直接 tree-shake 掉 debug。
// 目的：替换零散的 console.warn，把"是否输出"集中到一个开关上，方便排查 & 量产打包静音。

const PREFIX = "[speed-switch]";
const ENABLED = true; // 生产环境可改为 false 由构建器剔除

// 接受任意 parts（string/number/object/Error），统一收敛为 unknown[] 后传给 console.* 的可变参数。
// 这里用 unknown 避免 TypeScript 把 number/object 与 console.* 的 string 签名误判不兼容。
function format(parts: unknown[]): unknown[] {
    const args: unknown[] = [PREFIX];
    for (const p of parts) {
        if (p instanceof Error) {
            args.push(String(p), p);
        } else {
            args.push(p);
        }
    }
    return args;
}

function emit(method: "warn" | "error" | "info" | "debug", parts: unknown[]): void {
    if (!ENABLED) return;
    // eslint-disable-next-line no-console
    console[method](...format(parts));
}

export const logger = {
    warn(...parts: unknown[]): void { emit("warn", parts); },
    error(...parts: unknown[]): void { emit("error", parts); },
    info(...parts: unknown[]): void { emit("info", parts); },
    debug(...parts: unknown[]): void { emit("debug", parts); },
};
