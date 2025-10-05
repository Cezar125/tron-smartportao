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

// ========== FIREBASE ==========
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// ========== MONGODB ==========
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

const usuarioSchema = new mongoose.Schema({
  nome: String,
  senha: String,
  pergunta: String,
  resposta: String,
  aliases: { type: Map, of: String },
  logs: [{ portao: String, data: Date }]
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

// ========== FUNÇÕES ==========
const normalizar = (texto = '') => String(texto)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "");

function fireHttpsGet(url, callback) {
  try {
    https.get(url, callback).on('error', err => console.error('Erro na requisição HTTPS:', err));
  } catch (err) {
    console.error('Erro ao chamar fireHttpsGet:', err);
  }
}

// ========== MIDDLEWARES ==========
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'segredo_super_secreto',
  resave: false,
  saveUninitialized: true
}));

// ================== ROTAS ==================
app.get('/', (req, res) => res.redirect('/login'));

// -------- LOGIN --------
app.get('/login', (req, res) => {
  res.send(`...HTML de login...`); // Mantém seu HTML original
});

app.post('/login', async (req, res) => {
  let { usuario, senha } = req.body;
  usuario = normalizar(usuario);

  const u = await Usuario.findOne({ nome: usuario });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send(`<h1 style="color:red;">Usuário ou senha inválidos</h1><a href="/login">Voltar</a>`);
  }

  req.session.usuario = usuario;
  res.redirect('/painel');
});

// -------- REGISTRO --------
app.get('/registrar', (req, res) => {
  res.send(`...HTML de registro...`); // Mantém seu HTML original
});

app.post('/registrar', async (req, res) => {
  let { usuario, senha, confirmar, pergunta, resposta } = req.body;
  usuario = normalizar(usuario);

  if (senha !== confirmar) return res.send('❌ As senhas não coincidem. <a href="/registrar">Voltar</a>');

  const existente = await Usuario.findOne({ nome: usuario });
  if (existente) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);
  const novo = new Usuario({ nome: usuario, senha: hashSenha, pergunta, resposta, aliases: {}, logs: [] });
  await novo.save();

  res.redirect('/cadastro-sucesso');
});

// -------- CADASTRO SUCESSO --------
app.get('/cadastro-sucesso', (req, res) => {
  res.send(`...HTML cadastro sucesso...`);
});

// -------- PAINEL --------
app.get('/painel', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  const u = await Usuario.findOne({ nome: usuario });
  const aliases = u.aliases || new Map();
  let lista = '';
  for (const [alias, url] of aliases) {
    lista += `
    <li>
      <strong>${alias}</strong>
      <div style="position:relative;overflow-x:auto;white-space:nowrap;padding:10px;background-color:#1F1F1F;border:1px solid #8A2BE2;box-shadow:0 0 10px #8A2BE2;margin-top:5px;">
        <span style="word-break:break-word;color:#39FF14;">${url}</span>
        <button onclick="navigator.clipboard.writeText('${url}');const msg=document.createElement('span');msg.textContent='✅ Copiado!';msg.style='position:absolute;top:5px;left:5px;color:#00FFFF;font-size:12px;background-color:#000;padding:2px 6px;border:1px solid #00FFFF;box-shadow:0 0 5px #00FFFF;';this.parentElement.appendChild(msg);setTimeout(()=>msg.remove(),2000);" style="position:absolute;top:5px;right:5px;background-color:#000;color:#FF1493;border:1px solid #FF1493;padding:5px;font-size:12px;cursor:pointer;">📋</button>
      </div>
      <form method="POST" action="/excluir-alias" style="margin-top:10px;">
        <input type="hidden" name="alias" value="${alias}">
        <button type="submit">Excluir</button>
      </form>
    </li>`;
  }

  let adminPanel = '';
  if (usuario === 'admin') {
    const usuarios = await Usuario.find();
    adminPanel = `
      <h3>Usuários cadastrados</h3>
      <ul>${usuarios.map(u => `<li>${u.nome}</li>`).join('')}</ul>
      <p><a href="/excluir-usuario">🛠️ Administração</a></p>
    `;
  }

  res.send(`...HTML completo do painel com ${lista} e adminPanel...`);
});

