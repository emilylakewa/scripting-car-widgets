import { fetch } from 'scripting'
import { readAccount, requireAccount, accountIdentity, assertCurrentAccount, readAMapKey, type Account } from './credentials'
import { PROVIDERS, type ProviderId } from './providers'

const CACHE_KEY = 'carlink.car.data.'

export type CarData = {
  provider: ProviderId
  accountId: string
  availability?: Record<string, boolean>
  plate: string
  model: string
  machineId: string
  oilBox: number
  locked: boolean
  online: boolean
  engineOn: boolean
  acOn: boolean
  mileage: number
  oil: number
  battery: number
  outsideTemp: number
  fuelPct: number
  // Left front, right front, left rear, right rear; bar. Null means unavailable.
  tirePressures?: (number | null)[]
  windows: number[]
  carLamp: string
  carDoor: string
  heatSeat: string
  waterTemperature: number
  lat: number
  lng: number
  address: string
  addressShort: string
  updatedAt: number
}

declare const Storage: {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): boolean
}

declare const Location: {
  reverseGeocode(options: {
    latitude: number
    longitude: number
    locale?: string
  }): Promise<any[] | null>
}

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * 位图字段（车门、车灯、车窗、座椅加热）在接口里可能是：
 * - 数组：[1, 0, 0, 0]
 * - 逗号分隔字符串：'0,0,1,0'
 * - 连续位串：'0100'（部分车机直接回传二进制串）
 * 无法解析时返回 null（表示“未知”），避免凭空造出 0 造成误判。
 * 车窗 / 车门 / 车灯 / 座椅加热必须共用这一套解析，否则同一个字段两处读到不同结果。
 */
export function bits(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.length && value.every(v => Number.isInteger(v) && v >= 0) ? value as number[] : null
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? [value] : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parts = value.trim().split(',')
  if (parts.some(v => !/^\d+$/.test(v.trim()))) return null
  // 单个且长度 ≥2 的 0/1 串按位展开，其余按数字列表解析。
  return parts.length === 1 && /^[01]{2,}$/.test(parts[0]) ? parts[0].split('').map(Number) : parts.map(Number)
}

// 同一次运行里车况缓存只会被本模块的 writeCache / patchCache 改写（全项目只有这里写这个键），
// 而一次组件渲染会读 2~3 遍（main / 确认单校验 / loadCar 里的上一份快照）。读一次存住即可。
let cacheMemo: CarData | null | undefined
let cacheMemoFor = ''
export function readCache(): CarData | null {
  try {
    const account = readAccount()
    if (!account) return null
    const identity = accountIdentity(account)
    if (cacheMemo !== undefined && cacheMemoFor === identity) return cacheMemo
    const data = Storage.get<CarData>(CACHE_KEY + account.provider)
    const valid = data?.provider === account.provider && data.accountId === identity ? data : null
    cacheMemo = valid
    cacheMemoFor = identity
    return valid
  } catch { return null }
}
export function writeCache(data: CarData): void {
  try {
    const account = readAccount()
    if (account && data.provider === account.provider && data.accountId === accountIdentity(account)) {
      Storage.set(CACHE_KEY + account.provider, data)
      cacheMemo = data
      cacheMemoFor = data.accountId
    }
  } catch { /* 缓存失败不影响本次刷新 */ }
}

export function patchCache(patch: Partial<CarData>): void {
  // readCache 已校验过服务与授权，且带模块内缓存，这里不会再多读钥匙串。
  try {
    const d = readCache()
    if (d) {
      const next = { ...d, ...patch }
      Storage.set(CACHE_KEY + d.provider, next)
      cacheMemo = next
      cacheMemoFor = d.accountId
    }
  } catch { /* 缓存失败不影响指令下发 */ }
}

/** 统一解析接口响应：401 / 403 提示重新授权，其余错误抛出服务端提示。 */
async function readPayload(res: any): Promise<any> {
  if (res.status === 401 || res.status === 403) throw new Error('Token 无效或已过期，请在授权与地图中更新')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const obj: any = await res.json()
  if (String(obj?.status) !== '200') throw new Error(obj?.message || `状态 ${obj?.status}`)
  return obj
}

// guard 为假时不在每次请求前后各读一遍钥匙串：批量请求（loadCar 并发三条）由调用方
// 在整批前后各校验一次即可，一次刷新从 7 次钥匙串读取降到 1 次。
async function apiGet(account: Account, path: string, guard = true): Promise<any> {
  if (guard) assertCurrentAccount(account)
  const res = await fetch(`https://${PROVIDERS[account.provider].host}${path}`, {
    timeout: 12,
    headers: { 'Content-Type': 'application/json;charset=utf-8', Accept: '*/*', Authorization: account.token },
  })
  if (guard) assertCurrentAccount(account)
  const obj = await readPayload(res)
  return obj?.data
}

