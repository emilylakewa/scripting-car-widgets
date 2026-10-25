import { Path, Script } from 'scripting'
import type { Color } from 'scripting'
import type { CarData } from './api'
import { asColor } from './color-utils'

export type WidgetSize = 'small' | 'medium' | 'large' | 'extraLarge'
// 座椅加热挡位是字符串（'1' / '2' / '3'），统一用这一份枚举，避免各处写死数字。
export const SEAT_LEVELS = ['1', '2', '3'] as const
export type SeatLevel = typeof SEAT_LEVELS[number]
export type WidgetOptions = {
  metricSlots: string[]; stateSlots: string[]
  showMetrics: boolean; showStates: boolean; showTires: boolean; showLocationCard: boolean; showReminders: boolean
  theme: string; name: string; plate: string; showPlate: boolean
  // 自定义主题配色：theme === 'custom' 时用这三个色，渐变起始 / 结束 + 强调色。
  themeColor1: string; themeColor2: string; themeAccent: string
  showAddress: boolean; quote: string; showIcons: boolean; showTemp: boolean
  buttonBackgroundTransparency: number | null
  infoBackgroundTransparency: number | null
  infoBackgroundColor: string; extraLargeBackground: string
  fontScale: number; updateTimeStyle: 'absolute' | 'relative' | 'full'
  buttonConfirmations: boolean[]
  buttonIconOnColor: string; buttonIconOffColor: string; buttonHeight: number
  showButtonLabels: boolean
  // 按钮图标线条粗细：四个尺寸共用一份，故意不放进 PROFILE_KEYS（放进去就变成按尺寸分别保存）。
  // 只影响按钮图标：描边图标（锁车 / 启动 / 寻车 / 刷新 / 热车）直接改描边宽度；
  // 实心剪影（尾门 / 车窗 / 空调 / 冷车）用同色描边把厚片向外长一圈来对齐粗细。
  buttonIconLineWidth: number
  // 座椅加热挡位：每个按钮槽位各存一份（第 i 项对应第 i 个按钮），与 buttons 一样按尺寸分别保存。
  // 开启时下发 CMD_HEATSEAT 的 type 就是它；关闭时固定 flag 0 / type 0（type 0 表示不带挡位）。
  seatLevels: SeatLevel[]
  engineTimes: number[]
  fontColor: string; buttonBackgroundColor: string
  carScale: number; backgroundDim: number; buttonCount: number; buttons: string[]
  barWidth: number; barHeight: number
  buttonRadius: number
  useAudiLogo: boolean; showCenterAddress: boolean; hideLocationRow: boolean
  centerCarScale: number; centerLogoScale: number
  centerCoolMinutes: number; centerHotMinutes: number
  smallStyle: string; smallRingInfo: string; lastButton: string; refreshMinutes: number; autoRefresh: boolean
  carImage: string; centerCarImage: string; smallBackground: string; mediumBackground: string; largeBackground: string
  maintenanceDate: string; insuranceDate: string; inspectionDate: string; maintenanceKm: string
}
export type Settings = WidgetOptions & { profiles?: Partial<Record<WidgetSize, Partial<WidgetOptions>>> }
export const DEFAULTS: Settings = {
  metricSlots: ['mileage', 'oil', 'fuelPct', 'battery'],
  stateSlots: ['windows', 'carDoor', 'carLamp', 'acOn', 'waterTemperature', 'heatSeat'],
  showMetrics: true, showStates: true, showTires: true, showLocationCard: true, showReminders: true,
  theme: 'navy', name: '', plate: '', showPlate: true, showAddress: true,
  themeColor1: '', themeColor2: '', themeAccent: '',
  quote: '每一次出发，都平安抵达', showIcons: true, showTemp: true,
  buttonBackgroundTransparency: null,
  infoBackgroundTransparency: null,
  infoBackgroundColor: '', extraLargeBackground: '',
  fontScale: 100, updateTimeStyle: 'absolute',
  buttonConfirmations: [false, false, false, false, false, false, false],
  buttonIconOnColor: '', buttonIconOffColor: '', buttonHeight: 31, showButtonLabels: true, buttonIconLineWidth: 1.7,
  // 挡位长度与按钮槽位数对齐，新增槽位时一起加。
  seatLevels: ['1', '1', '1', '1', '1', '1', '1'],
  engineTimes: [],
  fontColor: '', buttonBackgroundColor: '',
  carScale: 100, backgroundDim: 0, buttonCount: 7,
  // 7 个按钮槽位：前 6 个是原有默认，第 7 个是座椅加热（新按钮，四个尺寸共用同一份默认值）。
  buttons: ['refresh', 'lock', 'window', 'engine', 'find', 'ac', 'seat'],
  barWidth: 94, barHeight: 3,
  buttonRadius: -1,
  useAudiLogo: true, showCenterAddress: true, hideLocationRow: false, centerCarScale: 100, centerLogoScale: 80,
  centerCoolMinutes: 30, centerHotMinutes: 30,
  smallStyle: 'classic', smallRingInfo: 'oil', lastButton: 'engine', refreshMinutes: 30, autoRefresh: true,
  carImage: '', centerCarImage: '', smallBackground: '', mediumBackground: '', largeBackground: '',
  maintenanceDate: '', insuranceDate: '', inspectionDate: '', maintenanceKm: '',
}
DEFAULTS.engineTimes = DEFAULTS.buttons.map(defaultEngineTimeFor)
declare const Storage: { get<T>(key: string): T | null; set<T>(key: string, value: T): boolean }
const KEY = 'carlink.car.customization.v1'
// 设置只在本进程内由 saveSettings 写入，所以内存里缓存一份归一化结果是安全的：
// 设置页一次渲染里 current() 会被抽几十次，每次重新读存储 + 归一化四个尺寸的 profiles 很贵。
let settingsMemo: Settings | null = null
export function readSettings(): Settings {
  if (settingsMemo) return settingsMemo
  try { settingsMemo = normalizeSettings(Storage.get<Partial<Settings>>(KEY) || {}) }
  catch { settingsMemo = normalizeSettings({}) }
  return settingsMemo
}
export function normalizeSettings(saved: Partial<Settings>): Settings {
  const settings = { ...DEFAULTS, ...saved }
  settings.infoBackgroundColor = normalizeColor(settings.infoBackgroundColor, true)
  settings.infoBackgroundTransparency = typeof settings.infoBackgroundTransparency === 'number' && Number.isFinite(settings.infoBackgroundTransparency) ? bounded(settings.infoBackgroundTransparency, 0, 100, 0) : null
  settings.fontColor = normalizeColor(settings.fontColor)
  settings.buttonBackgroundColor = normalizeColor(settings.buttonBackgroundColor, true)
  settings.buttonBackgroundTransparency = typeof settings.buttonBackgroundTransparency === 'number' && Number.isFinite(settings.buttonBackgroundTransparency) ? bounded(settings.buttonBackgroundTransparency, 0, 100, 0) : null
  settings.buttonIconOnColor = normalizeColor(settings.buttonIconOnColor)
  settings.buttonIconOffColor = normalizeColor(settings.buttonIconOffColor)
  settings.themeColor1 = normalizeColor(settings.themeColor1)
  settings.themeColor2 = normalizeColor(settings.themeColor2)
  settings.themeAccent = normalizeColor(settings.themeAccent)
  // 下面各数值的上/下限与设置页“自定义数值”的可输入范围保持一致，否则自定义值会被静默夹回。
  settings.buttonHeight = Math.round(bounded(settings.buttonHeight, 14, 80, 31))
  // 线条粗细保留一位小数，上下限与设置页「图标线条粗细」的可输入范围一致（0.8 – 3.2）。
  settings.buttonIconLineWidth = Math.round(bounded(settings.buttonIconLineWidth, 0.8, 3.2, 1.7) * 10) / 10
  // 加热挡位只允许 '1' / '2' / '3'，每个槽位各一份；脏值（0、小数、空串）一律回到 1 挡。
  // 旧版本只在根上存过一个全局数字 seatHeatLevel，升级时按它填满各槽位，别把用户选过的挡位打回 1 挡。
  const savedLevels = Array.isArray(saved.seatLevels) ? saved.seatLevels : DEFAULTS.buttons.map(() => (saved as any).seatHeatLevel)
  settings.seatLevels = DEFAULTS.buttons.map((_, i) => asSeatLevel(savedLevels[i]))
  settings.useAudiLogo = typeof settings.useAudiLogo === 'boolean' ? settings.useAudiLogo : DEFAULTS.useAudiLogo
  settings.showCenterAddress = typeof settings.showCenterAddress === 'boolean' ? settings.showCenterAddress : true
  settings.centerCarScale = Math.round(bounded(settings.centerCarScale, 30, 300, 100))
  settings.centerLogoScale = Math.round(bounded(settings.centerLogoScale, 30, 300, DEFAULTS.centerLogoScale))
  settings.centerCoolMinutes = asEngineTime(settings.centerCoolMinutes, DEFAULTS.centerCoolMinutes)
  settings.centerHotMinutes = asEngineTime(settings.centerHotMinutes, DEFAULTS.centerHotMinutes)
  settings.buttonConfirmations = DEFAULTS.buttons.map((_, i) => Array.isArray(saved.buttonConfirmations) && saved.buttonConfirmations[i] === true)
  settings.fontScale = bounded(settings.fontScale, 60, 200, 100)
  settings.updateTimeStyle = settings.updateTimeStyle === 'relative' ? 'relative' : settings.updateTimeStyle === 'full' ? 'full' : 'absolute'
  settings.carScale = bounded(settings.carScale, 30, 300, 100)
  settings.barWidth = Math.round(bounded(settings.barWidth, 20, 400, DEFAULTS.barWidth))
  settings.barHeight = Math.round(bounded(settings.barHeight, 1, 40, DEFAULTS.barHeight))
  settings.buttonRadius = Math.round(bounded(settings.buttonRadius, -1, 60, DEFAULTS.buttonRadius))
  const slotCount = DEFAULTS.buttons.length
  settings.buttonCount = Math.round(bounded(settings.buttonCount, 1, slotCount, slotCount))
  // 旧版本按钮槽位更少（5 个 → 6 个 → 7 个，7 个是新增的座椅加热）。
  // 只有“原来就把槽位全显出来”的配置才跟着自动扩到最新槽位数；
  // 用户主动收起的（数量少于槽位的）保持原数量，新按钮去设置里把数量调大就能出来。
  const legacySlots = Array.isArray(saved.buttons) ? saved.buttons.length : 0
  if (legacySlots > 0 && legacySlots < slotCount && settings.buttonCount >= legacySlots) settings.buttonCount = slotCount
  settings.smallRingInfo = INFO_OPTIONS.some(option => option.id === settings.smallRingInfo) ? settings.smallRingInfo : 'oil'
  settings.backgroundDim = bounded(settings.backgroundDim, 0, 100, 0)
  settings.refreshMinutes = Math.round(bounded(settings.refreshMinutes, 5, 1440, DEFAULTS.refreshMinutes))
  const buttons = Array.isArray(saved.buttons) ? saved.buttons : ['refresh', 'lock', 'window', saved.lastButton || 'engine', 'find']
  settings.buttons = DEFAULTS.buttons.map((fallback, i) => ACTIONS.some(a => a.id === buttons[i]) ? buttons[i] : fallback)
  const savedTimes = Array.isArray(saved.engineTimes) ? saved.engineTimes : []
  settings.engineTimes = DEFAULTS.buttons.map((_, i) => asEngineTime(savedTimes[i], defaultEngineTimeFor(settings.buttons[i])))
  // hideLocationRow：开启后地址/短句整行不渲染，优先级高于 showAddress 与 showLocationCard。
  for (const key of ['showMetrics', 'showStates', 'showTires', 'showLocationCard', 'showReminders', 'hideLocationRow', 'showButtonLabels'] as const) {
    settings[key] = typeof settings[key] === 'boolean' ? settings[key] : DEFAULTS[key]
  }
  for (const key of ['metricSlots', 'stateSlots'] as const) {
    const slots = Array.isArray(saved[key]) ? saved[key]! : []
    settings[key] = DEFAULTS[key].map((fallback, i) => INFO_OPTIONS.some(option => option.id === slots[i]) ? slots[i] : fallback)
  }
  // 四种尺寸的独立配置也走一遍归一：旧备份里缺的新参数（按钮高度、图标下方文字等）在这里补上默认值。
  if (saved.profiles !== undefined) settings.profiles = normalizeProfiles(saved.profiles)
  return settings
}
/** 按尺寸配置的归一化：只保留 PROFILE_KEYS 里真正存过的键，并逐项夹到合法范围。 */
export function normalizeProfiles(value: unknown): Settings['profiles'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Partial<Record<WidgetSize, Partial<WidgetOptions>>> = {}
  for (const { id } of WIDGET_SIZES) {
    const keys = profileOnly((value as any)[id])
    if (!Object.keys(keys).length) continue
    const normalized = normalizeSettings({ ...DEFAULTS, ...keys })
    const rebuilt: any = {}
    for (const key of Object.keys(keys)) rebuilt[key] = (normalized as any)[key]
    out[id] = rebuilt
  }
  return out
}
export const ACTIONS = [
  { id: 'blank', name: '空白' },
  { id: 'refresh', name: '刷新车况' }, { id: 'lock', name: '锁车 / 解锁' },
  { id: 'window', name: '开窗 / 关窗' }, { id: 'engine', name: '启动 / 熄火' },
  { id: 'find', name: '鸣笛寻车' }, { id: 'cool', name: '冷车 30 分钟' },
  { id: 'hot', name: '热车 30 分钟' }, { id: 'ac', name: '空调开启 / 关闭' },
  { id: 'trunk', name: '尾门开启 / 关闭' },
  { id: 'seat', name: '座椅加热 开 / 关' },
]
// 可放进组件的指标/状态/胎压候选项，与 dashboard-model 的 itemById 一一对应。
export const INFO_OPTIONS = [
  { id: 'blank', name: '不显示' },
  { id: 'mileage', name: '累计里程' }, { id: 'oil', name: '剩余油量' },
  { id: 'fuelPct', name: '燃油余量' }, { id: 'battery', name: '蓄电池' },
  { id: 'outsideTemp', name: '车外温度' }, { id: 'locked', name: '车锁状态' },
  { id: 'engineOn', name: '发动机状态' }, { id: 'online', name: '在线状态' },
  { id: 'windows', name: '车窗' }, { id: 'carDoor', name: '车门' }, { id: 'trunkStatus', name: '尾门状态' }, { id: 'hoodStatus', name: '车盖状态' },
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
  'theme', 'themeColor1', 'themeColor2', 'themeAccent', 'name', 'plate', 'showPlate', 'showAddress', 'hideLocationRow', 'quote', 'showIcons', 'showTemp',
  'fontScale', 'fontColor', 'infoBackgroundColor', 'infoBackgroundTransparency',
  'buttonBackgroundColor', 'buttonBackgroundTransparency', 'buttonConfirmations', 'seatLevels', 'engineTimes',
  // useAudiLogo 只影响车辆中心主页，已移入根级设置，不再按尺寸保存。
  'buttonIconOnColor', 'buttonIconOffColor', 'buttonHeight', 'buttonRadius', 'showButtonLabels',
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
// 按 root 对象身份 × 尺寸缓存：同一份设置重渲染时返回同一个对象，
// 下游那些 WeakMap 记忆的取色 / 图片路径才能命中，不再每帧重算。
const sizeCache = new WeakMap<Settings, Partial<Record<WidgetSize, Settings>>>()
/** 把某个尺寸的独立配置叠到根配置上并归一化；settingsForSize 与 readSettingsForSize 共用。 */
function mergeForSize(source: Partial<Settings>, size: WidgetSize): Settings {
  const profile = profileOnly((source as any)?.profiles?.[size])
  // 去掉 profiles 再归一，避免每渲染一次就递归校验四份独立配置。
  const flat: any = { ...source }
  delete flat.profiles
  const merged = normalizeSettings({ ...flat, ...profile })
  // 大号 / 超大号的默认按钮更高；用户没单独给这个尺寸设过高度时才用这份默认值，旧配置不受影响。
  if (!Object.prototype.hasOwnProperty.call(profile, 'buttonHeight')) merged.buttonHeight = defaultButtonHeightFor(size)
  return merged
}
export function settingsForSize(root: Settings, size: WidgetSize): Settings {
  let cache = sizeCache.get(root)
  if (!cache) { cache = {}; sizeCache.set(root, cache) }
  const hit = cache[size]
  if (hit) return hit
  cache[size] = mergeForSize(root, size)
  return cache[size]!
}
/**
 * 组件渲染热路径专用：直接读存储，只归一化「本尺寸」这一份配置。
 * 原来的 readSettings() + settingsForSize() 会归一化 6 遍（根 1 遍 + 四个尺寸的 profiles 各 1 遍 + 合并后再 1 遍），
 * 而组件一次渲染只用到自己那一份，这里合成 1 遍，结果与 settingsForSize(readSettings(), size) 完全等价。
 */
export function readSettingsForSize(size: WidgetSize): Settings {
  let saved: Partial<Settings> = {}
  try { saved = Storage.get<Partial<Settings>>(KEY) || {} } catch { saved = {} }
  return mergeForSize(saved, size)
}
/** 该尺寸没单独设置过按钮高度时的默认值：大号 / 超大号 44，小号 / 中号沿用根默认 31。 */
export const defaultButtonHeightFor = (size: WidgetSize): number =>
  ({ large: 44, extraLarge: 44 } as Partial<Record<WidgetSize, number>>)[size] ?? DEFAULTS.buttonHeight
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
/** 挡位统一成字符串 '1' / '2' / '3'：数字和数字字符串都认，其余（含 0、小数、空串）回到 1 挡。 */
export function asSeatLevel(value: unknown): SeatLevel {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value))
    : typeof value === 'string' ? value.trim() : ''
  return SEAT_LEVELS.find(level => level === text) ?? '1'
}
// 一次渲染里 settings 始终是同一个对象，而这些取色/尺寸函数会被每个文本、每个按钮各调一次
// （fontColorOf 单独就要跑近 50 次）。这里按对象身份缓存纯计算结果：缓存随模块销毁而消失，
// 不会读到过期配置；设置变了对象也就换了身份，自然重算。
function memoized<T>(compute: (s: Settings) => T): (s: Settings) => T {
  const cache = new WeakMap<Settings, T>()
  return (s: Settings): T => {
    if (cache.has(s)) return cache.get(s) as T
    const value = compute(s)
    cache.set(s, value)
    return value
  }
}
export const visibleButtons = memoized((s: Settings) => s.buttons.slice(0, Math.round(bounded(s.buttonCount, 1, DEFAULTS.buttons.length, DEFAULTS.buttons.length))))
export const buttonHeightOf = memoized((s: Settings) => Math.round(bounded(s.buttonHeight, 14, 80, 31)))
// 图标线条粗细：全局一份，保留一位小数；与 normalizeSettings 的范围、设置页输入范围保持一致。
export const buttonIconLineWidthOf = memoized((s: Settings) => Math.round(bounded(s.buttonIconLineWidth, 0.8, 3.2, 1.7) * 10) / 10)
// 座椅加热挡位：按按钮槽位取（每个按钮各一份），槽位没设置过或越界时回到 1 挡。
export function seatLevelOf(s: Settings, slot: number): SeatLevel { return s.seatLevels[slot] ?? '1' }
export const ENGINE_TIME_MIN = 1
export const ENGINE_TIME_MAX = 30
export function defaultEngineTimeFor(action: string | undefined): number { return action === 'cool' || action === 'hot' ? 30 : 10 }
export function asEngineTime(value: unknown, fallback: number): number { return Math.round(bounded(value, ENGINE_TIME_MIN, ENGINE_TIME_MAX, fallback)) }
export function engineTimeOf(s: Settings, slot: number): number { return asEngineTime(s.engineTimes?.[slot], defaultEngineTimeFor(s.buttons[slot])) }
export function centerEngineTimeOf(s: Settings, action: 'cool' | 'hot'): number { return asEngineTime(action === 'cool' ? s.centerCoolMinutes : s.centerHotMinutes, defaultEngineTimeFor(action)) }
const buttonRadiusBase = memoized((s: Settings) => Math.round(bounded(s.buttonRadius, -1, 60, DEFAULTS.buttonRadius)))
// 控制按钮圆角：-1 表示随高度自动（原有观感），其余按设定值，最大不超过高度的一半。
export function buttonRadiusOf(s: Settings, height: number, autoMax = 10): number {
  const value = buttonRadiusBase(s)
  return value < 0 ? Math.min(autoMax, height / 3) : Math.min(value, height / 2)
}
export function useAudiLogoOf(s: Settings): boolean { return s.useAudiLogo !== false }
// 车辆中心页面的位置卡片开关：全局生效（不分尺寸），默认显示。
export function centerAddressOf(s: Settings): boolean { return s.showCenterAddress !== false }
export const carScaleOf = memoized((s: Settings) => bounded(s.carScale, 30, 300, 100) / 100)
// 车辆中心中卡片的车辆大小：独立设置，不跟任何尺寸的“车图大小”联动。
export const centerCarScaleOf = memoized((s: Settings) => bounded(s.centerCarScale, 30, 300, 100) / 100)
// 奥迪车标的大小：与车辆图片大小拆开，两套数值互不影响（只在开启 Logo 时生效）。
export const centerLogoScaleOf = memoized((s: Settings) => bounded(s.centerLogoScale, 30, 300, DEFAULTS.centerLogoScale) / 100)
// 组件里的油量/电量进度条：长宽都可自定义，长度不超过内容宽度。
export const barSizeOf = memoized((s: Settings) => ({
  width: Math.round(bounded(s.barWidth, 20, 400, DEFAULTS.barWidth)),
  height: Math.round(bounded(s.barHeight, 1, 40, DEFAULTS.barHeight)),
}))
export const backgroundDimOf = memoized((s: Settings) => bounded(s.backgroundDim, 0, 100, 0) / 100)
export const COLOR_PRESETS = [
  { value: '', name: '默认颜色' }, { value: '#FFFFFF', name: '白色' },
  { value: '#111827', name: '黑色' }, { value: '#94A3B8', name: '灰色' },
  { value: '#38BDF8', name: '天蓝' }, { value: '#2563EB', name: '蓝色' },
  { value: '#34D399', name: '绿色' }, { value: '#FB923C', name: '橙色' },
  { value: '#F87171', name: '红色' }, { value: '#C4B5FD', name: '紫色' },
]
// 颜色字符串重复率极高（每个文本都拿同一个 fontColor 去解析），正则只跑一次就够。
const colorCache = new Map<string, string>()
export function normalizeColor(value: unknown, allowClear = false): string {
  if (typeof value !== 'string') return ''
  const key = (allowClear ? '1' : '0') + value
  const hit = colorCache.get(key)
  if (hit !== undefined) return hit
  let result = ''
  const color = value.trim()
  if (allowClear && color === 'clear') result = color
  else if (/^#[0-9a-f]{6}$/i.test(color)) result = color.toUpperCase()
  else if (/^#[0-9a-f]{3}$/i.test(color)) result = '#' + color.slice(1).split('').map(v => v + v).join('').toUpperCase()
  if (colorCache.size < 512) colorCache.set(key, result)
  return result
}
const fontScaleOf = memoized((s: Settings) => bounded(s.fontScale, 60, 200, 100))
export function fontSizeOf(s: Settings, base: number): number { return Math.round(base * fontScaleOf(s)) / 100 }
const customFontColor = memoized((s: Settings) => normalizeColor(s.fontColor))
export function fontColorOf(s: Settings, fallback: string): Color { return asColor(customFontColor(s) || fallback) }
function backgroundWithTransparency(value: string, transparency: number | null, fallbackRGB: number[], fallbackAlpha: number): Color {
  const color = normalizeColor(value, true)
  if (color === 'clear') return 'clear'
  // 旧配置没选过透明度时，沿用原始填充色。
  if (typeof transparency !== 'number' || !Number.isFinite(transparency)) return asColor(color || 'rgba(' + fallbackRGB.join(',') + ',' + fallbackAlpha + ')')
  const alpha = Math.round(100 - bounded(transparency, 0, 100, 0)) / 100
  if (alpha === 0) return 'clear'
  if (alpha === 1 && color) return asColor(color)
  const rgb = color ? [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16)) : fallbackRGB
  return asColor('rgba(' + rgb.join(',') + ',' + alpha + ')')
}
export const infoBackgroundOf = memoized((s: Settings) =>
  backgroundWithTransparency(s.infoBackgroundColor, s.infoBackgroundTransparency, [38, 61, 88], 0.8))
export const buttonBackgroundOf = memoized((s: Settings) =>
  backgroundWithTransparency(s.buttonBackgroundColor, s.buttonBackgroundTransparency, [2, 7, 18], 0.72))
// 图标颜色只有「未激活 / 激活」两档（设置页标题按这个口径）：未激活 = 按钮还没开启时那一档亮色，
// 留空退回各按钮的原色；激活 = 功能已经开启 / 完成那一档，留空用白色。
const iconOnColor = memoized((s: Settings) => normalizeColor(s.buttonIconOnColor))
const iconOffColor = memoized((s: Settings) => normalizeColor(s.buttonIconOffColor))
export function buttonIconColorOf(s: Settings, active: boolean, fallback: string): string {
  return (active ? iconOnColor(s) : iconOffColor(s)) || fallback
}
export function saveSettings(value: Settings): void {
  if (Storage.set(KEY, value) === false) throw new Error('设置保存失败，请重试')
  // 落盘后丢掉内存副本，下一次 readSettings / settingsForSize 拿到的就是新值。
  settingsMemo = null
}
export const THEMES = [
  { id: 'navy', name: '深海蓝', colors: ['#213A68', '#081426'], accent: '#7DD3FC' },
  { id: 'forest', name: '墨绿', colors: ['#184D47', '#071E20'], accent: '#6EE7B7' },
  { id: 'violet', name: '暮光紫', colors: ['#493566', '#171129'], accent: '#C4B5FD' },
  { id: 'graphite', name: '石墨黑', colors: ['#3B414A', '#101317'], accent: '#E2E8F0' },
  { id: 'wine', name: '酒红', colors: ['#643345', '#210E19'], accent: '#FDA4AF' },
]
// 主题是「渐变起始色 → 结束色 + 强调色」三件套；theme 为 'custom' 时改读用户自己存的三个色，
// 任一项没存或非法就退回深海蓝的对应色，避免整块背景变黑。
export const CUSTOM_THEME_ID = 'custom'
export const themeOf = memoized((s: Settings) => {
  const base = THEMES.find(t => t.id === s.theme) || THEMES[0]
  if (s.theme !== CUSTOM_THEME_ID) return base
  return {
    id: CUSTOM_THEME_ID, name: '自定义',
    colors: [normalizeColor(s.themeColor1) || base.colors[0], normalizeColor(s.themeColor2) || base.colors[1]],
    accent: normalizeColor(s.themeAccent) || base.accent,
  }
})
// 渐变对象每次渲染都要传给同一个 ZStack，缓存后不再重复建对象。
export const gradientOf = memoized((s: Settings) =>
  ({ gradient: themeOf(s).colors.map(asColor).map((color, i) => ({ color, location: i })), startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }))
// Path.join 走原生桥，缓存后只在真正需要路径时调一次。
export const imagePath = memoized((s: Settings) => s.carImage || Path.join(Script.directory, 'car.png'))
export const centerImagePath = memoized((s: Settings) => s.centerCarImage || Path.join(Script.directory, 'car.png'))
export function plateText(d: CarData, s: Settings): string { return s.showPlate ? s.plate.trim() || d.plate : '' }
export function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, day] = value.split('-').map(Number)
  const date = new Date(y, m - 1, day)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === day ? date.getTime() : null
}
/** 时间戳 → 设置里存的 YYYY-MM-DD（本地时区，日期选择的回写格式）。 */
export function dateText(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number) => (n < 10 ? '0' + n : String(n))
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
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

