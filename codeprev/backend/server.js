import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(CODE_DIR, "data");
const GENERATED_PDF_DIR = path.join(DATA_DIR, "generated", "pdfs");
const GENERATED_ORIGINAL_PDF_DIR = path.join(GENERATED_PDF_DIR, "originals");
const GENERATED_ANNOTATED_PDF_DIR = path.join(GENERATED_PDF_DIR, "annotated");
const UPLOADED_VIDEO_DIR = path.join(DATA_DIR, "uploaded", "videos");
const UPLOADED_IMAGE_DIR = path.join(DATA_DIR, "uploaded", "images");
const UPLOADED_PDF_DIR = path.join(DATA_DIR, "uploaded", "pdfs");
const DB_PATH = path.join(DATA_DIR, "scbe.sqlite");
const CV_BASE_URL = process.env.CV_BASE_URL || "http://127.0.0.1:5000";
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "127.0.0.1";

for (const directory of [
  DATA_DIR,
  GENERATED_PDF_DIR,
  GENERATED_ORIGINAL_PDF_DIR,
  GENERATED_ANNOTATED_PDF_DIR,
  UPLOADED_VIDEO_DIR,
  UPLOADED_IMAGE_DIR,
  UPLOADED_PDF_DIR,
]) {
  fs.mkdirSync(directory, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    programme TEXT DEFAULT '',
    classSection TEXT DEFAULT '',
    semester INTEGER,
    designation TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    courseId TEXT NOT NULL,
    title TEXT NOT NULL,
    session TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sheets (
    id TEXT PRIMARY KEY,
    examId TEXT,
    studentId TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    evaluations TEXT NOT NULL DEFAULT '[]',
    fileName TEXT,
    fileUrl TEXT,
    detectedRollNumber TEXT,
    detectedName TEXT,
    uploadedBy TEXT,
    createdAt TEXT NOT NULL,
    sourceType TEXT DEFAULT 'pdf'
  );

  CREATE TABLE IF NOT EXISTS discrepancies (
    id TEXT PRIMARY KEY,
    sheetId TEXT NOT NULL,
    studentId TEXT NOT NULL,
    question TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    message TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    sheetId TEXT NOT NULL,
    studentId TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    pdfFileName TEXT,
    pdfFileUrl TEXT,
    annotationData TEXT DEFAULT '[]',
    resolutionComment TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function ensureComplaintSchema() {
  const complaintColumns = db.prepare("PRAGMA table_info(complaints)").all();
  const columnNames = new Set(complaintColumns.map((column) => column.name));
  if (!columnNames.has("status")) {
    db.exec("ALTER TABLE complaints ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending';");
  }
  if (!columnNames.has("annotationData")) {
    db.exec("ALTER TABLE complaints ADD COLUMN annotationData TEXT DEFAULT '[]';");
  }
  if (!columnNames.has("resolutionComment")) {
    db.exec("ALTER TABLE complaints ADD COLUMN resolutionComment TEXT DEFAULT '';");
  }
}

ensureComplaintSchema();

function ensureUserSchema() {
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  const columnNames = new Set(userColumns.map((column) => column.name));
  if (!columnNames.has("classSection")) {
    db.exec("ALTER TABLE users ADD COLUMN classSection TEXT DEFAULT '';");
  }
}

ensureUserSchema();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash: derived, salt };
}

function verifyPassword(password, salt, hash) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  const left = Buffer.from(derived, "hex");
  const right = Buffer.from(hash, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function purgeLegacySampleData() {
  const legacyIds = ["1024170014", "1024170007", "1024170021", "FAC-01", "FAC-02", "ADMIN-01"];
  const placeholders = legacyIds.map(() => "?").join(", ");
  const legacyUserCount = db
    .prepare(`SELECT COUNT(*) AS count FROM users WHERE id IN (${placeholders})`)
    .get(...legacyIds).count;
  if (legacyUserCount === 0) {
    return;
  }

  db.exec(`
    DELETE FROM notifications;
    DELETE FROM discrepancies;
    DELETE FROM sheets;
    DELETE FROM exams;
    DELETE FROM courses;
    DELETE FROM users;
  `);

  db.prepare(`
    INSERT INTO meta (key, value)
    VALUES ('schemaVersion', '2')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run();
}

purgeLegacySampleData();

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.use(
  "/files/generated/pdfs",
  express.static(GENERATED_PDF_DIR, {
    setHeaders(res, filePath) {
      if (filePath.toLowerCase().endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
      }
    },
  })
);
app.use("/files/generated/pdfs/originals", express.static(GENERATED_ORIGINAL_PDF_DIR));
app.use("/files/generated/pdfs/annotated", express.static(GENERATED_ANNOTATED_PDF_DIR));
app.use("/files/uploaded/videos", express.static(UPLOADED_VIDEO_DIR));
app.use("/files/uploaded/images", express.static(UPLOADED_IMAGE_DIR));
app.use("/files/uploaded/pdfs", express.static(UPLOADED_PDF_DIR));

function safeUser(row) {
  if (!row) return null;
  const { password_hash, password_salt, ...user } = row;
  return user;
}

function courseOfExam(examId) {
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(examId);
  if (!exam) return null;
  return db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.courseId) || null;
}

function totalsFromEvaluations(evaluations) {
  return evaluations.reduce(
    (accumulator, evaluation) => {
      accumulator.current += Number(evaluation.currentMarks || 0);
      accumulator.original += Number(evaluation.originalMarks || 0);
      accumulator.max += Number(evaluation.max || 0);
      return accumulator;
    },
    { current: 0, original: 0, max: 0 }
  );
}

function sheetSummary(row) {
  if (!row) return null;
  const exam = row.examId ? db.prepare("SELECT * FROM exams WHERE id = ?").get(row.examId) || null : null;
  const course = exam ? courseOfExam(exam.id) : null;
  const evaluations = JSON.parse(row.evaluations || "[]");
  const student = row.studentId ? db.prepare("SELECT * FROM users WHERE id = ?").get(row.studentId) || null : null;
  return {
    ...row,
    published: Boolean(row.published),
    evaluations,
    totals: totalsFromEvaluations(evaluations),
    exam,
    course,
    studentName: student?.name || null,
  };
}

function nextId(prefix, rows) {
  const max = rows.reduce((highest, row) => {
    const match = String(row.id || "").match(/-(\d+)$/);
    if (!match) return highest;
    return Math.max(highest, Number(match[1]));
  }, 0);
  return `${prefix}-${max + 1}`;
}

function requireUser(id, role, res) {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = ?").get(id, role);
  if (!user) {
    res.status(404).json({ error: `${role} not found` });
    return null;
  }
  return user;
}

function htmlSafeFilename(name, fallback) {
  const cleaned = String(name || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "");
  return cleaned || fallback;
}

function makeFileHandler(directory, fallbackName) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, directory),
      filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${htmlSafeFilename(file.originalname, fallbackName)}`);
      },
    }),
  });
}

