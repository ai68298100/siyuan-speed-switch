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

// 全库文档搜索单次取数上限（T-6257，D-384）：全文回退一次最多取 33 条，
// 首屏仍只渲染 DOC_RESULT_LIMIT 条，超出的部分经「加载更多」增量展开；
// 取尽后回落到思源原生搜索出口。分页游标不进缓存 key（同 key 覆盖）。
export const DOC_SEARCH_FETCH_LIMIT = 33;

// 文档搜索结果内存缓存条目上限。超过则整体清空（关键词极少复现，无需严格 LRU 淘汰）
export const DOC_SEARCH_CACHE_LIMIT = 50;

// 持久化数据落盘去抖（MRU / 收藏 / 设置等高频键）
export const SAVE_DEBOUNCE_MS = 500;

// 「最近编辑」排序 SQL 结果短缓存有效期
export const UPDATED_CACHE_MS = 3000;

// 笔记本列表拉取超时：内核无响应时中断请求，避免设置页下拉一直停在加载中
export const NOTEBOOK_FETCH_TIMEOUT_MS = 5000;

// 文档集恢复前的宿主可用性预检并发上限，避免一次恢复压垮内核 RPC。
export const DOCUMENT_SET_PROBE_CONCURRENCY = 4;
export const DOCUMENT_SET_PROBE_TIMEOUT_MS = 5000;
export const DOCUMENT_SET_IMPORT_MAX_BYTES = 512 * 1024;

// 批量开/关页签后给思源 DOM/状态一帧沉降时间：连续 removeTab/MobileTabs 操作降低漏关/漏开概率
export const TAB_SETTLE_MS = 30;
// 批量开关页签后的最长状态确认时间，超时的操作不计入成功数量
export const TAB_VERIFY_TIMEOUT_MS = 1500;
// 同步开始事件丢失结束事件时的安全兜底，避免组件面板永久保持 busy。
export const SYNC_WATCHDOG_MS = 120000;

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

// MRU（最近使用页签）列表上限：每次激活页签都会置顶一条并全量持久化+双端同步，
// 不设上限会随使用时间无限膨胀；超出后从尾部丢弃最旧条目
export const MRU_MAX = 200;
// 最近打开记录上限，避免历史数据无限增长
export const HISTORY_MAX = 50;
// 收藏/置顶/分组均为用户主动维护列表；仍设高容量上限，防止损坏导入造成无限增长。
export const FAVORITES_MAX = 512;
export const PINNED_MAX = 64;
export const FAVORITE_GROUPS_MAX = 64;

// 思源块 ID 格式（14 位时间戳-随机后缀，如 20260721173719-zlynli0）。
// 用于区分文档 rootId 与一次性 tab.id（UUID）：收藏跳转只信任块 ID，
// 避免拿 UUID 调 openTab 静默失败
export const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;

// ==================== 存储键与注册标识 ====================

// 插件持久化数据的 storage key（loadData/saveData 的 key，对应 storage/petal/<插件名>/ 分文件存储）。
// ADR-0002 的遗留闭环项：storage key 改名即数据"丢失"（旧文件残留 + 新文件空白），
// 集中后重命名风险一目了然；业务代码禁止手写这些字符串字面量
export const MRU_KEY = "sw_mru";            // 最近使用页签记录，数组按最近在前排列
export const HISTORY_KEY = "sw_open_history"; // 最近打开文档记录，按最近在前排列
export const CLOSED_HISTORY_KEY = "sw_closed_history"; // 最近关闭文档记录
export const PINNED_KEY = "sw_pinned";      // 置顶页签记录（优先存文档 rootID，跨会话稳定）
export const FAV_KEY = "sw_favorites";      // 收藏页签记录（文档用 rootID 跨会话稳定，收藏后即使关闭也可从收藏栏快速重开）
export const FAV_GROUPS_KEY = "sw_fav_groups"; // 收藏分组注册表：设置页新建的分组（允许暂无收藏项的空分组）
export const SETTINGS_KEY = "sw_settings";  // 插件设置
export const QUICK_ACTIONS_KEY = "sw_quick_actions"; // 快捷入口配置
export const QUICK_ACTIONS_DEFAULTS_KEY = "sw_quick_actions_defaults"; // 快捷入口默认值迁移版本标记
export const DOCUMENT_SETS_KEY = "sw_document_sets"; // 命名文档集 / 工作区快照
export const HOME_STATE_KEY = "sw_home_state"; // 第二面板小组件实例与分端布局
export const THUMB_CACHE_KEY = "sw_thumb_cache"; // 缩略图缓存：rootID → 文档 HTML 快照，页签关闭前一直保留
export const FAV_COLLAPSED_KEY = "sw_fav_collapsed"; // 收藏下拉中已折叠的分组名（持久化，重启后保持展开/折叠状态）
export const SCHEMA_VERSION_KEY = "sw_schema_version"; // 存储版本戳（D-401）：持久化 STORAGE_SCHEMA_VERSION，识别降级/未知版本
export const RSS_READ_KEY = "sw_rss_read"; // RSS 已读状态（T-6685）：条目键 → 标记时间 ms，有界 200 条
// 全部持久化 key 的唯一清单。加载（loadPersistentKeys）与容量测量都必须遍历它，
// 不得在别处再列一遍——历史上两处各写一份，新增 key 时极易漏掉一处。
// 与本仓 storage-migration.js 的 KEY_ORDER 同集，由 tests/data-change-refresh.test.cjs 锁定。
export const PERSISTENT_KEYS: readonly string[] = Object.freeze([
    MRU_KEY, HISTORY_KEY, CLOSED_HISTORY_KEY, PINNED_KEY, FAV_KEY,
    FAV_GROUPS_KEY, FAV_COLLAPSED_KEY, SETTINGS_KEY, QUICK_ACTIONS_KEY,
    QUICK_ACTIONS_DEFAULTS_KEY, DOCUMENT_SETS_KEY, HOME_STATE_KEY, THUMB_CACHE_KEY,
    SCHEMA_VERSION_KEY, RSS_READ_KEY,
]);

