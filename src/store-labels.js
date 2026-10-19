"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStorePrivacyLabel = exports.resolveStoreNetworkLabel = void 0;
// 商店/配置表单共用的来源标签解析（R3 重构 D-377：自 index.ts 顶部外迁，
// 供主页商店卡片与组件配置表单两处消费）。
const resolveStoreNetworkLabel = (sourceInfo, i18n) => (sourceInfo === null || sourceInfo === void 0 ? void 0 : sourceInfo.integration) === "http"
    ? i18n.homeStoreNetworkOnline
    : (sourceInfo === null || sourceInfo === void 0 ? void 0 : sourceInfo.integration) === "local-bridge"
        ? i18n.homeStoreNetworkLocal
        : i18n.homeStoreNetworkOffline;
exports.resolveStoreNetworkLabel = resolveStoreNetworkLabel;
const resolveStorePrivacyLabel = (sourceInfo, i18n) => (sourceInfo === null || sourceInfo === void 0 ? void 0 : sourceInfo.privacy) === "location-only"
    ? i18n.homeStorePrivacyLocation
    : (sourceInfo === null || sourceInfo === void 0 ? void 0 : sourceInfo.privacy) === "local-only"
        ? i18n.homeStorePrivacyLocal
        : (sourceInfo === null || sourceInfo === void 0 ? void 0 : sourceInfo.privacy) === "endpoint-only"
            ? i18n.homeStorePrivacyEndpoint
            : i18n.homeStorePrivacyNone;
exports.resolveStorePrivacyLabel = resolveStorePrivacyLabel;
