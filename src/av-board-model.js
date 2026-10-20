'use strict';

// T-7336 思源原生属性视图（av）轻量只读看板模型：纯领域模型，零 DOM/网络依赖。
// 与既有 T-6330 buildAvTableSnapshot（"当前视图 → 列表项"）互补：
//   - 表格投影只投影当前视图的行；本模型额外做"分组桶 → 计数/占比"聚合，
//     并支持多视图（viewId）清单、有界字段选择和看板摘要（board stat）。
// 只读边界：绝不发起写请求、绝不修改 view；所有输出均有界截断。

const BOARD_MAX_GROUPS = 12;
const BOARD_MAX_ITEMS = 24;
const BOARD_MAX_VIEWS = 8;
const BOARD_MAX_FIELD_BYTES = 64;
const BOARD_MAX_LABEL_BYTES = 48;
const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function clampLimit(value, fallback, max) {
    const num = Math.trunc(Number(value));
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(1, num));
}

/**
 * 有界归一化看板配置。
 * groupBy 为空表示"不分组"（单桶）；viewId 为空表示"当前/首个视图"。
 */
function normalizeAvBoardConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const blockId = boundedText(source.blockId, 64);
    const viewId = boundedText(source.viewId, 64);
    const groupBy = boundedText(source.groupBy, BOARD_MAX_FIELD_BYTES);
    const limit = clampLimit(source.limit, 8, BOARD_MAX_ITEMS);
    const showCounts = source.showCounts !== false && source.showCounts !== "否";
    const showPercent = source.showPercent === true || source.showPercent === "是";
    return {
        blockId: BLOCK_ID_RE.test(blockId) ? blockId : "",
        viewId: BLOCK_ID_RE.test(viewId) ? viewId : "",
        groupBy,
        limit,
        showCounts,
        showPercent,
    };
}

// 宽容抽取 av.Value 展示文本（与 kernel-widget-model 同语义，此处独立实现以免
// 看板模型反向依赖组件层；两处契约由 av-table/av-board 双测试共同守护）。
function extractAvBoardCellText(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 2) return "";
    if (typeof value.renderedContent === "string") return value.renderedContent;
    if (value.text && typeof value.text.content === "string") return value.text.content;
    if (value.block && typeof value.block.content === "string") return value.block.content;
    if (value.number && typeof value.number.formattedContent === "string") return value.number.formattedContent;
    if (value.number && Number.isFinite(Number(value.number.content))) return String(value.number.content);
    if (Array.isArray(value.mSelect)) {
        return value.mSelect
            .map((option) => (option && typeof option.content === "string" ? option.content : ""))
            .filter(Boolean)
            .join("、");
    }
    if (value.date && typeof value.date.formattedContent === "string") return value.date.formattedContent;
    if (value.date && ["string", "number"].includes(typeof value.date.content)) return String(value.date.content);
    for (const key of ["url", "email", "phone"]) {
        if (value[key] && typeof value[key].content === "string") return value[key].content;
    }
    if (value.checkbox && typeof value.checkbox.checked === "boolean") return value.checkbox.checked ? "☑" : "☐";
    if (Array.isArray(value.mAsset)) {
        return value.mAsset.slice(0, 3)
            .map((asset) => asset && (boundedText(asset.name, 48) || boundedText(asset.content, 72)))
            .filter(Boolean)
            .join("、");
    }
    if (typeof value.template === "string") return value.template;
    if (value.template && typeof value.template.content === "string") return value.template.content;
    for (const key of ["created", "updated"]) {
        if (value[key] && typeof value[key].formattedContent === "string") return value[key].formattedContent;
    }
    for (const key of ["relation", "rollup"]) {
        if (!value[key] || !Array.isArray(value[key].contents)) continue;
        return value[key].contents.slice(0, 3)
            .map((entry) => extractAvBoardCellText(entry, depth + 1))
            .filter(Boolean)
            .join("、");
    }
    return "";
}

