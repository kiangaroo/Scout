# Quick Start

Scout is a local-first opportunity finder for Windows, macOS and Linux. It keeps your career data in a private workspace and uses Codex or Claude to help search and assess opportunities. It never sends applications or outreach.

## 1. Install and launch

Download the Windows installer and its `checksums.txt` from the same GitHub release. Compare the installer SHA-256 hash before running it:

```powershell
$Installer = Get-Item .\Scout-*-windows-x64.exe
Get-FileHash -LiteralPath $Installer.FullName -Algorithm SHA256
```

An unsigned beta may trigger Microsoft SmartScreen. A matching checksum proves file integrity, not publisher trust. Scout installs for the current user under `%LOCALAPPDATA%\Programs\Scout` and does not require administrator rights.

For a source checkout, install Node.js 24 LTS, then run `npm ci` and `npm start`.

## 2. Create or restore a private workspace

On first launch choose **Set up Scout for the first time** for a new local workspace, or **Restore my existing workspace** when moving to another computer. Accept the default `%USERPROFILE%\Documents\Scout Workspace`, or select another private local folder before launch with `SCOUT_WORKSPACE`.

Scout works fully without GitHub. Optional private backup requires Git and Git Credential Manager. Scout guides a new user to create an empty GitHub repository named `scout-workspace`, select **Private**, and paste its credential-free HTTPS URL. Git Credential Manager performs browser sign-in; Scout never asks for a GitHub token.

When enabling backup, choose a recovery passphrase and save the one-time emergency recovery key. Normal CV, profile and tracker files remain readable in the private repository so Git history remains useful. `.env`, generated PDF/DOCX files, chat transcripts and Scout recovery state are stored as authenticated encrypted blobs. Do not make the repository public.

Scout's restore flow clones into a temporary directory, validates the workspace, decrypts recovery data and installs it only after Scout doctor passes. On the new computer, sign in to Codex or Claude again and explicitly choose whether to re-enable host startup and scheduled scans.

From a source checkout:

```powershell
node tools/scout.mjs workspace init --workspace "$HOME\Documents\Scout Workspace"
```

The workspace contains `workspace.json`, your profile, CV, tracker, reports, applications, imports, logs and ignored credentials. It is separate from application files and survives upgrades and uninstall. Automatic backup can be disabled without deleting local work or existing private GitHub history.

## 3. Connect an AI provider

Install and sign in to either Codex or Claude Code using the provider's official instructions. Scout does not collect the provider password or token.

```powershell
codex login
codex login status

# Or
claude auth login
claude auth status
```

The beta installer currently provides the Scout UI shortcut but does not add the
`scout` command to `PATH`. Use the UI diagnostics, or invoke the bundled CLI
explicitly when following command-line examples:

```powershell
$ScoutNode = "$env:LOCALAPPDATA\Programs\Scout\runtime\ScoutRuntime.exe"
$ScoutCli = "$env:LOCALAPPDATA\Programs\Scout\app\tools\scout.mjs"
& $ScoutNode $ScoutCli doctor --workspace "$HOME\Documents\Scout Workspace"
```

In a source checkout, `node tools/scout.mjs doctor` is equivalent. A globally
available `scout` command is only present when the package has been linked or
installed separately.

See [Providers](PROVIDERS.md) if detection or authentication fails.

## 4. Add your CV and preferences

The first-run wizard accepts selectable-text PDF, DOCX, Markdown and plain text files up to 10 MB. Scanned PDFs need OCR before import. Review the extracted text and every generated profile/configuration change; Scout must not invent missing facts.

Complete the setup questions for your role families, sectors, locations, minimum salary, commute preferences, exclusions and preferred writing tone. Scout then makes one schema-constrained proposal from those fields and the imported evidence. Review or discard the five staged files before activation. See [AI Setup](AI_SETUP.md) for details or [Configuration](CONFIGURATION.md) for manual editing.

