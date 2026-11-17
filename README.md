# SodiumController

**Daily Nutrition & FDA Limit Tracker for University of Michigan Bursley Dining Hall**

Built with a **C++20 scraper engine** and an **Angular 19 + TypeScript + Tailwind CSS** single-page application.

---

## What This Project Does

SodiumController helps UMich students eating at Bursley Dining Hall understand exactly how much sodium, saturated fat, sugar, and other nutrients they're consuming relative to the FDA's daily recommended limits. Dining hall meals can easily exceed 100% of the 2,300 mg sodium ceiling in a single sitting — this app makes that visible before you leave the hall.

Every day at 4:00 AM EST, a GitHub Actions cron job compiles and runs the C++ scraper, which fetches the live Bursley menu from `dining.umich.edu`, parses every dish's full nutrition facts, and commits a fresh `sodium-today.json` to the repo. The Angular frontend reads that file and lets you build a virtual food tray and see your limits in real time.

---

## What Was Built

### Phase 1 — C++20 Scraper & Nutrition Engine (`cpp-engine/`)

The original `sync-sodium.js` Node.js scraper was ported to a fully modular C++20 codebase:

| File | Purpose |
|------|---------|
| `CMakeLists.txt` | CMake build config — links `libcurl` and `nlohmann/json` for native binary, plus optional Emscripten WASM build target |
| `include/menu_item.hpp` | Strongly typed `MenuItem`, `TrayItem`, and `DailyMenuPayload` structs with JSON round-trip support |
| `include/html_parser.hpp` / `src/html_parser.cpp` | Deterministic HTML parser that extracts meal periods, station names, serving sizes, 10 macro/electrolyte values, and dietary tags (Vegan, Vegetarian, Halal, Gluten-Free) across any M|Dining residential hall |
| `include/nutrition_calculator.hpp` / `src/nutrition_calculator.cpp` | Decoupled O(N) nutrition aggregator — computes %DV ratios against configurable FDA / Wolverine / Low-Sodium benchmarks, evaluates ceiling/floor status, and ranks the #1 top-offending food item |
| `src/main_scraper.cpp` | Multi-hall CLI binary (`--all-halls` or `--hall <slug>`) that fetches live menus using `User-Agent: python-requests/2.32.3` (required to bypass dining.umich.edu WAF), locks dates to `America/Detroit` timezone, and writes per-hall JSON files to `frontend/src/assets/menus/` |
| `wasm/nutrition_bindings.cpp` | Emscripten `embind` bindings exposing `calculateTraySummary` directly to WebAssembly |
| `build-wasm.sh` | One-click build script compiling C++ nutrition engine to `nutrition_engine.wasm` + `.js` |
| `tests/test_nutrition_engine.cpp` | Unit tests covering mock HTML parsing, multi-hall prefixing, nutrition calculation correctness, sodium alert states, top-offender ranking, and JSON serialization round-trips |

**Key technical details preserved from the original prototype:**
- The WAF on `dining.umich.edu` blocks default user agents with HTTP 403. The exact header `User-Agent: python-requests/2.32.3` returns HTTP 200 immediately — no headless browser needed.
- Dates must be formatted in `America/Detroit` local time so UTC midnight rollover at 8 PM EST doesn't scrape tomorrow's menu prematurely.
- The nutrition engine (`nutrition_calculator`) is intentionally decoupled from `libcurl` so it can be compiled to WebAssembly or exposed as a microservice independently.

### Phase 2 — Angular 19 + TypeScript Frontend (`frontend/`)

A full single-page application ported from the original `index.html` vanilla JS prototype into modular Angular components with reactive signals:

