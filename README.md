# ADSB Radarscope

ADSB Radarscope is a self-contained, browser-based ADS-B virtual radar display. It fetches aircraft data from a `tar1090` or `dump1090-fa` instance and renders it on a classic, round radar scope. It requires no server-side backend, libraries, or complex setup—just a web browser and a source for aircraft data.

> [!IMPORTANT]
> v1.0.0 release delayed! With help from some of my fellow ADSB nerd full stack developers a full rewrite of the scope rendering is in progress.
>
> Please use latest version in `testing` for now.


## Known Issues
Please post bug reports in the Discussions or send them to `adsbscope@dustsignal.dev`

### v1.0.0-alpha (please request access if you would like to do testing over enjoying)

- [ ] Scope render code slowly eats memory due to trail history
- [ ] Weather radar API call error
- [ ] Historical playback ocassionaly does not playback when aircraft traffic is dense
- [ ] Historical playback render errors in Firefox and Opera
- [ ] Alerts: Military alert showing GA aircraft - Emergency alerts showing -30000ft/min rapid decents
- [ ] Audio alert with missing alert popup

### v0.9.2 through 0.1.1
- [ ] Range change enables airport, navaid, runway visibilty
- [x] ~~Does not work with some versions of dump1090-fa, investigating~~
- [x] ~~Scope is distorted when adjusting side panels~~
- [x] ~~Aircraft are not highlighed on the scope when clicking on them in the left side panel~~
- [x] ~~Aircraft tracks become distorted when resizing the window~~
- [x] ~~Aircraft tracks become distorted when changing the range~~
- [x] ~~Aircraft tracks become distorted when resizing the side panels~~

## Future Enhancements

- [x] Aircraft labels never overlap
- [ ] Aricraft labels never cover the trail
- [ ] Grabing the lat/lon from your feeder instead of the config setting
- [ ] Change the heading indicator line to an arrow (currently investigating best apporach through FAA icongraphc documentation)
- [x] Set minimum width for side panels
- [x] Add heading and sqawk code to aircraft info in the scope
- [x] Add airport markers and information to the scope view
- [ ] Add weather radar to the scope view
- [ ] Add FAA incongraphic symbols to aircraft. Sourced from FAA icongraphc documentation documents
- [ ] Aircraft icon choices: FAA standard, triangle, dot, dot box

![symbols](assets/ac-symbol.jpg)
      

## License

This project is licensed under the GNU General Public License v3.0.

Copyright © 2025 dustsignal - dustsignal.dev
