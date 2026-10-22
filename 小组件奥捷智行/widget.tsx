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
  Path,
} from 'scripting'
import { loadCar, writeCache, readCache, type CarData } from './api'
import { BeginConfirmationIntent, CancelConfirmationIntent, SubmitConfirmationIntent, ACIntent, TrunkIntent, CoolIntent, HotIntent, FindIntent, EngineIntent, LockIntent, RefreshIntent, WindowIntent } from './app_intents'

import { readSettings, settingsForSize, widgetSizeFor, infoBackgroundOf, visibleButtons, fontSizeOf, fontColorOf, buttonBackgroundOf, buttonTextOf, buttonIconOf, carScaleOf, backgroundDimOf, imagePath, gradientOf, plateText, reminderLines, themeOf } from './settings'
import { updateText } from './credentials'
import { readWidgetConfirmation, type WidgetConfirmation } from './widget-confirmation'
import { requestedCommand } from './command-confirmation'
import { needsAttention, statusTint } from './vehicle-state'
import { dashboardLayout, isDashboardFamily, known, metricItems, stateItems, tireItems, dashboardAttention, parkingText, engineText } from './dashboard-model'
const widgetSize = widgetSizeFor(String(Widget.family), displaySize().width, displaySize().height)
const settings = settingsForSize(readSettings(), widgetSize)
const BUTTONS = visibleButtons(settings)
let CAR_IMAGE_PATH = imagePath(settings)
const OPEN_URL = Script.createRunSingleURLScheme(Script.name)
const NEXT_RELOAD = new Date(Date.now() + settings.refreshMinutes * 60 * 1000)
const BG = 'clear'
const accent = themeOf(settings).accent

function displaySize() {
  const s: any = Widget.displaySize
  return { width: s?.width || 338, height: s?.height || 158 }
}

function title(d: CarData): string {
  return settings.name.trim() || d.model || d.plate || '我的座驾'
}

function statsText(d: CarData): string {
  const km = d.mileage > 0 ? `${d.mileage.toFixed(0)} km` : '-- km'
  const oil = d.oil > 0 ? `${d.oil.toFixed(0)} L` : '-- L'
  const volt = d.battery > 0 ? `${d.battery.toFixed(1)} V` : '-- V'
  return `${km}  ·  ${oil}  ·  ${volt}`
}

function stateText(d: CarData): string {
  const lock = d.locked ? '已锁车' : '未锁车'
  const engine = d.engineOn ? '发动机运行' : '已熄火'
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
  if (String(d.carLamp || '').includes('1')) items.push({ icon: 'headlight.low.beam.fill', label: '车灯未关', tint: '#FBBF24' })
  if (String(d.carDoor || '').includes('1')) items.push({ icon: 'car.side.front.open.fill', label: '车门未关', tint: '#FB923C' })
  if (windowsOpen(d)) items.push({ icon: 'rectangle.split.3x1', label: '车窗未关', tint: '#38BDF8' })
  if (String(d.heatSeat || '').split(',').some(v => Number(v) > 0)) items.push({ icon: 'seat.heat', label: '座椅加热', tint: '#F97316' })
  if (d.waterTemperature > 110 && d.engineOn) items.push({ icon: 'thermometer.and.liquid.waves', label: '水温偏高', tint: '#F87171' })
  if (d.fuelPct > 0 && d.fuelPct < 10) items.push({ icon: 'fuelpump.fill', label: '油量过低', tint: '#FBBF24' })
  if (d.battery > 0 && d.battery < 11.8) items.push({ icon: 'minus.plus.batteryblock.fill', label: '电压偏低', tint: '#F87171' })
  if (!d.locked) items.push({ icon: 'lock.open.fill', label: '车辆未锁', tint: '#FB923C' })
  return items
}

