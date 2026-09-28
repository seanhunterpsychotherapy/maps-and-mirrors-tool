# Permanent links and browser navigation

`routes.js` is the canonical public URL registry. It contains 107 main-app hash destinations plus the standalone `leaves-on-a-stream.html` address. The registry deliberately separates public names from passage/card IDs.

Examples: `#tool/thought-record`, `#tool/5-4-3-2-1-grounding`, `#tool/wise-mind`, `#page/values`, `#page/grief`. Do not change or reuse an established public slug when renaming implementation IDs. Add explicit compatibility aliases if a public address ever changes; never infer public routes from arbitrary DOM IDs.

ConnexOntario shares `#tool/no-one-to-call` with the existing referral-information card. Psychology Today's current Library search result still enters Support Plan. It has **no dedicated public route** pending a decision about the intended experience. `#page/professional-support` is not registered and fails safely home.

`#tool/check-in` and `#tool/name-whats-here` intentionally select different modes of one passage. `#page/sort-through-reflection` needs an existing valid selection; without it, the address is replaced with `#page/sort-through`. Archived `grief-legacy` and the five retired navigation menus have no public routes.

## Navigation lifecycle

`navigation.js` coordinates existing entry functions after all original wrappers/hooks are installed. It validates the destination before activation, sets fixed entry context, runs existing lifecycle work, and writes one browser entry. Initial/invalid-route resolution uses `replaceState`. Traversal uses neither push nor a second private-stack pop.

Card routes focus and scroll the exact target after deferred entry work completes. GIVE/FAST also open their requested disclosures. Entry callbacks use `mmEntryLater` so work from an abandoned destination cannot move focus or reset another exercise. Existing timers retain their own stop/reset functions.

Native Back/Forward follows page/tool entries. App Back first honours guided step history, then traverses an eligible owned browser entry using the existing utility-page skip policy. Without an owned predecessor it uses the existing app fallback. Start Over clears existing transient navigation state and starts a new app Back boundary; it does not erase browser history or saved content.

Returning to a guided exercise begins at its normal initial screen. URLs do not identify progress. Card-only traversal within a static passage preserves inputs and restores presentation context without resetting the exercise.

Only fixed route keys, opaque entry IDs, and allowlisted navigation context enter browser state or `mm_route_history_v1`. No text fields, selected feelings, search terms, logs, saved records, or guided-step answers are copied there. Existing user-storage schemas remain unchanged. Unknown or retired destinations recover to home without clearing unrelated data.

## Development verification

Run the source/contract checks with:

```sh
node tests/check-routes.cjs
```

An optional second argument points to the approved proposal JSON and verifies every implemented mapping against it.

For browser regression, build a disposable sibling directory (for example `deep-link-qa`) and serve the repository's parent on an isolated localhost port:

```sh
python tests/build-browser-fixture.py ../deep-link-qa
python -m http.server 8791 --directory .. --bind 127.0.0.1
```

Open `/deep-link-qa/harness.html`. Use its visible desktop and 390px buttons. The fixture seeds synthetic data on that isolated origin, captures runtime errors, stubs analytics locally, and displays its JSON report. Do not run it against an origin holding real user content. Optional report POSTs are ignored if the static server does not support them.

Also test the real app UI with native browser Back/Forward, keyboard controls, refresh, and standalone Leaves. The fixture supplements that check; it does not replace it. Publication requires review and a subsequent live smoke check before the PDF contract is released.
