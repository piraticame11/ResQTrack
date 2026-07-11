# Manual Testing Checklist — Panel Fixes

## Part 2: Tier 2, 3 & 4 (items 5–18)

Verified via direct API calls (login, incident lifecycle including the new Initiate/Delayed statuses, reclassify, flag-fake, purok CRUD + cross-page propagation, audit logging, and a **real** end-to-end test of the announcement scheduler — created a "schedule for +10s" announcement and confirmed the cron job flipped it to published on its own a minute later, no manual step). The browser tool that was driving click-throughs disconnected partway through this session, so — same caveat as Part 1 — the items below were verified at the API/data layer but not clicked through by a human yet.

### ⚠️ Test these first — UI-only, couldn't be exercised via API

- [ ] **Fire fast-path banner** ([report-incident.html](client/pages/client/report-incident.html)) — tap "Fire" on step 1, confirm the call banner appears with the right BFP number pulled from Emergency Contacts, and that "Continue to Report" still lets you finish reporting.
- [ ] **Gallery photo picker** — on the same report form, confirm "Choose from Gallery" opens the OS file picker, multiple photos can be combined with camera shots up to 5, and each has a working remove (×) button.
- [ ] **Admin reclassify controls** ([incidents.html](client/pages/admin/incidents.html)) — open an incident as admin, confirm the Type/Triage dropdowns appear (admin-only — check they're absent for a responder login) and saving updates the badges without a page reload.
- [ ] **Flag as Fake** — this currently uses a native `prompt()` dialog (see `promptFlagFake` in [incidents.js](client/js/admin/incidents.js), [dashboard.js](client/js/responder/dashboard.js), [my-incidents.js](client/js/responder/my-incidents.js)). Confirm it actually appears and isn't blocked by a popup blocker on mobile Safari/Chrome — if it's flaky there, swap it for an inline textarea like the Blotter reject panel uses.
- [ ] **Status legend popover** — click "What do these mean?" on Incidents, Logbook, and My Incidents pages, confirm it opens/closes and reads correctly.
- [ ] **Reports page charts + heat map** ([reports.html](client/pages/admin/reports.html)) — confirm the Type-by-Month stacked bar chart renders, and the Incident Hotspots map shows both the heat layer and individual pins, with popups on click.
- [ ] **Excel export** — click the new "Excel" button, confirm a real .xlsx opens in Excel/Sheets with Incidents + Responder Performance as separate tabs.
- [ ] **Puroks page** — add, edit, and delete a purok through the actual UI; confirm deleting one that's in use is correctly blocked with the dependency-count message.
- [ ] **Announcement scheduler UI** — pick "Schedule for later," set a near-future time through the actual `datetime-local` input (not scripted), confirm the "Scheduled for …" badge appears in the list and the announcement flips to Published on its own once the time passes (confirmed working via cron in this session, but not through the real form/date-picker interaction).
- [ ] **Offline queue** — turn on airplane mode / devtools offline, submit a report, confirm the "Saved Offline" screen appears, then reconnect and confirm it submits automatically with a toast. (Built and code-reviewed, not exercised with a real network drop.)

### Sanity-checked via API this session (spot-check once in the real UI)

- Status workflow: Dispatched → Delayed → Initiate → Resolved, each transition logged correctly
- Reclassify (type + triage) persists and logs to the incident's activity log
- Flag-as-fake increments the reporter's count, shows the red badge on Users, and Unflag decrements it back
- Purok added on the Puroks page immediately appeared in another page's dropdown on a fresh load (Blotter's "e-purok" select)
- Audit Log correctly recorded a real login (actor, role, IP, timestamp)
- Admin safeguard: `admin.controller.js` blocks deactivating/demoting the sole remaining admin (logic reviewed, not yet triggered against a real single-admin database — your seed data has two admins, so you'll need to deactivate one first to test this for real)
- Login page redirects correctly by role with no manual tab selection
- Multi-photo incident report (2 photos) accepted and both stored in `incident_attachments`, correctly separate from the single legacy `photo_path` field

## Part 1: Tier 1 (items 1, 3, 4)

Everything below was built and exercised via direct API calls / function calls in an automated browser session, but **not** clicked through by a human on a real device. Two gaps in particular (marked ⚠️) couldn't be tested at all in that environment. Go through this before treating the Tier 1 work as demo-ready.

## ⚠️ Known gaps — test these first

- [ ] **Homeowner / Tenant toggle on Register** ([register.html](client/pages/shared/register.html)) — click the two buttons with an actual mouse/tap, not devtools. Confirm the landlord fields slide into view for Tenant and back out for Homeowner, and that they're actually required (try submitting Tenant with landlord fields blank).
- [ ] **Camera capture on Register** — the automated session has no camera, so the `getUserMedia` → capture → preview → retake flow for the Valid ID photo was never exercised end-to-end. Test on a real phone and a real laptop webcam. Note: camera access requires HTTPS (or `localhost`) — if you deploy to a non-localhost HTTP address, the camera step will silently fail to request permission.

## Registration flow

- [ ] Register a resident through the actual form (not the API) with a short/garbage address (e.g. "asd") — confirm it's rejected client-side with the address error, not just server-side.
- [ ] Register as Tenant/Boarder through the real form, fill landlord name + contact, confirm submission succeeds and the success message appears.
- [ ] Register two residents with the same last name through the real form and confirm both go through (duplicate surname should warn the admin later, not block registration).
- [ ] Try registering with an email that's already used — confirm the "Email already registered" message displays correctly in the UI.
- [ ] Confirm the password strength meter and phone-digit-filter still work (untouched code, but sits right next to the new fields — check nothing shifted/broke visually).

## Admin verification workflow ([users.html](client/pages/admin/users.html))

- [ ] Open a pending resident's detail modal via a real click on "View" — confirm address, residency type, and (for tenants) landlord name/contact render correctly.
- [ ] Confirm the duplicate-surname warning banner appears/doesn't appear correctly by clicking through several pending residents.
- [ ] Click **Reject** with the reason box empty — confirm it's blocked with a toast, not a silent failure.
- [ ] Click **Reject** with a real reason typed in — confirm the modal closes, the user list updates to show "Rejected" in red, and reopening that user shows the saved reason.
- [ ] Log in as that rejected resident (real login page, real form) and confirm the rejection reason displays as the login error.
- [ ] Click **Verify Account** on a pending resident — confirm it flips to "Verified" in the list and that resident can now log in.
- [ ] Confirm the verification email actually sends (check `server/utils/mailer.js` config / a real inbox) — this path was not touched by my changes but flows through `verifyUser`, worth a smoke test since it's on the critical path for every new resident.
- [ ] Confirm existing "Edit User" and "Add User" modals in this same page still work normally — I only added new elements around them, didn't change that code, but worth a quick regression click-through.

## Digital Blotter ([blotter.html](client/pages/admin/blotter.html))

- [ ] Click **File Entry**, fill out the form through the actual modal (not the console), submit, confirm it appears in the list with a generated entry number.
- [ ] Open an entry's detail modal via click, click a status button (e.g. "Under Mediation"), confirm the closing-note box only appears for the locking statuses (Resolved / Endorsed to Court / Voided) and not for "Under Mediation".
- [ ] Try clicking "Resolved" and hitting **Confirm** with the note box empty — confirm it's blocked with a toast.
- [ ] Resolve an entry with a real note, confirm the modal shows the lock banner and the status buttons disappear.
- [ ] Reopen a locked entry later and confirm there is truly no way to edit it from the UI (no stray edit button anywhere).
- [ ] Check the mobile sidebar toggle (hamburger icon) on the Blotter page at a phone-width viewport — new page, same sidebar markup as the others, but worth a visual check.
- [ ] Confirm "Blotter" appears in the correct nav order across **all** admin pages (Dashboard, Incidents, Users, Logbook, Blotter, Announcements, Reports) and that the active-page highlight is correct on each.

## Database / deployment

- [ ] Run `node database/migrate.js` against a **completely fresh, empty** database (not your existing dev DB) to confirm `schema.sql` creates every table — including `blotter_entries` and `blotter_logs` — correctly from a cold start. I only verified the migration path against your existing dev database, which already had most tables.
- [ ] After that fresh-DB run, confirm `seed.sql` still inserts cleanly (residency_type/verification_status will fall back to their defaults for seeded users — confirm those defaulted rows still look sane in the admin Users list, since seed.sql doesn't set them explicitly).
- [ ] If you have a staging/production database that's already running, back it up before running `migrate_add_address_and_blotter.sql` or `migrate.js` against it.
- [ ] Run `npm run build:css` (not just the dev watcher) once before any deploy, so `output.css` in the repo reflects the new `residency-tab`, `badge-open/mediation/endorsed/voided` classes — I rebuilt it locally during this session but confirm it's committed.

## Sanity check on things I *did* verify (should still spot-check once)

These passed in the automated session — a quick manual click-through is still worthwhile before a live demo:
- Blank-address and tenant-without-landlord registration rejections
- Duplicate-surname warning showing the right accounts
- Reject → login-blocked-with-reason → re-verify → login-succeeds cycle
- Blotter lock enforcement (edit + status-change both rejected once locked, no delete route)
- Non-admin (resident) getting a 403 on all `/api/blotter/*` endpoints
