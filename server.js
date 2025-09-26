import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config(); // Carrega variáveis do .env

const app = express();
const port = process.env.PORT || 4000;

// ================== CONFIGURAÇÃO MONGODB ==================
const mongoUri = process.env.MONGODB_URI;

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

const usuarioSchema = new mongoose.Schema({
  nome: String,
  senha: String,
  pergunta: String,
  resposta: String,
  aliases: { type: Map, of: String }
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

// ================== FUNÇÃO DE NORMALIZAÇÃO ==================
const normalizar = (texto = '') => {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
};

// ================== MIDDLEWARES ==================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET, // <-- pega do .env
  resave: false,
  saveUninitialized: true
}));

// ================== FUNÇÃO FIRE HTTPS ==================
function fireHttpsGet(url, callback) {
  try {
    https.get(url, callback).on('error', err => console.error('Erro na requisição HTTPS:', err));
  } catch (err) {
    console.error('Erro ao chamar fireHttpsGet:', err);
  }
}

// ================== ROTAS ==================
app.get('/', (req, res) => res.redirect('/login'));

// -------- LOGIN --------
app.get('/login', (req, res) => {
  res.send(`
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron',sans-serif; text-align:center; padding-top:50px;}
input,button { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #8A2BE2;}
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
<form method="POST" action="/excluir-conta" onsubmit="return confirm('Tem certeza que deseja excluir sua conta? Esta ação é irreversível.')">
  <button type="submit">🗑️ Excluir minha conta</button>
</form>

</html>
  `);
});

