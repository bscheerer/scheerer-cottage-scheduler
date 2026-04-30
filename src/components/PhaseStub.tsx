interface Props {
  phase: string;
  title: string;
  blurb: string;
}

/**
 * Friendly placeholder for pages that will be built in later phases.
 * Phase 1 ships the foundation only — these pages will be replaced with
 * real implementations in Phases 2–4.
 */
export default function PhaseStub({ phase, title, blurb }: Props) {
  return (
    <section className="bg-white rounded-2xl shadow-soft border border-deep/10 p-8">
      <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-mid uppercase">
        <span className="w-6 h-0.5 bg-aqua rounded" />
        Coming in {phase}
      </div>
      <h2 className="font-display text-2xl text-deep mt-2 mb-3">{title}</h2>
      <p className="text-ink/80 max-w-prose">{blurb}</p>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { c: "bg-foam border-aqua/40 text-deep", t: "Designed" },
          { c: "bg-sand-light border-sunset-amber/50 text-driftwood", t: "Spec'd" },
          { c: "bg-white border-deep/10 text-muted", t: "Build" },
        ].map((s) => (
          <div
            key={s.t}
            className={`rounded-xl border-2 p-4 text-sm font-semibold ${s.c}`}
          >
            {s.t}
          </div>
        ))}
      </div>
    </section>
  );
}
