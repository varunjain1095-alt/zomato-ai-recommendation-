// Temporarily bypass Claude API for Phase 1 local filtering verification
const originalApiKey = process.env.ANTHROPIC_API_KEY;
process.env.ANTHROPIC_API_KEY = '';

const { loadDataset } = require('./dataLoader');
const { getRecommendations } = require('./recommender');

// Restore key for any other modules
if (originalApiKey) {
  process.env.ANTHROPIC_API_KEY = originalApiKey;
}

// Helper to format bytes to MB
function toMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  [FAIL] Assertion failed: ${message}`);
    process.exit(1);
  }
  console.log(`  [PASS] ${message}`);
}

async function runTests() {
  console.log('=== Starting Phase 1 Verification Suite ===\n');

  // 1. Test Ingestion Performance
  const initialMem = process.memoryUsage().heapUsed;
  console.log(`Initial memory footprint: ${toMB(initialMem)}`);

  const startTime = Date.now();
  console.log('Loading dataset from zomato.csv...');
  const data = await loadDataset();
  const endTime = Date.now();

  const finalMem = process.memoryUsage().heapUsed;
  const memDiff = finalMem - initialMem;

  console.log(`Loaded ${data.length} records in ${(endTime - startTime) / 1000} seconds.`);
  console.log(`Post-load heap size: ${toMB(finalMem)}`);
  console.log(`Ingestion memory increase: ${toMB(memDiff)}`);

  assert(data.length > 0, 'Dataset should not be empty');
  assert(memDiff < 100 * 1024 * 1024, 'Ingestion memory footprint should be well under 100 MB');

  // 2. Cache Verification
  const cacheStart = Date.now();
  const cachedData = await loadDataset();
  const cacheEnd = Date.now();
  assert(cachedData.length === data.length, 'Cached data matches loaded data');
  assert(cacheEnd - cacheStart < 5, 'Subsequent loads resolve instantly from cache');

  // 3. Schema & Synthesized Fields Verification
  const sample = data.find(r => r.online_order === 'Yes');
  if (sample) {
    console.log('\nVerifying synthesized attributes for online order restaurant:', sample.name);
    assert(typeof sample.id === 'string', `id should be string (got ${typeof sample.id})`);
    assert(typeof sample.rating === 'number' && sample.rating >= 0 && sample.rating <= 5, `rating should be float: ${sample.rating}`);
    assert(typeof sample.approx_cost === 'number', `approx_cost should be number: ${sample.approx_cost}`);
    assert(typeof sample.delivery_time === 'number' && sample.delivery_time >= 15 && sample.delivery_time <= 45, `delivery_time should be 15-45: ${sample.delivery_time}`);
    assert(Array.isArray(sample.offers), 'offers should be an array');
    assert(Array.isArray(sample.characteristics), 'characteristics should be an array');
    assert(sample.characteristics.includes('Delivery Available'), 'should include "Delivery Available" in characteristics');
  }

  const offlineSample = data.find(r => r.online_order === 'No');
  if (offlineSample) {
    console.log('\nVerifying offline restaurant:', offlineSample.name);
    assert(offlineSample.delivery_time === null, 'offline restaurant delivery_time should be null');
    assert(offlineSample.offers.length === 0, 'offline restaurant offers should be empty');
  }

  // 4. Filtering Tests
  console.log('\n--- Running Filter Tests ---');

  // Test Case 1: Substring Location Filter (Banashankari is in the raw dataset)
  console.log('\nQuerying: Location "Banashankari"');
  const resLoc = await getRecommendations({ location: 'Banashankari' });
  console.log(`Found ${resLoc.restaurants.length} recommendations (Total matches: ${resLoc.totalMatchesBeforeLimit})`);
  assert(resLoc.restaurants.length > 0, 'Should find restaurants in Banashankari');
  assert(resLoc.restaurants.length <= 15, 'Should limit recommendations to maximum of 15');
  assert(resLoc.restaurants.every(r => r.location.toLowerCase().includes('banashankari')), 'All results must match location');

  // Verify Sorting order (rating descending, then votes descending)
  let isSorted = true;
  for (let i = 0; i < resLoc.restaurants.length - 1; i++) {
    const r1 = resLoc.restaurants[i];
    const r2 = resLoc.restaurants[i + 1];
    if (r1.rating < r2.rating || (r1.rating === r2.rating && r1.votes < r2.votes)) {
      isSorted = false;
      break;
    }
  }
  assert(isSorted, 'Recommendations must be sorted by rating and review count descending');

  // Test Case 2: Budget Filters
  console.log('\nQuerying: Budget "Low" (< 400)');
  const resLow = await getRecommendations({ location: 'Banashankari', budget: 'Low' });
  assert(resLow.restaurants.every(r => r.approx_cost < 400), 'Low budget check');

  console.log('Querying: Budget "Medium" (400-1000)');
  const resMed = await getRecommendations({ location: 'Banashankari', budget: 'Medium' });
  assert(resMed.restaurants.every(r => r.approx_cost >= 400 && r.approx_cost <= 1000), 'Medium budget check');

  // Test Case 3: Cuisine Filters
  console.log('\nQuerying: Cuisine "Italian"');
  const resCuisine = await getRecommendations({ location: 'Banashankari', cuisine: 'Italian' });
  assert(resCuisine.restaurants.every(r => r.cuisines.some(c => c.toLowerCase().includes('italian'))), 'Cuisine match check');

  // Test Case 4: Complex filter
  console.log('\nQuerying: Location: "Banashankari", Cuisine: "Cafe", Min Rating: 4.0, Delivery Time under 35 mins');
  const resComplex = await getRecommendations({
    location: 'Banashankari',
    cuisine: 'Cafe',
    minRating: 4.0,
    maxDeliveryTime: 35
  });
  console.log(`Found ${resComplex.restaurants.length} matches. Relaxed filters:`, resComplex.relaxedFilters);
  if (resComplex.restaurants.length > 0) {
    resComplex.restaurants.forEach(r => {
      if (!resComplex.relaxedFilters || !resComplex.relaxedFilters.includes('rating')) {
        assert(r.rating >= 4.0, 'Rating >= 4.0');
      } else {
        console.log(`  [PASS] Rating checked (rating filter relaxed, value: ${r.rating})`);
      }
      assert(r.delivery_time !== null && r.delivery_time <= 35, 'Delivery time <= 35');
      assert(r.cuisines.some(c => c.toLowerCase().includes('cafe')), 'Cuisine includes Cafe');
    });
  }

  // Test Case 5: Constraint Relaxation
  console.log('\nQuerying: Location: "Banashankari", Rating: 5.0 (Strict), Cuisine: "Ethiopian" (Non-existent)');
  const resRelaxed = await getRecommendations({
    location: 'Banashankari',
    minRating: 5.0,
    cuisine: 'Ethiopian'
  });
  console.log(`Relaxation Results: Found ${resRelaxed.restaurants.length} restaurants.`);
  console.log('Relaxed filters applied:', resRelaxed.relaxedFilters);
  assert(resRelaxed.restaurants.length >= 3, 'Relaxation should return at least 3 fallback results');
  assert(resRelaxed.relaxedFilters !== null, 'Should have flagged relaxed filters');
  assert(resRelaxed.relaxedFilters.includes('cuisine') || resRelaxed.relaxedFilters.includes('rating'), 'Cuisine/Rating should be relaxed');

  console.log('\n=== All Phase 1 Tests Completed Successfully! ===\n');
}

runTests().catch(err => {
  console.error('Test suite failed with error:', err);
  process.exit(1);
});
