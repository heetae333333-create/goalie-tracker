(() => {
  "use strict";

  const STORAGE_KEYS = {
    goalies: "gtp_goalies_v1",
    draft: "gtp_current_game_v1",
    games: "gtp_saved_games_v1"
  };

  const PERIODS = ["1P", "2P", "3P", "OT"];

  const screens = {
    home: document.getElementById("homeScreen"),
    goalies: document.getElementById("goalieScreen"),
    newGame: document.getElementById("newGameScreen"),
    lessonSetup: document.getElementById("lessonSetupScreen"),
    lessonRecord: document.getElementById("lessonRecordScreen"),
    record: document.getElementById("recordScreen"),
    games: document.getElementById("gamesScreen"),
    detail: document.getElementById("gameDetailScreen"),
    stats: document.getElementById("statsScreen"),
    backup: document.getElementById("backupScreen"),
    install: document.getElementById("installScreen")
  };

  const goalieList = document.getElementById("goalieList");
  const goalieForm = document.getElementById("goalieForm");
  const goalieSelect = document.getElementById("goalieSelect");
  const periodContainer = document.getElementById("periodContainer");
  const goalAnalysisList = document.getElementById("goalAnalysisList");
  const shootoutEnabled = document.getElementById("shootoutEnabled");
  const shootoutSettings = document.getElementById("shootoutSettings");
  const customShootoutWrap = document.getElementById("customShootoutWrap");
  const customShootoutCount = document.getElementById("customShootoutCount");
  const shootoutSummary = document.getElementById("shootoutSummary");
  const shootoutList = document.getElementById("shootoutList");
  const statsGoalieSelect = document.getElementById("statsGoalieSelect");
  const statsGameTypeSelect = document.getElementById("statsGameTypeSelect");
  const statsGroupSelect = document.getElementById("statsGroupSelect");
  const gamesTypeFilter = document.getElementById("gamesTypeFilter");
  const gamesGroupFilter = document.getElementById("gamesGroupFilter");
  const detailGroupSelect = document.getElementById("detailGroupSelect");
  const gameTypeModal = document.getElementById("gameTypeModal");
  const lessonSetupForm = document.getElementById("lessonSetupForm");
  const lessonGoalieChoices = document.getElementById("lessonGoalieChoices");
  const lessonNetPanels = document.getElementById("lessonNetPanels");
  const lessonStintHistory = document.getElementById("lessonStintHistory");
  const lessonGoalieTotals = document.getElementById("lessonGoalieTotals");
  const editGameInfoPanel = document.getElementById("editGameInfoPanel");
  const editGameType = document.getElementById("editGameType");
  const editGameGroup = document.getElementById("editGameGroup");
  const editGoalieSelect = document.getElementById("editGoalieSelect");
  const activeGoalieSelect = document.getElementById("activeGoalieSelect");
  const currentGoalieName = document.getElementById("currentGoalieName");
  const switchPeriod = document.getElementById("switchPeriod");
  const switchClock = document.getElementById("switchClock");
  const applyGoalieSwitch = document.getElementById("applyGoalieSwitch");
  const goalieStintTimeline = document.getElementById("goalieStintTimeline");
  const gameGoalieSummary = document.getElementById("gameGoalieSummary");

  let goalies = readJson(STORAGE_KEYS.goalies, []);
  let savedGames = readJson(STORAGE_KEYS.games, []);
  let currentGame = null;
  let selectedSavedGameId = null;
  let editingSavedGameId = null;
  let selectedBackupFile = null;
  let deferredInstallPrompt = null;
  let serviceWorkerReady = false;
  let toastTimer = null;
  let pendingGameType = "official";
  let currentShotTool = "point";
  let drawingShotState = null;

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.error("저장 데이터 읽기 실패:", error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function showScreen(name) {
    Object.values(screens).forEach(screen => screen.classList.remove("active"));
    screens[name].classList.add("active");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 1800);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function todayLocal() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  const GAME_TYPE_LABELS = {
    official: "실제 경기",
    practice: "연습 경기",
    game_lesson: "게임 레슨"
  };

  function normalizedGameType(game) {
    return game?.gameType || "official";
  }

  function gameTypeLabel(gameOrType) {
    const type = typeof gameOrType === "string" ? gameOrType : normalizedGameType(gameOrType);
    return GAME_TYPE_LABELS[type] || "실제 경기";
  }

  function gameGroupName(game) {
    return String(game?.groupName || "").trim() || "미분류";
  }

  function allGroupNames() {
    return [...new Set(savedGames.map(gameGroupName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ko"));
  }

  function refreshGroupOptions() {
    const groups = allGroupNames();
    const datalist = document.getElementById("groupOptions");
    if (datalist) {
      datalist.innerHTML = groups
        .filter(name => name !== "미분류")
        .map(name => `<option value="${escapeHtml(name)}"></option>`)
        .join("");
    }

    [gamesGroupFilter, statsGroupSelect].forEach(select => {
      if (!select) return;
      const previous = select.value || "all";
      select.innerHTML = `
        <option value="all">전체 폴더</option>
        ${groups.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
      `;
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
    });
  }

  function refreshDetailGroupSelect(game) {
    if (!detailGroupSelect || !game) return;
    const current = gameGroupName(game);
    const groups = allGroupNames();
    if (!groups.includes(current)) groups.push(current);
    detailGroupSelect.innerHTML = groups.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("") + `<option value="__new__">＋ 새 폴더 만들기</option>`;
    detailGroupSelect.value = current;
  }

  function createEmptyPeriods() {
    return {
      "1P": { sog: 0, ga: 0 },
      "2P": { sog: 0, ga: 0 },
      "3P": { sog: 0, ga: 0 },
      "OT": { sog: 0, ga: 0 }
    };
  }

  function saveRateText(sog, ga) {
    if (sog <= 0) return "—";
    const saves = Math.max(0, sog - ga);
    return `${((saves / sog) * 100).toFixed(1)}%`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createGoalieRecord(goalie) {
    return {
      goalieId: goalie?.id || "",
      goalieName: goalie?.name || "미지정 골리",
      periods: createEmptyPeriods(),
      goals: []
    };
  }

  function normalizeGoalieRecords(game) {
    if (!game || typeof game !== "object") return [];

    if (!Array.isArray(game.goalieRecords) || game.goalieRecords.length === 0) {
      const legacyRecord = {
        goalieId: game.goalieId || "",
        goalieName: game.goalieName || "미지정 골리",
        periods: deepClone(game.periods || createEmptyPeriods()),
        goals: deepClone(Array.isArray(game.goals) ? game.goals : [])
      };

      legacyRecord.goals.forEach(goal => {
        if (!goal.goalieId) goal.goalieId = legacyRecord.goalieId;
        if (!goal.goalieName) goal.goalieName = legacyRecord.goalieName;
      });

      game.goalieRecords = [legacyRecord];
    }

    game.goalieRecords.forEach(record => {
      if (!record.periods || typeof record.periods !== "object") {
        record.periods = createEmptyPeriods();
      }

      PERIODS.forEach(period => {
        if (!record.periods[period]) {
          record.periods[period] = { sog: 0, ga: 0 };
        }
      });

      if (!Array.isArray(record.goals)) record.goals = [];

      record.goals.forEach(goal => {
        if (!goal.goalieId) goal.goalieId = record.goalieId;
        if (!goal.goalieName) goal.goalieName = record.goalieName;
      });
    });

    if (!game.activeGoalieId) {
      game.activeGoalieId = game.goalieRecords[0]?.goalieId || "";
    }

    if (!Array.isArray(game.goalieStints) || game.goalieStints.length === 0) {
      const firstRecord = game.goalieRecords[0];
      game.goalieStints = firstRecord ? [{
        goalieId: firstRecord.goalieId,
        goalieName: firstRecord.goalieName,
        startPeriod: "1P",
        startClock: "20:00",
        endPeriod: "",
        endClock: ""
      }] : [];
    }

    return game.goalieRecords;
  }

  function getGoalieRecords(game) {
    return normalizeGoalieRecords(game);
  }

  function findGoalieRecord(game, goalieId) {
    return getGoalieRecords(game).find(record => record.goalieId === goalieId) || null;
  }

  function ensureGoalieRecord(game, goalieId) {
    let record = findGoalieRecord(game, goalieId);
    if (record) return record;

    const goalie = goalies.find(item => item.id === goalieId);
    if (!goalie) return null;

    record = createGoalieRecord(goalie);
    game.goalieRecords.push(record);
    return record;
  }

  function getActiveGoalieRecord() {
    if (!currentGame) return null;

    const records = getGoalieRecords(currentGame);
    let record = records.find(item => item.goalieId === currentGame.activeGoalieId);

    if (!record) {
      record = records[0] || null;
      if (record) currentGame.activeGoalieId = record.goalieId;
    }

    if (record) {
      // 기존 함수들이 최대한 그대로 작동하도록 현재 골리 데이터를 기존 필드에 연결합니다.
      currentGame.goalieId = record.goalieId;
      currentGame.goalieName = record.goalieName;
      currentGame.periods = record.periods;
      currentGame.goals = record.goals;
    }

    return record;
  }

  function goalieRecordTotals(record) {
    let sog = 0;
    let ga = 0;

    PERIODS.forEach(period => {
      sog += Number(record?.periods?.[period]?.sog || 0);
      ga += Number(record?.periods?.[period]?.ga || 0);
    });

    return {
      sog,
      ga,
      save: saveRateText(sog, ga)
    };
  }

  function teamGoalieTotals(game) {
    let sog = 0;
    let ga = 0;

    getGoalieRecords(game).forEach(record => {
      const totals = goalieRecordTotals(record);
      sog += totals.sog;
      ga += totals.ga;
    });

    return {
      sog,
      ga,
      save: saveRateText(sog, ga)
    };
  }

  function gameGoalieNames(game) {
    return getGoalieRecords(game)
      .map(record => record.goalieName)
      .filter(Boolean);
  }

  function allGameGoals(game) {
    return getGoalieRecords(game).flatMap(record =>
      (record.goals || []).map(goal => ({
        ...goal,
        goalieId: goal.goalieId || record.goalieId,
        goalieName: goal.goalieName || record.goalieName
      }))
    );
  }

  function refreshActiveGoalieSelect() {
    if (!currentGame || !activeGoalieSelect) return;

    getActiveGoalieRecord();

    activeGoalieSelect.innerHTML = goalies.map(goalie => `
      <option value="${escapeHtml(goalie.id)}">
        ${escapeHtml(goalie.name)}${goalie.number ? ` (#${escapeHtml(goalie.number)})` : ""}
      </option>
    `).join("");

    if (currentGame.activeGoalieId) {
      activeGoalieSelect.value = currentGame.activeGoalieId;
    }

    if (currentGoalieName) {
      const active = getActiveGoalieRecord();
      currentGoalieName.textContent = active?.goalieName || "-";
    }
  }

  function renderGameGoalieSummary() {
    if (!currentGame || !gameGoalieSummary) return;

    const records = getGoalieRecords(currentGame);

    gameGoalieSummary.innerHTML = records.map(record => {
      const totals = goalieRecordTotals(record);
      const active = record.goalieId === currentGame.activeGoalieId;

      return `
        <div class="game-goalie-chip ${active ? "active" : ""}">
          <strong>${escapeHtml(record.goalieName)}</strong>
          <span>SOG ${totals.sog} · GA ${totals.ga} · ${totals.save}</span>
        </div>
      `;
    }).join("");
  }

  function normalizeClockText(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const match = raw.match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match) return null;

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);

    if (minutes < 0 || minutes > 20) return null;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function renderGoalieStintTimeline() {
    if (!currentGame || !goalieStintTimeline) return;

    const stints = Array.isArray(currentGame.goalieStints)
      ? currentGame.goalieStints
      : [];

    if (!stints.length) {
      goalieStintTimeline.innerHTML = "";
      return;
    }

    goalieStintTimeline.innerHTML = `
      <div class="stint-title">교체 타임라인</div>
      ${stints.map((stint, index) => {
        const end = stint.endPeriod
          ? `${stint.endPeriod} ${stint.endClock || ""}`
          : "현재";

        return `
          <div class="stint-row ${index === stints.length - 1 && !stint.endPeriod ? "active" : ""}">
            <strong>${escapeHtml(stint.goalieName || "-")}</strong>
            <span>${escapeHtml(stint.startPeriod || "-")} ${escapeHtml(stint.startClock || "")} → ${escapeHtml(end)}</span>
          </div>
        `;
      }).join("")}
    `;
  }

  function closeCurrentGoalieStint(period, clock) {
    if (!currentGame || !Array.isArray(currentGame.goalieStints)) return;
    const openStint = [...currentGame.goalieStints].reverse().find(stint => !stint.endPeriod);
    if (!openStint) return;

    openStint.endPeriod = period;
    openStint.endClock = clock;
  }

  function openGoalieStint(record, period, clock) {
    if (!currentGame) return;
    if (!Array.isArray(currentGame.goalieStints)) currentGame.goalieStints = [];

    currentGame.goalieStints.push({
      goalieId: record.goalieId,
      goalieName: record.goalieName,
      startPeriod: period,
      startClock: clock,
      endPeriod: "",
      endClock: ""
    });
  }

  function goalieShootoutTotals(game, record) {
    const attempts = game?.shootout?.attempts || [];
    const records = getGoalieRecords(game);

    const filtered = attempts.filter(attempt => {
      if (attempt.goalieId) return attempt.goalieId === record.goalieId;
      // 예전 슛아웃 데이터는 골리가 한 명뿐인 경기라면 그 골리에게 귀속합니다.
      return records.length === 1 && record.goalieId === records[0].goalieId;
    });

    const saved = filtered.filter(item => item.result === "saved").length;
    const goals = filtered.filter(item => item.result === "goal").length;
    const decided = saved + goals;

    return {
      count: filtered.length,
      saved,
      goals,
      save: decided > 0 ? `${((saved / decided) * 100).toFixed(1)}%` : "—"
    };
  }

  // ─────────────────────────────
  // 골리 관리
  // ─────────────────────────────

  function saveGoalies() {
    writeJson(STORAGE_KEYS.goalies, goalies);
  }

  function renderGoalies() {
    if (goalies.length === 0) {
      goalieList.innerHTML = `
        <div class="empty-state">
          등록된 골리가 없습니다.<br>
          위의 <strong>골리 추가</strong> 버튼을 눌러주세요.
        </div>`;
      return;
    }

    goalieList.innerHTML = goalies.map((goalie, index) => `
      <article class="goalie-card">
        <div class="goalie-card-head">
          <div>
            <h3>🥅 ${escapeHtml(goalie.name)}</h3>
            <p>등번호: ${escapeHtml(goalie.number || "-")}</p>
            <p>팀: ${escapeHtml(goalie.team || "-")}</p>
          </div>
          <button class="small-delete-btn" type="button" data-delete-goalie="${index}">
            삭제
          </button>
        </div>
      </article>
    `).join("");
  }

  function refreshGoalieSelect(selectedId = "") {
    if (goalies.length === 0) {
      goalieSelect.innerHTML = `<option value="">먼저 골리를 등록하세요</option>`;
      goalieSelect.disabled = true;
      return;
    }

    goalieSelect.disabled = false;
    goalieSelect.innerHTML = `
      <option value="">골리를 선택하세요</option>
      ${goalies.map(goalie => `
        <option value="${escapeHtml(goalie.id)}">
          ${escapeHtml(goalie.name)}${goalie.number ? ` (#${escapeHtml(goalie.number)})` : ""}
        </option>
      `).join("")}
    `;

    if (selectedId) goalieSelect.value = selectedId;
  }


  function refreshEditGoalieSelect(selectedId = "") {
    editGoalieSelect.innerHTML = goalies.map(goalie => `
      <option value="${escapeHtml(goalie.id)}">
        ${escapeHtml(goalie.name)}${goalie.number ? ` (#${escapeHtml(goalie.number)})` : ""}
      </option>
    `).join("");

    if (selectedId) editGoalieSelect.value = selectedId;
  }

  function populateEditGameInfo() {
    if (!currentGame) return;

    refreshEditGoalieSelect(currentGame.goalieId || "");
    editGameType.value = normalizedGameType(currentGame);
    editGameGroup.value = currentGame.groupName || "";
    document.getElementById("editGameDate").value = currentGame.date || todayLocal();
    document.getElementById("editOpponentTeam").value = currentGame.opponent || "";
    document.getElementById("editRinkName").value = currentGame.rink || "";
    document.getElementById("editTournamentName").value = currentGame.tournament || "";
    document.getElementById("editHomeAway").value = currentGame.homeAway || "홈";
  }

  function syncEditedGameInfo() {
    if (!currentGame || !editingSavedGameId) return;

    const selectedGoalie = goalies.find(goalie => goalie.id === editGoalieSelect.value);

    currentGame.gameType = editGameType.value || "official";
    currentGame.groupName = editGameGroup.value.trim();
    currentGame.date = document.getElementById("editGameDate").value || currentGame.date;
    currentGame.opponent = document.getElementById("editOpponentTeam").value.trim() || currentGame.opponent;
    currentGame.rink = document.getElementById("editRinkName").value.trim();
    currentGame.tournament = document.getElementById("editTournamentName").value.trim();
    currentGame.homeAway = document.getElementById("editHomeAway").value;

    if (selectedGoalie) {
      currentGame.goalieId = selectedGoalie.id;
      currentGame.goalieName = selectedGoalie.name;
    }
  }

  document.getElementById("addGoalieBtn").addEventListener("click", () => {
    goalieForm.classList.toggle("hidden");
    if (!goalieForm.classList.contains("hidden")) {
      document.getElementById("goalieName").focus();
    }
  });

  document.getElementById("cancelGoalieBtn").addEventListener("click", () => {
    goalieForm.reset();
    goalieForm.classList.add("hidden");
  });

  goalieForm.addEventListener("submit", event => {
    event.preventDefault();

    const name = document.getElementById("goalieName").value.trim();
    const number = document.getElementById("goalieNumber").value.trim();
    const team = document.getElementById("goalieTeam").value.trim();

    if (!name) {
      alert("골리 이름을 입력하세요.");
      return;
    }

    goalies.push({
      id: `g_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      number,
      team
    });

    saveGoalies();
    renderGoalies();
    goalieForm.reset();
    goalieForm.classList.add("hidden");
    showToast("골리가 저장되었습니다.");
  });

  goalieList.addEventListener("click", event => {
    const button = event.target.closest("[data-delete-goalie]");
    if (!button) return;

    const index = Number(button.dataset.deleteGoalie);
    const goalie = goalies[index];
    if (!goalie) return;

    if (!confirm(`${goalie.name} 골리를 삭제할까요?`)) return;

    goalies.splice(index, 1);
    saveGoalies();
    renderGoalies();
    showToast("골리가 삭제되었습니다.");
  });

  // ─────────────────────────────
  // 새 경기
  // ─────────────────────────────

  function showGameTypePicker() {
    gameTypeModal.classList.remove("hidden");
  }

  function hideGameTypePicker() {
    gameTypeModal.classList.add("hidden");
  }

  function openNewGame(type = "official") {
    pendingGameType = type;
    editingSavedGameId = null;
    document.getElementById("finishGameBtn").textContent = "✅ 경기 완료 및 목록 저장";
    document.getElementById("discardGameBtn").textContent = "🗑 현재 경기 초기화";
    refreshGoalieSelect();
    refreshGroupOptions();

    document.getElementById("gameDate").value = todayLocal();
    document.getElementById("opponentTeam").value = "";
    document.getElementById("rinkName").value = "";
    document.getElementById("tournamentName").value = "";
    document.getElementById("homeAway").value = "홈";
    document.getElementById("gameGroup").value = "";
    document.getElementById("newGameTypeBadge").textContent = gameTypeLabel(type);

    showScreen("newGame");
  }

  function renderLessonGoalieChoices() {
    lessonGoalieChoices.innerHTML = goalies.length
      ? goalies.map(goalie => `
          <label class="lesson-goalie-choice">
            <input type="checkbox" value="${escapeHtml(goalie.id)}">
            <span><strong>${escapeHtml(goalie.name)}</strong>${goalie.number ? ` #${escapeHtml(goalie.number)}` : ""}</span>
          </label>
        `).join("")
      : `<div class="empty-analysis">등록된 골리가 없습니다.</div>`;
  }

  function openLessonSetup() {
    if (goalies.length < 2) {
      alert("게임 레슨은 최소 2명의 골리가 필요합니다. 골리를 먼저 등록하세요.");
      renderGoalies();
      showScreen("goalies");
      return;
    }

    editingSavedGameId = null;
    refreshGroupOptions();
    document.getElementById("lessonDate").value = todayLocal();
    document.getElementById("lessonTitle").value = "게임 레슨";
    document.getElementById("lessonRink").value = "";
    document.getElementById("lessonGroup").value = "";
    document.getElementById("lessonTeamA").value = "RED";
    document.getElementById("lessonTeamB").value = "NAVY";
    renderLessonGoalieChoices();
    showScreen("lessonSetup");
  }

  document.getElementById("newGameForm").addEventListener("submit", event => {
    event.preventDefault();

    if (goalies.length === 0) {
      alert("먼저 골리를 등록하세요.");
      showScreen("goalies");
      return;
    }

    const goalieId = goalieSelect.value;
    const goalie = goalies.find(item => item.id === goalieId);

    if (!goalie) {
      alert("골리를 선택하세요.");
      return;
    }

    const opponent = document.getElementById("opponentTeam").value.trim();
    if (!opponent) {
      alert("상대팀을 입력하세요.");
      return;
    }

    currentGame = {
      id: `game_${Date.now()}`,
      status: "draft",
      createdAt: new Date().toISOString(),
      date: document.getElementById("gameDate").value || todayLocal(),
      gameType: pendingGameType || "official",
      groupName: document.getElementById("gameGroup").value.trim(),
      opponent,
      rink: document.getElementById("rinkName").value.trim(),
      tournament: document.getElementById("tournamentName").value.trim(),
      homeAway: document.getElementById("homeAway").value,
      goalieId: goalie.id,
      goalieName: goalie.name,
      activeGoalieId: goalie.id,
      goalieRecords: [
        createGoalieRecord(goalie)
      ],
      goalieStints: [
        {
          goalieId: goalie.id,
          goalieName: goalie.name,
          startPeriod: "1P",
          startClock: "20:00",
          endPeriod: "",
          endClock: ""
        }
      ],
      coachMemo: {
        good: "",
        improve: "",
        next: ""
      },
      periods: createEmptyPeriods(),
      opponentPeriods: createEmptyPeriods(),
      goals: [],
      shootout: {
        enabled: false,
        mode: "",
        count: 0,
        attempts: [],
        opponentAttempts: []
      }
    };

    saveCurrentGame();
    renderRecordScreen(false);
    showScreen("record");
  });

  // ─────────────────────────────
  // 게임 레슨 기록
  // ─────────────────────────────

  function ensureLessonGame(game) {
    if (!game) return game;
    if (!Array.isArray(game.lessonGoalies)) game.lessonGoalies = [];
    if (!Array.isArray(game.lessonStints)) game.lessonStints = [];
    if (!game.activeLessonGoalies) game.activeLessonGoalies = { A: "", B: "" };
    if (!Array.isArray(game.participantGoalieIds)) {
      game.participantGoalieIds = game.lessonGoalies.map(item => item.goalieId);
    }
    return game;
  }

  function lessonGoalieEntry(game, goalieId) {
    ensureLessonGame(game);
    return game.lessonGoalies.find(item => item.goalieId === goalieId) || null;
  }

  function activeLessonStint(game, net) {
    ensureLessonGame(game);
    const id = game.activeLessonGoalies?.[net];
    return game.lessonStints.find(stint => stint.id === id) || null;
  }

  function lessonStintSaves(stint) {
    return Math.max(0, Number(stint?.sog || 0) - Number(stint?.ga || 0));
  }

  function lessonGoalieStats(game, goalieId) {
    const stints = (game.lessonStints || []).filter(stint => stint.goalieId === goalieId);
    const sog = stints.reduce((sum, stint) => sum + Number(stint.sog || 0), 0);
    const ga = stints.reduce((sum, stint) => sum + Number(stint.ga || 0), 0);
    const byNet = { A: { sog: 0, ga: 0 }, B: { sog: 0, ga: 0 } };
    stints.forEach(stint => {
      if (!byNet[stint.net]) return;
      byNet[stint.net].sog += Number(stint.sog || 0);
      byNet[stint.net].ga += Number(stint.ga || 0);
    });
    return { sog, ga, saves: Math.max(0, sog - ga), save: saveRateText(sog, ga), byNet, stints };
  }

  function lessonScore(game) {
    ensureLessonGame(game);
    const scoreA = game.lessonStints
      .filter(stint => stint.net === "B")
      .reduce((sum, stint) => sum + Number(stint.ga || 0), 0);
    const scoreB = game.lessonStints
      .filter(stint => stint.net === "A")
      .reduce((sum, stint) => sum + Number(stint.ga || 0), 0);
    return { A: scoreA, B: scoreB };
  }

  function participantGoalies(game) {
    return (game.participantGoalieIds || [])
      .map(id => goalies.find(goalie => goalie.id === id) || game.lessonGoalies.find(item => item.goalieId === id))
      .filter(Boolean);
  }

  function renderLessonRecord() {
    if (!currentGame || normalizedGameType(currentGame) !== "game_lesson") return;
    ensureLessonGame(currentGame);
    const score = lessonScore(currentGame);
    const teamA = currentGame.teamAName || "RED";
    const teamB = currentGame.teamBName || "NAVY";

    document.getElementById("lessonRecordTitle").textContent = `🎮 ${currentGame.title || "게임 레슨"}`;
    document.getElementById("lessonRecordSubtitle").textContent = [currentGame.date, currentGame.rink, gameGroupName(currentGame)].filter(Boolean).join(" · ");
    document.getElementById("lessonTeamALabel").textContent = teamA;
    document.getElementById("lessonTeamBLabel").textContent = teamB;
    document.getElementById("lessonScoreA").textContent = score.A;
    document.getElementById("lessonScoreB").textContent = score.B;

    const participants = participantGoalies(currentGame);
    const options = participants.map(goalie => `<option value="${escapeHtml(goalie.id || goalie.goalieId)}">${escapeHtml(goalie.name || goalie.goalieName)}</option>`).join("");

    lessonNetPanels.innerHTML = ["A", "B"].map(net => {
      const teamName = net === "A" ? teamA : teamB;
      const attackingTeam = net === "A" ? teamB : teamA;
      const stint = activeLessonStint(currentGame, net);
      const currentName = stint?.goalieName || "미선택";
      const save = stint ? saveRateText(stint.sog, stint.ga) : "—";
      return `
        <section class="lesson-net-card net-${net.toLowerCase()}">
          <div class="lesson-net-head">
            <div><small>${escapeHtml(teamName)} 골대</small><strong>${escapeHtml(currentName)}</strong></div>
            <span>${stint ? `SOG ${stint.sog} · GA ${stint.ga} · ${save}` : "골리를 배치하세요"}</span>
          </div>
          <div class="lesson-switch-line">
            <select data-lesson-goalie-select="${net}"><option value="">골리 선택</option>${options}</select>
            <button type="button" class="secondary-btn compact-btn" data-lesson-switch="${net}">${stint ? "🔄 교체" : "🥅 배치"}</button>
          </div>
          <div class="lesson-event-buttons">
            <button type="button" class="lesson-event save" data-lesson-net="${net}" data-lesson-event="savePlus">🧤 SAVE +</button>
            <button type="button" class="lesson-event goal" data-lesson-net="${net}" data-lesson-event="goalPlus">🥅 GOAL +</button>
          </div>
          <div class="lesson-undo-buttons">
            <button type="button" data-lesson-net="${net}" data-lesson-event="saveMinus">SAVE −</button>
            <button type="button" data-lesson-net="${net}" data-lesson-event="goalMinus">GOAL −</button>
          </div>
          <p class="lesson-net-help">${escapeHtml(attackingTeam)}의 슈팅을 이 골리에게 기록합니다.</p>
        </section>
      `;
    }).join("");

    if (currentGame.lessonStints.length === 0) {
      lessonStintHistory.innerHTML = `<div class="empty-analysis">골리를 A/B 골대에 배치하면 교대 이력이 생성됩니다.</div>`;
    } else {
      lessonStintHistory.innerHTML = currentGame.lessonStints.map((stint, index) => `
        <div class="lesson-stint-row ${currentGame.activeLessonGoalies?.[stint.net] === stint.id ? "active" : ""}">
          <div class="lesson-stint-main">
            <strong>${index + 1}. ${escapeHtml(stint.goalieName)} · ${stint.net}골대</strong>
            <span>세이브 ${lessonStintSaves(stint)} · 실점 ${stint.ga} · SOG ${stint.sog} · ${saveRateText(stint.sog, stint.ga)}</span>
          </div>
          <div class="lesson-stint-edit">
            <button type="button" data-lesson-stint="${stint.id}" data-stint-event="savePlus">S+</button>
            <button type="button" data-lesson-stint="${stint.id}" data-stint-event="saveMinus">S−</button>
            <button type="button" data-lesson-stint="${stint.id}" data-stint-event="goalPlus">G+</button>
            <button type="button" data-lesson-stint="${stint.id}" data-stint-event="goalMinus">G−</button>
          </div>
        </div>
      `).join("");
    }

    lessonGoalieTotals.innerHTML = currentGame.lessonGoalies.map(goalie => {
      const stats = lessonGoalieStats(currentGame, goalie.goalieId);
      return `
        <div class="lesson-goalie-total-row">
          <div><strong>${escapeHtml(goalie.goalieName)}</strong><span>전체 SOG ${stats.sog} · GA ${stats.ga}</span></div>
          <strong class="lesson-save-rate">${stats.save}</strong>
          <small>A골대 ${stats.byNet.A.sog}/${stats.byNet.A.ga} · B골대 ${stats.byNet.B.sog}/${stats.byNet.B.ga}</small>
        </div>
      `;
    }).join("");

    saveCurrentGame();
  }

  function switchLessonGoalie(net, goalieId) {
    if (!goalieId) return showToast("골리를 선택하세요.");
    const otherNet = net === "A" ? "B" : "A";
    const other = activeLessonStint(currentGame, otherNet);
    if (other?.goalieId === goalieId) return showToast("같은 골리는 양쪽 골대에 동시에 들어갈 수 없습니다.");
    const goalie = currentGame.lessonGoalies.find(item => item.goalieId === goalieId);
    if (!goalie) return;
    const current = activeLessonStint(currentGame, net);
    if (current?.goalieId === goalieId) return showToast("이미 해당 골대에 있는 골리입니다.");
    if (current) current.endedAt = new Date().toISOString();
    const stint = {
      id: `stint_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      net,
      goalieId: goalie.goalieId,
      goalieName: goalie.goalieName,
      sog: 0,
      ga: 0,
      startedAt: new Date().toISOString(),
      endedAt: ""
    };
    currentGame.lessonStints.push(stint);
    currentGame.activeLessonGoalies[net] = stint.id;
    renderLessonRecord();
    showToast(`${goalie.goalieName} · ${net}골대 기록 시작`);
  }

  function updateLessonStint(stint, eventName) {
    if (!stint) return;
    const sog = Number(stint.sog || 0);
    const ga = Number(stint.ga || 0);
    if (eventName === "savePlus") stint.sog = sog + 1;
    if (eventName === "goalPlus") { stint.sog = sog + 1; stint.ga = ga + 1; }
    if (eventName === "saveMinus" && sog - ga > 0) stint.sog = sog - 1;
    if (eventName === "goalMinus" && ga > 0) { stint.sog = Math.max(0, sog - 1); stint.ga = ga - 1; }
  }

  lessonSetupForm.addEventListener("submit", event => {
    event.preventDefault();
    const selectedIds = [...lessonGoalieChoices.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
    if (selectedIds.length < 2) return alert("참여 골리를 최소 2명 선택하세요.");
    const selectedGoalies = selectedIds.map(id => goalies.find(goalie => goalie.id === id)).filter(Boolean);
    currentGame = {
      id: `lesson_${Date.now()}`,
      status: "draft",
      createdAt: new Date().toISOString(),
      gameType: "game_lesson",
      date: document.getElementById("lessonDate").value || todayLocal(),
      title: document.getElementById("lessonTitle").value.trim() || "게임 레슨",
      rink: document.getElementById("lessonRink").value.trim(),
      groupName: document.getElementById("lessonGroup").value.trim(),
      teamAName: document.getElementById("lessonTeamA").value.trim() || "RED",
      teamBName: document.getElementById("lessonTeamB").value.trim() || "NAVY",
      participantGoalieIds: selectedIds,
      lessonGoalies: selectedGoalies.map(goalie => ({ goalieId: goalie.id, goalieName: goalie.name })),
      lessonStints: [],
      activeLessonGoalies: { A: "", B: "" }
    };
    saveCurrentGame();
    renderLessonRecord();
    showScreen("lessonRecord");
  });

  lessonNetPanels.addEventListener("click", event => {
    const switchButton = event.target.closest("[data-lesson-switch]");
    if (switchButton) {
      const net = switchButton.dataset.lessonSwitch;
      const select = lessonNetPanels.querySelector(`[data-lesson-goalie-select="${net}"]`);
      switchLessonGoalie(net, select?.value || "");
      return;
    }
    const eventButton = event.target.closest("[data-lesson-event]");
    if (eventButton) {
      const stint = activeLessonStint(currentGame, eventButton.dataset.lessonNet);
      if (!stint) return showToast("먼저 해당 골대에 골리를 배치하세요.");
      updateLessonStint(stint, eventButton.dataset.lessonEvent);
      renderLessonRecord();
    }
  });

  lessonStintHistory.addEventListener("click", event => {
    const button = event.target.closest("[data-stint-event]");
    if (!button || !currentGame) return;
    const stint = currentGame.lessonStints.find(item => item.id === button.dataset.lessonStint);
    updateLessonStint(stint, button.dataset.stintEvent);
    renderLessonRecord();
  });

  function finishLessonRecord() {
    if (!currentGame || normalizedGameType(currentGame) !== "game_lesson") return;
    const completed = deepClone(currentGame);
    completed.status = "completed";
    completed.completedAt = new Date().toISOString();
    const index = savedGames.findIndex(game => game.id === completed.id);
    if (index >= 0) savedGames[index] = completed; else savedGames.push(completed);
    saveGames();
    localStorage.removeItem(STORAGE_KEYS.draft);
    selectedSavedGameId = completed.id;
    editingSavedGameId = null;
    currentGame = null;
    refreshGroupOptions();
    renderGamesList();
    const saved = savedGames.find(game => game.id === selectedSavedGameId);
    if (saved) renderGameDetail(saved);
    showScreen("detail");
    showToast("게임 레슨 기록을 저장했습니다.");
  }

  document.getElementById("finishLessonBtn").addEventListener("click", finishLessonRecord);
  document.getElementById("discardLessonBtn").addEventListener("click", () => {
    if (!currentGame) return;
    if (editingSavedGameId) {
      const id = editingSavedGameId;
      editingSavedGameId = null;
      currentGame = null;
      localStorage.removeItem(STORAGE_KEYS.draft);
      selectedSavedGameId = id;
      const saved = savedGames.find(game => game.id === id);
      if (saved) renderGameDetail(saved);
      showScreen("detail");
      return;
    }
    if (!confirm("현재 게임 레슨 기록을 초기화할까요?")) return;
    localStorage.removeItem(STORAGE_KEYS.draft);
    currentGame = null;
    showScreen("home");
  });

  // ─────────────────────────────
  // 경기 기록
  // ─────────────────────────────

  function saveCurrentGame() {
    if (!currentGame) return;
    currentGame.updatedAt = new Date().toISOString();
    writeJson(STORAGE_KEYS.draft, currentGame);
  }

  function renderPeriodCards() {
    periodContainer.innerHTML = PERIODS.map(period => `
      <article class="period-card comparison-period-card">
        <div class="period-title">${period}</div>

        <div class="goalie-compare-grid">
          <section class="goalie-side our-goalie-side">
            <div class="goalie-side-title active-goalie-period-title">우리 골리</div>

            <div class="period-body">
              <div class="counter-block">
                <div class="counter-label">SOG (상대 슈팅)</div>
                <div class="counter">
                  <button class="counter-btn" type="button"
                    data-period="${period}" data-side="our" data-field="sog" data-delta="-1">−</button>
                  <div id="${period}_sog" class="counter-value">0</div>
                  <button class="counter-btn" type="button"
                    data-period="${period}" data-side="our" data-field="sog" data-delta="1">＋</button>
                </div>
              </div>

              <div class="counter-block">
                <div class="counter-label">GA (우리 실점)</div>
                <div class="counter">
                  <button class="counter-btn" type="button"
                    data-period="${period}" data-side="our" data-field="ga" data-delta="-1">−</button>
                  <div id="${period}_ga" class="counter-value">0</div>
                  <button class="counter-btn" type="button"
                    data-period="${period}" data-side="our" data-field="ga" data-delta="1">＋</button>
                </div>
              </div>

              <div class="period-save">
                SAVE% <span id="${period}_save">—</span>
              </div>
            </div>
          </section>

          <section class="goalie-side opponent-goalie-side">
            <div class="goalie-side-title">상대 골리</div>

            <div class="period-body opponent-period-body">
              <div class="counter-block">
                <div class="counter-label">SOG (우리 슈팅)</div>
                <div class="counter compact-counter">
                  <button class="counter-btn" type="button"
                    data-period="${period}" data-side="opponent" data-field="sog" data-delta="-1">−</button>
                  <div id="${period}_opp_sog" class="counter-value">0</div>
                  <button class="counter-btn" type="button"
                    data-period="${period}" data-side="opponent" data-field="sog" data-delta="1">＋</button>
                </div>
              </div>

              <div class="counter-block">
                <div class="counter-label">GA (상대 실점)</div>
                <div class="counter compact-counter">
                  <button class="counter-btn" type="button"
                    data-period="${period}" data-side="opponent" data-field="ga" data-delta="-1">−</button>
                  <div id="${period}_opp_ga" class="counter-value">0</div>
                  <button class="counter-btn" type="button"
                    data-period="${period}" data-side="opponent" data-field="ga" data-delta="1">＋</button>
                </div>
              </div>

              <div class="period-save opponent-save">
                SAVE% <span id="${period}_opp_save">—</span>
              </div>
            </div>
          </section>
        </div>
      </article>
    `).join("");
  }

  function renderRecordScreen(fromDraft = false) {
    if (!currentGame) return;

    getActiveGoalieRecord();

    document.getElementById("recordTitle").textContent =
      `🏒 vs ${currentGame.opponent}`;

    const details = [
      gameTypeLabel(currentGame),
      currentGame.groupName || "",
      currentGame.date,
      currentGame.homeAway,
      currentGame.tournament || "",
      currentGame.rink || ""
    ].filter(Boolean);

    document.getElementById("recordSubtitle").textContent = details.join(" · ");
    document.getElementById("resumeNotice").classList.toggle("hidden", !fromDraft && !editingSavedGameId);
    document.getElementById("resumeNotice").textContent = editingSavedGameId
      ? "저장된 경기를 수정 중입니다."
      : "임시 저장된 경기 기록을 불러왔습니다.";

    editGameInfoPanel.classList.toggle("hidden", !editingSavedGameId);
    if (editingSavedGameId) {
      populateEditGameInfo();
    }

    ensureGameExtras();
    getActiveGoalieRecord();
    refreshActiveGoalieSelect();
    renderGameGoalieSummary();
    renderGoalieStintTimeline();

    document.querySelectorAll(".active-goalie-period-title").forEach(element => {
      element.textContent = `우리 골리 · ${currentGame.goalieName || "-"}`;
    });

    document.getElementById("activeGoalieTotalTitle").textContent =
      `${currentGame.goalieName || "우리 골리"} TOTAL`;

    document.getElementById("coachGood").value = currentGame.coachMemo.good || "";
    document.getElementById("coachImprove").value = currentGame.coachMemo.improve || "";
    document.getElementById("coachNext").value = currentGame.coachMemo.next || "";

    shootoutEnabled.value = currentGame.shootout.enabled ? "yes" : "no";
    shootoutSettings.classList.toggle("hidden", !currentGame.shootout.enabled);

    document.querySelectorAll("[data-shootout-size]").forEach(button => {
      button.classList.toggle("selected", button.dataset.shootoutSize === currentGame.shootout.mode);
    });

    customShootoutWrap.classList.toggle(
      "hidden",
      currentGame.shootout.mode !== "custom"
    );

    if (currentGame.shootout.mode === "custom" && currentGame.shootout.count) {
      customShootoutCount.value = currentGame.shootout.count;
    }

    updateRecordNumbers();
    renderGoalAnalysis();
    renderShootout();
  }


  function ensureGameExtras() {
    if (!currentGame) return;

    normalizeGoalieRecords(currentGame);
    getActiveGoalieRecord();

    if (!currentGame.coachMemo || typeof currentGame.coachMemo !== "object") {
      currentGame.coachMemo = { good: "", improve: "", next: "" };
    }
    if (typeof currentGame.coachMemo.good !== "string") currentGame.coachMemo.good = "";
    if (typeof currentGame.coachMemo.improve !== "string") currentGame.coachMemo.improve = "";
    if (typeof currentGame.coachMemo.next !== "string") currentGame.coachMemo.next = "";

    if (!Array.isArray(currentGame.goals)) {
      currentGame.goals = [];
    }

    currentGame.goals.forEach(goal => {
      if (typeof goal.causePrimary !== "string") goal.causePrimary = "";
      if (typeof goal.attackType !== "string") goal.attackType = "";
      if (typeof goal.finishType !== "string") goal.finishType = "";
      if (!Array.isArray(goal.movementTags)) goal.movementTags = [];
      if (typeof goal.shotLocation !== "string") goal.shotLocation = "";
      if (typeof goal.shotX !== "number") goal.shotX = null;
      if (typeof goal.shotY !== "number") goal.shotY = null;
      if (!goal.shotDiagram || typeof goal.shotDiagram !== "object") {
        goal.shotDiagram = { points: [], lines: [], paths: [] };
      }
      if (!Array.isArray(goal.shotDiagram.points)) goal.shotDiagram.points = [];
      if (!Array.isArray(goal.shotDiagram.lines)) goal.shotDiagram.lines = [];
      if (!Array.isArray(goal.shotDiagram.paths)) goal.shotDiagram.paths = [];
      if (goal.shotX != null && goal.shotY != null && goal.shotDiagram.points.length === 0 && goal.shotDiagram.lines.length === 0 && goal.shotDiagram.paths.length === 0) {
        goal.shotDiagram.points.push({ x: goal.shotX, y: goal.shotY });
      }
    });

    if (!currentGame.shootout || typeof currentGame.shootout !== "object") {
      currentGame.shootout = {
        enabled: false,
        mode: "",
        count: 0,
        attempts: []
      };
    }

    if (!Array.isArray(currentGame.shootout.attempts)) {
      currentGame.shootout.attempts = [];
    }

    if (!Array.isArray(currentGame.shootout.opponentAttempts)) {
      currentGame.shootout.opponentAttempts = [];
    }

    if (!currentGame.opponentPeriods || typeof currentGame.opponentPeriods !== "object") {
      currentGame.opponentPeriods = createEmptyPeriods();
    }

    PERIODS.forEach(period => {
      if (!currentGame.opponentPeriods[period]) {
        currentGame.opponentPeriods[period] = { sog: 0, ga: 0 };
      }
    });
  }

  function totalGoalsAgainst() {
    if (!currentGame) return 0;
    const record = getActiveGoalieRecord();
    if (!record) return 0;

    return PERIODS.reduce((sum, period) => {
      return sum + Number(record.periods?.[period]?.ga || 0);
    }, 0);
  }

  function syncGoalAnalysisCount() {
    ensureGameExtras();
    const required = totalGoalsAgainst();

    while (currentGame.goals.length < required) {
      currentGame.goals.push({
        situation: "",
        reason: "",
        causePrimary: "",
        attackType: "",
        finishType: "",
        movementTags: [],
        location: "",
        x: null,
        y: null,
        shotLocation: "",
        shotX: null,
        shotY: null,
        shotDiagram: { points: [], lines: [], paths: [] },
        body: "",
        memo: "",
        goalieId: currentGame.activeGoalieId || currentGame.goalieId || "",
        goalieName: currentGame.goalieName || ""
      });
    }

    if (currentGame.goals.length > required) {
      currentGame.goals.length = required;
    }
  }

  function selectOptions(values, selected, placeholder = "선택") {
    return [
      `<option value="">${placeholder}</option>`,
      ...values.map(value => `
        <option value="${escapeHtml(value)}"
          ${value === selected ? "selected" : ""}>
          ${escapeHtml(value)}
        </option>
      `)
    ].join("");
  }

  function goalSvgMarkup() {
    return `
      <svg class="goal-svg" viewBox="0 0 600 360" aria-hidden="true">
        <defs>
          <linearGradient id="iceGrad26" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#eaf2f9"/>
          </linearGradient>
          <pattern id="netPattern26" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M 0 0 L 26 26 M 26 0 L 0 26" stroke="#b9c5d2" stroke-width="2"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="600" height="360" fill="url(#iceGrad26)"/>
        <ellipse cx="300" cy="320" rx="250" ry="24" fill="#cfd9e4" opacity=".42"/>
        <path d="M80 308 L105 72 Q300 22 495 72 L520 308" fill="none" stroke="#d62424" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M105 80 Q300 38 495 80 L495 308 L105 308 Z" fill="url(#netPattern26)" opacity=".88"/>
        <line x1="105" y1="308" x2="495" y2="308" stroke="#d62424" stroke-width="22" stroke-linecap="round"/>
        <path d="M105 80 L145 44 M495 80 L455 44" stroke="#d62424" stroke-width="12" stroke-linecap="round"/>
        <g class="goalie-silhouette" opacity=".97">
          <ellipse cx="300" cy="305" rx="110" ry="15" fill="#9fafbf" opacity=".38"/>
          <circle cx="300" cy="92" r="28" fill="#eceff3" stroke="#7f8e9d" stroke-width="3"/>
          <path d="M282 80 h36 v24 h-36z" fill="#d62626" opacity=".75"/>
          <path d="M255 120 Q300 105 345 120 L353 195 Q300 212 247 195 Z" fill="#171717"/>
          <path d="M248 122 L216 185 L240 196 L268 138 Z" fill="#101010"/>
          <path d="M352 122 L384 185 L360 196 L332 138 Z" fill="#101010"/>
          <ellipse cx="215" cy="186" rx="20" ry="16" fill="#df2e2e"/>
          <ellipse cx="382" cy="182" rx="24" ry="18" fill="#df2e2e"/>
          <path d="M248 203 L223 286 L262 300 L282 208 Z" fill="#ffffff" stroke="#a9b5c1" stroke-width="2"/>
          <path d="M352 203 L318 208 L338 300 L377 286 Z" fill="#ffffff" stroke="#a9b5c1" stroke-width="2"/>
          <path d="M261 201 L242 289 L268 296 L288 206 Z" fill="#d62626" opacity=".9"/>
          <path d="M339 201 L312 206 L332 296 L357 289 Z" fill="#d62626" opacity=".9"/>
          <path d="M288 129 v163" stroke="#ffffff" stroke-width="4" opacity=".8"/>
          <path d="M312 129 v163" stroke="#ffffff" stroke-width="4" opacity=".8"/>
          <path d="M310 210 L404 212 L408 220 L311 226 Z" fill="#f2f2f2" stroke="#9aa7b5" stroke-width="2"/>
          <path d="M390 212 h24" stroke="#c98b3a" stroke-width="7" stroke-linecap="round"/>
          <path d="M300 215 v65" stroke="#1d1d1d" stroke-width="8" stroke-linecap="round"/>
        </g>
        <text x="300" y="344" text-anchor="middle" fill="#6b7788" font-size="18" font-weight="700">골대 안쪽을 터치하세요</text>
      </svg>
    `;
  }

  function rinkSvgMarkup() {
    return `
      <svg class="rink-svg" viewBox="0 0 760 640" aria-hidden="true">
        <rect x="6" y="6" width="748" height="628" rx="74" fill="#f7fbff" stroke="#2d2d2d" stroke-width="3"/>
        <rect x="6" y="6" width="748" height="20" fill="#2542c7" opacity=".98"/>
        <line x1="6" y1="230" x2="754" y2="230" stroke="#ff3333" stroke-width="2.6"/>
        <line x1="6" y1="520" x2="754" y2="520" stroke="#ff3333" stroke-width="4"/>
        <path d="M 315 520 A 60 60 0 0 1 445 520" fill="none" stroke="#1439ea" stroke-width="5"/>
        <circle cx="185" cy="360" r="130" fill="none" stroke="#ff3333" stroke-width="2.5"/>
        <circle cx="575" cy="360" r="130" fill="none" stroke="#ff3333" stroke-width="2.5"/>
        <circle cx="185" cy="360" r="10" fill="#ff2222"/>
        <circle cx="575" cy="360" r="10" fill="#ff2222"/>
        <circle cx="185" cy="280" r="5" fill="#2044f0"/>
        <circle cx="575" cy="280" r="5" fill="#2044f0"/>
        <line x1="145" y1="345" x2="215" y2="345" stroke="#ff2222" stroke-width="2"/>
        <line x1="145" y1="375" x2="215" y2="375" stroke="#ff2222" stroke-width="2"/>
        <line x1="185" y1="305" x2="185" y2="415" stroke="#ff2222" stroke-width="2"/>
        <line x1="535" y1="345" x2="605" y2="345" stroke="#ff2222" stroke-width="2"/>
        <line x1="535" y1="375" x2="605" y2="375" stroke="#ff2222" stroke-width="2"/>
        <line x1="575" y1="305" x2="575" y2="415" stroke="#ff2222" stroke-width="2"/>
        <line x1="30" y1="40" x2="730" y2="40" stroke="#7f8897" stroke-width="1" opacity=".12"/>
        <text x="380" y="78" text-anchor="middle" fill="#58687d" font-size="20" font-weight="800">하프 링크 슛 위치</text>
        <text x="380" y="550" text-anchor="middle" fill="#6d7987" font-size="18" font-weight="700">골대를 기준으로 슛 위치를 그리세요</text>
      </svg>`;
  }

  function classifyShotLocation(x, y) {
    if (y < 15) return "블루라인";
    if (y < 30) {
      if (x < 35) return "좌측 상단 존";
      if (x > 65) return "우측 상단 존";
      return "중앙 상단 존";
    }
    if (y < 50) {
      if (x < 35) return "좌측 하이 서클";
      if (x > 65) return "우측 하이 서클";
      return "하이 슬롯";
    }
    if (y < 72) {
      if (x < 33) return "좌측 로우 서클";
      if (x > 67) return "우측 로우 서클";
      return "로우 슬롯";
    }
    if (x < 24) return "좌측 코너";
    if (x > 76) return "우측 코너";
    if (x < 42) return "좌측 골라인";
    if (x > 58) return "우측 골라인";
    return "크리즈 정면";
  }

  function classifyGoalLocation(x, y) {
    const col = x < 33.333 ? 0 : x < 66.666 ? 1 : 2;
    const row = y < 33.333 ? 0 : y < 66.666 ? 1 : 2;

    const labels = [
      ["좌상단", "중앙상단", "우상단"],
      ["좌중단", "중앙", "우중단"],
      ["좌하단", "5홀", "우하단"]
    ];

    return labels[row][col];
  }

  const GOAL_CAUSE_CONFIG = {
    "러시": {
      attackTypes: ["와이드 엔트리", "센터 드라이브", "딜레이 러시", "풀업 슛"],
      finishes: ["직접 슛", "원타이머", "데크", "백핸드 마무리"]
    },
    "오드맨 러시": {
      attackTypes: ["2-on-1", "3-on-2", "3-on-1", "트레일러 합류"],
      finishes: ["직접 슛", "이스트-웨스트 패스 후 슛", "백도어", "원타이머"]
    },
    "브레이크어웨이": {
      attackTypes: ["정면 단독", "각도 있는 단독", "수비 압박 동반 단독"],
      finishes: ["직접 슛", "데크", "백핸드", "포핸드 드래그"]
    },
    "턴오버": {
      attackTypes: ["DZ 턴오버", "NZ 턴오버", "OZ 턴오버", "패스 미스 후 역습"],
      finishes: ["즉시 슛", "오드맨 연결", "브레이크어웨이 전환", "슬롯 침투 후 슛"]
    },
    "디펜스슛": {
      attackTypes: ["블루라인 슛", "하이 슬롯 슛", "포인트 원타이머", "중거리 손목슛"],
      finishes: ["클린샷", "스크린 동반", "팁", "리바운드 유도"]
    },
    "존 플레이": {
      attackTypes: ["사이드월 플레이", "하이 사이클", "로우 사이클", "포스트 플레이"],
      finishes: ["크로스-크리즈", "백도어", "원타이머", "슬롯 슛"]
    },
    "리바운드": {
      attackTypes: ["패드 리바운드", "사이드 리바운드", "하이 리바운드", "세컨드 찬스"],
      finishes: ["리바운드 슛", "잼 플레이", "백핸드 푸시", "재차 원타이머"]
    },
    "스크램블": {
      attackTypes: ["크리즈 혼전", "루즈퍽", "포스트 전환", "박스아웃 실패"],
      finishes: ["잼 플레이", "루즈퍽 마무리", "근거리 푸시", "백도어 터치"]
    },
    "비하인드 넷": {
      attackTypes: ["래프어라운드", "골대 뒤 패스", "비하인드 넷 회전", "숏사이드 플레이"],
      finishes: ["래프어라운드", "백도어", "크리즈 패스 후 슛", "근거리 슛"]
    },
    "스페셜팀": {
      attackTypes: ["파워플레이", "페널티킬", "6on5", "세트 플레이"],
      finishes: ["원타이머", "스크린", "팁", "백도어"]
    }
  };

  const MOVEMENT_TAGS = [
    "이스트-웨스트",
    "크로스-크리즈",
    "로우 투 하이",
    "하이 투 로우",
    "백도어",
    "팁",
    "스크린",
    "비하인드 넷 패스"
  ];

  function renderGoalAnalysis() {
    if (!currentGame) return;

    syncGoalAnalysisCount();

    if (currentGame.goals.length === 0) {
      goalAnalysisList.innerHTML = `
        <div class="empty-analysis">
          GA를 추가하면 실점 분석란이 자동으로 생깁니다.
        </div>`;
      return;
    }

    const primarySituations = Object.keys(GOAL_CAUSE_CONFIG);
    const bodyParts = [
      "글러브", "블로커", "5홀", "좌측 패드", "우측 패드",
      "스틱", "숄더", "헤드", "몸통", "기타"
    ];

    goalAnalysisList.innerHTML = currentGame.goals.map((goal, index) => {
      const config = GOAL_CAUSE_CONFIG[goal.causePrimary] || {
        attackTypes: [],
        finishes: []
      };

      const legacyText = !goal.causePrimary && (goal.situation || goal.reason)
        ? `<div class="legacy-goal-note">기존 기록: ${escapeHtml([goal.situation, goal.reason].filter(Boolean).join(" / "))}</div>`
        : "";

      const tags = Array.isArray(goal.movementTags) ? goal.movementTags : [];
      const shotDiagram = goal.shotDiagram || { points: [], lines: [], paths: [] };

      return `
        <article class="analysis-item" data-goal-index="${index}">
          <h4>GA ${index + 1}</h4>

          ${legacyText}

          <div class="cause-flow cause-flow-compact">
            <label>
              <span class="cause-step">① 발생 상황</span>
              <select data-goal-field="causePrimary">
                ${selectOptions(primarySituations, goal.causePrimary)}
              </select>
            </label>

            <label>
              <span class="cause-step">② 공격 형태</span>
              <select data-goal-field="attackType" ${goal.causePrimary ? "" : "disabled"}>
                ${selectOptions(config.attackTypes, goal.attackType)}
              </select>
            </label>

            <label>
              <span class="cause-step">③ 마무리</span>
              <select data-goal-field="finishType" ${goal.causePrimary ? "" : "disabled"}>
                ${selectOptions(config.finishes, goal.finishType)}
              </select>
            </label>

            <div class="wide movement-tag-wrap">
              <div class="cause-step">④ 보조 태그</div>
              <div class="movement-tag-grid">
                ${MOVEMENT_TAGS.map(tag => `
                  <button
                    type="button"
                    class="movement-tag-btn ${tags.includes(tag) ? "selected" : ""}"
                    data-movement-tag="${escapeHtml(tag)}">
                    ${escapeHtml(tag)}
                  </button>
                `).join("")}
              </div>
            </div>
          </div>

          <div class="analysis-grid">
            <div class="wide shot-goal-map-grid">
              <div class="shot-map-wrap">
                <div class="goal-map-title">슛 위치 / 슛 경로 — 도구를 선택해 그리세요</div>
                <div class="shot-toolbox">
                  <button type="button" class="shot-tool-btn ${currentShotTool === "point" ? "selected" : ""}" data-shot-tool="point">📍 점</button>
                  <button type="button" class="shot-tool-btn ${currentShotTool === "line" ? "selected" : ""}" data-shot-tool="line">／ 선</button>
                  <button type="button" class="shot-tool-btn ${currentShotTool === "pen" ? "selected" : ""}" data-shot-tool="pen">✏ 자유</button>
                  <button type="button" class="shot-tool-btn" data-shot-undo="${index}">↶ 실행취소</button>
                  <button type="button" class="shot-tool-btn danger" data-clear-shot-location="${index}">🗑 전체 지우기</button>
                </div>
                <div class="shot-rink-map">
                  ${rinkSvgMarkup()}
                  <svg class="shot-draw-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    ${shotDiagram.lines.map(line => `<line class="shot-draw-line" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}"></line>`).join("")}
                    ${shotDiagram.paths.map(path => `<polyline class="shot-draw-path" points="${path.map(point => `${point.x},${point.y}`).join(" ")}"></polyline>`).join("")}
                    ${shotDiagram.points.map(point => `<circle class="shot-draw-point" cx="${point.x}" cy="${point.y}" r="1.8"></circle>`).join("")}
                  </svg>
                  <div class="shot-touch-layer" data-shot-touch="${index}"></div>
                </div>

                <div class="goal-zone-label">
                  슛 시작 위치:
                  <span data-shot-location-text="${index}">
                    ${escapeHtml(goal.shotLocation || "미선택")}
                  </span>
                </div>
              </div>

              <div class="goal-map-wrap">
                <div class="goal-map-title">실점 위치 — 골대 안쪽을 터치하세요</div>
                <div class="goal-map" data-goal-map="${index}">
                  ${goalSvgMarkup()}
                  <div class="goal-touch-layer" data-goal-touch="${index}">
                    ${goal.x != null && goal.y != null ? `
                      <div class="goal-selected-dot"
                        style="left:${goal.x}%;top:${goal.y}%"></div>
                    ` : ""}
                  </div>
                </div>
                <div class="goal-zone-label">
                  실점 위치:
                  <span data-goal-location-text="${index}">
                    ${escapeHtml(goal.location || "미선택")}
                  </span>
                </div>
                <div class="goal-map-actions">
                  <button type="button"
                    class="clear-location-btn"
                    data-clear-goal-location="${index}">
                    실점 위치 지우기
                  </button>
                </div>
              </div>
            </div>

            <label>
              실점 부위
              <select data-goal-field="body">
                ${selectOptions(bodyParts, goal.body)}
              </select>
            </label>

            <label class="wide">
              메모
              <textarea data-goal-field="memo"
                placeholder="실점 장면의 특이사항">${escapeHtml(goal.memo)}</textarea>
            </label>
          </div>
        </article>
      `;
    }).join("");
  }

  function ensureShotDiagram(goal) {
    if (!goal.shotDiagram || typeof goal.shotDiagram !== "object") {
      goal.shotDiagram = { points: [], lines: [], paths: [] };
    }
    if (!Array.isArray(goal.shotDiagram.points)) goal.shotDiagram.points = [];
    if (!Array.isArray(goal.shotDiagram.lines)) goal.shotDiagram.lines = [];
    if (!Array.isArray(goal.shotDiagram.paths)) goal.shotDiagram.paths = [];
    return goal.shotDiagram;
  }

  function setShotOrigin(goal, x, y) {
    goal.shotX = Number(x.toFixed(2));
    goal.shotY = Number(y.toFixed(2));
    goal.shotLocation = classifyShotLocation(goal.shotX, goal.shotY);
  }

  function getShotToolButtonMarkup() {
    return '';
  }

  function shotPointFromEvent(layer, event) {
    const rect = layer.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  }

  function commitShotPoint(index, point) {
    const goal = currentGame.goals[index];
    const diagram = ensureShotDiagram(goal);
    diagram.points.push(point);
    setShotOrigin(goal, point.x, point.y);
    renderGoalAnalysis();
    saveCurrentGame();
    showToast(`슛 위치: ${goal.shotLocation}`);
  }

  function undoShotDrawing(index) {
    const goal = currentGame.goals[index];
    if (!goal) return;
    const diagram = ensureShotDiagram(goal);
    if (diagram.paths.length) diagram.paths.pop();
    else if (diagram.lines.length) diagram.lines.pop();
    else if (diagram.points.length) diagram.points.pop();
    if (!diagram.points.length && !diagram.lines.length && !diagram.paths.length) {
      goal.shotX = null;
      goal.shotY = null;
      goal.shotLocation = "";
    }
    renderGoalAnalysis();
    saveCurrentGame();
  }

  function clearShotDrawing(index) {
    const goal = currentGame.goals[index];
    if (!goal) return;
    goal.shotX = null;
    goal.shotY = null;
    goal.shotLocation = "";
    goal.shotDiagram = { points: [], lines: [], paths: [] };
    renderGoalAnalysis();
    saveCurrentGame();
  }

  function createShotPreview(layer, tool) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("shot-preview-overlay");
    let shape;
    if (tool === "line") {
      shape = document.createElementNS(svgNS, "line");
      shape.classList.add("shot-draw-line", "preview-shape");
      svg.appendChild(shape);
    } else {
      shape = document.createElementNS(svgNS, "polyline");
      shape.classList.add("shot-draw-path", "preview-shape");
      svg.appendChild(shape);
    }
    layer.appendChild(svg);
    return { svg, shape };
  }

  function updateShotPreview(state) {
    if (!state || !state.preview) return;
    if (state.tool === "line") {
      state.preview.shape.setAttribute("x1", state.start.x);
      state.preview.shape.setAttribute("y1", state.start.y);
      state.preview.shape.setAttribute("x2", state.current.x);
      state.preview.shape.setAttribute("y2", state.current.y);
    } else if (state.tool === "pen") {
      state.preview.shape.setAttribute("points", state.points.map(point => `${point.x},${point.y}`).join(" "));
    }
  }

  function finishShotDrawing(cancelled = false) {
    if (!drawingShotState || !currentGame) return;
    const state = drawingShotState;
    const goal = currentGame.goals[state.index];
    if (!cancelled && goal) {
      const diagram = ensureShotDiagram(goal);
      if (state.tool === "line") {
        diagram.lines.push({ x1: state.start.x, y1: state.start.y, x2: state.current.x, y2: state.current.y });
        setShotOrigin(goal, state.start.x, state.start.y);
      } else if (state.tool === "pen") {
        if (state.points.length === 1) {
          diagram.points.push(state.points[0]);
          setShotOrigin(goal, state.points[0].x, state.points[0].y);
        } else if (state.points.length > 1) {
          diagram.paths.push(state.points);
          setShotOrigin(goal, state.points[0].x, state.points[0].y);
        }
      }
      saveCurrentGame();
      renderGoalAnalysis();
      showToast(`슛 위치: ${goal.shotLocation || '기록됨'}`);
    }
    try { state.preview?.svg?.remove(); } catch (e) {}
    drawingShotState = null;
  }

  function updateGoalSelectField(event) {
    const item = event.target.closest("[data-goal-index]");
    const field = event.target.dataset.goalField;
    if (!item || !field || !currentGame) return;

    const index = Number(item.dataset.goalIndex);
    const goal = currentGame.goals[index];

    goal[field] = event.target.value;

    if (field === "causePrimary") {
      goal.attackType = "";
      goal.finishType = "";
      renderGoalAnalysis();
    }

    saveCurrentGame();
  }

  goalAnalysisList.addEventListener("input", updateGoalSelectField);
  goalAnalysisList.addEventListener("change", updateGoalSelectField);


  goalAnalysisList.addEventListener("click", event => {
    if (!currentGame) return;

    const movementButton = event.target.closest("[data-movement-tag]");
    if (movementButton) {
      const item = movementButton.closest("[data-goal-index]");
      if (!item) return;

      const index = Number(item.dataset.goalIndex);
      const tag = movementButton.dataset.movementTag;
      const goal = currentGame.goals[index];

      if (!Array.isArray(goal.movementTags)) goal.movementTags = [];

      if (goal.movementTags.includes(tag)) {
        goal.movementTags = goal.movementTags.filter(value => value !== tag);
      } else {
        goal.movementTags.push(tag);
      }

      renderGoalAnalysis();
      saveCurrentGame();
      return;
    }

    const shotToolButton = event.target.closest("[data-shot-tool]");
    if (shotToolButton) {
      currentShotTool = shotToolButton.dataset.shotTool;
      renderGoalAnalysis();
      return;
    }

    const undoShotButton = event.target.closest("[data-shot-undo]");
    if (undoShotButton) {
      undoShotDrawing(Number(undoShotButton.dataset.shotUndo));
      return;
    }

    const touchLayer = event.target.closest("[data-goal-touch]");
    if (touchLayer) {
      const index = Number(touchLayer.dataset.goalTouch);
      const rect = touchLayer.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      const location = classifyGoalLocation(x, y);

      currentGame.goals[index].x = Number(x.toFixed(2));
      currentGame.goals[index].y = Number(y.toFixed(2));
      currentGame.goals[index].location = location;

      renderGoalAnalysis();
      saveCurrentGame();
      showToast(`실점 위치: ${location}`);
      return;
    }

    const clearShotButton = event.target.closest("[data-clear-shot-location]");
    if (clearShotButton) {
      clearShotDrawing(Number(clearShotButton.dataset.clearShotLocation));
      return;
    }

    const clearButton = event.target.closest("[data-clear-goal-location]");
    if (clearButton) {
      const index = Number(clearButton.dataset.clearGoalLocation);
      currentGame.goals[index].x = null;
      currentGame.goals[index].y = null;
      currentGame.goals[index].location = "";
      renderGoalAnalysis();
      saveCurrentGame();
    }
  });

  goalAnalysisList.addEventListener("pointerdown", event => {
    if (!currentGame) return;
    const layer = event.target.closest("[data-shot-touch]");
    if (!layer) return;
    event.preventDefault();
    const index = Number(layer.dataset.shotTouch);
    const point = shotPointFromEvent(layer, event);

    if (currentShotTool === "point") {
      commitShotPoint(index, point);
      return;
    }

    drawingShotState = {
      index,
      tool: currentShotTool,
      layer,
      start: point,
      current: point,
      points: [point],
      preview: createShotPreview(layer, currentShotTool)
    };
    updateShotPreview(drawingShotState);
    if (layer.setPointerCapture) {
      try { layer.setPointerCapture(event.pointerId); } catch (error) {}
    }
  });

  goalAnalysisList.addEventListener("pointermove", event => {
    if (!drawingShotState) return;
    const point = shotPointFromEvent(drawingShotState.layer, event);
    drawingShotState.current = point;
    if (drawingShotState.tool === "pen") {
      const last = drawingShotState.points[drawingShotState.points.length - 1];
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 0.5) {
        drawingShotState.points.push(point);
      }
    }
    updateShotPreview(drawingShotState);
  });

  window.addEventListener("pointerup", () => {
    if (drawingShotState) finishShotDrawing(false);
  });

  window.addEventListener("pointercancel", () => {
    if (drawingShotState) finishShotDrawing(false);
  });

  function setShootoutCount(count, mode) {
    ensureGameExtras();

    const safeCount = Math.max(1, Math.min(30, Number(count) || 1));
    currentGame.shootout.enabled = true;
    currentGame.shootout.mode = mode;
    currentGame.shootout.count = safeCount;

    while (currentGame.shootout.attempts.length < safeCount) {
      currentGame.shootout.attempts.push({
        result: "",
        direction: "",
        type: "",
        memo: ""
      });
    }

    if (currentGame.shootout.attempts.length > safeCount) {
      currentGame.shootout.attempts.length = safeCount;
    }

    while (currentGame.shootout.opponentAttempts.length < safeCount) {
      currentGame.shootout.opponentAttempts.push({
        result: ""
      });
    }

    if (currentGame.shootout.opponentAttempts.length > safeCount) {
      currentGame.shootout.opponentAttempts.length = safeCount;
    }

    document.querySelectorAll("[data-shootout-size]").forEach(button => {
      button.classList.toggle("selected", button.dataset.shootoutSize === mode);
    });

    customShootoutWrap.classList.toggle("hidden", mode !== "custom");
    renderShootout();
    saveCurrentGame();
  }

  function renderShootout() {
    if (!currentGame) return;
    ensureGameExtras();

    if (!currentGame.shootout.enabled) {
      shootoutList.innerHTML = "";
      shootoutSummary.textContent = "슛아웃 없음";
      return;
    }

    const count = Number(currentGame.shootout.count || 0);
    if (count <= 0) {
      shootoutList.innerHTML = "";
      shootoutSummary.textContent = "슛아웃 인원을 선택하세요.";
      return;
    }

    const directions = [
      "좌상단", "좌중단", "좌하단", "중앙상단",
      "5홀", "중앙하단", "우상단", "우중단", "우하단"
    ];
    const shotTypes = [
      "포핸드", "백핸드", "스냅샷", "드래그",
      "데크", "원타이머", "기타"
    ];

    const ourSaved = currentGame.shootout.attempts.filter(
      attempt => attempt.result === "saved"
    ).length;
    const ourGoals = currentGame.shootout.attempts.filter(
      attempt => attempt.result === "goal"
    ).length;
    const ourDecided = ourSaved + ourGoals;
    const ourRate = ourDecided > 0
      ? ((ourSaved / ourDecided) * 100).toFixed(1) + "%"
      : "—";

    const oppSaved = currentGame.shootout.opponentAttempts.filter(
      attempt => attempt.result === "saved"
    ).length;
    const oppGoals = currentGame.shootout.opponentAttempts.filter(
      attempt => attempt.result === "goal"
    ).length;
    const oppDecided = oppSaved + oppGoals;
    const oppRate = oppDecided > 0
      ? ((oppSaved / oppDecided) * 100).toFixed(1) + "%"
      : "—";

    shootoutSummary.innerHTML = `
      <div><strong>우리팀 골리</strong> · 막음 ${ourSaved} · 실점 ${ourGoals} · SAVE% ${ourRate}</div>
      <div><strong>상대 골리</strong> · 막음 ${oppSaved} · 실점 ${oppGoals} · SAVE% ${oppRate}</div>
    `;

    shootoutList.innerHTML = currentGame.shootout.attempts.map((attempt, index) => {
      const opponentAttempt = currentGame.shootout.opponentAttempts[index] || { result: "" };

      return `
        <article class="analysis-item shootout-compare-item" data-shootout-index="${index}">
          <h4>슛아웃 ${index + 1}</h4>

          <section class="shootout-our-detail">
            <div class="shootout-section-title">우리 골리 기록</div>

            <div class="result-buttons">
              <button type="button"
                class="result-btn saved ${attempt.result === "saved" ? "selected" : ""}"
                data-shootout-result="saved">⭕ 막음</button>
              <button type="button"
                class="result-btn goal ${attempt.result === "goal" ? "selected" : ""}"
                data-shootout-result="goal">❌ 실점</button>
            </div>

            <div class="analysis-grid">
              <label>
                슈팅 방향
                <select data-shootout-field="direction">
                  ${selectOptions(directions, attempt.direction)}
                </select>
              </label>

              <label>
                슈팅 종류
                <select data-shootout-field="type">
                  ${selectOptions(shotTypes, attempt.type)}
                </select>
              </label>

              <label class="wide">
                메모
                <textarea data-shootout-field="memo"
                  placeholder="슈터 특징 또는 장면 메모">${escapeHtml(attempt.memo)}</textarea>
              </label>
            </div>
          </section>

          <section class="shootout-opponent-simple">
            <div class="shootout-section-title">상대 골리 결과</div>
            <div class="result-buttons">
              <button type="button"
                class="result-btn saved ${opponentAttempt.result === "saved" ? "selected" : ""}"
                data-opponent-shootout-result="saved">⭕ 상대 막음</button>
              <button type="button"
                class="result-btn goal ${opponentAttempt.result === "goal" ? "selected" : ""}"
                data-opponent-shootout-result="goal">🥅 우리 득점</button>
            </div>
          </section>
        </article>
      `;
    }).join("");
  }

  shootoutEnabled.addEventListener("change", () => {
    ensureGameExtras();

    currentGame.shootout.enabled = shootoutEnabled.value === "yes";
    shootoutSettings.classList.toggle("hidden", !currentGame.shootout.enabled);

    if (!currentGame.shootout.enabled) {
      currentGame.shootout.mode = "";
      currentGame.shootout.count = 0;
      currentGame.shootout.attempts = [];
      currentGame.shootout.opponentAttempts = [];
      document.querySelectorAll("[data-shootout-size]").forEach(button => {
        button.classList.remove("selected");
      });
    }

    renderShootout();
    saveCurrentGame();
  });

  document.querySelectorAll("[data-shootout-size]").forEach(button => {
    button.addEventListener("click", () => {
      const mode = button.dataset.shootoutSize;

      if (mode === "custom") {
        setShootoutCount(customShootoutCount.value || 3, "custom");
        customShootoutCount.focus();
      } else {
        setShootoutCount(Number(mode), mode);
      }
    });
  });

  customShootoutCount.addEventListener("change", () => {
    setShootoutCount(customShootoutCount.value, "custom");
  });

  shootoutList.addEventListener("click", event => {
    if (!currentGame) return;

    const item = event.target.closest("[data-shootout-index]");
    if (!item) return;

    const index = Number(item.dataset.shootoutIndex);

    const ourResultButton = event.target.closest("[data-shootout-result]");
    if (ourResultButton) {
      currentGame.shootout.attempts[index].result =
        ourResultButton.dataset.shootoutResult;
      currentGame.shootout.attempts[index].goalieId =
        currentGame.activeGoalieId || currentGame.goalieId || "";
      currentGame.shootout.attempts[index].goalieName =
        currentGame.goalieName || "";
      renderShootout();
      saveCurrentGame();
      return;
    }

    const opponentResultButton = event.target.closest("[data-opponent-shootout-result]");
    if (opponentResultButton) {
      currentGame.shootout.opponentAttempts[index].result =
        opponentResultButton.dataset.opponentShootoutResult;
      renderShootout();
      saveCurrentGame();
    }
  });

  shootoutList.addEventListener("input", event => {
    const item = event.target.closest("[data-shootout-index]");
    const field = event.target.dataset.shootoutField;
    if (!item || !field || !currentGame) return;

    const index = Number(item.dataset.shootoutIndex);
    currentGame.shootout.attempts[index][field] = event.target.value;
    saveCurrentGame();
  });

  function updateRecordNumbers() {
    if (!currentGame) return;
    ensureGameExtras();

    const activeRecord = getActiveGoalieRecord();
    if (!activeRecord) return;

    let totalSog = 0;
    let totalGa = 0;
    let opponentTotalSog = 0;
    let opponentTotalGa = 0;

    PERIODS.forEach(period => {
      const values = activeRecord.periods[period];
      const opponentValues = currentGame.opponentPeriods[period];

      document.getElementById(`${period}_sog`).textContent = values.sog;
      document.getElementById(`${period}_ga`).textContent = values.ga;
      document.getElementById(`${period}_save`).textContent =
        saveRateText(values.sog, values.ga);

      document.getElementById(`${period}_opp_sog`).textContent = opponentValues.sog;
      document.getElementById(`${period}_opp_ga`).textContent = opponentValues.ga;
      document.getElementById(`${period}_opp_save`).textContent =
        saveRateText(opponentValues.sog, opponentValues.ga);

      totalSog += Number(values.sog || 0);
      totalGa += Number(values.ga || 0);
      opponentTotalSog += Number(opponentValues.sog || 0);
      opponentTotalGa += Number(opponentValues.ga || 0);
    });

    document.getElementById("totalSog").textContent = totalSog;
    document.getElementById("totalGa").textContent = totalGa;
    document.getElementById("totalSave").textContent =
      saveRateText(totalSog, totalGa);

    const teamTotals = teamGoalieTotals(currentGame);
    document.getElementById("teamTotalSog").textContent = teamTotals.sog;
    document.getElementById("teamTotalGa").textContent = teamTotals.ga;
    document.getElementById("teamTotalSave").textContent = teamTotals.save;

    document.getElementById("opponentTotalSog").textContent = opponentTotalSog;
    document.getElementById("opponentTotalGa").textContent = opponentTotalGa;
    document.getElementById("opponentTotalSave").textContent =
      saveRateText(opponentTotalSog, opponentTotalGa);

    document.querySelectorAll(".active-goalie-period-title").forEach(element => {
      element.textContent = `우리 골리 · ${activeRecord.goalieName || "-"}`;
    });

    document.getElementById("activeGoalieTotalTitle").textContent =
      `${activeRecord.goalieName || "우리 골리"} TOTAL`;

    renderGameGoalieSummary();
    renderGoalAnalysis();
  }

  periodContainer.addEventListener("click", event => {
    const button = event.target.closest("[data-period][data-side][data-field][data-delta]");
    if (!button || !currentGame) return;

    ensureGameExtras();

    const period = button.dataset.period;
    const side = button.dataset.side;
    const field = button.dataset.field;
    const delta = Number(button.dataset.delta);

    const activeRecord = getActiveGoalieRecord();
    if (!activeRecord) return;

    const values = side === "opponent"
      ? currentGame.opponentPeriods[period]
      : activeRecord.periods[period];

    let next = Number(values[field] || 0) + delta;
    next = Math.max(0, next);

    if (field === "ga" && next > Number(values.sog || 0)) {
      showToast("실점은 해당 골리의 슈팅 수보다 클 수 없습니다.");
      return;
    }

    if (field === "sog" && next < Number(values.ga || 0)) {
      showToast("슈팅 수는 해당 골리의 실점보다 작을 수 없습니다.");
      return;
    }

    values[field] = next;

    // 실점 분석은 현재 골리 기록에 맞춰 자동 생성됩니다.
    getActiveGoalieRecord();
    updateRecordNumbers();
    saveCurrentGame();
  });

  switchClock.addEventListener("input", () => {
    const digits = switchClock.value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) {
      switchClock.value = digits;
    } else {
      switchClock.value = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    }
  });

  applyGoalieSwitch.addEventListener("click", () => {
    if (!currentGame) return;

    const goalieId = activeGoalieSelect.value;
    const period = switchPeriod.value;
    const clock = normalizeClockText(switchClock.value);

    if (!goalieId) {
      showToast("교체 골리를 선택하세요.");
      return;
    }

    if (goalieId === currentGame.activeGoalieId) {
      showToast("현재 출전 중인 골리입니다.");
      return;
    }

    if (!clock) {
      showToast("교체 시각을 MM:SS 형식으로 입력하세요. 예: 08:32");
      return;
    }

    const record = ensureGoalieRecord(currentGame, goalieId);

    if (!record) {
      showToast("교체 골리를 선택할 수 없습니다.");
      return;
    }

    closeCurrentGoalieStint(period, clock);
    openGoalieStint(record, period, clock);

    currentGame.activeGoalieId = record.goalieId;
    getActiveGoalieRecord();

    switchClock.value = "";
    renderRecordScreen(false);
    saveCurrentGame();

    showToast(`${period} ${clock} · ${record.goalieName} 골리로 교체했습니다.`);
  });

  function loadDraftIfExists() {
    const draft = readJson(STORAGE_KEYS.draft, null);
    if (!draft) return false;

    if (normalizedGameType(draft) === "game_lesson") {
      currentGame = draft;
      ensureLessonGame(currentGame);
      if (draft.status === "editing") editingSavedGameId = draft.id;
      renderLessonRecord();
      showScreen("lessonRecord");
      return true;
    }

    if (!draft.periods) return false;
    currentGame = draft;
    ensureGameExtras();

    if (draft.status === "editing") {
      editingSavedGameId = draft.id;
      document.getElementById("finishGameBtn").textContent = "💾 수정 내용 저장";
      document.getElementById("discardGameBtn").textContent = "↩ 수정 취소";
    }

    PERIODS.forEach(period => {
      if (!currentGame.periods[period]) {
        currentGame.periods[period] = { sog: 0, ga: 0 };
      }
    });

    renderRecordScreen(true);
    showScreen("record");
    return true;
  }

  document.getElementById("finishGameBtn").addEventListener("click", () => {
    if (!currentGame) return;

    ensureGameExtras();

    if (editingSavedGameId) {
      syncEditedGameInfo();

      getActiveGoalieRecord();
      const updated = JSON.parse(JSON.stringify(currentGame));
      updated.id = editingSavedGameId;
      updated.status = "completed";
      updated.updatedAt = new Date().toISOString();

      const index = savedGames.findIndex(item => item.id === editingSavedGameId);
      if (index >= 0) {
        savedGames[index] = updated;
      }

      saveGames();
      localStorage.removeItem(STORAGE_KEYS.draft);

      selectedSavedGameId = editingSavedGameId;
      editingSavedGameId = null;
      currentGame = null;

      document.getElementById("finishGameBtn").textContent = "✅ 경기 완료 및 목록 저장";
      document.getElementById("discardGameBtn").textContent = "🗑 현재 경기 초기화";

      const saved = savedGames.find(item => item.id === selectedSavedGameId);
      if (saved) renderGameDetail(saved);

      showScreen("detail");
      showToast("수정 내용을 저장했습니다.");
      return;
    }

    getActiveGoalieRecord();
    const completed = JSON.parse(JSON.stringify(currentGame));
    completed.status = "completed";
    completed.completedAt = new Date().toISOString();

    const existingIndex = savedGames.findIndex(item => item.id === completed.id);
    if (existingIndex >= 0) {
      savedGames[existingIndex] = completed;
    } else {
      savedGames.push(completed);
    }

    saveGames();
    localStorage.removeItem(STORAGE_KEYS.draft);
    currentGame = null;

    renderGamesList();
    showScreen("games");
    showToast("경기를 목록에 저장했습니다.");
  });

  document.getElementById("discardGameBtn").addEventListener("click", () => {
    if (!currentGame) return;

    if (editingSavedGameId) {
      if (!confirm("수정한 내용을 저장하지 않고 취소할까요?")) return;

      const originalId = editingSavedGameId;
      editingSavedGameId = null;
      currentGame = null;
      localStorage.removeItem(STORAGE_KEYS.draft);

      document.getElementById("finishGameBtn").textContent = "✅ 경기 완료 및 목록 저장";
      document.getElementById("discardGameBtn").textContent = "🗑 현재 경기 초기화";

      selectedSavedGameId = originalId;
      const original = savedGames.find(item => item.id === originalId);
      if (original) renderGameDetail(original);
      showScreen("detail");
      showToast("수정을 취소했습니다.");
      return;
    }

    if (!confirm("현재 경기 기록을 모두 초기화할까요?")) return;

    localStorage.removeItem(STORAGE_KEYS.draft);
    currentGame = null;
    showScreen("home");
    showToast("현재 경기 기록을 초기화했습니다.");
  });



  ["coachGood", "coachImprove", "coachNext"].forEach(id => {
    document.getElementById(id).addEventListener("input", event => {
      if (!currentGame) return;
      ensureGameExtras();

      const map = {
        coachGood: "good",
        coachImprove: "improve",
        coachNext: "next"
      };

      currentGame.coachMemo[map[id]] = event.target.value;
      saveCurrentGame();
    });
  });

  [
    "editGameType",
    "editGameGroup",
    "editGameDate",
    "editOpponentTeam",
    "editRinkName",
    "editTournamentName",
    "editHomeAway",
    "editGoalieSelect"
  ].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      if (!editingSavedGameId || !currentGame) return;
      syncEditedGameInfo();
      renderRecordScreen(false);
      saveCurrentGame();
    });

    document.getElementById(id).addEventListener("change", () => {
      if (!editingSavedGameId || !currentGame) return;
      syncEditedGameInfo();
      renderRecordScreen(false);
      saveCurrentGame();
    });
  });

  // ─────────────────────────────
  // 경기 완료, 목록, 공유
  // ─────────────────────────────

  function gameTotals(game) {
    return teamGoalieTotals(game);
  }

  function shootoutTotals(game) {
    const attempts = game.shootout?.attempts || [];
    const saved = attempts.filter(item => item.result === "saved").length;
    const goals = attempts.filter(item => item.result === "goal").length;
    const decided = saved + goals;

    return {
      count: attempts.length,
      saved,
      goals,
      save: decided > 0 ? `${((saved / decided) * 100).toFixed(1)}%` : "—"
    };
  }

  function saveGames() {
    writeJson(STORAGE_KEYS.games, savedGames);
    refreshGroupOptions();
  }

  function buildLessonShareText(game) {
    const score = lessonScore(game);
    const lines = [];
    lines.push("🎮 게임 레슨 골리 기록");
    lines.push(`${game.date || "-"} · ${game.title || "게임 레슨"}`);
    if (game.rink) lines.push(`경기장: ${game.rink}`);
    if (game.groupName) lines.push(`폴더: ${game.groupName}`);
    lines.push(`${game.teamAName || "A"} ${score.A} : ${score.B} ${game.teamBName || "B"}`);
    lines.push("");
    lines.push("[골리별 기록]");
    (game.lessonGoalies || []).forEach(goalie => {
      const stats = lessonGoalieStats(game, goalie.goalieId);
      lines.push(`${goalie.goalieName}: SOG ${stats.sog} / GA ${stats.ga} / SAVE ${stats.save}`);
      lines.push(`  A골대 ${stats.byNet.A.sog}/${stats.byNet.A.ga} · B골대 ${stats.byNet.B.sog}/${stats.byNet.B.ga}`);
    });
    lines.push("");
    lines.push("[로테이션]");
    (game.lessonStints || []).forEach((stint, index) => {
      lines.push(`${index + 1}. ${stint.goalieName} · ${stint.net}골대 · SOG ${stint.sog} / GA ${stint.ga} / ${saveRateText(stint.sog, stint.ga)}`);
    });
    return lines.join("\n");
  }

  function buildShareText(game) {
    if (normalizedGameType(game) === "game_lesson") return buildLessonShareText(game);
    const totals = gameTotals(game);
    const records = getGoalieRecords(game);
    const lines = [];

    lines.push("🏒 경기 골리 기록");
    lines.push("");
    lines.push(`📅 경기일: ${game.date || "-"}`);
    lines.push(`🆚 상대팀: ${game.opponent || "-"}`);
    if (game.rink) lines.push(`🏟 경기장: ${game.rink}`);
    if (game.tournament) lines.push(`🏆 대회명: ${game.tournament}`);
    lines.push(`📍 구분: ${game.homeAway || "-"}`);
    lines.push(`🥅 출전 골리: ${records.map(record => record.goalieName).join(", ") || "-"}`);

    if (Array.isArray(game.goalieStints) && game.goalieStints.length) {
      lines.push("");
      lines.push("[골리 교체 타임라인]");
      game.goalieStints.forEach(stint => {
        const end = stint.endPeriod
          ? `${stint.endPeriod} ${stint.endClock || ""}`
          : "경기 종료";
        lines.push(
          `${stint.goalieName || "-"}: ${stint.startPeriod || "-"} ${stint.startClock || ""} → ${end}`
        );
      });
    }

    lines.push("");
    lines.push("[골리별 경기 기록]");

    records.forEach(record => {
      const recordTotals = goalieRecordTotals(record);
      lines.push("");
      lines.push(`▶ ${record.goalieName}`);
      PERIODS.forEach(period => {
        const values = record.periods?.[period] || { sog: 0, ga: 0 };
        if (Number(values.sog || 0) > 0 || Number(values.ga || 0) > 0) {
          lines.push(
            `${period}: SOG ${values.sog} / GA ${values.ga} / SAVE ${saveRateText(values.sog, values.ga)}`
          );
        }
      });
      lines.push(
        `TOTAL: SOG ${recordTotals.sog} / GA ${recordTotals.ga} / SAVE ${recordTotals.save}`
      );
    });

    lines.push("");
    lines.push("[우리팀 골리 합계]");
    lines.push(`SOG ${totals.sog} / GA ${totals.ga} / SAVE ${totals.save}`);

    const opponentTotals = PERIODS.reduce((acc, period) => {
      const values = game.opponentPeriods?.[period] || { sog: 0, ga: 0 };
      acc.sog += Number(values.sog || 0);
      acc.ga += Number(values.ga || 0);
      return acc;
    }, { sog: 0, ga: 0 });

    lines.push(
      `상대 골리: SOG ${opponentTotals.sog} / GA ${opponentTotals.ga} / SAVE ${saveRateText(opponentTotals.sog, opponentTotals.ga)}`
    );

    const goals = allGameGoals(game);
    if (goals.length > 0) {
      lines.push("");
      lines.push("[실점 분석]");

      goals.forEach((goal, index) => {
        const details = [
          goal.causePrimary || goal.situation,
          goal.attackType,
          goal.finishType || goal.reason,
          ...(Array.isArray(goal.movementTags) ? goal.movementTags : []),
          goal.shotLocation ? `슛:${goal.shotLocation}` : "",
          goal.location ? `실점:${goal.location}` : "",
          goal.body
        ].filter(Boolean).join(" / ");

        lines.push(`GA${index + 1} · ${goal.goalieName || "-"}: ${details || "상세 미입력"}`);
        if (goal.memo) lines.push(`  메모: ${goal.memo}`);
      });
    }

    if (game.shootout?.enabled) {
      lines.push("");
      lines.push("[슛아웃 골리별 기록]");

      records.forEach(record => {
        const so = goalieShootoutTotals(game, record);
        if (so.count > 0) {
          lines.push(
            `${record.goalieName}: 총 ${so.count} / 막음 ${so.saved} / 실점 ${so.goals} / SAVE ${so.save}`
          );
        }
      });

      const opponentAttempts = game.shootout?.opponentAttempts || [];
      const opponentSaved = opponentAttempts.filter(item => item.result === "saved").length;
      const opponentGoals = opponentAttempts.filter(item => item.result === "goal").length;
      const opponentDecided = opponentSaved + opponentGoals;
      const opponentSave = opponentDecided > 0
        ? ((opponentSaved / opponentDecided) * 100).toFixed(1) + "%"
        : "—";

      lines.push(`상대 골리: 막음 ${opponentSaved} / 실점 ${opponentGoals} / SAVE ${opponentSave}`);
    }

    const memo = game.coachMemo || {};
    if (memo.good || memo.improve || memo.next) {
      lines.push("");
      lines.push("[코치 메모]");
      if (memo.good) lines.push(`잘한 점: ${memo.good}`);
      if (memo.improve) lines.push(`개선할 점: ${memo.improve}`);
      if (memo.next) lines.push(`다음 훈련: ${memo.next}`);
    }

    return lines.join("\n");
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function downloadTextFile(game) {
    const text = buildShareText(game);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = normalizedGameType(game) === "game_lesson"
      ? `${game.date || "lesson"}_${game.title || "game_lesson"}.txt`
      : `${game.date || "game"}_vs_${game.opponent || "opponent"}_goalies.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function renderGameListCard(game) {
    const type = normalizedGameType(game);
    const typeBadge = `<span class="game-type-chip type-${type}">${gameTypeLabel(type)}</span>`;
    if (type === "game_lesson") {
      const score = lessonScore(game);
      const goalieSummary = (game.lessonGoalies || []).map(goalie => {
        const stats = lessonGoalieStats(game, goalie.goalieId);
        return `${escapeHtml(goalie.goalieName)} ${stats.save} (${stats.sog}/${stats.ga})`;
      }).join(" · ");
      return `
        <article class="game-list-card lesson-list-card">
          <div class="list-card-badges">${typeBadge}<span class="folder-chip">📁 ${escapeHtml(gameGroupName(game))}</span></div>
          <h3>${escapeHtml(game.date || "-")} · ${escapeHtml(game.title || "게임 레슨")}</h3>
          <p class="game-list-meta">${escapeHtml(game.teamAName || "A")} ${score.A} : ${score.B} ${escapeHtml(game.teamBName || "B")} · ${escapeHtml(game.rink || "")}</p>
          <p class="game-list-goalies">🥅 ${goalieSummary || "골리 기록 없음"}</p>
          <div class="game-list-actions">
            <button type="button" class="small-action-btn open" data-open-game="${escapeHtml(game.id)}">열기</button>
            <button type="button" class="small-action-btn copy" data-copy-game="${escapeHtml(game.id)}">복사</button>
          </div>
        </article>`;
    }

    const totals = gameTotals(game);
    const records = getGoalieRecords(game);
    const goalieSummary = records.map(record => {
      const rt = goalieRecordTotals(record);
      return `${escapeHtml(record.goalieName)} ${rt.save} (${rt.sog}/${rt.ga})`;
    }).join(" · ");
    return `
      <article class="game-list-card">
        <div class="list-card-badges">${typeBadge}<span class="folder-chip">📁 ${escapeHtml(gameGroupName(game))}</span></div>
        <h3>${escapeHtml(game.date || "-")} · vs ${escapeHtml(game.opponent || "-")}</h3>
        <p class="game-list-meta">${escapeHtml(game.tournament || game.rink || game.homeAway || "")}</p>
        <p class="game-list-meta">우리팀 골리 합계 · SOG ${totals.sog} · GA ${totals.ga} · SAVE ${totals.save}</p>
        <p class="game-list-goalies">🥅 ${goalieSummary || "골리 기록 없음"}</p>
        <div class="game-list-actions">
          <button type="button" class="small-action-btn open" data-open-game="${escapeHtml(game.id)}">열기</button>
          <button type="button" class="small-action-btn copy" data-copy-game="${escapeHtml(game.id)}">복사</button>
        </div>
      </article>`;
  }

  function renderGamesList() {
    refreshGroupOptions();
    const typeFilter = gamesTypeFilter?.value || "all";
    const groupFilter = gamesGroupFilter?.value || "all";
    const filtered = savedGames
      .filter(game => typeFilter === "all" || normalizedGameType(game) === typeFilter)
      .filter(game => groupFilter === "all" || gameGroupName(game) === groupFilter)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    if (filtered.length === 0) {
      document.getElementById("gamesList").innerHTML = `<div class="empty-state">조건에 맞는 저장 기록이 없습니다.</div>`;
      return;
    }

    const groups = {};
    filtered.forEach(game => {
      const folder = gameGroupName(game);
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(game);
    });

    document.getElementById("gamesList").innerHTML = Object.entries(groups).map(([folder, games]) => `
      <section class="record-folder-section">
        <div class="record-folder-title"><span>📁 ${escapeHtml(folder)}</span><small>${games.length}개 기록</small></div>
        <div class="record-folder-cards">${games.map(renderGameListCard).join("")}</div>
      </section>
    `).join("");
  }

  function renderGameDetail(game) {
    refreshDetailGroupSelect(game);
    if (normalizedGameType(game) === "game_lesson") {
      ensureLessonGame(game);
      const score = lessonScore(game);
      document.getElementById("detailSubtitle").textContent = `${game.date || "-"} · ${game.title || "게임 레슨"}`;
      const goalieRows = (game.lessonGoalies || []).map(goalie => {
        const stats = lessonGoalieStats(game, goalie.goalieId);
        return `<div class="lesson-detail-goalie"><strong>${escapeHtml(goalie.goalieName)}</strong><span>SOG ${stats.sog} · GA ${stats.ga} · SAVE ${stats.save}</span><small>A골대 ${stats.byNet.A.sog}/${stats.byNet.A.ga} · B골대 ${stats.byNet.B.sog}/${stats.byNet.B.ga}</small></div>`;
      }).join("");
      const stints = (game.lessonStints || []).map((stint, index) => `<div class="lesson-detail-stint"><strong>${index + 1}. ${escapeHtml(stint.goalieName)} · ${stint.net}골대</strong><span>SOG ${stint.sog} · GA ${stint.ga} · ${saveRateText(stint.sog, stint.ga)}</span></div>`).join("");
      document.getElementById("gameDetailContent").innerHTML = `
        <section class="detail-card"><div class="list-card-badges"><span class="game-type-chip type-game_lesson">게임 레슨</span><span class="folder-chip">📁 ${escapeHtml(gameGroupName(game))}</span></div><h3>${escapeHtml(game.title || "게임 레슨")}</h3><p>${escapeHtml(game.date || "-")} · ${escapeHtml(game.rink || "-")}</p></section>
        <section class="lesson-score-card detail-score"><div class="lesson-score-team"><span>${escapeHtml(game.teamAName || "A")}</span><strong>${score.A}</strong></div><div class="lesson-score-vs">FINAL</div><div class="lesson-score-team"><span>${escapeHtml(game.teamBName || "B")}</span><strong>${score.B}</strong></div></section>
        <section class="detail-card"><h3>🥅 골리별 기록</h3><div class="lesson-detail-goalies">${goalieRows}</div></section>
        <section class="detail-card"><h3>🔄 로테이션 기록</h3><div class="lesson-detail-stints">${stints || '<div class="empty-analysis">기록 없음</div>'}</div></section>`;
      return;
    }
    const totals = gameTotals(game);
    const records = getGoalieRecords(game);

    const opponentTotals = PERIODS.reduce((acc, period) => {
      const values = game.opponentPeriods?.[period] || { sog: 0, ga: 0 };
      acc.sog += Number(values.sog || 0);
      acc.ga += Number(values.ga || 0);
      return acc;
    }, { sog: 0, ga: 0 });
    opponentTotals.save = saveRateText(opponentTotals.sog, opponentTotals.ga);

    document.getElementById("detailSubtitle").textContent =
      `${game.date || "-"} · vs ${game.opponent || "-"}`;

    const goalieCards = records.map(record => {
      const rt = goalieRecordTotals(record);

      const rows = PERIODS.map(period => {
        const values = record.periods?.[period] || { sog: 0, ga: 0 };
        return `
          <tr>
            <td>${period}</td>
            <td>${values.sog}</td>
            <td>${values.ga}</td>
            <td>${saveRateText(values.sog, values.ga)}</td>
          </tr>
        `;
      }).join("");

      const goals = record.goals || [];
      const goalBlock = goals.length
        ? `
          <div class="detail-goalie-goals">
            ${goals.map((goal, index) => `
              <div class="detail-goal">
                <strong>GA ${index + 1}</strong><br>
                ${escapeHtml([
                  goal.causePrimary || goal.situation,
                  goal.attackType,
                  goal.finishType || goal.reason,
                  ...(Array.isArray(goal.movementTags) ? goal.movementTags : []),
                  goal.shotLocation ? `슛:${goal.shotLocation}` : "",
                  goal.location ? `실점:${goal.location}` : "",
                  goal.body
                ].filter(Boolean).join(" / ") || "상세 미입력")}
                ${goal.memo ? `<br><small>${escapeHtml(goal.memo)}</small>` : ""}
              </div>
            `).join("")}
          </div>
        `
        : "";

      return `
        <section class="detail-card goalie-appearance-card">
          <div class="appearance-head">
            <div>
              <h3>🥅 ${escapeHtml(record.goalieName)}</h3>
              <small>이 경기 개인 기록</small>
            </div>
            <div class="appearance-save">
              <strong>${rt.save}</strong>
              <span>SOG ${rt.sog} · GA ${rt.ga}</span>
            </div>
          </div>

          <table class="detail-table goalie-period-table">
            <thead>
              <tr><th>구간</th><th>SOG</th><th>GA</th><th>SV%</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          ${goalBlock}
        </section>
      `;
    }).join("");

    const opponentAttempts = game.shootout?.opponentAttempts || [];
    const opponentSaved = opponentAttempts.filter(item => item.result === "saved").length;
    const opponentGoals = opponentAttempts.filter(item => item.result === "goal").length;
    const opponentDecided = opponentSaved + opponentGoals;
    const opponentShootoutSave = opponentDecided > 0
      ? `${((opponentSaved / opponentDecided) * 100).toFixed(1)}%`
      : "—";

    const goalieShootoutRows = records.map(record => {
      const so = goalieShootoutTotals(game, record);
      if (!so.count) return "";
      return `
        <div class="shootout-goalie-row">
          <strong>${escapeHtml(record.goalieName)}</strong>
          <span>총 ${so.count} · 막음 ${so.saved} · 실점 ${so.goals} · ${so.save}</span>
        </div>
      `;
    }).filter(Boolean).join("");

    const shootoutBlock = game.shootout?.enabled
      ? `
        <section class="detail-card">
          <h3>🎯 슛아웃 비교</h3>
          <div class="shootout-goalie-breakdown">
            ${goalieShootoutRows || `<div class="empty-analysis">우리팀 골리 슛아웃 결과 없음</div>`}
            <div class="shootout-goalie-row opponent">
              <strong>상대 골리</strong>
              <span>막음 ${opponentSaved} · 실점 ${opponentGoals} · ${opponentShootoutSave}</span>
            </div>
          </div>
        </section>
      `
      : "";

    const memo = game.coachMemo || {};
    const coachMemoBlock = (memo.good || memo.improve || memo.next)
      ? `
        <section class="detail-card">
          <h3>📝 코치 메모</h3>
          <div class="coach-detail-grid">
            <div><span>잘한 점</span><p>${escapeHtml(memo.good || "—")}</p></div>
            <div><span>개선할 점</span><p>${escapeHtml(memo.improve || "—")}</p></div>
            <div><span>다음 훈련</span><p>${escapeHtml(memo.next || "—")}</p></div>
          </div>
        </section>
      `
      : "";

    document.getElementById("gameDetailContent").innerHTML = `
      <section class="detail-card">
        <h3>경기 정보</h3>
        <p>${escapeHtml(game.date || "-")} · ${escapeHtml(game.homeAway || "-")}</p>
        <p>vs ${escapeHtml(game.opponent || "-")}</p>
        <p>출전 골리: ${escapeHtml(records.map(record => record.goalieName).join(", ") || "-")}</p>
        ${Array.isArray(game.goalieStints) && game.goalieStints.length ? `
          <div class="detail-stint-list">
            ${game.goalieStints.map(stint => `
              <div>
                <strong>${escapeHtml(stint.goalieName || "-")}</strong>
                <span>
                  ${escapeHtml(stint.startPeriod || "-")} ${escapeHtml(stint.startClock || "")}
                  →
                  ${stint.endPeriod
                    ? `${escapeHtml(stint.endPeriod)} ${escapeHtml(stint.endClock || "")}`
                    : "경기 종료"}
                </span>
              </div>
            `).join("")}
          </div>
        ` : ""}
        ${game.rink ? `<p>경기장: ${escapeHtml(game.rink)}</p>` : ""}
        ${game.tournament ? `<p>대회명: ${escapeHtml(game.tournament)}</p>` : ""}
      </section>

      <section class="detail-card goalie-comparison-card">
        <h3>⚔️ 경기 전체 골리 비교</h3>
        <div class="goalie-comparison-summary">
          <div class="our-comparison">
            <span>우리팀 골리 합계</span>
            <strong>${totals.save}</strong>
            <small>SOG ${totals.sog} · GA ${totals.ga}</small>
          </div>
          <div class="opponent-comparison">
            <span>상대 골리</span>
            <strong>${opponentTotals.save}</strong>
            <small>SOG ${opponentTotals.sog} · GA ${opponentTotals.ga}</small>
          </div>
        </div>
      </section>

      <section class="detail-card">
        <h3>🥅 출전 골리별 기록</h3>
        <p class="detail-helper">교체 출전한 골리의 세이브 기록을 각각 확인할 수 있습니다.</p>
      </section>

      ${goalieCards}
      ${coachMemoBlock}
      ${shootoutBlock}
    `;
  }

  function openSavedGame(gameId) {
    const game = savedGames.find(item => item.id === gameId);
    if (!game) return;

    selectedSavedGameId = gameId;
    renderGameDetail(game);
    showScreen("detail");
  }

  document.getElementById("gamesList").addEventListener("click", async event => {
    const openButton = event.target.closest("[data-open-game]");
    if (openButton) {
      openSavedGame(openButton.dataset.openGame);
      return;
    }

    const copyButton = event.target.closest("[data-copy-game]");
    if (copyButton) {
      const game = savedGames.find(item => item.id === copyButton.dataset.copyGame);
      if (!game) return;

      const ok = await copyText(buildShareText(game));
      showToast(ok ? "공유용 텍스트를 복사했습니다." : "복사하지 못했습니다.");
    }
  });

  function beginEditingSavedGame(gameId) {
    const game = savedGames.find(item => item.id === gameId);
    if (!game) return;

    editingSavedGameId = gameId;
    currentGame = JSON.parse(JSON.stringify(game));
    currentGame.status = "editing";

    if (normalizedGameType(currentGame) === "game_lesson") {
      ensureLessonGame(currentGame);
      saveCurrentGame();
      renderLessonRecord();
      showScreen("lessonRecord");
      showToast("게임 레슨 수정 모드입니다. 이전 교대 기록도 수정할 수 있습니다.");
      return;
    }

    ensureGameExtras();
    saveCurrentGame();
    renderRecordScreen(false);
    showScreen("record");

    document.getElementById("finishGameBtn").textContent = "💾 수정 내용 저장";
    document.getElementById("discardGameBtn").textContent = "↩ 수정 취소";
  }

  document.getElementById("moveGameGroupBtn").addEventListener("click", () => {
    const game = savedGames.find(item => item.id === selectedSavedGameId);
    if (!game) return;
    let next = detailGroupSelect.value;
    if (next === "__new__") {
      next = prompt("새 그룹/폴더 이름을 입력하세요.", "")?.trim() || "";
      if (!next) return;
    }
    game.groupName = next === "미분류" ? "" : next;
    saveGames();
    renderGameDetail(game);
    showToast(`📁 ${gameGroupName(game)} 폴더로 이동했습니다.`);
  });

  document.getElementById("editSavedGameBtn").addEventListener("click", () => {
    if (!selectedSavedGameId) return;
    beginEditingSavedGame(selectedSavedGameId);
  });

  document.getElementById("copyGameTextBtn").addEventListener("click", async () => {
    const game = savedGames.find(item => item.id === selectedSavedGameId);
    if (!game) return;

    const ok = await copyText(buildShareText(game));
    showToast(ok ? "공유용 텍스트를 복사했습니다." : "복사하지 못했습니다.");
  });

  document.getElementById("downloadGameTxtBtn").addEventListener("click", () => {
    const game = savedGames.find(item => item.id === selectedSavedGameId);
    if (game) downloadTextFile(game);
  });

  document.getElementById("deleteSavedGameBtn").addEventListener("click", () => {
    const game = savedGames.find(item => item.id === selectedSavedGameId);
    if (!game) return;
    if (!confirm("이 경기 기록을 삭제할까요?")) return;

    savedGames = savedGames.filter(item => item.id !== selectedSavedGameId);
    saveGames();
    selectedSavedGameId = null;
    renderGamesList();
    showScreen("games");
    showToast("경기 기록을 삭제했습니다.");
  });




  // ─────────────────────────────
  // PWA 설치 및 오프라인
  // ─────────────────────────────

  function isStandaloneMode() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  function updateConnectionStatus() {
    const online = navigator.onLine;
    const dot = document.getElementById("offlineStatusDot");
    const text = document.getElementById("offlineStatusText");
    const networkText = document.getElementById("networkStateText");

    dot.classList.remove("ready", "offline");

    if (online) {
      dot.classList.add("ready");
      text.textContent = serviceWorkerReady
        ? "오프라인 사용 준비 완료"
        : "온라인 · 오프라인 준비 중";
      networkText.textContent = "온라인";
    } else {
      dot.classList.add("offline");
      text.textContent = "오프라인 모드로 실행 중";
      networkText.textContent = "오프라인";
    }

    updateInstallState();
  }

  function updateInstallState() {
    const installed = isStandaloneMode();
    const installButton = document.getElementById("installAppBtn");
    const settingsButton = document.getElementById("installFromSettingsBtn");
    const manualGuide = document.getElementById("manualInstallGuide");

    document.getElementById("cacheStateText").textContent =
      serviceWorkerReady ? "준비 완료" : "준비 중";

    document.getElementById("installStateText").textContent =
      installed ? "설치됨" : "미설치";

    if (installed) {
      installButton.classList.add("hidden");
      settingsButton.disabled = true;
      settingsButton.textContent = "✅ 이미 설치되어 있습니다";
      manualGuide.classList.add("hidden");
      return;
    }

    if (deferredInstallPrompt) {
      installButton.classList.remove("hidden");
      settingsButton.disabled = false;
      settingsButton.textContent = "📲 지금 앱 설치";
      manualGuide.classList.add("hidden");
    } else {
      installButton.classList.add("hidden");
      settingsButton.disabled = true;
      settingsButton.textContent = "Chrome 메뉴에서 설치하세요";
      manualGuide.classList.remove("hidden");
    }
  }

  async function requestAppInstall() {
    if (!deferredInstallPrompt) {
      document.getElementById("manualInstallGuide").classList.remove("hidden");
      showToast("Chrome 메뉴에서 홈 화면에 추가를 선택하세요.");
      return;
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;

    if (choice.outcome === "accepted") {
      showToast("앱 설치를 시작했습니다.");
    }

    deferredInstallPrompt = null;
    updateInstallState();
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallState();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallState();
    showToast("Goalie Tracker가 설치되었습니다.");
  });

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  document.getElementById("installAppBtn").addEventListener("click", requestAppInstall);
  document.getElementById("installFromSettingsBtn").addEventListener("click", requestAppInstall);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        await navigator.serviceWorker.register("./sw.js?v=26");
        await navigator.serviceWorker.ready;
        serviceWorkerReady = true;
        updateConnectionStatus();
      } catch (error) {
        console.error("서비스 워커 등록 실패:", error);
        serviceWorkerReady = false;
        updateConnectionStatus();
      }
    });
  } else {
    document.getElementById("cacheStateText").textContent = "지원하지 않음";
  }

  // ─────────────────────────────
  // 백업 및 복원
  // ─────────────────────────────

  function updateBackupSummary() {
    document.getElementById("backupGoalieCount").textContent = goalies.length;
    document.getElementById("backupGameCount").textContent = savedGames.length;

    const draft = readJson(STORAGE_KEYS.draft, null);
    document.getElementById("backupDraftCount").textContent = draft ? 1 : 0;
  }

  function buildBackupData() {
    return {
      app: "Goalie Tracker Pro",
      version: "1.9",
      exportedAt: new Date().toISOString(),
      data: {
        goalies: goalies,
        savedGames: savedGames,
        draft: readJson(STORAGE_KEYS.draft, null)
      }
    };
  }

  function downloadJsonFile(filename, data) {
    const jsonText = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonText], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function backupFilename() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const stamp = local.toISOString().slice(0, 19).replaceAll(":", "-");
    return `goalie_tracker_backup_${stamp}.json`;
  }

  function validateBackupData(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("백업 파일 형식이 올바르지 않습니다.");
    }

    const data = payload.data;
    if (!data || typeof data !== "object") {
      throw new Error("백업 데이터가 없습니다.");
    }

    if (!Array.isArray(data.goalies)) {
      throw new Error("골리 데이터 형식이 올바르지 않습니다.");
    }

    if (!Array.isArray(data.savedGames)) {
      throw new Error("경기 데이터 형식이 올바르지 않습니다.");
    }

    if (data.draft !== null && data.draft !== undefined && typeof data.draft !== "object") {
      throw new Error("작성 중 경기 데이터 형식이 올바르지 않습니다.");
    }

    return {
      goalies: data.goalies,
      savedGames: data.savedGames,
      draft: data.draft || null
    };
  }

  document.getElementById("exportBackupBtn").addEventListener("click", () => {
    const payload = buildBackupData();
    downloadJsonFile(backupFilename(), payload);
    showToast("백업 파일을 저장했습니다.");
  });

  document.getElementById("backupFileInput").addEventListener("change", event => {
    selectedBackupFile = event.target.files?.[0] || null;

    document.getElementById("backupFileName").textContent =
      selectedBackupFile ? selectedBackupFile.name : "선택된 파일 없음";

    document.getElementById("importBackupBtn").disabled = !selectedBackupFile;
  });

  document.getElementById("importBackupBtn").addEventListener("click", async () => {
    if (!selectedBackupFile) return;

    try {
      const text = await selectedBackupFile.text();
      const parsed = JSON.parse(text);
      const restored = validateBackupData(parsed);

      const message =
        `백업 내용을 복원할까요?\n\n` +
        `골리: ${restored.goalies.length}명\n` +
        `완료 경기: ${restored.savedGames.length}개\n` +
        `작성 중 경기: ${restored.draft ? 1 : 0}개\n\n` +
        `현재 데이터는 백업 파일 내용으로 교체됩니다.`;

      if (!confirm(message)) return;

      goalies = restored.goalies;
      savedGames = restored.savedGames;

      writeJson(STORAGE_KEYS.goalies, goalies);
      writeJson(STORAGE_KEYS.games, savedGames);

      if (restored.draft) {
        writeJson(STORAGE_KEYS.draft, restored.draft);
      } else {
        localStorage.removeItem(STORAGE_KEYS.draft);
      }

      currentGame = null;
      editingSavedGameId = null;
      selectedSavedGameId = null;
      selectedBackupFile = null;

      document.getElementById("backupFileInput").value = "";
      document.getElementById("backupFileName").textContent = "선택된 파일 없음";
      document.getElementById("importBackupBtn").disabled = true;

      renderGoalies();
      renderGamesList();
      refreshStatsGoalieSelect();
      updateBackupSummary();

      showToast("백업 데이터를 복원했습니다.");
    } catch (error) {
      console.error(error);
      alert(`백업 파일을 복원하지 못했습니다.\n\n${error.message}`);
    }
  });

  document.getElementById("clearAllDataBtn").addEventListener("click", () => {
    const first = confirm(
      "모든 골리와 경기 기록을 삭제할까요?\n백업 파일이 없으면 복구할 수 없습니다."
    );
    if (!first) return;

    const second = confirm(
      "정말 전체 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다."
    );
    if (!second) return;

    localStorage.removeItem(STORAGE_KEYS.goalies);
    localStorage.removeItem(STORAGE_KEYS.games);
    localStorage.removeItem(STORAGE_KEYS.draft);

    goalies = [];
    savedGames = [];
    currentGame = null;
    editingSavedGameId = null;
    selectedSavedGameId = null;

    renderGoalies();
    renderGamesList();
    refreshStatsGoalieSelect();
    updateBackupSummary();

    showToast("전체 데이터를 삭제했습니다.");
  });

  // ─────────────────────────────
  // 시즌 통계
  // ─────────────────────────────

  function refreshStatsGoalieSelect() {
    const goalieNames = [...new Set(savedGames.flatMap(game => {
      if (normalizedGameType(game) === "game_lesson") return (game.lessonGoalies || []).map(item => item.goalieName);
      return getGoalieRecords(game).map(record => record.goalieName);
    }).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));

    const previous = statsGoalieSelect.value || "all";
    statsGoalieSelect.innerHTML = `<option value="all">전체 골리</option>${goalieNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    if ([...statsGoalieSelect.options].some(option => option.value === previous)) statsGoalieSelect.value = previous;
    refreshGroupOptions();
  }

  function countBy(items, key) {
    const counts = {};

    items.forEach(item => {
      const value = item?.[key];
      if (!value) return;
      counts[value] = (counts[value] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  }

  function renderRankList(elementId, entries) {
    const element = document.getElementById(elementId);

    if (entries.length === 0) {
      element.innerHTML = `<div class="empty-analysis">기록 없음</div>`;
      return;
    }

    const max = Math.max(...entries.map(([, count]) => count));

    element.innerHTML = entries.map(([name, count]) => `
      <div class="rank-row">
        <div class="rank-name">${escapeHtml(name)}</div>
        <div class="rank-bar-track">
          <div class="rank-bar" style="width:${(count / max) * 100}%"></div>
        </div>
        <div class="rank-count">${count}</div>
      </div>
    `).join("");
  }

  function topEntries(counts, limit = 3) {
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit);
  }

  function weaknessTip(primary, attack, finish, tag) {
    const text = [primary, attack, finish, tag].filter(Boolean).join(" ");

    if (/East-West|Cross-crease|Backdoor/.test(text)) {
      return "좌우 패스의 선행 읽기, 푸시 타이밍, 반대 포스트 세팅 훈련을 우선 추천합니다.";
    }
    if (/Rebound|Scramble|Jam|Loose Puck/.test(text)) {
      return "리바운드 방향 제어와 세컨드 세이브 후 복구 동작을 우선 점검해보세요.";
    }
    if (/Breakaway|Deke|1-on-0/.test(text)) {
      return "브레이크어웨이에서 깊이 조절과 인내, 슈터의 손·스틱 읽기 훈련을 추천합니다.";
    }
    if (/Odd-man Rush|2-on-1|3-on-2|3-on-1/.test(text)) {
      return "Odd-man Rush에서 패스 옵션과 슈터 옵션을 구분하는 읽기 훈련이 효과적입니다.";
    }
    if (/Screen|Tip|Point Shot/.test(text)) {
      return "스크린 상황의 시야 확보와 팁 대비 깊이 조절을 집중적으로 점검해보세요.";
    }
    if (/Turnover/.test(text)) {
      return "턴오버 직후 빠른 세팅과 위험 옵션 우선순위 읽기 훈련을 추천합니다.";
    }
    return "가장 많이 반복되는 상위 실점 패턴을 다음 훈련의 첫 번째 테마로 잡는 것을 추천합니다.";
  }

  function renderWeaknessSummary(primaryCounts, attackCounts, finishCounts, tagCounts, totalGoals) {
    const el = document.getElementById("weaknessSummary");
    if (!el) return;

    if (!totalGoals) {
      el.innerHTML = `<div class="empty-analysis">실점 기록이 쌓이면 자동으로 약점 패턴을 요약합니다.</div>`;
      return;
    }

    const primary = topEntries(primaryCounts, 3);
    const attack = topEntries(attackCounts, 2);
    const finish = topEntries(finishCounts, 2);
    const tags = topEntries(tagCounts, 3);

    const listText = entries => entries.length
      ? entries.map(([name, count], i) =>
          `<span>${i + 1}. ${escapeHtml(name)} <strong>${count}</strong></span>`
        ).join("")
      : `<span>기록 없음</span>`;

    el.innerHTML = `
      <div class="weakness-headline">총 <strong>${totalGoals}</strong>실점 분석</div>

      <div class="weakness-grid">
        <div><small>발생상황</small>${listText(primary)}</div>
        <div><small>공격형태</small>${listText(attack)}</div>
        <div><small>마무리</small>${listText(finish)}</div>
        <div><small>이동/패스 태그</small>${listText(tags)}</div>
      </div>

      <div class="weakness-tip">
        <strong>훈련 추천</strong>
        ${escapeHtml(weaknessTip(
          primary[0]?.[0] || "",
          attack[0]?.[0] || "",
          finish[0]?.[0] || "",
          tags[0]?.[0] || ""
        ))}
      </div>
    `;
  }


  function renderSeasonStats() {
    const previousGoalie = statsGoalieSelect.value || "all";
    refreshStatsGoalieSelect();
    if ([...statsGoalieSelect.options].some(o => o.value === previousGoalie)) statsGoalieSelect.value = previousGoalie;

    const selected = statsGoalieSelect.value || "all";
    const typeFilter = statsGameTypeSelect?.value || "all";
    const groupFilter = statsGroupSelect?.value || "all";
    const appearances = [];

    savedGames
      .filter(game => typeFilter === "all" || normalizedGameType(game) === typeFilter)
      .filter(game => groupFilter === "all" || gameGroupName(game) === groupFilter)
      .forEach(game => {
        if (normalizedGameType(game) === "game_lesson") {
          (game.lessonGoalies || []).forEach(goalie => {
            if (selected !== "all" && goalie.goalieName !== selected) return;
            const totals = lessonGoalieStats(game, goalie.goalieId);
            appearances.push({ game, goalieName: goalie.goalieName, totals, goals: [], shootout: { count: 0, saved: 0, goals: 0 } });
          });
          return;
        }
        getGoalieRecords(game).forEach(record => {
          if (selected !== "all" && record.goalieName !== selected) return;
          appearances.push({ game, goalieName: record.goalieName, totals: goalieRecordTotals(record), goals: record.goals || [], shootout: goalieShootoutTotals(game, record) });
        });
      });

    const empty = document.getElementById("statsEmpty");
    const content = document.getElementById("statsContent");
    if (appearances.length === 0) {
      empty.classList.remove("hidden");
      content.classList.add("hidden");
      return;
    }
    empty.classList.add("hidden");
    content.classList.remove("hidden");

    let totalSog = 0, totalGa = 0, totalShootoutSaved = 0, totalShootoutGoals = 0, totalShootoutAttempts = 0;
    const allGoals = [];
    appearances.forEach(item => {
      totalSog += Number(item.totals.sog || 0);
      totalGa += Number(item.totals.ga || 0);
      (item.goals || []).forEach(goal => allGoals.push(goal));
      totalShootoutSaved += Number(item.shootout?.saved || 0);
      totalShootoutGoals += Number(item.shootout?.goals || 0);
      totalShootoutAttempts += Number(item.shootout?.count || 0);
    });

    const seasonSave = saveRateText(totalSog, totalGa);
    const distinctGameCount = new Set(appearances.map(item => item.game.id)).size;
    const divisor = appearances.length || 1;
    document.getElementById("statsGames").textContent = distinctGameCount;
    document.getElementById("statsSave").textContent = seasonSave;
    document.getElementById("statsAvgSog").textContent = (totalSog / divisor).toFixed(1);
    document.getElementById("statsAvgGa").textContent = (totalGa / divisor).toFixed(2);

    const comparable = appearances.map(item => ({ ...item, numericSave: item.totals.sog > 0 ? (item.totals.sog - item.totals.ga) / item.totals.sog : -1 }))
      .sort((a, b) => b.numericSave - a.numericSave || b.totals.sog - a.totals.sog);
    const best = comparable[0];
    document.getElementById("bestGameText").innerHTML = best && best.numericSave >= 0
      ? `${escapeHtml(best.game.date || "-")} · ${escapeHtml(best.goalieName || "-")} · ${gameTypeLabel(best.game)}<br>SOG ${best.totals.sog} · GA ${best.totals.ga} · SAVE ${best.totals.save}`
      : "유효한 SOG 기록이 없습니다.";

    const shootoutDecided = totalShootoutSaved + totalShootoutGoals;
    const shootoutSave = shootoutDecided > 0 ? `${((totalShootoutSaved / shootoutDecided) * 100).toFixed(1)}%` : "—";
    document.getElementById("shootoutStatsText").textContent = totalShootoutAttempts > 0
      ? `총 ${totalShootoutAttempts}명 · 막음 ${totalShootoutSaved} · 실점 ${totalShootoutGoals} · SAVE ${shootoutSave}`
      : "기록 없음";

    const primaryCauseCounts = {}, attackTypeCounts = {}, finishTypeCounts = {}, movementTagCounts = {};
    allGoals.forEach(goal => {
      const primary = goal.causePrimary || goal.reason || "";
      const attack = goal.attackType || "";
      const finish = goal.finishType || "";
      if (primary) primaryCauseCounts[primary] = (primaryCauseCounts[primary] || 0) + 1;
      if (attack) attackTypeCounts[attack] = (attackTypeCounts[attack] || 0) + 1;
      if (finish) finishTypeCounts[finish] = (finishTypeCounts[finish] || 0) + 1;
      (Array.isArray(goal.movementTags) ? goal.movementTags : []).forEach(tag => { if (tag) movementTagCounts[tag] = (movementTagCounts[tag] || 0) + 1; });
    });
    renderRankList("reasonStats", Object.entries(primaryCauseCounts).sort((a,b)=>b[1]-a[1]));
    renderRankList("attackTypeStats", Object.entries(attackTypeCounts).sort((a,b)=>b[1]-a[1]));
    renderRankList("finishStats", Object.entries(finishTypeCounts).sort((a,b)=>b[1]-a[1]));
    renderRankList("movementTagStats", Object.entries(movementTagCounts).sort((a,b)=>b[1]-a[1]));
    renderWeaknessSummary(primaryCauseCounts, attackTypeCounts, finishTypeCounts, movementTagCounts, allGoals.length);
    renderRankList("locationStats", countBy(allGoals, "location"));
    renderRankList("bodyStats", countBy(allGoals, "body"));

    document.getElementById("statsGameRows").innerHTML = [...appearances]
      .sort((a,b)=>String(b.game.date||"").localeCompare(String(a.game.date||"")))
      .map(item => `<div class="stats-game-row"><div><strong>${escapeHtml(item.game.date || "-")} · ${escapeHtml(item.goalieName)}</strong><small>${gameTypeLabel(item.game)} · 📁 ${escapeHtml(gameGroupName(item.game))} · SOG ${item.totals.sog} · GA ${item.totals.ga}</small></div><div class="stats-game-save">${item.totals.save}</div></div>`)
      .join("");
  }

  statsGoalieSelect.addEventListener("change", renderSeasonStats);
  statsGameTypeSelect.addEventListener("change", renderSeasonStats);
  statsGroupSelect.addEventListener("change", renderSeasonStats);
  gamesTypeFilter.addEventListener("change", renderGamesList);
  gamesGroupFilter.addEventListener("change", renderGamesList);

  // ─────────────────────────────
  // 화면 이동
  // ─────────────────────────────

  document.getElementById("goalieBtn").addEventListener("click", () => {
    renderGoalies();
    showScreen("goalies");
  });

  document.getElementById("newGameBtn").addEventListener("click", showGameTypePicker);

  gameTypeModal.addEventListener("click", event => {
    const button = event.target.closest("[data-new-game-type]");
    if (!button) return;
    const type = button.dataset.newGameType;
    hideGameTypePicker();
    if (type === "game_lesson") openLessonSetup(); else openNewGame(type);
  });
  document.getElementById("cancelGameTypeModal").addEventListener("click", hideGameTypePicker);

  document.getElementById("backFromGoalies").addEventListener("click", () => {
    goalieForm.classList.add("hidden");
    showScreen("home");
  });

  document.getElementById("backFromNewGame").addEventListener("click", () => showScreen("home"));
  document.getElementById("backFromLessonSetup").addEventListener("click", () => showScreen("home"));
  document.getElementById("backFromLessonRecord").addEventListener("click", () => {
    saveCurrentGame();
    showScreen("home");
    showToast("게임 레슨 기록은 자동 저장되어 있습니다.");
  });

  document.getElementById("backFromRecord").addEventListener("click", () => {
    if (editingSavedGameId) {
      saveCurrentGame();
      showScreen("detail");
      showToast("수정 내용은 임시 저장되어 있습니다.");
      return;
    }

    saveCurrentGame();
    showScreen("home");
    showToast("현재 경기 기록은 자동 저장되어 있습니다.");
  });

  document.getElementById("gamesBtn").addEventListener("click", () => {
    refreshGroupOptions();
    renderGamesList();
    showScreen("games");
  });

  document.getElementById("backFromGames").addEventListener("click", () => {
    showScreen("home");
  });

  document.getElementById("backFromDetail").addEventListener("click", () => {
    renderGamesList();
    showScreen("games");
  });

  document.getElementById("statsBtn").addEventListener("click", () => {
    refreshStatsGoalieSelect();
    statsGoalieSelect.value = "all";
    statsGameTypeSelect.value = "all";
    statsGroupSelect.value = "all";
    renderSeasonStats();
    showScreen("stats");
  });

  document.getElementById("backFromStats").addEventListener("click", () => {
    showScreen("home");
  });

  document.getElementById("backupBtn").addEventListener("click", () => {
    updateBackupSummary();
    showScreen("backup");
  });

  document.getElementById("backFromBackup").addEventListener("click", () => {
    showScreen("home");
  });

  document.getElementById("settingBtn").addEventListener("click", () => {
    updateConnectionStatus();
    showScreen("install");
  });

  document.getElementById("backFromInstall").addEventListener("click", () => {
    showScreen("home");
  });

  // ─────────────────────────────
  // 시작
  // ─────────────────────────────

  renderGoalies();
  renderPeriodCards();
  refreshGroupOptions();
  renderGamesList();
  updateBackupSummary();
  updateConnectionStatus();

  // 작성 중이던 경기가 있으면 자동으로 경기 기록 화면을 복구합니다.
  if (!loadDraftIfExists()) {
    showScreen("home");
  }
})();
