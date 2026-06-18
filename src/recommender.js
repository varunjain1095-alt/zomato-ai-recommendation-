const { loadDataset } = require('./dataLoader');
const { Anthropic } = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');

// Load environment configuration
dotenv.config();

// Initialize Anthropic client (only if key exists; fallback handled gracefully if missing)
let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
}

/**
 * Checks if a restaurant matches specific preference filters.
 * @param {Object} restaurant - The restaurant record.
 * @param {Object} prefs - The user's preferences.
 * @param {Object} activeFilters - Configuration indicating which filters are currently active/applied.
 */
function isMatch(restaurant, prefs, activeFilters = {}) {
  // 1. Location filter (Substring match, case-insensitive)
  if (prefs.location) {
    const pLoc = prefs.location.toLowerCase().trim();
    if (pLoc !== 'bangalore') {
      const rLoc = restaurant.location.toLowerCase();
      if (!rLoc.includes(pLoc) && !pLoc.includes(rLoc)) {
        return false;
      }
    }
  }

  // 2. Rating filter (threshold check)
  if (activeFilters.rating && prefs.minRating !== undefined && prefs.minRating !== null) {
    if (restaurant.rating < prefs.minRating) {
      return false;
    }
  }

  // 3. Budget filter (Low < 400, Medium 400-1000, High > 1000)
  if (activeFilters.budget && prefs.budget) {
    const cost = restaurant.approx_cost;
    const b = prefs.budget.toLowerCase();
    if (b === 'low' && cost >= 400) {
      return false;
    } else if (b === 'medium' && (cost < 400 || cost > 1000)) {
      return false;
    } else if (b === 'high' && cost <= 1000) {
      return false;
    }
  }

  // 4. Cuisine filter (case-insensitive substring match in array elements)
  if (activeFilters.cuisine && prefs.cuisine) {
    const pCuisine = prefs.cuisine.toLowerCase();
    const hasCuisine = restaurant.cuisines.some(c => c.toLowerCase().includes(pCuisine));
    if (!hasCuisine) {
      return false;
    }
  }

  // 5. Max delivery time filter
  if (prefs.maxDeliveryTime !== undefined && prefs.maxDeliveryTime !== null) {
    if (restaurant.delivery_time === null || restaurant.delivery_time > prefs.maxDeliveryTime) {
      return false;
    }
  }

  // 6. Has offers filter
  if (prefs.hasOffers) {
    if (restaurant.online_order !== 'Yes' || restaurant.offers.length === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Sorts candidates in descending order of rating and total votes.
 */
function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (b.rating !== a.rating) {
      return b.rating - a.rating;
    }
    return b.votes - a.votes;
  });
}

/**
 * Wraps a promise in a timeout limit.
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('API Timeout')), ms))
  ]);
}

/**
 * Filters the dataset based on user preferences and handles constraint relaxation if needed.
 * Then passes results to Claude for AI re-ranking & explanation generation.
 */
