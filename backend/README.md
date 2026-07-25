# Backend do Guatelipe CRM — Integração com Instagram (Meta API)

Este backend conecta o CRM à **API oficial do Instagram**. Ele faz o login (OAuth),
guarda o token com segurança e recebe as mensagens do Direct por **webhook**,
transformando cada mensagem em um **lead** dentro do CRM.

> ⚠️ O `APP_SECRET` e o token **nunca** vão para o navegador. Ficam só aqui, no servidor.

---

## Pré-requisitos na Meta (você precisa fazer)

1. Conta do Instagram **Profissional** (Comercial ou Criador), vinculada a uma **Página do Facebook**.
2. App criado no [Meta for Developers](https://developers.facebook.com) com o produto **Instagram** adicionado.
3. **Resolver o erro "Função de desenvolvedor é insuficiente":**
   - App → **Funções do app → Funções → Testadores do Instagram** → adicione o **@usuário**.
   - No app do Instagram: **Configurações → Apps e sites → Convites de testador → Aceitar**.

---

## Passo 1 — Rodar localmente (teste)

```bash
cd backend
npm install
cp .env.example .env   # no Windows: copy .env.example .env
# edite o .env com seus dados
npm start
```

Acesse `http://localhost:3000/health` → deve responder `{"ok":true,...}`.

## Passo 2 — Publicar com HTTPS (produção)

A Meta **exige HTTPS**. Use um serviço gratuito como **Render** ou **Railway**:

### Render (recomendado)
1. Suba a pasta `backend` para um repositório no GitHub.
2. Em [render.com](https://render.com) → **New → Web Service** → conecte o repositório.
3. Build Command: `npm install` · Start Command: `npm start`.
4. Em **Environment**, adicione as variáveis do `.env` (APP_ID, APP_SECRET, etc.).
5. Copie a URL gerada, ex.: `https://guatelipe-crm.onrender.com`.

## Passo 3 — Configurar na Meta

No painel do app:

- **Login do Facebook → Configurações → URIs de redirecionamento OAuth válidos:**
  `https://SEU-BACKEND/auth/instagram/callback`
- **Webhooks → Instagram → Editar assinatura:**
  - URL de retorno: `https://SEU-BACKEND/webhooks/instagram`
  - Token de verificação: o mesmo valor de `WEBHOOK_VERIFY_TOKEN`
  - Assine o campo **messages**.

## Passo 4 — Conectar no CRM

1. Abra o CRM → aba **Integrações**.
2. Preencha **URL do backend** e **Chave de API** (`CRM_API_KEY`) → **Salvar**.
3. Clique em **Conectar Instagram** → faça login na Meta e autorize.
4. Clique em **Sincronizar Direct** para importar os leads recebidos.

---

## Rotas do backend

| Rota | Método | Função |
|------|--------|--------|
| `/health` | GET | Status do servidor e variáveis faltando |
| `/auth/instagram` | GET | Inicia o login OAuth da Meta |
| `/auth/instagram/callback` | GET | Recebe o código e guarda o token |
| `/webhooks/instagram` | GET | Verificação do webhook (Meta) |
| `/webhooks/instagram` | POST | Recebe mensagens do Direct (assinatura validada) |
| `/api/status` | GET | Status da conexão (precisa de `x-api-key`) |
| `/api/leads` | GET | Leads capturados (precisa de `x-api-key`) |

## Importante sobre produção

Para receber Direct de **qualquer** pessoa (não só testadores), o app precisa passar pela
**App Review** da Meta, solicitando a permissão `instagram_manage_messages`. Isso exige
**política de privacidade publicada** e um **vídeo** demonstrando o uso. Enquanto o app
estiver em modo Desenvolvimento, só contas com função de Testador/Admin funcionam.
