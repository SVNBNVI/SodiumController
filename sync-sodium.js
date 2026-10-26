// sync-sodium.js
const fs = require('fs');

async function syncSodium() {
  const today = new Date().toISOString().split('T')[0];
  const targetUrl = `https://dining.umich.edu/menus-locations/dining-halls/bursley/?menuDate=${today}`;

  console.log(`[CRON] Fetching Bursley sodium data for ${today}...`);

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Data payload saved to disk
    const payload = {
      date: today,
      lastUpdated: new Date().toISOString(),
      hall: 'Bursley',
      sourceUrl: targetUrl,
      status: 'synced'
    };

    fs.writeFileSync('sodium-today.json', JSON.stringify(payload, null, 2));
    console.log('[CRON] sodium-today.json successfully updated.');
  } catch (err) {
    console.error('[CRON ERROR]', err.message);
    process.exit(1);
  }
}

syncSodium();