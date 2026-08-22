# Website Builder — Problem-Space Map

Reference/checklist for baio architecture. Not a tutorial. Name-brand examples given so you can go look them up.

---

**Structure model**
- Pages = routable units. URL/route model: static paths, dynamic segments (`/blog/:slug`), catch-alls, index/404. (Next.js file routing; Framer/Webflow page trees.)
- Navigation: nav bars, links, menus, breadcrumbs — a separate concern from routes; link targets must stay valid on rename/delete.
- Layouts/templates: shared shell (header/footer/nav) wrapping many pages. Master pages / templates (Webflow "symbols", Framer layouts, WordPress themes).
- Reusable components / symbols / instances: define once, reuse; instance overrides for text/props. (Figma components, Webflow symbols, Framer code/smart components.)
- Slots / children: components accept nested content (Figma slots, React children, Webflow "slots" limited).
- Nesting + tree: layers panel = z-order (paint order) + containment (parent/child). Both matter and diverge.
- Global vs page-scoped: global elements (nav, footer, design tokens) vs local. Editing global propagates everywhere.

**Responsive / layout**
- Breakpoints: desktop/tablet/mobile; cascade direction (desktop-down Webflow vs mobile-up Tailwind). Per-breakpoint overrides.
- Layout engines: flexbox, CSS grid, absolute/free positioning. Auto-layout (Figma/Framer stacks) vs manual constraints (pin/anchor to edges).
- Constraints vs auto-layout: constraints = how a child resizes with parent; auto-layout = flow that reflows. Big model choice.
- Units: px, %, rem/em, vw/vh, fr, auto, min/max/clamp. Fixed vs fluid vs fill/hug (Figma terms).
- Overflow: clip, scroll, visible; content that exceeds container; text truncation, min-width:0 traps.
- Aspect ratio, object-fit for media.

**Styling / design system**
- Tokens: colors, spacing, radii, shadows, z-index as named variables (Style Dictionary, CSS vars, Figma variables). Single source of truth.
- Themes: light/dark, brand themes; token aliasing (semantic → primitive).
- Typography scale: font families, weights, size ramp, line-height, letter-spacing, responsive type.
- Spacing system: base unit (4/8px grid), scale.
- States: hover, active, focus, disabled, visited, checked — per element. (Webflow states, Framer variants.)
- Variants: component variations (size, color, type) as a matrix (Figma variants, Framer variants).
- Style reuse: classes/shared styles (Webflow classes) vs one-off inline. Global class edits cascade.

**Data**
- Data models / collections: schemas, fields, types, relations (Webflow CMS Collections, Airtable, Notion DB, Bubble data types).
- CMS: structured content editable by non-devs; content vs presentation split (WordPress, Contentful, Sanity, Builder.io).
- Dynamic binding: bind element props to data fields; repeat a component over a list (Webflow Collection List, Framer CMS, Bubble repeating group, Retool table).
- External data: REST/GraphQL fetch, DB connectors, spreadsheets (Retool resources, Bubble API connector).
- Static vs dynamic: build-time (SSG) vs request-time (SSR) vs client fetch. Caching/revalidation (ISR).
- Non-dev content editing: inline edit, editor roles, draft/publish, scheduling.

**Interactivity / logic**
- Events: click, hover, scroll, load, input, submit, intersection.
- Actions: navigate, toggle, set state, call API, show/hide, animate, run workflow.
- State: local component state, page state, global/app state, URL/query state, persisted.
- Conditionals: show/hide by data or state; conditional formatting (Bubble/Retool conditions).
- Forms: fields, validation (required/format/custom), submit handling, success/error, spam (captcha/honeypot).
- Workflows / automation: event → steps (Bubble workflows, Zapier/Make, Retool workflows). Client vs server execution.
- Animations/interactions: transitions, scroll effects, timelines (Framer, Webflow Interactions, GSAP).

**APIs / integrations**
- Protocols: REST, GraphQL; request config (method, headers, query, body, path params).
- Auth to third parties: API keys, bearer tokens, OAuth flows, basic auth. Where keys live matters (never client).
- Response → UI mapping: JSON path picking, transforms, pagination, loading/error/empty states.
- Webhooks: inbound events from external systems → trigger workflows.
- Rate limits, retries, timeouts, idempotency.
- Secrets handling: server-side proxy/env vars; never embed keys in published client bundle. (Retool resources, Bubble server-side plugins.)

