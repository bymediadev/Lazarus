import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const g = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const models = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

for (const model of models) {
  try {
    const r = await g
      .getGenerativeModel({
        model,
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      })
      .generateContent('Return JSON: {"ok":true}');
    console.log(model, "OK", r.response.text().trim());
  } catch (e) {
    const msg = String(e);
    const code = msg.includes("429") ? "429" : msg.includes("404") ? "404" : "ERR";
    console.log(model, code, msg.split("\n")[0].slice(0, 120));
  }
  await new Promise((r) => setTimeout(r, 2000));
}
