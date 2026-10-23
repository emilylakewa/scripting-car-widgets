import {
  Navigation,
  NavigationStack,
  ScrollView,
  VStack,
  HStack,
  ZStack,
  Circle,
  Rectangle,
  RoundedRectangle,
  Text,
  Image,
  SVG,
  Button,
  Link,
  Spacer,
  Widget,
  useState,
  useEffect,
  Script,
} from 'scripting'
import { readCache, writeCache, loadCar, type CarData } from './api'

import { currentProviderLabel } from './credentials'
import { statusTint, trunkOpen, bodyWarnings } from './vehicle-state'
import { known, anyBitSet } from './dashboard-model'
import { CommandConfirmation } from './confirmation-screen'
import { SettingsScreen } from './settings-screen'
import { readSettings, settingsForSize, centerCarScaleOf, imagePath, plateText, reminderLines, gradientOf, useAudiLogoOf, fontColorOf, centerAddressOf } from './settings'
import { audiLogoSVG, audiLogoSize } from './button-icons'
import { commandFor, performControlAction } from './command-confirmation'

// 车标在卡片里的位置微调：x 往左让出右侧边距，y 上下微调
const LOGO_OFFSET_X = -8
const LOGO_OFFSET_Y = 0

function fmtTime(t: number): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 顶部状态行：字段没上报时明说“未知”，不要把默认值当成真实车况。
function statusText(d: CarData): string {
  const parts = [known(d, 'locked') ? d.locked ? '已锁车' : '未锁车' : '车锁未知']
  parts.push(known(d, 'engineOn') ? d.engineOn ? '发动机运行' : '发动机熄火' : '启动状态未知')
  if (known(d, 'windows') && anyBitSet(d.windows)) parts.push('车窗未关')
  return parts.join(' · ')
}

function mapURL(d: CarData): string {
  const query = d.address || `${d.lat},${d.lng}`
  // 必须用 https，http 会被系统当成不安全链接。
  return `https://maps.apple.com/?ll=${d.lat},${d.lng}&q=${encodeURIComponent(query)}`
}

/** 只有拿到有效坐标才能跳地图：0 与 NaN 都视为没有位置。 */
function hasLocation(d: CarData | null): boolean {
  return !!d && Number.isFinite(d.lat) && Number.isFinite(d.lng) && !(d.lat === 0 && d.lng === 0)
}

function warningText(d: CarData): string[] {
  const warnings: string[] = []
  // 位图字段统一解析，且只在车机真的上报过该字段时才提醒。
  if (known(d, 'online') && !d.online) warnings.push('车辆当前离线')
  if (known(d, 'fuelPct') && d.fuelPct > 0 && d.fuelPct < 20) warnings.push(`油量偏低，仅剩 ${d.fuelPct.toFixed(0)}%`)
  if (known(d, 'battery') && d.battery > 0 && d.battery < 11.8) warnings.push(`电瓶电压偏低（${d.battery.toFixed(1)}V）`)
  if (known(d, 'windows') && anyBitSet(d.windows)) warnings.push('检测到车窗未关')
  if (known(d, 'carLamp') && anyBitSet(d.carLamp)) warnings.push('车灯开启')
  warnings.push(...bodyWarnings(d).map(item => item.label))
  if (known(d, 'waterTemperature') && d.engineOn && d.waterTemperature > 110) warnings.push('水温偏高，请检查仪表')
  return warnings
}

function Panel({ children }: { children: any }) {
  return (
    <ZStack frame={{ maxWidth: 'infinity' }}>
      <RoundedRectangle cornerRadius={20} fill="white" />
      {children}
    </ZStack>
  )
}

function Metric({ icon, label, value, unit }: { icon: string; label: string; value: string; unit: string }) {
  return (
    <VStack alignment="leading" spacing={7} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <HStack spacing={5}>
        <Image systemName={icon} resizable scaleToFit foregroundStyle="#7E8DA6" frame={{ width: 12, height: 12 }} />
        <Text font={10.5} foregroundStyle="#7B879B">{label}</Text>
      </HStack>
      <HStack alignment="firstTextBaseline" spacing={4}>
        <Text font={21} fontWeight="semibold" foregroundStyle="#17243B" lineLimit={1}>{value}</Text>
        <Text font={11} foregroundStyle="#8792A5">{unit}</Text>
      </HStack>
    </VStack>
  )
}

