# Platform Audit Report

## Executive Summary

This report delivers a platform-wide defect audit of the Project Stairway codebase, covering four core workspace packages:

- `apps/api`: Fastify, Drizzle ORM, and PostgreSQL backend services
- `packages/scoring`: Core voting, ranking, Bayesian shrinkage, and statistical separation algorithms
- `apps/discord`: Discord.js bot service, interactions, slash commands, and background sync workers
- `apps/web`: Next.js 15 web client, React Query hooks, and API proxy routes

The audit discovered, isolated, and documented 24 distinct findings across security, role-based access control (RBAC), state mutation, statistical integrity, and interaction reliability.

### Audit Baseline and Test Harness

The Project Stairway repository uses a multi-project Vitest runner configured in `vitest.config.ts`.
The test harness architecture provides:

- In-process PostgreSQL execution via `@electric-sql/pglite` with automated Drizzle migrations (`migratePglite`)
- Isolated test doubles for external I/O (`FakeObjectStorage`, `MemoryKeyValueStore`, `MemoryNotificationLog`, `MemoryEventBus`)
- Synthetic Discord client contexts and ephemeral file-backed stores for isolated bot testing
- Node-based Next.js route and utility test environments

Before introducing reproducer test files, the pre-existing test suite established the following baseline:

- `packages/scoring`: 1 test file, 22 tests passing
- `apps/api`: 22 test files, 142 tests passing
- `apps/discord`: 10 test files, 133 tests passing
- `apps/web`: 2 test files, 57 tests passing
- Total baseline: 35 test files, 354 tests passing with zero failures and zero regressions

### Summary of Findings

Across the 24 discovered findings:

- 1 Critical severity finding: Unchecked upload stream and directory traversal in the deliverables vault (B1)
- 8 High severity findings: Confidential telemetry SSE leaks (B2), missing screenplay admin RBAC (B3), Discord timer overflow loops (B7), destructive server setup mutations (B8), unprivileged role assignment (B9), Discord interaction timeouts (B10), screenplay studio navigation leaks (B18), and voting state desynchronization traps (B19)
- 10 Medium severity findings: Non-finite Bayesian shrinkage calculations (B4), zero-variance winner declaration on single ballots (B5), quarantined entry leaderboard point skew (B6), autocomplete multi-page pagination latency (B11), task submit and release authorization mismatches (B12), missing webhook auto-discovery (B13), notification cursor advancement on handler failure (B14), dialog form reset race conditions (B20), upload proxy 50MB ceiling discrepancies (B21), and grabbox business identifier route rejection (B22)
- 5 Low severity findings: Rules document truncation (B15), Discord typography and emoji invariants (B16), persistent claim buttons on forum threads (B17), certified standings cache invalidation gaps (B23), and web client typography and emoji violations (B24)

For all 19 findings rated Medium, High, or Critical (B1 through B14, and B18 through B22), an isolated Vitest test reproducer was created in `apps/*/test/Defects/` or `packages/*/test/Defects/`. Each reproducer executes cleanly and fails against the unpatched codebase, validating the concrete failure mechanism.

---

## Complete Findings Inventory

| ID  | Title                                                  | Affected Component / File                                 | Severity | Reproducer Status                                                                     |
| --- | ------------------------------------------------------ | --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| B1  | Unchecked Deliverable Upload and Path Traversal        | `apps/api/src/Modules/Uploads/UploadsRoutes.ts`           | Critical | Automated Vitest (`apps/api/test/Defects/UploadStreamSecurity.test.ts`)               |
| B2  | Telemetry SSE Confidential Event Leak                  | `apps/api/src/Modules/Telemetry/TelemetryRoutes.ts`       | High     | Automated Vitest (`apps/api/test/Defects/TelemetrySseLeak.test.ts`)                   |
| B3  | Screenplay Studio Missing Admin RBAC                   | `apps/api/src/Modules/Scripts/ScriptsRoutes.ts`           | High     | Automated Vitest (`apps/api/test/Defects/ScriptsAdminRbac.test.ts`)                   |
| B4  | Bayesian Shrinkage NaN Score Propagation               | `packages/scoring/src/BayesianShrinkage.ts`               | Medium   | Automated Vitest (`packages/scoring/test/Defects/BayesianShrinkage.test.ts`)          |
| B5  | Statistical Separation Zero-Variance Lead on N=1       | `packages/scoring/src/EvaluateRankSeparation.ts`          | Medium   | Automated Vitest (`packages/scoring/test/Defects/EvaluateRankSeparation.test.ts`)     |
| B6  | Quarantined Entry Leaderboard Skew                     | `apps/api/src/Modules/Leaderboards/LeaderboardService.ts` | Medium   | Automated Vitest (`apps/api/test/Defects/LeaderboardQuarantineSkew.test.ts`)          |
| B7  | ReminderScheduler 32-Bit Timer Overflow                | `apps/discord/src/Services/ReminderScheduler.ts`          | High     | Automated Vitest (`apps/discord/test/Defects/ReminderSchedulerOverflow.test.ts`)      |
| B8  | ServerProvisioner Invariant Violations                 | `apps/discord/src/Services/ServerProvisioner.ts`          | High     | Automated Vitest (`apps/discord/test/Defects/ServerProvisionerInvariants.test.ts`)    |
| B9  | AssignRoleCommand Missing RBAC Checks                  | `apps/discord/src/Commands/ModerationCommands.ts`         | High     | Automated Vitest (`apps/discord/test/Defects/AssignRoleRbac.test.ts`)                 |
| B10 | Discord Interaction Timeouts (10062)                   | `apps/discord/src/Commands/ModStatusCommands.ts`          | High     | Automated Vitest (`apps/discord/test/Defects/InteractionTimeout.test.ts`)             |
| B11 | TaskCommands Autocomplete Pagination Latency           | `apps/discord/src/Commands/TaskCommands.ts`               | Medium   | Automated Vitest (`apps/discord/test/Defects/TaskAutocompletePagination.test.ts`)     |
| B12 | Task Submit/Release Authorization Inconsistencies      | `apps/discord/src/Commands/TaskCommands.ts`               | Medium   | Automated Vitest (`apps/discord/test/Defects/TaskAuthorizationInconsistency.test.ts`) |
| B13 | Webhook Auto-Discovery Missing and Direct Bot Fallback | `apps/discord/src/Services/NotificationDispatcher.ts`     | Medium   | Automated Vitest (`apps/discord/test/Defects/WebhookDiscovery.test.ts`)               |
| B14 | NotificationConsumer Event Loss on Failure             | `apps/discord/src/Api/NotificationConsumer.ts`            | Medium   | Automated Vitest (`apps/discord/test/Defects/NotificationCursorLoss.test.ts`)         |
| B15 | Rules Publishing 4000-Char Truncation                  | `apps/discord/src/Services/ServerProvisioner.ts`          | Low      | Documented Inspection (`apps/discord/src/Discord/Ui.ts`)                              |
| B16 | Discord Typography and Emoji Invariants                | `apps/discord/src/Commands/ReminderCommands.ts`           | Low      | Documented Inspection (`apps/discord/src/Services/*`)                                 |
| B17 | Claim Task Button Active Post-Claim                    | `apps/discord/src/Services/TaskForum.ts`                  | Low      | Documented Inspection (`apps/discord/src/Views/TaskViews.ts`)                         |
| B18 | Screenplay Studio Navigation Leak                      | `apps/web/src/Components/Layout/AppSidebar.tsx`           | High     | Automated Vitest (`apps/web/test/Defects/ScreenplayStudioNavigationRbac.test.ts`)     |
| B19 | Voting State Desync and Submission Trap                | `apps/web/src/Features/Voting/RoundView.tsx`              | High     | Automated Vitest (`apps/web/test/Defects/VotingStateDesync.test.ts`)                  |
| B20 | Dialog Form State Reset Race Condition                 | `apps/web/src/Features/Studio/RoundControls.tsx`          | Medium   | Automated Vitest (`apps/web/test/Defects/RoundDialogStateRace.test.ts`)               |
| B21 | Upload Proxy 50MB Ceiling Discrepancy                  | `apps/web/src/app/api/v1/[...path]/route.ts`              | Medium   | Automated Vitest (`apps/web/test/Defects/UploadProxyLimit.test.ts`)                   |
| B22 | Grabbox Route UUID-Only Restriction                    | `apps/web/src/app/grabbox/[shotId]/page.tsx`              | Medium   | Automated Vitest (`apps/web/test/Defects/GrabboxRouteParams.test.ts`)                 |
| B23 | Certified Standings Stale Cache on Finalization        | `apps/web/src/Features/Studio/RoundControls.tsx`          | Low      | Documented Inspection (`apps/web/src/Features/Voting/Standings.tsx`)                  |
| B24 | Web Typography and Emoji Violations                    | `apps/web/src/Features/Voting/Standings.tsx`              | Low      | Documented Inspection (`apps/web/src/Features/*`)                                     |

