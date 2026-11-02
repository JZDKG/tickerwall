/* ================================================================== *
 * 走势图（Canvas 2D）
 *
 * 详情页只有一张图，用 canvas 是合适的：折线 + 面积渐变 + 昨收基准虚线 +
 * 末点圆点。列表里的迷你走势走 components/spark（纯 view，不用 canvas），
 * 两者分工不要混。
 *
 * 几个必须处理的细节：
 *   · dpr 缩放，否则真机上线条发虚；
 *   · 首帧可能在 canvas 节点就绪之前就触发了 draw —— 用 _ready 挡住，
 *     节点就绪后补画一次；
 *   · 组件销毁时 canvas 节点会失效，不要在里面调 setData。
 * ================================================================== */

const COLORS = {
  up: '#f5455c',
  down: '#0ecb81',
  flat: '#8b97a8',
};

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    // 分时：[[t, p], ...] 或 [{t, p}]
    points: { type: Array, value: [] },
    // 日线收盘价数组
    closes: { type: Array, value: [] },
    mode: { type: String, value: 'intraday' },
    dir: { type: String, value: 'flat' },
    // 昨收/昨结算：画一条基准虚线，涨跌才有参照
    baseline: { type: null, value: null },
    // 高度（px）；不传就用 CSS 里的 188px
    height: { type: Number, value: 188 },
  },

  observers: {
    'points, closes, mode, dir, baseline': function () {
      this.draw();
    },
  },

  lifetimes: {
    ready() {
      this.initCanvas();
    },
    detached() {
      this._ctx = null;
      this._ready = false;
    },
  },

  methods: {
    initCanvas() {
      const query = this.createSelectorQuery();
      query
        .select('#chart')
        .fields({ node: true, size: true })
        .exec((res) => {
          const info = res && res[0];
          if (!info || !info.node) return;
          let dpr = 2;
          try {
            const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            dpr = win.pixelRatio || 2;
          } catch (e) {
            dpr = 2;
          }
          const canvas = info.node;
          canvas.width = Math.max(1, Math.round(info.width * dpr));
          canvas.height = Math.max(1, Math.round(info.height * dpr));
          const ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);
          this._ctx = ctx;
          this._w = info.width;
          this._h = info.height;
          this._ready = true;
          this.draw();
        });
    },

    values() {
      const { mode, points, closes } = this.properties;
      if (mode === 'daily') {
        return (closes || []).map((v) => Number(v)).filter((v) => Number.isFinite(v));
      }
      const out = [];
      (points || []).forEach((p) => {
        const v = Array.isArray(p) ? Number(p[1]) : Number(p && p.p);
        if (Number.isFinite(v)) out.push(v);
      });
      return out;
    },

    draw() {
      if (!this._ready || !this._ctx) return;
      const ctx = this._ctx;
      const w = this._w;
      const h = this._h;
      const vals = this.values();
      const color = COLORS[this.properties.dir] || COLORS.flat;

      ctx.clearRect(0, 0, w, h);
      if (vals.length < 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.properties.mode === 'daily' ? '暂无日线历史' : '暂无分时数据', w / 2, h / 2);
        return;
      }

      const top = 10;
      const bottom = 8;
      const plotH = h - top - bottom;

      let min = vals[0];
      let max = vals[0];
      for (const v of vals) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      // 把昨收也算进值域，基准线才不会跑到画布外面
      const base = Number(this.properties.baseline);
      if (Number.isFinite(base) && base > 0) {
        if (base < min) min = base;
        if (base > max) max = base;
      }
      if (max === min) {
        const pad = Math.abs(max) * 0.0005 || 0.5;
        min -= pad;
        max += pad;
      }
      const span = max - min;
      const xAt = (i) => (i / (vals.length - 1)) * w;
      const yAt = (v) => top + (1 - (v - min) / span) * plotH;

      // 横向网格
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i += 1) {
        const y = top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 昨收基准虚线
      if (Number.isFinite(base) && base > 0) {
        const y = yAt(base);
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.restore();
      }

      // 面积渐变
      const grad = ctx.createLinearGradient(0, top, 0, h);
      grad.addColorStop(0, this.hexA(color, 0.26));
      grad.addColorStop(1, this.hexA(color, 0));
      ctx.beginPath();
      ctx.moveTo(0, h);
      vals.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 折线
      ctx.beginPath();
      vals.forEach((v, i) => {
        if (i === 0) ctx.moveTo(xAt(i), yAt(v));
        else ctx.lineTo(xAt(i), yAt(v));
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // 末点
      const lx = xAt(vals.length - 1);
      const ly = yAt(vals[vals.length - 1]);
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lx, ly, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = this.hexA(color, 0.18);
      ctx.fill();
    },

    /** #rrggbb + alpha → rgba() */
    hexA(hex, alpha) {
      const m = /^#([0-9a-f]{6})$/i.exec(hex);
      if (!m) return `rgba(255,255,255,${alpha})`;
      const n = parseInt(m[1], 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    },
  },
});
