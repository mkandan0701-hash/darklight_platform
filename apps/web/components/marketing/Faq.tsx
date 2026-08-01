const FAQS = [
  {
    q: "Do you have pricing tiers for a small academy?",
    a: "Yes — plans run $19, $49, and $99 per month. The $49 Growth tier is built for a one-coach academy with around 50 students.",
  },
  {
    q: "How does time zone scheduling actually work?",
    a: "A coach schedules a session once. Every student and parent sees it converted to their own device's time zone automatically — nobody has to do the math.",
  },
  {
    q: "Can I invoice in both USD and INR?",
    a: "Yes. Invoices are stored in their original currency (USD via Stripe, INR via Razorpay) — amounts are never silently converted between currencies.",
  },
  {
    q: "Is my academy's data separated from other academies on the platform?",
    a: "Yes. Every academy is its own tenant with its own subdomain, and every query is scoped to that tenant at the database layer.",
  },
  {
    q: "Do you replace Zoom for live lessons?",
    a: "Live sessions run on a shared board with built-in audio, plus a private reference board only the coach can see. It's built for teaching a chess position, not general video conferencing.",
  },
  {
    q: "What happens to a puzzle attempt if a student gets it wrong?",
    a: "It's still logged. Every move a student tries is recorded, right or wrong, so a coach can see exactly where a student got stuck.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-20 md:px-10">
      <h2 className="text-center font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
        Frequently asked questions
      </h2>
      <div className="mt-10 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white shadow-sm">
        {FAQS.map((item) => (
          <details key={item.q} className="group px-6 py-5 open:pb-6 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink focus-visible:ring-2 focus-visible:ring-board">
              {item.q}
              <span className="text-xl leading-none text-board transition-transform motion-reduce:transition-none group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-[15px] leading-relaxed text-slate">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
