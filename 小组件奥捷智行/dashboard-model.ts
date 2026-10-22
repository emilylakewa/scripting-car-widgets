import type { CarData } from './api'

export type StateItem = { label: string; value: string; alert: boolean }
export function known(d: CarData, key: string): boolean {
  return d.availability?.[key] === true
}
function bits(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.length && value.every(v => Number.isInteger(v) && v >= 0) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parts = value.trim().split(',')
  if (parts.some(v => !/^\d+$/.test(v.trim()))) return null
  // Some devices return a contiguous bit string instead of comma-separated values.
  return parts.length === 1 && /^[01]{2,}$/.test(parts[0]) ? parts[0].split('').map(Number) : parts.map(Number)
}
function closedState(label: string, value: unknown, available: boolean): StateItem {
  const values = available ? bits(value) : null
  if (!values) return { label, value: '未知', alert: false }
  const active = values.some(v => v > 0)
  return { label, value: active ? '未关闭' : '全部关闭', alert: active }
}
function defaultStateItems(d: CarData): StateItem[] {
  const lamps = closedState('车灯', d.carLamp, known(d, 'carLamp'))
  if (lamps.value === '全部关闭') lamps.value = '已关闭'
  const heat = known(d, 'heatSeat') ? bits(d.heatSeat) : null
  return [
    closedState('车窗', d.windows, known(d, 'windows')),
    closedState('车门', d.carDoor, known(d, 'carDoor')),
    lamps,
    { label: '空调', value: known(d, 'acOn') ? d.acOn ? '运行中' : '已关闭' : '未知', alert: false },
    { label: '水温', value: known(d, 'waterTemperature') ? d.waterTemperature.toFixed(0) + '°C' : '未知', alert: known(d, 'waterTemperature') && d.waterTemperature > 110 && d.engineOn },
    { label: '座椅加热', value: heat ? heat.some(v => v > 0) ? '已开启' : '已关闭' : '未知', alert: false },
  ]
}
export function parkingText(d: CarData): string { return known(d, 'locked') ? d.locked ? '已锁车' : '未锁车' : '车锁未知' }
export function engineText(d: CarData): string { return known(d, 'engineOn') ? d.engineOn ? '发动机运行中' : '发动机已熄火' : '发动机状态未知' }
export function dashboardAttention(d: CarData): boolean {
  return (known(d, 'locked') && !d.locked) || (known(d, 'engineOn') && d.engineOn)
}
function defaultMetricItems(d: CarData) {
  return [
    { label: '累计里程', value: known(d, 'mileage') ? d.mileage.toFixed(0) : '--', unit: 'km', alert: false },
    { label: '剩余油量', value: known(d, 'oil') ? d.oil.toFixed(0) : '--', unit: 'L', alert: known(d, 'fuelPct') && d.fuelPct < 10 },
    { label: '燃油余量', value: known(d, 'fuelPct') ? d.fuelPct.toFixed(0) : '--', unit: '%', alert: known(d, 'fuelPct') && d.fuelPct < 10 },
    { label: '蓄电池', value: known(d, 'battery') ? d.battery.toFixed(1) : '--', unit: 'V', alert: known(d, 'battery') && d.battery > 0 && d.battery < 11.8 },
  ]
}
export function tireItems(d: CarData) {
  return ['左前胎压', '右前胎压', '左后胎压', '右后胎压'].map((label, index) => {
    const value = d.tirePressures?.[index]
    return { label, value: typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toFixed(1) + ' bar' : '未知' }
  })
}
type InfoItem = { label: string; value: string; unit: string; alert: boolean }
function selectedInfoItems(d: CarData, slots: string[]): InfoItem[] {
  const metrics = defaultMetricItems(d), states = defaultStateItems(d)
  const items: Record<string, InfoItem> = {}
  ;['mileage', 'oil', 'fuelPct', 'battery'].forEach((key, i) => { items[key] = metrics[i] })
  ;['windows', 'carDoor', 'carLamp', 'acOn', 'waterTemperature', 'heatSeat'].forEach((key, i) => {
    items[key] = { ...states[i], unit: '' }
  })
  items.outsideTemp = { label: '车外温度', value: known(d, 'outsideTemp') ? d.outsideTemp.toFixed(0) : '--', unit: '°C', alert: false }
  items.locked = { label: '车锁状态', value: known(d, 'locked') ? d.locked ? '已锁车' : '未锁车' : '未知', unit: '', alert: known(d, 'locked') && !d.locked }
  items.engineOn = { label: '发动机状态', value: known(d, 'engineOn') ? d.engineOn ? '运行中' : '已熄火' : '未知', unit: '', alert: known(d, 'engineOn') && d.engineOn }
  items.online = { label: '在线状态', value: known(d, 'online') ? d.online ? '在线' : '离线' : '未知', unit: '', alert: false }
  ;['tireLF', 'tireRF', 'tireLR', 'tireRR'].forEach((key, index) => {
    const value = d.tirePressures?.[index], available = typeof value === 'number' && Number.isFinite(value) && value >= 0
    items[key] = { label: ['左前胎压', '右前胎压', '左后胎压', '右后胎压'][index], value: available ? value!.toFixed(1) : '未知', unit: available ? 'bar' : '', alert: false }
  })
  return slots.filter(id => id !== 'blank' && items[id]).map(id => ({ ...items[id] }))
}
export function metricItems(d: CarData, slots?: string[]): InfoItem[] {
  return slots ? selectedInfoItems(d, slots) : defaultMetricItems(d)
}
export function stateItems(d: CarData, slots?: string[]): StateItem[] {
  return slots ? selectedInfoItems(d, slots).map(item => ({ ...item, value: item.value + (item.unit ? ' ' + item.unit : '') })) : defaultStateItems(d)
}
export function dashboardLayout(width: number, height: number, hasReminders: boolean, sections: { metricCount?: number; stateCount?: number; tires?: boolean; location?: boolean } = {}) {
  const wide = width / height >= 1.45 && width >= 500
  const compact = height < 430
  const pad = compact ? 12 : 18
  const gap = compact ? 5 : 10
  const header = compact ? 32 : 42
  const metric = sections.metricCount === 0 ? 0 : compact ? 42 : 60
  const stateRows = Math.ceil((sections.stateCount ?? 6) / 3)
  const stateBase = compact ? 62 : 96
  const states = stateRows ? 16 + ((stateBase - 20) / 2) * stateRows + 4 * (stateRows - 1) : 0
  const tires = sections.tires === false ? 0 : compact ? 26 : 34
  const location = sections.location === false ? 0 : compact ? 26 : 60
  const reminder = hasReminders ? compact ? 24 : 48 : 0
  const buttons = compact ? 32 : 44
  const footer = 10
  const gaps = [header, 1, metric, states, tires, location, reminder, buttons, footer].filter(value => value > 0).length - 1
  const hero = height - 2 * pad - header - metric - states - tires - location - reminder - buttons - footer - gap * gaps
  return { wide, compact, pad, gap, gaps, header, metric, states, tires, location, reminder, buttons, footer, hero: Math.max(20, hero) }
}
export function isDashboardFamily(family: string, width: number, height: number): boolean {
  return family.toLowerCase().includes('large') || height >= width * 1.15 || (width >= 500 && height >= 250)
}
