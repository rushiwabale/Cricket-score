const setupForm = document.querySelector("#setupForm");
const scorer = document.querySelector("#scorer");
const resetMatch = document.querySelector("#resetMatch");
const undoButton = document.querySelector("#undoButton");
const inningsButton = document.querySelector("#inningsButton");
const newInningsButton = document.querySelector("#newInningsButton");

const view = {
  matchTitle: document.querySelector("#matchTitle"),
  saveStatus: document.querySelector("#saveStatus"),
  inningsLabel: document.querySelector("#inningsLabel"),
  battingTeam: document.querySelector("#battingTeam"),
  targetLine: document.querySelector("#targetLine"),
  runs: document.querySelector("#runs"),
  wickets: document.querySelector("#wickets"),
  overs: document.querySelector("#overs"),
  runRate: document.querySelector("#runRate"),
  balls: document.querySelector("#balls"),
  boundaries: document.querySelector("#boundaries"),
  extras: document.querySelector("#extras"),
  lastBall: document.querySelector("#lastBall"),
  overHint: document.querySelector("#overHint"),
  ballLog: document.querySelector("#ballLog"),
};

const blankInnings = () => ({
  runs: 0,
  wickets: 0,
  balls: 0,
  extras: 0,
  fours: 0,
  sixes: 0,
  log: [],
  history: [],
  closed: false,
});

let match = {
  id: "",
  teams: ["", ""],
  maxOvers: 5,
  inningsIndex: 0,
  innings: [blankInnings(), blankInnings()],
  winner: "",
};

const savedMatchId = new URLSearchParams(window.location.search).get("match") || localStorage.getItem("currentMatchId");
const localMatch = readLocalMatch();

if (savedMatchId && localMatch?.id === savedMatchId) {
  showMatch(localMatch);
  view.saveStatus.textContent = "Loaded locally. Syncing...";
  loadMatch(savedMatchId);
} else if (savedMatchId) {
  loadMatch(savedMatchId);
} else if (localMatch?.teams?.[0] && localMatch?.teams?.[1]) {
  showMatch(localMatch);
  view.saveStatus.textContent = "Loaded locally";
} else {
  view.saveStatus.textContent = "Ready";
}

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(setupForm);
  const teamA = String(data.get("teamA")).trim();
  const teamB = String(data.get("teamB")).trim();
  const overs = Number(data.get("maxOvers"));

  if (!teamA || !teamB || !Number.isFinite(overs) || overs < 1) return;

  match = {
    id: "",
    teams: [teamA, teamB],
    maxOvers: Math.min(50, Math.max(1, Math.floor(overs))),
    inningsIndex: 0,
    innings: [blankInnings(), blankInnings()],
    winner: "",
  };

  setupForm.hidden = true;
  scorer.hidden = false;
  render();
  await saveMatch({ create: true });
});

resetMatch.addEventListener("click", () => {
  localStorage.removeItem("currentMatchId");
  localStorage.removeItem("currentMatchDraft");
  window.history.replaceState({}, "", window.location.pathname);
  match = {
    id: "",
    teams: ["", ""],
    maxOvers: 5,
    inningsIndex: 0,
    innings: [blankInnings(), blankInnings()],
    winner: "",
  };
  setupForm.hidden = false;
  scorer.hidden = true;
  setupForm.reset();
  view.matchTitle.textContent = "Set up match";
  view.saveStatus.textContent = "Ready";
});

document.querySelectorAll("[data-action='run']").forEach((button) => {
  button.addEventListener("click", () => {
    scoreBall({
      runs: Number(button.dataset.runs),
      legal: true,
      label: button.dataset.runs,
      type: "run",
    });
  });
});

document.querySelectorAll("[data-action='extra']").forEach((button) => {
  button.addEventListener("click", () => {
    const kind = button.dataset.kind;
    const legal = kind === "bye" || kind === "legbye";
    scoreBall({
      runs: 1,
      legal,
      label: kind === "wide" ? "Wd" : kind === "noball" ? "Nb" : kind === "bye" ? "B" : "Lb",
      type: kind,
      extra: true,
    });
  });
});

document.querySelector("[data-action='wicket']").addEventListener("click", () => {
  const innings = currentInnings();
  if (innings.wickets >= 10) return;
  scoreBall({
    runs: 0,
    legal: true,
    wicket: true,
    label: "W",
    type: "wicket",
  });
});

