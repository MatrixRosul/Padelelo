# Design System: High-Performance Editorial

## 1. Overview & Creative North Star
### The Creative North Star: "Kinetic Precision"
This design system is not a mere utility; it is a high-performance engine. It translates the raw energy of the padel court into a digital experience defined by **Kinetic Precision**. We reject the "generic SaaS" look in favor of an editorial-tech hybrid that feels like a premium sports magazine met a precision analytics tool.

To break the "template" look, we utilize **intentional asymmetry** and **tonal layering**. Elements should feel as though they are in motion-using generous white space to create "breathing room" and overlapping components to imply momentum and depth. We avoid rigid boxes; we prefer layouts that feel curated, rhythmic, and authoritative.

---

## 2. Colors
Our palette is rooted in the high-contrast environment of the court. We move beyond flat blocks of color by utilizing a sophisticated hierarchy of "Surface Tiers."

### Surface Hierarchy & Nesting
We do not use lines to separate ideas. We use physics.
- **Surface (`#f8f9ff`)**: The base court.
- **Surface-Container-Lowest (`#ffffff`)**: High-priority cards or "active" states.
- **Surface-Container-Low (`#eff4ff`)**: Secondary groupings.
- **Surface-Container-High/Highest**: Used for deep nesting or modal backdrops.

### The "No-Line" Rule
**Explicit Instruction:** Prohibit the use of 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts or the "Layering Principle." If two sections meet, the transition should be marked by a change from `surface` to `surface-container-low`.

### The "Glass & Gradient" Rule
To inject "soul" into the UI:
- **CTAs & Heroes:** Use a linear gradient (135°) from `primary` (#006e2f) to `primary_container` (#22c55e). This mimics the sheen of high-end sports equipment.
- **Floating Elements:** Use Glassmorphism. Apply `surface_container_lowest` with 70% opacity and a `24px` backdrop blur. This ensures the UI feels integrated and premium.

---

## 3. Typography
Our typography is the "voice" of the athlete: bold, disciplined, and clear.

*   **Display & Headlines (Space Grotesk):** This is our "Impact" layer. Use **ExtraBold** for `display-lg` to create a sense of dominance. The tight tracking and aggressive x-height of Space Grotesk communicate "Speed" and "Momentum."
*   **Body & Titles (Inter):** The "Intelligence" layer. Inter provides a neutral, high-legibility counter-balance to the aggressive headlines. Use it for data points and long-form content to ensure "Precision."
*   **Labels (Public Sans):** The "Technical" layer. Used for metadata and small UI anchors. Public Sans offers a slightly more rhythmic feel for small-scale data.

**Editorial Hierarchy Tip:** Never center-align long-form text. Keep it flush left to maintain a strong "axis of movement" that guides the eye downward, mimicking a player's focus.

---

## 4. Elevation & Depth
In this system, depth is a functional tool, not a stylistic flourish.

### Tonal Layering
Achieve hierarchy by "stacking" the surface-container tiers. Place a `surface-container-lowest` (#FFFFFF) card on a `surface-container-low` (#EFF4FF) section to create a soft, natural lift.

### Ambient Shadows
Shadows must be "Environmental." 
- **Token:** `Shadow-Premium`
- **Value:** `0px 20px 40px rgba(11, 28, 48, 0.06)`
The shadow uses a tinted version of `on-surface` (dark blue-grey) to mimic natural light rather than a "dirty" black shadow.

### The "Ghost Border" Fallback
If a border is required for accessibility (e.g., in a high-glare environment), use a "Ghost Border":
- **Token:** `outline-variant` at **15% opacity**. 
- **Rule:** Never use 100% opaque borders.

---

## 5. Components

### Buttons (The "Momentum" Action)
- **Primary:** Gradient fill (`primary` to `primary_container`), `8px` (md) radius, white text. On hover, increase the gradient intensity.
- **Secondary:** Ghost style. `surface-container-low` background with `on-secondary-container` text. No border.
- **Tertiary:** Text-only with an icon. Use `tertiary` (#416900) to draw the eye without adding weight.

### Cards (The "Data Container")
- **Radius:** `xl` (1.5rem / 24px) for top-level cards; `lg` (1rem / 16px) for nested cards.
- **Styling:** Use `surface-container-lowest` with an `Ambient Shadow`. 
- **Rule:** **Forbid dividers.** Use vertical white space (32px or 48px) to separate content sections within the card.

### Performance Chips
- **Selection:** `primary_fixed` background with `on_primary_fixed` text.
- **Shape:** Full pill (`9999px`).
- **Interaction:** A subtle `2px` "Court Green" glow on focus/active states.

### Inputs (The "Precision" Entry)
- **Background:** `surface_container_low`.
- **Focus State:** Transition background to `surface_container_lowest` and add a `ghost border` using `primary`.

### Additional Component: The "Match-Glass" Overlay
Specifically for PadelElo, use a `backdrop-blur (12px)` overlay for match statistics. This allows the energetic court colors to bleed through while keeping the data perfectly legible.

---

## 6. Do's and Don'ts

### Do
- **Do** use intentional white space. If you think there’s enough space, add 16px more.
- **Do** use `tertiary` (Lime) for "Success" or "High-Energy" accents to keep the vibe fresh.
- **Do** layer cards on top of subtle gradients to create a sense of an "Environment."

### Don't
- **Don't use 1px solid lines.** They "trap" the eye and kill the momentum of the design.
- **Don't use pure black.** Use `on-surface` (#0b1c30) for text to maintain a premium, deep-blue sophisticated tone.
- **Don't use purple or dark mode as the primary experience.** We are chasing the "Sunlight on the Court" feeling-keep it bright and airy.
- **Don't crowd the display type.** Headline-lg and Display-lg need significant "leading" and margin to feel editorial.
