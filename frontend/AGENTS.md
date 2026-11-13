<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Frontend UI consistency

- Check existing components, including `src/components/ui/` and shared components, before creating a new one. Reuse or compose them when they meet the requirement; extend them when appropriate.
- Apply spacing, padding, margins, gaps, sizing, borders, and corner radii consistently. Follow the existing design system and Tailwind scales; avoid arbitrary one-off values unless the design requires them.
- Keep typography consistent across the application, including font families, sizes, weights, line heights, and hierarchy. Reuse existing styles and tokens rather than introducing ad hoc variations.
- Use the semantic color tokens defined in `src/app/globals.css` and existing component variants. Avoid hardcoded colors and ensure colors remain legible in supported themes and interaction states.
- When an existing token or component cannot meet a requirement, make a deliberate, reusable extension and keep the visual language consistent.
