import type { CarData } from './api'

export function needsAttention(data: CarData | null): boolean {
  return !!data && (!data.locked || data.engineOn)
}
export function statusTint(data: CarData | null, normal: string): string {
  return needsAttention(data) ? '#FB923C' : normal
}
