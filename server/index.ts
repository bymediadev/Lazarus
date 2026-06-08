import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { transcribeAudio } from "./assemblyai.js";
import { analyzeTranscript } from "./gemini.js";
import { savePostMortem } from "./supabase.js";
import { buildAnalysisTranscript } from "./transcript.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "../dist");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN ??
  "http://localhost:5173,http://localhost:3001,http://127.0.0.1:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      console.warn(`CORS: blocked origin ${origin}`);
      callback(null, false);
    },
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    gemini: !!process.env.GEMINI_API_KEY,
    assemblyai: !!process.env.ASSEMBLYAI_API_KEY,
    supabase: !!process.env.SUPABASE_URL,
  });
});

function normalizeTextField(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((part): part is string => typeof part === "string").join("\n\n");
  }
  return "";
}

app.post("/api/post-mortem", upload.single("recording"), async (req, res) => {
  try {
    const dealValue = parseFloat(String(req.body.deal_value)) || 0;
    const manualTranscript = normalizeTextField(req.body.transcript);
    let audioTranscript = "";

    if (req.file) {
      audioTranscript = await transcribeAudio(req.file.buffer, req.file.originalname);
    }

    const { text: transcript, sources } = buildAnalysisTranscript({
      audioTranscript,
      manualTranscript,
    });

    if (!transcript.trim()) {
      res.status(400).json({
        error: "Provide a recording, a transcript, or both.",
      });
      return;
    }

    const result = await analyzeTranscript(transcript, dealValue);

    const savedId = await savePostMortem({
      clientName: result.client_name,
      dealValue,
      dealStatus: result.deal_status,
      headline: result.headline,
      diagnosis: result.diagnosis,
      actionPlan: result.action_plan.join("\n"),
      transcriptText: transcript,
    });

    res.json({ ...result, id: savedId, sources });
  } catch (err) {
    console.error("Post-mortem error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Post-mortem failed.",
    });
  }
});

if (process.env.NODE_ENV === "production" || existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`Lazarus API running on http://localhost:${PORT}`);
  if (existsSync(distPath)) {
    console.log(`Serving frontend from ${distPath}`);
  }
});