export const QUICK_ACTIONS_MAX = 12;

// 侧边栏 dock 的 type（实际注册为 插件名+type）
export const SIDEBAR_DOCK_TYPE = "sidebar";

// 默认快捷键 Alt+Shift+S。思源的 matchHotKey 对修饰键顺序有要求：⌥ 必须在 ⇧ 之前，
// 写成 "⇧⌥S" 时永远无法匹配（按键无反应），务必保持 "⌥⇧S" 顺序。
export const DEFAULT_HOTKEY = "⌥⇧S";
// 旧版本写入的无法匹配的顺序，需在加载时迁移
export const LEGACY_HOTKEY = "⇧⌥S";
// 第二面板默认快捷键 Alt+Shift+P；命令同时注册 globalCallback，
// 思源会为其提供系统级全局热键位（在 设置→快捷键 中为该命令绑定"全局"即可在应用外触发）。
export const SECOND_PANEL_HOTKEY = "⌥⇧P";

// 面板尺寸模式：adaptive=按屏幕比例自适应（默认）/ custom=固定尺寸 / fullscreen=全屏
export type PanelSizeMode = "adaptive" | "custom" | "fullscreen";
export const PANEL_SIZE_MODES: PanelSizeMode[] = ["adaptive", "custom", "fullscreen"];
export const PANEL_SCALE_MIN = 50;   // 自适应比例下限（百分比）
export const PANEL_SCALE_MAX = 100;  // 自适应比例上限（百分比，100% 时铺满可视区再留安全边距）
export const PANEL_SCALE_DEFAULT = 90;
export const PANEL_SIZE_MIN_PX = 420; // 自适应计算的像素下限，避免小窗口下面板过小
export const SETTINGS_PANEL_SCALE = 70; // 设置页桌面端独立自适应比例（不随面板比例设置联动）

// 组件面板尺寸设置：follow=跟随第一面板 / adaptive=独立自适应（90%）/ custom=固定尺寸 / fullscreen=全屏
export type HomeSizeMode = "follow" | "adaptive" | "custom" | "fullscreen";
export const HOME_SIZE_MODES: HomeSizeMode[] = ["follow", "adaptive", "custom", "fullscreen"];
export const HOME_SIZE_DEFAULTS = {
    mode: "follow" as HomeSizeMode,
    width: 960,
    height: 720,
    minW: 480,
    maxW: 1920,
    minH: 360,
    maxH: 1280,
};

// 列表分组流式布局：卡片最小宽与块间距，与 .sw__grid 的 minmax(220px, 1fr)/12px 保持一致
export const GROUP_FLOW_MIN_CARD_PX = 220;
export const GROUP_FLOW_GAP_PX = 12;

// 列表分组方式：none=按窗口平铺（旧行为）/ notebook=按笔记本（默认）/ favorites=按收藏 / createdMonth=按创建月份
export type TabGroupMode = "none" | "notebook" | "path" | "favorites" | "createdMonth";
export const TAB_GROUP_MODES: TabGroupMode[] = ["none", "notebook", "path", "favorites", "createdMonth"];
export const TAB_GROUP_MODE_DEFAULT: TabGroupMode = "notebook";

