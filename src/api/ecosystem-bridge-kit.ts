/**
 * 小驴全生态跨插件联邦 SDK（零外部依赖，直接复制到各插件工程内使用）
 * Lv Ecosystem Federation SDK · Epoch 6 Standard
 *
 * 适用插件：
 * 1. siyuan-quickgate (小驴快门)
 * 2. siyuan-checkin   (小驴打卡)
 * 3. siyuan-contacts  (小驴人脉)
 * 4. siyuan-home      (小驴管家)
 * 5. siyuan-speed-switch (小驴雷切)
 * 6. siyuan-glean     (小驴拾遗)
 * 7. siyuan-exam      (小驴考试)
 * 8. siyuan-lv-cards  (小驴闪卡)
 * 9. xiaolv-common    (小驴常用)
 *
 * 铁律保障：
 * - 零强依赖：兄弟插件未安装时自动触发 fallback，绝不抛出未捕获异常
 * - 进程内零私有存储穿透：只走公开桥方法与 DOM CustomEvent
 * - 类型完备：涵盖全生态 9 大插件标准公开接口
 */

/* ========================================================================= */
/* 1. 结果包装信封 (ActionResult Envelope)                                    */
/* ========================================================================= */

export interface ActionResult<T = unknown> {
    ok: boolean;
    data?: T;
    code?: string;
    message?: string;
    details?: unknown;
}

/* ========================================================================= */
/* 2. 小驴生态统一事件信封 (Unified Event Bus Envelope v1)                    */
/* ========================================================================= */

export interface EcosystemEventEnvelope<T = Record<string, unknown>> {
    v: 1;
    source: string;
    type: string;
    eventId: string;
    at: string;
    payload: T;
    idempotencyKey: string;
}

export const ECOSYSTEM_EVENTS = Object.freeze({
    // 打卡
    CHECKIN_RECORDED: "checkin:event-recorded",
    CHECKIN_DELETED: "checkin:event-deleted",
    // 人脉
    CONTACTS_INTERACTION: "lv-contacts:interaction-logged",
    CONTACTS_PERSON_CREATED: "lv-contacts:person-created",
    CONTACTS_DATA_CHANGED: "lv-contacts:data-changed",
    // 管家
    HOME_DATA_CHANGED: "lv-home:data-changed",
    // 雷切
    RAIKIRI_NAVIGATED: "lv-raikiri:navigated",
    // 拾遗
    GLEAN_DATA_CHANGED: "lv-glean:data-changed",
    GLEAN_STATUS_CHANGED: "lv-glean:clip-status-changed",
    // 考试
    EXAM_SESSION_ENDED: "lv-exam:session-ended",
    EXAM_WRONGBOOK_CHANGED: "lv-exam:wrongbook-changed",
    EXAM_STATS: "lv-exam:stats",
    // 闪卡
    CARDS_REVIEWED: "lv-cards:reviewed",
    // 常用
    COMMON_CREATED: "xiaolv:common:item-created",
    COMMON_UPDATED: "xiaolv:common:item-updated",
    COMMON_DELETED: "xiaolv:common:item-deleted",
    // 快门
    QUICKGATE_COMMAND_EXECUTED: "lv-quickgate:command-executed",
    QUICKGATE_DATA_CHANGED: "lv-quickgate:data-changed",
} as const);

/* ========================================================================= */
/* 3. 各插件公开桥类型定义 (Public Bridge Interfaces)                        */
/* ========================================================================= */

// --- ① 小驴打卡 (siyuan-checkin) ---
export interface CheckinItem {
    id: string;
    name: string;
    kind: string;
    unit?: string;
    archived?: boolean;
}

export interface CheckinBatchInput {
    itemId: string;
    value?: number;
    unit?: string;
    source: "api";
    externalRef?: string;
    note?: string;
    occurredAt?: string;
}

export interface CheckinBatchResult {
    kind: "recorded" | "duplicate" | "discarded" | "blocked" | "rejected";
    eventId?: string;
    reason?: string;
    usedFallbackTime?: boolean;
}