function locationPath(machineId: string): string {
  return `/api/trail/getLocation?machineId=${encodeURIComponent(machineId)}`
}

async function addressOf(lat: number, lng: number): Promise<{ address: string; addressShort: string }> {
  if (!lat || !lng) return { address: '', addressShort: '' }
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  // 高德 Key 仅从用户填写的钥匙串项读取，不随脚本导出。
  const amapKey = readAMapKey()
  if (amapKey) {
    try {
      const response = await fetch('https://restapi.amap.com/v3/geocode/regeo?key=' + encodeURIComponent(amapKey)
        + '&location=' + encodeURIComponent(lng.toFixed(6) + ',' + lat.toFixed(6)) + '&extensions=base&output=JSON', { timeout: 8 })
      if (response.ok) {
        const result: any = await response.json()
        const geo = result?.regeocode
        const full = typeof geo?.formatted_address === 'string' ? geo.formatted_address.trim() : ''
        if (String(result?.status) === '1' && full) {
          const c = geo.addressComponent || {}
          const text = (v: unknown): string => typeof v === 'string' ? v.trim() : ''
          const parts = [text(c.city), text(c.district), text(c.township), text(c.streetNumber?.street), text(c.streetNumber?.number)].filter(Boolean)
          return { address: full, addressShort: parts.filter((v, i) => parts.indexOf(v) === i).join('') || full }
        }
      }
    } catch {
      // 超时或服务失败时继续使用系统地址解析，不记录带 Key 的请求地址。
    }
  }
  try {
    const places = await Location.reverseGeocode({ latitude: lat, longitude: lng, locale: 'zh-CN' })
    const p: any = places?.[0]
    if (!p) return { address: fallback, addressShort: fallback }

    const fullParts = [p.administrativeArea, p.locality, p.subLocality, p.thoroughfare, p.name]
      .filter(Boolean)
      .map((v: any) => String(v))
    const full = fullParts.filter((v, i) => fullParts.indexOf(v) === i).join('')

    const road = p.thoroughfare || p.name
    const shortParts = [p.locality, p.subLocality, road]
      .filter(Boolean)
      .map((v: any) => String(v))
    const short = shortParts.filter((v, i) => shortParts.indexOf(v) === i).join('')
    return { address: full || fallback, addressShort: short || full || fallback }
  } catch {
    return { address: fallback, addressShort: fallback }
  }
}

function parseTirePressures(raw: unknown): (number | null)[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  return Array.from({ length: 4 }, (_, index) => {
    const value = parts[index]
    if (typeof value !== 'string' && typeof value !== 'number') return null
    const text = String(value).trim()
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null
    const number = Number(text)
    // Devices report tenths of bar. Preserve explicit zero; never manufacture it for missing data.
    return Number.isFinite(number) && number >= 0 ? number / 10 : null
  })
}

export type LoadCarOptions = {
  /**
   * 轻量模式：只拉车况（getNowCar + getCarOBD），不拉定位、不做逆地理编码。
   * 指令下发后的状态回读、座椅加热回读都用它：位置那几秒里不可能变，
   * 省掉一整段串行网络往返，也不再去唤醒系统定位（耗电大头）。
   */
  light?: boolean
}