app.post('/login', async (req, res) => {
  let { usuario, senha } = req.body;
  usuario = normalizar(usuario);

  const u = await Usuario.findOne({ nome: usuario });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send(`
<html><body style="background:#0A0A0A;color:#FF0000;font-family:'Orbitron',sans-serif;text-align:center;padding-top:100px;">
<h1 style="text-shadow:0 0 10px #FF0000;">Usuário ou senha inválidos.</h1>
<a href="/login" style="color:#FF1493;text-decoration:none;font-size:18px;border:1px solid #FF1493;padding:10px 20px;box-shadow:0 0 10px #FF1493;background-color:#000;">Voltar</a>
</body></html>
    `);
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
body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron',sans-serif; text-align:center; padding-top:50px;}
input,button { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:5px; font-size:16px; box-shadow:0 0 10px #8A2BE2;}
button { background-color:#000; color:#FF1493; border:1px solid #FF1493; box-shadow:0 0 10px #FF1493;}
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

  if (senha !== confirmar) return res.send('❌ As senhas não coincidem. <a href="/registrar">Voltar</a>');

  const existente = await Usuario.findOne({ nome: usuario });
  if (existente) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);
  const novo = new Usuario({ nome: usuario, senha: hashSenha, pergunta, resposta, aliases: {} });
  await novo.save();

  res.redirect('/cadastro-sucesso');
});

// -------- CADASTRO SUCESSO --------
app.get('/cadastro-sucesso', (req, res) => {
  res.send(`
<html>
<head>
<title>Cadastro Realizado</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body { background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:80px;}
h1 { font-size:36px; text-shadow:0 0 10px #39FF14;color:#39FF14;}
a { display:inline-block;background-color:#000;color:#00FFFF;border:2px solid #00FFFF;padding:12px 24px;font-size:18px;text-decoration:none;box-shadow:0 0 10px #00FFFF;transition:0.2s;}
a:hover { box-shadow:0 0 20px #00FFFF,0 0 30px #00FFFF; transform:scale(1.05);}
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
app.get('/recuperar', (req,res)=>{
  res.send(`
<html>
<head>
<style>
body{background:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:80px;}
input,button{background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #8A2BE2;}
button{background:#000;color:#FF1493;border:1px solid #FF1493;box-shadow:0 0 10px #FF1493;}
</style>
</head>
<body>
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
<a href="/login" style="display:inline-block;margin-top:20px;background:#000;color:#00FFFF;border:1px solid #00FFFF;padding:10px 20px;text-decoration:none;box-shadow:0 0 10px #00FFFF;">🔙 Voltar ao login</a>
</body>
</html>
  `);
});

app.post('/recuperar', async (req,res)=>{
  let { usuario, resposta, nova } = req.body;
  usuario = normalizar(usuario);

  const u = await Usuario.findOne({ nome: usuario });
  if(!u) return res.send('❌ Usuário não encontrado. <a href="/recuperar">Tentar novamente</a>');
  if(!u.resposta || u.resposta.toLowerCase().trim() !== String(resposta).toLowerCase().trim())
    return res.send('❌ Resposta secreta incorreta. <a href="/recuperar">Tentar novamente</a>');

  u.senha = await bcrypt.hash(nova,10);
  await u.save();
  res.send('✅ Senha redefinida com sucesso. <a href="/login">Ir para login</a>');
});

// -------- LOGOUT --------
app.get('/logout', (req,res)=>{ req.session.destroy(()=>res.redirect('/login')) });

// -------- PAINEL --------
app.get('/painel', async (req,res)=>{
  const usuario = req.session.usuario;
  if(!usuario) return res.redirect('/login');

  const u = await Usuario.findOne({ nome: usuario });
  const aliases = u.aliases || new Map();
  let lista = '';
  for(const [alias,url] of aliases) {
    lista += `<li><strong>${alias}</strong><br>
    <div style="position:relative; overflow-x:auto; white-space:nowrap; padding:10px; background-color:#1F1F1F; border:1px solid #8A2BE2; box-shadow:0 0 10px #8A2BE2; margin-top:5px;">
      <span style="word-break:break-all; color:#39FF14;">${url}</span>
      <button onclick="navigator.clipboard.writeText('${url}');
        const msg=document.createElement('span');
        msg.textContent='✅ Copiado!';
        msg.style='position:absolute; top:5px; left:5px; color:#00FFFF; font-size:12px; background-color:#000; padding:2px 6px; border:1px solid #00FFFF; box-shadow:0 0 5px #00FFFF;';
        this.parentElement.appendChild(msg);
        setTimeout(()=>msg.remove(),2000);"
        style="position:absolute; top:5px; right:5px; background-color:#000; color:#FF1493; border:1px solid #FF1493; padding:5px; font-size:12px; cursor:pointer;">📋
      </button>
    </div>
    <form method="POST" action="/excluir-alias" style="margin-top:10px;">
      <input type="hidden" name="alias" value="${alias}">
      <button type="submit">Excluir</button>
    </form></li>`;
  }

  const adminPanel = usuario==='admin' ? `<h3>Usuários cadastrados</h3>
    <ul>${(await Usuario.find()).map(u=>`<li>${u.nome}</li>`).join('')}</ul>
    <p><a href="/excluir-usuario">🛠️ Administração</a></p>` : '';

  res.send(`
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body { background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding:30px;}
h1,h2,h3 { text-shadow:0 0 10px #00FFFF;}
ul { list-style:none; padding:0;}
li { background-color:#1F1F1F; border:1px solid #8A2BE2; color:#39FF14; padding:10px; margin:10px auto; width:80%; box-shadow:0 0 10px #8A2BE2;}
input,button { background-color:#000;color:#FF1493;border:1px solid #FF1493;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #FF1493;}
a { color:#00FFFF; text-decoration:none;}
</style>
</head>
<body>
<h1 style="font-size:48px;">TRON</h1>
<h2>Smart Portão</h2>
<h3>Painel de ${usuario}</h3>
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

// -------- CADASTRAR ALIAS --------
app.post('/cadastrar-alias', async (req,res)=>{
  const usuario = req.session.usuario;
  if(!usuario) return res.redirect('/login');

  let { alias, url } = req.body;
  alias = normalizar(alias);

  const u = await Usuario.findOne({ nome: usuario });
  if(!u.aliases) u.aliases = new Map();
  if(u.aliases.has(alias)) return res.send('❌ Esse alias já existe. <a href="/painel">Voltar</a>');

  u.aliases.set(alias,url);
  await u.save();
  res.redirect('/painel');
});

// -------- EXCLUIR ALIAS --------
app.post('/excluir-alias', async (req,res)=>{
  const usuario = req.session.usuario;
  if(!usuario) return res.redirect('/login');

  let { alias } = req.body;
  alias = normalizar(alias);

  const u = await Usuario.findOne({ nome: usuario });
  if(u.aliases.has(alias)) { u.aliases.delete(alias); await u.save(); }
  res.redirect('/painel');
});

// -------- ADMIN EXCLUIR USUÁRIOS --------
app.get('/excluir-usuario', async (req,res)=>{
  if(req.session.usuario !== 'admin') return res.redirect('/login');

  const lista = (await Usuario.find()).map(u=>`<li><strong>${u.nome}</strong>
  <form method="POST" action="/excluir-usuario" style="display:inline;">
  <input type="hidden" name="usuario" value="${u.nome}">
  <button type="submit">🗑️ Excluir</button></form></li>`).join('');

  res.send(`
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body{background:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding:50px;}
h1{text-shadow:0 0 10px #00FFFF;}
ul{list-style:none;padding:0;}
li{background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:10px auto;width:60%;box-shadow:0 0 10px #8A2BE2;}
button{background:#000;color:#FF1493;border:1px solid #FF1493;padding:5px 10px;font-size:14px;box-shadow:0 0 10px #FF1493;cursor:pointer;}
a{color:#00FFFF;text-decoration:none;display:inline-block;margin-top:30px;}
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

app.post('/excluir-usuario', async (req,res)=>{
  if(req.session.usuario !== 'admin') return res.redirect('/login');
  const { usuario } = req.body;
  await Usuario.deleteOne({ nome: usuario });
  res.redirect('/excluir-usuario');
});

// Rota fixa para garagemvip
app.get('/garagemvip', async (req, res) => {
  try {
    const uRaw = req.query.usuario || '';
    const usuario = normalizar(uRaw);
    const alias = 'garagemvip';

    const u = await Usuario.findOne({ nome: usuario }).lean();
    if (!u) return res.status(404).send(`❌ Usuário "${uRaw}" não encontrado.`);

    const url = u.aliases?.[alias];
    if (!url) {
      const disponiveis = Object.keys(u.aliases || {}).join(', ') || 'nenhum';
      return res.status(404).send(`❌ Alias "${alias}" não encontrado para o usuário "${uRaw}". Aliases disponíveis: ${disponiveis}.`);
    }

    https.get(url, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`);
      });
    }).on('error', err => {
      console.error(err);
      res.status(500).send('❌ Erro ao disparar a URL.');
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Internal Server Error');
  }
});

// Catch-all para qualquer outro alias
app.get('/:alias', async (req, res) => {
  try {
    const alias = normalizar(req.params.alias);
    const usuario = normalizar(req.query.usuario || '');

    if (!usuario) return res.status(401).send('❌ Usuário não informado.');

    const u = await Usuario.findOne({ nome: usuario }).lean();
    if (!u) return res.status(404).send(`❌ Usuário "${usuario}" não encontrado.`);

    const url = u.aliases?.[alias];
    if (!url) return res.status(404).send(`❌ Alias "${alias}" não encontrado para o usuário "${usuario}".`);

    https.get(url, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`);
      });
    }).on('error', err => {
      console.error(err);
      res.status(500).send('❌ Erro ao disparar a URL.');
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Internal Server Error');
  }
});

// ==================== INICIAR SERVIDOR ====================
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));

