import { Button, List, Navigation, NavigationLink, NavigationStack, Picker, Section, SecureField, Text, TextField, Toggle, VStack, Widget, useState, Path, Script } from 'scripting'
import { DEFAULTS, THEMES, ACTIONS, COLOR_PRESETS, INFO_OPTIONS, WIDGET_SIZES, normalizeColor, fontSizeOf, dateValue, readSettings, saveSettings, settingsForSize, withWidgetSettings, withoutWidgetSettings, type WidgetSize, type WidgetOptions } from './settings'
import { PROVIDERS, type ProviderChoice } from './providers'
import { readToken, saveToken, readAMapKey, saveAMapKey, currentProviderLabel, supportsTires } from './credentials'

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
  return { s, update }
}
function menu(title: string, subtitle: string, destination: any) {
  return <NavigationLink destination={destination}><VStack alignment="leading" spacing={4} padding={{ top: 4, bottom: 4 }}>
    <Text font={16}>{title}</Text><Text font={11} foregroundStyle="#7A8494">{subtitle}</Text>
  </VStack></NavigationLink>
}
function page(title: string, children: any) {
  return <List navigationTitle={title} navigationBarTitleDisplayMode="inline">{children}</List>
}
export function SettingsScreen() {
  const dismiss = Navigation.useDismiss()
  return <NavigationStack><List navigationTitle="组件设置" toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
    <Section header={<Text>按尺寸设置</Text>} footer={<Text>四种尺寸独立保存。原有配置会自动沿用，调整一个尺寸不会改变其他尺寸。</Text>}>
      {WIDGET_SIZES.map(size => <VStack key={size.id}>{menu(size.name, size.id === 'small' ? '信息卡片 / 油量圆环' : size.id === 'medium' ? '横向车况与快捷按钮' : '自定义信息卡片与车辆面板', <SizeSettingsScreen size={size.id} />)}</VStack>)}
    </Section>
    <Section header={<Text>通用设置</Text>}>
      {menu('授权与地图', 'Token、高德 Web 服务 Key', <AuthorizationScreen />)}
      {menu('车辆资料', '默认名称与车牌，供未单独修改的尺寸使用', <VehicleDefaultsScreen />)}
      {menu('用车提醒', '保养、保险、年检与保养里程', <ReminderScreen />)}
    </Section>
    <Section header={<Text>管理</Text>}>
      {menu('恢复设置', '恢复各尺寸与通用显示设置', <ResetAllScreen />)}
      <Text font={11} foregroundStyle="#7A8494">小组件车联 · 3.2.0</Text>
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
    <Section header={<Text>账号授权 · 自动识别</Text>} footer={<Text>填写 Authorization 完整值，保留原有前缀。保存时通过奥智联和奥捷智行的只读车辆接口识别服务。Token 保存到系统钥匙串。</Text>}>
      <Text>{hasToken ? '当前服务：' + providerLabel : '尚未配置 Token'}</Text>
      <SecureField title="Authorization Token" value={token} onChanged={setToken} prompt="粘贴完整 Token，自动识别服务" />
      <Picker title="识别方式" value={choice} onChanged={(value: ProviderChoice) => setChoice(value)}>
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
    <Section header={<Text>车辆信息</Text>}>
      <TextField title="自定义车型名称" value={s.name} onChanged={v => update('name', v)} prompt="留空使用接口名称" />
      <Toggle title="显示车牌" value={s.showPlate} onChanged={v => update('showPlate', v)} />
      {s.showPlate ? <TextField title="自定义车牌" value={s.plate} onChanged={v => update('plate', v)} prompt="留空使用接口车牌" /> : null}
      <Toggle title="显示车辆地址" value={s.showAddress} onChanged={v => update('showAddress', v)} />
      {!s.showAddress ? <TextField title="替代短句" value={s.quote} onChanged={v => update('quote', v)} /> : null}
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
  const { s, update } = usePreferences(size)
  type ColorKey = 'fontColor' | 'buttonBackgroundColor' | 'buttonTextColor' | 'buttonIconColor' | 'infoBackgroundColor'
  async function editColor(key: ColorKey, title: string) {
    const value = await Dialog.prompt({ title, defaultValue: s[key] === 'clear' ? '' : s[key], placeholder: '#RRGGBB 或 #RGB，留空恢复默认' })
    if (value == null) return
    const input = value.trim(), color = normalizeColor(input)
    if (input && !color) { await Dialog.alert({ title: '颜色格式不正确', message: '例如 #FFFFFF；留空恢复默认。' }); return }
    await update(key, color)
  }
  function colorPicker(key: ColorKey, title: string) {
    const transparencyKey = key === 'infoBackgroundColor' ? 'infoBackgroundTransparency' : key === 'buttonBackgroundColor' ? 'buttonBackgroundTransparency' : null
    return <Section header={<Text>{title}</Text>} footer={transparencyKey ? <Text>透明度只影响当前背景。0% 不透明，100% 完全透明；选择“透明背景”时始终透明。</Text> : undefined}>
      <Picker title="颜色" value={s[key]} onChanged={(v: string) => update(key, v)}>
        {COLOR_PRESETS.map(color => <Text key={color.value} tag={color.value}>{color.name}</Text>)}
        {transparencyKey ? <Text tag="clear">透明背景</Text> : null}
        {s[key] && s[key] !== 'clear' && !COLOR_PRESETS.some(color => color.value === s[key]) ? <Text tag={s[key]}>{'自定义 ' + s[key]}</Text> : null}
      </Picker>
      <Button title="输入自定义颜色" action={() => editColor(key, title)} />
      {transparencyKey ? <Picker title="背景透明度" value={s[transparencyKey] ?? -1} onChanged={(v: number) => update(transparencyKey, v === -1 ? null : v)}>
        <Text tag={-1}>默认（保持原效果）</Text>
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => <Text key={v} tag={v}>{v}%{v === 0 ? '（不透明）' : v === 100 ? '（完全透明）' : ''}</Text>)}
      </Picker> : null}
    </Section>
  }
  return page(SIZE_NAMES[size] + ' · 字体与配色', <>
    <Section header={<Text>主题</Text>}><Picker title="主题配色" value={s.theme} onChanged={(v: string) => update('theme', v)}>{THEMES.map(t => <Text key={t.id} tag={t.id}>{t.name}</Text>)}</Picker></Section>
    <Section header={<Text>字体大小</Text>} footer={<Text>只调整当前尺寸的文字。未锁车或发动机运行时，状态文字优先显示橙色。</Text>}>
      <Picker title="组件字体大小" value={s.fontScale} onChanged={(v: number) => update('fontScale', v)}>{[80, 90, 100, 110, 120].map(v => <Text key={v} tag={v}>{v}%{v === 100 ? '（默认）' : ''}</Text>)}</Picker>
      <Text font={fontSizeOf(s, 16)}>{'字号预览 · ' + s.fontScale + '%'}</Text>
    </Section>
    {colorPicker('fontColor', '组件字体颜色')}
    {size === 'large' || size === 'extraLarge' ? colorPicker('infoBackgroundColor', '信息卡片背景颜色') : null}
    {colorPicker('buttonBackgroundColor', '按钮背景颜色')}
    {colorPicker('buttonTextColor', '按钮字体颜色')}
    {colorPicker('buttonIconColor', '按钮图标颜色')}
  </>)
}
function ImagesScreen({ size }: { size: WidgetSize }) {
  const { s, update } = usePreferences(size), backgroundKey = BACKGROUND_KEYS[size]
  async function picture(key: 'carImage' | typeof backgroundKey) {
    try {
      const photo = (await Photos.pickPhotos(1))[0]
      if (!photo) return
      const thumbnail = photo.preparingThumbnail({ width: key === 'carImage' ? 600 : 1000, height: 1000 })
      if (!thumbnail) throw new Error('图片处理失败')
      const data = Data.fromPNG(thumbnail)
      if (!data) throw new Error('图片转换失败')
      const dir = Path.join(FileManager.appGroupDocumentsDirectory, 'CarLinkCustomization', encodeURIComponent(Script.name))
      await FileManager.createDirectory(dir, true)
      const path = Path.join(dir, size + '-' + key + '-' + Date.now() + '.png')
      await FileManager.writeAsData(path, data); await update(key, path)
    } catch (e) { await Dialog.alert({ title: '选择图片失败', message: String(e) }) }
  }
  return page(SIZE_NAMES[size] + ' · 车图与背景', <>
    <Section header={<Text>车辆图片</Text>}>
      <Picker title="车图大小" value={s.carScale} onChanged={(v: number) => update('carScale', v)}>{[60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160].map(v => <Text key={v} tag={v}>{v}%{v === 100 ? '（默认）' : ''}</Text>)}</Picker>
      <Button title={s.carImage ? '更换车辆图片' : '选择车辆图片'} action={() => picture('carImage')} />
      {s.carImage ? <Button title="恢复原车图片" action={() => update('carImage', '')} /> : null}
    </Section>
    <Section header={<Text>组件背景</Text>} footer={size === 'extraLarge' ? <Text>未设置图片时沿用升级前的大号背景。</Text> : undefined}>
      <Button title={s[backgroundKey] ? '更换背景图片' : '选择背景图片'} action={() => picture(backgroundKey)} />
      {s[backgroundKey] ? <Button title="清除背景图片" action={() => update(backgroundKey, '')} /> : null}
      <Picker title="背景压暗程度" value={s.backgroundDim} onChanged={(v: number) => update('backgroundDim', v)}>{[0, 10, 20, 30, 40, 50, 60, 70].map(v => <Text key={v} tag={v}>{v === 0 ? '原图 · 无蒙层' : v + '%'}</Text>)}</Picker>
    </Section>
  </>)
}
function ButtonsScreen({ size }: { size: WidgetSize }) {
  const { s, update } = usePreferences(size)
  return page(SIZE_NAMES[size] + ' · 快捷按钮', <>
    <Section footer={<Text>每个按钮分别设置功能与二次确认，默认直接执行。开启后先在小组件内显示“确认 / 取消”，点击确认才执行，60 秒内有效。“空白”不显示或执行按钮。</Text>}>
      <Picker title="显示按钮数量" value={s.buttonCount} onChanged={(v: number) => update('buttonCount', v)}>{[1, 2, 3, 4].map(count => <Text key={count} tag={count}>{count} 个</Text>)}</Picker>
    </Section>
    {s.buttons.map((value, index) => <Section key={index} header={<Text>{'第 ' + (index + 1) + ' 个按钮' + (index >= s.buttonCount ? '（当前未显示）' : '')}</Text>}>
      <Picker title="按钮功能" value={value} onChanged={(v: string) => {
        const buttons = [...settingsForSize(readSettings(), size).buttons]; buttons[index] = v; update('buttons', buttons)
      }}>{ACTIONS.map(action => <Text key={action.id} tag={action.id}>{action.name}</Text>)}</Picker>
      {value !== 'blank' ? <Toggle title="二次确认" value={s.buttonConfirmations[index]} onChanged={(v: boolean) => {
        const flags = [...settingsForSize(readSettings(), size).buttonConfirmations]; flags[index] = v; update('buttonConfirmations', flags)
      }} /> : <Text font={11} foregroundStyle="#7A8494">空白位置不执行操作。</Text>}
    </Section>)}
  </>)
}
function RefreshScreen({ size }: { size: WidgetSize }) {
  const { s, update } = usePreferences(size)
  return page(SIZE_NAMES[size] + ' · 刷新设置', <Section footer={<Text>间隔为期望时间，实际刷新由系统调度。相对时间以最近成功获取车况为准，在组件重新绘制时更新。</Text>}>
    <Picker title="刷新时间显示" value={s.updateTimeStyle} onChanged={(v: 'absolute' | 'relative') => update('updateTimeStyle', v)}><Text tag="absolute">具体时间 · 更新于 09:05</Text><Text tag="relative">相对时间 · 刷新于 5 分钟前</Text></Picker>
    <Toggle title="组件自动获取车况" value={s.autoRefresh} onChanged={v => update('autoRefresh', v)} />
    <Picker title="期望刷新间隔" value={s.refreshMinutes} onChanged={(v: number) => update('refreshMinutes', v)}>{[15, 30, 60, 120].map(v => <Text tag={v} key={v}>{v} 分钟</Text>)}</Picker>
  </Section>)
}
function ReminderScreen() {
  const { s, update } = usePreferences()
  async function editDate(key: 'maintenanceDate' | 'insuranceDate' | 'inspectionDate', title: string) {
    const text = await Dialog.prompt({ title, defaultValue: s[key], placeholder: 'YYYY-MM-DD，留空关闭' })
    if (text == null) return
    const value = text.trim()
    if (value && dateValue(value) === null) { await Dialog.alert({ title: '日期格式不正确', message: '请输入有效日期，例如 2027-06-01。' }); return }
    await update(key, value)
  }
  return page('用车提醒', <Section footer={<Text>日期和里程在各尺寸间共用。可在大号 / 超大号的信息卡片页面分别开关显示，留空关闭提醒。</Text>}>
    <Button title={'保养日期：' + (s.maintenanceDate || '未设置')} action={() => editDate('maintenanceDate', '保养到期日期')} />
    <Button title={'保险日期：' + (s.insuranceDate || '未设置')} action={() => editDate('insuranceDate', '保险到期日期')} />
    <Button title={'年检日期：' + (s.inspectionDate || '未设置')} action={() => editDate('inspectionDate', '年检到期日期')} />
    <TextField title="下次保养总里程（km）" value={s.maintenanceKm} keyboardType="numberPad" onChanged={v => update('maintenanceKm', v.replace(/[^0-9]/g, ''))} />
  </Section>)
}
function ResetAllScreen() {
  async function reset() {
    await Navigation.present({ element: <ResetConfirmation title="恢复全部显示设置" detail="将清除四种尺寸的独立配置、原有显示设置和用车提醒。Token 与高德 Key 保留。" onReset={() => { saveSettings({ ...DEFAULTS }); Widget.reloadAll() }} /> })
  }
  return page('恢复设置', <Section><Text>恢复所有组件的显示默认值，授权信息保留。</Text><Button title="恢复全部显示设置" action={reset} /></Section>)
}
function ResetConfirmation({ title, detail, onReset }: { title: string; detail: string; onReset: () => void }) {
  const dismiss = Navigation.useDismiss()
  return <NavigationStack><List navigationTitle={title}><Text>{detail}</Text><Button title="确认恢复" action={async () => {
    try { onReset(); dismiss() } catch (e) { await Dialog.alert({ title: '恢复失败', message: String(e) }) }
  }} /><Button title="取消" action={dismiss} /></List></NavigationStack>
}
