/* ================================================================== *
 * 事件关键词词典：主题规则 · 地区词 · 影响动词
 *
 * 为什么单独成模块：这是「领域知识」而不是「流程」，它会被事件服务、归档、
 * 前端筛选共用，且规模会持续增长（每加一个语种就多一列）。混在服务里会把
 * 743 行的业务流程埋掉。
 *
 * ## 为什么要多语言
 *
 * 接入全球 feed 之前，词表只有中文。用一份 290 条的真实国际样本量过：
 * 中文词表只命中 7 条（2%）—— 英语 138 条命中 3 条、德法西葡俄阿土印地
 * 全部 0 条。也就是说「抓到了但全被分类器丢掉」，这才是事件中心看起来
 * 只有国内新闻的真正原因。同一个测试里，中文样本的命中率是 30%。
 *
 * ## 两条防误判规则
 *
 * 1. **英文词按词边界匹配，不按子串。** `includes('war')` 会命中 software、
 *    warning、reward；`includes('or')` 命中一切。纯 ASCII 词一律走正则，
 *    中日韩阿泰等无词边界语言才用子串。
 *
 * 2. **高风险泛词只在标题里算数（titleOnly）。** 英文的 "war on inflation"、
 *    "price war"、"strikes a deal"、"attack on the plan" 大量是比喻，出现在
 *    正文里不能当地缘冲突 —— 而地缘政治是 weight 3 主题，正文命中折算 2.1
 *    已越过 1.5 的收录门槛，会直接把一条普通稿判成「重要」并连上黄金/原油/VIX
 *    的冲击弧线。中文不存在这个语言现象（「战争/袭击」在中文正文里基本是实指），
 *    所以 titleOnly 只用于英文那几个词。
 * ================================================================== */

