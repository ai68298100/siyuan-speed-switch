# -*- coding: utf-8 -*-
"""Restore PUA-corrupted comments (src/index.ts, src/settings-sections.ts,
src/doc-search-ui.ts) from the last healthy revision ed3858d (v0.16.8).

Mojibake was introduced in ac8858f..ac889f2 (v0.16.9 encoding accident);
R4/R5b later moved some corrupted comments into split modules, so the old
single-file revision is the authoritative source for all three files.

Per corrupted line: 1) unique ASCII anchor; 2) 3-gram overlap of the
lossy-inverse recovered text with adjacency prior; only a strict winner is
accepted. A replacement must keep the comment shape (// or * or /*-led).
"""
import io, re, subprocess, sys

FILES = ["src/index.ts", "src/settings-sections.ts", "src/doc-search-ui.ts"]
OLD_REV = "ed3858d"

# Manual restorations for the 29 lines the automatic matcher could not resolve.
# Values are full replacement lines (indentation included); a list means the
# corrupted line had swallowed following line breaks and must be split back.
# Sources: ed3858d:src/index.ts (grep-verified line numbers in comments),
# except L2550/L2585 in src/index.ts which were born corrupted in ac889f2
# (registerQuickActionAdapter + doc-search session code added post-v0.16.8)
# and are reconstructed from the lossy inverse (missing bytes were only
# punctuation plus the char 递, all forced by context).
MANUAL = {
    ("src/index.ts", 462):   ["// 默认设置（可被用户设置覆盖）"],  # ed3858d
    ("src/index.ts", 499):   ["// 侧边栏缩略图布局：enlarge 放大填满栏宽（默认） / columns 按宽度自动增加列数"],  # ed3858d:151
    ("src/index.ts", 1458):  ["    // 默认日记笔记本下拉（异步填充已打开笔记本，当前值命中时回填选中）"],  # ed3858d:577
    ("src/index.ts", 1866):  ["        // 构建标签栏与分组面板"],  # ed3858d
    ("src/index.ts", 2075):  ["    // 打开页签切换器"],  # ed3858d
    ("src/index.ts", 2077):  ["        // 手机端走独立适配"],  # ed3858d:1152
    ("src/index.ts", 2177):  ["        // 清理缩略图缓存中已无对应打开页签的孤儿条目（页签关闭即失效）"],  # ed3858d:1248
    ("src/index.ts", 2286):  ["                // 弹窗存活期间页签可能已增减，重取最新列表"],  # ed3858d:1316
    ("src/index.ts", 2376):  ["        // 顶栏日记按钮：打开/新建当日日记（未设默认日记本时首次点击弹出选择）"],  # ed3858d
    # born corrupted in ac889f2; embedded "        // " proves the original
    # had two separate comment lines (the 8-space indent survived verbatim)
    ("src/index.ts", 2550):  [
        "        // 每次输入都让上一轮请求失效。空关键词或缓存命中也必须递增序号；",
        "        // 否则较慢的旧请求返回后会覆盖当前界面。",
    ],
    # born corrupted in ac889f2; embedded "     * " proves three JSDoc lines
    ("src/index.ts", 2585):  [
        "     * 供第三方插件注册稳定的公开动作。持久化配置只保存 adapter id/value；",
        "     * 不保存函数或 DOM 选择器；插件卸载后对应入口会安全地变为无动作。",
        "     */",
    ],
    ("src/index.ts", 5434):  ["        // 面板当前已展开时高亮标识"],  # ed3858d
    ("src/index.ts", 5461):  ["    // 激活侧边栏面板并关闭切换器"],  # ed3858d
    ("src/index.ts", 5538):  ["    // 读取置顶列表"],  # ed3858d:1814
    ("src/index.ts", 5549):  ["    // 切换置顶状态，返回切换后是否为置顶"],  # ed3858d:1820
    ("src/index.ts", 6195):  ["        // 分组被删后清理其折叠状态"],  # ed3858d
    ("src/index.ts", 6368):  ["        // 新建分组并移动：弹窗输入分组名（新名称自动新建，留空移出分组）"],  # ed3858d
    ("src/index.ts", 6403):  ["    // 未收藏的页签确认后自动收藏到该分组"],  # ed3858d
    ("src/index.ts", 6680):  ["        // 初始焦点"],  # ed3858d
    ("src/index.ts", 7350):  ["        // 未收藏时收进收藏并选择分组"],  # ed3858d
    ("src/index.ts", 7412):  ["    // 清理缓存中已无对应打开页签的孤儿条目（页签关闭即失效）"],  # ed3858d:3253
    ("src/index.ts", 7639):  ["            // 弹窗已关闭或内容无效时放弃"],  # ed3858d
    ("src/index.ts", 7687):  ["            // 最后再退回整个面板内容"],  # ed3858d
    ("src/index.ts", 8035):  ["        // 清理缩略图缓存中已无对应打开页签的孤儿条目"],  # ed3858d:3757
    ("src/index.ts", 8353):  ["    // 手机端渲染页签卡片列表"],  # ed3858d
    ("src/index.ts", 8606):  ["    // 单列表：每项是文件图标 + 标题，点击关闭弹窗并跳转"],  # ed3858d
    ("src/index.ts", 8877):  ["        // 侧边栏缩略图布局：enlarge（默认）放大填满栏宽；columns 按宽度自动增加列数"],  # ed3858d:4300
    ("src/settings-sections.ts", 188): ["    // ===== 设置页 · 手机端：悬浮按钮开关、卡片布局 ====="],  # ed3858d:941
    ("src/doc-search-ui.ts", 558): ["            // 主动取消的请求不算异常"],  # ed3858d
}