undoButton.addEventListener("click", () => {
  const innings = currentInnings();
  const previous = innings.history.pop();
  if (!previous) return;
  Object.assign(innings, previous);
  render();
  saveMatch();
});

inningsButton.addEventListener("click", () => {
  closeCurrentInnings();
});

newInningsButton.addEventListener("click", () => {
  if (match.inningsIndex === 0) {
    match.inningsIndex = 1;
    render();
    saveMatch();
  }
});

function currentInnings() {
  return match.innings[match.inningsIndex];
}

function scoreBall(ball) {
  const innings = currentInnings();
  if (innings.closed || match.winner) return;

  innings.history.push(structuredClone(innings));
  innings.runs += ball.runs;
  innings.balls += ball.legal ? 1 : 0;
  innings.extras += ball.extra ? ball.runs : 0;
  innings.wickets += ball.wicket ? 1 : 0;
  innings.fours += ball.type === "run" && ball.runs === 4 ? 1 : 0;
  innings.sixes += ball.type === "run" && ball.runs === 6 ? 1 : 0;
  innings.log.push({
    ...ball,
    over: formatOvers(innings.balls),
    legalBalls: innings.balls,
  });

  if (match.inningsIndex === 1 && innings.runs > match.innings[0].runs) {
    innings.closed = true;
    match.winner = `${match.teams[1]} won by ${10 - innings.wickets} wicket${10 - innings.wickets === 1 ? "" : "s"}`;
  } else if (innings.balls >= match.maxOvers * 6 || innings.wickets >= 10) {
    closeCurrentInnings();
    return;
  }

  render();
  saveMatch();
}

function closeCurrentInnings() {
  const innings = currentInnings();
  innings.closed = true;

  if (match.inningsIndex === 1) {
    const first = match.innings[0].runs;
    const second = match.innings[1].runs;
    if (second > first) {
      match.winner = `${match.teams[1]} won by ${10 - match.innings[1].wickets} wicket${10 - match.innings[1].wickets === 1 ? "" : "s"}`;
    } else if (second < first) {
      const margin = first - second;
      match.winner = `${match.teams[0]} won by ${margin} run${margin === 1 ? "" : "s"}`;
    } else {
      match.winner = "Match tied";
    }
  }

  render();
  saveMatch();
}

function formatOvers(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function render() {
  const innings = currentInnings();
  const team = match.teams[match.inningsIndex];
  const ballsLimit = match.maxOvers * 6;
  const legalOvers = innings.balls / 6;
  const runRate = innings.balls ? innings.runs / legalOvers : 0;
  const last = innings.log.at(-1);

  view.matchTitle.textContent = `${match.teams[0]} vs ${match.teams[1]}`;
  view.inningsLabel.textContent = match.inningsIndex === 0 ? "1st innings" : "2nd innings";
  view.battingTeam.textContent = team;
  view.runs.textContent = innings.runs;
  view.wickets.textContent = innings.wickets;
  view.overs.textContent = `${formatOvers(innings.balls)} / ${match.maxOvers}`;
  view.runRate.textContent = runRate.toFixed(2);
  view.balls.textContent = `${innings.balls} / ${ballsLimit}`;
  view.boundaries.textContent = `${innings.fours} fours, ${innings.sixes} sixes`;
  view.extras.textContent = innings.extras;
  view.lastBall.textContent = last ? last.label : "-";
  const visibleOver = getVisibleOver(innings);
  view.overHint.textContent = innings.closed
    ? `Over ${visibleOver.number}`
    : `Current over ${visibleOver.number}`;

  if (match.winner) {
    view.targetLine.textContent = match.winner;
  } else if (match.inningsIndex === 0) {
    view.targetLine.textContent = "First innings";
  } else {
    const target = match.innings[0].runs + 1;
    const needed = Math.max(0, target - innings.runs);
    const ballsLeft = Math.max(0, ballsLimit - innings.balls);
    view.targetLine.textContent = `${needed} needed from ${ballsLeft} ball${ballsLeft === 1 ? "" : "s"} · Target ${target}`;
  }

  view.ballLog.innerHTML = "";
  visibleOver.balls.slice().reverse().forEach((ball) => {
    const item = document.createElement("li");
    item.textContent = `${ball.over} ${ball.label}`;
    view.ballLog.appendChild(item);
  });

  const inningsClosed = innings.closed || Boolean(match.winner);
  const disableScoring = inningsClosed;
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.disabled = disableScoring;
  });
  undoButton.disabled = innings.history.length === 0 || Boolean(match.winner);
  inningsButton.disabled = inningsClosed;
  inningsButton.hidden = match.inningsIndex === 0 && innings.closed;
  newInningsButton.hidden = !(match.inningsIndex === 0 && innings.closed);
  persistLocalMatch();
}

