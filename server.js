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

// ================= FIREBASE =================
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// ================= MONGODB =================
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

// ================= FUNÇÕES =================
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

// ================= MIDDLEWARES =================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'segredo_super_secreto',
  resave: false,
  saveUninitialized: true
}));

// ================= ROTAS =================

// ---------- LOGIN ----------
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => {
  res.send(`...HTML de login aqui...`); // você pode colar o HTML do login do código anterior
});

app.post('/login', async (req, res) => {
  let { usuario, senha } = req.body;
  usuario = normalizar(usuario);

  const u = await Usuario.findOne({ nome: usuario });
  if (!u || !(await bcrypt.compare(senha, u.senha))) {
    return res.send('❌ Usuário ou senha inválidos. <a href="/login">Voltar</a>');
  }

  req.session.usuario = usuario;
  res.redirect('/painel');
});

// ---------- REGISTRO ----------
app.get('/registrar', (req, res) => { res.send(`...HTML do registro...`); });
app.post('/registrar', async (req, res) => {
  let { usuario, senha, confirmar, pergunta, resposta } = req.body;
  usuario = normalizar(usuario);
  if (senha !== confirmar) return res.send('❌ As senhas não coincidem. <a href="/registrar">Voltar</a>');
  if (await Usuario.findOne({ nome: usuario })) return res.send('❌ Usuário já existe. <a href="/registrar">Voltar</a>');

  const hashSenha = await bcrypt.hash(senha, 10);
  const novo = new Usuario({ nome: usuario, senha: hashSenha, pergunta, resposta, aliases: {}, logs: [] });
  await novo.save();
  res.redirect('/cadastro-sucesso');
});

app.get('/cadastro-sucesso', (req, res) => { res.send('✅ Cadastro realizado! <a href="/login">Login</a>'); });

// ---------- LOGOUT ----------
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// ---------- PAINEL ----------
app.get('/painel', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');

  const u = await Usuario.findOne({ nome: usuario });
  const aliases = u.aliases || new Map();
  let lista = '';
  for (const [alias, url] of aliases) {
    lista += `
<li>
  <strong>${alias}</strong><br>
  <div style="position:relative;overflow-x:auto;white-space:nowrap;padding:10px;background:#1F1F1F;border:1px solid #8A2BE2;box-shadow:0 0 10px #8A2BE2;margin-top:5px;">
    <span style="color:#39FF14;">${url}</span>
    <button onclick="navigator.clipboard.writeText('${url}');alert('✅ Copiado!');">📋</button>
  </div>
  <form method="POST" action="/excluir-alias" style="margin-top:10px;">
    <input type="hidden" name="alias" value="${alias}">
    <button type="submit">Excluir</button>
  </form>
</li>`;
  }

  const adminPanel = usuario === 'admin' ? `
<h3>Usuários cadastrados</h3>
<ul>${(await Usuario.find()).map(u => `<li>${u.nome}</li>`).join('')}</ul>
<p><a href="/excluir-usuario">🛠️ Administração</a></p>` : '';

  res.send(`
<html><body>
<h2>Painel de ${usuario}</h2>
<a href="/logout">Sair</a>
${adminPanel}
<ul>${lista || '<li>Nenhum alias cadastrado</li>'}</ul>
<form method="POST" action="/cadastrar-alias">
<input type="text" name="alias" placeholder="Alias" required>
<input type="text" name="url" placeholder="URL" required>
<button type="submit">Cadastrar</button>
</form>
<form id="form-comando" onsubmit="event.preventDefault(); salvarComando();">
<input type="text" id="comando-alias" placeholder="Alias (frente/fundos/lateral/garagemvip)" required>
<button type="submit">Salvar comando</button>
</form>
<script>
function salvarComando(){
  const alias=document.getElementById('comando-alias').value;
  fetch('/salvar-comando',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alias})})
  .then(r=>r.text()).then(a=>alert(a)).catch(e=>alert('Erro'));
}
</script>
</body></html>
`);
});

