// Helper for atomically merging top-level keys into projects.brand_voice via
// the merge_project_brand_voice() RPC. Replaces the spread+update pattern which
// was vulnerable to lost writes when agency endpoints ran in parallel.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export async function mergeBrandVoice(
  supabase: SupabaseLike,
  projectId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc('merge_project_brand_voice', {
    p_project_id: projectId,
    p_patch: patch,
  })
  if (error) throw error
  return (data ?? null) as Record<string, unknown> | null
}
