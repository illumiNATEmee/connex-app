import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupDatabase() {
  console.log('🗄️  Setting up Connex database...\n');

  // Test connection first
  const { data: test, error: testError } = await supabase
    .from('profiles')
    .select('count')
    .limit(1);

  if (testError && testError.code === '42P01') {
    console.log('Tables do not exist yet. Run create-tables.js first.');
    return;
  }

  if (testError) {
    console.error('Connection error:', testError);
    return;
  }

  console.log('✅ Connection successful! Tables exist.\n');
  
  // Get stats
  const { count: profileCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });
  
  const { count: chatCount } = await supabase
    .from('chats')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Current stats:`);
  console.log(`   Profiles: ${profileCount || 0}`);
  console.log(`   Chats: ${chatCount || 0}`);
}

setupDatabase().catch(console.error);
