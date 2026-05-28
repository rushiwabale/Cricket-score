import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import mysql from "mysql2/promise";

const app = express();
const port = Number(process.env.PORT || 3000);
const databaseName = getEnv("MYSQL_DATABASE", "MYSQLDATABASE") || "village_cricket";

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

try {
  await ensureDatabase();
} catch (error) {
  console.error("Could not connect to MySQL.");
  console.error("Check .env values or start MySQL with: docker compose up -d");
  throw error;
}

const pool = mysql.createPool({
  host: getEnv("MYSQL_HOST", "MYSQLHOST") || "localhost",
  port: Number(getEnv("MYSQL_PORT", "MYSQLPORT") || 3306),
  user: getEnv("MYSQL_USER", "MYSQLUSER") || "root",
  password: getEnv("MYSQL_PASSWORD", "MYSQLPASSWORD") || "",
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 10,
});

await ensureTables();

app.get("/api/health", async (_request, response) => {
  await pool.query("SELECT 1");
  response.json({ ok: true });
});

app.get("/api/matches/:id", async (request, response) => {
  const [rows] = await pool.execute("SELECT score_json FROM matches WHERE id = ?", [
    request.params.id,
  ]);

  if (!rows.length) {
    response.status(404).json({ error: "Match not found" });
    return;
  }

  response.json(normalizeScore(rows[0].score_json));
});

app.post("/api/matches", async (request, response) => {
  const match = normalizeMatchInput(request.body);
  const id = crypto.randomUUID();
  match.id = id;

  await pool.execute(
    `INSERT INTO matches (id, team_a, team_b, max_overs, status, winner, score_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      match.teams[0],
      match.teams[1],
      match.maxOvers,
      match.winner ? "completed" : "in_progress",
      match.winner,
      JSON.stringify(match),
    ],
  );

  response.status(201).json(match);
});

app.put("/api/matches/:id", async (request, response) => {
  const match = normalizeMatchInput({ ...request.body, id: request.params.id });
  const [result] = await pool.execute(
    `UPDATE matches
     SET team_a = ?, team_b = ?, max_overs = ?, status = ?, winner = ?, score_json = ?
     WHERE id = ?`,
    [
      match.teams[0],
      match.teams[1],
      match.maxOvers,
      match.winner ? "completed" : "in_progress",
      match.winner,
      JSON.stringify(match),
      request.params.id,
    ],
  );

  if (result.affectedRows === 0) {
    response.status(404).json({ error: "Match not found" });
    return;
  }

  response.json(match);
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Cricket scorer running at http://localhost:${port}`);
});

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: getEnv("MYSQL_HOST", "MYSQLHOST") || "localhost",
    port: Number(getEnv("MYSQL_PORT", "MYSQLPORT") || 3306),
    user: getEnv("MYSQL_USER", "MYSQLUSER") || "root",
    password: getEnv("MYSQL_PASSWORD", "MYSQLPASSWORD") || "",
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
  await connection.end();
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id VARCHAR(36) PRIMARY KEY,
      team_a VARCHAR(120) NOT NULL,
      team_b VARCHAR(120) NOT NULL,
      max_overs INT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'in_progress',
      winner VARCHAR(255) NOT NULL DEFAULT '',
      score_json JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

function normalizeScore(scoreJson) {
  return typeof scoreJson === "string" ? JSON.parse(scoreJson) : scoreJson;
}

function getEnv(...names) {
  return names.map((name) => process.env[name]).find(Boolean);
}

function normalizeMatchInput(input) {
  if (!input || !Array.isArray(input.teams) || input.teams.length !== 2) {
    throw new Error("Invalid match payload");
  }

  const teamA = String(input.teams[0] || "").trim();
  const teamB = String(input.teams[1] || "").trim();
  const maxOvers = Number(input.maxOvers);

  if (!teamA || !teamB || !Number.isFinite(maxOvers) || maxOvers < 1) {
    throw new Error("Invalid match setup");
  }

  return {
    id: input.id || "",
    teams: [teamA, teamB],
    maxOvers: Math.min(50, Math.max(1, Math.floor(maxOvers))),
    inningsIndex: Number(input.inningsIndex || 0),
    innings: Array.isArray(input.innings) ? input.innings : [],
    winner: String(input.winner || ""),
  };
}
