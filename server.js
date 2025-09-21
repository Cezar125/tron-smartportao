import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import https from 'https';

const app = express();
const port = process.env.PORT || 4000;

// MongoDB
const mongoURI = 'mongodb+srv://cezarrocha297_db_user:Casa*2323@cluster0.vw3i1h3.mongodb.net/tron';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

// Schemas
const aliasSchema = new mongoose.Schema({
  alias: String,
  url: String
}, { _id: false });

const userSchema = new mongoose.Schema({
  usuario: { type: String, unique: true },
  senha: String,
  pergunta: String,
  resposta: String,
  aliases: [aliasSchema]
});

const User = mongoose.model('User', userSchema);

// Normalização
const normalizar = (texto = '') =>
  String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'segredo-cezar',
  resave: false,
  saveUninitialized: true
}));

// Wrapper para HTTPS
function fireHttpsGet(url, callback) {
  try {
    https.get(url, callback).on('error', err => console.error('Erro na requisição HTTPS:', err));
  } catch (err) {
    console.error('Erro ao chamar fireHttpsGet:', err);
  }
}

// Cria admin default se não existir
async function criarAdmin() {
  const admin = await User.findOne({ usuario: 'admin' });
  if (!admin) {
    const hash = await bcrypt.hash('admin', 10);
    await User.create({ usuario: 'admin', senha: hash, pergunta: 'admin', resposta: 'admin', aliases: [] });
    console.log('✅ Usuário admin criado com senha "admin"');
  }
}
criarAdmin();

// ===== ROTAS =====

// Login
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => {
  res.send(`<!-- HTML login completo TRON -->
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body { background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:50px; }
input, button { background-color:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #8A2BE2; }
button { background-color:#000;color:#FF1493;border:1px solid #FF1493;box-shadow:0 0 10px #FF1493; }
a { color:#00FFFF;text-decoration:none; }
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
</html>`);
});

app.post('/login', async (req, res) => {
  let { usuario, senha } = req.body;
  usuario = normalizar(usuario);

  const u = await User.findOne({ usuario });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send('<h1 style="color:red;text-align:center;">Usuário ou senha inválidos.</h1><p><a href="/login">Voltar</a></p>');
  }

  req.session.usuario = usuario;
  res.redirect('/painel');
});

// Cadastro
app.get('/registrar', (req, res) => {
  res.send(`<!-- HTML cadastro completo TRON -->
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body { background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:50px; }
input, button { background-color:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #8A2BE2; }
button { background-color:#000;color:#FF1493;border:1px solid #FF1493;box-shadow:0 0 10px #FF1493; }
a { color:#00FFFF;text-decoration:none; }
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
</html>`);
});

app.post('/registrar', async (req, res) => {
  let { usuario, senha, confirmar, pergunta, resposta } = req.body;
  usuario = normalizar(usuario);

  if (senha !== confirmar) return res.send('❌ Senhas não coincidem. <a href="/registrar">Voltar</a>');

  const exist = await User.findOne({ usuario });
  if (exist) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);
  await User.create({ usuario, senha: hashSenha, pergunta, resposta, aliases: [] });

  res.redirect('/cadastro-sucesso');
});

// Sucesso cadastro
app.get('/cadastro-sucesso', (req, res) => {
  res.send(`<h1 style="color:green;text-align:center;">✅ Cadastro realizado!</h1><p><a href="/login">Voltar ao login</a></p>`);
});

// Recuperar senha
app.get('/recuperar', (req, res) => {
  res.send(`<h1 style="color:#00FFFF;text-align:center;">🔐 Recuperar Senha</h1>
<form method="POST" action="/recuperar">
Usuário:<input type="text" name="usuario" required><br>
Resposta secreta:<input type="text" name="resposta" required><br>
Nova senha:<input type="password" name="nova" required><br>
<button type="submit">Redefinir</button>
</form><p><a href="/login">Voltar ao login</a></p>`);
});

