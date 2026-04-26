import { describe, it, expect } from 'vitest'
import { htmlToText } from './html-to-text'

describe('htmlToText', () => {
  it('returns empty for empty/null inputs', () => {
    expect(htmlToText('')).toBe('')
  })

  it('strips simple tags', () => {
    expect(htmlToText('<p>Hello <strong>world</strong></p>'))
      .toBe('Hello world')
  })

  it('inserts newlines for block-level elements', () => {
    const html = '<p>First paragraph.</p><p>Second paragraph.</p>'
    expect(htmlToText(html)).toBe('First paragraph.\nSecond paragraph.')
  })

  it('drops script and style blocks entirely', () => {
    const html = '<style>.foo{color:red}</style><p>Body</p><script>alert(1)</script>'
    expect(htmlToText(html)).toBe('Body')
  })

  it('decodes common entities', () => {
    expect(htmlToText('Q&amp;A &lt;3 &quot;quoted&quot; &nbsp;'))
      .toBe('Q&A <3 "quoted"')
  })

  it('handles realistic email layout with table-based structure', () => {
    const html = `
      <html>
        <body>
          <table><tr><td>
            <h1>Welcome!</h1>
            <p>Thanks for joining.</p>
            <a href="x" style="display:inline-block;padding:10px 16px">Get Started</a>
          </td></tr></table>
        </body>
      </html>
    `
    const text = htmlToText(html)
    expect(text).toContain('Welcome!')
    expect(text).toContain('Thanks for joining.')
    expect(text).toContain('Get Started')
    // No HTML tags survive
    expect(text).not.toMatch(/<[^>]+>/)
  })

  it('survives mid-tag truncation gracefully (no HTML left in output)', () => {
    // Simulate a mid-tag truncation that the prior implementation would have produced.
    const truncated = '<p>Hello world</p><table style="border:1'
    const text = htmlToText(truncated)
    expect(text).toContain('Hello world')
    expect(text).not.toMatch(/<[^>]+>/)
  })

  it('collapses repeated spaces and tabs within a line', () => {
    expect(htmlToText('<p>Lots    of\tinternal     whitespace</p>'))
      .toBe('Lots of internal whitespace')
  })
})
