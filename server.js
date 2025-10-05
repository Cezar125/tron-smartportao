import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import https from 'https';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// ===== FIREBASE =====
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // privateKey may contain \n; replace literal "\n" with newline
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// ===== MONGODB =====
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Conectado ao MongoDB'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

const usuarioSchema = new mongoose.Schema({
  nome: { type: String, required: true, unique: true },
  senha: String,
  pergunta: String,
  resposta: String,
  aliases: { type: Map, of: String, default: {} },
  logs: [{ portao: String, data: Date }]
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

// ===== HELPERS =====
const normalizar = (texto = '') => String(texto)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '');

function ensureAliasesMap(u) {
  // returns a Map instance regardless of how mongoose returns aliases
  if (!u) return new Map();
  if (u.aliases instanceof Map) return u.aliases;
  // if stored as plain object
  return new Map(Object.entries(u.aliases || {}));
}

// ===== MIDDLEWARES =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'troca_essa_senha',
  resave: false,
  saveUninitialized: true
}));

// ===== ROUTES =====

// Root
app.get('/', (req, res) => res.redirect('/login'));

// ----- LOGIN -----
app.get('/login', (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>TRON — Login</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
  :root{--bg:#0A0A0A;--neon:#00FFFF;--accent:#FF1493;--panel:#1F1F1F;--vio:#8A2BE2;--green:#39FF14}
  body{background:var(--bg);color:var(--neon);font-family:Orbitron, sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{background:linear-gradient(180deg, rgba(15,15,15,0.9), rgba(10,10,10,0.9));padding:32px;border-radius:12px;box-shadow:0 0 20px var(--vio);width:360px;text-align:center}
  h1{margin:0 0 8px;font-size:32px;text-shadow:0 0 10px var(--neon)}
  input,button{width:100%;padding:10px;margin:8px 0;border-radius:8px;border:1px solid var(--vio);background:var(--panel);color:var(--green);font-size:16px}
  button{background:#000;color:var(--accent);cursor:pointer;box-shadow:0 0 10px var(--accent)}
  a{color:var(--neon);text-decoration:none;font-size:14px}
  .links{display:flex;justify-content:space-between;margin-top:8px}
</style>
</head>
<body>
  <div class="card">
    <h1>TRON</h1>
    <p style="margin:6px 0 18px">Smart Portão — Login</p>
    <form method="POST" action="/login" autocomplete="off">
      <input name="usuario" placeholder="Usuário" required />
      <input type="password" name="senha" placeholder="Senha" required />
      <button type="submit">Entrar</button>
    </form>
    <div class="links">
      <a href="/registrar">Criar conta</a>
      <a href="/recuperar">Recuperar senha</a>
    </div>
  </div>
</body>
</html>`);
});

app.post('/login', async (req, res) => {
  const usuarioRaw = req.body.usuario || '';
  const senha = req.body.senha || '';
  const usuario = normalizar(usuarioRaw);

  const u = await Usuario.findOne({ nome: usuario });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send(`<p style="color:#FF5555">Usuário ou senha inválidos.</p><p><a href="/login">Voltar</a></p>`);
  }
  req.session.usuario = usuario;
  res.redirect('/painel');
});

// ----- REGISTER -----
app.get('/registrar', (req, res) => {
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Registrar</title><style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
    body{background:#0A0A0A;color:#00FFFF;font-family:Orbitron,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
    .card{padding:24px;background:#0F0F0F;border-radius:10px;border:1px solid #8A2BE2;box-shadow:0 0 20px #8A2BE2;width:420px}
    input,button{width:100%;padding:10px;margin:8px 0;border-radius:8px;background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14}
    button{background:#000;color:#FF1493;cursor:pointer}
    a{color:#00FFFF}
  </style></head><body>
  <div class="card">
    <h2>CRIAR CONTA</h2>
    <form method="POST" action="/registrar">
      <input name="usuario" placeholder="Usuário (ex: joao)" required>
      <input type="password" name="senha" placeholder="Senha" required>
      <input type="password" name="confirmar" placeholder="Confirmar senha" required>
      <input name="pergunta" placeholder="Pergunta secreta (ex: cor favorita)" required>
      <input name="resposta" placeholder="Resposta secreta" required>
      <button type="submit">Criar conta</button>
    </form>
    <p><a href="/login">Voltar ao login</a></p>
  </div></body></html>`);
});

app.post('/registrar', async (req, res) => {
  let { usuario, senha, confirmar, pergunta, resposta } = req.body;
  usuario = normalizar(usuario || '');
  if (senha !== confirmar) return res.send('Senhas não conferem. <a href="/registrar">Voltar</a>');
  if (await Usuario.findOne({ nome: usuario })) return res.send('Usuário já existe. <a href="/registrar">Voltar</a>');
  const hash = await bcrypt.hash(senha, 10);
  const novo = new Usuario({ nome: usuario, senha: hash, pergunta, resposta, aliases: {}, logs: [] });
  await novo.save();
  res.redirect('/login');
});

// ----- RECUPERAR SENHA -----
app.get('/recuperar', (req, res) => {
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Recuperar</title><style>
    body{background:#0A0A0A;color:#00FFFF;font-family:Orbitron,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .card{padding:24px;background:#0F0F0F;border-radius:10px}
    input,button{width:100%;padding:10px;margin:8px 0;border-radius:8px;background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14}
  </style></head><body>
  <div class="card">
    <h3>Recuperar senha</h3>
    <form method="POST" action="/recuperar">
      <input name="usuario" placeholder="Nome de usuário" required>
      <button type="submit">Próximo</button>
    </form>
    <p><a href="/login">Voltar</a></p>
  </div></body></html>`);
});

app.post('/recuperar', async (req, res) => {
  const usuario = normalizar(req.body.usuario || '');
  const u = await Usuario.findOne({ nome: usuario });
  if (!u) return res.send('Usuário não encontrado. <a href="/recuperar">Voltar</a>');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Responder</title></head><body style="background:#0A0A0A;color:#00FFFF;font-family:Orbitron,sans-serif;text-align:center;padding-top:50px;">
    <h3>Pergunta</h3><p>${u.pergunta}</p>
    <form method="POST" action="/recuperar-senha">
      <input type="hidden" name="usuario" value="${u.nome}">
      <input name="resposta" placeholder="Resposta" required><br>
      <input type="password" name="nova" placeholder="Nova senha" required><br>
      <button type="submit">Atualizar senha</button>
    </form>
    <p><a href="/login">Voltar</a></p>
  </body></html>`);
});

app.post('/recuperar-senha', async (req, res) => {
  const usuario = normalizar(req.body.usuario || '');
  const resposta = req.body.resposta || '';
  const nova = req.body.nova || '';
  const u = await Usuario.findOne({ nome: usuario });
  if (!u || normalizar(u.resposta) !== normalizar(resposta)) return res.send('Resposta incorreta. <a href="/recuperar">Tentar novamente</a>');
  u.senha = await bcrypt.hash(nova, 10);
  await u.save();
  res.send('Senha atualizada. <a href="/login">Login</a>');
});

// ----- PAINEL (INTERFACE TRON) -----
app.get('/painel', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  const u = await Usuario.findOne({ nome: usuario });
  if (!u) return res.redirect('/login');

  const aliasesMap = ensureAliasesMap(u); // Map
  let lista = '';
  for (const [alias, url] of aliasesMap) {
    // escape simple values for inline JS
    const safeUrl = String(url).replace(/'/g, "\\'");
    lista += `<li>
      <strong>${alias}</strong>
      <div class="url-box"><span class="url-text">${url}</span>
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${safeUrl}'); showMsg(this,'✅ Copiado!')">📋</button>
      </div>
      <form method="POST" action="/excluir-alias" style="display:inline;">
        <input type="hidden" name="alias" value="${alias}">
        <button class="del-btn" type="submit">Excluir</button>
      </form>
    </li>`;
  }

  const adminPanel = usuario === 'admin' ? `<section class="admin"><h3>Usuários cadastrados</h3><ul>${(await Usuario.find()).map(u => `<li>${u.nome} <form method="POST" action="/excluir-usuario" style="display:inline;"><input type="hidden" name="usuario" value="${u.nome}"><button class="del-btn">🗑️</button></form></li>`).join('')}</ul></section>` : '';

  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>TRON — Painel</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
:root{--bg:#0A0A0A;--neon:#00FFFF;--vio:#8A2BE2;--panel:#1F1F1F;--accent:#FF1493;--green:#39FF14}
body{background:var(--bg);color:var(--neon);font-family:Orbitron, sans-serif;padding:20px;margin:0}
.container{max-width:900px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:center}
h1{margin:0;text-shadow:0 0 10px var(--neon)}
a.logout{color:var(--neon);text-decoration:none;border:1px solid var(--vio);padding:8px 12px;border-radius:8px}
.panel{background:linear-gradient(180deg, #0f0f0f, #0b0b0b);padding:20px;border-radius:12px;margin-top:18px;border:1px solid var(--vio);box-shadow:0 0 20px var(--vio)}
ul.aliases{list-style:none;padding:0;margin:0}
li{background:var(--panel);border:1px solid var(--vio);padding:12px;margin:10px 0;border-radius:8px;display:flex;flex-direction:column}
.url-box{position:relative;padding:8px;background:#000;border-radius:6px;overflow:auto}
.url-text{color:var(--green);word-break:break-word}
.copy-btn{position:absolute;right:8px;top:8px;background:#000;color:var(--accent);border:1px solid var(--accent);padding:6px;border-radius:6px;cursor:pointer}
.del-btn{background:#000;color:var(--accent);border:1px solid var(--accent);padding:6px 10px;border-radius:6px;cursor:pointer;margin-left:6px}
form.inline{display:flex;gap:8px;align-items:center}
input[type=text]{width:100%;padding:10px;border-radius:8px;border:1px solid var(--vio);background:#0f0f0f;color:var(--neon)}
button.primary{background:#000;color:var(--accent);border:1px solid var(--accent);padding:10px 16px;border-radius:8px;cursor:pointer}
.small{font-size:13px;color:#aaaaaa;margin-top:8px}
.admin ul{list-style:none;padding:0}
.msg{position:absolute;left:8px;top:8px;background:#000;color:var(--neon);padding:4px 8px;border-radius:6px;border:1px solid var(--neon)}
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <h1>TRON</h1>
      <div class="small">Smart Portão — Painel</div>
    </div>
    <div>
      <span style="margin-right:12px">Olá, <strong>${usuario}</strong></span>
      <a class="logout" href="/logout">Sair</a>
    </div>
  </header>

  <div class="panel">
    ${adminPanel}

    <h3>Aliases cadastrados</h3>
    <ul class="aliases">
      ${lista || '<li>Nenhum alias cadastrado.</li>'}
    </ul>

    <h3>Cadastrar novo alias</h3>
    <form method="POST" action="/cadastrar-alias" class="inline">
      <input name="alias" type="text" placeholder="Alias (ex: frente)" required>
      <input name="url" type="text" placeholder="URL do Voice Monkey" required>
      <button class="primary" type="submit">Cadastrar</button>
    </form>

    <h3>Salvar comando manual (envia para Firebase)</h3>
    <form id="form-comando" onsubmit="event.preventDefault(); salvarComando();">
      <input id="comando-alias" type="text" placeholder="Alias (ex: frente)" required>
      <button class="primary" type="submit">Salvar comando</button>
    </form>
    <p class="small">Observação: o painel salva o comando no Firebase; o app TronAccess irá escutar e disparar as URLs somente após biometria.</p>
  </div>
</div>

<script>
function showMsg(btn, text) {
  const parent = btn.parentElement;
  const span = document.createElement('span');
  span.className = 'msg';
  span.textContent = text;
  parent.appendChild(span);
  setTimeout(()=>span.remove(),2000);
}

function salvarComando() {
  const alias = document.getElementById('comando-alias').value.trim();
  if(!alias){ alert('Informe o alias'); return; }
  fetch('/salvar-comando', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ alias })
  })
  .then(r => r.text())
  .then(txt => alert(txt))
  .catch(err => { console.error(err); alert('Erro ao salvar comando'); });
}
</script>
</body>
</html>`);
});

// ----- CADASTRAR ALIAS -----
app.post('/cadastrar-alias', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  let { alias, url } = req.body;
  alias = normalizar(alias);

  const u = await Usuario.findOne({ nome: usuario });
  if (!u) return res.redirect('/login');

  if (!u.aliases) u.aliases = new Map();
  if (u.aliases instanceof Map) {
    u.aliases.set(alias, String(url));
  } else {
    // fallback if mongoose returned a plain object
    u.aliases = { ...(u.aliases || {}), [alias]: String(url) };
  }

  await u.save();
  res.redirect('/painel');
});

// ----- EXCLUIR ALIAS -----
app.post('/excluir-alias', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  let { alias } = req.body;
  alias = normalizar(alias);

  const u = await Usuario.findOne({ nome: usuario });
  if (!u) return res.redirect('/painel');

  if (u.aliases instanceof Map) {
    u.aliases.delete(alias);
  } else {
    const obj = { ...(u.aliases || {}) };
    delete obj[alias];
    u.aliases = obj;
  }

  await u.save();
  res.redirect('/painel');
});

// ----- SALVAR COMANDO (Firebase only) -----
app.post('/salvar-comando', async (req, res) => {
  const usuario = req.session.usuario;
  const alias = normalizar(req.body.alias || '');
  if (!usuario || !alias) return res.status(400).send('❌ Dados inválidos.');

  const comando = {
    frente: alias === 'frente' ? 'abrir' : '',
    fundos: alias === 'fundos' ? 'abrir' : '',
    lateral: alias === 'lateral' ? 'abrir' : '',
    garagemvip: alias === 'garagemvip' ? 'abrir' : ''
  };

  try {
    await admin.database().ref(`comando/${usuario}`).set(comando);
    res.send(`✅ Comando '${alias}' salvo no Firebase. TronAccess fará o disparo após biometria.`);
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Erro ao salvar comando');
  }
});

// ----- ADMIN: EXCLUIR USUÁRIO -----
app.post('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');
  const { usuario } = req.body;
  if (!usuario) return res.redirect('/excluir-usuario');
  await Usuario.deleteOne({ nome: usuario });
  res.redirect('/painel');
});

// ----- LOGOUT -----
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ===== START SERVER =====
app.listen(port, () => console.log(`🚀 TRON panel rodando na porta ${port}`));
