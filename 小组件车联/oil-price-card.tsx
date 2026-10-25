// 车辆中心里的油价卡片：现价 + 下期调价预测。数据来自中石化公布的各省指导价。
import {
  Button,
  Circle,
  HStack,
  Image,
  Rectangle,
  RoundedRectangle,
  Text,
  VStack,
  ZStack,
  useEffect,
  useState
} from 'scripting'
import {
  areaOptionOf,
  clockText,
  companyOf,
  directionTextOf,
  fillLitersOf,
  gradeRowsOf,
  loadOilSnapshot,
  moneyText,
  netPriceOf,
  oilTypeOptionOf,
  predictedPriceOf,
  readOilSettings,
  refuelCostOf,
  refuelGradeOf,
  trendColorOf,
  trendSymbolOf,
  zoneOf,
  type OilForecast,
  type OilSettings,
  type OilSnapshot
} from './oil-price'

// 只采用最后一次请求的结果，避免快速切换地区时旧数据覆盖新数据。
let requestSeq = 0

function forecastLine(forecast: OilForecast | null): string {
  if (!forecast) return '调价信息获取中…'
  const head = directionTextOf(forecast)
  // 未知态只留一句文案：金额和调价日都是上次抓取的残留字段，拼在后面会让人以为是新数据。
  if (forecast.unknown) return head
  const amount = forecast.direction === 'stranded' || !forecast.change ? '' : ` ¥${moneyText(forecast.change)}/升`
  const when = forecast.adjustDate ? ` · ${forecast.adjustDate}调价` : ''
  return `${head}${amount}${when}`
}

// 字体尺度与上方「车况数据」面板（Metric）保持一致：标题 15 / 标签 10.5 / 数值 21 / 单位 11 / 正文 12。
const F_TITLE = 15
const F_LABEL = 10.5
const F_VALUE = 21
const F_UNIT = 11
const F_BODY = 12
// 油号列宽（表头与行必须用同一个值，否则列会错位）
const LABEL_WIDTH = 62

function ColumnLabel({ text, align }: { text: string; align: 'leading' | 'trailing' }) {
  return (
    <Text
      font={F_LABEL}
      foregroundStyle="#7B879B"
      lineLimit={1}
      frame={align === 'leading' ? { width: LABEL_WIDTH, alignment: 'leading' } : { maxWidth: 'infinity', alignment: 'trailing' }}
    >
      {text}
    </Text>
  )
}

// 「油价是否变了」的判定依据：只比地区 + 各油号价格 + 调价预测 + 是否离线缓存，
// 不比 updatedAt（抓取时间）。同一份油价重抓一次不算变化，卡片就该保持上次的渲染结果。
function oilStampOf(snapshot: OilSnapshot | null): string {
  if (!snapshot) return ''
  const prices = snapshot.zones
    .map(zone => `${zone.name}:${zone.grades.map(grade => `${grade.type}=${grade.price}`).join(',')}`)
    .join('|')
  const f = snapshot.forecast
  const forecast = f ? `${f.direction}/${f.change}/${f.adjustDate}/${f.unknown ? 1 : 0}` : ''
  return `${snapshot.areaType}/${snapshot.region}#${prices}#${forecast}#${snapshot.stale ? 1 : 0}`
}