| Layer | File(s) | What It Does |
|-------|---------|--------------|
| **Data Models** | `models/nutrition.model.ts` | Strict TypeScript interfaces (`MenuItem`, `TrayItem`, `NutrientTotals`, `PercentDailyValue`, `TopOffender`, `TraySummary`), `BENCHMARK_PROFILES` (FDA Standard, Active Wolverine, Low-Sodium), `DINING_HALLS` registry, `StoredTrayEnvelope`, and salad bar presets |
| **Menu Sync Service** | `services/menu-sync.service.ts` | Fetches hall-specific JSON (`assets/menus/{hall.slug}-today.json`) with cache-busting timestamp `?t=${Date.now()}`. Supports instant dining hall switching across 6 UMich dining halls with offline database fallbacks |
| **Tray Cart Service** | `services/tray-cart.service.ts` | Angular Signals-based cart (`signal`, `computed`, `effect`). Supports auto-expiry at Detroit midnight with 14-day history archival, active benchmark profile switching, WebAssembly engine integration with TypeScript fallback |
| **Header Status** | `components/header-status/` | Sticky top nav with SC logo, 6-hall dining hall selector dropdown, live/offline sync indicator, Reload button, and 7-day sodium history modal trigger |
| **Menu Browser** | `components/menu-browser/` | Four-tab meal period switcher (Breakfast, Lunch/Brunch, Dinner, Salad Bar). Instant search input. Dietary tag filter pills (All, Vegan, Vegetarian, Halal, Gluten-Free). Station-grouped dish cards with color-coded sodium badges and one-click "Add to Tray" |
| **Salad Bar Estimator** | `components/salad-bar-estimator/` | Six 1-click dining hall scoop presets (Mixed Greens, Cucumber & Peppers, Grilled Chicken, Hard Boiled Egg, Chickpeas, Balsamic Vinaigrette). Reactive Form for logging custom food items with full nutrition label entry |
| **Food Tray Cart** | `components/food-tray-cart/` | Sticky sidebar showing logged items with `-0.5x` / `+0.5x` portion steppers, real-time calorie and sodium totals, color-coded sodium indicator, and Clear Tray action |
| **Limit Bar Chart** | `components/limit-bar-chart/` | Vertical %DV bar chart (0–150% scale) with dashed 100% FDA Daily Value limit line, dynamic bar colors, Benchmark Profile switcher dropdown, engine badge (WASM/TS), and Top Offender analysis |
| **Sodium History Modal** | `components/sodium-history/` | Modal displaying multi-day sodium trends against the 2,300 mg FDA ceiling, average daily sodium stats, days over ceiling, and day-by-day intake breakdown with "Live Today" preview |

### GitHub Actions CI/CD (`.github/workflows/daily-sync.yml`)

Updated to:
1. Install `cmake`, `libcurl4-openssl-dev`, and `build-essential` on the Ubuntu runner
2. Build `cpp-engine` via CMake
3. Run the C++ test suite
4. Execute the scraper binary
5. Commit and push updated `sodium-today.json` files

---

## Project Structure

```
SodiumController/
├── .github/workflows/daily-sync.yml    # Daily cron: compiles & runs C++ scraper
├── .gitignore
├── README.md                           # ← You are here
├── sodium-today.json                   # Auto-generated daily menu + nutrition data
│
├── cpp-engine/                         # C++20 Scraper & Nutrition Engine
│   ├── CMakeLists.txt
│   ├── include/
│   │   ├── menu_item.hpp               # Data structs & JSON serialization
│   │   ├── html_parser.hpp             # Bursley HTML nutrition extractor
│   │   └── nutrition_calculator.hpp    # %DV aggregation & top-offender analysis
│   ├── src/
│   │   ├── main_scraper.cpp            # CLI binary (fetch → parse → write JSON)
│   │   ├── html_parser.cpp
│   │   └── nutrition_calculator.cpp
│   └── tests/
│       └── test_nutrition_engine.cpp   # Unit test suite
│
├── frontend/                           # Angular 19 + TypeScript + Tailwind CSS SPA
│   ├── angular.json
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── index.html
│       ├── styles.css
│       ├── assets/
│       │   └── sodium-today.json       # Synced daily by the C++ scraper
│       └── app/
│           ├── app.component.ts / .html
│           ├── app.config.ts
│           ├── models/
│           │   └── nutrition.model.ts
│           ├── services/
│           │   ├── menu-sync.service.ts
│           │   └── tray-cart.service.ts
│           └── components/
│               ├── header-status/
│               ├── menu-browser/
│               ├── salad-bar-estimator/
│               ├── food-tray-cart/
│               └── limit-bar-chart/
```

---

## How to Run Locally

