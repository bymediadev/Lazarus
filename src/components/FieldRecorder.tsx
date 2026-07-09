import { useCallback, useEffect, useRef, useState, useLayoutEffect } from "react";
import {
  assembleSessionBlob,
  clearSessionChunks,
  saveRecordingChunk,
} from "../lib/offlineRecording";

interface Props {
  onRecordingReady: (file: File, sessionId: string) => void;
  onClear: () => void;
  hasRecording: boolean;
}

type RecorderStatus = "idle" | "recording" | "offline-buffering" | "ready" | "error";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function FieldRecorder({ onRecordingReady, onClear, hasRecording }: Props) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [duration, setDuration] = useState(0);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);
  const mimeTypeRef = useRef("audio/webm");
  const timerRef = useRef<number | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const finalizeRecording = useCallback(
    async (sessionId: string) => {
      const blob = await assembleSessionBlob(sessionId, mimeTypeRef.current);
      if (!blob || blob.size === 0) {
        setError("Recording empty — try again.");
        setStatus("error");
        return;
      }

      const ext = mimeTypeRef.current.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `field-capture-${Date.now()}.${ext}`, {
        type: mimeTypeRef.current,
      });

      onRecordingReady(file, sessionId);
      setSessionLabel(file.name);
      setStatus(offline ? "offline-buffering" : "ready");
    },
    [offline, onRecordingReady]
  );

  // Keep a ref to the latest finalizeRecording so recorder.onstop — which closes over
  // a version captured at startCapture time — always calls the current implementation
  // and never holds a stale prop snapshot.
  const finalizeRecordingRef = useRef(finalizeRecording);
  useLayoutEffect(() => {
    finalizeRecordingRef.current = finalizeRecording;
  });

  const startCapture = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm";
      mimeTypeRef.current = mimeType;

      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;
      chunkIndexRef.current = 0;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (!event.data.size || !sessionIdRef.current) return;
        const chunk = {
          id: `${sessionIdRef.current}-${chunkIndexRef.current}`,
          sessionId: sessionIdRef.current,
          index: chunkIndexRef.current,
          blob: event.data,
          timestamp: Date.now(),
        };
        chunkIndexRef.current += 1;
        try {
          await saveRecordingChunk(chunk);
        } catch {
          setError("Failed to buffer chunk locally.");
        }
      };

      recorder.onstop = async () => {
        stopTracks();
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (sessionIdRef.current) {
          // Use the ref so we always call the latest finalizeRecording even if
          // props changed between startCapture and onstop firing.
          await finalizeRecordingRef.current(sessionIdRef.current);
        }
      };

      recorder.start(1000);
      setStatus(offline ? "offline-buffering" : "recording");
      setDuration(0);
      timerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access denied.");
      setStatus("error");
      stopTracks();
    }
  };

  const stopCapture = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
  };

  const handleClear = async () => {
    if (sessionIdRef.current) {
      await clearSessionChunks(sessionIdRef.current);
      sessionIdRef.current = null;
    }
    setSessionLabel(null);
    setDuration(0);
    setStatus("idle");
    setError(null);
    onClear();
  };

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      if (status === "offline-buffering" && sessionIdRef.current) {
        setStatus("ready");
      }
    };
    const onOffline = () => setOffline(true);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [status]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      stopTracks();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [stopTracks]);

  const isRecording = status === "recording" || status === "offline-buffering";

  return (
    <div className="field-recorder">
      <p className="console-tab-hint">
        Capture in-person field audio. Chunks buffer to IndexedDB when offline and sync when
        connectivity returns.
      </p>

      <div className={`field-recorder-panel ${isRecording ? "field-recorder-active" : ""}`}>
        <span className="field-recorder-icon" aria-hidden="true">
          {isRecording ? "●" : "🎙️"}
        </span>
        <span className="field-recorder-status">
          {status === "idle" && "Ready to capture"}
          {status === "recording" && `Recording ${formatDuration(duration)}`}
          {status === "offline-buffering" &&
            `Offline — buffering ${formatDuration(duration)} locally`}
          {status === "ready" && "Capture ready for analysis"}
          {status === "error" && "Capture failed"}
        </span>
        {offline && <span className="field-recorder-offline">Offline mode</span>}
        {sessionLabel && hasRecording && (
          <span className="field-recorder-file">{sessionLabel}</span>
        )}
      </div>

      <div className="field-recorder-actions">
        {!isRecording ? (
          <button type="button" className="field-capture-btn" onClick={startCapture}>
            Start In-Person Capture
          </button>
        ) : (
          <button type="button" className="field-capture-btn field-capture-stop" onClick={stopCapture}>
            Stop Capture
          </button>
        )}
        {hasRecording && !isRecording && (
          <button type="button" className="file-clear-btn" onClick={handleClear}>
            Clear field recording
          </button>
        )}
      </div>

      {error && <p className="field-recorder-error">{error}</p>}
    </div>
  );
}
