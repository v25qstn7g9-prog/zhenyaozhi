# CLAUDE.md

Instructions for any Claude Code session working in this repository.

## Deployment — read this before touching Vercel

This repo is connected to the Vercel project `zhenyaozhi-tracker` (account `johnny576707`). Pushing to `main` (or merging a PR into it) auto-deploys to production.

**The Vercel project's Root Directory setting must always be `src`.** The real app (`index.html`, `style.css`, `app.js`, etc.) lives under `src/`, not the repo root. If this setting is ever cleared or changed, the next production deploy will build "successfully" — Vercel's dashboard will show `READY` — while actually serving nothing useful, because it looks for `index.html` at the repo root and finds none. This is a silent break: nothing in the Vercel UI flags it as an error.

Rules:

1. **Never deploy this project via a direct API/CLI call with inline or non-git files.** The only supported way to ship a change is: branch → test → merge into `main` → let Vercel's own Git integration build it. Do not use `vercel deploy` or the Vercel API's `create_deployment` with a `files` payload against this project.
2. **Before changing any Vercel project setting for `zhenyaozhi-tracker`**, stop and re-read this section. If a deploy step ever errors with something like "Root Directory does not exist," that means you are deploying the wrong source (e.g. a one-off prototype or an unrelated checkout) against this project — fix *that*, never "fix" it by clearing or changing this project's Root Directory.
3. If you need to verify the project's current settings or a deployment's health, use read-only checks (`vercel project inspect`, the Vercel MCP `get_project`/`get_deployment`/`get_runtime_errors` tools, or GitHub Actions status for the latest commit on `main`) rather than writing to project settings.

**History:** this happened once, in 2026-10 — an unrelated single-file prototype of a similarly named app was repeatedly deployed straight to this same Vercel project from outside this repo. Each time, its deploy failed against the `src` Root Directory, and the Root Directory was cleared to make that unrelated deploy succeed — which silently broke this repo's next `main` push until someone manually restored it to `src`. The fix going forward is rule 1 above: nothing outside this repo's own git-triggered pipeline should ever deploy to this project.

See `README.md` for the rest of the project: data format, environment variables, regression tests, and version history.
