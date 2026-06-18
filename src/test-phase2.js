const { getRecommendations } = require('./recommender');
const dotenv = require('dotenv');

dotenv.config();

function assert(condition, message) {
  if (!condition) {
    console.error(`  [FAIL] Assertion failed: ${message}`);
    process.exit(1);
  }
  console.log(`  [PASS] ${message}`);
}

async function runTests() {
  console.log('=== Starting Phase 2 Verification Suite ===\n');

  // Verify that ANTHROPIC_API_KEY is present in the environment
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  if (!originalApiKey) {
    console.error('[FAIL] ANTHROPIC_API_KEY is missing from environment. Create .env file first.');
    process.exit(1);
  }

  // Test Case 1: Successful End-to-End LLM Re-Ranking & Explanation
  console.log('--- Test Case 1: Active Claude Re-Ranking ---');
  const prefs = {
    location: 'Bangalore',
    budget: 'Medium',
    cuisine: 'North Indian',
    minRating: 4.0,
    additionalPreferences: 'cozy atmosphere, family-friendly seating, good for large groups'
  };

  console.log('Querying recommendations (expecting Claude responses)...');
  const start = Date.now();
  const res = await getRecommendations(prefs);
  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`Query completed in ${duration} seconds.`);

  assert(res.restaurants.length > 0, 'Should return recommendations');
  assert(!res.ai_ranking_offline, 'AI ranking should be online (ai_ranking_offline should not be true)');
  assert(res.hasOwnProperty('suggestionMessage'), 'suggestionMessage field should exist in response');
  if (res.restaurants.length < 5) {
    assert(res.suggestionMessage === `We found ${res.restaurants.length} restaurants matching your exact preferences. Would you like to expand your filters for more options?`, `suggestionMessage should report fewer results correctly: ${res.suggestionMessage}`);
  } else {
    assert(res.suggestionMessage === null, 'suggestionMessage should be null when all 5 are returned');
  }
  
  // Verify Claude attributes
  const sample = res.restaurants[0];
  console.log('\nChecking Claude output attributes for top restaurant:', sample.name);
  assert(sample.match_percentage !== undefined && sample.match_percentage >= 0 && sample.match_percentage <= 100, `match_percentage should be 0-100: ${sample.match_percentage}`);
  assert(typeof sample.ai_explanation === 'string' && sample.ai_explanation.length > 0, 'ai_explanation should be populated string');
  assert(sample.ai_explanation.length <= 250, `ai_explanation should be under 250 chars (length: ${sample.ai_explanation.length})`);
  assert(Array.isArray(sample.highlighted_tags) && sample.highlighted_tags.length > 0, `highlighted_tags should be non-empty array: ${JSON.stringify(sample.highlighted_tags)}`);

  console.log('\nAll recommendations returned by Claude:');
  res.restaurants.slice(0, 5).forEach((r, idx) => {
    console.log(`  ${idx + 1}. ${r.name} (${r.location}) | Rating: ${r.rating} | Match: ${r.match_percentage}%`);
    console.log(`     Explanation: "${r.ai_explanation}"`);
    console.log(`     Tags: ${JSON.stringify(r.highlighted_tags)}`);
  });

  // Test Case 2: Outage & Error Fallback Logic
  console.log('\n--- Test Case 2: Outage & API Error Fallback ---');
  console.log('Simulating API key failure (injecting invalid key)...');
  
  // To trigger API failure, we can corrupt the ANTHROPIC_API_KEY environment variable.
  // Note: recommender.js initializes the client at load-time, so we need to reload the module or corrupt the client object.
  // A clean way is to delete the cached recommender module, change the key in process.env, and re-require it.
  delete require.cache[require.resolve('./recommender')];
  process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-corruptedInvalidKeyPlaceholderTextForTestingAPIOutage';
  
  const recommenderFallback = require('./recommender');
  
  const startFallback = Date.now();
  const resFallback = await recommenderFallback.getRecommendations(prefs);
  const durationFallback = ((Date.now() - startFallback) / 1000).toFixed(2);
  console.log(`Fallback query completed in ${durationFallback} seconds.`);

  assert(resFallback.restaurants.length > 0, 'Should return fallback recommendations');
  assert(resFallback.ai_ranking_offline === true, 'ai_ranking_offline should be true');
  assert(resFallback.hasOwnProperty('suggestionMessage'), 'suggestionMessage field should exist in fallback');
  if (resFallback.restaurants.length < 5) {
    assert(resFallback.suggestionMessage === `We found ${resFallback.restaurants.length} restaurants matching your exact preferences. Would you like to expand your filters for more options?`, 'fallback suggestionMessage should report fewer results correctly');
  } else {
    assert(resFallback.suggestionMessage === null, 'fallback suggestionMessage should be null when all 5 are returned');
  }
  
  const fallbackSample = resFallback.restaurants[0];
  assert(fallbackSample.match_percentage === 70, `fallback match_percentage should be default 70 (got ${fallbackSample.match_percentage})`);
  assert(fallbackSample.ai_explanation === 'Recommended based on location and rating filters.', 'should use default explanation');
  assert(Array.isArray(fallbackSample.highlighted_tags) && fallbackSample.highlighted_tags.length === 0, 'fallback highlighted_tags should be empty');

  // Restore environment variables
  process.env.ANTHROPIC_API_KEY = originalApiKey;
  delete require.cache[require.resolve('./recommender')];

  console.log('\n=== All Phase 2 Tests Completed Successfully! ===\n');
}

runTests().catch(err => {
  console.error('Test suite failed with error:', err);
  process.exit(1);
});
