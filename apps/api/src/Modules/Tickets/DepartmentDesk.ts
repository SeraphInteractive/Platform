import { TicketHubStyle, TicketQuestionStyle, type TicketListingDto, type TicketQuestionDto } from "@platform/contracts";

export interface DepartmentDeskTemplate {
    readonly category: { readonly name: string; readonly description: string };
    readonly application: {
        readonly name: string;
        readonly description: string;
        readonly questions: TicketQuestionDto[];
        readonly listing: TicketListingDto;
    };
    readonly question: { readonly name: string; readonly description: string; readonly questions: TicketQuestionDto[] };
    readonly hub: { readonly name: string; readonly title: string; readonly description: string; readonly style: TicketHubStyle };
}

function question(
    id: string,
    label: string,
    style: TicketQuestionStyle,
    required: boolean,
    minLength: number,
    maxLength: number,
    placeholder: string | null
): TicketQuestionDto {
    return { id, label, style, required, minLength, maxLength, placeholder };
}

export function departmentDeskTemplate(departmentName: string): DepartmentDeskTemplate {
    const name = departmentName.trim().slice(0, 60);
    return {
        category: {
            name: name.slice(0, 80),
            description: `Apply to join the ${name} crew or ask its supervisors a question.`.slice(0, 300)
        },
        application: {
            name: `Join the ${name} crew`.slice(0, 80),
            description: "Apply for a contributor role in this department",
            questions: [
                question(
                    "portfolio",
                    "Portfolio or examples of your work",
                    TicketQuestionStyle.Paragraph,
                    true,
                    10,
                    1000,
                    "Links to your work, reels or past projects"
                ),
                question("experience", "Relevant experience", TicketQuestionStyle.Paragraph, true, 20, 1500, null),
                question(
                    "availability",
                    "Weekly availability",
                    TicketQuestionStyle.Short,
                    true,
                    2,
                    200,
                    "For example, 5 to 10 hours a week"
                ),
                question("timezone", "Timezone", TicketQuestionStyle.Short, false, 0, 64, "For example, UTC+1"),
                question("extra", "Anything else we should know?", TicketQuestionStyle.Paragraph, false, 0, 1000, null)
            ],
            listing: {
                overview: `Join the ${name} department and help bring the Project Stairway film to life. The department supervisors review every application.`,
                requirements: ["A portfolio or examples of relevant work", "Able to take direction and meet task deadlines"],
                responsibilities: [
                    `Claim and deliver tasks from the ${name} Grab-box`,
                    "Take part in department reviews and act on feedback"
                ],
                process:
                    "The department supervisors review your application in your ticket. You may be invited to a short interview there, and you will hear back in the ticket and by DM.",
                about: ""
            }
        },
        question: {
            name: "Question for the supervisors",
            description: `Ask the ${name} supervisors something privately`.slice(0, 100),
            questions: [question("question", "What would you like to ask?", TicketQuestionStyle.Paragraph, true, 10, 1500, null)]
        },
        hub: {
            name: `${name} apply`.slice(0, 80),
            title: `Apply to ${name}`.slice(0, 100),
            description:
                "Start an application or ask the department supervisors a question. Your ticket opens as a private thread that only you and the supervisors can see.",
            style: TicketHubStyle.Buttons
        }
    };
}