function avBoardTableOf(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const nested = candidate.table && typeof candidate.table === "object" ? candidate.table : candidate;
    return Array.isArray(nested.columns) && Array.isArray(nested.rows) ? nested : null;
}

/**
 * 统一行源：v3.8.x 返回 view.table；较新公开 API 把 columns/rows 挂 view；
 * 分组视图把行放在 groups[] 子视图里。返回 {columns, rows}。
 */
function collectAvBoardRows(view) {
    if (!view || typeof view !== "object") return {columns: [], rows: []};
    const root = avBoardTableOf(view);
    const groups = Array.isArray(view.groups)
        ? view.groups.slice(0, 128).map(avBoardTableOf).filter(Boolean)
        : [];
    const sources = groups.length > 0 ? groups : (root ? [root] : []);
    if (!sources.length) return {columns: [], rows: []};
    const columns = (root && root.columns.length > 0 ? root.columns : sources[0].columns) || [];
    const rows = [];
    const seen = new Set();
    for (const source of sources) {
        for (const row of source.rows) {
            if (!row || typeof row !== "object" || !Array.isArray(row.cells)) continue;
            const rowId = boundedText(row.id, 64);
            if (rowId) {
                if (seen.has(rowId)) continue;
                seen.add(rowId);
            }
            rows.push(row);
        }
    }
    return {columns, rows};
}

// 单元格定位：优先按 keyID/columnId 精确匹配；av 行 cells 按列顺序位置对齐
// （cells[i] ↔ columns[i]），因此 position 回退是真实契约的一部分，不是兜底 hack。
function avBoardCellOf(row, column, position = -1) {
    if (!column) return null;
    const cells = Array.isArray(row.cells) ? row.cells : [];
    const matched = cells.find((cell) => cell && (
        cell.id === column.id || cell.keyID === column.id || cell.value?.keyID === column.id
    ));
    return matched || (position >= 0 && position < cells.length ? cells[position] : null);
}

function avBoardColumnKeyOf(column) {
    const candidates = [column.id, column.name, column.key, column.label];
    return candidates.map((value) => boundedText(value, BOARD_MAX_FIELD_BYTES)).filter(Boolean);
}

/** 列出可用于分组/展示的字段（hidden 排除，有界截断）。 */
function listAvBoardFields(payload) {
    const data = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
        ? payload.data
        : null;
    if (!data) return [];
    const view = data.view && typeof data.view === "object" ? data.view : null;
    const {columns} = collectAvBoardRows(view);
    return columns
        .filter((column) => column && typeof column === "object" && column.hidden !== true)
        .slice(0, BOARD_MAX_GROUPS)
        .map((column) => ({
            id: boundedText(column.id, BOARD_MAX_FIELD_BYTES),
            name: boundedText(column.name || column.label, BOARD_MAX_LABEL_BYTES),
            type: boundedText(column.type, 32),
        }));
}

/** 列出可用视图（有界截断），供看板做视图切换。 */
function listAvBoardViews(payload) {
    const data = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
        ? payload.data
        : null;
    const raw = data && Array.isArray(data.views) ? data.views : [];
    return raw.slice(0, BOARD_MAX_VIEWS).map((view) => ({
        id: boundedText(view && view.id, 64),
        name: boundedText(view && (view.name || view.title), BOARD_MAX_LABEL_BYTES),
    })).filter((view) => Boolean(view.id));
}

/**
 * 构建看板快照：按 groupBy 字段把行分桶，输出每桶的计数/占比与有界代表项。
 * groupBy 为空时聚合为单一"全部"桶。
 */
function buildAvBoardSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const data = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
        ? payload.data
        : null;
    if (!data) return null;
    const normalized = normalizeAvBoardConfig(config);
    if (!normalized.blockId) return null;
    const view = data.view && typeof data.view === "object" ? data.view : null;
    const {columns, rows} = collectAvBoardRows(view);
    if (!columns.length) return null;

    // 列位置索引：av 行 cells 按列顺序对齐，位置回退是真实契约的一部分。
    const columnPositions = new Map();
    columns.forEach((column, index) => {
        if (column && typeof column === "object") columnPositions.set(column, index);
    });
    const availableColumns = columns.filter((column) => column && typeof column === "object" && column.hidden !== true);
    const groupColumn = normalized.groupBy
        ? availableColumns.find((column) => avBoardColumnKeyOf(column).includes(normalized.groupBy))
        : null;
    const primaryColumn = availableColumns[0] || null;
    const groupPosition = groupColumn ? (columnPositions.get(groupColumn) ?? -1) : -1;
    const primaryPosition = primaryColumn ? (columnPositions.get(primaryColumn) ?? -1) : -1;

    const buckets = new Map();
    const pushRow = (key, row) => {
        const bucketKey = boundedText(key, BOARD_MAX_LABEL_BYTES) || (normalized.groupBy ? "未分组" : "全部");
        let bucket = buckets.get(bucketKey);
        if (!bucket) {
            bucket = {key: bucketKey, count: 0, items: []};
            buckets.set(bucketKey, bucket);
        }
        bucket.count += 1;
        const cell = avBoardCellOf(row, primaryColumn, primaryPosition);
        const text = boundedText(extractAvBoardCellText(cell && cell.value), BOARD_MAX_LABEL_BYTES);
        const rowId = boundedText(row.id, 64);
        const boundBlockId = boundedText(cell && cell.value && cell.value.block && cell.value.block.id, 64);
        const openId = BLOCK_ID_RE.test(boundBlockId) ? boundBlockId : (BLOCK_ID_RE.test(rowId) ? rowId : "");
        if (text && bucket.items.length < normalized.limit) {
            bucket.items.push({label: text, value: openId});
        }
    };

    for (const row of rows) {
        const groupCell = groupColumn ? avBoardCellOf(row, groupColumn, groupPosition) : null;
        const key = groupColumn ? extractAvBoardCellText(groupCell && groupCell.value) : "";
        pushRow(key, row);
        if (buckets.size > BOARD_MAX_GROUPS * 2) break; // 防御：异常宽表不无限膨胀
    }

    const totalRows = rows.length;
    const groups = [...buckets.values()]
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
        .slice(0, BOARD_MAX_GROUPS)
        .map((bucket) => {
            const group = {key: bucket.key, count: bucket.count, items: bucket.items};
            if (normalized.showPercent && totalRows > 0) {
                group.percent = Math.round((bucket.count / totalRows) * 1000) / 10;
            }
            return group;
        });

    const viewName = boundedText(view && view.name, BOARD_MAX_LABEL_BYTES) || boundedText(data.name, BOARD_MAX_LABEL_BYTES);
    const title = [boundedText(labels.title, 32) || "数据库看板", viewName].filter(Boolean).join(" · ");
    const items = groups.map((group) => {
        const topRow = group.items && group.items[0];
        const secondary = normalized.showPercent && group.percent !== undefined
            ? `${group.count} 行 (${group.percent}%)`
            : `${group.count} 行`;
        return {
            label: group.key,
            secondary,
            value: topRow ? topRow.value : "",
            count: group.count,
        };
    });
    return {
        title,
        status,
        updatedAt: now,
        groups,
        items: items.slice(0, BOARD_MAX_ITEMS),
        totalRows,
        groupedBy: groupColumn ? boundedText(groupColumn.name || groupColumn.label, BOARD_MAX_LABEL_BYTES) : "",
        emptyHint: boundedText(labels.empty, 96) || "属性视图当前无可聚合的数据行",
        stat: {
            value: groups.length > 1 ? `${groups.length} 组 / ${totalRows} 行` : String(totalRows),
            label: boundedText(labels.stat, 32) || "分组/总行",
        },
    };
}

module.exports = {
    BOARD_MAX_GROUPS,
    BOARD_MAX_ITEMS,
    BOARD_MAX_VIEWS,
    normalizeAvBoardConfig,
    extractAvBoardCellText,
    collectAvBoardRows,
    listAvBoardFields,
    listAvBoardViews,
    buildAvBoardSnapshot,
};