---

## Detailed Findings Documentation

### Critical Findings

#### B1: Unchecked Deliverable Upload and Path Traversal in /uploads/stream

- Component: `apps/api/src/Modules/Uploads/UploadsRoutes.ts`, lines 98-121
- Failure Mode: Authenticated users can upload arbitrary files directly into supervisor-affirmed deliverables storage or overwrite deliverables of other contributors without holding a claim on the target shot.
- Root Cause: In `UploadsRoutes.ts`, the streaming upload handler tests whether `key` starts with `deliverableVaultPendingPrefix` (`Project Stairway/Submission Reviews/Pending/`). When matched, it sets `bucket = StorageBucket.Deliverables` and accepts the upload with only `requireUser()` authentication. It does not parse the shot code from `key`, does not verify that the user holds an active claim on that shot (`assertActiveClaim`), does not check for path traversal characters (`..`), and does not consume upload rate quota.
- Reproduction Steps:
    1. Authenticate as any regular user (`Role.Member`).
    2. Send a `POST` request to `/api/v1/uploads/stream?key=Project Stairway/Submission Reviews/Pending/SC01/../../Affirmed/SC01/target.mp4` with a valid video payload.
    3. Observe that the endpoint returns HTTP 200 and writes the file into `StorageBucket.Deliverables` at `Affirmed/SC01/target.mp4`, overwriting finalized deliverables.
- Standalone Reproducer: `apps/api/test/Defects/UploadStreamSecurity.test.ts`
- Impact: Complete compromise of deliverable vault integrity. Any authenticated community member can tamper with approved production renders and bypass the entire supervisor review pipeline.
- Recommended Remediation: Restrict `/api/v1/uploads/stream` strictly to media uploads (`StorageBucket.Media`). Require all deliverable uploads to pass through `POST /shots/:shotId/uploads`, where `assertActiveClaim`, filename sanitization via `sanitizeFileName`, canonical path construction via `createDeliverableKey`, and quota consumption are enforced. In addition, explicitly reject any upload key containing `..`.

---

### High Severity Findings

#### B2: Telemetry SSE Confidential Event Leak

- Component: `apps/api/src/Modules/Telemetry/TelemetryRoutes.ts`, lines 20-26, 226-229, 318-324
- Failure Mode: Confidential support ticket activity and peer supervisor feedback survey records are leaked in real time to supervisors connected to the server-sent events (SSE) stream.
- Root Cause: `TelemetryRoutes.ts` defines `privateActivityTypes` for confidential notifications (`TicketConfigUpdated`, `TicketActivity`, `FeedbackSurveyOpened`, `FeedbackSurveyClosed`, `FeedbackOutcomeRecorded`). The polling endpoint (`GET /telemetry/activity`, lines 226-229) explicitly filters out these types. However, the streaming endpoint (`GET /telemetry/activity/stream`, lines 318-324) checks only `parsed.success` before writing events to the stream, completely omitting the `!privateActivityTypes.has(parsed.data.type)` guard.
- Reproduction Steps:
    1. Authenticate as a supervisor (`Role.Supervisor`) and open an SSE connection to `/api/v1/telemetry/activity/stream`.
    2. Publish a confidential ticket activity notification (such as a private disciplinary action note).
    3. Observe that the confidential event payload is streamed directly to the supervisor client.
- Standalone Reproducer: `apps/api/test/Defects/TelemetrySseLeak.test.ts`
- Impact: Breach of confidential moderation notes, disciplinary actions, and anonymous feedback surveys.
- Recommended Remediation: Add `&& !privateActivityTypes.has(parsed.data.type)` to the notification filter check in line 320 of `TelemetryRoutes.ts` prior to writing SSE frames.

#### B3: Screenplay Studio Missing Admin RBAC

- Component: `apps/api/src/Modules/Scripts/ScriptsRoutes.ts`, lines 40-42, 58, 75, 96, 113, 134, 158, 185, 207, 233, 257, 282, 307, 330, 354, 377
- Failure Mode: Standard community members and non-admin supervisors can view, create, modify, restore, and delete production screenplay drafts and shelves.
- Root Cause: Project rules dictate: "Access restricted strictly to admin and super_admin roles. No secondary or creative director roles permitted." In `ScriptsRoutes.ts`, `adminOrService = requireRoleOrService(Role.Admin)` is instantiated on line 41, but every route registration uses `preHandler: userOnly` (`requireUser()`).
- Reproduction Steps:
    1. Authenticate with an ordinary `Role.Member` token.
    2. Send a `GET /api/v1/scripts` or `POST /api/v1/scripts/shelves` request.
    3. Observe that the server responds with HTTP 200 or 201 instead of HTTP 403 Forbidden.
- Standalone Reproducer: `apps/api/test/Defects/ScriptsAdminRbac.test.ts`
- Impact: Unauthorized reading, editing, and deletion of confidential screenplays and production scripts.
- Recommended Remediation: Replace `preHandler: userOnly` with `preHandler: adminOrService` across all screenplay and shelf route registrations in `ScriptsRoutes.ts`.

#### B7: ReminderScheduler 32-Bit Timer Overflow

