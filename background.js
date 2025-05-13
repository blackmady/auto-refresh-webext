// { tabId: { minInterval, maxInterval, alarmName, tabTitle, url, isClosed } }
const activeRefreshers = {};
const STORAGE_KEY_REOPEN_TABS = 'reopenClosedTabsSetting'; 

let reopenClosedTabs = false; 
chrome.storage.local.get(STORAGE_KEY_REOPEN_TABS, (result) => {
    if (typeof result[STORAGE_KEY_REOPEN_TABS] === 'boolean') {
        reopenClosedTabs = result[STORAGE_KEY_REOPEN_TABS];
    } else {
        chrome.storage.local.set({ [STORAGE_KEY_REOPEN_TABS]: false });
    }
    console.log(`BG: Initial reopenClosedTabs setting: ${reopenClosedTabs}`);
});

// --- Alarm Listener (MAJOR CHANGES HERE) ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const prefix = "refresh-tab-";
  if (!alarm.name.startsWith(prefix)) return;

  const tabId = parseInt(alarm.name.substring(prefix.length));
  const task = activeRefreshers[tabId];

  if (!task) {
    console.log(`BG: Orphan alarm ${alarm.name} fired (no activeRefresher entry). Clearing.`);
    chrome.alarms.clear(alarm.name);
    return;
  }

  console.log(`BG: Alarm triggered for tab ${tabId} ('${task.tabTitle}'). IsClosed: ${task.isClosed}, ReopenSetting: ${reopenClosedTabs}`);

  if (task.isClosed) { // Tab was marked as closed by onRemoved
    if (reopenClosedTabs && task.url && task.url !== 'chrome://newtab/') {
      console.log(`BG: Tab ${tabId} was closed. Reopening URL: ${task.url}`);
      try {
        // IMPORTANT: Clear the old task and alarm for the original tabId first
        const oldTaskDetails = { ...task }; // Keep details for new task
        clearRefresh(tabId); // This deletes activeRefreshers[tabId] and clears alarm by name

        const newTab = await chrome.tabs.create({ url: oldTaskDetails.url, active: false });
        console.log(`BG: Reopened tab ${tabId} as new tab ${newTab.id}.`);

        if (newTab.id) {
          // Start a new refresh task for the new tab
          const newAlarmName = `refresh-tab-${newTab.id}`;
          activeRefreshers[newTab.id] = {
            minInterval: oldTaskDetails.minInterval,
            maxInterval: oldTaskDetails.maxInterval,
            alarmName: newAlarmName,
            tabTitle: oldTaskDetails.tabTitle, // Will be updated by onUpdated
            url: oldTaskDetails.url,
            isClosed: false // New tab is open
          };
          scheduleNextRefresh(newTab.id);
          console.log(`BG: New refresh task started for reopened tab ${newTab.id}.`);
        }
      } catch (error) {
        console.error(`BG: Error reopening tab for URL ${task.url}:`, error);
        // If reopening fails, the old task (for original tabId) should already be cleared by clearRefresh above.
      }
    } else {
      // Not reopening (either setting is off or URL is invalid)
      console.log(`BG: Tab ${tabId} was closed and not configured to reopen (or URL invalid). Deleting task.`);
      clearRefresh(tabId);
    }
  } else { // Tab was NOT marked as closed (or isClosed is undefined/false)
    try {
      const currentTab = await chrome.tabs.get(tabId);
      if (currentTab && !currentTab.discarded) { // Tab still exists and is active
        console.log(`BG: Refreshing currently open tab ${tabId} ('${task.tabTitle}') URL: ${task.url}`);
        if (currentTab.url && task.url !== currentTab.url) {
            task.url = currentTab.url; // Update URL if it changed
        }
        if (currentTab.title && task.tabTitle !== currentTab.title) {
            task.tabTitle = currentTab.title; // Update title
        }
        await chrome.tabs.reload(tabId);
        scheduleNextRefresh(tabId);
      } else {
        // Tab.get succeeded but tab is discarded or somehow invalid - treat as closed
        console.log(`BG: Tab ${tabId} found but discarded or invalid. Treating as closed for reopen logic.`);
        // Simulate the "isClosed" path by calling this function recursively with a modified task might be complex.
        // Simpler: directly apply the reopen/delete logic here.
        // This code block is now similar to the 'if (task.isClosed)' block.
        if (reopenClosedTabs && task.url && task.url !== 'chrome://newtab/') {
            console.log(`BG: Tab ${tabId} was (effectively) closed. Reopening URL: ${task.url}`);
            const oldTaskDetails = { ...task };
            clearRefresh(tabId); 
            const newTab = await chrome.tabs.create({ url: oldTaskDetails.url, active: false });
            if (newTab.id) {
                const newAlarmName = `refresh-tab-${newTab.id}`;
                activeRefreshers[newTab.id] = { ...oldTaskDetails, tabId: newTab.id, alarmName: newAlarmName, isClosed: false };
                scheduleNextRefresh(newTab.id);
            }
        } else {
            console.log(`BG: Tab ${tabId} was (effectively) closed and not configured to reopen. Deleting task.`);
            clearRefresh(tabId);
        }
      }
    } catch (error) {
      // Tab.get failed - tab is definitely gone.
      console.warn(`BG: Tab ${tabId} not found when alarm triggered (error: ${error.message}). Applying reopen/delete logic.`);
      // This code block is now similar to the 'if (task.isClosed)' block.
      if (reopenClosedTabs && task.url && task.url !== 'chrome://newtab/') {
        console.log(`BG: Tab ${tabId} was (definitively) closed. Reopening URL: ${task.url}`);
        const oldTaskDetails = { ...task };
        clearRefresh(tabId); 
        try {
            const newTab = await chrome.tabs.create({ url: oldTaskDetails.url, active: false });
            if (newTab.id) {
                const newAlarmName = `refresh-tab-${newTab.id}`;
                // Create a fresh entry for the new tab
                activeRefreshers[newTab.id] = {
                    minInterval: oldTaskDetails.minInterval,
                    maxInterval: oldTaskDetails.maxInterval,
                    alarmName: newAlarmName,
                    tabTitle: oldTaskDetails.tabTitle,
                    url: oldTaskDetails.url,
                    isClosed: false
                };
                scheduleNextRefresh(newTab.id);
                console.log(`BG: New refresh task started for definitively closed then reopened tab ${newTab.id}.`);
            }
        } catch (reopenError) {
            console.error(`BG: Error reopening definitively closed tab for URL ${task.url}:`, reopenError);
        }
      } else {
        console.log(`BG: Tab ${tabId} was (definitively) closed and not configured to reopen. Deleting task.`);
        clearRefresh(tabId);
      }
    }
  }
});

