import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { connectDB } from './config/mongo.js';
import https from 'https';

const app = express();
const port = 4000;

// Normalização de texto
const normalizar = (texto = '') => String(texto)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'segredo-cezar',
  resave: false,
  saveUninitialized: true
}));

// Wrapper HTTPS
function fireHttpsGet(url, callback) {
  try {
    https.get(url, callback).on('error', err => console.error('Erro HTTPS:', err));
  } catch (err) {
    console.error('Erro fireHttpsGet:', err);
  }
}

// Rotas públicas
app.get('/', (req, res) => res.redirect('/login'));

// Login
app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: './public' }); // Opcional: separar HTML em public
});

app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;
  const uNorm = normalizar(usuario);
  const db = await connectDB();

  const u = await db.collection('usuarios').findOne({ usuario: uNorm });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send('Usuário ou senha inválidos. <a href="/login">Voltar</a>');
  }

  req.session.usuario = uNorm;
  res.redirect('/painel');
});

// Cadastro
app.get('/registrar', (req, res) => {
  res.sendFile('registrar.html', { root: './public' });
});

app.post('/registrar', async (req, res) => {
  let { usuario, senha, confirmar, pergunta, resposta } = req.body;
  usuario = normalizar(usuario);

  if (senha !== confirmar) return res.send('❌ Senhas não coincidem. <a href="/registrar">Voltar</a>');

  const db = await connectDB();
  const existe = await db.collection('usuarios').findOne({ usuario });
  if (existe) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);
  await db.collection('usuarios').insertOne({
    usuario,
    senha: hashSenha,
    pergunta,
    resposta,
    aliases: {}
  });

  res.redirect('/cadastro-sucesso');
});

app.get('/cadastro-sucesso', (req, res) => {
  res.send('✅ Cadastro realizado! <a href="/login">Login</a>');
});

// Recuperar senha
app.get('/recuperar', (req, res) => {
  res.sendFile('recuperar.html', { root: './public' });
});

app.post('/recuperar', async (req, res) => {
  let { usuario, resposta, nova } = req.body;
  usuario = normalizar(usuario);
  const db = await connectDB();
  const u = await db.collection('usuarios').findOne({ usuario });
  if (!u) return res.send('Usuário não encontrado. <a href="/recuperar">Tentar novamente</a>');

  if (!u.resposta || u.resposta.toLowerCase().trim() !== String(resposta).toLowerCase().trim()) {
    return res.send('Resposta secreta incorreta. <a href="/recuperar">Tentar novamente</a>');
  }

  const novaHash = await bcrypt.hash(nova, 10);
  await db.collection('usuarios').updateOne({ usuario }, { $set: { senha: novaHash } });

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
  const db = await connectDB();
  const usuarioObj = await db.collection('usuarios').findOne({ usuario: u });

  const lista = Object.entries(usuarioObj.aliases || {}).map(([alias, url]) => `
    <li>
      <strong>${alias}</strong> - ${url}
      <form method="POST" action="/excluir-alias">
        <input type="hidden" name="alias" value="${alias}">
        <button>Excluir</button>
      </form>
    </li>
  `).join('');

  let adminPanel = '';
  if (u === 'admin') {
    const usuariosList = await db.collection('usuarios').find({}).toArray();
    adminPanel = `
      <h3>Usuários cadastrados:</h3>
      <ul>
        ${usuariosList.map(user => `<li>${user.usuario} 
        <form method="POST" action="/excluir-usuario">
          <input type="hidden" name="usuario" value="${user.usuario}">
          <button>🗑️ Excluir</button>
        </form>
        </li>`).join('')}
      </ul>
    `;
  }

  res.send(`
    <h1>Painel de ${u}</h1>
    <a href="/logout">Sair</a>
    ${adminPanel}
    <h3>Aliases cadastrados:</h3>
    <ul>${lista || '<li>Nenhum alias cadastrado.</li>'}</ul>
  `);
});

// Cadastrar alias
app.post('/cadastrar-alias', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  const { alias, url } = req.body;
  const aNorm = normalizar(alias);
  const db = await connectDB();

  await db.collection('usuarios').updateOne(
    { usuario: u },
    { $set: { [`aliases.${aNorm}`]: url } }
  );

  res.redirect('/painel');
});

// Excluir alias
app.post('/excluir-alias', async (req, res) => {
  const u = req.session.usuario;
  if (!u) return res.redirect('/login');

  const { alias } = req.body;
  const aNorm = normalizar(alias);
  const db = await connectDB();

  await db.collection('usuarios').updateOne(
    { usuario: u },
    { $unset: { [`aliases.${aNorm}`]: "" } }
  );

  res.redirect('/painel');
});

// Admin - excluir usuário
app.post('/excluir-usuario', async (req, res) => {
  const u = req.session.usuario;
  if (u !== 'admin') return res.redirect('/login');

  const { usuario } = req.body;
  const db = await connectDB();
  await db.collection('usuarios').deleteOne({ usuario });

  res.redirect('/painel');
});

// Disparo de alias
app.get('/:alias', async (req, res) => {
  const u = normalizar(req.query.usuario || '');
  const alias = normalizar(req.params.alias);
  if (!u) return res.status(401).send('Usuário inválido.');

  const db = await connectDB();
  const usuarioObj = await db.collection('usuarios').findOne({ usuario: u });
  const url = usuarioObj?.aliases?.[alias];
  if (!url) return res.status(404).send('Alias não encontrado.');

  fireHttpsGet(url, response => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`));
  });
});

// Start
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
