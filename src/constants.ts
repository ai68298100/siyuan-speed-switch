// 集中管理魔法数字 / 阈值常量。
// 命名约定：
//   _MS  : 时间（毫秒）
//   _PX  : 长度 / 位置（CSS 像素）
//   _LIMIT / _MAX / _MIN: 数量上限 / 下限
// 同一域内有 MIN/MAX 的成对出现，便于读代码时一目了然范围。
//
// 历史：v0.15.6 之前这些数字散落在 src/index.ts 顶部 const 块和函数体中，
// 重构和设置默认值调整时容易遗漏；v0.16.0 起按"用途分组"集中到此文件。

// ==================== 搜索与缓存 ====================

// 搜索关键词去抖：每次按键触发 applySearch 后，等待该毫秒才发 /api/filetree/searchDocs
// 太短会浪费内核 RPC；太长用户感觉"卡"。180ms 兼顾响应感与负载。
export const SEARCH_DEBOUNCE_MS = 180;

// 全库文档搜索结果最多展示条数（缓存可能更多，只渲染前 N 条避免一次性渲染上千节点）
export const DOC_RESULT_LIMIT = 12;

// 文档搜索结果内存缓存条目上限。超过则整体清空（关键词极少复现，无需严格 LRU 淘汰）
export const DOC_SEARCH_CACHE_LIMIT = 50;

// 持久化数据落盘去抖（MRU / 收藏 / 设置等高频键）
export const SAVE_DEBOUNCE_MS = 500;

// 「最近编辑」排序 SQL 结果短缓存有效期
export const UPDATED_CACHE_MS = 3000;

// 笔记本列表拉取超时：内核无响应时中断请求，避免设置页下拉一直停在加载中
export const NOTEBOOK_FETCH_TIMEOUT_MS = 5000;

// 批量开/关页签后给思源 DOM/状态一帧沉降时间：连续 removeTab/MobileTabs 操作降低漏关/漏开概率
export const TAB_SETTLE_MS = 30;

// ==================== UI 反馈 ====================

// 悬浮按钮（FAB）隐藏动画时长；与 CSS transition 配合，timeout 后再 remove 节点避免动画闪断
export const FAB_HIDE_DELAY_MS = 250;

// 切换器 / 侧边栏列表滚动超过该阈值才显示「回到顶部」按钮
export const BACK_TOP_THRESHOLD_PX = 240;

// showMessage 默认显示时长（仅个别错误提示，例如日记打开失败）
export const MESSAGE_DEFAULT_MS = 3000;

// ==================== 缩略图渲染 ====================

// 单条缓存 HTML 上限，避免持久化文件膨胀
export const THUMB_HTML_MAX = 200 * 1024;
export const THUMB_HTML_MAX_MOBILE = 80 * 1024;

// 缓存最多保留的文档数（超出按最旧淘汰）
export const THUMB_CACHE_MAX = 40;
export const THUMB_CACHE_MAX_MOBILE = 30;

// 批量渲染缩略图的并发数量
export const THUMB_BATCH = 4;
export const THUMB_BATCH_MOBILE = 2;

// getDoc 回源并发上限
export const THUMB_API_MAX = 4;
export const THUMB_API_MAX_MOBILE = 2;

// 缩略图克隆块数上限：只取文档首屏内容，避免大文档整篇克隆卡顿
export const THUMB_CLONE_MAX = 30;

// 缩略图内容的模拟宽度（px），用于计算缩放比例
export const CONTENT_WIDTH_PX = 800;

// ==================== 弹窗与侧边栏尺寸 ====================

// 设置页 / 切换器弹窗宽高边界
export const DIALOG_WIDTH_MIN_PX = 480;
export const DIALOG_WIDTH_MAX_PX = 1920;
export const DIALOG_HEIGHT_MIN_PX = 360;
export const DIALOG_HEIGHT_MAX_PX = 1280;

// 缩略图高度边界
export const THUMB_HEIGHT_MIN_PX = 72;
export const THUMB_HEIGHT_MAX_PX = 360;
export const MOBILE_THUMB_HEIGHT_MIN_PX = 48;
export const MOBILE_THUMB_HEIGHT_MAX_PX = 200;

// 列数边界
export const COLUMNS_MIN = 0;
export const COLUMNS_MAX = 8;
export const MOBILE_COLUMNS_MIN = 0;
export const MOBILE_COLUMNS_MAX = 2;

// 手机端卡片列数枚举（settings.mobileColumns 存储值）：单列=固定一列，双列=固定两列，
// 自动=竖屏单列横屏双列（由 CSS media query 决定，见 sw__mobile-grid--auto）
export const MOBILE_COLUMNS_SINGLE = 0;
export const MOBILE_COLUMNS_DOUBLE = 1;
export const MOBILE_COLUMNS_AUTO = 2;

// 侧边栏默认宽度（注册 dock 时使用）
export const SIDEBAR_DEFAULT_WIDTH_PX = 340;

// 收藏下拉浮层宽 / 高边界
export const FAV_PANEL_WIDTH_PX = 248;
export const FAV_PANEL_MAX_HEIGHT_PX = 320;
export const FAV_PANEL_MIN_HEIGHT_PX = 140;

// ==================== 内部缓存 ====================

// rootId 映射缓存上限（超出整体清空，页签 id 稳定重复率高）
export const ROOT_ID_CACHE_MAX = 512;

// MRU（最近使用页签）列表上限：每次激活页签都会置顶一条并全量持久化+双端同步，
// 不设上限会随使用时间无限膨胀；超出后从尾部丢弃最旧条目
export const MRU_MAX = 200;

// 思源块 ID 格式（14 位时间戳-随机后缀，如 20260721173719-zlynli0）。
// 用于区分文档 rootId 与一次性 tab.id（UUID）：收藏跳转只信任块 ID，
// 避免拿 UUID 调 openTab 静默失败
export const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;