old_lines = subprocess.run(["git", "show", f"{OLD_REV}:src/index.ts"],
                           capture_output=True, encoding="utf-8", check=True).stdout.split("\n")

def has_pua(s):
    return any(0xE000 <= ord(c) <= 0xF8FF for c in s)

def ascii_anchors(s, min_len=6):
    runs = re.findall(r"[\x20-\x7e]{%d,}" % min_len, s)
    return [r.strip() for r in runs if len(r.strip()) >= min_len
            and not re.fullmatch(r"[=/\s*=\-+|:,\"']+", r.strip())]

def recover(line):
    try:
        return line.encode("gbk", errors="ignore").decode("utf-8", errors="ignore")
    except Exception:
        return ""

def grams(s, n=3):
    s = re.sub(r"\s+", "", s)
    return set(s[i:i+n] for i in range(len(s) - n + 1))

def comment_shape(s):
    t = s.lstrip()
    if t.startswith("//"):
        return "//"
    if t.startswith("*") or t.startswith("/*"):
        return "*"
    return None

old_grams = [grams(ol) for ol in old_lines]
old_ascii_index = {}
for j, ol in enumerate(old_lines):
    for a in ascii_anchors(ol, 8):
        old_ascii_index.setdefault(a, []).append(j)

grand_resolved, grand_remaining = 0, []
for path in FILES:
    cur_lines = io.open(path, encoding="utf-8").read().split("\n")
    # apply manual restorations first, bottom-up so earlier line numbers hold
    manual_here = sorted(((ln, repl) for (p, ln), repl in MANUAL.items() if p == path),
                         reverse=True)
    for ln, repl in manual_here:
        assert has_pua(cur_lines[ln - 1]), f"MANUAL target {path}:{ln} has no PUA"
        cur_lines[ln - 1:ln] = repl
    if manual_here:
        print(f"{path}: manual {len(manual_here)}")
    pua_rows = [i for i, l in enumerate(cur_lines) if has_pua(l)]
    if not pua_rows:
        print(f"{path}: clean")
        continue
    blocks = []
    for i in pua_rows:
        if blocks and blocks[-1][-1] == i - 1:
            blocks[-1].append(i)
        else:
            blocks.append([i])
    resolved, report = 0, []
    resolved_old_rows = {}
    for blk in blocks:
        for i in blk:
            line = cur_lines[i]
            prior = {resolved_old_rows[j] for j in resolved_old_rows if j in blk}
            j = None
            for a in sorted(set(ascii_anchors(line)), key=len, reverse=True):
                hits = old_ascii_index.get(a, [])
                if len(hits) == 1:
                    j = hits[0]
                    break
            how = "ascii"
            if j is None:
                rec = recover(line)
                segs = [s for s in re.split(r"[^一-鿿]+", rec.replace("//", " ")) if len(s) >= 2]
                if segs:
                    cands = [k for k, ol in enumerate(old_lines)
                             if all(seg in ol for seg in segs)
                             and comment_shape(ol) == comment_shape(line)]
                    if len(cands) == 1 or (len(cands) > 1 and len({old_lines[k].strip() for k in cands}) == 1):
                        j = cands[0]
                        how = "segs(%d)" % len(segs)
                g = grams(rec) if len(rec) >= 8 else set()
                scored = []
                if len(g) >= 3:
                    for k, og in enumerate(old_grams):
                        if not og:
                            continue
                        inter = len(g & og)
                        if inter >= 6:
                            scored.append((inter, k))
                    scored.sort(reverse=True)
                    if prior and scored:
                        scored = sorted(scored, key=lambda s: (s[0] + (6 if any(abs(s[1]-r) <= 4 for r in prior) else 0), s[0]), reverse=True)
                if scored:
                    top, second = scored[0], scored[1] if len(scored) > 1 else (0, -1)
                    if top[0] >= 8 and top[0] >= second[0] + 5:
                        j = top[1]
                    elif top[0] >= 8 and top[0] == second[0] and old_lines[top[1]].strip() == old_lines[second[1]].strip():
                        # duplicated comment in the old file: same content either way
                        j = top[1]
                    how = "grams(%d/%d)" % (top[0], second[0])
            if j is not None and comment_shape(old_lines[j]) == comment_shape(line):
                indent = line[:len(line) - len(line.lstrip())]
                cur_lines[i] = indent + old_lines[j].strip()
                resolved_old_rows[i] = j
                resolved += 1
            else:
                if j is not None:
                    how += " shape-mismatch"
                report.append((i + 1, how, line.strip()[:44]))
    print(f"{path}: {len(pua_rows)} PUA lines, resolved {resolved}, remaining {len(report)}")
    for row in report:
        print("  L%d [%s] %s" % row)
    grand_resolved += resolved
    grand_remaining.extend((path,) + row for row in report)
    if "--write" in sys.argv:
        assert not any(has_pua(l) for l in cur_lines), f"PUA remains in {path}"
        io.open(path, "w", encoding="utf-8", newline="").write("\n".join(cur_lines))

print("TOTAL resolved:", grand_resolved, "remaining:", len(grand_remaining))
if "--write" in sys.argv:
    print("WRITTEN")
