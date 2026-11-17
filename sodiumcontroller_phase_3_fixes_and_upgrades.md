# SodiumController — Architectural Fixes & Phase 3 Upgrades (`fixes-1.md`)

This document outlines the immediate architectural fixes and high-value upgrades for the **C++20** (`cpp-engine/`) and **Angular 19 + Signals** (`frontend/`) codebase.

---

## 1. Fix the GitHub Pages & Angular Build Pipeline (Highest Priority)

### The Issue
Currently, `.github/workflows/daily-sync.yml` compiles and runs the C++ scraper and commits `sodium-today.json` into the repository root and `frontend/src/assets/`, while the legacy vanilla JS `index.html` remains in the repository root.
1. GitHub Pages cannot serve an uncompiled Angular 19 source directory (`frontend/src/`) directly. If GitHub Pages is serving from the root branch, visitors are still seeing the legacy vanilla JS `index.html` instead of the Angular 19 SPA.
2. Committing `sodium-today.json` into `frontend/src/assets/` at 4:00 AM EST does not update a live Angular deployment unless the Angular project is rebuilt and redeployed (or fetches the raw JSON dynamically).

### Action Items
1. Update `.github/workflows/daily-sync.yml` so that after `./cpp-engine/build/sodium_scraper` writes the fresh `sodium-today.json`:
   - It commits the updated `sodium-today.json` back to `main`.
   - It runs `npm ci && npm run build -- --base-href /SodiumController/` inside `frontend/`.
   - It deploys the compiled Angular output (`frontend/dist/frontend/browser/`) to GitHub Pages using `actions/upload-pages-artifact` and `actions/deploy-pages@v4`.
2. Ensure `MenuSyncService` fetches `assets/sodium-today.json?t=${Date.now()}` with a cache-busting query parameter so browsers never serve a stale menu from yesterday.

---

## 2. Purge Legacy Prototype Files from the Repository Root

### The Issue
The repository root still contains superseded prototype files:
- `index.html` (legacy single-file prototype)
- `sync-sodium.js` (legacy Node.js scraper)
- `package.json` (legacy root file)
- `m_dining_bursley_hall_nutrition_limit_tracker.html`

Keeping these in the root causes GitHub Pages routing collisions and skews repository language statistics away from **C++** and **TypeScript**.

### Action Items
Remove the legacy files from the root directory (Git commit history already preserves them if ever needed):
```bash
git rm -f index.html sync-sodium.js package.json m_dining_bursley_hall_nutrition_limit_tracker.html
```
Update `.gitignore` to ensure build artifacts (`cpp-engine/build/`, `frontend/dist/`, `frontend/node_modules/`) remain untracked.

---

## 3. Compile `nutrition_calculator.cpp` to WebAssembly (WASM)

### The Issue
Currently, both `cpp-engine/src/nutrition_calculator.cpp` and Angular's `TrayCartService` implement the %DV nutrient aggregation, ceiling/floor status checks, and top-offender ranking separately. Because the C++ binary only runs at 4:00 AM during the menu scrape (before any user builds a meal tray), `nutrition_calculator.cpp` is only executed by C++ unit tests rather than powering the live user interface.

### Action Items
1. Because `nutrition_calculator` is already decoupled from `libcurl`, add an optional **Emscripten** target in `cpp-engine/CMakeLists.txt` (or a build script) using `embind` (`emcc --bind`) to compile `nutrition_calculator.cpp` into `nutrition_engine.wasm` and `nutrition_engine.js`.
2. Load the WebAssembly module inside Angular's `TrayCartService` so that %DV calculations and top-offender rankings run through the compiled C++20 engine directly in the browser, with the TypeScript logic retained as a clean fallback.

---

## 4. Auto-Expire and Archive `localStorage` Trays at Midnight (7-Day History)

### The Issue
`TrayCartService` persists the user's cart to `localStorage` under `sodiumControllerCart`. If a student logs dinner on Monday and opens the app on Tuesday morning, Monday's food items remain in their tray against Tuesday's menu.

### Action Items
1. Update the `localStorage` schema for `sodiumControllerCart` to store a date-stamped envelope:
   ```typescript
   export interface StoredTrayEnvelope {
     date: string; // YYYY-MM-DD in America/Detroit
     items: TrayItem[];
   }
   ```
2. On app initialization, compare `StoredTrayEnvelope.date` against the `date` field from `sodium-today.json` (or today's `America/Detroit` date):
   - If the dates match, restore `items` into the active tray signal.
   - If the stored date is from a previous day and `items.length > 0`, archive that day's summary (`date`, `totalCalories`, `totalSodium_mg`, `itemsCount`) into a `sodiumControllerHistory` array in `localStorage` (retaining up to 14 days) and reset today's active tray to empty.
3. Add a compact **7-Day Sodium History** view or modal in the frontend so users can see their multi-day sodium trend against the $2,300\text{ mg}$ FDA ceiling.

---

## 5. Add Dietary Benchmark Presets (Standard FDA vs. Active / High-Protein)

### The Issue
The bar chart currently hardcodes the standard FDA $2,000\text{ kcal}$ baseline, which sets the Protein floor to $50\text{ g}$. For student-athletes or students on a high-protein diet, $50\text{ g}$ of protein is often reached in a single meal, pegging the Protein bar at the $150\%$ visual ceiling immediately.

### Action Items
1. Add a benchmark preset selector in `LimitBarChartComponent` (and `TrayCartService`) with three profiles:
   - **FDA Standard ($2,000\text{ kcal}$)**: Sodium $\le 2,300\text{ mg}$, Sat Fat $\le 20\text{ g}$, Sugars $\le 50\text{ g}$, Protein $\ge 50\text{ g}$, Fiber $\ge 28\text{ g}$.
   - **Active Wolverine ($2,500\text{ kcal}$)**: Sodium $\le 2,300\text{ mg}$ (strict ceiling kept), Sat Fat $\le 24\text{ g}$, Sugars $\le 55\text{ g}$, Protein $\ge 140\text{ g}$, Carbs $325\text{ g}$, Fiber $\ge 34\text{ g}$.
   - **Low-Sodium Heart Healthy ($1,800\text{ kcal}$)**: Sodium $\le 1,500\text{ mg}$, Sat Fat $\le 15\text{ g}$, Sugars $\le 36\text{ g}$, Protein $\ge 65\text{ g}$.
2. Persist the user's selected profile in `localStorage` and dynamically recompute the %DV signals when toggled.

---

## 6. Parameterize Multi-Hall Support in C++ and Angular

### The Issue
The scraper is currently hardcoded to fetch only Bursley Dining Hall (`bursley`), even though all University of Michigan residential dining halls share the exact same HTML DOM structure on `dining.umich.edu`.

### Action Items
1. Update `cpp-engine/src/main_scraper.cpp` to support a `--hall <slug>` or `--all-halls` flag iterating over the major Ann Arbor dining halls:
   - `bursley` (Bursley Dining Hall)
   - `south-quad` (South Quad Dining Hall)
   - `east-quad` (East Quad Dining Hall)
   - `mosher-jordan` (Mosher-Jordan Dining Hall)
   - `north-quad` (North Quad Dining Hall)
   - `markley` (Markley Dining Hall)
2. Write output files to `frontend/src/assets/menus/{hall}-today.json` (while keeping `sodium-today.json` as the default Bursley payload for backward compatibility).
3. Add a dining hall selector dropdown in `HeaderStatusComponent` (defaulting to **Bursley Hall**) so students can switch halls on the fly.