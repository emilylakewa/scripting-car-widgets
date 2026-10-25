// 「通用设置 · 油价设置」：地区 / 价区 / 石油公司 / 展示油号 / 每升优惠 + 实时预览。
import { Button, HStack, List, Picker, Section, Spacer, Text, Toggle, VStack, useEffect, useState } from 'scripting'
import {
  MAX_CARD_TYPES,
  areaOptionOf,
  areaOptions,
  clearOilCache,
  companyOf,
  companyOptions,
  directionTextOf,
  loadForecast,
  loadZones,
  moneyText,
  netPriceOf,
  oilTypeOptions,
  predictedPriceOf,
  readOilSettings,
  saveOilSettings,
  trendColorOf,
  trendSymbolOf,
  type OilForecast,
  type OilSettings,
  type OilTypeId,
  type OilZone
} from './oil-price'

const DISCOUNT_PRESETS = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1]
const CUSTOM_DISCOUNT = '__custom_discount__'
// 油箱容量预设（升）；0 = 跟随车机上报
const TANK_PRESETS = [0, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100]
const CUSTOM_TANK = '__custom_tank__'

function errText(error: any): string {
  return error?.message || String(error)
}

export function OilPriceSettingsScreen() {
  const [settings, setSettings] = useState<OilSettings>(readOilSettings)
  const [zones, setZones] = useState<OilZone[]>([])
  const [zonesArea, setZonesArea] = useState('')
  const [forecast, setForecast] = useState<OilForecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /** 每次都基于落盘的设置合并，避免连续操作时用到旧的 state。 */
  function apply(patch: Partial<OilSettings>) {
    try {
      setSettings(saveOilSettings({ ...readOilSettings(), ...patch }))
    } catch (e: any) {
      void Dialog.alert({ title: '保存失败', message: errText(e) })
    }
  }

  async function fetchAll(areaType: string, force: boolean) {
    setLoading(true)
    setError('')
    let failed = ''
    try {
      const list = await loadZones(areaType)
      setZones(list)
      setZonesArea(areaType)
      if (readOilSettings().areaType === areaType && readOilSettings().areaZone >= list.length) apply({ areaZone: 0 })
    } catch (e: any) {
      setZones([])
      setZonesArea(areaType)
      failed = errText(e)
    }
    try {
      setForecast(await loadForecast(areaType, force))
    } catch {
      setForecast(null)
    }
    setError(failed)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll(readOilSettings().areaType, false)
  }, [])

  const ready = !loading && zonesArea === settings.areaType && zones.length > 0
  const zone = ready ? zones[Math.min(settings.areaZone, zones.length - 1)] : null
  const areaLabel = areaOptionOf(settings.areaType).label
  const company = companyOf(settings.company)
  const discountCustom = !DISCOUNT_PRESETS.includes(settings.discount)
  const tankCustom = settings.tankLiters > 0 && !TANK_PRESETS.includes(settings.tankLiters)
  const rows = zone
    ? settings.oilTypes
        .map(type => zone.grades.find(grade => grade.type === type))
        .filter((grade): grade is NonNullable<typeof grade> => Boolean(grade))
    : []
  const missing = zone ? settings.oilTypes.filter(type => !zone.grades.some(grade => grade.type === type)) : []

  function changeArea(value: string) {
    apply({ areaType: value, areaZone: 0 })
    setLoading(true)
    fetchAll(value, false)
  }

  async function inputDiscount() {
    const text = await Dialog.prompt({
      title: '每升优惠（元）',
      defaultValue: settings.discount ? String(settings.discount) : '',
      placeholder: '0 – 2，最多两位小数'
    })
    if (text == null) return
    const value = Number(String(text).trim())
    if (!String(text).trim() || !Number.isFinite(value) || value < 0 || value > 2) {
      await Dialog.alert({ title: '数值超出范围', message: '请输入 0 – 2 之间的数字，最多两位小数' })
      return
    }
    apply({ discount: Math.round(value * 100) / 100 })
  }

  async function inputTank() {
    const text = await Dialog.prompt({
      title: '油箱容量（升）',
      defaultValue: settings.tankLiters > 0 ? String(settings.tankLiters) : '',
      placeholder: '1 – 200，最多一位小数'
    })
    if (text == null) return
    const value = Number(String(text).trim())
    if (!String(text).trim() || !Number.isFinite(value) || value < 1 || value > 200) {
      await Dialog.alert({ title: '数值超出范围', message: '请输入 1 – 200 之间的升数，最多一位小数' })
      return
    }
    apply({ tankLiters: Math.round(value * 10) / 10 })
  }

  function toggleType(type: OilTypeId, on: boolean) {
    const current = settings.oilTypes
    if (on) {
      if (current.includes(type)) return
      if (current.length >= MAX_CARD_TYPES) {
        void Dialog.alert({ title: '最多选择 3 个油号', message: '卡片一行一个油号，选多了会显示不全。' })
        return
      }
      apply({ oilTypes: [...current, type] })
      return
    }
    if (!current.includes(type)) return
    if (current.length <= 1) {
      void Dialog.alert({ title: '至少保留一个油号', message: '全部取消后卡片就没有可展示的价格了。' })
      return
    }
    apply({ oilTypes: current.filter(item => item !== type) })
  }

  async function refreshNow() {
    clearOilCache()
    await fetchAll(settings.areaType, true)
  }

  return (
    <List navigationTitle="油价设置">
      <Section
        header={<Text>显示</Text>}
        footer={<Text>关闭后车辆中心不再显示油价卡片，这里的选择会保留。</Text>}
      >
        <Toggle title="显示油价卡片" value={settings.enabled} onChanged={v => apply({ enabled: v })} />
      </Section>

      <Section
        header={<Text>地区与公司</Text>}
        footer={<Text>{`价格取${company.name}在各省级行政区公布的最高零售指导价；不同加油站的实际成交价会有浮动。“石油公司”只影响卡片图标配色与提示，不会更换数据源。`}</Text>}
      >
        <Picker title="地区" value={settings.areaType} onChanged={changeArea}>
          {areaOptions.map(area => <Text key={area.value} tag={area.value}>{area.label}</Text>)}
        </Picker>
        {ready && zones.length > 1 ? (
          <Picker title="价区" value={settings.areaZone} onChanged={(v: any) => apply({ areaZone: Number(v) })}>
            {zones.map(item => (
              <Text key={item.index} tag={item.index}>{item.name || `价区 ${item.index + 1}`}</Text>
            ))}
          </Picker>
        ) : null}
        <Picker title="石油公司" value={settings.company} onChanged={(v: any) => apply({ company: v })}>
          {companyOptions.map(item => <Text key={item.id} tag={item.id}>{item.name}</Text>)}
        </Picker>
        <Picker title="每升优惠" value={discountCustom ? CUSTOM_DISCOUNT : String(settings.discount)} onChanged={(v: any) => {
          if (v === CUSTOM_DISCOUNT) { void inputDiscount(); return }
          apply({ discount: Number(v) })
        }}>
          {DISCOUNT_PRESETS.map(value => (
            <Text key={String(value)} tag={String(value)}>{value === 0 ? '无优惠' : `优惠 ¥${moneyText(value)} / 升`}</Text>
          ))}
          <Text tag={CUSTOM_DISCOUNT}>{discountCustom ? `自定义 ¥${moneyText(settings.discount)} / 升` : '自定义…（0 – 2 元）'}</Text>
        </Picker>
      </Section>

      <Section
        header={<Text>展示油号</Text>}
        footer={
          <Text>
            {`最多同时展示 ${MAX_CARD_TYPES} 个油号，卡片按这里的顺序排列。标记“本地区未公布”的油号该省份没有报价，即使打开也不会显示。`}
          </Text>
        }
      >
        {oilTypeOptions.map(option => {
          const available = zone ? zone.grades.some(grade => grade.type === option.value) : true
          return (
            <Toggle
              key={option.value}
              title={available ? option.label : `${option.label}（本地区未公布）`}
              value={settings.oilTypes.includes(option.value)}
              onChanged={v => toggleType(option.value, v)}
            />
          )
        })}
      </Section>

      <Section
        header={<Text>加油</Text>}
        footer={
          <Text>
            {'车辆中心会按剩余油量和油箱容量，算出加满一箱大约要花的钱：还需升数 × 该油号现价（已含每升优惠）。车机没上报油量时卡片只给提示，不会给出金额；油箱容量选「跟随车机」时用车机上报值，车机不报则按 75 升估算。'}
          </Text>
        }
      >
        <Picker title="加油油号" value={settings.refuelType} onChanged={(v: any) => apply({ refuelType: v })}>
          {oilTypeOptions.map(option => {
            const available = zone ? zone.grades.some(grade => grade.type === option.value) : true
            return <Text key={option.value} tag={option.value}>{available ? option.label : `${option.label}（本地区未公布）`}</Text>
          })}
        </Picker>
        <Picker title="油箱容量" value={tankCustom ? CUSTOM_TANK : String(settings.tankLiters)} onChanged={(v: any) => {
          if (v === CUSTOM_TANK) { void inputTank(); return }
          apply({ tankLiters: Number(v) })
        }}>
          {TANK_PRESETS.map(liters => (
            <Text key={String(liters)} tag={String(liters)}>{liters === 0 ? '跟随车机' : `${liters} 升`}</Text>
          ))}
          <Text tag={CUSTOM_TANK}>{tankCustom ? `自定义 ${settings.tankLiters} 升` : '自定义…（1 – 200 升）'}</Text>
        </Picker>
      </Section>

      <Section
        header={<Text>预览</Text>}
        footer={
          <Text>
            {`预测来自第三方油价资讯网站对下次调价窗口的预估，仅供参考。\n现价更新于省级最高零售价公布日${zone?.startDate ? `（${zone.startDate}）` : ''}，油价每 10 个工作日调整一次。`}
          </Text>
        }
      >
        {loading ? (
          <Text font={13} foregroundStyle="#7A8494">正在获取 {areaLabel} 油价…</Text>
        ) : error ? (
          <Text font={13} foregroundStyle="#B94C4C">获取失败：{error}</Text>
        ) : (
          <>
            <VStack alignment="leading" spacing={4}>
              <Text font={14} fontWeight="semibold">{`${areaLabel}${zone?.name ? ` · ${zone.name}` : ''} · ${company.short}`}</Text>
              <Text font={11} foregroundStyle={trendColorOf(forecast)} lineLimit={2}>
                {forecast
                  ? `${directionTextOf(forecast)}${forecast.change ? ` ¥${moneyText(forecast.change)}/升` : ''}${forecast.adjustDate ? ` · ${forecast.adjustDate}调价` : ''}`
                  : '暂无调价预测'}
              </Text>
            </VStack>
            {rows.map(grade => {
              const price = netPriceOf(grade, settings)
              const predicted = predictedPriceOf(price, forecast)
              return (
                <HStack key={grade.type} spacing={8}>
                  <Text font={13} foregroundStyle="#4A566B">{grade.shortLabel}</Text>
                  <Spacer />
                  <Text font={13} fontWeight="semibold">{moneyText(price)}</Text>
                  <Text font={11} foregroundStyle={trendColorOf(forecast)}>
                    {trendSymbolOf(forecast)} {moneyText(predicted)}
                  </Text>
                </HStack>
              )
            })}
            {missing.length ? (
              <Text font={11} foregroundStyle="#9A7B24" lineLimit={2}>
                {`本地区未公布：${missing.map(type => oilTypeOptions.find(o => o.value === type)?.shortLabel ?? type).join('、')}`}
              </Text>
            ) : null}
          </>
        )}
        <Button title={loading ? '正在刷新…' : '刷新油价数据'} action={() => { void refreshNow() }} />
      </Section>
    </List>
  )
}
