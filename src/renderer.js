import { addDays, localDate, startOfWeek } from "./engine.js";

let state;
let page = "today";
let calendarWeek = startOfWeek(localDate());
let toastTimer;
const pageMeta = {
  today: ["TRAINING OVERVIEW", "Today"],
  calendar: ["YOUR PLAN", "Training calendar"],
  activities: ["GARMIN DATA", "Activities"],
  progress: ["TRAINING TRENDS", "Progress"],
  profile: ["ATHLETE & GOAL", "Profile"],
  settings: ["APPLICATION", "Settings"],
};
const typeLabels = { swim: "Swim", bike: "Bike", run: "Run", strength: "Strength", brick: "Brick", rest: "Rest", race: "Race" };

const content = document.querySelector("#page-content");
const onboardingDialog = document.querySelector("#onboarding-dialog");
const checkinDialog = document.querySelector("#checkin-dialog");
const travelDialog = document.querySelector("#travel-dialog");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function formatDate(value, options = { weekday: "short", month: "short", day: "numeric" }) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${value}T12:00:00`));
}

function formatDuration(minutes) {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder ? `${remainder}m` : ""}`.trim() : `${minutes}m`;
}

function showToast(message, error = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.style.background = error ? "#8d382f" : "#173d2a";
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
}

function workoutChip(workout) {
  return `<button class="workout-chip type-${esc(workout.type)}" data-workout-id="${esc(workout.id)}" draggable="${!workout.locked}">
    <strong>${workout.locked ? "⌑ " : ""}${esc(typeLabels[workout.type] ?? workout.type)}</strong>
    ${esc(workout.title)}${workout.durationMinutes ? ` · ${workout.durationMinutes}m` : ""}
  </button>`;
}

function pendingProposal() {
  return state.proposals.find((proposal) => proposal.status === "pending");
}

function renderProposal(proposal) {
  if (!proposal) return "";
  const change = proposal.changes[0];
  return `<article class="card card-pad pending-card">
    <div class="card-heading">
      <div><p class="eyebrow">PLAN ADJUSTMENT</p><h3>TriPlan suggests a change</h3><p>${esc(proposal.reason)}</p></div>
    </div>
    <div class="proposal-change"><strong>${esc(change.before.title ?? change.before.type)}</strong> → <strong>${esc(change.after.title ?? change.after.type)}</strong></div>
    <div class="proposal-actions">
      <button class="button primary" data-action="accept-proposal" data-id="${esc(proposal.id)}">Accept change</button>
      <button class="button secondary" data-action="decline-proposal" data-id="${esc(proposal.id)}">Keep my plan</button>
    </div>
  </article>`;
}

