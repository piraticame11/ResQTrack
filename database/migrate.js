require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const schema     = fs.readFileSync(path.join(__dirname, 'schema.sql'),                  'utf8');
const seed       = fs.readFileSync(path.join(__dirname, 'seed.sql'),                    'utf8');

// Columns to ensure exist: { table, column, definition, after }
const requiredColumns = [
  { table: 'users', column: 'birthdate', definition: 'DATE DEFAULT NULL',         after: 'phone' },
  { table: 'users', column: 'id_image',  definition: 'VARCHAR(255) DEFAULT NULL', after: 'profile_photo' },
];

async function migrate() {
  const conn = await mysql.createConnection({
    host:               process.env.DB_HOST     || 'localhost',
    port:               process.env.DB_PORT     || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    console.log('Running schema…');
    await conn.query(schema);
    console.log('✅ Schema applied');

    console.log('Running seed…');
    await conn.query(seed);
    console.log('✅ Seed applied');

    // Add any missing columns without touching existing ones
    console.log('Checking for missing columns…');
    for (const { table, column, definition, after } of requiredColumns) {
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      );
      if (rows[0].cnt === 0) {
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition} AFTER \`${after}\``);
        console.log(`  ✅ Added column: ${table}.${column}`);
      } else {
        console.log(`  ⏭  Skipped (already exists): ${table}.${column}`);
      }
    }

    console.log('\n🎉 Migration complete. You can now run: npm run dev');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

migrate();
