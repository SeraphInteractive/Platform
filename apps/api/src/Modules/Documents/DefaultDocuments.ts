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
                title: "Overview",
                html: "<p>Project Stairway is a community-made animated film. Vote on the story, claim production tasks and follow the roadmap.</p>"
            },
            {
                id: "voting",
                title: "Voting",
                html: "<p>Verify your email to become a voter. One person, one account, one ballot per round.</p>"
            },
            {
                id: "contributing",
                title: "Contributing",
                html: '<p>Contributors claim tasks from the <a href="/grabbox">grab-box</a> and submit work for review.</p>'
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
