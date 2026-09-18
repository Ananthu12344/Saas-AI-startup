"use client"

import Link from "next/link"

export default function DashboardError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="dashboard-page">
      <div className="page-width dashboard-shell dashboard-state-page">
        <Link href="/" className="dashboard-brand">TokenLens</Link>
        <p className="dashboard-tagline">See your AI usage. Understand your spend.</p>
        <section className="dashboard-panel dashboard-state dashboard-state-error" role="alert">
          <strong>We could not load workspace data</strong>
          <span>Your stored records have not changed. Retry the request or return home.</span>
          <div className="dashboard-state-actions">
            <button className="primary-button" type="button" onClick={() => retry()}>Try again</button>
            <Link className="outline-button" href="/">Return home</Link>
          </div>
        </section>
      </div>
    </main>
  )
}
