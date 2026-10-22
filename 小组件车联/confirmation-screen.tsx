import { Button, Navigation, NavigationStack, List, Section, Text, Widget, useState } from 'scripting'
import { readCache } from './api'
import { readAccountIdentity } from './credentials'
import { readSettings, settingsForSize, plateText } from './settings'
import { parseControlRequest, requestedCommand, createConfirmationExecutor } from './command-confirmation'

export function CommandConfirmation({ parameters }: { parameters: Record<string, unknown> }) {
  const dismiss = Navigation.useDismiss()
  const request = parseControlRequest(parameters)
  const cached = readCache()
  const valid = !!request && request.accountId === readAccountIdentity() && cached?.machineId === request.machineId
  const options = request ? settingsForSize(readSettings(), request.size) : readSettings()
  const [execute] = useState(() => request ? createConfirmationExecutor(request) : null)
  const [message, setMessage] = useState('请核对车辆和操作，只有点击“确认执行”才会发送指令。')
  const [finished, setFinished] = useState(false)
  const [busy, setBusy] = useState(false)
  async function confirm() {
    if (!valid || !execute || busy || finished) return
    setBusy(true)
    try { setMessage(await execute()); Widget.reloadAll() }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)) }
    setFinished(true); setBusy(false)
  }
  return <NavigationStack><List navigationTitle="确认控车操作" navigationBarTitleDisplayMode="inline" toolbar={{ cancellationAction: <Button title={finished ? '完成' : '取消'} action={dismiss} /> }}>
    {valid && request && cached ? <>
      <Section header={<Text>操作车辆</Text>}>
        <Text font={20} fontWeight="semibold">{options.name.trim() || cached.model || '我的座驾'}</Text>
        {plateText(cached, options) ? <Text>{plateText(cached, options)}</Text> : null}
      </Section>
      <Section header={<Text>即将执行</Text>}><Text font={21} fontWeight="semibold" foregroundStyle="#F97316">{requestedCommand(request).label}</Text></Section>
      <Section><Text>{message}</Text>
        {!finished ? <Button title={busy ? '正在提交…' : '确认执行'} action={confirm} /> : null}
        <Button title={finished ? '完成' : '取消，不执行'} action={dismiss} />
      </Section>
    </> : <Section><Text>无法确认操作车辆。请关闭此页，在车辆中心刷新车况后重新点击组件按钮。</Text><Button title="关闭，不执行" action={dismiss} /></Section>}
  </List></NavigationStack>
}