function todayPage() {
  const today = localDate();
  const todaysWorkout = state.workouts.find((workout) => workout.date === today)
    ?? state.workouts.find((workout) => workout.date > today);
  const latestCheckIn = state.checkIns.find((item) => item.date === today);
  const weekStart = startOfWeek(today);
  const weekWorkouts = state.workouts.filter((workout) => workout.date >= weekStart && workout.date <= addDays(weekStart, 6));

  return `${renderProposal(pendingProposal())}
    <div class="grid two">
      <div>
        ${todaysWorkout ? `<article class="card hero-workout">
          <div class="hero-top">
            <p class="eyebrow">${todaysWorkout.date === today ? "TODAY'S SESSION" : `NEXT SESSION · ${esc(formatDate(todaysWorkout.date))}`}</p>
            <h2>${esc(todaysWorkout.title)}</h2>
            <p>${esc(todaysWorkout.purpose)}</p>
            <div class="workout-stats">
              <div><strong>${formatDuration(todaysWorkout.durationMinutes)}</strong><span>Duration</span></div>
              <div><strong>${esc(todaysWorkout.intensity)}</strong><span>Intensity</span></div>
              ${todaysWorkout.distanceKm ? `<div><strong>${todaysWorkout.distanceKm} km</strong><span>Estimate</span></div>` : ""}
            </div>
          </div>
          <div class="hero-body">
            <ul class="detail-list">${todaysWorkout.details.map((detail) => `<li>${esc(detail)}</li>`).join("")}</ul>
            <button class="button ghost" data-workout-id="${esc(todaysWorkout.id)}">View and reschedule →</button>
          </div>
        </article>` : `<div class="card empty"><strong>No plan yet</strong>Complete your profile to generate a plan.</div>`}
      </div>
      <div class="grid">
        <article class="card card-pad quick-checkin">
          <div class="card-heading"><div><p class="eyebrow">RECOVERY SIGNALS</p><h3>Daily check-in</h3><p>A quick check helps TriPlan adapt safely.</p></div></div>
          ${latestCheckIn ? `<div class="checkin-scores">
            <div class="score-pill"><strong>${latestCheckIn.energy}/5</strong><span>Energy</span></div>
            <div class="score-pill"><strong>${latestCheckIn.soreness}/5</strong><span>Soreness</span></div>
            <div class="score-pill"><strong>${latestCheckIn.sleep}/5</strong><span>Sleep</span></div>
          </div><button class="button secondary" data-action="open-checkin">Update check-in</button>`
          : `<button class="button primary" data-action="open-checkin">Check in now</button>`}
        </article>
        <article class="card card-pad">
          <div class="card-heading"><div><p class="eyebrow">THIS WEEK</p><h3>${weekWorkouts.filter((item) => item.type !== "rest").length} training sessions</h3></div><button class="button ghost" data-page="calendar">Open calendar</button></div>
          <div class="timeline">${Array.from({ length: 7 }, (_, index) => {
            const date = addDays(weekStart, index);
            const workout = weekWorkouts.find((item) => item.date === date);
            return `<span class="${workout?.status === "completed" ? "done" : date === today ? "current" : ""}" title="${esc(workout?.title ?? "No session")}"></span>`;
          }).join("")}</div>
        </article>
        <article class="card card-pad">
          <div class="card-heading"><div><p class="eyebrow">SCHEDULE CONFLICT?</p><h3>Travel or busy days</h3><p>Tell TriPlan when your time or equipment changes.</p></div></div>
          <button class="button secondary" data-action="open-travel">Add availability</button>
        </article>
      </div>
    </div>`;
}

function calendarPage() {
  const end = addDays(calendarWeek, 6);
  const days = Array.from({ length: 7 }, (_, index) => addDays(calendarWeek, index));
  return `<div class="calendar-toolbar">
    <div><button class="button secondary" data-action="previous-week">←</button><button class="button secondary" data-action="current-week">Today</button><button class="button secondary" data-action="next-week">→</button></div>
    <strong>${esc(formatDate(calendarWeek, { month: "long", day: "numeric" }))} – ${esc(formatDate(end, { month: "long", day: "numeric", year: "numeric" }))}</strong>
    <button class="button secondary" data-action="open-travel">Add travel dates</button>
  </div>
  <div class="week-strip">${days.map((date) => {
    const workouts = state.workouts.filter((workout) => workout.date === date);
    return `<div class="day-cell ${date === localDate() ? "today" : ""}" data-drop-date="${date}">
      <div class="day-head"><span>${esc(formatDate(date, { weekday: "short" }))}</span><strong>${new Date(`${date}T12:00:00`).getDate()}</strong></div>
      ${workouts.map(workoutChip).join("")}
    </div>`;
  }).join("")}</div>
  <div class="legend">${Object.entries({ swim: "#3275a8", bike: "#d96c35", run: "#1c6b45", strength: "#7558a6", rest: "#99a19c" }).map(([label, color]) => `<span><i style="background:${color}"></i>${esc(typeLabels[label])}</span>`).join("")}<span>Drag an unlocked session to move it</span></div>`;
}

