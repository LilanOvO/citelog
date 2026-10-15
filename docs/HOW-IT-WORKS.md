# How CiteLog records changes

[Back to the project](../README.md) · [Install guide](INSTALL.md)

CiteLog keeps snapshots in your Chrome profile and compares them over time. Profile counts and citing-article lists use separate workflows.

## Profile counts: scheduled snapshots

After you bind a public profile, CiteLog reads its first page and saves the total citation count plus the papers visible there. The first successful snapshot is a **baseline**. Later snapshots produce total and per-paper differences.

Automatic checks default to once every 24 hours. Settings accept whole hours from 1 to 720. You can check manually at any time; if a check is already running, repeated requests share that check instead of starting another one. A request times out after 20 seconds; failures preserve the previous records. Network errors back off, and verification pages, rate limits, or redirects pause automatic checking.

Chrome must be running. Sleep and browser scheduling can delay an alarm, so checks are not guaranteed to run at an exact time. Ordinary visits to the bound Scholar profile can also update its records.

### What “today” means

The daily number is the net change **observed on that day**, using the time zone saved when CiteLog first creates its local state. It is not the number of articles published or citations created that day.

For example, if yesterday's recorded total was 100 and today's check returns 103, CiteLog records +3 observed today. If an entire calendar day passes without an observation, the later difference is shown as an **interval change**, not distributed across the missing days.

Counts can fall as Scholar changes its records. New papers added to a profile are identified separately; their existing citations are not presented as newly earned per-paper citations. The profile total and the sum of visible paper changes may differ.

### Profiles with more than 100 papers

A background check reads only the first profile page, requesting up to 100 papers. CiteLog does not fetch subsequent pages. When coverage is incomplete, the popup says **部分论文未检查** (Some papers were not checked).

To observe more papers, open your bound profile yourself and use Scholar's **Show more** button. Refresh a long-open profile tab first: an older page must not overwrite a newer count. Unseen papers keep their last recorded counts; their absence from a partial page does not mean they were removed.

## Citing articles: two complete visits

Source lists are never fetched, paginated, or prefetched in the background. CiteLog reads only relevant pages you open for papers it already knows from your bound profile.

**1. Establish a baseline.** On Scholar, click a paper's **Cited by** count. Browse from the first page to the last in sequence, without year, keyword, or other filters. Pause briefly on each page to allow recording. Finish within 30 minutes. The first complete visit saves a baseline; it does not label all the existing articles as new.

**2. Compare a later visit.** Later, repeat the complete, unfiltered visit. CiteLog compares that list with the previous complete baseline and records newly discovered entries. It matches results using available Scholar identifiers, URLs, and normalized title/author/year information.

A changed paper in the popup opens its detail view, where you can inspect recorded sources. To establish a baseline before any paper changes, start from your Scholar profile's **Cited by** link.

Partial, filtered, out-of-order, expired, or oversized visits retain the articles already observed, but do not establish a complete new baseline or confirm additions. Do not rush through pages to meet the time limit: if a list is too large to browse normally, counts remain useful without a complete source comparison.

“Newly discovered” means a new entry relative to the stored comparison history. It does not establish when the article first cited you. Scholar's counts and source lists may update at different times; merged records, removed entries, and title changes can also affect comparisons. CiteLog cannot guarantee a one-to-one explanation for every citation-count change.

## Current limits

| Item | Current behavior |
|---|---|
| Profiles | One public `scholar.google.com` profile per Chrome installation |
| Background paper coverage | First page only, up to 100 papers |
| Local profile history | Up to 400 check events; multiple checks in a day can use multiple events |
| Source histories | Up to 12 papers, keeping the most recently visited |
| Sources per paper | Up to 500 recorded sources and 200 new-discovery records |
| Complete source visit | Sequential, unfiltered, first page through last, within 30 minutes |
| Oversized source lists | More than 500 entries cannot establish a complete comparison baseline |
| Backup and sync | Local storage only; no export/import or cloud sync yet |

Older records can be replaced at these limits. An evicted source history needs a new baseline before it can identify additions again.

## Local processing and site access

Background requests use the bound public profile and omit login credentials. The extension does not read cookies. Scholar HTML is parsed locally using bundled code; scripts, styles, and external resource elements from that HTML are not inserted into an active page.

CiteLog does not solve CAPTCHAs or bypass access restrictions. If checking pauses, open Scholar normally and follow its page instructions, or wait and retry later. Normal browser access can work even when a background request does not.

See [Privacy](../PRIVACY.md) for stored data and permissions, and [Testing](../TESTING.md) for what has actually been verified.
