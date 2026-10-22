import { AppIntentManager, AppIntentProtocol, Widget } from 'scripting'
import { beginWidgetConfirmation, cancelWidgetConfirmation, submitWidgetConfirmation, type StartConfirmation } from './widget-confirmation'
import { loadCar, patchCache, readCache, sendCommand, writeCache, type CarData } from './api'

async function optimistic(patch: Partial<CarData>, command: () => Promise<string>): Promise<void> {
  const previous = readCache()
  patchCache(patch)
  Widget.reloadAll()
  try {
    await command()
  } catch (e) {
    if (previous) writeCache(previous)
    Widget.reloadAll()
    throw e
  }
}

export const LockIntent = AppIntentManager.register({
  name: 'AoZhiLianCarLock',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ locked }: { locked: boolean }) => {
    await optimistic({ locked }, () => sendCommand('CMD_LOCK', { flag: locked ? 1 : 0 }))
  },
})

export const WindowIntent = AppIntentManager.register({
  name: 'AoZhiLianCarWindow',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ open }: { open: boolean }) => {
    await optimistic({ windows: open ? [1, 1, 1, 1] : [0, 0, 0, 0] }, () =>
      sendCommand('CMD_WINDOW', { flag: open ? 1 : 0 })
    )
  },
})

export const EngineIntent = AppIntentManager.register({
  name: 'AoZhiLianCarEngine',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ start }: { start: boolean }) => {
    await optimistic({ engineOn: start }, () =>
      start
        ? sendCommand('CMD_ENGINE', { flag: 1, engine_time: 10, temperature: 230 })
        : sendCommand('CMD_ENGINE', { flag: 0, engine_time: 0 })
    )
  },
})

export const CoolIntent = AppIntentManager.register({
  name: 'AoZhiLianCarCool',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    await sendCommand('CMD_ENGINE', { flag: 2, engine_time: 30, temperature: 160 })
    Widget.reloadAll()
  },
})

export const HotIntent = AppIntentManager.register({
  name: 'AoZhiLianCarHot',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    await sendCommand('CMD_ENGINE', { flag: 3, engine_time: 30, temperature: 280 })
    Widget.reloadAll()
  },
})

export const FindIntent = AppIntentManager.register({
  name: 'AoZhiLianCarFind',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    await sendCommand('CMD_SEARCHCAR', { search_status: 0 })
    Widget.reloadAll()
  },
})

export const RefreshIntent = AppIntentManager.register({
  name: 'AoZhiLianCarRefresh',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    const next = await loadCar()
    writeCache(next)
    Widget.reloadAll()
  },
})

export const ACIntent = AppIntentManager.register({
  name: 'AoZhiLianCarAC',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ on }: { on: boolean }) => {
    await optimistic({ acOn: on }, () => on
      ? sendCommand('CMD_ENGINE', { flag: 3, engine_time: 10, temperature: 230 })
      : sendCommand('CMD_AC', { flag: 0 }))
  },
})
export const TrunkIntent = AppIntentManager.register({
  name: 'AoZhiLianCarTrunk',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    await sendCommand('CMD_TRUNK', '', true)
    Widget.reloadAll()
  },
})

export const BeginConfirmationIntent = AppIntentManager.register({
  name: 'AoZhiLianCarBeginConfirmation', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: StartConfirmation) => {
    try { beginWidgetConfirmation(parameters) } finally { Widget.reloadAll() }
  },
})
export const CancelConfirmationIntent = AppIntentManager.register({
  name: 'AoZhiLianCarCancelConfirmation', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: { size: string; id: string }) => {
    try { cancelWidgetConfirmation(parameters) } finally { Widget.reloadAll() }
  },
})
export const SubmitConfirmationIntent = AppIntentManager.register({
  name: 'AoZhiLianCarSubmitConfirmation', protocol: AppIntentProtocol.AppIntent,
  perform: async (parameters: { size: string; id: string }) => {
    try {
      const completion = submitWidgetConfirmation(parameters)
      Widget.reloadAll()
      await completion
    } finally { Widget.reloadAll() }
  },
})
