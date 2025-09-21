import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import https from 'https';
import { connectDB } from './config/mongo.js'; // Conexão MongoDB

const app = express();
const port = process.env.PORT || 4000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'segredo-cezar',
  resave: false,
  saveUninitialized: true
}));

// Normalização de texto
const normalizar = (texto = '') => String(texto)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "");

// Wrapper para requisição HTTPS
function fireHttpsGet(url, callback) {
  try {
    https.get(url, callback).on('error', err => console.error('Erro na requisição HTTPS:', err));
  } catch (err) {
    console.error('Erro ao chamar fireHttpsGet:', err);
  }
}

let db;
connectDB()
  .then(database => {
    db = database;
    console.log('✅ Conectado ao MongoDB Atlas');
  })
  .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// ================= ROTAS =================

// Login
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
  res.send(`
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
        body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron', sans-serif; text-align:center; padding-top:50px; }
        input, button { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #8A2BE2; }
        button { background-color:#000; color:#FF1493; border:1px solid #FF1493; box-shadow:0 0 10px #FF1493; }
        h1,h2,h3 { text-shadow:0 0 10px #00FFFF; }
      </style>
    </head>
    <body>
      <h1 style="font-size:48px;">TRON</h1>
      <h2>Smart Portão</h2>
      <h3>Login de Usuário</h3>
      <form method="POST" action="/login" autocomplete="off">
        <label>Nome de usuário:</label><br>
        <input type="text" name="usuario" autocomplete="off" required><br><br>
        <label>Senha:</label><br>
        <input type="password" name="senha" autocomplete="new-password" required><br><br>
        <button type="submit">Entrar</button>
      </form>
      <p><a href="/registrar">Criar nova conta</a></p>
      <p><a href="/recuperar">Esqueci minha senha</a></p>
    </body>
    </html>
  `);
});

app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;
  const userNormalized = normalizar(usuario);

  if (!db) return res.status(500).send('❌ Banco não conectado');

  const u = await db.collection('usuarios').findOne({ usuario: userNormalized });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send('❌ Usuário ou senha inválidos. <a href="/login">Voltar</a>');
  }

  req.session.usuario = userNormalized;
  res.redirect('/painel');
});

// Cadastro
app.get('/registrar', (req, res) => {
  res.send(`
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
        body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron', sans-serif; text-align:center; padding-top:50px; }
        input, button { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #8A2BE2; }
        button { background-color:#000; color:#FF1493; border:1px solid #FF1493; box-shadow:0 0 10px #FF1493; }
        h1,h2,h3 { text-shadow:0 0 10px #00FFFF; }
      </style>
    </head>
    <body>
      <h1 style="font-size:48px;">TRON</h1>
      <h2>Smart Portão</h2>
      <h3>Cadastro de Usuário</h3>
      <form method="POST" action="/registrar">
        <label>Nome de usuário:</label><br>
        <input type="text" name="usuario" required><br><br>
        <label>Senha:</label><br>
        <input type="password" name="senha" required><br><br>
        <label>Confirmar senha:</label><br>
        <input type="password" name="confirmar" required><br><br>
        <label>Pergunta secreta:</label><br>
        <input type="text" name="pergunta" required><br><br>
        <label>Resposta secreta:</label><br>
        <input type="text" name="resposta" required><br><br>
        <button type="submit">Cadastrar</button>
      </form>
      <p><a href="/login">Já tenho conta</a></p>
    </body>
    </html>
  `);
});

app.post('/registrar', async (req, res) => {
  let { usuario, senha, confirmar, pergunta, resposta } = req.body;
  const userNormalized = normalizar(usuario);

  if (senha !== confirmar) return res.send('❌ As senhas não coincidem. <a href="/registrar">Voltar</a>');
  if (!db) return res.status(500).send('❌ Banco não conectado');

  const exists = await db.collection('usuarios').findOne({ usuario: userNormalized });
  if (exists) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);

  await db.collection('usuarios').insertOne({
    usuario: userNormalized,
    senha: hashSenha,
    pergunta,
    resposta,
    aliases: {}
  });

  res.redirect('/login');
});

// Painel
app.get('/painel', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');
  if (!db) return res.status(500).send('❌ Banco não conectado');

  const user = await db.collection('usuarios').findOne({ usuario: u });
  const aliases = user.aliases || {};

  const lista = Object.entries(aliases).map(([alias, url]) => `
    <li>
      <strong>${alias}</strong><br>
      <div style="position:relative; overflow-x:auto; white-space:nowrap; padding:10px; background-color:#1F1F1F; border:1px solid #8A2BE2; box-shadow:0 0 10px #8A2BE2; margin-top:5px;">
        <span style="word-break:break-all; color:#39FF14;">${url}</span>
        <button onclick="navigator.clipboard.writeText('${url}');
          const msg=document.createElement('span');
          msg.textContent='✅ Copiado!';
          msg.style='position:absolute; top:5px; left:5px; color:#00FFFF; font-size:12px; background-color:#000; padding:2px 6px; border:1px solid #00FFFF; box-shadow:0 0 5px #00FFFF;';
          this.parentElement.appendChild(msg);
          setTimeout(()=>msg.remove(),2000);"
          style="position:absolute; top:5px; right:5px; background-color:#000; color:#FF1493; border:1px solid #FF1493; padding:5px; font-size:12px; cursor:pointer;">
          📋
        </button>
      </div>
      <form method="POST" action="/excluir-alias" style="margin-top:10px;">
        <input type="hidden" name="alias" value="${alias}">
        <button type="submit">Excluir</button>
      </form>
    </li>
  `).join('');

  res.send(`
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
        body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron', sans-serif; text-align:center; padding:30px; }
        h1,h2,h3 { text-shadow:0 0 10px #00FFFF; }
        ul { list-style:none; padding:0; }
        li { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:10px auto; width:80%; box-shadow:0 0 10px #8A2BE2; }
        input, button { background-color:#000; color:#FF1493; border:1px solid #FF1493; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #FF1493; }
        a { color:#00FFFF; text-decoration:none; }
      </style>
    </head>
    <body>
      <h1>TRON Smart Portão</h1>
      <h2>Painel de Aliases</h2>
      <ul>${lista}</ul>
      <h3>Adicionar novo alias</h3>
      <form method="POST" action="/adicionar-alias">
        <input type="text" name="alias" placeholder="Nome do alias" required>
        <input type="text" name="url" placeholder="URL do VoiceMonkey" required>
        <button type="submit">Adicionar</button>
      </form>
      <p><a href="/logout">Sair</a></p>
    </body>
    </html>
  `);
});

// Adicionar alias
app.post('/adicionar-alias', async (req, res) => {
  const { alias, url } = req.body;
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');
  if (!db) return res.status(500).send('❌ Banco não conectado');

  await db.collection('usuarios').updateOne(
    { usuario: u },
    { $set: { [`aliases.${alias}`]: url } }
  );
  res.redirect('/painel');
});

// Excluir alias
app.post('/excluir-alias', async (req, res) => {
  const { alias } = req.body;
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');
  if (!db) return res.status(500).send('❌ Banco não conectado');

  await db.collection('usuarios').updateOne(
    { usuario: u },
    { $unset: { [`aliases.${alias}`]: "" } }
  );
  res.redirect('/painel');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ================= START SERVER =================
app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});
