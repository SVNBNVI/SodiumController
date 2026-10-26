// sync-sodium.js — SodiumController Daily Scraper for Bursley Dining Hall
const fs = require('fs');

function getAnnArborDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function stripHtml(str) {
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNumber(text, regex) {
  const match = text.match(regex);
  return match ? parseFloat(match[1]) : 0;
}

function parseBursleyHtml(html) {
  const items = [];
  let idCounter = 1;

  const mealRegex = /<h3[^>]*>\s*(Breakfast|Lunch|Dinner|Brunch)\s*<\/h3>\s*<div class="courses">([\s\S]*?)(?=<h3[^>]*>\s*(?:Breakfast|Lunch|Dinner|Brunch)|<div id="mdining-hours"|$)/gi;
  let mealMatch;

  while ((mealMatch = mealRegex.exec(html)) !== null) {
    const rawMeal = mealMatch[1].trim().toLowerCase();
    const mealPeriod = rawMeal === 'brunch' ? 'lunch' : rawMeal;
    const coursesHtml = mealMatch[2];

    const stationParts = coursesHtml.split(/<h4[^>]*>/i);
    for (let i = 1; i < stationParts.length; i++) {
      const stationBlock = stationParts[i];
      const stationEndIdx = stationBlock.indexOf('</h4>');
      if (stationEndIdx === -1) continue;

      const stationName = stripHtml(stationBlock.slice(0, stationEndIdx));
      const stationBody = stationBlock.slice(stationEndIdx + 5);

      const dishBlocks = stationBody.split(/<div class="item-name">/i);
      for (let j = 1; j < dishBlocks.length; j++) {
        const block = dishBlocks[j];
        const nameEndIdx = block.indexOf('</div>');
        if (nameEndIdx === -1) continue;

        const dishName = stripHtml(block.slice(0, nameEndIdx));
        const textContent = stripHtml(block.slice(nameEndIdx));

        if (!dishName || !textContent.includes('Nutrition Facts')) continue;

        const servingMatch = textContent.match(/Serving Size\s+(.+?)(?=\s+Amount Per Serving|\s+Calories)/i);
        const servingSize = servingMatch ? servingMatch[1].trim() : '1 serving';

        const calories = extractNumber(textContent, /Calories\s+(\d+(?:\.\d+)?)/i);
        const fat_g = extractNumber(textContent, /Total Fat\s+(\d+(?:\.\d+)?)\s*g/i);
        const satFat_g = extractNumber(textContent, /Saturated Fat\s+(\d+(?:\.\d+)?)\s*g/i);
        const transFat_g = extractNumber(textContent, /Trans Fat\s+(\d+(?:\.\d+)?)\s*g/i);
        const cholesterol_mg = extractNumber(textContent, /Cholesterol\s+(\d+(?:\.\d+)?)\s*mg/i);
        const sodium_mg = extractNumber(textContent, /Sodium\s+(\d+(?:\.\d+)?)\s*mg/i);
        const carbs_g = extractNumber(textContent, /Total Carbohydrate\s+(\d+(?:\.\d+)?)\s*g/i);
        const fiber_g = extractNumber(textContent, /Dietary Fiber\s+(\d+(?:\.\d+)?)\s*g/i);
        const sugar_g = extractNumber(textContent, /Sugars\s+(\d+(?:\.\d+)?)\s*g/i);
        const protein_g = extractNumber(textContent, /Protein\s+(\d+(?:\.\d+)?)\s*g/i);

        const tags = [];
        if (/Vegan/i.test(block)) tags.push('Vegan');
        if (/Vegetarian/i.test(block)) tags.push('Vegetarian');
        if (/Halal/i.test(block)) tags.push('Halal');
        if (/Gluten Free/i.test(block)) tags.push('Gluten-Free');

        items.push({
          id: `sc-bursley-${mealPeriod}-${idCounter++}`,
          name: dishName,
          mealPeriod,
          station: stationName,
          servingSize,
          calories,
          protein_g,
          carbs_g,
          fat_g,
          satFat_g,
          transFat_g,
          cholesterol_mg,
          sodium_mg,
          sugar_g,
          fiber_g,
          tags
        });
      }
    }
  }

  return items;
}

async function runSodiumControllerSync() {
  const today = getAnnArborDate();
  const targetUrl = `https://dining.umich.edu/menus-locations/dining-halls/bursley/?menuDate=${today}`;

  console.log(`[SodiumController] Fetching Bursley menu for ${today}...`);
  console.log(`[SodiumController] Source: ${targetUrl}`);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'python-requests/2.32.3',
        'Accept': '*/*'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} (${res.statusText})`);
    }

    const html = await res.text();
    const items = parseBursleyHtml(html);

    console.log(`[SodiumController] Parsed ${items.length} items from Bursley Dining Hall.`);

    const payload = {
      project: 'SodiumController',
      date: today,
      lastUpdated: new Date().toISOString(),
      hall: 'Bursley Dining Hall',
      sourceUrl: targetUrl,
      itemCount: items.length,
      items
    };

    fs.writeFileSync('sodium-today.json', JSON.stringify(payload, null, 2));
    console.log('[SodiumController] Successfully wrote sodium-today.json');
  } catch (err) {
    console.error('[SodiumController ERROR]', err.message);
    process.exit(1);
  }
}

runSodiumControllerSync();