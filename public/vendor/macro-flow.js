// \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t, t.exports), e = null), t.exports), s = (e, n) => {
	let r = {};
	for (var i in e) t(r, i, {
		get: e[i],
		enumerable: !0
	});
	return n || t(r, Symbol.toStringTag, { value: "Module" }), r;
}, c = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, l = (n, r, o) => (o = n == null ? {} : e(i(n)), c(r || !n || !n.__esModule || !a.call(n, "default") ? t(o, "default", {
	value: n,
	enumerable: !0
}) : o, n)), u = "#f5455c", d = "#5b9cf8", f = "#f59e0b", p = {
	pos: u,
	neg: d,
	div: f
}, m = {
	pos: null,
	neg: "6 4",
	div: "2 4"
}, h = {
	anchor: {
		label: "① 全球定价之锚 · 流动性总阀",
		short: "定价之锚",
		tone: "anchor"
	},
	commodity: {
		label: "② 通胀与实体之源",
		short: "通胀实体",
		tone: "commodity"
	},
	hedge: {
		label: "③ 终极避险 · 波动温度计",
		short: "终极避险",
		tone: "hedge"
	},
	risk: {
		label: "④ 全球权益与高 Beta",
		short: "权益高Beta",
		tone: "risk"
	}
}, g = [
	{
		id: "dxy",
		tier: 0,
		zone: "anchor",
		w: 152,
		h: 78
	},
	{
		id: "us10y",
		tier: 0,
		zone: "anchor",
		w: 152,
		h: 78
	},
	{
		id: "oil",
		tier: 1,
		zone: "commodity",
		sub: "brent",
		w: 152,
		h: 98
	},
	{
		id: "copper",
		tier: 1,
		zone: "commodity",
		w: 152,
		h: 78
	},
	{
		id: "gold-intl",
		tier: 2,
		zone: "hedge",
		sub: "gold-cn",
		w: 152,
		h: 98
	},
	{
		id: "sh000001",
		tier: 3,
		zone: "risk",
		w: 152,
		h: 78
	},
	{
		id: "sp500",
		tier: 3,
		zone: "risk",
		w: 152,
		h: 78
	},
	{
		id: "ndx100",
		tier: 3,
		zone: "risk",
		w: 152,
		h: 78
	},
	{
		id: "btc",
		tier: 3,
		zone: "risk",
		w: 152,
		h: 78
	},
	{
		id: "vix",
		tier: 3,
		zone: "risk",
		sub: "vxn",
		w: 152,
		h: 98
	}
], _ = new Map(g.map((e) => [e.id, e])), v = [
	["gold-intl", "黄金"],
	["oil", "原油"],
	["dxy", "美元"],
	["us10y", "美债10Y"],
	["ndx100", "纳指"],
	["sp500", "标普"],
	["copper", "铜"],
	["btc", "BTC"],
	["vix", "VIX"],
	["sh000001", "上证"],
	["gold-cn", "沪金"],
	["brent", "布伦特"],
	["vxn", "VXN"]
], y = [
	"oil",
	"dxy",
	"us10y",
	"vix",
	"copper",
	"ndx100"
], b = [
	["compass", "🌐 全局罗盘"],
	["mindmap", "🌿 单点思维导图"],
	["sandbox", "⚡ 沙盘推演"]
], x = [
	{
		id: "E01",
		from: "dxy",
		to: "gold-intl",
		sign: -1,
		weight: 3,
		label: "计价压制",
		mechanism: "国际黄金以美元计价。美元走强一方面抬高非美买家的本币成本，另一方面说明美元信用相对走强，两者共同压制金价。",
		divergence: "地缘危机 / 主权债务担忧：爆发战争或市场担忧美债信用时，资金同时涌入美元与黄金避险，出现罕见的「同涨」。"
	},
	{
		id: "E02",
		from: "dxy",
		to: "oil",
		sign: -1,
		weight: 2,
		label: "计价效应",
		mechanism: "原油贸易以美元结算（石油美元）。美元升值直接削弱新兴市场与欧洲的原油进口购买力，压制以美元计价的油价。",
		divergence: "供给端强冲击：OPEC+ 大幅减产或中东航道受阻时，供给短缺压倒汇率计价，油价与美元同时走强。"
	},
	{
		id: "E03",
		from: "dxy",
		to: "copper",
		sign: -1,
		weight: 2,
		label: "计价与流动性",
		mechanism: "美元走强往往伴随全球美元流动性收紧，抑制工业金属的投机需求与非美制造业的原料采购。",
		divergence: "中美制造业共振复苏：全球工业补库需求极强时，基本面拉动铜价无视美元走强。"
	},
	{
		id: "E04",
		from: "dxy",
		to: "btc",
		sign: -1,
		weight: 2,
		label: "流动性虹吸",
		mechanism: "美元指数走强代表全球风险资金回流美元现金资产。高风险、高 Beta 的加密资产首当其冲失血。",
		divergence: "加密原生叙事 / ETF 资金流入：现货 ETF 大规模净流入或监管利好期间，BTC 可走出独立行情。"
	},
	{
		id: "E05",
		from: "us10y",
		to: "gold-intl",
		sign: -1,
		weight: 3,
		label: "机会成本",
		mechanism: "黄金是零息资产，美债收益率就是持有黄金的直接机会成本。美债利率上行（尤其实际利率上行）对金价构成强压制。",
		divergence: "去美元化与央行购金：全球央行战略性增持黄金、或市场担忧财政赤字货币化时，金价经常顶着高美债利率创新高。"
	},
	{
		id: "E06",
		from: "us10y",
		to: "ndx100",
		sign: -1,
		weight: 3,
		label: "估值折现",
		mechanism: "美债 10Y 是全球风险资产定价的「分母」。科技成长股远期现金流占比高（长久期），对利率上行极其敏感。",
		divergence: "经济强劲复苏 / AI 盈利爆发：利率温和上行源于经济繁荣、企业盈利（分子端）增速远超利率涨幅时，纳指可与利率同涨。"
	},
	{
		id: "E07",
		from: "us10y",
		to: "dxy",
		sign: 1,
		weight: 3,
		label: "利差吸引",
		mechanism: "美债收益率上升扩大了美元对欧元、日元、人民币的利差优势，吸引全球套息与配置资金流入美元。",
		divergence: "美国财政可持续性危机：美债遭抛售（收益率飙升）若源于市场质疑财政纪律，美元反而可能随美债价格一同下跌（股债汇三杀）。"
	},
	{
		id: "E08",
		from: "oil",
		to: "gold-intl",
		sign: 1,
		weight: 2,
		label: "通胀驱动",
		mechanism: "原油是「通胀之母」。油价上涨直接推升 CPI 与通胀预期，激发黄金作为硬通货的抗通胀保值需求。",
		divergence: "衰退型油价下跌 / 紧缩抢跑：衰退担忧升温时原油因需求坍塌暴跌，而黄金因避险与降息预期反而上涨（金油比飙升）。"
	},
	{
		id: "E09",
		from: "oil",
		to: "us10y",
		sign: 1,
		weight: 2,
		label: "通胀与加息",
		mechanism: "油价大涨推升全面通胀预期，迫使美联储推迟降息甚至维持高利率；债券投资者要求更高的通胀补偿，推升美债收益率。",
		divergence: "地缘恐慌下的避险买债：油价暴涨若由突发战争引起，避险资金短期涌入美债，反而压低美债收益率。"
	},
	{
		id: "E10",
		from: "oil",
		to: "sp500",
		sign: -1,
		weight: 1,
		label: "能源成本税",
		mechanism: "高油价相当于对全社会企业和居民征收「能源税」，挤压航空、物流、制造利润并削弱消费能力（能源板块除外）。",
		divergence: "需求驱动型温和上涨：经济复苏早期需求回暖带动油价与股市同步温和上涨，此时油价反映的是景气而非供给冲击。"
	},
	{
		id: "E11",
		from: "copper",
		to: "sp500",
		sign: 1,
		weight: 2,
		label: "经济晴雨表",
		mechanism: "铜广泛用于电力、建筑、新能源与制造业，被称为「铜博士」。铜价走强验证全球实体需求扩张，利好企业盈利。",
		divergence: "供给侧矿端罢工 / 逼仓：铜价暴涨若纯由矿山停产或期货逼仓导致，并不代表实体需求好转。"
	},
	{
		id: "E12",
		from: "copper",
		to: "sh000001",
		sign: 1,
		weight: 2,
		label: "中国需求映射",
		mechanism: "中国消耗全球约一半的精炼铜。地产基建与制造业景气度同时驱动铜价与 A 股周期 / 顺周期板块。",
		divergence: "国内纯流动性 / 题材行情：A 股由微盘股或科技主题驱动、而宏观总需求偏弱时，两者相关性明显减弱。"
	},
	{
		id: "E13",
		from: "ndx100",
		to: "btc",
		sign: 1,
		weight: 3,
		label: "科技与流动性",
		mechanism: "两者同属全球美元流动性与风险偏好的最前沿晴雨表，机构投资者画像高度重叠，呈显著正相关。",
		divergence: "加密行业独立黑天鹅：交易所暴雷或专属监管事件会导致 BTC 脱离美股独立剧烈波动。"
	},
	{
		id: "E14",
		from: "sp500",
		to: "vix",
		sign: -1,
		weight: 3,
		label: "恐慌期权对冲",
		mechanism: "标普 500 下跌时机构恐慌性抢购看跌期权（Put）做尾部保护，直接推升隐含波动率 VIX（实测相关性约 −0.75）。",
		divergence: "极少失效（结构性负相关）：仅在极端逼空行情中，可能出现股指暴涨而看涨期权隐含波动率短暂抬升。"
	},
	{
		id: "E15",
		from: "vix",
		to: "gold-intl",
		sign: 1,
		weight: 2,
		label: "避险买盘",
		mechanism: "VIX 飙升、全球风险资产剧烈动荡时，避险资金从股市撤出并配置黄金，以对冲尾部风险。",
		divergence: "流动性枯竭危机（Cash is King）：极端崩盘初期（如 2020 年 3 月熔断），机构为补交保证金无差别抛售黄金换现金，黄金随股市短暂同跌。"
	},
	{
		id: "E16",
		from: "gold-intl",
		to: "gold-cn",
		sign: 1,
		weight: 3,
		label: "内外盘折算",
		cluster: !0,
		mechanism: "沪金由伦敦金通过「÷ 31.1035 × 美元兑人民币汇率」传导定价，长周期周频相关性在 +0.72 以上。",
		divergence: "人民币汇率大幅波动 / 境内外溢价：人民币单日大幅波动，或国内春节购金旺季、进口配额收紧时，内外盘出现明显价差偏离。"
	},
	{
		id: "E17",
		from: "sp500",
		to: "ndx100",
		sign: 1,
		weight: 3,
		label: "美股共振",
		mechanism: "纳指 100 权重股（科技七巨头）同时占标普 500 近三成权重，两者同受美国宏观与企业盈利驱动（相关性 > +0.92）。",
		divergence: "风格高低切换（价值 vs 成长）：利率急升引发科技股杀估值、资金轮动去能源 / 金融 / 道指时，纳指显著弱于标普。"
	},
	{
		id: "E18",
		from: "oil",
		to: "brent",
		sign: 1,
		weight: 3,
		label: "全球原油双锚",
		cluster: !0,
		mechanism: "同受全球原油供需与 OPEC+ 政策驱动（相关性 > +0.92）。WTI 偏重美国内陆供需，布伦特偏重欧洲与中东海运。",
		divergence: "美湾库欣交割库拥堵 / 地缘航运割裂：地缘冲突封锁红海或霍尔木兹海峡时，布伦特溢价会显著扩大。"
	}
], S = new Map(x.map((e) => [e.id, e])), C = x.filter((e) => !e.cluster), w = new Map(g.filter((e) => e.sub).map((e) => [e.sub, e.id])), T = [
	{
		id: "dollar-tide",
		name: "① 美元潮汐",
		sub: "鹰派加息冲击",
		edges: [
			"E07",
			"E06",
			"E01",
			"E02",
			"E03",
			"E04"
		],
		breaks: [],
		steps: [
			["美联储收紧或通胀超预期", "10Y ↑"],
			["利差吸引全球套息资金", "美元 ↑"],
			["分母端折现率抬升 + 流动性收紧", "黄金 / 原油 / 铜 / BTC ↓"],
			["长久期成长股杀估值", "纳指 ↓"]
		],
		note: "「万物皆跌」型冲击：利率与美元同向走强，风险资产与大宗同时承压。"
	},
	{
		id: "oil-spiral",
		name: "② 石油通胀螺旋",
		sub: "滞胀魅影",
		edges: [
			"E08",
			"E09",
			"E06",
			"E10"
		],
		breaks: [],
		steps: [
			["地缘减产或供给危机引爆油价", "原油 ↑"],
			["通胀预期抬头，抗通胀买盘进场", "黄金 ↑（一阶）"],
			["顽固通胀倒逼利率走高", "10Y ↑"],
			["高估值科技股与消费股承压", "纳指 ↓ / 标普 ↓"]
		],
		note: "黄金先跟涨、股市后挨打 —— 一阶交易通胀，二阶交易紧缩，节奏差是关键。"
	},
	{
		id: "geo-crisis",
		name: "③ 地缘危机",
		sub: "黄金美元罕见同涨",
		edges: [
			"E14",
			"E15",
			"E09"
		],
		breaks: ["E01", "E02"],
		steps: [
			["战乱或重大地缘冲突爆发", "标普 ↓ → VIX ↑"],
			["避险资金涌入黄金", "黄金 ↑"],
			["同时抢购原油防断供、抢美元要流动性", "原油 ↑ / 美元 ↑"],
			["平时「美元涨→黄金跌」的跷跷板被打破", "美元 ↑ 与 黄金 ↑ 同涨"]
		],
		note: "这条剧本的意义在于：它专门用来解释背离。看到 E01 / E02 变琥珀色，就该切到这个剧本。"
	},
	{
		id: "recession",
		name: "④ 衰退恐慌交易",
		sub: "铜油跌、债金涨",
		edges: [
			"E11",
			"E14",
			"E05"
		],
		breaks: ["E10"],
		steps: [
			["非农 / 制造业数据暴雷", "铜 ↓ / 原油 ↓"],
			["对实体需求最敏感的铜博士率先下跌", "标普 ↓"],
			["押注央行大幅降息，美债收益率跳水", "10Y ↓"],
			["持有成本下降 + 避险需求", "黄金 ↑（独立走强）"]
		],
		note: "注意 E10「能源成本税」在这里失效：油价跌本该利多股市，但需求坍塌压倒成本利好 —— 所以标为打破。"
	},
	{
		id: "risk-on",
		name: "⑤ 流动性狂欢",
		sub: "Risk-On 降息交易",
		edges: [
			"E07",
			"E06",
			"E01",
			"E02",
			"E03",
			"E04",
			"E13",
			"E14"
		],
		breaks: [],
		steps: [
			["宽松周期开启", "10Y ↓"],
			["利差优势收窄，美元回落", "美元 ↓"],
			["廉价资金涌入高 Beta 与实物资产", "BTC ↑ / 纳指 ↑"],
			["计价压制反转 + 工业需求预期改善", "黄金 ↑ / 铜 ↑ / 原油 ↑"],
			["波动率被压平", "VIX ↓"]
		],
		note: "与①完全镜像：利率与美元同步下行时，几乎所有风险资产与大宗同涨。"
	}
], E = new Map(T.map((e) => [e.id, e]));
function D(e) {
	return String(e ?? "").replace(/[&<>"']/g, (e) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[e]);
}
function ee(e) {
	return e > 0 ? "+" : "−";
}
function te(e, t) {
	return t?.status === "diverged" ? "div" : e.sign > 0 ? "pos" : "neg";
}
function ne(e) {
	if (!Array.isArray(e)) return null;
	for (let t = e.length - 1; t >= 0; --t) if (e[t] != null && Number.isFinite(e[t])) return e[t];
	return null;
}
function re(e) {
	let t = (e ?? []).filter((e) => e != null && Number.isFinite(e));
	if (t.length < 3) return null;
	let n = t.reduce((e, t) => e + t, 0) / t.length, r = t.reduce((e, t) => e + (t - n) ** 2, 0), i = Math.sqrt(r / (t.length - 1));
	return i > 0 ? i : null;
}
function ie(e, t) {
	let n = e.length;
	if (n < 3) return null;
	let r = 0, i = 0;
	for (let a = 0; a < n; a += 1) r += e[a], i += t[a];
	let a = r / n, o = i / n, s = 0, c = 0, l = 0;
	for (let r = 0; r < n; r += 1) {
		let n = e[r] - a, i = t[r] - o;
		s += n * i, c += n * n, l += i * i;
	}
	return c === 0 || l === 0 ? null : s / Math.sqrt(c * l);
}
function ae(e, t, n = 20) {
	if (!Array.isArray(e) || !Array.isArray(t)) return null;
	let r = [], i = [], a = Math.max(e.length, t.length);
	for (let n = 0; n < a; n += 1) {
		let a = e[n], o = t[n];
		a != null && o != null && Number.isFinite(a) && Number.isFinite(o) && (r.push(a), i.push(o));
	}
	let o = Math.max(0, r.length - n), s = r.slice(o), c = i.slice(o);
	return s.length >= Math.max(6, Math.floor(n * .6)) ? ie(s, c) : null;
}
function oe(e, t, n) {
	if (!e?.ids) return null;
	let r = e.ids.indexOf(t), i = e.ids.indexOf(n);
	if (r < 0 || i < 0) return null;
	let a = e.corr?.[r]?.[i];
	return Number.isFinite(a) ? a : null;
}
function se(e, t) {
	if (e == null || !Number.isFinite(e)) return "—";
	if (t === "rate") {
		let t = e * 100;
		return `${t >= 0 ? "+" : "−"}${Math.abs(t).toFixed(1)}bp`;
	}
	let n = (Math.exp(e) - 1) * 100;
	return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;
}
function ce(e, t) {
	let n = t?.recent?.changes ?? {}, r = n[e.from], i = n[e.to], a = {
		status: "neutral",
		badge: "○ 数据不足",
		lastA: null,
		lastB: null,
		roll20: null,
		roll60: null,
		longCorr: null,
		n: 0
	};
	if (!Array.isArray(r) || !Array.isArray(i) || r.length < 20 || i.length < 20) return a;
	let o = ne(r), s = ne(i), c = re(r.slice(-60)), l = re(i.slice(-60)), u = ae(r, i, 20), d = ae(r, i, 60), f = oe(t.matrix, e.from, e.to), p = Math.max(r.length, i.length), m = o != null && s != null && c != null && l != null && Math.abs(o) > .5 * c && Math.abs(s) > .5 * l, h = o != null && s != null ? Math.sign(o * s) : 0, g = m && h !== 0 && h !== e.sign, _ = u != null && Math.sign(u) !== e.sign, v = d != null && Math.sign(d) !== e.sign, y = _ && (Math.abs(u) >= .45 || Math.abs(u) >= .35 && v);
	if (g || y) {
		let t = "⚡ 逻辑背离";
		return e.sign === -1 && o > 0 && s > 0 ? t = "⚡ 罕见同涨" : e.sign === -1 && o < 0 && s < 0 && (t = "⚡ 罕见同跌"), {
			status: "diverged",
			badge: t,
			lastA: o,
			lastB: s,
			roll20: u,
			roll60: d,
			longCorr: f,
			n: p,
			dayDiverged: g,
			trendDiverged: y,
			bigMove: m
		};
	}
	let b = m && h === e.sign || u != null && Math.sign(u) === e.sign && Math.abs(u) >= .25;
	return {
		status: b ? "aligned" : "neutral",
		badge: b ? "✓ 逻辑兑现" : "○ 常态波动",
		lastA: o,
		lastB: s,
		roll20: u,
		roll60: d,
		longCorr: f,
		n: p,
		dayDiverged: g,
		trendDiverged: y,
		bigMove: m
	};
}
function le(e, t = x) {
	return new Map(t.map((t) => [t.id, ce(t, e)]));
}
function ue(e, t) {
	return !e || !t ? null : x.find((n) => n.from === e && n.to === t) ?? x.find((n) => n.from === t && n.to === e) ?? null;
}
function de(e, t) {
	return e.map((e) => ({
		e,
		r: t.get(e.id)
	})).filter((e) => e.r?.status === "diverged").sort((e, t) => t.e.weight - e.e.weight || Math.abs(t.r.roll20 ?? 0) - Math.abs(e.r.roll20 ?? 0))[0] ?? null;
}
function fe(e, t, n = 2) {
	let r = [], i = (e, t, a, o) => {
		for (let s of C) {
			if (s.from !== e || o.includes(s.to)) continue;
			let c = t * s.sign;
			r.push({
				target: s.to,
				dir: c,
				hop: a + 1,
				trail: [...o, s.to],
				edges: s.id,
				chain: o.map((e) => ({ id: e }))
			}), a + 1 < n && i(s.to, c, a + 1, [...o, s.to]);
		}
	};
	i(e, t, 0, [e]);
	let a = /* @__PURE__ */ new Map();
	for (let e of r) a.has(e.target) || a.set(e.target, []), a.get(e.target).push(e);
	let o = /* @__PURE__ */ new Map();
	for (let [e, t] of a) {
		let n = new Set(t.map((e) => e.dir));
		o.set(e, {
			dirs: n,
			conflict: n.size > 1,
			hop: Math.min(...t.map((e) => e.hop)),
			paths: t
		});
	}
	return o;
}
// node_modules/tslib/tslib.es6.mjs
function O(e, t) {
	var n = {};
	for (var r in e) Object.prototype.hasOwnProperty.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r]);
	if (e != null && typeof Object.getOwnPropertySymbols == "function") for (var i = 0, r = Object.getOwnPropertySymbols(e); i < r.length; i++) t.indexOf(r[i]) < 0 && Object.prototype.propertyIsEnumerable.call(e, r[i]) && (n[r[i]] = e[r[i]]);
	return n;
}
function k(e, t, n, r) {
	var i = arguments.length, a = i < 3 ? t : r === null ? r = Object.getOwnPropertyDescriptor(t, n) : r, o;
	if (typeof Reflect == "object" && typeof Reflect.decorate == "function") a = Reflect.decorate(e, t, n, r);
	else for (var s = e.length - 1; s >= 0; s--) (o = e[s]) && (a = (i < 3 ? o(a) : i > 3 ? o(t, n, a) : o(t, n)) || a);
	return i > 3 && a && Object.defineProperty(t, n, a), a;
}
function pe(e, t, n, r) {
	function i(e) {
		return e instanceof n ? e : new n(function(t) {
			t(e);
		});
	}
	return new (n || (n = Promise))(function(n, a) {
		function o(e) {
			try {
				c(r.next(e));
			} catch (e) {
				a(e);
			}
		}
		function s(e) {
			try {
				c(r.throw(e));
			} catch (e) {
				a(e);
			}
		}
		function c(e) {
			e.done ? n(e.value) : i(e.value).then(o, s);
		}
		c((r = r.apply(e, t || [])).next());
	});
}
// node_modules/@antv/x6/es/common/polyfill/index.js
function me(e) {
	e.forEach((e) => {
		Object.hasOwn(e, "append") || Object.defineProperty(e, "append", {
			configurable: !0,
			enumerable: !0,
			writable: !0,
			value(...e) {
				let t = document.createDocumentFragment();
				e.forEach((e) => {
					let n = e instanceof Node;
					t.appendChild(n ? e : document.createTextNode(String(e)));
				}), this.appendChild(t);
			}
		});
	});
}
typeof window == "object" && window.NodeList && !NodeList.prototype.forEach && (NodeList.prototype.forEach = Array.prototype.forEach), typeof window < "u" && ((e) => {
	me(e);
})([
	Element.prototype,
	Document.prototype,
	DocumentFragment.prototype
]);
// node_modules/lodash-es/_freeGlobal.js
var he = typeof global == "object" && global && global.Object === Object && global, ge = typeof self == "object" && self && self.Object === Object && self, _e = he || ge || Function("return this")(), ve = _e.Symbol, ye = Object.prototype, be = ye.hasOwnProperty, xe = ye.toString, Se = ve ? ve.toStringTag : void 0;
function Ce(e) {
	var t = be.call(e, Se), n = e[Se];
	try {
		e[Se] = void 0;
		var r = !0;
	} catch {}
	var i = xe.call(e);
	return r && (t ? e[Se] = n : delete e[Se]), i;
}
// node_modules/lodash-es/_objectToString.js
var we = Object.prototype.toString;
function Te(e) {
	return we.call(e);
}
// node_modules/lodash-es/_baseGetTag.js
var Ee = "[object Null]", De = "[object Undefined]", Oe = ve ? ve.toStringTag : void 0;
function ke(e) {
	return e == null ? e === void 0 ? De : Ee : Oe && Oe in Object(e) ? Ce(e) : Te(e);
}
// node_modules/lodash-es/isObjectLike.js
function Ae(e) {
	return typeof e == "object" && !!e;
}
// node_modules/lodash-es/isSymbol.js
var je = "[object Symbol]";
function Me(e) {
	return typeof e == "symbol" || Ae(e) && ke(e) == je;
}
// node_modules/lodash-es/_arrayMap.js
function Ne(e, t) {
	for (var n = -1, r = e == null ? 0 : e.length, i = Array(r); ++n < r;) i[n] = t(e[n], n, e);
	return i;
}
// node_modules/lodash-es/isArray.js
var Pe = Array.isArray, Fe = 1 / 0, Ie = ve ? ve.prototype : void 0, Le = Ie ? Ie.toString : void 0;
function Re(e) {
	if (typeof e == "string") return e;
	if (Pe(e)) return Ne(e, Re) + "";
	if (Me(e)) return Le ? Le.call(e) : "";
	var t = e + "";
	return t == "0" && 1 / e == -Fe ? "-0" : t;
}
// node_modules/lodash-es/_trimmedEndIndex.js
var ze = /\s/;
function Be(e) {
	for (var t = e.length; t-- && ze.test(e.charAt(t)););
	return t;
}
// node_modules/lodash-es/_baseTrim.js
var Ve = /^\s+/;
function He(e) {
	return e && e.slice(0, Be(e) + 1).replace(Ve, "");
}
// node_modules/lodash-es/isObject.js
function A(e) {
	var t = typeof e;
	return e != null && (t == "object" || t == "function");
}
// node_modules/lodash-es/toNumber.js
var Ue = NaN, We = /^[-+]0x[0-9a-f]+$/i, Ge = /^0b[01]+$/i, Ke = /^0o[0-7]+$/i, qe = parseInt;
function Je(e) {
	if (typeof e == "number") return e;
	if (Me(e)) return Ue;
	if (A(e)) {
		var t = typeof e.valueOf == "function" ? e.valueOf() : e;
		e = A(t) ? t + "" : t;
	}
	if (typeof e != "string") return e === 0 ? e : +e;
	e = He(e);
	var n = Ge.test(e);
	return n || Ke.test(e) ? qe(e.slice(2), n ? 2 : 8) : We.test(e) ? Ue : +e;
}
// node_modules/lodash-es/identity.js
function Ye(e) {
	return e;
}
// node_modules/lodash-es/isFunction.js
var Xe = "[object AsyncFunction]", Ze = "[object Function]", Qe = "[object GeneratorFunction]", $e = "[object Proxy]";
function et(e) {
	if (!A(e)) return !1;
	var t = ke(e);
	return t == Ze || t == Qe || t == Xe || t == $e;
}
// node_modules/lodash-es/_coreJsData.js
var tt = _e["__core-js_shared__"], nt = function() {
	var e = /[^.]+$/.exec(tt && tt.keys && tt.keys.IE_PROTO || "");
	return e ? "Symbol(src)_1." + e : "";
}();
function rt(e) {
	return !!nt && nt in e;
}
// node_modules/lodash-es/_toSource.js
var it = Function.prototype.toString;
function at(e) {
	if (e != null) {
		try {
			return it.call(e);
		} catch {}
		try {
			return e + "";
		} catch {}
	}
	return "";
}
// node_modules/lodash-es/_baseIsNative.js
var ot = /[\\^$.*+?()[\]{}|]/g, st = /^\[object .+?Constructor\]$/, ct = Function.prototype, lt = Object.prototype, ut = ct.toString, dt = lt.hasOwnProperty, ft = RegExp("^" + ut.call(dt).replace(ot, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$");
function pt(e) {
	return !A(e) || rt(e) ? !1 : (et(e) ? ft : st).test(at(e));
}
// node_modules/lodash-es/_getValue.js
function mt(e, t) {
	return e?.[t];
}
// node_modules/lodash-es/_getNative.js
function ht(e, t) {
	var n = mt(e, t);
	return pt(n) ? n : void 0;
}
// node_modules/lodash-es/_WeakMap.js
var gt = ht(_e, "WeakMap"), _t = Object.create, vt = function() {
	function e() {}
	return function(t) {
		if (!A(t)) return {};
		if (_t) return _t(t);
		e.prototype = t;
		var n = new e();
		return e.prototype = void 0, n;
	};
}();
// node_modules/lodash-es/_apply.js
function yt(e, t, n) {
	switch (n.length) {
		case 0: return e.call(t);
		case 1: return e.call(t, n[0]);
		case 2: return e.call(t, n[0], n[1]);
		case 3: return e.call(t, n[0], n[1], n[2]);
	}
	return e.apply(t, n);
}
// node_modules/lodash-es/noop.js
function bt() {}
// node_modules/lodash-es/_copyArray.js
function xt(e, t) {
	var n = -1, r = e.length;
	for (t || (t = Array(r)); ++n < r;) t[n] = e[n];
	return t;
}
// node_modules/lodash-es/_shortOut.js
var St = 800, Ct = 16, wt = Date.now;
function Tt(e) {
	var t = 0, n = 0;
	return function() {
		var r = wt(), i = Ct - (r - n);
		if (n = r, i > 0) {
			if (++t >= St) return arguments[0];
		} else t = 0;
		return e.apply(void 0, arguments);
	};
}
// node_modules/lodash-es/constant.js
function Et(e) {
	return function() {
		return e;
	};
}
// node_modules/lodash-es/_defineProperty.js
var Dt = function() {
	try {
		var e = ht(Object, "defineProperty");
		return e({}, "", {}), e;
	} catch {}
}(), Ot = Tt(Dt ? function(e, t) {
	return Dt(e, "toString", {
		configurable: !0,
		enumerable: !1,
		value: Et(t),
		writable: !0
	});
} : Ye);
// node_modules/lodash-es/_arrayEach.js
function kt(e, t) {
	for (var n = -1, r = e == null ? 0 : e.length; ++n < r && t(e[n], n, e) !== !1;);
	return e;
}
// node_modules/lodash-es/_baseFindIndex.js
function At(e, t, n, r) {
	for (var i = e.length, a = n + (r ? 1 : -1); r ? a-- : ++a < i;) if (t(e[a], a, e)) return a;
	return -1;
}
// node_modules/lodash-es/_baseIsNaN.js
function jt(e) {
	return e !== e;
}
// node_modules/lodash-es/_strictIndexOf.js
function Mt(e, t, n) {
	for (var r = n - 1, i = e.length; ++r < i;) if (e[r] === t) return r;
	return -1;
}
// node_modules/lodash-es/_baseIndexOf.js
function Nt(e, t, n) {
	return t === t ? Mt(e, t, n) : At(e, jt, n);
}
// node_modules/lodash-es/_arrayIncludes.js
function Pt(e, t) {
	return !!(e != null && e.length) && Nt(e, t, 0) > -1;
}
// node_modules/lodash-es/_isIndex.js
var Ft = 9007199254740991, It = /^(?:0|[1-9]\d*)$/;
function Lt(e, t) {
	var n = typeof e;
	return t = t ?? Ft, !!t && (n == "number" || n != "symbol" && It.test(e)) && e > -1 && e % 1 == 0 && e < t;
}
// node_modules/lodash-es/_baseAssignValue.js
function Rt(e, t, n) {
	t == "__proto__" && Dt ? Dt(e, t, {
		configurable: !0,
		enumerable: !0,
		value: n,
		writable: !0
	}) : e[t] = n;
}
// node_modules/lodash-es/eq.js
function zt(e, t) {
	return e === t || e !== e && t !== t;
}
// node_modules/lodash-es/_assignValue.js
var Bt = Object.prototype.hasOwnProperty;
function Vt(e, t, n) {
	var r = e[t];
	(!(Bt.call(e, t) && zt(r, n)) || n === void 0 && !(t in e)) && Rt(e, t, n);
}
// node_modules/lodash-es/_copyObject.js
function Ht(e, t, n, r) {
	var i = !n;
	n || (n = {});
	for (var a = -1, o = t.length; ++a < o;) {
		var s = t[a], c = r ? r(n[s], e[s], s, n, e) : void 0;
		c === void 0 && (c = e[s]), i ? Rt(n, s, c) : Vt(n, s, c);
	}
	return n;
}
// node_modules/lodash-es/_overRest.js
var Ut = Math.max;
function Wt(e, t, n) {
	return t = Ut(t === void 0 ? e.length - 1 : t, 0), function() {
		for (var r = arguments, i = -1, a = Ut(r.length - t, 0), o = Array(a); ++i < a;) o[i] = r[t + i];
		i = -1;
		for (var s = Array(t + 1); ++i < t;) s[i] = r[i];
		return s[t] = n(o), yt(e, this, s);
	};
}
// node_modules/lodash-es/_baseRest.js
function Gt(e, t) {
	return Ot(Wt(e, t, Ye), e + "");
}
// node_modules/lodash-es/isLength.js
var Kt = 9007199254740991;
function qt(e) {
	return typeof e == "number" && e > -1 && e % 1 == 0 && e <= Kt;
}
// node_modules/lodash-es/isArrayLike.js
function Jt(e) {
	return e != null && qt(e.length) && !et(e);
}
// node_modules/lodash-es/_isIterateeCall.js
function Yt(e, t, n) {
	if (!A(n)) return !1;
	var r = typeof t;
	return (r == "number" ? Jt(n) && Lt(t, n.length) : r == "string" && t in n) ? zt(n[t], e) : !1;
}
// node_modules/lodash-es/_createAssigner.js
function Xt(e) {
	return Gt(function(t, n) {
		var r = -1, i = n.length, a = i > 1 ? n[i - 1] : void 0, o = i > 2 ? n[2] : void 0;
		for (a = e.length > 3 && typeof a == "function" ? (i--, a) : void 0, o && Yt(n[0], n[1], o) && (a = i < 3 ? void 0 : a, i = 1), t = Object(t); ++r < i;) {
			var s = n[r];
			s && e(t, s, r, a);
		}
		return t;
	});
}
// node_modules/lodash-es/_isPrototype.js
var Zt = Object.prototype;
function Qt(e) {
	var t = e && e.constructor;
	return e === (typeof t == "function" && t.prototype || Zt);
}
// node_modules/lodash-es/_baseTimes.js
function $t(e, t) {
	for (var n = -1, r = Array(e); ++n < e;) r[n] = t(n);
	return r;
}
// node_modules/lodash-es/_baseIsArguments.js
var en = "[object Arguments]";
function tn(e) {
	return Ae(e) && ke(e) == en;
}
// node_modules/lodash-es/isArguments.js
var nn = Object.prototype, rn = nn.hasOwnProperty, an = nn.propertyIsEnumerable, on = tn(function() {
	return arguments;
}()) ? tn : function(e) {
	return Ae(e) && rn.call(e, "callee") && !an.call(e, "callee");
};
// node_modules/lodash-es/stubFalse.js
function sn() {
	return !1;
}
// node_modules/lodash-es/isBuffer.js
var cn = typeof exports == "object" && exports && !exports.nodeType && exports, ln = cn && typeof module == "object" && module && !module.nodeType && module, un = ln && ln.exports === cn ? _e.Buffer : void 0, dn = (un ? un.isBuffer : void 0) || sn, fn = "[object Arguments]", pn = "[object Array]", mn = "[object Boolean]", hn = "[object Date]", gn = "[object Error]", _n = "[object Function]", vn = "[object Map]", yn = "[object Number]", bn = "[object Object]", xn = "[object RegExp]", Sn = "[object Set]", Cn = "[object String]", wn = "[object WeakMap]", Tn = "[object ArrayBuffer]", En = "[object DataView]", Dn = "[object Float32Array]", On = "[object Float64Array]", kn = "[object Int8Array]", An = "[object Int16Array]", jn = "[object Int32Array]", Mn = "[object Uint8Array]", Nn = "[object Uint8ClampedArray]", Pn = "[object Uint16Array]", Fn = "[object Uint32Array]", j = {};
j[Dn] = j[On] = j[kn] = j[An] = j[jn] = j[Mn] = j[Nn] = j[Pn] = j[Fn] = !0, j[fn] = j[pn] = j[Tn] = j[mn] = j[En] = j[hn] = j[gn] = j[_n] = j[vn] = j[yn] = j[bn] = j[xn] = j[Sn] = j[Cn] = j[wn] = !1;
function In(e) {
	return Ae(e) && qt(e.length) && !!j[ke(e)];
}
// node_modules/lodash-es/_baseUnary.js
function Ln(e) {
	return function(t) {
		return e(t);
	};
}
// node_modules/lodash-es/_nodeUtil.js
var Rn = typeof exports == "object" && exports && !exports.nodeType && exports, zn = Rn && typeof module == "object" && module && !module.nodeType && module, Bn = zn && zn.exports === Rn && he.process, Vn = function() {
	try {
		return zn && zn.require && zn.require("util").types || Bn && Bn.binding && Bn.binding("util");
	} catch {}
}(), Hn = Vn && Vn.isTypedArray, Un = Hn ? Ln(Hn) : In, Wn = Object.prototype.hasOwnProperty;
function Gn(e, t) {
	var n = Pe(e), r = !n && on(e), i = !n && !r && dn(e), a = !n && !r && !i && Un(e), o = n || r || i || a, s = o ? $t(e.length, String) : [], c = s.length;
	for (var l in e) (t || Wn.call(e, l)) && !(o && (l == "length" || i && (l == "offset" || l == "parent") || a && (l == "buffer" || l == "byteLength" || l == "byteOffset") || Lt(l, c))) && s.push(l);
	return s;
}
// node_modules/lodash-es/_overArg.js
function Kn(e, t) {
	return function(n) {
		return e(t(n));
	};
}
// node_modules/lodash-es/_nativeKeys.js
var qn = Kn(Object.keys, Object), Jn = Object.prototype.hasOwnProperty;
function Yn(e) {
	if (!Qt(e)) return qn(e);
	var t = [];
	for (var n in Object(e)) Jn.call(e, n) && n != "constructor" && t.push(n);
	return t;
}
// node_modules/lodash-es/keys.js
function Xn(e) {
	return Jt(e) ? Gn(e) : Yn(e);
}
// node_modules/lodash-es/_nativeKeysIn.js
function Zn(e) {
	var t = [];
	if (e != null) for (var n in Object(e)) t.push(n);
	return t;
}
// node_modules/lodash-es/_baseKeysIn.js
var Qn = Object.prototype.hasOwnProperty;
function $n(e) {
	if (!A(e)) return Zn(e);
	var t = Qt(e), n = [];
	for (var r in e) (r != "constructor" || !t && Qn.call(e, r)) && n.push(r);
	return n;
}
// node_modules/lodash-es/keysIn.js
function er(e) {
	return Jt(e) ? Gn(e, !0) : $n(e);
}
// node_modules/lodash-es/_isKey.js
var tr = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, nr = /^\w*$/;
function rr(e, t) {
	if (Pe(e)) return !1;
	var n = typeof e;
	return n == "number" || n == "symbol" || n == "boolean" || e == null || Me(e) ? !0 : nr.test(e) || !tr.test(e) || t != null && e in Object(t);
}
// node_modules/lodash-es/_nativeCreate.js
var ir = ht(Object, "create");
// node_modules/lodash-es/_hashClear.js
function ar() {
	this.__data__ = ir ? ir(null) : {}, this.size = 0;
}
// node_modules/lodash-es/_hashDelete.js
function or(e) {
	var t = this.has(e) && delete this.__data__[e];
	return this.size -= +!!t, t;
}
// node_modules/lodash-es/_hashGet.js
var sr = "__lodash_hash_undefined__", cr = Object.prototype.hasOwnProperty;
function lr(e) {
	var t = this.__data__;
	if (ir) {
		var n = t[e];
		return n === sr ? void 0 : n;
	}
	return cr.call(t, e) ? t[e] : void 0;
}
// node_modules/lodash-es/_hashHas.js
var ur = Object.prototype.hasOwnProperty;
function dr(e) {
	var t = this.__data__;
	return ir ? t[e] !== void 0 : ur.call(t, e);
}
// node_modules/lodash-es/_hashSet.js
var fr = "__lodash_hash_undefined__";
function pr(e, t) {
	var n = this.__data__;
	return this.size += +!this.has(e), n[e] = ir && t === void 0 ? fr : t, this;
}
// node_modules/lodash-es/_Hash.js
function mr(e) {
	var t = -1, n = e == null ? 0 : e.length;
	for (this.clear(); ++t < n;) {
		var r = e[t];
		this.set(r[0], r[1]);
	}
}
mr.prototype.clear = ar, mr.prototype.delete = or, mr.prototype.get = lr, mr.prototype.has = dr, mr.prototype.set = pr;
// node_modules/lodash-es/_listCacheClear.js
function hr() {
	this.__data__ = [], this.size = 0;
}
// node_modules/lodash-es/_assocIndexOf.js
function gr(e, t) {
	for (var n = e.length; n--;) if (zt(e[n][0], t)) return n;
	return -1;
}
// node_modules/lodash-es/_listCacheDelete.js
var _r = Array.prototype.splice;
function vr(e) {
	var t = this.__data__, n = gr(t, e);
	return n < 0 ? !1 : (n == t.length - 1 ? t.pop() : _r.call(t, n, 1), --this.size, !0);
}
// node_modules/lodash-es/_listCacheGet.js
function yr(e) {
	var t = this.__data__, n = gr(t, e);
	return n < 0 ? void 0 : t[n][1];
}
// node_modules/lodash-es/_listCacheHas.js
function br(e) {
	return gr(this.__data__, e) > -1;
}
// node_modules/lodash-es/_listCacheSet.js
function xr(e, t) {
	var n = this.__data__, r = gr(n, e);
	return r < 0 ? (++this.size, n.push([e, t])) : n[r][1] = t, this;
}
// node_modules/lodash-es/_ListCache.js
function Sr(e) {
	var t = -1, n = e == null ? 0 : e.length;
	for (this.clear(); ++t < n;) {
		var r = e[t];
		this.set(r[0], r[1]);
	}
}
Sr.prototype.clear = hr, Sr.prototype.delete = vr, Sr.prototype.get = yr, Sr.prototype.has = br, Sr.prototype.set = xr;
// node_modules/lodash-es/_Map.js
var Cr = ht(_e, "Map");
// node_modules/lodash-es/_mapCacheClear.js
function wr() {
	this.size = 0, this.__data__ = {
		hash: new mr(),
		map: new (Cr || Sr)(),
		string: new mr()
	};
}
// node_modules/lodash-es/_isKeyable.js
function Tr(e) {
	var t = typeof e;
	return t == "string" || t == "number" || t == "symbol" || t == "boolean" ? e !== "__proto__" : e === null;
}
// node_modules/lodash-es/_getMapData.js
function Er(e, t) {
	var n = e.__data__;
	return Tr(t) ? n[typeof t == "string" ? "string" : "hash"] : n.map;
}
// node_modules/lodash-es/_mapCacheDelete.js
function Dr(e) {
	var t = Er(this, e).delete(e);
	return this.size -= +!!t, t;
}
// node_modules/lodash-es/_mapCacheGet.js
function Or(e) {
	return Er(this, e).get(e);
}
// node_modules/lodash-es/_mapCacheHas.js
function kr(e) {
	return Er(this, e).has(e);
}
// node_modules/lodash-es/_mapCacheSet.js
function Ar(e, t) {
	var n = Er(this, e), r = n.size;
	return n.set(e, t), this.size += n.size == r ? 0 : 1, this;
}
// node_modules/lodash-es/_MapCache.js
function jr(e) {
	var t = -1, n = e == null ? 0 : e.length;
	for (this.clear(); ++t < n;) {
		var r = e[t];
		this.set(r[0], r[1]);
	}
}
jr.prototype.clear = wr, jr.prototype.delete = Dr, jr.prototype.get = Or, jr.prototype.has = kr, jr.prototype.set = Ar;
// node_modules/lodash-es/memoize.js
var Mr = "Expected a function";
function Nr(e, t) {
	if (typeof e != "function" || t != null && typeof t != "function") throw TypeError(Mr);
	var n = function() {
		var r = arguments, i = t ? t.apply(this, r) : r[0], a = n.cache;
		if (a.has(i)) return a.get(i);
		var o = e.apply(this, r);
		return n.cache = a.set(i, o) || a, o;
	};
	return n.cache = new (Nr.Cache || jr)(), n;
}
Nr.Cache = jr;
// node_modules/lodash-es/_memoizeCapped.js
var Pr = 500;
function Fr(e) {
	var t = Nr(e, function(e) {
		return n.size === Pr && n.clear(), e;
	}), n = t.cache;
	return t;
}
// node_modules/lodash-es/_stringToPath.js
var Ir = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g, Lr = /\\(\\)?/g, Rr = Fr(function(e) {
	var t = [];
	return e.charCodeAt(0) === 46 && t.push(""), e.replace(Ir, function(e, n, r, i) {
		t.push(r ? i.replace(Lr, "$1") : n || e);
	}), t;
});
// node_modules/lodash-es/toString.js
function zr(e) {
	return e == null ? "" : Re(e);
}
// node_modules/lodash-es/_castPath.js
function Br(e, t) {
	return Pe(e) ? e : rr(e, t) ? [e] : Rr(zr(e));
}
// node_modules/lodash-es/_toKey.js
var Vr = 1 / 0;
function Hr(e) {
	if (typeof e == "string" || Me(e)) return e;
	var t = e + "";
	return t == "0" && 1 / e == -Vr ? "-0" : t;
}
// node_modules/lodash-es/_baseGet.js
function Ur(e, t) {
	t = Br(t, e);
	for (var n = 0, r = t.length; e != null && n < r;) e = e[Hr(t[n++])];
	return n && n == r ? e : void 0;
}
// node_modules/lodash-es/get.js
function Wr(e, t, n) {
	var r = e == null ? void 0 : Ur(e, t);
	return r === void 0 ? n : r;
}
// node_modules/lodash-es/_arrayPush.js
function Gr(e, t) {
	for (var n = -1, r = t.length, i = e.length; ++n < r;) e[i + n] = t[n];
	return e;
}
// node_modules/lodash-es/_isFlattenable.js
var Kr = ve ? ve.isConcatSpreadable : void 0;
function qr(e) {
	return Pe(e) || on(e) || !!(Kr && e && e[Kr]);
}
// node_modules/lodash-es/_baseFlatten.js
function Jr(e, t, n, r, i) {
	var a = -1, o = e.length;
	for (n || (n = qr), i || (i = []); ++a < o;) {
		var s = e[a];
		t > 0 && n(s) ? t > 1 ? Jr(s, t - 1, n, r, i) : Gr(i, s) : r || (i[i.length] = s);
	}
	return i;
}
// node_modules/lodash-es/flatten.js
function Yr(e) {
	return e != null && e.length ? Jr(e, 1) : [];
}
// node_modules/lodash-es/_flatRest.js
function Xr(e) {
	return Ot(Wt(e, void 0, Yr), e + "");
}
// node_modules/lodash-es/_getPrototype.js
var Zr = Kn(Object.getPrototypeOf, Object), Qr = "[object Object]", $r = Function.prototype, ei = Object.prototype, ti = $r.toString, ni = ei.hasOwnProperty, ri = ti.call(Object);
function ii(e) {
	if (!Ae(e) || ke(e) != Qr) return !1;
	var t = Zr(e);
	if (t === null) return !0;
	var n = ni.call(t, "constructor") && t.constructor;
	return typeof n == "function" && n instanceof n && ti.call(n) == ri;
}
// node_modules/lodash-es/_baseSlice.js
function ai(e, t, n) {
	var r = -1, i = e.length;
	t < 0 && (t = -t > i ? 0 : i + t), n = n > i ? i : n, n < 0 && (n += i), i = t > n ? 0 : n - t >>> 0, t >>>= 0;
	for (var a = Array(i); ++r < i;) a[r] = e[r + t];
	return a;
}
// node_modules/lodash-es/_castSlice.js
function oi(e, t, n) {
	var r = e.length;
	return n = n === void 0 ? r : n, !t && n >= r ? e : ai(e, t, n);
}
// node_modules/lodash-es/_hasUnicode.js
var si = RegExp("[\\u200d\\ud800-\\udfff\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff\\ufe0e\\ufe0f]");
function ci(e) {
	return si.test(e);
}
// node_modules/lodash-es/_asciiToArray.js
function li(e) {
	return e.split("");
}
// node_modules/lodash-es/_unicodeToArray.js
var ui = "\\ud800-\\udfff", di = "\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff", fi = "\\ufe0e\\ufe0f", pi = "[" + ui + "]", mi = "[" + di + "]", hi = "\\ud83c[\\udffb-\\udfff]", gi = "(?:" + mi + "|" + hi + ")", _i = "[^" + ui + "]", vi = "(?:\\ud83c[\\udde6-\\uddff]){2}", yi = "[\\ud800-\\udbff][\\udc00-\\udfff]", bi = "\\u200d", xi = gi + "?", Si = "[" + fi + "]?", Ci = "(?:" + bi + "(?:" + [
	_i,
	vi,
	yi
].join("|") + ")" + Si + xi + ")*", wi = Si + xi + Ci, Ti = "(?:" + [
	_i + mi + "?",
	mi,
	vi,
	yi,
	pi
].join("|") + ")", Ei = RegExp(hi + "(?=" + hi + ")|" + Ti + wi, "g");
function Di(e) {
	return e.match(Ei) || [];
}
// node_modules/lodash-es/_stringToArray.js
function Oi(e) {
	return ci(e) ? Di(e) : li(e);
}
// node_modules/lodash-es/_createCaseFirst.js
function ki(e) {
	return function(t) {
		t = zr(t);
		var n = ci(t) ? Oi(t) : void 0, r = n ? n[0] : t.charAt(0), i = n ? oi(n, 1).join("") : t.slice(1);
		return r[e]() + i;
	};
}
// node_modules/lodash-es/upperFirst.js
var Ai = ki("toUpperCase");
// node_modules/lodash-es/capitalize.js
function ji(e) {
	return Ai(zr(e).toLowerCase());
}
// node_modules/lodash-es/_arrayReduce.js
function Mi(e, t, n, r) {
	var i = -1, a = e == null ? 0 : e.length;
	for (r && a && (n = e[++i]); ++i < a;) n = t(n, e[i], i, e);
	return n;
}
// node_modules/lodash-es/_basePropertyOf.js
function Ni(e) {
	return function(t) {
		return e?.[t];
	};
}
// node_modules/lodash-es/_deburrLetter.js
var Pi = Ni({
	À: "A",
	Á: "A",
	Â: "A",
	Ã: "A",
	Ä: "A",
	Å: "A",
	à: "a",
	á: "a",
	â: "a",
	ã: "a",
	ä: "a",
	å: "a",
	Ç: "C",
	ç: "c",
	Ð: "D",
	ð: "d",
	È: "E",
	É: "E",
	Ê: "E",
	Ë: "E",
	è: "e",
	é: "e",
	ê: "e",
	ë: "e",
	Ì: "I",
	Í: "I",
	Î: "I",
	Ï: "I",
	ì: "i",
	í: "i",
	î: "i",
	ï: "i",
	Ñ: "N",
	ñ: "n",
	Ò: "O",
	Ó: "O",
	Ô: "O",
	Õ: "O",
	Ö: "O",
	Ø: "O",
	ò: "o",
	ó: "o",
	ô: "o",
	õ: "o",
	ö: "o",
	ø: "o",
	Ù: "U",
	Ú: "U",
	Û: "U",
	Ü: "U",
	ù: "u",
	ú: "u",
	û: "u",
	ü: "u",
	Ý: "Y",
	ý: "y",
	ÿ: "y",
	Æ: "Ae",
	æ: "ae",
	Þ: "Th",
	þ: "th",
	ß: "ss",
	Ā: "A",
	Ă: "A",
	Ą: "A",
	ā: "a",
	ă: "a",
	ą: "a",
	Ć: "C",
	Ĉ: "C",
	Ċ: "C",
	Č: "C",
	ć: "c",
	ĉ: "c",
	ċ: "c",
	č: "c",
	Ď: "D",
	Đ: "D",
	ď: "d",
	đ: "d",
	Ē: "E",
	Ĕ: "E",
	Ė: "E",
	Ę: "E",
	Ě: "E",
	ē: "e",
	ĕ: "e",
	ė: "e",
	ę: "e",
	ě: "e",
	Ĝ: "G",
	Ğ: "G",
	Ġ: "G",
	Ģ: "G",
	ĝ: "g",
	ğ: "g",
	ġ: "g",
	ģ: "g",
	Ĥ: "H",
	Ħ: "H",
	ĥ: "h",
	ħ: "h",
	Ĩ: "I",
	Ī: "I",
	Ĭ: "I",
	Į: "I",
	İ: "I",
	ĩ: "i",
	ī: "i",
	ĭ: "i",
	į: "i",
	ı: "i",
	Ĵ: "J",
	ĵ: "j",
	Ķ: "K",
	ķ: "k",
	ĸ: "k",
	Ĺ: "L",
	Ļ: "L",
	Ľ: "L",
	Ŀ: "L",
	Ł: "L",
	ĺ: "l",
	ļ: "l",
	ľ: "l",
	ŀ: "l",
	ł: "l",
	Ń: "N",
	Ņ: "N",
	Ň: "N",
	Ŋ: "N",
	ń: "n",
	ņ: "n",
	ň: "n",
	ŋ: "n",
	Ō: "O",
	Ŏ: "O",
	Ő: "O",
	ō: "o",
	ŏ: "o",
	ő: "o",
	Ŕ: "R",
	Ŗ: "R",
	Ř: "R",
	ŕ: "r",
	ŗ: "r",
	ř: "r",
	Ś: "S",
	Ŝ: "S",
	Ş: "S",
	Š: "S",
	ś: "s",
	ŝ: "s",
	ş: "s",
	š: "s",
	Ţ: "T",
	Ť: "T",
	Ŧ: "T",
	ţ: "t",
	ť: "t",
	ŧ: "t",
	Ũ: "U",
	Ū: "U",
	Ŭ: "U",
	Ů: "U",
	Ű: "U",
	Ų: "U",
	ũ: "u",
	ū: "u",
	ŭ: "u",
	ů: "u",
	ű: "u",
	ų: "u",
	Ŵ: "W",
	ŵ: "w",
	Ŷ: "Y",
	ŷ: "y",
	Ÿ: "Y",
	Ź: "Z",
	Ż: "Z",
	Ž: "Z",
	ź: "z",
	ż: "z",
	ž: "z",
	Ĳ: "IJ",
	ĳ: "ij",
	Œ: "Oe",
	œ: "oe",
	ŉ: "'n",
	ſ: "s"
}), Fi = /[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g, Ii = RegExp("[\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff]", "g");
function Li(e) {
	return e = zr(e), e && e.replace(Fi, Pi).replace(Ii, "");
}
// node_modules/lodash-es/_asciiWords.js
var Ri = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;
function zi(e) {
	return e.match(Ri) || [];
}
// node_modules/lodash-es/_hasUnicodeWord.js
var Bi = /[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;
function Vi(e) {
	return Bi.test(e);
}
// node_modules/lodash-es/_unicodeWords.js
var Hi = "\\ud800-\\udfff", Ui = "\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff", Wi = "\\u2700-\\u27bf", Gi = "a-z\\xdf-\\xf6\\xf8-\\xff", Ki = "\\xac\\xb1\\xd7\\xf7", qi = "\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf", Ji = "\\u2000-\\u206f", Yi = " \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000", Xi = "A-Z\\xc0-\\xd6\\xd8-\\xde", Zi = "\\ufe0e\\ufe0f", Qi = Ki + qi + Ji + Yi, $i = "['’]", ea = "[" + Qi + "]", ta = "[" + Ui + "]", na = "\\d+", ra = "[" + Wi + "]", ia = "[" + Gi + "]", aa = "[^" + Hi + Qi + na + Wi + Gi + Xi + "]", oa = "(?:" + ta + "|\\ud83c[\\udffb-\\udfff])", sa = "[^" + Hi + "]", ca = "(?:\\ud83c[\\udde6-\\uddff]){2}", la = "[\\ud800-\\udbff][\\udc00-\\udfff]", ua = "[" + Xi + "]", da = "\\u200d", fa = "(?:" + ia + "|" + aa + ")", pa = "(?:" + ua + "|" + aa + ")", ma = "(?:" + $i + "(?:d|ll|m|re|s|t|ve))?", ha = "(?:" + $i + "(?:D|LL|M|RE|S|T|VE))?", ga = oa + "?", _a = "[" + Zi + "]?", va = "(?:" + da + "(?:" + [
	sa,
	ca,
	la
].join("|") + ")" + _a + ga + ")*", ya = "\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])", ba = "\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])", xa = _a + ga + va, Sa = "(?:" + [
	ra,
	ca,
	la
].join("|") + ")" + xa, Ca = RegExp([
	ua + "?" + ia + "+" + ma + "(?=" + [
		ea,
		ua,
		"$"
	].join("|") + ")",
	pa + "+" + ha + "(?=" + [
		ea,
		ua + fa,
		"$"
	].join("|") + ")",
	ua + "?" + fa + "+" + ma,
	ua + "+" + ha,
	ba,
	ya,
	na,
	Sa
].join("|"), "g");
function wa(e) {
	return e.match(Ca) || [];
}
// node_modules/lodash-es/words.js
function Ta(e, t, n) {
	return e = zr(e), t = n ? void 0 : t, t === void 0 ? Vi(e) ? wa(e) : zi(e) : e.match(t) || [];
}
// node_modules/lodash-es/_createCompounder.js
var Ea = RegExp("['’]", "g");
function Da(e) {
	return function(t) {
		return Mi(Ta(Li(t).replace(Ea, "")), e, "");
	};
}
// node_modules/lodash-es/camelCase.js
var Oa = Da(function(e, t, n) {
	return t = t.toLowerCase(), e + (n ? ji(t) : t);
});
// node_modules/lodash-es/castArray.js
function ka() {
	if (!arguments.length) return [];
	var e = arguments[0];
	return Pe(e) ? e : [e];
}
// node_modules/lodash-es/_baseClamp.js
function Aa(e, t, n) {
	return e === e && (n !== void 0 && (e = e <= n ? e : n), t !== void 0 && (e = e >= t ? e : t)), e;
}
// node_modules/lodash-es/clamp.js
function ja(e, t, n) {
	return n === void 0 && (n = t, t = void 0), n !== void 0 && (n = Je(n), n = n === n ? n : 0), t !== void 0 && (t = Je(t), t = t === t ? t : 0), Aa(Je(e), t, n);
}
// node_modules/lodash-es/_stackClear.js
function Ma() {
	this.__data__ = new Sr(), this.size = 0;
}
// node_modules/lodash-es/_stackDelete.js
function Na(e) {
	var t = this.__data__, n = t.delete(e);
	return this.size = t.size, n;
}
// node_modules/lodash-es/_stackGet.js
function Pa(e) {
	return this.__data__.get(e);
}
// node_modules/lodash-es/_stackHas.js
function Fa(e) {
	return this.__data__.has(e);
}
// node_modules/lodash-es/_stackSet.js
var Ia = 200;
function La(e, t) {
	var n = this.__data__;
	if (n instanceof Sr) {
		var r = n.__data__;
		if (!Cr || r.length < Ia - 1) return r.push([e, t]), this.size = ++n.size, this;
		n = this.__data__ = new jr(r);
	}
	return n.set(e, t), this.size = n.size, this;
}
// node_modules/lodash-es/_Stack.js
function Ra(e) {
	var t = this.__data__ = new Sr(e);
	this.size = t.size;
}
Ra.prototype.clear = Ma, Ra.prototype.delete = Na, Ra.prototype.get = Pa, Ra.prototype.has = Fa, Ra.prototype.set = La;
// node_modules/lodash-es/_baseAssign.js
function za(e, t) {
	return e && Ht(t, Xn(t), e);
}
// node_modules/lodash-es/_baseAssignIn.js
function Ba(e, t) {
	return e && Ht(t, er(t), e);
}
// node_modules/lodash-es/_cloneBuffer.js
var Va = typeof exports == "object" && exports && !exports.nodeType && exports, Ha = Va && typeof module == "object" && module && !module.nodeType && module, Ua = Ha && Ha.exports === Va ? _e.Buffer : void 0, Wa = Ua ? Ua.allocUnsafe : void 0;
function Ga(e, t) {
	if (t) return e.slice();
	var n = e.length, r = Wa ? Wa(n) : new e.constructor(n);
	return e.copy(r), r;
}
// node_modules/lodash-es/_arrayFilter.js
function Ka(e, t) {
	for (var n = -1, r = e == null ? 0 : e.length, i = 0, a = []; ++n < r;) {
		var o = e[n];
		t(o, n, e) && (a[i++] = o);
	}
	return a;
}
// node_modules/lodash-es/stubArray.js
function qa() {
	return [];
}
// node_modules/lodash-es/_getSymbols.js
var Ja = Object.prototype.propertyIsEnumerable, Ya = Object.getOwnPropertySymbols, Xa = Ya ? function(e) {
	return e == null ? [] : (e = Object(e), Ka(Ya(e), function(t) {
		return Ja.call(e, t);
	}));
} : qa;
// node_modules/lodash-es/_copySymbols.js
function Za(e, t) {
	return Ht(e, Xa(e), t);
}
// node_modules/lodash-es/_getSymbolsIn.js
var Qa = Object.getOwnPropertySymbols ? function(e) {
	for (var t = []; e;) Gr(t, Xa(e)), e = Zr(e);
	return t;
} : qa;
// node_modules/lodash-es/_copySymbolsIn.js
function $a(e, t) {
	return Ht(e, Qa(e), t);
}
// node_modules/lodash-es/_baseGetAllKeys.js
function eo(e, t, n) {
	var r = t(e);
	return Pe(e) ? r : Gr(r, n(e));
}
// node_modules/lodash-es/_getAllKeys.js
function to(e) {
	return eo(e, Xn, Xa);
}
// node_modules/lodash-es/_getAllKeysIn.js
function no(e) {
	return eo(e, er, Qa);
}
// node_modules/lodash-es/_DataView.js
var ro = ht(_e, "DataView"), io = ht(_e, "Promise"), ao = ht(_e, "Set"), oo = "[object Map]", so = "[object Object]", co = "[object Promise]", lo = "[object Set]", uo = "[object WeakMap]", fo = "[object DataView]", po = at(ro), mo = at(Cr), ho = at(io), go = at(ao), _o = at(gt), vo = ke;
(ro && vo(new ro(/* @__PURE__ */ new ArrayBuffer(1))) != fo || Cr && vo(new Cr()) != oo || io && vo(io.resolve()) != co || ao && vo(new ao()) != lo || gt && vo(new gt()) != uo) && (vo = function(e) {
	var t = ke(e), n = t == so ? e.constructor : void 0, r = n ? at(n) : "";
	if (r) switch (r) {
		case po: return fo;
		case mo: return oo;
		case ho: return co;
		case go: return lo;
		case _o: return uo;
	}
	return t;
});
var yo = vo, bo = Object.prototype.hasOwnProperty;
function xo(e) {
	var t = e.length, n = new e.constructor(t);
	return t && typeof e[0] == "string" && bo.call(e, "index") && (n.index = e.index, n.input = e.input), n;
}
// node_modules/lodash-es/_Uint8Array.js
var So = _e.Uint8Array;
// node_modules/lodash-es/_cloneArrayBuffer.js
function Co(e) {
	var t = new e.constructor(e.byteLength);
	return new So(t).set(new So(e)), t;
}
// node_modules/lodash-es/_cloneDataView.js
function wo(e, t) {
	var n = t ? Co(e.buffer) : e.buffer;
	return new e.constructor(n, e.byteOffset, e.byteLength);
}
// node_modules/lodash-es/_cloneRegExp.js
var To = /\w*$/;
function Eo(e) {
	var t = new e.constructor(e.source, To.exec(e));
	return t.lastIndex = e.lastIndex, t;
}
// node_modules/lodash-es/_cloneSymbol.js
var Do = ve ? ve.prototype : void 0, Oo = Do ? Do.valueOf : void 0;
function ko(e) {
	return Oo ? Object(Oo.call(e)) : {};
}
// node_modules/lodash-es/_cloneTypedArray.js
function Ao(e, t) {
	var n = t ? Co(e.buffer) : e.buffer;
	return new e.constructor(n, e.byteOffset, e.length);
}
// node_modules/lodash-es/_initCloneByTag.js
var jo = "[object Boolean]", Mo = "[object Date]", No = "[object Map]", Po = "[object Number]", Fo = "[object RegExp]", Io = "[object Set]", Lo = "[object String]", Ro = "[object Symbol]", zo = "[object ArrayBuffer]", Bo = "[object DataView]", Vo = "[object Float32Array]", Ho = "[object Float64Array]", Uo = "[object Int8Array]", Wo = "[object Int16Array]", Go = "[object Int32Array]", Ko = "[object Uint8Array]", qo = "[object Uint8ClampedArray]", Jo = "[object Uint16Array]", Yo = "[object Uint32Array]";
function Xo(e, t, n) {
	var r = e.constructor;
	switch (t) {
		case zo: return Co(e);
		case jo:
		case Mo: return new r(+e);
		case Bo: return wo(e, n);
		case Vo:
		case Ho:
		case Uo:
		case Wo:
		case Go:
		case Ko:
		case qo:
		case Jo:
		case Yo: return Ao(e, n);
		case No: return new r();
		case Po:
		case Lo: return new r(e);
		case Fo: return Eo(e);
		case Io: return new r();
		case Ro: return ko(e);
	}
}
// node_modules/lodash-es/_initCloneObject.js
function Zo(e) {
	return typeof e.constructor == "function" && !Qt(e) ? vt(Zr(e)) : {};
}
// node_modules/lodash-es/_baseIsMap.js
var Qo = "[object Map]";
function $o(e) {
	return Ae(e) && yo(e) == Qo;
}
// node_modules/lodash-es/isMap.js
var es = Vn && Vn.isMap, ts = es ? Ln(es) : $o, ns = "[object Set]";
function rs(e) {
	return Ae(e) && yo(e) == ns;
}
// node_modules/lodash-es/isSet.js
var is = Vn && Vn.isSet, as = is ? Ln(is) : rs, os = 1, ss = 2, cs = 4, ls = "[object Arguments]", us = "[object Array]", ds = "[object Boolean]", fs = "[object Date]", ps = "[object Error]", ms = "[object Function]", hs = "[object GeneratorFunction]", gs = "[object Map]", _s = "[object Number]", vs = "[object Object]", ys = "[object RegExp]", bs = "[object Set]", xs = "[object String]", Ss = "[object Symbol]", Cs = "[object WeakMap]", ws = "[object ArrayBuffer]", Ts = "[object DataView]", Es = "[object Float32Array]", Ds = "[object Float64Array]", Os = "[object Int8Array]", ks = "[object Int16Array]", As = "[object Int32Array]", js = "[object Uint8Array]", Ms = "[object Uint8ClampedArray]", Ns = "[object Uint16Array]", Ps = "[object Uint32Array]", M = {};
M[ls] = M[us] = M[ws] = M[Ts] = M[ds] = M[fs] = M[Es] = M[Ds] = M[Os] = M[ks] = M[As] = M[gs] = M[_s] = M[vs] = M[ys] = M[bs] = M[xs] = M[Ss] = M[js] = M[Ms] = M[Ns] = M[Ps] = !0, M[ps] = M[ms] = M[Cs] = !1;
function Fs(e, t, n, r, i, a) {
	var o, s = t & os, c = t & ss, l = t & cs;
	if (n && (o = i ? n(e, r, i, a) : n(e)), o !== void 0) return o;
	if (!A(e)) return e;
	var u = Pe(e);
	if (u) {
		if (o = xo(e), !s) return xt(e, o);
	} else {
		var d = yo(e), f = d == ms || d == hs;
		if (dn(e)) return Ga(e, s);
		if (d == vs || d == ls || f && !i) {
			if (o = c || f ? {} : Zo(e), !s) return c ? $a(e, Ba(o, e)) : Za(e, za(o, e));
		} else {
			if (!M[d]) return i ? e : {};
			o = Xo(e, d, s);
		}
	}
	a || (a = new Ra());
	var p = a.get(e);
	if (p) return p;
	a.set(e, o), as(e) ? e.forEach(function(r) {
		o.add(Fs(r, t, n, r, e, a));
	}) : ts(e) && e.forEach(function(r, i) {
		o.set(i, Fs(r, t, n, i, e, a));
	});
	var m = u ? void 0 : (l ? c ? no : to : c ? er : Xn)(e);
	return kt(m || e, function(r, i) {
		m && (i = r, r = e[i]), Vt(o, i, Fs(r, t, n, i, e, a));
	}), o;
}
// node_modules/lodash-es/clone.js
var Is = 4;
function Ls(e) {
	return Fs(e, Is);
}
// node_modules/lodash-es/cloneDeep.js
var Rs = 1, zs = 4;
function N(e) {
	return Fs(e, Rs | zs);
}
// node_modules/lodash-es/_setCacheAdd.js
var Bs = "__lodash_hash_undefined__";
function Vs(e) {
	return this.__data__.set(e, Bs), this;
}
// node_modules/lodash-es/_setCacheHas.js
function Hs(e) {
	return this.__data__.has(e);
}
// node_modules/lodash-es/_SetCache.js
function Us(e) {
	var t = -1, n = e == null ? 0 : e.length;
	for (this.__data__ = new jr(); ++t < n;) this.add(e[t]);
}
Us.prototype.add = Us.prototype.push = Vs, Us.prototype.has = Hs;
// node_modules/lodash-es/_arraySome.js
function Ws(e, t) {
	for (var n = -1, r = e == null ? 0 : e.length; ++n < r;) if (t(e[n], n, e)) return !0;
	return !1;
}
// node_modules/lodash-es/_cacheHas.js
function Gs(e, t) {
	return e.has(t);
}
// node_modules/lodash-es/_equalArrays.js
var Ks = 1, qs = 2;
function Js(e, t, n, r, i, a) {
	var o = n & Ks, s = e.length, c = t.length;
	if (s != c && !(o && c > s)) return !1;
	var l = a.get(e), u = a.get(t);
	if (l && u) return l == t && u == e;
	var d = -1, f = !0, p = n & qs ? new Us() : void 0;
	for (a.set(e, t), a.set(t, e); ++d < s;) {
		var m = e[d], h = t[d];
		if (r) var g = o ? r(h, m, d, t, e, a) : r(m, h, d, e, t, a);
		if (g !== void 0) {
			if (g) continue;
			f = !1;
			break;
		}
		if (p) {
			if (!Ws(t, function(e, t) {
				if (!Gs(p, t) && (m === e || i(m, e, n, r, a))) return p.push(t);
			})) {
				f = !1;
				break;
			}
		} else if (!(m === h || i(m, h, n, r, a))) {
			f = !1;
			break;
		}
	}
	return a.delete(e), a.delete(t), f;
}
// node_modules/lodash-es/_mapToArray.js
function Ys(e) {
	var t = -1, n = Array(e.size);
	return e.forEach(function(e, r) {
		n[++t] = [r, e];
	}), n;
}
// node_modules/lodash-es/_setToArray.js
function Xs(e) {
	var t = -1, n = Array(e.size);
	return e.forEach(function(e) {
		n[++t] = e;
	}), n;
}
// node_modules/lodash-es/_equalByTag.js
var Zs = 1, Qs = 2, $s = "[object Boolean]", ec = "[object Date]", tc = "[object Error]", nc = "[object Map]", rc = "[object Number]", ic = "[object RegExp]", ac = "[object Set]", oc = "[object String]", sc = "[object Symbol]", cc = "[object ArrayBuffer]", lc = "[object DataView]", uc = ve ? ve.prototype : void 0, dc = uc ? uc.valueOf : void 0;
function fc(e, t, n, r, i, a, o) {
	switch (n) {
		case lc:
			if (e.byteLength != t.byteLength || e.byteOffset != t.byteOffset) return !1;
			e = e.buffer, t = t.buffer;
		case cc: return !(e.byteLength != t.byteLength || !a(new So(e), new So(t)));
		case $s:
		case ec:
		case rc: return zt(+e, +t);
		case tc: return e.name == t.name && e.message == t.message;
		case ic:
		case oc: return e == t + "";
		case nc: var s = Ys;
		case ac:
			var c = r & Zs;
			if (s || (s = Xs), e.size != t.size && !c) return !1;
			var l = o.get(e);
			if (l) return l == t;
			r |= Qs, o.set(e, t);
			var u = Js(s(e), s(t), r, i, a, o);
			return o.delete(e), u;
		case sc: if (dc) return dc.call(e) == dc.call(t);
	}
	return !1;
}
// node_modules/lodash-es/_equalObjects.js
var pc = 1, mc = Object.prototype.hasOwnProperty;
function hc(e, t, n, r, i, a) {
	var o = n & pc, s = to(e), c = s.length;
	if (c != to(t).length && !o) return !1;
	for (var l = c; l--;) {
		var u = s[l];
		if (!(o ? u in t : mc.call(t, u))) return !1;
	}
	var d = a.get(e), f = a.get(t);
	if (d && f) return d == t && f == e;
	var p = !0;
	a.set(e, t), a.set(t, e);
	for (var m = o; ++l < c;) {
		u = s[l];
		var h = e[u], g = t[u];
		if (r) var _ = o ? r(g, h, u, t, e, a) : r(h, g, u, e, t, a);
		if (!(_ === void 0 ? h === g || i(h, g, n, r, a) : _)) {
			p = !1;
			break;
		}
		m || (m = u == "constructor");
	}
	if (p && !m) {
		var v = e.constructor, y = t.constructor;
		v != y && "constructor" in e && "constructor" in t && !(typeof v == "function" && v instanceof v && typeof y == "function" && y instanceof y) && (p = !1);
	}
	return a.delete(e), a.delete(t), p;
}
// node_modules/lodash-es/_baseIsEqualDeep.js
var gc = 1, _c = "[object Arguments]", vc = "[object Array]", yc = "[object Object]", bc = Object.prototype.hasOwnProperty;
function xc(e, t, n, r, i, a) {
	var o = Pe(e), s = Pe(t), c = o ? vc : yo(e), l = s ? vc : yo(t);
	c = c == _c ? yc : c, l = l == _c ? yc : l;
	var u = c == yc, d = l == yc, f = c == l;
	if (f && dn(e)) {
		if (!dn(t)) return !1;
		o = !0, u = !1;
	}
	if (f && !u) return a || (a = new Ra()), o || Un(e) ? Js(e, t, n, r, i, a) : fc(e, t, c, n, r, i, a);
	if (!(n & gc)) {
		var p = u && bc.call(e, "__wrapped__"), m = d && bc.call(t, "__wrapped__");
		if (p || m) {
			var h = p ? e.value() : e, g = m ? t.value() : t;
			return a || (a = new Ra()), i(h, g, n, r, a);
		}
	}
	return f ? (a || (a = new Ra()), hc(e, t, n, r, i, a)) : !1;
}
// node_modules/lodash-es/_baseIsEqual.js
function Sc(e, t, n, r, i) {
	return e === t ? !0 : e == null || t == null || !Ae(e) && !Ae(t) ? e !== e && t !== t : xc(e, t, n, r, Sc, i);
}
// node_modules/lodash-es/_baseIsMatch.js
var Cc = 1, wc = 2;
function Tc(e, t, n, r) {
	var i = n.length, a = i, o = !r;
	if (e == null) return !a;
	for (e = Object(e); i--;) {
		var s = n[i];
		if (o && s[2] ? s[1] !== e[s[0]] : !(s[0] in e)) return !1;
	}
	for (; ++i < a;) {
		s = n[i];
		var c = s[0], l = e[c], u = s[1];
		if (o && s[2]) {
			if (l === void 0 && !(c in e)) return !1;
		} else {
			var d = new Ra();
			if (r) var f = r(l, u, c, e, t, d);
			if (!(f === void 0 ? Sc(u, l, Cc | wc, r, d) : f)) return !1;
		}
	}
	return !0;
}
// node_modules/lodash-es/_isStrictComparable.js
function Ec(e) {
	return e === e && !A(e);
}
// node_modules/lodash-es/_getMatchData.js
function Dc(e) {
	for (var t = Xn(e), n = t.length; n--;) {
		var r = t[n], i = e[r];
		t[n] = [
			r,
			i,
			Ec(i)
		];
	}
	return t;
}
// node_modules/lodash-es/_matchesStrictComparable.js
function Oc(e, t) {
	return function(n) {
		return n != null && n[e] === t && (t !== void 0 || e in Object(n));
	};
}
// node_modules/lodash-es/_baseMatches.js
function kc(e) {
	var t = Dc(e);
	return t.length == 1 && t[0][2] ? Oc(t[0][0], t[0][1]) : function(n) {
		return n === e || Tc(n, e, t);
	};
}
// node_modules/lodash-es/_baseHasIn.js
function Ac(e, t) {
	return e != null && t in Object(e);
}
// node_modules/lodash-es/_hasPath.js
function jc(e, t, n) {
	t = Br(t, e);
	for (var r = -1, i = t.length, a = !1; ++r < i;) {
		var o = Hr(t[r]);
		if (!(a = e != null && n(e, o))) break;
		e = e[o];
	}
	return a || ++r != i ? a : (i = e == null ? 0 : e.length, !!i && qt(i) && Lt(o, i) && (Pe(e) || on(e)));
}
// node_modules/lodash-es/hasIn.js
function Mc(e, t) {
	return e != null && jc(e, t, Ac);
}
// node_modules/lodash-es/_baseMatchesProperty.js
var Nc = 1, Pc = 2;
function Fc(e, t) {
	return rr(e) && Ec(t) ? Oc(Hr(e), t) : function(n) {
		var r = Wr(n, e);
		return r === void 0 && r === t ? Mc(n, e) : Sc(t, r, Nc | Pc);
	};
}
// node_modules/lodash-es/_baseProperty.js
function Ic(e) {
	return function(t) {
		return t?.[e];
	};
}
// node_modules/lodash-es/_basePropertyDeep.js
function Lc(e) {
	return function(t) {
		return Ur(t, e);
	};
}
// node_modules/lodash-es/property.js
function Rc(e) {
	return rr(e) ? Ic(Hr(e)) : Lc(e);
}
// node_modules/lodash-es/_baseIteratee.js
function zc(e) {
	return typeof e == "function" ? e : e == null ? Ye : typeof e == "object" ? Pe(e) ? Fc(e[0], e[1]) : kc(e) : Rc(e);
}
// node_modules/lodash-es/_arrayAggregator.js
function Bc(e, t, n, r) {
	for (var i = -1, a = e == null ? 0 : e.length; ++i < a;) {
		var o = e[i];
		t(r, o, n(o), e);
	}
	return r;
}
// node_modules/lodash-es/_createBaseFor.js
function Vc(e) {
	return function(t, n, r) {
		for (var i = -1, a = Object(t), o = r(t), s = o.length; s--;) {
			var c = o[e ? s : ++i];
			if (n(a[c], c, a) === !1) break;
		}
		return t;
	};
}
// node_modules/lodash-es/_baseFor.js
var Hc = Vc();
// node_modules/lodash-es/_baseForOwn.js
function Uc(e, t) {
	return e && Hc(e, t, Xn);
}
// node_modules/lodash-es/_createBaseEach.js
function Wc(e, t) {
	return function(n, r) {
		if (n == null) return n;
		if (!Jt(n)) return e(n, r);
		for (var i = n.length, a = t ? i : -1, o = Object(n); (t ? a-- : ++a < i) && r(o[a], a, o) !== !1;);
		return n;
	};
}
// node_modules/lodash-es/_baseEach.js
var Gc = Wc(Uc);
// node_modules/lodash-es/_baseAggregator.js
function Kc(e, t, n, r) {
	return Gc(e, function(e, i, a) {
		t(r, e, n(e), a);
	}), r;
}
// node_modules/lodash-es/_createAggregator.js
function qc(e, t) {
	return function(n, r) {
		var i = Pe(n) ? Bc : Kc, a = t ? t() : {};
		return i(n, e, zc(r, 2), a);
	};
}
// node_modules/lodash-es/now.js
var Jc = function() {
	return _e.Date.now();
}, Yc = "Expected a function", Xc = Math.max, Zc = Math.min;
function Qc(e, t, n) {
	var r, i, a, o, s, c, l = 0, u = !1, d = !1, f = !0;
	if (typeof e != "function") throw TypeError(Yc);
	t = Je(t) || 0, A(n) && (u = !!n.leading, d = "maxWait" in n, a = d ? Xc(Je(n.maxWait) || 0, t) : a, f = "trailing" in n ? !!n.trailing : f);
	function p(t) {
		var n = r, a = i;
		return r = i = void 0, l = t, o = e.apply(a, n), o;
	}
	function m(e) {
		return l = e, s = setTimeout(_, t), u ? p(e) : o;
	}
	function h(e) {
		var n = e - c, r = e - l, i = t - n;
		return d ? Zc(i, a - r) : i;
	}
	function g(e) {
		var n = e - c, r = e - l;
		return c === void 0 || n >= t || n < 0 || d && r >= a;
	}
	function _() {
		var e = Jc();
		if (g(e)) return v(e);
		s = setTimeout(_, h(e));
	}
	function v(e) {
		return s = void 0, f && r ? p(e) : (r = i = void 0, o);
	}
	function y() {
		s !== void 0 && clearTimeout(s), l = 0, r = c = i = s = void 0;
	}
	function b() {
		return s === void 0 ? o : v(Jc());
	}
	function x() {
		var e = Jc(), n = g(e);
		if (r = arguments, i = this, c = e, n) {
			if (s === void 0) return m(c);
			if (d) return clearTimeout(s), s = setTimeout(_, t), p(c);
		}
		return s === void 0 && (s = setTimeout(_, t)), o;
	}
	return x.cancel = y, x.flush = b, x;
}
// node_modules/lodash-es/defaults.js
var $c = Object.prototype, el = $c.hasOwnProperty, tl = Gt(function(e, t) {
	e = Object(e);
	var n = -1, r = t.length, i = r > 2 ? t[2] : void 0;
	for (i && Yt(t[0], t[1], i) && (r = 1); ++n < r;) for (var a = t[n], o = er(a), s = -1, c = o.length; ++s < c;) {
		var l = o[s], u = e[l];
		(u === void 0 || zt(u, $c[l]) && !el.call(e, l)) && (e[l] = a[l]);
	}
	return e;
});
// node_modules/lodash-es/_assignMergeValue.js
function nl(e, t, n) {
	(n !== void 0 && !zt(e[t], n) || n === void 0 && !(t in e)) && Rt(e, t, n);
}
// node_modules/lodash-es/isArrayLikeObject.js
function rl(e) {
	return Ae(e) && Jt(e);
}
// node_modules/lodash-es/_safeGet.js
function il(e, t) {
	if ((t !== "constructor" || typeof e[t] != "function") && t != "__proto__") return e[t];
}
// node_modules/lodash-es/toPlainObject.js
function al(e) {
	return Ht(e, er(e));
}
// node_modules/lodash-es/_baseMergeDeep.js
function ol(e, t, n, r, i, a, o) {
	var s = il(e, n), c = il(t, n), l = o.get(c);
	if (l) nl(e, n, l);
	else {
		var u = a ? a(s, c, n + "", e, t, o) : void 0, d = u === void 0;
		if (d) {
			var f = Pe(c), p = !f && dn(c), m = !f && !p && Un(c);
			u = c, f || p || m ? Pe(s) ? u = s : rl(s) ? u = xt(s) : p ? (d = !1, u = Ga(c, !0)) : m ? (d = !1, u = Ao(c, !0)) : u = [] : ii(c) || on(c) ? (u = s, on(s) ? u = al(s) : (!A(s) || et(s)) && (u = Zo(c))) : d = !1;
		}
		d && (o.set(c, u), i(u, c, r, a, o), o.delete(c)), nl(e, n, u);
	}
}
// node_modules/lodash-es/_baseMerge.js
function sl(e, t, n, r, i) {
	e !== t && Hc(t, function(a, o) {
		if (i || (i = new Ra()), A(a)) ol(e, t, o, n, sl, r, i);
		else {
			var s = r ? r(il(e, o), a, o + "", e, t, i) : void 0;
			s === void 0 && (s = a), nl(e, o, s);
		}
	}, er);
}
// node_modules/lodash-es/_customDefaultsMerge.js
function cl(e, t, n, r, i, a) {
	return A(e) && A(t) && (a.set(t, e), sl(e, t, void 0, cl, a), a.delete(t)), e;
}
// node_modules/lodash-es/mergeWith.js
var ll = Xt(function(e, t, n, r) {
	sl(e, t, n, r);
}), ul = Gt(function(e) {
	return e.push(void 0, cl), yt(ll, void 0, e);
});
// node_modules/lodash-es/_arrayIncludesWith.js
function dl(e, t, n) {
	for (var r = -1, i = e == null ? 0 : e.length; ++r < i;) if (n(t, e[r])) return !0;
	return !1;
}
// node_modules/lodash-es/_baseDifference.js
var fl = 200;
function pl(e, t, n, r) {
	var i = -1, a = Pt, o = !0, s = e.length, c = [], l = t.length;
	if (!s) return c;
	n && (t = Ne(t, Ln(n))), r ? (a = dl, o = !1) : t.length >= fl && (a = Gs, o = !1, t = new Us(t));
	outer: for (; ++i < s;) {
		var u = e[i], d = n == null ? u : n(u);
		if (u = r || u !== 0 ? u : 0, o && d === d) {
			for (var f = l; f--;) if (t[f] === d) continue outer;
			c.push(u);
		} else a(t, d, r) || c.push(u);
	}
	return c;
}
// node_modules/lodash-es/difference.js
var ml = Gt(function(e, t) {
	return rl(e) ? pl(e, Jr(t, 1, rl, !0)) : [];
});
// node_modules/lodash-es/_baseMap.js
function hl(e, t) {
	var n = -1, r = Jt(e) ? Array(e.length) : [];
	return Gc(e, function(e, i, a) {
		r[++n] = t(e, i, a);
	}), r;
}
// node_modules/lodash-es/groupBy.js
var gl = Object.prototype.hasOwnProperty, _l = qc(function(e, t, n) {
	gl.call(e, n) ? e[n].push(t) : Rt(e, n, [t]);
});
// node_modules/lodash-es/_baseGt.js
function vl(e, t) {
	return e > t;
}
// node_modules/lodash-es/_baseHas.js
var yl = Object.prototype.hasOwnProperty;
function bl(e, t) {
	return e != null && yl.call(e, t);
}
// node_modules/lodash-es/has.js
function xl(e, t) {
	return e != null && jc(e, t, bl);
}
// node_modules/lodash-es/isEmpty.js
var Sl = "[object Map]", Cl = "[object Set]", wl = Object.prototype.hasOwnProperty;
function Tl(e) {
	if (e == null) return !0;
	if (Jt(e) && (Pe(e) || typeof e == "string" || typeof e.splice == "function" || dn(e) || Un(e) || on(e))) return !e.length;
	var t = yo(e);
	if (t == Sl || t == Cl) return !e.size;
	if (Qt(e)) return !Yn(e).length;
	for (var n in e) if (wl.call(e, n)) return !1;
	return !0;
}
// node_modules/lodash-es/isEqual.js
function El(e, t) {
	return Sc(e, t);
}
// node_modules/lodash-es/isNumber.js
var Dl = "[object Number]";
function Ol(e) {
	return typeof e == "number" || Ae(e) && ke(e) == Dl;
}
// node_modules/lodash-es/lowerCase.js
var kl = ki("toLowerCase");
// node_modules/lodash-es/_baseExtremum.js
function Al(e, t, n) {
	for (var r = -1, i = e.length; ++r < i;) {
		var a = e[r], o = t(a);
		if (o != null && (s === void 0 ? o === o && !Me(o) : n(o, s))) var s = o, c = a;
	}
	return c;
}
// node_modules/lodash-es/max.js
function jl(e) {
	return e && e.length ? Al(e, Ye, vl) : void 0;
}
// node_modules/lodash-es/merge.js
var P = Xt(function(e, t, n) {
	sl(e, t, n);
});
// node_modules/lodash-es/_baseSet.js
function Ml(e, t, n, r) {
	if (!A(e)) return e;
	t = Br(t, e);
	for (var i = -1, a = t.length, o = a - 1, s = e; s != null && ++i < a;) {
		var c = Hr(t[i]), l = n;
		if (c === "__proto__" || c === "constructor" || c === "prototype") return e;
		if (i != o) {
			var u = s[c];
			l = r ? r(u, c, s) : void 0, l === void 0 && (l = A(u) ? u : Lt(t[i + 1]) ? [] : {});
		}
		Vt(s, c, l), s = s[c];
	}
	return e;
}
// node_modules/lodash-es/_basePickBy.js
function Nl(e, t, n) {
	for (var r = -1, i = t.length, a = {}; ++r < i;) {
		var o = t[r], s = Ur(e, o);
		n(s, o) && Ml(a, Br(o, e), s);
	}
	return a;
}
// node_modules/lodash-es/_baseSortBy.js
function Pl(e, t) {
	var n = e.length;
	for (e.sort(t); n--;) e[n] = e[n].value;
	return e;
}
// node_modules/lodash-es/_compareAscending.js
function Fl(e, t) {
	if (e !== t) {
		var n = e !== void 0, r = e === null, i = e === e, a = Me(e), o = t !== void 0, s = t === null, c = t === t, l = Me(t);
		if (!s && !l && !a && e > t || a && o && c && !s && !l || r && o && c || !n && c || !i) return 1;
		if (!r && !a && !l && e < t || l && n && i && !r && !a || s && n && i || !o && i || !c) return -1;
	}
	return 0;
}
// node_modules/lodash-es/_compareMultiple.js
function Il(e, t, n) {
	for (var r = -1, i = e.criteria, a = t.criteria, o = i.length, s = n.length; ++r < o;) {
		var c = Fl(i[r], a[r]);
		if (c) return r >= s ? c : c * (n[r] == "desc" ? -1 : 1);
	}
	return e.index - t.index;
}
// node_modules/lodash-es/_baseOrderBy.js
function Ll(e, t, n) {
	t = t.length ? Ne(t, function(e) {
		return Pe(e) ? function(t) {
			return Ur(t, e.length === 1 ? e[0] : e);
		} : e;
	}) : [Ye];
	var r = -1;
	return t = Ne(t, Ln(zc)), Pl(hl(e, function(e, n, i) {
		return {
			criteria: Ne(t, function(t) {
				return t(e);
			}),
			index: ++r,
			value: e
		};
	}), function(e, t) {
		return Il(e, t, n);
	});
}
// node_modules/lodash-es/_basePick.js
function Rl(e, t) {
	return Nl(e, t, function(t, n) {
		return Mc(e, n);
	});
}
// node_modules/lodash-es/pick.js
var zl = Xr(function(e, t) {
	return e == null ? {} : Rl(e, t);
}), Bl = Gt(function(e, t) {
	if (e == null) return [];
	var n = t.length;
	return n > 1 && Yt(e, t[0], t[1]) ? t = [] : n > 2 && Yt(t[0], t[1], t[2]) && (t = [t[0]]), Ll(e, Jr(t, 1), []);
}), Vl = 4294967294, Hl = Math.floor, Ul = Math.min;
function Wl(e, t, n, r) {
	var i = 0, a = e == null ? 0 : e.length;
	if (a === 0) return 0;
	t = n(t);
	for (var o = t !== t, s = t === null, c = Me(t), l = t === void 0; i < a;) {
		var u = Hl((i + a) / 2), d = n(e[u]), f = d !== void 0, p = d === null, m = d === d, h = Me(d);
		if (o) var g = r || m;
		else g = l ? m && (r || f) : s ? m && f && (r || !p) : c ? m && f && !p && (r || !h) : p || h ? !1 : r ? d <= t : d < t;
		g ? i = u + 1 : a = u;
	}
	return Ul(a, Vl);
}
// node_modules/lodash-es/_baseSortedIndex.js
var Gl = 2147483647;
function Kl(e, t, n) {
	var r = 0, i = e == null ? r : e.length;
	if (typeof t == "number" && t === t && i <= Gl) {
		for (; r < i;) {
			var a = r + i >>> 1, o = e[a];
			o !== null && !Me(o) && (n ? o <= t : o < t) ? r = a + 1 : i = a;
		}
		return i;
	}
	return Wl(e, t, Ye, n);
}
// node_modules/lodash-es/sortedIndex.js
function ql(e, t) {
	return Kl(e, t);
}
// node_modules/lodash-es/startCase.js
var Jl = Da(function(e, t, n) {
	return e + (n ? " " : "") + Ai(t);
}), Yl = "Expected a function";
function Xl(e, t, n) {
	var r = !0, i = !0;
	if (typeof e != "function") throw TypeError(Yl);
	return A(n) && (r = "leading" in n ? !!n.leading : r, i = "trailing" in n ? !!n.trailing : i), Qc(e, t, {
		leading: r,
		maxWait: t,
		trailing: i
	});
}
// node_modules/lodash-es/_createSet.js
var Zl = ao && 1 / Xs(new ao([, -0]))[1] == 1 / 0 ? function(e) {
	return new ao(e);
} : bt, Ql = 200;
function $l(e, t, n) {
	var r = -1, i = Pt, a = e.length, o = !0, s = [], c = s;
	if (n) o = !1, i = dl;
	else if (a >= Ql) {
		var l = t ? null : Zl(e);
		if (l) return Xs(l);
		o = !1, i = Gs, c = new Us();
	} else c = t ? [] : s;
	outer: for (; ++r < a;) {
		var u = e[r], d = t ? t(u) : u;
		if (u = n || u !== 0 ? u : 0, o && d === d) {
			for (var f = c.length; f--;) if (c[f] === d) continue outer;
			t && c.push(d), s.push(u);
		} else i(c, d, n) || (c !== s && c.push(d), s.push(u));
	}
	return s;
}
// node_modules/lodash-es/union.js
var eu = Gt(function(e) {
	return $l(Jr(e, 1, rl, !0));
});
// node_modules/lodash-es/uniq.js
function tu(e) {
	return e && e.length ? $l(e) : [];
}
// node_modules/lodash-es/uniqueId.js
var nu = 0;
function ru(e) {
	var t = ++nu;
	return zr(e) + t;
}
// node_modules/@antv/x6/es/common/number/number.js
function iu(e) {
	return typeof e == "string" && e.slice(-1) === "%";
}
function au(e, t) {
	if (e == null) return 0;
	let n;
	if (typeof e == "string") {
		if (n = parseFloat(e), iu(e) && (n /= 100, Number.isFinite(n))) return n * t;
	} else n = e;
	return Number.isFinite(n) ? n > 0 && n < 1 ? n * t : n : 0;
}
function ou(e) {
	if (typeof e == "object") {
		let t = 0, n = 0, r = 0, i = 0;
		return e.vertical != null && Number.isFinite(e.vertical) && (n = i = e.vertical), e.horizontal != null && Number.isFinite(e.horizontal) && (r = t = e.horizontal), e.left != null && Number.isFinite(e.left) && (t = e.left), e.top != null && Number.isFinite(e.top) && (n = e.top), e.right != null && Number.isFinite(e.right) && (r = e.right), e.bottom != null && Number.isFinite(e.bottom) && (i = e.bottom), {
			top: n,
			right: r,
			bottom: i,
			left: t
		};
	}
	let t = 0;
	return e != null && Number.isFinite(e) && (t = e), {
		top: t,
		right: t,
		bottom: t,
		left: t
	};
}
// node_modules/@antv/x6/es/common/platform/index.js
var su = !1, cu = !1, lu = !1, uu = !1;
if (typeof navigator == "object") {
	let e = navigator.userAgent;
	e.indexOf("Macintosh"), e.match(/(iPad|iPhone|iPod)/g), e.indexOf("Windows"), su = e.indexOf("MSIE") >= 0, e.match(/Trident\/7\./), cu = !!e.match(/Edge\//), e.indexOf("Mozilla/") >= 0 && e.indexOf("MSIE") < 0 && e.indexOf("Edge/"), e.indexOf("Chrome/") >= 0 && e.indexOf("Edge/"), e.indexOf("Opera/") >= 0 || e.indexOf("OPR/"), e.indexOf("Firefox/"), lu = e.indexOf("AppleWebKit/") >= 0 && e.indexOf("Chrome/") < 0 && e.indexOf("Edge/") < 0, typeof document == "object" && (uu = !document.createElementNS || `${document.createElementNS("http://www.w3.org/2000/svg", "foreignObject")}` != "[object SVGForeignObjectElement]" || e.indexOf("Opera/") >= 0);
}
if (typeof window == "object" && (window.chrome != null && window.chrome.app != null && window.chrome.app.runtime, window.PointerEvent), typeof document == "object") {
	"ontouchstart" in document.documentElement;
	try {
		let e = Object.defineProperty({}, "passive", { get() {} }), t = document.createElement("div");
		t.addEventListener && t.addEventListener("click", () => {}, e);
	} catch {}
}
var du = su, fu = cu, pu = lu, mu = !uu;
function hu() {
	let e = window.module;
	return e != null && e.hot != null && e.hot.status != null ? e.hot.status() : "unkonwn";
}
function gu() {
	return hu() === "apply";
}
var _u = {
	select: "input",
	change: "input",
	submit: "form",
	reset: "form",
	error: "img",
	load: "img",
	abort: "img"
};
function vu(e) {
	let t = document.createElement(_u[e] || "div"), n = `on${e}`, r = n in t;
	return r || (t.setAttribute(n, "return;"), r = typeof t[n] == "function"), r;
}
// node_modules/@antv/x6/es/common/css-loader/index.js
var yu = [];
function bu(e, t) {
	let n = yu.find((t) => t.name === e);
	if (!(n && (n.loadTimes += 1, n.loadTimes > 1)) && !gu()) {
		let n = document.createElement("style");
		n.setAttribute("type", "text/css"), n.textContent = t;
		let r = document.querySelector("head");
		r && r.insertBefore(n, r.firstChild), yu.push({
			name: e,
			loadTimes: 1,
			styleElement: n
		});
	}
}
function xu(e) {
	let t = yu.findIndex((t) => t.name === e);
	if (t > -1) {
		let e = yu[t];
		if (--e.loadTimes, e.loadTimes > 0) return;
		let n = e.styleElement;
		n && n.parentNode && n.parentNode.removeChild(n), n = null, yu.splice(t, 1);
	}
}
// node_modules/@antv/x6/es/common/datauri/index.js
function Su(e) {
	let t = e.match(/<svg[^>]*viewBox\s*=\s*(["']?)(.+?)\1[^>]*>/i);
	return t && t[2] ? t[2].replace(/\s+/, " ").split(" ") : null;
}
function Cu(e) {
	let t = parseFloat(e);
	return Number.isNaN(t) ? null : t;
}
function wu(e) {
	return e.substr(0, 5) === "data:";
}
function Tu(e, t) {
	if (!e || wu(e)) {
		setTimeout(() => t(null, e));
		return;
	}
	let n = () => {
		t(/* @__PURE__ */ Error(`Failed to load image: ${e}`));
	}, r = window.FileReader ? (e) => {
		if (e.status === 200) {
			let r = new FileReader();
			r.onload = (e) => {
				let n = e.target.result;
				t(null, n);
			}, r.onerror = n, r.readAsDataURL(e.response);
		} else n();
	} : (r) => {
		let i = (e) => {
			let t = 32768, n = [];
			for (let r = 0; r < e.length; r += t) n.push(String.fromCharCode.apply(null, e.subarray(r, r + t)));
			return n.join("");
		};
		if (r.status === 200) {
			let n = e.split(".").pop() || "png";
			n === "svg" && (n = "svg+xml");
			let a = `data:image/${n};base64,`, o = new Uint8Array(r.response);
			t(null, a + btoa(i(o)));
		} else n();
	}, i = new XMLHttpRequest();
	i.responseType = window.FileReader ? "blob" : "arraybuffer", i.open("GET", e, !0), i.addEventListener("error", n), i.addEventListener("load", () => r(i)), i.send();
}
function Eu(e) {
	let t = e.replace(/\s/g, "");
	t = decodeURIComponent(t);
	let n = t.indexOf(","), r = t.slice(0, n), i = r.split(":")[1].split(";")[0], a = t.slice(n + 1), o;
	o = r.indexOf("base64") >= 0 ? atob(a) : unescape(encodeURIComponent(a));
	let s = new Uint8Array(o.length);
	for (let e = 0; e < o.length; e += 1) s[e] = o.charCodeAt(e);
	return new Blob([s], { type: i });
}
function Du(e, t) {
	let n = window.navigator.msSaveBlob;
	if (n) n(e, t);
	else {
		let n = window.URL.createObjectURL(e), r = document.createElement("a");
		r.href = n, r.download = t, document.body.appendChild(r), r.click(), document.body.removeChild(r), window.URL.revokeObjectURL(n);
	}
}
function Ou(e, t) {
	Du(Eu(e), t);
}
function ku(e, t = {}) {
	let n = null, r = (t) => (n ?? (n = Su(e)), n == null ? null : Cu(n[t])), i = (t) => {
		let n = e.match(t);
		return n && n[2] ? Cu(n[2]) : null;
	}, a = t.width;
	if (a ?? (a = i(/<svg[^>]*width\s*=\s*(["']?)(.+?)\1[^>]*>/i)), a ?? (a = r(2)), a == null) throw Error("Can not parse width from svg string");
	let o = t.height;
	if (o ?? (o = i(/<svg[^>]*height\s*=\s*(["']?)(.+?)\1[^>]*>/i)), o ?? (o = r(3)), o == null) throw Error("Can not parse height from svg string");
	return `data:image/svg+xml,${encodeURIComponent(e).replace(/'/g, "%27").replace(/"/g, "%22")}`;
}
// node_modules/@antv/x6/es/common/function/async.js
function Au(e) {
	return typeof e == "object" && e.then && typeof e.then == "function";
}
function ju(e) {
	return e != null && (e instanceof Promise || Au(e));
}
function Mu(...e) {
	let t = [];
	if (e.forEach((e) => {
		Array.isArray(e) ? t.push(...e) : t.push(e);
	}), t.some((e) => ju(e))) {
		let e = t.map((e) => ju(e) ? e : Promise.resolve(e !== !1));
		return Promise.all(e).then((e) => e.reduce((e, t) => t !== !1 && e, !0));
	}
	return t.every((e) => e !== !1);
}
function Nu(...e) {
	let t = Mu(e);
	return typeof t == "boolean" ? Promise.resolve(t) : t;
}
// node_modules/@antv/x6/es/common/function/function.js
function Pu(e, t, n) {
	if (n) switch (n.length) {
		case 0: return e.call(t);
		case 1: return e.call(t, n[0]);
		case 2: return e.call(t, n[0], n[1]);
		case 3: return e.call(t, n[0], n[1], n[2]);
		case 4: return e.call(t, n[0], n[1], n[2], n[3]);
		case 5: return e.call(t, n[0], n[1], n[2], n[3], n[4]);
		case 6: return e.call(t, n[0], n[1], n[2], n[3], n[4], n[5]);
		default: return e.apply(t, n);
	}
	return e.call(t);
}
function F(e, t, ...n) {
	return Pu(e, t, n);
}
// node_modules/@antv/x6/es/geometry/angle.js
function Fu(e) {
	return 180 * e / Math.PI % 360;
}
var Iu = function(e, t = !1) {
	return (t ? e : e % 360) * Math.PI / 180;
};
function Lu(e) {
	return e % 360 + (e < 0 ? 360 : 0);
}
// node_modules/@antv/x6/es/geometry/util.js
function Ru(e, t = 0) {
	return Number.isInteger(e) ? e : +e.toFixed(t);
}
function zu(e, t) {
	let n, r;
	if (t == null ? (r = e ?? 1, n = 0) : (r = t, n = e ?? 0), r < n) {
		let e = n;
		n = r, r = e;
	}
	return Math.floor(Math.random() * (r - n + 1) + n);
}
function Bu(e, t, n) {
	return Number.isNaN(e) ? NaN : Number.isNaN(t) || Number.isNaN(n) ? 0 : t < n ? e < t ? t : e > n ? n : e : e < n ? n : e > t ? t : e;
}
function Vu(e, t) {
	return t * Math.round(e / t);
}
function Hu(e, t) {
	return t != null && e != null && t.x >= e.x && t.x <= e.x + e.width && t.y >= e.y && t.y <= e.y + e.height;
}
function Uu(e, t) {
	let n = e.x - t.x, r = e.y - t.y;
	return n * n + r * r;
}
// node_modules/@antv/x6/es/geometry/geometry.js
var Wu = class {
	valueOf() {
		return this.toJSON();
	}
	toString() {
		return JSON.stringify(this.toJSON());
	}
}, I = class e extends Wu {
	static create(t, n) {
		return t == null || typeof t == "number" ? new e(t, n) : e.clone(t);
	}
	static clone(t) {
		return e.isPoint(t) ? new e(t.x, t.y) : Array.isArray(t) ? new e(t[0], t[1]) : new e(t.x, t.y);
	}
	static equals(e, t) {
		return e === t || e != null && t != null && e.x === t.x && e.y === t.y;
	}
	static rotateEx(t, n, r, i = new e()) {
		let a = e.clone(t), o = e.clone(i), s = a.x - o.x, c = a.y - o.y, l = s * n - c * r, u = c * n + s * r;
		return new e(l + o.x, u + o.y);
	}
	static toJSON(t) {
		return e.isPoint(t) ? {
			x: t.x,
			y: t.y
		} : Array.isArray(t) ? {
			x: t[0],
			y: t[1]
		} : {
			x: t.x,
			y: t.y
		};
	}
	static fromPolar(t, n, r = new e()) {
		let i = Math.abs(t * Math.cos(n)), a = Math.abs(t * Math.sin(n)), o = e.clone(r), s = Lu(Fu(n));
		return s < 90 ? a = -a : s < 180 ? (i = -i, a = -a) : s < 270 && (i = -i), new e(o.x + i, o.y + a);
	}
	static toPolar(t, n = new e()) {
		let r = e.clone(t), i = e.clone(n), a = r.x - i.x, o = r.y - i.y;
		return new e(Math.sqrt(a * a + o * o), Iu(i.theta(r)));
	}
	static equalPoints(t, n) {
		if (t == null && n != null || t != null && n == null || t != null && n != null && t.length !== n.length) return !1;
		if (t != null && n != null) {
			for (let r = 0, i = t.length; r < i; r += 1) if (!e.equals(t[r], n[r])) return !1;
		}
		return !0;
	}
	static random(t, n, r, i) {
		return new e(zu(t, n), zu(r, i));
	}
	static rotate(t, n, r) {
		let i = Iu(Lu(-n)), a = Math.sin(i), o = Math.cos(i);
		return e.rotateEx(t, o, a, r);
	}
	static isPoint(t) {
		return t != null && t instanceof e;
	}
	static isPointLike(e) {
		return typeof e == "object" && !!e && typeof e.x == "number" && typeof e.y == "number";
	}
	static isPointData(e) {
		return e != null && Array.isArray(e) && e.length === 2 && typeof e[0] == "number" && typeof e[1] == "number";
	}
	constructor(e, t) {
		super(), this.x = e ?? 0, this.y = t ?? 0;
	}
	round(e = 0) {
		return this.x = Ru(this.x, e), this.y = Ru(this.y, e), this;
	}
	add(t, n) {
		let r = e.create(t, n);
		return this.x += r.x, this.y += r.y, this;
	}
	update(t, n) {
		let r = e.create(t, n);
		return this.x = r.x, this.y = r.y, this;
	}
	translate(t, n) {
		let r = e.create(t, n);
		return this.x += r.x, this.y += r.y, this;
	}
	rotate(t, n) {
		let r = e.rotate(this, t, n);
		return this.x = r.x, this.y = r.y, this;
	}
	scale(t, n, r = new e()) {
		let i = e.create(r);
		return this.x = i.x + t * (this.x - i.x), this.y = i.y + n * (this.y - i.y), this;
	}
	closest(t) {
		if (t.length === 1) return e.create(t[0]);
		let n = null, r = Infinity;
		return t.forEach((e) => {
			let t = this.squaredDistance(e);
			t < r && (n = e, r = t);
		}), n ? e.create(n) : null;
	}
	distance(e) {
		return Math.sqrt(this.squaredDistance(e));
	}
	squaredDistance(t) {
		let n = e.create(t), r = this.x - n.x, i = this.y - n.y;
		return r * r + i * i;
	}
	manhattanDistance(t) {
		let n = e.create(t);
		return Math.abs(n.x - this.x) + Math.abs(n.y - this.y);
	}
	magnitude() {
		return Math.sqrt(this.x * this.x + this.y * this.y) || .01;
	}
	theta(t = new e()) {
		let n = e.create(t), r = -(n.y - this.y), i = n.x - this.x, a = Math.atan2(r, i);
		return a < 0 && (a = 2 * Math.PI + a), 180 * a / Math.PI;
	}
	angleBetween(e, t) {
		if (this.equals(e) || this.equals(t)) return NaN;
		let n = this.theta(t) - this.theta(e);
		return n < 0 && (n += 360), n;
	}
	vectorAngle(t) {
		return new e(0, 0).angleBetween(this, t);
	}
	toPolar(t) {
		return this.update(e.toPolar(this, t)), this;
	}
	changeInAngle(t, n, r = new e()) {
		return this.clone().translate(-t, -n).theta(r) - this.theta(r);
	}
	adhereToRect(e) {
		return Hu(e, this) || (this.x = Math.min(Math.max(this.x, e.x), e.x + e.width), this.y = Math.min(Math.max(this.y, e.y), e.y + e.height)), this;
	}
	bearing(t) {
		let n = e.create(t), r = Iu(this.y), i = Iu(n.y), a = this.x, o = n.x, s = Iu(o - a), c = Math.sin(s) * Math.cos(i), l = Math.cos(r) * Math.sin(i) - Math.sin(r) * Math.cos(i) * Math.cos(s), u = Fu(Math.atan2(c, l)), d = [
			"NE",
			"E",
			"SE",
			"S",
			"SW",
			"W",
			"NW",
			"N"
		], f = u - 22.5;
		return f < 0 && (f += 360), f = parseInt(f / 45, 10), d[f];
	}
	cross(t, n) {
		if (t != null && n != null) {
			let r = e.create(t), i = e.create(n);
			return (i.x - this.x) * (r.y - this.y) - (i.y - this.y) * (r.x - this.x);
		}
		return NaN;
	}
	dot(t) {
		let n = e.create(t);
		return this.x * n.x + this.y * n.y;
	}
	diff(t, n) {
		if (typeof t == "number") return new e(this.x - t, this.y - n);
		let r = e.create(t);
		return new e(this.x - r.x, this.y - r.y);
	}
	lerp(t, n) {
		let r = e.create(t);
		return new e((1 - n) * this.x + n * r.x, (1 - n) * this.y + n * r.y);
	}
	normalize(e = 1) {
		let t = e / this.magnitude();
		return this.scale(t, t);
	}
	move(t, n) {
		let r = Iu(e.create(t).theta(this));
		return this.translate(Math.cos(r) * n, -Math.sin(r) * n);
	}
	reflection(t) {
		return e.create(t).move(this, this.distance(t));
	}
	snapToGrid(e, t) {
		return this.x = Vu(this.x, e), this.y = Vu(this.y, t ?? e), this;
	}
	equals(t) {
		let n = e.create(t);
		return n != null && n.x === this.x && n.y === this.y;
	}
	clone() {
		return e.clone(this);
	}
	toJSON() {
		return e.toJSON(this);
	}
	serialize() {
		return `${this.x} ${this.y}`;
	}
}, L = class e extends Wu {
	static isRectangle(t) {
		return t != null && t instanceof e;
	}
	static isRectangleLike(e) {
		return typeof e == "object" && !!e && typeof e.x == "number" && typeof e.y == "number" && typeof e.width == "number" && typeof e.height == "number";
	}
	static create(t, n, r, i) {
		return t == null || typeof t == "number" ? new e(t, n, r, i) : e.clone(t);
	}
	static clone(t) {
		return e.isRectangle(t) ? t.clone() : Array.isArray(t) ? new e(t[0], t[1], t[2], t[3]) : new e(t.x, t.y, t.width, t.height);
	}
	static fromEllipse(t) {
		return new e(t.x - t.a, t.y - t.b, 2 * t.a, 2 * t.b);
	}
	static fromSize(t) {
		return new e(0, 0, t.width, t.height);
	}
	static fromPositionAndSize(t, n) {
		return new e(t.x, t.y, n.width, n.height);
	}
	get left() {
		return this.x;
	}
	get top() {
		return this.y;
	}
	get right() {
		return this.x + this.width;
	}
	get bottom() {
		return this.y + this.height;
	}
	get origin() {
		return new I(this.x, this.y);
	}
	get topLeft() {
		return new I(this.x, this.y);
	}
	get topCenter() {
		return new I(this.x + this.width / 2, this.y);
	}
	get topRight() {
		return new I(this.x + this.width, this.y);
	}
	get center() {
		return new I(this.x + this.width / 2, this.y + this.height / 2);
	}
	get bottomLeft() {
		return new I(this.x, this.y + this.height);
	}
	get bottomCenter() {
		return new I(this.x + this.width / 2, this.y + this.height);
	}
	get bottomRight() {
		return new I(this.x + this.width, this.y + this.height);
	}
	get corner() {
		return new I(this.x + this.width, this.y + this.height);
	}
	get rightMiddle() {
		return new I(this.x + this.width, this.y + this.height / 2);
	}
	get leftMiddle() {
		return new I(this.x, this.y + this.height / 2);
	}
	get topLine() {
		return new R(this.topLeft, this.topRight);
	}
	get rightLine() {
		return new R(this.topRight, this.bottomRight);
	}
	get bottomLine() {
		return new R(this.bottomLeft, this.bottomRight);
	}
	get leftLine() {
		return new R(this.topLeft, this.bottomLeft);
	}
	constructor(e, t, n, r) {
		super(), this.x = e ?? 0, this.y = t ?? 0, this.width = n ?? 0, this.height = r ?? 0;
	}
	getOrigin() {
		return this.origin;
	}
	getTopLeft() {
		return this.topLeft;
	}
	getTopCenter() {
		return this.topCenter;
	}
	getTopRight() {
		return this.topRight;
	}
	getCenter() {
		return this.center;
	}
	getCenterX() {
		return this.x + this.width / 2;
	}
	getCenterY() {
		return this.y + this.height / 2;
	}
	getBottomLeft() {
		return this.bottomLeft;
	}
	getBottomCenter() {
		return this.bottomCenter;
	}
	getBottomRight() {
		return this.bottomRight;
	}
	getCorner() {
		return this.corner;
	}
	getRightMiddle() {
		return this.rightMiddle;
	}
	getLeftMiddle() {
		return this.leftMiddle;
	}
	getTopLine() {
		return this.topLine;
	}
	getRightLine() {
		return this.rightLine;
	}
	getBottomLine() {
		return this.bottomLine;
	}
	getLeftLine() {
		return this.leftLine;
	}
	bbox(t) {
		if (!t) return this.clone();
		let n = Iu(t), r = Math.abs(Math.sin(n)), i = Math.abs(Math.cos(n)), a = this.width * i + this.height * r, o = this.width * r + this.height * i;
		return new e(this.x + (this.width - a) / 2, this.y + (this.height - o) / 2, a, o);
	}
	round(e = 0) {
		return this.x = Ru(this.x, e), this.y = Ru(this.y, e), this.width = Ru(this.width, e), this.height = Ru(this.height, e), this;
	}
	add(t, n, r, i) {
		let a = e.create(t, n, r, i), o = Math.min(this.x, a.x), s = Math.min(this.y, a.y), c = Math.max(this.x + this.width, a.x + a.width), l = Math.max(this.y + this.height, a.y + a.height);
		return this.x = o, this.y = s, this.width = c - o, this.height = l - s, this;
	}
	update(t, n, r, i) {
		let a = e.create(t, n, r, i);
		return this.x = a.x, this.y = a.y, this.width = a.width, this.height = a.height, this;
	}
	inflate(e, t) {
		let n = e, r = t ?? e;
		return this.x -= n, this.y -= r, this.width += 2 * n, this.height += 2 * r, this;
	}
	snapToGrid(e, t) {
		let n = this.origin.snapToGrid(e, t), r = this.corner.snapToGrid(e, t);
		return this.x = n.x, this.y = n.y, this.width = r.x - n.x, this.height = r.y - n.y, this;
	}
	translate(e, t) {
		let n = I.create(e, t);
		return this.x += n.x, this.y += n.y, this;
	}
	scale(e, t, n = new I()) {
		let r = this.origin.scale(e, t, n);
		return this.x = r.x, this.y = r.y, this.width *= e, this.height *= t, this;
	}
	rotate(t, n = this.getCenter()) {
		if (t !== 0) {
			let r = Iu(t), i = Math.cos(r), a = Math.sin(r), o = this.getOrigin(), s = this.getTopRight(), c = this.getBottomRight(), l = this.getBottomLeft();
			o = I.rotateEx(o, i, a, n), s = I.rotateEx(s, i, a, n), c = I.rotateEx(c, i, a, n), l = I.rotateEx(l, i, a, n);
			let u = new e(o.x, o.y, 0, 0);
			u.add(s.x, s.y, 0, 0), u.add(c.x, c.y, 0, 0), u.add(l.x, l.y, 0, 0), this.update(u);
		}
		return this;
	}
	rotate90() {
		let e = (this.width - this.height) / 2;
		this.x += e, this.y -= e;
		let t = this.width;
		return this.width = this.height, this.height = t, this;
	}
	moveAndExpand(t) {
		let n = e.clone(t);
		return this.x += n.x || 0, this.y += n.y || 0, this.width += n.width || 0, this.height += n.height || 0, this;
	}
	getMaxScaleToFit(t, n = this.center) {
		let r = e.clone(t), i = n.x, a = n.y, o = Infinity, s = Infinity, c = Infinity, l = Infinity, u = Infinity, d = Infinity, f = Infinity, p = Infinity, m = r.topLeft;
		m.x < i && (o = (this.x - i) / (m.x - i)), m.y < a && (u = (this.y - a) / (m.y - a));
		let h = r.bottomRight;
		h.x > i && (s = (this.x + this.width - i) / (h.x - i)), h.y > a && (d = (this.y + this.height - a) / (h.y - a));
		let g = r.topRight;
		g.x > i && (c = (this.x + this.width - i) / (g.x - i)), g.y < a && (f = (this.y - a) / (g.y - a));
		let _ = r.bottomLeft;
		return _.x < i && (l = (this.x - i) / (_.x - i)), _.y > a && (p = (this.y + this.height - a) / (_.y - a)), {
			sx: Math.min(o, s, c, l),
			sy: Math.min(u, d, f, p)
		};
	}
	getMaxUniformScaleToFit(e, t = this.center) {
		let n = this.getMaxScaleToFit(e, t);
		return Math.min(n.sx, n.sy);
	}
	containsPoint(e, t) {
		return Hu(this, I.create(e, t));
	}
	containsRect(t, n, r, i) {
		let a = e.create(t, n, r, i), o = this.x, s = this.y, c = this.width, l = this.height, u = a.x, d = a.y, f = a.width, p = a.height;
		return c === 0 || l === 0 || f === 0 || p === 0 ? !1 : u >= o && d >= s && u + f <= o + c && d + p <= s + l;
	}
	intersectsWithLine(e) {
		let t = [
			this.topLine,
			this.rightLine,
			this.bottomLine,
			this.leftLine
		], n = [], r = [];
		return t.forEach((t) => {
			let i = e.intersectsWithLine(t);
			i !== null && r.indexOf(i.toString()) < 0 && (n.push(i), r.push(i.toString()));
		}), n.length > 0 ? n : null;
	}
	intersectsWithLineFromCenterToPoint(e, t) {
		let n = I.clone(e), r = this.center, i = null;
		t != null && t !== 0 && n.rotate(t, r);
		let a = [
			this.topLine,
			this.rightLine,
			this.bottomLine,
			this.leftLine
		], o = new R(r, n);
		for (let e = a.length - 1; e >= 0; --e) {
			let t = a[e].intersectsWithLine(o);
			if (t !== null) {
				i = t;
				break;
			}
		}
		return i && t != null && t !== 0 && i.rotate(-t, r), i;
	}
	intersectsWithRect(t, n, r, i) {
		let a = e.create(t, n, r, i);
		if (!this.isIntersectWithRect(a)) return null;
		let o = this.origin, s = this.corner, c = a.origin, l = a.corner, u = Math.max(o.x, c.x), d = Math.max(o.y, c.y);
		return new e(u, d, Math.min(s.x, l.x) - u, Math.min(s.y, l.y) - d);
	}
	isIntersectWithRect(t, n, r, i) {
		let a = e.create(t, n, r, i), o = this.origin, s = this.corner, c = a.origin, l = a.corner;
		return !(l.x <= o.x || l.y <= o.y || c.x >= s.x || c.y >= s.y);
	}
	normalize() {
		let e = this.x, t = this.y, n = this.width, r = this.height;
		return this.width < 0 && (e = this.x + this.width, n = -this.width), this.height < 0 && (t = this.y + this.height, r = -this.height), this.x = e, this.y = t, this.width = n, this.height = r, this;
	}
	union(t) {
		let n = e.clone(t), r = this.origin, i = this.corner, a = n.origin, o = n.corner, s = Math.min(r.x, a.x), c = Math.min(r.y, a.y), l = Math.max(i.x, o.x), u = Math.max(i.y, o.y);
		return new e(s, c, l - s, u - c);
	}
	getNearestSideToPoint(e) {
		let t = I.clone(e), n = t.x - this.x, r = this.x + this.width - t.x, i = t.y - this.y, a = this.y + this.height - t.y, o = n, s = "left";
		return r < o && (o = r, s = "right"), i < o && (o = i, s = "top"), a < o && (s = "bottom"), s;
	}
	getNearestPointToPoint(e) {
		let t = I.clone(e);
		if (this.containsPoint(t)) {
			let e = this.getNearestSideToPoint(t);
			if (e === "left") return new I(this.x, t.y);
			if (e === "top") return new I(t.x, this.y);
			if (e === "right") return new I(this.x + this.width, t.y);
			if (e === "bottom") return new I(t.x, this.y + this.height);
		}
		return t.adhereToRect(this);
	}
	equals(e) {
		return e != null && e.x === this.x && e.y === this.y && e.width === this.width && e.height === this.height;
	}
	clone() {
		return new e(this.x, this.y, this.width, this.height);
	}
	toJSON() {
		return {
			x: this.x,
			y: this.y,
			width: this.width,
			height: this.height
		};
	}
	serialize() {
		return `${this.x} ${this.y} ${this.width} ${this.height}`;
	}
}, R = class e extends Wu {
	static isLine(t) {
		return t != null && t instanceof e;
	}
	get center() {
		return new I((this.start.x + this.end.x) / 2, (this.start.y + this.end.y) / 2);
	}
	constructor(e, t, n, r) {
		super(), typeof e == "number" && typeof t == "number" ? (this.start = new I(e, t), this.end = new I(n, r)) : (this.start = I.create(e), this.end = I.create(t));
	}
	getCenter() {
		return this.center;
	}
	round(e = 0) {
		return this.start.round(e), this.end.round(e), this;
	}
	translate(e, t) {
		return typeof e == "number" ? (this.start.translate(e, t), this.end.translate(e, t)) : (this.start.translate(e), this.end.translate(e)), this;
	}
	rotate(e, t) {
		return this.start.rotate(e, t), this.end.rotate(e, t), this;
	}
	scale(e, t, n) {
		return this.start.scale(e, t, n), this.end.scale(e, t, n), this;
	}
	length() {
		return Math.sqrt(this.squaredLength());
	}
	squaredLength() {
		let e = this.start.x - this.end.x, t = this.start.y - this.end.y;
		return e * e + t * t;
	}
	setLength(e) {
		let t = this.length();
		if (!t) return this;
		let n = e / t;
		return this.scale(n, n, this.start);
	}
	parallel(e) {
		let t = this.clone();
		if (!t.isDifferentiable()) return t;
		let { start: n, end: r } = t, i = n.clone().rotate(270, r), a = r.clone().rotate(90, n);
		return n.move(a, e), r.move(i, e), t;
	}
	vector() {
		return new I(this.end.x - this.start.x, this.end.y - this.start.y);
	}
	angle() {
		let e = new I(this.start.x + 1, this.start.y);
		return this.start.angleBetween(this.end, e);
	}
	bbox() {
		let e = Math.min(this.start.x, this.end.x), t = Math.min(this.start.y, this.end.y), n = Math.max(this.start.x, this.end.x), r = Math.max(this.start.y, this.end.y);
		return new L(e, t, n - e, r - t);
	}
	bearing() {
		return this.start.bearing(this.end);
	}
	closestPoint(e) {
		return this.pointAt(this.closestPointNormalizedLength(e));
	}
	closestPointLength(e) {
		return this.closestPointNormalizedLength(e) * this.length();
	}
	closestPointTangent(e) {
		return this.tangentAt(this.closestPointNormalizedLength(e));
	}
	closestPointNormalizedLength(t) {
		let n = this.vector().dot(new e(this.start, t).vector()), r = Math.min(1, Math.max(0, n / this.squaredLength()));
		return Number.isNaN(r) ? 0 : r;
	}
	pointAt(e) {
		let t = this.start, n = this.end;
		return e <= 0 ? t.clone() : e >= 1 ? n.clone() : t.lerp(n, e);
	}
	pointAtLength(e) {
		let t = this.start, n = this.end, r = !0;
		e < 0 && (r = !1, e = -e);
		let i = this.length();
		if (e >= i) return r ? n.clone() : t.clone();
		let a = (r ? e : i - e) / i;
		return this.pointAt(a);
	}
	divideAt(t) {
		let n = this.pointAt(t);
		return [new e(this.start, n), new e(n, this.end)];
	}
	divideAtLength(t) {
		let n = this.pointAtLength(t);
		return [new e(this.start, n), new e(n, this.end)];
	}
	containsPoint(t) {
		let n = this.start, r = this.end;
		if (n.cross(t, r) !== 0) return !1;
		let i = this.length();
		return !(new e(n, t).length() > i || new e(t, r).length() > i);
	}
	intersect(e, t) {
		let n = e.intersectsWithLine(this, t);
		return n ? Array.isArray(n) ? n : [n] : null;
	}
	intersectsWithLine(e) {
		let t = new I(this.end.x - this.start.x, this.end.y - this.start.y), n = new I(e.end.x - e.start.x, e.end.y - e.start.y), r = t.x * n.y - t.y * n.x, i = new I(e.start.x - this.start.x, e.start.y - this.start.y), a = i.x * n.y - i.y * n.x, o = i.x * t.y - i.y * t.x;
		if (r === 0 || a * r < 0 || o * r < 0) return null;
		if (r > 0) {
			if (a > r || o > r) return null;
		} else if (a < r || o < r) return null;
		return new I(this.start.x + a * t.x / r, this.start.y + a * t.y / r);
	}
	isDifferentiable() {
		return !this.start.equals(this.end);
	}
	pointOffset(e) {
		let t = I.clone(e), n = this.start, r = this.end;
		return ((r.x - n.x) * (t.y - n.y) - (r.y - n.y) * (t.x - n.x)) / this.length();
	}
	pointSquaredDistance(e, t) {
		let n = I.create(e, t);
		return this.closestPoint(n).squaredDistance(n);
	}
	pointDistance(e, t) {
		let n = I.create(e, t);
		return this.closestPoint(n).distance(n);
	}
	tangentAt(t) {
		if (!this.isDifferentiable()) return null;
		let n = this.start, r = this.end, i = this.pointAt(t), a = new e(n, r);
		return a.translate(i.x - n.x, i.y - n.y), a;
	}
	tangentAtLength(t) {
		if (!this.isDifferentiable()) return null;
		let n = this.start, r = this.end, i = this.pointAtLength(t), a = new e(n, r);
		return a.translate(i.x - n.x, i.y - n.y), a;
	}
	relativeCcw(e, t) {
		let n = I.create(e, t), r = n.x - this.start.x, i = n.y - this.start.y, a = this.end.x - this.start.x, o = this.end.y - this.start.y, s = r * o - i * a;
		return s === 0 && (s = r * a + i * o, s > 0 && (r -= a, i -= o, s = r * a + i * o, s < 0 && (s = 0))), s < 0 ? -1 : +(s > 0);
	}
	equals(e) {
		return e != null && this.start.x === e.start.x && this.start.y === e.start.y && this.end.x === e.end.x && this.end.y === e.end.y;
	}
	clone() {
		return new e(this.start, this.end);
	}
	toJSON() {
		return {
			start: this.start.toJSON(),
			end: this.end.toJSON()
		};
	}
	serialize() {
		return [this.start.serialize(), this.end.serialize()].join(" ");
	}
}, Gu = class e extends Wu {
	static isEllipse(t) {
		return t != null && t instanceof e;
	}
	static create(t, n, r, i) {
		return t == null || typeof t == "number" ? new e(t, n, r, i) : e.parse(t);
	}
	static parse(t) {
		return e.isEllipse(t) ? t.clone() : Array.isArray(t) ? new e(t[0], t[1], t[2], t[3]) : new e(t.x, t.y, t.a, t.b);
	}
	static fromRect(t) {
		let n = t.center;
		return new e(n.x, n.y, t.width / 2, t.height / 2);
	}
	get center() {
		return new I(this.x, this.y);
	}
	constructor(e, t, n, r) {
		super(), this.x = e ?? 0, this.y = t ?? 0, this.a = n ?? 0, this.b = r ?? 0;
	}
	bbox() {
		return L.fromEllipse(this);
	}
	getCenter() {
		return this.center;
	}
	inflate(e, t) {
		let n = e, r = t ?? e;
		return this.a += 2 * n, this.b += 2 * r, this;
	}
	normalizedDistance(e, t) {
		let n = I.create(e, t), r = n.x - this.x, i = n.y - this.y, a = this.a, o = this.b;
		return r * r / (a * a) + i * i / (o * o);
	}
	containsPoint(e, t) {
		return this.normalizedDistance(e, t) <= 1;
	}
	intersectsWithLine(e) {
		let t = [], n = this.a, r = this.b, i = e.start, a = e.end, o = e.vector(), s = i.diff(new I(this.x, this.y)), c = new I(o.x / (n * n), o.y / (r * r)), l = new I(s.x / (n * n), s.y / (r * r)), u = o.dot(c), d = o.dot(l), f = s.dot(l) - 1, p = d * d - u * f;
		if (p < 0) return null;
		if (p > 0) {
			let e = Math.sqrt(p), n = (-d - e) / u, r = (-d + e) / u;
			if ((n < 0 || n > 1) && (r < 0 || r > 1)) return null;
			n >= 0 && n <= 1 && t.push(i.lerp(a, n)), r >= 0 && r <= 1 && t.push(i.lerp(a, r));
		} else {
			let e = -d / u;
			if (e >= 0 && e <= 1) t.push(i.lerp(a, e));
			else return null;
		}
		return t;
	}
	intersectsWithLineFromCenterToPoint(e, t = 0) {
		let n = I.clone(e);
		t && n.rotate(t, this.getCenter());
		let r = n.x - this.x, i = n.y - this.y, a;
		if (r === 0) return a = this.bbox().getNearestPointToPoint(n), t ? a.rotate(-t, this.getCenter()) : a;
		let o = i / r, s = o * o, c = this.a * this.a, l = this.b * this.b, u = Math.sqrt(1 / (1 / c + s / l));
		u = r < 0 ? -u : u;
		let d = o * u;
		return a = new I(this.x + u, this.y + d), t ? a.rotate(-t, this.getCenter()) : a;
	}
	tangentTheta(e) {
		let t = I.clone(e), n = t.x, r = t.y, i = this.a, a = this.b, o = this.bbox().center, s = o.x, c = o.y, l = n > o.x + i / 2, u = n < o.x - i / 2, d, f;
		return l || u ? (f = n > o.x ? r - 30 : r + 30, d = i * i / (n - s) - i * i * (r - c) * (f - c) / (a * a * (n - s)) + s) : (d = r > o.y ? n + 30 : n - 30, f = a * a / (r - c) - a * a * (n - s) * (d - s) / (i * i * (r - c)) + c), new I(d, f).theta(t);
	}
	scale(e, t) {
		return this.a *= e, this.b *= t, this;
	}
	rotate(t, n) {
		let r = L.fromEllipse(this);
		r.rotate(t, n);
		let i = e.fromRect(r);
		return this.a = i.a, this.b = i.b, this.x = i.x, this.y = i.y, this;
	}
	translate(e, t) {
		let n = I.create(e, t);
		return this.x += n.x, this.y += n.y, this;
	}
	equals(e) {
		return e != null && e.x === this.x && e.y === this.y && e.a === this.a && e.b === this.b;
	}
	clone() {
		return new e(this.x, this.y, this.a, this.b);
	}
	toJSON() {
		return {
			x: this.x,
			y: this.y,
			a: this.a,
			b: this.b
		};
	}
	serialize() {
		return `${this.x} ${this.y} ${this.a} ${this.b}`;
	}
}, Ku = /* @__PURE__ */ RegExp("^[\\s\\dLMCZz,.]*$");
function qu(e) {
	return typeof e == "string" && Ku.test(e);
}
function Ju(e, t) {
	return (e % t + t) % t;
}
function Yu(e, t, n, r, i) {
	if (!e || e.length === 0) return "";
	let a = [], o = e[e.length - 1], s = t != null && t > 0, c = t || 0;
	if (r && s) {
		e = e.slice();
		let t = e[0], n = new I(o.x + (t.x - o.x) / 2, o.y + (t.y - o.y) / 2);
		e.splice(0, 0, n);
	}
	let l = e[0], u = 1;
	for (n ? a.push("M", l.x, l.y) : a.push("L", l.x, l.y); u < (r ? e.length : e.length - 1);) {
		let t = e[Ju(u, e.length)], n = l.x - t.x, r = l.y - t.y;
		if (s && (n !== 0 || r !== 0) && (i == null || i.indexOf(u - 1) < 0)) {
			let i = Math.sqrt(n * n + r * r), o = n * Math.min(c, i / 2) / i, s = r * Math.min(c, i / 2) / i, l = t.x + o, d = t.y + s;
			a.push("L", l, d);
			let f = e[Ju(u + 1, e.length)];
			for (; u < e.length - 2 && Math.round(f.x - t.x) === 0 && Math.round(f.y - t.y) === 0;) f = e[Ju(u + 2, e.length)], u += 1;
			n = f.x - t.x, r = f.y - t.y, i = Math.max(1, Math.sqrt(n * n + r * r));
			let p = n * Math.min(c, i / 2) / i, m = r * Math.min(c, i / 2) / i, h = t.x + p, g = t.y + m;
			a.push("Q", t.x, t.y, h, g), t = new I(h, g);
		} else a.push("L", t.x, t.y);
		l = t, u += 1;
	}
	return r ? a.push("Z") : a.push("L", o.x, o.y), a.map((e) => typeof e == "string" ? e : +e.toFixed(3)).join(" ");
}
function Xu(e, t = {}) {
	let n = [];
	return e && e.length && e.forEach((e) => {
		Array.isArray(e) ? n.push({
			x: e[0],
			y: e[1]
		}) : n.push({
			x: e.x,
			y: e.y
		});
	}), Yu(n, t.round, t.initialMove == null || t.initialMove, t.close, t.exclude);
}
function Zu(e, t, n, r, i = 0, a = 0, o = 0, s, c) {
	if (n === 0 || r === 0) return [];
	s -= e, c -= t, n = Math.abs(n), r = Math.abs(r);
	let l = -s / 2, u = -c / 2, d = Math.cos(i * Math.PI / 180), f = Math.sin(i * Math.PI / 180), p = d * l + f * u, m = -1 * f * l + d * u, h = p * p, g = m * m, _ = n * n, v = r * r, y = h / _ + g / v, b;
	if (y > 1) n = Math.sqrt(y) * n, r = Math.sqrt(y) * r, b = 0;
	else {
		let e = 1;
		a === o && (e = -1), b = e * Math.sqrt((_ * v - _ * g - v * h) / (_ * g + v * h));
	}
	let x = b * n * m / r, S = -1 * b * r * p / n, C = d * x - f * S + s / 2, w = f * x + d * S + c / 2, T = Math.atan2((m - S) / r, (p - x) / n) - Math.atan2(0, 1), E = T >= 0 ? T : 2 * Math.PI + T;
	T = Math.atan2((-m - S) / r, (-p - x) / n) - Math.atan2((m - S) / r, (p - x) / n);
	let D = T >= 0 ? T : 2 * Math.PI + T;
	o === 0 && D > 0 ? D -= 2 * Math.PI : o !== 0 && D < 0 && (D += 2 * Math.PI);
	let ee = D * 2 / Math.PI, te = Math.ceil(ee < 0 ? -1 * ee : ee), ne = D / te, re = 8 / 3 * Math.sin(ne / 4) * Math.sin(ne / 4) / Math.sin(ne / 2), ie = d * n, ae = d * r, oe = f * n, se = f * r, ce = Math.cos(E), le = Math.sin(E), ue = -re * (ie * le + se * ce), de = -re * (oe * le - ae * ce), fe = 0, O = 0, k = [];
	for (let n = 0; n < te; n += 1) {
		E += ne, ce = Math.cos(E), le = Math.sin(E), fe = ie * ce - se * le + C, O = oe * ce + ae * le + w;
		let r = -re * (ie * le + se * ce), i = -re * (oe * le - ae * ce), a = n * 6;
		k[a] = Number(ue + e), k[a + 1] = Number(de + t), k[a + 2] = Number(fe - r + e), k[a + 3] = Number(O - i + t), k[a + 4] = Number(fe + e), k[a + 5] = Number(O + t), ue = fe + r, de = O + i;
	}
	return k.map((e) => +e.toFixed(2));
}
// node_modules/@antv/x6/es/geometry/polyline.js
var Qu = class e extends Wu {
	static isPolyline(t) {
		return t != null && t instanceof e;
	}
	static parse(t) {
		let n = t.trim();
		if (n === "") return new e();
		let r = [], i = n.split(/\s*,\s*|\s+/);
		for (let e = 0, t = i.length; e < t; e += 2) r.push({
			x: +i[e],
			y: +i[e + 1]
		});
		return new e(r);
	}
	get start() {
		return this.points[0] || null;
	}
	get end() {
		return this.points[this.points.length - 1] || null;
	}
	constructor(t) {
		if (super(), t != null) {
			if (typeof t == "string") return e.parse(t);
			this.points = t.map((e) => I.create(e));
		} else this.points = [];
	}
	scale(e, t, n = new I()) {
		return this.points.forEach((r) => r.scale(e, t, n)), this;
	}
	rotate(e, t) {
		return this.points.forEach((n) => n.rotate(e, t)), this;
	}
	translate(e, t) {
		let n = I.create(e, t);
		return this.points.forEach((e) => e.translate(n.x, n.y)), this;
	}
	round(e = 0) {
		return this.points.forEach((t) => t.round(e)), this;
	}
	bbox() {
		if (this.points.length === 0) return new L();
		let e = Infinity, t = -Infinity, n = Infinity, r = -Infinity, i = this.points;
		for (let a = 0, o = i.length; a < o; a += 1) {
			let o = i[a], s = o.x, c = o.y;
			s < e && (e = s), s > t && (t = s), c < n && (n = c), c > r && (r = c);
		}
		return new L(e, n, t - e, r - n);
	}
	closestPoint(e) {
		let t = this.closestPointLength(e);
		return this.pointAtLength(t);
	}
	closestPointLength(e) {
		let t = this.points, n = t.length;
		if (n === 0 || n === 1) return 0;
		let r = 0, i = 0, a = Infinity;
		for (let o = 0, s = n - 1; o < s; o += 1) {
			let n = new R(t[o], t[o + 1]), s = n.length(), c = n.closestPointNormalizedLength(e), l = n.pointAt(c).squaredDistance(e);
			l < a && (a = l, i = r + c * s), r += s;
		}
		return i;
	}
	closestPointNormalizedLength(e) {
		let t = this.length();
		return t === 0 ? 0 : this.closestPointLength(e) / t;
	}
	closestPointTangent(e) {
		let t = this.closestPointLength(e);
		return this.tangentAtLength(t);
	}
	containsPoint(e) {
		if (this.points.length === 0) return !1;
		let t = I.clone(e), n = t.x, r = t.y, i = this.points, a = i.length, o = a - 1, s = 0;
		for (let c = 0; c < a; c += 1) {
			let a = i[o], l = i[c];
			if (t.equals(a)) return !0;
			let u = new R(a, l);
			if (u.containsPoint(e)) return !0;
			if (r <= a.y && r > l.y || r > a.y && r <= l.y) {
				let t = a.x - n > l.x - n ? a.x - n : l.x - n;
				if (t >= 0) {
					let i = new R(e, new I(n + t, r));
					u.intersectsWithLine(i) && (s += 1);
				}
			}
			o = c;
		}
		return s % 2 == 1;
	}
	intersectsWithLine(e) {
		let t = [];
		for (let n = 0, r = this.points.length - 1; n < r; n += 1) {
			let r = this.points[n], i = this.points[n + 1], a = e.intersectsWithLine(new R(r, i));
			a && t.push(a);
		}
		return t.length > 0 ? t : null;
	}
	isDifferentiable() {
		for (let e = 0, t = this.points.length - 1; e < t; e += 1) {
			let t = this.points[e], n = this.points[e + 1];
			if (new R(t, n).isDifferentiable()) return !0;
		}
		return !1;
	}
	length() {
		let e = 0;
		for (let t = 0, n = this.points.length - 1; t < n; t += 1) {
			let n = this.points[t], r = this.points[t + 1];
			e += n.distance(r);
		}
		return e;
	}
	pointAt(e) {
		let t = this.points, n = t.length;
		if (n === 0) return null;
		if (n === 1 || e <= 0) return t[0].clone();
		if (e >= 1) return t[n - 1].clone();
		let r = this.length() * e;
		return this.pointAtLength(r);
	}
	pointAtLength(e) {
		let t = this.points, n = t.length;
		if (n === 0) return null;
		if (n === 1) return t[0].clone();
		let r = !0;
		e < 0 && (r = !1, e = -e);
		let i = 0;
		for (let a = 0, o = n - 1; a < o; a += 1) {
			let n = r ? a : o - 1 - a, s = t[n], c = t[n + 1], l = new R(s, c), u = s.distance(c);
			if (e <= i + u) return l.pointAtLength((r ? 1 : -1) * (e - i));
			i += u;
		}
		return (r ? t[n - 1] : t[0]).clone();
	}
	tangentAt(e) {
		let t = this.points.length;
		if (t === 0 || t === 1) return null;
		e < 0 && (e = 0), e > 1 && (e = 1);
		let n = this.length() * e;
		return this.tangentAtLength(n);
	}
	tangentAtLength(e) {
		let t = this.points, n = t.length;
		if (n === 0 || n === 1) return null;
		let r = !0;
		e < 0 && (r = !1, e = -e);
		let i, a = 0;
		for (let o = 0, s = n - 1; o < s; o += 1) {
			let n = r ? o : s - 1 - o, c = t[n], l = t[n + 1], u = new R(c, l), d = c.distance(l);
			if (u.isDifferentiable()) {
				if (e <= a + d) return u.tangentAtLength((r ? 1 : -1) * (e - a));
				i = u;
			}
			a += d;
		}
		if (i) {
			let e = +!!r;
			return i.tangentAt(e);
		}
		return null;
	}
	simplify(e = {}) {
		let t = this.points;
		if (t.length < 3) return this;
		let n = e.threshold || 0, r = 0;
		for (; t[r + 2];) {
			let e = r, i = r + 1, a = r + 2, o = t[e], s = t[i], c = t[a];
			new R(o, c).closestPoint(s).distance(s) <= n ? t.splice(i, 1) : r += 1;
		}
		return this;
	}
	toHull() {
		let t = this.points, n = t.length;
		if (n === 0) return new e();
		let r = t[0];
		for (let e = 1; e < n; e += 1) (t[e].y < r.y || t[e].y === r.y && t[e].x > r.x) && (r = t[e]);
		let i = [];
		for (let e = 0; e < n; e += 1) {
			let n = r.theta(t[e]);
			n === 0 && (n = 360), i.push([
				t[e],
				e,
				n
			]);
		}
		if (i.sort((e, t) => {
			let n = e[2] - t[2];
			return n === 0 && (n = t[1] - e[1]), n;
		}), i.length > 2) {
			let e = i[i.length - 1];
			i.unshift(e);
		}
		let a = {}, o = [], s = (e) => `${e[0].toString()}@${e[1]}`;
		for (; i.length !== 0;) {
			let e = i.pop(), t = e[0];
			if (a[s(e)]) continue;
			let n = !1;
			for (; !n;) if (o.length < 2) o.push(e), n = !0;
			else {
				let r = o.pop(), c = r[0], l = o.pop(), u = l[0], d = u.cross(c, t);
				if (d < 0) o.push(l), o.push(r), o.push(e), n = !0;
				else if (d === 0) {
					let e = 1e-10, n = c.angleBetween(u, t);
					Math.abs(n - 180) < e || c.equals(t) || u.equals(c) ? (a[s(r)] = c, o.push(l)) : Math.abs((n + 1) % 360 - 1) < e && (o.push(l), i.push(r));
				} else a[s(r)] = c, o.push(l);
			}
		}
		o.length > 2 && o.pop();
		let c, l = -1;
		for (let e = 0, t = o.length; e < t; e += 1) {
			let t = o[e][1];
			(c === void 0 || t < c) && (c = t, l = e);
		}
		let u = [];
		if (l > 0) {
			let e = o.slice(l), t = o.slice(0, l);
			u = e.concat(t);
		} else u = o;
		let d = [];
		for (let e = 0, t = u.length; e < t; e += 1) d.push(u[e][0]);
		return new e(d);
	}
	equals(e) {
		return e == null || e.points.length !== this.points.length ? !1 : e.points.every((e, t) => e.equals(this.points[t]));
	}
	clone() {
		return new e(this.points.map((e) => e.clone()));
	}
	toJSON() {
		return this.points.map((e) => e.toJSON());
	}
	serialize() {
		return this.points.map((e) => `${e.serialize()}`).join(" ");
	}
}, $u = class e extends Wu {
	static isCurve(t) {
		return t != null && t instanceof e;
	}
	static throughPoints(t) {
		if (t == null || Array.isArray(t) && t.length < 2) throw Error("At least 2 points are required");
		let n = td(t), r = [];
		for (let i = 0, a = n[0].length; i < a; i += 1) {
			let a = new I(n[0][i].x, n[0][i].y), o = new I(n[1][i].x, n[1][i].y);
			r.push(new e(t[i], a, o, t[i + 1]));
		}
		return r;
	}
	constructor(e, t, n, r) {
		super(), this.PRECISION = 3, this.start = I.create(e), this.controlPoint1 = I.create(t), this.controlPoint2 = I.create(n), this.end = I.create(r);
	}
	bbox() {
		let e = this.start, t = this.controlPoint1, n = this.controlPoint2, r = this.end, i = e.x, a = e.y, o = t.x, s = t.y, c = n.x, l = n.y, u = r.x, d = r.y, f = [], p = [], m = [[], []], h, g, _, v, y, b, x, S;
		for (let e = 0; e < 2; e += 1) if (e === 0 ? (g = 6 * i - 12 * o + 6 * c, h = -3 * i + 9 * o - 9 * c + 3 * u, _ = 3 * o - 3 * i) : (g = 6 * a - 12 * s + 6 * l, h = -3 * a + 9 * s - 9 * l + 3 * d, _ = 3 * s - 3 * a), Math.abs(h) < 1e-12) {
			if (Math.abs(g) < 1e-12) continue;
			v = -_ / g, v > 0 && v < 1 && p.push(v);
		} else x = g * g - 4 * _ * h, S = Math.sqrt(x), !(x < 0) && (y = (-g + S) / (2 * h), y > 0 && y < 1 && p.push(y), b = (-g - S) / (2 * h), b > 0 && b < 1 && p.push(b));
		let C, w, T, E = p.length, D = E;
		for (; E;) --E, v = p[E], T = 1 - v, C = T * T * T * i + 3 * T * T * v * o + 3 * T * v * v * c + v * v * v * u, m[0][E] = C, w = T * T * T * a + 3 * T * T * v * s + 3 * T * v * v * l + v * v * v * d, m[1][E] = w, f[E] = {
			X: C,
			Y: w
		};
		p[D] = 0, p[D + 1] = 1, f[D] = {
			X: i,
			Y: a
		}, f[D + 1] = {
			X: u,
			Y: d
		}, m[0][D] = i, m[1][D] = a, m[0][D + 1] = u, m[1][D + 1] = d, p.length = D + 2, m[0].length = D + 2, m[1].length = D + 2, f.length = D + 2;
		let ee = Math.min.apply(null, m[0]), te = Math.min.apply(null, m[1]), ne = Math.max.apply(null, m[0]), re = Math.max.apply(null, m[1]);
		return new L(ee, te, ne - ee, re - te);
	}
	closestPoint(e, t = {}) {
		return this.pointAtT(this.closestPointT(e, t));
	}
	closestPointLength(e, t = {}) {
		let n = this.getOptions(t);
		return this.lengthAtT(this.closestPointT(e, n), n);
	}
	closestPointNormalizedLength(e, t = {}) {
		let n = this.getOptions(t), r = this.closestPointLength(e, n);
		if (!r) return 0;
		let i = this.length(n);
		return i === 0 ? 0 : r / i;
	}
	closestPointT(e, t = {}) {
		let n = this.getPrecision(t), r = this.getDivisions(t), i = 10 ** -n, a = null, o = 0, s = 0, c = 0, l = 0, u = 0, d = null, f = r.length, p = f > 0 ? 1 / f : 0;
		for (r.forEach((t, n) => {
			let r = t.start.distance(e), i = t.end.distance(e), f = r + i;
			(d == null || f < d) && (a = t, o = n * p, s = (n + 1) * p, c = r, l = i, d = f, u = t.endpointDistance());
		});;) {
			let t = c ? Math.abs(c - l) / c : 0, n = l == null ? 0 : Math.abs(c - l) / l, r = t < i || n < i, d = !c || c < u * i, f = !l || l < u * i;
			if (r || d || f) return c <= l ? o : s;
			let m = a.divide(.5);
			p /= 2;
			let h = m[0].start.distance(e), g = m[0].end.distance(e), _ = h + g, v = m[1].start.distance(e), y = m[1].end.distance(e);
			_ <= v + y ? (a = m[0], s -= p, c = h, l = g) : (a = m[1], o += p, c = v, l = y);
		}
	}
	closestPointTangent(e, t = {}) {
		return this.tangentAtT(this.closestPointT(e, t));
	}
	containsPoint(e, t = {}) {
		return this.toPolyline(t).containsPoint(e);
	}
	divideAt(e, t = {}) {
		if (e <= 0) return this.divideAtT(0);
		if (e >= 1) return this.divideAtT(1);
		let n = this.tAt(e, t);
		return this.divideAtT(n);
	}
	divideAtLength(e, t = {}) {
		let n = this.tAtLength(e, t);
		return this.divideAtT(n);
	}
	divide(e) {
		return this.divideAtT(e);
	}
	divideAtT(t) {
		let n = this.start, r = this.controlPoint1, i = this.controlPoint2, a = this.end;
		if (t <= 0) return [new e(n, n, n, n), new e(n, r, i, a)];
		if (t >= 1) return [new e(n, r, i, a), new e(a, a, a, a)];
		let o = this.getSkeletonPoints(t), s = o.startControlPoint1, c = o.startControlPoint2, l = o.divider, u = o.dividerControlPoint1, d = o.dividerControlPoint2;
		return [new e(n, s, c, l), new e(l, u, d, a)];
	}
	endpointDistance() {
		return this.start.distance(this.end);
	}
	getSkeletonPoints(e) {
		let t = this.start, n = this.controlPoint1, r = this.controlPoint2, i = this.end;
		if (e <= 0) return {
			startControlPoint1: t.clone(),
			startControlPoint2: t.clone(),
			divider: t.clone(),
			dividerControlPoint1: n.clone(),
			dividerControlPoint2: r.clone()
		};
		if (e >= 1) return {
			startControlPoint1: n.clone(),
			startControlPoint2: r.clone(),
			divider: i.clone(),
			dividerControlPoint1: i.clone(),
			dividerControlPoint2: i.clone()
		};
		let a = new R(t, n).pointAt(e), o = new R(n, r).pointAt(e), s = new R(r, i).pointAt(e), c = new R(a, o).pointAt(e), l = new R(o, s).pointAt(e);
		return {
			startControlPoint1: a,
			startControlPoint2: c,
			divider: new R(c, l).pointAt(e),
			dividerControlPoint1: l,
			dividerControlPoint2: s
		};
	}
	getSubdivisions(t = {}) {
		let n = this.getPrecision(t), r = [new e(this.start, this.controlPoint1, this.controlPoint2, this.end)];
		if (n === 0) return r;
		let i = this.endpointDistance(), a = 10 ** -n, o = 0;
		for (;;) {
			o += 1;
			let e = [];
			r.forEach((t) => {
				let n = t.divide(.5);
				e.push(n[0], n[1]);
			});
			let t = e.reduce((e, t) => e + t.endpointDistance(), 0), n = t === 0 ? 0 : (t - i) / t;
			if (o > 1 && n < a) return e;
			r = e, i = t;
		}
	}
	length(e = {}) {
		return this.getDivisions(e).reduce((e, t) => e + t.endpointDistance(), 0);
	}
	lengthAtT(e, t = {}) {
		if (e <= 0) return 0;
		let n = t.precision === void 0 ? this.PRECISION : t.precision;
		return this.divide(e)[0].length({ precision: n });
	}
	pointAt(e, t = {}) {
		if (e <= 0) return this.start.clone();
		if (e >= 1) return this.end.clone();
		let n = this.tAt(e, t);
		return this.pointAtT(n);
	}
	pointAtLength(e, t = {}) {
		let n = this.tAtLength(e, t);
		return this.pointAtT(n);
	}
	pointAtT(e) {
		return e <= 0 ? this.start.clone() : e >= 1 ? this.end.clone() : this.getSkeletonPoints(e).divider;
	}
	isDifferentiable() {
		let e = this.start, t = this.controlPoint1, n = this.controlPoint2, r = this.end;
		return !(e.equals(t) && t.equals(n) && n.equals(r));
	}
	tangentAt(e, t = {}) {
		if (!this.isDifferentiable()) return null;
		e < 0 ? e = 0 : e > 1 && (e = 1);
		let n = this.tAt(e, t);
		return this.tangentAtT(n);
	}
	tangentAtLength(e, t = {}) {
		if (!this.isDifferentiable()) return null;
		let n = this.tAtLength(e, t);
		return this.tangentAtT(n);
	}
	tangentAtT(e) {
		if (!this.isDifferentiable()) return null;
		e < 0 && (e = 0), e > 1 && (e = 1);
		let t = this.getSkeletonPoints(e), n = t.startControlPoint2, r = t.dividerControlPoint1, i = t.divider, a = new R(n, r);
		return a.translate(i.x - n.x, i.y - n.y), a;
	}
	getPrecision(e = {}) {
		return e.precision == null ? this.PRECISION : e.precision;
	}
	getDivisions(e = {}) {
		if (e.subdivisions != null) return e.subdivisions;
		let t = this.getPrecision(e);
		return this.getSubdivisions({ precision: t });
	}
	getOptions(e = {}) {
		return {
			precision: this.getPrecision(e),
			subdivisions: this.getDivisions(e)
		};
	}
	tAt(e, t = {}) {
		if (e <= 0) return 0;
		if (e >= 1) return 1;
		let n = this.getOptions(t), r = this.length(n) * e;
		return this.tAtLength(r, n);
	}
	tAtLength(e, t = {}) {
		let n = !0;
		e < 0 && (n = !1, e = -e);
		let r = this.getPrecision(t), i = this.getDivisions(t), a = {
			precision: r,
			subdivisions: i
		}, o = null, s, c, l = 0, u = 0, d = 0, f = i.length, p = f > 0 ? 1 / f : 0;
		for (let t = 0; t < f; t += 1) {
			let r = n ? t : f - 1 - t, a = i[t], m = a.endpointDistance();
			if (e <= d + m) {
				o = a, s = r * p, c = (r + 1) * p, l = n ? e - d : m + d - e, u = n ? m + d - e : e - d;
				break;
			}
			d += m;
		}
		if (o == null) return +!!n;
		let m = this.length(a), h = 10 ** -r;
		for (;;) {
			let e;
			if (e = m === 0 ? 0 : l / m, e < h) return s;
			if (e = m === 0 ? 0 : u / m, e < h) return c;
			let t, n, r = o.divide(.5);
			p /= 2;
			let i = r[0].endpointDistance(), a = r[1].endpointDistance();
			l <= i ? (o = r[0], c -= p, t = l, n = i - t) : (o = r[1], s += p, t = l - i, n = a - t), l = t, u = n;
		}
	}
	toPoints(e = {}) {
		let t = this.getDivisions(e), n = [t[0].start.clone()];
		return t.forEach((e) => n.push(e.end.clone())), n;
	}
	toPolyline(e = {}) {
		return new Qu(this.toPoints(e));
	}
	scale(e, t, n) {
		return this.start.scale(e, t, n), this.controlPoint1.scale(e, t, n), this.controlPoint2.scale(e, t, n), this.end.scale(e, t, n), this;
	}
	rotate(e, t) {
		return this.start.rotate(e, t), this.controlPoint1.rotate(e, t), this.controlPoint2.rotate(e, t), this.end.rotate(e, t), this;
	}
	translate(e, t) {
		return typeof e == "number" ? (this.start.translate(e, t), this.controlPoint1.translate(e, t), this.controlPoint2.translate(e, t), this.end.translate(e, t)) : (this.start.translate(e), this.controlPoint1.translate(e), this.controlPoint2.translate(e), this.end.translate(e)), this;
	}
	equals(e) {
		return e != null && this.start.equals(e.start) && this.controlPoint1.equals(e.controlPoint1) && this.controlPoint2.equals(e.controlPoint2) && this.end.equals(e.end);
	}
	clone() {
		return new e(this.start, this.controlPoint1, this.controlPoint2, this.end);
	}
	toJSON() {
		return {
			start: this.start.toJSON(),
			controlPoint1: this.controlPoint1.toJSON(),
			controlPoint2: this.controlPoint2.toJSON(),
			end: this.end.toJSON()
		};
	}
	serialize() {
		return [
			this.start.serialize(),
			this.controlPoint1.serialize(),
			this.controlPoint2.serialize(),
			this.end.serialize()
		].join(" ");
	}
};
function ed(e) {
	let t = e.length, n = [], r = [], i = 2;
	n[0] = e[0] / i;
	for (let a = 1; a < t; a += 1) r[a] = 1 / i, i = (a < t - 1 ? 4 : 3.5) - r[a], n[a] = (e[a] - n[a - 1]) / i;
	for (let e = 1; e < t; e += 1) n[t - e - 1] -= r[t - e] * n[t - e];
	return n;
}
function td(e) {
	let t = e.map((e) => I.clone(e)), n = [], r = [], i = t.length - 1;
	if (i === 1) return n[0] = new I((2 * t[0].x + t[1].x) / 3, (2 * t[0].y + t[1].y) / 3), r[0] = new I(2 * n[0].x - t[0].x, 2 * n[0].y - t[0].y), [n, r];
	let a = [];
	for (let e = 1; e < i - 1; e += 1) a[e] = 4 * t[e].x + 2 * t[e + 1].x;
	a[0] = t[0].x + 2 * t[1].x, a[i - 1] = (8 * t[i - 1].x + t[i].x) / 2;
	let o = ed(a);
	for (let e = 1; e < i - 1; e += 1) a[e] = 4 * t[e].y + 2 * t[e + 1].y;
	a[0] = t[0].y + 2 * t[1].y, a[i - 1] = (8 * t[i - 1].y + t[i].y) / 2;
	let s = ed(a);
	for (let e = 0; e < i; e += 1) n.push(new I(o[e], s[e])), e < i - 1 ? r.push(new I(2 * t[e + 1].x - o[e + 1], 2 * t[e + 1].y - s[e + 1])) : r.push(new I((t[i].x + o[i - 1]) / 2, (t[i].y + s[i - 1]) / 2));
	return [n, r];
}
// node_modules/@antv/x6/es/geometry/path/segment.js
var nd = class extends Wu {
	constructor() {
		super(...arguments), this.isVisible = !0, this.isSegment = !0, this.isSubpathStart = !1;
	}
	get end() {
		return this.endPoint;
	}
	get start() {
		if (this.previousSegment == null) throw Error("Missing previous segment. (This segment cannot be the first segment of a path, or segment has not yet been added to a path.)");
		return this.previousSegment.end;
	}
	closestPointT(e, t) {
		if (this.closestPointNormalizedLength) return this.closestPointNormalizedLength(e);
		throw Error("Neither `closestPointT` nor `closestPointNormalizedLength` method is implemented.");
	}
	lengthAtT(e, t) {
		if (e <= 0) return 0;
		let n = this.length();
		return e >= 1 ? n : n * e;
	}
	divideAtT(e) {
		if (this.divideAt) return this.divideAt(e);
		throw Error("Neither `divideAtT` nor `divideAt` method is implemented.");
	}
	pointAtT(e) {
		if (this.pointAt) return this.pointAt(e);
		throw Error("Neither `pointAtT` nor `pointAt` method is implemented.");
	}
	tangentAtT(e) {
		if (this.tangentAt) return this.tangentAt(e);
		throw Error("Neither `tangentAtT` nor `tangentAt` method is implemented.");
	}
}, rd = class e extends nd {
	static create(...t) {
		let n = t.length, r = t[0];
		if (R.isLine(r)) return new e(r);
		if (I.isPointLike(r)) return n === 1 ? new e(r) : t.map((t) => new e(t));
		if (n === 2) return new e(+t[0], +t[1]);
		let i = [];
		for (let r = 0; r < n; r += 2) {
			let n = +t[r], a = +t[r + 1];
			i.push(new e(n, a));
		}
		return i;
	}
	constructor(e, t) {
		super(), this.endPoint = R.isLine(e) ? e.end.clone().round(2) : I.create(e, t).round(2);
	}
	get type() {
		return "L";
	}
	get line() {
		return new R(this.start, this.end);
	}
	bbox() {
		return this.line.bbox();
	}
	closestPoint(e) {
		return this.line.closestPoint(e);
	}
	closestPointLength(e) {
		return this.line.closestPointLength(e);
	}
	closestPointNormalizedLength(e) {
		return this.line.closestPointNormalizedLength(e);
	}
	closestPointTangent(e) {
		return this.line.closestPointTangent(e);
	}
	length() {
		return this.line.length();
	}
	divideAt(t) {
		let n = this.line.divideAt(t);
		return [new e(n[0]), new e(n[1])];
	}
	divideAtLength(t) {
		let n = this.line.divideAtLength(t);
		return [new e(n[0]), new e(n[1])];
	}
	getSubdivisions() {
		return [];
	}
	pointAt(e) {
		return this.line.pointAt(e);
	}
	pointAtLength(e) {
		return this.line.pointAtLength(e);
	}
	tangentAt(e) {
		return this.line.tangentAt(e);
	}
	tangentAtLength(e) {
		return this.line.tangentAtLength(e);
	}
	isDifferentiable() {
		return this.previousSegment != null && !this.start.equals(this.end);
	}
	clone() {
		return new e(this.end);
	}
	scale(e, t, n) {
		return this.end.scale(e, t, n), this;
	}
	rotate(e, t) {
		return this.end.rotate(e, t), this;
	}
	translate(e, t) {
		return typeof e == "number" ? this.end.translate(e, t) : this.end.translate(e), this;
	}
	equals(e) {
		return this.type === e.type && this.start.equals(e.start) && this.end.equals(e.end);
	}
	toJSON() {
		return {
			type: this.type,
			start: this.start.toJSON(),
			end: this.end.toJSON()
		};
	}
	serialize() {
		let e = this.end;
		return `${this.type} ${e.x} ${e.y}`;
	}
}, id = class e extends nd {
	static create() {
		return new e();
	}
	get end() {
		if (!this.subpathStartSegment) throw Error("Missing subpath start segment. (This segment needs a subpath start segment (e.g. MoveTo), or segment has not yet been added to a path.)");
		return this.subpathStartSegment.end;
	}
	get type() {
		return "Z";
	}
	get line() {
		return new R(this.start, this.end);
	}
	bbox() {
		return this.line.bbox();
	}
	closestPoint(e) {
		return this.line.closestPoint(e);
	}
	closestPointLength(e) {
		return this.line.closestPointLength(e);
	}
	closestPointNormalizedLength(e) {
		return this.line.closestPointNormalizedLength(e);
	}
	closestPointTangent(e) {
		return this.line.closestPointTangent(e);
	}
	length() {
		return this.line.length();
	}
	divideAt(e) {
		let t = this.line.divideAt(e);
		return [t[1].isDifferentiable() ? new rd(t[0]) : this.clone(), new rd(t[1])];
	}
	divideAtLength(e) {
		let t = this.line.divideAtLength(e);
		return [t[1].isDifferentiable() ? new rd(t[0]) : this.clone(), new rd(t[1])];
	}
	getSubdivisions() {
		return [];
	}
	pointAt(e) {
		return this.line.pointAt(e);
	}
	pointAtLength(e) {
		return this.line.pointAtLength(e);
	}
	tangentAt(e) {
		return this.line.tangentAt(e);
	}
	tangentAtLength(e) {
		return this.line.tangentAtLength(e);
	}
	isDifferentiable() {
		return !this.previousSegment || !this.subpathStartSegment ? !1 : !this.start.equals(this.end);
	}
	scale() {
		return this;
	}
	rotate() {
		return this;
	}
	translate() {
		return this;
	}
	equals(e) {
		return this.type === e.type && this.start.equals(e.start) && this.end.equals(e.end);
	}
	clone() {
		return new e();
	}
	toJSON() {
		return {
			type: this.type,
			start: this.start.toJSON(),
			end: this.end.toJSON()
		};
	}
	serialize() {
		return this.type;
	}
}, ad = class e extends nd {
	static create(...t) {
		let n = t.length, r = t[0];
		if (R.isLine(r) || $u.isCurve(r)) return new e(r);
		if (I.isPointLike(r)) {
			if (n === 1) return new e(r);
			let i = [];
			for (let r = 0; r < n; r += 1) r === 0 ? i.push(new e(t[r])) : i.push(new rd(t[r]));
			return i;
		}
		if (n === 2) return new e(+t[0], +t[1]);
		let i = [];
		for (let r = 0; r < n; r += 2) {
			let n = +t[r], a = +t[r + 1];
			r === 0 ? i.push(new e(n, a)) : i.push(new rd(n, a));
		}
		return i;
	}
	constructor(e, t) {
		super(), this.isVisible = !1, this.isSubpathStart = !0, this.endPoint = R.isLine(e) || $u.isCurve(e) ? e.end.clone().round(2) : I.create(e, t).round(2);
	}
	get start() {
		throw Error("Illegal access. Moveto segments should not need a start property.");
	}
	get type() {
		return "M";
	}
	bbox() {
		return null;
	}
	closestPoint() {
		return this.end.clone();
	}
	closestPointLength() {
		return 0;
	}
	closestPointNormalizedLength() {
		return 0;
	}
	closestPointT() {
		return 1;
	}
	closestPointTangent() {
		return null;
	}
	length() {
		return 0;
	}
	lengthAtT() {
		return 0;
	}
	divideAt() {
		return [this.clone(), this.clone()];
	}
	divideAtLength() {
		return [this.clone(), this.clone()];
	}
	getSubdivisions() {
		return [];
	}
	pointAt() {
		return this.end.clone();
	}
	pointAtLength() {
		return this.end.clone();
	}
	pointAtT() {
		return this.end.clone();
	}
	tangentAt() {
		return null;
	}
	tangentAtLength() {
		return null;
	}
	tangentAtT() {
		return null;
	}
	isDifferentiable() {
		return !1;
	}
	scale(e, t, n) {
		return this.end.scale(e, t, n), this;
	}
	rotate(e, t) {
		return this.end.rotate(e, t), this;
	}
	translate(e, t) {
		return typeof e == "number" ? this.end.translate(e, t) : this.end.translate(e), this;
	}
	clone() {
		return new e(this.end);
	}
	equals(e) {
		return this.type === e.type && this.end.equals(e.end);
	}
	toJSON() {
		return {
			type: this.type,
			end: this.end.toJSON()
		};
	}
	serialize() {
		let e = this.end;
		return `${this.type} ${e.x} ${e.y}`;
	}
}, od = class e extends nd {
	static create(...t) {
		let n = t.length, r = t[0];
		if ($u.isCurve(r)) return new e(r);
		if (I.isPointLike(r)) {
			if (n === 3) return new e(t[0], t[1], t[2]);
			let r = [];
			for (let i = 0; i < n; i += 3) r.push(new e(t[i], t[i + 1], t[i + 2]));
			return r;
		}
		if (n === 6) return new e(t[0], t[1], t[2], t[3], t[4], t[5]);
		let i = [];
		for (let r = 0; r < n; r += 6) i.push(new e(t[r], t[r + 1], t[r + 2], t[r + 3], t[r + 4], t[r + 5]));
		return i;
	}
	constructor(e, t, n, r, i, a) {
		super(), $u.isCurve(e) ? (this.controlPoint1 = e.controlPoint1.clone().round(2), this.controlPoint2 = e.controlPoint2.clone().round(2), this.endPoint = e.end.clone().round(2)) : typeof e == "number" ? (this.controlPoint1 = new I(e, t).round(2), this.controlPoint2 = new I(n, r).round(2), this.endPoint = new I(i, a).round(2)) : (this.controlPoint1 = I.create(e).round(2), this.controlPoint2 = I.create(t).round(2), this.endPoint = I.create(n).round(2));
	}
	get type() {
		return "C";
	}
	get curve() {
		return new $u(this.start, this.controlPoint1, this.controlPoint2, this.end);
	}
	bbox() {
		return this.curve.bbox();
	}
	closestPoint(e) {
		return this.curve.closestPoint(e);
	}
	closestPointLength(e) {
		return this.curve.closestPointLength(e);
	}
	closestPointNormalizedLength(e) {
		return this.curve.closestPointNormalizedLength(e);
	}
	closestPointTangent(e) {
		return this.curve.closestPointTangent(e);
	}
	length() {
		return this.curve.length();
	}
	divideAt(t, n = {}) {
		let r = this.curve.divideAt(t, n);
		return [new e(r[0]), new e(r[1])];
	}
	divideAtLength(t, n = {}) {
		let r = this.curve.divideAtLength(t, n);
		return [new e(r[0]), new e(r[1])];
	}
	divideAtT(t) {
		let n = this.curve.divideAtT(t);
		return [new e(n[0]), new e(n[1])];
	}
	getSubdivisions() {
		return [];
	}
	pointAt(e) {
		return this.curve.pointAt(e);
	}
	pointAtLength(e) {
		return this.curve.pointAtLength(e);
	}
	tangentAt(e) {
		return this.curve.tangentAt(e);
	}
	tangentAtLength(e) {
		return this.curve.tangentAtLength(e);
	}
	isDifferentiable() {
		if (!this.previousSegment) return !1;
		let e = this.start, t = this.controlPoint1, n = this.controlPoint2, r = this.end;
		return !(e.equals(t) && t.equals(n) && n.equals(r));
	}
	scale(e, t, n) {
		return this.controlPoint1.scale(e, t, n), this.controlPoint2.scale(e, t, n), this.end.scale(e, t, n), this;
	}
	rotate(e, t) {
		return this.controlPoint1.rotate(e, t), this.controlPoint2.rotate(e, t), this.end.rotate(e, t), this;
	}
	translate(e, t) {
		return typeof e == "number" ? (this.controlPoint1.translate(e, t), this.controlPoint2.translate(e, t), this.end.translate(e, t)) : (this.controlPoint1.translate(e), this.controlPoint2.translate(e), this.end.translate(e)), this;
	}
	equals(e) {
		return this.start.equals(e.start) && this.end.equals(e.end) && this.controlPoint1.equals(e.controlPoint1) && this.controlPoint2.equals(e.controlPoint2);
	}
	clone() {
		return new e(this.controlPoint1, this.controlPoint2, this.end);
	}
	toJSON() {
		return {
			type: this.type,
			start: this.start.toJSON(),
			controlPoint1: this.controlPoint1.toJSON(),
			controlPoint2: this.controlPoint2.toJSON(),
			end: this.end.toJSON()
		};
	}
	serialize() {
		let e = this.controlPoint1, t = this.controlPoint2, n = this.end;
		return [
			this.type,
			e.x,
			e.y,
			t.x,
			t.y,
			n.x,
			n.y
		].join(" ");
	}
};
// node_modules/@antv/x6/es/geometry/path/normalize.js
function sd(e, t, n) {
	return {
		x: e * Math.cos(n) - t * Math.sin(n),
		y: e * Math.sin(n) + t * Math.cos(n)
	};
}
function cd(e, t, n, r, i, a) {
	let o = 1 / 3, s = 2 / 3;
	return [
		o * e + s * n,
		o * t + s * r,
		o * i + s * n,
		o * a + s * r,
		i,
		a
	];
}
function ld(e, t, n, r, i, a, o, s, c, l) {
	let u = Math.PI * 120 / 180, d = Math.PI / 180 * (+i || 0), f = [], p, m, h, g, _;
	if (l) m = l[0], h = l[1], g = l[2], _ = l[3];
	else {
		p = sd(e, t, -d), e = p.x, t = p.y, p = sd(s, c, -d), s = p.x, c = p.y;
		let i = (e - s) / 2, l = (t - c) / 2, u = i * i / (n * n) + l * l / (r * r);
		u > 1 && (u = Math.sqrt(u), n = u * n, r = u * r);
		let f = n * n, v = r * r, y = (a === o ? -1 : 1) * Math.sqrt(Math.abs((f * v - f * l * l - v * i * i) / (f * l * l + v * i * i)));
		g = y * n * l / r + (e + s) / 2, _ = y * -r * i / n + (t + c) / 2, m = Math.asin((t - _) / r), h = Math.asin((c - _) / r), m = e < g ? Math.PI - m : m, h = s < g ? Math.PI - h : h, m < 0 && (m = Math.PI * 2 + m), h < 0 && (h = Math.PI * 2 + h), o && m > h && (m -= Math.PI * 2), !o && h > m && (h -= Math.PI * 2);
	}
	let v = h - m;
	if (Math.abs(v) > u) {
		let e = h, t = s, a = c;
		h = m + u * (o && h > m ? 1 : -1), s = g + n * Math.cos(h), c = _ + r * Math.sin(h), f = ld(s, c, n, r, i, 0, o, t, a, [
			h,
			e,
			g,
			_
		]);
	}
	v = h - m;
	let y = Math.cos(m), b = Math.sin(m), x = Math.cos(h), S = Math.sin(h), C = Math.tan(v / 4), w = 4 / 3 * (n * C), T = 4 / 3 * (r * C), E = [e, t], D = [e + w * b, t - T * y], ee = [s + w * S, c - T * x], te = [s, c];
	if (D[0] = 2 * E[0] - D[0], D[1] = 2 * E[1] - D[1], l) return [
		D,
		ee,
		te
	].concat(f);
	{
		f = [
			D,
			ee,
			te
		].concat(f).join().split(",");
		let e = [], t = f.length;
		for (let n = 0; n < t; n += 1) e[n] = n % 2 ? sd(+f[n - 1], +f[n], d).y : sd(+f[n], +f[n + 1], d).x;
		return e;
	}
}
function ud(e) {
	if (!e) return null;
	let t = "	\n\v\f\r \xA0 ᠎             　\u2028\u2029", n = RegExp(`([a-z])[${t},]*((-?\\d*\\.?\\d*(?:e[\\-+]?\\d+)?[${t}]*,?[${t}]*)+)`, "ig"), r = RegExp(`(-?\\d*\\.?\\d*(?:e[\\-+]?\\d+)?)[${t}]*,?[${t}]*`, "ig"), i = {
		a: 7,
		c: 6,
		h: 1,
		l: 2,
		m: 2,
		q: 4,
		s: 4,
		t: 2,
		v: 1,
		z: 0
	}, a = [];
	return e.replace(n, (e, t, n) => {
		let o = [], s = t.toLowerCase();
		n.replace(r, (e, t) => (t && o.push(+t), e)), s === "m" && o.length > 2 && (a.push([t, ...o.splice(0, 2)]), s = "l", t = t === "m" ? "l" : "L");
		let c = i[s];
		for (; o.length >= c && (a.push([t, ...o.splice(0, c)]), c););
		return e;
	}), a;
}
function dd(e) {
	let t = ud(e);
	if (!t || !t.length) return [[
		"M",
		0,
		0
	]];
	let n = 0, r = 0, i = 0, a = 0, o = [];
	for (let e = 0, s = t.length; e < s; e += 1) {
		let s = [];
		o.push(s);
		let c = t[e], l = c[0];
		if (l !== l.toUpperCase()) switch (s[0] = l.toUpperCase(), s[0]) {
			case "A":
				s[1] = c[1], s[2] = c[2], s[3] = c[3], s[4] = c[4], s[5] = c[5], s[6] = +c[6] + n, s[7] = +c[7] + r;
				break;
			case "V":
				s[1] = +c[1] + r;
				break;
			case "H":
				s[1] = +c[1] + n;
				break;
			case "M":
				i = +c[1] + n, a = +c[2] + r;
				for (let e = 1, t = c.length; e < t; e += 1) s[e] = +c[e] + (e % 2 ? n : r);
				break;
			default: for (let e = 1, t = c.length; e < t; e += 1) s[e] = +c[e] + (e % 2 ? n : r);
		}
		else for (let e = 0, t = c.length; e < t; e += 1) s[e] = c[e];
		switch (s[0]) {
			case "Z":
				n = +i, r = +a;
				break;
			case "H":
				n = s[1];
				break;
			case "V":
				r = s[1];
				break;
			case "M":
				i = s[s.length - 2], a = s[s.length - 1], n = s[s.length - 2], r = s[s.length - 1];
				break;
			default: n = s[s.length - 2], r = s[s.length - 1];
		}
	}
	return o;
}
function fd(e) {
	let t = dd(e), n = {
		x: 0,
		y: 0,
		bx: 0,
		by: 0,
		X: 0,
		Y: 0,
		qx: null,
		qy: null
	};
	function r(e, t, n) {
		let r, i;
		if (!e) return [
			"C",
			t.x,
			t.y,
			t.x,
			t.y,
			t.x,
			t.y
		];
		switch (e[0] in {
			T: 1,
			Q: 1
		} || (t.qx = null, t.qy = null), e[0]) {
			case "M":
				t.X = e[1], t.Y = e[2];
				break;
			case "A": return parseFloat(e[1]) === 0 || parseFloat(e[2]) === 0 ? [
				"L",
				e[6],
				e[7]
			] : ["C"].concat(ld.apply(0, [t.x, t.y].concat(e.slice(1))));
			case "S": return n === "C" || n === "S" ? (r = t.x * 2 - t.bx, i = t.y * 2 - t.by) : (r = t.x, i = t.y), [
				"C",
				r,
				i
			].concat(e.slice(1));
			case "T": return n === "Q" || n === "T" ? (t.qx = t.x * 2 - t.qx, t.qy = t.y * 2 - t.qy) : (t.qx = t.x, t.qy = t.y), ["C"].concat(cd(t.x, t.y, t.qx, t.qy, e[1], e[2]));
			case "Q": return t.qx = e[1], t.qy = e[2], ["C"].concat(cd(t.x, t.y, e[1], e[2], e[3], e[4]));
			case "H": return ["L"].concat(e[1], t.y);
			case "V": return ["L"].concat(t.x, e[1]);
		}
		return e;
	}
	function i(e, n) {
		if (e[n].length > 7) {
			e[n].shift();
			let r = e[n];
			for (; r.length;) a[n] = "A", n += 1, e.splice(n, 0, ["C"].concat(r.splice(0, 6)));
			e.splice(n, 1), s = t.length;
		}
	}
	let a = [], o = "", s = t.length;
	for (let e = 0; e < s; e += 1) {
		let s = "";
		t[e] && (s = t[e][0]), s !== "C" && (a[e] = s, e > 0 && (o = a[e - 1])), t[e] = r(t[e], n, o), a[e] !== "A" && s === "C" && (a[e] = "C"), i(t, e);
		let c = t[e], l = c.length;
		n.x = c[l - 2], n.y = c[l - 1], n.bx = parseFloat(c[l - 4]) || n.x, n.by = parseFloat(c[l - 3]) || n.y;
	}
	return t[0][0] && t[0][0] === "M" || t.unshift([
		"M",
		0,
		0
	]), t;
}
function pd(e) {
	return fd(e).map((e) => e.map((e) => typeof e == "string" ? e : Ru(e, 2))).join(",").split(",").join(" ");
}
// node_modules/@antv/x6/es/geometry/path/path.js
var z = class e extends Wu {
	static isPath(t) {
		return t != null && t instanceof e;
	}
	static parse(t) {
		if (!t) return new e();
		let n = new e(), r = pd(t).match(/(?:[a-zA-Z] *)(?:(?:-?\d+(?:\.\d+)?(?:e[-+]?\d+)? *,? *)|(?:-?\.\d+ *,? *))+|(?:[a-zA-Z] *)(?! |\d|-|\.)/g);
		if (r != null) for (let t = 0, i = r.length; t < i; t += 1) {
			let i = r[t].match(/(?:[a-zA-Z])|(?:(?:-?\d+(?:\.\d+)?(?:e[-+]?\d+)?))|(?:(?:-?\.\d+))/g);
			if (i != null) {
				let t = i[0], r = i.slice(1).map((e) => +e), a = e.createSegment.call(null, t, ...r);
				n.appendSegment(a);
			}
		}
		return n;
	}
	static createSegment(e, ...t) {
		if (e === "M") return ad.create.call(null, ...t);
		if (e === "L") return rd.create.call(null, ...t);
		if (e === "C") return od.create.call(null, ...t);
		if (e === "z" || e === "Z") return id.create();
		throw Error(`Invalid path segment type "${e}"`);
	}
	constructor(t) {
		if (super(), this.PRECISION = 3, this.segments = [], Array.isArray(t)) {
			if (R.isLine(t[0]) || $u.isCurve(t[0])) {
				let n = null;
				t.forEach((t, r) => {
					r === 0 && this.appendSegment(e.createSegment("M", t.start)), n != null && !n.end.equals(t.start) && this.appendSegment(e.createSegment("M", t.start)), R.isLine(t) ? this.appendSegment(e.createSegment("L", t.end)) : $u.isCurve(t) && this.appendSegment(e.createSegment("C", t.controlPoint1, t.controlPoint2, t.end)), n = t;
				});
			} else t.forEach((e) => {
				e.isSegment && this.appendSegment(e);
			});
		} else t != null && (R.isLine(t) ? (this.appendSegment(e.createSegment("M", t.start)), this.appendSegment(e.createSegment("L", t.end))) : $u.isCurve(t) ? (this.appendSegment(e.createSegment("M", t.start)), this.appendSegment(e.createSegment("C", t.controlPoint1, t.controlPoint2, t.end))) : Qu.isPolyline(t) ? t.points && t.points.length && t.points.forEach((t, n) => {
			let r = n === 0 ? e.createSegment("M", t) : e.createSegment("L", t);
			this.appendSegment(r);
		}) : t.isSegment && this.appendSegment(t));
	}
	get start() {
		let e = this.segments, t = e.length;
		if (t === 0) return null;
		for (let n = 0; n < t; n += 1) {
			let t = e[n];
			if (t.isVisible) return t.start;
		}
		return e[t - 1].end;
	}
	get end() {
		let e = this.segments, t = e.length;
		if (t === 0) return null;
		for (let n = t - 1; n >= 0; --n) {
			let t = e[n];
			if (t.isVisible) return t.end;
		}
		return e[t - 1].end;
	}
	moveTo(...e) {
		return this.appendSegment(ad.create.call(null, ...e));
	}
	lineTo(...e) {
		return this.appendSegment(rd.create.call(null, ...e));
	}
	curveTo(...e) {
		return this.appendSegment(od.create.call(null, ...e));
	}
	arcTo(e, t, n, r, i, a, o) {
		let s = this.end || new I(), c = typeof a == "number" ? Zu(s.x, s.y, e, t, n, r, i, a, o) : Zu(s.x, s.y, e, t, n, r, i, a.x, a.y);
		if (c != null) for (let e = 0, t = c.length; e < t; e += 6) this.curveTo(c[e], c[e + 1], c[e + 2], c[e + 3], c[e + 4], c[e + 5]);
		return this;
	}
	quadTo(t, n, r, i) {
		let a = this.end || new I(), o = [
			"M",
			a.x,
			a.y
		];
		if (typeof t == "number") o.push("Q", t, n, r, i);
		else {
			let e = n;
			o.push("Q", t.x, t.y, e.x, e.y);
		}
		let s = e.parse(o.join(" "));
		return this.appendSegment(s.segments.slice(1)), this;
	}
	close() {
		return this.appendSegment(id.create());
	}
	drawPoints(t, n = {}) {
		let r = Xu(t, n), i = e.parse(r);
		i && i.segments && this.appendSegment(i.segments);
	}
	bbox() {
		let e = this.segments, t = e.length;
		if (t === 0) return null;
		let n;
		for (let r = 0; r < t; r += 1) {
			let t = e[r];
			if (t.isVisible) {
				let e = t.bbox();
				e != null && (n = n ? n.union(e) : e);
			}
		}
		if (n != null) return n;
		let r = e[t - 1];
		return new L(r.end.x, r.end.y, 0, 0);
	}
	appendSegment(e) {
		let t = this.segments.length, n = t === 0 ? null : this.segments[t - 1], r;
		if (Array.isArray(e)) for (let t = 0, i = e.length; t < i; t += 1) {
			let i = e[t];
			r = this.prepareSegment(i, n, null), this.segments.push(r), n = r;
		}
		else e != null && e.isSegment && (r = this.prepareSegment(e, n, null), this.segments.push(r));
		return this;
	}
	insertSegment(e, t) {
		let n = this.segments.length;
		if (e < 0 && (e = n + e + 1), e > n || e < 0) throw Error("Index out of range.");
		let r, i = null, a = null;
		if (n !== 0 && (e >= 1 ? (i = this.segments[e - 1], a = i.nextSegment) : (i = null, a = this.segments[0])), !Array.isArray(t)) r = this.prepareSegment(t, i, a), this.segments.splice(e, 0, r);
		else for (let n = 0, o = t.length; n < o; n += 1) {
			let o = t[n];
			r = this.prepareSegment(o, i, a), this.segments.splice(e + n, 0, r), i = r;
		}
		return this;
	}
	removeSegment(e) {
		let t = this.fixIndex(e), n = this.segments.splice(t, 1)[0], r = n.previousSegment, i = n.nextSegment;
		return r && (r.nextSegment = i), i && (i.previousSegment = r), n.isSubpathStart && i && this.updateSubpathStartSegment(i), n;
	}
	replaceSegment(e, t) {
		let n = this.fixIndex(e), r, i = this.segments[n], a = i.previousSegment, o = i.nextSegment, s = i.isSubpathStart;
		if (!Array.isArray(t)) r = this.prepareSegment(t, a, o), this.segments.splice(n, 1, r), s && r.isSubpathStart && (s = !1);
		else {
			this.segments.splice(e, 1);
			for (let n = 0, i = t.length; n < i; n += 1) {
				let i = t[n];
				r = this.prepareSegment(i, a, o), this.segments.splice(e + n, 0, r), a = r, s && r.isSubpathStart && (s = !1);
			}
		}
		s && o && this.updateSubpathStartSegment(o);
	}
	getSegment(e) {
		let t = this.fixIndex(e);
		return this.segments[t];
	}
	fixIndex(e) {
		let t = this.segments.length;
		if (t === 0) throw Error("Path has no segments.");
		let n = e;
		for (; n < 0;) n = t + n;
		if (n >= t || n < 0) throw Error("Index out of range.");
		return n;
	}
	segmentAt(e, t = {}) {
		let n = this.segmentIndexAt(e, t);
		return n ? this.getSegment(n) : null;
	}
	segmentAtLength(e, t = {}) {
		let n = this.segmentIndexAtLength(e, t);
		return n ? this.getSegment(n) : null;
	}
	segmentIndexAt(e, t = {}) {
		if (this.segments.length === 0) return null;
		let n = Bu(e, 0, 1), r = this.getOptions(t), i = this.length(r) * n;
		return this.segmentIndexAtLength(i, r);
	}
	segmentIndexAtLength(e, t = {}) {
		let n = this.segments.length;
		if (n === 0) return null;
		let r = !0;
		e < 0 && (r = !1, e = -e);
		let i = this.getPrecision(t), a = this.getSubdivisions(t), o = 0, s = null;
		for (let t = 0; t < n; t += 1) {
			let c = r ? t : n - 1 - t, l = this.segments[c], u = a[c], d = l.length({
				precision: i,
				subdivisions: u
			});
			if (l.isVisible) {
				if (e <= o + d) return c;
				s = c;
			}
			o += d;
		}
		return s;
	}
	getSegmentSubdivisions(e = {}) {
		let t = this.getPrecision(e), n = [];
		for (let e = 0, r = this.segments.length; e < r; e += 1) {
			let r = this.segments[e].getSubdivisions({ precision: t });
			n.push(r);
		}
		return n;
	}
	updateSubpathStartSegment(e) {
		let t = e.previousSegment, n = e;
		for (; n && !n.isSubpathStart;) t == null ? n.subpathStartSegment = null : n.subpathStartSegment = t.subpathStartSegment, t = n, n = n.nextSegment;
	}
	prepareSegment(e, t, n) {
		e.previousSegment = t, e.nextSegment = n, t != null && (t.nextSegment = e), n != null && (n.previousSegment = e);
		let r = e;
		return e.isSubpathStart && (e.subpathStartSegment = e, r = n), r != null && this.updateSubpathStartSegment(r), e;
	}
	closestPoint(e, t = {}) {
		let n = this.closestPointT(e, t);
		return n ? this.pointAtT(n) : null;
	}
	closestPointLength(e, t = {}) {
		let n = this.getOptions(t), r = this.closestPointT(e, n);
		return r ? this.lengthAtT(r, n) : 0;
	}
	closestPointNormalizedLength(e, t = {}) {
		let n = this.getOptions(t), r = this.closestPointLength(e, n);
		if (r === 0) return 0;
		let i = this.length(n);
		return i === 0 ? 0 : r / i;
	}
	closestPointT(e, t = {}) {
		if (this.segments.length === 0) return null;
		let n = this.getPrecision(t), r = this.getSubdivisions(t), i, a = Infinity;
		for (let t = 0, o = this.segments.length; t < o; t += 1) {
			let o = this.segments[t], s = r[t];
			if (o.isVisible) {
				let r = o.closestPointT(e, {
					precision: n,
					subdivisions: s
				}), c = Uu(o.pointAtT(r), e);
				c < a && (i = {
					segmentIndex: t,
					value: r
				}, a = c);
			}
		}
		return i || {
			segmentIndex: this.segments.length - 1,
			value: 1
		};
	}
	closestPointTangent(e, t = {}) {
		if (this.segments.length === 0) return null;
		let n = this.getPrecision(t), r = this.getSubdivisions(t), i, a = Infinity;
		for (let t = 0, o = this.segments.length; t < o; t += 1) {
			let o = this.segments[t], s = r[t];
			if (o.isDifferentiable()) {
				let t = o.closestPointT(e, {
					precision: n,
					subdivisions: s
				}), r = Uu(o.pointAtT(t), e);
				r < a && (i = o.tangentAtT(t), a = r);
			}
		}
		return i || null;
	}
	containsPoint(e, t = {}) {
		let n = this.toPolylines(t);
		if (!n) return !1;
		let r = 0;
		for (let t = 0, i = n.length; t < i; t += 1) n[t].containsPoint(e) && (r += 1);
		return r % 2 == 1;
	}
	pointAt(e, t = {}) {
		if (this.segments.length === 0) return null;
		if (e <= 0) return this.start.clone();
		if (e >= 1) return this.end.clone();
		let n = this.getOptions(t), r = this.length(n) * e;
		return this.pointAtLength(r, n);
	}
	pointAtLength(e, t = {}) {
		if (this.segments.length === 0) return null;
		if (e === 0) return this.start.clone();
		let n = !0;
		e < 0 && (n = !1, e = -e);
		let r = this.getPrecision(t), i = this.getSubdivisions(t), a, o = 0;
		for (let t = 0, s = this.segments.length; t < s; t += 1) {
			let c = n ? t : s - 1 - t, l = this.segments[c], u = i[c], d = l.length({
				precision: r,
				subdivisions: u
			});
			if (l.isVisible) {
				if (e <= o + d) return l.pointAtLength((n ? 1 : -1) * (e - o), {
					precision: r,
					subdivisions: u
				});
				a = l;
			}
			o += d;
		}
		return a ? n ? a.end : a.start : this.segments[this.segments.length - 1].end.clone();
	}
	pointAtT(e) {
		let t = this.segments, n = t.length;
		if (n === 0) return null;
		let r = e.segmentIndex;
		if (r < 0) return t[0].pointAtT(0);
		if (r >= n) return t[n - 1].pointAtT(1);
		let i = Bu(e.value, 0, 1);
		return t[r].pointAtT(i);
	}
	divideAt(e, t = {}) {
		if (this.segments.length === 0) return null;
		let n = Bu(e, 0, 1), r = this.getOptions(t), i = this.length(r) * n;
		return this.divideAtLength(i, r);
	}
	divideAtLength(t, n = {}) {
		if (this.segments.length === 0) return null;
		let r = !0;
		t < 0 && (r = !1, t = -t);
		let i = this.getPrecision(n), a = this.getSubdivisions(n), o = 0, s, c, l, u, d;
		for (let e = 0, n = this.segments.length; e < n; e += 1) {
			let d = r ? e : n - 1 - e, f = this.getSegment(d), p = {
				precision: i,
				subdivisions: a[d]
			}, m = f.length(p);
			if (f.isDifferentiable() && (l = f, u = d, t <= o + m)) {
				c = d, s = f.divideAtLength((r ? 1 : -1) * (t - o), p);
				break;
			}
			o += m;
		}
		if (!l) return null;
		s || (c = u, d = +!!r, s = l.divideAtT(d));
		let f = this.clone(), p = c;
		f.replaceSegment(p, s);
		let m = p, h = p + 1, g = p + 2;
		s[0].isDifferentiable() || (f.removeSegment(m), --h, --g);
		let _ = f.getSegment(h).start;
		f.insertSegment(h, e.createSegment("M", _)), g += 1, s[1].isDifferentiable() || (f.removeSegment(g - 1), --g);
		let v = g - m - 1;
		for (let t = g, n = f.segments.length; t < n; t += 1) {
			let n = this.getSegment(t - v), r = f.getSegment(t);
			if (r.type === "Z" && !n.subpathStartSegment.end.equals(r.subpathStartSegment.end)) {
				let r = e.createSegment("L", n.end);
				f.replaceSegment(t, r);
			}
		}
		return [new e(f.segments.slice(0, h)), new e(f.segments.slice(h))];
	}
	intersectsWithLine(e, t = {}) {
		let n = this.toPolylines(t);
		if (n == null) return null;
		let r = null;
		for (let t = 0, i = n.length; t < i; t += 1) {
			let i = n[t], a = e.intersect(i);
			a && (r ?? (r = []), Array.isArray(a) ? r.push(...a) : r.push(a));
		}
		return r;
	}
	isDifferentiable() {
		for (let e = 0, t = this.segments.length; e < t; e += 1) if (this.segments[e].isDifferentiable()) return !0;
		return !1;
	}
	isValid() {
		let e = this.segments;
		return e.length === 0 || e[0].type === "M";
	}
	length(e = {}) {
		if (this.segments.length === 0) return 0;
		let t = this.getSubdivisions(e), n = 0;
		for (let e = 0, r = this.segments.length; e < r; e += 1) {
			let r = this.segments[e], i = t[e];
			n += r.length({ subdivisions: i });
		}
		return n;
	}
	lengthAtT(e, t = {}) {
		let n = this.segments.length;
		if (n === 0) return 0;
		let r = e.segmentIndex;
		if (r < 0) return 0;
		let i = Bu(e.value, 0, 1);
		r >= n && (r = n - 1, i = 1);
		let a = this.getPrecision(t), o = this.getSubdivisions(t), s = 0;
		for (let e = 0; e < r; e += 1) {
			let t = this.segments[e], n = o[e];
			s += t.length({
				precision: a,
				subdivisions: n
			});
		}
		let c = this.segments[r], l = o[r];
		return s += c.lengthAtT(i, {
			precision: a,
			subdivisions: l
		}), s;
	}
	tangentAt(e, t = {}) {
		if (this.segments.length === 0) return null;
		let n = Bu(e, 0, 1), r = this.getOptions(t), i = this.length(r) * n;
		return this.tangentAtLength(i, r);
	}
	tangentAtLength(e, t = {}) {
		if (this.segments.length === 0) return null;
		let n = !0;
		e < 0 && (n = !1, e = -e);
		let r = this.getPrecision(t), i = this.getSubdivisions(t), a, o = 0;
		for (let t = 0, s = this.segments.length; t < s; t += 1) {
			let c = n ? t : s - 1 - t, l = this.segments[c], u = i[c], d = l.length({
				precision: r,
				subdivisions: u
			});
			if (l.isDifferentiable()) {
				if (e <= o + d) return l.tangentAtLength((n ? 1 : -1) * (e - o), {
					precision: r,
					subdivisions: u
				});
				a = l;
			}
			o += d;
		}
		if (a) {
			let e = +!!n;
			return a.tangentAtT(e);
		}
		return null;
	}
	tangentAtT(e) {
		let t = this.segments.length;
		if (t === 0) return null;
		let n = e.segmentIndex;
		if (n < 0) return this.segments[0].tangentAtT(0);
		if (n >= t) return this.segments[t - 1].tangentAtT(1);
		let r = Bu(e.value, 0, 1);
		return this.segments[n].tangentAtT(r);
	}
	getPrecision(e = {}) {
		return e.precision == null ? this.PRECISION : e.precision;
	}
	getSubdivisions(e = {}) {
		if (e.segmentSubdivisions == null) {
			let t = this.getPrecision(e);
			return this.getSegmentSubdivisions({ precision: t });
		}
		return e.segmentSubdivisions;
	}
	getOptions(e = {}) {
		return {
			precision: this.getPrecision(e),
			segmentSubdivisions: this.getSubdivisions(e)
		};
	}
	toPoints(e = {}) {
		let t = this.segments, n = t.length;
		if (n === 0) return null;
		let r = this.getSubdivisions(e), i = [], a = [];
		for (let e = 0; e < n; e += 1) {
			let n = t[e];
			if (n.isVisible) {
				let t = r[e];
				t.length > 0 ? t.forEach((e) => a.push(e.start)) : a.push(n.start);
			} else a.length > 0 && (a.push(t[e - 1].end), i.push(a), a = []);
		}
		return a.length > 0 && (a.push(this.end), i.push(a)), i;
	}
	toPolylines(e = {}) {
		let t = this.toPoints(e);
		return t ? t.map((e) => new Qu(e)) : null;
	}
	scale(e, t, n) {
		return this.segments.forEach((r) => r.scale(e, t, n)), this;
	}
	rotate(e, t) {
		return this.segments.forEach((n) => n.rotate(e, t)), this;
	}
	translate(e, t) {
		return typeof e == "number" ? this.segments.forEach((n) => n.translate(e, t)) : this.segments.forEach((t) => t.translate(e)), this;
	}
	clone() {
		let t = new e();
		return this.segments.forEach((e) => t.appendSegment(e.clone())), t;
	}
	equals(e) {
		if (e == null) return !1;
		let t = this.segments, n = e.segments, r = t.length;
		if (n.length !== r) return !1;
		for (let e = 0; e < r; e += 1) {
			let r = t[e], i = n[e];
			if (r.type !== i.type || !r.equals(i)) return !1;
		}
		return !0;
	}
	toJSON() {
		return this.segments.map((e) => e.toJSON());
	}
	serialize() {
		if (!this.isValid()) throw Error("Invalid path segments.");
		return this.segments.map((e) => e.serialize()).join(" ");
	}
	toString() {
		return this.serialize();
	}
};
// node_modules/@antv/x6/es/registry/marker/util.js
function md(e, t, n) {
	let r, i;
	typeof t == "object" ? (r = t.x, i = t.y) : (r = t, i = n);
	let a = z.parse(e), o = a.bbox();
	if (o) {
		let e = -o.height / 2 - o.y, t = -o.width / 2 - o.x;
		typeof r == "number" && (t -= r), typeof i == "number" && (e -= i), a.translate(t, e);
	}
	return a.serialize();
}
// node_modules/@antv/x6/es/common/dom/class.js
var hd = /[\t\r\n\f]/g, gd = /\S+/g, _d = (e) => ` ${e} `;
function vd(e) {
	return e && e.getAttribute && e.getAttribute("class") || "";
}
function yd(e, t) {
	if (e == null || t == null) return !1;
	let n = _d(vd(e)), r = _d(t);
	return e.nodeType === 1 && n.replace(hd, " ").includes(r);
}
function B(e, t) {
	if (e != null && t != null) {
		if (typeof t == "function") return B(e, t(vd(e)));
		if (typeof t == "string" && e.nodeType === 1) {
			let n = t.match(gd) || [], r = _d(vd(e)).replace(hd, " "), i = n.reduce((e, t) => e.indexOf(_d(t)) < 0 ? `${e}${t} ` : e, r);
			i = i.trim(), r !== i && e.setAttribute("class", i);
		}
	}
}
function V(e, t) {
	if (e != null) {
		if (typeof t == "function") return V(e, t(vd(e)));
		if ((!t || typeof t == "string") && e.nodeType === 1) {
			let n = (t || "").match(gd) || [], r = _d(vd(e)).replace(hd, " "), i = n.reduce((e, t) => {
				let n = _d(t);
				return e.indexOf(n) > -1 ? e.replace(n, " ") : e;
			}, r);
			i = t ? i.trim() : "", r !== i && e.setAttribute("class", i);
		}
	}
}
function bd(e, t, n) {
	if (e != null && t != null) {
		if (n != null && typeof t == "string") n ? B(e, t) : V(e, t);
		else {
			if (typeof t == "function") return bd(e, t(vd(e), n), n);
			typeof t == "string" && (t.match(gd) || []).forEach((t) => {
				yd(e, t) ? V(e, t) : B(e, t);
			});
		}
	}
}
// node_modules/@antv/x6/es/common/dom/elem.js
var xd = 0;
function Sd() {
	return xd += 1, `v${xd}`;
}
function Cd(e) {
	return (e.id == null || e.id === "") && (e.id = Sd()), e.id;
}
function wd(e) {
	return e != null && typeof e.getScreenCTM == "function" && e instanceof SVGElement;
}
var Td = {
	svg: "http://www.w3.org/2000/svg",
	xmlns: "http://www.w3.org/2000/xmlns/",
	xml: "http://www.w3.org/XML/1998/namespace",
	xlink: "http://www.w3.org/1999/xlink",
	xhtml: "http://www.w3.org/1999/xhtml"
};
function Ed(e, t = document) {
	return t.createElement(e);
}
function Dd(e, t = Td.xhtml, n = document) {
	return n.createElementNS(t, e);
}
function Od(e, t = document) {
	return Dd(e, Td.svg, t);
}
function kd(e) {
	if (e) {
		let { documentElement: t } = Ad(`<svg xmlns="${Td.svg}" xmlns:xlink="${Td.xlink}" version="1.1">${e}</svg>`, { async: !1 });
		return t;
	}
	let t = document.createElementNS(Td.svg, "svg");
	return t.setAttributeNS(Td.xmlns, "xmlns:xlink", Td.xlink), t.setAttribute("version", "1.1"), t;
}
function Ad(e, t = {}) {
	let n;
	try {
		let r = new DOMParser();
		if (t.async != null) {
			let e = r;
			e.async = t.async;
		}
		n = r.parseFromString(e, t.mimeType || "text/xml");
	} catch {
		n = void 0;
	}
	if (!n || n.getElementsByTagName("parsererror").length) throw Error(`Invalid XML: ${e}`);
	return n;
}
function jd(e, t = !0) {
	let n = e.nodeName;
	return t ? n.toLowerCase() : n.toUpperCase();
}
function Md(e) {
	let t = 0, n = e.previousSibling;
	for (; n;) n.nodeType === 1 && (t += 1), n = n.previousSibling;
	return t;
}
function Nd(e, t) {
	return e.querySelectorAll(t);
}
function Pd(e, t) {
	return e.querySelector(t);
}
function Fd(e, t, n) {
	let r = e.ownerSVGElement, i = e.parentNode;
	for (; i && i !== n && i !== r;) {
		if (yd(i, t)) return i;
		i = i.parentNode;
	}
	return null;
}
function Id(e, t) {
	let n = t && t.parentNode;
	return e === n || !!(n && n.nodeType === 1 && e.compareDocumentPosition(n) & 16);
}
function Ld(e) {
	e && (Array.isArray(e) ? e : [e]).forEach((e) => {
		e.parentNode && e.parentNode.removeChild(e);
	});
}
function Rd(e) {
	for (; e.firstChild;) e.removeChild(e.firstChild);
}
function zd(e, t) {
	(Array.isArray(t) ? t : [t]).forEach((t) => {
		t != null && e.appendChild(t);
	});
}
function Bd(e, t) {
	let n = e.firstChild;
	return n ? Vd(n, t) : zd(e, t);
}
function Vd(e, t) {
	let n = e.parentNode;
	n && (Array.isArray(t) ? t : [t]).forEach((t) => {
		t != null && n.insertBefore(t, e);
	});
}
function Hd(e, t) {
	let n = e.parentNode;
	n && (Array.isArray(t) ? t : [t]).forEach((t) => {
		t != null && n.insertBefore(t, e.nextSibling);
	});
}
function Ud(e, t) {
	t?.appendChild(e);
}
function Wd(e) {
	return !!e && e.nodeType === 1;
}
function Gd(e) {
	try {
		return e instanceof HTMLElement;
	} catch {
		return typeof e == "object" && e.nodeType === 1 && typeof e.style == "object" && typeof e.ownerDocument == "object";
	}
}
function Kd(e, t) {
	let n = [], r = e.firstChild;
	for (; r; r = r.nextSibling) r.nodeType === 1 && (!t || yd(r, t)) && n.push(r);
	return n;
}
// node_modules/@antv/x6/es/common/string/format.js
var qd = (e) => {
	let t = Object.create(null);
	return ((n) => t[n] || (t[n] = e(n)));
}, Jd = qd((e) => e.replace(/\B([A-Z])/g, "-$1").toLowerCase()), Yd = qd((e) => Jl(Oa(e)).replace(/ /g, "")), Xd = [
	"viewBox",
	"attributeName",
	"attributeType",
	"repeatCount",
	"textLength",
	"lengthAdjust",
	"gradientUnits",
	"preserveAspectRatio"
];
function Zd(e, t) {
	return e.getAttribute(t);
}
function Qd(e, t) {
	let n = tf(t);
	n.ns ? e.hasAttributeNS(n.ns, n.local) && e.removeAttributeNS(n.ns, n.local) : e.hasAttribute(t) && e.removeAttribute(t);
}
function $d(e, t, n) {
	if (n == null) return Qd(e, t);
	let r = tf(t);
	r.ns && typeof n == "string" ? e.setAttributeNS(r.ns, t, n) : t === "id" ? e.id = `${n}` : e.setAttribute(t, `${n}`);
}
function ef(e, t) {
	Object.keys(t).forEach((n) => {
		$d(e, n, t[n]);
	});
}
function H(e, t, n) {
	if (t == null) {
		let t = e.attributes, n = {};
		for (let e = 0; e < t.length; e += 1) n[t[e].name] = t[e].value;
		return n;
	}
	if (typeof t == "string" && n === void 0) return e.getAttribute(t);
	typeof t == "object" ? ef(e, t) : $d(e, t, n);
}
function tf(e) {
	if (e.indexOf(":") !== -1) {
		let t = e.split(":");
		return {
			ns: Td[t[0]],
			local: t[1]
		};
	}
	return {
		ns: null,
		local: e
	};
}
function nf(e) {
	let t = {};
	return Object.keys(e).forEach((n) => {
		let r = Xd.includes(n) ? n : Jd(n);
		t[r] = e[n];
	}), t;
}
function rf(e) {
	let t = {};
	return e.split(";").forEach((e) => {
		let n = e.trim();
		if (n) {
			let e = n.split("=");
			e.length && (t[e[0].trim()] = e[1] ? e[1].trim() : "");
		}
	}), t;
}
function af(e, t) {
	return Object.keys(t).forEach((n) => {
		if (n === "class") e[n] = e[n] ? `${e[n]} ${t[n]}` : t[n];
		else if (n === "style") {
			let r = typeof e[n] == "object", i = typeof t[n] == "object", a, o;
			r && i ? (a = e[n], o = t[n]) : r ? (a = e[n], o = rf(t[n])) : i ? (a = rf(e[n]), o = t[n]) : (a = rf(e[n]), o = rf(t[n])), e[n] = af(a, o);
		} else e[n] = t[n];
	}), e;
}
// node_modules/@antv/x6/es/common/dom/prefix.js
var of = /-(.)/g;
function sf(e) {
	return e.replace(of, (e, t) => t.toUpperCase());
}
var cf = {}, lf = [
	"webkit",
	"ms",
	"moz",
	"o"
], uf = typeof document < "u" ? document.createElement("div").style : {};
function df(e) {
	for (let t = 0; t < lf.length; t += 1) {
		let n = lf[t] + e;
		if (n in uf) return n;
	}
	return null;
}
function ff(e) {
	let t = sf(e);
	if (cf[t] == null) {
		let e = t.charAt(0).toUpperCase() + t.slice(1);
		cf[t] = t in uf ? t : df(e);
	}
	return cf[t];
}
// node_modules/@antv/x6/es/common/dom/style.js
function pf(e, t) {
	let n = e.ownerDocument && e.ownerDocument.defaultView && e.ownerDocument.defaultView.opener ? e.ownerDocument.defaultView.getComputedStyle(e, null) : window.getComputedStyle(e, null);
	return n && t ? n.getPropertyValue(t) || n[t] : n;
}
(function() {
	if (typeof document > "u") return function() {};
	let e = document;
	return e.selection ? function() {
		e.selection.empty();
	} : window.getSelection ? function() {
		let e = window.getSelection();
		e && (e.empty ? e.empty() : e.removeAllRanges && e.removeAllRanges());
	} : function() {};
})();
// node_modules/@antv/x6/es/common/dom/css.js
var mf = {
	animationIterationCount: !0,
	columnCount: !0,
	flexGrow: !0,
	flexShrink: !0,
	fontWeight: !0,
	gridArea: !0,
	gridColumn: !0,
	gridColumnEnd: !0,
	gridColumnStart: !0,
	gridRow: !0,
	gridRowEnd: !0,
	gridRowStart: !0,
	lineHeight: !0,
	opacity: !0,
	order: !0,
	orphans: !0,
	widows: !0,
	zIndex: !0
};
function hf(e) {
	return /^--/.test(e);
}
function gf(e, t, n) {
	let r = window.getComputedStyle(e, null);
	return n ? r.getPropertyValue(t) || void 0 : r[t] || e.style[t];
}
function _f(e, t) {
	return parseInt(gf(e, t), 10) || 0;
}
function vf(e, t) {
	return !mf[e] && typeof t == "number" ? `${t}px` : t;
}
function U(e, t, n) {
	if (typeof t == "string") {
		let r = hf(t);
		if (r || (t = ff(t)), n === void 0) return gf(e, t, r);
		r || (n = vf(t, n));
		let i = e.style;
		r ? i.setProperty(t, n) : i[t] = n;
	} else for (let n in t) U(e, n, t[n]);
}
// node_modules/@antv/x6/es/common/string/hashcode.js
function yf(e) {
	let t = 2166136261, n = !1, r = e;
	for (let e = 0, i = r.length; e < i; e += 1) {
		let i = r.charCodeAt(e);
		i > 127 && !n && (r = unescape(encodeURIComponent(r)), i = r.charCodeAt(e), n = !0), t ^= i, t += (t << 1) + (t << 4) + (t << 7) + (t << 8) + (t << 24);
	}
	return t >>> 0;
}
// node_modules/@antv/x6/es/common/string/uuid.js
function bf() {
	let e = "";
	for (let t = 0; t < 36; t += 1) {
		let n = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"[t], r = Math.random() * 16 | 0, i = n === "x" ? r : n === "y" ? r & 3 | 8 : n;
		e += i.toString(16);
	}
	return e;
}
// node_modules/@antv/x6/es/common/string/suggestion.js
function xf(e, t, n) {
	let r = Math.min(2, Math.floor(e.length * .34)), i = Math.floor(e.length * .4) + 1, a, o = !1, s = e.toLowerCase();
	for (let c of t) {
		let t = n(c);
		if (t !== void 0 && Math.abs(t.length - s.length) <= r) {
			let n = t.toLowerCase();
			if (n === s) {
				if (t === e) continue;
				return c;
			}
			if (o || t.length < 3) continue;
			let r = Sf(s, n, i - 1);
			if (r === void 0) continue;
			r < 3 ? (o = !0, a = c) : (i = r, a = c);
		}
	}
	return a;
}
function Sf(e, t, n) {
	let r = Array(t.length + 1), i = Array(t.length + 1), a = n + 1;
	for (let e = 0; e <= t.length; e += 1) r[e] = e;
	for (let o = 1; o <= e.length; o += 1) {
		let s = e.charCodeAt(o - 1), c = o > n ? o - n : 1, l = t.length > n + o ? n + o : t.length;
		i[0] = o;
		let u = o;
		for (let e = 1; e < c; e += 1) i[e] = a;
		for (let e = c; e <= l; e += 1) {
			let n = s === t.charCodeAt(e - 1) ? r[e - 1] : Math.min(r[e] + 1, i[e - 1] + 1, r[e - 1] + 2);
			i[e] = n, u = Math.min(u, n);
		}
		for (let e = l + 1; e <= t.length; e += 1) i[e] = a;
		if (u > n) return;
		let d = r;
		r = i, i = d;
	}
	let o = r[t.length];
	return o > n ? void 0 : o;
}
// node_modules/@antv/x6/es/common/dom/data.js
var Cf = /* @__PURE__ */ new WeakMap();
function wf(e, t) {
	let n = Oa(t), r = Cf.get(e);
	if (r) return r[n];
}
function Tf(e, t, n) {
	let r = Oa(t), i = Cf.get(e);
	i ? i[r] = n : Cf.set(e, { [r]: n });
}
function Ef(e, t, n) {
	if (!t) return Cf.get(e);
	if (typeof t == "string") {
		if (n === void 0) return wf(e, t);
		Tf(e, t, n);
	} else for (let n in t) Ef(e, n, t[n]);
}
// node_modules/@antv/x6/es/common/dom/prop.js
var Df = {
	class: "className",
	contenteditable: "contentEditable",
	for: "htmlFor",
	readonly: "readOnly",
	maxlength: "maxLength",
	tabindex: "tabIndex",
	colspan: "colSpan",
	rowspan: "rowSpan",
	usemap: "useMap"
};
function Of(e, t, n) {
	if (t) {
		if (typeof t == "string") {
			if (t = Df[t] || t, arguments.length < 3) return e[t];
			e[t] = n;
		} else for (let n in t) Of(e, n, t[n]);
	}
}
// node_modules/@antv/x6/es/common/object/mixins.js
function kf(e, ...t) {
	t.forEach((t) => {
		Object.getOwnPropertyNames(t.prototype).forEach((n) => {
			n !== "constructor" && Object.defineProperty(e.prototype, n, Object.getOwnPropertyDescriptor(t.prototype, n));
		});
	});
}
// node_modules/@antv/x6/es/common/object/inherit.js
var Af = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(e, t) {
	e.__proto__ = t;
} || function(e, t) {
	for (let n in t) Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
};
function jf(e, t) {
	Af(e, t);
	function n() {
		this.constructor = e;
	}
	e.prototype = t === null ? Object.create(t) : (n.prototype = t.prototype, new n());
}
var Mf = class {}, Nf = /^\s*class\s+/.test(`${Mf}`) || /^\s*class\s*\{/.test(`${class {}}`);
function Pf(e, t) {
	let n;
	return Nf ? n = class extends t {} : (n = function() {
		return t.apply(this, arguments);
	}, jf(n, t)), Object.defineProperty(n, "name", { value: e }), n;
}
// node_modules/@antv/x6/es/common/object/object.js
function Ff(e) {
	return e === "__proto__";
}
function If(e, t, n = "/") {
	let r, i = Array.isArray(t) ? t : t.split(n);
	if (i.length) for (r = e; i.length;) {
		let e = i.shift();
		if (Object(r) === r && e && e in r) r = r[e];
		else return;
	}
	return r;
}
function Lf(e, t, n, r = "/") {
	let i = Array.isArray(t) ? t : t.split(r), a = i.pop();
	if (a && !Ff(a)) {
		let t = e;
		i.forEach((e) => {
			Ff(e) || (t[e] ?? (t[e] = {}), t = t[e]);
		}), t[a] = n;
	}
	return e;
}
function Rf(e, t, n = "/") {
	let r = Array.isArray(t) ? t.slice() : t.split(n), i = r.pop();
	if (i) {
		if (r.length > 0) {
			let t = If(e, r);
			t && delete t[i];
		} else delete e[i];
	}
	return e;
}
// node_modules/@antv/x6/es/common/text/annotate.js
function zf(e, t, n = {}) {
	let r = n.offset || 0, i = [], a = [], o, s, c = null;
	for (let l = 0; l < e.length; l += 1) {
		o = a[l] = e[l];
		for (let i = 0, s = t.length; i < s; i += 1) {
			let s = t[i], c = s.start + r, u = s.end + r;
			l >= c && l < u && (typeof o == "string" ? o = a[l] = {
				t: e[l],
				attrs: s.attrs
			} : o.attrs = af(af({}, o.attrs), s.attrs), n.includeAnnotationIndices && (o.annotations ?? (o.annotations = []), o.annotations.push(i)));
		}
		s = a[l - 1], s ? A(o) && A(s) ? (c = c, JSON.stringify(o.attrs) === JSON.stringify(s.attrs) ? c.t += o.t : (i.push(c), c = o)) : A(o) || A(s) ? (c = c, i.push(c), c = o) : c = String(c || "") + String(o) : c = o;
	}
	return c != null && i.push(c), i;
}
// node_modules/@antv/x6/es/common/text/sanitize.js
function Bf(e) {
	return e.replace(/ /g, "\xA0");
}
// node_modules/@antv/x6/es/common/vector/index.js
var W = class e {
	get [Symbol.toStringTag]() {
		return Vf;
	}
	get type() {
		return this.node.nodeName;
	}
	get id() {
		return this.node.id;
	}
	set id(e) {
		this.node.id = e;
	}
	static isVector(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return (n == null || n === Vf) && r.node instanceof SVGElement && typeof r.sample == "function" && typeof r.toPath == "function";
	}
	static create(t, n, r) {
		return new e(t, n, r);
	}
	static createVectors(t) {
		if (t[0] === "<") {
			let n = kd(t), r = [];
			for (let t = 0, i = n.childNodes.length; t < i; t += 1) {
				let i = n.childNodes[t];
				r.push(e.create(document.importNode(i, !0)));
			}
			return r;
		}
		return [e.create(t)];
	}
	static toNode(t) {
		return e.isVector(t) ? t.node : t;
	}
	static toNodes(t) {
		return Array.isArray(t) ? t.map((t) => e.toNode(t)) : [e.toNode(t)];
	}
	constructor(t, n, r) {
		if (!t) throw TypeError("Invalid element to create vector");
		let i;
		if (e.isVector(t)) i = t.node;
		else if (typeof t == "string") {
			if (t.toLowerCase() === "svg") i = kd();
			else if (t[0] === "<") {
				let e = kd(t);
				i = document.importNode(e.firstChild, !0);
			} else i = document.createElementNS(Td.svg, t);
		} else i = t;
		this.node = i, n && this.setAttributes(n), r && this.append(r);
	}
	transform(e, t) {
		return e == null ? Tp(this.node) : (Tp(this.node, e, t), this);
	}
	translate(e, t = 0, n = {}) {
		return e == null ? Ep(this.node) : (Ep(this.node, e, t, n), this);
	}
	rotate(e, t, n, r = {}) {
		return e == null ? Dp(this.node) : (Dp(this.node, e, t, n, r), this);
	}
	scale(e, t) {
		return e == null ? Op(this.node) : (Op(this.node, e, t), this);
	}
	getTransformToElement(t) {
		let n = e.toNode(t);
		return kp(this.node, n);
	}
	removeAttribute(e) {
		return Qd(this.node, e), this;
	}
	getAttribute(e) {
		return Zd(this.node, e);
	}
	setAttribute(e, t) {
		return $d(this.node, e, t), this;
	}
	setAttributes(e) {
		return ef(this.node, e), this;
	}
	attr(e, t) {
		return e == null ? H(this.node) : typeof e == "string" && t === void 0 ? H(this.node, e) : (typeof e == "object" ? H(this.node, e) : H(this.node, e, t), this);
	}
	svg() {
		return this.node instanceof SVGSVGElement ? this : e.create(this.node.ownerSVGElement);
	}
	defs() {
		let t = this.svg() || this, n = t.node.getElementsByTagName("defs")[0];
		return n ? e.create(n) : e.create("defs").appendTo(t);
	}
	text(e, t = {}) {
		return qf(this.node, e, t), this;
	}
	tagName() {
		return jd(this.node);
	}
	clone() {
		return e.create(this.node.cloneNode(!0));
	}
	remove() {
		return Ld(this.node), this;
	}
	empty() {
		return Rd(this.node), this;
	}
	append(t) {
		return zd(this.node, e.toNodes(t)), this;
	}
	appendTo(t) {
		return Ud(this.node, e.isVector(t) ? t.node : t), this;
	}
	prepend(t) {
		return Bd(this.node, e.toNodes(t)), this;
	}
	before(t) {
		return Vd(this.node, e.toNodes(t)), this;
	}
	replace(t) {
		return this.node.parentNode && this.node.parentNode.replaceChild(e.toNode(t), this.node), e.create(t);
	}
	first() {
		return this.node.firstChild ? e.create(this.node.firstChild) : null;
	}
	last() {
		return this.node.lastChild ? e.create(this.node.lastChild) : null;
	}
	get(t) {
		let n = this.node.childNodes[t];
		return n ? e.create(n) : null;
	}
	indexOf(t) {
		return Array.prototype.slice.call(this.node.childNodes).indexOf(e.toNode(t));
	}
	find(t) {
		let n = [], r = Nd(this.node, t);
		if (r) for (let t = 0, i = r.length; t < i; t += 1) n.push(e.create(r[t]));
		return n;
	}
	findOne(t) {
		let n = Pd(this.node, t);
		return n ? e.create(n) : null;
	}
	findParentByClass(t, n) {
		let r = Fd(this.node, t, n);
		return r ? e.create(r) : null;
	}
	matches(e) {
		let t = this.node;
		this.node.matches;
		let n = t.matches || t.matchesSelector || t.msMatchesSelector || t.mozMatchesSelector || t.webkitMatchesSelector || t.oMatchesSelector || null;
		return n && n.call(t, e);
	}
	contains(t) {
		return Id(this.node, e.isVector(t) ? t.node : t);
	}
	wrap(t) {
		let n = e.create(t);
		return this.node.parentNode?.insertBefore(n.node, this.node), n.append(this);
	}
	parent(t) {
		let n = this;
		if (n.node.parentNode == null) return null;
		if (n = e.create(n.node.parentNode), t == null) return n;
		do
			if (typeof t == "string" ? n.matches(t) : n instanceof t) return n;
		while (n = e.create(n.node.parentNode));
		return n;
	}
	children() {
		let t = this.node.childNodes, n = [];
		for (let r = 0; r < t.length; r += 1) t[r].nodeType === 1 && n.push(e.create(t[r]));
		return n;
	}
	eachChild(e, t) {
		let n = this.children();
		for (let r = 0, i = n.length; r < i; r += 1) e.call(n[r], n[r], r, n), t && n[r].eachChild(e, t);
		return this;
	}
	index() {
		return Md(this.node);
	}
	hasClass(e) {
		return yd(this.node, e);
	}
	addClass(e) {
		return B(this.node, e), this;
	}
	removeClass(e) {
		return V(this.node, e), this;
	}
	toggleClass(e, t) {
		return bd(this.node, e, t), this;
	}
	toLocalPoint(e, t) {
		return jp(this.node, e, t);
	}
	sample(e = 1) {
		return this.node instanceof SVGPathElement ? $f(this.node, e) : [];
	}
	toPath() {
		return e.create(lp(this.node));
	}
	toPathData() {
		return up(this.node);
	}
}, Vf = `X6.${W.name}`;
// node_modules/@antv/x6/es/common/dom/text.js
function Hf(e, t) {
	let n = W.create(t), r = W.create("textPath"), i = e.d;
	if (i && e["xlink:href"] === void 0) {
		let e = W.create("path").attr("d", i).appendTo(n.defs());
		r.attr("xlink:href", `#${e.id}`);
	}
	return typeof e == "object" && r.attr(e), r.node;
}
function Uf(e, t, n) {
	let r = n.eol, i = n.baseSize, a = n.lineHeight, o = 0, s, c = {}, l = t.length - 1;
	for (let a = 0; a <= l; a += 1) {
		let c = t[a], u = null;
		if (typeof c == "object") {
			let e = c.attrs, t = W.create("tspan", e);
			s = t.node;
			let d = c.t;
			r && a === l && (d += r), s.textContent = d;
			let f = e.class;
			f && t.addClass(f), n.includeAnnotationIndices && t.attr("annotations", c.annotations.join(",")), u = parseFloat(e["font-size"]), u === void 0 && (u = i), u && u > o && (o = u);
		} else r && a === l && (c += r), s = document.createTextNode(c || " "), i && i > o && (o = i);
		e.appendChild(s);
	}
	return o && (c.maxFontSize = o), a ? c.lineHeight = a : o && (c.lineHeight = o * 1.2), c;
}
var Wf = /em$/;
function Gf(e, t) {
	let n = parseFloat(e);
	return Wf.test(e) ? n * t : n;
}
function Kf(e, t, n, r) {
	if (!Array.isArray(t)) return 0;
	let i = t.length;
	if (!i) return 0;
	let a = t[0], o = Gf(a.maxFontSize, n) || n, s = 0, c = Gf(r, n);
	for (let e = 1; e < i; e += 1) {
		a = t[e];
		let r = Gf(a.lineHeight, n) || c;
		s += r;
	}
	let l = Gf(a.maxFontSize, n) || n, u;
	switch (e) {
		case "middle":
			u = o / 2 - .15 * l - s / 2;
			break;
		case "bottom":
			u = -(.25 * l) - s;
			break;
		default: u = .8 * o;
	}
	return u;
}
function qf(e, t, n = {}) {
	t = Bf(t);
	let r = n.eol, i = n.textPath, a = n.textVerticalAnchor, o = a === "middle" || a === "bottom" || a === "top", s = n.x;
	s === void 0 && (s = e.getAttribute("x") || 0);
	let c = n.includeAnnotationIndices, l = n.annotations;
	l && !Array.isArray(l) && (l = [l]);
	let u = n.lineHeight, d = u === "auto", f = d ? "1.5em" : u || "1em", p = !0, m = e.childNodes;
	if (m.length === 1) {
		let e = m[0];
		e && e.tagName.toUpperCase() === "TITLE" && (p = !1);
	}
	p && Rd(e), H(e, {
		"xml:space": "preserve",
		display: t || n.displayEmpty ? null : "none"
	});
	let h = H(e, "font-size"), g = parseFloat(h);
	g || (g = 16, (o || l) && !h && H(e, "font-size", `${g}`));
	let _;
	i ? (typeof i == "string" && (i = { d: i }), _ = Hf(i, e)) : _ = document.createDocumentFragment();
	let v, y = 0, b, x = t.split("\n"), S = [], C = x.length - 1;
	for (let e = 0; e <= C; e += 1) {
		v = f;
		let t = "v-line", n = Od("tspan"), a, o = x[e];
		if (o) {
			if (l) {
				a = Uf(n, zf(o, l, {
					offset: -y,
					includeAnnotationIndices: c
				}), {
					eol: e !== C && r,
					baseSize: g,
					lineHeight: d ? null : f,
					includeAnnotationIndices: c
				});
				let t = a.lineHeight;
				t && d && e !== 0 && (v = t), e === 0 && (b = a.maxFontSize * .8);
			} else r && e !== C && (o += r), n.textContent = o;
		} else {
			n.textContent = "-", t += " v-empty-line";
			let e = n.style;
			e.fillOpacity = 0, e.strokeOpacity = 0, l && (a = {});
		}
		a && S.push(a), e > 0 && n.setAttribute("dy", v), (e > 0 || i) && n.setAttribute("x", s), n.className.baseVal = t, _.appendChild(n), y += o.length + 1;
	}
	if (o) {
		if (l) v = Kf(a, S, g, f);
		else if (a === "top") v = "0.8em";
		else {
			let e;
			switch (C > 0 ? (e = parseFloat(f) || 1, e *= C, Wf.test(f) || (e /= g)) : e = 0, a) {
				case "middle":
					v = `${.3 - e / 2}em`;
					break;
				case "bottom": v = `${-e - .3}em`;
			}
		}
	} else a === 0 ? v = "0em" : a ? v = a : (v = 0, e.getAttribute("y") ?? e.setAttribute("y", `${b || "0.8em"}`));
	_.firstChild.setAttribute("dy", v), e.appendChild(_);
}
function Jf(e, t = {}) {
	let n = document.createElement("canvas").getContext("2d");
	if (!e) return { width: 0 };
	let r = [], i = t["font-size"] ? `${parseFloat(t["font-size"])}px` : "14px";
	return r.push(t["font-style"] || "normal"), r.push(t["font-variant"] || "normal"), r.push(t["font-weight"] || 400), r.push(i), r.push(t["font-family"] || "sans-serif"), n.font = r.join(" "), n.measureText(e);
}
function Yf(e, t, n, r = {}) {
	if (t >= n) return [e, ""];
	let i = e.length, a = {}, o = Math.round(t / n * i - 1);
	for (o < 0 && (o = 0); o >= 0 && o < i;) {
		let n = e.slice(0, o), i = a[n] || Jf(n, r).width, s = e.slice(0, o + 1), c = a[s] || Jf(s, r).width;
		if (a[n] = i, a[s] = c, i > t) --o;
		else if (c <= t) o += 1;
		else break;
	}
	return [e.slice(0, o), e.slice(o)];
}
function Xf(e, t, n = {}, r = {}) {
	let i = t.width, a = t.height, o = r.eol || "\n", s = n.fontSize || 14, c = n.lineHeight ? parseFloat(n.lineHeight) : Math.ceil(s * 1.4), l = Math.floor(a / c);
	if (e.indexOf(o) > -1) {
		let i = bf(), a = [];
		return e.split(o).forEach((e) => {
			let o = Xf(e, Object.assign(Object.assign({}, t), { height: 2 ** 53 - 1 }), n, Object.assign(Object.assign({}, r), { eol: i }));
			o && a.push(...o.split(i));
		}), a.slice(0, l).join(o);
	}
	let { width: u } = Jf(e, n);
	if (u < i) return e;
	let d = [], f = e, p = u, m = r.ellipsis, h = 0;
	m && (typeof m != "string" && (m = "…"), h = Jf(m, n).width);
	for (let e = 0; e < l; e += 1) if (p > i) {
		if (e === l - 1) {
			let [e] = Yf(f, i - h, p, n);
			d.push(m ? `${e}${m}` : e);
		} else {
			let [e, t] = Yf(f, i, p, n);
			d.push(e), f = t, p = Jf(f, n).width;
		}
	} else {
		d.push(f);
		break;
	}
	return d.join(o);
}
// node_modules/@antv/x6/es/common/dom/path.js
var Zf = .551784;
function Qf(e, t, n = NaN) {
	let r = e.getAttribute(t);
	if (r == null) return n;
	let i = parseFloat(r);
	return Number.isNaN(i) ? n : i;
}
function $f(e, t = 1) {
	let n = e.getTotalLength(), r = [], i = 0, a;
	for (; i < n;) a = e.getPointAtLength(i), r.push({
		distance: i,
		x: a.x,
		y: a.y
	}), i += t;
	return r;
}
function ep(e) {
	return [
		"M",
		Qf(e, "x1"),
		Qf(e, "y1"),
		"L",
		Qf(e, "x2"),
		Qf(e, "y2")
	].join(" ");
}
function tp(e) {
	let t = ip(e);
	return t.length === 0 ? null : `${rp(t)} Z`;
}
function np(e) {
	let t = ip(e);
	return t.length === 0 ? null : rp(t);
}
function rp(e) {
	return `M ${e.map((e) => `${e.x} ${e.y}`).join(" L")}`;
}
function ip(e) {
	let t = [], n = e.points;
	if (n) for (let e = 0, r = n.numberOfItems; e < r; e += 1) t.push(n.getItem(e));
	return t;
}
function ap(e) {
	let t = Qf(e, "cx", 0), n = Qf(e, "cy", 0), r = Qf(e, "r"), i = r * Zf;
	return [
		"M",
		t,
		n - r,
		"C",
		t + i,
		n - r,
		t + r,
		n - i,
		t + r,
		n,
		"C",
		t + r,
		n + i,
		t + i,
		n + r,
		t,
		n + r,
		"C",
		t - i,
		n + r,
		t - r,
		n + i,
		t - r,
		n,
		"C",
		t - r,
		n - i,
		t - i,
		n - r,
		t,
		n - r,
		"Z"
	].join(" ");
}
function op(e) {
	let t = Qf(e, "cx", 0), n = Qf(e, "cy", 0), r = Qf(e, "rx"), i = Qf(e, "ry") || r, a = r * Zf, o = i * Zf;
	return [
		"M",
		t,
		n - i,
		"C",
		t + a,
		n - i,
		t + r,
		n - o,
		t + r,
		n,
		"C",
		t + r,
		n + o,
		t + a,
		n + i,
		t,
		n + i,
		"C",
		t - a,
		n + i,
		t - r,
		n + o,
		t - r,
		n,
		"C",
		t - r,
		n - o,
		t - a,
		n - i,
		t,
		n - i,
		"Z"
	].join(" ");
}
function sp(e) {
	return cp({
		x: Qf(e, "x", 0),
		y: Qf(e, "y", 0),
		width: Qf(e, "width", 0),
		height: Qf(e, "height", 0),
		rx: Qf(e, "rx", 0),
		ry: Qf(e, "ry", 0)
	});
}
function cp(e) {
	let t, n = e.x, r = e.y, i = e.width, a = e.height, o = Math.min(e.rx || e["top-rx"] || 0, i / 2), s = Math.min(e.rx || e["bottom-rx"] || 0, i / 2), c = Math.min(e.ry || e["top-ry"] || 0, a / 2), l = Math.min(e.ry || e["bottom-ry"] || 0, a / 2);
	return t = o || s || c || l ? [
		"M",
		n,
		r + c,
		"v",
		a - c - l,
		"a",
		s,
		l,
		0,
		0,
		0,
		s,
		l,
		"h",
		i - 2 * s,
		"a",
		s,
		l,
		0,
		0,
		0,
		s,
		-l,
		"v",
		-(a - l - c),
		"a",
		o,
		c,
		0,
		0,
		0,
		-o,
		-c,
		"h",
		-(i - 2 * o),
		"a",
		o,
		c,
		0,
		0,
		0,
		-o,
		c,
		"Z"
	] : [
		"M",
		n,
		r,
		"H",
		n + i,
		"V",
		r + a,
		"H",
		n,
		"V",
		r,
		"Z"
	], t.join(" ");
}
function lp(e) {
	let t = Od("path");
	H(t, H(e));
	let n = up(e);
	return n && t.setAttribute("d", n), t;
}
function up(e) {
	let t = e.tagName.toLowerCase();
	switch (t) {
		case "path": return e.getAttribute("d");
		case "line": return ep(e);
		case "polygon": return tp(e);
		case "polyline": return np(e);
		case "ellipse": return op(e);
		case "circle": return ap(e);
		case "rect": return sp(e);
	}
	throw Error(`"${t}" cannot be converted to svg path element.`);
}
// node_modules/@antv/x6/es/common/dom/matrix.js
var dp = /(\w+)\(([^,)]+),?([^)]+)?\)/gi, fp = /[ ,]+/, pp = /^(\w+)\((.*)\)/;
function mp(e, t) {
	let n = Od("svg").createSVGPoint();
	return n.x = e, n.y = t, n;
}
function hp(e) {
	let t = Od("svg").createSVGMatrix();
	if (e != null) {
		let n = e;
		for (let e of [
			"a",
			"b",
			"c",
			"d",
			"e",
			"f"
		]) n[e] !== void 0 && (t[e] = n[e]);
	}
	return t;
}
function gp(e) {
	let t = Od("svg");
	return e == null ? t.createSVGTransform() : (e instanceof DOMMatrix || (e = hp(e)), t.createSVGTransformFromMatrix(e));
}
function _p(e) {
	let t = hp(), n = e != null && e.match(dp);
	if (!n) return t;
	for (let e = 0, r = n.length; e < r; e += 1) {
		let r = n[e].match(pp);
		if (r) {
			let e, n, i, a, o, s = hp(), c = r[2].split(fp);
			switch (r[1].toLowerCase()) {
				case "scale":
					e = parseFloat(c[0]), n = c[1] === void 0 ? e : parseFloat(c[1]), s = s.scaleNonUniform(e, n);
					break;
				case "translate":
					i = parseFloat(c[0]), a = parseFloat(c[1]), s = s.translate(i, a);
					break;
				case "rotate":
					o = parseFloat(c[0]), i = parseFloat(c[1]) || 0, a = parseFloat(c[2]) || 0, s = i !== 0 || a !== 0 ? s.translate(i, a).rotate(o).translate(-i, -a) : s.rotate(o);
					break;
				case "skewx":
					o = parseFloat(c[0]), s = s.skewX(o);
					break;
				case "skewy":
					o = parseFloat(c[0]), s = s.skewY(o);
					break;
				case "matrix":
					s.a = parseFloat(c[0]), s.b = parseFloat(c[1]), s.c = parseFloat(c[2]), s.d = parseFloat(c[3]), s.e = parseFloat(c[4]), s.f = parseFloat(c[5]);
					break;
				default: continue;
			}
			t = t.multiply(s);
		}
	}
	return t;
}
function vp(e) {
	let t = e || {};
	return `matrix(${t.a == null ? 1 : t.a},${t.b == null ? 0 : t.b},${t.c == null ? 0 : t.c},${t.d == null ? 1 : t.d},${t.e == null ? 0 : t.e},${t.f == null ? 0 : t.f})`;
}
function yp(e) {
	let t, n, r;
	if (e) {
		let i = fp;
		if (e.trim().indexOf("matrix") >= 0) {
			let i = xp(_p(e));
			t = [i.translateX, i.translateY], n = [i.rotation], r = [i.scaleX, i.scaleY];
			let a = [];
			(t[0] !== 0 || t[1] !== 0) && a.push(`translate(${t.join(",")})`), (r[0] !== 1 || r[1] !== 1) && a.push(`scale(${r.join(",")})`), n[0] !== 0 && a.push(`rotate(${n[0]})`), e = a.join(" ");
		} else {
			let a = e.match(/translate\((.*?)\)/);
			a && (t = a[1].split(i));
			let o = e.match(/rotate\((.*?)\)/);
			o && (n = o[1].split(i));
			let s = e.match(/scale\((.*?)\)/);
			s && (r = s[1].split(i));
		}
	}
	let i = r && r[0] ? parseFloat(r[0]) : 1;
	return {
		raw: e || "",
		translation: {
			tx: t && t[0] ? parseInt(t[0], 10) : 0,
			ty: t && t[1] ? parseInt(t[1], 10) : 0
		},
		rotation: {
			angle: n && n[0] ? parseInt(n[0], 10) : 0,
			cx: n && n[1] ? parseInt(n[1], 10) : void 0,
			cy: n && n[2] ? parseInt(n[2], 10) : void 0
		},
		scale: {
			sx: i,
			sy: r && r[1] ? parseFloat(r[1]) : i
		}
	};
}
function bp(e, t) {
	return {
		x: t.x * e.a + t.y * e.c + 0,
		y: t.x * e.b + t.y * e.d + 0
	};
}
function xp(e) {
	let t = bp(e, {
		x: 0,
		y: 1
	}), n = bp(e, {
		x: 1,
		y: 0
	}), r = 180 / Math.PI * Math.atan2(t.y, t.x) - 90;
	return {
		skewX: r,
		skewY: 180 / Math.PI * Math.atan2(n.y, n.x),
		translateX: e.e,
		translateY: e.f,
		scaleX: Math.sqrt(e.a * e.a + e.b * e.b),
		scaleY: Math.sqrt(e.c * e.c + e.d * e.d),
		rotation: r
	};
}
function Sp(e) {
	let t, n, r, i;
	return e ? (t = e.a == null ? 1 : e.a, i = e.d == null ? 1 : e.d, n = e.b, r = e.c) : t = i = 1, {
		sx: n ? Math.sqrt(t * t + n * n) : t,
		sy: r ? Math.sqrt(r * r + i * i) : i
	};
}
function Cp(e) {
	let t = {
		x: 0,
		y: 1
	};
	e && (t = bp(e, t));
	let n = 180 * Math.atan2(t.y, t.x) / Math.PI % 360 - 90;
	return { angle: n % 360 + (n < 0 ? 360 : 0) };
}
function wp(e) {
	return {
		tx: e && e.e || 0,
		ty: e && e.f || 0
	};
}
// node_modules/@antv/x6/es/common/dom/transform.js
function Tp(e, t, n = {}) {
	if (t == null) return _p(H(e, "transform"));
	if (n.absolute) {
		e.setAttribute("transform", vp(t));
		return;
	}
	let r = e.transform, i = gp(t);
	r.baseVal.appendItem(i);
}
function Ep(e, t, n = 0, r = {}) {
	let i = H(e, "transform"), a = yp(i);
	if (t == null) return a.translation;
	i = a.raw, i = i.replace(/translate\([^)]*\)/g, "").trim();
	let o = `translate(${r.absolute ? t : a.translation.tx + t},${r.absolute ? n : a.translation.ty + n})`;
	e.setAttribute("transform", `${o} ${i}`.trim());
}
function Dp(e, t, n, r, i = {}) {
	let a = H(e, "transform"), o = yp(a);
	if (t == null) return o.rotation;
	a = o.raw, a = a.replace(/rotate\([^)]*\)/g, "").trim(), t %= 360;
	let s = `rotate(${i.absolute ? t : o.rotation.angle + t}${n != null && r != null ? `,${n},${r}` : ""})`;
	e.setAttribute("transform", `${a} ${s}`.trim());
}
function Op(e, t, n) {
	let r = H(e, "transform"), i = yp(r);
	if (t == null) return i.scale;
	n = n ?? t, r = i.raw, r = r.replace(/scale\([^)]*\)/g, "").trim();
	let a = `scale(${t},${n})`;
	e.setAttribute("transform", `${r} ${a}`.trim());
}
function kp(e, t) {
	if (wd(t) && wd(e)) {
		let n = t.getScreenCTM(), r = e.getScreenCTM();
		if (n && r) return n.inverse().multiply(r);
	}
	return hp();
}
function Ap(e, t) {
	let n = hp();
	if (wd(t) && wd(e)) {
		let r = e, i = [];
		for (; r && r !== t;) {
			let e = _p(r.getAttribute("transform") || null);
			i.push(e), r = r.parentNode;
		}
		i.reverse().forEach((e) => {
			n = n.multiply(e);
		});
	}
	return n;
}
function jp(e, t, n) {
	let r = e instanceof SVGSVGElement ? e : e.ownerSVGElement, i = r.createSVGPoint();
	i.x = t, i.y = n;
	try {
		let t = r.getScreenCTM(), n = i.matrixTransform(t.inverse()), a = kp(e, r).inverse();
		return n.matrixTransform(a);
	} catch {
		return i;
	}
}
// node_modules/@antv/x6/es/common/dom/event/hook.js
var Mp = {};
function Np(e) {
	return Mp[e] || {};
}
function Pp(e, t) {
	Mp[e] = t;
}
// node_modules/@antv/x6/es/common/dom/event/store.js
var Fp = /* @__PURE__ */ new WeakMap();
function Ip(e) {
	return Fp.has(e) || Fp.set(e, { events: Object.create(null) }), Fp.get(e);
}
function Lp(e) {
	return Fp.get(e);
}
function Rp(e) {
	return Fp.delete(e);
}
// node_modules/@antv/x6/es/common/dom/event/util.js
var zp = () => !0, Bp = () => !1;
function Vp(e) {
	e.stopPropagation();
}
function Hp(e, t, n) {
	e.addEventListener != null && e.addEventListener(t, n);
}
function Up(e, t, n) {
	e.removeEventListener != null && e.removeEventListener(t, n);
}
var Wp = /[^\x20\t\r\n\f]+/g, Gp = /^([^.]*)(?:\.(.+)|)/;
function Kp(e) {
	return (e || "").match(Wp) || [""];
}
function qp(e) {
	let t = Gp.exec(e) || [];
	return {
		originType: t[1] ? t[1].trim() : t[1],
		namespaces: t[2] ? t[2].split(".").map((e) => e.trim()).sort() : []
	};
}
function Jp(e) {
	return e.nodeType === 1 || e.nodeType === 9 || !+e.nodeType;
}
var Yp = 0, Xp = /* @__PURE__ */ new WeakMap();
function Zp(e) {
	return Xp.has(e) || (Xp.set(e, Yp), Yp += 1), Xp.get(e);
}
function Qp(e) {
	return Xp.get(e);
}
function $p(e) {
	return Xp.delete(e);
}
function em(e, t) {
	return Xp.set(e, t);
}
function tm(e, t) {
	let n = [], r = Lp(e), i = r && r.events && r.events[t.type], a = i && i.handlers || [], o = i ? i.delegateCount : 0;
	if (o > 0 && !(t.type === "click" && typeof t.button == "number" && t.button >= 1)) {
		for (let r = t.target; r !== e; r = r.parentNode || e) if (r.nodeType === 1 && (t.type !== "click" || r.disabled !== !0)) {
			let t = [], i = {};
			for (let n = 0; n < o; n += 1) {
				let o = a[n], s = o.selector;
				if (s != null && i[s] == null) {
					let t = e, n = [];
					t.querySelectorAll(s).forEach((e) => {
						n.push(e);
					}), i[s] = n.includes(r);
				}
				i[s] && t.push(o);
			}
			t.length && n.push({
				elem: r,
				handlers: t
			});
		}
	}
	return o < a.length && n.push({
		elem: e,
		handlers: a.slice(o)
	}), n;
}
function nm(e) {
	return e != null && e === e.window;
}
function rm(e, t) {
	let n = e.nodeType === 9 ? e.documentElement : e, r = t && t.parentNode;
	return e === r || !!(r && r.nodeType === 1 && (n.contains ? n.contains(r) : e.compareDocumentPosition && e.compareDocumentPosition(r) & 16));
}
// node_modules/@antv/x6/es/common/dom/event/object.js
var im = class e {
	static create(t) {
		return t instanceof e ? t : new e(t);
	}
	static addProperty(t, n) {
		Object.defineProperty(e.prototype, t, {
			enumerable: !0,
			configurable: !0,
			get: typeof n == "function" ? function() {
				if (this.originalEvent) return n(this.originalEvent);
			} : function() {
				if (this.originalEvent) return this.originalEvent[t];
			},
			set(e) {
				Object.defineProperty(this, t, {
					enumerable: !0,
					configurable: !0,
					writable: !0,
					value: e
				});
			}
		});
	}
	constructor(e, t) {
		this.isDefaultPrevented = Bp, this.isPropagationStopped = Bp, this.isImmediatePropagationStopped = Bp, this.isSimulated = !1, this.preventDefault = () => {
			let e = this.originalEvent;
			this.isDefaultPrevented = zp, e && !this.isSimulated && e.preventDefault();
		}, this.stopPropagation = () => {
			let e = this.originalEvent;
			this.isPropagationStopped = zp, e && !this.isSimulated && e.stopPropagation();
		}, this.stopImmediatePropagation = () => {
			let e = this.originalEvent;
			this.isImmediatePropagationStopped = zp, e && !this.isSimulated && e.stopImmediatePropagation(), this.stopPropagation();
		}, typeof e == "string" ? this.type = e : e.type && (this.originalEvent = e, this.type = e.type, this.isDefaultPrevented = e.defaultPrevented ? zp : Bp, this.target = e.target, this.currentTarget = e.currentTarget, this.relatedTarget = e.relatedTarget, this.timeStamp = e.timeStamp), t && Object.assign(this, t), this.timeStamp || (this.timeStamp = Date.now());
	}
}, am = {
	bubbles: !0,
	cancelable: !0,
	eventPhase: !0,
	detail: !0,
	view: !0,
	button: !0,
	buttons: !0,
	clientX: !0,
	clientY: !0,
	offsetX: !0,
	offsetY: !0,
	pageX: !0,
	pageY: !0,
	screenX: !0,
	screenY: !0,
	toElement: !0,
	pointerId: !0,
	pointerType: !0,
	char: !0,
	code: !0,
	charCode: !0,
	key: !0,
	keyCode: !0,
	touches: !0,
	changedTouches: !0,
	targetTouches: !0,
	which: !0,
	altKey: !0,
	ctrlKey: !0,
	metaKey: !0,
	shiftKey: !0
};
Object.keys(am).forEach((e) => im.addProperty(e, am[e])), Pp("load", { noBubble: !0 }), Pp("beforeunload", { postDispatch(e, t) {
	t.result !== void 0 && t.originalEvent && (t.originalEvent.returnValue = t.result);
} }), Pp("mouseenter", {
	delegateType: "mouseover",
	bindType: "mouseover",
	handle(e, t) {
		let n, r = t.relatedTarget, i = t.handleObj;
		return (!r || r !== e && !rm(e, r)) && (t.type = i.originType, n = i.handler.call(e, t), t.type = "mouseover"), n;
	}
}), Pp("mouseleave", {
	delegateType: "mouseout",
	bindType: "mouseout",
	handle(e, t) {
		let n, r = t.relatedTarget, i = t.handleObj;
		return (!r || r !== e && !rm(e, r)) && (t.type = i.originType, n = i.handler.call(e, t), t.type = "mouseout"), n;
	}
});
// node_modules/@antv/x6/es/common/dom/event/core.js
var om;
function sm(e, t, n, r, i) {
	if (!Jp(e)) return;
	let a;
	if (typeof n != "function") {
		let { handler: e, selector: t } = n, r = O(n, ["handler", "selector"]);
		n = e, i = t, a = r;
	}
	let o = Ip(e), s = o.handler;
	s ?? (s = o.handler = function(t, ...n) {
		return om === t.type ? void 0 : lm(e, t, ...n);
	});
	let c = Zp(n);
	Kp(t).forEach((t) => {
		let { originType: l, namespaces: u } = qp(t);
		if (!l) return;
		let d = l, f = Np(d);
		d = (i ? f.delegateType : f.bindType) || d, f = Np(d);
		let p = Object.assign({
			type: d,
			originType: l,
			data: r,
			selector: i,
			guid: c,
			handler: n,
			namespace: u.join(".")
		}, a), m = o.events, h = m[d];
		h || (h = m[d] = {
			handlers: [],
			delegateCount: 0
		}, f.setup && f.setup(e, r, u, s) !== !1 || Hp(e, d, s)), f.add && ($p(p.handler), f.add(e, p), em(p.handler, c)), i ? (h.handlers.splice(h.delegateCount, 0, p), h.delegateCount += 1) : h.handlers.push(p);
	});
}
function cm(e, t, n, r, i) {
	let a = Lp(e);
	if (!a) return;
	let o = a.events;
	o && (Kp(t).forEach((t) => {
		let { originType: s, namespaces: c } = qp(t);
		if (!s) {
			Object.keys(o).forEach((i) => {
				cm(e, i + t, n, r, !0);
			});
			return;
		}
		let l = s, u = Np(l);
		l = (r ? u.delegateType : u.bindType) || l;
		let d = o[l];
		if (!d) return;
		let f = c.length > 0 ? RegExp(`(^|\\.)${c.join("\\.(?:.*\\.|)")}(\\.|$)`) : null, p = d.handlers.length;
		for (let t = d.handlers.length - 1; t >= 0; --t) {
			let a = d.handlers[t];
			(i || s === a.originType) && (!n || Qp(n) === a.guid) && (f == null || a.namespace && f.test(a.namespace)) && (r == null || r === a.selector || r === "**" && a.selector) && (d.handlers.splice(t, 1), a.selector && --d.delegateCount, u.remove && u.remove(e, a));
		}
		p && d.handlers.length === 0 && (u.teardown && u.teardown(e, c, a.handler) !== !1 || Up(e, l, a.handler), delete o[l]);
	}), Object.keys(o).length === 0 && Rp(e));
}
function lm(e, t, ...n) {
	let r = im.create(t);
	r.delegateTarget = e;
	let i = Np(r.type);
	if (i.preDispatch && i.preDispatch(e, r) === !1) return;
	let a = tm(e, r);
	for (let e = 0, t = a.length; e < t && !r.isPropagationStopped(); e += 1) {
		let t = a[e];
		r.currentTarget = t.elem;
		for (let e = 0, i = t.handlers.length; e < i && !r.isImmediatePropagationStopped(); e += 1) {
			let i = t.handlers[e];
			if (r.rnamespace == null || i.namespace && r.rnamespace.test(i.namespace)) {
				r.handleObj = i, r.data = i.data;
				let e = Np(i.originType).handle, a = e ? e(t.elem, r, ...n) : i.handler.call(t.elem, r, ...n);
				a !== void 0 && (r.result = a, a === !1 && (r.preventDefault(), r.stopPropagation()));
			}
		}
	}
	return i.postDispatch && i.postDispatch(e, r), r.result;
}
function um(e, t, n, r) {
	let i = e, a = typeof e == "string" ? e : e.type, o = typeof e == "string" || i.namespace == null ? [] : i.namespace.split("."), s = n;
	if (s.nodeType === 3 || s.nodeType === 8) return;
	a.indexOf(".") > -1 && (o = a.split("."), a = o.shift(), o.sort());
	let c = a.indexOf(":") < 0 && `on${a}`;
	i = e instanceof im ? e : new im(a, typeof e == "object" ? e : null), i.namespace = o.join("."), i.rnamespace = i.namespace ? RegExp(`(^|\\.)${o.join("\\.(?:.*\\.|)")}(\\.|$)`) : null, i.result = void 0, i.target || (i.target = s);
	let l = [i];
	Array.isArray(t) ? l.push(...t) : l.push(t);
	let u = Np(a);
	if (!r && u.trigger && u.trigger(s, i, t) === !1) return;
	let d, f = [s];
	if (!r && !u.noBubble && !nm(s)) {
		d = u.delegateType || a;
		let e = s, t = s.parentNode;
		for (; t != null;) f.push(t), e = t, t = t.parentNode;
		let n = s.ownerDocument || document;
		if (e === n) {
			let t = e.defaultView || e.parentWindow || window;
			f.push(t);
		}
	}
	let p = s;
	for (let e = 0, t = f.length; e < t && !i.isPropagationStopped(); e += 1) {
		let t = f[e];
		p = t, i.type = e > 1 ? d : u.bindType || a;
		let n = Lp(t);
		n && n.events[i.type] && n.handler && n.handler.call(t, ...l);
		let r = c && t[c] || null;
		r && Jp(t) && (i.result = r.call(t, ...l), i.result === !1 && i.preventDefault());
	}
	if (i.type = a, !r && !i.isDefaultPrevented()) {
		let e = u.preventDefault;
		if ((e == null || e(f.pop(), i, t) === !1) && Jp(s) && c && typeof s[a] == "function" && !nm(s)) {
			let e = s[c];
			e && (s[c] = null), om = a, i.isPropagationStopped() && p.addEventListener(a, Vp), s[a](), i.isPropagationStopped() && p.removeEventListener(a, Vp), om = void 0, e && (s[c] = e);
		}
	}
	return i.result;
}
// node_modules/@antv/x6/es/common/dom/event/main.js
var G = class {
	static on(e, t, n, r, i) {
		return dm.on(e, t, n, r, i), e;
	}
	static once(e, t, n, r, i) {
		return dm.on(e, t, n, r, i, !0), e;
	}
	static off(e, t, n, r) {
		return dm.off(e, t, n, r), e;
	}
	static trigger(e, t, n, r) {
		return um(t, n, e, r), e;
	}
}, dm;
(function(e) {
	function t(n, r, i, a, o, s) {
		if (typeof r == "object") typeof i != "string" && (a = a || i, i = void 0), Object.keys(r).forEach((e) => t(n, e, i, a, r[e], s));
		else {
			if (a == null && o == null ? (o = i, a = i = void 0) : o ?? (typeof i == "string" ? (o = a, a = void 0) : (o = a, a = i, i = void 0)), o === !1) o = Bp;
			else if (!o) return;
			if (s) {
				let t = o;
				o = function(r, ...i) {
					return e.off(n, r), t.call(this, r, ...i);
				}, em(o, Zp(t));
			}
			sm(n, r, o, a, i);
		}
	}
	e.on = t;
	function n(e, t, r, i) {
		let a = t;
		if (a && a.preventDefault != null && a.handleObj != null) {
			let e = a.handleObj;
			n(a.delegateTarget, e.namespace ? `${e.originType}.${e.namespace}` : e.originType, e.selector, e.handler);
		} else if (typeof t == "object") {
			let i = t;
			Object.keys(i).forEach((t) => n(e, t, r, i[t]));
		} else (r === !1 || typeof r == "function") && (i = r, r = void 0), i === !1 && (i = Bp), cm(e, t, i, r);
	}
	e.off = n;
})(dm || (dm = {}));
// node_modules/@antv/x6/es/common/dom/mousewheel.js
var fm = class {
	constructor(e, t, n) {
		this.animationFrameId = 0, this.deltaX = 0, this.deltaY = 0, this.eventName = vu("wheel") ? "wheel" : "mousewheel", this.target = e, this.onWheelCallback = t, this.onWheelGuard = n, this.onWheel = this.onWheel.bind(this), this.didWheel = this.didWheel.bind(this);
	}
	enable() {
		this.target.addEventListener(this.eventName, this.onWheel, { passive: !1 });
	}
	disable() {
		this.target.removeEventListener(this.eventName, this.onWheel);
	}
	onWheel(e) {
		if (this.onWheelGuard != null && !this.onWheelGuard(e)) return;
		this.deltaX += e.deltaX, this.deltaY += e.deltaY, e.preventDefault();
		let t;
		(this.deltaX !== 0 || this.deltaY !== 0) && (e.stopPropagation(), t = !0), t === !0 && this.animationFrameId === 0 && (this.animationFrameId = requestAnimationFrame(() => {
			this.didWheel(e);
		}));
	}
	didWheel(e) {
		this.animationFrameId = 0, this.onWheelCallback(e, this.deltaX, this.deltaY), this.deltaX = 0, this.deltaY = 0;
	}
};
// node_modules/@antv/x6/es/common/dom/position.js
function pm(e) {
	let t = e.getBoundingClientRect(), n = e.ownerDocument.defaultView;
	return {
		top: t.top + n.pageYOffset,
		left: t.left + n.pageXOffset
	};
}
function mm(e) {
	return e.getBoundingClientRect().width;
}
function hm(e) {
	return e.getBoundingClientRect().height;
}
function gm(e) {
	let t = gf(e, "position") === "fixed", n;
	if (t) {
		let t = e.getBoundingClientRect();
		n = {
			left: t.left,
			top: t.top
		};
	} else n = pm(e);
	if (!t) {
		let t = e.ownerDocument, r = e.offsetParent || t.documentElement;
		for (; (r === t.body || r === t.documentElement) && gf(r, "position") === "static";) r = r.parentNode;
		if (r !== e && Wd(r)) {
			let e = pm(r);
			n.top -= e.top + _f(r, "borderTopWidth"), n.left -= e.left + _f(r, "borderLeftWidth");
		}
	}
	return {
		top: n.top - _f(e, "marginTop"),
		left: n.left - _f(e, "marginLeft")
	};
}
// node_modules/@antv/x6/es/common/util/index.js
function _m(e, t) {
	let n = mp(e.x, e.y).matrixTransform(t);
	return new I(n.x, n.y);
}
function vm(e, t) {
	return new R(_m(e.start, t), _m(e.end, t));
}
function ym(e, t) {
	let n = Od("svg").createSVGPoint();
	n.x = e.x, n.y = e.y;
	let r = n.matrixTransform(t);
	n.x = e.x + e.width, n.y = e.y;
	let i = n.matrixTransform(t);
	n.x = e.x + e.width, n.y = e.y + e.height;
	let a = n.matrixTransform(t);
	n.x = e.x, n.y = e.y + e.height;
	let o = n.matrixTransform(t), s = Math.min(r.x, i.x, a.x, o.x), c = Math.max(r.x, i.x, a.x, o.x), l = Math.min(r.y, i.y, a.y, o.y), u = Math.max(r.y, i.y, a.y, o.y);
	return new L(s, l, c - s, u - l);
}
function bm(e, t, n) {
	let r = null, i = e.ownerSVGElement;
	if (!i) return new L(0, 0, 0, 0);
	try {
		r = e.getBBox();
	} catch {
		r = {
			x: e.clientLeft,
			y: e.clientTop,
			width: e.clientWidth,
			height: e.clientHeight
		};
	}
	if (t) return L.create(r);
	let a = kp(e, n || i);
	return ym(r, a);
}
function xm(e, t = {}) {
	let n = null;
	if (!e.ownerSVGElement || !wd(e)) {
		if (Gd(e)) {
			let { left: t, top: n, width: r, height: i } = Sm(e);
			return new L(t, n, r, i);
		}
		return new L(0, 0, 0, 0);
	}
	let r = t.target;
	if (!t.recursive) {
		try {
			n = e.getBBox();
		} catch {
			n = {
				x: e.clientLeft,
				y: e.clientTop,
				width: e.clientWidth,
				height: e.clientHeight
			};
		}
		if (!r) return L.create(n);
		let t = kp(e, r);
		return ym(n, t);
	}
	{
		let t = e.childNodes, n = t.length;
		if (n === 0) return xm(e, { target: r });
		r || (r = e);
		let i = null;
		for (let e = 0; e < n; e += 1) {
			let n = t[e], a = null;
			a = n.childNodes.length === 0 ? xm(n, { target: r }) : xm(n, {
				target: r,
				recursive: !0
			}), i = i ? i.union(a) : L.create(a);
		}
		return i || new L(0, 0, 0, 0);
	}
}
function Sm(e) {
	let t = 0, n = 0, r = 0, i = 0;
	if (e) {
		let a = e;
		for (; a;) t += a.offsetLeft, n += a.offsetTop, a = a.offsetParent, a && (t += parseInt(pf(a, "borderLeft"), 10), n += parseInt(pf(a, "borderTop"), 10));
		r = e.offsetWidth, i = e.offsetHeight;
	}
	return {
		left: t,
		top: n,
		width: r,
		height: i
	};
}
function Cm(e) {
	let t = (t) => {
		let n = e.getAttribute(t), r = n ? parseFloat(n) : 0;
		return Number.isNaN(r) ? 0 : r;
	};
	switch (e instanceof SVGElement && e.nodeName.toLowerCase()) {
		case "rect": return new L(t("x"), t("y"), t("width"), t("height"));
		case "circle": return new Gu(t("cx"), t("cy"), t("r"), t("r"));
		case "ellipse": return new Gu(t("cx"), t("cy"), t("rx"), t("ry"));
		case "polyline": return new Qu(ip(e));
		case "polygon": {
			let t = ip(e);
			return t.length > 1 && t.push(t[0]), new Qu(t);
		}
		case "path": {
			let t = e.getAttribute("d");
			return qu(t) || (t = pd(t)), z.parse(t);
		}
		case "line": return new R(t("x1"), t("y1"), t("x2"), t("y2"));
	}
	return xm(e);
}
function wm(e) {
	if (e == null) return null;
	let t = e;
	do {
		let e = t.tagName;
		if (typeof e != "string") return null;
		if (e = e.toUpperCase(), yd(t, "x6-port")) t = t.nextElementSibling;
		else if (e === "G") t = t.firstElementChild;
		else if (e === "TITLE") t = t.nextElementSibling;
		else break;
	} while (t);
	return t;
}
function Tm(e) {
	let t = wm(e);
	if (!wd(t)) {
		if (Gd(e)) {
			let { left: t, top: n, width: r, height: i } = Sm(e);
			return new L(t, n, r, i);
		}
		return new L(0, 0, 0, 0);
	}
	return Cm(t).bbox() || L.create();
}
// node_modules/@antv/x6/es/common/algorithm/priorityqueue.js
var Em = (e, t) => e - t, Dm = class {
	constructor(e = {}) {
		this.comparator = e.comparator || Em, this.index = {}, this.data = e.data || [], this.heapify();
	}
	isEmpty() {
		return this.data.length === 0;
	}
	insert(e, t, n) {
		let r = {
			priority: e,
			value: t
		}, i = this.data.length;
		return n && (r.id = n, this.index[n] = i), this.data.push(r), this.bubbleUp(i), this;
	}
	peek() {
		return this.data[0] ? this.data[0].value : null;
	}
	peekPriority() {
		return this.data[0] ? this.data[0].priority : null;
	}
	updatePriority(e, t) {
		let n = this.index[e];
		if (n === void 0) throw Error(`Node with id '${e}' was not found in the heap.`);
		let r = this.data, i = r[n].priority, a = this.comparator(t, i);
		a < 0 ? (r[n].priority = t, this.bubbleUp(n)) : a > 0 && (r[n].priority = t, this.bubbleDown(n));
	}
	remove() {
		let e = this.data, t = e[0], n = e.pop();
		return t?.id && delete this.index[t.id], e.length > 0 && (e[0] = n, n.id && (this.index[n.id] = 0), this.bubbleDown(0)), t ? t.value : null;
	}
	heapify() {
		for (let e = 0; e < this.data.length; e += 1) this.bubbleUp(e);
	}
	bubbleUp(e) {
		let t = this.data, n, r, i = e;
		for (; i > 0 && (r = i - 1 >>> 1, this.comparator(t[i].priority, t[r].priority) < 0);) {
			n = t[r], t[r] = t[i];
			let e = t[i].id;
			e != null && (this.index[e] = r), t[i] = n, e = t[i].id, e != null && (this.index[e] = i), i = r;
		}
	}
	bubbleDown(e) {
		let t = this.data, n = t.length - 1, r = e;
		for (;;) {
			let e = (r << 1) + 1, i = e + 1, a = r;
			if (e <= n && this.comparator(t[e].priority, t[a].priority) < 0 && (a = e), i <= n && this.comparator(t[i].priority, t[a].priority) < 0 && (a = i), a !== r) {
				let e = t[a];
				t[a] = t[r];
				let n = t[r].id;
				n != null && (this.index[n] = a), t[r] = e, n = t[r].id, n != null && (this.index[n] = r), r = a;
			} else break;
		}
	}
};
// node_modules/@antv/x6/es/common/algorithm/dijkstra.js
function Om(e, t, n = (e, t) => 1) {
	let r = {}, i = {}, a = {}, o = new Dm();
	for (r[t] = 0, Object.keys(e).forEach((e) => {
		e !== t && (r[e] = Infinity), o.insert(r[e], e, e);
	}); !o.isEmpty();) {
		let t = o.remove();
		a[t] = !0;
		let s = e[t];
		for (let e = 0; e < s.length; e += 1) {
			let c = s[e];
			if (!a[c]) {
				let e = r[t] + n(t, c);
				e < r[c] && (r[c] = e, i[c] = t, o.updatePriority(c, e));
			}
		}
	}
	return i;
}
// node_modules/@antv/x6/es/common/animation/util.js
var km = /(-?(?:\d*\.\d+|\d+))\s*(px|em|rem|ch|vh|vw|vmin|vmax|%|cm|mm|in|pt|pc|ex|fr|deg|rad|turn)$/, Am = (e, t) => {
	let n = t - e;
	return (t) => e + n * t;
}, jm = (e, t) => {
	let n = km, r = n.exec(e), i = n.exec(t), a = i ? i[1] : "", o = r ? +r[1] : 0, s = i ? +i[1] : 0, c = a.indexOf("."), l = c > 0 ? a[1].length - c - 1 : 0, u = s - o, d = r ? r[2] : "";
	return (e) => (o + u * e).toFixed(l) + d;
}, Mm = (e, t) => {
	let n = parseInt(e.slice(1), 16), r = parseInt(t.slice(1), 16), i = n & 255, a = (r & 255) - i, o = n & 65280, s = (r & 65280) - o, c = n & 16711680, l = (r & 16711680) - c;
	return (e) => {
		let t = i + a * e & 255, n = o + s * e & 65280, r = c + l * e & 16711680;
		return `#${(1 << 24 | t | n | r).toString(16).slice(1)}`;
	};
}, Nm = (e, t) => {
	let n = (e) => {
		let t = [];
		if (!e) return t;
		let n = /(\w+)\(([^)]+)\)/g, r = n.exec(e);
		for (; r !== null;) r[1] && r[2] && t.push({
			name: r[1],
			values: r[2].split(/\s*,\s*/).filter(Boolean)
		}), r = n.exec(e);
		return t;
	}, r = n(e), i = n(t);
	return r.length === 0 || i.length === 0 ? () => e : (t) => {
		let n = [];
		for (let e = 0; e < Math.min(r.length, i.length); e++) {
			let a = r[e], o = i[e];
			if (a && o && a.name === o.name && a.values.length > 0 && a.values.length === o.values.length) {
				let e = [];
				for (let n = 0; n < a.values.length; n++) {
					let r = a.values[n], i = o.values[n];
					if (r !== void 0 && i !== void 0) {
						if (km.test(r) || km.test(i)) {
							let n = jm(r, i);
							e.push(n(t));
						} else if (!Number.isNaN(parseFloat(r)) && !Number.isNaN(parseFloat(i))) {
							let n = Am(parseFloat(r), parseFloat(i));
							e.push(n(t).toString());
						} else e.push(r);
					}
				}
				e.length > 0 && n.push(`${a.name}(${e.join(", ")})`);
			}
		}
		return n.length > 0 ? n.join(" ") : e;
	};
}, Pm = /* @__PURE__ */ s({
	bounce: () => Bm,
	cubic: () => Lm,
	decorators: () => Vm,
	easeInBack: () => lh,
	easeInBounce: () => gh,
	easeInCirc: () => oh,
	easeInCubic: () => Jm,
	easeInElastic: () => fh,
	easeInExpo: () => rh,
	easeInOutBack: () => dh,
	easeInOutBounce: () => _h,
	easeInOutCirc: () => ch,
	easeInOutCubic: () => Xm,
	easeInOutElastic: () => mh,
	easeInOutExpo: () => ah,
	easeInOutQuad: () => qm,
	easeInOutQuart: () => $m,
	easeInOutQuint: () => nh,
	easeInOutSine: () => Wm,
	easeInQuad: () => Gm,
	easeInQuart: () => Zm,
	easeInQuint: () => eh,
	easeInSine: () => Hm,
	easeOutBack: () => uh,
	easeOutBounce: () => hh,
	easeOutCirc: () => sh,
	easeOutCubic: () => Ym,
	easeOutElastic: () => ph,
	easeOutExpo: () => ih,
	easeOutQuad: () => Km,
	easeOutQuart: () => Qm,
	easeOutQuint: () => th,
	easeOutSine: () => Um,
	exponential: () => zm,
	inout: () => Rm,
	linear: () => Fm,
	quad: () => Im
}), Fm = (e) => e, Im = (e) => e * e, Lm = (e) => e * e * e, Rm = (e) => {
	if (e <= 0) return 0;
	if (e >= 1) return 1;
	let t = e * e, n = t * e;
	return 4 * (e < .5 ? n : 3 * (e - t) + n - .75);
}, zm = (e) => 2 ** (10 * (e - 1)), Bm = ((e) => {
	for (let t = 0, n = 1;; t += n, n /= 2) if (e >= (7 - 4 * t) / 11) {
		let r = (11 - 6 * t - 11 * e) / 4;
		return -r * r + n * n;
	}
}), Vm = {
	reverse(e) {
		return (t) => 1 - e(1 - t);
	},
	reflect(e) {
		return (t) => .5 * (t < .5 ? e(2 * t) : 2 - e(2 - 2 * t));
	},
	clamp(e, t = 0, n = 1) {
		return (r) => {
			let i = e(r);
			return i < t ? t : i > n ? n : i;
		};
	},
	back(e = 1.70158) {
		return (t) => t * t * ((e + 1) * t - e);
	},
	elastic(e = 1.5) {
		return (t) => 2 ** (10 * (t - 1)) * Math.cos(20 * Math.PI * e / 3 * t);
	}
};
function Hm(e) {
	return -1 * Math.cos(Math.PI / 2 * e) + 1;
}
function Um(e) {
	return Math.sin(Math.PI / 2 * e);
}
function Wm(e) {
	return -.5 * (Math.cos(Math.PI * e) - 1);
}
function Gm(e) {
	return e * e;
}
function Km(e) {
	return e * (2 - e);
}
function qm(e) {
	return e < .5 ? 2 * e * e : -1 + (4 - 2 * e) * e;
}
function Jm(e) {
	return e * e * e;
}
function Ym(e) {
	let t = e - 1;
	return t * t * t + 1;
}
function Xm(e) {
	return e < .5 ? 4 * e * e * e : (e - 1) * (2 * e - 2) * (2 * e - 2) + 1;
}
function Zm(e) {
	return e * e * e * e;
}
function Qm(e) {
	let t = e - 1;
	return 1 - t * t * t * t;
}
function $m(e) {
	let t = e - 1;
	return e < .5 ? 8 * e * e * e * e : 1 - 8 * t * t * t * t;
}
function eh(e) {
	return e * e * e * e * e;
}
function th(e) {
	let t = e - 1;
	return 1 + t * t * t * t * t;
}
function nh(e) {
	let t = e - 1;
	return e < .5 ? 16 * e * e * e * e * e : 1 + 16 * t * t * t * t * t;
}
function rh(e) {
	return e === 0 ? 0 : 2 ** (10 * (e - 1));
}
function ih(e) {
	return e === 1 ? 1 : -(2 ** (-10 * e)) + 1;
}
function ah(e) {
	if (e === 0 || e === 1) return e;
	let t = e * 2, n = t - 1;
	return t < 1 ? .5 * 2 ** (10 * n) : .5 * (-(2 ** (-10 * n)) + 2);
}
function oh(e) {
	let t = e / 1;
	return -1 * (Math.sqrt(1 - t * e) - 1);
}
function sh(e) {
	let t = e - 1;
	return Math.sqrt(1 - t * t);
}
function ch(e) {
	let t = e * 2, n = t - 2;
	return t < 1 ? -.5 * (Math.sqrt(1 - t * t) - 1) : .5 * (Math.sqrt(1 - n * n) + 1);
}
function lh(e, t = 1.70158) {
	return e * e * ((t + 1) * e - t);
}
function uh(e, t = 1.70158) {
	let n = e / 1 - 1;
	return n * n * ((t + 1) * n + t) + 1;
}
function dh(e, t = 1.70158) {
	let n = e * 2, r = n - 2, i = t * 1.525;
	return n < 1 ? .5 * n * n * ((i + 1) * n - i) : .5 * (r * r * ((i + 1) * r + i) + 2);
}
function fh(e, t = .7) {
	if (e === 0 || e === 1) return e;
	let n = e / 1 - 1, r = 1 - t, i = r / (2 * Math.PI) * Math.asin(1);
	return -(2 ** (10 * n) * Math.sin((n - i) * (2 * Math.PI) / r));
}
function ph(e, t = .7) {
	let n = 1 - t, r = e * 2;
	if (e === 0 || e === 1) return e;
	let i = n / (2 * Math.PI) * Math.asin(1);
	return 2 ** (-10 * r) * Math.sin((r - i) * (2 * Math.PI) / n) + 1;
}
function mh(e, t = .65) {
	let n = 1 - t;
	if (e === 0 || e === 1) return e;
	let r = e * 2, i = r - 1, a = n / (2 * Math.PI) * Math.asin(1);
	return r < 1 ? -.5 * (2 ** (10 * i) * Math.sin((i - a) * (2 * Math.PI) / n)) : 2 ** (-10 * i) * Math.sin((i - a) * (2 * Math.PI) / n) * .5 + 1;
}
function hh(e) {
	let t = e / 1;
	if (t < 1 / 2.75) return 7.5625 * t * t;
	if (t < 2 / 2.75) {
		let e = t - 1.5 / 2.75;
		return 7.5625 * e * e + .75;
	}
	if (t < 2.5 / 2.75) {
		let e = t - 2.25 / 2.75;
		return 7.5625 * e * e + .9375;
	}
	{
		let e = t - 2.625 / 2.75;
		return 7.5625 * e * e + .984375;
	}
}
function gh(e) {
	return 1 - hh(1 - e);
}
function _h(e) {
	return e < .5 ? gh(e * 2) * .5 : hh(e * 2 - 1) * .5 + .5;
}
// node_modules/@antv/x6/es/common/event/util.js
function vh(e, t) {
	let n = [];
	for (let r = 0; r < e.length; r += 2) {
		let i = e[r], a = e[r + 1], o = Pu(i, a, Array.isArray(t) ? t : [t]);
		n.push(o);
	}
	return Mu(n);
}
// node_modules/@antv/x6/es/common/event/events.js
var yh = class {
	constructor() {
		this.listeners = {};
	}
	on(e, t, n) {
		return t == null || (this.listeners[e] || (this.listeners[e] = []), this.listeners[e].push(t, n)), this;
	}
	once(e, t, n) {
		let r = (...i) => (this.off(e, r), vh([t, n], i));
		return this.on(e, r, this);
	}
	off(e, t, n) {
		if (!(e || t || n)) return this.listeners = {}, this;
		let r = this.listeners;
		return (e ? [e] : Object.keys(r)).forEach((e) => {
			let i = r[e];
			if (i) {
				if (!(t || n)) delete r[e];
				else for (let e = i.length - 2; e >= 0; e -= 2) t && i[e] !== t || n && i[e + 1] !== n || i.splice(e, 2);
			}
		}), this;
	}
	trigger(e, ...t) {
		let n = !0;
		if (e !== "*") {
			let r = this.listeners[e];
			r != null && (n = vh([...r], t));
		}
		let r = this.listeners["*"];
		return r == null ? n : Mu([n, vh([...r], [e, ...t])]);
	}
	emit(e, ...t) {
		return this.trigger(e, ...t);
	}
}, bh = class {
	get disposed() {
		return this._disposed === !0;
	}
	dispose() {
		this._disposed = !0;
	}
};
function K() {
	return (e, t, n) => {
		let r = n.value, i = e.__proto__;
		n.value = function(...e) {
			this.disposed || (r.call(this, ...e), i.dispose.call(this));
		};
	};
}
// node_modules/@antv/x6/es/common/base/basecoat.js
var xh = class extends yh {
	dispose() {
		this.off();
	}
};
k([K()], xh.prototype, "dispose", null), kf(xh, bh);
// node_modules/@antv/x6/es/common/dictionary/index.js
var Sh = class {
	constructor() {
		this.clear();
	}
	clear() {
		this.map = /* @__PURE__ */ new WeakMap(), this.arr = [];
	}
	has(e) {
		return this.map.has(e);
	}
	get(e) {
		return this.map.get(e);
	}
	set(e, t) {
		this.map.set(e, t), this.arr.push(e);
	}
	delete(e) {
		let t = this.arr.indexOf(e);
		t >= 0 && this.arr.splice(t, 1);
		let n = this.map.get(e);
		return this.map.delete(e), n;
	}
	each(e) {
		this.arr.forEach((t) => {
			e(this.map.get(t), t);
		});
	}
	dispose() {
		this.clear();
	}
};
// node_modules/@antv/x6/es/common/modifier/index.js
function Ch(e) {
	let t = [], n = [];
	return Array.isArray(e) ? t.push(...e) : e.split("|").forEach((e) => {
		e.indexOf("&") === -1 ? t.push(e) : n.push(...e.split("&"));
	}), {
		or: t,
		and: n
	};
}
function wh(e, t) {
	if (e != null && t != null) {
		let n = Ch(e), r = Ch(t), i = n.or.sort(), a = r.or.sort(), o = n.and.sort(), s = r.and.sort(), c = (e, t) => e.length === t.length && (e.length === 0 || e.every((e, n) => e === t[n]));
		return c(i, a) && c(o, s);
	}
	return e == null && t == null;
}
function Th(e, t, n) {
	if (t == null || Array.isArray(t) && t.length === 0) return !n || e.altKey !== !0 && e.ctrlKey !== !0 && e.metaKey !== !0 && e.shiftKey !== !0;
	let { or: r, and: i } = Ch(t), a = (t) => e[`${t.toLowerCase()}Key`] === !0;
	return r.some((e) => a(e)) && i.every((e) => a(e));
}
// node_modules/@antv/x6/es/registry/registry.js
var q = class e {
	static create(t) {
		return new e(t);
	}
	constructor(e) {
		this.options = Object.assign({}, e), this.data = this.options.data || {}, this.register = this.register.bind(this), this.unregister = this.unregister.bind(this);
	}
	get names() {
		return Object.keys(this.data);
	}
	register(e, t, n = !1) {
		if (typeof e == "object") {
			Object.entries(e).forEach(([e, n]) => {
				this.register(e, n, t);
			});
			return;
		}
		this.exist(e) && !n && !gu() && this.onDuplicated(e);
		let r = this.options.process, i = r ? F(r, this, e, t) : t;
		return this.data[e] = i, i;
	}
	unregister(e) {
		let t = e ? this.data[e] : null;
		return delete this.data[e], t;
	}
	get(e) {
		return e ? this.data[e] : null;
	}
	exist(e) {
		return e ? this.data[e] != null : !1;
	}
	onDuplicated(e) {
		try {
			throw this.options.onConflict && F(this.options.onConflict, this, e), Error(`${Ai(this.options.type)} with name '${e}' already registered.`);
		} catch (e) {
			throw e;
		}
	}
	onNotFound(e, t) {
		throw Error(this.getSpellingSuggestion(e, t));
	}
	getSpellingSuggestion(e, t) {
		let n = this.getSpellingSuggestionForName(e);
		return `${Ai(t ? `${t} ${kl(this.options.type)}` : this.options.type)} with name '${e}' does not exist.${n ? ` Did you mean '${n}'?` : ""}`;
	}
	getSpellingSuggestionForName(e) {
		return xf(e, Object.keys(this.data), (e) => e);
	}
}, Eh = {}, Dh = { position: Xh("x", "width", "origin") }, Oh = { position: Xh("y", "height", "origin") }, kh = { position: Xh("x", "width", "corner") }, Ah = { position: Xh("y", "height", "corner") }, jh = { set: Zh("width", "width") }, Mh = { set: Zh("height", "height") }, Nh = { set: Zh("rx", "width") }, Ph = { set: Zh("ry", "height") }, Fh = { set: ((e) => {
	let t = Zh(e, "width"), n = Zh(e, "height");
	return function(e, r) {
		let i = r.refBBox;
		return F(i.height > i.width ? t : n, this, e, r);
	};
})("r") }, Ih = { set(e, { refBBox: t }) {
	let n = parseFloat(e), r = iu(e);
	r && (n /= 100);
	let i = Math.sqrt(t.height * t.height + t.width * t.width), a;
	return Number.isFinite(n) && (a = r || n >= 0 && n <= 1 ? n * i : Math.max(n + i, 0)), { r: a };
} }, Lh = { set: Zh("cx", "width") }, Rh = { set: Zh("cy", "height") }, zh = { set: $h({ resetOffset: !0 }) }, Bh = { set: $h({ resetOffset: !1 }) }, Vh = { set: eg({ resetOffset: !0 }) }, Hh = { set: eg({ resetOffset: !1 }) }, Uh = Fh, Wh = zh, Gh = Vh, Kh = Dh, qh = Oh, Jh = jh, Yh = Mh;
function Xh(e, t, n) {
	return (r, { refBBox: i }) => {
		if (r == null) return null;
		let a = parseFloat(r), o = iu(r);
		o && (a /= 100);
		let s;
		if (Number.isFinite(a)) {
			let r = i[n];
			s = o || a > 0 && a < 1 ? r[e] + i[t] * a : r[e] + a;
		}
		let c = new I();
		return c[e] = s || 0, c;
	};
}
function Zh(e, t) {
	return (n, { refBBox: r }) => {
		let i = parseFloat(n), a = iu(n);
		a && (i /= 100);
		let o = {};
		return Number.isFinite(i) && (o[e] = a || i >= 0 && i <= 1 ? i * r[t] : Math.max(i + r[t], 0)), o;
	};
}
function Qh(e, t) {
	let n = "x6-shape", r = t && t.resetOffset;
	return (t, { elem: i, refBBox: a }) => {
		let o = Ef(i, n);
		if (!o || o.value !== t) {
			let r = e(t);
			o = {
				value: t,
				shape: r,
				shapeBBox: r.bbox()
			}, Ef(i, n, o);
		}
		let s = o.shape.clone(), c = o.shapeBBox.clone(), l = c.getOrigin(), u = a.getOrigin();
		c.x = u.x, c.y = u.y;
		let d = a.getMaxScaleToFit(c, u), f = c.width === 0 || a.width === 0 ? 1 : d.sx, p = c.height === 0 || a.height === 0 ? 1 : d.sy;
		return s.scale(f, p, l), r && s.translate(-l.x, -l.y), s;
	};
}
function $h(e) {
	function t(e) {
		return z.parse(e);
	}
	let n = Qh(t, e);
	return (e, t) => ({ d: n(e, t).serialize() });
}
function eg(e) {
	let t = Qh((e) => new Qu(e), e);
	return (e, n) => ({ points: t(e, n).serialize() });
}
// node_modules/@antv/x6/es/registry/attr/fill.js
var tg = {
	qualify: ii,
	set(e, { view: t }) {
		return `url(#${t.graph.defineGradient(e)})`;
	}
}, ng = {
	qualify: ii,
	set(e, { view: t }) {
		let n = t.cell, r = Object.assign({}, e);
		if (n.isEdge() && r.type === "linearGradient") {
			let e = t, i = e.sourcePoint, a = e.targetPoint;
			r.id = `gradient-${r.type}-${n.id}`, r.attrs = Object.assign(Object.assign({}, r.attrs), {
				x1: i.x,
				y1: i.y,
				x2: a.x,
				y2: a.y,
				gradientUnits: "userSpaceOnUse"
			}), t.graph.defs.remove(r.id);
		}
		return `url(#${t.graph.defineGradient(r)})`;
	}
}, rg = {
	qualify(e, { attrs: t }) {
		return t.textWrap == null || !ii(t.textWrap);
	},
	set(e, { view: t, elem: n, attrs: r }) {
		let i = "x6-text", a = Ef(n, i), o = (e) => {
			try {
				if (typeof e == "string") return JSON.parse(e);
			} catch {}
			return e;
		}, s = {
			x: r.x,
			eol: r.eol,
			annotations: o(r.annotations),
			textPath: o(r["text-path"] || r.textPath),
			textVerticalAnchor: r["text-vertical-anchor"] || r.textVerticalAnchor,
			displayEmpty: (r["display-empty"] || r.displayEmpty) === "true",
			lineHeight: r["line-height"] || r.lineHeight
		}, c = r["font-size"] || r.fontSize, l = JSON.stringify([e, s]);
		if (c && n.setAttribute("font-size", c), a == null || a !== l) {
			let r = s.textPath;
			if (typeof r == "object" && r) {
				let e = r.selector;
				if (typeof e == "string") {
					let n = t.find(e)[0];
					n instanceof SVGPathElement && (Cd(n), s.textPath = Object.assign({ "xlink:href": `#${n.id}` }, r));
				}
			}
			qf(n, `${e}`, s), Ef(n, i, l);
		}
	}
}, ig = {
	qualify: ii,
	set(e, { view: t, elem: n, attrs: r, refBBox: i }) {
		let a = e, o = a.width || 0;
		iu(o) ? i.width *= parseFloat(o) / 100 : o <= 0 ? i.width += o : i.width = o;
		let s = a.height || 0;
		iu(s) ? i.height *= parseFloat(s) / 100 : s <= 0 ? i.height += s : i.height = s;
		let c, l = a.text ?? r.text ?? n?.textContent;
		c = l == null ? "" : Xf(`${l}`, i, {
			"font-weight": r["font-weight"] || r.fontWeight,
			"font-size": r["font-size"] || r.fontSize,
			"font-family": r["font-family"] || r.fontFamily,
			lineHeight: r.lineHeight
		}, { ellipsis: a.ellipsis }), F(rg.set, this, c, {
			view: t,
			elem: n,
			attrs: r,
			refBBox: i,
			cell: t.cell
		});
	}
}, ag = (e, { attrs: t }) => t.text !== void 0, og = { qualify: ag }, sg = { qualify: ag }, cg = { qualify: ag }, lg = { qualify: ag }, ug = { qualify: ag }, dg = { qualify: ag }, fg = {
	qualify(e, { elem: t }) {
		return t instanceof SVGElement;
	},
	set(e, { elem: t }) {
		let n = "x6-title", r = `${e}`, i = Ef(t, n);
		if (i == null || i !== r) {
			Ef(t, n, r);
			let e = t.firstChild;
			if (e && e.tagName.toUpperCase() === "TITLE") {
				let t = e;
				t.textContent = r;
			} else {
				let n = document.createElementNS(t.namespaceURI, "title");
				n.textContent = r, t.insertBefore(n, e);
			}
		}
	}
}, pg = { offset: gg("x", "width", "right") }, mg = { offset: gg("y", "height", "bottom") }, hg = { offset(e, { refBBox: t }) {
	return e ? {
		x: -t.x,
		y: -t.y
	} : {
		x: 0,
		y: 0
	};
} };
function gg(e, t, n) {
	return (r, { refBBox: i }) => {
		let a = new I(), o;
		return o = r === "middle" ? i[t] / 2 : r === n ? i[t] : typeof r == "number" && Number.isFinite(r) ? r > -1 && r < 1 ? -i[t] * r : -r : iu(r) ? i[t] * parseFloat(r) / 100 : 0, a[e] = -(i[e] + o), a;
	};
}
// node_modules/@antv/x6/es/registry/attr/style.js
var _g = {
	qualify: ii,
	set(e, { elem: t }) {
		U(t, e);
	}
}, vg = { set(e, { elem: t }) {
	t.innerHTML = `${e}`;
} }, yg = {
	qualify: ii,
	set(e, { view: t }) {
		return `url(#${t.graph.defineFilter(e)})`;
	}
}, bg = { set(e) {
	return typeof e == "object" && e && e.id ? e.id : e;
} }, xg = (e) => {
	var { size: t, width: n, height: r, offset: i, open: a } = e, o = O(e, [
		"size",
		"width",
		"height",
		"offset",
		"open"
	]);
	return Cg({
		size: t,
		width: n,
		height: r,
		offset: i
	}, a === !0, !0, void 0, o);
}, Sg = (e) => {
	var { size: t, width: n, height: r, offset: i, factor: a } = e, o = O(e, [
		"size",
		"width",
		"height",
		"offset",
		"factor"
	]);
	return Cg({
		size: t,
		width: n,
		height: r,
		offset: i
	}, !1, !1, a, o);
};
function Cg(e, t, n, r = 3 / 4, i = {}) {
	let a = e.size || 10, o = e.width || a, s = e.height || a, c = new z(), l = {};
	if (t) c.moveTo(o, 0).lineTo(0, s / 2).lineTo(o, s), l.fill = "none";
	else {
		if (c.moveTo(0, s / 2), c.lineTo(o, 0), !n) {
			let e = ja(r, 0, 1);
			c.lineTo(o * e, s / 2);
		}
		c.lineTo(o, s), c.close();
	}
	return Object.assign(Object.assign(Object.assign({}, l), i), {
		tagName: "path",
		d: md(c.serialize(), { x: e.offset == null ? -o / 2 : e.offset })
	});
}
// node_modules/@antv/x6/es/registry/marker/diamond.js
var wg = (e) => {
	var { size: t, width: n, height: r, offset: i } = e, a = O(e, [
		"size",
		"width",
		"height",
		"offset"
	]);
	let o = t || 10, s = n || o, c = r || o, l = new z();
	return l.moveTo(0, c / 2).lineTo(s / 2, 0).lineTo(s, c / 2).lineTo(s / 2, c).close(), Object.assign(Object.assign({}, a), {
		tagName: "path",
		d: md(l.serialize(), i ?? -s / 2)
	});
}, Tg = (e) => {
	var { d: t, offsetX: n, offsetY: r } = e, i = O(e, [
		"d",
		"offsetX",
		"offsetY"
	]);
	return Object.assign(Object.assign({}, i), {
		tagName: "path",
		d: md(t, n, r)
	});
}, Eg = (e) => {
	var { size: t, width: n, height: r, offset: i } = e, a = O(e, [
		"size",
		"width",
		"height",
		"offset"
	]);
	let o = t || 10, s = n || o, c = r || o, l = new z();
	return l.moveTo(0, 0).lineTo(s, c).moveTo(0, c).lineTo(s, 0), Object.assign(Object.assign({}, a), {
		tagName: "path",
		fill: "none",
		d: md(l.serialize(), i || -s / 2)
	});
}, Dg = (e) => {
	var { width: t, height: n, offset: r, open: i, flip: a } = e, o = O(e, [
		"width",
		"height",
		"offset",
		"open",
		"flip"
	]);
	let s = n || 6, c = t || 10, l = i === !0, u = a === !0, d = Object.assign(Object.assign({}, o), { tagName: "path" });
	u && (s = -s);
	let f = new z();
	return f.moveTo(0, s).lineTo(c, 0), l ? d.fill = "none" : (f.lineTo(c, s), f.close()), d.d = md(f.serialize(), {
		x: r || -c / 2,
		y: s / 2
	}), d;
}, Og = (e) => {
	var { r: t } = e, n = O(e, ["r"]);
	let r = t || 5;
	return Object.assign(Object.assign({ cx: r }, n), {
		tagName: "circle",
		r
	});
}, kg = (e) => {
	var { r: t } = e, n = O(e, ["r"]);
	let r = t || 5, i = new z();
	return i.moveTo(r, 0).lineTo(r, r * 2), i.moveTo(0, r).lineTo(r * 2, r), { children: [Object.assign(Object.assign({}, Og({ r })), { fill: "none" }), Object.assign(Object.assign({}, n), {
		tagName: "path",
		d: md(i.serialize(), -r)
	})] };
}, Ag = (e) => {
	var { rx: t, ry: n } = e, r = O(e, ["rx", "ry"]);
	let i = t || 5, a = n || 5;
	return Object.assign(Object.assign({ cx: i }, r), {
		tagName: "ellipse",
		rx: i,
		ry: a
	});
}, jg = /* @__PURE__ */ s({
	async: () => Dg,
	block: () => xg,
	circle: () => Og,
	circlePlus: () => kg,
	classic: () => Sg,
	cross: () => Eg,
	diamond: () => wg,
	ellipse: () => Ag,
	path: () => Tg
}), Mg = q.create({ type: "marker" });
Mg.register(jg, !0);
// node_modules/@antv/x6/es/registry/attr/marker.js
function Ng(e) {
	return typeof e == "string" || ii(e);
}
var Pg = {
	qualify: Ng,
	set(e, { view: t, attrs: n }) {
		return Lg("marker-start", e, t, n);
	}
}, Fg = {
	qualify: Ng,
	set(e, { view: t, attrs: n }) {
		return Lg("marker-end", e, t, n, { transform: "rotate(180)" });
	}
}, Ig = {
	qualify: Ng,
	set(e, { view: t, attrs: n }) {
		return Lg("marker-mid", e, t, n);
	}
};
function Lg(e, t, n, r, i = {}) {
	let a = typeof t == "string" ? { name: t } : t, { name: o, args: s } = a, c = O(a, ["name", "args"]), l = c;
	if (o && typeof o == "string") {
		let e = Mg.get(o);
		if (e) l = e(Object.assign(Object.assign({}, c), s));
		else return Mg.onNotFound(o);
	}
	let u = Object.assign(Object.assign(Object.assign({}, Rg(r, e)), i), l);
	return { [e]: `url(#${n.graph.defineMarker(u)})` };
}
function Rg(e, t) {
	let n = {}, r = e.stroke;
	if (typeof r == "string" && (n.stroke = r, n.fill = r), t !== "marker-mid") {
		let r = parseFloat(e.strokeWidth || e["stroke-width"]);
		if (Number.isFinite(r) && r > 1) {
			let e = Math.ceil(r / 2);
			n.refX = t === "marker-start" ? e : -e;
		}
	}
	return n;
}
// node_modules/@antv/x6/es/registry/attr/connection.js
var zg = (e, { view: t }) => t.cell.isEdge(), Bg = {
	qualify: zg,
	set(e, t) {
		let n = t.view, r = e.reverse || !1, i = e.stubs || 0, a;
		if (Number.isFinite(i) && i !== 0) {
			if (r) {
				let e, t, r = n.getConnectionLength() || 0;
				i < 0 ? (e = (r + i) / 2, t = -i) : (e = i, t = r - i * 2), a = ((n.getConnection()?.divideAtLength(e)?.[1])?.divideAtLength(t)?.[0])?.serialize();
			} else {
				let e;
				e = i < 0 ? ((n.getConnectionLength() || 0) + i) / 2 : i;
				let t = n.getConnection();
				if (t) {
					let n = t.divideAtLength(e), r = t.divideAtLength(-e);
					n && r && (a = `${n[0].serialize()} ${r[1].serialize()}`);
				}
			}
		}
		return { d: a || n.getConnectionPathData() };
	}
}, Vg = {
	qualify: zg,
	set: qg("getTangentAtLength", { rotate: !0 })
}, Hg = {
	qualify: zg,
	set: qg("getTangentAtLength", { rotate: !1 })
}, Ug = {
	qualify: zg,
	set: qg("getTangentAtRatio", { rotate: !0 })
}, Wg = {
	qualify: zg,
	set: qg("getTangentAtRatio", { rotate: !1 })
}, Gg = Vg, Kg = Ug;
function qg(e, t) {
	let n = {
		x: 1,
		y: 0
	};
	return (r, i) => {
		let a, o, s = i.view, c = s[e](Number(r));
		return c ? (o = t.rotate ? c.vector().vectorAngle(n) : 0, a = c.start) : (a = s.path.start, o = 0), o === 0 || Number.isNaN(o) ? { transform: `translate(${a.x},${a.y})` } : { transform: `translate(${a.x},${a.y}) rotate(${o})` };
	};
}
// node_modules/@antv/x6/es/registry/attr/main.js
var Jg = /* @__PURE__ */ s({
	annotations: () => lg,
	atConnectionLength: () => Gg,
	atConnectionLengthIgnoreGradient: () => Hg,
	atConnectionLengthKeepGradient: () => Vg,
	atConnectionRatio: () => Kg,
	atConnectionRatioIgnoreGradient: () => Wg,
	atConnectionRatioKeepGradient: () => Ug,
	connection: () => Bg,
	displayEmpty: () => dg,
	eol: () => ug,
	fill: () => tg,
	filter: () => yg,
	html: () => vg,
	lineHeight: () => og,
	port: () => bg,
	ref: () => Eh,
	refCx: () => Lh,
	refCy: () => Rh,
	refD: () => Wh,
	refDKeepOffset: () => Bh,
	refDResetOffset: () => zh,
	refDx: () => kh,
	refDy: () => Ah,
	refHeight: () => Mh,
	refHeight2: () => Yh,
	refPoints: () => Gh,
	refPointsKeepOffset: () => Hh,
	refPointsResetOffset: () => Vh,
	refR: () => Uh,
	refRCircumscribed: () => Ih,
	refRInscribed: () => Fh,
	refRx: () => Nh,
	refRy: () => Ph,
	refWidth: () => jh,
	refWidth2: () => Jh,
	refX: () => Dh,
	refX2: () => Kh,
	refY: () => Oh,
	refY2: () => qh,
	resetOffset: () => hg,
	sourceMarker: () => Pg,
	stroke: () => ng,
	style: () => _g,
	targetMarker: () => Fg,
	text: () => rg,
	textPath: () => cg,
	textVerticalAnchor: () => sg,
	textWrap: () => ig,
	title: () => fg,
	vertexMarker: () => Ig,
	xAlign: () => pg,
	yAlign: () => mg
}), Yg = {
	xlinkHref: "xlink:href",
	xlinkShow: "xlink:show",
	xlinkRole: "xlink:role",
	xlinkType: "xlink:type",
	xlinkArcrole: "xlink:arcrole",
	xlinkTitle: "xlink:title",
	xlinkActuate: "xlink:actuate",
	xmlSpace: "xml:space",
	xmlBase: "xml:base",
	xmlLang: "xml:lang",
	preserveAspectRatio: "preserveAspectRatio",
	requiredExtension: "requiredExtension",
	requiredFeatures: "requiredFeatures",
	systemLanguage: "systemLanguage",
	externalResourcesRequired: "externalResourceRequired"
};
// node_modules/@antv/x6/es/registry/attr/index.js
function Xg(e, t, n) {
	return !(e == null || typeof e != "string" && typeof e.qualify == "function" && !F(e.qualify, this, t, n));
}
var Zg = Object.assign(Object.assign({}, Yg), Jg), Qg = q.create({ type: "attribute definition" });
Qg.register(Zg, !0);
// node_modules/@antv/x6/es/registry/background/flip-x.js
var $g = (e) => {
	let t = document.createElement("canvas"), n = e.width, r = e.height;
	t.width = n * 2, t.height = r;
	let i = t.getContext("2d");
	return i.drawImage(e, 0, 0, n, r), i.translate(2 * n, 0), i.scale(-1, 1), i.drawImage(e, 0, 0, n, r), t;
}, e_ = (e) => {
	let t = document.createElement("canvas"), n = e.width, r = e.height;
	t.width = n, t.height = r * 2;
	let i = t.getContext("2d");
	return i.drawImage(e, 0, 0, n, r), i.translate(0, 2 * r), i.scale(1, -1), i.drawImage(e, 0, 0, n, r), t;
}, t_ = (e) => {
	let t = document.createElement("canvas"), n = e.width, r = e.height;
	t.width = 2 * n, t.height = 2 * r;
	let i = t.getContext("2d");
	return i.drawImage(e, 0, 0, n, r), i.setTransform(-1, 0, 0, -1, t.width, t.height), i.drawImage(e, 0, 0, n, r), i.setTransform(-1, 0, 0, 1, t.width, 0), i.drawImage(e, 0, 0, n, r), i.setTransform(1, 0, 0, -1, 0, t.height), i.drawImage(e, 0, 0, n, r), t;
}, n_ = (e, t) => {
	let n = e.width, r = e.height, i = document.createElement("canvas");
	i.width = n * 3, i.height = r * 3;
	let a = i.getContext("2d"), o = Iu(t.angle == null ? -20 : -t.angle), s = i.width / 4, c = i.height / 4;
	for (let t = 0; t < 4; t += 1) for (let i = 0; i < 4; i += 1) (t + i) % 2 > 0 && (a.setTransform(1, 0, 0, 1, (2 * t - 1) * s, (2 * i - 1) * c), a.rotate(o), a.drawImage(e, -n / 2, -r / 2, n, r));
	return i;
}, r_ = Object.assign({}, /* @__PURE__ */ s({
	flipX: () => $g,
	flipXY: () => t_,
	flipY: () => e_,
	watermark: () => n_
}));
r_["flip-x"] = $g, r_["flip-y"] = e_, r_["flip-xy"] = t_;
var i_ = q.create({ type: "background pattern" });
i_.register(r_, !0);
// node_modules/@antv/x6/es/registry/connection-point/util.js
function a_(e, t, n) {
	let r;
	if (typeof n == "object") {
		if (Number.isFinite(n.y)) {
			let { start: r, end: i } = new R(t, e).parallel(n.y);
			t = r, e = i;
		}
		r = n.x;
	} else r = n;
	if (r == null || !Number.isFinite(r)) return e;
	let i = e.distance(t);
	return r === 0 && i > 0 ? e : e.move(t, -Math.min(r, i - 1));
}
function o_(e) {
	let t = e.getAttribute("stroke-width");
	return t === null ? 0 : parseFloat(t) || 0;
}
function s_(e) {
	if (e == null) return null;
	let t = e;
	do {
		let e = t.tagName;
		if (typeof e != "string") return null;
		if (e = e.toUpperCase(), e === "G") t = t.firstElementChild;
		else if (e === "TITLE") t = t.nextElementSibling;
		else break;
	} while (t);
	return t;
}
// node_modules/@antv/x6/es/registry/connection-point/bbox.js
var c_ = (e, t, n, r) => {
	let i = t.getBBoxOfElement(n);
	r.stroked && i.inflate(o_(n) / 2);
	let a = e.intersect(i);
	return a_(a && a.length ? e.start.closest(a) : e.end, e.start, r.offset);
}, l_ = function(e, t, n, r, i) {
	let a = t.cell, o = a.isNode() ? a.getAngle() : 0;
	if (o === 0) return F(c_, this, e, t, n, r, i);
	let s = t.getUnrotatedBBoxOfElement(n);
	r.stroked && s.inflate(o_(n) / 2);
	let c = s.getCenter(), l = e.clone().rotate(o, c), u = l.setLength(1e6).intersect(s);
	return a_(u && u.length ? l.start.closest(u).rotate(-o, c) : e.end, e.start, r.offset);
}, u_ = (e, t, n, r) => {
	let i, a, o = e.end, s = r.selector;
	if (i = typeof s == "string" ? t.findOne(s) : Array.isArray(s) ? If(n, s) : s_(n), !wd(i)) {
		if (i === n || !wd(n)) return o;
		i = n;
	}
	let c = t.getShapeOfElement(i), l = t.getMatrixOfElement(i), u = t.getRootTranslatedMatrix(), d = t.getRootRotatedMatrix(), f = u.multiply(d).multiply(l), p = vm(e, f.inverse()), m = p.start.clone(), h = t.getDataOfElement(i);
	if (r.insideout === !1) {
		h.shapeBBox ?? (h.shapeBBox = c.bbox());
		let e = h.shapeBBox;
		if (e != null && e.containsPoint(m)) return o;
	}
	r.extrapolate === !0 && p.setLength(1e6);
	let g;
	if (z.isPath(c)) {
		let e = r.precision || 2;
		h.segmentSubdivisions ?? (h.segmentSubdivisions = c.getSegmentSubdivisions({ precision: e })), g = {
			precision: e,
			segmentSubdivisions: h.segmentSubdivisions
		}, a = p.intersect(c, g);
	} else a = p.intersect(c);
	a ? Array.isArray(a) && (a = m.closest(a)) : r.sticky === !0 && (a = L.isRectangle(c) ? c.getNearestPointToPoint(m) : Gu.isEllipse(c) ? c.intersectsWithLineFromCenterToPoint(m) : c.closestPoint(m, g));
	let _ = a ? _m(a, f) : o, v = r.offset || 0;
	return r.stroked !== !1 && (typeof v == "object" ? (v = Object.assign({}, v), v.x ?? (v.x = 0), v.x += o_(i) / 2) : v += o_(i) / 2), a_(_, e.start, v);
};
// node_modules/@antv/x6/es/registry/connection-point/anchor.js
function d_(e, t, n = 0) {
	let { start: r, end: i } = e, a, o, s, c;
	switch (t) {
		case "left":
			c = "x", a = i, o = r, s = -1;
			break;
		case "right":
			c = "x", a = r, o = i, s = 1;
			break;
		case "top":
			c = "y", a = i, o = r, s = -1;
			break;
		case "bottom":
			c = "y", a = r, o = i, s = 1;
			break;
		default: return;
	}
	r[c] < i[c] ? a[c] = o[c] : o[c] = a[c], Number.isFinite(n) && (a[c] += s * n, o[c] += s * n);
}
var f_ = (e, t, n, r) => {
	let { alignOffset: i, align: a } = r;
	return a && d_(e, a, i), a_(e.end, e.start, r.offset);
}, p_ = /* @__PURE__ */ s({
	anchor: () => f_,
	bbox: () => c_,
	boundary: () => u_,
	rect: () => l_
}), m_ = q.create({ type: "connection point" });
m_.register(p_, !0);
// node_modules/@antv/x6/es/registry/connector/jumpover.js
var h_ = 1, g_ = 1 / 3, __ = 2 / 3, v_ = [], y_ = [];
function b_(e) {
	let t = e.graph._jumpOverUpdateList;
	if (t ?? (t = e.graph._jumpOverUpdateList = [], e.graph.on("cell:mouseup", () => {
		let t = e.graph._jumpOverUpdateList;
		setTimeout(() => {
			for (let e = 0; e < t.length; e += 1) t[e].update();
		});
	}), e.graph.on("model:reseted", () => {
		t = e.graph._jumpOverUpdateList = [];
	})), t.indexOf(e) < 0) {
		t.push(e);
		let n = () => t.splice(t.indexOf(e), 1);
		e.cell.once("change:connector", n), e.cell.once("removed", n);
	}
}
function x_(e, t, n = []) {
	let r = [
		e,
		...n,
		t
	], i = [];
	return r.forEach((e, t) => {
		let n = r[t + 1];
		n != null && i.push(new R(e, n));
	}), i;
}
function S_(e, t) {
	let n = [];
	return t.forEach((t) => {
		let r = e.intersectsWithLine(t);
		if (r) {
			let { x: e, y: i } = r, { start: a, end: o } = t, s = Math.round(a.x) === Math.round(e) && Math.round(a.y) === Math.round(i), c = Math.round(o.x) === Math.round(e) && Math.round(o.y) === Math.round(i);
			if (s || c) return;
			n.push(r);
		}
	}), n;
}
function C_(e, t) {
	return new R(e, t).squaredLength();
}
function w_(e, t, n) {
	return t.reduce((r, i, a) => {
		if (y_.includes(i)) return r;
		let o = r.pop() || e, s = I.create(i).move(o.start, -n), c = I.create(i).move(o.start, +n), l = t[a + 1];
		if (l != null) {
			let e = c.distance(l);
			e <= n && (c = l.move(o.start, e), y_.push(l));
		} else if (s.distance(o.end) < n * 2 + h_) return r.push(o), r;
		if (c.distance(o.start) < n * 2 + h_) return r.push(o), r;
		let u = new R(s, c);
		return v_.push(u), r.push(new R(o.start, s), u, new R(c, o.end)), r;
	}, []);
}
function T_(e, t, n, r) {
	let i = new z(), a;
	return a = z.createSegment("M", e[0].start), i.appendSegment(a), e.forEach((o, s) => {
		if (v_.includes(o)) {
			let e, r, s, c;
			if (n === "arc") {
				e = -90, r = o.start.diff(o.end), (r.x < 0 || r.x === 0 && r.y < 0) && (e += 180);
				let t = o.getCenter(), n = new R(t, o.end).rotate(e, t), l;
				l = new R(o.start, t), s = l.pointAt(2 / 3).rotate(e, o.start), c = n.pointAt(1 / 3).rotate(-e, n.end), a = z.createSegment("C", s, c, n.end), i.appendSegment(a), l = new R(t, o.end), s = n.pointAt(1 / 3).rotate(e, n.end), c = l.pointAt(1 / 3).rotate(-e, o.end), a = z.createSegment("C", s, c, o.end), i.appendSegment(a);
			} else if (n === "gap") a = z.createSegment("M", o.end), i.appendSegment(a);
			else if (n === "cubic") {
				e = o.start.theta(o.end);
				let n = t * .6, l = t * 1.35;
				r = o.start.diff(o.end), (r.x < 0 || r.x === 0 && r.y < 0) && (l *= -1), s = new I(o.start.x + n, o.start.y + l).rotate(e, o.start), c = new I(o.end.x - n, o.end.y + l).rotate(e, o.end), a = z.createSegment("C", s, c, o.end), i.appendSegment(a);
			}
		} else {
			let t = e[s + 1];
			r === 0 || !t || v_.includes(t) ? (a = z.createSegment("L", o.end), i.appendSegment(a)) : E_(r, i, o.end, o.start, t.end);
		}
	}), i;
}
function E_(e, t, n, r, i) {
	let a = n.distance(r) / 2, o = n.distance(i) / 2, s = -Math.min(e, a), c = -Math.min(e, o), l = n.clone().move(r, s).round(), u = n.clone().move(i, c).round(), d = new I(g_ * l.x + __ * n.x, __ * n.y + g_ * l.y), f = new I(g_ * u.x + __ * n.x, __ * n.y + g_ * u.y), p;
	p = z.createSegment("L", l), t.appendSegment(p), p = z.createSegment("C", d, f, u), t.appendSegment(p);
}
var D_ = function(e, t, n, r = {}) {
	v_ = [], y_ = [], b_(this);
	let i = r.size || 5, a = r.type || "arc", o = r.radius || 0, s = r.ignoreConnectors || ["smooth"], c = this.graph, l = c.model.getEdges();
	if (l.length === 1) return T_(x_(e, t, n), i, a, o);
	let u = this.cell, d = l.indexOf(u), f = c.options.connecting.connector || {}, p = l.filter((e, t) => {
		let n = e.getConnector() || f;
		return s.includes(n.name) ? !1 : t > d ? n.name !== "jumpover" : !0;
	}), m = p.map((e) => c.findViewByCell(e)), h = x_(e, t, n), g = m.map((e) => e == null ? [] : e === this ? h : x_(e.sourcePoint, e.targetPoint, e.routePoints)), _ = [];
	h.forEach((e) => {
		let t = p.reduce((t, n, r) => {
			if (n !== u) {
				let n = S_(e, g[r]);
				t.push(...n);
			}
			return t;
		}, []).sort((t, n) => C_(e.start, t) - C_(e.start, n));
		t.length > 0 ? _.push(...w_(e, t, i)) : _.push(e);
	});
	let v = T_(_, i, a, o);
	return v_ = [], y_ = [], r.raw ? v : v.serialize();
}, O_ = (e, t, n, r = {}) => {
	let i = n.length === 3 ? 0 : 1, a = I.create(n[0 + i]), o = I.create(n[2 + i]), s = I.create(n[1 + i]);
	if (!I.equals(e, t)) {
		let n = new I((e.x + t.x) / 2, (e.y + t.y) / 2), r = n.angleBetween(I.create(e).rotate(90, n), s);
		r > 1 && (a.rotate(180 - r, n), o.rotate(180 - r, n), s.rotate(180 - r, n));
	}
	let c = `
     M ${e.x} ${e.y}
     Q ${a.x} ${a.y} ${s.x} ${s.y}
     Q ${o.x} ${o.y} ${t.x} ${t.y}
  `;
	return r.raw ? z.parse(c) : c;
}, k_ = (e, t, n, r = {}) => {
	let i = new z(new Qu([
		e,
		...n,
		t
	]));
	return r.raw ? i : i.serialize();
}, A_ = (e, t, n, r = {}) => {
	let i = new z();
	i.appendSegment(z.createSegment("M", e));
	let a = 1 / 3, o = 2 / 3, s = r.radius || 10, c, l;
	for (let r = 0, u = n.length; r < u; r += 1) {
		let u = I.create(n[r]), d = n[r - 1] || e, f = n[r + 1] || t;
		c = l || u.distance(d) / 2, l = u.distance(f) / 2;
		let p = -Math.min(s, c), m = -Math.min(s, l), h = u.clone().move(d, p).round(), g = u.clone().move(f, m).round(), _ = new I(a * h.x + o * u.x, o * u.y + a * h.y), v = new I(a * g.x + o * u.x, o * u.y + a * g.y);
		i.appendSegment(z.createSegment("L", h)), i.appendSegment(z.createSegment("C", _, v, g));
	}
	return i.appendSegment(z.createSegment("L", t)), r.raw ? i : i.serialize();
}, j_ = (e, t, n, r = {}) => {
	let i, a = r.direction;
	if (n && n.length !== 0) {
		let r = [
			e,
			...n,
			t
		];
		i = new z($u.throughPoints(r));
	} else if (i = new z(), i.appendSegment(z.createSegment("M", e)), a || (a = Math.abs(e.x - t.x) >= Math.abs(e.y - t.y) ? "H" : "V"), a === "H") {
		let n = (e.x + t.x) / 2;
		i.appendSegment(z.createSegment("C", n, e.y, n, t.y, t.x, t.y));
	} else {
		let n = (e.y + t.y) / 2;
		i.appendSegment(z.createSegment("C", e.x, n, t.x, n, t.x, t.y));
	}
	return r.raw ? i : i.serialize();
}, M_ = /* @__PURE__ */ s({
	jumpover: () => D_,
	loop: () => O_,
	normal: () => k_,
	rounded: () => A_,
	smooth: () => j_
}), N_ = q.create({ type: "connector" });
N_.register(M_, !0);
// node_modules/@antv/x6/es/registry/node-anchor/util.js
function P_(e) {
	return function(t, n, r, i) {
		if (r instanceof Element) {
			let a = this.graph.findViewByElem(r), o;
			return o = a ? a.isEdgeElement(r) ? F_(a, i.fixedAt == null ? "50%" : i.fixedAt) : a.getBBoxOfElement(r).getCenter() : new I(), e.call(this, t, n, o, i);
		}
		return e.apply(this, arguments);
	};
}
function F_(e, t) {
	let n = iu(t), r = typeof t == "string" ? parseFloat(t) : t;
	return n ? e.getPointAtRatio(r / 100) : e.getPointAtLength(r);
}
// node_modules/@antv/x6/es/registry/edge-anchor/closest.js
var I_ = (e, t, n, r) => e.getClosestPoint(n) ?? new I(), L_ = P_(I_), R_ = (e, t, n, r) => {
	let i = r.length == null ? 20 : r.length;
	return e.getPointAtLength(i);
}, z_ = P_(function(e, t, n, r) {
	let i = 1e6, a = e.getConnection(), o = e.getConnectionSubdivisions(), s = new R(n.clone().translate(0, i), n.clone().translate(0, -1e6)), c = new R(n.clone().translate(i, 0), n.clone().translate(-1e6, 0)), l = s.intersect(a, { segmentSubdivisions: o }), u = c.intersect(a, { segmentSubdivisions: o }), d = [];
	return l && d.push(...l), u && d.push(...u), d.length > 0 ? n.closest(d) : r.fallbackAt == null ? F(I_, this, e, t, n, r) : F_(e, r.fallbackAt);
}), B_ = (e, t, n, r) => {
	let i = r.ratio == null ? .5 : r.ratio;
	return i > 1 && (i /= 100), e.getPointAtRatio(i);
}, V_ = /* @__PURE__ */ s({
	closest: () => L_,
	length: () => R_,
	orth: () => z_,
	ratio: () => B_
}), H_ = q.create({ type: "edge endpoint" });
H_.register(V_, !0);
// node_modules/@antv/x6/es/registry/filter/util.js
function U_(e, t) {
	return e ?? t;
}
function W_(e, t) {
	return e != null && Number.isFinite(e) ? e : t;
}
// node_modules/@antv/x6/es/registry/filter/outline.js
function G_(e = {}) {
	let t = U_(e.color, "blue"), n = W_(e.width, 1), r = W_(e.margin, 2), i = W_(e.opacity, 1), a = r;
	return `
    <filter>
      <feFlood flood-color="${t}" flood-opacity="${i}" result="colored"/>
      <feMorphology in="SourceAlpha" result="morphedOuter" operator="dilate" radius="${r + n}" />
      <feMorphology in="SourceAlpha" result="morphedInner" operator="dilate" radius="${a}" />
      <feComposite result="morphedOuterColored" in="colored" in2="morphedOuter" operator="in"/>
      <feComposite operator="xor" in="morphedOuterColored" in2="morphedInner" result="outline"/>
      <feMerge>
        <feMergeNode in="outline"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `.trim();
}
// node_modules/@antv/x6/es/registry/filter/highlight.js
function K_(e = {}) {
	let t = U_(e.color, "red"), n = W_(e.blur, 0), r = W_(e.width, 1);
	return `
      <filter>
        <feFlood flood-color="${t}" flood-opacity="${W_(e.opacity, 1)}" result="colored"/>
        <feMorphology result="morphed" in="SourceGraphic" operator="dilate" radius="${r}"/>
        <feComposite result="composed" in="colored" in2="morphed" operator="in"/>
        <feGaussianBlur result="blured" in="composed" stdDeviation="${n}"/>
        <feBlend in="SourceGraphic" in2="blured" mode="normal"/>
      </filter>
    `.trim();
}
// node_modules/@antv/x6/es/registry/filter/blur.js
function q_(e = {}) {
	let t = W_(e.x, 2);
	return `
    <filter>
      <feGaussianBlur stdDeviation="${e.y != null && Number.isFinite(e.y) ? [t, e.y] : t}"/>
    </filter>
  `.trim();
}
// node_modules/@antv/x6/es/registry/filter/drop-shadow.js
function J_(e = {}) {
	let t = W_(e.dx, 0), n = W_(e.dy, 0), r = U_(e.color, "black"), i = W_(e.blur, 4), a = W_(e.opacity, 1);
	return "SVGFEDropShadowElement" in window ? `<filter>
         <feDropShadow stdDeviation="${i}" dx="${t}" dy="${n}" flood-color="${r}" flood-opacity="${a}" />
       </filter>`.trim() : `<filter>
         <feGaussianBlur in="SourceAlpha" stdDeviation="${i}" />
         <feOffset dx="${t}" dy="${n}" result="offsetblur" />
         <feFlood flood-color="${r}" />
         <feComposite in2="offsetblur" operator="in" />
         <feComponentTransfer>
           <feFuncA type="linear" slope="${a}" />
         </feComponentTransfer>
         <feMerge>
           <feMergeNode/>
           <feMergeNode in="SourceGraphic"/>
         </feMerge>
       </filter>`.trim();
}
// node_modules/@antv/x6/es/registry/filter/gray-scale.js
function Y_(e = {}) {
	let t = W_(e.amount, 1), n = .2126 + .7874 * (1 - t), r = .7152 - .7152 * (1 - t);
	return `
    <filter>
      <feColorMatrix type="matrix" values="${n} ${r} ${.0722 - .0722 * (1 - t)} 0 0 ${.2126 - .2126 * (1 - t)} ${.7152 + .2848 * (1 - t)} ${.0722 - .0722 * (1 - t)} 0 0 ${.2126 - .2126 * (1 - t)} ${r} ${.0722 + .9278 * (1 - t)} 0 0 0 0 0 1 0"/>
    </filter>
  `.trim();
}
// node_modules/@antv/x6/es/registry/filter/sepia.js
function X_(e = {}) {
	let t = W_(e.amount, 1);
	return `
      <filter>
        <feColorMatrix type="matrix" values="${.393 + .607 * (1 - t)} ${.769 - .769 * (1 - t)} ${.189 - .189 * (1 - t)} 0 0 ${.349 - .349 * (1 - t)} ${.686 + .314 * (1 - t)} ${.168 - .168 * (1 - t)} 0 0 ${.272 - .272 * (1 - t)} ${.534 - .534 * (1 - t)} ${.131 + .869 * (1 - t)} 0 0 0 0 0 1 0"/>
      </filter>
    `.trim();
}
// node_modules/@antv/x6/es/registry/filter/saturate.js
function Z_(e = {}) {
	return `
      <filter>
        <feColorMatrix type="saturate" values="${1 - W_(e.amount, 1)}"/>
      </filter>
    `.trim();
}
// node_modules/@antv/x6/es/registry/filter/hue-rotate.js
function Q_(e = {}) {
	return `
      <filter>
        <feColorMatrix type="hueRotate" values="${W_(e.angle, 0)}"/>
      </filter>
    `.trim();
}
// node_modules/@antv/x6/es/registry/filter/invert.js
function $_(e = {}) {
	let t = W_(e.amount, 1), n = 1 - t;
	return `
      <filter>
        <feComponentTransfer>
          <feFuncR type="table" tableValues="${t} ${n}"/>
          <feFuncG type="table" tableValues="${t} ${n}"/>
          <feFuncB type="table" tableValues="${t} ${n}"/>
        </feComponentTransfer>
      </filter>
    `.trim();
}
// node_modules/@antv/x6/es/registry/filter/brightness.js
function ev(e = {}) {
	let t = W_(e.amount, 1);
	return `
    <filter>
      <feComponentTransfer>
        <feFuncR type="linear" slope="${t}"/>
        <feFuncG type="linear" slope="${t}"/>
        <feFuncB type="linear" slope="${t}"/>
      </feComponentTransfer>
    </filter>
  `.trim();
}
// node_modules/@antv/x6/es/registry/filter/contrast.js
function tv(e = {}) {
	let t = W_(e.amount, 1), n = .5 - t / 2;
	return `
    <filter>
     <feComponentTransfer>
        <feFuncR type="linear" slope="${t}" intercept="${n}"/>
        <feFuncG type="linear" slope="${t}" intercept="${n}"/>
        <feFuncB type="linear" slope="${t}" intercept="${n}"/>
      </feComponentTransfer>
    </filter>
  `.trim();
}
// node_modules/@antv/x6/es/registry/filter/index.js
var nv = /* @__PURE__ */ s({
	blur: () => q_,
	brightness: () => ev,
	contrast: () => tv,
	dropShadow: () => J_,
	grayScale: () => Y_,
	highlight: () => K_,
	hueRotate: () => Q_,
	invert: () => $_,
	outline: () => G_,
	saturate: () => Z_,
	sepia: () => X_
}), rv = q.create({ type: "filter" });
rv.register(nv, !0);
// node_modules/@antv/x6/es/registry/grid/dot.js
var iv = {
	color: "#aaaaaa",
	thickness: 1,
	markup: "rect",
	update(e, t) {
		let n = t.thickness * t.sx, r = t.thickness * t.sy;
		H(e, {
			width: n,
			height: r,
			rx: n,
			ry: r,
			fill: t.color
		});
	}
}, av = {
	color: "#aaaaaa",
	thickness: 1,
	markup: "rect",
	update(e, t) {
		let n = t.sx <= 1 ? t.thickness * t.sx : t.thickness;
		H(e, {
			width: n,
			height: n,
			rx: n,
			ry: n,
			fill: t.color
		});
	}
}, ov = {
	color: "rgba(224,224,224,1)",
	thickness: 1,
	markup: "path",
	update(e, t) {
		let n, r = t.width, i = t.height, a = t.thickness;
		n = r - a >= 0 && i - a >= 0 ? [
			"M",
			r,
			0,
			"H0 M0 0 V0",
			i
		].join(" ") : "M 0 0 0 0", H(e, {
			d: n,
			stroke: t.color,
			"stroke-width": t.thickness
		});
	}
}, sv = [{
	color: "rgba(224,224,224,1)",
	thickness: 1,
	markup: "path",
	update(e, t) {
		let n, r = t.width, i = t.height, a = t.thickness;
		n = r - a >= 0 && i - a >= 0 ? [
			"M",
			r,
			0,
			"H0 M0 0 V0",
			i
		].join(" ") : "M 0 0 0 0", H(e, {
			d: n,
			stroke: t.color,
			"stroke-width": t.thickness
		});
	}
}, {
	color: "rgba(224,224,224,0.2)",
	thickness: 3,
	factor: 4,
	markup: "path",
	update(e, t) {
		let n, r = t.factor || 1, i = t.width * r, a = t.height * r, o = t.thickness;
		n = i - o >= 0 && a - o >= 0 ? [
			"M",
			i,
			0,
			"H0 M0 0 V0",
			a
		].join(" ") : "M 0 0 0 0", t.width = i, t.height = a, H(e, {
			d: n,
			stroke: t.color,
			"stroke-width": t.thickness
		});
	}
}], cv = /* @__PURE__ */ s({
	dot: () => iv,
	doubleMesh: () => sv,
	fixedDot: () => av,
	mesh: () => ov
}), lv = class {
	constructor() {
		this.patterns = {}, this.root = W.create(kd(), {
			width: "100%",
			height: "100%"
		}, [Od("defs")]).node;
	}
	add(e, t) {
		let n = this.root.childNodes[0];
		n && n.appendChild(t), this.patterns[e] = t, W.create("rect", {
			width: "100%",
			height: "100%",
			fill: `url(#${e})`
		}).appendTo(this.root);
	}
	get(e) {
		return this.patterns[e];
	}
	has(e) {
		return this.patterns[e] != null;
	}
}, uv = cv, dv = q.create({ type: "grid" });
dv.register(uv, !0);
// node_modules/@antv/x6/es/config/index.js
var J = {
	prefixCls: "x6",
	autoInsertCSS: !0,
	useCSSSelector: !0,
	prefix(e) {
		return `${J.prefixCls}-${e}`;
	}
}, fv = J.prefix("highlighted"), pv = {
	highlight(e, t, n) {
		B(t, n && n.className || fv);
	},
	unhighlight(e, t, n) {
		V(t, n && n.className || fv);
	}
}, mv = J.prefix("highlight-opacity"), hv = {
	highlight(e, t) {
		B(t, mv);
	},
	unhighlight(e, t) {
		V(t, mv);
	}
}, gv = {
	padding: 3,
	rx: 0,
	ry: 0,
	attrs: {
		"stroke-width": 3,
		stroke: "#FEB663"
	}
}, _v = {
	highlight(e, t, n) {
		let r = vv(t, n);
		if (xv(r)) return;
		n = ul({}, n, gv);
		let i = W.create(t), a, o;
		try {
			a = i.toPathData();
		} catch {
			o = bm(i.node, !0), a = cp(Object.assign(Object.assign({}, n), o));
		}
		let s = Od("path");
		if (H(s, Object.assign({
			d: a,
			"pointer-events": "none",
			"vector-effect": "non-scaling-stroke",
			fill: "none"
		}, n.attrs ? nf(n.attrs) : null)), e.isEdgeElement(t)) H(s, "d", e.getConnectionPathData());
		else {
			let t = i.getTransformToElement(e.container), r = n.padding;
			if (r) {
				o ?? (o = bm(i.node, !0));
				let e = o.x + o.width / 2, n = o.y + o.height / 2;
				o = ym(o, t);
				let a = Math.max(o.width, 1), s = Math.max(o.height, 1), c = (a + r) / a, l = (s + r) / s, u = hp({
					a: c,
					b: 0,
					c: 0,
					d: l,
					e: e - c * e,
					f: n - l * n
				});
				t = t.multiply(u);
			}
			Tp(s, t);
		}
		B(s, J.prefix("highlight-stroke"));
		let c = e.cell, l = () => Sv(r);
		c.on("removed", l), c.model && c.model.on("reseted", l), e.container.appendChild(s), bv(r, s);
	},
	unhighlight(e, t, n) {
		Sv(vv(t, n));
	}
};
function vv(e, t) {
	return Cd(e), e.id + JSON.stringify(t);
}
var yv = {};
function bv(e, t) {
	yv[e] = t;
}
function xv(e) {
	return yv[e] != null;
}
function Sv(e) {
	let t = yv[e];
	t && (Ld(t), delete yv[e]);
}
// node_modules/@antv/x6/es/registry/highlighter/main.js
var Cv = /* @__PURE__ */ s({
	className: () => pv,
	opacity: () => hv,
	stroke: () => _v
});
// node_modules/@antv/x6/es/registry/highlighter/index.js
function wv(e, t) {
	if (typeof t.highlight != "function") throw Error(`Highlighter '${e}' is missing required \`highlight()\` method`);
	if (typeof t.unhighlight != "function") throw Error(`Highlighter '${e}' is missing required \`unhighlight()\` method`);
}
var Tv = Cv, Ev = q.create({ type: "highlighter" });
Ev.register(Tv, !0);
// node_modules/@antv/x6/es/registry/node-anchor/bbox.js
var Dv = Iv("center"), Ov = Iv("topCenter"), kv = Iv("bottomCenter"), Av = Iv("leftMiddle"), jv = Iv("rightMiddle"), Mv = Iv("topLeft"), Nv = Iv("topRight"), Pv = Iv("bottomLeft"), Fv = Iv("bottomRight");
function Iv(e) {
	return (t, n, r, i = {}) => {
		let a;
		a = t.cell.visible ? i.rotate ? t.getUnrotatedBBoxOfElement(n) : t.getBBoxOfElement(n) : t.cell.getBBox();
		let o = a[e];
		o.x += au(i.dx, a.width), o.y += au(i.dy, a.height);
		let s = t.cell;
		return i.rotate ? o.rotate(-s.getAngle(), s.getBBox().getCenter()) : o;
	};
}
var Lv = P_((e, t, n, r) => {
	let i = Lu(e.cell.getAngle()), a = e.cell.visible ? e.getBBoxOfElement(t) : e.cell.getBBox(), o = a.getCenter(), s = a.getTopLeft(), c = a.getBottomRight(), l = r.padding;
	if (Number.isFinite(l) || (l = 0), s.y + l <= n.y && n.y <= c.y - l) {
		let e = n.y - o.y;
		o.x += i === 0 || i === 180 ? 0 : e * 1 / Math.tan(Iu(i)), o.y += e;
	} else if (s.x + l <= n.x && n.x <= c.x - l) {
		let e = n.x - o.x;
		o.y += i === 90 || i === 270 ? 0 : e * Math.tan(Iu(i)), o.x += e;
	}
	return o;
}), Rv = function(e, t, n, r, i) {
	let a = e.cell.getConnectionPoint(this.cell, i);
	return (r.dx || r.dy) && a.translate(r.dx || 0, r.dy || 0), a;
}, zv = P_((e, t, n, r) => {
	let i, a = 0, o, s = e.cell;
	r.rotate ? (i = e.getUnrotatedBBoxOfElement(t), o = s.getBBox().getCenter(), a = s.getAngle()) : i = s.visible ? e.getBBoxOfElement(t) : e.cell.getBBox();
	let c = r.padding;
	c != null && Number.isFinite(c) && i.inflate(c), r.rotate && n.rotate(a, o);
	let l = i.getNearestSideToPoint(n), u;
	switch (l) {
		case "left":
			u = i.getLeftMiddle();
			break;
		case "right":
			u = i.getRightMiddle();
			break;
		case "top":
			u = i.getTopCenter();
			break;
		case "bottom": u = i.getBottomCenter();
	}
	let d = r.direction;
	return d === "H" ? (l === "top" || l === "bottom") && (u = n.x <= i.x + i.width ? i.getLeftMiddle() : i.getRightMiddle()) : d === "V" && (u = n.y <= i.y + i.height ? i.getTopCenter() : i.getBottomCenter()), r.rotate ? u.rotate(-a, o) : u;
}), Bv = /* @__PURE__ */ s({
	bottom: () => kv,
	bottomLeft: () => Pv,
	bottomRight: () => Fv,
	center: () => Dv,
	left: () => Av,
	midSide: () => zv,
	nodeCenter: () => Rv,
	orth: () => Lv,
	right: () => jv,
	top: () => Ov,
	topLeft: () => Mv,
	topRight: () => Nv
}), Vv = q.create({ type: "node endpoint" });
Vv.register(Bv, !0);
// node_modules/@antv/x6/es/registry/port-label-layout/util.js
var Hv = {
	position: {
		x: 0,
		y: 0
	},
	angle: 0,
	attrs: { ".": {
		y: "0",
		"text-anchor": "start"
	} }
};
function Uv(e, t) {
	let { x: n, y: r, angle: i, attrs: a } = t || {};
	return ul({}, {
		angle: i,
		attrs: a,
		position: {
			x: n,
			y: r
		}
	}, e, Hv);
}
// node_modules/@antv/x6/es/registry/port-label-layout/side.js
var Wv = (e, t, n) => Uv({ position: t.getTopLeft() }, n), Gv = (e, t, n) => Uv({
	position: {
		x: -15,
		y: 0
	},
	attrs: { ".": {
		y: ".3em",
		"text-anchor": "end"
	} }
}, n), Kv = (e, t, n) => Uv({
	position: {
		x: 15,
		y: 0
	},
	attrs: { ".": {
		y: ".3em",
		"text-anchor": "start"
	} }
}, n), qv = (e, t, n) => Uv({
	position: {
		x: 0,
		y: -15
	},
	attrs: { ".": { "text-anchor": "middle" } }
}, n), Jv = (e, t, n) => Uv({
	position: {
		x: 0,
		y: 15
	},
	attrs: { ".": {
		y: ".6em",
		"text-anchor": "middle"
	} }
}, n), Yv = (e, t, n) => $v(e, t, !1, n), Xv = (e, t, n) => $v(e, t, !0, n), Zv = (e, t, n) => ey(e, t, !1, n), Qv = (e, t, n) => ey(e, t, !0, n);
function $v(e, t, n, r) {
	let i = r.offset == null ? 15 : r.offset, a = t.getCenter().theta(e), o = ty(t), s, c, l, u, d = 0;
	return a < o[1] || a > o[2] ? (s = ".3em", c = i, l = 0, u = "start") : a < o[0] ? (s = "0", c = 0, l = -i, n ? (d = -90, u = "start") : u = "middle") : a < o[3] ? (s = ".3em", c = -i, l = 0, u = "end") : (s = ".6em", c = 0, l = i, n ? (d = 90, u = "start") : u = "middle"), Uv({
		position: {
			x: Math.round(c),
			y: Math.round(l)
		},
		angle: d,
		attrs: { ".": {
			y: s,
			"text-anchor": u
		} }
	}, r);
}
function ey(e, t, n, r) {
	let i = r.offset == null ? 15 : r.offset, a = t.getCenter().theta(e), o = ty(t), s, c, l, u, d = 0;
	return a < o[1] || a > o[2] ? (s = ".3em", c = -i, l = 0, u = "end") : a < o[0] ? (s = ".6em", c = 0, l = i, n ? (d = 90, u = "start") : u = "middle") : a < o[3] ? (s = ".3em", c = i, l = 0, u = "start") : (s = "0em", c = 0, l = -i, n ? (d = -90, u = "start") : u = "middle"), Uv({
		position: {
			x: Math.round(c),
			y: Math.round(l)
		},
		angle: d,
		attrs: { ".": {
			y: s,
			"text-anchor": u
		} }
	}, r);
}
function ty(e) {
	let t = e.getCenter(), n = t.theta(e.getTopLeft()), r = t.theta(e.getBottomLeft()), i = t.theta(e.getBottomRight());
	return [
		n,
		t.theta(e.getTopRight()),
		i,
		r
	];
}
// node_modules/@antv/x6/es/registry/port-label-layout/radial.js
var ny = (e, t, n) => iy(e.diff(t.getCenter()), !1, n), ry = (e, t, n) => iy(e.diff(t.getCenter()), !0, n);
function iy(e, t, n) {
	let r = n.offset == null ? 20 : n.offset, i = new I(0, 0), a = -e.theta(i), o = e.clone().move(i, r).diff(e).round(), s = ".3em", c, l = a;
	return (a + 90) % 180 == 0 ? (c = t ? "end" : "middle", !t && a === -270 && (s = "0em")) : a > -270 && a < -90 ? (c = "start", l = a - 180) : c = "end", Uv({
		position: o.round().toJSON(),
		angle: t ? l : 0,
		attrs: { ".": {
			y: s,
			"text-anchor": c
		} }
	}, n);
}
// node_modules/@antv/x6/es/registry/port-label-layout/index.js
var ay = /* @__PURE__ */ s({
	bottom: () => Jv,
	inside: () => Zv,
	insideOriented: () => Qv,
	left: () => Gv,
	manual: () => Wv,
	outside: () => Yv,
	outsideOriented: () => Xv,
	radial: () => ny,
	radialOriented: () => ry,
	right: () => Kv,
	top: () => qv
}), oy = q.create({ type: "port label layout" });
oy.register(ay, !0);
// node_modules/@antv/x6/es/registry/port-layout/util.js
function sy(e, t = {}) {
	return new I(au(t.x, e.width), au(t.y, e.height));
}
function cy(e, t, n) {
	return Object.assign({
		angle: t,
		position: e.toJSON()
	}, n);
}
// node_modules/@antv/x6/es/registry/port-layout/absolute.js
var ly = (e, t) => e.map(({ x: e, y: n, angle: r }) => cy(sy(t, {
	x: e,
	y: n
}), r || 0)), uy = (e, t, n) => {
	let r = n.start || 0, i = n.step || 20;
	return fy(e, t, r, (e, t) => (e + .5 - t / 2) * i);
}, dy = (e, t, n) => {
	let r = n.start || 0, i = n.step || 360 / e.length;
	return fy(e, t, r, (e) => e * i);
};
function fy(e, t, n, r) {
	let i = t.getCenter(), a = t.getTopCenter(), o = t.width / t.height, s = Gu.fromRect(t), c = e.length;
	return e.map((e, t) => {
		let l = n + r(t, c), u = a.clone().rotate(-l, i).scale(o, 1, i), d = e.compensateRotate ? -s.tangentTheta(u) : 0;
		return (e.dx || e.dy) && u.translate(e.dx || 0, e.dy || 0), e.dr && u.move(i, e.dr), cy(u.round(), d, e);
	});
}
// node_modules/@antv/x6/es/registry/port-layout/line.js
var py = (e, t, n) => vy(e, sy(t, n.start || t.getOrigin()), sy(t, n.end || t.getCorner()), n), my = (e, t, n) => vy(e, t.getTopLeft(), t.getBottomLeft(), n), hy = (e, t, n) => vy(e, t.getTopRight(), t.getBottomRight(), n), gy = (e, t, n) => vy(e, t.getTopLeft(), t.getTopRight(), n), _y = (e, t, n) => vy(e, t.getBottomLeft(), t.getBottomRight(), n);
function vy(e, t, n, r) {
	let i = new R(t, n), a = e.length;
	return e.map((e, t) => {
		var { strict: n } = e, o = O(e, ["strict"]);
		let s = n || r.strict ? (t + 1) / (a + 1) : (t + .5) / a, c = i.pointAt(s);
		return (o.dx || o.dy) && c.translate(o.dx || 0, o.dy || 0), cy(c.round(), 0, o);
	});
}
// node_modules/@antv/x6/es/registry/port-layout/index.js
var yy = /* @__PURE__ */ s({
	absolute: () => ly,
	bottom: () => _y,
	ellipse: () => uy,
	ellipseSpread: () => dy,
	left: () => my,
	line: () => py,
	right: () => hy,
	top: () => gy
}), by = q.create({ type: "port layout" });
by.register(yy, !0);
// node_modules/@antv/x6/es/registry/router/normal.js
var xy = (e) => [...e], Sy = (e, t, n) => {
	let r = t.side || "bottom", i = ou(t.padding || 40), a = n.sourceBBox, o = n.targetBBox, s = a.getCenter(), c = o.getCenter(), l, u, d;
	switch (r) {
		case "top":
			d = -1, l = "y", u = "height";
			break;
		case "left":
			d = -1, l = "x", u = "width";
			break;
		case "right":
			d = 1, l = "x", u = "width";
			break;
		default: d = 1, l = "y", u = "height";
	}
	return s[l] += d * (a[u] / 2 + i[r]), c[l] += d * (o[u] / 2 + i[r]), d * (s[l] - c[l]) > 0 ? c[l] = s[l] : s[l] = c[l], [
		s.toJSON(),
		...e,
		c.toJSON()
	];
};
// node_modules/@antv/x6/es/registry/router/util.js
function Cy(e) {
	return new L(e.x, e.y, 0, 0);
}
function wy(e = {}) {
	let t = ou(e.padding || 20);
	return {
		x: -t.left,
		y: -t.top,
		width: t.left + t.right,
		height: t.top + t.bottom
	};
}
function Ty(e, t = {}) {
	return e.sourceBBox.clone().moveAndExpand(wy(t));
}
function Ey(e, t = {}) {
	return e.targetBBox.clone().moveAndExpand(wy(t));
}
function Dy(e, t = {}) {
	return e.sourceAnchor ? e.sourceAnchor : Ty(e, t).getCenter();
}
function Oy(e, t = {}) {
	return e.targetAnchor ? e.targetAnchor : Ey(e, t).getCenter();
}
// node_modules/@antv/x6/es/registry/router/orth.js
var ky = (e, t, n) => {
	let r = Ty(n, t), i = Ey(n, t), a = Dy(n, t), o = Oy(n, t);
	r = r.union(Cy(a)), i = i.union(Cy(o));
	let s = e.map((e) => I.create(e));
	s.unshift(a), s.push(o);
	let c = null, l = [];
	for (let e = 0, n = s.length - 1; e < n; e += 1) {
		let a = null, o = s[e], u = s[e + 1], d = Py(o, u) != null;
		if (e === 0) e + 1 === n ? r.intersectsWithRect(i.clone().inflate(1)) ? a = zy(o, u, r, i) : d || (a = Ry(o, u, r, i)) : r.containsPoint(u) ? a = zy(o, u, r, Cy(u).moveAndExpand(wy(t))) : d || (a = Iy(o, u, r));
		else if (e + 1 === n) {
			let e = d && Py(u, o) === c;
			i.containsPoint(o) || e ? a = zy(o, u, Cy(o).moveAndExpand(wy(t)), i, c) : d || (a = Ly(o, u, i, c));
		} else d || (a = Fy(o, u, c));
		a ? (l.push(...a.points), c = a.direction) : c = Py(o, u), e + 1 < n && l.push(u);
	}
	return l;
}, Ay = {
	N: "S",
	S: "N",
	E: "W",
	W: "E"
}, jy = {
	N: -Math.PI / 2 * 3,
	S: -Math.PI / 2,
	E: 0,
	W: Math.PI
};
function My(e, t, n) {
	let r = new I(e.x, t.y);
	return n.containsPoint(r) && (r = new I(t.x, e.y)), r;
}
function Ny(e, t) {
	return e[t === "W" || t === "E" ? "width" : "height"];
}
function Py(e, t) {
	return e.x === t.x ? e.y > t.y ? "N" : "S" : e.y === t.y ? e.x > t.x ? "W" : "E" : null;
}
function Fy(e, t, n) {
	let r = new I(e.x, t.y), i = new I(t.x, e.y), a = Py(e, r), o = Py(e, i), s = n ? Ay[n] : null, c = a === n || a !== s && (o === s || o !== n) ? r : i;
	return {
		points: [c],
		direction: Py(c, t)
	};
}
function Iy(e, t, n) {
	let r = My(e, t, n);
	return {
		points: [r],
		direction: Py(r, t)
	};
}
function Ly(e, t, n, r) {
	let i = [new I(e.x, t.y), new I(t.x, e.y)], a = i.filter((e) => !n.containsPoint(e)), o = a.filter((t) => Py(t, e) !== r), s;
	if (o.length > 0) return s = o.filter((t) => Py(e, t) === r).pop(), s = s || o[0], {
		points: [s],
		direction: Py(s, t)
	};
	{
		s = ml(i, a)[0];
		let o = I.create(t).move(s, -Ny(n, r) / 2);
		return {
			points: [My(o, e, n), o],
			direction: Py(o, t)
		};
	}
}
function Ry(e, t, n, r) {
	let i = Iy(t, e, r), a = i.points[0];
	if (n.containsPoint(a)) {
		i = Iy(e, t, n);
		let o = i.points[0];
		if (r.containsPoint(o)) {
			let s = new R(I.create(e).move(o, -Ny(n, Py(e, o)) / 2), I.create(t).move(a, -Ny(r, Py(t, a)) / 2)).getCenter(), c = Iy(e, s, n), l = Fy(s, t, c.direction);
			i.points = [c.points[0], l.points[0]], i.direction = l.direction;
		}
	}
	return i;
}
function zy(e, t, n, r, i) {
	let a = n.union(r).inflate(1), o = a.getCenter(), s = o.distance(t) > o.distance(e), c = s ? t : e, l = s ? e : t, u, d, f;
	i ? (u = I.fromPolar(a.width + a.height, jy[i], c), u = a.getNearestPointToPoint(u).move(u, -1)) : u = a.getNearestPointToPoint(c).move(c, 1), d = My(u, l, a);
	let p;
	u.round().equals(d.round()) ? (d = I.fromPolar(a.width + a.height, Iu(u.theta(c)) + Math.PI / 2, l), d = a.getNearestPointToPoint(d).move(l, 1).round(), f = My(u, d, a), p = s ? [
		d,
		f,
		u
	] : [
		u,
		f,
		d
	]) : p = s ? [d, u] : [u, d];
	let m = Py(s ? u : d, t);
	return {
		points: p,
		direction: m
	};
}
// node_modules/@antv/x6/es/registry/router/manhattan/options.js
var By = {
	step: 10,
	maxLoopCount: 2e3,
	precision: 1,
	maxDirectionChange: 90,
	perpendicular: !0,
	excludeTerminals: [],
	excludeNodes: [],
	excludeShapes: [],
	startDirections: [
		"top",
		"right",
		"bottom",
		"left"
	],
	endDirections: [
		"top",
		"right",
		"bottom",
		"left"
	],
	directionMap: {
		top: {
			x: 0,
			y: -1
		},
		right: {
			x: 1,
			y: 0
		},
		bottom: {
			x: 0,
			y: 1
		},
		left: {
			x: -1,
			y: 0
		}
	},
	cost() {
		return Vy(this.step, this);
	},
	directions() {
		let e = Vy(this.step, this), t = Vy(this.cost, this);
		return [
			{
				cost: t,
				offsetX: e,
				offsetY: 0
			},
			{
				cost: t,
				offsetX: -e,
				offsetY: 0
			},
			{
				cost: t,
				offsetX: 0,
				offsetY: e
			},
			{
				cost: t,
				offsetX: 0,
				offsetY: -e
			}
		];
	},
	penalties() {
		let e = Vy(this.step, this);
		return {
			0: 0,
			45: e / 2,
			90: e / 2
		};
	},
	paddingBox() {
		let e = Vy(this.step, this);
		return {
			x: -e,
			y: -e,
			width: 2 * e,
			height: 2 * e
		};
	},
	fallbackRouter: ky,
	draggingRouter: null,
	snapToGrid: !0
};
function Vy(e, t) {
	return typeof e == "function" ? e.call(t) : e;
}
function Hy(e) {
	let t = Object.keys(e).reduce((t, n) => {
		let r = t;
		return r[n] = n === "fallbackRouter" || n === "draggingRouter" || n === "fallbackRoute" ? e[n] : Vy(e[n], e), t;
	}, {});
	if (t.padding) {
		let e = ou(t.padding);
		t.paddingBox = {
			x: -e.left,
			y: -e.top,
			width: e.left + e.right,
			height: e.top + e.bottom
		};
	}
	return t.directions.forEach((e) => {
		let t = new I(0, 0), n = new I(e.offsetX, e.offsetY);
		e.angle = Lu(t.theta(n));
	}), t;
}
// node_modules/@antv/x6/es/registry/router/manhattan/obstacle-map.js
var Uy = class {
	constructor(e) {
		this.options = e, this.mapGridSize = 100, this.map = {};
	}
	build(e, t) {
		let n = this.options, r = n.excludeTerminals.reduce((n, r) => {
			let i = t[r];
			if (i) {
				let t = e.getCell(i.cell);
				t && n.push(t);
			}
			return n;
		}, []), i = [], a = e.getCell(t.getSourceCellId());
		a && (i = eu(i, a.getAncestors().map((e) => e.id)));
		let o = e.getCell(t.getTargetCellId());
		o && (i = eu(i, o.getAncestors().map((e) => e.id)));
		let s = this.mapGridSize;
		return e.getNodes().reduce((e, t) => {
			let a = r.some((e) => e.id === t.id), o = t.shape ? n.excludeShapes.includes(t.shape) : !1, c = n.excludeNodes.some((e) => typeof e == "string" ? t.id === e : e === t), l = i.includes(t.id), u = o || a || c || l;
			if (t.isVisible() && !u) {
				let r = t.getBBox().moveAndExpand(n.paddingBox), i = r.getOrigin().snapToGrid(s), a = r.getCorner().snapToGrid(s);
				for (let t = i.x; t <= a.x; t += s) for (let n = i.y; n <= a.y; n += s) {
					let i = new I(t, n).toString();
					e[i] ?? (e[i] = []), e[i].push(r);
				}
			}
			return e;
		}, this.map), this;
	}
	isAccessible(e) {
		let t = e.clone().snapToGrid(this.mapGridSize).toString(), n = this.map[t];
		return !n || n.every((t) => !t.containsPoint(e));
	}
}, Wy = /* @__PURE__ */ new WeakMap();
function Gy(e) {
	let t = Wy.get(e);
	t && (t.dirty = !0);
}
function Ky(e) {
	let t = Wy.get(e);
	t && !t.installed && (e.on("reseted", () => Gy(e)), e.on("updated", () => Gy(e)), e.on("cell:added", () => Gy(e)), e.on("cell:removed", () => Gy(e)), e.on("cell:change:position", () => Gy(e)), e.on("cell:change:size", () => Gy(e)), e.on("edge:change:source", () => Gy(e)), e.on("edge:change:target", () => Gy(e)), t.installed = !0);
}
function qy(e) {
	let t = e.paddingBox;
	return `${t == null ? "none" : `${t.x},${t.y},${t.width},${t.height}`}#${(e.excludeTerminals || []).map((e) => e).sort().join("|")}#${(e.excludeShapes || []).slice().sort().join("|")}#${(e.excludeNodes || []).map((e) => typeof e == "string" ? e : e?.id || "node").slice().sort().join("|")}`;
}
function Jy(e, t, n) {
	let r = Wy.get(e);
	if (!r) {
		let i = new Uy(n).build(e, t);
		return r = {
			map: i,
			dirty: !1,
			installed: !1,
			optionsKey: qy(n)
		}, Wy.set(e, r), Ky(e), i;
	}
	let i = qy(n);
	return (r.dirty || r.optionsKey !== i) && (r.map = new Uy(n).build(e, t), r.dirty = !1, r.optionsKey = i), r.map;
}
// node_modules/@antv/x6/es/registry/router/manhattan/sorted-set.js
var Yy = 1, Xy = 2, Zy = class {
	constructor() {
		this.items = [], this.hash = {}, this.values = {}, this.indexes = {};
	}
	swap(e, t) {
		let n = this.items[e], r = this.items[t];
		this.items[e] = r, this.items[t] = n, this.indexes[r] = e, this.indexes[n] = t;
	}
	less(e, t) {
		let n = this.items[e], r = this.items[t];
		return this.values[n] < this.values[r];
	}
	bubbleUp(e) {
		for (; e > 0;) {
			let t = e - 1 >> 1;
			if (this.less(e, t)) this.swap(e, t), e = t;
			else break;
		}
	}
	bubbleDown(e) {
		let t = this.items.length;
		for (;;) {
			let n = (e << 1) + 1, r = n + 1, i = e;
			if (n < t && this.less(n, i) && (i = n), r < t && this.less(r, i) && (i = r), i !== e) this.swap(e, i), e = i;
			else break;
		}
	}
	add(e, t) {
		let n = this.hash[e] === Yy;
		if (this.values[e] = t, n) {
			let t = this.indexes[e];
			t != null && (this.bubbleUp(t), this.bubbleDown(t));
		} else {
			this.hash[e] = Yy, this.items.push(e);
			let t = this.items.length - 1;
			this.indexes[e] = t, this.bubbleUp(t);
		}
	}
	pop() {
		if (this.items.length === 0) return;
		let e = this.items[0];
		this.hash[e] = Xy;
		let t = this.items.pop();
		return delete this.indexes[e], this.items.length > 0 && t != null && (this.items[0] = t, this.indexes[t] = 0, this.bubbleDown(0)), e;
	}
	isOpen(e) {
		return this.hash[e] === Yy;
	}
	isClose(e) {
		return this.hash[e] === Xy;
	}
	isEmpty() {
		return this.items.length === 0;
	}
};
// node_modules/@antv/x6/es/registry/router/manhattan/util.js
function Qy(e, t) {
	let n = e.sourceBBox.clone();
	return t && t.paddingBox ? n.moveAndExpand(t.paddingBox) : n;
}
function $y(e, t) {
	let n = e.targetBBox.clone();
	return t && t.paddingBox ? n.moveAndExpand(t.paddingBox) : n;
}
function eb(e, t) {
	return e.sourceAnchor ? e.sourceAnchor : Qy(e, t).getCenter();
}
function tb(e, t) {
	return e.targetAnchor ? e.targetAnchor : $y(e, t).getCenter();
}
function nb(e, t, n, r, i) {
	let a = 360 / n, o = Lu(e.theta(rb(e, t, r, i)) + a / 2);
	return a * Math.floor(o / a);
}
function rb(e, t, n, r) {
	let i = r.step, a = t.x - e.x, o = t.y - e.y, s = a / n.x, c = o / n.y, l = s * i, u = c * i;
	return new I(e.x + l, e.y + u);
}
function ib(e, t) {
	let n = Math.abs(e - t);
	return n > 180 ? 360 - n : n;
}
function ab(e, t) {
	let n = t.step;
	return t.directions.forEach((t) => {
		t.gridOffsetX = t.offsetX / n * e.x, t.gridOffsetY = t.offsetY / n * e.y;
	}), t.directions;
}
function ob(e, t, n) {
	return {
		source: t.clone(),
		x: sb(n.x - t.x, e),
		y: sb(n.y - t.y, e)
	};
}
function sb(e, t) {
	if (!e) return t;
	let n = Math.abs(e), r = Math.round(n / t);
	return r ? t + (n - r * t) / r : n;
}
function cb(e, t) {
	let n = t.source;
	return new I(Vu(e.x - n.x, t.x) + n.x, Vu(e.y - n.y, t.y) + n.y);
}
function lb(e, t) {
	return e.round(t);
}
function ub(e, t, n) {
	return lb(cb(e.clone(), t), n);
}
function db(e) {
	return e.toString();
}
function fb(e) {
	return new I(e.x === 0 ? 0 : Math.abs(e.x) / e.x, e.y === 0 ? 0 : Math.abs(e.y) / e.y);
}
function pb(e, t) {
	let n = Infinity;
	for (let r = 0, i = t.length; r < i; r += 1) {
		let i = e.manhattanDistance(t[r]);
		i < n && (n = i);
	}
	return n;
}
function mb(e, t, n, r, i) {
	let a = i.precision, o = i.directionMap, s = e.diff(t.getCenter()), c = Object.keys(o).reduce((i, c) => {
		if (n.includes(c)) {
			let n = o[c], l = new R(e, new I(e.x + n.x * (Math.abs(s.x) + t.width), e.y + n.y * (Math.abs(s.y) + t.height))).intersect(t) || [], u, d = null;
			for (let t = 0; t < l.length; t += 1) {
				let n = l[t], r = e.squaredDistance(n);
				(u == null || r > u) && (u = r, d = n);
			}
			if (d) {
				let e = ub(d, r, a);
				t.containsPoint(e) && (e = ub(e.translate(n.x * r.x, n.y * r.y), r, a)), i.push(e);
			}
		}
		return i;
	}, []);
	return t.containsPoint(e) || c.push(ub(e, r, a)), c;
}
function hb(e, t, n, r, i) {
	let a = [], o = fb(i.diff(n)), s = db(n), c = e[s], l;
	for (; c;) {
		l = t[s];
		let n = fb(l.diff(c));
		n.equals(o) || (a.unshift(l), o = n), s = db(c), c = e[s];
	}
	let u = t[s];
	return fb(u.diff(r)).equals(o) || a.unshift(u), a;
}
// node_modules/@antv/x6/es/registry/router/manhattan/router.js
function gb(e, t, n, r, i) {
	let a = i.precision, o, s;
	o = L.isRectangle(t) ? lb(eb(e, i).clone(), a) : lb(t.clone(), a), s = L.isRectangle(n) ? lb(tb(e, i).clone(), a) : lb(n.clone(), a);
	let c = ob(i.step, o, s), l = o, u = s, d, f;
	if (d = L.isRectangle(t) ? mb(l, t, i.startDirections, c, i) : [l], f = L.isRectangle(n) ? mb(s, n, i.endDirections, c, i) : [u], d = d.filter((e) => r.isAccessible(e)), f = f.filter((e) => r.isAccessible(e)), d.length > 0 && f.length > 0) {
		let e = new Zy(), t = {}, n = {}, o = {};
		for (let n = 0, r = d.length; n < r; n += 1) {
			let r = d[n], i = db(r);
			e.add(i, pb(r, f)), t[i] = r, o[i] = 0;
		}
		let s = i.previousDirectionAngle, p = s === void 0, m, h, g = ab(c, i), _ = g.length, v = f.map((e) => db(e)), y = I.equalPoints(d, f), b = i.maxLoopCount;
		for (; !e.isEmpty() && b > 0;) {
			let d = e.pop();
			if (d == null) break;
			let x = t[d], S = n[d], C = o[d], w = x.equals(l), T = S == null, E;
			if (E = T ? p ? w ? null : nb(l, x, _, c, i) : s : nb(S, x, _, c, i), !(T && y) && v.indexOf(d) >= 0) return i.previousDirectionAngle = E, hb(n, t, x, l, u);
			for (let s = 0; s < _; s += 1) {
				m = g[s];
				let l = m.angle ?? 0;
				if (h = E == null ? 0 : ib(E, l), !(p && w) && h > i.maxDirectionChange) continue;
				let d = ub(x.clone().translate(m.gridOffsetX || 0, m.gridOffsetY || 0), c, a), y = db(d);
				if (e.isClose(y) || !r.isAccessible(d) || v.indexOf(y) >= 0 && !d.equals(u) && ib(l, nb(d, u, _, c, i)) > i.maxDirectionChange) continue;
				let b = m.cost, S = w ? 0 : i.penalties[h], T = C + b + S;
				(!e.isOpen(y) || T < o[y]) && (t[y] = d, n[y] = x, o[y] = T, e.add(y, T + pb(d, f)));
			}
			--b;
		}
	}
	return i.fallbackRoute ? F(i.fallbackRoute, this, l, u, i) : null;
}
function _b(e, t = 10) {
	if (e.length <= 1) return e;
	for (let n = 0, r = e.length; n < r - 1; n += 1) {
		let r = e[n], i = e[n + 1];
		if (r.x === i.x) {
			let e = t * Math.round(r.x / t);
			r.x !== e && (r.x = e, i.x = e);
		} else if (r.y === i.y) {
			let e = t * Math.round(r.y / t);
			r.y !== e && (r.y = e, i.y = e);
		}
	}
	return e;
}
var vb = function(e, t, n) {
	let r = Hy(t), i = Qy(n, r), a = $y(n, r), o = eb(n, r), s = Jy(n.graph.model, n.cell, r), c = e.map((e) => I.create(e)), l = [], u = o, d, f;
	for (let t = 0, p = c.length; t <= p; t += 1) {
		let p = null;
		if (d = f || i, f = c[t], f == null) {
			f = a;
			let e = n.cell;
			if ((e.getSourceCellId() == null || e.getTargetCellId() == null) && typeof r.draggingRouter == "function") {
				let e = d === i ? o : d, t = f.getOrigin();
				p = F(r.draggingRouter, n, e, t, r);
			}
		}
		if (p ?? (p = gb(n, d, f, s, r)), p === null) return console.warn("Unable to execute manhattan algorithm, use orth instead"), F(r.fallbackRouter, this, e, r, n);
		p[0]?.equals(u) && p.shift(), u = p[p.length - 1] || u, l.push(...p);
	}
	return r.snapToGrid ? _b(l, n.graph.grid.getGridSize()) : l;
}, yb = function(e, t, n) {
	return F(vb, this, e, Object.assign(Object.assign({}, By), t), n);
}, bb = {
	maxDirectionChange: 45,
	directions() {
		let e = Vy(this.step, this), t = Vy(this.cost, this), n = Math.ceil(Math.sqrt(e * e << 1));
		return [
			{
				cost: t,
				offsetX: e,
				offsetY: 0
			},
			{
				cost: n,
				offsetX: e,
				offsetY: e
			},
			{
				cost: t,
				offsetX: 0,
				offsetY: e
			},
			{
				cost: n,
				offsetX: -e,
				offsetY: e
			},
			{
				cost: t,
				offsetX: -e,
				offsetY: 0
			},
			{
				cost: n,
				offsetX: -e,
				offsetY: -e
			},
			{
				cost: t,
				offsetX: 0,
				offsetY: -e
			},
			{
				cost: n,
				offsetX: e,
				offsetY: -e
			}
		];
	},
	fallbackRoute: xb
};
function xb(e, t, n) {
	let r = e.theta(t), i = [], a = {
		x: t.x,
		y: e.y
	}, o = {
		x: e.x,
		y: t.y
	};
	if (r % 180 > 90) {
		let e = a;
		a = o, o = e;
	}
	let s = r % 90 < 45 ? a : o, c = new R(e, s), l = 90 * Math.ceil(r / 90), u = new R(t, I.fromPolar(c.squaredLength(), Iu(l + 135), s)), d = c.intersectsWithLine(u), f = d || e, p = 360 / n.directions.length, m = Lu(f.theta(t) + p / 2);
	return n.previousDirectionAngle = p * Math.floor(m / p), d && !d.equals(e) && !d.equals(t) && i.push(d.round()), i;
}
var Sb = function(e, t, n) {
	return F(yb, this, e, Object.assign(Object.assign({}, bb), t), n);
}, Cb = (e, t, n) => {
	let r = t.offset || 32, i = t.min == null ? 16 : t.min, a = 0, o = t.direction, s = n.sourceBBox, c = n.targetBBox, l = s.getCenter(), u = c.getCenter();
	if (typeof r == "number" && (a = r), o == null) {
		let e = c.left - s.right, t = c.top - s.bottom;
		e >= 0 && t >= 0 ? o = e >= t ? "L" : "T" : e <= 0 && t >= 0 ? (e = s.left - c.right, o = e >= 0 && e >= t ? "R" : "T") : e >= 0 && t <= 0 ? (t = s.top - c.bottom, o = t >= 0 ? e >= t ? "L" : "B" : "L") : (e = s.left - c.right, t = s.top - c.bottom, o = e >= 0 && t >= 0 ? e >= t ? "R" : "B" : e <= 0 && t >= 0 ? "B" : e >= 0 && t <= 0 || Math.abs(e) > Math.abs(t) ? "R" : "B");
	}
	o === "H" ? o = u.x - l.x >= 0 ? "L" : "R" : o === "V" && (o = u.y - l.y >= 0 ? "T" : "B"), r === "center" && (o === "L" ? a = (c.left - s.right) / 2 : o === "R" ? a = (s.left - c.right) / 2 : o === "T" ? a = (c.top - s.bottom) / 2 : o === "B" && (a = (s.top - c.bottom) / 2));
	let d, f, p, m = o === "L" || o === "R";
	if (m) {
		if (u.y === l.y) return [...e];
		p = o === "L" ? 1 : -1, d = "x", f = "width";
	} else {
		if (u.x === l.x) return [...e];
		p = o === "T" ? 1 : -1, d = "y", f = "height";
	}
	let h = l.clone(), g = u.clone();
	if (h[d] += p * (s[f] / 2 + a), g[d] -= p * (c[f] / 2 + a), m) {
		let e = h.x, t = g.x, n = s.width / 2 + i, r = c.width / 2 + i;
		u.x > l.x ? t <= e && (h.x = Math.max(t, l.x + n), g.x = Math.min(e, u.x - r)) : t >= e && (h.x = Math.min(t, l.x - n), g.x = Math.max(e, u.x + r));
	} else {
		let e = h.y, t = g.y, n = s.height / 2 + i, r = c.height / 2 + i;
		u.y > l.y ? t <= e && (h.y = Math.max(t, l.y + n), g.y = Math.min(e, u.y - r)) : t >= e && (h.y = Math.min(t, l.y - n), g.y = Math.max(e, u.y + r));
	}
	return [
		h.toJSON(),
		...e,
		g.toJSON()
	];
};
// node_modules/@antv/x6/es/registry/router/loop.js
function wb(e, t) {
	if (t != null && t !== !1) {
		let n = typeof t == "boolean" ? 0 : t;
		if (n > 0) {
			let t = I.create(e[1]).move(e[2], n), r = I.create(e[1]).move(e[0], n);
			return [
				t.toJSON(),
				...e,
				r.toJSON()
			];
		}
		{
			let t = e[1];
			return [
				Object.assign({}, t),
				...e,
				Object.assign({}, t)
			];
		}
	}
	return e;
}
var Tb = (e, t, n) => {
	let r = t.width || 50, i = (t.height || 80) / 2, a = t.angle || "auto", o = n.sourceAnchor, s = n.targetAnchor, c = n.sourceBBox, l = n.targetBBox;
	if (o.equals(s)) {
		let e = (e) => {
			let t = Iu(e), n = Math.sin(t), a = Math.cos(t), s = new I(o.x + a * r, o.y + n * r), c = new I(s.x - a * i, s.y - n * i), l = c.clone().rotate(-90, s), u = c.clone().rotate(90, s);
			return [
				l.toJSON(),
				s.toJSON(),
				u.toJSON()
			];
		}, n = (e) => {
			let t = new R(o.clone().move(e, -1), e);
			return !c.containsPoint(e) && !c.intersectsWithLine(t);
		}, s = [
			0,
			90,
			180,
			270,
			45,
			135,
			225,
			315
		];
		if (typeof a == "number") return wb(e(a), t.merge);
		let l = c.getCenter();
		if (l.equals(o)) return wb(e(0), t.merge);
		let u = l.angleBetween(o, l.clone().translate(1, 0)), d = e(u);
		if (n(d[1])) return wb(d, t.merge);
		for (let r = 1, i = s.length; r < i; r += 1) if (d = e(u + s[r]), n(d[1])) return wb(d, t.merge);
		return wb(d, t.merge);
	}
	{
		let e = new R(o, s), a = e.parallel(-r), u = a.getCenter(), d = a.start.clone().move(a.end, i), f = a.end.clone().move(a.start, i), p = e.parallel(-1), m = new R(p.start, u), h = new R(p.end, u);
		if ((c.containsPoint(u) || l.containsPoint(u) || c.intersectsWithLine(m) || c.intersectsWithLine(h) || l.intersectsWithLine(m) || l.intersectsWithLine(h)) && (a = e.parallel(r), u = a.getCenter(), d = a.start.clone().move(a.end, i), f = a.end.clone().move(a.start, i)), t.merge) {
			let e = new R(o, s), t = new R(u, e.center).setLength(2 ** 53 - 1), r = c.intersectsWithLine(t), i = l.intersectsWithLine(t), a = r ? Array.isArray(r) ? r : [r] : [];
			i && (Array.isArray(i) ? a.push(...i) : a.push(i));
			let d = e.center.closest(a);
			d ? (n.sourceAnchor = d.clone(), n.targetAnchor = d.clone()) : (n.sourceAnchor = e.center.clone(), n.targetAnchor = e.center.clone());
		}
		return wb([
			d.toJSON(),
			u.toJSON(),
			f.toJSON()
		], t.merge);
	}
}, Eb = /* @__PURE__ */ s({
	er: () => Cb,
	loop: () => Tb,
	manhattan: () => yb,
	metro: () => Sb,
	normal: () => xy,
	oneSide: () => Sy,
	orth: () => ky
}), Db = q.create({ type: "router" });
Db.register(Eb, !0);
// node_modules/@antv/x6/es/view/markup.js
function Ob(e) {
	return e != null && !kb(e);
}
function kb(e) {
	return e != null && typeof e == "string";
}
function Ab(e) {
	return e == null || kb(e) ? e : N(e);
}
function jb(e) {
	return `${e}`.trim().replace(/[\r|\n]/g, " ").replace(/>\s+</g, "><");
}
function Mb(e, t = { ns: Td.svg }) {
	let n = document.createDocumentFragment(), r = {}, i = {}, a = [{
		markup: Array.isArray(e) ? e : [e],
		parent: n,
		ns: t.ns
	}];
	for (; a.length > 0;) {
		let e = a.pop(), t = e.ns || Td.svg, n = e.markup, o = e.parent;
		n.forEach((e) => {
			let n = e.tagName;
			if (!n) throw TypeError("Invalid tagName");
			e.ns && (t = e.ns);
			let s = t ? Dd(n, t) : Ed(n), c = e.attrs;
			c && H(s, nf(c));
			let l = e.style;
			l && U(s, l);
			let u = e.className;
			u != null && s.setAttribute("class", Array.isArray(u) ? u.join(" ") : u), e.textContent && (s.textContent = e.textContent);
			let d = e.selector;
			if (d != null) {
				if (i[d]) throw TypeError("Selector must be unique");
				i[d] = s;
			}
			if (e.groupSelector) {
				let t = e.groupSelector;
				Array.isArray(t) || (t = [t]), t.forEach((e) => {
					r[e] || (r[e] = []), r[e].push(s);
				});
			}
			o.appendChild(s);
			let f = e.children;
			Array.isArray(f) && a.push({
				ns: t,
				markup: f,
				parent: s
			});
		});
	}
	return Object.keys(r).forEach((e) => {
		if (i[e]) throw Error("Ambiguous group selector");
		i[e] = r[e];
	}), {
		fragment: n,
		selectors: i,
		groups: r
	};
}
function Nb(e) {
	return e instanceof SVGElement ? Od("g") : Ed("div");
}
function Pb(e) {
	if (kb(e)) {
		let t = W.createVectors(e), n = t.length;
		if (n === 1) return { elem: t[0].node };
		if (n > 1) {
			let e = Nb(t[0].node);
			return t.forEach((t) => {
				e.appendChild(t.node);
			}), { elem: e };
		}
		return {};
	}
	let t = Mb(e), n = t.fragment, r = null;
	return n.childNodes.length > 1 ? (r = Nb(n.firstChild), r.appendChild(n)) : r = n.firstChild, {
		elem: r,
		selectors: t.selectors
	};
}
function Fb(e) {
	let t = W.createVectors(e), n = document.createDocumentFragment();
	for (let e = 0, r = t.length; e < r; e += 1) {
		let r = t[e].node;
		n.appendChild(r);
	}
	return {
		fragment: n,
		selectors: {}
	};
}
function Ib(e, t, n) {
	if (e != null) {
		let r, i = e.tagName.toLowerCase();
		if (e === t) return r = typeof n == "string" ? `> ${i} > ${n}` : `> ${i}`, r;
		let a = e.parentNode;
		return r = a && a.childNodes.length > 1 ? `${i}:nth-child(${Md(e) + 1})` : i, n && (r += ` > ${n}`), Ib(e.parentNode, t, r);
	}
	return n;
}
function Lb() {
	return "g";
}
function Rb() {
	return {
		tagName: "circle",
		selector: "circle",
		attrs: {
			r: 10,
			fill: "#FFFFFF",
			stroke: "#000000"
		}
	};
}
function zb() {
	return {
		tagName: "text",
		selector: "text",
		attrs: { fill: "#000000" }
	};
}
function Bb() {
	return [{
		tagName: "path",
		selector: "wrap",
		groupSelector: "lines",
		attrs: {
			fill: "none",
			cursor: "pointer",
			stroke: "transparent",
			strokeLinecap: "round"
		}
	}, {
		tagName: "path",
		selector: "line",
		groupSelector: "lines",
		attrs: {
			fill: "none",
			pointerEvents: "none"
		}
	}];
}
function Vb(e = !1) {
	return {
		tagName: "foreignObject",
		selector: "fo",
		children: [{
			ns: Td.xhtml,
			tagName: "body",
			selector: "foBody",
			attrs: { xmlns: Td.xhtml },
			style: {
				width: "100%",
				height: "100%",
				background: "transparent"
			},
			children: e ? [] : [{
				tagName: "div",
				selector: "foContent",
				style: {
					width: "100%",
					height: "100%"
				}
			}]
		}]
	};
}
var Hb = {
	isJSONMarkup: Ob,
	isStringMarkup: kb,
	clone: Ab,
	sanitize: jb,
	parseJSONMarkup: Mb,
	createContainer: Nb,
	renderMarkup: Pb,
	parseLabelStringMarkup: Fb,
	getSelector: Ib,
	getPortContainerMarkup: Lb,
	getPortMarkup: Rb,
	getPortLabelMarkup: zb,
	getEdgeMarkup: Bb,
	getForeignObjectMarkup: Vb
}, Ub = {};
function Wb(e, t) {
	Ub[e] = t;
}
function Gb(e) {
	delete Ub[e];
}
function Kb(e, t) {
	return t ? Od(e || "g") : Dd(e || "div");
}
function qb(e, t, n) {
	if (!e || e === ".") return { elems: [t] };
	if (n) {
		let t = n[e];
		if (t) return { elems: Array.isArray(t) ? t : [t] };
	}
	if (J.useCSSSelector) {
		let n = e.includes(">") ? `:scope ${e}` : e;
		return {
			isCSSSelector: !0,
			elems: Array.prototype.slice.call(t.querySelectorAll(n))
		};
	}
	return { elems: [] };
}
function Jb(e) {
	let t = e, n = e.originalEvent?.changedTouches?.[0];
	if (n) {
		for (let t in e) n[t] === void 0 && (n[t] = e[t]);
		t = n;
	}
	return t;
}
// node_modules/@antv/x6/es/view/view/index.js
var Yb = class extends xh {
	get priority() {
		return 2;
	}
	get disposeContainer() {
		return !0;
	}
	constructor() {
		super(), this.cid = ru("v"), Wb(this.cid, this);
	}
	confirmUpdate(e, t) {
		return 0;
	}
	empty(e = this.container) {
		return Rd(e), this;
	}
	unmount(e = this.container) {
		return Ld(e), this;
	}
	remove(e = this.container) {
		return e === this.container ? (this.removeEventListeners(document), this.onRemove(), Gb(this.cid), this.disposeContainer && this.unmount(e)) : this.unmount(e), this;
	}
	onRemove() {}
	setClass(e, t = this.container) {
		t.classList.value = Array.isArray(e) ? e.join(" ") : e;
	}
	addClass(e, t = this.container) {
		return B(t, Array.isArray(e) ? e.join(" ") : e), this;
	}
	removeClass(e, t = this.container) {
		return V(t, Array.isArray(e) ? e.join(" ") : e), this;
	}
	setStyle(e, t = this.container) {
		return U(t, e), this;
	}
	setAttrs(e, t = this.container) {
		return e != null && t != null && H(t, e), this;
	}
	findAttr(e, t = this.container) {
		let n = t;
		for (; n && n.nodeType === 1;) {
			let t = n.getAttribute(e);
			if (t != null) return t;
			if (n === this.container) return null;
			n = n.parentNode;
		}
		return null;
	}
	find(e, t = this.container, n = this.selectors) {
		return qb(e, t, n).elems;
	}
	findOne(e, t = this.container, n = this.selectors) {
		let r = this.find(e, t, n);
		return r.length > 0 ? r[0] : null;
	}
	findByAttr(e, t = this.container) {
		let n = t;
		for (; n?.getAttribute;) {
			let t = n.getAttribute(e);
			if ((t != null || n === this.container) && t !== "false") return n;
			n = n.parentNode;
		}
		return null;
	}
	getSelector(e, t) {
		let n;
		if (e === this.container) return typeof t == "string" && (n = `> ${t}`), n;
		if (e) {
			let r = Md(e) + 1;
			n = `${e.tagName.toLowerCase()}:nth-child(${r})`, t && (n += ` > ${t}`), n = this.getSelector(e.parentNode, n);
		}
		return n;
	}
	prefixClassName(e) {
		return J.prefix(e);
	}
	delegateEvents(e, t) {
		if (e == null) return this;
		t || this.undelegateEvents();
		let n = /^(\S+)\s*(.*)$/;
		return Object.keys(e).forEach((t) => {
			let r = t.match(n);
			if (r == null) return;
			let i = this.getEventHandler(e[t]);
			typeof i == "function" && this.delegateEvent(r[1], r[2], i);
		}), this;
	}
	undelegateEvents() {
		return G.off(this.container, this.getEventNamespace()), this;
	}
	delegateDocumentEvents(e, t) {
		return this.addEventListeners(document, e, t), this;
	}
	undelegateDocumentEvents() {
		return this.removeEventListeners(document), this;
	}
	delegateEvent(e, t, n) {
		return G.on(this.container, e + this.getEventNamespace(), t, n), this;
	}
	undelegateEvent(e, t, n) {
		let r = e + this.getEventNamespace();
		return t == null ? G.off(this.container, r) : typeof t == "string" ? G.off(this.container, r, t, n) : G.off(this.container, r, t), this;
	}
	addEventListeners(e, t, n) {
		if (t == null) return this;
		let r = this.getEventNamespace();
		return Object.keys(t).forEach((i) => {
			let a = this.getEventHandler(t[i]);
			typeof a == "function" && G.on(e, i + r, n, a);
		}), this;
	}
	removeEventListeners(e) {
		return e != null && G.off(e, this.getEventNamespace()), this;
	}
	getEventNamespace() {
		return `.${J.prefixCls}-event-${this.cid}`;
	}
	getEventHandler(e) {
		let t;
		if (typeof e == "string") {
			let n = this[e];
			typeof n == "function" && (t = (...e) => n.call(this, ...e));
		} else t = (...t) => e.call(this, ...t);
		return t;
	}
	getEventTarget(e, t = {}) {
		let { target: n, type: r, clientX: i = 0, clientY: a = 0 } = e;
		return t.fromPoint || r === "touchmove" || r === "touchend" ? document.elementFromPoint(i, a) : n;
	}
	stopPropagation(e) {
		return this.setEventData(e, { propagationStopped: !0 }), this;
	}
	isPropagationStopped(e) {
		return this.getEventData(e).propagationStopped === !0;
	}
	getEventData(e) {
		return this.eventData(e);
	}
	setEventData(e, t) {
		return this.eventData(e, t);
	}
	eventData(e, t) {
		if (e == null) throw TypeError("Event object required");
		let n = e.data, r = `__${this.cid}__`;
		return t == null ? n == null ? {} : n[r] || {} : (n ?? (n = e.data = {}), n[r] == null ? n[r] = Object.assign({}, t) : n[r] = Object.assign(Object.assign({}, n[r]), t), n[r]);
	}
	normalizeEvent(e) {
		return Jb(e);
	}
	dispose() {
		this.remove();
	}
};
k([K()], Yb.prototype, "dispose", null);
// node_modules/@antv/x6/es/view/tool/util.js
var Xb = 0;
function Zb(e) {
	return e ? Yd(e) : (Xb += 1, `CustomTool${Xb}`);
}
// node_modules/@antv/x6/es/view/tool/tool-item.js
var Y = class e extends Yb {
	static isToolItem(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== Qb || r.graph == null || r.cell == null || typeof r.config != "function" || typeof r.update != "function" || typeof r.focus != "function" || typeof r.blur != "function" || typeof r.show != "function" || typeof r.hide != "function" || typeof r.isVisible != "function");
	}
	static define(e) {
		let t = this, n = Pf(Zb(e.name), t);
		return n.config(e), n;
	}
	static getDefaults() {
		return this.defaults;
	}
	static config(e) {
		this.defaults = this.getOptions(e);
	}
	static getOptions(e) {
		return P(N(this.getDefaults()), e);
	}
	get graph() {
		return this.cellView.graph;
	}
	get cell() {
		return this.cellView.cell;
	}
	get name() {
		return this.options.name;
	}
	get [Symbol.toStringTag]() {
		return Qb;
	}
	constructor(e = {}) {
		super(), this.visible = !0, this.options = this.getOptions(e), this.container = Kb(this.options.tagName || "g", this.options.isSVGElement !== !1), B(this.container, this.prefixClassName("cell-tool")), typeof this.options.className == "string" && B(this.container, this.options.className), this.init();
	}
	init() {}
	getOptions(e) {
		return this.constructor.getOptions(e);
	}
	delegateEvents() {
		return this.options.events && super.delegateEvents(this.options.events), this;
	}
	config(e, t) {
		return this.cellView = e, this.parent = t, this.stamp(this.container), this.cell.isEdge() ? B(this.container, this.prefixClassName("edge-tool")) : this.cell.isNode() && B(this.container, this.prefixClassName("node-tool")), this.name && this.container.setAttribute("data-tool-name", this.name), this.delegateEvents(), this;
	}
	render() {
		this.empty();
		let e = this.options.markup;
		if (e) {
			let t = Hb.parseJSONMarkup(e);
			this.container.appendChild(t.fragment), this.childNodes = t.selectors;
		}
		return this.onRender(), this;
	}
	onRender() {}
	update() {
		return this;
	}
	stamp(e) {
		e && e.setAttribute("data-cell-id", this.cellView.cell.id);
	}
	show() {
		return this.container.style.display = "", this.visible = !0, this;
	}
	hide() {
		return this.container.style.display = "none", this.visible = !1, this;
	}
	isVisible() {
		return this.visible;
	}
	focus() {
		let e = this.options.focusOpacity;
		return e != null && Number.isFinite(e) && (this.container.style.opacity = `${e}`), this.parent.focus(this), this;
	}
	blur() {
		return this.container.style.opacity = "", this.parent.blur(this), this;
	}
	guard(e) {
		return this.graph == null || this.cellView == null || this.graph.view.guard(e, this.cellView);
	}
};
Y.toStringTag = `X6.${Y.name}`, Y.defaults = {
	isSVGElement: !0,
	tagName: "g"
};
var Qb = `X6.${Y.name}`, $b = class {
	constructor(e) {
		this.view = e;
	}
	get cell() {
		return this.view.cell;
	}
	getDefinition(e) {
		return this.cell.getAttrDefinition(e);
	}
	processAttrs(e, t) {
		let n, r, i, a, o = [];
		return Object.keys(t).forEach((r) => {
			let i = t[r], a = this.getDefinition(r), s = F(Xg, this.view, a, i, {
				elem: e,
				attrs: t,
				cell: this.cell,
				view: this.view
			});
			if (a && s) typeof a == "string" ? (n ?? (n = {}), n[a] = i) : i !== null && o.push({
				name: r,
				definition: a
			});
			else {
				n ?? (n = {});
				let e = Xd.includes(r) ? r : Jd(r);
				n[e] = i;
			}
		}), o.forEach(({ name: e, definition: n }) => {
			let o = t[e];
			typeof n.set == "function" && (r ?? (r = {}), r[e] = o), typeof n.offset == "function" && (i ?? (i = {}), i[e] = o), typeof n.position == "function" && (a ?? (a = {}), a[e] = o);
		}), {
			raw: t,
			normal: n,
			set: r,
			offset: i,
			position: a
		};
	}
	mergeProcessedAttrs(e, t) {
		e.set = Object.assign(Object.assign({}, e.set), t.set), e.position = Object.assign(Object.assign({}, e.position), t.position), e.offset = Object.assign(Object.assign({}, e.offset), t.offset);
		let n = e.normal?.transform;
		n != null && t.normal && (t.normal.transform = n), e.normal = t.normal;
	}
	findAttrs(e, t, n, r) {
		let i = [], a = new Sh();
		return Object.keys(e).forEach((o) => {
			let s = e[o];
			if (!ii(s)) return;
			let { isCSSSelector: c, elems: l } = qb(o, t, r);
			n[o] = l;
			for (let e = 0, t = l.length; e < t; e += 1) {
				let n = l[e], u = r && r[o] === n, d = a.get(n);
				if (d) {
					d.array || (i.push(n), d.array = !0, d.attrs = [d.attrs], d.priority = [d.priority]);
					let e = d.attrs, r = d.priority;
					if (u) e.unshift(s), r.unshift(-1);
					else {
						let n = ql(r, c ? -1 : t);
						e.splice(n, 0, s), r.splice(n, 0, t);
					}
				} else a.set(n, {
					elem: n,
					attrs: s,
					priority: u ? -1 : t,
					array: !1
				});
			}
		}), i.forEach((e) => {
			let t = a.get(e);
			t.attrs = t.attrs.reduceRight((e, t) => P(e, t), {});
		}), a;
	}
	updateRelativeAttrs(e, t, n) {
		let r = t.raw || {}, i = t.normal || {}, a = t.set, o = t.position, s = t.offset, c = () => ({
			elem: e,
			cell: this.cell,
			view: this.view,
			attrs: r,
			refBBox: n.clone()
		});
		if (a != null && Object.keys(a).forEach((e) => {
			let t = a[e], n = this.getDefinition(e);
			if (n != null) {
				let r = F(n.set, this.view, t, c());
				typeof r == "object" ? i = Object.assign(Object.assign({}, i), r) : r != null && (i[e] = r);
			}
		}), e instanceof HTMLElement) {
			this.view.setAttrs(i, e);
			return;
		}
		let l = i.transform, u = _p(l ? `${l}` : null), d = new I(u.e, u.f);
		l && (delete i.transform, u.e = 0, u.f = 0);
		let f = !1;
		o != null && Object.keys(o).forEach((e) => {
			let t = o[e], n = this.getDefinition(e);
			if (n != null) {
				let e = F(n.position, this.view, t, c());
				e != null && (f = !0, d.translate(I.create(e)));
			}
		}), this.view.setAttrs(i, e);
		let p = !1;
		if (s != null) {
			let t = this.view.getBoundingRectOfElement(e);
			if (t.width > 0 && t.height > 0) {
				let n = ym(t, u);
				Object.keys(s).forEach((t) => {
					let i = s[t], a = this.getDefinition(t);
					if (a != null) {
						let t = F(a.offset, this.view, i, {
							elem: e,
							cell: this.cell,
							view: this.view,
							attrs: r,
							refBBox: n
						});
						t != null && (p = !0, d.translate(I.create(t)));
					}
				});
			}
		}
		(l != null || f || p) && (d.round(1), u.e = d.x, u.f = d.y, e.setAttribute("transform", vp(u)));
	}
	update(e, t, n) {
		let r = {}, i = this.findAttrs(n.attrs || t, e, r, n.selectors), a = n.attrs ? this.findAttrs(t, e, r, n.selectors) : i, o = [];
		i.each((t) => {
			let i = t.elem, s = t.attrs, c = this.processAttrs(i, s);
			if (c.set == null && c.position == null && c.offset == null) this.view.setAttrs(c.normal, i);
			else {
				let t = a.get(i), l = t ? t.attrs : null, u = l && s.ref == null ? l.ref : s.ref, d;
				if (u) {
					if (d = (r[u] || this.view.find(u, e, n.selectors))[0], !d) throw Error(`"${u}" reference does not exist.`);
				} else d = null;
				let f = {
					node: i,
					refNode: d,
					attributes: l,
					processedAttributes: c
				}, p = o.findIndex((e) => e.refNode === i);
				p > -1 ? o.splice(p, 0, f) : o.push(f);
			}
		});
		let s = new Sh(), c;
		o.forEach((t) => {
			let r = t.node, i = t.refNode, a, o = i != null && n.rotatableNode != null && Id(n.rotatableNode, i);
			if (i && (a = s.get(i)), !a) {
				let t = o ? n.rotatableNode : e;
				a = i ? xm(i, { target: t }) : n.rootBBox, i && s.set(i, a);
			}
			let l;
			n.attrs && t.attributes ? (l = this.processAttrs(r, t.attributes), this.mergeProcessedAttrs(l, t.processedAttributes)) : l = t.processedAttributes;
			let u = a;
			o && n.rotatableNode != null && !n.rotatableNode.contains(r) && (c || (c = _p(H(n.rotatableNode, "transform"))), u = ym(a, c)), this.updateRelativeAttrs(r, l, u);
		});
	}
}, ex = class {
	constructor(e) {
		this.view = e, this.clean();
	}
	clean() {
		this.elemCache && this.elemCache.dispose(), this.elemCache = new Sh(), this.pathCache = {};
	}
	get(e) {
		return this.elemCache.has(e) || this.elemCache.set(e, {}), this.elemCache.get(e);
	}
	getData(e) {
		let t = this.get(e);
		return t.data || (t.data = {}), t.data;
	}
	getMatrix(e) {
		let t = this.get(e);
		if (t.matrix == null) {
			let n = this.view.container;
			t.matrix = Ap(e, n);
		}
		return hp(t.matrix);
	}
	getShape(e) {
		let t = this.get(e);
		return t.shape ?? (t.shape = Cm(e)), t.shape.clone();
	}
	getBoundingRect(e) {
		let t = this.get(e);
		return t.boundingRect ?? (t.boundingRect = Tm(e)), t.boundingRect.clone();
	}
}, tx = class {
	get cell() {
		return this.view.cell;
	}
	constructor(e, t, n = []) {
		this.view = e;
		let r = {}, i = {}, a = 0;
		Object.keys(t).forEach((e) => {
			let n = t[e];
			Array.isArray(n) || (n = [n]), n.forEach((t) => {
				let n = r[t];
				n || (a += 1, n = r[t] = 1 << a), i[e] |= n;
			});
		});
		let o = n;
		if (Array.isArray(o) || (o = [o]), o.forEach((e) => {
			r[e] || (a += 1, r[e] = 1 << a);
		}), a > 25) throw Error("Maximum number of flags exceeded.");
		this.flags = r, this.attrs = i, this.bootstrap = n;
	}
	getFlag(e) {
		let t = this.flags;
		return t == null ? 0 : Array.isArray(e) ? e.reduce((e, n) => e | t[n], 0) : t[e] | 0;
	}
	hasAction(e, t) {
		return e & this.getFlag(t);
	}
	removeAction(e, t) {
		return e ^ e & this.getFlag(t);
	}
	getBootstrapFlag() {
		return this.getFlag(this.bootstrap);
	}
	getChangedFlag() {
		let e = 0;
		return this.attrs && Object.keys(this.attrs).forEach((t) => {
			this.cell.hasChanged(t) && (e |= this.attrs[t]);
		}), e;
	}
}, nx = class e extends Yb {
	static getDefaults() {
		return e.defaults;
	}
	static isCellView(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== rx || typeof r.isNodeView != "function" || typeof r.isEdgeView != "function" || typeof r.confirmUpdate != "function");
	}
	static config(t) {
		e.defaults = e.getOptions(t);
	}
	static getOptions(t) {
		let n = (e, t) => t == null ? Array.isArray(e) ? [...e] : [e] : tu([...Array.isArray(e) ? e : [e], ...Array.isArray(t) ? t : [t]]), r = N(e.getDefaults()), { bootstrap: i, actions: a, events: o, documentEvents: s } = t, c = O(t, [
			"bootstrap",
			"actions",
			"events",
			"documentEvents"
		]);
		return i && (r.bootstrap = n(r.bootstrap, i)), a && Object.entries(a).forEach(([e, t]) => {
			let i = r.actions[e];
			t && i ? r.actions[e] = n(i, t) : t && (r.actions[e] = n(t));
		}), o && (r.events = Object.assign(Object.assign({}, r.events), o)), t.documentEvents && (r.documentEvents = Object.assign(Object.assign({}, r.documentEvents), s)), P(r, c);
	}
	get [Symbol.toStringTag]() {
		return rx;
	}
	constructor(e, t = {}) {
		super(), this.cell = e, this.options = this.ensureOptions(t), this.graph = this.options.graph, this.attr = new $b(this), this.flag = new tx(this, this.options.actions, this.options.bootstrap), this.cache = new ex(this), this.setContainer(this.ensureContainer()), this.setup(), this.init();
	}
	init() {}
	onRemove() {
		this.removeTools();
	}
	get priority() {
		return this.options.priority;
	}
	get rootSelector() {
		return this.options.rootSelector;
	}
	getConstructor() {
		return this.constructor;
	}
	ensureOptions(e) {
		return this.getConstructor().getOptions(e);
	}
	getContainerTagName() {
		return this.options.isSvgElement ? "g" : "div";
	}
	getContainerStyle() {}
	getContainerAttrs() {
		return {
			"data-cell-id": this.cell.id,
			"data-shape": this.cell.shape
		};
	}
	getContainerClassName() {
		return this.prefixClassName("cell");
	}
	ensureContainer() {
		return Kb(this.getContainerTagName(), this.options.isSvgElement);
	}
	setContainer(e) {
		if (this.container !== e) {
			this.undelegateEvents(), this.container = e, this.options.events != null && this.delegateEvents(this.options.events);
			let t = this.getContainerAttrs();
			t != null && this.setAttrs(t, e);
			let n = this.getContainerStyle();
			n != null && this.setStyle(n, e);
			let r = this.getContainerClassName();
			r != null && this.addClass(r, e);
		}
		return this;
	}
	isNodeView() {
		return !1;
	}
	isEdgeView() {
		return !1;
	}
	render() {
		return this;
	}
	confirmUpdate(e, t = {}) {
		return 0;
	}
	getBootstrapFlag() {
		return this.flag.getBootstrapFlag();
	}
	getFlag(e) {
		return this.flag.getFlag(e);
	}
	hasAction(e, t) {
		return this.flag.hasAction(e, t);
	}
	removeAction(e, t) {
		return this.flag.removeAction(e, t);
	}
	handleAction(e, t, n, r) {
		if (this.hasAction(e, t)) {
			n();
			let i = [t];
			return r && (typeof r == "string" ? i.push(r) : i.push(...r)), this.removeAction(e, i);
		}
		return e;
	}
	setup() {
		this.cell.on("changed", this.onCellChanged, this);
	}
	onCellChanged({ options: e }) {
		this.onAttrsChange(e);
	}
	onAttrsChange(e) {
		let t = this.flag.getChangedFlag();
		!e.updated && t && (e.dirty && this.hasAction(t, "update") && (t |= this.getFlag("render")), e.toolId && (e.async = !1), this.graph != null && this.graph.renderer.requestViewUpdate(this, t, e));
	}
	parseJSONMarkup(e, t) {
		let n = Hb.parseJSONMarkup(e), r = n.selectors, i = this.rootSelector;
		if (t && i) {
			if (r[i]) throw Error("Invalid root selector");
			r[i] = t;
		}
		return n;
	}
	can(e) {
		let t = this.graph.options.interacting;
		if (typeof t == "function" && (t = F(t, this.graph, this)), typeof t == "object") {
			let n = t[e];
			return typeof n == "function" && (n = F(n, this.graph, this)), n !== !1;
		}
		return typeof t == "boolean" && t;
	}
	cleanCache() {
		return this.cache.clean(), this;
	}
	getCache(e) {
		return this.cache.get(e);
	}
	getDataOfElement(e) {
		return this.cache.getData(e);
	}
	getMatrixOfElement(e) {
		return this.cache.getMatrix(e);
	}
	getShapeOfElement(e) {
		return this.cache.getShape(e);
	}
	getBoundingRectOfElement(e) {
		return this.cache.getBoundingRect(e);
	}
	getBBoxOfElement(e) {
		let t = this.getBoundingRectOfElement(e), n = this.getMatrixOfElement(e), r = this.getRootRotatedMatrix();
		return ym(t, this.getRootTranslatedMatrix().multiply(r).multiply(n));
	}
	getUnrotatedBBoxOfElement(e) {
		let t = this.getBoundingRectOfElement(e), n = this.getMatrixOfElement(e);
		return ym(t, this.getRootTranslatedMatrix().multiply(n));
	}
	getBBox(e = {}) {
		let t;
		if (e.useCellGeometry) {
			let e = this.cell, n = e.isNode() ? e.getAngle() : 0;
			t = e.getBBox().bbox(n);
		} else t = this.getBBoxOfElement(this.container);
		return this.graph.coord.localToGraphRect(t);
	}
	getRootTranslatedMatrix() {
		let e = this.cell, t = e.isNode() ? e.getPosition() : {
			x: 0,
			y: 0
		};
		return hp().translate(t.x, t.y);
	}
	getRootRotatedMatrix() {
		let e = hp(), t = this.cell, n = t.isNode() ? t.getAngle() : 0;
		if (n) {
			let r = t.getBBox(), i = r.width / 2, a = r.height / 2;
			e = e.translate(i, a).rotate(n).translate(-i, -a);
		}
		return e;
	}
	findMagnet(e = this.container) {
		return this.findByAttr("magnet", e);
	}
	updateAttrs(e, t, n = {}) {
		n.rootBBox ?? (n.rootBBox = new L()), n.selectors ?? (n.selectors = this.selectors), this.attr.update(e, t, n);
	}
	isEdgeElement(e) {
		return this.cell.isEdge() && (e == null || e === this.container);
	}
	prepareHighlight(e, t = {}) {
		let n = e || this.container;
		return t.partial = n === this.container, n;
	}
	highlight(e, t = {}) {
		let n = this.prepareHighlight(e, t);
		return this.notify("cell:highlight", {
			magnet: n,
			options: t,
			view: this,
			cell: this.cell
		}), this.isEdgeView() ? this.notify("edge:highlight", {
			magnet: n,
			options: t,
			view: this,
			edge: this.cell,
			cell: this.cell
		}) : this.isNodeView() && this.notify("node:highlight", {
			magnet: n,
			options: t,
			view: this,
			node: this.cell,
			cell: this.cell
		}), this;
	}
	unhighlight(e, t = {}) {
		let n = this.prepareHighlight(e, t);
		return this.notify("cell:unhighlight", {
			magnet: n,
			options: t,
			view: this,
			cell: this.cell
		}), this.isNodeView() ? this.notify("node:unhighlight", {
			magnet: n,
			options: t,
			view: this,
			node: this.cell,
			cell: this.cell
		}) : this.isEdgeView() && this.notify("edge:unhighlight", {
			magnet: n,
			options: t,
			view: this,
			edge: this.cell,
			cell: this.cell
		}), this;
	}
	notifyUnhighlight(e, t) {}
	getEdgeTerminal(e, t, n, r, i) {
		let a = this.cell, o = this.findAttr("port", e), s = e.getAttribute("data-selector"), c = { cell: a.id };
		return s != null && (c.magnet = s), o == null ? s == null && this.container !== e && (c.selector = this.getSelector(e)) : (c.port = o, a.isNode() && !a.hasPort(o) && s == null && (c.selector = this.getSelector(e))), c;
	}
	getMagnetFromEdgeTerminal(e) {
		let t = this.cell, n = this.container, r = e.port, i = e.magnet, a;
		return r != null && t.isNode() && t.hasPort(r) ? a = this.findPortElem(r, i) || n : (i || (i = e.selector), !i && r != null && (i = `[port="${r}"]`), a = this.findOne(i, n, this.selectors)), a;
	}
	hasTools(e) {
		let t = this.tools;
		return t == null ? !1 : e == null || t.name === e;
	}
	addTools(e) {
		if (this.removeTools(), e) {
			if (!this.can("toolsAddable")) return this;
			let t = ix.isToolsView(e) ? e : new ix(e);
			this.tools = t, t.config({ view: this }), t.mount();
		}
		return this;
	}
	updateTools(e = {}) {
		return this.tools && this.tools.update(e), this;
	}
	removeTools() {
		return this.tools && (this.tools.remove(), this.tools = null), this;
	}
	hideTools() {
		return this.tools && this.tools.hide(), this;
	}
	showTools() {
		return this.tools && this.tools.show(), this;
	}
	renderTools() {
		let e = this.cell.getTools();
		return this.addTools(e), this;
	}
	notify(e, t) {
		return this.trigger(e, t), this.graph.trigger(e, t), this;
	}
	getEventArgs(e, t, n) {
		let r = this, i = r.cell;
		return t == null || n == null ? {
			e,
			view: r,
			cell: i
		} : {
			e,
			x: t,
			y: n,
			view: r,
			cell: i
		};
	}
	onClick(e, t, n) {
		this.notify("cell:click", this.getEventArgs(e, t, n));
	}
	onDblClick(e, t, n) {
		this.notify("cell:dblclick", this.getEventArgs(e, t, n));
	}
	onContextMenu(e, t, n) {
		this.notify("cell:contextmenu", this.getEventArgs(e, t, n));
	}
	onMouseDown(e, t, n) {
		this.cell.model && (this.cachedModelForMouseEvent = this.cell.model, this.cachedModelForMouseEvent.startBatch("mouse")), this.notify("cell:mousedown", this.getEventArgs(e, t, n));
	}
	onMouseUp(e, t, n) {
		this.notify("cell:mouseup", this.getEventArgs(e, t, n)), this.cachedModelForMouseEvent && (this.cachedModelForMouseEvent.stopBatch("mouse", { cell: this.cell }), this.cachedModelForMouseEvent = null);
	}
	onMouseMove(e, t, n) {
		this.notify("cell:mousemove", this.getEventArgs(e, t, n));
	}
	onMouseOver(e) {
		this.notify("cell:mouseover", this.getEventArgs(e));
	}
	onMouseOut(e) {
		this.notify("cell:mouseout", this.getEventArgs(e));
	}
	onMouseEnter(e) {
		this.notify("cell:mouseenter", this.getEventArgs(e));
	}
	onMouseLeave(e) {
		this.notify("cell:mouseleave", this.getEventArgs(e));
	}
	onMouseWheel(e, t, n, r) {
		this.notify("cell:mousewheel", Object.assign({ delta: r }, this.getEventArgs(e, t, n)));
	}
	onCustomEvent(e, t, n, r) {
		this.notify("cell:customevent", Object.assign({ name: t }, this.getEventArgs(e, n, r))), this.notify(t, Object.assign({}, this.getEventArgs(e, n, r)));
	}
	onMagnetMouseDown(e, t, n, r) {}
	onMagnetDblClick(e, t, n, r) {}
	onMagnetContextMenu(e, t, n, r) {}
	onLabelMouseDown(e, t, n) {}
	checkMouseleave(e) {
		let t = this.getEventTarget(e, { fromPoint: !0 }), n = this.graph.findViewByElem(t);
		n !== this && (this.onMouseLeave(e), n && n.onMouseEnter(e));
	}
	dispose() {
		this.cell.off("changed", this.onCellChanged, this);
	}
};
nx.defaults = {
	isSvgElement: !0,
	rootSelector: "root",
	priority: 0,
	bootstrap: [],
	actions: {}
}, nx.registry = q.create({ type: "view" }), k([K()], nx.prototype, "dispose", null);
var rx = `X6.${nx.name}`, ix = class e extends Yb {
	static isToolsView(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== ax || r.graph == null || r.cell == null || typeof r.config != "function" || typeof r.update != "function" || typeof r.focus != "function" || typeof r.blur != "function" || typeof r.show != "function" || typeof r.hide != "function");
	}
	get name() {
		return this.options.name;
	}
	get graph() {
		return this.cellView.graph;
	}
	get cell() {
		return this.cellView.cell;
	}
	get [Symbol.toStringTag]() {
		return ax;
	}
	constructor(e = {}) {
		super(), this.svgContainer = this.createContainer(!0, e), this.htmlContainer = this.createContainer(!1, e), this.config(e);
	}
	createContainer(e, t) {
		let n = e ? Kb("g", !0) : Kb("div", !1);
		return B(n, this.prefixClassName("cell-tools")), t.className && B(n, t.className), n;
	}
	config(e) {
		if (this.options = Object.assign(Object.assign({}, this.options), e), !nx.isCellView(e.view) || e.view === this.cellView) return this;
		this.cellView = e.view, this.cell.isEdge() ? (B(this.svgContainer, this.prefixClassName("edge-tools")), B(this.htmlContainer, this.prefixClassName("edge-tools"))) : this.cell.isNode() && (B(this.svgContainer, this.prefixClassName("node-tools")), B(this.htmlContainer, this.prefixClassName("node-tools"))), this.svgContainer.setAttribute("data-cell-id", this.cell.id), this.htmlContainer.setAttribute("data-cell-id", this.cell.id), this.name && (this.svgContainer.setAttribute("data-tools-name", this.name), this.htmlContainer.setAttribute("data-tools-name", this.name));
		let t = this.options.items;
		if (!Array.isArray(t)) return this;
		this.tools = [];
		let n = [];
		t.forEach((e) => {
			Y.isToolItem(e) ? e.name === "vertices" ? n.unshift(e) : n.push(e) : (typeof e == "object" ? e.name : e) === "vertices" ? n.unshift(e) : n.push(e);
		});
		for (let e = 0; e < n.length; e += 1) {
			let t = n[e], r;
			if (Y.isToolItem(t)) r = t;
			else {
				let e = typeof t == "object" ? t.name : t, n = typeof t == "object" && t.args || {};
				if (e) {
					if (this.cell.isNode()) {
						let t = Px.get(e);
						if (t) r = new t(n);
						else return Px.onNotFound(e);
					} else if (this.cell.isEdge()) {
						let t = Ix.get(e);
						if (t) r = new t(n);
						else return Ix.onNotFound(e);
					}
				}
			}
			r && (r.config(this.cellView, this), r.render(), (r.options.isSVGElement === !1 ? this.htmlContainer : this.svgContainer).appendChild(r.container), this.tools.push(r));
		}
		return this;
	}
	update(e = {}) {
		let t = this.tools;
		return t && t.forEach((t) => {
			e.toolId !== t.cid && t.isVisible() && t.update();
		}), this;
	}
	focus(e) {
		let t = this.tools;
		return t && t.forEach((t) => {
			e === t ? t.show() : t.hide();
		}), this;
	}
	blur(e) {
		let t = this.tools;
		return t && t.forEach((t) => {
			t !== e && !t.isVisible() && (t.show(), t.update());
		}), this;
	}
	hide() {
		return this.focus(null);
	}
	show() {
		return this.blur(null);
	}
	remove() {
		let e = this.tools;
		return e && (e.forEach((e) => e.remove()), this.tools = null), Ld(this.svgContainer), Ld(this.htmlContainer), super.remove();
	}
	mount() {
		let e = this.tools, t = this.cellView;
		if (t && e) {
			let n = e.some((e) => e.options.isSVGElement !== !1), r = e.some((e) => e.options.isSVGElement === !1);
			n && (this.options.local ? t.container : t.graph.view.decorator).appendChild(this.svgContainer), r && this.graph.container.appendChild(this.htmlContainer);
		}
		return this;
	}
};
ix.toStringTag = `X6.${ix.name}`;
var ax = `X6.${ix.name}`, ox = (e) => e;
// node_modules/@antv/x6/es/registry/connection-strategy/pin.js
function sx(e, t) {
	return t === 0 ? "0%" : `${Math.round(e / t * 100)}%`;
}
function cx(e) {
	return (t, n, r, i) => n.isEdgeElement(r) ? ux(e, t, n, r, i) : lx(e, t, n, r, i);
}
function lx(e, t, n, r, i) {
	let a = n.cell, o = a.getAngle(), s = n.getUnrotatedBBoxOfElement(r), c = a.getBBox().getCenter(), l = I.create(i).rotate(o, c), u = l.x - s.x, d = l.y - s.y;
	return e && (u = sx(u, s.width), d = sx(d, s.height)), t.anchor = {
		name: "topLeft",
		args: {
			dx: u,
			dy: d,
			rotate: !0
		}
	}, t;
}
function ux(e, t, n, r, i) {
	let a = n.getConnection();
	if (!a) return t;
	let o = a.closestPointLength(i);
	return t.anchor = e ? {
		name: "ratio",
		args: { ratio: o / a.length() }
	} : {
		name: "length",
		args: { length: o }
	}, t;
}
var dx = cx(!0), fx = cx(!1), px = /* @__PURE__ */ s({
	noop: () => ox,
	pinAbsolute: () => fx,
	pinRelative: () => dx
});
q.create({ type: "connection strategy" }).register(px, !0);
// node_modules/@antv/x6/es/registry/tool/util.js
function mx(e, t, n, r) {
	return F(px.pinRelative, this.graph, {}, t, n, e, this.cell, r, {}).anchor;
}
function hx(e, t) {
	return t ? e.cell.getBBox() : e.cell.isEdge() ? e.getConnection().bbox() : e.getUnrotatedBBoxOfElement(e.container);
}
// node_modules/@antv/x6/es/registry/tool/anchor.js
var gx = class extends Y {
	get type() {
		return this.options.type;
	}
	onRender() {
		B(this.container, this.prefixClassName(`edge-tool-${this.type}-anchor`)), this.toggleArea(!1), this.update();
	}
	update() {
		let e = this.type;
		return this.cellView.getTerminalView(e) ? (this.updateAnchor(), this.updateArea(), this.container.style.display = "") : this.container.style.display = "none", this;
	}
	updateAnchor() {
		let e = this.childNodes;
		if (!e) return;
		let t = e.anchor;
		if (!t) return;
		let n = this.type, r = this.cellView, i = this.options, a = r.getTerminalAnchor(n), o = r.cell.prop([n, "anchor"]);
		t.setAttribute("transform", `translate(${a.x}, ${a.y})`);
		let s = o ? i.customAnchorAttrs : i.defaultAnchorAttrs;
		s && Object.keys(s).forEach((e) => {
			t.setAttribute(e, s[e]);
		});
	}
	updateArea() {
		let e = this.childNodes;
		if (!e) return;
		let t = e.area;
		if (!t) return;
		let n = this.type, r = this.cellView, i = r.getTerminalView(n);
		if (i) {
			let e = i.cell, a = r.getTerminalMagnet(n), o = this.options.areaPadding || 0;
			Number.isFinite(o) || (o = 0);
			let s, c, l;
			i.isEdgeElement(a) ? (s = i.getBBox(), c = 0, l = s.getCenter()) : (s = i.getUnrotatedBBoxOfElement(a), c = e.getAngle(), l = s.getCenter(), c && l.rotate(-c, e.getBBox().getCenter())), s.inflate(o), H(t, {
				x: -s.width / 2,
				y: -s.height / 2,
				width: s.width,
				height: s.height,
				transform: `translate(${l.x}, ${l.y}) rotate(${c})`
			});
		}
	}
	toggleArea(e) {
		if (this.childNodes) {
			let t = this.childNodes.area;
			t && (t.style.display = e ? "" : "none");
		}
	}
	onMouseDown(e) {
		this.guard(e) || (e.stopPropagation(), e.preventDefault(), this.graph.view.undelegateEvents(), this.options.documentEvents && this.delegateDocumentEvents(this.options.documentEvents), this.focus(), this.toggleArea(this.options.restrictArea), this.cell.startBatch("move-anchor", {
			ui: !0,
			toolId: this.cid
		}));
	}
	resetAnchor(e) {
		let t = this.type, n = this.cell;
		e ? n.prop([t, "anchor"], e, {
			rewrite: !0,
			ui: !0,
			toolId: this.cid
		}) : n.removeProp([t, "anchor"], {
			ui: !0,
			toolId: this.cid
		});
	}
	onMouseMove(e) {
		let t = this.type, n = this.cellView, r = n.getTerminalView(t);
		if (r == null) return;
		let i = this.normalizeEvent(e), a = r.cell, o = n.getTerminalMagnet(t), s = this.graph.coord.clientToLocalPoint(i.clientX, i.clientY), c = this.options.snap;
		if (typeof c == "function") {
			let e = F(c, n, s, r, o, t, n, this);
			s = I.create(e);
		}
		if (this.options.restrictArea) {
			if (r.isEdgeElement(o)) {
				let e = r.getClosestPoint(s);
				e && (s = e);
			} else {
				let e = r.getUnrotatedBBoxOfElement(o), t = a.getAngle(), n = a.getBBox().getCenter(), i = s.clone().rotate(t, n);
				e.containsPoint(i) || (s = e.getNearestPointToPoint(i).rotate(-t, n));
			}
		}
		let l, u = this.options.anchor;
		typeof u == "function" && (l = F(u, n, s, r, o, t, n, this)), this.resetAnchor(l), this.update();
	}
	onMouseUp(e) {
		this.graph.view.delegateEvents(), this.undelegateDocumentEvents(), this.blur(), this.toggleArea(!1);
		let t = this.cellView;
		this.options.removeRedundancies && t.removeRedundantLinearVertices({
			ui: !0,
			toolId: this.cid
		}), this.cell.stopBatch("move-anchor", {
			ui: !0,
			toolId: this.cid
		});
	}
	onDblClick() {
		let e = this.options.resetAnchor;
		e && this.resetAnchor(e === !0 ? void 0 : e), this.update();
	}
};
gx.defaults = Object.assign(Object.assign({}, Y.getDefaults()), {
	tagName: "g",
	markup: [{
		tagName: "circle",
		selector: "anchor",
		attrs: { cursor: "pointer" }
	}, {
		tagName: "rect",
		selector: "area",
		attrs: {
			"pointer-events": "none",
			fill: "none",
			stroke: "#33334F",
			"stroke-dasharray": "2,4",
			rx: 5,
			ry: 5
		}
	}],
	events: {
		mousedown: "onMouseDown",
		touchstart: "onMouseDown",
		dblclick: "onDblClick"
	},
	documentEvents: {
		mousemove: "onMouseMove",
		touchmove: "onMouseMove",
		mouseup: "onMouseUp",
		touchend: "onMouseUp",
		touchcancel: "onMouseUp"
	},
	customAnchorAttrs: {
		"stroke-width": 4,
		stroke: "#33334F",
		fill: "#FFFFFF",
		r: 5
	},
	defaultAnchorAttrs: {
		"stroke-width": 2,
		stroke: "#FFFFFF",
		fill: "#33334F",
		r: 6
	},
	areaPadding: 6,
	snapRadius: 10,
	resetAnchor: !0,
	restrictArea: !0,
	removeRedundancies: !0,
	anchor: mx,
	snap(e, t, n, r, i, a) {
		let o = a.options.snapRadius || 0, s = r === "source", c = s ? 0 : -1, l = this.cell.getVertexAt(c) || this.getTerminalAnchor(s ? "target" : "source");
		return l && (Math.abs(l.x - e.x) < o && (e.x = l.x), Math.abs(l.y - e.y) < o && (e.y = l.y)), e;
	}
});
var _x = class extends gx {};
_x.defaults = Object.assign(Object.assign({}, gx.getDefaults()), {
	name: "source-anchor",
	type: "source"
});
var vx = class extends gx {};
vx.defaults = Object.assign(Object.assign({}, gx.getDefaults()), {
	name: "target-anchor",
	type: "target"
});
// node_modules/@antv/x6/es/registry/tool/arrowhead.js
var yx = class extends Y {
	get type() {
		return this.options.type;
	}
	get ratio() {
		return this.options.ratio;
	}
	init() {
		if (this.options.attrs) {
			let e = this.options.attrs, { class: t } = e, n = O(e, ["class"]);
			this.setAttrs(n, this.container), t && B(this.container, t);
		}
	}
	onRender() {
		B(this.container, this.prefixClassName(`edge-tool-${this.type}-arrowhead`)), this.update();
	}
	update() {
		let e = this.ratio, t = this.cellView, n = t.getTangentAtRatio(e), r = n ? n.start : t.getPointAtRatio(e), i = n && n.vector().vectorAngle(new I(1, 0)) || 0;
		if (!r) return this;
		let a = hp().translate(r.x, r.y).rotate(i);
		return Tp(this.container, a, { absolute: !0 }), this;
	}
	onMouseDown(e) {
		if (this.guard(e)) return;
		e.stopPropagation(), e.preventDefault();
		let t = this.cellView;
		if (t.can("arrowheadMovable")) {
			t.cell.startBatch("move-arrowhead", {
				ui: !0,
				toolId: this.cid
			});
			let n = this.graph.snapToGrid(e.clientX, e.clientY), r = t.prepareArrowheadDragging(this.type, {
				x: n.x,
				y: n.y,
				options: Object.assign(Object.assign({}, this.options), { toolId: this.cid })
			});
			this.cellView.setEventData(e, r), this.delegateDocumentEvents(this.options.documentEvents, e.data), t.graph.view.undelegateEvents(), this.container.style.pointerEvents = "none";
		}
		this.focus();
	}
	onMouseMove(e) {
		let t = this.normalizeEvent(e), n = this.graph.snapToGrid(t.clientX, t.clientY);
		this.cellView.onMouseMove(t, n.x, n.y), this.update();
	}
	onMouseUp(e) {
		this.undelegateDocumentEvents();
		let t = this.normalizeEvent(e), n = this.cellView, r = this.graph.snapToGrid(t.clientX, t.clientY);
		n.onMouseUp(t, r.x, r.y), this.graph.view.delegateEvents(), this.blur(), this.container.style.pointerEvents = "", n.cell.stopBatch("move-arrowhead", {
			ui: !0,
			toolId: this.cid
		});
	}
};
yx.defaults = Object.assign(Object.assign({}, Y.getDefaults()), {
	tagName: "path",
	isSVGElement: !0,
	events: {
		mousedown: "onMouseDown",
		touchstart: "onMouseDown"
	},
	documentEvents: {
		mousemove: "onMouseMove",
		touchmove: "onMouseMove",
		mouseup: "onMouseUp",
		touchend: "onMouseUp",
		touchcancel: "onMouseUp"
	}
});
var bx = class extends yx {};
bx.defaults = Object.assign(Object.assign({}, yx.getDefaults()), {
	name: "source-arrowhead",
	type: "source",
	ratio: 0,
	attrs: {
		d: "M 10 -8 -10 0 10 8 Z",
		fill: "#333",
		stroke: "#fff",
		"stroke-width": 2,
		cursor: "move"
	}
});
var xx = class extends yx {};
xx.defaults = Object.assign(Object.assign({}, yx.getDefaults()), {
	name: "target-arrowhead",
	type: "target",
	ratio: 1,
	attrs: {
		d: "M -10 -8 10 0 -10 8 Z",
		fill: "#333",
		stroke: "#fff",
		"stroke-width": 2,
		cursor: "move"
	}
});
// node_modules/@antv/x6/es/registry/tool/boundary.js
var Sx = class extends Y {
	onRender() {
		if (B(this.container, this.prefixClassName("cell-tool-boundary")), this.options.attrs) {
			let e = this.options.attrs, { class: t } = e, n = O(e, ["class"]);
			H(this.container, nf(n)), t && B(this.container, t);
		}
		this.update();
	}
	update() {
		let e = this.cellView, t = this.options, { useCellGeometry: n, rotate: r } = t, i = ou(t.padding), a = hx(e, n);
		this.parent.options.local && (a = a.translate({
			x: -a.x,
			y: -a.y
		})), a = a.moveAndExpand({
			x: -i.left,
			y: -i.top,
			width: i.left + i.right,
			height: i.top + i.bottom
		});
		let o = e.cell;
		if (o.isNode()) {
			let e = o.getAngle();
			if (e != null) {
				if (r && !this.parent.options.local) {
					let t = o.getBBox().getCenter();
					Dp(this.container, e, t.x, t.y, { absolute: !0 });
				} else r || (a = a.bbox(e));
			}
		}
		return H(this.container, a.toJSON()), this;
	}
};
Sx.defaults = Object.assign(Object.assign({}, Y.getDefaults()), {
	name: "boundary",
	tagName: "rect",
	padding: 10,
	useCellGeometry: !0,
	attrs: {
		fill: "none",
		stroke: "#333",
		"stroke-width": .5,
		"stroke-dasharray": "5, 5",
		"pointer-events": "none"
	}
});
// node_modules/@antv/x6/es/registry/tool/button.js
var Cx = class extends Y {
	onRender() {
		B(this.container, this.prefixClassName("cell-tool-button")), this.update();
	}
	update() {
		return this.updatePosition(), this;
	}
	updatePosition() {
		let e = this.cellView.cell.isEdge() ? this.getEdgeMatrix() : this.getNodeMatrix();
		Tp(this.container, e, { absolute: !0 });
	}
	getNodeMatrix() {
		let e = this.cellView, t = this.options, { x: n = 0, y: r = 0 } = t, { offset: i, useCellGeometry: a, rotate: o } = t, s = hx(e, a), c = e.cell.getAngle();
		o || (s = s.bbox(c));
		let l = 0, u = 0;
		typeof i == "number" ? (l = i, u = i) : typeof i == "object" && (l = i.x, u = i.y), n = au(n, s.width), r = au(r, s.height);
		let d = hp();
		return d = this.parent.options.local ? d.translate(s.width / 2, s.height / 2) : d.translate(s.x + s.width / 2, s.y + s.height / 2), o && (d = d.rotate(c)), d = d.translate(n + l - s.width / 2, r + u - s.height / 2), d;
	}
	getEdgeMatrix() {
		let e = this.cellView, { offset: t = 0, distance: n = 0, rotate: r } = this.options, i = au(n, 1), a = i >= 0 && i <= 1 ? e.getTangentAtRatio(i) : e.getTangentAtLength(i), o = a ? a.start : e.getConnection().start, s = a && a.vector().vectorAngle(new I(1, 0)) || 0, c = hp().translate(o.x, o.y).rotate(s);
		return c = typeof t == "object" ? c.translate(t.x || 0, t.y || 0) : c.translate(0, t), r || (c = c.rotate(-s)), c;
	}
	onMouseDown(e) {
		if (this.guard(e)) return;
		e.stopPropagation(), e.preventDefault();
		let t = this.options.onClick;
		typeof t == "function" && F(t, this.cellView, {
			e,
			view: this.cellView,
			cell: this.cellView.cell,
			btn: this
		});
	}
};
Cx.defaults = Object.assign(Object.assign({}, Y.getDefaults()), {
	name: "button",
	useCellGeometry: !0,
	events: {
		mousedown: "onMouseDown",
		touchstart: "onMouseDown"
	}
});
var wx = class extends Cx {};
wx.defaults = Object.assign(Object.assign({}, Cx.getDefaults()), {
	name: "button-remove",
	markup: [{
		tagName: "circle",
		selector: "button",
		attrs: {
			r: 7,
			fill: "#FF1D00",
			cursor: "pointer"
		}
	}, {
		tagName: "path",
		selector: "icon",
		attrs: {
			d: "M -3 -3 3 3 M -3 3 3 -3",
			fill: "none",
			stroke: "#FFFFFF",
			"stroke-width": 2,
			"pointer-events": "none"
		}
	}],
	distance: 60,
	offset: 0,
	useCellGeometry: !0,
	onClick({ view: e, btn: t }) {
		t.parent.remove(), e.cell.remove({
			ui: !0,
			toolId: t.cid
		});
	}
});
// node_modules/@antv/x6/es/registry/tool/editor.js
var Tx = class extends Y {
	constructor() {
		super(...arguments), this.labelIndex = -1, this.distance = .5, this.dblClick = this.onCellDblClick.bind(this);
	}
	onRender() {
		let e = this.cellView;
		e && e.on("cell:dblclick", this.dblClick);
	}
	createElement() {
		let e = [this.prefixClassName(`${this.cell.isEdge() ? "edge" : "node"}-tool-editor`), this.prefixClassName("cell-tool-editor")];
		this.editor = Kb("div", !1), this.addClass(e, this.editor), this.editor.contentEditable = "true", this.container.appendChild(this.editor);
	}
	removeElement() {
		this.undelegateDocumentEvents(), this.editor && (this.container.removeChild(this.editor), this.editor = null);
	}
	updateEditor() {
		let { cell: e, editor: t } = this;
		if (!t) return;
		let { style: n } = t;
		e.isNode() ? this.updateNodeEditorTransform() : e.isEdge() && this.updateEdgeEditorTransform();
		let { attrs: r } = this.options;
		return n.fontSize = `${r.fontSize}px`, n.fontFamily = r.fontFamily, n.color = r.color, n.backgroundColor = r.backgroundColor, t.innerText = this.getCellText() || "", this.setCellText(""), this;
	}
	updateNodeEditorTransform() {
		let { graph: e, cell: t, editor: n } = this;
		if (!n) return;
		let r = I.create(), i = 20, a = "", { x: o, y: s } = this.options, { width: c, height: l } = this.options;
		if (o !== void 0 && s !== void 0) {
			let e = t.getBBox();
			o = au(o, e.width), s = au(s, e.height), r = e.topLeft.translate(o, s), i = e.width - o * 2;
		} else {
			let e = t.getBBox();
			r = e.center, i = e.width - 4, a = "translate(-50%, -50%)";
		}
		let u = e.scale(), { style: d } = n;
		r = e.localToGraph(r), d.left = `${r.x}px`, d.top = `${r.y}px`, d.transform = `scale(${u.sx}, ${u.sy}) ${a}`, d.minWidth = `${i}px`, typeof c == "number" && (d.width = `${c}px`), typeof l == "number" && (d.height = `${l}px`);
	}
	updateEdgeEditorTransform() {
		if (!this.event) return;
		let { graph: e, editor: t } = this;
		if (!t) return;
		let n = I.create(), r = 20, { style: i } = t, a = this.event.target, o = a.parentElement;
		if (o && yd(o, this.prefixClassName("edge-label"))) {
			let e = o.getAttribute("data-index") || "0";
			this.labelIndex = parseInt(e, 10);
			let { translation: t } = yp(o.getAttribute("transform"));
			n = new I(t.tx, t.ty), r = xm(a).width;
		} else {
			if (!this.options.labelAddable) return this;
			n = e.clientToLocal(I.create(this.event.clientX, this.event.clientY));
			let t = this.cellView.path.closestPointLength(n);
			this.distance = t, this.labelIndex = -1;
		}
		n = e.localToGraph(n);
		let s = e.scale();
		i.left = `${n.x}px`, i.top = `${n.y}px`, i.minWidth = `${r}px`, i.transform = `scale(${s.sx}, ${s.sy}) translate(-50%, -50%)`;
	}
	updateCell() {
		let e = this.editor.innerText.replace(/\n$/, "") || "";
		this.setCellText(e === "" ? null : e), this.removeElement();
	}
	onDocumentMouseUp(e) {
		this.editor && e.target !== this.editor && this.updateCell();
	}
	onCellDblClick({ e }) {
		if (!this.editor) {
			e.stopPropagation(), this.removeElement(), this.event = e, this.createElement(), this.updateEditor(), this.autoFocus();
			let t = this.options.documentEvents;
			t && this.delegateDocumentEvents(t);
		}
	}
	onMouseDown(e) {
		e.stopPropagation();
	}
	autoFocus() {
		setTimeout(() => {
			this.editor && (this.editor.focus(), this.selectText());
		});
	}
	selectText() {
		if (window.getSelection && this.editor) {
			let e = document.createRange();
			e.selectNodeContents(this.editor);
			let t = window.getSelection();
			t?.removeAllRanges(), t?.addRange(e);
		}
	}
	getCellText() {
		let { getText: e } = this.options;
		if (typeof e == "function") return F(e, this.cellView, {
			cell: this.cell,
			index: this.labelIndex
		});
		if (typeof e == "string") {
			if (this.cell.isNode()) return this.cell.attr(e);
			if (this.cell.isEdge() && this.labelIndex !== -1) return this.cell.prop(`labels/${this.labelIndex}/attrs/${e}`);
		}
	}
	setCellText(e) {
		let t = this.options.setText;
		if (typeof t == "function") F(t, this.cellView, {
			cell: this.cell,
			value: e,
			index: this.labelIndex,
			distance: this.distance
		});
		else if (typeof t == "string") {
			if (this.cell.isNode()) {
				this.cell.attr(t, e === null ? "" : e);
				return;
			}
			if (this.cell.isEdge()) {
				let n = this.cell;
				if (this.labelIndex === -1) {
					if (e) {
						let r = {
							position: { distance: this.distance },
							attrs: {}
						};
						Lf(r, `attrs/${t}`, e), n.appendLabel(r);
					}
				} else e === null ? n.removeLabelAt(this.labelIndex) : n.prop(`labels/${this.labelIndex}/attrs/${t}`, e);
			}
		}
	}
	onRemove() {
		let e = this.cellView;
		e && e.off("cell:dblclick", this.dblClick), this.removeElement();
	}
};
Tx.defaults = Object.assign(Object.assign({}, Y.getDefaults()), {
	tagName: "div",
	isSVGElement: !1,
	events: {
		mousedown: "onMouseDown",
		touchstart: "onMouseDown"
	},
	documentEvents: {
		mouseup: "onDocumentMouseUp",
		touchend: "onDocumentMouseUp",
		touchcancel: "onDocumentMouseUp"
	}
});
var Ex = class extends Tx {};
Ex.defaults = P({}, Tx.defaults, {
	attrs: {
		fontSize: 14,
		fontFamily: "Arial, helvetica, sans-serif",
		color: "#000",
		backgroundColor: "#fff"
	},
	getText: "text/text",
	setText: "text/text"
});
var Dx = class extends Tx {};
Dx.defaults = P({}, Tx.defaults, {
	attrs: {
		fontSize: 14,
		fontFamily: "Arial, helvetica, sans-serif",
		color: "#000",
		backgroundColor: "#fff"
	},
	labelAddable: !0,
	getText: "label/text",
	setText: "label/text"
});
// node_modules/@antv/x6/es/registry/tool/segments.js
var Ox = class extends Y {
	constructor() {
		super(...arguments), this.handles = [];
	}
	get vertices() {
		return this.cellView.cell.getVertices();
	}
	update() {
		return this.render(), this;
	}
	getPoints() {
		let e = this.cellView.routePoints;
		if (e.length <= 2) return e;
		let t = [e[0]];
		for (let n = 1; n < e.length - 1; n++) {
			let r = t[t.length - 1], i = e[n], a = e[n + 1];
			(i.x - r.x) * (a.y - r.y) - (i.y - r.y) * (a.x - r.x) !== 0 && t.push(i);
		}
		return t.push(e[e.length - 1]), t;
	}
	onRender() {
		B(this.container, this.prefixClassName("edge-tool-segments")), this.resetHandles();
		let e = this.cellView, t = [...this.getPoints()];
		t.unshift(e.sourcePoint), t.push(e.targetPoint);
		for (let e = 0, n = t.length; e < n - 1; e += 1) {
			let n = t[e], r = t[e + 1], i = this.renderHandle(n, r, e);
			this.stamp(i.container), this.handles.push(i);
		}
		return this;
	}
	renderHandle(e, t, n) {
		let r = this.options.createHandle({
			index: n,
			graph: this.graph,
			guard: (e) => this.guard(e),
			attrs: this.options.attrs || {}
		});
		return this.options.processHandle && this.options.processHandle(r), this.updateHandle(r, e, t), this.container.appendChild(r.container), this.startHandleListening(r), r;
	}
	startHandleListening(e) {
		e.on("change", this.onHandleChange, this), e.on("changing", this.onHandleChanging, this), e.on("changed", this.onHandleChanged, this);
	}
	stopHandleListening(e) {
		e.off("change", this.onHandleChange, this), e.off("changing", this.onHandleChanging, this), e.off("changed", this.onHandleChanged, this);
	}
	resetHandles() {
		let e = this.handles;
		this.handles = [], e && e.forEach((e) => {
			this.stopHandleListening(e), e.remove();
		});
	}
	shiftHandleIndexes(e) {
		let t = this.handles;
		for (let n = 0, r = t.length; n < r; n += 1) t[n].options.index += e;
	}
	resetAnchor(e, t) {
		let n = this.cellView.cell, r = {
			ui: !0,
			toolId: this.cid
		};
		t ? n.prop([e, "anchor"], t, r) : n.removeProp([e, "anchor"], r);
	}
	snapHandle(e, t, n) {
		let r = e.options.axis, i = e.options.index, a = this.cellView.cell.getVertices(), o = a[i - 2] || n.sourceAnchor, s = a[i + 1] || n.targetAnchor, c = this.options.snapRadius;
		return Math.abs(t[r] - o[r]) < c ? t[r] = o[r] : Math.abs(t[r] - s[r]) < c && (t[r] = s[r]), t;
	}
	onHandleChanging({ handle: e, e: t }) {
		let n = this.graph, r = this.options, i = this.cellView, a = r.anchor, o = e.options.axis, s = e.options.index - 1, c = this.getEventData(t), l = this.normalizeEvent(t), u = n.snapToGrid(l.clientX, l.clientY), d = this.snapHandle(e, u.clone(), c), f = N(this.vertices), p = f[s], m = f[s + 1], h = i.sourceView, g = i.sourceBBox, _ = !1, v = !1;
		if (p ? s === 0 ? g.containsPoint(p) ? (f.shift(), this.shiftHandleIndexes(-1), _ = !0) : (p[o] = d[o], v = !0) : p[o] = d[o] : (p = i.sourceAnchor.toJSON(), p[o] = d[o], g.containsPoint(p) ? _ = !0 : (f.unshift(p), this.shiftHandleIndexes(1), v = !0)), typeof a == "function" && h) {
			if (_) {
				let e = c.sourceAnchor.clone();
				e[o] = d[o];
				let t = F(a, i, e, h, i.sourceMagnet || h.container, "source", i, this);
				this.resetAnchor("source", t);
			}
			v && this.resetAnchor("source", c.sourceAnchorDef);
		}
		let y = i.targetView, b = i.targetBBox, x = !1, S = !1;
		if (m ? s === f.length - 2 ? b.containsPoint(m) ? (f.pop(), x = !0) : (m[o] = d[o], S = !0) : m[o] = d[o] : (m = i.targetAnchor.toJSON(), m[o] = d[o], b.containsPoint(m) ? x = !0 : (f.push(m), S = !0)), typeof a == "function" && y) {
			if (x) {
				let e = c.targetAnchor.clone();
				e[o] = d[o];
				let t = F(a, i, e, y, i.targetMagnet || y.container, "target", i, this);
				this.resetAnchor("target", t);
			}
			S && this.resetAnchor("target", c.targetAnchorDef);
		}
		I.equalPoints(f, this.vertices) || this.cellView.cell.setVertices(f, {
			ui: !0,
			toolId: this.cid
		}), this.updateHandle(e, p, m, 0), r.stopPropagation || i.notifyMouseMove(l, u.x, u.y);
	}
	onHandleChange({ handle: e, e: t }) {
		let n = this.options, r = this.handles, i = this.cellView, a = e.options.index;
		if (Array.isArray(r)) {
			for (let e = 0, t = r.length; e < t; e += 1) e !== a && r[e].hide();
			if (this.focus(), this.setEventData(t, {
				sourceAnchor: i.sourceAnchor.clone(),
				targetAnchor: i.targetAnchor.clone(),
				sourceAnchorDef: N(this.cell.prop(["source", "anchor"])),
				targetAnchorDef: N(this.cell.prop(["target", "anchor"]))
			}), this.cell.startBatch("move-segment", {
				ui: !0,
				toolId: this.cid
			}), !n.stopPropagation) {
				let e = this.normalizeEvent(t), n = this.graph.snapToGrid(e.clientX, e.clientY);
				i.notifyMouseDown(e, n.x, n.y);
			}
		}
	}
	onHandleChanged({ e }) {
		let t = this.options, n = this.cellView;
		t.removeRedundancies && n.removeRedundantLinearVertices({
			ui: !0,
			toolId: this.cid
		});
		let r = this.normalizeEvent(e), i = this.graph.snapToGrid(r.clientX, r.clientY);
		this.render(), this.blur(), this.cell.stopBatch("move-segment", {
			ui: !0,
			toolId: this.cid
		}), t.stopPropagation || n.notifyMouseUp(r, i.x, i.y), n.checkMouseleave(r), t.onChanged && t.onChanged({
			edge: n.cell,
			edgeView: n
		});
	}
	updateHandle(e, t, n, r = 0) {
		let i = this.options.precision || 0, a = Math.abs(t.x - n.x) < i, o = Math.abs(t.y - n.y) < i;
		if (a || o) {
			let i = new R(t, n);
			if (i.length() < this.options.threshold) e.hide();
			else {
				let t = i.getCenter(), n = a ? "x" : "y";
				t[n] += r || 0;
				let o = i.vector().vectorAngle(new I(1, 0));
				e.updatePosition(t.x, t.y, o, this.cellView), e.show(), e.options.axis = n;
			}
		} else e.hide();
	}
	onRemove() {
		this.resetHandles();
	}
};
Ox.defaults = Object.assign(Object.assign({}, Y.defaults), {
	name: "segments",
	precision: .5,
	threshold: 40,
	snapRadius: 10,
	stopPropagation: !0,
	removeRedundancies: !0,
	attrs: {
		width: 20,
		height: 8,
		x: -10,
		y: -4,
		rx: 4,
		ry: 4,
		fill: "#333",
		stroke: "#fff",
		"stroke-width": 2
	},
	createHandle: (e) => new kx(e),
	anchor: mx
});
var kx = class extends Yb {
	constructor(e) {
		super(), this.options = e, this.render(), this.delegateEvents({
			mousedown: "onMouseDown",
			touchstart: "onMouseDown"
		});
	}
	render() {
		this.container = Kb("rect", !0);
		let e = this.options.attrs;
		if (typeof e == "function") {
			let t = Ox.getDefaults();
			this.setAttrs(Object.assign(Object.assign({}, t.attrs), e(this)));
		} else this.setAttrs(e);
		this.addClass(this.prefixClassName("edge-tool-segment"));
	}
	updatePosition(e, t, n, r) {
		let i = r.getClosestPoint(new I(e, t)) || new I(e, t), a = hp().translate(i.x, i.y);
		if (i.equals({
			x: e,
			y: t
		})) a = a.rotate(n);
		else {
			let n = new R(e, t, i.x, i.y).vector().vectorAngle(new I(1, 0));
			n !== 0 && (n += 90), a = a.rotate(n);
		}
		this.setAttrs({
			transform: vp(a),
			cursor: n % 180 == 0 ? "row-resize" : "col-resize"
		});
	}
	onMouseDown(e) {
		this.options.guard(e) || (this.trigger("change", {
			e,
			handle: this
		}), e.stopPropagation(), e.preventDefault(), this.options.graph.view.undelegateEvents(), this.delegateDocumentEvents({
			mousemove: "onMouseMove",
			touchmove: "onMouseMove",
			mouseup: "onMouseUp",
			touchend: "onMouseUp",
			touchcancel: "onMouseUp"
		}, e.data));
	}
	onMouseMove(e) {
		this.emit("changing", {
			e,
			handle: this
		});
	}
	onMouseUp(e) {
		this.emit("changed", {
			e,
			handle: this
		}), this.undelegateDocumentEvents(), this.options.graph.view.delegateEvents();
	}
	show() {
		this.container.style.display = "";
	}
	hide() {
		this.container.style.display = "none";
	}
}, Ax = J.prefix("edge-tool-vertex-path"), jx = class extends Y {
	constructor() {
		super(...arguments), this.handles = [];
	}
	get vertices() {
		return this.cellView.cell.getVertices();
	}
	onRender() {
		return this.addClass(this.prefixClassName("edge-tool-vertices")), this.options.addable && this.updatePath(), this.resetHandles(), this.renderHandles(), this;
	}
	update() {
		return this.vertices.length === this.handles.length ? this.updateHandles() : (this.resetHandles(), this.renderHandles()), this.options.addable && this.updatePath(), this;
	}
	resetHandles() {
		let e = this.handles;
		this.handles = [], e && e.forEach((e) => {
			this.stopHandleListening(e), e.remove();
		});
	}
	renderHandles() {
		let e = this.vertices;
		for (let t = 0, n = e.length; t < n; t += 1) {
			let n = e[t], r = this.options.createHandle, i = this.options.processHandle, a = r({
				index: t,
				graph: this.graph,
				guard: (e) => this.guard(e),
				attrs: this.options.attrs || {}
			});
			i && i(a), a.updatePosition(n.x, n.y), this.stamp(a.container), this.container.appendChild(a.container), this.handles.push(a), this.startHandleListening(a);
		}
	}
	updateHandles() {
		let e = this.vertices;
		for (let t = 0, n = e.length; t < n; t += 1) {
			let n = e[t], r = this.handles[t];
			r && r.updatePosition(n.x, n.y);
		}
	}
	updatePath() {
		let e = this.childNodes.connection;
		e && e.setAttribute("d", this.cellView.getConnectionPathData());
	}
	startHandleListening(e) {
		let t = this.cellView;
		t.can("vertexMovable") && (e.on("change", this.onHandleChange, this), e.on("changing", this.onHandleChanging, this), e.on("changed", this.onHandleChanged, this)), t.can("vertexDeletable") && e.on("remove", this.onHandleRemove, this);
	}
	stopHandleListening(e) {
		let t = this.cellView;
		t.can("vertexMovable") && (e.off("change", this.onHandleChange, this), e.off("changing", this.onHandleChanging, this), e.off("changed", this.onHandleChanged, this)), t.can("vertexDeletable") && e.off("remove", this.onHandleRemove, this);
	}
	getNeighborPoints(e) {
		let t = this.cellView, n = this.vertices, r = e > 0 ? n[e - 1] : t.sourceAnchor, i = e < n.length - 1 ? n[e + 1] : t.targetAnchor;
		return {
			prev: I.create(r),
			next: I.create(i)
		};
	}
	getMouseEventArgs(e) {
		let t = this.normalizeEvent(e), { x: n, y: r } = this.graph.snapToGrid(t.clientX, t.clientY);
		return {
			e: t,
			x: n,
			y: r
		};
	}
	onHandleChange({ e }) {
		this.focus();
		let t = this.cellView;
		if (t.cell.startBatch("move-vertex", {
			ui: !0,
			toolId: this.cid
		}), !this.options.stopPropagation) {
			let { e: n, x: r, y: i } = this.getMouseEventArgs(e);
			this.eventData(n, { start: {
				x: r,
				y: i
			} }), t.notifyMouseDown(n, r, i);
		}
	}
	onHandleChanging({ handle: e, e: t }) {
		let n = this.cellView, r = e.options.index, { e: i, x: a, y: o } = this.getMouseEventArgs(t), s = {
			x: a,
			y: o
		};
		this.snapVertex(s, r), n.cell.setVertexAt(r, s, {
			ui: !0,
			toolId: this.cid
		}), e.updatePosition(s.x, s.y), this.options.stopPropagation || n.notifyMouseMove(i, a, o);
	}
	stopBatch(e) {
		this.cell.stopBatch("move-vertex", {
			ui: !0,
			toolId: this.cid
		}), e && this.cell.stopBatch("add-vertex", {
			ui: !0,
			toolId: this.cid
		});
	}
	onHandleChanged({ e }) {
		let t = this.options, n = this.cellView;
		t.addable && this.updatePath(), t.removeRedundancies && n.removeRedundantLinearVertices({
			ui: !0,
			toolId: this.cid
		}) && this.render(), this.blur(), this.stopBatch(this.eventData(e).vertexAdded);
		let { e: r, x: i, y: a } = this.getMouseEventArgs(e);
		if (!this.options.stopPropagation) {
			n.notifyMouseUp(r, i, a);
			let { start: e } = this.eventData(r);
			if (e) {
				let { x: t, y: o } = e;
				t === i && o === a && n.onClick(r, i, a);
			}
		}
		n.checkMouseleave(r), t.onChanged && t.onChanged({
			edge: n.cell,
			edgeView: n
		});
	}
	snapVertex(e, t) {
		let n = this.options.snapRadius || 0;
		if (n > 0) {
			let r = this.getNeighborPoints(t), i = r.prev, a = r.next;
			Math.abs(e.x - i.x) < n ? e.x = i.x : Math.abs(e.x - a.x) < n && (e.x = a.x), Math.abs(e.y - i.y) < n ? e.y = r.prev.y : Math.abs(e.y - a.y) < n && (e.y = a.y);
		}
	}
	onHandleRemove({ handle: e, e: t }) {
		if (this.options.removable) {
			let n = e.options.index, r = this.cellView;
			r.cell.removeVertexAt(n, { ui: !0 }), this.options.addable && this.updatePath(), r.checkMouseleave(this.normalizeEvent(t));
		}
	}
	allowAddVertex(e) {
		let t = this.guard(e), n = this.options.addable && this.cellView.can("vertexAddable"), r = !this.options.modifiers || Th(e, this.options.modifiers);
		return !t && n && r;
	}
	onPathMouseDown(e) {
		let t = this.cellView;
		if (!this.allowAddVertex(e)) return;
		e.stopPropagation(), e.preventDefault();
		let n = this.normalizeEvent(e), r = this.graph.snapToGrid(n.clientX, n.clientY).toJSON();
		t.cell.startBatch("add-vertex", {
			ui: !0,
			toolId: this.cid
		});
		let i = t.getVertexIndex(r.x, r.y);
		this.snapVertex(r, i), t.cell.insertVertex(r, i, {
			ui: !0,
			toolId: this.cid
		}), this.render();
		let a = this.handles[i];
		this.eventData(n, { vertexAdded: !0 }), a.onMouseDown(n);
	}
	onRemove() {
		this.resetHandles();
	}
};
jx.defaults = Object.assign(Object.assign({}, Y.getDefaults()), {
	name: "vertices",
	snapRadius: 20,
	addable: !0,
	removable: !0,
	removeRedundancies: !0,
	stopPropagation: !0,
	attrs: {
		r: 6,
		fill: "#333",
		stroke: "#fff",
		cursor: "move",
		"stroke-width": 2
	},
	createHandle: (e) => new Mx(e),
	markup: [{
		tagName: "path",
		selector: "connection",
		className: Ax,
		attrs: {
			fill: "none",
			stroke: "transparent",
			"stroke-width": 10,
			cursor: "pointer"
		}
	}],
	events: {
		[`mousedown .${Ax}`]: "onPathMouseDown",
		[`touchstart .${Ax}`]: "onPathMouseDown"
	}
});
var Mx = class extends Yb {
	get graph() {
		return this.options.graph;
	}
	constructor(e) {
		super(), this.options = e, this.render(), this.delegateEvents({
			mousedown: "onMouseDown",
			touchstart: "onMouseDown",
			dblclick: "onDoubleClick"
		});
	}
	render() {
		this.container = Kb("circle", !0);
		let e = this.options.attrs;
		if (typeof e == "function") {
			let t = jx.getDefaults();
			this.setAttrs(Object.assign(Object.assign({}, t.attrs), e(this)));
		} else this.setAttrs(e);
		this.addClass(this.prefixClassName("edge-tool-vertex"));
	}
	updatePosition(e, t) {
		this.setAttrs({
			cx: e,
			cy: t
		});
	}
	onMouseDown(e) {
		this.options.guard(e) || (e.stopPropagation(), e.preventDefault(), this.graph.view.undelegateEvents(), this.delegateDocumentEvents({
			mousemove: "onMouseMove",
			touchmove: "onMouseMove",
			mouseup: "onMouseUp",
			touchend: "onMouseUp",
			touchcancel: "onMouseUp"
		}, e.data), this.emit("change", {
			e,
			handle: this
		}));
	}
	onMouseMove(e) {
		this.emit("changing", {
			e,
			handle: this
		});
	}
	onMouseUp(e) {
		this.emit("changed", {
			e,
			handle: this
		}), this.undelegateDocumentEvents(), this.graph.view.delegateEvents();
	}
	onDoubleClick(e) {
		this.emit("remove", {
			e,
			handle: this
		});
	}
}, Nx = {
	boundary: Sx,
	button: Cx,
	"button-remove": wx,
	"node-editor": Ex
}, Px = q.create({
	type: "node tool",
	process(e, t) {
		if (typeof t == "function") return t;
		let n = Y, { inherit: r } = t, i = O(t, ["inherit"]);
		if (r) {
			let e = this.get(r);
			e == null ? this.onNotFound(r, "inherited") : n = e;
		}
		return i.name ?? (i.name = e), n.define.call(n, i);
	}
});
Px.register(Nx, !0);
var Fx = {
	boundary: Sx,
	vertices: jx,
	segments: Ox,
	button: Cx,
	"button-remove": wx,
	"source-anchor": _x,
	"target-anchor": vx,
	"source-arrowhead": bx,
	"target-arrowhead": xx,
	"edge-editor": Dx
}, Ix = q.create({
	type: "edge tool",
	process(e, t) {
		if (typeof t == "function") return t;
		let n = Y, { inherit: r } = t, i = O(t, ["inherit"]);
		if (r) {
			let e = this.get(r);
			e == null ? this.onNotFound(r, "inherited") : n = e;
		}
		return i.name ?? (i.name = e), n.define.call(n, i);
	}
});
Ix.register(Fx, !0);
// node_modules/@antv/x6/es/model/animation/animationEvent.js
var Lx = class {
	constructor(e, t, n, r) {
		this.target = e, this.cell = this.target.effect?.target, this.type = t, this.bubbles = !1, this.currentTarget = e, this.defaultPrevented = !1, this.eventPhase = 0, this.timeStamp = performance.now(), this.currentTime = n, this.timelineTime = r;
	}
};
// node_modules/@antv/x6/es/model/animation/utils.js
function Rx(e) {
	return e !== "offset" && e !== "easing" && e !== "composite" && e !== "computedOffset";
}
function zx(e, t) {
	return e === "reverse" || e === "alternate" && t % 2 == 1 || e === "alternate-reverse" && t % 2 == 0;
}
// node_modules/@antv/x6/es/model/animation/animation.js
var Bx = class {
	constructor(e, t) {
		this._effect = null, this._currentTime = null, this._playbackRate = 1, this._playState = "idle", this._rafId = null, this._startTime = null, this._pausedTime = null, this._timeline = null, this.id = "", this.onfinish = null, this.oncancel = null, this._effect = e, this._timeline = t ?? document.timeline;
	}
	get effect() {
		return this._effect;
	}
	get currentTime() {
		return this._currentTime;
	}
	set currentTime(e) {
		let t = this._timeline.currentTime;
		Ol(t) && (this._startTime = t - e, this._currentTime = e);
	}
	get playbackRate() {
		return this._playbackRate;
	}
	set playbackRate(e) {
		let t = this._playbackRate;
		this._playbackRate = e;
		let n = this._timeline.currentTime;
		if (this._playState === "running" && this._startTime != null && Ol(n)) {
			let r = (n - this._startTime) * t;
			this._startTime = n - r / e;
		}
	}
	get playState() {
		return this._playState;
	}
	get timeline() {
		return this._timeline;
	}
	play() {
		if (this._playState === "running" || !this._effect) return;
		let e = this._timeline.currentTime;
		Ol(e) && (this._playState === "paused" ? (this._startTime = e - this._pausedTime / this._playbackRate, this._pausedTime = null) : (this._currentTime = 0, this._startTime = e), this._playState = "running", this._tick());
	}
	pause() {
		this._playState === "running" && (this._rafId && (cancelAnimationFrame(this._rafId), this._rafId = null), this._pausedTime = this._currentTime, this._playState = "paused");
	}
	finish() {
		var e;
		if (!this._effect) return;
		let t = this._effect.getComputedTiming(), n = this._playbackRate < 0, { duration: r, endTime: i, direction: a, fill: o, iterations: s } = t;
		if (o === "forwards" || o === "both") {
			let e = zx(a, n ? 0 : s - 1);
			this._effect.apply(e || n ? 0 : r);
		} else (o === "none" || o === "backwards") && this._effect.apply(null);
		this._currentTime = n ? 0 : i, this._playState = "finished", this._rafId && (cancelAnimationFrame(this._rafId), this._rafId = null);
		let c = new Lx(this, "finish", this._currentTime, this._timeline.currentTime);
		(e = this.onfinish) == null || e.call(this, c), this._effect.target.notify("animation:finish", c);
	}
	cancel() {
		var e;
		if (!this._effect) return;
		this._rafId && (cancelAnimationFrame(this._rafId), this._rafId = null), this._playState = "idle", this._currentTime = null, this._startTime = null, this._pausedTime = null, this._effect.apply(null);
		let t = new Lx(this, "cancel", this._currentTime, this._timeline.currentTime);
		(e = this.oncancel) == null || e.call(this, t), this._effect.target.notify("animation:cancel", t);
	}
	updatePlaybackRate(e) {
		this.playbackRate = e;
	}
	reverse() {
		this.playbackRate *= -1;
	}
	_tick() {
		let e = this._timeline.currentTime;
		if (this._playState !== "running" || !this._effect || !Ol(e)) return;
		let { duration: t, delay: n, iterations: r, direction: i, endTime: a } = this._effect.getComputedTiming(), o = (e - this._startTime) * this._playbackRate, s = o - n, c = Math.floor(s / t);
		if (o >= a || o < 0 || t <= 0) this.finish();
		else {
			if (o >= n) {
				let e = s % t;
				c = Math.min(c, r - 1), zx(i, c) && (e = t - e), this._effect.apply(e);
			}
			this._currentTime = o, this._rafId = requestAnimationFrame(() => this._tick());
		}
	}
}, Vx = class {
	constructor() {
		this.animations = [];
	}
	addAnimation(e) {
		this.animations.push(e);
	}
	getAnimations() {
		return this.animations;
	}
	cancelAnimations() {
		this.animations.forEach((e) => {
			e.cancel();
		});
	}
}, Hx = class {
	constructor(e, t, n) {
		this._originProps = {}, this._target = e, this._options = Ol(n) ? { duration: n } : Object.assign({}, n), this.setKeyframes(t);
	}
	get target() {
		return this._target;
	}
	getKeyframes() {
		if (!this._keyframes || this._keyframes.length === 0) return [];
		let e = [];
		if (Array.isArray(this._keyframes) && (e = [...this._keyframes]), ii(this._keyframes)) {
			let t = Object.values(this._keyframes).map((e) => ka(e).length), n = Math.max(...t);
			for (let t = 0; t < n; t++) {
				let n = {};
				Object.entries(this._keyframes).forEach(([e, r]) => {
					let i = ka(r)[t];
					Rx(e) && i != null && (n[e] = i);
				}), e.push(n);
			}
		}
		return e = e.map((e, t, n) => {
			let r = e ?? {}, i = {};
			return i.offset = r.offset, i.easing = r.easing ?? n[t - 1]?.easing ?? this.getComputedTiming().easing, Object.keys(r).forEach((e) => {
				Rx(e) && (i[e] = r[e]);
			}), i;
		}), e = e.map((t, n) => (t.computedOffset = t.offset == null ? n === e.length - 1 ? 1 : n === 0 ? 0 : n / (e.length - 1) : t.offset, t)), e;
	}
	setKeyframes(e) {
		this._keyframes = e, this._computedKeyframes = this.getKeyframes(), this._computedKeyframes.forEach((e) => {
			Object.keys(e).forEach((e) => {
				Rx(e) && this._originProps[e] == null && (this._originProps[e] = this.target.getPropByPath(e));
			});
		});
	}
	getTiming() {
		return tl(this._options, Ux);
	}
	getComputedTiming() {
		let e = this.getTiming(), t = e.duration * e.iterations;
		return Object.assign(Object.assign({}, e), {
			activeDuration: t,
			endTime: t + e.delay
		});
	}
	apply(e) {
		if (!this._target || !this._computedKeyframes.length) return;
		if (e == null) {
			Object.entries(this._originProps).forEach(([e, t]) => {
				this.target.setPropByPath(e, t);
			});
			return;
		}
		let t = this.getComputedTiming().duration;
		if (t < 0) return;
		let n = Math.min(e / t, 1), r = this._computedKeyframes;
		if (r.length === 0) return;
		let i = { computedOffset: 0 }, a = { computedOffset: 1 };
		for (let e of r) if (n === 0 && e.computedOffset === 0 && (i = e), n === 1 && e.computedOffset === 1 && (a = e), e.computedOffset < n && (i = e), e.computedOffset > n) {
			a = e;
			break;
		}
		let o = i.computedOffset, s = a.computedOffset, c = (n - o) / (s - o), l = Pm[Oa(i.easing ?? a.easing)] ?? Fm;
		for (let e in Object.assign(Object.assign({}, i), a)) if (Rx(e) && (i[e] != null || a[e] != null)) {
			let t = i[e] ?? this._originProps[e], n = a[e] ?? this._originProps[e], r;
			r = String(t).startsWith("#") ? Mm : e.endsWith("transform") && !Ol(t) ? Nm : km.test(String(t)) || km.test(String(n)) ? jm : Am;
			let o = r(t, n)(l(c));
			this.target.setPropByPath(e, o);
		}
	}
}, Ux = {
	delay: 0,
	direction: "normal",
	duration: 0,
	easing: "linear",
	fill: "none",
	iterations: 1
}, Wx = class extends xh {
	constructor(e = {}) {
		super(), this.pending = !1, this.changing = !1, this.data = {}, this.mutate(N(e)), this.changed = {};
	}
	mutate(e, t = {}) {
		let n = t.unset === !0, r = t.silent === !0, i = [], a = this.changing;
		this.changing = !0, a || (this.previous = N(this.data), this.changed = {});
		let o = this.data, s = this.previous, c = this.changed;
		if (Object.keys(e).forEach((t) => {
			let r = t, a = e[r];
			El(o[r], a) || i.push(r), El(s[r], a) ? delete c[r] : c[r] = a, n ? delete o[r] : o[r] = a;
		}), !r && i.length > 0 && (this.pending = !0, this.pendingOptions = t, i.forEach((e) => {
			this.emit("change:*", {
				key: e,
				options: t,
				store: this,
				current: o[e],
				previous: s[e]
			});
		})), a) return this;
		if (!r) for (; this.pending;) this.pending = !1, this.emit("changed", {
			current: o,
			previous: s,
			store: this,
			options: this.pendingOptions
		});
		return this.pending = !1, this.changing = !1, this.pendingOptions = null, this;
	}
	get(e, t) {
		return e == null ? this.data : this.data[e] ?? t;
	}
	getPrevious(e) {
		if (this.previous) return this.previous[e] ?? void 0;
	}
	set(e, t, n) {
		return e != null && (typeof e == "object" ? this.mutate(e, t) : this.mutate({ [e]: t }, n)), this;
	}
	remove(e, t) {
		let n = {}, r;
		if (typeof e == "string") n[e] = void 0, r = t;
		else if (Array.isArray(e)) e.forEach((e) => n[e] = void 0), r = t;
		else {
			for (let e in this.data) n[e] = void 0;
			r = e;
		}
		return this.mutate(n, Object.assign(Object.assign({}, r), { unset: !0 })), this;
	}
	getByPath(e) {
		return If(this.data, e, "/");
	}
	setByPath(e, t, n = {}) {
		let r = Array.isArray(e) ? [...e] : e.split("/"), i = Array.isArray(e) ? e.join("/") : e, a = r[0], o = r.length;
		if (n.propertyPath = i, n.propertyValue = t, n.propertyPathArray = r, o === 1) this.set(a, t, n);
		else {
			let i = {}, s = i, c = a;
			for (let e = 1; e < o; e += 1) {
				let t = r[e], n = Number.isFinite(Number(t));
				s = s[c] = n ? [] : {}, c = t;
			}
			Lf(i, r, t, "/");
			let l = N(this.data);
			n.rewrite && Rf(l, e, "/");
			let u = P(l, i);
			this.set(a, u[a], n);
		}
		return this;
	}
	removeByPath(e, t) {
		let n = Array.isArray(e) ? e : e.split("/"), r = n[0];
		if (n.length === 1) this.remove(r, t);
		else {
			let e = n.slice(1), i = N(this.get(r));
			i && Rf(i, e), this.set(r, i, t);
		}
		return this;
	}
	hasChanged(e) {
		return e == null ? Object.keys(this.changed).length > 0 : e in this.changed;
	}
	getChanges(e) {
		if (e == null) return this.hasChanged() ? N(this.changed) : null;
		let t = this.changing ? this.previous : this.data, n = {}, r;
		for (let i in e) {
			let a = e[i];
			El(t[i], a) || (n[i] = a, r = !0);
		}
		return r ? N(n) : null;
	}
	toJSON() {
		return N(this.data);
	}
	clone() {
		let e = this.constructor;
		return new e(this.data);
	}
	dispose() {
		this.off(), this.data = {}, this.previous = {}, this.changed = {}, this.pending = !1, this.changing = !1, this.pendingOptions = null, this.trigger("disposed", { store: this });
	}
};
k([K()], Wx.prototype, "dispose", null);
// node_modules/@antv/x6/es/model/cell.js
var X = class e extends xh {
	static isCell(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== e.toStringTag || typeof r.isNode != "function" || typeof r.isEdge != "function" || typeof r.prop != "function" || typeof r.attr != "function");
	}
	static normalizeTools(e) {
		if (typeof e == "string") return { items: [e] };
		if (Array.isArray(e)) return { items: e };
		if (e.items) return e;
		if (Reflect.has(e, "local")) {
			let t = e, { local: n } = t;
			return {
				local: n,
				items: [O(t, ["local"])]
			};
		}
		return { items: [e] };
	}
	static getCommonAncestor(...e) {
		let t = e.filter((e) => e != null).map((e) => e.getAncestors()).sort((e, t) => e.length - t.length);
		return t.shift().find((e) => t.every((t) => t.includes(e))) || null;
	}
	static getCellsBBox(e, t = {}) {
		let n = null;
		for (let r = 0, i = e.length; r < i; r += 1) {
			let i = e[r], a = i.getBBox(t);
			if (a) {
				if (i.isNode()) {
					let e = i.getAngle();
					e != null && e !== 0 && (a = a.bbox(e));
				}
				n = n == null ? a : n.union(a);
			}
		}
		return n;
	}
	static deepClone(t) {
		let n = [t, ...t.getDescendants({ deep: !0 })];
		return e.cloneCells(n);
	}
	static cloneCells(e) {
		let t = tu(e), n = t.reduce((e, t) => (e[t.id] = t.clone(), e), {});
		return t.forEach((e) => {
			let t = n[e.id];
			if (t.isEdge()) {
				let e = t.getSourceCellId(), r = t.getTargetCellId();
				e && n[e] && t.setSource(Object.assign(Object.assign({}, t.getSource()), { cell: n[e].id })), r && n[r] && t.setTarget(Object.assign(Object.assign({}, t.getTarget()), { cell: n[r].id }));
			}
			let r = e.getParent();
			r && n[r.id] && t.setParent(n[r.id]);
			let i = e.getChildren();
			if (i && i.length) {
				let e = i.reduce((e, t) => (n[t.id] && e.push(n[t.id]), e), []);
				e.length > 0 && t.setChildren(e);
			}
		}), n;
	}
	static config(e) {
		let { markup: t, propHooks: n, attrHooks: r } = e, i = O(e, [
			"markup",
			"propHooks",
			"attrHooks"
		]);
		t != null && (this.markup = t), n && (this.propHooks = this.propHooks.slice(), Array.isArray(n) ? this.propHooks.push(...n) : typeof n == "function" ? this.propHooks.push(n) : Object.values(n).forEach((e) => {
			typeof e == "function" && this.propHooks.push(e);
		})), r && (this.attrHooks = Object.assign(Object.assign({}, this.attrHooks), r)), this.defaults = P({}, this.defaults, i);
	}
	static getMarkup() {
		return this.markup;
	}
	static getDefaults(e) {
		return e ? this.defaults : N(this.defaults);
	}
	static getAttrHooks() {
		return this.attrHooks;
	}
	static applyPropHooks(e, t) {
		return this.propHooks.reduce((t, n) => n ? F(n, e, t) : t, t);
	}
	static generateId(e = {}) {
		return bf();
	}
	get [Symbol.toStringTag]() {
		return e.toStringTag;
	}
	constructor(t = {}) {
		super();
		let n = this.constructor.getDefaults(!0), r = P({}, this.preprocess(n), this.preprocess(t));
		this.id = r.id || e.generateId(t), this.store = new Wx(r), this.animationManager = new Vx(), this.setup(), this.init(), this.postprocess(t);
	}
	init() {}
	get model() {
		return this._model;
	}
	set model(e) {
		this._model !== e && (this._model = e);
	}
	preprocess(t, n) {
		let r = t.id, i = this.constructor.applyPropHooks(this, t);
		return r == null && n !== !0 && (i.id = e.generateId(t)), i;
	}
	postprocess(e) {}
	setup() {
		this.store.on("change:*", (e) => {
			let { key: t, current: n, previous: r, options: i } = e;
			this.notify("change:*", {
				key: t,
				options: i,
				current: n,
				previous: r,
				cell: this
			}), this.notify(`change:${t}`, {
				options: i,
				current: n,
				previous: r,
				cell: this
			});
			let a = t;
			(a === "source" || a === "target") && this.notify("change:terminal", {
				type: a,
				current: n,
				previous: r,
				options: i,
				cell: this
			});
		}), this.store.on("changed", ({ options: e }) => this.notify("changed", {
			options: e,
			cell: this
		})), this.on("added", ({ cell: e }) => {
			let t = this.store.get("animation");
			Tl(t) || t.forEach((t) => {
				e.animate(...t);
			});
		});
	}
	notify(e, t) {
		this.trigger(e, t);
		let n = this.model;
		return n && (n.notify(`cell:${e}`, t), this.isNode() ? n.notify(`node:${e}`, Object.assign(Object.assign({}, t), { node: this })) : this.isEdge() && n.notify(`edge:${e}`, Object.assign(Object.assign({}, t), { edge: this }))), this;
	}
	isNode() {
		return !1;
	}
	isEdge() {
		return !1;
	}
	isSameStore(e) {
		return this.store === e.store;
	}
	get view() {
		return this.store.get("view");
	}
	get shape() {
		return this.store.get("shape", "");
	}
	getProp(e, t) {
		return e == null ? this.store.get() : this.store.get(e, t);
	}
	setProp(e, t, n) {
		if (typeof e == "string") this.store.set(e, t, n);
		else {
			let n = this.preprocess(e, !0);
			this.store.set(P({}, this.getProp(), n), t), this.postprocess(e);
		}
		return this;
	}
	removeProp(e, t) {
		return typeof e == "string" || Array.isArray(e) ? this.store.removeByPath(e, t) : this.store.remove(t), this;
	}
	hasChanged(e) {
		return e == null ? this.store.hasChanged() : this.store.hasChanged(e);
	}
	getPropByPath(e) {
		return this.store.getByPath(e);
	}
	setPropByPath(e, t, n = {}) {
		return this.model && (e === "children" ? this._children = t ? t.map((e) => this.model.getCell(e)).filter((e) => e != null) : null : e === "parent" && (this._parent = t ? this.model.getCell(t) : null)), this.store.setByPath(e, t, n), this;
	}
	removePropByPath(e, t = {}) {
		let n = Array.isArray(e) ? e : e.split("/");
		return n[0] === "attrs" && (t.dirty = !0), this.store.removeByPath(n, t), this;
	}
	prop(e, t, n) {
		return e == null ? this.getProp() : typeof e == "string" || Array.isArray(e) ? arguments.length === 1 ? this.getPropByPath(e) : t == null ? this.removePropByPath(e, n || {}) : this.setPropByPath(e, t, n || {}) : this.setProp(e, t || {});
	}
	previous(e) {
		return this.store.getPrevious(e);
	}
	get zIndex() {
		return this.getZIndex();
	}
	set zIndex(e) {
		e == null ? this.removeZIndex() : this.setZIndex(e);
	}
	getZIndex() {
		return this.store.get("zIndex");
	}
	setZIndex(e, t = {}) {
		return this.store.set("zIndex", e, t), this;
	}
	removeZIndex(e = {}) {
		return this.store.remove("zIndex", e), this;
	}
	toFront(e = {}) {
		let t = this.model;
		if (t) {
			let n = t.getMaxZIndex(), r;
			e.deep ? (r = this.getDescendants({
				deep: !0,
				breadthFirst: !0
			}), r.unshift(this)) : r = [this], n = n - r.length + 1;
			let i = t.total(), a = t.indexOf(this) !== i - r.length;
			a || (a = r.some((e, t) => e.getZIndex() !== n + t)), a && this.batchUpdate("to-front", () => {
				n += r.length, r.forEach((t, r) => {
					t.setZIndex(n + r, e);
				});
			});
		}
		return this;
	}
	toBack(e = {}) {
		let t = this.model;
		if (t) {
			let n = t.getMinZIndex(), r;
			e.deep ? (r = this.getDescendants({
				deep: !0,
				breadthFirst: !0
			}), r.unshift(this)) : r = [this];
			let i = t.indexOf(this) !== 0;
			i || (i = r.some((e, t) => e.getZIndex() !== n + t)), i && this.batchUpdate("to-back", () => {
				n -= r.length, r.forEach((t, r) => {
					t.setZIndex(n + r, e);
				});
			});
		}
		return this;
	}
	get markup() {
		return this.getMarkup();
	}
	set markup(e) {
		e == null ? this.removeMarkup() : this.setMarkup(e);
	}
	getMarkup() {
		let e = this.store.get("markup");
		return e ?? (e = this.constructor.getMarkup()), e;
	}
	setMarkup(e, t = {}) {
		return this.store.set("markup", e, t), this;
	}
	removeMarkup(e = {}) {
		return this.store.remove("markup", e), this;
	}
	get attrs() {
		return this.getAttrs();
	}
	set attrs(e) {
		e == null ? this.removeAttrs() : this.setAttrs(e);
	}
	getAttrs() {
		let e = this.store.get("attrs");
		return e ? Object.assign({}, e) : {};
	}
	setAttrs(e, t = {}) {
		if (e == null) this.removeAttrs(t);
		else {
			let n = (e) => this.store.set("attrs", e, t);
			if (t.overwrite === !0) n(e);
			else {
				let r = this.getAttrs();
				t.deep === !1 ? n(Object.assign(Object.assign({}, r), e)) : n(P({}, r, e));
			}
		}
		return this;
	}
	replaceAttrs(e, t = {}) {
		return this.setAttrs(e, Object.assign(Object.assign({}, t), { overwrite: !0 }));
	}
	updateAttrs(e, t = {}) {
		return this.setAttrs(e, Object.assign(Object.assign({}, t), { deep: !1 }));
	}
	removeAttrs(e = {}) {
		return this.store.remove("attrs", e), this;
	}
	getAttrDefinition(e) {
		if (!e) return null;
		let t = this.constructor.getAttrHooks() || {}, n = t[e] || Qg.get(e);
		if (!n) {
			let r = Oa(e);
			n = t[r] || Qg.get(r);
		}
		return n || null;
	}
	getAttrByPath(e) {
		return e == null || e === "" ? this.getAttrs() : this.getPropByPath(this.prefixAttrPath(e));
	}
	setAttrByPath(e, t, n = {}) {
		return this.setPropByPath(this.prefixAttrPath(e), t, n), this;
	}
	removeAttrByPath(e, t = {}) {
		return this.removePropByPath(this.prefixAttrPath(e), t), this;
	}
	prefixAttrPath(e) {
		return Array.isArray(e) ? ["attrs"].concat(e) : `attrs/${e}`;
	}
	attr(e, t, n) {
		return e == null ? this.getAttrByPath() : typeof e == "string" || Array.isArray(e) ? arguments.length === 1 ? this.getAttrByPath(e) : t == null ? this.removeAttrByPath(e, n || {}) : this.setAttrByPath(e, t, n || {}) : this.setAttrs(e, t || {});
	}
	get visible() {
		return this.isVisible();
	}
	set visible(e) {
		this.setVisible(e);
	}
	setVisible(e, t = {}) {
		return this.store.set("visible", e, t), this;
	}
	isVisible() {
		return this.store.get("visible") !== !1;
	}
	show(e = {}) {
		return this.isVisible() || this.setVisible(!0, e), this;
	}
	hide(e = {}) {
		return this.isVisible() && this.setVisible(!1, e), this;
	}
	toggleVisible(e, t = {}) {
		let n = typeof e == "boolean" ? e : !this.isVisible(), r = typeof e == "boolean" ? t : e;
		return n ? this.show(r) : this.hide(r), this;
	}
	get data() {
		return this.getData();
	}
	set data(e) {
		this.setData(e);
	}
	getData() {
		return this.store.get("data");
	}
	setData(e, t = {}) {
		if (e == null) this.removeData(t);
		else {
			let n = (e) => this.store.set("data", e, t);
			if (t.overwrite === !0) n(e);
			else {
				let r = this.getData();
				t.deep === !1 ? n(typeof e == "object" ? Object.assign(Object.assign({}, r), e) : e) : n(P({}, r, e));
			}
		}
		return this;
	}
	replaceData(e, t = {}) {
		return this.setData(e, Object.assign(Object.assign({}, t), { overwrite: !0 }));
	}
	updateData(e, t = {}) {
		return this.setData(e, Object.assign(Object.assign({}, t), { deep: !1 }));
	}
	removeData(e = {}) {
		return this.store.remove("data", e), this;
	}
	get parent() {
		return this.getParent();
	}
	get children() {
		return this.getChildren();
	}
	getParentId() {
		return this.store.get("parent");
	}
	getParent() {
		let e = this.getParentId();
		if (e && this.model) {
			let t = this.model.getCell(e);
			return this._parent = t, t;
		}
		return null;
	}
	getChildren() {
		let e = this.store.get("children");
		if (e && e.length && this.model) {
			let t = e.map((e) => this.model?.getCell(e)).filter((e) => e != null);
			return this._children = t, [...t];
		}
		return null;
	}
	hasParent() {
		return this.parent != null;
	}
	isParentOf(e) {
		return e != null && e.getParent() === this;
	}
	isChildOf(e) {
		return e != null && this.getParent() === e;
	}
	eachChild(e, t) {
		return this.children && this.children.forEach(e, t), this;
	}
	filterChild(e, t) {
		return this.children ? this.children.filter(e, t) : [];
	}
	getChildCount() {
		return this.children == null ? 0 : this.children.length;
	}
	getChildIndex(e) {
		return this.children == null ? -1 : this.children.indexOf(e);
	}
	getChildAt(e) {
		return this.children != null && e >= 0 ? this.children[e] : null;
	}
	getAncestors(e = {}) {
		let t = [], n = this.getParent();
		for (; n;) t.push(n), n = e.deep === !1 ? null : n.getParent();
		return t;
	}
	getDescendants(e = {}) {
		if (e.deep !== !1) {
			if (e.breadthFirst) {
				let e = [], t = this.getChildren() || [];
				for (; t.length > 0;) {
					let n = t.shift(), r = n.getChildren();
					e.push(n), r && t.push(...r);
				}
				return e;
			}
			{
				let t = this.getChildren() || [];
				return t.forEach((n) => {
					t.push(...n.getDescendants(e));
				}), t;
			}
		}
		return this.getChildren() || [];
	}
	isDescendantOf(e, t = {}) {
		if (e == null) return !1;
		if (t.deep !== !1) {
			let t = this.getParent();
			for (; t;) {
				if (t === e) return !0;
				t = t.getParent();
			}
			return !1;
		}
		return this.isChildOf(e);
	}
	isAncestorOf(e, t = {}) {
		return e != null && e.isDescendantOf(this, t);
	}
	contains(e) {
		return this.isAncestorOf(e);
	}
	getCommonAncestor(...t) {
		return e.getCommonAncestor(this, ...t);
	}
	setParent(e, t = {}) {
		return this._parent = e, e ? this.store.set("parent", e.id, t) : this.store.remove("parent", t), this;
	}
	setChildren(e, t = {}) {
		return this._children = e, e == null ? this.store.remove("children", t) : this.store.set("children", e.map((e) => e.id), t), this;
	}
	unembed(e, t = {}) {
		let n = this.children;
		if (n != null && e != null) {
			let r = this.getChildIndex(e);
			r !== -1 && (n.splice(r, 1), e.setParent(null, t), this.setChildren(n, t));
		}
		return this;
	}
	embed(e, t = {}) {
		return e.addTo(this, t), this;
	}
	addTo(t, n = {}) {
		return e.isCell(t) ? t.addChild(this, n) : t.addCell(this, n), this;
	}
	insertTo(e, t, n = {}) {
		return e.insertChild(this, t, n), this;
	}
	addChild(e, t = {}) {
		return this.insertChild(e, void 0, t);
	}
	insertChild(e, t, n = {}) {
		if (e != null && e !== this) {
			let r = e.getParent(), i = this !== r, a = t;
			if (a ?? (a = this.getChildCount(), i || --a), r) {
				let t = r.getChildren();
				if (t) {
					let i = t.indexOf(e);
					i >= 0 && (e.setParent(null, n), t.splice(i, 1), r.setChildren(t, n));
				}
			}
			let o = this.children;
			if (o == null ? (o = [], o.push(e)) : o.splice(a, 0, e), e.setParent(this, n), this.setChildren(o, n), i && this.model) {
				let e = this.model.getIncomingEdges(this), t = this.model.getOutgoingEdges(this);
				e && e.forEach((e) => {
					e.updateParent(n);
				}), t && t.forEach((e) => {
					e.updateParent(n);
				});
			}
			this.model && this.model.addCell(e, n);
		}
		return this;
	}
	removeFromParent(e = {}) {
		let t = this.getParent();
		if (t != null) {
			let n = t.getChildIndex(this);
			t.removeChildAt(n, e);
		}
		return this;
	}
	removeChild(e, t = {}) {
		let n = this.getChildIndex(e);
		return this.removeChildAt(n, t);
	}
	removeChildAt(e, t = {}) {
		let n = this.getChildAt(e);
		return this.children != null && n != null && (this.unembed(n, t), n.remove(t)), n;
	}
	remove(e = {}) {
		return this.batchUpdate("remove", () => {
			let t = this.getParentId(), n = t && this.model ? this.model.getCell(t) : this._parent;
			if (n) {
				let t = n.store.get("children");
				if (t && t.length) {
					let r = t.filter((e) => e !== this.id);
					r.length !== t.length && (r.length ? n.store.set("children", r, e) : n.store.remove("children", e));
				}
			}
			this.setParent(null, e), e.deep !== !1 && this.eachChild((t) => t.remove(e)), this.model && this.model.removeCell(this, e), this.dispose();
		}), this;
	}
	animate(e, t) {
		let n = Ol(t) ? { duration: t } : Object.assign({}, t), r = new Bx(new Hx(this, e, n), n.timeline);
		return this.animationManager.addAnimation(r), r.id = n.id ?? "", r.play(), r;
	}
	getAnimations() {
		return this.animationManager.getAnimations();
	}
	translate(e, t, n) {
		return this;
	}
	scale(e, t, n, r) {
		return this;
	}
	addTools(e, t, n) {
		let r = Array.isArray(e) ? e : [e], i = typeof t == "string" ? t : null, a = typeof t == "object" ? t : typeof n == "object" ? n : {};
		if (a.reset) return this.setTools({
			name: i,
			items: r,
			local: a.local
		}, a);
		let o = N(this.getTools());
		if (o == null || i == null || o.name === i) return o ?? (o = {}), o.items || (o.items = []), o.name = i, o.items = [...o.items, ...r], this.setTools(Object.assign({}, o), a);
	}
	setTools(t, n = {}) {
		return t == null ? this.removeTools() : this.store.set("tools", e.normalizeTools(t), n), this;
	}
	getTools() {
		return this.store.get("tools");
	}
	removeTools(e = {}) {
		return this.store.remove("tools", e), this;
	}
	hasTools(e) {
		let t = this.getTools();
		return t == null ? !1 : e == null || t.name === e;
	}
	hasTool(e) {
		let t = this.getTools();
		return t != null && t.items.some((t) => typeof t == "string" ? t === e : t.name === e);
	}
	removeTool(e, t = {}) {
		let n = N(this.getTools());
		if (n) {
			let r = !1, i = n.items.slice(), a = (e) => {
				i.splice(e, 1), r = !0;
			};
			if (typeof e == "number") a(e);
			else for (let t = i.length - 1; t >= 0; --t) {
				let n = i[t];
				(typeof n == "string" ? n === e : n.name === e) && a(t);
			}
			r && (n.items = i, this.setTools(n, t));
		}
		return this;
	}
	getBBox(e) {
		return new L();
	}
	getConnectionPoint(e, t) {
		return new I();
	}
	toJSON(e = {}) {
		let t = Object.assign({}, this.store.get()), n = Object.prototype.toString, r = this.isNode() ? "node" : this.isEdge() ? "edge" : "cell";
		if (!t.shape) {
			let e = this.constructor;
			throw Error(`Unable to serialize ${r} missing "shape" prop, check the ${r} "${e.name || n.call(e)}"`);
		}
		let i = this.constructor, a = e.diff === !0, o = t.attrs || {}, s = i.getDefaults(!0), c = a ? this.preprocess(s, !0) : s, l = c.attrs || {}, u = {};
		Object.entries(t).forEach(([e, n]) => {
			if (n != null && !Array.isArray(n) && typeof n == "object" && !ii(n)) throw Error(`Can only serialize ${r} with plain-object props, but got a "${toString.call(n)}" type of key "${e}" on ${r} "${this.id}"`);
			if (e !== "attrs" && e !== "shape" && a) {
				let r = c[e];
				El(n, r) && delete t[e];
			}
		}), Object.keys(o).forEach((e) => {
			let t = o[e], n = l[e];
			Object.keys(t).forEach((r) => {
				let i = t[r], a = n ? n[r] : null;
				typeof i == "object" && i && !Array.isArray(i) ? Object.keys(i).forEach((t) => {
					let o = i[t];
					if (n == null || a == null || !A(a) || !El(a[t], o)) {
						u[e] ?? (u[e] = {}), u[e][r] ?? (u[e][r] = {});
						let n = u[e][r];
						n[t] = o;
					}
				}) : n != null && El(a, i) || (u[e] ?? (u[e] = {}), u[e][r] = i);
			});
		});
		let d = Object.assign(Object.assign({}, t), { attrs: Tl(u) ? void 0 : u });
		d.attrs ?? delete d.attrs;
		let f = d;
		return f.angle === 0 && delete f.angle, N(f);
	}
	clone(t = {}) {
		if (!t.deep) {
			let e = Object.assign({}, this.store.get());
			t.keepId || delete e.id, delete e.parent, delete e.children;
			let n = this.constructor;
			return new n(e);
		}
		return e.deepClone(this)[this.id];
	}
	findView(e) {
		return e.findViewByCell(this);
	}
	startBatch(e, t = {}, n = this.model) {
		return this.notify("batch:start", {
			name: e,
			data: t,
			cell: this
		}), n && n.startBatch(e, Object.assign(Object.assign({}, t), { cell: this })), this;
	}
	stopBatch(e, t = {}, n = this.model) {
		return n && n.stopBatch(e, Object.assign(Object.assign({}, t), { cell: this })), this.notify("batch:stop", {
			name: e,
			data: t,
			cell: this
		}), this;
	}
	batchUpdate(e, t, n) {
		let r = this.model;
		this.startBatch(e, n, r);
		let i = t();
		return this.stopBatch(e, n, r), i;
	}
	dispose() {
		this.removeFromParent(), this.animationManager.cancelAnimations(), this.store.dispose();
	}
};
X.toStringTag = "X6.cell", X.defaults = {}, X.attrHooks = {}, X.propHooks = [], k([K()], X.prototype, "dispose", null), X.config({ propHooks(e) {
	var { tools: t } = e, n = O(e, ["tools"]);
	return t && (n.tools = X.normalizeTools(t)), n;
} });
// node_modules/@antv/x6/es/model/port.js
var Gx = class {
	constructor(e) {
		this.ports = [], this.groups = {}, this.init(N(e));
	}
	getPorts() {
		return this.ports;
	}
	getGroup(e) {
		return e == null ? null : this.groups[e];
	}
	getPortsByGroup(e) {
		return this.ports.filter((t) => t.group === e || t.group == null && e == null);
	}
	getPortsLayoutByGroup(e, t) {
		let n = this.getPortsByGroup(e), r = e ? this.getGroup(e) : null, i = r ? r.position : null, a = i ? i.name : null, o;
		if (a != null) {
			let e = by.get(a);
			if (e == null) return by.onNotFound(a);
			o = e;
		} else o = yy.left;
		let s = n.map((e) => e && e.position && e.position.args || {}), c = i && i.args || {};
		return o(s, t, c).map((e, r) => {
			let i = n[r];
			return {
				portLayout: e,
				portId: i.id,
				portSize: i.size,
				portAttrs: i.attrs,
				labelSize: i.label.size,
				labelLayout: this.getPortLabelLayout(i, I.create(e.position), t)
			};
		});
	}
	init(e) {
		let { groups: t, items: n } = e;
		t != null && Object.keys(t).forEach((e) => {
			this.groups[e] = this.parseGroup(t[e]);
		}), Array.isArray(n) && n.forEach((e) => {
			this.ports.push(this.parsePort(e));
		});
	}
	parseGroup(e) {
		return Object.assign(Object.assign({}, e), {
			label: this.getLabel(e, !0),
			position: this.getPortPosition(e.position, !0)
		});
	}
	parsePort(e) {
		let t = Object.assign({}, e), n = this.getGroup(e.group) || {};
		return t.markup = t.markup || n.markup, t.attrs = P({}, n.attrs, t.attrs), t.position = this.createPosition(n, t), t.label = P({}, n.label, this.getLabel(t)), t.zIndex = this.getZIndex(n, t), t.size = Object.assign(Object.assign({}, n.size), t.size), t;
	}
	getZIndex(e, t) {
		return typeof t.zIndex == "number" ? t.zIndex : typeof e.zIndex == "number" || e.zIndex === "auto" ? e.zIndex : "auto";
	}
	createPosition(e, t) {
		return P({
			name: "left",
			args: {}
		}, e.position, { args: t.args });
	}
	getPortPosition(e, t = !1) {
		if (e == null) {
			if (t) return {
				name: "left",
				args: {}
			};
		} else {
			if (typeof e == "string") return {
				name: e,
				args: {}
			};
			if (Array.isArray(e)) return {
				name: "absolute",
				args: {
					x: e[0],
					y: e[1]
				}
			};
			if (typeof e == "object") return e;
		}
		return { args: {} };
	}
	getPortLabelPosition(e, t = !1) {
		if (e == null) {
			if (t) return {
				name: "left",
				args: {}
			};
		} else {
			if (typeof e == "string") return {
				name: e,
				args: {}
			};
			if (typeof e == "object") return e;
		}
		return { args: {} };
	}
	getLabel(e, t = !1) {
		let n = e.label || {};
		return n.position = this.getPortLabelPosition(n.position, t), n;
	}
	getPortLabelLayout(e, t, n) {
		let r = e.label.position.name || "left", i = e.label.position.args || {}, a = oy.get(r) || ay.left;
		return a ? a(t, n, i) : null;
	}
}, Kx, qx;
function Jx(e, t) {
	return t ? Kx != null && Kx.exist(e) : qx != null && qx.exist(e);
}
function Yx(e) {
	Kx = e;
}
function Xx(e) {
	qx = e;
}
// node_modules/@antv/x6/es/model/node.js
var Zx = "X6.node", Qx = 0;
function $x(e) {
	return e ? Yd(e) : (Qx += 1, `CustomNode${Qx}`);
}
var eS = class e extends X {
	static isNode(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== Zx || typeof r.isNode != "function" || typeof r.isEdge != "function" || typeof r.prop != "function" || typeof r.attr != "function" || typeof r.size != "function" || typeof r.position != "function");
	}
	static define(t) {
		let { constructorName: n, overwrite: r } = t, i = O(t, ["constructorName", "overwrite"]), a = Pf($x(n || i.shape), this);
		return a.config(i), i.shape && e.registry.register(i.shape, a, r), a;
	}
	static create(t) {
		let n = t.shape || "rect", r = e.registry.get(n);
		return r ? new r(t) : e.registry.onNotFound(n);
	}
	get [Symbol.toStringTag]() {
		return e.toStringTag;
	}
	constructor(e = {}) {
		super(e), this.initPorts();
	}
	preprocess(e, t) {
		let { x: n, y: r, width: i, height: a } = e, o = O(e, [
			"x",
			"y",
			"width",
			"height"
		]);
		if (n != null || r != null) {
			let e = o.position;
			o.position = Object.assign(Object.assign({}, e), {
				x: n ?? (e ? e.x : 0),
				y: r ?? (e ? e.y : 0)
			});
		}
		if (i != null || a != null) {
			let e = o.size;
			o.size = Object.assign(Object.assign({}, e), {
				width: i ?? (e ? e.width : 0),
				height: a ?? (e ? e.height : 0)
			});
		}
		return super.preprocess(o, t);
	}
	isNode() {
		return !0;
	}
	size(e, t, n) {
		return e === void 0 ? this.getSize() : typeof e == "number" ? this.setSize(e, t, n) : this.setSize(e, t);
	}
	getSize() {
		let e = this.store.get("size");
		return e ? Object.assign({}, e) : {
			width: 1,
			height: 1
		};
	}
	setSize(e, t, n) {
		return typeof e == "object" ? this.resize(e.width, e.height, t) : this.resize(e, t, n), this;
	}
	resize(e, t, n = {}) {
		this.startBatch("resize", n);
		let r = n.direction;
		if (r) {
			let i = this.getSize();
			switch (r) {
				case "left":
				case "right":
					t = i.height;
					break;
				case "top":
				case "bottom": e = i.width;
			}
			let a = {
				right: 0,
				"top-right": 0,
				top: 1,
				"top-left": 1,
				left: 2,
				"bottom-left": 2,
				bottom: 3,
				"bottom-right": 3
			}[r], o = Lu(this.getAngle() || 0);
			n.absolute && (a += Math.floor((o + 45) / 90), a %= 4);
			let s = this.getBBox(), c;
			c = a === 0 ? s.getBottomLeft() : a === 1 ? s.getCorner() : a === 2 ? s.getTopRight() : s.getOrigin();
			let l = c.clone().rotate(-o, s.getCenter()), u = Math.sqrt(e * e + t * t) / 2, d = a * Math.PI / 2;
			d += Math.atan(a % 2 == 0 ? t / e : e / t), d -= Iu(o);
			let f = I.fromPolar(u, d, l).clone().translate(e / -2, t / -2);
			this.store.set("size", {
				width: e,
				height: t
			}, n), this.setPosition(f.x, f.y, n);
		} else this.store.set("size", {
			width: e,
			height: t
		}, n);
		return this.stopBatch("resize", n), this;
	}
	scale(e, t, n, r = {}) {
		let i = this.getBBox().scale(e, t, n ?? void 0);
		return this.startBatch("scale", r), this.setPosition(i.x, i.y, r), this.resize(i.width, i.height, r), this.stopBatch("scale"), this;
	}
	position(e, t, n) {
		return typeof e == "number" ? this.setPosition(e, t, n) : this.getPosition(e);
	}
	getPosition(e = {}) {
		if (e.relative) {
			let e = this.getParent();
			if (e != null && e.isNode()) {
				let t = this.getPosition(), n = e.getPosition();
				return {
					x: t.x - n.x,
					y: t.y - n.y
				};
			}
		}
		let t = this.store.get("position");
		return t ? Object.assign({}, t) : {
			x: 0,
			y: 0
		};
	}
	setPosition(e, t, n = {}) {
		let r, i, a;
		if (typeof e == "object" ? (r = e.x, i = e.y, a = t || {}) : (r = e, i = t, a = n || {}), a.relative) {
			let e = this.getParent();
			if (e != null && e.isNode()) {
				let t = e.getPosition();
				r += t.x, i += t.y;
			}
		}
		if (a.deep) {
			let e = this.getPosition();
			this.translate(r - e.x, i - e.y, a);
		} else this.store.set("position", {
			x: r,
			y: i
		}, a);
		return this;
	}
	translate(e = 0, t = 0, n = {}) {
		if (e === 0 && t === 0) return this;
		n.translateBy = n.translateBy || this.id;
		let r = this.getPosition();
		if (n.restrict != null && n.translateBy === this.id) {
			let i = this.getBBox({ deep: !0 }), a = n.restrict, o = r.x - i.x, s = r.y - i.y, c = Math.max(a.x + o, Math.min(a.x + a.width + o - i.width, r.x + e)), l = Math.max(a.y + s, Math.min(a.y + a.height + s - i.height, r.y + t));
			e = c - r.x, t = l - r.y;
		}
		let i = {
			x: r.x + e,
			y: r.y + t
		};
		if (n.tx = e, n.ty = t, n.transition) {
			let r = typeof n.transition == "object" ? Object.assign({}, n.transition) : {};
			r = Object.assign({
				duration: 100,
				fill: "forwards"
			}, r), this.animate({
				"position/x": i.x,
				"position/y": i.y
			}, r), this.eachChild((r) => {
				n.exclude?.includes(r) || r.translate(e, t, n);
			});
		} else this.startBatch("translate", n), this.store.set("position", i, n), this.eachChild((r) => {
			n.exclude?.includes(r) || r.translate(e, t, n);
		}), this.stopBatch("translate", n);
		return this;
	}
	angle(e, t) {
		return e == null ? this.getAngle() : this.rotate(e, t);
	}
	getAngle() {
		return this.store.get("angle", 0);
	}
	rotate(e, t = {}) {
		let n = this.getAngle();
		if (t.center) {
			let r = this.getSize(), i = this.getPosition(), a = this.getBBox().getCenter();
			a.rotate(n - e, t.center);
			let o = a.x - r.width / 2 - i.x, s = a.y - r.height / 2 - i.y;
			this.startBatch("rotate", {
				angle: e,
				options: t
			}), this.setPosition(i.x + o, i.y + s, t), this.rotate(e, Object.assign(Object.assign({}, t), { center: null })), this.stopBatch("rotate");
		} else this.store.set("angle", t.absolute ? e : (n + e) % 360, t);
		return this;
	}
	getBBox(e = {}) {
		if (e.deep) {
			let e = this.getDescendants({
				deep: !0,
				breadthFirst: !0
			});
			return e.push(this), X.getCellsBBox(e);
		}
		return L.fromPositionAndSize(this.getPosition(), this.getSize());
	}
	getConnectionPoint(e, t) {
		let n = this.getBBox(), r = n.getCenter(), i = e.getTerminal(t);
		if (i == null) return r;
		let a = i.port;
		if (!a || !this.hasPort(a)) return r;
		let o = this.getPort(a);
		if (!o || !o.group) return r;
		let s = this.getPortsPosition(o.group)[a].position, c = I.create(s).translate(n.getOrigin()), l = this.getAngle();
		return l && c.rotate(-l, r), c;
	}
	fit(e = {}) {
		let t = (this.getChildren() || []).filter((e) => e.isNode());
		if (t.length === 0) return this;
		this.startBatch("fit-embeds", e), e.deep && t.forEach((t) => {
			t.fit(e);
		});
		let { x: n, y: r, width: i, height: a } = X.getCellsBBox(t), o = ou(e.padding);
		return n -= o.left, r -= o.top, i += o.left + o.right, a += o.bottom + o.top, this.store.set({
			position: {
				x: n,
				y: r
			},
			size: {
				width: i,
				height: a
			}
		}, e), this.stopBatch("fit-embeds"), this;
	}
	get portContainerMarkup() {
		return this.getPortContainerMarkup();
	}
	set portContainerMarkup(e) {
		this.setPortContainerMarkup(e);
	}
	getDefaultPortContainerMarkup() {
		return this.store.get("defaultPortContainerMarkup") || Hb.getPortContainerMarkup();
	}
	getPortContainerMarkup() {
		return this.store.get("portContainerMarkup") || this.getDefaultPortContainerMarkup();
	}
	setPortContainerMarkup(e, t = {}) {
		return this.store.set("portContainerMarkup", Hb.clone(e), t), this;
	}
	get portMarkup() {
		return this.getPortMarkup();
	}
	set portMarkup(e) {
		this.setPortMarkup(e);
	}
	getDefaultPortMarkup() {
		return this.store.get("defaultPortMarkup") || Hb.getPortMarkup();
	}
	getPortMarkup() {
		return this.store.get("portMarkup") || this.getDefaultPortMarkup();
	}
	setPortMarkup(e, t = {}) {
		return this.store.set("portMarkup", Hb.clone(e), t), this;
	}
	get portLabelMarkup() {
		return this.getPortLabelMarkup();
	}
	set portLabelMarkup(e) {
		this.setPortLabelMarkup(e);
	}
	getDefaultPortLabelMarkup() {
		return this.store.get("defaultPortLabelMarkup") || Hb.getPortLabelMarkup();
	}
	getPortLabelMarkup() {
		return this.store.get("portLabelMarkup") || this.getDefaultPortLabelMarkup();
	}
	setPortLabelMarkup(e, t = {}) {
		return this.store.set("portLabelMarkup", Hb.clone(e), t), this;
	}
	get ports() {
		let e = this.store.get("ports", { items: [] });
		return e.items ?? (e.items = []), e;
	}
	getPorts() {
		return N(this.ports.items);
	}
	getPortsByGroup(e) {
		return this.getPorts().filter((t) => t.group === e);
	}
	getPort(e) {
		return N(this.ports.items.find((t) => t.id && t.id === e));
	}
	getPortAt(e) {
		return this.ports.items[e] || null;
	}
	hasPorts() {
		return this.ports.items.length > 0;
	}
	hasPort(e) {
		return this.getPortIndex(e) !== -1;
	}
	getPortIndex(e) {
		let t = typeof e == "string" ? e : e.id;
		return t == null ? -1 : this.ports.items.findIndex((e) => e.id === t);
	}
	getPortsPosition(e) {
		let t = this.getSize();
		return this.port.getPortsLayoutByGroup(e, new L(0, 0, t.width, t.height)).reduce((e, t) => {
			let n = t.portLayout;
			return e[t.portId] = {
				position: Object.assign({}, n.position),
				angle: n.angle || 0
			}, e;
		}, {});
	}
	getPortProp(e, t) {
		return this.getPropByPath(this.prefixPortPath(e, t));
	}
	setPortProp(e, t, n, r) {
		if (typeof t == "string" || Array.isArray(t)) {
			let i = this.prefixPortPath(e, t), a = n;
			return this.setPropByPath(i, a, r);
		}
		let i = this.prefixPortPath(e), a = t;
		return this.setPropByPath(i, a, n);
	}
	removePortProp(e, t, n) {
		return typeof t == "string" || Array.isArray(t) ? this.removePropByPath(this.prefixPortPath(e, t), n) : this.removePropByPath(this.prefixPortPath(e), t);
	}
	portProp(e, t, n, r) {
		return t == null ? this.getPortProp(e) : typeof t == "string" || Array.isArray(t) ? arguments.length === 2 ? this.getPortProp(e, t) : n == null ? this.removePortProp(e, t, r) : this.setPortProp(e, t, n, r) : this.setPortProp(e, t, n);
	}
	prefixPortPath(e, t) {
		let n = this.getPortIndex(e);
		if (n === -1) throw Error(`Unable to find port with id: "${e}"`);
		return t == null || t === "" ? [
			"ports",
			"items",
			`${n}`
		] : Array.isArray(t) ? [
			"ports",
			"items",
			`${n}`,
			...t
		] : `ports/items/${n}/${t}`;
	}
	addPort(e, t) {
		let n = [...this.ports.items];
		return n.push(e), this.setPropByPath("ports/items", n, t), this;
	}
	addPorts(e, t) {
		return this.setPropByPath("ports/items", [...this.ports.items, ...e], t), this;
	}
	insertPort(e, t, n) {
		let r = [...this.ports.items];
		return r.splice(e, 0, t), this.setPropByPath("ports/items", r, n), this;
	}
	removePort(e, t = {}) {
		return this.removePortAt(this.getPortIndex(e), t);
	}
	removePortAt(e, t = {}) {
		if (e >= 0) {
			let n = [...this.ports.items];
			n.splice(e, 1), t.rewrite = !0, this.setPropByPath("ports/items", n, t);
		}
		return this;
	}
	removePorts(e, t) {
		let n;
		if (Array.isArray(e)) {
			if (n = t || {}, e.length) {
				n.rewrite = !0;
				let t = [...this.ports.items].filter((t) => !e.some((e) => {
					let n = typeof e == "string" ? e : e.id;
					return t.id === n;
				}));
				this.setPropByPath("ports/items", t, n);
			}
		} else n = e || {}, n.rewrite = !0, this.setPropByPath("ports/items", [], n);
		return this;
	}
	getParsedPorts() {
		return this.port.getPorts();
	}
	getParsedGroups() {
		return this.port.groups;
	}
	getPortsLayoutByGroup(e, t) {
		return this.port.getPortsLayoutByGroup(e, t);
	}
	initPorts() {
		this.updatePortData(), this.on("change:ports", () => {
			this.processRemovedPort(), this.updatePortData();
		});
	}
	processRemovedPort() {
		let e = this.ports, t = {};
		e.items.forEach((e) => {
			e.id && (t[e.id] = !0);
		});
		let n = {};
		(this.store.getPrevious("ports") || { items: [] }).items.forEach((e) => {
			e.id && !t[e.id] && (n[e.id] = !0);
		});
		let r = this.model;
		r && !Tl(n) && (r.getConnectedEdges(this, { incoming: !0 }).forEach((e) => {
			let t = e.getTargetPortId();
			t && n[t] && e.remove();
		}), r.getConnectedEdges(this, { outgoing: !0 }).forEach((e) => {
			let t = e.getSourcePortId();
			t && n[t] && e.remove();
		}));
	}
	validatePorts() {
		let e = {}, t = [];
		return this.ports.items.forEach((n) => {
			typeof n != "object" && t.push(`Invalid port ${n}.`), n.id ?? (n.id = this.generatePortId()), e[n.id] && t.push("Duplicitied port id."), e[n.id] = !0;
		}), t;
	}
	generatePortId() {
		return bf();
	}
	updatePortData() {
		let e = this.validatePorts();
		if (e.length > 0) throw this.store.set("ports", this.store.getPrevious("ports")), Error(e.join(" "));
		let t = this.port ? this.port.getPorts() : null;
		this.port = new Gx(this.ports);
		let n = this.port.getPorts(), r = t ? n.filter((e) => t.find((t) => t.id === e.id) ? null : e) : [...n], i = t ? t.filter((e) => n.find((t) => t.id === e.id) ? null : e) : [];
		r.length > 0 && this.notify("ports:added", {
			added: r,
			cell: this,
			node: this
		}), i.length > 0 && this.notify("ports:removed", {
			removed: i,
			cell: this,
			node: this
		});
	}
};
eS.toStringTag = Zx, eS.registry = q.create({
	type: "node",
	process(e, t) {
		if (Jx(e, !0)) throw Error(`Node with name '${e}' was registered by anthor Edge`);
		if (typeof t == "function") return t.config({ shape: e }), t;
		let n = eS, { inherit: r } = t, i = O(t, ["inherit"]);
		if (r) {
			if (typeof r == "string") {
				let e = this.get(r);
				e == null ? this.onNotFound(r, "inherited") : n = e;
			} else n = r;
		}
		i.constructorName ?? (i.constructorName = e);
		let a = n.define.call(n, i);
		return a.config({ shape: e }), a;
	}
}), eS.defaults = {
	angle: 0,
	position: {
		x: 0,
		y: 0
	},
	size: {
		width: 1,
		height: 1
	}
}, eS.config({
	markup: [{
		tagName: "rect",
		selector: "body"
	}, {
		tagName: "text",
		selector: "label"
	}],
	propHooks(e) {
		var { ports: t } = e, n = O(e, ["ports"]);
		return t && (n.ports = Array.isArray(t) ? { items: t } : t), n;
	}
}), Xx(eS.registry);
// node_modules/@antv/x6/es/model/edge.js
var tS = "X6.edge", nS = "basic.edge", rS = 0;
function iS(e) {
	return e ? Yd(e) : (rS += 1, `CustomEdge${rS}`);
}
var Z = class e extends X {
	static parseStringLabel(e) {
		return { attrs: { label: { text: e } } };
	}
	static isEdge(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== tS || typeof r.isNode != "function" || typeof r.isEdge != "function" || typeof r.prop != "function" || typeof r.attr != "function" || typeof r.disconnect != "function" || typeof r.getSource != "function" || typeof r.getTarget != "function");
	}
	static equalTerminals(e, t) {
		let n = e, r = t;
		return n.cell === r.cell ? n.port === r.port || n.port == null && r.port == null : !1;
	}
	static define(t) {
		let { constructorName: n, overwrite: r } = t, i = O(t, ["constructorName", "overwrite"]), a = Pf(iS(n || i.shape), this);
		return a.config(i), i.shape && e.registry.register(i.shape, a, r), a;
	}
	static create(t) {
		let n = t.shape || "edge", r = e.registry.get(n);
		return r ? new r(t) : e.registry.onNotFound(n);
	}
	get [Symbol.toStringTag]() {
		return e.toStringTag;
	}
	constructor(e = {}) {
		super(e);
	}
	preprocess(e, t) {
		let { source: n, sourceCell: r, sourcePort: i, sourcePoint: a, target: o, targetCell: s, targetPort: c, targetPoint: l } = e, u = O(e, [
			"source",
			"sourceCell",
			"sourcePort",
			"sourcePoint",
			"target",
			"targetCell",
			"targetPort",
			"targetPoint"
		]), d = (e) => typeof e == "string" || typeof e == "number";
		if (n != null) {
			if (X.isCell(n)) u.source = { cell: n.id };
			else if (d(n)) u.source = { cell: n };
			else if (I.isPoint(n)) u.source = n.toJSON();
			else if (Array.isArray(n)) u.source = {
				x: n[0],
				y: n[1]
			};
			else {
				let e = n.cell;
				u.source = X.isCell(e) ? Object.assign(Object.assign({}, n), { cell: e.id }) : n;
			}
		}
		if (r != null || i != null) {
			let e = u.source;
			if (r != null) {
				let t = d(r) ? r : r.id;
				e ? e.cell = t : e = u.source = { cell: t };
			}
			i != null && e && (e.port = i);
		} else a != null && (u.source = I.create(a).toJSON());
		if (o != null) {
			if (X.isCell(o)) u.target = { cell: o.id };
			else if (d(o)) u.target = { cell: o };
			else if (I.isPoint(o)) u.target = o.toJSON();
			else if (Array.isArray(o)) u.target = {
				x: o[0],
				y: o[1]
			};
			else {
				let e = o.cell;
				u.target = X.isCell(e) ? Object.assign(Object.assign({}, o), { cell: e.id }) : o;
			}
		}
		if (s != null || c != null) {
			let e = u.target;
			if (s != null) {
				let t = d(s) ? s : s.id;
				e ? e.cell = t : e = u.target = { cell: t };
			}
			c != null && e && (e.port = c);
		} else l != null && (u.target = I.create(l).toJSON());
		return super.preprocess(u, t);
	}
	setup() {
		super.setup(), this.on("change:labels", (e) => this.onLabelsChanged(e)), this.on("change:vertices", (e) => this.onVertexsChanged(e));
	}
	isEdge() {
		return !0;
	}
	disconnect(e = {}) {
		return this.store.set({
			source: {
				x: 0,
				y: 0
			},
			target: {
				x: 0,
				y: 0
			}
		}, e), this;
	}
	get source() {
		return this.getSource();
	}
	set source(e) {
		this.setSource(e);
	}
	getSource() {
		return this.getTerminal("source");
	}
	getSourceCellId() {
		return this.source.cell;
	}
	getSourcePortId() {
		return this.source.port;
	}
	setSource(e, t, n = {}) {
		return this.setTerminal("source", e, t, n);
	}
	get target() {
		return this.getTarget();
	}
	set target(e) {
		this.setTarget(e);
	}
	getTarget() {
		return this.getTerminal("target");
	}
	getTargetCellId() {
		return this.target.cell;
	}
	getTargetPortId() {
		return this.target.port;
	}
	setTarget(e, t, n = {}) {
		return this.setTerminal("target", e, t, n);
	}
	getTerminal(e) {
		return Object.assign({}, this.store.get(e));
	}
	setTerminal(e, t, n, r = {}) {
		if (X.isCell(t)) return this.store.set(e, P({}, n, { cell: t.id }), r), this;
		let i = t;
		return I.isPoint(t) || i.x != null && i.y != null ? (this.store.set(e, P({}, n, {
			x: i.x,
			y: i.y
		}), r), this) : (this.store.set(e, N(t), r), this);
	}
	getSourcePoint() {
		return this.getTerminalPoint("source");
	}
	getTargetPoint() {
		return this.getTerminalPoint("target");
	}
	getTerminalPoint(e) {
		let t = this[e];
		if (I.isPointLike(t)) return I.create(t);
		let n = this.getTerminalCell(e);
		return n ? n.getConnectionPoint(this, e) : new I();
	}
	getSourceCell() {
		return this.getTerminalCell("source");
	}
	getTargetCell() {
		return this.getTerminalCell("target");
	}
	getTerminalCell(e) {
		if (this.model) {
			let t = e === "source" ? this.getSourceCellId() : this.getTargetCellId();
			if (t) return this.model.getCell(t);
		}
		return null;
	}
	getSourceNode() {
		return this.getTerminalNode("source");
	}
	getTargetNode() {
		return this.getTerminalNode("target");
	}
	getTerminalNode(e) {
		let t = this, n = {};
		for (; t && t.isEdge();) {
			if (n[t.id]) return null;
			n[t.id] = !0, t = t.getTerminalCell(e);
		}
		return t && t.isNode() ? t : null;
	}
	get router() {
		return this.getRouter();
	}
	set router(e) {
		e == null ? this.removeRouter() : this.setRouter(e);
	}
	getRouter() {
		return this.store.get("router");
	}
	setRouter(e, t, n) {
		return typeof e == "object" ? this.store.set("router", e, t) : this.store.set("router", {
			name: e,
			args: t
		}, n), this;
	}
	removeRouter(e = {}) {
		return this.store.remove("router", e), this;
	}
	get connector() {
		return this.getConnector();
	}
	set connector(e) {
		e == null ? this.removeConnector() : this.setConnector(e);
	}
	getConnector() {
		return this.store.get("connector");
	}
	setConnector(e, t, n) {
		return typeof e == "object" ? this.store.set("connector", e, t) : this.store.set("connector", {
			name: e,
			args: t
		}, n), this;
	}
	removeConnector(e = {}) {
		return this.store.remove("connector", e);
	}
	getDefaultLabel() {
		let e = this.constructor;
		return N(this.store.get("defaultLabel") || e.defaultLabel || {});
	}
	get labels() {
		return this.getLabels();
	}
	set labels(e) {
		this.setLabels(e);
	}
	getLabels() {
		return [...this.store.get("labels", [])].map((e) => this.parseLabel(e));
	}
	setLabels(e, t = {}) {
		return this.store.set("labels", Array.isArray(e) ? e : [e], t), this;
	}
	insertLabel(e, t, n = {}) {
		let r = this.getLabels(), i = r.length, a = t != null && Number.isFinite(t) ? t : i;
		return a < 0 && (a = i + a + 1), r.splice(a, 0, this.parseLabel(e)), this.setLabels(r, n);
	}
	appendLabel(e, t = {}) {
		return this.insertLabel(e, -1, t);
	}
	getLabelAt(e) {
		let t = this.getLabels();
		return e != null && Number.isFinite(e) ? this.parseLabel(t[e]) : null;
	}
	setLabelAt(e, t, n = {}) {
		if (e != null && Number.isFinite(e)) {
			let r = this.getLabels();
			r[e] = this.parseLabel(t), this.setLabels(r, n);
		}
		return this;
	}
	removeLabelAt(e, t = {}) {
		let n = this.getLabels(), r = e != null && Number.isFinite(e) ? e : -1, i = n.splice(r, 1);
		return this.setLabels(n, t), i.length ? i[0] : null;
	}
	parseLabel(e) {
		return typeof e == "string" ? this.constructor.parseStringLabel(e) : e;
	}
	onLabelsChanged({ previous: e, current: t }) {
		let n = e && t ? t.filter((t) => e.find((e) => t === e || El(t, e)) ? null : t) : t ? [...t] : [], r = e && t ? e.filter((e) => t.find((t) => e === t || El(e, t)) ? null : e) : e ? [...e] : [];
		n.length > 0 && this.notify("labels:added", {
			added: n,
			cell: this,
			edge: this
		}), r.length > 0 && this.notify("labels:removed", {
			removed: r,
			cell: this,
			edge: this
		});
	}
	get vertices() {
		return this.getVertices();
	}
	set vertices(e) {
		this.setVertices(e);
	}
	getVertices() {
		return [...this.store.get("vertices", [])];
	}
	setVertices(e, t = {}) {
		let n = Array.isArray(e) ? e : [e];
		return this.store.set("vertices", n.map((e) => I.toJSON(e)), t), this;
	}
	insertVertex(e, t, n = {}) {
		let r = this.getVertices(), i = r.length, a = t != null && Number.isFinite(t) ? t : i;
		return a < 0 && (a = i + a + 1), r.splice(a, 0, I.toJSON(e)), this.setVertices(r, n);
	}
	appendVertex(e, t = {}) {
		return this.insertVertex(e, -1, t);
	}
	getVertexAt(e) {
		return e != null && Number.isFinite(e) ? this.getVertices()[e] : null;
	}
	setVertexAt(e, t, n = {}) {
		if (e != null && Number.isFinite(e)) {
			let r = this.getVertices();
			r[e] = t, this.setVertices(r, n);
		}
		return this;
	}
	removeVertexAt(e, t = {}) {
		let n = this.getVertices(), r = e != null && Number.isFinite(e) ? e : -1;
		return n.splice(r, 1), this.setVertices(n, t);
	}
	onVertexsChanged({ previous: e, current: t }) {
		let n = e && t ? t.filter((t) => e.find((e) => I.equals(t, e)) ? null : t) : t ? [...t] : [], r = e && t ? e.filter((e) => t.find((t) => I.equals(e, t)) ? null : e) : e ? [...e] : [];
		n.length > 0 && this.notify("vertexs:added", {
			added: n,
			cell: this,
			edge: this
		}), r.length > 0 && this.notify("vertexs:removed", {
			removed: r,
			cell: this,
			edge: this
		});
	}
	getDefaultMarkup() {
		return this.store.get("defaultMarkup") || Hb.getEdgeMarkup();
	}
	getMarkup() {
		return super.getMarkup() || this.getDefaultMarkup();
	}
	translate(e, t, n = {}) {
		return n.translateBy = n.translateBy || this.id, n.tx = e, n.ty = t, this.applyToPoints((n) => ({
			x: (n.x || 0) + e,
			y: (n.y || 0) + t
		}), n);
	}
	scale(e, t, n, r = {}) {
		return this.applyToPoints((r) => I.create(r).scale(e, t, n).toJSON(), r);
	}
	applyToPoints(e, t = {}) {
		let n = {}, r = this.getSource(), i = this.getTarget();
		I.isPointLike(r) && (n.source = e(r)), I.isPointLike(i) && (n.target = e(i));
		let a = this.getVertices();
		return a.length > 0 && (n.vertices = a.map(e)), this.store.set(n, t), this;
	}
	getBBox() {
		return this.getPolyline().bbox();
	}
	getConnectionPoint() {
		return this.getPolyline().pointAt(.5);
	}
	getPolyline() {
		return new Qu([
			this.getSourcePoint(),
			...this.getVertices().map((e) => I.create(e)),
			this.getTargetPoint()
		]);
	}
	updateParent(e) {
		let t = null, n = this.getSourceCell(), r = this.getTargetCell(), i = this.getParent();
		return n && r && (t = n === r || n.isDescendantOf(r) ? r : r.isDescendantOf(n) ? n : X.getCommonAncestor(n, r)), i && t && t.id !== i.id && i.unembed(this, e), t && (!i || i.id !== t.id) && t.embed(this, e), t;
	}
	hasLoop(e = {}) {
		let t = this.getSource(), n = this.getTarget(), r = t.cell, i = n.cell;
		if (!r || !i) return !1;
		let a = r === i;
		if (!a && e.deep && this._model) {
			let t = this.getSourceCell(), n = this.getTargetCell();
			t && n && (a = t.isAncestorOf(n, e) || n.isAncestorOf(t, e));
		}
		return a;
	}
	getFragmentAncestor() {
		let e = [
			this,
			this.getSourceNode(),
			this.getTargetNode()
		].filter((e) => e != null);
		return this.getCommonAncestor(...e);
	}
	isFragmentDescendantOf(e) {
		let t = this.getFragmentAncestor();
		return !!t && (t.id === e.id || t.isDescendantOf(e));
	}
};
Z.toStringTag = tS, Z.defaultLabel = {
	markup: [{
		tagName: "rect",
		selector: "body"
	}, {
		tagName: "text",
		selector: "label"
	}],
	attrs: {
		text: {
			fill: "#000",
			fontSize: 14,
			textAnchor: "middle",
			textVerticalAnchor: "middle",
			pointerEvents: "none"
		},
		rect: {
			ref: "label",
			fill: "#fff",
			rx: 3,
			ry: 3,
			refWidth: 1,
			refHeight: 1,
			refX: 0,
			refY: 0
		}
	},
	position: { distance: .5 }
}, Z.registry = q.create({
	type: "edge",
	process(e, t) {
		if (Jx(e, !1)) throw Error(`Edge with name '${e}' was registered by anthor Node`);
		if (typeof t == "function") return t.config({ shape: e }), t;
		let n = Z, { inherit: r = "edge" } = t, i = O(t, ["inherit"]);
		if (typeof r == "string") {
			let e = this.get(r || "edge");
			e == null && r ? this.onNotFound(r, "inherited") : n = e;
		} else n = r;
		i.constructorName ?? (i.constructorName = e);
		let a = n.define.call(n, i);
		return a.config({ shape: e }), a;
	}
}), Z.defaults = {}, Yx(Z.registry), Z.config({
	shape: nS,
	propHooks(e) {
		let { label: t, vertices: n } = e, r = O(e, ["label", "vertices"]);
		if (t) {
			r.labels ?? (r.labels = []);
			let e = typeof t == "string" ? Z.parseStringLabel(t) : t;
			r.labels.push(e);
		}
		return n && Array.isArray(n) && (r.vertices = n.map((e) => I.create(e).toJSON())), r;
	}
}), Z.registry.register(nS, Z);
// node_modules/@antv/x6/es/model/collection.js
var aS = class extends xh {
	constructor(e, t = {}) {
		super(), this.length = 0, this.comparator = t.comparator || "zIndex", this.clean(), e && this.reset(e, { silent: !0 });
	}
	toJSON() {
		return this.cells.map((e) => e.toJSON());
	}
	add(e, t, n) {
		let r, i;
		typeof t == "number" ? (r = t, i = Object.assign({ merge: !1 }, n)) : (r = this.length, i = Object.assign({ merge: !1 }, t)), r > this.length && (r = this.length), r < 0 && (r += this.length + 1);
		let a = Array.isArray(e) ? e : [e], o = this.comparator && typeof t != "number" && i.sort !== !1, s = this.comparator || null, c = !1, l = [], u = [];
		return a.forEach((e) => {
			let t = this.get(e);
			t ? i.merge && !e.isSameStore(t) && (t.setProp(e.getProp(), n), u.push(t), o && !c && (c = s == null || typeof s == "function" ? t.hasChanged() : typeof s == "string" ? t.hasChanged(s) : s.some((e) => t.hasChanged(e)))) : (l.push(e), this.reference(e));
		}), l.length && (o && (c = !0), this.cells.splice(r, 0, ...l), this.length = this.cells.length), c && this.sort({ silent: !0 }), i.silent || (l.forEach((e, t) => {
			let n = {
				cell: e,
				index: r + t,
				options: i
			};
			this.trigger("added", n), i.dryrun || e.notify("added", Object.assign({}, n));
		}), c && this.trigger("sorted"), (l.length || u.length) && this.trigger("updated", {
			added: l,
			merged: u,
			removed: [],
			options: i
		})), this;
	}
	remove(e, t = {}) {
		let n = Array.isArray(e) ? e : [e], r = this.removeCells(n, t);
		return !t.silent && r.length > 0 && this.trigger("updated", {
			options: t,
			removed: r,
			added: [],
			merged: []
		}), Array.isArray(e) ? r : r[0];
	}
	removeCells(e, t) {
		let n = [];
		for (let r = 0; r < e.length; r += 1) {
			let i = this.get(e[r]);
			if (i == null) continue;
			let a = this.cells.indexOf(i);
			this.cells.splice(a, 1), --this.length, delete this.map[i.id], n.push(i), this.unreference(i), t.silent || (this.trigger("removed", {
				cell: i,
				index: a,
				options: t
			}), t.dryrun || i.notify("removed", {
				cell: i,
				index: a,
				options: t
			})), t.dryrun || i.remove();
		}
		return n;
	}
	reset(e, t = {}) {
		let n = this.cells.slice();
		if (t.diff || (n.forEach((e) => {
			this.unreference(e), e.remove();
		}), this.clean()), this.add(e, Object.assign({ silent: !0 }, t)), !t.silent) {
			let e = this.cells.slice();
			this.trigger("reseted", {
				options: t,
				previous: n,
				current: e
			});
			let r = [], i = [];
			e.forEach((e) => {
				n.some((t) => t.id === e.id) || r.push(e);
			}), n.forEach((t) => {
				e.some((e) => e.id === t.id) || i.push(t);
			}), this.trigger("updated", {
				options: t,
				added: r,
				removed: i,
				merged: []
			});
		}
		return this;
	}
	push(e, t) {
		return this.add(e, this.length, t);
	}
	pop(e) {
		let t = this.at(this.length - 1);
		return t ? this.remove(t, e) : null;
	}
	unshift(e, t) {
		return this.add(e, 0, t);
	}
	shift(e) {
		let t = this.at(0);
		return t ? this.remove(t, e) : null;
	}
	get(e) {
		if (e == null) return null;
		let t = typeof e == "string" || typeof e == "number" ? e : e.id;
		return this.map[t] || null;
	}
	has(e) {
		return this.get(e) != null;
	}
	at(e) {
		return e < 0 && (e += this.length), this.cells[e] || null;
	}
	first() {
		return this.at(0);
	}
	last() {
		return this.at(-1);
	}
	indexOf(e) {
		return this.cells.indexOf(e);
	}
	toArray() {
		return this.cells.slice();
	}
	sort(e = {}) {
		return this.comparator != null && (this.cells = Bl(this.cells, this.comparator), e.silent || this.trigger("sorted")), this;
	}
	clone() {
		let e = this.constructor;
		return new e(this.cells.slice(), { comparator: this.comparator });
	}
	reference(e) {
		this.map[e.id] = e, e.on("*", this.notifyCellEvent, this);
	}
	unreference(e) {
		e.off("*", this.notifyCellEvent, this), delete this.map[e.id];
	}
	notifyCellEvent(e, t) {
		let n = t.cell;
		this.trigger(`cell:${e}`, t), n && (n.isNode() ? this.trigger(`node:${e}`, Object.assign(Object.assign({}, t), { node: n })) : n.isEdge() && this.trigger(`edge:${e}`, Object.assign(Object.assign({}, t), { edge: n })));
	}
	clean() {
		this.length = 0, this.cells = [], this.map = {};
	}
	dispose() {
		this.reset([]);
	}
};
k([K()], aS.prototype, "dispose", null);
// node_modules/@antv/x6/es/model/model.js
var oS = "X6.Model", sS = class e extends xh {
	static isModel(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== oS || typeof r.addNode != "function" || typeof r.addEdge != "function" || r.collection == null);
	}
	static toJSON(e, t = {}) {
		return { cells: e.map((e) => e.toJSON(t)) };
	}
	static fromJSON(e) {
		let t = [];
		return Array.isArray(e) ? t.push(...e) : (e.cells && t.push(...e.cells), e.nodes && e.nodes.forEach((e) => {
			e.shape ?? (e.shape = "rect"), t.push(e);
		}), e.edges && e.edges.forEach((e) => {
			e.shape ?? (e.shape = "edge"), t.push(e);
		})), t.map((e) => {
			let t = e.shape;
			if (t) {
				if (eS.registry.exist(t)) return eS.create(e);
				if (Z.registry.exist(t)) return Z.create(e);
			}
			throw Error("The `shape` should be specified when creating a node/edge instance");
		});
	}
	constructor(e = []) {
		super(), this.batches = {}, this.addings = /* @__PURE__ */ new WeakMap(), this.nodes = {}, this.edges = {}, this.outgoings = {}, this.incomings = {}, this.collection = new aS(e), this.setup();
	}
	notify(e, t) {
		this.trigger(e, t);
		let n = this.graph;
		return n && (e === "sorted" || e === "reseted" || e === "updated" ? n.trigger(`model:${e}`, t) : n.trigger(e, t)), this;
	}
	setup() {
		let e = this.collection;
		e.on("sorted", () => this.notify("sorted", null)), e.on("updated", (e) => this.notify("updated", e)), e.on("cell:change:zIndex", () => this.sortOnChangeZ()), e.on("added", ({ cell: e }) => {
			this.onCellAdded(e);
		}), e.on("removed", (e) => {
			let t = e.cell;
			this.onCellRemoved(t, e.options), this.notify("cell:removed", e), t.isNode() ? this.notify("node:removed", Object.assign(Object.assign({}, e), { node: t })) : t.isEdge() && this.notify("edge:removed", Object.assign(Object.assign({}, e), { edge: t }));
		}), e.on("reseted", (e) => {
			this.onReset(e.current), this.notify("reseted", e);
		}), e.on("edge:change:source", ({ edge: e }) => this.onEdgeTerminalChanged(e, "source")), e.on("edge:change:target", ({ edge: e }) => {
			this.onEdgeTerminalChanged(e, "target");
		});
	}
	sortOnChangeZ() {
		this.collection.sort();
	}
	onCellAdded(e) {
		let t = e.id;
		e.isEdge() ? (e.updateParent(), this.edges[t] = !0, this.onEdgeTerminalChanged(e, "source"), this.onEdgeTerminalChanged(e, "target")) : this.nodes[t] = !0;
	}
	onCellRemoved(e, t) {
		let n = e.id;
		if (e.isEdge()) {
			delete this.edges[n];
			let t = e.getSource(), r = e.getTarget();
			if (t?.cell) {
				let e = this.outgoings[t.cell], r = e ? e.indexOf(n) : -1;
				r >= 0 && (e.splice(r, 1), e.length === 0 && delete this.outgoings[t.cell]);
			}
			if (r?.cell) {
				let e = this.incomings[r.cell], t = e ? e.indexOf(n) : -1;
				t >= 0 && (e.splice(t, 1), e.length === 0 && delete this.incomings[r.cell]);
			}
		} else delete this.nodes[n];
		t.clear || (t.disconnectEdges ? this.disconnectConnectedEdges(e, t) : this.removeConnectedEdges(e, t)), e.model === this && (e.model = null);
	}
	onReset(e) {
		this.nodes = {}, this.edges = {}, this.outgoings = {}, this.incomings = {}, e.forEach((e) => {
			this.onCellAdded(e);
		});
	}
	onEdgeTerminalChanged(e, t) {
		let n = t === "source" ? this.outgoings : this.incomings, r = e.previous(t);
		if (r?.cell) {
			let t = X.isCell(r.cell) ? r.cell.id : r.cell, i = n[t], a = i ? i.indexOf(e.id) : -1;
			a >= 0 && (i.splice(a, 1), i.length === 0 && delete n[t]);
		}
		let i = e.getTerminal(t);
		if (i?.cell) {
			let t = X.isCell(i.cell) ? i.cell.id : i.cell, r = n[t] || [];
			r.indexOf(e.id) === -1 && r.push(e.id), n[t] = r;
		}
	}
	prepareCell(e, t) {
		return e.model || t && t.dryrun || (e.model = this), e.zIndex ?? e.setZIndex(this.getMaxZIndex() + 1, { silent: !0 }), e;
	}
	resetCells(e, t = {}) {
		return e.map((e) => this.prepareCell(e, Object.assign(Object.assign({}, t), { dryrun: !0 }))), this.collection.reset(e, t), e.map((e) => this.prepareCell(e, { options: t })), this;
	}
	clear(e = {}) {
		let t = this.getCells();
		if (t.length === 0) return this;
		let n = Object.assign(Object.assign({}, e), { clear: !0 });
		return this.batchUpdate("clear", () => {
			let e = t.sort((e, t) => (e.isEdge() ? 1 : 2) - (t.isEdge() ? 1 : 2));
			for (; e.length > 0;) {
				let t = e.shift();
				t && t.remove(n);
			}
		}, n), this;
	}
	addNode(e, t = {}) {
		let n = eS.isNode(e) ? e : this.createNode(e);
		return this.addCell(n, t), n;
	}
	updateNode(e, t = {}) {
		let n = this.createNode(e), r = n.getProp();
		return n.dispose(), this.updateCell(r, t);
	}
	createNode(e) {
		return eS.create(e);
	}
	addEdge(e, t = {}) {
		let n = Z.isEdge(e) ? e : this.createEdge(e);
		return this.addCell(n, t), n;
	}
	createEdge(e) {
		return Z.create(e);
	}
	updateEdge(e, t = {}) {
		let n = this.createEdge(e), r = n.getProp();
		return n.dispose(), this.updateCell(r, t);
	}
	addCell(e, t = {}) {
		return Array.isArray(e) ? this.addCells(e, t) : (!this.collection.has(e) && !this.addings.has(e) && (this.addings.set(e, !0), this.collection.add(this.prepareCell(e, t), t), e.eachChild((e) => this.addCell(e, t)), this.addings.delete(e)), this);
	}
	addCells(e, t = {}) {
		let n = e.length;
		if (n === 0) return this;
		let r = Object.assign(Object.assign({}, t), {
			position: n - 1,
			maxPosition: n - 1
		});
		return this.startBatch("add", Object.assign(Object.assign({}, r), { cells: e })), e.forEach((e) => {
			this.addCell(e, r), --r.position;
		}), this.stopBatch("add", Object.assign(Object.assign({}, r), { cells: e })), this;
	}
	updateCell(e, t = {}) {
		let n = e.id && this.getCell(e.id);
		return n ? this.batchUpdate("update", () => (Object.entries(e).forEach(([e, r]) => {
			n.setProp(e, r, t);
		}), !0), e) : !1;
	}
	removeCell(e, t = {}) {
		let n = typeof e == "string" ? this.getCell(e) : e;
		return n && this.has(n) ? this.collection.remove(n, t) : null;
	}
	updateCellId(e, t) {
		if (e.id === t) return;
		this.startBatch("update", { id: t }), e.prop("id", t);
		let n = e.clone({ keepId: !0 });
		return this.addCell(n), this.getConnectedEdges(e).forEach((n) => {
			let r = n.getSourceCell(), i = n.getTargetCell();
			r === e && n.setSource(Object.assign(Object.assign({}, n.getSource()), { cell: t })), i === e && n.setTarget(Object.assign(Object.assign({}, n.getTarget()), { cell: t }));
		}), this.removeCell(e), this.stopBatch("update", { id: t }), n;
	}
	removeCells(e, t = {}) {
		return e.length ? this.batchUpdate("remove", () => e.map((e) => this.removeCell(e, t))) : [];
	}
	removeConnectedEdges(e, t = {}) {
		let n = this.getConnectedEdges(e);
		return n.forEach((e) => {
			e.remove(t);
		}), n;
	}
	disconnectConnectedEdges(e, t = {}) {
		let n = typeof e == "string" ? e : e.id;
		this.getConnectedEdges(e).forEach((e) => {
			let r = e.getSourceCellId(), i = e.getTargetCellId();
			r === n && e.setSource({
				x: 0,
				y: 0
			}, t), i === n && e.setTarget({
				x: 0,
				y: 0
			}, t);
		});
	}
	has(e) {
		return this.collection.has(e);
	}
	total() {
		return this.collection.length;
	}
	indexOf(e) {
		return this.collection.indexOf(e);
	}
	getCell(e) {
		return this.collection.get(e);
	}
	getCells() {
		return this.collection.toArray();
	}
	getFirstCell() {
		return this.collection.first();
	}
	getLastCell() {
		return this.collection.last();
	}
	getMinZIndex() {
		let e = this.collection.first();
		return e && e.getZIndex() || 0;
	}
	getMaxZIndex() {
		let e = this.collection.last();
		return e && e.getZIndex() || 0;
	}
	getCellsFromCache(e) {
		return e ? Object.keys(e).map((e) => this.getCell(e)).filter((e) => e != null) : [];
	}
	getNodes() {
		return this.getCellsFromCache(this.nodes);
	}
	getEdges() {
		return this.getCellsFromCache(this.edges);
	}
	getOutgoingEdges(e) {
		let t = typeof e == "string" ? e : e.id, n = this.outgoings[t];
		return n ? n.map((e) => this.getCell(e)).filter((e) => e?.isEdge()) : null;
	}
	getIncomingEdges(e) {
		let t = typeof e == "string" ? e : e.id, n = this.incomings[t];
		return n ? n.map((e) => this.getCell(e)).filter((e) => e?.isEdge()) : null;
	}
	getConnectedEdges(e, t = {}) {
		let n = [], r = typeof e == "string" ? this.getCell(e) : e;
		if (r == null) return n;
		let i = {}, a = t.indirect, o = t.incoming, s = t.outgoing;
		o == null && s == null && (o = s = !0);
		let c = (e, t) => {
			if ((t ? this.getOutgoingEdges(e) : this.getIncomingEdges(e))?.forEach((e) => {
				i[e.id] || (n.push(e), i[e.id] = !0, a && (o && c(e, !1), s && c(e, !0)));
			}), a && e.isEdge()) {
				let r = t ? e.getTargetCell() : e.getSourceCell();
				r?.isEdge() && (i[r.id] || (n.push(r), c(r, t)));
			}
		};
		if (s && c(r, !0), o && c(r, !1), t.deep) {
			let e = r.getDescendants({ deep: !0 }), a = {};
			e.forEach((e) => {
				e.isNode() && (a[e.id] = !0);
			});
			let c = (e, r) => {
				(r ? this.getOutgoingEdges(e.id) : this.getIncomingEdges(e.id))?.forEach((e) => {
					if (!i[e.id]) {
						let r = e.getSourceCell(), o = e.getTargetCell();
						if (!t.enclosed && r && a[r.id] && o && a[o.id]) return;
						n.push(e), i[e.id] = !0;
					}
				});
			};
			e.forEach((e) => {
				e.isEdge() || (s && c(e, !0), o && c(e, !1));
			});
		}
		return n;
	}
	isBoundary(e, t) {
		let n = typeof e == "string" ? this.getCell(e) : e, r = t ? this.getIncomingEdges(n) : this.getOutgoingEdges(n);
		return r == null || r.length === 0;
	}
	getBoundaryNodes(e) {
		let t = [];
		return Object.keys(this.nodes).forEach((n) => {
			if (this.isBoundary(n, e)) {
				let e = this.getCell(n);
				e && t.push(e);
			}
		}), t;
	}
	getRoots() {
		return this.getBoundaryNodes(!0);
	}
	getLeafs() {
		return this.getBoundaryNodes(!1);
	}
	isRoot(e) {
		return this.isBoundary(e, !0);
	}
	isLeaf(e) {
		return this.isBoundary(e, !1);
	}
	getNeighbors(e, t = {}) {
		let n = t.incoming, r = t.outgoing;
		n == null && r == null && (n = r = !0);
		let i = this.getConnectedEdges(e, t).reduce((i, a) => {
			let o = a.hasLoop(t), s = a.getSourceCell(), c = a.getTargetCell();
			return n && s && s.isNode() && !i[s.id] && (!o && (s === e || t.deep && s.isDescendantOf(e)) || (i[s.id] = s)), r && c && c.isNode() && !i[c.id] && (!o && (c === e || t.deep && c.isDescendantOf(e)) || (i[c.id] = c)), i;
		}, {});
		if (e.isEdge()) {
			if (n) {
				let t = e.getSourceCell();
				t?.isNode() && !i[t.id] && (i[t.id] = t);
			}
			if (r) {
				let t = e.getTargetCell();
				t?.isNode() && !i[t.id] && (i[t.id] = t);
			}
		}
		return Object.keys(i).map((e) => i[e]);
	}
	isNeighbor(e, t, n = {}) {
		let r = n.incoming, i = n.outgoing;
		return r == null && i == null && (r = i = !0), this.getConnectedEdges(e, n).some((e) => {
			let n = e.getSourceCell(), a = e.getTargetCell();
			return !!(r && n && n.id === t.id || i && a && a.id === t.id);
		});
	}
	getSuccessors(e, t = {}) {
		let n = [];
		return this.search(e, (r, i) => {
			r !== e && this.matchDistance(i, t.distance) && n.push(r);
		}, Object.assign(Object.assign({}, t), { outgoing: !0 })), n;
	}
	isSuccessor(e, t, n = {}) {
		let r = !1;
		return this.search(e, (i, a) => {
			if (i === t && i !== e && this.matchDistance(a, n.distance)) return r = !0, !1;
		}, Object.assign(Object.assign({}, n), { outgoing: !0 })), r;
	}
	getPredecessors(e, t = {}) {
		let n = [];
		return this.search(e, (r, i) => {
			r !== e && this.matchDistance(i, t.distance) && n.push(r);
		}, Object.assign(Object.assign({}, t), { incoming: !0 })), n;
	}
	isPredecessor(e, t, n = {}) {
		let r = !1;
		return this.search(e, (i, a) => {
			if (i === t && i !== e && this.matchDistance(a, n.distance)) return r = !0, !1;
		}, Object.assign(Object.assign({}, n), { incoming: !0 })), r;
	}
	matchDistance(e, t) {
		return t == null ? !0 : typeof t == "function" ? t(e) : Array.isArray(t) && t.includes(e) ? !0 : e === t;
	}
	getCommonAncestor(...e) {
		let t = [];
		return e.forEach((e) => {
			e && (Array.isArray(e) ? t.push(...e) : t.push(e));
		}), X.getCommonAncestor(...t);
	}
	getSubGraph(e, t = {}) {
		let n = [], r = {}, i = [], a = [], o = (e) => {
			r[e.id] || (n.push(e), r[e.id] = e, e.isEdge() && a.push(e), e.isNode() && i.push(e));
		};
		return e.forEach((e) => {
			o(e), t.deep && e.getDescendants({ deep: !0 }).forEach((e) => {
				o(e);
			});
		}), a.forEach((e) => {
			let t = e.getSourceCell(), a = e.getTargetCell();
			t && !r[t.id] && (n.push(t), r[t.id] = t, t.isNode() && i.push(t)), a && !r[a.id] && (n.push(a), r[a.id] = a, a.isNode() && i.push(a));
		}), i.forEach((e) => {
			this.getConnectedEdges(e, t).forEach((e) => {
				let t = e.getSourceCell(), i = e.getTargetCell();
				!r[e.id] && t && r[t.id] && i && r[i.id] && (n.push(e), r[e.id] = e);
			});
		}), n;
	}
	cloneSubGraph(e, t = {}) {
		let n = this.getSubGraph(e, t);
		return this.cloneCells(n);
	}
	cloneCells(e) {
		return X.cloneCells(e);
	}
	getNodesFromPoint(e, t) {
		let n = typeof e == "number" ? {
			x: e,
			y: t || 0
		} : e;
		return this.getNodes().filter((e) => e.getBBox().containsPoint(n));
	}
	getNodesInArea(e, t, n, r, i) {
		let a = typeof e == "number" ? new L(e, t, n, r) : L.create(e), o = (typeof e == "number" ? i : t)?.strict;
		return this.getNodes().filter((e) => {
			let t = e.angle(), n = e.getBBox().bbox(t);
			return o ? a.containsRect(n) : a.isIntersectWithRect(n);
		});
	}
	getEdgesInArea(e, t, n, r, i) {
		let a = typeof e == "number" ? new L(e, t, n, r) : L.create(e), o = (typeof e == "number" ? i : t)?.strict;
		return this.getEdges().filter((e) => {
			let t = e.getBBox();
			return t.width === 0 ? t.inflate(1, 0) : t.height === 0 && t.inflate(0, 1), o ? a.containsRect(t) : a.isIntersectWithRect(t);
		});
	}
	getNodesUnderNode(e, t = {}) {
		let n = e.getBBox();
		return (t.by == null || t.by === "bbox" ? this.getNodesInArea(n) : this.getNodesFromPoint(n[t.by])).filter((t) => e.id !== t.id && !t.isDescendantOf(e));
	}
	getAllCellsBBox() {
		return this.getCellsBBox(this.getCells());
	}
	getCellsBBox(e, t = {}) {
		return X.getCellsBBox(e, t);
	}
	search(e, t, n = {}) {
		n.breadthFirst ? this.breadthFirstSearch(e, t, n) : this.depthFirstSearch(e, t, n);
	}
	breadthFirstSearch(e, t, n = {}) {
		let r = [], i = {}, a = {};
		for (r.push(e), a[e.id] = 0; r.length > 0;) {
			let e = r.shift();
			e == null || i[e.id] || (i[e.id] = !0, F(t, this, e, a[e.id]) !== !1 && this.getNeighbors(e, n).forEach((t) => {
				a[t.id] = a[e.id] + 1, r.push(t);
			}));
		}
	}
	depthFirstSearch(e, t, n = {}) {
		let r = [], i = {}, a = {};
		for (r.push(e), a[e.id] = 0; r.length > 0;) {
			let e = r.pop();
			if (e == null || i[e.id] || (i[e.id] = !0, F(t, this, e, a[e.id]) === !1)) continue;
			let o = this.getNeighbors(e, n), s = r.length;
			o.forEach((t) => {
				a[t.id] = a[e.id] + 1, r.splice(s, 0, t);
			});
		}
	}
	getShortestPath(e, t, n = {}) {
		let r = {};
		this.getEdges().forEach((e) => {
			let t = e.getSourceCellId(), i = e.getTargetCellId();
			t && i && (r[t] || (r[t] = []), r[i] || (r[i] = []), r[t].push(i), n.directed || r[i].push(t));
		});
		let i = Om(r, typeof e == "string" ? e : e.id, n.weight), a = [], o = typeof t == "string" ? t : t.id;
		for (i[o] && a.push(o); i[o];) {
			let e = i[o];
			a.unshift(e), o = e;
		}
		return a;
	}
	translate(e, t, n) {
		return this.getCells().filter((e) => !e.hasParent()).forEach((r) => {
			r.translate(e, t, n);
		}), this;
	}
	resize(e, t, n) {
		return this.resizeCells(e, t, this.getCells(), n);
	}
	resizeCells(e, t, n, r = {}) {
		let i = this.getCellsBBox(n);
		if (i) {
			let a = Math.max(e / i.width, 0), o = Math.max(t / i.height, 0), s = i.getOrigin();
			n.forEach((e) => {
				e.scale(a, o, s, r);
			});
		}
		return this;
	}
	toJSON(t = {}) {
		return e.toJSON(this.getCells(), t);
	}
	parseJSON(t) {
		return e.fromJSON(t);
	}
	fromJSON(e, t = {}) {
		let n = [];
		if (!t.diff) n = this.parseJSON(e);
		else {
			let t = e, { nodes: r = [], edges: i = [] } = t, a = O(t, ["nodes", "edges"]), o = r.filter((e) => !this.nodes[e.id]) || [], s = i.filter((e) => !this.edges[e.id]) || [];
			n = this.parseJSON(Object.assign(Object.assign({}, a), {
				nodes: o,
				edges: s
			}));
		}
		return this.resetCells(n, t), this;
	}
	startBatch(e, t = {}) {
		return this.batches[e] = (this.batches[e] || 0) + 1, this.notify("batch:start", {
			name: e,
			data: t
		}), this;
	}
	stopBatch(e, t = {}) {
		return this.batches[e] = (this.batches[e] || 0) - 1, this.notify("batch:stop", {
			name: e,
			data: t
		}), this;
	}
	batchUpdate(e, t, n = {}) {
		this.startBatch(e, n);
		let r = t();
		return this.stopBatch(e, n), r;
	}
	hasActiveBatch(e = Object.keys(this.batches)) {
		return (Array.isArray(e) ? e : [e]).some((e) => this.batches[e] > 0);
	}
	dispose() {
		this.collection.dispose();
	}
};
k([K()], sS.prototype, "dispose", null);
// node_modules/@antv/x6/es/shape/base.js
var cS = {
	fill: "#ffffff",
	stroke: "#333333",
	strokeWidth: 2
}, lS = {
	fontSize: 14,
	fill: "#000000",
	refX: .5,
	refY: .5,
	textAnchor: "middle",
	textVerticalAnchor: "middle",
	fontFamily: "Arial, helvetica, sans-serif"
}, uS = class extends eS {
	get label() {
		return this.getLabel();
	}
	set label(e) {
		this.setLabel(e);
	}
	getLabel() {
		return this.getAttrByPath("text/text");
	}
	setLabel(e, t) {
		return e == null ? this.removeLabel() : this.setAttrByPath("text/text", e, t), this;
	}
	removeLabel() {
		return this.removeAttrByPath("text/text"), this;
	}
};
uS.config({
	attrs: { text: Object.assign({}, lS) },
	propHooks(e) {
		let { label: t } = e, n = O(e, ["label"]);
		return t != null && Lf(n, "attrs/text/text", t), n;
	},
	visible: !0
});
// node_modules/@antv/x6/es/shape/util.js
function dS(e, t = "body") {
	return [{
		tagName: e,
		selector: t
	}, {
		tagName: "text",
		selector: "label"
	}];
}
function fS(e = "xlink:href") {
	return (t) => {
		let { imageUrl: n, imageWidth: r, imageHeight: i } = t, a = O(t, [
			"imageUrl",
			"imageWidth",
			"imageHeight"
		]);
		if (n != null || r != null || i != null) {
			let t = () => {
				if (a.attrs) {
					let t = a.attrs.image;
					n != null && (t[e] = n), r != null && (t.width = r), i != null && (t.height = i), a.attrs.image = t;
				}
			};
			a.attrs ? (a.attrs.image ?? (a.attrs.image = {}), t()) : (a.attrs = { image: {} }, t());
		}
		return a;
	};
}
function pS(e, t, n = {}) {
	let r = {
		constructorName: e,
		markup: dS(e, n.selector),
		attrs: { [e]: Object.assign({}, cS) }
	};
	return (n.parent || uS).define(P(r, t, { shape: e }));
}
function mS(e) {
	return typeof e == "string" ? e : e.map((e) => Array.isArray(e) ? e.join(",") : I.isPointLike(e) ? `${e.x}, ${e.y}` : "").join(" ");
}
pS("circle", { attrs: { body: {
	refCx: "50%",
	refCy: "50%",
	refR: "50%"
} } });
// node_modules/@antv/x6/es/shape/edge.js
var hS = Z.define({
	shape: "edge",
	markup: [{
		tagName: "path",
		selector: "wrap",
		groupSelector: "lines",
		attrs: {
			fill: "none",
			cursor: "pointer",
			stroke: "transparent",
			strokeLinecap: "round"
		}
	}, {
		tagName: "path",
		selector: "line",
		groupSelector: "lines",
		attrs: {
			fill: "none",
			pointerEvents: "none"
		}
	}],
	attrs: {
		lines: {
			connection: !0,
			strokeLinejoin: "round"
		},
		wrap: { strokeWidth: 10 },
		line: {
			stroke: "#333",
			strokeWidth: 2,
			targetMarker: "classic"
		}
	}
});
pS("ellipse", { attrs: { body: {
	refCx: "50%",
	refCy: "50%",
	refRx: "50%",
	refRy: "50%"
} } });
// node_modules/@antv/x6/es/graph/base.js
var gS = class extends bh {
	get options() {
		return this.graph.options;
	}
	get model() {
		return this.graph.model;
	}
	get view() {
		return this.graph.view;
	}
	constructor(e) {
		super(), this.graph = e, this.init();
	}
	init() {}
}, _S = {
	mousemove: "onMouseMove",
	touchmove: "onMouseMove",
	mouseup: "onMouseUp",
	touchend: "onMouseUp",
	touchcancel: "onDragEnd"
}, vS = 1 << 30, yS = class e extends nx {
	constructor() {
		super(...arguments), this.portsCache = {};
	}
	static isNodeView(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== bS || typeof r.isNodeView != "function" || typeof r.isEdgeView != "function" || typeof r.confirmUpdate != "function" || typeof r.update != "function" || typeof r.findPortElem != "function" || typeof r.resize != "function" || typeof r.rotate != "function" || typeof r.translate != "function");
	}
	get [Symbol.toStringTag]() {
		return bS;
	}
	getContainerClassName() {
		let e = [super.getContainerClassName(), this.prefixClassName("node")];
		return this.can("nodeMovable") || e.push(this.prefixClassName("node-immovable")), e.join(" ");
	}
	updateClassName(e) {
		let t = e.target;
		if (t.hasAttribute("magnet")) {
			let e = this.prefixClassName("port-unconnectable");
			this.can("magnetConnectable") ? V(t, e) : B(t, e);
		} else {
			let e = this.prefixClassName("node-immovable");
			this.can("nodeMovable") ? this.removeClass(e) : this.addClass(e);
		}
	}
	isNodeView() {
		return !0;
	}
	confirmUpdate(e, t = {}) {
		let n = e, r = this.hasAction(e, [
			"resize",
			"translate",
			"rotate"
		]);
		return this.hasAction(n, "ports") && (this.removePorts(), this.cleanPortsCache()), this.hasAction(n, "render") ? (this.render(), n = this.removeAction(n, [
			"render",
			"update",
			"resize",
			"translate",
			"rotate",
			"ports",
			"tools"
		])) : (n = this.handleAction(n, "resize", () => this.resize(), "update"), n = this.handleAction(n, "update", () => this.update(), J.useCSSSelector ? "ports" : null), n = this.handleAction(n, "translate", () => this.translate()), n = this.handleAction(n, "rotate", () => this.rotate()), n = this.handleAction(n, "ports", () => this.renderPorts()), n = this.handleAction(n, "tools", () => {
			let e = this.cell.getTools() != null;
			!r || this.tools == null || !e ? this.renderTools() : this.updateTools(t);
		})), n;
	}
	update(e) {
		this.cleanCache(), J.useCSSSelector && this.removePorts();
		let t = this.cell, n = t.getSize(), r = t.getAttrs();
		this.updateAttrs(this.container, r, {
			attrs: e === r ? null : e,
			rootBBox: new L(0, 0, n.width, n.height),
			selectors: this.selectors
		}), J.useCSSSelector && this.renderPorts();
	}
	renderMarkup() {
		let e = this.cell.markup;
		if (e) {
			if (typeof e == "string") throw TypeError("Not support string markup.");
			return this.renderJSONMarkup(e);
		}
		throw TypeError("Invalid node markup.");
	}
	renderJSONMarkup(e) {
		let t = this.parseJSONMarkup(e, this.container);
		this.selectors = t.selectors, this.container.appendChild(t.fragment);
	}
	render() {
		return this.empty(), this.renderMarkup(), this.resize(), this.updateTransform(), J.useCSSSelector || this.renderPorts(), this.renderTools(), this.notify("view:render", { view: this }), this;
	}
	resize() {
		this.cell.getAngle() && this.rotate(), this.update();
	}
	translate() {
		this.updateTransform();
	}
	rotate() {
		this.updateTransform();
	}
	getTranslationString() {
		let e = this.cell.getPosition();
		return `translate(${e.x},${e.y})`;
	}
	getRotationString() {
		let e = this.cell.getAngle();
		if (e) {
			let t = this.cell.getSize();
			return `rotate(${e},${t.width / 2},${t.height / 2})`;
		}
	}
	updateTransform() {
		let e = this.getTranslationString(), t = this.getRotationString();
		t && (e += ` ${t}`), this.container.setAttribute("transform", e);
	}
	findPortElem(e, t) {
		let n = e ? this.portsCache[e] : null;
		if (!n) return null;
		let r = n.portContentElement, i = n.portContentSelectors || {};
		return this.findOne(t, r, i);
	}
	cleanPortsCache() {
		this.portsCache = {};
	}
	removePorts() {
		Object.values(this.portsCache).forEach((e) => {
			Ld(e.portElement);
		});
	}
	renderPorts() {
		let e = this.container, t = [];
		e.childNodes.forEach((e) => {
			t.push(e);
		});
		let n = _l(this.cell.getParsedPorts(), "zIndex"), r = "auto";
		n[r] && n[r].forEach((n) => {
			let r = this.getPortElement(n);
			e.append(r), t.push(r);
		}), Object.keys(n).forEach((e) => {
			if (e !== r) {
				let r = parseInt(e, 10);
				this.appendPorts(n[e], r, t);
			}
		}), this.updatePorts(), this.cleanCache(), this.updateConnectedEdges();
	}
	updateConnectedEdges() {
		let e = this.graph, t = this.cell, n = e.model.getConnectedEdges(t);
		for (let r = 0, i = n.length; r < i; r += 1) {
			let i = n[r], a = i.findView(e);
			if (!a || !e.renderer.isViewMounted(a)) continue;
			let o = ["update"];
			i.getSourceCell() === t && o.push("source"), i.getTargetCell() === t && o.push("target"), e.renderer.requestViewUpdate(a, a.getFlag(o));
		}
	}
	appendPorts(e, t, n) {
		let r = e.map((e) => this.getPortElement(e));
		n[t] || t < 0 ? Vd(n[Math.max(t, 0)], r) : zd(this.container, r);
	}
	getPortElement(e) {
		let t = this.portsCache[e.id];
		return t ? t.portElement : this.createPortElement(e);
	}
	createPortElement(e) {
		let t = Hb.renderMarkup(this.cell.getPortContainerMarkup()), n = t.elem;
		if (n == null) throw Error("Invalid port container markup.");
		t = Hb.renderMarkup(this.getPortMarkup(e));
		let r = t.elem, i = t.selectors;
		if (r == null) throw Error("Invalid port markup.");
		this.setAttrs({
			port: e.id,
			"port-group": e.group
		}, r);
		let a = "x6-port";
		e.group && (a += ` x6-port-${e.group}`), B(n, a), B(n, "x6-port"), B(r, "x6-port-body"), n.appendChild(r);
		let o = i, s, c;
		if (this.existPortLabel(e)) {
			if (t = Hb.renderMarkup(this.getPortLabelMarkup(e.label)), s = t.elem, c = t.selectors, s == null) throw Error("Invalid port label markup.");
			if (i && c) {
				for (let e in c) if (i[e] && e !== this.rootSelector) throw Error("Selectors within port must be unique.");
				o = Object.assign(Object.assign({}, i), c);
			}
			B(s, "x6-port-label"), n.appendChild(s);
		}
		return this.portsCache[e.id] = {
			portElement: n,
			portSelectors: o,
			portLabelElement: s,
			portLabelSelectors: c,
			portContentElement: r,
			portContentSelectors: i
		}, this.graph.options.onPortRendered && this.graph.options.onPortRendered({
			port: e,
			node: this.cell,
			container: n,
			selectors: o,
			labelContainer: s,
			labelSelectors: c,
			contentContainer: r,
			contentSelectors: i
		}), n;
	}
	updatePorts() {
		let e = this.cell.getParsedGroups(), t = Object.keys(e);
		t.length === 0 ? this.updatePortGroup() : t.forEach((e) => {
			this.updatePortGroup(e);
		});
	}
	updatePortGroup(e) {
		let t = L.fromSize(this.cell.getSize()), n = this.cell.getPortsLayoutByGroup(e, t);
		for (let e = 0, t = n.length; e < t; e += 1) {
			let t = n[e], r = t.portId, i = this.portsCache[r] || {}, a = t.portLayout;
			if (this.applyPortTransform(i.portElement, a), t.portAttrs != null) {
				let e = { selectors: i.portSelectors || {} };
				t.portSize && (e.rootBBox = L.fromSize(t.portSize)), this.updateAttrs(i.portElement, t.portAttrs, e);
			}
			let o = t.labelLayout;
			if (o && i.portLabelElement && (this.applyPortTransform(i.portLabelElement, o, -(a.angle || 0)), o.attrs)) {
				let e = { selectors: i.portLabelSelectors || {} };
				t.labelSize && (e.rootBBox = L.fromSize(t.labelSize)), this.updateAttrs(i.portLabelElement, o.attrs, e);
			}
		}
	}
	applyPortTransform(e, t, n = 0) {
		let r = t.angle, i = t.position;
		Tp(e, hp().rotate(n).translate(i.x || 0, i.y || 0).rotate(r || 0), { absolute: !0 });
	}
	getPortMarkup(e) {
		return e.markup || this.cell.portMarkup;
	}
	getPortLabelMarkup(e) {
		return e.markup || this.cell.portLabelMarkup;
	}
	existPortLabel(e) {
		return e.attrs && e.attrs.text;
	}
	getEventArgs(e, t, n) {
		let r = this, i = r.cell, a = i;
		return t == null || n == null ? {
			e,
			view: r,
			node: i,
			cell: a
		} : {
			e,
			x: t,
			y: n,
			view: r,
			node: i,
			cell: a
		};
	}
	getPortEventArgs(e, t, n) {
		let r = this, i = r.cell, a = i;
		return n ? {
			e,
			x: n.x,
			y: n.y,
			view: r,
			node: i,
			cell: a,
			port: t
		} : {
			e,
			view: r,
			node: i,
			cell: a,
			port: t
		};
	}
	notifyMouseDown(e, t, n) {
		super.onMouseDown(e, t, n), this.notify("node:mousedown", this.getEventArgs(e, t, n));
	}
	notifyMouseMove(e, t, n) {
		super.onMouseMove(e, t, n), this.notify("node:mousemove", this.getEventArgs(e, t, n));
	}
	notifyMouseUp(e, t, n) {
		super.onMouseUp(e, t, n), this.notify("node:mouseup", this.getEventArgs(e, t, n));
	}
	notifyPortEvent(e, t, n) {
		let r = this.findAttr("port", t.target);
		if (r) {
			let i = t.type;
			e === "node:port:mouseenter" ? t.type = "mouseenter" : e === "node:port:mouseleave" && (t.type = "mouseleave"), this.notify(e, this.getPortEventArgs(t, r, n)), t.type = i;
		}
	}
	onClick(e, t, n) {
		super.onClick(e, t, n), this.notify("node:click", this.getEventArgs(e, t, n)), this.notifyPortEvent("node:port:click", e, {
			x: t,
			y: n
		});
	}
	onDblClick(e, t, n) {
		super.onDblClick(e, t, n), this.notify("node:dblclick", this.getEventArgs(e, t, n)), this.notifyPortEvent("node:port:dblclick", e, {
			x: t,
			y: n
		});
	}
	onContextMenu(e, t, n) {
		super.onContextMenu(e, t, n), this.notify("node:contextmenu", this.getEventArgs(e, t, n)), this.notifyPortEvent("node:port:contextmenu", e, {
			x: t,
			y: n
		});
	}
	onMouseDown(e, t, n) {
		this.isPropagationStopped(e) || (this.notifyMouseDown(e, t, n), this.notifyPortEvent("node:port:mousedown", e, {
			x: t,
			y: n
		}), this.startNodeDragging(e, t, n));
	}
	onMouseMove(e, t, n) {
		let r = this.getEventData(e), i = r.action;
		if (i === "magnet") this.dragMagnet(e, t, n);
		else {
			if (i === "move") {
				let i = r.targetView || this;
				i.dragNode(e, t, n), i.notify("node:moving", {
					e,
					x: t,
					y: n,
					view: i,
					cell: i.cell,
					node: i.cell
				});
			}
			this.notifyMouseMove(e, t, n), this.notifyPortEvent("node:port:mousemove", e, {
				x: t,
				y: n
			});
		}
		this.setEventData(e, r);
	}
	onMouseUp(e, t, n) {
		let r = this.getEventData(e), i = r.action;
		i === "magnet" ? this.stopMagnetDragging(e, t, n) : (this.notifyMouseUp(e, t, n), this.notifyPortEvent("node:port:mouseup", e, {
			x: t,
			y: n
		}), i === "move" && (r.targetView || this).stopNodeDragging(e, t, n));
		let a = r.targetMagnet;
		a && this.onMagnetClick(e, a, t, n), this.checkMouseleave(e);
	}
	onMouseOver(e) {
		super.onMouseOver(e), this.notify("node:mouseover", this.getEventArgs(e)), this.notifyPortEvent("node:port:mouseenter", e), this.notifyPortEvent("node:port:mouseover", e);
	}
	onMouseOut(e) {
		super.onMouseOut(e), this.notify("node:mouseout", this.getEventArgs(e)), this.notifyPortEvent("node:port:mouseleave", e), this.notifyPortEvent("node:port:mouseout", e);
	}
	onMouseEnter(e) {
		this.updateClassName(e), super.onMouseEnter(e), this.notify("node:mouseenter", this.getEventArgs(e));
	}
	onMouseLeave(e) {
		super.onMouseLeave(e), this.notify("node:mouseleave", this.getEventArgs(e));
	}
	onMouseWheel(e, t, n, r) {
		super.onMouseWheel(e, t, n, r), this.notify("node:mousewheel", Object.assign({ delta: r }, this.getEventArgs(e, t, n)));
	}
	onMagnetClick(e, t, n, r) {
		let i = this.graph;
		i.view.getMouseMovedCount(e) > i.options.clickThreshold || this.notify("node:magnet:click", Object.assign({ magnet: t }, this.getEventArgs(e, n, r)));
	}
	onMagnetDblClick(e, t, n, r) {
		this.notify("node:magnet:dblclick", Object.assign({ magnet: t }, this.getEventArgs(e, n, r)));
	}
	onMagnetContextMenu(e, t, n, r) {
		this.notify("node:magnet:contextmenu", Object.assign({ magnet: t }, this.getEventArgs(e, n, r)));
	}
	onMagnetMouseDown(e, t, n, r) {
		this.startMagnetDragging(e, n, r);
	}
	onCustomEvent(e, t, n, r) {
		this.notify("node:customevent", Object.assign({ name: t }, this.getEventArgs(e, n, r))), super.onCustomEvent(e, t, n, r);
	}
	prepareEmbedding(e) {
		let t = this.graph, n = this.getEventData(e).cell || this.cell, r = t.findViewByCell(n), i = t.snapToGrid(e.clientX, e.clientY);
		this.notify("node:embed", {
			e,
			node: n,
			view: r,
			cell: n,
			x: i.x,
			y: i.y,
			currentParent: n.getParent()
		});
	}
	processEmbedding(e, t) {
		let n = t.cell || this.cell, r = t.graph || this.graph, i = r.options.embedding, a = i.findParent, o = typeof a == "function" ? F(a, r, {
			view: this,
			node: this.cell
		}).filter((e) => X.isCell(e) && this.cell.id !== e.id && !e.isDescendantOf(this.cell)) : r.model.getNodesUnderNode(n, { by: a });
		if (i.frontOnly && o.length > 0) {
			let e = _l(o, "zIndex"), t = jl(Object.keys(e).map((e) => parseInt(e, 10)));
			t && (o = e[t]);
		}
		o = o.filter((e) => e.visible);
		let s = null, c = t.candidateEmbedView, l = i.validate;
		for (let e = o.length - 1; e >= 0; --e) {
			let t = o[e];
			if (c && c.cell.id === t.id) {
				s = c;
				break;
			}
			{
				let e = t.findView(r);
				if (l && F(l, r, {
					child: this.cell,
					parent: e.cell,
					childView: this,
					parentView: e
				})) {
					s = e;
					break;
				}
			}
		}
		this.clearEmbedding(t), s && s.highlight(null, { type: "embedding" }), t.candidateEmbedView = s;
		let u = r.snapToGrid(e.clientX, e.clientY);
		this.notify("node:embedding", {
			e,
			cell: n,
			node: n,
			view: r.findViewByCell(n),
			x: u.x,
			y: u.y,
			currentParent: n.getParent(),
			candidateParent: s ? s.cell : null
		});
	}
	clearEmbedding(e) {
		let t = e.candidateEmbedView;
		t && (t.unhighlight(null, { type: "embedding" }), e.candidateEmbedView = null);
	}
	finalizeEmbedding(e, t) {
		this.graph.startBatch("embedding");
		let n = t.cell || this.cell, r = t.graph || this.graph, i = r.findViewByCell(n), a = n.getParent(), o = t.candidateEmbedView;
		if (o ? (o.unhighlight(null, { type: "embedding" }), t.candidateEmbedView = null, (a == null || a.id !== o.cell.id) && o.cell.insertChild(n, void 0, { ui: !0 })) : a && a.unembed(n, { ui: !0 }), r.model.getConnectedEdges(n, { deep: !0 }).forEach((e) => {
			e.updateParent({ ui: !0 });
		}), i && o) {
			let t = r.snapToGrid(e.clientX, e.clientY);
			i.notify("node:embedded", {
				e,
				cell: n,
				x: t.x,
				y: t.y,
				node: n,
				view: r.findViewByCell(n),
				previousParent: a,
				currentParent: n.getParent()
			});
		}
		this.graph.stopBatch("embedding");
	}
	getDelegatedView() {
		let e = this.cell, t = this;
		for (; t && !e.isEdge();) {
			if (!e.hasParent() || t.can("stopDelegateOnDragging")) return t;
			e = e.getParent(), t = this.graph.findViewByCell(e);
		}
		return null;
	}
	validateMagnet(e, t, n) {
		if (t.getAttribute("magnet") !== "passive") {
			let r = this.graph.options.connecting.validateMagnet;
			return !r || F(r, this.graph, {
				e: n,
				magnet: t,
				view: e,
				cell: e.cell
			});
		}
		return !1;
	}
	startMagnetDragging(e, t, n) {
		if (!this.can("magnetConnectable")) return;
		e.stopPropagation();
		let r = e.currentTarget, i = this.graph;
		this.setEventData(e, { targetMagnet: r }), this.validateMagnet(this, r, e) ? (i.options.magnetThreshold <= 0 && this.startConnectting(e, r, t, n), this.setEventData(e, { action: "magnet" }), this.stopPropagation(e)) : this.onMouseDown(e, t, n), i.view.delegateDragEvents(e, this);
	}
	startConnectting(e, t, n, r) {
		this.graph.model.startBatch("add-edge");
		let i = this.createEdgeFromMagnet(t, n, r);
		i.setEventData(e, i.prepareArrowheadDragging("target", {
			x: n,
			y: r,
			isNewEdge: !0,
			fallbackAction: "remove"
		})), this.setEventData(e, { edgeView: i }), i.notifyMouseDown(e, n, r);
	}
	getDefaultEdge(e, t) {
		let n, r = this.graph.options.connecting.createEdge;
		return r && (n = F(r, this.graph, {
			sourceMagnet: t,
			sourceView: e,
			sourceCell: e.cell
		})), n;
	}
	createEdgeFromMagnet(e, t, n) {
		let r = this.graph, i = r.model, a = this.getDefaultEdge(this, e);
		return a.setSource(Object.assign(Object.assign({}, a.getSource()), this.getEdgeTerminal(e, t, n, a, "source"))), a.setTarget(Object.assign(Object.assign({}, a.getTarget()), {
			x: t,
			y: n
		})), a.addTo(i, {
			async: !1,
			ui: !0
		}), a.findView(r);
	}
	dragMagnet(e, t, n) {
		let r = this.getEventData(e), i = r.edgeView;
		if (i) i.onMouseMove(e, t, n), this.autoScrollGraph(e.clientX, e.clientY);
		else {
			let i = this.graph, a = i.options.magnetThreshold, o = this.getEventTarget(e), s = r.targetMagnet;
			if (a === "onleave") {
				if (s === o || s.contains(o)) return;
			} else if (i.view.getMouseMovedCount(e) <= a) return;
			this.startConnectting(e, s, t, n);
		}
	}
	stopMagnetDragging(e, t, n) {
		let r = this.eventData(e).edgeView;
		r && (r.onMouseUp(e, t, n), this.graph.model.stopBatch("add-edge"));
	}
	notifyUnhandledMouseDown(e, t, n) {
		this.notify("node:unhandled:mousedown", {
			e,
			x: t,
			y: n,
			view: this,
			cell: this.cell,
			node: this.cell
		});
	}
	notifyNodeMove(e, t, n, r, i) {
		let a = [i], o = this.graph.getPlugin("selection");
		if (o && o.isSelectionMovable()) {
			let e = o.getSelectedCells();
			e.includes(i) && (a = e.filter((e) => e.isNode()));
		}
		a.forEach((i) => {
			this.notify(e, {
				e: t,
				x: n,
				y: r,
				cell: i,
				node: i,
				view: i.findView(this.graph)
			});
		});
	}
	getRestrictArea(e) {
		let t = this.graph.options.translating.restrict, n = typeof t == "function" ? F(t, this.graph, e) : t;
		return typeof n == "number" ? this.graph.transform.getGraphArea().inflate(n) : n === !0 ? this.graph.transform.getGraphArea() : n || null;
	}
	startNodeDragging(e, t, n) {
		let r = this.getDelegatedView();
		if (r == null || !r.can("nodeMovable")) return this.notifyUnhandledMouseDown(e, t, n);
		this.setEventData(e, {
			targetView: r,
			action: "move"
		});
		let i = I.create(r.cell.getPosition());
		r.setEventData(e, {
			moving: !1,
			offset: i.diff(t, n),
			restrict: this.getRestrictArea(r)
		});
	}
	dragNode(e, t, n) {
		let r = this.cell, i = this.graph, a = i.getGridSize(), o = this.getEventData(e), s = o.offset, c = o.restrict;
		o.moving || (o.moving = !0, this.addClass("node-moving"), this.notifyNodeMove("node:move", e, t, n, this.cell)), this.autoScrollGraph(e.clientX, e.clientY);
		let l = Vu(t + s.x, a), u = Vu(n + s.y, a);
		r.setPosition(l, u, {
			restrict: c,
			deep: !0,
			ui: !0
		}), i.options.embedding.enabled && (o.embedding || (this.prepareEmbedding(e), o.embedding = !0), this.processEmbedding(e, o));
	}
	autoOffsetNode() {
		let e = this.cell, t = this.graph, n = Object.assign({ id: e.id }, e.getPosition()), r = t.getNodes().map((e) => {
			let t = e.getPosition();
			return {
				id: e.id,
				x: t.x,
				y: t.y
			};
		}).filter((e) => e.id !== n.id), i = [
			[1, 1],
			[1, -1],
			[-1, 1],
			[-1, -1]
		], a = t.getGridSize(), o = (e) => r.some((t) => t.x === e.x && t.y === e.y);
		for (; o(n);) {
			let r = !1;
			for (let t = 0; t < i.length; t += 1) {
				let s = i[t];
				if (!o({
					x: n.x + s[0] * a,
					y: n.y + s[1] * a
				})) {
					e.translate(s[0] * a, s[1] * a), r = !0;
					break;
				}
			}
			if (r) break;
			a += t.getGridSize();
		}
	}
	stopNodeDragging(e, t, n) {
		let r = this.getEventData(e), i = this.graph;
		r.embedding && this.finalizeEmbedding(e, r), r.moving && (i.options.translating.autoOffset && this.autoOffsetNode(), this.removeClass("node-moving"), this.notifyNodeMove("node:moved", e, t, n, this.cell)), r.moving = !1, r.embedding = !1;
	}
	autoScrollGraph(e, t) {
		let n = this.graph.getPlugin("scroller");
		n && n.autoScroll(e, t);
	}
}, bS = `X6.${yS.name}`;
yS.config({
	isSvgElement: !0,
	priority: 0,
	bootstrap: ["render"],
	actions: {
		view: ["render"],
		markup: ["render"],
		attrs: ["update"],
		size: [
			"resize",
			"ports",
			"tools"
		],
		angle: ["rotate", "tools"],
		position: ["translate", "tools"],
		ports: ["ports"],
		tools: ["tools"]
	}
}), yS.registry.register("node", yS, !0);
// node_modules/@antv/x6/es/view/edge/index.js
var xS = class e extends nx {
	constructor() {
		super(...arguments), this.POINT_ROUNDING = 2, this.labelDestroyFn = {};
	}
	static isEdgeView(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag], r = t;
		return !(n != null && n !== SS || typeof r.isNodeView != "function" || typeof r.isEdgeView != "function" || typeof r.confirmUpdate != "function" || typeof r.update != "function" || typeof r.getConnection != "function");
	}
	get [Symbol.toStringTag]() {
		return SS;
	}
	getContainerClassName() {
		return [super.getContainerClassName(), this.prefixClassName("edge")].join(" ");
	}
	get sourceBBox() {
		let e = this.sourceView;
		if (!e || !this.graph.renderer.isViewMounted(e)) {
			let e = this.cell.getSourceCell();
			if (e) return e.getBBox();
			let t = this.cell.getSourcePoint();
			return new L(t.x, t.y);
		}
		let t = this.sourceMagnet;
		return e.isEdgeElement(t) ? new L(this.sourceAnchor.x, this.sourceAnchor.y) : e.getBBoxOfElement(t || e.container);
	}
	get targetBBox() {
		let e = this.targetView;
		if (!e || !this.graph.renderer.isViewMounted(e)) {
			let e = this.cell.getTargetCell();
			if (e) return e.getBBox();
			let t = this.cell.getTargetPoint();
			return new L(t.x, t.y);
		}
		let t = this.targetMagnet;
		return e.isEdgeElement(t) ? new L(this.targetAnchor.x, this.targetAnchor.y) : e.getBBoxOfElement(t || e.container);
	}
	isEdgeView() {
		return !0;
	}
	confirmUpdate(e, t = {}) {
		let n = e;
		if (this.hasAction(n, "source")) {
			if (!this.updateTerminalProperties("source")) return n;
			n = this.removeAction(n, "source");
		}
		if (this.hasAction(n, "target")) {
			if (!this.updateTerminalProperties("target")) return n;
			n = this.removeAction(n, "target");
		}
		return this.hasAction(n, "render") ? (this.render(), n = this.removeAction(n, [
			"render",
			"update",
			"labels",
			"tools"
		]), n) : (n = this.handleAction(n, "update", () => this.update(t)), n = this.handleAction(n, "labels", () => this.onLabelsChange(t)), n = this.handleAction(n, "tools", () => this.renderTools()), n);
	}
	render() {
		return this.empty(), this.renderMarkup(), this.labelContainer = null, this.renderLabels(), this.update(), this.renderTools(), this.notify("view:render", { view: this }), this;
	}
	renderMarkup() {
		let e = this.cell.markup;
		if (e) {
			if (typeof e == "string") throw TypeError("Not support string markup.");
			return this.renderJSONMarkup(e);
		}
		throw TypeError("Invalid edge markup.");
	}
	renderJSONMarkup(e) {
		let t = this.parseJSONMarkup(e, this.container);
		this.selectors = t.selectors, this.container.append(t.fragment);
	}
	customizeLabels() {
		if (this.labelContainer) {
			let e = this.cell, t = e.labels;
			for (let n = 0, r = t.length; n < r; n += 1) {
				let r = t[n], i = this.labelCache[n], a = this.labelSelectors[n], o = this.graph.options.onEdgeLabelRendered;
				if (o) {
					let t = o({
						edge: e,
						label: r,
						container: i,
						selectors: a
					});
					t && (this.labelDestroyFn[n] = t);
				}
			}
		}
	}
	destroyCustomizeLabels() {
		let e = this.cell.labels;
		if (this.labelCache && this.labelSelectors && this.labelDestroyFn) for (let t = 0, n = e.length; t < n; t += 1) {
			let n = this.labelDestroyFn[t], r = this.labelCache[t], i = this.labelSelectors[t];
			n && r && i && n({
				edge: this.cell,
				label: e[t],
				container: r,
				selectors: i
			});
		}
		this.labelDestroyFn = {};
	}
	renderLabels() {
		let e = this.cell, t = e.getLabels(), n = t.length, r = this.labelContainer;
		if (this.labelCache = {}, this.labelSelectors = {}, n <= 0) return r?.parentNode && r.parentNode.removeChild(r), this;
		r ? this.empty(r) : (r = Od("g"), this.addClass(this.prefixClassName("edge-labels"), r), this.labelContainer = r);
		for (let n = 0, i = t.length; n < i; n += 1) {
			let i = t[n], a = this.normalizeLabelMarkup(this.parseLabelMarkup(i.markup)), o, s;
			if (a) o = a.node, s = a.selectors;
			else {
				let t = e.getDefaultLabel(), n = this.normalizeLabelMarkup(this.parseLabelMarkup(t.markup));
				o = n.node, s = n.selectors;
			}
			o.setAttribute("data-index", `${n}`), r.appendChild(o);
			let c = this.rootSelector;
			if (s[c]) throw Error("Ambiguous label root selector.");
			s[c] = o, this.labelCache[n] = o, this.labelSelectors[n] = s;
		}
		return r.parentNode ?? this.container.appendChild(r), this.updateLabels(), this.customizeLabels(), this;
	}
	onLabelsChange(e = {}) {
		this.destroyCustomizeLabels(), this.shouldRerenderLabels(e) ? this.renderLabels() : this.updateLabels(), this.updateLabelPositions();
	}
	shouldRerenderLabels(e = {}) {
		let t = this.cell.previous("labels");
		if (t == null) return !0;
		if ("propertyPathArray" in e && "propertyValue" in e) {
			let n = e.propertyPathArray || [], r = n.length;
			if (r > 1 && t[n[1]]) {
				if (r === 2) return typeof e.propertyValue == "object" && xl(e.propertyValue, "markup");
				if (n[2] !== "markup") return !1;
			}
		}
		return !0;
	}
	parseLabelMarkup(e) {
		return e ? typeof e == "string" ? this.parseLabelStringMarkup(e) : this.parseJSONMarkup(e) : null;
	}
	parseLabelStringMarkup(e) {
		let t = W.createVectors(e), n = document.createDocumentFragment();
		for (let e = 0, r = t.length; e < r; e += 1) {
			let r = t[e].node;
			n.appendChild(r);
		}
		return {
			fragment: n,
			selectors: {}
		};
	}
	normalizeLabelMarkup(e) {
		if (e == null) return;
		let t = e.fragment;
		if (!(t instanceof DocumentFragment) || !t.hasChildNodes()) throw Error("Invalid label markup.");
		let n, r = t.childNodes;
		return n = r.length > 1 || r[0].nodeName.toUpperCase() !== "G" ? W.create("g").append(t) : W.create(r[0]), n.addClass(this.prefixClassName("edge-label")), {
			node: n.node,
			selectors: e.selectors
		};
	}
	updateLabels() {
		if (this.labelContainer) {
			let e = this.cell, t = e.labels, n = this.can("edgeLabelMovable"), r = e.getDefaultLabel();
			for (let e = 0, i = t.length; e < i; e += 1) {
				let i = this.labelCache[e], a = this.labelSelectors[e];
				i.setAttribute("cursor", n ? "move" : "default");
				let o = t[e], s = P({}, r.attrs, o.attrs);
				this.updateAttrs(i, s, {
					selectors: a,
					rootBBox: o.size ? L.fromSize(o.size) : void 0
				});
			}
		}
	}
	renderTools() {
		let e = this.cell.getTools();
		return this.addTools(e), this;
	}
	update(e = {}) {
		this.cleanCache(), this.updateConnection(e);
		let t = this.cell.getAttrs(), { text: n } = t, r = O(t, ["text"]);
		if (r != null) {
			if (this.container?.tagName === "g" && this.isEdgeElement(this.container) && pu) {
				let e = this.container.parentNode;
				if (e) {
					let t = this.container.nextSibling;
					e.removeChild(this.container), e.insertBefore(this.container, t);
				}
			}
			this.updateAttrs(this.container, r, { selectors: this.selectors });
		}
		return this.updateLabelPositions(), this.updateTools(e), this;
	}
	removeRedundantLinearVertices(e = {}) {
		let t = this.cell, n = t.getVertices(), r = [
			this.sourceAnchor,
			...n,
			this.targetAnchor
		], i = r.length, a = new Qu(r);
		a.simplify({ threshold: .01 });
		let o = a.points.map((e) => e.toJSON()), s = o.length;
		return i === s ? 0 : (t.setVertices(o.slice(1, s - 1), e), i - s);
	}
	getTerminalView(e) {
		switch (e) {
			case "source": return this.sourceView || null;
			case "target": return this.targetView || null;
			default: throw Error(`Unknown terminal type '${e}'`);
		}
	}
	getTerminalAnchor(e) {
		switch (e) {
			case "source": return I.create(this.sourceAnchor);
			case "target": return I.create(this.targetAnchor);
			default: throw Error(`Unknown terminal type '${e}'`);
		}
	}
	getTerminalConnectionPoint(e) {
		switch (e) {
			case "source": return I.create(this.sourcePoint);
			case "target": return I.create(this.targetPoint);
			default: throw Error(`Unknown terminal type '${e}'`);
		}
	}
	getTerminalMagnet(e, t = {}) {
		switch (e) {
			case "source": {
				if (t.raw) return this.sourceMagnet;
				let e = this.sourceView;
				return e ? this.sourceMagnet || e.container : null;
			}
			case "target": {
				if (t.raw) return this.targetMagnet;
				let e = this.targetView;
				return e ? this.targetMagnet || e.container : null;
			}
			default: throw Error(`Unknown terminal type '${e}'`);
		}
	}
	updateConnection(e = {}) {
		let t = this.cell;
		if (e.translateBy && t.isFragmentDescendantOf(e.translateBy)) {
			let t = e.tx || 0, n = e.ty || 0;
			this.routePoints = new Qu(this.routePoints).translate(t, n).points, this.translateConnectionPoints(t, n), this.path.translate(t, n);
		} else {
			let e = t.getVertices(), n = this.findAnchors(e);
			this.sourceAnchor = n.source, this.targetAnchor = n.target, this.routePoints = this.findRoutePoints(e);
			let r = this.findConnectionPoints(this.routePoints, this.sourceAnchor, this.targetAnchor);
			this.sourcePoint = r.source, this.targetPoint = r.target;
			let i = this.findMarkerPoints(this.routePoints, this.sourcePoint, this.targetPoint);
			this.path = this.findPath(this.routePoints, i.source || this.sourcePoint, i.target || this.targetPoint);
		}
		this.cleanCache();
	}
	findAnchors(e) {
		let t = this.cell, n = t.source, r = t.target, i = e[0], a = e[e.length - 1];
		return r.priority && !n.priority ? this.findAnchorsOrdered("target", a, "source", i) : this.findAnchorsOrdered("source", i, "target", a);
	}
	findAnchorsOrdered(e, t, n, r) {
		let i, a, o = this.cell, s = o[e], c = o[n], l = this.getTerminalView(e), u = this.getTerminalView(n), d = this.getTerminalMagnet(e), f = this.getTerminalMagnet(n);
		if (l) {
			let n;
			n = t ? I.create(t) : u ? f : I.create(c), i = this.getAnchor(s.anchor, l, d, n, e);
		} else i = I.create(s);
		if (u) {
			let e = I.create(r || i);
			a = this.getAnchor(c.anchor, u, f, e, n);
		} else a = I.isPointLike(c) ? I.create(c) : new I();
		return {
			[e]: i,
			[n]: a
		};
	}
	getAnchor(e, t, n, r, i) {
		let a = t.isEdgeElement(n), o = this.graph.options.connecting, s = typeof e == "string" ? { name: e } : e;
		if (!s) {
			let e = a ? (i === "source" ? o.sourceEdgeAnchor : o.targetEdgeAnchor) || o.edgeAnchor : (i === "source" ? o.sourceAnchor : o.targetAnchor) || o.anchor;
			s = typeof e == "string" ? { name: e } : e;
		}
		if (!s) throw Error("Anchor should be specified.");
		let c, l = s.name;
		if (a) {
			let e = H_.get(l);
			if (typeof e != "function") return H_.onNotFound(l);
			c = F(e, this, t, n, r, s.args || {}, i);
		} else {
			let e = Vv.get(l);
			if (typeof e != "function") return Vv.onNotFound(l);
			c = F(e, this, t, n, r, s.args || {}, i);
		}
		return c ? c.round(this.POINT_ROUNDING) : new I();
	}
	findRoutePoints(e = []) {
		let t = this.graph.options.connecting.router || Eb.normal, n = this.cell.getRouter() || t, r;
		if (typeof n == "function") r = F(n, this, e, {}, this);
		else {
			let t = typeof n == "string" ? n : n.name, i = typeof n == "string" ? {} : n.args || {}, a = t ? Db.get(t) : Eb.normal;
			if (typeof a != "function") return Db.onNotFound(t);
			r = F(a, this, e, i, this);
		}
		return r == null ? e.map((e) => I.create(e)) : r.map((e) => I.create(e));
	}
	findConnectionPoints(e, t, n) {
		let r = this.cell, i = this.graph.options.connecting, a = r.getSource(), o = r.getTarget(), s = this.sourceView, c = this.targetView, l = e[0], u = e[e.length - 1], d;
		if (s && !s.isEdgeElement(this.sourceMagnet)) {
			let e = this.sourceMagnet || s.container, r = new R(l || n, t), o = a.connectionPoint || i.sourceConnectionPoint || i.connectionPoint;
			d = this.getConnectionPoint(o, s, e, r, "source");
		} else d = t;
		let f;
		if (c && !c.isEdgeElement(this.targetMagnet)) {
			let e = this.targetMagnet || c.container, r = o.connectionPoint || i.targetConnectionPoint || i.connectionPoint, a = new R(u || t, n);
			f = this.getConnectionPoint(r, c, e, a, "target");
		} else f = n;
		return {
			source: d,
			target: f
		};
	}
	getConnectionPoint(e, t, n, r, i) {
		let a = r.end;
		if (e == null) return a;
		let o = typeof e == "string" ? e : e.name, s = typeof e == "string" ? {} : e.args, c = m_.get(o);
		if (typeof c != "function") return m_.onNotFound(o);
		let l = F(c, this, r, t, n, s || {}, i);
		return l ? l.round(this.POINT_ROUNDING) : a;
	}
	findMarkerPoints(e, t, n) {
		let r = (e) => {
			let t = this.cell.getAttrs(), n = Object.keys(t);
			for (let r = 0, i = n.length; r < i; r += 1) {
				let i = t[n[r]];
				if (i[`${e}Marker`] || i[`${e}-marker`]) {
					let e = i.strokeWidth || i["stroke-width"];
					if (e) return parseFloat(e);
					break;
				}
			}
			return null;
		}, i = e[0], a = e[e.length - 1], o, s, c = r("source");
		c && (o = t.clone().move(i || n, -c));
		let l = r("target");
		return l && (s = n.clone().move(a || t, -l)), this.sourceMarkerPoint = o || t.clone(), this.targetMarkerPoint = s || n.clone(), {
			source: o,
			target: s
		};
	}
	findPath(e, t, n) {
		let r = this.cell.getConnector() || this.graph.options.connecting.connector, i, a, o;
		if (typeof r == "string" ? i = r : (i = r.name, a = r.args), i) {
			let e = N_.get(i);
			if (typeof e != "function") return N_.onNotFound(i);
			o = e;
		} else o = M_.normal;
		let s = F(o, this, t, n, e, Object.assign(Object.assign({}, a), { raw: !0 }), this);
		return typeof s == "string" ? z.parse(s) : s;
	}
	translateConnectionPoints(e, t) {
		this.sourcePoint.translate(e, t), this.targetPoint.translate(e, t), this.sourceAnchor.translate(e, t), this.targetAnchor.translate(e, t), this.sourceMarkerPoint.translate(e, t), this.targetMarkerPoint.translate(e, t);
	}
	updateLabelPositions() {
		if (this.labelContainer == null || !this.path) return this;
		let e = this.cell, t = e.getLabels();
		if (t.length === 0) return this;
		let n = e.getDefaultLabel(), r = this.normalizeLabelPosition(n.position);
		for (let e = 0, n = t.length; e < n; e += 1) {
			let n = t[e], i = this.labelCache[e];
			if (!i) continue;
			let a = P({}, r, this.normalizeLabelPosition(n.position)), o = this.getLabelTransformationMatrix(a);
			i.setAttribute("transform", vp(o));
		}
		return this;
	}
	updateTerminalProperties(e) {
		let t = this.cell, n = this.graph, r = t[e], i = r && r.cell, a = `${e}View`;
		if (!i) return this[a] = null, this.updateTerminalMagnet(e), !0;
		let o = n.getCellById(i);
		if (!o) throw Error(`Edge's ${e} node with id "${i}" not exists`);
		let s = o.findView(n);
		return s ? (this[a] = s, this.updateTerminalMagnet(e), !0) : !1;
	}
	updateTerminalMagnet(e) {
		let t = `${e}Magnet`, n = this.getTerminalView(e);
		if (n) {
			let r = n.getMagnetFromEdgeTerminal(this.cell[e]);
			r === n.container && (r = null), this[t] = r;
		} else this[t] = null;
	}
	getLabelPositionAngle(e) {
		let t = this.cell.getLabelAt(e);
		return t && t.position && typeof t.position == "object" && t.position.angle || 0;
	}
	getLabelPositionArgs(e) {
		let t = this.cell.getLabelAt(e);
		if (t && t.position && typeof t.position == "object") return t.position.options;
	}
	getDefaultLabelPositionArgs() {
		let e = this.cell.getDefaultLabel();
		if (e && e.position && typeof e.position == "object") return e.position.options;
	}
	mergeLabelPositionArgs(e, t) {
		return e === null ? null : e === void 0 ? t === null ? null : t : P({}, t, e);
	}
	getConnection() {
		return this.path == null ? null : this.path.clone();
	}
	getConnectionPathData() {
		if (this.path == null) return "";
		let e = this.cache.pathCache;
		return xl(e, "data") || (e.data = this.path.serialize()), e.data || "";
	}
	getConnectionSubdivisions() {
		if (this.path == null) return null;
		let e = this.cache.pathCache;
		return xl(e, "segmentSubdivisions") || (e.segmentSubdivisions = this.path.getSegmentSubdivisions()), e.segmentSubdivisions;
	}
	getConnectionLength() {
		if (this.path == null) return 0;
		let e = this.cache.pathCache;
		return xl(e, "length") || (e.length = this.path.length({ segmentSubdivisions: this.getConnectionSubdivisions() })), e.length;
	}
	getPointAtLength(e) {
		return this.path == null ? null : this.path.pointAtLength(e, { segmentSubdivisions: this.getConnectionSubdivisions() });
	}
	getPointAtRatio(e) {
		return this.path == null ? null : (iu(e) && (e = parseFloat(e) / 100), this.path.pointAt(e, { segmentSubdivisions: this.getConnectionSubdivisions() }));
	}
	getTangentAtLength(e) {
		return this.path == null ? null : this.path.tangentAtLength(e, { segmentSubdivisions: this.getConnectionSubdivisions() });
	}
	getTangentAtRatio(e) {
		return this.path == null ? null : this.path.tangentAt(e, { segmentSubdivisions: this.getConnectionSubdivisions() });
	}
	getClosestPoint(e) {
		return this.path == null ? null : this.path.closestPoint(e, { segmentSubdivisions: this.getConnectionSubdivisions() });
	}
	getClosestPointLength(e) {
		return this.path == null ? null : this.path.closestPointLength(e, { segmentSubdivisions: this.getConnectionSubdivisions() });
	}
	getClosestPointRatio(e) {
		return this.path == null ? null : this.path.closestPointNormalizedLength(e, { segmentSubdivisions: this.getConnectionSubdivisions() });
	}
	getLabelPosition(e, t, n, r) {
		let i = { distance: 0 }, a = 0, o;
		typeof n == "number" ? (a = n, o = r) : o = n, o != null && (i.options = o);
		let s = o?.absoluteOffset, c = !o?.absoluteDistance, l = o?.absoluteDistance && o.reverseDistance, u = this.path, d = { segmentSubdivisions: this.getConnectionSubdivisions() }, f = new I(e, t), p = u.closestPointT(f, d) ?? 0, m = this.getConnectionLength() || 0, h = u.lengthAtT(p, d);
		c && (h = m > 0 ? h / m : 0), l && (h = -1 * (m - h) || 1), i.distance = h;
		let g;
		s || (g = u.tangentAtT(p));
		let _;
		if (g) _ = g.pointOffset(f);
		else {
			let e = u.pointAtT(p);
			if (e) {
				let t = f.diff(e);
				_ = {
					x: t.x,
					y: t.y
				};
			} else _ = {
				x: 0,
				y: 0
			};
		}
		return i.offset = _, i.angle = a, i;
	}
	normalizeLabelPosition(e) {
		return typeof e == "number" ? { distance: e } : e;
	}
	getLabelTransformationMatrix(e) {
		let t = this.normalizeLabelPosition(e), n = t.options || {}, r = t.angle || 0, i = t.distance, a = i > 0 && i <= 1, o = 0, s = {
			x: 0,
			y: 0
		}, c = t.offset;
		c && (typeof c == "number" ? o = c : (c.x != null && (s.x = c.x), c.y != null && (s.y = c.y)));
		let l = s.x !== 0 || s.y !== 0 || o === 0, u = n.keepGradient, d = n.ensureLegibility, f = this.path, p = { segmentSubdivisions: this.getConnectionSubdivisions() }, m = a ? i * (this.getConnectionLength() || 0) : i, h = f.tangentAtLength(m, p), g, _ = r;
		if (h) {
			if (l) g = h.start, g.translate(s);
			else {
				let e = h.clone();
				e.rotate(-90, h.start), e.setLength(o), g = e.end;
			}
			u && (_ = h.angle() + r, d && (_ = Lu((_ + 90) % 180 - 90)));
		} else g = f.pointAtLength(0, p) || new I(), l && g.translate(s);
		return hp().translate(g.x, g.y).rotate(_);
	}
	getVertexIndex(e, t) {
		let n = this.cell.getVertices(), r = this.getClosestPointLength(new I(e, t)), i = 0;
		if (r != null) for (let e = n.length; i < e; i += 1) {
			let e = n[i], t = this.getClosestPointLength(e);
			if (t != null && r < t) break;
		}
		return i;
	}
	getEventArgs(e, t, n) {
		let r = this, i = r.cell, a = i;
		return t == null || n == null ? {
			e,
			view: r,
			edge: i,
			cell: a
		} : {
			e,
			x: t,
			y: n,
			view: r,
			edge: i,
			cell: a
		};
	}
	notifyUnhandledMouseDown(e, t, n) {
		this.notify("edge:unhandled:mousedown", {
			e,
			x: t,
			y: n,
			view: this,
			cell: this.cell,
			edge: this.cell
		});
	}
	notifyMouseDown(e, t, n) {
		super.onMouseDown(e, t, n), this.notify("edge:mousedown", this.getEventArgs(e, t, n));
	}
	notifyMouseMove(e, t, n) {
		super.onMouseMove(e, t, n), this.notify("edge:mousemove", this.getEventArgs(e, t, n));
	}
	notifyMouseUp(e, t, n) {
		super.onMouseUp(e, t, n), this.notify("edge:mouseup", this.getEventArgs(e, t, n));
	}
	onClick(e, t, n) {
		super.onClick(e, t, n), this.notify("edge:click", this.getEventArgs(e, t, n));
	}
	onDblClick(e, t, n) {
		super.onDblClick(e, t, n), this.notify("edge:dblclick", this.getEventArgs(e, t, n));
	}
	onContextMenu(e, t, n) {
		super.onContextMenu(e, t, n), this.notify("edge:contextmenu", this.getEventArgs(e, t, n));
	}
	onMouseDown(e, t, n) {
		this.notifyMouseDown(e, t, n), this.startEdgeDragging(e, t, n);
	}
	onMouseMove(e, t, n) {
		let r = this.getEventData(e);
		switch (r.action) {
			case "drag-label":
				this.dragLabel(e, t, n);
				break;
			case "drag-arrowhead":
				this.dragArrowhead(e, t, n);
				break;
			case "drag-edge": this.dragEdge(e, t, n);
		}
		return this.notifyMouseMove(e, t, n), r;
	}
	onMouseUp(e, t, n) {
		let r = this.getEventData(e);
		switch (r.action) {
			case "drag-label":
				this.stopLabelDragging(e, t, n);
				break;
			case "drag-arrowhead":
				this.stopArrowheadDragging(e, t, n);
				break;
			case "drag-edge": this.stopEdgeDragging(e, t, n);
		}
		return this.notifyMouseUp(e, t, n), this.checkMouseleave(e), r;
	}
	onMouseOver(e) {
		super.onMouseOver(e), this.notify("edge:mouseover", this.getEventArgs(e));
	}
	onMouseOut(e) {
		super.onMouseOut(e), this.notify("edge:mouseout", this.getEventArgs(e));
	}
	onMouseEnter(e) {
		super.onMouseEnter(e), this.notify("edge:mouseenter", this.getEventArgs(e));
	}
	onMouseLeave(e) {
		super.onMouseLeave(e), this.notify("edge:mouseleave", this.getEventArgs(e));
	}
	onMouseWheel(e, t, n, r) {
		super.onMouseWheel(e, t, n, r), this.notify("edge:mousewheel", Object.assign({ delta: r }, this.getEventArgs(e, t, n)));
	}
	onCustomEvent(e, t, n, r) {
		if (Fd(e.target, "edge-tool", this.container)) {
			if (e.stopPropagation(), this.can("useEdgeTools")) {
				if (t === "edge:remove") {
					this.cell.remove({ ui: !0 });
					return;
				}
				this.notify("edge:customevent", Object.assign({ name: t }, this.getEventArgs(e, n, r)));
			}
			this.notifyMouseDown(e, n, r);
		} else this.notify("edge:customevent", Object.assign({ name: t }, this.getEventArgs(e, n, r))), super.onCustomEvent(e, t, n, r);
	}
	onLabelMouseDown(e, t, n) {
		this.notifyMouseDown(e, t, n), this.startLabelDragging(e, t, n), this.getEventData(e).stopPropagation && e.stopPropagation();
	}
	startEdgeDragging(e, t, n) {
		this.can("edgeMovable") ? this.setEventData(e, {
			x: t,
			y: n,
			moving: !1,
			action: "drag-edge"
		}) : this.notifyUnhandledMouseDown(e, t, n);
	}
	dragEdge(e, t, n) {
		let r = this.getEventData(e);
		r.moving || (r.moving = !0, this.addClass("edge-moving"), this.notify("edge:move", {
			e,
			x: t,
			y: n,
			view: this,
			cell: this.cell,
			edge: this.cell
		})), this.cell.translate(t - r.x, n - r.y, { ui: !0 }), this.setEventData(e, {
			x: t,
			y: n
		}), this.notify("edge:moving", {
			e,
			x: t,
			y: n,
			view: this,
			cell: this.cell,
			edge: this.cell
		});
	}
	stopEdgeDragging(e, t, n) {
		let r = this.getEventData(e);
		r.moving && (this.removeClass("edge-moving"), this.notify("edge:moved", {
			e,
			x: t,
			y: n,
			view: this,
			cell: this.cell,
			edge: this.cell
		})), r.moving = !1;
	}
	prepareArrowheadDragging(e, t) {
		let n = this.getTerminalMagnet(e), r = {
			action: "drag-arrowhead",
			x: t.x,
			y: t.y,
			isNewEdge: t.isNewEdge === !0,
			terminalType: e,
			initialMagnet: n,
			initialTerminal: Ls(this.cell[e]),
			fallbackAction: t.fallbackAction || "revert",
			getValidateConnectionArgs: this.createValidateConnectionArgs(e),
			options: t.options
		};
		return this.beforeArrowheadDragging(r), r;
	}
	createValidateConnectionArgs(e) {
		let t = [
			void 0,
			void 0,
			void 0,
			void 0,
			e,
			this
		], n, r = 0, i = 0;
		e === "source" ? (r = 2, n = "target") : (i = 2, n = "source");
		let a = this.cell[n], o = a.cell;
		if (o) {
			let e, n = this.graph.findViewByCell(o);
			t[r] = n, n && (e = n.getMagnetFromEdgeTerminal(a), e === n.container && (e = void 0)), t[r + 1] = e;
		}
		return (e, n) => (t[i] = e, t[i + 1] = e.container === n ? void 0 : n, t);
	}
	beforeArrowheadDragging(e) {
		e.zIndex = this.cell.zIndex, this.cell.toFront();
		let t = this.container.style;
		e.pointerEvents = t.pointerEvents, t.pointerEvents = "none", this.graph.options.connecting.highlight && this.highlightAvailableMagnets(e);
	}
	afterArrowheadDragging(e) {
		e.zIndex != null && (this.cell.setZIndex(e.zIndex, { ui: !0 }), e.zIndex = null);
		let t = this.container;
		t.style.pointerEvents = e.pointerEvents || "", this.graph.options.connecting.highlight && this.unhighlightAvailableMagnets(e);
	}
	validateConnection(t, n, r, i, a, o, s) {
		let c = this.graph.options.connecting, l = c.allowLoop, u = c.allowNode, d = c.allowEdge, f = c.allowPort, p = c.allowMulti, m = c.validateConnection, h = o ? o.cell : null, g = a === "target" ? r : t, _ = a === "target" ? i : n, v = !0, y = (e) => {
			let c = a === "source" ? s ? s.port : null : h ? h.getSourcePortId() : null, l = a === "target" ? s ? s.port : null : h ? h.getTargetPortId() : null;
			return F(e, this.graph, {
				edge: h,
				edgeView: o,
				sourceView: t,
				targetView: r,
				sourcePort: c,
				targetPort: l,
				sourceMagnet: n,
				targetMagnet: i,
				sourceCell: t ? t.cell : null,
				targetCell: r ? r.cell : null,
				type: a
			});
		};
		if (l != null && t != null && t === r && (typeof l == "boolean" ? l || (v = !1) : v = y(l)), v && f != null && (typeof f == "boolean" ? !f && _ && (v = !1) : v = y(f)), v && d != null && (typeof d == "boolean" ? !d && e.isEdgeView(g) && (v = !1) : v = y(d)), v && u != null && _ == null && (typeof u == "boolean" ? !u && yS.isNodeView(g) && (v = !1) : v = y(u)), v && p != null && o) {
			let e = o.cell, t = a === "source" ? s : e.getSource(), n = a === "target" ? s : e.getTarget(), r = s ? this.graph.getCellById(s.cell) : null;
			if (t && n && t.cell && n.cell && r) {
				if (typeof p == "function") v = y(p);
				else {
					let e = this.graph.model.getConnectedEdges(r, {
						outgoing: a === "source",
						incoming: a === "target"
					});
					e.length && (p === "withPort" ? e.some((e) => {
						let r = e.getSource(), i = e.getTarget();
						return r && i && r.cell === t.cell && i.cell === n.cell && r.port != null && r.port === t.port && i.port != null && i.port === n.port;
					}) && (v = !1) : p || e.some((e) => {
						let r = e.getSource(), i = e.getTarget();
						return r && i && r.cell === t.cell && i.cell === n.cell;
					}) && (v = !1));
				}
			}
		}
		return v && m != null && (v = y(m)), v;
	}
	allowConnectToBlank(e) {
		let t = this.graph, n = t.options.connecting.allowBlank;
		if (typeof n != "function") return !!n;
		let r = t.findViewByCell(e), i = e.getSourceCell(), a = e.getTargetCell();
		return F(n, t, {
			edge: e,
			edgeView: r,
			sourceCell: i,
			targetCell: a,
			sourceView: t.findViewByCell(i),
			targetView: t.findViewByCell(a),
			sourcePort: e.getSourcePortId(),
			targetPort: e.getTargetPortId(),
			sourceMagnet: r.sourceMagnet,
			targetMagnet: r.targetMagnet
		});
	}
	validateEdge(e, t, n) {
		let r = this.graph;
		if (!this.allowConnectToBlank(e)) {
			let t = e.getSourceCellId(), n = e.getTargetCellId();
			if (!(t && n)) return !1;
		}
		let i = r.options.connecting.validateEdge;
		return !i || F(i, r, {
			edge: e,
			type: t,
			previous: n
		});
	}
	arrowheadDragging(e, t, n, r) {
		r.x = t, r.y = n, r.currentTarget !== e && (r.currentMagnet && r.currentView && r.currentView.unhighlight(r.currentMagnet, { type: "magnetAdsorbed" }), r.currentView = this.graph.findViewByElem(e), r.currentView ? (r.currentMagnet = r.currentView.findMagnet(e), r.currentMagnet && this.validateConnection(...r.getValidateConnectionArgs(r.currentView, r.currentMagnet), r.currentView.getEdgeTerminal(r.currentMagnet, t, n, this.cell, r.terminalType)) ? r.currentView.highlight(r.currentMagnet, { type: "magnetAdsorbed" }) : r.currentMagnet = null) : r.currentMagnet = null), r.currentTarget = e, this.cell.prop(r.terminalType, {
			x: t,
			y: n
		}, Object.assign(Object.assign({}, r.options), { ui: !0 }));
	}
	arrowheadDragged(e, t, n) {
		let r = e.currentView, i = e.currentMagnet;
		if (!i || !r) return;
		r.unhighlight(i, { type: "magnetAdsorbed" });
		let a = e.terminalType, o = r.getEdgeTerminal(i, t, n, this.cell, a);
		this.cell.setTerminal(a, o, { ui: !0 });
	}
	snapArrowhead(e, t, n) {
		let r = this.graph, { snap: i, allowEdge: a } = r.options.connecting, o = typeof i == "object" && i.radius || 50, s = typeof i == "object" && i.anchor || "center", c = r.renderer.findViewsInArea({
			x: e - o,
			y: t - o,
			width: 2 * o,
			height: 2 * o
		}, { nodeOnly: !0 });
		if (a) {
			let n = r.renderer.findEdgeViewsFromPoint({
				x: e,
				y: t
			}, o).filter((e) => e !== this);
			c.push(...n);
		}
		let l = n.closestView || null, u = n.closestMagnet || null;
		n.closestView = null, n.closestMagnet = null;
		let d, f = 2 ** 53 - 1, p = new I(e, t);
		c.forEach((r) => {
			if (r.container.getAttribute("magnet") !== "false") {
				if (r.isNodeView()) d = s === "center" ? r.cell.getBBox().getCenter().distance(p) : r.cell.getBBox().getNearestPointToPoint(p).distance(p);
				else if (r.isEdgeView()) {
					let e = r.getClosestPoint(p);
					d = e ? e.distance(p) : 2 ** 53 - 1;
				}
				d < o && d < f && (u === r.container || this.validateConnection(...n.getValidateConnectionArgs(r, null), r.getEdgeTerminal(r.container, e, t, this.cell, n.terminalType))) && (f = d, n.closestView = r, n.closestMagnet = r.container);
			}
			r.container.querySelectorAll("[magnet]").forEach((i) => {
				if (i.getAttribute("magnet") !== "false") {
					let a = r.getBBoxOfElement(i);
					d = s === "center" ? p.distance(a.getCenter()) : p.distance(a.getNearestPointToPoint(p)), d < o && d < f && (u === i || this.validateConnection(...n.getValidateConnectionArgs(r, i), r.getEdgeTerminal(i, e, t, this.cell, n.terminalType))) && (f = d, n.closestView = r, n.closestMagnet = i);
				}
			});
		});
		let m = n.terminalType, h = n.closestView, g = n.closestMagnet, _ = u !== g;
		if (l && _ && l.unhighlight(u, { type: "magnetAdsorbed" }), h) {
			if (!_) return;
			h.highlight(g, { type: "magnetAdsorbed" }), this.cell.setTerminal(m, h.getEdgeTerminal(g, e, t, this.cell, m), {}, Object.assign(Object.assign({}, n.options), { ui: !0 }));
		} else this.cell.setTerminal(m, {
			x: e,
			y: t
		}, {}, Object.assign(Object.assign({}, n.options), { ui: !0 }));
	}
	snapArrowheadEnd(e) {
		let t = e.closestView, n = e.closestMagnet;
		t && n && (t.unhighlight(n, { type: "magnetAdsorbed" }), e.currentMagnet = t.findMagnet(n)), e.closestView = null, e.closestMagnet = null;
	}
	finishEmbedding(e) {
		this.graph.options.embedding.enabled && this.cell.updateParent() && (e.zIndex = null);
	}
	fallbackConnection(e) {
		switch (e.fallbackAction) {
			case "remove":
				this.cell.remove({ ui: !0 });
				break;
			default: this.cell.prop(e.terminalType, e.initialTerminal, { ui: !0 });
		}
	}
	notifyConnectionEvent(e, t) {
		let n = e.terminalType, r = e.initialTerminal, i = this.cell[n];
		if (i && !Z.equalTerminals(r, i)) {
			let a = this.graph, o = r, s = o.cell ? a.getCellById(o.cell) : null, c = o.port, l = s ? a.findViewByCell(s) : null, u = s || e.isNewEdge ? null : I.create(r).toJSON(), d = i, f = d.cell ? a.getCellById(d.cell) : null, p = d.port, m = f ? a.findViewByCell(f) : null, h = f ? null : I.create(i).toJSON();
			this.notify("edge:connected", {
				e: t,
				previousCell: s,
				previousPort: c,
				previousView: l,
				previousPoint: u,
				currentCell: f,
				currentView: m,
				currentPort: p,
				currentPoint: h,
				previousMagnet: e.initialMagnet,
				currentMagnet: e.currentMagnet,
				edge: this.cell,
				view: this,
				type: n,
				isNew: e.isNewEdge
			});
		}
	}
	highlightAvailableMagnets(e) {
		let t = this.graph, n = t.model.getCells();
		e.marked = {};
		for (let r = 0, i = n.length; r < i; r += 1) {
			let i = t.findViewByCell(n[r]);
			if (!i || i.cell.id === this.cell.id) continue;
			let a = Array.prototype.slice.call(i.container.querySelectorAll("[magnet]"));
			i.container.getAttribute("magnet") !== "false" && a.push(i.container);
			let o = a.filter((t) => this.validateConnection(...e.getValidateConnectionArgs(i, t), i.getEdgeTerminal(t, e.x, e.y, this.cell, e.terminalType)));
			if (o.length > 0) {
				for (let e = 0, t = o.length; e < t; e += 1) i.highlight(o[e], { type: "magnetAvailable" });
				i.highlight(null, { type: "nodeAvailable" }), e.marked[i.cell.id] = o;
			}
		}
	}
	unhighlightAvailableMagnets(e) {
		let t = e.marked || {};
		Object.keys(t).forEach((e) => {
			let n = this.graph.findViewByCell(e);
			n && (t[e].forEach((e) => {
				n.unhighlight(e, { type: "magnetAvailable" });
			}), n.unhighlight(null, { type: "nodeAvailable" }));
		}), e.marked = null;
	}
	startArrowheadDragging(e, t, n) {
		if (!this.can("arrowheadMovable")) {
			this.notifyUnhandledMouseDown(e, t, n);
			return;
		}
		let r = e.target.getAttribute("data-terminal"), i = this.prepareArrowheadDragging(r, {
			x: t,
			y: n
		});
		this.setEventData(e, i);
	}
	dragArrowhead(e, t, n) {
		let r = this.getEventData(e);
		this.graph.options.connecting.snap ? this.snapArrowhead(t, n, r) : this.arrowheadDragging(this.getEventTarget(e), t, n, r);
	}
	stopArrowheadDragging(e, t, n) {
		let r = this.graph, i = this.getEventData(e);
		r.options.connecting.snap ? this.snapArrowheadEnd(i) : this.arrowheadDragged(i, t, n), this.validateEdge(this.cell, i.terminalType, i.initialTerminal) ? (this.finishEmbedding(i), this.notifyConnectionEvent(i, e)) : this.fallbackConnection(i), this.afterArrowheadDragging(i);
	}
	startLabelDragging(e, t, n) {
		if (this.can("edgeLabelMovable")) {
			let t = e.currentTarget, n = parseInt(t.getAttribute("data-index"), 10), r = this.getLabelPositionAngle(n), i = this.getLabelPositionArgs(n), a = this.getDefaultLabelPositionArgs(), o = this.mergeLabelPositionArgs(i, a);
			this.setEventData(e, {
				index: n,
				positionAngle: r,
				positionArgs: o,
				stopPropagation: !0,
				action: "drag-label"
			});
		} else this.setEventData(e, { stopPropagation: !0 });
		this.graph.view.delegateDragEvents(e, this);
	}
	dragLabel(e, t, n) {
		let r = this.getEventData(e), i = P({}, this.cell.getLabelAt(r.index), { position: this.getLabelPosition(t, n, r.positionAngle, r.positionArgs) });
		this.cell.setLabelAt(r.index, i);
	}
	stopLabelDragging(e, t, n) {}
}, SS = `X6.${xS.name}`;
xS.config({
	isSvgElement: !0,
	priority: 1,
	bootstrap: [
		"render",
		"source",
		"target"
	],
	actions: {
		view: ["render"],
		markup: ["render"],
		attrs: ["update"],
		source: ["source", "update"],
		target: ["target", "update"],
		router: ["update"],
		connector: ["update"],
		labels: ["labels"],
		defaultLabel: ["labels"],
		tools: ["tools"],
		vertices: ["vertices", "update"]
	}
}), xS.registry.register("edge", xS, !0);
// node_modules/@antv/x6/es/renderer/queueJob.js
var CS = {
	idle: "idle",
	raf: "raf",
	timeout: "timeout"
}, wS = class {
	constructor() {
		this.isFlushing = !1, this.isFlushPending = !1, this.scheduleId = 0, this.queue = [], this.frameInterval = 16, this.initialTime = Date.now(), this.pendingJobs = /* @__PURE__ */ new Map(), this.scheduleMode = null;
	}
	queueJob(e) {
		if (e.priority & TS.PRIOR) e.cb();
		else {
			let t = this.pendingJobs.get(e.id);
			if (t) {
				if (t.cb = e.cb, e.priority !== t.priority) {
					t.priority = e.priority;
					let n = this.queue.indexOf(t);
					if (n >= 0) {
						this.queue.splice(n, 1);
						let e = this.findInsertionIndex(t);
						this.queue.splice(e, 0, t);
					}
				}
			} else {
				let t = this.findInsertionIndex(e);
				this.queue.splice(t, 0, e), this.pendingJobs.set(e.id, e);
			}
		}
	}
	queueFlush() {
		!this.isFlushing && !this.isFlushPending && (this.isFlushPending = !0, this.scheduleJob());
	}
	queueFlushSync() {
		!this.isFlushing && !this.isFlushPending && (this.isFlushPending = !0, this.flushJobsSync());
	}
	clearJobs() {
		this.queue.length = 0, this.pendingJobs.clear(), this.isFlushing = !1, this.isFlushPending = !1, this.cancelScheduleJob();
	}
	flushJobs(e) {
		this.isFlushPending = !1, this.isFlushing = !0;
		let t = this.getCurrentTime(), n = this.frameInterval;
		if (e && typeof e.timeRemaining == "function") {
			let t = e.timeRemaining();
			n = Math.max(0, Math.min(n, t));
		}
		for (; this.queue.length > 0;) {
			let e = this.queue.shift();
			if (e.cb(), this.pendingJobs.delete(e.id), this.getCurrentTime() - t >= n) break;
		}
		this.isFlushing = !1, this.queue.length && this.queueFlush();
	}
	flushJobsSync() {
		for (this.isFlushPending = !1, this.isFlushing = !0; this.queue.length > 0;) {
			let e = this.queue.shift();
			try {
				e.cb();
			} catch (e) {
				console.error(e);
			}
			this.pendingJobs.delete(e.id);
		}
		this.isFlushing = !1;
	}
	findInsertionIndex(e) {
		let t = 0, n = this.queue.length, r = n - 1, i = e.priority;
		for (; t <= r;) {
			let e = (r - t >> 1) + t;
			i <= this.queue[e].priority ? t = e + 1 : (n = e, r = e - 1);
		}
		return n;
	}
	scheduleJob() {
		this.scheduleId && this.cancelScheduleJob(), "requestAnimationFrame" in window ? (this.scheduleMode = CS.raf, this.scheduleId = window.requestAnimationFrame(() => this.flushJobs())) : "requestIdleCallback" in window ? (this.scheduleMode = CS.idle, this.scheduleId = window.requestIdleCallback((e) => this.flushJobs(e), { timeout: 100 })) : (this.scheduleMode = CS.timeout, this.scheduleId = window.setTimeout(() => this.flushJobs()));
	}
	cancelScheduleJob() {
		if (!this.scheduleId) return;
		let e = {
			[CS.idle]: window == null ? void 0 : window.cancelIdleCallback,
			[CS.raf]: window == null ? void 0 : window.cancelAnimationFrame,
			[CS.timeout]: window == null ? void 0 : window.clearTimeout
		}, t = this.scheduleMode, n = t ? e[t] : void 0;
		typeof n == "function" && n(this.scheduleId), this.scheduleId = 0, this.scheduleMode = null;
	}
	getCurrentTime() {
		return typeof performance == "object" && typeof performance.now == "function" ? performance.now() : Date.now() - this.initialTime;
	}
}, TS;
(function(e) {
	e[e.Update = 2] = "Update", e[e.RenderEdge = 4] = "RenderEdge", e[e.RenderNode = 8] = "RenderNode", e[e.PRIOR = 1048576] = "PRIOR";
})(TS || (TS = {}));
// node_modules/@antv/x6/es/renderer/scheduler.js
var ES;
(function(e) {
	e[e.CREATED = 0] = "CREATED", e[e.MOUNTED = 1] = "MOUNTED", e[e.WAITING = 2] = "WAITING";
})(ES || (ES = {}));
var DS = class extends bh {
	get model() {
		return this.graph.model;
	}
	get container() {
		return this.graph.view.stage;
	}
	constructor(e) {
		super(), this.views = {}, this.willRemoveViews = {}, this.queue = new wS(), this.graph = e, this.init();
	}
	init() {
		this.startListening(), this.renderViews(this.model.getCells());
	}
	startListening() {
		this.model.on("reseted", this.onModelReseted, this), this.model.on("cell:added", this.onCellAdded, this), this.model.on("cell:removed", this.onCellRemoved, this), this.model.on("cell:change:zIndex", this.onCellZIndexChanged, this), this.model.on("cell:change:visible", this.onCellVisibleChanged, this);
	}
	stopListening() {
		this.model.off("reseted", this.onModelReseted, this), this.model.off("cell:added", this.onCellAdded, this), this.model.off("cell:removed", this.onCellRemoved, this), this.model.off("cell:change:zIndex", this.onCellZIndexChanged, this), this.model.off("cell:change:visible", this.onCellVisibleChanged, this);
	}
	onModelReseted({ options: e, previous: t }) {
		let n = this.model.getCells();
		if (!e?.diff) this.queue.clearJobs(), this.removeZPivots(), this.resetViews();
		else {
			let e = new Set(t);
			n = n.filter((t) => !e.has(t));
		}
		this.renderViews(n, Object.assign(Object.assign({}, e), { queue: n.map((e) => e.id) }));
	}
	onCellAdded({ cell: e, options: t }) {
		this.renderViews([e], t);
	}
	onCellRemoved({ cell: e }) {
		this.removeViews([e]);
	}
	onCellZIndexChanged({ cell: e, options: t }) {
		let n = this.views[e.id];
		n && this.requestViewUpdate(n.view, vS, t, TS.Update, !0);
	}
	onCellVisibleChanged({ cell: e, current: t }) {
		this.toggleVisible(e, !!t);
	}
	requestViewUpdate(e, t, n = {}, r = TS.Update, i = !0) {
		let a = e.cell.id, o = this.views[a];
		if (!o) return;
		o.flag |= t;
		let s = o.options || {}, c = n || {};
		s.queue && c.queue == null && (c.queue = s.queue), (s.async === !1 || c.async === !1) && (c.async = !1), o.options = c, (e.hasAction(t, [
			"translate",
			"resize",
			"rotate"
		]) || c.async === !1) && (r = TS.PRIOR, i = !1), this.queue.queueJob({
			id: a,
			priority: r,
			cb: () => {
				let e = this.views[a];
				if (!e) return;
				let t = e.options || {};
				this.renderViewInArea(e.view, e.flag, t);
				let n = t.queue;
				if (n) {
					let t = n.indexOf(e.view.cell.id);
					t >= 0 && n.splice(t, 1), n.length === 0 && this.graph.trigger("render:done");
				}
			}
		}), this.getEffectedEdges(e).forEach((e) => {
			this.requestViewUpdate(e.view, e.flag, n, r, !1);
		}), i && this.flush();
	}
	setRenderArea(e) {
		this.renderArea = e, Object.values(this.views).forEach((e) => {
			if (!e) return;
			let { view: t } = e;
			e.state === ES.MOUNTED && (this.isUpdatable(t) || (t.remove(), this.graph.trigger("view:unmounted", { view: t }), e.state = ES.WAITING, e.flag |= vS | t.getBootstrapFlag()));
		}), this.flushWaitingViews();
	}
	isViewMounted(e) {
		if (e == null) return !1;
		let t = this.views[e.cell.id];
		return t ? t.state === ES.MOUNTED : !1;
	}
	renderViews(e, t = {}) {
		e.sort((e, t) => e.isNode() && t.isEdge() ? -1 : 0), e.forEach((e) => {
			let n = e.id, r = this.views, i = 0, a = r[n];
			if (a) i = vS;
			else {
				let r = this.createCellView(e);
				r && (r.graph = this.graph, i = vS | r.getBootstrapFlag(), a = {
					view: r,
					flag: i,
					options: t,
					state: ES.CREATED
				}, this.views[n] = a);
			}
			a && this.requestViewUpdate(a.view, i, t, this.getRenderPriority(a.view), !1);
		}), this.flush();
	}
	renderViewInArea(e, t, n = {}) {
		let r = e.cell, i = r.id, a = this.views[i];
		if (!a) return;
		let o = 0;
		this.isUpdatable(e) ? (o = this.updateView(e, t, n), a.flag = o) : (a.state === ES.MOUNTED && (e.remove(), this.graph.trigger("view:unmounted", { view: e }), o = 0), a.state = ES.WAITING, a.flag = t | vS | e.getBootstrapFlag()), o && r.isEdge() && (o & e.getFlag(["source", "target"])) === 0 && this.queue.queueJob({
			id: i,
			priority: TS.RenderEdge,
			cb: () => {
				this.updateView(e, t, n);
			}
		});
	}
	removeViews(e) {
		e.forEach((e) => {
			let t = e.id, n = this.views[t];
			n && (this.willRemoveViews[t] = n, delete this.views[t], this.queue.queueJob({
				id: t,
				priority: this.getRenderPriority(n.view),
				cb: () => {
					this.removeView(n.view);
				}
			}));
		}), this.flush();
	}
	flush() {
		this.graph.options.async ? this.queue.queueFlush() : this.queue.queueFlushSync();
	}
	flushWaitingViews() {
		Object.values(this.views).forEach((e) => {
			if (e && e.state === ES.WAITING) {
				let { view: t, flag: n, options: r } = e;
				this.requestViewUpdate(t, n, r, this.getRenderPriority(t), !1);
			}
		}), this.flush();
	}
	updateView(e, t, n = {}) {
		if (e == null) return 0;
		if (nx.isCellView(e)) {
			if (t & 536870912) return this.removeView(e), 0;
			t & 1073741824 && (this.insertView(e), t ^= vS);
		}
		return t ? e.confirmUpdate(t, n) : 0;
	}
	insertView(e) {
		let t = this.views[e.cell.id];
		if (t) {
			let n = e.cell.getZIndex(), r = this.addZPivot(n);
			this.container.insertBefore(e.container, r), e.cell.isVisible() || this.toggleVisible(e.cell, !1), t.state = ES.MOUNTED, this.graph.trigger("view:mounted", { view: e });
		}
	}
	resetViews() {
		this.willRemoveViews = Object.assign(Object.assign({}, this.views), this.willRemoveViews), Object.values(this.willRemoveViews).forEach((e) => {
			e && this.removeView(e.view);
		}), this.views = {}, this.willRemoveViews = {};
	}
	removeView(e) {
		let t = e.cell, n = this.willRemoveViews[t.id];
		n && e && (n.view.remove(), delete this.willRemoveViews[t.id], this.graph.trigger("view:unmounted", { view: e }));
	}
	toggleVisible(e, t) {
		let n = this.model.getConnectedEdges(e);
		for (let e = 0, r = n.length; e < r; e += 1) {
			let r = n[e];
			if (t) {
				let e = r.getSourceCell(), t = r.getTargetCell();
				if (e && !e.isVisible() || t && !t.isVisible()) continue;
				this.toggleVisible(r, !0);
			} else this.toggleVisible(r, !1);
		}
		let r = this.views[e.id];
		r && U(r.view.container, { display: t ? "unset" : "none" });
	}
	addZPivot(e = 0) {
		this.zPivots ?? (this.zPivots = {});
		let t = this.zPivots, n = t[e];
		if (n) return n;
		n = t[e] = document.createComment(`z-index:${e + 1}`);
		let r = -Infinity;
		for (let n in t) {
			let t = +n;
			t < e && t > r && (r = t, e - 1);
		}
		let i = this.container;
		if (r !== -Infinity) {
			let e = t[r];
			i.insertBefore(n, e.nextSibling);
		} else i.insertBefore(n, i.firstChild);
		return n;
	}
	removeZPivots() {
		this.zPivots && Object.values(this.zPivots).forEach((e) => {
			e && e.parentNode && e.parentNode.removeChild(e);
		}), this.zPivots = {};
	}
	createCellView(e) {
		let t = { graph: this.graph }, n = this.graph.options.createCellView;
		if (n) {
			let r = F(n, this.graph, e);
			if (r) return new r(e, t);
			if (r === null) return null;
		}
		let r = e.view;
		if (r != null && typeof r == "string") {
			let n = nx.registry.get(r);
			return n ? new n(e, t) : nx.registry.onNotFound(r);
		}
		return e.isNode() ? new yS(e, t) : e.isEdge() ? new xS(e, t) : null;
	}
	getEffectedEdges(e) {
		let t = [], n = e.cell, r = this.model.getConnectedEdges(n);
		for (let e = 0, i = r.length; e < i; e += 1) {
			let i = r[e], a = this.views[i.id];
			if (!a) continue;
			let o = a.view;
			if (!this.isViewMounted(o)) continue;
			let s = ["update"];
			i.getTargetCell() === n && s.push("target"), i.getSourceCell() === n && s.push("source"), t.push({
				id: i.id,
				view: o,
				flag: o.getFlag(s)
			});
		}
		return t;
	}
	isUpdatable(e) {
		if (e.isNodeView()) return !this.renderArea || this.renderArea.isIntersectWithRect(e.cell.getBBox());
		if (e.isEdgeView()) {
			let t = e.cell, n = !this.renderArea || this.renderArea.isIntersectWithRect(t.getBBox());
			if (this.graph.virtualRender.isVirtualEnabled()) return n;
			let r = t.getSourceCell(), i = t.getTargetCell();
			if (this.renderArea && r && i) return this.renderArea.isIntersectWithRect(r.getBBox()) || this.renderArea.isIntersectWithRect(i.getBBox());
		}
		return !0;
	}
	getRenderPriority(e) {
		return e.cell.isNode() ? TS.RenderNode : TS.RenderEdge;
	}
	dispose() {
		this.stopListening(), Object.keys(this.views).forEach((e) => {
			this.views[e].view.dispose();
		}), this.views = {};
	}
};
k([K()], DS.prototype, "dispose", null);
// node_modules/@antv/x6/es/renderer/renderer.js
var OS = class extends gS {
	constructor() {
		super(...arguments), this.schedule = new DS(this.graph);
	}
	requestViewUpdate(e, t, n = {}) {
		this.schedule.requestViewUpdate(e, t, n);
	}
	isViewMounted(e) {
		return this.schedule.isViewMounted(e);
	}
	setRenderArea(e) {
		this.schedule.setRenderArea(e);
	}
	findViewByElem(e) {
		if (e == null) return null;
		let t = this.options.container, n = typeof e == "string" ? t.querySelector(e) : e instanceof Element ? e : e[0];
		if (n) {
			let e = this.graph.view.findAttr("data-cell-id", n);
			if (e) {
				let t = this.schedule.views;
				if (t[e]) return t[e].view;
			}
		}
		return null;
	}
	findViewByCell(e) {
		if (e == null) return null;
		let t = X.isCell(e) ? e.id : e, n = this.schedule.views;
		return n[t] ? n[t].view : null;
	}
	findViewsFromPoint(e) {
		let t = {
			x: e.x,
			y: e.y
		};
		return this.model.getCells().map((e) => this.findViewByCell(e)).filter((e) => e != null && xm(e.container, { target: this.view.stage }).containsPoint(t));
	}
	findEdgeViewsFromPoint(e, t = 5) {
		return this.model.getEdges().map((e) => this.findViewByCell(e)).filter((n) => {
			if (n != null) {
				let r = n.getClosestPoint(e);
				if (r) return r.distance(e) <= t;
			}
			return !1;
		});
	}
	findViewsInArea(e, t = {}) {
		let n = L.create(e);
		return this.model.getCells().map((e) => this.findViewByCell(e)).filter((e) => {
			if (e) {
				if (t.nodeOnly && !e.isNodeView()) return !1;
				let r = xm(e.container, { target: this.view.stage });
				return r.width === 0 ? r.inflate(1, 0) : r.height === 0 && r.inflate(0, 1), t.strict ? n.containsRect(r) : n.isIntersectWithRect(r);
			}
			return !1;
		});
	}
	dispose() {
		this.schedule.dispose();
	}
};
k([K()], OS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/background.js
var kS = class extends gS {
	get elem() {
		return this.view.background;
	}
	init() {
		this.startListening(), this.options.background && this.draw(this.options.background);
	}
	startListening() {
		this.graph.on("scale", this.update, this), this.graph.on("translate", this.update, this);
	}
	stopListening() {
		this.graph.off("scale", this.update, this), this.graph.off("translate", this.update, this);
	}
	updateBackgroundImage(e = {}) {
		let t = e.size || "auto auto", n = e.position || "center", r = this.graph.transform.getScale(), i = this.graph.translate();
		typeof n == "object" && (n = `${i.tx + r.sx * (n.x || 0)}px ${i.ty + r.sy * (n.y || 0)}px`), typeof t == "object" && (t = L.fromSize(t).scale(r.sx, r.sy), t = `${t.width}px ${t.height}px`), this.elem.style.backgroundSize = t, this.elem.style.backgroundPosition = n;
	}
	drawBackgroundImage(e, t = {}) {
		if (!(e instanceof HTMLImageElement)) {
			this.elem.style.backgroundImage = "";
			return;
		}
		let n = this.optionsCache;
		if (n && n.image !== t.image) return;
		let r, i = t.opacity, a = t.size, o = t.repeat || "no-repeat", s = i_.get(o);
		if (typeof s == "function") {
			let n = t.quality || 1;
			e.width *= n, e.height *= n;
			let i = s(e, t);
			if (!(i instanceof HTMLCanvasElement)) throw Error("Background pattern must return an HTML Canvas instance");
			r = i.toDataURL("image/png"), o = t.repeat && o !== t.repeat ? t.repeat : "repeat", typeof a == "object" ? (a.width *= i.width / e.width, a.height *= i.height / e.height) : a === void 0 && (t.size = {
				width: i.width / n,
				height: i.height / n
			});
		} else r = e.src, a === void 0 && (t.size = {
			width: e.width,
			height: e.height
		});
		n != null && typeof t.size == "object" && t.image === n.image && t.repeat === n.repeat && t.quality === n.quality && (n.size = Ls(t.size));
		let c = this.elem.style;
		c.backgroundImage = `url(${r})`, c.backgroundRepeat = o, c.opacity = i == null || i >= 1 ? "" : `${i}`, this.updateBackgroundImage(t);
	}
	updateBackgroundColor(e) {
		this.elem.style.backgroundColor = e || "";
	}
	updateBackgroundOptions(e) {
		this.graph.options.background = e;
	}
	update() {
		this.optionsCache && this.updateBackgroundImage(this.optionsCache);
	}
	draw(e) {
		let t = e || {};
		if (this.updateBackgroundOptions(e), this.updateBackgroundColor(t.color), t.image) {
			this.optionsCache = Ls(t);
			let n = document.createElement("img");
			n.onload = () => this.drawBackgroundImage(n, e), n.setAttribute("crossorigin", "anonymous"), n.src = t.image;
		} else this.drawBackgroundImage(null), this.optionsCache = null;
	}
	clear() {
		this.draw();
	}
	dispose() {
		this.clear(), this.stopListening();
	}
};
k([K()], kS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/coord.js
var AS = class extends gS {
	getClientMatrix() {
		return hp(this.view.stage.getScreenCTM());
	}
	getClientOffset() {
		let e = this.view.svg.getBoundingClientRect();
		return new I(e.left, e.top);
	}
	getPageOffset() {
		return this.getClientOffset().translate(window.scrollX, window.scrollY);
	}
	snapToGrid(e, t) {
		return (typeof e == "number" ? this.clientToLocalPoint(e, t) : this.clientToLocalPoint(e.x, e.y)).snapToGrid(this.graph.getGridSize());
	}
	localToGraphPoint(e, t) {
		return _m(I.create(e, t), this.graph.matrix());
	}
	localToClientPoint(e, t) {
		return _m(I.create(e, t), this.getClientMatrix());
	}
	localToPagePoint(e, t) {
		return (typeof e == "number" ? this.localToGraphPoint(e, t) : this.localToGraphPoint(e)).translate(this.getPageOffset());
	}
	localToGraphRect(e, t, n, r) {
		return ym(L.create(e, t, n, r), this.graph.matrix());
	}
	localToClientRect(e, t, n, r) {
		return ym(L.create(e, t, n, r), this.getClientMatrix());
	}
	localToPageRect(e, t, n, r) {
		return (typeof e == "number" ? this.localToGraphRect(e, t, n, r) : this.localToGraphRect(e)).translate(this.getPageOffset());
	}
	graphToLocalPoint(e, t) {
		return _m(I.create(e, t), this.graph.matrix().inverse());
	}
	clientToLocalPoint(e, t) {
		return _m(I.create(e, t), this.getClientMatrix().inverse());
	}
	clientToGraphPoint(e, t) {
		return _m(I.create(e, t), this.graph.matrix().multiply(this.getClientMatrix().inverse()));
	}
	pageToLocalPoint(e, t) {
		let n = I.create(e, t).diff(this.getPageOffset());
		return this.graphToLocalPoint(n);
	}
	graphToLocalRect(e, t, n, r) {
		return ym(L.create(e, t, n, r), this.graph.matrix().inverse());
	}
	clientToLocalRect(e, t, n, r) {
		return ym(L.create(e, t, n, r), this.getClientMatrix().inverse());
	}
	clientToGraphRect(e, t, n, r) {
		return ym(L.create(e, t, n, r), this.graph.matrix().multiply(this.getClientMatrix().inverse()));
	}
	pageToLocalRect(e, t, n, r) {
		let i = L.create(e, t, n, r), a = this.getPageOffset();
		return i.x -= a.x, i.y -= a.y, this.graphToLocalRect(i);
	}
}, jS = ".x6-graph {\n  position: relative;\n  overflow: hidden;\n  outline: none;\n  touch-action: none;\n}\n.x6-graph-background,\n.x6-graph-grid,\n.x6-graph-svg {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n}\n.x6-graph-background-stage,\n.x6-graph-grid-stage,\n.x6-graph-svg-stage {\n  user-select: none;\n}\n.x6-graph.x6-graph-pannable {\n  cursor: grab;\n  cursor: -moz-grab;\n  cursor: -webkit-grab;\n}\n.x6-graph.x6-graph-panning {\n  cursor: grabbing;\n  cursor: -moz-grabbing;\n  cursor: -webkit-grabbing;\n  user-select: none;\n}\n.x6-node {\n  cursor: move;\n  /* stylelint-disable-next-line */\n}\n.x6-node.x6-node-immovable {\n  cursor: default;\n}\n.x6-node * {\n  -webkit-user-drag: none;\n}\n.x6-node .scalable * {\n  vector-effect: non-scaling-stroke;\n}\n.x6-node [magnet='true'] {\n  cursor: crosshair;\n  transition: opacity 0.3s;\n}\n.x6-node [magnet='true']:hover {\n  opacity: 0.7;\n}\n.x6-node foreignObject {\n  display: block;\n  overflow: visible;\n  background-color: transparent;\n}\n.x6-node foreignObject > body {\n  position: static;\n  width: 100%;\n  height: 100%;\n  margin: 0;\n  padding: 0;\n  overflow: visible;\n  background-color: transparent;\n}\n.x6-edge .source-marker,\n.x6-edge .target-marker {\n  vector-effect: non-scaling-stroke;\n}\n.x6-edge .connection {\n  stroke-linejoin: round;\n  fill: none;\n}\n.x6-edge .connection-wrap {\n  cursor: move;\n  opacity: 0;\n  fill: none;\n  stroke: #000;\n  stroke-width: 15;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n.x6-edge .connection-wrap:hover {\n  opacity: 0.4;\n  stroke-opacity: 0.4;\n}\n.x6-edge .vertices {\n  cursor: move;\n  opacity: 0;\n}\n.x6-edge .vertices .vertex {\n  fill: #1abc9c;\n}\n.x6-edge .vertices .vertex :hover {\n  fill: #34495e;\n  stroke: none;\n}\n.x6-edge .vertices .vertex-remove {\n  cursor: pointer;\n  fill: #fff;\n}\n.x6-edge .vertices .vertex-remove-area {\n  cursor: pointer;\n  opacity: 0.1;\n}\n.x6-edge .vertices .vertex-group:hover .vertex-remove-area {\n  opacity: 1;\n}\n.x6-edge .arrowheads {\n  cursor: move;\n  opacity: 0;\n}\n.x6-edge .arrowheads .arrowhead {\n  fill: #1abc9c;\n}\n.x6-edge .arrowheads .arrowhead :hover {\n  fill: #f39c12;\n  stroke: none;\n}\n.x6-edge .tools {\n  cursor: pointer;\n  opacity: 0;\n}\n.x6-edge .tools .tool-options {\n  display: none;\n}\n.x6-edge .tools .tool-remove circle {\n  fill: #f00;\n}\n.x6-edge .tools .tool-remove path {\n  fill: #fff;\n}\n.x6-edge:hover .vertices,\n.x6-edge:hover .arrowheads,\n.x6-edge:hover .tools {\n  opacity: 1;\n}\n.x6-highlight-opacity {\n  opacity: 0.3;\n}\n.x6-cell-tool-editor {\n  position: relative;\n  display: inline-block;\n  min-height: 1em;\n  margin: 0;\n  padding: 0;\n  line-height: 1;\n  white-space: normal;\n  text-align: center;\n  vertical-align: top;\n  overflow-wrap: normal;\n  outline: none;\n  transform-origin: 0 0;\n  -webkit-user-drag: none;\n  cursor: text;\n}\n.x6-edge-tool-editor {\n  border: 1px solid #275fc5;\n  border-radius: 2px;\n}\n", MS = class extends gS {
	init() {
		J.autoInsertCSS && bu("core", jS);
	}
	dispose() {
		xu("core");
	}
};
k([K()], MS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/defs.js
var NS = class extends gS {
	get cid() {
		return this.graph.view.cid;
	}
	get svg() {
		return this.view.svg;
	}
	get defs() {
		return this.view.defs;
	}
	isDefined(e) {
		return this.svg.getElementById(e) != null;
	}
	filter(e) {
		let t = e.id, n = e.name;
		if (t || (t = `filter-${n}-${this.cid}-${yf(JSON.stringify(e))}`), !this.isDefined(t)) {
			let r = rv.get(n);
			if (r == null) return rv.onNotFound(n);
			let i = r(e.args || {}), a = Object.assign(Object.assign({
				x: -1,
				y: -1,
				width: 3,
				height: 3,
				filterUnits: "objectBoundingBox"
			}, e.attrs), { id: t });
			W.create(Hb.sanitize(i), a).appendTo(this.defs);
		}
		return t;
	}
	gradient(e) {
		let t = e.id, n = e.type;
		if (t || (t = `gradient-${n}-${this.cid}-${yf(JSON.stringify(e))}`), !this.isDefined(t)) {
			let r = `<${n}>${e.stops.map((e) => {
				let t = e.opacity != null && Number.isFinite(e.opacity) ? e.opacity : 1;
				return `<stop offset="${e.offset}" stop-color="${e.color}" stop-opacity="${t}"/>`;
			}).join("")}</${n}>`, i = Object.assign({ id: t }, e.attrs);
			W.create(r, i).appendTo(this.defs);
		}
		return t;
	}
	marker(e) {
		let { id: t, refX: n, refY: r, markerUnits: i, markerOrient: a, tagName: o, children: s } = e, c = O(e, [
			"id",
			"refX",
			"refY",
			"markerUnits",
			"markerOrient",
			"tagName",
			"children"
		]), l = t;
		if (l || (l = `marker-${this.cid}-${yf(JSON.stringify(e))}`), !this.isDefined(l)) {
			o !== "path" && delete c.d;
			let e = W.create("marker", {
				refX: n,
				refY: r,
				id: l,
				overflow: "visible",
				orient: a ?? "auto",
				markerUnits: i || "userSpaceOnUse"
			}, s ? s.map((e) => {
				var { tagName: t } = e, n = O(e, ["tagName"]);
				return W.create(`${t}` || "path", nf(Object.assign(Object.assign({}, c), n)));
			}) : [W.create(o || "path", nf(c))]);
			this.defs.appendChild(e.node);
		}
		return l;
	}
	remove(e) {
		let t = this.svg.getElementById(e);
		t && t.parentNode && t.parentNode.removeChild(t);
	}
}, PS = class extends gS {
	get elem() {
		return this.view.grid;
	}
	get grid() {
		return this.options.grid;
	}
	init() {
		this.startListening(), this.draw(this.grid);
	}
	startListening() {
		this.graph.on("scale", this.update, this), this.graph.on("translate", this.update, this);
	}
	stopListening() {
		this.graph.off("scale", this.update, this), this.graph.off("translate", this.update, this);
	}
	setVisible(e) {
		this.grid.visible !== e && (this.grid.visible = e, this.update());
	}
	getGridSize() {
		return this.grid.size;
	}
	setGridSize(e) {
		this.grid.size = Math.max(e, 1), this.update();
	}
	show() {
		this.setVisible(!0), this.update();
	}
	hide() {
		this.setVisible(!1), this.update();
	}
	clear() {
		this.elem.style.backgroundImage = "";
	}
	draw(e) {
		this.clear(), this.instance = null, Object.assign(this.grid, e), this.patterns = this.resolveGrid(e), this.update();
	}
	update(e = {}) {
		let t = this.grid.size;
		if (t <= 1 || !this.grid.visible) return this.clear();
		let n = this.graph.matrix(), r = this.getInstance(), i = Array.isArray(e) ? e : [e];
		this.patterns.forEach((e, a) => {
			let o = `pattern_${a}`, s = n.a || 1, c = n.d || 1, { update: l, markup: u } = e, d = O(e, ["update", "markup"]), f = Object.assign(Object.assign(Object.assign({}, d), i[a]), {
				sx: s,
				sy: c,
				ox: n.e || 0,
				oy: n.f || 0,
				width: t * s,
				height: t * c
			});
			r.has(o) || r.add(o, W.create("pattern", {
				id: o,
				patternUnits: "userSpaceOnUse"
			}, W.createVectors(u)).node);
			let p = r.get(o);
			typeof l == "function" && l(p.childNodes[0], f);
			let m = f.ox % f.width;
			m < 0 && (m += f.width);
			let h = f.oy % f.height;
			h < 0 && (h += f.height), H(p, {
				x: m,
				y: h,
				width: f.width,
				height: f.height
			});
		});
		let a = new XMLSerializer().serializeToString(r.root), o = `url(data:image/svg+xml;base64,${btoa(a)})`;
		this.elem.style.backgroundImage = o;
	}
	getInstance() {
		return this.instance || (this.instance = new lv()), this.instance;
	}
	resolveGrid(e) {
		if (!e) return [];
		let t = e.type;
		if (t == null) return [Object.assign(Object.assign({}, uv.dot), e.args)];
		let n = dv.get(t);
		if (n) {
			let t = e.args || [];
			return Array.isArray(t) || (t = [t]), Array.isArray(n) ? n.map((e, n) => Object.assign(Object.assign({}, e), t[n])) : [Object.assign(Object.assign({}, n), t[0])];
		}
		return dv.onNotFound(t);
	}
	dispose() {
		this.stopListening(), this.clear();
	}
};
k([K()], PS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/highlight.js
var FS = class extends gS {
	constructor() {
		super(...arguments), this.highlights = {};
	}
	init() {
		this.startListening();
	}
	startListening() {
		this.graph.on("cell:highlight", this.onCellHighlight, this), this.graph.on("cell:unhighlight", this.onCellUnhighlight, this);
	}
	stopListening() {
		this.graph.off("cell:highlight", this.onCellHighlight, this), this.graph.off("cell:unhighlight", this.onCellUnhighlight, this);
	}
	onCellHighlight({ view: e, magnet: t, options: n = {} }) {
		let r = this.resolveHighlighter(n);
		if (!r) return;
		let i = this.getHighlighterId(t, r);
		if (!this.highlights[i]) {
			let n = r.highlighter;
			n.highlight(e, t, Object.assign({}, r.args)), this.highlights[i] = {
				cellView: e,
				magnet: t,
				highlighter: n,
				args: r.args
			};
		}
	}
	onCellUnhighlight({ magnet: e, options: t = {} }) {
		let n = this.resolveHighlighter(t);
		if (!n) return;
		let r = this.getHighlighterId(e, n);
		this.unhighlight(r);
	}
	resolveHighlighter(e) {
		let t = this.options, n = e.highlighter;
		if (n == null) {
			let r = e.type;
			n = r && t.highlighting[r] || t.highlighting.default;
		}
		if (n == null) return null;
		let r = typeof n == "string" ? { name: n } : n, i = r.name, a = Ev.get(i);
		return a == null ? Ev.onNotFound(i) : (wv(i, a), {
			name: i,
			highlighter: a,
			args: r.args || {}
		});
	}
	getHighlighterId(e, t) {
		return Cd(e), t.name + e.id + JSON.stringify(t.args);
	}
	unhighlight(e) {
		let t = this.highlights[e];
		t && (t.highlighter.unhighlight(t.cellView, t.magnet, t.args), delete this.highlights[e]);
	}
	dispose() {
		Object.keys(this.highlights).forEach((e) => this.unhighlight(e)), this.stopListening();
	}
};
k([K()], FS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/mousewheel.js
var IS = class extends gS {
	constructor() {
		super(...arguments), this.cumulatedFactor = 1;
	}
	get widgetOptions() {
		return this.options.mousewheel;
	}
	init() {
		this.container = this.graph.container, this.target = this.widgetOptions.global ? document : this.container, this.mousewheelHandle = new fm(this.target, this.onMouseWheel.bind(this), this.allowMouseWheel.bind(this)), this.widgetOptions.enabled && this.enable(!0);
	}
	get disabled() {
		return this.widgetOptions.enabled !== !0;
	}
	enable(e) {
		(this.disabled || e) && (this.widgetOptions.enabled = !0, this.mousewheelHandle.enable());
	}
	disable() {
		this.disabled || (this.widgetOptions.enabled = !1, this.mousewheelHandle.disable());
	}
	allowMouseWheel(e) {
		let t = this.widgetOptions.guard;
		return (t == null || t(e)) && Th(e, this.widgetOptions.modifiers);
	}
	onMouseWheel(e) {
		let t = this.widgetOptions.guard;
		if ((t == null || t(e)) && Th(e, this.widgetOptions.modifiers)) {
			let t = this.widgetOptions.factor || 1.2;
			this.currentScale ?? (this.startPos = {
				x: e.clientX,
				y: e.clientY
			}, this.currentScale = this.graph.transform.getScale().sx), e.deltaY < 0 ? (this.cumulatedFactor = this.currentScale < .15 ? (this.currentScale + .01) / this.currentScale : Math.round(this.currentScale * t * 20) / 20 / this.currentScale, this.cumulatedFactor <= 1 && (this.cumulatedFactor = 1.05)) : (this.cumulatedFactor = this.currentScale <= .15 ? (this.currentScale - .01) / this.currentScale : Math.round(this.currentScale * (1 / t) * 20) / 20 / this.currentScale, this.cumulatedFactor >= 1 && (this.cumulatedFactor = .95)), this.cumulatedFactor = Math.max(.01, Math.min(this.currentScale * this.cumulatedFactor, 160) / this.currentScale);
			let n = this.currentScale, r = this.graph.transform.clampScale(n * this.cumulatedFactor), i = this.widgetOptions.minScale || -(2 ** 53 - 1), a = this.widgetOptions.maxScale || 2 ** 53 - 1;
			if (r = ja(r, i, a), r !== n) {
				if (this.widgetOptions.zoomAtMousePosition) {
					let e = this.graph.getPlugin("scroller") ? this.graph.clientToLocal(this.startPos) : this.graph.clientToGraph(this.startPos);
					this.graph.zoom(r, {
						absolute: !0,
						center: e.clone()
					});
				} else this.graph.zoom(r, { absolute: !0 });
			}
			this.currentScale = null, this.cumulatedFactor = 1;
		}
	}
	dispose() {
		this.disable();
	}
};
k([K()], IS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/options.js
function LS(e) {
	let { container: t, grid: n, panning: r, mousewheel: i, embedding: a } = e, o = O(e, [
		"container",
		"grid",
		"panning",
		"mousewheel",
		"embedding"
	]), s = RS(t);
	o.width ?? (o.width = s.clientWidth), o.height ?? (o.height = s.clientHeight);
	let c = P({}, BS, o, { container: s }), l = {
		size: 10,
		visible: !1
	};
	return c.grid = typeof n == "number" ? {
		size: n,
		visible: !1
	} : typeof n == "boolean" ? Object.assign(Object.assign({}, l), { visible: n }) : Object.assign(Object.assign({}, l), n), [
		"panning",
		"mousewheel",
		"embedding"
	].forEach((t) => {
		let n = e[t];
		typeof n == "boolean" ? c[t].enabled = n : n != null && (c[t] = Object.assign(Object.assign({}, c[t]), n));
	}), c;
}
function RS(e) {
	if (typeof e != "string") {
		if (zS(e)) return e;
		throw Error("Ensure the container of the graph is specified and valid");
	}
	let t = e.trim(), n = t ? document.getElementById(t) : null;
	if (!zS(n)) throw Error(`Cannot find the graph container: "${e}"`);
	return n;
}
function zS(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e.ownerDocument?.defaultView;
	return t != null && e instanceof t.HTMLElement;
}
var BS = {
	x: 0,
	y: 0,
	scaling: {
		min: .01,
		max: 16
	},
	grid: {
		size: 10,
		visible: !1
	},
	background: !1,
	panning: {
		enabled: !0,
		eventTypes: ["leftMouseDown"]
	},
	mousewheel: {
		enabled: !1,
		factor: 1.2,
		zoomAtMousePosition: !0
	},
	highlighting: {
		default: {
			name: "stroke",
			args: { padding: 3 }
		},
		nodeAvailable: {
			name: "className",
			args: { className: J.prefix("available-node") }
		},
		magnetAvailable: {
			name: "className",
			args: { className: J.prefix("available-magnet") }
		}
	},
	connecting: {
		snap: !1,
		allowLoop: !0,
		allowNode: !0,
		allowEdge: !1,
		allowPort: !0,
		allowBlank: !0,
		allowMulti: !0,
		highlight: !1,
		anchor: "center",
		edgeAnchor: "ratio",
		connectionPoint: "boundary",
		router: "normal",
		connector: "normal",
		validateConnection({ type: e, sourceView: t, targetView: n }) {
			return (e === "target" ? n : t) != null;
		},
		createEdge() {
			return new hS();
		}
	},
	translating: { restrict: !1 },
	embedding: {
		enabled: !1,
		findParent: "bbox",
		frontOnly: !0,
		validate: () => !0
	},
	moveThreshold: 0,
	clickThreshold: 0,
	magnetThreshold: 0,
	preventDefaultDblClick: !0,
	preventDefaultMouseDown: !1,
	preventDefaultContextMenu: !0,
	preventDefaultBlankAction: !0,
	interacting: { edgeLabelMovable: !1 },
	async: !0,
	virtual: !1,
	guard: () => !1
}, VS = class extends gS {
	get widgetOptions() {
		return this.options.panning;
	}
	get pannable() {
		return this.widgetOptions && this.widgetOptions.enabled === !0;
	}
	init() {
		this.onRightMouseDown = this.onRightMouseDown.bind(this), this.onKeyDown = this.onKeyDown.bind(this), this.onKeyUp = this.onKeyUp.bind(this), this.startListening(), this.updateClassName();
	}
	startListening() {
		this.graph.on("blank:mousedown", this.onMouseDown, this), this.graph.on("node:unhandled:mousedown", this.onMouseDown, this), this.graph.on("edge:unhandled:mousedown", this.onMouseDown, this), G.on(this.graph.container, "mousedown", this.onRightMouseDown), G.on(document.body, {
			keydown: this.onKeyDown,
			keyup: this.onKeyUp
		}), this.mousewheelHandle = new fm(this.graph.container, this.onMouseWheel.bind(this), this.allowMouseWheel.bind(this)), this.mousewheelHandle.enable();
	}
	stopListening() {
		this.graph.off("blank:mousedown", this.onMouseDown, this), this.graph.off("node:unhandled:mousedown", this.onMouseDown, this), this.graph.off("edge:unhandled:mousedown", this.onMouseDown, this), G.off(this.graph.container, "mousedown", this.onRightMouseDown), G.off(document.body, {
			keydown: this.onKeyDown,
			keyup: this.onKeyUp
		}), this.mousewheelHandle && this.mousewheelHandle.disable();
	}
	allowPanning(e, t) {
		return e.spaceKey = this.isSpaceKeyPressed, this.pannable && Th(e, this.widgetOptions.modifiers, t);
	}
	startPanning(e) {
		let t = this.view.normalizeEvent(e);
		this.clientX = t.clientX, this.clientY = t.clientY, this.panning = !0, this.updateClassName(e), G.on(document.body, {
			"mousemove.panning touchmove.panning": this.pan.bind(this),
			"mouseup.panning touchend.panning": this.stopPanning.bind(this),
			"mouseleave.panning": this.stopPanning.bind(this)
		}), G.on(window, "mouseup.panning", this.stopPanning.bind(this));
	}
	pan(e) {
		let t = this.view.normalizeEvent(e), n = t.clientX - this.clientX, r = t.clientY - this.clientY;
		this.clientX = t.clientX, this.clientY = t.clientY, this.graph.translateBy(n, r);
	}
	stopPanning(e) {
		this.panning = !1, this.updateClassName(e), G.off(document.body, ".panning"), G.off(window, ".panning");
	}
	updateClassName(e) {
		let t = this.widgetOptions.eventTypes;
		if (t?.length === 1 && t.includes("mouseWheel")) return;
		let n = this.view.container, r = this.view.prefixClassName("graph-panning"), i = this.view.prefixClassName("graph-pannable"), a = this.graph.getPlugin("selection"), o = a && a.allowRubberband(e, !0), s = t?.includes("leftMouseDown") && !o;
		this.allowPanning(e ?? {}, !0) || this.allowPanning(e ?? {}) && s ? this.panning ? (B(n, r), V(n, i)) : (V(n, r), B(n, i)) : this.panning || (V(n, r), V(n, i));
	}
	onMouseDown({ e }) {
		if (!this.allowBlankMouseDown(e)) return;
		let t = this.graph.getPlugin("selection"), n = t && t.allowRubberband(e, !0);
		(this.allowPanning(e, !0) || this.allowPanning(e) && !n) && this.startPanning(e);
	}
	onRightMouseDown(e) {
		this.widgetOptions.eventTypes?.includes("rightMouseDown") && e.button === 2 && this.allowPanning(e, !0) && this.startPanning(e);
	}
	onMouseWheel(e, t, n) {
		this.graph.translateBy(-t, -n);
	}
	onKeyDown(e) {
		e.which === 32 && (this.isSpaceKeyPressed = !0), this.updateClassName(e);
	}
	onKeyUp(e) {
		e.which === 32 && (this.isSpaceKeyPressed = !1), this.updateClassName(e);
	}
	allowBlankMouseDown(e) {
		let t = this.widgetOptions.eventTypes;
		return typeof e.type == "string" && e.type.startsWith("touch") || e.pointerType === "touch" ? t?.includes("leftMouseDown") : t?.includes("leftMouseDown") && e.button === 0 || t?.includes("mouseWheelDown") && e.button === 1;
	}
	allowMouseWheel(e) {
		return this.pannable && !e.ctrlKey && this.widgetOptions.eventTypes?.includes("mouseWheel");
	}
	autoPanning(e, t) {
		let n = this.graph.getGraphArea(), r = 0, i = 0;
		e <= n.left + 10 && (r = -10), t <= n.top + 10 && (i = -10), e >= n.right - 10 && (r = 10), t >= n.bottom - 10 && (i = 10), (r !== 0 || i !== 0) && this.graph.translateBy(-r, -i);
	}
	enablePanning() {
		this.pannable || (this.widgetOptions.enabled = !0, this.updateClassName());
	}
	disablePanning() {
		this.pannable && (this.widgetOptions.enabled = !1, this.updateClassName());
	}
	dispose() {
		this.stopListening();
	}
};
k([K()], VS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/size.js
var HS = class extends gS {
	getScroller() {
		let e = this.graph.getPlugin("scroller");
		return e && e.options.enabled ? e : null;
	}
	getContainer() {
		let e = this.getScroller();
		return e ? e.container.parentElement : this.graph.container.parentElement;
	}
	getSensorTarget() {
		let e = this.options.autoResize;
		if (e) return typeof e == "boolean" ? this.getContainer() || void 0 : e;
	}
	init() {
		if (this.options.autoResize) {
			let e = this.getSensorTarget();
			if (e) {
				if (typeof ResizeObserver > "u") return;
				this.ro = new ResizeObserver((e) => {
					if (!e || e.length === 0) return;
					let { width: t, height: n } = e[0].contentRect;
					this.resize(Math.round(t), Math.round(n));
				}), this.ro.observe(e);
				let t = e.offsetWidth, n = e.offsetHeight;
				this.resize(t, n);
			}
		}
	}
	resize(e, t) {
		let n = this.getScroller();
		n ? n.resize(e, t) : this.graph.transform.resize(e, t);
	}
	dispose() {
		this.ro && (this.ro.disconnect(), this.ro = void 0);
	}
};
k([K()], HS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/transform.js
var US = class extends gS {
	get container() {
		return this.graph.view.container;
	}
	get viewport() {
		return this.graph.view.viewport;
	}
	get stage() {
		return this.graph.view.stage;
	}
	init() {
		this.resize();
	}
	getMatrix() {
		let e = this.viewport.getAttribute("transform");
		return e !== this.viewportTransformString && (this.viewportMatrix = this.viewport.getCTM(), this.viewportTransformString = e), hp(this.viewportMatrix);
	}
	setMatrix(e) {
		let t = hp(e), n = vp(t);
		this.viewport.setAttribute("transform", n), this.viewportMatrix = t, this.viewportTransformString = n;
	}
	resize(e, t) {
		let n = e === void 0 ? this.options.width : e, r = t === void 0 ? this.options.height : t;
		this.options.width = n, this.options.height = r, typeof n == "number" && (n = Math.round(n)), typeof r == "number" && (r = Math.round(r)), this.container.style.width = n == null ? "" : `${n}px`, this.container.style.height = r == null ? "" : `${r}px`;
		let i = this.getComputedSize();
		return this.graph.trigger("resize", Object.assign({}, i)), this;
	}
	getComputedSize() {
		let e = this.options.width, t = this.options.height;
		return Ol(e) || (e = this.container.clientWidth), Ol(t) || (t = this.container.clientHeight), {
			width: e,
			height: t
		};
	}
	getScale() {
		return Sp(this.getMatrix());
	}
	scale(e, t = e, n = 0, r = 0, i = !0) {
		if (e = this.clampScale(e), t = this.clampScale(t), i && (n || r)) {
			let i = this.getTranslation(), a = this.getScale(), o = n - (n - i.tx) * (e / a.sx), s = r - (r - i.ty) * (t / a.sy);
			(o !== i.tx || s !== i.ty) && this.translate(o, s);
		}
		let a = this.getMatrix();
		return a.a = e, a.d = t, this.setMatrix(a), this.graph.trigger("scale", {
			sx: e,
			sy: t,
			ox: n,
			oy: r
		}), this;
	}
	clampScale(e) {
		let t = this.graph.options.scaling;
		return ja(e, t.min || .01, t.max || 16);
	}
	getZoom() {
		return this.getScale().sx;
	}
	zoom(e, t) {
		t = t || {};
		let n = e, r = e, i = this.getScale(), a = this.getComputedSize(), o = a.width / 2, s = a.height / 2;
		return t.absolute || (n += i.sx, r += i.sy), t.scaleGrid && (n = Math.round(n / t.scaleGrid) * t.scaleGrid, r = Math.round(r / t.scaleGrid) * t.scaleGrid), t.maxScale && (n = Math.min(t.maxScale, n), r = Math.min(t.maxScale, r)), t.minScale && (n = Math.max(t.minScale, n), r = Math.max(t.minScale, r)), t.center && (o = t.center.x, s = t.center.y), n = this.clampScale(n), r = this.clampScale(r), this.scale(n, r, o, s), this;
	}
	getRotation() {
		return Cp(this.getMatrix());
	}
	rotate(e, t, n) {
		if (t == null || n == null) {
			let e = xm(this.stage);
			t = e.width / 2, n = e.height / 2;
		}
		let r = this.getMatrix().translate(t, n).rotate(e).translate(-t, -n);
		return this.setMatrix(r), this;
	}
	getTranslation() {
		return wp(this.getMatrix());
	}
	translate(e, t) {
		let n = this.getMatrix();
		n.e = e || 0, n.f = t || 0, this.setMatrix(n);
		let r = this.getTranslation();
		return this.options.x = r.tx, this.options.y = r.ty, this.graph.trigger("translate", Object.assign({}, r)), this;
	}
	setOrigin(e, t) {
		return this.translate(e || 0, t || 0);
	}
	fitToContent(e, t, n, r) {
		if (typeof e == "object") {
			let i = e;
			e = i.gridWidth || 1, t = i.gridHeight || 1, n = i.padding || 0, r = i;
		} else e = e || 1, t = t || 1, n = n || 0, r ?? (r = {});
		let i = ou(n), a = r.border || 0, o = r.contentArea ? L.create(r.contentArea) : this.getContentArea(r);
		a > 0 && o.inflate(a);
		let s = this.getScale(), c = this.getTranslation(), l = s.sx, u = s.sy;
		o.x *= l, o.y *= u, o.width *= l, o.height *= u;
		let d = Math.max(Math.ceil((o.width + o.x) / e), 1) * e, f = Math.max(Math.ceil((o.height + o.y) / t), 1) * t, p = 0, m = 0;
		(r.allowNewOrigin === "negative" && o.x < 0 || r.allowNewOrigin === "positive" && o.x >= 0 || r.allowNewOrigin === "any") && (p = Math.ceil(-o.x / e) * e, p += i.left, d += p), (r.allowNewOrigin === "negative" && o.y < 0 || r.allowNewOrigin === "positive" && o.y >= 0 || r.allowNewOrigin === "any") && (m = Math.ceil(-o.y / t) * t, m += i.top, f += m), d += i.right, f += i.bottom, d = Math.max(d, r.minWidth || 0), f = Math.max(f, r.minHeight || 0), d = Math.min(d, r.maxWidth || 2 ** 53 - 1), f = Math.min(f, r.maxHeight || 2 ** 53 - 1);
		let h = this.getComputedSize(), g = d !== h.width || f !== h.height;
		return (p !== c.tx || m !== c.ty) && this.translate(p, m), g && this.resize(d, f), new L(-p / l, -m / u, d / l, f / u);
	}
	scaleContentToFit(e = {}) {
		this.scaleContentToFitImpl(e);
	}
	scaleContentToFitImpl(e = {}, t = !0) {
		let n, r;
		if (e.contentArea) {
			let t = e.contentArea;
			n = this.graph.localToGraph(t), r = I.create(t);
		} else n = this.getContentBBox(e), r = this.graph.graphToLocal(n);
		if (!n.width || !n.height) return;
		let i = ou(e.padding), a = e.minScale || 0, o = e.maxScale || 2 ** 53 - 1, s = e.minScaleX || a, c = e.maxScaleX || o, l = e.minScaleY || a, u = e.maxScaleY || o, d;
		if (e.viewportArea) d = e.viewportArea;
		else {
			let e = this.getComputedSize(), t = this.getTranslation();
			d = {
				x: t.tx,
				y: t.ty,
				width: e.width,
				height: e.height
			};
		}
		d = L.create(d).moveAndExpand({
			x: i.left,
			y: i.top,
			width: -i.left - i.right,
			height: -i.top - i.bottom
		});
		let f = this.getScale(), p = d.width / n.width * f.sx, m = d.height / n.height * f.sy;
		e.preserveAspectRatio !== !1 && (p = m = Math.min(p, m));
		let h = e.scaleGrid;
		if (h && (p = h * Math.floor(p / h), m = h * Math.floor(m / h)), p = ja(p, s, c), m = ja(m, l, u), this.scale(p, m), t) {
			let e = this.options, t = d.x - r.x * p - e.x, n = d.y - r.y * m - e.y;
			this.translate(t, n);
		}
	}
	getContentArea(e = {}) {
		return e.useCellGeometry === !1 ? xm(this.stage) : this.model.getAllCellsBBox() || new L();
	}
	getContentBBox(e = {}) {
		return this.graph.localToGraph(this.getContentArea(e));
	}
	getGraphArea() {
		let e = L.fromSize(this.getComputedSize());
		return this.graph.graphToLocal(e);
	}
	zoomToRect(e, t = {}) {
		let n = L.create(e), r = this.graph;
		t.contentArea = n, t.viewportArea ?? (t.viewportArea = {
			x: r.options.x,
			y: r.options.y,
			width: this.options.width,
			height: this.options.height
		}), this.scaleContentToFitImpl(t, !1);
		let i = n.getCenter();
		return this.centerPoint(i.x, i.y), this;
	}
	zoomToFit(e = {}) {
		return this.zoomToRect(this.getContentArea(e), e);
	}
	centerPoint(e, t) {
		let n = this.getComputedSize(), r = this.getScale(), i = this.getTranslation(), a = n.width / 2, o = n.height / 2;
		e = typeof e == "number" ? e : a, t = typeof t == "number" ? t : o, e = a - e * r.sx, t = o - t * r.sy, (i.tx !== e || i.ty !== t) && this.translate(e, t);
	}
	centerContent(e) {
		let t = this.graph.getContentArea(e).getCenter();
		this.centerPoint(t.x, t.y);
	}
	centerCell(e) {
		return this.positionCell(e, "center");
	}
	positionPoint(e, t, n) {
		let r = this.getComputedSize();
		t = au(t, Math.max(0, r.width)), t < 0 && (t = r.width + t), n = au(n, Math.max(0, r.height)), n < 0 && (n = r.height + n);
		let i = this.getTranslation(), a = this.getScale(), o = t - e.x * a.sx, s = n - e.y * a.sy;
		(i.tx !== o || i.ty !== s) && this.translate(o, s);
	}
	positionRect(e, t) {
		let n = L.create(e);
		switch (t) {
			case "center": return this.positionPoint(n.getCenter(), "50%", "50%");
			case "top": return this.positionPoint(n.getTopCenter(), "50%", 0);
			case "top-right": return this.positionPoint(n.getTopRight(), "100%", 0);
			case "right": return this.positionPoint(n.getRightMiddle(), "100%", "50%");
			case "bottom-right": return this.positionPoint(n.getBottomRight(), "100%", "100%");
			case "bottom": return this.positionPoint(n.getBottomCenter(), "50%", "100%");
			case "bottom-left": return this.positionPoint(n.getBottomLeft(), 0, "100%");
			case "left": return this.positionPoint(n.getLeftMiddle(), 0, "50%");
			case "top-left": return this.positionPoint(n.getTopLeft(), 0, 0);
			default: return this;
		}
	}
	positionCell(e, t) {
		let n = e.getBBox();
		return this.positionRect(n, t);
	}
	positionContent(e, t) {
		let n = this.graph.getContentArea(t);
		return this.positionRect(n, e);
	}
}, WS = `${J.prefixCls}-graph`, GS = class e extends Yb {
	static snapshoot(e) {
		let t = e.cloneNode();
		return e.childNodes.forEach((e) => {
			t.appendChild(e);
		}), () => {
			for (Rd(e); e.attributes.length > 0;) e.removeAttribute(e.attributes[0].name);
			for (let n = 0, r = t.attributes.length; n < r; n += 1) {
				let r = t.attributes[n];
				e.setAttribute(r.name, r.value);
			}
			t.childNodes.forEach((t) => {
				e.appendChild(t);
			});
		};
	}
	get disposeContainer() {
		return !1;
	}
	get options() {
		return this.graph.options;
	}
	constructor(t) {
		super(), this.graph = t;
		let { selectors: n, fragment: r } = Hb.parseJSONMarkup(e.markup);
		this.background = n.background, this.grid = n.grid, this.svg = n.svg, this.defs = n.defs, this.viewport = n.viewport, this.primer = n.primer, this.stage = n.stage, this.decorator = n.decorator, this.overlay = n.overlay, this.container = this.options.container, this.restore = e.snapshoot(this.container), B(this.container, this.prefixClassName("graph")), zd(this.container, r), this.delegateEvents();
	}
	delegateEvents() {
		let e = this.constructor;
		return super.delegateEvents(e.events), this;
	}
	guard(e, t) {
		return e.type === "mousedown" && e.button === 2 || this.options.guard && this.options.guard(e, t) ? !0 : e.data && e.data.guarded !== void 0 ? e.data.guarded : !(t && t.cell && X.isCell(t.cell) || this.svg === e.target || this.container === e.target || this.svg.contains(e.target));
	}
	findView(e) {
		return this.graph.findViewByElem(e);
	}
	onDblClick(e) {
		this.options.preventDefaultDblClick && e.preventDefault();
		let t = this.normalizeEvent(e), n = this.findView(t.target);
		if (this.guard(t, n)) return;
		let r = this.graph.snapToGrid(t.clientX, t.clientY);
		n ? n.onDblClick(t, r.x, r.y) : this.graph.trigger("blank:dblclick", {
			e: t,
			x: r.x,
			y: r.y
		});
	}
	onClick(e) {
		if (this.getMouseMovedCount(e) <= this.options.clickThreshold) {
			let t = this.normalizeEvent(e), n = this.findView(t.target);
			if (this.guard(t, n)) return;
			let r = this.graph.snapToGrid(t.clientX, t.clientY);
			n ? n.onClick(t, r.x, r.y) : this.graph.trigger("blank:click", {
				e: t,
				x: r.x,
				y: r.y
			});
		}
	}
	isPreventDefaultContextMenu(e) {
		let t = this.options.preventDefaultContextMenu;
		return typeof t == "function" && (t = F(t, this.graph, { view: e })), t;
	}
	onContextMenu(e) {
		let t = this.normalizeEvent(e), n = this.findView(t.target);
		if (this.isPreventDefaultContextMenu(n) && e.preventDefault(), this.guard(t, n)) return;
		let r = this.graph.snapToGrid(t.clientX, t.clientY);
		n ? n.onContextMenu(t, r.x, r.y) : this.graph.trigger("blank:contextmenu", {
			e: t,
			x: r.x,
			y: r.y
		});
	}
	delegateDragEvents(e, t) {
		e.data ?? (e.data = {}), this.setEventData(e, {
			currentView: t || null,
			mouseMovedCount: 0,
			startPosition: {
				x: e.clientX,
				y: e.clientY
			}
		});
		let n = this.constructor;
		this.delegateDocumentEvents(n.documentEvents, e.data), this.undelegateEvents();
	}
	getMouseMovedCount(e) {
		return this.getEventData(e).mouseMovedCount || 0;
	}
	onMouseDown(e) {
		let t = this.normalizeEvent(e), n = this.findView(t.target);
		if (this.guard(t, n)) return;
		this.options.preventDefaultMouseDown && e.preventDefault();
		let r = this.graph.snapToGrid(t.clientX, t.clientY);
		n ? n.onMouseDown(t, r.x, r.y) : (this.options.preventDefaultBlankAction && ["touchstart"].includes(t.type) && e.preventDefault(), this.graph.trigger("blank:mousedown", {
			e: t,
			x: r.x,
			y: r.y
		})), this.delegateDragEvents(t, n);
	}
	onMouseMove(e) {
		let t = this.getEventData(e), n = t.startPosition;
		if (n && n.x === e.clientX && n.y === e.clientY || (t.mouseMovedCount ?? (t.mouseMovedCount = 0), t.mouseMovedCount += 1, t.mouseMovedCount <= this.options.moveThreshold)) return;
		let r = this.normalizeEvent(e), i = this.graph.snapToGrid(r.clientX, r.clientY), a = t.currentView;
		a ? a.onMouseMove(r, i.x, i.y) : this.graph.trigger("blank:mousemove", {
			e: r,
			x: i.x,
			y: i.y
		}), this.setEventData(r, t);
	}
	onMouseUp(e) {
		this.undelegateDocumentEvents();
		let t = this.normalizeEvent(e), n = this.graph.snapToGrid(t.clientX, t.clientY), r = this.getEventData(e).currentView;
		if (r ? r.onMouseUp(t, n.x, n.y) : this.graph.trigger("blank:mouseup", {
			e: t,
			x: n.x,
			y: n.y
		}), !e.isPropagationStopped()) {
			let t = new im(e, {
				type: "click",
				data: e.data
			});
			this.onClick(t);
		}
		e.stopImmediatePropagation(), this.delegateEvents();
	}
	onMouseOver(e) {
		let t = this.normalizeEvent(e), n = this.findView(t.target);
		if (!this.guard(t, n)) {
			if (n) n.onMouseOver(t);
			else {
				if (this.container === t.target) return;
				this.graph.trigger("blank:mouseover", { e: t });
			}
		}
	}
	onMouseOut(e) {
		let t = this.normalizeEvent(e), n = this.findView(t.target);
		if (!this.guard(t, n)) {
			if (n) n.onMouseOut(t);
			else {
				if (this.container === t.target) return;
				this.graph.trigger("blank:mouseout", { e: t });
			}
		}
	}
	onMouseEnter(e) {
		let t = this.normalizeEvent(e), n = this.findView(t.target);
		if (this.guard(t, n)) return;
		let r = this.graph.findViewByElem(t.relatedTarget);
		if (n) {
			if (r === n) return;
			n.onMouseEnter(t);
		} else {
			if (r) return;
			this.graph.trigger("graph:mouseenter", { e: t });
		}
	}
	onMouseLeave(e) {
		let t = this.normalizeEvent(e), n = this.findView(t.target);
		if (this.guard(t, n)) return;
		let r = this.graph.findViewByElem(t.relatedTarget);
		if (n) {
			if (r === n) return;
			n.onMouseLeave(t);
		} else {
			if (r) return;
			this.graph.trigger("graph:mouseleave", { e: t });
		}
	}
	onMouseWheel(e) {
		let t = this.normalizeEvent(e), n = this.findView(t.target);
		if (this.guard(t, n)) return;
		let r = t.originalEvent, i = this.graph.snapToGrid(r.clientX, r.clientY), a = Math.max(-1, Math.min(1, r.wheelDelta || -r.detail));
		n ? n.onMouseWheel(t, i.x, i.y, a) : this.graph.trigger("blank:mousewheel", {
			e: t,
			delta: a,
			x: i.x,
			y: i.y
		});
	}
	onCustomEvent(e) {
		let t = e.currentTarget, n = t.getAttribute("event") || t.getAttribute("data-event");
		if (n) {
			let r = this.findView(t);
			if (r) {
				let t = this.normalizeEvent(e);
				if (this.guard(t, r)) return;
				let i = this.graph.snapToGrid(t.clientX, t.clientY);
				r.onCustomEvent(t, n, i.x, i.y);
			}
		}
	}
	handleMagnetEvent(e, t) {
		let n = e.currentTarget, r = n.getAttribute("magnet");
		if (r && r.toLowerCase() !== "false") {
			let r = this.findView(n);
			if (r) {
				let i = this.normalizeEvent(e);
				if (this.guard(i, r)) return;
				let a = this.graph.snapToGrid(i.clientX, i.clientY);
				F(t, this.graph, r, i, n, a.x, a.y);
			}
		}
	}
	onMagnetMouseDown(e) {
		this.handleMagnetEvent(e, (e, t, n, r, i) => {
			e.onMagnetMouseDown(t, n, r, i);
		});
	}
	onMagnetDblClick(e) {
		this.handleMagnetEvent(e, (e, t, n, r, i) => {
			e.onMagnetDblClick(t, n, r, i);
		});
	}
	onMagnetContextMenu(e) {
		let t = this.findView(e.target);
		this.isPreventDefaultContextMenu(t) && e.preventDefault(), this.handleMagnetEvent(e, (e, t, n, r, i) => {
			e.onMagnetContextMenu(t, n, r, i);
		});
	}
	onLabelMouseDown(e) {
		let t = e.currentTarget, n = this.findView(t);
		if (n) {
			let t = this.normalizeEvent(e);
			if (this.guard(t, n)) return;
			let r = this.graph.snapToGrid(t.clientX, t.clientY);
			n.onLabelMouseDown(t, r.x, r.y);
		}
	}
	onImageDragStart() {
		return !1;
	}
	dispose() {
		this.undelegateEvents(), this.undelegateDocumentEvents(), this.restore(), this.restore = () => {};
	}
};
GS.markup = [
	{
		ns: Td.xhtml,
		tagName: "div",
		selector: "background",
		className: `${WS}-background`
	},
	{
		ns: Td.xhtml,
		tagName: "div",
		selector: "grid",
		className: `${WS}-grid`
	},
	{
		ns: Td.svg,
		tagName: "svg",
		selector: "svg",
		className: `${WS}-svg`,
		attrs: {
			width: "100%",
			height: "100%",
			"xmlns:xlink": Td.xlink
		},
		children: [{
			tagName: "defs",
			selector: "defs"
		}, {
			tagName: "g",
			selector: "viewport",
			className: `${WS}-svg-viewport`,
			children: [
				{
					tagName: "g",
					selector: "primer",
					className: `${WS}-svg-primer`
				},
				{
					tagName: "g",
					selector: "stage",
					className: `${WS}-svg-stage`
				},
				{
					tagName: "g",
					selector: "decorator",
					className: `${WS}-svg-decorator`
				},
				{
					tagName: "g",
					selector: "overlay",
					className: `${WS}-svg-overlay`
				}
			]
		}]
	}
], GS.events = {
	dblclick: "onDblClick",
	contextmenu: "onContextMenu",
	touchstart: "onMouseDown",
	mousedown: "onMouseDown",
	mouseover: "onMouseOver",
	mouseout: "onMouseOut",
	mouseenter: "onMouseEnter",
	mouseleave: "onMouseLeave",
	mousewheel: "onMouseWheel",
	DOMMouseScroll: "onMouseWheel",
	[`mouseenter  .${J.prefixCls}-cell`]: "onMouseEnter",
	[`mouseleave  .${J.prefixCls}-cell`]: "onMouseLeave",
	[`mouseenter  .${J.prefixCls}-cell-tools`]: "onMouseEnter",
	[`mouseleave  .${J.prefixCls}-cell-tools`]: "onMouseLeave",
	[`mousedown   .${J.prefixCls}-cell [event]`]: "onCustomEvent",
	[`touchstart  .${J.prefixCls}-cell [event]`]: "onCustomEvent",
	[`mousedown   .${J.prefixCls}-cell [data-event]`]: "onCustomEvent",
	[`touchstart  .${J.prefixCls}-cell [data-event]`]: "onCustomEvent",
	[`dblclick    .${J.prefixCls}-cell [magnet]`]: "onMagnetDblClick",
	[`contextmenu .${J.prefixCls}-cell [magnet]`]: "onMagnetContextMenu",
	[`mousedown   .${J.prefixCls}-cell [magnet]`]: "onMagnetMouseDown",
	[`touchstart  .${J.prefixCls}-cell [magnet]`]: "onMagnetMouseDown",
	[`dblclick    .${J.prefixCls}-cell [data-magnet]`]: "onMagnetDblClick",
	[`contextmenu .${J.prefixCls}-cell [data-magnet]`]: "onMagnetContextMenu",
	[`mousedown   .${J.prefixCls}-cell [data-magnet]`]: "onMagnetMouseDown",
	[`touchstart  .${J.prefixCls}-cell [data-magnet]`]: "onMagnetMouseDown",
	[`dragstart   .${J.prefixCls}-cell image`]: "onImageDragStart",
	[`mousedown   .${J.prefixCls}-edge .${J.prefixCls}-edge-label`]: "onLabelMouseDown",
	[`touchstart  .${J.prefixCls}-edge .${J.prefixCls}-edge-label`]: "onLabelMouseDown"
}, GS.documentEvents = {
	mousemove: "onMouseMove",
	touchmove: "onMouseMove",
	mouseup: "onMouseUp",
	touchend: "onMouseUp",
	touchcancel: "onMouseUp"
}, k([K()], GS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/virtual-render.js
var KS = 120, qS = class extends gS {
	init() {
		this.resetRenderArea = Xl(this.resetRenderArea, 200, { leading: !0 }), this.resetRenderArea(), this.startListening();
	}
	bindScrollerEvents(e) {
		this.scrollerRef = e, typeof e.on == "function" && (e.on("pan:start", this.resetRenderArea, this), e.on("panning", this.resetRenderArea, this), e.on("pan:stop", this.resetRenderArea, this));
		let t = e.container;
		t && (this.scrollerScrollHandler = (e) => {
			this.resetRenderArea();
		}, G.on(t, "scroll", this.scrollerScrollHandler));
	}
	startListening() {
		this.graph.on("translate", this.resetRenderArea, this), this.graph.on("scale", this.resetRenderArea, this), this.graph.on("resize", this.resetRenderArea, this);
		let e = this.graph.getPlugin("scroller");
		e && this.bindScrollerEvents(e);
	}
	stopListening() {
		this.graph.off("translate", this.resetRenderArea, this), this.graph.off("scale", this.resetRenderArea, this), this.graph.off("resize", this.resetRenderArea, this), this.unbindScroller();
	}
	onScrollerReady(e) {
		this.scrollerRef !== e && (this.unbindScroller(), this.bindScrollerEvents(e), this.resetRenderArea());
	}
	unbindScroller() {
		if (this.scrollerRef) {
			typeof this.scrollerRef.off == "function" && (this.scrollerRef.off("pan:start", this.resetRenderArea, this), this.scrollerRef.off("panning", this.resetRenderArea, this), this.scrollerRef.off("pan:stop", this.resetRenderArea, this));
			let e = this.scrollerRef.container;
			e && this.scrollerScrollHandler && G.off(e, "scroll", this.scrollerScrollHandler), this.scrollerRef = void 0, this.scrollerScrollHandler = void 0;
		}
	}
	setVirtualEnabled(e) {
		let t = this.options.virtual;
		if (typeof t == "object") {
			let n = t;
			this.options.virtual = Object.assign(Object.assign({}, n), { enabled: e });
		} else this.options.virtual = e;
	}
	enableVirtualRender() {
		this.setVirtualEnabled(!0), this.resetRenderArea();
	}
	disableVirtualRender() {
		this.setVirtualEnabled(!1), this.graph.renderer.setRenderArea(void 0);
	}
	isVirtualEnabled() {
		let e = this.options.virtual;
		return typeof e == "object" && e ? e.enabled !== !1 : !!e;
	}
	getVirtualMargin() {
		let e = this.options.virtual;
		if (typeof e == "object") {
			let t = e.margin;
			return typeof t == "number" ? t : KS;
		}
		return KS;
	}
	resetRenderArea() {
		if (this.isVirtualEnabled()) {
			let e = this.graph.getGraphArea();
			if (e) {
				let t = this.getVirtualMargin(), n = e.clone();
				n.inflate(t, t), this.graph.renderer.setRenderArea(n);
				return;
			}
		}
	}
	dispose() {
		this.stopListening();
	}
};
k([K()], qS.prototype, "dispose", null);
// node_modules/@antv/x6/es/graph/graph.js
var Q = class e extends xh {
	static isGraph(t) {
		if (t == null) return !1;
		if (t instanceof e) return !0;
		let n = t[Symbol.toStringTag];
		return n == null || n === e.toStringTag;
	}
	static render(t, n) {
		let r = typeof t == "string" || t instanceof HTMLElement ? new e({ container: t }) : new e(t);
		return n != null && r.fromJSON(n), r;
	}
	get container() {
		return this.options.container;
	}
	get [Symbol.toStringTag]() {
		return e.toStringTag;
	}
	constructor(e) {
		super(), this.installedPlugins = /* @__PURE__ */ new Set(), this.options = LS(e), this.css = new MS(this), this.view = new GS(this), this.defs = new NS(this), this.coord = new AS(this), this.transform = new US(this), this.highlight = new FS(this), this.grid = new PS(this), this.background = new kS(this), this.options.model ? this.model = this.options.model : (this.model = new sS(), this.model.graph = this), this.renderer = new OS(this), this.panning = new VS(this), this.mousewheel = new IS(this), this.virtualRender = new qS(this), this.size = new HS(this);
	}
	isNode(e) {
		return e.isNode();
	}
	isEdge(e) {
		return e.isEdge();
	}
	resetCells(e, t = {}) {
		return this.model.resetCells(e, t), this;
	}
	clearCells(e = {}) {
		return this.model.clear(e), this;
	}
	toJSON(e = {}) {
		return this.model.toJSON(e);
	}
	parseJSON(e) {
		return this.model.parseJSON(e);
	}
	fromJSON(e, t = {}) {
		return this.model.fromJSON(e, t), this;
	}
	getCellById(e) {
		return this.model.getCell(e);
	}
	addNode(e, t = {}) {
		return this.model.addNode(e, t);
	}
	addNodes(e, t = {}) {
		return this.addCell(e.map((e) => eS.isNode(e) ? e : this.createNode(e)), t);
	}
	createNode(e) {
		return this.model.createNode(e);
	}
	removeNode(e, t = {}) {
		return this.model.removeCell(e, t);
	}
	addEdge(e, t = {}) {
		return this.model.addEdge(e, t);
	}
	addEdges(e, t = {}) {
		return this.addCell(e.map((e) => Z.isEdge(e) ? e : this.createEdge(e)), t);
	}
	removeEdge(e, t = {}) {
		return this.model.removeCell(e, t);
	}
	createEdge(e) {
		return this.model.createEdge(e);
	}
	addCell(e, t = {}) {
		return this.model.addCell(e, t), this;
	}
	removeCell(e, t = {}) {
		return this.model.removeCell(e, t);
	}
	removeCells(e, t = {}) {
		return this.model.removeCells(e, t);
	}
	removeConnectedEdges(e, t = {}) {
		return this.model.removeConnectedEdges(e, t);
	}
	disconnectConnectedEdges(e, t = {}) {
		return this.model.disconnectConnectedEdges(e, t), this;
	}
	hasCell(e) {
		return this.model.has(e);
	}
	getCells() {
		return this.model.getCells();
	}
	getCellCount() {
		return this.model.total();
	}
	getNodes() {
		return this.model.getNodes();
	}
	getEdges() {
		return this.model.getEdges();
	}
	getOutgoingEdges(e) {
		return this.model.getOutgoingEdges(e);
	}
	getIncomingEdges(e) {
		return this.model.getIncomingEdges(e);
	}
	getConnectedEdges(e, t = {}) {
		return this.model.getConnectedEdges(e, t);
	}
	getRootNodes() {
		return this.model.getRoots();
	}
	getLeafNodes() {
		return this.model.getLeafs();
	}
	isRootNode(e) {
		return this.model.isRoot(e);
	}
	isLeafNode(e) {
		return this.model.isLeaf(e);
	}
	getNeighbors(e, t = {}) {
		return this.model.getNeighbors(e, t);
	}
	isNeighbor(e, t, n = {}) {
		return this.model.isNeighbor(e, t, n);
	}
	getSuccessors(e, t = {}) {
		return this.model.getSuccessors(e, t);
	}
	isSuccessor(e, t, n = {}) {
		return this.model.isSuccessor(e, t, n);
	}
	getPredecessors(e, t = {}) {
		return this.model.getPredecessors(e, t);
	}
	isPredecessor(e, t, n = {}) {
		return this.model.isPredecessor(e, t, n);
	}
	getCommonAncestor(...e) {
		return this.model.getCommonAncestor(...e);
	}
	getSubGraph(e, t = {}) {
		return this.model.getSubGraph(e, t);
	}
	cloneSubGraph(e, t = {}) {
		return this.model.cloneSubGraph(e, t);
	}
	cloneCells(e) {
		return this.model.cloneCells(e);
	}
	getNodesFromPoint(e, t) {
		return this.model.getNodesFromPoint(e, t);
	}
	getNodesInArea(e, t, n, r, i) {
		return this.model.getNodesInArea(e, t, n, r, i);
	}
	getNodesUnderNode(e, t = {}) {
		return this.model.getNodesUnderNode(e, t);
	}
	searchCell(e, t, n = {}) {
		return this.model.search(e, t, n), this;
	}
	getShortestPath(e, t, n = {}) {
		return this.model.getShortestPath(e, t, n);
	}
	getAllCellsBBox() {
		return this.model.getAllCellsBBox();
	}
	getCellsBBox(e, t = {}) {
		return this.model.getCellsBBox(e, t);
	}
	startBatch(e, t = {}) {
		this.model.startBatch(e, t);
	}
	stopBatch(e, t = {}) {
		this.model.stopBatch(e, t);
	}
	batchUpdate(e, t, n) {
		let r = typeof e == "string" ? e : "update", i = typeof e == "string" ? t : e, a = typeof t == "function" ? n : t;
		this.startBatch(r, a);
		let o = i();
		return this.stopBatch(r, a), o;
	}
	updateCellId(e, t) {
		return this.model.updateCellId(e, t);
	}
	findView(e) {
		return X.isCell(e) ? this.findViewByCell(e) : this.findViewByElem(e);
	}
	findViews(e) {
		return L.isRectangleLike(e) ? this.findViewsInArea(e) : I.isPointLike(e) ? this.findViewsFromPoint(e) : [];
	}
	findViewByCell(e) {
		return this.renderer.findViewByCell(e);
	}
	findViewByElem(e) {
		return this.renderer.findViewByElem(e);
	}
	findViewsFromPoint(e, t) {
		let n = typeof e == "number" ? {
			x: e,
			y: t
		} : e;
		return this.renderer.findViewsFromPoint(n);
	}
	findViewsInArea(e, t, n, r, i) {
		let a = typeof e == "number" ? {
			x: e,
			y: t,
			width: n,
			height: r
		} : e, o = typeof e == "number" ? i : t;
		return this.renderer.findViewsInArea(a, o);
	}
	matrix(e) {
		return e === void 0 ? this.transform.getMatrix() : (this.transform.setMatrix(e), this);
	}
	resize(e, t) {
		let n = this.getPlugin("scroller");
		return n ? n.resize(e, t) : this.transform.resize(e, t), this;
	}
	scale(e, t = e, n = 0, r = 0) {
		return e === void 0 ? this.transform.getScale() : (this.transform.scale(e, t, n, r), this);
	}
	zoom(e, t) {
		let n = this.getPlugin("scroller");
		if (n) {
			if (e === void 0) return n.zoom();
			n.zoom(e, t);
		} else {
			if (e === void 0) return this.transform.getZoom();
			this.transform.zoom(e, t);
		}
		return this;
	}
	zoomTo(e, t = {}) {
		let n = this.getPlugin("scroller");
		return n ? n.zoom(e, Object.assign(Object.assign({}, t), { absolute: !0 })) : this.transform.zoom(e, Object.assign(Object.assign({}, t), { absolute: !0 })), this;
	}
	zoomToRect(e, t = {}) {
		let n = this.getPlugin("scroller");
		return n ? n.zoomToRect(e, t) : this.transform.zoomToRect(e, t), this;
	}
	zoomToFit(e = {}) {
		let t = this.getPlugin("scroller");
		return t ? t.zoomToFit(e) : this.transform.zoomToFit(e), this;
	}
	rotate(e, t, n) {
		return e === void 0 ? this.transform.getRotation() : (this.transform.rotate(e, t, n), this);
	}
	translate(e, t) {
		return e === void 0 ? this.transform.getTranslation() : (this.transform.translate(e, t), this);
	}
	translateBy(e, t) {
		let n = this.translate(), r = n.tx + e, i = n.ty + t;
		return this.translate(r, i);
	}
	getGraphArea() {
		let e = this.getPlugin("scroller");
		if (e) {
			let t = e.getVisibleArea?.call(e);
			if (t) return t;
		}
		return this.transform.getGraphArea();
	}
	getContentArea(e = {}) {
		return this.transform.getContentArea(e);
	}
	getContentBBox(e = {}) {
		return this.transform.getContentBBox(e);
	}
	fitToContent(e, t, n, r) {
		return this.transform.fitToContent(e, t, n, r);
	}
	scaleContentToFit(e = {}) {
		return this.transform.scaleContentToFit(e), this;
	}
	center(e) {
		return this.centerPoint(e);
	}
	centerPoint(e, t, n) {
		let r = this.getPlugin("scroller");
		return r ? r.centerPoint(e, t, n) : this.transform.centerPoint(e, t), this;
	}
	centerContent(e) {
		let t = this.getPlugin("scroller");
		return t ? t.centerContent(e) : this.transform.centerContent(e), this;
	}
	centerCell(e, t) {
		let n = this.getPlugin("scroller");
		return n ? n.centerCell(e, t) : this.transform.centerCell(e), this;
	}
	positionPoint(e, t, n, r = {}) {
		let i = this.getPlugin("scroller");
		return i ? i.positionPoint(e, t, n, r) : this.transform.positionPoint(e, t, n), this;
	}
	positionRect(e, t, n) {
		let r = this.getPlugin("scroller");
		return r ? r.positionRect(e, t, n) : this.transform.positionRect(e, t), this;
	}
	positionCell(e, t, n) {
		let r = this.getPlugin("scroller");
		return r ? r.positionCell(e, t, n) : this.transform.positionCell(e, t), this;
	}
	positionContent(e, t) {
		let n = this.getPlugin("scroller");
		return n ? n.positionContent(e, t) : this.transform.positionContent(e, t), this;
	}
	snapToGrid(e, t) {
		return this.coord.snapToGrid(e, t);
	}
	pageToLocal(e, t, n, r) {
		return L.isRectangleLike(e) ? this.coord.pageToLocalRect(e) : typeof e == "number" && typeof t == "number" && typeof n == "number" && typeof r == "number" ? this.coord.pageToLocalRect(e, t, n, r) : this.coord.pageToLocalPoint(e, t);
	}
	localToPage(e, t, n, r) {
		return L.isRectangleLike(e) ? this.coord.localToPageRect(e) : typeof e == "number" && typeof t == "number" && typeof n == "number" && typeof r == "number" ? this.coord.localToPageRect(e, t, n, r) : this.coord.localToPagePoint(e, t);
	}
	clientToLocal(e, t, n, r) {
		return L.isRectangleLike(e) ? this.coord.clientToLocalRect(e) : typeof e == "number" && typeof t == "number" && typeof n == "number" && typeof r == "number" ? this.coord.clientToLocalRect(e, t, n, r) : this.coord.clientToLocalPoint(e, t);
	}
	localToClient(e, t, n, r) {
		return L.isRectangleLike(e) ? this.coord.localToClientRect(e) : typeof e == "number" && typeof t == "number" && typeof n == "number" && typeof r == "number" ? this.coord.localToClientRect(e, t, n, r) : this.coord.localToClientPoint(e, t);
	}
	localToGraph(e, t, n, r) {
		return L.isRectangleLike(e) ? this.coord.localToGraphRect(e) : typeof e == "number" && typeof t == "number" && typeof n == "number" && typeof r == "number" ? this.coord.localToGraphRect(e, t, n, r) : this.coord.localToGraphPoint(e, t);
	}
	graphToLocal(e, t, n, r) {
		return L.isRectangleLike(e) ? this.coord.graphToLocalRect(e) : typeof e == "number" && typeof t == "number" && typeof n == "number" && typeof r == "number" ? this.coord.graphToLocalRect(e, t, n, r) : this.coord.graphToLocalPoint(e, t);
	}
	clientToGraph(e, t, n, r) {
		return L.isRectangleLike(e) ? this.coord.clientToGraphRect(e) : typeof e == "number" && typeof t == "number" && typeof n == "number" && typeof r == "number" ? this.coord.clientToGraphRect(e, t, n, r) : this.coord.clientToGraphPoint(e, t);
	}
	defineFilter(e) {
		return this.defs.filter(e);
	}
	defineGradient(e) {
		return this.defs.gradient(e);
	}
	defineMarker(e) {
		return this.defs.marker(e);
	}
	getGridSize() {
		return this.grid.getGridSize();
	}
	setGridSize(e) {
		return this.grid.setGridSize(e), this;
	}
	showGrid() {
		return this.grid.show(), this;
	}
	hideGrid() {
		return this.grid.hide(), this;
	}
	clearGrid() {
		return this.grid.clear(), this;
	}
	drawGrid(e) {
		return this.grid.draw(e), this;
	}
	updateBackground() {
		return this.background.update(), this;
	}
	drawBackground(e, t) {
		let n = this.getPlugin("scroller");
		return n != null && (this.options.background == null || !t) ? n.drawBackground(e, t) : this.background.draw(e), this;
	}
	clearBackground(e) {
		let t = this.getPlugin("scroller");
		return t != null && (this.options.background == null || !e) ? t.clearBackground(e) : this.background.clear(), this;
	}
	enableVirtualRender() {
		return this.virtualRender.enableVirtualRender(), this;
	}
	disableVirtualRender() {
		return this.virtualRender.disableVirtualRender(), this;
	}
	isMouseWheelEnabled() {
		return !this.mousewheel.disabled;
	}
	enableMouseWheel() {
		return this.mousewheel.enable(), this;
	}
	disableMouseWheel() {
		return this.mousewheel.disable(), this;
	}
	toggleMouseWheel(e) {
		return e == null ? this.isMouseWheelEnabled() ? this.disableMouseWheel() : this.enableMouseWheel() : e ? this.enableMouseWheel() : this.disableMouseWheel(), this;
	}
	isPannable() {
		let e = this.getPlugin("scroller");
		return e ? e.isPannable() : this.panning.pannable;
	}
	enablePanning() {
		let e = this.getPlugin("scroller");
		return e ? e.enablePanning() : this.panning.enablePanning(), this;
	}
	disablePanning() {
		let e = this.getPlugin("scroller");
		return e ? e.disablePanning() : this.panning.disablePanning(), this;
	}
	togglePanning(e) {
		return e == null ? this.isPannable() ? this.disablePanning() : this.enablePanning() : e !== this.isPannable() && (e ? this.enablePanning() : this.disablePanning()), this;
	}
	handleScrollerPluginStateChange(e, t) {
		e.name === "scroller" && (t ? this.virtualRender.onScrollerReady(e) : this.virtualRender.unbindScroller());
	}
	use(e, ...t) {
		return this.installedPlugins.has(e) || (this.installedPlugins.add(e), e.init(this, ...t), this.handleScrollerPluginStateChange(e, !0)), this;
	}
	getPlugin(e) {
		return Array.from(this.installedPlugins).find((t) => t.name === e);
	}
	getPlugins(e) {
		return Array.from(this.installedPlugins).filter((t) => e.includes(t.name));
	}
	enablePlugins(e) {
		let t = e;
		return Array.isArray(t) || (t = [t]), this.getPlugins(t)?.forEach((e) => {
			var t;
			(t = e?.enable) == null || t.call(e), this.handleScrollerPluginStateChange(e, !0);
		}), this;
	}
	disablePlugins(e) {
		let t = e;
		return Array.isArray(t) || (t = [t]), this.getPlugins(t)?.forEach((e) => {
			var t;
			(t = e?.disable) == null || t.call(e), this.handleScrollerPluginStateChange(e, !1);
		}), this;
	}
	isPluginEnabled(e) {
		let t = this.getPlugin(e);
		return (t?.isEnabled)?.call(t);
	}
	disposePlugins(e) {
		let t = e;
		return Array.isArray(t) || (t = [t]), this.getPlugins(t)?.forEach((e) => {
			e.dispose(), this.handleScrollerPluginStateChange(e, !1), this.installedPlugins.delete(e);
		}), this;
	}
	dispose(e = !0) {
		e && this.model.dispose(), this.css.dispose(), this.defs.dispose(), this.grid.dispose(), this.coord.dispose(), this.transform.dispose(), this.highlight.dispose(), this.background.dispose(), this.mousewheel.dispose(), this.panning.dispose(), this.view.dispose(), this.renderer.dispose(), this.installedPlugins.forEach((e) => {
			e.dispose();
		});
	}
};
Q.toStringTag = `X6.${Q.name}`, Q.registerNode = eS.registry.register, Q.registerEdge = Z.registry.register, Q.registerView = nx.registry.register, Q.registerAttr = Qg.register, Q.registerGrid = dv.register, Q.registerFilter = rv.register, Q.registerNodeTool = Px.register, Q.registerEdgeTool = Ix.register, Q.registerBackground = i_.register, Q.registerHighlighter = Ev.register, Q.registerPortLayout = by.register, Q.registerPortLabelLayout = oy.register, Q.registerMarker = Mg.register, Q.registerRouter = Db.register, Q.registerConnector = N_.register, Q.registerAnchor = Vv.register, Q.registerEdgeAnchor = H_.register, Q.registerConnectionPoint = m_.register, Q.unregisterNode = eS.registry.unregister, Q.unregisterEdge = Z.registry.unregister, Q.unregisterView = nx.registry.unregister, Q.unregisterAttr = Qg.unregister, Q.unregisterGrid = dv.unregister, Q.unregisterFilter = rv.unregister, Q.unregisterNodeTool = Px.unregister, Q.unregisterEdgeTool = Ix.unregister, Q.unregisterBackground = i_.unregister, Q.unregisterHighlighter = Ev.unregister, Q.unregisterPortLayout = by.unregister, Q.unregisterPortLabelLayout = oy.unregister, Q.unregisterMarker = Mg.unregister, Q.unregisterRouter = Db.unregister, Q.unregisterConnector = N_.unregister, Q.unregisterAnchor = Vv.unregister, Q.unregisterEdgeAnchor = H_.unregister, Q.unregisterConnectionPoint = m_.unregister, k([K()], Q.prototype, "dispose", null);
// node_modules/@antv/x6/es/shape/html.js
var JS = "html", YS = {}, XS = class extends eS {
	static register(e) {
		let { shape: t, html: n, effect: r, inherit: i } = e, a = O(e, [
			"shape",
			"html",
			"effect",
			"inherit"
		]);
		if (!t) throw Error("HTML.register should specify `shape` in config.");
		YS[t] = {
			html: n,
			effect: r
		}, Q.registerNode(t, Object.assign({ inherit: i || "html" }, a), !0);
	}
};
XS.config({
	view: "html-view",
	markup: [
		{
			tagName: "rect",
			selector: "body"
		},
		Object.assign({}, Hb.getForeignObjectMarkup()),
		{
			tagName: "text",
			selector: "label"
		}
	],
	attrs: {
		body: {
			fill: "none",
			stroke: "none",
			refWidth: "100%",
			refHeight: "100%"
		},
		fo: {
			refWidth: "100%",
			refHeight: "100%"
		}
	}
}), eS.registry.register("html", XS, !0);
var ZS = class extends yS {
	init() {
		super.init(), this.cell.on("change:*", this.onCellChangeAny, this);
	}
	onCellChangeAny({ key: e }) {
		let t = YS[this.cell.shape];
		if (t) {
			let { effect: n } = t;
			(!n || n.includes(e)) && this.renderHTMLComponent();
		}
	}
	confirmUpdate(e) {
		let t = super.confirmUpdate(e);
		return this.handleAction(t, JS, () => this.renderHTMLComponent());
	}
	renderHTMLComponent() {
		let e = this.selectors && this.selectors.foContent;
		if (e) {
			Rd(e);
			let t = YS[this.cell.shape];
			if (!t) return;
			let { html: n } = t;
			typeof n == "function" && (n = n(this.cell)), n && (typeof n == "string" ? e.innerHTML = n : zd(e, n));
		}
	}
	dispose() {
		this.cell.off("change:*", this.onCellChangeAny, this);
	}
};
k([K()], ZS.prototype, "dispose", null), ZS.config({
	bootstrap: [JS],
	actions: { html: JS }
}), yS.registry.register("html-view", ZS, !0), pS("image", {
	attrs: { image: {
		refWidth: "100%",
		refHeight: "100%"
	} },
	propHooks: fS()
}, { selector: "image" }), uS.define({
	shape: "path",
	markup: [
		{
			tagName: "rect",
			selector: "bg"
		},
		{
			tagName: "path",
			selector: "body"
		},
		{
			tagName: "text",
			selector: "label"
		}
	],
	attrs: {
		bg: {
			refWidth: "100%",
			refHeight: "100%",
			fill: "none",
			stroke: "none",
			pointerEvents: "all"
		},
		body: {
			fill: "none",
			stroke: "#000",
			strokeWidth: 2
		}
	},
	propHooks(e) {
		let { path: t } = e, n = O(e, ["path"]);
		return t && Lf(n, "attrs/body/refD", t), n;
	}
});
// node_modules/@antv/x6/es/shape/poly.js
var QS = class extends uS {
	get points() {
		return this.getPoints();
	}
	set points(e) {
		this.setPoints(e);
	}
	getPoints() {
		return this.getAttrByPath("body/refPoints");
	}
	setPoints(e, t) {
		return e == null ? this.removePoints() : this.setAttrByPath("body/refPoints", mS(e), t), this;
	}
	removePoints() {
		return this.removeAttrByPath("body/refPoints"), this;
	}
};
QS.config({ propHooks(e) {
	let { points: t } = e, n = O(e, ["points"]);
	if (t) {
		let e = mS(t);
		e && Lf(n, "attrs/body/refPoints", e);
	}
	return n;
} }), pS("polygon", {}, { parent: QS }), pS("polyline", {}, { parent: QS }), pS("rect", { attrs: { body: {
	refWidth: "100%",
	refHeight: "100%"
} } });
// node_modules/@antv/x6/es/shape/text-block.js
function $S(e) {
	return e ? {
		tagName: "foreignObject",
		selector: "foreignObject",
		children: [{
			tagName: "div",
			ns: Td.xhtml,
			selector: "label",
			style: {
				width: "100%",
				height: "100%",
				position: "static",
				backgroundColor: "transparent",
				textAlign: "center",
				margin: 0,
				padding: "0px 5px",
				boxSizing: "border-box",
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			}
		}]
	} : {
		tagName: "text",
		selector: "label",
		attrs: { textAnchor: "middle" }
	};
}
var eC = {
	shape: "text-block",
	markup: [{
		tagName: "rect",
		selector: "body"
	}, $S(mu)],
	attrs: {
		body: Object.assign(Object.assign({}, cS), {
			refWidth: "100%",
			refHeight: "100%"
		}),
		foreignObject: {
			refWidth: "100%",
			refHeight: "100%"
		},
		label: { style: { fontSize: 14 } }
	},
	propHooks(e) {
		let { text: t } = e, n = O(e, ["text"]);
		return t && Lf(n, "attrs/label/text", t), n;
	},
	attrHooks: { text: {
		set(e, { cell: t, view: n, refBBox: r, elem: i, attrs: a }) {
			if (i instanceof HTMLElement) i.textContent = e;
			else {
				let o = a.style || {}, s = {
					text: e,
					width: -5,
					height: "100%"
				}, c = Object.assign({ textVerticalAnchor: "middle" }, o), l = Zg.textWrap;
				return F(l.set, this, s, {
					cell: t,
					view: n,
					elem: i,
					refBBox: r,
					attrs: c
				}), { fill: o.color || null };
			}
		},
		position(e, { refBBox: t, elem: n }) {
			if (n instanceof SVGElement) return t.getCenter();
		}
	} }
};
uS.define(eC);
// node_modules/@antv/x6/es/plugin/clipboard/storage.js
var tC = `${J.prefixCls}.clipboard.cells`;
function nC(e) {
	if (window.localStorage) {
		let t = e.map((e) => e.toJSON());
		localStorage.setItem(tC, JSON.stringify(t));
	}
}
function rC() {
	if (window.localStorage) {
		let e = localStorage.getItem(tC), t = e ? JSON.parse(e) : [];
		if (t) return sS.fromJSON(t);
	}
}
function iC() {
	window.localStorage && localStorage.removeItem(tC);
}
// node_modules/@antv/x6/es/plugin/clipboard/clipboard.js
var aC = class {
	constructor() {
		this.cells = [];
	}
	copy(e, t, n = {}) {
		this.options = Object.assign({}, n);
		let r = (sS.isModel(t) ? t : t.model).cloneSubGraph(e, n);
		this.cells = Bl(Object.keys(r).map((e) => r[e]), (e) => e.isEdge() ? 2 : 1), this.serialize(n);
	}
	cut(e, t, n = {}) {
		this.copy(e, t, n), (Q.isGraph(t) ? t.model : t).batchUpdate("cut", () => {
			e.forEach((e) => e.remove());
		});
	}
	paste(e, t = {}) {
		let n = Object.assign(Object.assign({}, this.options), t), { offset: r, edgeProps: i, nodeProps: a } = n, o = 20, s = 20;
		r && (o = typeof r == "number" ? r : r.dx, s = typeof r == "number" ? r : r.dy), this.deserialize(n);
		let c = this.cells;
		c.forEach((e) => {
			e.model = null, e.removeProp("zIndex"), (o || s) && e.translate(o, s), a && e.isNode() && e.prop(a), i && e.isEdge() && e.prop(i);
		});
		let l = Q.isGraph(e) ? e.model : e;
		return l.batchUpdate("paste", () => {
			l.addCells(this.cells);
		}), this.copy(c, e, t), c;
	}
	serialize(e) {
		e.useLocalStorage !== !1 && nC(this.cells);
	}
	deserialize(e) {
		if (e.useLocalStorage) {
			let e = rC();
			e && (this.cells = e);
		}
	}
	isEmpty(e = {}) {
		return e.useLocalStorage && this.deserialize(e), this.cells.length <= 0;
	}
	clean() {
		this.options = {}, this.cells = [], iC();
	}
};
Q.prototype.isClipboardEnabled = function() {
	let e = this.getPlugin("clipboard");
	return e ? e.isEnabled() : !1;
}, Q.prototype.enableClipboard = function() {
	let e = this.getPlugin("clipboard");
	return e && e.enable(), this;
}, Q.prototype.disableClipboard = function() {
	let e = this.getPlugin("clipboard");
	return e && e.disable(), this;
}, Q.prototype.toggleClipboard = function(e) {
	let t = this.getPlugin("clipboard");
	return t && t.toggleEnabled(e), this;
}, Q.prototype.isClipboardEmpty = function(e) {
	let t = this.getPlugin("clipboard");
	return !t || t.isEmpty(e);
}, Q.prototype.getCellsInClipboard = function() {
	let e = this.getPlugin("clipboard");
	return e ? e.getCellsInClipboard() : [];
}, Q.prototype.cleanClipboard = function() {
	let e = this.getPlugin("clipboard");
	return e && e.clean(), this;
}, Q.prototype.copy = function(e, t) {
	let n = this.getPlugin("clipboard");
	return n && n.copy(e, t), this;
}, Q.prototype.cut = function(e, t) {
	let n = this.getPlugin("clipboard");
	return n && n.cut(e, t), this;
}, Q.prototype.paste = function(e, t) {
	let n = this.getPlugin("clipboard");
	return n ? n.paste(e, t) : [];
};
// node_modules/@antv/x6/es/plugin/clipboard/index.js
var oC = class extends xh {
	get disabled() {
		return this.options.enabled !== !0;
	}
	get cells() {
		return this.clipboardImpl.cells;
	}
	constructor(e = {}) {
		super(), this.name = "clipboard", this.options = Object.assign({ enabled: !0 }, e);
	}
	init(e) {
		this.graph = e, this.clipboardImpl = new aC(), this.clipboardImpl.deserialize(this.options);
	}
	isEnabled() {
		return !this.disabled;
	}
	enable() {
		this.disabled && (this.options.enabled = !0);
	}
	disable() {
		this.disabled || (this.options.enabled = !1);
	}
	toggleEnabled(e) {
		return e === void 0 && (e = !this.isEnabled()), e ? this.enable() : this.disable(), this;
	}
	isEmpty(e = {}) {
		return this.clipboardImpl.isEmpty(e);
	}
	getCellsInClipboard() {
		return this.cells;
	}
	clean(e) {
		return (!this.disabled || e) && (this.clipboardImpl.clean(), this.notify("clipboard:changed", { cells: [] })), this;
	}
	copy(e, t = {}) {
		return this.disabled || (this.clipboardImpl.copy(e, this.graph, Object.assign(Object.assign({}, this.commonOptions), t)), this.notify("clipboard:changed", { cells: e })), this;
	}
	cut(e, t = {}) {
		return this.disabled || (this.clipboardImpl.cut(e, this.graph, Object.assign(Object.assign({}, this.commonOptions), t)), this.notify("clipboard:changed", { cells: e })), this;
	}
	paste(e = {}, t = this.graph) {
		return this.disabled ? [] : this.clipboardImpl.paste(t, Object.assign(Object.assign({}, this.commonOptions), e));
	}
	get commonOptions() {
		let e = this.options, { enabled: t } = e;
		return O(e, ["enabled"]);
	}
	notify(e, t) {
		this.trigger(e, t), this.graph.trigger(e, t);
	}
	dispose() {
		this.clean(!0), this.off();
	}
};
k([K()], oC.prototype, "dispose", null);
// node_modules/dom-align/dist-web/index.js
function sC(e, t) {
	var n = Object.keys(e);
	if (Object.getOwnPropertySymbols) {
		var r = Object.getOwnPropertySymbols(e);
		t && (r = r.filter(function(t) {
			return Object.getOwnPropertyDescriptor(e, t).enumerable;
		})), n.push.apply(n, r);
	}
	return n;
}
function cC(e) {
	for (var t = 1; t < arguments.length; t++) {
		var n = arguments[t] == null ? {} : arguments[t];
		t % 2 ? sC(Object(n), !0).forEach(function(t) {
			uC(e, t, n[t]);
		}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(n)) : sC(Object(n)).forEach(function(t) {
			Object.defineProperty(e, t, Object.getOwnPropertyDescriptor(n, t));
		});
	}
	return e;
}
function lC(e) {
	"@babel/helpers - typeof";
	return lC = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, lC(e);
}
function uC(e, t, n) {
	return t in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
var dC, fC = {
	Webkit: "-webkit-",
	Moz: "-moz-",
	ms: "-ms-",
	O: "-o-"
};
function pC() {
	if (dC !== void 0) return dC;
	dC = "";
	var e = document.createElement("p").style, t = "Transform";
	for (var n in fC) n + t in e && (dC = n);
	return dC;
}
function mC() {
	return pC() ? `${pC()}TransitionProperty` : "transitionProperty";
}
function hC() {
	return pC() ? `${pC()}Transform` : "transform";
}
function gC(e, t) {
	var n = mC();
	n && (e.style[n] = t, n !== "transitionProperty" && (e.style.transitionProperty = t));
}
function _C(e, t) {
	var n = hC();
	n && (e.style[n] = t, n !== "transform" && (e.style.transform = t));
}
function vC(e) {
	return e.style.transitionProperty || e.style[mC()];
}
function yC(e) {
	var t = window.getComputedStyle(e, null), n = t.getPropertyValue("transform") || t.getPropertyValue(hC());
	if (n && n !== "none") {
		var r = n.replace(/[^0-9\-.,]/g, "").split(",");
		return {
			x: parseFloat(r[12] || r[4], 0),
			y: parseFloat(r[13] || r[5], 0)
		};
	}
	return {
		x: 0,
		y: 0
	};
}
var bC = /matrix\((.*)\)/, xC = /matrix3d\((.*)\)/;
function SC(e, t) {
	var n = window.getComputedStyle(e, null), r = n.getPropertyValue("transform") || n.getPropertyValue(hC());
	if (r && r !== "none") {
		var i, a = r.match(bC);
		a ? (a = a[1], i = a.split(",").map(function(e) {
			return parseFloat(e, 10);
		}), i[4] = t.x, i[5] = t.y, _C(e, `matrix(${i.join(",")})`)) : (i = r.match(xC)[1].split(",").map(function(e) {
			return parseFloat(e, 10);
		}), i[12] = t.x, i[13] = t.y, _C(e, `matrix3d(${i.join(",")})`));
	} else _C(e, `translateX(${t.x}px) translateY(${t.y}px) translateZ(0)`);
}
var CC = "[\\-+]?(?:\\d*\\.|)\\d+(?:[eE][\\-+]?\\d+|)", wC;
function TC(e) {
	var t = e.style.display;
	e.style.display = "none", e.offsetHeight, e.style.display = t;
}
function EC(e, t, n) {
	var r = n;
	if (lC(t) === "object") for (var i in t) t.hasOwnProperty(i) && EC(e, i, t[i]);
	else if (r !== void 0) typeof r == "number" && (r = `${r}px`), e.style[t] = r;
	else return wC(e, t);
}
function DC(e) {
	var t, n, r, i = e.ownerDocument, a = i.body, o = i && i.documentElement;
	return t = e.getBoundingClientRect(), n = Math.floor(t.left), r = Math.floor(t.top), n -= o.clientLeft || a.clientLeft || 0, r -= o.clientTop || a.clientTop || 0, {
		left: n,
		top: r
	};
}
function OC(e, t) {
	var n = e[`page${t ? "Y" : "X"}Offset`], r = `scroll${t ? "Top" : "Left"}`;
	if (typeof n != "number") {
		var i = e.document;
		n = i.documentElement[r], typeof n != "number" && (n = i.body[r]);
	}
	return n;
}
function kC(e) {
	return OC(e);
}
function AC(e) {
	return OC(e, !0);
}
function jC(e) {
	var t = DC(e), n = e.ownerDocument, r = n.defaultView || n.parentWindow;
	return t.left += kC(r), t.top += AC(r), t;
}
function MC(e) {
	return e != null && e == e.window;
}
function NC(e) {
	return MC(e) ? e.document : e.nodeType === 9 ? e : e.ownerDocument;
}
function PC(e, t, n) {
	var r = n, i = "", a = NC(e);
	return r = r || a.defaultView.getComputedStyle(e, null), r && (i = r.getPropertyValue(t) || r[t]), i;
}
var FC = RegExp(`^(${CC})(?!px)[a-z%]+\$`, "i"), IC = /^(top|right|bottom|left)$/, LC = "currentStyle", RC = "runtimeStyle", zC = "left", BC = "px";
function VC(e, t) {
	var n = e[LC] && e[LC][t];
	if (FC.test(n) && !IC.test(t)) {
		var r = e.style, i = r[zC], a = e[RC][zC];
		e[RC][zC] = e[LC][zC], r[zC] = t === "fontSize" ? "1em" : n || 0, n = r.pixelLeft + BC, r[zC] = i, e[RC][zC] = a;
	}
	return n === "" ? "auto" : n;
}
typeof window < "u" && (wC = window.getComputedStyle ? PC : VC);
function HC(e, t) {
	return e === "left" ? t.useCssRight ? "right" : e : t.useCssBottom ? "bottom" : e;
}
function UC(e) {
	if (e === "left") return "right";
	if (e === "right") return "left";
	if (e === "top") return "bottom";
	if (e === "bottom") return "top";
}
function WC(e, t, n) {
	EC(e, "position") === "static" && (e.style.position = "relative");
	var r = -999, i = -999, a = HC("left", n), o = HC("top", n), s = UC(a), c = UC(o);
	a !== "left" && (r = 999), o !== "top" && (i = 999);
	var l = "", u = jC(e);
	("left" in t || "top" in t) && (l = vC(e) || "", gC(e, "none")), "left" in t && (e.style[s] = "", e.style[a] = `${r}px`), "top" in t && (e.style[c] = "", e.style[o] = `${i}px`), TC(e);
	var d = jC(e), f = {};
	for (var p in t) if (t.hasOwnProperty(p)) {
		var m = HC(p, n), h = p === "left" ? r : i, g = u[p] - d[p];
		f[m] = m === p ? h + g : h - g;
	}
	EC(e, f), TC(e), ("left" in t || "top" in t) && gC(e, l);
	var _ = {};
	for (var v in t) if (t.hasOwnProperty(v)) {
		var y = HC(v, n), b = t[v] - u[v];
		_[y] = v === y ? f[y] + b : f[y] - b;
	}
	EC(e, _);
}
function GC(e, t) {
	var n = jC(e), r = yC(e), i = {
		x: r.x,
		y: r.y
	};
	"left" in t && (i.x = r.x + t.left - n.left), "top" in t && (i.y = r.y + t.top - n.top), SC(e, i);
}
function KC(e, t, n) {
	if (n.ignoreShake) {
		var r = jC(e), i = r.left.toFixed(0), a = r.top.toFixed(0), o = t.left.toFixed(0), s = t.top.toFixed(0);
		if (i === o && a === s) return;
	}
	n.useCssRight || n.useCssBottom ? WC(e, t, n) : n.useCssTransform && hC() in document.body.style ? GC(e, t) : WC(e, t, n);
}
function qC(e, t) {
	for (var n = 0; n < e.length; n++) t(e[n]);
}
function JC(e) {
	return wC(e, "boxSizing") === "border-box";
}
var YC = [
	"margin",
	"border",
	"padding"
], XC = -1, ZC = 2, QC = 1, $C = 0;
function ew(e, t, n) {
	var r = {}, i = e.style, a;
	for (a in t) t.hasOwnProperty(a) && (r[a] = i[a], i[a] = t[a]);
	for (a in n.call(e), t) t.hasOwnProperty(a) && (i[a] = r[a]);
}
function tw(e, t, n) {
	for (var r = 0, i, a = 0, o; a < t.length; a++) if (i = t[a], i) for (o = 0; o < n.length; o++) {
		var s = void 0;
		s = i === "border" ? `${i}${n[o]}Width` : i + n[o], r += parseFloat(wC(e, s)) || 0;
	}
	return r;
}
var nw = { getParent: function(e) {
	var t = e;
	do
		t = t.nodeType === 11 && t.host ? t.host : t.parentNode;
	while (t && t.nodeType !== 1 && t.nodeType !== 9);
	return t;
} };
qC(["Width", "Height"], function(e) {
	nw[`doc${e}`] = function(t) {
		var n = t.document;
		return Math.max(n.documentElement[`scroll${e}`], n.body[`scroll${e}`], nw[`viewport${e}`](n));
	}, nw[`viewport${e}`] = function(t) {
		var n = `client${e}`, r = t.document, i = r.body, a = r.documentElement[n];
		return r.compatMode === "CSS1Compat" && a || i && i[n] || a;
	};
});
function rw(e, t, n) {
	var r = n;
	if (MC(e)) return t === "width" ? nw.viewportWidth(e) : nw.viewportHeight(e);
	if (e.nodeType === 9) return t === "width" ? nw.docWidth(e) : nw.docHeight(e);
	var i = t === "width" ? ["Left", "Right"] : ["Top", "Bottom"], a = Math.floor(t === "width" ? e.getBoundingClientRect().width : e.getBoundingClientRect().height), o = JC(e), s = 0;
	(a == null || a <= 0) && (a = void 0, s = wC(e, t), (s == null || Number(s) < 0) && (s = e.style[t] || 0), s = Math.floor(parseFloat(s)) || 0), r === void 0 && (r = o ? QC : XC);
	var c = a !== void 0 || o, l = a || s;
	return r === XC ? c ? l - tw(e, ["border", "padding"], i) : s : c ? r === QC ? l : l + (r === ZC ? -tw(e, ["border"], i) : tw(e, ["margin"], i)) : s + tw(e, YC.slice(r), i);
}
var iw = {
	position: "absolute",
	visibility: "hidden",
	display: "block"
};
function aw() {
	var e = [...arguments], t, n = e[0];
	return n.offsetWidth === 0 ? ew(n, iw, function() {
		t = rw.apply(void 0, e);
	}) : t = rw.apply(void 0, e), t;
}
qC(["width", "height"], function(e) {
	var t = e.charAt(0).toUpperCase() + e.slice(1);
	nw[`outer${t}`] = function(t, n) {
		return t && aw(t, e, n ? $C : QC);
	};
	var n = e === "width" ? ["Left", "Right"] : ["Top", "Bottom"];
	nw[e] = function(t, r) {
		var i = r;
		return i === void 0 ? t && aw(t, e, XC) : t ? (JC(t) && (i += tw(t, ["padding", "border"], n)), EC(t, e, i)) : void 0;
	};
});
function ow(e, t) {
	for (var n in t) t.hasOwnProperty(n) && (e[n] = t[n]);
	return e;
}
var $ = {
	getWindow: function(e) {
		if (e && e.document && e.setTimeout) return e;
		var t = e.ownerDocument || e;
		return t.defaultView || t.parentWindow;
	},
	getDocument: NC,
	offset: function(e, t, n) {
		if (t !== void 0) KC(e, t, n || {});
		else return jC(e);
	},
	isWindow: MC,
	each: qC,
	css: EC,
	clone: function(e) {
		var t, n = {};
		for (t in e) e.hasOwnProperty(t) && (n[t] = e[t]);
		if (e.overflow) for (t in e) e.hasOwnProperty(t) && (n.overflow[t] = e.overflow[t]);
		return n;
	},
	mix: ow,
	getWindowScrollLeft: function(e) {
		return kC(e);
	},
	getWindowScrollTop: function(e) {
		return AC(e);
	},
	merge: function() {
		for (var e = {}, t = 0; t < arguments.length; t++) $.mix(e, t < 0 || arguments.length <= t ? void 0 : arguments[t]);
		return e;
	},
	viewportWidth: 0,
	viewportHeight: 0
};
ow($, nw);
var sw = $.getParent;
function cw(e) {
	if ($.isWindow(e) || e.nodeType === 9) return null;
	var t = $.getDocument(e).body, n, r = $.css(e, "position");
	if (r !== "fixed" && r !== "absolute") return e.nodeName.toLowerCase() === "html" ? null : sw(e);
	for (n = sw(e); n && n !== t && n.nodeType !== 9; n = sw(n)) if (r = $.css(n, "position"), r !== "static") return n;
	return null;
}
var lw = $.getParent;
function uw(e) {
	if ($.isWindow(e) || e.nodeType === 9) return !1;
	var t = $.getDocument(e), n = t.body, r = null;
	for (r = lw(e); r && r !== n && r !== t; r = lw(r)) if ($.css(r, "position") === "fixed") return !0;
	return !1;
}
function dw(e, t) {
	for (var n = {
		left: 0,
		right: Infinity,
		top: 0,
		bottom: Infinity
	}, r = cw(e), i = $.getDocument(e), a = i.defaultView || i.parentWindow, o = i.body, s = i.documentElement; r;) {
		if ((navigator.userAgent.indexOf("MSIE") === -1 || r.clientWidth !== 0) && r !== o && r !== s && $.css(r, "overflow") !== "visible") {
			var c = $.offset(r);
			c.left += r.clientLeft, c.top += r.clientTop, n.top = Math.max(n.top, c.top), n.right = Math.min(n.right, c.left + r.clientWidth), n.bottom = Math.min(n.bottom, c.top + r.clientHeight), n.left = Math.max(n.left, c.left);
		} else if (r === o || r === s) break;
		r = cw(r);
	}
	var l = null;
	!$.isWindow(e) && e.nodeType !== 9 && (l = e.style.position, $.css(e, "position") === "absolute" && (e.style.position = "fixed"));
	var u = $.getWindowScrollLeft(a), d = $.getWindowScrollTop(a), f = $.viewportWidth(a), p = $.viewportHeight(a), m = s.scrollWidth, h = s.scrollHeight, g = window.getComputedStyle(o);
	if (g.overflowX === "hidden" && (m = a.innerWidth), g.overflowY === "hidden" && (h = a.innerHeight), e.style && (e.style.position = l), t || uw(e)) n.left = Math.max(n.left, u), n.top = Math.max(n.top, d), n.right = Math.min(n.right, u + f), n.bottom = Math.min(n.bottom, d + p);
	else {
		var _ = Math.max(m, u + f);
		n.right = Math.min(n.right, _);
		var v = Math.max(h, d + p);
		n.bottom = Math.min(n.bottom, v);
	}
	return n.top >= 0 && n.left >= 0 && n.bottom > n.top && n.right > n.left ? n : null;
}
function fw(e, t, n, r) {
	var i = $.clone(e), a = {
		width: t.width,
		height: t.height
	};
	return r.adjustX && i.left < n.left && (i.left = n.left), r.resizeWidth && i.left >= n.left && i.left + a.width > n.right && (a.width -= i.left + a.width - n.right), r.adjustX && i.left + a.width > n.right && (i.left = Math.max(n.right - a.width, n.left)), r.adjustY && i.top < n.top && (i.top = n.top), r.resizeHeight && i.top >= n.top && i.top + a.height > n.bottom && (a.height -= i.top + a.height - n.bottom), r.adjustY && i.top + a.height > n.bottom && (i.top = Math.max(n.bottom - a.height, n.top)), $.mix(i, a);
}
function pw(e) {
	var t, n, r;
	if (!$.isWindow(e) && e.nodeType !== 9) t = $.offset(e), n = $.outerWidth(e), r = $.outerHeight(e);
	else {
		var i = $.getWindow(e);
		t = {
			left: $.getWindowScrollLeft(i),
			top: $.getWindowScrollTop(i)
		}, n = $.viewportWidth(i), r = $.viewportHeight(i);
	}
	return t.width = n, t.height = r, t;
}
function mw(e, t) {
	var n = t.charAt(0), r = t.charAt(1), i = e.width, a = e.height, o = e.left, s = e.top;
	return n === "c" ? s += a / 2 : n === "b" && (s += a), r === "c" ? o += i / 2 : r === "r" && (o += i), {
		left: o,
		top: s
	};
}
function hw(e, t, n, r, i) {
	var a = mw(t, n[1]), o = mw(e, n[0]), s = [o.left - a.left, o.top - a.top];
	return {
		left: Math.round(e.left - s[0] + r[0] - i[0]),
		top: Math.round(e.top - s[1] + r[1] - i[1])
	};
}
function gw(e, t, n) {
	return e.left < n.left || e.left + t.width > n.right;
}
function _w(e, t, n) {
	return e.top < n.top || e.top + t.height > n.bottom;
}
function vw(e, t, n) {
	return e.left > n.right || e.left + t.width < n.left;
}
function yw(e, t, n) {
	return e.top > n.bottom || e.top + t.height < n.top;
}
function bw(e, t, n) {
	var r = [];
	return $.each(e, function(e) {
		r.push(e.replace(t, function(e) {
			return n[e];
		}));
	}), r;
}
function xw(e, t) {
	return e[t] = -e[t], e;
}
function Sw(e, t) {
	return (/%$/.test(e) ? parseInt(e.substring(0, e.length - 1), 10) / 100 * t : parseInt(e, 10)) || 0;
}
function Cw(e, t) {
	e[0] = Sw(e[0], t.width), e[1] = Sw(e[1], t.height);
}
function ww(e, t, n, r) {
	var i = n.points, a = n.offset || [0, 0], o = n.targetOffset || [0, 0], s = n.overflow, c = n.source || e;
	a = [].concat(a), o = [].concat(o), s = s || {};
	var l = {}, u = 0, d = dw(c, !!(s && s.alwaysByViewport)), f = pw(c);
	Cw(a, f), Cw(o, t);
	var p = hw(f, t, i, a, o), m = $.merge(f, p);
	if (d && (s.adjustX || s.adjustY) && r) {
		if (s.adjustX && gw(p, f, d)) {
			var h = bw(i, /[lr]/gi, {
				l: "r",
				r: "l"
			}), g = xw(a, 0), _ = xw(o, 0);
			vw(hw(f, t, h, g, _), f, d) || (u = 1, i = h, a = g, o = _);
		}
		if (s.adjustY && _w(p, f, d)) {
			var v = bw(i, /[tb]/gi, {
				t: "b",
				b: "t"
			}), y = xw(a, 1), b = xw(o, 1);
			yw(hw(f, t, v, y, b), f, d) || (u = 1, i = v, a = y, o = b);
		}
		u && (p = hw(f, t, i, a, o), $.mix(m, p));
		var x = gw(p, f, d), S = _w(p, f, d);
		if (x || S) {
			var C = i;
			x && (C = bw(i, /[lr]/gi, {
				l: "r",
				r: "l"
			})), S && (C = bw(i, /[tb]/gi, {
				t: "b",
				b: "t"
			})), i = C, a = n.offset || [0, 0], o = n.targetOffset || [0, 0];
		}
		l.adjustX = s.adjustX && x, l.adjustY = s.adjustY && S, (l.adjustX || l.adjustY) && (m = fw(p, f, d, l));
	}
	return m.width !== f.width && $.css(c, "width", $.width(c) + m.width - f.width), m.height !== f.height && $.css(c, "height", $.height(c) + m.height - f.height), $.offset(c, {
		left: m.left,
		top: m.top
	}, {
		useCssRight: n.useCssRight,
		useCssBottom: n.useCssBottom,
		useCssTransform: n.useCssTransform,
		ignoreShake: n.ignoreShake
	}), {
		points: i,
		offset: a,
		targetOffset: o,
		overflow: l
	};
}
function Tw(e, t, n) {
	var r, i, a = $.getDocument(e), o = a.defaultView || a.parentWindow, s = $.getWindowScrollLeft(o), c = $.getWindowScrollTop(o), l = $.viewportWidth(o), u = $.viewportHeight(o);
	r = "pageX" in t ? t.pageX : s + t.clientX, i = "pageY" in t ? t.pageY : c + t.clientY;
	var d = {
		left: r,
		top: i,
		width: 0,
		height: 0
	}, f = r >= 0 && r <= s + l && i >= 0 && i <= c + u, p = [n.points[0], "cc"];
	return ww(e, d, cC(cC({}, n), {}, { points: p }), f);
}
// node_modules/@antv/x6/es/plugin/dnd/style/raw.js
var Ew = ".x6-widget-dnd {\n  position: absolute;\n  top: -10000px;\n  left: -10000px;\n  z-index: 999999;\n  display: none;\n  cursor: move;\n  opacity: 0.7;\n}\n.x6-widget-dnd.dragging {\n  display: inline-block;\n}\n.x6-widget-dnd.dragging * {\n  pointer-events: none !important;\n}\n.x6-widget-dnd .x6-graph {\n  background: transparent;\n  box-shadow: none;\n}\n", Dw = {
	getDragNode: (e) => e.clone(),
	getDropNode: (e) => e.clone()
}, Ow = class extends Yb {
	get targetScroller() {
		return this.options.target.getPlugin("scroller");
	}
	get targetGraph() {
		return this.options.target;
	}
	get targetModel() {
		return this.targetGraph.model;
	}
	get snapline() {
		return this.options.target.getPlugin("snapline");
	}
	constructor(e) {
		super(), this.name = "dnd", this.options = Object.assign(Object.assign({}, Dw), e), this.init();
	}
	init() {
		bu(this.name, Ew), this.container = document.createElement("div"), B(this.container, this.prefixClassName("widget-dnd")), this.draggingGraph = new Q(Object.assign(Object.assign({}, this.options.delegateGraphOptions), {
			container: document.createElement("div"),
			width: 1,
			height: 1,
			async: !1
		})), zd(this.container, this.draggingGraph.container);
	}
	start(e, t) {
		var n;
		let r = t;
		r.preventDefault(), this.targetModel.startBatch("dnd"), B(this.container, "dragging"), Ud(this.container, this.options.draggingContainer || document.body), this.sourceNode = e, this.prepareDragging(e, r.clientX, r.clientY);
		let i = this.updateNodePosition(r.clientX, r.clientY);
		this.isSnaplineEnabled() && (this.snapline.captureCursorOffset({
			e: r,
			node: e,
			cell: e,
			view: this.draggingView,
			x: i.x,
			y: i.y
		}), (n = this.draggingNode) == null || n.on("change:position", this.snap, this)), this.delegateDocumentEvents(_S, r.data);
	}
	isSnaplineEnabled() {
		return this.snapline?.isEnabled();
	}
	prepareDragging(e, t, n) {
		let r = this.draggingGraph, i = r.model, a = this.options.getDragNode(e, {
			sourceNode: e,
			draggingGraph: r,
			targetGraph: this.targetGraph
		});
		a.position(0, 0);
		let o = 5;
		if (this.isSnaplineEnabled() && (o += this.snapline.options.tolerance || 0), this.isSnaplineEnabled() || this.options.scaled) {
			let e = this.targetGraph.transform.getScale();
			r.scale(e.sx, e.sy), o *= Math.max(e.sx, e.sy);
		} else r.scale(1, 1);
		this.clearDragging(), i.resetCells([a]);
		let s = r.findViewByCell(a);
		s.undelegateEvents(), s.cell.off("changed"), r.fitToContent({
			padding: o,
			allowNewOrigin: "any",
			useCellGeometry: !1
		});
		let c = s.getBBox();
		this.geometryBBox = s.getBBox({ useCellGeometry: !0 }), this.delta = this.geometryBBox.getTopLeft().diff(c.getTopLeft()), this.draggingNode = a, this.draggingView = s, this.draggingBBox = a.getBBox(), this.padding = o, this.updateGraphPosition(t, n);
	}
	updateGraphPosition(e, t) {
		let n = this.delta, r = this.geometryBBox, i = this.padding || 5, a = {
			left: e - n.x - r.width / 2 - i,
			top: t - n.y - r.height / 2 - i
		};
		this.draggingGraph && Tw(this.container, {
			clientX: a.left,
			clientY: a.top
		}, { points: ["tl"] });
	}
	updateNodePosition(e, t) {
		let n = this.targetGraph.clientToLocal(e, t), r = this.draggingBBox;
		return r && (n.x -= r.width / 2, n.y -= r.height / 2, this.draggingNode.position(n.x, n.y)), n;
	}
	snap({ cell: e, current: t, options: n }) {
		let r = e;
		if (n.snapped) {
			let e = this.draggingBBox;
			r.position(e.x + n.tx, e.y + n.ty, { silent: !0 }), this.draggingView.translate(), r.position(t.x, t.y, { silent: !0 }), this.snapOffset = {
				x: n.tx,
				y: n.ty
			};
		} else this.snapOffset = null;
	}
	onMouseMove(e) {
		this.onDragging(e);
	}
	onMouseUp(e) {
		this.onDragEnd(e);
	}
	onDragging(e) {
		let t = this.draggingView;
		if (t) {
			e.preventDefault();
			let n = this.normalizeEvent(e), r = n.clientX, i = n.clientY;
			this.updateGraphPosition(r, i);
			let a = this.updateNodePosition(r, i), o = this.targetGraph.options.embedding.enabled, s = (o || this.isSnaplineEnabled()) && this.isInsideValidArea({
				x: r,
				y: i
			});
			if (o) {
				t.setEventData(n, {
					graph: this.targetGraph,
					candidateEmbedView: this.candidateEmbedView
				});
				let e = t.getEventData(n);
				s ? t.processEmbedding(n, e) : t.clearEmbedding(e), this.candidateEmbedView = e.candidateEmbedView;
			}
			this.isSnaplineEnabled() && (s ? this.snapline.snapOnMoving({
				e: n,
				view: t,
				x: a.x,
				y: a.y
			}) : this.snapline.hide());
		}
	}
	onDragEnd(e) {
		let t = this.draggingNode;
		if (t) {
			let n = this.normalizeEvent(e), r = this.draggingView, i = this.draggingBBox, a = this.snapOffset, o = i.x, s = i.y;
			a && (o += a.x, s += a.y), t.position(o, s, { silent: !0 });
			let c = this.drop(t, {
				x: n.clientX,
				y: n.clientY
			}), l = (e) => {
				e ? (this.onDropped(t), this.targetGraph.options.embedding.enabled && r && (r.setEventData(n, {
					cell: e,
					graph: this.targetGraph,
					candidateEmbedView: this.candidateEmbedView
				}), r.finalizeEmbedding(n, r.getEventData(n)))) : this.onDropInvalid(), this.candidateEmbedView = null, this.targetModel.stopBatch("dnd");
			};
			ju(c) ? (this.undelegateDocumentEvents(), c.then(l)) : l(c);
		}
	}
	clearDragging() {
		this.draggingNode && (this.sourceNode = null, this.draggingNode.remove(), this.draggingNode = null, this.draggingView = null, this.delta = null, this.padding = null, this.snapOffset = null, this.undelegateDocumentEvents());
	}
	onDropped(e) {
		this.draggingNode === e && (this.clearDragging(), V(this.container, "dragging"), Ld(this.container));
	}
	onDropInvalid() {
		let e = this.draggingNode;
		e && this.onDropped(e);
	}
	isInsideValidArea(e) {
		let t, n = null, r = this.targetGraph, i = this.targetScroller;
		this.options.dndContainer && (n = this.getDropArea(this.options.dndContainer));
		let a = n?.containsPoint(e);
		if (i) {
			if (i.options.autoResize) t = this.getDropArea(i.container);
			else {
				let e = this.getDropArea(i.container);
				t = this.getDropArea(r.container).intersectsWithRect(e);
			}
		} else t = this.getDropArea(r.container);
		return !a && t && t.containsPoint(e);
	}
	getDropArea(e) {
		let t = pm(e), n = document.body.scrollTop || document.documentElement.scrollTop, r = document.body.scrollLeft || document.documentElement.scrollLeft;
		return L.create({
			x: t.left + parseInt(U(e, "border-left-width"), 10) - r,
			y: t.top + parseInt(U(e, "border-top-width"), 10) - n,
			width: e.clientWidth,
			height: e.clientHeight
		});
	}
	drop(e, t) {
		if (this.isInsideValidArea(t)) {
			let n = this.targetGraph, r = n.model, i = n.clientToLocal(t), a = this.sourceNode, o = this.options.getDropNode(e, {
				sourceNode: a,
				draggingNode: e,
				targetGraph: this.targetGraph,
				draggingGraph: this.draggingGraph
			}), s = o.getBBox();
			i.x += s.x - s.width / 2, i.y += s.y - s.height / 2;
			let c = this.snapOffset ? 1 : n.getGridSize();
			o.position(Vu(i.x, c), Vu(i.y, c)), o.removeZIndex();
			let l = this.options.validateNode, u = !l || l(o, {
				sourceNode: a,
				draggingNode: e,
				droppingNode: o,
				targetGraph: n,
				draggingGraph: this.draggingGraph
			});
			return typeof u == "boolean" ? u ? (r.addCell(o, { stencil: this.cid }), o) : null : Nu(u).then((e) => e ? (r.addCell(o, { stencil: this.cid }), o) : null);
		}
		return null;
	}
	onRemove() {
		this.draggingGraph && (this.draggingGraph.view.remove(), this.draggingGraph.dispose());
	}
	dispose() {
		this.remove(), xu(this.name);
	}
};
k([K()], Ow.prototype, "dispose", null), Q.prototype.toSVG = function(e, t) {
	let n = this.getPlugin("export");
	n && n.toSVG(e, t);
}, Q.prototype.toSVGAsync = function(e) {
	return pe(this, void 0, void 0, function* () {
		return new Promise((t) => {
			this.toSVG(t, e);
		});
	});
}, Q.prototype.toPNG = function(e, t) {
	let n = this.getPlugin("export");
	n && n.toPNG(e, t);
}, Q.prototype.toPNGAsync = function(e) {
	return pe(this, void 0, void 0, function* () {
		return new Promise((t) => {
			this.toPNG(t, e);
		});
	});
}, Q.prototype.toJPEG = function(e, t) {
	let n = this.getPlugin("export");
	n && n.toJPEG(e, t);
}, Q.prototype.toJPEGAsync = function(e) {
	return pe(this, void 0, void 0, function* () {
		return new Promise((t) => {
			this.toJPEG(t, e);
		});
	});
}, Q.prototype.exportPNG = function(e, t) {
	let n = this.getPlugin("export");
	n && n.exportPNG(e, t);
}, Q.prototype.exportJPEG = function(e, t) {
	let n = this.getPlugin("export");
	n && n.exportJPEG(e, t);
}, Q.prototype.exportSVG = function(e, t) {
	let n = this.getPlugin("export");
	n && n.exportSVG(e, t);
};
// node_modules/@antv/x6/es/plugin/export/index.js
var kw = class extends xh {
	constructor() {
		super(...arguments), this.name = "export";
	}
	get view() {
		return this.graph.view;
	}
	init(e) {
		this.graph = e;
	}
	exportPNG(e = "chart", t = {}) {
		this.toPNG((t) => {
			Ou(t, e);
		}, t);
	}
	exportJPEG(e = "chart", t = {}) {
		this.toJPEG((t) => {
			Ou(t, e);
		}, t);
	}
	exportSVG(e = "chart", t = {}) {
		this.toSVG((t) => {
			Ou(ku(t), e);
		}, t);
	}
	toSVG(e, t = {}) {
		this.notify("before:export", t), Object.hasOwn(t, "copyStyles") || (t.copyStyles = !0), Object.hasOwn(t, "serializeImages") || (t.serializeImages = !0);
		let n = this.view.svg, r = W.create(n).clone(), i = r.node, a = r.findOne(`.${this.view.prefixClassName("graph-svg-stage")}`), o = t.viewBox || this.graph.graphToLocal(this.graph.getContentBBox()), s = t.preserveDimensions;
		if (s) {
			let e = typeof s == "boolean" ? o : s;
			r.attr({
				width: e.width,
				height: e.height
			});
		}
		if (r.removeAttribute("style").attr("viewBox", [
			o.x,
			o.y,
			o.width,
			o.height
		].join(" ")), a.removeAttribute("transform"), t.copyStyles) {
			let e = n.ownerDocument, t = Array.from(n.querySelectorAll("*")), r = Array.from(i.querySelectorAll("*")), a = e.implementation.createHTMLDocument("x6-export-defaults"), o = a.importNode(n, !0);
			a.body.appendChild(o);
			let s = Array.from(o.querySelectorAll("*")), c = {};
			s.forEach((e, t) => {
				let n = window.getComputedStyle(e, null), r = {};
				for (let e = 0; e < n.length; e += 1) {
					let t = n[e];
					r[t] = n.getPropertyValue(t);
				}
				c[t] = r;
			});
			let l = {};
			t.forEach((e, t) => {
				let n = window.getComputedStyle(e, null), r = c[t] || {}, i = {};
				for (let e = 0; e < n.length; e += 1) {
					let t = n[e], a = n.getPropertyValue(t);
					a !== r[t] && (i[t] = a);
				}
				l[t] = i;
			}), r.forEach((e, t) => {
				U(e, l[t]);
			});
		}
		let c = t.stylesheet;
		if (typeof c == "string") {
			let e = n.ownerDocument.implementation.createDocument(null, "xml", null).createCDATASection(c);
			r.prepend(W.create("style", { type: "text/css" }, [e]));
		}
		let l = () => {
			let n = t.beforeSerialize;
			if (typeof n == "function") {
				let e = F(n, this.graph, i);
				e instanceof SVGSVGElement && (i = e);
			}
			let r = new XMLSerializer().serializeToString(i).replace(/&nbsp;/g, "\xA0");
			this.notify("after:export", t), e(r);
		};
		if (t.serializeImages) {
			let e = r.find("image").map((e) => new Promise((t) => {
				Tu(e.attr("xlink:href") || e.attr("href"), (n, r) => {
					!n && r && (e.attr("xlink:href", r), e.attr("href", r)), t();
				});
			}));
			Promise.all(e).then(l);
		} else l();
	}
	toDataURL(e, t) {
		let n = t.viewBox || this.graph.getContentBBox(), r = ou(t.padding);
		t.width && t.height && (r.left + r.right >= t.width && (r.left = r.right = 0), r.top + r.bottom >= t.height && (r.top = r.bottom = 0));
		let i = new L(-r.left, -r.top, r.left + r.right, r.top + r.bottom);
		if (t.width && t.height) {
			let e = n.width + r.left + r.right, a = n.height + r.top + r.bottom;
			i.scale(e / t.width, a / t.height);
		}
		n = L.create(n).moveAndExpand(i);
		let a = typeof t.width == "number" && typeof t.height == "number" ? {
			width: t.width,
			height: t.height
		} : n, o = t.ratio ? t.ratio : 1;
		Number.isFinite(o) && o !== 0 || (o = 1);
		let s = {
			width: Math.max(Math.round(a.width * o), 1),
			height: Math.max(Math.round(a.height * o), 1)
		};
		{
			let e = document.createElement("canvas"), t = e.getContext("2d");
			e.width = s.width, e.height = s.height;
			let n = s.width - 1, r = s.height - 1;
			t.fillStyle = "rgb(1,1,1)", t.fillRect(n, r, 1, 1);
			let i = t.getImageData(n, r, 1, 1).data;
			if (i[0] !== 1 || i[1] !== 1 || i[2] !== 1) throw Error("size exceeded");
		}
		let c = new Image();
		c.onload = () => {
			let n = document.createElement("canvas");
			n.width = s.width, n.height = s.height;
			let r = n.getContext("2d");
			r.fillStyle = t.backgroundColor || "white", r.fillRect(0, 0, s.width, s.height);
			try {
				r.drawImage(c, 0, 0, s.width, s.height), e(n.toDataURL(t.type, t.quality));
			} catch {}
		}, this.toSVG((e) => {
			c.src = `data:image/svg+xml,${encodeURIComponent(e)}`;
		}, Object.assign(Object.assign({}, t), {
			viewBox: n,
			serializeImages: !0,
			preserveDimensions: Object.assign({}, s)
		}));
	}
	toPNG(e, t = {}) {
		this.toDataURL(e, Object.assign(Object.assign({}, t), { type: "image/png" }));
	}
	toJPEG(e, t = {}) {
		this.toDataURL(e, Object.assign(Object.assign({}, t), { type: "image/jpeg" }));
	}
	notify(e, t) {
		this.trigger(e, t), this.graph.trigger(e, t);
	}
	dispose() {
		this.off();
	}
};
k([K()], kw.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/history/util.js
function Aw(e) {
	return e === "cell:added";
}
function jw(e) {
	return e === "cell:removed";
}
function Mw(e) {
	return e != null && e.startsWith("cell:change:");
}
function Nw(e) {
	let t = [
		"cell:added",
		"cell:removed",
		"cell:change:*"
	], n = ["batch:start", "batch:stop"], r = e.eventNames ? e.eventNames.filter((e) => !(Mw(e) || t.includes(e) || n.includes(e))) : t;
	return Object.assign(Object.assign({ enabled: !0 }, e), {
		eventNames: r,
		applyOptionsList: e.applyOptionsList || ["propertyPath"],
		revertOptionsList: e.revertOptionsList || ["propertyPath"]
	});
}
function Pw(e) {
	let t = [];
	for (let n = 0, r = e.length; n < r; n += 1) {
		let r = e[n], i = null;
		if (Aw(r.event)) {
			let t = r.data.id;
			for (let r = 0; r < n; r += 1) if (e[r].data.id === t) {
				i = r;
				break;
			}
		}
		i === null ? t.push(r) : t.splice(i, 0, r);
	}
	return t;
}
// node_modules/@antv/x6/es/plugin/history/validator.js
var Fw = class extends xh {
	constructor(e) {
		super(), this.map = {}, this.command = e.history, this.cancelInvalid = e.cancelInvalid !== !1, this.command.on("add", this.onCommandAdded, this);
	}
	onCommandAdded({ cmds: e }) {
		return Array.isArray(e) ? e.every((e) => this.isValidCommand(e)) : this.isValidCommand(e);
	}
	isValidCommand(e) {
		if (e.options && e.options.validation === !1) return !0;
		let t = e.event && this.map[e.event] || [], n = null;
		return t.forEach((t) => {
			let r = 0, i = (a) => {
				let o = t[r];
				r += 1;
				try {
					o ? o(a, e, i) : n = a;
				} catch (e) {
					i(e);
				}
			};
			i(n);
		}), !n || (this.cancelInvalid && this.command.cancel(), this.emit("invalid", { err: n }), !1);
	}
	validate(e, ...t) {
		let n = Array.isArray(e) ? e : e.split(/\s+/);
		return t.forEach((e) => {
			if (typeof e != "function") throw Error(`${n.join(" ")} requires callback functions.`);
		}), n.forEach((e) => {
			this.map[e] ?? (this.map[e] = []), this.map[e].push(t);
		}), this;
	}
	dispose() {
		this.command.off("add", this.onCommandAdded, this);
	}
};
k([K()], Fw.prototype, "dispose", null), Q.prototype.isHistoryEnabled = function() {
	let e = this.getPlugin("history");
	return e ? e.isEnabled() : !1;
}, Q.prototype.enableHistory = function() {
	let e = this.getPlugin("history");
	return e && e.enable(), this;
}, Q.prototype.disableHistory = function() {
	let e = this.getPlugin("history");
	return e && e.disable(), this;
}, Q.prototype.toggleHistory = function(e) {
	let t = this.getPlugin("history");
	return t && t.toggleEnabled(e), this;
}, Q.prototype.undo = function(e) {
	let t = this.getPlugin("history");
	return t && t.undo(e), this;
}, Q.prototype.redo = function(e) {
	let t = this.getPlugin("history");
	return t && t.redo(e), this;
}, Q.prototype.undoAndCancel = function(e) {
	let t = this.getPlugin("history");
	return t && t.cancel(e), this;
}, Q.prototype.canUndo = function() {
	let e = this.getPlugin("history");
	return e ? e.canUndo() : !1;
}, Q.prototype.canRedo = function() {
	let e = this.getPlugin("history");
	return e ? e.canRedo() : !1;
}, Q.prototype.cleanHistory = function(e) {
	let t = this.getPlugin("history");
	return t && t.clean(e), this;
}, Q.prototype.getHistoryStackSize = function() {
	return this.getPlugin("history").getSize();
}, Q.prototype.getUndoStackSize = function() {
	return this.getPlugin("history").getUndoSize();
}, Q.prototype.getRedoStackSize = function() {
	return this.getPlugin("history").getRedoSize();
}, Q.prototype.getUndoRemainSize = function() {
	return this.getPlugin("history").getUndoRemainSize();
};
// node_modules/@antv/x6/es/plugin/history/index.js
var Iw = class extends xh {
	constructor(e = {}) {
		super(), this.name = "history", this.batchCommands = null, this.batchLevel = 0, this.lastBatchIndex = -1, this.freezed = !1, this.stackSize = 0, this.handlers = [];
		let { stackSize: t = 0 } = e;
		this.stackSize = t, this.options = Nw(e), this.validator = new Fw({
			history: this,
			cancelInvalid: this.options.cancelInvalid
		});
	}
	init(e) {
		this.graph = e, this.model = this.graph.model, this.clean(), this.startListening();
	}
	isEnabled() {
		return !this.disabled;
	}
	enable() {
		this.disabled && (this.options.enabled = !0);
	}
	disable() {
		this.disabled || (this.options.enabled = !1);
	}
	toggleEnabled(e) {
		return e == null ? this.isEnabled() ? this.disable() : this.enable() : e !== this.isEnabled() && (e ? this.enable() : this.disable()), this;
	}
	undo(e = {}) {
		if (!this.disabled) {
			let t = this.undoStack.pop();
			t && (this.revertCommand(t, e), this.redoStack.push(t), this.notify("undo", t, e));
		}
		return this;
	}
	redo(e = {}) {
		if (!this.disabled) {
			let t = this.redoStack.pop();
			t && (this.applyCommand(t, e), this.undoStackPush(t), this.notify("redo", t, e));
		}
		return this;
	}
	cancel(e = {}) {
		if (!this.disabled) {
			let t = this.undoStack.pop();
			t && (this.revertCommand(t, e), this.redoStack = [], this.notify("cancel", t, e));
		}
		return this;
	}
	getSize() {
		return this.stackSize;
	}
	getUndoRemainSize() {
		let e = this.undoStack.length;
		return this.stackSize - e;
	}
	getUndoSize() {
		return this.undoStack.length;
	}
	getRedoSize() {
		return this.redoStack.length;
	}
	canUndo() {
		return !this.disabled && this.undoStack.length > 0;
	}
	canRedo() {
		return !this.disabled && this.redoStack.length > 0;
	}
	clean(e = {}) {
		return this.undoStack = [], this.redoStack = [], this.notify("clean", null, e), this;
	}
	get disabled() {
		return this.options.enabled !== !0;
	}
	validate(e, ...t) {
		return this.validator.validate(e, ...t), this;
	}
	startListening() {
		this.model.on("batch:start", this.initBatchCommand, this), this.model.on("batch:stop", this.storeBatchCommand, this), this.options.eventNames && this.options.eventNames.forEach((e, t) => {
			this.handlers[t] = this.addCommand.bind(this, e), this.model.on(e, this.handlers[t]);
		}), this.validator.on("invalid", (e) => this.trigger("invalid", e));
	}
	stopListening() {
		this.model.off("batch:start", this.initBatchCommand, this), this.model.off("batch:stop", this.storeBatchCommand, this), this.options.eventNames && (this.options.eventNames.forEach((e, t) => {
			this.model.off(e, this.handlers[t]);
		}), this.handlers.length = 0), this.validator.off("invalid");
	}
	createCommand(e) {
		return {
			batch: e ? e.batch : !1,
			data: {}
		};
	}
	revertCommand(e, t) {
		this.freezed = !0;
		let n = Array.isArray(e) ? Pw(e) : [e];
		for (let e = n.length - 1; e >= 0; --e) {
			let r = n[e], i = Object.assign(Object.assign({}, t), zl(r.options, this.options.revertOptionsList || []));
			this.executeCommand(r, !0, i);
		}
		this.freezed = !1;
	}
	applyCommand(e, t) {
		this.freezed = !0;
		let n = Array.isArray(e) ? Pw(e) : [e];
		for (let e = 0; e < n.length; e += 1) {
			let r = n[e], i = Object.assign(Object.assign({}, t), zl(r.options, this.options.applyOptionsList || []));
			this.executeCommand(r, !1, i);
		}
		this.freezed = !1;
	}
	executeCommand(e, t, n) {
		let r = this.model, i = r.getCell(e.data.id), a = e.event;
		if (Aw(a) && t || jw(a) && !t) i && i.remove(n);
		else if (Aw(a) && !t || jw(a) && t) {
			let t = e.data;
			t.node ? r.addNode(t.props, n) : t.edge && r.addEdge(t.props, n);
		} else if (Mw(a)) {
			let r = e.data, a = r.key;
			if (a && i) {
				let e = t ? r.prev[a] : r.next[a];
				r.key === "attrs" && this.ensureUndefinedAttrs(e, t ? r.next[a] : r.prev[a]) && (n.dirty = !0), i.prop(a, e, n);
			}
		} else {
			let r = this.options.executeCommand;
			r && F(r, this, e, t, n);
		}
	}
	addCommand(e, t) {
		if (this.freezed || this.disabled) return;
		let n = t, r = n.options || {};
		if (r.dryrun || Aw(e) && this.options.ignoreAdd || jw(e) && this.options.ignoreRemove || Mw(e) && this.options.ignoreChange) return;
		let i = this.options.beforeAddCommand;
		if (i != null && F(i, this, e, t) === !1) return;
		e === "cell:change:*" && (e = `cell:change:${n.key}`);
		let a = n.cell, o = sS.isModel(a), s;
		if (this.batchCommands) {
			s = this.batchCommands[Math.max(this.lastBatchIndex, 0)];
			let t = o && !s.modelChange || s.data.id !== a.id, n = s.event !== e;
			if (this.lastBatchIndex >= 0 && (t || n)) {
				let t = this.batchCommands.findIndex((t) => (o && t.modelChange || t.data.id === a.id) && t.event === e);
				t < 0 || Aw(e) || jw(e) ? s = this.createCommand({ batch: !0 }) : (s = this.batchCommands[t], this.batchCommands.splice(t, 1)), this.batchCommands.push(s), this.lastBatchIndex = this.batchCommands.length - 1;
			}
		} else s = this.createCommand({ batch: !1 });
		if (Aw(e) || jw(e)) {
			let t = s.data;
			return s.event = e, s.options = r, t.id = a.id, t.props = N(a.toJSON()), a.isEdge() ? t.edge = !0 : a.isNode() && (t.node = !0), this.push(s, r);
		}
		if (Mw(e)) {
			let n = t.key, i = s.data;
			return s.batch && s.event || (s.event = e, s.options = r, i.key = n, i.prev ?? (i.prev = {}), i.prev[n] = N(a.previous(n)), o ? s.modelChange = !0 : i.id = a.id), i.next ?? (i.next = {}), i.next[n] = N(a.prop(n)), this.push(s, r);
		}
		let c = this.options.afterAddCommand;
		c && F(c, this, e, t, s), this.push(s, r);
	}
	initBatchCommand(e) {
		this.freezed || (this.batchCommands ? this.batchLevel += 1 : (this.batchCommands = [this.createCommand({ batch: !0 })], this.batchLevel = 0, this.lastBatchIndex = -1));
	}
	storeBatchCommand(e) {
		if (!this.freezed) {
			if (this.batchCommands && this.batchLevel <= 0) {
				let t = this.filterBatchCommand(this.batchCommands);
				t.length > 0 && (this.redoStack = [], this.undoStackPush(t), this.consolidateCommands(), this.notify("add", t, e)), this.batchCommands = null, this.lastBatchIndex = -1, this.batchLevel = 0;
			} else this.batchCommands && this.batchLevel > 0 && --this.batchLevel;
		}
	}
	filterBatchCommand(e) {
		let t = e.slice(), n = [];
		for (; t.length > 0;) {
			let e = t.shift(), r = e.event, i = e.data.id;
			if (r != null && (i != null || e.modelChange)) {
				if (Aw(r)) {
					let e = t.findIndex((e) => jw(e.event) && e.data.id === i);
					if (e >= 0) {
						t = t.filter((t, n) => e < n || t.data.id !== i);
						continue;
					}
				} else if (jw(r)) {
					let e = t.findIndex((e) => Aw(e.event) && e.data.id === i);
					if (e >= 0) {
						t.splice(e, 1);
						continue;
					}
				} else if (Mw(r)) {
					let t = e.data;
					if (El(t.prev, t.next)) continue;
				}
				n.push(e);
			}
		}
		return n;
	}
	notify(e, t, n) {
		let r = t == null ? null : Array.isArray(t) ? t : [t];
		this.emit(e, {
			cmds: r,
			options: n
		}), this.graph.trigger(`history:${e}`, {
			cmds: r,
			options: n
		}), this.emit("change", {
			cmds: r,
			options: n
		}), this.graph.trigger("history:change", {
			cmds: r,
			options: n
		});
	}
	push(e, t) {
		this.redoStack = [], e.batch ? (this.lastBatchIndex = Math.max(this.lastBatchIndex, 0), this.emit("batch", {
			cmd: e,
			options: t
		})) : (this.undoStackPush(e), this.consolidateCommands(), this.notify("add", e, t));
	}
	consolidateCommands() {
		let e = this.undoStack[this.undoStack.length - 1], t = this.undoStack[this.undoStack.length - 2];
		if (!Array.isArray(e)) return;
		let n = new Set(e.map((e) => e.event));
		if (n.size !== 2 || !n.has("cell:change:parent") || !n.has("cell:change:children") || !e.every((e) => e.batch && e.options?.ui) || !Array.isArray(t) || t.length !== 1) return;
		let r = t[0];
		r.event === "cell:change:position" && r.options?.ui && (t.push(...e), this.undoStack.pop());
	}
	undoStackPush(e) {
		this.stackSize === 0 || this.undoStack.length >= this.stackSize && this.undoStack.shift(), this.undoStack.push(e);
	}
	ensureUndefinedAttrs(e, t) {
		let n = !1;
		return e !== null && t !== null && typeof e == "object" && typeof t == "object" && Object.keys(t).forEach((r) => {
			e[r] === void 0 && t[r] !== void 0 ? (e[r] = void 0, n = !0) : typeof e[r] == "object" && typeof t[r] == "object" && (n = this.ensureUndefinedAttrs(e[r], t[r]));
		}), n;
	}
	dispose() {
		this.validator.dispose(), this.clean(), this.stopListening(), this.off();
	}
};
k([K()], Iw.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/keyboard/util.js
var Lw = /* @__PURE__ */ l((/* @__PURE__ */ o(((e, t) => {
	(function(e, n, r) {
		if (!e) return;
		for (var i = {
			8: "backspace",
			9: "tab",
			13: "enter",
			16: "shift",
			17: "ctrl",
			18: "alt",
			20: "capslock",
			27: "esc",
			32: "space",
			33: "pageup",
			34: "pagedown",
			35: "end",
			36: "home",
			37: "left",
			38: "up",
			39: "right",
			40: "down",
			45: "ins",
			46: "del",
			91: "meta",
			93: "meta",
			224: "meta"
		}, a = {
			106: "*",
			107: "+",
			109: "-",
			110: ".",
			111: "/",
			186: ";",
			187: "=",
			188: ",",
			189: "-",
			190: ".",
			191: "/",
			192: "`",
			219: "[",
			220: "\\",
			221: "]",
			222: "'"
		}, o = {
			"~": "`",
			"!": "1",
			"@": "2",
			"#": "3",
			$: "4",
			"%": "5",
			"^": "6",
			"&": "7",
			"*": "8",
			"(": "9",
			")": "0",
			_: "-",
			"+": "=",
			":": ";",
			"\"": "'",
			"<": ",",
			">": ".",
			"?": "/",
			"|": "\\"
		}, s = {
			option: "alt",
			command: "meta",
			return: "enter",
			escape: "esc",
			plus: "+",
			mod: /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? "meta" : "ctrl"
		}, c, l = 1; l < 20; ++l) i[111 + l] = "f" + l;
		for (l = 0; l <= 9; ++l) i[l + 96] = l.toString();
		function u(e, t, n) {
			e.addEventListener ? e.addEventListener(t, n, !1) : e.attachEvent("on" + t, n);
		}
		function d(e) {
			if (e.type == "keypress") {
				var t = String.fromCharCode(e.which);
				return e.shiftKey || (t = t.toLowerCase()), t;
			}
			return i[e.which] ? i[e.which] : a[e.which] ? a[e.which] : String.fromCharCode(e.which).toLowerCase();
		}
		function f(e, t) {
			return e.sort().join(",") === t.sort().join(",");
		}
		function p(e) {
			var t = [];
			return e.shiftKey && t.push("shift"), e.altKey && t.push("alt"), e.ctrlKey && t.push("ctrl"), e.metaKey && t.push("meta"), t;
		}
		function m(e) {
			e.preventDefault ? e.preventDefault() : e.returnValue = !1;
		}
		function h(e) {
			e.stopPropagation ? e.stopPropagation() : e.cancelBubble = !0;
		}
		function g(e) {
			return e == "shift" || e == "ctrl" || e == "alt" || e == "meta";
		}
		function _() {
			if (!c) for (var e in c = {}, i) e > 95 && e < 112 || i.hasOwnProperty(e) && (c[i[e]] = e);
			return c;
		}
		function v(e, t, n) {
			return n || (n = _()[e] ? "keydown" : "keypress"), n == "keypress" && t.length && (n = "keydown"), n;
		}
		function y(e) {
			return e === "+" ? ["+"] : (e = e.replace(/\+{2}/g, "+plus"), e.split("+"));
		}
		function b(e, t) {
			var n, r, i, a = [];
			for (n = y(e), i = 0; i < n.length; ++i) r = n[i], s[r] && (r = s[r]), t && t != "keypress" && o[r] && (r = o[r], a.push("shift")), g(r) && a.push(r);
			return t = v(r, a, t), {
				key: r,
				modifiers: a,
				action: t
			};
		}
		function x(e, t) {
			return e === null || e === n ? !1 : e === t || x(e.parentNode, t);
		}
		function S(e) {
			var t = this;
			if (e = e || n, !(t instanceof S)) return new S(e);
			t.target = e, t._callbacks = {}, t._directMap = {};
			var r = {}, i, a = !1, o = !1, s = !1;
			function c(e) {
				e = e || {};
				var t = !1, n;
				for (n in r) e[n] ? t = !0 : r[n] = 0;
				t || (s = !1);
			}
			function l(e, n, i, a, o, s) {
				var c, l, u = [], d = i.type;
				if (!t._callbacks[e]) return [];
				for (d == "keyup" && g(e) && (n = [e]), c = 0; c < t._callbacks[e].length; ++c) if (l = t._callbacks[e][c], (a || !l.seq || r[l.seq] == l.level) && d == l.action && (d == "keypress" && !i.metaKey && !i.ctrlKey || f(n, l.modifiers))) {
					var p = !a && l.combo == o, m = a && l.seq == a && l.level == s;
					(p || m) && t._callbacks[e].splice(c, 1), u.push(l);
				}
				return u;
			}
			function _(e, n, r, i) {
				t.stopCallback(n, n.target || n.srcElement, r, i) || e(n, r) === !1 && (m(n), h(n));
			}
			t._handleKey = function(e, t, n) {
				var r = l(e, t, n), i, a = {}, u = 0, d = !1;
				for (i = 0; i < r.length; ++i) r[i].seq && (u = Math.max(u, r[i].level));
				for (i = 0; i < r.length; ++i) if (r[i].seq) {
					if (r[i].level != u) continue;
					d = !0, a[r[i].seq] = 1, _(r[i].callback, n, r[i].combo, r[i].seq);
				} else d || _(r[i].callback, n, r[i].combo);
				var f = n.type == "keypress" && o;
				n.type == s && !g(e) && !f && c(a), o = d && n.type == "keydown";
			};
			function v(e) {
				typeof e.which != "number" && (e.which = e.keyCode);
				var n = d(e);
				n && (e.type == "keyup" && a === n ? a = !1 : t.handleKey(n, p(e), e));
			}
			function y() {
				clearTimeout(i), i = setTimeout(c, 1e3);
			}
			function x(e, t, n, i) {
				r[e] = 0;
				function o(t) {
					return function() {
						s = t, ++r[e], y();
					};
				}
				function l(t) {
					_(n, t, e), i !== "keyup" && (a = d(t)), setTimeout(c, 10);
				}
				for (var u = 0; u < t.length; ++u) {
					var f = u + 1 === t.length ? l : o(i || b(t[u + 1]).action);
					C(t[u], f, i, e, u);
				}
			}
			function C(e, n, r, i, a) {
				t._directMap[e + ":" + r] = n, e = e.replace(/\s+/g, " ");
				var o = e.split(" "), s;
				o.length > 1 ? x(e, o, n, r) : (s = b(e, r), t._callbacks[s.key] = t._callbacks[s.key] || [], l(s.key, s.modifiers, { type: s.action }, i, e, a), t._callbacks[s.key][i ? "unshift" : "push"]({
					callback: n,
					modifiers: s.modifiers,
					action: s.action,
					seq: i,
					level: a,
					combo: e
				}));
			}
			t._bindMultiple = function(e, t, n) {
				for (var r = 0; r < e.length; ++r) C(e[r], t, n);
			}, u(e, "keypress", v), u(e, "keydown", v), u(e, "keyup", v);
		}
		S.prototype.bind = function(e, t, n) {
			var r = this;
			return e = e instanceof Array ? e : [e], r._bindMultiple.call(r, e, t, n), r;
		}, S.prototype.unbind = function(e, t) {
			var n = this;
			return n.bind.call(n, e, function() {}, t);
		}, S.prototype.trigger = function(e, t) {
			var n = this;
			return n._directMap[e + ":" + t] && n._directMap[e + ":" + t]({}, e), n;
		}, S.prototype.reset = function() {
			var e = this;
			return e._callbacks = {}, e._directMap = {}, e;
		}, S.prototype.stopCallback = function(e, t) {
			var n = this;
			if ((" " + t.className + " ").indexOf(" mousetrap ") > -1 || x(t, n.target)) return !1;
			if ("composedPath" in e && typeof e.composedPath == "function") {
				var r = e.composedPath()[0];
				r !== e.target && (t = r);
			}
			return t.tagName == "INPUT" || t.tagName == "SELECT" || t.tagName == "TEXTAREA" || t.isContentEditable;
		}, S.prototype.handleKey = function() {
			var e = this;
			return e._handleKey.apply(e, arguments);
		}, S.addKeycodes = function(e) {
			for (var t in e) e.hasOwnProperty(t) && (i[t] = e[t]);
			c = null;
		}, S.init = function() {
			var e = S(n);
			for (var t in e) t.charAt(0) !== "_" && (S[t] = function(t) {
				return function() {
					return e[t].apply(e, arguments);
				};
			}(t));
		}, S.init(), e.Mousetrap = S, t !== void 0 && t.exports && (t.exports = S), typeof define == "function" && define.amd && define(function() {
			return S;
		});
	})(typeof window < "u" ? window : null, typeof window < "u" ? document : null);
})))(), 1);
function Rw(e, t, n) {
	let r = e.toLocaleLowerCase().replace(/\s/g, "").replace("delete", "del").replace("cmd", "command").replace("arrowup", "up").replace("arrowright", "right").replace("arrowdown", "down").replace("arrowleft", "left");
	return t ? F(t, n, r) : r;
}
function zw(e) {
	let t = e.target, n = (t?.tagName)?.toLowerCase(), r = ["input", "textarea"].includes(n);
	return H(t, "contenteditable") === "true" && (r = !0), r;
}
function Bw(e, t, n) {
	let r = e.target, i = e.currentTarget;
	return r ? r === t || i === t || r === document.body || Id(n, r) : !1;
}
// node_modules/@antv/x6/es/plugin/keyboard/keyboard.js
function Vw(e) {
	let t = new Lw.default(e.target), n = t.stopCallback;
	return t.stopCallback = (r, i, a) => e.isEnabledForEvent(r) ? n ? n.call(t, r, i, a) : !1 : !0, t;
}
var Hw = class extends bh {
	get graph() {
		return this.options.graph;
	}
	constructor(e) {
		super(), this.options = e;
		let t = this.graph.getPlugin("scroller");
		this.container = t ? t.container : this.graph.container, e.global ? this.target = document : (this.target = this.container, this.disabled || this.target.setAttribute("tabindex", "-1"), this.graph.on("cell:mouseup", this.focus.bind(this), this), this.graph.on("blank:mouseup", this.focus.bind(this), this)), this.mousetrap = Vw(this);
	}
	get disabled() {
		return this.options.enabled !== !0;
	}
	enable() {
		this.disabled && (this.options.enabled = !0, this.target instanceof HTMLElement && this.target.setAttribute("tabindex", "-1"));
	}
	disable() {
		this.disabled || (this.options.enabled = !1, this.target instanceof HTMLElement && this.target.removeAttribute("tabindex"));
	}
	on(e, t, n) {
		this.mousetrap.bind(this.getKeys(e), t, n);
	}
	off(e, t) {
		this.mousetrap.unbind(this.getKeys(e), t);
	}
	clear() {
		this.mousetrap.reset();
	}
	trigger(e, t) {
		this.mousetrap.trigger(Rw(e, this.options.format, this.graph), t);
	}
	focus(e) {
		zw(e.e) || this.target.focus({ preventScroll: !0 });
	}
	getKeys(e) {
		return (Array.isArray(e) ? e : [e]).map((e) => Rw(e, this.options.format, this.graph));
	}
	isEnabledForEvent(e) {
		let t = !this.disabled && Bw(e, this.target, this.container), n = zw(e);
		if (t) {
			if (n && (e.key === "Backspace" || e.key === "Delete")) return !1;
			if (this.options.guard) return F(this.options.guard, this.graph, e);
		}
		return t;
	}
	dispose() {
		this.mousetrap.reset();
	}
};
k([K()], Hw.prototype, "dispose", null), Q.prototype.isKeyboardEnabled = function() {
	let e = this.getPlugin("keyboard");
	return e ? e.isEnabled() : !1;
}, Q.prototype.enableKeyboard = function() {
	let e = this.getPlugin("keyboard");
	return e && e.enable(), this;
}, Q.prototype.disableKeyboard = function() {
	let e = this.getPlugin("keyboard");
	return e && e.disable(), this;
}, Q.prototype.toggleKeyboard = function(e) {
	let t = this.getPlugin("keyboard");
	return t && t.toggleEnabled(e), this;
}, Q.prototype.bindKey = function(e, t, n) {
	let r = this.getPlugin("keyboard");
	return r && r.bindKey(e, t, n), this;
}, Q.prototype.unbindKey = function(e, t) {
	let n = this.getPlugin("keyboard");
	return n && n.unbindKey(e, t), this;
}, Q.prototype.clearKeys = function() {
	let e = this.getPlugin("keyboard");
	return e && e.clear(), this;
}, Q.prototype.triggerKey = function(e, t) {
	let n = this.getPlugin("keyboard");
	return n && n.trigger(e, t), this;
};
// node_modules/@antv/x6/es/plugin/keyboard/index.js
var Uw = class extends bh {
	constructor(e = {}) {
		super(), this.name = "keyboard", this.options = Object.assign({ enabled: !0 }, e);
	}
	init(e) {
		this.keyboardImpl = new Hw(Object.assign(Object.assign({}, this.options), { graph: e }));
	}
	isEnabled() {
		return !this.keyboardImpl.disabled;
	}
	enable() {
		this.keyboardImpl.enable();
	}
	disable() {
		this.keyboardImpl.disable();
	}
	toggleEnabled(e) {
		return e === void 0 && (e = !this.isEnabled()), e ? this.enable() : this.disable(), this;
	}
	bindKey(e, t, n) {
		return this.keyboardImpl.on(e, t, n), this;
	}
	trigger(e, t) {
		return this.keyboardImpl.trigger(e, t), this;
	}
	clear() {
		return this.keyboardImpl.clear(), this;
	}
	unbindKey(e, t) {
		return this.keyboardImpl.off(e, t), this;
	}
	dispose() {
		this.keyboardImpl.dispose();
	}
};
k([K()], Uw.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/selection/selection.js
var Ww = class e extends Yb {
	get graph() {
		return this.options.graph;
	}
	get boxClassName() {
		return this.prefixClassName(Kw.box);
	}
	get $boxes() {
		return Kd(this.container, this.boxClassName);
	}
	get handleOptions() {
		return this.options;
	}
	constructor(e) {
		super(), this.updateThrottleTimer = null, this.isDragging = !1, this.batchUpdating = !1, this.dragRafId = null, this.transformRafId = null, this.dragPendingOffset = null, this.containerLocalOffsetX = 0, this.containerLocalOffsetY = 0, this.containerOffsetX = 0, this.containerOffsetY = 0, this.draggingPreviewMode = "translate", this.translatingCache = null, this.movingRouterRestoreCache = null, this.movingRouterRestoreTimer = null, this.lastMovingTs = null, this.movingDegradeActivatedTs = null, this.options = e, this.options.model && (this.options.collection = this.options.model.collection), this.options.collection ? this.collection = this.options.collection : (this.collection = new aS([], { comparator: Jw }), this.options.collection = this.collection), this.boxCount = 0, this.boxesUpdated = !1, this.createContainer(), this.startListening();
	}
	startListening() {
		let e = this.graph, t = this.collection;
		this.delegateEvents({
			[`mousedown .${this.boxClassName}`]: "onSelectionBoxMouseDown",
			[`touchstart .${this.boxClassName}`]: "onSelectionBoxMouseDown",
			[`mousedown .${this.prefixClassName(Kw.inner)}`]: "onSelectionContainerMouseDown",
			[`touchstart .${this.prefixClassName(Kw.inner)}`]: "onSelectionContainerMouseDown"
		}, !0), e.on("scale", this.onGraphTransformed, this), e.on("translate", this.onGraphTransformed, this), e.model.on("updated", this.onModelUpdated, this), t.on("added", this.onCellAdded, this), t.on("removed", this.onCellRemoved, this), t.on("reseted", this.onReseted, this), t.on("updated", this.onCollectionUpdated, this), t.on("node:change:position", this.onNodePositionChanged, this), t.on("cell:changed", this.onCellChanged, this);
	}
	stopListening() {
		let e = this.graph, t = this.collection;
		this.undelegateEvents(), e.off("scale", this.onGraphTransformed, this), e.off("translate", this.onGraphTransformed, this), this.transformRafId != null && (cancelAnimationFrame(this.transformRafId), this.transformRafId = null), this.updateThrottleTimer && (clearTimeout(this.updateThrottleTimer), this.updateThrottleTimer = null), e.model.off("updated", this.onModelUpdated, this), t.off("added", this.onCellAdded, this), t.off("removed", this.onCellRemoved, this), t.off("reseted", this.onReseted, this), t.off("updated", this.onCollectionUpdated, this), t.off("node:change:position", this.onNodePositionChanged, this), t.off("cell:changed", this.onCellChanged, this);
	}
	onRemove() {
		this.stopListening();
	}
	onGraphTransformed() {
		this.updateThrottleTimer && (clearTimeout(this.updateThrottleTimer), this.updateThrottleTimer = null), this.transformRafId ?? (this.transformRafId = window.requestAnimationFrame(() => {
			this.transformRafId = null, !(this.collection.length <= 0) && (this.isDragging ? (this.repositionSelectionBoxesInPlace(), this.options.following ? this.resetContainerPosition() : this.syncContainerPosition()) : this.refreshSelectionBoxes());
		}));
	}
	onCellChanged() {
		this.updateSelectionBoxes();
	}
	onNodePositionChanged({ node: e, options: t }) {
		let { showNodeSelectionBox: n, pointerEvents: r } = this.options, { ui: i, selection: a, translateBy: o, snapped: s } = t, c = (n !== !0 || r && this.getPointerEventsValue(r) === "none") && !this.translating && !a, l = i && o && e.id === o;
		if (c && (l || s)) {
			this.translating = !0;
			let n = e.position(), r = e.previous("position");
			if (r) {
				let i = n.x - r.x, a = n.y - r.y;
				(i !== 0 || a !== 0) && this.translateSelectedNodes(i, a, e, t);
			}
			this.translating = !1;
		}
	}
	onModelUpdated({ removed: e }) {
		e?.length && this.unselect(e);
	}
	isEmpty() {
		return this.length <= 0;
	}
	isSelected(e) {
		return this.collection.has(e);
	}
	get length() {
		return this.collection.length;
	}
	get cells() {
		return this.collection.toArray();
	}
	select(e, t = {}) {
		t.dryrun = !0;
		let n = this.filter(Array.isArray(e) ? e : [e]);
		return this.collection.add(n, t), this;
	}
	unselect(e, t = {}) {
		return t.dryrun = !0, this.collection.remove(Array.isArray(e) ? e : [e], t), this;
	}
	reset(e, t = {}) {
		if (e) {
			this.batchUpdating = !!t.batch;
			let n = this.cells, r = this.filter(Array.isArray(e) ? e : [e]), i = {}, a = {};
			for (let e of n) i[e.id] = e;
			for (let e of r) a[e.id] = e;
			let o = [], s = [];
			return r.forEach((e) => {
				i[e.id] || o.push(e);
			}), n.forEach((e) => {
				a[e.id] || s.push(e);
			}), s.length && this.unselect(s, Object.assign(Object.assign({}, t), { ui: !0 })), o.length && this.select(o, Object.assign(Object.assign({}, t), { ui: !0 })), this.updateContainer(), this.batchUpdating = !1, this;
		}
		return this.clean(t);
	}
	clean(e = {}) {
		return this.length && this.unselect(this.cells, e), this.resetContainerPosition(), this.draggingPreviewMode = "translate", this;
	}
	setFilter(e) {
		this.options.filter = e;
	}
	setContent(e) {
		this.options.content = e;
	}
	startSelecting(e) {
		e = this.normalizeEvent(e), this.clean();
		let t, n, r = this.graph.container;
		if (e.offsetX != null && e.offsetY != null && r.contains(e.target)) t = e.offsetX, n = e.offsetY;
		else {
			let i = pm(r), a = r.scrollLeft, o = r.scrollTop;
			t = e.clientX - i.left + window.pageXOffset + a, n = e.clientY - i.top + window.pageYOffset + o;
		}
		U(this.container, {
			top: n,
			left: t,
			width: 1,
			height: 1
		}), this.setEventData(e, {
			action: "selecting",
			clientX: e.clientX,
			clientY: e.clientY,
			offsetX: t,
			offsetY: n,
			scrollerX: 0,
			scrollerY: 0,
			moving: !1
		});
		let i = this.graph.snapToGrid(e.clientX, e.clientY);
		this.notifyBoxEvent("box:mousedown", e, i.x, i.y, []), this.delegateDocumentEvents(qw, e.data);
	}
	filter(e) {
		let t = this.options.filter;
		return e.filter((e) => Array.isArray(t) ? t.some((t) => typeof t == "string" ? e.shape === t : e.id === t.id) : typeof t != "function" || F(t, this.graph, e));
	}
	stopSelecting(e) {
		this.isDragging = !1, this.boxesUpdated = !1, this.updateThrottleTimer && (clearTimeout(this.updateThrottleTimer), this.updateThrottleTimer = null);
		let t = this.graph;
		switch (this.getEventData(e).action) {
			case "selecting": {
				let n = t.snapToGrid(e.clientX, e.clientY), r = this.getSelectingRect(), i = this.getCellsInArea(r);
				this.reset(i, { batch: !0 }), this.hideRubberband(), this.notifyBoxEvent("box:mouseup", e, n.x, n.y, i);
				break;
			}
			case "translating": {
				let n = t.snapToGrid(e.clientX, e.clientY);
				if (this.dragPendingOffset) {
					let e = this.dragPendingOffset;
					this.dragPendingOffset = null, this.applyDraggingPreview(e);
				}
				this.dragRafId != null && (cancelAnimationFrame(this.dragRafId), this.dragRafId = null), this.resetContainerPosition(), this.movingRouterRestoreTimer && (clearTimeout(this.movingRouterRestoreTimer), this.movingRouterRestoreTimer = null), this.restoreMovingRouters(), this.graph.model.stopBatch("move-selection"), this.translatingCache = null, this.draggingPreviewMode = "translate", this.notifyBoxEvent("box:mouseup", e, n.x, n.y), this.repositionSelectionBoxesInPlace();
				break;
			}
			default: this.clean();
		}
		this.undelegateDocumentEvents();
	}
	onMouseUp(e) {
		let t = this.normalizeEvent(e);
		this.getEventData(t) && this.stopSelecting(e);
	}
	onSelectionBoxMouseDown(e) {
		this.handleSelectionMouseDown(e, !0);
	}
	onSelectionContainerMouseDown(e) {
		this.handleSelectionMouseDown(e, !1);
	}
	handleSelectionMouseDown(e, t) {
		var n;
		e.stopPropagation(), (n = e.preventDefault) == null || n.call(e);
		let r = this.normalizeEvent(e), i = this.graph.snapToGrid(r.clientX, r.clientY);
		if (!t && Th(r, this.options.multipleSelectionModifiers)) {
			let e = this.graph.findViewsFromPoint(i.x, i.y).find((e) => e.isNodeView());
			if (e) {
				let t = e.cell;
				this.isSelected(t) ? this.unselect(t, { ui: !0 }) : this.options.multiple === !1 ? this.reset(t, { ui: !0 }) : this.select(t, { ui: !0 });
			}
			return;
		}
		this.options.movable && this.startTranslating(r);
		let a = t ? this.getCellViewFromElem(r.target) : null;
		if (!a && (a = this.graph.findViewsFromPoint(i.x, i.y).filter((e) => this.isSelected(e.cell))[0] || null, !a)) {
			let e = this.collection.first();
			e && (a = this.graph.renderer.findViewByCell(e));
		}
		a && (this.setEventData(r, { activeView: a }), t && this.notifyBoxEvent("box:mousedown", r, i.x, i.y), this.delegateDocumentEvents(qw, r.data));
	}
	startTranslating(e) {
		this.graph.model.startBatch("move-selection");
		let t = this.graph.snapToGrid(e.clientX, e.clientY);
		this.setEventData(e, {
			action: "translating",
			clientX: t.x,
			clientY: t.y,
			originX: t.x,
			originY: t.y
		}), this.prepareTranslatingCache(), this.draggingPreviewMode = this.getDraggingPreviewMode();
	}
	getRestrictArea() {
		let e = this.graph.options.translating.restrict, t = typeof e == "function" ? F(e, this.graph, null) : e;
		return typeof t == "number" ? this.graph.transform.getGraphArea().inflate(t) : t === !0 ? this.graph.transform.getGraphArea() : t || null;
	}
	prepareTranslatingCache() {
		let e = this.collection.toArray().filter((e) => e.isNode()), t = new Set(e.map((e) => e.id)), n = this.collection.toArray().filter((e) => e.isEdge()), r = /* @__PURE__ */ new Set(), i = (e) => e.getVertices().length > 0 || !e.getSourceCellId() || !e.getTargetCellId();
		this.graph.model.getEdges().forEach((e) => {
			let n = e.getSourceCellId(), a = e.getTargetCellId();
			(n != null && t.has(n) || a != null && t.has(a)) && i(e) && r.add(e);
		}), n.forEach((e) => {
			i(e) && r.add(e);
		}), this.translatingCache = {
			selectedNodes: e,
			nodeIdSet: t,
			edgesToTranslate: Array.from(r)
		};
	}
	applyMovingRouterFallback() {
		if (this.movingRouterRestoreCache) return;
		let e = this.translatingCache?.selectedNodes;
		if (!e || e.length < 2) return;
		let t = this.options.movingRouterFallback;
		if (!t || !Db.exist(t)) return;
		let n = { name: t }, r = {}, i = /* @__PURE__ */ new Set();
		e.forEach((e) => {
			this.graph.model.getConnectedEdges(e).forEach((e) => {
				if (i.has(e.id)) return;
				i.add(e.id);
				let t = e.getRouter();
				r[e.id] = t, e.setRouter(n, { silent: !0 });
			});
		}), this.movingRouterRestoreCache = r, this.movingDegradeActivatedTs = Date.now();
	}
	restoreMovingRouters() {
		let e = this.movingRouterRestoreCache;
		e && (Object.keys(e).forEach((t) => {
			let n = this.graph.getCellById(t);
			if (!n || !n.isEdge()) return;
			let r = e[t];
			r == null ? n.removeRouter({ silent: !0 }) : n.setRouter(r, { silent: !0 });
			let i = this.graph.findViewByCell(n);
			i && this.graph.renderer.requestViewUpdate(i, i.getFlag("update"), { async: !0 });
		}), this.movingRouterRestoreCache = null);
	}
	scheduleMovingRouterRestoreThrottle() {
		this.movingRouterRestoreTimer && (clearTimeout(this.movingRouterRestoreTimer), this.movingRouterRestoreTimer = null), this.movingRouterRestoreTimer = setTimeout(() => {
			let t = Date.now(), n = t - (this.lastMovingTs || 0), r = this.movingDegradeActivatedTs == null ? Infinity : t - this.movingDegradeActivatedTs;
			if (n < e.RESTORE_IDLE_TIME || r < e.RESTORE_HOLD_TIME) {
				let t = Math.max(e.RESTORE_IDLE_TIME - n, e.RESTORE_HOLD_TIME - r, e.MIN_RESTORE_WAIT_TIME);
				this.movingRouterRestoreTimer = setTimeout(() => {
					this.movingRouterRestoreTimer = null, this.restoreMovingRouters();
				}, t);
			} else this.movingRouterRestoreTimer = null, this.restoreMovingRouters();
		}, e.RESTORE_IDLE_TIME);
	}
	getSelectionOffset(e, t) {
		let n = e.x - t.clientX, r = e.y - t.clientY, i = this.getRestrictArea();
		if (i) {
			let a = this.collection.toArray(), o = X.getCellsBBox(a, { deep: !0 }) || L.create(), s = i.x - o.x, c = i.y - o.y, l = i.x + i.width - (o.x + o.width), u = i.y + i.height - (o.y + o.height);
			if (n < s && (n = s), r < c && (r = c), l < n && (n = l), u < r && (r = u), !this.options.following) {
				let i = e.x - t.originX, a = e.y - t.originY;
				n = i <= s || i >= l ? 0 : n, r = a <= c || a >= u ? 0 : r;
			}
		}
		return {
			dx: n,
			dy: r
		};
	}
	updateSelectedNodesPosition(e) {
		(e.dx !== 0 || e.dy !== 0) && (this.dragPendingOffset ? (this.dragPendingOffset.dx += e.dx, this.dragPendingOffset.dy += e.dy) : this.dragPendingOffset = {
			dx: e.dx,
			dy: e.dy
		}, this.dragRafId ?? (this.dragRafId = requestAnimationFrame(() => {
			let e = this.dragPendingOffset || {
				dx: 0,
				dy: 0
			};
			this.dragPendingOffset = null, this.dragRafId = null, this.applyDraggingPreview(e), this.boxesUpdated = !0, this.isDragging = !0;
		})));
	}
	autoScrollGraph(e, t) {
		let n = this.graph.getPlugin("scroller");
		return n?.autoScroll ? n.autoScroll(e, t) : {
			scrollerX: 0,
			scrollerY: 0
		};
	}
	adjustSelection(e) {
		let t = this.normalizeEvent(e), n = this.getEventData(t);
		switch (n.action) {
			case "selecting": {
				let r = n;
				r.moving !== !0 && (Ud(this.container, this.graph.container), this.showRubberband(), r.moving = !0);
				let { scrollerX: i, scrollerY: a } = this.autoScrollGraph(t.clientX, t.clientY);
				r.scrollerX += i, r.scrollerY += a;
				let o = t.clientX - r.clientX + r.scrollerX, s = t.clientY - r.clientY + r.scrollerY;
				U(this.container, {
					left: o < 0 ? r.offsetX + o : r.offsetX,
					top: s < 0 ? r.offsetY + s : r.offsetY,
					width: Math.abs(o),
					height: Math.abs(s)
				});
				let c = this.graph.snapToGrid(t.clientX, t.clientY), l = this.getSelectingRect(), u = this.getCellsInArea(l);
				this.notifyBoxEvent("box:mousemove", e, c.x, c.y, u);
				break;
			}
			case "translating": {
				this.isDragging = !0;
				let r = this.graph.snapToGrid(t.clientX, t.clientY), i = n, a = this.getSelectionOffset(r, i);
				this.options.following ? this.updateSelectedNodesPosition(a) : this.updateContainerPosition(a), a.dx && (i.clientX = r.x), a.dy && (i.clientY = r.y), (a.dx !== 0 || a.dy !== 0) && (this.lastMovingTs = Date.now(), this.applyMovingRouterFallback(), this.scheduleMovingRouterRestoreThrottle()), this.notifyBoxEvent("box:mousemove", e, r.x, r.y);
				break;
			}
		}
		this.boxesUpdated = !1;
	}
	translateSelectedNodes(e, t, n, r) {
		let i = {}, a = [];
		if (n && (i[n.id] = !0), this.collection.toArray().forEach((e) => {
			e.getDescendants({ deep: !0 }).forEach((e) => {
				i[e.id] = !0;
			});
		}), r?.translateBy) {
			let e = this.graph.getCellById(r.translateBy);
			e && (i[e.id] = !0, e.getDescendants({ deep: !0 }).forEach((e) => {
				i[e.id] = !0;
			}), a.push(e));
		}
		let o = Object.assign(Object.assign({}, r), {
			selection: this.cid,
			exclude: a
		}), s = (this.translatingCache?.selectedNodes ?? this.collection.toArray().filter((e) => e.isNode())).filter((e) => !i[e.id]);
		s.forEach((n) => {
			n.translate(e, t, o);
		});
		let c = this.translatingCache?.edgesToTranslate, l = /* @__PURE__ */ new Set();
		if (c) c.forEach((e) => {
			l.add(e);
		});
		else {
			let e = new Set(s.map((e) => e.id));
			this.graph.model.getEdges().forEach((t) => {
				let n = t.getSourceCellId(), r = t.getTargetCellId(), i = n ? e.has(n) : !1, a = r ? e.has(r) : !1;
				(i || a) && (t.getVertices().length > 0 || !n || !r) && l.add(t);
			});
		}
		this.collection.toArray().filter((e) => e.isEdge() && !i[e.id]).forEach((e) => {
			let t = e.getVertices().length > 0, n = !e.getSourceCellId() || !e.getTargetCellId();
			(t || n) && l.add(e);
		}), l.forEach((n) => {
			n.translate(e, t, o);
		});
	}
	getCellViewsInArea(e) {
		let t = this.graph, n = { strict: this.options.strict }, r = [];
		return this.options.rubberNode && (r = r.concat(t.model.getNodesInArea(e, n).map((e) => t.renderer.findViewByCell(e)).filter((e) => e != null))), this.options.rubberEdge && (r = r.concat(t.model.getEdgesInArea(e, n).map((e) => t.renderer.findViewByCell(e)).filter((e) => e != null))), r;
	}
	getCellsInArea(e) {
		return this.filter(this.getCellViewsInArea(e).map((e) => e.cell));
	}
	getSelectingRect() {
		let e = mm(this.container), t = hm(this.container), n = pm(this.container), r = this.graph.pageToLocal(n.left, n.top), i = this.graph.transform.getScale();
		return e /= i.sx, t /= i.sy, new L(r.x, r.y, e, t);
	}
	getBoxEventCells(e, t = null) {
		let n = [], r = [], i = t;
		return (e ?? this.cells).forEach((e) => {
			let t = this.graph.getCellById(e.id);
			t && (i || (i = this.graph.renderer.findViewByCell(t)), t.isNode() ? n.push(t) : t.isEdge() && r.push(t));
		}), {
			view: i,
			cell: i?.cell ?? null,
			nodes: n,
			edges: r
		};
	}
	notifyBoxEvent(e, t, n, r, i) {
		let a = this.getEventData(t)?.activeView ?? null, { view: o, cell: s, nodes: c, edges: l } = this.getBoxEventCells(i, a);
		this.trigger(e, {
			e: t,
			view: o,
			x: n,
			y: r,
			cell: s,
			nodes: c,
			edges: l
		});
	}
	getSelectedClassName(e) {
		return this.prefixClassName(`${e.isNode() ? "node" : "edge"}-selected`);
	}
	addCellSelectedClassName(e) {
		let t = this.graph.renderer.findViewByCell(e);
		t && t.addClass(this.getSelectedClassName(e));
	}
	removeCellUnSelectedClassName(e) {
		let t = this.graph.renderer.findViewByCell(e);
		t && t.removeClass(this.getSelectedClassName(e));
	}
	destroySelectionBox(e) {
		this.removeCellUnSelectedClassName(e), this.canShowSelectionBox(e) && (Ld(this.container.querySelector(`[data-cell-id="${e.id}"]`)), this.$boxes.length === 0 && this.hide(), this.boxCount = Math.max(0, this.boxCount - 1));
	}
	destroyAllSelectionBoxes(e) {
		e.forEach((e) => {
			this.removeCellUnSelectedClassName(e);
		}), this.hide(), Ld(this.$boxes), this.boxCount = 0;
	}
	hide() {
		V(this.container, this.prefixClassName(Kw.rubberband)), V(this.container, this.prefixClassName(Kw.selected));
	}
	showRubberband() {
		B(this.container, this.prefixClassName(Kw.rubberband));
	}
	hideRubberband() {
		V(this.container, this.prefixClassName(Kw.rubberband));
	}
	showSelected() {
		Qd(this.container, "style"), B(this.container, this.prefixClassName(Kw.selected));
	}
	createContainer() {
		this.container = document.createElement("div"), B(this.container, this.prefixClassName(Kw.root)), this.options.className && B(this.container, this.options.className), U(this.container, { willChange: "transform" }), this.selectionContainer = document.createElement("div"), B(this.selectionContainer, this.prefixClassName(Kw.inner)), this.selectionContent = document.createElement("div"), B(this.selectionContent, this.prefixClassName(Kw.content)), zd(this.selectionContainer, this.selectionContent), H(this.selectionContainer, "data-selection-length", this.collection.length), Bd(this.container, this.selectionContainer);
	}
	getDraggingPreviewMode() {
		return this.options.following && this.collection.toArray().some((e) => e.isEdge() && this.canShowSelectionBox(e)) ? "geometry" : "translate";
	}
	applyDraggingPreview(e) {
		(e.dx !== 0 || e.dy !== 0) && (this.options.following && (this.translateSelectedNodes(e.dx, e.dy), this.draggingPreviewMode === "geometry") ? (this.repositionSelectionBoxesInPlace(), this.resetContainerPosition()) : this.updateContainerPosition(e));
	}
	resetContainerPosition() {
		this.containerLocalOffsetX = 0, this.containerLocalOffsetY = 0, this.containerOffsetX = 0, this.containerOffsetY = 0, U(this.container, "transform", "");
	}
	syncContainerPosition() {
		let e = this.graph.coord.localToGraphPoint(0, 0), t = this.graph.coord.localToGraphPoint(this.containerLocalOffsetX, this.containerLocalOffsetY);
		this.containerOffsetX = t.x - e.x, this.containerOffsetY = t.y - e.y, this.containerOffsetX === 0 && this.containerOffsetY === 0 ? U(this.container, "transform", "") : U(this.container, "transform", `translate3d(${this.containerOffsetX}px, ${this.containerOffsetY}px, 0)`);
	}
	updateContainerPosition(e) {
		(e.dx || e.dy) && (this.containerLocalOffsetX += e.dx, this.containerLocalOffsetY += e.dy, this.syncContainerPosition());
	}
	updateContainer() {
		let e = {
			x: Infinity,
			y: Infinity
		}, t = {
			x: 0,
			y: 0
		};
		this.collection.toArray().filter((e) => this.canShowSelectionBox(e)).forEach((n) => {
			let r = this.graph.renderer.findViewByCell(n);
			if (r) {
				let n = r.getBBox({ useCellGeometry: !0 });
				e.x = Math.min(e.x, n.x), e.y = Math.min(e.y, n.y), t.x = Math.max(t.x, n.x + n.width), t.y = Math.max(t.y, n.y + n.height);
			}
		}), U(this.selectionContainer, {
			position: "absolute",
			pointerEvents: this.options.movable ? "auto" : "none",
			cursor: this.options.movable ? "move" : "default",
			left: e.x,
			top: e.y,
			width: t.x - e.x,
			height: t.y - e.y
		}), H(this.selectionContainer, "data-selection-length", this.collection.length);
		let n = this.options.content;
		if (n) {
			if (typeof n == "function") {
				let e = F(n, this.graph, this, this.selectionContent);
				e && (this.selectionContent.innerHTML = e);
			} else this.selectionContent.innerHTML = n;
		}
		this.collection.length > 0 && !this.container.parentNode ? Ud(this.container, this.graph.container) : this.collection.length <= 0 && this.container.parentNode && this.container.parentNode.removeChild(this.container);
	}
	canShowSelectionBox(e) {
		return e.isNode() && this.options.showNodeSelectionBox === !0 || e.isEdge() && this.options.showEdgeSelectionBox === !0;
	}
	getPointerEventsValue(e) {
		return typeof e == "string" ? e : e(this.cells);
	}
	createSelectionBox(e) {
		if (this.addCellSelectedClassName(e), this.canShowSelectionBox(e)) {
			let t = this.graph.renderer.findViewByCell(e);
			if (t) {
				let n = t.getBBox({ useCellGeometry: !0 }), r = this.boxClassName, i = document.createElement("div"), a = this.options.pointerEvents;
				B(i, r), B(i, `${r}-${e.isNode() ? "node" : "edge"}`), H(i, "data-cell-id", e.id), U(i, {
					position: "absolute",
					left: n.x,
					top: n.y,
					width: n.width,
					height: n.height,
					pointerEvents: a ? this.getPointerEventsValue(a) : "auto"
				}), Ud(i, this.container), this.showSelected(), this.boxCount += 1;
			}
		}
	}
	updateSelectionBoxes() {
		if (this.collection.length > 0) {
			if (this.isDragging) return;
			this.updateThrottleTimer && clearTimeout(this.updateThrottleTimer), this.updateThrottleTimer = setTimeout(() => {
				this.refreshSelectionBoxes(), this.updateThrottleTimer = null;
			}, 16);
		}
	}
	refreshSelectionBoxes() {
		Ld(this.$boxes), this.boxCount = 0, this.collection.toArray().forEach((e) => {
			this.createSelectionBox(e);
		}), this.updateContainer(), this.boxesUpdated = !0;
	}
	repositionSelectionBoxesInPlace() {
		let e = this.$boxes;
		if (e.length === 0) this.refreshSelectionBoxes();
		else {
			for (let t of e) {
				let e = t.getAttribute("data-cell-id");
				if (!e) continue;
				let n = this.collection.get(e);
				if (!n) continue;
				let r = this.graph.renderer.findViewByCell(n);
				if (!r) continue;
				let i = r.getBBox({ useCellGeometry: !0 });
				U(t, {
					left: i.x,
					top: i.y,
					width: i.width,
					height: i.height
				});
			}
			this.updateContainer(), this.boxesUpdated = !0;
		}
	}
	getCellViewFromElem(e) {
		let t = e.getAttribute("data-cell-id");
		if (t) {
			let e = this.collection.get(t);
			if (e) return this.graph.renderer.findViewByCell(e);
		}
		return null;
	}
	onCellRemoved({ cell: e }) {
		this.destroySelectionBox(e), this.batchUpdating || this.updateContainer();
	}
	onReseted({ previous: e, current: t }) {
		this.destroyAllSelectionBoxes(e), t.forEach((e) => {
			this.listenCellRemoveEvent(e), this.createSelectionBox(e);
		}), this.updateContainer();
	}
	onCellAdded({ cell: e }) {
		this.listenCellRemoveEvent(e), this.createSelectionBox(e), this.batchUpdating || this.updateContainer();
	}
	listenCellRemoveEvent(e) {
		e.off("removed", this.onCellRemoved, this), e.on("removed", this.onCellRemoved, this);
	}
	onCollectionUpdated({ added: e, removed: t, options: n }) {
		e.forEach((e) => {
			this.trigger("cell:selected", {
				cell: e,
				options: n
			}), e.isNode() ? this.trigger("node:selected", {
				cell: e,
				options: n,
				node: e
			}) : e.isEdge() && this.trigger("edge:selected", {
				cell: e,
				options: n,
				edge: e
			});
		}), t.forEach((e) => {
			this.trigger("cell:unselected", {
				cell: e,
				options: n
			}), e.isNode() ? this.trigger("node:unselected", {
				cell: e,
				options: n,
				node: e
			}) : e.isEdge() && this.trigger("edge:unselected", {
				cell: e,
				options: n,
				edge: e
			});
		});
		let r = {
			added: e,
			removed: t,
			options: n,
			selected: this.cells.filter((e) => !!this.graph.getCellById(e.id))
		};
		this.trigger("selection:changed", r);
	}
	dispose() {
		this.clean(), this.remove(), this.off();
	}
};
Ww.RESTORE_IDLE_TIME = 100, Ww.RESTORE_HOLD_TIME = 150, Ww.MIN_RESTORE_WAIT_TIME = 50, k([K()], Ww.prototype, "dispose", null);
var Gw = "widget-selection", Kw = {
	root: Gw,
	inner: `${Gw}-inner`,
	box: `${Gw}-box`,
	content: `${Gw}-content`,
	rubberband: `${Gw}-rubberband`,
	selected: `${Gw}-selected`
}, qw = {
	mousemove: "adjustSelection",
	touchmove: "adjustSelection",
	mouseup: "onMouseUp",
	touchend: "onMouseUp",
	touchcancel: "onMouseUp"
};
function Jw(e) {
	return e.getAncestors().length;
}
// node_modules/@antv/x6/es/plugin/selection/style/raw.js
var Yw = ".x6-widget-selection {\n  position: absolute;\n  top: 0;\n  left: 0;\n  display: none;\n  width: 0;\n  height: 0;\n  touch-action: none;\n}\n.x6-widget-selection-rubberband {\n  display: block;\n  overflow: visible;\n  opacity: 0.3;\n}\n.x6-widget-selection-selected {\n  display: block;\n}\n.x6-widget-selection-box {\n  cursor: move;\n}\n.x6-widget-selection-inner[data-selection-length='0'],\n.x6-widget-selection-inner[data-selection-length='1'] {\n  display: none;\n}\n.x6-widget-selection-content {\n  position: absolute;\n  top: 100%;\n  right: -20px;\n  left: -20px;\n  margin-top: 30px;\n  padding: 6px;\n  line-height: 14px;\n  text-align: center;\n  border-radius: 6px;\n}\n.x6-widget-selection-content:empty {\n  display: none;\n}\n.x6-widget-selection-rubberband {\n  background-color: #3498db;\n  border: 2px solid #2980b9;\n}\n.x6-widget-selection-box {\n  box-sizing: content-box !important;\n  margin-top: -4px;\n  margin-left: -4px;\n  padding-right: 4px;\n  padding-bottom: 4px;\n  border: 2px dashed #feb663;\n  box-shadow: 2px 2px 5px #d3d3d3;\n}\n.x6-widget-selection-inner {\n  box-sizing: content-box !important;\n  margin-top: -8px;\n  margin-left: -8px;\n  padding-right: 12px;\n  padding-bottom: 12px;\n  border: 2px solid #feb663;\n  box-shadow: 2px 2px 5px #d3d3d3;\n}\n.x6-widget-selection-content {\n  color: #fff;\n  font-size: 10px;\n  background-color: #6a6b8a;\n}\n";
Q.prototype.isSelectionEnabled = function() {
	let e = this.getPlugin("selection");
	return e ? e.isEnabled() : !1;
}, Q.prototype.enableSelection = function() {
	let e = this.getPlugin("selection");
	return e && e.enable(), this;
}, Q.prototype.disableSelection = function() {
	let e = this.getPlugin("selection");
	return e && e.disable(), this;
}, Q.prototype.toggleSelection = function(e) {
	let t = this.getPlugin("selection");
	return t && t.toggleEnabled(e), this;
}, Q.prototype.isMultipleSelection = function() {
	let e = this.getPlugin("selection");
	return e ? e.isMultipleSelection() : !1;
}, Q.prototype.enableMultipleSelection = function() {
	let e = this.getPlugin("selection");
	return e && e.enableMultipleSelection(), this;
}, Q.prototype.disableMultipleSelection = function() {
	let e = this.getPlugin("selection");
	return e && e.disableMultipleSelection(), this;
}, Q.prototype.toggleMultipleSelection = function(e) {
	let t = this.getPlugin("selection");
	return t && t.toggleMultipleSelection(e), this;
}, Q.prototype.isSelectionMovable = function() {
	let e = this.getPlugin("selection");
	return e ? e.isSelectionMovable() : !1;
}, Q.prototype.enableSelectionMovable = function() {
	let e = this.getPlugin("selection");
	return e && e.enableSelectionMovable(), this;
}, Q.prototype.disableSelectionMovable = function() {
	let e = this.getPlugin("selection");
	return e && e.disableSelectionMovable(), this;
}, Q.prototype.toggleSelectionMovable = function(e) {
	let t = this.getPlugin("selection");
	return t && t.toggleSelectionMovable(e), this;
}, Q.prototype.isRubberbandEnabled = function() {
	let e = this.getPlugin("selection");
	return e ? e.isRubberbandEnabled() : !1;
}, Q.prototype.enableRubberband = function() {
	let e = this.getPlugin("selection");
	return e && e.enableRubberband(), this;
}, Q.prototype.disableRubberband = function() {
	let e = this.getPlugin("selection");
	return e && e.disableRubberband(), this;
}, Q.prototype.toggleRubberband = function(e) {
	let t = this.getPlugin("selection");
	return t && t.toggleRubberband(e), this;
}, Q.prototype.isStrictRubberband = function() {
	let e = this.getPlugin("selection");
	return e ? e.isStrictRubberband() : !1;
}, Q.prototype.enableStrictRubberband = function() {
	let e = this.getPlugin("selection");
	return e && e.enableStrictRubberband(), this;
}, Q.prototype.disableStrictRubberband = function() {
	let e = this.getPlugin("selection");
	return e && e.disableStrictRubberband(), this;
}, Q.prototype.toggleStrictRubberband = function(e) {
	let t = this.getPlugin("selection");
	return t && t.toggleStrictRubberband(e), this;
}, Q.prototype.setRubberbandModifiers = function(e) {
	let t = this.getPlugin("selection");
	return t && t.setRubberbandModifiers(e), this;
}, Q.prototype.setSelectionFilter = function(e) {
	let t = this.getPlugin("selection");
	return t && t.setSelectionFilter(e), this;
}, Q.prototype.setSelectionDisplayContent = function(e) {
	let t = this.getPlugin("selection");
	return t && t.setSelectionDisplayContent(e), this;
}, Q.prototype.isSelectionEmpty = function() {
	let e = this.getPlugin("selection");
	return !e || e.isEmpty();
}, Q.prototype.cleanSelection = function(e) {
	let t = this.getPlugin("selection");
	return t && t.clean(e), this;
}, Q.prototype.resetSelection = function(e, t) {
	let n = this.getPlugin("selection");
	return n && n.reset(e, t), this;
}, Q.prototype.getSelectedCells = function() {
	let e = this.getPlugin("selection");
	return e ? e.getSelectedCells() : [];
}, Q.prototype.getSelectedCellCount = function() {
	let e = this.getPlugin("selection");
	return e ? e.getSelectedCellCount() : 0;
}, Q.prototype.isSelected = function(e) {
	let t = this.getPlugin("selection");
	return t ? t.isSelected(e) : !1;
}, Q.prototype.select = function(e, t) {
	let n = this.getPlugin("selection");
	return n && n.select(e, t), this;
}, Q.prototype.unselect = function(e, t) {
	let n = this.getPlugin("selection");
	return n && n.unselect(e, t), this;
};
// node_modules/@antv/x6/es/plugin/selection/index.js
var Xw = {
	rubberband: !1,
	rubberNode: !0,
	rubberEdge: !1,
	pointerEvents: "auto",
	multiple: !0,
	multipleSelectionModifiers: ["ctrl", "meta"],
	movable: !0,
	strict: !1,
	selectCellOnMoved: !1,
	selectNodeOnMoved: !1,
	selectEdgeOnMoved: !1,
	following: !0,
	content: null,
	eventTypes: ["leftMouseDown", "mouseWheelDown"]
}, Zw = class extends xh {
	get rubberbandDisabled() {
		return this.options.enabled !== !0 || this.options.rubberband !== !0;
	}
	get disabled() {
		return this.options.enabled !== !0;
	}
	get length() {
		return this.selectionImpl.length;
	}
	get cells() {
		return this.selectionImpl.cells;
	}
	constructor(e = {}) {
		super(), this.name = "selection", this.movedMap = /* @__PURE__ */ new WeakMap(), this.unselectMap = /* @__PURE__ */ new WeakMap(), this.options = Object.assign(Object.assign({ enabled: !0 }, Xw), e), bu(this.name, Yw);
	}
	init(e) {
		this.graph = e, this.selectionImpl = new Ww(Object.assign(Object.assign({}, this.options), { graph: e })), this.resolvePanningSelectionConflict(), this.setup(), this.startListening();
	}
	isEnabled() {
		return !this.disabled;
	}
	enable() {
		this.disabled && (this.options.enabled = !0);
	}
	disable() {
		this.disabled || (this.options.enabled = !1);
	}
	toggleEnabled(e) {
		return e == null ? this.isEnabled() ? this.disable() : this.enable() : e !== this.isEnabled() && (e ? this.enable() : this.disable()), this;
	}
	isMultipleSelection() {
		return this.isMultiple();
	}
	enableMultipleSelection() {
		return this.enableMultiple(), this;
	}
	disableMultipleSelection() {
		return this.disableMultiple(), this;
	}
	toggleMultipleSelection(e) {
		return e == null ? this.isMultipleSelection() ? this.disableMultipleSelection() : this.enableMultipleSelection() : e !== this.isMultipleSelection() && (e ? this.enableMultipleSelection() : this.disableMultipleSelection()), this;
	}
	isSelectionMovable() {
		return this.options.movable !== !1;
	}
	enableSelectionMovable() {
		return this.selectionImpl.options.movable = !0, this;
	}
	disableSelectionMovable() {
		return this.selectionImpl.options.movable = !1, this;
	}
	toggleSelectionMovable(e) {
		return e == null ? this.isSelectionMovable() ? this.disableSelectionMovable() : this.enableSelectionMovable() : e !== this.isSelectionMovable() && (e ? this.enableSelectionMovable() : this.disableSelectionMovable()), this;
	}
	isRubberbandEnabled() {
		return !this.rubberbandDisabled;
	}
	enableRubberband() {
		return this.rubberbandDisabled && (this.options.rubberband = !0), this;
	}
	disableRubberband() {
		return this.rubberbandDisabled || (this.options.rubberband = !1), this;
	}
	toggleRubberband(e) {
		return e == null ? this.isRubberbandEnabled() ? this.disableRubberband() : this.enableRubberband() : e !== this.isRubberbandEnabled() && (e ? this.enableRubberband() : this.disableRubberband()), this;
	}
	isStrictRubberband() {
		return this.selectionImpl.options.strict === !0;
	}
	enableStrictRubberband() {
		return this.selectionImpl.options.strict = !0, this;
	}
	disableStrictRubberband() {
		return this.selectionImpl.options.strict = !1, this;
	}
	toggleStrictRubberband(e) {
		return e == null ? this.isStrictRubberband() ? this.disableStrictRubberband() : this.enableStrictRubberband() : e !== this.isStrictRubberband() && (e ? this.enableStrictRubberband() : this.disableStrictRubberband()), this;
	}
	setRubberbandModifiers(e) {
		this.setModifiers(e);
	}
	setSelectionFilter(e) {
		return this.setFilter(e), this;
	}
	setSelectionDisplayContent(e) {
		return this.setContent(e), this;
	}
	isEmpty() {
		return this.length <= 0;
	}
	clean(e = {}) {
		return this.selectionImpl.clean(e), this;
	}
	reset(e, t = {}) {
		return this.selectionImpl.reset(e ? this.getCells(e) : [], t), this;
	}
	getSelectedCells() {
		return this.cells;
	}
	getSelectedCellCount() {
		return this.length;
	}
	isSelected(e) {
		return this.selectionImpl.isSelected(e);
	}
	select(e, t = {}) {
		let n = this.getCells(e);
		return n.length && (this.isMultiple() ? this.selectionImpl.select(n, t) : this.reset(n.slice(0, 1), t)), this;
	}
	unselect(e, t = {}) {
		return this.selectionImpl.unselect(this.getCells(e), t), this;
	}
	setup() {
		this.selectionImpl.on("*", (e, t) => {
			this.trigger(e, t), this.graph.trigger(e, t);
		});
	}
	startListening() {
		this.graph.on("blank:mousedown", this.onBlankMouseDown, this), this.graph.on("blank:click", this.onBlankClick, this), this.graph.on("cell:mousemove", this.onCellMouseMove, this), this.graph.on("cell:mouseup", this.onCellMouseUp, this), this.selectionImpl.on("box:mousedown", this.onBoxMouseDown, this);
	}
	stopListening() {
		this.graph.off("blank:mousedown", this.onBlankMouseDown, this), this.graph.off("blank:click", this.onBlankClick, this), this.graph.off("cell:mousemove", this.onCellMouseMove, this), this.graph.off("cell:mouseup", this.onCellMouseUp, this), this.selectionImpl.off("box:mousedown", this.onBoxMouseDown, this);
	}
	onBlankMouseDown({ e }) {
		if (!this.allowBlankMouseDown(e)) return;
		let t = this.graph.panning.allowPanning(e, !0), n = this.graph.getPlugin("scroller"), r = n && n.allowPanning(e, !0);
		(this.allowRubberband(e, !0) || this.allowRubberband(e) && !r && !t) && this.startRubberband(e);
	}
	allowBlankMouseDown(e) {
		let t = this.options.eventTypes;
		return typeof e.type == "string" && e.type.startsWith("touch") || e.pointerType === "touch" ? t?.includes("leftMouseDown") : t?.includes("leftMouseDown") && e.button === 0 || t?.includes("mouseWheelDown") && e.button === 1;
	}
	onBlankClick() {
		this.clean();
	}
	allowRubberband(e, t) {
		let n = e ?? {
			altKey: !1,
			ctrlKey: !1,
			metaKey: !1,
			shiftKey: !1
		};
		return !this.rubberbandDisabled && Th(n, this.options.modifiers, t);
	}
	resolvePanningSelectionConflict() {
		if (this.options.enabled !== !0 || this.options.rubberband !== !0) return;
		let e = this.graph.options.panning;
		e && e.enabled !== !1 && (() => {
			let t = this.options.eventTypes ?? [], n = e.eventTypes ?? [], r = new Set(n), i = t.some((e) => r.has(e)), a = wh(e.modifiers, this.options.modifiers);
			return i && a;
		})() && this.graph.panning.disablePanning();
	}
	allowMultipleSelection(e) {
		return this.isMultiple() && Th(e, this.options.multipleSelectionModifiers);
	}
	onCellMouseMove({ cell: e }) {
		this.movedMap.set(e, !0);
	}
	onCellMouseUp({ e, cell: t }) {
		let n = this.options, r = this.disabled;
		!r && this.movedMap.has(t) && (r = n.selectCellOnMoved === !1, r || (r = n.selectNodeOnMoved === !1 && t.isNode()), r || (r = n.selectEdgeOnMoved === !1 && t.isEdge())), r || (this.allowMultipleSelection(e) ? this.unselectMap.has(t) ? this.unselectMap.delete(t) : this.isSelected(t) ? this.unselect(t) : this.select(t) : this.reset(t)), this.movedMap.delete(t);
	}
	onBoxMouseDown({ e, cell: t }) {
		!this.disabled && t && this.allowMultipleSelection(e) && (this.unselect(t), this.unselectMap.set(t, !0));
	}
	getCells(e) {
		return (Array.isArray(e) ? e : [e]).map((e) => typeof e == "string" ? this.graph.getCellById(e) : e).filter((e) => e != null);
	}
	startRubberband(e) {
		return this.rubberbandDisabled || this.selectionImpl.startSelecting(e), this;
	}
	isMultiple() {
		return this.options.multiple !== !1;
	}
	enableMultiple() {
		return this.options.multiple = !0, this;
	}
	disableMultiple() {
		return this.options.multiple = !1, this;
	}
	setModifiers(e) {
		return this.options.modifiers = e, this;
	}
	setContent(e) {
		return this.selectionImpl.setContent(e), this;
	}
	setFilter(e) {
		return this.selectionImpl.setFilter(e), this;
	}
	dispose() {
		this.stopListening(), this.off(), this.selectionImpl.dispose(), xu(this.name);
	}
};
k([K()], Zw.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/minimap/style/raw.js
var Qw = ".x6-widget-minimap {\n  position: relative;\n  display: table-cell;\n  box-sizing: border-box;\n  overflow: hidden;\n  text-align: center;\n  vertical-align: middle;\n  background-color: #fff;\n  user-select: none;\n}\n.x6-widget-minimap .x6-graph {\n  display: inline-block;\n  box-shadow: 0 0 4px 0 #eee;\n  cursor: pointer;\n}\n.x6-widget-minimap .x6-graph > svg {\n  pointer-events: none;\n  shape-rendering: optimizespeed;\n}\n.x6-widget-minimap .x6-graph .x6-node * {\n  /* stylelint-disable-next-line */\n  vector-effect: initial;\n}\n.x6-widget-minimap-viewport {\n  position: absolute;\n  box-sizing: content-box !important;\n  margin: -2px 0 0 -2px;\n  border: 2px solid #31d0c6;\n  cursor: move;\n}\n.x6-widget-minimap-viewport-zoom {\n  position: absolute;\n  right: 0;\n  bottom: 0;\n  box-sizing: border-box;\n  width: 12px;\n  height: 12px;\n  margin: 0 -6px -6px 0;\n  background-color: #fff;\n  border: 2px solid #31d0c6;\n  border-radius: 50%;\n  cursor: nwse-resize;\n}\n", $w = {
	width: 300,
	height: 200,
	padding: 10,
	scalable: !0,
	minScale: .01,
	maxScale: 16,
	graphOptions: {},
	createGraph: (e) => new Q(e)
}, eT = {
	mousemove: "doAction",
	touchmove: "doAction",
	mouseup: "stopAction",
	touchend: "stopAction"
}, tT = "widget-minimap", nT = `${tT}-viewport`, rT = `${nT}-zoom`, iT = class extends Yb {
	get scroller() {
		return this.graph.getPlugin("scroller");
	}
	get graphContainer() {
		return this.scroller ? this.scroller.container : this.graph.container;
	}
	constructor(e) {
		super(), this.name = "minimap", this.options = Object.assign(Object.assign({}, $w), e), bu(this.name, Qw);
	}
	init(e) {
		this.graph = e, this.updateViewport = Qc(this.updateViewport.bind(this), 0), this.container = document.createElement("div"), B(this.container, this.prefixClassName(tT));
		let t = document.createElement("div");
		this.container.appendChild(t), this.viewport = document.createElement("div"), B(this.viewport, this.prefixClassName(nT)), this.options.scalable && (this.zoomHandle = document.createElement("div"), B(this.zoomHandle, this.prefixClassName(rT)), Ud(this.zoomHandle, this.viewport)), zd(this.container, this.viewport), U(this.container, {
			width: this.options.width,
			height: this.options.height,
			padding: this.options.padding
		}), this.options.container && this.options.container.appendChild(this.container), this.sourceGraph = this.graph;
		let n = Object.assign(Object.assign({}, this.options.graphOptions), {
			container: t,
			model: this.sourceGraph.model,
			interacting: !1,
			grid: !1,
			background: !1,
			embedding: !1,
			panning: !1
		});
		this.targetGraph = this.options.createGraph ? this.options.createGraph(n) : new Q(n), this.updatePaper(this.sourceGraph.options.width, this.sourceGraph.options.height), this.startListening();
	}
	startListening() {
		this.scroller ? G.on(this.graphContainer, `scroll${this.getEventNamespace()}`, this.updateViewport) : (this.sourceGraph.on("translate", this.onTransform, this), this.sourceGraph.on("scale", this.onTransform, this), this.sourceGraph.on("model:updated", this.onModelUpdated, this)), this.sourceGraph.on("resize", this.updatePaper, this), this.delegateEvents({
			mousedown: "startAction",
			touchstart: "startAction",
			[`mousedown .${this.prefixClassName("graph")}`]: "scrollTo",
			[`touchstart .${this.prefixClassName("graph")}`]: "scrollTo"
		});
	}
	stopListening() {
		this.scroller ? G.off(this.graphContainer, this.getEventNamespace()) : (this.sourceGraph.off("translate", this.onTransform, this), this.sourceGraph.off("scale", this.onTransform, this), this.sourceGraph.off("model:updated", this.onModelUpdated, this)), this.sourceGraph.off("resize", this.updatePaper, this), this.undelegateEvents();
	}
	onRemove() {
		this.stopListening(), this.targetGraph.dispose(!1);
	}
	onTransform(e) {
		(e.ui || this.targetGraphTransforming || !this.scroller) && this.updateViewport();
	}
	onModelUpdated() {
		this.targetGraph.zoomToFit();
	}
	updatePaper(e, t) {
		let n, r;
		typeof e == "object" ? (n = e.width, r = e.height) : (n = e, r = t);
		let i = this.sourceGraph.options, a = this.sourceGraph.transform.getScale(), o = this.options.width - 2 * this.options.padding, s = this.options.height - 2 * this.options.padding;
		n /= a.sx, r /= a.sy, this.ratio = Math.min(o / n, s / r);
		let c = this.ratio, l = i.x * c / a.sx, u = i.y * c / a.sy;
		return n *= c, r *= c, this.targetGraph.resize(n, r), this.targetGraph.translate(l, u), this.scroller ? this.targetGraph.scale(c, c) : this.targetGraph.zoomToFit(), this.updateViewport(), this;
	}
	updateViewport() {
		let e = this.sourceGraph.transform.getScale(), t = this.targetGraph.transform.getScale(), n = this.scroller ? this.scroller.clientToLocalPoint(0, 0) : this.graph.graphToLocal(0, 0), r = gm(this.targetGraph.container), i = this.targetGraph.translate();
		i.ty = i.ty || 0, this.geometry = {
			top: r.top + n.y * t.sy + i.ty,
			left: r.left + n.x * t.sx + i.tx,
			width: this.graphContainer.clientWidth * t.sx / e.sx,
			height: this.graphContainer.clientHeight * t.sy / e.sy
		}, U(this.viewport, this.geometry);
	}
	startAction(e) {
		let t = this.normalizeEvent(e), n = t.target === this.zoomHandle ? "zooming" : "panning", { tx: r, ty: i } = this.sourceGraph.translate(), a = {
			action: n,
			clientX: t.clientX,
			clientY: t.clientY,
			scrollLeft: this.graphContainer.scrollLeft,
			scrollTop: this.graphContainer.scrollTop,
			zoom: this.sourceGraph.zoom(),
			scale: this.sourceGraph.transform.getScale(),
			geometry: this.geometry,
			translateX: r,
			translateY: i
		};
		this.targetGraphTransforming = !0, this.delegateDocumentEvents(eT, a);
	}
	doAction(e) {
		let t = this.normalizeEvent(e), n = t.clientX, r = t.clientY, i = t.data;
		switch (i.action) {
			case "panning": {
				let e = this.sourceGraph.transform.getScale(), t = (n - i.clientX) * e.sx, a = (r - i.clientY) * e.sy;
				this.scroller ? (this.graphContainer.scrollLeft = i.scrollLeft + t / this.ratio, this.graphContainer.scrollTop = i.scrollTop + a / this.ratio) : this.sourceGraph.translate(i.translateX - t / this.ratio, i.translateY - a / this.ratio);
				break;
			}
			case "zooming": {
				let e = i.scale, t = i.geometry, r = 1 + (i.clientX - n) / t.width / e.sx;
				i.frameId && cancelAnimationFrame(i.frameId), i.frameId = requestAnimationFrame(() => {
					this.sourceGraph.zoom(r * i.zoom, {
						absolute: !0,
						minScale: this.options.minScale,
						maxScale: this.options.maxScale
					});
				});
				break;
			}
		}
	}
	stopAction() {
		this.undelegateDocumentEvents(), this.targetGraphTransforming = !1;
	}
	scrollTo(e) {
		let t = this.normalizeEvent(e), n, r, i = this.targetGraph.translate();
		if (i.ty = i.ty || 0, t.offsetX == null) {
			let e = pm(this.targetGraph.container);
			n = t.pageX - e.left, r = t.pageY - e.top;
		} else n = t.offsetX, r = t.offsetY;
		let a = (n - i.tx) / this.ratio, o = (r - i.ty) / this.ratio;
		this.sourceGraph.centerPoint(a, o);
	}
	dispose() {
		this.remove(), xu(this.name);
	}
};
k([K()], iT.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/scroller/scroller.js
var aT = "graph-scroller", oT = `${aT}-paged`, sT = `${aT}-content`, cT = `${aT}-background`, lT = "transition-in-progress", uT = "transitionend.graph-scroller-transition", dT = {
	padding() {
		let e = this.getClientSize(), t = Math.max(this.options.minVisibleWidth || 0, 1) || 1, n = Math.max(this.options.minVisibleHeight || 0, 1) || 1, r = Math.max(e.width - t, 0), i = Math.max(e.height - n, 0);
		return {
			left: r,
			top: i,
			right: r,
			bottom: i
		};
	},
	minVisibleWidth: 50,
	minVisibleHeight: 50,
	pageVisible: !1,
	pageBreak: !1,
	autoResize: !0
};
function fT(e) {
	let t = P({}, dT, e);
	t.pageWidth ?? (t.pageWidth = e.graph.options.width), t.pageHeight ?? (t.pageHeight = e.graph.options.height);
	let n = e.graph.options;
	return n.background && t.enabled && t.background == null && (t.background = n.background, e.graph.background.clear()), t;
}
var pT = class extends Yb {
	get graph() {
		return this.options.graph;
	}
	get model() {
		return this.graph.model;
	}
	constructor(e) {
		super(), this.padding = {
			left: 0,
			top: 0,
			right: 0,
			bottom: 0
		}, this.options = fT(e), this.onUpdate = Qc(this.onUpdate, 200);
		let t = this.graph.transform.getScale();
		this.sx = t.sx, this.sy = t.sy;
		let n = this.options.width || this.graph.options.width, r = this.options.height || this.graph.options.height;
		this.container = document.createElement("div"), B(this.container, this.prefixClassName(aT)), U(this.container, {
			width: n,
			height: r
		}), this.options.pageVisible && B(this.container, this.prefixClassName(oT)), this.options.className && B(this.container, this.options.className);
		let i = this.graph.container;
		i.parentNode && Vd(i, this.container), this.content = document.createElement("div"), B(this.content, this.prefixClassName(sT)), U(this.content, {
			width: this.graph.options.width,
			height: this.graph.options.height
		}), this.background = document.createElement("div"), B(this.background, this.prefixClassName(cT)), zd(this.content, this.background), this.options.pageVisible || zd(this.content, this.graph.view.grid), zd(this.content, i), Ud(this.content, this.container), this.startListening(), this.options.pageVisible || this.graph.grid.update(), this.backgroundManager = new mT(this), this.options.autoResize || this.update();
	}
	startListening() {
		let e = this.graph, t = this.model;
		e.on("scale", this.onScale, this), e.on("resize", this.onResize, this), e.on("before:print", this.storeScrollPosition, this), e.on("before:export", this.storeScrollPosition, this), e.on("after:print", this.restoreScrollPosition, this), e.on("after:export", this.restoreScrollPosition, this), t.on("reseted", this.onUpdate, this), t.on("cell:added", this.onUpdate, this), t.on("cell:removed", this.onUpdate, this), t.on("cell:changed", this.onUpdate, this), this.delegateBackgroundEvents();
	}
	stopListening() {
		let e = this.graph, t = this.model;
		e.off("scale", this.onScale, this), e.off("resize", this.onResize, this), e.off("beforeprint", this.storeScrollPosition, this), e.off("beforeexport", this.storeScrollPosition, this), e.off("afterprint", this.restoreScrollPosition, this), e.off("afterexport", this.restoreScrollPosition, this), t.off("reseted", this.onUpdate, this), t.off("cell:added", this.onUpdate, this), t.off("cell:removed", this.onUpdate, this), t.off("cell:changed", this.onUpdate, this), this.undelegateBackgroundEvents();
	}
	enableAutoResize() {
		this.options.autoResize = !0;
	}
	disableAutoResize() {
		this.options.autoResize = !1;
	}
	onUpdate() {
		this.options.autoResize && this.update();
	}
	delegateBackgroundEvents(e) {
		let t = e || GS.events;
		this.delegatedHandlers = Object.keys(t).reduce((e, n) => {
			let r = t[n];
			if (n.indexOf(" ") === -1) {
				if (typeof r == "function") e[n] = r;
				else {
					let t = this.graph.view[r];
					typeof t == "function" && (t = t.bind(this.graph.view), e[n] = t);
				}
			}
			return e;
		}, {}), this.onBackgroundEvent = this.onBackgroundEvent.bind(this), Object.keys(this.delegatedHandlers).forEach((e) => {
			this.delegateEvent(e, { guarded: !1 }, this.onBackgroundEvent);
		});
	}
	undelegateBackgroundEvents() {
		Object.keys(this.delegatedHandlers).forEach((e) => {
			this.undelegateEvent(e, this.onBackgroundEvent);
		});
	}
	onBackgroundEvent(e) {
		let t = !1, n = e.target;
		if (this.options.pageVisible) t = this.options.background ? this.background === n : this.content === n;
		else {
			let e = this.graph.view;
			t = e.background === n || e.grid === n;
		}
		if (t) {
			let t = this.delegatedHandlers[e.type];
			typeof t == "function" && t.apply(this.graph, arguments);
		}
	}
	onResize() {
		this.cachedCenterPoint && (this.centerPoint(this.cachedCenterPoint.x, this.cachedCenterPoint.y), this.updatePageBreak());
	}
	onScale({ sx: e, sy: t, ox: n, oy: r }) {
		this.updateScale(e, t), (n || r) && (this.centerPoint(n, r), this.updatePageBreak()), typeof this.options.autoResizeOptions == "function" && this.update();
	}
	storeScrollPosition() {
		this.cachedScrollLeft = this.container.scrollLeft, this.cachedScrollTop = this.container.scrollTop;
	}
	restoreScrollPosition() {
		this.container.scrollLeft = this.cachedScrollLeft, this.container.scrollTop = this.cachedScrollTop, this.cachedScrollLeft = null, this.cachedScrollTop = null;
	}
	storeClientSize() {
		this.cachedClientSize = {
			width: this.container.clientWidth,
			height: this.container.clientHeight
		};
	}
	restoreClientSize() {
		this.cachedClientSize = null;
	}
	beforeManipulation() {
		(du || fu) && U(this.container, { visibility: "hidden" });
	}
	afterManipulation() {
		(du || fu) && U(this.container, { visibility: "visible" });
	}
	updatePageSize(e, t) {
		e != null && (this.options.pageWidth = e), t != null && (this.options.pageHeight = t), this.updatePageBreak();
	}
	updatePageBreak() {
		if (this.pageBreak && this.pageBreak.parentNode && this.pageBreak.parentNode.removeChild(this.pageBreak), this.pageBreak = null, this.options.pageVisible && this.options.pageBreak) {
			let e = this.graph.options.width, t = this.graph.options.height, n = this.options.pageWidth * this.sx, r = this.options.pageHeight * this.sy;
			if (n === 0 || r === 0) return;
			if (e > n || t > r) {
				let i = !1, a = document.createElement("div");
				for (let t = 1, r = Math.floor(e / n); t < r; t += 1) {
					let e = document.createElement("div");
					B(e, this.prefixClassName("graph-pagebreak-vertical")), U(e, { left: t * n }), Ud(e, a), i = !0;
				}
				for (let e = 1, n = Math.floor(t / r); e < n; e += 1) {
					let t = document.createElement("div");
					B(t, this.prefixClassName("graph-pagebreak-horizontal")), U(t, { top: e * r }), Ud(t, a), i = !0;
				}
				i && (B(a, this.prefixClassName("graph-pagebreak")), Hd(this.graph.view.grid, a), this.pageBreak = a);
			}
		}
	}
	update() {
		let e = this.getClientSize();
		this.cachedCenterPoint = this.clientToLocalPoint(e.width / 2, e.height / 2);
		let t = this.options.autoResizeOptions;
		typeof t == "function" && (t = F(t, this, this));
		let n = Object.assign({
			gridWidth: this.options.pageWidth,
			gridHeight: this.options.pageHeight,
			allowNewOrigin: "negative"
		}, t);
		this.graph.fitToContent(this.getFitToContentOptions(n));
	}
	getFitToContentOptions(e) {
		let t = this.sx, n = this.sy;
		return e.gridWidth && (e.gridWidth *= t), e.gridHeight && (e.gridHeight *= n), e.minWidth && (e.minWidth *= t), e.minHeight && (e.minHeight *= n), typeof e.padding == "object" ? e.padding = {
			left: (e.padding.left || 0) * t,
			right: (e.padding.right || 0) * t,
			top: (e.padding.top || 0) * n,
			bottom: (e.padding.bottom || 0) * n
		} : typeof e.padding == "number" && (e.padding *= t), this.options.autoResize || (e.contentArea = L.create()), e;
	}
	updateScale(e, t) {
		let n = this.graph.options, r = e / this.sx, i = t / this.sy;
		this.sx = e, this.sy = t, this.graph.translate(n.x * r, n.y * i), this.graph.transform.resize(n.width * r, n.height * i);
	}
	scrollbarPosition(e, t) {
		if (e == null && t == null) return {
			left: this.container.scrollLeft,
			top: this.container.scrollTop
		};
		let n = {};
		return typeof e == "number" && (n.scrollLeft = e), typeof t == "number" && (n.scrollTop = t), Of(this.container, n), this;
	}
	scrollToPoint(e, t) {
		let n = this.getClientSize(), r = this.graph.matrix(), i = {};
		return typeof e == "number" && (i.scrollLeft = e - n.width / 2 + r.e + (this.padding.left || 0)), typeof t == "number" && (i.scrollTop = t - n.height / 2 + r.f + (this.padding.top || 0)), Of(this.container, i), this;
	}
	scrollToContent() {
		let e = this.sx, t = this.sy, n = this.graph.getContentArea().getCenter();
		return this.scrollToPoint(n.x * e, n.y * t);
	}
	scrollToCell(e) {
		let t = this.sx, n = this.sy, r = e.getBBox().getCenter();
		return this.scrollToPoint(r.x * t, r.y * n);
	}
	center(e) {
		return this.centerPoint(e);
	}
	centerPoint(e, t, n) {
		let r = this.graph.matrix(), i = r.a, a = r.d, o = -r.e, s = -r.f, c = o + this.graph.options.width, l = s + this.graph.options.height, u;
		if (this.storeClientSize(), typeof e == "number" || typeof t == "number") {
			u = n;
			let r = this.getVisibleArea().getCenter();
			typeof e == "number" ? e *= i : e = r.x, typeof t == "number" ? t *= a : t = r.y;
		} else u = e, e = (o + c) / 2, t = (s + l) / 2;
		if (u && u.padding) return this.positionPoint({
			x: e,
			y: t
		}, "50%", "50%", u);
		let d = this.getPadding(), f = this.getClientSize(), p = f.width / 2, m = f.height / 2, h = p - d.left - e + o, g = p - d.right + e - c, _ = m - d.top - t + s, v = m - d.bottom + t - l;
		this.addPadding(Math.max(h, 0), Math.max(g, 0), Math.max(_, 0), Math.max(v, 0));
		let y = this.scrollToPoint(e, t);
		return this.restoreClientSize(), y;
	}
	centerContent(e) {
		return this.positionContent("center", e);
	}
	centerCell(e, t) {
		return this.positionCell(e, "center", t);
	}
	positionContent(e, t) {
		let n = this.graph.getContentArea(t);
		return this.positionRect(n, e, t);
	}
	positionCell(e, t, n) {
		let r = e.getBBox();
		return this.positionRect(r, t, n);
	}
	positionRect(e, t, n) {
		let r = L.create(e);
		switch (t) {
			case "center": return this.positionPoint(r.getCenter(), "50%", "50%", n);
			case "top": return this.positionPoint(r.getTopCenter(), "50%", 0, n);
			case "top-right": return this.positionPoint(r.getTopRight(), "100%", 0, n);
			case "right": return this.positionPoint(r.getRightMiddle(), "100%", "50%", n);
			case "bottom-right": return this.positionPoint(r.getBottomRight(), "100%", "100%", n);
			case "bottom": return this.positionPoint(r.getBottomCenter(), "50%", "100%", n);
			case "bottom-left": return this.positionPoint(r.getBottomLeft(), 0, "100%", n);
			case "left": return this.positionPoint(r.getLeftMiddle(), 0, "50%", n);
			case "top-left": return this.positionPoint(r.getTopLeft(), 0, 0, n);
			default: return this;
		}
	}
	positionPoint(e, t, n, r = {}) {
		let { padding: i } = r, a = O(r, ["padding"]), o = ou(i), s = L.fromSize(this.getClientSize()), c = s.clone().moveAndExpand({
			x: o.left,
			y: o.top,
			width: -o.right - o.left,
			height: -o.top - o.bottom
		});
		t = au(t, Math.max(0, c.width)), t < 0 && (t = c.width + t), n = au(n, Math.max(0, c.height)), n < 0 && (n = c.height + n);
		let l = c.getTopLeft().translate(t, n), u = s.getCenter().diff(l), d = this.zoom(), f = u.scale(1 / d, 1 / d), p = I.create(e).translate(f);
		return this.centerPoint(p.x, p.y, a);
	}
	zoom(e, t) {
		if (e == null) return this.sx;
		t = t || {};
		let n, r, i = this.getClientSize(), a = this.clientToLocalPoint(i.width / 2, i.height / 2), o = e, s = e;
		if (t.absolute || (o += this.sx, s += this.sy), t.scaleGrid && (o = Math.round(o / t.scaleGrid) * t.scaleGrid, s = Math.round(s / t.scaleGrid) * t.scaleGrid), t.maxScale && (o = Math.min(t.maxScale, o), s = Math.min(t.maxScale, s)), t.minScale && (o = Math.max(t.minScale, o), s = Math.max(t.minScale, s)), o = this.graph.transform.clampScale(o), s = this.graph.transform.clampScale(s), t.center) {
			let e = o / this.sx, i = s / this.sy;
			n = t.center.x - (t.center.x - a.x) / e, r = t.center.y - (t.center.y - a.y) / i;
		} else n = a.x, r = a.y;
		return this.beforeManipulation(), this.graph.transform.scale(o, s, n, r, !1), this.centerPoint(n, r), this.afterManipulation(), this;
	}
	zoomToRect(e, t = {}) {
		let n = L.create(e), r = this.graph;
		if (t.contentArea = n, t.viewportArea == null) {
			let e = this.container.getBoundingClientRect();
			t.viewportArea = {
				x: r.options.x,
				y: r.options.y,
				width: e.width,
				height: e.height
			};
		}
		this.beforeManipulation(), r.transform.scaleContentToFitImpl(t, !1);
		let i = n.getCenter();
		return this.centerPoint(i.x, i.y), this.afterManipulation(), this;
	}
	zoomToFit(e = {}) {
		return this.zoomToRect(this.graph.getContentArea(e), e);
	}
	transitionToPoint(e, t, n) {
		typeof e == "object" ? (n = t, t = e.y, e = e.x) : t = t, n ?? (n = {});
		let r, i, a = this.sx, o = Math.max(n.scale || a, 1e-6), s = this.getClientSize(), c = new I(e, t), l = this.clientToLocalPoint(s.width / 2, s.height / 2);
		if (a === o) {
			let e = l.diff(c).scale(a, a).round();
			r = `translate(${e.x}px,${e.y}px)`;
		} else {
			let e = o / (a - o) * c.distance(l), t = l.clone().move(c, e), n = this.localToBackgroundPoint(t).round();
			r = `scale(${o / a})`, i = `${n.x}px ${n.y}px`;
		}
		let u = n.onTransitionEnd;
		return B(this.container, lT), G.off(this.content, uT), G.on(this.content, uT, (n) => {
			this.syncTransition(o, {
				x: e,
				y: t
			}), typeof u == "function" && F(u, this, n.originalEvent);
		}), U(this.content, {
			transform: r,
			transformOrigin: i,
			transition: "transform",
			transitionDuration: n.duration || "1s",
			transitionDelay: n.delay,
			transitionTimingFunction: n.timing
		}), this;
	}
	syncTransition(e, t) {
		return this.beforeManipulation(), this.graph.scale(e), this.removeTransition(), this.centerPoint(t.x, t.y), this.afterManipulation(), this;
	}
	removeTransition() {
		return V(this.container, lT), G.off(this.content, uT), U(this.content, {
			transform: "",
			transformOrigin: "",
			transition: "",
			transitionDuration: "",
			transitionDelay: "",
			transitionTimingFunction: ""
		}), this;
	}
	transitionToRect(e, t = {}) {
		let n = L.create(e), r = t.maxScale || Infinity, i = t.minScale || Number.MIN_VALUE, a = t.scaleGrid || null, o = t.visibility || 1, s = t.center ? I.create(t.center) : n.getCenter(), c = this.getClientSize(), l = c.width * o, u = c.height * o, d = new L(s.x - l / 2, s.y - u / 2, l, u).getMaxUniformScaleToFit(n, s);
		return d = Math.min(d, r), a && (d = Math.floor(d / a) * a), d = Math.max(i, d), this.transitionToPoint(s, Object.assign({ scale: d }, t));
	}
	startPanning(e) {
		let t = this.normalizeEvent(e);
		this.clientX = t.clientX, this.clientY = t.clientY, this.trigger("pan:start", { e: t }), G.on(document.body, {
			"mousemove.panning touchmove.panning": this.pan.bind(this),
			"mouseup.panning touchend.panning": this.stopPanning.bind(this),
			"mouseleave.panning": this.stopPanning.bind(this)
		}), G.on(window, "mouseup.panning", this.stopPanning.bind(this));
	}
	pan(e) {
		let t = this.normalizeEvent(e), n = t.clientX - this.clientX, r = t.clientY - this.clientY;
		this.container.scrollTop -= r, this.container.scrollLeft -= n, this.clientX = t.clientX, this.clientY = t.clientY, this.trigger("panning", { e: t });
	}
	stopPanning(e) {
		G.off(document.body, ".panning"), G.off(window, ".panning"), this.trigger("pan:stop", { e });
	}
	clientToLocalPoint(e, t) {
		let n = typeof e == "object" ? e.x : e, r = typeof e == "object" ? e.y : t, i = this.graph.matrix();
		return n += this.container.scrollLeft - this.padding.left - i.e, r += this.container.scrollTop - this.padding.top - i.f, new I(n / i.a, r / i.d);
	}
	localToBackgroundPoint(e, t) {
		let n = typeof e == "object" ? I.create(e) : new I(e, t), r = this.graph.matrix(), i = this.padding;
		return _m(n, r).translate(i.left, i.top);
	}
	resize(e, t) {
		let n = e ?? this.container.offsetWidth, r = t ?? this.container.offsetHeight;
		typeof n == "number" && (n = Math.round(n)), typeof r == "number" && (r = Math.round(r)), this.options.width = n, this.options.height = r, U(this.container, {
			width: n,
			height: r
		}), this.update();
	}
	getClientSize() {
		return this.cachedClientSize ? this.cachedClientSize : {
			width: this.container.clientWidth,
			height: this.container.clientHeight
		};
	}
	autoScroll(e, t) {
		let n = this.container, r = n.getBoundingClientRect(), i = 0, a = 0;
		return e <= r.left + 10 && (i = -10), t <= r.top + 10 && (a = -10), e >= r.right - 10 && (i = 10), t >= r.bottom - 10 && (a = 10), i !== 0 && (n.scrollLeft += i), a !== 0 && (n.scrollTop += a), {
			scrollerX: i,
			scrollerY: a
		};
	}
	addPadding(e, t, n, r) {
		let i = this.getPadding();
		this.padding = {
			left: Math.round(i.left + (e || 0)),
			top: Math.round(i.top + (n || 0)),
			bottom: Math.round(i.bottom + (r || 0)),
			right: Math.round(i.right + (t || 0))
		}, i = this.padding, U(this.content, {
			width: i.left + this.graph.options.width + i.right,
			height: i.top + this.graph.options.height + i.bottom
		});
		let a = this.graph.container;
		return a.style.left = `${this.padding.left}px`, a.style.top = `${this.padding.top}px`, this;
	}
	getPadding() {
		let e = this.options.padding;
		return ou(typeof e == "function" ? F(e, this, this) : e);
	}
	getVisibleArea() {
		let e = this.graph.matrix(), t = this.getClientSize(), n = ym({
			x: this.container.scrollLeft || 0,
			y: this.container.scrollTop || 0,
			width: t.width,
			height: t.height
		}, e.inverse());
		return n.x -= (this.padding.left || 0) / this.sx, n.y -= (this.padding.top || 0) / this.sy, n;
	}
	isCellVisible(e, t = {}) {
		let n = e.getBBox(), r = this.getVisibleArea();
		return t.strict ? r.containsRect(n) : r.isIntersectWithRect(n);
	}
	isPointVisible(e) {
		return this.getVisibleArea().containsPoint(e);
	}
	lock() {
		return U(this.container, { overflow: "hidden" }), this;
	}
	unlock() {
		return U(this.container, { overflow: "scroll" }), this;
	}
	onRemove() {
		this.stopListening();
	}
	dispose() {
		Vd(this.container, this.graph.container), this.remove();
	}
};
k([K()], pT.prototype, "dispose", null);
var mT = class extends kS {
	get elem() {
		return this.scroller.background;
	}
	constructor(e) {
		super(e.graph), this.scroller = e, e.options.background && this.draw(e.options.background);
	}
	init() {
		this.graph.on("scale", this.update, this), this.graph.on("translate", this.update, this);
	}
	updateBackgroundOptions(e) {
		this.scroller.options.background = e;
	}
}, hT = ".x6-graph-scroller {\n  position: relative;\n  box-sizing: border-box;\n  overflow: scroll;\n  outline: none;\n}\n.x6-graph-scroller-content {\n  position: relative;\n}\n.x6-graph-scroller-background {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n}\n.x6-graph-scroller .x6-graph {\n  position: absolute;\n  display: inline-block;\n  margin: 0;\n  box-shadow: none;\n}\n.x6-graph-scroller .x6-graph > svg {\n  display: block;\n}\n.x6-graph-scroller.x6-graph-scroller-paged .x6-graph {\n  box-shadow: 0 0 4px 0 #eee;\n}\n.x6-graph-scroller.x6-graph-scroller-pannable[data-panning='false'] {\n  cursor: grab;\n}\n.x6-graph-scroller.x6-graph-scroller-pannable[data-panning='true'] {\n  cursor: grabbing;\n  user-select: none;\n}\n.x6-graph-pagebreak {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n}\n.x6-graph-pagebreak-vertical {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  box-sizing: border-box;\n  width: 1px;\n  border-left: 1px dashed #bdbdbd;\n}\n.x6-graph-pagebreak-horizontal {\n  position: absolute;\n  right: 0;\n  left: 0;\n  box-sizing: border-box;\n  height: 1px;\n  border-top: 1px dashed #bdbdbd;\n}\n";
Q.prototype.lockScroller = function() {
	let e = this.getPlugin("scroller");
	return e && e.lockScroller(), this;
}, Q.prototype.unlockScroller = function() {
	let e = this.getPlugin("scroller");
	return e && e.unlockScroller(), this;
}, Q.prototype.updateScroller = function() {
	let e = this.getPlugin("scroller");
	return e && e.updateScroller(), this;
}, Q.prototype.getScrollbarPosition = function() {
	let e = this.getPlugin("scroller");
	return e ? e.getScrollbarPosition() : {
		left: 0,
		top: 0
	};
}, Q.prototype.setScrollbarPosition = function(e, t) {
	let n = this.getPlugin("scroller");
	return n && n.setScrollbarPosition(e, t), this;
};
// node_modules/@antv/x6/es/plugin/scroller/index.js
var gT = class extends xh {
	get pannable() {
		return this.options ? typeof this.options.pannable == "object" ? this.options.pannable.enabled : !!this.options.pannable : !1;
	}
	get container() {
		return this.scrollerImpl.container;
	}
	constructor(e = {}) {
		super(), this.name = "scroller", this.options = e, bu(this.name, hT);
	}
	init(e) {
		this.graph = e;
		let t = fT(Object.assign(Object.assign({ enabled: !0 }, this.options), { graph: e }));
		this.options = t, this.scrollerImpl = new pT(t), this.setup(), this.autoDisableGraphPanning(), this.startListening(), this.updateClassName(), this.scrollerImpl.center();
	}
	resize(e, t) {
		this.scrollerImpl.resize(e, t);
	}
	resizePage(e, t) {
		this.scrollerImpl.updatePageSize(e, t);
	}
	zoom(e, t) {
		return e === void 0 ? this.scrollerImpl.zoom() : (this.scrollerImpl.zoom(e, t), this);
	}
	zoomTo(e, t = {}) {
		return this.scrollerImpl.zoom(e, Object.assign(Object.assign({}, t), { absolute: !0 })), this;
	}
	zoomToRect(e, t = {}) {
		return this.scrollerImpl.zoomToRect(e, t), this;
	}
	zoomToFit(e = {}) {
		return this.scrollerImpl.zoomToFit(e), this;
	}
	center(e) {
		return this.centerPoint(e);
	}
	centerPoint(e, t, n) {
		return this.scrollerImpl.centerPoint(e, t, n), this;
	}
	centerContent(e) {
		return this.scrollerImpl.centerContent(e), this;
	}
	centerCell(e, t) {
		return this.scrollerImpl.centerCell(e, t), this;
	}
	positionPoint(e, t, n, r = {}) {
		return this.scrollerImpl.positionPoint(e, t, n, r), this;
	}
	positionRect(e, t, n) {
		return this.scrollerImpl.positionRect(e, t, n), this;
	}
	positionCell(e, t, n) {
		return this.scrollerImpl.positionCell(e, t, n), this;
	}
	positionContent(e, t) {
		return this.scrollerImpl.positionContent(e, t), this;
	}
	drawBackground(e, t) {
		return this.graph.options.background != null && t || this.scrollerImpl.backgroundManager.draw(e), this;
	}
	clearBackground(e) {
		return this.graph.options.background != null && e || this.scrollerImpl.backgroundManager.clear(), this;
	}
	isPannable() {
		return this.pannable;
	}
	enablePanning() {
		this.pannable || (this.options.pannable = !0, this.updateClassName());
	}
	disablePanning() {
		this.pannable && (this.options.pannable = !1, this.updateClassName());
	}
	togglePanning(e) {
		return e == null ? this.isPannable() ? this.disablePanning() : this.enablePanning() : e !== this.isPannable() && (e ? this.enablePanning() : this.disablePanning()), this;
	}
	lockScroller() {
		return this.scrollerImpl.lock(), this;
	}
	unlockScroller() {
		return this.scrollerImpl.unlock(), this;
	}
	updateScroller() {
		return this.scrollerImpl.update(), this;
	}
	getScrollbarPosition() {
		return this.scrollerImpl.scrollbarPosition();
	}
	setScrollbarPosition(e, t) {
		return this.scrollerImpl.scrollbarPosition(e, t), this;
	}
	scrollToPoint(e, t) {
		return this.scrollerImpl.scrollToPoint(e, t), this;
	}
	scrollToContent() {
		return this.scrollerImpl.scrollToContent(), this;
	}
	scrollToCell(e) {
		return this.scrollerImpl.scrollToCell(e), this;
	}
	transitionToPoint(e, t, n) {
		return this.scrollerImpl.transitionToPoint(e, t, n), this;
	}
	transitionToRect(e, t = {}) {
		return this.scrollerImpl.transitionToRect(e, t), this;
	}
	enableAutoResize() {
		this.scrollerImpl.enableAutoResize();
	}
	disableAutoResize() {
		this.scrollerImpl.disableAutoResize();
	}
	autoScroll(e, t) {
		return this.scrollerImpl.autoScroll(e, t);
	}
	clientToLocalPoint(e, t) {
		return this.scrollerImpl.clientToLocalPoint(e, t);
	}
	getVisibleArea() {
		return this.scrollerImpl.getVisibleArea();
	}
	isCellVisible(e, t = {}) {
		return this.scrollerImpl.isCellVisible(e, t);
	}
	isPointVisible(e) {
		return this.scrollerImpl.isPointVisible(e);
	}
	setup() {
		this.scrollerImpl.on("*", (e, t) => {
			this.trigger(e, t);
		});
	}
	startListening() {
		let e = [], t = this.options.pannable;
		e = typeof t == "object" ? t.eventTypes || [] : ["leftMouseDown"], e.includes("leftMouseDown") && (this.graph.on("blank:mousedown", this.preparePanning, this), this.graph.on("node:unhandled:mousedown", this.preparePanning, this), this.graph.on("edge:unhandled:mousedown", this.preparePanning, this)), e.includes("rightMouseDown") && (this.onRightMouseDown = this.onRightMouseDown.bind(this), G.on(this.scrollerImpl.container, "mousedown", this.onRightMouseDown));
	}
	stopListening() {
		let e = [], t = this.options.pannable;
		e = typeof t == "object" ? t.eventTypes || [] : ["leftMouseDown"], e.includes("leftMouseDown") && (this.graph.off("blank:mousedown", this.preparePanning, this), this.graph.off("node:unhandled:mousedown", this.preparePanning, this), this.graph.off("edge:unhandled:mousedown", this.preparePanning, this)), e.includes("rightMouseDown") && G.off(this.scrollerImpl.container, "mousedown", this.onRightMouseDown);
	}
	onRightMouseDown(e) {
		e.button === 2 && this.allowPanning(e, !0) && (this.updateClassName(!0), this.scrollerImpl.startPanning(e), this.scrollerImpl.once("pan:stop", () => this.updateClassName(!1)));
	}
	preparePanning({ e }) {
		let t = this.allowPanning(e, !0), n = this.graph.getPlugin("selection"), r = n && n.allowRubberband(e, !0);
		(t || this.allowPanning(e) && !r) && (this.updateClassName(!0), this.scrollerImpl.startPanning(e), this.scrollerImpl.once("pan:stop", () => this.updateClassName(!1)));
	}
	allowPanning(e, t) {
		return this.pannable && Th(e, this.options.modifiers, t);
	}
	updateClassName(e) {
		let t = this.scrollerImpl.container, n = J.prefix("graph-scroller-pannable");
		this.pannable ? (B(t, n), t.dataset.panning = (!!e).toString()) : V(t, n);
	}
	autoDisableGraphPanning() {
		let e = this.graph?.panning;
		e?.pannable && (e.disablePanning(), console.warn("Detected Scroller plugin; Graph panning has been disabled by default to avoid conflicts."));
	}
	dispose() {
		this.scrollerImpl.dispose(), this.stopListening(), this.off(), xu(this.name);
	}
};
k([K()], gT.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/stencil/grid.js
function _T(e, t) {
	return e.reduce((e, n) => Math.max(n?.getSize()[t], e), 0);
}
function vT(e, t, n) {
	let r = [];
	for (let i = n * t, a = i + n; i < a; i += 1) e[i] && r.push(e[i]);
	return r;
}
function yT(e, t, n) {
	let r = [];
	for (let i = t, a = e.length; i < a; i += n) e[i] && r.push(e[i]);
	return r;
}
function bT(e, t) {
	return e.reduce((e, t, n) => (e.push(e[n] + t), e), [t || 0]);
}
function xT(e, t = {}) {
	let n = sS.isModel(e) ? e : new sS().resetCells(e, {
		sort: !1,
		dryrun: !0
	}), r = n.getNodes(), i = t.columns || 1, a = Math.ceil(r.length / i), o = t.dx || 0, s = t.dy || 0, c = t.center !== !1, l = t.resizeToFit === !0, u = t.marginX || 0, d = t.marginY || 0, f = [], p = t.columnWidth;
	if (p === "compact") for (let e = 0; e < i; e += 1) {
		let t = yT(r, e, i);
		f.push(_T(t, "width") + o);
	}
	else {
		(p == null || p === "auto") && (p = _T(r, "width") + o);
		for (let e = 0; e < i; e += 1) f.push(p);
	}
	let m = bT(f, u), h = [], g = t.rowHeight;
	if (g === "compact") for (let e = 0; e < a; e += 1) {
		let t = vT(r, e, i);
		h.push(_T(t, "height") + s);
	}
	else {
		(g == null || g === "auto") && (g = _T(r, "height") + s);
		for (let e = 0; e < a; e += 1) h.push(g);
	}
	let _ = bT(h, d);
	n.startBatch("layout"), r.forEach((e, n) => {
		let r = n % i, a = Math.floor(n / i), u = f[r], d = h[a], p = 0, g = 0, v = e.getSize();
		if (l) {
			let n = u - 2 * o, r = d - 2 * s, i = v.height * (v.width ? n / v.width : 1), a = v.width * (v.height ? r / v.height : 1);
			d < i ? n = a : r = i, v = {
				width: n,
				height: r
			}, e.setSize(v, t);
		}
		c && (p = (u - v.width) / 2, g = (d - v.height) / 2), e.position(m[r] + o + p, _[a] + s + g, t);
	}), n.stopBatch("layout");
}
// node_modules/@antv/x6/es/plugin/stencil/style/raw.js
var ST = ".x6-widget-dnd {\n  position: absolute;\n  top: -10000px;\n  left: -10000px;\n  z-index: 999999;\n  display: none;\n  cursor: move;\n  opacity: 0.7;\n  pointer-events: 'cursor';\n}\n.x6-widget-dnd.dragging {\n  display: inline-block;\n}\n.x6-widget-dnd.dragging * {\n  pointer-events: none !important;\n}\n.x6-widget-dnd .x6-graph {\n  background: transparent;\n  box-shadow: none;\n}\n.x6-widget-stencil {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n}\n.x6-widget-stencil::after {\n  position: absolute;\n  top: 0;\n  display: block;\n  width: 100%;\n  height: 20px;\n  padding: 8px 0;\n  line-height: 20px;\n  text-align: center;\n  opacity: 0;\n  transition: top 0.1s linear, opacity 0.1s linear;\n  content: ' ';\n  pointer-events: none;\n}\n.x6-widget-stencil-content {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  height: auto;\n  overflow-x: hidden;\n  overflow-y: auto;\n}\n.x6-widget-stencil .x6-node [magnet]:not([magnet='passive']) {\n  pointer-events: none;\n}\n.x6-widget-stencil-group {\n  padding: 0;\n  padding-bottom: 8px;\n  overflow: hidden;\n  user-select: none;\n}\n.x6-widget-stencil-group.collapsed {\n  height: auto;\n  padding-bottom: 0;\n}\n.x6-widget-stencil-group-title {\n  position: relative;\n  margin-top: 0;\n  margin-bottom: 0;\n  padding: 4px;\n  cursor: pointer;\n}\n.x6-widget-stencil-title,\n.x6-widget-stencil-group > .x6-widget-stencil-group-title {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  user-select: none;\n}\n.x6-widget-stencil .unmatched {\n  opacity: 0.3;\n}\n.x6-widget-stencil .x6-node.unmatched {\n  display: none;\n}\n.x6-widget-stencil-group.unmatched {\n  display: none;\n}\n.x6-widget-stencil-search-text {\n  position: relative;\n  z-index: 1;\n  box-sizing: border-box;\n  width: 100%;\n  height: 30px;\n  max-height: 30px;\n  line-height: 30px;\n  outline: 0;\n}\n.x6-widget-stencil.not-found::after {\n  opacity: 1;\n  content: attr(data-not-found-text);\n}\n.x6-widget-stencil.not-found.searchable::after {\n  top: 30px;\n}\n.x6-widget-stencil.not-found.searchable.collapsable::after {\n  top: 50px;\n}\n.x6-widget-stencil {\n  color: #333;\n  background: #f5f5f5;\n}\n.x6-widget-stencil-content {\n  position: absolute;\n  top: 32px;\n}\n.x6-widget-stencil.searchable > .x6-widget-stencil-content {\n  top: 80px;\n}\n.x6-widget-stencil.not-found::after {\n  position: absolute;\n}\n.x6-widget-stencil.not-found.searchable.collapsable::after {\n  top: 80px;\n}\n.x6-widget-stencil.not-found.searchable::after {\n  top: 60px;\n}\n.x6-widget-stencil-group {\n  height: auto;\n  margin-bottom: 1px;\n  padding: 0;\n  transition: none;\n}\n  .x6-widget-stencil-group .x6-graph {\n    background: transparent;\n    box-shadow: none;\n  }\n\n  .x6-widget-stencil .x6-node.x6-node-immovable {\n    cursor: move;\n  }\n.x6-widget-stencil-group.collapsed {\n  height: auto;\n  max-height: 32px;\n}\n.x6-widget-stencil-title,\n.x6-widget-stencil-group > .x6-widget-stencil-group-title {\n  position: relative;\n  left: 0;\n  box-sizing: border-box;\n  width: 100%;\n  height: 32px;\n  padding: 0 5px 0 8px;\n  color: #666;\n  font-weight: 700;\n  font-size: 12px;\n  line-height: 32px;\n  cursor: default;\n  transition: all 0.3;\n}\n.x6-widget-stencil-title:hover,\n.x6-widget-stencil-group > .x6-widget-stencil-group-title:hover {\n  color: #444;\n}\n.x6-widget-stencil-title {\n  background: #e9e9e9;\n}\n.x6-widget-stencil-group > .x6-widget-stencil-group-title {\n  background: #ededed;\n}\n.x6-widget-stencil.collapsable > .x6-widget-stencil-title,\n.x6-widget-stencil-group.collapsable > .x6-widget-stencil-group-title {\n  padding-left: 32px;\n  cursor: pointer;\n}\n.x6-widget-stencil.collapsable > .x6-widget-stencil-title::before,\n.x6-widget-stencil-group.collapsable > .x6-widget-stencil-group-title::before {\n  position: absolute;\n  top: 6px;\n  left: 8px;\n  display: block;\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  padding: 0;\n  background-color: transparent;\n  background-repeat: no-repeat;\n  background-position: 0 0;\n  border: none;\n  content: ' ';\n}\n.x6-widget-stencil.collapsable > .x6-widget-stencil-title::before,\n.x6-widget-stencil-group.collapsable > .x6-widget-stencil-group-title::before {\n  background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJub256ZXJvIj48cGF0aCBkPSJNOS4zNzUuNUM0LjY4Ny41Ljg3NSA0LjMxMy44NzUgOWMwIDQuNjg4IDMuODEyIDguNSA4LjUgOC41IDQuNjg3IDAgOC41LTMuODEyIDguNS04LjUgMC00LjY4Ny0zLjgxMy04LjUtOC41LTguNXptMCAxNS44ODZDNS4zMDMgMTYuMzg2IDEuOTkgMTMuMDcyIDEuOTkgOXMzLjMxMi03LjM4NSA3LjM4NS03LjM4NVMxNi43NiA0LjkyOCAxNi43NiA5YzAgNC4wNzItMy4zMTMgNy4zODYtNy4zODUgNy4zODZ6Ii8+PHBhdGggZD0iTTEyLjc1MyA4LjQ0M0g1Ljk5N2EuNTU4LjU1OCAwIDAwMCAxLjExNmg2Ljc1NmEuNTU4LjU1OCAwIDAwMC0xLjExNnoiLz48L2c+PC9zdmc+');\n  opacity: 0.4;\n  transition: all 0.3s;\n}\n.x6-widget-stencil.collapsable > .x6-widget-stencil-title:hover::before,\n.x6-widget-stencil-group.collapsable > .x6-widget-stencil-group-title:hover::before {\n  opacity: 0.6;\n}\n.x6-widget-stencil.collapsable.collapsed > .x6-widget-stencil-title::before,\n.x6-widget-stencil-group.collapsable.collapsed > .x6-widget-stencil-group-title::before {\n  background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJub256ZXJvIj48cGF0aCBkPSJNOS4zNzUuNUM0LjY4Ny41Ljg3NSA0LjMxMy44NzUgOWMwIDQuNjg4IDMuODEyIDguNSA4LjUgOC41IDQuNjg3IDAgOC41LTMuODEyIDguNS04LjUgMC00LjY4Ny0zLjgxMy04LjUtOC41LTguNXptMCAxNS44ODZDNS4zMDMgMTYuMzg2IDEuOTkgMTMuMDcyIDEuOTkgOXMzLjMxMi03LjM4NSA3LjM4NS03LjM4NVMxNi43NiA0LjkyOCAxNi43NiA5YzAgNC4wNzItMy4zMTMgNy4zODYtNy4zODUgNy4zODZ6Ii8+PHBhdGggZD0iTTEyLjc1MyA4LjQ0M0g1Ljk5N2EuNTU4LjU1OCAwIDAwMCAxLjExNmg2Ljc1NmEuNTU4LjU1OCAwIDAwMC0xLjExNnoiLz48cGF0aCBkPSJNOC44MTcgNS42MjN2Ni43NTZhLjU1OC41NTggMCAwMDEuMTE2IDBWNS42MjNhLjU1OC41NTggMCAxMC0xLjExNiAweiIvPjwvZz48L3N2Zz4=');\n  opacity: 0.4;\n}\n.x6-widget-stencil.collapsable.collapsed > .x6-widget-stencil-title:hover::before,\n.x6-widget-stencil-group.collapsable.collapsed > .x6-widget-stencil-group-title:hover::before {\n  opacity: 0.6;\n}\n.x6-widget-stencil input[type='search'] {\n  appearance: textfield;\n}\n.x6-widget-stencil input[type='search']::-webkit-search-cancel-button,\n.x6-widget-stencil input[type='search']::-webkit-search-decoration {\n  appearance: none;\n}\n.x6-widget-stencil-search-text {\n  display: block;\n  width: 90%;\n  margin: 8px 5%;\n  padding-left: 8px;\n  color: #333;\n  background: #fff;\n  border: 1px solid #e9e9e9;\n  border-radius: 12px;\n  outline: 0;\n}\n.x6-widget-stencil-search-text:focus {\n  outline: 0;\n}\n.x6-widget-stencil::after {\n  color: #808080;\n  font-weight: 600;\n  font-size: 12px;\n  background: 0 0;\n}\n", CT = {
	base: "widget-stencil",
	title: "widget-stencil-title",
	search: "widget-stencil-search",
	searchText: "widget-stencil-search-text",
	content: "widget-stencil-content",
	group: "widget-stencil-group",
	groupTitle: "widget-stencil-group-title",
	groupContent: "widget-stencil-group-content"
}, wT = "__default__", TT = Object.assign({
	stencilGraphWidth: 200,
	stencilGraphHeight: 800,
	title: "Stencil",
	collapsable: !1,
	placeholder: "Search",
	notFoundText: "No matches found",
	layout(e, t) {
		let n = {
			columnWidth: this.options.stencilGraphWidth / 2 - 10,
			columns: 2,
			rowHeight: 80,
			resizeToFit: !1,
			dx: 10,
			dy: 10
		};
		xT(e, Object.assign(Object.assign(Object.assign({}, n), this.options.layoutOptions), t ? t.layoutOptions : {}));
	}
}, Dw), ET = class extends Yb {
	get targetScroller() {
		return this.options.target.getPlugin("scroller");
	}
	get targetGraph() {
		return this.options.target;
	}
	get targetModel() {
		return this.targetGraph.model;
	}
	constructor(e = {}) {
		super(), this.name = "stencil", bu(this.name, ST), this.graphs = {}, this.groups = {}, this.options = Object.assign(Object.assign({}, TT), e), this.init();
	}
	init() {
		this.dnd = new Ow(this.options), this.onSearch = Qc(this.onSearch, 200), this.initContainer(), this.initSearch(), this.initContent(), this.initGroups(), this.setTitle(), this.startListening();
	}
	load(e, t) {
		return Array.isArray(e) ? this.loadGroup(e, t) : this.options.groups && Object.keys(this.options.groups).forEach((t) => {
			e[t] && this.loadGroup(e[t], t);
		}), this;
	}
	unload(e, t) {
		return Array.isArray(e) ? this.loadGroup(e, t, !0) : this.options.groups && Object.keys(this.options.groups).forEach((t) => {
			e[t] && this.loadGroup(e[t], t, !0);
		}), this;
	}
	toggleGroup(e) {
		return this.isGroupCollapsed(e) ? this.expandGroup(e) : this.collapseGroup(e), this;
	}
	collapseGroup(e) {
		if (this.isGroupCollapsable(e)) {
			let t = this.groups[e];
			t && !this.isGroupCollapsed(e) && (this.trigger("group:collapse", { name: e }), B(t, "collapsed"));
		}
		return this;
	}
	expandGroup(e) {
		if (this.isGroupCollapsable(e)) {
			let t = this.groups[e];
			t && this.isGroupCollapsed(e) && (this.trigger("group:expand", { name: e }), V(t, "collapsed"));
		}
		return this;
	}
	isGroupCollapsable(e) {
		let t = this.groups[e];
		return yd(t, "collapsable");
	}
	isGroupCollapsed(e) {
		let t = this.groups[e];
		return t && yd(t, "collapsed");
	}
	collapseGroups() {
		return Object.keys(this.groups).forEach((e) => {
			this.collapseGroup(e);
		}), this;
	}
	expandGroups() {
		return Object.keys(this.groups).forEach((e) => {
			this.expandGroup(e);
		}), this;
	}
	resizeGroup(e, t) {
		let n = this.graphs[e];
		return n && n.resize(t.width, t.height), this;
	}
	addGroup(e) {
		let t = Array.isArray(e) ? e : [e];
		this.options.groups ? this.options.groups.push(...t) : this.options.groups = t, t.forEach((e) => {
			this.initGroup(e);
		});
	}
	removeGroup(e) {
		let t = Array.isArray(e) ? e : [e];
		this.options.groups && (this.options.groups = this.options.groups.filter((e) => !t.includes(e.name)), t.forEach((e) => {
			let t = this.graphs[e];
			this.unregisterGraphEvents(t), t.dispose(), delete this.graphs[e];
			let n = this.groups[e];
			Ld(n), delete this.groups[e];
		}));
	}
	initContainer() {
		this.container = document.createElement("div"), B(this.container, this.prefixClassName(CT.base)), H(this.container, "data-not-found-text", this.options.notFoundText || "No matches found");
	}
	initContent() {
		this.content = document.createElement("div"), B(this.content, this.prefixClassName(CT.content)), Ud(this.content, this.container);
	}
	buildGraphConfig(e) {
		let t = this.options.stencilGraphOptions || {}, n = e?.graphOptions, r = Object.assign(Object.assign({}, t), n);
		return r.panning ?? (r.panning = !1), {
			mergedGraphOptions: r,
			width: e && e.graphWidth || this.options.stencilGraphWidth,
			height: e && e.graphHeight || this.options.stencilGraphHeight,
			model: r.model || new sS()
		};
	}
	createStencilGraph(e, t, n, r) {
		let i = new Q(Object.assign(Object.assign({}, e), {
			container: document.createElement("div"),
			model: r,
			width: t,
			height: n,
			interacting: !1,
			preventDefaultBlankAction: !1
		}));
		return this.registerGraphEvents(i), i;
	}
	initSearch() {
		this.options.search && (B(this.container, "searchable"), zd(this.container, this.renderSearch()));
	}
	initGroup(e) {
		let t = document.createElement("div");
		B(t, this.prefixClassName(CT.group)), H(t, "data-name", e.name), (e.collapsable == null && this.options.collapsable || e.collapsable !== !1) && B(t, "collapsable"), bd(t, "collapsed", e.collapsed === !0);
		let n = document.createElement("h3");
		B(n, this.prefixClassName(CT.groupTitle)), n.innerHTML = e.title || e.name;
		let r = document.createElement("div");
		B(r, this.prefixClassName(CT.groupContent));
		let { mergedGraphOptions: i, width: a, height: o, model: s } = this.buildGraphConfig(e), c = this.createStencilGraph(i, a, o, s);
		zd(r, c.container), zd(t, [n, r]), Ud(t, this.content), this.groups[e.name] = t, this.graphs[e.name] = c;
	}
	initGroups() {
		if (this.clearGroups(), this.setCollapsableState(), this.options.groups && this.options.groups.length) this.options.groups.forEach((e) => {
			this.initGroup(e);
		});
		else {
			let { mergedGraphOptions: e, width: t, height: n, model: r } = this.buildGraphConfig(), i = this.createStencilGraph(e, t, n, r);
			zd(this.content, i.container), this.graphs[wT] = i;
		}
	}
	setCollapsableState() {
		this.options.collapsable = this.options.collapsable && this.options.groups && this.options.groups.some((e) => e.collapsable !== !1), this.options.collapsable ? (B(this.container, "collapsable"), this.options.groups && this.options.groups.every((e) => e.collapsed || e.collapsable === !1) ? B(this.container, "collapsed") : V(this.container, "collapsed")) : V(this.container, "collapsable");
	}
	setTitle() {
		let e = document.createElement("div");
		B(e, this.prefixClassName(CT.title)), e.innerHTML = this.options.title, Ud(e, this.container);
	}
	renderSearch() {
		let e = document.createElement("div");
		B(e, this.prefixClassName(CT.search));
		let t = document.createElement("input");
		return H(t, {
			type: "search",
			placeholder: this.options.placeholder || "Search"
		}), B(t, this.prefixClassName(CT.searchText)), zd(e, t), e;
	}
	startListening() {
		let e = this.prefixClassName(CT.title), t = this.prefixClassName(CT.searchText), n = this.prefixClassName(CT.groupTitle);
		this.delegateEvents({
			[`click .${e}`]: "onTitleClick",
			[`touchstart .${e}`]: "onTitleClick",
			[`click .${n}`]: "onGroupTitleClick",
			[`touchstart .${n}`]: "onGroupTitleClick",
			[`input .${t}`]: "onSearch",
			[`focusin .${t}`]: "onSearchFocusIn",
			[`focusout .${t}`]: "onSearchFocusOut"
		});
	}
	stopListening() {
		this.undelegateEvents();
	}
	registerGraphEvents(e) {
		e.on("cell:mousedown", this.onDragStart, this);
	}
	unregisterGraphEvents(e) {
		e.off("cell:mousedown", this.onDragStart, this);
	}
	getGraphHeight(e) {
		let t = this.getGroup(e);
		return t && t.graphHeight != null ? t.graphHeight : this.options.stencilGraphHeight;
	}
	loadGroup(e, t, n) {
		let r = this.getModel(t);
		if (r) {
			let t = e.map((e) => eS.isNode(e) ? e : eS.create(e));
			n === !0 ? r.removeCells(t) : r.resetCells(t);
		}
		let i = this.getGroup(t), a = this.getGraphHeight(t), o = i && i.layout || this.options.layout;
		if (o && r && F(o, this, r, i), !a) {
			let e = this.getGraph(t);
			e.fitToContent({
				minWidth: e.options.width,
				gridHeight: 1,
				padding: i && i.graphPadding || this.options.stencilGraphPadding || 10
			});
		}
		return this;
	}
	onDragStart(e) {
		let { e: t, node: n } = e, r = this.getGroupByNode(n);
		if (r && r.nodeMovable === !1) return;
		let i = this.getGraph(r ? r.name : void 0), a = i && typeof i.isPannable == "function" ? i.isPannable() : !1;
		a && i.disablePanning();
		let o = () => {
			a && i.enablePanning(), this.undelegateDocumentEvents();
		};
		this.delegateDocumentEvents({
			mouseup: o,
			touchend: o,
			touchcancel: o
		}), this.dnd.start(n, t);
	}
	filter(e, t) {
		let n = Object.keys(this.graphs).reduce((n, r) => {
			let i = this.graphs[r], a = r === "__default__" ? null : r, o = i.model.getNodes().filter((n) => {
				let r = !1;
				r = typeof t == "function" ? F(t, this, n, e, a, this) : typeof t == "boolean" ? t : this.isCellMatched(n, e, t, e.toLowerCase() !== e);
				let o = i.renderer.findViewByCell(n);
				return o && bd(o.container, "unmatched", !r), r;
			}), s = o.length > 0, c = this.options, l = new sS();
			return l.resetCells(o), c.layout && F(c.layout, this, l, this.getGroup(r)), this.groups[r] && bd(this.groups[r], "unmatched", !s), this.getGraphHeight(r) || i.fitToContent({
				gridWidth: 1,
				gridHeight: 1,
				padding: c.stencilGraphPadding || 10,
				contentArea: l.getAllCellsBBox() || {
					x: 0,
					y: 0,
					width: 0,
					height: 0
				}
			}), n || s;
		}, !1);
		bd(this.container, "not-found", !n);
	}
	isCellMatched(e, t, n, r) {
		return t && n ? Object.keys(n).some((i) => {
			if (i === "*" || e.shape === i) {
				let a = n[i];
				return typeof a == "boolean" ? a : (Array.isArray(a) ? a : [a]).some((n) => {
					let i = e.getPropByPath(n);
					return i != null && (i = `${i}`, r || (i = i.toLowerCase()), i.indexOf(t) >= 0);
				});
			}
			return !1;
		}) : !0;
	}
	onSearch(e) {
		this.filter(e.target.value, this.options.search);
	}
	onSearchFocusIn() {
		B(this.container, "is-focused");
	}
	onSearchFocusOut() {
		V(this.container, "is-focused");
	}
	onTitleClick() {
		this.options.collapsable && (bd(this.container, "collapsed"), yd(this.container, "collapsed") ? this.collapseGroups() : this.expandGroups());
	}
	onGroupTitleClick(e) {
		let t = e.target.closest(`.${this.prefixClassName(CT.group)}`);
		t && this.toggleGroup(H(t, "data-name") || "");
		let n = Object.keys(this.groups).every((e) => {
			let t = this.getGroup(e), n = this.groups[e];
			return t && t.collapsable === !1 || yd(n, "collapsed");
		});
		bd(this.container, "collapsed", n);
	}
	getModel(e) {
		let t = this.getGraph(e);
		return t ? t.model : null;
	}
	getGraph(e) {
		return this.graphs[e || "__default__"];
	}
	getGroup(e) {
		let t = this.options.groups;
		return e != null && t && t.length ? t.find((t) => t.name === e) : null;
	}
	getGroupByNode(e) {
		let t = this.options.groups;
		return t ? t.find((t) => {
			let n = this.getModel(t.name);
			return n ? n.has(e.id) : !1;
		}) : null;
	}
	clearGroups() {
		Object.keys(this.graphs).forEach((e) => {
			let t = this.graphs[e];
			this.unregisterGraphEvents(t), t.dispose();
		}), Object.keys(this.groups).forEach((e) => {
			let t = this.groups[e];
			Ld(t);
		}), this.graphs = {}, this.groups = {};
	}
	onRemove() {
		this.clearGroups(), this.dnd.remove(), this.stopListening(), this.undelegateDocumentEvents();
	}
	dispose() {
		this.remove(), xu(this.name);
	}
};
k([K()], ET.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/snapline/snapline.js
var DT = class extends Yb {
	get model() {
		return this.graph.model;
	}
	get containerClassName() {
		return this.prefixClassName("widget-snapline");
	}
	get verticalClassName() {
		return `${this.containerClassName}-vertical`;
	}
	get horizontalClassName() {
		return `${this.containerClassName}-horizontal`;
	}
	constructor(e) {
		super();
		let { graph: t } = e, n = O(e, ["graph"]);
		this.graph = t, this.options = Object.assign({}, n), this.offset = {
			x: 0,
			y: 0
		}, this.render(), this.disabled || this.startListening();
	}
	get disabled() {
		return this.options.enabled !== !0;
	}
	enable() {
		this.disabled && (this.options.enabled = !0, this.startListening());
	}
	disable() {
		this.disabled || (this.options.enabled = !1, this.stopListening());
	}
	setFilter(e) {
		this.options.filter = e;
	}
	render() {
		let e = this.containerWrapper = new W("svg"), t = this.horizontal = new W("line"), n = this.vertical = new W("line");
		e.addClass(this.containerClassName), t.addClass(this.horizontalClassName), n.addClass(this.verticalClassName), e.setAttribute("width", "100%"), e.setAttribute("height", "100%"), t.setAttribute("display", "none"), n.setAttribute("display", "none"), e.append([t, n]), this.options.className && e.addClass(this.options.className), this.container = this.containerWrapper.node;
	}
	startListening() {
		this.stopListening(), this.graph.on("node:mousedown", this.captureCursorOffset, this), this.graph.on("node:mousemove", this.snapOnMoving, this), this.model.on("batch:stop", this.onBatchStop, this), this.delegateDocumentEvents({
			mouseup: "hide",
			touchend: "hide"
		});
	}
	stopListening() {
		this.graph.off("node:mousedown", this.captureCursorOffset, this), this.graph.off("node:mousemove", this.snapOnMoving, this), this.model.off("batch:stop", this.onBatchStop, this), this.undelegateDocumentEvents();
	}
	onBatchStop({ name: e, data: t }) {
		e === "resize" && this.snapOnResizing(t.cell, t);
	}
	captureCursorOffset({ view: e, x: t, y: n }) {
		let r = e.getDelegatedView();
		if (r && this.isNodeMovable(r)) {
			let r = e.cell.getPosition();
			this.offset = {
				x: t - r.x,
				y: n - r.y
			};
		}
	}
	isNodeMovable(e) {
		return e && e.cell.isNode() && e.can("nodeMovable");
	}
	getRestrictArea(e) {
		let t = this.graph.options.translating.restrict, n = typeof t == "function" ? F(t, this.graph, e) : t;
		return typeof n == "number" ? this.graph.transform.getGraphArea().inflate(n) : n === !0 ? this.graph.transform.getGraphArea() : n || null;
	}
	snapOnResizing(e, t) {
		if (this.options.resizing && !t.snapped && t.ui && t.direction && t.trueDirection) {
			let n = this.graph.renderer.findViewByCell(e);
			if (n && n.cell.isNode()) {
				let r = e.getBBox(), i = r.bbox(e.getAngle()), a = i.getTopLeft(), o = i.getBottomRight(), s = Lu(e.getAngle()), c = this.options.tolerance || 0, l, u, d, f, p, m, h = {
					vertical: 0,
					horizontal: 0
				}, g = t.direction, _ = t.trueDirection, v = t.relativeDirection;
				h.vertical = _.indexOf("right") === -1 ? a.x : o.x, h.horizontal = _.indexOf("bottom") === -1 ? a.y : o.y, this.model.getNodes().some((t) => {
					if (this.isIgnored(e, t)) return !1;
					let n = t.getBBox().bbox(t.getAngle()), r = n.getTopLeft(), a = n.getBottomRight(), s = {
						vertical: [r.x, a.x],
						horizontal: [r.y, a.y]
					}, g = {};
					return Object.keys(s).forEach((e) => {
						let t = e, n = s[t].map((e) => ({
							position: e,
							distance: Math.abs(e - h[t])
						})).filter((e) => e.distance <= c);
						g[t] = Bl(n, (e) => e.distance);
					}), l == null && g.vertical.length > 0 && (l = g.vertical[0].position, u = Math.min(i.y, n.y), d = Math.max(o.y, a.y) - u), f == null && g.horizontal.length > 0 && (f = g.horizontal[0].position, p = Math.min(i.x, n.x), m = Math.max(o.x, a.x) - p), l != null && f != null;
				}), this.hide();
				let y = 0, b = 0;
				(f != null || l != null) && (l != null && (y = _.indexOf("right") === -1 ? a.x - l : l - o.x), f != null && (b = _.indexOf("bottom") === -1 ? a.y - f : f - o.y));
				let x = 0, S = 0;
				if (s % 90 == 0) s === 90 || s === 270 ? (x = b, S = y) : (x = y, S = b);
				else {
					let e = s >= 0 && s < 90 ? 1 : s >= 90 && s < 180 ? 4 : s >= 180 && s < 270 ? 3 : 2;
					f != null && l != null && (y < b ? (b = 0, f = void 0) : (y = 0, l = void 0));
					let t = Iu(s % 90);
					y && (x = e === 3 ? y / Math.cos(t) : y / Math.sin(t)), b && (S = e === 3 ? b / Math.cos(t) : b / Math.sin(t));
					let n = e === 1 || e === 3;
					switch (v) {
						case "top":
						case "bottom":
							S = b ? b / (n ? Math.cos(t) : Math.sin(t)) : y / (n ? Math.sin(t) : Math.cos(t));
							break;
						case "left":
						case "right": x = y ? y / (n ? Math.cos(t) : Math.sin(t)) : b / (n ? Math.sin(t) : Math.cos(t));
					}
				}
				switch (v) {
					case "top":
					case "bottom":
						x = 0;
						break;
					case "left":
					case "right": S = 0;
				}
				let C = this.graph.getGridSize(), w = Math.max(r.width + x, C), T = Math.max(r.height + S, C);
				t.minWidth && t.minWidth > C && (w = Math.max(w, t.minWidth)), t.minHeight && t.minHeight > C && (T = Math.max(T, t.minHeight)), t.maxWidth && (w = Math.min(w, t.maxWidth)), t.maxHeight && (T = Math.min(T, t.maxHeight)), t.preserveAspectRatio && (S < x ? T = w * (r.height / r.width) : w = T * (r.width / r.height)), (w !== r.width || T !== r.height) && (e.resize(w, T, {
					direction: g,
					relativeDirection: v,
					trueDirection: _,
					snapped: !0,
					snaplines: this.cid,
					restrict: this.getRestrictArea(n)
				}), d && (d += T - r.height), m && (m += w - r.width));
				let E = e.getBBox().bbox(s);
				l && Math.abs(E.x - l) > 1 && Math.abs(E.width + E.x - l) > 1 && (l = void 0), f && Math.abs(E.y - f) > 1 && Math.abs(E.height + E.y - f) > 1 && (f = void 0), this.update({
					verticalLeft: l,
					verticalTop: u,
					verticalHeight: d,
					horizontalTop: f,
					horizontalLeft: p,
					horizontalWidth: m
				});
			}
		}
	}
	snapOnMoving({ view: e, e: t, x: n, y: r }) {
		let i = e.getEventData(t).delegatedView || e;
		if (!this.isNodeMovable(i)) return;
		let a = i.cell, o = a.getSize(), s = a.getPosition(), c = new L(n - this.offset.x, r - this.offset.y, o.width, o.height), l = a.getAngle(), u = c.getCenter(), d = c.bbox(l), f = d.getTopLeft(), p = d.getBottomRight(), m = this.options.tolerance || 0, h, g, _, v, y, b, x = 0, S = 0;
		if (this.model.getNodes().some((e) => {
			if (this.isIgnored(a, e)) return !1;
			let t = e.getBBox().bbox(e.getAngle()), n = t.getCenter(), r = t.getTopLeft(), i = t.getBottomRight();
			return h ?? (Math.abs(n.x - u.x) < m ? (h = n.x, x = .5) : Math.abs(r.x - f.x) < m ? (h = r.x, x = 0) : Math.abs(r.x - p.x) < m ? (h = r.x, x = 1) : Math.abs(i.x - p.x) < m ? (h = i.x, x = 1) : Math.abs(i.x - f.x) < m && (h = i.x), h != null && (g = Math.min(d.y, t.y), _ = Math.max(p.y, i.y) - g)), v ?? (Math.abs(n.y - u.y) < m ? (v = n.y, S = .5) : Math.abs(r.y - f.y) < m ? v = r.y : Math.abs(r.y - p.y) < m ? (v = r.y, S = 1) : Math.abs(i.y - p.y) < m ? (v = i.y, S = 1) : Math.abs(i.y - f.y) < m && (v = i.y), v != null && (y = Math.min(d.x, t.x), b = Math.max(p.x, i.x) - y)), h != null && v != null;
		}), this.hide(), v != null || h != null) {
			v != null && (d.y = v - S * d.height), h != null && (d.x = h - x * d.width);
			let e = d.getCenter(), t = e.x - c.width / 2, n = e.y - c.height / 2, r = t - s.x, o = n - s.y;
			(r !== 0 || o !== 0) && (a.translate(r, o, {
				snapped: !0,
				restrict: this.getRestrictArea(i)
			}), b && (b += r), _ && (_ += o)), this.update({
				verticalLeft: h,
				verticalTop: g,
				verticalHeight: _,
				horizontalTop: v,
				horizontalLeft: y,
				horizontalWidth: b
			});
		}
	}
	isIgnored(e, t) {
		return t.id === e.id || t.isDescendantOf(e) || !this.filter(t);
	}
	filter(e) {
		let t = this.options.filter;
		return Array.isArray(t) ? t.some((t) => typeof t == "string" ? e.shape === t : e.id === t.id) : typeof t != "function" || F(t, this.graph, e);
	}
	update(e) {
		if (e.horizontalTop) {
			let t = this.graph.localToGraph(new I(e.horizontalLeft, e.horizontalTop)), n = this.graph.localToGraph(new I(e.horizontalLeft + e.horizontalWidth, e.horizontalTop));
			this.horizontal.setAttributes({
				x1: this.options.sharp ? `${t.x}` : "0",
				y1: `${t.y}`,
				x2: this.options.sharp ? `${n.x}` : "100%",
				y2: `${n.y}`,
				display: "inherit"
			});
		} else this.horizontal.setAttribute("display", "none");
		if (e.verticalLeft) {
			let t = this.graph.localToGraph(new I(e.verticalLeft, e.verticalTop)), n = this.graph.localToGraph(new I(e.verticalLeft, e.verticalTop + e.verticalHeight));
			this.vertical.setAttributes({
				x1: `${t.x}`,
				y1: this.options.sharp ? `${t.y}` : "0",
				x2: `${n.x}`,
				y2: this.options.sharp ? `${n.y}` : "100%",
				display: "inherit"
			});
		} else this.vertical.setAttribute("display", "none");
		this.show();
	}
	resetTimer() {
		this.timer && (clearTimeout(this.timer), this.timer = null);
	}
	show() {
		return this.resetTimer(), this.container.parentNode ?? this.graph.container.appendChild(this.container), this;
	}
	hide() {
		this.resetTimer(), this.vertical.setAttribute("display", "none"), this.horizontal.setAttribute("display", "none");
		let e = this.options.clean, t = typeof e == "number" ? e : e === !1 ? 0 : 3e3;
		return t > 0 && (this.timer = window.setTimeout(() => {
			this.container.parentNode !== null && this.unmount();
		}, t)), this;
	}
	onRemove() {
		this.stopListening(), this.hide();
	}
	dispose() {
		this.remove();
	}
};
k([K()], DT.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/snapline/style/raw.js
var OT = ".x6-widget-snapline {\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  pointer-events: none;\n}\n.x6-widget-snapline-vertical,\n.x6-widget-snapline-horizontal {\n  stroke: #2ecc71;\n  stroke-width: 1px;\n}\n";
Q.prototype.isSnaplineEnabled = function() {
	let e = this.getPlugin("snapline");
	return e ? e.isEnabled() : !1;
}, Q.prototype.enableSnapline = function() {
	let e = this.getPlugin("snapline");
	return e && e.enable(), this;
}, Q.prototype.disableSnapline = function() {
	let e = this.getPlugin("snapline");
	return e && e.disable(), this;
}, Q.prototype.toggleSnapline = function() {
	let e = this.getPlugin("snapline");
	return e && e.toggleEnabled(), this;
}, Q.prototype.hideSnapline = function() {
	let e = this.getPlugin("snapline");
	return e && e.hide(), this;
}, Q.prototype.setSnaplineFilter = function(e) {
	let t = this.getPlugin("snapline");
	return t && t.setFilter(e), this;
}, Q.prototype.isSnaplineOnResizingEnabled = function() {
	let e = this.getPlugin("snapline");
	return e ? e.isOnResizingEnabled() : !1;
}, Q.prototype.enableSnaplineOnResizing = function() {
	let e = this.getPlugin("snapline");
	return e && e.enableOnResizing(), this;
}, Q.prototype.disableSnaplineOnResizing = function() {
	let e = this.getPlugin("snapline");
	return e && e.disableOnResizing(), this;
}, Q.prototype.toggleSnaplineOnResizing = function(e) {
	let t = this.getPlugin("snapline");
	return t && t.toggleOnResizing(e), this;
}, Q.prototype.isSharpSnapline = function() {
	let e = this.getPlugin("snapline");
	return e ? e.isSharp() : !1;
}, Q.prototype.enableSharpSnapline = function() {
	let e = this.getPlugin("snapline");
	return e && e.enableSharp(), this;
}, Q.prototype.disableSharpSnapline = function() {
	let e = this.getPlugin("snapline");
	return e && e.disableSharp(), this;
}, Q.prototype.toggleSharpSnapline = function(e) {
	let t = this.getPlugin("snapline");
	return t && t.toggleSharp(e), this;
}, Q.prototype.getSnaplineTolerance = function() {
	let e = this.getPlugin("snapline");
	if (e) return e.getTolerance();
}, Q.prototype.setSnaplineTolerance = function(e) {
	let t = this.getPlugin("snapline");
	return t && t.setTolerance(e), this;
};
// node_modules/@antv/x6/es/plugin/snapline/index.js
var kT = class extends bh {
	constructor(e = {}) {
		super(), this.name = "snapline", this.options = Object.assign({
			enabled: !0,
			tolerance: 10
		}, e), bu(this.name, OT);
	}
	init(e) {
		this.snaplineImpl = new DT(Object.assign(Object.assign({}, this.options), { graph: e }));
	}
	isEnabled() {
		return !this.snaplineImpl.disabled;
	}
	enable() {
		this.snaplineImpl.enable();
	}
	disable() {
		this.snaplineImpl.disable();
	}
	toggleEnabled(e) {
		if (e != null) e !== this.isEnabled() && (e ? this.enable() : this.disable());
		else return this.isEnabled() ? this.disable() : this.enable(), this;
	}
	hide() {
		return this.snaplineImpl.hide(), this;
	}
	setFilter(e) {
		return this.snaplineImpl.setFilter(e), this;
	}
	isOnResizingEnabled() {
		return this.snaplineImpl.options.resizing === !0;
	}
	enableOnResizing() {
		return this.snaplineImpl.options.resizing = !0, this;
	}
	disableOnResizing() {
		return this.snaplineImpl.options.resizing = !1, this;
	}
	toggleOnResizing(e) {
		return e == null ? this.isOnResizingEnabled() ? this.disableOnResizing() : this.enableOnResizing() : e !== this.isOnResizingEnabled() && (e ? this.enableOnResizing() : this.disableOnResizing()), this;
	}
	isSharp() {
		return this.snaplineImpl.options.sharp === !0;
	}
	enableSharp() {
		return this.snaplineImpl.options.sharp = !0, this;
	}
	disableSharp() {
		return this.snaplineImpl.options.sharp = !1, this;
	}
	toggleSharp(e) {
		return e == null ? this.isSharp() ? this.disableSharp() : this.enableSharp() : e !== this.isSharp() && (e ? this.enableSharp() : this.disableSharp()), this;
	}
	getTolerance() {
		return this.snaplineImpl.options.tolerance;
	}
	setTolerance(e) {
		return this.snaplineImpl.options.tolerance = e, this;
	}
	captureCursorOffset(e) {
		this.snaplineImpl.captureCursorOffset(e);
	}
	snapOnMoving(e) {
		this.snaplineImpl.snapOnMoving(e);
	}
	dispose() {
		this.snaplineImpl.dispose(), xu(this.name);
	}
};
k([K()], kT.prototype, "dispose", null);
// node_modules/@antv/x6/es/plugin/transform/style/raw.js
var AT = ".x6-widget-transform {\n  position: absolute;\n  box-sizing: content-box !important;\n  margin: -5px 0 0 -5px;\n  padding: 4px;\n  border: 1px dashed #000;\n  border-radius: 5px;\n  user-select: none;\n  pointer-events: none;\n}\n.x6-widget-transform > div {\n  position: absolute;\n  box-sizing: border-box;\n  background-color: #fff;\n  border: 1px solid #000;\n  transition: background-color 0.2s;\n  pointer-events: auto;\n  -webkit-user-drag: none;\n  user-drag: none;\n  /* stylelint-disable-line */\n}\n.x6-widget-transform > div:hover {\n  background-color: #d3d3d3;\n}\n.x6-widget-transform-cursor-n {\n  cursor: n-resize;\n}\n.x6-widget-transform-cursor-s {\n  cursor: s-resize;\n}\n.x6-widget-transform-cursor-e {\n  cursor: e-resize;\n}\n.x6-widget-transform-cursor-w {\n  cursor: w-resize;\n}\n.x6-widget-transform-cursor-ne {\n  cursor: ne-resize;\n}\n.x6-widget-transform-cursor-nw {\n  cursor: nw-resize;\n}\n.x6-widget-transform-cursor-se {\n  cursor: se-resize;\n}\n.x6-widget-transform-cursor-sw {\n  cursor: sw-resize;\n}\n.x6-widget-transform-resize {\n  width: 10px;\n  height: 10px;\n  border-radius: 6px;\n}\n.x6-widget-transform-resize[data-position='top-left'] {\n  top: -5px;\n  left: -5px;\n}\n.x6-widget-transform-resize[data-position='top-right'] {\n  top: -5px;\n  right: -5px;\n}\n.x6-widget-transform-resize[data-position='bottom-left'] {\n  bottom: -5px;\n  left: -5px;\n}\n.x6-widget-transform-resize[data-position='bottom-right'] {\n  right: -5px;\n  bottom: -5px;\n}\n.x6-widget-transform-resize[data-position='top'] {\n  top: -5px;\n  left: 50%;\n  margin-left: -5px;\n}\n.x6-widget-transform-resize[data-position='bottom'] {\n  bottom: -5px;\n  left: 50%;\n  margin-left: -5px;\n}\n.x6-widget-transform-resize[data-position='left'] {\n  top: 50%;\n  left: -5px;\n  margin-top: -5px;\n}\n.x6-widget-transform-resize[data-position='right'] {\n  top: 50%;\n  right: -5px;\n  margin-top: -5px;\n}\n.x6-widget-transform.prevent-aspect-ratio .x6-widget-transform-resize[data-position='top'],\n.x6-widget-transform.prevent-aspect-ratio .x6-widget-transform-resize[data-position='bottom'],\n.x6-widget-transform.prevent-aspect-ratio .x6-widget-transform-resize[data-position='left'],\n.x6-widget-transform.prevent-aspect-ratio .x6-widget-transform-resize[data-position='right'] {\n  display: none;\n}\n.x6-widget-transform.no-orth-resize .x6-widget-transform-resize[data-position='bottom'],\n.x6-widget-transform.no-orth-resize .x6-widget-transform-resize[data-position='left'],\n.x6-widget-transform.no-orth-resize .x6-widget-transform-resize[data-position='right'],\n.x6-widget-transform.no-orth-resize .x6-widget-transform-resize[data-position='top'] {\n  display: none;\n}\n.x6-widget-transform.no-resize .x6-widget-transform-resize {\n  display: none;\n}\n.x6-widget-transform-rotate {\n  top: -20px;\n  left: -20px;\n  width: 12px;\n  height: 12px;\n  border-radius: 6px;\n  cursor: crosshair;\n}\n.x6-widget-transform.no-rotate .x6-widget-transform-rotate {\n  display: none;\n}\n.x6-widget-transform-active {\n  border-color: transparent;\n  pointer-events: all;\n}\n.x6-widget-transform-active > div {\n  display: none;\n}\n.x6-widget-transform-active > .x6-widget-transform-active-handle {\n  display: block;\n  background-color: #808080;\n}\n", jT = "has-widget-transform", MT = [
	"nw",
	"n",
	"ne",
	"e",
	"se",
	"s",
	"sw",
	"w"
], NT = [
	"top-left",
	"top",
	"top-right",
	"right",
	"bottom-right",
	"bottom",
	"bottom-left",
	"left"
], PT = {
	minWidth: 0,
	minHeight: 0,
	maxWidth: Infinity,
	maxHeight: Infinity,
	rotateGrid: 15,
	rotatable: !0,
	preserveAspectRatio: !1,
	orthogonalResizing: !0,
	restrictedResizing: !1,
	autoScrollOnResizing: !0,
	allowReverse: !0
}, FT = class extends Yb {
	get model() {
		return this.graph.model;
	}
	get view() {
		return this.graph.renderer.findViewByCell(this.node);
	}
	get containerClassName() {
		return this.prefixClassName("widget-transform");
	}
	get resizeClassName() {
		return `${this.containerClassName}-resize`;
	}
	get rotateClassName() {
		return `${this.containerClassName}-rotate`;
	}
	constructor(e, t, n) {
		super(), this.node = t, this.graph = n, this.options = Object.assign(Object.assign({}, PT), e), this.render(), this.startListening();
	}
	startListening() {
		this.delegateEvents({
			[`mousedown .${this.resizeClassName}`]: "startResizing",
			[`touchstart .${this.resizeClassName}`]: "startResizing",
			[`mousedown .${this.rotateClassName}`]: "startRotating",
			[`touchstart .${this.rotateClassName}`]: "startRotating"
		}), this.model.on("*", this.update, this), this.graph.on("scale", this.update, this), this.graph.on("translate", this.update, this), this.node.on("removed", this.remove, this), this.model.on("reseted", this.remove, this), this.view.on("cell:knob:mousedown", this.onKnobMouseDown, this), this.view.on("cell:knob:mouseup", this.onKnobMouseUp, this);
	}
	stopListening() {
		this.undelegateEvents(), this.model.off("*", this.update, this), this.graph.off("scale", this.update, this), this.graph.off("translate", this.update, this), this.node.off("removed", this.remove, this), this.model.off("reseted", this.remove, this), this.view.off("cell:knob:mousedown", this.onKnobMouseDown, this), this.view.off("cell:knob:mouseup", this.onKnobMouseUp, this);
	}
	renderHandles() {
		this.container = document.createElement("div");
		let e = document.createElement("div");
		H(e, "draggable", "false");
		let t = e.cloneNode(!0);
		B(t, this.rotateClassName);
		let n = NT.map((t) => {
			let n = e.cloneNode(!0);
			return B(n, this.resizeClassName), H(n, "data-position", t), n;
		});
		this.empty(), zd(this.container, [...n, t]);
	}
	render() {
		return this.renderHandles(), this.view && this.view.addClass(jT), B(this.container, this.containerClassName), bd(this.container, "no-orth-resize", this.options.preserveAspectRatio || !this.options.orthogonalResizing), bd(this.container, "no-resize", !this.options.resizable), bd(this.container, "no-rotate", !this.options.rotatable), this.options.className && B(this.container, this.options.className), this.graph.container.appendChild(this.container), this.update();
	}
	update() {
		let e = this.graph.matrix(), t = this.node.getBBox();
		t.x *= e.a, t.x += e.e, t.y *= e.d, t.y += e.f, t.width *= e.a, t.height *= e.d;
		let n = Lu(this.node.getAngle()), r = n === 0 ? "" : `rotate(${n}deg)`;
		return U(this.container, {
			transform: r,
			width: t.width,
			height: t.height,
			left: t.x,
			top: t.y
		}), this.updateResizerDirections(), this;
	}
	remove() {
		return this.view && this.view.removeClass(jT), super.remove();
	}
	onKnobMouseDown() {
		this.startHandle();
	}
	onKnobMouseUp() {
		this.stopHandle();
	}
	updateResizerDirections() {
		let e = Lu(this.node.getAngle()), t = Math.floor(e * (MT.length / 360));
		if (t !== this.prevShift) {
			let e = MT.slice(t).concat(MT.slice(0, t)), n = (e) => `${this.containerClassName}-cursor-${e}`;
			this.container.querySelectorAll(`.${this.resizeClassName}`).forEach((t, r) => {
				V(t, MT.map((e) => n(e)).join(" ")), B(t, n(e[r]));
			}), this.prevShift = t;
		}
	}
	getTrueDirection(e) {
		let t = Lu(this.node.getAngle()), n = NT.indexOf(e);
		return n += Math.floor(t * (NT.length / 360)), n %= NT.length, NT[n];
	}
	toValidResizeDirection(e) {
		return {
			top: "top-left",
			bottom: "bottom-right",
			left: "bottom-left",
			right: "top-right"
		}[e] || e;
	}
	startResizing(e) {
		e.stopPropagation(), this.model.startBatch("resize", { cid: this.cid });
		let t = H(e.target, "data-position");
		this.prepareResizing(e, t), this.startAction(e);
	}
	prepareResizing(e, t) {
		let n = this.getTrueDirection(t), r = 0, i = 0;
		t.split("-").forEach((e) => {
			r = {
				left: -1,
				right: 1
			}[e] || r, i = {
				top: -1,
				bottom: 1
			}[e] || i;
		});
		let a = this.toValidResizeDirection(t), o = {
			"top-right": "bottomLeft",
			"top-left": "bottomRight",
			"bottom-left": "topRight",
			"bottom-right": "topLeft"
		}[a], s = Lu(this.node.getAngle());
		this.setEventData(e, {
			selector: o,
			direction: a,
			trueDirection: n,
			relativeDirection: t,
			angle: s,
			resizeX: r,
			resizeY: i,
			action: "resizing"
		});
	}
	startRotating(e) {
		e.stopPropagation(), this.model.startBatch("rotate", { cid: this.cid });
		let t = this.node.getBBox().getCenter(), n = this.normalizeEvent(e), r = this.graph.snapToGrid(n.clientX, n.clientY);
		this.setEventData(e, {
			center: t,
			action: "rotating",
			angle: Lu(this.node.getAngle()),
			start: I.create(r).theta(t)
		}), this.startAction(e);
	}
	onMouseMove(e) {
		let t = this.graph.findViewByCell(this.node), n = this.getEventData(e);
		if (n.action) {
			let r = this.normalizeEvent(e), i = r.clientX, a = r.clientY, o = this.graph.getPlugin("scroller"), s = this.options.restrictedResizing;
			if (s === !0 || typeof s == "number") {
				let e = s === !0 ? 0 : s, t = o ? Math.max(e, 8) : e, n = this.graph.container.getBoundingClientRect();
				i = ja(i, n.left + t, n.right - t), a = ja(a, n.top + t, n.bottom - t);
			} else this.options.autoScrollOnResizing && o && o.autoScroll(i, a);
			let c = this.graph.snapToGrid(i, a), l = this.graph.getGridSize(), u = this.node, d = this.options;
			if (n.action === "resizing") {
				n = n, n.resized || (t && (t.addClass("node-resizing"), this.notify("node:resize", e, t)), n.resized = !0);
				let r = u.getBBox(), i = I.create(c).rotate(n.angle, r.getCenter()).diff(r[n.selector]), a = n.resizeX ? i.x * n.resizeX : r.width, o = n.resizeY ? i.y * n.resizeY : r.height, s = a, f = o;
				if (a = Vu(a, l), o = Vu(o, l), a = Math.max(a, d.minWidth || l), o = Math.max(o, d.minHeight || l), a = Math.min(a, d.maxWidth || Infinity), o = Math.min(o, d.maxHeight || Infinity), d.preserveAspectRatio) {
					let e = r.width * o / r.height, t = r.height * a / r.width;
					a < e ? o = t : a = e;
				}
				let p = n.relativeDirection;
				if (d.allowReverse && (s <= -a || f <= -o)) {
					let t;
					p === "left" ? s <= -a && (t = "right") : p === "right" ? s <= -a && (t = "left") : p === "top" ? f <= -o && (t = "bottom") : p === "bottom" ? f <= -o && (t = "top") : p === "top-left" ? s <= -a && f <= -o ? t = "bottom-right" : s <= -a ? t = "top-right" : f <= -o && (t = "bottom-left") : p === "top-right" ? s <= -a && f <= -o ? t = "bottom-left" : s <= -a ? t = "top-left" : f <= -o && (t = "bottom-right") : p === "bottom-left" ? s <= -a && f <= -o ? t = "top-right" : s <= -a ? t = "bottom-right" : f <= -o && (t = "top-left") : p === "bottom-right" && (s <= -a && f <= -o ? t = "top-left" : s <= -a ? t = "bottom-left" : f <= -o && (t = "top-right"));
					let n = t;
					this.stopHandle();
					let r = this.container.querySelector(`.${this.resizeClassName}[data-position="${n}"]`);
					this.startHandle(r), this.prepareResizing(e, n), this.onMouseMove(e);
				}
				if (r.width !== a || r.height !== o) {
					let r = {
						ui: !0,
						direction: n.direction,
						relativeDirection: n.relativeDirection,
						trueDirection: n.trueDirection,
						minWidth: d.minWidth,
						minHeight: d.minHeight,
						maxWidth: d.maxWidth,
						maxHeight: d.maxHeight,
						preserveAspectRatio: d.preserveAspectRatio === !0
					};
					u.resize(a, o, r), this.notify("node:resizing", e, t);
				}
			} else if (n.action === "rotating") {
				n = n, n.rotated || (t && (t.addClass("node-rotating"), this.notify("node:rotate", e, t)), n.rotated = !0);
				let r = u.getAngle(), i = n.start - I.create(c).theta(n.center), a = n.angle + i;
				d.rotateGrid && (a = Vu(a, d.rotateGrid)), a = Lu(a), r !== a && (u.rotate(a, { absolute: !0 }), this.notify("node:rotating", e, t));
			}
		}
	}
	onMouseUp(e) {
		let t = this.getEventData(e);
		t.action && (this.stopAction(e), this.model.stopBatch(t.action === "resizing" ? "resize" : "rotate", { cid: this.cid }));
	}
	startHandle(e) {
		if (this.handle = e || null, B(this.container, `${this.containerClassName}-active`), e) {
			B(e, `${this.containerClassName}-active-handle`);
			let t = e.getAttribute("data-position");
			if (t) {
				let e = MT[NT.indexOf(t)];
				B(this.container, `${this.containerClassName}-cursor-${e}`);
			}
		}
	}
	stopHandle() {
		if (V(this.container, `${this.containerClassName}-active`), this.handle) {
			V(this.handle, `${this.containerClassName}-active-handle`);
			let e = this.handle.getAttribute("data-position");
			if (e) {
				let t = MT[NT.indexOf(e)];
				V(this.container, `${this.containerClassName}-cursor-${t}`);
			}
			this.handle = null;
		}
	}
	startAction(e) {
		this.startHandle(e.target), this.graph.view.undelegateEvents(), this.delegateDocumentEvents(_S, e.data);
	}
	stopAction(e) {
		this.stopHandle(), this.undelegateDocumentEvents(), this.graph.view.delegateEvents();
		let t = this.graph.findViewByCell(this.node), n = this.getEventData(e);
		t && (t.removeClass(`node-${n.action}`), n.action === "resizing" && n.resized ? this.notify("node:resized", e, t) : n.action === "rotating" && n.rotated && this.notify("node:rotated", e, t));
	}
	notify(e, t, n, r = {}) {
		if (n) {
			let i = n.graph, a = i.view.normalizeEvent(t), o = i.snapToGrid(a.clientX, a.clientY);
			this.trigger(e, Object.assign({
				e: a,
				view: n,
				node: n.cell,
				cell: n.cell,
				x: o.x,
				y: o.y
			}, r));
		}
	}
	dispose() {
		this.stopListening(), this.remove(), this.off();
	}
};
k([K()], FT.prototype, "dispose", null), Q.prototype.createTransformWidget = function(e) {
	let t = this.getPlugin("transform");
	return t && t.createWidget(e), this;
}, Q.prototype.clearTransformWidgets = function() {
	let e = this.getPlugin("transform");
	return e && e.clearWidgets(), this;
};
// node_modules/@antv/x6/es/plugin/transform/index.js
var IT = class extends xh {
	constructor(e = {}) {
		super(), this.name = "transform", this.widgets = /* @__PURE__ */ new Map(), this.disabled = !1, this.options = e, bu(this.name, AT);
	}
	init(e) {
		this.graph = e, !this.disabled && this.startListening();
	}
	startListening() {
		this.graph.on("node:click", this.onNodeClick, this), this.graph.on("blank:mousedown", this.onBlankMouseDown, this);
	}
	stopListening() {
		this.graph.off("node:click", this.onNodeClick, this), this.graph.off("blank:mousedown", this.onBlankMouseDown, this);
	}
	enable() {
		this.disabled && (this.disabled = !1, this.startListening());
	}
	disable() {
		this.disabled || (this.disabled = !0, this.stopListening());
	}
	isEnabled() {
		return !this.disabled;
	}
	createWidget(e) {
		this.clearWidgets();
		let t = this.createTransform(e);
		t && (this.widgets.set(e, t), t.on("*", (e, t) => {
			this.trigger(e, t), this.graph.trigger(e, t);
		}));
	}
	onNodeClick({ node: e }) {
		this.createWidget(e);
	}
	onBlankMouseDown() {
		this.clearWidgets();
	}
	createTransform(e) {
		let t = this.getTransformOptions(e);
		return t.resizable || t.rotatable ? new FT(t, e, this.graph) : null;
	}
	parseOptionGroup(e, t, n) {
		let r = {};
		return Object.keys(n || {}).forEach((i) => {
			let a = n[i];
			r[i] = typeof a == "function" ? a.call(e, t) : a;
		}), r;
	}
	getTransformOptions(e) {
		this.options.resizing || (this.options.resizing = { enabled: !1 }), this.options.rotating || (this.options.rotating = { enabled: !1 }), typeof this.options.resizing == "boolean" && (this.options.resizing = { enabled: this.options.resizing }), typeof this.options.rotating == "boolean" && (this.options.rotating = { enabled: this.options.rotating });
		let t = this.parseOptionGroup(this.graph, e, this.options.resizing), n = this.parseOptionGroup(this.graph, e, this.options.rotating);
		return {
			resizable: !!t.enabled,
			minWidth: t.minWidth || 0,
			maxWidth: t.maxWidth || 2 ** 53 - 1,
			minHeight: t.minHeight || 0,
			maxHeight: t.maxHeight || 2 ** 53 - 1,
			orthogonalResizing: typeof t.orthogonal != "boolean" || t.orthogonal,
			restrictedResizing: !!t.restrict,
			autoScrollOnResizing: typeof t.autoScroll != "boolean" || t.autoScroll,
			preserveAspectRatio: !!t.preserveAspectRatio,
			allowReverse: typeof t.allowReverse != "boolean" || t.allowReverse,
			rotatable: !!n.enabled,
			rotateGrid: n.grid || 15
		};
	}
	clearWidgets() {
		this.widgets.forEach((e, t) => {
			this.graph.getCellById(t.id) && e.dispose();
		}), this.widgets.clear();
	}
	dispose() {
		this.clearWidgets(), this.stopListening(), this.off(), xu(this.name);
	}
};
k([K()], IT.prototype, "dispose", null);
// node_modules/@dagrejs/dagre/dist/dagre.esm.js
var LT = Object.defineProperty, RT = (e, t, n) => t in e ? LT(e, t, {
	enumerable: !0,
	configurable: !0,
	writable: !0,
	value: n
}) : e[t] = n, zT = (e, t) => {
	for (var n in t) LT(e, n, {
		get: t[n],
		enumerable: !0
	});
}, BT = (e, t, n) => RT(e, typeof t == "symbol" ? t : t + "", n), VT = {};
zT(VT, {
	Graph: () => EE,
	alg: () => eE
});
var HT = Object.defineProperty, UT = (e, t) => {
	for (var n in t) HT(e, n, {
		get: t[n],
		enumerable: !0
	});
}, WT = class {
	constructor(e) {
		this._isDirected = !0, this._isMultigraph = !1, this._isCompound = !1, this._nodes = {}, this._in = {}, this._preds = {}, this._out = {}, this._sucs = {}, this._edgeObjs = {}, this._edgeLabels = {}, this._nodeCount = 0, this._edgeCount = 0, this._defaultNodeLabelFn = () => {}, this._defaultEdgeLabelFn = () => {}, e && (this._isDirected = "directed" in e ? e.directed : !0, this._isMultigraph = "multigraph" in e && e.multigraph, this._isCompound = "compound" in e && e.compound), this._isCompound && (this._parent = {}, this._children = {}, this._children["\0"] = {});
	}
	isDirected() {
		return this._isDirected;
	}
	isMultigraph() {
		return this._isMultigraph;
	}
	isCompound() {
		return this._isCompound;
	}
	setGraph(e) {
		return this._label = e, this;
	}
	graph() {
		return this._label;
	}
	setDefaultNodeLabel(e) {
		return this._defaultNodeLabelFn = typeof e == "function" ? e : () => e, this;
	}
	nodeCount() {
		return this._nodeCount;
	}
	nodes() {
		return Object.keys(this._nodes);
	}
	sources() {
		return this.nodes().filter((e) => Object.keys(this._in[e]).length === 0);
	}
	sinks() {
		return this.nodes().filter((e) => Object.keys(this._out[e]).length === 0);
	}
	setNodes(e, t) {
		return e.forEach((e) => {
			t === void 0 ? this.setNode(e) : this.setNode(e, t);
		}), this;
	}
	setNode(e, t) {
		return e in this._nodes ? (arguments.length > 1 && (this._nodes[e] = t), this) : (this._nodes[e] = arguments.length > 1 ? t : this._defaultNodeLabelFn(e), this._isCompound && (this._parent[e] = "\0", this._children[e] = {}, this._children["\0"][e] = !0), this._in[e] = {}, this._preds[e] = {}, this._out[e] = {}, this._sucs[e] = {}, ++this._nodeCount, this);
	}
	node(e) {
		return this._nodes[e];
	}
	hasNode(e) {
		return e in this._nodes;
	}
	removeNode(e) {
		if (e in this._nodes) {
			let t = (e) => this.removeEdge(this._edgeObjs[e]);
			delete this._nodes[e], this._isCompound && (this._removeFromParentsChildList(e), delete this._parent[e], this.children(e).forEach((e) => {
				this.setParent(e);
			}), delete this._children[e]), Object.keys(this._in[e]).forEach(t), delete this._in[e], delete this._preds[e], Object.keys(this._out[e]).forEach(t), delete this._out[e], delete this._sucs[e], --this._nodeCount;
		}
		return this;
	}
	setParent(e, t) {
		if (!this._isCompound) throw Error("Cannot set parent in a non-compound graph");
		if (t === void 0) t = "\0";
		else {
			t += "";
			for (let n = t; n !== void 0; n = this.parent(n)) if (n === e) throw Error("Setting " + t + " as parent of " + e + " would create a cycle");
			this.setNode(t);
		}
		return this.setNode(e), this._removeFromParentsChildList(e), this._parent[e] = t, this._children[t][e] = !0, this;
	}
	parent(e) {
		if (this._isCompound) {
			let t = this._parent[e];
			if (t !== "\0") return t;
		}
	}
	children(e = "\0") {
		if (this._isCompound) {
			let t = this._children[e];
			if (t) return Object.keys(t);
		} else {
			if (e === "\0") return this.nodes();
			if (this.hasNode(e)) return [];
		}
		return [];
	}
	predecessors(e) {
		let t = this._preds[e];
		if (t) return Object.keys(t);
	}
	successors(e) {
		let t = this._sucs[e];
		if (t) return Object.keys(t);
	}
	neighbors(e) {
		let t = this.predecessors(e);
		if (t) {
			let n = new Set(t), r = this.successors(e);
			if (r) for (let e of r) n.add(e);
			return Array.from(n.values());
		}
	}
	isLeaf(e) {
		let t;
		return t = this.isDirected() ? this.successors(e) : this.neighbors(e), (t?.length ?? 0) === 0;
	}
	filterNodes(e) {
		let t = new this.constructor({
			directed: this._isDirected,
			multigraph: this._isMultigraph,
			compound: this._isCompound
		});
		t.setGraph(this.graph()), Object.entries(this._nodes).forEach(([n, r]) => {
			e(n) && t.setNode(n, r);
		}), Object.values(this._edgeObjs).forEach((e) => {
			t.hasNode(e.v) && t.hasNode(e.w) && t.setEdge(e, this.edge(e));
		});
		let n = {}, r = (e) => {
			let i = this.parent(e);
			return !i || t.hasNode(i) ? (n[e] = i, i) : i in n ? n[i] : r(i);
		};
		return this._isCompound && t.nodes().forEach((e) => t.setParent(e, r(e))), t;
	}
	setDefaultEdgeLabel(e) {
		return this._defaultEdgeLabelFn = typeof e == "function" ? e : () => e, this;
	}
	edgeCount() {
		return this._edgeCount;
	}
	edges() {
		return Object.values(this._edgeObjs);
	}
	setPath(e, t) {
		return e.reduce((e, n) => (t === void 0 ? this.setEdge(e, n) : this.setEdge(e, n, t), n)), this;
	}
	setEdge(e, t, n, r) {
		let i, a, o, s, c = !1;
		typeof e == "object" && e && "v" in e ? (i = e.v, a = e.w, o = e.name, arguments.length === 2 && (s = t, c = !0)) : (i = e, a = t, o = r, arguments.length > 2 && (s = n, c = !0)), i = "" + i, a = "" + a, o !== void 0 && (o = "" + o);
		let l = qT(this._isDirected, i, a, o);
		if (l in this._edgeLabels) return c && (this._edgeLabels[l] = s), this;
		if (o !== void 0 && !this._isMultigraph) throw Error("Cannot set a named edge when isMultigraph = false");
		this.setNode(i), this.setNode(a), this._edgeLabels[l] = c ? s : this._defaultEdgeLabelFn(i, a, o);
		let u = JT(this._isDirected, i, a, o);
		return i = u.v, a = u.w, Object.freeze(u), this._edgeObjs[l] = u, GT(this._preds[a], i), GT(this._sucs[i], a), this._in[a][l] = u, this._out[i][l] = u, this._edgeCount++, this;
	}
	edge(e, t, n) {
		let r = arguments.length === 1 ? YT(this._isDirected, e) : qT(this._isDirected, e, t, n);
		return this._edgeLabels[r];
	}
	edgeAsObj(e, t, n) {
		let r = arguments.length === 1 ? this.edge(e) : this.edge(e, t, n);
		return typeof r != "object" || !r ? { label: r } : r;
	}
	hasEdge(e, t, n) {
		return (arguments.length === 1 ? YT(this._isDirected, e) : qT(this._isDirected, e, t, n)) in this._edgeLabels;
	}
	removeEdge(e, t, n) {
		let r = arguments.length === 1 ? YT(this._isDirected, e) : qT(this._isDirected, e, t, n), i = this._edgeObjs[r];
		if (i) {
			let e = i.v, t = i.w;
			delete this._edgeLabels[r], delete this._edgeObjs[r], KT(this._preds[t], e), KT(this._sucs[e], t), delete this._in[t][r], delete this._out[e][r], this._edgeCount--;
		}
		return this;
	}
	inEdges(e, t) {
		return this.isDirected() ? this.filterEdges(this._in[e], e, t) : this.nodeEdges(e, t);
	}
	outEdges(e, t) {
		return this.isDirected() ? this.filterEdges(this._out[e], e, t) : this.nodeEdges(e, t);
	}
	nodeEdges(e, t) {
		if (e in this._nodes) return this.filterEdges({
			...this._in[e],
			...this._out[e]
		}, e, t);
	}
	_removeFromParentsChildList(e) {
		delete this._children[this._parent[e]][e];
	}
	filterEdges(e, t, n) {
		if (!e) return;
		let r = Object.values(e);
		return n ? r.filter((e) => e.v === t && e.w === n || e.v === n && e.w === t) : r;
	}
};
function GT(e, t) {
	e[t] ? e[t]++ : e[t] = 1;
}
function KT(e, t) {
	e[t] !== void 0 && !--e[t] && delete e[t];
}
function qT(e, t, n, r) {
	let i = "" + t, a = "" + n;
	if (!e && i > a) {
		let e = i;
		i = a, a = e;
	}
	return i + "" + a + "" + (r === void 0 ? "\0" : r);
}
function JT(e, t, n, r) {
	let i = "" + t, a = "" + n;
	if (!e && i > a) {
		let e = i;
		i = a, a = e;
	}
	let o = {
		v: i,
		w: a
	};
	return r && (o.name = r), o;
}
function YT(e, t) {
	return qT(e, t.v, t.w, t.name);
}
UT({}, {
	read: () => $T,
	write: () => XT
});
function XT(e) {
	let t = {
		options: {
			directed: e.isDirected(),
			multigraph: e.isMultigraph(),
			compound: e.isCompound()
		},
		nodes: ZT(e),
		edges: QT(e)
	}, n = e.graph();
	return n !== void 0 && (t.value = structuredClone(n)), t;
}
function ZT(e) {
	return e.nodes().map((t) => {
		let n = e.node(t), r = e.parent(t), i = { v: t };
		return n !== void 0 && (i.value = n), r !== void 0 && (i.parent = r), i;
	});
}
function QT(e) {
	return e.edges().map((t) => {
		let n = e.edge(t), r = {
			v: t.v,
			w: t.w
		};
		return t.name !== void 0 && (r.name = t.name), n !== void 0 && (r.value = n), r;
	});
}
function $T(e) {
	let t = new WT(e.options);
	return e.value !== void 0 && t.setGraph(e.value), e.nodes.forEach((e) => {
		t.setNode(e.v, e.value), e.parent && t.setParent(e.v, e.parent);
	}), e.edges.forEach((e) => {
		t.setEdge({
			v: e.v,
			w: e.w,
			name: e.name
		}, e.value);
	}), t;
}
var eE = {};
UT(eE, {
	CycleException: () => hE,
	bellmanFord: () => nE,
	components: () => iE,
	dijkstra: () => sE,
	dijkstraAll: () => lE,
	findCycles: () => dE,
	floydWarshall: () => pE,
	isAcyclic: () => _E,
	postorder: () => xE,
	preorder: () => SE,
	prim: () => CE,
	shortestPaths: () => wE,
	tarjan: () => uE,
	topsort: () => gE
});
var tE = () => 1;
function nE(e, t, n, r) {
	return rE(e, String(t), n || tE, r || function(t) {
		return e.outEdges(t) ?? [];
	});
}
function rE(e, t, n, r) {
	let i = {}, a, o = 0, s = e.nodes(), c = function(e) {
		let t = i[e.v], r = i[e.w];
		if (!t || !r) return;
		let o = n(e);
		t.distance + o < r.distance && (i[e.w] = {
			distance: t.distance + o,
			predecessor: e.v
		}, a = !0);
	}, l = function() {
		s.forEach(function(e) {
			r(e).forEach(function(t) {
				let n = t.v === e ? t.v : t.w, r = n === t.v ? t.w : t.v;
				c({
					v: n,
					w: r
				});
			});
		});
	};
	s.forEach(function(e) {
		i[e] = {
			distance: e === t ? 0 : Infinity,
			predecessor: ""
		};
	});
	let u = s.length;
	for (let e = 1; e < u && (a = !1, o++, l(), a); e++);
	if (o === u - 1 && (a = !1, l(), a)) throw Error("The graph contains a negative weight cycle");
	return i;
}
function iE(e) {
	let t = {}, n = [], r;
	function i(n) {
		var a, o;
		n in t || (t[n] = !0, r.push(n), (a = e.successors(n)) == null || a.forEach(i), (o = e.predecessors(n)) == null || o.forEach(i));
	}
	return e.nodes().forEach(function(e) {
		r = [], i(e), r.length && n.push(r);
	}), n;
}
var aE = class {
	constructor() {
		this._arr = [], this._keyIndices = {};
	}
	size() {
		return this._arr.length;
	}
	keys() {
		return this._arr.map((e) => e.key);
	}
	has(e) {
		return e in this._keyIndices;
	}
	priority(e) {
		let t = this._keyIndices[e];
		if (t !== void 0) return this._arr[t].priority;
	}
	min() {
		if (this.size() === 0) throw Error("Queue underflow");
		return this._arr[0].key;
	}
	add(e, t) {
		let n = this._keyIndices, r = String(e);
		if (!(r in n)) {
			let e = this._arr, i = e.length;
			return n[r] = i, e.push({
				key: r,
				priority: t
			}), this._decrease(i), !0;
		}
		return !1;
	}
	removeMin() {
		if (this.size() === 0) throw Error("Queue underflow");
		this._swap(0, this._arr.length - 1);
		let e = this._arr.pop();
		return delete this._keyIndices[e.key], this._heapify(0), e.key;
	}
	decrease(e, t) {
		let n = this._keyIndices[e];
		if (n === void 0) throw Error(`Key not found: ${e}`);
		let r = this._arr[n].priority;
		if (t > r) throw Error(`New priority is greater than current priority. Key: ${e} Old: ${r} New: ${t}`);
		this._arr[n].priority = t, this._decrease(n);
	}
	_heapify(e) {
		let t = this._arr, n = 2 * e, r = n + 1, i = e;
		n < t.length && (i = t[n].priority < t[i].priority ? n : i, r < t.length && (i = t[r].priority < t[i].priority ? r : i), i !== e && (this._swap(e, i), this._heapify(i)));
	}
	_decrease(e) {
		let t = this._arr, n = t[e].priority, r;
		for (; e !== 0 && (r = e >> 1, !(t[r].priority < n));) this._swap(e, r), e = r;
	}
	_swap(e, t) {
		let n = this._arr, r = this._keyIndices, i = n[e], a = n[t];
		n[e] = a, n[t] = i, r[a.key] = e, r[i.key] = t;
	}
}, oE = () => 1;
function sE(e, t, n, r) {
	return cE(e, String(t), n || oE, r || function(t) {
		return e.outEdges(t) ?? [];
	});
}
function cE(e, t, n, r) {
	let i = {}, a = new aE(), o, s, c = function(e) {
		let t = e.v === o ? e.w : e.v, r = i[t];
		if (!r) return;
		let c = n(e), l = s.distance + c;
		if (c < 0) throw Error("dijkstra does not allow negative edge weights. Bad edge: " + e + " Weight: " + c);
		l < r.distance && (r.distance = l, r.predecessor = o, a.decrease(t, l));
	};
	for (e.nodes().forEach(function(e) {
		let n = e === t ? 0 : Infinity;
		i[e] = {
			distance: n,
			predecessor: ""
		}, a.add(e, n);
	}); a.size() > 0;) {
		o = a.removeMin();
		let e = i[o];
		if (!e || e.distance === Infinity) break;
		s = e, r(o).forEach(c);
	}
	return i;
}
function lE(e, t, n) {
	return e.nodes().reduce(function(r, i) {
		return r[i] = sE(e, i, t, n), r;
	}, {});
}
function uE(e) {
	let t = 0, n = [], r = {}, i = [];
	function a(o) {
		var s;
		let c = r[o] = {
			onStack: !0,
			lowlink: t,
			index: t++
		};
		if (n.push(o), (s = e.successors(o)) == null || s.forEach(function(e) {
			if (e in r) {
				let t = r[e];
				t != null && t.onStack && (c.lowlink = Math.min(c.lowlink, t.index));
			} else {
				a(e);
				let t = r[e];
				t && (c.lowlink = Math.min(c.lowlink, t.lowlink));
			}
		}), c.lowlink === c.index) {
			let e = [], t;
			do {
				t = n.pop();
				let i = r[t];
				i && (i.onStack = !1), e.push(t);
			} while (o !== t);
			i.push(e);
		}
	}
	return e.nodes().forEach(function(e) {
		e in r || a(e);
	}), i;
}
function dE(e) {
	return uE(e).filter(function(t) {
		let n = t[0];
		return n ? t.length > 1 || t.length === 1 && (e.outEdges(n, n) ?? []).length > 0 : !1;
	});
}
var fE = () => 1;
function pE(e, t, n) {
	return mE(e, t || fE, n || function(t) {
		return e.outEdges(t) ?? [];
	});
}
function mE(e, t, n) {
	let r = {}, i = e.nodes();
	return i.forEach(function(e) {
		let a = {};
		r[e] = a, a[e] = {
			distance: 0,
			predecessor: ""
		}, i.forEach(function(t) {
			e !== t && (a[t] = {
				distance: Infinity,
				predecessor: ""
			});
		}), n(e).forEach(function(n) {
			let r = n.v === e ? n.w : n.v, i = t(n);
			a[r] = {
				distance: i,
				predecessor: e
			};
		});
	}), i.forEach(function(e) {
		let t = r[e];
		t && i.forEach(function(n) {
			let a = r[n];
			a && i.forEach(function(n) {
				let r = a[e], i = t[n], o = a[n];
				if (r && i && o) {
					let e = r.distance + i.distance;
					e < o.distance && (o.distance = e, o.predecessor = i.predecessor);
				}
			});
		});
	}), r;
}
var hE = class extends Error {
	constructor(e) {
		super(e), this.name = "CycleException";
	}
};
function gE(e) {
	let t = {}, n = {}, r = [];
	function i(a) {
		var o;
		if (a in n) throw new hE();
		a in t || (n[a] = !0, t[a] = !0, (o = e.predecessors(a)) == null || o.forEach(i), delete n[a], r.push(a));
	}
	if (e.sinks().forEach(i), Object.keys(t).length !== e.nodeCount()) throw new hE();
	return r;
}
function _E(e) {
	try {
		gE(e);
	} catch (e) {
		if (e instanceof hE) return !1;
		throw e;
	}
	return !0;
}
function vE(e, t, n, r, i) {
	Array.isArray(t) || (t = [t]);
	let a = ((t) => (e.isDirected() ? e.successors(t) : e.neighbors(t)) ?? []), o = {};
	return t.forEach(function(t) {
		if (!e.hasNode(t)) throw Error("Graph does not have node: " + t);
		i = yE(e, t, n === "post", o, a, r, i);
	}), i;
}
function yE(e, t, n, r, i, a, o) {
	return t in r || (r[t] = !0, n || (o = a(o, t)), i(t).forEach(function(t) {
		o = yE(e, t, n, r, i, a, o);
	}), n && (o = a(o, t))), o;
}
function bE(e, t, n) {
	return vE(e, t, n, function(e, t) {
		return e.push(t), e;
	}, []);
}
function xE(e, t) {
	return bE(e, t, "post");
}
function SE(e, t) {
	return bE(e, t, "pre");
}
function CE(e, t) {
	var n;
	let r = new WT(), i = {}, a = new aE(), o;
	function s(e) {
		let n = e.v === o ? e.w : e.v, r = a.priority(n);
		if (r !== void 0) {
			let s = t(e);
			s < r && (i[n] = o, a.decrease(n, s));
		}
	}
	if (e.nodeCount() === 0) return r;
	e.nodes().forEach(function(e) {
		a.add(e, Infinity), r.setNode(e);
	});
	let c = e.nodes()[0];
	c !== void 0 && a.decrease(c, 0);
	let l = !1;
	for (; a.size() > 0;) {
		if (o = a.removeMin(), o in i) r.setEdge(o, i[o]);
		else {
			if (l) throw Error("Input graph is not connected: " + e);
			l = !0;
		}
		(n = e.nodeEdges(o)) == null || n.forEach(s);
	}
	return r;
}
function wE(e, t, n, r) {
	return TE(e, t, n, r ?? ((t) => e.outEdges(t) ?? []));
}
function TE(e, t, n, r) {
	if (n === void 0) return sE(e, t, n, r);
	let i = !1, a = e.nodes();
	for (let o = 0; o < a.length; o++) {
		let s = a[o];
		if (s === void 0) continue;
		let c = r(s);
		for (let e = 0; e < c.length; e++) {
			let t = c[e];
			if (!t) continue;
			let r = t.v === s ? t.v : t.w;
			n({
				v: r,
				w: r === t.v ? t.w : t.v
			}) < 0 && (i = !0);
		}
		if (i) return nE(e, t, n, r);
	}
	return sE(e, t, n, r);
}
var EE = WT;
function DE(e, t, n, r) {
	let i = r;
	for (; e.hasNode(i);) i = UE(r);
	return n.dummy = t, e.setNode(i, n), i;
}
function OE(e) {
	let t = new EE().setGraph(e.graph());
	return e.nodes().forEach((n) => t.setNode(n, e.node(n))), e.edges().forEach((n) => {
		let r = t.edge(n.v, n.w) || {
			weight: 0,
			minlen: 1
		}, i = e.edge(n);
		t.setEdge(n.v, n.w, {
			weight: r.weight + i.weight,
			minlen: Math.max(r.minlen, i.minlen)
		});
	}), t;
}
function kE(e) {
	let t = new EE({ multigraph: e.isMultigraph() }).setGraph(e.graph());
	return e.nodes().forEach((n) => {
		e.children(n).length || t.setNode(n, e.node(n));
	}), e.edges().forEach((n) => {
		t.setEdge(n, e.edge(n));
	}), t;
}
function AE(e, t) {
	let n = e.x, r = e.y, i = t.x - n, a = t.y - r, o = e.width / 2, s = e.height / 2;
	if (!i && !a) throw Error("Not possible to find intersection inside of the rectangle");
	let c, l;
	return i === 0 || Math.abs(a) * o > Math.abs(i) * s ? (a < 0 && (s = -s), c = s * i / a, l = s) : (i < 0 && (o = -o), c = o, l = o * a / i), {
		x: n + c,
		y: r + l
	};
}
function jE(e) {
	let t = WE(RE(e) + 1).map(() => []);
	return e.nodes().forEach((n) => {
		let r = e.node(n), i = r.rank;
		i !== void 0 && (t[i] || (t[i] = []), t[i][r.order] = n);
	}), t;
}
function ME(e) {
	let t = e.nodes().map((t) => {
		let n = e.node(t).rank;
		return n === void 0 ? Number.MAX_VALUE : n;
	}), n = LE(Math.min, t);
	e.nodes().forEach((t) => {
		let r = e.node(t);
		Object.hasOwn(r, "rank") && (r.rank -= n);
	});
}
function NE(e) {
	let t = e.nodes().map((t) => e.node(t).rank).filter((e) => e !== void 0), n = LE(Math.min, t), r = [];
	e.nodes().forEach((t) => {
		let i = e.node(t).rank - n;
		r[i] || (r[i] = []), r[i].push(t);
	});
	let i = 0, a = e.graph().nodeRankFactor;
	Array.from(r).forEach((t, n) => {
		t === void 0 && n % a !== 0 ? --i : t !== void 0 && i && t.forEach((t) => e.node(t).rank += i);
	});
}
function PE(e, t, n, r) {
	let i = {
		width: 0,
		height: 0
	};
	return arguments.length >= 4 && (i.rank = n, i.order = r), DE(e, "border", i, t);
}
function FE(e, t = IE) {
	let n = [];
	for (let r = 0; r < e.length; r += t) {
		let i = e.slice(r, r + t);
		n.push(i);
	}
	return n;
}
var IE = 65535;
function LE(e, t) {
	return t.length > IE ? e(...FE(t).map((t) => e(...t))) : e(...t);
}
function RE(e) {
	let t = e.nodes().map((t) => {
		let n = e.node(t).rank;
		return n === void 0 ? Number.MIN_VALUE : n;
	});
	return LE(Math.max, t);
}
function zE(e, t) {
	let n = {
		lhs: [],
		rhs: []
	};
	return e.forEach((e) => {
		t(e) ? n.lhs.push(e) : n.rhs.push(e);
	}), n;
}
function BE(e, t) {
	let n = Date.now();
	try {
		return t();
	} finally {
		console.log(e + " time: " + (Date.now() - n) + "ms");
	}
}
function VE(e, t) {
	return t();
}
var HE = 0;
function UE(e) {
	return e + ("" + ++HE);
}
function WE(e, t, n = 1) {
	t ?? (t = e, e = 0);
	let r = (e) => e < t;
	n < 0 && (r = (e) => t < e);
	let i = [];
	for (let t = e; r(t); t += n) i.push(t);
	return i;
}
function GE(e, t) {
	let n = {};
	for (let r of t) e[r] !== void 0 && (n[r] = e[r]);
	return n;
}
function KE(e, t) {
	let n;
	return n = typeof t == "string" ? (e) => e[t] : t, Object.entries(e).reduce((e, [t, r]) => (e[t] = n(r, t), e), {});
}
function qE(e, t) {
	return e.reduce((e, n, r) => (e[n] = t[r], e), {});
}
var JE = "\0";
function YE(e, t, n) {
	if (!(e && t && n && t.dummy === "edge" && n.dummy === "edge" && t.edgeObj && n.edgeObj && e[t.edgeObj.v] && e[n.edgeObj.v] && e[t.edgeObj.w] && e[n.edgeObj.w])) return 0;
	let r = !0;
	t.edgeObj.w === n.edgeObj.w && (r = !1);
	let i = r ? e[t.edgeObj.v]?.rank ?? NaN : e[t.edgeObj.w]?.rank ?? NaN, a = Object.entries(e).find((e) => e[1].edgeObj?.v === t.edgeObj.v && e[1].edgeObj?.w === t.edgeObj.w && e[1].rank === i), o = Object.entries(e).find((e) => e[1].edgeObj?.v === n.edgeObj.v && e[1].edgeObj?.w === n.edgeObj.w && e[1].rank === i);
	if (!a || !o) return 0;
	let s = a[1].order ?? NaN, c = o[1].order ?? NaN;
	return isNaN(s - c) ? 0 : s - c;
}
var XE = "3.1.3", ZE = class {
	constructor() {
		BT(this, "_sentinel");
		let e = {};
		e._next = e._prev = e, this._sentinel = e;
	}
	dequeue() {
		let e = this._sentinel, t = e._prev;
		if (t !== e) return QE(t), t;
	}
	enqueue(e) {
		let t = this._sentinel;
		e._prev && e._next && QE(e), e._next = t._next, t._next._prev = e, t._next = e, e._prev = t;
	}
	toString() {
		let e = [], t = this._sentinel, n = t._prev;
		for (; n !== t;) e.push(JSON.stringify(n, $E)), n = n._prev;
		return "[" + e.join(", ") + "]";
	}
};
function QE(e) {
	e._prev._next = e._next, e._next._prev = e._prev, delete e._next, delete e._prev;
}
function $E(e, t) {
	if (e !== "_next" && e !== "_prev") return t;
}
var eD = ZE, tD = () => 1;
function nD(e, t) {
	if (e.nodeCount() <= 1) return [];
	let n = aD(e, t || tD);
	return rD(n.graph, n.buckets, n.zeroIdx).flatMap((t) => e.outEdges(t.v, t.w) || []);
}
function rD(e, t, n) {
	let r = [], i = t[t.length - 1], a = t[0], o;
	for (; e.nodeCount();) {
		for (; o = a.dequeue();) iD(e, t, n, o);
		for (; o = i.dequeue();) iD(e, t, n, o);
		if (e.nodeCount()) {
			for (let i = t.length - 2; i > 0; --i) if (o = t[i]?.dequeue(), o) {
				r = r.concat(iD(e, t, n, o, !0) || []);
				break;
			}
		}
	}
	return r;
}
function iD(e, t, n, r, i) {
	let a = [], o = i ? a : void 0;
	return (e.inEdges(r.v) || []).forEach((r) => {
		let o = e.edge(r), s = e.node(r.v);
		i && a.push({
			v: r.v,
			w: r.w
		}), s.out -= o, oD(t, n, s);
	}), (e.outEdges(r.v) || []).forEach((r) => {
		let i = e.edge(r), a = r.w, o = e.node(a);
		o.in -= i, oD(t, n, o);
	}), e.removeNode(r.v), o;
}
function aD(e, t) {
	let n = new EE(), r = 0, i = 0;
	e.nodes().forEach((e) => {
		n.setNode(e, {
			v: e,
			in: 0,
			out: 0
		});
	}), e.edges().forEach((e) => {
		let a = n.edge(e.v, e.w) || 0, o = t(e), s = a + o;
		n.setEdge(e.v, e.w, s);
		let c = n.node(e.v), l = n.node(e.w);
		i = Math.max(i, c.out += o), r = Math.max(r, l.in += o);
	});
	let a = sD(i + r + 3).map(() => new eD()), o = r + 1;
	return n.nodes().forEach((e) => {
		oD(a, o, n.node(e));
	}), {
		graph: n,
		buckets: a,
		zeroIdx: o
	};
}
function oD(e, t, n) {
	var r, i, a;
	n.out ? n.in ? (a = e[n.out - n.in + t]) == null || a.enqueue(n) : (i = e[e.length - 1]) == null || i.enqueue(n) : (r = e[0]) == null || r.enqueue(n);
}
function sD(e) {
	let t = [];
	for (let n = 0; n < e; n++) t.push(n);
	return t;
}
function cD(e, t) {
	(e.graph().acyclicer === "greedy" ? nD(e, n(e)) : lD(e, t ?? null)).forEach((t) => {
		let n = e.edge(t);
		e.removeEdge(t), n.forwardName = t.name, n.reversed = !0, e.setEdge(t.w, t.v, n, UE("rev"));
	});
	function n(e) {
		return (t) => e.edge(t).weight;
	}
}
function lD(e, t) {
	let n = [], r = {}, i = {};
	function a(t) {
		Object.hasOwn(i, t) || (i[t] = !0, r[t] = !0, e.outEdges(t).forEach((e) => {
			Object.hasOwn(r, e.w) ? n.push(e) : a(e.w);
		}), delete r[t]);
	}
	function o(a) {
		var s;
		Object.hasOwn(i, a) || (i[a] = !0, r[a] = !0, (s = e.outEdges(a)) == null || s.forEach((i) => {
			Object.hasOwn(r, i.w) || t.node(a)?.rank > t.node(i.w)?.rank && dD(e, i.w, i) ? n.push(i) : o(i.w);
		}), delete r[a]);
	}
	let s = a;
	return t && typeof t.node == "function" && (s = o), e.sources().forEach(s), e.nodes().forEach(s), n;
}
function uD(e) {
	e.edges().forEach((t) => {
		let n = e.edge(t);
		if (n.reversed) {
			e.removeEdge(t);
			let r = n.forwardName;
			delete n.reversed, delete n.forwardName, e.setEdge(t.w, t.v, n, r);
		}
	});
}
function dD(e, t, n) {
	let r = /* @__PURE__ */ new Set();
	function i(t) {
		if (e.sources().includes(t)) return !0;
		r.add(t);
		for (let a of e.inEdges(t) ?? []) if ((a.v !== n.v || a.w !== n.w) && !r.has(a.v) && i(a.v)) return !0;
		return !1;
	}
	return i(t);
}
function fD(e) {
	e.graph().dummyChains = [], e.edges().forEach((t) => pD(e, t));
}
function pD(e, t) {
	let n = t.v, r = e.node(n).rank, i = t.w, a = e.node(i).rank, o = t.name, s = e.edge(t), c = s.labelRank;
	if (a === r + 1) return;
	e.removeEdge(t);
	let l, u, d = 0;
	for (++r; r < a; ++d, ++r) s.points = [], u = {
		width: 0,
		height: 0,
		edgeLabel: s,
		edgeObj: t,
		rank: r
	}, l = DE(e, "edge", u, "_d"), r === c && (u.width = s.width, u.height = s.height, u.dummy = "edge-label", u.labelpos = s.labelpos), e.setEdge(n, l, { weight: s.weight }, o), d === 0 && e.graph().dummyChains.push(l), n = l;
	e.setEdge(n, i, { weight: s.weight }, o);
}
function mD(e) {
	e.graph().dummyChains.forEach((t) => {
		let n = e.node(t), r = n.edgeLabel, i;
		for (e.setEdge(n.edgeObj, r); n.dummy;) i = e.successors(t)[0], e.removeNode(t), r.points.push({
			x: n.x,
			y: n.y
		}), n.dummy === "edge-label" && (r.x = n.x, r.y = n.y, r.width = n.width, r.height = n.height), t = i, n = e.node(t);
	});
}
function hD(e) {
	let t = {};
	function n(r) {
		let i = e.node(r);
		if (Object.hasOwn(t, r)) return i.rank;
		t[r] = !0;
		let a = e.outEdges(r), o = a ? a.map((t) => t == null ? Infinity : n(t.w) - e.edge(t).minlen) : [], s = LE(Math.min, o);
		return s === Infinity && (s = 0), i.rank = s;
	}
	e.sources().forEach(n);
}
function gD(e, t) {
	return e.node(t.w).rank - e.node(t.v).rank - e.edge(t).minlen;
}
var _D = vD;
function vD(e) {
	let t = new EE({ directed: !1 }), n = e.nodes();
	if (n.length === 0) throw Error("Graph must have at least one node");
	let r = n[0], i = e.nodeCount();
	t.setNode(r, {});
	let a, o;
	for (; yD(t, e) < i && (a = bD(t, e), a);) o = t.hasNode(a.v) ? gD(e, a) : -gD(e, a), xD(t, e, o);
	return t;
}
function yD(e, t) {
	function n(r) {
		let i = t.nodeEdges(r);
		i && i.forEach((i) => {
			let a = i.v, o = r === a ? i.w : a;
			!e.hasNode(o) && !gD(t, i) && (e.setNode(o, {}), e.setEdge(r, o, {}), n(o));
		});
	}
	return e.nodes().forEach(n), e.nodeCount();
}
function bD(e, t) {
	return t.edges().reduce((n, r) => {
		let i = Infinity;
		return e.hasNode(r.v) !== e.hasNode(r.w) && (i = gD(t, r)), i < n[0] ? [i, r] : n;
	}, [Infinity, null])[1];
}
function xD(e, t, n) {
	e.nodes().forEach((e) => t.node(e).rank += n);
}
var { preorder: SD, postorder: CD } = eE, wD = TD;
TD.initLowLimValues = kD, TD.initCutValues = ED, TD.calcCutValue = OD, TD.leaveEdge = jD, TD.enterEdge = MD, TD.exchangeEdges = ND;
function TD(e) {
	e = OE(e), hD(e);
	let t = _D(e);
	kD(t), ED(t, e);
	let n, r;
	for (; n = jD(t);) r = MD(t, e, n), ND(t, e, n, r);
}
function ED(e, t) {
	let n = CD(e, e.nodes());
	n = n.slice(0, n.length - 1), n.forEach((n) => DD(e, t, n));
}
function DD(e, t, n) {
	let r = e.node(n).parent, i = e.edge(n, r);
	i.cutvalue = OD(e, t, n);
}
function OD(e, t, n) {
	let r = e.node(n).parent, i = !0, a = t.edge(n, r), o = 0;
	a || (i = !1, a = t.edge(r, n)), o = a.weight;
	let s = t.nodeEdges(n);
	return s && s.forEach((a) => {
		let s = a.v === n, c = s ? a.w : a.v;
		if (c !== r) {
			let r = s === i, l = t.edge(a).weight;
			if (o += r ? l : -l, FD(e, n, c)) {
				let t = e.edge(n, c).cutvalue;
				o += r ? -t : t;
			}
		}
	}), o;
}
function kD(e, t) {
	arguments.length < 2 && (t = e.nodes()[0]), AD(e, {}, 1, t);
}
function AD(e, t, n, r, i) {
	let a = n, o = e.node(r);
	t[r] = !0;
	let s = e.neighbors(r);
	return s && s.forEach((i) => {
		Object.hasOwn(t, i) || (n = AD(e, t, n, i, r));
	}), o.low = a, o.lim = n++, i ? o.parent = i : delete o.parent, n;
}
function jD(e) {
	return e.edges().find((t) => e.edge(t).cutvalue < 0);
}
function MD(e, t, n) {
	let r = n.v, i = n.w;
	t.hasEdge(r, i) || (r = n.w, i = n.v);
	let a = e.node(r), o = e.node(i), s = a, c = !1;
	return a.lim > o.lim && (s = o, c = !0), t.edges().filter((t) => c === ID(e, e.node(t.v), s) && c !== ID(e, e.node(t.w), s)).reduce((e, n) => gD(t, n) < gD(t, e) ? n : e);
}
function ND(e, t, n, r) {
	let i = n.v, a = n.w;
	e.removeEdge(i, a), e.setEdge(r.v, r.w, {}), kD(e), ED(e, t), PD(e, t);
}
function PD(e, t) {
	let n = e.nodes().find((t) => !e.node(t).parent);
	if (!n) return;
	let r = SD(e, [n]);
	r = r.slice(1), r.forEach((n) => {
		let r = e.node(n).parent, i = t.edge(n, r), a = !1;
		i || (i = t.edge(r, n), a = !0), t.node(n).rank = t.node(r).rank + (a ? i.minlen : -i.minlen);
	});
}
function FD(e, t, n) {
	return e.hasEdge(t, n);
}
function ID(e, t, n) {
	return n.low <= t.lim && t.lim <= n.lim;
}
var LD = RD;
function RD(e) {
	let t = e.graph().ranker;
	if (typeof t == "function") return t(e);
	switch (t) {
		case "network-simplex":
			VD(e);
			break;
		case "tight-tree":
			BD(e);
			break;
		case "longest-path":
			zD(e);
			break;
		case "none": break;
		default: VD(e);
	}
}
var zD = hD;
function BD(e) {
	hD(e), _D(e);
}
function VD(e) {
	wD(e);
}
var HD = UD;
function UD(e) {
	let t = GD(e), n = e.graph();
	Array.isArray(n.dummyChains) && n.dummyChains.forEach((n) => {
		let r = e.node(n), i = r.edgeObj, a = WD(e, t, i.v, i.w), o = a.path, s = a.lca, c = 0, l = o[c], u = !0;
		for (; n !== i.w;) {
			if (r = e.node(n), u) {
				for (; (l = o[c]) !== s && e.node(l).maxRank < r.rank;) c++;
				l === s && (u = !1);
			}
			if (!u) {
				for (; c < o.length - 1 && e.node(o[c + 1]).minRank <= r.rank;) c++;
				l = o[c];
			}
			l !== void 0 && e.setParent(n, l), n = e.successors(n)[0];
		}
	});
}
function WD(e, t, n, r) {
	let i = [], a = [], o = Math.min(t[n].low, t[r].low), s = Math.max(t[n].lim, t[r].lim), c;
	c = n;
	do
		c = e.parent(c), i.push(c);
	while (c && (t[c].low > o || s > t[c].lim));
	let l = c, u = r;
	for (; (u = e.parent(u)) !== l;) a.push(u);
	return {
		path: i.concat(a.reverse()),
		lca: l
	};
}
function GD(e) {
	let t = {}, n = 0;
	function r(i) {
		let a = n;
		e.children(i).forEach(r), t[i] = {
			low: a,
			lim: n++
		};
	}
	return e.children(JE).forEach(r), t;
}
function KD(e) {
	let t = DE(e, "root", {}, "_root"), n = JD(e), r = Object.values(n), i = LE(Math.max, r) - 1, a = 2 * i + 1;
	e.graph().nestingRoot = t, e.edges().forEach((t) => e.edge(t).minlen *= a);
	let o = YD(e) + 1;
	e.children(JE).forEach((r) => {
		qD(e, t, a, o, i, n, r);
	}), e.graph().nodeRankFactor = a;
}
function qD(e, t, n, r, i, a, o) {
	let s = e.children(o);
	if (!s.length) {
		o !== t && e.setEdge(t, o, {
			weight: 0,
			minlen: n
		});
		return;
	}
	let c = PE(e, "_bt"), l = PE(e, "_bb"), u = e.node(o);
	e.setParent(c, o), u.borderTop = c, e.setParent(l, o), u.borderBottom = l, s.forEach((s) => {
		qD(e, t, n, r, i, a, s);
		let u = e.node(s), d = u.borderTop ? u.borderTop : s, f = u.borderBottom ? u.borderBottom : s, p = u.borderTop ? r : 2 * r, m = d === f ? i - (a[o] ?? 0) + 1 : 1;
		e.setEdge(c, d, {
			weight: p,
			minlen: m,
			nestingEdge: !0
		}), e.setEdge(f, l, {
			weight: p,
			minlen: m,
			nestingEdge: !0
		});
	}), e.parent(o) || e.setEdge(t, c, {
		weight: 0,
		minlen: i + (a[o] ?? 0)
	});
}
function JD(e) {
	let t = {};
	function n(r, i) {
		let a = e.children(r);
		a && a.length && a.forEach((e) => n(e, i + 1)), t[r] = i;
	}
	return e.children(JE).forEach((e) => n(e, 1)), t;
}
function YD(e) {
	return e.edges().reduce((t, n) => t + e.edge(n).weight, 0);
}
function XD(e) {
	let t = e.graph();
	e.removeNode(t.nestingRoot), delete t.nestingRoot, e.edges().forEach((t) => {
		e.edge(t).nestingEdge && e.removeEdge(t);
	});
}
var ZD = QD;
function QD(e) {
	function t(n) {
		let r = e.children(n), i = e.node(n);
		if (r.length && r.forEach(t), i && Object.hasOwn(i, "minRank")) {
			i.borderLeft = [], i.borderRight = [];
			for (let t = i.minRank, r = i.maxRank + 1; t < r; ++t) $D(e, "borderLeft", "_bl", n, i, t), $D(e, "borderRight", "_br", n, i, t);
		}
	}
	e.children(JE).forEach(t);
}
function $D(e, t, n, r, i, a) {
	let o = {
		width: 0,
		height: 0,
		rank: a,
		borderType: t
	}, s = i[t][a - 1], c = DE(e, "border", o, n);
	i[t][a] = c, e.setParent(c, r), s && e.setEdge(s, c, { weight: 1 });
}
function eO(e) {
	let t = e.graph().rankdir?.toLowerCase();
	(t === "lr" || t === "rl") && nO(e);
}
function tO(e) {
	let t = e.graph().rankdir?.toLowerCase();
	(t === "bt" || t === "rl") && iO(e), (t === "lr" || t === "rl") && (oO(e), nO(e));
}
function nO(e) {
	e.nodes().forEach((t) => rO(e.node(t))), e.edges().forEach((t) => rO(e.edge(t)));
}
function rO(e) {
	let t = e.width;
	e.width = e.height, e.height = t;
}
function iO(e) {
	e.nodes().forEach((t) => aO(e.node(t))), e.edges().forEach((t) => {
		var n;
		let r = e.edge(t);
		(n = r.points) == null || n.forEach(aO), Object.hasOwn(r, "y") && aO(r);
	});
}
function aO(e) {
	e.y = -e.y;
}
function oO(e) {
	e.nodes().forEach((t) => sO(e.node(t))), e.edges().forEach((t) => {
		var n;
		let r = e.edge(t);
		(n = r.points) == null || n.forEach(sO), Object.hasOwn(r, "x") && sO(r);
	});
}
function sO(e) {
	let t = e.x;
	e.x = e.y, e.y = t;
}
function cO(e, t = null) {
	let n = {}, r = e.nodes().filter((t) => !e.children(t).length), i = r.map((t) => e.node(t).rank), a = WE(LE(Math.max, i) + 1).map(() => []);
	function o(t) {
		if (n[t]) return;
		n[t] = !0;
		let r = e.node(t);
		a[r.rank].push(t);
		let i = e.successors(t);
		i && [...i].sort((e, t) => s(e, t)).forEach(o);
	}
	r.sort((t, n) => e.node(t).rank - e.node(n).rank).forEach(o);
	function s(n, r) {
		return YE(t, e.node(n), e.node(r));
	}
	return a;
}
function lO(e, t) {
	let n = 0;
	for (let r = 1; r < t.length; ++r) n += uO(e, t[r - 1], t[r]);
	return n;
}
function uO(e, t, n) {
	let r = qE(n, n.map((e, t) => t)), i = t.flatMap((t) => {
		let n = e.outEdges(t);
		return n ? n.map((t) => ({
			pos: r[t.w],
			weight: e.edge(t).weight
		})).sort((e, t) => e.pos - t.pos) : [];
	}), a = 1;
	for (; a < n.length;) a <<= 1;
	let o = 2 * a - 1;
	--a;
	let s = Array(o).fill(0), c = 0;
	return i.forEach((e) => {
		let t = e.pos + a;
		s[t] += e.weight;
		let n = 0;
		for (; t > 0;) t % 2 && (n += s[t + 1]), t = t - 1 >> 1, s[t] += e.weight;
		c += e.weight * n;
	}), c;
}
function dO(e, t = []) {
	return t.map((t) => {
		let n = e.inEdges(t);
		if (!n || !n.length) return { v: t };
		{
			let r = n.reduce((t, n) => {
				let r = e.edge(n), i = e.node(n.v);
				return {
					sum: t.sum + r.weight * i.order,
					weight: t.weight + r.weight
				};
			}, {
				sum: 0,
				weight: 0
			});
			return {
				v: t,
				barycenter: r.sum / r.weight,
				weight: r.weight
			};
		}
	});
}
function fO(e, t) {
	let n = {};
	return e.forEach((e, t) => {
		let r = {
			indegree: 0,
			in: [],
			out: [],
			vs: [e.v],
			i: t
		};
		e.barycenter !== void 0 && (r.barycenter = e.barycenter, r.weight = e.weight), n[e.v] = r;
	}), t.edges().forEach((e) => {
		let t = n[e.v], r = n[e.w];
		t !== void 0 && r !== void 0 && (r.indegree++, t.out.push(r));
	}), pO(Object.values(n).filter((e) => !e.indegree));
}
function pO(e) {
	let t = [];
	function n(e) {
		return (t) => {
			t.merged || (t.barycenter === void 0 || e.barycenter === void 0 || t.barycenter >= e.barycenter) && mO(e, t);
		};
	}
	function r(t) {
		return (n) => {
			n.in.push(t), --n.indegree === 0 && e.push(n);
		};
	}
	for (; e.length;) {
		let i = e.pop();
		t.push(i), i.in.reverse().forEach(n(i)), i.out.forEach(r(i));
	}
	return t.filter((e) => !e.merged).map((e) => GE(e, [
		"vs",
		"i",
		"barycenter",
		"weight"
	]));
}
function mO(e, t) {
	let n = 0, r = 0;
	e.weight && (n += e.barycenter * e.weight, r += e.weight), t.weight && (n += t.barycenter * t.weight, r += t.weight), e.vs = t.vs.concat(e.vs), e.barycenter = n / r, e.weight = r, e.i = Math.min(t.i, e.i), t.merged = !0;
}
function hO(e, t, n, r, i) {
	let a = {}, o = null, s = null, c = i;
	typeof t == "boolean" ? (c = t, a = {}) : t && (a = t, o = n ?? null, s = r ?? null);
	let l = zE(e, (e) => Object.hasOwn(e, "barycenter")), u = l.lhs, d = l.rhs.sort((e, t) => t.i - e.i), f = [], p = 0, m = 0, h = 0;
	u.sort(_O(s, o, !!c));
	for (let [e, t] of Object.entries(a)) {
		let n = u.findIndex((t) => t.vs[0] === e);
		u.splice(n + 1, 0, t);
	}
	h = gO(f, d, h), u.forEach((e) => {
		h += e.vs.length, f.push(e.vs), p += e.barycenter * e.weight, m += e.weight, h = gO(f, d, h);
	});
	let g = { vs: f.flat(1) };
	return m && (g.barycenter = p / m, g.weight = m), g;
}
function gO(e, t, n) {
	let r;
	for (; t.length && (r = t[t.length - 1]).i <= n;) t.pop(), e.push(r.vs), n++;
	return n;
}
function _O(e, t, n) {
	return (r, i) => {
		if (r.barycenter < i.barycenter) return -1;
		if (r.barycenter > i.barycenter) return 1;
		if (e && (typeof r.vs[0] == "string" || typeof i.vs[0] == "string")) {
			let n = YE(t, e.node(r.vs[0]), e.node(i.vs[0]));
			if (n !== 0) return n;
		}
		return n ? i.i - r.i : r.i - i.i;
	};
}
function vO(e, t, n, r, i) {
	var a, o;
	let s = null, c = i;
	typeof r == "boolean" ? (c = r, s = null) : r !== void 0 && (s = r);
	let l = e.children(t), u = e.node(t), d = u ? u.borderLeft : void 0, f = u ? u.borderRight : void 0, p = {};
	d && (l = l.filter((e) => e !== d && e !== f));
	let m = dO(e, l);
	m.forEach((t) => {
		if (e.children(t.v).length) {
			let { result: r } = vO(e, t.v, n, s, c);
			p[t.v] = r, Object.hasOwn(r, "barycenter") && bO(t, r);
		}
	});
	let h = fO(m, n);
	yO(h, p);
	let g = {}, _ = !1;
	for (let t = 0; t < h.length; t++) for (let n = t + 1; n < h.length; n++) if (h[t] && h[n] && (a = h[t]) != null && a.barycenter && (o = h[n]) != null && o.barycenter && h[t]?.barycenter === h[n].barycenter) {
		let r = h[t]?.vs[0] ?? "", i = h[n]?.vs[0] ?? "", a = e.node(r), o = e.node(i);
		if (a.dummy === "edge" && o.dummy === "edge" && a.edgeObj?.v === o.edgeObj?.v && a.edgeObj?.w === o.edgeObj?.w) {
			if (a.edgeLabel.reversed) {
				g[i] = h[t], h.splice(t, 1), t--;
				break;
			}
			g[r] || (g[r] = h[n], h.splice(n, 1), n--);
		} else _ = !0;
	}
	let v = hO(h, g, s, e, c);
	if (d && f) {
		v.vs = [
			d,
			v.vs,
			f
		].flat(1);
		let t = e.predecessors(d);
		if (t && t.length) {
			let n = e.node(t[0]), r = e.predecessors(f), i = e.node(r[0]);
			Object.hasOwn(v, "barycenter") || (v.barycenter = 0, v.weight = 0), v.barycenter = (v.barycenter * v.weight + n.order + i.order) / (v.weight + 2), v.weight += 2;
		}
	}
	return Object.defineProperty(v, "result", {
		value: v,
		enumerable: !1,
		configurable: !0,
		writable: !0
	}), Object.defineProperty(v, "usedBias", {
		value: _,
		enumerable: !1,
		configurable: !0,
		writable: !0
	}), v;
}
function yO(e, t) {
	e.forEach((e) => {
		e.vs = e.vs.flatMap((e) => t[e] ? t[e].vs : e);
	});
}
function bO(e, t) {
	e.barycenter === void 0 ? (e.barycenter = t.barycenter, e.weight = t.weight) : (e.barycenter = (e.barycenter * e.weight + t.barycenter * t.weight) / (e.weight + t.weight), e.weight += t.weight);
}
function xO(e, t, n, r) {
	r || (r = e.nodes());
	let i = SO(e), a = new EE({ compound: !0 }).setGraph({ root: i }).setDefaultNodeLabel((t) => e.node(t));
	return r.forEach((r) => {
		let o = e.node(r), s = e.parent(r);
		if (o.rank === t || o.minRank <= t && t <= o.maxRank) {
			a.setNode(r), a.setParent(r, s || i);
			let c = e[n](r);
			c && c.forEach((t) => {
				let n = t.v === r ? t.w : t.v, i = a.edge(n, r), o = i === void 0 ? 0 : i.weight;
				a.setEdge(n, r, { weight: e.edge(t).weight + o });
			}), Object.hasOwn(o, "minRank") && a.setNode(r, {
				borderLeft: o.borderLeft[t],
				borderRight: o.borderRight[t]
			});
		}
	}), a;
}
function SO(e) {
	let t;
	for (; e.hasNode(t = UE("_root")););
	return t;
}
function CO(e, t, n) {
	let r = {}, i;
	n.forEach((n) => {
		let a = e.parent(n), o, s;
		for (; a;) {
			if (o = e.parent(a), o ? (s = r[o], r[o] = a) : (s = i, i = a), s && s !== a) {
				t.setEdge(s, a);
				return;
			}
			a = o;
		}
	});
}
function wO(e, t = {}, n = null) {
	if (typeof t.customOrder == "function") {
		t.customOrder(e, wO);
		return;
	}
	let r = RE(e), i = TO(e, WE(1, r + 1), "inEdges"), a = TO(e, WE(r - 1, -1, -1), "outEdges"), o = cO(e, n);
	if (DO(e, o), t.disableOptimalOrderHeuristic) return;
	let s = Infinity, c, l = t.constraints || [];
	for (let t = 0, r = 0; r < 4; ++t, ++r) {
		EO(t % 2 ? i : a, t % 4 >= 2, l, n), o = jE(e);
		let u = lO(e, o);
		u < s ? (r = 0, c = Object.assign({}, o), s = u) : u === s && (c = structuredClone(o));
	}
	DO(e, c);
}
function TO(e, t, n) {
	let r = /* @__PURE__ */ new Map(), i = (e, t) => {
		r.has(e) || r.set(e, []), r.get(e).push(t);
	};
	for (let t of e.nodes()) {
		let n = e.node(t);
		if (typeof n.rank == "number" && i(n.rank, t), typeof n.minRank == "number" && typeof n.maxRank == "number") for (let e = n.minRank; e <= n.maxRank; e++) e !== n.rank && i(e, t);
	}
	return t.map(function(t) {
		return xO(e, t, n, r.get(t) || []);
	});
}
function EO(e, t, n, r) {
	let i = !0, a = new EE();
	e.forEach(function(e) {
		n.forEach((e) => a.setEdge(e.left, e.right));
		let o = e.graph().root, { result: s, usedBias: c } = vO(e, o, a, r, i);
		t && c && (i = !i), s.vs.forEach((t, n) => e.node(t).order = n), CO(e, a, s.vs);
	});
}
function DO(e, t) {
	Object.values(t).forEach((t) => t.forEach((t, n) => e.node(t).order = n));
}
function OO(e, t) {
	let n = {};
	function r(t, r) {
		let i = 0, a = 0, o = t.length, s = r[r.length - 1];
		return r.forEach((t, c) => {
			let l = AO(e, t), u = l ? e.node(l).order : o;
			(l || t === s) && (r.slice(a, c + 1).forEach((t) => {
				let r = e.predecessors(t);
				r && r.forEach((r) => {
					let a = e.node(r), o = a.order;
					(o < i || u < o) && !(a.dummy && e.node(t).dummy) && jO(n, r, t);
				});
			}), a = c + 1, i = u);
		}), r;
	}
	return t.length && t.reduce(r), n;
}
function kO(e, t) {
	let n = {};
	function r(t) {
		return e.node(t)?.dummy === "border";
	}
	if (!e.nodes().some(r)) return n;
	function i(t, r, i, a, o) {
		WE(r, i).forEach((r) => {
			let i = t[r];
			if (i !== void 0 && e.node(i).dummy) {
				let t = e.predecessors(i);
				t && t.forEach((t) => {
					if (t === void 0) return;
					let r = e.node(t);
					r.dummy && (r.order < a || r.order > o) && jO(n, t, i);
				});
			}
		});
	}
	function a(t, n) {
		let a = -1, o = -1, s = 0;
		return n.forEach((c, l) => {
			if (r(c)) {
				let t = e.predecessors(c);
				if (t && t.length) {
					let r = t[0];
					if (r === void 0) return;
					o = e.node(r).order, i(n, s, l, a, o), s = l, a = o;
				}
			}
			i(n, s, n.length, o, t.length);
		}), n;
	}
	return t.length && t.reduce(a), n;
}
function AO(e, t) {
	if (e.node(t).dummy) {
		let n = e.predecessors(t);
		if (n) return n.find((t) => e.node(t).dummy);
	}
}
function jO(e, t, n) {
	if (t > n) {
		let e = t;
		t = n, n = e;
	}
	let r = e[t];
	r || (e[t] = r = {}), r[n] = !0;
}
function MO(e, t, n) {
	if (t > n) {
		let e = t;
		t = n, n = e;
	}
	let r = e[t];
	return r !== void 0 && Object.hasOwn(r, n);
}
function NO(e, t, n, r, i) {
	let a = {}, o = {}, s = {};
	return t.forEach((e) => {
		e.forEach((e, t) => {
			a[e] = e, o[e] = e, s[e] = t;
		});
	}), t.forEach((t) => {
		let c = -1, l = -1, u = !1, d = t, f = t.findIndex((t) => i?.includes(t) || HO(t, e, i));
		f > 0 && (d = [
			t[f],
			...t.slice(0, f),
			...t.slice(f + 1)
		], u = !0), d.forEach((t) => {
			let d = r(t);
			if (d && d.length) {
				i != null && i.includes(t) && (d = d.filter((t) => HO(t, e, i)));
				let r = d.sort((e, t) => {
					let n = s[e], r = s[t];
					return (n === void 0 ? 0 : n) - (r === void 0 ? 0 : r);
				}), f = (r.length - 1) / 2;
				for (let e = Math.floor(f), i = Math.ceil(f); e <= i; ++e) {
					let i = r[e];
					if (i === void 0) continue;
					let d = s[i];
					if (d !== void 0 && o[t] === t && c < d && s[i] !== l && !MO(n, t, i)) {
						let e = a[i];
						e !== void 0 && (o[i] = t, o[t] = a[t] = e, c = d, u && (c = -1, l = s[i] ?? -1, u = !1));
					}
				}
			}
		});
	}), {
		root: a,
		align: o
	};
}
function PO(e, t, n, r, i = !1) {
	let a = {}, o = FO(e, t, n, i), s = i ? "borderLeft" : "borderRight";
	function c(e, t) {
		let n = o.nodes().slice(), r = {}, i = n.pop();
		for (; i;) {
			if (r[i]) e(i);
			else {
				r[i] = !0, n.push(i);
				for (let e of t(i)) n.push(e);
			}
			i = n.pop();
		}
	}
	function l(e) {
		let t = o.inEdges(e);
		t ? a[e] = t.reduce((e, t) => {
			let n = a[t.v] ?? 0, r = o.edge(t);
			return Math.max(e, n + (r === void 0 ? 0 : r));
		}, 0) : a[e] = 0;
	}
	function u(t) {
		let n = o.outEdges(t), r = Infinity;
		n && (r = n.reduce((e, t) => {
			let n = a[t.w], r = o.edge(t);
			return Math.min(e, (n === void 0 ? 0 : n) - (r === void 0 ? 0 : r));
		}, Infinity));
		let i = e.node(t);
		r !== Infinity && i.borderType !== s && (a[t] = Math.max(a[t] === void 0 ? 0 : a[t], r));
	}
	function d(e) {
		return o.predecessors(e) || [];
	}
	function f(e) {
		return o.successors(e) || [];
	}
	return c(l, d), c(u, f), Object.keys(r).forEach((e) => {
		let t = n[e];
		t !== void 0 && (a[e] = a[t] ?? 0);
	}), a;
}
function FO(e, t, n, r) {
	let i = new EE(), a = e.graph(), o = BO(a.nodesep, a.edgesep, r);
	return t.forEach((t) => {
		let r;
		t.forEach((t) => {
			let a = n[t];
			if (a !== void 0) {
				if (i.setNode(a), r !== void 0) {
					let s = n[r];
					if (s !== void 0) {
						let n = i.edge(s, a);
						i.setEdge(s, a, Math.max(o(e, t, r), n || 0));
					}
				}
				r = t;
			}
		});
	}), i;
}
function IO(e, t) {
	return Object.values(t).reduce((t, n) => {
		let r = -Infinity, i = Infinity;
		Object.entries(n).forEach(([t, n]) => {
			let a = VO(e, t) / 2;
			r = Math.max(n + a, r), i = Math.min(n - a, i);
		});
		let a = r - i;
		return a < t[0] && (t = [a, n]), t;
	}, [Infinity, null])[1];
}
function LO(e, t) {
	let n = Object.values(t), r = LE(Math.min, n), i = LE(Math.max, n);
	["u", "d"].forEach((n) => {
		["l", "r"].forEach((a) => {
			let o = n + a, s = e[o];
			if (!s || s === t) return;
			let c = Object.values(s), l = r - LE(Math.min, c);
			a !== "l" && (l = i - LE(Math.max, c)), l && (e[o] = KE(s, (e) => e + l));
		});
	});
}
function RO(e, t = void 0) {
	let n = e.ul;
	return n ? KE(n, (n, r) => {
		if (t) {
			let n = e[t.toLowerCase()];
			if (n && n[r] !== void 0) return n[r];
		}
		let i = Object.values(e).map((e) => {
			let t = e[r];
			return t === void 0 ? 0 : t;
		}).sort((e, t) => e - t);
		return ((i[1] ?? 0) + (i[2] ?? 0)) / 2;
	}) : {};
}
function zO(e, t) {
	let n = jE(e), r = Object.assign(OO(e, n), kO(e, n)), i = {}, a;
	return ["u", "d"].forEach((o) => {
		a = o === "u" ? n : Object.values(n).reverse(), ["l", "r"].forEach((n) => {
			n === "r" && (a = a.map((e) => Object.values(e).reverse()));
			let s = NO(e, a, r, (t) => (o === "u" ? e.predecessors(t) : e.successors(t)) || [], t), c = PO(e, a, s.root, s.align, n === "r");
			n === "r" && (c = KE(c, (e) => -e)), i[o + n] = c;
		});
	}), LO(i, IO(e, i)), RO(i, e.graph().align);
}
function BO(e, t, n) {
	return (r, i, a) => {
		let o = r.node(i), s = r.node(a), c = 0, l;
		if (c += o.width / 2, Object.hasOwn(o, "labelpos")) switch (o.labelpos.toLowerCase()) {
			case "l":
				l = -o.width / 2;
				break;
			case "r": l = o.width / 2;
		}
		if (l && (c += n ? l : -l), l = void 0, c += (o.dummy ? t : e) / 2, c += (s.dummy ? t : e) / 2, c += s.width / 2, Object.hasOwn(s, "labelpos")) switch (s.labelpos.toLowerCase()) {
			case "l":
				l = s.width / 2;
				break;
			case "r": l = -s.width / 2;
		}
		return l && (c += n ? l : -l), c;
	};
}
function VO(e, t) {
	return e.node(t).width;
}
function HO(e, t, n) {
	if (!n) return !1;
	let r = t.node(e)?.edgeObj;
	if (!r || t.node(e).edgeLabel.reversed) return !1;
	let i = n.indexOf(r?.v), a = n.indexOf(r?.w);
	return i !== -1 && a !== -1 && i === (a + 1) % n.length || i === (a - 1) % n.length;
}
function UO(e, t) {
	e = kE(e), WO(e), Object.entries(zO(e, t)).forEach(([t, n]) => e.node(t).x = n);
}
function WO(e) {
	let t = jE(e), n = e.graph(), r = n.ranksep, i = n.rankalign, a = 0;
	t.forEach((t) => {
		let n = t.reduce((t, n) => {
			let r = e.node(n).height ?? 0;
			return t > r ? t : r;
		}, 0);
		t.forEach((t) => {
			let r = e.node(t);
			r.y = i === "top" ? a + r.height / 2 : i === "bottom" ? a + n - r.height / 2 : a + n / 2;
		}), a += n + r;
	});
}
var GO = /* @__PURE__ */ new WeakMap();
function KO(e, t = {}) {
	return JO(e, VE, t), e;
}
function qO(e, t, n) {
	let r = t;
	for (; r !== void 0;) {
		let t = e.parent(r);
		if (t === n) return r;
		r = t;
	}
}
function JO(e, t, n) {
	let r = e.nodes().filter((t) => e.children(t).length), i = {};
	r.forEach((r) => {
		let a = e.node(r);
		if (a && a.rankdir) {
			let o = new EE({
				multigraph: !0,
				compound: !0
			});
			o.setGraph({ rankdir: a.rankdir });
			let s = e.children(r);
			s.forEach((t) => {
				let n = { ...e.node(t) };
				o.setNode(t, n);
				let i = e.parent(t);
				i && i !== r && s.includes(i) && o.setParent(t, i);
			});
			let c = /* @__PURE__ */ new Set();
			e.edges().forEach((t) => {
				let n = qO(e, t.v, r), i = qO(e, t.w, r);
				if (n === t.v && i === t.w) o.setEdge(t, { ...e.edge(t) });
				else if (n && i && n !== i) {
					let r = `${n}\0${i}`;
					c.has(r) || (c.add(r), o.setEdge(n, i, { ...e.edge(t) }));
				}
			}), JO(o, t, n);
			let l = ok(o);
			XO(l, t, n, null), ZO(o, l);
			let u = 1 / 0, d = 1 / 0, f = -1 / 0, p = -1 / 0;
			o.nodes().forEach((e) => {
				if (e === r) return;
				let t = o.node(e);
				t && typeof t.x == "number" && typeof t.y == "number" && typeof t.width == "number" && typeof t.height == "number" && (u = Math.min(u, t.x - t.width / 2), f = Math.max(f, t.x + t.width / 2), d = Math.min(d, t.y - t.height / 2), p = Math.max(p, t.y + t.height / 2));
			}), isFinite(u) && isFinite(d) && isFinite(f) && isFinite(p) || (u = d = 0, f = p = 0);
			let m = f - u, h = p - d;
			i[r] = {
				minX: u,
				minY: d,
				maxX: f,
				maxY: p,
				width: m,
				height: h,
				offsetX: u,
				offsetY: d
			}, a._dagreClusterSubgraph = o;
		}
	});
	let a = [], o = (t) => {
		let n = [], r = (e.children(t) || []).filter((e) => e !== t);
		for (; r.length > 0;) {
			let t = r.shift();
			n.push(t), (e.children(t) || []).filter((e) => e !== t).forEach((e) => r.push(e));
		}
		return n;
	}, s = /* @__PURE__ */ new Map();
	r.forEach((t) => {
		let n = e.node(t);
		n && n.rankdir && i[t] && s.set(t, (e.children(t) || []).filter((e) => e !== t));
	});
	let c = new Set([...s.values()].flat()), l = /* @__PURE__ */ new Map();
	s.forEach((e, t) => {
		c.has(t) || l.set(t, o(t));
	});
	let u = new Set([...l.values()].flat()), d = (e) => {
		for (let [t, n] of l) if (n.includes(e)) return t;
		return e;
	}, f = [];
	e.edges().forEach((t) => {
		(u.has(t.v) || u.has(t.w)) && f.push({
			edge: t,
			label: e.edge(t)
		});
	});
	let p = /* @__PURE__ */ new Map();
	u.forEach((t) => {
		let n = e.parent(t);
		p.set(t, typeof n == "string" ? n : void 0);
	}), l.forEach((t, n) => {
		let r = e.node(n), o = [];
		t.forEach((t) => {
			let n = e.node(t);
			n && (o.push({
				id: t,
				node: n,
				parent: p.get(t)
			}), e.removeNode(t));
		});
		let s = f.filter(({ edge: e }) => t.includes(e.v) || t.includes(e.w)), c = i[n];
		r && (a.push({
			clusterId: n,
			subgraph: r._dagreClusterSubgraph,
			bounds: c,
			children: t,
			removedNodes: o,
			removedEdges: s
		}), r.width = c.width, r.height = c.height);
	});
	let m = /* @__PURE__ */ new Set();
	f.forEach(({ edge: t, label: n }) => {
		let r = d(t.v), i = d(t.w);
		if (r !== i && e.hasNode(r) && e.hasNode(i)) {
			let t = `${r}\0${i}`;
			m.has(t) || (m.add(t), e.setEdge(r, i, {
				...n,
				width: 0,
				height: 0
			}));
		}
	});
	let h = ok(e), g = XO(h, t, n, GO.get(e) ?? null);
	GO.set(e, g), ZO(e, h), m.forEach((t) => {
		let n = t.indexOf("\0"), r = t.slice(0, n), i = t.slice(n + 1);
		e.hasEdge(r, i) && e.removeEdge(r, i);
	}), a.forEach(({ clusterId: t, subgraph: n, bounds: r, removedNodes: i, removedEdges: a }) => {
		let o = e.node(t), s = o?.x ?? 0, c = o?.y ?? 0, l = (r.minX + r.maxX) / 2, u = (r.minY + r.maxY) / 2;
		i.forEach(({ id: t, node: n, parent: r }) => {
			e.setNode(t, n), r !== void 0 && e.setParent(t, r);
		}), a.forEach(({ edge: t, label: n }) => {
			e.setEdge(t, n);
		}), n.nodes().forEach((r) => {
			if (r === t) return;
			let i = n.node(r), a = e.node(r);
			a && i && typeof i.x == "number" && typeof i.y == "number" && (a.x = s + (i.x - l), a.y = c + (i.y - u));
		}), YO(e, n, s - l, c - u), delete o._dagreClusterSubgraph;
	}), r.forEach((t) => {
		let n = e.node(t), r = i[t];
		if (n && n.rankdir && n._dagreClusterSubgraph && r) {
			let i = n._dagreClusterSubgraph, a = n.x ?? 0, o = n.y ?? 0, s = (r.minX + r.maxX) / 2, c = (r.minY + r.maxY) / 2;
			i.nodes().forEach((n) => {
				if (n === t) return;
				let r = i.node(n), l = e.node(n);
				if (l && r && typeof r.x == "number" && typeof r.y == "number") {
					let e = r.x - s, t = r.y - c;
					l.x = a + e, l.y = o + t;
				}
			}), YO(e, i, a - s, o - c), delete n._dagreClusterSubgraph;
		}
	});
}
function YO(e, t, n, r) {
	t.edges().forEach((i) => {
		if (!e.hasEdge(i)) return;
		let a = t.edge(i), o = e.edge(i);
		o.points = a.points.map((e) => ({
			x: e.x + n,
			y: e.y + r
		})), Object.hasOwn(a, "x") && (o.x = a.x + n, o.y = a.y + r);
	});
}
function XO(e, t, n, r = null) {
	var i, a;
	let o = n?.useDynamic !== !1, s = o && (i = r?.graph) != null ? i : null, c = o && (a = r?.rawNodes) != null ? a : null;
	t("    makeSpaceForEdgeLabels", () => sk(e)), t("    removeSelfEdges", () => gk(e)), t("    acyclic", () => cD(e, s)), t("    nestingGraph.run", () => KD(e)), t("    rank", () => LD(kE(e))), t("    injectEdgeLabelProxies", () => ck(e)), t("    removeEmptyRanks", () => NE(e)), t("    nestingGraph.cleanup", () => XD(e)), t("    normalizeRanks", () => ME(e)), t("    assignRankMinMax", () => lk(e)), t("    removeEdgeLabelProxies", () => uk(e)), t("    normalize.run", () => fD(e)), t("    parentDummyChains", () => HD(e)), t("    addBorderSegments", () => ZD(e)), t("    order", () => wO(e, n, c)), t("    insertSelfEdges", () => _k(e)), t("    adjustCoordinateSystem", () => eO(e)), t("    position", () => UO(e, n.corePath)), t("    positionSelfEdges", () => vk(e));
	let l = JSON.parse(JSON.stringify(e._nodes));
	return t("    removeBorderNodes", () => hk(e)), t("    normalize.undo", () => mD(e)), t("    fixupEdgeLabelCoords", () => pk(e)), t("    undoCoordinateSystem", () => tO(e)), t("    translateGraph", () => dk(e)), t("    assignNodeIntersects", () => fk(e)), t("    reversePoints", () => mk(e)), t("    acyclic.undo", () => uD(e)), {
		graph: e,
		rawNodes: l
	};
}
function ZO(e, t) {
	e.nodes().forEach((n) => {
		let r = e.node(n), i = t.node(n);
		r && (r.x = i.x, r.y = i.y, r.order = i.order, r.rank = i.rank, t.children(n).length && (r.width = i.width, r.height = i.height));
	}), e.edges().forEach((n) => {
		let r = e.edge(n), i = t.edge(n);
		r.points = i.points, Object.hasOwn(i, "x") && (r.x = i.x, r.y = i.y);
	}), e.graph().width = t.graph().width, e.graph().height = t.graph().height;
}
var QO = [
	"nodesep",
	"edgesep",
	"ranksep",
	"marginx",
	"marginy"
], $O = {
	ranksep: 50,
	edgesep: 20,
	nodesep: 50,
	rankdir: "TB",
	rankalign: "center"
}, ek = [
	"acyclicer",
	"ranker",
	"rankdir",
	"align",
	"rankalign"
], tk = [
	"width",
	"height",
	"rank"
], nk = {
	width: 0,
	height: 0
}, rk = [
	"minlen",
	"weight",
	"width",
	"height",
	"labeloffset"
], ik = {
	minlen: 1,
	weight: 1,
	width: 0,
	height: 0,
	labeloffset: 10,
	labelpos: "r"
}, ak = ["labelpos"];
function ok(e) {
	let t = new EE({
		multigraph: !0,
		compound: !0
	}), n = bk(e.graph());
	return t.setGraph(Object.assign({}, $O, yk(n, QO), GE(n, ek))), e.nodes().forEach((n) => {
		let r = yk(bk(e.node(n)), tk);
		Object.keys(nk).forEach((e) => {
			r[e] === void 0 && (r[e] = nk[e]);
		}), t.setNode(n, r);
		let i = e.parent(n);
		i !== void 0 && t.setParent(n, i);
	}), e.edges().forEach((n) => {
		let r = bk(e.edge(n));
		t.setEdge(n, Object.assign({}, ik, yk(r, rk), GE(r, ak)));
	}), t;
}
function sk(e) {
	let t = e.graph();
	t.ranksep /= 2, e.edges().forEach((n) => {
		let r = e.edge(n);
		r.minlen *= 2, (r.labelpos ?? "r").toLowerCase() !== "c" && (t.rankdir === "TB" || t.rankdir === "BT" ? r.width += r.labeloffset : r.height += r.labeloffset);
	});
}
function ck(e) {
	e.edges().forEach((t) => {
		let n = e.edge(t);
		if (n.width && n.height) {
			let n = e.node(t.v);
			DE(e, "edge-proxy", {
				rank: (e.node(t.w).rank - n.rank) / 2 + n.rank,
				e: t
			}, "_ep");
		}
	});
}
function lk(e) {
	let t = 0;
	e.nodes().forEach((n) => {
		let r = e.node(n);
		r.borderTop && (r.minRank = e.node(r.borderTop).rank, r.maxRank = e.node(r.borderBottom).rank, t = Math.max(t, r.maxRank));
	}), e.graph().maxRank = t;
}
function uk(e) {
	e.nodes().forEach((t) => {
		let n = e.node(t);
		if (n.dummy === "edge-proxy") {
			let r = n;
			e.edge(r.e).labelRank = n.rank, e.removeNode(t);
		}
	});
}
function dk(e) {
	let t = Infinity, n = 0, r = Infinity, i = 0, a = e.graph(), o = a.marginx || 0, s = a.marginy || 0;
	function c(e) {
		let a = e.x, o = e.y, s = e.width, c = e.height;
		t = Math.min(t, a - s / 2), n = Math.max(n, a + s / 2), r = Math.min(r, o - c / 2), i = Math.max(i, o + c / 2);
	}
	e.nodes().forEach((t) => c(e.node(t))), e.edges().forEach((t) => {
		let n = e.edge(t);
		Object.hasOwn(n, "x") && c(n);
	}), t -= o, r -= s, e.nodes().forEach((n) => {
		let i = e.node(n);
		i.x -= t, i.y -= r;
	}), e.edges().forEach((n) => {
		let i = e.edge(n);
		i.points.forEach((e) => {
			e.x -= t, e.y -= r;
		}), Object.hasOwn(i, "x") && (i.x -= t), Object.hasOwn(i, "y") && (i.y -= r);
	}), a.width = n - t + o, a.height = i - r + s;
}
function fk(e) {
	e.edges().forEach((t) => {
		if (t.v === t.w) return;
		let n = e.edge(t), r = e.node(t.v), i = e.node(t.w), a, o;
		n.points ? (a = n.points[0], o = n.points[n.points.length - 1]) : (n.points = [], a = i, o = r), n.points.unshift(AE(r, a)), n.points.push(AE(i, o));
	});
}
function pk(e) {
	e.edges().forEach((t) => {
		let n = e.edge(t);
		if (Object.hasOwn(n, "x")) switch ((n.labelpos === "l" || n.labelpos === "r") && (n.width -= n.labeloffset), n.labelpos) {
			case "l":
				n.x -= n.width / 2 + n.labeloffset;
				break;
			case "r": n.x += n.width / 2 + n.labeloffset;
		}
	});
}
function mk(e) {
	e.edges().forEach((t) => {
		let n = e.edge(t);
		n.reversed && n.points.reverse();
	});
}
function hk(e) {
	e.nodes().forEach((t) => {
		if (e.children(t).length) {
			let n = e.node(t), r = e.node(n.borderTop), i = e.node(n.borderBottom), a = e.node(n.borderLeft[n.borderLeft.length - 1]), o = e.node(n.borderRight[n.borderRight.length - 1]);
			n.width = Math.abs(o.x - a.x), n.height = Math.abs(i.y - r.y), n.x = a.x + n.width / 2, n.y = r.y + n.height / 2;
		}
	}), e.nodes().forEach((t) => {
		e.node(t).dummy === "border" && e.removeNode(t);
	});
}
function gk(e) {
	e.edges().forEach((t) => {
		if (t.v === t.w) {
			let n = e.node(t.v);
			n.selfEdges || (n.selfEdges = []), n.selfEdges.push({
				e: t,
				label: e.edge(t)
			}), e.removeEdge(t);
		}
	});
}
function _k(e) {
	jE(e).forEach((t) => {
		let n = 0;
		t.forEach((t, r) => {
			let i = e.node(t);
			typeof i.rank != "number" && (i.rank = 0), i.order = r + n, (i.selfEdges || []).forEach((t) => {
				DE(e, "selfedge", {
					width: t.label.width,
					height: t.label.height,
					rank: i.rank,
					order: r + ++n,
					e: t.e,
					edgeLabel: t.label
				}, "_se"), Array.isArray(t.label.points) && t.label.points.length === 7 || (t.label.points = [
					{
						x: 0,
						y: -10
					},
					{
						x: 0,
						y: -10
					},
					{
						x: 0,
						y: 0
					},
					{
						x: 0,
						y: 10
					},
					{
						x: 0,
						y: 10
					},
					{
						x: 0,
						y: 0
					},
					{
						x: 0,
						y: 0
					}
				]);
			}), delete i.selfEdges;
		});
	});
}
function vk(e) {
	e.nodes().forEach((t) => {
		let n = e.node(t), r = (e) => typeof e == "number" && isFinite(e);
		if (n.dummy === "selfedge") {
			let i = n, a = e.node(i.e.v), o = r(a?.x) ? a.x : 0, s = r(a?.y) ? a.y : 0, c = r(a?.width) ? a.width : 0, l = r(a?.height) ? a.height : 0, u = r(n.x) ? n.x : o, d = r(n.y) ? n.y : s, f = c / 2, p = l / 2;
			i.edgeLabel.points = [
				{
					x: u + f,
					y: d - p
				},
				{
					x: u + f,
					y: d - p
				},
				{
					x: u,
					y: d
				},
				{
					x: u - f,
					y: d + p
				},
				{
					x: u - f,
					y: d + p
				},
				{
					x: u,
					y: d
				},
				{
					x: u,
					y: d
				}
			], i.edgeLabel.x = u, i.edgeLabel.y = d, e.setEdge(i.e, i.edgeLabel), e.removeNode(t);
		} else n && Array.isArray(n.selfEdges) && n.selfEdges.forEach((e) => {
			if (!Array.isArray(e.label.points) || e.label.points.length !== 7) {
				let t = r(n.x) ? n.x : 0, i = r(n.y) ? n.y : 0, a = r(n.width) ? n.width : 0, o = r(n.height) ? n.height : 0, s = a / 2, c = o / 2;
				e.label.points = [
					{
						x: t + s,
						y: i - c
					},
					{
						x: t + s,
						y: i - c
					},
					{
						x: t,
						y: i
					},
					{
						x: t - s,
						y: i + c
					},
					{
						x: t - s,
						y: i + c
					},
					{
						x: t,
						y: i
					},
					{
						x: t,
						y: i
					}
				];
			}
		});
	});
}
function yk(e, t) {
	return KE(GE(e, t), Number);
}
function bk(e) {
	let t = {};
	return e && Object.entries(e).forEach(([e, n]) => {
		typeof e == "string" && (e = e.toLowerCase()), t[e] = n;
	}), t;
}
function xk(e) {
	let t = jE(e), n = new EE({
		compound: !0,
		multigraph: !0
	}).setGraph({});
	return e.nodes().forEach((t) => {
		n.setNode(t, { label: t }), n.setParent(t, "layer" + e.node(t).rank);
	}), e.edges().forEach((e) => n.setEdge(e.v, e.w, {}, e.name)), t.forEach((e, t) => {
		let r = "layer" + t;
		n.setNode(r, { rank: "same" }), e.reduce((e, t) => (n.setEdge(e, t, { style: "invis" }), t));
	}), n;
}
var Sk = {
	graphlib: VT,
	version: XE,
	layout: KO,
	debug: xk,
	util: {
		time: BE,
		notime: VE
	}
};
function Ck(e) {
	let t = 0;
	for (let n = 0; n < e.length; n += 1) for (let r = n + 1; r < e.length; r += 1) {
		let i = e[n], a = e[r];
		(i[0] - a[0]) * (i[1] - a[1]) < 0 && (t += 1);
	}
	return t;
}
function wk(e, t, n) {
	let r = [];
	for (let i of e) {
		let e = t.get(i.from), a = t.get(i.to);
		e != null && a != null && e !== a && r.push({
			ra: e,
			rb: a,
			ia: n.get(i.from),
			ib: n.get(i.to)
		});
	}
	return r;
}
function Tk(e, t, n) {
	let r = (e) => e >= t && e <= n;
	return Ck(e.filter((e) => r(e.ra) && r(e.rb)).map((e) => [e.ia, e.ib]));
}
function Ek({ nodes: e = g, edges: t = C, gapX: n = 40, gapY: r = 96, pad: i = 24 } = {}) {
	let a = [...new Set(e.map((e) => e.tier))].sort((e, t) => e - t), o = a.map((t) => e.filter((e) => e.tier === t).map((e) => e.id)), s = /* @__PURE__ */ new Map();
	o.forEach((e, t) => e.forEach((e) => s.set(e, t)));
	let c = () => {
		let e = /* @__PURE__ */ new Map();
		return o.forEach((t) => t.forEach((t, n) => e.set(t, n))), e;
	}, l = t.filter((e) => _.has(e.from) && _.has(e.to));
	for (let e = 0; e < 6; e += 1) {
		let e = !1;
		for (let t = 0; t < o.length; t += 1) for (let n = 0; n + 1 < o[t].length; n += 1) {
			let r = Math.max(0, t - 1), i = Math.min(o.length - 1, t + 1), a = Tk(wk(l, s, c()), r, i), u = o[t][n];
			if (o[t][n] = o[t][n + 1], o[t][n + 1] = u, Tk(wk(l, s, c()), r, i) < a) e = !0;
			else {
				let e = o[t][n];
				o[t][n] = o[t][n + 1], o[t][n + 1] = e;
			}
		}
		if (!e) break;
	}
	let u = o.map((e) => e.length ? Math.max(...e.map((e) => _.get(e).h)) : 0), d = o.map((e) => e.length ? e.reduce((e, t) => e + _.get(t).w, 0) + (e.length - 1) * n : 0), f = Math.max(...d, 1) + i * 2, p = u.reduce((e, t) => e + t, 0) + (o.length - 1) * r + i * 2, m = [], h = [], v = i;
	return o.forEach((e, t) => {
		let i = (f - d[t]) / 2;
		for (let r of e) {
			let e = _.get(r);
			m.push({
				id: r,
				x: Math.round(i),
				y: Math.round(v + (u[t] - e.h) / 2),
				w: e.w,
				h: e.h
			}), i += e.w + n;
		}
		let o = _.get(e[0])?.zone ?? "risk";
		h.push({
			tier: a[t],
			zone: o,
			y: Math.round(v - r * .34),
			height: Math.round(u[t] + r * .68),
			label: o
		}), v += u[t] + r;
	}), {
		nodes: m,
		bands: h,
		width: f,
		height: p,
		rows: o
	};
}
function Dk({ focusId: e = "gold-intl", edges: t = x } = {}) {
	let n = w.get(e) ?? e, r = e, i = /* @__PURE__ */ new Set([e, n]), a = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Set(), s = [];
	for (let e of t) {
		let t = e.to === r || e.from === r, i = n !== r && (e.to === n || e.from === n);
		t ? (s.push({
			edge: e,
			from: e.from,
			to: e.to
		}), e.to === r ? a.add(e.from) : o.add(e.to)) : i && (s.push({
			edge: e,
			from: e.from,
			to: e.to
		}), e.to === n ? a.add(e.from) : o.add(e.to));
	}
	n !== r && s.push({
		edge: null,
		from: n,
		to: r,
		cluster: !0
	});
	for (let e of i) a.delete(e), o.delete(e);
	let c = {
		w: 188,
		h: 84
	}, l = {
		w: 168,
		h: 62
	}, u = (e) => e === r ? c : l, d = new Sk.graphlib.Graph();
	d.setGraph({
		rankdir: "LR",
		nodesep: 16,
		ranksep: 152,
		marginx: 20,
		marginy: 20,
		edgesep: 18,
		ranker: "tight-tree"
	}), d.setDefaultEdgeLabel(() => ({})), d.setNode(r, {
		width: c.w,
		height: c.h
	});
	for (let e of s) {
		for (let t of [e.from, e.to]) {
			if (d.hasNode(t)) continue;
			let e = u(t);
			d.setNode(t, {
				width: e.w,
				height: e.h
			});
		}
		d.setEdge(e.from, e.to, {});
	}
	return Sk.layout(d), {
		nodes: [...d.nodes()].map((e) => {
			let t = d.node(e), n = u(e);
			return {
				id: e,
				x: Math.round(t.x - n.w / 2),
				y: Math.round(t.y - n.h / 2),
				w: n.w,
				h: n.h
			};
		}),
		bands: [],
		width: Math.round(d.graph().width ?? 0),
		height: Math.round(d.graph().height ?? 0),
		links: s,
		preds: [...a],
		succs: [...o]
	};
}
function Ok(e, t) {
	let n = new Map(e.map((e) => [e.id, e])), r = (e) => e.x + e.w / 2, i = (e) => e.y + e.h / 2, a = [], o = /* @__PURE__ */ new Map(), s = (e, t) => {
		o.has(e) || o.set(e, []), o.get(e).push(t);
	};
	for (let e of t) {
		let t = n.get(e.from), o = n.get(e.to);
		if (!t || !o) continue;
		let c = r(o) - r(t), l = i(o) - i(t), u = Math.abs(l) > Math.abs(c) * .55, d, f;
		u ? (d = l > 0 ? "bottom" : "top", f = l > 0 ? "top" : "bottom") : (d = c > 0 ? "right" : "left", f = c > 0 ? "left" : "right"), s(`${e.from}:${d}`, e.id), s(`${e.to}:${f}`, e.id), a.push({
			edge: e,
			fromSide: d,
			toSide: f
		});
	}
	return {
		plan: a,
		slots: o,
		slotOffset: (e, t, n, r, i) => {
			let a = (e === "top" || e === "bottom" ? r : i) - 52;
			if (n <= 1) return 0;
			let o = Math.max(a, 0), s = o / (n - 1);
			return -o / 2 + s * t;
		}
	};
}
// src/client/views/macro/flow-nodes.js
var kk = (e) => `po-${e}`, Ak = (e) => `pi-${e}`, jk = [{
	tagName: "circle",
	selector: "portBody"
}];
function Mk(e, t) {
	let { plan: n } = Ok(e, t), r = /* @__PURE__ */ new Map(), i = () => ({
		top: {
			position: "top",
			attrs: Nk()
		},
		bottom: {
			position: "bottom",
			attrs: Nk()
		},
		left: {
			position: "left",
			attrs: Nk()
		},
		right: {
			position: "right",
			attrs: Nk()
		}
	}), a = (e) => (r.has(e) || r.set(e, {
		groups: i(),
		items: []
	}), r.get(e));
	for (let e of n) {
		let t = a(e.edge.from), n = a(e.edge.to);
		t.items.push({
			id: kk(e.edge.id),
			group: e.fromSide,
			attrs: { portBody: { magnet: !0 } }
		}), n.items.push({
			id: Ak(e.edge.id),
			group: e.toSide,
			attrs: { portBody: { magnet: !0 } }
		});
	}
	return r;
}
function Nk() {
	return { portBody: {
		r: 3,
		magnet: !0,
		stroke: "rgba(122,140,168,.55)",
		strokeWidth: 1.2,
		fill: "#0b1017"
	} };
}
function Pk(e, t) {
	let { state: n, reality: r, prop: i } = t;
	if (n.graphMode === "sandbox" && n.shock) {
		let t = i?.get(e);
		if (e === n.shock.id) return {
			text: n.shock.dir > 0 ? "假设大涨 ↑" : "假设大跌 ↓",
			tone: "src"
		};
		if (t) {
			if (t.conflict) return {
				text: "多空交织",
				tone: "mix"
			};
			let e = t.dirs.has(1);
			return {
				text: `${t.hop === 1 ? "一阶" : "二阶"}${e ? "利多 ↑" : "利空 ↓"}`,
				tone: e ? "src" : "cold"
			};
		}
		return null;
	}
	let a = t.pairEdge;
	if (a?.cluster && !n.playbook && (a.from === e || a.to === e)) {
		let e = r.get(a.id)?.status === "diverged" ? "mix" : a.sign > 0 ? "pos" : "cold";
		return {
			text: `${ee(a.sign)} ${a.label}`,
			tone: e
		};
	}
	return null;
}
function Fk(e, t) {
	let { state: n, prop: r } = t;
	return n.graphMode === "sandbox" && n.shock ? e === n.shock.id || r?.has(e) ? "" : " is-dim" : t.activeEdges ? t.activeEdges.nodes.has(e) ? "" : " is-dim" : "";
}
function Ik(e, t, n) {
	let r = _.get(e) ?? {
		id: e,
		zone: "risk"
	}, i = t.data.universe?.find((t) => t.id === e), a = h[r.zone] ?? h.risk, o = !_.has(e), s = i?.short ?? e, c = i?.name ?? s, l = ne(t.data.recent?.changes?.[e]), u = l == null ? "" : l > 0 ? "up" : l < 0 ? "down" : "", d = i?.last == null ? "—" : Lk(i), f = o ? null : r.sub, p = f ? t.data.universe?.find((e) => e.id === f) : null, m = p ? ne(t.data.recent?.changes?.[p.id]) : null, g = m == null ? "" : m > 0 ? "up" : m < 0 ? "down" : "", v = Pk(e, t), y = t.state.graphFocus === e, b = t.pairEdge && (t.pairEdge.from === e || t.pairEdge.to === e), x = t.hotEdge === e || t.spotlight === e, S = [
		"mgx-card",
		`zone-${r.zone}`,
		p ? "has-sub" : "",
		t.centerId === e ? "mgx-card--lg" : "",
		y ? "is-focus" : "",
		b ? "is-pair" : "",
		x ? "is-hot" : "",
		Fk(e, t)
	].filter(Boolean).join(" "), C = n ? ` style="width:${n.w}px;height:${n.h}px"` : "";
	return `<div class="${S}" data-node="${D(e)}" role="button" tabindex="0"${C}
      aria-label="${D(c)} ${D(d)} ${D(se(l, i?.kind))}">
    <div class="mgx-head">
      <span class="mgx-name" title="${D(c)}">${D(s)}</span>
      ${v ? `<span class="mgx-chip ${v.tone}">${D(v.text)}</span>` : `<span class="mgx-zone">${D(a.short)}</span>`}
    </div>
    <div class="mgx-mid">
      <b class="mgx-price ${u}">${D(d)}</b>
      <i class="mgx-chg ${u}">${D(se(l, i?.kind))}</i>
    </div>
    ${p ? `<div class="mgx-sub"><span>${D(p.short)}</span><b>${D(Lk(p))}</b><i class="${g}">${D(se(m, p.kind))}</i></div>` : ""}
  </div>`;
}
function Lk(e) {
	let t = e?.last;
	if (t == null || !Number.isFinite(t)) return "—";
	let n = Number.isFinite(e?.decimals) ? e.decimals : 2;
	return t.toLocaleString("en-US", {
		minimumFractionDigits: n,
		maximumFractionDigits: n
	});
}
// src/client/views/macro/flow-canvas.js
var Rk = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;
function zk(e, t) {
	let n = 0;
	for (let r of String(e)) n += Rk.test(r) ? t : t * .58;
	return n;
}
var Bk = !1;
function Vk() {
	Bk || (XS.register({
		shape: "mgx-card",
		width: 152,
		height: 78,
		effect: ["data"],
		html: (e) => e.getData()?.html ?? ""
	}), Bk = !0);
}
var Hk = {
	orth: {
		router: {
			name: "manhattan",
			args: {
				step: 10,
				padding: {
					top: 14,
					right: 14,
					bottom: 14,
					left: 14
				},
				startDirections: [
					"top",
					"right",
					"bottom",
					"left"
				],
				endDirections: [
					"top",
					"right",
					"bottom",
					"left"
				],
				maxLoopCount: 2e3
			}
		},
		connector: {
			name: "rounded",
			args: { radius: 12 }
		}
	},
	smooth: {
		router: {
			name: "normal",
			args: {}
		},
		connector: {
			name: "smooth",
			args: {}
		}
	}
}, Uk = {
	orth: "正交折线",
	smooth: "平滑曲线"
};
function Wk(e, t) {
	return e.name === "manhattan" ? {
		...e,
		args: {
			...e.args,
			startDirections: [t.from],
			endDirections: [t.to]
		}
	} : e;
}
var Gk = class {
	constructor(e, t = {}) {
		Vk(), this.container = e, this.style = t.style === "smooth" ? "smooth" : "orth", this.manual = /* @__PURE__ */ new Map(), this.spotlight = null, this.onEdge = t.onEdge ?? (() => {}), this.onNode = t.onNode ?? (() => {}), this.onNodeDbl = t.onNodeDbl ?? (() => {}), this.stageEl = document.createElement("div"), this.stageEl.className = "mg-x6-graph", e.appendChild(this.stageEl), this.graph = new Q({
			container: this.stageEl,
			autoResize: !1,
			background: { color: "transparent" },
			grid: !1,
			panning: {
				enabled: !0,
				eventTypes: ["leftMouseDown"]
			},
			mousewheel: {
				enabled: !0,
				modifiers: null,
				factor: 1.12,
				minScale: .45,
				maxScale: 1.8,
				zoomAtMousePosition: !0,
				guard: (e) => e.metaKey || e.ctrlKey
			},
			interacting: {
				edgeLabelMovable: !1,
				arrowheadMovable: !1,
				vertexMovable: !1,
				edgeMovable: !1
			},
			connecting: {
				allowBlank: !1,
				allowLoop: !1,
				allowNode: !1,
				allowEdge: !1,
				allowPort: !1,
				allowMulti: !1,
				highlight: !1
			}
		}), this.tools = this.buildTools(), this.bindEvents(), this.fitQueued = !1, this.ro = typeof ResizeObserver == "function" ? new ResizeObserver(() => this.onResize()) : null, this.ro?.observe(e), this.onResize();
	}
	buildTools() {
		let e = document.createElement("div");
		return e.className = "mgx-tools", e.innerHTML = `
      <button type="button" class="mgx-tbtn" data-ctl="in" title="放大">+</button>
      <button type="button" class="mgx-tbtn" data-ctl="out" title="缩小">−</button>
      <button type="button" class="mgx-tbtn wide" data-ctl="fit" title="适应画布">⊡ 适应</button>
      <button type="button" class="mgx-tbtn wide" data-ctl="reset" title="清除手动拖拽，回到自动布局">↺ 复位</button>
      <button type="button" class="mgx-tbtn wide" data-ctl="style" title="切换连线风格">⇄ <span class="mgx-style">${Uk[this.style]}</span></button>
      <span class="mgx-zoom">100%</span>`, e.addEventListener("click", (e) => {
			let t = e.target.closest("[data-ctl]");
			if (!t) return;
			let n = t.dataset.ctl;
			n === "in" ? this.zoomBy(1.2) : n === "out" ? this.zoomBy(1 / 1.2) : n === "fit" ? this.fit() : n === "reset" ? this.resetManual() : n === "style" && this.toggleStyle();
		}), this.container.appendChild(e), e;
	}
	syncZoomLabel() {
		let e = this.tools?.querySelector(".mgx-zoom");
		e && (e.textContent = `${Math.round((this.graph.zoom() ?? 1) * 100)}%`);
	}
	zoomBy(e) {
		let t = Math.min(1.8, Math.max(.45, (this.graph.zoom() ?? 1) * e));
		this.graph.zoomTo(t, { center: {
			x: this.container.clientWidth / 2,
			y: this.container.clientHeight / 2
		} }), this.syncZoomLabel();
	}
	onResize() {
		let e = this.container.clientWidth, t = this.container.clientHeight;
		e && t && (this.graph.resize(e, t), this.scheduleFit());
	}
	scheduleFit() {
		this.fitQueued || (this.fitQueued = !0, requestAnimationFrame(() => {
			this.fitQueued = !1, this.fit();
		}));
	}
	fit() {
		this.graph && this.nodes?.length && (this.graph.zoomToFit({
			padding: 14,
			minScale: .4,
			maxScale: 1
		}), this.graph.centerContent(), this.syncZoomLabel());
	}
	resetManual() {
		this.manual.clear(), this.reflow(), this.fit();
	}
	toggleStyle() {
		this.style = this.style === "orth" ? "smooth" : "orth";
		let e = this.tools?.querySelector(".mgx-style");
		e && (e.textContent = Uk[this.style]), this.applyEdgeStyle();
	}
	applyEdgeStyle() {
		let e = Hk[this.style];
		for (let t of this.graph.getEdges()) t.getData()?.overlay || (t.setRouter(e.router), t.setConnector(e.connector));
	}
	bindEvents() {
		let e = this.graph;
		e.on("node:click", ({ node: e }) => {
			let t = e.getData() ?? {};
			t.band || (t.pill ? this.onEdge(t.edgeId) : this.onNode(e.id));
		}), e.on("node:dblclick", ({ node: e }) => {
			e.getData()?.band || this.onNodeDbl(e.id);
		}), e.on("edge:click", ({ edge: e }) => {
			let t = e.getData();
			!t?.overlay && t?.edgeId && this.onEdge(t.edgeId);
		}), e.on("blank:click", () => {}), e.on("render:done", () => {
			this.pruneOrphanViews(), this.syncPills();
		}), e.on("node:moving", ({ node: e }) => {
			e.getData()?.band || this.syncPills();
		}), e.on("node:moved", ({ node: e }) => {
			e.getData()?.band || (this.manual.set(e.id, e.getPosition()), this.syncPills());
		}), e.on("node:mouseenter", ({ node: e }) => {
			e.getData()?.band || this.setSpotlight(e.id);
		}), e.on("node:mouseleave", () => this.setSpotlight(null)), e.on("scale", () => this.syncZoomLabel());
	}
	neighborsOf(e) {
		let t = /* @__PURE__ */ new Set([e]);
		for (let n of this.edgeList ?? []) n.from === e && t.add(n.to), n.to === e && t.add(n.from);
		return t;
	}
	setSpotlight(e) {
		if (this.spotlight === e) return;
		this.spotlight = e;
		let t = e ? this.neighborsOf(e) : null, n = this.container;
		if (n) {
			n.classList.toggle("mgx-spot", !!e);
			for (let r of n.querySelectorAll(".mgx-card")) {
				let n = r.dataset.node, i = !t || t.has(n);
				r.classList.toggle("is-dim", !i), r.classList.toggle("is-spot", !!t && n === e);
			}
			for (let e of this.graph.getEdges()) {
				let n = e.getData() ?? {}, r = !t || t.has(n.from) || t.has(n.to);
				e.attr("line/opacity", r ? this.baseOpacity(n) : .1), e.attr("flow/opacity", +!!r);
			}
		}
	}
	baseOpacity(e) {
		return e.dim ? .14 : .42 + (e.weight ?? 1) * .16;
	}
	update({ data: e, state: t, reality: n, prop: r, pairEdge: i, activeEdges: a, hotEdgeIds: o }) {
		this.data = e, this.state = t, this.reality = n, this.prop = r, this.pairEdge = i, this.activeEdges = a, this.hotEdgeIds = o ?? /* @__PURE__ */ new Set(), this.touchedEdges = this.computeTouchedEdges(), this.layout = this.computeLayout(), this.graph.clearCells(), this.drawBands(), this.drawNodes(), this.drawEdges(), this.drawPills(), this.pruneOrphanViews(), this.syncZoomLabel();
		let s = `${this.layout.mode}:${Math.round(this.layout.width)}x${Math.round(this.layout.height)}`;
		this.didFirstFit && s === this.lastLayoutSig || (this.didFirstFit = !0, this.lastLayoutSig = s, this.scheduleFit());
	}
	pruneOrphanViews() {
		let e = this.stageEl;
		if (!e) return;
		let t = /* @__PURE__ */ new Map();
		for (let e of this.graph.getCells()) {
			let n = e.findView?.(this.graph);
			n?.container && t.set(e.id, n.container);
		}
		let n = /* @__PURE__ */ new Set();
		for (let r of e.querySelectorAll("[data-cell-id]")) {
			let e = r.getAttribute("data-cell-id"), i = t.get(e);
			i && r === i && !n.has(e) ? n.add(e) : r.remove();
		}
	}
	reflow() {
		this.layout && (this.graph.clearCells(), this.drawBands(), this.drawNodes(), this.drawEdges(), this.drawPills(), this.pruneOrphanViews());
	}
	computeLayout() {
		let e = this.state?.graphMode ?? "compass";
		if (e === "mindmap") {
			let t = this.state.graphFocus ?? "gold-intl", n = Dk({
				focusId: t,
				edges: x
			}), r = (n.links ?? []).length === 0;
			return {
				mode: e,
				...n,
				centerId: t,
				orphan: r
			};
		}
		return {
			mode: e,
			...Ek({ edges: C }),
			centerId: null
		};
	}
	computeTouchedEdges() {
		let e = /* @__PURE__ */ new Set();
		if (this.state?.graphMode !== "sandbox" || !this.state.shock || !this.prop) return e;
		for (let t of this.prop.values()) for (let n of t.paths) e.add(n.edges);
		return e;
	}
	ctx() {
		return {
			data: this.data,
			state: this.state,
			reality: this.reality,
			prop: this.prop,
			pairEdge: this.pairEdge,
			activeEdges: this.activeEdges,
			centerId: this.layout?.centerId,
			hotEdge: null,
			spotlight: this.spotlight
		};
	}
	drawBands() {
		for (let e of this.layout.bands ?? []) {
			let t = h[e.label] ?? h.risk, n = this.layout.width - 20;
			this.graph.addNode({
				id: `band-${e.tier}`,
				shape: "rect",
				x: 10,
				y: e.y,
				width: n,
				height: e.height,
				zIndex: 1,
				data: { band: !0 },
				attrs: { body: {
					rx: 16,
					ry: 16,
					fill: "rgba(255,255,255,.012)",
					stroke: "rgba(120,140,170,.10)",
					strokeDasharray: "7 6",
					strokeWidth: 1,
					pointerEvents: "none"
				} },
				markup: [{
					tagName: "rect",
					selector: "body"
				}, {
					tagName: "text",
					selector: "label"
				}]
			}), this.graph.addNode({
				id: `bandlabel-${e.tier}`,
				shape: "mgx-card",
				x: 22,
				y: e.y - 11,
				width: Math.round(zk(t.label, 11)) + 18,
				height: 22,
				zIndex: 2,
				data: {
					band: !0,
					html: `<div class="mgx-bandlabel ${t.tone}" style="width:${Math.round(zk(t.label, 11)) + 18}px;height:22px">${D(t.label)}</div>`
				}
			});
		}
	}
	drawNodes() {
		let e = this.ctx(), t = this.layoutEdgesForPorts(), n = Ok(this.layout.nodes, t);
		this.portSides = new Map(n.plan.map((e) => [e.edge.id, {
			from: e.fromSide,
			to: e.toSide
		}]));
		let r = Mk(this.layout.nodes, t);
		this.nodes = [], this.cardBoxes = /* @__PURE__ */ new Map();
		for (let t of this.layout.nodes) {
			let n = this.manual.get(t.id), i = n ? n.x : t.x, a = n ? n.y : t.y, o = Ik(t.id, e, {
				w: t.w,
				h: t.h
			}), s = this.graph.addNode({
				id: t.id,
				shape: "mgx-card",
				x: i,
				y: a,
				width: t.w,
				height: t.h,
				zIndex: 10,
				data: { html: o },
				ports: r.get(t.id) ?? { groups: {} },
				portMarkup: jk
			});
			this.nodes.push(s), this.cardBoxes.set(t.id, {
				x: i,
				y: a,
				w: t.w,
				h: t.h
			});
		}
		if (this.layout.orphan) {
			let e = this.layout.nodes[0];
			this.graph.addNode({
				id: "__orphan",
				shape: "mgx-card",
				x: e.x + e.w + 150,
				y: e.y - 12,
				width: 232,
				height: e.h + 24,
				zIndex: 10,
				data: { html: `<div class="mgx-orphan" style="width:232px;height:${e.h + 24}px"><b>没有登记因果边</b><span>这个标的只作为同源子标的挂在宿主卡里（VXN 挂在 VIX 卡、沪金挂在黄金卡、布伦特挂在原油卡），没有独立的上下游链。</span><span>想看它的传导关系，点下面「VIX」或直接切回全局罗盘。</span></div>` }
			});
		}
	}
	layoutEdgesForPorts() {
		return this.layout.mode === "mindmap" ? this.mindEdges() : C;
	}
	mindEdges() {
		let e = [];
		for (let t of this.layout.links ?? []) t.edge ? e.push(t.edge) : e.push({
			id: `X-${t.from}-${t.to}`,
			from: t.from,
			to: t.to,
			sign: 1,
			weight: 3,
			label: ""
		});
		return e;
	}
	edgeListForDraw() {
		return this.layout.mode === "mindmap" ? this.mindEdges() : C;
	}
	drawEdges() {
		this.edgeList = this.edgeListForDraw();
		let e = Hk[this.style];
		for (let t of this.edgeList) {
			let n = this.reality?.get(t.id), r = te(t, n), i = p[r] ?? p.pos, a = m[r], o = this.isDimEdge(t), s = this.hotEdgeIds.has(t.id) || this.pairEdge?.id === t.id, c = 1 + (t.weight ?? 1) * .42, l = this.portSides?.get(t.id), u = l ? Wk(e.router, l) : e.router;
			this.graph.addEdge({
				id: `edge-${t.id}`,
				source: {
					cell: t.from,
					port: kk(t.id)
				},
				target: {
					cell: t.to,
					port: Ak(t.id)
				},
				zIndex: s ? 8 : 4,
				router: u,
				connector: e.connector,
				data: {
					edgeId: t.id,
					from: t.from,
					to: t.to,
					weight: t.weight,
					dim: o,
					tone: r
				},
				markup: [{
					tagName: "path",
					selector: "hit"
				}, {
					tagName: "path",
					selector: "line"
				}],
				attrs: {
					hit: {
						connection: !0,
						fill: "none",
						stroke: "transparent",
						strokeWidth: 15,
						cursor: "pointer"
					},
					line: {
						connection: !0,
						fill: "none",
						stroke: i,
						strokeWidth: s ? c + .7 : c,
						strokeDasharray: a,
						strokeLinecap: "round",
						opacity: o ? .14 : this.baseOpacity({ weight: t.weight }),
						targetMarker: {
							name: "block",
							args: {
								size: 6.5,
								offset: 1,
								fill: i,
								stroke: i
							}
						}
					}
				}
			}), o || this.graph.addEdge({
				id: `flow-${t.id}`,
				source: {
					cell: t.from,
					port: kk(t.id)
				},
				target: {
					cell: t.to,
					port: Ak(t.id)
				},
				zIndex: 6,
				router: u,
				connector: e.connector,
				data: {
					overlay: !0,
					from: t.from,
					to: t.to,
					tone: r
				},
				markup: [{
					tagName: "path",
					selector: "flow"
				}],
				attrs: { flow: {
					connection: !0,
					fill: "none",
					stroke: i,
					strokeWidth: Math.max(1, c * .9),
					strokeDasharray: r === "pos" ? "3 14" : "2 12",
					strokeLinecap: "round",
					opacity: .95,
					pointerEvents: "none",
					targetMarker: null
				} }
			});
		}
	}
	isDimEdge(e) {
		return this.state.graphMode === "sandbox" && this.state.shock ? !this.touchedEdges?.has(e.id) : this.activeEdges ? !this.activeEdges.edges.has(e.id) : !1;
	}
	pillHTML(e, t, n) {
		let r = `${e.sign > 0 ? "+" : "−"} ${e.label}`;
		return {
			text: r,
			w: Math.round(zk(r, 9.5) + 16),
			h: 17,
			html: `<div class="mgx-pill ${t}${n ? " is-hot" : ""}">${D(r)}</div>`
		};
	}
	drawPills() {
		this.pillNodes = /* @__PURE__ */ new Map();
		for (let e of this.edgeList) {
			if (!e.label || this.isDimEdge(e)) continue;
			let t = this.reality?.get(e.id), n = te(e, t), r = this.hotEdgeIds.has(e.id) || this.pairEdge?.id === e.id, i = this.pillHTML(e, n, r);
			this.graph.addNode({
				id: `pill-${e.id}`,
				shape: "mgx-card",
				x: 0,
				y: 0,
				width: i.w,
				height: i.h,
				zIndex: 9,
				data: {
					pill: !0,
					edgeId: e.id,
					html: `<div class="mgx-pill-wrap" style="width:${i.w}px;height:${i.h}px">${i.html}</div>`
				}
			}), this.pillNodes.set(e.id, i);
		}
		this.queuePillSync();
	}
	queuePillSync() {
		if (this.pillSyncQueued) return;
		this.pillSyncQueued = !0;
		let e = () => {
			this.pillSyncQueued = !1, this.syncPills();
		};
		requestAnimationFrame(e), setTimeout(e, 60);
	}
	syncPills() {
		if (this.pillNodes) {
			this.placedPills = [];
			for (let [e, t] of this.pillNodes) {
				let n = this.graph.getCellById(`edge-${e}`)?.findView(this.graph), r = this.graph.getCellById(`pill-${e}`);
				if (!n || !r) continue;
				let i = null;
				try {
					i = n.getPointAtRatio(.5);
				} catch {
					i = null;
				}
				if (!i || !Number.isFinite(i.x)) {
					this.queuePillSync();
					continue;
				}
				let a = this.placePill(n, t);
				r.position(Math.round(a.x - t.w / 2), Math.round(a.y - t.h / 2)), this.placedPills.push({
					x: a.x - t.w / 2,
					y: a.y - t.h / 2,
					w: t.w,
					h: t.h
				});
			}
		}
	}
	setShockTouched(e) {
		this.touchedEdges = e;
	}
	placePill(e, t) {
		let n = [
			.5,
			.42,
			.58,
			.34,
			.66,
			.28,
			.72
		], r = [
			0,
			-13,
			13,
			-26,
			26,
			-40,
			40,
			-54,
			54,
			-68,
			68
		], i = t.w / 2 + 4, a = t.h / 2 + 3, o = (e, t) => e.x < t.x + t.w && e.x + e.w > t.x && e.y < t.y + t.h && e.y + e.h > t.y, s = (e) => {
			let t = {
				x: e.x - i,
				y: e.y - a,
				w: i * 2,
				h: a * 2
			};
			for (let e of this.cardBoxes.values()) if (o(t, e)) return !0;
			for (let e of this.placedPills ?? []) if (o(t, e)) return !0;
			return !1;
		}, c = [];
		for (let t of n) try {
			let n = e.getPointAtRatio(t);
			n && Number.isFinite(n.x) && c.push(n);
		} catch {}
		for (let e of r) for (let t of c) {
			let n = {
				x: t.x,
				y: t.y + e
			};
			if (!s(n)) return n;
		}
		return c[0] ?? {
			x: 0,
			y: 0
		};
	}
	dispose() {
		this.ro?.disconnect(), this.ro = null, this.tools?.remove(), this.graph?.dispose(), this.graph = null;
	}
};
// src/client/views/macro/panels.js
function Kk(e) {
	return e == null ? "" : e > 0 ? "up" : e < 0 ? "down" : "";
}
function qk(e) {
	return e == null ? "dim" : `${e > 0 ? "up" : "cold"}${Math.abs(e) < .3 ? " faint" : ""}`;
}
function Jk(e, t, n) {
	let r = e.universe.find((e) => e.id === t), i = e.universe.find((e) => e.id === n), a = oe(e.matrix, t, n), o = ae(e.recent?.changes?.[t], e.recent?.changes?.[n], 60), s = ae(e.recent?.changes?.[t], e.recent?.changes?.[n], 20), c = ne(e.recent?.changes?.[t]), l = ne(e.recent?.changes?.[n]), u = (e, t, n = "") => `<div class="mg-kv ${n}"><span>${D(e)}</span><b>${t}</b></div>`;
	return `<div class="mg-card-head">
      <span class="mg-addr">${D(i?.short ?? n)}</span>
      <span class="mg-arrowsign dim">⋯</span>
      <span class="mg-addr">${D(r?.short ?? t)}</span>
      <span class="mg-badge neg">无理论直连</span>
    </div>
    <p class="mg-lead">这两个标的之间没有登记的因果边，下面只有实测数字。</p>
    <div class="mg-sect"><i class="dot"></i><h4>实测相关性</h4>
      ${u(`${r?.short ?? t} 最新`, `<span class="${Kk(c)}">${D(se(c, r?.kind))}</span>`)}
      ${u(`${i?.short ?? n} 最新`, `<span class="${Kk(l)}">${D(se(l, i?.kind))}</span>`)}
      ${u("250 期相关系数", `<span class="${qk(a)}">${a == null ? "—" : (a >= 0 ? "+" : "") + a.toFixed(2)}</span>`)}
      ${u("60 期滚动", `<span class="${qk(o)}">${o == null ? "—" : (o >= 0 ? "+" : "") + o.toFixed(2)}</span>`)}
      ${u("20 期滚动", `<span class="${qk(s)}">${s == null ? "—" : (s >= 0 ? "+" : "") + s.toFixed(2)}</span>`)}
    </div>
    <div class="mg-sect"><i class="dot warn"></i><h4>为什么还会同涨同跌</h4>
      <p>没有直连不等于没有关系。两者常通过共同的上游被间接驱动 —— 例如美元流动性、美债利率、或同一个风险偏好开关。想知道链条，就把焦点切到它们各自的上游看一遍。</p>
    </div>
    <button type="button" class="mg-jump" data-jump="${D(t)}|${D(n)}">↓ 跳到下方滚动相关性</button>`;
}
function Yk(e, t, n, r) {
	if (!t) {
		let [t, n] = r?.pair ?? [];
		return t && n ? Jk(e, t, n) : "<div class=\"mg-card-empty\">点画布上的任意一条连线，或点下方矩阵里的格子 —— 这里会显示这条传导关系的机理、实测验证与失效条件。</div>";
	}
	let i = n.get(t.id), a = e.universe.find((e) => e.id === t.from), o = e.universe.find((e) => e.id === t.to), s = i?.status === "diverged" ? "div" : t.sign > 0 ? "pos" : "neg", c = t.sign > 0 ? "+" : "−", l = (e, t, n = "") => `<div class="mg-kv ${n}"><span>${D(e)}</span><b>${t}</b></div>`, u = i?.roll20 == null ? "—" : `${i.roll20 >= 0 ? "+" : ""}${i.roll20.toFixed(2)}`, d = i?.roll60 == null ? "—" : `${i.roll60 >= 0 ? "+" : ""}${i.roll60.toFixed(2)}`, f = i?.longCorr == null ? "—" : `${i.longCorr >= 0 ? "+" : ""}${i.longCorr.toFixed(2)}`, p = i?.roll20 == null ? "" : Math.sign(i.roll20) === t.sign ? "<em class=\"ok\">逻辑吻合</em>" : i?.trendDiverged ? "<em class=\"warn\">正在背离</em>" : "<em class=\"dim\">反号偏弱</em>";
	return `<div class="mg-card-head">
      <span class="mg-addr">${D(o?.short ?? t.to)}</span>
      <span class="mg-arrowsign ${s}">◄──[${c}]──</span>
      <span class="mg-addr">${D(a?.short ?? t.from)}</span>
      <span class="mg-badge ${s}">${D(i?.badge ?? "")}</span>
    </div>
    <p class="mg-lead"><b>${D(t.label)}</b>　${D(t.id)}　权重 ${t.weight}/3</p>

    <div class="mg-sect"><i class="dot"></i><h4>核心机理</h4>
      <p>${D(t.mechanism)}</p>
    </div>

    <div class="mg-sect"><i class="dot"></i><h4>实盘数据验证</h4>
      ${l(`${a?.short ?? t.from} 最新（${a?.lastDate ?? "—"}）`, `<span class="${Kk(i?.lastA)}">${D(se(i?.lastA, a?.kind))}</span>`)}
      ${l(`${o?.short ?? t.to} 最新（${o?.lastDate ?? "—"}）`, `<span class="${Kk(i?.lastB)}">${D(se(i?.lastB, o?.kind))}</span>`)}
      ${l("250 期相关系数", `<span class="${qk(i?.longCorr)}">${f}</span>`)}
      ${l("60 期滚动", `<span class="${qk(i?.roll60)}">${d}</span>`)}
      ${l("20 期滚动", `<span class="${qk(i?.roll20)}">${u}</span> ${p}`)}
      ${l("理论方向", `<span class="${t.sign > 0 ? "up" : "cold"}">${c} ${t.sign > 0 ? "同向联动" : "反向压制"}</span>`)}
      ${l("样本", `${i?.n ?? 0} 期`)}
    </div>

    <div class="mg-sect"><i class="dot warn"></i><h4>何时失效（背离条件）</h4>
      <p>${D(t.divergence)}</p>
    </div>

    <button type="button" class="mg-jump" data-jump="${D(t.from)}|${D(t.to)}">↓ 跳到下方滚动相关性</button>`;
}
function Xk(e, t, n) {
	let r = x.filter((e) => e.to === t), i = x.filter((e) => e.from === t), a = e.universe.find((e) => e.id === t), o = (e, t, r) => {
		let i = n.get(e.id), a = i?.status === "diverged" ? "div" : e.sign > 0 ? "pos" : "neg";
		return `<li class="mg-mini" data-edge="${D(e.id)}">
      <span class="mg-mini-dir ${a}">${`${ee(e.sign)}▶`}</span>
      <span class="mg-mini-name">${D(t)}</span>
      <span class="mg-mini-tag">${D(e.label)}</span>
      <span class="mg-mini-roll ${qk(i?.roll20)}">${i?.roll20 == null ? "—" : `${i.roll20 >= 0 ? "+" : ""}${i.roll20.toFixed(2)}`}</span>
    </li>`;
	};
	return `<div class="mg-card-head"><span class="mg-addr big">${D(a?.name ?? t)}</span>
      <span class="mg-badge ${a ? "pos" : "neg"}">焦点</span></div>
    <p class="mg-lead">上游 ${r.length} 条驱动 · 下游 ${i.length} 条传导。右侧数字是近 20 期实测相关。</p>
    <div class="mg-sect"><i class="dot"></i><h4>⬅ 谁在驱动它</h4>
      <ul class="mg-mini-list">${r.map((t) => o(t, e.universe.find((e) => e.id === t.from)?.short ?? t.from, "up")).join("") || "<li class=\"mg-mini empty\">无已登记上游</li>"}</ul>
    </div>
    <div class="mg-sect"><i class="dot"></i><h4>它影响谁 ➡</h4>
      <ul class="mg-mini-list">${i.map((t) => o(t, e.universe.find((e) => e.id === t.to)?.short ?? t.to, "down")).join("") || "<li class=\"mg-mini empty\">无已登记下游</li>"}</ul>
    </div>
    <p class="mg-foot-note">点左侧/右侧任意卡片，焦点会带过渡切过去 —— 顺着因果链一路追查。</p>`;
}
function Zk(e, t) {
	let n = t.shock;
	if (!n) return "<div class=\"mg-card-empty\">选一个变量当震源，再点「模拟大涨 ↑」或「模拟大跌 ↓」。一阶、二阶会逐层点亮，两条路径方向打架的标的会标成琥珀色「多空交织」。</div>";
	let r = e.universe.find((e) => e.id === n.id), i = fe(n.id, n.dir), a = [...i.entries()].sort((e, t) => Number(t[1].conflict) - Number(e[1].conflict) || t[1].paths.length - e[1].paths.length)[0], o = (t) => e.universe.find((e) => e.id === t)?.short ?? t, s = (e) => e.trail.map((e) => `<span class="mg-chain-node">${D(o(e))}</span>`).join("<span class=\"mg-chain-sep\">→</span>"), c = a && a[1].conflict ? `<div class="mg-sect"><i class="dot warn"></i><h4>⚡ 多空交织拆解：${D(o(a[0]))}</h4>
        <ul class="mg-path-list">${a[1].paths.filter((e) => e.hop <= 2).map((e) => {
		let t = S.get(e.edges), n = e.dir > 0 ? "up" : "cold";
		return `<li class="mg-path">
              <span class="mg-path-hop">${e.hop === 1 ? "一阶" : "二阶"}</span>
              <span class="mg-path-chain">${s(e)}</span>
              <span class="mg-path-sign ${n}">${t ? `${ee(t.sign)} ${D(t.label)}` : ""} ⇒ ${e.dir > 0 ? "利多 ↑" : "利空 ↓"}</span>
            </li>`;
	}).join("")}</ul>
        <p class="mg-conclusion">同一个标的通过两条方向相反的路径被击中：短期通常交易<b>一阶</b>逻辑，中期若二阶链条兑现则反向。<b>看到琥珀色就该知道「方向还没定」，而不是「一定涨/跌」。</b></p>
      </div>` : "", l = `<div class="mg-sect"><i class="dot"></i><h4>冲击结果</h4>
      <div class="mg-hopbins">
        <span class="bin up"><b>${[...i.values()].filter((e) => !e.conflict && e.dirs.has(1)).length}</b>利多</span>
        <span class="bin cold"><b>${[...i.values()].filter((e) => !e.conflict && e.dirs.has(-1)).length}</b>利空</span>
        <span class="bin mix"><b>${[...i.values()].filter((e) => e.conflict).length}</b>多空交织</span>
      </div>
    </div>
    <div class="mg-sect"><i class="dot"></i><h4>一阶命中（${[...i.entries()].filter(([, e]) => e.hop === 1).length}）</h4>
      <ul class="mg-mini-list">${[...i.entries()].filter(([, e]) => e.hop === 1).map(([e, t]) => {
		let n = S.get(t.paths.find((e) => e.hop === 1)?.edges);
		return `<li class="mg-mini"><span class="mg-mini-dir ${t.dirs.has(1) ? "pos" : "neg"}">${t.dirs.has(1) ? "+▶" : "−▶"}</span>
            <span class="mg-mini-name">${D(o(e))}</span>
            <span class="mg-mini-tag">${D(n?.label ?? "")}</span>
            <span class="mg-mini-roll ${t.dirs.has(1) ? "up" : "cold"}">${t.dirs.has(1) ? "利多" : "利空"}</span></li>`;
	}).join("")}</ul>
    </div>`;
	return `<div class="mg-card-head">
      <span class="mg-addr big">${D(r?.name ?? n.id)}</span>
      <span class="mg-arrowsign ${n.dir > 0 ? "pos" : "neg"}">${n.dir > 0 ? "假设大涨 ↑" : "假设大跌 ↓"}</span>
    </div>
    <p class="mg-lead">沿 ${C.length} 条主干边做两跳传播，方向 = 冲击方向 × 边符号连乘。</p>
    ${l}
    ${c}`;
}
function Qk(e, t, n) {
	let r = (e) => t.universe.find((t) => t.id === e)?.short ?? e, i = [...e.edges, ...e.breaks].map((e) => S.get(e)).filter(Boolean).map((t) => {
		let i = n.get(t.id), a = e.breaks.includes(t.id) || i?.status === "diverged" ? "div" : t.sign > 0 ? "pos" : "neg";
		return `<li class="mg-mini" data-edge="${D(t.id)}">
        <span class="mg-mini-dir ${a}">${e.breaks.includes(t.id) ? "⚡" : ee(t.sign) + "▶"}</span>
        <span class="mg-mini-name">${D(r(t.from))}→${D(r(t.to))}</span>
        <span class="mg-mini-tag">${D(t.label)}${e.breaks.includes(t.id) ? " · 被打破" : ""}</span>
        <span class="mg-mini-roll ${qk(i?.roll20)}">${i?.roll20 == null ? "—" : `${i.roll20 >= 0 ? "+" : ""}${i.roll20.toFixed(2)}`}</span>
      </li>`;
	}).join("");
	return `<div class="mg-card-head"><span class="mg-addr big">${D(e.name)}</span>
      <span class="mg-badge pos">${D(e.sub)}</span></div>
    <ol class="mg-steps">${e.steps.map(([e, t]) => `<li><span>${D(e)}</span><b>${D(t)}</b></li>`).join("")}</ol>
    <div class="mg-sect"><i class="dot"></i><h4>点亮链路（${e.edges.length + e.breaks.length}）</h4>
      <ul class="mg-mini-list">${i}</ul>
    </div>
    <p class="mg-conclusion">${D(e.note)}</p>`;
}
function $k(e) {
	return e === "compass" ? "四象限生态位 · 光点方向＝因果方向 · 胶囊＝4 字机理" : e === "mindmap" ? "上游驱动 → 焦点 → 下游传导，零交叉" : "选震源 → 一阶 / 二阶逐层点亮 → 自动拆解多空交织";
}
function eA(e) {
	return [...e.values()].filter((e) => e.status === "diverged").length;
}
function tA(e, t) {
	let n = de(x, t);
	if (!n) return "";
	let r = e.universe.find((e) => e.id === n.e.from), i = e.universe.find((e) => e.id === n.e.to);
	return `<button type="button" class="mg-alert" data-alert="${D(n.e.id)}">
      <span class="mg-alert-ico">⚡</span>
      <span class="mg-alert-text">实时背离：<b>${D(r?.name ?? n.e.from)} ↔ ${D(i?.name ?? n.e.to)}</b>
        ${D(n.r.badge.replace("⚡ ", ""))}，近 20 期滚动相关 ${n.r.roll20 == null ? "样本不足" : `${n.r.roll20 >= 0 ? "+" : ""}${n.r.roll20.toFixed(2)}`}
        （理论 ${ee(n.e.sign)}），可能是「${D(n.e.divergence.split("：")[0])}」逻辑压过了「${D(n.e.label)}」</span>
      <span class="mg-alert-go">查看</span>
    </button>`;
}
function nA(e, t, n) {
	let r = t.graphMode ?? "compass";
	if (r === "compass") {
		let r = ue(t.pair?.[0], t.pair?.[1]), i = t.playbook ? T.find((e) => e.id === t.playbook) : null;
		return i ? Qk(i, e, n) : Yk(e, r, n, t);
	}
	return r === "mindmap" ? Xk(e, t.graphFocus ?? "gold-intl", n) : Zk(e, t);
}
var rA = 0;
function iA(e, t, n, r) {
	return `<span class="lg"><svg width="34" height="8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="${t}" stroke-width="2"${n ? ` stroke-dasharray="${n}"` : ""} marker-end="url(#${e})" /><defs><marker id="${e}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1.4 L9,5 L0,8.6 Z" fill="${t}" /></marker></defs></svg>${r}</span>`;
}
function aA(e) {
	let t = ++rA;
	return `<div class="mg-legend">
          ${iA(`lg-a-${t}`, u, "", "正向推升")}
          ${iA(`lg-b-${t}`, d, "6 4", "负向压制")}
          ${iA(`lg-c-${t}`, f, "2 4", "实盘背离")}
          <span class="lg note">光点流向 = 因 → 果　·　${$k(e)}</span>
        </div>`;
}
function oA(e) {
	let t = e.graphMode ?? "compass";
	return `<div class="mg-head">
      <h3>金融传导图谱与宏观逻辑沙盘
        <span class="h3-note">上半场定性：为什么动　·　下半场定量：动了多少</span>
      </h3>
      <div class="seg mg-modes">${b.map(([e, n]) => `<button type="button" class="mg-mode ${t === e ? "on" : ""}" data-mode="${D(e)}">${n}</button>`).join("")}</div>
    </div>`;
}
function sA(e, t, n) {
	let r = t.graphMode ?? "compass", i = t.playbook ? T.find((e) => e.id === t.playbook) : null, a = n ? eA(n) : 0;
	return `<div class="mg-tools">
      ${r === "compass" ? `<div class="mg-playbooks">
        <button type="button" class="mg-pb ${i ? "" : "on"}" data-pb="">全部关系</button>
        ${T.map((e) => `<button type="button" class="mg-pb ${i?.id === e.id ? "on" : ""}" data-pb="${D(e.id)}" title="${D(e.sub)}">${D(e.name)}</button>`).join("")}
      </div>` : "<span class=\"mg-tools-hint\">剧本压暗只在「全局罗盘」里生效</span>"}
      <span class="mg-divcount ${a ? "has" : ""}" title="${x.length} 条传导边中，当前实盘与理论方向相反的条数">
        背离 ${a}/${x.length}
      </span>
    </div>`;
}
function cA(e, t) {
	let n = t.graphMode ?? "compass";
	return n === "mindmap" ? `<div class="mg-focusbar">${v.map(([e, n]) => `<button type="button" class="mg-fpill ${(t.graphFocus ?? "gold-intl") === e ? "on" : ""}" data-focus="${D(e)}">${D(n)}</button>`).join("")}</div>` : n === "sandbox" ? `<div class="mg-shockbar">
            <span class="mg-shock-label">震源</span>
            ${y.map((n) => `<button type="button" class="mg-spick ${t.shock?.id === n ? "on" : ""}" data-shock="${D(n)}">${D(e.universe.find((e) => e.id === n)?.short ?? n)}</button>`).join("")}
            <span class="mg-shock-sep"></span>
            <button type="button" class="mg-sgo up ${t.shock?.dir > 0 ? "on" : ""}" data-dir="1">模拟大涨 ↑</button>
            <button type="button" class="mg-sgo down ${t.shock?.dir < 0 ? "on" : ""}" data-dir="-1">模拟大跌 ↓</button>
            <button type="button" class="mg-sclear" data-clear="1">清除</button>
          </div>` : "";
}
function lA(e, t, { legend: n = !0 } = {}) {
	let r = t.graphMode ?? "compass", i = le(e);
	return `<section class="d-block macro-graph-section">
    ${oA(t)}
    ${sA(e, t, i)}
    ${tA(e, i)}
    ${cA(e, t)}
    <div class="graph-stage">
      <div class="graph-canvas"><div class="mg-x6" id="mg-x6"><div class="mg-x6-loading">正在初始化流程图画布…</div></div>${n ? aA(r) : ""}</div>
      <aside class="graph-card">${nA(e, t, i)}</aside>
    </div>
  </section>`;
}
// src/client/styles/macro-flow.css?inline
var uA = ".mg-x6{border:1px solid var(--line);contain:paint;background:radial-gradient(760px 420px at 22% -6%,#406ebe1a,#0000 62%),radial-gradient(680px 380px at 88% 108%,#be604013,#0000 60%),#06090d9e;border-radius:14px;height:700px;position:relative;overflow:hidden}.mg-x6-graph{position:absolute;top:0;bottom:0;left:0;right:0}.mg-x6 foreignObject>body,.mg-x6 foreignObject>div,.mg-x6 foreignObject>body>div{background:0 0;margin:0;padding:0}.mg-x6 .x6-graph{background:0 0}.mg-x6-loading{color:var(--muted-2);letter-spacing:.4px;place-items:center;font-size:12px;display:grid;position:absolute;top:0;bottom:0;left:0;right:0}.mg-x6 .x6-node{overflow:visible}.mg-x6 .x6-node:focus{outline:none}.mg-x6 .x6-node:focus-visible{outline:none}.mgx-card{cursor:grab;-webkit-user-select:none;user-select:none;background:linear-gradient(#111823 0%,#0b1119 100%);border:1px solid #ffffff16;border-radius:12px;flex-direction:column;justify-content:center;gap:3px;padding:8px 11px;font-family:inherit;transition:border-color .16s,box-shadow .16s,opacity .16s,transform .16s;display:flex;overflow:hidden;box-shadow:inset 0 1px #ffffff0d,0 10px 24px -14px #000000e6}.mgx-card:active{cursor:grabbing}.mgx-card:before{content:\"\";opacity:.75;border-radius:2px;width:2px;position:absolute;top:12%;bottom:12%;left:0}.mgx-card.zone-anchor:before{background:#9c8bd8}.mgx-card.zone-commodity:before{background:#d8a25c}.mgx-card.zone-hedge:before{background:#6fb4d8}.mgx-card.zone-risk:before{background:#8b97a8}.mgx-card.zone-anchor{border-color:#9c8bd842}.mgx-card.zone-commodity{border-color:#d8a25c42}.mgx-card.zone-hedge{border-color:#6fb4d842}.mgx-card.is-focus,.mgx-card.is-pair{border-color:#f59e0b9e;box-shadow:0 0 0 1px #f59e0b3d,0 10px 26px -12px #f59e0b52}.mgx-card.is-hot,.mgx-card.is-spot{border-color:#e8edf580;transform:translateY(-1px);box-shadow:0 0 0 1px #e8edf529,0 14px 30px -14px #000000f2}.mgx-card.is-dim{opacity:.24}.mg-x6.mgx-spot .mgx-card.is-dim{opacity:.16}.mgx-head{justify-content:space-between;align-items:center;gap:6px;min-width:0;display:flex}.mgx-name{letter-spacing:.2px;color:var(--text);white-space:nowrap;text-overflow:ellipsis;font-size:12px;font-weight:600;overflow:hidden}.mgx-zone{color:var(--muted-2);white-space:nowrap;border:1px solid #ffffff13;border-radius:999px;flex:none;padding:2px 5px;font-size:9px;line-height:1}.mgx-chip{white-space:nowrap;border:1px solid #0000;border-radius:999px;flex:none;padding:2.5px 6px;font-size:9px;line-height:1}.mgx-chip.pos{color:#ff9fad;background:#241015;border-color:#f5455c99}.mgx-chip.src{color:#ffb3bd;background:#2a1116;border-color:#f5455cd9}.mgx-chip.cold{color:#a9c8ff;background:#0e1726;border-color:#5b9cf899}.mgx-chip.mix{color:#f8c063;background:#241a06;border-color:#f59e0bd9;animation:2.1s ease-in-out infinite mgx-chip-breathe}@keyframes mgx-chip-breathe{0%,to{box-shadow:0 0 #f59e0b00}50%{box-shadow:0 0 0 3px #f59e0b29}}.mgx-mid{justify-content:space-between;align-items:baseline;gap:8px;min-width:0;display:flex}.mgx-price{font-family:var(--mono);letter-spacing:-.2px;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap;font-size:15px;font-weight:600}.mgx-price.up{color:var(--up)}.mgx-price.down{color:var(--down)}.mgx-chg{font-family:var(--mono);font-variant-numeric:tabular-nums;color:var(--flat);white-space:nowrap;font-size:10.5px;font-style:normal}.mgx-chg.up{color:var(--up)}.mgx-chg.down{color:var(--down)}.mgx-sub{color:var(--muted-2);white-space:nowrap;border-top:1px dashed #ffffff12;align-items:baseline;gap:5px;padding-top:3px;font-size:9.5px;display:flex;overflow:hidden}.mgx-sub span{flex:none}.mgx-sub b{font-family:var(--mono);color:var(--muted);font-variant-numeric:tabular-nums;font-weight:500}.mgx-sub i{font-family:var(--mono);font-variant-numeric:tabular-nums;margin-left:auto;font-style:normal}.mgx-sub i.up{color:#f5455cd9}.mgx-sub i.down{color:#0ecb81d9}.mgx-card--lg{border-width:1.5px;padding:10px 13px}.mgx-card--lg .mgx-name{font-size:13.5px}.mgx-card--lg .mgx-price{font-size:17px}.mgx-card--lg .mgx-chg{font-size:11px}.mgx-bandlabel{letter-spacing:.7px;white-space:nowrap;color:var(--muted-2);background:#080b10eb;border:1px solid #ffffff0f;border-radius:999px;align-items:center;padding:0 9px;font-size:10px;display:flex}.mgx-bandlabel.anchor{color:#9c8bd8;border-color:#9c8bd840}.mgx-bandlabel.commodity{color:#d8a25c;border-color:#d8a25c40}.mgx-bandlabel.hedge{color:#6fb4d8;border-color:#6fb4d840}.mgx-bandlabel.risk{color:var(--muted)}.mgx-orphan{color:#f8c063;background:#241a069e;border:1px dashed #f59e0b80;border-radius:12px;flex-direction:column;gap:5px;padding:10px 13px;font-size:10px;line-height:1.5;display:flex}.mgx-orphan b{font-size:11px}.mg-x6 .x6-port-body{transition:r .12s,stroke .12s}.mg-x6 .x6-node:hover .x6-port-body{stroke:#e8edf5bf}.mg-x6 .x6-edge{transition:opacity .16s}.mg-x6 .x6-edge[data-cell-id^=flow-] path{animation:1.6s linear infinite mgx-flow}@keyframes mgx-flow{to{stroke-dashoffset:-34px}}.mg-x6 .x6-edge:hover path:nth-child(2),.mg-x6 .x6-edge.edge-hover path:nth-child(2){stroke-width:inherit}.mgx-tools{z-index:20;-webkit-backdrop-filter:blur(10px);background:#090d13e0;border:1px solid #ffffff14;border-radius:11px;align-items:center;gap:5px;padding:5px;display:flex;position:absolute;bottom:12px;left:12px;box-shadow:0 10px 26px -16px #000000f2}.mgx-tbtn{-webkit-appearance:none;appearance:none;color:var(--muted);cursor:pointer;background:#ffffff08;border:1px solid #ffffff12;border-radius:8px;min-width:24px;height:24px;padding:0 7px;font-family:inherit;font-size:11px;line-height:1;transition:color .14s,border-color .14s,background .14s}.mgx-tbtn.wide{white-space:nowrap;padding:0 9px}.mgx-tbtn:hover{color:var(--text);background:#ffffff12;border-color:#fff3}.mgx-tbtn:active{transform:translateY(.5px)}.mgx-zoom{font-family:var(--mono);color:var(--muted-2);font-variant-numeric:tabular-nums;text-align:right;min-width:34px;padding:0 4px 0 2px;font-size:10px}@media (max-width:1100px){.mg-x6{height:560px}}@media (max-width:760px){.mg-x6{height:460px}.mgx-tools .mgx-tbtn.wide{display:none}}@media (prefers-reduced-motion:reduce){.mg-x6 .x6-edge path{animation:none!important}.mgx-chip.mix{animation:none}.mgx-card{transition:none}}.mgx-pill-wrap{pointer-events:none;justify-content:center;align-items:center;display:flex}.mgx-pill{letter-spacing:.1px;white-space:nowrap;pointer-events:auto;cursor:pointer;background:#0b1017;border:1px solid;border-radius:999px;justify-content:center;align-items:center;width:100%;height:100%;font-size:9.5px;line-height:1;transition:border-color .14s,background .14s;display:flex}.mg-x6 .mgx-pill.pos{color:#ff8d9c;border-color:#f5455c80}.mg-x6 .mgx-pill.neg{color:#8fbcf7;border-color:#5b9cf880}.mg-x6 .mgx-pill.div{color:#f8c063;border-style:dashed;border-color:#f59e0bb3}.mgx-pill.is-hot{background:#121a24;border-width:1.4px}.mgx-pill.pos.is-hot{border-color:#f5455cf2}.mgx-pill.neg.is-hot{border-color:#5b9cf8f2}.mgx-pill.div.is-hot{border-color:#f59e0b}.mgx-pill:hover{background:#16202c}", dA = ".macro-graph-section", fA = ".mg-x6", pA = !1;
function mA() {
	if (pA || typeof document > "u") return;
	let e = document.createElement("style");
	e.id = "macro-flow-css", e.textContent = uA, document.head.appendChild(e), pA = !0;
}
var hA = /* @__PURE__ */ new WeakMap();
function gA(e, t, n) {
	let r = e.querySelector(dA);
	return r && r.querySelector(fA) || (xA(e), e.innerHTML = lA(t, n, { legend: !0 }), r = e.querySelector(dA)), r;
}
function _A(e, t, n) {
	let r = e.querySelector(t);
	if (!n) {
		r?.remove();
		return;
	}
	let i = document.createElement("div");
	i.innerHTML = n.trim();
	let a = i.firstElementChild;
	a && (r ? r.replaceWith(a) : e.querySelector(".graph-stage").before(a));
}
function vA(e, t, n, r) {
	_A(e, ".mg-head", oA(n)), _A(e, ".mg-tools", sA(t, n, r));
	for (let t of e.querySelectorAll(".mg-alert")) t.remove();
	let i = tA(t, r);
	if (i) {
		let t = document.createElement("div");
		t.innerHTML = i.trim();
		let n = t.firstElementChild;
		n && e.querySelector(".graph-stage").before(n);
	}
	_A(e, ".mg-focusbar", n.graphMode === "mindmap" ? cA(t, n) : ""), _A(e, ".mg-shockbar", n.graphMode === "sandbox" ? cA(t, n) : ""), _A(e, ".mg-legend", aA(n.graphMode ?? "compass")), _A(e, ".graph-card", `<aside class="graph-card">${nA(t, n, r)}</aside>`);
}
function yA(e) {
	if (e.graphMode === "sandbox" && e.shock) {
		let t = fe(e.shock.id, e.shock.dir), n = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Set([e.shock.id]);
		for (let [e, i] of t) {
			r.add(e);
			for (let e of i.paths) n.add(e.edges);
		}
		return {
			prop: t,
			active: {
				edges: n,
				nodes: r
			}
		};
	}
	if (e.graphMode === "compass" && e.playbook) {
		let t = E.get(e.playbook) ?? null;
		if (t) {
			let e = /* @__PURE__ */ new Set([...t.edges, ...t.breaks]), n = /* @__PURE__ */ new Set();
			for (let t of e) {
				let e = S.get(t);
				e && (n.add(e.from), n.add(e.to));
			}
			return {
				prop: null,
				active: {
					edges: e,
					nodes: n
				}
			};
		}
	}
	return {
		prop: null,
		active: null
	};
}
function bA(e, t, n, r = {}) {
	if (!e || !t) return;
	mA();
	let i = le(t), a = gA(e, t, n), { prop: o, active: s } = yA(n), c = ue(n.pair?.[0], n.pair?.[1]), l = /* @__PURE__ */ new Set();
	c && l.add(c.id);
	let u = hA.get(e), d = a.querySelector(fA);
	return !u && d && (d.innerHTML = "", u = new Gk(d, {
		onEdge: (e) => r.onEdge?.(e),
		onNode: (e) => r.onNode?.(e),
		onNodeDbl: (e) => r.onNodeDbl?.(e)
	}), hA.set(e, u), typeof window < "u" && (window.__mgxCanvas = u)), vA(a, t, n, i), u?.update({
		data: t,
		state: n,
		reality: i,
		prop: o,
		pairEdge: c,
		activeEdges: s,
		hotEdgeIds: l
	}), {
		reality: i,
		section: a,
		canvas: u
	};
}
function xA(e) {
	hA.get(e)?.dispose(), hA.delete(e);
}
export { C as CORE_EDGES, b as MODES, xA as destroyMacroFlow, bA as renderMacroFlow };
