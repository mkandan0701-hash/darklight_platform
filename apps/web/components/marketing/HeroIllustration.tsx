// Original inline SVG (no external asset, so nothing to load or 404).
// Theme: promotion — a pawn becomes a champion. It is the one "students
// achieve everything" metaphor that is native to chess rather than generic
// stock imagery.
//
// To swap in a real illustration later: drop the file in apps/web/public/ and
// replace this component's body with an <Image src="/your-file.png" .../>.
export function HeroIllustration() {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-lg shadow-ink/5">
      <svg
        viewBox="0 0 440 340"
        className="h-auto w-full"
        role="img"
        aria-label="A pawn rising through the ranks to become a champion, standing on a winner's podium with a trophy"
      >
        <defs>
          <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0BE4A" />
            <stop offset="100%" stopColor="#C9A227" />
          </linearGradient>
          <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2A8760" />
            <stop offset="100%" stopColor="#1F6D4C" />
          </linearGradient>
        </defs>

        {/* soft backdrop */}
        <circle cx="220" cy="150" r="118" fill="#E8F2EC" opacity="0.55" />

        {/* sparkles */}
        <g fill="#C9A227">
          <path d="M118 74l3.4 7.6 7.6 3.4-7.6 3.4-3.4 7.6-3.4-7.6-7.6-3.4 7.6-3.4z" />
          <path d="M330 62l2.6 5.8 5.8 2.6-5.8 2.6-2.6 5.8-2.6-5.8-5.8-2.6 5.8-2.6z" />
          <path d="M356 138l2.2 4.9 4.9 2.2-4.9 2.2-2.2 4.9-2.2-4.9-4.9-2.2 4.9-2.2z" />
          <path d="M88 156l2.2 4.9 4.9 2.2-4.9 2.2-2.2 4.9-2.2-4.9-4.9-2.2 4.9-2.2z" />
        </g>

        {/* trophy */}
        <g>
          <path
            d="M198 116h44v16c0 13-9.9 23-22 23s-22-10-22-23z"
            fill="url(#goldGrad)"
          />
          <path
            d="M198 124c-12 0-17 7-17 14s7 14 17 14M242 124c12 0 17 7 17 14s-7 14-17 14"
            fill="none"
            stroke="#C9A227"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <rect x="215" y="155" width="10" height="16" fill="#C9A227" />
          <rect x="204" y="171" width="32" height="8" rx="3" fill="url(#goldGrad)" />
          <rect x="196" y="179" width="48" height="11" rx="4" fill="#C9A227" />
          {/* crown mark on the cup */}
          <path
            d="M210 128l5 6 5-8 5 8 5-6v9h-20z"
            fill="#FFFFFF"
            opacity="0.85"
          />
        </g>

        {/* podium */}
        <rect x="60" y="230" width="100" height="90" rx="6" fill="#CBDDD3" />
        <rect x="170" y="190" width="100" height="130" rx="6" fill="url(#greenGrad)" />
        <rect x="280" y="255" width="100" height="65" rx="6" fill="#CBDDD3" />

        {/* pawn — second place */}
        <g fill="#5B6472">
          <circle cx="110" cy="196" r="9" />
          <path d="M101 209h18l-3 8c6 4.6 9 9.6 10 13H94c1-3.4 4-8.4 10-13z" />
          <rect x="92" y="223" width="36" height="7" rx="3" />
        </g>

        {/* pawn — third place */}
        <g fill="#5B6472">
          <circle cx="330" cy="221" r="9" />
          <path d="M321 234h18l-3 8c6 4.6 9 9.6 10 13h-35c1-3.4 4-8.4 10-13z" />
          <rect x="312" y="248" width="36" height="7" rx="3" />
        </g>

        {/* podium rank numerals */}
        <g fill="#FFFFFF" fontSize="20" fontWeight="700" textAnchor="middle">
          <text x="220" y="240">
            1
          </text>
        </g>
        <g fill="#7C8A93" fontSize="16" fontWeight="700" textAnchor="middle">
          <text x="110" y="270">
            2
          </text>
          <text x="330" y="292">
            3
          </text>
        </g>
      </svg>

      <p className="mt-4 text-center font-display text-base font-bold tracking-tight text-ink">
        Every student starts as a pawn
      </p>
      <p className="mt-1 text-center text-sm leading-relaxed text-slate">
        Track them all the way to the podium.
      </p>
    </div>
  );
}
