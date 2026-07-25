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
  // Permissões do "Instagram API com login do Instagram" (modelo novo da Meta).
  SCOPES = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments',
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
// Páginas públicas (exigidas pela Meta para publicar o app)
// ---------------------------------------------------------------------------
const pageShell = (title, body) => `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Guatelipe CRM</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:760px;margin:0 auto;padding:40px 22px;line-height:1.65;color:#1a1a1a;background:#fff}
h1{font-size:26px;margin-bottom:4px}h2{font-size:18px;margin-top:28px}small{color:#666}a{color:#2563eb}</style>
</head><body>${body}</body></html>`;

app.get('/', (_req, res) => res.type('html').send(pageShell('Backend',
  `<h1>Guatelipe CRM — API</h1>
   <p>Servidor da integração com o Instagram em funcionamento.</p>
   <p><small>Este endereço é uma API, não um site. Endpoints públicos:
   <a href="/health">/health</a> · <a href="/privacy">/privacy</a> ·
   <a href="/data-deletion">/data-deletion</a></small></p>`)));

app.get('/privacy', (_req, res) => res.type('html').send(pageShell('Política de Privacidade',
  `<h1>Política de Privacidade</h1>
   <small>Guatelipe Web Development · Atualizado em 25 de julho de 2026</small>

   <h2>1. Quem somos</h2>
   <p>O Guatelipe CRM é uma ferramenta usada pela Guatelipe Web Development para
   gerenciar contatos comerciais (leads). Contato:
   <a href="mailto:guatelipedev@gmail.com">guatelipedev@gmail.com</a>.</p>

   <h2>2. Dados que coletamos</h2>
   <p>Quando você nos envia uma mensagem pelo Instagram Direct, coletamos, por meio
   da API oficial da Meta, o seguinte: identificador da sua conta do Instagram,
   nome de usuário (@) e o conteúdo da mensagem enviada. Não coletamos senhas nem
   dados de pagamento.</p>

   <h2>3. Para que usamos</h2>
   <p>Usamos esses dados exclusivamente para registrar e responder ao seu contato
   comercial dentro do nosso CRM (atendimento e propostas). Não vendemos nem
   compartilhamos seus dados com terceiros para fins de marketing.</p>

   <h2>4. Armazenamento e segurança</h2>
   <p>Os dados ficam armazenados em servidor próprio com acesso restrito por chave
   e conexão segura (HTTPS). Mantemos apenas o necessário para o atendimento.</p>

   <h2>5. Seus direitos e exclusão de dados</h2>
   <p>Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer
   momento pelo e-mail acima. Veja também as instruções em
   <a href="/data-deletion">/data-deletion</a>.</p>

   <h2>6. Alterações</h2>
   <p>Esta política pode ser atualizada. A data no topo indica a última revisão.</p>`)));

app.get('/data-deletion', (_req, res) => res.type('html').send(pageShell('Exclusão de dados',
  `<h1>Instruções de exclusão de dados</h1>
   <small>Guatelipe Web Development</small>
   <p>Para solicitar a exclusão dos seus dados coletados pelo Guatelipe CRM
   (mensagens e informações de contato do Instagram), envie um e-mail para
   <a href="mailto:guatelipedev@gmail.com">guatelipedev@gmail.com</a> com o assunto
   <strong>"Exclusão de dados"</strong> e o seu @ do Instagram.</p>
   <p>Processaremos a exclusão em até 30 dias e confirmaremos por e-mail.</p>`)));

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
// 1) Início do OAuth — login do Instagram (Instagram API with Instagram Login)
// APP_ID/APP_SECRET aqui são o "Instagram app ID" e "Instagram app secret".
// ---------------------------------------------------------------------------
app.get('/auth/instagram', (_req, res) => {
  if (missing.length) return res.status(500).send(`Configuração incompleta. Falta definir: ${missing.join(', ')}`);
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', APP_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', crypto.randomBytes(8).toString('hex'));
  res.redirect(url.toString());
});

