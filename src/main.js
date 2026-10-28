import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { createHash } from "node:crypto";
import { existsSync, promises as fs, watch as watchFs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyProposal,
  createAdjustmentProposal,
  createInitialState,
  declineProposal,
  findPlannedMatch,
  generatePlan,
  localDate,
  moveWorkout,
  normaliseState,
  toggleWorkoutLock,
} from "./engine.js";
import { decodeFitActivity } from "./fit.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let state;
let watcher;
let scanTimer;

function dataPath() {
  return path.join(app.getPath("userData"), "triplan-data.json");
}

async function loadState() {
  try {
    state = normaliseState(JSON.parse(await fs.readFile(dataPath(), "utf8")));
  } catch {
    state = createInitialState();
  }
  state.importLog ??= [];
}

async function saveState() {
  state.updatedAt = new Date().toISOString();
  const target = dataPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(state, null, 2));
  await fs.rename(temporary, target);
  mainWindow?.webContents.send("state:changed", state);
  return state;
}

function queueOrApplyProposal(proposal) {
  if (!proposal) return;
  state.proposals.push(proposal);
  if (!state.settings.reviewAdjustments) applyProposal(state, proposal.id);
}

async function decodeFit(filePath) {
  const bytes = await fs.readFile(filePath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (state.activities.some((activity) => activity.hash === hash)) return { duplicate: true };
  return { activity: decodeFitActivity(bytes, filePath, hash) };
}

async function scanActivityFolder() {
  const folder = state.settings.activityFolder;
  if (!folder || !existsSync(folder)) return { imported: 0, duplicates: 0, errors: [] };
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".fit"))
    .map((entry) => path.join(folder, entry.name));
  let imported = 0;
  let duplicates = 0;
  const errors = [];

  for (const filePath of files) {
    try {
      const result = await decodeFit(filePath);
      if (result.duplicate) {
        duplicates += 1;
        continue;
      }
      state.activities.push(result.activity);
      const match = findPlannedMatch(state.workouts, result.activity);
      if (match) match.status = "completed";
      const proposal = createAdjustmentProposal(state, { kind: "activity", data: result.activity });
      queueOrApplyProposal(proposal);
      imported += 1;
    } catch (error) {
      errors.push({ file: path.basename(filePath), message: error.message });
    }
  }

  state.activities.sort((a, b) => b.date.localeCompare(a.date));
  state.lastImportAt = new Date().toISOString();
  state.importLog.unshift({
    id: `import-${Date.now()}`,
    at: state.lastImportAt,
    imported,
    duplicates,
    errors,
  });
  state.importLog = state.importLog.slice(0, 20);
  await saveState();
  return { imported, duplicates, errors };
}

function stopWatcher() {
  watcher?.close();
  watcher = undefined;
}

function startWatcher() {
  stopWatcher();
  const folder = state.settings.activityFolder;
  if (!state.settings.watchFolder || !folder || !existsSync(folder)) return;
  try {
    watcher = watchFs(folder, { recursive: false }, (_event, fileName) => {
      if (!String(fileName ?? "").toLowerCase().endsWith(".fit")) return;
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => scanActivityFolder(), 800);
    });
  } catch (error) {
    state.importLog.unshift({
      id: `watch-${Date.now()}`,
      at: new Date().toISOString(),
      imported: 0,
      duplicates: 0,
      errors: [{ file: folder, message: `Automatic monitoring unavailable: ${error.message}` }],
    });
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    title: "TriPlan",
    backgroundColor: "#f5f7f4",
    webPreferences: {
      preload: path.join(rootDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await mainWindow.loadFile(path.join(rootDir, "index.html"));
}

function registerIpc() {
  ipcMain.handle("state:get", () => state);
  ipcMain.handle("profile:save", async (_event, profile) => {
    state.profile = { ...state.profile, ...profile };
    state.workouts = generatePlan(state.profile);
    state.onboardingComplete = true;
    state.planHistory.push({
      id: `history-${Date.now()}`,
      at: new Date().toISOString(),
      reason: "Generated initial plan.",
    });
    return saveState();
  });
  ipcMain.handle("settings:update", async (_event, settings) => {
    state.settings = { ...state.settings, ...settings };
    await saveState();
    startWatcher();
    return state;
  });
  ipcMain.handle("folder:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
    if (result.canceled) return null;
    state.settings.activityFolder = result.filePaths[0];
    await saveState();
    startWatcher();
    return state.settings.activityFolder;
  });
  ipcMain.handle("activities:scan", scanActivityFolder);
  ipcMain.handle("checkin:add", async (_event, checkIn) => {
    const entry = { id: `checkin-${Date.now()}`, date: localDate(), ...checkIn, createdAt: new Date().toISOString() };
    state.checkIns = [entry, ...state.checkIns.filter((item) => item.date !== entry.date)];
    const proposal = createAdjustmentProposal(state, { kind: "check-in", data: entry });
    if (state.settings.allowRecoveryDays) queueOrApplyProposal(proposal);
    return saveState();
  });
  ipcMain.handle("availability:add", async (_event, availability) => {
    state.availability.push({ id: `availability-${Date.now()}`, ...availability });
    state.availability.sort((a, b) => a.startDate.localeCompare(b.startDate));
    const proposal = createAdjustmentProposal(state, { kind: "availability", data: availability });
    queueOrApplyProposal(proposal);
    return saveState();
  });
  ipcMain.handle("proposal:accept", async (_event, id) => saveState(applyProposal(state, id)));
  ipcMain.handle("proposal:decline", async (_event, id) => saveState(declineProposal(state, id)));
  ipcMain.handle("workout:move", async (_event, id, date) => saveState(moveWorkout(state, id, date)));
  ipcMain.handle("workout:lock", async (_event, id) => saveState(toggleWorkoutLock(state, id)));
  ipcMain.handle("backup:export", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export TriPlan backup",
      defaultPath: `TriPlan-backup-${localDate()}.triplan`,
      filters: [{ name: "TriPlan backup", extensions: ["triplan"] }],
    });
    if (result.canceled) return false;
    await fs.writeFile(result.filePath, JSON.stringify({ format: "triplan-backup", exportedAt: new Date().toISOString(), state }, null, 2));
    return true;
  });
  ipcMain.handle("backup:import", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Restore TriPlan backup",
      properties: ["openFile"],
      filters: [{ name: "TriPlan backup", extensions: ["triplan", "json"] }],
    });
    if (result.canceled) return false;
    const backup = JSON.parse(await fs.readFile(result.filePaths[0], "utf8"));
    if (backup.format !== "triplan-backup" || !backup.state) throw new Error("This is not a valid TriPlan backup.");
    state = normaliseState(backup.state);
    await saveState();
    startWatcher();
    return true;
  });
  ipcMain.handle("path:reveal", async (_event, target) => {
    if (target && existsSync(target)) shell.showItemInFolder(target);
  });
}

app.whenReady().then(async () => {
  await loadState();
  registerIpc();
  await createWindow();
  startWatcher();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopWatcher();
  if (process.platform !== "darwin") app.quit();
});
