// 小驴雷切 —— 文档搜索链路状态宿主（R5a 自 index.ts 收拢，D-381）
// 6 个实例级状态字段收拢为单一状态对象：WeakMap/Set 语义与代际竞态保护不变，
// 仅作用域重组。类型经 import type 自 "./index" 引用（编译期擦除，无运行时循环）。
import type {IDocSearchFilters, IDocSearchResult, ISearchSession} from "./index";
import type {buildSearchHealthSnapshot} from "./search-model";

export interface DocSearchState {
    /** 每个 scroll 元素各自的搜索会话（缓存 + AbortController） */
    sessions: WeakMap<HTMLElement, ISearchSession<IDocSearchResult[]>>;
    /** 存活会话集合，卸载时统一 dispose */
    activeSessions: Set<ISearchSession<IDocSearchResult[]>>;
    /** 每个 scroll 元素当前的筛选条件（冻结对象） */
    filters: WeakMap<HTMLElement, IDocSearchFilters>;
    /** 每个 scroll 元素已解析的笔记本 ID → 名称 */
    notebookNames: WeakMap<HTMLElement, Map<string, string>>;
    /** 路径筛选代际标记：自增使过期响应失效（竞态保护，此语义不得退化） */
    pathGeneration: number;
    /** 每个 scroll 元素已预取的路径标题 */
    pathTitles: WeakMap<HTMLElement, Map<string, string>>;
    /** T-6802：每个 scroll 元素当前查询的运算符解析结果（精确短语/排除项/普通词） */
    parsedQueries: WeakMap<HTMLElement, IParsedSearchQuery>;
    /** T-6809：每个 scroll 元素当前选中的过滤条（all/tabs/unified/docs），空查询时重置 */
    chipFilters: WeakMap<HTMLElement, string>;
    /** Current diagnostic only, discarded with its surface; no search history. */
    health: WeakMap<HTMLElement, ReturnType<typeof buildSearchHealthSnapshot>>;
    /** T-6825：文档区清空（loading）期间暂存的视口锚点，results 渲染后消费即清 */
    docAnchors: WeakMap<HTMLElement, {key: string; offset: number} | null>;
    /** T-6827：每个 scroll 元素的筛选按钮状态同步器（外部改筛选后刷新徽标） */
    filterButtonSync: WeakMap<HTMLElement, () => void>;
}

/** T-6802 查询运算符解析结果：`"精确短语"` / `-排除词` / 普通词（全部 AND） */
export interface IParsedSearchQuery {
    phrases: string[];
    excludes: string[];
    terms: string[];
}

export function createDocSearchState(): DocSearchState {
    return {
        sessions: new WeakMap(),
        activeSessions: new Set(),
        filters: new WeakMap(),
        notebookNames: new WeakMap(),
        pathGeneration: 0,
        pathTitles: new WeakMap(),
        parsedQueries: new WeakMap(),
        chipFilters: new WeakMap(),
        health: new WeakMap(),
        docAnchors: new WeakMap(),
        filterButtonSync: new WeakMap(),
    };
}
