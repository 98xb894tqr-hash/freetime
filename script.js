import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
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

// This is the shared room. Later you can create more rooms by changing "main".
const roomRef = doc(db, "rooms", "main");

const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const startHour = 8;
const endHour = 2; // until 02:00 next day
const intervalMinutes = 60; // change to 30 if you want half-hour slots

const scheduleEl = document.getElementById("schedule");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const clearMySlotsBtn = document.getElementById("clearMySlotsBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const statusEl = document.getElementById("status");
const bestSlotsEl = document.getElementById("bestSlots");

let currentName = localStorage.getItem("currentName") || "";
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
  for (let h = startHour; h < 24; h++) times.push(`${pad(h)}:00`);
  for (let h = 0; h <= endHour; h++) times.push(`${pad(h)}:00`);
  return times;
}

function slotId(day, time) {
  return `${day}-${time}`;
}

function saveCurrentName() {
  currentName = nameInput.value.trim();
  if (!currentName) {
    setStatus("צריך לכתוב שם לפני שמסמנים שעות.");
    return false;
  }
  localStorage.setItem("currentName", currentName);
  setStatus(`השם נשמר: ${currentName}`);
  render();
  return true;
}

async function saveAvailability(newAvailability) {
  availability = newAvailability;
  render();

  try {
    await setDoc(roomRef, {
      availability,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error(error);
    setStatus("שגיאה בשמירה. בדוק ש-Firestore נוצר ושכללי הגישה במצב Test Mode.");
  }
}

async function toggleSlot(day, time) {
  if (!isReady) {
    setStatus("עוד מתחבר למסד הנתונים...");
    return;
  }

  const typedName = nameInput.value.trim();

  if (!typedName) {
    setStatus("צריך לכתוב שם לפני שמסמנים שעות.");
    return;
  }

  currentName = typedName;
  nameInput.value = currentName;
  localStorage.setItem("currentName", currentName);

  const id = slotId(day, time);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      const data = snap.exists() ? snap.data() : {};
      const currentAvailability = data.availability || {};

      const nextAvailability = JSON.parse(JSON.stringify(currentAvailability));
      const names = [...new Set(nextAvailability[id] || [])];

      if (names.includes(currentName)) {
        const filtered = names.filter(name => name !== currentName);

        if (filtered.length > 0) {
          nextAvailability[id] = filtered;
        } else {
          delete nextAvailability[id];
        }

        setStatus(`הסרת את עצמך מ-${day} ${time}`);
      } else {
        nextAvailability[id] = [...names, currentName];
        setStatus(`סימנת שאתה פנוי ב-${day} ${time}`);
      }

      transaction.set(roomRef, {
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
  return [...new Set(Object.values(availability).flat())];
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
      if (currentName && names.includes(currentName)) cell.classList.add("mine");
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
    const [day, time] = id.split("-");
    pill.textContent = `${day} ${time} — ${count} פנויים: ${names.join(", ")}`;
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
  if (!currentName && !saveCurrentName()) return;

  const next = structuredClone(availability);
  Object.keys(next).forEach(id => {
    next[id] = next[id].filter(name => name !== currentName);
    if (next[id].length === 0) delete next[id];
  });

  await saveAvailability(next);
  setStatus(`הסימונים של ${currentName} נמחקו לכולם.`);
});

resetAllBtn.addEventListener("click", async () => {
  if (!isReady) return;
  const ok = confirm("למחוק את כל הסימונים של כולם?");
  if (!ok) return;
  await saveAvailability({});
  setStatus("כל הסימונים נמחקו לכולם.");
});

setStatus("מתחבר ל-Firebase...");
render();

onSnapshot(roomRef, async (snapshot) => {
  isReady = true;

  if (!snapshot.exists()) {
    await setDoc(roomRef, {
      availability: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setStatus("מחובר. אפשר להתחיל לסמן.");
    return;
  }

  availability = snapshot.data().availability || {};
  setStatus("מחובר. הסימונים נשמרים בזמן אמת.");
  render();
}, (error) => {
  console.error(error);
  setStatus("לא הצלחתי להתחבר ל-Firestore. ודא שיצרת Firestore Database במצב Test Mode.");
});
