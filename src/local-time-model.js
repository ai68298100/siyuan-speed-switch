"use strict";

function normalizeClockLocale(value, fallback = "zh-CN") {
    const candidate = typeof value === "string" ? value.trim().replace(/_/g, "-").slice(0, 64) : "";
    if (candidate) {
        try {
            if (Intl.DateTimeFormat.supportedLocalesOf([candidate]).length > 0) return candidate;
        } catch (_) { /* invalid BCP 47 tag */ }
    }
    try {
        if (Intl.DateTimeFormat.supportedLocalesOf([fallback]).length > 0) return fallback;
    } catch (_) { /* use deterministic final fallback */ }
    return "en-US";
}

// T-6457 display 覆盖试点：强调档位白名单（标准=不带令牌，大/特大映射令牌）
function emphasisToken(value) {
    if (value === "大") return "large";
    if (value === "特大") return "xl";
    return "standard";
}

function normalizeLocalTimeConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        hour12: source.hourFormat === "12 小时制",
        showSeconds: source.showSeconds === "是",
        showDate: source.showDate !== "否" && source.showDate !== false,
        emphasis: emphasisToken(source.emphasis),
    };
}

function buildLocalTimeSnapshot(date = new Date(), locale = "zh-CN", labels = {}, config = {}) {
    const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(0);
    const safeLocale = normalizeClockLocale(locale);
    const normalized = normalizeLocalTimeConfig(config);
    const timeOptions = {hour: "2-digit", minute: "2-digit", hour12: normalized.hour12};
    if (normalized.showSeconds) timeOptions.second = "2-digit";
    const items = [];
    if (normalized.showDate) {
        items.push({
            label: `${new Intl.DateTimeFormat(safeLocale, {year: "numeric", month: "long", day: "numeric"}).format(value)} · ${new Intl.DateTimeFormat(safeLocale, {weekday: "long"}).format(value)}`,
            value: "",
        });
    }
    const stat = {
        value: new Intl.DateTimeFormat(safeLocale, timeOptions).format(value),
        label: typeof labels.localTime === "string" ? labels.localTime.slice(0, 32) : "",
    };
    if (normalized.emphasis !== "standard") stat.emphasis = normalized.emphasis;
    return {stat, items};
}

// ---------- T-6433/T-6456 年度进度：日历日语义 + 年/季/月周期 ----------
function normalizeYearProgressConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        showElapsed: source.showElapsed !== "否" && source.showElapsed !== false,
        showRemaining: source.showRemaining !== "否" && source.showRemaining !== false,
        period: source.period === "季度" || source.period === "月份" ? source.period : "年度",
    };
}

function buildYearProgressSnapshot(now = new Date(), config = {}, labels = {}) {
    const value = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(0);
    const normalized = normalizeYearProgressConfig(config);
    const year = value.getFullYear();
    const dayMs = 86400000;
    // 用本地年月日的 UTC 毫秒差计算日历天数：DST 造成的一小时偏移被整除吸收，
    // 平年/闰年与季/月边界由日历本身给出，不依赖运行环境的时区偏移量。
    const startUtc = Date.UTC(year, 0, 1);
    const endUtc = Date.UTC(year + 1, 0, 1);
    const label = `${year}`;
    if (normalized.period === "季度") {
        const quarter = Math.floor(value.getMonth() / 3);
        return projectProgress(
            value,
            Date.UTC(year, quarter * 3, 1),
            Date.UTC(year, quarter * 3 + 3, 1),
            `${year} Q${quarter + 1}`,
            normalized,
            labels,
        );
    }
    if (normalized.period === "月份") {
        return projectProgress(
            value,
            Date.UTC(year, value.getMonth(), 1),
            Date.UTC(year, value.getMonth() + 1, 1),
            `${year}-${String(value.getMonth() + 1).padStart(2, "0")}`,
            normalized,
            labels,
        );
    }
    return projectProgress(value, startUtc, endUtc, label, normalized, labels);
}

