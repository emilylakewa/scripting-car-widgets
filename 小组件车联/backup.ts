import { Path, Script } from 'scripting'
import { DEFAULTS, normalizeProfiles, normalizeSettings, readSettings, saveSettings, type Settings } from './settings'
import { normalizeOilSettings, readOilSettings, saveOilSettings } from './oil-price'
import { importAccount, readAMapKey, readAccount, saveAMapKey } from './credentials'
import { assetDirectory } from './image-assets'

/**
 * 备份文件是一个 zip：根目录的 carlink-settings.json 保存所有设置，
 * images/ 里放自定义车图与背景图。恢复时把图写回当前设备的图片目录，
 * 并把设置里的图片路径换成本机路径，所以换设备也能用。
 */
const FORMAT = 'carlink.backup'
const FORMAT_VERSION = 1
const DATA_FILE = 'carlink-settings.json'
const IMAGE_DIR = 'images'
const LAST_KEY = 'carlink.backup.last.v1'
const IMAGE_EXT = /\.(?:png|jpe?g|heic|webp)$/i
const AMAP_KEY_PATTERN = /^[a-f0-9]{32}$/i

export type BackupResult = { name: string; images: number; hasAccount: boolean; hasAMapKey: boolean; savedAt: number }
// profiles = 恢复了几种尺寸的独立配置；kept = 备份里没有、因此保留本机值的新参数个数。
export type RestoreResult = { images: number; hasOil: boolean; hasAccount: boolean; hasAMapKey: boolean; profiles: number; kept: number }

export function lastBackupAt(): number {
  try {
    const value = Number(Storage.get<number>(LAST_KEY))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch { return 0 }
}

function stampText(now = Date.now()): string {
  const d = new Date(now)
  const pad = (v: number) => String(v).padStart(2, '0')
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes())
}

/** 递归找设置里引用到的图片：只认绝对路径 + 图片后缀，不含脚本自带的 car.png 之类以外的误判风险。 */
function collectImages(value: any, out: Set<string>): void {
  if (typeof value === 'string') {
    if (value.charAt(0) === '/' && IMAGE_EXT.test(value)) out.add(value)
    return
  }
  if (Array.isArray(value)) { value.forEach(item => collectImages(item, out)); return }
  if (value && typeof value === 'object') { for (const key of Object.keys(value)) collectImages((value as any)[key], out) }
}

/** 把设置里指向旧图片路径的字符串换成本机新路径；按文件名匹配，命不中就原样保留。 */
function rewritePaths(value: any, map: Map<string, string>): any {
  if (typeof value === 'string') return map.get(Path.basename(value)) || value
  if (Array.isArray(value)) return value.map(item => rewritePaths(item, map))
  if (value && typeof value === 'object') {
    const out: any = {}
    for (const key of Object.keys(value)) out[key] = rewritePaths(value[key], map)
    return out
  }
  return value
}

async function removeQuietly(path: string): Promise<void> {
  try { await FileManager.remove(path) } catch { /* 临时目录清理失败不影响结果 */ }
}

/**
 * 恢复时按“键”合并，而不是整包覆盖：
 * - 备份里真正存过的键才覆盖，并且先过一遍归一化（按钮高度、图标下方文字说明、圆角、颜色等新参数都按合法范围校验）；
 * - 旧备份里没有的键保留本机当前值，避免“恢复一次把新设置打回默认”；
 * - 四种尺寸的独立配置按尺寸逐个合并，同样缺什么留什么。
 */
function mergeRestored(current: Settings, raw: any): { settings: Settings; profiles: number; kept: number } {
  const incoming = normalizeSettings(raw)
  const merged: any = { ...current }
  let kept = 0
  for (const key of Object.keys(DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) merged[key] = (incoming as any)[key]
    else kept += 1
  }
  const profiles: any = { ...(current.profiles ?? {}) }
  const normalized = normalizeProfiles(raw.profiles)
  const restored: string[] = Object.keys(normalized ?? {})
  for (const size of restored) {
    profiles[size] = { ...((current.profiles as any)?.[size] ?? {}), ...(normalized as any)[size] }
  }
  merged.profiles = profiles
  return { settings: normalizeSettings(merged), profiles: restored.length, kept }
}

