const express = require("express");
const multer = require("multer");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-this-token";

// ======================================================
// DIRECTORY
// ======================================================

const publicDir = path.join(__dirname, "public");

// Jika berjalan di Vercel, gunakan /tmp.
// Jika berjalan lokal, gunakan folder project.
const runtimeDir = process.env.VERCEL ? "/tmp/location-camera-app" : __dirname;

// Folder upload foto
const uploadDir = path.join(runtimeDir, "uploads");

// Pastikan folder uploads tersedia
fs.mkdirSync(uploadDir, { recursive: true });

// ======================================================
// DATABASE
// ======================================================

const dbPath = path.join(runtimeDir, "data.db");
const db = new Database(dbPath);

// WAL digunakan saat lokal.
// Di Vercel tidak digunakan.
if (!process.env.VERCEL) {
  db.pragma("journal_mode = WAL");
}

// ======================================================
// TABLE SUBMISSIONS
// ======================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    captured_at TEXT NOT NULL
  )
`);

// ======================================================
// TABLE COMMENTS / BUKU TAMU
// ======================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// ======================================================
// MULTER / UPLOAD FOTO
// ======================================================

const storage = multer.diskStorage({
  destination: uploadDir,

  filename: (req, file, cb) => {
    const ext = file.mimetype === "image/jpeg" ? ".jpg" : ".bin";

    cb(null, crypto.randomUUID() + ext);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 8 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/jpeg") {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json({ limit: "1mb" }));

app.use(express.static(publicDir));

// ======================================================
// ADMIN AUTHENTICATION
// ======================================================

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || req.query.token;

  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  next();
}

// ======================================================
// SUBMIT FOTO + LOKASI
// ======================================================

app.post("/api/submissions", upload.single("photo"), (req, res) => {
  try {
    // Pastikan foto ada
    if (!req.file) {
      return res.status(400).json({
        error: "Photo is required",
      });
    }

    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);

    const accuracy =
      req.body.accuracy == null ? null : Number(req.body.accuracy);

    // Validasi koordinat
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}

      return res.status(400).json({
        error: "Invalid coordinates",
      });
    }

    // Validasi batas koordinat
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}

      return res.status(400).json({
        error: "Coordinates out of range",
      });
    }

    const capturedAt = new Date().toISOString();

    const result = db
      .prepare(
        `
          INSERT INTO submissions
          (
            filename,
            latitude,
            longitude,
            accuracy,
            captured_at
          )
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(req.file.filename, latitude, longitude, accuracy, capturedAt);

    res.json({
      ok: true,
      id: result.lastInsertRowid,
    });
  } catch (err) {
    console.error("Gagal menyimpan submission:", err);

    // Hapus file jika database gagal
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    res.status(500).json({
      error: "Server error",
    });
  }
});

// ======================================================
// GET SEMUA SUBMISSIONS
// ======================================================

app.get("/api/submissions", requireAdmin, (req, res) => {
  try {
    const rows = db
      .prepare(
        `
          SELECT
            id,
            filename,
            latitude,
            longitude,
            accuracy,
            captured_at
          FROM submissions
          ORDER BY id DESC
        `,
      )
      .all();

    res.json(rows);
  } catch (err) {
    console.error("Gagal mengambil submissions:", err);

    res.status(500).json({
      error: "Server error",
    });
  }
});

// ======================================================
// GET FOTO SUBMISSION
// ======================================================

app.get("/api/submissions/:id/photo", requireAdmin, (req, res) => {
  try {
    const row = db
      .prepare("SELECT filename FROM submissions WHERE id = ?")
      .get(req.params.id);

    if (!row) {
      return res.status(404).send("Not found");
    }

    const file = path.join(uploadDir, row.filename);

    if (!fs.existsSync(file)) {
      return res.status(404).send("Not found");
    }

    res.sendFile(file);
  } catch (err) {
    console.error("Gagal mengambil foto:", err);

    res.status(500).send("Server error");
  }
});

// ======================================================
// BUKU TAMU - TAMBAH KOMENTAR
// ======================================================

app.post("/api/comments", (req, res) => {
  try {
    const { name, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({
        error: "Name and message are required",
      });
    }

    const createdAt = new Date().toISOString();

    const result = db
      .prepare(
        `
          INSERT INTO comments
          (
            name,
            message,
            created_at
          )
          VALUES (?, ?, ?)
        `,
      )
      .run(name, message, createdAt);

    res.json({
      ok: true,
      id: result.lastInsertRowid,
    });
  } catch (err) {
    console.error("Gagal menyimpan komentar:", err);

    res.status(500).json({
      error: "Server error",
    });
  }
});

// ======================================================
// BUKU TAMU - AMBIL SEMUA KOMENTAR
// ======================================================

app.get("/api/comments", (req, res) => {
  try {
    const rows = db
      .prepare(
        `
          SELECT
            id,
            name,
            message,
            created_at
          FROM comments
          ORDER BY id DESC
        `,
      )
      .all();

    res.json(rows);
  } catch (err) {
    console.error("Gagal mengambil komentar:", err);

    res.status(500).json({
      error: "Server error",
    });
  }
});

// ======================================================
// DELETE SUBMISSION
// ======================================================

app.delete("/api/submissions/:id", requireAdmin, (req, res) => {
  try {
    const id = req.params.id;

    // Cari data
    const row = db
      .prepare("SELECT filename FROM submissions WHERE id = ?")
      .get(id);

    if (!row) {
      return res.status(404).json({
        error: "Data tidak ditemukan",
      });
    }

    // Hapus file foto
    const filePath = path.join(uploadDir, row.filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Hapus data database
    db.prepare("DELETE FROM submissions WHERE id = ?").run(id);

    res.json({
      ok: true,
      message: "Data berhasil dihapus",
    });
  } catch (err) {
    console.error("Gagal menghapus data:", err);

    res.status(500).json({
      error: "Terjadi kesalahan pada server",
    });
  }
});

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  console.log(`Admin token: ${ADMIN_TOKEN}`);
});
