import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

// Log para confirmar que el servidor intentó arrancar
console.log("Iniciando servidor de gastos...");

const PORT = process.env.PORT || 10000;

try {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const supabase = createClient(
    process.env.SUPABASE_URL || '', 
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  app.get('/', (req, res) => {
    res.send('API de Gastos Activa');
  });

  app.post('/api/webhook/notificacion', async (req, res) => {
    try {
      const { texto, api_secret } = req.body;

      if (api_secret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `
        Analiza la siguiente notificación bancaria y extrae la información requerida.
        Notificación: "${texto}"

        Responde ÚNICAMENTE en formato JSON plano con las siguientes claves:
        {
          "monto": number,
          "comercio": string,
          "categoria": "Supermercado" | "Restaurantes" | "Transporte" | "Servicios" | "Entretenimiento" | "Salud" | "Varios",
          "moneda": string,
          "es_gasto": boolean
        }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().replace(/```json|```/g, '').trim();
      const gasto = JSON.parse(responseText);

      if (!gasto.es_gasto) {
        return res.json({ status: 'Ignorado (no es un gasto)' });
      }

      const { data, error } = await supabase.from('gastos').insert([
        {
          monto: gasto.monto,
          comercio: gasto.comercio,
          categoria: gasto.categoria,
          moneda: gasto.moneda || 'MXN',
          raw_notificacion: texto,
          user_id: process.env.MY_USER_ID
        }
      ]);

      if (error) throw error;

      res.json({ status: 'éxito', gasto });
    } catch (err) {
      console.error("Error en webhook:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`Servidor corriendo exitosamente en el puerto ${PORT}`);
  });

} catch (initError) {
  console.error("Error al inicializar la app:", initError);
}