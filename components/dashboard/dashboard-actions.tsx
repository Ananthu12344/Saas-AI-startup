"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Plus, RefreshCw } from "lucide-react"

type Credential = {
  id: string
  label: string
  provider: string
  provider_name: string
  secret_saved: boolean
  last_success_at: string | null
  sync_failed: boolean
  status_available: boolean
}

type Project = { id: string; name: string }
type Application = {
  id: string
  name: string
  environment: string
  project_id: string
}

const syncTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value))

function FormMessage({ error, success }: { error: string; success: string }) {
  if (error) return <p className="dashboard-form-error" role="alert">{error}</p>
  if (success) return <p className="dashboard-form-success" role="status"><Check size={15} /> {success}</p>
  return null
}

async function jsonRequest(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? "Request failed")
  return payload
}

export function WorkspaceSetup() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPending(true)
    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    const slug = String(form.get("slug") ?? "").trim()
    try {
      await jsonRequest("/api/workspaces", { name, slug })
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create workspace")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dashboard-panel dashboard-setup" aria-labelledby="create-workspace-title">
      <span className="dashboard-kicker">Get started</span>
      <h1 id="create-workspace-title">Create your first workspace</h1>
      <p>Workspaces keep your usage data and provider connections isolated for your team.</p>
      <form className="dashboard-form" onSubmit={submit}>
        <label>Workspace name<input name="name" placeholder="Example workspace" required disabled={pending} /></label>
        <label>Workspace slug<input name="slug" placeholder="acme-ai" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required disabled={pending} /></label>
        <FormMessage error={error} success="" />
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Create workspace
        </button>
      </form>
    </section>
  )
}

export function DashboardActions({
  workspaceId,
  isAdmin,
  credentials,
  projects,
  applications,
  hasUsage,
  runtimeReady,
}: {
  workspaceId: string
  isAdmin: boolean
  credentials: Credential[]
  projects: Project[]
  applications: Application[]
  hasUsage: boolean
  runtimeReady: boolean
}) {
  return (
    <>
      <OnboardingGuide
        isAdmin={isAdmin}
        credentials={credentials}
        hasUsage={hasUsage}
        runtimeReady={runtimeReady}
      />
      <div className="dashboard-actions-grid">
        {isAdmin ? (
          <CredentialManager
            workspaceId={workspaceId}
            credentials={credentials}
            runtimeReady={runtimeReady}
          />
        ) : (
          <CredentialList credentials={credentials} />
        )}
        {isAdmin ? <BudgetManager workspaceId={workspaceId} /> : null}
        <CatalogManager
          workspaceId={workspaceId}
          projects={projects}
          applications={applications}
        />
      </div>
    </>
  )
}

export function OnboardingGuide({ isAdmin, credentials, hasUsage, runtimeReady }: { isAdmin: boolean; credentials: Credential[]; hasUsage: boolean; runtimeReady: boolean }) {
  const hasConnection = credentials.length > 0
  const hasSecret = credentials.some((credential) => credential.secret_saved)
  const hasSync = credentials.some((credential) => credential.last_success_at)
  const hasSyncError = credentials.some((credential) => credential.sync_failed)
  const steps = [
    { label: "Workspace ready", done: true },
    { label: "Provider connection saved", done: hasConnection && hasSecret },
    { label: "Usage synchronized", done: hasSync },
    { label: "Usage available", done: hasUsage },
  ]
  const next = !runtimeReady
    ? "Provider connection setup is unavailable until protected server configuration is completed."
    : !hasConnection || !hasSecret
    ? isAdmin ? "Add a provider connection below to begin collecting usage." : "Ask a workspace owner or admin to add a provider connection."
    : hasSyncError
      ? "A synchronization error is recorded. Review the connection details and try again; prior usage remains visible."
      : !hasSync
        ? "Your credential is saved. Run Sync now to verify it and collect usage."
        : !hasUsage
          ? "Synchronization completed, but no usage has been reported for the selected period yet."
          : "Your observatory is ready. Use the sections below to investigate spend."
  return (
    <section className="dashboard-panel onboarding-guide" aria-labelledby="onboarding-title">
      <div className="dashboard-panel-heading"><div><span className="dashboard-kicker">Next steps</span><h2 id="onboarding-title">Set up your observatory</h2></div><span>{steps.filter((step) => step.done).length}/{steps.length} complete</span></div>
      <p className="dashboard-help">{next}</p>
      <ol className="onboarding-steps">
        {steps.map((step, index) => <li key={step.label} className={step.done ? "is-complete" : ""}><span aria-hidden="true">{step.done ? "✓" : index + 1}</span>{step.label}</li>)}
      </ol>
    </section>
  )
}