/** 主题规则：命中任意关键词打上该主题，并关联受影响标的 */
export const TOPIC_RULES = [
  {
    key: 'fed', label: '货币政策', weight: 3,
    words: ['美联储', '加息', '降息', 'FOMC', '利率决议', '鲍威尔', '议息', '点阵图', '缩表', '扩表', 'QE', 'Taper', '联邦基金利率', '贴现率', '超额准备金'],
    intl: {
      en: ['Federal Reserve', 'FOMC', 'Powell', 'policy rate', 'rate cut', 'rate hike', 'rate decision', 'monetary policy', 'quantitative easing', 'tapering', 'interest-rate decision', 'central bank'],
      ja: ['利上げ', '利下げ', '政策金利', '日銀', 'FRB', '金融政策', '追加利上げ'],
      de: ['Leitzins', 'Zinserhöhung', 'Zinssenkung', 'EZB', 'Geldpolitik', 'Notenbank', 'Zinspause'],
      fr: ['taux directeur', 'BCE', 'politique monétaire', 'hausse des taux', 'baisse des taux', 'Réserve fédérale'],
      es: ['tasa de interés', 'tipos de interés', 'política monetaria', 'recorte de tipos', 'subida de tipos', 'Reserva Federal'],
      pt: ['taxa de juros', 'Selic', 'política monetária', 'corte de juros', 'alta de juros'],
      it: ['tasso di interesse', 'politica monetaria', 'taglio dei tassi', 'aumento dei tassi', 'Banca Centrale Europea'],
      ru: ['ключевая ставка', 'ЦБ РФ', 'ФРС', 'денежно-кредитная политика', 'повышение ставки', 'снижение ставки'],
      ar: ['الفائدة', 'الفيدرالي', 'البنك المركزي', 'السياسة النقدية', 'رفع الفائدة', 'خفض الفائدة'],
      ko: ['기준금리', '금리 인상', '금리 인하', '금리 동결', '연준', '한국은행', '통화정책'],
      tr: ['faiz kararı', 'faiz artırımı', 'faiz indirimi', 'Merkez Bankası', 'para politikası'],
      hi: ['ब्याज दर', 'मौद्रिक नीति', 'फेड', 'आरबीआई'],
    },
    symbols: ['us10y', 'dxy', 'sp500', 'ndx100', 'gold-intl', 'btc'],
  },
  {
    key: 'inflation', label: '通胀', weight: 3,
    words: ['CPI', 'PPI', '通胀', '通膨', '物价', 'PCE', '消费者物价', '生产者物价', '核心CPI', '通胀预期'],
    intl: {
      en: ['inflation', 'CPI', 'PPI', 'PCE', 'consumer prices', 'producer prices', 'core inflation', 'price growth', 'deflation', 'cost of living'],
      ja: ['インフレ', '物価', '消費者物価', 'デフレ', 'コアCPI'],
      de: ['Inflation', 'Inflationsrate', 'Verbraucherpreise', 'Teuerung', 'Erzeugerpreise'],
      fr: ['inflation', 'prix à la consommation', 'prix à la production'],
      es: ['inflación', 'precios al consumidor', 'IPC', 'deflación'],
      pt: ['inflação', 'IPCA', 'preços ao consumidor', 'deflação'],
      it: ['inflazione', 'prezzi al consumo'],
      ru: ['инфляция', 'потребительские цены', 'дефляция'],
      ar: ['التضخم', 'أسعار المستهلكين'],
      ko: ['물가', '소비자물가', '인플레이션'],
      tr: ['enflasyon', 'TÜFE', 'ÜFE'],
      hi: ['महंगाई', 'मुद्रास्फीति'],
    },
    symbols: ['us10y', 'gold-intl', 'dxy', 'sp500'],
  },
  {
    key: 'jobs', label: '就业', weight: 3,
    words: ['非农', '失业率', '就业人数', 'ADP', '初请', '续请', '薪资', '劳动参与率', '裁员'],
    intl: {
      en: ['nonfarm', 'non-farm', 'payrolls', 'unemployment', 'jobless claims', 'ADP', 'labor market', 'hiring', 'layoffs', 'jobs report', 'wage growth'],
      ja: ['雇用統計', '失業率', '非農業部門', '新規失業保険'],
      de: ['Arbeitsmarkt', 'Arbeitslosigkeit', 'Arbeitslosenquote', 'Stellenabbau'],
      fr: ['chômage', 'marché du travail', 'destructions d\'emplois', 'salaires'],
      es: ['desempleo', 'paro', 'mercado laboral', 'salarios'],
      pt: ['desemprego', 'mercado de trabalho', 'salários'],
      it: ['disoccupazione', 'occupazione', 'mercato del lavoro'],
      ru: ['безработица', 'рынок труда', 'занятость'],
      ar: ['البطالة', 'سوق العمل', 'الوظائف'],
      ko: ['고용', '실업률', '일자리'],
      tr: ['işsizlik', 'istihdam'],
      hi: ['बेरोजगारी', 'रोजगार'],
    },
    symbols: ['us10y', 'dxy', 'sp500', 'ndx100'],
  },
  {
    key: 'geopolitics', label: '地缘政治', weight: 3,
    words: ['战争', '冲突', '制裁', '袭击', '空袭', '轰炸', '封锁', '禁运', '关税', '贸易战', '升级', '停火', '入侵', '政变', '弹劾'],
    // 英文这几个人人都在用的比喻词只在标题里算数（见文件头说明）
    titleOnly: ['war', 'attack', 'strikes', 'conflict', 'escalation', 'invasion'],
    intl: {
      en: ['sanctions', 'airstrike', 'air strike', 'missile', 'tariff', 'trade war', 'ceasefire', 'coup', 'embargo', 'military strike', 'military aid', 'border clash'],
      ja: ['戦争', '紛争', '制裁', '攻撃', '関税', '停戦', '侵攻', '軍事'],
      de: ['Krieg', 'Konflikt', 'Sanktionen', 'Angriff', 'Zölle', 'Handelskrieg', 'Waffenstillstand'],
      fr: ['guerre', 'conflit', 'sanctions', 'attaque', 'droits de douane', 'cessez-le-feu'],
      es: ['guerra', 'conflicto', 'sanciones', 'ataque', 'aranceles', 'alto el fuego'],
      pt: ['guerra', 'conflito', 'sanções', 'ataque', 'tarifas', 'cessar-fogo'],
      it: ['guerra', 'conflitto', 'sanzioni', 'attacco', 'dazi', 'tregua'],
      ru: ['война', 'конфликт', 'санкции', 'атака', 'пошлины', 'перемирие'],
      ar: ['الحرب', 'الصراع', 'العقوبات', 'هجوم', 'الرسوم الجمركية', 'وقف إطلاق النار'],
      ko: ['전쟁', '분쟁', '제재', '공격', '관세', '무역전쟁', '휴전'],
      tr: ['savaş', 'çatışma', 'yaptırım', 'saldırı', 'gümrük vergisi', 'ateşkes'],
      hi: ['युद्ध', 'संघर्ष', 'प्रतिबंध', 'हमला', 'टैरिफ'],
    },
    symbols: ['gold-intl', 'oil', 'vix'],
  },
  // 选举本身不是价格传导事件：绝大多数是政治八卦与民调播报。
  // 单列成低权主题、不挂任何标的，落在事件流里可看，但不会被判 high、也不连冲击弧线。
  {
    key: 'politics', label: '选举政治', weight: 1.2,
    words: ['选举', '大选', '中期选举', '投票', '民调', '初选', '竞选'],
    intl: {
      en: ['election', 'polls', 'ballot', 'referendum'],
      ja: ['選挙', '投開票', '世論調査'],
      de: ['Wahl', 'Umfrage'],
      fr: ['élection', 'sondage'],
      es: ['elecciones', 'encuesta'],
      pt: ['eleição', 'pesquisa'],
      it: ['elezioni', 'sondaggio'],
      ru: ['выборы', 'опрос'],
      ar: ['انتخابات', 'استطلاع'],
      ko: ['선거', '여론조사'],
      tr: ['seçim', 'anket'],
      hi: ['चुनाव'],
    },
    symbols: [],
  },
  {
    key: 'energy', label: '能源', weight: 2,
    words: ['OPEC', '欧佩克', '减产', '增产', '原油', '油价', '天然气', '炼油', '库存', '页岩', '钻井', '管道'],
    intl: {
      en: ['OPEC', 'crude', 'oil price', 'oil prices', 'natural gas', 'refinery', 'barrel', 'Brent', 'WTI', 'pipeline', 'drilling', 'shale', 'LNG'],
      ja: ['原油', '石油', '天然ガス', '減産', '増産'],
      de: ['Ölpreis', 'Rohöl', 'Erdgas', 'Förderkürzung'],
      fr: ['pétrole', 'brut', 'gaz naturel', 'OPEP'],
      es: ['petróleo', 'crudo', 'gas natural', 'OPEP'],
      pt: ['petróleo', 'gás natural', 'OPEP'],
      it: ['petrolio', 'greggio', 'gas naturale'],
      ru: ['нефть', 'газ', 'ОПЕК', 'баррель'],
      ar: ['النفط', 'الغاز', 'أوبك', 'برميل'],
      ko: ['유가', '원유', '천연가스'],
      tr: ['petrol', 'doğal gaz'],
      hi: ['कच्चा तेल', 'ओपेक'],
    },
    symbols: ['oil', 'brent'],
  },
  {
    key: 'precious', label: '贵金属', weight: 2,
    words: ['黄金', '金价', '白银', '避险', '金饰', '央行购金', '金矿', '现货金'],
    // 'or'/'oro' 在法/西语里是高频连词，单字不要
    intl: {
      en: ['gold price', 'gold prices', 'spot gold', 'silver price', 'bullion', 'safe haven', 'precious metal'],
      ja: ['金価格', '金相場', '貴金属', '安全資産'],
      de: ['Goldpreis', 'Silber', 'Edelmetall'],
      fr: ['cours de l\'or', 'prix de l\'or', 'métal précieux'],
      es: ['precio del oro', 'plata', 'metal precioso'],
      pt: ['preço do ouro', 'prata', 'metal precioso'],
      it: ['prezzo dell\'oro', 'argento', 'metallo prezioso'],
      ru: ['золото', 'серебро', 'драгметалл'],
      ar: ['الذهب', 'الفضة', 'المعادن النفيسة'],
      ko: ['금값', '금 시세', '귀금속'],
      tr: ['altın fiyatı', 'gümüş'],
      hi: ['सोने का भाव', 'चांदी'],
    },
    symbols: ['gold-intl', 'gold-cn'],
  },
  {
    key: 'crypto', label: '加密资产', weight: 2,
    words: ['比特币', 'BTC', '以太坊', 'ETH', '加密', '稳定币', '币安', 'Coinbase', '数字资产', '现货ETF'],
    intl: {
      en: ['Bitcoin', 'BTC', 'Ethereum', 'ether', 'crypto', 'stablecoin', 'Binance', 'Coinbase', 'digital asset'],
      ja: ['ビットコイン', '暗号資産', 'イーサリアム'],
      de: ['Bitcoin', 'Krypto', 'Kryptowährung'],
      fr: ['bitcoin', 'crypto', 'actif numérique'],
      es: ['bitcóin', 'criptomoneda', 'activo digital'],
      pt: ['bitcoin', 'criptomoeda'],
      it: ['bitcoin', 'criptovaluta'],
      ru: ['биткоин', 'криптовалюта'],
      ar: ['بيتكوين', 'العملات المشفرة'],
      ko: ['비트코인', '가상자산', '암호화폐'],
      tr: ['bitcoin', 'kripto para'],
      hi: ['बिटकॉइन', 'क्रिप्टो'],
    },
    symbols: ['btc'],
  },
  {
    key: 'china', label: '中国政策', weight: 2,
    words: ['国务院', '发改委', '财政部', '证监会', '人民银行', '央行', '降准', 'LPR', 'MLF', '专项债', '政治局', '刺激政策', '一揽子'],
    intl: {
      en: ['PBOC', 'People\'s Bank of China', 'State Council', 'NDRC', 'CSRC', 'China stimulus', 'Politburo', 'Chinese economy', 'Beijing stimulus'],
      ja: ['中国人民銀行', '中国国務院', '中国経済', '人民元'],
      de: ['Chinas Notenbank', 'Staatsrat', 'Konjunkturpaket'],
      fr: ['banque centrale chinoise', 'plan de relance'],
      es: ['banco central chino', 'estímulo económico'],
      pt: ['banco central chinês', 'estímulo'],
      it: ['banca centrale cinese', 'stimoli'],
      ru: ['Народный банк Китая', 'Госсовет КНР', 'стимулы'],
      ar: ['البنك المركزي الصيني', 'التحفيز'],
      ko: ['중국 인민은행', '중국 경기부양'],
      tr: ['Çin Merkez Bankası', 'teşvik paketi'],
      hi: ['पीपुल्स बैंक ऑफ चाइना', 'चीन प्रोत्साहन'],
    },
    symbols: ['sh000001', 'gold-cn'],
  },
  {
    key: 'equities', label: '权益市场', weight: 2,
    words: ['纳斯达克', '标普', '道琼斯', '美股', '财报', '英伟达', '苹果', '特斯拉', '微软', '科技股', 'A股', '沪指', '恒生'],
    intl: {
      en: ['S&P 500', 'Nasdaq', 'Dow Jones', 'Wall Street', 'earnings', 'Nvidia', 'Tesla', 'stock market', 'stocks fall', 'stocks rise', 'shares slump', 'IPO'],
      ja: ['日経平均', '東証', '株価', '決算', '相場'],
      de: ['DAX', 'Aktien', 'Quartalszahlen', 'Börse', 'Kursrutsch'],
      fr: ['CAC 40', 'Bourse', 'actions', 'résultats'],
      es: ['Ibex', 'bolsa', 'acciones', 'resultados'],
      pt: ['Ibovespa', 'bolsa', 'ações', 'balanço'],
      it: ['FTSE MIB', 'Borsa', 'azioni', 'trimestrale'],
      ru: ['индекс', 'акции', 'Мосбиржа', 'отчётность'],
      ar: ['البورصة', 'الأسهم', 'تاسي'],
      ko: ['코스피', '주가', '증시', '실적'],
      tr: ['Borsa İstanbul', 'hisse', 'bilanço'],
      hi: ['शेयर बाजार', 'सेंसेक्स', 'निफ्टी'],
    },
    symbols: ['sp500', 'ndx100', 'sh000001'],
  },
  {
    key: 'rates', label: '债市', weight: 2,
    words: ['国债', '收益率', '美债', '债券', '收益率曲线', '期限利差', '拍卖'],
    intl: {
      en: ['Treasury yield', 'bond yield', 'yields', 'bond market', 'debt auction', 'gilts', 'bunds'],
      ja: ['国債', '利回り', '債券'],
      de: ['Rendite', 'Anleihen', 'Bundesanleihe'],
      fr: ['rendement', 'obligations'],
      es: ['rendimiento', 'bonos'],
      pt: ['juros futuros', 'títulos públicos'],
      it: ['rendimento', 'obbligazioni'],
      ru: ['доходность', 'облигации', 'ОФЗ'],
      ar: ['سندات', 'العائد'],
      ko: ['국채', '채권'],
      tr: ['tahvil', 'getiri'],
      hi: ['बॉन्ड', 'प्रतिफल'],
    },
    symbols: ['us10y'],
  },
  {
    key: 'fx', label: '汇率', weight: 1,
    words: ['美元指数', '人民币', '日元', '欧元', '汇率', '升值', '贬值', '外汇', '中间价'],
    // 权重 1 的主题正文命中折算 0.7，本就过不了 1.5 的收录门槛，无需 titleOnly
    intl: {
      en: ['dollar', 'euro', 'yen', 'yuan', 'currency', 'exchange rate', 'forex', 'greenback'],
      ja: ['為替', 'ドル円', '円相場', '円安', '円高'],
      de: ['Wechselkurs', 'Eurokurs', 'Dollar'],
      fr: ['taux de change', 'euro', 'dollar'],
      es: ['tipo de cambio', 'dólar', 'euro'],
      pt: ['câmbio', 'dólar', 'real'],
      it: ['cambio', 'dollaro', 'euro'],
      ru: ['рубль', 'доллар', 'курс'],
      ar: ['الدولار', 'سعر الصرف'],
      ko: ['환율', '달러', '원화'],
      tr: ['dolar', 'döviz kuru'],
      hi: ['डॉलर', 'रुपया'],
    },
    symbols: ['dxy'],
  },
  {
    key: 'macro', label: '宏观数据', weight: 1,
    words: ['GDP', 'PMI', '工业产出', '零售销售', '贸易帐', '进出口', '工业增加值', '社融', '信贷', '库存'],
    intl: {
      en: ['GDP', 'PMI', 'retail sales', 'trade balance', 'industrial production', 'recession', 'economic growth', 'trade deficit'],
      ja: ['鉱工業生産', '小売売上', '景気'],
      de: ['BIP', 'Einzelhandel', 'Industrieproduktion', 'Rezession'],
      fr: ['PIB', 'production industrielle', 'récession'],
      es: ['PIB', 'producción industrial', 'recesión'],
      pt: ['PIB', 'produção industrial', 'recessão'],
      it: ['PIL', 'produzione industriale', 'recessione'],
      ru: ['ВВП', 'промпроизводство', 'рецессия'],
      ar: ['الناتج المحلي', 'الركود'],
      ko: ['생산', '경기침체', '성장률'],
      tr: ['GSYİH', 'resesyon', 'büyüme'],
      hi: ['जीडीपी', 'मंदी'],
    },
    symbols: ['sp500', 'sh000001'],
  },
];

