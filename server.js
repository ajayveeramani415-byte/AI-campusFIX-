import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from 'hatchable';

// Import all API route handlers
import complaintsHandler, { access as complaintsAccess } from './api/complaints.js';
import adminComplaintsHandler, { access as adminAccess } from './api/admin/complaints.js';
import complaintDetailHandler, { access as detailAccess } from './api/complaints/[id].js';
import uploadHandler, { access as uploadAccess } from './api/complaints/upload.js';
import notificationsHandler, { access as notificationsAccess } from './api/notifications.js';
import staffComplaintsHandler, { access as staffAccess } from './api/staff/complaints.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// In-memory sessions & pending OTP codes
const sessions = new Map();
const pendingCodes = new Map();

// Helper: Parse cookies
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const items = cookieHeader.split(';');
  for (const item of items) {
    const [name, ...val] = item.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(val.join('='));
  }
  return cookies;
}

// Helper: Parse multipart/form-data
function parseMultipart(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const files = [];
  const fields = {};

  let start = 0;
  while (true) {
    const idx = buffer.indexOf(boundaryBuffer, start);
    if (idx === -1) break;
    if (start !== 0) {
      const part = buffer.subarray(start, idx - 2); // trim trailing \r\n
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headerStr = part.subarray(0, headerEnd).toString('latin1');
        const bodyBuffer = part.subarray(headerEnd + 4);

        const dispMatch = headerStr.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
        const typeMatch = headerStr.match(/content-type:\s*([^\r\n]+)/i);

        if (dispMatch) {
          const fieldName = dispMatch[1];
          const fileName = dispMatch[2];
          const contentType = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';

          if (fileName) {
            files.push({
              field: fieldName,
              filename: fileName,
              contentType,
              buffer: bodyBuffer
            });
          } else {
            fields[fieldName] = bodyBuffer.toString('utf8');
          }
        }
      }
    }
    start = idx + boundaryBuffer.length + 2; // skip \r\n
    if (buffer.subarray(idx + boundaryBuffer.length, idx + boundaryBuffer.length + 2).toString() === '--') {
      break; // end boundary
    }
  }

  return { fields, files };
}

