"use strict";
/**
 * Floating ball portal and lifecycle controller.
 *
 * T-6757/B0 deliberately keeps action rendering out of this module.  The
 * controller owns the DOM singleton, pointer lifecycle, suspension and host
 * redraw recovery; action selection and execution are supplied by the host in
 * later batches.  Keeping that boundary small lets index.ts remain the
 * adapter for settings and the shared quick-action registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FloatingBallController = exports.FloatingBallUi = void 0;
exports.createFloatingBallUi = createFloatingBallUi;
const floating_ball_layout_js_1 = require("./floating-ball-layout.js");
const floating_ball_model_js_1 = require("./floating-ball-model.js");
const ROOT_CLASS = "sw-fab-root";
const ROOT_SELECTOR = `.${ROOT_CLASS}`;
const ROOT_MARKER = "data-sw-floating-ball";
const DEFAULT_POSITION = { edge: "right", yRatio: 0.72 };
const DEFAULT_TOUCH_SLOP = 9;
const DEFAULT_MARGIN = 8;
const MIN_TOUCH_SLOP = 8;
const MAX_TOUCH_SLOP = 12;
const DEFAULT_IDLE_OPACITY = 0.4;
const DEFAULT_IDLE_DELAY_MS = 5000;
const MAX_IDLE_DELAY_MS = 60000;
const DEFAULT_BALL_SIZE = 48;
const MIN_BALL_SIZE = 44;
const MAX_BALL_SIZE = 64;
/** A document may contain at most one controller for each surface. */
const ACTIVE_CONTROLLERS = new WeakMap();
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function normalizePosition(value) {
    return Object.assign({ edge: (value === null || value === void 0 ? void 0 : value.edge) === "left" ? "left" : "right", yRatio: clamp(Number.isFinite(value === null || value === void 0 ? void 0 : value.yRatio) ? Number(value === null || value === void 0 ? void 0 : value.yRatio) : DEFAULT_POSITION.yRatio, 0, 1) }, (Number.isFinite(value === null || value === void 0 ? void 0 : value.xRatio) ? { xRatio: clamp(Number(value.xRatio), 0, 1) } : {}));
}
function normalizeTouchSlop(value) {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_TOUCH_SLOP, MIN_TOUCH_SLOP, MAX_TOUCH_SLOP);
}
function normalizeIdleOpacity(value) {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_IDLE_OPACITY, 0.4, 1);
}
function normalizeIdleDelay(value) {
    const candidate = Number(value);
    return clamp(Number.isFinite(candidate) ? candidate : DEFAULT_IDLE_DELAY_MS, 0, MAX_IDLE_DELAY_MS);
}
function normalizeBallSize(value, fallback = DEFAULT_BALL_SIZE) {
    const candidate = Number(value);
    return Math.round(clamp(Number.isFinite(candidate) ? candidate : fallback, MIN_BALL_SIZE, MAX_BALL_SIZE));
}
function getControllerMap(doc) {
    let map = ACTIVE_CONTROLLERS.get(doc);
    if (!map) {
        map = new Map();
        ACTIVE_CONTROLLERS.set(doc, map);
    }
    return map;
}
/**
 * A small, dependency-free lifecycle controller for the floating-ball portal.
 * The class is intentionally usable from tests with a JSDOM document.
 */
