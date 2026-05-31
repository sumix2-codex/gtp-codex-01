const JST_TIME_ZONE = "Asia/Tokyo";
const STORAGE_KEY = "attendance-system-settings-v1";
const SESSION_KEY = "attendance-admin-authenticated";

const defaultSettings = {
  adminPassword: "admin1234",
  scriptUrl: "",
  spreadsheetId: "",
  apiSecret: "",
  groups: [
    {
      id: crypto.randomUUID(),
      name: "営業部",
      employees: Array.from({ length: 10 }, (_, index) => ({
        id: crypto.randomUUID(),
        name: `社員${String(index + 1).padStart(2, "0")}`,
      })),
    },
    {
      id: crypto.randomUUID(),
      name: "開発部",
      employees: Array.from({ length: 10 }, (_, index) => ({
        id: crypto.randomUUID(),
        name: `社員${String(index + 11).padStart(2, "0")}`,
      })),
    },
    {
      id: crypto.randomUUID(),
      name: "管理部",
      employees: Array.from({ length: 10 }, (_, index) => ({
        id: crypto.randomUUID(),
        name: `社員${String(index + 21).padStart(2, "0")}`,
      })),
    },
  ],
};

let settings = loadSettings();
let selectedEmployee = null;
let currentJst = getJstParts(new Date());

const elements = {
  date: document.querySelector("#jst-date"),
  time: document.querySelector("#jst-time"),
  frontView: document.querySelector("#front-view"),
  adminView: document.querySelector("#admin-view"),
  employeeGroups: document.querySelector("#employee-groups"),
  selectedEmployee: document.querySelector("#selected-employee"),
  clockIn: document.querySelector("#clock-in"),
  clockOut: document.querySelector("#clock-out"),
  status: document.querySelector("#status-message"),
  adminLogin: document.querySelector("#admin-login"),
  adminPanel: document.querySelector("#admin-panel"),
  passwordInput: document.querySelector("#admin-password-input"),
  loginButton: document.querySelector("#admin-login-button"),
  loginError: document.querySelector("#login-error"),
  scriptUrl: document.querySelector("#script-url"),
  spreadsheetId: document.querySelector("#spreadsheet-id"),
  apiSecret: document.querySelector("#api-secret"),
  newAdminPassword: document.querySelector("#new-admin-password"),
  groupsEditor: document.querySelector("#groups-editor"),
  addGroup: document.querySelector("#add-group"),
  saveSettings: document.querySelector("#save-settings"),
  resetSettings: document.querySelector("#reset-settings"),
  adminLogout: document.querySelector("#admin-logout"),
  groupTemplate: document.querySelector("#group-editor-template"),
};

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return cloneSettings(defaultSettings);

  try {
    const parsed = JSON.parse(saved);
    return {
      ...cloneSettings(defaultSettings),
      ...parsed,
      groups: Array.isArray(parsed.groups) && parsed.groups.length > 0 ? parsed.groups : cloneSettings(defaultSettings.groups),
    };
  } catch (error) {
    console.warn("設定の読み込みに失敗したため初期設定を使用します。", error);
    return cloneSettings(defaultSettings);
  }
}

function saveSettingsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function getJstParts(date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function updateClock() {
  currentJst = getJstParts(new Date());
  elements.date.textContent = `${currentJst.year}年${currentJst.month}月${currentJst.day}日（${currentJst.weekday}）`;
  elements.time.textContent = `${currentJst.hour}:${currentJst.minute}:${currentJst.second}`;
}

function renderFront() {
  elements.employeeGroups.innerHTML = "";

  settings.groups.forEach((group) => {
    const wrapper = document.createElement("section");
    wrapper.className = "employee-group";

    const title = document.createElement("h3");
    title.textContent = group.name || "名称未設定グループ";
    wrapper.append(title);

    const list = document.createElement("div");
    list.className = "employee-list";

    group.employees.forEach((employee) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "employee-button";
      button.textContent = employee.name || "名称未設定";
      button.dataset.employeeId = employee.id;
      button.dataset.groupId = group.id;
      if (selectedEmployee?.id === employee.id) button.classList.add("is-selected");
      button.addEventListener("click", () => selectEmployee(group, employee));
      list.append(button);
    });

    wrapper.append(list);
    elements.employeeGroups.append(wrapper);
  });

  updateSelectedEmployeeLabel();
}

function selectEmployee(group, employee) {
  selectedEmployee = {
    id: employee.id,
    name: employee.name,
    groupId: group.id,
    groupName: group.name,
  };
  renderFront();
}

function updateSelectedEmployeeLabel() {
  elements.selectedEmployee.textContent = selectedEmployee ? `${selectedEmployee.groupName} / ${selectedEmployee.name}` : "未選択";
  elements.clockIn.disabled = !selectedEmployee;
  elements.clockOut.disabled = !selectedEmployee;
}

function showStatus(message, type = "success") {
  elements.status.textContent = message;
  elements.status.className = `status-message ${type}`;
}

function buildAttendancePayload(type) {
  const timestamp = `${currentJst.year}-${currentJst.month}-${currentJst.day} ${currentJst.hour}:${currentJst.minute}:${currentJst.second}`;
  return {
    action: "recordAttendance",
    secret: settings.apiSecret,
    spreadsheetId: settings.spreadsheetId,
    record: {
      type,
      typeLabel: type === "clockIn" ? "出勤" : "退勤",
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      groupId: selectedEmployee.groupId,
      groupName: selectedEmployee.groupName,
      date: `${currentJst.year}-${currentJst.month}-${currentJst.day}`,
      time: `${currentJst.hour}:${currentJst.minute}:${currentJst.second}`,
      timestamp,
      timezone: JST_TIME_ZONE,
      userAgent: navigator.userAgent,
    },
  };
}

