const STORAGE_KEY = "lift-log-v2";
const MIN_TRAINING_DAYS = 1;
const MAX_TRAINING_DAYS = 31;

const defaultState = {
  activeDay: 0,
  plan: [
    {
      name: "Tag 1",
      focus: "",
      exercises: []
    }
  ],
  sessions: [],
  drafts: {}
};

let state = loadState();
let draft = buildDraft();
let draftHasChanges = false;

const els = {
  title: document.querySelector("#screenTitle"),
  dayStrips: document.querySelectorAll(".day-strip"),
  activeDayName: document.querySelector("#activeDayName"),
  workoutList: document.querySelector("#workoutList"),
  resetWorkout: document.querySelector("#resetWorkout"),
  finishWorkout: document.querySelector("#finishWorkout"),
  planDayName: document.querySelector("#planDayName"),
  dayCountInput: document.querySelector("#dayCountInput"),
  dayDetails: document.querySelector("#dayDetails"),
  dayNameInput: document.querySelector("#dayNameInput"),
  dayFocusInput: document.querySelector("#dayFocusInput"),
  planEditor: document.querySelector("#planEditor"),
  addExercise: document.querySelector("#addExercise"),
  chartExercise: document.querySelector("#chartExercise"),
  chart: document.querySelector("#strengthChart"),
  statGrid: document.querySelector("#statGrid"),
  recommendations: document.querySelector("#recommendations"),
  historyList: document.querySelector("#historyList"),
  exportButton: document.querySelector("#exportButton"),
  toastDialog: document.querySelector("#toastDialog"),
  toastText: document.querySelector("#toastText")
};

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
});

els.resetWorkout.addEventListener("click", resetWorkoutChecks);
els.finishWorkout.addEventListener("click", saveWorkout);
els.addExercise.addEventListener("click", addExercise);
els.chartExercise.addEventListener("change", drawProgress);
els.exportButton.addEventListener("click", exportData);
els.dayCountInput.addEventListener("change", (event) => updateDayCount(event.target.value));
els.dayNameInput.addEventListener("input", (event) => updateDayName(event.target.value));
els.dayFocusInput.addEventListener("input", (event) => updateDayFocus(event.target.value));

render();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const loaded = stored ? JSON.parse(stored) : clone(defaultState);
    return normalizeState(loaded);
  } catch {
    return clone(defaultState);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeState(value) {
  const plan = Array.isArray(value.plan) && value.plan.length ? value.plan : clone(defaultState.plan);
  const activeDay = Number.isInteger(value.activeDay) ? value.activeDay : 0;

  return {
    activeDay: Math.min(Math.max(activeDay, 0), plan.length - 1),
    plan,
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    drafts: value.drafts && typeof value.drafts === "object" ? value.drafts : {}
  };
}

function currentDay() {
  return state.plan[state.activeDay];
}

function createTrainingDay(index) {
  return {
    name: `Tag ${index + 1}`,
    focus: "",
    exercises: []
  };
}

function buildDraft() {
  const savedDraft = Array.isArray(state.drafts?.[state.activeDay]) ? state.drafts[state.activeDay] : [];

  return currentDay().exercises.map((exercise) => ({
    exerciseId: exercise.id,
    name: exercise.name,
    targetReps: Number(exercise.reps) || 0,
    sets: Array.from({ length: Number(exercise.sets) || 1 }, (_, index) => {
      const savedExercise = savedDraft.find((item) => item.exerciseId === exercise.id);
      const savedSet = savedExercise?.sets?.[index];

      return {
        reps: Number(savedSet?.reps ?? exercise.reps) || 0,
        weight: Number(savedSet?.weight ?? exercise.weight) || 0,
        done: Boolean(savedSet?.done)
      };
    })
  }));
}

function buildEmptyDraftFromPlan() {
  return currentDay().exercises.map((exercise) => ({
    exerciseId: exercise.id,
    name: exercise.name,
    targetReps: Number(exercise.reps) || 0,
    sets: Array.from({ length: Number(exercise.sets) || 1 }, () => ({
      reps: Number(exercise.reps) || 0,
      weight: Number(exercise.weight) || 0,
      done: false
    }))
  }));
}

function computeDraftHasChanges() {
  const day = currentDay();

  return draft.some((draftExercise) => {
    const plannedExercise = day.exercises.find((exercise) => exercise.id === draftExercise.exerciseId);
    if (!plannedExercise) return draftExercise.sets.length > 0;

    const plannedSets = Number(plannedExercise.sets) || 1;
    if (draftExercise.sets.length > plannedSets) return true;

    return draftExercise.sets.some((set) =>
      Boolean(set.done) ||
      Number(set.reps) !== (Number(plannedExercise.reps) || 0) ||
      Number(set.weight) !== (Number(plannedExercise.weight) || 0)
    );
  });
}

function updateDraftStatus() {
  draftHasChanges = computeDraftHasChanges();
  els.finishWorkout.classList.toggle("idle", !draftHasChanges);
}

function persistDraft() {
  state.drafts[state.activeDay] = clone(draft);
  persist();
  updateDraftStatus();
}

function clearDraftChecks() {
  draft.forEach((exercise) => {
    exercise.sets.forEach((set) => {
      set.done = false;
    });
  });
  persistDraft();
}

function showScreen(screen) {
  document.querySelectorAll(".screen").forEach((section) => section.classList.remove("active"));
  document.querySelector(`#screen-${screen}`).classList.add("active");
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.screen === screen));
  els.title.textContent = screen === "workout" ? "Training" : screen === "plan" ? "Plan" : screen === "progress" ? "Kraftwerte" : "Verlauf";
  if (screen === "plan") renderPlan();
  if (screen === "progress") drawProgress();
}

