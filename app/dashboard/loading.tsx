export default function DashboardLoading() {
  return (
    <main className="dashboard-page" aria-busy="true">
      <div className="page-width dashboard-shell">
        <p role="status">Loading your workspace dashboard…</p>
      </div>
    </main>
  )
}
