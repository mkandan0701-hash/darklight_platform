# Auth hero photograph

Shown on the left of `/login`, `/signup` and `/set-password` (see
`components/auth/AuthShell.tsx`).

| | |
|---|---|
| File | `children-playing-chess.webp` |
| Subject | Two children playing chess at a classroom table |
| Photographer | Anastasia Shuraeva — https://www.pexels.com/@anastasia-shuraeva/ |
| Source | https://www.pexels.com/photo/a-young-girl-and-a-boy-playing-chess-together-8466020/ |
| Licence | [Pexels License](https://www.pexels.com/license/) — free for commercial use, no attribution required (credited here anyway) |
| Downloaded | 2026-10-19 |

**Served locally, never hotlinked.** The file was fetched once from the Pexels
CDN at 2400 × 1602, already encoded as WebP (`fm=webp&q=80`), and committed —
the page has no runtime dependency on pexels.com.

| File | Bytes | SHA-256 |
|---|---|---|
| `children-playing-chess.webp` | 142,030 | `e2e67ee6e995704b00b6bc72323a21f671e9b93483475e9eb2035aa2defd304b` |

The subject's focal point (the girl and the board) sits at roughly 62% across,
45% down; `AuthShell` sets `object-position: 62% 40%` (a touch higher, to
favour her face over the board) so tall and narrow crops keep her in frame. If you replace the photo, update that value too.

The Pexels License does not permit selling the photo unaltered or implying
endorsement by the people pictured — don't use it in ads that suggest these
children are students of a specific academy.
