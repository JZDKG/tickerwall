/* ================================================================== *
 * 国内快讯源适配器
 *
 * 从 services/events.service.js 拆出来（那边 953 行混了抓取、分类、
 * 归档、LLM 复核四种职责）。
 *
 * 这里只做「抓回来 + 清成纯文本」这一步：金十 / 新浪财经 / 华尔街见闻
 * 三家的 HTML 与时间格式各有各的坑，全在这一层消化掉，服务层拿到的
 * 就是干净的 { id, title, body, time, url }。
 *
 * 依赖方向单向向下：providers/http.js（fetchRaw）+ domain/news-lexicon.js
 * （sanitizeUrl）。不引用任何 service。
 * ================================================================== */

import { fetchRaw } from './index.js';
import { sanitizeUrl } from '../domain/news-lexicon.js';

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 北京时间字符串 */
export function bjTimeString(input) {
  const d = typeof input === 'number' ? new Date(input * 1000) : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export const NOISE_RE =
  /汇总|一览|早报|晚报|周报|月刊|盘点|速览|每日.{0,4}动态|领跑|净值|半日成交|基金份额|涨幅榜|跌幅榜|涨停揭秘|跌停揭秘|ETF.{0,6}成交|目标价|目标位|上调.{0,10}目标|下调.{0,10}目标|维持.{0,8}(买入|增持|中性|持有|跑赢|卖出|减持)|(买入|增持|中性|跑赢|卖出|减持)?.{0,4}评级|评级.{0,8}(上调|下调)|评级为|首次覆盖|主力资金净|龙虎榜/;


/** 金十快讯（最快，带 important 标记） */
export async function fetchJin10() {
  const j = JSON.parse(
    await fetchRaw('https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.jin10.com/',
        'x-app-id': 'bVBF4FyRTn5NJF5n',
        'x-version': '1.0.0',
      },
    }),
  );
  const list = j?.data ?? [];
  return list.map((x) => {
    const d = x.data ?? {};
    const title = stripHtml(d.title || d.content || '');
    const body = stripHtml(d.content || '');
    return {
      id: `jin10:${x.id}`,
      sourceKey: 'jin10',
      source: '金十数据',
      time: bjTimeString((x.time ?? '').replace(' ', 'T') + '+08:00'),
      title: title.length > 90 ? `${title.slice(0, 90)}…` : title,
      body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
      url: sanitizeUrl(d.source_link),
      important: Number(x.important) > 0,
    };
  });
}

/** 新浪 7×24 全球直播 */
export async function fetchSinaLive(pages = 2) {
  const out = [];
  for (let p = 1; p <= pages; p += 1) {
    const j = JSON.parse(
      await fetchRaw(
        `https://zhibo.sina.com.cn/api/zhibo/feed?page=${p}&page_size=30&zhibo_id=152&tag_id=0&dire=f&dpc=1`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn' } },
      ),
    );
    const list = j?.result?.data?.feed?.list ?? [];
    for (const x of list) {
      const raw = String(x.rich_text ?? '');
      const m = /^【([^】]+)】([\s\S]*)$/.exec(raw);
      const title = stripHtml(m ? m[1] : raw);
      const body = stripHtml(m ? m[2] : raw);
      out.push({
        id: `sina:${x.id}`,
        sourceKey: 'sina',
        source: '新浪财经',
        time: bjTimeString((x.create_time ?? '').replace(' ', 'T') + '+08:00'),
        title: title.length > 90 ? `${title.slice(0, 90)}…` : title,
        body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
        url: sanitizeUrl(x.docurl),
        important: Number(x.top_value) > 0,
      });
    }
    if (!list.length) break;
  }
  return out;
}

/** 华尔街见闻实时快讯（专业度最高） */
export async function fetchWscn(limit = 40) {
  const j = JSON.parse(
    await fetchRaw(
      `https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&client=pc&limit=${limit}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ),
  );
  const items = j?.data?.items ?? [];
  return items.map((x) => {
    const title = stripHtml(x.title || '');
    const body = stripHtml(x.content || '');
    return {
      id: `wscn:${x.id}`,
      sourceKey: 'wscn',
      source: '华尔街见闻',
      time: bjTimeString(x.display_time),
      title: (title || body).slice(0, 90) + ((title || body).length > 90 ? '…' : ''),
      body: body.length > 400 ? `${body.slice(0, 400)}…` : body,
      url: sanitizeUrl(x.uri),
      important: Number(x.score) >= 2,
    };
  });
}