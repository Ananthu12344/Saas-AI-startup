"use client"

export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <main className="dashboard-page">
      <div className="page-width dashboard-shell">
        <section className="dashboard-panel" role="alert">
          <h1>Dashboard unavailable</h1>
          <p>
            We couldn’t load a complete report. Try again. If this continues,
            ask your workspace administrator for help.
          </p>
          <button className="primary-button" onClick={() => retry()}>
            Try again
          </button>
        </section>
      </div>
    </main>
  )
}