export async function loadCar(options: LoadCarOptions = {}): Promise<CarData> {
  const account = requireAccount()
  // 上一份快照里的设备号：定位接口只依赖它，用它把定位提前和车况请求并行发出。
  // 原来必须等车况返回才发定位请求，白白多等一整段网络往返（通常 200~600ms）。
  const prev = readCache()
  const earlyLoc = !options.light && prev?.machineId
    ? apiGet(account, locationPath(prev.machineId), false).catch(() => null)
    : null
  const [nowCar, obd] = await Promise.all([
    apiGet(account, '/api/car/getNowCar', false),
    apiGet(account, '/api/car/getCarOBD', false),
  ])
  const vehicle = nowCar?.carInfo ?? nowCar ?? {}
  const machineId = String(obd?.machineId || vehicle.machineId || '').trim()
  if (!machineId) throw new Error('接口未返回车辆设备号，请确认 Token 对应的车辆')
  let loc: any = null
  if (options.light) {
    // 轻量模式：位置直接沿用上一份快照（下面 located 为假的分支）。
  } else if (prev?.machineId === machineId && earlyLoc) {
    loc = await earlyLoc
    // 预取在极端情况下失败（瞬时断网）时补一次请求，不让一次抖动把位置清空。
    if (!loc) loc = await apiGet(account, locationPath(machineId), false).catch(() => null)
  } else {
    loc = await apiGet(account, locationPath(machineId), false).catch(() => null)
  }
  // 油箱容量缺失时保留 0（未知），不要用 75L 虚构：那会让油量百分比和
  // 「加满一箱」金额都按错误的容量算出来，用户看到的是假数字。
  const oilBox = num(vehicle.oilBox)
  const oil = num(obd?.realTimeOilLevel)
  // 定位失败（请求报错或返回 0,0）时沿用上一次的有效坐标与地址：
  // 一次瞬时失败不该把已经解析好的位置清空。
  const rawLat = num(loc?.location?.lat)
  const rawLng = num(loc?.location?.lng)
  const located = !!loc && Number.isFinite(rawLat) && Number.isFinite(rawLng) && !(rawLat === 0 && rawLng === 0)
  const lat = located ? rawLat : (prev?.lat ?? 0)
  const lng = located ? rawLng : (prev?.lng ?? 0)
  // 车辆没挪位（经纬度几乎不变）就直接沿用上次解析好的地址：
  // 每帧刷新能省掉一次高德请求，没填高德 Key 时还能省掉一次系统逆地理编码（会唤醒定位）。
  // 上次只拿到坐标占位地址（解析失败）时不沿用，下次照样重试，避免把失败结果粘住。
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  const reuse = !!prev && Math.abs(prev.lat - lat) < 1e-5 && Math.abs(prev.lng - lng) < 1e-5 && !!prev.address && prev.address !== coords
  const addr = !located
    ? { address: prev?.address || '', addressShort: prev?.addressShort || prev?.address || '' }
    : reuse && prev
      ? { address: prev.address, addressShort: prev.addressShort || prev.address }
      : await addressOf(lat, lng)
  const validNumber = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(parseFloat(String(v)))
  const validBits = (v: unknown) => (typeof v === 'string' || typeof v === 'number' || Array.isArray(v)) && /^\d+(,\s*\d+)*$/.test(String(v).trim())
  const availability = {
    locked: /^(0|1)$/.test(String(obd?.isDefence ?? '')),
    engineOn: validNumber(obd?.engineFlag), online: /^(0|1)$/.test(String(obd?.isOnline ?? '')),
    acOn: validNumber(obd?.acStatus), windows: validBits(obd?.carWindow),
    carLamp: validBits(obd?.carLamp), carDoor: validBits(obd?.carDoor), heatSeat: validBits(obd?.heatSeat),
    waterTemperature: validNumber(obd?.waterTemperature), outsideTemp: validNumber(obd?.outsideTemperature),
    mileage: validNumber(obd?.carLocation), oil: validNumber(obd?.realTimeOilLevel), battery: validNumber(obd?.batteryVolta),
    fuelPct: validNumber(obd?.realTimeOilLevel) && validNumber(vehicle.oilBox) && num(vehicle.oilBox) > 0,
  }
  assertCurrentAccount(account)
  return {
    provider: account.provider, accountId: accountIdentity(account),
    availability,
    plate: String(vehicle.vehPlateNo || ''),
    model: String(vehicle.vehSeriesName || ''),
    machineId,
    oilBox,
    locked: String(obd?.isDefence ?? '0') === '1',
    online: num(obd?.isOnline) === 1,
    engineOn: num(obd?.engineFlag) !== 0,
    acOn: num(obd?.acStatus) !== 0,
    mileage: num(obd?.carLocation),
    oil,
    battery: num(obd?.batteryVolta) / 10,
    outsideTemp: num(obd?.outsideTemperature) / 10,
    fuelPct: Math.max(0, Math.min(100, oilBox > 0 ? (oil / oilBox) * 100 : 0)),
    tirePressures: PROVIDERS[account.provider].tires ? parseTirePressures(obd?.tirePressure) : undefined,
    windows: availability.windows ? bits(obd?.carWindow) ?? [] : [],
    carLamp: String(obd?.carLamp ?? ''),
    carDoor: String(obd?.carDoor ?? ''),
    heatSeat: String(obd?.heatSeat ?? ''),
    waterTemperature: num(obd?.waterTemperature) / 10,
    lat,
    lng,
    address: addr.address,
    addressShort: addr.addressShort,
    updatedAt: Date.now(),
  }
}

export async function sendCommand(command: string, data: unknown, alreadyString = false): Promise<string> {
  const account = requireAccount()
  const car = readCache()
  if (!car?.machineId) throw new Error('还没有车辆设备号，请先刷新一次车况')
  // 指令下发前再确认一次授权没被切换：确认框停留期间可能刚换了账号。
  assertCurrentAccount(account)
  const res = await fetch(`https://${PROVIDERS[account.provider].host}/api/command/sendCommand`, {
    method: 'POST', timeout: 12,
    headers: { 'Content-Type': 'application/json;charset=utf-8', Accept: '*/*', Authorization: account.token },
    body: JSON.stringify({ command, machineId: car.machineId, data: alreadyString ? String(data ?? '') : JSON.stringify(data ?? {}) }),
  })
  const obj = await readPayload(res)
  return String(obj?.message || '指令已发送')
}