const videoUpload = makeFileHandler(UPLOADED_VIDEO_DIR, "video.mp4");
const imageUpload = makeFileHandler(UPLOADED_IMAGE_DIR, "image.png");
const pdfUpload = multer({ storage: multer.memoryStorage() });
const mixedUpload = multer({ storage: multer.memoryStorage() });

async function forwardToCv(endpoint, formData) {
  const response = await fetch(`${CV_BASE_URL}${endpoint}`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `CV service returned ${response.status}`);
  }
  return payload;
}

function appendFile(formData, fieldName, file) {
  const source = file?.buffer || (file?.path ? fs.readFileSync(file.path) : null);
  if (!source) {
    throw new Error(`Missing upload payload for ${fieldName}`);
  }
  const blob = new Blob([source], { type: file.mimetype });
  formData.append(fieldName, blob, file.originalname);
}

function storePdf(filePath, targetDirectory, targetName) {
  const finalName = targetName || path.basename(filePath);
  const finalPath = path.join(targetDirectory, finalName);
  fs.copyFileSync(filePath, finalPath);
  return finalName;
}

function handleDbError(res, error) {
  console.error(error);
  res.status(500).json({ error: error.message || "Unexpected server error" });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "scbe-backend", db: path.basename(DB_PATH) });
});

