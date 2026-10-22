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
  Button,
  Link,
  Spacer,
  Widget,
  useState,
  useEffect,
  Script,
  Path,
} from 'scripting'
import { loadCar, sendCommand, readCache, writeCache, type CarData } from './api'

import { statusTint } from './vehicle-state'
import { CommandConfirmation } from './confirmation-screen'
import { SettingsScreen } from './settings-screen'
import { readSettings, carScaleOf, imagePath, plateText, reminderLines, gradientOf } from './settings'

const BG = {
  gradient: [
    { color: '#2B3E68', location: 0 },
    { color: '#0B152B', location: 1 },
  ],
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 1, y: 1 },
}

function fmtTime(t: number): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function statusText(d: CarData): string {
  const parts = [d.locked ? '已锁车' : '未锁车']
  parts.push(d.engineOn ? '发动机运行' : '发动机熄火')
  if (Array.isArray(d.windows) && d.windows.some(v => v !== 0)) parts.push('车窗未关')
  return parts.join(' · ')
}

function mapURL(d: CarData): string {
  const query = d.address || `${d.lat},${d.lng}`
  return `http://maps.apple.com/?ll=${d.lat},${d.lng}&q=${encodeURIComponent(query)}`
}

function warningText(d: CarData): string[] {
  const warnings: string[] = []
  if (!d.online) warnings.push('车辆当前离线')
  if (d.fuelPct > 0 && d.fuelPct < 20) warnings.push(`油量偏低，仅剩 ${d.fuelPct.toFixed(0)}%`)
  if (d.battery > 0 && d.battery < 11.8) warnings.push(`电瓶电压偏低（${d.battery.toFixed(1)}V）`)
  if (Array.isArray(d.windows) && d.windows.some(v => v !== 0)) warnings.push('检测到车窗未关')
  if (String(d.carLamp || '').includes('1')) warnings.push('车灯开启')
  if (String(d.carDoor || '').includes('1')) warnings.push('车门 / 尾门 / 盖板未关')
  if (d.engineOn && d.waterTemperature > 110) warnings.push('水温偏高，请检查仪表')
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

function App() {
  const dismiss = Navigation.useDismiss()
  const [data, setData] = useState<CarData | null>(() => readCache())
  const [msg, setMsg] = useState('正在读取车况…')
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState(readSettings)
  const carImagePath = imagePath(settings)
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
      setMsg(`刷新失败：${e?.message || e}`)
    }
    setBusy(false)
  }

  async function run(label: string, fn: () => Promise<string>): Promise<void> {
    if (busy) return
    setBusy(true)
    setMsg(`${label}中…`)
    try {
      const text = await fn()
      setMsg(text)
    } catch (e: any) {
      setMsg(`${label}失败：${e?.message || e}`)
    }
    setBusy(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const error = msg.includes('失败')
  const windowsOpen = !!data && Array.isArray(data.windows) && data.windows.some(v => v !== 0)
  const warnings = data ? warningText(data) : []

  return (
    <NavigationStack>
      <ScrollView background="#F2F5FA">
        <VStack alignment="leading" spacing={14} padding={{ horizontal: 18, top: 10, bottom: 28 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
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
              <Image filePath={carImagePath} resizable scaleToFit frame={{ width: Math.min(190 * carScaleOf(settings), 260), height: Math.min(94 * carScaleOf(settings), 120) }} shadow={{ color: 'rgba(0,0,0,0.22)', radius: 5, x: 0, y: 3 }} />
            </HStack>
            <VStack alignment="leading" spacing={0} padding={18} frame={{ maxWidth: 'infinity', maxHeight: 'infinity', alignment: 'topLeading' }}>
              <HStack>
                <Text font={10} foregroundStyle="#AFBED8">我的座驾</Text>
                <Spacer />
                <HStack spacing={5}>
                  <Circle fill={data?.online ? '#6DDDB0' : '#A7B3CA'} frame={{ width: 5, height: 5 }} />
                  <Text font={10} foregroundStyle="#C9D4E6">{data?.online ? '在线' : data ? '离线' : '待同步'}</Text>
                </HStack>
              </HStack>
              <Text font={23} fontWeight="semibold" foregroundStyle="white" padding={{ top: 8 }} lineLimit={1}>
                {settings.name.trim() || data?.model || '奥迪 A6L'}
              </Text>
              <Text font={11} foregroundStyle="#BCC9DE" padding={{ top: 5 }}>{data ? plateText(data, settings) : ''}</Text>
              <Spacer />
              <HStack spacing={6}>
                <Image systemName={data?.locked ? 'lock' : 'lock.open'} resizable scaleToFit foregroundStyle={statusTint(data, '#85E4BC')} frame={{ width: 10, height: 10 }} />
                <Text font={10} foregroundStyle={statusTint(data, '#C5D1E4')} lineLimit={1}>{data ? statusText(data) : '等待刷新车况'}</Text>
              </HStack>
            </VStack>
          </ZStack>

          <Panel>
            <VStack alignment="leading" spacing={14} padding={18} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
              <HStack spacing={16}>
                <Metric icon="speedometer" label="累计里程" value={data ? data.mileage.toFixed(0) : '--'} unit="km" />
                <Metric icon="fuelpump" label="剩余油量" value={data ? data.oil.toFixed(0) : '--'} unit="L" />
              </HStack>
              <Rectangle fill="#EEF1F6" frame={{ maxWidth: 'infinity', minHeight: 1, maxHeight: 1 }} />
              <HStack spacing={16}>
                <Metric icon="battery.100percent" label="电瓶电压" value={data ? data.battery.toFixed(1) : '--'} unit="V" />
                <Metric icon="thermometer.medium" label="车外温度" value={data ? data.outsideTemp.toFixed(0) : '--'} unit="°C" />
              </HStack>
            </VStack>
          </Panel>

          {data && data.lat !== 0 && data.lng !== 0 ? (
            <Link url={mapURL(data)}>
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
                      <Text font={10} foregroundStyle="#4B78C9">打开地图</Text>
                    </HStack>
                    <Text font={12} foregroundStyle="#344159" lineLimit={3}>
                      {data.address || data.addressShort || '点击查看车辆位置'}
                    </Text>
                  </VStack>
                </HStack>
              </Panel>
            </Link>
          ) : (
            <Panel>
              <HStack alignment="top" spacing={12} padding={16} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
                <ZStack frame={{ width: 32, height: 32 }}>
                  <RoundedRectangle cornerRadius={10} fill="#EDF3FD" />
                  <Image systemName="location" resizable scaleToFit foregroundStyle="#4B78C9" frame={{ width: 15, height: 15 }} />
                </ZStack>
                <VStack alignment="leading" spacing={5} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
                  <Text font={10.5} foregroundStyle="#8792A6">车辆位置</Text>
                  <Text font={12} foregroundStyle="#344159" lineLimit={3}>{data?.address || data?.addressShort || '刷新后显示地址'}</Text>
                </VStack>
              </HStack>
            </Panel>
          )}

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
                action={() => run(data?.locked ? '解锁' : '锁车', () => sendCommand('CMD_LOCK', { flag: data?.locked ? 0 : 1 }))}
              />
              <ActionTile
                icon="rectangle.split.3x1"
                label={windowsOpen ? '关窗' : '开窗'}
                tint="#0EA5E9"
                action={() => run(windowsOpen ? '关窗' : '开窗', () => sendCommand('CMD_WINDOW', { flag: windowsOpen ? 0 : 1 }))}
              />
              <ActionTile
                icon="power"
                label={data?.engineOn ? '熄火' : '启动'}
                tint="#16A34A"
                action={() =>
                  run(data?.engineOn ? '熄火' : '启动', () =>
                    data?.engineOn
                      ? sendCommand('CMD_ENGINE', { flag: 0, engine_time: 0 })
                      : sendCommand('CMD_ENGINE', { flag: 1, engine_time: 10, temperature: 230 })
                  )
                }
              />
            </HStack>
            <HStack spacing={10}>
              <ActionTile
                icon="location"
                label="寻车"
                tint="#F59E0B"
                action={() => run('寻车', () => sendCommand('CMD_SEARCHCAR', { search_status: 0 }))}
              />
              <ActionTile
                icon="snowflake"
                label={data?.acOn ? '关空调' : '开空调'}
                tint="#7C3AED"
                action={() =>
                  run(data?.acOn ? '关空调' : '开空调', () =>
                    data?.acOn
                      ? sendCommand('CMD_AC', { flag: 0 })
                      : sendCommand('CMD_ENGINE', { flag: 3, engine_time: 10, temperature: 230 })
                  )
                }
              />
              <ActionTile
                icon="shippingbox"
                label="尾门"
                tint="#4F46E5"
                action={() => run('尾门', () => sendCommand('CMD_TRUNK', '', true))}
              />
            </HStack>
            <HStack spacing={10}>
              <ActionTile
                icon="snowflake"
                label="冷车 30分钟"
                tint="#0284C7"
                action={() => run('冷车', () => sendCommand('CMD_ENGINE', { flag: 2, engine_time: 30, temperature: 160 }))}
              />
              <ActionTile
                icon="sun.max.fill"
                label="热车 30分钟"
                tint="#EA580C"
                action={() => run('热车', () => sendCommand('CMD_ENGINE', { flag: 3, engine_time: 30, temperature: 280 }))}
              />
            </HStack>
          </VStack>

          <Text font={10} foregroundStyle="#9CA7B8" frame={{ maxWidth: 'infinity', alignment: 'center' }} padding={{ top: 2 }} lineLimit={2}>
            奥智联 · 车况与小组件同步更新
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
