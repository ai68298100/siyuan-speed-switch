"use strict";

/**
 * 小驴速切 · 第三方组件最小示例
 * ================================
 *
 * 这是一个可完整复制的 registerHomeModule 接入模板，对应
 * docs/widget-protocol.md。把本文件并入你插件的 onload 流程，
 * 替换 README 注释标注的三处业务点即可上架组件商店。
 *
 * 契约测试（tests/widget-example-contract.test.cjs）会校验本示例
 * 使用的字段与生产协议白名单一致；修改本文件前先跑一遍该测试。
 */

const EXAMPLE_CONFIG_SCHEMA = Object.freeze([
    {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 6},
    {key: "notebook", label: "笔记本", type: "notebook", defaults: ""},
]);

function registerExampleHomeModule(switcherPlugin, myPlugin) {
    if (!switcherPlugin || typeof switcherPlugin.registerHomeModule !== "function") {
        return null; // 未安装小驴速切或版本过旧：安静降级
    }
    return switcherPlugin.registerHomeModule({
        moduleId: "my-plugin-example-summary",
        title: "示例·今日摘要",
        icon: "iconSparkles",
        category: "plugin",
        description: "示例组件：演示只读快照、命令跳转与声明式配置的标准接入。",
        author: "your-name",
        homepage: "https://github.com/your-name/your-plugin",
        protocolVersion: 2,
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        refreshOn: ["switch-protyle", "loaded-protyle", "destroy-protyle"],
        configSchema: EXAMPLE_CONFIG_SCHEMA.map((field) => ({...field})),
        // 业务点 1：读取你的数据，返回有界只读快照（label ≤256 字，≤12 条）。
        read: async (config, device, options) => {
            const limit = Math.max(1, Math.min(12, Number(config?.limit) || 6));
            const items = [
                {label: "示例条目 A", value: "", command: "your-plugin::open"},
                {label: "示例条目 B", value: "20260914090000-abcdef", href: "siyuan://blocks/20260914090000-abcdef"},
            ].slice(0, options?.size === "small" ? 2 : limit);
            return {title: device === "mobile" ? "摘要" : "今日摘要", items};
        },
        // 业务点 2：读取失败时的跳转目标（可选；也可用 clickCommand 字符串）。
        open: () => {
            const command = myPlugin?.commands?.find((entry) => entry.langKey === "open");
            if (command?.callback) command.callback();
        },
        // 业务点 3：在插件 onunload 中调用返回的 unregister()。
    });
}

module.exports = {EXAMPLE_CONFIG_SCHEMA, registerExampleHomeModule};
