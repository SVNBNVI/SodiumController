import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';
import { DINING_HALLS } from './models/nutrition.model';

describe('AppComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the app and render skip link and header title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.startsWith('assets/menus/bursley-today.json'));
    req.flush({
      project: 'SodiumController',
      date: '2026-11-21',
      lastUpdated: '2026-11-21T08:00:00Z',
      hall: 'Bursley Dining Hall',
      sourceUrl: '',
      isFallback: true,
      itemCount: 0,
      items: []
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('SodiumController');
    expect(compiled.querySelector('a[href="#main-heading"]')?.textContent).toContain('Skip to main content');
    expect(compiled.textContent).toContain('Made by a Wolverine, for Wolverines');
    expect(compiled.textContent).toContain('Not officially affiliated with the University of Michigan');
  });

  it('should dynamically reflect selected dining hall and benchmark sodium limit in hero banner', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.match(() => true).forEach((r) => r.flush({ items: [] }));

    const southQuad = DINING_HALLS.find((h) => h.slug === 'south-quad')!;
    app.menuSync.setHall(southQuad);
    httpMock.match(() => true).forEach((r) => r.flush({ items: [] }));

    app.cartService.setProfile('low-sodium-heart');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('South Quad Dining Hall');
    expect(compiled.textContent).toContain('1,500 mg');
  });
});