- Component: `apps/discord/src/Services/ReminderScheduler.ts`, lines 46-50; `apps/discord/src/Common/TimeParser.ts`, lines 15, 25
- Failure Mode: Setting a reminder between 25 and 90 days causes the bot to enter an unbounded 1ms infinite busy loop that locks the Node.js event loop and floods process logs.
- Root Cause: `TimeParser.ts` permits reminder durations up to 90 days (`maxMs = 90 * 86_400_000 = 7,776,000,000` ms). In `ReminderScheduler.ts`, line 47 computes `delay = Math.max(next.getTime() - Date.now(), 1_000)` and invokes Node.js `setTimeout(..., delay)`. Node.js stores timer delays as signed 32-bit integers (maximum value `2,147,483,647` ms, approximately 24.855 days). Delays exceeding this value trigger `TimeoutOverflowWarning` and are clamped by Node.js to 1ms. When the 1ms timer fires, `store.drain()` returns empty because the reminder is not due. Line 65 immediately re-executes `this.schedule()`, creating another 1ms timer indefinitely.
- Reproduction Steps:
    1. Execute `/reminder set time:30d message:Review`.
    2. Start `ReminderScheduler`.
    3. Observe CPU usage jump to 100% and stderr flood with `TimeoutOverflowWarning` on every tick.
- Standalone Reproducer: `apps/discord/test/Defects/ReminderSchedulerOverflow.test.ts`
- Impact: Denial of service for the Discord bot process.
- Recommended Remediation: Clamp timer delay to `Math.min(rawDelay, 2_147_483_647)`. When the timer fires, inspect whether `next.getTime() <= Date.now()`. If the reminder is not yet due, reschedule for the remaining duration.

#### B8: ServerProvisioner Invariant Violations

- Component: `apps/discord/src/Services/ServerProvisioner.ts`, lines 435-437, 489-491, 574-612, 1034-1040, 1198-1248
- Failure Mode: Running `/bot-setup` alters existing channel sidebar positions, re-parents existing channels into default categories, deletes legacy task forums, and wipes custom permission overwrites.
- Root Cause: Project invariants specify: "/bot-setup must never re-parent existing channels into default categories, never alter channel sidebar order, and never wipe custom permission overwrites on existing channels." `ServerProvisioner.ts` violates all four constraints: lines 436 and 490 call `existing.setParent()`, line 1039 calls `ch.setPosition(index)`, line 586 calls `forumCh.delete()`, and line 1198 calls `forum.permissionOverwrites.set(...)`.
- Reproduction Steps:
    1. Set up a Discord guild with pre-existing categories, channel order, and custom permission overwrites on a task forum.
    2. Invoke `/bot-setup`.
    3. Observe channel order scrambled, custom channels deleted, and permission overwrites replaced.
- Standalone Reproducer: `apps/discord/test/Defects/ServerProvisionerInvariants.test.ts`
- Impact: Destructive mutation of production Discord servers during initialization or re-configuration.
- Recommended Remediation: Remove channel re-parenting and re-positioning calls for existing channels. Eliminate channel deletion loops. Use non-destructive permission patching (`permissionOverwrites.edit`) rather than full replacement (`permissionOverwrites.set`).

#### B9: AssignRoleCommand Missing RBAC Checks

- Component: `apps/discord/src/Commands/ModerationCommands.ts`, lines 39-65
- Failure Mode: Unprivileged guild members can run `/assign-role` and grant studio roles or platform permissions to any member.
- Root Cause: `assignRoleCommand` does not configure `.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)` on the slash command builder, and `execute()` lacks checks for `requirePlatformRole(interaction, context, Role.Supervisor)` and `requireManageGuild(interaction)`.
- Reproduction Steps:
    1. As an unprivileged member without staff roles, execute `/assign-role member:@user role:@Supervisor`.
    2. Observe the command execute without authorization error.
- Standalone Reproducer: `apps/discord/test/Defects/AssignRoleRbac.test.ts`
- Impact: Privilege escalation across the Discord guild and platform API.
- Recommended Remediation: Add `setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)` to the slash command builder. Inside `execute()`, call `requirePlatformRole(interaction, context, Role.Supervisor)` and verify department alignment before modifying roles.

#### B10: Discord Interaction Timeouts (10062)

- Component: `apps/discord/src/Commands/ModStatusCommands.ts`, lines 82-115, 140-181, 206-247; `apps/discord/src/Commands/ApologyReviewHandlers.ts`, lines 37-55, 75-106
- Failure Mode: Moderation commands and button handlers fail with Discord error code 10062 ("Unknown interaction") when sequential network fetches exceed 3 seconds.
- Root Cause: Discord interaction tokens expire in 3,000ms. In `modStatusCommand`, `modStepDownButtonHandler`, `modResetButtonHandler`, and `banApologyCommand`, sequential Discord API calls (`guild.members.fetch`, `guild.bans.fetch`, `channels.fetch`) are performed before calling `deferReply()` or `deferUpdate()`. Under realistic network latency, these calls exceed 3 seconds.
- Reproduction Steps:
    1. Introduce 1,500ms latency to Discord API fetches.
    2. Execute `/mod-status user:@target` or click a step-down button.
    3. Observe unhandled promise rejection with DiscordAPIError 10062.
- Standalone Reproducer: `apps/discord/test/Defects/InteractionTimeout.test.ts`
- Impact: Intermittent command failures, broken moderation flows, and unhandled promise rejections.
- Recommended Remediation: Call `await interaction.deferReply({ flags: MessageFlags.Ephemeral })` or `await interaction.deferUpdate()` as the very first operation in each interaction handler before awaiting external fetches.

#### B18: Screenplay Studio Navigation Leak

- Component: `apps/web/src/Components/Layout/AppSidebar.tsx`, lines 30-58
- Failure Mode: Non-admin users who receive script collaboration invites see the Screenplay Studio link (`/studio/script`) in the sidebar navigation.
- Root Cause: Project invariants dictate Screenplay Studio access is restricted strictly to `Role.Admin` and `Role.SuperAdmin`. In `AppSidebar.tsx`, line 41 evaluates `isVisible` as `hasStudioAccess || hasAtLeast(user, Role.Admin)`. `useStudioAccess` queries `/studio/script/api/session`, which sets `hasAccess: true` whenever `isInvited` or `acceptedInvites` is populated, granting access to non-admin contributors.
- Reproduction Steps:
    1. Log in as a user with `Role.Member` or `Role.Supervisor` who has an accepted script invite.
    2. Inspect the sidebar navigation.
    3. Observe the Screenplay Studio link rendered in the sidebar.
- Standalone Reproducer: `apps/web/test/Defects/ScreenplayStudioNavigationRbac.test.ts`
- Impact: Violation of screenplay studio RBAC invariants; exposes administrative routes to standard contributors.
- Recommended Remediation: Update line 41 in `AppSidebar.tsx` to strictly check `hasAtLeast(user, Role.Admin)`, ignoring `hasStudioAccess`.

#### B19: Voting State Desync and Submission Trap

