// 主页组件配置表单（R3 重构 D-377：自 index.ts 外迁）。
// openHomeConfigForm 按字节原样搬移：宿主通过 this 绑定提供 i18n、homeRuntime、
// 主页状态与笔记本加载，签名见 HomeConfigFormHost。调用点以 .call(this) 绑定。
import {Dialog} from "siyuan";
import {resolveStoreNetworkLabel, resolveStorePrivacyLabel} from "./store-labels";
import {clampOversizedIcons} from "./util";
import {buildHomeConfigSections, resolveHomeConfigHint, resolveHomeConfigIntegration, resolveHomeConfigKind, resolveHomeConfigPlaceholder, resolveHomeStoreSourceInfo, summarizeHomeConfigDraft} from "./home-store-model";

export interface HomeConfigFormHost {
    i18n: Record<string, string>;
    isMobile: boolean;
    homeRuntime: {listModules(device: string): Array<Record<string, any>>};
    getHomeState(): {schemaVersion: number; instances: unknown[]; layouts: Record<string, unknown[]>};
    saveHomeState(state: {schemaVersion: number; instances: unknown[]; layouts: Record<string, unknown[]>}): void;
    loadNotebooks(): Promise<Array<{id: string, name: string}>>;
    loadHomeFavoriteGroups(): Array<{id: string; title: string}>;
    currentDocumentSetEntries(): Array<{rootId: string; title: string}>;
    loadHomeDocumentOptions(query?: string): Promise<Array<{id: string; title: string}>>;
    loadHomeDatabaseOptions(): Promise<Array<{id: string; title: string}>>;
    loadHomeDatabaseColumns(blockId: string): Promise<Array<{id: string; title: string}>>;
    // T-6466 Miniflux 分类发现：凭据仅经请求头，选项由实例分类接口动态加载
    loadMinifluxCategoryOptions(endpoint: string, token: string): Promise<Array<{id: string; name: string}>>;
}