// Helper: Seed initial demo data if empty
async function seedInitialData() {
  const check = await db.query('SELECT COUNT(*) as count FROM complaints');
  const count = Number(check.rows[0]?.count || 0);
  if (count === 0) {
    console.log('🌱 Seeding initial demo complaints and test users...');
    const studentUser = {
      id: 'demo-student-uuid-001',
      email: 'student@campus.edu',
      role: 'user'
    };
    const adminUser = {
      id: 'demo-admin-uuid-001',
      email: 'admin@campus.edu',
      role: 'admin'
    };

    await db.query('INSERT OR IGNORE INTO users (id, email, role) VALUES ($1, $2, $3)', [studentUser.id, studentUser.email, studentUser.role]);
    await db.query('INSERT OR IGNORE INTO users (id, email, role) VALUES ($1, $2, $3)', [adminUser.id, adminUser.email, adminUser.role]);

    // Complaint 1
    const c1 = await db.query(`
      INSERT INTO complaints (id, title, description, location, category, priority, department, status, reporter_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'c1000000-0000-0000-0000-000000000001',
      'Ceiling fan making screeching noise and spark at regulator',
      'The fan in 2nd row vibrates intensely and sparks intermittently when switched to speed 4.',
      'Block B, Room 204',
      'Electrical',
      'High',
      'Electrical Maintenance',
      'In Progress',
      studentUser.id
    ]);

    await db.query(`
      INSERT INTO complaint_updates (complaint_id, status, note, updated_by)
      VALUES ($1, $2, $3, $4)
    `, [c1.rows[0].id, 'In Progress', 'Electrician team assigned. Capacitor replacement scheduled for 3 PM.', 'admin']);

    await db.query(`
      INSERT INTO notifications (user_id, complaint_id, title, message)
      VALUES ($1, $2, $3, $4)
    `, [studentUser.id, c1.rows[0].id, 'Complaint status updated', 'Your complaint "Ceiling fan making screeching noise" status is now In Progress.']);

    // Complaint 2
    const c2 = await db.query(`
      INSERT INTO complaints (id, title, description, location, category, priority, department, status, reporter_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'c1000000-0000-0000-0000-000000000002',
      'Major washroom pipeline leakage flooding hallway',
      'Main intake pipe beneath basin 3 burst open. Water is overflowing into the corridor.',
      'Main Academic Block, 2nd Floor Restroom',
      'Plumbing',
      'Critical',
      'Sanitation & Plumbing Dept',
      'Pending',
      studentUser.id
    ]);

    await db.query(`
      INSERT INTO notifications (user_id, complaint_id, title, message)
      VALUES ($1, $2, $3, $4)
    `, [studentUser.id, c2.rows[0].id, 'Complaint submitted', 'Your complaint has been submitted and routed to Sanitation & Plumbing Dept.']);

    // Complaint 3
    const c3 = await db.query(`
      INSERT INTO complaints (id, title, description, location, category, priority, department, status, reporter_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'c1000000-0000-0000-0000-000000000003',
      'Wi-Fi router offline in Seminar Hall',
      'Network SSID Campus_Fast_5G is unreachable, router LEDs are unlit.',
      'Seminar Hall 1',
      'Network/IT',
      'Medium',
      'IT Services & Network Support',
      'Resolved',
      studentUser.id
    ]);

    await db.query(`
      INSERT INTO complaint_updates (complaint_id, status, note, updated_by)
      VALUES ($1, $2, $3, $4)
    `, [c3.rows[0].id, 'Resolved', 'PoE injector switch was reset. Signal restored.', 'admin']);

    console.log('✅ Demo seed completed.');
  }
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // Add CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse session from cookie
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.hatchable_session;
  let currentUser = sessionToken ? sessions.get(sessionToken) : null;

  // ---------------------------------------------------------
  // 1. Authentication Endpoints (/api/auth/*)
  // ---------------------------------------------------------
  if (pathname.startsWith('/api/auth/')) {
    const authSub = pathname.replace('/api/auth/', '');

    if (authSub === 'providers' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ providers: ['email'] }));
      return;
    }

    if (authSub === 'get-session' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(currentUser ? { user: currentUser } : null));
      return;
    }

    if (authSub === 'sign-out' && req.method === 'POST') {
      if (sessionToken) sessions.delete(sessionToken);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'hatchable_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Read body for login start & verify
    let bodyData = '';
    for await (const chunk of req) bodyData += chunk;
    let jsonBody = {};
    try { jsonBody = JSON.parse(bodyData); } catch {}

    if (authSub === 'login/start' && req.method === 'POST') {
      const email = (jsonBody.email || '').trim().toLowerCase();
      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Email is required' }));
        return;
      }

      // Generate 6-digit OTP code (always supports 123456 as instant bypass)
      const code = '123456';
      pendingCodes.set(email, { code, expires: Date.now() + 10 * 60 * 1000 });

      console.log('\n======================================================');
      console.log(`🔐 [CAMPUSFIX AUTH] Verification code for ${email}`);
      console.log(`👉 Code: ${code} (Instant demo code)`);
      console.log('======================================================\n');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        has_passkey: false,
        message: 'Code sent! Check console or enter 123456 for instant login.'
      }));
      return;
    }

    if (authSub === 'login/verify-code' && req.method === 'POST') {
      const email = (jsonBody.email || '').trim().toLowerCase();
      const code = (jsonBody.code || '').trim();

      const stored = pendingCodes.get(email);
      // Allow '123456' as master bypass for easy testing or match stored code
      if (code !== '123456' && (!stored || stored.code !== code)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or expired code. (Enter 123456 for instant login)' }));
        return;
      }

      // Determine role: if email includes 'admin' or logged in via admin page
      const referer = req.headers.referer || '';
      const isAdminLogin = referer.includes('admin') || email.includes('admin');
      const role = isAdminLogin ? 'admin' : 'user';

      // Find or create in DB
      let userRes = await db.query('SELECT id, email, role FROM users WHERE email = $1', [email]);
      let user;
      if (!userRes.rows.length) {
        const newId = crypto.randomUUID();
        await db.query('INSERT INTO users (id, email, role) VALUES ($1, $2, $3)', [newId, email, role]);
        user = { id: newId, email, role };
      } else {
        user = userRes.rows[0];
        // If logging in via admin and wasn't admin, elevate role for convenience
        if (isAdminLogin && user.role !== 'admin') {
          await db.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', user.id]);
          user.role = 'admin';
        }
      }

      // Mint session
      const token = crypto.randomUUID();
      sessions.set(token, user);

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `hatchable_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
      });
      res.end(JSON.stringify({ user }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown auth endpoint' }));
    return;
  }

  // ---------------------------------------------------------
  // 2. Custom Business APIs (/api/*)
  // ---------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    let handler = null;
    let requiredAccess = null;
    const pathParams = {};

    if (pathname === '/api/complaints') {
      handler = complaintsHandler;
      requiredAccess = complaintsAccess;
    } else if (pathname === '/api/complaints/upload') {
      handler = uploadHandler;
      requiredAccess = uploadAccess;
    } else if (pathname.startsWith('/api/complaints/')) {
      const id = pathname.replace('/api/complaints/', '');
      pathParams.id = id;
      handler = complaintDetailHandler;
      requiredAccess = detailAccess;
    } else if (pathname === '/api/admin/complaints') {
      handler = adminComplaintsHandler;
      requiredAccess = adminAccess;
    } else if (pathname === '/api/notifications') {
      handler = notificationsHandler;
      requiredAccess = notificationsAccess;
    } else if (pathname === '/api/staff/complaints') {
      handler = staffComplaintsHandler;
      requiredAccess = staffAccess;
    }

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
      return;
    }

    // Role-based access control
    if (requiredAccess === 'user') {
      if (!currentUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required. Please sign in.' }));
        return;
      }
    } else if (requiredAccess === 'admin') {
      if (!currentUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required. Please sign in as admin.' }));
        return;
      }
      if (currentUser.role !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied. Administrator privileges required.' }));
        return;
      }
    }

    // Read full request body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const fullBuffer = Buffer.concat(chunks);

    let parsedBody = {};
    let parsedFiles = [];

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        parsedBody = JSON.parse(fullBuffer.toString('utf8'));
      } catch {}
    } else if (contentType.includes('multipart/form-data')) {
      const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
      if (boundaryMatch) {
        const { fields, files } = parseMultipart(fullBuffer, boundaryMatch[1]);
        parsedBody = fields;
        parsedFiles = files;
      }
    }

    // Build Express/Next-style req and res objects
    const queryObj = Object.fromEntries(urlObj.searchParams.entries());
    req.user = currentUser;
    req.member = currentUser;
    req.body = parsedBody;
    req.query = queryObj;
    req.params = pathParams;
    req.files = parsedFiles;

    let responseSent = false;
    const augmentedRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, val) {
        res.setHeader(name, val);
        return this;
      },
      json(data) {
        if (responseSent) return;
        responseSent = true;
        res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      },
      send(data) {
        if (responseSent) return;
        responseSent = true;
        res.writeHead(this.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(String(data));
      }
    };

    try {
      await handler(req, augmentedRes);
    } catch (err) {
      console.error(`Error in ${pathname}:`, err);
      if (!responseSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
      }
    }
    return;
  }

  // ---------------------------------------------------------
  // 3. Static Files & Frontend Routing
  // ---------------------------------------------------------
  let filePath = pathname;
  if (filePath === '/') filePath = '/index.html';
  if (filePath === '/student/' || filePath === '/student') filePath = '/student/index.html';
  if (filePath === '/admin/' || filePath === '/admin') filePath = '/admin/index.html';

  let localPath = path.join(PUBLIC_DIR, filePath);

  // Security check to avoid path traversal
  if (!localPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    const ext = path.extname(localPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.html') {
      let html = fs.readFileSync(localPath, 'utf8');

      // Inject hatchable client-side bootstrap and auth script
      const injection = `
        <script>
          window.__HATCHABLE__ = { slug: "campusfix-ai", api: "/api", primaryOrigin: window.location.origin };
        </script>
        <script src="/__hatchable/auth.js"></script>
      `;

      if (html.includes('</head>')) {
        html = html.replace('</head>', `${injection}\n</head>`);
      } else {
        html = `${injection}\n${html}`;
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(html);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(localPath).pipe(res);
    }
    return;
  }

  // 404 Fallback
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<h1>404 Not Found</h1><p>The requested file <code>${pathname}</code> was not found.</p><p><a href="/">Go to Home</a></p>`);
});

// Seed data and start server
seedInitialData().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================================`);
    console.log(`🚀 CampusFix AI Server is running live!`);
    console.log(`👉 Access URL:       http://localhost:${PORT}`);
    console.log(`🎓 Student Portal:   http://localhost:${PORT}/student/`);
    console.log(`🔐 Admin Dashboard:  http://localhost:${PORT}/admin/`);
    console.log(`🔑 Demo OTP Code:    123456 (or check console on login)`);
    console.log(`========================================================\n`);
  });
}).catch(err => {
  console.error('Fatal initialization error:', err);
});
