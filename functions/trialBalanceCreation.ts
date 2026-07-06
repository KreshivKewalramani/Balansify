import { createClient } from 'npm:@insforge/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token'
};

const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
};

async function computeHash(token: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkRateLimit(
  client: any,
  limitKey: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  try {
    const expiryTime = new Date(Date.now() - windowMs).toISOString();

    await client.database
      .from('rate_limits')
      .delete()
      .lt('last_request', expiryTime);

    const { data: record, error } = await client.database
      .from('rate_limits')
      .select('*')
      .eq('key', limitKey)
      .maybeSingle();

    if (error) {
      console.error('Rate limiter database error:', error);
      return true;
    }

    if (!record) {
      await client.database
        .from('rate_limits')
        .insert([{ key: limitKey, last_request: new Date().toISOString(), request_count: 1 }]);
      return true;
    }

    const lastReqTime = new Date(record.last_request).getTime();
    if (Date.now() - lastReqTime > windowMs) {
      await client.database
        .from('rate_limits')
        .update({ request_count: 1, last_request: new Date().toISOString() })
        .eq('key', limitKey);
      return true;
    }

    if (record.request_count >= maxRequests) {
      return false;
    }

    await client.database
      .from('rate_limits')
      .update({ request_count: record.request_count + 1, last_request: new Date().toISOString() })
      .eq('key', limitKey);

    return true;
  } catch (err) {
    console.error('Error checking rate limit:', err);
    return true;
  }
}

function handleBackendError(err: any): Response {
  console.error('Secure Logged Backend Error:', err);
  return new Response(
    JSON.stringify({
      error: 'An unexpected internal error occurred. Please try again later.'
    }),
    {
      status: 500,
      headers: {
        ...corsHeaders,
        ...securityHeaders,
        'Content-Type': 'application/json'
      }
    }
  );
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
    const csrfToken = req.headers.get('X-CSRF-Token');

    if (!userToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), { 
        status: 401, 
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const client = createClient({
      baseUrl: Deno.env.get('INSFORGE_BASE_URL') || '',
      edgeFunctionToken: userToken
    });

    const { data: userData } = await client.auth.getCurrentUser();
    if (!userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid session' }), { 
        status: 401, 
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 1. CSRF Protection
    const expectedCsrf = await computeHash(userToken);
    if (!csrfToken || csrfToken !== expectedCsrf) {
      return new Response(JSON.stringify({ error: 'Forbidden: CSRF verification failed' }), { 
        status: 403, 
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 2. Rate Limiting (60 requests per minute per user)
    const rateLimitKey = `${userData.user.id}:trialBalanceCreation`;
    const isAllowed = await checkRateLimit(client, rateLimitKey, 60, 60000);
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }), { 
        status: 429, 
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 3. Database query
    const { data: entries, error } = await client.database
      .from('journal_entries')
      .select('*')
      .eq('user_id', userData.user.id);

    if (error) {
      throw error;
    }

    const accountBalances: Record<string, { debits: number, credits: number }> = {};

    (entries || []).forEach((entry: any) => {
      const dr = entry.debit_account.trim();
      const cr = entry.credit_account.trim();
      const amt = Number(entry.amount);

      if (!accountBalances[dr]) accountBalances[dr] = { debits: 0, credits: 0 };
      if (!accountBalances[cr]) accountBalances[cr] = { debits: 0, credits: 0 };

      accountBalances[dr].debits += amt;
      accountBalances[cr].credits += amt;
    });

    const trialBalance: any[] = [];
    let slNo = 1;

    Object.entries(accountBalances).forEach(([accountName, bal]) => {
      const netDebits = bal.debits - bal.credits;
      let debitBalance = 0;
      let creditBalance = 0;

      if (netDebits > 0) {
        debitBalance = netDebits;
      } else if (netDebits < 0) {
        creditBalance = Math.abs(netDebits);
      }

      if (debitBalance !== 0 || creditBalance !== 0) {
        trialBalance.push({
          slNo: slNo++,
          accountName,
          debitBalance,
          creditBalance,
          lf: 'L-' + (slNo + 10)
        });
      }
    });

    return new Response(JSON.stringify({ trialBalance }), {
      status: 200,
      headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return handleBackendError(err);
  }
}
