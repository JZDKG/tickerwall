/* ================================================================== *
 * 迷你走势（柱状）
 *
 * 为什么不用折线：web 端一行一个 <svg>，小程序里没有内联 SVG，而
 * canvas 放进长列表会有 20 多个实例，滚动直接掉帧。柱状图用 view 画，
 * 单卡片 24 个节点，信息量（形状 + 方向）在 200rpx 宽度上其实更清楚。
 *
 * 颜色继承父级 currentColor：卡片按涨跌给 .up/.down/.flat，
 * 这里不需要重复判断方向。
 * ================================================================== */

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    points: { type: Array, value: [], observer: 'rebuild' },
    dir: { type: String, value: 'flat' },
    count: { type: Number, value: 24 },
  },

  data: {
    bars: [],
    empty: true,
  },

  methods: {
    rebuild(points) {
      const vals = [];
      (points || []).forEach((p) => {
        const v = Array.isArray(p) ? p[1] : p && p.p;
        if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
      });

      if (vals.length < 2) {
        if (!this.data.empty) this.setData({ bars: [], empty: true });
        return;
      }

      // 等距抽稀到固定根数：根数固定，卡片之间的视觉节奏才一致
      const n = Math.max(6, Math.min(60, this.properties.count));
      const step = (vals.length - 1) / (n - 1);
      const picked = [];
      for (let i = 0; i < n; i += 1) picked.push(vals[Math.round(i * step)]);

      let min = picked[0];
      let max = picked[0];
      for (const v of picked) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max === min) {
        const pad = Math.abs(max) * 0.0005 || 0.5;
        min -= pad;
        max += pad;
      }
      const span = max - min || 1;

      const bars = picked.map((v, i) => ({
        // 最低 8%：完全贴底的柱子会看不见，等于丢掉一个数据点
        h: Math.max(8, Math.round(((v - min) / span) * 100)),
        last: i === picked.length - 1,
      }));

      this.setData({ bars, empty: false });
    },
  },
});
