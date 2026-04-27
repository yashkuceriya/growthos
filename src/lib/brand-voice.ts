// Helper for atomically merging top-level keys into projects.brand_voice via
// the merge_project_brand_voice() RPC. Replaces the spread+update pattern which
// was vulnerable to lost writes when agency endpoints ran in parallel.
//
// **Resilience**: if the RPC is missing from the database (migration 011 or
// 025 not applied), we fall back to a read-modify-write with a loud
// one-time warning. The fallback has a known race window — concurrent
// merges can lose writes — but it's strictly better than the whole
// ingest / agency pipeline 500-ing.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

let warnedAboutMissingRpc = false

export async function mergeBrandVoice(
  supabase: SupabaseLike,
  projectId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc('merge_project_brand_voice', {
    p_project_id: projectId,
    p_patch: patch,
  })

  if (!error) return (data ?? null) as Record<string, unknown> | null

  // PostgREST returns code='PGRST202' or message=/Could not find the function/
  // when the RPC isn't in the schema cache.
  const msg = error.message ?? ''
  const isMissingRpc =
    error.code === 'PGRST202'
    || /could not find the function/i.test(msg)
    || /function .* does not exist/i.test(msg)

  if (!isMissingRpc) throw error

  if (!warnedAboutMissingRpc) {
    console.error(
      '[brand-voice] merge_project_brand_voice RPC missing — apply supabase/migrations/025_rpc_redo.sql. '
      + 'Falling back to read-modify-write (race-prone but functional).',
    )
    warnedAboutMissingRpc = true
  }

  // Fallback: read current brand_voice, shallow-merge the patch, write back.
  // Concurrent writers can lose writes here — this is the bug 011 was
  // intended to fix. Apply migration 025 to restore atomic behavior.
  const { data: current } = await supabase
    .from('projects')
    .select('brand_voice')
    .eq('id', projectId)
    .maybeSingle() as { data: { brand_voice: Record<string, unknown> | null } | null }

  const merged = { ...(current?.brand_voice ?? {}), ...patch }
  const { error: updateError } = await supabase
    .from('projects')
    .update({ brand_voice: merged })
    .eq('id', projectId)

  if (updateError) throw updateError
  return merged
}
