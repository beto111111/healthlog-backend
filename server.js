const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' })); // suporte a fotos em base64
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*', // defina o domínio do seu PWA depois
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'HealthLog Backend', version: '1.0.0' });
});

// ─── ANTHROPIC PROXY ──────────────────────────────────────────
// O frontend envia a chamada aqui → o backend repassa para a Anthropic
// Isso resolve o CORS bloqueado pelo navegador
app.post('/api/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' });
  }

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

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    res.json(data);
  } catch (err) {
    console.error('Erro ao chamar Anthropic:', err);
    res.status(500).json({ error: 'Erro interno ao chamar a API de IA.' });
  }
});

// ─── OURA PROXY (futuro — quando a Oura liberar CORS) ──────────
// Rota pronta para quando quisermos reativar sync automático
app.get('/api/oura/:endpoint', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  const { endpoint } = req.params;
  const query = new URLSearchParams(req.query).toString();
  const url = `https://api.ouraring.com/v2/usercollection/${endpoint}${query ? '?' + query : ''}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: token },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Erro Oura:', err);
    res.status(500).json({ error: 'Erro ao buscar dados do Oura.' });
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
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar dados do Spotify.' });
  }
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`HealthLog Backend rodando na porta ${PORT}`);
});