/**
 * 关键词兜底的地区推断（LLM 会覆盖它，feed 语种会兜底它）
 *
 * ## 顺序决定正确性
 *
 * 匹配是「首个命中的地区胜出」，所以数组顺序就是优先级，必须**从特异到宽泛**。
 * 原来 cn 排第一，而它的词表里有裸词「央行」—— 于是「欧洲央行贷款调查」
 * 「日本央行维持利率」全被判成中国。实测接上全球源后这类错误占了一半以上。
 *
 * 同理：us 词表原来有裸词「财政部」，会把「财政部发布专项债」判成美国
 * （中文语境里「财政部」默认指中国财政部，美国的一定写成「美国财政部」，
 * 而「美国」两个字本身already命中 us）。这个已被移到 cn。
 */
export const REGION_WORDS = [
  // 特异地区先行：这些词一旦出现，指向性最强，不会被宽泛词抢走
  ['me', ['中东', '伊朗', '伊朗人', '以色列', '沙特', '也门', '胡塞', '阿联酋', '伊拉克', '卡塔尔', '叙利亚', '加沙', '土耳其', '阿富汗', '黎巴嫩', '约旦', '科威特', '阿曼', '巴林',
    'Middle East', 'Iran', 'Iranian', 'Israel', 'Israeli', 'Saudi', 'Yemen', 'Houthi', 'UAE', 'Emirates', 'Iraq', 'Qatar', 'Syria', 'Gaza', 'Riyadh', 'Netanyahu',
    'Turkey', 'Turkish', 'Türkei', 'Türkiye', 'CBRT', 'Merkez Bankası', 'Anadolu', 'Turquía', 'Turquie', 'Turchia', 'Турция', '터키', 'तुर्की', 'إيران', 'إسرائيل', 'السعودية', 'تركيا']],
  ['latam', ['巴西', '阿根廷', '墨西哥', '智利', '委内瑞拉', '哥伦比亚', '秘鲁', '乌拉圭', '厄瓜多尔', '玻利维亚',
    'Brazil', 'Brazilian', 'Argentin', 'Mexico', 'Mexican', 'Chile', 'Venezuela', 'Colombia', 'Peru', 'Brasil', 'Brasilien', 'BCB', 'Banxico', 'Ibovespa', 'Bovespa', 'Brasilien', 'Brésil', 'Brasile', 'Бразилия', 'Mexiko', 'Mexique', 'México', 'Мехико', 'Мексика', 'البرازيل', '브라질']],
  ['africa', ['南非', '埃及', '尼日利亚', '非洲', '肯尼亚', '摩洛哥', '加纳', '埃塞俄比亚', '坦桑尼亚', '阿尔及利亚',
    'South Africa', 'Egypt', 'Nigeria', 'Africa', 'Kenya', 'Morocco', 'Ghana', 'Ethiopia', 'SARB', 'CBN', 'Ägypten', 'Египет', 'مصر']],
  ['asia', ['韩国', '印度', '新加坡', '越南', '泰国', '印尼', '印度尼西亚', '马来西亚', '菲律宾', '台湾', '巴基斯坦', '孟加拉', '斯里兰卡', '缅甸', '柬埔寨',
    'Korea', 'Korean', 'India', 'Indian', 'Singapore', 'Vietnam', 'Thailand', 'Indonesia', 'Malaysia', 'Philippines', 'Taiwan', 'Pakistan', 'Bangladesh',
    'Corée', 'Inde', 'Indien', 'Corea', 'RBI', 'NSE', 'BSE', 'Sensex', 'Nifty', '한국은행', 'Australia', 'Australien', 'Australie', 'Австралия', 'أستراليا', '호주', 'Indonesia', 'Indonesien', 'Indonésie', 'Индония', '인도네시아', 'Việt Nam', 'Viet Nam', 'Индия', 'الهند', '한국', '인도']],
  ['jp', ['日本', '东京', '日本央行', '日元', '日经', '大阪',
    'Japan', 'Japanese', 'Tokyo', 'Bank of Japan', 'BOJ', 'Nikkei', 'yen',
    'Japon', 'japonais', 'Japón', '日銀', '東証', 'JPX', 'Япония', 'اليابان', '일본']],
  ['uk', ['英国', '伦敦', '英国央行', '英镑', '英格兰银行',
    'United Kingdom', 'Britain', 'British', 'London', 'Bank of England', 'BoE', 'sterling', 'gilts',
    'Royaume-Uni', 'britannique', 'Reino Unido', 'Gran Bretaña', 'FCA', 'LSE', 'FTSE', 'Великобритания']],
  ['eu', ['欧元区', '欧盟', '德国', '法国', '欧洲央行', '拉加德', '意大利', '西班牙', '布鲁塞尔', '荷兰', '比利时', '奥地利', '瑞士', '瑞典', '挪威', '丹麦', '芬兰', '波兰', '希腊', '葡萄牙', '爱尔兰', '捷克', '匈牙利', '欧洲',
    'euro area', 'eurozone', 'European Union', 'European Central Bank', 'ECB', 'Germany', 'German', 'France', 'French',
    'Italy', 'Italian', 'Spain', 'Spanish', 'Brussels', 'Netherlands', 'Belgium', 'Austria', 'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Finland',
    'Poland', 'Greece', 'Portugal', 'Ireland', 'Czech', 'Hungary', 'Europe', 'Europas', 'Deutschland', 'Deutsch', 'allemand', 'Alemania',
    'Germania', 'Bundesbank', 'Bundesregierung', 'Berlin', 'Russia', 'Russland', 'Russie', 'Rusia', 'Rússia', 'Россия', 'روسيا', '러시아', 'रूस', 'Moscow', 'Москва', 'Moskau', 'Banque de France', 'Banca d\'Italia', 'Banco de España', 'BaFin', 'DAX', 'CAC 40', 'IBEX', 'Германия', 'ألمانيا', '유럽']],
  ['us', ['美国', '美联储', '华盛顿', '纽约', '纳斯达克', '标普', '道琼斯', '白宫', '鲍威尔', '硅谷', '加拿大', '多伦多',
    'United States', 'U.S.', 'Washington', 'New York', 'Federal Reserve', 'Wall Street', 'White House', 'Powell', 'Nasdaq',
    'USA', 'Canada', 'Canadian', 'SEC', 'NYSE', 'S&P 500', 'Dow Jones', 'Nasdaq', 'États-Unis', 'Vereinigte Staaten', 'Stati Uniti', 'Estados Unidos', 'Соединенные Штаты', 'アメリカ', 'アメリカ合衆国', 'États-Unis', 'Estados Unidos', 'США', 'الولايات المتحدة', '미국']],
  // 最后才是宽泛的中文词：「央行」「财政部」这类在中文财经稿里默认指中国
  ['cn', ['中国', '北京', '上海', '国务院', '发改委', '央行', '人民币', 'A股', '沪深', '证监会', '财政部', '深圳', '广州', '人民银行', '中国人民银行',
    'China', 'Chinese', 'Beijing', 'Shanghai', 'PBOC', 'yuan', 'Chinas',
    '中国経済', 'Chinesen', 'chine', 'CSRC', 'HKEX', '恒生', '香港', '台湾', 'صيني', '중국']],
];

