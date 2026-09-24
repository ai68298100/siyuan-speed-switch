/**
 * Floating ball portal and lifecycle controller.
 *
 * T-6757/B0 deliberately keeps action rendering out of this module.  The
 * controller owns the DOM singleton, pointer lifecycle, suspension and host
 * redraw recovery; action selection and execution are supplied by the host in
 * later batches.  Keeping that boundary small lets index.ts remain the
 * adapter for settings and the shared quick-action registry.
 */

import {layoutFloatingBallActions, hitTestFloatingBallActions} from "./floating-ball-layout.js";

export type FloatingBallSurface = "desktop" | "sidebar" | "mobile";

export type FloatingBallState =
    | "docked"
    | "dragging"
    | "targeting"
    | "executing"
    | "more"
    | "suspended"
    | "hidden";

export type FloatingBallEdge = "left" | "right";

export interface FloatingBallPosition {
    edge: FloatingBallEdge;
    /** Normalized vertical position in the visible viewport. */
    yRatio: number;
    /** Present only for free placement when edge snapping is disabled. */
    xRatio?: number;
}

export interface FloatingBallBounds {
    /** Viewport coordinates of the host surface's visible rectangle. */
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export interface FloatingBallUiOptions {
    surface: FloatingBallSurface;
    document?: Document;
    /** Portal parent. Defaults to the current document body. */
    host?: HTMLElement;
    /** Re-resolve the parent after a host redraw/replacement. */
    resolveHost?: () => HTMLElement | null;
    /** Optional viewport rectangle used by embedded surfaces such as sidebars. */
    resolveBounds?: () => FloatingBallBounds | null;
    position?: FloatingBallPosition;
    touchSlopPx?: number;
    marginPx?: number;
    edgeAvoidPx?: number;
    /** Opacity applied after the ball has been idle for idleDelayMs. */
    idleOpacity?: number;
    /** Delay before the idle presentation is applied. */
    idleDelayMs?: number;
    /** Move the idle ball partly beyond its attached edge. */
    halfHide?: boolean;
    /** Render size in CSS pixels. Sidebar hosts keep their compact rail. */
    size?: number;
    /** When false, dragging persists a normalized free horizontal position. */
    snap?: boolean;
    /** Disable the trigger while the host action surface is unavailable. */
    available?: boolean;
    /** Yield while the document is in fullscreen. Hidden documents always yield. */
    hideOnFullscreen?: boolean;
    /** Hide while the host surface scrolls downward; reveal on upward scroll. */
    hideOnScroll?: boolean;
    /** Restrict scroll visibility to this host (or its current replacement). */
    resolveScrollTarget?: () => EventTarget | null;
    excludeScrollTarget?: (target: EventTarget) => boolean;
    recoveryLabel?: string;
    /** Current host overlay counter; the ball always stays below it. */
    resolveLayer?: () => number;
    ariaLabel?: string;
    observeHost?: boolean;
    onOpenSwitcher?: () => void;
    onOpenMore?: () => void;
    onBeforeTargeting?: () => void;
    /** Hide transient panels whenever a lifecycle reason blocks the ball. */
    onDismissOverlays?: () => void;
    /** Called when a drag ends over a mounted action target. */
    onActionTarget?: (target: HTMLElement) => void;
    onPositionChange?: (position: FloatingBallPosition) => void;
}

export interface FloatingBallUiPatch {
    position?: FloatingBallPosition;
    touchSlopPx?: number;
    marginPx?: number;
    edgeAvoidPx?: number;
    idleOpacity?: number;
    idleDelayMs?: number;
    halfHide?: boolean;
    size?: number;
    snap?: boolean;
    available?: boolean;
    hideOnFullscreen?: boolean;
    hideOnScroll?: boolean;
    ariaLabel?: string;
}

export interface FloatingBallUiController {
    mount(): HTMLElement | null;
    update(patch: FloatingBallUiPatch): void;
    setSuspended(suspended: boolean): void;
    setHidden(hidden: boolean): void;
    setScrollHidden(hidden: boolean): void;
    setState(state: FloatingBallState): void;
    /** Bounded busy feedback; a stale completion cannot clear a newer run. */
    beginExecution(): () => void;
    getState(): FloatingBallState;
    getPosition(): FloatingBallPosition;
    getElement(): HTMLElement | null;
    focus(): void;
    destroy(): void;
}

const ROOT_CLASS = "sw-fab-root";
const ROOT_SELECTOR = `.${ROOT_CLASS}`;
const ROOT_MARKER = "data-sw-floating-ball";
const DEFAULT_POSITION: FloatingBallPosition = {edge: "right", yRatio: 0.72};
const DEFAULT_TOUCH_SLOP = 9;
const DEFAULT_MARGIN = 8;
const MIN_TOUCH_SLOP = 8;
const MAX_TOUCH_SLOP = 12;
const DEFAULT_IDLE_OPACITY = 0.4;
const DEFAULT_IDLE_DELAY_MS = 5000;
const MAX_IDLE_DELAY_MS = 60_000;
const DEFAULT_BALL_SIZE = 48;
const MIN_BALL_SIZE = 44;
const MAX_BALL_SIZE = 64;

type Cleanup = () => void;

/** A document may contain at most one controller for each surface. */
const ACTIVE_CONTROLLERS = new WeakMap<Document, Map<FloatingBallSurface, FloatingBallUiController>>();

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizePosition(value: FloatingBallPosition | undefined): FloatingBallPosition {
    return {
        edge: value?.edge === "left" ? "left" : "right",
        yRatio: clamp(Number.isFinite(value?.yRatio) ? Number(value?.yRatio) : DEFAULT_POSITION.yRatio, 0, 1),
        ...(Number.isFinite(value?.xRatio) ? {xRatio: clamp(Number(value.xRatio), 0, 1)} : {}),
    };
}

function normalizeTouchSlop(value: number | undefined): number {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_TOUCH_SLOP, MIN_TOUCH_SLOP, MAX_TOUCH_SLOP);
}

