# Rock Solid Labs: project-wide instructions

## Project and scope

This repository is Robert Peterson's personal IT infrastructure, networking,
systems administration, homelab, and resume portfolio at
https://resume.rocksolidlabs.net.

These instructions apply throughout the repository. Preserve `app/AGENTS.md`
and follow its additional Astro-specific instructions when working in `app/`.
Inspect the entire repository before making application-code changes, including
existing instructions, source, configuration, dependencies, and public assets.
Check the working tree before editing and preserve unrelated user changes.

## Existing implementation

- `app/` is the production Astro application, using native Astro components,
  browser-side JavaScript, and CSS. Node.js >=22.12.0 is declared in package.json.
- `app/src/pages/index.astro` contains the portfolio and recruiter/lab mode switch.
- `app/src/components/` contains the interactive terminal, live status display,
  and architecture diagram. Reuse these components where practical.
- `app/src/styles/global.css` defines shared styling and responsive rules;
  components also contain their own styles, including styles for dynamic DOM.
- `app/public/` contains publicly served branding, favicons, and the resume PDF.
  Treat every asset placed here as publicly downloadable.
- `app/Dockerfile` builds the static site and serves `app/dist/` with Nginx.
  `app/nginx.conf` defines serving, security headers, and status proxy routes.
- `docker-compose.yml` builds `app/` and binds the web container to loopback.
- `site/index.html` is a separate placeholder, not the site built by the current
  Docker configuration. Do not duplicate production work there.

## Visual identity and functionality

- Preserve the existing Rock Solid Labs black/orange visual identity and
  technical/homelab aesthetic.
- Reuse existing components and styling conventions where practical.
- Keep additions responsive for desktop and mobile; retain accessible labels,
  keyboard interaction, and appropriate motion behavior.
- Do not redesign the site unless explicitly requested.
- Do not remove existing functionality unless explicitly requested.

## Security and public infrastructure information

Never expose or commit:

- Passwords.
- API keys or tokens.
- Credentials.
- Private IP addresses.
- Internal management URLs.
- SSH keys.
- Environment secrets.
- Client or customer information.
- Patient information or protected health information (PHI).
- Employer-confidential information.

Apply these restrictions to source, configuration, documentation, screenshots,
resume assets, generated output, API responses, and logs. Report existing
exposures without repeating sensitive values; do not silently change unrelated
files to remediate them.

Public infrastructure information must be sanitized and read-only. Never expose
Proxmox, Docker, TrueNAS, SSH, or other administrative interfaces directly to
the public website. Preserve workload isolation and the loopback binding unless
an explicitly requested, reviewed change requires otherwise.

The browser uses `/api/lab-status/config` and `/api/lab-status/heartbeat` for
monitoring. The current Nginx routes forward upstream status JSON; do not assume
that client-side display filtering sanitizes the public response. Verify the
entire exposed payload is appropriate for public access. Keep private upstream
details and secrets out of new committed content and browser-delivered assets.

Preserve the interactive terminal's security/sandbox model: predefined
browser-side command handlers, read-only monitoring requests, and text rendering
of visitor input and external data. Use `textContent` for untrusted values.
Never add arbitrary shell execution, remote-command capabilities, infrastructure
control, or a backend command interpreter. Suspicious-input messages are UI
feedback, not a substitute for the absence of execution capabilities.

## Development workflow

1. Inspect existing code before creating new components.
2. Follow existing repository conventions and applicable nested instructions.
3. Prefer modifying or reusing existing components over duplicating functionality.
4. Minimize unnecessary dependencies; preserve the lockfile workflow.
5. Keep changes scoped to the requested task.
6. Run the appropriate production build after code changes. From `app/`, use
   `npm ci` when dependencies need installing, then `npm run build`. From the
   repository root, `npm --prefix app run build` runs the same build. Output is
   `app/dist/`. For container-related changes, also validate the relevant Docker
   configuration/build; `docker compose build resume` builds the production image.
7. Run relevant checks for the behavior changed and fix errors introduced by your
   changes. No test or lint script is currently defined in `app/package.json`;
   do not claim that a build constitutes full type checking or a test suite.
8. Do not silently modify unrelated files. Review the final diff and preserve
   `app/AGENTS.md`. Do not deploy, commit, or push unless requested.
9. At completion, summarize what changed, files modified, build/test results,
   and security or maintenance considerations. State any checks not run and why.

For documentation-only changes, verify the content and diff; a production build
is not required unless the documentation affects generated application output.

## Technical content and accuracy

Technical project and case-study content should emphasize:

- Problem.
- Investigation.
- Root cause.
- Resolution.
- Prevention or improvements.
- Technologies used.

Do not exaggerate experience or present planned projects as already operational.
Distinguish verified operation, experiments, and future plans. Keep portfolio
and resume facts consistent; flag discrepancies for clarification rather than
inventing dates, titles, qualifications, metrics, or outcomes.
