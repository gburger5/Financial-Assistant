# Frontend Overhaul — Purple & Black Financial Dashboard

Complete specification for rebuilding the Financial Assistant frontend from scratch using a modular, testable component architecture with a **Purple & Black** dark theme inspired by the reference designs.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **React 18** + TypeScript | Functional components, hooks only |
| Build | **Vite** | Already configured at `client/vite.config.js` |
| Routing | **react-router-dom v6** | Already installed |
| Styling | **Vanilla CSS** with CSS custom properties | Drop MUI — all styling via design tokens |
| Icons | **Lucide React** | Lightweight, tree-shakeable SVG icons |
| Charts | **Recharts** | For donut charts, line charts, bar charts |
| Testing | **Vitest** + **React Testing Library** | Add to `devDependencies` |

> [!IMPORTANT]
> **Drop MUI entirely.** All components are hand-built with vanilla CSS using the design token system below. This gives full styling control and eliminates the heavy MUI bundle. Remove `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled` from `package.json`.

---

## 1. Design System — Tokens & Variables

Define in `src/styles/tokens.css`. **Every** color, spacing, radius, and shadow in the app must reference these tokens. No hardcoded values anywhere.

### 1.1 Color Palette

```css
:root {
  /* ── Core Brand ─────────────────────────────── */
  --color-purple-50:  #F5F0FF;
  --color-purple-100: #E9DEFF;
  --color-purple-200: #D4BFFF;
  --color-purple-300: #B794F6;
  --color-purple-400: #9F6EF0;
  --color-purple-500: #8B5CF6;   /* PRIMARY — buttons, active nav, links */
  --color-purple-600: #7C3AED;
  --color-purple-700: #6D28D9;
  --color-purple-800: #5B21B6;
  --color-purple-900: #4C1D95;

  /* ── Surfaces (Dark) ────────────────────────── */
  --color-bg-body:      #09090B;  /* page background — near-black */
  --color-bg-surface:   #111114;  /* cards, sidebar */
  --color-bg-elevated:  #1A1A1F;  /* elevated cards, modals, inputs */
  --color-bg-hover:     #222228;  /* hover states on surfaces */
  --color-border:       #2A2A30;  /* subtle card borders */
  --color-border-focus: #8B5CF6;  /* input focus ring */

  /* ── Text ───────────────────────────────────── */
  --color-text-primary:   #F4F4F5;  /* high emphasis — headings, values */
  --color-text-secondary: #A1A1AA;  /* medium emphasis — labels, dates */
  --color-text-muted:     #71717A;  /* low emphasis — placeholders */
  --color-text-inverse:   #09090B;  /* text on light/purple surfaces */

  /* ── Semantic ───────────────────────────────── */
  --color-success:    #22C55E;
  --color-success-bg: rgba(34, 197, 94, 0.12);
  --color-warning:    #F59E0B;
  --color-warning-bg: rgba(245, 158, 11, 0.12);
  --color-danger:     #EF4444;
  --color-danger-bg:  rgba(239, 68, 68, 0.12);
  --color-info:       #6366F1;
  --color-info-bg:    rgba(99, 102, 241, 0.12);

  /* ── Chart / Category Colors ────────────────── */
  --color-chart-1: #8B5CF6;  /* purple */
  --color-chart-2: #A78BFA;  /* light purple */
  --color-chart-3: #22C55E;  /* green */
  --color-chart-4: #F59E0B;  /* amber */
  --color-chart-5: #EC4899;  /* pink */
  --color-chart-6: #06B6D4;  /* cyan */
  --color-chart-7: #EF4444;  /* red */

  /* ── Gradients ──────────────────────────────── */
  --gradient-primary:  linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%);
  --gradient-glow:     linear-gradient(135deg, #A78BFA 0%, #8B5CF6 50%, #6D28D9 100%);
  --gradient-surface:  linear-gradient(180deg, #1A1A1F 0%, #111114 100%);
  --gradient-cta:      linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%);  /* purple → pink for CTA */
}
```

