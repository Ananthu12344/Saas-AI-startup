import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  Gauge,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
const features = [
  {
    icon: BarChart3,
    title: "See usage at a glance",
    description:
      "Track tokens, requests, and spend over time from one workspace observatory.",
  },
  {
    icon: CircleDollarSign,
    title: "Understand provider cost",
    description:
      "Compare cost across connected providers and models with clear USD estimates.",
  },
  {
    icon: Boxes,
    title: "Understand project spend",
    description:
      "Review usage by project and application so teams can see where recorded spend comes from.",
  },
  {
    icon: Gauge,
    title: "Keep budgets visible",
    description:
      "Monitor active budget periods, remaining allowance, and threshold status.",
  },
  {
    icon: TriangleAlert,
    title: "Investigate unusual usage",
    description:
      "Review explainable potential inefficiencies and daily cost anomalies before they grow.",
  },
  {
    icon: ShieldCheck,
    title: "Protect provider access",
    description:
      "Keep provider credentials server-side and scope every workspace record with RLS.",
  },
]
export function Features() {
  return (
    <>
      <section id="features" className="features-section">
        <div className="page-width">
          <div className="section-heading">
            <span className="eyebrow">ONE VIEW. BETTER DECISIONS.</span>
            <h2>Your AI usage, made understandable.</h2>
            <p>
              The signals your team needs to manage usage and spending across AI providers.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, description }, index) => (
              <article className="feature-card" key={title}>
                <span className={`feature-icon tone-${index % 3}`}>
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="how-it-works" className="how-section page-width">
        <div>
          <span className="eyebrow">FROM DATA TO ACTION</span>
          <h2>
            Connect the dots.
            <br />
            Make a better call.
          </h2>
          <LinkButton />
        </div>
        <ol>
          {[
            [
              "Connect a provider",
              "Add a server-managed provider connection when you are ready to collect usage.",
            ],
            [
              "Normalize usage",
              "Bring provider-specific events into one consistent view of tokens and cost.",
            ],
            [
              "Act on the signal",
              "Use attribution, budgets, and explainable findings to decide what to investigate next.",
            ],
          ].map(([title, text], index) => (
            <li key={title}>
              <span>0{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
import Link from "next/link"
import { ArrowRight } from "lucide-react"
function LinkButton() {
  return (
    <Link className="text-link inline-flex items-center gap-2" href="/signup">
      Get started for free <ArrowRight size={16} />
    </Link>
  )
}
