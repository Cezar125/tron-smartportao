import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import https from 'https';
import mongoose from 'mongoose';

const app = express();
const port = 4000;

// ===== MongoDB Setup =====
mongoose.connect('mongodb://127.0.0.1:27017/smartportao', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

// Schema de usuário
const usuarioSchema = new mongoose.Schema({
  usuario: { type: String, unique: true },
  senha: String,
  pergunta: String,
  resposta: String,
  aliases: { type: Map, of: String }
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

// ===== Helpers =====
const normalizar = (texto = '') =>
  String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");

function fireHttpsGet(url, callback) {
  try {
    https.get(url, callback).on('error', err => {
      console.error('Erro na requisição HTTPS:', err);
    });
  } catch (err) {
    console.error('Erro ao chamar fireHttpsGet:', err);
  }
}

// ===== Middleware =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'segredo-cezar',
  resave: false,
  saveUninitialized: true
}));

// ===== Rotas =====
app.get('/', (req, res) => res.redirect('/login'));

// ---------- LOGIN ----------
app.get('/login', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body { background-color: #0A0A0A; color: #00FFFF; font-family: 'Orbitron', sans-serif; text-align: center; padding-top: 50px; }
          input, button { background-color: #1F1F1F; border: 1px solid #8A2BE2; color: #39FF14; padding: 10px; margin: 5px; font-size: 16px; box-shadow: 0 0 10px #8A2BE2; }
          button { background-color: #000; color: #FF1493; border: 1px solid #FF1493; box-shadow: 0 0 10px #FF1493; }
          a { color: #00FFFF; text-decoration: none; }
          h1,h2,h3 { text-shadow: 0 0 10px #00FFFF; }
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
    return res.send(`
      <html>
        <head>
          <style>
            body {background-color:#0A0A0A;color:#FF0000;font-family:'Orbitron',sans-serif;text-align:center;padding-top:100px;}
            h1{text-shadow:0 0 10px #FF0000;}
            a{color:#FF1493;text-decoration:none;font-size:18px;border:1px solid #FF1493;padding:10px 20px;box-shadow:0 0 10px #FF1493;background-color:#000;display:inline-block;margin-top:30px;}
          </style>
        </head>
        <body>
          <h1>Usuário ou senha inválidos.</h1>
          <a href="/login">Voltar</a>
        </body>
      </html>
    `);
  }

  req.session.usuario = usuario;
  res.redirect('/painel');
});

// ---------- CADASTRO ----------
app.get('/registrar', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body { background-color: #0A0A0A; color: #00FFFF; font-family: 'Orbitron', sans-serif; text-align: center; padding-top: 50px; }
          input, button { background-color: #1F1F1F; border: 1px solid #8A2BE2; color: #39FF14; padding: 10px; margin: 5px; font-size: 16px; box-shadow: 0 0 10px #8A2BE2; }
          button { background-color: #000; color: #FF1493; border: 1px solid #FF1493; box-shadow: 0 0 10px #FF1493; }
          a { color: #00FFFF; text-decoration: none; }
          h1,h2,h3 { text-shadow: 0 0 10px #00FFFF; }
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
          <label>Pergunta secreta (ex: nome do filme preferido):</label><br>
          <input type="text" name="pergunta" required><br><br>
          <label>Resposta secreta:</label><br>
          <input type="text" name="resposta" required><br><br>
          <button type="submit">Cadastrar</button>
        </form>
        <p><a href="/login">Já tenho conta</a></p>
        <p><a href="https://link.mercadopago.com.br/smartportao" target="_blank" style="display:inline-block;background-color:#000;color:#FF1493;border:1px solid #FF1493;padding:10px 20px;font-size:16px;box-shadow:0 0 10px #FF1493;text-decoration:none;margin-top:20px;">💳 Apoiar a Skill Smart Portão</a></p>
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

// ---------- CADASTRO SUCESSO ----------
app.get('/cadastro-sucesso', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Cadastro Realizado</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body { background-color:#0A0A0A; color:#00FFFF; font-family:'Orbitron',sans-serif; text-align:center; padding-top:80px; }
          h1 { font-size:36px; text-shadow:0 0 10px #39FF14; color:#39FF14; }
          .neon-button { display:inline-block; margin-top:30px; background-color:#000; color:#00FFFF; border:2px solid #00FFFF; padding:12px 24px; font-size:18px; text-decoration:none; box-shadow:0 0 10px #00FFFF; transition: box-shadow 0.3s ease-in-out, transform 0.2s ease; }
          .neon-button:hover { box-shadow:0 0 20px #00FFFF,0 0 30px #00FFFF; transform:scale(1.05); }
        </style>
        <script>
          function playSound() { const audio = new Audio('https://www.soundjay.com/button/sounds/button-3.mp3'); audio.play(); }
        </script>
      </head>
      <body>
        <h1>✅ Cadastro realizado com sucesso!</h1>
        <a href="/login" class="neon-button" onclick="playSound()">🔙 Voltar ao login</a>
      </body>
    </html>
  `);
});

// ---------- RECUPERAR SENHA ----------
app.get('/recuperar', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          body {background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:80px;}
          input, button {background-color:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #8A2BE2;}
          button {background-color:#000;color:#FF1493;border:1px solid #FF1493;box-shadow:0 0 10px #FF1493;}
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
        <a href="/login" style="display:inline-block;margin-top:20px;background-color:#000;color:#00FFFF;border:1px solid #00FFFF;padding:10px 20px;font-size:16px;text-decoration:none;box-shadow:0 0 10px #00FFFF;">🔙 Voltar ao login</a>
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

// ---------- LOGOUT ----------
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------- PAINEL ----------
app.get('/painel', async (req, res) => {
  const uNome = req.session.usuario;
  if (!uNome) return res.redirect('/login');

  const u = await Usuario.findOne({ usuario: uNome });
  const aliases = u.aliases || new Map();
  const lista = Array.from(aliases.entries()).map(([alias, url]) => `
    <li>
      <strong>${alias}</strong><br>
      <div style="position:relative; overflow-x:auto; white-space:nowrap; padding:10px; background-color:#1F1F1F; border:1px solid #8A2BE2; box-shadow:0 0 10px #8A2BE2; margin-top:5px;">
        <span style="word-break:break-all; color:#39FF14;">${url}</span>
        <button onclick="navigator.clipboard.writeText('${url}');" style="position:absolute; top:5px; right:5px;">📋</button>
      </div>
      <form method="POST" action="/excluir-alias">
        <input type="hidden" name="alias" value="${alias}">
        <button type="submit">Excluir</button>
      </form>
    </li>
  `).join('');

  const adminPanel = uNome === 'admin' ? `
    <h3>Usuários cadastrados</h3>
    <ul>${(await Usuario.find()).map(user => `<li>${user.usuario}</li>`).join('')}</ul>
    <p><a href="/excluir-usuario">🛠️ Administração</a></p>
  ` : '';

  res.send(`
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body { background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding:30px; }
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
        <h3>Painel de ${uNome}</h3>
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

// ---------- CADASTRAR/EXCLUIR ALIAS ----------
app.post('/cadastrar-alias', async (req, res) => {
  const uNome = req.session.usuario;
  if (!uNome) return res.redirect('/login');

  let { alias, url } = req.body;
  alias = normalizar(alias);

  const u = await Usuario.findOne({ usuario: uNome });
  if (!u.aliases) u.aliases = new Map();
  if (u.aliases.has(alias)) return res.send('❌ Esse alias já existe. <a href="/painel">Voltar</a>');

  u.aliases.set(alias, url);
  await u.save();

  res.redirect('/painel');
});

app.post('/excluir-alias', async (req, res) => {
  const uNome = req.session.usuario;
  if (!uNome) return res.redirect('/login');

  let { alias } = req.body;
  alias = normalizar(alias);

  const u = await Usuario.findOne({ usuario: uNome });
  if (u.aliases.has(alias)) {
    u.aliases.delete(alias);
    await u.save();
  }

  res.redirect('/painel');
});

// ---------- ADMIN EXCLUIR USUÁRIOS ----------
app.get('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');

  const usuariosList = await Usuario.find();
  res.send(`
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body { background-color:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding:50px; }
          input, button { background-color:#000;color:#FF1493;border:1px solid #FF1493;padding:10px;margin:5px; font-size:16px; box-shadow:0 0 10px #FF1493; }
        </style>
      </head>
      <body>
        <h1>🛠️ Administração de Usuários</h1>
        <ul>
          ${usuariosList.map(user => `
            <li>${user.usuario} 
              <form style="display:inline;" method="POST" action="/excluir-usuario">
                <input type="hidden" name="usuario" value="${user.usuario}">
                <button type="submit">Excluir</button>
              </form>
            </li>
          `).join('')}
        </ul>
        <p><a href="/painel">Voltar ao Painel</a></p>
      </body>
    </html>
  `);
});

app.post('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');
  const { usuario } = req.body;
  await Usuario.deleteOne({ usuario });
  res.redirect('/excluir-usuario');
});

// ---------- ROTAS DE DISPARO ----------
app.get('/:alias', async (req, res) => {
  const alias = normalizar(req.params.alias);
  const usuario = normalizar(req.query.usuario || '');
  if (!usuario) return res.status(401).send('❌ Usuário não informado.');

  const u = await Usuario.findOne({ usuario });
  const url = u?.aliases?.get(alias);

  if (!url) return res.status(404).send(`❌ Alias "${alias}" não encontrado para o usuário "${usuario}".`);

  fireHttpsGet(url, response => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`));
  });
});

// ===== INICIAR SERVIDOR =====
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));


