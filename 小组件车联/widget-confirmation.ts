import { Script } from 'scripting'
import { readCache } from './api'
import { readToken, readAccountIdentity } from './credentials'
import { readSettings, settingsForSize, visibleButtons, type WidgetSize } from './settings'
import { parseControlRequest, createConfirmationExecutor, type ControlRequest } from './command-confirmation'

declare const Storage: { get<T>(key: string): T | null; set<T>(key: string, value: T): boolean }
type Phase = 'pending' | 'running' | 'error'
export type WidgetConfirmation = ControlRequest & { id: string; slot: number; issuedAt: number; readyAt: number; expiresAt: number; phase: Phase; message?: string }
export type StartConfirmation = { confirmAccount: string; confirmAction: string; confirmTarget: string; confirmVehicle: string; confirmSize: string; slot: number; id: string; issuedAt: number }
const PREFIX = 'CarLink.WidgetConfirmation.' + Script.name + '.'
const validSize = (size: unknown): size is WidgetSize => ['small', 'medium', 'large', 'extraLarge'].includes(String(size))
const key = (size: WidgetSize) => PREFIX + size
function store(size: WidgetSize, value: WidgetConfirmation | null) {
  if (Storage.set(key(size), value) === false) throw new Error('确认状态保存失败，请重新操作')
}
function clear(size: WidgetSize) { store(size, null); Keychain.set(key(size), '') }
function allowed(request: ControlRequest, slot: number) {
  const options = settingsForSize(readSettings(), request.size)
  return Number.isInteger(slot) && slot >= 0 && slot < visibleButtons(options).length &&
    options.buttonConfirmations[slot] === true && options.buttons[slot] === request.action
}
export function readWidgetConfirmation(size: WidgetSize, now = Date.now()): WidgetConfirmation | null {
  const state = Storage.get<WidgetConfirmation>(key(size))
  if (!state) return null
  if (state.size !== size || !['pending', 'running', 'error'].includes(state.phase) ||
    !Number.isFinite(state.expiresAt) || state.expiresAt <= now ||
    readCache()?.machineId !== state.machineId || !readToken() || state.accountId !== readAccountIdentity() || Keychain.get(key(size)) !== readAccountIdentity() ||
    !allowed(state, state.slot)) { clear(size); return null }
  return state
}
export function beginWidgetConfirmation(parameters: StartConfirmation, now = Date.now()): void {
  const request = parseControlRequest(parameters)
  if (!request || typeof parameters.id !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(parameters.id) ||
    !Number.isFinite(parameters.issuedAt) || parameters.issuedAt <= 0 || parameters.issuedAt > now ||
    request.accountId !== readAccountIdentity() || !allowed(request, parameters.slot) || readCache()?.machineId !== request.machineId || !readToken()) return
  // A dashboard may remain visible for hours. Allow its first tap, but never re-arm
  // an already consumed dashboard snapshot, even after cancellation or expiration.
  const sourceKey = key(request.size) + '.lastSource'
  const lastSource = Storage.get<number>(sourceKey) || 0
  if (parameters.issuedAt <= lastSource || readWidgetConfirmation(request.size, now)) return
  if (Storage.set(sourceKey, parameters.issuedAt) === false) throw new Error('确认状态保存失败')
  if (Keychain.set(key(request.size), readAccountIdentity()) === false) throw new Error('授权校验保存失败')
  store(request.size, { ...request, id: parameters.id, slot: parameters.slot, issuedAt: parameters.issuedAt,
    readyAt: now + 1200, expiresAt: now + 60000, phase: 'pending' })
}
export function cancelWidgetConfirmation({ size, id }: { size: string; id: string }): void {
  if (!validSize(size)) return
  const state = readWidgetConfirmation(size)
  if (state?.id === id && state.phase !== 'running') clear(size)
}
export async function submitWidgetConfirmation({ size, id }: { size: string; id: string }): Promise<void> {
  if (!validSize(size)) return
  const state = readWidgetConfirmation(size)
  if (!state || state.id !== id || state.phase !== 'pending' || Date.now() < state.readyAt) return
  // Persist the consumed state before any await, so repeated taps cannot resubmit this ticket.
  store(size, { ...state, phase: 'running', expiresAt: Date.now() + 120000 })
  try {
    await createConfirmationExecutor(state)()
    if (Storage.get<WidgetConfirmation>(key(size))?.id === id) clear(size)
  } catch (e) {
    if (Storage.get<WidgetConfirmation>(key(size))?.id === id) store(size, { ...state, phase: 'error',
      expiresAt: Date.now() + 60000, message: e instanceof Error ? e.message : String(e) })
  }
}
