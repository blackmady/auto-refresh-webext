document.addEventListener('DOMContentLoaded', async () => {
  // --- Language & i18n Setup ---
  const translations = {
      en: {
          title: "Tab Auto Refresher",
          currentTabHeader: "Current Tab",
          queryingTab: "Querying tab...",
          minIntervalLabel: "Min (s):",
          maxIntervalLabel: "Max (s):",
          enableRefresh: "Enable Refresh for This Tab",
          disableRefresh: "Disable Refresh for This Tab",
          statusIdle: "Status: Idle for this tab.",
          statusRefreshing: "Status: Refreshing. Next: {0} (every {1}-{2}s)", 
          statusRescheduling: " (Rescheduling...)",
          activeTasksHeader: "Active Refresh Tasks",
          noTasks: "No active refresh tasks.",
          nextInLabel: "Next in: ",
          everyLabel: " (every {0}-{1}s)", 
          deleteButton: "Delete",
          refreshingStatus: "Refreshing...",
          dueRefreshingStatus: "Due / Refreshing...",
          statusTabNA: "N/A",
          statusErrorTabInfo: "Status: Could not get current tab info.",
          statusErrorAction: "Error: Could not identify current tab for action.",
          statusErrorNoTabAction: "Error: No active tab found for action.",
          statusErrorInvalidInterval: "Status: Invalid min/max values (min <= max, both > 0).",
          settingsHeader: "Settings",
          onTabCloseLabel: "When a monitored tab is closed:",
          deleteTaskOption: "Delete refresh task",
          reopenTabOption: "Reopen tab & continue refresh"
      },
      zh: {
          title: "标签页自动刷新器",
          currentTabHeader: "当前标签页",
          queryingTab: "查询标签页中...",
          minIntervalLabel: "最小 (秒):",
          maxIntervalLabel: "最大 (秒):",
          enableRefresh: "为此标签页启用刷新",
          disableRefresh: "为此标签页禁用刷新",
          statusIdle: "状态: 此标签页空闲",
          statusRefreshing: "状态: 刷新中. 下次: {0} (每 {1}-{2}秒)",
          statusRescheduling: " (重新计划中...)",
          activeTasksHeader: "活动刷新任务",
          noTasks: "没有活动的刷新任务。",
          nextInLabel: "下次刷新: ",
          everyLabel: " (每 {0}-{1}秒)",
          deleteButton: "删除",
          refreshingStatus: "刷新中...",
          dueRefreshingStatus: "即将 / 刷新中...",
          statusTabNA: "不可用",
          statusErrorTabInfo: "状态: 无法获取当前标签页信息。",
          statusErrorAction: "错误: 无法识别当前标签页以执行操作。",
          statusErrorNoTabAction: "错误: 未找到活动标签页以执行操作。",
          statusErrorInvalidInterval: "状态: 无效的最小/最大值 (最小 <= 最大, 均 > 0)。",
          settingsHeader: "设置",
          onTabCloseLabel: "当受监控的标签页关闭时:",
          deleteTaskOption: "删除刷新任务",
          reopenTabOption: "重新打开标签页并继续刷新"
      }
  };

  let currentLang = 'en'; 

  function getText(key, ...args) {
      let text = translations[currentLang][key] || translations['en'][key] || key;
      if (args.length > 0) {
          args.forEach((arg, index) => {
              text = text.replace(`{${index}}`, arg);
          });
      }
      return text;
  }

  function applyTranslations() {
      document.querySelectorAll('[data-lang-key]').forEach(el => {
          el.textContent = getText(el.dataset.langKey);
      });
      document.querySelectorAll('[data-lang-title-key]').forEach(el => {
          el.title = getText(el.dataset.langTitleKey);
      });
      const toggleBtn = document.getElementById('toggleRefreshButton');
      if (toggleBtn) {
          if (toggleBtn.classList.contains('enabled')) {
              toggleBtn.textContent = getText(toggleBtn.dataset.langKeyDisable || 'disableRefresh');
          } else {
              toggleBtn.textContent = getText(toggleBtn.dataset.langKeyEnable || 'enableRefresh');
          }
      }
      document.querySelectorAll('.delete-task-button').forEach(btn => {
          btn.textContent = getText('deleteButton');
      });
      updateCurrentTabControls(true); 
      updateTaskList(true); 
  }
  
  const languageToggleButton = document.getElementById('languageToggle');
  if (languageToggleButton) {
      languageToggleButton.addEventListener('click', () => {
          currentLang = (currentLang === 'en') ? 'zh' : 'en';
          chrome.storage.local.set({ preferredLang: currentLang }); 
          applyTranslations();
      });
  }
  
  // --- Reopen Setting Elements ---
  const reopenDeleteRadio = document.getElementById('reopenDelete');
  const reopenReopenRadio = document.getElementById('reopenReopen');

  async function loadAndApplyReopenSetting() {
      const response = await chrome.runtime.sendMessage({ type: "GET_REOPEN_SETTING" });
      if (response && typeof response.reopenSetting === 'boolean') {
          if (response.reopenSetting) {
              reopenReopenRadio.checked = true;
          } else {
              reopenDeleteRadio.checked = true;
          }
      }
  }

  function handleReopenSettingChange() {
      const shouldReopen = reopenReopenRadio.checked;
      chrome.runtime.sendMessage({ type: "UPDATE_REOPEN_SETTING", reopen: shouldReopen });
  }

  if (reopenDeleteRadio && reopenReopenRadio) {
      reopenDeleteRadio.addEventListener('change', handleReopenSettingChange);
      reopenReopenRadio.addEventListener('change', handleReopenSettingChange);
  }
  // --- End Reopen Setting ---

  // --- End Language & i18n Setup ---

  const minInput = document.getElementById('minInterval');
  const maxInput = document.getElementById('maxInterval');
  const toggleRefreshButton = document.getElementById('toggleRefreshButton');
  const currentTabStatusDiv = document.getElementById('currentTabStatus');
  const currentTabIdDisplay = document.getElementById('currentTabIdDisplay');
  const currentTabTitleDisplay = document.getElementById('currentTabTitle');
  const taskListDiv = document.getElementById('taskList');
  const noTasksMessage = document.getElementById('noTasksMessage'); 
  const activeTaskCountSpan = document.getElementById('activeTaskCount');

  let countdownIntervals = {}; 

  function formatTime(ms) {
    if (ms <= 0) return "00:00";
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function clearAllCountdowns() {
    for (const tabId in countdownIntervals) {
      clearInterval(countdownIntervals[tabId]);
    }
    countdownIntervals = {};
  }

  async function updateTaskList(forceTextUpdate = false) {
    clearAllCountdowns();
    const itemsToRemove = [];
    for (const child of taskListDiv.children) {
        if (child.id !== 'noTasksMessage' && child.classList.contains('task-item')) {
            itemsToRemove.push(child);
        }
    }
    itemsToRemove.forEach(item => taskListDiv.removeChild(item));

    const response = await chrome.runtime.sendMessage({ type: "GET_ALL_REFRESHERS" });
    const tasks = response.tasks || [];
    activeTaskCountSpan.textContent = tasks.length;

    if (tasks.length > 0) {
      noTasksMessage.style.display = 'none'; 
      tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'task-item'; 
        item.dataset.tabId = task.tabId;

        const taskInfo = document.createElement('div');
        taskInfo.className = 'task-info';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'task-title';
        titleSpan.textContent = task.title || `Tab ID: ${task.tabId}`;
        titleSpan.title = task.title || `Tab ID: ${task.tabId}`;
        taskInfo.appendChild(titleSpan);

        // Display URL
        if (task.url) {
          const urlSpan = document.createElement('span');
          urlSpan.className = 'task-url';
          urlSpan.textContent = task.url;
          urlSpan.title = task.url; // Show full URL on hover
          taskInfo.appendChild(urlSpan);
        }

        const detailsSpan = document.createElement('span');
        detailsSpan.className = 'task-details';
        const countdownSpan = document.createElement('span');
        countdownSpan.className = 'task-countdown';
        
        detailsSpan.textContent = getText('nextInLabel');
        detailsSpan.appendChild(countdownSpan);
        detailsSpan.append(getText('everyLabel', task.minInterval, task.maxInterval));

         if (task.statusNote) { 
            const noteSpan = document.createElement('span');
            noteSpan.style.fontSize = '0.9em';
            noteSpan.style.marginLeft = '5px';
            noteSpan.style.color = '#777';
            noteSpan.textContent = `(${getText('statusRescheduling').trim()})`; 
            detailsSpan.appendChild(noteSpan);
        }
        taskInfo.appendChild(detailsSpan);


        const deleteTaskButton = document.createElement('button');
        deleteTaskButton.className = 'delete-task-button';
        deleteTaskButton.textContent = getText('deleteButton');
        deleteTaskButton.addEventListener('click', async (e) => {
          e.stopPropagation();
          await chrome.runtime.sendMessage({ type: "STOP_REFRESH", tabId: task.tabId });
          await updateTaskList(); 
          await updateCurrentTabControls();
        });

        item.appendChild(taskInfo);
        item.appendChild(deleteTaskButton);
        taskListDiv.appendChild(item); 

        let remainingTime = task.timeLeft;
        countdownSpan.textContent = formatTime(remainingTime);

        if (remainingTime > 0) {
            countdownIntervals[task.tabId] = setInterval(async () => {
            remainingTime -= 1000;
            if (remainingTime < 0) {
                countdownSpan.textContent = getText('refreshingStatus');
                clearInterval(countdownIntervals[task.tabId]);
                setTimeout(async () => {
                    await updateTaskList();
                    await updateCurrentTabControls();
                }, 2500);
                return;
            }
            countdownSpan.textContent = formatTime(remainingTime);
            }, 1000);
        } else {
             countdownSpan.textContent = getText('dueRefreshingStatus');
        }
      });
    } else {
      if (forceTextUpdate || noTasksMessage.textContent !== getText('noTasks')) {
           noTasksMessage.textContent = getText('noTasks'); 
      }
      noTasksMessage.style.display = 'block'; 
    }
  }

  async function updateCurrentTabControls(forceTextUpdate = false) {
    let localCurrentTab = null;
    const queryingText = getText('queryingTab');
    if(forceTextUpdate || currentTabTitleDisplay.title !== queryingText) currentTabTitleDisplay.title = queryingText;
    currentTabTitleDisplay.textContent = queryingText;
    currentTabIdDisplay.textContent = "";
    toggleRefreshButton.disabled = true; 

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        localCurrentTab = tabs[0];
      }
    } catch (e) {
      console.error("Popup (updateCurrentTabControls): Error querying active tab:", e);
    }

    if (!localCurrentTab || !localCurrentTab.id) {
      currentTabStatusDiv.textContent = getText('statusErrorTabInfo');
      toggleRefreshButton.disabled = true;
      const naText = getText('statusTabNA');
      if (forceTextUpdate || currentTabTitleDisplay.title !== naText) currentTabTitleDisplay.title = naText;
      currentTabTitleDisplay.textContent = naText;
      currentTabIdDisplay.textContent = naText;
      minInput.disabled = true;
      maxInput.disabled = true;
      
      toggleRefreshButton.textContent = getText(toggleRefreshButton.dataset.langKeyEnable || 'enableRefresh');
      toggleRefreshButton.classList.remove('enabled');
      return null;
    }

    currentTabIdDisplay.textContent = `ID: ${localCurrentTab.id}`;
    currentTabTitleDisplay.textContent = localCurrentTab.title || "Untitled Tab";
    currentTabTitleDisplay.title = localCurrentTab.title || "Untitled Tab"; 
    minInput.disabled = false;
    maxInput.disabled = false;

    const storageKeyMin = `tab_${localCurrentTab.id}_min`;
    const storageKeyMax = `tab_${localCurrentTab.id}_max`;
    const savedSettings = await chrome.storage.local.get([storageKeyMin, storageKeyMax]);
    
    minInput.value = savedSettings[storageKeyMin] || 60;
    maxInput.value = savedSettings[storageKeyMax] || 120;

    const response = await chrome.runtime.sendMessage({ type: "GET_STATUS", tabId: localCurrentTab.id });
    
    if (response && response.isRefreshing) {
      minInput.value = response.minInterval;
      maxInput.value = response.maxInterval;
      toggleRefreshButton.textContent = getText(toggleRefreshButton.dataset.langKeyDisable || 'disableRefresh'); 
      toggleRefreshButton.classList.add('enabled');
      toggleRefreshButton.disabled = false;
      
      let statusText = getText('statusRefreshing', formatTime(response.timeLeft), response.minInterval, response.maxInterval);
      if (response.statusNote) statusText += getText('statusRescheduling');
      currentTabStatusDiv.textContent = statusText;
    } else {
      toggleRefreshButton.textContent = getText(toggleRefreshButton.dataset.langKeyEnable || 'enableRefresh'); 
      toggleRefreshButton.classList.remove('enabled');
      toggleRefreshButton.disabled = false;
      currentTabStatusDiv.textContent = getText('statusIdle');
    }
    
    return localCurrentTab;
  }
  
  toggleRefreshButton.addEventListener('click', async () => {
    let tabToOperateOn = null;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id) {
        tabToOperateOn = activeTab;
      }
    } catch (e) {
        console.error("Popup (button click): Error getting active tab:", e);
        currentTabStatusDiv.textContent = getText('statusErrorAction');
        return;
    }

    if (!tabToOperateOn) {
      currentTabStatusDiv.textContent = getText('statusErrorNoTabAction');
      toggleRefreshButton.disabled = true;
      return;
    }
    toggleRefreshButton.disabled = false;

    const min = parseInt(minInput.value);
    const max = parseInt(maxInput.value);

    if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0 || min > max) {
      currentTabStatusDiv.textContent = getText('statusErrorInvalidInterval');
      return;
    }
    
    const storageKeyMin = `tab_${tabToOperateOn.id}_min`;
    const storageKeyMax = `tab_${tabToOperateOn.id}_max`;
    await chrome.storage.local.set({
        [storageKeyMin]: min,
        [storageKeyMax]: max
    });

    const currentStatus = await chrome.runtime.sendMessage({ type: "GET_STATUS", tabId: tabToOperateOn.id });

    if (currentStatus.isRefreshing) {
      await chrome.runtime.sendMessage({
        type: "STOP_REFRESH", 
        tabId: tabToOperateOn.id
      });
    } else {
      await chrome.runtime.sendMessage({
        type: "START_REFRESH",
        tabId: tabToOperateOn.id,
        minInterval: min,
        maxInterval: max,
        tabTitle: tabToOperateOn.title || "Untitled Tab",
        tabUrl: tabToOperateOn.url // Pass current tab's URL
      });
    }
    await updateCurrentTabControls(); 
    await updateTaskList();
  });

  // --- Initialization ---
  chrome.storage.local.get('preferredLang', async (result) => { // made async
      if (result.preferredLang) {
          currentLang = result.preferredLang;
      }
      await loadAndApplyReopenSetting(); // Load reopen setting
      applyTranslations(); 
  });
});