const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS manual — resolve todos os casos incluindo preflight ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '20mb' }));

// ─── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'HealthLog Backend',
    version: '1.1.0',
    anthropic_key: process.env.ANTHROPIC_API_KEY ? 'configurada ✓' : 'AUSENTE ✗',
  });
});

// ─── ANTHROPIC PROXY ──────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('[claude] ANTHROPIC_API_KEY não definida');
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' });
  }

  if (!req.body || !req.body.messages) {
    return res.status(400).json({ error: 'Body inválido — campo messages obrigatório.' });
  }

  console.log(`[claude] modelo: ${req.body.model}, mensagens: ${req.body.messages.length}`);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();

    console.log(`[claude] status Anthropic: ${response.status}`);

    if (!response.ok) {
      console.error('[claude] erro Anthropic:', text);
      return res.status(response.status).json({ error: text });
    }

    res.setHeader('Content-Type', 'application/json');
    res.send(text);

  } catch (err) {
    console.error('[claude] exceção:', err.message);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

// ─── OURA PROXY ───────────────────────────────────────────────
app.get('/api/oura/:endpoint', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  const query = new URLSearchParams(req.query).toString();
  const url = `https://api.ouraring.com/v2/usercollection/${req.params.endpoint}${query ? '?' + query : ''}`;

  try {
    const response = await fetch(url, { headers: { Authorization: token } });
    const data = await response.text();
    res.status(response.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro Oura: ' + err.message });
  }
});

// ─── SPOTIFY PROXY ────────────────────────────────────────────
app.get('/api/spotify/recent', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  try {
    const response = await fetch(
      'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      { headers: { Authorization: token } }
    );
    const data = await response.text();
    res.status(response.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro Spotify: ' + err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`HealthLog Backend v1.1 rodando na porta ${PORT}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'OK' : 'NÃO DEFINIDA'}`);
});
