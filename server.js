const express = require('express');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));

// Conexión PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.SSL_DISABLED ? false : { rejectUnauthorized: false }
});

const TABLE = 'app_data';

// Crear tabla si no existe
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('✔ PostgreSQL conectado y tabla lista');
}

// ===== API =====
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'kaze-inventario', time: new Date().toISOString() });
});

// Leer todos los datos
app.get('/api/data', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT data, updated_at FROM ' + TABLE + ' WHERE id = $1',
      ['main']
    );
    if (result.rows.length === 0) {
      return res.json({ data: null, updated_at: null });
    }
    res.json({ data: result.rows[0].data, updated_at: result.rows[0].updated_at });
  } catch (err) {
    console.error('[GET /api/data]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Guardar todos los datos (una sola fila con JSONB)
app.put('/api/data', async (req, res) => {
  try {
    const data = req.body;
    if (typeof data !== 'object' || data === null) {
      return res.status(400).json({ error: 'Body debe ser un objeto JSON' });
    }
    const result = await pool.query(
      `INSERT INTO ${TABLE} (id, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
       RETURNING updated_at`,
      ['main', JSON.stringify(data)]
    );
    res.json({ ok: true, updated_at: result.rows[0].updated_at });
  } catch (err) {
    console.error('[PUT /api/data]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Servir la app (index.html) y archivos estáticos
app.use(express.static(path.join(__dirname, '.')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== Iniciar =====
const PORT = process.env.PORT || 3000;

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`☁️  Servidor Kaze escuchando en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[ERROR] No se pudo conectar a PostgreSQL:', err.message);
    process.exit(1);
  });