function render() {
  renderDays();
  renderWorkout();
  renderPlan();
  renderProgressOptions();
  drawProgress();
  renderRecommendations();
  renderHistory();
}

function renderDays() {
  els.dayStrips.forEach((strip) => {
    strip.innerHTML = "";
    state.plan.forEach((day, index) => {
      const button = document.createElement("button");
      button.className = `day-pill${index === state.activeDay ? " active" : ""}`;
      button.type = "button";
      button.textContent = day.name;
      button.setAttribute("aria-label", `${day.name} ${day.focus}`);
      button.addEventListener("click", () => {
        state.activeDay = index;
        draft = buildDraft();
        persist();
        render();
      });
      strip.append(button);
    });
  });
}

function renderWorkout() {
  const day = currentDay();
  els.activeDayName.textContent = `${day.name} · ${day.focus}`;
  els.workoutList.innerHTML = "";

  if (!draft.length) {
    els.workoutList.append(empty("Keine Übungen in diesem Trainingstag."));
    updateDraftStatus();
    return;
  }

  draft.forEach((exercise, exerciseIndex) => {
    const card = document.createElement("article");
    card.className = "exercise-card";
    card.innerHTML = `
      <div class="exercise-top">
        <div>
          <h3>${escapeHtml(exercise.name)}</h3>
          <p class="exercise-meta">${exercise.sets.length} Sätze · Ziel ${exercise.targetReps} Wdh</p>
        </div>
      </div>
      <div class="set-grid"></div>
      <div class="card-actions">
        <button class="ghost-button" type="button" data-action="set">+ Satz</button>
      </div>
    `;

    const setGrid = card.querySelector(".set-grid");
    exercise.sets.forEach((set, setIndex) => {
      const row = document.createElement("div");
      row.className = "set-row";
      row.innerHTML = `
        <span class="set-index">${setIndex + 1}</span>
        <input inputmode="decimal" aria-label="Gewicht ${exercise.name} Satz ${setIndex + 1}" value="${set.weight}" data-field="weight">
        <input inputmode="numeric" aria-label="Wiederholungen ${exercise.name} Satz ${setIndex + 1}" value="${set.reps}" data-field="reps">
        <button class="hit-toggle${set.done ? " done" : ""}" type="button" aria-label="Satz erledigt">${set.done ? "✓" : "○"}</button>
      `;

      row.querySelector('[data-field="weight"]').addEventListener("input", (event) => {
        draft[exerciseIndex].sets[setIndex].weight = numberValue(event.target.value);
        persistDraft();
      });
      row.querySelector('[data-field="reps"]').addEventListener("input", (event) => {
        draft[exerciseIndex].sets[setIndex].reps = numberValue(event.target.value);
        persistDraft();
      });
      row.querySelector(".hit-toggle").addEventListener("click", () => {
        draft[exerciseIndex].sets[setIndex].done = !draft[exerciseIndex].sets[setIndex].done;
        persistDraft();
        renderWorkout();
      });
      setGrid.append(row);
    });

    card.querySelector('[data-action="set"]').addEventListener("click", () => {
      const last = exercise.sets[exercise.sets.length - 1] || { reps: exercise.targetReps, weight: 0 };
      draft[exerciseIndex].sets.push({ reps: last.reps, weight: last.weight, done: false });
      persistDraft();
      renderWorkout();
    });
    els.workoutList.append(card);
  });

  updateDraftStatus();
}