function projectProgress(value, startUtc, endUtc, label, normalized, labels) {
    const dayMs = 86400000;
    const total = Math.round((endUtc - startUtc) / dayMs);
    const elapsed = Math.min(total, Math.max(1, Math.round((Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) - startUtc) / dayMs) + 1));
    const remaining = total - elapsed;
    const percent = Math.round((elapsed / total) * 100);
    const items = [];
    const elapsedLabel = typeof labels.elapsed === "string" ? labels.elapsed : "";
    const remainingLabel = typeof labels.remaining === "string" ? labels.remaining : "";
    if (normalized.showElapsed && elapsedLabel) items.push({label: elapsedLabel.replace("{x}", String(elapsed)), value: ""});
    if (normalized.showRemaining && remainingLabel) items.push({label: remainingLabel.replace("{x}", String(remaining)), value: ""});
    return {
        stat: {value: `${percent}%`, label, progress: percent, arc: {value: elapsed, max: total}},
        items,
    };
}

// ---------- T-6435 倒数日：目标日期校验、每年重复与到期语义 ----------
const COUNTDOWN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeCountdownConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const target = typeof source.targetDate === "string" ? source.targetDate.trim() : "";
    return {
        title: typeof source.title === "string" ? source.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 32) : "",
        targetDate: COUNTDOWN_DATE_PATTERN.test(target) ? target : "",
        repeat: source.repeat === "每年" ? "yearly" : "none",
        showTargetDate: source.showTargetDate !== "否" && source.showTargetDate !== false,
        // T-6455：倒数（默认，剩余天数）与累计（“已经 N 天”，从最近一次发生日起算）双模式
        mode: source.mode === "累计" ? "elapsed" : "countdown",
        emphasis: emphasisToken(source.emphasis),
    };
}

function countdownDayDiff(targetTime, todayStart) {
    return Math.round((targetTime - todayStart) / 86400000);
}

function pad2(value) {
    return String(value).padStart(2, "0");
}

function parseCountdownDate(target) {
    if (!COUNTDOWN_DATE_PATTERN.test(target)) return null;
    const year = Number(target.slice(0, 4));
    const month = Number(target.slice(5, 7));
    const day = Number(target.slice(8, 10));
    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
    return {year, month, day};
}

function isRealCalendarDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

// 每年重复按“当月最后一天”钳制：2 月 29 日在平年落到 2 月 28 日，不漂移到别的月份。
function yearlyOccurrence(year, month, day) {
    const lastDay = new Date(year, month, 0).getDate();
    const effectiveDay = Math.min(day, lastDay);
    return {time: new Date(year, month - 1, effectiveDay).getTime(), day: effectiveDay};
}

