# Buddy List Logger Plugin for Animal Jam Classic

This simple plugin automatically logs your buddy list usernames to a text file. Once installed, it will help you keep track of all your buddies in Animal Jam Classic.

## How to Use

1. Install the plugin by placing the `buddyListLogger` folder in the `plugins` directory of your Jam installation.
2. The plugin is turned off by default. To start logging buddies, type `!buddylog on` in the Jam console.
3. Available commands:
   * `!buddylog on`: Turns buddy logging on
   * `!buddylog off`: Turns buddy logging off
   * `!buddylog`: Toggles logging on/off
   * `!buddylogpath C:\path\to\folder`: Changes where log files are saved

## Where Files Are Saved

By default, the plugin saves log files in these locations:

* If the `data` folder exists in your Jam installation, files are saved there
* If the `data` folder doesn't exist, files are saved to your Desktop
* You can choose a different folder using the `!buddylogpath` command

## Important Notes

* The buddy list is not always loaded right when you log in. You might need to open your buddy list in the game for the plugin to capture all your buddies.
* Each buddy is only logged once to prevent duplicate entries.
* The plugin creates two files:
  * `buddy_list_log.txt`: Contains your logged buddies with timestamps
  * `buddy_list_dont_log.txt`: Keeps track of which buddies have already been logged

## Understanding the Log File

Each entry in the log file includes:
* Date and time when the buddy was logged
* Buddy's username
* Buddy's status (0 = online, 1 = offline)

Example:
```
2025-04-10T16:25:00.000Z - BuddyName - 0
```
This means BuddyName was online when logged on April 10, 2025.

## Author

Cline
