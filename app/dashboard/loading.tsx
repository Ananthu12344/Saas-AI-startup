export default function DashboardLoading() {
  return (
    <main className="dashboard-page">
      <div className="page-width dashboard-shell" aria-busy="true" aria-live="polite">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-brand">TokenLens</span>
            <p className="dashboard-tagline">See your AI usage. Understand your spend.</p>
            <h1>Loading workspace usage…</h1>
            <p className="dashboard-subtitle">Metrics remain unavailable until the workspace query completes.</p>
          </div>
        </header>
        <section className="dashboard-metrics" aria-label="Loading summary metrics">
          {[1, 2, 3, 4].map((item) => (
            <article className="dashboard-metric dashboard-skeleton" key={item} aria-hidden="true">
              <span />
              <span />
            </article>
          ))}
        </section>
        <section className="dashboard-panel dashboard-state">
          <strong>Loading dashboard data</strong>
          <span>Your stored records are unchanged. Please keep this page open.</span>
        </section>
      </div>
    </main>
  )
}
