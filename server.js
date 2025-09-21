import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import https from 'https';

const app = express();
const port = 4000;

// MongoDB Atlas
const uri = 'mongodb+srv://cezarrocha297_db_user:Casa*2323@cluster0.vw3i1h3.mongodb.net/';
const client = new MongoClient(uri);
let usuariosCollection;

async function conectarMongo() {
  await client.connect();
  const db = client.db('tron-smartportao');
  usuariosCollection = db.collection('usuarios');
  console.log('✅ Conectado ao MongoDB Atlas');
}
conectarMongo();

// Normalização
const normalizar = (texto = '') =>
  String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'segredo-cezar',
  resave: false,
  saveUninitialized: true
}));

// Função para requisição HTTPS
function fireHttpsGet(url, callback) {
  try {
    https.get(url, callback).on('error', err => console.error('Erro HTTPS:', err));
  } catch (err) {
    console.error('Erro fireHttpsGet:', err);
  }
}

// -------------------- Rotas --------------------

// Redireciona para login
app.get('/', (req, res) => res.redirect('/login'));

// Login
app.get('/login', (req, res) => {
  res.send(`
<html>
  <head>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
      body { background-color: #0A0A0A; color: #00FFFF; font-family: 'Orbitron', sans-serif; text-align:center; padding-top:50px;}
      input, button { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #8A2BE2;}
      button { background-color:#000; color:#FF1493; border:1px solid #FF1493; box-shadow:0 0 10px #FF1493;}
      a { color:#00FFFF; text-decoration:none;}
      h1,h2,h3 { text-shadow:0 0 10px #00FFFF;}
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

  const u = await usuariosCollection.findOne({ usuario });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send(`
      <html><body style="color:red;text-align:center;padding-top:100px;">
      <h1>Usuário ou senha inválidos.</h1>
      <a href="/login" style="color:#FF1493;">Voltar</a>
      </body></html>
    `);
  }

  req.session.usuario = usuario;
  res.redirect('/painel');
});

// Registrar
app.get('/registrar', (req, res) => {
  res.send(`
<html>
  <head>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
      body { background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:50px;}
      input, button { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #8A2BE2;}
      button { background-color:#000;color:#FF1493;border:1px solid #FF1493; box-shadow:0 0 10px #FF1493;}
      a { color:#00FFFF; text-decoration:none;}
      h1,h2,h3 { text-shadow:0 0 10px #00FFFF;}
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

  if (senha !== confirmar) return res.send('❌ Senhas não coincidem. <a href="/registrar">Voltar</a>');

  const exists = await usuariosCollection.findOne({ usuario });
  if (exists) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);
  await usuariosCollection.insertOne({ usuario, senha: hashSenha, pergunta, resposta, aliases: {} });

  res.redirect('/cadastro-sucesso');
});

app.get('/cadastro-sucesso', (req, res) => {
  res.send(`
<html>
  <body style="background:#0A0A0A;color:#00FFFF;font-family:'Orbitron';text-align:center;padding-top:80px;">
    <h1 style="color:#39FF14;">✅ Cadastro realizado com sucesso!</h1>
    <a href="/login" style="background:#000;color:#00FFFF;padding:10px 20px;border:1px solid #00FFFF;box-shadow:0 0 10px #00FFFF;">🔙 Voltar ao login</a>
  </body>
</html>
  `);
});

// Recuperar senha
app.get('/recuperar', (req, res) => {
  res.send(`
<html>
  <body style="background:#0A0A0A;color:#00FFFF;font-family:'Orbitron';text-align:center;padding-top:80px;">
    <h1>🔐 Recuperar Senha</h1>
    <form method="POST" action="/recuperar">
      <label>Usuário:</label><br><input type="text" name="usuario" required><br><br>
      <label>Resposta secreta:</label><br><input type="text" name="resposta" required><br><br>
      <label>Nova senha:</label><br><input type="password" name="nova" required><br><br>
      <button>Redefinir</button>
    </form>
    <a href="/login" style="background:#000;color:#00FFFF;padding:10px 20px;border:1px solid #00FFFF;box-shadow:0 0 10px #00FFFF;margin-top:20px;display:inline-block;">🔙 Voltar ao login</a>
  </body>
</html>
  `);
});

app.post('/recuperar', async (req, res) => {
  let { usuario, resposta, nova } = req.body;
  usuario = normalizar(usuario);

  const u = await usuariosCollection.findOne({ usuario });
  if (!u) return res.send('❌ Usuário não encontrado. <a href="/recuperar">Tentar novamente</a>');
  if (!u.resposta || u.resposta.toLowerCase().trim() !== String(resposta).toLowerCase().trim())
    return res.send('❌ Resposta secreta incorreta. <a href="/recuperar">Tentar novamente</a>');

  const novaHash = await bcrypt.hash(nova, 10);
  await usuariosCollection.updateOne({ usuario }, { $set: { senha: novaHash } });

  res.send('✅ Senha redefinida com sucesso. <a href="/login">Ir para login</a>');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Painel
app.get('/painel', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  const user = await usuariosCollection.findOne({ usuario: u });
  const aliases = user.aliases || {};

  const lista = Object.entries(aliases).map(([alias, url]) => `
    <li style="background:#1F1F1F;padding:10px;margin:10px;border:1px solid #8A2BE2;box-shadow:0 0 10px #8A2BE2;position:relative;">
      <strong>${alias}</strong><br>
      <div style="overflow-x:auto;white-space:nowrap;">${url}</div>
      <button onclick="navigator.clipboard.writeText('${url}');alert('✅ Copiado!');" style="position:absolute;top:5px;right:5px;">📋</button>
      <form method="POST" action="/excluir-alias"><input type="hidden" name="alias" value="${alias}"><button>Excluir</button></form>
    </li>
  `).join('');

  const adminPanel = u === 'admin' ? `
    <h3>Usuários cadastrados</h3>
    <ul>${(await usuariosCollection.find({}).toArray()).map(user => `<li>${user.usuario}</li>`).join('')}</ul>
    <p><a href="/excluir-usuario">🛠️ Administração</a></p>
  ` : '';

  res.send(`
<html>
  <body style="background:#0A0A0A;color:#00FFFF;font-family:'Orbitron';text-align:center;padding:30px;">
    <h1>TRON Smart Portão</h1>
    <h3>Painel de ${u}</h3>
    <p><a href="/logout">Sair</a></p>
    ${adminPanel}
    <h3>Aliases cadastrados:</h3>
    <ul style="list-style:none;padding:0;">${lista || '<li>Nenhum alias cadastrado.</li>'}</ul>
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

// Cadastrar alias
app.post('/cadastrar-alias', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  let { alias, url } = req.body;
  alias = normalizar(alias);

  const user = await usuariosCollection.findOne({ usuario: u });
  if (!user.aliases) user.aliases = {};
  if (user.aliases[alias]) return res.send('❌ Alias já existe. <a href="/painel">Voltar</a>');

  user.aliases[alias] = url;
  await usuariosCollection.updateOne({ usuario: u }, { $set: { aliases: user.aliases } });

  res.redirect('/painel');
});

// Excluir alias
app.post('/excluir-alias', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  const { alias } = req.body;
  const user = await usuariosCollection.findOne({ usuario: u });
  if (user.aliases && user.aliases[alias]) delete user.aliases[alias];

  await usuariosCollection.updateOne({ usuario: u }, { $set: { aliases: user.aliases } });
  res.redirect('/painel');
});

// Admin excluir usuários
app.get('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');

  const users = await usuariosCollection.find({}).toArray();
  const lista = users.map(u => `
    <li>
      ${u.usuario}
      <form method="POST" action="/excluir-usuario">
        <input type="hidden" name="usuario" value="${u.usuario}">
        <button>🗑️ Excluir</button>
      </form>
    </li>
  `).join('');

  res.send(`<html><body style="background:#0A0A0A;color:#00FFFF;text-align:center;"><h1>Administração</h1><ul>${lista}</ul><a href="/painel">Voltar ao painel</a></body></html>`);
});

app.post('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');

  const { usuario } = req.body;
  await usuariosCollection.deleteOne({ usuario });
  res.redirect('/excluir-usuario');
});

// Alias amigável
app.get('/:alias', async (req, res) => {
  const alias = normalizar(req.params.alias);
  const usuario = normalizar(req.query.usuario || '');

  if (!usuario) return res.status(401).send('❌ Usuário não informado.');
  const user = await usuariosCollection.findOne({ usuario });
  if (!user) return res.status(404).send('❌ Usuário não encontrado.');

  const url = user.aliases[alias];
  if (!url) return res.status(404).send('❌ Alias não encontrado.');

  fireHttpsGet(url, response => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`));
  });
});

// -------------------- Start --------------------
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));

