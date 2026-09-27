import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";

interface Chapter {
    readonly id: string;
    readonly title: string;
}

const chapters: readonly Chapter[] = [
    { id: "overview", title: "What Stairway is" },
    { id: "voting", title: "How voting works" },
    { id: "curation", title: "Why staff curate options" },
    { id: "fair-play", title: "Fair play" },
    { id: "grab-box", title: "Contributing" },
    { id: "roles", title: "Roles" },
    { id: "discord", title: "Discord commands" },
    { id: "feedback", title: "Feedback" }
];

function Chapter({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }): ReactNode {
    return (
        <section id={id} className="scroll-mt-20 space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <div className="text-foreground/90 [&_a]:decoration-muted-foreground hover:[&_a]:decoration-foreground space-y-4 text-sm leading-relaxed text-pretty [&_a]:underline [&_a]:underline-offset-4">
                {children}
            </div>
        </section>
    );
}

const voteSteps: readonly { readonly title: string; readonly body: string }[] = [
    {
        title: "Pitch",
        body: "While a round is open, anyone signed in can propose an entry: a title of up to 30 words, a short description and an optional image or video."
    },
    {
        title: "Review",
        body: "Supervisors check every entry against the brief before it reaches the ballot. Staff shortlist when there are too many."
    },
    {
        title: "Vote",
        body: "Rank your favourites on the round's page. You can change your ballot as often as you like until the round closes."
    },
    { title: "Count", body: "Standings update live. When the round closes, staff certify the result and it becomes permanent." },
    { title: "Produce", body: "The winner is announced on Discord and goes into production." }
];

const roles: readonly { readonly name: string; readonly body: string }[] = [
    { name: "Voter", body: "Everyone starts here. Vote in every open round and pitch entries." },
    { name: "Contributor", body: "Claims tasks from the grab-box and delivers work for review." },
    { name: "Senior contributor", body: "Trusted contributors who get first pick of hard and complex tasks." },
    { name: "Moderator", body: "Keeps the community and the votes clean. Sees voting integrity reports." },
    { name: "Supervisor", body: "Leads a department. Runs rounds, reviews entries and approves delivered work." },
    { name: "Admin", body: "Production leadership. Final say on the ballot and on the pipeline." }
];

const commands: readonly { readonly command: string; readonly body: string }[] = [
    { command: "/available-tasks", body: "List tasks you can claim right now." },
    { command: "/take-task", body: "Claim the task in the forum post you're in." },
    { command: "/release-task", body: "Hand a task back if you can't finish it." },
    { command: "/submit-task", body: "Get a link to submit your work for the task in this post." },
    { command: "/rounds, /round", body: "See voting rounds and their standings." },
    { command: "/help", body: "Everything else the bot can do." }
];

