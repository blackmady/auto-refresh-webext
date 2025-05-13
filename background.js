const activeRefreshers = {}; // { tabId: { minInterval, maxInterval, alarmName, tabTitle } }

// --- Alarm Listener ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const prefix = "refresh-tab-";
  if (alarm.name.startsWith(prefix)) {
    const tabId = parseInt(alarm.name.substring(prefix.length));

    if (activeRefreshers[tabId]) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && !tab.discarded) {
          console.log(`BG: Refreshing tab ${tabId} ('${activeRefreshers[tabId].tabTitle || tab.title}')`);
          await chrome.tabs.reload(tabId);
          scheduleNextRefresh(tabId); // Reschedule after reload initiated
        } else { 
          console.log(`BG: Tab ${tabId} not found or discarded, stopping refresh.`);
          clearRefresh(tabId);
        }
      } catch (error) { 
        console.warn(`BG: Error refreshing tab ${tabId} (likely closed), stopping refresh:`, error.message);
        clearRefresh(tabId);
      }
    } else {
        console.log(`BG: Orphan alarm ${alarm.name} fired (no activeRefresher entry). Clearing.`);
        chrome.alarms.clear(alarm.name);
    }
  }
});

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_REFRESH") {
    const { tabId, minInterval, maxInterval, tabTitle } = request;
    const alarmName = `refresh-tab-${tabId}`;

    if (activeRefreshers[tabId] && activeRefreshers[tabId].alarmName) {
      chrome.alarms.clear(activeRefreshers[tabId].alarmName);
    }
    
    activeRefreshers[tabId] = {
      minInterval: minInterval * 1000,
      maxInterval: maxInterval * 1000,
      alarmName: alarmName,
      tabTitle: tabTitle || "Tab " + tabId
    };
    scheduleNextRefresh(tabId);
    sendResponse({ success: true, message: `Refresh started for tab ${tabId}` });
    return true; 

  } else if (request.type === "STOP_REFRESH") { // This handles the "Delete" action from UI
    const { tabId } = request;
    clearRefresh(tabId);
    sendResponse({ success: true, message: `Refresh stopped for tab ${tabId}` });
    return true;

  } else if (request.type === "GET_STATUS") { 
    const { tabId } = request;
    if (activeRefreshers[tabId] && activeRefreshers[tabId].alarmName) {
      chrome.alarms.get(activeRefreshers[tabId].alarmName, (alarm) => {
        if (alarm) {
          sendResponse({
            isRefreshing: true,
            minInterval: activeRefreshers[tabId].minInterval / 1000,
            maxInterval: activeRefreshers[tabId].maxInterval / 1000,
            timeLeft: alarm.scheduledTime - Date.now(),
            tabTitle: activeRefreshers[tabId].tabTitle
          });
        } else {
          console.warn(`BG: GET_STATUS: Alarm ${activeRefreshers[tabId].alarmName} for tab ${tabId} not found. Assuming due/rescheduling.`);
          sendResponse({
            isRefreshing: true, 
            minInterval: activeRefreshers[tabId].minInterval / 1000,
            maxInterval: activeRefreshers[tabId].maxInterval / 1000,
            timeLeft: 0, 
            tabTitle: activeRefreshers[tabId].tabTitle,
            statusNote: "Rescheduling..." 
          });
        }
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

        try {
          const tab = await chrome.tabs.get(tabId);
          if (activeRefreshers[tabId]) { 
             activeRefreshers[tabId].tabTitle = tab.title || "Untitled Tab";
          } else {
            continue; 
          }
          
          const alarm = await new Promise(resolve => chrome.alarms.get(refresher.alarmName, resolve));

          if (alarm) {
            tasks.push({
              tabId: tabId,
              title: activeRefreshers[tabId].tabTitle,
              minInterval: refresher.minInterval / 1000,
              maxInterval: refresher.maxInterval / 1000,
              timeLeft: alarm.scheduledTime - Date.now()
            });
          } else {
            console.warn(`BG: GET_ALL_REFRESHERS: No alarm for tab ${tabId} ('${refresher.alarmName}'). Assuming due/rescheduling.`);
            tasks.push({
              tabId: tabId,
              title: activeRefreshers[tabId].tabTitle,
              minInterval: refresher.minInterval / 1000,
              maxInterval: refresher.maxInterval / 1000,
              timeLeft: 0,
              statusNote: "Rescheduling..."
            });
          }
        } catch (error) {
          console.log(`BG: Tab ${tabId} not accessible in GET_ALL_REFRESHERS (likely closed), removing. Error: ${error.message}`);
          clearRefresh(tabId);
        }
      }
      sendResponse({ tasks });
    })();
    return true; 
  }
  return false; 
});

// --- Helper Functions ---
function scheduleNextRefresh(tabId) {
  if (!activeRefreshers[tabId]) {
    console.warn(`BG: Attempted to schedule refresh for non-existent activeRefresher: ${tabId}`);
    return;
  }

  const { minInterval, maxInterval, alarmName, tabTitle } = activeRefreshers[tabId];
  const randomDelayMs = Math.random() * (maxInterval - minInterval) + minInterval;
  const nextScheduledTime = Date.now() + randomDelayMs;

  chrome.alarms.clear(alarmName, (wasCleared) => {
    chrome.alarms.create(alarmName, { when: nextScheduledTime });
    console.log(`BG: Tab ${tabId} ('${tabTitle || 'Untitled'}') next refresh scheduled in ${Math.round(randomDelayMs / 1000)}s (Alarm: ${alarmName})`);
  });
}

function clearRefresh(tabId) {
  if (activeRefreshers[tabId] && activeRefreshers[tabId].alarmName) {
    const alarmName = activeRefreshers[tabId].alarmName;
    chrome.alarms.clear(alarmName, (wasCleared) => {});
  }
  if (activeRefreshers[tabId]) {
    delete activeRefreshers[tabId];
    console.log(`BG: Removed tab ${tabId} from active refreshers.`);
  }
}

// --- Tab Event Listeners ---
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (activeRefreshers[tabId]) {
    console.log(`BG: Tab ${tabId} closed, stopping its refresh task.`);
    clearRefresh(tabId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (activeRefreshers[tabId] && changeInfo.title) {
    activeRefreshers[tabId].tabTitle = changeInfo.title;
  }
});