import { fetch } from 'scripting'
import { readToken, readAMapKey } from './credentials'

export const HOST = 'kds.askdwl.com'

const CACHE_KEY = 'aozhilian.car.data'

export type CarData = {
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

export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

export function list(v: unknown): number[] {
  return String(v ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10) || 0)
}

export function readCache(): CarData | null {
  try {
    return Storage.get<CarData>(CACHE_KEY)
  } catch {
    return null
  }
}

export function writeCache(data: CarData): void {
  try {
    Storage.set(CACHE_KEY, data)
  } catch {
    // 缓存失败不影响本次刷新
  }
}

export function patchCache(patch: Partial<CarData>): void {
  const d = readCache()
  if (d) writeCache({ ...d, ...patch })
}

function authorization(): string {
  const token = readToken()
  if (!token) throw new Error('请先在个性化设置中填写并保存 Token')
  return token
}

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`https://${HOST}${path}`, {
    timeout: 12,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      Accept: '*/*',
      Authorization: authorization(),
    },
  })
  if (res.status === 401 || res.status === 403) throw new Error('Token 无效或已过期，请在个性化设置中更新')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const obj: any = await res.json()
  if (String(obj?.status) !== '200') throw new Error(obj?.message || `状态 ${obj?.status}`)
  return obj?.data
}

async function addressOf(lat: number, lng: number): Promise<{ address: string; addressShort: string }> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  if (!lat || !lng) return { address: '', addressShort: '' }
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

export async function loadCar(): Promise<CarData> {
  const [nowCar, obd] = await Promise.all([
    apiGet('/api/car/getNowCar'),
    apiGet('/api/car/getCarOBD'),
  ])
  const vehicle = nowCar?.carInfo ?? nowCar ?? {}
  const machineId = String(obd?.machineId || vehicle.machineId || '').trim()
  if (!machineId) throw new Error('接口未返回车辆设备号，请确认 Token 对应的车辆')
  const loc = await apiGet(`/api/trail/getLocation?machineId=${encodeURIComponent(machineId)}`).catch(() => null)
  const oilBox = num(vehicle.oilBox) || 75
  const oil = num(obd?.realTimeOilLevel)
  const lat = num(loc?.location?.lat)
  const lng = num(loc?.location?.lng)
  const addr = await addressOf(lat, lng)
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
  return {
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
    windows: availability.windows ? list(obd?.carWindow) : [],
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
  authorization()
  let car = readCache()
  if (!car?.machineId) {
    car = await loadCar()
    writeCache(car)
  }
  const res = await fetch(`https://${HOST}/api/command/sendCommand`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      Accept: '*/*',
      Authorization: authorization(),
    },
    body: JSON.stringify({
      command,
      machineId: car.machineId,
      data: alreadyString ? String(data ?? '') : JSON.stringify(data ?? {}),
    }),
  })
  if (res.status === 401 || res.status === 403) throw new Error('Token 无效或已过期，请在个性化设置中更新')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const obj: any = await res.json()
  if (String(obj?.status) !== '200') throw new Error(obj?.message || `状态 ${obj?.status}`)
  return String(obj?.message || '指令已发送')
}
