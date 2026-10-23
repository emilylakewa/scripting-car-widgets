// 按钮图标与车标全部用内联 SVG 绘制，颜色可随设置变化。
// 每个图标 24×24 视框、描边 1.7，圆角端点，黑白通用。
// 尺寸统一规则：每枚图标的「几何外框 + 1.7 描边」按最长边归一到 17 单位并居中到 (12,12)，
// 因此所有图标看起来一样大；描边固定 1.7（不随图形缩放，避免粗细不一）。

function wrap(color: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}
function dot(color: string, cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="none"/>`
}

function iconBody(id: string, state: boolean, color: string): string {
  switch (id) {
    // 锁车：已锁为闭合挂锁，未锁为开启挂锁（归一系数 1.0000，整体上移 0.35）
    case 'lock':
      return '<rect x="4.9" y="10.05" width="14.2" height="9.6" rx="2.6"/>'
        + (state ? '<path d="M8.5 10.05V7.85a3.5 3.5 0 0 1 7 0v2.2"/>' : '<path d="M8.5 10.05V7.85a3.5 3.5 0 0 1 6.6-1.9"/>')
        + dot(color, 12, 14.85, 1.15)
    // 车窗：用户指定的造型（原图 960×960，描边 48，箭头 64）。窗框 + 一条窗台线常驻，
    // 关 = 向上箭头（升窗），开 = 向下箭头（降窗）；箭头描边按 64/48 比例放到 2.27，比窗框重一点。
    case 'window':
      return '<path d="M4.35 9.81 L8.94 4.35 L18.70 4.35 Q19.65 4.35 19.65 5.30 L19.65 18.70 Q19.65 19.65 18.70 19.65 L5.30 19.65 Q4.35 19.65 4.35 18.70 Z"/>'
        + '<path d="M4.35 9.81 L19.65 9.81"/>'
        + (state
          ? '<path stroke-width="2.27" d="M8.72 14.19 L12.00 17.46 L15.28 14.19"/>'
          : '<path stroke-width="2.27" d="M8.72 16.37 L12.00 13.09 L15.28 16.37"/>')
    // 发动机：熄火为电源符号，运行为电源符号加实心内点（归一系数 1.0746，放大到统一大小）
    case 'engine':
      return '<path d="M12 4.41v7.41"/><path d="M8.02 7.1a6.88 6.88 0 1 0 7.95 0"/>' + (state ? dot(color, 12, 14.84, 2.15) : '')
    // 寻车：喇叭加两层声波（归一系数 0.9901，按整枚图形的包围盒重新居中）
    case 'find':
      return '<path d="M4.34 9.62h2.97l4.55-4.06v12.87l-4.55-4.06h-2.97z"/>'
        + '<path d="M15.13 9.62a3.27 3.27 0 0 1 0 4.75"/>'
        + '<path d="M17.81 7.45a6.53 6.53 0 0 1 0 9.11"/>'
    // 冷车：雪花（归一系数 0.8995）
    case 'cool':
      return '<path d="M4.26 12h15.47M8.13 5.34l7.74 13.31M15.87 5.34L8.13 18.66"/>' + dot(color, 12, 12, 1.17)
    // 热车：太阳（归一系数 0.8057，原来最大，缩得最多）
    case 'hot':
      return '<circle cx="12" cy="12" r="3.3"/><path d="M12 4.18v1.85M12 17.96v1.85M4.18 12h1.85M17.96 12h1.85M6.52 6.52l1.29 1.29M16.19 16.19l1.29 1.29M17.48 6.52l-1.29 1.29M7.81 16.19l-1.29 1.29"/>'
    // 空调：关闭只有出风口，开启加送风气流（归一系数 0.9189，两态共用同一包围盒）
    case 'ac':
      return '<rect x="4.28" y="5.57" width="15.44" height="6.8" rx="2.02"/><path d="M7.77 8.97h8.45"/>'
        + (state ? '<path d="M7.59 15.22c1.1-1.38 2.21-1.38 3.31 0s2.21 1.38 3.31 0 2.21-1.38 3.31 0"/><path d="M7.59 18.43c1.1-1.38 2.21-1.38 3.31 0s2.21 1.38 3.31 0"/>' : '')
    // 尾门：用户指定的车辆轮廓（原图 960×1015 视框，等比缩放到 24 视框，描边统一 1.7；归一系数 0.9748）。
    // 关 = 合起的车身（斜背 + 右侧尾厢 + 左下轮毂）；开 = 同一车身 + 向右上方掰起的尾门盖。
    // 两态共用同一缩放与车身坐标，切换时车身不会跳动。
    // 乘员车门：独立门框和车窗轮廓，避免误用表示机盖的系统图标。
    case 'door':
      return '<path d="M5 19V10l5-5h8v14zM6 10h12M10 5v5M14 13h2"/>'
    case 'trunk':
      return state
        ? '<path d="M4.33 4.33 L7.81 4.33 L12.35 8.51 L16.88 4.33 L19.67 6.41 M12.35 8.51 L16.88 8.51 Q19.32 8.51 19.32 10.96 L19.32 16.88 Q19.32 17.59 18.63 17.59 L13.39 17.59 M13.04 15.84 Q13.04 19.67 9.21 19.67 Q5.37 19.67 5.37 15.84 Q5.37 12 9.21 12 Q13.04 12 13.04 15.84"/>'
        : '<path d="M4.33 4.33 L7.81 4.33 L12.35 8.51 L16.88 8.51 Q19.32 8.51 19.32 10.96 L19.32 16.88 Q19.32 17.59 18.63 17.59 L13.39 17.59 M13.04 15.84 Q13.04 19.67 9.21 19.67 Q5.37 19.67 5.37 15.84 Q5.37 12 9.21 12 Q13.04 12 13.04 15.84"/>'
    // 刷新车况（归一系数 1.0303）
    default:
      return '<path d="M18.75 12.72a6.9 6.9 0 1 1-2.06-4.84"/><path d="M19.06 4.38v4.43h-4.43"/>'
  }
}

// state 为 true 表示车辆处于“开启 / 已锁 / 已运行”一侧的状态。
export function buttonIconSVG(id: string, state: boolean, color: string): string {
  const paint = color || '#FFFFFF'
  return wrap(paint, iconBody(id, state, paint))
}

// 奥迪四环：单环直径 100，圆心距 75（相邻环重叠 25%），描边 11（约直径 11%）。
// 整体宽高比 325 : 100，与官方标志一致，可直接放进原车辆图片的位置。
const RING_D = 100
const RING_GAP = 75
const RING_STROKE = 11
export const AUDI_LOGO_RATIO = (3 * RING_GAP + RING_D) / RING_D
export function audiLogoSVG(color: string): string {
  const paint = color || '#FFFFFF'
  const r = (RING_D - RING_STROKE) / 2
  const rings = [0, 1, 2, 3]
    .map(i => `<circle cx="${RING_D / 2 + i * RING_GAP}" cy="${RING_D / 2}" r="${r}"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 325 100" width="325" height="100" preserveAspectRatio="xMidYMid meet" fill="none" stroke="${paint}" stroke-width="${RING_STROKE}">${rings}</svg>`
}
// 给定宽度，按真实比例算出高度，避免被拉成椭圆。
export function audiLogoSize(width: number) {
  return { width: Math.round(width), height: Math.round(width / AUDI_LOGO_RATIO) }
}
