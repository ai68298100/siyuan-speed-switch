const {BUILTIN_SNIPPETS, SNIPPET_CODE_MAX, parseSnippetImport, filterSnippetCatalog} = require("./snippet-studio-model.js");
const {createSnippetStore} = require("./snippet-studio-host.js");
const {createSnippetPreview} = require("./snippet-studio-preview.js");
const {createSnippetAIClient} = require("./snippet-studio-ai.js");

/** Experimental singleton view; native snippets remain the only saved copy. */
function mountSnippetStudio(root, {i18n = {}, getConfig = () => ({}), store = createSnippetStore({getSnippetSettings: () => getConfig()?.snippet}), ai = createSnippetAIClient(), session = {draft: null, baseline: null}, onBack = () => {}} = {}) {
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    // Keep the locale surface statically discoverable by the repository i18n
    // gate while still allowing the UI to look up one of the fixed labels
    // below by key. There is no user-controlled key path here.
    const locale = {i18n};
    const translations = {
        snippetAbout: locale.i18n.snippetAbout,
        snippetAI: locale.i18n.snippetAI,
        snippetAIAccept: locale.i18n.snippetAIAccept,
        snippetAIAccepted: locale.i18n.snippetAIAccepted,
        snippetAICancel: locale.i18n.snippetAICancel,
        snippetAICandidate: locale.i18n.snippetAICandidate,
        snippetAIConsent: locale.i18n.snippetAIConsent,
        snippetAIDone: locale.i18n.snippetAIDone,
        snippetAIExplain: locale.i18n.snippetAIExplain,
        snippetAIGenerate: locale.i18n.snippetAIGenerate,
        snippetAIGenerating: locale.i18n.snippetAIGenerating,
        snippetAIHint: locale.i18n.snippetAIHint,
        snippetAIIdle: locale.i18n.snippetAIIdle,
        snippetAIIterate: locale.i18n.snippetAIIterate,
        snippetAIMode: locale.i18n.snippetAIMode,
        snippetAIOptimize: locale.i18n.snippetAIOptimize,
        snippetAIPrompt: locale.i18n.snippetAIPrompt,
        snippetAISend: locale.i18n.snippetAISend,
        snippetAIStale: locale.i18n.snippetAIStale,
        snippetAllCategories: locale.i18n.snippetAllCategories,
        snippetAllSources: locale.i18n.snippetAllSources,
        snippetAllTypes: locale.i18n.snippetAllTypes,
        snippetBack: locale.i18n.snippetBack,
        snippetBuiltins: locale.i18n.snippetBuiltins,
        snippetBuiltinCodeDescription: locale.i18n.snippetBuiltinCodeDescription,
        snippetBuiltinCodeName: locale.i18n.snippetBuiltinCodeName,
        snippetBuiltinFocusDescription: locale.i18n.snippetBuiltinFocusDescription,
        snippetBuiltinFocusName: locale.i18n.snippetBuiltinFocusName,
        snippetBuiltinFontDescription: locale.i18n.snippetBuiltinFontDescription,
        snippetBuiltinFontName: locale.i18n.snippetBuiltinFontName,
        snippetBuiltinTableDescription: locale.i18n.snippetBuiltinTableDescription,
        snippetBuiltinTableName: locale.i18n.snippetBuiltinTableName,
        snippetBuiltinTypographyDescription: locale.i18n.snippetBuiltinTypographyDescription,
        snippetBuiltinTypographyName: locale.i18n.snippetBuiltinTypographyName,
        snippetCancelled: locale.i18n.snippetCancelled,
        snippetCategory: locale.i18n.snippetCategory,
        snippetCategoryCode: locale.i18n.snippetCategoryCode,
        snippetCategoryCustom: locale.i18n.snippetCategoryCustom,
        snippetCategoryFocus: locale.i18n.snippetCategoryFocus,
        snippetCategoryFont: locale.i18n.snippetCategoryFont,
        snippetCategoryTable: locale.i18n.snippetCategoryTable,
        snippetCategoryTypography: locale.i18n.snippetCategoryTypography,
        snippetChoose: locale.i18n.snippetChoose,
        snippetClose: locale.i18n.snippetClose,
        snippetCode: locale.i18n.snippetCode,
        snippetCompare: locale.i18n.snippetCompare,
        snippetConfirmDelete: locale.i18n.snippetConfirmDelete,
        snippetConfirmJS: locale.i18n.snippetConfirmJS,
        snippetConflict: locale.i18n.snippetConflict,
        snippetCSS: locale.i18n.snippetCSS,
        snippetDarkPreview: locale.i18n.snippetDarkPreview,
        snippetDelete: locale.i18n.snippetDelete,
        snippetDescription: locale.i18n.snippetDescription,
        snippetDisable: locale.i18n.snippetDisable,
        snippetDisabled: locale.i18n.snippetDisabled,
        snippetDiscard: locale.i18n.snippetDiscard,
        snippetDraft: locale.i18n.snippetDraft,
        snippetEnable: locale.i18n.snippetEnable,
        snippetEnabled: locale.i18n.snippetEnabled,
        snippetExperimental: locale.i18n.snippetExperimental,
        snippetExport: locale.i18n.snippetExport,
        snippetFailed: locale.i18n.snippetFailed,
        snippetImport: locale.i18n.snippetImport,
        snippetImported: locale.i18n.snippetImported,
        snippetInvalid: locale.i18n.snippetInvalid,
        snippetJS: locale.i18n.snippetJS,
        snippetJSPreviewUnavailable: locale.i18n.snippetJSPreviewUnavailable,
        snippetJSReload: locale.i18n.snippetJSReload,
        snippetLoaded: locale.i18n.snippetLoaded,
        snippetLoading: locale.i18n.snippetLoading,
        snippetMasterOff: locale.i18n.snippetMasterOff,
        snippetMine: locale.i18n.snippetMine,
        snippetMore: locale.i18n.snippetMore,
        snippetName: locale.i18n.snippetName,
        snippetNew: locale.i18n.snippetNew,
        snippetNoResults: locale.i18n.snippetNoResults,
        snippetPreview: locale.i18n.snippetPreview,
        snippetPreviewError: locale.i18n.snippetPreviewError,
        snippetPreviewHint: locale.i18n.snippetPreviewHint,
        snippetPreviewLang: locale.i18n.snippetPreviewLang,
        snippetRefresh: locale.i18n.snippetRefresh,
        snippetResetPreview: locale.i18n.snippetResetPreview,
        snippetRunJS: locale.i18n.snippetRunJS,
        snippetSample: locale.i18n.snippetSample,
        snippetSampleButton: locale.i18n.snippetSampleButton,
        snippetSampleCode: locale.i18n.snippetSampleCode,
        snippetSampleDraft: locale.i18n.snippetSampleDraft,
        snippetSampleItem: locale.i18n.snippetSampleItem,
        snippetSampleParagraph: locale.i18n.snippetSampleParagraph,
        snippetSampleProgress: locale.i18n.snippetSampleProgress,
        snippetSampleQuote: locale.i18n.snippetSampleQuote,
        snippetSampleReading: locale.i18n.snippetSampleReading,
        snippetSampleReady: locale.i18n.snippetSampleReady,
        snippetSampleSection: locale.i18n.snippetSampleSection,
        snippetSampleState: locale.i18n.snippetSampleState,
        snippetSampleTitle: locale.i18n.snippetSampleTitle,
        snippetSampleWriting: locale.i18n.snippetSampleWriting,
        snippetSave: locale.i18n.snippetSave,
        snippetSaveDisabled: locale.i18n.snippetSaveDisabled,
        snippetSaveFirst: locale.i18n.snippetSaveFirst,
        snippetSaved: locale.i18n.snippetSaved,
        snippetSearch: locale.i18n.snippetSearch,
        snippetSelect: locale.i18n.snippetSelect,
        snippetSource: locale.i18n.snippetSource,
        snippetStudioTitle: locale.i18n.snippetStudioTitle,
        snippetSubmission: locale.i18n.snippetSubmission,
        snippetSubmissionHint: locale.i18n.snippetSubmissionHint,
        snippetTimeout: locale.i18n.snippetTimeout,
        snippetTooLarge: locale.i18n.snippetTooLarge,
        snippetType: locale.i18n.snippetType,
        snippetUnavailable: locale.i18n.snippetUnavailable,
    };
    const t = (key) => translations[key] || key;
    let disposed = false;
    let busy = false;
    let loading = true;
    let loadFailed = false;
    let snippets = [];
    let draft = session.draft ? {...session.draft} : {id: "", name: "", type: "css", content: "", enabled: false};
    let baseline = session.baseline ? {...session.baseline} : null;
    let original = draft.content;
    let revision = 0;
    let aiGeneration = 0;
    let loadGeneration = 0;
    let previewTimer = 0;
    let dark = doc.documentElement.dataset.themeMode === "dark";
    let showOriginal = false;
    let candidate = null;
    let picker = null;
    let pickerRelease = () => {};
    let aiHistory = [];
    root.classList.add("sw-studio");
    const node = (tag, className = "", text = "") => {
        const element = doc.createElement(tag);
        element.className = className;
        if (text) element.textContent = text;
        return element;
    };
    const action = (key, callback, kind = "") => {
        const button = node("button", `sw-studio__button ${kind}`, t(key));
        button.type = "button";
        button.addEventListener("click", callback);
        return button;
    };
    const select = (key, choices) => {
        const input = node("select", "sw-studio__select");
        input.setAttribute("aria-label", t(key));
        for (const [value, label] of choices) input.appendChild(new win.Option(t(label), value));
        return input;
    };
    const header = node("header", "sw-studio__header");
    const heading = node("div");
    heading.append(node("strong", "sw-studio__title", t("snippetStudioTitle")), node("span", "sw-studio__badge", t("snippetExperimental")));
    header.append(heading, action("snippetBack", onBack));
    const layout = node("div", "sw-studio__layout");
    const main = node("main", "sw-studio__main");
    const previewSection = node("section", "sw-studio__preview-section");
    const previewToolbar = node("div", "sw-studio__section-bar");
    const compareButton = action("snippetCompare", () => { showOriginal = !showOriginal; compareButton.setAttribute("aria-pressed", String(showOriginal)); renderPreview(); });
    compareButton.setAttribute("aria-pressed", "false");
    const themeButton = action("snippetDarkPreview", () => { dark = !dark; themeButton.setAttribute("aria-pressed", String(dark)); renderPreview(); });
    themeButton.setAttribute("aria-pressed", String(dark));
    const runButton = action("snippetRunJS", () => { status.textContent = t("snippetJSPreviewUnavailable"); });
    runButton.disabled = true;
    const stopButton = action("snippetResetPreview", () => renderPreview(false));
    previewToolbar.append(node("strong", "", t("snippetPreview")), compareButton, themeButton, runButton, stopButton);
    const previewContainer = node("div", "sw-studio__preview");
    const previewHint = node("p", "sw-studio__hint", t("snippetPreviewHint"));
    previewSection.append(previewToolbar, previewContainer, previewHint);
    const lower = node("div", "sw-studio__lower");
    const details = node("section", "sw-studio__details");
    const description = node("p", "sw-studio__description", t("snippetDescription"));
    const nameLabel = node("label", "sw-studio__field", t("snippetName"));
    const nameInput = node("input", "sw-studio__input");
    nameInput.maxLength = 120;
    nameInput.setAttribute("aria-label", t("snippetName"));
    nameLabel.appendChild(nameInput);
    const typeSelect = select("snippetType", [["css", "snippetCSS"], ["js", "snippetJS"]]);
    const state = node("div", "sw-studio__state");
    const saveButton = action("snippetSaveDisabled", () => void mutate("save"), "is-primary");
    const toggleButton = action("snippetEnable", () => void mutate("toggle"));
    const deleteButton = action("snippetDelete", () => void mutate("delete"));
    const exportButton = action("snippetExport", () => download(`${draft.name || "snippet"}.${draft.type}`, draft.content, "text/plain"));
    const submissionButton = action("snippetSubmission", () => {
        const packet = {schemaVersion: 1, status: "unreviewed", name: draft.name, type: draft.type, content: draft.content, description: "", author: "", license: "", testedWith: "", effects: [], enabled: false};
        download("snippet-submission.json", JSON.stringify(packet, null, 2), "application/json");
        status.textContent = t("snippetSubmissionHint");
    });
    const commands = node("div", "sw-studio__commands");
    commands.append(saveButton, toggleButton, deleteButton, exportButton, submissionButton);
    details.append(node("strong", "", t("snippetAbout")), description, nameLabel, typeSelect, state, commands);
    const editorSection = node("section", "sw-studio__editor-section");
    const editorBar = node("div", "sw-studio__section-bar");
    const chooseButton = action("snippetChoose", () => openPicker());
    const importButton = action("snippetImport", () => fileInput.click());
    const newButton = action("snippetNew", () => { if (canDiscard()) choose({name: "", type: "css", content: ""}, null); });
    editorBar.append(chooseButton, importButton, newButton);
    const editor = node("textarea", "sw-studio__editor");
    editor.spellcheck = false;
    editor.setAttribute("aria-label", t("snippetCode"));
    editor.setAttribute("autocapitalize", "off");
    const fileInput = node("input");
    fileInput.type = "file";
    fileInput.accept = ".css,.js";
    fileInput.hidden = true;
    editorSection.append(editorBar, editor, fileInput);
    lower.append(details, editorSection);
    main.append(previewSection, lower);
    const aside = node("aside", "sw-studio__ai");
    aside.setAttribute("aria-label", t("snippetAI"));
    const aiNote = node("p", "sw-studio__hint", t("snippetAIHint"));
    const modeSelect = select("snippetAIMode", [["generate", "snippetAIGenerate"], ["optimize", "snippetAIOptimize"], ["explain", "snippetAIExplain"], ["iterate", "snippetAIIterate"]]);
    const prompt = node("textarea", "sw-studio__prompt");
    prompt.maxLength = 4000;
    prompt.placeholder = t("snippetAIPrompt");
    prompt.setAttribute("aria-label", t("snippetAIPrompt"));
    const aiConsent = node("label", "sw-studio__consent");
    const aiConsentInput = node("input");
    aiConsentInput.type = "checkbox";
    aiConsent.append(aiConsentInput, doc.createTextNode(t("snippetAIConsent")));
    const aiButton = action("snippetAISend", () => void generate());
    const cancelAIButton = action("snippetAICancel", () => { aiGeneration += 1; ai.cancel(); aiButton.disabled = !aiConsentInput.checked; aiStatus.textContent = t("snippetCancelled"); cancelAIButton.disabled = true; });
    cancelAIButton.disabled = true;
    aiButton.disabled = true;
    aiConsentInput.addEventListener("change", () => { if (cancelAIButton.disabled) aiButton.disabled = !aiConsentInput.checked; });
    const aiStatus = node("p", "sw-studio__hint", t("snippetAIIdle"));
    aiStatus.setAttribute("role", "status");
    const aiResult = node("textarea", "sw-studio__ai-result");
    aiResult.readOnly = true;
    aiResult.setAttribute("aria-label", t("snippetAICandidate"));
    aiResult.hidden = true;
    const acceptButton = action("snippetAIAccept", () => {
        if (!candidate || candidate.mode === "explain" || busy) return;
        if (candidate.revision !== revision && !win.confirm(t("snippetAIStale"))) return;
        draft.content = candidate.content;
        draft.type = candidate.type;
        revision += 1;
        candidate = null;
        acceptButton.disabled = true;
        syncFields();
        renderPreview();
        status.textContent = t("snippetAIAccepted");
    }, "is-primary");
    acceptButton.disabled = true;
    modeSelect.addEventListener("change", () => {
        const explanation = modeSelect.value === "explain";
        acceptButton.hidden = explanation;
        if (explanation) acceptButton.disabled = true;
        else if (candidate?.mode !== "explain") acceptButton.disabled = !candidate;
    });
    aside.append(node("strong", "sw-studio__ai-title", t("snippetAI")), aiNote, modeSelect, prompt, aiConsent, aiButton, cancelAIButton, aiStatus, aiResult, acceptButton);
    layout.append(main, aside);
    const status = node("footer", "sw-studio__status", t("snippetLoading"));
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const refresh = action("snippetRefresh", () => { if (canDiscard()) void load(true); });
    const footer = node("div", "sw-studio__footer");
    footer.append(status, refresh);
    root.replaceChildren(header, layout, footer);
    const preview = createSnippetPreview(previewContainer, {
        title: t("snippetPreview"),
        labels: {lang: t("snippetPreviewLang"), sample: t("snippetSample"), title: t("snippetSampleTitle"), paragraph: t("snippetSampleParagraph"), quote: t("snippetSampleQuote"), section: t("snippetSampleSection"), codeLabel: t("snippetSampleCode"), item: t("snippetSampleItem"), state: t("snippetSampleState"), progress: t("snippetSampleProgress"), reading: t("snippetSampleReading"), ready: t("snippetSampleReady"), writing: t("snippetSampleWriting"), draft: t("snippetSampleDraft"), button: t("snippetSampleButton")},
        onError: (message) => { if (!disposed) status.textContent = `${t("snippetPreviewError")} ${message}`; },
    });
    const errorText = (error) => {
        const code = String(error?.message || error?.code || "");
        if (/conflict|changed|missing|duplicate/i.test(code)) return t("snippetConflict");
        if (/unsupported|unavailable|404/i.test(code)) return t("snippetUnavailable");
        if (/cancel|abort|disposed/i.test(code)) return t("snippetCancelled");
        if (/timeout/i.test(code)) return t("snippetTimeout");
        if (/size|large|limit/i.test(code)) return t("snippetTooLarge");
        if (/invalid|malformed|truncat/i.test(code)) return t("snippetInvalid");
        return t("snippetFailed");
    };
    function syncFields() {
        nameInput.value = draft.name;
        typeSelect.value = draft.type;
        editor.value = draft.content;
        session.draft = {...draft};
        session.baseline = baseline ? {...baseline} : null;
        runButton.hidden = draft.type !== "js";
        // A synchronous user script can freeze the host WebView even inside a
        // sandboxed iframe. Keep JS preview visible as a planned affordance,
        // but do not execute it until a terminable worker-based runner exists.
        runButton.disabled = true;
        typeSelect.disabled = Boolean(baseline) || busy;
        saveButton.textContent = t(baseline ? "snippetSave" : "snippetSaveDisabled");
        toggleButton.textContent = t(baseline?.enabled ? "snippetDisable" : "snippetEnable");
        state.textContent = t(baseline ? baseline.enabled ? "snippetEnabled" : "snippetDisabled" : "snippetDraft");
        const masterEnabled = getConfig()?.snippet?.[draft.type === "css" ? "enabledCSS" : "enabledJS"] === true;
        if (!masterEnabled) state.textContent += ` · ${t("snippetMasterOff")}`;
        saveButton.disabled = busy || loading || loadFailed || !draft.name.trim() || !draft.content.trim();
        toggleButton.disabled = busy || loading || loadFailed || !baseline;
        deleteButton.disabled = busy || loading || loadFailed || !baseline;
        exportButton.disabled = !draft.content;
        submissionButton.disabled = !draft.content;
        chooseButton.disabled = busy;
        importButton.disabled = busy;
        newButton.disabled = busy;
        refresh.disabled = busy || loading;
        nameInput.disabled = busy;
        editor.disabled = busy;
    }
    function renderPreview(runJS = false) {
        clearTimeout(previewTimer);
        if (disposed) return;
        const content = showOriginal ? original : draft.content;
        if (new TextEncoder().encode(content).byteLength > SNIPPET_CODE_MAX) { status.textContent = t("snippetTooLarge"); return; }
        // Compare uses the selected saved code, not a second unscoped host style.
        preview.render({type: draft.type, content, dark, runJS: !showOriginal && runJS});
    }
    function changed() {
        revision += 1;
        draft = {...draft, name: nameInput.value, type: typeSelect.value, content: editor.value};
        syncFields();
        clearTimeout(previewTimer);
        previewTimer = win.setTimeout(() => renderPreview(), 250);
    }
    nameInput.addEventListener("input", changed);
    typeSelect.addEventListener("change", changed);
    editor.addEventListener("input", changed);
    const dirty = () => baseline ? draft.name !== baseline.name || draft.type !== baseline.type || draft.content !== baseline.content : Boolean(draft.name || draft.content);
    const canDiscard = () => !busy && (!dirty() || win.confirm(t("snippetDiscard")));
    function choose(value, native) {
        aiGeneration += 1;
        ai.cancel();
        aiButton.disabled = !aiConsentInput.checked;
        cancelAIButton.disabled = true;
        candidate = null;
        aiHistory = [];
        acceptButton.disabled = true;
        acceptButton.hidden = modeSelect.value === "explain";
        aiResult.hidden = true;
        baseline = native ? {...native} : null;
        draft = {id: native?.id || "", name: value.name || "", type: value.type || "css", content: value.content || "", enabled: native?.enabled === true};
        original = native?.content || "";
        description.textContent = value.description || t("snippetDescription");
        revision += 1;
        showOriginal = false;
        compareButton.setAttribute("aria-pressed", "false");
        syncFields();
        renderPreview();
    }
    async function load(reselect = false) {
        const requestGeneration = ++loadGeneration;
        loading = true;
        syncFields();
        try {
            const result = await store.read();
            if (disposed || requestGeneration !== loadGeneration) return;
            snippets = result;
            loadFailed = false;
            if (reselect && baseline) {
                const current = snippets.find((item) => item.id === baseline.id);
                choose(current || {name: "", type: "css", content: ""}, current || null);
            }
            status.textContent = `${t("snippetLoaded")} ${snippets.length}`;
        } catch (error) {
            if (disposed || requestGeneration !== loadGeneration) return;
            loadFailed = true;
            status.textContent = errorText(error);
        } finally {
            if (requestGeneration === loadGeneration) {
                loading = false;
                if (!disposed) syncFields();
            }
        }
    }
    function newId() {
        const now = new Date();
        const pad = (value) => String(value).padStart(2, "0");
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const bytes = new Uint8Array(7);
        win.crypto.getRandomValues(bytes);
        return `${stamp}-${Array.from(bytes, (byte) => (byte % 36).toString(36)).join("")}`;
    }
    async function mutate(actionName) {
        if (busy || loading || loadFailed || disposed) return;
        if (actionName === "delete" && !win.confirm(t("snippetConfirmDelete"))) return;
        if (actionName === "toggle" && dirty()) { status.textContent = t("snippetSaveFirst"); return; }
        if (draft.type === "js" && (actionName === "toggle" && !baseline?.enabled || actionName === "save" && baseline?.enabled)) {
            if (!win.confirm(t("snippetConfirmJS"))) return;
        }
        busy = true;
        syncFields();
        const previous = baseline ? {...baseline} : null;
        const input = {...draft, id: baseline?.id || newId(), enabled: actionName === "toggle" ? !baseline?.enabled : baseline?.enabled === true};
        try {
            const next = await store.mutate(previous, actionName, input);
            if (disposed) return;
            snippets = next;
            const saved = next.find((item) => item.id === input.id) || null;
            choose(saved || {name: "", type: "css", content: ""}, saved);
            status.textContent = t(input.type === "js" ? "snippetJSReload" : "snippetSaved");
        } catch (error) { if (!disposed) status.textContent = errorText(error); }
        finally { busy = false; if (!disposed) syncFields(); }
    }
    function download(filename, content, type) {
        const url = win.URL.createObjectURL(new Blob([content], {type: `${type};charset=utf-8`}));
        const anchor = node("a");
        anchor.href = url;
        anchor.download = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 150);
        doc.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
    }
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file || !canDiscard()) return;
        try {
            if (file.size > SNIPPET_CODE_MAX) throw new Error("size_limit");
            const imported = parseSnippetImport(file.name, await file.text());
            if (disposed) return;
            choose(imported, null);
            status.textContent = t("snippetImported");
        } catch (error) { if (!disposed) status.textContent = errorText(error); }
    });
    async function generate() {
        if (!aiConsentInput.checked || !prompt.value.trim() || disposed) return;
        const generation = ++aiGeneration;
        const startedRevision = revision;
        const captured = {...draft};
        const mode = modeSelect.value;
        const instruction = prompt.value.trim();
        const sourceContent = mode === "iterate" && candidate?.mode !== "explain" && candidate?.type === captured.type
            ? candidate.content : captured.content;
        const history = mode === "iterate" ? aiHistory.slice(-6).map((item) => ({...item})) : [];
        candidate = null;
        acceptButton.disabled = true;
        acceptButton.hidden = mode === "explain";
        aiButton.disabled = true;
        cancelAIButton.disabled = false;
        aiResult.hidden = false;
        aiResult.value = "";
        aiStatus.textContent = t("snippetAIGenerating");
        try {
            const result = await ai.generate({type: captured.type, content: sourceContent, instruction, mode, history,
                onToken: (token) => { if (!disposed && generation === aiGeneration) aiResult.value += token; },
            });
            if (disposed || generation !== aiGeneration) return;
            candidate = {...result, mode, revision: startedRevision};
            aiResult.value = result.content;
            aiHistory = [...history, {role: "user", content: instruction}, {role: "assistant", content: result.content}].slice(-8);
            acceptButton.disabled = mode === "explain";
            aiStatus.textContent = t("snippetAIDone");
        } catch (error) { if (!disposed && generation === aiGeneration) aiStatus.textContent = errorText(error); }
        finally { if (!disposed && generation === aiGeneration) { aiButton.disabled = !aiConsentInput.checked; cancelAIButton.disabled = true; } }
    }
    function closePicker() {
        pickerRelease();
        pickerRelease = () => {};
        picker?.remove();
        picker = null;
        // At phone widths the workbench is a vertical scroller. Restoring
        // focus must not scroll the hidden editor into view underneath the
        // picker that just closed.
        chooseButton.focus({preventScroll: true});
    }
    function openPicker() {
        if (picker || busy) return;
        picker = node("div", "sw-studio__picker");
        picker.setAttribute("role", "dialog");
        picker.setAttribute("aria-modal", "true");
        picker.setAttribute("aria-label", t("snippetChoose"));
        const sheet = node("section", "sw-studio__picker-sheet");
        const head = node("div", "sw-studio__section-bar");
        head.append(node("strong", "", t("snippetChoose")), action("snippetClose", closePicker));
        const filters = node("div", "sw-studio__filters");
        const query = node("input", "sw-studio__input");
        query.placeholder = t("snippetSearch");
        query.setAttribute("aria-label", t("snippetSearch"));
        const source = select("snippetSource", [["", "snippetAllSources"], ["builtin", "snippetBuiltins"], ["native", "snippetMine"]]);
        const language = select("snippetType", [["", "snippetAllTypes"], ["css", "snippetCSS"], ["js", "snippetJS"]]);
        const category = select("snippetCategory", [["", "snippetAllCategories"], ["typography", "snippetCategoryTypography"], ["table", "snippetCategoryTable"], ["focus", "snippetCategoryFocus"], ["code", "snippetCategoryCode"], ["font", "snippetCategoryFont"], ["custom", "snippetCategoryCustom"]]);
        filters.append(query, source, language, category);
        const list = node("div", "sw-studio__catalog");
        const more = action("snippetMore", () => { limit += 40; render(); });
        let limit = 40;
        const render = () => {
            const builtin = BUILTIN_SNIPPETS.map((item) => ({...item, name: t(item.nameKey), description: t(item.descriptionKey)}));
            const native = snippets.map((item) => ({...item, source: "native", category: "custom"}));
            const found = filterSnippetCatalog([...builtin, ...native], {query: query.value, type: language.value, category: category.value, source: source.value});
            list.replaceChildren();
            if (!found.length) list.append(node("p", "sw-studio__hint", t("snippetNoResults")));
            for (const item of found.slice(0, limit)) {
                const button = action("snippetSelect", () => {
                    if (!canDiscard()) return;
                    choose(item, item.source === "native" ? snippets.find((entry) => entry.id === item.id) : null);
                    closePicker();
                });
                button.className = "sw-studio__catalog-item";
                button.replaceChildren(node("span", "sw-studio__catalog-kind", item.type.toUpperCase()), node("strong", "", item.name), node("span", "sw-studio__hint", item.description || t("snippetDescription")), node("span", "sw-studio__tag", t(item.source === "builtin" ? "snippetBuiltins" : item.enabled ? "snippetEnabled" : "snippetDisabled")));
                list.appendChild(button);
            }
            more.hidden = found.length <= limit;
        };
        [query, source, language, category].forEach((input) => input.addEventListener("input", () => { limit = 40; render(); }));
        sheet.append(head, filters, list, more);
        picker.appendChild(sheet);
        root.appendChild(picker);
        const keydown = (event) => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePicker(); }
            if (event.key === "Tab") {
                const controls = Array.from(sheet.querySelectorAll("button, input, select")).filter((el) => !el.hidden && !el.disabled);
                const first = controls[0]; const last = controls[controls.length - 1];
                if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        // The host also listens for Escape. Capture while the nested selector is open.
        doc.addEventListener("keydown", keydown, true);
        pickerRelease = () => doc.removeEventListener("keydown", keydown, true);
        render(); query.focus();
    }
    syncFields();
    renderPreview();
    const ready = load();
    return {
        ready,
        canClose: canDiscard,
        dispose() {
            disposed = true;
            aiGeneration += 1;
            session.draft = {...draft};
            session.baseline = baseline ? {...baseline} : null;
            clearTimeout(previewTimer);
            pickerRelease();
            preview.dispose();
            ai.dispose();
            store.dispose();
            root.replaceChildren();
        },
    };
}

module.exports = {mountSnippetStudio};
