import { Script, Widget } from 'scripting'
import { readCache } from './api'
import { readToken } from './credentials'
import { readSettingsForSize, visibleButtons, type WidgetSize } from './settings'
import { parseControlRequest, createConfirmationExecutor, type ControlRequest } from './command-confirmation'

declare const Storage: { get<T>(key: string): T | null; set<T>(key: string, value: T): boolean }
type Phase = 'pending' | 'error'
export type WidgetConfirmation = ControlRequest & { id: string; issuedAt: number; readyAt: number; expiresAt: number; hideAt?: number; phase: Phase; message?: string }
export type StartConfirmation = { confirmAccount: string; confirmAction: string; confirmTarget: string; confirmVehicle: string; confirmSize: string; confirmSlot: number; id: string; issuedAt: number }
const PREFIX = 'CarLink.WidgetConfirmation.' + Script.name + '.'
// 确认界面只做两件事：① 10 秒后作废（hideAt 是硬截止，readWidgetConfirmation 见到
// hideAt<=now 就清票，超时再点「确认」不会发指令）；② 点「确认」/「取消」后立刻回到车况首页。
// 3.9.4 到 3.9.7 试过的自动回落（present 排期 + 意图/组件进程看门狗）在 iOS 上都不兑现：
// 组件渲染完进程即被挂起，WidgetKit 也不会为 10 秒级排期重绘，那部分代码已全部删除。
export const CONFIRM_SECONDS = 10
// 从点击到组件真正画出确认界面的最长容忍。系统重载可能晚几秒，超过就当成作废。
const PENDING_LIFE = 60000
const validSize = (size: unknown): size is WidgetSize => ['small', 'medium', 'large', 'extraLarge'].includes(String(size))
const key = (size: WidgetSize) => PREFIX + size
function store(size: WidgetSize, value: WidgetConfirmation | null) {
  if (Storage.set(key(size), value) === false) throw new Error('确认状态保存失败，请重新操作')
}
function clear(size: WidgetSize) { store(size, null) }
function allowed(request: ControlRequest) {
  const options = readSettingsForSize(request.size)
  const slot = request.slot
  return slot >= 0 && slot < visibleButtons(options).length &&
    options.buttonConfirmations[slot] === true && options.buttons[slot] === request.action
}
export function readWidgetConfirmation(size: WidgetSize, now = Date.now()): WidgetConfirmation | null {
  const state = Storage.get<WidgetConfirmation>(key(size))
  if (!state) return null
  if (state.size !== size || !['pending', 'error'].includes(state.phase) ||
    !Number.isFinite(state.expiresAt) || state.expiresAt <= now ||
    (typeof state.hideAt === 'number' && state.hideAt <= now) ||
    !readCache()?.machineId || !readToken() ||
    !allowed(state)) { clear(size); return null }
  return state
}
// 组件真正把确认界面画出来时才开始计时：重载本身可能晚几秒，从点击时刻算会白吞掉这段时间。
// hideAt 只写一次，所以"10 秒没有操作"是个固定截止，不会被反复刷新延长。
export function armConfirmationWindow(state: WidgetConfirmation | null, now = Date.now()): WidgetConfirmation | null {
  if (!state || state.phase !== 'pending' || typeof state.hideAt === 'number') return state
  const next = { ...state, hideAt: now + CONFIRM_SECONDS * 1000 }
  try { store(state.size, next) } catch { return state }
  return next
}
export function beginWidgetConfirmation(parameters: StartConfirmation, now = Date.now()): void {
  const request = parseControlRequest(parameters)
  if (!request || typeof parameters.id !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(parameters.id) ||
    !Number.isFinite(parameters.issuedAt) || parameters.issuedAt <= 0 || parameters.issuedAt > now ||
    !allowed(request) || !readCache()?.machineId || !readToken()) return
  // A dashboard may remain visible for hours. Allow its first tap, but never re-arm
  // an already consumed dashboard snapshot, even after cancellation or expiration.
  const sourceKey = key(request.size) + '.lastSource'
  const lastSource = Storage.get<number>(sourceKey) || 0
  if (parameters.issuedAt <= lastSource || readWidgetConfirmation(request.size, now)) return
  if (Storage.set(sourceKey, parameters.issuedAt) === false) throw new Error('确认状态保存失败')
  store(request.size, { ...request, id: parameters.id, issuedAt: parameters.issuedAt,
    readyAt: now, expiresAt: now + PENDING_LIFE, phase: 'pending' })
}
// 进入失败态时把显示窗口字段去掉（写 undefined 可能被存储层当成非法值）。
function withoutWindow(state: WidgetConfirmation): WidgetConfirmation {
  const next = { ...state }
  delete next.hideAt
  return next
}
export function cancelWidgetConfirmation({ size, id }: { size: string; id: string }): void {
  if (!validSize(size)) return
  const state = readWidgetConfirmation(size)
  if (state?.id === id) clear(size)
}
export function recentlyFinishedConfirmation(size: WidgetSize, now = Date.now()): boolean {
  const finished = Storage.get<number>(key(size) + '.finished')
  return typeof finished === 'number' && now >= finished && now - finished < 15000
}
export async function submitWidgetConfirmation({ size, id }: { size: string; id: string }): Promise<void> {
  if (!validSize(size)) return
  const state = readWidgetConfirmation(size)
  // 票已作废（多半是 10 秒窗口过了）还点了「确认」：不执行指令，只重绘回车况首页。
  if (!state || state.id !== id || state.phase !== 'pending') { Widget.reloadAll(); return }
  // 先收票再执行：这样组件下一次重绘直接就是车况首页，不再有「正在提交」这一帧。
  try { clear(size) } catch { /* 收票失败也照样执行并重绘，别把这次点击丢了 */ }
  Widget.reloadAll()
  try {
    await createConfirmationExecutor(state)()
    // 成功：记一笔，让紧接着的重绘直接用缓存（recentlyFinishedConfirmation），不再跑网络。
    Storage.set(key(size) + '.finished', Date.now())
  } catch (e) {
    // 失败要让人看见：写失败票，finally 里的重绘会画出「操作未完成」页。
    try {
      store(size, { ...withoutWindow(state), phase: 'error', expiresAt: Date.now() + 60000,
        message: e instanceof Error ? e.message : String(e) })
    } catch { /* 连失败票都存不下就只能回到车况首页 */ }
  } finally { Widget.reloadAll() }
}