### 1.2 Typography

Import **Inter** (body/UI) and **Plus Jakarta Sans** (headings/display) from Google Fonts.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');

:root {
  /* ── Font Families ──────────────────────────── */
  --font-heading: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-body:    'Inter', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', 'Fira Code', monospace;

  /* ── Font Sizes (modular scale ~1.25) ───────── */
  --text-xs:   0.75rem;    /* 12px — badges, timestamps */
  --text-sm:   0.875rem;   /* 14px — labels, secondary text */
  --text-base: 1rem;       /* 16px — body text */
  --text-lg:   1.125rem;   /* 18px — card titles */
  --text-xl:   1.25rem;    /* 20px — section headers */
  --text-2xl:  1.5rem;     /* 24px — page headers */
  --text-3xl:  1.875rem;   /* 30px — big numbers */
  --text-4xl:  2.25rem;    /* 36px — hero values */
  --text-5xl:  3rem;       /* 48px — landing hero */

  /* ── Font Weights ───────────────────────────── */
  --weight-light:    300;
  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;
  --weight-extrabold:800;

  /* ── Line Heights ───────────────────────────── */
  --leading-tight:  1.2;
  --leading-snug:   1.35;
  --leading-normal: 1.5;
  --leading-relaxed:1.65;
}
```

**Typography Rules:**
- Headings (`h1`–`h4`): `--font-heading`, weight 700–800, `--leading-tight`
- Body / labels: `--font-body`, weight 400–500, `--leading-normal`
- Financial values / numbers: `--font-body`, weight 700, tabular-nums
- Badges / timestamps: `--text-xs`, weight 600, `--color-text-muted`

### 1.3 Spacing

```css
:root {
  --space-1:  0.25rem;  /* 4px */
  --space-2:  0.5rem;   /* 8px */
  --space-3:  0.75rem;  /* 12px */
  --space-4:  1rem;     /* 16px */
  --space-5:  1.25rem;  /* 20px */
  --space-6:  1.5rem;   /* 24px */
  --space-8:  2rem;     /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
}
```

### 1.4 Borders & Radii

```css
:root {
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   14px;
  --radius-xl:   20px;
  --radius-full: 9999px;
}
```

### 1.5 Shadows & Glows

```css
:root {
  --shadow-sm:   0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md:   0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg:   0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px rgba(139, 92, 246, 0.25);  /* purple glow */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--color-border);
}
```

### 1.6 Transitions

```css
:root {
  --transition-fast:   150ms ease;
  --transition-base:   250ms ease;
  --transition-slow:   400ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## 2. Global CSS Reset & Base Styles

`src/styles/global.css`:

```css
@import './tokens.css';

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

body {
  font-family: var(--font-body);
  background: var(--color-bg-body);
  color: var(--color-text-primary);
  line-height: var(--leading-normal);
  min-height: 100vh;
}

a { color: var(--color-purple-400); text-decoration: none; }
a:hover { color: var(--color-purple-300); }

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--color-bg-surface); }
::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: var(--radius-full); }
::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }

/* Selection */
::selection { background: rgba(139, 92, 246, 0.3); color: #fff; }
```

---

## 3. Directory Structure

```
client/src/
├── main.tsx                          # Entry — BrowserRouter + App
├── App.tsx                           # Route definitions only
├── styles/
│   ├── tokens.css                    # Design tokens (Step 1)
│   └── global.css                    # Reset + base (Step 2)
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               # Collapsible sidebar nav
│   │   ├── Sidebar.css
│   │   ├── TopBar.tsx                # Notifications, user avatar, date range
│   │   ├── TopBar.css
│   │   ├── AppShell.tsx              # Sidebar + TopBar + <Outlet/>
│   │   └── AppShell.css
│   │
│   ├── ui/
│   │   ├── Button.tsx / Button.css
│   │   ├── Card.tsx / Card.css
│   │   ├── Input.tsx / Input.css
│   │   ├── Badge.tsx / Badge.css
│   │   ├── Avatar.tsx / Avatar.css
│   │   ├── ProgressBar.tsx / ProgressBar.css
│   │   ├── Toggle.tsx / Toggle.css
│   │   ├── Modal.tsx / Modal.css
│   │   ├── Spinner.tsx / Spinner.css
│   │   ├── EmptyState.tsx / EmptyState.css
│   │   └── DataTable.tsx / DataTable.css
│   │
│   ├── charts/
│   │   ├── DonutChart.tsx            # Recharts wrapper
│   │   ├── LineChart.tsx
│   │   ├── BarChart.tsx
│   │   └── ChartCard.tsx / ChartCard.css
│   │
│   └── features/
│       ├── StatCard.tsx / StatCard.css
│       ├── TransactionRow.tsx / TransactionRow.css
│       ├── ProposalCard.tsx / ProposalCard.css
│       ├── BudgetCategoryBar.tsx / BudgetCategoryBar.css
│       ├── SavingGoalCard.tsx / SavingGoalCard.css
│       └── FilterChips.tsx / FilterChips.css
│
├── pages/
│   ├── LoginPage.tsx / LoginPage.css
│   ├── SignUpPage.tsx / SignUpPage.css
│   ├── LinkBankPage.tsx / LinkBankPage.css
│   ├── DashboardPage.tsx / DashboardPage.css
│   ├── BudgetPage.tsx / BudgetPage.css
│   ├── SavingsPage.tsx / SavingsPage.css
│   ├── ProposalsPage.tsx / ProposalsPage.css
│   └── ProfilePage.tsx / ProfilePage.css
│
├── hooks/
│   ├── useAuth.ts                    # JWT token + user state
│   ├── useApi.ts                     # fetch wrapper with token injection
│   ├── useBudget.ts                  # GET/PUT budget data
│   └── useProposals.ts              # GET/POST proposals
│
├── context/
│   └── AuthContext.tsx               # Auth provider + protected route
│
├── services/
│   └── api.ts                        # Base API client (fetch wrapper)
│
└── types/
    ├── budget.ts                     # Budget, BudgetCategory types
    ├── proposal.ts                   # Proposal, ProposalStatus types
    ├── user.ts                       # User, AuthState types
    └── transaction.ts                # Transaction types
```

---

## 4. Component Specifications

### 4.1 Layout Components

#### `AppShell`
The authenticated layout wrapper. Uses CSS Grid: sidebar on left, main content right.

```
┌──────────┬──────────────────────────────────────┐
│          │  TopBar (date range, notifs, avatar)  │
│  Sidebar │──────────────────────────────────────│
│  (nav)   │                                      │
│          │  Page Content (<Outlet />)            │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

**Styling rules:**
- Sidebar: `width: 240px`, `background: var(--color-bg-surface)`, `border-right: 1px solid var(--color-border)`
- Active nav item: `background: rgba(139, 92, 246, 0.12)`, `color: var(--color-purple-400)`, left border accent `3px solid var(--color-purple-500)`
- Hover nav item: `background: var(--color-bg-hover)`
- Logo at top of sidebar: app name in `--font-heading`, weight 800, with a small purple dot or icon
- Sidebar collapses to icon-only at `< 1024px`

#### `TopBar`
- Right-aligned: date range pill, notification bell (with unread dot), user avatar + name
- Date range pill: `background: var(--color-bg-elevated)`, `border: 1px solid var(--color-border)`, `border-radius: var(--radius-full)`
- Height: `64px`, `border-bottom: 1px solid var(--color-border)`

#### `Sidebar`
Nav items (icon + label):
- Dashboard, Budget, Savings, Proposals (agent), Profile
- Bottom: Logout button

### 4.2 UI Components

#### `Button`
Variants:
- **primary**: `background: var(--gradient-primary)`, white text, purple glow on hover
- **secondary**: `background: var(--color-bg-elevated)`, `border: 1px solid var(--color-border)`, light text
- **ghost**: transparent, text only, subtle hover background
- **danger**: `background: var(--color-danger-bg)`, `color: var(--color-danger)`
- **cta**: `background: var(--gradient-cta)` — purple to pink, for primary CTAs on auth pages

All buttons: `border-radius: var(--radius-md)`, `font-weight: var(--weight-semibold)`, `transition: var(--transition-fast)`, `cursor: pointer`

#### `Card`
- `background: var(--color-bg-surface)`
- `border: 1px solid var(--color-border)`
- `border-radius: var(--radius-lg)`
- `padding: var(--space-5)`
- Hover: `border-color: var(--color-purple-800)`, `box-shadow: var(--shadow-md)`
- Transition: `var(--transition-base)`

#### `Input`
- `background: var(--color-bg-elevated)`
- `border: 1px solid var(--color-border)`
- `border-radius: var(--radius-md)`
- `color: var(--color-text-primary)`
- `padding: var(--space-3) var(--space-4)`
- Focus: `border-color: var(--color-border-focus)`, `box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2)`
- Placeholder: `color: var(--color-text-muted)`
- Label above: `font-size: var(--text-sm)`, `color: var(--color-text-secondary)`, `margin-bottom: var(--space-1)`

#### `Badge`
- Variants: `success`, `warning`, `danger`, `info`, `neutral`
- Each uses its semantic color as text + a 12% opacity background
- `border-radius: var(--radius-full)`, `padding: 3px 10px`, `font-size: var(--text-xs)`, `weight: 600`

#### `ProgressBar`
- Track: `background: var(--color-bg-elevated)`, `height: 8px`, `border-radius: var(--radius-full)`
- Fill: gradient from `--color-purple-500` to `--color-purple-400` (or semantic color)
- Animated fill width transition: `var(--transition-slow)`

#### `DataTable`
- Header row: `font-size: var(--text-xs)`, `color: var(--color-text-muted)`, uppercase, `letter-spacing: 0.05em`
- Body rows: `border-bottom: 1px solid var(--color-border)`, hover `background: var(--color-bg-hover)`
- Zebra striping: none (too noisy on dark)
- Amounts: `font-variant-numeric: tabular-nums`, right-aligned

### 4.3 Feature Components

#### `StatCard`
Matches the Revenue / Daily Expenses cards from the reference:
- Card with icon area (circle with colored background), label, large value, change indicator
- Change indicator: green arrow up / red arrow down + percentage

#### `ProposalCard`
For agent proposals (budget/debt/investing):
- Card header with proposal type icon + badge (`pending`, `executed`, `rejected`)
- Summary text
- Rationale section (collapsible)
- Action buttons: Approve (primary), Reject (danger) — only if status is `pending`
- Timestamp in `--text-xs`, `--color-text-muted`

#### `BudgetCategoryBar`
Horizontal bar showing budget category with:
- Icon + category name (left)
- Amount + percentage of income (right)
- Progress bar below (filled to percentage, color per category)

#### `SavingGoalCard`
- Icon + goal name + deadline
- Progress ring or bar with percentage
- Saved vs Target amounts
- `Complete` badge if 100%

#### `TransactionRow`
- Merchant icon (circle with emoji or initial), name, category badge, date, amount
- Amount: green for income, default for expenses

#### `ChartCard`
Wraps Recharts charts inside a `Card` with:
- Title + subtitle + "View Report" button header
- Chart area below

---

## 5. Page Specifications

### 5.1 Login Page (`/login`)

**Layout:** Split-screen. Left half = dark hero. Right half = white/light form panel.

**Left panel:**
- `background: var(--color-bg-body)` with subtle radial gradient circle (like Payoneer reference)
- Large heading: **"Manage your money"** in `--font-heading`, `--text-5xl`, `--weight-extrabold`, `--color-text-primary`
- Subtitle text above: `--text-sm`, `--color-text-secondary`
- Optional: decorative purple glow orb in background

**Right panel:**
- `background: #FFFFFF` (light surface for contrast)
- App logo + "Sign Up" link top-right
- **"Sign In"** heading: `--font-heading`, `--text-3xl`, `--weight-bold`, `color: #09090B`
- Input fields: Email, Password (with show/hide toggle)
- "Forgot password?" link in `--color-purple-500`
- Submit button: full-width, `background: var(--gradient-cta)`, `border-radius: var(--radius-full)`, `color: white`, with arrow icon
- Footer: copyright + links

