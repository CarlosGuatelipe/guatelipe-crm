// ---------------------------------------------------------------------------
// Guatelipe CRM — Backend de integração com a API oficial do Instagram (Meta)
//
// O que este servidor faz:
//   1. OAuth: leva o usuário ao login da Meta e recebe o token de acesso.
//   2. Troca o token curto por um token de longa duração (60 dias) e o guarda.
//   3. Webhook: recebe mensagens do Direct do Instagram e cria leads.
//   4. Expõe /api/leads para o CRM (front-end) puxar os leads capturados.
//
// Segurança: o App Secret NUNCA vai para o front-end. Ele fica só aqui, no
// servidor, lido de variáveis de ambiente (.env / painel de hospedagem).
// ---------------------------------------------------------------------------
import express from 'express';
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  saveToken, getToken, addLead, getLeads, markSeen, pullNewLeads,
} from './store.js';

// Carrega o arquivo .env local (sem dependências). Em hospedagem (Render,
// Railway, etc.) as variáveis vêm do painel, então o arquivo pode nem existir.
(function loadEnv() {
  try {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env');
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch { /* ignora */ }
})();

const {
  PORT = 3000,
  APP_ID,
  APP_SECRET,
  REDIRECT_URI,               // ex.: https://seu-backend.onrender.com/auth/instagram/callback
  WEBHOOK_VERIFY_TOKEN,       // string que você inventa e repete no painel da Meta
  CRM_API_KEY,                // chave que o front-end usa para puxar leads
  GRAPH_VERSION = 'v21.0',
  SCOPES = 'instagram_basic,instagram_manage_messages,pages_show_list,pages_manage_metadata,business_management',
  ALLOWED_ORIGIN = '*',       // domínio do CRM; em produção coloque a URL exata
} = process.env;

const app = express();

// Guarda o corpo bruto para validar a assinatura do webhook.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// CORS simples para o front-end conseguir chamar /api/leads.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const requiredEnv = ['APP_ID', 'APP_SECRET', 'REDIRECT_URI', 'WEBHOOK_VERIFY_TOKEN', 'CRM_API_KEY'];
const missing = requiredEnv.filter((k) => !process.env[k]);

// ---------------------------------------------------------------------------
// Saúde / status
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true, missingEnv: missing }));

app.get('/api/status', (req, res) => {
  if (req.header('x-api-key') !== CRM_API_KEY) return res.status(401).json({ error: 'unauthorized' });
  const token = getToken();
  res.json({
    connected: Boolean(token),
    account: token?.username || token?.userId || null,
    updatedAt: token?.updatedAt || null,
    leadsCapturados: getLeads().length,
    configPendente: missing,
  });
});

