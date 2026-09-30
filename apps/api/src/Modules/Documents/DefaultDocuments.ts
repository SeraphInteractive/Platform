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
                html: "<p>Project Stairway is a collaborative community-driven animated film. Decisions are made through verified community voting and executed by skilled contributors.</p><ul><li><strong>Voters (Community):</strong> Participate in democratic election rounds and pitch concept proposals.</li><li><strong>Contributors:</strong> Claim production tasks (3D modeling, animation, layout, lighting, sound) from the grab-box.</li><li><strong>Supervisors & Admins:</strong> Curate submissions, QA deliverables, trigger quick polls, and audit integrity.</li></ul>"
            },
            {
                id: "voting-math",
                title: "Voting Math & Point Invariance",
                html: "<p>Creative elections use a 3-2-1 positional Borda count where voters rank their top 3 favorites (1st = 3 pts, 2nd = 2 pts, 3rd = 1 pt). Every election obeys the total point conservation invariant: <code>Total_Points = 6 × Total_Ballots</code>. To prevent early-vote volatility and small-sample brigading, scores are regularized via Bayesian shrinkage with prior weight K = 30.</p>"
            },
            {
                id: "anti-cheat",
                title: "Anti-Cheat & Anomaly Telemetry",
                html: "<p>Active elections run continuous statistical telemetry. Coordinated botting or brigading is detected in real time using <strong>Velocity Z-Scores</strong> (flagging sudden ballot arrival spikes with Z > 2.5), <strong>Shannon Rank Entropy</strong> (flagging collapsed bullet-voting rings with H < 0.35), and co-occurrence graph clustering. Once certified, election outcomes are cryptographically signed into the permanent ledger.</p>"
            },
            {
                id: "pipeline",
                title: "Contributor Grab-Box & QA Pipeline",
                html: '<p>Contributors claim production shots from the <a href="/grabbox">grab-box</a> across 4 difficulty tiers. Deliverables require inspectable <code>.blend</code> source project files and compressed video previews. Submissions undergo supervisor quality assurance, AI heuristic screening, and direct feedback in linked Discord threads.</p>'
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
