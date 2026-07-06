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

function sanitizeText(text: string): string {
  if (!text) return '';
  let sanitized = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*(['"])(.*?)\1/gi, '');
  sanitized = sanitized.replace(/javascript\s*:\s*\S+/gi, '');
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  return sanitized;
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

    // 1. Verify Anti-CSRF Token
    const expectedCsrf = await computeHash(userToken);
    if (!csrfToken || csrfToken !== expectedCsrf) {
      return new Response(JSON.stringify({ error: 'Forbidden: CSRF verification failed' }), {
        status: 403,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Enforce Rate Limit (Max 10 file uploads per minute per user)
    const rateLimitKey = `${userData.user.id}:ingestLedger`;
    const isAllowed = await checkRateLimit(client, rateLimitKey, 10, 60000);
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }), {
        status: 429,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Extract and Validate File Input
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return new Response(JSON.stringify({ error: 'Bad Request: Missing file field' }), {
        status: 400,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Strict File Size Check: Max 5MB
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: 'Payload Too Large: File size exceeds the 5MB limit.' }), {
        status: 413,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Strict Mime-Type & Extension Check
    const allowedExtensions = ['.txt', '.csv'];
    const fileNameLower = file.name.toLowerCase();
    const isAllowedExtension = allowedExtensions.some(ext => fileNameLower.endsWith(ext));
    const isAllowedMime = file.type === 'text/plain' || file.type === 'text/csv' || file.type === 'application/octet-stream';

    if (!isAllowedExtension || !isAllowedMime) {
      return new Response(JSON.stringify({ error: 'Unsupported Media Type: Only .txt and .csv files are allowed.' }), {
        status: 415,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Read and Sanitize File Content (XSS Protection)
    const rawText = await file.text();
    const sanitizedText = sanitizeText(rawText);

    // 5. Upload Sanitized content to 'transactions' Storage Bucket
    const secureBlob = new Blob([sanitizedText], { type: 'text/plain' });
    const { data: uploadData, error: uploadError } = await client.storage
      .from('transactions')
      .uploadAuto(secureBlob);

    if (uploadError || !uploadData) {
      return new Response(JSON.stringify({ error: `Storage upload failed: ${uploadError?.message || 'Unknown error'}` }), {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 6. Perform single-pass AI parsing of all transactions in the file
    const prompt = `Identify transaction parameters from these accounting statements.
Return ONLY a valid JSON array of objects. Do NOT wrap in \`\`\`json markdown blocks, html blocks, or include comments or explanations.
Each object must match this structure exactly:
{
  "debitAccount": "Name of debited account (capitalized, e.g. 'Cash A/c')",
  "creditAccount": "Name of credited account (capitalized, e.g. 'Sales A/c')",
  "amount": number,
  "narration": "Being standard narration string"
}

Statements:
${sanitizedText}`;

    const aiResponse = await client.ai.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    });

    const parsedContent = aiResponse?.choices?.[0]?.message?.content || '[]';
    const cleanJson = parsedContent.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    let stagedTransactions = [];
    try {
      stagedTransactions = JSON.parse(cleanJson);
      stagedTransactions = stagedTransactions.map((tx: any) => ({
        ...tx,
        date: new Date().toISOString()
      }));
    } catch (parseError) {
      console.error('AI JSON parsing error:', parseError, parsedContent);
      return new Response(JSON.stringify({ error: 'AI parsing failed to output valid transaction JSON.' }), {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      stagedTransactions,
      fileKey: uploadData.key,
      fileName: file.name
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        ...securityHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (err: any) {
    return handleBackendError(err);
  }
}