async function getRecommendations(prefs) {
  const allRestaurants = await loadDataset();

  // Step 1: Tier 1 Filtering (Sequential Relaxation)
  const relaxationSteps = [
    { rating: true,  budget: true,  cuisine: true  },
    { rating: false, budget: true,  cuisine: true  },
    { rating: false, budget: false, cuisine: true  },
    { rating: false, budget: false, cuisine: false }
  ];

  let finalCandidates = [];
  let relaxedFilters = [];
  let stepApplied = 0;

  for (let i = 0; i < relaxationSteps.length; i++) {
    const filtersConfig = relaxationSteps[i];
    const matches = allRestaurants.filter(res => isMatch(res, prefs, filtersConfig));

    if (matches.length >= 3 || i === relaxationSteps.length - 1) {
      finalCandidates = matches;
      stepApplied = i;
      break;
    }
  }

  if (stepApplied >= 1) relaxedFilters.push('rating');
  if (stepApplied >= 2) relaxedFilters.push('budget');
  if (stepApplied >= 3) relaxedFilters.push('cuisine');

  if (finalCandidates.length < 3) {
    const noLocationPrefs = { ...prefs, location: null };
    for (let i = 0; i < relaxationSteps.length; i++) {
      const filtersConfig = relaxationSteps[i];
      const matches = allRestaurants.filter(res => isMatch(res, noLocationPrefs, filtersConfig));
      if (matches.length >= 3 || i === relaxationSteps.length - 1) {
        finalCandidates = matches;
        if (!relaxedFilters.includes('location')) {
          relaxedFilters.push('location');
        }
        break;
      }
    }
  }

  // Sort candidates by rating/votes and slice to top 5 (optimizes LLM output latency)
  const sorted = sortCandidates(finalCandidates);
  const limitedCandidates = sorted.slice(0, 5);

  if (limitedCandidates.length === 0) {
    return {
      restaurants: [],
      relaxedFilters: relaxedFilters.length > 0 ? relaxedFilters : null,
      totalMatchesBeforeLimit: 0,
      suggestionMessage: 'We found 0 restaurants matching your exact preferences. Would you like to expand your filters for more options?'
    };
  }

  // Step 2: Try Tier 2 Claude LLM Re-Ranking & Explanation
  if (!anthropic) {
    console.warn('[recommender] Anthropic client not initialized (missing key). Bypassing AI ranking.');
    return getFallbackResult(limitedCandidates, relaxedFilters, sorted.length);
  }

  try {
    // Build Prompt Fields (Send only necessary fields to reduce tokens)
    const cleanCandidates = limitedCandidates.map(r => ({
      id: r.id,
      name: r.name,
      location: r.location,
      cuisines: r.cuisines,
      approx_cost: r.approx_cost,
      rating: r.rating,
      votes: r.votes,
      delivery_time: r.delivery_time,
      offers: r.offers,
      characteristics: r.characteristics
    }));

    const systemPrompt = `You are an Expert Local Food Guide for Bangalore. Your task is to qualitatively rank the provided list of candidate restaurants based on the user's preferences and generate a personalized, human-like explanation for why each is a fit.
You must return your output wrapped in <json_output> and </json_output> XML tags.

Strict Rules:
1. ONLY rank/recommend restaurants that exist in the provided candidate list. Do not invent any new restaurants.
2. The explanation must be unique, personal, and strictly UNDER 250 characters to allow for fuller descriptions.
3. Keep match percentages realistic (0-100) based on how well the restaurant's cuisines/characteristics align with user preferences.
4. Output must match this JSON schema exactly:
{
  "recommendations": [
    {
      "restaurant_id": "string",
      "name": "string",
      "rank": 1,
      "match_percentage": 95,
      "ai_explanation": "string under 250 characters",
      "highlighted_tags": ["string", "string"]
    }
  ]
}`;

    const softPrefs = Array.isArray(prefs.additionalPreferences)
      ? (prefs.additionalPreferences.length > 0 ? prefs.additionalPreferences.join(', ') : 'None')
      : (prefs.additionalPreferences || 'None');

    const userPrompt = `User Preferences:
- Location constraint: ${prefs.location || 'Anywhere'}
- Target Budget Bracket: ${prefs.budget || 'Any'}
- Cuisine: ${prefs.cuisine || 'Any'}
- Minimum Rating: ${prefs.minRating || 'Any'}
- Maximum Delivery Time: ${prefs.maxDeliveryTime ? prefs.maxDeliveryTime + ' mins' : 'Any'}
- Has Offers: ${prefs.hasOffers ? 'Yes' : 'No'}
- Soft/Dietary/Atmosphere Preferences: ${softPrefs}

Candidate Restaurants (JSON):
${JSON.stringify(cleanCandidates, null, 2)}`;

    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

    // Call API with a 15-second timeout
    const apiCall = anthropic.messages.create({
      model: model,
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const response = await withTimeout(apiCall, 15000);
    const responseText = response.content[0].text;

    // Parse XML Isolated Tags with robust fallback
    let payload = null;
    const match = responseText.match(/<json_output>([\s\S]*?)<\/json_output>/i);
    if (match) {
      try {
        payload = JSON.parse(match[1].trim());
      } catch (err) {
        console.warn('[recommender] Failed to parse JSON inside <json_output> tags:', err.message);
      }
    }

    if (!payload) {
      // Try to find the first '{' and the last '}'
      const startIndex = responseText.indexOf('{');
      const endIndex = responseText.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const jsonSub = responseText.substring(startIndex, endIndex + 1);
        try {
          payload = JSON.parse(jsonSub.trim());
        } catch (err) {
          console.warn('[recommender] Failed to parse JSON from curly braces substring:', err.message);
        }
      }
    }

    if (!payload) {
      console.error('[recommender] Failed to extract valid JSON. Raw response length:', responseText.length, 'Content preview:', responseText.slice(0, 500));
      throw new Error('Malformed LLM output: Could not extract valid JSON from response');
    }

    if (!payload.recommendations || !Array.isArray(payload.recommendations)) {
      throw new Error('Missing recommendations array in LLM payload');
    }

    // Merge ranked recommendations back to original database records
    const candidatesMap = new Map(limitedCandidates.map(r => [r.id, r]));
    const mergedList = [];

    payload.recommendations.forEach(rec => {
      const orig = candidatesMap.get(rec.restaurant_id);
      if (orig) {
        mergedList.push({
          ...orig,
          match_percentage: rec.match_percentage || 70,
          ai_explanation: rec.ai_explanation ? rec.ai_explanation.slice(0, 250) : '',
          highlighted_tags: Array.isArray(rec.highlighted_tags) ? rec.highlighted_tags : []
        });
        candidatesMap.delete(rec.restaurant_id);
      }
    });

    const suggestionMessage = mergedList.length < 5
      ? `We found ${mergedList.length} restaurants matching your exact preferences. Would you like to expand your filters for more options?`
      : null;

    return {
      restaurants: mergedList,
      relaxedFilters: relaxedFilters.length > 0 ? relaxedFilters : null,
      totalMatchesBeforeLimit: sorted.length,
      suggestionMessage
    };

  } catch (error) {
    console.error('[recommender] AI Ranking failed, triggering fallback:', error.message);
    return getFallbackResult(limitedCandidates, relaxedFilters, sorted.length);
  }
}

/**
 * Creates the static Tier 1 fallback recommendations response when Claude is offline/erroring.
 */
function getFallbackResult(candidates, relaxedFilters, totalMatches) {
  const mapped = candidates.map(r => ({
    ...r,
    match_percentage: 70,
    ai_explanation: 'Recommended based on location and rating filters.',
    highlighted_tags: []
  }));

  const suggestionMessage = mapped.length < 5
    ? `We found ${mapped.length} restaurants matching your exact preferences. Would you like to expand your filters for more options?`
    : null;

  return {
    restaurants: mapped,
    relaxedFilters: relaxedFilters.length > 0 ? relaxedFilters : null,
    totalMatchesBeforeLimit: totalMatches,
    ai_ranking_offline: true,
    suggestionMessage
  };
}

module.exports = {
  getRecommendations,
  isMatch
};
