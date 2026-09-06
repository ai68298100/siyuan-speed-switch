// 搜索会话状态与界面容器一一对应，避免弹窗、侧栏和手机端互相取消请求。

/**
 * @template T
 * @param {number} cacheLimit
 * @returns {{version: number, cache: Map<string, T>, controller: AbortController|null, timer: number|null, cacheLimit: number}}
 */
function createSearchSession(cacheLimit) {
    return {
        version: 0,
        cache: new Map(),
        controller: null,
        timer: null,
        cacheLimit,
    };
}

/**
 * 开始新一轮搜索：旧定时器和旧请求同时失效，并返回本轮版本号。
 * @param {{version: number, controller: AbortController|null, timer: number|null}} session
 * @returns {number}
 */
function beginSearch(session) {
    session.version += 1;
    if (session.timer !== null) {
        globalThis.clearTimeout(session.timer);
        session.timer = null;
    }
    session.controller?.abort();
    session.controller = null;
    return session.version;
}

/**
 * 写入有界缓存。达到上限时清空旧关键词，避免长时间使用后持续增长。
 * @template T
 * @param {{cache: Map<string, T>, cacheLimit: number}} session
 * @param {string} key
 * @param {T} value
 */
function cacheSearchResult(session, key, value) {
    if (!session.cache.has(key) && session.cache.size >= session.cacheLimit) {
        session.cache.clear();
    }
    session.cache.set(key, value);
}

/**
 * 销毁界面时释放会话资源。
 * @param {{version: number, cache: Map<string, unknown>, controller: AbortController|null, timer: number|null}} session
 */
function disposeSearchSession(session) {
    beginSearch(session);
    session.cache.clear();
}

module.exports = {createSearchSession, beginSearch, cacheSearchResult, disposeSearchSession};
