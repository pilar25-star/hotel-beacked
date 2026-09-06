require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Permitir que tu frontend (HTML) se comunique con este backend
app.use(cors());
app.use(express.json());

// Ruta para guardar datos de prueba (simula una base de datos)
const DB_FILE = path.join(__dirname, 'reservas.json');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');

/* =====================================================
   💳 RUTA 1: CREAR INTENTO DE PAGO (STRIPE)
   El frontend envía el monto, el backend le devuelve 
   un "clientSecret" para que Stripe cobre la tarjeta.
   ===================================================== */
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd' } = req.body;
    
    // Stripe maneja los montos en centavos (250 USD = 25000)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, 
      currency,
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =====================================================
   ️ RUTA 2: GUARDAR RESERVACIÓN
   Se ejecuta después de que el pago es exitoso.
   ===================================================== */
app.post('/api/reservations', (req, res) => {
  try {
    const reserva = {
      id: Date.now(),
      fecha: new Date().toISOString(),
      ...req.body
    };

    // Leer reservas existentes, agregar la nueva y guardar
    const reservas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    reservas.push(reserva);
    fs.writeFileSync(DB_FILE, JSON.stringify(reservas, null, 2));

    console.log(`✅ Nueva reserva guardada: ${reserva.nombre} - $${reserva.total} USD`);
    res.json({ success: true, id: reserva.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =====================================================
   📞 RUTA 3: FORMULARIO DE CONTACTO / SPA / TOURS
   ===================================================== */
app.post('/api/contact', (req, res) => {
  const { nombre, email, telefono, mensaje, tipo } = req.body;
  console.log(` Nuevo mensaje de ${nombre} (${tipo}): ${mensaje}`);
  // Aquí en el futuro conectarías un servicio como Nodemailer para enviarte un email real.
  res.json({ success: true, message: 'Mensaje recibido' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
  console.log(`🔑 Stripe conectado: ${process.env.STRIPE_SECRET_KEY ? 'SÍ' : 'NO (falta .env)'}`);
});