/** 高影响动词：出现时额外加权，这类词往往意味着盘面会动 */
export const IMPACT_WORDS = [
  '暴跌', '暴涨', '崩盘', '熔断', '创历史', '创新高', '创新低', '紧急', '意外', '大幅', '远超预期', '不及预期', '超预期', '暂停', '禁止', '批准', '通过', '签署',
  'plunge', 'plunges', 'plummet', 'plummets', 'surge', 'surges', 'soar', 'soars', 'slump', 'slumps',
  'crash', 'crashes', 'tumble', 'tumbles', 'rout', 'sell-off', 'selloff', 'record high', 'record low',
  'unexpected', 'unexpectedly', 'emergency', 'halt', 'halted', 'suspend', 'suspended', 'ban', 'bans',
  'shock', 'shocks', 'steeper', 'biggest',
  '暴落', '急落', '急騰', '最高値', '最安値', 'Einbruch', 'Absturz', 'Rekordhoch', 'Rekordtief',
  'effondrement', 'chute', 'flambée', 'record', 'desplome', 'caída', 'récord', 'derrumbe',
  'despenca', 'dispara', 'recorde', 'crollo', 'tonfo', 'record', 'обвал', 'рекорд', 'انهيار', 'قياسي',
  '폭락', '폭등', '사상 최고', 'çöküş', 'rekor', 'रिकॉर्ड',
];

