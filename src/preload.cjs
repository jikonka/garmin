const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("triplan", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveProfile: (profile) => ipcRenderer.invoke("profile:save", profile),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  chooseActivityFolder: () => ipcRenderer.invoke("folder:choose"),
  scanActivities: () => ipcRenderer.invoke("activities:scan"),
  addCheckIn: (checkIn) => ipcRenderer.invoke("checkin:add", checkIn),
  addAvailability: (availability) => ipcRenderer.invoke("availability:add", availability),
  acceptProposal: (id) => ipcRenderer.invoke("proposal:accept", id),
  declineProposal: (id) => ipcRenderer.invoke("proposal:decline", id),
  moveWorkout: (id, date) => ipcRenderer.invoke("workout:move", id, date),
  toggleWorkoutLock: (id) => ipcRenderer.invoke("workout:lock", id),
  exportBackup: () => ipcRenderer.invoke("backup:export"),
  importBackup: () => ipcRenderer.invoke("backup:import"),
  revealPath: (target) => ipcRenderer.invoke("path:reveal", target),
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
});
