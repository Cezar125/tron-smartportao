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

// ========== MIDDLEWARES ==========
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// ================== ROTAS ==================
app.get('/', (req, res) => res.redirect('/login'));

// -------- LOGIN --------
app.get('/login', (req, res) => {
  res.send(`
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body { background:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding-top:50px;}
input,button { background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #8A2BE2;}
button { background:#000;color:#FF1493;border:1px solid #FF1493;box-shadow:0 0 10px #FF1493;cursor:pointer;}
a { color:#00FFFF;text-decoration:none;}
h1,h2,h3 { text-shadow:0 0 10px #00FFFF;}
</style>
</head>
<body>
<h1>TRON</h1>
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

  const u = await Usuario.findOne({ nome: usuario });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send(`<h1 style="color:red;">Usuário ou senha inválidos</h1><a href="/login">Voltar</a>`);
  }

  req.session.usuario = usuario;
  res.redirect('/painel');
});

// -------- REGISTRO --------
app.get('/registrar', (req, res) => {
  res.send(`
<html>
<head><style>body{background:#0A0A0A;color:#00FFFF;text-align:center;padding-top:50px;font-family:Orbitron,sans-serif;}input,button{margin:5px;padding:10px;}button{cursor:pointer;}</style></head>
<body>
<h1>TRON</h1><h3>Cadastro de Usuário</h3>
<form method="POST" action="/registrar">
<input type="text" name="usuario" placeholder="Nome de usuário" required><br>
<input type="password" name="senha" placeholder="Senha" required><br>
<input type="password" name="confirmar" placeholder="Confirmar senha" required><br>
<input type="text" name="pergunta" placeholder="Pergunta secreta" required><br>
<input type="text" name="resposta" placeholder="Resposta secreta" required><br>
<button type="submit">Cadastrar</button>
</form>
<p><a href="/login">Já tenho conta</a></p>
</body></html>
  `);
});

app.post('/registrar', async (req,res)=>{
  let {usuario, senha, confirmar, pergunta, resposta} = req.body;
  usuario = normalizar(usuario);
  if(senha !== confirmar) return res.send('❌ Senhas não coincidem <a href="/registrar">Voltar</a>');
  if(await Usuario.findOne({nome:usuario})) return res.send('❌ Usuário já existe <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha,10);
  const novo = new Usuario({nome:usuario, senha:hashSenha, pergunta, resposta, aliases:{}, logs:[]});
  await novo.save();
  res.redirect('/login');
});

// -------- RECUPERAR SENHA --------
app.get('/recuperar', (req,res)=>{
  res.send(`
<html><body style="background:#0A0A0A;color:#00FFFF;font-family:Orbitron,sans-serif;text-align:center;padding-top:50px;">
<h1>Recuperar senha</h1>
<form method="POST" action="/recuperar">
<input type="text" name="usuario" placeholder="Nome de usuário" required><br>
<button type="submit">Próximo</button>
</form>
<p><a href="/login">Voltar</a></p>
</body></html>
  `);
});

app.post('/recuperar', async (req,res)=>{
  const usuario = normalizar(req.body.usuario);
  const u = await Usuario.findOne({nome:usuario});
  if(!u) return res.send('❌ Usuário não encontrado <a href="/recuperar">Voltar</a>');
  res.send(`
<html><body style="background:#0A0A0A;color:#00FFFF;text-align:center;font-family:Orbitron,sans-serif;padding-top:50px;">
<h1>Pergunta secreta</h1>
<form method="POST" action="/recuperar-senha">
<input type="hidden" name="usuario" value="${usuario}">
<p>${u.pergunta}</p>
<input type="text" name="resposta" placeholder="Resposta" required><br>
<input type="password" name="nova" placeholder="Nova senha" required><br>
<button type="submit">Alterar senha</button>
</form>
</body></html>
  `);
});

app.post('/recuperar-senha', async (req,res)=>{
  const usuario = normalizar(req.body.usuario);
  const {resposta,nova} = req.body;
  const u = await Usuario.findOne({nome:usuario});
  if(u.resposta !== resposta) return res.send('❌ Resposta incorreta <a href="/recuperar">Voltar</a>');
  u.senha = await bcrypt.hash(nova,10);
  await u.save();
  res.send('✅ Senha alterada com sucesso <a href="/login">Login</a>');
});

// ---------- PAINEL ----------
app.get('/painel', async (req,res)=>{
  const usuario = req.session.usuario;
  if(!usuario) return res.redirect('/login');

  const u = await Usuario.findOne({nome:usuario});
  const aliases = u.aliases || new Map();

  let lista = '';
  for(const [alias, url] of aliases){
    lista += `<li>
      <strong>${alias}</strong>
      <div style="position:relative;overflow-x:auto;white-space:nowrap;padding:10px;background:#1F1F1F;border:1px solid #8A2BE2;margin-top:5px;box-shadow:0 0 10px #8A2BE2;">
        <span style="color:#39FF14;word-break:break-word;">${url}</span>
        <button onclick="navigator.clipboard.writeText('${url}'); const msg=document.createElement('span'); msg.textContent='✅ Copiado!'; msg.style='position:absolute;top:5px;left:5px;color:#00FFFF;font-size:12px;background:#000;padding:2px 6px;border:1px solid #00FFFF;box-shadow:0 0 5px #00FFFF;'; this.parentElement.appendChild(msg); setTimeout(()=>msg.remove(),2000);"
          style="position:absolute;top:5px;right:5px;background:#000;color:#FF1493;border:1px solid #FF1493;padding:5px;font-size:12px;cursor:pointer;">📋
        </button>
      </div>
      <form method="POST" action="/excluir-alias" style="margin-top:5px;">
        <input type="hidden" name="alias" value="${alias}">
        <button style="background:#000;color:#FF1493;border:1px solid #FF1493;padding:5px 10px;font-size:14px;cursor:pointer;">Excluir</button>
      </form>
    </li>`;
  }

  const adminPanel = usuario==='admin' ? `<h3>Usuários cadastrados</h3>
    <ul>${(await Usuario.find()).map(u=>`<li>${u.nome}</li>`).join('')}</ul>
    <p><a href="/excluir-usuario">🛠️ Administração</a></p>` : '';

  res.send(`
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap');
body{background:#0A0A0A;color:#00FFFF;font-family:'Orbitron',sans-serif;text-align:center;padding:30px;}
h1,h2,h3{text-shadow:0 0 10px #00FFFF;}
ul{list-style:none;padding:0;}
li{background:#1F1F1F;border:1px solid #8A2BE2;color:#39FF14;padding:10px;margin:10px auto;width:80%;box-shadow:0 0 10px #8A2BE2;position:relative;}
input,button{background:#000;color:#FF1493;border:1px solid #FF1493;padding:10px;margin:5px;font-size:16px;box-shadow:0 0 10px #FF1493;}
a{color:#00FFFF;text-decoration:none;}
</style>
</head>
<body>
<h1>TRON</h1>
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
<h3>Salvar comando manual</h3>
<form id="form-comando" onsubmit="event.preventDefault(); salvarComando();">
<input type="text" id="comando-alias" placeholder="Alias (ex: frente)" required><br>
<button type="submit">Salvar comando</button>
</form>
<script>
function salvarComando(){
  const alias=document.getElementById('comando-alias').value;
  fetch('/salvar-comando',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alias})})
  .then(res=>res.text()).then(msg=>alert(msg))
  .catch(err=>alert('Erro ao salvar comando'));
}
</script>
</body>
</html>
  `);
});

// ---------- CADASTRAR / EXCLUIR ALIAS ----------
app.post('/cadastrar-alias', async (req,res)=>{
  const usuario=req.session.usuario;
  if(!usuario) return res.redirect('/login');
  let {alias,url}=req.body;
  alias=normalizar(alias);
  const u=await Usuario.findOne({nome:usuario});
  if(!u.aliases) u.aliases=new Map();
  if(u.aliases.has(alias)) return res.send('❌ Alias já existe <a href="/painel">Voltar</a>');
  u.aliases.set(alias,url);
  await u.save();
  res.redirect('/painel');
});

app.post('/excluir-alias', async (req,res)=>{
  const usuario=req.session.usuario;
  if(!usuario) return res.redirect('/login');
  const {alias}=req.body;
  const u=await Usuario.findOne({nome:usuario});
  u.aliases.delete(normalizar(alias));
  await u.save();
  res.redirect('/painel');
});

// ---------- LOGOUT ----------
app.get('/logout',(req,res)=>{req.session.destroy(()=>res.redirect('/login'));});

// ---------- SALVAR COMANDO ----------
app.post('/salvar-comando', async (req,res)=>{
  const usuario=req.session.usuario;
  const alias=normalizar(req.body.alias||'');
  if(!usuario||!alias) return res.status(400).send('❌ Dados inválidos');
  const comando={frente:alias==='frente'?'abrir':'',fundos:alias==='fundos'?'abrir':'',lateral:alias==='lateral'?'abrir':'',garagemvip:alias==='garagemvip'?'abrir':''};
  try{
    await admin.database().ref(`comando/${usuario}`).set(comando);
    res.send(`✅ Comando '${alias}' enviado com sucesso`);
  }catch(err){console.error(err);res.status(500).send('❌ Erro ao enviar comando');}
});

// ---------- ADMIN EXCLUIR USUÁRIOS ----------
app.get('/excluir-usuario', async (req,res)=>{
  if(req.session.usuario!=='admin') return res.redirect('/login');
  const lista = (await Usuario.find()).map(u=>`<li>${u.nome} <form method="POST" action="/excluir-usuario" style="display:inline;"><input type="hidden" name="usuario" value="${u.nome}"><button type="submit">🗑️ Excluir</button></form></li>`).join('');
  res.send(`<html><body style="background:#0A0A0A;color:#00FFFF;font-family:Orbitron,sans-serif;text-align:center;padding:50px;">
<h1>Administração</h1>
<ul>${lista}</ul>
<a href="/painel">Voltar</a></body></html>`);
});

app.post('/excluir-usuario', async (req,res)=>{
  if(req.session.usuario!=='admin') return res.redirect('/login');
  const {usuario}=req.body;
  await Usuario.deleteOne({nome:usuario});
  res.redirect('/excluir-usuario');
});

// ---------- SERVIDOR ----------
app.listen(port,()=>console.log(`🚀 Servidor rodando na porta ${port}`));