// 第二面板小组件固定尺寸型号：宽×高（12 列网格，行高 40px）
export type HomeWidgetSize = "xs" | "small" | "medium" | "tall" | "wide" | "large" | "full";
export const HOME_WIDGET_SIZES: Record<HomeWidgetSize, {w: number; h: number}> = {
    xs: {w: 2, h: 3},
    small: {w: 4, h: 3},
    medium: {w: 4, h: 4},
    tall: {w: 4, h: 6},
    wide: {w: 8, h: 3},
    large: {w: 8, h: 5},
    full: {w: 12, h: 6},
};
export const HOME_WIDGET_SIZE_LABELS: Record<HomeWidgetSize, string> = {
    xs: "迷你 2×3",
    small: "小 4×3",
    medium: "方 4×4",
    tall: "高 4×6",
    wide: "宽 8×3",
    large: "大 8×5",
    full: "全幅 12×6",
};

// ==================== T-6811 图标选择器目录（纯数据） ====================
// 思源内置 SVG 图标的中文目录：id 已从本机 3.8.5 构建产物核对；选择器只渲染
// "宿主中真实存在"的条目，目录多列不会出错。
// [图标 id, 中文名，英文名，分类]
export const ICON_CATEGORIES = ["常用", "文档", "编辑", "视图", "时间", "数据", "媒体", "系统", "状态"];
export const ICON_CATALOG: ReadonlyArray<readonly [string, string, string, string]> = [
    // 常用
    ["iconSearch", "搜索", "search", "常用"],
    ["iconAdd", "添加", "add", "常用"],
    ["iconEdit", "编辑", "edit", "常用"],
    ["iconClose", "关闭", "close", "常用"],
    ["iconSettings", "设置", "settings", "常用"],
    ["iconStar", "星标", "star", "常用"],
    ["iconCalendar", "日历", "calendar", "常用"],
    ["iconRefresh", "刷新", "refresh", "常用"],
    ["iconCopy", "复制", "copy", "常用"],
    ["iconTrashcan", "删除", "trash", "常用"],
    ["iconList", "列表", "list", "常用"],
    ["iconFolder", "文件夹", "folder", "常用"],
    ["iconEye", "预览", "eye", "常用"],
    ["iconOpen", "打开", "open", "常用"],
    // 文档
    ["iconFile", "文件", "file", "文档"],
    ["iconFileText", "文本文件", "text file", "文档"],
    ["iconFiles", "多文件", "files", "文档"],
    ["iconAddDoc", "新建文档", "new doc", "文档"],
    ["iconNewNoteBook", "新建笔记本", "new notebook", "文档"],
    ["iconNotebook", "笔记本", "notebook", "文档"],
    ["iconMarkdown", "Markdown", "markdown", "文档"],
    ["iconPDF", "PDF", "pdf", "文档"],
    ["iconDocx", "Word 文档", "docx", "文档"],
    ["iconHTML", "网页", "html", "文档"],
    ["iconQuote", "引用语", "quote", "文档"],
    ["iconRef", "引用块", "ref", "文档"],
    ["iconInclude", "嵌入块", "embed", "文档"],
    ["iconInbox", "收件箱", "inbox", "文档"],
    ["iconPaperclip", "附件", "attachment", "文档"],
    ["iconBookmark", "书签", "bookmark", "文档"],
    ["iconLink", "链接", "link", "文档"],
    // 编辑
    ["iconBold", "加粗", "bold", "编辑"],
    ["iconItalic", "斜体", "italic", "编辑"],
    ["iconUnderline", "下划线", "underline", "编辑"],
    ["iconStrike", "删除线", "strike", "编辑"],
    ["iconHeading", "标题", "heading", "编辑"],
    ["iconCode", "代码块", "code", "编辑"],
    ["iconInlineCode", "行内代码", "inline code", "编辑"],
    ["iconCheck", "待办完成", "todo done", "编辑"],
    ["iconUncheck", "待办未完成", "todo open", "编辑"],
    ["iconOrderedList", "有序列表", "ordered list", "编辑"],
    ["iconIndent", "缩进", "indent", "编辑"],
    ["iconOutdent", "减缩进", "outdent", "编辑"],
    ["iconTurnInto", "转换为", "turn into", "编辑"],
    ["iconFormat", "格式", "format", "编辑"],
    ["iconClear", "清除格式", "clear format", "编辑"],
    ["iconEraser", "橡皮擦", "eraser", "编辑"],
    ["iconUndo", "撤销", "undo", "编辑"],
    ["iconRedo", "重做", "redo", "编辑"],
    ["iconCut", "剪切", "cut", "编辑"],
    ["iconPaste", "粘贴", "paste", "编辑"],
    ["iconReplace", "替换", "replace", "编辑"],
    ["iconRegex", "正则", "regex", "编辑"],
    ["iconExact", "精确", "exact", "编辑"],
    ["iconMath", "公式", "math", "编辑"],
    ["iconFont", "字体", "font", "编辑"],
    ["iconPaintBucket", "填充色", "fill color", "编辑"],
    ["iconPaintRoller", "主题色", "theme color", "编辑"],
    // 视图
    ["iconLayout", "布局", "layout", "视图"],
    ["iconLayoutGrid", "网格", "grid", "视图"],
    ["iconFullscreen", "全屏", "fullscreen", "视图"],
    ["iconFullscreenExit", "退出全屏", "exit fullscreen", "视图"],
    ["iconExpand", "展开", "expand", "视图"],
    ["iconContract", "收起", "contract", "视图"],
    ["iconZoomIn", "放大", "zoom in", "视图"],
    ["iconZoomOut", "缩小", "zoom out", "视图"],
    ["iconFocus", "聚焦", "focus", "视图"],
    ["iconPreview", "预览", "preview", "视图"],
    ["iconTabs", "页签", "tabs", "视图"],
    ["iconSplitLR", "左右分屏", "split lr", "视图"],
    ["iconSplitTB", "上下分屏", "split tb", "视图"],
    ["iconGraph", "关系图", "graph", "视图"],
    ["iconGlobalGraph", "全局关系图", "global graph", "视图"],
    ["iconMindmap", "思维导图", "mindmap", "视图"],
    ["iconOutline", "大纲", "outline", "视图"],
    ["iconListTree", "树形列表", "tree list", "视图"],
    ["iconGallery", "画廊", "gallery", "视图"],
    ["iconBoard", "看板", "board", "视图"],
    // 时间
    ["iconClock", "时钟", "clock", "时间"],
    ["iconHistory", "历史", "history", "时间"],
    ["iconRecentDocs", "最近文档", "recent docs", "时间"],
    ["iconBefore", "之前", "before", "时间"],
    ["iconAfter", "之后", "after", "时间"],
    ["iconPause", "暂停", "pause", "时间"],
    ["iconPlay", "播放", "play", "时间"],
    ["iconRecord", "录制", "record", "时间"],
    // 数据
    ["iconDatabase", "数据库", "database", "数据"],
    ["iconSQL", "SQL 查询", "sql", "数据"],
    ["iconTable", "表格", "table", "数据"],
    ["iconAttr", "属性", "attribute", "数据"],
    ["iconFilter", "筛选", "filter", "数据"],
    ["iconSort", "排序", "sort", "数据"],
    ["iconSelect", "选择", "select", "数据"],
    // 媒体
    ["iconImage", "图片", "image", "媒体"],
    ["iconCamera", "相机", "camera", "媒体"],
    ["iconVideo", "视频", "video", "媒体"],
    ["iconEmoji", "表情", "emoji", "媒体"],
    // 系统
    ["iconPlugin", "插件", "plugin", "系统"],
    ["iconDock", "Dock 面板", "dock", "系统"],
    ["iconWorkspace", "工作区", "workspace", "系统"],
    ["iconAccount", "账户", "account", "系统"],
    ["iconKey", "密钥", "key", "系统"],
    ["iconLock", "锁定", "lock", "系统"],
    ["iconUnlock", "解锁", "unlock", "系统"],
    ["iconCloud", "云端", "cloud", "系统"],
    ["iconDownload", "下载", "download", "系统"],
    ["iconUpload", "上传", "upload", "系统"],
    ["iconTerminal", "终端", "terminal", "系统"],
    ["iconBazaar", "集市", "bazaar", "系统"],
    ["iconSiYuan", "思源", "siyuan", "系统"],
    ["iconQuit", "退出", "quit", "系统"],
    ["iconOpenWindow", "独立窗口", "open window", "系统"],
    ["iconGlobe", "网络", "globe", "系统"],
    // 状态
    ["iconCheck", "完成", "check", "状态"],
    ["iconInfo", "信息", "info", "状态"],
    ["iconHelp", "帮助", "help", "状态"],
    ["iconTriangleAlert", "警告", "warning", "状态"],
    ["iconShieldCheck", "安全", "shield", "状态"],
    ["iconBug", "调试", "bug", "状态"],
    ["iconSend", "发送", "send", "状态"],
];