// ---------------------------------------------------------------------------
// 1) Início do OAuth — redireciona para o login da Meta
// ---------------------------------------------------------------------------
app.get('/auth/instagram', (_req, res) => {
  if (missing.length) return res.status(500).send(`Configuração incompleta. Falta definir: ${missing.join(', ')}`);
  const url = new URL('https://www.facebook.com/' + GRAPH_VERSION + '/dialog/oauth');
  url.searchParams.set('client_id', APP_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', crypto.randomBytes(8).toString('hex'));
  res.redirect(url.toString());
});

// ---------------------------------------------------------------------------
// 2) Callback do OAuth — troca "code" por token e guarda
// ---------------------------------------------------------------------------
app.get('/auth/instagram/callback', async (req, res) => {
  const { code, error, error_description: errDesc } = req.query;
  if (error) return res.status(400).send(`Erro no login da Meta: ${error} — ${errDesc || ''}`);
  if (!code) return res.status(400).send('Faltou o parâmetro "code".');

  try {
    // 2a) code -> token de curta duração
    const shortUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    shortUrl.searchParams.set('client_id', APP_ID);
    shortUrl.searchParams.set('client_secret', APP_SECRET);
    shortUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    shortUrl.searchParams.set('code', code);
    const shortResp = await fetch(shortUrl).then((r) => r.json());
    if (shortResp.error) throw new Error(JSON.stringify(shortResp.error));

    // 2b) token curto -> token de longa duração (60 dias)
    const longUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', APP_ID);
    longUrl.searchParams.set('client_secret', APP_SECRET);
    longUrl.searchParams.set('fb_exchange_token', shortResp.access_token);
    const longResp = await fetch(longUrl).then((r) => r.json());
    const accessToken = longResp.access_token || shortResp.access_token;

    // 2c) descobre a Página e a conta do Instagram vinculada
    let username = null; let igId = null; let pageId = null;
    try {
      const pages = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=name,id,access_token,instagram_business_account{id,username}&access_token=${accessToken}`,
      ).then((r) => r.json());
      const page = pages.data?.find((p) => p.instagram_business_account) || pages.data?.[0];
      if (page) {
        pageId = page.id;
        igId = page.instagram_business_account?.id || null;
        username = page.instagram_business_account?.username || null;
      }
    } catch { /* segue mesmo sem descobrir o username */ }

    saveToken({
      access_token: accessToken,
      expires_in: longResp.expires_in || null,
      username, userId: igId, pageId,
    });

    res.send(`<html lang="pt-BR"><body style="font-family:system-ui;background:#050505;color:#fff;text-align:center;padding:60px">
      <h1>✅ Instagram conectado</h1>
      <p>Conta: <strong>${username ? '@' + username : igId || 'vinculada'}</strong></p>
      <p>Você já pode fechar esta aba e voltar ao CRM.</p>
    </body></html>`);
  } catch (e) {
    res.status(500).send('Falha ao obter token: ' + e.message);
  }
});

// ---------------------------------------------------------------------------
// 3) Webhook do Instagram
// ---------------------------------------------------------------------------
// 3a) Verificação (GET) — a Meta chama uma vez ao cadastrar o webhook.
app.get('/webhooks/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// 3b) Recebimento (POST) — mensagens do Direct chegam aqui.
app.post('/webhooks/instagram', (req, res) => {
  // Valida a assinatura para garantir que veio mesmo da Meta.
  if (!verifySignature(req)) return res.sendStatus(401);
  res.sendStatus(200); // responde rápido; processa depois

  try {
    const body = req.body;
    if (body.object !== 'instagram') return;
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const messageId = event.message?.mid;
        const isEcho = event.message?.is_echo; // mensagem enviada por você mesmo
        const text = event.message?.text;
        const senderId = event.sender?.id;
        if (isEcho || !text || !senderId) continue;
        if (!markSeen(messageId)) continue; // já processado

        addLead({
          id: cryptoRandomId(),
          name: 'Instagram ' + String(senderId).slice(-4),
          company: '',
          email: '',
          phone: '',
          instagram: 'IGSID:' + senderId,
          service: 'A definir',
          source: 'Instagram',
          status: 'Novo lead',
          value: 0,
          nextAction: '',
          notes: 'Mensagem do Direct: "' + text + '"',
          receivedAt: new Date().toISOString(),
          pulled: false,
        });
      }
    }
  } catch (e) {
    console.error('Erro ao processar webhook:', e);
  }
});

function verifySignature(req) {
  const signature = req.header('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function cryptoRandomId() {
  return 'ig-' + crypto.randomBytes(8).toString('hex');
}

// ---------------------------------------------------------------------------
// 4) API para o CRM (front-end) puxar os leads capturados
// ---------------------------------------------------------------------------
app.get('/api/leads', (req, res) => {
  if (req.header('x-api-key') !== CRM_API_KEY) return res.status(401).json({ error: 'unauthorized' });
  // ?all=1 devolve todos; padrão devolve só os ainda não importados.
  const leads = req.query.all ? getLeads() : pullNewLeads();
  res.json({ leads });
});

app.listen(PORT, () => {
  console.log(`Guatelipe CRM backend rodando na porta ${PORT}`);
  if (missing.length) console.warn('⚠️  Variáveis de ambiente faltando:', missing.join(', '));
});
