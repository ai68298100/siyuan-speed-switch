// 小驴雷切 —— 文档搜索 UI 链路（R5b 自 index.ts 原样搬移，D-383）
// 搜索方法群以 this 参数模式运行：调用方式 renderDocResults.call(host, ...)。
// host 契约见 DocSearchUiHost；群内互调在本模块内直接 .call(this)，
// 状态对象（sessions/filters/...）由 host.docSearchState 持有（R5a，D-381）。
import {Menu, getAllTabs, openTab, showMessage} from "siyuan";
import type {IMenu} from "siyuan";
import {BLOCK_ID_RE, DOC_RESULT_LIMIT, DOC_SEARCH_CACHE_LIMIT, DOC_SEARCH_FETCH_LIMIT} from "./constants";
import {createSearchSession, cacheSearchResult, disposeSearchSession} from "./search-session";
import {aggregateSearchResults, buildFullTextSearchRequest, buildNativeSearchTabConfig, buildOpenedDocumentSearchRequests, buildSearchCacheKey, buildSearchHealthSnapshot, canUseTitleSearch, extractSearchRecords, filterSearchDocuments as filterNativeSearchDocuments, matchesParsedQuery, normalizeSearchResult, pickDocViewportAnchor, planDocResultsPage, planDocViewportRestore, resolveDocSearchResultId, resolveSearchNotebookId} from "./search-model";
import {MAX_PATH_ITEMS, buildPathFilterListRequest, normalizePathFilterProbeOutcome} from "./path-filter-model";
import {openDocumentOnDesktop} from "./document-actions";
import {logger} from "./logger";
import type {DocSearchState} from "./doc-search-state";
import type {IDocSearchFilters, IDocSearchResult, ISearchSession, DocSearchRenderState, IOverlayClose} from "./index";

type Tab = ReturnType<typeof getAllTabs>[number];

// strictBindCallApply is off: .call(this) erases return types, so callers that rely on
// inference get explicit annotations (result payloads / nullable DOM lookups).
type DocSearchPathProbe = Awaited<ReturnType<typeof normalizePathFilterProbeOutcome>>;

export interface DocSearchUiHost {
    docSearchState: DocSearchState;
    i18n: Record<string, string>;
    app: import("siyuan").App;
    isMobile: boolean;
    fetchKernelJson(url: string, body: Record<string, unknown>): Promise<any | null>;
    loadNotebooks(): Promise<Array<{id: string, name: string}>>;
    escapeAttr(text: string): string;
    applySearch(scrollElement: HTMLElement, searchInput: HTMLInputElement, onClose: IOverlayClose): void;
    filterCards(scrollElement: HTMLElement, keyword: string, contentRoots: Set<string>, filters: IDocSearchFilters): number;
    isSemanticSearchAvailable(): boolean;
    getMobileTabs(): Tab[];
    rootIdOf(tab: Tab): string | null;
    mobileOpenDoc(rootId: string): Promise<boolean>;
    lastPickedByQuery: Map<string, string>;
    /** T-6827 保存的搜索 */
    getSavedSearches(): Array<{id: string; name: string; query: string; notebook?: string}>;
    saveCurrentSearch(query: string, filters: IDocSearchFilters): void;
    applySavedSearch(scrollElement: HTMLElement, saved: {id: string; query: string; notebook?: string}, onClose: IOverlayClose): void;
}

export async function loadDocSearchPathChildren(this: DocSearchUiHost, notebook: string, path: string, generation: number) {
        const input = {notebook, path, limit: MAX_PATH_ITEMS};
        const request = buildPathFilterListRequest(input);
        const cancelled = () => normalizePathFilterProbeOutcome({kind: "cancelled"}, input);
        if (!request) return normalizePathFilterProbeOutcome({kind: "response", payload: null}, input);
        if (generation !== this.docSearchState.pathGeneration) return cancelled();
        let payload: unknown = null;
        try {
            payload = await this.fetchKernelJson("/api/filetree/listDocsByPath", request.body);
        } catch (_) {
            payload = null;
        }
        if (generation !== this.docSearchState.pathGeneration) return cancelled();
        if (payload === null || payload === undefined) {
            return normalizePathFilterProbeOutcome({kind: "unavailable"}, input);
        }
        return normalizePathFilterProbeOutcome({kind: "response", payload}, input);
    }