function normalizeIdleOpacity(value: number | undefined): number {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_IDLE_OPACITY, 0.4, 1);
}

function normalizeIdleDelay(value: number | undefined): number {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_IDLE_DELAY_MS, 0, MAX_IDLE_DELAY_MS);
}

function normalizeBallSize(value: number | undefined, fallback = DEFAULT_BALL_SIZE): number {
    const candidate = Number(value);
    return Math.round(clamp(Number.isFinite(candidate) ? candidate : fallback, MIN_BALL_SIZE, MAX_BALL_SIZE));
}

function getControllerMap(doc: Document): Map<FloatingBallSurface, FloatingBallUiController> {
    let map = ACTIVE_CONTROLLERS.get(doc);
    if (!map) {
        map = new Map<FloatingBallSurface, FloatingBallUiController>();
        ACTIVE_CONTROLLERS.set(doc, map);
    }
    return map;
}

/**
 * A small, dependency-free lifecycle controller for the floating-ball portal.
 * The class is intentionally usable from tests with a JSDOM document.
 */
export class FloatingBallUi implements FloatingBallUiController {
    private readonly doc: Document | null;
    private readonly surface: FloatingBallSurface;
    private readonly options: FloatingBallUiOptions;
    private readonly cleanups: Cleanup[] = [];
    private root: HTMLElement | null = null;
    private trigger: HTMLButtonElement | null = null;
    private recovery: HTMLButtonElement | null = null;
    private targetCaption: HTMLElement | null = null;
    private observer: MutationObserver | null = null;
    private reconcileTimer: number | null = null;
    private disposed = false;
    private state: FloatingBallState = "docked";
    private position: FloatingBallPosition;
    private touchSlop: number;
    private margin: number;
    /** T-6784/P6：移动端离边停靠——额外从屏幕边缘内收的像素（0=关闭）。 */
    private edgeAvoidPx: number;

    /** P6：移动端离边停靠生效判定（额外内收 ≥ 宿主 12px 侧滑激活条即视为生效）。 */
    private get mobileEdgeAvoid(): boolean {
        return this.surface === "mobile" && this.edgeAvoidPx >= 12;
    }

    /** 离边停靠时水平钳制使用的有效边距（把球体推离宿主侧滑激活条）。 */
    private get effectiveMarginX(): number {
        return this.mobileEdgeAvoid ? clamp(this.margin + this.edgeAvoidPx, 0, 64) : this.margin;
    }

    /** 离边停靠时禁用半隐（半隐会把球推回边缘激活条）。 */
    private get effectiveHalfHide(): boolean {
        return this.halfHide && !this.mobileEdgeAvoid;
    }

    /** P6-B 上滑呼出：docked 状态下的指针轨迹采样（用于速度窗口判定）。 */
    private flingSamples: Array<{x: number; y: number; t: number}> = [];
    private idleOpacity: number;
    private idleDelayMs: number;
    private halfHide: boolean;
    private snap: boolean;
    private available: boolean;
    private hideOnFullscreen: boolean;
    private hideOnScroll: boolean;
    private scrollCleanup: Cleanup | null = null;
    private scrollOffsets = new WeakMap<object, number>();
    // Keep the footprint as a value so pointer frames do not force layout reads.
    private ballSize: number;
    private suspendedReason = false;
    private hiddenReasons = {
        manual: false,
        fullscreen: false,
        visibility: false,
        scroll: false,
    };
    private pointerInside = false;
    private focused = false;
    private idleTimer: number | null = null;
    private activePointerId: number | null = null;
    private pointerStart: {x: number; y: number} | null = null;
    private positionAtPointerStart: FloatingBallPosition | null = null;
    private suppressClick = false;
    private busyTimer: number | null = null;
    private executionVersion = 0;
    private dragBounds: FloatingBallBounds | null = null;
    private dragAnchor: {x: number; y: number} | null = null;
    private dragTargets: Array<{x: number; y: number; size: number; index: number}> = [];
    private dragButtons: HTMLButtonElement[] = [];
    private targetedIndex = -1;
    private layoutBounds: FloatingBallBounds | null = null;
    private renderedAnchor: {x: number; y: number} | null = null;

    constructor(options: FloatingBallUiOptions) {
        this.options = options;
        this.doc = options.document || (typeof document !== "undefined" ? document : null);
        this.surface = options.surface;
        this.position = normalizePosition(options.position);
        this.touchSlop = normalizeTouchSlop(options.touchSlopPx);
        this.margin = clamp(Number(options.marginPx), 0, 64);
        if (!Number.isFinite(this.margin)) this.margin = DEFAULT_MARGIN;
        this.edgeAvoidPx = clamp(Number(options.edgeAvoidPx), 0, 32);
        this.idleOpacity = normalizeIdleOpacity(options.idleOpacity);
        this.idleDelayMs = normalizeIdleDelay(options.idleDelayMs);
        this.halfHide = options.halfHide !== false;
        this.snap = options.snap !== false;
        this.available = options.available !== false;
        this.hideOnFullscreen = options.hideOnFullscreen !== false;
        this.hideOnScroll = options.hideOnScroll !== false;
        this.ballSize = this.surface === "sidebar" ? 44 : normalizeBallSize(options.size);
    }

    mount(): HTMLElement | null {
        if (this.disposed || !this.doc) return null;
        const map = getControllerMap(this.doc);
        const previous = map.get(this.surface);
        if (previous && previous !== this) previous.destroy();
        map.set(this.surface, this);

        const host = this.resolvePortalHost();
        if (!host) return null;
        if (!this.root) this.createPortal();
        this.attachPortal(host);
        this.observeHostRedraw(host);
        return this.root;
    }

