// 油价数据层：地区 / 价区 / 油号 / 石油公司 + 中石化公布价 + 下期调价预测（qiyoujiage 网页解析）。
// 数据与「车辆」设置分开存放，避免被 normalizeSettings 清洗。
import { fetch } from 'scripting'
import type { Color } from 'scripting'

declare const Storage: {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): boolean
}

// 网页抓取需要 WebView；声明成全局即可（运行时由 App 注入）。
declare const WebViewController: {
  new (options?: { ephemeral?: boolean }): {
    loadURL(url: string): Promise<boolean>
    evaluateJavaScript<T = any>(script: string): Promise<T>
    dispose(): void
  }
}

/* ------------------------------ 地区 ------------------------------ */

export type OilAreaOption = { label: string; value: string; name: string }

export const areaOptions: OilAreaOption[] = [
  { label: '北京', value: '11', name: 'beijing' },
  { label: '天津', value: '12', name: 'tianjin' },
  { label: '河北', value: '13', name: 'hebei' },
  { label: '山西', value: '14', name: 'shanxi' },
  { label: '河南', value: '41', name: 'henan' },
  { label: '山东', value: '37', name: 'shandong' },
  { label: '上海', value: '31', name: 'shanghai' },
  { label: '江苏', value: '32', name: 'jiangsu' },
  { label: '浙江', value: '33', name: 'zhejiang' },
  { label: '安徽', value: '34', name: 'anhui' },
  { label: '福建', value: '35', name: 'fujian' },
  { label: '江西', value: '36', name: 'jiangxi' },
  { label: '湖北', value: '42', name: 'hubei' },
  { label: '湖南', value: '43', name: 'hunan' },
  { label: '广东', value: '44', name: 'guangdong' },
  { label: '广西', value: '45', name: 'guangxi' },
  { label: '云南', value: '53', name: 'yunnan' },
  { label: '贵州', value: '52', name: 'guizhou' },
  { label: '海南', value: '46', name: 'hainan' },
  { label: '重庆', value: '50', name: 'chongqing' },
  { label: '四川', value: '51', name: 'sichuan' },
  { label: '新疆', value: '65', name: 'xinjiang' },
  { label: '内蒙古', value: '15', name: 'neimenggu' },
  { label: '辽宁', value: '21', name: 'liaoning' },
  { label: '吉林', value: '22', name: 'jilin' },
  { label: '宁夏', value: '64', name: 'ningxia' },
  { label: '陕西', value: '61', name: 'shanxi-3' },
  { label: '黑龙江', value: '23', name: 'heilongjiang' },
  { label: '西藏', value: '54', name: 'xizang' },
  { label: '青海', value: '63', name: 'qinghai' },
  { label: '甘肃', value: '62', name: 'gansu' }
]

export function areaOptionOf(value: string): OilAreaOption {
  return areaOptions.find(item => item.value === value) ?? areaOptions[7]
}

/* ------------------------------ 油号 ------------------------------ */

export type OilTypeId = '89' | '92' | '95' | '98' | '0' | '-10' | '-20' | '-35'

export const oilTypeOptions: { value: OilTypeId; label: string; shortLabel: string }[] = [
  { value: '89', label: '89# 汽油', shortLabel: '89#' },
  { value: '92', label: '92# 汽油', shortLabel: '92#' },
  { value: '95', label: '95# 汽油', shortLabel: '95#' },
  { value: '98', label: '98# 汽油', shortLabel: '98#' },
  { value: '0', label: '0# 柴油', shortLabel: '0#' },
  { value: '-10', label: '-10# 柴油', shortLabel: '-10#' },
  { value: '-20', label: '-20# 柴油', shortLabel: '-20#' },
  { value: '-35', label: '-35# 柴油', shortLabel: '-35#' }
]

export const MAX_CARD_TYPES = 3

export function oilTypeOptionOf(value: OilTypeId) {
  return oilTypeOptions.find(item => item.value === value) ?? oilTypeOptions[1]
}

