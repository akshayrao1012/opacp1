/**
 * Deterministic pseudo-random helpers.
 *
 * Every mock row is derived from its index, so the prototype shows the same
 * data on every reload and synthetic tables can be scanned without being
 * retained in memory.
 */

/** mulberry32 — small, fast, stable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash(...parts: (string | number)[]): number {
  let h = 2166136261
  const s = parts.join('')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export class Gen {
  private r: () => number
  constructor(...seed: (string | number)[]) {
    this.r = rng(hash(...seed))
  }
  float(min = 0, max = 1) {
    return min + this.r() * (max - min)
  }
  int(min: number, max: number) {
    return Math.floor(this.float(min, max + 1))
  }
  bool(p = 0.5) {
    return this.r() < p
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.min(xs.length - 1, Math.floor(this.r() * xs.length))]
  }
  /** Weighted pick: [value, weight][]. */
  weighted<T>(xs: readonly [T, number][]): T {
    const total = xs.reduce((s, x) => s + x[1], 0)
    let t = this.r() * total
    for (const [v, w] of xs) {
      t -= w
      if (t <= 0) return v
    }
    return xs[xs.length - 1][0]
  }
  some<T>(xs: readonly T[], n: number): T[] {
    const pool = [...xs]
    const out: T[] = []
    for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(this.r() * pool.length), 1)[0])
    return out
  }
  money(min: number, max: number, dp = 2) {
    const f = Math.pow(10, dp)
    return Math.round(this.float(min, max) * f) / f
  }
  /** ISO date offset from the prototype "today". */
  dayOffset(minDays: number, maxDays: number) {
    return isoDate(NOW_MS + this.int(minDays, maxDays) * 86400000)
  }
  dateTimeOffset(minHours: number, maxHours: number) {
    return isoDateTime(NOW_MS + this.int(minHours, maxHours) * 3600000)
  }
}

/** Fixed "now" so the prototype is reproducible. Matches the PRD date. */
export const NOW_MS = Date.parse('2026-08-26T09:40:00Z')

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
export function isoDateTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

export const FIRST_NAMES = [
  'Anna', 'Bram', 'Carla', 'Diego', 'Elena', 'Femke', 'Gustav', 'Hana', 'Ivan', 'Julia',
  'Kasper', 'Lotte', 'Marek', 'Nadia', 'Omar', 'Petra', 'Quentin', 'Rosa', 'Sven', 'Tomas',
  'Ulrike', 'Vera', 'Wouter', 'Xenia', 'Yusuf', 'Zoe',
]
export const LAST_NAMES = [
  'Bakker', 'Visser', 'Jansen', 'de Vries', 'van Dijk', 'Meyer', 'Novak', 'Costa', 'Rossi',
  'Lefevre', 'Andersen', 'Kowalski', 'Silva', 'Fischer', 'Moreau', 'Nilsson', 'Popescu',
  'Horvath', 'Marin', 'Dubois', 'Schmidt', 'Ferreira',
]
export const COMPANY_WORDS = [
  'Hosting', 'Digital', 'Web', 'Cloud', 'Net', 'Sites', 'Domains', 'Media', 'Studio', 'Labs',
  'Works', 'Group', 'Solutions', 'Systems', 'Online', 'Servers',
]
export const COMPANY_PREFIX = [
  'Blauw', 'Nord', 'Prima', 'Vento', 'Lumo', 'Kasa', 'Terra', 'Alto', 'Delta', 'Orbis',
  'Vero', 'Nimbus', 'Ferro', 'Solis', 'Corvo', 'Mirta', 'Alba', 'Tundra',
]
export const COUNTRIES = [
  ['NL', 'Netherlands'], ['DE', 'Germany'], ['FR', 'France'], ['GB', 'United Kingdom'],
  ['ES', 'Spain'], ['IT', 'Italy'], ['BE', 'Belgium'], ['PL', 'Poland'], ['SE', 'Sweden'],
  ['DK', 'Denmark'], ['PT', 'Portugal'], ['CZ', 'Czechia'], ['RO', 'Romania'], ['US', 'United States'],
] as const
export const TLDS = [
  'com', 'net', 'nl', 'de', 'eu', 'org', 'fr', 'be', 'co.uk', 'io', 'shop', 'online',
  'dev', 'app', 'es', 'it', 'info', 'biz', 'cloud', 'agency',
]
export const WORDS = [
  'atlas', 'beacon', 'cinder', 'dovetail', 'ember', 'fathom', 'gable', 'harbor', 'indigo',
  'juniper', 'kestrel', 'lantern', 'meadow', 'nimble', 'orchard', 'plumb', 'quarry', 'ridge',
  'saffron', 'thicket', 'umber', 'vellum', 'willow', 'yarrow', 'zephyr', 'copper', 'marlin',
  'pebble', 'sable', 'tarn',
]

export function companyName(g: Gen): string {
  return `${g.pick(COMPANY_PREFIX)}${g.pick(COMPANY_WORDS)} ${g.pick(['B.V.', 'GmbH', 'Ltd', 'SAS', 'SRL', 'AB', 'ApS'])}`
}
export function personName(g: Gen): string {
  return `${g.pick(FIRST_NAMES)} ${g.pick(LAST_NAMES)}`
}
export function domainName(g: Gen): string {
  const style = g.int(0, 2)
  const base =
    style === 0 ? g.pick(WORDS) : style === 1 ? `${g.pick(WORDS)}-${g.pick(WORDS)}` : `${g.pick(WORDS)}${g.int(2, 99)}`
  return `${base}.${g.pick(TLDS)}`
}
export function emailFor(name: string, domain: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@${domain}`
}