    update(patch: FloatingBallUiPatch): void {
        if (this.disposed) return;
        if (this.activePointerId !== null) this.cancelPointer(true);
        if (patch.position) this.position = normalizePosition(patch.position);
        if (patch.touchSlopPx !== undefined) this.touchSlop = normalizeTouchSlop(patch.touchSlopPx);
        if (patch.marginPx !== undefined) {
            const margin = Number(patch.marginPx);
            this.margin = clamp(Number.isFinite(margin) ? margin : DEFAULT_MARGIN, 0, 64);
        }
        if (patch.edgeAvoidPx !== undefined) this.edgeAvoidPx = clamp(Number(patch.edgeAvoidPx), 0, 32);
        if (patch.idleOpacity !== undefined) this.idleOpacity = normalizeIdleOpacity(patch.idleOpacity);
        if (patch.idleDelayMs !== undefined) this.idleDelayMs = normalizeIdleDelay(patch.idleDelayMs);
        if (patch.halfHide !== undefined) this.halfHide = patch.halfHide !== false;
        if (patch.size !== undefined && this.surface !== "sidebar") this.ballSize = normalizeBallSize(patch.size);
        if (patch.snap !== undefined) this.snap = patch.snap !== false;
        if (patch.available !== undefined) this.available = patch.available === true;
        if (patch.hideOnFullscreen !== undefined) {
            this.hideOnFullscreen = patch.hideOnFullscreen !== false;
            this.syncDocumentVisibility();
        }
        if (patch.hideOnScroll !== undefined) {
            this.hideOnScroll = patch.hideOnScroll !== false;
            if (!this.hideOnScroll) this.setScrollHidden(false);
            this.syncScrollLifecycle();
        }
        if (patch.ariaLabel !== undefined && this.trigger) {
            this.trigger.setAttribute("aria-label", patch.ariaLabel);
            this.trigger.setAttribute("title", patch.ariaLabel);
        }
        this.applyPosition();
        this.applyAccessibilityState();
        this.setIdle(false);
        this.scheduleIdle();
    }

    setSuspended(suspended: boolean): void {
        if (this.disposed || this.suspendedReason === suspended) return;
        this.suspendedReason = suspended;
        if (suspended) {
            this.options.onDismissOverlays?.();
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!suspended) this.markActive();
    }

    setHidden(hidden: boolean): void {
        if (this.disposed || this.hiddenReasons.manual === hidden) return;
        this.hiddenReasons.manual = hidden;
        if (hidden) {
            this.options.onDismissOverlays?.();
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden) this.markActive();
    }

    setScrollHidden(hidden: boolean): void {
        if (this.disposed || this.hiddenReasons.scroll === hidden) return;
        this.hiddenReasons.scroll = hidden;
        if (hidden) {
            this.options.onDismissOverlays?.();
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden) this.markActive();
    }

    setState(state: FloatingBallState): void {
        if (this.disposed) return;
        if (state === "suspended") return this.setSuspended(true);
        if (state === "hidden") return this.setHidden(true);
        this.applyState(this.effectiveBlockedState() || state);
    }

    beginExecution(): () => void {
        const version = ++this.executionVersion;
        if (this.busyTimer !== null) this.doc?.defaultView?.clearTimeout(this.busyTimer);
        this.setState("executing");
        const finish = () => {
            if (this.disposed || version !== this.executionVersion) return;
            if (this.busyTimer !== null) this.doc?.defaultView?.clearTimeout(this.busyTimer);
            this.busyTimer = null;
            if (this.state === "executing") this.setState("docked");
        };
        this.busyTimer = this.doc?.defaultView?.setTimeout(finish, 1500) ?? null;
        return finish;
    }

    private applyState(state: FloatingBallState): void {
        if (this.disposed) return;
        this.state = state;
        if (this.root) this.root.dataset.state = state;
        this.syncRecovery();
        if (this.trigger) {
            this.applyAccessibilityState();
        }
        if (state !== "docked") {
            this.clearIdleTimer();
            this.setIdle(false);
        } else {
            this.scheduleIdle();
        }
    }

    getState(): FloatingBallState {
        return this.state;
    }

    getPosition(): FloatingBallPosition {
        return {...this.position};
    }

    getElement(): HTMLElement | null {
        return this.root;
    }

    focus(): void {
        if (this.disposed || !this.trigger || !this.available || this.isInteractionBlocked()) return;
        this.trigger.focus();
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.cancelPointer(true);
        this.clearIdleTimer();
        if (this.busyTimer !== null) this.doc?.defaultView?.clearTimeout(this.busyTimer);
        this.busyTimer = null;
        this.executionVersion += 1;
        if (this.reconcileTimer !== null && this.doc) {
            const view = this.doc.defaultView;
            if (view) view.clearTimeout(this.reconcileTimer);
            else clearTimeout(this.reconcileTimer);
            this.reconcileTimer = null;
        }
        this.observer?.disconnect();
        this.observer = null;
        this.scrollCleanup?.();
        this.scrollCleanup = null;
        this.pointerInside = false;
        this.focused = false;
        while (this.cleanups.length) this.cleanups.pop()?.();
        this.root?.remove();
        this.recovery?.remove();
        this.recovery = null;
        this.root = null;
        this.trigger = null;
        this.targetCaption = null;
        if (this.doc) {
            const map = ACTIVE_CONTROLLERS.get(this.doc);
            if (map?.get(this.surface) === this) map.delete(this.surface);
        }
    }