// ---------- CADASTRAR / EXCLUIR ALIAS ----------
app.post('/cadastrar-alias', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');
  let { alias, url } = req.body;
  alias = normalizar(alias);
  const u = await Usuario.findOne({ nome: usuario });
  if (!u.aliases) u.aliases = new Map();
  if (u.aliases.has(alias)) return res.send('❌ Alias já existe. <a href="/painel">Voltar</a>');
  u.aliases.set(alias, url);
  await u.save();
  res.redirect('/painel');
});

app.post('/excluir-alias', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/login');
  const alias = normalizar(req.body.alias);
  const u = await Usuario.findOne({ nome: usuario });
  if (u.aliases && u.aliases.has(alias)) { u.aliases.delete(alias); await u.save(); }
  res.redirect('/painel');
});

// ---------- ADMIN EXCLUIR USUÁRIOS ----------
app.get('/excluir-usuario', async (req,res)=>{
  if(req.session.usuario!=='admin') return res.redirect('/login');
  const lista=(await Usuario.find()).map(u=>`<li>${u.nome}<form method="POST" action="/excluir-usuario" style="display:inline;"><input type="hidden" name="usuario" value="${u.nome}"><button>🗑️ Excluir</button></form></li>`).join('');
  res.send(`<h2>Admin Excluir Usuários</h2><ul>${lista}</ul><a href="/painel">Voltar</a>`);
});
app.post('/excluir-usuario', async (req,res)=>{
  if(req.session.usuario!=='admin') return res.redirect('/login');
  await Usuario.deleteOne({ nome: req.body.usuario });
  res.redirect('/excluir-usuario');
});

// ---------- SALVAR COMANDO MANUAL ----------
app.post('/salvar-comando', async (req,res)=>{
  const usuario=req.session.usuario;
  const alias=normalizar(req.body.alias||'');
  if(!usuario||!alias) return res.status(400).send('❌ Dados inválidos');
  const comando = { frente:alias==='frente'?'abrir':'', fundos:alias==='fundos'?'abrir':'', lateral:alias==='lateral'?'abrir':'', garagemvip:alias==='garagemvip'?'abrir':'' };
  try{ await admin.database().ref(`comando/${usuario}`).set(comando); res.send(`✅ Comando '${alias}' salvo`);}
  catch(e){console.error(e); res.status(500).send('❌ Erro ao salvar comando');}
});

// ---------- ABRIR PORTÃO / ALIAS FIXOS ----------
app.get('/abrir-portao', async (req,res)=>{
  const usuario=normalizar(req.query.usuario||'');
  const alias=normalizar(req.query.alias||'');
  const u = await Usuario.findOne({ nome: usuario });
  if(!u) return res.status(404).send(`❌ Usuário "${usuario}" não encontrado`);
  const url = u.aliases?.get(alias);
  if(!url) return res.status(404).send(`❌ Alias "${alias}" não encontrado`);
  https.get(url, r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>res.send(`✅ Disparo enviado para "${alias}". Resposta: ${d}`));}).on('error', e=>{console.error(e); res.status(500).send('❌ Erro ao disparar URL')});
});

// ---------- CATCH-ALL PARA ALIAS ----------
app.get('/:alias', async (req,res)=>{
  const alias=normalizar(req.params.alias);
  const usuario=normalizar(req.query.usuario||'');
  if(!usuario) return res.status(401).send('❌ Usuário não informado');
  const u = await Usuario.findOne({ nome: usuario });
  if(!u) return res.status(404).send(`❌ Usuário "${usuario}" não encontrado`);
  const url = u.aliases?.get(alias);
  if(!url) return res.status(404).send(`❌ Alias "${alias}" não encontrado`);
  https.get(url, r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>res.send(`✅ Disparo enviado para "${alias}". Resposta: ${d}`));}).on('error', e=>{console.error(e); res.status(500).send('❌ Erro ao disparar URL')});
});

// ---------- INICIAR SERVIDOR ----------
app.listen(port,()=>console.log(`🚀 Servidor rodando na porta ${port}`));