function ActionTile({
  icon,
  label,
  tint,
  action,
}: {
  icon: string
  label: string
  tint: string
  action: () => void
}) {
  return (
    <Button action={action} buttonStyle="plain" frame={{ maxWidth: 'infinity' }}>
      <ZStack frame={{ maxWidth: 'infinity', minHeight: 86, maxHeight: 86 }}>
        <RoundedRectangle cornerRadius={18} fill="white" />
        <VStack spacing={8}>
          <ZStack frame={{ width: 34, height: 34 }}>
            <Circle fill={{ color: tint, opacity: 0.09 }} />
            <Image systemName={icon} resizable scaleToFit foregroundStyle={tint} frame={{ width: 17, height: 17 }} />
          </ZStack>
          <Text font={12} fontWeight="medium" foregroundStyle="#243149" lineLimit={1}>{label}</Text>
        </VStack>
      </ZStack>
    </Button>
  )
}

/** 主页指标：字段未上报时显示 --，不要拿默认的 0 当真实数据展示。 */
function metricValue(d: CarData | null, key: 'mileage' | 'oil' | 'battery' | 'outsideTemp', digits: number): string {
  if (!d || !known(d, key)) return '--'
  const value = d[key]
  return Number.isFinite(value) ? value.toFixed(digits) : '--'
}

/** 车辆位置卡片：有坐标时整张卡片可点跳地图，否则只做展示（避免两段几乎相同的卡片）。 */
function LocationCard({ data }: { data: CarData | null }) {
  const openable = hasLocation(data)
  const body = (
    <Panel>
      <HStack alignment="top" spacing={12} padding={16} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
        <ZStack frame={{ width: 32, height: 32 }}>
          <RoundedRectangle cornerRadius={10} fill="#EDF3FD" />
          <Image systemName="location" resizable scaleToFit foregroundStyle="#4B78C9" frame={{ width: 15, height: 15 }} />
        </ZStack>
        <VStack alignment="leading" spacing={5} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
          <HStack>
            <Text font={10.5} foregroundStyle="#8792A6">车辆位置</Text>
            <Spacer />
            {openable ? <Text font={10} foregroundStyle="#4B78C9">打开地图</Text> : null}
          </HStack>
          <Text font={12} foregroundStyle="#344159" lineLimit={3}>
            {data?.address || data?.addressShort || (data ? '暂未获取到车辆位置' : '刷新后显示地址')}
          </Text>
        </VStack>
      </HStack>
    </Panel>
  )
  return openable ? <Link url={mapURL(data!)}>{body}</Link> : body
}

