// Popular Locations from Database for Autocomplete
const POPULAR_LOCATIONS = [
  "Whitefield",
  "BTM",
  "Electronic City",
  "HSR",
  "Marathahalli",
  "Indiranagar",
  "JP Nagar",
  "Bannerghatta Road",
  "Jayanagar",
  "Bellandur",
  "Sarjapur Road",
  "New BEL Road",
  "Banashankari",
  "Koramangala 5th Block",
  "Kalyan Nagar"
];

// App State Cache
let recommendationsCache = [];
let currentDisplayLimit = 3; // Default selection from wireframe: Top 3

document.addEventListener('DOMContentLoaded', () => {
  // Elements Retrieval
  const sliderMin = document.getElementById('slider-min');
  const sliderMax = document.getElementById('slider-max');
  const sliderTrack = document.getElementById('slider-track');
  const minCostVal = document.getElementById('min-cost-val');
  const maxCostVal = document.getElementById('max-cost-val');
  const budgetTierDisplay = document.getElementById('budget-tier-display');
  
  const locationInput = document.getElementById('location-input');
  const autocompleteList = document.getElementById('autocomplete-list');
  
  const cuisineSelect = document.getElementById('cuisine-select');
  const ratingSelect = document.getElementById('rating-select');
  const deliverySelect = document.getElementById('delivery-select');
  const offersCheckbox = document.getElementById('offers-checkbox');
  const additionalPrefs = document.getElementById('additional-prefs');
  const charCount = document.getElementById('char-count');
  
  const btnTop3 = document.getElementById('btn-top-3');
  const btnTop5 = document.getElementById('btn-top-5');
  const btnGenerate = document.getElementById('btn-generate');
  
  const statusBanner = document.getElementById('status-banner');
  const suggestionBanner = document.getElementById('suggestion-banner');
  const suggestionText = document.getElementById('suggestion-text');
  
  const loaderContainer = document.getElementById('loader-container');
  const loaderStatusText = document.getElementById('loader-status-text');
  const recommendationsGrid = document.getElementById('recommendations-grid');

  // =========================================================================
  // 1. Dual Range Slider Logic
  // =========================================================================
  const priceGap = 100; // minimum difference between handles

  function updateSlider() {
    let minVal = parseInt(sliderMin.value);
    let maxVal = parseInt(sliderMax.value);

    // Prevent overlap
    if (maxVal - minVal < priceGap) {
      if (this === sliderMin) {
        sliderMin.value = maxVal - priceGap;
        minVal = maxVal - priceGap;
      } else {
        sliderMax.value = minVal + priceGap;
        maxVal = minVal + priceGap;
      }
    }

    // Update value labels
    minCostVal.textContent = `₹${minVal}`;
    maxCostVal.textContent = `₹${maxVal}`;

    // Highlight the active track segment in Zomato red
    const minPercent = ((minVal - sliderMin.min) / (sliderMin.max - sliderMin.min)) * 100;
    const maxPercent = ((maxVal - sliderMin.min) / (sliderMin.max - sliderMin.min)) * 100;
    sliderTrack.style.left = minPercent + '%';
    sliderTrack.style.right = (100 - maxPercent) + '%';

    // Map the current selection to Low/Medium/High budget categories
    // Low: cost < 400
    // Medium: cost 400 - 1000
    // High: cost > 1000
    // We base the active category on the midpoint of the selected range
    const midpoint = (minVal + maxVal) / 2;
    let category = "Medium";
    let subText = "₹400-₹1000";

    if (midpoint < 400) {
      category = "Low";
      subText = "Under ₹400";
    } else if (midpoint > 1000) {
      category = "High";
      subText = "Above ₹1000";
    }

    budgetTierDisplay.textContent = `${category} (${subText})`;
    budgetTierDisplay.dataset.category = category;
  }

  // Initialize and attach events
  sliderMin.addEventListener('input', updateSlider);
  sliderMax.addEventListener('input', updateSlider);
  updateSlider();

  // =========================================================================
  // 2. Autocomplete Suggestions for Locations
  // =========================================================================
  locationInput.addEventListener('input', () => {
    const query = locationInput.value.trim().toLowerCase();
    autocompleteList.innerHTML = '';
    
    if (!query) {
      autocompleteList.style.display = 'none';
      return;
    }

    const matches = POPULAR_LOCATIONS.filter(loc => 
      loc.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
      autocompleteList.style.display = 'none';
      return;
    }

    matches.forEach(match => {
      const item = document.createElement('div');
      item.classList.add('autocomplete-suggestion');
      item.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span>${match}</span>
      `;
      item.addEventListener('click', () => {
        locationInput.value = match;
        autocompleteList.style.display = 'none';
      });
      autocompleteList.appendChild(item);
    });

    autocompleteList.style.display = 'block';
  });

  // Close autocomplete on click outside
  document.addEventListener('click', (e) => {
    if (e.target !== locationInput && e.target !== autocompleteList) {
      autocompleteList.style.display = 'none';
    }
  });

  // =========================================================================
  // 3. Textarea Characters Tracker
  // =========================================================================
  additionalPrefs.addEventListener('input', () => {
    const len = additionalPrefs.value.length;
    charCount.textContent = `${len} / 100`;
  });

  // =========================================================================
  // 4. Recommendation Count Pill Controls (Top 3 vs Top 5)
  // =========================================================================
  btnTop3.addEventListener('click', () => {
    btnTop3.classList.add('active');
    btnTop5.classList.remove('active');
    currentDisplayLimit = 3;
    if (recommendationsCache.length > 0) {
      renderRecommendations();
    }
  });

  btnTop5.addEventListener('click', () => {
    btnTop5.classList.add('active');
    btnTop3.classList.remove('active');
    currentDisplayLimit = 5;
    if (recommendationsCache.length > 0) {
      renderRecommendations();
    }
  });

  // =========================================================================
  // 5. Submit Search & Retrieve Recommendations
  // =========================================================================
  btnGenerate.addEventListener('click', async () => {
    const locationValue = locationInput.value.trim();
    const cuisineValue = cuisineSelect.value;
    const ratingValue = ratingSelect.value;
    const deliveryValue = deliverySelect.value;
    const hasOffersValue = offersCheckbox.checked;
    const budgetCategory = budgetTierDisplay.dataset.category;
    const additionalPrefsValue = additionalPrefs.value.trim();

    // Prepare endpoint query parameters
    const params = new URLSearchParams();
    if (locationValue) params.append('location', locationValue);
    if (budgetCategory) params.append('budget', budgetCategory);
    if (cuisineValue) params.append('cuisine', cuisineValue);
    if (ratingValue) params.append('minRating', ratingValue);
    if (deliveryValue) params.append('maxDeliveryTime', deliveryValue);
    if (hasOffersValue) params.append('hasOffers', 'true');
    if (additionalPrefsValue) params.append('additionalPreferences', additionalPrefsValue);

    // Reset view states
    recommendationsGrid.innerHTML = '';
    statusBanner.classList.add('hidden');
    suggestionBanner.classList.add('hidden');
    loaderContainer.classList.remove('hidden');
    btnGenerate.disabled = true;

    // Loading Simulation Text Cycle
    const loadingTexts = [
      "Consulting the AI Chef...",
      "Scanning local neighborhood menus...",
      "Arranging candidate matches by ratings...",
      "Composing personalized recommendations..."
    ];
    let textIndex = 0;
    loaderStatusText.textContent = loadingTexts[0];
    
    const textInterval = setInterval(() => {
      textIndex = (textIndex + 1) % loadingTexts.length;
      loaderStatusText.textContent = loadingTexts[textIndex];
    }, 1500);

    try {
      const response = await fetch(`/api/recommendations?${params.toString()}`);
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Slow down! You've requested too many recommendations in a short time. Please wait a minute and try again.");
        }
        throw new Error(`Server returned HTTP status ${response.status}`);
      }
      
      const data = await response.json();
      
      clearInterval(textInterval);
      loaderContainer.classList.add('hidden');
      btnGenerate.disabled = false;

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch recommendations');
      }

      // Check if AI ranking went offline (fallback triggers)
      if (data.ai_ranking_offline) {
        statusBanner.classList.remove('hidden');
      }

      // Display suggestions for relaxed filters if returned
      if (data.suggestionMessage) {
        suggestionText.textContent = data.suggestionMessage;
        suggestionBanner.classList.remove('hidden');
      }

      recommendationsCache = data.restaurants || [];
      renderRecommendations();

    } catch (err) {
      clearInterval(textInterval);
      loaderContainer.classList.add('hidden');
      btnGenerate.disabled = false;
      
      console.error(err);
      recommendationsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title" style="color: var(--primary-color);">Oops! Search Failed</div>
          <p>${err.message || 'An unexpected error occurred. Please make sure the backend server is running and try again.'}</p>
        </div>
      `;
    }
  });

  // =========================================================================
  // 6. Dynamic Card Generation & Layout Rendering
  // =========================================================================
  function renderRecommendations() {
    recommendationsGrid.innerHTML = '';

    if (recommendationsCache.length === 0) {
      recommendationsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">No Restaurants Found</div>
          <p>We couldn't find any restaurants matching your preferences. Try relaxing some filters (e.g. location or cuisine) and search again!</p>
        </div>
      `;
      return;
    }

    // Slice cached items based on top pill selection
    const displayList = recommendationsCache.slice(0, currentDisplayLimit);

    displayList.forEach(r => {
      const card = document.createElement('div');
      card.classList.add('restaurant-card');

      // Determine match color tag (high matches green, fallback/offline gray or orange)
      let matchColor = '#24963F'; // high match green
      if (r.match_percentage < 75) matchColor = '#E28D37'; // orange
      if (r.match_percentage < 60) matchColor = '#E23744'; // Zomato red

      // Cuisines list markup
      const cuisinesHtml = r.cuisines
        .map(c => `<span class="cuisine-pill">${escapeHTML(c)}</span>`)
        .join('');

      // Active offers/discount tag
      const offerHtml = r.offers && r.offers.length > 0 
        ? `<span class="offer-tag">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
               <line x1="7" y1="7" x2="7.01" y2="7"></line>
             </svg>
             ${escapeHTML(r.offers[0])}
           </span>`
        : '';

      // Characteristics highlights
      const characteristicsHtml = r.characteristics
        .map(char => {
          // Highlight tag if it matches the Claude highlight tags
          const isHighlighted = r.highlighted_tags && r.highlighted_tags.some(tag => 
            tag.toLowerCase().includes(char.toLowerCase()) || 
            char.toLowerCase().includes(tag.toLowerCase())
          );
          return `<span class="characteristic-tag ${isHighlighted ? 'highlighted' : ''}">${escapeHTML(char)}</span>`;
        })
        .join('');

      // Build out card components
      card.innerHTML = `
        <div class="card-header-row">
          <div class="card-title-group">
            <div class="card-title-row">
              <h3 class="restaurant-name">${escapeHTML(r.name)}</h3>
            </div>
            <p class="restaurant-address">${escapeHTML(r.location)}</p>
          </div>
          ${offerHtml}
        </div>

        <div class="card-meta-row">
          <span class="rating-badge">
            ${r.rating.toFixed(1)} <span class="rating-star">★</span>
          </span>
          <span class="votes-count">(${r.votes} votes)</span>
          <span class="meta-dot"></span>
          <span class="meta-item">₹${r.approx_cost} for two</span>
          ${r.delivery_time ? `
            <span class="meta-dot"></span>
            <span class="meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${r.delivery_time} mins
            </span>
          ` : ''}
        </div>

        <div class="tag-list">
          ${cuisinesHtml}
        </div>

        <div class="ai-explanation-box">
          <div class="ai-explanation-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
            Why you'll love it:
          </div>
          <p class="ai-explanation-text">"${escapeHTML(r.ai_explanation)}"</p>
        </div>

        <div class="characteristics-row">
          ${characteristicsHtml}
        </div>
      `;

      recommendationsGrid.appendChild(card);
    });
  }

  // Helper utility to escape HTML inputs
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
