export interface PipelineStep {
    readonly id: string;
    readonly title: string;
    readonly description: string;
}

export interface PipelinePhase {
    readonly number: number;
    readonly title: string;
    readonly steps: readonly PipelineStep[];
}

export interface FlatPipelineStep extends PipelineStep {
    readonly index: number;
    readonly phaseNumber: number;
    readonly phaseTitle: string;
}

export const pipelinePhases: readonly PipelinePhase[] = [
    {
        number: 0,
        title: "Phase 0: Pre-Production",
        steps: [
            { id: "0.1", title: "Story Pitching", description: "Community submits briefs, loglines and pitches." },
            { id: "0.2", title: "Story Vote", description: "Community votes on the winning story concept." },
            { id: "0.3", title: "Script", description: "Screenplay draft based on the winning story." },
            { id: "0.4", title: "Script Lock", description: "Final review and creative sign-off on the screenplay." }
        ]
    },
    {
        number: 1,
        title: "Phase 1: Animatic",
        steps: [
            { id: "1.1", title: "Art Style", description: "Community votes on the visual art style." },
            { id: "1.2", title: "Models and Rigs", description: "Vote on primary character rigs and baseline models." },
            { id: "1.3", title: "3D Storyboarding", description: "Character framing, poses and cinematography." },
            { id: "1.4", title: "Scratch Audio", description: "Temporary voice lines and sound effects." },
            { id: "1.5", title: "Animatic Lock", description: "Assembly of the master shot list." }
        ]
    },
    {
        number: 2,
        title: "Phase 2: LookDev",
        steps: [
            { id: "2.1", title: "3D Modelling", description: "Worldbuilding." },
            { id: "2.2", title: "Rigging and Deformation", description: "Lightweight proxy rigs for animators." },
            { id: "2.3", title: "Surfacing and Materials", description: "Populate the surfacing and material library." },
            { id: "2.4", title: "Asset Registry", description: "Finalize all assets." }
        ]
    },
    {
        number: 3,
        title: "Phase 3: Layout",
        steps: [
            { id: "3.1", title: "Rough Layout", description: "Prep for animation." },
            { id: "3.2", title: "Set Dressing", description: "Foliage, terrain and props." },
            { id: "3.3", title: "Final Layout", description: "Baking camera paths and framing." }
        ]
    },
    {
        number: 4,
        title: "Phase 4: Animation and Effects",
        steps: [
            { id: "4.1", title: "Grab-box", description: "Open the grab-box to the contributor tier." },
            { id: "4.2", title: "Character Animation", description: "Blocking, splining and polish passes." },
            { id: "4.3", title: "Backgrounds", description: "Crowd sims and cycles." },
            { id: "4.4", title: "Character FX", description: "Cloth and hair simulation." },
            { id: "4.5", title: "Visual FX", description: "Fire, smoke, water, magic and destruction simulation." },
            { id: "4.6", title: "Matte Painting", description: "Painted worldbuilding assets." }
        ]
    },
    {
        number: 5,
        title: "Phase 5: Lighting and Post",
        steps: [
            { id: "5.1", title: "Lighting", description: "Shot lighting." },
            { id: "5.2", title: "Rendering", description: "OpenEXR and PNG sequences." },
            { id: "5.3", title: "Compositing", description: "Layering passes and colour correction." }
        ]
    },
    {
        number: 6,
        title: "Phase 6: Sound",
        steps: [
            { id: "6.1", title: "Voice Acting", description: "Final recording sessions." },
            { id: "6.2", title: "Sound Design and Foley", description: "Sound effects and soundscapes." },
            { id: "6.3", title: "Music", description: "Final score." },
            { id: "6.4", title: "Mixdown", description: "Surround master mixdown." }
        ]
    }
];

export const pipelineSteps: readonly FlatPipelineStep[] = pipelinePhases
    .flatMap((phase) => phase.steps.map((step) => ({ ...step, phaseNumber: phase.number, phaseTitle: phase.title })))
    .map((step, index) => ({ ...step, index }));

export function progressPercentFor(stepIndex: number): number {
    return Math.round(((stepIndex + 1) / pipelineSteps.length) * 100);
}
