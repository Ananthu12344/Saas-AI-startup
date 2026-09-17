import {
  PenLine,
  AlignLeft,
  ListChecks,
  Bookmark,
  Users,
  FolderOpen,
} from "lucide-react"
const features = [
  {
    icon: PenLine,
    title: "Find the right words",
    description:
      "From first drafts to final polish, give your ideas a voice that sounds like you.",
  },
  {
    icon: AlignLeft,
    title: "Get to the good part",
    description:
      "Turn long documents and scattered notes into clear, useful takeaways.",
  },
  {
    icon: ListChecks,
    title: "Make a plan. Make progress.",
    description:
      "Break your next big idea into small, achievable steps. Know what comes next.",
  },
  {
    icon: Bookmark,
    title: "Keep what works",
    description:
      "Save your favorite prompts and repeat your best workflows without starting over.",
  },
  {
    icon: Users,
    title: "Better, together",
    description:
      "Bring your team’s thinking into one shared space. Build on each other’s ideas.",
  },
  {
    icon: FolderOpen,
    title: "A place for every idea",
    description:
      "Keep drafts, notes, and projects organized, so your next great thought never gets lost.",
  },
]
export function Features() {
  return (
    <>
      <section id="features" className="features-section">
        <div className="page-width">
          <div className="section-heading">
            <span className="eyebrow">LESS FRICTION. MORE POSSIBILITY.</span>
            <h2>One workspace. A clearer mind.</h2>
            <p>
              Everything you need to go from “what if” to “look what I made.”
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
          <span className="eyebrow">YOUR NEXT GOOD IDEA STARTS HERE</span>
          <h2>
            Less setup.
            <br />
            More doing.
          </h2>
          <LinkButton />
        </div>
        <ol>
          {[
            [
              "Bring your idea",
              "A rough note, a blank page, a big question. Start wherever you are.",
            ],
            [
              "Find your flow",
              "Write, explore, and make a plan with a little help from AI.",
            ],
            [
              "Make it yours",
              "Refine the details, bring in your team, and move your work forward.",
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
