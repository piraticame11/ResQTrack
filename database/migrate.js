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
  { table: 'users', column: 'address_line',        definition: 'VARCHAR(255) DEFAULT NULL',                       after: 'purok_id' },
  { table: 'users', column: 'residency_type',       definition: "ENUM('Owner','Tenant') NOT NULL DEFAULT 'Owner'", after: 'address_line' },
  { table: 'users', column: 'landlord_name',        definition: 'VARCHAR(150) DEFAULT NULL',                      after: 'residency_type' },
  { table: 'users', column: 'landlord_contact',     definition: 'VARCHAR(20) DEFAULT NULL',                       after: 'landlord_name' },
  { table: 'users', column: 'verification_status',  definition: "ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending'", after: 'is_verified' },
  { table: 'users', column: 'verification_note',    definition: 'VARCHAR(255) DEFAULT NULL',                      after: 'verification_status' },
  { table: 'users', column: 'fake_report_count',    definition: 'INT NOT NULL DEFAULT 0',                         after: 'is_active' },
  { table: 'incidents', column: 'is_fake',     definition: 'TINYINT(1) NOT NULL DEFAULT 0', after: 'assigned_responder_id' },
  { table: 'incidents', column: 'fake_reason', definition: 'TEXT DEFAULT NULL',             after: 'is_fake' },
  { table: 'incidents', column: 'flagged_by',  definition: 'INT DEFAULT NULL',              after: 'fake_reason' },
  { table: 'incidents', column: 'flagged_at',  definition: 'TIMESTAMP NULL DEFAULT NULL',   after: 'flagged_by' },
  { table: 'announcements', column: 'scheduled_at', definition: 'TIMESTAMP NULL DEFAULT NULL', after: 'is_published' },
  { table: 'users', column: 'address_lat',          definition: 'DECIMAL(10,8) DEFAULT NULL',                                          after: 'address_line' },
  { table: 'users', column: 'address_lng',          definition: 'DECIMAL(11,8) DEFAULT NULL',                                          after: 'address_lat' },
  { table: 'users', column: 'address_match_status', definition: "ENUM('Matched','Unmatched','Unchecked') NOT NULL DEFAULT 'Unchecked'", after: 'address_lng' },
  { table: 'users', column: 'landlord_address',     definition: 'VARCHAR(255) DEFAULT NULL',                                           after: 'landlord_contact' },
  { table: 'users', column: 'proof_of_residency_image', definition: 'VARCHAR(255) DEFAULT NULL',                                      after: 'id_image' },
  { table: 'users', column: 'id_type',   definition: 'VARCHAR(50) DEFAULT NULL', after: 'landlord_address' },
  { table: 'users', column: 'id_number', definition: 'VARCHAR(50) DEFAULT NULL', after: 'id_type' },
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

    // Backfill verification_status for users that were already verified
    // under the old boolean-only is_verified flag
    await conn.query(
      `UPDATE users SET verification_status = 'Verified'
       WHERE is_verified = 1 AND verification_status = 'Pending'`
    );

    // Rename enum values on existing installs. MySQL enums can't be renamed
    // in place, so widen -> migrate data -> narrow.
    console.log('Checking incident status/category enum values…');

    const [statusColRows] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'incidents' AND COLUMN_NAME = 'status'`
    );
    const statusCol = statusColRows[0];
    if (statusCol && statusCol.COLUMN_TYPE.includes("'Ongoing'")) {
      await conn.query(`ALTER TABLE incidents MODIFY COLUMN status
        ENUM('Pending','Dispatched','Ongoing','Initiate','Delayed','Resolved','Archived') NOT NULL DEFAULT 'Pending'`);
      await conn.query(`UPDATE incidents SET status = 'Initiate' WHERE status = 'Ongoing'`);
      await conn.query(`ALTER TABLE incidents MODIFY COLUMN status
        ENUM('Pending','Dispatched','Initiate','Delayed','Resolved','Archived') NOT NULL DEFAULT 'Pending'`);
      console.log('  ✅ Migrated incidents.status: Ongoing -> Initiate (Delayed added)');
    } else {
      console.log('  ⏭  incidents.status already migrated');
    }

    const [typeColRows] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'incidents' AND COLUMN_NAME = 'incident_type'`
    );
    const typeCol = typeColRows[0];
    if (typeCol && typeCol.COLUMN_TYPE.includes("'Medical'")) {
      await conn.query(`ALTER TABLE incidents MODIFY COLUMN incident_type
        ENUM('Fire','Medical','Rescue','Crime','Noise','Garbage','Other') NOT NULL`);
      await conn.query(`UPDATE incidents SET incident_type = 'Rescue' WHERE incident_type = 'Medical'`);
      await conn.query(`ALTER TABLE incidents MODIFY COLUMN incident_type
        ENUM('Fire','Rescue','Crime','Noise','Garbage','Other') NOT NULL`);
      console.log('  ✅ Migrated incidents.incident_type: Medical -> Rescue');
    } else {
      console.log('  ⏭  incidents.incident_type already migrated');
    }

    console.log('Checking users.role enum…');
    const [roleColRows] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
    );
    const roleCol = roleColRows[0];
    if (roleCol && !roleCol.COLUMN_TYPE.includes("'super_admin'")) {
      await conn.query(`ALTER TABLE users MODIFY COLUMN role
        ENUM('super_admin','admin','responder','resident') NOT NULL DEFAULT 'resident'`);
      console.log('  ✅ Widened users.role to include super_admin');
    } else {
      console.log('  ⏭  users.role already includes super_admin');
    }

    // Account management needs an owner — if this install has no super_admin
    // yet, promote its earliest-created active admin instead of leaving the
    // system with nobody able to manage admin-level accounts.
    const [[{ count: superAdminCount }]] = await conn.query(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND is_active = 1"
    );
    if (superAdminCount === 0) {
      const [[earliestAdmin]] = await conn.query(
        "SELECT id, full_name FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
      );
      if (earliestAdmin) {
        await conn.query("UPDATE users SET role = 'super_admin' WHERE id = ?", [earliestAdmin.id]);
        console.log(`  ✅ Promoted ${earliestAdmin.full_name} (#${earliestAdmin.id}) to super_admin`);
      } else {
        console.log('  ⚠️  No admin account found to promote — create one, then re-run migrate to get a super_admin.');
      }
    } else {
      console.log('  ⏭  A super_admin already exists');
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
