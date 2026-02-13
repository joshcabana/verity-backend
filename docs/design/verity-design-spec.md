# Verity Landing Page Design Specification

> **Version:** 1.0  
> **Date:** 2026-02-13  
> **Theme:** Minimalist Luxury (Black / White / Gold)  
> **Platform Target:** React Native (Mobile) & React Web (Desktop/Responsive)

---

## 1. Overall Layout Philosophy

**"The Midnight Mirror"**

The design direction fuses the sleek, high-contrast minimalism of a luxury fashion house (e.g., Saint Laurent, Celine) with the immediacy of a modern fintech app (e.g., Cash App, Revolut Metal). The core concept is **"Mystery & Revelation"**.

Because we show no profiles, the interface must build anticipation solely through typography, motion, and negative space. The layout is intentionally stark—dominated by deep blacks and crisp whites—using gold only as the "current of energy" that guides the user to the "Go Live" action. It avoids clutter, shadows, and gradients in favor of sharp lines and absolute clarity. The user should feel like they are entering an exclusive, members-only club where the product *is* the experience, not the catalog of people.

---

## 2. Typography Scale

**Font Family:** `Inter` (or `Space Grotesk` if retaining existing brand DNA, but `Inter` is cleaner for this luxury look) or a premium sans-serif like `Neue Haas Grotesk` if available. For this spec, we assume **Inter** for UI and **Playfair Display** (optional) for editorial accents, but we will stick to a single geometric sans for modern sharpness.

| Role | Size (Mobile) | Size (Desktop) | Weight | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Headline** | 48px (3rem) | 72px (4.5rem) | Bold (700) | 1.1 | -0.02em | Main value prop ("Instant. Live. Real.") |
| **Section Title** | 32px (2rem) | 48px (3rem) | SemiBold (600) | 1.2 | -0.01em | "Safety First", "How It Works" |
| **Body Large** | 18px (1.125rem) | 24px (1.5rem) | Regular (400) | 1.5 | Normal | Intro text, key benefits |
| **Body Standard** | 16px (1rem) | 18px (1.125rem) | Regular (400) | 1.6 | Normal | Standard descriptions |
| **CTA Button** | 16px (1rem) | 18px (1.125rem) | SemiBold (600) | 1.0 | 0.02em | "Go Live", "Join Queue" |
| **Caption/Label** | 12px (0.75rem) | 14px (0.875rem) | Medium (500) | 1.4 | 0.05em | UI labels, input hints |

---

## 3. Color Usage Guidelines

**Palette:**

- **Void Black:** `#000000` (Main Background)
- **Paper White:** `#FFFFFF` (Primary Text, Card Backgrounds in Light Mode/High Contrast areas)
- **Lux Gold:** `#D4AF37` (Primary Accent, CTAs)
- **Gold Hover:** `#C5A532` (Interactive State)
- **Charcoal:** `#1A1A1A` (Secondary Background, Off-Black layers)
- **Asphalt:** `#333333` (Borders, Dividers)
- **Silver:** `#A0A0A0` (Secondary Text, Placeholders)

**Usage Rules:**

1.  **Backgrounds:** Default is **Void Black**. Sections may alternate to **Charcoal** or extremely rare **Paper White** blocks for stark contrast.
2.  **Typography:** **Paper White** on dark backgrounds. **Void Black** on light backgrounds. **Lux Gold** is used *only* for the primary CTA button background, key statistical highlights (e.g., "45s"), and active state indicators. Never use gold for body text; it reduces readability and cheapens the effect.
3.  **Gold Gradient:** A subtle linear gradient (`linear-gradient(135deg, #D4AF37 0%, #F2D06B 50%, #D4AF37 100%)`) can be used on the "Go Live" button to simulate a metallic sheen.
4.  **Borders:** 1px **Asphalt** borders for inputs and cards. Active inputs glow with **Lux Gold** (30% opacity shadow).

---

## 4. Component Breakdown – Mobile View (Portrait)

**A. Sticky Header (60px fixed)**
-   **Left:** "Verity." text logo (White, Bold, 20px).
-   **Right:** "Login" (Text link) or User Avatar (if logged in).
-   **Background:** `#000000` with 90% opacity blur.
-   **Border:** Bottom 1px solid `#1A1A1A`.

**B. Hero Section (85vh)**
-   **Content:**
    -   **Headline:** "No Profiles.\nJust Chemistry." (Centered, White).
    -   **Subhead:** "45-second live video dates. Mutual reveal only." (Centered, Silver, mt-4).
    -   **Visual:** Abstract "Connection" animation (Gold particle stream connecting two unseen points) or a cinematic video loop of two silhouettes talking (blurred/mysterious).
    -   **Primary CTA:** "Go Live" (Pill shape, Gold background, Black text, width 80%, anchored bottom-center or just below visual).
    -   **Social Proof:** "10k+ matches today" (Small caption below CTA, Silver).

**C. How It Works (Scroll)**
-   **Format:** Vertical step-by-step cards.
-   **Card 1:** "Join The Queue" – Icon: Minimalist Hourglass. Text: "Enter the live queue for your city."
-   **Card 2:** "45s Date" – Icon: Video Camera (outline). Text: "Connect instantly. Video on. Audio on. No filtering."
-   **Card 3:** "Decide" – Icon: Heart / X split. Text: "Private decision. Mutual match unlocks chat."
-   **Styling:** Transparent backgrounds, White text, Gold icons.

