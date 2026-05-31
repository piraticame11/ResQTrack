require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const seed   = fs.readFileSync(path.join(__dirname, 'seed.sql'),   'utf8');

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

    console.log('\n🎉 Migration complete. You can now run: npm run dev');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

migrate();
