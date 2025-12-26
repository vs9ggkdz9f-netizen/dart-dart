// Minimal Express + WebSocket Backend (in-memory demo)
// Für Produktion: Postgres + persistente Speicherung ergänzen.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Simple CORS for REST
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

// Health endpoint
app.get("/", (_req, res) => {
  res.json({ ok: true, status: "healthy" });
});

// In-memory state
let match = null;
let throwsLog = []; // {id, playerId, value, mult, score, turn, dartInTurn}
let currentTurn = 1;
let dartsInTurn = 0; // 0-2 innerhalb einer Aufnahme

// Helpers
const createId = () => Math.random().toString(16).slice(2);
const computeScore = (value, mult) => {
  if (value === 25 && mult === 2) return 50;
  if (value === 25 && mult === 1) return 25;
  return value * mult;
};

// REST
app.post("/api/match", (req, res) => {
  const { mode = "501", players = [] } = req.body || {};
  match = {
    id: createId(),
    mode,
    players: players.map((name, idx) => ({
      id: createId(),
      name,
      order: idx,
      score: mode === "301" ? 301 : 501,
      legs: 0,
      sets: 0,
    })),
    currentIndex: 0,
    currentTurn,
    dartsInTurn,
  };
  throwsLog = [];
  currentTurn = 1;
  dartsInTurn = 0;
  io.emit("match_created", match);
  res.json(match);
});

app.get("/api/match", (_req, res) => {
  if (!match) return res.status(404).json({ error: "no match" });
  res.json({ match: { ...match, currentTurn, dartsInTurn }, throws: throwsLog });
});

app.post("/api/match/throw", (req, res) => {
  if (!match) return res.status(404).json({ error: "no match" });
  const { playerId, value, mult } = req.body || {};
  const p = match.players.find((x) => x.id === playerId);
  if (!p) return res.status(400).json({ error: "player not found" });
  const score = computeScore(value, mult);

  // simple x01 logic without bust/double-out (demo)
  p.score = Math.max(0, p.score - score);

  const entry = {
    id: createId(),
    playerId,
    value,
    mult,
    score,
    turn: currentTurn,
    dartInTurn: dartsInTurn + 1,
  };
  throwsLog.push(entry);
  dartsInTurn += 1;

  // WIN: Wenn Score 0 erreicht wurde, Leg/Set vergeben und neues Leg starten
  if (p.score === 0){
    p.legs = (p.legs || 0) + 1;
    if (p.legs >= 3){
      p.sets = (p.sets || 0) + 1;
      // Legs aller Spieler zurücksetzen
      match.players.forEach(pl => pl.legs = 0);
    }
    // neues Leg: Scores zurück auf Start, Turn-Infos reset, Wurflog leeren
    const startScore = match.mode === "301" ? 301 : 501;
    match.players.forEach(pl => pl.score = startScore);
    currentTurn = 1;
    dartsInTurn = 0;
    match.currentIndex = 0;
    throwsLog = [];
    const payloadMatch = { ...match, currentTurn, dartsInTurn };
    io.emit("match_state", { match: payloadMatch, throws: throwsLog });
    return res.json({ entry, match: payloadMatch });
  }

  // Nach 3 Darts Spieler wechseln, sonst gleicher Spieler am Zug
  if (dartsInTurn >= 3){
    dartsInTurn = 0;
    currentTurn += 1;
    match.currentIndex = (match.currentIndex + 1) % match.players.length;
  }

  const payloadMatch = { ...match, currentTurn, dartsInTurn };
  io.emit("throw_added", { entry, match: payloadMatch });
  res.json({ entry, match: payloadMatch });
});

// WebSocket
io.on("connection", (socket) => {
  console.log("client connected");
  if (match) socket.emit("match_state", { match: { ...match, currentTurn, dartsInTurn }, throws: throwsLog });
  socket.on("disconnect", () => console.log("client disconnected"));
});

// Start
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log("Backend läuft auf Port", PORT);
});

