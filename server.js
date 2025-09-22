// server.js
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import https from 'https';

const app = express();
const port = process.env.PORT || 4000;

// ================= MONGODB ===================
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://cezarrocha297_db_user:Casa*2323@cluster0.vw3i1h3.mongodb.net/tron-smartportao';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

// ================= MODELOS ===================
const usuarioSchema = new mongoose.Schema({
  usuario: { type: String, unique: true },
  senha: String,
  pergunta: String,
  resposta: String,
  aliases: { type: Map, of: String }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

// ================= FUNÇÕES ===================
const normalizar = (texto = '') => {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
};

const fireHttpsGet = (url, callback) => {
  try {
    https.get(url, callback).on('error', err => console.error('Erro na requisição HTTPS:', err));
  } catch (err) {
    console.error('Erro ao chamar fireHttpsGet:', err);
  }
};

// ================= CONFIGURAÇÃO EXPRESS ===================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'segredo-cezar',
  resave: false,
  saveUninitialized: true
}));

// ================= ROTAS ===================
// Redirect raiz
app.get('/', (req, res) => res.redirect('/login'));

// -------- LOGIN --------
app.get('/login', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron',sans-serif; text-align:center; padding-top:50px; }
          input, button { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #8A2BE2; }
          button { background-color:#000; color:#FF1493; border:1px solid #FF1493; box-shadow:0 0 10px #FF1493; }
          a { color:#00FFFF; text-decoration:none; }
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
  let { usuario, senha } = req.body;
  usuario = normalizar(usuario);

  const u = await Usuario.findOne({ usuario });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send(`<html><body style="background:#0A0A0A;color:#FF0000;text-align:center;padding-top:100px;font-family:'Orbitron',sans-serif;"><h1>Usuário ou senha inválidos.</h1><a href="/login" style="color:#FF1493;">Voltar</a></body></html>`);
  }

  req.session.usuario = usuario;
  res.redirect('/painel');
});

// -------- REGISTRO --------
app.get('/registrar', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron',sans-serif; text-align:center; padding-top:50px; }
          input, button { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #8A2BE2; }
          button { background-color:#000; color:#FF1493; border:1px solid #FF1493; box-shadow:0 0 10px #FF1493; }
          a { color:#00FFFF; text-decoration:none; }
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
  usuario = normalizar(usuario);

  if (senha !== confirmar) return res.send('❌ As senhas não coincidem. <a href="/registrar">Voltar</a>');

  const existe = await Usuario.findOne({ usuario });
  if (existe) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);
  const novoUsuario = new Usuario({ usuario, senha: hashSenha, pergunta, resposta, aliases: {} });
  await novoUsuario.save();

  res.redirect('/cadastro-sucesso');
});

// -------- CADASTRO SUCESSO --------
app.get('/cadastro-sucesso', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Cadastro Realizado</title>
        <style>
          body { background:#0A0A0A; color:#00FFFF; font-family:'Orbitron',sans-serif; text-align:center; padding-top:80px; }
          h1 { font-size:36px; text-shadow:0 0 10px #39FF14; color:#39FF14; }
          a { display:inline-block; margin-top:30px; background:#000; color:#00FFFF; border:2px solid #00FFFF; padding:12px 24px; text-decoration:none; box-shadow:0 0 10px #00FFFF; }
          a:hover { box-shadow:0 0 20px #00FFFF,0 0 30px #00FFFF; transform:scale(1.05); }
        </style>
      </head>
      <body>
        <h1>✅ Cadastro realizado com sucesso!</h1>
        <a href="/login">🔙 Voltar ao login</a>
      </body>
    </html>
  `);
});

// -------- RECUPERAR SENHA --------
app.get('/recuperar', (req, res) => {
  res.send(`
    <html>
      <body style="background:#0A0A0A;color:#00FFFF;text-align:center;padding-top:80px;font-family:'Orbitron',sans-serif;">
        <h1>🔐 Recuperar Senha</h1>
        <form method="POST" action="/recuperar">
          <label>Usuário:</label><br>
          <input type="text" name="usuario" required><br><br>
          <label>Resposta secreta:</label><br>
          <input type="text" name="resposta" required><br><br>
          <label>Nova senha:</label><br>
          <input type="password" name="nova" required><br><br>
          <button type="submit">Redefinir</button>
        </form>
        <a href="/login" style="display:inline-block;margin-top:20px;background:#000;color:#00FFFF;border:1px solid #00FFFF;padding:10px 20px;text-decoration:none;">🔙 Voltar ao login</a>
      </body>
    </html>
  `);
});

app.post('/recuperar', async (req, res) => {
  let { usuario, resposta, nova } = req.body;
  usuario = normalizar(usuario);

  const u = await Usuario.findOne({ usuario });
  if (!u) return res.send('❌ Usuário não encontrado. <a href="/recuperar">Tentar novamente</a>');
  if (!u.resposta || u.resposta.toLowerCase().trim() !== String(resposta).toLowerCase().trim()) {
    return res.send('❌ Resposta secreta incorreta. <a href="/recuperar">Tentar novamente</a>');
  }

  u.senha = await bcrypt.hash(nova, 10);
  await u.save();

  res.send('✅ Senha redefinida com sucesso. <a href="/login">Ir para login</a>');
});

// -------- LOGOUT --------
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// -------- PAINEL --------
app.get('/painel', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  const usuarioObj = await Usuario.findOne({ usuario: u });
  const aliases = usuarioObj.aliases || {};
  const lista = Object.entries(aliases).map(([alias, url]) => `
    <li>
      <strong>${alias}</strong><br>
      <div style="position:relative; overflow-x:auto; white-space:nowrap; padding:10px; background-color:#1F1F1F; border:1px solid #8A2BE2; box-shadow:0 0 10px #8A2BE2; margin-top:5px;">
        <span style="word-break:break-all; color:#39FF14;">${url}</span>
        <button onclick="navigator.clipboard.writeText('${url}'); const msg=document.createElement('span'); msg.textContent='✅ Copiado!'; msg.style='position:absolute; top:5px; left:5px; color:#00FFFF; font-size:12px; background-color:#000; padding:2px 6px; border:1px solid #00FFFF; box-shadow:0 0 5px #00FFFF;'; this.parentElement.appendChild(msg); setTimeout(()=>msg.remove(),2000);"
        style="position:absolute; top:5px; right:5px; background-color:#000; color:#FF1493; border:1px solid #FF1493; padding:5px; font-size:12px; cursor:pointer;">📋</button>
      </div>
      <form method="POST" action="/excluir-alias" style="margin-top:10px;">
        <input type="hidden" name="alias" value="${alias}">
        <button type="submit">Excluir</button>
      </form>
    </li>
  `).join('');

  const adminPanel = u === 'admin' ? `
    <h3>Usuários cadastrados</h3>
    <ul>${(await Usuario.find()).map(user => `<li>${user.usuario}</li>`).join('')}</ul>
    <p><a href="/excluir-usuario">🛠️ Administração</a></p>
  ` : '';

  res.send(`
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron',sans-serif; text-align:center; padding:30px; }
          h1,h2,h3 { text-shadow:0 0 10px #00FFFF; }
          ul { list-style:none; padding:0; }
          li { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:10px auto; width:80%; box-shadow:0 0 10px #8A2BE2; }
          input, button { background-color:#000; color:#FF1493; border:1px solid #FF1493; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #FF1493; }
          a { color:#00FFFF; text-decoration:none; }
        </style>
      </head>
      <body>
        <h1 style="font-size:48px;">TRON</h1>
        <h2>Smart Portão</h2>
        <h3>Painel de ${u}</h3>
        <p><a href="/logout">Sair</a></p>
        ${adminPanel}
        <h3>Aliases cadastrados:</h3>
        <ul>${lista || '<li>Nenhum alias cadastrado.</li>'}</ul>
        <h3>Cadastrar novo alias</h3>
        <form method="POST" action="/cadastrar-alias">
          <input type="text" name="alias" placeholder="Alias" required><br>
          <input type="text" name="url" placeholder="URL do Voice Monkey" required><br>
          <button type="submit">Cadastrar</button>
        </form>
      </body>
    </html>
  `);
});

// -------- CADASTRAR/EXCLUIR ALIAS --------
app.post('/cadastrar-alias', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  let { alias, url } = req.body;
  alias = normalizar(alias);

  const usuarioObj = await Usuario.findOne({ usuario: u });
  if (!usuarioObj.aliases) usuarioObj.aliases = new Map();

  if (usuarioObj.aliases.has(alias)) return res.send('❌ Esse alias já existe. <a href="/painel">Voltar</a>');

  usuarioObj.aliases.set(alias, url);
  await usuarioObj.save();
  res.redirect('/painel');
});

app.post('/excluir-alias', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  let { alias } = req.body;
  alias = normalizar(alias);

  const usuarioObj = await Usuario.findOne({ usuario: u });
  if (usuarioObj.aliases?.has(alias)) usuarioObj.aliases.delete(alias);

  await usuarioObj.save();
  res.redirect('/painel');
});

// -------- ADMIN USUÁRIOS --------
app.get('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');

  const lista = (await Usuario.find()).map(u => `
    <li>
      <strong>${u.usuario}</strong>
      <form method="POST" action="/excluir-usuario" style="display:inline;">
        <input type="hidden" name="usuario" value="${u.usuario}">
        <button type="submit">🗑️ Excluir</button>
      </form>
    </li>
  `).join('');

  res.send(`
    <html>
      <head>
        <style>
          body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron',sans-serif; text-align:center; padding:50px; }
          h1 { text-shadow:0 0 10px #00FFFF; }
          ul { list-style:none; padding:0; }
          li { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:10px auto; width:60%; box-shadow:0 0 10px #8A2BE2; }
          button { background-color:#000; color:#FF1493; border:1px solid #FF1493; padding:5px 10px; font-size:14px; box-shadow:0 0 10px #FF1493; cursor:pointer; }
          a { color:#00FFFF; text-decoration:none; display:inline-block; margin-top:30px; }
        </style>
      </head>
      <body>
        <h1>🛠️ Administração</h1>
        <h2>Excluir Usuários</h2>
        <ul>${lista}</ul>
        <a href="/painel">Voltar ao painel</a>
      </body>
    </html>
  `);
});

app.post('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');

  const { usuario } = req.body;
  if (usuario !== 'admin') await Usuario.deleteOne({ usuario });
  res.redirect('/excluir-usuario');
});

// -------- ROTAS DE DISPARO (Voice Monkey) --------
app.get('/garagemvip', async (req, res) => {
  const { usuario } = req.query;
  if (!usuario) return res.send('❌ Usuário não informado.');

  const u = await Usuario.findOne({ usuario: normalizar(usuario) });
  if (!u) return res.send('❌ Usuário não encontrado.');

  for (const url of u.aliases.values()) {
    fireHttpsGet(url, r => console.log('Disparo:', url, r.statusCode));
  }

  res.send('✅ URLs disparadas com sucesso.');
});

app.get('/:alias', async (req, res) => {
  const alias = normalizar(req.params.alias);
  const { usuario } = req.query;
  if (!usuario) return res.send('❌ Usuário não informado.');

  const u = await Usuario.findOne({ usuario: normalizar(usuario) });
  if (!u) return res.send('❌ Usuário não encontrado.');

  const url = u.aliases.get(alias);
  if (!url) return res.send('❌ Alias não encontrado.');

  fireHttpsGet(url, r => console.log('Disparo alias:', url, r.statusCode));
  res.send(`✅ Alias "${alias}" disparado com sucesso.`);
});

// ================= START SERVER ===================
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
