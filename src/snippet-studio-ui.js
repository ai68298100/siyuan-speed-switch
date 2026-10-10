const {Dialog} = require("siyuan");
const {buildEditorLineNumbers, analyzeEditorBrackets} = require("./snippet-editor-model.js");
const {BUILTIN_SNIPPETS, SNIPPET_CODE_MAX, SNIPPET_BACKUP_MAX_BYTES, parseSnippetImport, filterSnippetCatalog, buildUsercssHeader, hasUsercssHeader, createLeaveIntentCoordinator, createDraftHistory, pushDraftHistory, undoDraftHistory, redoDraftHistory, canUndoDraftHistory, canRedoDraftHistory, findDraftMatches, replaceDraftMatches, nextConflictCopyName, buildConflictCopyEntry, rememberRecentSnippet, buildSnippetBackup, normalizeSnippetBackup, diffSnippetBackup, buildSnippetRestorePlan, snippetSnapshotSignature} = require("./snippet-studio-model.js");
const {buildSnippetDiff, summarizeDiff, applyDiffHunks} = require("./snippet-diff.js");
const {lintSnippet} = require("./snippet-lint.js");
const {createSnippetStore} = require("./snippet-studio-host.js");
const {buildRecycleEntry, appendRecycleEntry, purgeRecycleEntry, normalizeRecycleStore} = require("./snippet-recycle.js");
const {normalizeSnippetGroupStore, addSnippetGroup, createSnippetGroupId, renameSnippetGroup, setSnippetGroupCollapsed, removeSnippetGroup, moveSnippetToGroup, setSnippetGroupView, reconcileSnippetGroups, setSnippetMetadata, snippetMetadataSignature, projectSnippetMetadata} = require("./snippet-groups.js");
const {createSnippetPreview, resolvePreviewCapability, formatPreviewCapability, analyzeSelectorDiagnostics, analyzeCssCoverage} = require("./snippet-studio-preview.js");
const {createSnippetAIClient, selectSnippetAIContext} = require("./snippet-studio-ai.js");
const {normalizeGistSettings, maskGistToken, rememberGistLink, buildGistImportDraft, fetchGistPreview, publishGist} = require("./snippet-gist.js");

// T-6978：预览样例与探针文案共用一份构造——主编辑器实时预览与商店预览同源，
// 新增样例/探针文案只改这里（labels 缺键回落到 preview 模块的中文兜底）。
function previewLabels(t) {
    return {
        lang: t("snippetPreviewLang"), sample: t("snippetSample"), title: t("snippetSampleTitle"),
        paragraph: t("snippetSampleParagraph"), quote: t("snippetSampleQuote"), section: t("snippetSampleSection"),
        codeLabel: t("snippetSampleCode"), item: t("snippetSampleItem"), state: t("snippetSampleState"),
        progress: t("snippetSampleProgress"), reading: t("snippetSampleReading"), ready: t("snippetSampleReady"),
        writing: t("snippetSampleWriting"), draft: t("snippetSampleDraft"), button: t("snippetSampleButton"),
        probeTitle: t("snippetProbeTitle"), probeNote: t("snippetProbeNote"),
        probeH3: t("snippetProbeH3"), probeH4: t("snippetProbeH4"), probeH5: t("snippetProbeH5"), probeH6: t("snippetProbeH6"),
        probeLinksLead: t("snippetProbeLinksLead"), probeLinksAnchor: t("snippetProbeLinksAnchor"),
        probeListItem: t("snippetProbeListItem"), probeListItem2: t("snippetProbeListItem2"),
        probeTaskDone: t("snippetProbeTaskDone"), probeTaskTodo: t("snippetProbeTaskTodo"),
        probeImageAlt: t("snippetProbeImageAlt"), probeStrong: t("snippetProbeStrong"), probeEm: t("snippetProbeEm"),
        probeMark: t("snippetProbeMark"), probeDel: t("snippetProbeDel"), probeU: t("snippetProbeU"), probeKbd: t("snippetProbeKbd"),
        probeTagA: t("snippetProbeTagA"), probeTagB: t("snippetProbeTagB"), probeTagC: t("snippetProbeTagC"),
        // T-6989：内容扩展探针文案（与探针区块 buildProbeSection 的 text() 键一一对应）
        probeDocTitle: t("snippetProbeDocTitle"), probeCallout: t("snippetProbeCallout"),
        probeColumnA: t("snippetProbeColumnA"), probeColumnB: t("snippetProbeColumnB"),
        probeFormula: t("snippetProbeFormula"),
        probeAttrsLead: t("snippetProbeAttrsLead"), probeAttrsValue: t("snippetProbeAttrsValue"),
        probeDbColA: t("snippetProbeDbColA"), probeDbColB: t("snippetProbeDbColB"),
        probeDbRowA: t("snippetProbeDbRowA"), probeDbRowB: t("snippetProbeDbRowB"),
        probeMediaBlocked: t("snippetProbeMediaBlocked"),
    };
}

