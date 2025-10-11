// ====== IMPORTS ======
import express from "express";
import session from "express-session";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import https from "https";
import admin from "firebase-admin";
import fs from "fs";

// ====== CONFIGURAÇÃO ======
dotenv.config();
const app = express();
const port = process.env.PORT || 4000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "segredo",
    resave: false,
    saveUninitialized: true,
  })
);

// ====== CONEXÃO MONGODB ======
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Conectado ao MongoDB"))
  .catch((err) => console.error("Erro MongoDB:", err));

// ====== MODELO DE USUÁRIO ======
const userSchema = new mongoose.Schema({
  nome: String,
  email: String,
  senha: String,
  fcmToken: String, // 🔹 Token do app Android
  comando: String,  // 🔹 Último comando enviado (opcional)
});
const User = mongoose.model("User", userSchema);

// ====== FIREBASE ADMIN ======
if (!admin.apps.length) {
  const firebaseConfig = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
  });
  console.log("✅ Firebase Admin inicializado");
}

// ====== ROTA PRINCIPAL ======
app.get("/", (req, res) => {
  res.send("🌐 Servidor TRON Access rodando e pronto para enviar notificações.");
});

// ====== REGISTRA TOKEN DO APP ======
app.post("/registrarToken", async (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) return res.status(400).send("Campos obrigatórios.");

  const user = await User.findOne({ email });
  if (!user) return res.status(404).send("Usuário não encontrado.");

  user.fcmToken = token;
  await user.save();

  console.log("📱 Token FCM atualizado para:", email, token);
  res.send("Token registrado com sucesso.");
});

// ====== ENVIA NOTIFICAÇÃO PARA O APP ======
app.post("/enviarComando", async (req, res) => {
  const { email, comando } = req.body;
  if (!email || !comando) return res.status(400).send("Campos obrigatórios.");

  const user = await User.findOne({ email });
  if (!user || !user.fcmToken) {
    return res.status(404).send("Usuário não encontrado ou sem token.");
  }

  const mensagem = {
    token: user.fcmToken,
    notification: {
      title: "Monitorando portão 🚪",
      body: `Comando recebido: ${comando}`,
    },
    data: {
      comando,
    },
  };

  try {
    const response = await admin.messaging().send(mensagem);
    console.log("✅ Notificação FCM enviada:", response);
    res.send("Comando enviado com sucesso.");
  } catch (error) {
    console.error("Erro ao enviar FCM:", error);
    res.status(500).send("Erro ao enviar notificação FCM.");
  }
});

// ====== SERVIDOR HTTPS OPCIONAL ======
if (process.env.SSL_KEY && process.env.SSL_CERT) {
  const options = {
    key: fs.readFileSync(process.env.SSL_KEY),
    cert: fs.readFileSync(process.env.SSL_CERT),
  };
  https.createServer(options, app).listen(port, () => {
    console.log(`🌐 HTTPS Server rodando na porta ${port}`);
  });
} else {
  app.listen(port, () => {
    console.log(`🌐 HTTP Server rodando na porta ${port}`);
  });
}
