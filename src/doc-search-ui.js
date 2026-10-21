"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDocSearchPathChildren = loadDocSearchPathChildren;
exports.bindDocSearchFilter = bindDocSearchFilter;
exports.applySavedSearchFilters = applySavedSearchFilters;
exports.openSavedSearchEditor = openSavedSearchEditor;
exports.getDocSearchFilterCount = getDocSearchFilterCount;
exports.getDocSearchFilterSummary = getDocSearchFilterSummary;
exports.hasDocSearchFilter = hasDocSearchFilter;
exports.getDocSearchSession = getDocSearchSession;
exports.updateDocSearchHealth = updateDocSearchHealth;
exports.disposeDocSearchSession = disposeDocSearchSession;
exports.runDocSearchFetch = runDocSearchFetch;
exports.runOpenedDocumentContentSearch = runOpenedDocumentContentSearch;
exports.filterDocSearchResults = filterDocSearchResults;
exports.runFullTextSearchFallback = runFullTextSearchFallback;
exports.renderDocResults = renderDocResults;
exports.appendDocResultsLoadMore = appendDocResultsLoadMore;
exports.ensureDocResultsBox = ensureDocResultsBox;
exports.collectOpenRootIds = collectOpenRootIds;
exports.mountDocPreviewPane = mountDocPreviewPane;
exports.previewTabOrDoc = previewTabOrDoc;
exports.cancelDocPreview = cancelDocPreview;
exports.appendDocResultsEmpty = appendDocResultsEmpty;
exports.appendDocResultsViewAll = appendDocResultsViewAll;
exports.appendDocSearchStatus = appendDocSearchStatus;
exports.docSearchResultId = docSearchResultId;
exports.docSearchHitId = docSearchHitId;
exports.openDocSearchResult = openDocSearchResult;
exports.buildDocResultItem = buildDocResultItem;
exports.activateDocResultItem = activateDocResultItem;
// 小驴雷切 —— 文档搜索 UI 链路（R5b 自 index.ts 原样搬移，D-383）
// 搜索方法群以 this 参数模式运行：调用方式 renderDocResults.call(host, ...)。
// host 契约见 DocSearchUiHost；群内互调在本模块内直接 .call(this)，
// 状态对象（sessions/filters/...）由 host.docSearchState 持有（R5a，D-381）。
const siyuan_1 = require("siyuan");
const constants_1 = require("./constants");
const search_session_1 = require("./search-session");
const search_model_1 = require("./search-model");
const path_filter_model_1 = require("./path-filter-model");
const document_actions_1 = require("./document-actions");
const doc_preview_find_1 = require("./doc-preview-find");
const logger_1 = require("./logger");
const platform_dom_1 = require("./platform-dom");
const platform_dom_2 = require("./platform-dom");
const docSearchSurfaceRequestIds = new WeakMap();
let nextDocSearchSurfaceRequestId = 0;
function docSearchRequestScope(scrollElement) {
    let id = docSearchSurfaceRequestIds.get(scrollElement);
    if (!id) {
        id = ++nextDocSearchSurfaceRequestId;
        docSearchSurfaceRequestIds.set(scrollElement, id);
    }
    return `doc-search:${id}`;
}
async function boundedSearchRequest(endpoint, body, signal, latestKey) {
    var _a, _b;
    const result = await this.requestKernelJsonOutcome(endpoint, body, { signal, latestKey: latestKey || undefined });
    if (!result.ok) {
        const error = new Error(((_a = result.error) === null || _a === void 0 ? void 0 : _a.kind) || "search unavailable");
        if (((_b = result.error) === null || _b === void 0 ? void 0 : _b.kind) === "aborted")
            error.name = "AbortError";
        throw error;
    }
    return { ok: true, json: async () => result.value };
}
async function loadDocSearchPathChildren(notebook, path, generation, scrollElement) {
    const input = { notebook, path, limit: path_filter_model_1.MAX_PATH_ITEMS };
    const request = (0, path_filter_model_1.buildPathFilterListRequest)(input);
    const cancelled = () => (0, path_filter_model_1.normalizePathFilterProbeOutcome)({ kind: "cancelled" }, input);
    if (!request)
        return (0, path_filter_model_1.normalizePathFilterProbeOutcome)({ kind: "response", payload: null }, input);
    // T-7043：代际按 scrollElement（surface/session）比对——全局单值会让桌面/
    // 侧栏/移动互相对方的在途路径请求作废
    if (generation !== this.docSearchState.pathGenerations.get(scrollElement))
        return cancelled();
    let payload = null;
    // T-7191：路径筛选请求可被底层取消（换路径/关面板时 abort 旧请求）。
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    if (controller)
        pathFilterControllers.set(scrollElement, controller);
    try {
        payload = await this.fetchKernelJson("/api/filetree/listDocsByPath", request.body, { signal: controller === null || controller === void 0 ? void 0 : controller.signal });
    }
    catch (_) {
        payload = null;
    }
    finally {
        if (pathFilterControllers.get(scrollElement) === controller)
            pathFilterControllers.delete(scrollElement);
    }
    if (generation !== this.docSearchState.pathGenerations.get(scrollElement))
        return cancelled();
    if (payload === null || payload === undefined) {
        return (0, path_filter_model_1.normalizePathFilterProbeOutcome)({ kind: "unavailable" }, input);
    }
    return (0, path_filter_model_1.normalizePathFilterProbeOutcome)({ kind: "response", payload }, input);
}
function bindDocSearchFilter(container, scrollElement, searchInput, onClose) {
    const button = container.querySelector(".sw__search-filter-btn");
    if (!button)
        return () => undefined;
    let activeMenu = null;
    const onMenuKeyDown = (event) => {
        if (event.key !== "Escape" || !activeMenu)
            return;
        window.setTimeout(() => {
            if (button.isConnected && !button.disabled) {
                try {
                    button.focus({ preventScroll: true });
                }
                catch (_) {
                    button.focus();
                }
            }
        }, 0);
    };
    document.addEventListener("keydown", onMenuKeyDown, true);
    const updateButton = () => {
        const filters = this.docSearchState.filters.get(scrollElement) || {};
        const count = getDocSearchFilterCount.call(this, filters);
        const label = count > 0
            ? this.i18n.searchFiltersActive.replace("{x}", String(count))
            : this.i18n.searchFilters;
        const summary = getDocSearchFilterSummary.call(this, filters, scrollElement);
        const accessibleLabel = summary ? `${label}: ${summary}` : label;
        button.classList.toggle("sw__active", count > 0);
        button.dataset.filterCount = count > 0 ? String(Math.min(9, count)) : "";
        button.setAttribute("aria-pressed", String(count > 0));
        button.setAttribute("aria-label", accessibleLabel);
        button.title = accessibleLabel;
    };
    // T-6827：外部路径（保存的搜索应用）改筛选后同步按钮徽标
    this.docSearchState.filterButtonSync.set(scrollElement, updateButton);
    const commitFilters = (change) => {
        const next = Object.assign({}, (this.docSearchState.filters.get(scrollElement) || {}));
        change(next);
        if (next.types && Object.keys(next.types).length === 0)
            delete next.types;
        if (next.subTypes && Object.keys(next.subTypes).length === 0)
            delete next.subTypes;
        this.docSearchState.filters.set(scrollElement, Object.freeze(next));
        updateButton();
        this.applySearch(scrollElement, searchInput, onClose);
        searchInput.focus({ preventScroll: true });
    };
    // v0.18 路径筛选（T-103）：逐级浏览目录并选择路径前缀。
    // 每次打开自增代际标记，使在途请求作废（内核辅助函数不接受外部 signal）。
    const openPathMenu = (notebook, path) => {
        // T-7043：代际按 scrollElement（surface/session）自增——只作废本表面的在途请求
        const previousGeneration = this.docSearchState.pathGenerations.get(scrollElement) || 0;
        const generation = previousGeneration + 1;
        this.docSearchState.pathGenerations.set(scrollElement, generation);
        // T-7191：换路径/换查询时中止旧 listDocsByPath（代际校验仍是最后防线）。
        const stalePathController = pathFilterControllers.get(scrollElement);
        if (stalePathController) {
            pathFilterControllers.delete(scrollElement);
            try {
                stalePathController.abort();
            }
            catch ( /* 无 AbortController 环境忽略 */_a) { /* 无 AbortController 环境忽略 */ }
        }
        const rect = button.getBoundingClientRect();
        const position = { x: rect.left, y: rect.bottom };
        const openAsMenu = (items) => {
            const menu = new siyuan_1.Menu("swSearchPath");
            items.forEach((item) => menu.addItem(item));
            activeMenu === null || activeMenu === void 0 ? void 0 : activeMenu.close();
            activeMenu = menu;
            menu.open(position);
        };
        openAsMenu([{ label: this.i18n.searchPathLoading, disabled: true }]);
        void loadDocSearchPathChildren.call(this, notebook, path, generation, scrollElement).then((result) => {
            if (!button.isConnected || generation !== this.docSearchState.pathGenerations.get(scrollElement))
                return;
            const items = [];
            if (!result.ok) {
                items.push({
                    label: result.reason === "unavailable"
                        ? this.i18n.searchPathUnavailable
                        : this.i18n.searchPathFailed,
                    disabled: true,
                });
                items.push({
                    label: this.i18n.homeRetry,
                    icon: "iconRefresh",
                    click: () => openPathMenu(notebook, path),
                });
                openAsMenu(items);
                return;
            }
            const titles = this.docSearchState.pathTitles.get(scrollElement) || new Map();
            result.items.forEach((item) => titles.set(item.path, item.title));
            this.docSearchState.pathTitles.set(scrollElement, titles);
            if (path !== "/") {
                const parent = path.slice(0, path.lastIndexOf("/")) || "/";
                items.push({
                    label: this.i18n.searchPathUp,
                    icon: "iconUp",
                    click: () => openPathMenu(notebook, parent),
                });
            }
            items.push({
                label: this.i18n.searchPathHere,
                icon: "iconFilter",
                click: () => commitFilters((next) => {
                    const list = next.paths || [];
                    if (!list.includes(path))
                        next.paths = [...list, path];
                }),
            });
            items.push({ type: "separator" });
            if (result.items.length === 0) {
                items.push({ label: this.i18n.searchNoPaths, disabled: true });
            }
            result.items.forEach((item) => {
                const pick = () => commitFilters((next) => {
                    const list = next.paths || [];
                    if (!list.includes(item.path))
                        next.paths = [...list, item.path];
                });
                if (item.hasChildren) {
                    items.push({
                        label: item.title,
                        icon: "iconFolder",
                        submenu: [
                            { label: this.i18n.searchPathHere, icon: "iconFilter", click: pick },
                            { type: "separator" },
                            { label: this.i18n.searchPathBrowse, icon: "iconFolder", click: () => openPathMenu(notebook, item.path) },
                        ],
                    });
                }
                else {
                    items.push({ label: item.title, icon: "iconFiles", click: pick });
                }
            });
            if (result.truncated)
                items.push({ label: this.i18n.searchPathTruncated, disabled: true });
            openAsMenu(items);
        });
    };
    const onClick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled)
            return;
        activeMenu === null || activeMenu === void 0 ? void 0 : activeMenu.close();
        activeMenu = null;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        let notebooks = [];
        let notebooksFailed = false;
        try {
            if (this.loadNotebooksDetailed) {
                const detailed = await this.loadNotebooksDetailed();
                notebooks = detailed.notebooks;
                notebooksFailed = detailed.failed;
            }
            else {
                notebooks = await this.loadNotebooks();
            }
        }
        catch (error) {
            // Keep the filter menu usable even if a host adapter throws
            // outside loadNotebooks' own guarded fetch path.
            logger_1.logger.warn("load search filter notebooks fail", error);
            notebooksFailed = true;
        }
        finally {
            if (button.isConnected) {
                button.disabled = false;
                button.removeAttribute("aria-busy");
            }
        }
        if (!button.isConnected)
            return;
        this.docSearchState.notebookNames.set(scrollElement, new Map(notebooks
            .filter((notebook) => typeof (notebook === null || notebook === void 0 ? void 0 : notebook.id) === "string" && typeof (notebook === null || notebook === void 0 ? void 0 : notebook.name) === "string")
            .map((notebook) => [notebook.id, notebook.name.slice(0, 64)])));
        updateButton();
        const current = this.docSearchState.filters.get(scrollElement) || {};
        const notebookSub = [{
                label: this.i18n.searchAllNotebooks,
                icon: "iconGlobalGraph",
                checked: !current.notebook,
                click: () => commitFilters((next) => delete next.notebook),
            }];
        if (notebooks.length > 0) {
            notebookSub.push({ type: "separator" });
            notebooks.forEach((notebook) => notebookSub.push({
                label: this.escapeAttr(notebook.name),
                icon: "iconFiles",
                checked: current.notebook === notebook.id,
                click: () => commitFilters((next) => { next.notebook = notebook.id; delete next.paths; }),
            }));
        }
        else if (notebooksFailed) {
            notebookSub.push({ label: this.i18n.notebookLoadFailed, disabled: true });
            notebookSub.push({ label: this.i18n.homeRetry, icon: "iconRefresh", click: () => button.click() });
        }
        else {
            notebookSub.push({ label: this.i18n.searchNoNotebooks, disabled: true });
        }
        const selectedType = Object.keys(current.types || {}).find((key) => { var _a; return (_a = current.types) === null || _a === void 0 ? void 0 : _a[key]; }) || "";
        const selectedSubType = Object.keys(current.subTypes || {}).find((key) => { var _a; return (_a = current.subTypes) === null || _a === void 0 ? void 0 : _a[key]; }) || "";
        const typeOptions = [
            { value: "", label: this.i18n.searchTypeAll },
            { value: "document", label: this.i18n.searchTypeDocument },
            { value: "heading", label: this.i18n.searchTypeHeading },
            { value: "paragraph", label: this.i18n.searchTypeParagraph },
            { value: "codeBlock", label: this.i18n.searchTypeCodeBlock },
        ];
        const subTypeOptions = [
            { value: "", label: this.i18n.searchSubTypeAll },
            { value: "h1", label: this.i18n.searchSubTypeH1 },
            { value: "h2", label: this.i18n.searchSubTypeH2 },
            { value: "h3", label: this.i18n.searchSubTypeH3 },
            { value: "h4", label: this.i18n.searchSubTypeH4 },
            { value: "h5", label: this.i18n.searchSubTypeH5 },
            { value: "h6", label: this.i18n.searchSubTypeH6 },
            { value: "o", label: this.i18n.searchSubTypeOrdered },
            { value: "u", label: this.i18n.searchSubTypeUnordered },
            { value: "t", label: this.i18n.searchSubTypeTask },
        ];
        const methodOptions = [
            { value: "keyword", label: this.i18n.searchMethodKeyword },
            { value: "query", label: this.i18n.searchMethodQuery },
            { value: "regexp", label: this.i18n.searchMethodRegexp },
        ];
        // 语义搜索（P3-3）：仅当宿主能力明确支持（AI embedding 已配置）时提供；
        // 未配置时内核静默返回空，宁缺毋滥不展示。已选中的残留 method 由
        // buildFullTextSearchRequest 静默降级为 keyword。
        if (this.isSemanticSearchAvailable()) {
            methodOptions.push({ value: "semantic", label: this.i18n.searchMethodSemantic });
        }
        const orderOptions = [
            { value: "relevanceDesc", label: this.i18n.searchOrderRelevance },
            { value: "updatedDesc", label: this.i18n.searchOrderUpdated },
            { value: "createdDesc", label: this.i18n.searchOrderCreated },
            { value: "content", label: this.i18n.searchOrderContent },
        ];
        const menu = new siyuan_1.Menu("swSearchFilter");
        activeMenu = menu;
        menu.addItem({ type: "submenu", label: this.i18n.searchFilterNotebook, icon: "iconFiles", submenu: notebookSub });
        // v0.18 路径筛选（T-103）：路径前缀依赖笔记本，故紧随其后；
        // 未选笔记本时给明确前置提示，而非隐藏入口。
        const currentNotebook = typeof current.notebook === "string" ? current.notebook : "";
        const currentPaths = current.paths || [];
        const pathSub = [];
        if (!currentNotebook) {
            pathSub.push({ label: this.i18n.searchPathPickNotebook, disabled: true });
        }
        else {
            pathSub.push({
                label: this.i18n.searchAllPaths,
                icon: "iconGlobalGraph",
                checked: currentPaths.length === 0,
                click: () => commitFilters((next) => delete next.paths),
            });
            const pathTitles = this.docSearchState.pathTitles.get(scrollElement);
            currentPaths.forEach((value) => {
                var _a;
                const fallback = ((_a = value.split("/").pop()) === null || _a === void 0 ? void 0 : _a.replace(/\.sy$/, "")) || value;
                pathSub.push({
                    label: ((pathTitles === null || pathTitles === void 0 ? void 0 : pathTitles.get(value)) || fallback).slice(0, 40),
                    icon: "iconTrashcan",
                    click: () => commitFilters((next) => {
                        const rest = (next.paths || []).filter((entry) => entry !== value);
                        if (rest.length > 0)
                            next.paths = rest;
                        else
                            delete next.paths;
                    }),
                });
            });
            pathSub.push({ type: "separator" });
            pathSub.push({
                label: this.i18n.searchPathBrowse,
                icon: "iconFolder",
                click: () => openPathMenu(currentNotebook, "/"),
            });
        }
        menu.addItem({ type: "submenu", label: this.i18n.searchFilterPath, icon: "iconFolder", submenu: pathSub });
        menu.addItem({
            type: "submenu",
            label: this.i18n.searchContentType,
            icon: "iconFilter",
            submenu: typeOptions.map(({ value, label }) => ({
                label,
                checked: selectedType === value,
                click: () => commitFilters((next) => {
                    if (value) {
                        next.types = Object.freeze({ [value]: true });
                        delete next.subTypes;
                    }
                    else
                        delete next.types;
                }),
            })),
        });
        menu.addItem({
            type: "submenu",
            label: this.i18n.searchSubType,
            icon: "iconHeading",
            submenu: subTypeOptions.map(({ value, label }) => ({
                label,
                checked: selectedSubType === value,
                click: () => commitFilters((next) => {
                    if (value) {
                        next.subTypes = Object.freeze({ [value]: true });
                        delete next.types;
                    }
                    else
                        delete next.subTypes;
                }),
            })),
        });
        menu.addItem({
            type: "submenu",
            label: this.i18n.searchMethod,
            icon: "iconSearch",
            submenu: methodOptions.map(({ value, label }) => ({
                label,
                checked: (current.method || "keyword") === value,
                click: () => commitFilters((next) => {
                    if (value && value !== "keyword")
                        next.method = value;
                    else
                        delete next.method;
                }),
            })),
        });
        menu.addItem({
            type: "submenu",
            label: this.i18n.searchResultOrder,
            icon: "iconSort",
            submenu: orderOptions.map(({ value, label }) => ({
                label,
                checked: (current.orderBy || "relevanceDesc") === value,
                click: () => commitFilters((next) => {
                    if (value && value !== "relevanceDesc")
                        next.orderBy = value;
                    else
                        delete next.orderBy;
                }),
            })),
        });
        // T-6827 保存的搜索：已有保存项时提供快速应用子菜单
        // T-6952：每条展开为 应用 / 编辑 / 删除——编辑保持原 ID，悬浮球固定槽照常回读
        const savedList = this.getSavedSearches();
        if (savedList.length > 0) {
            menu.addItem({
                type: "submenu",
                label: this.i18n.workbenchSaved,
                icon: "iconBookmark",
                submenu: savedList.map((saved) => ({
                    label: saved.name,
                    icon: "iconSearch",
                    submenu: [
                        {
                            label: this.i18n.searchSavedApply,
                            icon: "iconPlay",
                            click: () => this.applySavedSearch(scrollElement, saved, onClose),
                        },
                        {
                            label: this.i18n.searchSavedEdit,
                            icon: "iconEdit",
                            click: () => openSavedSearchEditor.call(this, saved.id),
                        },
                        {
                            label: this.i18n.searchSavedDelete,
                            icon: "iconTrash",
                            click: () => {
                                if (!window.confirm(String(this.i18n.searchSavedDeleteConfirm).replace("{x}", String(saved.name || ""))))
                                    return;
                                this.updateSettings({
                                    savedSearches: this.getSavedSearches().filter((item) => (item === null || item === void 0 ? void 0 : item.id) !== saved.id),
                                });
                            },
                        },
                    ],
                })),
            });
        }
        menu.addSeparator();
        // 有查询时才可保存（空查询没有可固化的语义）
        if (searchInput.value.trim()) {
            menu.addItem({
                label: this.i18n.searchSaveCurrent,
                icon: "iconAdd",
                click: () => this.saveCurrentSearch(searchInput.value, this.docSearchState.filters.get(scrollElement) || {}),
            });
        }
        menu.addItem({
            label: this.i18n.searchResetFilters,
            icon: "iconRefresh",
            disabled: getDocSearchFilterCount.call(this, current) === 0,
            click: () => commitFilters((next) => {
                Object.keys(next).forEach((key) => delete next[key]);
            }),
        });
        const rect = button.getBoundingClientRect();
        menu.open({ x: rect.left, y: rect.bottom });
    };
    updateButton();
    button.addEventListener("click", onClick);
    return () => {
        button.removeEventListener("click", onClick);
        document.removeEventListener("keydown", onMenuKeyDown, true);
        activeMenu === null || activeMenu === void 0 ? void 0 : activeMenu.close();
        activeMenu = null;
        this.docSearchState.filterButtonSync.delete(scrollElement);
    };
}
/**
 * T-6827：应用一条保存的搜索——查询写回输入框、笔记本筛选覆盖、
 * 筛选按钮徽标同步并立即执行一次搜索。工作台 chips 与菜单共用。
 */