- Component: `apps/web/src/Features/Voting/RoundView.tsx`, line 339; `apps/web/src/Features/Voting/UseApprovedEntries.ts`, lines 15-25; `apps/web/src/Features/Voting/SubmitEntryDialog.tsx`, lines 55-78
- Failure Mode: After submitting an entry to a voting round, the user is still shown the active submission call-to-action. If clicked again, the user selects a file, waits for the media upload to complete, and is then rejected with an HTTP 409 Conflict error.
- Root Cause: In `RoundView.tsx`, `hasAlreadySubmitted` checks whether `entries.data` contains an entry submitted by `user.id`. `entries.data` is populated by `useApprovedEntries`, which requests only `status: EntryStatus.Approved`. Newly submitted entries start in `EntryStatus.PendingReview`, so `hasAlreadySubmitted` evaluates to `false`. Furthermore, on successful submission in `SubmitEntryDialog.tsx`, only `queryKeys.round` is invalidated, leaving user submission caches stale.
- Reproduction Steps:
    1. Submit a proposal entry with an image or video to an open round as a contributor.
    2. Return to the round view.
    3. Observe that the "Submit Entry" button is still displayed.
    4. Select a file and submit again.
    5. Observe the file upload to storage before the API rejects the request with HTTP 409 Conflict.
- Standalone Reproducer: `apps/web/test/Defects/VotingStateDesync.test.ts`
- Impact: Wasted client bandwidth and confusion for contributors.
- Recommended Remediation: Query `myEntries` for the round without status filtering, or include pending submissions in `hasAlreadySubmitted`. Invalidate `queryKeys.entries(round.id)` and `queryKeys.myEntries(round.id)` upon submission.

---

### Medium Severity Findings

#### B4: Bayesian Shrinkage NaN Score Propagation

- Component: `packages/scoring/src/BayesianShrinkage.ts`, lines 6-43
- Failure Mode: Non-finite inputs (`Infinity`) or `NaN` passed into `calculateBayesianShrinkage` produce `NaN` scores that silently corrupt leaderboard sort orders.
- Root Cause: In `BayesianShrinkage.ts`, line 32 computes `(rawScore + prior * globalMean) / (ballots + prior)`. When `priorK` is `Infinity`, the expression yields `Infinity / Infinity = NaN`. When `priorK` or `totalEntries` is `NaN`, `Math.max(0, NaN)` returns `NaN`. Downstream sorting (`b.regularizedTotalScore - a.regularizedTotalScore`) fails silently.
- Reproduction Steps:
    1. Call `calculateBayesianShrinkage` with `priorK = Infinity` or `priorK = NaN`.
    2. Observe `result.regularizedMeanScore` and `result.regularizedTotalScore` evaluate to `NaN`.
- Standalone Reproducer: `packages/scoring/test/Defects/BayesianShrinkage.test.ts`
- Impact: Corrupted contest standings and non-deterministic winner selection.
- Recommended Remediation: Validate that `priorK`, `totalEntries`, and `totalBallots` are finite numbers with `Number.isFinite(...)`. Fall back to raw scores or default prior values when non-finite inputs are detected.

#### B5: Statistical Separation Zero-Variance Lead on N=1

- Component: `packages/scoring/src/EvaluateRankSeparation.ts`, lines 21-40
- Failure Mode: When a single ballot is cast in a contest, the algorithm declares a statistically decisive winner with zero p-value (`z=999`, `p=0`).
- Root Cause: When only 1 ballot is cast, sample variance for both entries is zero, yielding `standardError = 0`. Line 31 branches on `else if (deltaScore > 0)` and hardcodes `zScore = 999`, `pValue = 0`, and `isDecisive = true`, recommending `SeparationAction.DeclareWinner`. Single-ballot samples cannot statistically reject the null hypothesis.
- Reproduction Steps:
    1. Evaluate rank separation between two entries using a single ballot (`totalBallots = 1`).
    2. Observe `result.status === SeparationStatus.DecisiveLead` and `result.pValue === 0`.
- Standalone Reproducer: `packages/scoring/test/Defects/EvaluateRankSeparation.test.ts`
- Impact: Premature declaration of contest winners without statistical significance.
- Recommended Remediation: Enforce a minimum sample threshold (e.g. `totalBallots >= 3`) before evaluating decisive leads. When variance is zero due to under-sampling, report `SeparationStatus.TooClose` with `pValue = 1.0`.

#### B6: Quarantined Entry Leaderboard Skew

- Component: `apps/api/src/Modules/Leaderboards/LeaderboardService.ts`, lines 207-260
- Failure Mode: Quarantined entries corrupt public leaderboard point totals and cause displayed vote shares to not sum to 100%.
- Root Cause: In `LeaderboardService.ts`, line 208 passes all entry IDs to `aggregateScores` before filtering visible approved entries on line 219. Points earned by quarantined entries remain in `aggregation.totalPointsAwarded` and are used as the denominator for `voteSharePercentage`. When quarantined entries are stripped from `items`, the displayed points do not match `leaderboard.totalPoints`, and vote shares sum to less than 100%.
- Reproduction Steps:
    1. Create a round with one approved entry and one quarantined entry.
    2. Cast votes for both entries.
    3. Fetch the leaderboard.
    4. Observe `leaderboard.totalPoints` includes points for the hidden quarantined entry, and the eligible entry's vote share is 50% instead of 100%.
- Standalone Reproducer: `apps/api/test/Defects/LeaderboardQuarantineSkew.test.ts`
- Impact: Inconsistent public voting metrics and audit discrepancies.
- Recommended Remediation: Filter out quarantined and unapproved entries before passing entry IDs and ballots to `aggregateScores`, or recalculate `totalPointsAwarded` and vote share percentages post-filter.

#### B11: TaskCommands Autocomplete 100-Page Sequential Pagination Latency

- Component: `apps/discord/src/Commands/TaskCommands.ts`, lines 150-162, 196-208, 256-268; `apps/discord/src/Api/PlatformApiClient.ts`, lines 180-189
- Failure Mode: Typing into task autocomplete inputs triggers up to 100 sequential HTTP requests, exceeding Discord 3-second autocomplete timeout.
- Root Cause: On every autocomplete keystroke in `/take-task`, `/release-task`, and `/submit-task`, `context.api.listAllShots()` executes a sequential loop fetching up to 100 pages from the platform API. Autocomplete cannot be deferred in Discord.
- Reproduction Steps:
    1. Trigger autocomplete in `/take-task`.
    2. Observe network traffic execute up to 100 sequential HTTP requests while Discord displays "Loading options failed".
- Standalone Reproducer: `apps/discord/test/Defects/TaskAutocompletePagination.test.ts`
- Impact: Broken autocomplete experience and high backend load.
- Recommended Remediation: Add search and pagination query parameters to `/shots` (e.g. `GET /shots?query=...&limit=25`) or cache active tasks in memory within the Discord bot.

#### B12: Task Submit and Release Authorization Inconsistencies