function renderPlan() {
  updateDraftStatus();
  const day = currentDay();
  els.planDayName.textContent = `${day.name} · ${day.focus}`;
  els.dayCountInput.value = state.plan.length;
  els.dayCountInput.disabled = draftHasChanges;
  els.addExercise.disabled = draftHasChanges;
  els.dayNameInput.value = day.name;
  els.dayFocusInput.value = day.focus;
  els.dayDetails.hidden = draftHasChanges;
  els.planEditor.innerHTML = "";

  if (draftHasChanges) {
    els.planEditor.append(empty("Speichere dein Training oder setze es zurück, um den Plan zu bearbeiten."));
    return;
  }

  day.exercises.forEach((exercise, index) => {
    const row = document.createElement("div");
    row.className = "plan-row";
    row.innerHTML = `
      <input aria-label="Übungsname" value="${escapeAttr(exercise.name)}">
      <input inputmode="numeric" aria-label="Sätze" value="${exercise.sets}">
      <input inputmode="numeric" aria-label="Wiederholungen" value="${exercise.reps}">
      <input inputmode="decimal" aria-label="Gewicht" value="${exercise.weight}">
      <button class="danger-button" type="button" aria-label="Übung löschen">×</button>
    `;

    const inputs = row.querySelectorAll("input");
    inputs[0].addEventListener("input", (event) => updateExercise(index, "name", event.target.value));
    inputs[1].addEventListener("input", (event) => updateExercise(index, "sets", numberValue(event.target.value, 1)));
    inputs[2].addEventListener("input", (event) => updateExercise(index, "reps", numberValue(event.target.value, 1)));
    inputs[3].addEventListener("input", (event) => updateExercise(index, "weight", numberValue(event.target.value)));
    row.querySelector("button").addEventListener("click", () => removeExercise(index));
    els.planEditor.append(row);
  });

  if (!day.exercises.length) els.planEditor.append(empty("Füge deine erste Übung hinzu."));
}

function updateExercise(index, field, value) {
  currentDay().exercises[index][field] = value;
  draft = buildDraft();
  persistDraft();
  renderProgressOptions();
  renderWorkout();
}

function updateDayName(value) {
  currentDay().name = value || "Tag";
  persist();
  render();
}

function updateDayFocus(value) {
  currentDay().focus = value || "";
  persist();
  render();
}

function updateDayCount(value) {
  const nextCount = Math.min(MAX_TRAINING_DAYS, Math.max(MIN_TRAINING_DAYS, Math.round(numberValue(value, state.plan.length))));
  const currentCount = state.plan.length;

  if (nextCount === currentCount) {
    els.dayCountInput.value = currentCount;
    return;
  }

  if (nextCount > currentCount) {
    for (let index = currentCount; index < nextCount; index += 1) {
      state.plan.push(createTrainingDay(index));
    }
  } else {
    state.plan = state.plan.slice(0, nextCount);
    state.activeDay = Math.min(state.activeDay, nextCount - 1);
    Object.keys(state.drafts).forEach((key) => {
      if (Number(key) >= nextCount) delete state.drafts[key];
    });
  }

  draft = buildDraft();
  persist();
  render();
}