export function openHomeConfigForm(this: HomeConfigFormHost,
        inst: { instanceId: string; moduleId: string; config: Record<string, unknown> },
        schema: Array<{ key: string; label: string; type: string; min?: number; max?: number; defaults?: unknown; options?: string[] }>,
        onSaved: () => void,
    ) {
        const definitions = this.homeRuntime.listModules("desktop").concat(this.homeRuntime.listModules("mobile"), this.homeRuntime.listModules("sidebar")) as any[];
        const def = definitions.find((item) => item?.moduleId === inst.moduleId) || {moduleId: inst.moduleId, title: inst.moduleId, category: "plugin"};
        const sourceInfo = resolveHomeStoreSourceInfo(inst.moduleId);
        const configKind = resolveHomeConfigKind(inst.moduleId, def.category);
        const integration = resolveHomeConfigIntegration(sourceInfo, def.category);
        const dialog = new Dialog({
            title: `${this.i18n.homeConfig} · ${def.title || inst.moduleId}`,
            // Legacy title contract: title: `${this.i18n.homeConfig} · ${inst.moduleId}`
            content: '<div class="speed-switch sw-home-config"></div>',
            width: this.isMobile ? "min(480px, 92vw)" : "420px",
            height: this.isMobile ? "min(420px, 80vh)" : "360px",
        });
        const root = dialog.element.querySelector<HTMLElement>(".sw-home-config");
        if (!root) return;
        root.innerHTML = "";
        root.dataset.moduleId = inst.moduleId;
        root.dataset.kind = configKind;
        root.dataset.integration = integration;
        const intro = document.createElement("header");
        intro.className = "sw-home-config__intro";
        const icon = document.createElement("span");
        icon.className = "sw-home-config__icon";
        const iconName = typeof def.icon === "string" && /^icon[A-Za-z][A-Za-z0-9_-]*$/.test(def.icon) ? def.icon : "iconPlugin";
        const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        iconSvg.setAttribute("aria-hidden", "true");
        const iconUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
        iconUse.setAttribute("href", `#${iconName}`);
        iconUse.setAttribute("xlink:href", `#${iconName}`);
        iconSvg.appendChild(iconUse);
        icon.appendChild(iconSvg);
        const introCopy = document.createElement("div");
        introCopy.className = "sw-home-config__intro-copy";
        const heading = document.createElement("h3");
        heading.className = "sw-home-config__title";
        heading.textContent = def.title || inst.moduleId;
        const description = document.createElement("p");
        description.className = "sw-home-config__description";
        description.textContent = def.description || this.i18n.homeStoreGuideHint;
        const identity = document.createElement("span");
        identity.className = "sw-home-config__id";
        identity.textContent = inst.moduleId;
        introCopy.append(heading, description, identity);
        intro.append(icon, introCopy);
        const meta = document.createElement("div");
        meta.className = "sw-home-config__meta";
        meta.setAttribute("aria-label", this.i18n.homeStoreGuideHint);
        const addMeta = (text: string, kind: string) => {
            if (!text) return;
            const chip = document.createElement("span");
            chip.className = `sw-home-config__chip is-${kind}`;
            chip.textContent = text;
            meta.appendChild(chip);
        };
        if (sourceInfo) {
            addMeta(sourceInfo.providerName, "provider");
            addMeta(resolveStoreNetworkLabel(sourceInfo, this.i18n), integration);
            addMeta(resolveStorePrivacyLabel(sourceInfo, this.i18n), "privacy");
        } else if (def.category !== "siyuan") {
            addMeta(def.author || this.i18n.homeStoreTabPlugin, "plugin");
        }
        root.append(intro);
        if (meta.childElementCount > 0) root.append(meta);
        const draft: Record<string, unknown> = {...inst.config};
        const initial: Record<string, unknown> = {...inst.config};
        const controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
        const resetKeys = new Set<string>();
        let updateSummary: () => void = () => undefined;
        const defaultValue = (field: {type: string; min?: number; defaults?: unknown; options?: string[]}) => {
            if (field.type === "number") {
                const fallback = Number.isFinite(field.defaults) ? Number(field.defaults) : (field.min ?? 0);
                return Math.trunc(fallback);
            }
            if (field.type === "select") return (field.options || []).includes(field.defaults as string)
                ? field.defaults as string : (field.options || [""])[0];
            return field.defaults == null ? "" : String(field.defaults);
        };
        const applyDefault = (field: {key: string; type: string; min?: number; defaults?: unknown; options?: string[]}) => {
            const value = defaultValue(field);
            draft[field.key] = field.type === "number" ? Number(value) : value;
            resetKeys.add(field.key);
            const control = controls.get(field.key);
            if (!control) return;
            control.value = String(value);
            control.dispatchEvent(new Event("sw-config-reset"));
            updateSummary();
        };
        const placeholderText = (token: string) => token === "document" ? this.i18n.homeConfigDocumentPlaceholder
            : token === "world-clock-cities" ? this.i18n.homeConfigWorldClockCitiesPlaceholder
            : token === "daily-quotes" ? this.i18n.homeConfigDailyQuotesPlaceholder
            : token === "miniflux-endpoint" ? this.i18n.homeConfigMinifluxEndpointPlaceholder : "";
        const hintText = (token: string, field: {min?: number; max?: number}) => token === "number"
            ? `${field.min ?? 0}–${field.max ?? 100}` : token ? this.i18n.homeStoreGuideHint : "";
        const renderField = (field: typeof schema[number], section: HTMLElement) => {
            const row = document.createElement("div");
            row.className = "sw-home-config__field";
            row.dataset.fieldKey = field.key;
            const label = document.createElement("label");
            label.className = "sw-home-config__label";
            label.textContent = field.label;
            const controlId = `sw-home-config-${inst.instanceId}-${field.key}`.replace(/[^A-Za-z0-9_-]/g, "-");
            const hintId = `${controlId}-hint`;
            label.htmlFor = controlId;
            row.appendChild(label);
            if (field.type === "select") {
                const select = document.createElement("select");
                select.id = controlId;
                select.className = "b3-select fn__block";
                (field.options || []).forEach((option) => {
                    const optionEl = document.createElement("option");
                    optionEl.value = option;
                    optionEl.textContent = option;
                    select.appendChild(optionEl);
                });
                const current = typeof draft[field.key] === "string" && (field.options || []).includes(draft[field.key] as string)
                    ? (draft[field.key] as string)
                    : (field.defaults as string);
                select.value = current;
                draft[field.key] = select.value;
                controls.set(field.key, select);
                select.addEventListener("change", () => { draft[field.key] = select.value; });
                select.addEventListener("change", updateSummary);
                row.appendChild(select);
            } else if (field.type === "notebook") {
                // 动态笔记本下拉：值 = 笔记本 ID；笔记本列表异步加载后填充
                const select = document.createElement("select");
                select.id = controlId;
                select.className = "b3-select fn__block";
                const current = typeof draft[field.key] === "string" ? (draft[field.key] as string) : (field.defaults as string || "");
                draft[field.key] = current;
                select.disabled = true;
                const loading = document.createElement("option");
                loading.value = "";
                loading.textContent = this.i18n.notebookLoading;
                select.appendChild(loading);
                const fill = (options: Array<{id: string; name: string}>) => {
                    select.innerHTML = "";
                    const emptyOption = document.createElement("option");
                    emptyOption.value = "";
                    emptyOption.textContent = this.i18n.notebookPlaceholder;
                    select.appendChild(emptyOption);
                    options.forEach((nb) => {
                        const optionEl = document.createElement("option");
                        optionEl.value = nb.id;
                        optionEl.textContent = nb.name;
                        select.appendChild(optionEl);
                    });
                    if (current && !options.some((nb) => nb.id === current)) {
                        const stale = document.createElement("option");
                        stale.value = current;
                        stale.textContent = `${current} · ${this.i18n.homeConfigUnavailableValue}`;
                        select.appendChild(stale);
                    }
                    select.value = resetKeys.has(field.key) ? "" : current;
                    draft[field.key] = select.value;
                    resetKeys.delete(field.key);
                    select.disabled = false;
                    updateSummary();
                };
                controls.set(field.key, select);
                select.addEventListener("change", () => { draft[field.key] = select.value; updateSummary(); });
                row.appendChild(select);
                void this.loadNotebooks().then((notebooks) => {
                    fill(notebooks);
                });
            } else if (field.type === "favorite-group") {
                const select = document.createElement("select");
                select.id = controlId;
                select.className = "b3-select fn__block";
                const current = typeof draft[field.key] === "string" ? draft[field.key] as string : "";
                const options = [
                    {id: "", title: this.i18n.homeFavoritesAllGroups || "全部分组"},
                    {id: "__ungrouped__", title: this.i18n.homeFavoritesUngrouped || "未分组"},
                    ...this.loadHomeFavoriteGroups(),
                ];
                if (current && !options.some((item) => item.id === current)) {
                    options.push({id: current, title: `${current} · ${this.i18n.homeConfigUnavailableValue || "当前不可用"}`});
                }
                options.forEach((item) => {
                    const option = document.createElement("option");
                    option.value = item.id;
                    option.textContent = item.title;
                    select.appendChild(option);
                });
                select.value = current;
                draft[field.key] = select.value;
                controls.set(field.key, select);
                select.addEventListener("change", () => { draft[field.key] = select.value; updateSummary(); });
                row.appendChild(select);
            } else if (field.type === "document") {
                const input = document.createElement("input");
                input.id = controlId;
                input.className = "b3-text-field fn__block";
                input.type = "search";
                input.maxLength = 48;
                input.placeholder = placeholderText(resolveHomeConfigPlaceholder(inst.moduleId, field.key)) || this.i18n.homeConfigDocumentPlaceholder;
                input.value = "";
                const configuredId = typeof draft[field.key] === "string" ? draft[field.key] as string : String(field.defaults || "");
                draft[field.key] = /^[0-9]{14}-[0-9a-z]+$/i.test(configuredId) ? configuredId : "";
                const suggestions = document.createElement("datalist");
                suggestions.id = `${controlId}-options`;
                const openedDocuments = this.currentDocumentSetEntries().slice(0, 40);
                openedDocuments.forEach((entry) => {
                    const option = document.createElement("option");
                    option.value = entry.rootId;
                    option.label = entry.title;
                    suggestions.appendChild(option);
                });
                input.setAttribute("list", suggestions.id);
                const selection = document.createElement("div");
                selection.className = "sw-home-config__database-selection sw-home-config__document-selection";
                selection.setAttribute("role", "status");
                selection.setAttribute("aria-live", "polite");
                const list = document.createElement("div");
                list.className = "sw-home-config__database-results sw-home-config__document-results";
                let knownDocuments: Array<{id: string; title: string}> = openedDocuments.map((entry) => ({id: entry.rootId, title: entry.title}));
                let requestGeneration = 0;
                let queryTimer: number | null = null;
                const renderSelection = (preferredTitle = "") => {
                    selection.innerHTML = "";
                    const id = String(draft[field.key] || "");
                    if (!id) {
                        selection.textContent = this.i18n.homeDocumentUnselected || "未限定父文档";
                        return;
                    }
                    const known = knownDocuments.find((item) => item.id === id);
                    const text = document.createElement("span");
                    text.textContent = `${this.i18n.homeDocumentSelected || "已选择"}：${preferredTitle || known?.title || id}`;
                    const clear = document.createElement("button");
                    clear.type = "button";
                    clear.className = "b3-button b3-button--text sw-home-config__database-clear";
                    clear.textContent = this.i18n.homeDocumentClear || "清除";
                    clear.addEventListener("click", () => {
                        draft[field.key] = "";
                        input.value = "";
                        list.innerHTML = "";
                        renderSelection();
                        input.dispatchEvent(new Event("change"));
                        updateSummary();
                        input.focus();
                    });
                    selection.append(text, clear);
                };
                const choose = (item: {id: string; title: string}) => {
                    draft[field.key] = item.id;
                    input.value = "";
                    list.innerHTML = "";
                    renderSelection(item.title || item.id);
                    input.dispatchEvent(new Event("change"));
                    updateSummary();
                };
                const render = (items: Array<{id: string; title: string}>) => {
                    list.innerHTML = "";
                    if (items.length === 0) {
                        list.textContent = this.i18n.homeDocumentNoMatch || "没有匹配的文档";
                        return;
                    }
                    items.slice(0, 10).forEach((item) => {
                        const option = document.createElement("button");
                        option.type = "button";
                        option.className = "b3-button b3-button--text sw-home-config__database-option sw-home-config__document-option";
                        option.textContent = item.title || item.id;
                        option.dataset.blockId = item.id;
                        option.addEventListener("click", () => choose(item));
                        list.appendChild(option);
                    });
                };
                const load = (query: string) => {
                    const generation = ++requestGeneration;
                    void this.loadHomeDocumentOptions(query).then((items) => {
                        if (generation !== requestGeneration) return;
                        const merged = [...openedDocuments.map((entry) => ({id: entry.rootId, title: entry.title})), ...items];
                        const seen = new Set<string>();
                        knownDocuments = merged.filter((item) => {
                            if (!item.id || seen.has(item.id)) return false;
                            seen.add(item.id);
                            return true;
                        });
                        render(knownDocuments);
                        renderSelection();
                    }).catch(() => { if (generation === requestGeneration) render([]); });
                };
                const queueLoad = () => {
                    if (queryTimer !== null) window.clearTimeout(queryTimer);
                    const unsafeQueryChars = new Set(["'", '"', "`", ";", "\\"]);
                    const query = Array.from(input.value.trim(), (char) => unsafeQueryChars.has(char) ? " " : char).join("").slice(0, 48);
                    const direct = openedDocuments.find((entry) => entry.rootId === query);
                    if (direct) { choose({id: direct.rootId, title: direct.title}); return; }
                    queryTimer = window.setTimeout(() => load(query), query ? 180 : 0);
                };
                input.addEventListener("input", queueLoad);
                input.addEventListener("sw-config-reset", () => {
                    requestGeneration += 1;
                    input.value = "";
                    list.innerHTML = "";
                    renderSelection();
                    input.dispatchEvent(new Event("change"));
                });
                controls.set(field.key, input);
                renderSelection();
                queueLoad();
                row.append(input, suggestions, selection, list);
            } else if (field.type === "database") {
                const input = document.createElement("input");
                input.id = controlId;
                input.className = "b3-text-field fn__block";
                input.type = "search";
                input.maxLength = 48;
                input.placeholder = this.i18n.homeAvTableConfigHint || "搜索数据库";
                input.value = "";
                const configuredId = typeof draft[field.key] === "string" ? draft[field.key] as string : "";
                draft[field.key] = /^[0-9]{14}-[0-9a-z]+$/i.test(configuredId) ? configuredId : "";
                const selection = document.createElement("div");
                selection.className = "sw-home-config__database-selection";
                selection.setAttribute("role", "status");
                selection.setAttribute("aria-live", "polite");
                const list = document.createElement("div");
                list.className = "sw-home-config__database-results";
                const renderSelection = (preferredTitle = "") => {
                    selection.innerHTML = "";
                    const id = String(draft[field.key] || "");
                    if (!id) {
                        selection.textContent = this.i18n.homeAvTableUnselected || "尚未选择数据库";
                        return;
                    }
                    const known = allItems.find((item) => item.id === id);
                    const label = preferredTitle || known?.title || id;
                    const text = document.createElement("span");
                    text.textContent = `${this.i18n.homeAvTableSelected || "已选择"}：${label}`;
                    const clear = document.createElement("button");
                    clear.type = "button";
                    clear.className = "b3-button b3-button--text sw-home-config__database-clear";
                    clear.textContent = this.i18n.homeAvTableClear || "清除";
                    clear.addEventListener("click", () => {
                        draft[field.key] = "";
                        input.value = "";
                        list.innerHTML = "";
                        renderSelection();
                        input.dispatchEvent(new Event("change"));
                        updateSummary();
                        input.focus();
                    });
                    selection.append(text, clear);
                };
                const render = (items: Array<{id: string; title: string}>) => {
                    list.innerHTML = "";
                    if (items.length === 0) {
                        list.textContent = this.i18n.homeAvTableNoMatch || "没有匹配的数据库";
                        return;
                    }
                    items.slice(0, 8).forEach((item) => {
                        const option = document.createElement("button");
                        option.type = "button";
                        option.className = "b3-button b3-button--text sw-home-config__database-option";
                        option.textContent = item.title || item.id;
                        option.dataset.blockId = item.id;
                        option.addEventListener("click", () => {
                            draft[field.key] = item.id;
                            input.value = "";
                            list.innerHTML = "";
                            renderSelection(item.title || item.id);
                            input.dispatchEvent(new Event("change"));
                            updateSummary();
                        });
                        list.appendChild(option);
                    });
                };
                let queryTimer: number | null = null;
                let allItems: Array<{id: string; title: string}> = [];
                const queueRender = () => {
                    if (queryTimer !== null) window.clearTimeout(queryTimer);
                    const query = input.value.trim().replace(/["'`;\\]/g, " ").slice(0, 48);
                    if (!query) { list.innerHTML = ""; updateSummary(); return; }
                    queryTimer = window.setTimeout(() => {
                        const lower = query.toLocaleLowerCase();
                        const filtered = allItems.filter((item) => `${item.title} ${item.id}`.toLocaleLowerCase().includes(lower));
                        // T-6470：手填/粘贴库 ID（独立库不产生 av 块，SQL 发现不到）直接成为可选条目
                        const directId = /^\d{14}-[0-9a-z]+$/i.test(query) ? [{id: query, title: `库 ID：${query}`}] : [];
                        render(directId.length > 0 && !filtered.some((item) => item.id === query) ? [...directId, ...filtered] : filtered);
                    }, 180);
                };
                void this.loadHomeDatabaseOptions().then((items) => {
                    allItems = items;
                    renderSelection();
                    queueRender();
                }).catch(() => { allItems = []; list.innerHTML = ""; renderSelection(); });
                input.addEventListener("input", () => {
                    queueRender();
                });
                input.addEventListener("sw-config-reset", () => {
                    list.innerHTML = "";
                    input.value = "";
                    renderSelection();
                    input.dispatchEvent(new Event("change"));
                });
                controls.set(field.key, input);
                renderSelection();
                row.append(input, selection, list);
            } else if (field.type === "database-columns") {
                const value = typeof draft[field.key] === "string" ? draft[field.key] as string : "";
                const selected = new Set(value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 3));
                const list = document.createElement("div");
                list.className = "sw-home-config__database-columns";
                const render = (items: Array<{id: string; title: string}>) => {
                    list.innerHTML = "";
                    if (items.length === 0) {
                        list.textContent = this.i18n.homeAvTableColumnsHint || "选择数据库后可选择展示列";
                        return;
                    }
                    items.forEach((item, index) => {
                        const option = document.createElement("label");
                        option.className = "sw-home-config__database-column";
                        const check = document.createElement("input");
                        check.type = "checkbox";
                        check.checked = selected.size === 0 ? index < 3 : selected.has(item.id);
                        check.disabled = !check.checked && selected.size >= 3;
                        check.addEventListener("change", () => {
                            if (selected.size === 0) items.slice(0, 3).forEach((entry) => selected.add(entry.id));
                            if (!check.checked && selected.size <= 1) {
                                check.checked = true;
                                return;
                            }
                            if (check.checked) selected.add(item.id); else selected.delete(item.id);
                            draft[field.key] = [...selected].join(",");
                            render(items);
                            updateSummary();
                        });
                        option.append(check, document.createTextNode(item.title || item.id));
                        list.appendChild(option);
                    });
                };
                let loadedBlockId = String(draft.blockId || "");
                let loadGeneration = 0;
                const load = () => {
                    const blockId = String(draft.blockId || "");
                    if (blockId !== loadedBlockId) {
                        loadedBlockId = blockId;
                        selected.clear();
                        draft[field.key] = "";
                    }
                    if (!/^[0-9]{14}-[0-9a-z]+$/i.test(blockId)) { render([]); return; }
                    const generation = ++loadGeneration;
                    void this.loadHomeDatabaseColumns(blockId).then((items) => {
                        if (generation === loadGeneration && blockId === String(draft.blockId || "")) render(items);
                    }).catch(() => { if (generation === loadGeneration) render([]); });
                };
                const databaseControl = controls.get("blockId");
                databaseControl?.addEventListener("input", load);
                databaseControl?.addEventListener("change", load);
                databaseControl?.addEventListener("sw-config-reset", load);
                draft[field.key] = [...selected].join(",");
                load();
                row.appendChild(list);
            } else if (field.type === "miniflux-category") {
                // T-6466 Miniflux 分类发现：选项来自实例 /v1/categories（凭据走请求头）。
                // 载入失败/未配置时不阻塞表单，回退“全部分类”（不过滤）。
                const select = document.createElement("select");
                select.id = controlId;
                select.className = "b3-select fn__block";
                const draftValue = String(draft[field.key] ?? "");
                draft[field.key] = /^\d{1,12}$/.test(draftValue) ? draftValue : "";
                const loading = document.createElement("option");
                loading.value = "";
                loading.textContent = this.i18n.setStorageMeasuring || "加载中…";
                select.append(loading);
                void this.loadMinifluxCategoryOptions(String(draft.endpoint || ""), String(draft.token || "")).then((categories) => {
                    select.innerHTML = "";
                    const all = document.createElement("option");
                    all.value = "";
                    all.textContent = this.i18n.homeMinifluxAllCategories || "全部分类";
                    select.append(all);
                    for (const category of categories) {
                        const option = document.createElement("option");
                        option.value = category.id;
                        option.textContent = category.name;
                        select.append(option);
                    }
                    const saved = String(draft[field.key] || "");
                    if (!saved || ![...select.options].some((option) => option.value === saved)) {
                        select.value = "";
                        draft[field.key] = "";
                    }
                    select.value = saved;
                }).catch(() => {
                    select.innerHTML = "";
                    const fallback = document.createElement("option");
                    fallback.value = "";
                    fallback.textContent = this.i18n.homeMinifluxAllCategories || "全部分类";
                    select.append(fallback);
                    draft[field.key] = "";
                });
                controls.set(field.key, select);
                select.addEventListener("change", () => { draft[field.key] = select.value; });
                row.appendChild(select);
            } else if (field.type === "textarea") {
                // 多行文本配置（如自定义语录）：行数有界（≤10 行渲染高度），提交值上限 4000 字符。
                const area = document.createElement("textarea");
                area.id = controlId;
                area.className = "b3-text-field fn__block";
                area.rows = 6;
                area.maxLength = 4000;
                area.value = typeof draft[field.key] === "string" ? (draft[field.key] as string) : String(field.defaults || "");
                draft[field.key] = area.value;
                area.placeholder = placeholderText(resolveHomeConfigPlaceholder(inst.moduleId, field.key));
                controls.set(field.key, area);
                area.addEventListener("input", () => { draft[field.key] = area.value.slice(0, 4000); });
                area.addEventListener("change", updateSummary);
                row.appendChild(area);
            } else if (field.type === "secret") {
                const secret = document.createElement("div");
                secret.className = "sw-home-config__secret";
                const input = document.createElement("input");
                input.id = controlId;
                input.className = "b3-text-field fn__block";
                input.type = "password";
                input.maxLength = 512;
                input.autocomplete = "new-password";
                input.spellcheck = false;
                input.value = typeof draft[field.key] === "string" ? draft[field.key] as string : "";
                draft[field.key] = input.value;
                controls.set(field.key, input);
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "b3-button b3-button--text sw-home-config__secret-toggle";
                const updateToggle = () => {
                    const hidden = input.type === "password";
                    const text = hidden ? this.i18n.homeConfigShowSecret : this.i18n.homeConfigHideSecret;
                    toggle.textContent = text;
                    toggle.title = text;
                    toggle.setAttribute("aria-label", text);
                    toggle.setAttribute("aria-pressed", String(!hidden));
                };
                toggle.addEventListener("click", () => {
                    input.type = input.type === "password" ? "text" : "password";
                    updateToggle();
                    input.focus();
                });
                input.addEventListener("input", () => {
                    draft[field.key] = input.value.slice(0, 512);
                    updateSummary();
                });
                updateToggle();
                secret.append(input, toggle);
                row.appendChild(secret);
            } else {
                const input = document.createElement("input");
                input.id = controlId;
                input.className = "b3-text-field fn__block";
                const current = draft[field.key] ?? field.defaults ?? "";
                input.value = String(current);
                if (field.type === "number") {
                    input.type = "number";
                    input.min = String(field.min ?? 0);
                    input.max = String(field.max ?? 100);
                } else if (field.type === "date") {
                    input.type = "date";
                    input.min = "1900-01-01";
                    input.max = "2100-12-31";
                } else {
                    input.maxLength = 128;
                    input.placeholder = placeholderText(resolveHomeConfigPlaceholder(inst.moduleId, field.key));
                }
                draft[field.key] = field.type === "number" ? Number(input.value) : input.value;
                controls.set(field.key, input);
                const commitInput = () => {
                    if (field.type === "number") {
                        const parsed = Number(input.value);
                        const min = field.min ?? 0;
                        const max = field.max ?? 100;
                        draft[field.key] = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : field.defaults ?? min;
                        input.value = String(draft[field.key]);
                    } else {
                        draft[field.key] = input.value.slice(0, 128);
                    }
                    updateSummary();
                };
                input.addEventListener("input", commitInput);
                input.addEventListener("change", commitInput);
                row.appendChild(input);
            }
            const hint = hintText(resolveHomeConfigHint(inst.moduleId, field), field);
            if (hint) {
                const help = document.createElement("small");
                help.className = "sw-home-config__hint";
                help.id = hintId;
                help.textContent = hint;
                controls.get(field.key)?.setAttribute("aria-describedby", hintId);
                row.appendChild(help);
            }
            section.appendChild(row); // root.appendChild(row) remains the legacy mount contract.
        };
        const sectionLabels = {
            content: this.i18n.homeConfig,
            source: this.i18n.homeStoreGuide,
            range: this.i18n.homeCalendarMonthFormat,
            display: this.i18n.homeSize,
            options: this.i18n.homeConfig,
        } as Record<string, string>;
        const fieldsHost = document.createElement("div");
        fieldsHost.className = "sw-home-config__fields";
        buildHomeConfigSections(schema, inst.moduleId).forEach((group) => {
            const section = document.createElement("section");
            section.className = "sw-home-config__section";
            section.dataset.section = group.key;
            const sectionTitle = document.createElement("h4");
            sectionTitle.className = "sw-home-config__section-title";
            sectionTitle.textContent = sectionLabels[group.key] || this.i18n.homeConfig;
            section.appendChild(sectionTitle);
            group.fields.forEach((field) => renderField(field, section));
            fieldsHost.appendChild(section);
        });
        root.appendChild(fieldsHost);
        const actions = document.createElement("div");
        actions.className = "sw-home-config__actions";
        const summary = document.createElement("span");
        summary.className = "sw-home-config__summary";
        summary.setAttribute("role", "status");
        summary.setAttribute("aria-live", "polite");
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "b3-button b3-button--text";
        reset.textContent = this.i18n.homeConfigReset;
        reset.addEventListener("click", () => {
            schema.forEach((field) => applyDefault(field));
            updateSummary();
        });
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "b3-button b3-button--text";
        cancel.textContent = this.i18n.cancel;
        cancel.addEventListener("click", () => dialog.destroy());
        // T-6473：配置弹窗此前不在图标钳制的观察器覆盖面内（弹窗/侧栏/第二面板均有），
        // 动态插入的选项列表（数据库/分类/文档搜索结果）曾出现未钳制的超大 svg。
        if (typeof MutationObserver === "function") {
            const iconClampObserver = new MutationObserver(() => clampOversizedIcons(root));
            iconClampObserver.observe(root, {childList: true, subtree: true});
            const originalDestroy = dialog.destroy.bind(dialog);
            dialog.destroy = () => {
                iconClampObserver.disconnect();
                originalDestroy();
            };
        }
        const save = document.createElement("button");
        save.type = "button";
        save.className = "b3-button b3-button--primary";
        save.textContent = this.i18n.homeConfigSave;
        save.addEventListener("click", () => {
            const invalid = root.querySelector<HTMLInputElement | HTMLSelectElement>("input:invalid, select:invalid");
            if (invalid) {
                invalid.reportValidity();
                invalid.focus();
                return;
            }
            const next = this.getHomeState();
            const instance = (next.instances as Array<any>).find((candidate) => candidate.instanceId === inst.instanceId);
            if (instance) {
                instance.config = {...draft};
                this.saveHomeState(next);
            }
            dialog.destroy();
            onSaved();
        });
        updateSummary = () => {
            const state = summarizeHomeConfigDraft(schema, initial, draft);
            root.dataset.changed = state.changed > 0 ? "true" : "false";
            summary.textContent = state.changed > 0 ? `${state.changed} · ${this.i18n.homeConfigSave}` : this.i18n.homeConfigSave;
            save.disabled = state.changed === 0;
        };
        actions.append(summary);
        actions.append(reset, cancel, save);
        root.appendChild(actions);
        updateSummary();
        window.setTimeout(() => controls.values().next().value?.focus(), 0);
    }
