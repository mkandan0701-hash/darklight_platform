// One original illustration per feature tab, in a single flat-vector style so
// the set reads as one family. Inline SVG rather than raster art: no extra
// network requests, sharp at any size, and recoloured straight from the brand
// tokens.
//
// To swap any of these for a real image later: drop the file in
// apps/web/public/ and replace that component's body with
// <Image src="/your-file.png" alt="…" width={400} height={300} />.

// Moved to components/art/palette.ts once the dashboard art, the static board
// and the piece avatars needed the same hex values.
import {
  BOARD,
  BOARD_LIGHT,
  BRICK,
  GOLD,
  GOLD_LIGHT,
  INK,
  PARCHMENT,
  SLATE_LIGHT,
} from "../art/palette";

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 400 300" className="h-auto w-full" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

export function LiveClassroomArt() {
  return (
    <Frame label="A live class: a shared chessboard beside a grid of student video tiles">
      <rect x="20" y="30" width="360" height="240" rx="14" fill="#FFFFFF" stroke={INK} strokeOpacity="0.12" />
      <path d="M20 44a14 14 0 0114-14h332a14 14 0 0114 14v14H20z" fill={PARCHMENT} />
      <g fill={INK} opacity="0.25">
        <circle cx="38" cy="44" r="3.5" />
        <circle cx="50" cy="44" r="3.5" />
        <circle cx="62" cy="44" r="3.5" />
      </g>
      <rect x="318" y="37" width="46" height="15" rx="7.5" fill={BRICK} />
      <text x="341" y="48" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700">
        LIVE
      </text>

      {/* shared board */}
      <g>
        {Array.from({ length: 36 }).map((_, i) => {
          const row = Math.floor(i / 6);
          const col = i % 6;
          return (
            <rect
              key={i}
              x={40 + col * 26}
              y={76 + row * 26}
              width="26"
              height="26"
              fill={(row + col) % 2 === 1 ? BOARD : BOARD_LIGHT}
            />
          );
        })}
        <rect x="40" y="76" width="156" height="156" fill="none" stroke={INK} strokeOpacity="0.15" />
      </g>

      {/* student tiles */}
      {[0, 1, 2].map((row) =>
        [0, 1].map((col) => {
          const x = 216 + col * 80;
          const y = 76 + row * 54;
          return (
            <g key={`${row}-${col}`}>
              <rect x={x} y={y} width="72" height="50" rx="7" fill={BOARD_LIGHT} />
              <circle cx={x + 36} cy={y + 19} r="9" fill={BOARD} />
              <rect x={x + 24} y={y + 32} width="24" height="10" rx="5" fill={BOARD} />
            </g>
          );
        })
      )}
    </Frame>
  );
}

export function HomeworkArt() {
  return (
    <Frame label="A stack of puzzle cards with solved checkmarks and a progress strip">
      <rect x="82" y="50" width="236" height="168" rx="12" fill={SLATE_LIGHT} />
      <rect x="71" y="62" width="258" height="168" rx="12" fill={BOARD_LIGHT} />
      <rect x="60" y="76" width="280" height="170" rx="12" fill="#FFFFFF" stroke={INK} strokeOpacity="0.12" />

      {/* mini puzzle board */}
      <g>
        {Array.from({ length: 16 }).map((_, i) => {
          const row = Math.floor(i / 4);
          const col = i % 4;
          return (
            <rect
              key={i}
              x={80 + col * 28}
              y={98 + row * 28}
              width="28"
              height="28"
              fill={(row + col) % 2 === 1 ? BOARD : BOARD_LIGHT}
            />
          );
        })}
        <rect x="80" y="98" width="112" height="112" fill="none" stroke={INK} strokeOpacity="0.15" />
      </g>

      {/* attempt log rows */}
      {[0, 1, 2].map((i) => {
        const y = 106 + i * 36;
        const solved = i < 2;
        return (
          <g key={i}>
            <circle cx="222" cy={y} r="10" fill={solved ? BOARD : SLATE_LIGHT} />
            {solved && (
              <path
                d={`M217 ${y} l3.5 3.5 L227 ${y - 4}`}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            <rect x="240" y={y - 4} width="76" height="8" rx="4" fill={SLATE_LIGHT} />
          </g>
        );
      })}

      {/* rank progress strip */}
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x={80 + i * 30}
          y="222"
          width="30"
          height="11"
          fill={i < 4 ? BOARD : i === 4 ? GOLD : i % 2 === 1 ? SLATE_LIGHT : "#FFFFFF"}
        />
      ))}
      <rect x="80" y="222" width="240" height="11" fill="none" stroke={INK} strokeOpacity="0.15" />
    </Frame>
  );
}

