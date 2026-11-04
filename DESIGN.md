# Burrow Raid design system

## Overview

Burrow Raid is a small 3D action game for the Squeekchain community. Its interface frames a miniature underground arena rather than a marketing page: a playable scene, role selection and one clear start action share the first screen. Warm parchment type and brass controls sit over forest-green surroundings. Mushrooms, moss, interwoven roots, wooden supplies and toy-like hamster adventurers carry the visual character.

Canonical interface values are in `src/style.css`; original 3D geometry and scene colors are in `src/scene.ts`. `src/App.tsx` owns the reusable HUD, buttons, role selection, native dialogs and game states. There is one fixed theme, with forced-colors support; no separate light theme is implemented.

## Colors

CSS uses hex primitives mapped to semantic custom properties. Reuse semantic tokens in interface components.

| Token | Implemented value | Use |
| --- | --- | --- |
| `--color-bg` | `#172b24` | Page background and scene fog color |
| `--color-surface` | `#233c30` | Dialogs and neutral control surfaces |
| `--color-surface-hover` | `#344d3c` | Hover state |
| `--color-text` | `#f5ead1` | Primary text |
| `--color-muted` | `#cfccb6` | Secondary copy and utility labels |
| `--color-subtle` | `#a9b09e` | Quiet footer text and indicators |
| `--color-border` | `#5d6a50` | Structural edges and form boundaries |
| `--color-action` | `#edc78a` | Primary action fill and selection emphasis |
| `--color-action-hover` | `#f6d9a8` | Primary hover fill |
| `--color-action-text` | `#29392a` | Text on the primary action |
| `--color-focus` | `#fff1be` | Two-pixel focus outline with four-pixel offset |
| `--color-health` | `#9cb58b` | Health bars and Guardian category cues |
| `--color-danger` | `#eea58a` | Recoverable errors and fallen-player text |
| `--color-medic` | `#d3a5bd` | Medic category cues |

The active attack banner uses `#ffda95` on `#503e29`, with a lightning icon and a plain-language instruction. Boss health is brass, player health is green, and shared energy uses the primary brass fill. Labels, shapes and numerical values accompany color.

The rendered scene has its own art palette: earth `#6e5740`, moss `#526c47`, grass `#78915e`, wood `#4a3b2d`, brass `#c99b56`, cream `#f1ddbb` and mushroom red `#b46446`. Lighting and tone mapping change their displayed appearance. These art values are not interface contrast tokens. Measured contrast coverage and unverified canvas/gradient pairs are documented in `artifacts/validation.md`.

## Typography

`src/main.tsx` imports local Latin font assets: Fraunces 600 for display headings and the brand; Nunito Sans 400, 600 and 800 for interface text. Fallbacks are `serif` and `sans-serif`. WOFF2 is preferred by the supplied font CSS, with WOFF fallback. No remote font request is needed.

| Token | Size at a 16px root | Role |
| --- | --- | --- |
| `--text-xs` | 12px | Keyboard hints, data captions and provenance |
| `--text-sm` | 14px | Control labels, HUD text and dialog prose |
| `--text-base` | 16px | Primary actions, form fields and lead copy |
| `--text-lg` | 20px | Small brand and section headings |
| `--text-xl` | 28px | Desktop brand, dialog/result headings, phone game title |
| `--text-display` | 48px | Desktop game title |

Only 400, 600 and 800 weights are used. Display Fraunces stays at 600. The root line height is 1.5; descriptive copy uses up to 1.6; display headings use 1.04, or 1.1 on phones. The title's tracking is `-.035em`; brand tracking is `-.025em`; content uses natural spacing. Headings balance and prose wraps naturally. Timers, health, cooldowns and energy use tabular numerals. Inputs remain 16px. Credits and identifiers wrap instead of being truncated.

## Layout

Spacing uses a 4/8/12/16/24/32px rhythm with component-specific 10/14px gaps and optical padding. Spacing is implemented in the component CSS rather than exported as spacing variables. Preserve the existing shared edges when extending a component.

- Above 1100px: the header is 94px, footer 46px, and the game area has a 650px minimum height. The role panel is 334px wide at a 6% leading inset. The scene occupies the remaining space and bleeds behind interface chrome.
- At 1100px: the role panel becomes 312px at a 4.6% inset; the scene, boss caption and HUD contract.
- At desktop heights below 770px: the main minimum height contracts to 610px and vertical menu gaps tighten.
- At 850px: header height is 78px, the role panel is 300px with 24px side spacing, the party/energy HUD move below the boss bar, and a touch movement pad replaces desktop movement hints.
- At 600px: the header is 76px plus the top safe area. A 380px scene sits above the role panel; 326px of panel top padding preserves the arena composition. The title is one 28px line, controls use 24px side margins, and the start button remains visible on the tested 390×844 first screen. The footer stays in normal document flow.
- At 360px: role gaps and combat controls tighten, with 18px role-panel insets and compact HUD widths. Text remains readable and controls remain reachable.
- At heights below 550px and widths above 600px: compact landscape combat uses a 64px header and 44px footer, side HUDs, smaller movement/action controls and a centered arena. The instructional hint is hidden; help remains available.

