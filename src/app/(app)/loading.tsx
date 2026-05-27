export default function AppLoading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-slate-800" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-md bg-slate-800/70" />
        <div className="h-28 animate-pulse rounded-md bg-slate-800/70" />
        <div className="h-28 animate-pulse rounded-md bg-slate-800/70" />
      </div>
      <div className="h-80 animate-pulse rounded-md bg-slate-800/70" />
    </div>
  )
}
