# SodiumController

**Daily Nutrition, Allergen & FDA Limit Tracker for UMich Dining Halls**  
*Made by a Wolverine, for Wolverines — Not officially affiliated with the University of Michigan.*

Built with a **C++20 scraper & WebAssembly nutrition engine** (`cpp-engine/`) and an **Angular 19 + Signals + Tailwind CSS** single-page application (`frontend/`).

---

## What This Project Does

SodiumController helps University of Michigan students eating across Ann Arbor's 6 residential dining halls (**Bursley**, **South Quad**, **East Quad**, **Mosher-Jordan**, **North Quad**, and **Markley**) track how much sodium, saturated fat, sugar, protein, fiber, and calories they are consuming relative to daily nutritional limits — while filtering out food allergens before building a meal.

Dining hall meals can easily exceed 100% of the 2,300 mg FDA daily sodium ceiling in a single sitting. Every morning, a GitHub Actions pipeline compiles and tests the C++20 engine, scrapes live M|Dining menus across all 6 halls (`America/Detroit` timezone), commits updated menu payloads, runs Angular unit tests, and deploys the production SPA to GitHub Pages.

---

## Architecture Overview

### 1. C++20 Scraper & WebAssembly Nutrition Engine (`cpp-engine/`)

| File | Purpose |
|------|---------|
| `CMakeLists.txt` | CMake build configuration — builds `nutrition_engine` static library, `sodium_scraper` CLI binary, `test_nutrition_engine` test runner, and optional Emscripten `nutrition_engine_wasm` target |
| `include/menu_item.hpp` | Strongly typed `MenuItem`, `TrayItem`, and `DailyMenuPayload` structs (including `allergens`, `hallSlug`, and `isFallback` metadata) with `nlohmann/json` round-trip support |
| `include/html_parser.hpp` / `src/html_parser.cpp` | Precompiled-regex & single-pass entity HTML parser extracting meal periods, stations, serving sizes, 10 macro/electrolyte metrics (including trace `< 1g` values), dietary traits (`Vegan`, `Vegetarian`, `Halal`, `Gluten-Free`), and FDA Big-9 allergens across all 6 M|Dining halls |
| `include/nutrition_calculator.hpp` / `src/nutrition_calculator.cpp` | Decoupled `O(N)` nutrition aggregator — computes `%DV` ratios, bar chart heights (`visualHeightPct`), ceiling/floor alert states, and `#1 Top Offender` rankings against configurable dietary benchmarks |
| `src/main_scraper.cpp` | Multi-hall CLI binary (`--all-halls`, `--hall <slug>`, `--offline-fallback`) enforcing TLS verification, 5 MB response caps, `America/Detroit` dates, and safe live-data preservation on transient network failures |
| `wasm/nutrition_bindings.cpp` & `build-wasm.sh` | Emscripten `embind` target compiling `NutritionCalculator::calculateTraySummary` into `nutrition_engine.wasm` + ES6 module loader for client-side browser execution |
| `tests/test_nutrition_engine.cpp` | Release-safe C++ unit test suite covering HTML entity decoding, tag isolation, trace nutrient parsing, Big-9 allergen extraction, multi-hall fallbacks, custom benchmarks, and JSON round-trips |

### 2. Angular 19 + Signals Frontend (`frontend/`)

| Layer | File(s) | What It Does |
|-------|---------|--------------|
| **Data Models** | `models/nutrition.model.ts` | Strict TypeScript interfaces, `BENCHMARK_PROFILES` (*FDA Standard 2,000 kcal*, *Active Wolverine 2,500 kcal*, *Low-Sodium Heart Healthy 1,800 kcal*), `DINING_HALLS`, `ALLERGEN_OPTIONS`, and verified scoop presets |
| **Menu Sync Service** | `services/menu-sync.service.ts` | Fetches per-hall JSON (`assets/menus/{slug}-today.json`), persists selected hall & excluded allergens in `localStorage`, defaults meal period to current Detroit time, distinguishes live vs. fallback menus, and powers instant search, dietary tags, low-sodium (`<= 400 mg`) filtering, Big-9 allergen exclusion, and nutrient sorting |
| **Tray Cart Service** | `services/tray-cart.service.ts` | Signal-driven tray (`signal`, `computed`, `effect`) wired to execute the compiled C++20 WebAssembly engine when available (with automatic TypeScript fallback), auto-expiring trays at Detroit midnight into a 14-day history archive, and generating copyable tray summaries |
| **Header Status** | `components/header-status/` | Sticky header with accessible dining hall selector, live/offline sync badge, reload button, and multi-day sodium history trigger |
| **Menu Browser** | `components/menu-browser/` | Keyboard-navigable WAI-ARIA meal tabs, `<search>` landmark with dish search, nutrient sort dropdown (*Lowest Sodium*, *Highest Protein*, *Lowest Calories*), dietary pills, *Low Sodium* toggle, *Exclude Allergens* safety bar, allergen badges, and live in-tray quantity steppers on dish cards |
| **Salad Bar Estimator** | `components/salad-bar-estimator/` | 1-click UMich salad bar scoop presets plus an accessible Reactive Form (`for`/`id` labels, post-interaction validation, focus management, live status announcements) for custom foods |
| **Food Tray Cart** | `components/food-tray-cart/` | Sticky `<aside>` summary with `-1x` / `+1x` whole-plate steppers, 1-click item removal, dynamic sodium ceiling progress bar, and *Copy Tray Summary* clipboard export |
| **Limit Bar Chart** | `components/limit-bar-chart/` | Interactive `%DV` vertical bar chart (`0–150%` scale), macro summary cards, accessible semantic `<table>` view, profile switcher, engine indicator badge, and `#1 Top Offender` callout |
| **Sodium History Dialog** | `components/sodium-history/` | Native `<dialog closedby="any">` modal with light-dismiss & Safari coordinate fallback, scroll-chaining containment, 14-day sodium trends, and layout-stable inline history clearing |