function warningRow(items: WarningItem[], compact = false) {
  if (!settings.showIcons || items.length === 0) return null
  const visible = items.slice(0, 3)
  return (
    <HStack spacing={compact ? 5 : 7} padding={{ top: compact ? 2 : 4 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      {visible.map(item => (
        <HStack spacing={2} key={item.label}>
          <Image systemName={item.icon} resizable scaleToFit foregroundStyle={item.tint} frame={{ width: compact ? 9 : 12, height: compact ? 9 : 12 }} />
          {!compact && items.length === 1 ? <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={item.tint} lineLimit={1}>{item.label}</Text> : null}
        </HStack>
      ))}
    </HStack>
  )
}

function fuelBar(d: CarData, width: number) {
  const pct = Math.max(0.025, Math.min(1, d.fuelPct / 100))
  return (
    <ZStack alignment="leading" frame={{ width, height: 3 }}>
      <Capsule fill="rgba(255,255,255,0.18)" frame={{ width, height: 3 }} />
      <Capsule fill="#5CD98F" frame={{ width: width * pct, height: 3 }} />
    </ZStack>
  )
}

function ControlButton({ intent, confirmationIntent, frame, children }: { intent: any; confirmationIntent?: any; frame: any; children: any }) {
  return <Button intent={confirmationIntent || intent} buttonStyle="plain" frame={frame}>{children}</Button>
}
function mediumButton(width: number, system: string, label: string, intent: any, tint: string, confirmationIntent?: any) {
  return (
    <ControlButton intent={intent} confirmationIntent={confirmationIntent} frame={{ width, height: 31 }}>
      <ZStack frame={{ width, height: 31 }}>
        <RoundedRectangle cornerRadius={10} fill={buttonBackgroundOf(settings)} frame={{ width, height: 31 }} />
        <HStack spacing={7}>
          <Image systemName={system} resizable scaleToFit foregroundStyle={buttonIconOf(settings, tint)} frame={{ width: 12, height: 12 }} />
          <Text font={fontSizeOf(settings, 9.5)} fontWeight="medium" foregroundStyle={buttonTextOf(settings, 'rgba(255,255,255,0.94)')} lineLimit={1}>{label}</Text>
        </HStack>
      </ZStack>
    </ControlButton>
  )
}

function smallButton(width: number, system: string, intent: any, tint: string, confirmationIntent?: any) {
  return (
    <ControlButton intent={intent} confirmationIntent={confirmationIntent} frame={{ width, height: 30 }}>
      <ZStack frame={{ width, height: 30 }}>
        <RoundedRectangle cornerRadius={10} fill={buttonBackgroundOf(settings)} frame={{ width, height: 30 }} />
        <Image systemName={system} resizable scaleToFit foregroundStyle={buttonIconOf(settings, tint)} frame={{ width: 13, height: 13 }} />
      </ZStack>
    </ControlButton>
  )
}

function mediumBody(d: CarData) {
  const widgetWidth = displaySize().width
  const buttonWidth = (widgetWidth - 26 - 6 * (BUTTONS.length - 1)) / BUTTONS.length
  const scale = carScaleOf(settings)
  const carWidth = Math.min(104 * scale, widgetWidth * 0.43)
  const contentWidth = widgetWidth - 26 - carWidth - 8
  const warnings = warningItems(d)
  return (
    <VStack alignment="leading" spacing={0} padding={{ horizontal: 13, top: 12, bottom: 10 }} background={BG} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Link url={OPEN_URL}>
        <HStack alignment="top" spacing={8} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
          <VStack alignment="leading" spacing={4} frame={{ width: contentWidth, alignment: 'leading' }}>
            <HStack spacing={8} frame={{ width: contentWidth, alignment: 'leading' }}>
              <Text font={fontSizeOf(settings, 19)} fontWeight="bold" foregroundStyle={fontColorOf(settings, 'white')} lineLimit={1} minScaleFactor={0.72}>{title(d)}</Text>
              <Text font={fontSizeOf(settings, 9)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.58)')} lineLimit={1}>{plateText(d, settings)}</Text>
            </HStack>
            <Text font={fontSizeOf(settings, 10)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.9)')} lineLimit={1} minScaleFactor={0.8}>{addressText(d)}</Text>
            <Text font={fontSizeOf(settings, 11)} fontWeight="semibold" foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.98)')} lineLimit={1} minScaleFactor={0.7}>{statsText(d)}</Text>
            <HStack padding={{ top: 1 }}>
              {fuelBar(d, 94)}
            </HStack>
            <Text font={fontSizeOf(settings, 9.5)} fontWeight="medium" foregroundStyle={statusTint(d, d.online ? fontColorOf(settings, 'rgba(255,255,255,0.7)') : '#FCA5A5')} lineLimit={1}>{stateText(d)}</Text>
            {warningRow(warnings)}
          </VStack>
          <VStack alignment="trailing" spacing={scale > 1 ? 4 : 12} frame={{ width: carWidth, alignment: 'trailing' }}>
            <HStack spacing={6}>
              <Image systemName="cloud" resizable scaleToFit foregroundStyle="rgba(255,255,255,0.68)" frame={{ width: 10, height: 8 }} />
              <Text font={fontSizeOf(settings, 9)} fontWeight="medium" foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.82)')}>
                {settings.showTemp && Number.isFinite(d.outsideTemp) ? `${d.outsideTemp.toFixed(0)}°C` : ''}
              </Text>
            </HStack>
            <Image filePath={CAR_IMAGE_PATH} resizable scaleToFit frame={{ width: carWidth, height: Math.min(56 * scale, 72) }} offset={{ x: 0, y: 6 }} shadow={{ color: 'rgba(0,0,0,0.38)', radius: 5, x: 0, y: 3 }} />
            <Text font={fontSizeOf(settings, 7.5)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.55)')} lineLimit={1} minScaleFactor={0.65}>{updateText(d.updatedAt, Date.now(), settings.updateTimeStyle)}</Text>
          </VStack>
        </HStack>
      </Link>

      <Spacer />

      <HStack spacing={6} frame={{ maxWidth: 'infinity' }}>
        {BUTTONS.map((id, index) => {
          if (id === 'blank') return <Spacer key={index} frame={{ width: buttonWidth, height: 31 }} />
          const action = buttonAction(id, d, index)
          return <HStack key={index} spacing={0}>{mediumButton(buttonWidth, action.icon, action.label, action.intent, action.tint, action.confirmationIntent)}</HStack>
        })}
      </HStack>
    </VStack>
  )
}

