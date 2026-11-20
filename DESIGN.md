# DESIGN.md — GASKEUN! Design System (v2.0 — Liquid Glass & Kinetic Editorial)

> **Visual DNA:** Light Liquid Glass (iOS-inspired refraction) · Playful Rounded (`Fredoka` + `Plus Jakarta Sans`) · Matcha/Sage Fresh · Soft Squircle (`24–32px`)
> **Language Policy:** **100% English UI copy.** Zero bilingual mixing. Zero system-jargon labels (NEVER print words like "Day-H Mode", "1-Tap GMaps", "Offline Fallback", "Layer 1/2", or "Edit Mode").
> **Anti-Generic Mandate:** Strictly avoid uniform stacked card lists, HTML-looking dropdowns, generic checkboxes inside heavy boxes, and top navigation bars. Every screen must have clear **scale contrast** (hero focus vs compressed secondary info) and tactile micro-interactions.

---

## 1. Spatial Rules & Anti-Chrome Architecture

- **ZERO Top Bar:** Never render a full-width sticky Top Bar. Content and hero photography go edge-to-edge up to the device status bar.
  - *Trip Switcher:* Tap directly on the Trip Title in the Hero (subtle inline chevron).
  - *Utility (`Edit` / `Sync`):* Accessed via a single floating translucent circular icon (`40×40px`, `•••` or subtle glyph) tucked cleanly in the upper corner—no bar background, no dividers.
- **Asymmetric Scale Hierarchy (The "Spotlight" Rule):**
  - Active/Primary info (e.g., `Now` itinerary stop) is rendered **large, wide, and luminous** (`min-height: 176px`, large display clock, prominent `Route` pill, embedded map preview or location hint).
  - Past items compress into **slim, low-opacity single-line strips** (`44px`).
  - Upcoming items (`Up Next`) appear as **compact horizontal-peek or medium cards** (`88px`) so the eye immediately locks onto what matters now.
- **No Everything-in-a-Box:** Use whitespace, typography weight, and subtle hairlines for secondary details rather than wrapping every single item in a card border.
- **Floating Glass Dock (Bottom Nav):** Single sleek floating pill (`height: 60px`, `radius: 9999px`) with 5 short 1-word English items: `Home` · `Plan` · `Wallet` · `Crew` · `Pack`. Must sit comfortably on `360px` width without wrapping.

---

## 2. Liquid Glass Mechanics & Color Tokens

*Critical Rule: Liquid Glass looks flat on a solid white `#FFFFFF` background. Always render a soft, luminous **Ambient Mesh Canvas** behind glass layers so blur and specular refraction are visible.*

### A. Ambient Canvas (Behind Glass)
- `canvas-base`: `#F6F8F5`
- `canvas-ambient-blobs`: Subtle oversized radial blurs (`opacity: 0.45`, `blur: 80px`) using Soft Matcha `#CBE0CE`, Warm Sunlight `#F5F2E4`, and Pale Mint `#DFECE6`.
- `hero-bleed-fade`: `linear-gradient(180deg, rgba(246,248,245,0) 40%, rgba(246,248,245,0.75) 78%, #F6F8F5 100%)`

### B. Liquid Glass Layers
- `glass-liquid-clear`: `rgba(255, 255, 255, 0.56)` + `backdrop-filter: blur(24px) saturate(180%)`
  - Border: `1px solid rgba(255, 255, 255, 0.85)` (bright top specular edge)
  - Shadow: `0 16px 40px -12px rgba(31, 45, 39, 0.10), inset 0 1.5px 1px rgba(255, 255, 255, 0.95)`
- `glass-liquid-spotlight`: `linear-gradient(135deg, rgba(255,255,255,0.78) 0%, rgba(233,242,235,0.62) 100%)` + `backdrop-filter: blur(28px) saturate(190%)` *(reserved for `Now` Spotlight & active Hero widgets)*
- `glass-dock`: `rgba(255, 255, 255, 0.76)` + `backdrop-filter: blur(28px) saturate(200%)` + `0 12px 32px rgba(31, 45, 39, 0.14)`