class FloatingBallUi {
    /** P6：移动端离边停靠生效判定（额外内收 ≥ 宿主 12px 侧滑激活条即视为生效）。 */
    get mobileEdgeAvoid() {
        return this.surface === "mobile" && this.edgeAvoidPx >= 12;
    }
    /** 离边停靠时水平钳制使用的有效边距（把球体推离宿主侧滑激活条）。 */
    get effectiveMarginX() {
        return this.mobileEdgeAvoid ? clamp(this.margin + this.edgeAvoidPx, 0, 64) : this.margin;
    }
    /** 离边停靠时禁用半隐（半隐会把球推回边缘激活条）。 */
    get effectiveHalfHide() {
        return this.halfHide && !this.mobileEdgeAvoid;
    }
    constructor(options) {
        this.cleanups = [];
        this.root = null;
        this.trigger = null;
        this.recovery = null;
        this.targetCaption = null;
        this.observer = null;
        this.reconcileTimer = null;
        this.disposed = false;
        this.state = "docked";
        /** P6-B 上滑呼出：docked 状态下的指针轨迹采样（用于速度窗口判定）。 */
        this.flingSamples = [];
        this.scrollCleanup = null;
        this.scrollOffsets = new WeakMap();
        this.suspendedReason = false;
        this.hiddenReasons = {
            manual: false,
            fullscreen: false,
            visibility: false,
            scroll: false,
        };
        this.pointerInside = false;
        this.focused = false;
        this.idleTimer = null;
        this.activePointerId = null;
        this.pointerStart = null;
        this.positionAtPointerStart = null;
        this.suppressClick = false;
        this.busyTimer = null;
        this.executionVersion = 0;
        // T-6919：双击/长按时序状态。pressTimer=长按武装定时器；pendingTapTimer=
        // 单击延迟判别定时器；longPressFired 抑制长按后合成 click 的重复触发。
        this.pressTimer = null;
        this.longPressFired = false;
        this.pendingTapTimer = null;
        this.lastTapAt = 0;
        this.dragBounds = null;
        this.dragAnchor = null;
        this.dragTargets = [];
        this.dragButtons = [];
        this.targetedIndex = -1;
        this.layoutBounds = null;
        this.renderedAnchor = null;
        this.options = options;
        this.doc = options.document || (typeof document !== "undefined" ? document : null);
        this.surface = options.surface;
        this.position = normalizePosition(options.position);
        this.touchSlop = normalizeTouchSlop(options.touchSlopPx);
        this.margin = clamp(Number(options.marginPx), 0, 64);
        if (!Number.isFinite(this.margin))
            this.margin = DEFAULT_MARGIN;
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
    mount() {
        if (this.disposed || !this.doc)
            return null;
        const map = getControllerMap(this.doc);
        const previous = map.get(this.surface);
        if (previous && previous !== this)
            previous.destroy();
        map.set(this.surface, this);
        const host = this.resolvePortalHost();
        if (!host)
            return null;
        if (!this.root)
            this.createPortal();
        this.attachPortal(host);
        this.observeHostRedraw(host);
        return this.root;
    }
    update(patch) {
        if (this.disposed)
            return;
        if (this.activePointerId !== null)
            this.cancelPointer(true);
        if (patch.position)
            this.position = normalizePosition(patch.position);
        if (patch.touchSlopPx !== undefined)
            this.touchSlop = normalizeTouchSlop(patch.touchSlopPx);
        if (patch.marginPx !== undefined) {
            const margin = Number(patch.marginPx);
            this.margin = clamp(Number.isFinite(margin) ? margin : DEFAULT_MARGIN, 0, 64);
        }
        if (patch.edgeAvoidPx !== undefined)
            this.edgeAvoidPx = clamp(Number(patch.edgeAvoidPx), 0, 32);
        if (patch.idleOpacity !== undefined)
            this.idleOpacity = normalizeIdleOpacity(patch.idleOpacity);
        if (patch.idleDelayMs !== undefined)
            this.idleDelayMs = normalizeIdleDelay(patch.idleDelayMs);
        if (patch.halfHide !== undefined)
            this.halfHide = patch.halfHide !== false;
        if (patch.size !== undefined && this.surface !== "sidebar")
            this.ballSize = normalizeBallSize(patch.size);
        if (patch.snap !== undefined)
            this.snap = patch.snap !== false;
        if (patch.available !== undefined)
            this.available = patch.available === true;
        if (patch.hideOnFullscreen !== undefined) {
            this.hideOnFullscreen = patch.hideOnFullscreen !== false;
            this.syncDocumentVisibility();
        }
        if (patch.hideOnScroll !== undefined) {
            this.hideOnScroll = patch.hideOnScroll !== false;
            if (!this.hideOnScroll)
                this.setScrollHidden(false);
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
    setSuspended(suspended) {
        var _a, _b;
        if (this.disposed || this.suspendedReason === suspended)
            return;
        this.suspendedReason = suspended;
        if (suspended) {
            (_b = (_a = this.options).onDismissOverlays) === null || _b === void 0 ? void 0 : _b.call(_a);
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!suspended)
            this.markActive();
    }
    setHidden(hidden) {
        var _a, _b;
        if (this.disposed || this.hiddenReasons.manual === hidden)
            return;
        this.hiddenReasons.manual = hidden;
        if (hidden) {
            (_b = (_a = this.options).onDismissOverlays) === null || _b === void 0 ? void 0 : _b.call(_a);
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden)
            this.markActive();
    }
    setScrollHidden(hidden) {
        var _a, _b;
        if (this.disposed || this.hiddenReasons.scroll === hidden)
            return;
        this.hiddenReasons.scroll = hidden;
        if (hidden) {
            (_b = (_a = this.options).onDismissOverlays) === null || _b === void 0 ? void 0 : _b.call(_a);
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden)
            this.markActive();
    }
    setState(state) {
        if (this.disposed)
            return;
        if (state === "suspended")
            return this.setSuspended(true);
        if (state === "hidden")
            return this.setHidden(true);
        this.applyState(this.effectiveBlockedState() || state);
    }
    beginExecution() {
        var _a, _b, _c, _d, _e;
        const version = ++this.executionVersion;
        if (this.busyTimer !== null)
            (_b = (_a = this.doc) === null || _a === void 0 ? void 0 : _a.defaultView) === null || _b === void 0 ? void 0 : _b.clearTimeout(this.busyTimer);
        this.setState("executing");
        const finish = () => {
            var _a, _b;
            if (this.disposed || version !== this.executionVersion)
                return;
            if (this.busyTimer !== null)
                (_b = (_a = this.doc) === null || _a === void 0 ? void 0 : _a.defaultView) === null || _b === void 0 ? void 0 : _b.clearTimeout(this.busyTimer);
            this.busyTimer = null;
            if (this.state === "executing")
                this.setState("docked");
        };
        this.busyTimer = (_e = (_d = (_c = this.doc) === null || _c === void 0 ? void 0 : _c.defaultView) === null || _d === void 0 ? void 0 : _d.setTimeout(finish, 1500)) !== null && _e !== void 0 ? _e : null;
        return finish;
    }
    applyState(state) {
        if (this.disposed)
            return;
        this.state = state;
        if (this.root)
            this.root.dataset.state = state;
        this.syncRecovery();
        if (this.trigger) {
            this.applyAccessibilityState();
        }
        if (state !== "docked") {
            this.clearIdleTimer();
            this.setIdle(false);
        }
        else {
            this.scheduleIdle();
        }
    }
    getState() {
        return this.state;
    }
    getPosition() {
        return Object.assign({}, this.position);
    }
    getElement() {
        return this.root;
    }
    focus() {
        if (this.disposed || !this.trigger || !this.available || this.isInteractionBlocked())
            return;
        this.trigger.focus();
    }
    destroy() {
        var _a, _b, _c, _d, _e, _f, _g;
        if (this.disposed)
            return;
        this.disposed = true;
        this.cancelPointer(true);
        this.clearPressTimer();
        this.clearPendingTapTimer();
        this.longPressFired = false;
        this.clearIdleTimer();
        if (this.busyTimer !== null)
            (_b = (_a = this.doc) === null || _a === void 0 ? void 0 : _a.defaultView) === null || _b === void 0 ? void 0 : _b.clearTimeout(this.busyTimer);
        this.busyTimer = null;
        this.executionVersion += 1;
        if (this.reconcileTimer !== null && this.doc) {
            const view = this.doc.defaultView;
            if (view)
                view.clearTimeout(this.reconcileTimer);
            else
                clearTimeout(this.reconcileTimer);
            this.reconcileTimer = null;
        }
        (_c = this.observer) === null || _c === void 0 ? void 0 : _c.disconnect();
        this.observer = null;
        (_d = this.scrollCleanup) === null || _d === void 0 ? void 0 : _d.call(this);
        this.scrollCleanup = null;
        this.pointerInside = false;
        this.focused = false;
        while (this.cleanups.length)
            (_e = this.cleanups.pop()) === null || _e === void 0 ? void 0 : _e();
        (_f = this.root) === null || _f === void 0 ? void 0 : _f.remove();
        (_g = this.recovery) === null || _g === void 0 ? void 0 : _g.remove();
        this.recovery = null;
        this.root = null;
        this.trigger = null;
        this.targetCaption = null;
        if (this.doc) {
            const map = ACTIVE_CONTROLLERS.get(this.doc);
            if ((map === null || map === void 0 ? void 0 : map.get(this.surface)) === this)
                map.delete(this.surface);
        }
    }
    createPortal() {
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
            const swallow = (event) => { event.stopPropagation(); };
            for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
                root.addEventListener(type, swallow, true);
                this.cleanups.push(() => root.removeEventListener(type, swallow, true));
            }
            // L3：拖动/选态中的 touchmove preventDefault，阻断滚动链与原生平移；
            // 其余状态放行默认行为——更多面板的竖向滚动不受影响。
            const blockScroll = (event) => {
                if (this.state === "dragging" || this.state === "targeting")
                    event.preventDefault();
            };
            root.addEventListener("touchmove", blockScroll, { passive: false });
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
    resolvePortalHost() {
        if (this.options.resolveHost)
            return this.options.resolveHost();
        if (this.options.host)
            return this.options.host;
        return this.doc.body || null;
    }
    attachPortal(host) {
        var _a;
        if (!this.root)
            return;
        // A hot-reloaded bundle can leave a marked root behind after its
        // module-level WeakMap was recreated.  Keep the DOM singleton even in
        // that case; the normal plugin onunload path still owns listener
        // cleanup for the old controller.
        const stale = host.querySelector(`${ROOT_SELECTOR}[${ROOT_MARKER}="${this.surface}"]`);
        if (stale && stale !== this.root)
            stale.remove();
        const staleRecovery = host.querySelector(`.sw-fab-recovery[data-surface="${this.surface}"]`);
        if (staleRecovery && staleRecovery !== this.recovery)
            staleRecovery.remove();
        if (this.root.parentElement !== host)
            host.appendChild(this.root);
        if (((_a = this.recovery) === null || _a === void 0 ? void 0 : _a.parentElement) !== host)
            host.appendChild(this.recovery);
        this.applyPosition();
    }
    observeHostRedraw(host) {
        var _a, _b;
        if (this.options.observeHost === false)
            return;
        const MutationObserverCtor = (_a = this.doc.defaultView) === null || _a === void 0 ? void 0 : _a.MutationObserver;
        if (typeof MutationObserverCtor !== "function")
            return;
        (_b = this.observer) === null || _b === void 0 ? void 0 : _b.disconnect();
        const observedRoot = host.ownerDocument.body || host;
        this.observer = new MutationObserverCtor(() => {
            var _a, _b;
            if (this.disposed || this.reconcileTimer !== null)
                return;
            if (((_a = this.root) === null || _a === void 0 ? void 0 : _a.isConnected) && this.root.parentElement === host && ((_b = this.recovery) === null || _b === void 0 ? void 0 : _b.parentElement) === host)
                return;
            const view = this.doc.defaultView;
            const schedule = () => {
                this.reconcileTimer = null;
                if (this.disposed)
                    return;
                const nextHost = this.resolvePortalHost();
                if (!nextHost)
                    return;
                if (!this.root)
                    this.createPortal();
                this.attachPortal(nextHost);
                this.observeHostRedraw(nextHost);
            };
            this.reconcileTimer = view
                ? view.setTimeout(schedule, 0)
                : setTimeout(schedule, 0);
        });
        this.observer.observe(observedRoot, { childList: true, subtree: true });
    }
    bindPointerLifecycle(trigger) {
        const onPointerDown = (event) => {
            var _a, _b;
            if (this.isInteractionBlocked() || this.activePointerId !== null)
                return;
            if (event.isPrimary === false)
                return;
            if (event.button !== undefined && event.button !== 0)
                return;
            this.activePointerId = event.pointerId;
            this.markActive();
            this.pointerStart = { x: event.clientX, y: event.clientY };
            this.positionAtPointerStart = this.getPosition();
            this.suppressClick = false;
            // T-6919：长按武装——绑定长按动作后，按住超阈值且未拖动即触发；
            // 拖动/抬起/取消都会拆除定时器。
            if ((_b = (_a = this.options).isLongPressBound) === null || _b === void 0 ? void 0 : _b.call(_a)) {
                const view = this.doc.defaultView;
                this.pressTimer = view
                    ? view.setTimeout(() => this.fireLongPress(), floating_ball_model_js_1.FLOATING_BALL_LONG_PRESS_MS)
                    : setTimeout(() => this.fireLongPress(), floating_ball_model_js_1.FLOATING_BALL_LONG_PRESS_MS);
            }
            if (this.surface === "mobile")
                this.flingSamples = [{ x: event.clientX, y: event.clientY, t: Date.now() }];
            try {
                trigger.setPointerCapture(event.pointerId);
            }
            catch (_) { /* WebView may not support capture. */ }
        };
        const onPointerMove = (event) => {
            var _a, _b, _c;
            if (this.activePointerId !== event.pointerId || !this.pointerStart)
                return;
            if (this.isInteractionBlocked()) {
                this.cancelPointer(true);
                return;
            }
            // P6-B 上滑呼出：仅 docked（未进入拖动）时采样轨迹
            if (this.surface === "mobile" && this.state === "docked") {
                this.flingSamples.push({ x: event.clientX, y: event.clientY, t: Date.now() });
                if (this.flingSamples.length > 6)
                    this.flingSamples.shift();
            }
            const dx = event.clientX - this.pointerStart.x;
            const dy = event.clientY - this.pointerStart.y;
            if (this.state !== "dragging" && this.state !== "targeting" && Math.hypot(dx, dy) > this.touchSlop) {
                this.suppressClick = true;
                this.clearPressTimer();
                this.prepareDragTargets();
                this.setState("dragging");
            }
            if (this.state !== "dragging" && this.state !== "targeting")
                return;
            event.preventDefault();
            this.position = this.positionFromPointer(event.clientX, event.clientY);
            const bounds = this.dragBounds;
            const anchor = this.dragAnchor;
            if (bounds && anchor) {
                const radius = this.ballSize / 2;
                const x = clamp(event.clientX, bounds.left + this.effectiveMarginX + radius, Math.max(bounds.left + this.effectiveMarginX + radius, bounds.right - this.effectiveMarginX - radius));
                const y = clamp(event.clientY, bounds.top + this.margin + radius, Math.max(bounds.top + this.margin + radius, bounds.bottom - this.margin - radius));
                (_a = this.root) === null || _a === void 0 ? void 0 : _a.style.setProperty("--sw-fab-drag-x", `${x - anchor.x}px`);
                (_b = this.root) === null || _b === void 0 ? void 0 : _b.style.setProperty("--sw-fab-drag-y", `${y - anchor.y}px`);
            }
            this.targetedIndex = (0, floating_ball_layout_js_1.hitTestFloatingBallActions)(this.dragTargets, event.clientX, event.clientY, 8);
            this.dragButtons.forEach((button, index) => button.classList.toggle("is-targeted", index === this.targetedIndex));
            if (this.targetCaption && bounds && anchor) {
                const target = this.dragTargets.find((point) => point.index === this.targetedIndex);
                this.targetCaption.hidden = !target;
                if (target) {
                    const width = Math.min(144, bounds.right - bounds.left - 16);
                    const left = clamp(target.x - width / 2, bounds.left + 8, bounds.right - width - 8);
                    const above = target.y - target.size / 2 - 32;
                    const top = above >= bounds.top + 8 ? above : target.y + target.size / 2 + 4;
                    this.targetCaption.textContent = ((_c = this.dragButtons[this.targetedIndex]) === null || _c === void 0 ? void 0 : _c.getAttribute("aria-label")) || "";
                    this.targetCaption.style.width = `${width}px`;
                    this.targetCaption.style.left = `${left - anchor.x + this.ballSize / 2}px`;
                    this.targetCaption.style.top = `${top - anchor.y + (this.surface === "mobile" ? 0 : this.ballSize / 2)}px`;
                }
            }
            this.setState(this.targetedIndex >= 0 ? "targeting" : "dragging");
        };
        const onPointerUp = (event) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (this.activePointerId !== event.pointerId)
                return;
            const wasDragging = this.state === "dragging" || this.state === "targeting";
            // A mobile quick swipe crosses the drag slop on its first move, so
            // the state is already `dragging` by pointerup. Resolve the drop
            // target before classifying it: an intentional action target must
            // win over the directional shortcut, while a fast movement that
            // never targets an action can still be recognized as a flick.
            const dropTargetIndex = wasDragging
                ? (0, floating_ball_layout_js_1.hitTestFloatingBallActions)(this.dragTargets, event.clientX, event.clientY, 8)
                : -1;
            // P6-B/T-6886：docked 状态下快滑 = 四向动作分发（速度+方向双判定）。
            // 触发后抑制合成 click，避免再打开切换器。
            // The first move necessarily enters `dragging`; keep the original
            // docked-only meaning by excluding an actual action drop, not by
            // requiring the state to remain docked until pointerup.
            if (this.surface === "mobile"
                && this.flingSamples.length >= 2
                && (!wasDragging || dropTargetIndex < 0)) {
                const first = this.flingSamples[0];
                const last = this.flingSamples[this.flingSamples.length - 1];
                const dt = Math.max(1, last.t - first.t);
                const direction = (0, floating_ball_model_js_1.classifyFlickDirection)(last.x - first.x, last.y - first.y, dt);
                if (direction) {
                    this.flingSamples = [];
                    // The first move may already have updated the provisional
                    // drag position before the flick is classified. Restore
                    // the parked position so a shortcut never leaves a
                    // half-applied reposition behind.
                    this.cancelPointer(true);
                    this.suppressClick = true;
                    if (direction === "up" && !this.options.onFlickAction) {
                        this.setState("more");
                        (_b = (_a = this.options).onOpenMore) === null || _b === void 0 ? void 0 : _b.call(_a);
                    }
                    else {
                        (_d = (_c = this.options).onFlickAction) === null || _d === void 0 ? void 0 : _d.call(_c, direction);
                    }
                    return;
                }
            }
            this.flingSamples = [];
            if (this.isInteractionBlocked()) {
                this.cancelPointer(true);
                return;
            }
            let target;
            if (wasDragging) {
                target = this.dragButtons[dropTargetIndex];
                this.position = target ? Object.assign({}, this.positionAtPointerStart) : this.positionFromPointer(event.clientX, event.clientY);
                event.preventDefault();
            }
            this.cancelPointer(false);
            if (wasDragging) {
                this.applyPosition();
                if ((target === null || target === void 0 ? void 0 : target.isConnected) && !target.disabled)
                    (_f = (_e = this.options).onActionTarget) === null || _f === void 0 ? void 0 : _f.call(_e, target);
                else if (!target)
                    (_h = (_g = this.options).onPositionChange) === null || _h === void 0 ? void 0 : _h.call(_g, this.getPosition());
            }
            // A drag's pointerup can still be followed by the synthetic
            // button click.  Keep the guard alive until that click handler
            // consumes it; pointercancel/blur clear it immediately.
            // T-6919：长按已触发时同样抑制合成 click（长按动作已分发，单击不再重复）。
            this.suppressClick = wasDragging || this.longPressFired;
            this.longPressFired = false;
        };
        const onPointerCancel = (event) => {
            if (this.activePointerId !== event.pointerId)
                return;
            this.cancelPointer(true);
        };
        const onClick = (event) => {
            var _a, _b, _c, _d, _e, _f;
            this.markActive();
            if (this.suppressClick) {
                this.suppressClick = false;
                event.preventDefault();
                return;
            }
            if (this.isInteractionBlocked())
                return;
            // T-6919：双击绑定后单击进入 300ms 判别窗——窗口内第二击触发双击动作
            // 并撤销挂起的单击；未绑定时单击保持零延迟直发（老用户零回归）。
            if ((_b = (_a = this.options).isDoubleTapBound) === null || _b === void 0 ? void 0 : _b.call(_a)) {
                const now = Date.now();
                if (this.lastTapAt > 0 && (0, floating_ball_model_js_1.isDoubleTapGesture)(now - this.lastTapAt)) {
                    this.clearPendingTapTimer();
                    this.lastTapAt = 0;
                    (_d = (_c = this.options).onDoubleTap) === null || _d === void 0 ? void 0 : _d.call(_c);
                    return;
                }
                this.lastTapAt = now;
                if (this.pendingTapTimer === null) {
                    const view = this.doc.defaultView;
                    this.pendingTapTimer = view
                        ? view.setTimeout(() => this.firePendingTap(), floating_ball_model_js_1.FLOATING_BALL_DOUBLE_TAP_MS)
                        : setTimeout(() => this.firePendingTap(), floating_ball_model_js_1.FLOATING_BALL_DOUBLE_TAP_MS);
                }
                return;
            }
            (_f = (_e = this.options).onOpenSwitcher) === null || _f === void 0 ? void 0 : _f.call(_e);
        };
        const onContextMenu = (event) => {
            var _a, _b;
            this.markActive();
            event.preventDefault();
            if (this.isInteractionBlocked())
                return;
            if (!this.options.onOpenMore)
                return;
            this.setState("more");
            (_b = (_a = this.options).onOpenMore) === null || _b === void 0 ? void 0 : _b.call(_a);
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
    bindKeyboardLifecycle(trigger) {
        const onKeyDown = (event) => {
            var _a, _b;
            if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))
                return;
            event.preventDefault();
            this.markActive();
            if (this.isInteractionBlocked())
                return;
            if (!this.options.onOpenMore)
                return;
            this.setState("more");
            (_b = (_a = this.options).onOpenMore) === null || _b === void 0 ? void 0 : _b.call(_a);
        };
        trigger.addEventListener("keydown", onKeyDown);
        this.cleanups.push(() => trigger.removeEventListener("keydown", onKeyDown));
    }
    bindActivityLifecycle(trigger) {
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
        const onFocusOut = (event) => {
            var _a;
            const related = event.relatedTarget;
            if (related && ((_a = this.root) === null || _a === void 0 ? void 0 : _a.contains(related)))
                return;
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
    bindEnvironmentLifecycle() {
        const onVisibilityChange = () => this.syncDocumentVisibility();
        this.doc.addEventListener("fullscreenchange", onVisibilityChange);
        this.doc.addEventListener("visibilitychange", onVisibilityChange);
        this.cleanups.push(() => {
            var _a, _b;
            (_a = this.doc) === null || _a === void 0 ? void 0 : _a.removeEventListener("fullscreenchange", onVisibilityChange);
            (_b = this.doc) === null || _b === void 0 ? void 0 : _b.removeEventListener("visibilitychange", onVisibilityChange);
        });
        onVisibilityChange();
    }
    /**
     * Re-apply the fixed portal position after a resize, rotation, or mobile
     * keyboard viewport change. The listener is event-driven and does no
     * polling or layout work while the viewport is stable.
     */
    bindViewportLifecycle() {
        const view = this.doc.defaultView;
        if (!view)
            return;
        const onViewportChange = () => {
            if (this.disposed)
                return;
            this.cancelPointer(true);
            this.applyPosition();
            this.syncDocumentVisibility();
            if (this.state === "docked")
                this.scheduleIdle();
        };
        view.addEventListener("resize", onViewportChange, { passive: true });
        view.addEventListener("orientationchange", onViewportChange, { passive: true });
        const visualViewport = view.visualViewport;
        visualViewport === null || visualViewport === void 0 ? void 0 : visualViewport.addEventListener("resize", onViewportChange, { passive: true });
        visualViewport === null || visualViewport === void 0 ? void 0 : visualViewport.addEventListener("scroll", onViewportChange, { passive: true });
        this.cleanups.push(() => {
            view.removeEventListener("resize", onViewportChange);
            view.removeEventListener("orientationchange", onViewportChange);
            visualViewport === null || visualViewport === void 0 ? void 0 : visualViewport.removeEventListener("resize", onViewportChange);
            visualViewport === null || visualViewport === void 0 ? void 0 : visualViewport.removeEventListener("scroll", onViewportChange);
        });
    }
    syncDocumentVisibility() {
        var _a, _b;
        this.setEnvironmentHidden("fullscreen", this.hideOnFullscreen && Boolean((_a = this.doc) === null || _a === void 0 ? void 0 : _a.fullscreenElement));
        this.setEnvironmentHidden("visibility", ((_b = this.doc) === null || _b === void 0 ? void 0 : _b.visibilityState) === "hidden");
    }
    syncScrollLifecycle() {
        var _a;
        (_a = this.scrollCleanup) === null || _a === void 0 ? void 0 : _a.call(this);
        this.scrollCleanup = null;
        this.scrollOffsets = new WeakMap();
        if (!this.doc || this.disposed || !this.hideOnScroll)
            return;
        const onScroll = (event) => {
            var _a, _b, _c, _d;
            if (this.disposed || !this.hideOnScroll || ["executing", "dragging", "targeting", "more"].includes(this.state))
                return;
            const rawTarget = event.target;
            if (!rawTarget || (typeof rawTarget !== "object"))
                return;
            const target = rawTarget;
            if ((_b = (_a = this.options).excludeScrollTarget) === null || _b === void 0 ? void 0 : _b.call(_a, rawTarget))
                return;
            const scrollHost = ((_d = (_c = this.options).resolveScrollTarget) === null || _d === void 0 ? void 0 : _d.call(_c)) || null;
            if (scrollHost && scrollHost !== rawTarget) {
                const hostNode = scrollHost;
                if (!hostNode.nodeType || !rawTarget.nodeType || !hostNode.contains(rawTarget))
                    return;
            }
            const nodeType = Number(rawTarget.nodeType);
            if (this.root && nodeType > 0 && this.root.contains(rawTarget))
                return;
            const offset = this.readScrollOffset(target);
            if (offset === null)
                return;
            const previous = this.scrollOffsets.get(target);
            this.scrollOffsets.set(target, offset);
            // The first event establishes a baseline and does not hide the
            // ball. Subsequent direction changes are the only state writes.
            if (previous === undefined || Math.abs(offset - previous) < 1)
                return;
            this.setScrollHidden(offset > previous);
        };
        this.doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
        this.scrollCleanup = () => {
            var _a;
            (_a = this.doc) === null || _a === void 0 ? void 0 : _a.removeEventListener("scroll", onScroll, true);
            this.scrollCleanup = null;
        };
    }
    readScrollOffset(target) {
        var _a, _b;
        if (target === this.doc || target === this.doc.documentElement || target === this.doc.body) {
            const view = this.doc.defaultView;
            return Math.max(0, Number(view === null || view === void 0 ? void 0 : view.scrollY) || 0, Number((_a = this.doc.documentElement) === null || _a === void 0 ? void 0 : _a.scrollTop) || 0, Number((_b = this.doc.body) === null || _b === void 0 ? void 0 : _b.scrollTop) || 0);
        }
        const value = Number(target.scrollTop);
        return Number.isFinite(value) ? Math.max(0, value) : null;
    }
    setEnvironmentHidden(reason, hidden) {
        var _a, _b;
        if (this.disposed || this.hiddenReasons[reason] === hidden)
            return;
        this.hiddenReasons[reason] = hidden;
        if (hidden) {
            (_b = (_a = this.options).onDismissOverlays) === null || _b === void 0 ? void 0 : _b.call(_a);
            this.cancelPointer(true);
            this.clearIdleTimer();
            this.setIdle(false);
        }
        this.applyState(this.effectiveBlockedState() || "docked");
        if (!hidden)
            this.markActive();
    }
    effectiveBlockedState() {
        if (this.suspendedReason)
            return "suspended";
        if (this.hiddenReasons.manual || this.hiddenReasons.fullscreen || this.hiddenReasons.visibility || this.hiddenReasons.scroll)
            return "hidden";
        return null;
    }
    isInteractionBlocked() {
        return this.state === "suspended" || this.state === "hidden" || this.state === "executing"
            || !this.available;
    }
    applyAccessibilityState() {
        var _a, _b;
        if (!this.root || !this.trigger)
            return;
        const inert = this.state === "suspended" || this.state === "hidden";
        if (inert) {
            const active = (_a = this.doc) === null || _a === void 0 ? void 0 : _a.activeElement;
            if (active && this.root.contains(active))
                (_b = active.blur) === null || _b === void 0 ? void 0 : _b.call(active);
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
    markActive() {
        if (this.disposed || this.state === "suspended" || this.state === "hidden")
            return;
        this.setIdle(false);
        if (this.pointerInside || this.focused || this.activePointerId !== null)
            this.clearIdleTimer();
        else
            this.scheduleIdle();
    }
    setIdle(idle) {
        if (!this.root)
            return;
        this.root.dataset.idle = String(idle);
        this.root.dataset.halfHide = String(this.effectiveHalfHide && (this.snap || this.position.xRatio === undefined));
        this.root.style.setProperty("--sw-fab-idle-opacity", String(this.idleOpacity));
    }
    clearIdleTimer() {
        if (this.idleTimer === null || !this.doc)
            return;
        const view = this.doc.defaultView;
        if (view)
            view.clearTimeout(this.idleTimer);
        else
            clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }
    scheduleIdle() {
        if (!this.root || this.disposed || this.state !== "docked")
            return;
        this.clearIdleTimer();
        if (this.pointerInside || this.focused || this.activePointerId !== null)
            return;
        if (this.idleDelayMs <= 0) {
            this.setIdle(true);
            return;
        }
        const view = this.doc.defaultView;
        const timeout = () => {
            this.idleTimer = null;
            if (this.disposed || this.state !== "docked")
                return;
            this.setIdle(true);
        };
        this.idleTimer = view
            ? view.setTimeout(timeout, this.idleDelayMs)
            : setTimeout(timeout, this.idleDelayMs);
    }
    // T-6919：长按定时器到点——仅 docked 且指针仍在球上按住时成立；
    // 拖动/取消路径已提前拆除定时器。触发后抑制合成 click 防止单击重复。
    fireLongPress() {
        var _a, _b;
        this.pressTimer = null;
        if (this.state !== "docked" || this.activePointerId === null)
            return;
        this.longPressFired = true;
        this.suppressClick = true;
        this.markActive();
        (_b = (_a = this.options).onLongPress) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
    firePendingTap() {
        var _a, _b;
        this.pendingTapTimer = null;
        this.lastTapAt = 0;
        (_b = (_a = this.options).onOpenSwitcher) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
    clearPressTimer() {
        const view = this.doc.defaultView;
        if (this.pressTimer !== null) {
            if (view)
                view.clearTimeout(this.pressTimer);
            else
                clearTimeout(this.pressTimer);
            this.pressTimer = null;
        }
    }
    clearPendingTapTimer() {
        const view = this.doc.defaultView;
        if (this.pendingTapTimer !== null) {
            if (view)
                view.clearTimeout(this.pendingTapTimer);
            else
                clearTimeout(this.pendingTapTimer);
            this.pendingTapTimer = null;
        }
    }
    cancelPointer(restore) {
        var _a, _b;
        const preserveClickSuppression = !restore && this.suppressClick;
        this.clearPressTimer();
        if (restore && this.positionAtPointerStart) {
            this.position = this.positionAtPointerStart;
            this.applyPosition();
        }
        const pointerId = this.activePointerId;
        this.activePointerId = null;
        if (pointerId !== null && this.trigger) {
            try {
                this.trigger.releasePointerCapture(pointerId);
            }
            catch (_) { /* already released */ }
        }
        this.pointerStart = null;
        this.positionAtPointerStart = null;
        this.dragTargets = [];
        this.dragButtons.forEach((button) => { button.classList.remove("is-targeted"); button.hidden = false; });
        this.dragButtons = [];
        this.dragBounds = null;
        this.dragAnchor = null;
        this.targetedIndex = -1;
        if (this.targetCaption)
            this.targetCaption.hidden = true;
        (_a = this.root) === null || _a === void 0 ? void 0 : _a.style.removeProperty("--sw-fab-drag-x");
        (_b = this.root) === null || _b === void 0 ? void 0 : _b.style.removeProperty("--sw-fab-drag-y");
        this.suppressClick = preserveClickSuppression;
        if (this.state === "dragging" || this.state === "targeting")
            this.setState("docked");
        else
            this.scheduleIdle();
    }
    positionFromPointer(clientX, clientY) {
        const view = this.doc.defaultView;
        const viewportWidth = Math.max(1, (view === null || view === void 0 ? void 0 : view.innerWidth) || this.doc.documentElement.clientWidth || 1);
        const viewportHeight = Math.max(1, (view === null || view === void 0 ? void 0 : view.innerHeight) || this.doc.documentElement.clientHeight || 1);
        const bounds = this.dragBounds || this.getBounds(viewportWidth, viewportHeight);
        const ballHeight = this.ballSize;
        const minCenter = bounds.top + this.margin + ballHeight / 2;
        const maxCenter = Math.max(minCenter, bounds.bottom - this.margin - ballHeight / 2);
        const availableHeight = Math.max(1, maxCenter - minCenter);
        return Object.assign({ edge: clientX <= bounds.left + (bounds.right - bounds.left) / 2 ? "left" : "right", yRatio: clamp((clientY - minCenter) / availableHeight, 0, 1) }, (!this.snap ? { xRatio: clamp((clientX - bounds.left - this.margin - ballHeight / 2)
                / Math.max(1, bounds.right - bounds.left - 2 * this.margin - ballHeight), 0, 1) } : {}));
    }
    getBounds(viewportWidth, viewportHeight) {
        var _a, _b, _c, _d;
        const visual = (_a = this.doc.defaultView) === null || _a === void 0 ? void 0 : _a.visualViewport;
        const visible = {
            left: Math.max(0, (visual === null || visual === void 0 ? void 0 : visual.offsetLeft) || 0),
            top: Math.max(0, (visual === null || visual === void 0 ? void 0 : visual.offsetTop) || 0),
            right: Math.min(viewportWidth, ((visual === null || visual === void 0 ? void 0 : visual.offsetLeft) || 0) + ((visual === null || visual === void 0 ? void 0 : visual.width) || viewportWidth)),
            bottom: Math.min(viewportHeight, ((visual === null || visual === void 0 ? void 0 : visual.offsetTop) || 0) + ((visual === null || visual === void 0 ? void 0 : visual.height) || viewportHeight)),
        };
        if (this.surface === "mobile" && this.root) {
            const style = (_b = this.doc.defaultView) === null || _b === void 0 ? void 0 : _b.getComputedStyle(this.root);
            const inset = (key) => Math.max(0, parseFloat((style === null || style === void 0 ? void 0 : style.getPropertyValue(key)) || "0") || 0);
            visible.top += inset("--sw-fab-safe-top");
            visible.bottom = Math.max(visible.top + this.ballSize, visible.bottom - inset("--sw-fab-safe-bottom") - 48);
            visible.left += inset("--sw-fab-safe-left");
            visible.right = Math.max(visible.left + this.ballSize, visible.right - inset("--sw-fab-safe-right"));
        }
        const raw = (_d = (_c = this.options).resolveBounds) === null || _d === void 0 ? void 0 : _d.call(_c);
        if (!raw)
            return visible;
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
    applyPosition() {
        var _a, _b;
        if (!this.root)
            return;
        const { edge, yRatio } = this.position;
        const view = this.doc.defaultView;
        const viewportWidth = Math.max(1, (view === null || view === void 0 ? void 0 : view.innerWidth) || this.doc.documentElement.clientWidth || 1);
        const viewportHeight = Math.max(1, (view === null || view === void 0 ? void 0 : view.innerHeight) || this.doc.documentElement.clientHeight || 1);
        const bounds = this.getBounds(viewportWidth, viewportHeight);
        this.layoutBounds = bounds;
        this.root.dataset.edge = edge;
        this.root.dataset.yRatio = String(yRatio);
        this.root.style.setProperty("--sw-fab-size", `${this.ballSize}px`);
        const hostLayer = (_b = (_a = this.options).resolveLayer) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.root.style.zIndex = String(Number.isFinite(hostLayer) ? Math.max(0, Math.min(999, hostLayer - 1)) : 999);
        if (this.recovery)
            this.recovery.style.zIndex = this.root.style.zIndex;
        if (this.options.resolveBounds) {
            this.root.style.setProperty("--sw-fab-host-width", `${Math.max(0, bounds.right - bounds.left)}px`);
        }
        else {
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
        this.renderedAnchor = { x, y: center };
        this.root.style.top = `${center.toFixed(3)}px`;
        this.root.style.left = xRatio === 1 ? "auto" : `${(x - radius).toFixed(3)}px`;
        this.root.style.right = xRatio === 1 ? `${(viewportWidth - bounds.right + this.effectiveMarginX).toFixed(3)}px` : "auto";
        this.syncRecovery();
    }
    prepareDragTargets() {
        var _a, _b;
        (_b = (_a = this.options).onBeforeTargeting) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.applyPosition();
        this.dragBounds = this.layoutBounds;
        this.dragAnchor = this.renderedAnchor;
        if (!this.root || !this.dragBounds || !this.dragAnchor)
            return;
        const host = this.root.querySelector(".sw__floating-ball-first-layer");
        if (!host)
            return;
        this.dragButtons = Array.from(host.querySelectorAll("[data-action-id]"));
        const layout = (0, floating_ball_layout_js_1.layoutFloatingBallActions)({ bounds: this.dragBounds, anchor: this.dragAnchor,
            edge: this.position.edge, surface: this.surface, count: this.dragButtons.length,
            size: this.surface === "mobile" ? 48 : 44, margin: Math.max(8, this.margin) });
        this.dragTargets = layout.targets;
        host.classList.add("is-positioned");
        host.dataset.layout = layout.mode;
        this.dragButtons.forEach((button, index) => {
            const point = this.dragTargets.find((item) => item.index === index);
            button.hidden = !point;
            if (!point)
                return;
            button.style.left = `${point.x - this.dragAnchor.x + this.ballSize / 2}px`;
            button.style.top = `${point.y - this.dragAnchor.y + (this.surface === "mobile" ? 0 : this.ballSize / 2)}px`;
            button.style.width = `${point.size}px`;
            button.style.height = `${point.size}px`;
        });
    }
    syncRecovery() {
        var _a;
        if (!this.recovery)
            return;
        this.recovery.hidden = !this.hiddenReasons.scroll || this.suspendedReason || this.hiddenReasons.manual
            || this.hiddenReasons.fullscreen || this.hiddenReasons.visibility || this.disposed;
        if (!this.root || !this.layoutBounds || !this.renderedAnchor)
            return;
        this.recovery.style.top = `${this.renderedAnchor.y - 22}px`;
        this.recovery.style.left = this.position.edge === "left" ? `${this.layoutBounds.left}px` : "auto";
        const width = ((_a = this.doc.defaultView) === null || _a === void 0 ? void 0 : _a.innerWidth) || this.doc.documentElement.clientWidth;
        this.recovery.style.right = this.position.edge === "right" ? `${width - this.layoutBounds.right}px` : "auto";
    }
}
exports.FloatingBallUi = FloatingBallUi;
exports.FloatingBallController = FloatingBallUi;
function createFloatingBallUi(options) {
    return new FloatingBallUi(options);
}