export async function backupToFile(): Promise<BackupResult | null> {
  const settings = readSettings()
  const oil = readOilSettings()
  const account = readAccount()
  const amapKey = readAMapKey()
  const workspace = Path.join(FileManager.temporaryDirectory, 'carlink-backup-' + Date.now())
  const imagesDir = Path.join(workspace, IMAGE_DIR)
  try {
    await FileManager.createDirectory(imagesDir, true)
    const images: string[] = []
    const sources = new Set<string>()
    collectImages(settings, sources)
    for (const source of sources) {
      if (!FileManager.existsSync(source)) continue
      const name = Path.basename(source)
      if (images.includes(name)) continue
      await FileManager.copyFile(source, Path.join(imagesDir, name))
      images.push(name)
    }
    const payload = {
      format: FORMAT,
      version: FORMAT_VERSION,
      script: Script.metadata.version || '',
      exportedAt: Date.now(),
      settings,
      oil,
      account,
      amapKey,
      images
    }
    await FileManager.writeAsString(Path.join(workspace, DATA_FILE), JSON.stringify(payload, null, 2))

    const zipPath = Path.join(FileManager.temporaryDirectory, 'carlink-backup-' + Date.now() + '.zip')
    await FileManager.zip(workspace, zipPath, false)
    const data = Data.fromFile(zipPath)
    if (!data) throw new Error('备份文件生成失败，请重试')
    const name = '车联备份-' + stampText() + '.zip'
    await DocumentPicker.exportFiles({ files: [{ data, name }] })
    await removeQuietly(zipPath)
    const savedAt = Date.now()
    Storage.set(LAST_KEY, savedAt)
    return { name, images: images.length, hasAccount: !!account, hasAMapKey: !!amapKey, savedAt }
  } finally {
    await removeQuietly(workspace)
  }
}

function findDataFile(directory: string): string | null {
  const direct = Path.join(directory, DATA_FILE)
  if (FileManager.existsSync(direct)) return direct
  // 用户重新打包时可能把内容套了一层文件夹，递归再找一次（readDirectory 返回的是相对路径）。
  const relative = FileManager.readDirectorySync(directory, true)
    .find(path => Path.basename(path) === DATA_FILE)
  if (!relative) return null
  return relative.charAt(0) === '/' ? relative : Path.join(directory, relative)
}

/** 选文件并恢复；用户取消返回 null，文件不合规时抛错（不写入任何数据）。 */
export async function restoreFromFile(): Promise<RestoreResult | null> {
  const picked = await DocumentPicker.pickFiles()
  if (!picked || !picked.length) return null
  return restoreFromArchive(picked[0])
}

/** 从 zip（或裸 json）备份里恢复；只在文件校验通过后才写设置。 */
export async function restoreFromArchive(source: string): Promise<RestoreResult> {
  const workspace = Path.join(FileManager.temporaryDirectory, 'carlink-restore-' + Date.now())
  try {
    await FileManager.createDirectory(workspace, true)
    let dataPath: string | null = null
    if (/\.json$/i.test(source)) {
      dataPath = source
    } else {
      try { await FileManager.unzip(source, workspace) }
      catch { throw new Error('无法解开这个文件，请选择本脚本导出的备份（.zip）') }
      dataPath = findDataFile(workspace)
    }
    if (!dataPath) throw new Error('这个文件里没有备份数据，请选择本脚本导出的备份文件')

    let payload: any
    try { payload = JSON.parse(await FileManager.readAsString(dataPath)) }
    catch { throw new Error('备份文件内容已损坏，无法读取') }
    if (!payload || typeof payload !== 'object' || payload.format !== FORMAT) throw new Error('这不是「小组件车联」的备份文件')
    if (Number(payload.version) > FORMAT_VERSION) throw new Error('备份文件来自更新版本的脚本，请先更新脚本再恢复')
    if (!payload.settings || typeof payload.settings !== 'object') throw new Error('备份里没有组件设置数据')

    // 先把图片落到本机目录，再把设置里的路径改过去，最后才落盘设置。
    const map = new Map<string, string>()
    const names: string[] = Array.isArray(payload.images) ? payload.images.filter((name: any) => typeof name === 'string' && !!name) : []
    if (names.length) {
      const folder = Path.join(Path.dirname(dataPath), IMAGE_DIR)
      const target = assetDirectory()
      await FileManager.createDirectory(target, true)
      for (const raw of names) {
        // 备份里的文件名来自外部文件，必须先压成纯文件名：否则 ../../ 会写到图片目录之外。
        const name = Path.basename(raw)
        if (!name || name === '.' || name === '..' || name.indexOf('/') >= 0) continue
        if (map.has(name)) continue
        const from = Path.join(folder, name)
        const to = Path.join(target, name)
        if (!FileManager.existsSync(from)) continue
        if (!FileManager.existsSync(to)) await FileManager.copyFile(from, to)
        map.set(name, to)
      }
    }

    const result = mergeRestored(readSettings(), rewritePaths(payload.settings, map))
    saveSettings(result.settings)
    // 油价设置、授权、高德 Key 各自独立：某项不合法只跳过它，已经恢复的设置不会被牵连。
    let hasOil = false, hasAccount = false
    if (payload.oil && typeof payload.oil === 'object') {
      try { saveOilSettings(normalizeOilSettings(payload.oil)); hasOil = true } catch { hasOil = false }
    }
    if (payload.account && typeof payload.account === 'object') {
      try { importAccount(payload.account); hasAccount = true } catch { hasAccount = false }
    }
    let hasAMapKey = false
    if (typeof payload.amapKey === 'string') {
      const key = payload.amapKey.trim()
      if (!key || AMAP_KEY_PATTERN.test(key)) { saveAMapKey(key); hasAMapKey = !!key }
    }
    return { images: map.size, hasOil, hasAccount, hasAMapKey, profiles: result.profiles, kept: result.kept }
  } finally {
    await removeQuietly(workspace)
  }
}
