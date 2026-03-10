// netlify/functions/ai.js
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle browser CORS preflight requests in local/dev environments.
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...headers, Allow: 'POST, OPTIONS' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: 'PARSE_ERROR', message: 'Invalid request body' })
    };
  }

  const { prompt, maxTokens = 1000, apiKey, provider = 'gemini' } = body;

  if (!prompt) {
    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: 'NO_PROMPT', message: 'No prompt provided' })
    };
  }

  if (!apiKey) {
    return {
      statusCode: 401, headers,
      body: JSON.stringify({
        error: 'NO_KEY',
        message: 'No API key found. Please add your key in Settings ⚙️'
      })
    };
  }

  try {
    let text = '';

    // ── GOOGLE GEMINI ──────────────────────────────
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.4
          }
        })
      });

      const data = await resp.json();

      if (!resp.ok) {
        const msg = data.error?.message || `Gemini error ${resp.status}`;
        const isKeyError = resp.status === 400 || resp.status === 403;
        return {
          statusCode: resp.status, headers,
          body: JSON.stringify({
            error: isKeyError ? 'INVALID_KEY' : 'API_ERROR',
            message: isKeyError
              ? 'Gemini API key invalid or expired. Get a new one at aistudio.google.com'
              : msg
          })
        };
      }

      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // ── GROQ ───────────────────────────────────────
    else if (provider === 'groq') {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model:       'llama-3.1-8b-instant',
          messages:    [{ role: 'user', content: prompt }],
          max_tokens:  maxTokens,
          temperature: 0.4
        })
      });

      const data = await resp.json();

      if (!resp.ok) {
        const msg = data.error?.message || `Groq error ${resp.status}`;
        return {
          statusCode: resp.status, headers,
          body: JSON.stringify({
            error: resp.status === 401 ? 'INVALID_KEY' : 'API_ERROR',
            message: resp.status === 401
              ? 'Groq key invalid, revoked, or from a different provider. Create a Groq key at console.groq.com/keys'
              : msg
          })
        };
      }

      text = data.choices?.[0]?.message?.content || '';
    }

    // ── OPENAI ─────────────────────────────────────
    else if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model:       'gpt-3.5-turbo',
          messages:    [{ role: 'user', content: prompt }],
          max_tokens:  maxTokens,
          temperature: 0.4
        })
      });

      const data = await resp.json();

      if (!resp.ok) {
        const msg = data.error?.message || `OpenAI error ${resp.status}`;
        return {
          statusCode: resp.status, headers,
          body: JSON.stringify({
            error: resp.status === 401 ? 'INVALID_KEY' : 'API_ERROR',
            message: resp.status === 401
              ? 'OpenAI key invalid or expired. Check platform.openai.com'
              : msg
          })
        };
      }

      text = data.choices?.[0]?.message?.content || '';
    }

    else {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${provider}` })
      };
    }

    if (!text) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'EMPTY_RESPONSE', message: 'AI returned an empty response' })
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };

  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'SERVER_ERROR', message: err.message })
    };
  }
};

