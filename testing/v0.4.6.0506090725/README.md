> [!WARNING]
> Next release is several versions ahead of this one. Making this avaiable to those who wish to play around with it and suggest changes.
> **Feature requests to `adsbscope@dustsignal.dev` please.**

> [!NOTE]
> There are two places to set config options now. This is temporary for testing. In the next release it will all be through a popup modal on the page.
> You can change these through the web settings interface.

### Edit config settings first
In `index.html` find `// Default configuration - fallback if external config isn't available` and edit
- **DEFAULT_TAR1090_URL:** "http://[your-ip]/tar1090/data/aircraft.json", // Change to /skyaware/data/aircraft.json for dump1090-fa source
- **DEFAULT_HOME_LAT:** [enter your lat]
- **DEFAULT_HOME_LON:** [enter your lon]
- **DATA_PATHS:** enter the paths to the csv files

In `config.js` edit
- **DEFAULT_TAR1090_URL:** "http://[your-ip]/tar1090/data/aircraft.json", // Change to /skyaware/data/aircraft.json for dump1090-fa source
- **DEFAULT_HOME_LAT:** [enter your lat]
- **DEFAULT_HOME_LON:** [enter your lon]
- **DATA_PATHS:** enter the paths to the csv files

### Upload to your feeder, not your desktop.

Upload everything to a subfolder of the html root called `adsbscope`

Default html roots  
For tar1090: `/usr/local/share/tar1090/html`  
For dump1090-fa: `/usr/share/skyaware/html`  
