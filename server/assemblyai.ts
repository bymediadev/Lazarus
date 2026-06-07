const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Paste a transcript instead, or add the key to .env."
    );
  }

  const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/octet-stream",
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`AssemblyAI upload failed: ${uploadRes.statusText}`);
  }

  const { upload_url } = (await uploadRes.json()) as { upload_url: string };

  const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speaker_labels: true,
    }),
  });

  if (!transcriptRes.ok) {
    throw new Error(`AssemblyAI transcript request failed: ${transcriptRes.statusText}`);
  }

  const { id } = (await transcriptRes.json()) as { id: string };

  const pollInterval = 3000;
  const maxAttempts = 60;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(pollInterval);

    const statusRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${id}`, {
      headers: { authorization: apiKey },
    });

    const job = (await statusRes.json()) as {
      status: string;
      text?: string;
      error?: string;
    };

    if (job.status === "completed") {
      return job.text ?? "";
    }

    if (job.status === "error") {
      throw new Error(`Transcription failed: ${job.error ?? "unknown error"}`);
    }
  }

  throw new Error(`Transcription timed out for ${filename}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
