// T-6690 双主题 pass 循环补丁（用后即删）
const fs = require("fs");
const file = "tests/chromium-style-smoke.cjs";
let s = fs.readFileSync(file, "utf8");

// 1) 断言段转成 pass 循环内、带主题前缀；exitCode 聚合
const oldTail = `    // T-6697/B2 对比度采样（WCAG AA）：普通文本 >=4.5:1，大字号统计值 >=3:1。
    // 夹具令牌集见 tests/fixtures/siyuan-mobile-base.css（T-6696）。
    const contrastEntries = Object.entries(result.contrast || {});
    for (const [name, ratio] of contrastEntries) {
        console.log("contrast " + name + ": " + ratio);
    }
    const largeTextOk = (result.contrast.statValue || 0) >= 3;
    const normalTextOk = ["moduleTitle", "itemLabel", "docTitle", "settingsTitle"].every((name) => (result.contrast[name] || 0) >= 4.5);
    console.log((largeTextOk && normalTextOk ? "PASS" : "FAIL") + " contrast ratios meet WCAG AA on the sampled surfaces");
    if (!(largeTextOk && normalTextOk)) process.exitCode = 1;
    console.log(JSON.stringify(result, null, 2));
    console.log(\`\${actionOk ? 'PASS' : 'FAIL'} Chromium mobile card actions\`);
    console.log(\`\${switchOk ? 'PASS' : 'FAIL'} Chromium settings switch\`);
    console.log(\`\${docCardsOk ? 'PASS' : 'FAIL'} Chromium document search cards\`);
    console.log(\`\${calendarOk ? 'PASS' : 'FAIL'} Chromium six-week calendar widget\`);
    console.log(\`\${weatherOk ? 'PASS' : 'FAIL'} Chromium responsive weather widget\`);
    console.log(\`\${mediaOk ? 'PASS' : 'FAIL'} Chromium responsive media widget\`);
    console.log(\`\${feedOk ? 'PASS' : 'FAIL'} Chromium ranked feed widget\`);
    process.exitCode = actionOk && switchOk && docCardsOk && calendarOk && weatherOk && mediaOk && feedOk ? 0 : 1;
} catch (error) {`;

const newTail = `        // T-6697/B2 对比度采样（WCAG AA）：普通文本 >=4.5:1，大字号统计值 >=3:1。
        // 夹具令牌集见 tests/fixtures/siyuan-mobile-base.css（T-6696）。
        const contrastEntries = Object.entries(result.contrast || {});
        for (const [name, ratio] of contrastEntries) {
            console.log("[" + pass.name + "] contrast " + name + ": " + ratio);
        }
        const largeTextOk = (result.contrast.statValue || 0) >= 3;
        const normalTextOk = ["moduleTitle", "itemLabel", "docTitle", "settingsTitle"].every((name) => (result.contrast[name] || 0) >= 4.5);
        console.log("[" + pass.name + "] " + (largeTextOk && normalTextOk ? "PASS" : "FAIL") + " contrast ratios meet WCAG AA on the sampled surfaces");
        if (!(largeTextOk && normalTextOk)) contrastAllOk = false;
        console.log(JSON.stringify(result, null, 2));
        console.log("[" + pass.name + "] " + (actionOk ? "PASS" : "FAIL") + " Chromium mobile card actions");
        console.log("[" + pass.name + "] " + (switchOk ? "PASS" : "FAIL") + " Chromium settings switch");
        console.log("[" + pass.name + "] " + (docCardsOk ? "PASS" : "FAIL") + " Chromium document search cards");
        console.log("[" + pass.name + "] " + (calendarOk ? "PASS" : "FAIL") + " Chromium six-week calendar widget");
        console.log("[" + pass.name + "] " + (weatherOk ? "PASS" : "FAIL") + " Chromium responsive weather widget");
        console.log("[" + pass.name + "] " + (mediaOk ? "PASS" : "FAIL") + " Chromium responsive media widget");
        console.log("[" + pass.name + "] " + (feedOk ? "PASS" : "FAIL") + " Chromium ranked feed widget");
        structuralAllOk = structuralAllOk && actionOk && switchOk && docCardsOk && calendarOk && weatherOk && mediaOk && feedOk;
    }
    process.exitCode = contrastAllOk && structuralAllOk ? 0 : 1;
} catch (error) {`;

if (!s.includes(oldTail)) {
    console.error("tail anchor missing");
    process.exit(1);
}
s = s.replace(oldTail, newTail);
fs.writeFileSync(file, s);
console.log("dual-theme pass loop installed");
