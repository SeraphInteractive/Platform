import { DocumentSlug } from "@platform/contracts";
import type { StoredDocumentSection } from "../../Infrastructure/Database/Schema.js";

export interface DefaultDocument {
    readonly title: string;
    readonly sections: readonly StoredDocumentSection[];
}

export const defaultDocuments: Readonly<Record<DocumentSlug, DefaultDocument>> = {
    [DocumentSlug.Guidelines]: {
        title: "Guidelines & Studio Charter",
        sections: [
            {
                id: "overview",
                title: "Overview & Roles",
                html: "<p>Project Stairway is an open community-driven 3D animated film production. Headed by MattSquared, CEO of Squared Media (creators of <em>Songs of War</em>), alongside experienced lead artists and supervisors, Project Stairway unites open-source Blender tooling with community-led decision making.</p><p>Project Stairway operates on two core pillars:</p><ol><li><strong>Produce a studio-grade animated film</strong> utilizing Blender and modern open production pipelines.</li><li><strong>Foster a positive, collaborative, and free learning environment</strong> where artists of all levels can build their skills, receive direct lead feedback, participate in democratic film rounds, and claim production tasks.</li></ol><p><strong>Curated Democracy:</strong> To balance open participation with production velocity, the leadership team curates community pitches down to the top 5 feasible candidates before opening ballots for voting.</p><p><strong>Role Structure & Hierarchy:</strong></p><ul><li><strong>Member:</strong> Base community role upon joining and accepting terms. Enables browsing rounds, task grab-box discovery, and viewing public submissions.</li><li><strong>Voter:</strong> Automatically granted upon casting a verified ballot in any active round. Signifies active democratic participation.</li><li><strong>Contributor:</strong> Automatically granted upon submitting a Grab-Box deliverable or having a creative round pitch approved for the ballot.</li><li><strong>Supervisors & Leads:</strong> Single-seat department heads (Technical Director, Art Director, Editorial, Layout, Modeling, Rigging, Surfacing, Animation) responsible for task curation, technical QA, <code>.blend</code> scene ingestion, and timeline integration.</li><li><strong>Executive Team:</strong> Producer, Creative Director, Production Manager, and System Admins overseeing creative direction, procedural arbitration, and platform integrity.</li></ul>"
            },
            {
                id: "conduct",
                title: "Code of Conduct & Studio Demeanor",
                html: "<p>Participation in Project Stairway requires adherence to strict professional and community standards:</p><ul><li><strong>Constructive Professionalism:</strong> Critique technical execution, topology, lighting, and performance objectively. Personal attacks, insults, or harassment targeting individuals will not be tolerated.</li><li><strong>Zero Tolerance Policy:</strong> Discrimination, hate speech, bigotry, harassment, defamation, threats, toxic disruption, and predatory behavior result in immediate termination of server membership and platform access.</li><li><strong>Channel Discipline:</strong> Keep discussions on-topic within relevant department channels and threads. Commercial solicitation, unsolicited DMs, off-topic spam, and self-promotion are strictly prohibited.</li><li><strong>Good-Faith Collaboration:</strong> Honor turnaround commitments, communicate obstacles early, and support peers across all skill levels.</li></ul>"
            },
            {
                id: "licensing",
                title: "Intellectual Property, Licensing & Contributor Agreement",
                html: "<p>By participating as a contributor, voter, or creator on Project Stairway, you agree to the following intellectual property terms:</p><ol><li><strong>Authorship Warranty:</strong> All submitted assets (3D models, textures, animations, audio, rigs, shaders, code, and pitches) must be 100% original work authored by you, in the public domain, or permissibly open-source licensed.</li><li><strong>Prohibited Material:</strong> Uploading ripped assets from third-party games, uncredited copyrighted models, or AI outputs without verifiable training provenance is strictly forbidden.</li><li><strong>Irrevocable Production License:</strong> By submitting any deliverable, <code>.blend</code> file, or creative pitch to the platform or grab-box, you grant Project Stairway and Squared Media an irrevocable, perpetual, worldwide, royalty-free license to use, adapt, modify, composite, animate, render, and distribute your work in the official film release, behind-the-scenes material, and related promotional media.</li><li><strong>Attribution Rights:</strong> All contributors with approved deliverables are permanently credited in the film's official credits ledger and on the web platform under their chosen verified display name.</li></ol>"
            },
            {
                id: "voting",
                title: "Voting System & Mathematical Invariants",
                html: '<p>We run two distinct voting mechanisms tailored to creative pitches versus binary production choices:</p><h4>1. Ranked 3-2-1 Choice (Borda Count)</h4><p>Used for open creative pitches, character concepts, soundtrack directions, and story proposals where the community pitches multiple entries (curated to 5 options or less).</p><p><strong>Step-by-step flow:</strong></p><ol><li><strong>Pitches open:</strong> A round starts in the <em>Open</em> stage where members submit concept entries with descriptions and preview media.</li><li><strong>Review & shortlist:</strong> Supervisors review submitted pitches and approve the strongest 5 entries for the voting ballot.</li><li><strong>Voting opens:</strong> The round transitions to <em>Voting</em>. You browse the entries and pick your top 3 favorites in order (1st, 2nd, and 3rd).</li><li><strong>Point calculation:</strong> Every ballot distributes 6 total points across your picks: 1st pick gets <strong>3 points</strong>, 2nd pick gets <strong>2 points</strong>, and 3rd pick gets <strong>1 point</strong>.</li></ol><pre><code>Score = (3 × 1st_picks) + (2 × 2nd_picks) + (1 × 3rd_picks)</code></pre><p><strong>Mathematical Invariants:</strong> Total round points are strictly conserved: <code>Total_Points = 6 × Total_Ballots</code>.</p><p><strong>Bayesian Score Smoothing:</strong> To prevent low-sample volatility when a round opens, Bayesian shrinkage regularizes scores against the round mean (K=30 prior weight) so standings stay stable and reflect genuine consensus.</p><pre><code>Smoothed Score = (Total Points + K × Average Score) / (Total Ballots + K)</code></pre><hr /><h4>2. Binary Choice (Either / Or)</h4><p>Used for fast production decisions between two specific technical or artistic directions (e.g. lighting setups, color grading, or layout cameras).</p><p><strong>Step-by-step flow:</strong></p><ol><li><strong>Creation:</strong> A Supervisor sets up the round with Option A and Option B, including descriptions and visual references.</li><li><strong>Voting:</strong> The round goes straight to <em>Voting</em>. You pick either Option A or Option B.</li><li><strong>Majority calculation:</strong> Each vote counts directly toward that option percentage.</li></ol><pre><code>Option Percentage = (Option Votes / Total Votes) × 100%</code></pre>'
            },
            {
                id: "fair-play",
                title: "Fair Play & Anti-Cheat Telemetry",
                html: "<p>To ensure democratic integrity, the platform deploys real-time anomaly detection:</p><ol><li><strong>One Person, One Account (Anti-Sybil):</strong> Exactly one account per individual, verified via zero-knowledge HMAC-SHA256 email hashing. Multi-accounting, sockpuppeting, and vote farming are strictly prohibited.</li><li><strong>Velocity Burst Auditing:</strong> Sliding 5-minute velocity checks flag rapid automated surges (Z > 2.5) for supervisor inspection.</li><li><strong>Rank Entropy Monitoring:</strong> Bullet-voting rings and coordinated collusion are detected via rank entropy analysis (H < 0.35).</li><li><strong>Permanent Blacklisting:</strong> Confirmed fraudulent actors are immediately quarantined, active ballots invalidated, and accounts blacklisted across Discord and the web platform.</li></ol>"
            },
            {
                id: "grab-box",
                title: "Grab-Box System & Deliverable Standards",
                html: '<p>The <a href="/grabbox">Grab-Box</a> connects contributors directly with production tasks.</p><ol><li><strong>Department Filtering:</strong> Discover open shots filtered by department (layout, 3D modeling, rigging, animation, lighting, comp, audio).</li><li><strong>Difficulty Tiers & Deadlines:</strong><br />• <strong>Tier 1:</strong> 1–2 days (prop fixes, topology cleanup, basic layout).<br />• <strong>Tier 2:</strong> 3–4 days (character props, environment assets, secondary animation).<br />• <strong>Tier 3:</strong> 5–7 days (hero character animation, complex scene lighting, detailed set dressing).<br />• <strong>Tier 4:</strong> 10–14 days (multi-character sequences, hero shots, heavy simulations).</li><li><strong>Claim Exclusivity:</strong> Claiming a task grants temporary exclusive ownership. Timers begin immediately.</li><li><strong>Proactive Task Release:</strong> If unable to complete work before the deadline, release it immediately with <code>/release-task</code> to avoid blocking downstream departments.</li><li><strong>Mandatory Deliverables:</strong> Submissions require an inspectable <code>.blend</code> file (clean collections, packed assets, non-destructive modifiers) alongside a compressed viewport render video (<code>MP4</code>/<code>WebM</code>).</li></ol>'
            },
            {
                id: "pipeline",
                title: "Production Pipeline & Supervisor QA",
                html: "<p>The end-to-step production lifecycle:</p><ol><li><strong>Round Resolution:</strong> A voting round certifies the winning concept or artistic choice.</li><li><strong>Task Breakdown:</strong> Department leads convert the decision into Grab-Box tasks with storyboards, references, and blender template files.</li><li><strong>Contributor Execution:</strong> A contributor claims the task and uploads deliverables.</li><li><strong>Supervisor QA:</strong> A dedicated review thread opens automatically in Discord. Department supervisors verify topology, naming conventions, and artistic fidelity.</li><li><strong>Master Integration:</strong> Approved deliverables are locked, credited, and merged into the master film timeline.</li></ol>"
            }
        ]
    },
    [DocumentSlug.Terms]: {
        title: "Terms of Service",
        sections: [
            {
                id: "acceptance",
                title: "1. Acceptance of Terms",
                html: "<p>By accessing or using the Project Stairway web platform, API services, or connected Discord bot, you agree to be bound by these Terms of Service, our Privacy Policy, and our Acceptable Use Policy. If you do not agree to these terms, you must not use the platform.</p>"
            },
            {
                id: "accounts",
                title: "2. Account Registration & Sybil Prevention",
                html: "<p>To vote on production rounds or claim Grab-Box tasks, you must authenticate through Discord OAuth2 and complete zero-knowledge email verification. You agree to maintain only one account. Operating multiple accounts, automating account interactions, or bypassing anti-sybil protections is grounds for permanent disqualification and blacklisting.</p>"
            },
            {
                id: "contributions",
                title: "3. Contributor License & Intellectual Property",
                html: "<p>You retain personal ownership of original intellectual property you create. By submitting deliverables, scene files, pitches, or media to Project Stairway, you grant Project Stairway and Squared Media an irrevocable, perpetual, worldwide, royalty-free, transferable license to reproduce, adapt, modify, perform, composite, render, and distribute your submissions in the final film production, promotional campaigns, behind-the-scenes documentation, and related media in all formats now known or hereafter devised.</p>"
            },
            {
                id: "warranties",
                title: "4. Representations & Warranties",
                html: "<p>You represent and warrant that: (a) all material you submit is your original creation or you possess all necessary rights and licenses to grant the rights herein; (b) your submissions do not infringe upon any third-party copyright, trademark, patent, trade secret, or privacy right; and (c) your submissions contain no malicious code, unauthorized rips, or deceptive synthetic outputs.</p>"
            },
            {
                id: "governance",
                title: "5. Production Authority & Sanctions",
                html: "<p>Project Stairway supervisors and directors retain sole editorial and technical discretion over all round curation, deliverable QA, task approvals, and scene integration. The platform administrators reserve the right to suspend accounts, release claimed tasks, invalidate fraudulent ballots, or terminate access for violations of these terms.</p>"
            },
            {
                id: "disclaimer",
                title: "6. Limitation of Liability & Disclaimers",
                html: "<p>Project Stairway is provided 'as is' without warranties of any kind. Squared Media and project maintainers shall not be liable for any indirect, incidental, or consequential damages arising from platform downtime, lost submissions, or service modifications.</p>"
            }
        ]
    },
    [DocumentSlug.Privacy]: {
        title: "Privacy Policy",
        sections: [
            {
                id: "zk-verification",
                title: "1. Zero-Knowledge Email Verification",
                html: "<p>Project Stairway utilizes a zero-knowledge anti-sybil architecture. When you verify your email address to vote, the platform computes a one-way cryptographic HMAC-SHA256 digest using a secret server pepper. <strong>We do not store your plaintext email address in our database.</strong> The hash is retained solely to enforce one-person-one-vote mathematical invariants.</p>"
            },
            {
                id: "discord-data",
                title: "2. Discord Profile Data",
                html: "<p>When you authenticate via Discord OAuth2, we receive your Discord User ID, username, global display name, and avatar hash. This information is used to manage your studio permissions, display contributor credits, synchronize server roles, and deliver notification DMs.</p>"
            },
            {
                id: "telemetry-logs",
                title: "3. Operational Logs & Telemetry",
                html: "<p>We log platform interactions including ballot timestamps, task claims, deliverable uploads, and IP routing telemetry (via Cloudflare). These logs are processed automatically to detect bot attacks, velocity bursts, and voting anomalies, and are retained in accordance with standard infrastructure safety cycles.</p>"
            },
            {
                id: "data-sharing",
                title: "4. Data Sharing & Third Parties",
                html: "<p>We do not sell, rent, or monetize your personal data. Data is shared only with trusted infrastructure providers (Cloudflare for edge routing, Dokploy/Traefik for container hosting, Discord for identity authentication) strictly to operate the platform.</p>"
            }
        ]
    },
    [DocumentSlug.AcceptableUse]: {
        title: "Acceptable Use Policy",
        sections: [
            {
                id: "prohibited-activities",
                title: "1. Prohibited Activities",
                html: "<p>You may not engage in any of the following activities on the platform or studio Discord:</p><ul><li>Attempting to manipulate, brigade, script, or sybil-attack community voting ballots.</li><li>Using automated bots, scrapers, or self-bots to claim tasks or cast votes.</li><li>Uploading malware, corrupted files, deceptive blender scripts, or copyright-infringing assets.</li><li>Harassing, doxxing, impersonating, or abusing community members, supervisors, or directors.</li><li>Circumventing bans, blacklists, or security boundaries.</li></ul>"
            },
            {
                id: "enforcement",
                title: "2. Investigation & Enforcement",
                html: "<p>Platform administrators actively investigate telemetry alerts and user reports. Suspected violations will result in immediate investigative quarantine, followed by role revocation, submission forfeiture, or permanent blacklisting upon confirmation of bad faith.</p>"
            }
        ]
    }
};
