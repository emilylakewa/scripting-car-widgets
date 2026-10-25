import { anyBitSet, known } from './dashboard-model'
import { loadCar, readCache, writeCache, patchCache, sendCommand, type CarData } from './api'
import { readToken } from './credentials'
import { readSettingsForSize, seatLevelOf, visibleButtons, type WidgetSize } from './settings'

// slot 是触发这条指令的按钮槽位（确认页 / 组件按钮都带）；车辆中心页面没有槽位概念，统一传 -1。
export type ControlRequest = { action: string; target: boolean; machineId: string; size: WidgetSize; accountId: string; slot: number }
const ACTIONS = ['refresh', 'lock', 'window', 'engine', 'find', 'cool', 'hot', 'ac', 'trunk', 'seat']
export function parseControlRequest(parameters: Record<string, unknown>): ControlRequest | null {
  if (typeof parameters.confirmAction !== 'string' || !ACTIONS.includes(parameters.confirmAction)) return null
  const action = parameters.confirmAction
  if (['lock', 'window', 'engine', 'ac', 'seat'].includes(action) && parameters.confirmTarget !== '0' && parameters.confirmTarget !== '1') return null
  if (!['small', 'medium', 'large', 'extraLarge'].includes(String(parameters.confirmSize))) return null
  // 槽位只用于座椅加热挡位。缺失 / 非法按 -1 处理（页面按钮没有槽位）。
  const slot = Number(parameters.confirmSlot)
  return { action, target: parameters.confirmTarget === '1', machineId: String(parameters.confirmVehicle || ''), size: parameters.confirmSize as WidgetSize, accountId: String(parameters.confirmAccount || ''), slot: Number.isInteger(slot) && slot >= 0 ? slot : -1 }
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
    case 'trunk': {
      const aojie = request.accountId.startsWith('aojie:')
      return { label: on ? '打开尾门' : '关闭尾门', command: 'CMD_TRUNK', data: aojie ? { flag: on ? 0 : 1 } : '', raw: !aojie }
    }
    // 座椅加热：CMD_HEATSEAT，type 是加热挡位（'1' / '2' / '3'，每个按钮各存一份），flag 带开关方向。
    // flag 与其它指令一样写成 on ? 1 : 0；关闭时 type 跟着归 0（0 表示不带挡位），不能把挡位一路带下去。
    // 故意不写 patch：heatSeat 是车况里上报的位串，格式不确定，乐观写入可能伪造成错误挡位；
    // 指令成功后由 performControlAction 主动回读车况（syncSeatState），显示车机上报的真实状态。
    case 'seat': {
      // 挡位跟着按钮走：取触发它的那个槽位的挡位；页面按钮没槽位时退到该尺寸里第一个座椅加热按钮的挡位。
      const options = readSettingsForSize(request.size)
      const slot = request.slot >= 0 ? request.slot : Math.max(0, visibleButtons(options).indexOf('seat'))
      const level = seatLevelOf(options, slot)
      return {
        label: on ? '开启座椅加热（' + level + ' 挡）' : '关闭座椅加热',
        command: 'CMD_HEATSEAT',
        // type 按数值下发（3.9.9 已验证可用的格式），挡位在设置里存的是字符串。
        data: { flag: on ? 1 : 0, type: on ? Number(level) : 0 }
      }
    }
    default: throw new Error('不支持的控车操作')
  }
}
// 只做「动作 + 目标状态 → 车机指令」的换算，页面里的按钮用它拿文案和载荷。
export function commandFor(action: string, target: boolean, accountId = ''): VehicleCommand {
  return requestedCommand({ action, target, machineId: '', size: 'medium', accountId, slot: -1 })
}

// 组件意图与车辆中心页面共用的执行核心：
// 校验 Token →（刷新车况只读数据）→ 乐观写入状态并重绘 → 下发指令 → 失败回滚缓存。
// 全局一条在途闸门：直连按钮没有确认单的一次性保护，连点两下会真的下发两条相反指令。
let inFlight = false
export async function performControlAction(request: ControlRequest): Promise<string> {
  if (inFlight) throw new Error('上一条指令还在执行，请稍候')
  inFlight = true
  try { return await runControlAction(request) } finally { inFlight = false }
}
async function runControlAction(request: ControlRequest): Promise<string> {
  if (!readToken()) throw new Error('请先填写 Token')
  if (request.action === 'refresh') {
    const fresh = await loadCar()
    writeCache(fresh)
    return '车况已刷新'
  }
  const command = requestedCommand(request)
  const previous = readCache()
  // 快照与当前车辆/授权不一致时不要盲目下发：那会把指令发到另一台车、或者按另一套权限执行。
  if (previous && ((request.machineId && request.machineId !== previous.machineId) ||
    (request.accountId && request.accountId !== previous.accountId))) {
    throw new Error('车辆或授权已变化，请重新刷新车况')
  }
  // 接口没上报过的字段不要乐观写入：那会把“未知”伪造成确定状态（如凭空写成 4 扇窗全开）。
  const patch = optimisticPatch(command.patch, previous)
  // 只写缓存、不在这里重绘：组件点击路径（widget-confirmation / app_intents）下发前后
  // 本来就各重绘一次，页面路径由调用方拿到新数据后统一重绘。
  // 去掉这次多余的 Widget.reloadAll() 就少了一整轮组件进程启动（省电 + 指令更快发出）。
  if (patch) patchCache(patch)
  try {
    const text = await sendCommand(command.command, command.data, command.raw)
    // 座椅加热没有乐观写入（heatSeat 是位串，猜错就会画出假挡位），所以下发成功后自己回读车况：
    // 车机上报有延迟，先等一会儿再拉，最多三次；拿到真实开关就收工，回读失败只当指令成功。
    // 这样页面和组件不用等下一次时间线刷新才显示真实状态。
    if (request.action === 'seat') await syncSeatState(request.target)
    return text
  } catch (e) {
    // 下发失败：只把刚才乐观改动的几个字段回滚，不覆盖期间刷新的其它数据。
    if (patch && previous) {
      const revert: any = {}
      for (const field of Object.keys(patch)) revert[field] = (previous as any)[field]
      patchCache(revert)
    }
    throw e
  }
}
// 座椅加热专用的车况回读：heatSeat 是车机上报的位串，只有真正拉一次才知道开没开。
// 三次机会（0.4 秒 / 再 1.3 秒 / 再 1.6 秒）覆盖常见的车机延迟，命中就立刻收工。
// 用 light 模式（只拉两个车况接口）：位置在这几秒里不会变，没必要为此再多跑两次网络。
async function syncSeatState(on: boolean): Promise<void> {
  const delays = [400, 1300, 1600]
  for (let attempt = 0; attempt < delays.length; attempt++) {
    await new Promise<void>(resolve => setTimeout(resolve, delays[attempt]))
    try {
      const fresh = await loadCar({ light: true })
      writeCache(fresh)
      // 车机没上报 heatSeat 时永远等不到结果，再轮询也是白跑两次网络，直接收工。
      if (!known(fresh, 'heatSeat')) return
      if (anyBitSet(fresh.heatSeat) === on) return
    } catch { return }
  }
}
function optimisticPatch(patch: Partial<CarData> | undefined, previous: CarData | null): Partial<CarData> | null {
  if (!patch) return null
  if (!previous) return patch
  const out: any = {}
  for (const field of Object.keys(patch)) {
    if ((previous.availability as any)?.[field] !== false) out[field] = (patch as any)[field]
  }
  return Object.keys(out).length ? out : null
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