export function OilPriceCard({
  reloadToken,
  remainingLiters = null,
  tankLiters = null
}: {
  reloadToken: number
  /** 车机上报的剩余油量（升）；未上报传 null */
  remainingLiters?: number | null
  /** 油箱容量（升）；未知传 null */
  tankLiters?: number | null
}) {
  const [settings, setSettings] = useState<OilSettings>(readOilSettings)
  const [snapshot, setSnapshot] = useState<OilSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh(next: OilSettings, force: boolean): Promise<void> {
    if (!next.enabled) {
      setLoading(false)
      return
    }
    requestSeq += 1
    const seq = requestSeq
    // 已经有数据显示时，自动重抓走静默通道：不切加载态，内容没变就整张卡片保持原样（卡片记忆）。
    const quiet = !force && snapshot !== null
    if (!quiet) setLoading(true)
    setError('')
    try {
      const value = await loadOilSnapshot(next, force)
      if (seq !== requestSeq) return
      // 内容没变就把上一次的对象原样退回去，React 会跳过这次更新，卡片不重建。
      setSnapshot(prev => (oilStampOf(prev) === oilStampOf(value) ? prev : value))
      if (!quiet) setLoading(false)
    } catch (e: any) {
      if (seq !== requestSeq) return
      setError(e?.message || String(e))
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    const next = readOilSettings()
    // 设置没改动就沿用旧对象：进了设置页又原样退出，也不该算一次卡片重建。
    setSettings(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    refresh(next, false)
  }, [reloadToken])

  if (!settings.enabled) return null

  const zone = zoneOf(snapshot, settings)
  const rows = gradeRowsOf(zone, settings)
  const forecast = snapshot?.forecast ?? null
  const tint = trendColorOf(forecast)
  const company = companyOf(settings.company)
  const areaLabel = areaOptionOf(settings.areaType).label
  const zoneName = zone?.name ? zone.name.replace(/^(汽油|柴油)价格[:：]/, '') : ''
  const placeText = zoneName ? `${areaLabel} · ${zoneName}` : `${areaLabel} · 全省`
  const updateText = snapshot ? clockText(snapshot.updatedAt) : ''
  const footNotes = [
    settings.discount > 0 ? `已按每升优惠 ¥${moneyText(settings.discount)} 计算` : '',
    snapshot?.stale ? '离线缓存' : ''
  ].filter(Boolean)

  // 加满一箱：还需加的升数 × 加油油号折后单价。数据不全时显示 -- 并说明原因。
  const refuelGrade = refuelGradeOf(zone, settings)
  const refuelPrice = refuelGrade ? netPriceOf(refuelGrade, settings) : 0
  const refuelShort = oilTypeOptionOf(settings.refuelType).shortLabel
  // 油箱容量：设置里手动指定优先，否则用车机上报值。
  const tankValue = settings.tankLiters > 0 ? settings.tankLiters : tankLiters
  const needLiters = fillLitersOf(tankValue, remainingLiters)
  const refuelCost = refuelCostOf(needLiters, refuelPrice)
  let refuelNote = ''
  if (zone && !refuelGrade) refuelNote = `本地区未公布 ${refuelShort}，可在油价设置里换一个加油油号`
  else if (needLiters == null) refuelNote = '车机暂未上报剩余油量，无法估算加满金额'
  else if (needLiters === 0) refuelNote = '油箱已满，无需加油'
  else refuelNote = `还需 ${needLiters.toFixed(1)} L × ¥${moneyText(refuelPrice)}/升`

  return (
    <ZStack frame={{ maxWidth: 'infinity' }}>
      <RoundedRectangle cornerRadius={20} fill="white" />
      <VStack alignment="leading" spacing={12} padding={18} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
        <HStack spacing={10}>
          <ZStack frame={{ width: 32, height: 32 }}>
            <RoundedRectangle cornerRadius={10} fill="#EDF3FD" />
            <Image systemName="fuelpump.fill" resizable scaleToFit foregroundStyle={company.tint} frame={{ width: 15, height: 15 }} />
          </ZStack>
          <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <HStack spacing={6}>
              <Text font={F_TITLE} fontWeight="semibold" foregroundStyle="#17243B">油价</Text>
              <Text font={F_UNIT} foregroundStyle="#8792A5" lineLimit={1}>{placeText}</Text>
            </HStack>
            <Text font={F_UNIT} foregroundStyle={tint} lineLimit={1}>{forecastLine(forecast)}</Text>
          </VStack>
          {updateText ? <Text font={F_LABEL} foregroundStyle="#9AA6B8" lineLimit={1}>{updateText}</Text> : null}
          <Button action={() => refresh(settings, true)} buttonStyle="plain">
            <ZStack frame={{ width: 26, height: 26 }}>
              <Circle fill="#F1F5FD" />
              <Image
                systemName={loading ? 'arrow.triangle.2.circlepath' : 'arrow.clockwise'}
                resizable
                scaleToFit
                foregroundStyle={loading ? '#9FB3D4' : '#426FC5'}
                frame={{ width: 12, height: 12 }}
              />
            </ZStack>
          </Button>
        </HStack>

        {error ? (
          <VStack alignment="leading" spacing={4} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <Text font={F_BODY} foregroundStyle="#B94C4C" lineLimit={2}>油价获取失败：{error}</Text>
            <Text font={F_LABEL} foregroundStyle="#9AA6B8" lineLimit={2}>可在「设置 · 通用设置 · 油价设置」更换地区后重试</Text>
          </VStack>
        ) : rows.length === 0 ? (
          <Text font={F_BODY} foregroundStyle="#7B879B" lineLimit={2}>
            {loading ? '正在获取油价…' : '该价区暂未公布所选油号，可在油价设置中调整油号'}
          </Text>
        ) : (
          <VStack alignment="leading" spacing={10} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <HStack spacing={0}>
              <ColumnLabel text="油号" align="leading" />
              <ColumnLabel text="现价（元/升）" align="trailing" />
              <ColumnLabel text="下期预测" align="trailing" />
            </HStack>
            {rows.map(grade => {
              const price = netPriceOf(grade, settings)
              const predicted = predictedPriceOf(price, forecast)
              return (
                <HStack key={grade.type} spacing={0}>
                  <Text font={F_VALUE} fontWeight="medium" foregroundStyle="#5A6A85" lineLimit={1} frame={{ width: LABEL_WIDTH, alignment: 'leading' }}>{grade.shortLabel}</Text>
                  <Text font={F_VALUE} fontWeight="semibold" foregroundStyle="#17243B" lineLimit={1} frame={{ maxWidth: 'infinity', alignment: 'trailing' }}>
                    {moneyText(price)}
                  </Text>
                  <HStack spacing={4} frame={{ maxWidth: 'infinity', alignment: 'trailing' }}>
                    <Text font={F_BODY} foregroundStyle={tint}>{trendSymbolOf(forecast)}</Text>
                    <Text font={F_VALUE} fontWeight="semibold" foregroundStyle={tint} lineLimit={1}>{moneyText(predicted)}</Text>
                  </HStack>
                </HStack>
              )
            })}
          </VStack>
        )}

        {zone ? (
          <ZStack frame={{ maxWidth: 'infinity' }}>
            <RoundedRectangle cornerRadius={14} fill="#F4F8FE" />
            <HStack alignment="center" spacing={10} padding={12} frame={{ maxWidth: 'infinity' }}>
              <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
                <Text font={F_LABEL} foregroundStyle="#7B879B" lineLimit={1}>{`加满一箱 · ${refuelShort}`}</Text>
                <Text font={F_LABEL} foregroundStyle="#8A97A8" lineLimit={2}>{refuelNote}</Text>
              </VStack>
              {refuelCost == null ? (
                <Text font={F_VALUE} fontWeight="semibold" foregroundStyle="#A9B3C3">--</Text>
              ) : (
                <Text font={F_VALUE} fontWeight="semibold" foregroundStyle="#1F4FBF" lineLimit={1}>{`¥${moneyText(refuelCost)}`}</Text>
              )}
            </HStack>
          </ZStack>
        ) : null}

        {footNotes.length > 0 ? (
          <VStack alignment="leading" spacing={8} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
            <Rectangle fill="#EEF1F6" frame={{ maxWidth: 'infinity', minHeight: 1, maxHeight: 1 }} />
            <Text font={F_LABEL} foregroundStyle="#9AA6B8" lineLimit={2}>
              {footNotes.join(' · ')}
            </Text>
          </VStack>
        ) : null}
      </VStack>
    </ZStack>
  )
}
