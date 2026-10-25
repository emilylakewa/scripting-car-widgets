import { Button, ColorPicker, DatePicker, HStack, List, Navigation, NavigationLink, NavigationStack, Picker, RoundedRectangle, SVG, Section, SecureField, Spacer, Text, TextField, Toggle, VStack, ZStack, Widget, useState, Script, useEffect } from 'scripting'
import { DEFAULTS, THEMES, CUSTOM_THEME_ID, ACTIONS, COLOR_PRESETS, INFO_OPTIONS, WIDGET_SIZES, normalizeColor, fontSizeOf, dateValue, dateText, centerAddressOf, useAudiLogoOf, readSettings, saveSettings, settingsForSize, withWidgetSettings, withoutWidgetSettings, buttonBackgroundOf, buttonHeightOf, buttonIconColorOf, buttonIconLineWidthOf, seatLevelOf, SEAT_LEVELS, asSeatLevel, engineTimeOf, defaultEngineTimeFor, centerEngineTimeOf, ENGINE_TIME_MIN, ENGINE_TIME_MAX, buttonRadiusOf, defaultButtonHeightFor, themeOf, visibleButtons, type Settings, type WidgetSize, type WidgetOptions } from './settings'
import { buttonIconSVG, buttonIconTint, iconActive } from './button-icons'
import { PROVIDERS, type ProviderChoice } from './providers'
import { readToken, saveToken, readAMapKey, saveAMapKey, currentProviderLabel, supportsTires, updateText } from './credentials'
import { backupToFile, restoreFromFile, lastBackupAt } from './backup'
import { compactSavedImage, saveWidgetImage, type ImageKey } from './image-assets'
import { OilPriceSettingsScreen } from './oil-settings-screen'

const SIZE_NAMES = Object.fromEntries(WIDGET_SIZES.map(size => [size.id, size.name]))
const BACKGROUND_KEYS = { small: 'smallBackground', medium: 'mediumBackground', large: 'largeBackground', extraLarge: 'extraLargeBackground' } as const
function usePreferences(size?: WidgetSize) {
  const current = () => size ? settingsForSize(readSettings(), size) : readSettings()
  const [s, setS] = useState(current)
  async function update<K extends keyof WidgetOptions>(key: K, value: WidgetOptions[K]) {
    try {
      const root = readSettings()
      saveSettings(size ? withWidgetSettings(root, size, { [key]: value }) : { ...root, [key]: value })
      setS(current()); Widget.reloadAll()
    } catch (e) { await Dialog.alert({ title: '保存失败', message: String(e) }) }
  }
  /** 需要同时写多个键（例如主题 + 三个自定义配色）时用这个：只落一次盘、只刷新一次组件。 */
  async function patch(values: Partial<WidgetOptions>) {
    try {
      const root = readSettings()
      saveSettings(size ? withWidgetSettings(root, size, values) : { ...root, ...values })
      setS(current()); Widget.reloadAll()
    } catch (e) { await Dialog.alert({ title: '保存失败', message: String(e) }) }
  }
  return { s, update, patch }
}
function menu(title: string, subtitle: string, destination: any) {
  return <NavigationLink destination={destination}><VStack alignment="leading" spacing={4} padding={{ top: 4, bottom: 4 }}>
    <Text font={16}>{title}</Text><Text font={11} foregroundStyle="#7A8494">{subtitle}</Text>
  </VStack></NavigationLink>
}
function page(title: string, children: any) {
  return <List navigationTitle={title} navigationBarTitleDisplayMode="inline">{children}</List>
}
/**
 * 数值选择框：预设档位 +「自定义…」选项（不再单独占一行输入按钮）。
 * 1. value 不在预设里时，下拉末项直接回显当前自定义值，保证 Picker 能正确显示；
 * 2. 选中「自定义…」后弹窗输入，按 min–max 取整收敛，超出范围先提示，不会静默截断；
 * 3. 取消或输入非法时不动原值，Picker 会退回原来的档位（只有 onChanged 才写设置）。
 * 4. decimals > 0 时改用小数收敛（例如线条粗细 1.7），预设值不会被抹成整数。
 */
const CUSTOM_TAG = '__custom__'
function NumberPicker(props: {
  title: string; value: number; options: number[]; min: number; max: number
  label: (value: number) => string; hint: string; onChanged: (value: number) => void
  decimals?: number
}) {
  const { title, value, options, min, max, label, hint, onChanged, decimals = 0 } = props
  const unit = Math.pow(10, decimals)
  const quantize = (n: number) => Math.round(n * unit) / unit
  const custom = !options.includes(value)
  const selection: any = custom ? CUSTOM_TAG : value
  async function input() {
    // 当前值不在可输入范围（例如“默认 / 自动”档）时留空，避免用户误存非法值
    const current = value >= min && value <= max ? String(value) : ''
    const text = await Dialog.prompt({ title: title + '（' + hint + '）', defaultValue: current, placeholder: hint })
    if (text == null) return
    const raw = String(text).trim(), number = Number(raw)
    if (!raw || !Number.isFinite(number)) { await Dialog.alert({ title: '请输入数字', message: hint }); return }
    const next = quantize(number)
    if (next < min || next > max) { await Dialog.alert({ title: '数值超出范围', message: hint }); return }
    onChanged(next)
  }
  return <Picker title={title} value={selection} onChanged={(v: any) => {
    // 选「自定义…」不直接改设置，先问用户要多少；取消就什么都不变
    if (v === CUSTOM_TAG) { input(); return }
    onChanged(quantize(Number(v)))
  }}>
    {options.map(option => <Text key={option} tag={option}>{label(option)}</Text>)}
    <Text tag={CUSTOM_TAG}>{custom ? '自定义 ' + label(value) : '自定义…（' + hint + '）'}</Text>
  </Picker>
}
const CUSTOM_COLOR_TAG = '__custom_color__'
/**
 * 调色盘回传的值可能是 #RGB / #RRGGBB / #RRGGBBAA / rgba(...)，统一收敛成 #RRGGBB 再存，
 * 否则 normalizeColor 认不出就会退回默认色。认不出时保留原来的颜色。
 */
