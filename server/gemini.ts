import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface PostMortemOutput {
  client_name: string;
  stall_cause: string;
  why_it_stalled: string;
  restart_plan: string[];
}

function loadSystemPrompt(): string {
  return readFileSync(join(__dirname, "../prompts/final_prompt_v2.txt"), "utf-8");
}

export async function analyzeTranscript(
  transcript: string,
  dealValue: number
): Promise<PostMortemOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
    },
  });

  const systemPrompt = loadSystemPrompt();
  const userMessage = `DEAL VALUE: $${dealValue.toLocaleString()}

TRANSCRIPT:
${transcript}`;

  const result = await model.generateContent([
    { text: systemPrompt },
    { text: userMessage },
  ]);

  const text = result.response.text();
  const parsed = JSON.parse(text) as PostMortemOutput;

  if (!parsed.stall_cause || !parsed.why_it_stalled || !Array.isArray(parsed.restart_plan)) {
    throw new Error("Gemini returned an invalid post-mortem structure.");
  }

  return parsed;
}
