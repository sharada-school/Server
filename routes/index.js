const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');

const authRoutes = require('./authRoutes');
const parentRoutes = require('./parentRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const studentRoutes = require('./studentRoutes');
const teacherRoutes = require('./teacherRoutes');
const attendanceRoutes = require('./attendanceRoutes');
const markRoutes = require('./markRoutes');
const auditRoutes = require('./auditRoutes');

// Health check with DB connection verification
router.get('/health', async (_, res) => {
  const { pool } = require('../db');
  const dbUrl = process.env.DATABASE_URL || '';
  
  // Mask password for display
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');

  try {
    const start = Date.now();
    const dbRes = await pool.query('SELECT current_database(), current_user, version(), now() as db_time;');
    const usersRes = await pool.query('SELECT id, email, role, name FROM public.users;');
    
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Database Health: Connected</title><style>body{font-family:sans-serif;padding:30px;line-height:1.6;background:#f0fdf4;color:#166534;} pre{background:#fff;padding:15px;border-radius:8px;border:1px solid #bbf7d0;}</style></head>
      <body>
        <h1>✅ Database Connected Successfully!</h1>
        <p><strong>Database:</strong> ${dbRes.rows[0]?.current_database}</p>
        <p><strong>Database User:</strong> ${dbRes.rows[0]?.current_user}</p>
        <p><strong>Latency:</strong> ${Date.now() - start} ms</p>
        <p><strong>Users in public.users:</strong> ${usersRes.rows.length}</p>
        <pre>${JSON.stringify(usersRes.rows, null, 2)}</pre>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('🚨 [Health Check] Database Connection Failed:');
    console.error('Error Message:', err.message);
    console.error('Error Code:', err.code);

    // If tenant/user not found on the current region pooler, attempt auto-detecting the project region
    if (err.message && err.message.includes('not found')) {
      const { Client } = require('pg');
      const fs = require('fs');
      const path = require('path');
      const candidateRegions = [
        'ap-southeast-1', // Singapore
        'us-east-1',      // N. Virginia
        'eu-central-1',   // Frankfurt
        'us-west-1',      // N. California
        'eu-west-1',      // Ireland
        'ap-northeast-1', // Tokyo
        'ca-central-1',   // Canada
        'ap-south-1',     // Mumbai
        'sa-east-1'       // Sao Paulo
      ];

      for (const region of candidateRegions) {
        const testHost = `aws-0-${region}.pooler.supabase.com`;
        const testConnStr = `postgresql://postgres.clexioftxncydfkvsrwz:Sharada%402026@${testHost}:6543/postgres`;
        const client = new Client({
          connectionString: testConnStr,
          connectionTimeoutMillis: 3000,
          ssl: { rejectUnauthorized: false }
        });

        try {
          await client.connect();
          const testRes = await client.query('SELECT current_database(), current_user, now() as db_time;');
          await client.end();

          // FOUND WORKING REGION! Automatically update .env
          const envPath = path.join(__dirname, '..', '.env');
          if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            envContent = envContent.replace(/DATABASE_URL="[^"]+"/, `DATABASE_URL="${testConnStr}"`);
            fs.writeFileSync(envPath, envContent, 'utf8');
            process.env.DATABASE_URL = testConnStr;
          }

          return res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Database Connected via Auto-Detection</title><style>body{font-family:sans-serif;padding:30px;line-height:1.6;background:#f0fdf4;color:#166534;} pre{background:#fff;padding:15px;border-radius:8px;border:1px solid #bbf7d0;}</style></head>
            <body>
              <h1>🎉 Automatically Found Your Supabase Region: <code>${region}</code>!</h1>
              <p>Host: <strong>${testHost}</strong></p>
              <p>Updated your <code>.env</code> file automatically. Please refresh this page to finalize the connection!</p>
              <p><a href="/api/health" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">Refresh Page Now</a></p>
            </body>
            </html>
          `);
        } catch {
          try { await client.end(); } catch {}
        }
      }
    }

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Database Health: Region Not Found</title><style>body{font-family:sans-serif;padding:30px;line-height:1.6;background:#fef2f2;color:#991b1b;} pre{background:#fff;padding:15px;border-radius:8px;border:1px solid #fecaca;} .box{background:#fff;padding:20px;border-radius:8px;border:2px solid #ef4444;margin-top:20px;}</style></head>
      <body>
        <h1>❌ Supabase Region Mismatch</h1>
        <div class="box">
          <p><strong>Error:</strong> <span style="font-size:18px;color:#b91c1c;">${err.message}</span></p>
          <p>This means your Supabase project was created in a different AWS region than <code>ap-south-1</code>.</p>
        </div>
        <h3>How to get the exact pooler string in 10 seconds:</h3>
        <ol>
          <li>Open your Supabase project: <a href="https://supabase.com/dashboard/project/clexioftxncydfkvsrwz/settings/database" target="_blank">Database Settings</a></li>
          <li>Scroll to <strong>Connection string</strong> and click the <strong>"Connection pooler"</strong> tab.</li>
          <li>Copy the connection string (with port 6543) and paste it here!</li>
        </ol>
      </body>
      </html>
    `);
  }
});

// Auth routes (/api/login, /api/register/*, /api/password-reset/*)
router.use('/', authRoutes);

// Parent portal routes (/api/parent/*)
router.use('/parent', parentRoutes);

// Administration & Teacher portal routes (protected with token authentication)
router.use('/dashboard', requireAuth, dashboardRoutes);
router.use('/students', requireAuth, studentRoutes);
router.use('/teachers', requireAuth, teacherRoutes);
router.use('/attendance', requireAuth, attendanceRoutes);
router.use('/marks', requireAuth, markRoutes);
router.use('/audit-logs', requireAuth, auditRoutes);

module.exports = router;
