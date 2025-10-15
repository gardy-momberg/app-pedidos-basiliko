require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar middleware
app.use(express.static('public'));
app.use(express.json());

// Crear pool de conexión con PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Crear tablas si no existen
pool.query(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    estado TEXT DEFAULT 'pendiente'
  );

  CREATE TABLE IF NOT EXISTS productos_pedido (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
    nombre_producto TEXT,
    precio REAL
  );
`).catch(err => console.error('❌ Error al crear tablas:', err));

// Endpoint: Crear nuevo pedido
app.post('/api/pedido', async (req, res) => {
  const { productos } = req.body;
  if (!productos?.length) return res.status(400).json({ error: 'Carrito vacío' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pedidoRes = await client.query(`INSERT INTO pedidos (estado) VALUES ('pendiente') RETURNING id`);
    const pedidoId = pedidoRes.rows[0].id;

    const insertProducto = `
      INSERT INTO productos_pedido (pedido_id, nombre_producto, precio)
      VALUES ($1, $2, $3)
    `;
    for (const p of productos) {
      await client.query(insertProducto, [pedidoId, p.nombre, p.precio]);
    }

    await client.query('COMMIT');
    res.json({ pedidoId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error al guardar pedido:', err);
    res.status(500).json({ error: 'Error al guardar el pedido' });
  } finally {
    client.release();
  }
});

// Endpoint: Obtener todos los pedidos
app.get('/api/pedidos', async (_req, res) => {
  try {
    const pedidos = await pool.query(`
      SELECT p.id, p.estado, json_agg(json_build_object('nombre', pp.nombre_producto, 'precio', pp.precio)) AS productos
      FROM pedidos p
      LEFT JOIN productos_pedido pp ON p.id = pp.pedido_id
      GROUP BY p.id
      ORDER BY p.id DESC
    `);
    res.json(pedidos.rows);
  } catch (err) {
    console.error('❌ Error al obtener pedidos:', err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// Endpoint: Cambiar estado de pedido
app.put('/api/pedido/:id', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const estadosValidos = ['pendiente', 'preparacion', 'entregado'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    await pool.query(`UPDATE pedidos SET estado = $1 WHERE id = $2`, [estado, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error al cambiar estado:', err);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});