---

## Project Structure

```text
SodiumController/
├── .github/workflows/daily-sync.yml    # CI/CD: C++ tests, multi-hall scrape, Angular tests & Pages deploy
├── .gitignore
├── README.md
├── SECURITY.md
├── sodium-today.json                   # Default Bursley menu payload
│
├── cpp-engine/                         # C++20 Scraper & WebAssembly Nutrition Engine
│   ├── CMakeLists.txt
│   ├── build-wasm.sh
│   ├── include/
│   │   ├── menu_item.hpp
│   │   ├── html_parser.hpp
│   │   └── nutrition_calculator.hpp
│   ├── src/
│   │   ├── main_scraper.cpp
│   │   ├── html_parser.cpp
│   │   └── nutrition_calculator.cpp
│   ├── wasm/
│   │   └── nutrition_bindings.cpp
│   └── tests/
│       └── test_nutrition_engine.cpp
│
└── frontend/                           # Angular 19 + Signals + Tailwind CSS SPA
    ├── angular.json
    ├── package.json
    ├── tailwind.config.js
    ├── tsconfig.json
    └── src/
        ├── index.html
        ├── styles.css
        ├── assets/
        │   ├── sodium-today.json
        │   ├── menus/                  # Per-hall daily JSON payloads (6 dining halls)
        │   └── wasm/                   # Optional WASM manifest & compiled module
        └── app/
            ├── app.component.ts / .html / .spec.ts
            ├── app.config.ts
            ├── models/
            │   └── nutrition.model.ts
            ├── services/
            │   ├── menu-sync.service.ts / .spec.ts
            │   └── tray-cart.service.ts / .spec.ts
            └── components/
                ├── header-status/
                ├── menu-browser/
                ├── salad-bar-estimator/
                ├── food-tray-cart/
                ├── limit-bar-chart/
                └── sodium-history/
```

---

## How to Run Locally

### C++20 Engine & Scraper
```bash
# Install dependencies (macOS)
brew install cmake nlohmann-json

# Configure & build (Release mode)
cmake -B cpp-engine/build -S cpp-engine -DCMAKE_BUILD_TYPE=Release
cmake --build cpp-engine/build

# Run the C++ unit test suite (48 checks)
./cpp-engine/build/test_nutrition_engine

# Scrape live menus across all 6 Ann Arbor residential dining halls
./cpp-engine/build/sodium_scraper --all-halls

# Scrape a single dining hall or generate offline verified menus
./cpp-engine/build/sodium_scraper --hall south-quad
./cpp-engine/build/sodium_scraper --all-halls --offline-fallback

# Optional: Compile the C++ nutrition calculator to WebAssembly (requires Emscripten SDK)
./cpp-engine/build-wasm.sh
```

### Angular 19 Frontend
```bash
cd frontend
npm install
npm test -- --watch=false --browsers=ChromeHeadless   # Run unit test suite
npm run build                                         # Production bundle → dist/frontend/
npm start                                             # Dev server at http://localhost:4200
```

---

## Dietary Benchmark Profiles & Customizer

| Profile | Calorie Base | Sodium Ceiling | Sat Fat Ceiling | Sugar Ceiling | Protein Floor | Fiber Floor |
|---------|--------------|----------------|-----------------|---------------|---------------|-------------|
| **FDA Standard (`FDA 2k`)** | 2,000 kcal | 2,300 mg | 20 g | 50 g | 50 g | 28 g |
| **Wolverine 2.5k *(Active / Gym)*** | 2,500 kcal | 2,300 mg | 24 g | 55 g | 140 g | 34 g |
| **Low-Sodium Heart Healthy (`Heart 1.8k`)** | 1,800 kcal | 1,500 mg | 15 g | 36 g | 65 g | 28 g |
| **Custom Targets (`Custom`)** | User-defined | User-defined | User-defined | User-defined | User-defined | User-defined |