**Responsive:** Stacks vertically on mobile — left hero collapses to a shorter banner.

### 5.2 Sign Up Page (`/signup`)

Same split layout as Login with:
- Right panel fields: First Name, Last Name, Email, Password, Confirm Password
- Password strength indicator bar below password field
- Submit button: "Create Account" with `--gradient-cta`
- "Already have an account? Sign in" link at bottom

### 5.3 Link Bank Page (`/link-bank`)

Post-signup onboarding step. Full-screen centered card.

- `background: var(--color-bg-body)`
- Centered card (`max-width: 500px`): `background: var(--color-bg-surface)`, `border: 1px solid var(--color-border)`
- Heading: "Connect Your Bank" in `--font-heading`
- Subtitle: "We use Plaid to securely connect to your accounts."
- Plaid Link button: large, `background: var(--gradient-primary)`, with bank icon
- Trust badges / icons below: "Bank-level encryption", "Read-only access", "256-bit SSL"
- "Skip for now" ghost link at bottom

### 5.4 Dashboard Page (`/dashboard`)

**Layout:** Inside `AppShell`. Grid of cards matching the reference design.

**Greeting header:**
- "Hi {firstName}, here are your financial stats" — `--font-heading`, `--text-2xl`
- Date range selector pill (right side)

**Row 1 — 3 chart cards (equal width):**
1. **Revenue** — `ChartCard` with `LineChart` (dual lines — income/expenses)
   - "View Report" button top-right
   - Subtitle: data date range
   - Legend dots at bottom