// --- Tab Event Listeners ---
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (activeRefreshers[tabId]) {
    console.log(`BG: Monitored tab ${tabId} ('${activeRefreshers[tabId].tabTitle}') was removed. Marking as closed.`);
    activeRefreshers[tabId].isClosed = true;
    // DO NOT clear the alarm or activeRefresher entry here. Let the alarm handler decide.
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (activeRefreshers[tabId]) {
    // If a tab that was marked 'isClosed' gets an update (e.g., user navigates to its history, reopens it manually),
    // we should mark it as no longer closed.
    if (activeRefreshers[tabId].isClosed && (changeInfo.status === 'complete' || changeInfo.url)) {
        console.log(`BG: Tab ${tabId} was marked closed but received an update. Marking as open again.`);
        activeRefreshers[tabId].isClosed = false;
    }
    if (changeInfo.title) {
      activeRefreshers[tabId].tabTitle = changeInfo.title;
    }
    if (changeInfo.url && activeRefreshers[tabId].url !== changeInfo.url) {
      activeRefreshers[tabId].url = changeInfo.url;
      console.log(`BG: URL for refreshing tab ${tabId} updated to: ${changeInfo.url}`);
    }
  }
});


// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_REFRESH") {
    const { tabId, minInterval, maxInterval, tabTitle, tabUrl } = request;
    const alarmName = `refresh-tab-${tabId}`;

    if (activeRefreshers[tabId] && activeRefreshers[tabId].alarmName) {
      chrome.alarms.clear(activeRefreshers[tabId].alarmName);
    }
    
    activeRefreshers[tabId] = {
      minInterval: minInterval * 1000,
      maxInterval: maxInterval * 1000,
      alarmName: alarmName,
      tabTitle: tabTitle || "Tab " + tabId,
      url: tabUrl || "chrome://newtab/",
      isClosed: false // Initially, the tab is open
    };
    scheduleNextRefresh(tabId);
    console.log(`BG: START_REFRESH for tab ${tabId}, URL: ${tabUrl}, isClosed: false`);
    sendResponse({ success: true, message: `Refresh started for tab ${tabId}` });
    return true; 

  } else if (request.type === "STOP_REFRESH") { 
    const { tabId } = request;
    console.log(`BG: STOP_REFRESH for tab ${tabId}`);
    clearRefresh(tabId); // This will delete from activeRefreshers and clear alarm
    sendResponse({ success: true, message: `Refresh stopped for tab ${tabId}` });
    return true;

  } else if (request.type === "GET_STATUS") { 
    // ... (no change from previous version of GET_STATUS is strictly needed for this logic change,
    // but ensure it sends 'url' and potentially 'isClosed' if popup needs it)
    const { tabId } = request;
    if (activeRefreshers[tabId] && activeRefreshers[tabId].alarmName) {
      chrome.alarms.get(activeRefreshers[tabId].alarmName, (alarm) => {
        const task = activeRefreshers[tabId];
        const responsePayload = {
            isRefreshing: true,
            minInterval: task.minInterval / 1000,
            maxInterval: task.maxInterval / 1000,
            tabTitle: task.tabTitle,
            url: task.url,
            isClosed: !!task.isClosed // Send isClosed status
        };
        if (alarm) {
            responsePayload.timeLeft = alarm.scheduledTime - Date.now();
        } else {
          console.warn(`BG: GET_STATUS: Alarm ${task.alarmName} for tab ${tabId} not found. Assuming due/rescheduling.`);
          responsePayload.timeLeft = 0; 
          responsePayload.statusNote = "Rescheduling...";
        }
        sendResponse(responsePayload);
      });
      return true; 
    } else {
      sendResponse({ isRefreshing: false }); 
    }
    return false; 

  } else if (request.type === "GET_ALL_REFRESHERS") {
    // ... (no change from previous GET_ALL_REFRESHERS is strictly needed,
    // but ensure it sends 'url' and potentially 'isClosed' if popup needs it)
    (async () => {
      const tasksToPopup = [];
      const currentRefresherTabIds = Object.keys(activeRefreshers).map(id => parseInt(id));

      for (const tabId of currentRefresherTabIds) {
        const refresher = activeRefreshers[tabId];
        if (!refresher || !refresher.alarmName) {
            continue;
        }

        let taskData = {
            tabId: tabId,
            title: refresher.tabTitle,
            minInterval: refresher.minInterval / 1000,
            maxInterval: refresher.maxInterval / 1000,
            url: refresher.url,
            isClosed: !!refresher.isClosed // Send isClosed status
        };

        // No need to call chrome.tabs.get here just for the popup list
        // The isClosed flag should be the source of truth for "closed" status display
        const alarm = await new Promise(resolve => chrome.alarms.get(refresher.alarmName, resolve));

        if (alarm) {
          taskData.timeLeft = alarm.scheduledTime - Date.now();
        } else {
          // If alarm is gone but task exists, it's likely due or just fired.
          // If isClosed is true, it's waiting for the (now non-existent) alarm to reopen.
          // If isClosed is false, it's an odd state, maybe just fired.
          taskData.timeLeft = 0; // Or some indicator it's due
          if (refresher.isClosed) {
            taskData.statusNote = "Awaiting reopen..."; // Or similar
          } else {
            taskData.statusNote = "Rescheduling...";
          }
        }
        tasksToPopup.push(taskData);
      }
      sendResponse({ tasks: tasksToPopup });
    })();
    return true; 
  } else if (request.type === "UPDATE_REOPEN_SETTING") {
    if (typeof request.reopen === 'boolean') {
        reopenClosedTabs = request.reopen;
        chrome.storage.local.set({ [STORAGE_KEY_REOPEN_TABS]: reopenClosedTabs }, () => {
            console.log(`BG: reopenClosedTabs setting updated to: ${reopenClosedTabs}`);
            sendResponse({ success: true, newSetting: reopenClosedTabs });
        });
    } else {
        sendResponse({ success: false, message: "Invalid setting value."});
    }
    return true; 
  } else if (request.type === "GET_REOPEN_SETTING") {
    sendResponse({ reopenSetting: reopenClosedTabs });
    return false;
  }
  return false; 
});