// 各油号在中石化接口里可能出现的数据字段，按优先级匹配。
const GRADE_FIELDS: { type: OilTypeId; fields: string[] }[] = [
  { type: '89', fields: ['GAS_89'] },
  { type: '92', fields: ['AIPAO92', 'AIPAO_GAS_92', 'AIPAOE92', 'AIPAO_GAS_E92', 'E92', 'GAS_92'] },
  { type: '95', fields: ['AIPAO95', 'AIPAO_GAS_95', 'AIPAOE95', 'AIPAO_GAS_E95', 'E95', 'GAS_95'] },
  { type: '98', fields: ['AIPAO98', 'AIPAO_GAS_98', 'AIPAOE98', 'AIPAO_GAS_E98', 'E98', 'GAS_98'] },
  { type: '0', fields: ['CHAI_0', 'CHECHAI_0'] },
  { type: '-10', fields: ['CHAI_10', 'CHECHAI_10'] },
  { type: '-20', fields: ['CHAI_20', 'CHECHAI_20'] },
  { type: '-35', fields: ['CHAI_35', 'CHECHAI_35'] }
]

/* ---------------------------- 石油公司 ---------------------------- */

export type OilCompanyId = 'sinopec' | 'petrochina' | 'cnooc' | 'shell' | 'other'

export const companyOptions: { id: OilCompanyId; name: string; short: string; tint: Color }[] = [
  { id: 'sinopec', name: '中国石化', short: '中石化', tint: '#E23B3B' },
  { id: 'petrochina', name: '中国石油', short: '中石油', tint: '#F08A24' },
  { id: 'cnooc', name: '中国海油', short: '中海油', tint: '#2C82C9' },
  { id: 'shell', name: '壳牌', short: '壳牌', tint: '#D9A400' },
  { id: 'other', name: '其他加油站', short: '其他', tint: '#6B7A90' }
]

export function companyOf(id: string) {
  return companyOptions.find(item => item.id === id) ?? companyOptions[0]
}

/* ------------------------------ 设置 ------------------------------ */

export type OilSettings = {
  enabled: boolean
  areaType: string
  areaZone: number
  company: OilCompanyId
  oilTypes: OilTypeId[]
  /** 加油油号：卡片用它折算「加满一箱」的金额 */
  refuelType: OilTypeId
  /** 每升优惠（元），用于把公布价折算成实际到店价 */
  discount: number
  /** 油箱容量（升）：0 = 跟随车机上报，其他值手动指定 */
  tankLiters: number
}

export const DEFAULT_OIL_SETTINGS: OilSettings = {
  enabled: true,
  areaType: '32',
  areaZone: 0,
  company: 'sinopec',
  oilTypes: ['92', '95', '0'],
  refuelType: '92',
  discount: 0,
  tankLiters: 0
}

export const OIL_SETTINGS_KEY = 'carlink.oil.settings.v1'
const SNAPSHOT_KEY = 'carlink.oil.snapshot.v1'
const FORECAST_KEY = 'carlink.oil.forecast.v1'
const SNAPSHOT_TTL = 10 * 60 * 1000
const FORECAST_TTL = 6 * 60 * 60 * 1000
/** 单次网页抓取的上限：加载卡死时必须能放弃，否则组件渲染会一直等下去。 */
const SCRAPE_TIMEOUT = 8000
/**
 * 缓存是否还新鲜：时间戳落在未来（设备改过时间、备份还原了别机数据）时一律当过期，
 * 否则 Date.now() - at 会一直是负数，缓存永不过期、再也不会去刷新。
 */
function freshEnough(at: unknown, ttl: number): boolean {
  const age = Date.now() - Number(at || 0)
  return age >= 0 && age < ttl
}

function validOilType(value: any): value is OilTypeId {
  return oilTypeOptions.some(item => item.value === value)
}

