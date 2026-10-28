import path from "node:path";
import { Decoder, Stream } from "@garmin/fitsdk";
import { localDate } from "./engine.js";

function sportType(value) {
  const sport = String(value ?? "").toLowerCase();
  if (sport.includes("swim")) return "swim";
  if (sport.includes("cycl") || sport.includes("bike")) return "bike";
  if (sport.includes("run")) return "run";
  if (sport.includes("strength") || sport.includes("training")) return "strength";
  return "other";
}

export function decodeFitActivity(bytes, filePath, hash, importedAt = new Date()) {
  const decoder = new Decoder(Stream.fromBuffer(bytes));
  if (!decoder.isFIT()) throw new Error("The file does not have a valid FIT header.");
  const { messages, errors } = decoder.read();
  if (errors?.length) throw new Error(errors.map(String).join("; "));

  const session = messages.sessionMesgs?.[0];
  if (!session) throw new Error("This FIT file is not a completed activity.");
  const start = session.localTimestamp ?? session.startTime;
  const startDate = start instanceof Date ? start : new Date(start);
  const durationSeconds = Number(session.totalTimerTime ?? session.totalElapsedTime ?? 0);
  const distanceMeters = Number(session.totalDistance ?? 0);

  return {
    id: `activity-${hash.slice(0, 16)}`,
    hash,
    sourcePath: filePath,
    fileName: path.basename(filePath),
    date: Number.isNaN(startDate.getTime()) ? localDate(importedAt) : localDate(startDate),
    startedAt: Number.isNaN(startDate.getTime()) ? null : startDate.toISOString(),
    type: sportType(session.sport ?? session.subSport),
    sport: session.sport ?? "unknown",
    durationMinutes: Math.round(durationSeconds / 60),
    distanceKm: +(distanceMeters / 1000).toFixed(2),
    averageHeartRate: session.avgHeartRate ?? null,
    maxHeartRate: session.maxHeartRate ?? null,
    calories: session.totalCalories ?? null,
    trainingStressScore: session.trainingStressScore ?? null,
    importedAt: importedAt.toISOString(),
  };
}