function smallBody(d: CarData) {
  const buttonWidth = (displaySize().width - 22 - 4 * (BUTTONS.length - 1)) / BUTTONS.length
  const warnings = warningItems(d)
  const scale = carScaleOf(settings)
  const enlarged = scale > 1
  const imageHeight = Math.min((warnings.length && settings.showIcons ? 22 : 35) * scale, (warnings.length && settings.showIcons ? 34 : 48) + Math.max(0, displaySize().height - 158))
  return (
    <VStack alignment="leading" spacing={0} padding={{ horizontal: 11, top: enlarged ? 8 : 10, bottom: enlarged ? 7 : 9 }} background={BG} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Link url={OPEN_URL}>
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
          <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.76)')} padding={{ top: enlarged ? 2 : 4 }} lineLimit={1} minScaleFactor={0.62} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{addressText(d)}</Text>
          <HStack spacing={3} padding={{ top: 2 }} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <Text font={fontSizeOf(settings, 8)} foregroundStyle={statusTint(d, d.online ? fontColorOf(settings, 'rgba(134,239,172,0.86)') : '#FCA5A5')} lineLimit={1} minScaleFactor={0.65} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{stateText(d)}</Text>
            <Text font={fontSizeOf(settings, 7)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.5)')} lineLimit={1} minScaleFactor={0.65}>{updateText(d.updatedAt, Date.now(), settings.updateTimeStyle)}</Text>
          </HStack>
          <Text font={fontSizeOf(settings, 9.5)} fontWeight="semibold" foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.94)')} padding={{ top: enlarged ? 1 : 3 }} lineLimit={1} minScaleFactor={0.62} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{statsText(d)}</Text>
          {warningRow(warnings, true)}
          <ZStack alignment="bottom" frame={{ width: displaySize().width - 22, height: imageHeight + 3 }} padding={{ top: enlarged ? 1 : 3 }}>
            <Image filePath={CAR_IMAGE_PATH} resizable scaleToFit frame={{ width: Math.min(90 * scale, displaySize().width - 22), height: imageHeight }} shadow={{ color: 'rgba(0,0,0,0.34)', radius: 4, x: 0, y: 2 }} />
          </ZStack>
        </VStack>
      </Link>

      <Spacer />

      <HStack spacing={4} frame={{ maxWidth: 'infinity' }}>
        {BUTTONS.map((id, index) => {
          if (id === 'blank') return <Spacer key={index} frame={{ width: buttonWidth, height: 30 }} />
          const action = buttonAction(id, d, index)
          return <HStack key={index} spacing={0}>{smallButton(buttonWidth, action.icon, action.intent, action.tint, action.confirmationIntent)}</HStack>
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
  const target = id === 'lock' ? !d.locked : id === 'window' ? !windowsOpen(d) : id === 'engine' ? !d.engineOn : id === 'ac' ? !d.acOn : false
  const confirmationIntent = settings.buttonConfirmations[slot] === true ? BeginConfirmationIntent({
    confirmAction: id, confirmTarget: target ? '1' : '0', confirmVehicle: d.machineId || '', confirmSize: widgetSize,
    slot, id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), issuedAt: Date.now(),
  }) : undefined
  return { ...action, confirmationIntent }
}
function directButtonAction(id: string, d: CarData) {
  switch (id) {
    case 'lock': return { icon: d.locked ? 'lock.open' : 'lock', label: d.locked ? '解锁' : '锁车', intent: LockIntent({ locked: !d.locked }), tint: '#93C5FD' }
    case 'window': return { icon: 'rectangle.split.3x1', label: windowsOpen(d) ? '关窗' : '开窗', intent: WindowIntent({ open: !windowsOpen(d) }), tint: '#67E8F9' }
    case 'engine': return { icon: 'power', label: d.engineOn ? '熄火' : '启动', intent: EngineIntent({ start: !d.engineOn }), tint: accent }
    case 'find': return { icon: 'speaker.wave.2', label: '寻车', intent: FindIntent(undefined), tint: accent }
    case 'cool': return { icon: 'snowflake', label: '冷车', intent: CoolIntent(undefined), tint: '#67E8F9' }
    case 'hot': return { icon: 'sun.max', label: '热车', intent: HotIntent(undefined), tint: '#FDBA74' }
    case 'ac': return { icon: 'fanblades', label: d.acOn ? '关空调' : '开空调', intent: ACIntent({ on: !d.acOn }), tint: '#67E8F9' }
    case 'trunk': return { icon: 'car.side.rear.open', label: '尾门', intent: TrunkIntent(undefined), tint: accent }
    default: return { icon: 'arrow.clockwise', label: '刷新', intent: RefreshIntent(undefined), tint: '#7DD3FC' }
  }
}
function ringBody(d: CarData) {
  const buttonWidth = (displaySize().width - 18 - 4 * (BUTTONS.length - 1)) / BUTTONS.length
  const pct = Math.max(0, Math.min(100, d.fuelPct))
  const length = 2 * Math.PI * 39
  const color = pct < 20 ? '#FBBF24' : accent
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="5"/><circle cx="50" cy="50" r="39" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (length*pct/100) + ' ' + length + '" transform="rotate(-90 50 50)"/></svg>'
  return <VStack spacing={2} padding={9} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
    <Link url={OPEN_URL}><Text font={fontSizeOf(settings, 14)} fontWeight="bold" foregroundStyle={fontColorOf(settings, 'white')} lineLimit={1}>{title(d)}</Text></Link>
    <Button intent={RefreshIntent(undefined)} buttonStyle="plain">
      <ZStack frame={{ height: Math.max(50, displaySize().height - 95), maxWidth: 'infinity' }}>
        <SVG code={svg} resizable renderingMode="original" frame={{ width: 63, height: 63 }} />
        <VStack spacing={0}>
          <Image filePath={CAR_IMAGE_PATH} resizable scaleToFit frame={{ width: Math.min(76 * carScaleOf(settings), displaySize().width - 24), height: Math.min(35 * carScaleOf(settings), 42) }} />
          <Text font={fontSizeOf(settings, 11)} fontWeight="bold" foregroundStyle={pct < 20 ? color : fontColorOf(settings, color)}>{pct.toFixed(0)}%</Text>
        </VStack>
      </ZStack>
    </Button>
    {!needsAttention(d) && settings.showIcons && warningItems(d).length ? warningRow(warningItems(d), true) : <Text font={fontSizeOf(settings, 8)} foregroundStyle={statusTint(d, fontColorOf(settings, 'rgba(255,255,255,0.76)'))} lineLimit={1} minScaleFactor={0.65}>{stateText(d)}</Text>}
    <Text font={fontSizeOf(settings, 7)} foregroundStyle={fontColorOf(settings, 'rgba(255,255,255,0.5)')} lineLimit={1}>{updateText(d.updatedAt, Date.now(), settings.updateTimeStyle)}</Text>
    <HStack spacing={4}>
      {BUTTONS.map((id, index) => {
        if (id === 'blank') return <Spacer key={index} frame={{ width: buttonWidth, height: 30 }} />
        const action = buttonAction(id, d, index)
        return <HStack key={index} spacing={0}>{smallButton(buttonWidth, action.icon, action.intent, action.tint, action.confirmationIntent)}</HStack>
      })}
    </HStack>
  </VStack>
}
function dashboardPanel(children: any, width: number, height: number, padding = 10) {
  return <ZStack frame={{ width, height }}>
    <RoundedRectangle cornerRadius={12} fill={infoBackgroundOf(settings)} frame={{ width, height }} />
    <VStack alignment="leading" spacing={3} padding={padding} frame={{ width, height, alignment: 'leading' }}>{children}</VStack>
  </ZStack>
}
function dashboardHeader(d: CarData, width: number, height: number) {
  return <Link url={OPEN_URL}><HStack spacing={6} frame={{ width, height }}>
    <VStack alignment="leading" spacing={1} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <Text font={fontSizeOf(settings, height < 40 ? 19 : 23)} fontWeight="bold" foregroundStyle={fontColorOf(settings, 'white')} lineLimit={1} minScaleFactor={0.7}>{title(d)}</Text>
      {plateText(d, settings) ? <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={fontColorOf(settings, '#A3B4CD')} lineLimit={1}>{plateText(d, settings)}</Text> : null}
    </VStack>
    <VStack alignment="trailing" spacing={2}>
      <Text font={fontSizeOf(settings, 9)} foregroundStyle={known(d, 'online') ? d.online ? fontColorOf(settings, '#9AE6CB') : '#FCA5A5' : fontColorOf(settings, '#A3B4CD')}>{known(d, 'online') ? d.online ? '车辆在线' : '车辆离线' : '在线状态未知'}</Text>
      {settings.showTemp ? <Text font={fontSizeOf(settings, 9)} foregroundStyle={fontColorOf(settings, '#D7E4F7')}>{known(d, 'outsideTemp') ? d.outsideTemp.toFixed(0) + '°C' : '--°C'}</Text> : null}
    </VStack>
  </HStack></Link>
}
function dashboardHero(d: CarData, width: number, height: number) {
  const summaryWidth = Math.min(100, width * 0.3)
  const imageArea = width - summaryWidth - 6
  const color = dashboardAttention(d) ? '#FB923C' : fontColorOf(settings, '#9AE6CB')
  return <Link url={OPEN_URL}><HStack spacing={6} frame={{ width, height }}>
    <VStack alignment="leading" spacing={4} frame={{ width: summaryWidth, alignment: 'leading' }}>
      {height >= 65 ? <Text font={fontSizeOf(settings, 8)} foregroundStyle={fontColorOf(settings, '#91A8C7')}>驻车状态</Text> : null}
      <Text font={fontSizeOf(settings, height < 65 ? 13 : 17)} fontWeight="semibold" foregroundStyle={color} lineLimit={1} minScaleFactor={0.6}>{parkingText(d)}</Text>
      <Text font={fontSizeOf(settings, 8.5)} foregroundStyle={color} lineLimit={2} minScaleFactor={0.7}>{engineText(d)}</Text>
    </VStack>
    <ZStack frame={{ width: imageArea, height }}>
      <Image filePath={CAR_IMAGE_PATH} resizable scaleToFit frame={{ width: Math.min(imageArea, imageArea * 0.82 * carScaleOf(settings)), height: Math.min(height, height * 0.8 * carScaleOf(settings)) }} shadow={{ color: 'rgba(0,0,0,0.3)', radius: 5, x: 0, y: 4 }} />
    </ZStack>
  </HStack></Link>
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
      <Text font={fontSizeOf(settings, tileHeight < 50 ? 7.5 : 9)} foregroundStyle={fontColorOf(settings, '#A3B7D0')} lineLimit={1}>{item.label}</Text>
      <HStack alignment="firstTextBaseline" spacing={2}>
        <Text font={fontSizeOf(settings, tileWidth < 80 ? 15 : 21)} fontWeight="semibold" foregroundStyle={item.alert ? '#FB923C' : fontColorOf(settings, 'white')} lineLimit={1} minScaleFactor={0.5}>{item.value}</Text>
        {item.unit ? <Text font={fontSizeOf(settings, 7)} foregroundStyle={fontColorOf(settings, '#A3B7D0')}>{item.unit}</Text> : null}
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
    return <HStack key={index} spacing={6} frame={{ width: width - 16, height: rowHeight, alignment: 'leading' }}>{items.slice(index * columns, (index + 1) * columns).map((item, i) => <VStack key={i} alignment="leading" spacing={1} frame={{ width: cellWidth, height: rowHeight, alignment: 'leading' }}>
      <Text font={fontSizeOf(settings, compact ? 7 : 8.5)} foregroundStyle={fontColorOf(settings, '#90A8C6')} lineLimit={1}>{item.label}</Text>
      <Text font={fontSizeOf(settings, compact ? 9 : 11)} fontWeight="medium" foregroundStyle={item.alert ? '#FB923C' : fontColorOf(settings, item.value === '未知' ? '#90A8C6' : '#C9E2DC')} lineLimit={1} minScaleFactor={0.6}>{item.value}</Text>
    </VStack>)}</HStack>
  }
  return dashboardPanel(<VStack spacing={4}>{Array.from({ length: rows }, (_, i) => row(i))}</VStack>, width, height, 8)
}
function dashboardTires(d: CarData, width: number, height: number) {
  const padding = height < 30 ? 2 : 6
  const cellWidth = (width - padding * 2 - 18) / 4
  return dashboardPanel(<HStack spacing={6} frame={{ width: width - padding * 2, height: height - padding * 2 }}>{tireItems(d).map(item => <VStack key={item.label} alignment="leading" spacing={1} frame={{ width: cellWidth }}>
    <Text font={fontSizeOf(settings, 7.5)} foregroundStyle={fontColorOf(settings, '#90A8C6')} lineLimit={1}>{item.label}</Text>
    <Text font={fontSizeOf(settings, height < 30 ? 9 : 10)} fontWeight="medium" foregroundStyle={fontColorOf(settings, '#C9E2DC')} lineLimit={1} minScaleFactor={0.7}>{item.value}</Text>
  </VStack>)}</HStack>, width, height, padding)
}
function dashboardLocation(d: CarData, width: number, height: number) {
  return <Link url={OPEN_URL}>{dashboardPanel(<>
    {height >= 54 ? <Text font={fontSizeOf(settings, 8)} foregroundStyle={fontColorOf(settings, '#90A8C6')}>{settings.showAddress ? '车辆位置' : '随行短句'}</Text> : null}
    <Text font={fontSizeOf(settings, height > 40 ? 11 : 9)} foregroundStyle={fontColorOf(settings, '#CDD9E9')} lineLimit={height >= 54 ? 2 : 1} minScaleFactor={0.65}>{addressText(d)}</Text>
  </>, width, height, height >= 54 ? 10 : 7)}</Link>
}
function dashboardReminders(lines: string[], width: number, height: number) {
  if (!lines.length) return null
  const visible = lines.slice(0, height < 35 ? 1 : 2)
  return <Link url={OPEN_URL}>{dashboardPanel(<VStack alignment="leading" spacing={2}>{visible.map((line, index) => <Text key={index} font={fontSizeOf(settings, height < 35 ? 8.5 : 10)} foregroundStyle={fontColorOf(settings, '#E8D6B1')} lineLimit={1} minScaleFactor={0.65}>{line}</Text>)}</VStack>, width, height, 7)}</Link>
}
function dashboardButtons(d: CarData, width: number, height: number) {
  const gap = 7
  const buttonWidth = (width - gap * (BUTTONS.length - 1)) / BUTTONS.length
  return <HStack spacing={gap} frame={{ width, height }}>{BUTTONS.map((id, index) => {
    if (id === 'blank') return <Spacer key={index} frame={{ width: buttonWidth, height }} />
    const action = buttonAction(id, d, index)
    return <ControlButton key={index} intent={action.intent} confirmationIntent={action.confirmationIntent} frame={{ width: buttonWidth, height }}>
      <ZStack frame={{ width: buttonWidth, height }}>
        <RoundedRectangle cornerRadius={11} fill={buttonBackgroundOf(settings)} frame={{ width: buttonWidth, height }} />
        <HStack spacing={4}>
          <Image systemName={action.icon} resizable scaleToFit foregroundStyle={buttonIconOf(settings, action.tint)} frame={{ width: 12, height: 12 }} />
          <Text font={fontSizeOf(settings, 9.5)} fontWeight="medium" foregroundStyle={buttonTextOf(settings, '#E5EEF9')} lineLimit={1} minScaleFactor={0.65}>{action.label}</Text>
        </HStack>
      </ZStack>
    </ControlButton>
  })}</HStack>
}
function dashboardFooter(d: CarData, width: number, height: number) {
  return <Text font={fontSizeOf(settings, 7.5)} foregroundStyle={fontColorOf(settings, '#8CA1BC')} lineLimit={1} frame={{ width, height, alignment: 'trailing' }}>{updateText(d.updatedAt, Date.now(), settings.updateTimeStyle)}</Text>
}
function largeBody(d: CarData) {
  const { width, height } = displaySize()
  const reminders = settings.showReminders ? reminderLines(settings, d) : []
  const metricCount = settings.showMetrics ? metricItems(d, settings.metricSlots).length : 0
  const stateCount = settings.showStates ? stateItems(d, settings.stateSlots).length : 0
  const showTires = settings.showTires
  const l = dashboardLayout(width, height, reminders.length > 0, { metricCount, stateCount, tires: showTires, location: settings.showLocationCard })
  const innerWidth = width - l.pad * 2
  if (l.wide) {
    const gap = 20
    const leftWidth = Math.round((innerWidth - gap) * 0.49), rightWidth = innerWidth - gap - leftWidth
    const innerHeight = height - l.pad * 2, sectionGap = 8, header = 34
    const location = settings.showLocationCard ? 44 : 0, reminder = reminders.length ? 36 : 0
    const leftGaps = [header, 1, location, reminder, 10].filter(value => value > 0).length - 1
    const hero = innerHeight - header - location - 10 - reminder - sectionGap * leftGaps
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
        {reminder ? dashboardReminders(reminders, leftWidth, reminder) : null}
        {dashboardFooter(d, leftWidth, 10)}
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
    {l.reminder ? dashboardReminders(reminders, innerWidth, l.reminder) : null}
    {dashboardButtons(d, innerWidth, l.buttons)}
    {dashboardFooter(d, innerWidth, l.footer)}
  </VStack>
}
function Body({ data }: { data: CarData }) {
  const family = String(Widget.family)
  const { width, height } = displaySize()
  if (isDashboardFamily(family, width, height)) return largeBody(data)
  return family === 'systemSmall' || family === 'small'
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
async function main() {
  let cached = readCache()
  const confirmation = readWidgetConfirmation(widgetSize)
  if (!confirmation && settings.autoRefresh && (!cached || Date.now() - cached.updatedAt >= settings.refreshMinutes * 60000)) {
    try { cached = await loadCar(); writeCache(cached) } catch { /* 网络失败保留上次成功快照 */ }
  }
  const family = String(Widget.family)
  const size = displaySize()
  const dashboard = isDashboardFamily(family, size.width, size.height)
  const extraLarge = family.toLowerCase().includes('extralarge') || (dashboard && (size.height > 430 || size.width >= 500))
  const path = dashboard ? (extraLarge ? settings.extraLargeBackground || settings.largeBackground : settings.largeBackground)
    : family === 'systemSmall' || family === 'small' ? settings.smallBackground : settings.mediumBackground
  const exists = path ? await FileManager.exists(path).catch(() => false) : false
  const carExists = settings.carImage ? await FileManager.exists(settings.carImage).catch(() => false) : true
  if (!carExists) { settings.carImage = ''; CAR_IMAGE_PATH = imagePath(settings) }
  const content = cached ? confirmation ? <ConfirmationBody state={confirmation} data={cached} /> : <Body data={cached} /> : <Link url={OPEN_URL}><EmptyView /></Link>
  Widget.present(<ZStack background={gradientOf(settings)} frame={{ width: displaySize().width, height: displaySize().height }}>
    {exists ? <Image filePath={path} resizable scaleToFill clipped frame={{ width: displaySize().width, height: displaySize().height }} /> : null}
    {exists && backgroundDimOf(settings) > 0 ? <RoundedRectangle cornerRadius={0} fill={`rgba(0,0,0,${backgroundDimOf(settings)})`} frame={{ width: displaySize().width, height: displaySize().height }} /> : null}
    {content}
  </ZStack>, { policy: 'after', date: confirmation ? new Date(Math.min(NEXT_RELOAD.getTime(), confirmation.expiresAt)) : NEXT_RELOAD })
}
main()
