const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");

const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});
app.use(express.json());

const MONGO_URL = "mongodb+srv://dannalpes:dannalpes2026@cluster0.kf3xy4t.mongodb.net/?appName=Cluster0";
const DB_NAME = "dann_alpes";
let db;

// Conectar a MongoDB
MongoClient.connect(MONGO_URL).then(client => {
  db = client.db(DB_NAME);
  console.log("Conectado a MongoDB - dann_alpes");
}).catch(err => {
  console.error("Error conectando a MongoDB:", err);
});

// =============================================
// RF4 - GET reseñas de un hotel (paginadas)
// =============================================
app.get("/reviews/hotel/:hotel_id", async (req, res) => {
  try {
    const hotel_id = parseInt(req.params.hotel_id);
    const orden = req.query.orden || "fecha";
    const pagina = parseInt(req.query.pagina) || 1;
    const por_pag = 10;
    const skip = (pagina - 1) * por_pag;

    const sort = orden === "utilidad"
      ? { destacada: -1, util_count: -1, fecha_creacion: -1 }
      : { destacada: -1, fecha_creacion: -1 };

    const reviews = await db.collection("reviews")
      .find({ hotel_id, estado: "publicada" })
      .sort(sort)
      .skip(skip)
      .limit(por_pag)
      .toArray();

    const total = await db.collection("reviews").countDocuments({ hotel_id, estado: "publicada" });

    res.json({ reviews, total, pagina, paginas: Math.ceil(total / por_pag) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RF1 - POST crear reseña
// =============================================
app.post("/reviews", async (req, res) => {
  try {
    const { hotel_id, cliente_id, reserva_id, hotel_nombre, hotel_ciudad, cliente_nombre, calificacion, texto } = req.body;

    // Validaciones
    if (!calificacion || calificacion < 1 || calificacion > 5)
      return res.status(400).json({ error: "Calificacion debe ser entre 1 y 5" });
    if (!texto || texto.length < 10)
      return res.status(400).json({ error: "El texto debe tener al menos 10 caracteres" });

    // Verificar que no existe reseña para esta reserva
    const existe = await db.collection("reviews").findOne({ reserva_id: parseInt(reserva_id) });
    if (existe) return res.status(400).json({ error: "Ya existe una reseña para esta reserva" });

    const doc = {
      hotel_id: parseInt(hotel_id),
      cliente_id: parseInt(cliente_id),
      reserva_id: parseInt(reserva_id),
      hotel_nombre,
      hotel_ciudad,
      cliente_nombre,
      calificacion: parseInt(calificacion),
      texto,
      fecha_creacion: new Date(),
      estado: "publicada",
      destacada: false,
      util_count: 0,
      votos_usuarios: []
    };

    const result = await db.collection("reviews").insertOne(doc);
    res.json({ ok: true, insertedId: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RF2 - PUT editar reseña
// =============================================
app.put("/reviews/:id", async (req, res) => {
  try {
    const { cliente_id, calificacion, texto } = req.body;

    if (!calificacion || calificacion < 1 || calificacion > 5)
      return res.status(400).json({ error: "Calificacion debe ser entre 1 y 5" });
    if (!texto || texto.length < 10)
      return res.status(400).json({ error: "El texto debe tener al menos 10 caracteres" });

    const result = await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id), cliente_id: parseInt(cliente_id) },
      { $set: { calificacion: parseInt(calificacion), texto, fecha_actualizacion: new Date() } }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Reseña no encontrada o sin permiso" });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RF3 - DELETE eliminar reseña (cliente)
// =============================================
app.delete("/reviews/:id/cliente/:cliente_id", async (req, res) => {
  try {
    const result = await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id), cliente_id: parseInt(req.params.cliente_id) },
      { $set: { estado: "eliminada" } }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Reseña no encontrada o sin permiso" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RF5 - POST votar reseña como útil
// =============================================
app.post("/reviews/:id/votar", async (req, res) => {
  try {
    const { usuario_id } = req.body;
    const review = await db.collection("reviews").findOne({ _id: new ObjectId(req.params.id) });
    if (!review) return res.status(404).json({ error: "Reseña no encontrada" });

    if (review.votos_usuarios && review.votos_usuarios.includes(parseInt(usuario_id)))
      return res.status(400).json({ error: "Ya votaste por esta reseña" });

    await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $addToSet: { votos_usuarios: parseInt(usuario_id) }, $inc: { util_count: 1 } }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RF6 - GET historial de reseñas del cliente
// =============================================
app.get("/reviews/cliente/:cliente_id", async (req, res) => {
  try {
    const cliente_id = parseInt(req.params.cliente_id);
    const orden = req.query.orden || "fecha";
    const sort = orden === "hotel" ? { hotel_nombre: 1 } : { fecha_creacion: -1 };

    const reviews = await db.collection("reviews")
      .find({ cliente_id })
      .sort(sort)
      .toArray();

    res.json({ reviews });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RF7 - POST responder reseña (admin)
// =============================================
app.post("/reviews/:id/respuesta", async (req, res) => {
  try {
    const { admin_id, texto } = req.body;
    if (!texto || texto.length < 1)
      return res.status(400).json({ error: "La respuesta no puede estar vacía" });

    const result = await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id), estado: "publicada" },
      { $set: { respuesta_admin: { admin_id: parseInt(admin_id), texto, fecha_respuesta: new Date() } } }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Reseña no encontrada" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RF8 - DELETE eliminar reseña (admin)
// =============================================
app.delete("/reviews/:id/admin", async (req, res) => {
  try {
    const result = await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { estado: "eliminada" } }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Reseña no encontrada" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RF9 - POST destacar reseña (admin)
// =============================================
app.post("/reviews/:id/destacar", async (req, res) => {
  try {
    const { hotel_id } = req.body;
    // Quitar destacada anterior
    await db.collection("reviews").updateMany(
      { hotel_id: parseInt(hotel_id), destacada: true },
      { $set: { destacada: false } }
    );
    // Marcar nueva
    const result = await db.collection("reviews").updateOne(
      { _id: new ObjectId(req.params.id), estado: "publicada" },
      { $set: { destacada: true } }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Reseña no encontrada" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RFC1 - Top 10 hoteles por calificación
// =============================================
app.get("/rfc/top-hoteles", async (req, res) => {
  try {
    const { fecha_ini, fecha_fin } = req.query;
    const match = { estado: "publicada" };
    if (fecha_ini && fecha_fin) {
      match.fecha_creacion = { $gte: new Date(fecha_ini), $lte: new Date(fecha_fin) };
    }

    const result = await db.collection("reviews").aggregate([
      { $match: match },
      { $group: {
        _id: "$hotel_id",
        hotel_nombre: { $first: "$hotel_nombre" },
        promedio_calif: { $avg: "$calificacion" },
        total_resenas: { $sum: 1 }
      }},
      { $addFields: { promedio_calif: { $round: ["$promedio_calif", 2] } } },
      { $sort: { promedio_calif: -1, total_resenas: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, hotel_id: "$_id", hotel_nombre: 1, promedio_calif: 1, total_resenas: 1 } }
    ]).toArray();

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RFC2 - Evolución mensual de un hotel
// =============================================
app.get("/rfc/evolucion/:hotel_id", async (req, res) => {
  try {
    const hotel_id = parseInt(req.params.hotel_id);
    const anio = parseInt(req.query.anio) || new Date().getFullYear();

    const result = await db.collection("reviews").aggregate([
      { $match: { hotel_id, estado: "publicada", $expr: { $eq: [{ $year: "$fecha_creacion" }, anio] } } },
      { $group: {
        _id: { mes: { $month: "$fecha_creacion" } },
        hotel_nombre: { $first: "$hotel_nombre" },
        promedio_calif: { $avg: "$calificacion" },
        total_resenas: { $sum: 1 }
      }},
      { $sort: { "_id.mes": 1 } },
      { $project: { _id: 0, mes: "$_id.mes", hotel_nombre: 1, promedio_calif: { $round: ["$promedio_calif", 2] }, total_resenas: 1 } }
    ]).toArray();

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// RFC3 - Perfil comparativo por ciudad
// =============================================
app.get("/rfc/ciudad/:ciudad", async (req, res) => {
  try {
    const ciudad = req.params.ciudad;

    const result = await db.collection("reviews").aggregate([
      { $match: { hotel_ciudad: ciudad, estado: "publicada" } },
      { $group: {
        _id: "$hotel_id",
        hotel_nombre: { $first: "$hotel_nombre" },
        promedio_calif: { $avg: "$calificacion" },
        total_resenas: { $sum: 1 },
        con_respuesta: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$respuesta_admin", null] }, null] }, 1, 0] } },
        destacadas: { $sum: { $cond: ["$destacada", 1, 0] } }
      }},
      { $addFields: {
        promedio_calif: { $round: ["$promedio_calif", 2] },
        pct_respuesta: { $round: [{ $multiply: [{ $divide: ["$con_respuesta", { $max: ["$total_resenas", 1] }] }, 100] }, 1] },
        pct_destacadas: { $round: [{ $multiply: [{ $divide: ["$destacadas", { $max: ["$total_resenas", 1] }] }, 100] }, 1] }
      }},
      { $sort: { promedio_calif: -1 } }
    ]).toArray();

    // Calcular promedio de la ciudad
    const promedio_ciudad = result.length > 0
      ? Math.round(result.reduce((a, b) => a + b.promedio_calif, 0) / result.length * 100) / 100
      : 0;

    res.json({ ciudad, promedio_ciudad, hoteles: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// GET hoteles disponibles (para selects en APEX)
// =============================================
app.get("/hoteles", async (req, res) => {
  try {
    const hoteles = await db.collection("reviews").distinct("hotel_id");
    const result = await db.collection("reviews").aggregate([
      { $group: { _id: "$hotel_id", nombre: { $first: "$hotel_nombre" }, ciudad: { $first: "$hotel_ciudad" } } },
      { $sort: { nombre: 1 } }
    ]).toArray();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log("API corriendo en http://localhost:3000"));
