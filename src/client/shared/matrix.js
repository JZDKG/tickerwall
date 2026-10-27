/* ================================================================== *
 * 2D 仿射矩阵：屏幕坐标 ↔ SVG 用户坐标
 *
 * 为什么需要它：世界地图的 <svg> 定了 viewBox="0 0 1200 560"，
 * 而容器宽高由窗口决定。宽高比一旦不是 1200:560，浏览器就会按
 * preserveAspectRatio="xMidYMid meet" 在两侧（或上下）留白。
 *
 * 之前各处换算都写成 `(x / 1200) * rect.width`，等于假设「viewBox 铺满 rect」，
 * 于是留白越多，误差越大 —— 1920 视口下地图左边缘能差 290px，
 * 平板竖屏下顶部能差 210px。表现就是：城市卡片贴着错误的点弹出、
 * 滚轮缩放的定点漂到鼠标之外、拖拽速度和手速对不上。
 *
 * 正解是用浏览器已经算好的 `getScreenCTM()`（viewBox → 屏幕的完整矩阵，
 * 含留白与缩放），这里只保留不依赖 DOM 的矩阵数学，方便单测。
 * 字段顺序与 DOMMatrix / SVGMatrix 一致：
 *
 *     | a  c  e |        x' = a·x + c·y + e
 *     | b  d  f |        y' = b·x + d·y + f
 *     | 0  0  1 |
 * ================================================================== */

/** 矩阵是否可用于换算（getScreenCTM 在元素隐藏时会返回 null） */
export function isUsableMatrix(m) {
  return Boolean(m)
    && Number.isFinite(m.a) && Number.isFinite(m.b)
    && Number.isFinite(m.c) && Number.isFinite(m.d)
    && Number.isFinite(m.e) && Number.isFinite(m.f);
}

/** 用户坐标 → 屏幕坐标 */
export function applyMatrix(m, x, y) {
  if (!isUsableMatrix(m)) return null;
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/** 求逆；退化矩阵（缩放为 0）返回 null，由调用方决定降级方式 */
export function invertMatrix(m) {
  if (!isUsableMatrix(m)) return null;
  const det = m.a * m.d - m.b * m.c;
  if (!det) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** 屏幕坐标 → 用户坐标 */
export function applyInverseMatrix(m, x, y) {
  const inv = invertMatrix(m);
  return inv ? applyMatrix(inv, x, y) : null;
}

/**
 * 屏幕位移 → 用户位移。
 * 拖拽用的是位移而不是点：平移项必须在差值里抵消，只剩线性部分，
 * 所以「手移 100px」和「地图跟着移 100px」才能对上。
 * 直接 applyInverseMatrix(m, dx, dy) 会多带一份平移量，是这里最容易踩的坑。
 */
export function applyInverseDelta(m, dx, dy) {
  if (!invertMatrix(m)) return null;
  const origin = applyInverseMatrix(m, 0, 0);
  const moved = applyInverseMatrix(m, dx, dy);
  if (!origin || !moved) return null;
  return [moved[0] - origin[0], moved[1] - origin[1]];
}
