# Changelog

All notable user-visible changes to [route-gpx](https://route-gpx.t00ls.dev/) are documented in this file, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). Internal changes (CI, dependencies, tests and repository documentation) are not listed.

The site is deployed from `main` after every merge, so entries under Unreleased are already live; a release gives them a version. The [What's new](https://route-gpx.t00ls.dev/changelog.html) page (`changelog.html`) shows the same entries in English and Portuguese and must stay in sync with this file.

## [Unreleased]

### Added

- Navigate, on phones: follow the route on screen with your live position, the next turn and its road, the turn after it, the remaining distance and time and the arrival time, on a map that turns with your direction of travel, or with the compass, corrected to true north, when you stop, and keeps the screen on; Resume navigation returns from the whole-route view. A short safety notice shows when navigation starts and can be turned off, also in Settings. Your location is watched only until Stop, pauses while the page is hidden and is never stored or sent; without map tiles the route and your position still show.
- After one visit with a connection, the app opens without one in the same browser: saved routes open, show their summary and directions and download as GPX, with a notice that you are offline; map tiles, routing, search, weather, elevation and surface still need a connection.
- Surface in the route summary: how much of the route is paved or unpaved, the unpaved stretches to check, each shown on the map when selected, and a Surface route coloring in Map layers; the route's road attributes are requested from Valhalla only on these choices.
- Elevation marks the highest and lowest points of the route on the map with their altitude while it is open, and Elevation here in the map point menu shows the approximate altitude of any point, requested only on that choice.
- Grade route coloring, in Map layers: descents in blue, flat stretches in gray and climbs in orange and red, with a color scale marking −8%, −3%, +3% and +8% in the legend; it requests the route's elevation only when chosen, and none for files with recorded elevation.
- Weather on the map, in Map layers › Route marks, hides or shows the weather icons and wind arrows on the map, remembered on the device; the weather cards stay in the panel.
- On roads the route uses both ways, weather cards say Outbound or Return, and the return markers sit beside the outbound ones instead of on top of them.

### Changed

- In Portuguese, the address of the app, Help and What's new ends in ?lang=pt, so a shared address opens in that language.
- Help moved from the header to the bottom of the route panel, beside What's new and GitHub, each with its icon; Settings has a gear icon, and the line about public servers left the panel (Help describes them).

- Editing route points keeps the map where it is instead of zooming out to the whole route after each change; Fit route frames the whole route, and opening a link, file or saved route still frames it.
- Weather is also sampled just past sharp bends of the route, using points left free under the maximum of 20, so the headwind, tailwind or crosswind follows the new direction.
- Consecutive weather samples with the same conditions share one card and one map marker, with time, distance and value ranges; the start, stops and destination keep their own cards.
- Distance units (km or mi) and the new temperature units (°C or °F, with rain in mm or in) are chosen in Settings, start as Automatic from the device's time zone or, when it names no place, the browser's language region, and are remembered on the device; route links and saved routes no longer carry units.
- On phones, the status message shows only at the top of the route panel, up to two lines, and Calculate route takes the full width of its row.
- The Departure label sits above its field, and the automatic option is labeled Automatic departure.

### Removed

- The Halfway point route mark, the ½ badge at the middle of the route.

### Fixed

- On touch screens, tapping Download GPX before the route is ready no longer makes it look available.
- Screen readers announce each point's search results as a named group, and on phones the route panel no longer jumps down while the page loads.
- Weather icons no longer pile up when the map is zoomed out: icons that would cover each other show as one (the worst alert among them, otherwise a start, stop or destination, otherwise the worst weather) with a +N count of the others, bordered in red when they include alerts; tapping the count or zooming in shows them all.
- The wind badge on map weather markers shows the whole speed beside its unit, for example 99.9 km/h; longer speeds overlapped the unit.
- Weather samples are spaced evenly between route points, so a sample no longer lands a few hundred metres from a stop or the destination and repeats its card; a weather card keeps its date and time on one line, even on the narrowest phones (a range ending the next day shows +1), with the distance on the next line and the alert level as a tab on its top border.
- The weather note "Weather sampled at N of M stops" no longer appears when every route point has a card; it counted the samples between stops as stops.
- On phones, selecting a weather marker on the map no longer scrolls the whole planner up, hiding the top of the map under the address bar and leaving a blank band at the bottom.
- On phones, the arrival shows the time on one line, with the date below it when it is on another day, and Add stop, Reverse and Round trip stay on one row.
- On the narrowest phones, Set on map shows only its pin instead of a cut-off label.
- Zooming with one finger (tap, then touch again and drag) no longer makes the map disappear for a moment.
- On phones, the map credits button stays visible above the route panel; only the full-height panel hides it.
- The English map hint reads as a sentence, for example Set the start on the map.
- Weather card temperature and precipitation use the language's number format (24,1 °C in Portuguese), and the card shows conditions, temperature and rain on separate lines, with rain labeled (for example Rain 13% · 0.2 mm).
- A UV alert on a weather card shows on its UV line as a range up to the worst hour around the passage, for example UV 7–8 · Very high, instead of a separate warning next to a lower value.

## [1.0.0] - 2026-11-11

### Added

- Route planning with start, destination and stops from addresses, coordinates, a map click or long press, or your location, with place suggestions while typing and search with Enter.
- Route editing: move and reorder points, reverse the route, add a return trip, undo changes and lock the route against accidental edits. ([#57](https://github.com/t00ls-dev/route-gpx/pull/57))
- Routing along real roads with OSRM and a Valhalla fallback, with a Prefer main roads option.
- A route summary with distance, time and arrival from your own average speed, kept on this device, in kilometers or miles. ([#60](https://github.com/t00ls-dev/route-gpx/pull/60), [#67](https://github.com/t00ls-dev/route-gpx/pull/67))
- An automatic departure at the next half hour, or a departure you choose. ([#78](https://github.com/t00ls-dev/route-gpx/pull/78))
- An itinerary with turn directions, also for imported tracks and earlier saved routes, requested only when it is opened. ([#77](https://github.com/t00ls-dev/route-gpx/pull/77), [#81](https://github.com/t00ls-dev/route-gpx/pull/81))
- Weather along the route for the departure: conditions, wind relative to the route, UV index and risk alerts, on routes with any number of points. ([#68](https://github.com/t00ls-dev/route-gpx/pull/68), [#76](https://github.com/t00ls-dev/route-gpx/pull/76))
- An elevation profile with gain, loss and the climbs along the route. ([#72](https://github.com/t00ls-dev/route-gpx/pull/72), [#79](https://github.com/t00ls-dev/route-gpx/pull/79))
- Daylight along the route: sunrise, sunset and the distance travelled in the dark, also shown as a route coloring. ([#59](https://github.com/t00ls-dev/route-gpx/pull/59), [#70](https://github.com/t00ls-dev/route-gpx/pull/70))
- Travel the route: a cursor that plays along the track with distance and passage time. ([#69](https://github.com/t00ls-dev/route-gpx/pull/69))
- Map layers: standard, topographic and satellite maps, with direction arrows, out-and-back lines and the halfway point on the route. ([#71](https://github.com/t00ls-dev/route-gpx/pull/71))
- GPX, FIT and TCX import; editing a point of an imported track recalculates only the changed legs. ([#17](https://github.com/t00ls-dev/route-gpx/pull/17), [#75](https://github.com/t00ls-dev/route-gpx/pull/75))
- GPX 1.1 export with the complete track and named waypoints.
- Short share links; a link that suggests other routing or search servers opens with the default servers until you choose to use them. ([#10](https://github.com/t00ls-dev/route-gpx/pull/10), [#13](https://github.com/t00ls-dev/route-gpx/pull/13))
- Named routes saved in this browser, with backup export and import.
- A side panel on wide screens and a bottom sheet on phones, with one-finger zoom on touch screens. ([#82](https://github.com/t00ls-dev/route-gpx/pull/82), [#63](https://github.com/t00ls-dev/route-gpx/pull/63))
- English and Portuguese interface, a help page and a What's new page. ([#83](https://github.com/t00ls-dev/route-gpx/issues/83))

[Unreleased]: https://github.com/t00ls-dev/route-gpx/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/t00ls-dev/route-gpx/releases/tag/v1.0.0
