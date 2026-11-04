# NEXORA / Deadline Tracker design system

One identity for the pitch (`/pitch`) and the app. It comes from the Deadline Tracker logo: a countdown ring that is almost full, a check mark, and a gold dot where time runs out.

## Colour
| Role | Dark (pitch, app dark theme) | Light (app light theme) | Used for |
|---|---|---|---|
| Ink (background) | `#070A14` → `#0C1122` | `#EEF1F8` | page background |
| Indigo (primary) | `#7383FF` | `#3349D9` | main buttons, active items, links, the countdown ring |
| Teal (progress) | `#2DD4BF` | `#0F8F80` | "on track", finished work, positive change |
| Amber (deadline) | `#FBBF4C` | `#9A6A00` | the deadline itself, highlights, one word per heading at most |
| Coral (risk) | `#FF7A6B` | `#C2412D` | overload, overdue, risk |
| Text | `#EEF1FA` / `#B6BED6` / `#8A93AE` | `#10152A` / `#384058` / `#5A6480` | main / secondary / quiet |

Rules: indigo leads; teal, amber and coral carry meaning (fine, deadline, risk), so they are never used for decoration only. Text on glass stays at 4.5:1 or more.

## Type
- **Bricolage Grotesque** (display): headings and the 3D title. Optical size follows the font size.
- **IBM Plex Sans** (body): everything people read.
- **IBM Plex Mono** (labels): numbers, chapter numbers, small labels.

3D type: the NEXORA title is built from stacked layers that give the letters real depth; it turns a little toward the pointer. Slide headings rise word by word, flipping up from below in 3D, once per slide. Nothing loops on text, and all text is real text that screen readers read.

## Glass
Frosted panels: a light-to-clear gradient, 14 px blur with a little saturation, a one-pixel edge, a bright top reflection line and a soft shadow underneath. On hover a narrow sheen sweeps across once and the panel lifts 2 px. Without blur support, panels become solid ink so text stays readable.

## Motion
Three different 3D scenes, each with one job:
1. **Countdown Orbit** (title and closing slides): a chrome countdown ring fills to the gold deadline dot while task tiles orbit and cast shadows. It says "time is visible".
2. **Risk Radar** (solution slide): a 3D radar disc; each task is a pillar whose height is its work left. Pillars drift toward the centre as time passes and turn amber, then coral. The sweep makes them pulse. It explains the risk equation.
3. **Week Rebalance** (how-it-works slide): a week of hour blocks. Overloaded days glow coral above a glass capacity plane, then the extra blocks fly to free days and turn teal. It shows what the planner does.

Each scene starts only when its slide is shown, pauses when it isn't, renders one still frame with reduced motion, and is replaced by a still illustration without WebGL.

## App palette: Ivory & Copper (Nov 2026, branch `gsap-panels`)
The app moved away from indigo on navy ("black and blue") to a warm palette. The pitch still uses the indigo palette above until it is brought in line.

| Role | Light | Dark (espresso) |
|---|---|---|
| Background | `#F6F1E7` ivory | `#15110D` espresso |
| Surface | `#FFFDF9` | `#231C15` |
| Text / secondary / quiet | `#1F1A14` / `#463D33` / `#6A5E4F` | `#F3EBDF` / `#D8CCBC` / `#AB9D8A` |
| Primary (copper) | `#A4501C`, white text | `#E9A36E`, dark text |
| Progress (emerald) | `#23715D` | `#5CC6A4` |
| Deadline (gold) | `#9A6A00` | `#FBBF4C` |
| Risk (coral) | `#C2412D` | `#FF7A6B` |

The logo keeps its shape; its tile is now copper (`#C8723A` → `#8C4115`) with the gold deadline dot. Group colours for new subjects avoid blue and violet. Tests check that no blue or violet colour is left in the app's code.

## Signature motion: the travelling edge (GSAP, `src/motion.js`)
A panel keeps its full box while its visible edge moves (`clip-path`), and what is attached to that edge moves in the same timeline. Each place uses it differently:
1. **Sidebar rail** (the arrow handle on the sidebar edge): the sidebar stays 248 px wide while its edge slides to 76 px; the page and the handle glide with the edge, the arrow turns over, items that shift follow by x/y, and labels slide back in one after another when it opens. Remembered per browser.
2. **Deadline AI window:** opens as a circle growing out of its button and closes back into it; header, tabs and the input arrive in turn.
3. **Heads-up panel:** unfolds downward (height and clip together, so nothing jumps), rows drop into place in 3D, the chevron turns.
4. **Section cards:** when you change section, cards rise and unfold from their top edge; cards further down do the same when scrolled into view (IntersectionObserver, no extra plugin).
5. **Log-in tabs:** the pill slides under the chosen tab and the form is revealed from that side.

GSAP runs on its own clock only while something moves (no idle loop). With reduced motion, or without GSAP, every change is instant.
