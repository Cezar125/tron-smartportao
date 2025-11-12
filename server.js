import express from 'express';
import session from 'express-session';
import connectMongoDBSession from 'connect-mongodb-session';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import https from 'https'; // Necessário para a função fireHttpsGet
import dotenv from 'dotenv';
import admin from 'firebase-admin'; // Firebase Admin SDK para Realtime Database e FCM
import fetch from "node-fetch"; // Para requisições HTTP (para a Cloud Function)
import { GoogleAuth } from 'google-auth-library'; // Para autenticação com Google Play Developer API (se ainda usar /api/subscription/save-token)

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// 🛑 INICIALIZA O MONGODB STORE PARA SESSÕES
const MongoDBStore = connectMongoDBSession(session);

// ================== CONFIGURAÇÃO FIREBASE ADMIN SDK ==================
let db;
try {
    // É NECESSÁRIO ter a chave de serviço do Firebase Admin SDK como JSON string na variável de ambiente.
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://trontoken-93556-default-rtdb.firebaseio.com" // Seu databaseURL
    });

    db = admin.database(); // Instância para interagir com o Realtime Database
    console.log('✅ Firebase Admin SDK inicializado com sucesso.');
} catch (error) {
    console.error('❌ Erro ao inicializar Firebase Admin SDK. Verifique FIREBASE_SERVICE_ACCOUNT_KEY:', error);
    process.exit(1);
}

// ================== CONFIGURAÇÃO MONGODB ==================
const mongoUri = process.env.MONGODB_URI;

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
    .catch(err => {
        console.error('❌ Erro MongoDB:', err);
        process.exit(1);
    });

// ================== SCHEMAS E MODELOS MONGODB ==================

const usuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    pergunta: String,
    resposta: String,
    aliases: { type: Map, of: String }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

// 🛑 REMOVIDO: O modelo Assinatura do MongoDB foi removido.
// O status da assinatura é agora verificado diretamente no Firebase Realtime Database
// através da Cloud Function 'getSubscriptionStatus'.

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
app.use(express.json()); // Importante para receber JSON

// MIDDLEWARE DE SESSÃO
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
        secure: true, // OnRender usa HTTPS
        sameSite: 'lax'
    }
}));

// ================== FUNÇÃO FIRE HTTPS (para aliases) ==================
function fireHttpsGet(url, callback) {
    return https.get(url, callback);
}

// ================== ROTAS API (Autenticação e Ação) ==================

// -------- ROTA EXISTENTE: GERAR CUSTOM TOKEN DO FIREBASE PARA O APP --------
app.post('/api/auth/firebase-custom-token', async (req, res) => {
    const { userToken } = req.body;
    if (!userToken) {
        console.error('❌ /api/auth/firebase-custom-token: userToken não fornecido.');
        return res.status(400).json({ error: 'User token é obrigatório.' });
    }

    const usuarioNormalizado = normalizar(userToken);

    try {
        const usuarioExistente = await Usuario.findOne({ nome: usuarioNormalizado });

        if (!usuarioExistente) {
            console.warn(`⚠️ /api/auth/firebase-custom-token: Usuário "${usuarioNormalizado}" não encontrado no MongoDB.`);
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const firebaseUid = usuarioNormalizado;
        const customToken = await admin.auth().createCustomToken(firebaseUid);

        console.log(`✅ Custom Token gerado para o usuário Firebase UID: ${firebaseUid}`);
        res.json({ customToken });

    } catch (error) {
        console.error('❌ Erro ao gerar Firebase Custom Token:', error);
        res.status(500).json({ error: 'Erro interno ao gerar token de autenticação.' });
    }
});


// -------- ROTA /api/subscription/save-token (ATENÇÃO: Reavaliar necessidade) --------
// Esta rota do seu app Android salvava o purchaseToken no MongoDB.
// Se a "fonte da verdade" para assinaturas é o Firebase Realtime Database (atualizado pelas RTDNs),
// esta rota pode ser redundante ou precisar ser adaptada para atualizar o Firebase RTDB.
// Por enquanto, mantido como estava, mas com atenção.
app.post('/api/subscription/save-token', async (req, res) => {
    const { userUid, purchaseToken, productId } = req.body;

    if (!userUid || !purchaseToken || productId !== 'tron-pro-mensal') {
        console.error("❌ /api/subscription/save-token: Dados incompletos ou ID de produto incorreto.");
        return res.status(400).json({ error: "Dados incompletos ou ID de produto incorreto." });
    }

    const userId = normalizar(userUid);
    const packageName = "com.tron.portaopro"; // Nome do seu pacote no Play Console

    try {
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });
        const accessToken = await auth.getAccessToken();

        if (!accessToken) throw new Error("Falha ao obter Access Token da Google Auth.");

        const validateUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;
        const googleResponse = await fetch(validateUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const googleData = await googleResponse.json();
        
        // CRÍTICO: Define o status ATIVO
        const isSubscriptionActive = (googleData?.subscriptionState === 0 || googleData?.subscriptionState === 1); 

        // 🛑 ATENÇÃO: Esta rota SALVAVA NO MONGODB.
        // Se a fonte da verdade é o Firebase Realtime Database, esta lógica pode precisar ser redirecionada para lá.
        // Ou, se esta rota serve para um propósito diferente (ex: backup de dados de compra), manter aqui.
        // Por ora, a lógica de Assinatura para Alexa foi movida para o Firebase RTDB.
        console.log(`✅ ATENÇÃO: Assinatura verificada via Google Play API, mas não mais salva no MongoDB para status de Alexa. Ativo: ${isSubscriptionActive}`);


        res.json({ sucesso: true, assinaturaAtiva: isSubscriptionActive });

    } catch (error) {
        console.error("❌ Erro /api/subscription/save-token:", error.message || error);
        res.status(500).json({ sucesso: false, erro: "Erro ao validar e salvar assinatura" });
    }
});