function activitiesPage() {
  const latestImport = state.importLog?.[0];
  return `<article class="card card-pad" style="margin-bottom:20px">
    <div class="card-heading">
      <div><p class="eyebrow">ACTIVITY FOLDER</p><h3>${state.settings.activityFolder ? "Automatic monitoring enabled" : "Choose your Garmin folder"}</h3>
      <p>${state.settings.activityFolder ? esc(state.settings.activityFolder) : "TriPlan leaves your original FIT files untouched."}</p></div>
      <button class="button primary" data-action="${state.settings.activityFolder ? "scan" : "choose-folder"}">${state.settings.activityFolder ? "Scan now" : "Choose folder"}</button>
    </div>
    ${latestImport ? `<p class="muted">Last scan: ${latestImport.imported} imported, ${latestImport.duplicates} already known, ${latestImport.errors.length} errors.</p>` : ""}
  </article>
  <article class="card activity-list">
    ${state.activities.length ? state.activities.map((activity) => `<div class="activity-row">
      <div class="activity-icon">${esc(activity.type.slice(0, 2))}</div>
      <div><strong>${esc(typeLabels[activity.type] ?? activity.sport)}</strong><small>${esc(formatDate(activity.date))} · ${esc(activity.fileName)}</small></div>
      <div><strong>${formatDuration(activity.durationMinutes)}</strong><small>Duration</small></div>
      <div><strong>${activity.distanceKm || "—"}${activity.distanceKm ? " km" : ""}</strong><small>Distance</small></div>
      <div><strong>${activity.averageHeartRate || "—"}${activity.averageHeartRate ? " bpm" : ""}</strong><small>Avg HR</small></div>
    </div>`).join("") : `<div class="empty"><strong>No completed activities imported</strong>Select a folder containing Garmin activity FIT files, then scan it.</div>`}
  </article>`;
}

function progressPage() {
  const completed = state.activities;
  const totalMinutes = completed.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  const last28 = completed.filter((item) => new Date(`${item.date}T12:00:00`) >= new Date(Date.now() - 28 * 86400000));
  const plannedPast = state.workouts.filter((item) => item.date < localDate() && item.type !== "rest");
  const adherence = plannedPast.length ? Math.round(plannedPast.filter((item) => item.status === "completed").length / plannedPast.length * 100) : 0;
  const counts = Object.fromEntries(["swim", "bike", "run", "strength"].map((type) => [type, last28.filter((item) => item.type === type).reduce((sum, item) => sum + item.durationMinutes, 0)]));
  const max = Math.max(1, ...Object.values(counts));
  return `<div class="grid three" style="margin-bottom:20px">
    <article class="card stat"><div class="label">Imported activities</div><div class="value">${completed.length}</div><div class="context">All locally stored records</div></article>
    <article class="card stat"><div class="label">Training time</div><div class="value">${formatDuration(totalMinutes)}</div><div class="context">Across imported activities</div></article>
    <article class="card stat"><div class="label">Plan adherence</div><div class="value">${adherence}%</div><div class="context">Completed planned sessions</div></article>
  </div>
  <div class="grid two">
    <article class="card card-pad"><div class="card-heading"><div><p class="eyebrow">LAST 28 DAYS</p><h3>Time by discipline</h3></div></div>
      ${Object.entries(counts).map(([type, minutes]) => `<div class="discipline-row"><strong>${esc(typeLabels[type])}</strong><div class="progress-bar"><span style="width:${minutes / max * 100}%"></span></div><span>${formatDuration(minutes)}</span></div>`).join("")}
    </article>
    <article class="card card-pad"><div class="card-heading"><div><p class="eyebrow">INTERPRETATION</p><h3>Build the evidence first</h3><p>Fitness trends become useful after several weeks of consistent activity imports. TriPlan will avoid making performance claims from sparse data.</p></div></div></article>
  </div>`;
}