2. **Daily Expenses** — `ChartCard` with `BarChart`
3. **Summary** — `ChartCard` with `DonutChart` (center value = total, ring segments = categories)
   - Category legend to the right of donut with colored dots + names + percentages

**Row 2 — 2 columns:**
- **Left (wider):** "Daily Transactions" — `DataTable` inside `Card`
  - Columns: Description (avatar + name), Date, Type, Amount
  - "View Report" button
- **Right:** 
  - **Saving Goal** — `SavingGoalCard` with progress bar + dollar values
  - Below: CTA card ("Visit our financial blog" or agent tip) with illustration/icon + button

### 5.5 Budget Page (`/budget`)

**Layout:** Inside `AppShell`.

**Header:** "Budget" + "Agent-recommended monthly plan" subtitle

**Row 1 — 4 stat cards:** Monthly Income, Needs, Wants, Savings & Debt

**Main section:** Full list of `BudgetCategoryBar` components:
- Housing, Utilities, Transportation, Groceries, Personal Care, Dining Out, Shopping, Investing, Debt Payments
- Each shows amount/mo + % of income + color-coded progress bar

**Bottom:** "Ask Agent to Revise" button (links to proposals)

### 5.6 Savings Page (`/savings`)

**Header:** "Savings Goals" + "Track progress toward your targets"

