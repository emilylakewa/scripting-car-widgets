import {
  Widget,
  SVG,
  VStack,
  HStack,
  ZStack,
  Text,
  Image,
  Spacer,
  Capsule,
  RoundedRectangle,
  Button,
  Link,
  Script,
} from 'scripting'
import { loadCar, writeCache, readCache, type CarData } from './api'
import { BeginConfirmationIntent, CancelConfirmationIntent, SubmitConfirmationIntent, ACIntent, TrunkIntent, CoolIntent, HotIntent, FindIntent, EngineIntent, LockIntent, RefreshIntent, WindowIntent } from './app_intents'

import { readSettings, settingsForSize, widgetSizeFor, infoBackgroundOf, visibleButtons, fontSizeOf, fontColorOf, buttonBackgroundOf, buttonHeightOf, buttonIconColorOf, carScaleOf, backgroundDimOf, barSizeOf, buttonRadiusOf, imagePath, gradientOf, plateText, reminderLines, themeOf } from './settings'
import { buttonIconSVG } from './button-icons'
import { updateText, supportsTires } from './credentials'
import { readWidgetConfirmation, recentlyFinishedConfirmation, type WidgetConfirmation } from './widget-confirmation'
import { requestedCommand } from './command-confirmation'
import { statusTint, trunkOpen, bodyWarnings } from './vehicle-state'
import { dashboardLayout, known, bits, anyBitSet, metricItems, stateItems, tireItems, dashboardAttention, parkingText, engineText } from './dashboard-model'
// Widget.displaySize 在一次渲染内是常量，读一次缓存起来，
// 避免各个分区反复访问原生属性、也避免多处的默认值分叉。
const DISPLAY = (() => {
  const s: any = Widget.displaySize
  return { width: s?.width || 338, height: s?.height || 158 }
})()
function displaySize() {
  return DISPLAY
}
const widgetSize = widgetSizeFor(String(Widget.family), DISPLAY.width, DISPLAY.height)
const settings = settingsForSize(readSettings(), widgetSize)
const BUTTONS = visibleButtons(settings)
let CAR_IMAGE_PATH = imagePath(settings)
const OPEN_URL = Script.createRunSingleURLScheme(Script.name)
const NEXT_RELOAD = new Date(Date.now() + settings.refreshMinutes * 60 * 1000)
const BG = 'clear'
const accent = themeOf(settings).accent
const BUTTON_H = buttonHeightOf(settings)

function title(d: CarData): string {
  return settings.name.trim() || d.model || d.plate || '我的座驾'
}

function statsText(d: CarData): string {
  const km = d.mileage > 0 ? `${d.mileage.toFixed(0)} km` : '-- km'
  const oil = d.oil > 0 ? `${d.oil.toFixed(0)} L` : '-- L'
  const volt = d.battery > 0 ? `${d.battery.toFixed(1)} V` : '-- V'
  return `${km}  ·  ${oil}  ·  ${volt}`
}

// 小尺寸卡片的状态行：字段没上报时明说“未知”，不要把默认 false 说成“未锁车 / 已熄火”。
function stateText(d: CarData): string {
  const lock = known(d, 'locked') ? d.locked ? '已锁车' : '未锁车' : '车锁未知'
  const engine = known(d, 'engineOn') ? d.engineOn ? '发动机运行' : '已熄火' : '启动未知'
  return `${lock} · ${engine}`
}

function addressText(d: CarData): string {
  return settings.showAddress ? d.addressShort || d.address || '位置待刷新' : settings.quote
}

function windowsOpen(d: CarData): boolean {
  return Array.isArray(d.windows) && d.windows.some(v => v !== 0)
}
type WarningItem = { icon: string; label: string; tint: string }

function warningItems(d: CarData): WarningItem[] {
  const items: WarningItem[] = []
  // 位图字段统一解析：原来的 includes('1') 会把 10、12 这类数值误判成“已开启”。
  if (known(d, 'carLamp') && anyBitSet(d.carLamp)) items.push({ icon: 'headlight.low.beam.fill', label: '车灯未关', tint: '#FBBF24' })
  items.push(...bodyWarnings(d))
  if (known(d, 'windows') && windowsOpen(d)) items.push({ icon: 'rectangle.split.3x1', label: '车窗未关', tint: '#38BDF8' })
  if (known(d, 'heatSeat') && anyBitSet(d.heatSeat)) items.push({ icon: 'seat.heat', label: '座椅加热', tint: '#F97316' })
  if (known(d, 'waterTemperature') && d.waterTemperature > 110 && d.engineOn) items.push({ icon: 'thermometer.and.liquid.waves', label: '水温偏高', tint: '#F87171' })
  if (known(d, 'fuelPct') && d.fuelPct > 0 && d.fuelPct < 10) items.push({ icon: 'fuelpump.fill', label: '油量过低', tint: '#FBBF24' })
  if (known(d, 'battery') && d.battery > 0 && d.battery < 11.8) items.push({ icon: 'minus.plus.batteryblock.fill', label: '电压偏低', tint: '#F87171' })
  if (known(d, 'locked') && !d.locked) items.push({ icon: 'lock.open.fill', label: '车辆未锁', tint: '#FB923C' })
  return items
}

function warningIcon(item: WarningItem, size: number) {
  return item.icon === 'door' || item.icon === 'trunk'
    ? <SVG code={buttonIconSVG(item.icon, true, item.tint)} resizable renderingMode="original" frame={{ width: size, height: size }} />
    : <Image systemName={item.icon} resizable scaleToFit foregroundStyle={item.tint} frame={{ width: size, height: size }} />
}