/** 气象词：用于把「风暴袭击欧洲」和「空袭伊朗」区分开（见 sanitize） */
export const WEATHER_WORDS = [
  '台风', '风暴', '飓风', '暴雨', '寒潮', '暴雪', '强风', '洪涝', '洪水', '龙卷风', '沙尘暴', '热浪', '干旱', '野火',
  'storm', 'storms', 'hurricane', 'typhoon', 'flood', 'floods', 'blizzard', 'heatwave', 'drought', 'wildfire',
  'Sturm', 'Orkan', 'Hochwasser', 'tempête', 'inondation', 'tormenta', 'inundación', 'tempestade', 'enchente',
  'шторм', 'наводнение', 'عاصفة', 'فيضان',
];

/* ------------------------------------------------------------------ *
 * 文本清洗
 * ------------------------------------------------------------------ */

/** 气象词整体构造一个正则，避免每次分类都跑十几个 replace */
const WEATHER_RE = new RegExp(
  WEATHER_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi',
);

/**
 * 清洗多义词，防止气象、产业政策、公司治理被误判成地缘政治冲突。
 *
 * 「风暴袭击欧洲」和「空袭伊朗」在词表上都命中「袭击」，但前者对资产价格没有
 * 传导路径，实测这类稿子会被打成 high 并连上黄金/原油/VIX 的冲击弧线，必须拦住。
 *
 * 英文侧的问题不同：不是气象，而是 war / strike / attack 在英语里是常用比喻。
 * price war、currency war、bidding war 都是竞争；workers strike 是劳工行动；
 * heart attack 是健康事件。这些词一旦进了标题（titleOnly 词只认标题），就会被
 * 判成 weight 3 的地缘政治。注意 trade war 不清洗 —— 那是真的地缘政治。
 */
