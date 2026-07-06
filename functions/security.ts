export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token'
};

export const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
};

export async function computeHash(token: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkRateLimit(
  client: any,
  limitKey: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  try {
    const expiryTime = new Date(Date.now() - windowMs).toISOString();

    // Clean up old rate limits
    await client.database
      .from('rate_limits')
      .delete()
      .lt('last_request', expiryTime);

    // Fetch rate limit record
    const { data: record, error } = await client.database
      .from('rate_limits')
      .select('*')
      .eq('key', limitKey)
      .maybeSingle();

    if (error) {
      console.error('Rate limiter database error:', error);
      return true; // Fail open
    }

    if (!record) {
      await client.database
        .from('rate_limits')
        .insert([{ key: limitKey, last_request: new Date().toISOString(), request_count: 1 }]);
      return true;
    }

    // Check if time window has passed
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
    return true; // Fail open
  }
}

export function sanitizeText(text: string): string {
  if (!text) return '';
  let sanitized = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*(['"])(.*?)\1/gi, '');
  sanitized = sanitized.replace(/javascript\s*:\s*\S+/gi, '');
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  return sanitized;
}

export function handleBackendError(err: any): Response {
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

export function getVerificationHeaders(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
  const csrfToken = req.headers.get('X-CSRF-Token');
  return { userToken, csrfToken };
}