    private createPortal(): void {
        const root = this.doc.createElement("div");
        // Keep sw__fab on the portal root while the existing stylesheet is
        // being migrated.  New CSS can target sw-fab-root without breaking
        // users who still have the legacy FAB rules loaded.
        root.className = `${ROOT_CLASS} sw__fab`;
        root.setAttribute(ROOT_MARKER, this.surface);
        root.dataset.surface = this.surface;
        root.dataset.state = this.state;
        root.dataset.idle = "false";
        root.dataset.halfHide = String(this.effectiveHalfHide);
        // T-6778（ADR 0071 方案 A）：思源 3.8.x 宿主以 data-prevent-swipe 整轮
        // 让出侧滑手势所有权——声明后球上的触摸不再触发宿主左/右侧栏。
        if (this.surface === "mobile") {
            root.dataset.preventSwipe = "true";
            // L2 纵深防御（T-6778b）：capture 相位吞掉球上的触摸事件流，
            // document bubble 监听（宿主侧滑状态机，addEventListener(..., false)）
            // 对无 marker 契约的旧宿主（3.8.0）也收不到这些触摸。
            const swallow = (event: Event): void => { event.stopPropagation(); };
            for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"] as const) {
                root.addEventListener(type, swallow, true);
                this.cleanups.push(() => root.removeEventListener(type, swallow, true));
            }
            // L3：拖动/选态中的 touchmove preventDefault，阻断滚动链与原生平移；
            // 其余状态放行默认行为——更多面板的竖向滚动不受影响。
            const blockScroll = (event: TouchEvent): void => {
                if (this.state === "dragging" || this.state === "targeting") event.preventDefault();
            };
            root.addEventListener("touchmove", blockScroll, {passive: false});
            this.cleanups.push(() => root.removeEventListener("touchmove", blockScroll));
        }
        root.style.setProperty("--sw-fab-idle-opacity", String(this.idleOpacity));
        root.style.setProperty("--sw-fab-size", `${this.ballSize}px`);

        const trigger = this.doc.createElement("button");
        trigger.type = "button";
        trigger.className = "sw-fab-trigger";
        trigger.setAttribute("aria-label", this.options.ariaLabel || "打开切换器");
        trigger.setAttribute("title", this.options.ariaLabel || "打开切换器");
        trigger.setAttribute("aria-expanded", "false");
        trigger.innerHTML = "<svg aria-hidden=\"true\"><use href=\"#iconLayout\" xlink:href=\"#iconLayout\"></use></svg>";
        root.appendChild(trigger);
        const caption = this.doc.createElement("span");
        caption.className = "sw-fab-target-caption";
        caption.setAttribute("aria-hidden", "true");
        caption.hidden = true;
        root.appendChild(caption);
        this.targetCaption = caption;