export function sanitizeText(text) {
  return String(text ?? '')
    // 气象灾害不是地缘政治冲突（词表里中英德法西葡俄阿都有）
    .replace(WEATHER_RE, '气象事件')
    .replace(/(气象事件[^，。；！？]{0,12})袭击/g, '$1侵袭')
    .replace(/袭击([^，。；！？]{0,12}(电力|交通|航班|供电|通信|港口|机场|铁路|供水))/g, '侵袭$1')
    // 政策与产业语境里的「升级」
    .replace(/消费升级|产业升级|转型升级|品牌升级|服务升级|系统升级|版本升级|技术升级|智能升级|装备升级|产品升级|结构升级|评级升级/g, '产业演进')
    // 公司治理与党争语境里的「选举 / 弹劾」
    .replace(/董事会|监事会|换届选举|独立董事|股东大会|职工代表|选举董事/g, '公司治理')
    // ---- 英文比喻用法（先清 trade war 之外的 X war，再清 war on Y）----
    .replace(/\b(price|currency|bidding|talent|tariff|subsidy|chip|rate|fee|platform)\s+wars?\b/gi, 'competition')
    .replace(/\bwar\s+on\s+(inflation|drugs|fraud|poverty|cancer|terror)\b/gi, 'campaign')
    .replace(/\b(heart|panic|anxiety|asthma)\s+attacks?\b/gi, 'health event')
    // 劳工行动不是军事打击（workers strike / rail strike / strike action）
    .replace(/\b(worker|labour|labor|union|staff|teacher|nurse|doctor|rail|transport|postal|dock|civil\s+service)s?'?\s+strikes?\b/gi, 'labour action')
    .replace(/\bstrike\s+action\b/gi, 'labour action')
    .replace(/\bstrikes?\s+(a|an|the)\s+(deal|agreement|accord|bargain|partnership)\b/gi, 'reach agreement');
}

/* ------------------------------------------------------------------ *
 * 地区推断
 * ------------------------------------------------------------------ */

/**
 * 关键词兜底地区（LLM 会覆盖它，feed 语种会兜底它）。
 * REGION_WORDS 的顺序即优先级，见那份词表上的说明。
 */
export function guessRegion(text, sourceRegion = 'global') {
  for (const [region, words] of REGION_WORDS) {
    if (anyWordHit(text, words)) return region;
  }
  // 正文里一个国名都没有，但这条稿来自「日文财经」「韩文财经」这种单语种本地
  // 聚合 —— 它讲的基本就是本国的事。用来源地区兜底，比一律标 global 准确得多。
  // 反过来 en 的全球 feed 不能这么推，它的条目真的来自任何国家。
  return sourceRegion === 'global' ? 'global' : sourceRegion;
}

/* ------------------------------------------------------------------ *
 * 官方例行文件
 * ------------------------------------------------------------------ */

/**
 * 官方机构的例行文件，不是事件。
 *
 * 实测把央行/国际组织 feed 接进来之后，ecb 8 条里 6 条是「Frank Elderson:
 * Interview with Die Presse」「Piero Cipollone: Speech」这类署名访谈与演讲，
 * boj 是「Bank of Japan Accounts (October 20)」「Statistics on Securities
 * Financing」这类统计报表，wto 是会议纪要 —— 20 个官方源合计只产出 5 条。
 * 它们对研究有用，但不是「事件」，混进按时间倒序的事件流只会把真新闻挤下去。
 *
 * 只在 sourceKind === 'official' 时应用：媒体标题里的 "interview"/"speech"
 * 往往正是新闻本身（"CEO says in interview..."），不能一刀切。
 */
const OFFICIAL_ROUTINE_RE =
  /^(Interview|Speech|Remarks|Testimony|Conference|Workshop|Seminar|Panel|Webinar|Calendar|Schedule|Holidays?|Christmas|Boxing Day|New Year|Notice of|Appointment|Vacancy|Programme|Agenda)/i;

/** 「Frank Elderson: Taking action for nature」——官方源里的署名文章/演讲标题 */
const OFFICIAL_BYLINE_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}:\s/;

