import { TestBed } from '@angular/core/testing';
import { TrayCartService, NutritionWasmModule } from './tray-cart.service';
import { MenuItem, StoredTrayEnvelope } from '../models/nutrition.model';

describe('TrayCartService', () => {
  const ramen: MenuItem = {
    id: 'test-ramen',
    name: 'Spicy Miso Ramen',
    mealPeriod: 'dinner',
    station: 'Global Kitchen',
    servingSize: '1 Bowl',
    calories: 580,
    protein_g: 24,
    carbs_g: 68,
    fat_g: 19,
    satFat_g: 6,
    transFat_g: 0,
    cholesterol_mg: 55,
    sodium_mg: 1400,
    sugar_g: 6,
    fiber_g: 4,
    tags: [],
    allergens: ['Soy', 'Wheat']
  };

  const broccoli: MenuItem = {
    id: 'test-broccoli',
    name: 'Steamed Broccoli',
    mealPeriod: 'dinner',
    station: 'Homestyle',
    servingSize: '1/2 Cup',
    calories: 30,
    protein_g: 2,
    carbs_g: 6,
    fat_g: 0,
    satFat_g: 0,
    transFat_g: 0,
    cholesterol_mg: 0,
    sodium_mg: 35,
    sugar_g: 1,
    fiber_g: 2.5,
    tags: ['Vegan', 'Gluten-Free'],
    allergens: []
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('adds, steps, removes, and aggregates nutrients accurately', () => {
    const service = TestBed.inject(TrayCartService);
    expect(service.cartCount()).toBe(0);

    service.addItem(ramen, 1.0);
    service.addItem(broccoli, 2.0);

    expect(service.cartCount()).toBe(2);
    expect(service.totalServings()).toBe(3);
    expect(service.getItemQty('test-broccoli')).toBe(2);
    expect(service.totalNutrients().sodium_mg).toBe(1470);
    expect(service.totalNutrients().calories).toBe(640);
    expect(service.sodiumAlertState()).toBe('ok');

    // Step ramen up by +1x -> 2 * 1400 + 70 = 2870mg (exceeds 2300mg ceiling)
    service.updateQty('test-ramen', 1);
    expect(service.totalNutrients().sodium_mg).toBe(2870);
    expect(service.sodiumAlertState()).toBe('exceeded');
    expect(service.topOffenders().length).toBeGreaterThan(0);
    expect(service.topOffenders()[0].itemName).toBe('Spicy Miso Ramen');

    // Decrement broccoli to 0 -> auto-removes item
    service.updateQty('test-broccoli', -2);
    expect(service.cartCount()).toBe(1);
    expect(service.getItemQty('test-broccoli')).toBe(0);
  });

  it('dynamically updates sodium limit and alert state when switching benchmark profiles', () => {
    const service = TestBed.inject(TrayCartService);
    service.addItem(ramen, 1.0); // 1400 mg Na

    expect(service.sodiumLimit()).toBe(2300);
    expect(service.sodiumAlertState()).toBe('ok'); // 61% of 2300

    service.setProfile('low-sodium-heart'); // 1500 mg limit
    expect(service.sodiumLimit()).toBe(1500);
    expect(service.sodiumPercent()).toBe(93); // 1400 / 1500 = 93.3%
    expect(service.sodiumAlertState()).toBe('warning');
  });

  it('supports user-defined custom kcal, sodium, carb, and macro targets', () => {
    const service = TestBed.inject(TrayCartService);
    service.addItem(ramen, 1.0); // 580 kcal, 1400 mg Na, 68g carbs

    service.setProfile('custom');
    service.updateCustomTarget('calories', 2400);
    service.updateCustomTarget('sodium_mg', 1800);
    service.updateCustomTarget('carbs_g', 200);

    expect(service.activeProfileId()).toBe('custom');
    expect(service.sodiumLimit()).toBe(1800);
    expect(service.remainingSodium()).toBe(400);
    const carbsMetric = service.percentDailyValues().find((m) => m.key === 'carbs_g')!;
    expect(carbsMetric.limit).toBe(200);
    expect(carbsMetric.percent).toBe(34);

    service.resetCustomTargets();
    expect(service.sodiumLimit()).toBe(2300);
  });

  it('executes registered C++20 WebAssembly module and falls back cleanly on error', () => {
    const service = TestBed.inject(TrayCartService);
    service.addItem(ramen, 1.0);

    let wasmCalled = false;
    const mockWasm: NutritionWasmModule = {
      calculateTraySummary: (cartJson: string, benchmarksJson: string) => {
        wasmCalled = true;
        const parsedCart = JSON.parse(cartJson);
        const parsedBenchmarks = JSON.parse(benchmarksJson);
        expect(parsedCart.length).toBe(1);
        expect(parsedBenchmarks.length).toBeGreaterThan(0);
        return JSON.stringify({
          totalItemsCount: 1,
          totalServingsCount: 1,
          totals: {
            calories: 580,
            sodium_mg: 1400,
            satFat_g: 6,
            sugar_g: 6,
            fat_g: 19,
            carbs_g: 68,
            fiber_g: 4,
            protein_g: 24,
            cholesterol_mg: 55,
            transFat_g: 0
          },
          percentDV: [
            {
              key: 'sodium_mg',
              label: 'Sodium',
              value: 1400,
              limit: 2300,
              unit: 'mg',
              percent: 60.9,
              visualHeightPct: 40.6,
              isCeiling: true,
              status: 'ok'
            }
          ],
          sodiumAlertState: 'ok',
          sodiumPercentDV: 60.9,
          topOffenders: []
        });
      }
    };

    service.registerWasmModule(mockWasm);
    expect(service.wasmLoaded()).toBeTrue();
    expect(service.engineMode()).toContain('WASM');
    expect(service.sodiumPercent()).toBe(61);
    expect(wasmCalled).toBeTrue();

    // Verify graceful fallback if WASM returns an error object
    service.registerWasmModule({
      calculateTraySummary: () => JSON.stringify({ error: true, message: 'parse error' })
    });
    expect(service.totalNutrients().sodium_mg).toBe(1400);
  });

  it('archives expired previous-day trays into multi-day history on startup', () => {
    const expiredEnvelope: StoredTrayEnvelope = {
      date: '2026-01-15',
      items: [{ ...ramen, qty: 2 }]
    };
    localStorage.setItem('sodiumControllerCart', JSON.stringify(expiredEnvelope));

    const service = TestBed.inject(TrayCartService);
    expect(service.cartCount()).toBe(0);
    expect(service.history().length).toBe(1);
    expect(service.history()[0].date).toBe('2026-01-15');
    expect(service.history()[0].totalSodium_mg).toBe(2800);
    expect(service.history()[0].totalCalories).toBe(1160);
  });

  it('builds a formatted shareable tray summary', () => {
    const service = TestBed.inject(TrayCartService);
    service.addItem(broccoli, 2);
    const summary = service.buildShareSummary('South Quad Dining Hall');
    expect(summary).toContain('South Quad Dining Hall');
    expect(summary).toContain('2x Steamed Broccoli');
  });
});
