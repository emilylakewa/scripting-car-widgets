import { loadCar, readCache, writeCache, patchCache, sendCommand, type CarData } from './api'
import { readToken, readAccountIdentity } from './credentials'
import type { WidgetSize } from './settings'

export type ControlRequest = { action: string; target: boolean; machineId: string; size: WidgetSize; accountId: string }
const ACTIONS = ['refresh', 'lock', 'window', 'engine', 'find', 'cool', 'hot', 'ac', 'trunk']
export function parseControlRequest(parameters: Record<string, unknown>): ControlRequest | null {
  if (typeof parameters.confirmAction !== 'string' || !ACTIONS.includes(parameters.confirmAction)) return null
  const action = parameters.confirmAction
  if (['lock', 'window', 'engine', 'ac'].includes(action) && parameters.confirmTarget !== '0' && parameters.confirmTarget !== '1') return null
  if (typeof parameters.confirmAccount !== 'string' || !parameters.confirmAccount || parameters.confirmAccount.length > 200) return null
  if (typeof parameters.confirmVehicle !== 'string' || !parameters.confirmVehicle.trim() || parameters.confirmVehicle.length > 200) return null
  if (!['small', 'medium', 'large', 'extraLarge'].includes(String(parameters.confirmSize))) return null
  return { action, target: parameters.confirmTarget === '1', machineId: parameters.confirmVehicle, size: parameters.confirmSize as WidgetSize, accountId: parameters.confirmAccount }
}
export function requestedCommand(request: ControlRequest): { label: string; command: string; data: any; raw?: boolean; patch?: Partial<CarData> } {
  const on = request.target
  switch (request.action) {
    case 'refresh': return { label: '刷新车况', command: '', data: {} }
    case 'lock': return { label: on ? '锁车' : '解锁', command: 'CMD_LOCK', data: { flag: on ? 1 : 0 }, patch: { locked: on } }
    case 'window': return { label: on ? '开窗' : '关窗', command: 'CMD_WINDOW', data: { flag: on ? 1 : 0 }, patch: { windows: on ? [1, 1, 1, 1] : [0, 0, 0, 0] } }
    case 'engine': return { label: on ? '启动发动机（10 分钟）' : '熄火', command: 'CMD_ENGINE', data: on ? { flag: 1, engine_time: 10, temperature: 230 } : { flag: 0, engine_time: 0 }, patch: { engineOn: on } }
    case 'find': return { label: '鸣笛寻车', command: 'CMD_SEARCHCAR', data: { search_status: 0 } }
    case 'cool': return { label: '冷车（30 分钟）', command: 'CMD_ENGINE', data: { flag: 2, engine_time: 30, temperature: 160 } }
    case 'hot': return { label: '热车（30 分钟）', command: 'CMD_ENGINE', data: { flag: 3, engine_time: 30, temperature: 280 } }
    case 'ac': return { label: on ? '开启空调' : '关闭空调', command: on ? 'CMD_ENGINE' : 'CMD_AC', data: on ? { flag: 3, engine_time: 10, temperature: 230 } : { flag: 0 }, patch: { acOn: on } }
    case 'trunk': return { label: '打开尾门', command: 'CMD_TRUNK', data: '', raw: true }
    default: throw new Error('不支持的控车操作')
  }
}
// Creating or displaying a confirmation does not execute any vehicle command.
export function createConfirmationExecutor(request: ControlRequest): () => Promise<string> {
  let submitted = false
  return async () => {
    if (submitted) throw new Error('本次确认已提交，请关闭后重新操作')
    submitted = true
    const token = readToken(), cached = readCache()
    if (!token || request.accountId !== readAccountIdentity() || cached?.machineId !== request.machineId) throw new Error('授权或车辆已变化，请刷新车况后重新操作')
    const command = requestedCommand(request)
    const fresh = await loadCar()
    if (fresh.machineId !== request.machineId || readToken() !== token || request.accountId !== readAccountIdentity()) throw new Error('授权或车辆已变化，本次操作已取消')
    writeCache(fresh)
    if (request.action === 'refresh') return '车况已刷新'
    const result = await sendCommand(command.command, command.data, command.raw, request)
    if (command.patch && request.accountId === readAccountIdentity() && readToken() === token && readCache()?.machineId === request.machineId) patchCache(command.patch)
    return result
  }
}
