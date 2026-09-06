const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE (DEBEN ESTAR ANTES DE LAS RUTAS) =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - Permite peticiones desde Netlify y localhost
app.use(cors({
  origin: ['http://localhost:5500', 'https://neon-haupia-d38686.netlify.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===== ARCHIVO DE RESERVAS =====
const RESERVAS_FILE = path.join(__dirname, 'reservas.json');

// Función para leer reservas
function leerReservas() {
  try {
    if (fs.existsSync(RESERVAS_FILE)) {
      const data = fs.readFileSync(RESERVAS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error al leer reservas:', error);
    return [];
  }
}

// Función para guardar reservas
function guardarReservas(reservas) {
  try {
    fs.writeFileSync(RESERVAS_FILE, JSON.stringify(reservas, null, 2));
    return true;
  } catch (error) {
    console.error('Error al guardar reservas:', error);
    return false;
  }
}

// ===== RUTAS =====

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'Backend del Hotel funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Crear Payment Intent de Stripe
app.post('/api/create-payment-intent', async (req, res) => {
  console.log(' POST /api/create-payment-intent');
  console.log('📦 Headers:', req.headers);
  console.log(' Body:', req.body);
  
  try {
    const { amount, currency, roomData, guestData } = req.body;
    
    // Validar que se reciban los datos
    if (!amount || !currency || !roomData || !guestData) {
      console.error('❌ Faltan datos requeridos');
      return res.status(400).json({ 
        error: 'Faltan datos requeridos',
        received: req.body
      });
    }
    
    // Crear Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convertir a centavos
      currency: currency.toLowerCase(),
      metadata: {
        roomType: roomData.roomType || 'No especificado',
        checkIn: roomData.checkIn || 'No especificado',
        checkOut: roomData.checkOut || 'No especificado',
        guestName: guestData.nombre || 'No especificado',
        guestEmail: guestData.email || 'No especificado'
      },
      automatic_payment_methods: {
        enabled: true
      }
    });
    
    console.log('✅ Payment Intent creado:', paymentIntent.id);
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
    
  } catch (error) {
    console.error('❌ Error al crear Payment Intent:', error);
    res.status(500).json({ 
      error: 'Error al procesar el pago',
      message: error.message
    });
  }
});

// Obtener todas las reservas
app.get('/api/reservations', (req, res) => {
  console.log(' GET /api/reservations');
  const reservas = leerReservas();
  res.json(reservas);
});

// Crear nueva reserva
app.post('/api/reservations', (req, res) => {
  console.log('🔔 POST /api/reservations');
  console.log(' Body:', req.body);
  
  try {
    const nuevaReserva = {
      id: Date.now().toString(),
      fechaCreacion: new Date().toISOString(),
      ...req.body
    };
    
    const reservas = leerReservas();
    reservas.push(nuevaReserva);
    
    if (guardarReservas(reservas)) {
      console.log('✅ Reserva guardada:', nuevaReserva.id);
      res.status(201).json({ 
        message: 'Reserva creada exitosamente',
        reserva: nuevaReserva
      });
    } else {
      res.status(500).json({ 
        error: 'Error al guardar la reserva'
      });
    }
    
  } catch (error) {
    console.error('❌ Error al crear reserva:', error);
    res.status(500).json({ 
      error: 'Error al crear la reserva',
      message: error.message
    });
  }
});

// Confirmar pago (después de que Stripe procesa)
app.post('/api/confirm-payment', async (req, res) => {
  console.log('🔔 POST /api/confirm-payment');
  console.log(' Body:', req.body);
  
  try {
    const { paymentIntentId, reservationData } = req.body;
    
    // Verificar el estado del Payment Intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Guardar la reserva
      const nuevaReserva = {
        id: Date.now().toString(),
        fechaCreacion: new Date().toISOString(),
        paymentIntentId: paymentIntentId,
        estado: 'confirmada',
        ...reservationData
      };
      
      const reservas = leerReservas();
      reservas.push(nuevaReserva);
      
      if (guardarReservas(reservas)) {
        console.log('✅ Pago confirmado y reserva guardada:', nuevaReserva.id);
        res.json({ 
          message: 'Pago confirmado exitosamente',
          reserva: nuevaReserva
        });
      } else {
        res.status(500).json({ 
          error: 'Error al guardar la reserva'
        });
      }
    } else {
      res.status(400).json({ 
        error: 'El pago no fue exitoso',
        status: paymentIntent.status
      });
    }
    
  } catch (error) {
    console.error('❌ Error al confirmar pago:', error);
    res.status(500).json({ 
      error: 'Error al confirmar el pago',
      message: error.message
    });
  }
});

// ===== MANEJO DE ERRORES =====
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: err.message
  });
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log('========================================');
  console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(`🔑 Stripe conectado: ${process.env.STRIPE_SECRET_KEY ? 'SÍ' : 'NO'}`);
  console.log(`📁 Archivo de reservas: ${RESERVAS_FILE}`);
  console.log('========================================');
});