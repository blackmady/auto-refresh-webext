// { tabId: { minInterval, maxInterval, alarmName, tabTitle, url } }
const activeRefreshers = {};
const STORAGE_KEY_REOPEN_TABS = 'reopenClosedTabsSetting'; // true to reopen, false to delete

// --- Initialization: Load reopen setting from storage ---
let reopenClosedTabs = false; // Default
chrome.storage.local.get(STORAGE_KEY_REOPEN_TABS, (result) => {
    if (typeof result[STORAGE_KEY_REOPEN_TABS] === 'boolean') {
        reopenClosedTabs = result[STORAGE_KEY_REOPEN_TABS];
        console.log(`BG: Initial reopenClosedTabs setting loaded: ${reopenClosedTabs}`);
    } else {
        // If not set, initialize with default (false)
        chrome.storage.local.set({ [STORAGE_KEY_REOPEN_TABS]: false });
        console.log(`BG: reopenClosedTabs setting not found, initialized to: ${reopenClosedTabs}`);
    }
});


// --- Alarm Listener ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const prefix = "refresh-tab-";
  if (alarm.name.startsWith(prefix)) {
    const tabId = parseInt(alarm.name.substring(prefix.length));

    if (activeRefreshers[tabId]) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && !tab.discarded) {
          console.log(`BG: Refreshing tab ${tabId} ('${activeRefreshers[tabId].tabTitle || tab.title}') URL: ${activeRefreshers[tabId].url}`);
          // Ensure URL in activeRefreshers is up-to-date before reload, in case it changed
          if (tab.url && activeRefreshers[tabId].url !== tab.url) {
            activeRefreshers[tabId].url = tab.url;
            console.log(`BG: Updated URL for tab ${tabId} to ${tab.url} before refresh.`);
          }
          await chrome.tabs.reload(tabId);
          scheduleNextRefresh(tabId); 
        } else { 
          console.log(`BG: Tab ${tabId} not found or discarded when alarm fired, attempting configured action.`);
          // Tab is gone, onRemoved listener should handle it based on reopenClosedTabs setting
          // However, if onRemoved didn't catch it (e.g., browser crash then restore without tab), clear here.
          if (!reopenClosedTabs) { // If not reopening, definitely clear. Reopen case handled by onRemoved.
            clearRefresh(tabId);
          } else {
            // If configured to reopen, onRemoved should have ideally handled it.
            // If we reach here and tab is gone, it implies onRemoved might not have run or failed.
            // For safety, if it's set to reopen and the tab is gone, we might try to reopen here too,
            // but this could lead to duplicate reopen attempts if onRemoved also succeeds.
            // The current onRemoved logic is better suited for this.
            // So, if alarm fires and tab is gone, and we are set to reopen, we rely on onRemoved.
            // If onRemoved failed, the task might become orphaned. For now, we clear it if not set to reopen.
            console.log(`BG: Alarm for closed tab ${tabId}, reopen is ${reopenClosedTabs}. Relying on onRemoved or task becomes orphaned.`);
            // To be absolutely safe and prevent orphaned alarms if onRemoved fails AND reopen is true:
            // we could also try to clear the alarm if the tab is truly gone and not coming back.
            // However, the main logic for reopening is in onRemoved.
          }
        }
      } catch (error) { 
        console.warn(`BG: Error during alarm for tab ${tabId} (likely closed). Message: ${error.message}`);
        // Similar to above, onRemoved should handle closure.
        if (!reopenClosedTabs) {
            clearRefresh(tabId);
        }
      }
    } else {
        console.log(`BG: Orphan alarm ${alarm.name} fired (no activeRefresher entry). Clearing.`);
        chrome.alarms.clear(alarm.name);
    }
  }
});

