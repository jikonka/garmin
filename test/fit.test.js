import test from "node:test";
import assert from "node:assert/strict";
import { Encoder, Profile } from "@garmin/fitsdk";
import { decodeFitActivity } from "../src/fit.js";

function activityFit() {
  const encoder = new Encoder();
  const startedAt = new Date("2026-10-27T23:30:00.000Z");
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    manufacturer: "development",
    product: 1,
    serialNumber: 42,
    timeCreated: startedAt,
    type: "activity",
  });
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.SESSION,
    timestamp: new Date("2026-10-28T00:30:00.000Z"),
    startTime: startedAt,
    sport: "running",
    subSport: "road",
    totalElapsedTime: 3600,
    totalTimerTime: 3540,
    totalDistance: 10000,
    avgHeartRate: 142,
    maxHeartRate: 166,
    totalCalories: 640,
  });
  return Buffer.from(encoder.close());
}

test("decodes a completed Garmin FIT activity into a local summary", () => {
  const activity = decodeFitActivity(activityFit(), "/activities/morning-run.fit", "abcdef1234567890");

  assert.equal(activity.type, "run");
  assert.equal(activity.fileName, "morning-run.fit");
  assert.equal(activity.durationMinutes, 59);
  assert.equal(activity.distanceKm, 10);
  assert.equal(activity.averageHeartRate, 142);
  assert.equal(activity.maxHeartRate, 166);
  assert.equal(activity.calories, 640);
});

test("rejects data that is not a FIT file", () => {
  assert.throws(
    () => decodeFitActivity(Buffer.from("not a fit file"), "broken.fit", "bad"),
    /valid FIT header/,
  );
});