// ---------------------------------------------------------------------------
// 2) Callback do OAuth — troca "code" por token de longa duração e guarda
// ---------------------------------------------------------------------------
app.get('/auth/instagram/callback', async (req, res) => {
  const { code, error, error_description: errDesc } = req.query;
  if (error) return res.status(400).send(`Erro no login do Instagram: ${error} — ${errDesc || ''}`);
  if (!code) return res.status(400).send('Faltou o parâmetro "code".');

  try {
    // 2a) code -> token de curta duração (POST form-encoded)
    const form = new URLSearchParams();
    form.set('client_id', APP_ID);
    form.set('client_secret', APP_SECRET);
    form.set('grant_type', 'authorization_code');
    form.set('redirect_uri', REDIRECT_URI);
    form.set('code', String(code));
    const shortResp = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST', body: form,
    }).then((r) => r.json());
    if (shortResp.error_type || shortResp.error) throw new Error(JSON.stringify(shortResp));
    // resposta pode vir como objeto único ou dentro de "data"
    const first = Array.isArray(shortResp.data) ? shortResp.data[0] : shortResp;
    const shortToken = first.access_token;
    let igId = first.user_id || null;

    // 2b) token curto -> token de longa duração (60 dias)
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', APP_SECRET);
    longUrl.searchParams.set('access_token', shortToken);
    const longResp = await fetch(longUrl).then((r) => r.json());
    const accessToken = longResp.access_token || shortToken;

    // 2c) descobre o @usuário
    let username = null;
    try {
      const me = await fetch(
        `https://graph.instagram.com/me?fields=user_id,username&access_token=${accessToken}`,
      ).then((r) => r.json());
      username = me.username || null;
      igId = me.user_id || igId;
    } catch { /* segue mesmo sem descobrir o username */ }

    saveToken({
      access_token: accessToken,
      expires_in: longResp.expires_in || null,
      username, userId: igId,
    });

    // 2d) inscreve o app para receber webhooks de mensagens desta conta
    try {
      const sub = await fetch(
        `https://graph.instagram.com/${GRAPH_VERSION}/me/subscribed_apps?subscribed_fields=messages&access_token=${accessToken}`,
        { method: 'POST' },
      ).then((r) => r.json());
      console.log('[connect] subscribed_apps ->', JSON.stringify(sub));
    } catch (e) { console.log('[connect] subscribed_apps falhou:', e.message); }

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
  const sigOk = verifySignature(req);
  console.log('[webhook] recebido | assinatura:', sigOk ? 'OK' : 'INVALIDA',
    '| body:', JSON.stringify(req.body).slice(0, 600));
  // Valida a assinatura para garantir que veio mesmo da Meta.
  if (!sigOk) return res.sendStatus(401);
  res.sendStatus(200); // responde rápido; processa depois

  try {
    const body = req.body;
    if (body.object !== 'instagram') { console.log('[webhook] object diferente de instagram:', body.object); return; }
    for (const entry of body.entry || []) {
      // Alguns eventos chegam em "entry.messaging", outros em "entry.changes".
      const events = entry.messaging || entry.changes?.map((c) => c.value) || [];
      for (const event of events) {
        const messageId = event.message?.mid;
        const isEcho = event.message?.is_echo; // mensagem enviada por você mesmo
        const text = event.message?.text;
        const senderId = event.sender?.id;
        if (isEcho || !text || !senderId) { console.log('[webhook] evento ignorado (echo/sem texto):', JSON.stringify(event).slice(0, 300)); continue; }
        if (!markSeen(messageId)) { console.log('[webhook] mensagem repetida, ignorada:', messageId); continue; }
        console.log('[webhook] LEAD criado do Direct de', senderId, '->', text);

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
  // O webhook pode ser assinado com o Instagram app secret (APP_SECRET) ou com
  // o Facebook App Secret (WEBHOOK_APP_SECRET). Aceitamos qualquer um dos dois.
  const secrets = [APP_SECRET, process.env.WEBHOOK_APP_SECRET].filter(Boolean);
  for (const secret of secrets) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    try {
      if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return true;
    } catch { /* comprimento diferente — tenta o próximo */ }
  }
  return false;
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

// Mantém o serviço acordado no plano gratuito do Render (evita o "spin down"
// que atrasa/derruba a entrega dos webhooks). O Render fornece RENDER_EXTERNAL_URL.
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  setInterval(() => {
    fetch(`${SELF_URL}/health`).catch(() => {});
  }, 10 * 60 * 1000); // a cada 10 minutos
}
