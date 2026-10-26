1. **Understand the problem**: The daily sodium sync workflow is failing. The scraper `sync-sodium.js` requests a URL (like `https://dining.umich.edu/menus-locations/dining-halls/bursley/?menuDate=2024-10-26`), but the dining website seems to have added Cloudflare protection which intercepts curl/fetch requests returning a 403 Challenge page instead of the real HTML menu. The original request code in `sync-sodium.js` uses standard node `fetch` which fails.

2. **Analyze the scraping**: Cloudflare protection requires a real browser environment. `puppeteer` works perfectly to bypass it, but it adds a significant overhead. The existing script is a lightweight Node.js scraper without Puppeteer. Wait, what if we just use `puppeteer`?
Alternatively, we can use an API if one is available. Looking at the tracker, `api.allorigins.win` was used as a proxy, but wait, the proxy also returns the Cloudflare page. The `dining.umich.edu` seems heavily protected.
Let's see if we can use Puppeteer. We can run Puppeteer on Github Actions, we just need to add `puppeteer` to `package.json` and adjust the Action/script.

Wait, another issue I noticed during my tests: the HTML structure of the menu changed!
- The meal headers were: `<h3[^>]*>\s*(Breakfast|Lunch|Dinner|Brunch)\s*<\/h3>` but now they look like `<h3><a href="#"><i class="fa fa-plus"></i> Lunch</a></h3>`. So the regex for matching meals needs to be updated to: `/<h3[^>]*>[\s\S]*?(Breakfast|Lunch|Dinner|Brunch)[\s\S]*?<\/h3>\s*<div[^>]*class="courses"[^>]*>([\s\S]*?)(?=<h3[^>]*>[\s\S]*?(?:Breakfast|Lunch|Dinner|Brunch)[\s\S]*?<\/h3>|<div id="mdining-hours"|$)/gi`.
- The dish name block was `<div class="item-name">` but is now `<span class="item-name">`. The end tag needs to be `</span>` instead of `</div>`.

Wait, the tracker file `m_dining_bursley_hall_nutrition_limit_tracker.html` has this code:
```javascript
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
```
This is frontend code. The backend code is `sync-sodium.js` which runs in GH Actions. I should fix `sync-sodium.js` to use `puppeteer` to fetch the data.

Wait, using Puppeteer on GitHub Actions is easy. I just need to:
1. `npm install puppeteer` and add it to dependencies in `package.json`.
2. Update `.github/workflows/daily-sync.yml` to `npm install` before running `node sync-sodium.js`.
3. Update `sync-sodium.js` to launch a headless browser with Puppeteer, wait for the menu to load, extract the HTML content, and then run `parseBursleyHtml`.
4. Update `parseBursleyHtml` in `sync-sodium.js` to use the correct regular expressions for the new HTML structure (`mealRegex` and the dish blocks `span class="item-name"`).

Wait, the instructions say:
"Before completing your work with the submit tool, you **must** call `pre_commit_instructions` and follow its instructions to complete pre commit steps."

Let's summarize the plan:
1. Update `package.json` to include `puppeteer`.
2. Update `.github/workflows/daily-sync.yml` to run `npm install` before `node sync-sodium.js`.
3. Modify `sync-sodium.js` to use `puppeteer` to fetch the page content instead of `fetch`. This circumvents the Cloudflare check.
4. Update `parseBursleyHtml` in `sync-sodium.js` to correctly parse the new HTML structure (update `mealRegex` to handle nested `<a>` tags and `fa` icons, and update `item-name` parsing to look for `span` instead of `div`).
5. Run tests to ensure `sync-sodium.js` fetches and parses items correctly.
6. Call `pre_commit_instructions` to ensure proper testing, verification, review, and reflection are done.
7. Submit the fix.
