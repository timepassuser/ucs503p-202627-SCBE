import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE_DIR = __dirname;
const DATA_DIR = path.join(CODE_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "scbe.sqlite");

const SAMPLE_USERS = [
  {
    id: "test_student_one",
    name: "Test Student One",
    role: "student",
    email: "test.student.one@example.com",
    password: "test_student_one",
    programme: "CSE",
    classSection: "A",
    semester: 5,
    designation: "",
  },
  {
    id: "test_faculty_one",
    name: "Test Faculty One",
    role: "faculty",
    email: "test.faculty.one@example.com",
    password: "test_faculty_one",
    programme: "",
    classSection: "",
    semester: null,
    designation: "Assistant Professor",
  },
];

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function clearDirectoryContents(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory)) {
    fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
  }
}

function prepareDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const relativePath of [
    path.join("generated", "pdfs", "originals"),
    path.join("generated", "pdfs", "annotated"),
    path.join("uploaded", "videos"),
    path.join("uploaded", "images"),
    path.join("uploaded", "pdfs"),
  ]) {
    fs.mkdirSync(path.join(DATA_DIR, relativePath), { recursive: true });
  }
}

function wipeData() {
  fs.rmSync(DB_PATH, { force: true });
  clearDirectoryContents(DATA_DIR);
  prepareDirectories();
}

function seedDatabase() {
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
  `);

  const insert = db.prepare(`
    INSERT INTO users (
      id, name, role, email, password_hash, password_salt, programme, classSection, semester, designation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const user of SAMPLE_USERS) {
    const { hash, salt } = hashPassword(user.password);
    insert.run(
      user.id,
      user.name,
      user.role,
      user.email,
      hash,
      salt,
      user.programme,
      user.classSection,
      user.semester,
      user.designation
    );
  }

  db.close();
}

wipeData();
seedDatabase();

console.log("Reset complete. Seeded:");
for (const user of SAMPLE_USERS) {
  console.log(`- ${user.role}: ${user.id} / ${user.password}`);
}
