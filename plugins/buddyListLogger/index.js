const fs = require('fs');
const path = require('path');
const os = require('os'); // Import the os module

// Helper function for delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = function ({ application, dispatch }) {
  // Plugin state
  let isLoggingEnabled = false; // Disabled by default
  let customBasePath = null; // For user-defined log directory
  const loggedBuddiesThisSession = new Set();
  const ignoredUsernames = new Set();
  
  // Configuration file path (relative to the current working directory)
  const configFilePath = path.resolve(process.cwd(), 'plugins', 'buddyListLogger', 'config.json');
  
  /**
   * Loads the plugin configuration from the config file.
   */
  const loadConfig = () => {
    try {
      if (fs.existsSync(configFilePath)) {
        const configData = fs.readFileSync(configFilePath, 'utf8');
        const config = JSON.parse(configData);
        
        if (config.customBasePath) {
          customBasePath = config.customBasePath;
        }
        
        if (config.isLoggingEnabled !== undefined) {
          isLoggingEnabled = config.isLoggingEnabled;
        }
      }
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error loading config: ${error.message}`
      });
    }
  };
  
  /**
   * Saves the plugin configuration to the config file.
   */
  const saveConfig = () => {
    try {
      const config = {
        customBasePath,
        isLoggingEnabled
      };
      
      const configDir = path.dirname(configFilePath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error saving config: ${error.message}`
      });
    }
  };
  
  // Function to determine the base path for log files
  const getBasePath = () => {
    if (customBasePath) {
      return customBasePath;
    }
    
    const defaultDataPath = path.resolve(process.cwd(), 'data');
    const desktopPath = path.join(os.homedir(), 'Desktop');
    
    // Check if data directory exists
    return fs.existsSync(defaultDataPath) ? defaultDataPath : desktopPath;
  };
  
  // Function to get file paths based on current base path
  const getFilePaths = () => {
    const currentBasePath = getBasePath();
    return {
      buddyListLogPath: path.join(currentBasePath, 'buddy_list_log.txt'),
      ignoredUsernamesPath: path.join(currentBasePath, 'buddy_list_dont_log.txt')
    };
  };

  /**
   * Reads ignore list file synchronously and populates the ignoredUsernames set.
   */
  const loadIgnoreList = () => {
    const { ignoredUsernamesPath } = getFilePaths();
    
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
      } else {
        // Create the file if it doesn't exist
        try {
          fs.writeFileSync(ignoredUsernamesPath, '');
        } catch (error) {
          // Silent fail - will be handled elsewhere
        }
      }
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error loading ignore list: ${error.message}`
      });
    }
  };

  /**
   * Logs a buddy username to the log file and adds it to the ignore list.
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
    
    // Add to ignore list to prevent logging in future sessions
    ignoredUsernames.add(usernameLower);
    
    // Log to console
    application.consoleMessage({
      type: 'success',
      message: `[Buddy List Logger] Logged buddy: ${username} (${status})`
    });
    
    // Get current file paths
    const { buddyListLogPath, ignoredUsernamesPath } = getFilePaths();
    
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
      
    // Also append to ignore list file to prevent future logging
    fs.promises.appendFile(ignoredUsernamesPath, `${username}\n`)
      .catch(err => {
        application.consoleMessage({
          type: 'error',
          message: `[Buddy List Logger] Error writing to ignore file: ${err.message}`
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
        saveConfig(); // Save the updated state
      } else if (action === 'off' || action === 'disable') {
        isLoggingEnabled = false;
        application.consoleMessage({
          type: 'notify',
          message: '[Buddy List Logger] Logging disabled.'
        });
        saveConfig(); // Save the updated state
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
      saveConfig(); // Save the updated state
    }
  };

  /**
   * Sets a custom directory for log files.
   * @param {object} params - Command parameters.
   * @param {string[]} params.parameters - Command arguments.
   */
  const handleSetPathCommand = ({ parameters }) => {
    if (parameters.length === 0) {
      application.consoleMessage({
        type: 'warn',
        message: '[Buddy List Logger] Please specify a directory path. Usage: !buddylogpath /path/to/directory'
      });
      return;
    }

    // Join all parameters to handle paths with spaces
    const newPath = parameters.join(' ');
    
    try {
      // Check if the directory exists
      if (!fs.existsSync(newPath)) {
        // Try to create the directory
        fs.mkdirSync(newPath, { recursive: true });
      }
      
      // Set the custom path
      customBasePath = newPath;
      
      // Save the configuration to persist the custom path
      saveConfig();
      
      // Reload the ignore list with the new path
      loadIgnoreList();
      
      application.consoleMessage({
        type: 'success',
        message: `[Buddy List Logger] Log directory set to: ${newPath}`
      });
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error setting log directory: ${error.message}`
      });
    }
  };

  // Register commands
  dispatch.onCommand({
    name: 'buddylog',
    description: 'Toggles buddy list logging. Usage: !buddylog [on|off|status]',
    callback: handleLogCommand
  });

  dispatch.onCommand({
    name: 'buddylogpath',
    description: 'Sets a custom directory for log files. Usage: !buddylogpath /path/to/directory',
    callback: handleSetPathCommand
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
  loadConfig(); // Load configuration first
  loadIgnoreList();

  // Ensure the determined base directory exists
  const basePath = getBasePath();
  const { buddyListLogPath, ignoredUsernamesPath } = getFilePaths();
  
  // Create the base directory if it doesn't exist
  if (!fs.existsSync(basePath)) {
    try {
      fs.mkdirSync(basePath, { recursive: true });
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error creating directory: ${error.message}`
      });
    }
  }
  
  // Create the log files if they don't exist
  if (!fs.existsSync(buddyListLogPath)) {
    try {
      fs.writeFileSync(buddyListLogPath, '');
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error creating log file: ${error.message}`
      });
    }
  }
  
  if (!fs.existsSync(ignoredUsernamesPath)) {
    try {
      fs.writeFileSync(ignoredUsernamesPath, '');
    } catch (error) {
      application.consoleMessage({
        type: 'error',
        message: `[Buddy List Logger] Error creating ignore file: ${error.message}`
      });
    }
  }

  application.consoleMessage({
    type: 'success',
    message: `[Buddy List Logger] Plugin loaded. Logging to: ${basePath}. Logging is ${isLoggingEnabled ? 'enabled' : 'disabled'}. Use !buddylog to toggle logging.`
  });
};