async function recordAttendance(type) {
  if (!selectedEmployee) {
    showStatus("社員を選択してください。", "error");
    return;
  }

  const payload = buildAttendancePayload(type);
  const label = payload.record.typeLabel;
  const localBackup = JSON.parse(localStorage.getItem("attendance-local-backup") || "[]");
  localBackup.push({ ...payload.record, savedAt: new Date().toISOString() });
  localStorage.setItem("attendance-local-backup", JSON.stringify(localBackup.slice(-300)));

  if (!settings.scriptUrl || !settings.spreadsheetId) {
    showStatus(`${selectedEmployee.name}さんの${label}をローカルに記録しました。管理画面でGoogle連携を設定してください。`, "error");
    return;
  }

  try {
    const response = await fetch(settings.scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    // Apps Script WebアプリはCORS制約で本文を読めないため、送信完了を成功として扱います。
    if (response.type === "opaque" || response.ok) {
      showStatus(`${selectedEmployee.name}さんの${label}を ${payload.record.timestamp} に送信しました。`);
      return;
    }

    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error("打刻送信に失敗しました。", error);
    showStatus(`${label}の送信に失敗しました。ローカルバックアップには保存済みです。`, "error");
  }
}

function route() {
  const isAdmin = window.location.hash === "#admin";
  elements.frontView.classList.toggle("is-hidden", isAdmin);
  elements.adminView.classList.toggle("is-hidden", !isAdmin);
  document.querySelectorAll("[data-route-link]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.routeLink === (isAdmin ? "admin" : "front"));
  });

  if (isAdmin) renderAdmin();
}

function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

function renderAdmin() {
  const authenticated = isAuthenticated();
  elements.adminLogin.classList.toggle("is-hidden", authenticated);
  elements.adminPanel.classList.toggle("is-hidden", !authenticated);
  if (!authenticated) return;

  elements.scriptUrl.value = settings.scriptUrl || "";
  elements.spreadsheetId.value = settings.spreadsheetId || "";
  elements.apiSecret.value = settings.apiSecret || "";
  elements.newAdminPassword.value = "";
  renderGroupsEditor();
}

function renderGroupsEditor() {
  elements.groupsEditor.innerHTML = "";

  settings.groups.forEach((group, groupIndex) => {
    const fragment = elements.groupTemplate.content.cloneNode(true);
    const article = fragment.querySelector(".group-editor");
    const groupNameInput = fragment.querySelector(".group-name-input");
    const employeesEditor = fragment.querySelector(".employees-editor");
    const removeGroup = fragment.querySelector(".remove-group");
    const addEmployee = fragment.querySelector(".add-employee");

    article.dataset.groupId = group.id;
    groupNameInput.value = group.name;
    groupNameInput.addEventListener("input", (event) => {
      settings.groups[groupIndex].name = event.target.value;
    });

    removeGroup.addEventListener("click", () => {
      settings.groups.splice(groupIndex, 1);
      renderGroupsEditor();
      renderFront();
    });

    addEmployee.addEventListener("click", () => {
      settings.groups[groupIndex].employees.push({ id: crypto.randomUUID(), name: "新しい社員" });
      renderGroupsEditor();
      renderFront();
    });

    group.employees.forEach((employee, employeeIndex) => {
      const row = document.createElement("div");
      row.className = "employee-row";
      row.innerHTML = `
        <label class="field">
          <span>社員名</span>
          <input type="text" value="${escapeHtml(employee.name)}" />
        </label>
        <button class="danger-button" type="button">削除</button>
      `;
      const input = row.querySelector("input");
      const removeButton = row.querySelector("button");
      input.addEventListener("input", (event) => {
        settings.groups[groupIndex].employees[employeeIndex].name = event.target.value;
      });
      removeButton.addEventListener("click", () => {
        settings.groups[groupIndex].employees.splice(employeeIndex, 1);
        renderGroupsEditor();
        renderFront();
      });
      employeesEditor.append(row);
    });

    elements.groupsEditor.append(fragment);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  elements.clockIn.addEventListener("click", () => recordAttendance("clockIn"));
  elements.clockOut.addEventListener("click", () => recordAttendance("clockOut"));
  window.addEventListener("hashchange", route);

  elements.loginButton.addEventListener("click", () => {
    if (elements.passwordInput.value === settings.adminPassword) {
      sessionStorage.setItem(SESSION_KEY, "true");
      elements.passwordInput.value = "";
      elements.loginError.textContent = "";
      renderAdmin();
      return;
    }
    elements.loginError.textContent = "パスワードが違います。";
  });

  elements.addGroup.addEventListener("click", () => {
    settings.groups.push({ id: crypto.randomUUID(), name: "新しいグループ", employees: [] });
    renderGroupsEditor();
    renderFront();
  });

  elements.saveSettings.addEventListener("click", () => {
    settings.scriptUrl = elements.scriptUrl.value.trim();
    settings.spreadsheetId = elements.spreadsheetId.value.trim();
    settings.apiSecret = elements.apiSecret.value;
    if (elements.newAdminPassword.value.trim()) {
      settings.adminPassword = elements.newAdminPassword.value.trim();
    }
    saveSettingsToStorage();
    renderFront();
    renderAdmin();
    showStatus("管理画面の設定を保存しました。");
  });

  elements.resetSettings.addEventListener("click", () => {
    if (!confirm("初期設定に戻しますか？現在の社員設定は削除されます。")) return;
    settings = cloneSettings(defaultSettings);
    saveSettingsToStorage();
    selectedEmployee = null;
    renderFront();
    renderAdmin();
  });

  elements.adminLogout.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    renderAdmin();
  });
}

updateClock();
setInterval(updateClock, 1000);
bindEvents();
renderFront();
route();
