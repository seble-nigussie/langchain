const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'subscriptions.db'));

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cost REAL NOT NULL,
    billing_cycle TEXT CHECK(billing_cycle IN ('monthly', 'yearly')) NOT NULL,
    next_payment_date DATE NOT NULL,
    category_id INTEGER,
    status TEXT CHECK(status IN ('active', 'paused')) DEFAULT 'active',
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
  );
`);

const insertCategory = db.prepare(`INSERT OR IGNORE INTO categories (name) VALUES (?)`);

for (const name of ['Entertainment', 'Software', 'Utilities', 'Health & Wellness']) {
  insertCategory.run(name);
}

const getCategoryId = db.prepare(`SELECT id FROM categories WHERE name = ?`);

function date(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const insertSubscription = db.prepare(`
  INSERT OR IGNORE INTO subscriptions (name, cost, billing_cycle, next_payment_date, category_id, status)
  VALUES (@name, @cost, @billing_cycle, @next_payment_date, @category_id, @status)
`);

const seeds = [
  { name: 'Netflix',              cost: 15.49,  billing_cycle: 'monthly', next_payment_date: date(5),   category: 'Entertainment',     status: 'active' },
  { name: 'Spotify',              cost: 11.99,  billing_cycle: 'monthly', next_payment_date: date(12),  category: 'Entertainment',     status: 'active' },
  { name: 'GitHub Copilot',       cost: 10.00,  billing_cycle: 'monthly', next_payment_date: date(3),   category: 'Software',          status: 'active' },
  { name: 'Adobe Creative Cloud', cost: 54.99,  billing_cycle: 'monthly', next_payment_date: date(18),  category: 'Software',          status: 'active' },
  { name: 'Gym Membership',       cost: 45.00,  billing_cycle: 'monthly', next_payment_date: date(1),   category: 'Health & Wellness', status: 'active' },
  { name: 'ChatGPT Plus',         cost: 20.00,  billing_cycle: 'monthly', next_payment_date: date(25),  category: 'Software',          status: 'paused' },
  { name: 'Amazon Prime',         cost: 139.00, billing_cycle: 'yearly',  next_payment_date: date(180), category: 'Entertainment',     status: 'active' },
];

for (const s of seeds) {
  const row = getCategoryId.get(s.category);
  insertSubscription.run({
    name: s.name,
    cost: s.cost,
    billing_cycle: s.billing_cycle,
    next_payment_date: s.next_payment_date,
    category_id: row ? row.id : null,
    status: s.status,
  });
}

const catCount = db.prepare(`SELECT COUNT(*) AS count FROM categories`).get().count;
const subCount = db.prepare(`SELECT COUNT(*) AS count FROM subscriptions`).get().count;

console.log('Database initialized: subscriptions.db');
console.log(`  categories:    ${catCount} rows`);
console.log(`  subscriptions: ${subCount} rows`);

console.log('\nCategories:');
for (const row of db.prepare(`SELECT * FROM categories ORDER BY id`).all()) {
  console.log(`  [${row.id}] ${row.name}`);
}

console.log('\nSubscriptions:');
for (const row of db.prepare(`
  SELECT s.id, s.name, s.cost, s.billing_cycle, s.next_payment_date, s.status, c.name AS category
  FROM subscriptions s LEFT JOIN categories c ON s.category_id = c.id
  ORDER BY s.id
`).all()) {
  console.log(`  [${row.id}] ${row.name} — $${row.cost}/${row.billing_cycle} | next: ${row.next_payment_date} | ${row.status} | ${row.category}`);
}

db.close();