function profilePage() {
  const profile = state.profile;
  return `<div class="grid two">
    <article class="card card-pad">
      <div class="card-heading"><div><p class="eyebrow">ATHLETE</p><h2>${esc(profile.name || "Your profile")}</h2><p>Personal details used to shape training recommendations.</p></div><button class="button secondary" data-action="edit-profile">Edit</button></div>
      <div class="setting-row"><div class="setting-copy"><strong>Birth date</strong><span>${esc(formatDate(profile.birthDate, { month: "long", day: "numeric", year: "numeric" }))}</span></div></div>
      <div class="setting-row"><div class="setting-copy"><strong>Weekly availability</strong><span>${profile.trainingDays} training days</span></div></div>
      <div class="setting-row"><div class="setting-copy"><strong>Health notes</strong><span>${esc(profile.healthNotes || "None recorded")}</span></div></div>
    </article>
    <article class="card card-pad">
      <div class="card-heading"><div><p class="eyebrow">PRIMARY RACE</p><h2>${esc(profile.raceName)}</h2><p>${esc(formatDate(profile.raceDate, { month: "long", day: "numeric", year: "numeric" }))}</p></div></div>
      <div class="setting-row"><div class="setting-copy"><strong>Distance</strong><span>Olympic · 1.5 km swim, 40 km bike, 10 km run</span></div></div>
      <div class="setting-row"><div class="setting-copy"><strong>Target finish</strong><span>${profile.targetFinishMinutes ? formatDuration(profile.targetFinishMinutes) : "No target set"}</span></div></div>
    </article>
    <article class="card card-pad" style="grid-column:1/-1">
      <div class="card-heading"><div><p class="eyebrow">AVAILABILITY</p><h3>Travel and busy periods</h3></div><button class="button secondary" data-action="open-travel">Add period</button></div>
      ${state.availability.length ? state.availability.map((item) => `<div class="setting-row"><div class="setting-copy"><strong>${esc(formatDate(item.startDate))} – ${esc(formatDate(item.endDate))}</strong><span>${item.minutes ? `${item.minutes} minutes/day` : "Unavailable"} · ${esc(item.equipment || "No equipment specified")}</span></div></div>`).join("") : `<p class="muted">No exceptions added.</p>`}
    </article>
  </div>`;
}

function toggleSetting(key, title, description) {
  return `<div class="setting-row"><div class="setting-copy"><strong>${esc(title)}</strong><span>${esc(description)}</span></div><label class="switch"><input type="checkbox" data-setting="${esc(key)}" ${state.settings[key] ? "checked" : ""}><i></i></label></div>`;
}

function settingsPage() {
  return `<article class="card settings-section">
    <div class="card-heading"><div><p class="eyebrow">GARMIN FILES</p><h3>Activity folder</h3><p>Original files remain untouched. TriPlan stores only extracted activity details.</p></div></div>
    <div class="folder-box"><span>⌁</span><div class="folder-path">${esc(state.settings.activityFolder || "No folder selected")}</div><button class="button secondary" data-action="choose-folder">Choose</button></div>
    ${toggleSetting("watchFolder", "Monitor automatically", "Scan when a new FIT file appears in the selected folder.")}
  </article>
  <article class="card settings-section">
    <div class="card-heading"><div><p class="eyebrow">PLAN BEHAVIOR</p><h3>Adaptive scheduling</h3></div></div>
    ${toggleSetting("reviewAdjustments", "Review changes first", "Show proposed schedule changes before applying them.")}
    ${toggleSetting("allowRecoveryDays", "Allow extra recovery", "Recommend rest when check-in or training data indicates fatigue.")}
    ${toggleSetting("shorterAlternatives", "Shorter alternatives", "Show reduced-duration options when appropriate.")}
  </article>
  <article class="card settings-section">
    <div class="card-heading"><div><p class="eyebrow">PORTABILITY</p><h3>Backup and restore</h3><p>Save a complete portable copy to your Mac, iCloud Drive, Dropbox, or Google Drive.</p></div></div>
    <div style="display:flex;gap:9px"><button class="button primary" data-action="export-backup">Export backup</button><button class="button secondary" data-action="import-backup">Restore backup</button></div>
  </article>`;
}

function render() {
  const [eyebrow, title] = pageMeta[page];
  document.querySelector("#page-eyebrow").textContent = eyebrow;
  document.querySelector("#page-title").textContent = title;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
  content.innerHTML = {
    today: todayPage,
    calendar: calendarPage,
    activities: activitiesPage,
    progress: progressPage,
    profile: profilePage,
    settings: settingsPage,
  }[page]();
  bindDragAndDrop();
}

