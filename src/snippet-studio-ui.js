const {Dialog} = require("siyuan");
const {BUILTIN_SNIPPETS, SNIPPET_CODE_MAX, parseSnippetImport, filterSnippetCatalog, buildUsercssHeader, hasUsercssHeader, createLeaveIntentCoordinator} = require("./snippet-studio-model.js");
const {buildSnippetDiff, summarizeDiff, applyDiffHunks} = require("./snippet-diff.js");
const {lintSnippet} = require("./snippet-lint.js");
const {createSnippetStore} = require("./snippet-studio-host.js");
const {createSnippetPreview} = require("./snippet-studio-preview.js");
const {createSnippetAIClient} = require("./snippet-studio-ai.js");

/** Experimental singleton view; native snippets remain the only saved copy. */
function mountSnippetStudio(root, {i18n = {}, getConfig = () => ({}), store = createSnippetStore({getSnippetSettings: () => getConfig()?.snippet}), ai = createSnippetAIClient(), session = {draft: null, baseline: null}, platform = null, onBack = () => {}, objectId = ""} = {}) {
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
        snippetAIDiscarded: locale.i18n.snippetAIDiscarded,
        snippetAIExplain: locale.i18n.snippetAIExplain,
        snippetAIGenerate: locale.i18n.snippetAIGenerate,
        snippetAIGenerating: locale.i18n.snippetAIGenerating,
        snippetAIHint: locale.i18n.snippetAIHint,
        snippetAIIdle: locale.i18n.snippetAIIdle,
        snippetAIReady: locale.i18n.snippetAIReady,
        snippetAIConsentRequired: locale.i18n.snippetAIConsentRequired,
        snippetAIGenerateHint: locale.i18n.snippetAIGenerateHint,
        snippetAIOptimizeHint: locale.i18n.snippetAIOptimizeHint,
        snippetAIExplainHint: locale.i18n.snippetAIExplainHint,
        snippetAIIterateHint: locale.i18n.snippetAIIterateHint,
        snippetAIResultHint: locale.i18n.snippetAIResultHint,
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
        snippetCapabilities: locale.i18n.snippetCapabilities,
        snippetCapabilityAI: locale.i18n.snippetCapabilityAI,
        snippetCapabilityCSS: locale.i18n.snippetCapabilityCSS,
        snippetCapabilityJS: locale.i18n.snippetCapabilityJS,
        snippetCapabilityScope: locale.i18n.snippetCapabilityScope,
        snippetCapabilityStorage: locale.i18n.snippetCapabilityStorage,
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
        snippetBytes: locale.i18n.snippetBytes,
        snippetCompare: locale.i18n.snippetCompare,
        snippetCompareUnavailable: locale.i18n.snippetCompareUnavailable,
        snippetConfirmDelete: locale.i18n.snippetConfirmDelete,
        snippetConfirmJS: locale.i18n.snippetConfirmJS,
        snippetConflict: locale.i18n.snippetConflict,
        snippetCSS: locale.i18n.snippetCSS,
        snippetDarkPreview: locale.i18n.snippetDarkPreview,
        snippetDelete: locale.i18n.snippetDelete,
        snippetDescription: locale.i18n.snippetDescription,
        snippetDiffDegraded: locale.i18n.snippetDiffDegraded,
        snippetDiffFindings: locale.i18n.snippetDiffFindings,
        snippetDiffHunkToggle: locale.i18n.snippetDiffHunkToggle,
        snippetDiffMore: locale.i18n.snippetDiffMore,
        snippetDiffRoundBase: locale.i18n.snippetDiffRoundBase,
        snippetDiffSummary: locale.i18n.snippetDiffSummary,
        snippetDisable: locale.i18n.snippetDisable,
        snippetDisabled: locale.i18n.snippetDisabled,
        snippetDiscard: locale.i18n.snippetDiscard,
        snippetLeaveTitle: locale.i18n.snippetLeaveTitle,
        snippetLeaveMessage: locale.i18n.snippetLeaveMessage,
        snippetLeaveSave: locale.i18n.snippetLeaveSave,
        snippetLeaveDiscard: locale.i18n.snippetLeaveDiscard,
        snippetLeaveSaveFailed: locale.i18n.snippetLeaveSaveFailed,
        snippetDraft: locale.i18n.snippetDraft,
        snippetUnsaved: locale.i18n.snippetUnsaved,
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
        snippetPreviewLoading: locale.i18n.snippetPreviewLoading,
        snippetPreviewReady: locale.i18n.snippetPreviewReady,
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
        snippetLines: locale.i18n.snippetLines,
        snippetTimeout: locale.i18n.snippetTimeout,
        snippetTooLarge: locale.i18n.snippetTooLarge,
        snippetType: locale.i18n.snippetType,
        snippetTypeLocked: locale.i18n.snippetTypeLocked,
        snippetUnavailable: locale.i18n.snippetUnavailable,
        snippetUsercssVars: locale.i18n.snippetUsercssVars,
    };
    const t = (key) => translations[key] || key;
    let disposed = false;
    let busy = false;
    let loading = true;
    let loadFailed = false;
    let snippets = [];
    let draft = session.draft ? {...session.draft} : {id: "", name: "", type: "css", content: "", enabled: false};
    let baseline = session.baseline ? {...session.baseline} : null;
    let selectedSource = baseline ? "native" : "draft";
    let original = draft.content;
    let revision = 0;
    let aiGeneration = 0;
    let loadGeneration = 0;
    let previewTimer = 0;
    let dark = doc.documentElement.dataset.themeMode === "dark";
    let showOriginal = false;
    let candidate = null;
    let activeDiff = null;
    let activeHunkAccepted = [];
    let picker = null;
    let pickerRelease = () => {};
    let pickerScrollTop = {root: 0, layout: 0};
    let aiHistory = [];
    root.classList.add("sw-studio", "sw-platform-surface", "sw-platform-surface--studio");
    root.dataset.swSurface = "studio";
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
    const heading = node("div", "sw-studio__header-copy");
    const titleLine = node("div", "sw-studio__header-title-line");
    titleLine.append(node("strong", "sw-studio__title", t("snippetStudioTitle")), node("span", "sw-studio__badge", t("snippetExperimental")));
    const headerContext = node("span", "sw-studio__header-context");
    const headerState = node("span", "sw-studio__state-badge");
    headerState.setAttribute("role", "status");
    headerState.setAttribute("aria-live", "polite");
    headerState.setAttribute("aria-atomic", "true");
    heading.append(titleLine, headerContext);
    const headerActions = node("div", "sw-studio__header-actions");
    const backButton = action("snippetBack", onBack);
    headerActions.append(headerState, backButton);
    header.append(heading, headerActions);
    const layout = node("div", "sw-studio__layout");
    const main = node("main", "sw-studio__main");
    const previewSection = node("section", "sw-studio__preview-section");
    const previewToolbar = node("div", "sw-studio__section-bar");
    const previewLead = node("div", "sw-studio__section-lead");
    const previewTitle = node("h2", "sw-studio__section-title", t("snippetPreview"));
    const previewType = node("span", "sw-studio__tag");
    const previewState = node("span", "sw-studio__state-badge is-loading", t("snippetPreviewLoading"));
    previewLead.append(previewTitle, previewType, previewState);
    const compareButton = action("snippetCompare", () => { showOriginal = !showOriginal; compareButton.setAttribute("aria-pressed", String(showOriginal)); renderPreview(); });
    compareButton.setAttribute("aria-pressed", "false");
    const themeButton = action("snippetDarkPreview", () => { dark = !dark; themeButton.setAttribute("aria-pressed", String(dark)); renderPreview(); });
    themeButton.setAttribute("aria-pressed", String(dark));
    const runButton = action("snippetRunJS", () => { setStatus(t("snippetJSPreviewUnavailable"), "blocked"); });
    runButton.disabled = true;
    const stopButton = action("snippetResetPreview", () => renderPreview(false));
    runButton.title = t("snippetJSPreviewUnavailable");
    previewToolbar.append(previewLead, compareButton, themeButton, runButton, stopButton);
    const previewShell = node("div", "sw-studio__preview");
    const previewContainer = node("div", "sw-studio__preview-canvas");
    const previewLoading = node("div", "sw-studio__preview-loading");
    previewLoading.append(node("span", "sw-studio__spinner"), node("span", "", t("snippetPreviewLoading")));
    previewShell.append(previewContainer, previewLoading);
    const previewHint = node("p", "sw-studio__hint", t("snippetPreviewHint"));
    previewSection.append(previewToolbar, previewShell, previewHint);
    const lower = node("div", "sw-studio__lower");
    const details = node("section", "sw-studio__details");
    const detailsTitle = node("h2", "sw-studio__section-title", t("snippetAbout"));
    const selection = node("div", "sw-studio__selection");
    const selectionTop = node("div", "sw-studio__selection-top");
    const selectionName = node("strong", "sw-studio__selection-name");
    const selectionType = node("span", "sw-studio__catalog-kind");
    const selectionStatus = node("span", "sw-studio__state-badge");
    const selectionMeta = node("span", "sw-studio__selection-meta");
    selectionTop.append(selectionName, selectionType, selectionStatus);
    selection.append(selectionTop, selectionMeta);
    const description = node("p", "sw-studio__description", t("snippetDescription"));
    // T-6908：三条安全边界必须始终可见，而不是散落在按钮 title 或选中 JS 后才出现的提示里。
    const capabilities = node("ul", "sw-studio__capabilities");
    capabilities.setAttribute("aria-label", t("snippetCapabilities"));
    for (const [capability, label] of [["css", "snippetCapabilityCSS"], ["js", "snippetCapabilityJS"], ["ai", "snippetCapabilityAI"], ["scope", "snippetCapabilityScope"], ["storage", "snippetCapabilityStorage"]]) {
        const item = node("li", "sw-studio__capability", t(label));
        item.dataset.capability = capability;
        capabilities.appendChild(item);
    }
    const nameLabel = node("label", "sw-studio__field", t("snippetName"));
    const nameInput = node("input", "sw-studio__input");
    nameInput.maxLength = 120;
    nameInput.setAttribute("aria-label", t("snippetName"));
    nameLabel.appendChild(nameInput);
    const typeSelect = select("snippetType", [["css", "snippetCSS"], ["js", "snippetJS"]]);
    const typeNote = node("p", "sw-studio__hint", t("snippetTypeLocked"));
    typeNote.hidden = true;
    const state = node("div", "sw-studio__state");
    const saveButton = action("snippetSaveDisabled", () => void mutate("save"), "is-primary");
    const toggleButton = action("snippetEnable", () => void mutate("toggle"), "is-secondary");
    const deleteButton = action("snippetDelete", () => void mutate("delete"), "is-danger");
    const exportButton = action("snippetExport", () => {
        // T-6912/T-6923：CSS 导出加 usercss 互通头（Stylus 可直接安装）；
        // 已带变量头的样式不叠加第二份头。JS 导出保持原样。
        const needsHeader = draft.type === "css" && !hasUsercssHeader(draft.content);
        const payload = needsHeader ? `${buildUsercssHeader(draft.name)}\n\n${draft.content}` : draft.content;
        download(`${draft.name || "snippet"}.${draft.type}`, payload, "text/plain");
    }, "is-quiet");
    const submissionButton = action("snippetSubmission", () => {
        const packet = {schemaVersion: 1, status: "unreviewed", name: draft.name, type: draft.type, content: draft.content, description: "", author: "", license: "", testedWith: "", effects: [], enabled: false};
        download("snippet-submission.json", JSON.stringify(packet, null, 2), "application/json");
        setStatus(t("snippetSubmissionHint"), "ready");
    }, "is-quiet");
    const commands = node("div", "sw-studio__commands");
    commands.append(toggleButton, deleteButton, exportButton, submissionButton);
    details.append(detailsTitle, selection, nameLabel, typeSelect, typeNote, state, commands, description, capabilities);
    const editorSection = node("section", "sw-studio__editor-section");
    const editorBar = node("div", "sw-studio__section-bar");
    const editorLead = node("div", "sw-studio__section-lead");
    const editorTitle = node("h2", "sw-studio__section-title", t("snippetCode"));
    const editorMeta = node("span", "sw-studio__editor-meta");
    editorLead.append(editorTitle, editorMeta);
    const chooseButton = action("snippetChoose", () => openPicker());
    const importButton = action("snippetImport", () => fileInput.click());
    const newButton = action("snippetNew", () => { guardLeave(() => choose({name: "", type: "css", content: ""}, null)); });
    editorBar.append(editorLead, chooseButton, importButton, newButton);
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
    const aiHeader = node("div", "sw-studio__ai-header");
    const aiTitle = node("h2", "sw-studio__ai-title", t("snippetAI"));
    const aiProvider = node("span", "sw-studio__state-badge", t("snippetAIIdle"));
    aiHeader.append(aiTitle, aiProvider);
    const aiNote = node("p", "sw-studio__hint", t("snippetAIHint"));
    const modeSelect = select("snippetAIMode", [["generate", "snippetAIGenerate"], ["optimize", "snippetAIOptimize"], ["explain", "snippetAIExplain"], ["iterate", "snippetAIIterate"]]);
    const modeField = node("label", "sw-studio__ai-field", t("snippetAIMode"));
    modeField.appendChild(modeSelect);
    const modeHint = node("p", "sw-studio__hint sw-studio__ai-mode-hint", t("snippetAIGenerateHint"));
    const prompt = node("textarea", "sw-studio__prompt");
    prompt.maxLength = 4000;
    prompt.placeholder = t("snippetAIPrompt");
    prompt.setAttribute("aria-label", t("snippetAIPrompt"));
    const aiConsent = node("label", "sw-studio__consent");
    const aiConsentInput = node("input");
    aiConsentInput.type = "checkbox";
    aiConsent.append(aiConsentInput, doc.createTextNode(t("snippetAIConsent")));
    const aiActions = node("div", "sw-studio__ai-actions");
    const aiButton = action("snippetAISend", () => void generate(), "is-primary");
    const cancelAIButton = action("snippetAICancel", () => { aiGeneration += 1; ai.cancel(); setAIStatus(t("snippetCancelled")); updateAIActions(); cancelAIButton.disabled = true; });
    cancelAIButton.disabled = true;
    aiButton.disabled = true;
    aiActions.append(aiButton, cancelAIButton);
    const aiStatus = node("p", "sw-studio__hint", t("snippetAIIdle"));
    aiStatus.setAttribute("role", "status");
    aiStatus.setAttribute("aria-live", "polite");
    aiStatus.setAttribute("aria-atomic", "true");
    const aiResultPanel = node("div", "sw-studio__ai-result-panel");
    const aiResultHeader = node("div", "sw-studio__ai-result-header");
    const aiResultTitle = node("strong", "", t("snippetAICandidate"));
    const aiResultMeta = node("span", "sw-studio__editor-meta");
    aiResultHeader.append(aiResultTitle, aiResultMeta);
    aiResultHeader.hidden = true;
    const aiEmpty = node("div", "sw-studio__ai-empty", t("snippetAIResultHint"));
    const aiResult = node("textarea", "sw-studio__ai-result");
    aiResult.readOnly = true;
    aiResult.setAttribute("aria-label", t("snippetAICandidate"));
    aiResult.hidden = true;
    // T-6915（ADR 0083 D1）：代码候选以"本地摘要 + 行级 diff"呈现；explain 保持纯文本。
    const aiDiffSummary = node("p", "sw-studio__hint sw-studio__diff-summary");
    aiDiffSummary.hidden = true;
    const aiDiffScroll = node("div", "sw-studio__diff-scroll");
    const aiDiffNote = node("p", "sw-studio__hint sw-studio__diff-note");
    aiDiffNote.hidden = true;
    const aiDiffPanel = node("div", "sw-studio__diff");
    aiDiffPanel.append(aiDiffScroll, aiDiffNote);
    aiDiffPanel.hidden = true;
    aiResultPanel.append(aiResultHeader, aiDiffSummary, aiEmpty, aiResult, aiDiffPanel);
    const acceptButton = action("snippetAIAccept", () => {
        if (!candidate || candidate.mode === "explain" || busy) return;
        if (candidate.revision !== revision && !win.confirm(t("snippetAIStale"))) return;
        let applied = candidate.content;
        if (activeDiff && !activeDiff.degraded) {
            const anyAccepted = activeHunkAccepted.some(Boolean);
            if (!anyAccepted) {
                // 全部 ✗ = 放弃候选（ADR 0083 §6）；草稿保持不变。
                candidate = null;
                activeDiff = null;
                acceptButton.disabled = true;
                aiResultHeader.hidden = true;
                aiResult.hidden = true;
                aiEmpty.hidden = false;
                hideAIDiffPanel();
                setAIStatus(t("snippetAIDiscarded"));
                return;
            }
            if (!activeHunkAccepted.every(Boolean)) {
                // 部分应用经行级合并（片段内容统一为 \n 行尾）。
                applied = applyDiffHunks(activeDiff, activeHunkAccepted);
            }
        }
        draft.content = applied;
        draft.type = candidate.type;
        revision += 1;
        candidate = null;
        activeDiff = null;
        acceptButton.disabled = true;
        hideAIDiffPanel();
        aiResultHeader.hidden = true;
        aiResult.hidden = true;
        aiEmpty.hidden = false;
        syncFields();
        renderPreview();
        setStatus(t("snippetAIAccepted"), "ready");
    }, "is-primary");
    acceptButton.disabled = true;
    const modeHints = {
        generate: "snippetAIGenerateHint",
        optimize: "snippetAIOptimizeHint",
        explain: "snippetAIExplainHint",
        iterate: "snippetAIIterateHint",
    };
    // 渲染行数上限：diff 模型已在 1200 行/侧降级，此处再防极端 hunk 铺满面板。
    const DIFF_RENDER_ROW_MAX = 1500;
    const hideAIDiffPanel = () => {
        aiDiffPanel.hidden = true;
        aiDiffSummary.hidden = true;
        aiDiffNote.hidden = true;
        aiDiffScroll.replaceChildren();
    };
    function renderAIDiff(baselineText, relativeToRound = false) {
        if (!candidate || candidate.mode === "explain") {
            hideAIDiffPanel();
            return;
        }
        const diff = buildSnippetDiff(baselineText, candidate.content);
        const lint = lintSnippet(candidate.type, candidate.content);
        activeDiff = diff;
        activeHunkAccepted = diff.hunks.map(() => true);
        const summary = summarizeDiff(baselineText, candidate.content, diff);
        let summaryText = relativeToRound ? `${t("snippetDiffRoundBase")} · ` : "";
        summaryText += t("snippetDiffSummary")
            .replace("{hunks}", String(summary.hunks))
            .replace("{added}", String(summary.added))
            .replace("{removed}", String(summary.removed));
        if (lint.findings.length) summaryText += " · " + t("snippetDiffFindings").replace("{n}", String(lint.findings.length));
        aiDiffSummary.hidden = false;
        aiDiffSummary.textContent = summaryText;
        const findingLines = new Map();
        for (const finding of lint.findings) {
            const list = findingLines.get(finding.line) || [];
            list.push(finding);
            findingLines.set(finding.line, list);
        }
        aiDiffScroll.replaceChildren();
        let shown = 0;
        if (diff.degraded) {
            aiDiffNote.hidden = false;
            aiDiffNote.textContent = t("snippetDiffDegraded");
        } else {
            for (const [h, hunk] of diff.hunks.entries()) {
                const block = node("div", "sw-studio__diff-hunk");
                const head = node("button", "sw-studio__diff-hunk-head", activeHunkAccepted[h] ? "\u2713" : "\u2717");
                head.type = "button";
                head.title = `${t("snippetDiffHunkToggle")} · ${h + 1}`;
                head.setAttribute("aria-label", head.title);
                head.setAttribute("aria-pressed", "true");
                head.addEventListener("click", () => {
                    activeHunkAccepted[h] = !activeHunkAccepted[h];
                    head.textContent = activeHunkAccepted[h] ? "\u2713" : "\u2717";
                    head.setAttribute("aria-pressed", String(activeHunkAccepted[h]));
                    block.classList.toggle("is-rejected", !activeHunkAccepted[h]);
                });
                const bodyRows = node("div", "sw-studio__diff-hunk-body");
                for (const row of hunk.rows) {
                    if (shown >= DIFF_RENDER_ROW_MAX) break;
                    const line = node("div", `sw-studio__diff-row is-${row.type}`);
                    const aCell = node("span", "sw-studio__diff-ln", row.aLine ? String(row.aLine) : "");
                    const bCell = node("span", "sw-studio__diff-ln", row.bLine ? String(row.bLine) : "");
                    const text = node("span", "sw-studio__diff-text", row.text.length ? row.text : "\u00a0");
                    if (row.bLine && findingLines.has(row.bLine)) {
                        const rowFindings = findingLines.get(row.bLine);
                        line.classList.add("has-finding", rowFindings.some((f) => f.severity === "warn") ? "finding-warn" : "finding-info");
                        line.title = rowFindings.map((f) => f.rule).join(", ");
                    }
                    line.append(aCell, bCell, text);
                    bodyRows.appendChild(line);
                    shown++;
                }
                block.append(head, bodyRows);
                aiDiffScroll.appendChild(block);
                if (shown >= DIFF_RENDER_ROW_MAX) break;
            }
            const hiddenRows = diff.rows.length - shown;
            aiDiffNote.hidden = hiddenRows <= 0;
            if (hiddenRows > 0) aiDiffNote.textContent = t("snippetDiffMore").replace("{n}", String(hiddenRows));
        }
        // 流式原文让位给结构化 diff；接受按钮语义=应用所选 hunk（默认全选）。
        aiResult.hidden = true;
        aiDiffPanel.hidden = false;
    }
    const setAIStatus = (value, ready = false, state = "") => {
        aiStatus.textContent = value;
        aiStatus.dataset.state = state || (ready ? "ready" : "idle");
        aiProvider.textContent = value;
        const stateClass = state === "error" ? " is-error" : state === "loading" ? " is-loading" : ready ? " is-ready" : "";
        aiProvider.className = `sw-studio__state-badge${stateClass}`;
    };
    const updateAIActions = () => {
        if (cancelAIButton.disabled) aiButton.disabled = busy || !aiConsentInput.checked || !prompt.value.trim();
        aiProvider.textContent = aiConsentInput.checked ? t("snippetAIReady") : t("snippetAIIdle");
        aiProvider.className = `sw-studio__state-badge${aiConsentInput.checked ? " is-ready" : ""}`;
    };
    const updateAIMode = () => {
        modeHint.textContent = t(modeHints[modeSelect.value] || modeHints.generate);
        const explanation = modeSelect.value === "explain";
        acceptButton.hidden = explanation;
        if (explanation) acceptButton.disabled = true;
        else if (candidate?.mode !== "explain") acceptButton.disabled = !candidate;
    };
    modeSelect.addEventListener("change", () => {
        updateAIMode();
    });
    aiConsentInput.addEventListener("change", updateAIActions);
    prompt.addEventListener("input", updateAIActions);
    aside.append(aiHeader, aiNote, modeField, modeHint, prompt, aiConsent, aiActions, aiStatus, aiResultPanel, acceptButton);
    layout.append(main, aside);
    const status = node("footer", "sw-studio__status", t("snippetLoading"));
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    status.dataset.state = "loading";
    const setStatus = (message, state = "ready") => {
        status.textContent = message;
        status.dataset.state = state;
    };
    const refresh = action("snippetRefresh", () => { guardLeave(() => void load(true)); });
    const footer = node("div", "sw-studio__footer");
    footer.append(status, saveButton, refresh);
    root.replaceChildren(header, layout, footer);
    const preview = createSnippetPreview(previewContainer, {
        title: t("snippetPreview"),
        labels: {lang: t("snippetPreviewLang"), sample: t("snippetSample"), title: t("snippetSampleTitle"), paragraph: t("snippetSampleParagraph"), quote: t("snippetSampleQuote"), section: t("snippetSampleSection"), codeLabel: t("snippetSampleCode"), item: t("snippetSampleItem"), state: t("snippetSampleState"), progress: t("snippetSampleProgress"), reading: t("snippetSampleReading"), ready: t("snippetSampleReady"), writing: t("snippetSampleWriting"), draft: t("snippetSampleDraft"), button: t("snippetSampleButton")},
        onReady: () => {
            if (disposed) return;
            previewShell.dataset.state = "ready";
            previewLoading.hidden = true;
            previewState.textContent = t("snippetPreviewReady");
            previewState.className = "sw-studio__state-badge is-ready";
        },
        onError: (message) => {
            if (!disposed) {
                setStatus(`${t("snippetPreviewError")} ${message}`, "error");
                previewState.textContent = t("snippetPreviewError");
                previewState.className = "sw-studio__state-badge is-error";
            }
        },
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
    const byteLength = (content) => new TextEncoder().encode(String(content || "")).byteLength;
    const lineLength = (content) => content ? String(content).split(/\r\n|\r|\n/).length : 0;
    const formatBytes = (bytes) => bytes < 1024 ? `${bytes} ${t("snippetBytes")}` : `${(bytes / 1024).toFixed(1)} KiB`;
    const sourceLabel = () => t(selectedSource === "native" ? "snippetMine" : selectedSource === "builtin" ? "snippetBuiltins" : "snippetDraft");
    function syncFields() {
        nameInput.value = draft.name;
        typeSelect.value = draft.type;
        editor.value = draft.content;
        session.draft = {...draft};
        session.baseline = baseline ? {...baseline} : null;
        const bytes = byteLength(draft.content);
        const lines = lineLength(draft.content);
        const shortName = draft.name.trim() || t("snippetNew");
        const unsaved = dirty();
        const savedState = unsaved ? t("snippetUnsaved") : baseline ? baseline.enabled ? t("snippetEnabled") : t("snippetDisabled") : t("snippetDraft");
        const stateClass = unsaved ? "is-draft" : baseline ? baseline.enabled ? "is-ready" : "is-muted" : "is-draft";
        selectionName.textContent = shortName;
        selectionType.textContent = draft.type.toUpperCase();
        selectionStatus.textContent = savedState;
        selectionStatus.className = `sw-studio__state-badge ${stateClass}`;
        selectionMeta.textContent = `${sourceLabel()} · ${formatBytes(bytes)} · ${lines} ${t("snippetLines")}`;
        headerContext.textContent = `${shortName} · ${draft.type.toUpperCase()}`;
        headerState.textContent = savedState;
        headerState.className = `sw-studio__state-badge ${stateClass}`;
        editorMeta.textContent = `${formatBytes(bytes)} · ${lines} ${t("snippetLines")}`;
        previewType.textContent = draft.type.toUpperCase();
        runButton.hidden = draft.type !== "js";
        // A synchronous user script can freeze the host WebView even inside a
        // sandboxed iframe. Keep JS preview visible as a planned affordance,
        // but do not execute it until a terminable worker-based runner exists.
        runButton.disabled = true;
        runButton.title = t("snippetJSPreviewUnavailable");
        compareButton.disabled = busy || !baseline;
        compareButton.title = baseline ? t("snippetCompare") : t("snippetCompareUnavailable");
        if (!baseline) {
            showOriginal = false;
            compareButton.setAttribute("aria-pressed", "false");
        }
        typeSelect.disabled = Boolean(baseline) || busy;
        typeNote.hidden = !baseline;
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
        layout.setAttribute("aria-busy", String(loading || busy));
        updateAIActions();
        updateAIMode();
    }
    function renderPreview(runJS = false) {
        clearTimeout(previewTimer);
        if (disposed) return;
        const content = showOriginal ? original : draft.content;
        if (byteLength(content) > SNIPPET_CODE_MAX) { setStatus(t("snippetTooLarge"), "error"); return; }
        previewShell.dataset.state = "loading";
        previewLoading.hidden = false;
        previewState.textContent = t("snippetPreviewLoading");
        previewState.className = "sw-studio__state-badge is-loading";
        previewHint.textContent = draft.type === "js" ? `${t("snippetPreviewHint")} ${t("snippetJSPreviewUnavailable")}` : t("snippetPreviewHint");
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
    // T-6956：脏稿不再同步 confirm 强制放弃，改三选一待执行意图：
    // 保存并继续（成功才导航一次）/ 放弃（零写入放行）/ 取消（默认聚焦，零写入）。
    const leave = createLeaveIntentCoordinator();
    const guardLeave = (run) => {
        const verdict = leave.requestLeave(dirty(), busy, run);
        if (verdict.action === "confirm") openLeaveDialog();
        return verdict.action === "run";
    };
    function openLeaveDialog() {
        if (leave.isSaving()) return;
        const dialog = new Dialog({
            title: t("snippetLeaveTitle"),
            content: '<div class="sw-studio__leave"></div>',
            width: "min(440px, 92vw)",
        });
        const box = dialog.element.querySelector(".sw-studio__leave");
        if (!box) { dialog.destroy(); return; }
        const message = node("p", "sw-studio__leave-message", t("snippetLeaveMessage"));
        const actions = node("div", "sw-studio__leave-actions");
        const saveChoice = node("button", "b3-button b3-button--text", t("snippetLeaveSave"));
        const discardChoice = node("button", "b3-button b3-button--cancel", t("snippetLeaveDiscard"));
        const cancelChoice = node("button", "b3-button b3-button--text", t("cancel"));
        saveChoice.addEventListener("click", () => {
            saveChoice.disabled = true;
            discardChoice.disabled = true;
            void leave.confirmSave(async () => (await mutate("save")) === true).then((result) => {
                dialog.destroy();
                if (!result.saved) {
                    setStatus(t("snippetLeaveSaveFailed"), "error");
                    try { editor.focus({preventScroll: true}); } catch (_) { editor.focus(); }
                }
            });
        });
        discardChoice.addEventListener("click", () => {
            leave.confirmDiscard();
            dialog.destroy();
        });
        cancelChoice.addEventListener("click", () => {
            leave.cancel();
            dialog.destroy();
            try { editor.focus({preventScroll: true}); } catch (_) { editor.focus(); }
        });
        actions.append(saveChoice, discardChoice, cancelChoice);
        box.append(message, actions);
        // 默认聚焦取消——三选一里最安全的动作
        cancelChoice.focus({preventScroll: true});
    }
    function choose(value, native) {
        aiGeneration += 1;
        ai.cancel();
        aiButton.disabled = true;
        cancelAIButton.disabled = true;
        candidate = null;
        aiHistory = [];
        acceptButton.disabled = true;
        acceptButton.hidden = modeSelect.value === "explain";
        aiResult.hidden = true;
        aiResultHeader.hidden = true;
        aiEmpty.hidden = false;
        aiResult.value = "";
        aiResultMeta.textContent = "";
        activeDiff = null;
        activeHunkAccepted = [];
        hideAIDiffPanel();
        setAIStatus(t("snippetAIIdle"));
        baseline = native ? {...native} : null;
        selectedSource = native ? "native" : value.source || "draft";
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
        setStatus(t("snippetLoading"), "loading");
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
            setStatus(`${t("snippetLoaded")} ${snippets.length}`, "ready");
        } catch (error) {
            if (disposed || requestGeneration !== loadGeneration) return;
            loadFailed = true;
            setStatus(errorText(error), "error");
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
        if (busy || loading || loadFailed || disposed) return false;
        if (actionName === "delete" && !win.confirm(t("snippetConfirmDelete"))) return false;
        if (actionName === "toggle" && dirty()) { setStatus(t("snippetSaveFirst"), "blocked"); return false; }
        if (draft.type === "js" && (actionName === "toggle" && !baseline?.enabled || actionName === "save" && baseline?.enabled)) {
            if (!win.confirm(t("snippetConfirmJS"))) return false;
        }
        busy = true;
        setStatus(status.textContent, "busy");
        syncFields();
        const previous = baseline ? {...baseline} : null;
        const input = {...draft, id: baseline?.id || newId(), enabled: actionName === "toggle" ? !baseline?.enabled : baseline?.enabled === true};
        try {
            const next = await store.mutate(previous, actionName, input);
            if (disposed) return false;
            snippets = next;
            const saved = next.find((item) => item.id === input.id) || null;
            choose(saved || {name: "", type: "css", content: ""}, saved);
            setStatus(t(input.type === "js" ? "snippetJSReload" : "snippetSaved"), "ready");
            return true;
            return true;
        } catch (error) { if (!disposed) setStatus(errorText(error), "error"); return false; }
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
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;
        guardLeave(() => { void importFile(file); });
    });
    async function importFile(file) {
        try {
            if (file.size > SNIPPET_CODE_MAX) throw new Error("size_limit");
            const imported = parseSnippetImport(file.name, await file.text());
            if (disposed) return;
            choose(imported, null);
            setStatus(imported.varsResolved
                ? `${t("snippetImported")} · ${t("snippetUsercssVars").replace("{n}", String(imported.varsResolved))}`
                : t("snippetImported"), "ready");
        } catch (error) { if (!disposed) setStatus(errorText(error), "error"); }
    }
    async function generate() {
        if (!aiConsentInput.checked || !prompt.value.trim() || disposed) return;
        const generation = ++aiGeneration;
        const startedRevision = revision;
        const captured = {...draft};
        const mode = modeSelect.value;
        const instruction = prompt.value.trim();
        // T-6917（ADR 0083 D3）：迭代模式以上一轮候选为 AI 输入源时，diff 基准也改为
        // 上一轮候选，面板如实标注"本轮改动相对上一轮"，让用户只审本轮引入的变化。
        const iterateFromCandidate = mode === "iterate" && candidate?.mode !== "explain" && candidate?.type === captured.type;
        const sourceContent = iterateFromCandidate ? candidate.content : captured.content;
        const history = mode === "iterate" ? aiHistory.slice(-6).map((item) => ({...item})) : [];
        candidate = null;
        acceptButton.disabled = true;
        acceptButton.hidden = mode === "explain";
        aiButton.disabled = true;
        cancelAIButton.disabled = false;
        aiResult.hidden = false;
        aiResultHeader.hidden = false;
        aiEmpty.hidden = true;
        aiResult.value = "";
        aiResultMeta.textContent = "";
        hideAIDiffPanel();
        setAIStatus(t("snippetAIGenerating"), false, "loading");
        try {
            const result = await ai.generate({type: captured.type, content: sourceContent, instruction, mode, history,
                onToken: (token) => { if (!disposed && generation === aiGeneration) aiResult.value += token; },
            });
            if (disposed || generation !== aiGeneration) return;
            candidate = {...result, mode, revision: startedRevision};
            aiResult.value = result.content;
            aiResultMeta.textContent = `${formatBytes(byteLength(result.content))} · ${lineLength(result.content)} ${t("snippetLines")}`;
            aiHistory = [...history, {role: "user", content: instruction}, {role: "assistant", content: result.content}].slice(-8);
            acceptButton.disabled = mode === "explain";
            setAIStatus(t("snippetAIDone"), true);
            // 摘要与 diff 如实展示替换差量；迭代轮以"相对上一轮"为基准。
            renderAIDiff(iterateFromCandidate ? sourceContent : draft.content, iterateFromCandidate);
        } catch (error) { if (!disposed && generation === aiGeneration) setAIStatus(errorText(error), false, "error"); }
        finally { if (!disposed && generation === aiGeneration) { cancelAIButton.disabled = true; updateAIActions(); } }
    }
    function closePicker() {
        pickerRelease();
        pickerRelease = () => {};
        picker?.remove();
        picker = null;
        // At narrow widths the workbench is a vertical scroller. Restoring
        // focus must not scroll the hidden editor into view underneath the
        // picker that just closed.
        chooseButton.focus({preventScroll: true});
        root.scrollTop = pickerScrollTop.root;
        layout.scrollTop = pickerScrollTop.layout;
    }
    function openPicker() {
        if (picker || busy) return;
        pickerScrollTop = {root: root.scrollTop, layout: layout.scrollTop};
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
                const isCurrent = item.source === "native"
                    ? item.id === baseline?.id
                    : !baseline && item.type === draft.type && item.name === draft.name && item.content === draft.content;
                const button = action("snippetSelect", () => {
                    guardLeave(() => {
                        choose(item, item.source === "native" ? snippets.find((entry) => entry.id === item.id) : null);
                        closePicker();
                    });
                });
                button.className = "sw-studio__catalog-item";
                button.setAttribute("aria-pressed", String(isCurrent));
                button.setAttribute("aria-label", `${item.name} · ${item.type.toUpperCase()}`);
                if (isCurrent) button.classList.add("is-current");
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
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && doc.activeElement?.classList.contains("sw-studio__catalog-item")) {
                const controls = Array.from(list.querySelectorAll(".sw-studio__catalog-item"));
                const index = controls.indexOf(doc.activeElement);
                if (index >= 0) {
                    event.preventDefault();
                    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
                    controls[nextIndex]?.focus();
                }
            }
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
    // T-6878（P2）：跨表面打开携带 objectId——清单就绪后定位对应片段
    // （id 精确匹配、名称回退；仅导航语义，无写入）。
    if (objectId) {
        void ready.then(() => {
            if (disposed) return;
            const target = snippets.find((item) => item && item.id === objectId)
                || snippets.find((item) => item && item.name === objectId);
            if (target) guardLeave(() => choose(target, target));
        }).catch(() => undefined);
    }
    // The platform helper is supplied by the host entry so the lazy studio
    // chunk does not create a second shared webpack chunk.  The studio keeps
    // its own dirty guard; only a discard-safe navigation reaches the host.
    if (platform?.mount && platform.labels) {
        platform.mount(root, {
            surface: "studio",
            labels: platform.labels,
            available: platform.available,
            context: platform.context || null,
            onNavigate: (surface) => {
                guardLeave(() => platform.onNavigate?.(surface));
            },
            onClose: () => {
                guardLeave(() => platform.onClose?.());
            },
            closeLabel: locale.i18n.close || "Close",
        });
    }
    // 首焦点落到平台关闭按钮；独立装配或旧宿主没有平台头部时回退到返回按钮。
    // 这样全屏工作室打开后，键盘用户立即知道如何退出，且不会把焦点送入编辑器造成误输入。
    const initialFocus = root.querySelector(".sw-platform-header__close") || backButton;
    win.setTimeout(() => {
        if (!disposed && root.isConnected && typeof initialFocus.focus === "function") {
            initialFocus.focus({preventScroll: true});
        }
    }, 0);
    return {
        ready,
        canClose: () => {
            // T-6956：宿主发起的关闭先同步阻止；脏稿经三选一，得到明确结果后由
            // 待执行意图继续（platform.onClose 会再次触发宿主关闭）。干净则放行。
            if (busy) return false;
            if (!dirty()) return true;
            const verdict = leave.requestLeave(true, busy, () => platform.onClose?.());
            if (verdict.action === "confirm") openLeaveDialog();
            return false;
        },
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