function warningRow(items: WarningItem[], compact = false) {
  if (!settings.showIcons || items.length === 0) return null
  const visible = items.slice(0, 3)
  return (
    <HStack spacing={compact ? 5 : 7} padding={{ top: compact ? 2 : 4 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      {visible.map(item => (
        <HStack spacing={2} key={item.label}>
          {warningIcon(item, compact ? 9 : 12)}
          {!compact && items.length === 1 ? <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={item.tint} lineLimit={1}>{item.label}</Text> : null}
        </HStack>
      ))}
    </HStack>
  )
}

// 同步判断文件是否存在：渲染前只需一次本地查证，同步版本可省掉两次 async 往返。
function fileExists(path: string): boolean {
  try { return !!FileManager.existsSync(path) } catch { return false }
}

function fuelBar(d: CarData, width: number, height: number) {
  // fuelPct 可能缺失或非法（NaN）：先归一化，避免 NaN 传到 Capsule 宽度。
  const raw = Number.isFinite(d.fuelPct) ? d.fuelPct : 0
  const pct = Math.max(0.025, Math.min(1, raw / 100))
  const w = Math.max(8, width), h = Math.max(2, height)
  return (
    <ZStack alignment="leading" frame={{ width: w, height: h }}>
      <Capsule fill="rgba(255,255,255,0.18)" frame={{ width: w, height: h }} />
      <Capsule fill="#5CD98F" frame={{ width: w * pct, height: h }} />
    </ZStack>
  )
}

function ControlButton({ intent, confirmationIntent, frame, children }: { intent: any; confirmationIntent?: any; frame: any; children: any }) {
  return <Button intent={confirmationIntent || intent} buttonStyle="plain" frame={frame}>{children}</Button>
}
function iconSizeOf(height: number, width: number) { return Math.round(Math.min(20, Math.max(11, Math.min(height * 0.6, width - 9)))) }
// 图标取色语义：true 用「图标激活状态颜色」。
// 图标形状始终按真实状态画（state），只有颜色按按钮当前的动作方向走：
// 一键类动作（寻车 / 刷新 / 冷车 / 热车）没有开关两态，固定用激活色；
// 启动 / 开窗 / 开尾门 也是「去开启」类动作，所以待执行时亮起、执行完转暗；锁车、空调按实际开关取色。
function iconActive(id: string, state: boolean): boolean {
  switch (id) {
    case 'engine':
    case 'window':
    case 'trunk': return !state
    case 'find':
    case 'refresh':
    case 'cool':
    case 'hot': return true
    default: return state
  }
}
function actionIcon(id: string, state: boolean, tint: string, size: number) {
  return <SVG code={buttonIconSVG(id, state, buttonIconColorOf(settings, iconActive(id, state), tint))} resizable renderingMode="original" frame={{ width: size, height: size }} />
}
// 车辆图片：组件里始终显示所选车辆照片（奥迪 Logo 只用在车辆中心主页）。
function carMark(width: number, height: number, offsetY = 0) {
  return <Image filePath={CAR_IMAGE_PATH} resizable scaleToFit frame={{ width, height }} offset={{ x: 0, y: offsetY }} shadow={{ color: 'rgba(0,0,0,0.34)', radius: 4, x: 0, y: 2 }} />
}
// 车辆图片：点一下直接更新车况（刷新），不跳转
function refreshTap(d: CarData, children: any) {
  return <Button intent={RefreshIntent({ accountId: d.accountId, machineId: d.machineId, size: widgetSize })} buttonStyle="plain">{children}</Button>
}
// 除车辆图片以外的区域：正常跳转进 App 的车辆中心页面
function tapToApp(children: any) {
  return <Link url={OPEN_URL}>{children}</Link>
}
// 小 / 中尺寸共用的底部控制按钮（原来 mediumButton 与 smallButton 完全相同，已合并）。
function controlButton(width: number, id: string, state: boolean, intent: any, tint: string, confirmationIntent?: any) {
  const height = BUTTON_H
  return (
    <ControlButton intent={intent} confirmationIntent={confirmationIntent} frame={{ width, height }}>
      <ZStack frame={{ width, height }}>
        <RoundedRectangle cornerRadius={buttonRadiusOf(settings, height)} fill={buttonBackgroundOf(settings)} frame={{ width, height }} />
        {actionIcon(id, state, tint, iconSizeOf(height, width))}
      </ZStack>
    </ControlButton>
  )
}


function mediumBody(d: CarData) {
  const widgetWidth = displaySize().width
  const buttonGap = BUTTONS.length >= 6 ? 5 : 6
  const buttonWidth = (widgetWidth - 26 - buttonGap * (BUTTONS.length - 1)) / BUTTONS.length
  const scale = carScaleOf(settings)
  const carWidth = Math.min(104 * scale, widgetWidth * 0.43)
  const contentWidth = widgetWidth - 26 - carWidth - 8
  const bar = barSizeOf(settings)
  const barWidth = Math.min(bar.width, contentWidth)
  const warnings = warningItems(d)
  return (
    <VStack alignment="leading" spacing={0} padding={{ horizontal: 13, top: 12, bottom: 10 }} background={BG} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <HStack alignment="top" spacing={8} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
        {tapToApp(
          <VStack alignment="leading" spacing={4} frame={{ width: contentWidth, alignment: 'leading' }}>
            <HStack spacing={8} frame={{ width: contentWidth, alignment: 'leading' }}>
              <Text font={fontSizeOf(settings, 19)} fontWeight="bold" foregroundStyle={fontColorOf(settings, 'white')} lineLimit={1} minScaleFactor={0.72}>{title(d)}</Text>
              <Text font={fontSizeOf(settings, 9)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.58)')} lineLimit={1}>{plateText(d, settings)}</Text>
            </HStack>
            {settings.hideLocationRow ? null : <Text font={fontSizeOf(settings, 10)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.9)')} lineLimit={1} minScaleFactor={0.8}>{addressText(d)}</Text>}
            <Text font={fontSizeOf(settings, 11)} fontWeight="semibold" foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.98)')} lineLimit={1} minScaleFactor={0.7}>{statsText(d)}</Text>
            <HStack padding={{ top: Math.max(1, Math.round((bar.height - 3) / 2)) }}>
              {fuelBar(d, barWidth, bar.height)}
            </HStack>
            <Text font={fontSizeOf(settings, 9.5)} fontWeight="medium" foregroundStyle={statusTint(d, d.online ? fontColorOf(settings, 'rgba(255,255,255,0.7)') : '#FCA5A5')} lineLimit={1}>{stateText(d)}</Text>
            {warningRow(warnings)}
          </VStack>
        )}
        <VStack alignment="trailing" spacing={scale > 1 ? 4 : 12} frame={{ width: carWidth, alignment: 'trailing' }}>
          <HStack spacing={6}>
            <Image systemName="cloud" resizable scaleToFit foregroundStyle="rgba(255,255,255,0.68)" frame={{ width: 10, height: 8 }} />
            <Text font={fontSizeOf(settings, 9)} fontWeight="medium" foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.82)')}>
              {settings.showTemp && Number.isFinite(d.outsideTemp) ? `${d.outsideTemp.toFixed(0)}°C` : ''}
            </Text>
          </HStack>
          {refreshTap(d, carMark(carWidth, Math.min(56 * scale, 72), 6))}
          <Text font={fontSizeOf(settings, 7.5)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.55)')} lineLimit={1} minScaleFactor={0.65}>{updateText(d.updatedAt, Date.now(), settings.updateTimeStyle)}</Text>
        </VStack>
      </HStack>

      <Spacer />

      <HStack spacing={buttonGap} frame={{ maxWidth: 'infinity' }}>
        {BUTTONS.map((id, index) => {
          if (id === 'blank') return <Spacer key={index} frame={{ width: buttonWidth, height: BUTTON_H }} />
          const action = buttonAction(id, d, index)
          return <HStack key={index} spacing={0}>{controlButton(buttonWidth, id, action.state, action.intent, action.tint, action.confirmationIntent)}</HStack>
        })}
      </HStack>
    </VStack>
  )
}

function smallBody(d: CarData) {
  const buttonGap = BUTTONS.length >= 6 ? 3 : 4
  const buttonWidth = (displaySize().width - 22 - buttonGap * (BUTTONS.length - 1)) / BUTTONS.length
  const warnings = warningItems(d)
  const scale = carScaleOf(settings)
  const enlarged = scale > 1
  const imageHeight = Math.min((warnings.length && settings.showIcons ? 22 : 35) * scale, (warnings.length && settings.showIcons ? 34 : 48) + Math.max(0, displaySize().height - 158))
  return (
    <VStack alignment="leading" spacing={0} padding={{ horizontal: 11, top: enlarged ? 8 : 10, bottom: enlarged ? 7 : 9 }} background={BG} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      {tapToApp(
        <VStack alignment="leading" spacing={0} frame={{ maxWidth: 'infinity' }}>
          <HStack alignment="top" spacing={5} frame={{ maxWidth: 'infinity' }}>
            <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
              <Text font={fontSizeOf(settings, 15.5)} fontWeight="bold" foregroundStyle={fontColorOf(settings, 'white')} lineLimit={1} minScaleFactor={0.76} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{title(d)}</Text>
              <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.52)')} lineLimit={1} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{plateText(d, settings)}</Text>
            </VStack>
            <Spacer />
            <VStack alignment="trailing" spacing={1}>
              <Text font={fontSizeOf(settings, 10)} fontWeight="medium" foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.84)')}>{settings.showTemp && Number.isFinite(d.outsideTemp) ? `${d.outsideTemp.toFixed(0)}°` : ''}</Text>
              <Text font={fontSizeOf(settings, 8)} foregroundStyle={d.online ? fontColorOf(settings, '#86EFAC') : '#FCA5A5'}>{d.online ? '在线' : '离线'}</Text>
            </VStack>
          </HStack>
          {settings.hideLocationRow ? null : <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.76)')} padding={{ top: enlarged ? 2 : 4 }} lineLimit={1} minScaleFactor={0.62} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{addressText(d)}</Text>}
          <HStack spacing={3} padding={{ top: 2 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <Text font={fontSizeOf(settings, 8)} foregroundStyle={statusTint(d, d.online ? fontColorOf(settings, 'rgba(134,239,172,0.86)') : '#FCA5A5')} lineLimit={1} minScaleFactor={0.65} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{stateText(d)}</Text>
            <Text font={fontSizeOf(settings, 7)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.5)')} lineLimit={1} minScaleFactor={0.65}>{updateText(d.updatedAt, Date.now(), settings.updateTimeStyle)}</Text>
          </HStack>
          <Text font={fontSizeOf(settings, 9.5)} fontWeight="semibold" foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.94)')} padding={{ top: enlarged ? 1 : 3 }} lineLimit={1} minScaleFactor={0.62} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{statsText(d)}</Text>
          {warningRow(warnings, true)}
        </VStack>
      )}
      {refreshTap(d,
        <ZStack alignment="bottom" frame={{ width: displaySize().width - 22, height: imageHeight + 3 }} padding={{ top: enlarged ? 1 : 3 }}>
          {carMark(Math.min(90 * scale, displaySize().width - 22), imageHeight)}
        </ZStack>
      )}

      <Spacer />

      <HStack spacing={buttonGap} frame={{ maxWidth: 'infinity' }}>
        {BUTTONS.map((id, index) => {
          if (id === 'blank') return <Spacer key={index} frame={{ width: buttonWidth, height: BUTTON_H }} />
          const action = buttonAction(id, d, index)
          return <HStack key={index} spacing={0}>{controlButton(buttonWidth, id, action.state, action.intent, action.tint, action.confirmationIntent)}</HStack>
        })}
      </HStack>
    </VStack>
  )
}

