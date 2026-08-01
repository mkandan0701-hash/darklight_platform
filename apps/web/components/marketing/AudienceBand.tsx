const AUDIENCES = [
  {
    title: "Coaching from India, students abroad",
    description:
      "Half your students are asleep when you're teaching. Scheduling, invoicing and reports all speak their time zone and their currency — so you stop doing the mental math at midnight.",
  },
  {
    title: "Based in the US or UK, teaching on the side",
    description:
      "Running an academy around a day job. One dashboard for classes, homework and parent updates — instead of six tabs and a spreadsheet holding it all together.",
  },
];

export function AudienceBand() {
  return (
    <section id="audience" className="bg-ink py-20">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          Sound like you?
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="rounded-2xl border border-white/10 bg-white/5 p-8">
              <p className="font-display text-xl font-bold tracking-tight text-gold">{a.title}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-white/75">{a.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
