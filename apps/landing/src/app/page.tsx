import { Clapperboard, Users, Vote, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { APP_URL, DISCORD_URL, GOALS, PARTNERS, PIPELINE_STEPS, ROLES } from "./content";
import { LegalBlock } from "./SiteChrome";

const GOAL_ICONS: readonly LucideIcon[] = [Users, Vote, Clapperboard];

const primaryButton =
    "focus-ring inline-flex h-11 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-black/25 transition-colors hover:bg-blue-700";
const secondaryButton =
    "focus-ring inline-flex h-11 items-center justify-center rounded-md border border-white/35 bg-white/10 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/20";
const card = "rounded-xl border border-white/15 bg-white/[0.06] p-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]";

function NewTabHint(): ReactNode {
    return <span className="sr-only"> (opens in a new tab)</span>;
}

interface ContentSectionProps {
    readonly id: string;
    readonly title: string;
    readonly lead: string;
    readonly children: ReactNode;
}

// every section after the hero sits on the shared blur stage (see globals.css)
function ContentSection({ id, title, lead, children }: ContentSectionProps): ReactNode {
    const headingId = `${id}-heading`;
    return (
        <section id={id} aria-labelledby={headingId} className="flex min-h-dvh items-center">
            <div className="w-full max-w-6xl px-5 py-20 sm:px-8 md:px-12 md:py-36 lg:px-16">
                <div className="max-w-2xl">
                    <h2 id={headingId} className="text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl">
                        {title}
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-zinc-200 sm:text-lg">{lead}</p>
                </div>
                <div className="mt-10">{children}</div>
            </div>
        </section>
    );
}

export default function LandingPage(): ReactNode {
    return (
        <main id="main" tabIndex={-1} className="relative isolate outline-none md:pl-56">
            <div aria-hidden="true" className="blur-stage">
                <div />
                <div />
                <div />
                <div />
                <div />
                <div />
            </div>
            <section id="home" aria-labelledby="home-heading" className="flex min-h-[calc(100dvh-6rem)] flex-col md:min-h-dvh">
                <div className="flex flex-1 items-center justify-center px-5 pt-10 sm:px-8">
                    <div className="w-full max-w-[780px]">
                        <h1 id="home-heading">
                            <Image
                                src="/brand/title.png"
                                alt="Project Stairway"
                                width={780}
                                height={78}
                                priority
                                className="h-auto w-full drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
                            />
                        </h1>
                        <p className="mt-2 flex justify-end pr-[4%]">
                            <Image
                                src="/brand/tagline.png"
                                alt="A community effort."
                                width={270}
                                height={23}
                                priority
                                className="h-auto w-[35%] drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                            />
                        </p>
                    </div>
                </div>
                <div className="px-5 pb-14 text-center sm:px-8 md:pb-20">
                    <p className="mx-auto max-w-xl text-base leading-relaxed text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)] sm:text-lg">
                        An independent, community-made Minecraft animated film, built in the open by artists from around the world.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={primaryButton}>
                            Join the Discord
                            <NewTabHint />
                        </a>
                        <a href="#goal" className={secondaryButton}>
                            Learn more
                        </a>
                    </div>
                </div>
            </section>

            <ContentSection
                id="goal"
                title="The Goal"
                lead="Project Stairway is an open, community-built animated motion picture: a feature film made together, scene by scene."
            >
                <ul className="grid gap-4 md:grid-cols-3">
                    {GOALS.map((goal, index) => {
                        const Icon = GOAL_ICONS[index] ?? Users;
                        return (
                            <li key={goal.title} className={card}>
                                <span className="flex size-10 items-center justify-center rounded-lg bg-sky-400/15 text-sky-300">
                                    <Icon aria-hidden="true" className="size-5" />
                                </span>
                                <h3 className="mt-5 text-lg font-semibold text-white">{goal.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-zinc-200">{goal.body}</p>
                            </li>
                        );
                    })}
                </ul>
            </ContentSection>

            <ContentSection
                id="pipeline"
                title="Pipeline"
                lead="It is pretty straightforward. Every shot moves through the same four steps on the studio platform."
            >
                <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {PIPELINE_STEPS.map((step, index) => (
                        <li key={step.title} className={card}>
                            <span className="font-mono text-sm font-semibold text-sky-300">
                                <span className="sr-only">Step </span>
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-200">{step.body}</p>
                        </li>
                    ))}
                </ol>
            </ContentSection>

            <ContentSection
                id="contribute"
                title="Contribute"
                lead="All animation shots are up for grabs in the Grab-box. We don't take open writing, but the community votes on key story elements."
            >
                <div className="grid gap-4 lg:grid-cols-5">
                    <div className={`${card} lg:col-span-3`}>
                        <h3 className="text-lg font-semibold text-white">Who we&apos;re looking for</h3>
                        <ul className="mt-4 flex flex-wrap gap-2">
                            {ROLES.map((role) => (
                                <li
                                    key={role}
                                    className="rounded-md border border-white/20 bg-white/[0.06] px-3 py-1.5 text-sm text-zinc-100"
                                >
                                    {role}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className={`${card} flex flex-col justify-between gap-5 lg:col-span-2`}>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Get started</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                                Join the Discord, then sign in to the studio with your Discord account to claim your first shot.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={primaryButton}>
                                Join the Discord
                                <NewTabHint />
                            </a>
                            <a href={APP_URL} className={secondaryButton}>
                                Sign in to the studio
                            </a>
                        </div>
                    </div>
                </div>

                <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
                    <h3 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">Supported by</h3>
                    <ul className="flex flex-wrap items-center gap-8">
                        {PARTNERS.map((partner) => (
                            <li key={partner.name}>
                                <a href={partner.href} target="_blank" rel="noopener noreferrer" className="focus-ring block rounded-sm">
                                    <Image
                                        src={partner.src}
                                        alt={partner.name}
                                        width={partner.width}
                                        height={partner.height}
                                        className="h-8 w-auto opacity-85 transition-opacity hover:opacity-100"
                                    />
                                    <NewTabHint />
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            </ContentSection>

            <footer className="border-t border-white/10 px-5 py-8 md:hidden">
                <LegalBlock tone="dark" />
            </footer>
        </main>
    );
}
