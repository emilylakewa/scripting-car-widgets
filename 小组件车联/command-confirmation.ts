import { Widget } from 'scripting'
import { loadCar, readCache, writeCache, patchCache, sendCommand, type CarData } from './api'
import { readToken, readAccount } from './credentials'
import type { WidgetSize } from './settings'

export type ControlRequest = { action: string; target: boolean; machineId: string; size: WidgetSize; accountId: string }
const ACTIONS = ['refresh', 'lock', 'window', 'engine', 'find', 'cool', 'hot', 'ac', 'trunk']
export function parseControlRequest(parameters: Record<string, unknown>): ControlRequest | null {
  if (typeof parameters.confirmAction !== 'string' || !ACTIONS.includes(parameters.confirmAction)) return null
  const action = parameters.confirmAction
  if (['lock', 'window', 'engine', 'ac', 'trunk'].includes(action) && parameters.confirmTarget !== '0' && parameters.confirmTarget !== '1') return null
  if (!['small', 'medium', 'large', 'extraLarge'].includes(String(parameters.confirmSize))) return null
  return { action, target: parameters.confirmTarget === '1', machineId: String(parameters.confirmVehicle || ''), size: parameters.confirmSize as WidgetSize, accountId: String(parameters.confirmAccount || '') }
}
// 一条可下发的车机指令：label 用于确认弹窗/提示文案，patch 是下发后可以先乐观写进缓存的状态。
export type VehicleCommand = { label: string; command: string; data: any; raw?: boolean; patch?: Partial<CarData> }
export function requestedCommand(request: ControlRequest): VehicleCommand {
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
    case 'trunk': return readAccount()?.provider === 'aojie'
      ? { label: on ? '打开尾门' : '关闭尾门', command: 'CMD_TRUNK', data: { flag: on ? 0 : 1 } }
      : { label: '打开尾门', command: 'CMD_TRUNK', data: '', raw: true }
    default: throw new Error('不支持的控车操作')
  }
}
// 只做「动作 + 目标状态 → 车机指令」的换算，页面里的按钮用它拿文案和载荷。
export function commandFor(action: string, target: boolean): VehicleCommand {
  return requestedCommand({ action, target, machineId: '', size: 'medium', accountId: '' })
}

// 组件意图与车辆中心页面共用的执行核心：
// 校验 Token →（刷新车况只读数据）→ 乐观写入状态并重绘 → 下发指令 → 失败回滚缓存。
export async function performControlAction(request: ControlRequest): Promise<string> {
  if (!readToken()) throw new Error('请先填写 Token')
  if (request.action === 'refresh') {
    const fresh = await loadCar()
    writeCache(fresh)
    return '车况已刷新'
  }
  const command = requestedCommand(request)
  const previous = command.patch ? readCache() : null
  if (command.patch) {
    patchCache(command.patch)
    // 先重绘一次，让按钮的开关状态立刻回馈；组件重绘失败不影响指令下发。
    try { Widget.reloadAll() } catch { /* 忽略重绘错误 */ }
  }
  try {
    return await sendCommand(command.command, command.data, command.raw)
  } catch (e) {
    // 下发失败：把乐观状态回滚，避免按钮停在错误状态。
    if (previous) writeCache(previous)
    throw e
  }
}

// 生成确认页的提交闭包：创建或展示确认页本身不会下发任何指令。
export function createConfirmationExecutor(request: ControlRequest): () => Promise<string> {
  let submitted = false // 一次性闸门，防止连点重复下发
  return async () => {
    if (submitted) throw new Error('本次确认已提交，请关闭后重新操作')
    submitted = true
    return performControlAction(request)
  }
}