app.post('/recuperar', async (req, res) => {
  let { usuario, resposta, nova } = req.body;
  usuario = normalizar(usuario);

  const u = await User.findOne({ usuario });
  if (!u) return res.send('❌ Usuário não encontrado. <a href="/recuperar">Tentar novamente</a>');

  if (!u.resposta || u.resposta.toLowerCase().trim() !== resposta.toLowerCase().trim())
    return res.send('❌ Resposta secreta incorreta. <a href="/recuperar">Tentar novamente</a>');

  u.senha = await bcrypt.hash(nova, 10);
  await u.save();
  res.send('✅ Senha redefinida com sucesso. <a href="/login">Ir para login</a>');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ===== PAINEL COMPLETO =====
app.get('/painel', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  const user = await User.findOne({ usuario: u });
  const aliases = user.aliases || [];

  const lista = aliases.map(a => `
<li>
<strong>${a.alias}</strong><br>
<div style="position:relative; overflow-x:auto; white-space:nowrap; padding:10px; background-color:#1F1F1F; border:1px solid #8A2BE2; box-shadow:0 0 10px #8A2BE2; margin-top:5px;">
<span style="word-break:break-all; color:#39FF14;">${a.url}</span>
<button onclick="navigator.clipboard.writeText('${a.url}');
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
<input type="hidden" name="alias" value="${a.alias}">
<button type="submit">Excluir</button>
</form>
</li>
`).join('') || '<li>Nenhum alias cadastrado.</li>';

// Painel admin
let adminPanel = '';
if (u === 'admin') {
  const usuarios = await User.find();
  adminPanel = `
<h3>Usuários cadastrados</h3>
<ul>${usuarios.map(user => `<li>${user.usuario} 
<form method="POST" action="/excluir-usuario" style="display:inline;">
<input type="hidden" name="usuario" value="${user.usuario}">
<button type="submit">🗑️ Excluir</button>
</form>
</li>`).join('')}</ul>
<p><a href="/painel">Voltar ao painel</a></p>`;
}

res.send(`
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body { background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;padding:20px; }
button { background-color:#000;color:#FF1493;border:1px solid #FF1493;box-shadow:0 0 10px #FF1493;padding:5px;margin:5px; cursor:pointer; }
input { padding:5px; }
h1,h2,h3 { text-shadow:0 0 10px #00FFFF; }
</style>
</head>
<body>
<h1>Painel ${u}</h1>
<p><a href="/logout">Sair</a></p>
<h3>Aliases:</h3>
<ul>${lista}</ul>
<h3>Cadastrar novo alias</h3>
<form method="POST" action="/cadastrar-alias">
<input type="text" name="alias" placeholder="Alias" required>
<input type="text" name="url" placeholder="URL" required>
<button type="submit">Cadastrar</button>
</form>
${adminPanel}
</body>
</html>
`);
});

// Cadastrar alias
app.post('/cadastrar-alias', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  const { alias, url } = req.body;
  const user = await User.findOne({ usuario: u });

  if (user.aliases.find(a => a.alias === alias))
    return res.send('❌ Esse alias já existe. <a href="/painel">Voltar</a>');

  user.aliases.push({ alias, url });
  await user.save();
  res.redirect('/painel');
});

// Excluir alias
app.post('/excluir-alias', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  const { alias } = req.body;
  const user = await User.findOne({ usuario: u });
  user.aliases = user.aliases.filter(a => a.alias !== alias);
  await user.save();
  res.redirect('/painel');
});

// Excluir usuário (admin)
app.post('/excluir-usuario', async (req, res) => {
  const u = req.session.usuario;
  if (u !== 'admin') return res.send('❌ Sem permissão.');

  const { usuario } = req.body;
  await User.deleteOne({ usuario });
  res.redirect('/painel');
});

// Garagem VIP
app.get('/garagemvip', async (req, res) => {
  const u = normalizar(req.query.usuario || '');
  const user = await User.findOne({ usuario: u });
  if (!user) return res.status(404).send('Usuário não encontrado');

  const alias = user.aliases.find(a => a.alias === 'garagemvip');
  if (!alias) return res.status(404).send('Alias "garagemvip" não encontrado');

  fireHttpsGet(alias.url, r => {
    let data = '';
    r.on('data', chunk => data += chunk);
    r.on('end', () => res.send(`✅ Disparo enviado. Resposta: ${data}`));
  });
});

// Catch-all para outros aliases
app.get('/:alias', async (req, res) => {
  const usuario = normalizar(req.query.usuario || '');
  const aliasReq = normalizar(req.params.alias);

  const user = await User.findOne({ usuario });
  if (!user) return res.status(404).send('Usuário não encontrado');

  const alias = user.aliases.find(a => normalizar(a.alias) === aliasReq);
  if (!alias) return res.status(404).send(`Alias "${aliasReq}" não encontrado`);

  fireHttpsGet(alias.url, r => {
    let data = '';
    r.on('data', chunk => data += chunk);
    r.on('end', () => res.send(`✅ Disparo enviado. Resposta: ${data}`));
  });
});

// Start server
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));