// --- Tab Event Listeners ---
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  if (activeRefreshers[tabId]) {
    const task = { ...activeRefreshers[tabId] }; // Copy task details
    
    console.log(`BG: Monitored tab ${tabId} ('${task.tabTitle}') URL: ${task.url} was removed.`);
    
    // Clear the old task immediately, regardless of reopen setting, to prevent orphaned alarms/entries
    // If reopening, a new task for the new tab will be created.
    clearRefresh(tabId); // Crucial: remove the old tabId's task

    if (reopenClosedTabs && task.url && task.url !== 'chrome://newtab/') {
      console.log(`BG: Configured to reopen. Attempting to reopen URL: ${task.url}`);
      try {
        const newTab = await chrome.tabs.create({ url: task.url, active: false }); // Open in background
        console.log(`BG: Reopened tab ${tabId} as new tab ${newTab.id} with URL ${task.url}.`);
        
        // Start a new refresh task for the new tab with the same parameters
        // Note: The new tab will have a new ID.
        if (newTab.id) {
          console.log(`BG: Starting new refresh task for reopened tab ${newTab.id} with old parameters.`);
          // Send a message to self to start refresh for the new tabId, effectively.
          // Or directly call the logic. Directly calling is cleaner here.
          const newAlarmName = `refresh-tab-${newTab.id}`;
          activeRefreshers[newTab.id] = { // Create new entry for the new tab
            minInterval: task.minInterval, // use original min/max in ms
            maxInterval: task.maxInterval,
            alarmName: newAlarmName,
            tabTitle: task.tabTitle, // Can be updated later by onUpdated
            url: task.url
          };
          scheduleNextRefresh(newTab.id);
        }
      } catch (error) {
        console.error(`BG: Error reopening tab for URL ${task.url}:`, error);
      }
    } else {
      console.log(`BG: Tab ${tabId} closed. Reopen setting is OFF or URL is invalid. Task deleted.`);
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (activeRefreshers[tabId]) {
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
    const { tabId, minInterval, maxInterval, tabTitle, tabUrl } = request; // Expect tabUrl
    const alarmName = `refresh-tab-${tabId}`;

    if (activeRefreshers[tabId] && activeRefreshers[tabId].alarmName) {
      chrome.alarms.clear(activeRefreshers[tabId].alarmName);
    }
    
    activeRefreshers[tabId] = {
      minInterval: minInterval * 1000,
      maxInterval: maxInterval * 1000,
      alarmName: alarmName,
      tabTitle: tabTitle || "Tab " + tabId,
      url: tabUrl || "chrome://newtab/" // Store the URL
    };
    scheduleNextRefresh(tabId);
    console.log(`BG: START_REFRESH for tab ${tabId}, URL: ${tabUrl}`);
    sendResponse({ success: true, message: `Refresh started for tab ${tabId}` });
    return true; 

  } else if (request.type === "STOP_REFRESH") { 
    const { tabId } = request;
    console.log(`BG: STOP_REFRESH for tab ${tabId}`);
    clearRefresh(tabId);
    sendResponse({ success: true, message: `Refresh stopped for tab ${tabId}` });
    return true;

  } else if (request.type === "GET_STATUS") { 
    const { tabId } = request;
    if (activeRefreshers[tabId] && activeRefreshers[tabId].alarmName) {
      chrome.alarms.get(activeRefreshers[tabId].alarmName, (alarm) => {
        const responsePayload = {
            isRefreshing: true,
            minInterval: activeRefreshers[tabId].minInterval / 1000,
            maxInterval: activeRefreshers[tabId].maxInterval / 1000,
            tabTitle: activeRefreshers[tabId].tabTitle,
            url: activeRefreshers[tabId].url // Send URL
        };
        if (alarm) {
            responsePayload.timeLeft = alarm.scheduledTime - Date.now();
        } else {
          console.warn(`BG: GET_STATUS: Alarm ${activeRefreshers[tabId].alarmName} for tab ${tabId} not found. Assuming due/rescheduling.`);
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
    (async () => {
      const tasks = [];
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
            url: refresher.url // Send URL
        };

        try {
          const tab = await chrome.tabs.get(tabId); // Check if tab still exists
          if (activeRefreshers[tabId]) { // Check again, could be cleared by another async op
             activeRefreshers[tabId].tabTitle = tab.title || "Untitled Tab";
             activeRefreshers[tabId].url = tab.url || activeRefreshers[tabId].url; // Update URL if changed
             taskData.title = activeRefreshers[tabId].tabTitle;
             taskData.url = activeRefreshers[tabId].url;
          } else {
            continue; 
          }
          
          const alarm = await new Promise(resolve => chrome.alarms.get(refresher.alarmName, resolve));

          if (alarm) {
            taskData.timeLeft = alarm.scheduledTime - Date.now();
          } else {
            console.warn(`BG: GET_ALL_REFRESHERS: No alarm for tab ${tabId} ('${refresher.alarmName}'). Assuming due/rescheduling.`);
            taskData.timeLeft = 0;
            taskData.statusNote = "Rescheduling...";
          }
          tasks.push(taskData);
        } catch (error) {
          // Tab likely closed. The onRemoved listener should handle this based on settings.
          // If the task is still in activeRefreshers here, it means onRemoved might not have fully processed yet,
          // or it's configured to reopen and the new tab's task hasn't replaced it yet.
          // For GET_ALL_REFRESHERS, we should reflect the *current* state. If the tab is gone, it's gone.
          // The crucial part is that `clearRefresh(tabId)` is called by `onRemoved`.
          console.log(`BG: Tab ${tabId} not accessible in GET_ALL_REFRESHERS (likely closed). Its fate depends on onRemoved logic.`);
          // Do not call clearRefresh here again, as onRemoved is the primary handler for this.
          // Instead, we can filter it out from the list sent to popup if it's truly gone
          // and not just in a transient state of being reopened.
          // For simplicity now, if get fails, we assume it will be handled.
          // If we want to be super accurate, we'd need to ensure onRemoved has finished.
          // A safer approach: if get() fails, don't include it in the list for the popup for now.
          // This task will be cleaned up by onRemoved or subsequent checks.
        }
      }
      sendResponse({ tasks });
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
    return true; // Async due to storage.set
  } else if (request.type === "GET_REOPEN_SETTING") {
    sendResponse({ reopenSetting: reopenClosedTabs });
    // This is sync, but good practice to return true if any path could be async or if unsure.
    // In this specific case, it could be return false;
    return false;
  }
  return false; 
});

// --- Helper Functions ---
function scheduleNextRefresh(tabId) {
  if (!activeRefreshers[tabId]) {
    console.warn(`BG: Attempted to schedule refresh for non-existent activeRefresher: ${tabId}`);
    return;
  }

  const { minInterval, maxInterval, alarmName, tabTitle, url } = activeRefreshers[tabId];
  const randomDelayMs = Math.random() * (maxInterval - minInterval) + minInterval;
  const nextScheduledTime = Date.now() + randomDelayMs;

  chrome.alarms.clear(alarmName, (wasCleared) => {
    chrome.alarms.create(alarmName, { when: nextScheduledTime });
    console.log(`BG: Tab ${tabId} ('${tabTitle || 'Untitled'}', URL: ${url}) next refresh scheduled in ${Math.round(randomDelayMs / 1000)}s (Alarm: ${alarmName})`);
  });
}

function clearRefresh(tabId) {
  if (activeRefreshers[tabId] && activeRefreshers[tabId].alarmName) {
    const alarmName = activeRefreshers[tabId].alarmName;
    chrome.alarms.clear(alarmName, (wasCleared) => {});
  }
  if (activeRefreshers[tabId]) {
    const deletedUrl = activeRefreshers[tabId].url;
    delete activeRefreshers[tabId];
    console.log(`BG: Removed tab ${tabId} (URL: ${deletedUrl}) from active refreshers.`);
  }
}