**Backend / persistence**
- Databases: relational (Postgres) vs document (Firestore) vs builder-managed (Bubble DB, Webflow CMS, Supabase).
- Auth/users: signup/login, sessions vs JWT, password/OAuth/magic-link, user profiles.
- Roles / permissions: RBAC, per-record ownership, row-level security (Supabase RLS).
- File/media storage: uploads, CDN, image optimization/resizing (Cloudinary, S3).
- Serverless functions / server logic: custom endpoints, cron/scheduled jobs (Vercel/Netlify functions, Supabase edge functions).

**Auth & security**
- Authn (who you are) vs authz (what you may do) — distinct.
- Protected pages/routes: gate by auth + role; redirect unauth; server-enforced not just hidden UI.
- Secret management: env vars, vaults; build-time vs runtime; public (`NEXT_PUBLIC_`) vs private.
- CORS, CSRF, XSS: sanitize/escape user input, output encoding, Content-Security-Policy.
- Input validation server-side (client validation is UX only).
- HTTPS, secure cookies, session expiry.

**Editing UX (how the builder itself works)**
- Canvas (direct manipulation, WYSIWYG) vs tree/layers vs inspector/properties panel — most builders have all three synced (Webflow, Framer, Figma).
- Direct manipulation: drag, resize, snap, guides, grids, multi-select, align/distribute.
- Undo/redo: command history; must cover all mutations. Foundational, hard to retrofit.
- Versioning: autosave, named versions, backups, restore, branching (Webflow backups, Figma version history).
- Collaboration: multiplayer cursors, presence, conflict resolution (CRDT/OT), comments (Figma).
- Code export / escape hatch: export clean code, custom code embeds, dev mode. Lock-in vs openness (Webflow export, Framer, Plasmic codegen, Builder.io).
- Preview vs edit modes: interactive preview, responsive preview, device frames, share preview links.
- Inspector affordances: what's editable, sensible defaults, avoiding overwhelming property lists.

**Publishing / ops**
- Build: compile to HTML/CSS/JS or framework code; asset bundling, minification.
- Hosting: CDN, edge, static vs server; the builder's platform vs export-and-self-host.
- Domains: custom domains, DNS, SSL provisioning, subdomains, redirects.
- Environments: dev/staging/prod, preview deploys, per-branch (Vercel previews).
- SEO/meta: title/description, Open Graph, sitemap.xml, robots.txt, canonical URLs, structured data, per-page overrides.
- Analytics: page views, events, integrations (GA, Plausible, Segment).
- Performance: bundle size, lazy loading, image optimization, Core Web Vitals, caching.
- Accessibility: semantic HTML, alt text, focus order, ARIA, color contrast, keyboard nav.
- i18n/l10n: locales, translated content, RTL, locale routing, date/number formats.

---

**Sharpest tradeoffs for a sketch-first builder (baio)**
- Structural authority of the drawing: how much layout/hierarchy the sketch *dictates* vs the model *infers*. Loose sketch → model guesses structure (risk: wrong nesting/order); strict sketch → user must draw precisely (kills the "just sketch it" magic).
- Inferring the layout model: a sketch shows pixels, not intent. Must reverse-engineer flex/grid/auto-layout + constraints so it stays responsive — a flat absolutely-positioned crisp looks right but breaks on resize.
- "One magic Frame" vs real app: a single generated page feels magical, but sites need multi-page routing, shared nav/layout, and data — where does structure beyond one canvas come from (draw more frames? a tree view? implied links)?
- Visual simplicity vs config depth: API keys, auth, data bindings, secrets, roles have no natural sketch representation. When do you break the drawing metaphor and surface real forms/panels?
- Editability after crisping: is the AI output a re-editable model (tokens, components, tree) or a one-shot artifact? Round-trip (sketch → model → edit → re-sketch?) is the hard part; determinism/undo across an AI step is nontrivial.
- Reusability from strokes: detecting that two drawn boxes are "the same component/symbol" vs distinct — enables design-system consistency but requires the model to cluster intent, not just pixels.
- Fidelity vs opinion: match the sketch literally (user controls look) vs apply a clean design system (better result, less faithful). Users blame the tool for both a literal ugly render and an unrequested restyle.
- Data + dynamic content from a static drawing: a sketched list implies "repeat over data," but the sketch has no data source. Deciding when a drawn element is static content vs a bound/repeating template is ambiguous and high-value to get right.