export function SchedulingArt() {
  return (
    <Frame label="A calendar with a selected date, a clock, and two time-zone labels">
      <rect x="40" y="52" width="212" height="196" rx="12" fill="#FFFFFF" stroke={INK} strokeOpacity="0.12" />
      <path d="M40 66a12 12 0 0112-12h188a12 12 0 0112 12v22H40z" fill={BOARD} />
      <rect x="74" y="42" width="10" height="22" rx="5" fill={INK} opacity="0.4" />
      <rect x="208" y="42" width="10" height="22" rx="5" fill={INK} opacity="0.4" />

      {/* weekday headers */}
      {Array.from({ length: 7 }).map((_, i) => (
        <rect key={i} x={56 + i * 27} y="100" width="16" height="5" rx="2.5" fill={SLATE_LIGHT} />
      ))}

      {/* date cells */}
      {Array.from({ length: 28 }).map((_, i) => {
        const row = Math.floor(i / 7);
        const col = i % 7;
        const selected = i === 17;
        return selected ? (
          <circle key={i} cx={64 + col * 27} cy={126 + row * 27} r="11" fill={BOARD} />
        ) : (
          <circle key={i} cx={64 + col * 27} cy={126 + row * 27} r="4" fill={INK} opacity="0.18" />
        );
      })}

      {/* time-zone pills */}
      <g>
        <rect x="264" y="64" width="104" height="30" rx="15" fill={BOARD_LIGHT} />
        <text x="316" y="83" textAnchor="middle" fill={BOARD} fontSize="13" fontWeight="700">
          7:00 PM IST
        </text>
        <rect x="264" y="104" width="104" height="30" rx="15" fill={GOLD_LIGHT} />
        <text x="316" y="123" textAnchor="middle" fill={INK} fontSize="13" fontWeight="700">
          9:30 AM EST
        </text>
      </g>

      {/* clock */}
      <circle cx="316" cy="200" r="46" fill="#FFFFFF" stroke={BOARD} strokeWidth="7" />
      <path
        d="M316 172v28l19 11"
        fill="none"
        stroke={INK}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function InvoicingArt() {
  return (
    <Frame label="An invoice with line items, shown alongside US dollar and Indian rupee badges">
      <path
        d="M110 40h180v196l-15 10l-15-10l-15 10l-15-10l-15 10l-15-10l-15 10l-15-10l-15 10l-15-10l-15 10l-15-10z"
        fill="#FFFFFF"
        stroke={INK}
        strokeOpacity="0.12"
      />
      <path d="M110 40h180v42H110z" fill={BOARD} />
      <text x="200" y="68" textAnchor="middle" fill="#FFFFFF" fontSize="15" fontWeight="700">
        INVOICE
      </text>

      {[0, 1, 2].map((i) => {
        const y = 106 + i * 26;
        return (
          <g key={i}>
            <rect x="128" y={y} width="88" height="8" rx="4" fill={SLATE_LIGHT} />
            <rect x="236" y={y} width="36" height="8" rx="4" fill={SLATE_LIGHT} />
          </g>
        );
      })}

      <rect x="128" y="192" width="144" height="1.5" fill={INK} opacity="0.15" />
      <rect x="128" y="204" width="56" height="10" rx="5" fill={INK} opacity="0.55" />
      <rect x="222" y="204" width="50" height="10" rx="5" fill={GOLD} />

      {/* currency badges */}
      <circle cx="76" cy="118" r="26" fill={GOLD_LIGHT} />
      <text x="76" y="128" textAnchor="middle" fill={INK} fontSize="26" fontWeight="700">
        $
      </text>
      <circle cx="324" cy="182" r="26" fill={BOARD_LIGHT} />
      <text x="324" y="192" textAnchor="middle" fill={BOARD} fontSize="24" fontWeight="700">
        ₹
      </text>
    </Frame>
  );
}

export function ParentPortalArt() {
  return (
    <Frame label="A phone showing a student's progress chart, with an update notification">
      <rect x="132" y="28" width="136" height="244" rx="22" fill="#FFFFFF" stroke={INK} strokeOpacity="0.18" strokeWidth="3" />
      <rect x="178" y="40" width="44" height="6" rx="3" fill={INK} opacity="0.2" />

      {/* student header */}
      <circle cx="164" cy="80" r="13" fill={BOARD} />
      <rect x="184" y="72" width="60" height="8" rx="4" fill={SLATE_LIGHT} />
      <rect x="184" y="86" width="38" height="6" rx="3" fill={SLATE_LIGHT} />

      {/* progress chart */}
      <rect x="150" y="110" width="100" height="92" rx="8" fill={PARCHMENT} />
      {[
        { x: 162, h: 26 },
        { x: 184, h: 42 },
        { x: 206, h: 56 },
        { x: 228, h: 70 },
      ].map((bar, i) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={190 - bar.h}
          width="12"
          height={bar.h}
          rx="4"
          fill={i === 3 ? GOLD : BOARD}
          opacity={i === 3 ? 1 : 0.35 + i * 0.2}
        />
      ))}

      {/* list rows */}
      {[0, 1].map((i) => (
        <g key={i}>
          <circle cx="162" cy={222 + i * 24} r="7" fill={BOARD_LIGHT} />
          <rect x="176" y={218 + i * 24} width="70" height="7" rx="3.5" fill={SLATE_LIGHT} />
        </g>
      ))}

      {/* notification card */}
      <g>
        <rect x="252" y="88" width="128" height="54" rx="12" fill="#FFFFFF" stroke={INK} strokeOpacity="0.12" />
        <circle cx="278" cy="115" r="13" fill={BOARD} />
        <path
          d="M272 115l4.5 4.5L285 110"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="300" y="104" width="62" height="8" rx="4" fill={SLATE_LIGHT} />
        <rect x="300" y="119" width="44" height="7" rx="3.5" fill={SLATE_LIGHT} />
      </g>

      {/* parent + child avatars */}
      <g>
        <circle cx="60" cy="196" r="20" fill={GOLD_LIGHT} />
        <circle cx="60" cy="189" r="7" fill={GOLD} />
        <path d="M47 208a13 13 0 0126 0z" fill={GOLD} />
        <circle cx="96" cy="214" r="15" fill={BOARD_LIGHT} />
        <circle cx="96" cy="209" r="5.5" fill={BOARD} />
        <path d="M86 223a10 10 0 0120 0z" fill={BOARD} />
      </g>
    </Frame>
  );
}
