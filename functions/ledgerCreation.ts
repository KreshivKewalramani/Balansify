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
    const rateLimitKey = `${userData.user.id}:ledgerCreation`;
    const isAllowed = await checkRateLimit(client, rateLimitKey, 60, 60000);
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }), { 
        status: 429, 
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 3. Database operation
    const { data: entries, error } = await client.database
      .from('journal_entries')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('date', { ascending: true });

    if (error) {
      throw error;
    }

    const ledgers: Record<string, { debits: any[], credits: any[] }> = {};

    (entries || []).forEach((entry: any) => {
      const drAcc = entry.debit_account.trim();
      const crAcc = entry.credit_account.trim();
      const amt = Number(entry.amount);

      if (!ledgers[drAcc]) ledgers[drAcc] = { debits: [], credits: [] };
      if (!ledgers[crAcc]) ledgers[crAcc] = { debits: [], credits: [] };

      ledgers[drAcc].debits.push({
        id: entry.id + '-dr',
        date: entry.date,
        particular: `To, ${crAcc}`,
        amount: amt,
        jf: 'J-1'
      });

      ledgers[crAcc].credits.push({
        id: entry.id + '-cr',
        date: entry.date,
        particular: `By, ${drAcc}`,
        amount: amt,
        jf: 'J-1'
      });
    });

    return new Response(JSON.stringify({ ledgers }), {
      status: 200,
      headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return handleBackendError(err);
  }
}
