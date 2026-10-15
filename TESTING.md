# Validation notes

**Version:** 0.1.4 local preview  
**Recorded:** 2026-10-15

This file separates automated checks and observed browser behavior from work that still needs real-world use.

## Automated checks

```sh
npm ci
npm test
npm run check
```

The recorded 0.1.4 run passed **65 tests** and the package checks. Tests use synthetic HTML and mocked Chrome APIs; they do not generate live Scholar traffic.

Coverage includes profile/source parsing, daily and missed-day accounting, incomplete profile coverage, source baselines, traversal expiry, duplicate sources, request throttling, restricted-access pause behavior, stale-tab protection, concurrent writes, and profile switching. Source-list workflows assert that no automatic source requests are made.

Package checks cover Manifest V3, resource paths, JavaScript syntax, and remote runtime-code restrictions.

## Browser observations

| Area | Evidence |
|---|---|
| Popup | Loaded in actual Chrome; the compact 380 × 460 layout shows the main count, history view, and footer controls. |
| Upgrade | Reloaded the existing unpacked installation in place; the bound profile and local records remained available. |
| Public profile access | A successful real Chrome binding/profile visit showed a total matching the Scholar page. An earlier request in the development environment timed out. |
| Local HTML parsing | Actual Chrome under the strict test CSP reported zero violations, zero unexpected resource requests, and no execution of injected script probes. Profile, source, and CAPTCHA fixtures returned the expected results. |
| UI states | Production popup files were also inspected with a test-only Chrome API mock for binding, changes, daily history, source detail, settings, and error states. |

The parsing probe intentionally included styles, scripts, images, frames, and SVG. Version 0.1.3 replaced the raw HTML insertion that had produced inline-style warnings. The security policy was not relaxed. The earlier collapsed-popup and clipped-footer issues were addressed in 0.1.1 and 0.1.2; 0.1.4 made the popup smaller.

The successful profile observation was made before 0.1.4. The 0.1.4 appearance check did not intentionally request Scholar again. A local test is not evidence of a new live fetch.

## Still to verify during the local trial

- Repeated scheduled checks against real Scholar data over a full week.
- Source discovery end to end across two real, complete, unfiltered visits, including list changes between visits.
- Desktop notification delivery under OS notification settings.
- Scheduling after browser shutdown, sleep, and resume.
- Behavior across a wider range of profiles, page layouts, and access restrictions.

CiteLog is an early preview. A successful profile visit does not establish long-term network reliability or complete source attribution. Source lists have not been fetched automatically for testing.

## Useful trial observations

Compare the popup total with the bound Scholar profile after a successful check. Note the time, the popup status, and whether the page was refreshed. For source comparisons, note whether both visits started at the first page, used no filters, and reached the last page within 30 minutes.

Keep the original installation path while updating. When reporting a problem, include versions and reproduction steps, and redact personal details. Do not share cookies or credentials. See the [contribution guide](CONTRIBUTING.md).