Review the complete search-profile draft and explicitly publish it before ranked discovery starts. Scout stages the draft automatically once setup preferences and profile evidence exist. A published profile is immutable for a scan: it records the approved rules, their strength and how unknown source facts should be handled. A fresh workspace cannot scan until you publish. If you upgrade an established older workspace that already has tracked opportunities, Scout creates an unpublished review draft from its existing preferences and temporarily continues the explicitly marked legacy discovery path until you publish it. A migration preserves your tracker, reports, applications and profile prose; it does not turn inferred preferences into hard exclusions. Unconfirmed inferred mandatory values remain non-blocking, and multiple accepted mandatory values for one field mean “any of these”, not “all of these”.

The structured review starts with universal questions, then offers no more
than six specialist follow-ups based on fields that are still missing or need
review. Check only the answers you want to change, inspect the complete draft,
and publish explicitly. Publication creates traceable search lanes from the
approved profile; it does not use a built-in occupation, employer, location or
salary taxonomy.

Setup, Settings, CV options and side drawers keep keyboard focus inside the active dialog and return it to the control that opened the dialog. Press **Escape** to close an optional dialog or drawer. Mandatory first-run setup remains open until its required action is complete.

Scout uses these approved answers, the imported CV and generated search lanes to find and score jobs. It does not inspect unrelated Codex/Claude conversations or automatically infer a career from previous AI usage.

After several scans, open **Settings → Search & profile → Search lanes and run
history** to see each run's returned, parsed, new, eligible, selected and
promising counts. Review the profile rule value, strength and provenance shown
with each lane before making a retirement decision. Scout can offer
a lane for retirement only after three completed non-failed runs produced no
new, eligible, selected or promising result. You must confirm retirement, and
you can restore the lane later without losing its history.

Open **Settings → Employers** to review named and advert-discovered employers.
You can set explicit priority, pause or exclude an employer reversibly, review
and undo bounded aliases, industries and locations, review terms and robots
permission, configure a public ATS board or careers URL, set the minimum check
interval, and inspect health and recent outcomes. Alias changes are
revision-bound and explicitly confirmed; one alias cannot identify two
employers. Generic careers-page parsing is off until you enable it. Scout never
bypasses sign-in, anti-bot or JavaScript-only pages and never treats an empty
check as a negative preference.

### Tailor a CV

Choose **Create custom CV** on an opportunity. Scout recommends Google XYZ for genuine achievement bullets and a separate natural-voice review, but both options can be switched off for each CV.

With XYZ enabled, Scout compares the role with confirmed evidence and asks only for missing accomplishment, outcome or method details, one question at a time. Every question can be skipped and the interview can be finished early. Never supply an invented number; a truthful qualitative outcome is valid.

Scout stores the selected options, confirmed answers and bullet provenance in the private application folder. The quality panel shows blocking evidence/rendering failures separately from overridable writing warnings. A CV remains labelled **Draft** until enabled checks pass or you explicitly choose **Use draft anyway**. Any later edit invalidates the prior review or override.

The CV library also renders the approved master Markdown as a clearly labelled reference PDF. Master and tailored renders run in the background, show progress and use source hashes so an old PDF cannot appear current after an edit.

From a source checkout, rerun the same review with:

```powershell
node tools/scout.mjs cv quality <application-slug> --workspace "$HOME\Documents\Scout Workspace"
```

## 5. Add sources

Public/ATS sources work without Adzuna. Adzuna is optional and uses `ADZUNA_APP_ID` and `ADZUNA_API_KEY` stored in the workspace `.env`. See [Adzuna and Sources](ADZUNA_AND_SOURCES.md).

## 6. Run and review the first scan

After you activate the reviewed five-file proposal, Scout shows the complete staged search profile in the first-scan step. Review its rules and unknown-value policies, publish it explicitly, then choose **Run first scan now**. Scout does not start provider work merely because setup answers were saved. Keep Scout open while it searches; setup and the dashboard show the current phase, elapsed time and an approximate remaining range. Use **Scan now** in the dashboard header for another scan. The command-line equivalent is:

```powershell
& $ScoutNode $ScoutCli doctor
& $ScoutNode $ScoutCli scan --provider codex --mode primary
```

