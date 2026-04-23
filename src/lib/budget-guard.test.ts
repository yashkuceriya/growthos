import { describe, it, expect } from 'vitest'
import { budgetExceededResponse } from './budget-guard'

describe('budgetExceededResponse', () => {
  it('returns HTTP 402 Payment Required', () => {
    const r = budgetExceededResponse({ ok: false, spent: 120, cap: 100, remaining: -20 })
    expect(r.status).toBe(402)
  })

  it('body reports spent / cap / remaining rounded to 4 decimals', async () => {
    const r = budgetExceededResponse({ ok: false, spent: 120.123456, cap: 100, remaining: -20.123456 })
    const body = await r.json()
    expect(body.error).toBe('Monthly AI budget exceeded')
    expect(body.spent_usd).toBe(120.1235)
    expect(body.cap_usd).toBe(100)
    expect(body.remaining_usd).toBe(-20.123456) // remaining passed through unchanged
  })
})
