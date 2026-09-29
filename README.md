# KnowBoth

**Know the company. Know yourself.**

[한국어](docs/README.ko.md) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md)

KnowBoth connects a company's business, a job's requirements, and a candidate's experience into an evidence-linked application brief. Built with Next.js, React, and TypeScript for the Wanted AI Championship 2026.

The interface, fictional demo, report labels, and PDF export support **English and Korean**. Live research currently supports **Wanted Korea job postings**; changing the language does not expand the supported job boards. Original job and résumé quotations stay in their source language so readers can check the evidence.

## Try the demo

Requires **Node.js 22** and npm.

```sh
npm ci
npm run dev
```

Open [127.0.0.1:3000](http://127.0.0.1:3000) and select **Explore a sample brief**. The clearly labeled fictional report works without an API key or paid requests.

For live analysis, copy the environment template and set your server-side credentials:

```sh
cp .env.example .env.local
```

```dotenv
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6-luna
```

`OPENAI_MODEL` is optional; the value above is the code's default. Your account must have access to a model supporting the Responses API, web search, and structured outputs. Restart the development server after changing environment variables. Never prefix these variables with `NEXT_PUBLIC_`.

## What it does

- Reads a Wanted posting URL or official `wntd.co` share link and verifies the researched job before analysis.
- Extracts PDF, DOCX, TXT, or Markdown résumé text in the browser, with an editable preview.
- Connects company business, documented revenue, role requirements, experience evidence, and interview preparation across four report tabs.
- Separates sourced information, interpretations, and unanswered questions; does not invent hiring probabilities or fit scores.
- Suggests other Wanted postings only after independently checking their pages and matching exact experience quotations.
- Supports cancellation, retry, keyboard navigation, responsive layouts, local report history, and downloadable PDFs.

A normal live analysis performs three sequential AI stages: job research, company research, and report generation. Each stage can retry up to three times. Recommendations use additional paid requests. Loading steps describe the workflow; they are not live server progress telemetry.

## Engineering overview

| Responsibility                                     | Location                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Screens, report presentation, interaction state    | `components/`                                                                   |
| Locale policy and formatting                       | `lib/i18n/`                                                                     |
| Data contracts and evidence rules                  | `lib/knowboth/schema.ts`, `evidence.ts`, `recommendation-core.ts`               |
| Analysis workflow and provider integration         | `lib/knowboth/analyze.ts`, `openai.ts`, `job-research.ts`, `recommendations.ts` |
| HTTP validation, bounded reads, redirects, retries | `lib/server/`                                                                   |
| Browser storage, résumé parsing, PDF export        | `lib/knowboth/history.ts`, `resume-file.ts`, `pdf.ts`                           |
| Route adapters                                     | `app/api/`                                                                      |

Framework-independent rules are separated from UI, HTTP, and provider code. ESLint checks the import boundaries. See [Architecture](docs/ARCHITECTURE.md) for the request flow, trust boundaries, and design limits.

## Verify a change

```sh
npm run check
npm run build
npx playwright install chromium
npm run test:ui
```

`check` runs formatting, lint, TypeScript, and the automatically discovered `tests/**/*.test.ts` checks. The browser smoke test starts the production build locally and intercepts API requests with fictional fixtures. It exercises user flows without an API key or paid calls. CI runs these checks on pushes and pull requests and saves browser screenshots.

```sh
npm run format       # Apply shared formatting
npm run typecheck    # Check TypeScript only
npm test             # Run domain and API checks only
```

These checks establish deterministic behavior. They do not prove live provider availability, research accuracy, or production deployment health.

## Data handling and operating limits

- Original résumé files stay in browser memory. Extracted text is sent to the server and OpenAI when the user runs an analysis. Résumé text is excluded from company/job web-search calls; recommendations derive search terms before searching.
- Provider requests use `store: false`. There is no application database. Provider processing and retention policies still apply.
- Real reports are stored in this browser's `localStorage`, up to 10 reports and approximately two million serialized characters. Reports may include experience quotations. Each record can be deleted; files, full résumé inputs, and job proof tokens are not persisted by this history feature.
- A server signature binds analysis requests to an unchanged, previously researched job. This is an integrity check, not user authentication or a rate limit.
- Inputs are bounded: résumé files up to 8 MB, PDFs up to 40 pages, job and experience text up to 20,000 characters each. Scanned/image PDFs and HWP are not supported.
- Job research and analysis have server deadlines of 50 and 110 seconds. Hosting plan limits may be lower. There are currently no application-level user accounts, quotas, or IP rate limits; a public live deployment needs appropriate access and spending controls.
- Revenue remains unconfirmed when company identity, sources, or accounting scope are uncertain. Evidence checks validate structure, references, and exact quotations; readers still need to assess the linked sources.

PDFs embed the bundled Nanum Gothic fonts. Their SIL Open Font License and source are documented in [public/fonts/README.md](public/fonts/README.md).

## Deployment and product notes

Deploy as a Next.js Node.js application, set server-side environment variables, and verify the deployed sample and API configuration before testing live research. A successful local build is not a deployment verification.

The [deployment handoff](docs/SOL_HANDOFF.md), [product specification](docs/PROJECT.md), [analysis policy](docs/ANALYSIS_PROMPT.md), and [recommendation notes](docs/RECOMMENDATIONS.md) preserve the original Korean implementation context. Their dated snapshots predate the internationalization and module refactor; use this README and the architecture document for the current layout and commands.
