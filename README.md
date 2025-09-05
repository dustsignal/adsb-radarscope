# ADSB Radarscope

ADSB Radarscope is a self-contained, browser-based ADS-B virtual radar display. It's a single HTML file that fetches aircraft data from a ```tar1090``` (or ```dump1090-fa```) instance and renders it on a classic, round radar scope. It requires no server-side backend, libraries, or complex setup—just a web browser and a source for aircraft data.

> [!TIP]
> Putting `adsb-radar.html` on your feeder in a directory accessable through a browser = 😃
> 
> Simply opening `adsb-radar.html` on your desktop = 😭

> [!NOTE]
> There are bugs, there are undocumented features that trigger on specific conditions, it's release 1 and you may need to figure things out on your own to get it working for your specific setup. Read the entire README.md because you are most likly hiting the CORS roadblock.

![Screenshot of ADSB Scope.](/assets/adsb-scope.webp) 
![Screenshot of ADSB Scope Light Mode.](/assets/adsb-scope-light.webp)

## Key Features

* **Almost Zero Installation:** Runs entirely in your web browser from a single HTML file. Set a few configuration variables and simply drop the file in your ```tar1090``` / ```skyaware``` / `any-browser-accessable-folder-on-your-feeder` folder.
* **Highly Customizable:**
  * 13 UI themes (light and dark modes).
  * 50 radar scope color themes.
* **Real-Time Tracking:** Fetches and displays aircraft data every 2 seconds.
* **Responsive UI:** Features resizable side panels that can be hidden to maximize the scope view.
* **Informative Display:** Includes panels for a sorted aircraft list, key metrics, and on-scope flight details.
* **Keyboard Shortcuts:** Control range, pause, filter aircraft, and access help with simple key presses.

## Getting Started

Using ADSB Radarscope is simple. All you need is a running instance of an ADS-B decoder that provides an ```aircraft.json``` file, such as ```tar1090``` or ```dump1090-fa```.

### Setup

1. **Download:** Save the ```adsb-radar.html``` file to your computer.
2. **Edit Configuration:** Open the ```adsb-radar.html``` file in a text editor and find the ```Configuration``` section within the ```<script>``` starting at `line 307`.
3. 
   ```javascript
   // --- Configuration ---
   const VERSION = "0.1.7-gamma.b";
   const TAR1090_URL = "data/aircraft.json"; // <-- EDIT THIS
   const HOME_LAT = 00.00000;                // <-- EDIT THIS
   const HOME_LON = -00.00000;                // <-- EDIT THIS
   ```
4. **Set Data Source:** Change the `TAR1090_URL` to the URL of your `aircraft.json` file.
   * If ```adsb-radar.html``` is hosted on the same server as ```tar1090``` (or `dump1090-fa`), you can use a relative path like ```/tar1090/data/aircraft.json``` or ```/run/dump1090-fa/aircraft.json```.
   * If you are accessing a ```tar1090``` or ```dump1090-fa``` instance on your local network, use its full URL (e.g., ```http://192.168.1.100/tar1090/data/aircraft.json``` or `http://192.168.1.100/run/dump1090-fa/aircraft.json`), you may encounter CORS errors at this point depending on your specific setup.
> [!CAUTION]
> **If the adsb-radar.html file is on a different domain / computer / device than your feeder, you may encounter CORS (Cross-Origin Resource Sharing) errors and only the UI will load. The server hosting ```aircraft.json``` must be configured to allow requests from the domain/device/IP/network/point in the space time contiunum where you are loading ```adsb-radar.html``` to load the data from the json file. Or you can try using the CORS extension for Chrome**

4. **Set Home Location:** Change `HOME_LAT` and `HOME_LON` to your latitude and longitude. This sets the center of the radar scope.
5. **UPLOAD!:** Put `adsb-radar.html` on your feeder.
   * For tar1090: `/usr/local/share/tar1090/html`
   * For dump1090-fa: `/usr/share/skyaware/html`
7. **Launch:** Open the modified ```adsb-radar.html``` file in any modern web browser from the feeder (e.g., ```http://192.168.1.100/tar1090/adsb-radar.html``` or 'http://192.168.1.100/skyaware/adsb-radar.html`)..

## Usage

The interface is designed to be intuitive and informative.

* **Side Panels:** The left panel shows a list of all tracked aircraft, sorted by distance. The right panel displays live metrics and a list of keyboard shortcuts. Both panels can be resized by dragging their borders or hidden completely with the ```Hide Panels``` button.
* **Theme Selection:** Use the ```UI Theme``` and ```Scope Theme``` buttons in the top-right to customize the look and feel.
* **Aircraft Details:** Click on an aircraft on the scope to view its raw data in a popup.

### Keyboard Shortcuts

| Key               | Action                               |
| ----------------- | ------------------------------------ |
| ` H `              | Show/Hide the Help modal             |
| ` Space `          | Pause/Resume the radar sweep         |
| ` + ` / `- `         | Zoom the radar range in or out       |
| ` M `               | Cycle through filters (All/Mil/Civ)  |
| ` Right Click ` on Target | View detailed aircraft data          |

## How It Works

ADSB Scope is built with vanilla JavaScript, HTML, and Tailwind CSS (via a CDN) to keep it simple and portable.

1. **Data Fetching:** A `fetch` request is made every 2 seconds to the URL specified in `TAR1090_URL`.
2. **Data Processing:** The received JSON data is processed to update the state of tracked aircraft, including their position, altitude, speed, and heading.
3. **Rendering Loop:** A `requestAnimationFrame` loop continuously redraws the HTML5 canvas:
   * It draws the static scope grid, range rings, and degree markers.
   * It plots each aircraft's position, heading vector, and data tag.
   * It animates the rotating sweep line and its trailing fade effect.
4. **UI Updates:** The aircraft list and metrics panels are updated at a slightly slower interval to optimize performance.

## Customization

You can easily add your own themes.

* **UI Themes:** To add a new UI theme, add a new theme object to the `UI_THEMES` array and define its colors by adding a new `:root[data-ui-theme="your-theme-key"]` block in the `<style>` section.
* **Scope Themes:** To add a new scope theme, find the `tailwind.config` object and add a new color palette object within `theme.extend.colors`. Then, add a corresponding entry to the `SCOPE_THEMES` array.

## Known Issues

- [ ] Does not work with some versions of dump1090-fa, investigating.
- [x] ~~Scope is distorted when adjusting side panels~~
- [ ] Aircraft are not highlighed on the scope when clicking on them in the left side panel
- [ ] Aircraft tracks become distorted when resizing the window
- [ ] Aircraft tracks become distorted when changing the range
- [ ] Aircraft tracks become distorted when resizing the side panels

## Future Enhancements

- [ ] Runtime logic to search for aircraft.json in known locations instead of the config setting
- [ ] Grabing the lat/lon from your feeder instead of the config setting
- [ ] Change the heading indicator line to an arrow
- [ ] Set minimum width for side panels
- [ ] Add heading and sqawk code to aircraft info in the scope
- [ ] Add airport markers and information to the scope view
- [ ] Add weather radar to the scope view

## License

This project is licensed under the GNU General Public License v3.0.

Copyright (C) 2025 dustsignal
