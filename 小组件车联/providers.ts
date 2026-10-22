import { fetch } from 'scripting'

export type ProviderId = 'aozhilian' | 'aojie'
export type ProviderChoice = 'auto' | ProviderId
export const PROVIDERS = {
  aozhilian: { label: '奥智联', host: 'kds.askdwl.com', tires: false },
  aojie: { label: '奥捷智行', host: 'ck.shjza.cn', tires: true },
} as const
export function isProvider(value: unknown): value is ProviderId { return value === 'aozhilian' || value === 'aojie' }
type Probe = { provider: ProviderId; status: 'valid' | 'rejected' | 'unknown' | 'noVehicle' }
function deviceId(value: unknown): boolean {
  if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) return false
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const id = String(value).trim()
  return !!id && id !== '0' && id.length <= 200
}
async function inspect(provider: ProviderId, token: string): Promise<Probe> {
  async function get(path: string): Promise<{ status: Probe['status']; data?: any }> {
    try {
      const response = await fetch('https://' + PROVIDERS[provider].host + path, {
        timeout: 8, headers: { Accept: 'application/json', Authorization: token },
      })
      if (response.status === 401 || response.status === 403) return { status: 'rejected' }
      if (!response.ok) return { status: 'unknown' }
      const result: any = await response.json()
      if (String(result?.status) === '401' || String(result?.status) === '403') return { status: 'rejected' }
      // Do not mistake a temporary server failure for an authorization rejection.
      if (String(result?.status) !== '200') return { status: /token|登录|授权|认证|过期|unauthoriz|invalid.*credential/i.test(String(result?.message || '')) ? 'rejected' : 'unknown' }
      return { status: 'valid', data: result?.data }
    } catch { return { status: 'unknown' } }
  }
  // Only these two read-only endpoints participate in detection. No commands or location requests.
  const car = await get('/api/car/getNowCar')
  if (car.status !== 'valid') return { provider, status: car.status }
  const vehicle = car.data?.carInfo ?? car.data
  if (deviceId(vehicle?.machineId)) return { provider, status: 'valid' }
  const obd = await get('/api/car/getCarOBD')
  return { provider, status: obd.status === 'valid' ? deviceId(obd.data?.machineId) ? 'valid' : 'noVehicle' : obd.status }
}
export async function detectProvider(token: string, choice: ProviderChoice = 'auto'): Promise<ProviderId> {
  if (choice !== 'auto' && !isProvider(choice)) throw new Error('请选择有效的服务')
  if (choice !== 'auto') {
    const result = await inspect(choice, token)
    if (result.status === 'valid') return choice
    if (result.status === 'unknown') throw new Error('暂时无法连接' + PROVIDERS[choice].label + '，请稍后重试')
    if (result.status === 'noVehicle') throw new Error('当前账号没有可用车辆，请核对 Token')
    throw new Error('Token 无效或已过期，请核对完整 Authorization 值')
  }
  const results = await Promise.all([inspect('aozhilian', token), inspect('aojie', token)])
  const valid = results.filter(result => result.status === 'valid')
  if (valid.length > 1) throw new Error('两个服务均可使用此 Token，请在“识别方式”中选择实际使用的服务后保存')
  if (results.some(result => result.status === 'unknown')) throw new Error('网络异常，未能完成自动识别。原配置已保留，请稍后重试或选择服务后保存')
  if (valid.length === 1) return valid[0].provider
  if (results.some(result => result.status === 'noVehicle')) throw new Error('当前账号没有可用车辆，请核对 Token')
  throw new Error('未识别到可用服务，Token 可能无效或已过期')
}
