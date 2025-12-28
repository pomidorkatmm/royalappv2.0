import { STORAGE_KEYS } from '../config'
import type { AbTest } from './types'

export function loadAbTests(): AbTest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.abTests)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AbTest[]) : []
  } catch {
    return []
  }
}

export function saveAbTests(tests: AbTest[]) {
  localStorage.setItem(STORAGE_KEYS.abTests, JSON.stringify(tests))
}

export function upsertAbTest(test: AbTest) {
  const tests = loadAbTests()
  const idx = tests.findIndex((t) => t.id === test.id)
  if (idx >= 0) tests[idx] = test
  else tests.unshift(test)
  saveAbTests(tests)
}

export function removeAbTest(id: string) {
  const tests = loadAbTests().filter((t) => t.id !== id)
  saveAbTests(tests)
}