export interface CheckinBridgeApi {
    readonly protocol: "siyuan-checkin";
    readonly version: number;
    whenReady(): Promise<boolean>;
    hasCapability(name: string): boolean;
    queryItems(options?: { includeArchived?: boolean; limit?: number }): CheckinItem[];
    recordEventsBatch(inputs: CheckinBatchInput[]): Promise<CheckinBatchResult[]>;
    getStreaks(itemIds?: string[]): Record<string, { current: number; longest: number }>;
    getStrengthSummary?(): unknown;
}

// --- ② 小驴人脉 (siyuan-contacts) ---
export interface ContactsPerson {
    docId: string;
    itemId: string;
    name: string;
    group: string;
    tags: string[];
}

export interface ContactsInteractionResult {
    recorded: number;
    applied: number;
    skipped: number;
    failed: number;
    unknown: number;
    complete: boolean;
    results: Array<{
        index: number;
        docId?: string;
        status: "applied" | "skipped" | "failed" | "unknown";
        writeState: "not_sent" | "rejected" | "unknown" | "verified";
    }>;
}

export interface ContactsBridgeApi {
    readonly protocol: 2;
    whenReady?(): Promise<boolean>;
    hasCapability?(name: string): boolean;
    getOverview?(): unknown;
    searchPeople(kw?: string): Promise<ContactsPerson[]>;
    getPerson(docId: string): Promise<ContactsPerson | null>;
    ensurePerson(name: string, options?: { ref?: string; docId?: string }): Promise<ContactsPerson & { created: boolean }>;
    recordInteraction(docIds: readonly string[], meta?: { ref?: string; date?: string; place?: string; note?: string }): Promise<ContactsInteractionResult>;
}

// --- ③ 小驴管家 (siyuan-home) ---
export interface HomeSummary {
    overdue: number;
    soon: number;
    today: number;
    updatedAt: string;
}

export interface HomeBridgeApi {
    readonly protocol: 1;
    readonly capabilities: readonly string[];
    whenReady(): Promise<boolean>;
    hasCapability?(name: string): boolean;
    getOverview?(): unknown;
    summary(): HomeSummary;
    addMemo(title: string, dueDate: string): Promise<void>;
    openButler(): void;
    openReminders(): void;
}

// --- ④ 小驴雷切 (siyuan-speed-switch) ---
export interface RaikiriHomeModuleOptions {
    moduleId: string;
    title: string;
    icon?: string;
    category?: string;
    supportedDevices?: Array<"desktop" | "sidebar" | "mobile">;
    sizes?: Array<"xs" | "small" | "medium" | "tall" | "wide" | "large" | "full">;
    description?: string;
    source?: { pluginId: string; name: string; version?: string };
    read: (config: unknown, device: string, options?: unknown) => Promise<{ title?: string; items: Array<{ label: string; value?: string; command?: string }> }>;
    open?: () => void;
}

export interface RaikiriBridgeApi {
    readonly protocol: 1;
    readonly capabilities: readonly string[];
    whenReady(): boolean | Promise<boolean>;
    hasCapability?(name: string): boolean;
    openSwitcher(focusSearch?: boolean): ActionResult<boolean>;
    openWorkbench(options?: { tab?: string; entry?: string }): ActionResult<boolean>;
    registerHomeModule?(options: RaikiriHomeModuleOptions): (() => void) | { unregister?: () => void };
}

// --- ⑤ 小驴拾遗 (siyuan-glean) ---
export interface GleanClip {
    id: string;
    title: string;
    hpath: string;
    status: "inbox" | "later" | "reading" | "done" | "archived";
    url?: string;
    site?: string;
    tags?: string[];
    summary?: string;
}

export interface GleanBridgeApi {
    readonly protocol: 1;
    readonly apiVersion: 1;
    readonly capabilities: readonly string[];
    whenReady(): Promise<boolean>;
    hasCapability?(name: string): boolean;
    listClips(filter?: { status?: string; tag?: string; keyword?: string; limit?: number }): Promise<GleanClip[]>;
    getClip(id: string): Promise<GleanClip | null>;
    setClipStatus(id: string, status: "inbox" | "later" | "reading" | "done" | "archived"): Promise<void>;
}

