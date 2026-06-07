import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAhupiHu2HPUA7qAQ5lHjRSWydS6MYkYiA",
  authDomain: "freetime-a4956.firebaseapp.com",
  projectId: "freetime-a4956",
  storageBucket: "freetime-a4956.firebasestorage.app",
  messagingSenderId: "516434213108",
  appId: "1:516434213108:web:6a73a96cdc0926842e06a1",
  measurementId: "G-XDL57MHMR7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const roomRef = doc(db, "rooms", "main");

const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const startHour = 8;
const endHour = 2;
const intervalMinutes = 60;

const scheduleEl = document.getElementById("schedule");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const clearMySlotsBtn = document.getElementById("clearMySlotsBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const statusEl = document.getElementById("status");
const bestSlotsEl = document.getElementById("bestSlots");

let currentName = localStorage.getItem("currentName") || "";
let users = {};
let availability = {};
let isReady = false;
nameInput.value = currentName;

function setStatus(text) {
  statusEl.textContent = text;
}

function pad(num) {
  return String(num).padStart(2, "0");
}

function buildTimes() {
  const times = [];
  for (let h = startHour; h < 24; h++) {
    times.push(`${pad(h)}:00`);
    if (intervalMinutes === 30) times.push(`${pad(h)}:30`);
  }
  for (let h = 0; h <= endHour; h++) {
    times.push(`${pad(h)}:00`);
    if (intervalMinutes === 30 && h < endHour) times.push(`${pad(h)}:30`);
  }
  return times;
}

function slotId(day, time) {
  return `${day}-${time}`;
}

function slotLabel(id) {
  const firstDash = id.indexOf("-");
  if (firstDash === -1) return id;
  return `${id.slice(0, firstDash)} ${id.slice(firstDash + 1)}`;
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function saveCurrentName() {
  currentName = normalizeName(nameInput.value);
  nameInput.value = currentName;

  if (!currentName) {
    setStatus("צריך לכתוב שם לפני שמסמנים שעות.");
    return false;
  }

  localStorage.setItem("currentName", currentName);
  setStatus(`השם נשמר: ${currentName}`);
  render();
  return true;
}

function buildAvailabilityFromUsers(usersData) {
  const result = {};

  Object.values(usersData || {}).forEach(user => {
    const name = normalizeName(user?.name || "");
    const slots = Array.isArray(user?.slots) ? user.slots : [];

    if (!name) return;

    slots.forEach(id => {
      if (!result[id]) result[id] = [];
      if (!result[id].includes(name)) result[id].push(name);
    });
  });

  return result;
}

function userKey(name) {
  return encodeURIComponent(normalizeName(name));
}

async function saveUsers(nextUsers) {
  users = nextUsers;
  availability = buildAvailabilityFromUsers(users);
  render();

  try {
    await setDoc(roomRef, {
      users,
      availability,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error(error);
    setStatus("שגיאה בשמירה. בדוק ש-Firestore במצב Test Mode.");
  }
}

async function toggleSlot(day, time) {
  if (!isReady) {
    setStatus("עוד מתחבר למסד הנתונים...");
    return;
  }

  if (!saveCurrentName()) return;

  const id = slotId(day, time);
  const key = userKey(currentName);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      const data = snap.exists() ? snap.data() : {};
      const currentUsers = data.users || {};

      const currentUser = currentUsers[key] || { name: currentName, slots: [] };
      const currentSlots = Array.isArray(currentUser.slots) ? currentUser.slots : [];
      const slotsSet = new Set(currentSlots);

      if (slotsSet.has(id)) {
        slotsSet.delete(id);
        setStatus(`הסרת את עצמך מ-${day} ${time}`);
      } else {
        slotsSet.add(id);
        setStatus(`סימנת שאתה פנוי ב-${day} ${time}`);
      }

      const nextUsers = {
        ...currentUsers,
        [key]: {
          name: currentName,
          slots: Array.from(slotsSet).sort()
        }
      };

      const nextAvailability = buildAvailabilityFromUsers(nextUsers);

      transaction.set(roomRef, {
        users: nextUsers,
        availability: nextAvailability,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
  } catch (error) {
    console.error(error);
    setStatus("שגיאה בעדכון השעה.");
  }
}

function getAllNames() {
  return [...new Set(Object.values(users || {}).map(user => user?.name).filter(Boolean))];
}

function colorForCount(count, totalPeople) {
  if (count === 0) return "#f9fafb";
  const ratio = totalPeople ? count / totalPeople : 0;
  const lightness = 94 - Math.round(ratio * 42);
  return `hsl(134, 45%, ${lightness}%)`;
}

function renderSchedule() {
  const times = buildTimes();
  const people = getAllNames();
  const totalPeople = Math.max(people.length, 1);
  const activeName = normalizeName(nameInput.value || currentName);

  scheduleEl.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "cell header-cell corner";
  corner.textContent = "שעה";
  scheduleEl.appendChild(corner);

  days.forEach(day => {
    const cell = document.createElement("div");
    cell.className = "cell header-cell";
    cell.textContent = day;
    scheduleEl.appendChild(cell);
  });

  times.forEach(time => {
    const timeCell = document.createElement("div");
    timeCell.className = "cell time-cell";
    timeCell.textContent = time;
    scheduleEl.appendChild(timeCell);

    days.forEach(day => {
      const id = slotId(day, time);
      const names = availability[id] || [];
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell slot";

      if (activeName && names.includes(activeName)) cell.classList.add("mine");

      cell.style.background = colorForCount(names.length, totalPeople);
      cell.title = names.length ? names.join(", ") : "אין סימונים";
      cell.innerHTML = `
        <span class="count">${names.length ? `${names.length}/${people.length}` : ""}</span>
        <span class="names">${names.join(", ")}</span>
      `;
      cell.addEventListener("click", () => toggleSlot(day, time));
      scheduleEl.appendChild(cell);
    });
  });
}

function renderBestSlots() {
  const entries = Object.entries(availability)
    .map(([id, names]) => ({ id, names, count: names.length }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  bestSlotsEl.innerHTML = "";

  if (entries.length === 0) {
    bestSlotsEl.textContent = "עוד אין סימונים.";
    return;
  }

  entries.forEach(({ id, names, count }) => {
    const pill = document.createElement("div");
    pill.className = "best-pill";
    pill.textContent = `${slotLabel(id)} — ${count} פנויים: ${names.join(", ")}`;
    bestSlotsEl.appendChild(pill);
  });
}

function render() {
  renderSchedule();
  renderBestSlots();
}

saveNameBtn.addEventListener("click", saveCurrentName);
nameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") saveCurrentName();
});

clearMySlotsBtn.addEventListener("click", async () => {
  if (!isReady) return;
  if (!saveCurrentName()) return;

  const nextUsers = JSON.parse(JSON.stringify(users || {}));
  const key = userKey(currentName);

  if (nextUsers[key]) {
    nextUsers[key].slots = [];
  } else {
    nextUsers[key] = { name: currentName, slots: [] };
  }

  await saveUsers(nextUsers);
  setStatus(`הסימונים של ${currentName} נמחקו לכולם.`);
});

resetAllBtn.addEventListener("click", async () => {
  if (!isReady) return;
  const ok = confirm("למחוק את כל הסימונים של כולם?");
  if (!ok) return;

  await setDoc(roomRef, {
    users: {},
    availability: {},
    updatedAt: serverTimestamp()
  }, { merge: true });

  setStatus("כל הסימונים נמחקו לכולם.");
});

setStatus("מתחבר ל-Firebase...");
render();

onSnapshot(roomRef, async (snapshot) => {
  isReady = true;

  if (!snapshot.exists()) {
    await setDoc(roomRef, {
      users: {},
      availability: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    users = {};
    availability = {};
    setStatus("מחובר. אפשר להתחיל לסמן.");
    render();
    return;
  }

  const data = snapshot.data() || {};
  users = data.users || {};

  // Backward compatibility: if old data exists, still show it.
  availability = Object.keys(users).length
    ? buildAvailabilityFromUsers(users)
    : (data.availability || {});

  setStatus("מחובר. הסימונים נשמרים בזמן אמת.");
  render();
}, (error) => {
  console.error(error);
  setStatus("לא הצלחתי להתחבר ל-Firestore. ודא שיצרת Firestore Database במצב Test Mode.");
});