function colorToHex(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text)
  if (hex) {
    const digits = hex[1]
    if (digits.length <= 4) return ('#' + digits.slice(0, 3).split('').map(v => v + v).join('')).toUpperCase()
    return ('#' + digits.slice(0, 6)).toUpperCase()
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(text)
  if (rgb) return '#' + [1, 2, 3].map(i => Math.max(0, Math.min(255, Math.round(Number(rgb[i])))).toString(16).padStart(2, '0')).join('').toUpperCase()
  return normalizeColor(fallback) || '#FFFFFF'
}
/** 自定义颜色弹窗：调色盘选色 + 预览，点“使用此颜色”才回写，取消则什么都不改。 */
function CustomColorSheet({ initial, onPicked }: { initial: string; onPicked: (color: string | null) => void }) {
  const dismiss = Navigation.useDismiss()
  const [color, setColor] = useState<any>(initial)
  return <NavigationStack><List navigationTitle="自定义颜色">
    <Section footer={<Text>选好颜色后点“使用此颜色”，取消则保持原来的颜色。透明度由单独的“背景透明度”控制。</Text>}>
      <ColorPicker title="调色盘" value={color} onChanged={(v: any) => setColor(v)} supportsOpacity={false} />
      <HStack spacing={10} padding={{ top: 6, bottom: 6 }}>
        <RoundedRectangle cornerRadius={7} fill={color} frame={{ width: 44, height: 28 }} />
        <Text font={15} foregroundStyle={color}>Aa 123</Text>
        <Text font={11} foregroundStyle="#7A8494">{colorToHex(color, initial)}</Text>
      </HStack>
    </Section>
    <Section>
      <Button title="使用此颜色" action={() => { onPicked(colorToHex(color, initial)); dismiss() }} />
      <Button title="取消" action={() => { onPicked(null); dismiss() }} />
    </Section>
  </List></NavigationStack>
}
/**
 * 自定义主题配色弹窗：渐变起始色 / 结束色 + 强调色。
 * 三个颜色只存在本地 state，点“使用此配色”才一次性回写，拖动调色盘不会反复刷组件。
 */