function getVisibleOver(innings) {
  const completedOverBoundary = innings.balls > 0 && innings.balls % 6 === 0;
  const overIndex = completedOverBoundary
    ? Math.floor((innings.balls - 1) / 6)
    : Math.floor(innings.balls / 6);
  const startBall = overIndex * 6;
  const endBall = startBall + 6;

  return {
    number: overIndex + 1,
    balls: innings.log.filter((ball) => {
      const legalBalls = getBallLegalCount(ball);
      if (startBall === 0) return legalBalls >= startBall && legalBalls <= endBall;
      if (legalBalls === startBall) return ball.legal === false;
      return legalBalls > startBall && legalBalls <= endBall;
    }),
  };
}

function getBallLegalCount(ball) {
  if (Number.isFinite(ball.legalBalls)) return ball.legalBalls;

  const [overs, balls] = String(ball.over || "0.0")
    .split(".")
    .map((part) => Number(part));

  if (!Number.isFinite(overs) || !Number.isFinite(balls)) return 0;
  return overs * 6 + balls;
}

async function loadMatch(matchId) {
  view.saveStatus.textContent = "Loading saved match...";

  try {
    const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`);
    if (!response.ok) throw new Error("Could not load match");

    showMatch(await response.json());
    rememberMatch(match.id);
    view.saveStatus.textContent = `Saved match ${match.id.slice(0, 8)}`;
  } catch (error) {
    console.error(error);
    if (localMatch?.teams?.[0] && localMatch?.teams?.[1]) {
      showMatch(localMatch);
      view.saveStatus.textContent = "Using local copy. DB load failed.";
    } else {
      localStorage.removeItem("currentMatchId");
      view.saveStatus.textContent = "Saved match not found. Start a new match.";
    }
  }
}

async function saveMatch(options = {}) {
  if (!match.teams[0] || !match.teams[1]) return;

  view.saveStatus.textContent = "Saving...";

  try {
    const response = await fetch(match.id && !options.create ? `/api/matches/${match.id}` : "/api/matches", {
      method: match.id && !options.create ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(match),
    });

    if (!response.ok) throw new Error("Could not save match");

    match = await response.json();
    rememberMatch(match.id);
    view.saveStatus.textContent = `Saved match ${match.id.slice(0, 8)}`;
  } catch (error) {
    console.error(error);
    view.saveStatus.textContent = "Save failed. Check server/MySQL.";
  }
}

function rememberMatch(matchId) {
  localStorage.setItem("currentMatchId", matchId);
  persistLocalMatch();
  const url = new URL(window.location.href);
  url.searchParams.set("match", matchId);
  window.history.replaceState({}, "", url);
}

function showMatch(nextMatch) {
  match = normalizeLocalMatch(nextMatch);
  setupForm.hidden = true;
  scorer.hidden = false;
  render();
}

function persistLocalMatch() {
  if (!match.teams[0] || !match.teams[1]) return;
  localStorage.setItem("currentMatchDraft", JSON.stringify(match));
}

function readLocalMatch() {
  try {
    const saved = localStorage.getItem("currentMatchDraft");
    return saved ? normalizeLocalMatch(JSON.parse(saved)) : null;
  } catch (error) {
    console.error(error);
    localStorage.removeItem("currentMatchDraft");
    return null;
  }
}

function normalizeLocalMatch(saved) {
  const innings = Array.isArray(saved?.innings) ? saved.innings : [];

  return {
    id: String(saved?.id || ""),
    teams: [String(saved?.teams?.[0] || ""), String(saved?.teams?.[1] || "")],
    maxOvers: Number(saved?.maxOvers || 5),
    inningsIndex: Number(saved?.inningsIndex || 0),
    innings: [normalizeInnings(innings[0]), normalizeInnings(innings[1])],
    winner: String(saved?.winner || ""),
  };
}

function normalizeInnings(saved = {}) {
  return {
    ...blankInnings(),
    ...saved,
    log: Array.isArray(saved.log) ? saved.log : [],
    history: Array.isArray(saved.history) ? saved.history : [],
    closed: Boolean(saved.closed),
  };
}