function EmptyView() {
  return (
    <VStack alignment="leading" spacing={7} padding={14} background={BG} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Text font={fontSizeOf(settings, 17)} fontWeight="bold" foregroundStyle={fontColorOf(settings, 'white')}>车况</Text>
      <Text font={fontSizeOf(settings, 11)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.72)')} lineLimit={3}>
        还没有数据。点这里打开控制页，在个性化设置中填写 Token 后刷新车况。
      </Text>
      <Spacer />
      <Image systemName="chevron.right.circle.fill" foregroundStyle="rgba(255,255,255,0.5)" frame={{ width: 18, height: 18 }} />
    </VStack>
  )
}


function buttonAction(id: string, d: CarData, slot: number) {
  const action = directButtonAction(id, d)
  const target = id === 'lock' ? !d.locked : id === 'window' ? !windowsOpen(d) : id === 'trunk' ? !trunkOpen(d) : id === 'engine' ? !d.engineOn : id === 'ac' ? !d.acOn : false
  const confirmationIntent = settings.buttonConfirmations[slot] === true ? BeginConfirmationIntent({
    confirmAccount: d.accountId, confirmAction: id, confirmTarget: target ? '1' : '0', confirmVehicle: d.machineId || '', confirmSize: widgetSize,
    slot, id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), issuedAt: Date.now(),
  }) : undefined
  return { ...action, confirmationIntent }
}
function directButtonAction(id: string, d: CarData) {
  const binding = { accountId: d.accountId, machineId: d.machineId, size: widgetSize }
  switch (id) {
    case 'lock': return { state: d.locked === true, label: d.locked ? '解锁' : '锁车', intent: LockIntent({ ...binding, locked: !d.locked }), tint: '#93C5FD' }
    case 'window': return { state: windowsOpen(d), label: windowsOpen(d) ? '关窗' : '开窗', intent: WindowIntent({ ...binding, open: !windowsOpen(d) }), tint: '#67E8F9' }
    case 'engine': return { state: d.engineOn === true, label: d.engineOn ? '熄火' : '启动', intent: EngineIntent({ ...binding, start: !d.engineOn }), tint: accent }
    case 'find': return { state: false, label: '寻车', intent: FindIntent(binding), tint: accent }
    case 'cool': return { state: false, label: '冷车', intent: CoolIntent(binding), tint: '#67E8F9' }
    case 'hot': return { state: false, label: '热车', intent: HotIntent(binding), tint: '#FDBA74' }
    case 'ac': return { state: d.acOn === true, label: d.acOn ? '关空调' : '开空调', intent: ACIntent({ ...binding, on: !d.acOn }), tint: '#67E8F9' }
    // Use the provider-specific trunk state and explicit requested target.
    case 'trunk': return { state: trunkOpen(d), label: trunkOpen(d) ? '关尾门' : '开尾门', intent: TrunkIntent({ ...binding, open: !trunkOpen(d) }), tint: accent }
    default: return { state: false, label: '刷新', intent: RefreshIntent(binding), tint: '#7DD3FC' }
  }
}
function ringBody(d: CarData) {
  const { width, height } = displaySize()
  const pad = 9, gap = 3, innerWidth = width - pad * 2
  const titleHeight = Math.ceil(fontSizeOf(settings, 14) * 1.25)
  const stateHeight = Math.ceil(fontSizeOf(settings, 8) * 1.3)
  const timeHeight = Math.ceil(fontSizeOf(settings, 7) * 1.3)
  const detailsHeight = stateHeight + timeHeight + 2
  const buttonHeight = BUTTON_H
  const mainHeight = Math.max(1, height - pad * 2 - titleHeight - detailsHeight - buttonHeight - gap * 3)
  const diameter = Math.min(mainHeight, innerWidth * 0.47, 88)
  const carWidth = innerWidth - diameter - 7
  const buttonWidth = (innerWidth - 4 * (BUTTONS.length - 1)) / BUTTONS.length
  const available = known(d, 'fuelPct') && Number.isFinite(d.fuelPct)
  const pct = available ? Math.max(0, Math.min(100, d.fuelPct)) : 0
  const length = 2 * Math.PI * 44
  const color = available && pct < 20 ? '#FBBF24' : accent
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="5"/>' + (available && pct > 0 ? '<circle cx="50" cy="50" r="44" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (length * pct / 100) + ' ' + length + '" transform="rotate(-90 50 50)"/>' : '') + '</svg>'
  const info = metricItems(d, [settings.smallRingInfo])[0]
  const infoText = info ? `${settings.smallRingInfo === 'oil' ? '剩余' : info.label} ${info.value}${info.unit ? ' ' + info.unit : ''}` : ''
  return <VStack spacing={gap} padding={pad} frame={{ width, height }}>
    {tapToApp(<Text font={fontSizeOf(settings, 14)} fontWeight="bold" foregroundStyle={fontColorOf(settings, 'white')} lineLimit={1} minScaleFactor={0.65} frame={{ width: innerWidth, height: titleHeight }}>{title(d)}</Text>)}
    <HStack spacing={7} frame={{ width: innerWidth, height: mainHeight }}>
      {tapToApp(<ZStack frame={{ width: diameter, height: diameter }}>
        <SVG code={svg} resizable renderingMode="original" frame={{ width: diameter, height: diameter }} />
        <VStack spacing={1} frame={{ width: diameter * 0.7 }}>
          <Text font={fontSizeOf(settings, 17)} fontWeight="semibold" foregroundStyle={fontColorOf(settings, color)} lineLimit={1} minScaleFactor={0.55}>{available ? `${pct.toFixed(0)}%` : '--'}</Text>
          <Text font={fontSizeOf(settings, 6.5)} foregroundStyle={fontColorOf(settings, '#A3B4CD')} lineLimit={1} minScaleFactor={0.6}>燃油余量</Text>
        </VStack>
      </ZStack>)}
      <VStack spacing={4} frame={{ width: carWidth, height: mainHeight }}>
        {refreshTap(d, carMark(Math.min(carWidth, carWidth * 0.94 * carScaleOf(settings)), Math.min(mainHeight * 0.65, mainHeight * 0.48 * carScaleOf(settings))))}
        {info ? tapToApp(<Text font={fontSizeOf(settings, 8)} foregroundStyle={info.alert ? '#FB923C' : fontColorOf(settings, '#C3D1E4')} lineLimit={1} minScaleFactor={0.65}>{infoText}</Text>) : null}
      </VStack>
    </HStack>
    {tapToApp(<VStack spacing={2} frame={{ width: innerWidth, height: detailsHeight }}>
      <HStack spacing={4} frame={{ width: innerWidth, height: stateHeight }}>
        <Text font={fontSizeOf(settings, 8)} foregroundStyle={statusTint(d, fontColorOf(settings, 'rgba(255,255,255,0.76)'))} lineLimit={1} minScaleFactor={0.65}>{stateText(d)}</Text>
        {settings.showIcons ? warningItems(d).filter(item => item.icon !== 'lock.open.fill').slice(0, 2).map(item => <HStack key={item.label}>{warningIcon(item, 7)}</HStack>) : null}
      </HStack>
      <Text font={fontSizeOf(settings, 7)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.5)')} lineLimit={1} minScaleFactor={0.65} frame={{ width: innerWidth, height: timeHeight }}>{updateText(d.updatedAt, Date.now(), settings.updateTimeStyle)}</Text>
    </VStack>)}
    <HStack spacing={4} frame={{ width: innerWidth, height: buttonHeight }}>
      {BUTTONS.map((id, index) => {
        if (id === 'blank') return <Spacer key={index} frame={{ width: buttonWidth, height: buttonHeight }} />
        const action = buttonAction(id, d, index)
        return <HStack key={index} spacing={0}>{controlButton(buttonWidth, id, action.state, action.intent, action.tint, action.confirmationIntent)}</HStack>
      })}
    </HStack>
  </VStack>
}
function dashboardPanel(children: any, width: number, height: number, padding = 10) {
  return <ZStack frame={{ width, height }}>
    <RoundedRectangle cornerRadius={12} fill={infoBackgroundOf(settings)} frame={{ width, height }} />
    <VStack alignment="center" spacing={3} padding={padding} frame={{ width, height, alignment: 'center' }}>{children}</VStack>
  </ZStack>
}
function dashboardHeader(d: CarData, width: number, height: number) {
  return tapToApp(<HStack spacing={6} frame={{ width, height }}>
    <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <Text font={fontSizeOf(settings, height < 40 ? 19 : 23)} fontWeight="bold" foregroundStyle={fontColorOf(settings, 'white')} lineLimit={1} minScaleFactor={0.7}>{title(d)}</Text>
      {plateText(d, settings) ? <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={fontColorOf(settings, '#A3B4CD')} lineLimit={1}>{plateText(d, settings)}</Text> : null}
    </VStack>
    <VStack alignment="trailing" spacing={2}>
      <Text font={fontSizeOf(settings, 9)} foregroundStyle={known(d, 'online') ? d.online ? fontColorOf(settings, '#9AE6CB') : '#FCA5A5' : fontColorOf(settings, '#A3B4CD')}>{known(d, 'online') ? d.online ? '车辆在线' : '车辆离线' : '在线状态未知'}</Text>
      {settings.showTemp ? <Text font={fontSizeOf(settings, 9)} foregroundStyle={fontColorOf(settings, '#D7E4F7')}>{known(d, 'outsideTemp') ? d.outsideTemp.toFixed(0) + '°C' : '--°C'}</Text> : null}
    </VStack>
  </HStack>)
}
function dashboardHero(d: CarData, width: number, height: number) {
  const summaryWidth = Math.min(100, width * 0.3)
  const imageArea = width - summaryWidth - 6
  const timeHeight = fontSizeOf(settings, 7.5) * 1.35
  const imageHeight = Math.max(1, height - timeHeight - 2)
  const color = dashboardAttention(d) ? '#FB923C' : fontColorOf(settings, '#9AE6CB')
  return <HStack spacing={6} frame={{ width, height }}><Link url={OPEN_URL}>
    <VStack alignment="leading" spacing={4} frame={{ width: summaryWidth, alignment: 'leading' }}>
      {height >= 65 ? <Text font={fontSizeOf(settings, 8)} foregroundStyle={fontColorOf(settings, '#91A8C7')}>驻车状态</Text> : null}
      <Text font={fontSizeOf(settings, height < 65 ? 13 : 17)} fontWeight="semibold" foregroundStyle={color} lineLimit={1} minScaleFactor={0.6}>{parkingText(d)}</Text>
      <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={color} lineLimit={2} minScaleFactor={0.7}>{engineText(d)}</Text>
    </VStack></Link>
    <VStack alignment="trailing" spacing={2} frame={{ width: imageArea, height }}>
      {refreshTap(d, <ZStack frame={{ width: imageArea, height: imageHeight }}>
        {carMark(Math.min(imageArea, imageArea * 0.82 * carScaleOf(settings)), Math.min(imageHeight, imageHeight * 0.8 * carScaleOf(settings)))}
      </ZStack>)}
      <Text font={fontSizeOf(settings, 7.5)} foregroundStyle={fontColorOf(settings, '#8CA1BC')} lineLimit={1} minScaleFactor={0.65} frame={{ width: imageArea, height: timeHeight, alignment: 'trailing' }}>{updateText(d.updatedAt, Date.now(), settings.updateTimeStyle)}</Text>
    </VStack>
  </HStack>
}
function dashboardMetrics(d: CarData, width: number, height: number, grid = false) {
  const metrics = metricItems(d, settings.metricSlots)
  if (!metrics.length) return null
  const gap = 7, columns = grid ? Math.min(2, metrics.length) : metrics.length
  const rows = Math.ceil(metrics.length / columns)
  const tileWidth = (width - gap * (columns - 1)) / columns
  const tileHeight = (height - gap * (rows - 1)) / rows
  function row(items: typeof metrics, rowIndex: number) {
    return <HStack key={rowIndex} spacing={gap} frame={{ width, height: tileHeight, alignment: 'leading' }}>{items.map((item, index) => <HStack key={index} spacing={0}>{dashboardPanel(<>
      <Text multilineTextAlignment="center" font={fontSizeOf(settings, tileHeight < 50 ? 7.5 : 9)} foregroundStyle={fontColorOf(settings, '#A3B7D0')} lineLimit={1}>{item.label}</Text>
      <HStack alignment="firstTextBaseline" spacing={2} frame={{ maxWidth: 'infinity', alignment: 'center' }}>
        <Text multilineTextAlignment="center" font={fontSizeOf(settings, tileWidth < 80 ? 15 : 21)} fontWeight="semibold" foregroundStyle={item.alert ? '#FB923C' : fontColorOf(settings, 'white')} lineLimit={1} minScaleFactor={0.5}>{item.value}</Text>
        {item.unit ? <Text multilineTextAlignment="center" font={fontSizeOf(settings, 7)} foregroundStyle={fontColorOf(settings, '#A3B7D0')}>{item.unit}</Text> : null}
      </HStack>
    </>, tileWidth, tileHeight, tileHeight < 50 ? settings.fontScale > 100 ? 5 : 7 : 10)}</HStack>)}</HStack>
  }
  return rows > 1 ? <VStack spacing={gap} frame={{ width, height }}>{Array.from({ length: rows }, (_, i) => row(metrics.slice(i * columns, (i + 1) * columns), i))}</VStack> : row(metrics, 0)
}
function dashboardStates(d: CarData, width: number, height: number) {
  const items = stateItems(d, settings.stateSlots)
  if (!items.length) return null
  const columns = Math.min(3, items.length), rows = Math.ceil(items.length / columns)
  const cellWidth = (width - 16 - 6 * (columns - 1)) / columns
  const rowHeight = (height - 16 - 4 * (rows - 1)) / rows
  const compact = height / rows < 40
  function row(index: number) {
    return <HStack key={index} spacing={6} frame={{ width: width - 16, height: rowHeight, alignment: 'leading' }}>{items.slice(index * columns, (index + 1) * columns).map((item, i) => <VStack key={i} alignment="center" spacing={1} frame={{ width: cellWidth, height: rowHeight, alignment: 'center' }}>
      <Text multilineTextAlignment="center" font={fontSizeOf(settings, compact ? 7 : 8.5)} foregroundStyle={fontColorOf(settings, '#90A8C6')} lineLimit={1}>{item.label}</Text>
      <Text multilineTextAlignment="center" font={fontSizeOf(settings, compact ? 9 : 11)} fontWeight="medium" foregroundStyle={item.alert ? '#FB923C' : fontColorOf(settings, item.value === '未知' ? '#90A8C6' : '#C9E2DC')} lineLimit={1} minScaleFactor={0.6}>{item.value}</Text>
    </VStack>)}</HStack>
  }
  return dashboardPanel(<VStack spacing={4}>{Array.from({ length: rows }, (_, i) => row(i))}</VStack>, width, height, 8)
}
function dashboardTires(d: CarData, width: number, height: number) {
  const padding = height < 30 ? 2 : 6
  const cellWidth = (width - padding * 2 - 18) / 4
  return dashboardPanel(<HStack spacing={6} frame={{ width: width - padding * 2, height: height - padding * 2 }}>{tireItems(d).map(item => <VStack key={item.label} alignment="center" spacing={1} frame={{ width: cellWidth }}>
    <Text multilineTextAlignment="center" font={fontSizeOf(settings, 7.5)} foregroundStyle={fontColorOf(settings, '#90A8C6')} lineLimit={1}>{item.label}</Text>
    <Text multilineTextAlignment="center" font={fontSizeOf(settings, height < 30 ? 9 : 10)} fontWeight="medium" foregroundStyle={fontColorOf(settings, '#C9E2DC')} lineLimit={1} minScaleFactor={0.7}>{item.value}</Text>
  </VStack>)}</HStack>, width, height, padding)
}
function dashboardLocation(d: CarData, width: number, height: number) {
  return tapToApp(dashboardPanel(<>
    {height >= 54 ? <Text multilineTextAlignment="center" font={fontSizeOf(settings, 8)} foregroundStyle={fontColorOf(settings, '#90A8C6')}>{settings.showAddress ? '车辆位置' : '随行短句'}</Text> : null}
    <Text multilineTextAlignment="center" font={fontSizeOf(settings, height > 40 ? 11 : 9)} foregroundStyle={fontColorOf(settings, '#CDD9E9')} lineLimit={height >= 54 ? 2 : 1} minScaleFactor={0.65}>{addressText(d)}</Text>
  </>, width, height, height >= 54 ? 10 : 7))
}
function dashboardReminders(d: CarData, lines: string[], width: number, height: number) {
  if (!lines.length) return null
  const visible = lines.slice(0, height < 35 ? 1 : 2)
  return tapToApp(dashboardPanel(<VStack alignment="center" spacing={2}>{visible.map((line, index) => <Text multilineTextAlignment="center" key={index} font={fontSizeOf(settings, height < 35 ? 8.5 : 10)} foregroundStyle={fontColorOf(settings, '#E8D6B1')} lineLimit={1} minScaleFactor={0.65}>{line}</Text>)}</VStack>, width, height, 7))
}
function dashboardButtons(d: CarData, width: number, height: number) {
  const gap = 7
  const rowHeight = Math.max(20, Math.min(height, BUTTON_H))
  const buttonWidth = (width - gap * (BUTTONS.length - 1)) / BUTTONS.length
  return <HStack spacing={gap} frame={{ width, height }}>{BUTTONS.map((id, index) => {
    if (id === 'blank') return <Spacer key={index} frame={{ width: buttonWidth, height: rowHeight }} />
    const action = buttonAction(id, d, index)
    return <ControlButton key={index} intent={action.intent} confirmationIntent={action.confirmationIntent} frame={{ width: buttonWidth, height: rowHeight }}>
      <ZStack frame={{ width: buttonWidth, height: rowHeight }}>
        <RoundedRectangle cornerRadius={buttonRadiusOf(settings, rowHeight, 11)} fill={buttonBackgroundOf(settings)} frame={{ width: buttonWidth, height: rowHeight }} />
        {actionIcon(id, action.state, action.tint, iconSizeOf(rowHeight, buttonWidth))}
      </ZStack>
    </ControlButton>
  })}</HStack>
}
function largeBody(d: CarData) {
  const { width, height } = displaySize()
  const reminders = settings.showReminders ? reminderLines(settings, d) : []
  const metricCount = settings.showMetrics ? metricItems(d, settings.metricSlots).length : 0
  const stateCount = settings.showStates ? stateItems(d, settings.stateSlots).length : 0
  const showTires = supportsTires() && settings.showTires
  // “隐藏地址一行”优先级高于信息卡片里的位置卡片开关。
  const showLocation = settings.showLocationCard && !settings.hideLocationRow
  const l = dashboardLayout(width, height, reminders.length > 0, { metricCount, stateCount, tires: showTires, location: showLocation })
  const innerWidth = width - l.pad * 2
  if (l.wide) {
    // 宽幅（超大号横屏）采用左右两栏：左栏车图+位置+提醒，右栏指标+状态+胎压+按钮。
    // 下面的常量都是各分区实测的固定高度，剩余高度全部给车图（hero）。
    const gap = 20
    const leftWidth = Math.round((innerWidth - gap) * 0.49), rightWidth = innerWidth - gap - leftWidth
    const innerHeight = height - l.pad * 2, sectionGap = 8, header = 34
    const location = showLocation ? 44 : 0, reminder = reminders.length ? 36 : 0
    const leftGaps = [header, 1, location, reminder].filter(value => value > 0).length - 1
    const hero = innerHeight - header - location - reminder - sectionGap * leftGaps
    const buttons = 40
    const stateRows = Math.ceil(stateCount / 3), stateBase = Math.min(90, Math.floor(innerHeight * 0.3))
    const states = stateRows ? 16 + ((stateBase - 20) / 2) * stateRows + 4 * (stateRows - 1) : 0
    const tires = showTires ? 34 : 0
    const rightGaps = [metricCount ? 1 : 0, states, tires, buttons].filter(value => value > 0).length - 1
    const metricHeight = metricCount ? innerHeight - states - tires - buttons - sectionGap * rightGaps : 0
    return <HStack alignment="top" spacing={gap} padding={l.pad} frame={{ width, height }}>
      <VStack spacing={sectionGap} frame={{ width: leftWidth, height: innerHeight }}>
        {dashboardHeader(d, leftWidth, header)}
        {dashboardHero(d, leftWidth, hero)}
        {location ? dashboardLocation(d, leftWidth, location) : null}
        {reminder ? dashboardReminders(d, reminders, leftWidth, reminder) : null}
      </VStack>
      <VStack spacing={sectionGap} frame={{ width: rightWidth, height: innerHeight, alignment: 'top' }}>
        {metricCount ? dashboardMetrics(d, rightWidth, metricHeight, true) : null}
        {states ? dashboardStates(d, rightWidth, states) : null}
        {tires ? dashboardTires(d, rightWidth, tires) : null}
        {dashboardButtons(d, rightWidth, buttons)}
      </VStack>
    </HStack>
  }
  return <VStack spacing={l.gap} padding={l.pad} frame={{ width, height }}>
    {dashboardHeader(d, innerWidth, l.header)}
    {dashboardHero(d, innerWidth, l.hero)}
    {l.metric ? dashboardMetrics(d, innerWidth, l.metric) : null}
    {l.states ? dashboardStates(d, innerWidth, l.states) : null}
    {l.tires ? dashboardTires(d, innerWidth, l.tires) : null}
    {l.location ? dashboardLocation(d, innerWidth, l.location) : null}
    {l.reminder ? dashboardReminders(d, reminders, innerWidth, l.reminder) : null}
    {dashboardButtons(d, innerWidth, l.buttons)}
  </VStack>
}
function Body({ data }: { data: CarData }) {
  // 直接用 module 级 widgetSize（已按 family + 实际尺寸算好），不再各处重复判断。
  if (widgetSize === 'large' || widgetSize === 'extraLarge') return largeBody(data)
  return widgetSize === 'small'
    ? settings.smallStyle === 'ring' ? ringBody(data) : smallBody(data)
    : mediumBody(data)
}
function ConfirmationBody({ state, data }: { state: WidgetConfirmation; data: CarData }) {
  const { width, height } = displaySize()
  const compact = width < 200, horizontal = !compact && height < 220
  const pending = state.phase === 'pending', failed = state.phase === 'error'
  const params = { size: widgetSize, id: state.id }
  const tint = failed ? '#FDA4AF' : pending ? '#F5C982' : '#8AD9F0'
  const heading = pending ? '请确认操作' : failed ? '操作未完成' : '正在提交…'
  const label = requestedCommand(state).label
  const vehicle = title(data), plate = plateText(data, settings)
  const identity = vehicle + (plate && plate !== vehicle ? ' · ' + plate : '')
  const hint = failed ? state.message || '请返回车况后重新操作' : pending ? '确认后发送指令 · 60 秒内有效' : '请稍候，完成后返回车况'
  const symbol = failed ? 'exclamationmark' : state.action === 'lock' ? state.target ? 'lock.fill' : 'lock.open.fill'
    : state.action === 'engine' ? 'power' : state.action === 'window' ? 'rectangle.split.3x1'
    : state.action === 'find' ? 'speaker.wave.2.fill' : state.action === 'cool' ? 'snowflake'
    : state.action === 'hot' ? 'sun.max.fill' : state.action === 'ac' ? 'fanblades.fill'
    : state.action === 'trunk' ? 'car.side.rear.open.fill' : 'arrow.clockwise'
  function icon(size: number) {
    return <ZStack frame={{ width: size, height: size }}>
      <RoundedRectangle cornerRadius={size * 0.3} fill={failed ? '#392938' : pending ? '#343032' : '#1E3547'} frame={{ width: size, height: size }} />
      <Image systemName={symbol} resizable scaleToFit foregroundStyle={tint} frame={{ width: size * 0.43, height: size * 0.43 }} />
    </ZStack>
  }
  function actionButton(text: string, intent: any, w: number, h: number, primary = false) {
    return <Button intent={intent} buttonStyle="plain" frame={{ width: w, height: h }}>
      <ZStack frame={{ width: w, height: h }}>
        <RoundedRectangle cornerRadius={compact ? 11 : 13} fill={primary ? tint : '#344259'} frame={{ width: w, height: h }} />
        {!primary ? <RoundedRectangle cornerRadius={compact ? 10 : 12} fill="#202F45" frame={{ width: w - 2, height: h - 2 }} /> : null}
        <Text font={fontSizeOf(settings, compact ? 11 : 13)} fontWeight="semibold" foregroundStyle={primary ? '#30271C' : '#D8E3F1'} lineLimit={1} minScaleFactor={0.75}>{text}</Text>
      </ZStack>
    </Button>
  }
  function footer(w: number, h: number) {
    if (pending) {
      const gap = compact ? 8 : 10, buttonWidth = (w - gap) / 2
      return <HStack spacing={gap} frame={{ width: w, height: h }}>
        {actionButton('取消', CancelConfirmationIntent(params), buttonWidth, h)}
        {actionButton(compact ? '确认' : '确认执行', SubmitConfirmationIntent(params), buttonWidth, h, true)}
      </HStack>
    }
    if (failed) return actionButton('返回车况', CancelConfirmationIntent(params), w, h)
    return <HStack spacing={6} frame={{ width: w, height: h }}>
      <Image systemName="arrow.triangle.2.circlepath" foregroundStyle={tint} frame={{ width: 12, height: 12 }} />
      <Text font={fontSizeOf(settings, compact ? 10 : 12)} foregroundStyle="#A6B9D0">正在处理，请勿重复操作</Text>
    </HStack>
  }
  const pad = compact ? 12 : horizontal ? 16 : 22
  const innerWidth = width - pad * 2, innerHeight = height - pad * 2
  let content: any
  if (compact) {
    const gap = 5, detailHeight = innerHeight - 18 - 24 - 14 - 32 - 4 * gap
    content = <VStack alignment="leading" spacing={gap} frame={{ width: innerWidth, height: innerHeight }}>
      <HStack spacing={6} frame={{ width: innerWidth, height: 18, alignment: 'leading' }}>
        <Image systemName={failed ? 'exclamationmark.circle.fill' : 'checkmark.shield.fill'} foregroundStyle={tint} frame={{ width: 13, height: 13 }} />
        <Text font={fontSizeOf(settings, 10)} foregroundStyle="#B3C3D8" lineLimit={1}>{heading}</Text>
      </HStack>
      <Text font={fontSizeOf(settings, 18)} fontWeight="semibold" foregroundStyle="#F2F6FC" lineLimit={1} minScaleFactor={0.55} frame={{ width: innerWidth, height: 24, alignment: 'leading' }}>{label}</Text>
      <Text font={fontSizeOf(settings, 10)} foregroundStyle="#B3C3D8" lineLimit={1} minScaleFactor={0.65} frame={{ width: innerWidth, height: 14, alignment: 'leading' }}>{identity}</Text>
      <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={failed ? tint : '#8198B5'} lineLimit={2} minScaleFactor={0.7} frame={{ width: innerWidth, height: detailHeight, alignment: 'topLeading' }}>{hint}</Text>
      {footer(innerWidth, 32)}
    </VStack>
  } else if (horizontal) {
    const gap = 8, buttonHeight = 36, detailHeight = 32, headerHeight = innerHeight - buttonHeight - detailHeight - gap * 2
    const textWidth = innerWidth - 52
    content = <VStack alignment="leading" spacing={gap} frame={{ width: innerWidth, height: innerHeight }}>
      <HStack spacing={12} frame={{ width: innerWidth, height: headerHeight, alignment: 'leading' }}>
        {icon(40)}
        <VStack alignment="leading" spacing={3} frame={{ width: textWidth, height: headerHeight, alignment: 'leading' }}>
          <Text font={fontSizeOf(settings, 10)} foregroundStyle="#A5B9D2" lineLimit={1} minScaleFactor={0.8} frame={{ width: textWidth, height: 12, alignment: 'leading' }}>{heading}</Text>
          <Text font={fontSizeOf(settings, 20)} fontWeight="semibold" foregroundStyle="#F2F6FC" lineLimit={1} minScaleFactor={0.6} frame={{ width: textWidth, height: headerHeight - 15, alignment: 'leading' }}>{label}</Text>
        </VStack>
      </HStack>
      <VStack alignment="leading" spacing={3} frame={{ width: innerWidth, height: detailHeight, alignment: 'leading' }}>
        <Text font={fontSizeOf(settings, 11)} foregroundStyle="#C1CEE0" lineLimit={1} minScaleFactor={0.65}>{identity}</Text>
        <Text font={fontSizeOf(settings, 9)} foregroundStyle={failed ? tint : '#8198B5'} lineLimit={1} minScaleFactor={0.65}>{hint}</Text>
      </VStack>
      {footer(innerWidth, buttonHeight)}
    </VStack>
  } else {
    const gap = 14, buttonHeight = 46, panelHeight = innerHeight - 20 - buttonHeight - gap * 2
    content = <VStack spacing={gap} frame={{ width: innerWidth, height: innerHeight }}>
      <HStack frame={{ width: innerWidth, height: 20 }}>
        <Text font={fontSizeOf(settings, 12)} fontWeight="medium" foregroundStyle="#BACAE0">{heading}</Text>
        <Spacer />
        <Text font={fontSizeOf(settings, 10)} foregroundStyle={tint}>{pending ? '等待确认' : failed ? '请重新操作' : '指令处理中'}</Text>
      </HStack>
      <ZStack frame={{ width: innerWidth, height: panelHeight }}>
        <RoundedRectangle cornerRadius={20} fill="#1A2A40" frame={{ width: innerWidth, height: panelHeight }} />
        <VStack spacing={12} frame={{ width: innerWidth - 28, height: panelHeight - 24 }}>
          {icon(52)}
          <Text font={fontSizeOf(settings, 25)} fontWeight="semibold" foregroundStyle="#F2F6FC" lineLimit={1} minScaleFactor={0.6}>{label}</Text>
          <Text font={fontSizeOf(settings, 13)} foregroundStyle="#C1CEE0" lineLimit={1} minScaleFactor={0.65}>{identity}</Text>
          <Text font={fontSizeOf(settings, 11)} foregroundStyle={failed ? tint : '#8198B5'} lineLimit={2} minScaleFactor={0.7}>{hint}</Text>
        </VStack>
      </ZStack>
      {footer(innerWidth, buttonHeight)}
    </VStack>
  }
  return <ZStack frame={{ width, height }}>
    <RoundedRectangle cornerRadius={26} fill="#111E33" frame={{ width, height }} />
    {content}
  </ZStack>
}
function presentContent(content: any, confirmation: WidgetConfirmation | null, path = '', exists = false) {
  // Keep the same background and outer view when entering or leaving confirmation.
  const size = displaySize()
  Widget.present(<ZStack background={gradientOf(settings)} frame={{ width: size.width, height: size.height }}>
    {exists ? <Image filePath={path} resizable scaleToFill clipped frame={{ width: size.width, height: size.height }} /> : null}
    {exists && backgroundDimOf(settings) > 0 ? <RoundedRectangle cornerRadius={0} fill={`rgba(0,0,0,${backgroundDimOf(settings)})`} frame={{ width: size.width, height: size.height }} /> : null}
    {content}
  </ZStack>, { policy: 'after', date: confirmation ? new Date(Math.min(NEXT_RELOAD.getTime(), confirmation.expiresAt)) : NEXT_RELOAD })
}
async function main() {
  let cached = readCache()
  let confirmation = readWidgetConfirmation(widgetSize)
  // Opening confirmation follows the normal background path, as in 3.1.9.
  // Only feedback after a tap bypasses asset checks.
  if (confirmation && confirmation.phase !== 'pending' && cached) {
    presentContent(<ConfirmationBody state={confirmation} data={cached} />, confirmation)
    return
  }
  if (!confirmation && !recentlyFinishedConfirmation(widgetSize) && settings.autoRefresh && (!cached || Date.now() - cached.updatedAt >= settings.refreshMinutes * 60000)) {
    try { cached = await loadCar(); writeCache(cached) } catch { /* 网络失败保留上次成功快照 */ }
  }
  const dashboard = widgetSize === 'large' || widgetSize === 'extraLarge'
  const extraLarge = widgetSize === 'extraLarge'
  const path = dashboard ? extraLarge ? settings.extraLargeBackground || settings.largeBackground : settings.largeBackground
    : widgetSize === 'small' ? settings.smallBackground : settings.mediumBackground
  // 背景图与车图是否存在只用同步检测；车图丢失时清空设置，回退成默认 car.png。
  const exists = path ? fileExists(path) : false
  const carExists = settings.carImage ? fileExists(settings.carImage) : true
  if (!carExists) { settings.carImage = ''; CAR_IMAGE_PATH = imagePath(settings) }
  cached = readCache()
  confirmation = readWidgetConfirmation(widgetSize)
  const content = cached ? confirmation ? <ConfirmationBody state={confirmation} data={cached} /> : <Body data={cached} /> : <Link url={OPEN_URL}><EmptyView /></Link>
  presentContent(content, confirmation, path, exists)
}
main()
