import { Script } from 'scripting'
import { detectProvider, isProvider, PROVIDERS, type ProviderId, type ProviderChoice } from './providers'

export type Account = { provider: ProviderId; token: string; generation: string }
const ACCOUNT_KEY = 'CarLink.Account.' + Script.name
export function readAccount(): Account | null {
  try {
    const value = Keychain.get(ACCOUNT_KEY)
    if (typeof value !== 'string' || !value) return null
    const record = JSON.parse(value)
    return isProvider(record?.provider) && typeof record.token === 'string' && !!record.token.trim() &&
      !/[\r\n]/.test(record.token) && typeof record.generation === 'string' && !!record.generation ? record : null
  } catch { return null }
}
export function readToken(): string { return readAccount()?.token || '' }
export function readAccountIdentity(): string {
  const account = readAccount()
  return account ? account.provider + ':' + account.generation : ''
}
export function accountIdentity(account: Account): string { return account.provider + ':' + account.generation }
export function currentProviderLabel(): string { const account = readAccount(); return account ? PROVIDERS[account.provider].label : '尚未识别服务' }
export function supportsTires(): boolean { return readAccount()?.provider === 'aojie' }
export function requireAccount(): Account {
  const account = readAccount()
  if (!account) throw new Error('请先在授权与地图中填写 Token 并自动识别服务')
  return account
}
export function assertCurrentAccount(account: Account): void {
  if (readAccountIdentity() !== accountIdentity(account) || readToken() !== account.token) throw new Error('授权或服务已变化，请重新刷新车况')
}
let saveAttempt = 0
export async function saveToken(value: string, choice: ProviderChoice = 'auto'): Promise<ProviderId> {
  const attempt = ++saveAttempt
  const token = value.trim()
  if (!token) throw new Error('请输入完整 Authorization Token')
  if (/[\r\n]/.test(token)) throw new Error('Token 中不能包含换行')
  const before = readAccountIdentity()
  const provider = await detectProvider(token, choice)
  if (attempt !== saveAttempt || before !== readAccountIdentity()) throw new Error('授权设置已更新，请重新操作')
  const account: Account = { provider, token, generation: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) }
  // A single Keychain record changes provider and token together. Failed detection never changes it.
  if (Keychain.set(ACCOUNT_KEY, JSON.stringify(account)) === false) throw new Error('Token 保存失败，请重试')
  if (readAccountIdentity() !== accountIdentity(account)) throw new Error('Token 保存失败，请重试')
  return provider
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


const AMAP_KEY = 'CarLink.AMap.WebService.' + Script.name
export function readAMapKey(): string {
  return String(Keychain.get(AMAP_KEY) || '').trim()
}
export function saveAMapKey(value: string): void {
  const key = value.trim()
  if (key && !/^[a-f0-9]{32}$/i.test(key)) throw new Error('请输入完整的高德 Web 服务 Key（32 位字母数字），或留空停用')
  if (Keychain.set(AMAP_KEY, key) === false) throw new Error('高德 Key 保存失败，请重试')
}