### C++ Scraper
```bash
# Install dependencies (macOS)
brew install cmake nlohmann-json

# Build
cmake -B cpp-engine/build -S cpp-engine
cmake --build cpp-engine/build

# Run tests
./cpp-engine/build/test_nutrition_engine

# Scrape live Bursley menu
./cpp-engine/build/sodium_scraper

# Scrape ALL 6 Ann Arbor residential dining halls (Bursley, South Quad, East Quad, Mojo, North Quad, Markley)
./cpp-engine/build/sodium_scraper --all-halls

# Scrape a specific dining hall
./cpp-engine/build/sodium_scraper --hall south-quad

# Parse from a saved HTML file instead
./cpp-engine/build/sodium_scraper --input-html saved_page.html

# Compile C++ Nutrition Engine to WebAssembly (optional)
./cpp-engine/build-wasm.sh
```

### Angular Frontend
```bash
cd frontend
npm install
npm run build       # Production build → dist/frontend/
npm start           # Dev server on http://localhost:4200
```

---

## UMich Branding & Color Theme

| Color | Hex | Usage |
|-------|-----|-------|
| Michigan Maize | `#FFCB05` | Primary accent, active tabs, CTA buttons, highlighted badges |
| Michigan Blue | `#00274C` | Logo background, selected filter pills, app branding |
| Slate 900/950 | `#0f172a` / `#020617` | Dark mode backgrounds |
| Rose 500 | `#ef4444` | Exceeded ceiling alert bars and sodium warnings |
| Amber 400 | `#fbbf24` | Near-limit warning state (80–99% DV) |
| Emerald 500 | `#22c55e` | Within safe limit (< 80% DV ceiling) or floor target achieved |

---

## FDA Daily Value Benchmarks (2,000 kcal diet)

| Nutrient | FDA Limit | Limit Type | Alert Logic |
|----------|-----------|------------|-------------|
| Sodium | 2,300 mg | Strict Ceiling | Green (< 80%), Amber (80–99%), Red (≥ 100%) |
| Calories | 2,000 kcal | Neutral Target | Sky Blue |
| Saturated Fat | 20 g | Strict Ceiling | Green / Amber / Red |
| Sugars | 50 g | Strict Ceiling | Green / Amber / Red |
| Total Fat | 78 g | Strict Ceiling | Green / Amber / Red |
| Carbohydrates | 275 g | Neutral Target | Sky Blue |
| Dietary Fiber | 28 g | Minimum Floor | Sky Blue (< 100%), Emerald (≥ 100%) |
| Protein | 50 g | Minimum Floor | Sky Blue (< 100%), Emerald (≥ 100%) |
| Cholesterol | 300 mg | Strict Ceiling | Green / Amber / Red |

---

## Questions & Suggestions for the Developer

Here are open questions and potential improvements to consider for the next iteration:

### Questions
1. **Multi-hall support?** — The scraper currently targets Bursley only. Should it be extended to support South Quad, East Quad, and Twigs dining halls? The HTML structure on `dining.umich.edu` appears identical across halls — the URL path is the only difference.
2. **Deployment target?** — Is this intended to be deployed on GitHub Pages, Firebase Hosting, or a UMich server? The Angular build output is a static SPA that can be served from anywhere.
3. **User accounts or just local storage?** — Right now the food tray persists to `localStorage` on the user's browser. Would you want Firebase Auth + Firestore to let users track their intake history across days/devices?
4. **Mobile-first or desktop-first priority?** — The current layout is responsive, but should we optimize more aggressively for mobile (e.g., bottom sheet tray instead of sidebar)?

### Suggested Improvements
- **Weekly/monthly intake history** — Store daily tray snapshots in `localStorage` (or a backend) and render a 7-day or 30-day trend chart showing sodium intake over time.
- **Meal plan mode** — Let users pre-plan tomorrow's meals by switching the date forward and building a tray from the next day's menu (the scraper already supports `--date YYYY-MM-DD`).
- **Push notifications** — If sodium exceeds 80% by lunch, send a browser notification warning the user to go easy on sodium at dinner.
- **Allergen filtering** — The M|Dining HTML includes allergen data (wheat, eggs, milk, soy, tree nuts, etc.) that the C++ parser already has access to but doesn't extract yet. Adding allergen filters to the menu browser would be a strong safety feature.
- **WebAssembly nutrition calculator** — The `nutrition_calculator` library is already decoupled from `libcurl`. Compiling it to WASM with Emscripten would let the frontend run the same C++ aggregation logic client-side with zero network round-trips.
- **Dark/light mode toggle** — The app is dark-mode only right now. A light mode with the UMich maize-on-white theme would improve daytime readability.
- **Export/share tray** — Add a "Share My Tray" button that generates a shareable URL or image summary of today's intake and %DV breakdown.