export function normalizeOilSettings(raw: any): OilSettings {
  const src = raw && typeof raw === 'object' ? raw : {}
  const types = Array.isArray(src.oilTypes) ? src.oilTypes.filter(validOilType) : []
  const unique: OilTypeId[] = []
  types.forEach((t: OilTypeId) => { if (!unique.includes(t)) unique.push(t) })
  const discount = Number(src.discount)
  const tank = Number(src.tankLiters)
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_OIL_SETTINGS.enabled,
    areaType: areaOptions.some(item => item.value === src.areaType) ? String(src.areaType) : DEFAULT_OIL_SETTINGS.areaType,
    areaZone: Number.isFinite(Number(src.areaZone)) && Number(src.areaZone) >= 0 ? Math.round(Number(src.areaZone)) : 0,
    company: companyOptions.some(item => item.id === src.company) ? src.company : DEFAULT_OIL_SETTINGS.company,
    oilTypes: unique.length ? unique.slice(0, MAX_CARD_TYPES) : [...DEFAULT_OIL_SETTINGS.oilTypes],
    refuelType: validOilType(src.refuelType) ? src.refuelType : DEFAULT_OIL_SETTINGS.refuelType,
    discount: Number.isFinite(discount) ? Math.min(2, Math.max(0, Math.round(discount * 100) / 100)) : 0,
    tankLiters: Number.isFinite(tank) ? Math.min(200, Math.max(0, Math.round(tank * 10) / 10)) : 0
  }
}

export function readOilSettings(): OilSettings {
  try {
    return normalizeOilSettings(Storage.get<OilSettings>(OIL_SETTINGS_KEY))
  } catch {
    return { ...DEFAULT_OIL_SETTINGS }
  }
}

export function saveOilSettings(value: OilSettings): OilSettings {
  const next = normalizeOilSettings(value)
  if (Storage.set(OIL_SETTINGS_KEY, next) === false) throw new Error('油价设置保存失败，请重试')
  return next
}

/* ---------------------------- 中石化接口 ---------------------------- */

type SinopecDict = Record<string, any>

type SinopecZone = { areaCheck?: SinopecDict; areaData?: SinopecDict }

type SinopecResponse = {
  provinceCheck?: SinopecDict | null
  provinceData?: SinopecDict | null
  area?: SinopecZone[] | null
}

export type OilGrade = {
  type: OilTypeId
  label: string
  shortLabel: string
  price: number
}

export type OilZone = {
  index: number
  name: string
  description: string
  startDate: string
  grades: OilGrade[]
}

export async function requestProvince(areaType: string): Promise<SinopecResponse> {
  const res = await fetch('https://cx.sinopecsales.com/yjkqiantai/data/switchProvince', {
    method: 'POST',
    timeout: 15,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://cx.sinopecsales.com',
      Referer: 'https://cx.sinopecsales.com/yjkqiantai/core/initCpb'
    },
    body: JSON.stringify({ provinceId: areaType })
  })
  if (!res.ok) throw new Error(`油价接口 HTTP ${res.status}`)
  const obj: any = await res.json()
  const data = obj?.data ?? obj
  if (!data || typeof data !== 'object') throw new Error('油价数据格式异常')
  return data as SinopecResponse
}