function openWorkout(id) {
  const workout = state.workouts.find((item) => item.id === id);
  if (!workout) return;
  document.querySelectorAll(".drawer-backdrop,.workout-drawer").forEach((element) => element.remove());
  document.body.insertAdjacentHTML("beforeend", `<div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="workout-drawer">
      <button class="drawer-close" data-action="close-drawer" aria-label="Close">×</button>
      <p class="eyebrow drawer-type">${esc(typeLabels[workout.type] ?? workout.type)} · ${esc(workout.phase)}</p>
      <h2>${esc(workout.title)}</h2>
      <p class="muted">${esc(formatDate(workout.date, { weekday: "long", month: "long", day: "numeric" }))} · ${formatDuration(workout.durationMinutes)}</p>
      <h3>Purpose</h3><p class="muted">${esc(workout.purpose)}</p>
      <h3>Intensity</h3><p class="muted">${esc(workout.intensity)}</p>
      <h3>Session</h3><ul class="detail-list">${workout.details.map((detail) => `<li>${esc(detail)}</li>`).join("")}</ul>
      ${state.settings.shorterAlternatives && workout.alternatives?.length ? `<h3 style="margin-top:22px">Shorter options</h3><p class="muted">${workout.alternatives.map((minutes) => `${minutes} min`).join(" · ")}</p>` : ""}
      <div class="drawer-actions"><button class="button secondary" data-action="toggle-lock" data-id="${esc(workout.id)}">${workout.locked ? "Unlock session" : "Lock session"}</button></div>
      ${!workout.locked ? `<div class="move-row"><input type="date" id="move-date" value="${esc(workout.date)}"><button class="button primary" data-action="move-workout" data-id="${esc(workout.id)}">Move</button></div>` : ""}
    </aside>`);
}

function bindDragAndDrop() {
  content.querySelectorAll("[draggable=true]").forEach((item) => item.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", item.dataset.workoutId)));
  content.querySelectorAll("[data-drop-date]").forEach((cell) => {
    cell.addEventListener("dragover", (event) => event.preventDefault());
    cell.addEventListener("drop", async (event) => {
      event.preventDefault();
      state = await window.triplan.moveWorkout(event.dataTransfer.getData("text/plain"), cell.dataset.dropDate);
      render();
      showToast("Workout moved.");
    });
  });
}

async function handleAction(action, element) {
  if (action === "open-checkin") checkinDialog.showModal();
  if (action === "open-travel") travelDialog.showModal();
  if (action === "previous-week") { calendarWeek = addDays(calendarWeek, -7); render(); }
  if (action === "next-week") { calendarWeek = addDays(calendarWeek, 7); render(); }
  if (action === "current-week") { calendarWeek = startOfWeek(localDate()); render(); }
  if (action === "close-drawer") document.querySelectorAll(".drawer-backdrop,.workout-drawer").forEach((item) => item.remove());
  if (action === "choose-folder") {
    const folder = await window.triplan.chooseActivityFolder();
    if (folder) { state = await window.triplan.getState(); render(); showToast("Activity folder selected."); }
  }
  if (action === "scan") await importActivities();
  if (action === "accept-proposal") { state = await window.triplan.acceptProposal(element.dataset.id); render(); showToast("Plan updated."); }
  if (action === "decline-proposal") { state = await window.triplan.declineProposal(element.dataset.id); render(); showToast("Your existing plan was kept."); }
  if (action === "toggle-lock") {
    state = await window.triplan.toggleWorkoutLock(element.dataset.id);
    document.querySelectorAll(".drawer-backdrop,.workout-drawer").forEach((item) => item.remove());
    render();
  }
  if (action === "move-workout") {
    const date = document.querySelector("#move-date").value;
    if (!date) return;
    state = await window.triplan.moveWorkout(element.dataset.id, date);
    document.querySelectorAll(".drawer-backdrop,.workout-drawer").forEach((item) => item.remove());
    render();
    showToast("Workout moved.");
  }
  if (action === "edit-profile") openProfileEditor();
  if (action === "export-backup") { if (await window.triplan.exportBackup()) showToast("Backup exported."); }
  if (action === "import-backup") {
    if (await window.triplan.importBackup()) { state = await window.triplan.getState(); render(); showToast("Backup restored."); }
  }
}

async function importActivities() {
  if (!state.settings.activityFolder) {
    const folder = await window.triplan.chooseActivityFolder();
    if (!folder) return;
  }
  try {
    const result = await window.triplan.scanActivities();
    state = await window.triplan.getState();
    render();
    showToast(`${result.imported} imported · ${result.duplicates} already known${result.errors.length ? ` · ${result.errors.length} could not be read` : ""}`, result.errors.length > 0 && result.imported === 0);
  } catch (error) {
    showToast(error.message, true);
  }
}

function openProfileEditor() {
  const form = document.querySelector("#onboarding-form");
  Object.entries(state.profile).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? "";
  });
  if (state.profile.targetFinishMinutes) {
    const hours = Math.floor(state.profile.targetFinishMinutes / 60);
    form.elements.targetTime.value = `${String(hours).padStart(2, "0")}:${String(state.profile.targetFinishMinutes % 60).padStart(2, "0")}`;
  }
  onboardingDialog.showModal();
}

