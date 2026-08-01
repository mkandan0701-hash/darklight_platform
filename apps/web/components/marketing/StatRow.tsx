const ITEMS = [
  {
    title: "Schedule once, works everywhere",
    description: "Every family sees the class in their own local time. No more time-zone math.",
  },
  {
    title: "Get paid in USD or INR",
    description: "Stripe and Razorpay, side by side. Zero manual conversion.",
  },
  {
    title: "Parents actually stay in the loop",
    description: "Progress, attendance and homework in a view they'll genuinely open.",
  },
  {
    title: "Every single move logged",
    description: "See exactly where a student got stuck — not just whether they got it right.",
  },
];

export function StatRow() {
  return (
    <section className="mx-auto max-w-6xl px-6 md:px-10">
      <div className="grid grid-cols-1 gap-8 rounded-2xl border border-ink/10 bg-white p-8 shadow-sm sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {ITEMS.map((item) => (
          <div key={item.title}>
            <p className="font-display text-base font-bold tracking-tight text-ink">{item.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
