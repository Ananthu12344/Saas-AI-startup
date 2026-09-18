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
  last_error: string | null
}

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

export function DashboardActions({ workspaceId, isAdmin, credentials }: { workspaceId: string; isAdmin: boolean; credentials: Credential[] }) {
  if (!isAdmin) return <CredentialList credentials={credentials} />
  return (
    <div className="dashboard-actions-grid">
      <CredentialManager workspaceId={workspaceId} credentials={credentials} />
      <BudgetManager workspaceId={workspaceId} />
    </div>
  )
}

function CredentialList({ credentials }: { credentials: Credential[] }) {
  return (
    <section className="dashboard-panel" aria-labelledby="connections-title">
      <div className="dashboard-panel-heading"><h2 id="connections-title">Provider connections</h2><span>{credentials.length}</span></div>
      <p className="dashboard-help">Connection management is restricted to workspace owners and admins.</p>
      {credentials.length === 0 ? <p className="dashboard-empty">No provider connections yet.</p> : <CredentialRows credentials={credentials} />}
    </section>
  )
}

function CredentialManager({ workspaceId, credentials }: { workspaceId: string; credentials: Credential[] }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); setPending(true)
    const form = new FormData(event.currentTarget)
    try {
      const result = await jsonRequest("/api/credentials", { workspaceId, provider: form.get("provider"), label: form.get("label") }) as { credential?: { id: string } }
      if (!result.credential?.id) throw new Error("Credential metadata was not returned")
      await jsonRequest(`/api/credentials/${result.credential.id}/secret`, { secret: form.get("secret") })
      setSuccess("Credential saved. Verify it with a usage sync when ready.")
      event.currentTarget.reset()
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save credential") }
    finally { setPending(false) }
  }

  async function sync(credentialId: string) {
    setError(""); setSuccess(""); setSyncing(credentialId)
    const end = new Date(); const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    try {
      await jsonRequest("/api/ingestion/openai", { workspaceId, credentialId, start: start.toISOString(), end: end.toISOString() })
      setSuccess("Usage sync completed. Dashboard data will refresh now.")
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Usage sync failed") }
    finally { setSyncing(null) }
  }

  return (
    <section className="dashboard-panel" aria-labelledby="connections-title">
      <div className="dashboard-panel-heading"><h2 id="connections-title">Provider connections</h2><span>Admin</span></div>
      <p className="dashboard-help">Credentials are encrypted on the server. They are never displayed after submission.</p>
      <form className="dashboard-form" onSubmit={submit}>
        <label>Provider<select name="provider" defaultValue="openai" disabled={pending}><option value="openai">OpenAI</option><option value="anthropic">Anthropic (usage sync unavailable)</option></select></label>
        <label>Connection label<input name="label" placeholder="Production OpenAI" required disabled={pending} /></label>
        <label>Provider API key<input name="secret" type="password" autoComplete="new-password" placeholder="Enter key securely" required disabled={pending} /></label>
        <FormMessage error={error} success={success} />
        <button className="primary-button" type="submit" disabled={pending}>{pending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Save connection</button>
      </form>
      {credentials.length > 0 && <><div className="plan-divider" /><CredentialRows credentials={credentials} onSync={sync} syncing={syncing} /></>}
    </section>
  )
}

function CredentialRows({ credentials, onSync, syncing }: { credentials: Credential[]; onSync?: (id: string) => void; syncing?: string | null }) {
  if (credentials.length === 0) return <p className="dashboard-empty">No provider connections yet.</p>
  return <ul className="dashboard-list connection-list">{credentials.map((credential) => <li key={credential.id}><div><strong>{credential.label}</strong><span>{credential.provider_name}</span></div><span>{credential.last_success_at ? `Last synced ${new Date(credential.last_success_at).toLocaleString()}` : credential.secret_saved ? "Saved, not verified" : "Credential entry required"}{credential.last_error ? ` · ${credential.last_error}` : ""}</span>{onSync && credential.provider === "openai" && credential.secret_saved && <button className="outline-button compact-button" type="button" onClick={() => onSync(credential.id)} disabled={syncing === credential.id}>{syncing === credential.id ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />} Sync now</button>}</li>)}</ul>
}

function BudgetManager({ workspaceId }: { workspaceId: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setSuccess(""); setPending(true); const form = new FormData(event.currentTarget); try { await jsonRequest("/api/budgets", { workspaceId, name: form.get("name"), amount: form.get("amount"), periodStart: form.get("periodStart"), periodEnd: form.get("periodEnd"), alertThreshold: Number(form.get("alertThreshold")) / 100 }); setSuccess("Budget created and added to the dashboard."); event.currentTarget.reset(); router.refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create budget") } finally { setPending(false) } }
  return <section className="dashboard-panel" aria-labelledby="budget-form-title"><div className="dashboard-panel-heading"><h2 id="budget-form-title">Add a workspace budget</h2><span>Admin</span></div><p className="dashboard-help">Set a USD limit for a period. Existing budgets remain visible below.</p><form className="dashboard-form" onSubmit={submit}><label>Budget name<input name="name" placeholder="September AI spend" required disabled={pending} /></label><label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" placeholder="1000" required disabled={pending} /></label><div className="dashboard-form-row"><label>Starts<input name="periodStart" type="date" required disabled={pending} /></label><label>Ends<input name="periodEnd" type="date" required disabled={pending} /></label></div><label>Alert threshold (%)<input name="alertThreshold" type="number" min="0" max="100" defaultValue="80" required disabled={pending} /></label><FormMessage error={error} success={success} /><button className="primary-button" type="submit" disabled={pending}>{pending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Create budget</button></form></section>
}
