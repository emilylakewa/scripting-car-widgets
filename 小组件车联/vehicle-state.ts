import type { CarData } from './api'

/**
 * 车辆是否需要关注（未锁车 / 发动机仍运转）。
 * 必须走 availability：字段没上报时值会被初始化为 false，直接读会误判成“已锁车 / 已熄火”。
 * 仪表盘里的 dashboardAttention 用的是同一套判断。
 */
export function needsAttention(data: CarData | null): boolean {
  if (!data) return false
  const a = data.availability
  return (a?.locked === true && !data.locked) || (a?.engineOn === true && data.engineOn)
}

/** 需要关注时返回橙色提醒色，否则用调用方给的常态色。 */
export function statusTint(data: CarData | null, normal: string): string {
  return needsAttention(data) ? '#FB923C' : normal
}

// AoJie captures confirm carDoor[4]. Hood mapping still needs open/closed evidence.
export function panelOpen(data: CarData | null, panel: 'trunk' | 'hood'): boolean | null {
  if (!data || data.availability?.carDoor !== true || panel === 'hood') return null
  const raw: unknown = data.carDoor
  const values = Array.isArray(raw) ? raw : String(raw ?? '').includes(',')
    ? String(raw).split(',').map(v => v.trim()) : String(raw ?? '').split('')
  const index = data.provider === 'aojie' ? 4 : 8
  const value = values[index]
  return value === 0 || value === '0' ? false : value === 1 || value === '1' ? true : null
}
export function trunkOpen(data: CarData | null): boolean { return panelOpen(data, 'trunk') === true }

// 车门仅取四个乘员车门，尾门及其余未经确认的状态位不得混入。
export function doorsOpen(data: CarData | null): boolean | null {
  if (!data || data.availability?.carDoor !== true) return null
  const raw: unknown = data.carDoor
  const values = Array.isArray(raw) ? raw : typeof raw === 'string'
    ? raw.trim().includes(',') ? raw.split(',').map(v => v.trim()) : raw.trim().split('') : []
  const doors = values.slice(0, 4)
  if (doors.length !== 4 || !doors.every(v => v === 0 || v === 1 || v === '0' || v === '1')) return null
  return doors.some(v => v === 1 || v === '1')
}

export function bodyWarnings(data: CarData | null): { icon: string; label: string; tint: string }[] {
  const warnings: { icon: string; label: string; tint: string }[] = []
  if (doorsOpen(data) === true) warnings.push({ icon: 'door', label: '车门未关', tint: '#FB923C' })
  if (panelOpen(data, 'trunk') === true) warnings.push({ icon: 'trunk', label: '尾门未关', tint: '#FB923C' })
  if (panelOpen(data, 'hood') === true) warnings.push({ icon: 'car.side.front.open.fill', label: '机盖未关', tint: '#FB923C' })
  return warnings
}
