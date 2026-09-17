import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Sparkles,
  LayoutGrid,
  FileText,
  MessageSquare,
  Plus,
  Command,
} from "lucide-react"

export function Hero() {
  return (
    <section className="hero page-width">
      <div className="hero-copy">
        <div className="eyebrow">
          <span className="status-dot" /> Track AI usage. Understand your spend.
        </div>
        <h1>
          See your AI usage.
          <br />
          <span>Understand your spend.</span>
        </h1>
        <p>
          Track AI usage, monitor costs, and understand spending across your
          connected providers.
        </p>
        <div className="hero-buttons">
          <Link href="/signup" className="primary-button">
            Explore your observatory — it’s free <ArrowRight size={17} />
          </Link>
          <Link href="#how-it-works" className="quiet-button">
            See how it works <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="hero-note">
          <span>
            <Check size={14} /> Free to get started
          </span>
          <span>
            <Check size={14} /> No credit card needed
          </span>
        </div>
      </div>
      <div
        className="hero-art"
        aria-label="Illustrative TokenLens workspace preview"
      >
        <div className="workspace">
          <div className="workspace-top">
            <span className="flex gap-1.5">
              <i />
              <i />
              <i />
            </span>
            <span>tokenlens / your workspace</span>
            <Command size={13} />
          </div>
          <div className="workspace-body">
            <aside className="workspace-sidebar">
              <span className="mini-logo">
                <Sparkles size={16} />
              </span>
              <LayoutGrid size={17} />
              <FileText size={17} />
              <MessageSquare size={17} />
              <Plus size={17} />
            </aside>
            <div className="workspace-main">
              <div className="workspace-greeting">YOUR AI OBSERVATORY</div>
              <h2>
                Usage at a glance <span>✳</span>
              </h2>
              <p>See what your connected providers are costing.</p>
              <div className="prompt-card">
                <Sparkles size={17} />
                <span>Spend this month · $1,284.60</span>
                <span className="prompt-send">
                  <ArrowUpRight size={15} />
                </span>
              </div>
              <div className="preview-tabs">
                <span className="active">Cost by provider</span>
                <span>Usage over time</span>
                <Plus size={13} />
              </div>
              <div className="preview-projects">
                <div>
                  <span className="project-icon lavender">
                    <FileText size={18} />
                  </span>
                  <strong>OpenAI</strong>
                  <small>$842.10 · 65.6%</small>
                  <div className="preview-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="project-tag">Provider</span>
                </div>
                <div>
                  <span className="project-icon peach">
                    <Sparkles size={18} />
                  </span>
                  <strong>Anthropic</strong>
                  <small>$442.50 · 34.4%</small>
                  <div className="preview-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="project-tag">Provider</span>
                </div>
              </div>
              <div className="workspace-bottom">
                <span className="status-dot" /> One clear view across your providers.
              </div>
            </div>
          </div>
        </div>
        <div className="floating-note">
          <span className="note-icon">
            <Check size={19} />
          </span>
          <div>
            <strong>Find the signal.</strong>
            <span>Usage, cost, and anomalies in one place.</span>
          </div>
          <Sparkles size={18} />
        </div>
        <span className="preview-caption">
          A glimpse of your usage observatory · Illustrative preview
        </span>
      </div>
    </section>
  )
}
