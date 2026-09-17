import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/ forever",
    description: "A little clarity for your everyday.",
    features: [
      "Essential writing & summaries",
      "Personal workspace",
      "Saved prompts",
      "Community support",
    ],
    cta: "Start for free",
  },
  {
    name: "Pro",
    price: "$19",
    period: "/ month",
    description: "More space for your biggest ideas.",
    features: [
      "Everything in Free",
      "Expanded AI usage",
      "Advanced planning workflows",
      "Shared projects",
      "Priority support",
    ],
    cta: "Get started with Pro",
    recommended: true,
  },
  {
    name: "Enterprise",
    price: "Let’s talk",
    period: "",
    description: "A clearer way forward for your team.",
    features: [
      "Everything in Pro",
      "Organization workspaces",
      "Team administration",
      "Personalized onboarding",
      "Dedicated support",
    ],
    cta: "Register your interest",
  },
]
export function Pricing() {
  return (
    <section id="pricing" className="pricing-section">
      <div className="page-width">
        <div className="section-heading">
          <span className="eyebrow">ROOM TO GROW</span>
          <h2>A plan for your kind of progress.</h2>
          <p>Start small. Think big. Find the space that fits.</p>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`pricing-card ${plan.recommended ? "recommended" : ""}`}
            >
              {plan.recommended && (
                <span className="recommended-label">
                  <span>✦</span> The sweet spot
                </span>
              )}
              <h3>{plan.name}</h3>
              <p>{plan.description}</p>
              <div className="price">
                {plan.price}
                <span>{plan.period}</span>
              </div>
              <Link
                className={
                  plan.recommended ? "primary-button" : "outline-button"
                }
                href="/signup"
              >
                {plan.cta}
                <ArrowRight size={16} />
              </Link>
              <div className="plan-divider" />
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="pricing-note">
          Preview pricing for our upcoming product. Signing up creates a free
          account; no payment is collected.
        </p>
      </div>
    </section>
  )
}
