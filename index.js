// index.js — Envio de push FCM para acordar o app TronAccess
import express from "express";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// 🔹 Inicializa o Firebase Admin SDK com a chave privada (baixe do Firebase)
import serviceAccount from "./tron-service-account.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://SEU_PROJETO.firebaseio.com"
});

// 🔹 Rota que a Skill Alexa ou o painel chamam para abrir o portão
app.post("/enviar-comando", async (req, res) => {
  try {
    const { userId, portao } = req.body;

    if (!userId || !portao) {
      return res.status(400).json({ erro: "Parâmetros ausentes (userId, portao)" });
    }

    console.log(`📡 Enviando comando '${portao}' para usuário '${userId}'`);

    // 1️⃣ Busca o token FCM do usuário no Realtime Database
    const db = admin.database();
    const tokenSnapshot = await db.ref(`tokens/${userId}`).get();

    if (!tokenSnapshot.exists()) {
      return res.status(404).json({ erro: "Token não encontrado para este usuário" });
    }

    const token = tokenSnapshot.val();

    // 2️⃣ Monta a mensagem push FCM
    const mensagem = {
      token,
      notification: {
        title: "Abrir Portão",
        body: `Ação solicitada: ${portao}`
      },
      data: {
        acao: "abrir",
        portao: portao,
        userId: userId
      }
    };

    // 3️⃣ Envia a notificação
    await admin.messaging().send(mensagem);

    console.log(`✅ Mensagem enviada para ${userId} (${portao})`);
    res.json({ sucesso: true, mensagem: "Comando enviado com sucesso" });

  } catch (erro) {
    console.error("❌ Erro ao enviar comando:", erro);
    res.status(500).json({ erro: "Falha ao enviar comando FCM" });
  }
});

// 🔹 Inicia o servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor FCM rodando na porta ${PORT}`);
});