// --- ⑥ 小驴考试 (siyuan-exam) ---
export interface ExamStats {
    streakDays: number;
    accuracyPercent: number;
    todayAnswered: number;
    wrongbookCount: number;
}

export interface ExamBridgeApi {
    readonly protocol: 1;
    readonly capabilities: readonly string[];
    whenReady(): Promise<boolean>;
    hasCapability?(name: string): boolean;
    getOverview?(): unknown;
    statsRead(): Promise<ExamStats>;
    practice(): void;
    wrongbook(): void;
    mock(): void;
}

// --- ⑦ 小驴闪卡 (siyuan-lv-cards) ---
export interface CardsStats {
    todayReviews: number;
    todayNew: number;
    todayForget: number;
    streak: number;
    dueCount: number;
}

export interface CardsDueSummary {
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
    updatedAt: string;
}

export interface CardsBridgeApi {
    readonly protocol: number;
    readonly capabilities: readonly string[];
    whenReady(): Promise<boolean>;
    hasCapability?(name: string): boolean;
    getOverview?(): unknown;
    getStats(): Promise<ActionResult<CardsStats>>;
    getDueSummary(): Promise<ActionResult<CardsDueSummary>>;
    openHub?(tab?: string): Promise<ActionResult<boolean>>;
    openReview?(options?: unknown): Promise<ActionResult<boolean>>;
}

// --- ⑧ 小驴常用 (xiaolv-common) ---
export interface CommonSnippet {
    id: string;
    title: string;
    content: string;
    category?: string;
    tags?: string[];
    alias?: string;
}

export interface CommonBridgeApi {
    readonly protocol: number;
    readonly capabilities: readonly string[];
    whenReady(): Promise<boolean>;
    hasCapability?(name: string): boolean;
    search(kw: string): Promise<ActionResult<CommonSnippet[]>>;
    get(id: string): Promise<ActionResult<CommonSnippet | null>>;
    recent(): Promise<ActionResult<CommonSnippet[]>>;
    favorites(): Promise<ActionResult<CommonSnippet[]>>;
}

// --- ⑨ 小驴快门 (siyuan-quickgate) ---
export interface QuickGateBridgeApi {
    readonly protocol: number;
    readonly capabilities: readonly string[];
    whenReady(): Promise<boolean>;
    hasCapability?(name: string): boolean;
    ping(): Promise<ActionResult<{ name: string; version: string }>>;
    listCommands(plugin?: string): Promise<ActionResult<unknown[]>>;
    runCommand(plugin: string, command: string): Promise<ActionResult<unknown>>;
}

/* ========================================================================= */
/* 4. 统一别名检索表 (Ecosystem Bridge Aliases Registry)                      */
/* ========================================================================= */

export const BRIDGE_ALIASES = Object.freeze({
    checkin: ["siyuanCheckin", "LvCheckin", "lvCheckin", "xiaolvCheckin"],
    contacts: ["LvContacts", "lvContacts", "xiaolvContacts", "siyuanContacts"],
    home: ["LvHome", "lvHome", "xiaolvHome", "siyuanHome"],
    raikiri: ["siyuanSpeedSwitch", "xiaolvSpeedSwitch", "xiaolvRaikiri", "lvRaikiri"],
    glean: ["siyuanGlean", "xiaolvGlean", "lvGlean", "LvGlean"],
    exam: ["LvExam", "siyuanExam", "xiaolvExam", "lvExam"],
    cards: ["xiaolvCards", "lvCards", "LvCards", "siyuanCards"],
    common: ["xiaolvCommon", "LvCommon", "lvCommon", "siyuanCommon"],
    quickgate: ["LvQuickgate", "lvQuickgate", "xiaolvQuickgate", "siyuanQuickgate"],
} as const);

/* ========================================================================= */
/* 5. 核心工具函数：安全探测、调用与优雅降级                                 */
/* ========================================================================= */

/**
 * 安全获取宿主窗口上的公开桥（自动遍历多别名）
 */
export function getBridgeSafely<T = unknown>(target: keyof typeof BRIDGE_ALIASES): T | undefined {
    if (typeof window === "undefined") return undefined;
    const aliases = BRIDGE_ALIASES[target] || [];
    const w = window as unknown as Record<string, unknown>;
    for (const alias of aliases) {
        if (w[alias] && typeof w[alias] === "object") {
            return w[alias] as T;
        }
    }
    return undefined;
}