function priceIn(data: SinopecDict | null | undefined, fields: string[]): number {
  if (!data) return 0
  for (const field of fields) {
    const value = Number(data[field])
    if (Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100
  }
  return 0
}

function gradesFrom(zoneData: SinopecDict | null | undefined, fallback: SinopecDict | null | undefined): OilGrade[] {
  const rows: OilGrade[] = []
  GRADE_FIELDS.forEach(def => {
    const price = priceIn(zoneData, def.fields) || priceIn(fallback, def.fields)
    if (!price) return
    const option = oilTypeOptionOf(def.type)
    rows.push({ type: def.type, label: option.label, shortLabel: option.shortLabel, price })
  })
  return rows
}

function startDateOf(data: SinopecDict | null | undefined): string {
  const raw = data?.START_DATE ?? data?.startDate ?? ''
  return typeof raw === 'string' ? raw.slice(0, 10) : ''
}

/** 把接口响应整理成价区列表；没有价区的省份就是单个「全省」价区。 */
export function zonesOf(response: SinopecResponse): OilZone[] {
  const provinceData = response.provinceData ?? null
  const areas = Array.isArray(response.area) ? response.area : []
  if (areas.length) {
    const zones = areas
      .map((entry, index) => {
        // 接口偶尔会在 area 里塞 null 元素，直接取属性会抛 TypeError 把整张卡片弄成错误态。
        const check = entry?.areaCheck ?? {}
        const data = entry?.areaData ?? null
        const grades = gradesFrom(data, provinceData)
        return {
          index,
          name: String(check.AREA_NAME ?? '') || `价区 ${index + 1}`,
          description: String(check.AREA_DESC ?? ''),
          startDate: startDateOf(data) || startDateOf(provinceData),
          grades
        }
      })
      .filter(zone => zone.grades.length > 0)
    // 过滤掉没有油号的价区后必须重排 index：设置里的 areaZone 与价区 Picker 的 tag
    // 都用「数组位置」，两者保持一致才不会选错价区。
    if (zones.length) return zones.map((zone, index) => ({ ...zone, index }))
  }
  const grades = gradesFrom(provinceData, null)
  if (!grades.length) throw new Error('该地区暂未公布油价')
  return [{ index: 0, name: '', description: '', startDate: startDateOf(provinceData), grades }]
}

export async function loadZones(areaType: string): Promise<OilZone[]> {
  return zonesOf(await requestProvince(areaType))
}

/* ---------------------------- 调价预测 ---------------------------- */

export type OilDirection = 'rising' | 'falling' | 'stranded'

export type OilForecast = {
  direction: OilDirection
  /** 每升变动金额（元），搁浅时为 0 */
  change: number
  /** 调价窗口，例如 10/15 24时 */
  adjustDate: string
  /** 原始提示文本，便于排查 */
  text: string
  at: number
  stale?: boolean
  /** 抓取/解析失败、手里也没有缓存时置真：文案必须说“暂不可用”，不能冒充“预计搁浅”。 */
  unknown?: boolean
}

const TONS_PER_LITER = 1385

const EMPTY_FORECAST: OilForecast = { direction: 'stranded', change: 0, adjustDate: '', text: '', at: 0 }

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function midpoint(a: number, b: number): number {
  return round2(a + (b - a) / 2)
}

/** 只保留第一段自然语言，丢掉后面的脚本代码，用于缓存与原文展示。 */
export function cleanForecastText(raw: string): string {
  return String(raw ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .split(/\bvar\s/)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** 解析 qiyoujiage 的 .tishi 文本：涨跌方向、每升变动、调价日期。 */
export function parseForecastText(raw: string): { direction: OilDirection; change: number; adjustDate: string; ok: boolean } {
  const plain = cleanForecastText(raw)

  // ok 用来区分「真的搁浅」和「什么都没认出来」：后者不该写缓存，
  // 否则页面改版后组件会连续 6 小时显示「预计搁浅」这种假结论。
  let recognized = false
  let direction: OilDirection = 'stranded'
  if (/搁浅|不作调整|不调整|维持目前/.test(plain)) { direction = 'stranded'; recognized = true }
  else if (/上涨|上调|涨价|走高/.test(plain)) { direction = 'rising'; recognized = true }
  else if (/下跌|下调|降价|走低/.test(plain)) { direction = 'falling'; recognized = true }

  let change = 0
  const literRange = plain.match(/(\d+(?:\.\d+)?)\s*元\s*\/\s*升\s*[-~～—至到]\s*(\d+(?:\.\d+)?)/)
  const literSingle = plain.match(/(\d+(?:\.\d+)?)\s*元\s*\/\s*升/)
  const tonRange = plain.match(/(\d+(?:\.\d+)?)\s*元\s*\/\s*吨\s*[-~～—至到]\s*(\d+(?:\.\d+)?)/)
  const tonSingle = plain.match(/(\d+(?:\.\d+)?)\s*元\s*\/\s*吨/)
  if (literRange) change = midpoint(Number(literRange[1]), Number(literRange[2]))
  else if (literSingle) change = round2(Number(literSingle[1]))
  else if (tonRange) change = round2(midpoint(Number(tonRange[1]), Number(tonRange[2])) / TONS_PER_LITER)
  else if (tonSingle) change = round2(Number(tonSingle[1]) / TONS_PER_LITER)
  if (!Number.isFinite(change) || change < 0) change = 0
  if (direction === 'stranded') change = 0

  let adjustDate = ''
  const date = plain.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (date) {
    adjustDate = `${Number(date[2])}/${Number(date[3])}`
    const hour = plain.match(/(\d{1,2})\s*时/)
    if (hour) adjustDate += ` ${Number(hour[1])}时`
  }
  return { direction, change, adjustDate, ok: recognized || change > 0 || !!adjustDate }
}

/** 给异步调用加超时，网页卡住时也能结束，finally 里的 dispose 才不会等不到。 */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    task.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) }
    )
  })
}

