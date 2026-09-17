import Link from "next/link"
import { Sparkles, ArrowUpRight } from "lucide-react"

const socialIcons = [
  {
    name: "GitHub",
    path: "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.39.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.58 4.95.36.31.68.92.68 1.85v2.75c0 .26.18.58.69.48A10 10 0 0 0 12 2Z",
  },
  {
    name: "LinkedIn",
    path: "M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 9h4v12H3ZM9 9h4v1.6c.6-1.1 1.9-1.9 3.5-1.9 3.5 0 4.5 2.2 4.5 5.3v7h-4v-6.2c0-1.5-.3-2.7-1.9-2.7-1.8 0-2.1 1.4-2.1 2.7V21H9Z",
  },
  {
    name: "Instagram",
    path: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Zm5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.5-3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
  },
]

export function Footer() {
  return (
    <footer className="site-footer page-width">
      <div className="footer-top">
        <div className="footer-brand">
          <Link className="brand" href="/">
            <span className="logo-mark">
              <Sparkles size={19} />
            </span>
            Clarity<span className="brand-ai">AI</span>
          </Link>
          <p>
            A little less busy.
            <br />A little more brilliant.
          </p>
          <div
            className="social-icons"
            aria-label="Social profiles coming soon"
          >
            {socialIcons.map(({ name, path }) => (
              <span key={name} title={`${name} profile coming soon`}>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  role="img"
                  aria-label={`${name} coming soon`}
                >
                  <path d={path} fillRule="evenodd" />
                </svg>
              </span>
            ))}
          </div>
        </div>
        <div className="footer-links">
          <h3>Explore</h3>
          <Link href="/#features">Features</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#pricing">Pricing</Link>
        </div>
        <div className="footer-links">
          <h3>Your workspace</h3>
          <Link href="/signup">
            Get started <ArrowUpRight size={12} />
          </Link>
          <Link href="/login">Sign in</Link>
          <Link href="/forgot-password">Account recovery</Link>
        </div>
        <div className="footer-message">
          <span className="status-dot" />
          <span>
            Made for a more
            <br />
            thoughtful workday.
          </span>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Clarity AI. All rights reserved.
        </span>
        <span>A little clarity changes everything.</span>
      </div>
    </footer>
  )
}
