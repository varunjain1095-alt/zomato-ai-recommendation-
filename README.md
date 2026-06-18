# CuisineAI: AI-Powered Restaurant Recommendation System

## The Problem

Food delivery platforms offer thousands of options making it difficult to decide. Zomato has filters but they fail because the user is still being presented with hundreds of options. The user does not get an opportunity to define a set of preferences that best represent what they want, leading to decision fatigue and poor choices.

## The Solution

CuisineAI takes detailed user preferences and uses Claude (Anthropic) to return a small, personalised, and explainable set of restaurant recommendations. Instead of scrolling through hundreds of options, users get 3 to 5 curated recommendations with AI-generated reasoning for each pick.

## How It Works

**Data Layer**
The system loads a real-world Zomato restaurant dataset (51,717 records) sourced from Hugging Face. The dataset is stored in a local SQLite database for fast querying without loading large files into memory on every request.

**Tier 1 Filtering**
When a user submits preferences, the backend applies hard filters: location, budget range, cuisine type, minimum rating, delivery time, and discount availability. This narrows the dataset down to a maximum of 15 candidate restaurants. If too few results are found, the system applies sequential constraint relaxation, dropping filters one by one (rating, budget, cuisine) to ensure results are always returned.

**Tier 2 AI Re-Ranking**
The filtered candidates are passed to Claude via the Anthropic API along with the user's preferences. Claude ranks the restaurants, assigns match percentages, and generates a personalised explanation for each recommendation explaining exactly why it fits the user's criteria.

**Output**
Results are displayed as clean restaurant cards showing the name, location, rating, cost for two, delivery time, active offers, cuisine tags, and the AI-generated explanation.

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js, Express
- **Database:** SQLite
- **AI:** Claude by Anthropic (claude-sonnet-4-6)
- **Dataset:** ManikaSaini/zomato-restaurant-recommendation via Hugging Face

## User Inputs

- Location (Bangalore neighbourhood or city-wide search)
- Budget Range (₹100 to ₹2000 via dual-handle slider)
- Cuisine Type
- Minimum Rating
- Delivery Time Preference
- Discounts and Promotions
- Additional Preferences (free text, e.g. rooftop ambiance, vegan options)

## Running Locally

**Prerequisites**
- Node.js installed
- Anthropic API key
- Zomato dataset CSV downloaded from Hugging Face

**Setup**

1. Clone the repository
2. Add your Anthropic API key to a `.env` file in the project root:
```
ANTHROPIC_API_KEY=your_key_here
PORT=3000
```
3. Place the `zomato.csv` file in the project root
4. Install dependencies:
```
npm install
```
5. Start the server:
```
node src/server.js
```
6. Open your browser and go to `http://localhost:3000`

## Project Structure

```
Zomato AI/
├── docs/
│   ├── problemStatement.txt
│   ├── context.md
│   ├── architecture.md
│   ├── implementation-plan.md
│   └── edge-case.md
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── server.js
│   ├── dataLoader.js
│   └── recommender.js
├── .env
├── .gitignore
└── package.json
```

## Key Design Decisions

**SQLite over raw CSV:** The original 574MB CSV file caused slow server restarts. Migrating to SQLite reduced load times from 17 seconds to near-instant queries.

**Two-tier recommendation pattern:** Hard filtering is done locally before calling the Claude API. This keeps token usage low and costs minimal, even at scale.

**No fallback padding:** If Claude returns fewer results than requested, the system shows only the verified matches and displays a message asking if the user wants to expand their filters. No irrelevant results are ever shown.

**City-wide wildcard:** Since the dataset covers Bangalore neighbourhoods rather than cities, searching for "Bangalore" triggers a city-wide search across all neighbourhoods instead of returning zero results.

**Rate limiting:** The API is rate-limited to 10 requests per minute per IP address to prevent runaway costs.
