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
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization token' }), {
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
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = userData.user.id;

    // 1. CSRF Protection
    const expectedCsrf = await computeHash(userToken);
    if (!csrfToken || csrfToken !== expectedCsrf) {
      return new Response(JSON.stringify({ error: 'Forbidden: CSRF verification failed' }), { 
        status: 403, 
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 2. Aggressive Rate Limiting (5 requests per minute per user)
    const rateLimitKey = `${userId}:generateInsights`;
    const isAllowed = await checkRateLimit(client, rateLimitKey, 5, 60000);
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. AI Insights is rate-limited to 5 requests per minute.' }), { 
        status: 429, 
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 3. Database query
    const { data: records, error: dbError } = await client.database
      .from('financial_records')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (dbError) {
      throw dbError;
    }

    if (!records || records.length === 0) {
      return new Response(JSON.stringify({ 
        insight: 'No financial records found in the database. Please enter and save some records first.' 
      }), {
        status: 200,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    const record = records[0];

    const cogs = Number(record.cost_of_goods_sold || 0);
    const interest = Number(record.interest_expense || 0);
    const totalExpenses = cogs + interest;
    const revenue = Number(record.revenue || 0);
    const netProfit = Number(record.net_profit || 0);

    const prompt = `You are a Senior Financial Advisor. Review this company's expense structure based on the following metrics:
- Company: ${record.company_name} (FY ${record.fiscal_year})
- Total Revenue: ₹${revenue.toLocaleString('en-IN')}
- Net Profit: ₹${netProfit.toLocaleString('en-IN')}
- Cost of Goods Sold (COGS): ₹${cogs.toLocaleString('en-IN')} (${((cogs / (revenue || 1)) * 100).toFixed(1)}% of Revenue)
- Interest Expense: ₹${interest.toLocaleString('en-IN')} (${((interest / (revenue || 1)) * 100).toFixed(1)}% of Revenue)
- Total Direct Expenses (COGS + Interest): ₹${totalExpenses.toLocaleString('en-IN')} (${((totalExpenses / (revenue || 1)) * 100).toFixed(1)}% of Revenue)

Write an extremely short diagnostic expense review. Strictly limit the output to max 4-5 lines of text total.
Do NOT use headings, bullet lists, or introduction phrases. Do NOT use the word 'HTML'. 
Use double asterisks (**) to bold important metrics or findings.
Structure exactly as:
Line 1-2 (Status): Describe the expense-to-revenue efficiency and whether expenses are well-managed.
Line 3-4 (Suggestions): Suggest 2 concrete, actionable steps to immediately reduce COGS or interest overheads.`;

    const aiResponse = await client.ai.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    });

    const insight = aiResponse?.choices?.[0]?.message?.content || 'No insight could be generated.';

    return new Response(JSON.stringify({ insight }), {
      status: 200,
      headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return handleBackendError(err);
  }
}
