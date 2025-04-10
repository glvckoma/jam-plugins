# Buddy List Logger Plugin for Animal Jam Classic

This plugin automatically logs your buddy list usernames to a file named `buddy_list_log.txt` located in the `data` directory.

## How It Works

The plugin hooks into the Animal Jam Classic network traffic to capture buddy list information. It listens for the following packets:

*   `bl`: This packet contains the initial buddy list and is usually loaded when you log in or when you open your buddy list in the game.
*   `ba`: This packet is sent when a new buddy is added to your list.
*   `bon`: This packet is sent when a buddy comes online.

The plugin extracts the usernames from these packets and logs them to the `buddy_list_log.txt` file, along with a timestamp and the buddy's status (online/offline).

## Usage

1.  Install the plugin by placing the `buddyListLogger` folder in the `plugins` directory of your Jam installation. 
2. You will move the buddyListLogger folder inside of (C:\Users\*your name*\AppData\Local\Programs\jam\plugins) if you are using the .exe to run jam.
3.  The plugin will automatically start logging buddy usernames to `data/buddy_list_log.txt`.
4.  Use the `!buddylog` command in the Jam console to toggle the logging on or off.
    *   `!buddylog on` or `!buddylog enable`: Enables buddy list logging.
    *   `!buddylog off` or `!buddylog disable`: Disables buddy list logging.
    *   `!buddylog status`: Displays the current logging status.
5.  Use the `!buddylogclear` command to clear the session log. This will allow the plugin to log the same buddies again in the current session.

## Important Notes

*   The buddy list is not always loaded immediately upon login. Sometimes, you need to open your buddy list in the game for the plugin to capture the initial list.
*   The plugin uses a separate ignore list file (`buddy_list_dont_log.txt`) located in the `data` directory. Usernames added to this file will not be logged.
*   The plugin only logs usernames that are not already in the `buddy_list_dont_log.txt` file and have not been logged in the current session.
*   The status of buddies (online/offline) is also logged. A status of `1` indicates online, while `0` indicates offline.

## Configuration

*   `buddy_list_log.txt`: This file contains the logged buddy usernames, timestamps, and status.
*   `buddy_list_dont_log.txt`: This file contains a list of usernames that should not be logged. Add one username per line.

## Author

Glockoma
