# HealthLog Backend

Servidor Node.js que funciona como proxy entre o PWA e as APIs externas (Anthropic, Oura, Spotify), resolvendo o bloqueio de CORS do navegador.

---

## 🚀 Deploy no Render (gratuito, ~5 minutos)

### Passo 1 — Criar repositório no GitHub para o backend

1. Acesse **github.com** → **New repository**
2. Nome: `healthlog-backend`
3. **Public** → Create repository
4. Faça upload dos arquivos desta pasta (`server.js`, `package.json`, `render.yaml`, `.gitignore`)

### Passo 2 — Criar conta no Render

1. Acesse **render.com**
2. Clique em **"Get Started for Free"**
3. Conecte com sua conta do **GitHub**

### Passo 3 — Criar o serviço

1. No dashboard do Render → **"New +"** → **"Web Service"**
2. Conecte o repositório `healthlog-backend`
3. Render detecta automaticamente Node.js — clique em **"Create Web Service"**

### Passo 4 — Configurar variáveis de ambiente

No painel do serviço → **"Environment"** → adicione:

| Variável | Valor |
|----------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (sua key da Anthropic) |
| `ALLOWED_ORIGIN` | `https://beto111111.github.io` (URL do seu GitHub Pages) |

### Passo 5 — Pegar a URL do backend

Após o deploy (~2 min), o Render gera uma URL tipo:
```
https://healthlog-backend.onrender.com
```

Copie essa URL — você vai colar no app.

### Passo 6 — Atualizar o PWA

No arquivo `index.html` do seu repositório do GitHub Pages, procure por:
```javascript
const BACKEND_URL = 'SEU_BACKEND_URL_AQUI';
```
E substitua pela URL do Render.

---

## ⚠️ Limitação do free tier do Render

O plano gratuito do Render **hiberna após 15 minutos de inatividade** — a primeira requisição após esse período demora ~30 segundos para "acordar" o servidor.

Para um protótipo pessoal isso é completamente aceitável. Para evitar, você pode:
- Usar um serviço como **UptimeRobot** (gratuito) para fazer ping a cada 10 min
- Ou upgrade para o plano pago ($7/mês) quando quiser

---

## 🔌 Rotas disponíveis

| Rota | Método | Descrição |
|------|--------|-----------|
| `GET /` | GET | Health check |
| `POST /api/claude` | POST | Proxy para Anthropic API |
| `GET /api/oura/:endpoint` | GET | Proxy para Oura API (futuro) |
| `GET /api/spotify/recent` | GET | Proxy para Spotify (futuro) |

---

## 🔒 Segurança

- A `ANTHROPIC_API_KEY` fica **apenas no servidor** — nunca exposta no frontend
- O `ALLOWED_ORIGIN` restringe quem pode chamar o backend
- Nenhum dado do usuário é armazenado no servidor