async function scrapeForecastText(areaName: string): Promise<string | null> {
  let web: { loadURL(url: string): Promise<boolean>; evaluateJavaScript<T = any>(script: string): Promise<T>; dispose(): void } | null = null
  try {
    web = new WebViewController({ ephemeral: true })
    const ok = await withTimeout(web.loadURL(`http://m.qiyoujiage.com/${areaName}.shtml`), SCRAPE_TIMEOUT)
    if (!ok) return null
    const text = await withTimeout(web.evaluateJavaScript<string>("return document.querySelector('.tishi').textContent"), SCRAPE_TIMEOUT)
    return typeof text === 'string' && text.trim() ? text : null
  } catch {
    return null
  } finally {
    try { web?.dispose() } catch { /* 释放失败不影响结果 */ }
  }
}

function forecastKey(areaType: string): string {
  return FORECAST_KEY + '.' + areaType
}

export async function loadForecast(areaType: string, force: boolean): Promise<OilForecast> {
  const cached = (() => {
    try { return Storage.get<OilForecast>(forecastKey(areaType)) } catch { return null }
  })()
  if (!force && cached && freshEnough(cached.at, FORECAST_TTL)) return cached

  const text = await scrapeForecastText(areaOptionOf(areaType).name)
  if (!text) {
    // 抓不到就退化成缓存 / 未知：卡片仍显示现价，只是没有预测。
    return cached ? { ...cached, stale: true } : { ...EMPTY_FORECAST, at: Date.now(), stale: true, unknown: true }
  }
  const parsed = parseForecastText(text)
  if (!parsed.ok) {
    // 抓到了文本却解析不出方向/金额/日期：按抓取失败处理，不写缓存。
    return cached ? { ...cached, stale: true } : { ...EMPTY_FORECAST, at: Date.now(), stale: true, unknown: true }
  }
  const value: OilForecast = { direction: parsed.direction, change: parsed.change, adjustDate: parsed.adjustDate, text: cleanForecastText(text), at: Date.now() }
  try { Storage.set(forecastKey(areaType), value) } catch { /* 缓存失败不影响展示 */ }
  return value
}

/* ---------------------------- 快照缓存 ---------------------------- */

export type OilSnapshot = {
  areaType: string
  region: string
  zones: OilZone[]
  forecast: OilForecast
  updatedAt: number
  stale?: boolean
}

/** 快照按地区分开存：切换地区或同时放多个地区的组件时不会互相覆盖。 */
function snapshotKey(areaType: string): string {
  return SNAPSHOT_KEY + '.' + areaType
}

function readSnapshot(areaType: string): OilSnapshot | null {
  try {
    const value = Storage.get<OilSnapshot>(snapshotKey(areaType))
    if (!value || !Array.isArray(value.zones) || !value.zones.length) return null
    if (value.areaType && value.areaType !== areaType) return null
    return { ...value, forecast: value.forecast ?? EMPTY_FORECAST }
  } catch {
    return null
  }
}

function writeSnapshot(value: OilSnapshot): void {
  try { Storage.set(snapshotKey(value.areaType), value) } catch { /* 缓存失败不影响展示 */ }
}

export function clearOilCache(): void {
  try {
    areaOptions.forEach(area => {
      Storage.set(forecastKey(area.value), null)
      Storage.set(snapshotKey(area.value), null)
    })
    // 顺带清掉旧版单 key 快照，避免升级后留下垃圾数据。
    Storage.set(SNAPSHOT_KEY, null)
  } catch { /* 清理失败忽略 */ }
}

export async function loadOilSnapshot(settings: OilSettings, force: boolean): Promise<OilSnapshot> {
  const cached = readSnapshot(settings.areaType)
  if (!force && cached && freshEnough(cached.updatedAt, SNAPSHOT_TTL)) return cached

  const region = areaOptionOf(settings.areaType)
  let zones = cached?.zones ?? []
  let failed: Error | null = null
  try {
    zones = await loadZones(settings.areaType)
  } catch (error) {
    failed = error instanceof Error ? error : new Error(String(error))
  }
  // 价区没拿到、手里又没有可用缓存：现在就能确定要报错，
  // 不必再跑一次预测（每次都是一个最多 8 秒的 WebView），省时间也省电。
  if (failed && !zones.length) throw failed

  const forecast = await loadForecast(settings.areaType, force)

  if (!zones.length) throw new Error('该地区暂未公布油价')
  if (failed && cached) {
    return { ...cached, forecast, stale: true }
  }
  const snapshot: OilSnapshot = {
    areaType: settings.areaType,
    region: region.label,
    zones,
    forecast,
    updatedAt: Date.now()
  }
  writeSnapshot(snapshot)
  return snapshot
}

