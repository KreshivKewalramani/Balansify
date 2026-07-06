import { createClient } from '@insforge/sdk';

const baseUrl = import.meta.env.VITE_INSFORGE_BASE_URL || 'https://hk36kn9p.us-east.insforge.app';
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY || '';

export const insforge = createClient({
  baseUrl,
  anonKey,
});

// Override the functions URL dynamically since the environment uses function2.insforge.app
const subdomain = baseUrl.match(/https?:\/\/([^.]+)/)?.[1] || 'hk36kn9p';
(insforge.functions as any).functionsUrl = `https://${subdomain}.function2.insforge.app`;
