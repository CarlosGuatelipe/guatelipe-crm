// Armazenamento simples em arquivo JSON.
// Guarda o token do Instagram e os leads capturados pelo webhook.
// Em produção com muitos dados, troque por um banco (Postgres, MongoDB, etc.).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'store.json');

const empty = {
  token: null,
  leads: [],
  seenMessageIds: [],
  repliedSenders: [],
  config: { autoReplyEnabled: false, autoReplyMessage: '' },
};

function ensure() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2));
}

export function read() {
  ensure();
  try {
    return { ...empty, ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return { ...empty };
  }
}

export function write(data) {
  ensure();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function saveToken(token) {
  const db = read();
  db.token = { ...token, updatedAt: new Date().toISOString() };
  write(db);
  return db.token;
}

export function getToken() {
  return read().token;
}

// Configuração da resposta automática (definida pelo CRM).
export function getConfig() {
  return read().config || { autoReplyEnabled: false, autoReplyMessage: '' };
}

export function setConfig(partial) {
  const db = read();
  db.config = { ...db.config, ...partial };
  write(db);
  return db.config;
}

// Garante que só respondemos automaticamente UMA vez por remetente.
export function markReplied(senderId) {
  if (!senderId) return false;
  const db = read();
  if (db.repliedSenders.includes(senderId)) return false;
  db.repliedSenders.push(senderId);
  if (db.repliedSenders.length > 5000) db.repliedSenders = db.repliedSenders.slice(-5000);
  write(db);
  return true;
}

// Evita criar lead duplicado para a mesma mensagem (o webhook pode reenviar).
export function markSeen(messageId) {
  if (!messageId) return false;
  const db = read();
  if (db.seenMessageIds.includes(messageId)) return false;
  db.seenMessageIds.push(messageId);
  if (db.seenMessageIds.length > 2000) db.seenMessageIds = db.seenMessageIds.slice(-2000);
  write(db);
  return true;
}

export function addLead(lead) {
  const db = read();
  db.leads.push(lead);
  write(db);
  return lead;
}

export function getLeads() {
  return read().leads;
}

// Depois que o CRM (front-end) puxa os leads, marcamos como sincronizados
// para não importar o mesmo lead duas vezes.
export function pullNewLeads() {
  const db = read();
  const novos = db.leads.filter((l) => !l.pulled);
  db.leads = db.leads.map((l) => ({ ...l, pulled: true }));
  write(db);
  return novos;
}
