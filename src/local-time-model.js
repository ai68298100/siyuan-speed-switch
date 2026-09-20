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
// 城市时区表（T-6720 结构反转）：按 zone 分组声明，初始化展平为 名称→zone 查找表。
// 分组写法让每个 zone 字符串只出现一次——esbuild 不去重对象字面量重复值，
// 平铺写法的重复 zone 串占用 raw 自律线余量（ADR 0062），分组后回收约 4KB。
const CITY_ZONE_GROUPS = Object.freeze({
    "Asia/Shanghai": ["北京", "上海", "深圳", "广州", "成都", "杭州", "武汉", "西安", "重庆", "南京", "青岛", "大连", "厦门", "福州", "合肥", "郑州", "长沙", "哈尔滨", "沈阳", "昆明", "海口", "南昌", "东莞", "佛山", "无锡", "宁波", "拉萨", "西宁", "兰州", "南宁", "天津", "济南", "太原", "石家庄", "长春", "珠海", "中山", "嘉兴", "绍兴", "洛阳", "徐州", "温州", "台州", "贵阳", "呼和浩特", "银川", "南通", "扬州", "常州", "泉州", "苏州", "Beijing", "Shanghai", "Shenzhen", "Guangzhou", "Chengdu", "Hangzhou", "Wuhan", "Xi'an", "Chongqing", "Nanjing", "Qingdao", "Dalian", "Xiamen", "Fuzhou", "Hefei", "Zhengzhou", "Changsha", "Harbin", "Shenyang", "Kunming", "Lhasa", "Tianjin", "Jinan", "Hohhot", "Yinchuan", "Dongguan", "Foshan", "Wuxi", "Ningbo", "Jiaxing", "Shaoxing", "Luoyang", "Xuzhou", "Wenzhou", "Taizhou", "Zhongshan", "Zhuhai", "Haikou", "Nanchang", "Xining", "Lanzhou", "Nanning", "Taiyuan", "Shijiazhuang", "Changchun", "Guiyang", "Nantong", "Yangzhou", "Changzhou", "Quanzhou", "Suzhou"],
    "Asia/Urumqi": ["乌鲁木齐", "Urumqi"],
    "Asia/Hong_Kong": ["香港", "Hong Kong"],
    "Asia/Macau": ["澳门", "Macau"],
    "Asia/Taipei": ["台北", "Taipei", "高雄", "Kaohsiung", "台中", "Taichung"],
    "Asia/Tokyo": ["东京", "大阪", "Tokyo", "Osaka", "Nagoya", "Fukuoka", "Sapporo", "名古屋", "福冈", "札幌", "京都", "Kyoto", "广岛", "Hiroshima"],
    "Asia/Seoul": ["首尔", "Seoul", "Busan", "釜山", "仁川", "Incheon", "大邱", "Daegu"],
    "Asia/Singapore": ["新加坡", "Singapore"],
    "Asia/Bangkok": ["曼谷", "Bangkok"],
    "Asia/Kuala_Lumpur": ["吉隆坡"],
    "Asia/Jakarta": ["雅加达", "Jakarta", "泗水", "Surabaya"],
    "Asia/Kolkata": ["新德里", "孟买", "班加罗尔", "金奈", "海得拉巴", "Hyderabad", "Delhi", "Mumbai", "Bangalore", "Chennai", "海得拉巴", "Hyderabad"],
    "Asia/Dubai": ["迪拜", "Dubai", "阿布扎比", "Abu Dhabi"],
    "Asia/Riyadh": ["利雅得", "吉达", "Jeddah", "麦加", "Mecca", "麦地那", "Medina"],
    "Europe/London": ["伦敦", "London", "Manchester", "曼彻斯特", "Edinburgh", "爱丁堡", "伯明翰", "Birmingham", "格拉斯哥", "Glasgow"],
    "Europe/Paris": ["巴黎", "Paris", "里昂", "Lyon", "马赛", "Marseille", "波尔多", "Bordeaux", "尼斯", "Nice"],
    "Europe/Berlin": ["柏林", "Berlin", "Munich", "Hamburg", "慕尼黑", "汉堡", "法兰克福", "Frankfurt", "科隆", "Cologne", "斯图加特", "Stuttgart", "莱比锡", "Leipzig", "德累斯顿", "Dresden"],
    "Europe/Rome": ["罗马", "Rome", "Milan", "Florence", "米兰", "佛罗伦萨", "那不勒斯", "Naples", "威尼斯", "Venice", "都灵", "Turin"],
    "Europe/Madrid": ["马德里", "Madrid", "Barcelona", "巴塞罗那", "塞维利亚", "Seville"],
    "Europe/Amsterdam": ["阿姆斯特丹", "Amsterdam", "鹿特丹", "Rotterdam"],
    "Europe/Zurich": ["苏黎世", "Zurich", "Geneva", "日内瓦", "伯尔尼", "Bern"],
    "Europe/Stockholm": ["斯德哥尔摩", "Stockholm", "哥德堡", "Gothenburg"],
    "Europe/Moscow": ["莫斯科", "Moscow"],
    "Europe/Istanbul": ["伊斯坦布尔", "Istanbul", "Ankara", "安卡拉"],
    "America/New_York": ["纽约", "New York", "华盛顿", "Washington", "Boston", "Miami", "Atlanta", "波士顿", "迈阿密", "亚特兰大", "费城", "Philadelphia", "奥兰多", "Orlando"],
    "America/Los_Angeles": ["洛杉矶", "旧金山", "Los Angeles", "San Francisco", "Seattle", "西雅图", "San Diego", "圣迭戈", "拉斯维加斯", "Las Vegas", "波特兰", "Portland"],
    "America/Chicago": ["芝加哥", "Chicago", "Houston", "休斯敦", "Dallas", "达拉斯", "明尼阿波利斯", "Minneapolis", "新奥尔良", "New Orleans", "奥斯汀", "Austin", "纳什维尔", "Nashville"],
    "America/Denver": ["丹佛", "Denver"],
    "America/Toronto": ["多伦多", "Toronto", "Montreal", "蒙特利尔", "Ottawa", "渥太华"],
    "America/Vancouver": ["温哥华", "Vancouver"],
    "America/Sao_Paulo": ["圣保罗", "Sao Paulo", "巴西利亚", "Brasilia"],
    "America/Argentina/Buenos_Aires": ["布宜诺斯艾利斯"],
    "Australia/Sydney": ["悉尼", "Sydney", "Canberra", "堪培拉"],
    "Australia/Melbourne": ["墨尔本", "Melbourne"],
    "Pacific/Auckland": ["奥克兰", "Auckland", "惠灵顿", "Wellington", "克赖斯特彻奇", "Christchurch"],
    "Asia/Manila": ["Manila", "马尼拉", "宿务", "Cebu"],
    "Asia/Ho_Chi_Minh": ["Hanoi", "河内", "胡志明市"],
    "Europe/Vienna": ["Vienna", "维也纳", "萨尔茨堡", "Salzburg"],
    "Europe/Prague": ["Prague", "布拉格"],
    "Europe/Warsaw": ["Warsaw", "华沙", "克拉科夫", "Krakow"],
    "Europe/Lisbon": ["Lisbon", "里斯本", "波尔图", "Porto"],
    "Europe/Copenhagen": ["Copenhagen", "哥本哈根"],
    "Europe/Dublin": ["Dublin", "都柏林"],
    "Europe/Athens": ["Athens", "雅典"],
    "Europe/Helsinki": ["Helsinki", "赫尔辛基"],
    "Europe/Budapest": ["Budapest", "布达佩斯"],
    "Europe/Belgrade": ["Belgrade", "贝尔格莱德"],
    "America/Phoenix": ["Phoenix", "凤凰城"],
    "America/Lima": ["Lima", "利马"],
    "America/Santiago": ["Santiago", "圣地亚哥"],
    "America/Bogota": ["Bogota", "波哥大"],
    "Australia/Perth": ["Perth", "珀斯"],
    "Australia/Brisbane": ["Brisbane", "布里斯班"],
    "Africa/Cairo": ["Cairo", "开罗", "亚历山大", "Alexandria"],
    "Africa/Nairobi": ["Nairobi", "内罗毕"],
    "Africa/Johannesburg": ["Cape Town", "Johannesburg", "开普敦", "约翰内斯堡"],
    "Asia/Kuwait": ["Kuwait", "科威特城"],
    "Asia/Amman": ["Amman", "安曼"],
    "Asia/Beirut": ["Beirut", "贝鲁特"],
    "Asia/Tashkent": ["Tashkent", "塔什干"],
    "Asia/Almaty": ["Almaty", "阿拉木图"],
    "Asia/Kathmandu": ["Kathmandu", "加德满都"],
    "Asia/Dhaka": ["Dhaka", "达卡"],
    "Asia/Colombo": ["Colombo", "科伦坡"],
    "Asia/Phnom_Penh": ["Phnom Penh", "金边"],
    "America/Havana": ["Havana", "哈瓦那"],
    "America/Caracas": ["Caracas", "加拉加斯"],
    "America/Guayaquil": ["Quito", "基多"],
    "Asia/Yangon": ["仰光", "Yangon"],
    "Asia/Baku": ["巴库", "Baku"],
    "Asia/Yerevan": ["埃里温", "Yerevan"],
    "Asia/Tbilisi": ["第比利斯", "Tbilisi"],
    "Europe/Sofia": ["索非亚", "Sofia"],
    "Europe/Zagreb": ["萨格勒布", "Zagreb"],
    "Europe/Bucharest": ["布加勒斯特", "Bucharest"],
    "Europe/Tallinn": ["塔林", "Tallinn"],
    "Europe/Riga": ["里加", "Riga"],
    "Europe/Vilnius": ["维尔纽斯", "Vilnius"],
    "Atlantic/Reykjavik": ["雷克雅未克", "Reykjavik"],
    "Africa/Casablanca": ["卡萨布兰卡", "Casablanca"],
    "Africa/Lagos": ["拉各斯", "Lagos"],
    "Africa/Addis_Ababa": ["亚的斯亚贝巴", "Addis Ababa"],
    "America/Mexico_City": ["墨西哥城", "Mexico City", "瓜达拉哈拉", "Guadalajara"],
    "America/Panama": ["巴拿马城", "Panama City"],
    "Pacific/Fiji": ["苏瓦", "Fiji"],
    "Pacific/Honolulu": ["檀香山", "Honolulu"],
    "America/Anchorage": ["安克雷奇", "Anchorage"],
    "Europe/Oslo": ["奥斯陆", "Oslo", "卑尔根", "Bergen"],
    "Asia/Vientiane": ["万象", "Vientiane"],
    "America/Montevideo": ["蒙得维的亚", "Montevideo"],
    "America/Asuncion": ["亚松森", "Asuncion"],
    "Australia/Darwin": ["Darwin", "达尔文"],
    "Asia/Ulaanbaatar": ["Ulaanbaatar", "乌兰巴托"],
    "Asia/Tehran": ["Tehran", "德黑兰"],
    "Asia/Baghdad": ["Baghdad", "巴格达"],
    "Asia/Jerusalem": ["Tel Aviv", "特拉维夫", "Jerusalem", "耶路撒冷"],
    "Asia/Qatar": ["Doha", "多哈"],
    "Asia/Muscat": ["Muscat", "马斯喀特"],
    "Asia/Karachi": ["Islamabad", "伊斯兰堡", "Karachi", "卡拉奇", "拉合尔", "Lahore"],
    "Europe/Kyiv": ["Kyiv", "基辅"],
    "Europe/Minsk": ["Minsk", "明斯克"],
    "Europe/Brussels": ["Brussels", "布鲁塞尔", "安特卫普", "Antwerp"],
    "America/Edmonton": ["Calgary", "卡尔加里"],
    "Pacific/Port_Moresby": ["Port Moresby", "莫尔兹比港"],
    "America/Detroit": ["底特律", "Detroit"],
    "Australia/Adelaide": ["阿德莱德", "Adelaide"],
    "Australia/Hobart": ["霍巴特", "Hobart"],
    "Pacific/Tahiti": ["帕皮提", "Papeete"],
    "Pacific/Noumea": ["努美阿", "Noumea"],
    "Asia/Bahrain": ["麦纳麦", "Manama"],
    "Asia/Bishkek": ["比什凯克", "Bishkek"],
    "Asia/Dushanbe": ["杜尚别", "Dushanbe"],
    "Asia/Ashgabat": ["阿什哈巴德", "Ashgabat"],
    "America/Costa_Rica": ["圣何塞", "San Jose"],
    "America/Jamaica": ["金斯敦", "Kingston"],
    "Africa/Dakar": ["达喀尔", "Dakar"],
    "Africa/Abidjan": ["阿比让", "Abidjan"],
    "Africa/Algiers": ["阿尔及尔", "Algiers"],
    "Africa/Tunis": ["突尼斯", "Tunis"],
    "Africa/Tripoli": ["的黎波里", "Tripoli"],
    "Africa/Khartoum": ["喀土穆", "Khartoum"],
    "Africa/Luanda": ["罗安达", "Luanda"],
    "Africa/Accra": ["阿克拉", "Accra"],
    "Africa/Kigali": ["基加利", "Kigali"],
    "Africa/Harare": ["哈拉雷", "Harare"],
    "Africa/Lusaka": ["卢萨卡", "Lusaka"],
    "Africa/Maputo": ["马普托", "Maputo"],
    "Africa/Kampala": ["坎帕拉", "Kampala"],
    "Africa/Dar_es_Salaam": ["达累斯萨拉姆"],
    "Africa/Kinshasa": ["金沙萨", "Kinshasa"],
    "Asia/Kabul": ["喀布尔", "Kabul"],
    "Pacific/Guam": ["关岛", "Guam"],
    "Asia/Yekaterinburg": ["叶卡捷琳堡", "Yekaterinburg"],
    "Asia/Novosibirsk": ["新西伯利亚", "Novosibirsk"],
    "Asia/Vladivostok": ["海参崴", "Vladivostok"],
    "America/Winnipeg": ["温尼伯", "Winnipeg"],
    "Asia/Damascus": ["大马士革", "Damascus"],
});
const CITY_TIME_ZONES = (() => {
    const flat = {};
    for (const zone of Object.keys(CITY_ZONE_GROUPS)) {
        const names = CITY_ZONE_GROUPS[zone];
        for (let index = 0; index < names.length; index += 1) flat[names[index]] = zone;
    }
    return Object.freeze(flat);
})();
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