app.post("/api/auth/login", (req, res) => {
  const { id, role, password } = req.body || {};
  if (!id || !role || !password) {
    return res.status(400).json({ error: "id, role and password are required" });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = ?").get(id, role);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  res.json({ user: safeUser(user) });
});

app.post("/api/auth/register", (req, res) => {
  try {
    const { id, name, role, password, email = "", programme = "", classSection = "", semester, designation = "" } = req.body || {};
    if (!id || !name || !role || !password) {
      return res.status(400).json({ error: "id, name, role and password are required" });
    }
    if (!["student", "faculty", "admin"].includes(role)) {
      return res.status(400).json({ error: "role must be student, faculty or admin" });
    }
    const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
    if (existing) {
      return res.status(409).json({ error: "An account with this ID already exists" });
    }
    const { hash, salt } = hashPassword(password);
    const insert = db.prepare(`
      INSERT INTO users (id, name, role, email, password_hash, password_salt, programme, classSection, semester, designation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      id,
      name,
      role,
      email,
      hash,
      salt,
      role === "student" ? programme : "",
      role === "student" ? classSection : "",
      role === "student" ? (semester ? Number(semester) : null) : null,
      role === "student" ? "" : designation
    );
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    res.status(201).json({ user: safeUser(user) });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.get("/api/users", (_req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY role, name").all().map(safeUser);
  res.json(users);
});

app.get("/api/exams", (_req, res) => {
  const exams = db.prepare("SELECT * FROM exams ORDER BY id").all().map((exam) => ({
    ...exam,
    course: courseOfExam(exam.id),
  }));
  res.json(exams);
});

app.get("/api/sheets/:sheetId", (req, res) => {
  const row = db.prepare("SELECT * FROM sheets WHERE id = ?").get(req.params.sheetId);
  if (!row) return res.status(404).json({ error: "Sheet not found" });
  const requesterId = req.query.userId;
  const requester = requesterId ? db.prepare("SELECT * FROM users WHERE id = ?").get(requesterId) : null;
  const isFacultyRequest = requester?.role === "faculty";
  if (!row.published && !isFacultyRequest) {
    return res.status(403).json({ error: "This sheet is not published yet" });
  }
  res.json(sheetSummary(row));
});

app.get("/api/students/:id/profile", (req, res) => {
  const student = requireUser(req.params.id, "student", res);
  if (!student) return;
  res.json(safeUser(student));
});

app.get("/api/students/:id/dashboard", (req, res) => {
  const student = requireUser(req.params.id, "student", res);
  if (!student) return;

  const sheets = db.prepare("SELECT * FROM sheets WHERE studentId = ? ORDER BY createdAt DESC").all(req.params.id);
  const discrepancies = db.prepare("SELECT * FROM discrepancies WHERE studentId = ? ORDER BY createdAt DESC").all(req.params.id);
  const notifications = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC").all(req.params.id);
  const publishedSheets = sheets.filter((sheet) => sheet.published).map(sheetSummary);
  const pending = discrepancies.filter((record) => ["Submitted", "Under Review", "Escalated"].includes(record.status));
  const resolved = discrepancies.filter((record) => ["Resolved", "Accepted", "Rejected"].includes(record.status));
  const revised = publishedSheets.filter((sheet) => sheet.totals.current !== sheet.totals.original);
  const marksGained = publishedSheets.reduce(
    (sum, sheet) => sum + (sheet.totals.current - sheet.totals.original),
    0
  );

  res.json({
    student: safeUser(student),
    stats: {
      examinations: db.prepare("SELECT COUNT(*) AS count FROM exams").get().count,
      sheetsAvailable: publishedSheets.length,
      pendingDiscrepancies: pending.length,
      resolvedDiscrepancies: resolved.length,
      marksGained,
      revisedCount: revised.length,
    },
    sheets: publishedSheets,
    discrepancies,
    notifications,
  });
});

app.get("/api/students/:id/sheets", (req, res) => {
  const student = requireUser(req.params.id, "student", res);
  if (!student) return;
  const sheets = db.prepare("SELECT * FROM sheets WHERE studentId = ? ORDER BY createdAt DESC").all(req.params.id).map(sheetSummary);
  res.json(sheets);
});

app.get("/api/students/:id/requests", (req, res) => {
  const student = requireUser(req.params.id, "student", res);
  if (!student) return;
  const discrepancies = db.prepare("SELECT * FROM discrepancies WHERE studentId = ? ORDER BY createdAt DESC").all(req.params.id);
  const requests = discrepancies.map((record) => {
    const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(record.sheetId);
    return { ...record, course: sheet ? courseOfExam(sheet.examId) : null };
  });
  res.json(requests);
});

app.get("/api/students/:id/complaints", (req, res) => {
  const student = requireUser(req.params.id, "student", res);
  if (!student) return;
  const complaints = db
    .prepare("SELECT * FROM complaints WHERE studentId = ? ORDER BY createdAt DESC")
    .all(req.params.id)
    .map((record) => {
      const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(record.sheetId);
    return {
      ...record,
      course: sheet ? courseOfExam(sheet.examId) : null,
      latestPdfUrl: record.pdfFileUrl || sheet?.fileUrl || null,
    };
  });
  res.json(complaints);
});

app.get("/api/students/:id/notifications", (req, res) => {
  const student = requireUser(req.params.id, "student", res);
  if (!student) return;
  const notifications = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC").all(req.params.id);
  res.json(notifications);
});

app.post("/api/discrepancies", (req, res) => {
  const { sheetId, studentId, question, message } = req.body || {};
  if (!sheetId || !studentId || !question || !message) {
    return res.status(400).json({ error: "sheetId, studentId, question and message are required" });
  }
  const record = {
    id: nextId("D", db.prepare("SELECT id FROM discrepancies").all()),
    sheetId,
    studentId,
    question,
    message,
    status: "Submitted",
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.prepare(`
    INSERT INTO discrepancies (id, sheetId, studentId, question, message, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, sheetId, studentId, question, message, record.status, record.createdAt);
  res.status(201).json(record);
});

app.patch("/api/discrepancies/:id", (req, res) => {
  const record = db.prepare("SELECT * FROM discrepancies WHERE id = ?").get(req.params.id);
  if (!record) return res.status(404).json({ error: "Discrepancy not found" });
  const { status } = req.body || {};
  if (status) {
    db.prepare("UPDATE discrepancies SET status = ? WHERE id = ?").run(status, req.params.id);
  }
  res.json(db.prepare("SELECT * FROM discrepancies WHERE id = ?").get(req.params.id));
});

app.get("/api/faculty/:id/dashboard", (req, res) => {
  const faculty = requireUser(req.params.id, "faculty", res);
  if (!faculty) return;

  const sheets = db.prepare("SELECT * FROM sheets ORDER BY createdAt DESC").all();
  const discrepancies = db.prepare("SELECT * FROM discrepancies ORDER BY createdAt DESC").all();
  const pending = discrepancies.filter((record) => ["Submitted", "Under Review", "Escalated"].includes(record.status));
  const resolved = discrepancies.filter((record) => record.status === "Resolved");
  const pendingWithDetail = pending.map((record) => {
    const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(record.sheetId);
    const student = db.prepare("SELECT * FROM users WHERE id = ?").get(record.studentId);
    return { ...record, studentName: student?.name || null, course: sheet ? courseOfExam(sheet.examId) : null };
  });
  res.json({
    faculty: safeUser(faculty),
    stats: {
      sheetsAssigned: sheets.length,
      awaitingVerification: sheets.filter((sheet) => !sheet.published).length,
      pendingRequests: pending.length,
      resolvedThisMonth: resolved.length,
    },
    pendingDiscrepancies: pendingWithDetail,
  });
});

app.get("/api/faculty/:id/sheets", (req, res) => {
  const faculty = requireUser(req.params.id, "faculty", res);
  if (!faculty) return;
  const sheets = db.prepare("SELECT * FROM sheets ORDER BY createdAt DESC").all().map(sheetSummary);
  res.json(sheets);
});

app.get("/api/faculty/:id/unassigned-sheets", (req, res) => {
  const faculty = requireUser(req.params.id, "faculty", res);
  if (!faculty) return;
  const sheets = db
    .prepare("SELECT * FROM sheets WHERE studentId IS NULL ORDER BY createdAt DESC")
    .all()
    .map(sheetSummary);
  res.json(sheets);
});

app.get("/api/faculty/:id/complaints", (req, res) => {
  const faculty = requireUser(req.params.id, "faculty", res);
  if (!faculty) return;
  const complaints = db.prepare("SELECT * FROM complaints ORDER BY createdAt DESC").all().map((record) => {
    const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(record.sheetId);
    const student = db.prepare("SELECT * FROM users WHERE id = ?").get(record.studentId);
    return {
      ...record,
      studentName: student?.name || null,
      studentEmail: student?.email || null,
      course: sheet ? courseOfExam(sheet.examId) : null,
      latestPdfUrl: sheet?.fileUrl || null,
    };
  });
  res.json(complaints);
});

app.get("/api/students/:id/complaints/:complaintId", (req, res) => {
  const student = requireUser(req.params.id, "student", res);
  if (!student) return;
  const complaint = db.prepare("SELECT * FROM complaints WHERE id = ? AND studentId = ?").get(req.params.complaintId, student.id);
  if (!complaint) return res.status(404).json({ error: "Complaint not found" });
  const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(complaint.sheetId);
  res.json({
    ...complaint,
    course: sheet ? courseOfExam(sheet.examId) : null,
    latestPdfUrl: complaint.pdfFileUrl || sheet?.fileUrl || null,
  });
});

app.get("/api/faculty/:id/complaints/:complaintId", (req, res) => {
  const faculty = requireUser(req.params.id, "faculty", res);
  if (!faculty) return;
  const complaint = db.prepare("SELECT * FROM complaints WHERE id = ?").get(req.params.complaintId);
  if (!complaint) return res.status(404).json({ error: "Complaint not found" });
  const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(complaint.sheetId);
  const student = db.prepare("SELECT * FROM users WHERE id = ?").get(complaint.studentId);
  res.json({
    ...complaint,
    studentName: student?.name || null,
    studentEmail: student?.email || null,
    course: sheet ? courseOfExam(sheet.examId) : null,
    latestPdfUrl: complaint.pdfFileUrl || sheet?.fileUrl || null,
  });
});

app.get("/api/faculty/:id/history", (req, res) => {
  const faculty = requireUser(req.params.id, "faculty", res);
  if (!faculty) return;
  const resolved = db
    .prepare("SELECT * FROM discrepancies WHERE status IN ('Resolved', 'Accepted', 'Rejected') ORDER BY createdAt DESC")
    .all()
    .map((record) => {
      const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(record.sheetId);
      const student = db.prepare("SELECT * FROM users WHERE id = ?").get(record.studentId);
      return { ...record, studentName: student?.name || null, course: sheet ? courseOfExam(sheet.examId) : null };
    });
  res.json(resolved);
});

app.post("/api/faculty/:id/sheets/process-video", videoUpload.single("video"), async (req, res) => {
  try {
    const faculty = requireUser(req.params.id, "faculty", res);
    if (!faculty) return;
    if (!req.file) return res.status(400).json({ error: "video file is required" });

    const formData = new FormData();
    appendFile(formData, "video", req.file);
    for (const [key, value] of Object.entries(req.body || {})) {
      if (value !== undefined && value !== null) formData.append(key, String(value));
    }

    const cvResult = await forwardToCv("/api/video-to-pdf", formData);
    const sheetId = nextId("SH", db.prepare("SELECT id FROM sheets").all());
    const createdAt = new Date().toISOString().slice(0, 10);
    const originalFileName = storePdf(path.join(GENERATED_PDF_DIR, cvResult.pdf_name), GENERATED_ORIGINAL_PDF_DIR, cvResult.pdf_name);
    db.prepare(`
      INSERT INTO sheets
        (id, examId, studentId, published, evaluations, fileName, fileUrl, detectedRollNumber, detectedName, uploadedBy, createdAt, sourceType)
      VALUES (?, NULL, NULL, 0, ?, ?, ?, NULL, NULL, ?, ?, ?)
    `).run(
      sheetId,
      "[]",
      originalFileName,
      `/files/generated/pdfs/originals/${originalFileName}`,
      faculty.id,
      createdAt,
      "video"
    );
    res.status(201).json({
      ...cvResult,
      sheetId,
      pdfUrl: `/files/generated/pdfs/originals/${originalFileName}`,
      sourceVideo: `/files/uploaded/videos/${req.file.filename}`,
    });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post("/api/students/:id/sheets/:sheetId/complaints", pdfUpload.single("pdf"), (req, res) => {
  try {
    const student = requireUser(req.params.id, "student", res);
    if (!student) return;
    console.log("[SCBE backend] complaint submit request", {
      studentId: student.id,
      sheetId: req.params.sheetId,
      bodyKeys: Object.keys(req.body || {}),
      hasFile: Boolean(req.file),
    });
    const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(req.params.sheetId);
    if (!sheet) return res.status(404).json({ error: "Sheet not found" });
    if (sheet.studentId && sheet.studentId !== student.id) {
      return res.status(403).json({ error: "You can only complain about your own sheet" });
    }

    const { title, description } = req.body || {};
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: "title and description are required" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "annotated pdf is required" });
    }

    const complaintId = nextId("C", db.prepare("SELECT id FROM complaints").all());
    const sourceBuffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    if (!sourceBuffer) {
      return res.status(400).json({ error: "annotated pdf buffer is missing" });
    }
    const storedFileName = `${complaintId}-${req.file.originalname || req.file.filename || "complaint.pdf"}`;
    const targetPath = path.join(GENERATED_ANNOTATED_PDF_DIR, storedFileName);
    fs.writeFileSync(targetPath, sourceBuffer);
    const fileUrl = `/files/generated/pdfs/annotated/${storedFileName}`;
    const createdAt = new Date().toISOString().slice(0, 10);
    const annotationData = req.body?.annotationData || "[]";

    db.prepare(`
      INSERT INTO complaints (id, sheetId, studentId, title, description, pdfFileName, pdfFileUrl, annotationData, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
    `).run(complaintId, sheet.id, student.id, title.trim(), description.trim(), storedFileName, fileUrl, annotationData, createdAt);

    db.prepare(`
      INSERT INTO notifications (id, userId, message, createdAt, read)
      VALUES (?, ?, ?, ?, 0)
    `).run(
      nextId("N", db.prepare("SELECT id FROM notifications").all()),
      sheet.uploadedBy || student.id,
      `A complaint was submitted for sheet ${sheet.id}`,
      createdAt
    );

    res.status(201).json({
      complaintId,
      sheetId: sheet.id,
      title: title.trim(),
      description: description.trim(),
      pdfName: storedFileName,
      pdfUrl: fileUrl,
      annotationData,
      status: "Pending",
      createdAt,
    });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.patch("/api/faculty/:id/complaints/:complaintId", (req, res) => {
  try {
    const faculty = requireUser(req.params.id, "faculty", res);
    if (!faculty) return;
    const complaint = db.prepare("SELECT * FROM complaints WHERE id = ?").get(req.params.complaintId);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const { status, comment = "" } = req.body || {};
    const allowedStatuses = new Set(["Pending", "Under Review", "Resolved", "Rejected"]);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid complaint status" });
    }

    db.prepare("UPDATE complaints SET status = ?, resolutionComment = ? WHERE id = ?").run(status, comment || "", complaint.id);
    res.json({ ...complaint, status, resolutionComment: comment || "" });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post("/api/faculty/:id/sheets/process-images", imageUpload.array("images"), async (req, res) => {
  try {
    const faculty = requireUser(req.params.id, "faculty", res);
    if (!faculty) return;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "at least one image is required" });

    const formData = new FormData();
    for (const file of files) {
      appendFile(formData, "images", file);
    }
    for (const [key, value] of Object.entries(req.body || {})) {
      if (value !== undefined && value !== null) formData.append(key, String(value));
    }

    const cvResult = await forwardToCv("/api/images-to-pdf", formData);
    const sheetId = nextId("SH", db.prepare("SELECT id FROM sheets").all());
    const createdAt = new Date().toISOString().slice(0, 10);
    const originalFileName = storePdf(path.join(GENERATED_PDF_DIR, cvResult.pdf_name), GENERATED_ORIGINAL_PDF_DIR, cvResult.pdf_name);
    db.prepare(`
      INSERT INTO sheets
        (id, examId, studentId, published, evaluations, fileName, fileUrl, detectedRollNumber, detectedName, uploadedBy, createdAt, sourceType)
      VALUES (?, NULL, NULL, 0, ?, ?, ?, NULL, NULL, ?, ?, ?)
    `).run(
      sheetId,
      "[]",
      originalFileName,
      `/files/generated/pdfs/originals/${originalFileName}`,
      faculty.id,
      createdAt,
      "images"
    );
    res.status(201).json({
      ...cvResult,
      sheetId,
      pdfUrl: `/files/generated/pdfs/originals/${originalFileName}`,
      sourceImages: files.map((file) => `/files/uploaded/images/${file.filename}`),
    });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post(
  "/api/faculty/:id/sheets/modify",
  mixedUpload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const faculty = requireUser(req.params.id, "faculty", res);
      if (!faculty) return;

      const formData = new FormData();
      const fields = req.body || {};
      const pdfFile = req.files?.pdf?.[0];
      const imageFile = req.files?.image?.[0];

      if (pdfFile) appendFile(formData, "pdf", pdfFile);
      if (imageFile) appendFile(formData, "image", imageFile);

      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) formData.append(key, String(value));
      }

      const cvResult = await forwardToCv("/api/pdf/modify", formData);
      const originalFileName = storePdf(path.join(GENERATED_PDF_DIR, cvResult.output_pdf), GENERATED_ORIGINAL_PDF_DIR, cvResult.output_pdf);
      res.status(201).json({
        ...cvResult,
        pdfUrl: `/files/generated/pdfs/originals/${originalFileName}`,
      });
    } catch (error) {
      handleDbError(res, error);
    }
  }
);

app.post("/api/faculty/:id/sheets/assign", (req, res) => {
  try {
    const faculty = requireUser(req.params.id, "faculty", res);
    if (!faculty) return;
    const { fileName, pdfName, pdfUrl, examId, studentId, rollNumber, name, sourceType = "pdf", pagesExtracted = 0, sheetId } = req.body || {};
    if (!studentId) {
      return res.status(400).json({ error: "studentId is required" });
    }
    const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
    if (!student) return res.status(404).json({ error: "No matching student account for that ID" });
    const exam = examId ? db.prepare("SELECT * FROM exams WHERE id = ?").get(examId) : null;
    if (examId && !exam) return res.status(404).json({ error: "Exam not found" });

    const targetSheetId = sheetId || nextId("SH", db.prepare("SELECT id FROM sheets").all());
    const createdAt = new Date().toISOString().slice(0, 10);
    const finalFileName = pdfName || fileName || null;
    const finalFileUrl = pdfUrl || (finalFileName ? `/files/generated/pdfs/${finalFileName}` : null);
    const existing = sheetId ? db.prepare("SELECT * FROM sheets WHERE id = ?").get(sheetId) : null;
    if (sheetId && !existing) {
      return res.status(404).json({ error: "Sheet not found" });
    }
    if (sheetId) {
      db.prepare(`
        UPDATE sheets
        SET examId = ?, studentId = ?, published = 0, evaluations = ?, fileName = ?, fileUrl = ?, detectedRollNumber = ?, detectedName = ?, uploadedBy = ?, createdAt = ?, sourceType = ?
        WHERE id = ?
      `).run(
        examId || null,
        studentId,
        JSON.stringify([]),
        finalFileName,
        finalFileUrl,
        rollNumber || null,
        name || null,
        faculty.id,
        createdAt,
        sourceType,
        targetSheetId
      );
    } else {
      db.prepare(`
        INSERT INTO sheets
          (id, examId, studentId, published, evaluations, fileName, fileUrl, detectedRollNumber, detectedName, uploadedBy, createdAt, sourceType)
        VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetSheetId,
        examId || null,
        studentId,
        JSON.stringify([]),
        finalFileName,
        finalFileUrl,
        rollNumber || null,
        name || null,
        faculty.id,
        createdAt,
        sourceType
      );
    }

    db.prepare(`
      INSERT INTO notifications (id, userId, message, createdAt, read)
      VALUES (?, ?, ?, ?, 0)
    `).run(
      nextId("N", db.prepare("SELECT id FROM notifications").all()),
      student.id,
      exam ? `A new answer sheet was uploaded for ${exam.courseId || "your course"}` : "A new answer sheet is ready for review",
      "just now"
    );

    const created = db.prepare("SELECT * FROM sheets WHERE id = ?").get(targetSheetId);
    res.status(201).json(sheetSummary(created));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.patch("/api/sheets/:sheetId/publish", (req, res) => {
  try {
    const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(req.params.sheetId);
    if (!sheet) return res.status(404).json({ error: "Sheet not found" });
    db.prepare("UPDATE sheets SET published = 1 WHERE id = ?").run(req.params.sheetId);
    const updated = db.prepare("SELECT * FROM sheets WHERE id = ?").get(req.params.sheetId);
    res.json(sheetSummary(updated));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.get("/api/admin/dashboard", (_req, res) => {
  const students = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'student'").get().count;
  const faculty = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'faculty'").get().count;
  const sheets = db.prepare("SELECT COUNT(*) AS count FROM sheets").get().count;
  const openDiscrepancies = db.prepare("SELECT COUNT(*) AS count FROM discrepancies WHERE status != 'Resolved'").get().count;
  const escalations = db
    .prepare("SELECT * FROM discrepancies WHERE status = 'Escalated' ORDER BY createdAt DESC")
    .all()
    .map((record) => {
      const student = db.prepare("SELECT * FROM users WHERE id = ?").get(record.studentId);
      const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(record.sheetId);
      return { ...record, studentName: student?.name || null, course: sheet ? courseOfExam(sheet.examId) : null };
    });
  res.json({
    stats: { students, faculty, sheetsProcessed: sheets, openDiscrepancies },
    escalations,
  });
});

app.get("/api/admin/students", (_req, res) => {
  const students = db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY name").all().map((student) => {
    const sheetCount = db.prepare("SELECT COUNT(*) AS count FROM sheets WHERE studentId = ?").get(student.id).count;
    const discrepancyCount = db.prepare("SELECT COUNT(*) AS count FROM discrepancies WHERE studentId = ?").get(student.id).count;
    return { ...safeUser(student), sheetCount, discrepancyCount };
  });
  res.json(students);
});

app.get("/api/admin/faculty", (_req, res) => {
  const faculty = db.prepare("SELECT * FROM users WHERE role = 'faculty' ORDER BY name").all().map((member) => {
    const pendingCount = db.prepare(
      "SELECT COUNT(*) AS count FROM discrepancies WHERE status IN ('Submitted', 'Under Review', 'Escalated')"
    ).get().count;
    return { ...safeUser(member), pendingCount };
  });
  res.json(faculty);
});

app.get("/api/admin/examinations", (_req, res) => {
  const examinations = db.prepare("SELECT * FROM exams ORDER BY id").all().map((exam) => {
    const course = courseOfExam(exam.id);
    const sheetCount = db.prepare("SELECT COUNT(*) AS count FROM sheets WHERE examId = ?").get(exam.id).count;
    return { ...exam, course, sheetCount };
  });
  res.json(examinations);
});

app.get("/api/admin/answer-sheets", (_req, res) => {
  const sheets = db.prepare("SELECT * FROM sheets ORDER BY createdAt DESC").all().map(sheetSummary);
  res.json(sheets);
});

app.listen(PORT, HOST, () => {
  console.log(`SCBE backend running at http://${HOST}:${PORT}`);
});
