import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MenuSyncService } from './menu-sync.service';
import { TrayCartService } from './tray-cart.service';
import { DailyMenuPayload, DINING_HALLS } from '../models/nutrition.model';

describe('MenuSyncService', () => {
  let httpMock: HttpTestingController;

  const mockSouthQuadPayload: DailyMenuPayload = {
    project: 'SodiumController',
    date: '2026-11-21',
    lastUpdated: '2026-11-21T12:00:00Z',
    hall: 'South Quad Dining Hall',
    hallSlug: 'south-quad',
    sourceUrl: 'https://dining.umich.edu/menus-locations/dining-halls/south-quad/',
    isFallback: false,
    itemCount: 3,
    items: [
      {
        id: 'sq-1',
        name: 'Egg White Omelet',
        mealPeriod: 'breakfast',
        station: 'Grill',
        servingSize: '1 Omelet',
        calories: 95,
        protein_g: 16,
        carbs_g: 2,
        fat_g: 2,
        satFat_g: 0.5,
        transFat_g: 0,
        cholesterol_mg: 0,
        sodium_mg: 190,
        sugar_g: 1,
        fiber_g: 0,
        tags: ['Vegetarian', 'Gluten-Free'],
        allergens: ['Eggs']
      },
      {
        id: 'sq-2',
        name: 'Buttermilk Pancakes',
        mealPeriod: 'breakfast',
        station: '24 Carrots',
        servingSize: '2 Pancakes',
        calories: 260,
        protein_g: 7,
        carbs_g: 44,
        fat_g: 6,
        satFat_g: 1.5,
        transFat_g: 0,
        cholesterol_mg: 35,
        sodium_mg: 540,
        sugar_g: 9,
        fiber_g: 1.5,
        tags: ['Vegetarian'],
        allergens: ['Eggs', 'Milk', 'Wheat']
      },
      {
        id: 'sq-3',
        name: 'Steel Cut Oats',
        mealPeriod: 'breakfast',
        station: 'Hot Cereal',
        servingSize: '1 Cup',
        calories: 160,
        protein_g: 6,
        carbs_g: 29,
        fat_g: 3,
        satFat_g: 0.5,
        transFat_g: 0,
        cholesterol_mg: 0,
        sodium_mg: 15,
        sugar_g: 1,
        fiber_g: 5,
        tags: ['Vegan', 'Gluten-Free'],
        allergens: []
      }
    ]
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('loads hall menu, distinguishes live vs fallback status, and switches dining halls', () => {
    const service = TestBed.inject(MenuSyncService);

    // Flush initial Bursley request with a fallback payload
    const initialReq = httpMock.expectOne((req) => req.url.startsWith('assets/menus/bursley-today.json'));
    initialReq.flush({ ...mockSouthQuadPayload, hall: 'Bursley Dining Hall', isFallback: true });
    expect(service.isLive()).toBeFalse();
    expect(service.syncStatus()).toBe('Offline Sample');

    // Switch to South Quad with live payload
    const southQuad = DINING_HALLS.find((h) => h.slug === 'south-quad')!;
    service.setHall(southQuad);
    const sqReq = httpMock.expectOne((req) => req.url.startsWith('assets/menus/south-quad-today.json'));
    sqReq.flush(mockSouthQuadPayload);

    expect(service.isLive()).toBeTrue();
    expect(service.selectedHall().slug).toBe('south-quad');
    expect(service.syncStatus()).toBe('Data Live');
  });

  it('filters by excluded allergens, low-sodium threshold, and sorts by sodium/protein', () => {
    const service = TestBed.inject(MenuSyncService);
    const initialReq = httpMock.expectOne((req) => req.url.startsWith('assets/menus/bursley-today.json'));
    initialReq.flush(mockSouthQuadPayload);

    service.setMealPeriod('breakfast');
    expect(service.filteredMenuItems().length).toBe(3);

    // Exclude Milk -> removes Buttermilk Pancakes, keeps Egg White Omelet & Oats
    service.toggleExcludedAllergen('Milk');
    expect(service.filteredMenuItems().map((i) => i.id)).toEqual(['sq-1', 'sq-3']);

    // Exclude Eggs as well -> only Steel Cut Oats remains
    service.toggleExcludedAllergen('Eggs');
    expect(service.filteredMenuItems().map((i) => i.id)).toEqual(['sq-3']);

    // Reset filters and test Low-Sodium filter + Sorting
    service.resetAllFilters();
    expect(service.filteredMenuItems().length).toBe(3);

    service.setSortBy('sodium-asc');
    expect(service.filteredMenuItems().map((i) => i.id)).toEqual(['sq-3', 'sq-1', 'sq-2']);

    service.toggleLowSodiumOnly(); // <= 400mg removes Buttermilk Pancakes (540mg)
    expect(service.filteredMenuItems().map((i) => i.id)).toEqual(['sq-3', 'sq-1']);
  });

  it('auto-switches away from an empty meal period to the first available period on load', () => {
    const service = TestBed.inject(MenuSyncService);
    service.setMealPeriod('dinner');

    // Simulate weekend Brunch-only hall (only lunch items)
    const brunchOnlyPayload: DailyMenuPayload = {
      ...mockSouthQuadPayload,
      hall: 'North Quad Dining Hall',
      hallSlug: 'north-quad',
      items: [
        { ...mockSouthQuadPayload.items[0], id: 'nq-l-1', mealPeriod: 'lunch' }
      ]
    };

    const initialReq = httpMock.expectOne((req) => req.url.startsWith('assets/menus/bursley-today.json'));
    initialReq.flush(brunchOnlyPayload);

    expect(service.selectedMealPeriod()).toBe('lunch');
    expect(service.mealPeriodCounts()).toEqual({ breakfast: 0, lunch: 1, dinner: 0 });
  });

  it('filters dishes to fit remaining sodium budget with 1-click Fits My Na Left toggle', () => {
    const service = TestBed.inject(MenuSyncService);
    const cart = TestBed.inject(TrayCartService);

    const initialReq = httpMock.expectOne((req) => req.url.startsWith('assets/menus/bursley-today.json'));
    initialReq.flush(mockSouthQuadPayload);
    service.setMealPeriod('breakfast');

    // Set 1,500 mg Heart Healthy ceiling and log 2x Pancakes (1,080 mg) -> 420 mg remaining
    cart.setProfile('low-sodium-heart');
    cart.addItem(mockSouthQuadPayload.items[1], 2.0);
    expect(cart.remainingSodium()).toBe(420);

    service.toggleFitsRemainingSodium();
    // Pancakes (540mg) exceeds 420mg left; Omelet (190mg) and Oats (15mg) fit!
    expect(service.filteredMenuItems().map((i) => i.id)).toEqual(['sq-1', 'sq-3']);
  });
});