export function GuidelinesView(): ReactNode {
    return (
        <>
            <PageHeader title="Guidelines" />
            <div className="grid gap-10 lg:grid-cols-[12rem_1fr]">
                <nav aria-label="On this page" className="hidden lg:block">
                    <ol className="sticky top-20 space-y-2 text-xs">
                        {chapters.map((chapter, index) => (
                            <li key={chapter.id}>
                                <a
                                    href={`#${chapter.id}`}
                                    className="text-muted-foreground hover:text-foreground flex gap-2 transition-colors"
                                >
                                    <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                                    {chapter.title}
                                </a>
                            </li>
                        ))}
                    </ol>
                </nav>
                <article className="max-w-[70ch] space-y-14">
                    <Chapter id="overview" title="What Stairway is">
                        <p>
                            Project Stairway is a Minecraft-inspired animated film, made in 3D by its community. Other community films have
                            tried this and stalled. Stairway is led by MattSquared, CEO of Squared Media, the studio behind{" "}
                            <em>Songs of War</em>, together with experienced artists from the community who run each department.
                        </p>
                        <p>We have two goals, and they matter equally:</p>
                        <ol className="list-inside list-decimal space-y-1">
                            <li>Make a film the community is proud of.</li>
                            <li>Be a positive, safe and free place to learn, whatever your experience.</li>
                        </ol>
                        <p>
                            You can take part in three ways: vote on production decisions, share your work on Discord for feedback, or
                            contribute to the film itself through the <Link href="/grabbox">grab-box</Link>.
                        </p>
                    </Chapter>

                    <Chapter id="voting" title="How voting works">
                        <ol className="space-y-3">
                            {voteSteps.map((step, index) => (
                                <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-2">
                                    <span className="text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                                    <span>
                                        <strong className="font-semibold">{step.title}.</strong> {step.body}
                                    </span>
                                </li>
                            ))}
                        </ol>
                        <p>There are two kinds of poll:</p>
                        <div className="overflow-x-auto border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Poll</TableHead>
                                        <TableHead>What you do</TableHead>
                                        <TableHead>Points</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="align-top whitespace-nowrap">Ranked choice</TableCell>
                                        <TableCell className="align-top whitespace-normal">
                                            Rank exactly three options, best first. Used when there are three or more options.
                                        </TableCell>
                                        <TableCell className="align-top whitespace-nowrap">1st: 3 · 2nd: 2 · 3rd: 1</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="align-top whitespace-nowrap">Binary</TableCell>
                                        <TableCell className="align-top whitespace-normal">Pick one of two options.</TableCell>
                                        <TableCell className="align-top whitespace-nowrap">1 point</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                        <p>
                            We keep polls to five options or fewer so every option gets a fair look. The option with the most points wins.
                            The certified result also tells you whether the lead is decisive or too close to call.
                        </p>
                    </Chapter>

                    <Chapter id="curation" title="Why staff curate options">
                        <p>
                            Not everything in a production can go to a vote, or nothing would ever get made. So leadership filters ideas
                            before they reach the ballot, and you choose between the best of them.
                        </p>
                        <p>
                            <strong className="font-semibold">Voice actors.</strong> If fifty people audition for a role, staff score each
                            audition on the same rubric, such as mic quality and emotion. The five strongest go to a community vote, and you
                            pick who gets the part.
                        </p>
                        <p>
                            <strong className="font-semibold">Art style.</strong> Some styles are too hard for a team of first-time
                            animators to keep consistent. Staff shortlist styles the team can realistically pull off, and you choose between
                            those.
                        </p>
                        <p>
                            It isn&apos;t a pure democracy, and it can&apos;t be: too many cooks spoil the kitchen. We think this balance
                            keeps the film moving while giving you real influence over its direction.
                        </p>
                    </Chapter>

                    <Chapter id="fair-play" title="Fair play">
                        <ul className="list-inside list-[square] space-y-2">
                            <li>
                                One person, one ballot per round. Change it as often as you like before the round closes; only your latest
                                counts.
                            </li>
                            <li>
                                No bots, alternate accounts or vote brigades. The platform watches voting patterns automatically and
                                quarantines suspicious entries for review.
                            </li>
                            <li>Cheating gets your account blacklisted from voting. Please don&apos;t ruin it for everyone else.</li>
                            <li>
                                Every counted ballot is published under a pseudonym in the round&apos;s ledger, so anyone can check the
                                count themselves.
                            </li>
                            <li>Once a result is certified, nobody can change it.</li>
                        </ul>
                    </Chapter>

                    <Chapter id="grab-box" title="Contributing through the grab-box">
                        <p>
                            The grab-box holds the film&apos;s production tasks: shots to animate, models to build, sounds to design.
                            Contributors claim a task, make it, and submit it for review.
                        </p>
                        <ul className="list-inside list-[square] space-y-2">
                            <li>You can hold one task at a time, so work is spread across the team.</li>
                            <li>The difficulty sets your deadline: easy 5 days, medium 7, hard 10, complex 14.</li>
                            <li>Hard and complex tasks can open to senior contributors first, for a limited window.</li>
                            <li>
                                Deliver a rendered video (MP4, WebM or MOV) and, ideally, your .blend project file. Files upload straight to
                                storage, so Discord&apos;s size limits don&apos;t apply.
                            </li>
                            <li>
                                A supervisor approves your work or asks for a revision with notes. Revisions are normal; that&apos;s how
                                everyone learns.
                            </li>
                            <li>
                                If you get stuck or run out of time, release the task so someone else can pick it up. Claims past their
                                deadline return to the pool automatically.
                            </li>
                        </ul>
                        <p>
                            To become a contributor, ask in the Discord. We&apos;ll help you find a department that fits what you want to
                            learn.
                        </p>
                    </Chapter>

                    <Chapter id="roles" title="Roles">
                        <dl className="divide-border divide-y border-y">
                            {roles.map((role) => (
                                <div key={role.name} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
                                    <dt className="font-semibold">{role.name}</dt>
                                    <dd className="text-muted-foreground">{role.body}</dd>
                                </div>
                            ))}
                        </dl>
                    </Chapter>

                    <Chapter id="discord" title="Discord commands">
                        <p>The studio bot mirrors the website. Task commands work inside a task&apos;s forum post.</p>
                        <dl className="divide-border divide-y border-y">
                            {commands.map((item) => (
                                <div key={item.command} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
                                    <dt>
                                        <code>{item.command}</code>
                                    </dt>
                                    <dd className="text-muted-foreground">{item.body}</dd>
                                </div>
                            ))}
                        </dl>
                    </Chapter>

                    <Chapter id="feedback" title="Feedback">
                        <p>
                            No voting system is perfect. This one came out of many hours of discussion, and it will keep changing as we
                            learn. If you feel strongly about something, say so on Discord and we&apos;ll talk it through.
                        </p>
                    </Chapter>
                </article>
            </div>
        </>
    );
}