- Component: `apps/discord/src/Commands/TaskCommands.ts`, lines 187-192, 232-237, 248
- Failure Mode: `/submit-task` allows supervisors to submit work for shots they do not own, outputs the supervisor Discord ID as claimant, and fails against the backend API. `/release-task` allows cross-department supervisors to attempt release, triggering an unhandled 403 error.
- Root Cause: In `/submit-task`, `!isStaff && !isClaimant` allows supervisors to bypass client validation, but the backend `assertActiveClaim` strictly rejects non-claimants. Line 248 prints `<@${interaction.user.id}>` as claimant. In `/release-task`, supervisor validation checks global role without verifying department membership, causing backend `ErrorCode.UnauthorizedDepartment` exceptions.
- Reproduction Steps:
    1. Execute `/submit-task` as a supervisor on a task claimed by another contributor.
    2. Observe the bot attempt submission and print the supervisor as claimant.
    3. Execute `/release-task` as a supervisor of Department A on a task in Department B.
    4. Observe an unhandled error response.
- Standalone Reproducer: `apps/discord/test/Defects/TaskAuthorizationInconsistency.test.ts`
- Impact: Confusing UI messages and unhandled errors.
- Recommended Remediation: Enforce that `/submit-task` can only be executed by the claimant. In `/release-task`, verify that the supervisor belongs to the task department before calling `releaseShot`, and translate backend 403 errors into helpful user-facing error messages.

#### B13: Webhook Auto-Discovery Missing and Direct Bot User Fallback

- Component: `apps/discord/src/Services/NotificationDispatcher.ts`, lines 54-63, 104-121; `apps/discord/src/Services/ServerProvisioner.ts`, lines 650-670, 1079-1120; `apps/discord/src/Services/ProfanityFilter.ts`, lines 489-500; `apps/discord/src/Services/RoleReconciliationService.ts`, lines 142-164
- Failure Mode: Telemetry alerts, moderation logs, and guidelines sync post directly under the bot user identity rather than dedicated webhooks when static URLs are not provided in configuration.
- Root Cause: Project invariants dictate: "Telemetry alerts, task logs, moderation logs, and live guidelines/rules sync use Discord Webhooks (auto-discovered or created by bot without requiring manual admin creation)." `NotificationDispatcher` only instantiates `WebhookClient` if static URLs are configured in environment variables, lacking dynamic discovery (`channel.fetchWebhooks()`) or creation (`channel.createWebhook(...)`).
- Reproduction Steps:
    1. Start the bot without static webhook URLs configured.
    2. Trigger a telemetry alert or moderation log.
    3. Observe the message sent via `channel.send()` directly as the bot user.
- Standalone Reproducer: `apps/discord/test/Defects/WebhookDiscovery.test.ts`
- Impact: Invariant violation; inability to customize alert branding or channel routing dynamically.
- Recommended Remediation: Implement an auto-discovery method that queries `channel.fetchWebhooks()`, finds an existing bot-owned webhook, or creates one via `channel.createWebhook()`, caching the webhook client for subsequent dispatches.

#### B14: NotificationConsumer Event Loss on Transient Processing Failure

- Component: `apps/discord/src/Api/NotificationConsumer.ts`, lines 161-174
- Failure Mode: When a notification handler throws an error due to transient network or Discord API failures, the event is permanently lost and never retried.
- Root Cause: In `NotificationConsumer.ts`, `this.handler(notification.data)` is wrapped in a try-catch block. When an error occurs, it is logged, but `this.settings.update` unconditionally advances `notificationCursor = event.id`. On reconnecting to SSE (`/notifications?since=${cursor}`), failed notifications are skipped.
- Reproduction Steps:
    1. Dispatch an event to `NotificationConsumer` while the handler throws a transient Discord API error.
    2. Inspect the saved settings cursor.
    3. Observe `notificationCursor` updated to the failed event ID.
- Standalone Reproducer: `apps/discord/test/Defects/NotificationCursorLoss.test.ts`
- Impact: Permanent loss of task assignment, moderation, and round notifications.
- Recommended Remediation: Only advance `notificationCursor` upon successful handler completion. For repeated failures, implement a retry count or dead-letter log before advancing.

#### B20: Dialog Form State Reset Race Condition

- Component: `apps/web/src/Features/Studio/RoundControls.tsx`, lines 74-111
- Failure Mode: User-typed edits in round editing dialogs are wiped and reset to initial values when background queries resolve.
- Root Cause: In `RoundControls.tsx`, `useEffect` includes `existingEntries.data` in its dependency array. When opening a binary round dialog, `existingEntries` is fetched asynchronously. While the supervisor types into input fields, `existingEntries.data` resolves and re-triggers `useEffect`, which unconditionally executes `setTitle(round?.title ?? "")`, overwriting in-flight user edits.
- Reproduction Steps:
    1. Open the edit dialog for an existing binary round.
    2. Type a revised title while the entry query is in flight.
    3. Observe input field reset to the original round title upon query completion.
- Standalone Reproducer: `apps/web/test/Defects/RoundDialogStateRace.test.ts`
- Impact: Frustrating user experience and loss of unsaved input data.
- Recommended Remediation: Track a dirty state for user edits, or populate form inputs only when `open` transitions to true rather than on query data resolution.

#### B21: Upload Proxy 50MB Ceiling Discrepancy

- Component: `apps/web/src/app/api/v1/[...path]/route.ts`, lines 50-55; `apps/api/src/Configuration/Environment.ts`, lines 111-115; `apps/web/src/Api/Uploads.ts`, lines 92-105
- Failure Mode: Uploading large deliverables (such as `.blend` files or high-resolution review videos up to 2GB) fails with HTTP 413 Payload Too Large when falling back to the Next.js API streaming proxy.
- Root Cause: The platform backend allows deliverables up to 2GB (`DELIVERABLE_MAX_BYTES`). However, the Next.js API route proxy in `apps/web/src/app/api/v1/[...path]/route.ts` hardcodes `buffer.byteLength > 50 * 1024 * 1024` (50MB) and returns HTTP 413.
- Reproduction Steps:
    1. Initiate an upload of a 55MB deliverable file where direct S3/WebDAV upload falls back to `/api/v1/uploads/stream`.
    2. Observe Next.js route proxy return HTTP 413 `PAYLOAD_TOO_LARGE`.
- Standalone Reproducer: `apps/web/test/Defects/UploadProxyLimit.test.ts`
- Impact: Failure of legitimate deliverable uploads on fallback proxy paths.
- Recommended Remediation: Expand the streaming upload proxy ceiling to 2GB (`2 * 1024 * 1024 * 1024`) or stream the request body directly without loading the entire payload into an in-memory buffer.

#### B22: Grabbox Route Parameter UUID-Only Restriction

