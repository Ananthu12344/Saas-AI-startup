import Link from "next/link"
import { redirect } from "next/navigation"
import { dashboardSummary } from "@/lib/dashboard/summary"
import { getDashboardData } from "@/lib/dashboard/queries"
import { budgetState, budgetStateLabel } from "@/lib/dashboard/budgets"

const money = (value: number) => `$${value.toFixed(2)}`
const integer = (value: number) => new Intl.NumberFormat("en-US").format(value)
const day = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`))

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <article className="dashboard-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  )
}

function Breakdown({
  title,
  rows,
  nameKey,
}: {
  title: string
  rows: Array<Record<string, unknown>>
  nameKey: string
}) {
  const total = rows.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0)
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading">
        <h2>{title}</h2>
        <span>All time · {money(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="dashboard-empty">No usage recorded yet.</p>
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Cost</th>
                <th scope="col">Share</th>
                <th scope="col">Tokens</th>
                <th scope="col">Events</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${String(row[nameKey])}-${index}`}>
                  <th scope="row">{String(row[nameKey])}</th>
                  <td>{money(Number(row.total_cost ?? 0))}</td>
                  <td>
                    {total > 0
                      ? `${((Number(row.total_cost) / total) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td>{integer(Number(row.total_tokens ?? 0))}</td>
                  <td>{integer(Number(row.request_count ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default async function DashboardPage() {
  const result = await getDashboardData()
  if (result.status === "unauthenticated") redirect("/login?next=/dashboard")
  if (result.status === "no-workspace") {
    return (
      <main className="dashboard-page">
        <div className="page-width dashboard-shell">
          <header className="dashboard-header">
            <Link href="/" className="dashboard-back">
              ← TokenLens
            </Link>
            <a href="/logout" className="dashboard-logout">
              Log out
            </a>
          </header>
          <section
            className="dashboard-panel"
            aria-labelledby="no-workspace-title"
          >
            <h1 id="no-workspace-title">No workspace yet</h1>
            <p>
              You’re signed in, but you don’t belong to a workspace yet. Ask
              your workspace owner to add you.
            </p>
            <Link href="/">Return home</Link>
          </section>
        </div>
      </main>
    )
  }
  if (
    result.status === "unsupported-currency" ||
    result.status === "unknown-cost"
  ) {
    return (
      <main className="dashboard-page">
        <div className="page-width dashboard-shell">
          <section
            className="dashboard-panel"
            aria-labelledby="cost-unavailable-title"
          >
            <h1 id="cost-unavailable-title">Cost reporting unavailable</h1>
            <p>
              {result.status === "unsupported-currency"
                ? "This workspace includes non-USD usage. Currency-aware reporting is required before costs and budgets can be shown accurately."
                : "Some usage has no known cost. Complete pricing before relying on spending totals and budgets."}
            </p>
            <Link href="/">Return home</Link>
          </section>
        </div>
      </main>
    )
  }
  const { data } = result

  const summary = dashboardSummary(data.daily, data.budgets, new Date())
  const activeBudget = summary.workspaceBudget
  const budgetRatio =
    activeBudget && activeBudget.amount > 0 ? activeBudget.consumed_ratio : null

  return (
    <main className="dashboard-page">
      <div className="page-width dashboard-shell">
        <header className="dashboard-header">
          <div>
            <Link href="/" className="dashboard-back">
              ← TokenLens
            </Link>
            <p className="eyebrow">Workspace observatory</p>
            <h1>{data.workspace.name}</h1>
            <p className="dashboard-subtitle">
              USD usage costs may include estimates. Summary periods use UTC;
              breakdowns cover all recorded usage events. Event counts are
              normalized ingestion records and may represent provider buckets.
            </p>
          </div>
          <a href="/logout" className="dashboard-logout">
            Log out
          </a>
        </header>
        <section className="dashboard-metrics" aria-label="Summary metrics">
          <Metric
            label="Spend this month"
            value={money(summary.monthCost)}
            detail={
              summary.latestMonthDay
                ? `Through ${day(summary.latestMonthDay)} (UTC)`
                : "No usage this month"
            }
          />
          <Metric label="Spend today" value={money(summary.todayCost)} />
          <Metric
            label="Tokens this month"
            value={integer(summary.monthTokens)}
          />
          <Metric
            label="Budget used"
            value={
              budgetRatio === null ? "—" : `${(budgetRatio * 100).toFixed(0)}%`
            }
            detail={
              activeBudget
                ? `${money(activeBudget.spent)} of ${money(activeBudget.amount)}`
                : summary.workspaceBudgetCount > 1
                  ? "Multiple active workspace budgets; see below"
                  : "No active workspace budget"
            }
          />
        </section>
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>Usage over time</h2>
            <span>All time · UTC</span>
          </div>
          {data.daily.length === 0 ? (
            <p className="dashboard-empty">No usage recorded yet.</p>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Cost</th>
                    <th scope="col">Tokens</th>
                    <th scope="col">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((row) => (
                    <tr key={row.day}>
                      <th scope="row">{day(row.day)}</th>
                      <td>{money(row.total_cost)}</td>
                      <td>{integer(row.total_tokens)}</td>
                      <td>{integer(row.request_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="dashboard-grid">
          <Breakdown title="By provider" rows={data.providers} nameKey="name" />
          <Breakdown title="By model" rows={data.models} nameKey="model" />
          <Breakdown
            title="By project"
            rows={data.projects}
            nameKey="project"
          />
          <Breakdown
            title="By application"
            rows={data.applications}
            nameKey="application"
          />
        </div>
        <section className="dashboard-grid dashboard-grid-bottom">
          <div className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <h2>Budget consumption</h2>
              <span>{summary.activeBudgets.length}</span>
            </div>
            {summary.activeBudgets.length === 0 ? (
              <p className="dashboard-empty">No active budgets.</p>
            ) : (
              <ul className="dashboard-list">
                {summary.activeBudgets.map((budget) => (
                  <li key={budget.id as string}>
                    <div>
                      <strong>
                        {budget.name} ({budget.scope_type})
                      </strong>
                      <span>
                        {money(budget.spent)} of {money(budget.amount)}
                      </span>
                    </div>
                    <span>
                      {budget.consumed_ratio === null
                        ? "Consumption unavailable"
                        : `${(budget.consumed_ratio * 100).toFixed(1)}% used`}{" "}
                      · {day(budget.period_start.slice(0, 10))} to{" "}
                      {day(budget.period_end.slice(0, 10))} (end exclusive)
                    </span>
                    <span>
                      {budgetStateLabel(
                        budgetState(
                          budget.consumed_ratio,
                          budget.alert_threshold
                        )
                      )}
                    </span>
                    <progress
                      max="1"
                      value={Math.min(
                        1,
                        Math.max(0, budget.consumed_ratio ?? 0)
                      )}
                      aria-label={`${budget.name} consumption`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <h2>Potential inefficiencies</h2>
              <span>
                {Math.min(5, data.waste.length)} of {data.waste.length}
              </span>
            </div>
            <p className="dashboard-empty">
              Flags suggest investigation, not proven waste or savings. Large
              prompts are flagged above 100,000 input tokens with positive cost.
            </p>
            {data.waste.length === 0 ? (
              <p className="dashboard-empty">No heuristic findings.</p>
            ) : (
              <ul className="dashboard-list">
                {data.waste
                  .slice(-5)
                  .reverse()
                  .map((item, index) => (
                    <li key={`${item.occurred_at}-${index}`}>
                      <div>
                        <strong>
                          {item.waste_reason ?? "High token request"}
                        </strong>
                        <span>
                          {item.model} · {money(item.cost)}
                        </span>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <h2>Anomalies</h2>
              <span>
                {Math.min(5, data.anomalies.length)} of {data.anomalies.length}
              </span>
            </div>
            <p className="dashboard-empty">
              Daily cost above the recorded-day mean plus three population
              standard deviations. Days without usage are excluded; sparse
              history limits this signal.
            </p>
            {data.anomalies.length === 0 ? (
              <p className="dashboard-empty">No anomalies detected.</p>
            ) : (
              <ul className="dashboard-list">
                {data.anomalies
                  .slice(-5)
                  .reverse()
                  .map((item) => (
                    <li key={item.day}>
                      <div>
                        <strong>{day(item.day)} spike</strong>
                        <span>
                          {money(item.total_cost)} vs {money(item.mean_cost)}{" "}
                          average
                        </span>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