/* ---------------------------- 展示辅助 ---------------------------- */

export function zoneOf(snapshot: OilSnapshot | null, settings: OilSettings): OilZone | null {
  if (!snapshot || !snapshot.zones.length) return null
  const index = settings.areaZone >= 0 && settings.areaZone < snapshot.zones.length ? settings.areaZone : 0
  return snapshot.zones[index]
}

/** 按设置里的油号挑行；该地区没有对应油号时自动回退到前几个可用的。 */
export function gradeRowsOf(zone: OilZone | null, settings: OilSettings): OilGrade[] {
  if (!zone) return []
  const picked = settings.oilTypes
    .map(type => zone.grades.find(grade => grade.type === type))
    .filter((grade): grade is OilGrade => Boolean(grade))
  if (picked.length) return picked.slice(0, MAX_CARD_TYPES)
  return zone.grades.slice(0, MAX_CARD_TYPES)
}

export function netPriceOf(grade: OilGrade, settings: OilSettings): number {
  return Math.max(0, round2(grade.price - (settings.discount || 0)))
}

export function predictedPriceOf(price: number, forecast: OilForecast | null | undefined): number {
  if (!forecast) return price
  if (forecast.direction === 'rising') return round2(price + forecast.change)
  if (forecast.direction === 'falling') return round2(price - forecast.change)
  return price
}

export function directionTextOf(forecast: OilForecast | null | undefined): string {
  if (!forecast) return '待调价'
  if (forecast.unknown) return '调价信息暂不可用'
  if (forecast.direction === 'rising') return '预计上涨'
  if (forecast.direction === 'falling') return '预计下跌'
  return '预计搁浅'
}

export function trendSymbolOf(forecast: OilForecast | null | undefined): string {
  if (!forecast) return '·'
  if (forecast.direction === 'rising') return '↗'
  if (forecast.direction === 'falling') return '↘'
  return '→'
}

export function trendColorOf(forecast: OilForecast | null | undefined): Color {
  if (!forecast) return '#8A97A8'
  if (forecast.direction === 'rising') return '#D9463F'
  if (forecast.direction === 'falling') return '#2E9E6B'
  return '#8A97A8'
}

export function moneyText(value: number): string {
  return Number(value || 0).toFixed(2)
}

export function clockText(ts: number): string {
  if (!ts) return ''
  const date = new Date(ts)
  const pad = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ---------------------------- 加满一箱 ---------------------------- */

/** 在价区里找“加油油号”对应的报价；该地区没公布这个油号时返回 null。 */
export function refuelGradeOf(zone: OilZone | null, settings: OilSettings): OilGrade | null {
  if (!zone) return null
  return zone.grades.find(grade => grade.type === settings.refuelType) ?? null
}

/** 还要加多少升：油箱容量 − 车机上报的剩余油量（均未上报时返回 null，不拿 0 充数）。 */
export function fillLitersOf(tankLiters: number | null | undefined, remainingLiters: number | null | undefined): number | null {
  if (tankLiters == null || remainingLiters == null) return null
  const tank = Number(tankLiters)
  const left = Number(remainingLiters)
  if (!Number.isFinite(tank) || !Number.isFinite(left) || tank <= 0 || left < 0) return null
  // 剩余量偶尔会略大于标称容量（浮点/传感器误差），钳到 0。
  const need = Math.max(0, tank - left)
  return Math.round(need * 10) / 10
}

/** 加满一箱的金额 = 升数 × 该油号折后单价。数据不足时返回 null。 */
export function refuelCostOf(liters: number | null, pricePerLiter: number): number | null {
  if (liters == null || !Number.isFinite(liters) || liters <= 0) return null
  if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) return null
  return Math.round(liters * pricePerLiter * 100) / 100
}