function buildCountdownSnapshot(now = new Date(), config = {}, labels = {}) {
    const normalized = normalizeCountdownConfig(config);
    const hint = typeof labels.hint === "string" ? labels.hint : "";
    const parts = parseCountdownDate(normalized.targetDate);
    if (!parts) return {items: [{label: hint, value: ""}]};
    const value = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(0);
    const todayStart = new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    let targetTime;
    let displayDate;
    if (normalized.repeat === "yearly") {
        let occurrence = yearlyOccurrence(value.getFullYear(), parts.month, parts.day);
        if (occurrence.time < todayStart) occurrence = yearlyOccurrence(value.getFullYear() + 1, parts.month, parts.day);
        targetTime = occurrence.time;
        displayDate = `${pad2(parts.month)}-${pad2(occurrence.day)}`;
    } else {
        // 一次性目标日期严格校验：2 月 30 日等不可能日期回退配置提示，不静默溢出
        if (!isRealCalendarDate(parts.year, parts.month, parts.day)) return {items: [{label: hint, value: ""}]};
        targetTime = new Date(parts.year, parts.month - 1, parts.day).getTime();
        displayDate = normalized.targetDate;
    }
    if (!Number.isFinite(targetTime)) return {items: [{label: hint, value: ""}]};
    const elapsedLabel = typeof labels.elapsedDays === "string" && labels.elapsedDays ? labels.elapsedDays : "已经 {n} 天";
    if (normalized.mode === "elapsed") {
        // 累计口径：N = 距最近一次发生日（每年重复取最近周年）的整天数，当天记 0；
        // 目标在未来（一次性日期尚未到来）时没有已流逝的天数，同样记 0，不伪造倒计回退。
        const thisYearOccurrence = yearlyOccurrence(value.getFullYear(), parts.month, parts.day);
        const anchor = normalized.repeat === "yearly"
            ? (thisYearOccurrence.time <= todayStart ? thisYearOccurrence.time : yearlyOccurrence(value.getFullYear() - 1, parts.month, parts.day).time)
            : targetTime;
        const elapsedDays = Math.max(0, countdownDayDiff(todayStart, anchor));
        const title2 = normalized.title || (typeof labels.untitled === "string" ? labels.untitled : "");
        const yearlyMark2 = normalized.repeat === "yearly" && typeof labels.yearly === "string" ? labels.yearly : "";
        const parts2 = [title2, yearlyMark2];
        if (normalized.showTargetDate) parts2.push(displayDate);
        return {
            stat: applyEmphasis({value: String(elapsedDays), label: elapsedLabel.replace("{n}", String(elapsedDays))}, normalized.emphasis),
            items: [{label: parts2.filter(Boolean).join(" · "), value: ""}],
        };
    }
    const days = countdownDayDiff(targetTime, todayStart);
    const remaining = typeof labels.remaining === "string" ? labels.remaining : "";
    const todayLabel = typeof labels.today === "string" ? labels.today : "";
    const passed = typeof labels.passed === "string" ? labels.passed : "";
    const dayLabel = days > 0 ? remaining.replace("{n}", String(days))
        : days === 0 ? todayLabel
            : passed.replace("{n}", String(-days));
    const title = normalized.title || (typeof labels.untitled === "string" ? labels.untitled : "");
    const yearlyMark = normalized.repeat === "yearly" && typeof labels.yearly === "string" ? labels.yearly : "";
    const content = [title, yearlyMark];
    if (normalized.showTargetDate) content.push(displayDate);
    return {
        stat: applyEmphasis({value: days === 0 ? "0" : String(Math.abs(days)), label: dayLabel}, normalized.emphasis),
        items: [{label: content.filter(Boolean).join(" · "), value: ""}],
    };
}

function applyEmphasis(stat, emphasis) {
    if (emphasis && emphasis !== "standard") stat.emphasis = emphasis;
    return stat;
}

const WORLD_CLOCK_MAX_CITIES = 8;

function isValidTimeZone(timeZone) {
    if (typeof timeZone !== "string" || !timeZone) return false;
    try {
        new Intl.DateTimeFormat("en-US", {timeZone}).format(new Date(0));
        return true;
    } catch (_) {
        return false;
    }
}

