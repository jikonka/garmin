const DAY_MS = 86_400_000;

export const ACTIVITY_TYPES = ["swim", "bike", "run", "strength", "brick", "rest"];

const workoutLibrary = {
  swim: {
    title: "Technique & aerobic swim",
    purpose: "Improve efficiency while building sustainable swim fitness.",
    intensity: "Easy–steady · RPE 3–5",
    details: ["200 m easy warm-up", "6 × 50 m technique drills", "Steady aerobic main set", "100 m relaxed cooldown"],
  },
  bike: {
    title: "Aerobic bike",
    purpose: "Build cycling endurance without compromising the next session.",
    intensity: "Zone 2 · RPE 3–4",
    details: ["10 min easy spin", "Steady aerobic riding", "4 × 1 min high-cadence spin", "5 min easy cooldown"],
  },
  run: {
    title: "Aerobic run",
    purpose: "Build durable running fitness at a conversational effort.",
    intensity: "Zone 2 · RPE 3–4",
    details: ["8 min easy warm-up", "Relaxed aerobic running", "4 × 20 sec smooth strides", "5 min walk or easy jog"],
  },
  strength: {
    title: "Bodyweight strength",
    purpose: "Improve triathlon posture, stability, and injury resilience.",
    intensity: "Controlled · leave 2–3 reps in reserve",
    details: ["2–3 rounds", "Split squat · 8 each side", "Push-up · 8–12", "Hip bridge · 12–15", "Calf raise · 15", "Dead bug · 8 each side"],
  },
  brick: {
    title: "Bike-to-run brick",
    purpose: "Practice the transition from cycling to efficient running.",
    intensity: "Mostly Zone 2 · RPE 3–5",
    details: ["Easy bike warm-up", "Steady aerobic bike", "Quick transition", "Short relaxed run", "5 min easy cooldown"],
  },
  rest: {
    title: "Rest & recovery",
    purpose: "Absorb training and arrive ready for the next key session.",
    intensity: "Rest",
    details: ["No structured training", "Optional gentle walk or mobility", "Prioritize sleep and hydration"],
  },
};

export function localDate(value = new Date()) {
  const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / DAY_MS);
}

export function startOfWeek(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const offset = (date.getDay() + 6) % 7;
  return addDays(dateString, -offset);
}

