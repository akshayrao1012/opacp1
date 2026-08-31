/**
 * Mutation layer for synthetic datasets.
 *
 * Rows are derived from their index, so a bulk operation cannot simply write
 * into an array. Instead every dataset reads through a patch table keyed by
 * dataset id + row id. The store bumps `dataVersion` after writing so views
 * re-render.
 */

import type { Dataset } from '../table'

type Patch = Record<string, unknown>

const patches = new Map<string, Map<string, Patch>>()
const removed = new Map<string, Set<string>>()

export function patchRow(datasetId: string, rowId: string, patch: Patch) {
  let m = patches.get(datasetId)
  if (!m) patches.set(datasetId, (m = new Map()))
  m.set(rowId, { ...(m.get(rowId) ?? {}), ...patch })
}

export function markRemoved(datasetId: string, rowId: string) {
  let s = removed.get(datasetId)
  if (!s) removed.set(datasetId, (s = new Set()))
  s.add(rowId)
}

export function isRemoved(datasetId: string, rowId: string): boolean {
  return removed.get(datasetId)?.has(rowId) ?? false
}

export function getPatch(datasetId: string, rowId: string): Patch | undefined {
  return patches.get(datasetId)?.get(rowId)
}

export function patchCount(datasetId?: string): number {
  if (datasetId) return patches.get(datasetId)?.size ?? 0
  let n = 0
  for (const m of patches.values()) n += m.size
  return n
}

export function resetPatches() {
  patches.clear()
  removed.clear()
}

/**
 * Wraps a dataset so patched fields win and deleted rows are flagged.
 * Deleted rows keep their slot (the prototype never re-indexes) but carry
 * `_deleted`, which every table spec filters out by default.
 */
export function patchable<T extends object>(ds: Dataset<T>, rowId: (row: T) => string): Dataset<T> {
  return {
    ...ds,
    at(i: number) {
      const row = ds.at(i)
      const id = rowId(row)
      const p = getPatch(ds.id, id)
      const del = isRemoved(ds.id, id)
      if (!p && !del) return row
      return { ...row, ...(p ?? {}), ...(del ? { _deleted: true } : {}) } as T
    },
  }
}

export interface Deletable {
  _deleted?: boolean
}
