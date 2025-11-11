import express from 'express';
import session from 'express-session';
import connectMongoDBSession from 'connect-mongodb-session';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import https from 'https'; // Já estava no seu código
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// 🛑 INICIALIZA O MONGODB STORE
const MongoDBStore = connectMongoDBSession(session);

// ================== CONFIGURAÇÃO FIREBASE ADMIN SDK ==================
try {
    // É MELHOR passar a chave como uma string JSON ENCODADA em uma variável de ambiente,
    // em vez de esperar um arquivo. Ex: process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{ "type": "service_account", ... }'
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://trontoken-93556-default-rtdb.firebaseio.com" // Seu databaseURL
    });

    console.log('✅ Firebase Admin SDK inicializado com sucesso.');
} catch (error) {
    console.error('❌ Erro ao inicializar Firebase Admin SDK. Verifique FIREBASE_SERVICE_ACCOUNT_KEY:', error);
    process.exit(1); // Encerra o processo se o Firebase Admin SDK não puder ser inicializado
}
const db = admin.database(); // Instância para interagir com o Realtime Database

// ================== CONFIGURAÇÃO MONGODB ==================
const mongoUri = process.env.MONGODB_URI;

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
    .catch(err => {
        console.error('❌ Erro MongoDB:', err);
        process.exit(1); // Encerra o processo se não puder conectar ao MongoDB
    });

const usuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true }, // Adicionado unique para garantir que o nome seja único
    senha: { type: String, required: true },
    pergunta: String,
    resposta: String,
    aliases: { type: Map, of: String }
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

// 🛑 CONFIGURAÇÃO DO STORE DE SESSÃO DO MONGODB
const store = new MongoDBStore({
  uri: mongoUri,
  collection: 'tronSessions'
});

store.on('error', function(error) {
  console.error('❌ Erro no MongoDB Session Store:', error);
});


// ================== FUNÇÃO DE NORMALIZAÇÃO ==================
const normalizar = (texto = '') => {
    return String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "");
};

// ================== MIDDLEWARES ==================
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Importante para receber JSON do app Android

// MIDDLEWARE DE SESSÃO
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
        secure: true, // OnRender usa HTTPS, então true
        sameSite: 'lax'
    }
}));

// ================== FUNÇÃO FIRE HTTPS ==================
function fireHttpsGet(url, callback) {
    return https.get(url, callback);
}

// ================== ROTAS ==================
app.get('/', (req, res) => res.redirect('/login'));

// -------- ROTA EXISTENTE: LOGIN --------
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
<label>Token de usuário:</label><br>
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

// -------- NOVA ROTA: GERAR CUSTOM TOKEN DO FIREBASE PARA O APP --------
// Esta rota não faz login via sessão, ela é um API endpoint para o app.
app.post('/api/auth/firebase-custom-token', async (req, res) => {
    const { userToken } = req.body; // userToken é o "beta234" vindo do app

    if (!userToken) {
        console.error('❌ /api/auth/firebase-custom-token: userToken não fornecido.');
        return res.status(400).json({ error: 'User token é obrigatório.' });
    }

    const usuarioNormalizado = normalizar(userToken); // Normalize o token para a busca no DB

    try {
        // 1. Validar o userToken contra seu MongoDB
        const usuarioExistente = await Usuario.findOne({ nome: usuarioNormalizado });

        if (!usuarioExistente) {
            console.warn(`⚠️ /api/auth/firebase-custom-token: Usuário "${usuarioNormalizado}" não encontrado no MongoDB.`);
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        // 2. Gerar o Custom Token do Firebase
        // O UID passado para createCustomToken será o `auth.uid` no Firebase Authentication.
        // Ele DEVE corresponder ao `$userId` nas suas regras do Realtime Database.
        const firebaseUid = usuarioNormalizado; // Usando o nome normalizado do usuário como UID no Firebase

        const customToken = await admin.auth().createCustomToken(firebaseUid);

        console.log(`✅ Custom Token gerado para o usuário Firebase UID: ${firebaseUid}`);
        res.json({ customToken });

    } catch (error) {
        console.error('❌ Erro ao gerar Firebase Custom Token:', error);
        res.status(500).json({ error: 'Erro interno ao gerar token de autenticação.' });
    }
});
// ✅ ROTA PARA VALIDAR ASSINATURA DO GOOGLE PLAY
import fetch from "node-fetch";

app.post('/googleplay/validate', async (req, res) => {
    const { usuarioToken, purchaseToken } = req.body;

    if (!usuarioToken || !purchaseToken) {
        return res.status(400).json({ error: "usuarioToken e purchaseToken são obrigatórios." });
    }

    const userId = normalizar(usuarioToken);
    const packageName = "com.tron.portaopro"; // ✅ Nome do seu app no Play Console
    const productId = "tron-pro-mensal"; // ✅ ID da assinatura no Play Console

    console.log(`📌 Validando assinatura de ${userId}`);

    try {
        // ✅ Busca Access Token para chamar API da Google Play
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
                grant_type: "refresh_token",
            }),
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            console.error("❌ Erro ao gerar Access Token", tokenData);
            return res.status(500).json({ error: "Falha ao gerar token Google Play" });
        }

        // ✅ Consulta status real da assinatura
        const validateUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;
        const googleResponse = await fetch(validateUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const googleData = await googleResponse.json();
        console.log("📩 Status Google API:", googleData);

        const ativo = googleData?.paymentState === 1 || googleData?.autoRenewing === true;

        const dadosAssinatura = {
            ativo,
            purchaseToken,
            expiraEm: googleData.expiryTimeMillis || null,
            autoRenova: googleData.autoRenewing || false,
            atualizadoEm: Date.now(),
        };

        // ✅ Atualiza no Firebase Realtime DB
        await db.ref(`/assinaturas/${userId}`).set(dadosAssinatura);

        console.log(`✅ Assinatura atualizada no Firebase para ${userId}`);

        res.json({
            sucesso: true,
            assinaturaAtiva: ativo,
            dados: dadosAssinatura,
        });

    } catch (error) {
        console.error("❌ Erro /googleplay/validate:", error);
        res.status(500).json({ sucesso: false, erro: "Erro ao validar assinatura" });
    }
});