// ================== ROTAS WEB E DE AÇÃO ==================
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

// -------- ROTA CRÍTICA: ACIONAR COMANDO VIA FIREBASE (PARA BIOMETRIA) --------
// 🛑 AGORA CONSULTA A CLOUD FUNCTION 'getSubscriptionStatus' PARA O STATUS DA ASSINATURA.
app.post('/alexa-biometria-trigger', async (req, res) => {
    console.log('## DEBUG: REQUISIÇÃO RECEBIDA EM /alexa-biometria-trigger ##');

    const { portao, usuario } = req.body;
    
    if (!portao || !usuario) {
        console.error('DEBUG: Erro de validação: Parâmetros "portao" e "usuario" são obrigatórios.');
        return res.status(400).send('❌ Parâmetros "portao" e "usuario" são obrigatórios no corpo da requisição.');
    }

    const portaoNormalizado = normalizar(portao);
    const usuarioNormalizado = normalizar(usuario);

    try {
        // --- 1. Verifica se o usuário existe no MongoDB (ainda relevante para o registro do usuário) ---
        const usuarioMongo = await Usuario.findOne({ nome: usuarioNormalizado });
        if (!usuarioMongo) {
            console.error(`DEBUG: Usuário "${usuario}" não encontrado no MongoDB.`);
            return res.status(404).send(`❌ Usuário "${usuario}" não encontrado.`);
        }

        // 🛑 2. CHECK DE ASSINATURA TRON PRO - CONSULTANDO A CLOUD FUNCTION 'getSubscriptionStatus'
        const firebaseSubscriptionApiUrl = `https://us-central1-trontoken-93556.cloudfunctions.net/getSubscriptionStatus?userId=${usuarioNormalizado}`;
        
        // Use a mesma API Key configurada na sua Cloud Function 'getSubscriptionStatus' como FIREBASE_API_KEY_FOR_ONRENDER
        let firebaseApiKey = process.env.FIREBASE_API_KEY_FOR_ONRENDER; 
        
        // --- DEBUG ONRENDER LOGS ---
        console.log(`DEBUG ONRENDER: firebaseApiKey lida do ambiente: [${firebaseApiKey}] (tipo: ${typeof firebaseApiKey})`);
        // --- FIM DEBUG ONRENDER LOGS ---

        if (!firebaseApiKey || typeof firebaseApiKey !== 'string' || firebaseApiKey.trim() === '') {
            console.error('❌ FIREBASE_API_KEY_FOR_ONRENDER não configurada, não é uma string válida, ou está vazia no ambiente do OnRender.');
            return res.status(500).send('Erro interno: Chave de API Firebase não configurada ou inválida.');
        }

        // Assegura que o valor é uma string limpa antes de usar no cabeçalho
        firebaseApiKey = firebaseApiKey.trim(); 

        const subscriptionResponse = await fetch(firebaseSubscriptionApiUrl, {
            headers: { 'x-api-key': firebaseApiKey } // Usando a string limpa
        });

        if (!subscriptionResponse.ok) {
            const errorText = await subscriptionResponse.text();
            console.error(`❌ Erro ao consultar Cloud Function getSubscriptionStatus: ${subscriptionResponse.status} - ${errorText}`);
            // Retorna um erro interno, pois a falha foi na consulta do backend.
            return res.status(500).send('❌ Erro interno ao verificar assinatura com o Firebase.');
        }

        const subscriptionData = await subscriptionResponse.json();
        
        // Verifica se o status da assinatura é ATIVO ou TRIAL (baseado na resposta da Cloud Function)
        if (!subscriptionData.isSubscriber && !subscriptionData.isTrial) {
            console.warn(`⚠️ Acesso negado: Usuário "${usuarioNormalizado}" não possui assinatura ATIVA ou em período de teste.`);
            // Retorna o erro 403 (Forbidden) e uma mensagem para a Skill Alexa
            return res.status(403).send(`❌ O serviço TRON PRO requer uma assinatura ativa ou em teste para o recurso de biometria.`);
        }
        console.log(`✅ Assinatura TRON PRO verificada no Firebase para ${usuarioNormalizado}. Prosseguindo... Status: ${subscriptionData.status}`);
        // 🛑 FIM DO CHECK DE ASSINATURA

        // --- 3. Escreve o comando no Realtime Database ---
        const comandoRef = db.ref(`/comandosPendentes/${usuarioNormalizado}/${portaoNormalizado}`);
        await comandoRef.set({
            acao: 'abrir',
            solicitante: 'alexa',
            usuario: usuarioNormalizado,
            timestamp: admin.database.ServerValue.TIMESTAMP,
            status: 'pendente'
        });
        console.log(`✅ Comando RTDB registrado: /comandosPendentes/${usuarioNormalizado}/${portaoNormalizado}`);

        // --- 4. Obter e enviar FCM Tokens para biometria ---
        const fcmTokensRef = db.ref(`/tokens/${usuarioNormalizado}`);
        const snapshot = await fcmTokensRef.once('value');

        if (!snapshot.exists()) {
            console.warn(`⚠️ Nenhum token FCM encontrado para o usuário ${usuarioNormalizado}.`);
            // Ainda retorna 200 para a Alexa, mas informa que não pôde notificar o celular.
            return res.status(200).send(`✅ Comando salvo no Firebase, mas nenhum dispositivo com token para ${usuario}.`);
        }

        const tokensObj = snapshot.val();
        const registrationTokens = Object.keys(tokensObj || {});
        
        const message = {
            data: {
                userId: usuarioNormalizado,
                portaoAlias: portaoNormalizado,
                tipoComando: 'abrirComBiometria',
                custom_notification_title: 'TRON Smart Portão',
                custom_notification_body: `Toque para confirmar e abrir o portão ${portaoNormalizado}.`
            },
            android: { priority: 'high' },
            apns: { headers: { 'apns-priority': '10' } }
        };
        const response = await admin.messaging().sendEachForMulticast({ tokens: registrationTokens, ...message });
        console.log(`✅ Envio FCM para ${usuarioNormalizado}: ${response.successCount} sucesso(s), ${response.failureCount} fa lha(s).`);

        if (response.failureCount > 0) {
            // Lógica para remover tokens inválidos
            response.responses.forEach(async (resp, idx) => { // Use async aqui para await no remove()
                if (!resp.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(resp.error?.code)) {
                    await db.ref(`/tokens/${usuarioNormalizado}/${registrationTokens[idx]}`).remove();
                    console.log(`🗑️ Token inválido removido: ${registrationTokens[idx]}`);
                }
            });
        }

        res.status(200).send(`✅ Comando '${portao}' enviado para ${usuario}. ${response.successCount} dispositivo(s) notificado(s).`);

    } catch (err) {
        // Loga o erro completo para depuração, se acontecer
        console.error(`❌ Erro INESPERADO no processamento de /alexa-biometria-trigger (${usuario}/${portao}):`, err);
        console.error(`❌ Stack Trace:`, err.stack);
        res.status(500).send(`❌ Erro interno: ${err.message || 'Erro desconhecido'}`);
    }
});



