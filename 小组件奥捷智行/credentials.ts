import { Script } from 'scripting'

const TOKEN_KEY = 'AoJieZhiXing.Authorization.' + Script.name
export function readToken(): string {
  return String(Keychain.get(TOKEN_KEY) || '').trim()
}
export function saveToken(value: string): void {
  const token = value.trim()
  if (!token) throw new Error('请输入奥捷智联 Authorization Token')
  if (/[\r\n]/.test(token)) throw new Error('Token 中不能包含换行')
  const saved = Keychain.set(TOKEN_KEY, token)
  if (saved === false) throw new Error('Token 保存失败，请重试')
  // 更新授权后清除旧快照，避免新账号沿用旧设备。
  Storage.set('aojie.car.data', null)
}
export function updateText(timestamp: number, now = Date.now(), style: 'absolute' | 'relative' = 'absolute'): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '尚未更新'
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now)) return '尚未更新'
  if (style === 'relative') {
    const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
    if (seconds < 60) return '刚刚刷新'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return '刷新于 ' + minutes + ' 分钟前'
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return '刷新于 ' + hours + ' 小时前'
    return '刷新于 ' + Math.floor(hours / 24) + ' 天前'
  }
  const today = new Date(now)
  const pad = (v: number) => String(v).padStart(2, '0')
  const time = pad(date.getHours()) + ':' + pad(date.getMinutes())
  const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
  const day = pad(date.getMonth() + 1) + '/' + pad(date.getDate())
  const year = date.getFullYear() === today.getFullYear() ? '' : date.getFullYear() + '/'
  return '更新于 ' + (sameDay ? '' : year + day + ' ') + time
}


const AMAP_KEY = 'AoJieZhiXing.AMap.WebService.' + Script.name
export function readAMapKey(): string {
  return String(Keychain.get(AMAP_KEY) || '').trim()
}
export function saveAMapKey(value: string): void {
  const key = value.trim()
  if (key && !/^[a-f0-9]{32}$/i.test(key)) throw new Error('请输入完整的高德 Web 服务 Key（32 位字母数字），或留空停用')
  if (Keychain.set(AMAP_KEY, key) === false) throw new Error('高德 Key 保存失败，请重试')
}