export function createInitialState() {
  return {
    version: 1,
    profile: {
      name: "",
      birthDate: "",
      raceDate: "",
      raceName: "Olympic triathlon",
      targetFinishMinutes: null,
      trainingDays: 5,
      preferredRestDay: 1,
      units: "metric",
      healthNotes: "",
    },
    settings: {
      activityFolder: "",
      watchFolder: true,
      reviewAdjustments: true,
      allowRecoveryDays: true,
      shorterAlternatives: true,
      notifications: false,
      theme: "light",
    },
    availability: [],
    workouts: [],
    activities: [],
    checkIns: [],
    proposals: [],
    planHistory: [],
    onboardingComplete: false,
    lastImportAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function phaseFor(weeksToRace, weekIndex) {
  if (weeksToRace <= 1) return "Race week";
  if (weeksToRace <= 3) return "Taper";
  if (weeksToRace <= 8) return "Peak";
  if ((weekIndex + 1) % 4 === 0) return "Recovery";
  if (weeksToRace <= 16) return "Build";
  return "Base";
}

function durationFor(type, phase, weekIndex) {
  const base = { swim: 45, bike: 60, run: 40, strength: 30, brick: 75, rest: 0 }[type];
  if (!base) return 0;
  const progression = Math.min(1.3, 1 + (weekIndex % 4) * 0.06);
  const phaseFactor = { Base: 0.9, Build: 1, Peak: 1.08, Recovery: 0.72, Taper: 0.62, "Race week": 0.45 }[phase] ?? 1;
  return Math.max(type === "strength" ? 20 : 15, Math.round((base * progression * phaseFactor) / 5) * 5);
}

function dayTemplates(trainingDays) {
  const templates = {
    4: ["rest", "run", "swim", "rest", "strength", "brick", "bike"],
    5: ["rest", "run", "swim", "bike", "strength", "brick", "rest"],
    6: ["rest", "run", "swim", "bike", "strength", "brick", "run"],
  };
  return templates[Math.max(4, Math.min(6, trainingDays))] ?? templates[5];
}

function makeWorkout(date, type, phase, weekIndex, dayIndex, today) {
  const library = workoutLibrary[type];
  const durationMinutes = durationFor(type, phase, weekIndex);
  const distanceKm = type === "run" ? +(durationMinutes / 7).toFixed(1)
    : type === "bike" ? +(durationMinutes / 2.6).toFixed(1)
      : type === "swim" ? +(durationMinutes * 0.025).toFixed(2)
        : null;
  return {
    id: `plan-${date}-${type}-${dayIndex}`,
    date,
    type,
    title: phase === "Recovery" && type !== "rest" ? `Recovery ${library.title.toLowerCase()}` : library.title,
    phase,
    purpose: library.purpose,
    intensity: library.intensity,
    durationMinutes,
    distanceKm,
    details: [...library.details],
    alternatives: durationMinutes >= 45 ? [30, 45, 60].filter((minutes) => minutes < durationMinutes) : [],
    locked: false,
    status: "planned",
    firmness: daysBetween(today, date) <= 13 ? "firm" : "flexible",
    source: "generated",
  };
}

export function generatePlan(profile, today = localDate()) {
  if (!profile.raceDate || daysBetween(today, profile.raceDate) < 1) {
    throw new Error("Choose a race date in the future.");
  }

  const firstMonday = startOfWeek(today);
  const totalDays = daysBetween(firstMonday, profile.raceDate);
  const template = dayTemplates(profile.trainingDays);
  const workouts = [];

  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = addDays(firstMonday, offset);
    if (date < today) continue;
    const weekIndex = Math.floor(offset / 7);
    const weeksToRace = Math.ceil(daysBetween(date, profile.raceDate) / 7);
    const dayIndex = offset % 7;
    const phase = phaseFor(weeksToRace, weekIndex);
    let type = template[dayIndex];

    if (type === "run" && dayIndex === 6 && weekIndex % 2 === 1) type = "swim";
    if (type === "brick" && phase === "Base" && weekIndex % 2 === 0) type = "bike";
    workouts.push(makeWorkout(date, type, phase, weekIndex, dayIndex, today));
  }

  workouts.push({
    id: `race-${profile.raceDate}`,
    date: profile.raceDate,
    type: "race",
    title: profile.raceName || "Olympic triathlon",
    phase: "Race week",
    purpose: "Execute the race plan with controlled pacing.",
    intensity: "Race effort",
    durationMinutes: profile.targetFinishMinutes || null,
    distanceKm: 51.5,
    details: ["1.5 km swim", "40 km bike", "10 km run"],
    alternatives: [],
    locked: true,
    status: "planned",
    firmness: "flexible",
    source: "generated",
  });

  return workouts.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

export function findPlannedMatch(workouts, activity) {
  const sameDay = workouts.filter((workout) => workout.date === activity.date && workout.type === activity.type);
  if (sameDay.length) return sameDay[0];
  return workouts.find((workout) => Math.abs(daysBetween(workout.date, activity.date)) <= 1 && workout.type === activity.type);
}

export function createAdjustmentProposal(state, trigger, today = localDate()) {
  const changes = [];
  let reason = "";
  const future = state.workouts.filter((workout) => workout.date >= today && !workout.locked && workout.status === "planned");

  if (trigger.kind === "check-in") {
    const { energy, soreness, sleep } = trigger.data;
    const fatigued = energy <= 2 || soreness >= 4 || sleep <= 2;
    if (!fatigued) return null;
    const target = future.find((workout) => ["run", "bike", "brick"].includes(workout.type) && workout.intensity !== "Rest");
    if (!target) return null;
    changes.push({
      workoutId: target.id,
      before: { type: target.type, title: target.title, durationMinutes: target.durationMinutes, intensity: target.intensity },
      after: { type: "rest", title: "Extra recovery", durationMinutes: 0, intensity: "Rest", purpose: "Reduce load while recovery signals are low." },
    });
    reason = "Your check-in suggests incomplete recovery, so the next demanding session is replaced with rest.";
  }

  if (trigger.kind === "activity") {
    const activity = trigger.data;
    const match = findPlannedMatch(state.workouts, activity);
    if (match && activity.durationMinutes > match.durationMinutes * 1.25) {
      const target = future.find((workout) => workout.date > activity.date && ["run", "bike", "brick"].includes(workout.type));
      if (target) {
        changes.push({
          workoutId: target.id,
          before: { title: target.title, durationMinutes: target.durationMinutes, intensity: target.intensity },
          after: {
            title: `Easy ${target.type}`,
            durationMinutes: Math.max(25, Math.round(target.durationMinutes * 0.7 / 5) * 5),
            intensity: "Easy · RPE 2–3",
            purpose: "Absorb a larger-than-planned recent training load.",
          },
        });
        reason = "The imported activity was substantially longer than planned, so the next demanding session is reduced.";
      }
    }
  }

  if (trigger.kind === "availability") {
    const availability = trigger.data;
    const affected = state.workouts.filter((workout) =>
      workout.date >= availability.startDate
      && workout.date <= availability.endDate
      && workout.status === "planned"
      && !workout.locked
      && workout.type !== "rest");
    for (const target of affected) {
      if (availability.minutes === 0) {
        changes.push({
          workoutId: target.id,
          before: { type: target.type, title: target.title, durationMinutes: target.durationMinutes, intensity: target.intensity },
          after: { type: "rest", title: "Travel / unavailable", durationMinutes: 0, intensity: "Rest", purpose: "Respect the unavailable period you entered." },
        });
      } else if (target.durationMinutes > availability.minutes) {
        changes.push({
          workoutId: target.id,
          before: { title: target.title, durationMinutes: target.durationMinutes },
          after: {
            title: `Short ${target.title.toLowerCase()}`,
            durationMinutes: availability.minutes,
            purpose: "Fit the training time available during this period.",
          },
        });
      }
    }
    if (changes.length) {
      reason = availability.minutes === 0
        ? "You marked these dates unavailable, so affected sessions are changed to recovery."
        : `Affected sessions are shortened to fit your ${availability.minutes}-minute daily limit.`;
    }
  }

  if (!changes.length) return null;
  return {
    id: `proposal-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: "pending",
    reason,
    changes,
  };
}

export function applyProposal(state, proposalId) {
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "pending") return state;
  const before = state.workouts.map((workout) => ({ ...workout }));
  const changes = new Map(proposal.changes.map((change) => [change.workoutId, change.after]));
  state.workouts = state.workouts.map((workout) => changes.has(workout.id) ? { ...workout, ...changes.get(workout.id) } : workout);
  proposal.status = "accepted";
  state.planHistory.push({ id: `history-${Date.now()}`, at: new Date().toISOString(), reason: proposal.reason, before });
  state.updatedAt = new Date().toISOString();
  return state;
}

export function declineProposal(state, proposalId) {
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (proposal) proposal.status = "declined";
  state.updatedAt = new Date().toISOString();
  return state;
}

export function moveWorkout(state, workoutId, newDate) {
  const workout = state.workouts.find((item) => item.id === workoutId);
  if (!workout || workout.locked) return state;
  state.planHistory.push({
    id: `history-${Date.now()}`,
    at: new Date().toISOString(),
    reason: `Moved ${workout.title} from ${workout.date} to ${newDate}.`,
    before: state.workouts.map((item) => ({ ...item })),
  });
  workout.date = newDate;
  workout.source = "manual";
  state.updatedAt = new Date().toISOString();
  return state;
}

export function toggleWorkoutLock(state, workoutId) {
  const workout = state.workouts.find((item) => item.id === workoutId);
  if (workout && workout.type !== "race") workout.locked = !workout.locked;
  state.updatedAt = new Date().toISOString();
  return state;
}

export function normaliseState(input) {
  const initial = createInitialState();
  return {
    ...initial,
    ...input,
    profile: { ...initial.profile, ...(input?.profile ?? {}) },
    settings: { ...initial.settings, ...(input?.settings ?? {}) },
    workouts: Array.isArray(input?.workouts) ? input.workouts : [],
    activities: Array.isArray(input?.activities) ? input.activities : [],
    checkIns: Array.isArray(input?.checkIns) ? input.checkIns : [],
    proposals: Array.isArray(input?.proposals) ? input.proposals : [],
    planHistory: Array.isArray(input?.planHistory) ? input.planHistory : [],
  };
}
