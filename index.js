import express from "express";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

// 🔹 Caminho do seu arquivo JSON de credenciais do Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);

// 🔹 Inicializa Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://trontoken-93556-default-rtdb.firebaseio.com",
});

const db = admin.database();

// --- Função para enviar notificação FCM ---
async function enviarNotificacaoPush(userId, portao) {
  try {
    const tokenRef = db.ref(`tokens/${userId}`);
    const snapshot = await tokenRef.once("value");
    const token = snapshot.val();

    if (!token) {
      console.log(`⚠️ Nenhum token FCM encontrado para ${userId}`);
      return;
    }

    const mensagem = {
      token,
      notification: {
        title: "TronAccess 🚪",
        body: `Comando recebido: abrir ${portao}`,
      },
      data: {
        portao: portao,
        acao: "abrir",
      },
      android: {
        priority: "high",
      },
    };

    await admin.messaging().send(mensagem);
    console.log(`✅ Notificação enviada para ${userId} (${portao})`);
  } catch (error) {
    console.error("❌ Erro ao enviar notificação:", error);
  }
}

// --- Endpoint para simular comando vindo da Alexa ---
app.post("/enviar-comando", async (req, res) => {
  const { userId, portao, acao } = req.body;

  if (!userId || !portao || !acao) {
    return res.status(400).json({ erro: "Parâmetros inválidos" });
  }

  try {
    await db.ref(`comandosPendentes/${userId}/${portao}`).set(acao);
    console.log(`📡 Comando '${acao}' salvo para ${userId}/${portao}`);

    // Envia o push para o app acordar
    await enviarNotificacaoPush(userId, portao);

    return res.json({ sucesso: true, mensagem: "Comando enviado com sucesso" });
  } catch (error) {
    console.error("❌ Erro ao enviar comando:", error);
    return res.status(500).json({ erro: "Erro interno no servidor" });
  }
});

app.listen(4000, () => console.log("🚀 Servidor TronAccess ativo na porta 4000"));
