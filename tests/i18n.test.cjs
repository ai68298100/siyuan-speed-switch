/**
 * i18n key 完整性防回归测试（P2-3）
 *
 * 静态扫描 src/ 下所有 TS/JS 源码中的 `xxx.i18n.KEY` 引用，
 * 断言每个被引用的 key 都存在于 zh-CN.json 与 en.json，
 * 且两份语言文件的 key 集合完全一致、无空值。
 *
 * 若代码中出现动态下标访问（i18n[expr]），本测试会直接失败——
 * 动态 key 无法静态扫描，请改用字面量访问或在 SCAN_FILES 中显式登记。
 */
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const I18N_DIR = path.join(SRC_DIR, "i18n");
const LANG_FILES = ["zh-CN.json", "en.json"].map((f) => path.join(I18N_DIR, f));

function walkSources(dir, out) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n") continue;
      walkSources(full, out);
    } else if (/\.(ts|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function collectReferencedKeys() {
  const files = walkSources(SRC_DIR, []);
  const keys = new Map();
  const dynamicHits = [];
  for (const file of files) {
    const rel = path.relative(SRC_DIR, file).replace(/\\/g, "/");
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/\.i18n\.([A-Za-z0-9_]+)/g)) {
      keys.set(m[1], (keys.get(m[1]) || 0) + 1);
    }
    for (const m of text.matchAll(/i18n\s*\[/g)) {
      dynamicHits.push(`${rel}: ${text.slice(Math.max(0, m.index - 40), m.index + 60).trim()}`);
    }
  }
  return {keys, dynamicHits, fileCount: files.length};
}

function loadLang(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("i18n: 源码中不允许动态 key 访问（i18n[expr]）", () => {
  const {dynamicHits} = collectReferencedKeys();
  assert.deepEqual(
    dynamicHits,
    [],
    "检测到动态 i18n 访问，静态扫描无法覆盖；请改为字面量访问或扩展本测试：\n" + dynamicHits.join("\n"),
  );
});

test("i18n: 源码中至少引用了 100 个 key（扫描有效性自检）", () => {
  const {keys, fileCount} = collectReferencedKeys();
  assert.ok(fileCount >= 1, "未扫描到任何 src 源文件");
  assert.ok(
    keys.size >= 100,
    `仅扫描到 ${keys.size} 个 i18n key 引用（预期 >= 100），扫描正则可能失效`,
  );
});

for (const langFile of LANG_FILES) {
  const langName = path.basename(langFile);
  test(`i18n: 所有被源码引用的 key 均存在于 ${langName}`, () => {
    const {keys} = collectReferencedKeys();
    const lang = loadLang(langFile);
    const missing = [...keys.keys()].filter((k) => !(k in lang));
    assert.deepEqual(
      missing,
      [],
      `${langName} 缺少以下被引用的 key（共 ${missing.length} 个）：\n` +
        missing.map((k) => `  ${k}（引用 ${keys.get(k)} 次）`).join("\n"),
    );
  });

  test(`i18n: ${langName} 所有 key 的值均为非空字符串`, () => {
    const lang = loadLang(langFile);
    const empty = Object.entries(lang)
      .filter(([, v]) => typeof v !== "string" || v.trim() === "")
      .map(([k]) => k);
    assert.deepEqual(empty, [], `${langName} 中以下 key 的值为空或非字符串：${empty.join(", ")}`);
  });

  test(`i18n: ${langName} 的 key 均为合法标识符（与静态扫描约定一致）`, () => {
    const lang = loadLang(langFile);
    const invalid = Object.keys(lang).filter((k) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(k));
    assert.deepEqual(
      invalid,
      [],
      `${langName} 中以下 key 不是合法标识符，无法被 xxx.i18n.KEY 形式引用：${invalid.join(", ")}`,
    );
  });
}

test("i18n: zh-CN 与 en 的 key 集合完全一致", () => {
  const zh = loadLang(LANG_FILES[0]);
  const en = loadLang(LANG_FILES[1]);
  const zhKeys = new Set(Object.keys(zh));
  const enKeys = new Set(Object.keys(en));
  const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k));
  const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k));
  assert.deepEqual(
    {onlyZh, onlyEn},
    {onlyZh: [], onlyEn: []},
    `语言文件 key 不一致：\n  仅在 zh-CN 中：${onlyZh.join(", ") || "（无）"}\n  仅在 en 中：${onlyEn.join(", ") || "（无）"}`,
  );
});

test("i18n: 报告未使用的 key（信息性，不判失败）", (t) => {
  const {keys} = collectReferencedKeys();
  const zh = loadLang(LANG_FILES[0]);
  const unused = Object.keys(zh).filter((k) => !keys.has(k));
  if (unused.length > 0) {
    t.diagnostic(`以下 key 定义了但源码未引用（可能是预留或待清理）：${unused.join(", ")}`);
  }
  assert.ok(true);
});
