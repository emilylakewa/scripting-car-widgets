import { AppIntentManager, AppIntentProtocol, Widget } from 'scripting'
import { beginWidgetConfirmation, cancelWidgetConfirmation, submitWidgetConfirmation, type StartConfirmation } from './widget-confirmation'
import { parseControlRequest, performControlAction } from './command-confirmation'

// slot 只有座椅加热用得上（每个按钮各记一份挡位）；其它动作带着也无害。
type Binding = { accountId: string; machineId: string; size: string; slot?: number }
// 所有组件控车意图共用的入口：解析参数 → 交给统一执行核心（乐观状态、失败回滚都它做）。
async function execute(action: string, target: boolean, parameters: Binding): Promise<void> {
  try {
    const request = parseControlRequest({ confirmAction: action, confirmTarget: target ? '1' : '0',
      confirmVehicle: parameters?.machineId, confirmSize: parameters?.size, confirmAccount: parameters?.accountId, confirmSlot: parameters?.slot })
    if (!request) throw new Error('组件操作已失效，请刷新后重试')
    await performControlAction(request)
  } finally {
    // 无论成功失败都重绘一次，让组件显示最终状态。
    Widget.reloadAll()
  }
}

// 十个控车意图只有名字、动作和布尔参数键不同：用同一个工厂登记，避免十份几乎一样的包装。
// boolKey 为空表示这个动作不需要布尔参数（寻车 / 冷车 / 热车 / 尾门 / 刷新）。
function controlIntent(name: string, action: string, boolKey?: string) {
  return AppIntentManager.register({
    name, protocol: AppIntentProtocol.AppIntent,
    perform: async (parameters: any) => {
      const flag = boolKey ? parameters?.[boolKey] : false
      if (boolKey && typeof flag !== 'boolean') throw new Error('无效的组件操作')
      await execute(action, flag, parameters)
    },
  })
}

export const LockIntent = controlIntent('CarLinkCarLock', 'lock', 'locked')
export const WindowIntent = controlIntent('CarLinkCarWindow', 'window', 'open')
export const EngineIntent = controlIntent('CarLinkCarEngine', 'engine', 'start')
export const ACIntent = controlIntent('CarLinkCarAC', 'ac', 'on')
export const SeatIntent = controlIntent('CarLinkCarSeat', 'seat', 'on')
export const CoolIntent = controlIntent('CarLinkCarCool', 'cool')
export const HotIntent = controlIntent('CarLinkCarHot', 'hot')
export const FindIntent = controlIntent('CarLinkCarFind', 'find')
export const TrunkIntent = controlIntent('CarLinkCarTrunk', 'trunk', 'open')
export const RefreshIntent = controlIntent('CarLinkCarRefresh', 'refresh')

export const BeginConfirmationIntent = AppIntentManager.register({
  name: 'CarLinkCarBeginConfirmation', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: StartConfirmation) => {
    try { beginWidgetConfirmation(parameters) } finally { Widget.reloadAll() }
    // 这里只做同步动作，绝不能再 await 长任务：意图不返回时系统会把重绘压到意图结束后，
    // 确认页就出不来（3.9.5 的教训）。
  },
})
export const CancelConfirmationIntent = AppIntentManager.register({
  name: 'CarLinkCarCancelConfirmation', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: { size: string; id: string }) => {
    try { cancelWidgetConfirmation(parameters) } finally { Widget.reloadAll() }
  },
})
export const SubmitConfirmationIntent = AppIntentManager.register({
  name: 'CarLinkCarSubmitConfirmation', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: { size: string; id: string }) => {
    await submitWidgetConfirmation(parameters)
  },
})
