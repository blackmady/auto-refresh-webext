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
      reopenTabOption: "Reopen tab & continue refresh",
      minIntervalLabel: "Min:", // Shorter label
      maxIntervalLabel: "Max:", // Shorter label
      unitSeconds: "s",
      unitMinutes: "m",
      unitHours: "h",
      everyLabelSeconds: " (every {0}-{1}s)", // For display when unit is seconds
      everyLabelMinutes: " (every {0}-{1}m)", // For display when unit is minutes
      everyLabelHours: " (every {0}-{1}h)",   // For display when unit is hours
      statusAwaitingReopen: "(Closed - Awaiting Reopen)",
      statusClosedWillDelete: "(Closed - Will be Deleted)"

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
      reopenTabOption: "重新打开标签页并继续刷新",
      minIntervalLabel: "最小:", // Shorter label
      maxIntervalLabel: "最大:", // Shorter label
      unitSeconds: "秒",
      unitMinutes: "分",
      unitHours: "时",
      everyLabelSeconds: " (每 {0}-{1}秒)",
      everyLabelMinutes: " (每 {0}-{1}分)",
      everyLabelHours: " (每 {0}-{1}时)",
      statusAwaitingReopen: "(已关闭 - 等待重开)",
      statusClosedWillDelete: "(已关闭 - 将被删除)"
    }
  };

  let currentLang = 'en';
    let currentReopenSetting = false; 

    function getText(key, ...args) {
        // ... (getText function remains the same) ...
        let text = translations[currentLang][key] || translations['en'][key] || key;
        if (args.length > 0) {
            args.forEach((arg, index) => {
                text = text.replace(`{${index}}`, arg);
            });
        }
        return text;
    }

    function applyTranslations() {
        // ... (applyTranslations function needs to update new unit select options) ...
        document.querySelectorAll('[data-lang-key]').forEach(el => {
            if (el.tagName === 'OPTION') { // Handle option elements
                el.textContent = getText(el.dataset.langKey);
            } else {
                el.textContent = getText(el.dataset.langKey);
            }
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
        // Ensure these are called to re-render with correct text
        updateCurrentTabControls(true); 
        updateTaskList(true); 
    }
    
    const languageToggleButton = document.getElementById('languageToggle');
    // ... (languageToggle event listener remains the same) ...
    if (languageToggleButton) {
        languageToggleButton.addEventListener('click', () => {
            currentLang = (currentLang === 'en') ? 'zh' : 'en';
            chrome.storage.local.set({ preferredLang: currentLang }); 
            applyTranslations(); 
            updateCurrentTabControls(true); 
            updateTaskList(true);       
        });
    }
    
    // --- Reopen Setting Elements & Logic ---
    // ... (Reopen setting logic remains the same) ...
    const reopenDeleteRadio = document.getElementById('reopenDelete');
    const reopenReopenRadio = document.getElementById('reopenReopen');

    async function loadAndApplyReopenSetting() {
        const response = await chrome.runtime.sendMessage({ type: "GET_REOPEN_SETTING" });
        if (response && typeof response.reopenSetting === 'boolean') {
            currentReopenSetting = response.reopenSetting; 
            if (response.reopenSetting) {
                reopenReopenRadio.checked = true;
            } else {
                reopenDeleteRadio.checked = true;
            }
        }
    }

    function handleReopenSettingChange() {
        const shouldReopen = reopenReopenRadio.checked;
        currentReopenSetting = shouldReopen; 
        chrome.runtime.sendMessage({ type: "UPDATE_REOPEN_SETTING", reopen: shouldReopen });
        updateTaskList(true); 
    }

    if (reopenDeleteRadio && reopenReopenRadio) {
        reopenDeleteRadio.addEventListener('change', handleReopenSettingChange);
        reopenReopenRadio.addEventListener('change', handleReopenSettingChange);
    }

    // --- Interval Input Elements & Logic ---
    const minInput = document.getElementById('minInterval');
    const maxInput = document.getElementById('maxInterval');
    const minUnitSelect = document.getElementById('minIntervalUnit');
    const maxUnitSelect = document.getElementById('maxIntervalUnit');

    const SECONDS_IN_MINUTE = 60;
    const SECONDS_IN_HOUR = 3600;

    function getIntervalInSeconds(valueInput, unitSelect) {
        const value = parseInt(valueInput.value);
        const unit = unitSelect.value;
        if (isNaN(value) || value <= 0) return null; // Invalid input

        switch (unit) {
            case 'minutes': return value * SECONDS_IN_MINUTE;
            case 'hours': return value * SECONDS_IN_HOUR;
            case 'seconds':
            default: return value;
        }
    }

    function displayInterval(seconds, valueInput, unitSelect) {
        if (seconds === null || seconds === undefined) {
            valueInput.value = ''; // Or a default
            unitSelect.value = 'seconds';
            return;
        }
        const unit = unitSelect.value; // Use current unit for display conversion
        switch (unit) {
            case 'minutes':
                valueInput.value = Math.round(seconds / SECONDS_IN_MINUTE);
                break;
            case 'hours':
                valueInput.value = Math.round(seconds / SECONDS_IN_HOUR);
                break;
            case 'seconds':
            default:
                valueInput.value = seconds;
                break;
        }
    }
    
    // Focus to select all text
    minInput.addEventListener('focus', function() { this.select(); });
    maxInput.addEventListener('focus', function() { this.select(); });

    // Min input changes -> potentially update max
    minInput.addEventListener('input', () => {
        const minSeconds = getIntervalInSeconds(minInput, minUnitSelect);
        const maxSeconds = getIntervalInSeconds(maxInput, maxUnitSelect);

        if (minSeconds !== null && (maxSeconds === null || maxSeconds < minSeconds)) {
            // If max is less than min, or max is invalid, set max to be same as min (in max's current unit)
            let newMaxValue;
            switch (maxUnitSelect.value) {
                case 'minutes': newMaxValue = Math.round(minSeconds / SECONDS_IN_MINUTE); break;
                case 'hours':   newMaxValue = Math.round(minSeconds / SECONDS_IN_HOUR);   break;
                default:        newMaxValue = minSeconds; break;
            }
            maxInput.value = Math.max(1, newMaxValue); // Ensure it's at least 1
        }
    });
    // When min unit changes, re-evaluate if max needs to sync
    minUnitSelect.addEventListener('change', () => {
        minInput.dispatchEvent(new Event('input')); // Trigger the input event on minInput
        // Save unit preference
        saveCurrentTabIntervalUnits();
    });
    maxUnitSelect.addEventListener('change', () => {
        // Save unit preference
        saveCurrentTabIntervalUnits();
    });


    // --- Rest of the script (element getters, functions, event listeners) ---
    const toggleRefreshButton = document.getElementById('toggleRefreshButton');
    // ... (other element getters for currentTabStatusDiv, etc.)
    const currentTabStatusDiv = document.getElementById('currentTabStatus');
    const currentTabIdDisplay = document.getElementById('currentTabIdDisplay');
    const currentTabTitleDisplay = document.getElementById('currentTabTitle');
    const taskListDiv = document.getElementById('taskList');
    const noTasksMessage = document.getElementById('noTasksMessage'); 
    const activeTaskCountSpan = document.getElementById('activeTaskCount');

    let countdownIntervals = {}; 

    function formatTime(ms) { /* ... same ... */ 
      if (ms <= 0) return "00:00";
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    function clearAllCountdowns() { /* ... same ... */ 
      for (const tabId in countdownIntervals) {
        clearInterval(countdownIntervals[tabId]);
      }
      countdownIntervals = {};
    }

    function getTaskIntervalDisplay(minSec, maxSec) {
        // For task list, always display in a smart way (e.g., seconds, or minutes if large)
        // This is a simplified version, you might want more sophisticated unit conversion for display
        if (maxSec < SECONDS_IN_MINUTE * 2 && minSec < SECONDS_IN_MINUTE * 2) {
            return getText('everyLabelSeconds', minSec, maxSec);
        } else if (maxSec < SECONDS_IN_HOUR * 2 && minSec < SECONDS_IN_HOUR * 2) {
            return getText('everyLabelMinutes', Math.round(minSec/SECONDS_IN_MINUTE), Math.round(maxSec/SECONDS_IN_MINUTE));
        } else {
            return getText('everyLabelHours', Math.round(minSec/SECONDS_IN_HOUR), Math.round(maxSec/SECONDS_IN_HOUR));
        }
    }


    async function updateTaskList(forceTextUpdate = false) {
      // ... (updateTaskList logic largely same, but uses getTaskIntervalDisplay) ...
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
          // ... (title and URL span setup)
          titleSpan.className = 'task-title';
          titleSpan.textContent = task.title || `Tab ID: ${task.tabId}`;
          titleSpan.title = task.title || `Tab ID: ${task.tabId}`;
          taskInfo.appendChild(titleSpan);

          if (task.url) {
            const urlSpan = document.createElement('span');
            urlSpan.className = 'task-url';
            urlSpan.textContent = task.url;
            urlSpan.title = task.url; 
            taskInfo.appendChild(urlSpan);
          }


          const detailsSpan = document.createElement('span');
          detailsSpan.className = 'task-details';
          const countdownSpan = document.createElement('span');
          countdownSpan.className = 'task-countdown';
          
          detailsSpan.textContent = getText('nextInLabel');
          detailsSpan.appendChild(countdownSpan);
          // Use new display function for interval
          detailsSpan.append(getTaskIntervalDisplay(task.minInterval, task.maxInterval)); // minInterval/maxInterval are in seconds from background

           if (task.statusNote) { /* ... statusNote ... */ }
           taskInfo.appendChild(detailsSpan);

          if (task.isClosed) { /* ... isClosed display ... */ 
              const closedStatusSpan = document.createElement('span');
              closedStatusSpan.style.color = 'orange';
              closedStatusSpan.style.fontSize = '0.8em';
              closedStatusSpan.style.display = 'block';
              closedStatusSpan.style.marginTop = '2px';
              closedStatusSpan.textContent = getText(currentReopenSetting ? 'statusAwaitingReopen' : 'statusClosedWillDelete');
              taskInfo.appendChild(closedStatusSpan);
          }

          const deleteTaskButton = document.createElement('button');
          // ... (deleteTaskButton setup)
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
          // ... (countdown logic)
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
      } else { /* ... no tasks display ... */ 
        if (forceTextUpdate || noTasksMessage.textContent !== getText('noTasks')) {
             noTasksMessage.textContent = getText('noTasks'); 
        }
        noTasksMessage.style.display = 'block'; 
      }
    }

    async function saveCurrentTabIntervalUnits(tabId) {
        if (!tabId) return;
        const storageKeyMinUnit = `tab_${tabId}_minUnit`;
        const storageKeyMaxUnit = `tab_${tabId}_maxUnit`;
        await chrome.storage.local.set({
            [storageKeyMinUnit]: minUnitSelect.value,
            [storageKeyMaxUnit]: maxUnitSelect.value
        });
    }
    
    async function loadCurrentTabIntervalUnits(tabId) {
        if (!tabId) { // Default if no tabId (e.g. popup opened on non-tab page)
            minUnitSelect.value = 'seconds';
            maxUnitSelect.value = 'seconds';
            return;
        }
        const storageKeyMinUnit = `tab_${tabId}_minUnit`;
        const storageKeyMaxUnit = `tab_${tabId}_maxUnit`;
        const units = await chrome.storage.local.get([storageKeyMinUnit, storageKeyMaxUnit]);
        minUnitSelect.value = units[storageKeyMinUnit] || 'seconds';
        maxUnitSelect.value = units[storageKeyMaxUnit] || 'seconds';
    }


    async function updateCurrentTabControls(forceTextUpdate = false) {
      let localCurrentTab = null;
      // ... (Querying tab text update)
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
      } catch (e) { /* ... error handling ... */ }

      if (!localCurrentTab || !localCurrentTab.id) {
        // ... (handling no active tab, disable inputs) ...
        minInput.disabled = true; maxInput.disabled = true;
        minUnitSelect.disabled = true; maxUnitSelect.disabled = true;
        // ... (rest of no active tab UI update)
        currentTabStatusDiv.textContent = getText('statusErrorTabInfo');
        toggleRefreshButton.disabled = true;
        const naText = getText('statusTabNA');
        if (forceTextUpdate || currentTabTitleDisplay.title !== naText) currentTabTitleDisplay.title = naText;
        currentTabTitleDisplay.textContent = naText;
        currentTabIdDisplay.textContent = naText;
        
        toggleRefreshButton.textContent = getText(toggleRefreshButton.dataset.langKeyEnable || 'enableRefresh');
        toggleRefreshButton.classList.remove('enabled');
        return null;
      }

      currentTabIdDisplay.textContent = `ID: ${localCurrentTab.id}`;
      // ... (update tab title display) ...
      currentTabTitleDisplay.textContent = localCurrentTab.title || "Untitled Tab";
      currentTabTitleDisplay.title = localCurrentTab.title || "Untitled Tab"; 

      minInput.disabled = false; maxInput.disabled = false;
      minUnitSelect.disabled = false; maxUnitSelect.disabled = false;

      // Load saved units for this tab
      await loadCurrentTabIntervalUnits(localCurrentTab.id);

      // Load saved interval values (these are always in seconds in storage)
      const storageKeyMin = `tab_${localCurrentTab.id}_minSec`; // Store as seconds
      const storageKeyMax = `tab_${localCurrentTab.id}_maxSec`;
      const savedSettings = await chrome.storage.local.get([storageKeyMin, storageKeyMax]);
      
      // Display them using the loaded/current units
      displayInterval(savedSettings[storageKeyMin] || 60, minInput, minUnitSelect);
      displayInterval(savedSettings[storageKeyMax] || 120, maxInput, maxUnitSelect);


      const response = await chrome.runtime.sendMessage({ type: "GET_STATUS", tabId: localCurrentTab.id });
      
      if (response && response.isRefreshing) {
        // If refreshing, display the actual refreshing intervals (from background, in seconds)
        // converted to current units
        displayInterval(response.minInterval, minInput, minUnitSelect);
        displayInterval(response.maxInterval, maxInput, maxUnitSelect);
        
        toggleRefreshButton.textContent = getText(toggleRefreshButton.dataset.langKeyDisable || 'disableRefresh'); 
        // ... (rest of refreshing state UI update)
        toggleRefreshButton.classList.add('enabled');
        toggleRefreshButton.disabled = false;
        
        let statusText = getText('statusRefreshing', formatTime(response.timeLeft), response.minInterval, response.maxInterval); // Display interval in seconds here for status
        if (response.statusNote) statusText += getText('statusRescheduling');
        if (response.isClosed) { 
            statusText += ` ${getText(currentReopenSetting ? 'statusAwaitingReopen' : 'statusClosedWillDelete')}`;
        }
        currentTabStatusDiv.textContent = statusText;

      } else {
        // Not refreshing, values from storage (already displayed) are fine.
        toggleRefreshButton.textContent = getText(toggleRefreshButton.dataset.langKeyEnable || 'enableRefresh'); 
        // ... (rest of idle state UI update)
        toggleRefreshButton.classList.remove('enabled');
        toggleRefreshButton.disabled = false;
        currentTabStatusDiv.textContent = getText('statusIdle');
      }
      return localCurrentTab;
    }
    
    toggleRefreshButton.addEventListener('click', async () => {
      let tabToOperateOn = null;
      // ... (get active tab) ...
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
          tabToOperateOn = activeTab;
        }
      } catch (e) { /* ... error ... */ }

      if (!tabToOperateOn) { /* ... error UI ... */ return; }
      toggleRefreshButton.disabled = false;

      const minSeconds = getIntervalInSeconds(minInput, minUnitSelect);
      const maxSeconds = getIntervalInSeconds(maxInput, maxUnitSelect);

      if (minSeconds === null || maxSeconds === null || minSeconds > maxSeconds) {
        currentTabStatusDiv.textContent = getText('statusErrorInvalidInterval');
        return;
      }
      
      // Save interval values (as seconds) and units to storage
      const storageKeyMinSec = `tab_${tabToOperateOn.id}_minSec`;
      const storageKeyMaxSec = `tab_${tabToOperateOn.id}_maxSec`;
      await chrome.storage.local.set({
          [storageKeyMinSec]: minSeconds,
          [storageKeyMaxSec]: maxSeconds
      });
      await saveCurrentTabIntervalUnits(tabToOperateOn.id); // Save current units


      const currentStatus = await chrome.runtime.sendMessage({ type: "GET_STATUS", tabId: tabToOperateOn.id });

      if (currentStatus.isRefreshing) {
        await chrome.runtime.sendMessage({ type: "STOP_REFRESH", tabId: tabToOperateOn.id });
      } else {
        await chrome.runtime.sendMessage({
          type: "START_REFRESH",
          tabId: tabToOperateOn.id,
          minInterval: minSeconds, // Send seconds to background
          maxInterval: maxSeconds, // Send seconds to background
          tabTitle: tabToOperateOn.title || "Untitled Tab",
          tabUrl: tabToOperateOn.url 
        });
      }
      await updateCurrentTabControls(); 
      await updateTaskList();
    });
  
    // --- Initialization ---
    (async () => { 
        const langResult = await new Promise(resolve => chrome.storage.local.get('preferredLang', resolve));
        if (langResult.preferredLang) currentLang = langResult.preferredLang;
        
        await loadAndApplyReopenSetting(); 
        applyTranslations(); // Applies translations and calls update functions

        // The initial calls to update controls/list are good here,
        // as applyTranslations might not have all data (like tabId for units) fully ready.
        await updateCurrentTabControls(); 
        await updateTaskList();
    })();
});