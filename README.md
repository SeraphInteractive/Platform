# Platform Backend

Community voting rounds, raid telemetry, the shot grab-box production pipeline, the studio Discord bot and the web app.

## Getting started

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run dev # set LOG_FORMAT=pretty for readable logs
npm run dev:discord # the Discord bot
npm run dev:web # the web app
```

## Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## Production Departments

Tasks in the Grab-box are routed by department, domain-specific shot type, and required specialties:

1. **Art and Writing**: Lead - Art Director | Contributors - Concept Artist, Screenwriter | Types: `concept_art`
2. **Assets**: Leads - Modeling & Surfacing Lead, Rigging Supervisor | Contributors - 3D Modeler, Surface / Texture Artist, Rigger | Types: `3d_modelling`, `rigging`, `surface_texture_art`
3. **Animation**: Leads - Layout / Previs Lead, Animation Supervisor | Contributors - Layout Artist, Animator | Types: `animation`
4. **Lighting and VFX**: Leads - Lighting & VFX Lead | Contributors - Lighting Artist, VFX Artist | Types: `lighting`, `vfx`
5. **Post-Production**: Leads - Editorial Supervisor, Sound Director | Contributors - Video Editor, Sound Designer, Voice Actor | Managed via screenplay and audio pipelines.

Supervisors create and review tasks scoped to their department. Task claiming requires the Contributor role and the task's required specialty.

## Contributing

We're happy to receive help and contributions! Please read the [contribution policy](/CONTRIBUTING.md).

Please note that while you are allowed to use AI agents in your workflow, it is strictly not allowed to push unreviewed code.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
