import test from "node:test";
import assert from "node:assert/strict";
import {
  applyProposal,
  createAdjustmentProposal,
  createInitialState,
  generatePlan,
  moveWorkout,
  toggleWorkoutLock,
} from "../src/engine.js";

function plannedState() {
  const state = createInitialState();
  state.profile = {
    ...state.profile,
    name: "Athlete",
    raceName: "May Olympic Triathlon",
    raceDate: "2027-05-23",
    trainingDays: 5,
  };
  state.workouts = generatePlan(state.profile, "2026-10-28");
  state.onboardingComplete = true;
  return state;
}

test("generates a complete plan with training, strength, rest, and one race", () => {
  const state = plannedState();
  const types = new Set(state.workouts.map((workout) => workout.type));

  for (const type of ["swim", "bike", "run", "strength", "rest", "race"]) {
    assert.ok(types.has(type), `expected ${type} sessions`);
  }
  assert.equal(state.workouts.filter((workout) => workout.type === "race").length, 1);
  assert.equal(state.workouts.at(-1).date, "2027-05-23");
  assert.ok(state.workouts.some((workout) => workout.firmness === "firm"));
  assert.ok(state.workouts.some((workout) => workout.firmness === "flexible"));
});

test("creates a reviewable recovery proposal from a low-readiness check-in", () => {
  const state = plannedState();
  const proposal = createAdjustmentProposal(state, {
    kind: "check-in",
    data: { energy: 2, soreness: 4, sleep: 2 },
  }, "2026-10-28");

  assert.ok(proposal);
  assert.equal(proposal.status, "pending");
  assert.equal(proposal.changes[0].after.type, "rest");
  state.proposals.push(proposal);
  applyProposal(state, proposal.id);
  assert.equal(state.proposals[0].status, "accepted");
  assert.equal(state.workouts.find((workout) => workout.id === proposal.changes[0].workoutId).type, "rest");
  assert.equal(state.planHistory.length, 1);
});

test("shortens workouts that conflict with travel availability", () => {
  const state = plannedState();
  const proposal = createAdjustmentProposal(state, {
    kind: "availability",
    data: { startDate: "2026-10-28", endDate: "2026-11-08", minutes: 30 },
  }, "2026-10-28");

  assert.ok(proposal);
  assert.ok(proposal.changes.length > 0);
  assert.ok(proposal.changes.every((change) => change.after.durationMinutes === 30));
});

test("locked workouts cannot be moved", () => {
  const state = plannedState();
  const workout = state.workouts.find((item) => item.type === "run");
  const originalDate = workout.date;

  toggleWorkoutLock(state, workout.id);
  moveWorkout(state, workout.id, "2026-12-01");
  assert.equal(workout.date, originalDate);

  toggleWorkoutLock(state, workout.id);
  moveWorkout(state, workout.id, "2026-12-01");
  assert.equal(workout.date, "2026-12-01");
});

test("reduces the next hard session after an oversized imported activity", () => {
  const state = plannedState();
  const planned = state.workouts.find((item) => item.type === "run" && item.date >= "2026-10-28");
  const proposal = createAdjustmentProposal(state, {
    kind: "activity",
    data: { date: planned.date, type: "run", durationMinutes: planned.durationMinutes * 1.5 },
  }, "2026-10-28");

  assert.ok(proposal);
  assert.match(proposal.reason, /substantially longer/i);
  assert.ok(proposal.changes[0].after.durationMinutes < proposal.changes[0].before.durationMinutes);
});