        this.root = root;
        this.trigger = trigger;
        const recovery = this.doc.createElement("button");
        recovery.type = "button";
        recovery.className = "sw-fab-recovery";
        recovery.dataset.surface = this.surface;
        // T-6778：恢复把手挂在 body 层（portal 根之外），需自带侧滑让位标记
        if (this.surface === "mobile") {
            recovery.dataset.preventSwipe = "true";
        }
        recovery.setAttribute("aria-label", this.options.recoveryLabel || "恢复悬浮球");
        recovery.textContent = "⋮";
        recovery.hidden = true;
        const restoreScroll = () => { this.setScrollHidden(false); this.focus(); };
        recovery.addEventListener("click", restoreScroll);
        this.cleanups.push(() => recovery.removeEventListener("click", restoreScroll));
        this.recovery = recovery;
        this.bindPointerLifecycle(trigger);
        this.bindKeyboardLifecycle(trigger);
        this.bindActivityLifecycle(trigger);
        this.bindEnvironmentLifecycle();
        this.bindViewportLifecycle();
        this.syncScrollLifecycle();
        this.applyPosition();
        this.applyState(this.effectiveBlockedState() || this.state);
        this.scheduleIdle();
    }

    private resolvePortalHost(): HTMLElement | null {
        if (this.options.resolveHost) return this.options.resolveHost();
        if (this.options.host) return this.options.host;
        return this.doc.body || null;
    }

    private attachPortal(host: HTMLElement): void {
        if (!this.root) return;
        // A hot-reloaded bundle can leave a marked root behind after its
        // module-level WeakMap was recreated.  Keep the DOM singleton even in
        // that case; the normal plugin onunload path still owns listener
        // cleanup for the old controller.
        const stale = host.querySelector<HTMLElement>(
            `${ROOT_SELECTOR}[${ROOT_MARKER}="${this.surface}"]`,
        );
        if (stale && stale !== this.root) stale.remove();
        const staleRecovery = host.querySelector(`.sw-fab-recovery[data-surface="${this.surface}"]`);
        if (staleRecovery && staleRecovery !== this.recovery) staleRecovery.remove();
        if (this.root.parentElement !== host) host.appendChild(this.root);
        if (this.recovery?.parentElement !== host) host.appendChild(this.recovery);
        this.applyPosition();
    }

    private observeHostRedraw(host: HTMLElement): void {
        if (this.options.observeHost === false) return;
        const MutationObserverCtor = this.doc.defaultView?.MutationObserver;
        if (typeof MutationObserverCtor !== "function") return;
        this.observer?.disconnect();
        const observedRoot = host.ownerDocument.body || host;
        this.observer = new MutationObserverCtor(() => {
            if (this.disposed || this.reconcileTimer !== null) return;
            if (this.root?.isConnected && this.root.parentElement === host && this.recovery?.parentElement === host) return;
            const view = this.doc.defaultView;
            const schedule = () => {
                this.reconcileTimer = null;
                if (this.disposed) return;
                const nextHost = this.resolvePortalHost();
                if (!nextHost) return;
                if (!this.root) this.createPortal();
                this.attachPortal(nextHost);
                this.observeHostRedraw(nextHost);
            };
            this.reconcileTimer = view
                ? view.setTimeout(schedule, 0)
                : setTimeout(schedule, 0) as unknown as number;
        });
        this.observer.observe(observedRoot, {childList: true, subtree: true});
    }

    private bindPointerLifecycle(trigger: HTMLButtonElement): void {
        const onPointerDown = (event: PointerEvent) => {
            if (this.isInteractionBlocked() || this.activePointerId !== null) return;
            if (event.isPrimary === false) return;
            if (event.button !== undefined && event.button !== 0) return;
            this.activePointerId = event.pointerId;
            this.markActive();
            this.pointerStart = {x: event.clientX, y: event.clientY};
            this.positionAtPointerStart = this.getPosition();
            this.suppressClick = false;
            if (this.surface === "mobile") this.flingSamples = [{x: event.clientX, y: event.clientY, t: Date.now()}];
            try { trigger.setPointerCapture(event.pointerId); } catch (_) { /* WebView may not support capture. */ }
        };
        const onPointerMove = (event: PointerEvent) => {
            if (this.activePointerId !== event.pointerId || !this.pointerStart) return;
            if (this.isInteractionBlocked()) {
                this.cancelPointer(true);
                return;
            }
            // P6-B 上滑呼出：仅 docked（未进入拖动）时采样轨迹
            if (this.surface === "mobile" && this.state === "docked") {
                this.flingSamples.push({x: event.clientX, y: event.clientY, t: Date.now()});
                if (this.flingSamples.length > 6) this.flingSamples.shift();
            }
            const dx = event.clientX - this.pointerStart.x;
            const dy = event.clientY - this.pointerStart.y;
            if (this.state !== "dragging" && this.state !== "targeting" && Math.hypot(dx, dy) > this.touchSlop) {
                this.suppressClick = true;
                this.prepareDragTargets();
                this.setState("dragging");
            }
            if (this.state !== "dragging" && this.state !== "targeting") return;
            event.preventDefault();
            this.position = this.positionFromPointer(event.clientX, event.clientY);
            const bounds = this.dragBounds;
            const anchor = this.dragAnchor;
            if (bounds && anchor) {
                const radius = this.ballSize / 2;
                const x = clamp(event.clientX, bounds.left + this.effectiveMarginX + radius, Math.max(bounds.left + this.effectiveMarginX + radius, bounds.right - this.effectiveMarginX - radius));
                const y = clamp(event.clientY, bounds.top + this.margin + radius, Math.max(bounds.top + this.margin + radius, bounds.bottom - this.margin - radius));
                this.root?.style.setProperty("--sw-fab-drag-x", `${x - anchor.x}px`);
                this.root?.style.setProperty("--sw-fab-drag-y", `${y - anchor.y}px`);
            }
            this.targetedIndex = hitTestFloatingBallActions(this.dragTargets, event.clientX, event.clientY, 8);
            this.dragButtons.forEach((button, index) => button.classList.toggle("is-targeted", index === this.targetedIndex));
            if (this.targetCaption && bounds && anchor) {
                const target = this.dragTargets.find((point) => point.index === this.targetedIndex);
                this.targetCaption.hidden = !target;
                if (target) {
                    const width = Math.min(144, bounds.right - bounds.left - 16);
                    const left = clamp(target.x - width / 2, bounds.left + 8, bounds.right - width - 8);
                    const above = target.y - target.size / 2 - 32;
                    const top = above >= bounds.top + 8 ? above : target.y + target.size / 2 + 4;
                    this.targetCaption.textContent = this.dragButtons[this.targetedIndex]?.getAttribute("aria-label") || "";
                    this.targetCaption.style.width = `${width}px`;
                    this.targetCaption.style.left = `${left - anchor.x + this.ballSize / 2}px`;
                    this.targetCaption.style.top = `${top - anchor.y + (this.surface === "mobile" ? 0 : this.ballSize / 2)}px`;
                }
            }
            this.setState(this.targetedIndex >= 0 ? "targeting" : "dragging");
        };
        const onPointerUp = (event: PointerEvent) => {
            if (this.activePointerId !== event.pointerId) return;
            // P6-B 上滑呼出：docked 状态下快速上划 = 打开更多动作面板
            // （速度+方向双判定；触发后抑制合成 click，避免再打开切换器）
            if (this.surface === "mobile" && this.state === "docked" && this.flingSamples.length >= 2) {
                const first = this.flingSamples[0];
                const last = this.flingSamples[this.flingSamples.length - 1];
                const dy = last.y - first.y;
                const dx = last.x - first.x;
                const dt = Math.max(1, last.t - first.t);
                if (dy <= -24 && Math.abs(dx) <= 12 && dy / dt <= -0.5) {
                    this.flingSamples = [];
                    this.suppressClick = true;
                    this.cancelPointer(false);
                    this.setState("more");
                    this.options.onOpenMore?.();
                    return;
                }
            }
            this.flingSamples = [];
            if (this.isInteractionBlocked()) {
                this.cancelPointer(true);
                return;
            }
            const wasDragging = this.state === "dragging" || this.state === "targeting";
            let target: HTMLButtonElement | undefined;
            if (wasDragging) {
                const index = hitTestFloatingBallActions(this.dragTargets, event.clientX, event.clientY, 8);
                target = this.dragButtons[index];
                this.position = target ? {...this.positionAtPointerStart} : this.positionFromPointer(event.clientX, event.clientY);
                event.preventDefault();
            }
            this.cancelPointer(false);
            if (wasDragging) {
                this.applyPosition();
                if (target?.isConnected && !target.disabled) this.options.onActionTarget?.(target);
                else if (!target) this.options.onPositionChange?.(this.getPosition());
            }
            // A drag's pointerup can still be followed by the synthetic
            // button click.  Keep the guard alive until that click handler
            // consumes it; pointercancel/blur clear it immediately.
            this.suppressClick = wasDragging;
        };
        const onPointerCancel = (event: PointerEvent) => {
            if (this.activePointerId !== event.pointerId) return;
            this.cancelPointer(true);
        };
        const onClick = (event: MouseEvent) => {
            this.markActive();
            if (this.suppressClick) {
                this.suppressClick = false;
                event.preventDefault();
                return;
            }
            if (this.isInteractionBlocked()) return;
            this.options.onOpenSwitcher?.();
        };
        const onContextMenu = (event: MouseEvent) => {
            this.markActive();
            event.preventDefault();
            if (this.isInteractionBlocked()) return;
            if (!this.options.onOpenMore) return;
            this.setState("more");
            this.options.onOpenMore?.();
        };
        trigger.addEventListener("pointerdown", onPointerDown);
        this.doc.addEventListener("pointermove", onPointerMove);
        this.doc.addEventListener("pointerup", onPointerUp);
        this.doc.addEventListener("pointercancel", onPointerCancel);
        trigger.addEventListener("lostpointercapture", onPointerCancel);
        trigger.addEventListener("click", onClick);
        trigger.addEventListener("contextmenu", onContextMenu);
        this.cleanups.push(() => {
            trigger.removeEventListener("pointerdown", onPointerDown);
            this.doc.removeEventListener("pointermove", onPointerMove);
            this.doc.removeEventListener("pointerup", onPointerUp);
            this.doc.removeEventListener("pointercancel", onPointerCancel);
            trigger.removeEventListener("lostpointercapture", onPointerCancel);
            trigger.removeEventListener("click", onClick);
            trigger.removeEventListener("contextmenu", onContextMenu);
        });

        const view = this.doc.defaultView;
        if (view) {
            const onBlur = () => this.cancelPointer(true);
            view.addEventListener("blur", onBlur);
            this.cleanups.push(() => view.removeEventListener("blur", onBlur));
        }
    }

    private bindKeyboardLifecycle(trigger: HTMLButtonElement): void {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
            event.preventDefault();
            this.markActive();
            if (this.isInteractionBlocked()) return;
            if (!this.options.onOpenMore) return;
            this.setState("more");
            this.options.onOpenMore?.();
        };
        trigger.addEventListener("keydown", onKeyDown);
        this.cleanups.push(() => trigger.removeEventListener("keydown", onKeyDown));
    }

    private bindActivityLifecycle(trigger: HTMLButtonElement): void {
        const onPointerEnter = () => {
            this.pointerInside = true;
            this.markActive();
        };
        const onPointerLeave = () => {
            this.pointerInside = false;
            this.scheduleIdle();
        };
        const onFocus = () => {
            this.focused = true;
            this.markActive();
        };
        const onFocusOut = (event: FocusEvent) => {
            const related = event.relatedTarget as Node | null;
            if (related && this.root?.contains(related)) return;
            this.focused = false;
            this.scheduleIdle();
        };
        trigger.addEventListener("pointerenter", onPointerEnter);
        trigger.addEventListener("pointerleave", onPointerLeave);
        const root = this.root;
        trigger.addEventListener("focus", onFocus);
        root.addEventListener("focusin", onFocus);
        root.addEventListener("focusout", onFocusOut);
        this.cleanups.push(() => {
            trigger.removeEventListener("pointerenter", onPointerEnter);
            trigger.removeEventListener("pointerleave", onPointerLeave);
            root.removeEventListener("focusin", onFocus);
            trigger.removeEventListener("focus", onFocus);
            root.removeEventListener("focusout", onFocusOut);
        });
    }

    private bindEnvironmentLifecycle(): void {
        const onVisibilityChange = () => this.syncDocumentVisibility();
        this.doc.addEventListener("fullscreenchange", onVisibilityChange);
        this.doc.addEventListener("visibilitychange", onVisibilityChange);
        this.cleanups.push(() => {
            this.doc?.removeEventListener("fullscreenchange", onVisibilityChange);
            this.doc?.removeEventListener("visibilitychange", onVisibilityChange);
        });
        onVisibilityChange();
    }

    /**
     * Re-apply the fixed portal position after a resize, rotation, or mobile
     * keyboard viewport change. The listener is event-driven and does no
     * polling or layout work while the viewport is stable.
     */
    private bindViewportLifecycle(): void {
        const view = this.doc.defaultView;
        if (!view) return;
        const onViewportChange = () => {
            if (this.disposed) return;
            this.cancelPointer(true);
            this.applyPosition();
            this.syncDocumentVisibility();
            if (this.state === "docked") this.scheduleIdle();
        };
        view.addEventListener("resize", onViewportChange, {passive: true});
        view.addEventListener("orientationchange", onViewportChange, {passive: true});
        const visualViewport = view.visualViewport;
        visualViewport?.addEventListener("resize", onViewportChange, {passive: true});
        visualViewport?.addEventListener("scroll", onViewportChange, {passive: true});
        this.cleanups.push(() => {
            view.removeEventListener("resize", onViewportChange);
            view.removeEventListener("orientationchange", onViewportChange);
            visualViewport?.removeEventListener("resize", onViewportChange);
            visualViewport?.removeEventListener("scroll", onViewportChange);
        });
    }

    private syncDocumentVisibility(): void {
        this.setEnvironmentHidden("fullscreen", this.hideOnFullscreen && Boolean(this.doc?.fullscreenElement));
        this.setEnvironmentHidden("visibility", this.doc?.visibilityState === "hidden");
    }

    private syncScrollLifecycle(): void {
        this.scrollCleanup?.();
        this.scrollCleanup = null;
        this.scrollOffsets = new WeakMap<object, number>();
        if (!this.doc || this.disposed || !this.hideOnScroll) return;
        const onScroll = (event: Event) => {
            if (this.disposed || !this.hideOnScroll || ["executing", "dragging", "targeting", "more"].includes(this.state)) return;
            const rawTarget = event.target;
            if (!rawTarget || (typeof rawTarget !== "object")) return;
            const target = rawTarget as object;
            if (this.options.excludeScrollTarget?.(rawTarget)) return;
            const scrollHost = this.options.resolveScrollTarget?.() || null;
            if (scrollHost && scrollHost !== rawTarget) {
                const hostNode = scrollHost as Node;
                if (!hostNode.nodeType || !(rawTarget as Node).nodeType || !hostNode.contains(rawTarget as Node)) return;
            }
            const nodeType = Number((rawTarget as Node).nodeType);
            if (this.root && nodeType > 0 && this.root.contains(rawTarget as Node)) return;
            const offset = this.readScrollOffset(target);
            if (offset === null) return;
            const previous = this.scrollOffsets.get(target);
            this.scrollOffsets.set(target, offset);
            // The first event establishes a baseline and does not hide the
            // ball. Subsequent direction changes are the only state writes.
            if (previous === undefined || Math.abs(offset - previous) < 1) return;
            this.setScrollHidden(offset > previous);
        };
        this.doc.addEventListener("scroll", onScroll, {capture: true, passive: true});
        this.scrollCleanup = () => {
            this.doc?.removeEventListener("scroll", onScroll, true);
            this.scrollCleanup = null;
        };
    }

    private readScrollOffset(target: object): number | null {
        if (target === this.doc || target === this.doc.documentElement || target === this.doc.body) {
            const view = this.doc.defaultView;
            return Math.max(0, Number(view?.scrollY) || 0, Number(this.doc.documentElement?.scrollTop) || 0, Number(this.doc.body?.scrollTop) || 0);
        }
        const value = Number((target as HTMLElement).scrollTop);
        return Number.isFinite(value) ? Math.max(0, value) : null;
    }

    private setEnvironmentHidden(reason: "fullscreen" | "visibility", hidden: boolean): void {
        if (this.disposed || this.hiddenReasons[reason] === hidden) return;
        this.hiddenReasons[reason] = hidden;
        if (hidden) {
            this.options.onDismissOverlays?.();
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden) this.markActive();
    }

    private effectiveBlockedState(): FloatingBallState | null {
        if (this.suspendedReason) return "suspended";
        if (this.hiddenReasons.manual || this.hiddenReasons.fullscreen || this.hiddenReasons.visibility || this.hiddenReasons.scroll) return "hidden";
        return null;
    }

    private isInteractionBlocked(): boolean {
        return this.state === "suspended" || this.state === "hidden" || this.state === "executing"
            || !this.available;
    }

    private applyAccessibilityState(): void {
        if (!this.root || !this.trigger) return;
        const inert = this.state === "suspended" || this.state === "hidden";
        if (inert) {
            const active = this.doc?.activeElement as HTMLElement | null;
            if (active && this.root.contains(active)) active.blur?.();
            this.focused = false;
            this.pointerInside = false;
        }
        this.root.setAttribute("aria-hidden", String(inert));
        this.root.toggleAttribute("inert", inert);
        this.root.inert = inert;
        this.trigger.tabIndex = inert ? -1 : 0;
        this.trigger.disabled = !this.available || this.state === "executing" || inert;
        this.trigger.setAttribute("aria-busy", String(this.state === "executing"));
        this.trigger.setAttribute("aria-expanded", String(this.state === "targeting" || this.state === "more"));
    }

    private markActive(): void {
        if (this.disposed || this.state === "suspended" || this.state === "hidden") return;
        this.setIdle(false);
        if (this.pointerInside || this.focused || this.activePointerId !== null) this.clearIdleTimer();
        else this.scheduleIdle();
    }

    private setIdle(idle: boolean): void {
        if (!this.root) return;
        this.root.dataset.idle = String(idle);
        this.root.dataset.halfHide = String(this.effectiveHalfHide && (this.snap || this.position.xRatio === undefined));
        this.root.style.setProperty("--sw-fab-idle-opacity", String(this.idleOpacity));
    }

    private clearIdleTimer(): void {
        if (this.idleTimer === null || !this.doc) return;
        const view = this.doc.defaultView;
        if (view) view.clearTimeout(this.idleTimer);
        else clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }

    private scheduleIdle(): void {
        if (!this.root || this.disposed || this.state !== "docked") return;
        this.clearIdleTimer();
        if (this.pointerInside || this.focused || this.activePointerId !== null) return;
        if (this.idleDelayMs <= 0) {
            this.setIdle(true);
            return;
        }
        const view = this.doc.defaultView;
        const timeout = () => {
            this.idleTimer = null;
            if (this.disposed || this.state !== "docked") return;
            this.setIdle(true);
        };
        this.idleTimer = view
            ? view.setTimeout(timeout, this.idleDelayMs)
            : setTimeout(timeout, this.idleDelayMs) as unknown as number;
    }

    private cancelPointer(restore: boolean): void {
        const preserveClickSuppression = !restore && this.suppressClick;
        if (restore && this.positionAtPointerStart) {
            this.position = this.positionAtPointerStart;
            this.applyPosition();
        }
        const pointerId = this.activePointerId;
        this.activePointerId = null;
        if (pointerId !== null && this.trigger) {
            try { this.trigger.releasePointerCapture(pointerId); } catch (_) { /* already released */ }
        }
        this.pointerStart = null;
        this.positionAtPointerStart = null;
        this.dragTargets = [];
        this.dragButtons.forEach((button) => { button.classList.remove("is-targeted"); button.hidden = false; });
        this.dragButtons = [];
        this.dragBounds = null;
        this.dragAnchor = null;
        this.targetedIndex = -1;
        if (this.targetCaption) this.targetCaption.hidden = true;
        this.root?.style.removeProperty("--sw-fab-drag-x");
        this.root?.style.removeProperty("--sw-fab-drag-y");
        this.suppressClick = preserveClickSuppression;
        if (this.state === "dragging" || this.state === "targeting") this.setState("docked");
        else this.scheduleIdle();
    }

    private positionFromPointer(clientX: number, clientY: number): FloatingBallPosition {
        const view = this.doc.defaultView;
        const viewportWidth = Math.max(1, view?.innerWidth || this.doc.documentElement.clientWidth || 1);
        const viewportHeight = Math.max(1, view?.innerHeight || this.doc.documentElement.clientHeight || 1);
        const bounds = this.dragBounds || this.getBounds(viewportWidth, viewportHeight);
        const ballHeight = this.ballSize;
        const minCenter = bounds.top + this.margin + ballHeight / 2;
        const maxCenter = Math.max(minCenter, bounds.bottom - this.margin - ballHeight / 2);
        const availableHeight = Math.max(1, maxCenter - minCenter);
        return {
            edge: clientX <= bounds.left + (bounds.right - bounds.left) / 2 ? "left" : "right",
            yRatio: clamp((clientY - minCenter) / availableHeight, 0, 1),
            ...(!this.snap ? {xRatio: clamp((clientX - bounds.left - this.margin - ballHeight / 2)
                / Math.max(1, bounds.right - bounds.left - 2 * this.margin - ballHeight), 0, 1)} : {}),
        };
    }

    private getBounds(viewportWidth: number, viewportHeight: number): FloatingBallBounds {
        const visual = this.doc.defaultView?.visualViewport;
        const visible = {
            left: Math.max(0, visual?.offsetLeft || 0),
            top: Math.max(0, visual?.offsetTop || 0),
            right: Math.min(viewportWidth, (visual?.offsetLeft || 0) + (visual?.width || viewportWidth)),
            bottom: Math.min(viewportHeight, (visual?.offsetTop || 0) + (visual?.height || viewportHeight)),
        };
        if (this.surface === "mobile" && this.root) {
            const style = this.doc.defaultView?.getComputedStyle(this.root);
            const inset = (key: string) => Math.max(0, parseFloat(style?.getPropertyValue(key) || "0") || 0);
            visible.top += inset("--sw-fab-safe-top");
            visible.bottom -= inset("--sw-fab-safe-bottom") + 48;
            visible.left += inset("--sw-fab-safe-left");
            visible.right -= inset("--sw-fab-safe-right");
        }
        const raw = this.options.resolveBounds?.();
        if (!raw) return visible;
        const left = Number(raw.left);
        const right = Number(raw.right);
        const top = Number(raw.top);
        const bottom = Number(raw.bottom);
        if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
            return visible;
        }
        return {
            left: clamp(left, visible.left, visible.right),
            right: clamp(right, visible.left, visible.right),
            top: clamp(top, visible.top, visible.bottom),
            bottom: clamp(bottom, visible.top, visible.bottom),
        };
    }

    private applyPosition(): void {
        if (!this.root) return;
        const {edge, yRatio} = this.position;
        const view = this.doc.defaultView;
        const viewportWidth = Math.max(1, view?.innerWidth || this.doc.documentElement.clientWidth || 1);
        const viewportHeight = Math.max(1, view?.innerHeight || this.doc.documentElement.clientHeight || 1);
        const bounds = this.getBounds(viewportWidth, viewportHeight);
        this.layoutBounds = bounds;
        this.root.dataset.edge = edge;
        this.root.dataset.yRatio = String(yRatio);
        this.root.style.setProperty("--sw-fab-size", `${this.ballSize}px`);
        const hostLayer = this.options.resolveLayer?.();
        this.root.style.zIndex = String(Number.isFinite(hostLayer) ? Math.max(0, Math.min(999, hostLayer - 1)) : 999);
        if (this.recovery) this.recovery.style.zIndex = this.root.style.zIndex;
        if (this.options.resolveBounds) {
            this.root.style.setProperty("--sw-fab-host-width", `${Math.max(0, bounds.right - bounds.left)}px`);
        } else {
            this.root.style.removeProperty("--sw-fab-host-width");
        }
        const radius = this.ballSize / 2;
        const minCenter = bounds.top + this.margin + radius;
        const maxCenter = Math.max(minCenter, bounds.bottom - this.margin - radius);
        const center = minCenter + (maxCenter - minCenter) * yRatio;
        const minX = bounds.left + this.effectiveMarginX + radius;
        const maxX = Math.max(minX, bounds.right - this.effectiveMarginX - radius);
        const xRatio = !this.snap && this.position.xRatio !== undefined ? this.position.xRatio : (edge === "left" ? 0 : 1);
        const x = minX + (maxX - minX) * xRatio;
        this.renderedAnchor = {x, y: center};
        this.root.style.top = `${center.toFixed(3)}px`;
        this.root.style.left = xRatio === 1 ? "auto" : `${(x - radius).toFixed(3)}px`;
        this.root.style.right = xRatio === 1 ? `${(viewportWidth - bounds.right + this.effectiveMarginX).toFixed(3)}px` : "auto";
        this.syncRecovery();
    }

    private prepareDragTargets(): void {
        this.options.onBeforeTargeting?.();
        this.applyPosition();
        this.dragBounds = this.layoutBounds;
        this.dragAnchor = this.renderedAnchor;
        if (!this.root || !this.dragBounds || !this.dragAnchor) return;
        const host = this.root.querySelector<HTMLElement>(".sw__floating-ball-first-layer");
        if (!host) return;
        this.dragButtons = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-action-id]"));
        const layout = layoutFloatingBallActions({bounds: this.dragBounds, anchor: this.dragAnchor,
            edge: this.position.edge, surface: this.surface, count: this.dragButtons.length,
            size: this.surface === "mobile" ? 48 : 44, margin: Math.max(8, this.margin)});
        this.dragTargets = layout.targets;
        host.classList.add("is-positioned");
        host.dataset.layout = layout.mode;
        this.dragButtons.forEach((button, index) => {
            const point = this.dragTargets.find((item) => item.index === index);
            button.hidden = !point;
            if (!point) return;
            button.style.left = `${point.x - this.dragAnchor.x + this.ballSize / 2}px`;
            button.style.top = `${point.y - this.dragAnchor.y + (this.surface === "mobile" ? 0 : this.ballSize / 2)}px`;
            button.style.width = `${point.size}px`;
            button.style.height = `${point.size}px`;
        });
    }

    private syncRecovery(): void {
        if (!this.recovery) return;
        this.recovery.hidden = !this.hiddenReasons.scroll || this.suspendedReason || this.hiddenReasons.manual
            || this.hiddenReasons.fullscreen || this.hiddenReasons.visibility || this.disposed;
        if (!this.root || !this.layoutBounds || !this.renderedAnchor) return;
        this.recovery.style.top = `${this.renderedAnchor.y - 22}px`;
        this.recovery.style.left = this.position.edge === "left" ? `${this.layoutBounds.left}px` : "auto";
        const width = this.doc.defaultView?.innerWidth || this.doc.documentElement.clientWidth;
        this.recovery.style.right = this.position.edge === "right" ? `${width - this.layoutBounds.right}px` : "auto";
    }
}

export function createFloatingBallUi(options: FloatingBallUiOptions): FloatingBallUiController {
    return new FloatingBallUi(options);
}

// Friendly alias for callers that want the architectural name used by ADR
// 0066 while keeping the UI-specific class name available to existing code.
export {FloatingBallUi as FloatingBallController};
