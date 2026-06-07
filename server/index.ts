import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { transcribeAudio } from "./assemblyai.js";
import { analyzeTranscript } from "./gemini.js";
import { savePostMortem } from "./supabase.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    gemini: !!process.env.GEMINI_API_KEY,
    assemblyai: !!process.env.ASSEMBLYAI_API_KEY,
    supabase: !!process.env.SUPABASE_URL,
  });
});

app.post("/api/post-mortem", upload.single("recording"), async (req, res) => {
  try {
    const dealValue = parseFloat(req.body.deal_value) || 0;
    let transcript: string = req.body.transcript ?? "";

    if (req.file) {
      transcript = await transcribeAudio(req.file.buffer, req.file.originalname);
    }

    if (!transcript.trim()) {
      res.status(400).json({ error: "No transcript available. Upload audio or paste text." });
      return;
    }

    const result = await analyzeTranscript(transcript, dealValue);

    const savedId = await savePostMortem({
      clientName: result.client_name,
      dealValue,
      stallCause: result.stall_cause,
      whyItStalled: result.why_it_stalled,
      restartPlan: result.restart_plan.join("\n"),
      transcriptText: transcript,
    });

    res.json({ ...result, id: savedId });
  } catch (err) {
    console.error("Post-mortem error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Post-mortem failed.",
    });
  }
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`Lazarus API running on http://localhost:${PORT}`);
});
