const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const csvFilePath = path.join(__dirname, '..', 'zomato.csv');
const dbFilePath = path.join(__dirname, '..', 'zomato.db');

// Helper functions (same as in original dataLoader)
function getDeterministicHash(str) {
  if (!str) return 0;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function sanitizeRating(rateStr) {
  if (!rateStr) return 3.0;
  const cleaned = rateStr.trim().split('/')[0].trim();
  if (cleaned === 'NEW' || cleaned === '-' || cleaned === '') {
    return 3.0;
  }
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 3.0 : parsed;
}

function sanitizeCost(costStr) {
  if (!costStr) return 400;
  const cleaned = costStr.replace(/[^\d]/g, '').trim();
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 400 : parsed;
}

async function migrate() {
  console.log('=== Starting CSV to SQLite Migration ===');
  const startTime = Date.now();

  // 1. Delete existing database file if it exists to start fresh
  if (fs.existsSync(dbFilePath)) {
    console.log(`Removing existing database file at: ${dbFilePath}`);
    fs.unlinkSync(dbFilePath);
  }

  // 2. Open SQLite Database
  const db = new sqlite3.Database(dbFilePath);

  // 3. Create Table
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS restaurants (
          id TEXT PRIMARY KEY,
          name TEXT,
          address TEXT,
          location TEXT,
          cuisines TEXT,
          rating REAL,
          votes INTEGER,
          approx_cost INTEGER,
          online_order TEXT,
          book_table TEXT,
          delivery_time INTEGER,
          offers TEXT,
          characteristics TEXT
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
  console.log('Database table "restaurants" created successfully.');

  // 4. Ingest and insert data within a single transaction for optimal speed
  const seenIds = new Set();
  let totalRows = 0;
  let insertedRows = 0;

  console.log('Reading zomato.csv and inserting records into SQLite...');

  // Start Transaction
  db.run('BEGIN TRANSACTION');

  const insertStmt = db.prepare(`
    INSERT INTO restaurants (
      id, name, address, location, cuisines, rating, votes, approx_cost, 
      online_order, book_table, delivery_time, offers, characteristics
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        totalRows++;

        const name = row.name ? row.name.trim() : 'Unnamed Restaurant';
        const location = row.location ? row.location.trim() : '';
        const address = row.address ? row.address.trim() : '';
        const rawCuisines = row.cuisines ? row.cuisines : '';
        const url = row.url ? row.url.trim() : '';

        // Unique branch check (name + location)
        const seenKey = `${name.toLowerCase()}|${location.toLowerCase()}`;
        if (seenIds.has(seenKey)) {
          return;
        }
        seenIds.add(seenKey);

        // Parse and clean attributes
        const cuisines = rawCuisines
          ? rawCuisines.split(',').map(c => c.trim()).filter(Boolean)
          : ['Generic'];

        const rating = sanitizeRating(row.rate);
        const votes = row.votes ? parseInt(row.votes.trim(), 10) || 0 : 0;
        const approxCost = sanitizeCost(row['approx_cost(for two people)']);
        
        const onlineOrder = row.online_order === 'Yes' ? 'Yes' : 'No';
        const bookTable = row.book_table === 'Yes' ? 'Yes' : 'No';

        // Deterministic ID and synthesized fields
        const id = getDeterministicHash(url || (name + address)).toString(16);

        let deliveryTime = null;
        if (onlineOrder === 'Yes') {
          deliveryTime = 20 + (getDeterministicHash(name) % 6) * 5;
        }

        const offers = [];
        if (onlineOrder === 'Yes') {
          const offerHash = getDeterministicHash(name) % 3;
          if (offerHash === 0) {
            offers.push('10% Off');
          } else if (offerHash === 1) {
            offers.push('Buy 1 Get 1 Free');
          }
        }

        const characteristics = [];
        if (row.rest_type) {
          row.rest_type.split(',').forEach(type => {
            const trimmedType = type.trim();
            if (trimmedType) {
              characteristics.push(trimmedType);
            }
          });
        }
        if (bookTable === 'Yes') {
          characteristics.push('Table Booking');
        }
        if (onlineOrder === 'Yes') {
          characteristics.push('Delivery Available');
        }

        // Run insert
        insertStmt.run([
          id,
          name,
          address,
          location,
          JSON.stringify(cuisines),
          rating,
          votes,
          approxCost,
          onlineOrder,
          bookTable,
          deliveryTime,
          JSON.stringify(offers),
          JSON.stringify(characteristics)
        ]);
        insertedRows++;
      })
      .on('end', () => {
        console.log('Finalizing insert statements and committing transaction...');
        insertStmt.finalize();
        db.run('COMMIT', (err) => {
          if (err) {
            console.error('Commit failed:', err);
            return reject(err);
          }
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`\n=== Migration Completed Successfully in ${duration}s ===`);
          console.log(`Total CSV lines parsed: ${totalRows}`);
          console.log(`Deduplicated restaurants inserted: ${insertedRows}`);
          
          db.close();
          resolve();
        });
      })
      .on('error', (err) => {
        console.error('Stream error, rolling back transaction:', err);
        db.run('ROLLBACK');
        db.close();
        reject(err);
      });
  });
}

migrate().catch(console.error);