/** Experimental singleton view; native snippets remain the only saved copy. */
function mountSnippetStudio(root, {i18n = {}, getConfig = () => ({}), store = createSnippetStore({getSnippetSettings: () => getConfig()?.snippet}), ai = createSnippetAIClient(), session = {draft: null, baseline: null}, platform = null, onBack = () => {}, objectId = "", recycle = null, groups = null, gist = null} = {}) {
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    // Keep the locale surface statically discoverable by the repository i18n
    // gate while still allowing the UI to look up one of the fixed labels
    // below by key. There is no user-controlled key path here.
    const locale = {i18n};
    const translations = {
        snippetAbout: locale.i18n.snippetAbout,
        snippetAI: locale.i18n.snippetAI,
        snippetAIIncludeCode: locale.i18n.snippetAIIncludeCode,
        snippetAIIncludeHistory: locale.i18n.snippetAIIncludeHistory,
        snippetAIProviderInfo: locale.i18n.snippetAIProviderInfo,
        snippetAIContextSummary: locale.i18n.snippetAIContextSummary,
        snippetAIContextTooLarge: locale.i18n.snippetAIContextTooLarge,
        snippetAIPermissionDenied: locale.i18n.snippetAIPermissionDenied,
        snippetAIRetry: locale.i18n.snippetAIRetry,
        snippetAICopyCandidate: locale.i18n.snippetAICopyCandidate,
        snippetAIExportCandidate: locale.i18n.snippetAIExportCandidate,
        snippetAICandidateStale: locale.i18n.snippetAICandidateStale,
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
        snippetBuiltinQuoteName: locale.i18n.snippetBuiltinQuoteName,
        snippetBuiltinQuoteDescription: locale.i18n.snippetBuiltinQuoteDescription,
        snippetBuiltinImgName: locale.i18n.snippetBuiltinImgName,
        snippetBuiltinImgDescription: locale.i18n.snippetBuiltinImgDescription,
        snippetBuiltinHeadingName: locale.i18n.snippetBuiltinHeadingName,
        snippetBuiltinHeadingDescription: locale.i18n.snippetBuiltinHeadingDescription,
        snippetBuiltinListName: locale.i18n.snippetBuiltinListName,
        snippetBuiltinListDescription: locale.i18n.snippetBuiltinListDescription,
        snippetBuiltinDividerName: locale.i18n.snippetBuiltinDividerName,
        snippetBuiltinDividerDescription: locale.i18n.snippetBuiltinDividerDescription,
        snippetBuiltinTagName: locale.i18n.snippetBuiltinTagName,
        snippetBuiltinEyecareName: locale.i18n.snippetBuiltinEyecareName,
        snippetBuiltinEyecareDescription: locale.i18n.snippetBuiltinEyecareDescription,
        snippetBuiltinLineheightName: locale.i18n.snippetBuiltinLineheightName,
        snippetBuiltinLineheightDescription: locale.i18n.snippetBuiltinLineheightDescription,
        snippetBuiltinHiconName: locale.i18n.snippetBuiltinHiconName,
        snippetBuiltinHiconDescription: locale.i18n.snippetBuiltinHiconDescription,
        snippetBuiltinCardparaName: locale.i18n.snippetBuiltinCardparaName,
        snippetBuiltinCardparaDescription: locale.i18n.snippetBuiltinCardparaDescription,
        snippetBuiltinCodeThemeName: locale.i18n.snippetBuiltinCodeThemeName,
        snippetBuiltinCodeThemeDescription: locale.i18n.snippetBuiltinCodeThemeDescription,
        snippetBuiltinInlinecodeName: locale.i18n.snippetBuiltinInlinecodeName,
        snippetBuiltinInlinecodeDescription: locale.i18n.snippetBuiltinInlinecodeDescription,
        snippetBuiltinLinkName: locale.i18n.snippetBuiltinLinkName,
        snippetBuiltinLinkDescription: locale.i18n.snippetBuiltinLinkDescription,
        snippetBuiltinTaskName: locale.i18n.snippetBuiltinTaskName,
        snippetBuiltinTaskDescription: locale.i18n.snippetBuiltinTaskDescription,
        snippetBuiltinZebraName: locale.i18n.snippetBuiltinZebraName,
        snippetBuiltinZebraDescription: locale.i18n.snippetBuiltinZebraDescription,
        snippetBuiltinMarkName: locale.i18n.snippetBuiltinMarkName,
        snippetBuiltinMarkDescription: locale.i18n.snippetBuiltinMarkDescription,
        snippetBuiltinKbdName: locale.i18n.snippetBuiltinKbdName,
        snippetBuiltinKbdDescription: locale.i18n.snippetBuiltinKbdDescription,
        snippetBuiltinImgzoomName: locale.i18n.snippetBuiltinImgzoomName,
        snippetBuiltinImgzoomDescription: locale.i18n.snippetBuiltinImgzoomDescription,
        snippetBuiltinTaskdoneName: locale.i18n.snippetBuiltinTaskdoneName,
        snippetBuiltinTaskdoneDescription: locale.i18n.snippetBuiltinTaskdoneDescription,
        snippetBuiltinTheadName: locale.i18n.snippetBuiltinTheadName,
        snippetBuiltinTheadDescription: locale.i18n.snippetBuiltinTheadDescription,
        snippetBuiltinScrollbarName: locale.i18n.snippetBuiltinScrollbarName,
        snippetBuiltinScrollbarDescription: locale.i18n.snippetBuiltinScrollbarDescription,
        snippetBuiltinTagDescription: locale.i18n.snippetBuiltinTagDescription,
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
        snippetCategoryQuote: locale.i18n.snippetCategoryQuote,
        snippetCategoryImage: locale.i18n.snippetCategoryImage,
        snippetCategoryHeading: locale.i18n.snippetCategoryHeading,
        snippetCategoryList: locale.i18n.snippetCategoryList,
        snippetCategoryDivider: locale.i18n.snippetCategoryDivider,
        snippetCategoryTag: locale.i18n.snippetCategoryTag,
        snippetCategoryTheme: locale.i18n.snippetCategoryTheme,
        snippetCategoryLayout: locale.i18n.snippetCategoryLayout,
        snippetCategoryTable: locale.i18n.snippetCategoryTable,
        snippetCategoryTypography: locale.i18n.snippetCategoryTypography,
        snippetChoose: locale.i18n.snippetChoose,
        snippetRecent: locale.i18n.snippetRecent,
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
        snippetUndo: locale.i18n.snippetUndo,
        snippetRedo: locale.i18n.snippetRedo,
        snippetFindBar: locale.i18n.snippetFindBar,
        snippetFindQuery: locale.i18n.snippetFindQuery,
        snippetFindReplaceTo: locale.i18n.snippetFindReplaceTo,
        snippetFindPrev: locale.i18n.snippetFindPrev,
        snippetFindNext: locale.i18n.snippetFindNext,
        snippetFindReplaceAll: locale.i18n.snippetFindReplaceAll,
        snippetFindConfirm: locale.i18n.snippetFindConfirm,
        snippetFindNone: locale.i18n.snippetFindNone,
        snippetFindDone: locale.i18n.snippetFindDone,
        snippetScene: locale.i18n.snippetScene,
        snippetSceneReading: locale.i18n.snippetSceneReading,
        snippetSceneTable: locale.i18n.snippetSceneTable,
        snippetSceneControls: locale.i18n.snippetSceneControls,
        snippetPreviewWidth: locale.i18n.snippetPreviewWidth,
        snippetWidthAuto: locale.i18n.snippetWidthAuto,
        snippetWidthNarrow: locale.i18n.snippetWidthNarrow,
        snippetWidthMedium: locale.i18n.snippetWidthMedium,
        snippetWidthWide: locale.i18n.snippetWidthWide,
        snippetConflictTitle: locale.i18n.snippetConflictTitle,
        snippetConflictMessage: locale.i18n.snippetConflictMessage,
        snippetConflictContinue: locale.i18n.snippetConflictContinue,
        snippetConflictCopy: locale.i18n.snippetConflictCopy,
        snippetConflictReload: locale.i18n.snippetConflictReload,
        snippetConflictGone: locale.i18n.snippetConflictGone,
        snippetConflictAdded: locale.i18n.snippetConflictAdded,
        snippetConflictRemoved: locale.i18n.snippetConflictRemoved,
        snippetDraft: locale.i18n.snippetDraft,
        snippetUnsaved: locale.i18n.snippetUnsaved,
        snippetEnable: locale.i18n.snippetEnable,
        snippetEnabled: locale.i18n.snippetEnabled,
        snippetExperimental: locale.i18n.snippetExperimental,
        snippetExport: locale.i18n.snippetExport,
        snippetBackup: locale.i18n.snippetBackup,
        snippetBackupHint: locale.i18n.snippetBackupHint,
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
        snippetMasterTitle: locale.i18n.snippetMasterTitle,
        snippetMasterCSS: locale.i18n.snippetMasterCSS,
        snippetMasterJS: locale.i18n.snippetMasterJS,
        snippetMasterEnabled: locale.i18n.snippetMasterEnabled,
        snippetMasterDisabled: locale.i18n.snippetMasterDisabled,
        snippetMasterUnavailable: locale.i18n.snippetMasterUnavailable,
        snippetMasterSaved: locale.i18n.snippetMasterSaved,
        snippetMasterFailed: locale.i18n.snippetMasterFailed,
        snippetDisabledInPublish: locale.i18n.snippetDisabledInPublish,
        snippetDisabledInPublishHint: locale.i18n.snippetDisabledInPublishHint,
        snippetOrderHint: locale.i18n.snippetOrderHint,
        snippetCascadeHint: locale.i18n.snippetCascadeHint,
        snippetJSCascadeHint: locale.i18n.snippetJSCascadeHint,
        snippetMine: locale.i18n.snippetMine,
        snippetGroupNew: locale.i18n.snippetGroupNew,
        snippetMetadata: locale.i18n.snippetMetadata,
        snippetStore: locale.i18n.snippetStore,
        snippetStoreDraft: locale.i18n.snippetStoreDraft,
        snippetStoreBuiltinInfo: locale.i18n.snippetStoreBuiltinInfo,
        snippetStoreNativeInfo: locale.i18n.snippetStoreNativeInfo,
        snippetStoreCommunity: locale.i18n.snippetStoreCommunity,
        snippetAlias: locale.i18n.snippetAlias,
        snippetTags: locale.i18n.snippetTags,
        snippetSummary: locale.i18n.snippetSummary,
        snippetPinned: locale.i18n.snippetPinned,
        snippetCatalogSort: locale.i18n.snippetCatalogSort,
        snippetCatalogNativeOrder: locale.i18n.snippetCatalogNativeOrder,
        snippetCatalogModified: locale.i18n.snippetCatalogModified,
        snippetGroupRename: locale.i18n.snippetGroupRename,
        snippetGroupDelete: locale.i18n.snippetGroupDelete,
        snippetGroupView: locale.i18n.snippetGroupView,
        snippetGroupTree: locale.i18n.snippetGroupTree,
        snippetGroupFlat: locale.i18n.snippetGroupFlat,
        snippetGroupUngrouped: locale.i18n.snippetGroupUngrouped,
        snippetGroupNamePrompt: locale.i18n.snippetGroupNamePrompt,
        snippetGroupNameInvalid: locale.i18n.snippetGroupNameInvalid,
        snippetGroupDeleteConfirm: locale.i18n.snippetGroupDeleteConfirm,
        snippetGroupDropHint: locale.i18n.snippetGroupDropHint,
        snippetGist: locale.i18n.snippetGist,
        snippetGistHint: locale.i18n.snippetGistHint,
        snippetGistToken: locale.i18n.snippetGistToken,
        snippetGistTokenSet: locale.i18n.snippetGistTokenSet,
        snippetGistTokenPlaceholder: locale.i18n.snippetGistTokenPlaceholder,
        snippetGistSaveToken: locale.i18n.snippetGistSaveToken,
        snippetGistClearToken: locale.i18n.snippetGistClearToken,
        snippetGistDescription: locale.i18n.snippetGistDescription,
        snippetGistUrl: locale.i18n.snippetGistUrl,
        snippetGistPublish: locale.i18n.snippetGistPublish,
        snippetGistPublishUpdate: locale.i18n.snippetGistPublishUpdate,
        snippetGistImportPreview: locale.i18n.snippetGistImportPreview,
        snippetGistImport: locale.i18n.snippetGistImport,
        snippetGistPreviewLoading: locale.i18n.snippetGistPreviewLoading,
        snippetGistPreviewEmpty: locale.i18n.snippetGistPreviewEmpty,
        snippetGistParseable: locale.i18n.snippetGistParseable,
        snippetGistUnparseable: locale.i18n.snippetGistUnparseable,
        snippetGistDiff: locale.i18n.snippetGistDiff,
        snippetGistLink: locale.i18n.snippetGistLink,
        snippetGistPublished: locale.i18n.snippetGistPublished,
        snippetGistImported: locale.i18n.snippetGistImported,
        snippetGistTokenRequired: locale.i18n.snippetGistTokenRequired,
        snippetGistReplaceToken: locale.i18n.snippetGistReplaceToken,
        snippetGistPrepareUpdate: locale.i18n.snippetGistPrepareUpdate,
        snippetGistStale: locale.i18n.snippetGistStale,
        snippetGistFailed: locale.i18n.snippetGistFailed,
        snippetGistPending: locale.i18n.snippetGistPending,
        snippetMore: locale.i18n.snippetMore,
        snippetName: locale.i18n.snippetName,
        snippetNew: locale.i18n.snippetNew,
        snippetCopy: locale.i18n.snippetCopy,
        snippetCopied: locale.i18n.snippetCopied,
        snippetCopyEmpty: locale.i18n.snippetCopyEmpty,
        snippetCopyFailed: locale.i18n.snippetCopyFailed,
        snippetNoResults: locale.i18n.snippetNoResults,
        snippetPaneDraft: locale.i18n.snippetPaneDraft,
        snippetPendingConfirm: locale.i18n.snippetPendingConfirm,
        snippetPendingUnverified: locale.i18n.snippetPendingUnverified,
        snippetPaneSaved: locale.i18n.snippetPaneSaved,
        snippetPaneSavedEmpty: locale.i18n.snippetPaneSavedEmpty,
        snippetRecycle: locale.i18n.snippetRecycle,
        snippetRecycleClear: locale.i18n.snippetRecycleClear,
        snippetRecycleClearConfirm: locale.i18n.snippetRecycleClearConfirm,
        snippetRecycleEmpty: locale.i18n.snippetRecycleEmpty,
        snippetRecycleOriginConflict: locale.i18n.snippetRecycleOriginConflict,
        snippetRecycleOriginDelete: locale.i18n.snippetRecycleOriginDelete,
        snippetRecycleOriginOverwrite: locale.i18n.snippetRecycleOriginOverwrite,
        snippetRecyclePurge: locale.i18n.snippetRecyclePurge,
        snippetRecyclePurgeConfirm: locale.i18n.snippetRecyclePurgeConfirm,
        snippetRecycleRestore: locale.i18n.snippetRecycleRestore,
        snippetRecycleRestored: locale.i18n.snippetRecycleRestored,
        snippetRestore: locale.i18n.snippetRestore,
        snippetRestoreAdd: locale.i18n.snippetRestoreAdd,
        snippetRestoreCancel: locale.i18n.snippetRestoreCancel,
        snippetRestoreConfirm: locale.i18n.snippetRestoreConfirm,
        snippetRestoreConflict: locale.i18n.snippetRestoreConflict,
        snippetRestoreDelete: locale.i18n.snippetRestoreDelete,
        snippetRestoreDone: locale.i18n.snippetRestoreDone,
        snippetRestoreEmpty: locale.i18n.snippetRestoreEmpty,
        snippetRestoreInvalid: locale.i18n.snippetRestoreInvalid,
        snippetRestoreKeep: locale.i18n.snippetRestoreKeep,
        snippetRestoreNoSelection: locale.i18n.snippetRestoreNoSelection,
        snippetRestoreOneShot: locale.i18n.snippetRestoreOneShot,
        snippetRestorePending: locale.i18n.snippetRestorePending,
        snippetRestorePreview: locale.i18n.snippetRestorePreview,
        snippetRestoreReplace: locale.i18n.snippetRestoreReplace,
        snippetRestoreSettings: locale.i18n.snippetRestoreSettings,
        snippetRestoreUndo: locale.i18n.snippetRestoreUndo,
        snippetRefreshExternal: locale.i18n.snippetRefreshExternal,
        snippetPreview: locale.i18n.snippetPreview,
        snippetPreviewError: locale.i18n.snippetPreviewError,
        snippetPreviewHint: locale.i18n.snippetPreviewHint,
        snippetPreviewLoading: locale.i18n.snippetPreviewLoading,
        snippetPreviewReady: locale.i18n.snippetPreviewReady,
        snippetPreviewLang: locale.i18n.snippetPreviewLang,
        // T-6987/T-6988：能力回执与覆盖诊断文案（静态发现表登记，供 i18n 门禁扫描）
        snippetCapabilitySceneLabel: locale.i18n.snippetCapabilitySceneLabel,
        snippetCapabilityWidthLabel: locale.i18n.snippetCapabilityWidthLabel,
        snippetCapabilityThemeLabel: locale.i18n.snippetCapabilityThemeLabel,
        snippetCapabilityProbeOn: locale.i18n.snippetCapabilityProbeOn,
        snippetCapabilityProbeOff: locale.i18n.snippetCapabilityProbeOff,
        snippetCapabilityScriptCss: locale.i18n.snippetCapabilityScriptCss,
        snippetCapabilityNetwork: locale.i18n.snippetCapabilityNetwork,
        snippetCapabilitySemantics: locale.i18n.snippetCapabilitySemantics,
        snippetCapabilitySingleView: locale.i18n.snippetCapabilitySingleView,
        snippetDiagnostics: locale.i18n.snippetDiagnostics,
        snippetDiagnosticsHit: locale.i18n.snippetDiagnosticsHit,
        snippetDiagnosticsMiss: locale.i18n.snippetDiagnosticsMiss,
        snippetDiagnosticsUnknown: locale.i18n.snippetDiagnosticsUnknown,
        snippetDiagnosticsError: locale.i18n.snippetDiagnosticsError,
        snippetDiagnosticsEmpty: locale.i18n.snippetDiagnosticsEmpty,
        snippetDiagnosticsTruncated: locale.i18n.snippetDiagnosticsTruncated,
        // T-6989/T-6990：内容扩展探针与主题 token 快照文案
        snippetProbeDocTitle: locale.i18n.snippetProbeDocTitle,
        snippetProbeCallout: locale.i18n.snippetProbeCallout,
        snippetProbeColumnA: locale.i18n.snippetProbeColumnA,
        snippetProbeColumnB: locale.i18n.snippetProbeColumnB,
        snippetProbeFormula: locale.i18n.snippetProbeFormula,
        snippetProbeAttrsLead: locale.i18n.snippetProbeAttrsLead,
        snippetProbeAttrsValue: locale.i18n.snippetProbeAttrsValue,
        snippetProbeDbColA: locale.i18n.snippetProbeDbColA,
        snippetProbeDbColB: locale.i18n.snippetProbeDbColB,
        snippetProbeDbRowA: locale.i18n.snippetProbeDbRowA,
        snippetProbeDbRowB: locale.i18n.snippetProbeDbRowB,
        snippetProbeMediaBlocked: locale.i18n.snippetProbeMediaBlocked,
        snippetCapabilityTokenProfile: locale.i18n.snippetCapabilityTokenProfile,
        snippetCapabilityTokenBaseline: locale.i18n.snippetCapabilityTokenBaseline,
        snippetRefresh: locale.i18n.snippetRefresh,
        snippetResetPreview: locale.i18n.snippetResetPreview,
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
        snippetProbeTitle: locale.i18n.snippetProbeTitle,
        snippetProbeNote: locale.i18n.snippetProbeNote,
        snippetProbeH3: locale.i18n.snippetProbeH3,
        snippetProbeH4: locale.i18n.snippetProbeH4,
        snippetProbeH5: locale.i18n.snippetProbeH5,
        snippetProbeH6: locale.i18n.snippetProbeH6,
        snippetProbeLinksLead: locale.i18n.snippetProbeLinksLead,
        snippetProbeLinksAnchor: locale.i18n.snippetProbeLinksAnchor,
        snippetProbeListItem: locale.i18n.snippetProbeListItem,
        snippetProbeListItem2: locale.i18n.snippetProbeListItem2,
        snippetProbeTaskDone: locale.i18n.snippetProbeTaskDone,
        snippetProbeTaskTodo: locale.i18n.snippetProbeTaskTodo,
        snippetProbeImageAlt: locale.i18n.snippetProbeImageAlt,
        snippetProbeStrong: locale.i18n.snippetProbeStrong,
        snippetProbeEm: locale.i18n.snippetProbeEm,
        snippetProbeMark: locale.i18n.snippetProbeMark,
        snippetProbeDel: locale.i18n.snippetProbeDel,
        snippetProbeU: locale.i18n.snippetProbeU,
        snippetProbeKbd: locale.i18n.snippetProbeKbd,
        snippetProbeTagA: locale.i18n.snippetProbeTagA,
        snippetProbeTagB: locale.i18n.snippetProbeTagB,
        snippetProbeTagC: locale.i18n.snippetProbeTagC,
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
    let masterBusy = false;
    let loading = true;
    let loadFailed = false;
    let snippets = [];
    let snippetGroups = (() => {
        try { return normalizeSnippetGroupStore(groups?.load?.()); } catch (_) { return normalizeSnippetGroupStore(null); }
    })();
    let groupIdSeed = 0;
    let draft = session.draft
        ? {...session.draft, disabledInPublish: session.draft.disabledInPublish === true}
        : {id: "", name: "", type: "css", content: "", enabled: false, disabledInPublish: false};
    let baseline = session.baseline ? {...session.baseline} : null;
    let selectedSource = baseline ? "native" : "draft";
    let original = draft.content;
    let revision = 0;
    let aiGeneration = 0;
    let loadGeneration = 0;
    // T-7046：导入代际——迟到文件不得覆盖读取期间变化过的草稿现场
    let importGeneration = 0;
    let previewTimer = 0;
    let dark = doc.documentElement.dataset.themeMode === "dark";
    let showOriginal = false;
    // T-6960：预览场景与宽度档位（会话级，切换不触及草稿）
    let previewScene = "reading";
    let previewWidth = "auto";
    let candidate = null;
    let activeDiff = null;
    let activeHunkAccepted = [];
    let picker = null;
    let pickerRelease = () => {};
    // 选择器可能由左侧“选择片段”或顶部“组件商店”打开。关闭时恢复
    // 实际触发入口，避免商店入口误把焦点跳回另一处控件。
    let pickerOpener = null;
    let libraryFilter = "all";
    const libraryToggleBusy = new Set();
    // T-7044：目录重绘钩子——冲突副本保存成功后按现状刷新已打开的目录；
    // openPicker 注册、closePicker 摘除，picker 关闭时无渲染面可刷新
    let pickerRefresh = null;
    let pickerScrollTop = {root: 0, layout: 0};
    let aiHistory = [];
    let restoreUndo = session.restoreUndo ? normalizeSnippetBackup(session.restoreUndo) : null;
    let lastSnapshotSignature = "";
    let restoreDialog = null;
    let gistSettings = (() => {
        try { return normalizeGistSettings(gist?.load?.()); } catch (_) { return normalizeGistSettings(null); }
    })();
    let gistPreview = null;
    let gistBusy = false;
    let gistController = null;
    let gistGeneration = 0;
    let gistSourceUrl = session.gistSourceUrl || "";
    let gistEditingToken = !gistSettings.token;
    let gistWriting = false;
    const initialSnippetSettings = getConfig()?.snippet;
    let masterFlags = {
        enabledCSS: typeof initialSnippetSettings?.enabledCSS === "boolean" ? initialSnippetSettings.enabledCSS : null,
        enabledJS: typeof initialSnippetSettings?.enabledJS === "boolean" ? initialSnippetSettings.enabledJS : null,
    };
    // Signature snapshots require concrete booleans even in a test host or an
    // older host that does not expose master flags yet. Unknown flags preserve
    // the model's neutral default so catalog writes can still be confirmed.
    const snapshotSettings = () => ({
        enabledCSS: masterFlags.enabledCSS !== false,
        enabledJS: masterFlags.enabledJS !== false,
    });
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
    // R4 的头部只突出当前状态、返回和主动作。备份/恢复属于片段数据治理，
    // 是新增的低频动作，收进二级菜单，避免与返回和保存争夺首屏权重。
    const dataMenu = node("details", "sw-studio__data-menu");
    const dataMenuSummary = node("summary", "sw-studio__data-menu-summary", t("snippetMore"));
    const dataMenuActions = node("div", "sw-studio__data-menu-actions");
    const closeDataMenu = () => { dataMenu.open = false; };
    const backButton = action("snippetBack", () => guardLeave(() => onBack(true)));
    const backupButton = action("snippetBackup", () => { closeDataMenu(); void exportBackup(); }, "is-quiet");
    const restoreButton = action("snippetRestore", () => { closeDataMenu(); restoreInput.click(); }, "is-quiet");
    const restoreUndoButton = action("snippetRestoreUndo", () => { closeDataMenu(); void undoRestore(); }, "is-quiet");
    dataMenuActions.append(backupButton, restoreButton, restoreUndoButton);
    dataMenu.append(dataMenuSummary, dataMenuActions);
    headerActions.append(headerState, dataMenu, backButton);
    header.append(heading, headerActions);
    const layout = node("div", "sw-studio__layout");
    // R4 桌面原型保留片段目录；窄容器继续使用 picker，避免挤压编辑器和 AI rail。
    const library = node("aside", "sw-studio__library");
    library.setAttribute("aria-label", t("snippetChoose"));
    const libraryHeader = node("div", "sw-studio__library-header");
    const libraryTitle = node("strong", "sw-studio__library-title", t("snippetChoose"));
    const libraryCount = node("span", "sw-studio__library-count");
    libraryHeader.append(libraryTitle, libraryCount);
    const librarySearch = node("input", "sw-studio__input sw-studio__library-search");
    librarySearch.placeholder = t("snippetSearch");
    librarySearch.setAttribute("aria-label", t("snippetSearch"));
    const libraryFilters = node("div", "sw-studio__library-filters");
    const libraryFilterButtons = new Map();
    for (const [value, labelKey] of [["all", "snippetAllTypes"], ["css", "snippetCSS"], ["js", "snippetJS"]]) {
        const filter = node("button", "sw-studio__library-filter", t(labelKey));
        filter.type = "button";
        filter.dataset.libraryFilter = value;
        filter.setAttribute("aria-pressed", String(value === libraryFilter));
        filter.addEventListener("click", () => {
            libraryFilter = value;
            renderLibrary();
        });
        libraryFilterButtons.set(value, filter);
        libraryFilters.appendChild(filter);
    }
    const libraryList = node("div", "sw-studio__library-list");
    librarySearch.addEventListener("input", () => renderLibrary());
    library.append(libraryHeader, librarySearch, libraryFilters, libraryList);
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
    // T-7022：「运行 JavaScript」按钮已移除（T-6996 JS 维持 blocked，执行能力在
    // 预览模块层封死）——按钮的存在本身构成执行暗示；不可用提示保留在预览提示行
    // 与五条能力说明中。
    const stopButton = action("snippetResetPreview", () => renderPreview());
    // T-6960：场景与宽度选择——固定白名单场景 + 有限宽度档位，宽度不足回退单视图
    const sceneSelect = select("snippetScene", [["reading", "snippetSceneReading"], ["table", "snippetSceneTable"], ["controls", "snippetSceneControls"]]);
    sceneSelect.addEventListener("change", () => { previewScene = sceneSelect.value; renderPreview(); });
    const widthSelect = select("snippetPreviewWidth", [["auto", "snippetWidthAuto"], ["narrow", "snippetWidthNarrow"], ["medium", "snippetWidthMedium"], ["wide", "snippetWidthWide"]]);
    widthSelect.addEventListener("change", () => { previewWidth = widthSelect.value; renderPreview(); });
    previewToolbar.append(previewLead, compareButton, themeButton, sceneSelect, widthSelect, stopButton);
    const previewShell = node("div", "sw-studio__preview");
    // T-7022：双栏预览——左=已保存版本效果（显式渲染保存代码，不冒用 baseline 原始
    // 样例标志），右=当前草稿效果；两栏共享场景/宽度/主题观察环境；窄容器降级为
    // 单栏（compareButton 切换，沿用 showOriginal 语义）；无基线时左栏明确空态。
    const previewDual = node("div", "sw-studio__preview-dual");
    const savedPane = node("section", "sw-studio__preview-pane sw-studio__preview-pane--saved");
    const savedPaneHead = node("div", "sw-studio__preview-pane-head");
    savedPaneHead.append(node("span", "sw-studio__preview-pane-label", t("snippetPaneSaved")));
    const savedCanvas = node("div", "sw-studio__preview-canvas sw-studio__preview-canvas--saved");
    const savedEmpty = node("p", "sw-studio__preview-pane-empty", t("snippetPaneSavedEmpty"));
    savedPane.append(savedPaneHead, savedCanvas, savedEmpty);
    const draftPane = node("section", "sw-studio__preview-pane sw-studio__preview-pane--draft");
    const draftPaneHead = node("div", "sw-studio__preview-pane-head");
    draftPaneHead.append(node("span", "sw-studio__preview-pane-label", t("snippetPaneDraft")));
    const previewContainer = node("div", "sw-studio__preview-canvas");
    draftPane.append(draftPaneHead, previewContainer);
    const previewLoading = node("div", "sw-studio__preview-loading");
    previewLoading.append(node("span", "sw-studio__spinner"), node("span", "", t("snippetPreviewLoading")));
    previewDual.append(savedPane, draftPane);
    previewDual.dataset.view = "dual";
    previewShell.append(previewDual, previewLoading);
    const previewHint = node("p", "sw-studio__hint", t("snippetPreviewHint"));
    // T-6987：能力回执行——场景/宽度/主题/探针/脚本/网络/语义边界每次预览如实呈现。
    const previewReceipt = node("div", "sw-studio__preview-receipt");
    previewReceipt.setAttribute("role", "status");
    previewReceipt.setAttribute("aria-live", "polite");
    // T-6988：CSS 覆盖诊断——命中/可能未命中/未知三态与错误行列，原生 details 折叠。
    const diagnosticsDetails = node("details", "sw-studio__diagnostics");
    const diagnosticsSummary = node("summary", "sw-studio__diagnostics-summary");
    const diagnosticsBody = node("div", "sw-studio__diagnostics-body");
    diagnosticsDetails.append(diagnosticsSummary, diagnosticsBody);
    diagnosticsDetails.hidden = true;
    previewSection.append(previewToolbar, previewReceipt, previewShell, previewHint, diagnosticsDetails);
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
    const orderMeta = node("p", "sw-studio__hint sw-studio__order-meta");
    const cascadeHint = node("p", "sw-studio__hint sw-studio__cascade-hint");
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
    const publishField = node("label", "sw-studio__check-field");
    const publishInput = node("input", "sw-studio__check");
    publishInput.type = "checkbox";
    publishInput.setAttribute("aria-label", t("snippetDisabledInPublish"));
    publishInput.addEventListener("change", changed);
    publishField.append(publishInput, node("span", "", t("snippetDisabledInPublish")));
    const publishHint = node("p", "sw-studio__hint", t("snippetDisabledInPublishHint"));
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
    const masterSection = node("section", "sw-studio__master-section");
    const masterTitle = node("strong", "sw-studio__master-title", t("snippetMasterTitle"));
    const masterHint = node("p", "sw-studio__hint", t("snippetCascadeHint"));
    const masterControls = node("div", "sw-studio__master-controls");
    const masterButtons = {};
    for (const [type, labelKey] of [["css", "snippetMasterCSS"], ["js", "snippetMasterJS"]]) {
        const button = node("button", "sw-studio__master-toggle");
        button.type = "button";
        button.dataset.masterType = type;
        button.addEventListener("click", () => void toggleMaster(type));
        masterButtons[type] = {button, labelKey};
        masterControls.appendChild(button);
    }
    masterSection.append(masterTitle, masterHint, masterControls);
    const gistSection = node("details", "sw-studio__gist");
    const gistTitle = node("summary", "sw-studio__master-title", t("snippetGist"));
    const gistHint = node("p", "sw-studio__hint", t("snippetGistHint"));
    const gistTokenLabel = node("label", "sw-studio__field", t("snippetGistToken"));
    const gistTokenInput = node("input", "sw-studio__input");
    gistTokenInput.type = "password";
    gistTokenInput.autocomplete = "off";
    gistTokenInput.spellcheck = false;
    gistTokenInput.maxLength = 512;
    gistTokenInput.placeholder = t("snippetGistTokenPlaceholder");
    gistTokenInput.setAttribute("aria-label", t("snippetGistToken"));
    gistTokenLabel.appendChild(gistTokenInput);
    const gistTokenState = node("span", "sw-studio__hint");
    const gistTokenActions = node("div", "sw-studio__commands");
    const gistSaveTokenButton = action("snippetGistSaveToken", () => {
        const token = gistTokenInput.value.trim();
        const next = normalizeGistSettings({...readGistSettings(), token});
        if (!next.token) { setStatus(t("snippetGistTokenRequired"), "error"); return; }
        if (!persistGistSettings(next)) return;
        gistEditingToken = false;
        gistTokenInput.value = "";
        syncGistFields();
        setStatus(t("snippetGistTokenSet"), "ready");
    }, "is-quiet");
    const gistClearTokenButton = action("snippetGistClearToken", () => {
        if (!persistGistSettings({...readGistSettings(), token: ""})) return;
        gistEditingToken = true;
        gistTokenInput.value = "";
        syncGistFields();
        setStatus(t("snippetGistClearToken"), "ready");
    }, "is-quiet");
    const gistReplaceTokenButton = action("snippetGistReplaceToken", () => {
        gistEditingToken = true;
        syncGistFields();
        gistTokenInput.focus();
    }, "is-quiet");
    gistTokenActions.append(gistSaveTokenButton, gistReplaceTokenButton, gistClearTokenButton);
    const gistDescriptionInput = node("input", "sw-studio__input");
    gistDescriptionInput.maxLength = 256;
    gistDescriptionInput.setAttribute("aria-label", t("snippetGistDescription"));
    const gistDescriptionLabel = node("label", "sw-studio__field", t("snippetGistDescription"));
    gistDescriptionLabel.appendChild(gistDescriptionInput);
    const gistUrlInput = node("input", "sw-studio__input");
    gistUrlInput.type = "url";
    gistUrlInput.maxLength = 256;
    gistUrlInput.placeholder = "https://gist.github.com/...";
    gistUrlInput.setAttribute("aria-label", t("snippetGistUrl"));
    const gistUrlLabel = node("label", "sw-studio__field", t("snippetGistUrl"));
    gistUrlLabel.appendChild(gistUrlInput);
    gistUrlInput.value = gistSettings.links[draft.id] || gistSourceUrl;
    gistUrlInput.addEventListener("input", () => {
        cancelGistRequest(false);
        gistPreview = null;
        gistPreviewBox.replaceChildren();
        syncGistFields();
    });
    const gistActions = node("div", "sw-studio__commands");
    const gistPublishButton = action("snippetGistPublish", () => { void publishCurrentGist(); }, "is-primary");
    const gistUpdateButton = action("snippetGistPublishUpdate", () => { void publishCurrentGist(true); }, "is-secondary");
    const gistPreviewButton = action("snippetGistImportPreview", () => { void previewGistImport(); }, "is-quiet");
    const gistCancelButton = action("snippetAICancel", () => cancelGistRequest(), "is-quiet");
    gistActions.append(gistPublishButton, gistUpdateButton, gistPreviewButton, gistCancelButton);
    const gistPreviewBox = node("div", "sw-studio__gist-preview");
    gistSection.append(gistTitle, gistHint, gistTokenLabel, gistTokenState, gistTokenActions, gistDescriptionLabel, gistUrlLabel, gistActions, gistPreviewBox);
    // Keep the original core append contract stable for host wiring audits; optional
    // controls are inserted around that stable spine so the details panel remains
    // ordered without forcing every consumer to understand the newer fields.
    details.append(detailsTitle, selection, nameLabel, typeSelect, typeNote, state, commands, description, capabilities);
    const metadataDetails = node("details", "sw-studio__metadata");
    metadataDetails.appendChild(node("summary", "", t("snippetMetadata")));
    const metadataInputs = {};
    for (const [key, label, max] of [["alias", "snippetAlias", 64], ["tags", "snippetTags", 263], ["summary", "snippetSummary", 256]]) {
        const field = node("label", "sw-studio__ai-field", t(label));
        const input = node("input", "sw-studio__input");
        input.maxLength = max;
        input.setAttribute("aria-label", t(label));
        field.appendChild(input);
        metadataInputs[key] = input;
        metadataDetails.appendChild(field);
    }
    const pinnedField = node("label", "sw-studio__consent", t("snippetPinned"));
    metadataInputs.pinned = node("input");
    metadataInputs.pinned.type = "checkbox";
    metadataInputs.pinned.setAttribute("aria-label", t("snippetPinned"));
    pinnedField.prepend(metadataInputs.pinned);
    metadataDetails.appendChild(pinnedField);
    details.appendChild(metadataDetails);
    function readMetadataFields() {
        return {alias: metadataInputs.alias.value, tags: metadataInputs.tags.value.split(/[,，]/),
            summary: metadataInputs.summary.value, pinned: metadataInputs.pinned.checked};
    }
    function syncMetadataFields() {
        const value = session.metadata || (baseline ? snippetGroups.metadata?.entries.find((entry) => entry.snippetId === baseline.id) || {} : {});
        metadataInputs.alias.value = value.alias || "";
        metadataInputs.tags.value = (value.tags || []).join(", ");
        metadataInputs.summary.value = value.summary || "";
        metadataInputs.pinned.checked = value.pinned === true;
    }
    function persistSnippetMetadata(snippetId, value) {
        if (!groups && !value.alias && !value.summary && !value.tags?.some((tag) => tag.trim()) && !value.pinned) return true;
        const next = setSnippetMetadata(snippetGroups, snippetId, {...value, modifiedAt: Date.now()});
        try {
            if (typeof groups?.save !== "function") throw new Error(t("snippetUnavailable"));
            groups.save(next);
            snippetGroups = next;
            pickerRefresh?.();
            return true;
        } catch (error) { setStatus(errorText(error), "error"); return false; }
    }
    for (const input of Object.values(metadataInputs)) {
        input.addEventListener("input", () => {
            session.metadata = readMetadataFields();
            syncFields(true);
        });
        input.addEventListener("change", () => {
            session.metadata = readMetadataFields();
            if (baseline && persistSnippetMetadata(baseline.id, session.metadata)) session.metadata = null;
            syncFields(true);
        });
    }
    details.insertBefore(orderMeta, nameLabel);
    details.insertBefore(cascadeHint, nameLabel);
    details.insertBefore(publishField, commands);
    details.insertBefore(publishHint, commands);
    details.insertBefore(masterSection, description);
    details.insertBefore(gistSection, description);
    const editorSection = node("section", "sw-studio__editor-section");
    // T-6959：查找条状态（声明须先于 DOM 构建；逻辑函数声明提升，见后）
    let findBar = null;
    let findQueryInput = null;
    let findReplaceInput = null;
    let findCountLabel = null;
    let findMatches = [];
    let findCursor = -1;
    const composingFindInputs = new Set();
    let replaceArmed = false;
    const editorBar = node("div", "sw-studio__section-bar");
    const editorLead = node("div", "sw-studio__section-lead");
    const editorTitle = node("h2", "sw-studio__section-title", t("snippetCode"));
    const editorMeta = node("span", "sw-studio__editor-meta");
    editorLead.append(editorTitle, editorMeta);
    // T-6957：编辑区局部撤销/重做（可用态在 syncFields 按草稿历史同步）
    const draftUndoButton = action("snippetUndo", () => undoDraft());
    const draftRedoButton = action("snippetRedo", () => redoDraft());
    // T-6959：编辑区查找条开关（按需展开）
    const findToggleButton = action("snippetFindBar", () => toggleFindBar());
    const chooseButton = action("snippetChoose", () => openPicker());
    const importButton = action("snippetImport", () => fileInput.click());
    const newButton = action("snippetNew", () => { guardLeave(() => choose({name: "", type: "css", content: ""}, null)); });
    // T-7064：复制草稿全文——Clipboard API 优先，无权限/非安全上下文回退 execCommand
    function copyText(text) {
        if (!text) { setStatus(t("snippetCopyEmpty"), "warn"); return; }
        const fallbackCopy = () => {
            const scratch = document.createElement("textarea");
            scratch.value = text;
            scratch.setAttribute("readonly", "");
            scratch.style.position = "fixed";
            scratch.style.opacity = "0";
            document.body.appendChild(scratch);
            scratch.select();
            const ok = document.execCommand && document.execCommand("copy");
            scratch.remove();
            if (!ok) throw new Error("execCommand unavailable");
        };
        const job = (navigator.clipboard && navigator.clipboard.writeText)
            ? navigator.clipboard.writeText(text)
            : Promise.resolve().then(fallbackCopy);
        job.then(() => setStatus(t("snippetCopied"), "ready")).catch(() => setStatus(t("snippetCopyFailed"), "warn"));
    }
    const copyButton = action("snippetCopy", () => copyText(draft.content || ""));
    const snippetStoreButton = action("snippetStore", () => openPicker(true));
    editorBar.append(editorLead, draftUndoButton, draftRedoButton, findToggleButton, chooseButton, snippetStoreButton, importButton, newButton, copyButton);
    const editor = node("textarea", "sw-studio__editor");
    editor.setAttribute("aria-label", t("snippetCode"));
    const editorFrame = node("div", "sw-studio__editor-frame");
    const lineNumbers = node("div", "sw-studio__line-numbers");
    editorFrame.append(lineNumbers, editor);
    const fileInput = node("input");
    fileInput.type = "file";
    fileInput.accept = ".css,.js";
    fileInput.hidden = true;
    const restoreInput = node("input");
    restoreInput.type = "file";
    restoreInput.accept = ".json,application/json";
    restoreInput.hidden = true;
    // T-6959：查找条（隐藏起步）——查找 + 替换为 + 计数 + 上/下一处 + 替换全部（两步确认）
    findBar = node("div", "sw-studio__find");
    findBar.hidden = true;
    findQueryInput = node("input", "sw-studio__find-query b3-text-field");
    findQueryInput.placeholder = t("snippetFindQuery");
    findQueryInput.setAttribute("aria-label", t("snippetFindQuery"));
    findReplaceInput = node("input", "sw-studio__find-replace b3-text-field");
    findReplaceInput.placeholder = t("snippetFindReplaceTo");
    findReplaceInput.setAttribute("aria-label", t("snippetFindReplaceTo"));
    findCountLabel = node("span", "sw-studio__find-count");
    findCountLabel.setAttribute("aria-live", "polite");
    const findPrevButton = node("button", "b3-button b3-button--text", "‹");
    findPrevButton.setAttribute("aria-label", t("snippetFindPrev"));
    findPrevButton.addEventListener("click", () => moveFindCursor(-1));
    const findNextButton = node("button", "b3-button b3-button--text", "›");
    findNextButton.setAttribute("aria-label", t("snippetFindNext"));
    findNextButton.addEventListener("click", () => moveFindCursor(1));
    const replaceAllButton = node("button", "b3-button b3-button--text", t("snippetFindReplaceAll"));
    replaceAllButton.addEventListener("click", () => applyReplaceAll(replaceAllButton));
    const findCloseButton = node("button", "b3-button b3-button--text", "✕");
    findCloseButton.setAttribute("aria-label", t("cancel"));
    findCloseButton.addEventListener("click", () => {
        findBar.hidden = true;
        findToggleButton.setAttribute("aria-expanded", "false");
        findMatches = [];
        findCursor = -1;
        replaceArmed = false;
        replaceAllButton.textContent = t("snippetFindReplaceAll");
        findCountLabel.textContent = "";
        try { editor.focus({preventScroll: true}); } catch (_) { editor.focus(); }
    });
    // 查找输入保持焦点与未提交文本；compositionend 和尾随同值 input 只结算一次。
    function bindFindInput(field, onCommit) {
        let committedValue = null;
        field.addEventListener("compositionstart", () => {
            composingFindInputs.add(field);
            committedValue = null;
        });
        field.addEventListener("compositionend", () => {
            composingFindInputs.delete(field);
            committedValue = field.value;
            onCommit();
        });
        field.addEventListener("input", (event) => {
            if (composingFindInputs.has(field) || event.isComposing) return;
            const alreadyCommitted = committedValue !== null && committedValue === field.value;
            committedValue = null;
            if (!alreadyCommitted) onCommit();
        });
        field.addEventListener("keydown", (event) => {
            if (composingFindInputs.has(field) || event.isComposing || event.keyCode === 229) event.stopPropagation();
        });
    }
    bindFindInput(findQueryInput, () => {
        replaceArmed = false;
        replaceAllButton.textContent = t("snippetFindReplaceAll");
        refreshFindMatches();
    });
    bindFindInput(findReplaceInput, () => {
        replaceArmed = false;
        replaceAllButton.textContent = t("snippetFindReplaceAll");
    });
    findQueryInput.addEventListener("keydown", (event) => {
        if (composingFindInputs.has(findQueryInput) || event.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter") {
            event.preventDefault();
            moveFindCursor(event.shiftKey ? -1 : 1);
        } else if (event.key === "Escape") {
            event.preventDefault();
            findCloseButton.click();
        }
    });
    findBar.append(findQueryInput, findCountLabel, findPrevButton, findNextButton, findReplaceInput, replaceAllButton, findCloseButton);
    editorSection.append(editorBar, findBar, editor, fileInput, restoreInput);
    editorFrame.append(editor);
    editorSection.insertBefore(editorFrame, fileInput);
    lower.append(details, editorSection);
    main.append(previewSection, lower);
    const aside = node("aside", "sw-studio__ai");
    aside.setAttribute("aria-label", t("snippetAI"));
    const aiHeader = node("div", "sw-studio__ai-header");
    const aiTitle = node("h2", "sw-studio__ai-title", t("snippetAI"));
    const aiProvider = node("span", "sw-studio__state-badge", t("snippetAIIdle"));
    aiHeader.append(aiTitle, aiProvider);
    const aiNote = node("p", "sw-studio__hint", t("snippetAIHint"));
    const aiProviderInfo = node("p", "sw-studio__hint", t("snippetAIProviderInfo"));
    const contextOptions = node("div", "sw-studio__ai-context-options");
    const contextInputs = {};
    for (const [key, label] of [["code", "snippetAIIncludeCode"], ["history", "snippetAIIncludeHistory"]]) {
        const field = node("label", "sw-studio__consent", t(label));
        const input = node("input");
        input.type = "checkbox";
        input.setAttribute("aria-label", t(label));
        field.prepend(input);
        contextOptions.appendChild(field);
        contextInputs[key] = input;
    }
    const contextSummary = node("p", "sw-studio__hint sw-studio__ai-context");
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
    const cancelAIButton = action("snippetAICancel", () => { aiGeneration += 1; ai.cancel(); cancelAIButton.disabled = true; setAIStatus(t("snippetCancelled"), false, "cancelled"); updateAIActions(); });
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
        // T-6957：AI 接受（整段/逐 hunk 合并）作为一个明确事务落账
        commitDraftHistory();
        renderPreview();
        setStatus(t("snippetAIAccepted"), "ready");
    }, "is-primary");
    acceptButton.disabled = true;
    const candidateActions = node("div", "sw-studio__ai-actions");
    const candidateCopy = action("snippetAICopyCandidate", () => { if (candidate) copyText(candidate.content); });
    const candidateExport = action("snippetAIExportCandidate", () => {
        if (!candidate) return;
        download(`candidate.${candidate.mode === "explain" ? "txt" : candidate.type}`, candidate.content, "text/plain");
        setAIStatus(t("snippetAIExportCandidate"), true);
    });
    const candidateStale = node("p", "sw-studio__hint sw-studio__ai-stale", t("snippetAICandidateStale"));
    candidateActions.append(candidateCopy, candidateExport);
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
        const requiresCode = modeSelect.value !== "generate";
        contextInputs.history.disabled = modeSelect.value !== "iterate";
        const contextCode = modeSelect.value === "iterate" && candidate?.type === draft.type && candidate?.mode !== "explain" ? candidate.content : draft.content;
        const selectedCode = contextInputs.code.checked ? contextCode : "";
        const historyCount = modeSelect.value === "iterate" && contextInputs.history.checked ? aiHistory.slice(-6).length : 0;
        contextSummary.textContent = t("snippetAIContextSummary").replace("{bytes}", formatBytes(byteLength(selectedCode))).replace("{messages}", String(historyCount));
        if (cancelAIButton.disabled) aiButton.disabled = busy || !aiConsentInput.checked || !prompt.value.trim()
            || (requiresCode && !selectedCode.trim());
        candidateCopy.disabled = candidateExport.disabled = !candidate;
        candidateStale.hidden = !candidate || candidate.revision === revision;
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
        updateAIActions();
    });
    Object.values(contextInputs).forEach((input) => input.addEventListener("change", updateAIActions));
    aiConsentInput.addEventListener("change", updateAIActions);
    prompt.addEventListener("input", updateAIActions);
    aside.append(aiHeader, aiNote, aiProviderInfo, modeField, modeHint, contextOptions, contextSummary, prompt, aiConsent, aiActions, aiStatus, aiResultPanel, candidateStale, candidateActions, acceptButton);
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
    layout.append(library, main, aside);
    root.replaceChildren(header, layout, footer);
    const preview = createSnippetPreview(previewContainer, {
        title: t("snippetPreview"),
        labels: previewLabels(t),
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
    // T-7022：左栏独立隔离实例——渲染「已保存版本」的保存代码（baseline.type +
    // original），与草稿栏互不共享 iframe；环境（场景/宽度/主题）随每次渲染同步。
    const previewSaved = createSnippetPreview(savedCanvas, {
        title: t("snippetPaneSaved"),
        labels: previewLabels(t),
    });
    // 左栏内容签名：保存代码/身份或观察环境变化才重建 iframe，输入草稿时不闪动。
    let savedRenderKey = "";
    // T-7022 按钮盘点（随双栏落账）：previewLead=标题；compareButton=单栏模式
    // 「已保存/草稿」切换（双栏隐藏）；themeButton/sceneSelect/widthSelect=观察
    // 环境（两栏同步）；stopButton=重置预览；snippetRunJS 已随安全半场移除。
    const SNIPPET_DUAL_PANE_MIN = 860;
    const dualPaneObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
        if (disposed) return;
        const dual = previewShell.clientWidth >= SNIPPET_DUAL_PANE_MIN;
        if ((previewDual.dataset.view === "dual") !== dual) renderPreview();
    }) : null;
    dualPaneObserver?.observe(previewShell);
    const errorText = (error) => {
        const code = String(error?.message || error?.code || "");
        if (code.startsWith("gist-")) {
            if (code === "gist-token-required" || code === "gist-token-invalid") return t("snippetGistTokenRequired");
            if (code === "gist-conflict") return t("snippetGistStale");
            return t("snippetGistFailed");
        }
        if (/restore-unverified/i.test(code)) return t("snippetRestorePending");
        if (code === "permission_denied") return t("snippetAIPermissionDenied");
        if (code === "context_too_large") return t("snippetAIContextTooLarge");
        if (/backup|restore/i.test(code)) return t("snippetRestoreInvalid");
        if (/conflict|changed|missing|duplicate/i.test(code)) return t("snippetConflict");
        if (/unsupported|unavailable|404/i.test(code)) return t("snippetUnavailable");
        if (/cancel|abort|disposed/i.test(code)) return t("snippetCancelled");
        if (/timeout/i.test(code)) return t("snippetTimeout");
        if (/size|large|limit/i.test(code)) return t("snippetTooLarge");
        if (/invalid|malformed|truncat/i.test(code)) return t("snippetInvalid");
        return t("snippetFailed");
    };
    const gistFetch = typeof win.fetch === "function" ? win.fetch.bind(win) : globalThis.fetch;
    function readGistSettings() {
        try { return gist?.load ? normalizeGistSettings(gist.load()) : gistSettings; }
        catch (_) { return gistSettings; }
    }
    function persistGistSettings(next) {
        try {
            gist?.save?.(next);
            gistSettings = next;
            return true;
        } catch (_) {
            setStatus(t("snippetFailed"), "error");
            return false;
        }
    }
    function cancelGistRequest(showStatus = true) {
        const uncertain = gistWriting;
        gistGeneration += 1;
        gistController?.abort();
        gistController = null;
        gistBusy = false;
        gistWriting = false;
        if (!disposed) {
            syncGistFields();
            layout.setAttribute("aria-busy", String(loading || busy));
            if (showStatus) setStatus(t(uncertain ? "snippetGistPending" : "snippetCancelled"), uncertain ? "warn" : "ready");
        }
    }
    function syncGistFields() {
        const hasToken = Boolean(gistSettings.token);
        gistTokenState.textContent = hasToken ? `${t("snippetGistTokenSet")} · ${maskGistToken(gistSettings.token)}` : t("snippetGistTokenPlaceholder");
        gistTokenState.dataset.state = hasToken ? "ready" : "blocked";
        gistTokenLabel.hidden = hasToken && !gistEditingToken;
        gistSaveTokenButton.hidden = hasToken && !gistEditingToken;
        gistReplaceTokenButton.hidden = !hasToken || gistEditingToken;
        gistReplaceTokenButton.disabled = gistBusy;
        gistSaveTokenButton.disabled = gistBusy;
        gistClearTokenButton.disabled = gistBusy || !hasToken;
        gistPublishButton.disabled = gistBusy || busy || loading || loadFailed || dirty() || !baseline || !draft.content.trim();
        gistUpdateButton.disabled = gistPublishButton.disabled || !gistUrlInput.value.trim();
        gistPreviewButton.disabled = gistBusy || loading || loadFailed || !gistUrlInput.value.trim();
        gistTokenInput.disabled = gistBusy;
        gistDescriptionInput.disabled = gistBusy;
        gistUrlInput.disabled = gistBusy;
        gistCancelButton.hidden = !gistBusy;
        gistUpdateButton.textContent = t(gistPreview ? "snippetGistPublishUpdate" : "snippetGistPrepareUpdate");
    }
    function renderGistPreview() {
        gistPreviewBox.replaceChildren();
        if (!gistPreview) return;
        if (gistPreview.parseable.length === 0) {
            gistPreviewBox.appendChild(node("p", "sw-studio__hint", t("snippetGistPreviewEmpty")));
        }
        gistPreview.files.forEach((file) => {
            const row = node("div", `sw-studio__gist-row ${file.parseable ? "is-ready" : "is-muted"}`);
            const title = node("strong", "sw-studio__gist-file", file.filename);
            const state = node("span", "sw-studio__tag", file.parseable ? t("snippetGistParseable") : t("snippetGistUnparseable"));
            row.append(title, state);
            if (file.remoteId && file.parseable) {
                const local = snippets.find((entry) => entry.id === file.remoteId);
                if (local) {
                    const diff = buildSnippetDiff(local.content || "", file.content || "");
                    const summary = summarizeDiff(local.content || "", file.content || "", diff);
                    const comparison = node("details", "sw-studio__gist-diff");
                    comparison.appendChild(node("summary", "sw-studio__hint", t("snippetGistDiff").replace("{added}", String(summary.added)).replace("{removed}", String(summary.removed))));
                    diff.rows.slice(0, 200).forEach((line) => comparison.appendChild(node("pre", "sw-studio__gist-diff-line is-" + line.type,
                        (line.type === "ins" ? "+ " : line.type === "del" ? "- " : "  ") + line.text)));
                    if (diff.rows.length > 200 || diff.degraded) comparison.appendChild(node("p", "sw-studio__hint", t("snippetDiffDegraded")));
                    row.appendChild(comparison);
                }
            }
            if (file.parseable) {
                const index = gistPreview.parseable.indexOf(file);
                const capturedPreview = gistPreview;
                const importButton = node("button", "sw-studio__button is-quiet", t("snippetGistImport"));
                importButton.type = "button";
                importButton.addEventListener("click", () => guardLeave(() => {
                    const imported = buildGistImportDraft(capturedPreview, index);
                    choose(imported, null);
                    setStatus(t("snippetGistImported"), "ready");
                }));
                row.appendChild(importButton);
            }
            gistPreviewBox.appendChild(row);
        });
    }
    async function previewGistImport() {
        if (gistBusy || loading || loadFailed || disposed) return;
        const token = readGistSettings().token;
        const generation = ++gistGeneration;
        const startedRevision = revision;
        gistController = new AbortController();
        gistBusy = true;
        gistPreview = null;
        gistPreviewBox.replaceChildren(node("p", "sw-studio__hint", t("snippetGistPreviewLoading")));
        syncFields();
        try {
            const next = await fetchGistPreview(gistUrlInput.value, {token, fetchImpl: gistFetch, signal: gistController.signal});
            if (disposed || generation !== gistGeneration) return;
            if (revision !== startedRevision) { gistPreviewBox.replaceChildren(); setStatus(t("snippetGistStale"), "warn"); return; }
            gistPreview = next;
            gistDescriptionInput.value = next.description;
            renderGistPreview();
            setStatus(t("snippetGistLink"), "ready");
        } catch (error) {
            if (disposed || generation !== gistGeneration) return;
            gistPreview = null;
            renderGistPreview();
            setStatus(errorText(error), "error");
        } finally {
            if (!disposed && generation === gistGeneration) {
                gistBusy = false;
                gistController = null;
                syncFields();
            }
        }
    }
    async function publishCurrentGist(update = false) {
        if (gistBusy || busy || loading || loadFailed || disposed || !baseline || dirty() || !draft.content.trim()) return;
        const token = readGistSettings().token;
        if (!token) { setStatus(t("snippetGistTokenRequired"), "error"); return; }
        if (update && !gistUrlInput.value.trim()) return;
        if (update && !gistPreview) { await previewGistImport(); return; }
        const captured = {...draft};
        const expected = gistPreview;
        const generation = ++gistGeneration;
        gistController = new AbortController();
        gistBusy = true;
        gistWriting = true;
        syncFields();
        try {
            const result = await publishGist({
                token, snippet: captured, gistUrl: update ? gistUrlInput.value : "",
                description: gistDescriptionInput.value || captured.name, fetchImpl: gistFetch,
                expected, signal: gistController.signal,
            });
            if (disposed || generation !== gistGeneration) return;
            gistUrlInput.value = result.url;
            gistPreview = null;
            gistPreviewBox.replaceChildren();
            if (!persistGistSettings(rememberGistLink(readGistSettings(), captured.id, result.url))) {
                setStatus(t("snippetGistPending") + " " + result.url, "warn");
                return;
            }
            setStatus(t("snippetGistPublished"), "ready");
        } catch (error) {
            if (disposed || generation !== gistGeneration) return;
            gistPreview = null;
            gistPreviewBox.replaceChildren();
            setStatus(t("snippetGistPending") + " " + errorText(error), "error");
        } finally {
            if (!disposed && generation === gistGeneration) {
                gistBusy = false;
                gistWriting = false;
                gistController = null;
                syncFields();
            }
        }
    }
    const byteLength = (content) => new TextEncoder().encode(String(content || "")).byteLength;
    const lineLength = (content) => content ? String(content).split(/\r\n|\r|\n/).length : 0;
    const formatBytes = (bytes) => bytes < 1024 ? `${bytes} ${t("snippetBytes")}` : `${(bytes / 1024).toFixed(1)} KiB`;
    const sourceLabel = () => t(selectedSource === "native" ? "snippetMine" : selectedSource === "builtin" ? "snippetBuiltins" : "snippetDraft");
    const masterKey = (type) => type === "css" ? "enabledCSS" : "enabledJS";
    function syncMasterControls() {
        for (const [type, entry] of Object.entries(masterButtons)) {
            const value = masterFlags[masterKey(type)];
            const stateLabel = value === true ? t("snippetMasterEnabled") : value === false ? t("snippetMasterDisabled") : t("snippetMasterUnavailable");
            entry.button.textContent = `${t(entry.labelKey)} · ${stateLabel}`;
            entry.button.setAttribute("aria-pressed", value === true ? "true" : "false");
            entry.button.classList.toggle("is-active", value === true);
            entry.button.disabled = busy || loading || loadFailed || masterBusy || typeof value !== "boolean";
        }
    }
    async function refreshMasterFlags() {
        if (typeof store.readSettings !== "function") return;
        try {
            const next = await store.readSettings();
            if (disposed || typeof next?.enabledCSS !== "boolean" || typeof next?.enabledJS !== "boolean") return;
            masterFlags = {enabledCSS: next.enabledCSS, enabledJS: next.enabledJS};
            lastSnapshotSignature = snippetSnapshotSignature({snippets, settings: snapshotSettings()});
            syncFields();
        } catch (_) { /* an unavailable host setting remains visibly unavailable */ }
    }
    async function toggleMaster(type) {
        if (busy || loading || loadFailed || masterBusy || disposed) return;
        if (typeof store.setMaster !== "function") {
            setStatus(t("snippetMasterUnavailable"), "blocked");
            return;
        }
        const key = masterKey(type);
        const current = masterFlags[key];
        if (typeof current !== "boolean") {
            setStatus(t("snippetMasterUnavailable"), "blocked");
            return;
        }
        masterBusy = true;
        syncFields();
        try {
            const next = await store.setMaster(type, !current);
            if (disposed) return;
            if (typeof next?.enabledCSS !== "boolean" || typeof next?.enabledJS !== "boolean") throw new Error("snippet-config-unavailable");
            masterFlags = {enabledCSS: next.enabledCSS, enabledJS: next.enabledJS};
            setStatus(t("snippetMasterSaved"), "ready");
        } catch (error) {
            if (!disposed) setStatus(errorText(error), "error");
        } finally {
            masterBusy = false;
            if (!disposed) syncFields();
        }
    }
    function syncFields(preserveMetadataInput = false) {
        nameInput.value = draft.name;
        typeSelect.value = draft.type;
        editor.value = draft.content;
        publishInput.checked = draft.disabledInPublish === true;
        session.draft = {...draft};
        session.baseline = baseline ? {...baseline} : null;
        if (!preserveMetadataInput) syncMetadataFields();
        for (const input of Object.values(metadataInputs)) input.disabled = busy || loading || !groups;
        session.gistSourceUrl = gistSourceUrl;
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
        const nativePosition = baseline ? snippets.findIndex((item) => item.id === baseline.id) : -1;
        orderMeta.textContent = nativePosition >= 0
            ? `${t("snippetOrderHint")} ${nativePosition + 1}/${snippets.length}`
            : `${t("snippetOrderHint")} · ${t("snippetDraft")}`;
        cascadeHint.textContent = draft.type === "css" ? t("snippetCascadeHint") : t("snippetJSCascadeHint");
        headerContext.textContent = `${shortName} · ${draft.type.toUpperCase()}`;
        headerState.textContent = savedState;
        headerState.className = `sw-studio__state-badge ${stateClass}`;
        editorMeta.textContent = `${formatBytes(bytes)} · ${lines} ${t("snippetLines")}`;
        syncEditorChrome();
        previewType.textContent = draft.type.toUpperCase();
        compareButton.disabled = busy || !baseline;
        compareButton.title = baseline ? t("snippetCompare") : t("snippetCompareUnavailable");
        if (!baseline) {
            showOriginal = false;
            compareButton.setAttribute("aria-pressed", "false");
        }
        typeSelect.disabled = Boolean(baseline) || busy || gistWriting;
        typeNote.hidden = !baseline;
        saveButton.textContent = t(baseline ? "snippetSave" : "snippetSaveDisabled");
        toggleButton.textContent = t(baseline?.enabled ? "snippetDisable" : "snippetEnable");
        state.textContent = t(baseline ? baseline.enabled ? "snippetEnabled" : "snippetDisabled" : "snippetDraft");
        const masterEnabled = masterFlags[masterKey(draft.type)];
        if (masterEnabled === false) state.textContent += ` · ${t("snippetMasterOff")}`;
        saveButton.disabled = busy || gistWriting || loading || loadFailed || !draft.name.trim() || !draft.content.trim();
        toggleButton.disabled = busy || gistWriting || loading || loadFailed || !baseline;
        deleteButton.disabled = busy || gistWriting || loading || loadFailed || !baseline;
        exportButton.disabled = !draft.content;
        submissionButton.disabled = !draft.content;
        chooseButton.disabled = busy || gistWriting;
        importButton.disabled = busy || gistWriting;
        newButton.disabled = busy || gistWriting;
        backupButton.disabled = busy || loading || loadFailed;
        restoreButton.disabled = busy || loading || loadFailed;
        restoreUndoButton.hidden = !restoreUndo;
        restoreUndoButton.disabled = busy || loading || loadFailed || !restoreUndo;
        // T-6959：busy 期间查找/替换控件跟随禁用
        if (findQueryInput) findQueryInput.disabled = busy;
        if (findReplaceInput) findReplaceInput.disabled = busy;
        // T-6957：撤销/重做可用态跟随草稿历史
        draftUndoButton.disabled = busy || !canUndoDraftHistory(draftHistory);
        draftRedoButton.disabled = busy || !canRedoDraftHistory(draftHistory);
        refresh.disabled = busy || loading;
        nameInput.disabled = busy || gistWriting;
        editor.disabled = busy || gistWriting;
        publishInput.disabled = busy || gistWriting || loading || loadFailed;
        syncMasterControls();
        syncGistFields();
        layout.setAttribute("aria-busy", String(loading || busy || gistBusy));
        updateAIActions();
        updateAIMode();
        renderLibrary();
    }
    async function toggleNativeSnippet(item, busySet, refresh) {
        if (item?.source === "builtin" || !item?.id || busy || loading || loadFailed || disposed) return;
        if (dirty()) {
            setStatus(t("snippetSaveFirst"), "blocked");
            return;
        }
        if (busySet.has(item.id)) return;
        const latest = snippets.find((entry) => entry.id === item.id);
        if (!latest) {
            setStatus(t("snippetUnavailable"), "blocked");
            return;
        }
        if (latest.type === "js" && !latest.enabled && typeof win.confirm === "function" && !win.confirm(t("snippetConfirmJS"))) return;
        busySet.add(item.id);
        refresh?.();
        try {
            const next = await store.mutate(latest, "toggle", {...latest, enabled: !latest.enabled});
            if (disposed) return;
            if (!Array.isArray(next)) throw new Error("snippet-invalid-response");
            snippets = next;
            lastSnapshotSignature = snippetSnapshotSignature({snippets, settings: snapshotSettings()});
            const saved = next.find((entry) => entry.id === latest.id);
            if (!saved) {
                setStatus(t("snippetUnavailable"), "error");
                return;
            }
            if (baseline?.id === latest.id) {
                baseline = {...saved};
                draft = {...draft, enabled: saved.enabled};
                syncFields();
            }
            setStatus(saved.enabled ? t("snippetEnabled") : t("snippetDisabled"), "ready");
        } catch (error) {
            if (!disposed) setStatus(errorText(error), "error");
        } finally {
            busySet.delete(item.id);
            if (!disposed) refresh?.();
        }
    }
    function renderLibrary() {
        if (!libraryList) return;
        const query = librarySearch.value.trim().toLowerCase();
        const entries = snippets.filter((item) => {
            if (libraryFilter !== "all" && item.type !== libraryFilter) return false;
            return !query || `${item.name} ${item.type}`.toLowerCase().includes(query);
        });
        libraryCount.textContent = String(entries.length);
        libraryFilterButtons.forEach((button, value) => button.setAttribute("aria-pressed", String(value === libraryFilter)));
        libraryList.replaceChildren();
        if (!entries.length) {
            libraryList.appendChild(node("p", "sw-studio__library-empty", t("snippetNoResults")));
            return;
        }
        for (const item of entries) {
            const row = node("div", "sw-studio__library-item-wrap");
            const button = node("button", "sw-studio__library-item");
            button.type = "button";
            button.dataset.librarySnippetId = item.id;
            button.classList.toggle("is-active", item.id === baseline?.id);
            button.setAttribute("aria-pressed", String(item.id === baseline?.id));
            button.disabled = libraryToggleBusy.has(item.id) || busy || loading || loadFailed;
            button.append(node("span", "sw-studio__catalog-kind", item.type.toUpperCase()), node("span", "sw-studio__library-item-copy", item.name), node("span", "sw-studio__library-item-state", item.enabled ? t("snippetEnabled") : t("snippetDisabled")));
            button.addEventListener("click", () => guardLeave(() => choose(item, item)));
            const toggle = action(item.enabled ? "snippetDisable" : "snippetEnable", (event) => {
                event.stopPropagation();
                void toggleNativeSnippet(item, libraryToggleBusy, renderLibrary);
            }, "is-quiet");
            toggle.className = "sw-studio__library-toggle";
            toggle.dataset.librarySnippetToggleId = item.id;
            toggle.setAttribute("aria-pressed", String(item.enabled === true));
            toggle.setAttribute("aria-label", `${t(item.enabled ? "snippetDisable" : "snippetEnable")}: ${item.name}`);
            toggle.title = t(item.enabled ? "snippetDisable" : "snippetEnable");
            toggle.disabled = libraryToggleBusy.has(item.id) || busy || loading || loadFailed;
            row.append(button, toggle);
            libraryList.appendChild(row);
        }
    }
    function syncEditorChrome() {
        const lineState = buildEditorLineNumbers(editor.value);
        lineNumbers.textContent = lineState.text;
        lineNumbers.dataset.lineCount = String(lineState.lineCount);
        const bracketState = analyzeEditorBrackets(editor.value);
        let status = bracketState.truncated
            ? t("snippetTooLarge")
            : bracketState.issues.length > 0
                ? `${t("snippetDiagnosticsError")}: ${bracketState.issues.length}`
                : `${t("snippetDiagnostics")} ✓`;
        editorMeta.textContent = `${formatBytes(byteLength(editor.value))} · ${lineState.lineCount} ${t("snippetLines")} · ${status}`;
    }
    function renderPreview() {
        clearTimeout(previewTimer);
        if (disposed) return;
        // T-7022：草稿栏恒渲染草稿内容；「已保存」由独立左栏承载（单栏窄容器经
        // compareButton 切换视图，不再共用同一 iframe 换内容）。
        const content = draft.content;
        // 布局判定：宽容器双栏并排；窄容器单栏（showOriginal 仅在单栏模式生效）。
        const dual = previewShell.clientWidth >= SNIPPET_DUAL_PANE_MIN;
        const savedView = !dual && showOriginal && !!baseline;
        previewDual.dataset.view = dual ? "dual" : (savedView ? "saved" : "draft");
        compareButton.hidden = dual;
        if (byteLength(content) > SNIPPET_CODE_MAX) {
            // 拒绝超限草稿时清掉旧 iframe/诊断，避免上一份可渲染内容继续冒充当前草稿。
            // 保存栏仍保留已保存版本；当前草稿栏必须明确进入错误态并等待用户缩减内容。
            preview.clear();
            previewContainer.replaceChildren();
            previewShell.dataset.state = "error";
            previewLoading.hidden = true;
            previewState.textContent = t("snippetTooLarge");
            previewState.className = "sw-studio__state-badge is-error";
            previewReceipt.textContent = t("snippetTooLarge");
            previewReceipt.dataset.theme = "error";
            diagnosticsDetails.hidden = true;
            setStatus(t("snippetTooLarge"), "error");
            return;
        }
        previewShell.dataset.state = "loading";
        previewLoading.hidden = false;
        previewState.textContent = t("snippetPreviewLoading");
        previewState.className = "sw-studio__state-badge is-loading";
        previewHint.textContent = draft.type === "js" ? `${t("snippetPreviewHint")} ${t("snippetJSPreviewUnavailable")}` : t("snippetPreviewHint");
        // T-6987：能力回执——纯模型白名单解析 + 人读格式；探针命中数与预览同源计算。
        const capability = resolvePreviewCapability({
            type: draft.type, scene: previewScene, width: previewWidth,
            dark, baseline: savedView,
            probeHits: draft.type === "css" ? analyzeCssCoverage(content) : [],
            containerWidth: previewContainer.clientWidth,
        });
        previewReceipt.textContent = formatPreviewCapability(capability, {
            scene: sceneSelect.options[sceneSelect.selectedIndex]?.textContent || capability.scene,
            width: widthSelect.options[widthSelect.selectedIndex]?.textContent || capability.viewport.id,
            theme: dark ? t("snippetDarkPreview") : t("snippetCompare"),
        }, {
            probeOn: t("snippetCapabilityProbeOn"),
            probeOff: t("snippetCapabilityProbeOff"),
            scriptCss: t("snippetCapabilityScriptCss"),
            network: t("snippetCapabilityNetwork"),
            tokenProfile: t("snippetCapabilityTokenProfile"),
            tokenBaseline: t("snippetCapabilityTokenBaseline"),
            semantics: t("snippetCapabilitySemantics"),
            singleView: t("snippetCapabilitySingleView"),
            sceneLabel: t("snippetCapabilitySceneLabel"),
            widthLabel: t("snippetCapabilityWidthLabel"),
            themeLabel: t("snippetCapabilityThemeLabel"),
        });
        previewReceipt.dataset.theme = capability.theme;
        // T-6988：覆盖诊断——仅 CSS 预览；JS 片段无样式可诊断，面板隐藏。
        if (draft.type !== "css") {
            diagnosticsDetails.hidden = true;
        } else {
            const diagnostics = analyzeSelectorDiagnostics(content);
            const counts = diagnostics.counts;
            diagnosticsSummary.textContent = `${t("snippetDiagnostics")} · ${t("snippetDiagnosticsHit")} ${counts.hit} · ${t("snippetDiagnosticsMiss")} ${counts.miss} · ${t("snippetDiagnosticsUnknown")} ${counts.unknown}` + (diagnostics.errors.length ? ` · ${t("snippetDiagnosticsError")} ${diagnostics.errors.length}` : "");
            diagnosticsBody.textContent = "";
            if (counts.selectors === 0 && diagnostics.errors.length === 0) {
                diagnosticsBody.appendChild(node("p", "sw-studio__diagnostics-empty", t("snippetDiagnosticsEmpty")));
            }
            diagnostics.rows.forEach((row) => {
                const line = node("div", "sw-studio__diagnostics-row is-" + row.verdict);
                const where = node("span", "sw-studio__diagnostics-line", `L${row.line}`);
                const selector = node("code", "sw-studio__diagnostics-selector", row.selector);
                // 三态文案静态引用（动态拼接键会被死键门禁拦截）
                const verdictLabel = row.verdict === "hit" ? t("snippetDiagnosticsHit")
                    : row.verdict === "miss" ? t("snippetDiagnosticsMiss") : t("snippetDiagnosticsUnknown");
                const verdict = node("span", "sw-studio__diagnostics-verdict", verdictLabel);
                verdict.dataset.verdict = row.verdict;
                if (row.atRule) where.title = `@${row.atRule}`;
                line.append(where, selector, verdict);
                diagnosticsBody.appendChild(line);
            });
            diagnostics.errors.forEach((error) => {
                const line = node("div", "sw-studio__diagnostics-row is-error");
                const where = node("span", "sw-studio__diagnostics-line", `L${error.line}:${error.column}`);
                const selector = node("code", "sw-studio__diagnostics-selector", error.message);
                const verdict = node("span", "sw-studio__diagnostics-verdict", t("snippetDiagnosticsError"));
                verdict.dataset.verdict = "error";
                line.append(where, selector, verdict);
                diagnosticsBody.appendChild(line);
            });
            if (diagnostics.truncated) {
                diagnosticsBody.appendChild(node("p", "sw-studio__diagnostics-empty", t("snippetDiagnosticsTruncated")));
            }
            diagnosticsDetails.hidden = false;
        }
        // T-7022：左栏空态/渲染——无基线（新建草稿）明确空态；有基线显式渲染
        // 已保存代码（baseline.type + original），绝不冒用 baseline 原始样例标志；
        // 内容签名含观察环境，场景/宽度/主题切换两栏同步，输入草稿时左栏不闪动。
        if (!baseline) {
            savedPane.dataset.empty = "true";
            savedEmpty.hidden = false;
            savedCanvas.hidden = true;
        } else {
            savedPane.dataset.empty = "false";
            savedEmpty.hidden = true;
            savedCanvas.hidden = false;
            const savedKey = [baseline.id, baseline.type, original, dark, previewScene, previewWidth].join("\u0000");
            if (savedRenderKey !== savedKey) {
                savedRenderKey = savedKey;
                previewSaved.render({type: baseline.type, content: original, dark, scene: previewScene, width: previewWidth});
            }
        }
        // Compare uses the selected saved code, not a second unscoped host style.
        preview.render({type: draft.type, content, dark, scene: previewScene, width: previewWidth});
    }
    function changed() {
        revision += 1;
        draft = {...draft, name: nameInput.value, type: typeSelect.value, content: editor.value};
        draft.disabledInPublish = publishInput.checked;
        syncFields();
        scheduleDraftHistoryCommit();
        clearTimeout(previewTimer);
        previewTimer = win.setTimeout(() => renderPreview(), 250);
    }
    nameInput.addEventListener("input", changed);
    typeSelect.addEventListener("change", () => {
        changed();
        // T-6957：类型切换是离散事务，立即落账不等待合并窗口
        commitDraftHistory();
    });
    editor.addEventListener("input", changed);
    editor.addEventListener("scroll", () => { lineNumbers.scrollTop = editor.scrollTop; });
    editorSection.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "s" && !event.isComposing) {
            event.preventDefault();
            saveButton.click();
        }
    });
    // T-6957：输入法组合期内不落账（组合提交后才结算事务）；编辑器聚焦时接管
    // 原生撤销快捷键，走统一草稿历史。
    [nameInput, editor].forEach((field) => {
        field.addEventListener("compositionstart", () => { composing = true; });
        field.addEventListener("compositionend", () => {
            composing = false;
            commitDraftHistory();
        });
        field.addEventListener("blur", () => {
            if (!composing) commitDraftHistory();
        });
        field.addEventListener("keydown", (event) => {
            if (!(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== "z" || composing) return;
            event.preventDefault();
            if (event.shiftKey) redoDraft();
            else undoDraft();
        });
    });
    const dirty = () => baseline
        ? draft.name !== baseline.name || draft.type !== baseline.type || draft.content !== baseline.content || draft.disabledInPublish !== (baseline.disabledInPublish === true)
            || Boolean(session.metadata && snippetMetadataSignature(session.metadata) !== snippetMetadataSignature(
                snippetGroups.metadata?.entries.find((entry) => entry.snippetId === baseline.id)))
        : Boolean(draft.name || draft.content || draft.disabledInPublish === true || session.metadata?.alias
            || session.metadata?.summary || session.metadata?.pinned || session.metadata?.tags?.some((tag) => tag.trim()));
    // T-6957：统一草稿历史（名称/类型/正文事务）——50 步 + 512 KiB 字节预算；
    // 切片（choose 身份变化）重置、保存（同 id choose）保留；IME 组合期内不落账；
    // 撤销/重做把状态写回真实控件后经 changed() 同步，dirty 相对新 baseline 重算。
    let draftHistory = createDraftHistory({name: "", type: "css", content: "", disabledInPublish: false});
    let draftHistorySignature = "";
    let historyTimer = 0;
    let composing = false;
    let suppressDraftHistory = false;
    const DRAFT_HISTORY_SETTLE_MS = 600;
    const historyState = () => ({name: nameInput.value, type: typeSelect.value, content: editor.value, disabledInPublish: publishInput.checked});
    const commitDraftHistory = () => {
        if (suppressDraftHistory) return;
        if (historyTimer) { clearTimeout(historyTimer); historyTimer = 0; }
        draftHistory = pushDraftHistory(draftHistory, historyState());
    };
    const scheduleDraftHistoryCommit = () => {
        if (suppressDraftHistory || composing) return;
        if (historyTimer) clearTimeout(historyTimer);
        historyTimer = win.setTimeout(commitDraftHistory, DRAFT_HISTORY_SETTLE_MS);
    };
    const resetDraftHistory = (signature) => {
        if (historyTimer) { clearTimeout(historyTimer); historyTimer = 0; }
        composing = false;
        draftHistorySignature = signature;
        draftHistory = createDraftHistory(historyState());
    };
    const undoDraft = () => {
        if (composing) return;
        commitDraftHistory();
        const result = undoDraftHistory(draftHistory);
        if (!result.state) return;
        draftHistory = result.history;
        suppressDraftHistory = true;
        nameInput.value = result.state.name;
        typeSelect.value = result.state.type;
        editor.value = result.state.content;
        publishInput.checked = result.state.disabledInPublish === true;
        changed();
        suppressDraftHistory = false;
    };
    const redoDraft = () => {
        if (composing) return;
        commitDraftHistory();
        const result = redoDraftHistory(draftHistory);
        if (!result.state) return;
        draftHistory = result.history;
        suppressDraftHistory = true;
        nameInput.value = result.state.name;
        typeSelect.value = result.state.type;
        editor.value = result.state.content;
        publishInput.checked = result.state.disabledInPublish === true;
        changed();
        suppressDraftHistory = false;
    };
    // T-6959：查找条逻辑——字面命中、选区导航、两步替换全部（单事务落账）。
    function toggleFindBar() {
        if (!findBar) return;
        findBar.hidden = !findBar.hidden;
        findToggleButton.setAttribute("aria-expanded", String(!findBar.hidden));
        if (!findBar.hidden) {
            refreshFindMatches();
            try { findQueryInput.focus({preventScroll: true}); } catch (_) { findQueryInput.focus(); }
        } else {
            findMatches = [];
            findCursor = -1;
            replaceArmed = false;
        }
    }
    function refreshFindMatches() {
        findMatches = findDraftMatches(editor.value, findQueryInput ? findQueryInput.value : "");
        findCursor = findMatches.length > 0 ? 0 : -1;
        if (findCountLabel) {
            findCountLabel.textContent = findMatches.length > 0
                ? `${findCursor + 1}/${findMatches.length}`
                : (findQueryInput && findQueryInput.value ? t("snippetFindNone") : "");
        }
        // 更新查询只同步选区；用户显式跳转命中时才聚焦编辑区。
        if (findMatches.length > 0) selectFindMatch(findMatches[0], false);
    }
    function selectFindMatch(match, focus = true) {
        if (!match) return;
        try {
            if (focus) editor.focus({preventScroll: true});
            editor.setSelectionRange(match.start, match.end);
        } catch (_) { /* 极端宿主无选区能力时静默 */ }
    }
    function moveFindCursor(delta) {
        if (findMatches.length === 0) return;
        findCursor = (findCursor + delta + findMatches.length) % findMatches.length;
        if (findCountLabel) findCountLabel.textContent = `${findCursor + 1}/${findMatches.length}`;
        selectFindMatch(findMatches[findCursor]);
    }
    function applyReplaceAll(replaceAllButton) {
        if (composingFindInputs.size || composing) return;
        const query = findQueryInput ? findQueryInput.value : "";
        const matches = findDraftMatches(editor.value, query);
        if (matches.length === 0) return;
        if (!replaceArmed) {
            // 两步确认：先展示数量，再次点击才修改草稿
            replaceArmed = true;
            replaceAllButton.textContent = t("snippetFindConfirm").replace("{x}", String(matches.length));
            return;
        }
        replaceArmed = false;
        replaceAllButton.textContent = t("snippetFindReplaceAll");
        commitDraftHistory();
        const result = replaceDraftMatches(editor.value, query, findReplaceInput ? findReplaceInput.value : "");
        suppressDraftHistory = true;
        editor.value = result.content;
        changed();
        suppressDraftHistory = false;
        commitDraftHistory();
        setStatus(t("snippetFindDone").replace("{x}", String(result.count)), "ready");
        refreshFindMatches();
    }
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

    // T-6958：保存冲突界面——编辑基线/本地草稿/最新读取版本的差异预览与四出口；
    // 继续编辑与取消零写入，保留禁用副本不改冲突原件，放弃并重载走只读重取。
    async function openConflictDialog() {
        let latest = null;
        try { latest = await store.read(); } catch (_) { latest = null; }
        if (disposed) return;
        const latestEntry = latest ? latest.find((item) => item.id === baseline?.id) || null : null;
        const dialog = new Dialog({
            title: t("snippetConflictTitle"),
            content: '<div class="sw-studio__conflict"></div>',
            width: "min(560px, 94vw)",
        });
        const box = dialog.element.querySelector(".sw-studio__conflict");
        if (!box) { dialog.destroy(); return; }
        const message = node("p", "sw-studio__conflict-message", t("snippetConflictMessage"));
        const diffBox = node("div", "sw-studio__conflict-diff");
        if (latestEntry) {
            const diff = buildSnippetDiff(latestEntry.content || "", draft.content || "");
            const summary = summarizeDiff(latestEntry.content || "", draft.content || "", diff);
            const head = node("p", "sw-studio__conflict-summary", t("snippetConflictAdded").replace("{x}", String(summary.added))
                + " · " + t("snippetConflictRemoved").replace("{x}", String(summary.removed))
                + (diff.degraded ? " · " + t("snippetDiffDegraded") : ""));
            diffBox.append(head);
            const cap = Math.min(diff.rows.length, 60);
            for (let i = 0; i < cap; i++) {
                const row = diff.rows[i];
                const line = node("div", "sw-studio__conflict-row is-" + row.type, (row.type === "ins" ? "+ " : row.type === "del" ? "- " : "  ") + row.text);
                diffBox.appendChild(line);
            }
            if (diff.rows.length > cap) diffBox.append(node("p", "sw-studio__conflict-more", t("snippetDiffMore").replace("{x}", String(diff.rows.length - cap))));
        } else {
            diffBox.append(node("p", "sw-studio__conflict-message", t("snippetConflictGone")));
        }
        const actions = node("div", "sw-studio__conflict-actions");
        const continueButton = node("button", "b3-button b3-button--text", t("snippetConflictContinue"));
        continueButton.addEventListener("click", () => { dialog.destroy(); try { editor.focus({preventScroll: true}); } catch (_) { editor.focus(); } });
        const cancelButton = node("button", "b3-button b3-button--text", t("cancel"));
        cancelButton.addEventListener("click", () => { dialog.destroy(); try { editor.focus({preventScroll: true}); } catch (_) { editor.focus(); } });
        const copyButton = node("button", "b3-button b3-button--text", t("snippetConflictCopy"));
        copyButton.addEventListener("click", async () => {
            copyButton.disabled = true;
            const copyId = newId();
            const input = buildConflictCopyEntry(latest, {name: draft.name, type: draft.type, content: draft.content}, copyId)
                || {id: copyId, name: nextConflictCopyName([], draft.name), type: draft.type, content: draft.content, enabled: false};
            busy = true;
            try {
                const next = await store.mutate(null, "save", input);
                if (disposed) return;
                snippets = next;
                setStatus(t("snippetSaved"), "ready");
                dialog.destroy();
                // T-7044：目录重绘走 pickerRefresh 钩子（openPicker 注册、closePicker
                // 摘除）。此处曾调用未定义的局部 render() 抛 ReferenceError，被本层
                // catch 捕获后把已成功写入误报成失败——刷新失败路径只属于 store.mutate。
                if (pickerRefresh) pickerRefresh();
            } catch (error) {
                copyButton.disabled = false;
                if (!disposed) setStatus(errorText(error), "error");
            } finally { busy = false; if (!disposed) syncFields(); }
        });
        const reloadButton = node("button", "b3-button b3-button--cancel", t("snippetConflictReload"));
        reloadButton.addEventListener("click", () => {
            // T-7025（ADR 0100）D1：冲突放弃重载——被丢弃的本地草稿登记入站
            //（冲突副本路径已另存禁用副本，不重复入站）。
            if (recycle && draft.content) {
                try {
                    const dropped = buildRecycleEntry({origin: "conflict", snippetId: baseline?.id || "", name: draft.name, type: draft.type, content: draft.content}, Date.now());
                    if (dropped) recycle.save(appendRecycleEntry(recycle.load(), dropped));
                } catch (_) { /* 登记失败不影响只读重载 */ }
            }
            dialog.destroy();
            if (latestEntry) {
                choose(latestEntry, latestEntry);
            } else {
                void load(true);
            }
        });
        actions.append(continueButton, copyButton, reloadButton, cancelButton);
        box.append(message, diffBox, actions);
        cancelButton.focus({preventScroll: true});
    }
    function choose(value, native) {
        cancelGistRequest(false);
        gistPreview = null;
        gistPreviewBox.replaceChildren();
        aiGeneration += 1;
        ai.cancel();
        aiButton.disabled = true;
        cancelAIButton.disabled = true;
        candidate = null;
        aiHistory = [];
        acceptButton.disabled = true;
        contextInputs.code.checked = false;
        contextInputs.history.checked = false;
        aiConsentInput.checked = false;
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
        session.metadata = native ? null : {alias: value.alias || "", tags: value.tags || [], summary: value.summary || value.description || "", pinned: false};
        if (native?.id) session.recentIds = rememberRecentSnippet(session.recentIds, native.id);
        selectedSource = native ? "native" : value.source || "draft";
        draft = {
            id: native?.id || "",
            name: value.name || "",
            type: value.type || "css",
            content: value.content || "",
            enabled: native?.enabled === true,
            disabledInPublish: native?.disabledInPublish === true,
        };
        gistSourceUrl = value.sourceUrl || "";
        session.gistSourceUrl = gistSourceUrl;
        gistUrlInput.value = gistSettings.links[draft.id] || gistSourceUrl;
        gistDescriptionInput.value = "";
        // T-6957：仅身份变化时重置草稿历史——保存（同 id choose）保留历史，
        // 撤销到保存前内容时 dirty 相对新 baseline 真实变化。
        const identity = native?.id || `draft:${value.source || "draft"}:${value.name}:${value.type}`;
        if (identity !== draftHistorySignature) {
            resetDraftHistory(identity);
        }
        original = native?.content || "";
        description.textContent = value.description || t("snippetDescription");
        revision += 1;
        showOriginal = false;
        compareButton.setAttribute("aria-pressed", "false");
        syncFields();
        renderPreview();
    }
    async function readStudioSnapshot() {
        if (typeof store.readSnapshot === "function") return store.readSnapshot();
        const current = await store.read();
        return {snippets: current, settings: {
            enabledCSS: masterFlags.enabledCSS === true,
            enabledJS: masterFlags.enabledJS === true,
        }};
    }
    function applyStudioSnapshot(snapshot, reselect = true) {
        snippets = Array.isArray(snapshot?.snippets) ? snapshot.snippets : [];
        reconcileLoadedSnippetGroups();
        if (snapshot?.settings && typeof snapshot.settings.enabledCSS === "boolean" && typeof snapshot.settings.enabledJS === "boolean") {
            masterFlags = {enabledCSS: snapshot.settings.enabledCSS, enabledJS: snapshot.settings.enabledJS};
        }
        lastSnapshotSignature = snippetSnapshotSignature({snippets, settings: snapshotSettings()});
        pickerRefresh?.();
        if (reselect) {
            const selected = baseline?.id ? snippets.find((item) => item.id === baseline.id) || null : null;
            choose(selected || {name: "", type: "css", content: ""}, selected);
        } else {
            syncFields();
        }
    }
    function restoreActionLabel(actionName) {
        return t({add: "snippetRestoreAdd", replace: "snippetRestoreReplace", delete: "snippetRestoreDelete", keep: "snippetRestoreKeep"}[actionName] || "snippetRestoreKeep");
    }
    function restoreRowText(row) {
        const item = row.after || row.before || {};
        const name = item.name || row.id;
        return `${restoreActionLabel(row.action)} · ${name} · ${item.type ? item.type.toUpperCase() : ""}`;
    }
    async function exportBackup() {
        if (busy || loading || loadFailed || disposed) return;
        try {
            const snapshot = await readStudioSnapshot();
            const backup = buildSnippetBackup(snapshot, {source: "native"});
            const stamp = new Date(backup.createdAt).toISOString().replace(/[:.]/g, "-");
            download(`siyuan-snippets-${stamp}.json`, JSON.stringify(backup, null, 2), "application/json");
            setStatus(t("snippetBackupHint"), "ready");
        } catch (error) {
            if (!disposed) setStatus(errorText(error), "error");
        }
    }
    async function openRestorePreview(backup) {
        if (restoreDialog || busy || loading || loadFailed || disposed) return;
        let current;
        try {
            current = await readStudioSnapshot();
        } catch (error) {
            setStatus(errorText(error), "error");
            return;
        }
        if (disposed) return;
        const diff = diffSnippetBackup(current, backup);
        const dialog = new Dialog({
            title: t("snippetRestorePreview"),
            content: '<div class="sw-studio__restore"></div>',
            width: "min(680px, 96vw)",
        });
        restoreDialog = dialog;
        const box = dialog.element.querySelector(".sw-studio__restore");
        if (!box) { dialog.destroy(); restoreDialog = null; return; }
        const summary = node("p", "sw-studio__restore-summary", `${t("snippetRestorePreview")} · ${t("snippetDiffFindings").replace("{n}", String(diff.summary.changed))}`);
        const list = node("div", "sw-studio__restore-list");
        const changedRows = diff.rows.filter((row) => row.action !== "keep");
        changedRows.forEach((row) => {
            const label = node("label", `sw-studio__restore-row is-${row.action}`);
            const input = node("input");
            input.type = "checkbox";
            input.checked = true;
            input.dataset.snippetId = row.id;
            input.dataset.restoreAction = row.action;
            label.append(input, node("span", "", restoreRowText(row)));
            list.appendChild(label);
        });
        if (changedRows.length === 0) list.appendChild(node("p", "sw-studio__restore-empty", t("snippetRestoreEmpty")));
        let settingsInput = null;
        if (diff.summary.settingsChanged) {
            const settingsLabel = node("label", "sw-studio__restore-settings");
            settingsInput = node("input");
            settingsInput.type = "checkbox";
            settingsInput.checked = true;
            settingsLabel.append(settingsInput, node("span", "", t("snippetRestoreSettings")));
            list.appendChild(settingsLabel);
        }
        const hint = node("p", "sw-studio__hint", t("snippetRestoreOneShot"));
        const actions = node("div", "sw-studio__restore-actions");
        const cancelButton = node("button", "b3-button b3-button--text", t("snippetRestoreCancel"));
        const confirmButton = node("button", "b3-button b3-button--cancel", t("snippetRestoreConfirm"));
        const close = () => { dialog.destroy(); restoreDialog = null; };
        cancelButton.addEventListener("click", close);
        confirmButton.addEventListener("click", () => {
            const ids = new Set(Array.from(list.querySelectorAll("input[data-snippet-id]:checked")).map((input) => input.dataset.snippetId));
            const restoreSettings = settingsInput ? settingsInput.checked : false;
            if (ids.size === 0 && !restoreSettings) {
                setStatus(t("snippetRestoreNoSelection"), "blocked");
                return;
            }
            close();
            guardLeave(() => { void performRestore(backup, current, ids, restoreSettings); });
        });
        actions.append(cancelButton, confirmButton);
        box.append(summary, list, hint, actions);
        cancelButton.focus({preventScroll: true});
    }
    async function performRestore(backup, expectedCurrent, ids, restoreSettings) {
        if (busy || loading || loadFailed || disposed) return false;
        let latest;
        try {
            latest = await readStudioSnapshot();
        } catch (error) {
            setStatus(errorText(error), "error");
            return false;
        }
        const expectedSignature = snippetSnapshotSignature(expectedCurrent);
        if (snippetSnapshotSignature(latest) !== expectedSignature) {
            setStatus(t("snippetRestoreConflict"), "error");
            return false;
        }
        const plan = buildSnippetRestorePlan(latest, backup, {ids, restoreSettings});
        if (plan.selected.length === 0 && !restoreSettings) {
            setStatus(t("snippetRestoreNoSelection"), "blocked");
            return false;
        }
        restoreUndo = buildSnippetBackup(latest, {source: "undo"});
        session.restoreUndo = restoreUndo;
        busy = true;
        setStatus(t("snippetRestorePending"), "busy");
        syncFields();
        try {
            if (typeof store.restoreSnapshot !== "function") throw new Error("snippet-restore-unsupported");
            const confirmed = await store.restoreSnapshot(expectedSignature, plan.snapshot);
            if (disposed) return false;
            applyStudioSnapshot(confirmed, true);
            setStatus(t("snippetRestoreDone"), "ready");
            return true;
        } catch (error) {
            if (!disposed) setStatus(error?.writeLanded ? t("snippetRestorePending") : errorText(error), "error");
            return false;
        } finally {
            busy = false;
            if (!disposed) syncFields();
        }
    }
    async function undoRestore() {
        if (!restoreUndo || busy || loading || loadFailed || disposed) return false;
        const undo = restoreUndo;
        let current;
        try {
            current = await readStudioSnapshot();
        } catch (error) {
            setStatus(errorText(error), "error");
            return false;
        }
        busy = true;
        setStatus(t("snippetRestorePending"), "busy");
        syncFields();
        try {
            if (typeof store.restoreSnapshot !== "function") throw new Error("snippet-restore-unsupported");
            const confirmed = await store.restoreSnapshot(snippetSnapshotSignature(current), undo);
            if (disposed) return false;
            applyStudioSnapshot(confirmed, true);
            restoreUndo = null;
            session.restoreUndo = null;
            setStatus(t("snippetRestoreUndone"), "ready");
            return true;
        } catch (error) {
            if (!disposed) setStatus(error?.writeLanded ? t("snippetRestorePending") : errorText(error), "error");
            return false;
        } finally {
            busy = false;
            if (!disposed) syncFields();
        }
    }
    async function refreshExternal() {
        if (disposed || busy || loading) return;
        try {
            const snapshot = await readStudioSnapshot();
            const signature = snippetSnapshotSignature(snapshot);
            if (signature === lastSnapshotSignature) return;
            if (dirty()) {
                setStatus(t("snippetRefreshExternal"), "warn");
                return;
            }
            applyStudioSnapshot(snapshot, true);
            setStatus(t("snippetRefreshExternal"), "ready");
        } catch (_) { /* external notification is advisory; manual refresh remains available */ }
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
            reconcileLoadedSnippetGroups();
            lastSnapshotSignature = snippetSnapshotSignature({snippets, settings: snapshotSettings()});
            loadFailed = false;
            if (reselect && baseline) {
                const current = snippets.find((item) => item.id === baseline.id);
                choose(current || {name: "", type: "css", content: ""}, current || null);
            }
            pickerRefresh?.();
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
        const sourceUrl = gistSourceUrl;
        const metadata = readMetadataFields();
        const input = {...draft, id: baseline?.id || newId(), enabled: actionName === "toggle" ? !baseline?.enabled : baseline?.enabled === true};
        // T-7025（ADR 0100）D1/D2：写前捕获旧快照（overwrite=内容确有变化的旧版本 /
        // delete=删除前快照），原生写入确认成功后才登记；登记失败只影响回收站
        // 完整性，不回滚原生写入、不虚报原生操作失败。
        const recycleCandidate = recycle && previous && (actionName === "delete" || (actionName === "save" && previous.content !== input.content))
            ? buildRecycleEntry({origin: actionName === "delete" ? "delete" : "overwrite", snippetId: previous.id, name: previous.name, type: previous.type, content: previous.content}, Date.now())
            : null;
        const finishConfirmedMutation = (next) => {
            if (recycleCandidate && recycle) {
                try { recycle.save(appendRecycleEntry(recycle.load(), recycleCandidate)); } catch (_) {}
            }
            snippets = next;
            lastSnapshotSignature = snippetSnapshotSignature({snippets, settings: snapshotSettings()});
            const saved = actionName === "delete" ? null : next.find((item) => item.id === input.id) || null;
            const metadataSaved = !saved || persistSnippetMetadata(saved.id, metadata);
            reconcileLoadedSnippetGroups();
            const linkSaved = !saved || !sourceUrl || persistGistSettings(rememberGistLink(readGistSettings(), saved.id, sourceUrl));
            choose(saved || {name: "", type: "css", content: ""}, saved);
            if (!metadataSaved) {
                session.metadata = metadata;
                syncFields();
            }
            setStatus(t(input.type === "js" ? "snippetJSReload" : "snippetSaved") + (linkSaved && metadataSaved ? "" : " · " + t("snippetFailed")), linkSaved && metadataSaved ? "ready" : "warn");
            return metadataSaved;
        };
        try {
            const next = await store.mutate(previous, actionName, input);
            if (disposed) return false;
            return finishConfirmedMutation(next);
        } catch (error) {
            if (disposed) return false;
            // T-6958：写前比对或写后确认发现冲突——打开可决策冲突界面
            if (String(error?.message || "") === "snippet-conflict") {
                setStatus(errorText(error), "error");
                void openConflictDialog();
                return false;
            }
            // T-7045：写入可能已生效但回执未确认——待确认回执 + 只读核对；核对
            // 一致（save/toggle 须条目存在且名称内容一致；delete 须条目已消失）才
            // 登记回收站并给成功回执，未核对到则诚实停留并允许用户刷新后重试。
            if (error?.writeLanded && recycle) {
                setStatus(t("snippetPendingConfirm"), "busy");
                syncFields();
                try {
                    const latest = await store.read();
                    if (disposed) return false;
                    const landed = latest.find((item) => item.id === input.id);
                    const confirmedNow = actionName === "delete" ? !landed : (!!landed && landed.name === input.name && landed.content === input.content);
                    if (confirmedNow) {
                        return finishConfirmedMutation(latest);
                    }
                } catch (_) { /* 核对失败走下方未确认回执 */ }
                setStatus(t("snippetPendingUnverified"), "error");
                return false;
            }
            setStatus(errorText(error), "error");
            return false;
        }
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
    restoreInput.addEventListener("change", () => {
        const file = restoreInput.files?.[0];
        restoreInput.value = "";
        if (!file) return;
        void (async () => {
            try {
                if (file.size > SNIPPET_BACKUP_MAX_BYTES) throw new Error("snippet-backup-too-large");
                const text = await file.text();
                const backup = normalizeSnippetBackup(JSON.parse(text));
                if (!backup) throw new Error("snippet-backup-invalid");
                await openRestorePreview(backup);
            } catch (error) {
                if (!disposed) setStatus(errorText(error), "error");
            }
        })();
    });
    // T-7046：导入代际保护——file.text() 返回后核对代际与草稿现场：
    // ①另一轮导入已开始（importGeneration 前移）；②读取期间编辑过草稿或切换过
    // 片段（revision 在 changed/AI 接受/choose 三条路径都自增）。迟到文件诚实
    // 丢弃，不覆盖新草稿、不触发另一轮 choose。
    async function importFile(file) {
        const generation = ++importGeneration;
        const startedRevision = revision;
        try {
            if (file.size > SNIPPET_CODE_MAX) throw new Error("size_limit");
            const text = await file.text();
            if (disposed || generation !== importGeneration || revision !== startedRevision) return;
            const imported = parseSnippetImport(file.name, text);
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
        let selectedContext;
        try {
            selectedContext = selectSnippetAIContext({content: iterateFromCandidate ? candidate.content : captured.content,
                history: aiHistory.slice(-6), includeCode: contextInputs.code.checked,
                includeHistory: mode === "iterate" && contextInputs.history.checked});
            if (mode !== "generate" && !selectedContext.content.trim()) return;
        } catch (error) {
            setAIStatus(t(error.code === "context_too_large" ? "snippetAIContextTooLarge" : "snippetFailed"), false, "error");
            return;
        }
        const sourceContent = selectedContext.content;
        const history = selectedContext.history;
        candidate = null;
        acceptButton.disabled = true;
        acceptButton.hidden = mode === "explain";
        aiButton.disabled = true;
        cancelAIButton.disabled = false;
        aiButton.textContent = t("snippetAISend");
        candidateCopy.disabled = candidateExport.disabled = true;
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
        } catch (error) {
            if (!disposed && generation === aiGeneration) {
                setAIStatus(errorText(error), false, "error");
                aiButton.textContent = t("snippetAIRetry");
            }
        }
        finally { if (!disposed && generation === aiGeneration) { cancelAIButton.disabled = true; updateAIActions(); } }
    }
    function saveSnippetGroupStore(next) {
        const normalized = normalizeSnippetGroupStore(next);
        const changed = JSON.stringify(normalized) !== JSON.stringify(snippetGroups);
        snippetGroups = normalized;
        if (!changed || typeof groups?.save !== "function") return changed;
        try {
            groups.save(normalized);
        } catch (error) {
            setStatus(errorText(error), "error");
        }
        return changed;
    }
    function reconcileLoadedSnippetGroups() {
        const result = reconcileSnippetGroups(snippetGroups, snippets);
        if (result.changed) saveSnippetGroupStore(result.store);
        return result;
    }
    function promptSnippetGroupName(current = "") {
        if (typeof win.prompt !== "function") return null;
        return win.prompt(t("snippetGroupNamePrompt"), current);
    }
    function createSnippetGroup() {
        const name = promptSnippetGroupName();
        if (name === null) return;
        const result = addSnippetGroup(snippetGroups, name, {id: createSnippetGroupId(Date.now(), groupIdSeed++)});
        if (!result.changed) {
            setStatus(t("snippetGroupNameInvalid"), "blocked");
            return;
        }
        saveSnippetGroupStore(result.store);
        pickerRefresh?.();
    }
    function editSnippetGroup(group) {
        const name = promptSnippetGroupName(group.name);
        if (name === null) return;
        const result = renameSnippetGroup(snippetGroups, group.id, name);
        if (!result.changed) {
            setStatus(t("snippetGroupNameInvalid"), "blocked");
            return;
        }
        saveSnippetGroupStore(result.store);
        pickerRefresh?.();
    }
    function deleteSnippetGroup(group) {
        if (typeof win.confirm === "function" && !win.confirm(t("snippetGroupDeleteConfirm"))) return;
        const result = removeSnippetGroup(snippetGroups, group.id);
        if (!result.changed) return;
        saveSnippetGroupStore(result.store);
        pickerRefresh?.();
    }
    function closePicker() {
        pickerRelease();
        pickerRelease = () => {};
        pickerRefresh = null;
        picker?.remove();
        picker = null;
        // At narrow widths the workbench is a vertical scroller. Restoring
        // focus must not scroll the hidden editor into view underneath the
        // picker that just closed.
        const focusTarget = pickerOpener && pickerOpener.isConnected ? pickerOpener : chooseButton;
        pickerOpener = null;
        focusTarget?.focus({preventScroll: true});
        root.scrollTop = pickerScrollTop.root;
        layout.scrollTop = pickerScrollTop.layout;
    }
    // T-7025 第二阶段：回收站视图——列表（名称/类型/来源/日期/大小）、恢复为新
    // 草稿（过 guardLeave 脏稿守卫，choose(value, null) 落禁用态、不自动启用）、
    // 永久删除/清空二次确认并如实回执（ADR 0100 D5）。Esc/外点仅关闭视图。
    function openRecycleViewer() {
        // T-7177：焦点生命周期——打开入焦首个控件、Tab/Shift+Tab 约束于本层、
        // Esc/外点/关闭/恢复各出口统一走 close() 并回焦触发按钮。
        const doc = root.ownerDocument;
        const opener = doc.activeElement instanceof doc.defaultView.HTMLElement ? doc.activeElement : null;
        const overlay = node("div", "sw-studio__picker sw-studio__recycle");
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", t("snippetRecycle"));
        const sheet = node("section", "sw-studio__picker-sheet");
        const head = node("div", "sw-studio__section-bar");
        const list = node("div", "sw-studio__catalog");
        const focusables = () => Array.from(overlay.querySelectorAll("button")).filter((el) => !el.disabled);
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            doc.removeEventListener("keydown", keydown, true);
            overlay.remove();
            if (opener) opener.focus({preventScroll: true});
        };
        const renderList = () => {
            const entries = recycle.load().entries || [];
            list.replaceChildren();
            if (!entries.length) list.append(node("p", "sw-studio__hint", t("snippetRecycleEmpty")));
            for (const entry of entries) {
                const row = node("div", "sw-studio__recycle-item");
                const main = node("div", "sw-studio__recycle-main");
                const title = node("div", "sw-studio__recycle-title");
                title.append(
                    node("span", "sw-studio__catalog-kind", entry.type.toUpperCase()),
                    node("strong", "", entry.name),
                    node("span", "sw-studio__tag", t(entry.origin === "delete" ? "snippetRecycleOriginDelete" : entry.origin === "conflict" ? "snippetRecycleOriginConflict" : "snippetRecycleOriginOverwrite")),
                );
                main.append(title, node("span", "sw-studio__hint", `${new Date(entry.createdAt).toLocaleString()} · ${formatBytes(entry.size)}`));
                const actionsBox = node("div", "sw-studio__recycle-actions");
                const restoreButton = action("snippetRecycleRestore", () => {
                    guardLeave(() => {
                        choose({name: entry.name, type: entry.type, content: entry.content}, null);
                        close();
                        setStatus(t("snippetRecycleRestored"), "ready");
                    });
                });
                const purgeButton = action("snippetRecyclePurge", () => {
                    if (!win.confirm(t("snippetRecyclePurgeConfirm"))) return;
                    recycle.save(purgeRecycleEntry(recycle.load(), entry.recId));
                    setStatus(t("snippetRecycle"), "ready");
                    renderList();
                });
                actionsBox.append(restoreButton, purgeButton);
                row.append(main, actionsBox);
                list.appendChild(row);
            }
        };
        const clearButton = action("snippetRecycleClear", () => {
            if (!win.confirm(t("snippetRecycleClearConfirm"))) return;
            recycle.save(normalizeRecycleStore(null));
            setStatus(t("snippetRecycle"), "ready");
            renderList();
        });
        head.append(node("strong", "", t("snippetRecycle")), clearButton, action("snippetClose", () => close()));
        sheet.append(head, list);
        overlay.appendChild(sheet);
        root.appendChild(overlay);
        renderList();
        const keydown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }
            if (event.key !== "Tab") return;
            const focusList = focusables();
            if (!focusList.length) { event.preventDefault(); return; }
            const firstEl = focusList[0];
            const lastEl = focusList[focusList.length - 1];
            if (doc.activeElement === firstEl && event.shiftKey) {
                event.preventDefault();
                lastEl.focus({preventScroll: true});
            } else if (doc.activeElement === lastEl && !event.shiftKey) {
                event.preventDefault();
                firstEl.focus({preventScroll: true});
            } else if (!overlay.contains(doc.activeElement)) {
                event.preventDefault();
                firstEl.focus({preventScroll: true});
            }
        };
        doc.addEventListener("keydown", keydown, true);
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) close();
        });
        const firstFocusable = focusables()[0];
        if (firstFocusable) firstFocusable.focus({preventScroll: true});
    }
    function openPicker(browse = false) {
        if (picker || busy) return;
        pickerScrollTop = {root: root.scrollTop, layout: layout.scrollTop};
        const active = doc.activeElement;
        pickerOpener = active instanceof win.HTMLElement && active !== doc.body
            ? active
            : (browse ? snippetStoreButton : chooseButton);
        picker = node("div", "sw-studio__picker");
        picker.setAttribute("role", "dialog");
        picker.setAttribute("aria-modal", "true");
        picker.setAttribute("aria-label", t("snippetChoose"));
        const sheet = node("section", "sw-studio__picker-sheet");
        const head = node("div", "sw-studio__section-bar");
        let storeSelection = null;
        const storePane = node("section", "sw-studio__store-preview");
        const storeInfo = node("p", "sw-studio__hint", t("snippetStoreCommunity"));
        const storeDelta = node("p", "sw-studio__hint sw-studio__store-delta");
        const storeCode = node("pre", "sw-studio__store-code");
        const storeCanvas = node("div", "sw-studio__store-canvas");
        const storePreview = browse ? createSnippetPreview(storeCanvas, {title: t("snippetPreview"), labels: previewLabels(t)}) : null;
        const storeDraft = action("snippetStoreDraft", () => {
            if (!storeSelection) return;
            guardLeave(() => {
                choose({...storeSelection, enabled: false}, null);
                closePicker();
            });
        }, "is-primary");
        storeDraft.disabled = true;
        storePane.append(storeInfo, storeDelta, storeCanvas, storeCode, storeDraft);
        function previewStoreEntry(item) {
            storeSelection = item;
            storeInfo.textContent = `${item.name} · ${t(item.source === "builtin" ? "snippetStoreBuiltinInfo" : "snippetStoreNativeInfo")}`;
            const diff = buildSnippetDiff(draft.content, item.content);
            const summary = summarizeDiff(draft.content, item.content, diff);
            storeDelta.textContent = t("snippetDiffSummary").replace("{hunks}", String(summary.hunks))
                .replace("{added}", String(summary.added)).replace("{removed}", String(summary.removed))
                + (diff.degraded ? " · " + t("snippetDiffDegraded") : "");
            storeCode.textContent = item.content;
            storeDraft.disabled = false;
            storePreview.render({type: item.type, content: item.content,
                dark: doc.documentElement.dataset.themeMode === "dark", scene: previewScene, width: previewWidth});
            storePane.scrollIntoView?.({block: "nearest"});
        }
        // T-7025 第二阶段：目录浮层头部提供回收站入口
        head.append(node("strong", "", t("snippetChoose")), action("snippetRecycle", () => openRecycleViewer()), action("snippetClose", closePicker));
        const recentItems = (session.recentIds || []).map((id) => snippets.find((item) => item.id === id)).filter(Boolean);
        const recent = node("div", "sw-studio__recent");
        if (recentItems.length) {
            recent.append(node("strong", "sw-studio__recent-label", t("snippetRecent")));
            for (const item of recentItems) {
                const button = action("snippetSelect", () => {
                    if (browse) { previewStoreEntry({...item, source: "native"}); return; }
                    guardLeave(() => { choose(item, item); closePicker(); });
                });
                button.className = "sw-studio__recent-item";
                button.textContent = item.name;
                button.title = item.name;
                button.setAttribute("aria-pressed", String(item.id === baseline?.id));
                recent.append(button);
            }
        }
        const groupToolbar = node("div", "sw-studio__group-toolbar");
        const groupToolbarTitle = node("strong", "sw-studio__group-toolbar-title", t("snippetGroupView"));
        const groupView = select("snippetGroupView", [["tree", "snippetGroupTree"], ["flat", "snippetGroupFlat"]]);
        groupView.value = snippetGroups.view;
        const groupNew = action("snippetGroupNew", createSnippetGroup, "is-secondary");
        groupToolbar.append(groupToolbarTitle, groupView, groupNew);
        const filters = node("div", "sw-studio__filters");
        const query = node("input", "sw-studio__input");
        query.placeholder = t("snippetSearch");
        query.setAttribute("aria-label", t("snippetSearch"));
        let queryComposing = false;
        let committedQuery = "";
        let justCommittedQuery = null;
        const source = select("snippetSource", [["", "snippetAllSources"], ["builtin", "snippetBuiltins"], ["native", "snippetMine"]]);
        const language = select("snippetType", [["", "snippetAllTypes"], ["css", "snippetCSS"], ["js", "snippetJS"]]);
        const category = select("snippetCategory", [["", "snippetAllCategories"], ["typography", "snippetCategoryTypography"], ["table", "snippetCategoryTable"], ["focus", "snippetCategoryFocus"], ["code", "snippetCategoryCode"], ["font", "snippetCategoryFont"], ["quote", "snippetCategoryQuote"], ["image", "snippetCategoryImage"], ["heading", "snippetCategoryHeading"], ["list", "snippetCategoryList"], ["divider", "snippetCategoryDivider"], ["tag", "snippetCategoryTag"], ["theme", "snippetCategoryTheme"], ["layout", "snippetCategoryLayout"], ["custom", "snippetCategoryCustom"]]);
        const catalogSort = select("snippetCatalogSort", [["native", "snippetCatalogNativeOrder"], ["name", "snippetName"], ["modified", "snippetCatalogModified"]]);
        filters.append(query, source, language, category, catalogSort);
        const list = node("div", "sw-studio__catalog");
        const more = action("snippetMore", () => { limit += 40; render(); });
        let limit = 40;
        // T-7229：目录中的原生片段提供与 TCOTC/snippets 一致的就地启停。
        // 选择与启停拆成两个并列控件，避免把 toggle 嵌套在选择按钮里；写入仍复用
        // 原生 whole-list mutation / 回读确认链路，失败时保留真实错误回执。
        const catalogToggleBusy = new Set();
        const toggleCatalogItem = async (item) => {
            if (item?.source !== "native" || !item.id || busy || loading || loadFailed || disposed) return;
            if (dirty()) {
                setStatus(t("snippetSaveFirst"), "blocked");
                return;
            }
            if (catalogToggleBusy.has(item.id)) return;
            const latest = snippets.find((entry) => entry.id === item.id);
            if (!latest) {
                setStatus(t("snippetUnavailable"), "blocked");
                return;
            }
            if (latest.type === "js" && !latest.enabled && typeof win.confirm === "function" && !win.confirm(t("snippetConfirmJS"))) return;
            catalogToggleBusy.add(item.id);
            render();
            try {
                const next = await store.mutate(latest, "toggle", {...latest, enabled: !latest.enabled});
                if (disposed) return;
                if (!Array.isArray(next)) throw new Error("snippet-invalid-response");
                snippets = next;
                lastSnapshotSignature = snippetSnapshotSignature({snippets, settings: snapshotSettings()});
                const saved = next.find((entry) => entry.id === latest.id);
                if (!saved) {
                    setStatus(t("snippetUnavailable"), "error");
                    return;
                }
                if (baseline?.id === latest.id && saved) {
                    baseline = {...saved};
                    draft = {...draft, enabled: saved.enabled};
                    syncFields();
                }
                setStatus(saved?.enabled ? t("snippetEnabled") : t("snippetDisabled"), "ready");
            } catch (error) {
                if (!disposed) setStatus(errorText(error), "error");
            } finally {
                catalogToggleBusy.delete(item.id);
                if (!disposed) pickerRefresh?.();
            }
        };
        const attachDropTarget = (target, groupId) => {
            target.addEventListener("dragover", (event) => {
                if (!event.dataTransfer) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                target.classList.add("is-drag-over");
            });
            target.addEventListener("dragleave", (event) => {
                if (!event.relatedTarget || !target.contains(event.relatedTarget)) target.classList.remove("is-drag-over");
            });
            target.addEventListener("drop", (event) => {
                event.preventDefault();
                target.classList.remove("is-drag-over");
                const snippetId = event.dataTransfer?.getData("text/plain") || "";
                if (!snippetId || !snippets.some((item) => item.id === snippetId)) return;
                const result = moveSnippetToGroup(snippetGroups, snippetId, groupId);
                if (!result.changed) return;
                saveSnippetGroupStore(result.store);
                setStatus(t("snippetGroupDropHint"), "ready");
                render();
            });
        };
        const renderCatalogItem = (item, groupId = "", groupName = "") => {
            const isCurrent = item.source === "native"
                ? item.id === baseline?.id
                : !baseline && item.type === draft.type && item.name === draft.name && item.content === draft.content;
            const wrapper = node("div", "sw-studio__catalog-item-wrap");
            const button = action("snippetSelect", () => {
                if (browse) { previewStoreEntry(item); return; }
                guardLeave(() => {
                    choose(item, item.source === "native" ? snippets.find((entry) => entry.id === item.id) : null);
                    closePicker();
                });
            });
            button.className = "sw-studio__catalog-item";
            button.dataset.snippetId = item.source === "native" ? item.id : "";
            button.dataset.groupId = groupId;
            button.draggable = item.source === "native";
            button.disabled = item.source === "native" && catalogToggleBusy.has(item.id);
            button.setAttribute("aria-pressed", String(isCurrent));
            button.setAttribute("aria-label", `${item.name} · ${item.type.toUpperCase()}`);
            if (isCurrent) button.classList.add("is-current");
            const parts = [
                node("span", "sw-studio__catalog-kind", item.type.toUpperCase()),
                node("strong", "", item.name),
                node("span", "sw-studio__hint", item.description || t("snippetDescription")),
            ];
            if (groupName) parts.push(node("span", "sw-studio__group-item-label", groupName));
            if (item.pinned) parts.push(node("span", "sw-studio__tag", t("snippetPinned")));
            if (item.alias || item.summary || item.tags?.length) parts.push(node("span", "sw-studio__hint", [item.alias, item.summary, ...(item.tags || [])].filter(Boolean).join(" · ")));
            parts.push(node("span", "sw-studio__tag", t(item.source === "builtin" ? "snippetBuiltins" : item.enabled ? "snippetEnabled" : "snippetDisabled")));
            button.replaceChildren(...parts);
            if (item.source === "native") {
                button.addEventListener("dragstart", (event) => {
                    event.dataTransfer?.setData("text/plain", item.id);
                    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                    button.classList.add("is-dragging");
                });
                button.addEventListener("dragend", () => button.classList.remove("is-dragging"));
                if (!browse) {
                    const toggle = action(item.enabled ? "snippetDisable" : "snippetEnable", (event) => {
                        event.stopPropagation();
                        void toggleCatalogItem(item);
                    }, "is-quiet");
                    toggle.className = "sw-studio__catalog-toggle";
                    toggle.dataset.snippetToggleId = item.id;
                    toggle.setAttribute("aria-pressed", String(item.enabled === true));
                    toggle.setAttribute("aria-label", `${t(item.enabled ? "snippetDisable" : "snippetEnable")}: ${item.name}`);
                    toggle.title = t(item.enabled ? "snippetDisable" : "snippetEnable");
                    toggle.disabled = catalogToggleBusy.has(item.id) || busy || loading || loadFailed;
                    wrapper.append(button, toggle);
                } else wrapper.appendChild(button);
                return wrapper;
            }
            wrapper.appendChild(button);
            return wrapper;
        };
        const appendGroup = (group, entries, index) => {
            const section = node("section", "sw-studio__group");
            section.dataset.groupId = group.id;
            const header = node("div", "sw-studio__group-header");
            header.setAttribute("aria-expanded", String(!group.collapsed));
            const itemsId = `sw-studio-group-items-${index}`;
            const toggle = node("button", "sw-studio__group-toggle", `${group.name} (${entries.length})`);
            toggle.type = "button";
            toggle.setAttribute("aria-expanded", String(!group.collapsed));
            toggle.setAttribute("aria-controls", itemsId);
            toggle.addEventListener("click", () => {
                const result = setSnippetGroupCollapsed(snippetGroups, group.id, !group.collapsed);
                if (!result.changed) return;
                saveSnippetGroupStore(result.store);
                render();
            });
            const controls = node("div", "sw-studio__group-actions");
            const rename = action("snippetGroupRename", () => editSnippetGroup(group), "is-quiet");
            rename.setAttribute("aria-label", `${t("snippetGroupRename")}: ${group.name}`);
            const remove = action("snippetGroupDelete", () => deleteSnippetGroup(group), "is-quiet is-danger");
            remove.setAttribute("aria-label", `${t("snippetGroupDelete")}: ${group.name}`);
            controls.append(rename, remove);
            header.append(toggle, controls);
            const items = node("div", "sw-studio__group-items");
            items.id = itemsId;
            items.hidden = group.collapsed;
            for (const item of entries) items.appendChild(renderCatalogItem(item, group.id, group.name));
            if (!entries.length) items.appendChild(node("p", "sw-studio__hint sw-studio__group-empty", t("snippetGroupDropHint")));
            attachDropTarget(header, group.id);
            attachDropTarget(items, group.id);
            section.append(header, items);
            list.appendChild(section);
        };
        const appendUngrouped = (entries) => {
            const section = node("section", "sw-studio__group sw-studio__group--ungrouped");
            const header = node("div", "sw-studio__group-header");
            header.setAttribute("aria-expanded", "true");
            header.append(node("strong", "sw-studio__group-toggle-label", `${t("snippetGroupUngrouped")} (${entries.length})`));
            const items = node("div", "sw-studio__group-items sw-studio__group-items--ungrouped");
            for (const item of entries) items.appendChild(renderCatalogItem(item));
            if (!entries.length) items.appendChild(node("p", "sw-studio__hint sw-studio__group-empty", t("snippetGroupDropHint")));
            attachDropTarget(header, null);
            attachDropTarget(items, null);
            section.append(header, items);
            list.appendChild(section);
        };
        const render = () => {
            const builtin = BUILTIN_SNIPPETS.map((item) => ({...item, name: t(item.nameKey), description: t(item.descriptionKey)}));
            const native = projectSnippetMetadata(snippetGroups, snippets).map((item) => ({...item, source: "native", category: "custom"}));
            const found = filterSnippetCatalog([...builtin, ...native], {query: committedQuery, type: language.value, category: category.value, source: source.value, sort: catalogSort.value});
            list.replaceChildren();
            if (!found.length) list.append(node("p", "sw-studio__hint", t("snippetNoResults")));
            else {
                const projection = reconcileLoadedSnippetGroups();
                groupView.value = snippetGroups.view;
                const foundById = new Map(found.filter((item) => item.source === "native").map((item) => [item.id, item]));
                const groupEntries = projection.groups.map((group) => ({group, entries: found.filter((item) => item.source === "native" && group.items.some((entry) => entry.id === item.id))}));
                const ungrouped = [
                    ...found.filter((item) => item.source !== "native"),
                    ...projection.ungrouped.map((item) => foundById.get(item.id)).filter(Boolean),
                ];
                const visibleEntries = (items) => items.slice(0, limit);
                if (snippetGroups.view === "tree") {
                    groupEntries.forEach(({group, entries}, index) => appendGroup(group, visibleEntries(entries), index));
                    appendUngrouped(visibleEntries(ungrouped));
                } else {
                    const flat = [];
                    groupEntries.forEach(({group, entries}) => entries.forEach((item) => flat.push({item, group})));
                    ungrouped.forEach((item) => flat.push({item, group: null}));
                    const rank = new Map(found.map((item, index) => [item, index]));
                    flat.sort((first, second) => rank.get(first.item) - rank.get(second.item));
                    for (const entry of flat.slice(0, limit)) list.appendChild(renderCatalogItem(entry.item, entry.group?.id || "", entry.group?.name || ""));
                }
            }
            more.hidden = found.length <= limit;
        };
        pickerRefresh = render;
        groupView.addEventListener("change", () => {
            const result = setSnippetGroupView(snippetGroups, groupView.value);
            if (!result.changed) return;
            saveSnippetGroupStore(result.store);
            render();
        });
        query.addEventListener("compositionstart", () => {
            queryComposing = true;
            justCommittedQuery = null;
        });
        query.addEventListener("keydown", (event) => {
            if (queryComposing || event.isComposing || event.keyCode === 229) event.stopPropagation();
        });
        query.addEventListener("compositionend", () => {
            queryComposing = false;
            committedQuery = query.value;
            justCommittedQuery = query.value;
            limit = 40;
            render();
        });
        query.addEventListener("input", (event) => {
            if (queryComposing || event.isComposing) return;
            const alreadyCommitted = justCommittedQuery !== null && justCommittedQuery === query.value;
            justCommittedQuery = null;
            if (alreadyCommitted) return;
            committedQuery = query.value;
            limit = 40;
            render();
        });
        [source, language, category, catalogSort].forEach((input) => input.addEventListener("input", () => { limit = 40; render(); }));
        sheet.append(head, recent, groupToolbar, filters, list, more);
        if (browse) sheet.appendChild(storePane);
        picker.appendChild(sheet);
        root.appendChild(picker);
        const keydown = (event) => {
            if (queryComposing || event.isComposing || event.keyCode === 229) return;
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
        pickerRelease = () => { storePreview?.dispose(); doc.removeEventListener("keydown", keydown, true); };
        render(); query.focus();
    }
    syncFields();
    renderPreview();
    const ready = load();
    const unsubscribeStore = typeof store.subscribe === "function"
        ? store.subscribe(() => refreshExternal())
        : () => {};
    // Resolve the native flags through the store as well, so a recently
    // persisted host setting wins over a stale in-memory config snapshot.
    void refreshMasterFlags();
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
            status: {state: "ready", label: locale.i18n.platformConnected || "Kernel connected"},
            onHelp: platform.onHelp,
            helpLabel: platform.helpLabel || locale.i18n.platformGuideButton || "Quick start",
            onSettings: platform.onSettings,
            settingsLabel: platform.settingsLabel || locale.i18n.settings || "Settings",
            closeHint: platform.closeHint || locale.i18n.platformCloseHint || "to close",
            onNavigate: (surface) => {
                guardLeave(() => platform.onNavigate?.(surface));
            },
            onClose: () => {
                guardLeave(() => platform.onClose?.(true));
            },
            closeLabel: locale.i18n.close || "Close",
        });
    }
    // 主工作室 Dialog 禁用了宿主默认关闭按钮，平台头部因此必须承担完整的
    // Escape 退出语义。选择器/回收站各自拦截更深层的 Escape；事件能到达这里时，
    // 只处理主表面，并继续经过脏稿守卫。
    const onStudioKeydown = (event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (root.querySelector(".sw-studio__picker, .sw-studio__recycle")) return;
        event.preventDefault();
        event.stopPropagation();
        guardLeave(() => platform?.onClose?.(true));
    };
    root.addEventListener("keydown", onStudioKeydown);
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
            const verdict = leave.requestLeave(true, busy, () => platform.onClose?.(true));
            if (verdict.action === "confirm") openLeaveDialog();
            return false;
        },
        dispose() {
            disposed = true;
            cancelGistRequest(false);
            aiGeneration += 1;
            session.draft = {...draft};
            session.baseline = baseline ? {...baseline} : null;
            clearTimeout(previewTimer);
            pickerRelease();
            pickerOpener = null;
            root.removeEventListener("keydown", onStudioKeydown);
            preview.dispose();
            previewSaved.dispose();
            dualPaneObserver?.disconnect();
            ai.dispose();
            unsubscribeStore();
            store.dispose();
            root.replaceChildren();
        },
    };
}

module.exports = {mountSnippetStudio};