- Component: `apps/web/src/app/grabbox/[shotId]/page.tsx`, lines 9-13; `apps/web/src/Features/Grabbox/ShotView.tsx`, lines 324, 389-390
- Failure Mode: Navigating to a task using its business identifier (e.g. `/grabbox/SC01-010`) results in an unhandled Next.js 404 page.
- Root Cause: `apps/web/src/app/grabbox/[shotId]/page.tsx` validates `shotId` strictly with `z.uuid().safeParse(shotId)`. If validation fails, it calls `notFound()`. However, Project Stairway uses human-readable shot codes (`shotCode`) in URLs, Discord notifications, and supervisor reviews.
- Reproduction Steps:
    1. Navigate to `/grabbox/SC01-010` in the browser.
    2. Observe immediate Next.js 404 Not Found error.
- Standalone Reproducer: `apps/web/test/Defects/GrabboxRouteParams.test.ts`
- Impact: Broken links from Discord notifications, documentation, and external references.
- Recommended Remediation: Update route parameter validation to accept either a UUID or a valid shotCode string pattern (`/^[A-Za-z0-9_-]{2,32}$/`).

---

### Low Severity Findings

#### B15: Rules Publishing 4000-Char Truncation

- Component: `apps/discord/src/Services/ServerProvisioner.ts`, lines 1071, 1077-1078; `apps/discord/src/Discord/Ui.ts`, lines 34-41, 54
- Failure Mode: Long platform guidelines documents exceeding 4,000 characters are truncated with an ellipsis, silently dropping trailing sections.
- Root Cause: `ServerProvisioner.ts` fetches rules markdown from `/api/v1/documents/:slug` and concatenates all sections into a single string passed to `panel(null, rulesContent)`. `Ui.ts` enforces a hard 4,000-character ceiling on `TextDisplayBuilder`, slicing the content and appending an ellipsis (`…`).
- Reproduction Steps:
    1. Configure a guidelines document exceeding 4,000 characters on the backend.
    2. Run rules sync via `/bot-setup`.
    3. Observe trailing sections dropped in the published Discord message.
- Standalone Reproducer: Documented Static Inspection (`Ui.ts:34-41`)
- Impact: Incomplete community rules and guidelines posted to Discord.
- Recommended Remediation: Split long documents into multiple message chunks or multiple panels before dispatching.

#### B16: Discord Typography and Emoji Invariant Violations

- Component: `apps/discord/src/Commands/ReminderCommands.ts`, lines 53, 67; `apps/discord/src/Services/ReminderScheduler.ts`, line 59; `apps/discord/src/Services/RoleReconciliationService.ts`, lines 153, 156; `apps/discord/src/Commands/InfoCommands.ts`, line 9
- Failure Mode: Emojis and stale commands (`/vote`, `/ballot`) are rendered in Discord messages and help listings.
- Root Cause: Project rules dictate: "No Emojis: Never use emojis anywhere in the codebase (UI strings, Discord bot messages, titles, rules, notifications, logs, or comments)." Several Discord service files contain emoji characters and reference deprecated voting slash commands.
- Reproduction Steps:
    1. Inspect `ReminderCommands.ts:53, 67`, `ReminderScheduler.ts:59`, and `InfoCommands.ts:9`.
    2. Observe unicode emojis and stale command references.
- Standalone Reproducer: Documented Static Inspection
- Impact: Non-compliance with Project Stairway typography invariants.
- Recommended Remediation: Remove all emojis from messages and format strings. Remove `/vote` and `/ballot` references from `InfoCommands.ts`.

#### B17: Claim Task Button Active Post-Claim

- Component: `apps/discord/src/Services/TaskForum.ts`, lines 150-169; `apps/discord/src/Views/TaskViews.ts`, line 53
- Failure Mode: After a task is claimed, the "Claim Task" button remains active on the forum thread starter message.
- Root Cause: `TaskForum.setStatus` updates applied forum tags and thread lock status, but does not edit the initial starter post created by `threadStarterMessage()`. The button remains interactive.
- Reproduction Steps:
    1. Claim a task via `/take-task`.
    2. Navigate to the task forum thread.
    3. Observe that the starter message still displays an active "Claim Task" button.
- Standalone Reproducer: Documented Static Inspection
- Impact: Confusing UI leading to redundant claim attempts.
- Recommended Remediation: Edit the starter message in `TaskForum.setStatus` to disable or remove the action row button when the task is in `Claimed` or `Submitted` status.

#### B23: Certified Standings Stale Cache on Round Finalization

- Component: `apps/web/src/Features/Studio/RoundControls.tsx`, lines 465-488; `apps/web/src/Features/Voting/Standings.tsx`, line 118
- Failure Mode: Finalizing and certifying a round does not invalidate cached standings, leaving viewers with stale, uncertified results.
- Root Cause: In `Standings.tsx`, `CertifiedResults` sets `staleTime: Infinity` for `queryKeys.results(roundId)`. In `RoundControls.tsx`, `finalize` invalidates `queryKeys.roundsAll` and `queryKeys.round(round.id)`, but fails to invalidate `queryKeys.results(round.id)` or `queryKeys.leaderboard(round.id)`.
- Reproduction Steps:
    1. View a round standings page as a spectator.
    2. In another tab as a supervisor, finalize the round.
    3. Return to the spectator tab.
    4. Observe stale non-finalized standings until a hard browser refresh.
- Standalone Reproducer: Documented Static Inspection
- Impact: Display of stale election and voting outcomes.
- Recommended Remediation: Add `queryClient.invalidateQueries({ queryKey: queryKeys.results(round.id) })` and `queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard(round.id) })` to `refresh()` in `RoundControls.tsx`.

#### B24: Web Typography and Emoji Invariant Violations

- Component: `apps/web/src/Features/Voting/Standings.tsx`, line 71; `apps/web/src/Features/Grabbox/ShotMeta.tsx`, line 27; `apps/web/src/Features/Studio/DashboardPage.tsx`, lines 99, 106, 111, 114, 118; `apps/web/src/Features/Studio/RoundIntegrity.tsx`, line 225; `apps/web/src/Features/Studio/TelemetryCharts.tsx`, lines 1451, 1455, 1458; `apps/web/src/Features/Studio/Tickets/TicketsPage.tsx`, lines 63-65, 79; `apps/web/src/Features/Studio/Feedback/FeedbackPage.tsx`, line 336; `apps/web/src/Features/Studio/Tickets/TicketTypeDialog.tsx`, line 371; `apps/web/src/Features/Studio/Tickets/TicketCategoryDialog.tsx`, line 133
- Failure Mode: Em dashes, en dashes, and emojis are embedded in web UI components.
- Root Cause: Project rules dictate: "Standard ASCII Punctuation Only: Never use em dashes, en dashes, smart quotes, or fancy decorative glyphs. Use standard ASCII hyphens (-)" and "No Emojis: Never use emojis anywhere in the codebase". Several web client components use non-ASCII dashes and emoji placeholders.
- Reproduction Steps:
    1. Search for non-ASCII dashes (`\u2014`, `\u2013`) and emojis in `apps/web/src`.
    2. Observe multiple occurrences in table cells, empty states, and dialog placeholders.
- Standalone Reproducer: Documented Static Inspection
- Impact: Non-compliance with Project Stairway typography standards.
- Recommended Remediation: Replace all em dashes and en dashes with standard ASCII hyphens (`-`). Remove all emoji characters from placeholders and component icons.

