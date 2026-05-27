import { describe, expect, it } from 'vitest'
import { nextBestAction } from './next-action'
import type { MarketingBlueprint } from './blueprint'

const READY_BLUEPRINT: MarketingBlueprint = {
  vertical: 'b2b_saas',
  confidence: 0.9,
  icp: 'CTOs',
  primaryGoal: 'signups',
  primaryKpi: 'MQLs',
  primaryChannels: ['linkedin', 'email'],
  secondaryChannels: [],
  launchTactics: [],
  croFocus: [],
  lifecycleEmails: [],
  contentMix: [],
  readiness: [],
}

describe('nextBestAction', () => {
  it('budget cap dominates everything else', () => {
    const action = nextBestAction({
      budgetExceeded: true,
      hasProject: true,
      projectWebsite: 'https://x.com',
      blueprint: READY_BLUEPRINT,
      campaignCount: 3,
      adsNeedingReview: 5,
    })
    expect(action.id).toBe('raise_budget')
    expect(action.priority).toBe('high')
  })

  it('asks for a project when none exists', () => {
    expect(nextBestAction({}).id).toBe('create_project')
  })

  it('asks to sync the site when project exists but website is missing', () => {
    expect(nextBestAction({ hasProject: true }).id).toBe('sync_site')
  })

  it('asks to sync when website is set but blueprint is still fallback', () => {
    expect(nextBestAction({ hasProject: true, projectWebsite: 'https://x.com', blueprint: { ...READY_BLUEPRINT, vertical: 'other' } }).id).toBe('sync_site')
  })

  it('asks to launch when project + blueprint are ready but no campaigns', () => {
    expect(nextBestAction({ hasProject: true, projectWebsite: 'https://x.com', blueprint: READY_BLUEPRINT }).id).toBe('first_launch')
  })

  it('asks to re-launch into the existing campaign when it has no assets', () => {
    const action = nextBestAction({
      hasProject: true, projectWebsite: 'https://x.com', blueprint: READY_BLUEPRINT,
      campaignCount: 1, latestCampaignId: 'camp_1', latestCampaignAssetCount: 0,
    })
    expect(action.id).toBe('attach_assets')
    expect(action.href).toContain('campaignId=camp_1')
  })

  it('prompts to review ads when generated copies are waiting', () => {
    const action = nextBestAction({
      hasProject: true, projectWebsite: 'https://x.com', blueprint: READY_BLUEPRINT,
      campaignCount: 1, latestCampaignAssetCount: 6, adsNeedingReview: 3,
    })
    expect(action.id).toBe('review_ads')
    expect(action.title).toContain('Review 3')
  })

  it('prompts to schedule drafts when social posts are sitting', () => {
    const action = nextBestAction({
      hasProject: true, projectWebsite: 'https://x.com', blueprint: READY_BLUEPRINT,
      campaignCount: 1, latestCampaignAssetCount: 6,
      adsNeedingReview: 0, socialPostsDraft: 4,
    })
    expect(action.id).toBe('schedule_social')
  })

  it('prompts to log metrics when nothing has been measured yet', () => {
    const action = nextBestAction({
      hasProject: true, projectWebsite: 'https://x.com', blueprint: READY_BLUEPRINT,
      campaignCount: 1, latestCampaignId: 'camp_1', latestCampaignAssetCount: 6,
      adsNeedingReview: 0, socialPostsDraft: 0,
    })
    expect(action.id).toBe('log_metrics')
    expect(action.href).toBe('/campaigns/camp_1')
  })

  it('prompts to promote a winner when insights exist but no winners do', () => {
    const action = nextBestAction({
      hasProject: true, projectWebsite: 'https://x.com', blueprint: READY_BLUEPRINT,
      campaignCount: 1, latestCampaignAssetCount: 6,
      hasMeasurements: true, hasInsights: true, hasWinners: false,
    })
    expect(action.id).toBe('promote_winner')
  })

  it('falls through to a next-experiment nudge when everything is healthy', () => {
    const action = nextBestAction({
      hasProject: true, projectWebsite: 'https://x.com', blueprint: READY_BLUEPRINT,
      campaignCount: 2, latestCampaignAssetCount: 8,
      hasMeasurements: true, hasInsights: true, hasWinners: true,
    })
    expect(action.id).toBe('next_experiment')
  })
})
