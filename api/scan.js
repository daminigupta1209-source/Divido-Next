export default async function handler(req, res) {
  // Set CORS headers so localhost testing works if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Missing receipt image data' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server Gemini API key is not configured.' });
    }

    // Explicitly instruct Gemini to support multilingual receipts and handwritten text
    const prompt = `First, analyze if this image is a valid receipt, invoice, bill, payment confirmation screen, or UPI payment screenshot.
If it is NOT a receipt/bill/payment screen (for example, if it is a phone home screen, a selfie, a landscape, or arbitrary text), return a JSON object with a key 'error' explaining that the image is not a receipt. Do not populate 'title', 'amount', or 'notes' in this case.

If it IS a valid receipt/bill, extract:
1. The merchant or store name (in Title Case, clean and short, e.g. 'McDonald's').
2. The grand total amount (as a clean number, e.g. 1250.50 or 55.00).
3. A brief summary of items as notes (e.g. 'Masala Dosa, Cold Coffee').

Return the output strictly as a JSON object. Do not include markdown formatting, backticks, or any conversational text. Examples:
If not a receipt: {"error": "This image appears to be a phone screen, not a receipt."}
If a valid receipt: {"title": "Sunrise Foods", "amount": 5445.30, "notes": "Grocery items, snacks"}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: image
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Gemini API error: ${errText}` });
    }

    const data = await response.json();
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      return res.status(500).json({ error: 'Empty response from Gemini API' });
    }

    // Parse extracted text to verify it is valid JSON
    let parsedResult;
    try {
      parsedResult = JSON.parse(textResponse.trim());
    } catch (e) {
      // Fallback in case response has trailing formatting or text
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0].trim());
      } else {
        throw new Error('Failed to parse Gemini output as JSON');
      }
    }

    return res.status(200).json(parsedResult);
  } catch (error) {
    console.error('Serverless scan error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