type CustomTheme = { color1: string; color2: string; accent: string }
function CustomThemeSheet({ initial, onPicked }: { initial: { colors: string[]; accent: string }; onPicked: (theme: CustomTheme | null) => void }) {
  const dismiss = Navigation.useDismiss()
  const [color1, setColor1] = useState<any>(initial.colors[0])
  const [color2, setColor2] = useState<any>(initial.colors[1])
  const [accent, setAccent] = useState<any>(initial.accent)
  const preview: any = { gradient: [{ color: color1, location: 0 }, { color: color2, location: 1 }], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }
  const commit = (value: CustomTheme | null) => { onPicked(value); dismiss() }
  return <NavigationStack><List navigationTitle="自定义配色">
    <Section header={<Text>背景渐变</Text>} footer={<Text>组件背景是左上到右下的渐变：起始色决定整体明暗，结束色是右下角的深色。点任意一行可打开系统调色盘。</Text>}>
      <ColorPicker title="渐变起始色" value={color1} onChanged={(v: any) => setColor1(v)} supportsOpacity={false} />
      <ColorPicker title="渐变结束色" value={color2} onChanged={(v: any) => setColor2(v)} supportsOpacity={false} />
      <RoundedRectangle cornerRadius={10} fill={preview} frame={{ height: 56 }} />
    </Section>
    <Section header={<Text>强调色</Text>} footer={<Text>强调色用于图标激活态、进度条等点缀位置，不影响背景。</Text>}>
      <ColorPicker title="强调色" value={accent} onChanged={(v: any) => setAccent(v)} supportsOpacity={false} />
      <HStack spacing={10} padding={{ top: 6, bottom: 6 }}>
        <RoundedRectangle cornerRadius={7} fill={accent} frame={{ width: 44, height: 28 }} />
        <Text font={15} foregroundStyle={accent}>Aa 123</Text>
        <Text font={11} foregroundStyle="#7A8494">{colorToHex(accent, initial.accent)}</Text>
      </HStack>
    </Section>
    <Section>
      <Button title="使用此配色" action={() => commit({ color1: colorToHex(color1, initial.colors[0]), color2: colorToHex(color2, initial.colors[1]), accent: colorToHex(accent, initial.accent) })} />
      <Button title="取消" action={() => commit(null)} />
    </Section>
  </List></NavigationStack>
}
export function SettingsScreen() {
  const dismiss = Navigation.useDismiss()
  // 车辆中心是全局页面，这里的开关写入根配置，不跟尺寸走。
  const { s, update } = usePreferences()
  return <NavigationStack><List navigationTitle="组件设置" toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
    <Section header={<Text>按尺寸设置</Text>} footer={<Text>四种尺寸独立保存。原有配置会自动沿用，调整一个尺寸不会改变其他尺寸。</Text>}>
      {WIDGET_SIZES.map(size => <VStack key={size.id}>{menu(size.name, size.id === 'small' ? '信息卡片 / 油量圆环' : size.id === 'medium' ? '横向车况与快捷按钮' : '自定义信息卡片与车辆面板', <SizeSettingsScreen size={size.id} />)}</VStack>)}
    </Section>
    <Section header={<Text>通用设置</Text>}>
      {menu('授权与地图', 'Token、高德 Web 服务 Key', <AuthorizationScreen />)}
      {menu('车辆资料', '默认名称与车牌，供未单独修改的尺寸使用', <VehicleDefaultsScreen />)}
      {menu('用车提醒', '保养、保险、年检与保养里程', <ReminderScreen />)}
      {menu('油价设置', '地区、价区、石油公司与下期油价预测', <OilPriceSettingsScreen />)}
    </Section>
    {/* 图标线条粗细全局一份：四个尺寸共用，所以放在根页面，而不是各尺寸的“字体与配色”里。 */}
    <Section header={<Text>按钮图标</Text>} footer={<Text>{`四个尺寸共用一份数值，改一次四个尺寸一起变。\n十枚图标全部生效：锁车、启动、寻车、刷新、热车直接改线条；\n尾门、车窗、空调、冷车、座椅加热是实心剪影，用同色描边把厚片向外长一圈来加粗，默认 1.7 档十枚实测一样粗（1.65 – 1.70）。\n实心剪影只能变粗不能变细，所以 0.8–1.0 这几档它们停在各自的原始粗细；2.4 以上故意只跟七成半，免得把风扇叶片、窗玻璃、孔洞填死。\n上面几行是每枚图标的开启 / 关闭两种图形（启动、寻车、刷新、热车、空调、冷车两态同形，只画一次），不论按钮点亮还是变暗，看到的线条都一样粗。`}</Text>}>
      <NumberPicker title="图标线条粗细" value={s.buttonIconLineWidth} options={[1.2, 1.5, 1.7, 2.0, 2.4, 2.8]} min={0.8} max={3.2} decimals={1}
        hint="0.8 – 3.2，可自定义到 0.1" label={v => v.toFixed(1) + (v === 1.7 ? '（默认）' : '')} onChanged={v => update('buttonIconLineWidth', v)} />
      {/* 预览按“图形是否随状态变化”分三行：两态不同的一枚图标（锁车 / 尾门 / 车窗 / 座椅加热）开启、关闭各画一个，
          两态同形的（启动 / 寻车 / 刷新 / 热车 / 空调 / 冷车）画一次就代表两态。plain 固定白色，只比粗细不比配色。
          每行用 Spacer 均分空余宽度，最右一枚贴边，不会留下空白。 */}
      {iconPreviewRow(s, [
        { id: 'lock', state: false }, { id: 'lock', state: true },
        { id: 'trunk', state: true }, { id: 'trunk', state: false },
      ])}
      {iconPreviewRow(s, [
        { id: 'window', state: true }, { id: 'window', state: false },
        { id: 'seat', state: true }, { id: 'seat', state: false },
      ])}
      {iconPreviewRow(s, [
        { id: 'engine', state: true }, { id: 'find', state: true }, { id: 'refresh', state: true },
        { id: 'hot', state: true }, { id: 'ac', state: false }, { id: 'cool', state: false },
      ])}
    </Section>
    <Section header={<Text>车辆中心</Text>} footer={<Text>{`车辆中心现在使用与小组件一致的车图风格。未设置专用车图时使用脚本内置车图，不再读取中号组件图片。车辆中心车图与各尺寸组件图片、大小分别保存。\n“车辆位置”关闭后不再显示地址，点开后仍可刷新车况。`}</Text>}>
      <Toggle title="使用奥迪四环 Logo" value={useAudiLogoOf(s)} onChanged={v => update('useAudiLogo', v)} />
      {useAudiLogoOf(s)
        ? <NumberPicker title="Logo 大小" value={s.centerLogoScale} options={[60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 200]} min={30} max={300} hint="30 – 300 %"
          label={v => v + '%' + (v === 80 ? '（默认）' : '')} onChanged={v => update('centerLogoScale', v)} />
        : <NumberPicker title="车辆大小" value={s.centerCarScale} options={[60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 200]} min={30} max={300} hint="30 – 300 %"
          label={v => v + '%' + (v === 100 ? '（默认）' : '')} onChanged={v => update('centerCarScale', v)} />}
      <Button title={s.centerCarImage ? '更换车辆中心车图' : '选择车辆中心车图'} action={async () => {
        try { const photo = (await Photos.pickPhotos(1))[0]; if (!photo) return; const path = await saveWidgetImage(photo, 'centerCarImage', 'medium'); await update('centerCarImage', path) }
        catch (e) { await Dialog.alert({ title: '选择图片失败', message: String(e) }) }
      }} />
      {s.centerCarImage ? <Button title="恢复内置车辆中心车图" action={() => update('centerCarImage', '')} /> : null}
      <Toggle title="显示车辆位置" value={centerAddressOf(s)} onChanged={v => update('showCenterAddress', v)} />
      <NumberPicker title="冷车运行时间" value={centerEngineTimeOf(s, 'cool')} options={[5, 10, 15, 20, 25, 30]} min={ENGINE_TIME_MIN} max={ENGINE_TIME_MAX}
        hint={'1 – ' + ENGINE_TIME_MAX + ' 分钟（车机上限）'} label={v => v + ' 分钟' + (v === 30 ? '（默认）' : '')} onChanged={v => update('centerCoolMinutes', v)} />
      <NumberPicker title="热车运行时间" value={centerEngineTimeOf(s, 'hot')} options={[5, 10, 15, 20, 25, 30]} min={ENGINE_TIME_MIN} max={ENGINE_TIME_MAX}
        hint={'1 – ' + ENGINE_TIME_MAX + ' 分钟（车机上限）'} label={v => v + ' 分钟' + (v === 30 ? '（默认）' : '')} onChanged={v => update('centerHotMinutes', v)} />
    </Section>
    <Section header={<Text>数据管理</Text>}>
      {menu('备份/恢复', '备份、恢复与重置全部设置', <BackupScreen />)}
      {/* 名称和版本号都读 script.json（Script.metadata），不手写，避免和清单不一致。 */}
      <Text font={11} foregroundStyle="#7A8494">{`${Script.metadata.name || '小组件车联'} · ${Script.metadata.version || '未知版本'}`}</Text>
    </Section>
  </List></NavigationStack>
}
function SizeSettingsScreen({ size }: { size: WidgetSize }) {
  const dashboard = size === 'large' || size === 'extraLarge'
  async function restore() {
    await Navigation.present({ element: <ResetConfirmation title="恢复此尺寸原配置" detail="只清除当前尺寸的独立设置，重新沿用升级前的原有配置。其他尺寸和授权不受影响。" onReset={() => { saveSettings(withoutWidgetSettings(readSettings(), size)); Widget.reloadAll() }} /> })
  }
  return page(SIZE_NAMES[size], <>
    <Section header={<Text>内容</Text>}>
      {menu('显示内容与布局', '名称、车牌、位置与状态显示', <DisplayScreen size={size} />)}
      {dashboard ? menu('信息卡片内容', '选择每张卡片的信息，隐藏不需要的区域', <CardContentScreen size={size} />) : null}
    </Section>
    <Section header={<Text>外观</Text>}>
      {menu('字体与配色', '字号、文字颜色、背景颜色与透明度', <AppearanceScreen size={size} />)}
      {menu('车图与背景', '车辆图片、车图大小、背景图片与明暗', <ImagesScreen size={size} />)}
    </Section>
    <Section header={<Text>操作与刷新</Text>}>
      {menu('快捷按钮', '每个按钮的功能与二次确认', <ButtonsScreen size={size} />)}
      {menu('刷新设置', '自动获取、期望间隔与时间显示', <RefreshScreen size={size} />)}
    </Section>
    <Section header={<Text>预览与恢复</Text>}>
      {size !== 'extraLarge' ? <Button title={'预览' + SIZE_NAMES[size]} action={async () => { await Widget.preview({ family: size === 'small' ? 'systemSmall' : size === 'medium' ? 'systemMedium' : 'systemLarge' }) }} /> : <Text font={12} foregroundStyle="#7A8494">超大号请在桌面添加对应尺寸后查看。</Text>}
      <Button title="恢复此尺寸原配置" action={restore} />
    </Section>
  </>)
}
function AuthorizationScreen() {
  const [token, setToken] = useState(''), [amapKey, setAMapKey] = useState('')
  const [hasToken, setHasToken] = useState(() => !!readToken()), [hasAMapKey, setHasAMapKey] = useState(() => !!readAMapKey())
  const [providerLabel, setProviderLabel] = useState(currentProviderLabel)
  const [choice, setChoice] = useState<ProviderChoice>('auto')
  const [busy, setBusy] = useState(false)
  const [guard] = useState(() => ({ busy: false }))
  async function store(kind: 'token' | 'map') {
    if (guard.busy) return
    guard.busy = true; setBusy(true)
    try {
      if (kind === 'token') {
        const provider = await saveToken(token, choice)
        setToken(''); setHasToken(!!readToken()); setProviderLabel(currentProviderLabel())
        Widget.reloadAll()
        await Dialog.alert({ title: '识别成功', message: '已切换为' + PROVIDERS[provider].label + '。返回车辆中心刷新车况后生效。' })
      } else {
        saveAMapKey(amapKey); setAMapKey(''); setHasAMapKey(!!readAMapKey()); Widget.reloadAll()
        await Dialog.alert({ title: '已保存', message: '地图设置已保存。' })
      }
    } catch (e) { await Dialog.alert({ title: '保存失败', message: String(e) }) }
    finally { guard.busy = false; setBusy(false) }
  }
  return page('授权与地图', <>
    <Section header={<Text>账号授权 · 自动识别</Text>} footer={<Text>填写 Authorization 完整值。保存时同时尝试奥智联和奥捷智行的只读车辆接口，哪个先返回可用就自动选用哪个。Token 保存到系统钥匙串。</Text>}>
      <Text>{hasToken ? '当前服务：' + providerLabel : '尚未配置 Token'}</Text>
      <SecureField title="Authorization Token" value={token} onChanged={setToken} prompt="粘贴完整 Token，自动识别服务" />
      {/* Picker 回传的是裸值（string/number），这里做一次收敛，避免类型报错。 */}
      <Picker title="识别方式" value={choice} onChanged={(value: any) => setChoice(value as ProviderChoice)}>
        <Text tag="auto">自动识别（推荐）</Text><Text tag="aozhilian">仅验证奥智联</Text><Text tag="aojie">仅验证奥捷智行</Text>
      </Picker>
      <Button title={busy ? '正在验证，请稍候…' : '识别并保存 Token'} action={() => store('token')} />
    </Section>
    <Section header={<Text>高德地图（可选）</Text>} footer={<Text>填写自己的高德 Web 服务 Key。未填写或服务失败时使用系统地址解析。清空后保存可停用；Key 保存在系统钥匙串。</Text>}>
      <Text>{hasAMapKey ? '已配置高德 Key' : '未配置，使用系统地址解析'}</Text>
      <SecureField title="高德 Web 服务 Key" value={amapKey} onChanged={setAMapKey} prompt="填写自己的 Key，留空停用" />
      <Button title="保存 / 清除高德 Key" action={() => store('map')} />
    </Section>
  </>)
}
function VehicleDefaultsScreen() {
  const { s, update } = usePreferences()
  return page('车辆资料', <>
    <Section header={<Text>车辆名称</Text>}>
      <TextField title="默认车型名称" value={s.name} onChanged={v => update('name', v)} prompt="留空使用接口名称" />
    </Section>
    <Section header={<Text>车牌</Text>} footer={<Text>没有单独自定义名称和车牌的尺寸会沿用这里的设置。留空使用接口信息。</Text>}>
      <TextField title="默认车牌" value={s.plate} onChanged={v => update('plate', v)} prompt="留空使用接口车牌" />
    </Section>
  </>)
}
function DisplayScreen({ size }: { size: WidgetSize }) {
  const { s, update } = usePreferences(size)
  return page(SIZE_NAMES[size] + ' · 显示内容', <>
    {size === 'small' ? <Section header={<Text>布局</Text>}><Picker title="小号布局" value={s.smallStyle} onChanged={(v: string) => update('smallStyle', v)}><Text tag="classic">信息卡片</Text><Text tag="ring">油量圆环</Text></Picker></Section> : null}
    {size === 'small' && s.smallStyle === 'ring' ? <Section header={<Text>油量圆环</Text>} footer={<Text>选择车图下方显示的信息。“不显示”会隐藏这一行；没有接口读数时显示未知或 --。</Text>}>
      <Picker title="车图下方显示内容" value={!supportsTires() && s.smallRingInfo.startsWith('tire') ? 'blank' : s.smallRingInfo} onChanged={(v: string) => update('smallRingInfo', v)}>
        {INFO_OPTIONS.filter(item => supportsTires() || !item.id.startsWith('tire')).map(item => <Text key={item.id} tag={item.id}>{item.name}</Text>)}
      </Picker>
    </Section> : null}
    <Section header={<Text>车辆名称</Text>}>
      <TextField title="自定义车型名称" value={s.name} onChanged={v => update('name', v)} prompt="留空使用接口名称" />
    </Section>
    <Section header={<Text>车辆信息</Text>}>
      <Toggle title="显示车牌" value={s.showPlate} onChanged={v => update('showPlate', v)} />
      {s.showPlate ? <TextField title="自定义车牌" value={s.plate} onChanged={v => update('plate', v)} prompt="留空使用接口车牌" /> : null}
      <Toggle title="隐藏地址一行" value={s.hideLocationRow} onChanged={v => update('hideLocationRow', v)} />
      {s.hideLocationRow ? null : <>
        <Toggle title="显示车辆地址" value={s.showAddress} onChanged={v => update('showAddress', v)} />
        {!s.showAddress ? <TextField title="替代短句" value={s.quote} onChanged={v => update('quote', v)} /> : null}
      </>}
      {size === 'small' || size === 'medium' ? <Toggle title="显示状态图标" value={s.showIcons} onChanged={v => update('showIcons', v)} /> : null}
      <Toggle title="显示车外温度" value={s.showTemp} onChanged={v => update('showTemp', v)} />
    </Section>
  </>)
}
function CardContentScreen({ size }: { size: WidgetSize }) {
  const { s, update } = usePreferences(size)
  function slots(key: 'metricSlots' | 'stateSlots') {
    return s[key].map((value, index) => <Picker key={index} title={'第 ' + (index + 1) + ' 个位置'} value={value} onChanged={(v: string) => {
      const latest = settingsForSize(readSettings(), size)
      const values = [...latest[key]]; values[index] = v; update(key, values)
    }}>{INFO_OPTIONS.filter(item => supportsTires() || !item.id.startsWith('tire')).map(item => <Text key={item.id} tag={item.id}>{item.name}</Text>)}</Picker>)
  }
  return page(SIZE_NAMES[size] + ' · 信息卡片', <>
    <Section footer={<Text>选择“不显示”会移除该位置，其余卡片自动排列。没有接口读数的信息显示“未知”或“--”，不会补入示例数据。</Text>}><Text>只修改当前尺寸的信息卡片。</Text></Section>
    <Section header={<Text>数据卡片 · 最多 4 项</Text>}><Toggle title="显示数据卡片" value={s.showMetrics} onChanged={v => update('showMetrics', v)} />{s.showMetrics ? slots('metricSlots') : null}</Section>
    <Section header={<Text>状态卡片 · 最多 6 项</Text>}><Toggle title="显示状态卡片" value={s.showStates} onChanged={v => update('showStates', v)} />{s.showStates ? slots('stateSlots') : null}</Section>
    <Section header={<Text>其他区域</Text>}>
      {supportsTires() ? <Toggle title="显示四轮胎压栏" value={s.showTires} onChanged={v => update('showTires', v)} /> : null}
      <Toggle title="显示位置 / 短句卡片" value={s.showLocationCard} onChanged={v => update('showLocationCard', v)} />
      <Toggle title="显示用车提醒" value={s.showReminders} onChanged={v => update('showReminders', v)} />
    </Section>
  </>)
}
function AppearanceScreen({ size }: { size: WidgetSize }) {
  const { s, update, patch } = usePreferences(size)
  /**
   * 主题下拉：选预设直接写；选「自定义…」弹调色盘，预填当前主题的三个色，
   * 确认后一次性把 theme + 三个色写进去，取消则什么都不改。
   */
  async function pickTheme(value: string) {
    if (value !== CUSTOM_THEME_ID) { update('theme', value); return }
    const current = themeOf(s)
    const result = { value: null as CustomTheme | null }
    await Navigation.present({ element: <CustomThemeSheet initial={{ colors: current.colors, accent: current.accent }} onPicked={theme => { result.value = theme }} /> })
    const picked = result.value
    if (picked) await patch({ theme: CUSTOM_THEME_ID, themeColor1: picked.color1, themeColor2: picked.color2, themeAccent: picked.accent })
  }
  const themePreview: any = { gradient: themeOf(s).colors.map((color, i) => ({ color, location: i })), startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }
  type ColorKey = 'fontColor' | 'buttonBackgroundColor' | 'buttonIconOnColor' | 'buttonIconOffColor' | 'infoBackgroundColor'
  function colorPicker(key: ColorKey, title: string) {
    const transparencyKey = key === 'infoBackgroundColor' ? 'infoBackgroundTransparency' : key === 'buttonBackgroundColor' ? 'buttonBackgroundTransparency' : null
    const value = s[key]
    // 当前值不在预设里（且不是“透明背景”）就是自定义颜色，下拉末项回显它，Picker 才能显示真实值。
    const custom = value !== 'clear' && !COLOR_PRESETS.some(color => color.value === value)
    const selection: any = custom ? CUSTOM_COLOR_TAG : value
    async function pickCustom() {
      const result = { value: null as string | null }
      await Navigation.present({ element: <CustomColorSheet initial={normalizeColor(value) || '#FFFFFF'} onPicked={color => { result.value = color }} /> })
      if (result.value) await update(key, result.value)
    }
    return <Section header={<Text>{title}</Text>} footer={transparencyKey ? <Text>透明度只影响当前背景。0% 不透明，100% 完全透明；选择“透明背景”时始终透明。</Text> : undefined}>
      <Picker title="颜色" value={selection} onChanged={(v: string) => {
        // 选“自定义…”先弹调色盘，只有确认了才写设置；取消则 Picker 退回原档位。
        if (v === CUSTOM_COLOR_TAG) { pickCustom(); return }
        update(key, v)
      }}>
        {COLOR_PRESETS.map(color => <Text key={color.value} tag={color.value}>{color.name}</Text>)}
        {transparencyKey ? <Text tag="clear">透明背景</Text> : null}
        <Text tag={CUSTOM_COLOR_TAG}>{custom ? '自定义 ' + value : '自定义…（调色盘）'}</Text>
      </Picker>
      {transparencyKey ? <NumberPicker title="背景透明度" value={s[transparencyKey] ?? -1} options={[-1, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} min={0} max={100}
        hint="0 – 100 %，0 不透明、100 完全透明" label={v => v < 0 ? '默认（保持原效果）' : v + '%' + (v === 0 ? '（不透明）' : v === 100 ? '（完全透明）' : '')}
        onChanged={v => update(transparencyKey, v === -1 ? null : v)} /> : null}
    </Section>
  }
  return page(SIZE_NAMES[size] + ' · 字体与配色', <>
    <Section header={<Text>主题</Text>} footer={<Text>选中项下方是当前配色的渐变预览。自定义配色按尺寸保存，切回预设不会丢掉，下次选「自定义…」可接着调。</Text>}>
      <Picker title="主题配色" value={s.theme} onChanged={(v: string) => pickTheme(v)}>
        {THEMES.map(t => <Text key={t.id} tag={t.id}>{t.name}</Text>)}
        <Text tag={CUSTOM_THEME_ID}>{s.theme === CUSTOM_THEME_ID ? '自定义配色' : '自定义…（调色盘）'}</Text>
      </Picker>
      {s.theme === CUSTOM_THEME_ID ? <Button title="编辑自定义配色" action={() => pickTheme(CUSTOM_THEME_ID)} /> : null}
      <RoundedRectangle cornerRadius={10} fill={themePreview} frame={{ height: 44 }} />
    </Section>
    <Section header={<Text>字体大小</Text>} footer={<Text>只调整当前尺寸的文字。未锁车或发动机运行时，状态文字优先显示橙色。</Text>}>
      <NumberPicker title="组件字体大小" value={s.fontScale} options={[80, 90, 100, 110, 120]} min={60} max={200} hint="60 – 200 %"
        label={v => v + '%' + (v === 100 ? '（默认）' : '')} onChanged={v => update('fontScale', v)} />
      <Text font={fontSizeOf(s, 16)}>{'字号预览 · ' + s.fontScale + '%'}</Text>
    </Section>
    {size === 'medium' ? <Section header={<Text>油量进度条</Text>} footer={<Text>只影响中号组件里油量文字下方的进度条；长度超过文字栏宽度时会自动收窄，避免顶到右侧车图。</Text>}>
      <NumberPicker title="进度条长度" value={s.barWidth} options={[50, 60, 70, 80, 94, 110, 130, 150, 170, 190, 220]} min={20} max={400} hint="20 – 400 pt"
        label={v => v + ' pt' + (v === 94 ? '（默认）' : '')} onChanged={v => update('barWidth', v)} />
      <NumberPicker title="进度条粗细" value={s.barHeight} options={[2, 3, 4, 5, 6, 8, 10, 12]} min={1} max={40} hint="1 – 40 pt"
        label={v => v + ' pt' + (v === 3 ? '（默认）' : '')} onChanged={v => update('barHeight', v)} />
    </Section> : null}
    {colorPicker('fontColor', '组件字体颜色')}
    {size === 'large' || size === 'extraLarge' ? colorPicker('infoBackgroundColor', '信息卡片背景颜色') : null}
    {colorPicker('buttonBackgroundColor', '按钮背景颜色')}
    {colorPicker('buttonIconOnColor', '图标未激活状态颜色')}
    {colorPicker('buttonIconOffColor', '图标激活状态颜色')}
    <Section footer={<Text>{'图标会随车辆状态切换两套图形（如已锁车 / 未锁车）。颜色只有未激活、激活两档，都留空时用主题色（未激活留空走各按钮原色，激活留空是白色）。空调按钮开/关共用同一枚四叶片图形，只靠颜色区分：关闭时用上面一行的颜色，开启后转下面一行的颜色（留空即白色）。'}</Text>}><Text>{'小号、中号按钮只有图形；大号、超大号可在“快捷按钮”里打开图标下方的两字说明。'}</Text></Section>
  </>)
}
function ImagesScreen({ size }: { size: WidgetSize }) {
  const { s, update, patch } = usePreferences(size), backgroundKey = BACKGROUND_KEYS[size]
  async function picture(key: 'carImage' | typeof backgroundKey) {
    try {
      const photo = (await Photos.pickPhotos(1))[0]
      if (!photo) return
      // 按组件实际像素缩放后再存：组件解码的内存由图片像素决定，先缩再存最省。
      const path = await saveWidgetImage(photo, key, size)
      await update(key, path)
    } catch (e) { await Dialog.alert({ title: '选择图片失败', message: String(e) }) }
  }
  // 旧版本存的是 1000×1000 PNG，进这个页面时静默重存成按组件像素压过的版本。
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const current = settingsForSize(readSettings(), size)
        const keys: ImageKey[] = current.carImage ? ['carImage', backgroundKey] : [backgroundKey]
        const updates: Record<string, string> = {}
        for (const key of keys) {
          const before = key === 'carImage' ? current.carImage : current[backgroundKey]
          if (!before) continue
          const saved = await compactSavedImage(before, key, size)
          if (!saved) continue
          // 处理期间用户可能刚换了新图，只在原值没变时才回写。
          const latest = settingsForSize(readSettings(), size)
          const now = key === 'carImage' ? latest.carImage : latest[backgroundKey]
          if (now === before) updates[key] = saved
        }
        if (alive && Object.keys(updates).length) await patch(updates as Partial<WidgetOptions>)
      } catch { /* 旧图处理失败就保持原样，不影响设置页 */ }
    })()
    return () => { alive = false }
  }, [])
  return page(SIZE_NAMES[size] + ' · 车图与背景', <>
    <Section header={<Text>车辆图片</Text>} footer={<Text>用于组件内的车辆图片；关闭“车辆中心”里的奥迪 Logo 后，页面顶部显示的是中号组件的这张图。页面里的图片大小在“车辆中心”里单独调。</Text>}>
      <NumberPicker title="车图大小" value={s.carScale} options={[60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 200]} min={30} max={300} hint="30 – 300 %"
        label={v => v + '%' + (v === 100 ? '（默认）' : '')} onChanged={v => update('carScale', v)} />
      <Button title={s.carImage ? '更换车辆图片' : '选择车辆图片'} action={() => picture('carImage')} />
      {s.carImage ? <Button title="清除自定义车辆图片" action={() => update('carImage', '')} /> : null}
    </Section>
    <Section header={<Text>组件背景</Text>} footer={size === 'extraLarge' ? <Text>未设置图片时沿用升级前的大号背景。</Text> : undefined}>
      <Button title={s[backgroundKey] ? '更换背景图片' : '选择背景图片'} action={() => picture(backgroundKey)} />
      {s[backgroundKey] ? <Button title="清除背景图片" action={() => update(backgroundKey, '')} /> : null}
      <NumberPicker title="背景压暗程度" value={s.backgroundDim} options={[0, 10, 20, 30, 40, 50, 60, 70]} min={0} max={100} hint="0 – 100 %"
        label={v => v === 0 ? '原图 · 无蒙层' : v + '%'} onChanged={v => update('backgroundDim', v)} />
    </Section>
  </>)
}
// 一键类动作没有开关两态，组件里固定用激活色，预览也只给这一种。
const ONE_KEY_ACTIONS = ['find', 'refresh', 'cool', 'hot']
function iconColorOf(s: Settings, id: string, state: boolean) {
  const active = iconActive(id, state)
  // 白 = 未点亮：未激活色没设时就用纯白。
  const fallback = id === 'seat' ? (active ? '#7DD3FC' : '#FDBA74') : (active ? buttonIconTint(id, themeOf(s).accent) : '#FFFFFF')
  return buttonIconColorOf(s, active, fallback)
}
/** 近白判断：白（含纯白、留空回退）算未点亮，其余彩色算点亮。 */
function isWhiteish(color: string) {
  const v = String(color || '').trim().toLowerCase()
  if (!v || v === 'white' || v === '#fff' || v === '#ffffff' || v === 'rgb(255,255,255)') return true
  const hex = /^#([0-9a-f]{6})$/.exec(v)
  if (!hex) return false
  const n = parseInt(hex[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return Math.min(r, g, b) >= 230 && Math.max(r, g, b) - Math.min(r, g, b) <= 14
}
/**
 * 图标下方那两字，与组件 dashboardButtons 的 buttonCaption 一致：[未生效, 已生效]。
 * 已生效时组件画的是“再点一下会发生什么”，所以锁车 / 解锁这类是反的，预览按同样口径。
 */
const BUTTON_CAPTIONS: Record<string, [string, string]> = {
  refresh: ['刷新', '刷新'], lock: ['锁车', '解锁'], window: ['开窗', '关窗'],
  engine: ['启动', '熄火'], find: ['寻车', '寻车'], cool: ['冷车', '冷车'],
  hot: ['热车', '热车'], ac: ['空调', '空调'], trunk: ['尾门', '尾门'], seat: ['加热', '加热'],
}
/**
 * 按钮图标预览：形状、尺寸全部复用组件里的规则（iconActive / buttonIconTint / buttonIconColorOf），
 * 所以这里看到的就是小组件上真实画出来的图标，改完立刻能对照。
 * plain=true 用于“图标线条粗细”那一栏：颜色固定白色、底衬固定深色，只比粗细不比配色。
 * 传了 widgetSize 的是按钮设置页里的预览：高度、圆角、文字全部跟上方控件同步。
 */
function ButtonIconPreview({ s, id, state, color, caption, plain, widgetSize }: { s: Settings; id: string; state: boolean; color: string; caption?: string; plain?: boolean; widgetSize?: WidgetSize }) {
  // 按钮高度按组件同一口径算，改上方“按钮高度 / 按钮圆角”预览立刻跟着变：
  // 大号 / 超大号按钮至少 20pt（开文字 28pt），小号 / 中号就是设置值本身。
  // 不传 widgetSize 的（“图标线条粗细”那一栏，一行六枚）保持固定尺寸，否则高度拉到 80 会把行撑爆。
  const setting = buttonHeightOf(s)
  const baseHeight = !widgetSize
    ? Math.min(40, Math.max(26, setting))
    : widgetSize === 'large' || widgetSize === 'extraLarge'
      ? Math.max(caption ? 28 : 20, setting)
      : setting
  const height = caption ? Math.max(28, baseHeight) : baseHeight
  // 宽度跟着高度长，但到 76pt 就封顶：高度再往上只变高不变宽（形状变化更直观，也不会撑破列表行）。
  const width = Math.min(76, Math.round(height * 1.55))
  const radius = buttonRadiusOf(s, height, 11)
  // 与组件 dashboardButtons 同一套算法：先扣掉文字高度，剩下多少给图标。
  const labelFont = fontSizeOf(s, height < 36 ? 8 : 9)
  const labelHeight = Math.ceil(labelFont * 1.25)
  // 图标上限跟组件一致（30）：按钮高到 50–80 时图标也长，而不是停在 20。
  const iconMax = widgetSize ? 30 : 20
  const iconBase = Math.min(iconMax, Math.max(11, Math.min(height * 0.6, width - 9)))
  const size = caption ? Math.max(10, Math.min(iconBase, height - labelHeight - 4)) : iconBase
  // 线条粗细是全局设置，预览也跟着变（实心图标无视这个值）。
  const lineWidth = buttonIconLineWidthOf(s)
  // fill 只接受 Color，但同组件里传颜色字符串是既有写法（类型定义比运行时窄）。
  const background: any = plain ? 'rgba(22,28,40,0.92)' : buttonBackgroundOf(s)
  const icon = <SVG code={buttonIconSVG(id, state, color, lineWidth)} resizable renderingMode="original" frame={{ width: size, height: size }} />
  return <ZStack frame={{ width, height }}>
    <RoundedRectangle cornerRadius={radius} fill="rgba(22,28,40,0.92)" frame={{ width, height }} />
    <RoundedRectangle cornerRadius={radius} fill={background} frame={{ width, height }} />
    {caption
      ? <VStack alignment="center" spacing={1} frame={{ width, height }}>
          {icon}
          <Text font={labelFont} fontWeight="medium" foregroundStyle="rgba(255,255,255,0.82)" lineLimit={1} minScaleFactor={0.6} frame={{ height: labelHeight }}>{caption}</Text>
        </VStack>
      : icon}
  </ZStack>
}
/** 一行图标预览：tile 之间用 Spacer 均分空余宽度，最后一个贴右边，行尾不会留空白。 */
function iconPreviewRow(s: Settings, items: { id: string; state: boolean }[]) {
  const nodes: any[] = []
  items.forEach((t, i) => {
    if (i > 0) nodes.push(<Spacer key={'gap' + i} minLength={10} />)
    nodes.push(<ButtonIconPreview key={t.id + String(t.state)} s={s} id={t.id} state={t.state} color="#FFFFFF" plain />)
  })
  return <HStack spacing={0} frame={{ maxWidth: 'infinity' }}>{nodes}</HStack>
}
function ButtonIconRow({ s, id, size }: { s: Settings; id: string; size: WidgetSize }) {
  // 白色 = 未点亮（用户口径）：白的那格排左边。
  // 大号 / 超大号开了“图标下方显示文字”时，预览也画出那两字，跟组件上完全一致。
  const captions = s.showButtonLabels && (size === 'large' || size === 'extraLarge') ? BUTTON_CAPTIONS[id] : undefined
  const tiles = (ONE_KEY_ACTIONS.includes(id) ? [false] : [false, true])
    .map(state => ({ state, color: iconColorOf(s, id, state) }))
    .map(t => ({ ...t, white: isWhiteish(t.color) }))
    .sort((a, b) => Number(b.white) - Number(a.white))
  return <HStack spacing={10}>
    {tiles.map(t => <ButtonIconPreview key={String(t.state)} s={s} id={id} state={t.state} color={t.color} widgetSize={size} caption={captions?.[t.state ? 1 : 0]} />)}
  </HStack>
}
function ButtonsScreen({ size }: { size: WidgetSize }) {
  const { s, update } = usePreferences(size)
  return page(SIZE_NAMES[size] + ' · 快捷按钮', <>
    <Section footer={<Text>每个按钮分别设置功能与二次确认，默认直接执行。开启后先在小组件内显示“确认 / 取消”，点击确认才执行；显示后 10 秒内没有点击，这条指令就作废、不会执行（不会自动跳回，点取消或确认即刻返回车况）。“空白”不显示或执行按钮。功能为“座椅加热”的按钮会在二次确认下面多出挡位选择（1 / 2 / 3）：每个按钮各记一份，也随尺寸分别保存；开启时按该挡位下发，关闭时固定 flag 0、type 0。</Text>}>
      <Picker title="显示按钮数量" value={s.buttonCount} onChanged={(v: any) => update('buttonCount', Math.round(Number(v)))}>{DEFAULTS.buttons.map((_, i) => <Text key={i + 1} tag={i + 1}>{i + 1} 个</Text>)}</Picker>
      <NumberPicker title="按钮高度" value={s.buttonHeight} options={[22, 26, 31, 36, 44, 50]} min={14} max={80} hint="14 – 80 pt"
        label={v => v + ' pt' + (v === defaultButtonHeightFor(size) ? '（默认）' : '')} onChanged={v => update('buttonHeight', v)} />
      <NumberPicker title="按钮圆角" value={s.buttonRadius} options={[-1, 0, 3, 6, 8, 10, 12, 14, 16, 20, 24, 30]} min={-1} max={60}
        hint="自动填 -1，自定义 0 – 60 pt" label={v => v < 0 ? '自动（随高度）' : v === 0 ? '直角' : v + ' pt'} onChanged={v => update('buttonRadius', v)} />
      {size === 'large' || size === 'extraLarge' ? <Toggle title="图标下方显示文字" value={s.showButtonLabels} onChanged={v => update('showButtonLabels', v)} /> : null}
    </Section>
    {/* 只列出当前显示的按钮（前 buttonCount 个），收起的那几个仍原样存在 buttons 里，调回去就恢复。 */}
    {visibleButtons(s).map((value, index) => <Section key={index} header={<Text>{'第 ' + (index + 1) + ' 个按钮'}</Text>}>
      <Picker title="按钮功能" value={value} onChanged={(v: string) => {
        const buttons = [...settingsForSize(readSettings(), size).buttons]; buttons[index] = v; update('buttons', buttons)
      }}>{ACTIONS.map(action => <Text key={action.id} tag={action.id}>{action.name}</Text>)}</Picker>
      {value !== 'blank' ? <ButtonIconRow s={s} id={value} size={size} /> : null}
      {value !== 'blank' ? <Toggle title="二次确认" value={s.buttonConfirmations[index]} onChanged={(v: boolean) => {
        const flags = [...settingsForSize(readSettings(), size).buttonConfirmations]; flags[index] = v; update('buttonConfirmations', flags)
      }} /> : <Text font={11} foregroundStyle="#7A8494">空白位置不执行操作。</Text>}
      {/* 只有功能为「座椅加热」的按钮才出现挡位选择：每个槽位各存一份，写的是本尺寸的设置（跟 buttons 一样）。 */}
      {value === 'seat' ? <Picker title="加热挡位" value={seatLevelOf(s, index)} onChanged={(v: any) => {
        const levels = [...settingsForSize(readSettings(), size).seatLevels]; levels[index] = asSeatLevel(v); update('seatLevels', levels)
      }}>
        {SEAT_LEVELS.map(level => <Text key={level} tag={level}>{level} 挡</Text>)}
      </Picker> : null}
      {value === 'engine' || value === 'cool' || value === 'hot' ? <NumberPicker title="运行时间" value={engineTimeOf(s, index)} options={[5, 10, 15, 20, 25, 30]} min={ENGINE_TIME_MIN} max={ENGINE_TIME_MAX}
        hint={'1 – ' + ENGINE_TIME_MAX + ' 分钟（车机上限）'} label={v => v + ' 分钟' + (v === defaultEngineTimeFor(value) ? '（默认）' : '')} onChanged={v => {
          const times = [...settingsForSize(readSettings(), size).engineTimes]; times[index] = v; update('engineTimes', times)
        }} /> : null}
    </Section>)}
  </>)
}
function RefreshScreen({ size }: { size: WidgetSize }) {
  const { s, update } = usePreferences(size)
  return page(SIZE_NAMES[size] + ' · 刷新设置', <Section footer={<Text>间隔为期望时间，实际刷新由系统调度。相对时间以最近成功获取车况为准，在组件重新绘制时更新。</Text>}>
    <Picker title="刷新时间显示" value={s.updateTimeStyle} onChanged={(v: any) => update('updateTimeStyle', v as 'absolute' | 'relative' | 'full')}><Text tag="absolute">智能日期 · 更新于 09:05（非当天补日期）</Text><Text tag="full">完整日期 · 更新于 2026/10/23 09:05</Text><Text tag="relative">相对时间 · 刷新于 5 分钟前</Text></Picker>
    <Toggle title="组件自动获取车况" value={s.autoRefresh} onChanged={v => update('autoRefresh', v)} />
    <NumberPicker title="期望刷新间隔" value={s.refreshMinutes} options={[15, 30, 60, 120]} min={5} max={1440} hint="5 – 1440 分钟"
      label={v => v + ' 分钟'} onChanged={v => update('refreshMinutes', v)} />
  </Section>)
}
const REMINDER_KEYS = [
  { key: 'maintenanceDate', label: '保养', fallbackDays: 365 },
  { key: 'insuranceDate', label: '保险', fallbackDays: 365 },
  { key: 'inspectionDate', label: '年检', fallbackDays: 730 }
] as const
function ReminderScreen() {
  const { s, update } = usePreferences()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayTs = today.getTime()
  // 可选范围：往前五年到往后十年（逾期的旧日期仍可选中，不会被夹到今天）
  const startTs = new Date(today.getFullYear() - 5, 0, 1).getTime()
  const endTs = new Date(today.getFullYear() + 10, 11, 31).getTime()
  /** 第一次设置时给个合理默认：从今天往后推（保养 / 保险 1 年，年检 2 年）。 */
  function defaultTs(days: number) { return todayTs + days * 86400000 }
  async function editDate(item: typeof REMINDER_KEYS[number]) {
    const saved = dateValue(s[item.key])
    const draft = saved === null ? defaultTs(item.fallbackDays) : saved
    await Navigation.present({ element: <ReminderDatePicker
      title={item.label + '到期日期'}
      value={draft}
      startTs={startTs}
      endTs={endTs}
      onChange={v => update(item.key, dateText(v))}
      onClear={() => update(item.key, '')}
    /> })
  }
  return page('用车提醒', <>
    <Section footer={<Text>点击日期打开滚轮调整；清除日期就不再提醒这一项。</Text>}>
      {REMINDER_KEYS.map(item => (
        <Button key={item.key} title={item.label + '日期：' + (s[item.key] || '未设置')} action={() => editDate(item)} />
      ))}
    </Section>
    <Section footer={<Text>日期和里程在各尺寸间共用。可在大号 / 超大号的信息卡片页面分别开关显示。</Text>}>
      <TextField title="下次保养总里程（km）" value={s.maintenanceKm} keyboardType="numberPad" onChanged={v => update('maintenanceKm', v.replace(/[^0-9]/g, ''))} />
    </Section>
  </>)
}
/** 日期滚轮弹窗：先滚动选，保存才落盘（不保存就不动原值）。 */
function ReminderDatePicker({ title, value, startTs, endTs, onChange, onClear }: {
  title: string; value: number; startTs: number; endTs: number; onChange: (value: number) => void; onClear: () => void
}) {
  const dismiss = Navigation.useDismiss()
  const [draft, setDraft] = useState(value)
  return <NavigationStack><List navigationTitle={title}>
    <Section footer={<Text>{dateText(draft)}</Text>}>
      <DatePicker title="日期" value={draft} startDate={startTs} endDate={endTs} displayedComponents={['date']} datePickerStyle="wheel" onChanged={(v: number) => setDraft(v)} />
    </Section>
    <Section>
      <Button title="保存日期" action={() => { onChange(draft); dismiss() }} />
    </Section>
    <Section>
      <Button title="清除日期（不再提醒）" action={() => { onClear(); dismiss() }} />
      <Button title="取消" action={dismiss} />
    </Section>
  </List></NavigationStack>
}
function BackupScreen() {
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(lastBackupAt())
  async function backup() {
    if (busy) return
    setBusy(true)
    try {
      const result = await backupToFile()
      if (!result) return
      setLast(result.savedAt)
      await Dialog.alert({
        title: '备份已导出',
        message: result.name + '\n包含 ' + result.images + ' 张自定义图片' + (result.hasAccount ? '、授权 Token' : '') + (result.hasAMapKey ? '、高德 Key' : '') + '。\n未导出的话，可在“文件”App 的下载项里重试保存。'
      })
    } catch (e) {
      await Dialog.alert({ title: '备份失败', message: String(e) })
    } finally {
      setBusy(false)
    }
  }
  async function restore() {
    if (busy) return
    const ok = await Dialog.confirm({
      title: '从文件恢复设置',
      message: '恢复会覆盖当前所有设置、用车提醒与油价设置，并立即刷新组件。如果备份里包含 Token 与高德 Key，也会一并覆盖。建议先备份一次当前设置。',
      confirmLabel: '选择文件',
      cancelLabel: '取消'
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await restoreFromFile()
      if (!result) return
      Widget.reloadAll()
      await Dialog.alert({
        title: '恢复完成',
        message: '已恢复组件设置' + (result.profiles ? '与 ' + result.profiles + ' 个尺寸的独立配置' : '') + (result.hasOil ? '、油价设置' : '') + (result.hasAccount ? '、授权 Token' : '') + (result.hasAMapKey ? '、高德 Key' : '') + (result.images ? '，并写入 ' + result.images + ' 张图片' : '') + '。' + (result.kept ? '备份里没有的 ' + result.kept + ' 项设置已保留本机值。' : '') + '\n返回后重新打开组件设置即可看到新的设置值。'
      })
    } catch (e) {
      await Dialog.alert({ title: '恢复失败', message: String(e) })
    } finally {
      setBusy(false)
    }
  }
  async function resetAll() {
    await Navigation.present({ element: <ResetConfirmation title="恢复全部显示设置" detail="将清除四种尺寸的独立配置、原有显示设置和用车提醒。Token 与高德 Key 保留。" onReset={() => { saveSettings({ ...DEFAULTS }); Widget.reloadAll() }} /> })
  }
  return page('备份/恢复', <>
    <Section header={<Text>备份</Text>} footer={<Text>备份文件为 zip 压缩包，包含四种尺寸的独立配置（主题、字体、按钮图标颜色、按钮高度、圆角、图标下方文字说明、指标与状态位等）、通用显示设置、用车提醒、油价设置（地区、油号、油箱容量等）、授权 Token、高德 Key，以及自定义车图与背景图。文件里的 Token 与高德 Key 是明文，请妥善保管，不要随意外发。</Text>}>
      <Button title={busy ? '正在处理…' : '备份所有设置到文件'} action={backup} />
      <Text>{last ? '上次备份：' + updateText(last).replace('更新于 ', '') : '还没有备份过'}</Text>
    </Section>
    <Section header={<Text>恢复</Text>} footer={<Text>选择本脚本导出的备份文件（.zip）。恢复逐项覆盖：备份里有的设置项才会盖掉本机值，备份里没有的项（例如未包含 Token，或用旧版本脚本备份时还没加入的按钮高度、图标下方文字说明等）会保留当前值。文件损坏或不是本脚本的备份时不会改动任何数据。</Text>}>
      <Button title={busy ? '正在处理…' : '从文件恢复设置'} action={restore} />
    </Section>
    <Section header={<Text>恢复默认</Text>} footer={<Text>只清除显示相关设置：四种尺寸的独立配置、原有显示设置与用车提醒，授权 Token 与高德 Key 保留。想连授权一起恢复，请用上面的备份文件。</Text>}>
      <Button title="恢复全部显示设置" action={resetAll} />
    </Section>
  </>)
}
function ResetConfirmation({ title, detail, onReset }: { title: string; detail: string; onReset: () => void }) {
  const dismiss = Navigation.useDismiss()
  return <NavigationStack><List navigationTitle={title}><Text>{detail}</Text><Button title="确认恢复" action={async () => {
    try { onReset(); dismiss() } catch (e) { await Dialog.alert({ title: '恢复失败', message: String(e) }) }
  }} /><Button title="取消" action={dismiss} /></List></NavigationStack>
}
