// 商店/配置表单共用的来源标签解析（R3 重构 D-377：自 index.ts 顶部外迁，
// 供主页商店卡片与组件配置表单两处消费）。
export const resolveStoreNetworkLabel = (sourceInfo: any, i18n: any) => sourceInfo?.integration === "http"
    ? i18n.homeStoreNetworkOnline
    : sourceInfo?.integration === "local-bridge"
        ? i18n.homeStoreNetworkLocal
        : i18n.homeStoreNetworkOffline;
export const resolveStorePrivacyLabel = (sourceInfo: any, i18n: any) => sourceInfo?.privacy === "location-only"
    ? i18n.homeStorePrivacyLocation
    : sourceInfo?.privacy === "local-only"
        ? i18n.homeStorePrivacyLocal
        : sourceInfo?.privacy === "endpoint-only"
            ? i18n.homeStorePrivacyEndpoint
            : i18n.homeStorePrivacyNone;