// --- Helper Functions ---
function scheduleNextRefresh(tabId) {
  if (!activeRefreshers[tabId] || activeRefreshers[tabId].isClosed) { // Don't schedule if marked closed
    if(activeRefreshers[tabId] && activeRefreshers[tabId].isClosed) {
        console.log(`BG: Tab ${tabId} is marked closed. Not scheduling next refresh directly. Alarm will handle.`);
    } else {
        console.warn(`BG: Attempted to schedule refresh for non-existent or invalid activeRefresher: ${tabId}`);
    }
    return;
  }

  const { minInterval, maxInterval, alarmName, tabTitle, url } = activeRefreshers[tabId];
  const randomDelayMs = Math.random() * (maxInterval - minInterval) + minInterval;
  const nextScheduledTime = Date.now() + randomDelayMs;

  chrome.alarms.clear(alarmName, (wasCleared) => { // Clear old one if exists
    chrome.alarms.create(alarmName, { when: nextScheduledTime });
    console.log(`BG: Tab ${tabId} ('${tabTitle}', URL: ${url}) next refresh scheduled in ${Math.round(randomDelayMs / 1000)}s (Alarm: ${alarmName})`);
  });
}

function clearRefresh(tabId) {
  if (activeRefreshers[tabId]) {
    const alarmName = activeRefreshers[tabId].alarmName;
    if (alarmName) {
      chrome.alarms.clear(alarmName, (wasCleared) => {
        // console.log(`BG: Alarm ${alarmName} for tab ${tabId} clear attempt: ${wasCleared}`);
      });
    }
    const deletedUrl = activeRefreshers[tabId].url;
    delete activeRefreshers[tabId];
    console.log(`BG: Removed tab ${tabId} (URL: ${deletedUrl}) from active refreshers.`);
  } else {
    // console.log(`BG: clearRefresh called for tab ${tabId}, but no activeRefresher entry found.`);
  }
}