---

## Test Suite Execution and Verification Matrix

### Summary of Automated Vitest Reproducers

The 19 standalone Vitest reproducer suites cover all Medium, High, and Critical findings across the 4 workspaces:

| Suite Path                                                         | Target Bug      | Severity | Tests in Suite | Defect Failures        | Status on Current Code                                                |
| ------------------------------------------------------------------ | --------------- | -------- | -------------- | ---------------------- | --------------------------------------------------------------------- |
| `apps/api/test/Defects/UploadStreamSecurity.test.ts`               | B1              | Critical | 3              | 3                      | Fails as intended (HTTP 200 instead of 403)                           |
| `apps/api/test/Defects/TelemetrySseLeak.test.ts`                   | B2              | High     | 1              | 1                      | Fails as intended (leaks ticket.activity)                             |
| `apps/api/test/Defects/ScriptsAdminRbac.test.ts`                   | B3              | High     | 2              | 2                      | Fails as intended (HTTP 200 instead of 403)                           |
| `packages/scoring/test/Defects/BayesianShrinkage.test.ts`          | B4              | Medium   | 4              | 4                      | Fails as intended (evaluates to NaN)                                  |
| `packages/scoring/test/Defects/EvaluateRankSeparation.test.ts`     | B5              | Medium   | 3              | 3                      | Fails as intended (z=999, p=0, decisive lead on N=1)                  |
| `apps/api/test/Defects/LeaderboardQuarantineSkew.test.ts`          | B6              | Medium   | 1              | 1                      | Fails as intended (totalPoints includes quarantined entry)            |
| `apps/discord/test/Defects/ReminderSchedulerOverflow.test.ts`      | B7              | High     | 2              | 2                      | Fails as intended (delay clamped to 1ms overflow)                     |
| `apps/discord/test/Defects/ServerProvisionerInvariants.test.ts`    | B8              | High     | 4              | 4                      | Fails as intended (setParent, setPosition, delete called)             |
| `apps/discord/test/Defects/AssignRoleRbac.test.ts`                 | B9              | High     | 2              | 2                      | Fails as intended (missing default_member_permissions, allows caller) |
| `apps/discord/test/Defects/InteractionTimeout.test.ts`             | B10             | High     | 3              | 3                      | Fails as intended (missing deferReply/deferUpdate)                    |
| `apps/discord/test/Defects/TaskAutocompletePagination.test.ts`     | B11             | Medium   | 2              | 2                      | Fails as intended (unpaginated listAllShots loop)                     |
| `apps/discord/test/Defects/TaskAuthorizationInconsistency.test.ts` | B12             | Medium   | 3              | 3                      | Fails as intended (supervisor attribution, non-claimant allowed)      |
| `apps/discord/test/Defects/WebhookDiscovery.test.ts`               | B13             | Medium   | 2              | 2                      | Fails as intended (fetchWebhooks not called, channel.send called)     |
| `apps/discord/test/Defects/NotificationCursorLoss.test.ts`         | B14             | Medium   | 1              | 1                      | Fails as intended (cursor advances on handler throw)                  |
| `apps/web/test/Defects/ScreenplayStudioNavigationRbac.test.ts`     | B18             | High     | 4              | 1                      | Fails as intended (invited non-admin sees studio in nav)              |
| `apps/web/test/Defects/VotingStateDesync.test.ts`                  | B19             | High     | 4              | 1                      | Fails as intended (hasAlreadySubmitted is false for pending)          |
| `apps/web/test/Defects/RoundDialogStateRace.test.ts`               | B20             | Medium   | 3              | 1                      | Fails as intended (form inputs overwritten by query resolution)       |
| `apps/web/test/Defects/UploadProxyLimit.test.ts`                   | B21             | Medium   | 2              | 1                      | Fails as intended (returns 413 PAYLOAD_TOO_LARGE)                     |
| `apps/web/test/Defects/GrabboxRouteParams.test.ts`                 | B22             | Medium   | 3              | 1                      | Fails as intended (calls notFound on shotCode)                        |
| **Total Reproducers**                                              | **19 Findings** |          | **49 Tests**   | **38 Defect Failures** | **19/19 Suites Execute and Fail as Intended**                         |

### Vitest Execution Commands

#### 1. Execute Scoring Defect Reproducers

```bash
npx vitest run packages/scoring/test/Defects
```

Observed Output:

```
Test Files  2 failed (2)
     Tests  7 failed (7)
Duration  188ms
```

- `packages/scoring/test/Defects/BayesianShrinkage.test.ts`:
    - `AssertionError: expected false to be true` at line 25:62 (regularizedMeanScore is NaN on priorK=Infinity)
    - `AssertionError: expected true to be false` at line 35:59 (regularizedMeanScore is NaN on priorK=NaN)
    - `AssertionError: expected false to be true` at line 45:62 (regularizedMeanScore is NaN on totalEntries=NaN)
    - `AssertionError: expected false to be true` at line 56:66 (regularizedTotalScore is NaN on leaderboard sort)
- `packages/scoring/test/Defects/EvaluateRankSeparation.test.ts`:
    - `AssertionError: expected 'DECISIVE_LEAD' not to be 'DECISIVE_LEAD'` at line 29:35
    - `AssertionError: expected 0 to be greater than 0.01` at line 41:31
    - `AssertionError: expected 999 to be less than 100` at line 52:31

#### 2. Execute API Defect Reproducers

```bash
npx vitest run apps/api/test/Defects/UploadStreamSecurity.test.ts apps/api/test/Defects/TelemetrySseLeak.test.ts apps/api/test/Defects/ScriptsAdminRbac.test.ts apps/api/test/Defects/LeaderboardQuarantineSkew.test.ts
```

Observed Output:

```
Test Files  4 failed (4)
     Tests  7 failed (7)
Duration  7.61s
```

- `apps/api/test/Defects/UploadStreamSecurity.test.ts`:
    - `AssertionError: expected 200 to be 403` at line 35:37 (unclaimed shot upload accepted)
    - `AssertionError: expected 200 to be 403` at line 56:37 (path traversal ../../Affirmed/ accepted)
    - `AssertionError: expected 200 to be 403` at line 74:37 (direct affirmed vault upload accepted)
- `apps/api/test/Defects/TelemetrySseLeak.test.ts`:
    - `AssertionError: expected SSE frame not to contain 'ticket.activity'` at line 63:31
- `apps/api/test/Defects/ScriptsAdminRbac.test.ts`:
    - `AssertionError: expected 200 to be 403` at line 29:37 (member allowed to list scripts)
    - `AssertionError: expected 200 to be 403` at line 40:41 (supervisor allowed to list shelves)
- `apps/api/test/Defects/LeaderboardQuarantineSkew.test.ts`:
    - `AssertionError: expected 2 to be 1` at line 106:41 (quarantined entry points included in totalPoints)

#### 3. Execute Discord Bot Defect Reproducers

```bash
npx vitest run apps/discord/test/Defects
```

Observed Output:

```
Test Files  8 failed (8)
     Tests  19 failed (19)
Duration  5.22s
```

- `ReminderSchedulerOverflow.test.ts`: setTimeout delay clamped to 1ms; 30-day reminder fired immediately
- `ServerProvisionerInvariants.test.ts`: setParent, setPosition, delete, and permissionOverwrites.set called
- `AssignRoleRbac.test.ts`: default_member_permissions undefined; unprivileged member not rejected
- `InteractionTimeout.test.ts`: deferReply/deferUpdate not called on mod commands before async fetches
- `TaskAutocompletePagination.test.ts`: listAllShots called; 50 sequential HTTP requests executed
- `TaskAuthorizationInconsistency.test.ts`: supervisor rendered as claimant; non-claimant submission permitted
- `WebhookDiscovery.test.ts`: fetchWebhooks not called; channel.send called directly
- `NotificationCursorLoss.test.ts`: cursor advanced from 100-0 to 101-0 despite handler exception

#### 4. Execute Web Frontend Defect Reproducers

```bash
npx vitest run apps/web/test/Defects
```

Observed Output:

```
Test Files  5 failed (5)
     Tests  5 failed | 11 passed (16)
Duration  4.66s
```

- `ScreenplayStudioNavigationRbac.test.ts`: `AssertionError: expected true to be false` at line 53:57
- `VotingStateDesync.test.ts`: `AssertionError: expected false to be true` at line 99:44
- `RoundDialogStateRace.test.ts`: `AssertionError: expected 'Original Round Title' to be 'Supervisor Revised Title'` at line 135:29
- `UploadProxyLimit.test.ts`: `AssertionError: expected 413 not to be 413` at line 56:37
- `GrabboxRouteParams.test.ts`: `AssertionError: promise rejected "Error: NEXT_HTTP_ERROR_FALLBACK;404"` at line 38:10

### Baseline Regression Suite Verification

To confirm that adding the 19 reproducer suites caused zero regressions or side effects, the entire baseline suite was executed:

- `packages/scoring/test/Scoring.test.ts`: 22 passed (duration: 20ms)
- `apps/discord/test/*.test.ts`: 10 files, 133 passed (duration: 1.91s)
- `apps/web/test/*.test.ts`: 2 files, 57 passed (duration: 26ms)
- `apps/api/test/*.test.ts`: 22 files, 142 passed (duration: 54.14s)
- **Grand Total Baseline**: 35 test files, 354 tests passed with 100% pass rate.

### Static Analysis and Type Verification

- Typecheck: `npm run typecheck` passes with 0 errors across all 6 monorepo workspaces (`@platform/scoring`, `@platform/contracts`, `@platform/api`, `@platform/discord`, `@platform/web`, `@platform/script`).
- Linter: `npm run lint` passes with 0 errors and 0 warnings.
- Typography: Zero unicode emojis, zero em dashes (`\u2014`), and zero en dashes (`\u2013`) in reproducer test files.

---

## Recommended Remediation Roadmap

Remediation should proceed in four sequential phases:

### Phase 1: Security and Access Control Remediation

1. **B1 (`apps/api/src/Modules/Uploads/UploadsRoutes.ts`)**: Restrict `/uploads/stream` to media uploads. Enforce `assertActiveClaim`, filename sanitization, and quota consumption via `POST /shots/:shotId/uploads`. Reject any key containing `..`.
2. **B2 (`apps/api/src/Modules/Telemetry/TelemetryRoutes.ts`)**: Add `!privateActivityTypes.has(parsed.data.type)` to SSE stream filtering.
3. **B3 (`apps/api/src/Modules/Scripts/ScriptsRoutes.ts`)**: Replace `userOnly` with `adminOrService` on all screenplay studio endpoints.
4. **B9 (`apps/discord/src/Commands/ModerationCommands.ts`)**: Set `setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)` and add platform supervisor role checks to `/assign-role`.
5. **B18 (`apps/web/src/Components/Layout/AppSidebar.tsx`)**: Restrict `/studio/script` sidebar item visibility strictly to `Role.Admin`.

### Phase 2: Reliability and Invariant Remediation

1. **B7 (`apps/discord/src/Services/ReminderScheduler.ts`)**: Clamp timer delay to `2_147_483_647` ms and verify reminder due date before dispatch.
2. **B8 (`apps/discord/src/Services/ServerProvisioner.ts`)**: Remove channel re-parenting, re-ordering, and deletion calls in `/bot-setup`. Use non-destructive permission patching.
3. **B10 (`apps/discord/src/Commands/ModStatusCommands.ts`)**: Add immediate `deferReply` and `deferUpdate` calls prior to sequential Discord API fetches.
4. **B11 (`apps/discord/src/Commands/TaskCommands.ts`)**: Add search and limit parameters to `/shots` API queries; avoid unpaginated 100-page loops during autocomplete.
5. **B14 (`apps/discord/src/Api/NotificationConsumer.ts`)**: Advance `notificationCursor` only after successful handler execution.

### Phase 3: Scoring, Data, and State Synchronization Remediation

1. **B4 (`packages/scoring/src/BayesianShrinkage.ts`)**: Validate that `priorK`, `totalEntries`, and `totalBallots` are finite numbers.
2. **B5 (`packages/scoring/src/EvaluateRankSeparation.ts`)**: Require minimum sample thresholds before evaluating decisive leads.
3. **B6 (`apps/api/src/Modules/Leaderboards/LeaderboardService.ts`)**: Filter out quarantined entries prior to score aggregation.
4. **B12 (`apps/discord/src/Commands/TaskCommands.ts`)**: Enforce claimant-only submissions and verify supervisor department membership in task commands.
5. **B19 (`apps/web/src/Features/Voting/RoundView.tsx`)**: Check both approved and pending review entries in `hasAlreadySubmitted`.
6. **B20 (`apps/web/src/Features/Studio/RoundControls.tsx`)**: Avoid resetting user-typed form inputs upon query resolution.
7. **B21 (`apps/web/src/app/api/v1/[...path]/route.ts`)**: Expand streaming proxy limit to 2GB to match deliverable size ceilings.
8. **B22 (`apps/web/src/app/grabbox/[shotId]/page.tsx`)**: Permit human-readable `shotCode` strings in route parameter validation.

### Phase 4: Polish, Typography, and Formatting Cleanup

1. **B13 (`apps/discord/src/Services/NotificationDispatcher.ts`)**: Implement dynamic webhook auto-discovery and creation.
2. **B15 (`apps/discord/src/Services/ServerProvisioner.ts`)**: Split long rules documents across multiple message blocks.
3. **B16 & B24 (`apps/discord`, `apps/web`)**: Replace em dashes and en dashes with ASCII hyphens; remove emojis.
4. **B17 (`apps/discord/src/Services/TaskForum.ts`)**: Disable or remove the claim button on forum starter messages upon claiming.
5. **B23 (`apps/web/src/Features/Studio/RoundControls.tsx`)**: Invalidate `queryKeys.results` and `queryKeys.leaderboard` upon round finalization.