**D. Safety Value Prop (40vh)**
-   **Background:** `#1A1A1A`.
-   **Content:**
    -   **Headline:** "Unrecorded.\nPrivate.\nSafe." (Left aligned).
    -   **Body:** "Calls are never recorded. Moderated by AI in real-time."
    -   **Visual:** Shield icon with a subtle gold pulse.

**E. Footer (Auto height)**
-   **Links:** Support, Privacy, Terms (Centered, stacked, Silver, 14px).
-   **Copyright:** "© 2026 Verity Inc." (Charcoal).

---

## 5. Component Breakdown – Desktop/Web View

**A. Hero Split (100vh)**
-   **Layout:** 50/50 Split.
-   **Left Side (Content):** Vertically centered. Large headline ("No Profiles.\nJust Chemistry."). Subhead. "Go Live" CTA (maximum width 300px).
-   **Right Side (Visual):** Full-height video/WebGL canvas. The abstract "connection" visualization plays here.
-   **Transition:** Use a subtle parallax effect on scroll.

**B. "The Queue" Dashboard (If logged in)**
-   **Grid:** 3-column layout.
    -   **Col 1:** User Stats (Balance, Matches). Card style: Black bg, Asphalt border.
    -   **Col 2 (Main):** The "Go Live" Button (Large, pulsing gold ring) + Queue Status ("150 people online in Sydney").
    -   **Col 3:** Recent Activity / Safety Tips.

**C. Feature Grid (Section)**
-   **Layout:** 3 cards in a horizontal row.
-   **Interactions:** Hovering over a card creates a gold border glow and slight lift (`transform: translateY(-5px)`).

---

## 6. Key Visual Elements & Assets Needed

1.  **" The Spark" (Hero Graphic):** Since we verify identity but hide appearance, the hero graphic should represent *energy*. A generative WebGL mesh or a high-quality video loop of light particles converging.
2.  **Iconography:** Thin-line geometric icons (Stroke width: 1.5px). Gold stroke for active/highlight, White stroke for default.
    -   *Icons needed:* Video, Mic, Shield, Heart, Close (X), User, Settings, Token/Coin.
3.  **Pattern:** A subtle "noise" texture overlay (5% opacity) on the black background to prevent banding and add filmic texture.
4.  **Coin Asset:** A 3D-rendered gold coin (matte finish, not shiny pirate gold) for the token purchase flow.

---

## 7. Primary CTA Flow

**The "Go Live" Button**
This is the heartbeat of the app.

-   **State: Idle**
    -   Text: "Go Live"
    -   Bg: Gold Gradient
    -   Effect: Slow "breathing" shadow (Gold, 20% opacity).
-   **State: Hover (Desktop) / Press (Mobile)**
    -   Scale: 0.98
    -   Bg: Gold Hover (`#C5A532`)
-   **State: Queued (Active)**
    -   Text: "Finding Match..."
    -   Bg: Black (with Gold border)
    -   Effect: Gold border spins or pulses (loading state).
-   **Placement:** Fixed bottom-center on Mobile (z-index 100). Inline hero on Desktop.

**Secondary CTAs**
-   "Get Tokens": Ghost button (White border, transparent bg).
-   "Edit Preferences": Text link with underline.

---

## 8. Accessibility & Performance Notes

1.  **Contrast:**
    -   White text on Black bg: **21:1** (AAA).
    -   Gold text on Black bg: Ensure Gold is `#D4AF37` or lighter to meet **4.5:1** (AA). If not, use Gold for graphical elements only and White for text.
2.  **Touch Targets:** All interactive elements must have a hit area of at least **44x44px** (mobile).
3.  **Motion:** Respect `prefers-reduced-motion`. Disable parallax and particle effects if true.
4.  **Images:** Use WebP/AVIF for the coin and hero assets. Lazy load off-screen content.

---

## 9. Responsive Breakpoints Behavior

| Breakpoint | Layout Adjustment |
| :--- | :--- |
| **Mobile (<768px)** | Single column fluid. CTA fixed to bottom viewport. Font sizes at base scale. |
| **Tablet (768px - 1024px)** | Hero becomes centered text with visual below (unsplit). Grid references become 2-column. |
| **Desktop (1024px+)** | Split screen hero confirmed. 3-column dashboard grid. Max-width container 1200px. |
| **Ultra-Wide (1440px+)** | Content centered with generous side margins. visual assets scale to fill height/width without cropping critical areas. |

---

## 10. Final Mood Board Description

Upon landing, the user steps into the digital equivalent of a high-end, dimly lit jazz lounge or a private premiere. It is quiet, dark, and expensive-looking. There is no noise—no flashing banners, no cartoonish avatars. Just the silence of the void (Black) pierced by the promise of connection (Gold). The user feels *intrigue* ("Who will I meet?") and *security* ("I am verifying, not exposing myself"). The interaction is snappy—like the click of a heavy metal latch. It feels **premium, serious, and electric**.
