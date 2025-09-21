import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

export async function conectarMongo() {
  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB Atlas');
    const db = client.db(process.env.MONGO_DB || 'tron-smartportao');
    return db.collection('usuarios');
  } catch (err) {
    console.error('❌ Erro ao conectar no MongoDB:', err);
  }
}
