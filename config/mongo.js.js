import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://cezarrocha297_db_user:Casa*2323@cluster0.vw3i1h3.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri);

let db;

export async function connectDB() {
  if (db) return db; // retorna conexão existente
  try {
    await client.connect();
    db = client.db('tron-smartportao'); // nome do banco
    console.log('✅ Conectado ao MongoDB Atlas');
    return db;
  } catch (err) {
    console.error('❌ Erro ao conectar ao MongoDB Atlas:', err);
    throw err;
  }
}
