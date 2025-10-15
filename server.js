const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// Crear la carpeta db si no existe
if (!fs.existsSync('./db')) fs.mkdirSync('./db');

// Crear/conectar la base de datos SQLite
const dbPath = './db/database.sqlite';
const db = new sqlite3.Database(dbPath);

// Crear las tablas si no existen
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estado TEXT DEFAULT 'pendiente'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS productos_pedido (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      nombre_producto TEXT,
      precio REAL,
      FOREIGN KEY(pedido_id) REFERENCES pedidos(id)
    )
  `);
});

// Ruta para crear pedido
app.post('/api/pedido', (req, res) => {
  const productos = req.body.productos;

  if (!productos || productos.length === 0) {
    return res.status(400).json({ error: 'No se enviaron productos.' });
  }

  db.run(`INSERT INTO pedidos (estado) VALUES ('pendiente')`, function (err) {
    if (err) return res.status(500).json({ error: err.message });

    const pedidoId = this.lastID;
    const stmt = db.prepare(`
      INSERT INTO productos_pedido (pedido_id, nombre_producto, precio)
      VALUES (?, ?, ?)
    `);

    productos.forEach(p => stmt.run(pedidoId, p.nombre, p.precio));
    stmt.finalize(() => {
      res.json({ pedidoId });
    });
  });
});

// Obtener todos los pedidos
app.get('/api/pedidos', (req, res) => {
  db.all(`SELECT * FROM pedidos ORDER BY id DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Actualizar estado de un pedido
app.put('/api/pedido/:id', (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!['pendiente', 'preparacion', 'entregado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  db.run(`UPDATE pedidos SET estado = ? WHERE id = ?`, [estado, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});


// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});