Use `claude` instead if selected. Review the dated report and tracker changes. For a published profile, scan health shows source records, source/portal errors separately from failed records, unique vacancies after deduplication, unique confirmed-rule exclusions, the eligible ranked pool, the above-threshold detailed-assessment set and any assessment failures. Zero-score unrelated vacancies are not added merely to fill the assessment budget. Compensation is compared only when currency, period and rate type agree; an `exclude` unknown policy rejects both missing and non-comparable compensation. The selected set is bounded; a scan does not claim that every discovered vacancy received a provider assessment. Confirm that exclusions, salary handling and locations behave as intended before relying on results.

Scout can only rank jobs returned by your configured sources and reviewed
employer monitoring. Missing or ambiguous advert facts remain unknown.
**Feedback** on a job records a separate private event; it does not silently
change status or ranking. Use **Settings → Feedback & learning** to inspect
events, create a transparent bounded proposal, explicitly publish it, or undo
the active learned version. One rejection never becomes a hard exclusion.

If the supervised primary scan keeps zero roles, Scout automatically performs one broader discovery pass. It widens source queries, not your approved gates: salary, hard exclusions, location/commute, mandatory evidence and scoring remain in force. The completed result stays visible as “reviewed / kept”; **Review this scan** shows concise reasons for every discarded candidate without adding weak roles to the tracker.

New opportunities land in the **Jobs** tab, highest score first, each carrying a colour tag for its search category. Choose **Yes, shortlist** to move a role to the **Shortlist** tab, or **No** to dismiss it; dismissing shows a brief **Undo** toast that restores the role to Jobs. Tap a card to expand its full detail, including the original advert. From the **Shortlist** tab, **Remove** dismisses a role the same way (with undo), and **Review CV options** starts the same CV options flow described above; marking a shortlisted role as applied moves it to the **Pipeline** tab. Dismissed and applied roles remain visible in the **All** tab and are never re-surfaced by a later scan.

The **All** tab is a searchable table. On a phone, swipe the labelled table region horizontally to reach commute, stage, status and last-checked columns; filtering keeps the text cursor and in-progress keyboard composition in place.

### Understand missing advert details

Expand a job to see **Advert facts and checks**. Scout retains bounded structured salary, working pattern, contract, full/part-time and explicit office-day facts when available. Estimated salaries remain labelled estimates. Hybrid does not establish office days; gross salary does not establish take-home pay. Missing facts remain unknown and cannot satisfy mandatory requirements.

For older saved jobs, select **Restore facts from saved scans**. This repairs matching jobs from retained scan artifacts without another source request or AI call. It preserves status, scores, notes, contacts, commute and application history. The evidence date is the original capture date, not a fresh availability check. Old or unreadable evidence may be unavailable. Use **show what the source says** and the original advert for remaining gaps; blocked pages are not bypassed.

### Add a job you found elsewhere

In **Jobs**, select **Add job from URL**, paste the public vacancy link, and choose **Import and score**. Scout uses your configured AI provider and existing allowance to extract the listing and assess it against your current profile and CV. No additional account or key is required.

The imported vacancy has the same shortlist, research, CV, cover-letter and interview tools as discovered jobs. A low assessment or a mismatch remains visible for your review; adding a job does not change your preferences or make unknown requirements pass. An existing job opens without overwriting your decisions or application history.

Some sites block automated access or require sign-in. If Scout cannot read a usable advert, it offers a text fallback: paste the advert alongside its public URL and retry. Scout labels pasted evidence and unverified availability. Use a single vacancy page rather than a search-results page. No application or employer message is sent.

### Research an application approach

If Scout is briefly finishing startup or backup work, research waits before starting the AI turn. If the workspace stays busy, retry after the update or scan completes. Closing or stopping a waiting request cancels it. A retry does not repeat an AI turn that has already started.

