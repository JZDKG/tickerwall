/* ================================================================== *
 * 报价卡片：列表的基本单位
 *
 * 信息层级照 web 端 .row 搬：左侧方向色条 → 名称/涨跌 → 价格/走势 →
 * 元信息（高低/来源/新鲜度）→ 卡内附加报价。
 *
 * 与 web 的差异只在排版：web 是四列 grid（价格右对齐、走势独占一整行），
 * 手机上宽度不够，改成「价格 + 走势并排、元信息压到第三行」，
 * 单卡高度从 ~150px 降到 ~130px，一屏能多看一个标的。
 * ================================================================== */

const { fmtPct, fmtPrice, fmtSigned, dirOf, metaRange, sourceLabel, freshShort } = require('../../utils/format');

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    item: { type: Object, value: null, observer: 'render' },
    // 紧凑模式：自选页不要副标题，省一行
    dense: { type: Boolean, value: false },
  },

  data: {
    v: null,
  },

  methods: {
    render(item) {
      if (!item || !item.id) {
        this.setData({ v: null });
        return;
      }
      const d = Number.isFinite(item.decimals) ? item.decimals : 2;
      const dir = dirOf(item.changePct);
      const failed = item.ok === false;

      const parts = [];
      const range = metaRange(item);
      if (range) parts.push(range);
      const src = sourceLabel(item.source);
      if (src) parts.push(src);

      const extras = (item.extras || []).map((ex) => ({
        id: ex.id,
        name: ex.name,
        valText: ex.priceText || fmtPrice(ex.price, d),
        pctText: ex.changePct === null || ex.changePct === undefined ? '' : fmtPct(ex.changePct),
        dir: dirOf(ex.changePct),
        ok: ex.ok !== false,
      }));

      this.setData({
        v: {
          dir,
          failed,
          stale: !!item.stale,
          priceText: failed ? '—' : fmtPrice(item.price, d),
          pctText: failed ? '取数失败' : fmtPct(item.changePct),
          absText: failed ? '' : fmtSigned(item.change, d),
          metaText: parts.join(' · '),
          errText: failed ? item.error || '取数失败' : '',
          fresh: freshShort(item.freshness),
          freshLevel: (item.freshness && item.freshness.level) || 'normal',
          marketLabel: item.marketStatus ? item.marketStatus.label : '',
          open: !!(item.marketStatus && item.marketStatus.open),
          extras,
        },
      });
    },

    onTap() {
      const item = this.properties.item;
      if (item && item.id) this.triggerEvent('open', { id: item.id });
    },

    onExtra(e) {
      const id = e.currentTarget.dataset.id;
      if (id) this.triggerEvent('open', { id });
    },
  },
});
