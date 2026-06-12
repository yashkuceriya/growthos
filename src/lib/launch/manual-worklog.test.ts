import { describe, expect, it } from 'vitest'
import { completedManualWorklogTasks, manualWorklogProgress, readManualWorklog } from './manual-worklog'

describe('manual worklog helpers', () => {
  it('normalizes valid manual tracker metadata', () => {
    const worklog = readManualWorklog({
      manual_launch_tracker: {
        saved_at: '2026-06-12T01:00:00.000Z',
        updated_at: '2026-06-12T02:00:00.000Z',
        goal: 'activation',
        angle: 'founder-led',
        brief_markdown: '# Brief',
        tasks: [
          { id: 'email', owner: 'Yash', title: 'Ship email', detail: 'Send it', metric: 'Replies', channel: 'email', done: true, completed_at: '2026-06-12T03:00:00.000Z' },
          { id: 'social', title: 'Post social', detail: 'Publish it', metric: 'Clicks', done: false },
        ],
      },
    })

    expect(worklog?.goal).toBe('activation')
    expect(worklog?.tasks).toEqual([
      expect.objectContaining({ id: 'email', owner: 'Yash', channel: 'email', done: true, completedAt: '2026-06-12T03:00:00.000Z' }),
      expect.objectContaining({ id: 'social', owner: 'Manual', channel: null, done: false, completedAt: null }),
    ])
    expect(manualWorklogProgress(worklog)).toEqual({ total: 2, done: 1, nextTitle: 'Post social' })
    expect(completedManualWorklogTasks(worklog)).toHaveLength(1)
  })

  it('returns null for missing or empty tracker data', () => {
    expect(readManualWorklog(null)).toBeNull()
    expect(readManualWorklog({ manual_launch_tracker: { tasks: [] } })).toBeNull()
    expect(manualWorklogProgress(null)).toEqual({ total: 0, done: 0, nextTitle: null })
  })
})