**Action button:** "+ New Goal" (primary)

**Grid of `SavingGoalCard`** components (2 columns on desktop, 1 on mobile)

### 5.7 Agent Proposals Page (`/proposals`)

**Header:** "AI Agent Proposals" + subtitle

**Filter chips:** All, Budget, Debt, Investing | Status: Pending, Executed, Rejected

**List of `ProposalCard` components**, sorted by `createdAt` desc:
- Each card shows: type badge, summary, rationale (expandable), approval/rejection actions
- Pending proposals get prominent Approve/Reject buttons
- Executed proposals show green "Executed" badge
- Rejected proposals show red "Rejected" badge with reason

### 5.8 User Profile Page (`/profile`)

**Header:** "Profile" + "Manage your personal information"

**Sections (each in a `Card`):**
1. **Avatar & Name** — large avatar circle (initials or photo), full name, email, "Change Photo" button
2. **Personal Information** — editable fields: First Name, Last Name, Email, Phone — each row has inline "Edit" button
3. **Linked Accounts** — shows connected Plaid bank accounts with status badges + "Link Another" button
4. **Preferences** — toggle switches: notifications, two-factor, data sharing
5. **Danger Zone** — "Delete Account" danger button in a bordered card

---

## 6. Routing Structure

```typescript
// App.tsx
<Routes>
  {/* Public */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/signup" element={<SignUpPage />} />

  {/* Post-signup onboarding */}
  <Route path="/link-bank" element={<ProtectedRoute><LinkBankPage /></ProtectedRoute>} />

  {/* Authenticated (inside AppShell) */}
  <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/budget" element={<BudgetPage />} />
    <Route path="/savings" element={<SavingsPage />} />
    <Route path="/proposals" element={<ProposalsPage />} />
    <Route path="/profile" element={<ProfilePage />} />
  </Route>

  {/* Fallback */}
  <Route path="*" element={<Navigate to="/dashboard" />} />
</Routes>
```

