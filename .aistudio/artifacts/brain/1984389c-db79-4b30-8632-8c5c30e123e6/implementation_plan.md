# Mobile Safe-Area Wrapper, Bottom Navigation & Stacked Primary Action Layout

Resolve clipping and overlap at the bottom of mobile screens by introducing a hardware safe-area layout architecture (`env(safe-area-inset-bottom)`), updating the selected custom bottom navigation bar (`div#root > div > main > div:nth-of-type(2) > div:nth-of-type(1)`), fixing scroll-container bottom clearance, and providing a reusable sticky primary action bar (`MobileStickyActionBar` / `MobileSafeActionStack`) that stacks directly above the custom bottom navigation bar.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Why Primary Action Buttons Were Clipped**:
>   1. The custom mobile bottom navigation bar used a fixed `bottom-3` (`12px`) offset without `env(safe-area-inset-bottom, 0px)`, causing it to collide with the iPhone Home Indicator (`34px`) and Android gesture bar.
>   2. The inner animated view wrapper used `h-full` inside an `overflow-y-auto` scroll container, which prevented bottom padding (`pb-24`) from taking effect below overflowing page content—leaving bottom action buttons trapped behind the floating navigation bar.
> - **Unified Safe-Area & Stacking Math**: All bottom layers reference shared CSS variables (`--safe-bottom: env(safe-area-inset-bottom, 0px)` and `--mobile-nav-height: 3.875rem`) so the hardware gesture bar, custom bottom navigation bar, sticky primary CTA bar, and scrollable content stack in deterministic vertical layers without ever overlapping.

## 1. Overview & Core Concept

- **What It Does**: Establishes a three-tier bottom viewport hierarchy for mobile and tablet screens (`< 1024px`) while preserving standard desktop layouts (`≥ 1024px`):
  1. **Tier 1 (Bottom-most)**: Native OS Hardware Safe Area (`env(safe-area-inset-bottom, 0px)` for iPhone Home Indicator / Android gesture bar).
  2. **Tier 2 (Middle)**: Custom Floating/Docked Bottom Navigation Bar positioned at `bottom: max(0.75rem, env(safe-area-inset-bottom, 0px))`.
  3. **Tier 3 (Top of Bottom Stack)**: Sticky Primary Action Bar (for "Submit", "Save All Marks", "Checkout", etc.) positioned at `bottom: calc(var(--mobile-nav-height) + max(0.75rem, env(safe-area-inset-bottom, 0px)) + 0.625rem)` directly above the custom bottom nav, plus generous scroll padding on the main content container.
- **Target Audience / Persona**: Mobile users on iOS (iPhone X through iPhone 16 Pro Dynamic Island / Home Indicator) and Android (gesture navigation and 3-button system bars).
- **Key Value**: Guarantees every primary action button and bottom form control is 100% visible, tappable (`≥ 44px` hitbox), and never obscured by either the app's bottom navigation bar or the phone's hardware home bar.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Scrolling to the Bottom of Any View**: Users can scroll to the very bottom of any module (Dashboard, Results, Fees, Attendance, Reports, Lesson Notes) and see all bottom action buttons clearly resting above the custom bottom navigation bar with breathing room.
  2. **Sticky Primary Action Button ("Submit" / "Save" / "Checkout")**: Views with a primary bottom CTA dock the action bar directly above the custom bottom navigation bar on mobile, and inline on desktop.
  3. **Hardware Gesture & Home Indicator Clearance**: Swiping up on the iPhone Home Indicator or tapping Android navigation buttons never accidentally triggers or clips the app's bottom navigation tabs or central FAB.
- **Visual Identity & Theme**:
  - *Surface Elevation*: Translucent glassmorphic surface (`bg-white/95 backdrop-blur-md`) with crisp border (`border-[#bac4c6]`) and elevated ambient shadow (`shadow-[0_8px_28px_rgba(28,74,89,0.18)]`) for the selected bottom navigation capsule.
  - *Touch Ergonomics*: Minimum `44px × 44px` hit targets for all navigation tabs and `48px` height for primary action buttons.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Shared CSS Custom Properties for Safe Area & Nav Offset**
  - *Chosen Approach*: Define `--safe-top`, `--safe-bottom`, `--mobile-nav-height`, and `--mobile-nav-bottom-offset` in root CSS using `env(safe-area-inset-*)` and `100dvh` dynamic viewport units.
  - *Why*: Eliminates magic numbers and ensures that when a device reports a `34px` iOS bottom inset or `0px` desktop inset, both the custom bottom nav and any stacked primary CTA automatically shift upward by the exact hardware inset.
- **Decision 2: Fix Scroll Container Overflow (`min-h-full` instead of `h-full`)**
  - *Chosen Approach*: Replace `h-full` with `min-h-full` on the inner view wrapper inside `<main>` and apply `.pb-mobile-safe-content` so the scroll container always honors bottom clearance below the last button on every screen.
  - *Why*: In CSS flexbox/scroll layouts, a child with `height: 100%` (`h-full`) causes overflowing descendants to ignore the parent scroll container's `padding-bottom`.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Viewport Stacking Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Mobile Viewport (100dvh, <1024px)                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Top App Header (padding-top: env(safe-area-inset-top, 0px))       │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ Scrollable Main Content Container (overflow-y-auto)               │  │
│  │  • Inner View Wrapper (min-h-full, max-w-7xl)                     │  │
│  │  • Bottom Scroll Clearance: .pb-mobile-safe-content               │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ Tier 3: Sticky Primary Action Bar (MobileSafeActionStack)         │  │
│  │  • Position: .above-mobile-nav (stacked above bottom nav)         │  │
│  │  • Holds primary CTA ("Submit" / "Save All Marks" / "Checkout")   │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ Tier 2: Selected Custom Bottom Navigation Bar                     │  │
│  │  • Selector: main > div:nth-of-type(2) > div:nth-of-type(1)       │  │
│  │  • Position: pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]    │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ Tier 1: Native OS Hardware Bar / Home Indicator                   │  │
│  │  • Height: env(safe-area-inset-bottom, 0px) (e.g. 34px on iOS)    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **Selected Bottom Navigation Capsule (`main > div:nth-of-type(2) > div:nth-of-type(1)`)**: Updated with safe-area bottom offset (`pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]`), frosted backdrop blur (`bg-white/95 backdrop-blur-md`), and responsive spacing across narrow (`320px–375px`) and standard (`390px–430px`) screens.
  - **Reusable `<MobileSafeActionStack>` & `<MobileStickyActionBar>` Component**: Provides a drop-in wrapper and sticky primary CTA stacking directly above the custom bottom navigation bar so any form or checkout/submission action stays unobstructed.
