import { Button } from "../ui/Button";
import { BOOK_DEMO_URL } from "./config";

const PLANS = [
  {
    name: "Starter",
    price: 19,
    tagline: "For the coach finally ditching spreadsheets.",
    features: ["Up to 15 students", "Classrooms & homework", "Time-zone scheduling"],
    featured: false,
  },
  {
    name: "Growth",
    price: 49,
    tagline: "For a small academy running weekly batches.",

    features: [
      "Up to 100 students",
      "Everything in Starter",
      "Live sessions with reference board",
      "Multi-currency invoicing",
      "Parent portal",
    ],
    featured: true,
  },
  {
    name: "Academy",
    price: 99,
    tagline: "For multi-coach academies that are scaling fast.",
    features: [
      "Unlimited students",
      "Everything in Growth",
      "Multiple coaches",
      "Tournaments & simuls",
    ],
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-20 md:px-10">
      <div className="text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Pricing that won&apos;t surprise you
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate">
          Billed monthly in USD. Cancel whenever — no lock-in, no awkward sales call.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              plan.featured
                ? "border-board bg-white shadow-lg shadow-board/10 md:-mt-4 md:pb-12"
                : "border-ink/10 bg-white shadow-sm"
            }`}
          >
            {plan.featured && (
              <span className="absolute -top-3 left-8 rounded-full bg-board px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </span>
            )}
            <p className="font-display text-lg font-bold tracking-tight text-ink">{plan.name}</p>
            <p className="mt-1 text-sm text-slate">{plan.tagline}</p>
            <p className="mt-5 font-display text-4xl font-extrabold tracking-tight text-ink">
              ${plan.price}
              <span className="ml-1 text-base font-medium text-slate">/month</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm leading-relaxed text-ink/80">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <span className="mt-0.5 font-semibold text-board">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <a href={BOOK_DEMO_URL} className="mt-8">
              <Button variant={plan.featured ? "primary" : "secondary"} className="w-full !py-3">
                Book Demo
              </Button>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