// -------- ROTAS EXISTENTES: REGISTRO --------
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
<h3>Cadastro de Usuário Token</h3>
<form method="POST" action="/registrar">
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

// -------- ROTAS EXISTENTES: CADASTRO SUCESSO --------
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

// -------- ROTAS EXISTENTES: RECUPERAR SENHA --------
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
<label>Usuário:Token</label><br>
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

// -------- ROTAS EXISTENTES: LOGOUT --------
app.get('/logout', (req,res)=>{ req.session.destroy(()=>res.redirect('/login')) });

// -------- ROTAS EXISTENTES: PAINEL --------
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

// -------- ROTAS EXISTENTES: CADASTRAR ALIAS --------
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

// -------- ROTAS EXISTENTES: EXCLUIR ALIAS --------
app.post('/excluir-alias', async (req,res)=>{
    const usuario = req.session.usuario;
    if(!usuario) return res.redirect('/login');

    let { alias } = req.body;
    alias = normalizar(alias);

    const u = await Usuario.findOne({ nome: usuario });
    if(u.aliases.has(alias)) { u.aliases.delete(alias); await u.save(); }
    res.redirect('/painel');
});

// -------- ROTAS EXISTENTES: ADMIN EXCLUIR USUÁRIOS --------
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

// ================== ROTA: ACIONAR COMANDO VIA FIREBASE (PARA BIOMETRIA) ==================
app.post('/alexa-biometria-trigger', async (req, res) => {
    console.log('####################################################');
    console.log('## DEBUG: REQUISIÇÃO RECEBIDA EM /alexa-biometria-trigger ##');
    console.log(`DEBUG: Método: ${req.method}. Corpo: ${JSON.stringify(req.body)}`);
    console.log('####################################################');

    const { portao, usuario } = req.body;

    if (!portao || !usuario) {
        console.error('DEBUG: Erro de validação: Parâmetros "portao" e "usuario" são obrigatórios.');
        return res.status(400).send('❌ Parâmetros "portao" e "usuario" são obrigatórios no corpo da requisição.');
    }

    const portaoNormalizado = normalizar(portao);
    const usuarioNormalizado = normalizar(usuario);

    try {
        // --- Verifica se o usuário existe no MongoDB ---
        const usuarioMongo = await Usuario.findOne({ nome: usuarioNormalizado });
        if (!usuarioMongo) {
            console.error(`DEBUG: Usuário "${usuario}" não encontrado no MongoDB.`);
            return res.status(404).send(`❌ Usuário "${usuario}" não encontrado no MongoDB.`);
        }

        // --- 1. Escreve o comando no Realtime Database ---
        const comandoRef = db.ref(`/comandosPendentes/${usuarioNormalizado}/${portaoNormalizado}`);
        await comandoRef.set({
            acao: 'abrir',
            solicitante: 'alexa',
            usuario: usuarioNormalizado,
            timestamp: admin.database.ServerValue.TIMESTAMP,
            status: 'pendente'
        });
        console.log(`✅ Comando RTDB registrado: /comandosPendentes/${usuarioNormalizado}/${portaoNormalizado}`);

        // --- 2. Obter TODOS os FCM Tokens do usuário ---
        const fcmTokensRef = db.ref(`/tokens/${usuarioNormalizado}`);
        const snapshot = await fcmTokensRef.once('value');

        if (!snapshot.exists()) {
            console.warn(`⚠️ Nenhum token encontrado para o usuário ${usuarioNormalizado}.`);
            return res.status(200).send(`✅ Comando salvo no Firebase, mas nenhum dispositivo com token para ${usuario}.`);
        }

        const tokensObj = snapshot.val();
        const registrationTokens = Object.keys(tokensObj || {});

        console.log(`📱 Tokens recuperados para ${usuarioNormalizado}:`, registrationTokens);

        if (registrationTokens.length === 0) {
            console.warn(`⚠️ Usuário ${usuarioNormalizado} não possui tokens válidos.`);
            return res.status(200).send(`✅ Comando salvo, mas sem tokens válidos para ${usuario}.`);
        }

        // --- 3. Monta a mensagem FCM ---
        const message = {
            data: {
                userId: usuarioNormalizado,
                portaoAlias: portaoNormalizado,
                tipoComando: 'abrirComBiometria',
                custom_notification_title: 'TRON Smart Portão',
                custom_notification_body: `Toque para confirmar e abrir o portão ${portaoNormalizado}.`
            },
            android: {
                priority: 'high'
            },
            apns: {
                headers: { 'apns-priority': '10' }
            }
        };

        // --- 4. Envia para TODOS os dispositivos desse usuário ---
        const response = await admin.messaging().sendEachForMulticast({
            tokens: registrationTokens,
            ...message
        });

        console.log(`✅ Envio FCM para ${usuarioNormalizado}: ${response.successCount} sucesso(s), ${response.failureCount} falha(s).`);

        // --- 5. Remove tokens inválidos automaticamente ---
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errCode = resp.error?.code;
                    const tokenInvalido = registrationTokens[idx];
                    console.error(`❌ Falha no token ${tokenInvalido}: ${errCode}`);

                    if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(errCode)) {
                        db.ref(`/tokens/${usuarioNormalizado}/${tokenInvalido}`).remove();
                        console.log(`🗑️ Token inválido removido: ${tokenInvalido}`);
                    }
                }
            });
        }

        res.status(200).send(`✅ Comando '${portao}' enviado para ${usuario}. ${response.successCount} dispositivo(s) notificado(s).`);

    } catch (err) {
        console.error(`❌ Erro em /alexa-biometria-trigger (${usuario}/${portao}):`, err);
        res.status(500).send(`❌ Erro interno: ${err.message || 'Erro desconhecido'}`);
    }
});

