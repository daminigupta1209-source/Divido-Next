import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────
// Server-side Gemini proxy. The Gemini key (GEMINI_API_KEY) lives only here;
// the client never sees it. Every request must carry a Supabase access token
// (Authorization: Bearer <token>), which is verified with auth.getUser.
//
// Request body: { kind, ... }
//   kind 'receipt' → { image: <base64>, mimeType }  → { title, amount, notes } | { error }
//   kind 'voice'   → { transcript, members[], me }   → { amount, title, payer, splitMode, splitters }
//   kind 'emoji'   → { title }                       → { emoji }
// Prompts are built here, so the endpoint can't be used as a general LLM.
// ─────────────────────────────────────────────────────────────────────────

const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const DEFAULT_APP_ORIGIN = 'https://divido-next.vercel.app';
// Capacitor WebView origins (Android uses https://localhost, iOS capacitor://localhost).
const NATIVE_ORIGINS = ['https://localhost', 'capacitor://localhost'];

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
// Client downscales to 1600px @ 0.85 JPEG, so real receipts are well under this.
const MAX_IMAGE_BASE64_CHARS = 4 * 1024 * 1024; // ~3 MB of image bytes
const MAX_BODY_BYTES = MAX_IMAGE_BASE64_CHARS + 64 * 1024;
const MAX_TRANSCRIPT_CHARS = 1000;
const MAX_TITLE_CHARS = 200;
const MAX_MEMBERS = 100;
const MAX_NAME_CHARS = 200;

function allowedOrigins() {
  const configured = [process.env.APP_ORIGIN, process.env.VITE_PUBLIC_APP_URL]
    .filter(Boolean)
    .map((o) => o.trim().replace(/\/+$/, ''));
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return new Set([DEFAULT_APP_ORIGIN, ...configured, ...extra, ...NATIVE_ORIGINS]);
}

/** Same deployment (incl. Vercel previews) or an allowlisted origin. */
function isOriginAllowed(origin, host) {
  if (!origin) return true; // non-browser caller; still has to pass auth
  if (host && origin === `https://${host}`) return true;
  return allowedOrigins().has(origin);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin, req.headers.host)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

async function verifyUser(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Server Supabase config is missing.');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(match[1].trim());
  if (error || !data?.user) return null;
  return data.user;
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

const RECEIPT_PROMPT = `First, analyze if this image is a valid receipt, invoice, bill, payment confirmation screen, or UPI payment screenshot.
If it is NOT a receipt/bill/payment screen (for example, if it is a phone home screen, a selfie, a landscape, or arbitrary text), return a JSON object with a key 'error' explaining that the image is not a receipt. Do not populate 'title', 'amount', or 'notes' in this case.

If it IS a valid receipt/bill, extract:
1. The merchant or store name (in Title Case, clean and short, e.g. 'McDonald's').
2. The grand total amount (as a clean number, e.g. 1250.50 or 55.00).
3. A brief summary of items as notes (e.g. 'Masala Dosa, Cold Coffee').

Return the output strictly as a JSON object. Do not include markdown formatting, backticks, or any conversational text. Examples:
If not a receipt: {"error": "This image appears to be a phone screen, not a receipt."}
If a valid receipt: {"title": "Sunrise Foods", "amount": 5445.30, "notes": "Grocery items, snacks"}`;

// Same shape the old client-side @google/generative-ai schema enforced.
const VOICE_SCHEMA = {
  type: 'object',
  properties: {
    amount: {
      type: 'number',
      description: "The total amount of the expense. E.g. for 'Rs 100', return 100.",
    },
    title: {
      type: 'string',
      description: "A short description of what the expense was for, e.g., 'noodles', 'taxi', 'dinner'.",
    },
    payer: {
      type: 'string',
      description: "The name or email of the person who paid. Default to 'ME' if the user says 'I paid'. Otherwise try to match a name from the group.",
    },
    splitMode: {
      type: 'string',
      description: "How the bill is split. Must be one of: 'EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES'. Default to 'EQUAL'.",
    },
    splitters: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of names/emails of people involved in the split. Leave empty if everyone is included.',
    },
  },
  required: ['amount', 'title', 'payer', 'splitMode', 'splitters'],
};

