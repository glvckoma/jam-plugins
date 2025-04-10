const fs = require('fs');
const path = require('path');

// Define file paths relative to the project root directory (where Jam is run from)
const baseDataPath = path.resolve(process.cwd(), 'data');
const buddyListLogPath = path.join(baseDataPath, 'buddy_list_log.txt');
// Use a separate ignore file for this plugin
const ignoredUsernamesPath = path.join(baseDataPath, 'buddy_list_dont_log.txt'); 

// Helper function for delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = function ({ application, dispatch }) {
  // Plugin state
  let isLoggingEnabled = true;
  const loggedBuddiesThisSession = new Set();
  const ignoredUsernames = new Set();

  /**
   * Reads ignore list file synchronously and populates the ignoredUsernames set.
   */
  const loadIgnoreList = () => {
    try {
      if (fs.existsSync(ignoredUsernamesPath)) {
        const data = fs.readFileSync(ignoredUsernamesPath, 'utf8');
        let loadedCount = 0;
        
        data.split(/\r?\n/).forEach(username => {
          if (username.trim()) {
            ignoredUsernames.add(username.trim().toLowerCase());
            loadedCount++;
          }
        });
        
        application.consoleMessage({
          type: 'logger',
          message: `[Buddy List Logger] Loaded ${loadedCount} usernames from buddy_list_dont_log.txt.`
        });
      } else {
        application.consoleMessage({
          type: 'logger',
          message: '[Buddy List Logger] buddy_list_dont_log.txt not found. All buddies will be logged.'
        });
      }
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error loading ignore list: ${error.message}`
      });
    }
  };

  /**
   * Logs a buddy username to the log file.
   * @param {string} username - The username to log.
   * @param {string} [status='online'] - The buddy's status.
   */
  const logBuddy = (username, status = 'online') => {
    if (!isLoggingEnabled) return;
    
    const usernameLower = username.toLowerCase();
    
    // Skip if username is in ignore list or already logged this session
    if (ignoredUsernames.has(usernameLower) || loggedBuddiesThisSession.has(usernameLower)) {
      return;
    }
    
    // Add to session log to prevent duplicates
    loggedBuddiesThisSession.add(usernameLower);
    
    // Log to console
    application.consoleMessage({
      type: 'success',
      message: `[Buddy List Logger] Logged buddy: ${username} (${status})`
    });
    
    // Append to log file with timestamp
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${username} - ${status}\n`;
    
    fs.promises.appendFile(buddyListLogPath, logEntry)
      .catch(err => {
        application.consoleMessage({
          type: 'error',
          message: `[Buddy List Logger] Error writing to log file: ${err.message}`
        });
      });
  };

  /**
   * Handles the 'bl' message to extract and log buddy usernames.
   * @param {object} params - The message parameters.
   * @param {string} params.type - Should be 'aj' for this message.
   * @param {object} params.message - The parsed message object (XtMessage).
   */
  const handleBuddyList = ({ type, message }) => {
    if (!isLoggingEnabled || message.constructor.name !== 'XtMessage') return;

    const rawContent = message.toMessage();
    const parts = rawContent.split('%');

    // Expected format: %xt%bl%-1%0%count?%dbId?%username%uuid%status%worldId%roomId?%...
    if (parts.length >= 6 && parts[1] === 'xt' && parts[2] === 'bl' && parts[4] === '0') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let currentIndex = 5; // Start searching after the header + '0' indicator

      while (currentIndex < parts.length) {
        let uuidIndex = -1;
        // Find the next UUID starting from currentIndex
        for (let j = currentIndex; j < parts.length; j++) {
          if (parts[j] && uuidRegex.test(parts[j])) {
            uuidIndex = j;
            break;
          }
        }

        if (uuidIndex === -1) {
          // No more UUIDs found
          break;
        }

        // Check if there's a part immediately before the UUID (username) and after the UUID (status)
        if (uuidIndex > currentIndex) {
          const username = parts[uuidIndex - 1];
          const status = parts[uuidIndex + 1] || 'unknown';
          
          // Validate: not empty, not purely numeric, not another UUID
          if (username && !/^\d+$/.test(username) && !uuidRegex.test(username)) {
            logBuddy(username, status);
          }
        }

        // Advance the index to start searching *after* the current UUID
        currentIndex = uuidIndex + 1;
      }
    }
  };

  /**
   * Handles the 'ba' message (buddy added) to log newly added buddies.
   * @param {object} params - The message parameters.
   * @param {string} params.type - Should be 'aj' for this message.
   * @param {object} params.message - The parsed message object (XtMessage).
   */
  const handleBuddyAdded = ({ type, message }) => {
    if (!isLoggingEnabled || message.constructor.name !== 'XtMessage') return;

    const rawContent = message.toMessage();
    const parts = rawContent.split('%');

    // Expected format: %xt%ba%INTERNAL_ID%username%uuid%status%...
    if (parts.length >= 7 && parts[1] === 'xt' && parts[2] === 'ba') {
      const username = parts[4];
      const status = parts[6] || 'online';
      
      if (username) {
        logBuddy(username, status);
      }
    }
  };

  /**
   * Handles the 'bon' message (buddy online) to log buddies coming online.
   * @param {object} params - The message parameters.
   * @param {string} params.type - Should be 'aj' for this message.
   * @param {object} params.message - The parsed message object (XtMessage).
   */
  const handleBuddyOnline = ({ type, message }) => {
    if (!isLoggingEnabled || message.constructor.name !== 'XtMessage') return;

    const rawContent = message.toMessage();
    const parts = rawContent.split('%');

    // Expected format: %xt%bon%INTERNAL_ID%username%...
    if (parts.length >= 5 && parts[1] === 'xt' && parts[2] === 'bon') {
      const username = parts[4];
      
      if (username) {
        logBuddy(username, 'online');
      }
    }
  };

  /**
   * Toggles buddy list logging on/off.
   * @param {object} params - Command parameters.
   * @param {string[]} params.parameters - Command arguments.
   */
  const handleLogCommand = ({ parameters }) => {
    if (parameters.length > 0) {
      const action = parameters[0].toLowerCase();
      
      if (action === 'on' || action === 'enable') {
        isLoggingEnabled = true;
        application.consoleMessage({
          type: 'success',
          message: '[Buddy List Logger] Logging enabled.'
        });
      } else if (action === 'off' || action === 'disable') {
        isLoggingEnabled = false;
        application.consoleMessage({
          type: 'notify',
          message: '[Buddy List Logger] Logging disabled.'
        });
      } else if (action === 'status') {
        application.consoleMessage({
          type: 'logger',
          message: `[Buddy List Logger] Status: ${isLoggingEnabled ? 'Enabled' : 'Disabled'}`
        });
      } else {
        application.consoleMessage({
          type: 'warn',
          message: '[Buddy List Logger] Invalid command. Use !buddylog on/off/status'
        });
      }
    } else {
      // Toggle if no parameter provided
      isLoggingEnabled = !isLoggingEnabled;
      application.consoleMessage({
        type: isLoggingEnabled ? 'success' : 'notify',
        message: `[Buddy List Logger] Logging ${isLoggingEnabled ? 'enabled' : 'disabled'}.`
      });
    }
  };

  /**
   * Clears the session log to allow re-logging of buddies.
   * @param {object} params - Command parameters.
   * @param {string[]} params.parameters - Command arguments.
   */
  const handleClearCommand = ({ parameters }) => {
    loggedBuddiesThisSession.clear();
    application.consoleMessage({
      type: 'success',
      message: '[Buddy List Logger] Session log cleared. Buddies will be logged again on next buddy list update.'
    });
  };

  // Register commands
  dispatch.onCommand({
    name: 'buddylog',
    description: 'Toggles buddy list logging. Usage: !buddylog [on|off|status]',
    callback: handleLogCommand
  });

  dispatch.onCommand({
    name: 'buddylogclear',
    description: 'Clears the session log to allow re-logging of buddies.',
    callback: handleClearCommand
  });

  // Register message hooks
  dispatch.onMessage({
    type: 'aj',
    message: 'bl',
    callback: handleBuddyList
  });

  dispatch.onMessage({
    type: 'aj',
    message: 'ba',
    callback: handleBuddyAdded
  });

  dispatch.onMessage({
    type: 'aj',
    message: 'bon',
    callback: handleBuddyOnline
  });

  // Initialize
  loadIgnoreList();
  
  // Ensure data directory exists
  if (!fs.existsSync(baseDataPath)) {
    try {
      fs.mkdirSync(baseDataPath, { recursive: true });
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error creating data directory: ${error.message}`
      });
    }
  }

  application.consoleMessage({
    type: 'success',
    message: 'Buddy List Logger plugin loaded. Use !buddylog to toggle logging.'
  });
};