---

## 7. API Integration

### `services/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || 'Request failed');
  }
  return res.json();
}
```

### API Endpoints by Page

| Page | Endpoints |
|------|-----------|
| Login | `POST /login` |
| Sign Up | `POST /register` |
| Link Bank | `POST /plaid/create-link-token`, `POST /plaid/exchange-token` |
| Dashboard | `GET /budget`, `GET /proposals?status=pending` |
| Budget | `GET /budget`, `PUT /budget/:budgetId` |
| Proposals | `GET /proposals`, `POST /agent/budget`, `POST /agent/budget/:id/respond`, `POST /agent/debt/:id/respond`, `POST /agent/investing/:id/respond` |
| Profile | `GET /verify` (user info), `POST /logout` |

---

## 8. Micro-Animations & Interactions

Apply throughout for a premium feel:

| Element | Animation |
|---------|-----------|
| Cards | `transform: translateY(-2px)` + `box-shadow: var(--shadow-lg)` on hover |
| Buttons | `transform: scale(0.98)` on `:active`, glow increase on hover |
| Page transitions | Fade-in with `opacity 0 → 1` + `translateY(8px → 0)` over `var(--transition-slow)` |
| Progress bars | Width animates in with `var(--transition-slow)` on mount |
| Sidebar nav | Active item background slides in with `var(--transition-fast)` |
| Donut chart | Segments animate in sequentially on load |
| Modal | Backdrop fade + card scales from `0.95 → 1` |
| Proposal approve | Card briefly flashes green border, then updates badge |
| Numbers | Counter animation on stat cards (count up from 0 to value) |
| Loading | Skeleton shimmer placeholders using `@keyframes shimmer` with purple gradient |

---

## 9. Responsive Breakpoints

```css
/* Mobile-first */
@media (min-width: 640px)  { /* sm — two-column grids */ }
@media (min-width: 768px)  { /* md — sidebar visible */ }
@media (min-width: 1024px) { /* lg — full sidebar + 3-column charts */ }
@media (min-width: 1280px) { /* xl — wider content area */ }
```

- **< 768px:** Sidebar becomes a slide-out hamburger menu. Charts stack to 1 column.
- **768–1024px:** Sidebar collapsed to icons. Charts 2 columns.
- **> 1024px:** Full sidebar expanded. Charts 3 columns matching reference.

---

## 10. Testing Strategy

### Dependencies to Add

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### Test Structure

```
client/src/
├── __tests__/
│   ├── components/
│   │   ├── ui/Button.test.tsx
│   │   ├── ui/Card.test.tsx
│   │   ├── ui/Input.test.tsx
│   │   ├── features/StatCard.test.tsx
│   │   ├── features/ProposalCard.test.tsx
│   │   └── layout/Sidebar.test.tsx
│   ├── pages/
│   │   ├── LoginPage.test.tsx
│   │   ├── DashboardPage.test.tsx
│   │   └── ProposalsPage.test.tsx
│   └── hooks/
│       ├── useAuth.test.ts
│       └── useApi.test.ts
```

### What to Test

| Layer | What | How |
|-------|------|-----|
| UI Components | Render variants, props, accessibility | `@testing-library/react` — `render`, `screen.getByRole` |
| Feature Components | Data display, conditional rendering | Pass mock props, assert text/elements present |
| Pages | Data fetching, loading/error states | Mock `useApi` / `fetch`, verify async behavior |
| Hooks | State transitions, API calls | `renderHook` from testing library |
| Interactions | Button clicks, form submissions | `userEvent.click`, `userEvent.type` |

---

## 11. Execution Order

> [!IMPORTANT]
> Follow this exact order. Each step depends on the previous.

1. **Clean up:** Remove MUI, Emotion packages. Delete existing `Pages/` and `theme.ts`
2. **Install:** `lucide-react`, `recharts`, testing deps
3. **Create `styles/tokens.css`** — all design tokens from Section 1
4. **Create `styles/global.css`** — reset + base from Section 2
5. **Update `main.tsx`** — remove MUI ThemeProvider, import new global CSS
6. **Build UI components** — Button → Card → Input → Badge → ProgressBar → Toggle → Modal → Spinner → EmptyState → DataTable
7. **Build layout** — Sidebar → TopBar → AppShell
8. **Build feature components** — StatCard → TransactionRow → ProposalCard → BudgetCategoryBar → SavingGoalCard → FilterChips → Chart wrappers
9. **Build pages** — LoginPage → SignUpPage → LinkBankPage → DashboardPage → BudgetPage → SavingsPage → ProposalsPage → ProfilePage
10. **Wire routing** — Update `App.tsx` with routes from Section 6
11. **Build hooks & services** — `api.ts` → `useAuth` → `useApi` → `useBudget` → `useProposals` → `AuthContext`
12. **Connect pages to API** — Replace mock data with real API calls
13. **Polish** — Animations, responsive testing, accessibility audit
14. **Write tests** — UI components first, then pages, then hooks

---

## 12. Strict Styling Rules

> [!CAUTION]
> Violating any of these rules will result in an inconsistent UI. Follow without exception.

1. **No hardcoded colors.** Every color must use a `--color-*` token.
2. **No hardcoded spacing.** Every margin/padding must use a `--space-*` token.
3. **No hardcoded border-radius.** Use `--radius-*` tokens.
4. **No inline styles.** All styling via CSS files paired with components.
5. **No MUI or component library imports.** Everything is hand-built.
6. **One component = one `.tsx` + one `.css` file.** Component CSS uses BEM-style class naming (`block__element--modifier`).
7. **Dark backgrounds only.** No white or light gray surfaces except the right panel of Login/Signup pages.
8. **Purple is the accent, not the background.** Use purple for: active states, focus rings, primary buttons, link text, chart accents, badges. Never use it as a large surface fill.
9. **All interactive elements** must have `:hover`, `:focus-visible`, and `:active` states.
10. **Transitions on everything.** No instant state changes — always use `--transition-*` tokens.
11. **Consistent card styling.** Every card uses the `Card` component. No ad-hoc card-like divs.
12. **Financial numbers** always use `font-variant-numeric: tabular-nums` for alignment.
