const fs = require('fs');
// 修复 zh-CN.json 中被写成真实换行的 \n 转义
let zh = fs.readFileSync('src/i18n/zh-CN.json', 'utf8');
const broken = '新建文档：\n{title}",';
const fixed = '新建文档：\\n{title}",';
if (zh.includes(broken)) {
    zh = zh.replace(broken, fixed);
    fs.writeFileSync('src/i18n/zh-CN.json', zh);
    console.log('zh fixed');
} else if (zh.includes('新建文档：\\n{title}",')) {
    console.log('zh already ok');
} else {
    console.log('zh desc line not found (insert may be missing)');
}
JSON.parse(zh);

// en：补 aiCreateDocDesc（若缺）
let en = fs.readFileSync('src/i18n/en.json', 'utf8');
if (!en.includes('aiCreateDocDesc')) {
    const ji = en.indexOf('  "aiConfirmTitle":');
    if (ji < 0) { console.error('en anchor missing'); process.exit(1); }
    en = en.slice(0, ji) + '  "aiCreateDocDesc": "The agent wants to create a document in notebook [{notebook}]:\\n{title}",\n' + en.slice(ji);
    fs.writeFileSync('src/i18n/en.json', en);
}
JSON.parse(en);
console.log('i18n all valid');
