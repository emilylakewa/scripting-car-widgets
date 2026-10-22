import { AppIntentManager, AppIntentProtocol, Widget } from 'scripting'
import { beginWidgetConfirmation, cancelWidgetConfirmation, submitWidgetConfirmation, type StartConfirmation } from './widget-confirmation'
import { parseControlRequest, createConfirmationExecutor } from './command-confirmation'

type Binding = { accountId: string; machineId: string; size: string }
async function execute(action: string, target: boolean, parameters: Binding): Promise<void> {
  try {
    const request = parseControlRequest({ confirmAction: action, confirmTarget: target ? '1' : '0',
      confirmVehicle: parameters?.machineId, confirmSize: parameters?.size, confirmAccount: parameters?.accountId })
    if (!request) throw new Error('组件操作已失效，请刷新后重试')
    await createConfirmationExecutor(request)()
  } finally { Widget.reloadAll() }
}

export const LockIntent = AppIntentManager.register({
  name: 'CarLinkCarLock', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding & { locked: boolean }) => {
    if (typeof parameters?.locked !== 'boolean') throw new Error('无效的组件操作')
    await execute('lock', parameters.locked, parameters)
  },
})

export const WindowIntent = AppIntentManager.register({
  name: 'CarLinkCarWindow', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding & { open: boolean }) => {
    if (typeof parameters?.open !== 'boolean') throw new Error('无效的组件操作')
    await execute('window', parameters.open, parameters)
  },
})

export const EngineIntent = AppIntentManager.register({
  name: 'CarLinkCarEngine', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding & { start: boolean }) => {
    if (typeof parameters?.start !== 'boolean') throw new Error('无效的组件操作')
    await execute('engine', parameters.start, parameters)
  },
})

export const ACIntent = AppIntentManager.register({
  name: 'CarLinkCarAC', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding & { on: boolean }) => {
    if (typeof parameters?.on !== 'boolean') throw new Error('无效的组件操作')
    await execute('ac', parameters.on, parameters)
  },
})

export const CoolIntent = AppIntentManager.register({
  name: 'CarLinkCarCool', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding) => {
    await execute('cool', false, parameters)
  },
})

export const HotIntent = AppIntentManager.register({
  name: 'CarLinkCarHot', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding) => {
    await execute('hot', false, parameters)
  },
})

export const FindIntent = AppIntentManager.register({
  name: 'CarLinkCarFind', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding) => {
    await execute('find', false, parameters)
  },
})

export const TrunkIntent = AppIntentManager.register({
  name: 'CarLinkCarTrunk', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding) => {
    await execute('trunk', false, parameters)
  },
})

export const RefreshIntent = AppIntentManager.register({
  name: 'CarLinkCarRefresh', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: Binding) => {
    await execute('refresh', false, parameters)
  },
})

export const BeginConfirmationIntent = AppIntentManager.register({
  name: 'CarLinkCarBeginConfirmation', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: StartConfirmation) => {
    try { beginWidgetConfirmation(parameters) } finally { Widget.reloadAll() }
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
    try {
      const completion = submitWidgetConfirmation(parameters)
      Widget.reloadAll()
      await completion
    } finally { Widget.reloadAll() }
  },
})