document.addEventListener("click", async (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) { page = pageButton.dataset.page; render(); return; }
  const workoutButton = event.target.closest("[data-workout-id]");
  if (workoutButton && !event.target.closest("[data-action]")) { openWorkout(workoutButton.dataset.workoutId); return; }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    try { await handleAction(actionButton.dataset.action, actionButton); } catch (error) { showToast(error.message, true); }
  }
  if (event.target.closest("[data-close-dialog]")) event.target.closest("dialog").close();
});

document.querySelector("#import-button").addEventListener("click", importActivities);

document.querySelector("#onboarding-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const [hours = 0, minutes = 0] = String(data.get("targetTime") || "").split(":").map(Number);
  try {
    state = await window.triplan.saveProfile({
      name: data.get("name").trim(),
      birthDate: data.get("birthDate"),
      raceName: data.get("raceName").trim(),
      raceDate: data.get("raceDate"),
      targetFinishMinutes: hours ? hours * 60 + minutes : null,
      trainingDays: Number(data.get("trainingDays")),
      healthNotes: data.get("healthNotes").trim(),
    });
    onboardingDialog.close();
    render();
    showToast("Your adaptive plan is ready.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelectorAll(".score-row").forEach((row) => {
  const holder = row.querySelector("div");
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `score-button ${value === 3 ? "selected" : ""}`;
    button.dataset.value = value;
    button.textContent = value;
    button.addEventListener("click", () => {
      holder.querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
    holder.append(button);
  }
});

document.querySelector("#checkin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const score = (name) => Number(document.querySelector(`[data-score=${name}] .selected`).dataset.value);
  const data = new FormData(event.currentTarget);
  state = await window.triplan.addCheckIn({
    energy: score("energy"),
    soreness: score("soreness"),
    sleep: score("sleep"),
    availableMinutes: Number(data.get("availableMinutes")),
  });
  checkinDialog.close();
  render();
  showToast(pendingProposal() ? "Check-in saved. A plan adjustment is ready to review." : "Check-in saved.");
});

document.querySelector("#travel-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state = await window.triplan.addAvailability({
    startDate: data.get("startDate"),
    endDate: data.get("endDate"),
    minutes: Number(data.get("minutes")),
    equipment: data.get("equipment").trim(),
  });
  travelDialog.close();
  event.currentTarget.reset();
  render();
  showToast("Availability saved.");
});

content.addEventListener("change", async (event) => {
  if (!event.target.dataset.setting) return;
  state = await window.triplan.updateSettings({ [event.target.dataset.setting]: event.target.checked });
  render();
});

window.triplan.onStateChanged((nextState) => {
  state = nextState;
  render();
});

state = await window.triplan.getState();
render();
if (!state.onboardingComplete) onboardingDialog.showModal();