function App() {
  const dismiss = Navigation.useDismiss()
  const [data, setData] = useState<CarData | null>(() => readCache())
  const [msg, setMsg] = useState('正在读取车况…')
  // 提示语气显式记录：不再靠 msg 里是否包含“失败”两个字来猜颜色。
  const [tone, setTone] = useState<'ok' | 'error'>('ok')
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState(readSettings)
  // 车辆中心中卡片的车图跟中号组件同步；车辆大小则用「车辆中心」里的独立设置。
  const carSettings = settingsForSize(settings, 'medium')
  const carImagePath = imagePath(carSettings)
  const centerScale = centerCarScaleOf(settings)
  // 车标宽度沿用车辆图片的宽度，高度按四环真实比例推算。
  const logoSize = audiLogoSize(Math.min(190 * centerScale, 260))
  const reminders = reminderLines(settings, data)
  async function customize() {
    await Navigation.present({ element: <SettingsScreen />, modalPresentationStyle: 'pageSheet' })
    setSettings(readSettings())
    setData(readCache())
  }

  async function refresh(): Promise<void> {
    if (busy) return
    setBusy(true)
    setMsg('正在刷新…')
    setTone('ok')
    try {
      const next = await loadCar()
      writeCache(next)
      setData(next)
      setMsg(`已更新 ${fmtTime(next.updatedAt)}`)
      try {
        Widget.reloadAll()
      } catch {
        // 组件刷新失败不影响页面
      }
    } catch (e: any) {
      setTone('error')
      setMsg(`刷新失败：${e?.message || e}`)
    }
    setBusy(false)
  }

  // 只比对与按钮/状态卡片相关的字段：updatedAt 每次都会变，不能直接比整个对象。
  function stateSig(d: CarData | null): string {
    return d ? JSON.stringify([d.locked, d.engineOn, d.acOn, d.windows, d.carDoor]) : ''
  }
  // 指令下发成功后立刻拉一次车况，让按钮状态和卡片数据同步。
  // 车机回传有延迟：waitForState 为真且状态还没变时，每隔 1.5 秒重试，最多 3 次。
  async function syncAfterCommand(before: CarData | null, waitForState: boolean): Promise<void> {
    const baseline = stateSig(before)
    const attempts = waitForState ? 3 : 1
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const next = await loadCar()
        writeCache(next)
        setData(next)
        try {
          Widget.reloadAll()
        } catch {
          // 组件刷新失败不影响页面
        }
        if (stateSig(next) !== baseline) return
      } catch {
        // 同步失败不覆盖刚显示的执行结果
        return
      }
      if (attempt < attempts - 1) await new Promise<void>(resolve => setTimeout(resolve, 1500))
    }
  }

  // 页面里的所有控车按钮都走这里：二次确认 → 下发指令 → 同步车况。
  // action 是控件动作（与组件意图一致），target 是执行后的目标状态。
  // waitForState：执行后车辆状态预期会变（锁/窗/启动/空调/尾门等）；寻车不会改状态，不用等。
  async function run(action: string, target: boolean, waitForState = true): Promise<void> {
    if (busy) return
    if (!readCache()?.machineId) { setTone('error'); setMsg('请先刷新一次车况'); return }
    const command = commandFor(action, target)
    // 所有车辆控制按钮都走这里，统一先弹二次确认，避免误触下发指令。
    const ok = await Dialog.confirm({
      title: `确认执行「${command.label}」？`,
      message: '指令会立即下发到车辆，请确认车辆周围安全。',
      confirmLabel: '执行',
      cancelLabel: '取消',
    })
    if (!ok || busy) return
    const before = data
    // 进度提示用去掉括号补充说明的短名（如“启动发动机中…”），弹窗标题仍用完整名称。
    const shortName = command.label.replace(/（[^）]*）/g, '')
    setBusy(true)
    setMsg(`${shortName}中…`)
    setTone('ok')
    try {
      // 复用组件意图的同一套下发逻辑：乐观写入状态、失败自动回滚。
      const text = await performControlAction({ action, target, machineId: '', size: 'medium', accountId: '' })
      setMsg(text)
      await syncAfterCommand(before, waitForState)
    } catch (e: any) {
      setTone('error')
      setMsg(`${shortName}失败：${e?.message || e}`)
    }
    setBusy(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const error = tone === 'error'
  const windowsOpen = !!data && known(data, 'windows') && anyBitSet(data.windows)
  const warnings = data ? warningText(data) : []

  return (
    <NavigationStack>
      <ScrollView background="#F2F5FA">
        <VStack alignment="leading" spacing={14} padding={{ horizontal: 18, top: 32, bottom: 28 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
          <HStack alignment="center" spacing={8}>
            <VStack alignment="leading" spacing={5}>
              <Text font={25} fontWeight="bold" foregroundStyle="#17243B">车辆中心</Text>
              <HStack spacing={5}>
                <Image systemName={error ? 'exclamationmark.circle.fill' : busy ? 'arrow.triangle.2.circlepath' : 'checkmark.circle.fill'} resizable scaleToFit foregroundStyle={error ? '#DC5B5B' : busy ? '#426FC5' : '#369A77'} frame={{ width: 11, height: 11 }} />
                <Text font={10.5} foregroundStyle={error ? '#B94C4C' : '#8490A4'} lineLimit={2}>{msg}</Text>
              </HStack>
            </VStack>
            <Spacer />
            <Button action={customize} buttonStyle="plain">
              <ZStack frame={{ width: 34, height: 34 }}>
                <Circle fill="#E3EBF9" />
                <Image systemName="slider.horizontal.3" resizable scaleToFit foregroundStyle="#426FC5" frame={{ width: 15, height: 15 }} />
              </ZStack>
            </Button>
            <Button action={() => refresh()} buttonStyle="plain">
              <ZStack frame={{ width: 34, height: 34 }}>
                <Circle fill="#E3EBF9" />
                <Image systemName="arrow.clockwise" resizable scaleToFit foregroundStyle="#426FC5" frame={{ width: 15, height: 15 }} />
              </ZStack>
            </Button>
            <Button action={dismiss} buttonStyle="plain">
              <ZStack frame={{ width: 34, height: 34 }}>
                <Circle fill="white" />
                <Image systemName="xmark" resizable scaleToFit foregroundStyle="#7E8A9F" frame={{ width: 11, height: 11 }} />
              </ZStack>
            </Button>
          </HStack>

          <ZStack alignment="topLeading" frame={{ maxWidth: 'infinity', minHeight: 160, maxHeight: 160 }}>
            <RoundedRectangle cornerRadius={22} fill={gradientOf(settings)} />
            <HStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'bottomTrailing' }} padding={{ trailing: 10, bottom: 30 }}>
              <Spacer />
              {useAudiLogoOf(settings)
                ? <SVG code={audiLogoSVG(fontColorOf(settings, '#EAF0F8'))} resizable renderingMode="original" frame={logoSize} offset={{ x: LOGO_OFFSET_X, y: LOGO_OFFSET_Y }} />
                : <Image filePath={carImagePath} resizable scaleToFit frame={{ width: Math.min(190 * centerScale, 260), height: Math.min(94 * centerScale, 120) }} offset={{ x: 0, y: 20 }} shadow={{ color: 'rgba(0,0,0,0.22)', radius: 5, x: 0, y: 3 }} />}
            </HStack>
            <VStack alignment="leading" spacing={0} padding={18} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
              <HStack>
                <Text font={10} foregroundStyle="#AFBED8">我的座驾</Text>
                <Spacer />
                <HStack spacing={5}>
                  <Circle fill={data && known(data, 'online') && data.online ? '#6DDDB0' : '#A7B3CA'} frame={{ width: 5, height: 5 }} />
                  <Text font={10} foregroundStyle="#C9D4E6">{!data ? '待同步' : known(data, 'online') ? data.online ? '在线' : '离线' : '状态未知'}</Text>
                </HStack>
              </HStack>
              <Text font={23} fontWeight="semibold" foregroundStyle="white" padding={{ top: 8 }} lineLimit={1}>
                {settings.name.trim() || data?.model || '奥迪 A6L'}
              </Text>
              <Text font={11} foregroundStyle="#BCC9DE" padding={{ top: 5 }}>{data ? plateText(data, settings) : ''}</Text>
              <Spacer />
              <HStack spacing={6}>
                <Image systemName={data && known(data, 'locked') && !data.locked ? 'lock.open' : 'lock'} resizable scaleToFit foregroundStyle={statusTint(data, '#85E4BC')} frame={{ width: 10, height: 10 }} />
                <Text font={10} foregroundStyle={statusTint(data, '#C5D1E4')} lineLimit={1}>{data ? statusText(data) : '等待刷新车况'}</Text>
              </HStack>
            </VStack>
          </ZStack>

          <Panel>
            <VStack alignment="leading" spacing={14} padding={18} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
              <HStack spacing={16}>
                <Metric icon="speedometer" label="累计里程" value={metricValue(data, 'mileage', 0)} unit="km" />
                <Metric icon="fuelpump" label="剩余油量" value={metricValue(data, 'oil', 0)} unit="L" />
              </HStack>
              <Rectangle fill="#EEF1F6" frame={{ maxWidth: 'infinity', minHeight: 1, maxHeight: 1 }} />
              <HStack spacing={16}>
                <Metric icon="battery.100percent" label="电瓶电压" value={metricValue(data, 'battery', 1)} unit="V" />
                <Metric icon="thermometer.medium" label="车外温度" value={metricValue(data, 'outsideTemp', 0)} unit="°C" />
              </HStack>
            </VStack>
          </Panel>

          {centerAddressOf(settings) ? <LocationCard data={data} /> : null}

          {warnings.length > 0 ? (
            <Panel>
              <VStack alignment="leading" spacing={7} padding={14} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
                <HStack spacing={6}>
                  <Image systemName="exclamationmark.triangle.fill" resizable scaleToFit foregroundStyle="#D97706" frame={{ width: 14, height: 14 }} />
                  <Text font={12} fontWeight="semibold" foregroundStyle="#92400E">车辆提醒</Text>
                </HStack>
                {warnings.map((warning, index) => (
                  <Text key={index} font={11} foregroundStyle="#7C5A1B" lineLimit={1}>· {warning}</Text>
                ))}
              </VStack>
            </Panel>
          ) : null}

          <Panel>
            <VStack alignment="leading" spacing={9} padding={16} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
              <Button title="组件个性化 · 主题 / 背景 / 布局 / 提醒" action={customize} />
              {reminders.map(line => <Text key={line} font={12} foregroundStyle="#344159">{line}</Text>)}
            </VStack>
          </Panel>

          <VStack alignment="leading" spacing={10} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <HStack padding={{ leading: 2, top: 2, bottom: 2 }}>
              <Text font={15} fontWeight="semibold" foregroundStyle="#243149">车辆控制</Text>
              <Spacer />
              <Text font={10} foregroundStyle="#94A0B3">远程操作</Text>
            </HStack>
            <HStack spacing={10}>
              <ActionTile
                icon={data?.locked ? 'lock.open' : 'lock'}
                label={data?.locked ? '解锁' : '锁车'}
                tint="#2563EB"
                action={() => run('lock', !data?.locked)}
              />
              <ActionTile
                icon="rectangle.split.3x1"
                label={windowsOpen ? '关窗' : '开窗'}
                tint="#0EA5E9"
                action={() => run('window', !windowsOpen)}
              />
              <ActionTile
                icon="power"
                label={data?.engineOn ? '熄火' : '启动'}
                tint="#16A34A"
                action={() => run('engine', !data?.engineOn)}
              />
            </HStack>
            <HStack spacing={10}>
              <ActionTile
                icon="location"
                label="寻车"
                tint="#F59E0B"
                action={() => run('find', false, false)}
              />
              <ActionTile
                icon="snowflake"
                label={data?.acOn ? '关空调' : '开空调'}
                tint="#7C3AED"
                action={() => run('ac', !data?.acOn)}
              />
              <ActionTile
                icon="shippingbox"
                label={data?.provider === 'aojie' && trunkOpen(data) ? '关闭尾门' : '打开尾门'}
                tint="#4F46E5"
                action={() => run('trunk', !trunkOpen(data))}
              />
            </HStack>
            <HStack spacing={10}>
              <ActionTile
                icon="snowflake"
                label="冷车 30分钟"
                tint="#0284C7"
                action={() => run('cool', false)}
              />
              <ActionTile
                icon="sun.max.fill"
                label="热车 30分钟"
                tint="#EA580C"
                action={() => run('hot', false)}
              />
            </HStack>
          </VStack>

          <Text font={10} foregroundStyle="#9CA7B8" frame={{ maxWidth: 'infinity', alignment: 'center' }} padding={{ top: 2 }} lineLimit={2}>
            {currentProviderLabel()} · 车况与小组件同步更新
          </Text>
        </VStack>
      </ScrollView>
    </NavigationStack>
  )
}

async function main() {
  const parameters = Script.queryParameters || {}
  await Navigation.present({ element: Object.prototype.hasOwnProperty.call(parameters, 'confirmAction') ? <CommandConfirmation parameters={parameters} /> : <App /> })
  Script.exit()
}

main().catch(e => {
  Script.exit(String(e))
})
