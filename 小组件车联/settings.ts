import { Path, Script } from 'scripting'
import type { CarData } from './api'

export type WidgetSize = 'small' | 'medium' | 'large' | 'extraLarge'
export type WidgetOptions = {
  metricSlots: string[]; stateSlots: string[]
  showMetrics: boolean; showStates: boolean; showTires: boolean; showLocationCard: boolean; showReminders: boolean
  theme: string; name: string; plate: string; showPlate: boolean
  showAddress: boolean; quote: string; showIcons: boolean; showTemp: boolean
  buttonBackgroundTransparency: number | null
  infoBackgroundTransparency: number | null
  infoBackgroundColor: string; extraLargeBackground: string
  fontScale: number; updateTimeStyle: 'absolute' | 'relative'
  buttonConfirmations: boolean[]
  buttonIconOnColor: string; buttonIconOffColor: string; buttonHeight: number
  fontColor: string; buttonBackgroundColor: string
  carScale: number; backgroundDim: number; buttonCount: number; buttons: string[]
  barWidth: number; barHeight: number
  buttonRadius: number
  useAudiLogo: boolean; showCenterAddress: boolean; hideLocationRow: boolean
  centerCarScale: number
  smallStyle: string; smallRingInfo: string; lastButton: string; refreshMinutes: number; autoRefresh: boolean
  carImage: string; smallBackground: string; mediumBackground: string; largeBackground: string
  maintenanceDate: string; insuranceDate: string; inspectionDate: string; maintenanceKm: string
}
export type Settings = WidgetOptions & { profiles?: Partial<Record<WidgetSize, Partial<WidgetOptions>>> }
export const DEFAULTS: Settings = {
  metricSlots: ['mileage', 'oil', 'fuelPct', 'battery'],
  stateSlots: ['windows', 'carDoor', 'carLamp', 'acOn', 'waterTemperature', 'heatSeat'],
  showMetrics: true, showStates: true, showTires: true, showLocationCard: true, showReminders: true,
  theme: 'navy', name: '', plate: '', showPlate: true, showAddress: true,
  quote: '每一次出发，都平安抵达', showIcons: true, showTemp: true,
  buttonBackgroundTransparency: null,
  infoBackgroundTransparency: null,
  infoBackgroundColor: '', extraLargeBackground: '',
  fontScale: 100, updateTimeStyle: 'absolute',
  buttonConfirmations: [false, false, false, false, false, false],
  buttonIconOnColor: '', buttonIconOffColor: '', buttonHeight: 31,
  fontColor: '', buttonBackgroundColor: '',
  carScale: 100, backgroundDim: 0, buttonCount: 6, buttons: ['refresh', 'lock', 'window', 'engine', 'find', 'ac'],
  barWidth: 94, barHeight: 3,
  buttonRadius: -1,
  useAudiLogo: true, showCenterAddress: true, hideLocationRow: false, centerCarScale: 100,
  smallStyle: 'classic', smallRingInfo: 'oil', lastButton: 'engine', refreshMinutes: 30, autoRefresh: true,
  carImage: '', smallBackground: '', mediumBackground: '', largeBackground: '',
  maintenanceDate: '', insuranceDate: '', inspectionDate: '', maintenanceKm: '',
}
declare const Storage: { get<T>(key: string): T | null; set<T>(key: string, value: T): boolean }
const KEY = 'carlink.car.customization.v1'
export function readSettings(): Settings {
  try { return normalizeSettings(Storage.get<Partial<Settings>>(KEY) || {}) }
  catch { return normalizeSettings({}) }
}
function normalizeSettings(saved: Partial<Settings>): Settings {
  const settings = { ...DEFAULTS, ...saved }
  settings.infoBackgroundColor = normalizeColor(settings.infoBackgroundColor, true)
  settings.infoBackgroundTransparency = typeof settings.infoBackgroundTransparency === 'number' && Number.isFinite(settings.infoBackgroundTransparency) ? bounded(settings.infoBackgroundTransparency, 0, 100, 0) : null
  settings.fontColor = normalizeColor(settings.fontColor)
  settings.buttonBackgroundColor = normalizeColor(settings.buttonBackgroundColor, true)
  settings.buttonBackgroundTransparency = typeof settings.buttonBackgroundTransparency === 'number' && Number.isFinite(settings.buttonBackgroundTransparency) ? bounded(settings.buttonBackgroundTransparency, 0, 100, 0) : null
  settings.buttonIconOnColor = normalizeColor(settings.buttonIconOnColor)
  settings.buttonIconOffColor = normalizeColor(settings.buttonIconOffColor)
  // 下面各数值的上/下限与设置页“自定义数值”的可输入范围保持一致，否则自定义值会被静默夹回。
  settings.buttonHeight = Math.round(bounded(settings.buttonHeight, 14, 80, 31))
  settings.useAudiLogo = typeof settings.useAudiLogo === 'boolean' ? settings.useAudiLogo : DEFAULTS.useAudiLogo
  settings.showCenterAddress = typeof settings.showCenterAddress === 'boolean' ? settings.showCenterAddress : true
  settings.centerCarScale = Math.round(bounded(settings.centerCarScale, 30, 300, 100))
  settings.buttonConfirmations = DEFAULTS.buttons.map((_, i) => Array.isArray(saved.buttonConfirmations) && saved.buttonConfirmations[i] === true)
  settings.fontScale = bounded(settings.fontScale, 60, 200, 100)
  settings.updateTimeStyle = settings.updateTimeStyle === 'relative' ? 'relative' : 'absolute'
  settings.carScale = bounded(settings.carScale, 30, 300, 100)
  settings.barWidth = Math.round(bounded(settings.barWidth, 20, 400, DEFAULTS.barWidth))
  settings.barHeight = Math.round(bounded(settings.barHeight, 1, 40, DEFAULTS.barHeight))
  settings.buttonRadius = Math.round(bounded(settings.buttonRadius, -1, 60, DEFAULTS.buttonRadius))
  const slotCount = DEFAULTS.buttons.length
  settings.buttonCount = Math.round(bounded(settings.buttonCount, 1, slotCount, slotCount))
  // 旧版本只存了 5 个按钮槽位，升级后自动扩到 6 个；在设置里保存过一次就不再强制
  if (!Array.isArray(saved.buttons) || saved.buttons.length < slotCount) settings.buttonCount = slotCount
  settings.smallRingInfo = INFO_OPTIONS.some(option => option.id === settings.smallRingInfo) ? settings.smallRingInfo : 'oil'
  settings.backgroundDim = bounded(settings.backgroundDim, 0, 100, 0)
  settings.refreshMinutes = Math.round(bounded(settings.refreshMinutes, 5, 1440, DEFAULTS.refreshMinutes))
  const buttons = Array.isArray(saved.buttons) ? saved.buttons : ['refresh', 'lock', 'window', saved.lastButton || 'engine', 'find']
  settings.buttons = DEFAULTS.buttons.map((fallback, i) => ACTIONS.some(a => a.id === buttons[i]) ? buttons[i] : fallback)
  // hideLocationRow：开启后地址/短句整行不渲染，优先级高于 showAddress 与 showLocationCard。
  for (const key of ['showMetrics', 'showStates', 'showTires', 'showLocationCard', 'showReminders', 'hideLocationRow'] as const) {
    settings[key] = typeof settings[key] === 'boolean' ? settings[key] : DEFAULTS[key]
  }
  for (const key of ['metricSlots', 'stateSlots'] as const) {
    const slots = Array.isArray(saved[key]) ? saved[key]! : []
    settings[key] = DEFAULTS[key].map((fallback, i) => INFO_OPTIONS.some(option => option.id === slots[i]) ? slots[i] : fallback)
  }
  return settings
}
export const ACTIONS = [
  { id: 'blank', name: '空白' },
  { id: 'refresh', name: '刷新车况' }, { id: 'lock', name: '锁车 / 解锁' },
  { id: 'window', name: '开窗 / 关窗' }, { id: 'engine', name: '启动 / 熄火' },
  { id: 'find', name: '鸣笛寻车' }, { id: 'cool', name: '冷车 30 分钟' },
  { id: 'hot', name: '热车 30 分钟' }, { id: 'ac', name: '空调开启 / 关闭' },
  { id: 'trunk', name: '打开尾门 / 关闭尾门' },
]
// 可放进组件的指标/状态/胎压候选项，与 dashboard-model 的 itemById 一一对应。
export const INFO_OPTIONS = [
  { id: 'blank', name: '不显示' },
  { id: 'mileage', name: '累计里程' }, { id: 'oil', name: '剩余油量' },
  { id: 'fuelPct', name: '燃油余量' }, { id: 'battery', name: '蓄电池' },
  { id: 'outsideTemp', name: '车外温度' }, { id: 'locked', name: '车锁状态' },
  { id: 'engineOn', name: '发动机状态' }, { id: 'online', name: '在线状态' },
  { id: 'windows', name: '车窗' }, { id: 'carDoor', name: '车门' },
  { id: 'trunkStatus', name: '尾门状态' }, { id: 'hoodStatus', name: '车盖状态' },
  { id: 'carLamp', name: '车灯' }, { id: 'acOn', name: '空调' },
  { id: 'waterTemperature', name: '水温' }, { id: 'heatSeat', name: '座椅加热' },
  { id: 'tireLF', name: '左前胎压' }, { id: 'tireRF', name: '右前胎压' },
  { id: 'tireLR', name: '左后胎压' }, { id: 'tireRR', name: '右后胎压' },
]
export const WIDGET_SIZES: { id: WidgetSize; name: string }[] = [
  { id: 'small', name: '小号组件' }, { id: 'medium', name: '中号组件' },
  { id: 'large', name: '大号组件' }, { id: 'extraLarge', name: '超大号组件' },
]
const PROFILE_KEYS = [
  'theme', 'name', 'plate', 'showPlate', 'showAddress', 'hideLocationRow', 'quote', 'showIcons', 'showTemp',
  'fontScale', 'fontColor', 'infoBackgroundColor', 'infoBackgroundTransparency',
  'buttonBackgroundColor', 'buttonBackgroundTransparency', 'buttonConfirmations',
  // useAudiLogo 只影响车辆中心主页，已移入根级设置，不再按尺寸保存。
  'buttonIconOnColor', 'buttonIconOffColor', 'buttonHeight', 'buttonRadius',
  'carScale', 'barWidth', 'barHeight', 'backgroundDim', 'buttonCount', 'buttons', 'smallStyle', 'smallRingInfo', 'lastButton',
  'refreshMinutes', 'autoRefresh', 'updateTimeStyle', 'carImage', 'smallBackground',
  'mediumBackground', 'largeBackground', 'extraLargeBackground', 'metricSlots', 'stateSlots',
  'showMetrics', 'showStates', 'showTires', 'showLocationCard', 'showReminders',
] as const
function profileOnly(value: unknown): Partial<WidgetOptions> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(PROFILE_KEYS.filter(key => Object.prototype.hasOwnProperty.call(value, key))
    .map(key => [key, (value as any)[key]])) as Partial<WidgetOptions>
}
export function settingsForSize(root: Settings, size: WidgetSize): Settings {
  const profile = profileOnly(root.profiles?.[size])
  return normalizeSettings({ ...root, ...profile })
}
export function withWidgetSettings(root: Settings, size: WidgetSize, patch: Partial<WidgetOptions>): Settings {
  const previous = profileOnly(root.profiles?.[size])
  return { ...root, profiles: { ...root.profiles, [size]: { ...previous, ...profileOnly(patch) } } }
}
export function withoutWidgetSettings(root: Settings, size: WidgetSize): Settings {
  const profiles = { ...root.profiles }; delete profiles[size]
  return { ...root, profiles }
}
export function widgetSizeFor(family: string, width: number, height: number): WidgetSize {
  const name = family.toLowerCase()
  const dashboard = name.includes('large') || height >= width * 1.15 || (width >= 500 && height >= 250)
  if (dashboard) return name.includes('extralarge') || height > 430 || width >= 500 ? 'extraLarge' : 'large'
  return name === 'systemsmall' || name === 'small' ? 'small' : 'medium'
}
function bounded(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}
export function visibleButtons(s: Settings): string[] { return s.buttons.slice(0, Math.round(bounded(s.buttonCount, 1, DEFAULTS.buttons.length, DEFAULTS.buttons.length))) }
export function buttonHeightOf(s: Settings): number { return Math.round(bounded(s.buttonHeight, 14, 80, 31)) }
// 控制按钮圆角：-1 表示随高度自动（原有观感），其余按设定值，最大不超过高度的一半。
export function buttonRadiusOf(s: Settings, height: number, autoMax = 10): number {
  const value = Math.round(bounded(s.buttonRadius, -1, 60, DEFAULTS.buttonRadius))
  return value < 0 ? Math.min(autoMax, height / 3) : Math.min(value, height / 2)
}
export function useAudiLogoOf(s: Settings): boolean { return s.useAudiLogo !== false }
// 车辆中心页面的位置卡片开关：全局生效（不分尺寸），默认显示。
export function centerAddressOf(s: Settings): boolean { return s.showCenterAddress !== false }
export function carScaleOf(s: Settings): number { return bounded(s.carScale, 30, 300, 100) / 100 }
// 车辆中心中卡片的车辆大小：独立设置，不跟任何尺寸的“车图大小”联动。
export function centerCarScaleOf(s: Settings): number { return bounded(s.centerCarScale, 30, 300, 100) / 100 }
// 组件里的油量/电量进度条：长宽都可自定义，长度不超过内容宽度。
export function barSizeOf(s: Settings) {
  return {
    width: Math.round(bounded(s.barWidth, 20, 400, DEFAULTS.barWidth)),
    height: Math.round(bounded(s.barHeight, 1, 40, DEFAULTS.barHeight)),
  }
}
export function backgroundDimOf(s: Settings): number { return bounded(s.backgroundDim, 0, 100, 0) / 100 }
export const COLOR_PRESETS = [
  { value: '', name: '默认颜色' }, { value: '#FFFFFF', name: '白色' },
  { value: '#111827', name: '黑色' }, { value: '#94A3B8', name: '灰色' },
  { value: '#38BDF8', name: '天蓝' }, { value: '#2563EB', name: '蓝色' },
  { value: '#34D399', name: '绿色' }, { value: '#FB923C', name: '橙色' },
  { value: '#F87171', name: '红色' }, { value: '#C4B5FD', name: '紫色' },
]
export function normalizeColor(value: unknown, allowClear = false): string {
  if (typeof value !== 'string') return ''
  const color = value.trim()
  if (allowClear && color === 'clear') return color
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase()
  if (/^#[0-9a-f]{3}$/i.test(color)) return '#' + color.slice(1).split('').map(v => v + v).join('').toUpperCase()
  return ''
}
export function fontSizeOf(s: Settings, base: number): number { return Math.round(base * bounded(s.fontScale, 60, 200, 100)) / 100 }
export function fontColorOf(s: Settings, fallback: string): string { return normalizeColor(s.fontColor) || fallback }
function backgroundWithTransparency(value: string, transparency: number | null, fallbackRGB: number[], fallbackAlpha: number): string {
  const color = normalizeColor(value, true)
  if (color === 'clear') return 'clear'
  // 旧配置没选过透明度时，沿用原始填充色。
  if (typeof transparency !== 'number' || !Number.isFinite(transparency)) return color || 'rgba(' + fallbackRGB.join(',') + ',' + fallbackAlpha + ')'
  const alpha = Math.round(100 - bounded(transparency, 0, 100, 0)) / 100
  if (alpha === 0) return 'clear'
  if (alpha === 1 && color) return color
  const rgb = color ? [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16)) : fallbackRGB
  return 'rgba(' + rgb.join(',') + ',' + alpha + ')'
}
export function infoBackgroundOf(s: Settings): string {
  return backgroundWithTransparency(s.infoBackgroundColor, s.infoBackgroundTransparency, [38, 61, 88], 0.8)
}
export function buttonBackgroundOf(s: Settings): string {
  return backgroundWithTransparency(s.buttonBackgroundColor, s.buttonBackgroundTransparency, [2, 7, 18], 0.72)
}
// 图标颜色只有「激活 / 未激活」两档，都留空时退回各按钮的原色。
export function buttonIconColorOf(s: Settings, active: boolean, fallback: string): string {
  return normalizeColor(active ? s.buttonIconOnColor : s.buttonIconOffColor) || fallback
}
export function saveSettings(value: Settings): void {
  if (Storage.set(KEY, value) === false) throw new Error('设置保存失败，请重试')
}
export const THEMES = [
  { id: 'navy', name: '深海蓝', colors: ['#213A68', '#081426'], accent: '#7DD3FC' },
  { id: 'forest', name: '墨绿', colors: ['#184D47', '#071E20'], accent: '#6EE7B7' },
  { id: 'violet', name: '暮光紫', colors: ['#493566', '#171129'], accent: '#C4B5FD' },
  { id: 'graphite', name: '石墨黑', colors: ['#3B414A', '#101317'], accent: '#E2E8F0' },
  { id: 'wine', name: '酒红', colors: ['#643345', '#210E19'], accent: '#FDA4AF' },
]
export function themeOf(s: Settings) { return THEMES.find(t => t.id === s.theme) || THEMES[0] }
export function gradientOf(s: Settings): any {
  return { gradient: themeOf(s).colors.map((color, i) => ({ color, location: i })), startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }
}
export function imagePath(s: Settings): string { return s.carImage || Path.join(Script.directory, 'car.png') }
export function plateText(d: CarData, s: Settings): string { return s.showPlate ? s.plate.trim() || d.plate : '' }
export function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, day] = value.split('-').map(Number)
  const date = new Date(y, m - 1, day)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === day ? date.getTime() : null
}
export function reminderLines(s: Settings, d: CarData | null, now = Date.now()): string[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const lines: string[] = []
  for (const [label, value] of [['保养', s.maintenanceDate], ['保险', s.insuranceDate], ['年检', s.inspectionDate]]) {
    const due = dateValue(value)
    if (due === null) continue
    const days = Math.round((due - today.getTime()) / 86400000)
    lines.push(days < 0 ? label + '已逾期 ' + -days + ' 天' : days === 0 ? label + '今天到期' : label + '剩余 ' + days + ' 天')
  }
  const target = Number(s.maintenanceKm)
  if (d && d.mileage > 0 && target > 0) {
    const km = Math.round(target - d.mileage)
    lines.push(km > 0 ? '距下次保养 ' + km + ' km' : '已达保养里程（超出 ' + -km + ' km）')
  }
  return lines
}

