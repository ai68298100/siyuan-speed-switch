/* T-7153：未显式 opt-in 时保持纯 no-op，避免默认 E2E 意外启动内核。 */
import {assertExplicitResourceTrendIsolation} from "./resource-trend.cjs";
import defaultGlobalSetup from "./global-setup.mjs";

const ENABLED = process.env.SWSS_E2E_RESOURCE_TREND === "1";

export default async function resourceTrendGlobalSetup() {
    if (!ENABLED) return async () => {};

    // 编排器在子进程启动后才创建标记；此处先验证显式目标边界，再让
    // 共享 setup 创建并启动隔离实例，随后再次核对完整 target。
    assertExplicitResourceTrendIsolation({requireTarget: false, requireMarker: false});
    const cleanup = await defaultGlobalSetup();
    assertExplicitResourceTrendIsolation();
    return cleanup;
}