// -------- CADASTRAR ALIAS --------
app.post('/cadastrar-alias', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  let { alias, url } = req.body;
  alias = normalizar(alias);

  const u = await Usuario.findOne({ nome: usuario });
  if (!u.aliases) u.aliases = new Map();
  if (u.aliases.has(alias)) return res.send('❌ Esse alias já existe. <a href="/painel">Voltar</a>');

  u.aliases.set(alias, url);
  await u.save();
  res.redirect('/painel');
});

// -------- EXCLUIR ALIAS --------
app.post('/excluir-alias', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  let { alias } = req.body;
  alias = normalizar(alias);

  const u = await Usuario.findOne({ nome: usuario });
  if (u.aliases.has(alias)) {
    u.aliases.delete(alias);
    await u.save();
  }
  res.redirect('/painel');
});

// -------- ADMIN EXCLUIR USUÁRIOS --------
app.get('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');
  const lista = (await Usuario.find()).map(u => `<li><strong>${u.nome}</strong><form method="POST" action="/excluir-usuario" style="display:inline;"><input type="hidden" name="usuario" value="${u.nome}"><button type="submit">🗑️ Excluir</button></form></li>`).join('');
  res.send(`...HTML administração com ${lista}...`);
});

app.post('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');
  const { usuario } = req.body;
  await Usuario.deleteOne({ nome: usuario });
  res.redirect('/excluir-usuario');
});

// -------- ABRIR PORTÃO (Firebase + MongoDB) --------
app.get('/abrir-portao', async (req, res) => {
  const usuario = normalizar(req.query.usuario || '');
  const alias = normalizar(req.query.alias || '');

  const u = await Usuario.findOne({ nome: usuario });
  if (!u) return res.status(404).send(`❌ Usuário "${usuario}" não encontrado.`);

  const comando = {
    frente: alias === 'frente' ? 'abrir' : '',
    fundos: alias === 'fundos' ? 'abrir' : '',
    lateral: alias === 'lateral' ? 'abrir' : '',
    garagemvip: alias === 'garagemvip' ? 'abrir' : ''
  };

  try {
    await admin.database().ref(`comando/${usuario}`).set(comando);
    u.logs.push({ portao: alias, data: new Date() });
    await u.save();
    res.send(`✅ Comando '${alias}' enviado por ${usuario}`);
  } catch (err) {
    console.error('Erro ao enviar comando:', err);
    res.status(500).send('❌ Erro ao enviar comando');
  }
});

// -------- DISPARO FIXO GARAGEMVIP --------
app.get('/garagemvip', async (req, res) => {
  try {
    const usuario = normalizar(req.query.usuario || '');
    const alias = 'garagemvip';
    const u = await Usuario.findOne({ nome: usuario }).lean();
    if (!u) return res.status(404).send(`❌ Usuário "${usuario}" não encontrado.`);

    const url = u.aliases?.get(alias);
    if (!url) return res.status(404).send(`❌ Alias "${alias}" não encontrado.`);

    https.get(url, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`));
    }).on('error', err => res.status(500).send('❌ Erro ao disparar a URL.'));
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Internal Server Error');
  }
});

// -------- CATCH-ALL PARA ALIAS --------
app.get('/:alias', async (req, res) => {
  try {
    const alias = normalizar(req.params.alias);
    const usuario = normalizar(req.query.usuario || '');
    if (!usuario) return res.status(401).send('❌ Usuário não informado.');

    const u = await Usuario.findOne({ nome: usuario }).lean();
    if (!u) return res.status(404).send(`❌ Usuário "${usuario}" não encontrado.`);

    const url = u.aliases?.get(alias);
    if (!url) return res.status(404).send(`❌ Alias "${alias}" não encontrado para o usuário "${usuario}".`);

    https.get(url, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`));
    }).on('error', err => res.status(500).send('❌ Erro ao disparar a URL.'));
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Internal Server Error');
  }
});

// -------- SALVAR COMANDO --------
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
    res.send(`✅ Comando '${alias}' salvo com sucesso`);
  } catch (err) {
    console.error('Erro ao salvar comando:', err);
    res.status(500).send('❌ Erro ao salvar comando');
  }
});

// -------- INICIAR SERVIDOR --------
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
