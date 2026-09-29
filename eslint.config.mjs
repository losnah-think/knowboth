import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "lib/knowboth/{schema,evidence,recommendation-core,wanted-url,urls,analysis-contract}.ts",
      "lib/async.ts",
      "lib/i18n/{locale,format}.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(react(?:/|$)|react-dom(?:/|$)|next(?:/|$)|node:)",
              message: "Domain rules must remain independent of UI, frameworks, and Node adapters.",
            },
            {
              regex:
                "(^|/)(app|components|server)(/|$)|(?:^(?:\\.\\.?/)+|(?:^|/)knowboth/)(openai|job-research|job-proof|recommendations|analyze|prompts|pdf|resume-file|history|client-api)(\\.\\w+)?$",
              message: "Domain rules cannot import application workflows or I/O adapters.",
            },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "fetch", "process"],
    },
  },
  {
    files: [
      "components/**/*.{ts,tsx}",
      "lib/knowboth/{client-api,history,resume-file,pdf,sample-report}.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^node:|(^|/)server(/|$)|(?:^(?:\\.\\.?/)+|(?:^|/)knowboth/)(openai|job-research|job-proof|recommendations|analyze|prompts)(\\.\\w+)?$",
              message:
                "Browser modules must call the HTTP API, not import server workflows or secrets.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "lib/server/**/*.ts",
      "lib/knowboth/{analyze,openai,job-research,job-proof,recommendations,prompts}.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(react(?:/|$)|react-dom(?:/|$)|next(?:/|$))|(^|/)(app|components)(/|$)",
              message: "Application and server modules must not depend on routes or UI components.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/knowboth/analyze.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(react(?:/|$)|react-dom(?:/|$)|next(?:/|$)|node:)|(^|/)(app|components)(/|$)|(^|/)(openai|job-research|job-proof|recommendations|prompts|http|bounded-text|wanted-url)(\\.\\w+)?$",
              message:
                "The analysis workflow receives provider functions through AnalysisServices; it must not import concrete I/O adapters.",
            },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "fetch", "process"],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "public/vendor/**", "work/**", "next-env.d.ts"]),
]);

export default eslintConfig;