1. Expand a job and select **research my application approach**. This opens the existing job chat with a prepared request; opening it does not call a model.
2. Choose an available provider/model and send when ready. Research uses your existing provider allowance. No additional research account or API key is required.
3. Review the recommended route and up to two worthwhile alternatives: evidence links and dates, confirmed facts versus inference, employer restrictions, material to reuse, estimated preparation time and unresolved questions. A normal application may be the best route. Ideas default to 30 minutes or less of your preparation time; AI runtime is not promised.
4. Reopen the job chat and expand **View application plan** to read the saved plan. **research / refresh plan** prepares a new research request; **draft a chosen idea** prepares a separate conversation asking which idea you choose. Review and send either request yourself. Creating a plan never automatically creates application materials or sends anything.

Plans are stored separately for each opportunity at `applications/<opportunity-id>/application-approach.md`. Successful research replaces that role's saved plan; failed, empty or oversized responses preserve its previous plan. Research providers can read and search but cannot edit workspace files through their research tools; Scout saves the returned plan atomically. Sources may still be blocked or unavailable and must be labelled unverified. Check employer recruitment and AI-use policies before using a proposed idea.

### When an advert link fails

Expand the job and open **source**. All saved source links are listed; the text preview tries up to three saved links in order. It labels a successful alternative and reports HTTP errors and timeouts separately from other fetch failures. Close and reopen a failed preview to retry.

Use **Search for this job** to open Google with only the public employer and job title. Scout does not search automatically or send your CV, profile or notes. Compare the employer, location, closing date and job reference before trusting another result: reposts may be old or refer to a different vacancy. A blocked source does not prove a job is closed. Scout does not bypass access controls or automatically replace source links with search results.

### Use Speculative for employer prospects

**Speculative** holds researched employers you might approach even when no suitable vacancy is confirmed. Ordinary vacancy scans do not automatically generate these prospects.

1. Open **Speculative → Add employer prospect**.
2. Enter the employer, its official public HTTPS careers or organisation URL, work to explore and your evidence-based reason for investigating. Include unresolved questions in the notes.
3. Save the prospect. It has no fit score, verified vacancy, salary or working arrangement. Research those before making a decision.
4. Shortlist, add notes and contacts, or prepare a draft using the normal opportunity tools. Check whether the employer accepts speculative enquiries; a jobs page alone does not establish that. Send any chosen outreach yourself.

To monitor advertised vacancies automatically, configure the employer separately in **Settings → Employers**, review access terms and robots permission, and supply a supported public ATS board or careers URL. Login-protected or JavaScript-only pages may need manual checking. Adding a prospect does not enable crawling or register for job alerts.

## 7. Enable daily scans (optional)

During setup, choose the local daily time and enable the schedule after the first healthy scan. Return to **Settings → First scan** to change or disable it later — an existing schedule's time, days and model stay editable even after a later run is unhealthy, stale or skipped. The command-line equivalent is:

```powershell
& $ScoutNode $ScoutCli schedule install --time 07:30 --provider codex
& $ScoutNode $ScoutCli schedule status
```

Scheduled scans use Windows Task Scheduler, macOS launchd, or a Linux systemd user timer. See [Automation](AUTOMATION.md).

## 8. Use Scout from your phone or laptop (optional)

Keep local-only use if it is all you need. No Scout account, Tailscale installation or cloud service is required.

To make this computer the one active Scout host, install and sign in to [Tailscale](https://tailscale.com/download), then open **Settings -> Private Remote Access**. Confirm the detected owner, leave the automatic HTTPS port selected and enable access. On Windows, automatic startup is selected by default so the host returns after Windows sign-in.

Install Tailscale on your phone or laptop with the same owner login, open the HTTPS address Scout displays, and use the browser's **Add to Home Screen** or **Install app** action. Your browser connects to the host's existing workspace and Scout/Codex chat; it does not create another workspace copy. The host must remain awake, online and signed in. See [Private Remote Access](PRIVATE_REMOTE_ACCESS.md) for access rules, recovery behaviour, cost/terms and troubleshooting.

For an always-on single-owner Ubuntu host, use [Host Scout on a private VPS](INSTALL_VPS.md). It keeps Scout loopback-only and uses a dedicated unprivileged user service to recover after reboot.