function addExercise() {
  currentDay().exercises.push({ id: uid(), name: "Neue Übung", sets: 3, reps: 8, weight: 0 });
  draft = buildDraft();
  persistDraft();
  render();
}

function removeExercise(index) {
  currentDay().exercises.splice(index, 1);
  draft = buildDraft();
  persistDraft();
  render();
}

function resetWorkoutChecks() {
  draft = buildEmptyDraftFromPlan();
  persistDraft();
  renderWorkout();
}

function saveWorkout() {
  const completed = draft.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.done).map((set) => ({
      reps: Number(set.reps) || 0,
      weight: Number(set.weight) || 0
    }))
  })).filter((exercise) => exercise.sets.length);

  if (!completed.length) {
    toast("Markiere mindestens einen Satz.");
    return;
  }

  state.sessions.unshift({
    id: uid(),
    dayIndex: state.activeDay,
    dayName: currentDay().name,
    focus: currentDay().focus,
    date: new Date().toISOString(),
    exercises: completed
  });

  completed.forEach((logged) => {
    const planned = currentDay().exercises.find((exercise) => exercise.id === logged.exerciseId);
    if (planned && logged.sets.length) {
      planned.weight = logged.sets[logged.sets.length - 1].weight;
    }
  });

  persist();
  draft = buildDraft();
  clearDraftChecks();
  render();
  toast("Training gespeichert.");
}

