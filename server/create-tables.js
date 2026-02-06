import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

// Load from environment variables
const client = new Client({
  host: process.env.SUPABASE_DB_HOST,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function createTables() {
  try {
    console.log('🔌 Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected!\n');

    const schema = fs.readFileSync('./schema.sql', 'utf-8');
    
    console.log('📦 Creating tables...\n');
    await client.query(schema);
    
    console.log('✅ Tables created successfully!\n');
    
    // Verify tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('📊 Tables in database:');
    result.rows.forEach(row => console.log(`   • ${row.table_name}`));
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

createTables();
