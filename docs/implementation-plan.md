# Zomato AI Recommendation System Implementation Plan

This implementation plan outlines the step-by-step phased construction of the Zomato AI Restaurant Recommendation System, leveraging local dataset filtering and the Anthropic Claude API for qualitative ranking and personalized explanations.

## User Review Required

> [!IMPORTANT]
> **Anthropic Claude API Key:** Before executing Phase 2, a valid Anthropic API key (`ANTHROPIC_API_KEY`) must be set in the environment.
>
> **Technology Stack Confirmation:** The plan proposes a Node.js/Express backend and a Vanilla HTML/CSS/JS frontend to keep the application lightweight, responsive, and easy to run without large compiler overhead. Please confirm if this backend stack matches your preferences.

## Proposed Changes

We will introduce the following components, ordered by development dependencies.

### Backend Orchestration & Data Tier

#### [NEW] [package.json](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/package.json)
- Define node dependencies, including `express`, `@anthropic-ai/sdk`, `dotenv`, `cors`, and `csv-parser` or `sqlite3` for dataset querying.

#### [NEW] [.env](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/.env)
- Environment configuration containing `PORT` and `ANTHROPIC_API_KEY`.

#### [NEW] [server.js](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/server.js)
- Server bootstrap file initializing the Express app, loading the dataset cache, and exposing API routes.

#### [NEW] [src/dataLoader.js](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/src/dataLoader.js)
- Utility to parse the local [zomato.csv](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/zomato.csv) dataset, sanitize columns, and store them in-memory or in a local lightweight cache.

#### [NEW] [src/recommender.js](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/src/recommender.js)
- Implementation of the Tier 1 hard filtering algorithm (restricts dataset by location, cuisine matching, budget boundary, and rating) and formatting of Claude prompts. Integrates the Anthropic SDK client.

---

### Client Presentation Tier

#### [NEW] [public/index.html](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/public/index.html)
- Semantic HTML structure containing preference selection forms, search action, loader overlay, and result card layout grids.

#### [NEW] [public/style.css](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/public/style.css)
- Premium dark mode theme using HSL customized colors, glassmorphism, responsive grid layout, and micro-animations for card hovers and form controls.

#### [NEW] [public/app.js](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/public/app.js)
- Event listeners for inputs, AJAX preferences post request, loading state indicators, and dynamic card rendering with slide-in animation.

---

## Phased Roadmap

### Phase 1: Project Scaffolding & Local Ingestion (Hard Filtering)
1. Initialize project structure and install Node.js dependencies (`express`, `cors`, `dotenv`).
2. Implement [dataLoader.js](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/src/dataLoader.js) to parse the local [zomato.csv](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/zomato.csv) dataset.
3. Write local filtering tests in [recommender.js](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/src/recommender.js) to verify we can query top restaurants by location, price, and cuisine.

### Phase 2: Claude LLM Agent Integration
1. Initialize Anthropic SDK client using the API key.
2. Develop system and user prompt structures inside [recommender.js](file:///c:/Users/Varun%20Jain/OneDrive/Desktop/Product%20Management/Vibe%20coding%20projects/Zomato%20AI/src/recommender.js).
3. Implement JSON output structure enforcement, parsing the Claude response, and fallback algorithms if the LLM API is unavailable.

### Phase 3: Premium UI Presentation
1. Design the responsive input screen with high-end glassmorphism and slide controls.
2. Create dynamic search and skeleton loader templates.
3. Build responsive restaurant recommendation cards displaying ratings, cost, tags, and AI explanations.

### Phase 4: Integration & Validation
1. Bind the frontend form actions to the Express recommendation endpoint.
2. Validate end-to-end responsiveness, handling slow requests, rate limiting, and errors gracefully.

---

## Verification Plan

### Automated Tests
- Build basic backend mock test suite using `mocha` / `jest` or simple verification scripts to check:
  - Dataset parsing loads data successfully.
  - Filtering algorithm returns expected number of candidate records.
  - Claude prompt formatting generates correct JSON schemas.

### Manual Verification
1. Open the local application page in a browser.
2. Search using different preference combinations (e.g., Delhi, high budget, North Indian, 4.5+ rating).
3. Confirm that the loading state is shown and results load successfully.
4. Verify that each recommendation has a personalized, context-based AI explanation highlighting why the choice matches the search.