// -------- ROTAS EXISTENTES: GARAGEMVIP --------
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

        // DISPARO DIRETO DA URL (fluxo "com senha")
        fireHttpsGet(url, response => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                if (!res.headersSent) {
                    res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`);
                }
            });
        }).on('error', err => {
            if (!res.headersSent) {
                console.error('Erro ao disparar a URL:', err.message);
                res.status(500).send('❌ Erro ao disparar a URL.');
            }
        });

    } catch (err) {
        console.error('Erro em /garagemvip:', err);
        if (!res.headersSent) {
            res.status(500).send('❌ Internal Server Error');
        }
    }
});

// -------- CATCH-ALL PARA QUALQUER OUTRO ALIAS --------
app.get('/:alias', async (req, res) => {
    try {
        const alias = normalizar(req.params.alias);
        const usuario = normalizar(req.query.usuario || '');

        if (!usuario) return res.status(401).send('❌ Usuário não informado.');

        const u = await Usuario.findOne({ nome: usuario }).lean();
        if (!u) return res.status(404).send(`❌ Usuário "${usuario}" não encontrado.`);

        const url = u.aliases?.[alias];
        if (!url) return res.status(404).send(`❌ Alias "${alias}" não encontrado para o usuário "${usuario}".`);

        // DISPARO DIRETO DA URL (fluxo "com senha")
        fireHttpsGet(url, response => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                if (!res.headersSent) {
                    res.send(`✅ Disparo enviado para "${alias}". Resposta: ${data}`);
                }
            });
        }).on('error', err => {
            if (!res.headersSent) {
                console.error('Erro ao disparar a URL:', err.message);
                res.status(500).send('❌ Erro ao disparar a URL.');
            }
        });

    } catch (err) {
        console.error('Erro em /:alias:', err);
        if (!res.headersSent) {
            res.status(500).send('❌ Internal Server Error');
        }
    }
});

// ==================== INICIAR SERVIDOR ====================
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