function CredentialList({ credentials }: { credentials: Credential[] }) {
  return (
    <section id="connections" className="dashboard-panel" aria-labelledby="connections-title">
      <div className="dashboard-panel-heading"><h2 id="connections-title">Provider connections</h2><span>{credentials.length}</span></div>
      <p className="dashboard-help">Connection management is restricted to workspace owners and admins.</p>
      {credentials.length === 0 ? <p className="dashboard-empty">No provider connections yet.</p> : <CredentialRows credentials={credentials} />}
    </section>
  )
}

function CredentialManager({ workspaceId, credentials, runtimeReady }: { workspaceId: string; credentials: Credential[]; runtimeReady: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); setPending(true)
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      const result = await jsonRequest("/api/credentials", { workspaceId, provider: form.get("provider"), label: form.get("label") }) as { credential?: { id: string } }
      if (!result.credential?.id) throw new Error("Credential metadata was not returned")
      await jsonRequest(`/api/credentials/${result.credential.id}/secret`, { secret: form.get("secret") })
      setSuccess("Credential saved. Verify it with a usage sync when ready.")
      formElement.reset()
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save credential") }
    finally { setPending(false) }
  }

  async function sync(credentialId: string, provider: string) {
    setError(""); setSuccess(""); setSyncing(credentialId)
    const end = new Date(); const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    try {
      const endpoint = provider === "anthropic" ? "/api/ingestion/anthropic" : "/api/ingestion/openai"
      await jsonRequest(endpoint, { workspaceId, credentialId, start: start.toISOString(), end: end.toISOString() })
      setSuccess("Usage sync completed. Dashboard data will refresh now.")
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Usage sync failed") }
    finally { setSyncing(null) }
  }

  return (
    <section id="connections" className="dashboard-panel" aria-labelledby="connections-title">
      <div className="dashboard-panel-heading"><h2 id="connections-title">Provider connections</h2><span>Admin</span></div>
      <p className="dashboard-help">Credentials are encrypted on the server. They are never displayed after submission.</p>
      {!runtimeReady ? (
        <div className="dashboard-state dashboard-state-warning" role="status">
          <strong>Server setup required</strong>
          <span>A deployment administrator must finish protected credential configuration before connections can be saved or synchronized.</span>
        </div>
      ) : null}
      <form className="dashboard-form" onSubmit={submit}>
        <label>Provider<select name="provider" defaultValue="openai" disabled={pending || !runtimeReady}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label>
        <label>Connection label<input name="label" placeholder="Production OpenAI" required disabled={pending || !runtimeReady} /></label>
        <label>Provider API key<input name="secret" type="password" autoComplete="new-password" placeholder="Enter securely — never shown after saving" required disabled={pending || !runtimeReady} /></label>
        <p className="dashboard-help">Never paste a provider key into a URL. Saving a key does not verify the connection.</p>
        <FormMessage error={error} success={success} />
        <button className="primary-button" type="submit" disabled={pending || !runtimeReady}>{pending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Save connection</button>
      </form>
      {credentials.length > 0 && <><div className="plan-divider" /><CredentialRows credentials={credentials} onSync={sync} syncing={syncing} /></>}
    </section>
  )
}

function CredentialRows({ credentials, onSync, syncing }: { credentials: Credential[]; onSync?: (id: string, provider: string) => void; syncing?: string | null }) {
  if (credentials.length === 0) return <p className="dashboard-empty">No provider connections yet.</p>
  return (
    <ul className="dashboard-list connection-list">
      {credentials.map((credential) => {
        const state = !credential.status_available
          ? "Status unavailable"
          : credential.sync_failed
            ? "Last synchronization failed"
            : credential.last_success_at
              ? "Synchronized"
              : credential.secret_saved
                ? "Saved · Not verified"
                : "Credential entry required"
        const detail = credential.sync_failed
          ? `${credential.last_success_at ? `Last successful sync ${syncTime(credential.last_success_at)}. ` : ""}Previous recorded usage is retained. Review the credential and retry.`
          : credential.last_success_at
            ? `Last successful sync ${syncTime(credential.last_success_at)}`
            : credential.secret_saved
              ? "Run a usage sync to verify access."
              : "An owner or admin must securely enter a credential."
        return (
          <li key={credential.id} className="connection-card">
            <div><strong>{credential.label}</strong><span>{credential.provider_name}</span></div>
            <strong className={credential.sync_failed ? "connection-state-error" : "connection-state"}>{state}</strong>
            <span>{detail}</span>
            {credential.provider !== "openai" && credential.provider !== "anthropic" ? <span>Usage synchronization is not available for this provider.</span> : null}
            {onSync && credential.status_available && ["openai", "anthropic"].includes(credential.provider) && credential.secret_saved ? (
              <button className="outline-button compact-button" type="button" onClick={() => onSync(credential.id, credential.provider)} disabled={syncing === credential.id}>
                {syncing === credential.id ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                {syncing === credential.id ? "Synchronizing…" : "Sync now · Last 24 hours"}
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function BudgetManager({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSuccess("")
    setPending(true)
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await jsonRequest("/api/budgets", {
        workspaceId,
        name: form.get("name"),
        amount: form.get("amount"),
        periodStart: form.get("periodStart"),
        periodEnd: form.get("periodEnd"),
        alertThreshold: Number(form.get("alertThreshold")) / 100,
      })
      setSuccess("Budget created and added to the dashboard.")
      formElement.reset()
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create budget")
    } finally {
      setPending(false)
    }
  }
  return (
    <section id="budget-setup" className="dashboard-panel" aria-labelledby="budget-form-title">
      <div className="dashboard-panel-heading"><h2 id="budget-form-title">Add a workspace budget</h2><span>Admin</span></div>
      <p className="dashboard-help">Set a USD limit for a period. Budgets provide visibility and do not stop provider spending.</p>
      <form className="dashboard-form" onSubmit={submit}>
        <label>Budget name<input name="name" placeholder="September AI spend" required disabled={pending} /></label>
        <label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" placeholder="1000" required disabled={pending} /></label>
        <div className="dashboard-form-row"><label>Starts<input name="periodStart" type="date" required disabled={pending} /></label><label>Ends<input name="periodEnd" type="date" required disabled={pending} /></label></div>
        <label>Alert threshold (%)<input name="alertThreshold" type="number" min="0" max="100" defaultValue="80" required disabled={pending} /></label>
        <FormMessage error={error} success={success} />
        <button className="primary-button" type="submit" disabled={pending}>{pending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Create budget</button>
      </form>
    </section>
  )
}

function CatalogManager({ workspaceId, projects, applications }: { workspaceId: string; projects: Project[]; applications: Application[] }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("")
  async function submitProject(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setSuccess(""); setPending(true); const formElement = event.currentTarget; const form = new FormData(formElement); try { await jsonRequest("/api/projects", { workspaceId, name: form.get("projectName"), slug: form.get("projectSlug") }); setSuccess("Project created."); formElement.reset(); router.refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create project") } finally { setPending(false) } }
  async function submitApplication(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setSuccess(""); setPending(true); const formElement = event.currentTarget; const form = new FormData(formElement); try { await jsonRequest("/api/applications", { workspaceId, projectId: form.get("projectId"), name: form.get("applicationName"), slug: form.get("applicationSlug"), environment: form.get("environment") }); setSuccess("Application created."); formElement.reset(); router.refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create application") } finally { setPending(false) } }
  return (
    <section id="projects" className="dashboard-panel catalog-panel" aria-labelledby="catalog-title">
      <div className="dashboard-panel-heading"><h2 id="catalog-title">Projects and applications</h2><span>All members</span></div>
      <p className="dashboard-help">Create labels that can be assigned during usage ingestion. Existing events are not attributed automatically.</p>
      {projects.length > 0 ? <ul className="catalog-list">{projects.map((project) => <li key={project.id}><strong>{project.name}</strong><span>{applications.filter((application) => application.project_id === project.id).length} applications</span></li>)}</ul> : <p className="dashboard-empty">No projects yet. Create one to begin organizing usage.</p>}
      <form className="dashboard-form" onSubmit={submitProject}><strong className="dashboard-form-heading">New project</strong><label>Name<input name="projectName" placeholder="Customer Support" required disabled={pending} /></label><label>Slug<input name="projectSlug" placeholder="customer-support" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required disabled={pending} /></label><button className="outline-button" type="submit" disabled={pending}>{pending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Create project</button></form>
      <div className="plan-divider" />
      <form className="dashboard-form" onSubmit={submitApplication}><strong className="dashboard-form-heading">New application</strong><label>Project<select name="projectId" required disabled={pending}><option value="">Choose a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Name<input name="applicationName" placeholder="support-bot" required disabled={pending} /></label><label>Slug<input name="applicationSlug" placeholder="support-bot" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required disabled={pending} /></label><label>Environment<select name="environment" defaultValue="production" disabled={pending}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option><option value="other">Other</option></select></label><FormMessage error={error} success={success} /><button className="outline-button" type="submit" disabled={pending || projects.length === 0}>{pending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Create application</button>{projects.length === 0 && <p className="dashboard-empty">Create a project first.</p>}</form>
      {applications.length > 0 ? <><div className="plan-divider" /><strong className="dashboard-form-heading">Configured applications</strong><ul className="catalog-list">{applications.map((application) => <li key={application.id}><strong>{application.name}</strong><span>{application.environment}</span></li>)}</ul></> : null}
    </section>
  )
}
