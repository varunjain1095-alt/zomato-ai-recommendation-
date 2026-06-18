const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// In-memory cache for the dataset
let cachedRestaurants = null;
let loadPromise = null;

/**
 * Loads the dataset from the local SQLite database.
 * Resolves to the deserialized array of restaurant objects.
 */
function loadDataset(dbFilePath = path.join(__dirname, '..', 'zomato.db')) {
  if (cachedRestaurants) {
    return Promise.resolve(cachedRestaurants);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    if (!fs.existsSync(dbFilePath)) {
      return reject(new Error(`SQLite Database file not found at path: ${dbFilePath}. Please run migration first.`));
    }

    const db = new sqlite3.Database(dbFilePath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        return reject(err);
      }
    });

    db.all('SELECT * FROM restaurants', [], (err, rows) => {
      if (err) {
        db.close();
        return reject(err);
      }

      // Deserialize JSON arrays for cuisines, offers, and characteristics
      const restaurants = rows.map((row) => {
        let cuisines = ['Generic'];
        let offers = [];
        let characteristics = [];

        try {
          if (row.cuisines) cuisines = JSON.parse(row.cuisines);
        } catch (e) {
          console.warn(`[dataLoader] Failed to parse cuisines for ID ${row.id}:`, e.message);
        }

        try {
          if (row.offers) offers = JSON.parse(row.offers);
        } catch (e) {
          console.warn(`[dataLoader] Failed to parse offers for ID ${row.id}:`, e.message);
        }

        try {
          if (row.characteristics) characteristics = JSON.parse(row.characteristics);
        } catch (e) {
          console.warn(`[dataLoader] Failed to parse characteristics for ID ${row.id}:`, e.message);
        }

        return {
          id: row.id,
          name: row.name,
          address: row.address,
          location: row.location,
          cuisines,
          rating: row.rating,
          votes: row.votes,
          approx_cost: row.approx_cost,
          online_order: row.online_order,
          book_table: row.book_table,
          delivery_time: row.delivery_time,
          offers,
          characteristics
        };
      });

      db.close();
      cachedRestaurants = restaurants;
      resolve(restaurants);
    });
  });

  return loadPromise;
}

module.exports = {
  loadDataset
};
