import { DocumentSlug } from "@platform/contracts";
import type { StoredDocumentSection } from "../../Infrastructure/Database/Schema.js";

export interface DefaultDocument {
    readonly title: string;
    readonly sections: readonly StoredDocumentSection[];
}

export const defaultDocuments: Readonly<Record<DocumentSlug, DefaultDocument>> = {
    [DocumentSlug.Guidelines]: {
        title: "Guidelines",
        sections: [
            {
                id: "overview",
                title: "Overview & Roles",
                html: "<p>Project Stairway is an open community-made 3D animated film. At the helm of this project is MattSquared, CEO of Squared Media (creators of <em>Songs of War</em>), teaming up with experienced community artists and leads to bring the vision of a community-made movie to life.</p><p>Project Stairway has two core goals:</p><ol><li><strong>Produce a community-made animated movie</strong> of the highest quality in Blender.</li><li><strong>Create a positive, safe, and free learning community</strong> where anyone can level up their skills — whether you are sharing work in Discord to get feedback from experienced artists, voting on major production choices, or claiming 3D shots as a contributor.</li></ol><p><strong>Curated Democracy:</strong> Not every single production decision can be voted on (otherwise the movie would take forever to make). To balance production speed with community agency, the leadership team curates community pitches down to the top 5 feasible options or less so you can vote on solid, achievable directions without getting overwhelmed.</p><p>Here is how the roles work:</p><ul><li><strong>Member:</strong> Anyone who joins and accepts the terms. You can browse active rounds, check the grabbox, and view community submissions.</li><li><strong>Voter:</strong> As soon as you cast a vote in any active voting round, you automatically get the Voter role. It is an indicator badge to show you actively vote (no permission overhead, just shows you participate).</li><li><strong>Contributor:</strong> As soon as you submit work for a grabbox task or have an approved round entry, you automatically get the Contributor role.</li><li><strong>Supervisors & Admins:</strong> Studio leads and department heads. Supervisors have actual permission overhead: they create rounds, curate submissions, set up grabbox shots, QA incoming <code>.blend</code> project files, give feedback in Discord, and merge approved shots into the master production timeline.</li></ul>"
            },
            {
                id: "voting",
                title: "Voting System",
                html: "<p>We run two different types of voting rounds depending on what we are deciding for production:</p><h4>1. Ranked 3-2-1 Choice (Borda Count)</h4><p>Used for open creative pitches, character concepts, soundtrack directions, and story proposals where the community pitches multiple entries (curated to 5 options or less).</p><p><strong>Step-by-step flow:</strong></p><ol><li><strong>Pitches open:</strong> A round starts in the <em>Open</em> stage where members submit concept entries with descriptions and preview media.</li><li><strong>Review & shortlist:</strong> Supervisors review submitted pitches and approve the strongest 5 entries for the voting ballot.</li><li><strong>Voting opens:</strong> The round transitions to <em>Voting</em>. You browse the entries and pick your top 3 favorites in order (1st, 2nd, and 3rd).</li><li><strong>Point calculation:</strong> Every ballot distributes 6 total points across your picks: 1st pick gets <strong>3 points</strong>, 2nd pick gets <strong>2 points</strong>, and 3rd pick gets <strong>1 point</strong>.</li></ol><pre><code>Score = (3 × 1st_picks) + (2 × 2nd_picks) + (1 × 3rd_picks)</code></pre><p><a href=\"https://en.wikipedia.org/wiki/Borda_count\">Read more about Borda count on Wikipedia</a></p><p><strong>Bayesian Score Smoothing:</strong> When a round just opens, if only a couple people vote, an entry could shoot up to 100% and look artificially boosted. To prevent early volatility, we apply Bayesian score smoothing. It adds a small prior weight (K) based on the round average so standings stay stable and reflect genuine consensus as more ballots roll in.</p><pre><code>Smoothed Score = (Total Points + K × Average Score) / (Total Ballots + K)</code></pre><p><a href=\"https://en.wikipedia.org/wiki/Bayesian_average\">Read more about Bayesian average on Wikipedia</a></p><p><strong>Round closes & winner decided:</strong> Once the timer ends, results are locked and the highest-scoring concept wins the round and moves into the production grabbox.</p><hr /><h4>2. Binary Choice (Either / Or)</h4><p>Used for fast production decisions where we need a direct call between two specific choices (like choosing between two lighting setups, color palettes, or storyboard options).</p><p><strong>Step-by-step flow:</strong></p><ol><li><strong>Creation:</strong> A Supervisor sets up the round with exactly two pre-filled options (Option A and Option B), complete with descriptions and preview media. There is no open pitch stage.</li><li><strong>Voting:</strong> The round goes straight to <em>Voting</em>. You pick either Option A or Option B.</li><li><strong>Majority calculation:</strong> Each vote counts directly toward that option percentage.</li></ol><pre><code>Option Percentage = (Option Votes / Total Votes) × 100%</code></pre><p><a href=\"https://en.wikipedia.org/wiki/Majority_rule\">Read more about Majority rule on Wikipedia</a></p><p><strong>Outcome:</strong> When voting closes, the option with the majority of votes wins and the decision is immediately applied to the scene in production.</p>"
            },
            {
                id: "fair-play",
                title: "Fair Play & Anti-Cheat",
                html: "<p>We want production decisions to reflect what the real community wants, not who has the most Discord alts or scripts. Here are the ground rules:</p><ol><li><strong>1 person = 1 account:</strong> You can only vote from your single primary account. Using alternate accounts, bot scripts, or puppet profiles to stack votes on an option is strictly forbidden.</li><li><strong>Automated bot & ring detection:</strong> Active rounds run live checks for suspicious behavior. If an option suddenly gets a wave of fresh accounts voting in a tight cluster or ballot stuffing is detected, it gets flagged for supervisor audit.</li><li><strong>Blacklisting:</strong> If an account is caught cheating, brigading, or exploiting, it gets blacklisted. Blacklisted users cannot vote on rounds, propose entries, or claim grabbox tasks, and any active claimed shots are immediately released back to the grabbox.</li></ol>"
            },
            {
                id: "grab-box",
                title: "Grab-Box System",
                html: "<p>The <a href=\"/grabbox\">grabbox</a> is where 3D artists pick up production shots to work on.</p><p><strong>How the grab-box works:</strong></p><ol><li><strong>Finding available shots:</strong> Browse open shots and filter by department (layout, 3D modeling, rigging, animation, lighting, comp, audio).</li><li><strong>Difficulty tiers & timers:</strong> Each shot has an assigned difficulty tier with a fixed turnaround deadline:<br />• <strong>Tier 1:</strong> 1-2 days (quick prop fixes, cleanup, basic layout).<br />• <strong>Tier 2:</strong> 3-4 days (character props, environment assets, secondary animation).<br />• <strong>Tier 3:</strong> 5-7 days (hero character animation, complex scene lighting, detailed set dressing).<br />• <strong>Tier 4:</strong> 10-14 days (multi-character sequences, hero shots, heavy simulations).<br /><em>Note: Senior-locked shots have a brief priority window for experienced contributors before opening to everyone.</em></li><li><strong>Claiming a shot:</strong> When you claim a shot, you are the only one working on it. Your deadline countdown starts immediately.</li><li><strong>Releasing a shot:</strong> If something comes up and you cannot finish the task in time, release it early so another contributor can grab it without stalling production.</li><li><strong>Required deliverables:</strong> Every grabbox submission requires two files:<br />• The inspectable <code>.blend</code> project source file (clean collections, proper naming, packed textures/assets).<br />• A compressed video preview (MP4/WebM) showing viewport playback or render.</li></ol>"
            },
            {
                id: "pipeline",
                title: "Production Pipeline",
                html: "<p>Here is the step-by-step lifecycle of how a community idea moves from a vote all the way into the final film:</p><ol><li><strong>Community decision:</strong> A voting round concludes, locking in the winning concept, storyline direction, or asset choice.</li><li><strong>Shot breakdown:</strong> Supervisors break down the winning idea into individual 3D tasks and publish them to the grabbox with scene notes, storyboard references, and blender templates.</li><li><strong>Task execution:</strong> A contributor claims the shot, builds the assets or animation in Blender, and submits the <code>.blend</code> file and video preview.</li><li><strong>QA & Discord feedback:</strong> When a task is submitted, a dedicated review thread opens automatically in the studio Discord. Supervisors inspect the scene file, check technical standards, and provide feedback or requested tweaks.</li><li><strong>Approval & master integration:</strong> Once approved by a supervisor, the contributor receives the Contributor role badge, the shot is marked complete, and the assets are merged directly into the master film edit.</li></ol>"
            }
        ]
    },
    [DocumentSlug.Terms]: {
        title: "Terms of Service",
        sections: [
            {
                id: "agreement",
                title: "Agreement",
                html: '<p>By using Project Stairway you agree to these terms, the <a href="/legal/privacy">Privacy Policy</a> and the <a href="/legal/acceptable-use">Acceptable Use Policy</a>.</p>'
            },
            {
                id: "accounts",
                title: "Accounts",
                html: "<p>One account per person. Verify your email to vote.</p>"
            },
            {
                id: "content",
                title: "Your content",
                html: "<p>You keep ownership of what you submit and let the project use it.</p>"
            },
            {
                id: "contact",
                title: "Contact",
                html: "<p>[Contact details]</p>"
            }
        ]
    },
    [DocumentSlug.Privacy]: {
        title: "Privacy Policy",
        sections: [
            {
                id: "data",
                title: "What we collect",
                html: "<p>Your Discord ID, username and avatar, and what you do on the platform. We don't store your email address, only a hash of it.</p>"
            },
            {
                id: "contact",
                title: "Contact",
                html: "<p>[Contact details]</p>"
            }
        ]
    },
    [DocumentSlug.AcceptableUse]: {
        title: "Acceptable Use Policy",
        sections: [
            {
                id: "rules",
                title: "Rules",
                html: "<p>Be respectful. No bots, alternate accounts or vote manipulation.</p>"
            }
        ]
    }
};