/**
 * 跨插件安全执行器（核心范式：自动就绪等待、能力协商、超时熔断、全异常隔离、优雅降级）
 */
export async function callBridge<TBridge, TResult>(
    target: keyof typeof BRIDGE_ALIASES,
    requiredCapability: string,
    caller: (bridge: TBridge) => Promise<TResult> | TResult,
    fallback: () => TResult,
    timeoutMs = 2500
): Promise<TResult> {
    const bridge = getBridgeSafely<TBridge>(target);
    if (!bridge) return fallback();

    const anyBridge = bridge as Record<string, unknown>;

    // 1. 就绪等待（带熔断保护，防止卡死）
    if (typeof anyBridge.whenReady === "function") {
        try {
            const readyP = Promise.resolve(anyBridge.whenReady());
            const timeoutP = new Promise((_, reject) => setTimeout(() => reject(new Error("ready-timeout")), timeoutMs));
            await Promise.race([readyP, timeoutP]);
        } catch {
            return fallback();
        }
    }

    // 2. 能力协商
    if (typeof anyBridge.hasCapability === "function") {
        if (!(anyBridge.hasCapability as (c: string) => boolean)(requiredCapability)) {
            return fallback();
        }
    }

    // 3. 业务调用
    try {
        return await caller(bridge);
    } catch (err) {
        console.warn(`[小驴生态联邦] 调用 ${target}.${requiredCapability} 失败，已优雅降级:`, err);
        return fallback();
    }
}

/* ========================================================================= */
/* 6. 高频业务辅助工具 (Business Action Helpers)                              */
/* ========================================================================= */

/**
 * 自动向小驴打卡记录行为事实（考试、闪卡、拾遗、人脉等专用）
 * 自动处理打卡插件存在性探测与回执对账，未安装时安静返回 false，绝不报错
 */
export async function logCheckinEventSafely(options: {
    itemId: string;
    value?: number;
    unit?: string;
    externalRef: string;
    note?: string;
    occurredAt?: string;
}): Promise<boolean> {
    return await callBridge<CheckinBridgeApi, boolean>(
        "checkin",
        "events.record.batch",
        async (bridge) => {
            const results = await bridge.recordEventsBatch([{
                itemId: options.itemId,
                value: options.value ?? 1,
                unit: options.unit,
                source: "api",
                externalRef: options.externalRef,
                note: options.note,
                occurredAt: options.occurredAt ?? new Date().toISOString(),
            }]);
            const r = results[0];
            return r?.kind === "recorded" || r?.kind === "duplicate";
        },
        () => false
    );
}

/**
 * 向小驴雷切工作台安全注册小组件
 */
export function registerRaikiriModuleSafely(options: RaikiriHomeModuleOptions): () => void {
    if (typeof window === "undefined") return () => {};
    const raikiri = getBridgeSafely<RaikiriBridgeApi>("raikiri");
    if (!raikiri || typeof raikiri.registerHomeModule !== "function") return () => {};
    try {
        const handle = raikiri.registerHomeModule(options);
        if (typeof handle === "function") return handle;
        if (handle && typeof handle.unregister === "function") return () => handle.unregister!();
    } catch (e) {
        console.warn("[小驴生态联邦] 注册雷切小组件失败:", e);
    }
    return () => {};
}

/**
 * 订阅生态广播事件（返回自动退订函数，卸载时调用）
 */
export function subscribeEcosystemEvent<T = Record<string, unknown>>(
    eventName: string,
    handler: (detail: EcosystemEventEnvelope<T>) => void
): () => void {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
        return () => {};
    }
    const listener = (evt: Event) => {
        try {
            const custom = evt as CustomEvent<EcosystemEventEnvelope<T>>;
            if (custom.detail) handler(custom.detail);
        } catch (e) {
            console.error(`[小驴生态联邦] 处理事件 ${eventName} 异常:`, e);
        }
    };
    window.addEventListener(eventName, listener);
    return () => {
        window.removeEventListener(eventName, listener);
    };
}
