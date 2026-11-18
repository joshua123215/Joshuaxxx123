// Automated Security Audit & Verification Script
// Tests protections against the 27 Pre-Launch Security Toolkit Checks

const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data
      }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runAudit() {
  console.log("====================================================");
  console.log("  PRE-LAUNCH SECURITY AUDIT & VERIFICATION SUITE   ");
  console.log("====================================================");

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
    }
  }

  try {
    // 1. Check 14: Security Headers & X-Powered-By removal
    const health = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET'
    });
    assert(health.statusCode === 200, "Health check responds 200");
    assert(!health.headers['x-powered-by'], "Check 14: X-Powered-By header is stripped");
    assert(health.headers['x-content-type-options'] === 'nosniff', "Check 14: X-Content-Type-Options is nosniff");
    assert(health.headers['x-frame-options'] === 'SAMEORIGIN', "Check 14: X-Frame-Options is SAMEORIGIN");
    assert(Boolean(health.headers['strict-transport-security']), "Check 14: Strict-Transport-Security (HSTS) is present");
    assert(Boolean(health.headers['content-security-policy']), "Check 14: Content-Security-Policy (CSP) is present");
    assert(Boolean(health.headers['permissions-policy']), "Check 14: Permissions-Policy is present");
    assert(health.headers['referrer-policy'] === 'strict-origin-when-cross-origin', "Check 14: Referrer-Policy is set");

    const home = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'GET'
    });
    assert(home.statusCode === 200, "Root HTML responds 200");
    assert(Boolean(home.headers['content-security-policy']), "Check 14: Root HTML includes Content-Security-Policy");
    assert(Boolean(home.headers['permissions-policy']), "Check 14: Root HTML includes Permissions-Policy");

    // 2. Check 23: Sensitive File Access blocked
    const dotEnv = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/.env',
      method: 'GET'
    });
    assert(dotEnv.statusCode === 404, "Check 23: Direct access to /.env returns 404 Not Found");

    const packageJson = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/package.json',
      method: 'GET'
    });
    assert(packageJson.statusCode === 404, "Check 23: Direct access to /package.json returns 404 Not Found");

    const serverTs = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/server.ts',
      method: 'GET'
    });
    assert(serverTs.statusCode === 404, "Check 23: Direct access to /server.ts returns 404 Not Found");

    const transactionsData = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/data/ghana_transactions.json',
      method: 'GET'
    });
    assert(transactionsData.statusCode === 404, "Check 23: Direct access to /data/ files returns 404 Not Found");

    // 3. Check 01 & Check 09: Admin Route Lockdown
    const unauthAdmin = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/payment/admin/transactions',
      method: 'GET'
    });
    assert(unauthAdmin.statusCode === 403, "Check 09: Unauthenticated request to /api/payment/admin/transactions is blocked (403)");

    const unauthVoice = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/automation/admin/voice-settings',
      method: 'GET'
    });
    assert(unauthVoice.statusCode === 403, "Check 09: Unauthenticated request to /api/automation/admin/voice-settings is blocked (403)");

    const authAdmin = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/payment/admin/transactions',
      method: 'GET',
      headers: {
        'x-admin-email': 'joshuaocansey731@gmail.com'
      }
    });
    assert(authAdmin.statusCode === 200, "Check 09: Authorized admin (joshuaocansey731@gmail.com) is granted access (200)");

    // 4. Bonus B2: SSRF Protection
    const ssrfLocalhost = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/proxy-image?url=http://localhost:3000/api/health',
      method: 'GET'
    });
    assert(ssrfLocalhost.statusCode === 400, "Bonus B2: SSRF probe to http://localhost is blocked (400)");

    const ssrfMetadata = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/proxy-image?url=http://169.254.169.254/computeMetadata/v1/',
      method: 'GET'
    });
    assert(ssrfMetadata.statusCode === 400, "Bonus B2: SSRF probe to cloud metadata IP is blocked (400)");

    const ssrfPrivateIp = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/proxy-image?url=http://192.168.1.1/admin',
      method: 'GET'
    });
    assert(ssrfPrivateIp.statusCode === 400, "Bonus B2: SSRF probe to RFC1918 private IP is blocked (400)");

    const ssrfIpv6Bracket = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/proxy-image?url=http://[::1]:3000/api/health',
      method: 'GET'
    });
    assert(ssrfIpv6Bracket.statusCode === 400, "Bonus B2: SSRF probe to IPv6 [::1] is blocked (400)");

    // 5. Check 06: Form Input Validation
    const invalidPhonePayment = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/payment/ghana-initiate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      userPhone: "abc",
      network: "mtn",
      userEmail: "invalid-email"
    }));
    assert(invalidPhonePayment.statusCode === 400, "Check 06: Invalid phone/email in payment request returns 400");

    // 6. Check 20: Suppressed Stack Traces in 500 responses
    const invalidOgUrl = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/og-image?url=http://invalid-non-existent-domain-999xyz.site',
      method: 'GET'
    });
    assert(!invalidOgUrl.body.includes('Error:'), "Check 20: Error responses do not leak raw stack traces");

  } catch (err) {
    console.error("Test execution failed:", err);
  }

  console.log("====================================================");
  console.log(`AUDIT COMPLETE: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log("====================================================");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAudit();
