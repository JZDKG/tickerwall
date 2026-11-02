/* ================================================================== *
 * 上游抓取底座（云函数版）
 *
 * 与 web 端 src/server/providers/http.js 同一职责，但只保留云函数真正需要的
 * 部分：带超时的 GET、跟随重定向、按编码解码。
 *
 * 为什么不用全局 fetch：云函数 Node 版本在不同环境里不一定是 18+，而
 * https 模块在所有版本都在；且我们需要「强制 identity 编码」，避免为省几十
 * KB 去解 gzip（云函数出口带宽不是瓶颈，解码库缺失才是）。
 * ================================================================== */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/** 伪装成浏览器：新浪 / 腾讯行情对无 UA 的请求会直接返回空串 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 6000;

/** 复用连接：云函数一次调用要打十几个上游，每次重新握手既慢又容易被限流 */
const agents = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 24, family: 4 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 24, family: 4 }),
};

/**
 * 取一段文本。
 * @param {string} url
 * @param {{headers?:object, encoding?:string, timeoutMs?:number, depth?:number}} [opts]
 * @returns {Promise<string>}
 */
function getText(url, opts = {}) {
  const { headers = {}, encoding = 'utf8', timeoutMs = DEFAULT_TIMEOUT_MS, depth = 0 } = opts;

  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (err) {
      return reject(new Error(`非法 URL: ${url}`));
    }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || undefined,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        // 必须锁 IPv4：部分行情域名在国内云出口会同时返回 AAAA，而云函数
        // 默认网络没有 IPv6 路由 —— 表现是「连上了但立刻被挂断」或直接超时，
        // 而本地（有 IPv6）完全正常，非常难查。
        family: 4,
        agent: agents[u.protocol],
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          // 不要压缩：省一次 zlib 依赖，也避免部分源返回 br 而 Node 解不了
          'Accept-Encoding': 'identity',
          ...headers,
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        // 跟随重定向（CBOE 的 CDN 会 307 到实际桶域名）
        if (status >= 300 && status < 400 && res.headers.location && depth < 3) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return getText(next, { ...opts, depth: depth + 1 }).then(resolve, reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (status < 200 || status >= 300) return reject(new Error(`HTTP ${status}`));
          const buf = Buffer.concat(chunks);
          if (encoding === 'utf8') return resolve(buf.toString('utf8'));
          // 新浪/腾讯行情是 gb18030；解不出来也不要抛 —— 数字段都是 ASCII，
          // 退化成 latin1 仍能正确取到价格，只是中文名会乱码（我们不用中文名）
          try {
            resolve(new TextDecoder(encoding).decode(buf));
          } catch (err) {
            resolve(buf.toString('binary'));
          }
        });
      },
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error('请求超时')));
    // socket 空闲超时管不到 DNS 解析与建连阶段 —— 上游域名解析挂住时
    // setTimeout 永远不会触发，整个云函数会被拖到执行超时（实测 20s 全灭）。
    // 所以再加一道硬计时器，覆盖「从发起到拿到响应」的全过程。
    const hardTimer = setTimeout(() => req.destroy(new Error('请求超时')), timeoutMs + 500);
    req.on('close', () => clearTimeout(hardTimer));
    req.on('error', (err) => {
      clearTimeout(hardTimer);
      reject(err);
    });
    req.end();
  });
}

/** 取 JSON（顺带把非 JSON 的响应变成可读错误） */
async function getJson(url, opts) {
  const txt = await getText(url, opts);
  try {
    return JSON.parse(txt);
  } catch (err) {
    throw new Error(`响应不是 JSON: ${txt.slice(0, 80)}`);
  }
}

module.exports = { UA, getText, getJson, DEFAULT_TIMEOUT_MS };