### C. Brand & Semantic Accents (Matcha / Sage)
- `brand-matcha`: `#4A7468` (Primary CTA, active dock pill, progress fill)
- `brand-forest`: `#2D4A42` (Deep contrast accent, pressed state)
- `brand-sage-tint`: `#E3EDE6` (Soft pill fill, fluid bar fill)
- `text-primary`: `#182420`
- `text-secondary`: `#546860`
- `text-muted`: `#889B93`
- `accent-amber`: `#D99136` (Gentle alert: unpaid DP, special hours)
- `accent-coral`: `#CF4D5E` (Closed-day conflict, overdue)
- `accent-mint`: `#2B946B` (Paid / Done / Open)

---

## 3. Typography (Playful Rounded × Crisp Utility)

- **Display / Hook Font:** `Fredoka` (`SemiBold` / `Bold`) — used for Hero Trip Title, large `Now` timestamps, countdown numbers, and big currency totals.
- **UI / Reading Font:** `Plus Jakarta Sans` (`Medium` / `SemiBold`) — crisp legibility for schedules, notes, and compact pills.
- **Scale:**
  - `Display Hero`: `34px` / `Bold` / `LH 1.05` / `Tracking -0.02em`
  - `Spotlight Number / Time`: `28px` / `SemiBold` / `LH 1.1`
  - `Section Header`: `20px` / `SemiBold` / `LH 1.2`
  - `Card Title`: `16px` / `SemiBold` / `LH 1.25`
  - `Body`: `13px` / `Regular` / `LH 1.45`
  - `Dock / Micro`: `10–11px` / `SemiBold`

---

## 4. Signature Interactive UX Patterns (Replace Boring Widgets)

Instead of generic cards, toggles, and dropdowns, build these **5 signature patterns**:

1. **Spotlight "Now" Card (Asymmetric Timeline):**
   - Full-width luminous glass card (`radius: 28px`) with oversized start time, pulsing green dot (`Now`), destination title, subtle 1-line landmark hint (e.g., *Valley trail · Parking Rp2k–5k*), and an integrated tactile `Route` pill button.
   - Next stop sits right beneath as a sleek smaller translucent card (`Up Next`) with a subtle connecting route line.
2. **Bento Quick-Access Duo (Home — Only 2 Priority Tiles):**
   - **Left (Wide — Boarding Pass Style):** `Train Pass` with subtle perforated ticket notch, route code (`PSE 09:14 → PWS 18:20`), and date. Tap opens full ticket sheet.
   - **Right (Square — Photo Stack):** `Album` displaying fanned Polaroid/rounded photo thumbnails peeking out of a glass pocket. *(No PIC Contacts card here.)*
3. **Interactive Crew Avatar Strip (Replaces Generic Toggle Switch):**
   - In `Wallet`, instead of a boring "Include Valen?" toggle box, display a clean horizontal strip of crew avatar bubbles. Confirmed members glow solid; tentative members (Valen) appear softly dashed/dimmed. Tapping the avatar snaps them in/out and fluidly recalculates the split total.
4. **Fluid Row-as-Progress-Bar (Replaces Cluttered Payment Tables):**
   - Each member's contribution row is a sleek `56px` glass capsule where the background itself fills horizontally from left to right in soft liquid matcha (`#E3EDE6`) proportional to their paid percentage—clean, scannable, zero extra progress-bar clutter.
5. **Visual Bike Pair Pods (Replaces Form Dropdowns):**
   - In `Crew`, each of the 5 motorbikes is a tactile horizontal pill pod showing `[Driver Avatar] + [Rider Avatar]` with a soft lock/passenger dot for non-drivers. Tapping a slot pops a quick avatar picker pill instead of an ugly select dropdown.

---

## 5. Motion & Feel
- **Tactile Press:** `scale(0.97)` on tap with spring easing `cubic-bezier(0.22, 1, 0.36, 1)`.
- **Collapsible Sections:** Smooth height reveal + subtle opacity fade; sections can be collapsed to keep screens airy.
- **Horizontal Snap Peeks:** Secondary carousels (e.g., day selector, upcoming stops, photo album) intentionally show `15%` of the next item at the right edge to invite natural swiping.