function renderProgressOptions() {
  const names = [...new Set(state.plan.flatMap((day) => day.exercises.map((exercise) => exercise.name)).filter(Boolean))];
  const selected = els.chartExercise.value || names[0] || "";
  els.chartExercise.innerHTML = names.map((name) => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join("");
  els.chartExercise.value = names.includes(selected) ? selected : names[0] || "";
}

function drawProgress() {
  const name = els.chartExercise.value;
  const points = getExerciseHistory(name).reverse();
  const ctx = els.chart.getContext("2d");
  const width = els.chart.width;
  const height = els.chart.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#15191d";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#363c43";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i += 1) {
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(34, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
  }

  if (!points.length) {
    ctx.fillStyle = "#aab0b7";
    ctx.font = "700 26px system-ui";
    ctx.fillText("Noch keine Daten", 38, height / 2);
    els.statGrid.innerHTML = statHtml("Bestes Set", "–") + statHtml("1RM", "–") + statHtml("Trend", "–");
    return;
  }

  const values = points.map((point) => point.bestWeight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const left = 42;
  const right = width - 24;
  const top = 26;
  const bottom = height - 44;

  ctx.strokeStyle = "#60bfb2";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = points.length === 1 ? (left + right) / 2 : left + ((right - left) * index) / (points.length - 1);
    const y = bottom - ((point.bestWeight - min) / range) * (bottom - top);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.forEach((point, index) => {
    const x = points.length === 1 ? (left + right) / 2 : left + ((right - left) * index) / (points.length - 1);
    const y = bottom - ((point.bestWeight - min) / range) * (bottom - top);
    ctx.fillStyle = "#e0c069";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#aab0b7";
  ctx.font = "700 18px system-ui";
  ctx.fillText(`${max} kg`, 42, 22);
  ctx.fillText(`${min} kg`, 42, height - 16);

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const trend = previous ? signed(latest.bestWeight - previous.bestWeight) : "neu";
  els.statGrid.innerHTML =
    statHtml("Bestes Set", `${latest.bestWeight} kg × ${latest.bestReps}`) +
    statHtml("1RM", `${estimateOneRepMax(latest.bestWeight, latest.bestReps)} kg`) +
    statHtml("Trend", trend);
}

function getExerciseHistory(name) {
  return state.sessions.flatMap((session) =>
    session.exercises
      .filter((exercise) => exercise.name === name)
      .map((exercise) => {
        const best = exercise.sets.reduce((winner, set) => {
          const score = Number(set.weight) * (1 + Number(set.reps) / 30);
          const winnerScore = Number(winner.weight) * (1 + Number(winner.reps) / 30);
          return score > winnerScore ? set : winner;
        }, exercise.sets[0]);
        return {
          date: session.date,
          bestWeight: Number(best.weight) || 0,
          bestReps: Number(best.reps) || 0
        };
      })
  );
}

function renderRecommendations() {
  const recs = state.plan.flatMap((day) => day.exercises.map((exercise) => recommendationFor(day, exercise)));
  const active = recs.filter(Boolean).slice(0, 8);
  els.recommendations.innerHTML = "";
  if (!active.length) {
    els.recommendations.append(empty("Nach zwei gespeicherten Einheiten pro Übung erscheinen hier Vorschläge."));
    return;
  }
  active.forEach((rec) => {
    const item = document.createElement("div");
    item.className = `recommendation ${rec.type}`;
    item.innerHTML = `<strong>${rec.title}</strong><p class="small-note">${rec.text}</p>`;
    els.recommendations.append(item);
  });
}

function recommendationFor(day, exercise) {
  const sessions = state.sessions
    .filter((session) => session.exercises.some((logged) => logged.exerciseId === exercise.id || logged.name === exercise.name))
    .slice(0, 2);
  if (sessions.length < 2) return null;

  const logged = sessions.map((session) => session.exercises.find((item) => item.exerciseId === exercise.id || item.name === exercise.name));
  const targetSets = Number(exercise.sets) || 1;
  const targetReps = Number(exercise.reps) || 1;
  const completed = logged.every((item) => item.sets.length >= targetSets && item.sets.every((set) => Number(set.reps) >= targetReps));
  const currentWeight = Number(exercise.weight) || 0;
  const increment = isLargeLift(exercise.name) ? 5 : 2.5;

  if (completed) {
    return {
      type: "raise",
      title: `${exercise.name}: +${increment} kg`,
      text: `${day.name}: Zwei Einheiten mit allen Zielwiederholungen. Nächstes Ziel ${currentWeight + increment} kg.`
    };
  }

  const bestRecent = Math.max(...logged.flatMap((item) => item.sets.map((set) => Number(set.reps) || 0)));
  return {
    type: "hold",
    title: `${exercise.name}: Gewicht halten`,
    text: `${day.name}: Erst steigern, wenn alle ${targetSets} Sätze mit ${targetReps} Wiederholungen sitzen. Bester letzter Satz: ${bestRecent} Wdh.`
  };
}

function isLargeLift(name) {
  return /kniebeuge|kreuzheben|beinpresse|deadlift|squat/i.test(name);
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (!state.sessions.length) {
    els.historyList.append(empty("Noch kein Training gespeichert."));
    return;
  }

  state.sessions.slice(0, 20).forEach((session) => {
    const item = document.createElement("article");
    item.className = "history-item";
    item.innerHTML = `
      <div class="history-day">
        <h3>${escapeHtml(session.dayName)} · ${escapeHtml(session.focus)}</h3>
        <span class="history-meta">${formatDate(session.date)}</span>
      </div>
      <ul class="history-exercises">
        ${session.exercises.map((exercise) => `<li>${escapeHtml(exercise.name)}: ${formatSets(exercise.sets)}</li>`).join("")}
      </ul>
    `;
    els.historyList.append(item);
  });
}

function exportData() {
  const data = JSON.stringify(state, null, 2);
  const download = () => {
    try {
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lift-log-export.json";
      link.click();
      URL.revokeObjectURL(url);
      toast("Daten als JSON heruntergeladen.");
    } catch {
      toast("Export fehlgeschlagen.");
    }
  };

  if (!navigator.clipboard?.writeText) {
    download();
    return;
  }

  navigator.clipboard.writeText(data).then(
    () => toast("Daten als JSON kopiert."),
    download
  );
}

function formatSets(sets) {
  return sets.map((set) => `${set.weight} kg × ${set.reps}`).join(", ");
}

function estimateOneRepMax(weight, reps) {
  return Math.round((Number(weight) * (1 + Number(reps) / 30)) * 10) / 10;
}

function signed(value) {
  if (value > 0) return `+${value} kg`;
  if (value < 0) return `${value} kg`;
  return "gleich";
}

function statHtml(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function empty(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
}

function toast(message) {
  els.toastText.textContent = message;
  els.toastDialog.show();
  window.setTimeout(() => els.toastDialog.close(), 1500);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