// T-6690 离线城市表：常见城市中文名 → IANA 时区（纯静态、零网络、约 45 城）。
// 目标是让 `cities` 文本字段可以直接写中文城市名（如 "上海,东京,纽约"），
// 免去手打 IANA ID；已是合法 IANA 的条目原样直通，未知名称沿用既有丢弃语义。
const CITY_TIME_ZONES = Object.freeze({
    // —— 中国大陆 ——
    "北京": "Asia/Shanghai", "上海": "Asia/Shanghai", "深圳": "Asia/Shanghai", "广州": "Asia/Shanghai",
    "成都": "Asia/Shanghai", "杭州": "Asia/Shanghai", "武汉": "Asia/Shanghai", "西安": "Asia/Shanghai",
    "重庆": "Asia/Shanghai", "南京": "Asia/Shanghai", "青岛": "Asia/Shanghai", "大连": "Asia/Shanghai",
    "厦门": "Asia/Shanghai", "福州": "Asia/Shanghai", "合肥": "Asia/Shanghai", "郑州": "Asia/Shanghai",
    "长沙": "Asia/Shanghai", "哈尔滨": "Asia/Shanghai", "沈阳": "Asia/Shanghai", "昆明": "Asia/Shanghai",
    "海口": "Asia/Shanghai", "南昌": "Asia/Shanghai", "东莞": "Asia/Shanghai", "佛山": "Asia/Shanghai",
    "无锡": "Asia/Shanghai", "宁波": "Asia/Shanghai", "乌鲁木齐": "Asia/Urumqi", "拉萨": "Asia/Shanghai",
    "西宁": "Asia/Shanghai", "兰州": "Asia/Shanghai", "南宁": "Asia/Shanghai", "天津": "Asia/Shanghai",
    "济南": "Asia/Shanghai", "太原": "Asia/Shanghai", "石家庄": "Asia/Shanghai", "长春": "Asia/Shanghai",
    "珠海": "Asia/Shanghai", "中山": "Asia/Shanghai", "嘉兴": "Asia/Shanghai", "绍兴": "Asia/Shanghai",
    "洛阳": "Asia/Shanghai", "徐州": "Asia/Shanghai", "温州": "Asia/Shanghai", "台州": "Asia/Shanghai",
    "贵阳": "Asia/Shanghai",
    // —— 港澳台 ——
    "香港": "Asia/Hong_Kong", "澳门": "Asia/Macau", "台北": "Asia/Taipei",
    // —— 亚洲 ——
    "东京": "Asia/Tokyo", "大阪": "Asia/Tokyo", "首尔": "Asia/Seoul", "新加坡": "Asia/Singapore",
    "曼谷": "Asia/Bangkok", "吉隆坡": "Asia/Kuala_Lumpur", "雅加达": "Asia/Jakarta", "新德里": "Asia/Kolkata",
    "孟买": "Asia/Kolkata", "迪拜": "Asia/Dubai", "利雅得": "Asia/Riyadh",
    // —— 欧洲 ——
    "伦敦": "Europe/London", "巴黎": "Europe/Paris", "柏林": "Europe/Berlin", "罗马": "Europe/Rome",
    "马德里": "Europe/Madrid", "阿姆斯特丹": "Europe/Amsterdam", "苏黎世": "Europe/Zurich",
    "斯德哥尔摩": "Europe/Stockholm", "莫斯科": "Europe/Moscow", "伊斯坦布尔": "Europe/Istanbul",
    // —— 美洲 ——
    "纽约": "America/New_York", "洛杉矶": "America/Los_Angeles", "旧金山": "America/Los_Angeles",
    "芝加哥": "America/Chicago", "丹佛": "America/Denver", "多伦多": "America/Toronto",
    "温哥华": "America/Vancouver", "圣保罗": "America/Sao_Paulo", "布宜诺斯艾利斯": "America/Argentina/Buenos_Aires",
    // —— 大洋洲 ——
    "悉尼": "Australia/Sydney", "墨尔本": "Australia/Melbourne", "奥克兰": "Pacific/Auckland",
    // —— 英文别名（T-6690 第二批+第四批） ——
    "Tokyo": "Asia/Tokyo", "Osaka": "Asia/Tokyo", "Nagoya": "Asia/Tokyo", "Fukuoka": "Asia/Tokyo", "Sapporo": "Asia/Tokyo",
    "Seoul": "Asia/Seoul", "Busan": "Asia/Seoul", "Singapore": "Asia/Singapore", "Bangkok": "Asia/Bangkok",
    "Jakarta": "Asia/Jakarta", "Delhi": "Asia/Kolkata", "Mumbai": "Asia/Kolkata", "Dubai": "Asia/Dubai",
    "Hong Kong": "Asia/Hong_Kong", "Taipei": "Asia/Taipei", "Manila": "Asia/Manila", "Hanoi": "Asia/Ho_Chi_Minh",
    "London": "Europe/London", "Paris": "Europe/Paris", "Berlin": "Europe/Berlin", "Rome": "Europe/Rome",
    "Madrid": "Europe/Madrid", "Amsterdam": "Europe/Amsterdam", "Zurich": "Europe/Zurich", "Stockholm": "Europe/Stockholm",
    "Moscow": "Europe/Moscow", "Istanbul": "Europe/Istanbul", "Vienna": "Europe/Vienna", "Prague": "Europe/Prague",
    "Warsaw": "Europe/Warsaw", "Lisbon": "Europe/Lisbon", "Copenhagen": "Europe/Copenhagen", "Dublin": "Europe/Dublin",
    "Athens": "Europe/Athens", "Helsinki": "Europe/Helsinki", "Budapest": "Europe/Budapest", "Belgrade": "Europe/Belgrade",
    "Munich": "Europe/Berlin", "Hamburg": "Europe/Berlin", "Milan": "Europe/Rome", "Florence": "Europe/Rome",
    "New York": "America/New_York", "Los Angeles": "America/Los_Angeles", "San Francisco": "America/Los_Angeles",
    "Chicago": "America/Chicago", "Denver": "America/Denver", "Seattle": "America/Los_Angeles",
    "Boston": "America/New_York", "Miami": "America/New_York", "Toronto": "America/Toronto",
    "Vancouver": "America/Vancouver", "Sao Paulo": "America/Sao_Paulo", "Houston": "America/Chicago",
    "Atlanta": "America/New_York", "Phoenix": "America/Phoenix", "Montreal": "America/Toronto",
    "Lima": "America/Lima", "Santiago": "America/Santiago", "Bogota": "America/Bogota",
    "Sydney": "Australia/Sydney", "Melbourne": "Australia/Melbourne", "Auckland": "Pacific/Auckland",
    "Perth": "Australia/Perth", "Brisbane": "Australia/Brisbane",
    // —— T-6695b 第五波 ——
    "Cairo": "Africa/Cairo", "Nairobi": "Africa/Nairobi", "Cape Town": "Africa/Johannesburg", "Johannesburg": "Africa/Johannesburg",
    "Kuwait": "Asia/Kuwait", "Amman": "Asia/Amman", "Beirut": "Asia/Beirut", "Tashkent": "Asia/Tashkent",
    "Almaty": "Asia/Almaty", "Kathmandu": "Asia/Kathmandu", "Dhaka": "Asia/Dhaka", "Colombo": "Asia/Colombo",
    "Phnom Penh": "Asia/Phnom_Penh", "Havana": "America/Havana", "Caracas": "America/Caracas", "Quito": "America/Guayaquil",
    // —— T-6699b 第六波：世界城市补充 ——
    "仰光": "Asia/Yangon", "Yangon": "Asia/Yangon", "巴库": "Asia/Baku", "Baku": "Asia/Baku",
    "埃里温": "Asia/Yerevan", "Yerevan": "Asia/Yerevan", "第比利斯": "Asia/Tbilisi", "Tbilisi": "Asia/Tbilisi",
    "索非亚": "Europe/Sofia", "Sofia": "Europe/Sofia", "萨格勒布": "Europe/Zagreb", "Zagreb": "Europe/Zagreb",
    "布加勒斯特": "Europe/Bucharest", "Bucharest": "Europe/Bucharest", "塔林": "Europe/Tallinn", "Tallinn": "Europe/Tallinn",
    "里加": "Europe/Riga", "Riga": "Europe/Riga", "维尔纽斯": "Europe/Vilnius", "Vilnius": "Europe/Vilnius",
    "雷克雅未克": "Atlantic/Reykjavik", "Reykjavik": "Atlantic/Reykjavik", "卡萨布兰卡": "Africa/Casablanca", "Casablanca": "Africa/Casablanca",
    "拉各斯": "Africa/Lagos", "Lagos": "Africa/Lagos", "亚的斯亚贝巴": "Africa/Addis_Ababa", "Addis Ababa": "Africa/Addis_Ababa",
    "墨西哥城": "America/Mexico_City", "Mexico City": "America/Mexico_City", "巴拿马城": "America/Panama", "Panama City": "America/Panama",
    "苏瓦": "Pacific/Fiji", "Fiji": "Pacific/Fiji", "檀香山": "Pacific/Honolulu", "Honolulu": "Pacific/Honolulu",
    "安克雷奇": "America/Anchorage", "Anchorage": "America/Anchorage", "惠灵顿": "Pacific/Auckland", "Wellington": "Pacific/Auckland",

    // —— T-6700b 第七波：区域补充 ——
    "呼和浩特": "Asia/Shanghai", "银川": "Asia/Shanghai", "南通": "Asia/Shanghai", "扬州": "Asia/Shanghai",
    "常州": "Asia/Shanghai", "泉州": "Asia/Shanghai", "奥斯陆": "Europe/Oslo", "Oslo": "Europe/Oslo",
    "雅典": "Europe/Athens", "里斯本": "Europe/Lisbon", "万象": "Asia/Vientiane", "Vientiane": "Asia/Vientiane",
    "蒙得维的亚": "America/Montevideo", "Montevideo": "America/Montevideo", "亚松森": "America/Asuncion", "Asuncion": "America/Asuncion",
    "名古屋": "Asia/Tokyo",
    "福冈": "Asia/Tokyo",
    "札幌": "Asia/Tokyo",
    "釜山": "Asia/Seoul",
    "马尼拉": "Asia/Manila",
    "河内": "Asia/Ho_Chi_Minh",
    "维也纳": "Europe/Vienna",
    "布拉格": "Europe/Prague",
    "华沙": "Europe/Warsaw",
    "哥本哈根": "Europe/Copenhagen",
    "都柏林": "Europe/Dublin",
    "赫尔辛基": "Europe/Helsinki",
    "布达佩斯": "Europe/Budapest",
    "贝尔格莱德": "Europe/Belgrade",
    "慕尼黑": "Europe/Berlin",
    "汉堡": "Europe/Berlin",
    "米兰": "Europe/Rome",
    "佛罗伦萨": "Europe/Rome",
    "西雅图": "America/Los_Angeles",
    "波士顿": "America/New_York",
    "迈阿密": "America/New_York",
    "休斯敦": "America/Chicago",
    "亚特兰大": "America/New_York",
    "凤凰城": "America/Phoenix",
    "蒙特利尔": "America/Toronto",
    "利马": "America/Lima",
    "圣地亚哥": "America/Santiago",
    "波哥大": "America/Bogota",
    "珀斯": "Australia/Perth",
    "布里斯班": "Australia/Brisbane",
    "开罗": "Africa/Cairo",
    "内罗毕": "Africa/Nairobi",
    "开普敦": "Africa/Johannesburg",
    "约翰内斯堡": "Africa/Johannesburg",
    "科威特城": "Asia/Kuwait",
    "安曼": "Asia/Amman",
    "贝鲁特": "Asia/Beirut",
    "塔什干": "Asia/Tashkent",
    "阿拉木图": "Asia/Almaty",
    "加德满都": "Asia/Kathmandu",
    "达卡": "Asia/Dhaka",
    "科伦坡": "Asia/Colombo",
    "金边": "Asia/Phnom_Penh",
    "哈瓦那": "America/Havana",
    "加拉加斯": "America/Caracas",
    "基多": "America/Guayaquil",
    "Beijing": "Asia/Shanghai",
    "Shanghai": "Asia/Shanghai",
    "Shenzhen": "Asia/Shanghai",
    "Guangzhou": "Asia/Shanghai",
    "Chengdu": "Asia/Shanghai",
    "Hangzhou": "Asia/Shanghai",
    "Wuhan": "Asia/Shanghai",
    "Xi'an": "Asia/Shanghai",
    "Chongqing": "Asia/Shanghai",
    "Nanjing": "Asia/Shanghai",
    "Qingdao": "Asia/Shanghai",
    "Dalian": "Asia/Shanghai",
    "Xiamen": "Asia/Shanghai",
    "Fuzhou": "Asia/Shanghai",
    "Hefei": "Asia/Shanghai",
    "Zhengzhou": "Asia/Shanghai",
    "Changsha": "Asia/Shanghai",
    "Harbin": "Asia/Shanghai",
    "Shenyang": "Asia/Shanghai",
    "Kunming": "Asia/Shanghai",
    "Urumqi": "Asia/Urumqi",
    "Lhasa": "Asia/Shanghai",
    "Tianjin": "Asia/Shanghai",
    "Jinan": "Asia/Shanghai",
    "Macau": "Asia/Macau",
    "Hohhot": "Asia/Shanghai",
    "Yinchuan": "Asia/Shanghai",
    "Canberra": "Australia/Sydney",
    "堪培拉": "Australia/Sydney",
    "Darwin": "Australia/Darwin",
    "达尔文": "Australia/Darwin",
    "Ulaanbaatar": "Asia/Ulaanbaatar",
    "乌兰巴托": "Asia/Ulaanbaatar",
    "Tehran": "Asia/Tehran",
    "德黑兰": "Asia/Tehran",
    "Baghdad": "Asia/Baghdad",
    "巴格达": "Asia/Baghdad",
    "Ankara": "Europe/Istanbul",
    "安卡拉": "Europe/Istanbul",
    "Tel Aviv": "Asia/Jerusalem",
    "特拉维夫": "Asia/Jerusalem",
    "Jerusalem": "Asia/Jerusalem",
    "耶路撒冷": "Asia/Jerusalem",
    "Doha": "Asia/Qatar",
    "多哈": "Asia/Qatar",
    "Muscat": "Asia/Muscat",
    "马斯喀特": "Asia/Muscat",
    "Islamabad": "Asia/Karachi",
    "伊斯兰堡": "Asia/Karachi",
    "Karachi": "Asia/Karachi",
    "卡拉奇": "Asia/Karachi",
    "Kyiv": "Europe/Kyiv",
    "基辅": "Europe/Kyiv",
    "Minsk": "Europe/Minsk",
    "明斯克": "Europe/Minsk",
    "Geneva": "Europe/Zurich",
    "日内瓦": "Europe/Zurich",
    "Brussels": "Europe/Brussels",
    "布鲁塞尔": "Europe/Brussels",
    "Barcelona": "Europe/Madrid",
    "巴塞罗那": "Europe/Madrid",
    "Manchester": "Europe/London",
    "曼彻斯特": "Europe/London",
    "Edinburgh": "Europe/London",
    "爱丁堡": "Europe/London",
    "Ottawa": "America/Toronto",
    "渥太华": "America/Toronto",
    "Calgary": "America/Edmonton",
    "卡尔加里": "America/Edmonton",
    "San Diego": "America/Los_Angeles",
    "圣迭戈": "America/Los_Angeles",
    "Dallas": "America/Chicago",
    "达拉斯": "America/Chicago",
    "Port Moresby": "Pacific/Port_Moresby",
    "莫尔兹比港": "Pacific/Port_Moresby",
});
function normalizeWorldClockConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const raw = typeof source.cities === "string" ? source.cities : "";
    // T-6690+：先按分隔符切分；城市名自带空格（如 New York）会被切碎——
    // 贪心两段重连查离线城市表，命中即整体消费，避免表内多词条目成为死条目。
    const tokens = raw.split(/[,，;；\s]+/)
        .map((item) => item.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 64))
        .filter(Boolean);
    const zones = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const pair = tokens[index] + " " + (tokens[index + 1] ?? "");
        if (CITY_TIME_ZONES[pair] !== undefined) {
            zones.push(CITY_TIME_ZONES[pair]);
            index += 1;
            continue;
        }
        zones.push(CITY_TIME_ZONES[tokens[index]] !== undefined ? CITY_TIME_ZONES[tokens[index]] : tokens[index]);
    }
    const unique = [...new Set(zones.filter((item) => isValidTimeZone(item)))]
        .slice(0, WORLD_CLOCK_MAX_CITIES);
    return {cities: unique, hour12: source.hourFormat === "12 小时制"};
}

