import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const EXPECTED_PROJECT_ID = 'niavmonyfwqlryppgksy';
const EXPECTED_SUPABASE_URL = `https://${EXPECTED_PROJECT_ID}.supabase.co`;

async function runDriftCheck() {
  const failures: string[] = [];

  // 1. Verify supabase/config.toml points to niavmonyfwqlryppgksy
  const configPath = path.resolve('supabase/config.toml');
  if (!fs.existsSync(configPath)) {
    failures.push('Missing supabase/config.toml');
  } else {
    const configRaw = fs.readFileSync(configPath, 'utf-8');
    const match = configRaw.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
    const configuredId = match?.[1] || '';
    if (configuredId !== EXPECTED_PROJECT_ID) {
      failures.push(
        `supabase/config.toml project_id is "${configuredId}", expected "${EXPECTED_PROJECT_ID}".`
      );
    }
  }

  // 2. Verify all files in supabase/migrations/ follow 14-digit YYYYMMDDHHMMSS_name.sql format
  const migrationsDir = path.resolve('supabase/migrations');
  if (!fs.existsSync(migrationsDir)) {
    failures.push('Missing supabase/migrations directory');
  } else {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) {
        failures.push(
          `Migration file "${file}" does not follow standard 14-digit timestamp prefix (YYYYMMDDHHMMSS_name.sql).`
        );
      }
    }
  }

  // 3. Verify legacy SQL files are removed
  for (const legacyFile of ['database.sql', 'database_postgres.sql']) {
    if (fs.existsSync(path.resolve(legacyFile))) {
      failures.push(`Obsolete legacy SQL file "${legacyFile}" still exists in repository root.`);
    }
  }

  // 4. Live RPC & RLS security verification against niavmonyfwqlryppgksy
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || EXPECTED_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (anonKey) {
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const dirRes = await anonClient.rpc('get_schools_directory');
    if (!dirRes.error && Array.isArray(dirRes.data)) {
      failures.push(
        'LIVE DRIFT: public.get_schools_directory() is still callable by unauthenticated anon role on niavmonyfwqlryppgksy! Run supabase/migrations/20261001220000_live_schema_and_security_reconciliation.sql in Supabase SQL Editor.'
      );
    }

    const lnRes = await anonClient.from('lesson_notes').select('id').limit(1);
    if (!lnRes.error && Array.isArray(lnRes.data)) {
      failures.push(
        'LIVE DRIFT: public.lesson_notes is still readable by unauthenticated anon role on niavmonyfwqlryppgksy! Run supabase/migrations/20261001220000_live_schema_and_security_reconciliation.sql in Supabase SQL Editor.'
      );
    }
  }

  if (failures.length > 0) {
    console.error('Supabase Drift & Security Check Found Issues:');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }

  console.log(`Supabase configuration & migration check passed for project ${EXPECTED_PROJECT_ID}.`);
}

runDriftCheck().catch((err) => {
  console.error('Error running Supabase drift check:', err);
  process.exit(1);
});