Safe-area insets are applied to phone header/footer sizing. Combat height accounts for them. Resizing invalidates the WebGL drawing buffer and redraws even when reduced motion has left the lobby static. Layouts were inspected at 320, 390, 768, 844 landscape and 1440 CSS pixels wide; physical notch behavior and native zoom remain unverified.

## Elevation & Depth

The 3D arena supplies most depth through geometry, matte materials and shadows. Interface panels use tonal separation; role controls and combat actions use borders for state/structure. A single full-width brass action dominates the role panel. Neutral utilities remain visually quieter.

Help and co-op use native `<dialog>` with a forest backdrop and five-pixel backdrop blur. Pause, results and WebGL failure use a centered raised surface. Their shadow is `0 16px 80px #10201999`; dialogs use `0 24px 120px #071d18aa`. These raised surfaces have no decorative border. HUDs stay directly over the scene with contextual dark gradients and readable numerical labels.

## Shapes

The system uses rounded, substantial controls: primary actions have 9px radii; role options 10px; combat actions 12px (10px on phones); dialogs 18px; raised game panels 20px. Utility buttons and the movement pad are circular. Health and energy tracks use 4px radii. Do not add nested decorative cards around these existing component groups.

## Components

| Component / pattern | Source and behavior |
| --- | --- |
| `HamsterMark` / `.brand` | Original SVG mark, used for the brand and result state. The brand is a real home link that returns to role selection. Minimum 44px hit height. |
| `.primary`, `.text-button`, `.icon-button` | Shared action hierarchy. Filled primary, quiet secondary, 44px utility targets; visible focus, hover, active and disabled states. The start action disables when 3D is unavailable. |
| `RoleIcon` / `.role-option` | Consistent Lucide icons. Native buttons within a labelled fieldset, with `aria-pressed`, a checkmark and selected border. Tab and Enter/Space select roles. Room membership locks role changes. |
| `Meter` | `value`, `max`, accessible `label`, optional CSS variant. Semantic progress bars for boss/player health and energy, with numbers alongside. Boss track is 10px, energy 6px, party 5px/4px on phones. |
| `.party-hud` / `.energy-hud` | Persistent role, player/bot, health and shared-energy information. Bot takeover is labelled. Practice and telemetry provenance remain distinct. |
| `TouchPad` / `.combat-action` | Captured pointer movement, held attack, free dodge and role skill. Native action buttons also work by keyboard. Labels show cooldowns and energy cost. The keyboard path uses WASD/arrows, Space, Shift and E. |
| `Modal` | `title`, `children`, `onClose`; native modal behavior, Escape support, initial focus and focus return. Scrolls within the viewport. Used for help and co-op connection settings. |
| `.pause-panel`, `.result-panel`, `.webgl-error` | Purpose-specific game states with one recovery/replay action. Victory/defeat announce and move focus to replay. Practice pause snapshots the current HUD; online pause explains continuing server play. |
| Connection form | Persistent field labels, 16px inputs, inline validation and connecting state. Empty/unavailable endpoints explain how to recover; no false public room service is implied. |

Transitions name their properties and last 150ms or less for frequent controls. Under `prefers-reduced-motion: no-preference`, pressing a button scales to `.96`. Reduced motion disables those transitions, fireflies, breathing, weapon motion and downed-player blinking; movement and telegraph timing remain essential gameplay cues. Audio is optional and starts only from a user action. The field guide includes a motion override.

## Do's and Don'ts

- Reuse the semantic palette and the six-size type scale. Keep the arena as the visual focus and place instructions beside their controls.
- Use the existing primary action for the next meaningful step, native buttons for actions and links for navigation. Preserve keyboard focus and 44px utility targets.
- Keep player/bot, practice/live and telemetry/settlement labels explicit. Do not imply public co-op hosting, payment verification, rewards or approval.
- Preserve reduced motion, visibility handling, safe areas, landscape controls and buffer invalidation when changing the scene.
- Use the existing dialog pattern for an additional setting; keep it within the viewport and restore focus. A future screen should start with the same header, main and footer, then reuse these controls rather than introducing another visual system.
- New art must match the miniature matte geometry and warm forest palette. Keep art colors separate from UI status colors, and add any new third-party notice to the license collector output.