function zoneDateParts(timeZone, date, locale) {
    try {
        const parts = new Intl.DateTimeFormat(locale, {timeZone, year: "numeric", month: "numeric", day: "numeric"}).formatToParts(date);
        const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
        const result = {year: pick("year"), month: pick("month"), day: pick("day")};
        return [result.year, result.month, result.day].every((n) => Number.isFinite(n)) ? result : null;
    } catch (_) {
        return null;
    }
}

function zoneDayDelta(localParts, zoneParts) {
    if (!localParts || !zoneParts) return 0;
    const utc = (p) => Date.UTC(p.year, p.month - 1, p.day);
    return Math.round((utc(zoneParts) - utc(localParts)) / 86400000);
}

function zoneShortName(timeZone, date, locale) {
    try {
        const parts = new Intl.DateTimeFormat(locale, {timeZone, timeZoneName: "short"}).formatToParts(date);
        return boundedZoneLabel(parts.find((part) => part.type === "timeZoneName")?.value || "");
    } catch (_) {
        return "";
    }
}

function boundedZoneLabel(value) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 24) : "";
}

function buildWorldClockSnapshot(date = new Date(), config = {}, labels = {}) {
    const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(0);
    const locale = normalizeClockLocale(typeof labels.locale === "string" ? labels.locale : "zh-CN");
    const normalized = normalizeWorldClockConfig(config);
    // 空配置回退本地与 UTC，保证组件开箱可用；列表本身无城市时仍显示两行而不是空态。
    const zones = normalized.cities.length > 0
        ? [...new Set([...normalized.cities, "UTC"])]
        : ["local", "UTC"];
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    // 相对日标记：与世界时钟本地日期比较，仅标注 ±1/±2 天（±2 只在时区极值的小时出现）
    const localParts = {year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate()};
    const dayOffsets = Array.isArray(labels.dayOffsets) ? labels.dayOffsets : [];
    const dayWord = (delta) => (delta >= -2 && delta <= 2 && delta !== 0 ? boundedZoneLabel(dayOffsets[delta + 2]) : "");
    const formatCache = new Map();
    const timeIn = (timeZone) => {
        if (!formatCache.has(timeZone)) {
            formatCache.set(timeZone, new Intl.DateTimeFormat(locale, {hour: "2-digit", minute: "2-digit", hour12: normalized.hour12, timeZone}));
        }
        return formatCache.get(timeZone).format(value);
    };
    const rows = zones.map((zone) => {
        const resolved = zone === "local" ? localZone : zone;
        const city = zone === "local"
            ? (boundedZoneLabel(labels.local) || boundedZoneLabel(localZone.split("/").pop()) || "Local")
            : boundedZoneLabel(zone.split("/").pop().replace(/_/g, " "));
        const offset = zone === "local" ? "" : zoneShortName(resolved, value, locale);
        const marker = zone === "local" ? "" : dayWord(zoneDayDelta(localParts, zoneDateParts(resolved, value, locale)));
        return {
            label: marker ? `${city} · ${marker}` : city,
            value: offset ? `${timeIn(resolved)} ${offset}` : timeIn(resolved),
        };
    });
    return {stat: {value: rows[0]?.value || "", label: boundedZoneLabel(labels.worldClock) || "世界时钟"}, items: rows};
}

function millisecondsToNextMinute(now = Date.now()) {
    const value = Number.isFinite(now) ? Math.max(0, Math.trunc(now)) : 0;
    const remainder = value % 60000;
    return Math.min(60025, Math.max(25, 60000 - remainder + 25));
}

// 秒针模式专用：仅在被显式开启秒显示的本地时钟卡片存在时使用，其余路径保持分钟心跳。
function millisecondsToNextSecond(now = Date.now()) {
    const value = Number.isFinite(now) ? Math.max(0, Math.trunc(now)) : 0;
    const remainder = value % 1000;
    return Math.min(1025, Math.max(25, 1000 - remainder + 25));
}

module.exports = {
    CITY_TIME_ZONES,normalizeClockLocale, buildLocalTimeSnapshot, normalizeLocalTimeConfig, normalizeWorldClockConfig, buildWorldClockSnapshot, millisecondsToNextMinute, millisecondsToNextSecond, normalizeYearProgressConfig, buildYearProgressSnapshot, normalizeCountdownConfig, buildCountdownSnapshot, WORLD_CLOCK_MAX_CITIES};