export function isOfficialRoutine(title, sourceKind) {
  if (sourceKind !== 'official') return false;
  const t = String(title ?? '');
  return OFFICIAL_ROUTINE_RE.test(t) || OFFICIAL_BYLINE_RE.test(t);
}

/* ------------------------------------------------------------------ *
 * 匹配
 * ------------------------------------------------------------------ */

/**
 * 纯 ASCII 词走词边界正则，其余走子串。
 *
 * 不这么分就会出事：`includes('war')` 命中 software / warning / reward，
 * `includes('ban')` 命中 urban / bank（！），`includes('or')` 命中一切。
 * 中文/日文/韩文/阿拉伯文没有词边界概念，子串就是正确做法。
 */
const ASCII_RE = /^[\x20-\x7e]+$/;
const reCache = new Map();

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wordHit(text, word) {
  if (!text || !word) return false;
  if (!ASCII_RE.test(word)) return text.includes(word);
  let re = reCache.get(word);
  if (!re) {
    re = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(word)}($|[^A-Za-z0-9])`, 'i');
    reCache.set(word, re);
  }
  return re.test(text);
}

export function anyWordHit(text, words) {
  for (const w of words) if (wordHit(text, w)) return true;
  return false;
}

/** 把 intl 各语种的词摊平；模块加载时算一次，之后每次分类不再遍历对象 */
function flatten(rule) {
  const all = [...rule.words];
  const titleOnly = [...(rule.titleOnly ?? [])];
  for (const list of Object.values(rule.intl ?? {})) all.push(...list);
  return { all, titleOnly };
}

/**
 * 编译后的规则：`words` 已含全部语种，`titleOnly` 单独一列。
 * 导出它而不是让调用方每次展开 —— 分类是热路径，一条事件要过 13 条规则。
 */
export const COMPILED_TOPICS = TOPIC_RULES.map((rule) => {
  const { all, titleOnly } = flatten(rule);
  // titleOnly 里的词不再参与正文匹配，但仍是「命中标题」的有效词
  const bodyWords = all.filter((w) => !titleOnly.includes(w));
  return {
    key: rule.key,
    label: rule.label,
    weight: rule.weight,
    symbols: rule.symbols,
    titleWords: [...all, ...titleOnly],
    bodyWords,
  };
});