// -------- ROTAS EXISTENTES (REGISTRO, PAINEL, ALIASES, ETC.) --------

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

app.post('/recuperar', async (req, res) => {
    let { usuario, resposta, nova } = req.body;
    usuario = normalizar(usuario);

    const u = await Usuario.findOne({ nome: usuario });
    if (!u) return res.send('❌ Usuário não encontrado. <a href="/recuperar">Tentar novamente</a>');
    if (!u.resposta || u.resposta.toLowerCase().trim() !== String(resposta).toLowerCase().trim())
        return res.send('❌ Resposta secreta incorreta. <a href="/recuperar">Tentar novamente</a>');

    u.senha = await bcrypt.hash(nova, 10);
    await u.save();
    res.send('✅ Senha redefinida com sucesso. <a href="/login">Ir para login</a>');
});

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')) });

app.get('/painel', async (req, res) => {
    const usuario = req.session.usuario;
    if (!usuario) return res.redirect('/login');
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

app.post('/excluir-alias', async (req, res) => {
    const usuario = req.session.usuario;
    if (!usuario) return res.redirect('/login');

    let { alias } = req.body;
    alias = normalizar(alias);

    const u = await Usuario.findOne({ nome: usuario });
    if (u.aliases.has(alias)) { u.aliases.delete(alias); await u.save(); }
    res.redirect('/painel');
});

app.get('/excluir-usuario', async (req, res) => {
    if (req.session.usuario !== 'admin') return res.redirect('/login');

    const lista = (await Usuario.find()).map(u => `<li><strong>${u.nome}</strong>
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

app.post('/excluir-usuario', async (req, res) => {
    if (req.session.usuario !== 'admin') return res.redirect('/login');
    const { usuario } = req.body;
    await Usuario.deleteOne({ nome: usuario });
    res.redirect('/excluir-usuario');
});


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