function applySavedSearchFilters(scrollElement, searchInput, saved, onClose) {
    var _a;
    const query = typeof (saved === null || saved === void 0 ? void 0 : saved.query) === "string" ? saved.query : "";
    if (!query)
        return;
    // T-7162：保存项只承诺查询词与笔记本——回放即完整回放，未保存字段（路径/类型/
    // 子类型/方法/排序）不继承当前现场，同一保存项任何现场回放得到同一条件。
    const filters = (0, search_model_1.buildSavedSearchReplayFilters)(saved);
    this.docSearchState.filters.set(scrollElement, Object.freeze(filters));
    (_a = this.docSearchState.filterButtonSync.get(scrollElement)) === null || _a === void 0 ? void 0 : _a();
    searchInput.value = query;
    this.applySearch(scrollElement, searchInput, onClose);
    searchInput.focus({ preventScroll: true });
}
/**
 * T-6952：编辑保存的搜索——名称/查询/笔记本约束三字段；保存走宿主
 * updateSavedSearch（纯模型归一，原 ID 恒不变），取消/Esc 零写入。
 * 空查询禁用保存并提示；名称/查询超长显示截断提示（模型层仍按上限裁剪）。
 */
function openSavedSearchEditor(id) {
    const saved = this.getSavedSearches().find((item) => (item === null || item === void 0 ? void 0 : item.id) === id);
    if (!saved)
        return;
    const dialog = new siyuan_1.Dialog({
        title: this.i18n.searchSavedEditTitle,
        content: '<div class="sw-saved-search-editor"></div>',
        width: this.isMobile ? "min(480px, 92vw)" : "420px",
    });
    (0, platform_dom_2.mountPlatformDialogCloseHint)(dialog.element, this.i18n.platformCloseHint || "to close");
    const root = dialog.element.querySelector(".sw-saved-search-editor");
    if (!root) {
        dialog.destroy();
        return;
    }
    const buildField = (label, value) => {
        const wrap = document.createElement("div");
        wrap.className = "sw-saved-search-editor__field";
        const labelEl = document.createElement("span");
        labelEl.className = "sw-saved-search-editor__label";
        labelEl.textContent = label;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "b3-text-field";
        input.value = value;
        input.setAttribute("aria-label", label);
        wrap.append(labelEl, input);
        return { wrap, input };
    };
    const nameField = buildField(this.i18n.searchSavedEditName, saved.name || "");
    const queryField = buildField(this.i18n.searchSavedEditQuery, saved.query || "");
    const notebookRow = document.createElement("div");
    notebookRow.className = "sw-saved-search-editor__field";
    const notebookLabel = document.createElement("span");
    notebookLabel.className = "sw-saved-search-editor__label";
    notebookLabel.textContent = this.i18n.searchSavedEditNotebook;
    const notebookSelect = document.createElement("select");
    notebookSelect.className = "b3-select";
    notebookSelect.setAttribute("aria-label", this.i18n.searchSavedEditNotebook);
    const anyOption = document.createElement("option");
    anyOption.value = "";
    anyOption.textContent = this.i18n.searchSavedEditNotebookAny;
    notebookSelect.appendChild(anyOption);
    // 先保留已保存的 notebook ID。宿主清单可能暂时加载失败，或该
    // 笔记本已被删除；若 select 没有对应 option，编辑名称/查询后
    // 保存会把原有范围静默改成“不限”，造成不可见的数据丢失。
    const savedNotebook = typeof saved.notebook === "string" ? saved.notebook.trim() : "";
    if (savedNotebook) {
        const fallbackOption = document.createElement("option");
        fallbackOption.value = savedNotebook;
        fallbackOption.textContent = savedNotebook;
        fallbackOption.dataset.swSavedNotebookFallback = "true";
        notebookSelect.appendChild(fallbackOption);
        notebookSelect.value = savedNotebook;
    }
    notebookRow.append(notebookLabel, notebookSelect);
    // 笔记本选项异步填充；加载失败保留「不限」+ 现值，编辑不因枚举失败而不可用
    void this.loadNotebooks().then((notebooks) => {
        if (!notebookSelect.isConnected)
            return;
        notebooks.forEach((notebook) => {
            const existing = Array.from(notebookSelect.options).find((option) => option.value === notebook.id);
            if (existing) {
                existing.textContent = notebook.name;
                delete existing.dataset.swSavedNotebookFallback;
                return;
            }
            const option = document.createElement("option");
            option.value = notebook.id;
            option.textContent = notebook.name;
            notebookSelect.appendChild(option);
        });
        notebookSelect.value = savedNotebook;
    }).catch(() => undefined);
    const hint = document.createElement("div");
    hint.className = "sw-saved-search-editor__hint";
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "sw-saved-search-editor__actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "b3-button b3-button--cancel";
    cancelBtn.textContent = this.i18n.cancel;
    cancelBtn.addEventListener("click", () => dialog.destroy());
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "b3-button b3-button--text";
    saveBtn.textContent = this.i18n.searchSavedSave;
    const validate = () => {
        const query = queryField.input.value.trim();
        saveBtn.disabled = !query;
        const notes = [];
        if (!query)
            notes.push(this.i18n.searchSavedEditEmptyQuery);
        if (query.length > search_model_1.SAVED_SEARCH_QUERY_MAX) {
            notes.push(this.i18n.searchSavedEditTruncated.replace("{x}", String(search_model_1.SAVED_SEARCH_QUERY_MAX)));
        }
        if (nameField.input.value.trim().length > search_model_1.SAVED_SEARCH_NAME_MAX) {
            notes.push(this.i18n.searchSavedEditTruncated.replace("{x}", String(search_model_1.SAVED_SEARCH_NAME_MAX)));
        }
        hint.textContent = notes.join(" ");
    };
    saveBtn.addEventListener("click", () => {
        const ok = this.updateSavedSearch(id, {
            name: nameField.input.value,
            query: queryField.input.value,
            notebook: notebookSelect.value,
        });
        if (ok) {
            (0, siyuan_1.showMessage)(this.i18n.searchSavedUpdated);
            dialog.destroy();
        }
    });
    queryField.input.addEventListener("input", validate);
    nameField.input.addEventListener("input", validate);
    actions.append(cancelBtn, saveBtn);
    root.append(nameField.wrap, queryField.wrap, notebookRow, hint, actions);
    validate();
    try {
        queryField.input.focus({ preventScroll: true });
    }
    catch (_) {
        queryField.input.focus();
    }
}
function getDocSearchFilterCount(filters = {}) {
    var _a;
    return Number(Boolean(filters.notebook))
        + Number(Boolean((_a = filters.paths) === null || _a === void 0 ? void 0 : _a.length))
        + Number(Boolean(filters.types && Object.keys(filters.types).length))
        + Number(Boolean(filters.subTypes && Object.keys(filters.subTypes).length))
        + Number(Boolean(filters.method && filters.method !== "keyword"))
        + Number(Boolean(filters.orderBy && filters.orderBy !== "relevanceDesc"));
}
function getDocSearchFilterSummary(filters = {}, scrollElement) {
    var _a, _b;
    const parts = [];
    const notebookId = typeof filters.notebook === "string" ? filters.notebook.trim() : "";
    if (notebookId) {
        const notebookName = scrollElement ? (_a = this.docSearchState.notebookNames.get(scrollElement)) === null || _a === void 0 ? void 0 : _a.get(notebookId) : "";
        parts.push(`${this.i18n.searchFilterNotebook}: ${(notebookName || notebookId).slice(0, 32)}`);
    }
    const pathCount = ((_b = filters.paths) === null || _b === void 0 ? void 0 : _b.length) || 0;
    if (pathCount > 0)
        parts.push(`${this.i18n.searchFilterPath}: ${pathCount}`);
    const typeLabels = {
        document: this.i18n.searchTypeDocument,
        heading: this.i18n.searchTypeHeading,
        paragraph: this.i18n.searchTypeParagraph,
        codeBlock: this.i18n.searchTypeCodeBlock,
    };
    const type = Object.keys(filters.types || {}).find((key) => { var _a; return (_a = filters.types) === null || _a === void 0 ? void 0 : _a[key]; });
    if (type)
        parts.push(`${this.i18n.searchContentType}: ${typeLabels[type] || type}`);
    const subTypeLabels = {
        h1: this.i18n.searchSubTypeH1,
        h2: this.i18n.searchSubTypeH2,
        h3: this.i18n.searchSubTypeH3,
        h4: this.i18n.searchSubTypeH4,
        h5: this.i18n.searchSubTypeH5,
        h6: this.i18n.searchSubTypeH6,
        o: this.i18n.searchSubTypeOrdered,
        u: this.i18n.searchSubTypeUnordered,
        t: this.i18n.searchSubTypeTask,
    };
    const subType = Object.keys(filters.subTypes || {}).find((key) => { var _a; return (_a = filters.subTypes) === null || _a === void 0 ? void 0 : _a[key]; });
    if (subType)
        parts.push(`${this.i18n.searchSubType}: ${subTypeLabels[subType] || subType}`);
    if (filters.method && filters.method !== "keyword") {
        const methodLabels = { query: this.i18n.searchMethodQuery, regexp: this.i18n.searchMethodRegexp, semantic: this.i18n.searchMethodSemantic };
        parts.push(`${this.i18n.searchMethod}: ${methodLabels[filters.method] || filters.method}`);
    }
    if (filters.orderBy && filters.orderBy !== "relevanceDesc") {
        const orderLabels = {
            updatedDesc: this.i18n.searchOrderUpdated,
            createdDesc: this.i18n.searchOrderCreated,
            content: this.i18n.searchOrderContent,
        };
        parts.push(`${this.i18n.searchResultOrder}: ${orderLabels[filters.orderBy] || filters.orderBy}`);
    }
    return parts.join(" · ");
}
function hasDocSearchFilter(scrollElement) {
    return getDocSearchFilterCount.call(this, this.docSearchState.filters.get(scrollElement)) > 0;
}
function getDocSearchSession(scrollElement) {
    if (!this.docSearchState.filters.has(scrollElement)) {
        this.docSearchState.filters.set(scrollElement, Object.freeze({}));
    }
    let session = this.docSearchState.sessions.get(scrollElement);
    if (!session) {
        session = (0, search_session_1.createSearchSession)(constants_1.DOC_SEARCH_CACHE_LIMIT);
        this.docSearchState.sessions.set(scrollElement, session);
        this.docSearchState.activeSessions.add(session);
    }
    return session;
}
function updateDocSearchHealth(scrollElement, options = {}, reset = false) {
    const previous = reset ? undefined : this.docSearchState.health.get(scrollElement);
    const sources = {};
    for (const source of (previous === null || previous === void 0 ? void 0 : previous.sources) || [])
        sources[source.key] = source;
    const snapshot = (0, search_model_1.buildSearchHealthSnapshot)(Object.assign(Object.assign(Object.assign({}, previous), options), { query: scrollElement.dataset.swDocSearchQuery || "", counts: Object.assign(Object.assign({}, previous === null || previous === void 0 ? void 0 : previous.counts), options.counts), sources: Object.assign(Object.assign({}, sources), options.sources) }));
    this.docSearchState.health.set(scrollElement, snapshot);
    // Only coarse diagnostic labels enter DOM; contents stay in the session.
    scrollElement.dataset.swSearchState = snapshot.state;
    scrollElement.dataset.swSearchReasons = snapshot.reasons.join(" ");
    // Cache hits and late source reports update health without rebuilding results.
    const label = scrollElement.querySelector(".sw__doc-results > .sw__window-label");
    if (label)
        appendDocSearchHealthBadge.call(this, label, scrollElement);
    return snapshot;
}
function disposeDocSearchSession(scrollElement) {
    cancelDocPreview(scrollElement);
    // T-6949：会话销毁释放固定状态（WeakMap 键本会随元素回收，这里显式清理长生命周期滚动容器）
    docPreviewPins.delete(scrollElement);
    docPreviewPinnedCurrent.delete(scrollElement);
    docPreviewLastItems.delete(scrollElement);
    this.docSearchState.health.delete(scrollElement);
    delete scrollElement.dataset.swSearchState;
    delete scrollElement.dataset.swSearchReasons;
    const session = this.docSearchState.sessions.get(scrollElement);
    if (!session) {
        this.docSearchState.filters.delete(scrollElement);
        this.docSearchState.notebookNames.delete(scrollElement);
        return;
    }
    (0, search_session_1.disposeSearchSession)(session);
    this.docSearchState.activeSessions.delete(session);
    this.docSearchState.sessions.delete(scrollElement);
    this.docSearchState.filters.delete(scrollElement);
    this.docSearchState.notebookNames.delete(scrollElement);
}
// 全库文档搜索远程请求：带取消、防过期、AbortController 复用 searchSeq
async function runDocSearchFetch(scrollElement, searchInput, keyword, version, onClose, filters = {}, cacheKey = (0, search_model_1.buildSearchCacheKey)({ scope: "global", query: keyword, filters }), fetchQuery) {
    const fetchText = typeof fetchQuery === "string" ? fetchQuery : keyword;
    const session = getDocSearchSession.call(this, scrollElement);
    const current = () => version === session.version && scrollElement.isConnected
        && searchInput.value.trim() === keyword;
    if (!current()) {
        if (!scrollElement.isConnected)
            disposeDocSearchSession.call(this, scrollElement);
        return;
    }
    if (!fetchText) {
        renderDocResults.call(this, scrollElement, null, onClose);
        return;
    }
    const startedAt = performance.now();
    const elapsed = () => Math.max(0, performance.now() - startedAt);
    const report = (options) => {
        if (current())
            updateDocSearchHealth.call(this, scrollElement, options);
    };
    let controller = null;
    let openedPromise = null;
    try {
        controller = typeof AbortController === "function" ? new AbortController() : null;
        session.controller = controller;
        const signal = controller === null || controller === void 0 ? void 0 : controller.signal;
        // Keep local content probing independent of the global fast path,
        // including cache hits. Report failures separately from zero hits.
        const requestScope = docSearchRequestScope(scrollElement);
        if (signal)
            signal.__swDocSearchScope = requestScope;
        openedPromise = runOpenedDocumentContentSearch.call(this, fetchText, signal, filters, (source) => {
            report({ counts: { opened: source.count }, sources: { opened: source } });
        }, requestScope);
        openedPromise = openedPromise.then((roots) => {
            if (current()) {
                const visible = this.filterCards(scrollElement, keyword, roots, filters);
                report({ counts: { tabs: visible } });
            }
            return roots;
        }).catch((error) => {
            if ((error === null || error === void 0 ? void 0 : error.name) !== "AbortError") {
                report({ sources: { opened: { status: "error", latencyMs: elapsed() } } });
                logger_1.logger.warn("opened document search unavailable", error);
            }
            return new Set();
        });
        const cached = session.cache.get(cacheKey);
        if (cached) {
            report({ state: "ready", cacheHit: true, totalLatencyMs: elapsed(),
                counts: { global: cached.length }, sources: { global: { status: cached.length ? "ready" : "empty" } } });
            return;
        }
        let docs = [];
        let fallbackUsed = !(0, search_model_1.canUseTitleSearch)(filters);
        if (!fallbackUsed) {
            try {
                const response = await boundedSearchRequest.call(this, "/api/filetree/searchDocs", { k: fetchText }, signal, `${requestScope}:title`);
                if (!response.ok)
                    throw new Error("searchDocs unavailable");
                const json = await response.json();
                if (!current())
                    return;
                if ((json === null || json === void 0 ? void 0 : json.code) !== undefined && json.code !== 0)
                    throw new Error("searchDocs failed");
                if (!Array.isArray(json === null || json === void 0 ? void 0 : json.data))
                    throw new Error("searchDocs invalid response");
                const rawDocs = json.data.filter((doc) => Boolean(doc) && typeof doc === "object");
                docs = filterDocSearchResults.call(this, (0, search_model_1.normalizeTitleSearchDocuments)(rawDocs), filters);
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.name) === "AbortError")
                    throw error;
                if (!current())
                    return;
                report({ fallbackReason: "title-unavailable" });
                logger_1.logger.warn("title search unavailable; trying compatible fallbacks", error);
            }
            fallbackUsed = docs.length === 0;
        }
        if (!current())
            return;
        if (fallbackUsed) {
            report({ fallbackUsed: true });
            const fallbackDocs = await runFullTextSearchFallback.call(this, fetchText, signal, filters, constants_1.DOC_SEARCH_FETCH_LIMIT);
            // WebViews without AbortController still reject stale results
            // before cache writes, diagnostics, errors or DOM changes.
            if (!current())
                return;
            if (fallbackDocs === null) {
                await openedPromise;
                if (!current())
                    return;
                report({ state: "error", counts: { global: 0 }, totalLatencyMs: elapsed(),
                    sources: { global: { status: "error", latencyMs: elapsed() } } });
                // 页签层已经由 filterCards 更新；全库层失败时保留它并追加错误回执，
                // 不再因命中本地内容而静默移除整个远程结果区。
                renderDocResults.call(this, scrollElement, [], onClose, "error", undefined, () => this.applySearch(scrollElement, searchInput, onClose));
                return;
            }
            docs = fallbackDocs;
        }
        if (!current())
            return;
        // T-7334：路径首字母缩写加速——只对返回结果重排，不改变集合。
        // 缓存写入也用重排后的顺序，保证回放与首次输入一致。
        docs = (0, search_model_1.rankDocumentsByPathAcronym)(docs, keyword);
        (0, search_session_1.cacheSearchResult)(session, cacheKey, docs);
        report({ state: "ready", counts: { global: docs.length }, totalLatencyMs: elapsed(),
            fallbackUsed, sources: { global: { status: docs.length ? "ready" : "empty", latencyMs: elapsed() } } });
        renderDocResults.call(this, scrollElement, docs, onClose);
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.name) !== "AbortError" && current()) {
            report({ state: "error", totalLatencyMs: elapsed(), sources: { global: { status: "error" } } });
            logger_1.logger.warn("search docs fail", error);
            renderDocResults.call(this, scrollElement, [], onClose, "error", undefined, () => this.applySearch(scrollElement, searchInput, onClose));
        }
    }
    finally {
        // Results render immediately; retain cancellation until the slower
        // parallel probe settles. It must not overwrite a newer controller.
        if (openedPromise)
            await openedPromise;
        if (controller && session.controller === controller)
            session.controller = null;
        if (!scrollElement.isConnected)
            disposeDocSearchSession.call(this, scrollElement);
    }
}
async function runOpenedDocumentContentSearch(keyword, signal, filters = {}, report, latestScope = "doc-search:opened") {
    const startedAt = performance.now();
    const tabs = (this.isMobile ? this.getMobileTabs() : (0, siyuan_1.getAllTabs)()).filter((tab) => !filters.notebook || (0, search_model_1.resolveSearchNotebookId)(tab) === filters.notebook);
    const requests = (0, search_model_1.buildOpenedDocumentSearchRequests)(tabs, keyword, {
        capabilities: { semanticSearch: this.isSemanticSearchAvailable() },
        maxDocuments: 6,
        pageSize: 8,
        method: filters.method,
        orderBy: filters.orderBy,
        types: filters.types,
        subTypes: filters.subTypes,
        filters,
    });
    const roots = new Set();
    if (requests.length === 0) {
        report === null || report === void 0 ? void 0 : report({ status: "skipped", count: 0, latencyMs: 0 });
        return roots;
    }
    const results = new Array(requests.length).fill(false);
    let failures = 0;
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < requests.length) {
            const index = nextIndex++;
            const request = requests[index];
            try {
                // 端点为固定两个字面量之一（安全扫描要求 fetch 处无变量 URL）
                const response = await boundedSearchRequest.call(this, request.endpoint, request.body, signal, `${latestScope}:opened:${request.scope.rootId}`);
                if (!response.ok) {
                    failures++;
                    continue;
                }
                const payload = await response.json();
                if ((payload === null || payload === void 0 ? void 0 : payload.code) !== undefined && payload.code !== 0) {
                    failures++;
                    continue;
                }
                results[index] = (0, search_model_1.extractSearchRecords)(payload)
                    .some((record) => Boolean((0, search_model_1.normalizeSearchResult)(record, "opened")));
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.name) === "AbortError")
                    throw error;
                failures++;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(3, requests.length) }, () => worker()));
    results.forEach((matched, index) => {
        if (matched)
            roots.add(requests[index].scope.rootId);
    });
    report === null || report === void 0 ? void 0 : report({ status: failures > 0 ? "unavailable" : roots.size ? "ready" : "empty",
        count: roots.size, latencyMs: Math.max(0, performance.now() - startedAt) });
    return roots;
}
function filterDocSearchResults(docs, filters) {
    return (0, search_model_1.filterSearchDocuments)(docs, filters);
}
async function runFullTextSearchFallback(keyword, signal, filters = {}, documents = constants_1.DOC_RESULT_LIMIT, latestScope = "doc-search:fulltext") {
    // Keep one overflow card available for Agent callers to report a
    // truthful `truncated` flag. UI callers still pass DOC_RESULT_LIMIT.
    const documentLimit = Math.min(constants_1.DOC_SEARCH_FETCH_LIMIT, Math.max(1, Math.floor(Number(documents) || constants_1.DOC_RESULT_LIMIT)));
    const request = (0, search_model_1.buildFullTextSearchRequest)({
        query: keyword,
        method: filters.method || "keyword",
        capabilities: { semanticSearch: this.isSemanticSearchAvailable() },
        orderBy: filters.orderBy || "relevanceDesc",
        groupBy: "document",
        pageSize: Math.max(documentLimit * 2, 24),
        filters,
    });
    if (!request) {
        return null;
    }
    try {
        // 端点为固定两个字面量之一（安全扫描要求 fetch 处无变量 URL）
        const scopedLatestKey = signal
            ? String(signal.__swDocSearchScope || latestScope)
            : latestScope;
        const response = await boundedSearchRequest.call(this, request.endpoint, request.body, signal, `${scopedLatestKey}:fulltext`);
        if (!response.ok) {
            throw new Error(`full text search HTTP ${response.status}`);
        }
        const payload = await response.json();
        if ((payload === null || payload === void 0 ? void 0 : payload.code) !== undefined && payload.code !== 0)
            throw new Error("full text search failed");
        const aggregate = (0, search_model_1.aggregateSearchResults)((0, search_model_1.extractSearchRecords)(payload), {
            source: "global",
            documents: documentLimit,
            snippets: 2,
            blockIds: 8,
        });
        const mapped = aggregate.cards.map((card) => ({
            id: card.rootId,
            rootId: card.rootId,
            name: card.title,
            title: card.title,
            path: card.path,
            hPath: card.path,
            notebookId: card.notebookId,
            blockIds: card.blockIds,
            snippets: card.snippets,
            source: "fulltext",
        }));
        const scoped = filterDocSearchResults.call(this, mapped, filters);
        return scoped.slice(0, documentLimit);
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.name) === "AbortError") {
            throw error;
        }
        // Full-text search is optional. Older SiYuan versions keep the
        // title-search empty state when this endpoint is unavailable.
        logger_1.logger.warn("full text search fallback unavailable", error);
        return null;
    }
}
// T-6825 视口锚定：以滚动容器上沿为原点，收集当前文档条目的稳定 key 与视口偏移
function captureDocItemTops(scrollElement) {
    const containerTop = scrollElement.getBoundingClientRect().top;
    return Array.from(scrollElement.querySelectorAll(".sw__doc-item[data-sw-doc-key]"))
        .map((item) => ({ key: item.dataset.swDocKey || "", top: item.getBoundingClientRect().top - containerTop }))
        .filter((entry) => Boolean(entry.key));
}
function renderDocResults(scrollElement, docs, onClose, state = "results", expandedCount = constants_1.DOC_RESULT_LIMIT, onRetry) {
    // T-6825（fzf --track 语义）：任何重建前先记录视口内首个文档条目。
    // loading 清空期间锚点暂存，结果回来后按同一条目恢复视口位置。
    const anchor = (0, search_model_1.pickDocViewportAnchor)(captureDocItemTops(scrollElement), scrollElement.clientHeight);
    const box = ensureDocResultsBox.call(this, scrollElement, docs);
    if (!box) {
        this.docSearchState.docAnchors.delete(scrollElement);
        return;
    }
    box.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    if (state !== "results") {
        this.docSearchState.docAnchors.set(scrollElement, anchor);
        appendDocSearchStatus.call(this, box, state, scrollElement, onClose, onRetry);
        return;
    }
    // 排除当前已打开的文档（上半部分已有对应卡片）；手机端 getAllTabs() 恒为空，需用 MobileTabs 数据源
    const openRootIds = collectOpenRootIds.call(this);
    // T-6802：运算符客户端预过滤（排除项剔除 / 短语必须命中），以及
    // "上次选择置顶"——同一查询下用户上次选中的结果优先展示。
    const parsedQuery = this.docSearchState.parsedQueries.get(scrollElement);
    let effectiveDocs = docs;
    if (parsedQuery && (parsedQuery.phrases.length > 0 || parsedQuery.excludes.length > 0)) {
        effectiveDocs = docs.filter((doc) => (0, search_model_1.matchesParsedQuery)(`${String(doc.title || "")} ${String(doc.hPath || "")}`, parsedQuery));
    }
    const queryKey = (scrollElement.dataset.swDocSearchQuery || "").trim().toLowerCase();
    const promoteId = queryKey ? this.lastPickedByQuery.get(queryKey) : undefined;
    if (effectiveDocs.length === 0) {
        this.docSearchState.docAnchors.delete(scrollElement);
        appendDocResultsEmpty.call(this, box, scrollElement, onClose);
        return;
    }
    // T-6257（D-384）增量展开：切片/去重/已打开排除/是否还有余量
    // 全部由纯模型 planDocResultsPage 决策（可单元测试），
    // 本层只负责 DOM 装配与按钮接线。
    const plan = (0, search_model_1.planDocResultsPage)(effectiveDocs, openRootIds, expandedCount, promoteId);
    const grid = document.createElement("div");
    grid.className = "sw__doc-grid";
    plan.items.forEach(({ doc, id }) => {
        grid.appendChild(buildDocResultItem.call(this, doc, id, onClose, queryKey));
    });
    // T-6837 键序直达第二片：前 9 条可见文档结果写 1-9 角标（CSS attr 渲染，
    // 零 DOM 增量），与 bindKeydown 的搜索态数字直达一一对应
    Array.from(grid.children).forEach((child, index) => {
        const element = child;
        if (index < 9)
            element.dataset.swDigit = String(index + 1);
        else
            delete element.dataset.swDigit;
    });
    if (grid.childElementCount === 0) {
        this.docSearchState.docAnchors.delete(scrollElement);
        appendDocResultsEmpty.call(this, box, scrollElement, onClose);
        return;
    }
    const label = box.querySelector(".sw__window-label");
    if (label) {
        label.textContent = `${this.i18n.docSearchResults} · ${grid.childElementCount}`;
        appendDocSearchHealthBadge.call(this, label, scrollElement);
    }
    box.appendChild(grid);
    // T-6839：常驻预览窗格随结果区重挂（桌面且容器足够宽时）
    mountDocPreviewPane.call(this, box, scrollElement);
    if (plan.hasMore) {
        appendDocResultsLoadMore.call(this, box, scrollElement, docs, onClose, expandedCount);
    }
    else if (docs.length > constants_1.DOC_RESULT_LIMIT) {
        appendDocResultsViewAll.call(this, box, scrollElement, onClose);
    }
    // T-6825：内容装配完成后按同一条目把视口钉回原位；
    // 锚点缺失（结果集变化/文档区不在视口）时保持现状，不猜测位置。
    const stashedAnchor = this.docSearchState.docAnchors.get(scrollElement) || null;
    this.docSearchState.docAnchors.delete(scrollElement);
    const restoreScrollTop = (0, search_model_1.planDocViewportRestore)(anchor || stashedAnchor, captureDocItemTops(scrollElement), scrollElement.scrollTop);
    if (restoreScrollTop !== null) {
        scrollElement.scrollTop = restoreScrollTop;
    }
}
// 「加载更多」：增量展开已取回结果（纯客户端，不换缓存 key、不发新请求），
// 重渲染后恢复焦点到新按钮（或尽头时的原生出口），保持键盘连续性。
function appendDocResultsLoadMore(box, scrollElement, docs, onClose, expandedCount) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "sw__doc-load-more sw__doc-view-all b3-button b3-button--text";
    action.textContent = this.i18n.docSearchLoadMore;
    action.setAttribute("aria-label", this.i18n.docSearchLoadMore);
    action.addEventListener("click", () => {
        renderDocResults.call(this, scrollElement, docs, onClose, "results", expandedCount + constants_1.DOC_RESULT_LIMIT);
        const next = scrollElement.querySelector(".sw__doc-load-more")
            || scrollElement.querySelector(".sw__doc-view-all");
        try {
            next === null || next === void 0 ? void 0 : next.focus({ preventScroll: true });
        }
        catch (_) {
            next === null || next === void 0 ? void 0 : next.focus();
        }
    });
    box.appendChild(action);
}
// 复用现有 .sw__doc-results 容器；docs===null 时直接移除并返回 null
function ensureDocResultsBox(scrollElement, docs) {
    cancelDocPreview(scrollElement);
    let box = scrollElement.querySelector(".sw__doc-results");
    if (docs === null) {
        box === null || box === void 0 ? void 0 : box.remove();
        return null;
    }
    if (!box) {
        box = document.createElement("div");
        box.className = "sw__doc-results sw__group";
        scrollElement.appendChild(box);
    }
    // 兜底移除可能残留的隐藏类（历史 bug 防御），确保文档区始终可见
    box.classList.remove("fn__none");
    const label = document.createElement("div");
    label.className = "sw__window-label";
    label.textContent = this.i18n.docSearchResults;
    appendDocSearchHealthBadge.call(this, label, scrollElement);
    box.innerHTML = "";
    box.appendChild(label);
    return box;
}
// 当前已打开页签的 rootId 集合（去重）；手机端走 MobileTabs，桌面端走 getAllTabs
function collectOpenRootIds() {
    const opened = this.isMobile ? this.getMobileTabs() : (0, siyuan_1.getAllTabs)();
    return new Set(opened.map((tab) => this.rootIdOf(tab)).filter(Boolean));
}
// ==================== T-6839 常驻预览窗格 ====================
// 桌面端：文档结果区右分栏，行焦点（↑/↓/Tab）同步预览（大纲 ≤12 + 正文 ≤900 字）。
// 零新增端点：getDocOutline 与 getDoc 均在 KERNEL_ENDPOINTS 白名单；
// 300ms debounce（Raycast/Spotlight 谱系共识）+ 代际计数丢弃过期回包；
// 全库结果与已开页签共用窗格；手机端与窄容器不挂载。
// rootId 经 BLOCK_ID_RE 锚定校验（^[0-9]{14}-[0-9a-z]+$）后才可请求内核文档。
const DOC_PREVIEW_DEBOUNCE_MS = 300;
const DOC_PREVIEW_MIN_WIDTH = 680;
const docPreviewPanes = new WeakMap();
const docPreviewTimers = new WeakMap();
// T-7165：预览在途请求控制器——cancelDocPreview 真正 abort，不再只递增代际。
const docPreviewControllers = new WeakMap();
// T-7191：路径筛选在途请求控制器。
const pathFilterControllers = new WeakMap();
const docPreviewGenerations = new WeakMap();
// T-6949：会话级固定预览。以 scrollElement 为键——界面会话销毁即随 WeakMap 释放；
// 窄容器只隐藏窗格不销毁会话，同一会话恢复显示时固定对象仍在。
const docPreviewPins = new WeakMap();
const docPreviewPinnedCurrent = new WeakMap();
const docPreviewLastItems = new WeakMap();
// T-6950：窗格内查找状态（键=pane，与窗格同生命周期）；open/query 跨内容轮换保留，
// total/current 随每次渲染或查询重算。
const docPreviewFindStates = new WeakMap();
function createDocPreviewBody() {
    const body = document.createElement("div");
    body.className = "sw__doc-preview-body";
    body.tabIndex = 0;
    return body;
}
// T-6950：查找条（输入 + 计数 + 上一处/下一处/关闭）；hidden 起步，由头部查找开关展开。
// Ctrl/Cmd+F 仅在焦点位于本窗格时接管，不抢占宿主全局查找快捷键。
function buildDocPreviewFindBar(pane) {
    const doc = pane.ownerDocument || document;
    const bar = doc.createElement("div");
    bar.className = "sw__doc-preview-find";
    bar.hidden = true;
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "sw__doc-preview-find-input";
    input.placeholder = `${this.i18n.docSearchPreviewFind} · ${this.i18n.docSearchPreviewFindScope}`;
    input.setAttribute("aria-label", `${this.i18n.docSearchPreviewFind} · ${this.i18n.docSearchPreviewFindScope}`);
    const count = doc.createElement("span");
    count.className = "sw__doc-preview-find-count";
    count.setAttribute("aria-live", "polite");
    const prev = doc.createElement("button");
    prev.type = "button";
    prev.className = "sw__doc-preview-find-prev";
    prev.textContent = "‹";
    prev.setAttribute("aria-label", this.i18n.docSearchPreviewFindPrevious);
    prev.addEventListener("click", () => moveDocPreviewHit.call(this, pane, -1));
    const next = doc.createElement("button");
    next.type = "button";
    next.className = "sw__doc-preview-find-next";
    next.textContent = "›";
    next.setAttribute("aria-label", this.i18n.docSearchPreviewFindNext);
    next.addEventListener("click", () => moveDocPreviewHit.call(this, pane, 1));
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "sw__doc-preview-find-close";
    close.textContent = "✕";
    close.setAttribute("aria-label", this.i18n.docSearchPreviewFindClose);
    close.addEventListener("click", () => setDocPreviewFindOpen.call(this, pane, false));
    let composing = false;
    let committedValue = null;
    input.addEventListener("compositionstart", () => {
        composing = true;
        committedValue = null;
        const state = docPreviewFindStates.get(pane);
        if (state)
            state.composing = true;
    });
    input.addEventListener("compositionend", () => {
        composing = false;
        const state = docPreviewFindStates.get(pane);
        if (state)
            state.composing = false;
        committedValue = input.value;
        runDocPreviewFind.call(this, pane);
    });
    input.addEventListener("input", (event) => {
        if (composing || event.isComposing)
            return;
        const alreadyCommitted = committedValue !== null && committedValue === input.value;
        committedValue = null;
        if (!alreadyCommitted)
            runDocPreviewFind.call(this, pane);
    });
    input.addEventListener("keydown", (event) => {
        if (composing || event.isComposing || event.keyCode === 229) {
            event.stopPropagation();
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            moveDocPreviewHit.call(this, pane, event.shiftKey ? -1 : 1);
        }
        else if (event.key === "Escape") {
            event.preventDefault();
            setDocPreviewFindOpen.call(this, pane, false);
        }
    });
    bar.append(input, count, prev, next, close);
    pane.addEventListener("keydown", (event) => {
        if (composing || event.isComposing || event.keyCode === 229)
            return;
        if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "f") {
            event.preventDefault();
            setDocPreviewFindOpen.call(this, pane, true);
        }
    });
    return bar;
}
function docPreviewFindToggleOf(pane) {
    return pane.querySelector(".sw__doc-preview-find-toggle");
}
function setDocPreviewFindOpen(pane, open) {
    const state = docPreviewFindStates.get(pane) || { open: false, query: "", total: 0, current: 0 };
    state.open = open;
    docPreviewFindStates.set(pane, state);
    const bar = pane.querySelector(".sw__doc-preview-find");
    const toggle = docPreviewFindToggleOf(pane);
    if (!bar)
        return;
    bar.hidden = !open;
    toggle === null || toggle === void 0 ? void 0 : toggle.setAttribute("aria-expanded", String(open));
    const input = bar.querySelector(".sw__doc-preview-find-input");
    if (!open) {
        (0, doc_preview_find_1.clearPreviewFind)(previewBodyOf(pane));
        state.total = 0;
        state.current = 0;
        updateDocPreviewFindCount.call(this, pane);
        if (toggle === null || toggle === void 0 ? void 0 : toggle.isConnected) {
            try {
                toggle.focus({ preventScroll: true });
            }
            catch (_) {
                toggle.focus();
            }
        }
        return;
    }
    if (input) {
        if (state.query)
            input.value = state.query;
        input.focus({ preventScroll: true });
    }
    runDocPreviewFind.call(this, pane);
}
function runDocPreviewFind(pane) {
    const state = docPreviewFindStates.get(pane);
    const input = pane.querySelector(".sw__doc-preview-find-input");
    if (!state || !input || state.composing)
        return;
    state.query = input.value;
    state.total = (0, doc_preview_find_1.applyPreviewFind)(previewBodyOf(pane), state.query);
    state.current = 0;
    updateDocPreviewFindCount.call(this, pane);
    focusDocPreviewHit(previewBodyOf(pane), state.current, state.total > 0);
}
function moveDocPreviewHit(pane, delta) {
    const state = docPreviewFindStates.get(pane);
    if (!state || state.total <= 0)
        return;
    state.current = (0, doc_preview_find_1.nextHitIndex)(state.total, state.current, delta);
    updateDocPreviewFindCount.call(this, pane);
    focusDocPreviewHit(previewBodyOf(pane), state.current, true);
}
function updateDocPreviewFindCount(pane) {
    const state = docPreviewFindStates.get(pane);
    const count = pane.querySelector(".sw__doc-preview-find-count");
    if (!state || !count)
        return;
    count.textContent = !state.query.trim() ? ""
        : state.total > 0 ? `${state.current + 1}/${state.total}`
            : this.i18n.docSearchPreviewFindNoResults;
}
// 当前命中滚入正文视口：手动改 body.scrollTop（居中夹取），避免 scrollIntoView
// 连带滚动祖先结果列表（T-6950 验收红线）。
function focusDocPreviewHit(body, index, markCurrent) {
    const marks = body.querySelectorAll(`mark.${doc_preview_find_1.HIT_CLASS}`);
    if (markCurrent)
        marks.forEach((mark, i) => mark.classList.toggle("is-current", i === index));
    const el = marks[index];
    if (!el)
        return;
    const bodyRect = body.getBoundingClientRect();
    const markRect = el.getBoundingClientRect();
    const target = body.scrollTop + (markRect.top - bodyRect.top) - bodyRect.height / 2 + markRect.height / 2;
    body.scrollTop = (0, doc_preview_find_1.clampScrollTop)(target, body.scrollHeight - body.clientHeight);
}
// 复位查找（内容轮换/目标切换后调用）：清除标记与计数；rerunIfOpen 时按原查询对新内容重跑。
function resetDocPreviewFind(pane, rerunIfOpen = false) {
    const state = docPreviewFindStates.get(pane);
    if (!state)
        return;
    state.total = 0;
    state.current = 0;
    (0, doc_preview_find_1.clearPreviewFind)(previewBodyOf(pane));
    updateDocPreviewFindCount.call(this, pane);
    if (rerunIfOpen && state.open && state.query.trim())
        runDocPreviewFind.call(this, pane);
}
function docPreviewItemTitle(item) {
    var _a, _b;
    return ((_b = (_a = item.querySelector(".sw__doc-title, .sw__title")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || "";
}
function docPreviewPinButtonOf(pane) {
    return pane.querySelector(".sw__doc-preview-pin");
}
// 按会话状态同步固定按钮与头部标签（固定中显示「已固定 · 文档名」）；窗格重建后也走这里恢复。
function syncDocPreviewPin(scrollElement) {
    const pane = docPreviewPanes.get(scrollElement);
    const pin = pane ? docPreviewPinButtonOf(pane) : null;
    const label = pane === null || pane === void 0 ? void 0 : pane.querySelector(".sw__doc-preview-header-label");
    if (!pin || !label)
        return;
    const pinned = docPreviewPins.get(scrollElement);
    const current = docPreviewPinnedCurrent.get(scrollElement);
    pin.disabled = !pinned && !current;
    pin.setAttribute("aria-pressed", String(Boolean(pinned)));
    pin.textContent = pinned ? this.i18n.docSearchPreviewUnpin : this.i18n.docSearchPreviewPin;
    const pinTitle = pinned
        ? `${this.i18n.docSearchPreviewUnpin}${pinned.title ? ` · ${pinned.title}` : ""}`
        : this.i18n.docSearchPreviewPin;
    pin.title = pinTitle;
    pin.setAttribute("aria-label", pinTitle);
    label.textContent = pinned
        ? this.i18n.docSearchPreviewPinned.replace("{x}", pinned.title || this.i18n.docSearchPreview)
        : this.i18n.docSearchPreview;
}
// 固定捕获「当前预览对象」（无对象时按钮已禁用）；解除后回随最后悬停/聚焦的有效对象，
// 元素已断开则回到空态提示。固定只改变呈现跟随，不新增取数、不持久化任何内容。
function toggleDocPreviewPin(scrollElement) {
    var _a;
    const pane = docPreviewPanes.get(scrollElement);
    if (!(pane === null || pane === void 0 ? void 0 : pane.isConnected))
        return;
    if (docPreviewPins.has(scrollElement)) {
        docPreviewPins.delete(scrollElement);
        syncDocPreviewPin.call(this, scrollElement);
        const last = docPreviewLastItems.get(scrollElement);
        if (last === null || last === void 0 ? void 0 : last.isConnected) {
            previewTabOrDoc.call(this, scrollElement, last);
        }
        else {
            (_a = pane.querySelector(".sw-platform-status")) === null || _a === void 0 ? void 0 : _a.remove();
            setDocPreviewHint.call(this, pane, this.i18n.docSearchPreviewEmpty);
        }
        return;
    }
    const current = docPreviewPinnedCurrent.get(scrollElement);
    if (!current)
        return;
    docPreviewPins.set(scrollElement, Object.assign({}, current));
    syncDocPreviewPin.call(this, scrollElement);
}
function mountDocPreviewPane(box, scrollElement) {
    var _a;
    if (this.isMobile || scrollElement.clientWidth < DOC_PREVIEW_MIN_WIDTH) {
        return;
    }
    let pane = docPreviewPanes.get(scrollElement);
    if (!pane) {
        // 审查轮 P-C：常驻标题头 + 独立 body（内容轮换不清掉头部），min-height 防碎片感
        pane = document.createElement("aside");
        pane.className = "sw__doc-preview";
        pane.setAttribute("aria-label", this.i18n.docSearchPreview);
        const header = document.createElement("div");
        header.className = "sw__doc-preview-header";
        const label = document.createElement("span");
        label.className = "sw__doc-preview-header-label";
        label.textContent = this.i18n.docSearchPreview;
        // T-6949：会话级固定开关；状态由 syncDocPreviewPin 统一同步
        const pin = document.createElement("button");
        pin.type = "button";
        pin.className = "sw__doc-preview-pin";
        pin.setAttribute("aria-pressed", "false");
        pin.addEventListener("click", () => {
            toggleDocPreviewPin.call(this, scrollElement);
        });
        // T-6950：窗格内查找开关（按需展开查找条；Ctrl/Cmd+F 仅在窗格内接管）
        const findToggle = document.createElement("button");
        findToggle.type = "button";
        findToggle.className = "sw__doc-preview-find-toggle";
        findToggle.textContent = this.i18n.docSearchPreviewFind;
        findToggle.setAttribute("aria-expanded", "false");
        findToggle.setAttribute("aria-label", `${this.i18n.docSearchPreviewFind} · ${this.i18n.docSearchPreviewFindScope}`);
        findToggle.addEventListener("click", () => {
            var _a;
            setDocPreviewFindOpen.call(this, pane, ((_a = docPreviewFindStates.get(pane)) === null || _a === void 0 ? void 0 : _a.open) !== true);
        });
        header.append(label, pin, findToggle);
        pane.append(header, buildDocPreviewFindBar.call(this, pane), createDocPreviewBody());
        setDocPreviewHint.call(this, pane, this.i18n.docSearchPreviewEmpty);
        docPreviewPanes.set(scrollElement, pane);
    }
    syncDocPreviewPin.call(this, scrollElement);
    // 结果区每次渲染都会 innerHTML 重建，窗格需随之重挂
    (_a = pane.parentElement) === null || _a === void 0 ? void 0 : _a.classList.remove("sw--with-preview");
    box.classList.add("sw--with-preview");
    box.appendChild(pane);
    if (box.dataset.swPreviewHook !== "1") {
        box.dataset.swPreviewHook = "1";
        box.addEventListener("focusin", (event) => {
            var _a, _b;
            const item = (_b = (_a = event.target).closest) === null || _b === void 0 ? void 0 : _b.call(_a, ".sw__doc-grid .sw__doc-item, .sw__tab-content .sw__card");
            if (item) {
                previewTabOrDoc.call(this, scrollElement, item);
            }
        });
        // T-6843 悬停触发：与行焦点同一 debounce 管线（同一次扫掠的多次
        // mouseover 由 300ms debounce 合并取末行）；触屏的 tap 会先发
        // mouseover 再 click——预览先行一步无害（点击随后打开文档）
        box.addEventListener("mouseover", (event) => {
            var _a, _b;
            const item = (_b = (_a = event.target).closest) === null || _b === void 0 ? void 0 : _b.call(_a, ".sw__doc-grid .sw__doc-item, .sw__tab-content .sw__card");
            if (item) {
                previewTabOrDoc.call(this, scrollElement, item);
            }
        });
    }
}
function previewTabOrDoc(scrollElement, item) {
    const box = item.closest(".sw__tab-preview, .sw__doc-results");
    if (box)
        mountDocPreviewPane.call(this, box, scrollElement);
    // 记住最后目标，解除固定时回随它（元素已断开则回空态）
    docPreviewLastItems.set(scrollElement, item);
    if (docPreviewPins.has(scrollElement)) {
        // T-6949：固定中不跟随悬停/焦点/列表重建；窗格已随 mount 挂回，正文保持固定对象
        return;
    }
    const rootId = item.dataset.swDocKey || item.dataset.rootId || "";
    if (constants_1.BLOCK_ID_RE.test(rootId)) {
        docPreviewPinnedCurrent.set(scrollElement, { rootId, title: docPreviewItemTitle(item) });
        syncDocPreviewPin.call(this, scrollElement);
        scheduleDocPreview.call(this, scrollElement, item);
        return;
    }
    docPreviewPinnedCurrent.delete(scrollElement);
    syncDocPreviewPin.call(this, scrollElement);
    cancelDocPreview(scrollElement);
    const pane = docPreviewPanes.get(scrollElement);
    if (pane === null || pane === void 0 ? void 0 : pane.isConnected) {
        setDocPreviewStatus(pane, "blocked", this.i18n.docSearchPreviewUnavailable);
        setDocPreviewHint.call(this, pane, this.i18n.docSearchPreviewUnavailable);
    }
}
function previewBodyOf(pane) {
    return pane.querySelector(".sw__doc-preview-body") || pane;
}
function extractDocPreviewBlocks(html) {
    if (typeof html !== "string" || !html)
        return [];
    // Template content stays detached: read text from host block markup, never mount its HTML.
    const template = document.createElement("template");
    template.innerHTML = html.slice(0, 128000);
    const blocks = [];
    const add = (node, kind, checked) => {
        var _a;
        const content = ((_a = node === null || node === void 0 ? void 0 : node.textContent) === null || _a === void 0 ? void 0 : _a.replace(/\u200b/g, "").trim()) || "";
        if (content)
            blocks.push(kind === "task" ? { content, kind, checked: checked === true } : { content, kind });
    };
    const kinds = { NodeHeading: "heading", NodeParagraph: "paragraph",
        NodeCodeBlock: "code", NodeBlockquote: "quote" };
    for (const node of template.content.children) {
        if (blocks.length >= 12)
            break;
        const kind = kinds[node.getAttribute("data-type") || ""];
        if (kind)
            add(node.querySelector('[contenteditable="true"]'), kind);
        else if (node.getAttribute("data-type") === "NodeList") {
            node.querySelectorAll('[data-type="NodeListItem"], [data-type="NodeTaskListItem"]').forEach((item) => {
                var _a, _b, _c, _d, _e, _f;
                if (blocks.length >= 12)
                    return;
                const textNode = item.querySelector('[contenteditable="true"]');
                const task = node.getAttribute("data-subtype") === "t"
                    || item.getAttribute("data-subtype") === "t"
                    || item.getAttribute("data-type") === "NodeTaskListItem";
                if (!task) {
                    add(textNode, "list");
                    return;
                }
                const marker = (_b = (_a = item.getAttribute("data-task")) !== null && _a !== void 0 ? _a : item.getAttribute("data-done")) !== null && _b !== void 0 ? _b : item.getAttribute("data-marker");
                const prefix = (_c = textNode === null || textNode === void 0 ? void 0 : textNode.textContent) === null || _c === void 0 ? void 0 : _c.trim().match(/^\[([ xX])\]\s*/);
                const checked = marker !== null
                    ? /^(?:x|true|1|\[x\])$/i.test(marker.trim())
                    : ((_d = item.querySelector('input[type="checkbox"]')) === null || _d === void 0 ? void 0 : _d.hasAttribute("checked")) === true
                        || ((_e = prefix === null || prefix === void 0 ? void 0 : prefix[1]) === null || _e === void 0 ? void 0 : _e.toLowerCase()) === "x";
                const text = ((_f = textNode === null || textNode === void 0 ? void 0 : textNode.textContent) === null || _f === void 0 ? void 0 : _f.replace(/^\s*\[[ xX]\]\s*/, "")) || "";
                if (text.trim())
                    blocks.push({ content: text.trim(), kind: "task", checked });
            });
        }
    }
    return blocks;
}
function setDocPreviewHint(pane, text) {
    const body = previewBodyOf(pane);
    body.textContent = "";
    // 提示态即正文轮换：查找标记与计数一并复位（T-6950）
    resetDocPreviewFind.call(this, pane);
    const hint = document.createElement("div");
    hint.className = "sw__doc-preview-hint";
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    hint.textContent = text;
    body.appendChild(hint);
}
// T-6873（RZ-3）：预览窗格头部状态徽标（loading→ready，六态徽标语言）。
// 每次整体替换徽标元素——状态只有两个且由调用方按序推进，无需 diff。
function setDocPreviewStatus(pane, state, label) {
    var _a;
    const header = pane.querySelector(".sw__doc-preview-header");
    if (!header)
        return;
    (_a = header.querySelector(".sw-platform-status")) === null || _a === void 0 ? void 0 : _a.remove();
    const badge = (0, platform_dom_1.createPlatformStatus)(header.ownerDocument || document, state, label);
    badge.classList.add("sw__doc-preview-status");
    // 正文会在同一窗格内异步替换，状态徽标提供短小且唯一的播报回执；
    // 正文保持普通内容区，避免读屏重复朗读整篇预览。
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", "polite");
    badge.setAttribute("aria-atomic", "true");
    header.appendChild(badge);
}
function cancelDocPreview(scrollElement) {
    const previous = docPreviewTimers.get(scrollElement);
    if (previous !== undefined)
        window.clearTimeout(previous);
    docPreviewTimers.delete(scrollElement);
    // T-7165：中止在途的 outline/getDoc 请求（代际校验仍是最后防线）。
    const inflight = docPreviewControllers.get(scrollElement);
    if (inflight) {
        docPreviewControllers.delete(scrollElement);
        try {
            inflight.abort();
        }
        catch ( /* 无 AbortController 环境忽略 */_a) { /* 无 AbortController 环境忽略 */ }
    }
    const generation = (docPreviewGenerations.get(scrollElement) || 0) + 1;
    docPreviewGenerations.set(scrollElement, generation);
    return generation;
}
function scheduleDocPreview(scrollElement, item) {
    const rootId = String(item.dataset.swDocKey || item.dataset.rootId || "");
    if (!constants_1.BLOCK_ID_RE.test(rootId))
        return;
    const generation = cancelDocPreview(scrollElement);
    docPreviewTimers.set(scrollElement, window.setTimeout(() => {
        docPreviewTimers.delete(scrollElement);
        if (!item.isConnected)
            return;
        const title = docPreviewItemTitle(item);
        void loadDocPreview.call(this, scrollElement, rootId, generation, title);
    }, DOC_PREVIEW_DEBOUNCE_MS));
}
async function loadDocPreview(scrollElement, rootId, generation, title) {
    var _a, _b;
    const pane = docPreviewPanes.get(scrollElement);
    if (!pane || !pane.isConnected)
        return;
    setDocPreviewHint.call(this, pane, this.i18n.docSearchPreviewLoading);
    setDocPreviewStatus(pane, "loading", this.i18n.docSearchPreviewStatusLoading);
    // 两个白名单端点并行取数；fetchKernelJson 自带超时与非 2xx → null。
    // T-7165：携带取消 signal——换目标/收起/关闭窗格时 abort 在途请求。
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    if (controller)
        docPreviewControllers.set(scrollElement, controller);
    let outlinePayload = null;
    let docPayload = null;
    try {
        [outlinePayload, docPayload] = await Promise.all([
            // 审查轮 P-D 实证：preview:false 恒返回空，true 才携带嵌套大纲树
            this.fetchKernelJson("/api/outline/getDocOutline", { id: rootId, preview: true }, { signal: controller === null || controller === void 0 ? void 0 : controller.signal }),
            this.fetchKernelJson("/api/filetree/getDoc", { id: rootId, mode: 0, size: 12 }, { signal: controller === null || controller === void 0 ? void 0 : controller.signal }),
        ].map((request) => request.catch(() => null)));
    }
    finally {
        if (docPreviewControllers.get(scrollElement) === controller)
            docPreviewControllers.delete(scrollElement);
    }
    if (!pane.isConnected)
        return;
    if ((docPreviewGenerations.get(scrollElement) || 0) !== generation)
        return;
    const failed = !outlinePayload || outlinePayload.code !== 0 || !Array.isArray(outlinePayload.data)
        || !docPayload || docPayload.code !== 0 || typeof ((_a = docPayload.data) === null || _a === void 0 ? void 0 : _a.content) !== "string";
    setDocPreviewStatus(pane, failed ? "error" : "ready", failed
        ? this.i18n.docSearchPreviewFailed : this.i18n.docSearchPreviewStatusReady);
    const outline = Array.isArray(outlinePayload === null || outlinePayload === void 0 ? void 0 : outlinePayload.data) ? outlinePayload.data : [];
    const rows = extractDocPreviewBlocks((_b = docPayload === null || docPayload === void 0 ? void 0 : docPayload.data) === null || _b === void 0 ? void 0 : _b.content);
    const snapshot = (0, search_model_1.buildDocPreviewSnapshot)(outline, rows);
    const body = previewBodyOf(pane);
    body.textContent = "";
    if (snapshot.empty) {
        setDocPreviewHint.call(this, pane, failed
            ? this.i18n.docSearchPreviewFailed : this.i18n.docSearchPreviewNoContent);
        return;
    }
    const documentTitle = document.createElement("h3");
    documentTitle.className = "sw__doc-preview-title";
    documentTitle.textContent = title || this.i18n.docSearchPreview;
    body.appendChild(documentTitle);
    if (snapshot.items.length > 0) {
        const section = document.createElement("section");
        section.className = "sw__doc-preview-section";
        const label = document.createElement("h4");
        label.className = "sw__doc-preview-section-title";
        label.textContent = this.i18n.docSearchPreviewContent;
        section.appendChild(label);
        snapshot.items.forEach((item) => {
            if (item.kind === "list" || item.kind === "task") {
                let list = section.lastElementChild;
                if (!(list === null || list === void 0 ? void 0 : list.classList.contains("sw__doc-preview-content-list"))) {
                    list = document.createElement("ul");
                    list.className = "sw__doc-preview-content-list";
                    section.appendChild(list);
                }
                const line = document.createElement("li");
                if (item.kind === "task") {
                    line.className = "sw__doc-preview-task";
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.disabled = true;
                    checkbox.checked = item.checked === true;
                    checkbox.setAttribute("aria-label", item.text);
                    const copy = document.createElement("span");
                    copy.textContent = item.text;
                    if (checkbox.checked)
                        copy.className = "sw__doc-preview-task--done";
                    line.append(checkbox, copy);
                }
                else {
                    line.textContent = item.text;
                }
                list.appendChild(line);
                return;
            }
            const tag = item.kind === "heading" ? "h5" : item.kind === "quote" ? "blockquote"
                : item.kind === "code" ? "pre" : "p";
            const block = document.createElement(tag);
            block.className = `sw__doc-preview-block sw__doc-preview-block--${item.kind}`;
            if (item.kind === "paragraph")
                block.classList.add("sw__doc-preview-excerpt");
            block.textContent = item.text;
            section.appendChild(block);
        });
        body.appendChild(section);
    }
    const headings = snapshot.outline.filter((entry, index) => index !== 0 || entry.name !== title || snapshot.outline.length === 1);
    if (headings.length > 0) {
        const section = document.createElement("section");
        section.className = "sw__doc-preview-section";
        const label = document.createElement("h4");
        label.className = "sw__doc-preview-section-title";
        label.textContent = this.i18n.docSearchPreviewOutline;
        const list = document.createElement("ul");
        list.className = "sw__doc-preview-outline";
        headings.forEach((entry) => {
            const line = document.createElement("li");
            line.className = "sw__doc-preview-heading";
            line.style.paddingLeft = `${(entry.level - 1) * 10}px`;
            line.textContent = entry.name;
            list.appendChild(line);
        });
        section.append(label, list);
        body.appendChild(section);
    }
    // 内容渲染完成：若查找条展开且带查询，对新内容重跑（T-6950 目标切换约定）
    resetDocPreviewFind.call(this, pane, true);
}
function appendDocStatusCopy(status, titleText, hintText) {
    const copy = document.createElement("div");
    copy.className = "sw__doc-status-copy";
    const title = document.createElement("strong");
    title.className = "sw__doc-status-title";
    title.textContent = titleText;
    const hint = document.createElement("span");
    hint.className = "sw__doc-status-hint";
    hint.textContent = hintText;
    copy.append(title, hint);
    status.appendChild(copy);
}
function appendDocSearchHealthBadge(label, scrollElement) {
    var _a, _b, _c, _d, _e;
    const health = this.docSearchState.health.get(scrollElement);
    const state = !(health === null || health === void 0 ? void 0 : health.remote) ? ""
        : health.state === "error" ? "error" : health.state === "loading" ? "loading" : "";
    const fallbackUsed = Boolean((health === null || health === void 0 ? void 0 : health.fallbackUsed) || (health === null || health === void 0 ? void 0 : health.fallbackReason));
    const statusState = state || (fallbackUsed ? "stale" : "");
    const existing = label.querySelector(".sw__doc-health-status");
    if (statusState) {
        if ((existing === null || existing === void 0 ? void 0 : existing.dataset.state) !== statusState) {
            existing === null || existing === void 0 ? void 0 : existing.remove();
            const text = state === "error"
                ? this.i18n.docSearchHealthUnavailable
                : state === "loading"
                    ? this.i18n.docSearchHealthLoading
                    : this.i18n.docSearchHealthFallback;
            const badge = (0, platform_dom_1.createPlatformStatus)(label.ownerDocument || document, statusState, text);
            badge.classList.add("sw__doc-health-status");
            badge.setAttribute("aria-live", statusState === "error" ? "assertive" : "polite");
            label.appendChild(badge);
        }
    }
    else {
        existing === null || existing === void 0 ? void 0 : existing.remove();
    }
    (_a = label.querySelector(".sw__doc-scope-summary")) === null || _a === void 0 ? void 0 : _a.remove();
    const filters = ((_b = this.docSearchState.filters) === null || _b === void 0 ? void 0 : _b.get(scrollElement)) || {};
    const scopeParts = [];
    if (filters.notebook) {
        const name = (_d = (_c = this.docSearchState.notebookNames) === null || _c === void 0 ? void 0 : _c.get(scrollElement)) === null || _d === void 0 ? void 0 : _d.get(filters.notebook);
        scopeParts.push(`${this.i18n.searchFilterNotebook}: ${(name || filters.notebook).slice(0, 32)}`);
    }
    if (Array.isArray(filters.paths) && filters.paths.length > 0) {
        const titles = (_e = this.docSearchState.pathTitles) === null || _e === void 0 ? void 0 : _e.get(scrollElement);
        const paths = filters.paths.slice(0, 2).map((path) => (titles === null || titles === void 0 ? void 0 : titles.get(path)) || path.split("/").pop() || path);
        const suffix = filters.paths.length > 2 ? ` +${filters.paths.length - 2}` : "";
        scopeParts.push(`${this.i18n.searchFilterPath}: ${paths.join(", ")}${suffix}`);
    }
    // Title/path is already shown on each result card. Keep the header
    // quiet for the default scope; only the meaningful degraded method
    // change needs a persistent summary here.
    const methodLabel = fallbackUsed ? this.i18n.docSearchScopeFullText : "";
    if (methodLabel)
        scopeParts.push(methodLabel);
    if (scopeParts.length > 0) {
        const scope = (label.ownerDocument || document).createElement("span");
        scope.className = "sw__doc-scope-summary";
        scope.textContent = ` · ${scopeParts.join(" · ")}`;
        label.appendChild(scope);
    }
}
// 空态：无可显示的搜索结果；保留原生搜索出口，避免死路。
function appendDocResultsEmpty(box, scrollElement, onClose) {
    const empty = document.createElement("div");
    empty.className = "sw__doc-status sw__doc-status--empty";
    empty.setAttribute("role", "status");
    empty.setAttribute("aria-live", "polite");
    appendDocStatusCopy(empty, this.i18n.noDocResults, this.i18n.docSearchEmptyHint);

    const q = (scrollElement.dataset.swDocSearchQuery || "").trim();
    if (q && !/^[@^#!>?]/.test(q)) {
        const bar = document.createElement("div");
        bar.className = "sw__search-empty-hints";
        const lbl = document.createElement("span");
        lbl.className = "sw__search-empty-hints-label";
        lbl.textContent = this.i18n.searchTryPenetration;
        bar.appendChild(lbl);
        [["^", this.i18n.searchModeBlock], ["@", this.i18n.searchModeHeading], ["#", this.i18n.searchModeTag]].forEach(([p, name]) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "b3-button b3-button--text sw__search-empty-chip";
            btn.textContent = `${name} (${p}${q})`;
            btn.onclick = () => {
                const input = scrollElement.closest(".speed-switch")?.querySelector("input.sw__search");
                if (input) {
                    input.value = `${p}${q}`;
                    input.dispatchEvent(new (input.ownerDocument.defaultView || window).Event("input", {bubbles: true}));
                    input.focus();
                }
            };
            bar.appendChild(btn);
        });
        empty.appendChild(bar);
    }

    box.appendChild(empty);
    appendDocResultsViewAll.call(this, box, scrollElement, onClose);
}
function appendDocResultsViewAll(box, scrollElement, onClose) {
    const query = String(scrollElement.dataset.swDocSearchQuery || "").trim();
    const filters = this.docSearchState.filters.get(scrollElement) || {};
    const search = (0, search_model_1.buildNativeSearchTabConfig)({ query, filters, capabilities: { semanticSearch: this.isSemanticSearchAvailable() } });
    if (!search)
        return;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "sw__doc-view-all b3-button b3-button--text";
    action.textContent = this.i18n.docSearchViewAll;
    action.setAttribute("aria-label", this.i18n.docSearchViewAll);
    action.addEventListener("click", () => {
        onClose();
        void (0, siyuan_1.openTab)({ app: this.app, search: search.config }).catch((error) => {
            logger_1.logger.warn("open native search tab fail", error);
            (0, siyuan_1.showMessage)(this.i18n.docSearchFailed);
        });
    });
    box.appendChild(action);
}
function appendDocSearchStatus(box, state, scrollElement, onClose, onRetry) {
    const status = document.createElement("div");
    status.className = `sw__doc-status sw__doc-status--${state}`;
    status.setAttribute("role", state === "error" ? "alert" : "status");
    status.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
    if (state === "loading") {
        status.innerHTML = '<svg class="sw__spin" aria-hidden="true"><use xlink:href="#iconRefresh"></use></svg>';
        appendDocStatusCopy(status, this.i18n.docSearchLoading, this.i18n.docSearchLoadingHint);
        const skeleton = document.createElement("div");
        skeleton.className = "sw__doc-status-skeleton";
        skeleton.setAttribute("aria-hidden", "true");
        ["is-wide", "is-medium", "is-short"].forEach((variant) => {
            const line = document.createElement("span");
            line.className = `sw__doc-status-skeleton-line ${variant}`;
            skeleton.appendChild(line);
        });
        status.appendChild(skeleton);
    }
    else {
        appendDocStatusCopy(status, this.i18n.docSearchFailed, this.i18n.docSearchErrorHint);
    }
    box.appendChild(status);
    if (state === "error") {
        if (onRetry) {
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "sw__doc-retry b3-button b3-button--text";
            retry.textContent = this.i18n.docSearchRetry;
            retry.setAttribute("aria-label", this.i18n.docSearchRetry);
            retry.addEventListener("click", onRetry);
            box.appendChild(retry);
        }
        appendDocResultsViewAll.call(this, box, scrollElement, onClose);
    }
}
function docSearchResultId(doc) {
    // T-6257（D-384）：id 推导规则收敛到 search-model.resolveDocSearchResultId（单一事实来源）。
    return (0, search_model_1.resolveDocSearchResultId)(doc);
}
/**
 * Return one safe block target from a card. The root document remains the
 * fallback because older search responses may only contain document IDs.
 */
function docSearchHitId(doc, rootId) {
    const candidates = [
        ...(Array.isArray(doc.blockIds) ? doc.blockIds : []),
        ...(Array.isArray(doc.snippets) ? doc.snippets.map((snippet) => (snippet === null || snippet === void 0 ? void 0 : snippet.blockId) || "") : []),
    ];
    const hit = candidates.find((value) => {
        const id = String(value || "");
        return constants_1.BLOCK_ID_RE.test(id) && id !== rootId;
    });
    return hit ? String(hit) : null;
}
async function openDocSearchResult(rootId, hitId, position, options) {
    // T-6830 打开策略：开启复用且该文档已打开时，聚焦既有页签而非新开（防重复页签）。
    // 命中块定位（hitId）只在打开新页签时才有意义，复用路径直接聚焦。
    // T-6816：preview 选项时跳过复用（用户明确要一个预览页签）。
    if (!(options === null || options === void 0 ? void 0 : options.preview) && this.reuseOpenTabsEnabled() && this.activateTabForReuse(rootId)) {
        return;
    }
    if (this.isMobile) {
        // MobileTabs only accepts a root document ID. Keep block targeting
        // desktop-only until SiYuan exposes a stable mobile equivalent.
        await this.mobileOpenDoc(rootId);
        return;
    }
    const opened = await (0, document_actions_1.openDocumentOnDesktop)(Object.assign(Object.assign({ rootId, hitId: hitId && constants_1.BLOCK_ID_RE.test(hitId) ? hitId : null, app: this.app, openTab: siyuan_1.openTab,
        logger: logger_1.logger }, (position ? { position } : {})), ((options === null || options === void 0 ? void 0 : options.preview) ? { mode: "preview" } : {})));
    if (!opened)
        (0, siyuan_1.showMessage)(this.i18n.openDocFailed);
}
// 单个文档搜索结果按钮（图标 + 标题 + 路径）；点击直开文档（手机端走 MobileTabs.open）
function buildDocResultItem(doc, id, onClose, query = "") {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sw__doc-item";
    // T-6825 视口锚定依赖的稳定条目身份
    item.dataset.swDocKey = id;
    const icon = document.createElement("span");
    icon.className = "sw__doc-icon";
    icon.innerHTML = '<svg aria-hidden="true"><use xlink:href="#iconFile"></use></svg>';
    const copy = document.createElement("span");
    copy.className = "sw__doc-copy";
    const title = document.createElement("span");
    title.className = "sw__doc-title";
    const hPath = String(doc.hPath || "");
    const docTitle = hPath.split("/").filter(Boolean).pop() || String(doc.title || doc.name || "") || id;
    // T-6834 关键词高亮：查询词条命中段包 <mark>（分段 textContent 装配，零 innerHTML）
    for (const segment of (0, search_model_1.buildKeywordHighlightSegments)(docTitle, query)) {
        if (!segment.text)
            continue;
        if (segment.hit) {
            const mark = document.createElement("mark");
            mark.textContent = segment.text;
            title.appendChild(mark);
        }
        else {
            title.appendChild(document.createTextNode(segment.text));
        }
    }
    const source = document.createElement("span");
    source.className = "sw__doc-source" + (doc.kind ? ` is-${doc.kind}` : "");
    if (doc.kind === "heading" || doc.kind === "block") {
        source.textContent = doc.subTitle || (doc.kind === "heading" ? (this.i18n.searchModeHeading || "标题") : (this.i18n.searchModeBlock || "正文块"));
    } else {
        source.textContent = doc.source === "opened"
            ? this.i18n.docSearchSourceOpened
            : doc.source === "title"
                ? this.i18n.docSearchSourceTitle
                : this.i18n.docSearchSourceFullText;
    }
    let snippetElement = null;
    const snippets = Array.isArray(doc.snippets)
        ? doc.snippets.map((snippet) => String((snippet === null || snippet === void 0 ? void 0 : snippet.text) || "").trim()).filter(Boolean).join(" · ")
        : "";
    if (snippets) {
        snippetElement = document.createElement("span");
        snippetElement.className = "sw__doc-snippet";
        // T-6835 片段行关键词高亮：与标题共用分段器（模型层已剥内核 <mark> 包裹）
        for (const segment of (0, search_model_1.buildKeywordHighlightSegments)(snippets, query)) {
            if (!segment.text)
                continue;
            if (segment.hit) {
                const mark = document.createElement("mark");
                mark.textContent = segment.text;
                snippetElement.appendChild(mark);
            }
            else {
                snippetElement.appendChild(document.createTextNode(segment.text));
            }
        }
    }
    const path = document.createElement("span");
    path.className = "sw__doc-path";
    path.textContent = hPath || docTitle;
    copy.appendChild(title);
    copy.appendChild(source);
    if (snippetElement)
        copy.appendChild(snippetElement);
    copy.appendChild(path);
    item.appendChild(icon);
    item.appendChild(copy);
    item.title = hPath || docTitle;
    item.setAttribute("aria-label", hPath || docTitle);
    // T-6837 块级锚定随行持久化：点击与数字直达共用同一命中块，行为一致
    const hitId = docSearchHitId.call(this, doc, id);
    item.dataset.swDocHit = hitId || "";
    item.addEventListener("click", (event) => {
        // T-6837：激活路径单一化（点击与数字直达共用 activateDocResultItem；
        // T-6802 上次选择置顶记账、T-6816 Alt 预览语义均在入口内；
        // T-6924：Ctrl+点击/Ctrl+Enter（按钮原生 click 携带修饰键）= 右侧分屏，
        // 给 T-6810 的右键分屏补键盘等价物）。
        activateDocResultItem.call(this, item, onClose, {
            query,
            preview: event.altKey && !this.isMobile,
            split: event.ctrlKey && !this.isMobile && !event.altKey,
        });
    });
    // T-6810 并排打开：右键结果在右侧分屏打开（桌面）；T-6816 Alt+点击预览打开
    if (!this.isMobile) {
        item.title = (item.title ? item.title + " · " : "") + this.i18n.docSearchSplitHint
            + " · " + this.i18n.docSearchPreviewHint
            + " · " + (this.i18n.actionPaletteCopyBlockLink || "复制块超链接") + " (Alt+C)"
            + " · ⌘K " + (this.i18n.actionPaletteTitle || "动作画板");
        item.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            onClose();
            void openDocSearchResult.call(this, id, hitId, "right");
        });
        item.addEventListener("keydown", (event) => {
            const isCtrlOrCmd = event.ctrlKey || event.metaKey;
            if (isCtrlOrCmd && event.key.toLowerCase() === "k") {
                event.preventDefault();
                event.stopPropagation();
                if (typeof this.openActionPaletteForDoc === "function") {
                    this.openActionPaletteForDoc(doc, item);
                }
                return;
            }
            if (event.altKey && !isCtrlOrCmd && !event.shiftKey && event.key.toLowerCase() === "c") {
                event.preventDefault();
                event.stopPropagation();
                const copyTargetId = hitId || docRootKey;
                if (copyTargetId && navigator?.clipboard?.writeText) {
                    void navigator.clipboard.writeText(`siyuan://blocks/${copyTargetId}`);
                    (0, siyuan_1.showMessage)(this.i18n.snippetCopied || "已复制到剪贴板");
                }
            }
        });
    }
    return item;
}
// T-6837 键序直达第二片：文档结果行激活的单一入口（点击/数字直达共用）。
// 行身份取 data-sw-doc-key（rootId），块级锚定取 data-sw-doc-hit（命中块）；
// T-6802 上次选择置顶记账（该查询 → 选中结果，会话内 FIFO ≤32）内置于此；
// T-6924：split 选项走 openDocSearchResult 的右侧分屏位。
function activateDocResultItem(item, onClose, options = {}) {
    const id = String((item === null || item === void 0 ? void 0 : item.dataset.swDocKey) || "");
    if (!item || !id)
        return;
    const query = String(options.query || "");
    if (query) {
        const map = this.lastPickedByQuery;
        map.delete(query);
        map.set(query, id);
        while (map.size > 32) {
            const oldest = map.keys().next().value;
            if (oldest === undefined)
                break;
            map.delete(oldest);
        }
    }
    onClose();
    void openDocSearchResult.call(this, id, item.dataset.swDocHit || null, options.split ? "right" : undefined, { preview: Boolean(options.preview) });
}
