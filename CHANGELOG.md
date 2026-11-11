# Changelog

All notable user-visible changes to [route-gpx](https://route-gpx.t00ls.dev/) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Changes accumulate under **Unreleased** until a release gives them a version and a date. The live site is deployed from `main` after every merge, so Unreleased entries are already live. Internal changes (CI, dependencies, tests and repository documentation) are not listed.

Site users read the same entries, in English and Portuguese, on the [What's new](https://route-gpx.t00ls.dev/changelog.html) page (`changelog.html`). Keep both in sync: a pull request with a user-visible change adds its entry here and in both languages of `changelog.html`, in the same release and section.

## [Unreleased]

### Added

- The route planner: route points from addresses, coordinates or the map, OSRM routing with a Valhalla fallback, complete GPX export, English and Portuguese interface, distance units, average speed, undo, share links, a local library of named routes with backups, map layers including satellite imagery, place suggestions while typing and a separate help page.
- A What's new page with the user-visible changes, linked from the route panel footer and the help page. ([#83](https://github.com/t00ls-dev/route-gpx/issues/83))
- Turn directions for imported tracks and for routes saved before turn details existed, requested only when the Itinerary is opened; the track itself never changes. ([#81](https://github.com/t00ls-dev/route-gpx/pull/81))
- Climbs along the route in Elevation: start, length, gain, average and steepest grade and passage time. ([#79](https://github.com/t00ls-dev/route-gpx/pull/79))
- Automatic departure at the next half hour, so weather, arrival and daylight are ready without choosing a time. ([#78](https://github.com/t00ls-dev/route-gpx/pull/78))
- Turn arrows and maneuver text in the Itinerary. ([#77](https://github.com/t00ls-dev/route-gpx/pull/77))
- FIT and TCX import alongside GPX. ([#75](https://github.com/t00ls-dev/route-gpx/pull/75))
- An elevation profile with total gain and loss. ([#72](https://github.com/t00ls-dev/route-gpx/pull/72))
- Direction arrows, out-and-back sections drawn as parallel lines and the halfway point on the route. ([#71](https://github.com/t00ls-dev/route-gpx/pull/71))
- Route coloring by daylight, chosen in Map layers. ([#70](https://github.com/t00ls-dev/route-gpx/pull/70))
- Travel the route: a cursor that plays along the track with distance and passage time. ([#69](https://github.com/t00ls-dev/route-gpx/pull/69))
- UV index on weather cards, with alerts for very high and extreme UV. ([#68](https://github.com/t00ls-dev/route-gpx/pull/68))
- One-finger zoom on touch screens: tap, then touch again and drag. ([#63](https://github.com/t00ls-dev/route-gpx/pull/63))
- Daylight along the route: sunrise, sunset and distance driven in the dark. ([#59](https://github.com/t00ls-dev/route-gpx/pull/59))
- An edit lock that protects the route from accidental changes. ([#57](https://github.com/t00ls-dev/route-gpx/pull/57))
- Shorter route links that messaging apps make clickable; older links still open. ([#10](https://github.com/t00ls-dev/route-gpx/pull/10))
- Weather along the route for the chosen departure.

### Changed

- New planner layout: a side panel on wide screens and a bottom sheet with three heights on phones, a fixed bar with Download GPX and Copy link, trip options available before a route exists and settings in a dialog. ([#82](https://github.com/t00ls-dev/route-gpx/pull/82))
- Weather works on routes with more than 20 points, sampling start, destination and evenly spread stops. ([#76](https://github.com/t00ls-dev/route-gpx/pull/76))
- Time, arrival, weather and daylight always use your average speed, a setting kept on this device. ([#67](https://github.com/t00ls-dev/route-gpx/pull/67))
- The route summary shows distance, time and arrival first. ([#60](https://github.com/t00ls-dev/route-gpx/pull/60))
- Editing a point of an imported track recalculates only the changed legs. ([#17](https://github.com/t00ls-dev/route-gpx/pull/17))
- Links that suggest other routing or search servers open with the default servers until you choose to use them. ([#13](https://github.com/t00ls-dev/route-gpx/pull/13))
- Remaining interface messages are translated into Portuguese. ([#56](https://github.com/t00ls-dev/route-gpx/pull/56))

### Removed

- The rain radar layer; weather stays along the route. ([#58](https://github.com/t00ls-dev/route-gpx/pull/58))

### Fixed

- A long press on the map no longer opens the browser's copy or image menu on phones. ([#62](https://github.com/t00ls-dev/route-gpx/pull/62))
- Settings with one invalid server no longer apply the others, and undo restores the right track after two similar imports. ([#12](https://github.com/t00ls-dev/route-gpx/pull/12))
- The chosen language is kept across the logo link, undo and reload. ([#1](https://github.com/t00ls-dev/route-gpx/pull/1))

[Unreleased]: https://github.com/t00ls-dev/route-gpx/commits/main