/** Validates the body and returns { model, payload, kind } or { error }. */
function buildRequest(body) {
  const kind = body?.kind || (body?.image ? 'receipt' : '');

  if (kind === 'receipt') {
    const image = body.image;
    const mimeType = body.mimeType || 'image/jpeg';
    if (typeof image !== 'string' || !image) return { error: 'Missing receipt image data' };
    if (image.length > MAX_IMAGE_BASE64_CHARS) return { error: 'Image is too large', status: 413 };
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return { error: 'Unsupported image type', status: 415 };
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(image)) return { error: 'Image must be base64' };
    return {
      kind,
      model: 'gemini-2.5-flash',
      payload: {
        contents: [{ parts: [{ text: RECEIPT_PROMPT }, { inlineData: { mimeType, data: image } }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
    };
  }

  if (kind === 'voice') {
    const transcript = str(body.transcript, MAX_TRANSCRIPT_CHARS).trim();
    if (!transcript) return { error: 'Missing transcript' };
    const me = str(body.me, MAX_NAME_CHARS);
    const members = Array.isArray(body.members)
      ? body.members.slice(0, MAX_MEMBERS).map((m) => str(m, MAX_NAME_CHARS)).filter(Boolean)
      : [];
    const groupMembersContext = members.length ? members.join(', ') : 'No group members';
    const prompt = `
    You are an AI assistant helping to log expenses in a bill-splitting app.

    The user is currently logged in as: ${me} (This maps to 'ME' or 'I').
    The current group members are: ${groupMembersContext}.

    The user said: "${transcript}"

    Extract the expense details. If the user says "I paid", set payer to "${me}".
    If they mention a name, try to match it to one of the group members.
    If they don't mention who paid, assume "${me}".
    If they don't mention how to split, assume "EQUAL".
  `;
    return {
      kind,
      model: 'gemini-2.5-flash',
      payload: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: VOICE_SCHEMA },
      },
    };
  }

  if (kind === 'emoji') {
    const title = str(body.title, MAX_TITLE_CHARS).trim();
    if (!title) return { error: 'Missing title' };
    return {
      kind,
      model: 'gemini-2.0-flash-lite',
      payload: {
        contents: [{
          parts: [{
            text: `Analyze the description of an expense and return EXACTLY ONE suitable emoji icon that represents it. Do not write any other text or explanation. Only return the emoji. Description: "${title}"`,
          }],
        }],
      },
    };
  }

  return { error: 'Unknown request kind' };
}

function parseJsonText(text) {
  try {
    return JSON.parse(text.trim());
  } catch {
    // Fallback in case response has trailing formatting or text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0].trim());
    throw new Error('Failed to parse Gemini output as JSON');
  }
}

export default async function handler(req, res) {
  setCors(req, res);

  if (!isOriginAllowed(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Request body too large' });
  }

  try {
    const user = await verifyUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const built = buildRequest(body);
    if (built.error) {
      return res.status(built.status || 400).json({ error: built.error });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server Gemini API key is not configured.' });
    }

    const response = await fetch(GEMINI_URL(built.model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(built.payload),
    });

    if (!response.ok) {
      // Log details server-side only; don't echo upstream errors to the client.
      console.error('Gemini API error:', response.status, await response.text());
      return res.status(502).json({ error: `Gemini API error: Status ${response.status}` });
    }

    const data = await response.json();
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      return res.status(502).json({ error: 'Empty response from Gemini API' });
    }

    if (built.kind === 'emoji') {
      return res.status(200).json({ emoji: textResponse.trim() });
    }
    return res.status(200).json(parseJsonText(textResponse));
  } catch (error) {
    console.error('Serverless scan error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
