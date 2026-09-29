# Contributing to KnowBoth

Use Node.js 22 and `npm ci`. Start with the fictional sample; API credentials are only needed when deliberately checking live research. Never commit credentials, real résumés, or reports containing personal information.

## Make a focused change

1. Describe the user problem and the observable result in the issue or pull request.
2. Read the affected flow and callers before editing. Keep behavior changes separate from unrelated refactors.
3. Put UI behavior in `components/`, contracts and evidence rules in the framework-independent core, request orchestration in the application workflow, and I/O in the matching adapter. [Architecture](docs/ARCHITECTURE.md) maps the current files.
4. Update both English and Korean copy when changing a user-facing state. Preserve direct source quotations; translate explanations and labels.
5. Add or extend a focused test for changed logic. Use fictional fixtures and mocked external requests. New `tests/**/*.test.ts` files are discovered automatically.

Reuse existing functions and dependencies. Add a new layer or dependency only when the concrete change requires it. Keep generated files under `work/`, which is ignored by Git.

## Before opening a pull request

```sh
npm run format
npm run check
npm run build
npx playwright install chromium
npm run test:ui
```

For UI changes, check English and Korean, a narrow viewport, keyboard focus and tab order, empty/error/loading states, and reduced motion. Include screenshots when the appearance changes. The browser test uses intercepted responses; explicitly distinguish it from any live provider checks.

Use a descriptive commit title and a small, reviewable diff. Explain behavior, tests, material tradeoffs, and unverified boundaries in the pull request. Deployment and live paid calls are separate actions; document them only when actually performed.

## Report a bug

Include the screen, language, reproduction steps, expected and actual behavior, and browser details. Remove personal data, API keys, job proof tokens, and résumé text from screenshots and logs before sharing them.