export function bindDocSearchFilter(this: DocSearchUiHost,
        container: HTMLElement,
        scrollElement: HTMLElement,
        searchInput: HTMLInputElement,
        onClose: IOverlayClose,
    ): () => void {
        const button = container.querySelector<HTMLButtonElement>(".sw__search-filter-btn");
        if (!button) return () => undefined;
        let activeMenu: Menu | null = null;
        const onMenuKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || !activeMenu) return;
            window.setTimeout(() => {
                if (button.isConnected && !button.disabled) {
                    try {
                        button.focus({preventScroll: true});
                    } catch (_) {
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
        const commitFilters = (change: (next: IDocSearchFilters) => void) => {
            const next: IDocSearchFilters = {...(this.docSearchState.filters.get(scrollElement) || {})};
            change(next);
            if (next.types && Object.keys(next.types).length === 0) delete next.types;
            if (next.subTypes && Object.keys(next.subTypes).length === 0) delete next.subTypes;
            this.docSearchState.filters.set(scrollElement, Object.freeze(next));
            updateButton();
            this.applySearch(scrollElement, searchInput, onClose);
            searchInput.focus({preventScroll: true});
        };
        // v0.18 路径筛选（T-103）：逐级浏览目录并选择路径前缀。
        // 每次打开自增代际标记，使在途请求作废（内核辅助函数不接受外部 signal）。
        const openPathMenu = (notebook: string, path: string) => {
            const generation = ++this.docSearchState.pathGeneration;
            const rect = button.getBoundingClientRect();
            const position = {x: rect.left, y: rect.bottom};
            const openAsMenu = (items: IMenu[]) => {
                const menu = new Menu("swSearchPath");
                items.forEach((item) => menu.addItem(item));
                activeMenu?.close();
                activeMenu = menu;
                menu.open(position);
            };
            openAsMenu([{label: this.i18n.searchPathLoading, disabled: true}]);
            void loadDocSearchPathChildren.call(this, notebook, path, generation).then((result: DocSearchPathProbe) => {
                if (!button.isConnected || generation !== this.docSearchState.pathGeneration) return;
                const items: IMenu[] = [];
                if (!result.ok) {
                    items.push({
                        label: result.reason === "unavailable"
                            ? this.i18n.searchPathUnavailable
                            : this.i18n.searchPathFailed,
                        disabled: true,
                    });
                    openAsMenu(items);
                    return;
                }
                const titles = this.docSearchState.pathTitles.get(scrollElement) || new Map<string, string>();
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
                        if (!list.includes(path)) next.paths = [...list, path];
                    }),
                });
                items.push({type: "separator"});
                if (result.items.length === 0) {
                    items.push({label: this.i18n.searchNoPaths, disabled: true});
                }
                result.items.forEach((item) => {
                    const pick = () => commitFilters((next) => {
                        const list = next.paths || [];
                        if (!list.includes(item.path)) next.paths = [...list, item.path];
                    });
                    if (item.hasChildren) {
                        items.push({
                            label: item.title,
                            icon: "iconFolder",
                            submenu: [
                                {label: this.i18n.searchPathHere, icon: "iconFilter", click: pick},
                                {type: "separator"},
                                {label: this.i18n.searchPathBrowse, icon: "iconFolder", click: () => openPathMenu(notebook, item.path)},
                            ],
                        });
                    } else {
                        items.push({label: item.title, icon: "iconFiles", click: pick});
                    }
                });
                if (result.truncated) items.push({label: this.i18n.searchPathTruncated, disabled: true});
                openAsMenu(items);
            });
        };
        const onClick = async (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (button.disabled) return;
            activeMenu?.close();
            activeMenu = null;
            button.disabled = true;
            button.setAttribute("aria-busy", "true");
            let notebooks: Array<{id: string; name: string}> = [];
            try {
                notebooks = await this.loadNotebooks();
            } catch (error) {
                // Keep the filter menu usable even if a host adapter throws
                // outside loadNotebooks' own guarded fetch path.
                logger.warn("load search filter notebooks fail", error);
            } finally {
                if (button.isConnected) {
                    button.disabled = false;
                    button.removeAttribute("aria-busy");
                }
            }
            if (!button.isConnected) return;

            this.docSearchState.notebookNames.set(scrollElement, new Map(
                notebooks
                    .filter((notebook) => typeof notebook?.id === "string" && typeof notebook?.name === "string")
                    .map((notebook) => [notebook.id, notebook.name.slice(0, 64)]),
            ));
            updateButton();

            const current = this.docSearchState.filters.get(scrollElement) || {};
            const notebookSub: IMenu[] = [{
                label: this.i18n.searchAllNotebooks,
                icon: "iconGlobalGraph",
                checked: !current.notebook,
                click: () => commitFilters((next) => delete next.notebook),
            }];
            if (notebooks.length > 0) {
                notebookSub.push({type: "separator"});
                notebooks.forEach((notebook) => notebookSub.push({
                    label: this.escapeAttr(notebook.name),
                    icon: "iconFiles",
                    checked: current.notebook === notebook.id,
                    click: () => commitFilters((next) => { next.notebook = notebook.id; delete next.paths; }),
                }));
            } else {
                notebookSub.push({label: this.i18n.searchNoNotebooks, disabled: true});
            }
            const selectedType = Object.keys(current.types || {}).find((key) => current.types?.[key]) || "";
            const selectedSubType = Object.keys(current.subTypes || {}).find((key) => current.subTypes?.[key]) || "";
            const typeOptions: Array<{value: string; label: string}> = [
                {value: "", label: this.i18n.searchTypeAll},
                {value: "document", label: this.i18n.searchTypeDocument},
                {value: "heading", label: this.i18n.searchTypeHeading},
                {value: "paragraph", label: this.i18n.searchTypeParagraph},
                {value: "codeBlock", label: this.i18n.searchTypeCodeBlock},
            ];
            const subTypeOptions: Array<{value: string; label: string}> = [
                {value: "", label: this.i18n.searchSubTypeAll},
                {value: "h1", label: this.i18n.searchSubTypeH1},
                {value: "h2", label: this.i18n.searchSubTypeH2},
                {value: "h3", label: this.i18n.searchSubTypeH3},
                {value: "h4", label: this.i18n.searchSubTypeH4},
                {value: "h5", label: this.i18n.searchSubTypeH5},
                {value: "h6", label: this.i18n.searchSubTypeH6},
                {value: "o", label: this.i18n.searchSubTypeOrdered},
                {value: "u", label: this.i18n.searchSubTypeUnordered},
                {value: "t", label: this.i18n.searchSubTypeTask},
            ];
            const methodOptions: Array<{value: IDocSearchFilters["method"]; label: string}> = [
                {value: "keyword", label: this.i18n.searchMethodKeyword},
                {value: "query", label: this.i18n.searchMethodQuery},
                {value: "regexp", label: this.i18n.searchMethodRegexp},
            ];
            // 语义搜索（P3-3）：仅当宿主能力明确支持（AI embedding 已配置）时提供；
            // 未配置时内核静默返回空，宁缺毋滥不展示。已选中的残留 method 由
            // buildFullTextSearchRequest 静默降级为 keyword。
            if (this.isSemanticSearchAvailable()) {
                methodOptions.push({value: "semantic", label: this.i18n.searchMethodSemantic});
            }
            const orderOptions: Array<{value: IDocSearchFilters["orderBy"]; label: string}> = [
                {value: "relevanceDesc", label: this.i18n.searchOrderRelevance},
                {value: "updatedDesc", label: this.i18n.searchOrderUpdated},
                {value: "createdDesc", label: this.i18n.searchOrderCreated},
                {value: "content", label: this.i18n.searchOrderContent},
            ];
            const menu = new Menu("swSearchFilter");
            activeMenu = menu;
            menu.addItem({type: "submenu", label: this.i18n.searchFilterNotebook, icon: "iconFiles", submenu: notebookSub});
            // v0.18 路径筛选（T-103）：路径前缀依赖笔记本，故紧随其后；
            // 未选笔记本时给明确前置提示，而非隐藏入口。
            const currentNotebook = typeof current.notebook === "string" ? current.notebook : "";
            const currentPaths = current.paths || [];
            const pathSub: IMenu[] = [];
            if (!currentNotebook) {
                pathSub.push({label: this.i18n.searchPathPickNotebook, disabled: true});
            } else {
                pathSub.push({
                    label: this.i18n.searchAllPaths,
                    icon: "iconGlobalGraph",
                    checked: currentPaths.length === 0,
                    click: () => commitFilters((next) => delete next.paths),
                });
                const pathTitles = this.docSearchState.pathTitles.get(scrollElement);
                currentPaths.forEach((value) => {
                    const fallback = value.split("/").pop()?.replace(/\.sy$/, "") || value;
                    pathSub.push({
                        label: (pathTitles?.get(value) || fallback).slice(0, 40),
                        icon: "iconTrashcan",
                        click: () => commitFilters((next) => {
                            const rest = (next.paths || []).filter((entry) => entry !== value);
                            if (rest.length > 0) next.paths = rest;
                            else delete next.paths;
                        }),
                    });
                });
                pathSub.push({type: "separator"});
                pathSub.push({
                    label: this.i18n.searchPathBrowse,
                    icon: "iconFolder",
                    click: () => openPathMenu(currentNotebook, "/"),
                });
            }
            menu.addItem({type: "submenu", label: this.i18n.searchFilterPath, icon: "iconFolder", submenu: pathSub});
            menu.addItem({
                type: "submenu",
                label: this.i18n.searchContentType,
                icon: "iconFilter",
                submenu: typeOptions.map(({value, label}) => ({
                    label,
                    checked: selectedType === value,
                    click: () => commitFilters((next) => {
                        if (value) {
                            next.types = Object.freeze({[value]: true});
                            delete next.subTypes;
                        } else delete next.types;
                    }),
                })),
            });
            menu.addItem({
                type: "submenu",
                label: this.i18n.searchSubType,
                icon: "iconHeading",
                submenu: subTypeOptions.map(({value, label}) => ({
                    label,
                    checked: selectedSubType === value,
                    click: () => commitFilters((next) => {
                        if (value) {
                            next.subTypes = Object.freeze({[value]: true});
                            delete next.types;
                        } else delete next.subTypes;
                    }),
                })),
            });
            menu.addItem({
                type: "submenu",
                label: this.i18n.searchMethod,
                icon: "iconSearch",
                submenu: methodOptions.map(({value, label}) => ({
                    label,
                    checked: (current.method || "keyword") === value,
                    click: () => commitFilters((next) => {
                        if (value && value !== "keyword") next.method = value;
                        else delete next.method;
                    }),
                })),
            });
            menu.addItem({
                type: "submenu",
                label: this.i18n.searchResultOrder,
                icon: "iconSort",
                submenu: orderOptions.map(({value, label}) => ({
                    label,
                    checked: (current.orderBy || "relevanceDesc") === value,
                    click: () => commitFilters((next) => {
                        if (value && value !== "relevanceDesc") next.orderBy = value;
                        else delete next.orderBy;
                    }),
                })),
            });
            // T-6827 保存的搜索：已有保存项时提供快速应用子菜单
            const savedList = this.getSavedSearches();
            if (savedList.length > 0) {
                menu.addItem({
                    type: "submenu",
                    label: this.i18n.workbenchSaved,
                    icon: "iconBookmark",
                    submenu: savedList.map((saved) => ({
                        label: saved.name,
                        icon: "iconSearch",
                        click: () => this.applySavedSearch(scrollElement, saved, onClose),
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
                    Object.keys(next).forEach((key) => delete next[key as keyof IDocSearchFilters]);
                }),
            });
            const rect = button.getBoundingClientRect();
            menu.open({x: rect.left, y: rect.bottom});
        };

        updateButton();
        button.addEventListener("click", onClick);
        return () => {
            button.removeEventListener("click", onClick);
            document.removeEventListener("keydown", onMenuKeyDown, true);
            activeMenu?.close();
            activeMenu = null;
            this.docSearchState.filterButtonSync.delete(scrollElement);
        };
    }

    /**
     * T-6827：应用一条保存的搜索——查询写回输入框、笔记本筛选覆盖、
     * 筛选按钮徽标同步并立即执行一次搜索。工作台 chips 与菜单共用。
     */
export function applySavedSearchFilters(this: DocSearchUiHost, scrollElement: HTMLElement,
        searchInput: HTMLInputElement,
        saved: {id?: string; name?: string; query: string; notebook?: string},
        onClose: IOverlayClose,
    ) {
        const query = typeof saved?.query === "string" ? saved.query : "";
        if (!query) return;
        const filters: IDocSearchFilters = {...(this.docSearchState.filters.get(scrollElement) || {})};
        if (saved.notebook) filters.notebook = saved.notebook;
        else delete filters.notebook;
        this.docSearchState.filters.set(scrollElement, Object.freeze(filters));
        this.docSearchState.filterButtonSync.get(scrollElement)?.();
        searchInput.value = query;
        this.applySearch(scrollElement, searchInput, onClose);
        searchInput.focus({preventScroll: true});
    }

export function getDocSearchFilterCount(this: DocSearchUiHost, filters: IDocSearchFilters = {}): number {        return Number(Boolean(filters.notebook))
            + Number(Boolean(filters.paths?.length))
            + Number(Boolean(filters.types && Object.keys(filters.types).length))
            + Number(Boolean(filters.subTypes && Object.keys(filters.subTypes).length))
            + Number(Boolean(filters.method && filters.method !== "keyword"))
            + Number(Boolean(filters.orderBy && filters.orderBy !== "relevanceDesc"));
    }

export function getDocSearchFilterSummary(this: DocSearchUiHost, filters: IDocSearchFilters = {}, scrollElement?: HTMLElement): string {
        const parts: string[] = [];
        const notebookId = typeof filters.notebook === "string" ? filters.notebook.trim() : "";
        if (notebookId) {
            const notebookName = scrollElement ? this.docSearchState.notebookNames.get(scrollElement)?.get(notebookId) : "";
            parts.push(`${this.i18n.searchFilterNotebook}: ${(notebookName || notebookId).slice(0, 32)}`);
        }
        const pathCount = filters.paths?.length || 0;
        if (pathCount > 0) parts.push(`${this.i18n.searchFilterPath}: ${pathCount}`);
        const typeLabels: Record<string, string> = {
            document: this.i18n.searchTypeDocument,
            heading: this.i18n.searchTypeHeading,
            paragraph: this.i18n.searchTypeParagraph,
            codeBlock: this.i18n.searchTypeCodeBlock,
        };
        const type = Object.keys(filters.types || {}).find((key) => filters.types?.[key]);
        if (type) parts.push(`${this.i18n.searchContentType}: ${typeLabels[type] || type}`);
        const subTypeLabels: Record<string, string> = {
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
        const subType = Object.keys(filters.subTypes || {}).find((key) => filters.subTypes?.[key]);
        if (subType) parts.push(`${this.i18n.searchSubType}: ${subTypeLabels[subType] || subType}`);
        if (filters.method && filters.method !== "keyword") {
            const methodLabels = {query: this.i18n.searchMethodQuery, regexp: this.i18n.searchMethodRegexp, semantic: this.i18n.searchMethodSemantic};
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

export function hasDocSearchFilter(this: DocSearchUiHost, scrollElement: HTMLElement): boolean {
        return getDocSearchFilterCount.call(this, this.docSearchState.filters.get(scrollElement)) > 0;
    }

export function getDocSearchSession(this: DocSearchUiHost, scrollElement: HTMLElement): ISearchSession<IDocSearchResult[]> {
        if (!this.docSearchState.filters.has(scrollElement)) {
            this.docSearchState.filters.set(scrollElement, Object.freeze({}));
        }
        let session = this.docSearchState.sessions.get(scrollElement);
        if (!session) {
            session = createSearchSession<IDocSearchResult[]>(DOC_SEARCH_CACHE_LIMIT);
            this.docSearchState.sessions.set(scrollElement, session);
            this.docSearchState.activeSessions.add(session);
        }
        return session;
    }

export function updateDocSearchHealth(this: DocSearchUiHost, scrollElement: HTMLElement,
        options: Record<string, any> = {}, reset = false) {
    const previous = reset ? undefined : this.docSearchState.health.get(scrollElement);
    const sources: Record<string, {key: string; status: string; count: number; latencyMs: number}> = {};
    for (const source of previous?.sources || []) sources[source.key] = source;
    const snapshot = buildSearchHealthSnapshot({
        ...previous,
        ...options,
        query: scrollElement.dataset.swDocSearchQuery || "",
        counts: {...previous?.counts, ...options.counts},
        sources: {...sources, ...options.sources},
    });
    this.docSearchState.health.set(scrollElement, snapshot);
    // Only coarse diagnostic labels enter DOM; contents stay in the session.
    scrollElement.dataset.swSearchState = snapshot.state;
    scrollElement.dataset.swSearchReasons = snapshot.reasons.join(" ");
    return snapshot;
}

export function disposeDocSearchSession(this: DocSearchUiHost, scrollElement: HTMLElement) {
        this.docSearchState.health.delete(scrollElement);
        delete scrollElement.dataset.swSearchState;
        delete scrollElement.dataset.swSearchReasons;
        const session = this.docSearchState.sessions.get(scrollElement);
        if (!session) {
            this.docSearchState.filters.delete(scrollElement);
            this.docSearchState.notebookNames.delete(scrollElement);
            return;
        }
        disposeSearchSession(session);
        this.docSearchState.activeSessions.delete(session);
        this.docSearchState.sessions.delete(scrollElement);
        this.docSearchState.filters.delete(scrollElement);
        this.docSearchState.notebookNames.delete(scrollElement);
    }

    // 全库文档搜索远程请求：带取消、防过期、AbortController 复用 searchSeq
export async function runDocSearchFetch(this: DocSearchUiHost,
        scrollElement: HTMLElement,
        searchInput: HTMLInputElement,
        keyword: string,
        version: number,
        onClose: IOverlayClose,
        filters: IDocSearchFilters = {},
        cacheKey = buildSearchCacheKey({scope: "global", query: keyword, filters}),
        fetchQuery?: string,
    ) {
        const fetchText = typeof fetchQuery === "string" ? fetchQuery : keyword;
        const session = getDocSearchSession.call(this, scrollElement);
        const current = () => version === session.version && scrollElement.isConnected
            && searchInput.value.trim() === keyword;
        if (!current()) {
            if (!scrollElement.isConnected) disposeDocSearchSession.call(this, scrollElement);
            return;
        }
        if (!fetchText) {
            renderDocResults.call(this, scrollElement, null, onClose);
            return;
        }
        const startedAt = performance.now();
        const elapsed = () => Math.max(0, performance.now() - startedAt);
        const report = (options: Record<string, unknown>) => {
            if (current()) updateDocSearchHealth.call(this, scrollElement, options);
        };
        let controller: AbortController | null = null;
        let openedPromise: Promise<Set<string>> | null = null;
        try {
            controller = typeof AbortController === "function" ? new AbortController() : null;
            session.controller = controller;
            const signal = controller?.signal;
            // Keep local content probing independent of the global fast path,
            // including cache hits. Report failures separately from zero hits.
            openedPromise = runOpenedDocumentContentSearch.call(this, fetchText, signal, filters,
                (source: {status: string; count: number; latencyMs: number}) => {
                    report({counts: {opened: source.count}, sources: {opened: source}});
                });
            openedPromise = openedPromise.then((roots) => {
                if (current()) {
                    const visible = this.filterCards(scrollElement, keyword, roots, filters);
                    report({counts: {tabs: visible}});
                }
                return roots;
            }).catch((error: unknown) => {
                if ((error as DOMException)?.name !== "AbortError") {
                    report({sources: {opened: {status: "error", latencyMs: elapsed()}}});
                    logger.warn("opened document search unavailable", error);
                }
                return new Set<string>();
            });

            const cached = session.cache.get(cacheKey);
            if (cached) {
                report({state: "ready", cacheHit: true, totalLatencyMs: elapsed(),
                    counts: {global: cached.length}, sources: {global: {status: cached.length ? "ready" : "empty"}}});
                return;
            }
            let docs: IDocSearchResult[] = [];
            let fallbackUsed = !canUseTitleSearch(filters);
            if (!fallbackUsed) {
                try {
                    const response = await fetch("/api/filetree/searchDocs", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({k: fetchText}),
                        ...(signal ? {signal} : {}),
                    });
                    if (!response.ok) throw new Error("searchDocs unavailable");
                    const json = await response.json();
                    if (!current()) return;
                    if (json?.code !== undefined && json.code !== 0) throw new Error("searchDocs failed");
                    if (!Array.isArray(json?.data)) throw new Error("searchDocs invalid response");
                    docs = filterDocSearchResults.call(this,
                        json.data.filter((doc: unknown): doc is IDocSearchResult => Boolean(doc) && typeof doc === "object"), filters);
                } catch (error) {
                    if ((error as DOMException)?.name === "AbortError") throw error;
                    if (!current()) return;
                    report({fallbackReason: "title-unavailable"});
                    logger.warn("title search unavailable; trying compatible fallbacks", error);
                }
                fallbackUsed = docs.length === 0;
            }
            if (!current()) return;
            if (fallbackUsed) {
                report({fallbackUsed: true});
                const fallbackDocs: IDocSearchResult[] | null = await runFullTextSearchFallback.call(this,
                    fetchText, signal, filters, DOC_SEARCH_FETCH_LIMIT);
                // WebViews without AbortController still reject stale results
                // before cache writes, diagnostics, errors or DOM changes.
                if (!current()) return;
                if (fallbackDocs === null) {
                    const roots = await openedPromise;
                    if (!current()) return;
                    report({state: "error", counts: {global: 0}, totalLatencyMs: elapsed(),
                        sources: {global: {status: "error", latencyMs: elapsed()}}});
                    renderDocResults.call(this, scrollElement, roots.size ? null : [], onClose, "error");
                    return;
                }
                docs = fallbackDocs;
            }
            if (!current()) return;
            cacheSearchResult(session, cacheKey, docs);
            report({state: "ready", counts: {global: docs.length}, totalLatencyMs: elapsed(),
                fallbackUsed, sources: {global: {status: docs.length ? "ready" : "empty", latencyMs: elapsed()}}});
            renderDocResults.call(this, scrollElement, docs, onClose);
        } catch (error) {
            if ((error as DOMException)?.name !== "AbortError" && current()) {
                report({state: "error", totalLatencyMs: elapsed(), sources: {global: {status: "error"}}});
                logger.warn("search docs fail", error);
                renderDocResults.call(this, scrollElement, [], onClose, "error");
            }
        } finally {
            // Results render immediately; retain cancellation until the slower
            // parallel probe settles. It must not overwrite a newer controller.
            if (openedPromise) await openedPromise;
            if (controller && session.controller === controller) session.controller = null;
            if (!scrollElement.isConnected) disposeDocSearchSession.call(this, scrollElement);
        }
    }

export async function runOpenedDocumentContentSearch(this: DocSearchUiHost,
        keyword: string,
        signal?: AbortSignal,
        filters: IDocSearchFilters = {},
        report?: (source: {status: string; count: number; latencyMs: number}) => void,
    ): Promise<Set<string>> {
        const startedAt = performance.now();
        const tabs = (this.isMobile ? this.getMobileTabs() : getAllTabs()).filter((tab) =>
            !filters.notebook || resolveSearchNotebookId(tab as unknown) === filters.notebook);
        const requests = buildOpenedDocumentSearchRequests(tabs, keyword, {
            capabilities: {semanticSearch: this.isSemanticSearchAvailable()},
            maxDocuments: 6,
            pageSize: 8,
            method: filters.method,
            orderBy: filters.orderBy,
            types: filters.types,
            subTypes: filters.subTypes,
            filters,
        });
        const roots = new Set<string>();
        if (requests.length === 0) {
            report?.({status: "skipped", count: 0, latencyMs: 0});
            return roots;
        }
        const results = new Array<boolean>(requests.length).fill(false);
        let failures = 0;
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < requests.length) {
                const index = nextIndex++;
                const request = requests[index];
                try {
                    // 端点为固定两个字面量之一（安全扫描要求 fetch 处无变量 URL）
                    const init = {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(request.body),
                        ...(signal ? {signal} : {}),
                    };
                    let response: Response;
                    if (request.endpoint === "/api/search/semanticSearchBlock") {
                        response = await fetch("/api/search/semanticSearchBlock", init);
                    } else {
                        response = await fetch("/api/search/fullTextSearchBlock", init);
                    }
                    if (!response.ok) { failures++; continue; }
                    const payload = await response.json();
                    if (payload?.code !== undefined && payload.code !== 0) { failures++; continue; }
                    results[index] = extractSearchRecords(payload)
                        .some((record) => Boolean(normalizeSearchResult(record, "opened")));
                } catch (error) {
                    if ((error as DOMException)?.name === "AbortError") throw error;
                    failures++;
                }
            }
        };
        await Promise.all(Array.from({length: Math.min(3, requests.length)}, () => worker()));
        results.forEach((matched, index) => {
            if (matched) roots.add(requests[index].scope.rootId);
        });
        report?.({status: failures > 0 ? "unavailable" : roots.size ? "ready" : "empty",
            count: roots.size, latencyMs: Math.max(0, performance.now() - startedAt)});
        return roots;
    }

export function filterDocSearchResults(this: DocSearchUiHost, docs: IDocSearchResult[], filters: IDocSearchFilters): IDocSearchResult[] {
        return filterNativeSearchDocuments(docs, filters) as IDocSearchResult[];
    }

export async function runFullTextSearchFallback(this: DocSearchUiHost,
        keyword: string,
        signal?: AbortSignal,
        filters: IDocSearchFilters = {},
        documents = DOC_RESULT_LIMIT,
    ): Promise<IDocSearchResult[] | null> {
        // Keep one overflow card available for Agent callers to report a
        // truthful `truncated` flag. UI callers still pass DOC_RESULT_LIMIT.
        const documentLimit = Math.min(DOC_SEARCH_FETCH_LIMIT, Math.max(1, Math.floor(Number(documents) || DOC_RESULT_LIMIT)));
        const request = buildFullTextSearchRequest({
            query: keyword,
            method: filters.method || "keyword",
            capabilities: {semanticSearch: this.isSemanticSearchAvailable()},
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
            const init = {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(request.body),
                ...(signal ? {signal} : {}),
            };
            let response: Response;
            if (request.endpoint === "/api/search/semanticSearchBlock") {
                response = await fetch("/api/search/semanticSearchBlock", init);
            } else {
                response = await fetch("/api/search/fullTextSearchBlock", init);
            }
            if (!response.ok) {
                throw new Error(`full text search HTTP ${response.status}`);
            }
            const payload = await response.json();
            if (payload?.code !== undefined && payload.code !== 0) throw new Error("full text search failed");
            const aggregate = aggregateSearchResults(extractSearchRecords(payload), {
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
                source: "global",
            }));
            const scoped = filterDocSearchResults.call(this, mapped, filters);
            return scoped.slice(0, documentLimit);
        } catch (error) {
            if ((error as DOMException)?.name === "AbortError") {
                throw error;
            }
            // Full-text search is optional. Older SiYuan versions keep the
            // title-search empty state when this endpoint is unavailable.
            logger.warn("full text search fallback unavailable", error);
            return null;
        }
    }

    // T-6825 视口锚定：以滚动容器上沿为原点，收集当前文档条目的稳定 key 与视口偏移
    function captureDocItemTops(scrollElement: HTMLElement): Array<{key: string; top: number}> {
        const containerTop = scrollElement.getBoundingClientRect().top;
        return Array.from(scrollElement.querySelectorAll<HTMLElement>(".sw__doc-item[data-sw-doc-key]"))
            .map((item) => ({key: item.dataset.swDocKey || "", top: item.getBoundingClientRect().top - containerTop}))
            .filter((entry) => Boolean(entry.key));
    }

export function renderDocResults(this: DocSearchUiHost,
        scrollElement: HTMLElement,
        docs: IDocSearchResult[] | null,
        onClose: IOverlayClose,
        state: DocSearchRenderState = "results",
        expandedCount = DOC_RESULT_LIMIT,
    ) {
        // T-6825（fzf --track 语义）：任何重建前先记录视口内首个文档条目。
        // loading 清空期间锚点暂存，结果回来后按同一条目恢复视口位置。
        const anchor = pickDocViewportAnchor(captureDocItemTops(scrollElement), scrollElement.clientHeight);
        const box: HTMLElement | null = ensureDocResultsBox.call(this, scrollElement, docs);
        if (!box) {
            this.docSearchState.docAnchors.delete(scrollElement);
            return;
        }
        box.setAttribute("aria-busy", state === "loading" ? "true" : "false");
        if (state !== "results") {
            this.docSearchState.docAnchors.set(scrollElement, anchor);
            appendDocSearchStatus.call(this, box, state);
            return;
        }
        // 排除当前已打开的文档（上半部分已有对应卡片）；手机端 getAllTabs() 恒为空，需用 MobileTabs 数据源
        const openRootIds = collectOpenRootIds.call(this);

        // T-6802：运算符客户端预过滤（排除项剔除 / 短语必须命中），以及
        // "上次选择置顶"——同一查询下用户上次选中的结果优先展示。
        const parsedQuery = this.docSearchState.parsedQueries.get(scrollElement);
        let effectiveDocs = docs;
        if (parsedQuery && (parsedQuery.phrases.length > 0 || parsedQuery.excludes.length > 0)) {
            effectiveDocs = docs.filter((doc) => matchesParsedQuery(
                `${String(doc.title || "")} ${String(doc.hPath || "")}`,
                parsedQuery,
            ));
        }
        const queryKey = (scrollElement.dataset.swDocSearchQuery || "").trim().toLowerCase();
        const promoteId = queryKey ? this.lastPickedByQuery.get(queryKey) : undefined;

        if (effectiveDocs.length === 0) {
            this.docSearchState.docAnchors.delete(scrollElement);
            appendDocResultsEmpty.call(this, box);
            return;
        }

        // T-6257（D-384）增量展开：切片/去重/已打开排除/是否还有余量
        // 全部由纯模型 planDocResultsPage 决策（可单元测试），
        // 本层只负责 DOM 装配与按钮接线。
        const plan = planDocResultsPage(effectiveDocs, openRootIds, expandedCount, promoteId);
        const grid = document.createElement("div");
        grid.className = "sw__doc-grid";
        plan.items.forEach(({doc, id}) => {
            grid.appendChild(buildDocResultItem.call(this, doc, id, onClose, queryKey));
        });
        if (grid.childElementCount === 0) {
            this.docSearchState.docAnchors.delete(scrollElement);
            appendDocResultsEmpty.call(this, box);
            return;
        }
        const label = box.querySelector<HTMLElement>(".sw__window-label");
        if (label) {
            label.textContent = `${this.i18n.docSearchResults} · ${grid.childElementCount}`;
        }
        box.appendChild(grid);
        if (plan.hasMore) {
            appendDocResultsLoadMore.call(this, box, scrollElement, docs, onClose, expandedCount);
        } else if (docs.length > DOC_RESULT_LIMIT) {
            appendDocResultsViewAll.call(this, box, scrollElement, onClose);
        }
        // T-6825：内容装配完成后按同一条目把视口钉回原位；
        // 锚点缺失（结果集变化/文档区不在视口）时保持现状，不猜测位置。
        const stashedAnchor = this.docSearchState.docAnchors.get(scrollElement) || null;
        this.docSearchState.docAnchors.delete(scrollElement);
        const restoreScrollTop = planDocViewportRestore(
            anchor || stashedAnchor,
            captureDocItemTops(scrollElement),
            scrollElement.scrollTop,
        );
        if (restoreScrollTop !== null) {
            scrollElement.scrollTop = restoreScrollTop;
        }
    }

    // 「加载更多」：增量展开已取回结果（纯客户端，不换缓存 key、不发新请求），
    // 重渲染后恢复焦点到新按钮（或尽头时的原生出口），保持键盘连续性。
export function appendDocResultsLoadMore(this: DocSearchUiHost,
        box: HTMLElement,
        scrollElement: HTMLElement,
        docs: IDocSearchResult[],
        onClose: IOverlayClose,
        expandedCount: number,
    ) {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "sw__doc-load-more sw__doc-view-all b3-button b3-button--text";
        action.textContent = this.i18n.docSearchLoadMore;
        action.setAttribute("aria-label", this.i18n.docSearchLoadMore);
        action.addEventListener("click", () => {
            renderDocResults.call(this, scrollElement, docs, onClose, "results", expandedCount + DOC_RESULT_LIMIT);
            const next = scrollElement.querySelector<HTMLElement>(".sw__doc-load-more")
                || scrollElement.querySelector<HTMLElement>(".sw__doc-view-all");
            try {
                next?.focus({preventScroll: true});
            } catch (_) {
                next?.focus();
            }
        });
        box.appendChild(action);
    }

    // 澶嶇敤鐜版湁 .sw__doc-results 瀹瑰櫒锛沝ocs===null 鏃剁洿鎺ョЩ闄ゅ苟杩斿洖 null
export function ensureDocResultsBox(this: DocSearchUiHost, scrollElement: HTMLElement, docs: IDocSearchResult[] | null): HTMLElement | null {
        let box = scrollElement.querySelector<HTMLElement>(".sw__doc-results");
        if (docs === null) {
            box?.remove();
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
        box.innerHTML = "";
        box.appendChild(label);
        return box;
    }

    // 当前已打开页签的 rootId 集合（去重）；手机端走 MobileTabs，桌面端走 getAllTabs
export function collectOpenRootIds(this: DocSearchUiHost): Set<string> {
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        return new Set(
            opened.map((tab) => this.rootIdOf(tab)).filter(Boolean) as string[],
        );
    }

    // 空态：无可显示的搜索结果
export function appendDocResultsEmpty(this: DocSearchUiHost, box: HTMLElement) {
        const empty = document.createElement("div");
        empty.className = "sw__doc-status sw__doc-status--empty";
        empty.setAttribute("role", "status");
        empty.setAttribute("aria-live", "polite");
        empty.textContent = this.i18n.noDocResults;
        box.appendChild(empty);
    }

export function appendDocResultsViewAll(this: DocSearchUiHost, box: HTMLElement, scrollElement: HTMLElement, onClose: IOverlayClose) {
        const query = String(scrollElement.dataset.swDocSearchQuery || "").trim();
        const filters = this.docSearchState.filters.get(scrollElement) || {};
        const search = buildNativeSearchTabConfig({query, filters, capabilities: {semanticSearch: this.isSemanticSearchAvailable()}});
        if (!search) return;
        const action = document.createElement("button");
        action.type = "button";
        action.className = "sw__doc-view-all b3-button b3-button--text";
        action.textContent = this.i18n.docSearchViewAll;
        action.setAttribute("aria-label", this.i18n.docSearchViewAll);
        action.addEventListener("click", () => {
            onClose();
            void openTab({app: this.app, search: search.config as any}).catch((error) => {
                logger.warn("open native search tab fail", error);
                showMessage(this.i18n.docSearchFailed);
            });
        });
        box.appendChild(action);
    }

export function appendDocSearchStatus(this: DocSearchUiHost, box: HTMLElement, state: Exclude<DocSearchRenderState, "results">) {
        const status = document.createElement("div");
        status.className = `sw__doc-status sw__doc-status--${state}`;
        status.setAttribute("role", state === "error" ? "alert" : "status");
        status.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
        if (state === "loading") {
            status.innerHTML = '<svg class="sw__spin" aria-hidden="true"><use xlink:href="#iconRefresh"></use></svg>';
            const text = document.createElement("span");
            text.textContent = this.i18n.docSearchLoading;
            status.appendChild(text);
        } else {
            status.textContent = this.i18n.docSearchFailed;
        }
        box.appendChild(status);
    }

export function docSearchResultId(this: DocSearchUiHost, doc: IDocSearchResult): string {
        // T-6257（D-384）：id 推导规则收敛到 search-model.resolveDocSearchResultId（单一事实来源）。
        return resolveDocSearchResultId(doc);
    }

    /**
     * Return one safe block target from a card. The root document remains the
     * fallback because older search responses may only contain document IDs.
     */
export function docSearchHitId(this: DocSearchUiHost, doc: IDocSearchResult, rootId: string): string | null {
        const candidates = [
            ...(Array.isArray(doc.blockIds) ? doc.blockIds : []),
            ...(Array.isArray(doc.snippets) ? doc.snippets.map((snippet) => snippet?.blockId || "") : []),
        ];
        const hit = candidates.find((value) => {
            const id = String(value || "");
            return BLOCK_ID_RE.test(id) && id !== rootId;
        });
        return hit ? String(hit) : null;
    }

export async function openDocSearchResult(this: DocSearchUiHost, rootId: string, hitId: string | null, position?: "right"): Promise<void> {
        if (this.isMobile) {
            // MobileTabs only accepts a root document ID. Keep block targeting
            // desktop-only until SiYuan exposes a stable mobile equivalent.
            await this.mobileOpenDoc(rootId);
            return;
        }
        const opened = await openDocumentOnDesktop({
            rootId,
            hitId: hitId && BLOCK_ID_RE.test(hitId) ? hitId : null,
            app: this.app,
            openTab,
            logger,
            ...(position ? {position} : {}),
        });
        if (!opened) showMessage(this.i18n.openDocFailed);
    }

    // 单个文档搜索结果按钮（图标 + 标题 + 路径）；点击直开文档（手机端走 MobileTabs.open）
export function buildDocResultItem(this: DocSearchUiHost, doc: IDocSearchResult, id: string, onClose: IOverlayClose, query = ""): HTMLButtonElement {
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
        title.textContent = docTitle;
        const source = document.createElement("span");
        source.className = "sw__doc-source";
        source.textContent = doc.source === "opened"
            ? this.i18n.docSearchSourceOpened
            : this.i18n.docSearchSourceGlobal;
        let snippetElement: HTMLSpanElement | null = null;
        const snippets = Array.isArray(doc.snippets)
            ? doc.snippets.map((snippet) => String(snippet?.text || "").trim()).filter(Boolean).join(" · ")
            : "";
        if (snippets) {
            snippetElement = document.createElement("span");
            snippetElement.className = "sw__doc-snippet";
            snippetElement.textContent = snippets;
        }
        const path = document.createElement("span");
        path.className = "sw__doc-path";
        path.textContent = hPath || docTitle;
        copy.appendChild(title);
        copy.appendChild(source);
        if (snippetElement) copy.appendChild(snippetElement);
        copy.appendChild(path);
        item.appendChild(icon);
        item.appendChild(copy);
        item.title = hPath || docTitle;
        item.setAttribute("aria-label", hPath || docTitle);
        item.addEventListener("click", () => {
            // T-6802 上次选择置顶：记录"该查询 → 选中结果"，会话内重复查询时置顶
            if (query) {
                const map = this.lastPickedByQuery;
                map.delete(query);
                map.set(query, id);
                while (map.size > 32) {
                    const oldest = map.keys().next().value;
                    if (oldest === undefined) break;
                    map.delete(oldest);
                }
            }
            onClose();
            void openDocSearchResult.call(this, id, docSearchHitId.call(this, doc, id));
        });
        // T-6810 并排打开：右键结果在右侧分屏打开（桌面）
        if (!this.isMobile) {
            item.title = (item.title ? item.title + " · " : "") + this.i18n.docSearchSplitHint;
            item.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                onClose();
                void openDocSearchResult.call(this, id, docSearchHitId.call(this, doc, id), "right");
            });
        }
        return item;
    }
