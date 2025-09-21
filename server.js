import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import https from 'https';
import { connectDB } from './config/mongo.js';


const app = express();
const port = 4000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'segredo-cezar',
  resave: false,
  saveUninitialized: true
}));

// Normalização de texto
const normalizar = (texto = '') => String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");

// Wrapper para HTTPS
const fireHttpsGet = (url, callback) => {
  try {
    https.get(url, callback).on('error', err => console.error('Erro HTTPS:', err));
  } catch (err) { console.error('Erro fireHttpsGet:', err); }
};

// Conectar MongoDB
let usuariosCollection;
(async () => {
  usuariosCollection = await conectarMongo();
})();

// Rotas públicas
app.get('/', (req, res) => res.redirect('/login'));

// ===================== LOGIN =====================
app.get('/login', (req, res) => {
  res.send(`
  <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
        body{background:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:50px;}
        input,button{background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #8A2BE2;}
        button{background:#000;color:#FF1493;border:1px solid #FF1493;box-shadow:0 0 10px #FF1493;}
        h1,h2,h3{text-shadow:0 0 10px #00FFFF;}
        a{color:#00FFFF;text-decoration:none;}
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
  const usuario = normalizar(req.body.usuario);
  const senha = req.body.senha;

  const u = await usuariosCollection.findOne({ usuario });

  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send(`<h1 style="color:red;text-align:center;margin-top:100px;">Usuário ou senha inválidos.</h1><p style="text-align:center;"><a href="/login">Voltar</a></p>`);
  }

  req.session.usuario = usuario;
  res.redirect('/painel');
});

// ===================== REGISTRO =====================
app.get('/registrar', (req, res) => {
  res.send(`
  <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
        body{background:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:50px;}
        input,button{background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #8A2BE2;}
        button{background:#000;color:#FF1493;border:1px solid #FF1493;box-shadow:0 0 10px #FF1493;}
        h1,h2,h3{text-shadow:0 0 10px #00FFFF;}
        a{color:#00FFFF;text-decoration:none;}
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
  const usuario = normalizar(req.body.usuario);
  const senha = req.body.senha;
  const confirmar = req.body.confirmar;
  const pergunta = req.body.pergunta;
  const resposta = req.body.resposta;

  if (senha !== confirmar) return res.send('❌ Senhas não coincidem. <a href="/registrar">Voltar</a>');

  const existe = await usuariosCollection.findOne({ usuario });
  if (existe) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);
  await usuariosCollection.insertOne({ usuario, senha: hashSenha, pergunta, resposta, aliases: {} });

  res.redirect('/cadastro-sucesso');
});

// ===================== CADASTRO SUCESSO =====================
app.get('/cadastro-sucesso', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          body{background:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:80px;}
          h1{text-shadow:0 0 10px #39FF14;color:#39FF14;}
          .neon-button{display:inline-block;margin-top:30px;background:#000;color:#00FFFF;border:2px solid #00FFFF;padding:12px 24px;font-size:18px;text-decoration:none;box-shadow:0 0 10px #00FFFF;transition:0.3s;}
          .neon-button:hover{box-shadow:0 0 20px #00FFFF,0 0 30px #00FFFF;transform:scale(1.05);}
        </style>
        <script>function playSound(){new Audio('/public/button.mp3').play();}</script>
      </head>
      <body>
        <h1>✅ Cadastro realizado com sucesso!</h1>
        <a href="/login" class="neon-button" onclick="playSound()">🔙 Voltar ao login</a>
      </body>
    </html>
  `);
});

// ===================== RECUPERAR SENHA =====================
app.get('/recuperar', (req, res) => {
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

app.post('/recuperar', async (req, res) => {
  const usuario = normalizar(req.body.usuario);
  const resposta = req.body.resposta;
  const nova = req.body.nova;

  const u = await usuariosCollection.findOne({ usuario });
  if (!u) return res.send('❌ Usuário não encontrado. <a href="/recuperar">Tentar novamente</a>');
  if (!u.resposta || u.resposta.toLowerCase().trim() !== resposta.toLowerCase().trim())
    return res.send('❌ Resposta secreta incorreta. <a href="/recuperar">Tentar novamente</a>');

  const novaHash = await bcrypt.hash(nova, 10);
  await usuariosCollection.updateOne({ usuario }, { $set: { senha: novaHash } });

  res.send('✅ Senha redefinida com sucesso. <a href="/login">Ir para login</a>');
});

// ===================== LOGOUT =====================
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ===================== PAINEL =====================
app.get('/painel', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  const u = await usuariosCollection.findOne({ usuario });
  const aliases = u?.aliases || {};
  const lista = Object.entries(aliases).map(([alias, url]) => `
    <li>
      <strong>${alias}</strong><br>
      <div style="position:relative; overflow-x:auto; white-space:nowrap; padding:10px; background:#1F1F1F; border:1px solid #8A2BE2; box-shadow:0 0 10px #8A2BE2; margin-top:5px;">
        <span style="word-break:break-all;color:#39FF14;">${url}</span>
        <button onclick="navigator.clipboard.writeText('${url}');const msg=document.createElement('span');msg.textContent='✅ Copiado!';msg.style='position:absolute;top:5px;left:5px;color:#00FFFF;font-size:12px;background:#000;padding:2px 6px;border:1px solid #00FFFF;box-shadow:0 0 5px #00FFFF;';this.parentElement.appendChild(msg);setTimeout(()=>msg.remove(),2000);"
          style="position:absolute; top:5px; right:5px; background:#000; color:#FF1493; border:1px solid #FF1493; padding:5px; font-size:12px; cursor:pointer;">📋</button>
      </div>
      <form method="POST" action="/excluir-alias" style="margin-top:10px;">
        <input type="hidden" name="alias" value="${alias}">
        <button type="submit">Excluir</button>
      </form>
    </li>
  `).join('');

  const adminPanel = usuario === 'admin' ? `
    <h3>Usuários cadastrados</h3>
    <ul>${(await usuariosCollection.find().toArray()).map(u => `<li>${u.usuario}</li>`).join('')}</ul>
    <p><a href="/excluir-usuario">🛠️ Administração</a></p>
  ` : '';

  res.send(`
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
          body{background:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding:30px;}
          h1,h2,h3{text-shadow:0 0 10px #00FFFF;}
          ul{list-style:none;padding:0;}
          li{background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:10px auto;width:80%;box-shadow:0 0 10px #8A2BE2;}
          input,button{background:#000;color:#FF1493;border:1px solid #FF1493;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #FF1493;}
          a{color:#00FFFF;text-decoration:none;}
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

// ===================== CADASTRAR / EXCLUIR ALIAS =====================
app.post('/cadastrar-alias', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  let alias = normalizar(req.body.alias);
  const url = req.body.url;

  const u = await usuariosCollection.findOne({ usuario });
  const aliases = u.aliases || {};

  if (aliases[alias]) return res.send('❌ Esse alias já existe. <a href="/painel">Voltar</a>');

  aliases[alias] = url;
  await usuariosCollection.updateOne({ usuario }, { $set: { aliases } });
  res.redirect('/painel');
});

app.post('/excluir-alias', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  let alias = normalizar(req.body.alias);
  const u = await usuariosCollection.findOne({ usuario });
  if (u.aliases?.[alias]) delete u.aliases[alias];

  await usuariosCollection.updateOne({ usuario }, { $set: { aliases: u.aliases } });
  res.redirect('/painel');
});

// ===================== ADMIN =====================
app.get('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');

  const todos = await usuariosCollection.find().toArray();
  const lista = todos.map(u => `
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

app.post('/excluir-usuario', async (req, res) => {
  if (req.session.usuario !== 'admin') return res.redirect('/login');

  const usuario = req.body.usuario;
  await usuariosCollection.deleteOne({ usuario });
  res.redirect('/excluir-usuario');
});

// ===================== DISPARO ALIAS =====================
app.get('/:alias', async (req, res) => {
  const alias = normalizar(req.params.alias);
  const usuario = normalizar(req.query.usuario || '');
  if (!usuario) return res.status(401).send('❌ Usuário não informado.');

  const u = await usuariosCollection.findOne({ usuario });
  const url = u?.aliases?.[alias];
  if (!url) return res.status(404).send(`❌ Alias "${alias}" não encontrado para "${usuario}".`);

  fireHttpsGet(url, response => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`));
  });
});

// ===================== START SERVER =====================
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
