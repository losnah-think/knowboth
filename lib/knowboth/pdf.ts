import type { Locale } from "@/lib/i18n/locale";
import { pdfMessages } from "@/lib/i18n/pdf";
import type { Claim, Report } from "./schema";
type FontFiles = {
  regular: Uint8Array;
  bold: Uint8Array;
};
type RGB = [number, number, number];
const COLORS = {
  ink: [28, 28, 30] as RGB,
  secondary: [99, 99, 102] as RGB,
  tertiary: [142, 142, 147] as RGB,
  line: [222, 222, 226] as RGB,
  surface: [246, 246, 248] as RGB,
  blue: [0, 113, 227] as RGB,
  blueSoft: [232, 243, 255] as RGB,
  green: [24, 126, 76] as RGB,
  greenSoft: [232, 247, 238] as RGB,
  amber: [156, 92, 0] as RGB,
  amberSoft: [255, 246, 224] as RGB,
  red: [184, 45, 45] as RGB,
  redSoft: [255, 237, 237] as RGB,
  white: [255, 255, 255] as RGB,
};
const PAGE = { width: 210, height: 297, left: 18, right: 18, top: 18, bottom: 20 };
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + size));
  }
  return btoa(binary);
}
async function fetchFont(path: string, locale: Locale) {
  const labels = pdfMessages[locale];
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(labels.fontError);
  return new Uint8Array(await response.arrayBuffer());
}
function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function dateLabel(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Seoul",
      }).format(date);
}
function moneyLabel(value: string, currency: string, locale: Locale) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  if (locale === "ko" && currency === "KRW" && Math.abs(amount) >= 100000000) {
    return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(amount / 100000000)}억 원`;
  }
  const formatted = new Intl.NumberFormat(locale === "en" ? "en-US" : "ko-KR", {
    maximumFractionDigits: 2,
  }).format(amount);
  return locale === "en"
    ? `${currency} ${formatted}`
    : `${formatted} ${currency === "KRW" ? "원" : currency}`;
}
function filenamePart(value: string) {
  const cleaned = value
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || "report";
}
function evidenceLabel(kind: Claim["kind"], locale: Locale) {
  const labels = pdfMessages[locale];
  return kind === "sourced"
    ? labels.sourced
    : kind === "inference"
      ? labels.inference
      : labels.unknown;
}
function evidenceColors(kind: Claim["kind"]): {
  fill: RGB;
  text: RGB;
} {
  if (kind === "sourced") return { fill: COLORS.greenSoft, text: COLORS.green };
  if (kind === "inference") return { fill: COLORS.blueSoft, text: COLORS.blue };
  return { fill: COLORS.amberSoft, text: COLORS.amber };
}
/** Build the PDF bytes. Exposed separately so the same renderer can be checked in Node. */
export async function buildReportPdf(
  report: Report,
  fonts: FontFiles,
  locale: Locale = "ko",
): Promise<Uint8Array> {
  const labels = pdfMessages[locale];
  const { jsPDF } = await import("jspdf");
  const isSample = /^sample(?:-|$)/i.test(report.analysisId);
  const sourceNumbers = new Map(report.sources.map((source, index) => [source.id, index + 1]));
  const sourceRefs = (ids: string[]) =>
    ids
      .map((id) => sourceNumbers.get(id))
      .filter((value): value is number => value !== undefined)
      .map((value) => `[${value}]`)
      .join(" ");
  const revenueCaption = (item: Report["revenue"]["observations"][number]) => {
    const references = sourceRefs(item.sourceIds);
    return [
      item.entityName,
      `${dateLabel(item.periodStart, locale)} – ${dateLabel(item.periodEnd, locale)}`,
      { annual: labels.annual, quarter: labels.quarter, ytd: labels.yearToDate }[item.periodType],
      {
        consolidated: labels.consolidated,
        separate: labels.separate,
        unknown: labels.unknownScope,
      }[item.accountingScope],
      `${labels.account} ${item.accountLabel}`,
      references ? `${labels.references} ${references}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  doc.addFileToVFS("NanumGothic-Regular.ttf", bytesToBase64(fonts.regular));
  doc.addFont("NanumGothic-Regular.ttf", "NanumGothic", "normal");
  doc.addFileToVFS("NanumGothic-Bold.ttf", bytesToBase64(fonts.bold));
  doc.addFont("NanumGothic-Bold.ttf", "NanumGothic", "bold");
  doc.setFont("NanumGothic", "normal");
  doc.setProperties({
    title: `${isSample ? labels.samplePrefix : ""}${report.job.companyDisplayName} · ${report.job.positionTitle} ${labels.analysis}`,
    subject: labels.subject,
    author: "KnowBoth",
    creator: "KnowBoth",
  });
  let y = PAGE.top;
  const maxY = PAGE.height - PAGE.bottom;
  const setText = (color: RGB) => doc.setTextColor(...color);
  const setFill = (color: RGB) => doc.setFillColor(...color);
  const setDraw = (color: RGB) => doc.setDrawColor(...color);
  const setFont = (size: number, weight: "normal" | "bold" = "normal") => {
    doc.setFont("NanumGothic", weight);
    doc.setFontSize(size);
  };
  const lines = (text: string, width: number) =>
    doc.splitTextToSize(text.replace(/\s+/g, " ").trim(), width) as string[];
  const paragraphLines = (text: string, width: number) =>
    text.split(/\r?\n/).flatMap((part) => lines(part, width));
  const addPage = () => {
    doc.addPage();
    y = PAGE.top;
  };
  const ensure = (height: number) => {
    if (y + height > maxY) addPage();
  };
  const rule = () => {
    setDraw(COLORS.line);
    doc.setLineWidth(0.25);
    doc.line(PAGE.left, y, PAGE.width - PAGE.right, y);
    y += 5;
  };
  function paragraph(
    text: string,
    options: {
      size?: number;
      color?: RGB;
      weight?: "normal" | "bold";
      lineHeight?: number;
      indent?: number;
      after?: number;
    } = {},
  ) {
    const size = options.size ?? 9.5;
    const lineHeight = options.lineHeight ?? 5;
    const indent = options.indent ?? 0;
    setFont(size, options.weight ?? "normal");
    setText(options.color ?? COLORS.ink);
    const wrapped = lines(text, CONTENT_WIDTH - indent);
    for (const line of wrapped) {
      ensure(lineHeight + 1);
      doc.text(line, PAGE.left + indent, y);
      y += lineHeight;
    }
    y += options.after ?? 2;
  }
  function linkedText(
    text: string,
    url: string | null,
    options: {
      size?: number;
      color?: RGB;
      lineHeight?: number;
      indent?: number;
      after?: number;
    } = {},
  ) {
    const size = options.size ?? 8;
    const lineHeight = options.lineHeight ?? 4.3;
    const indent = options.indent ?? 0;
    setFont(size);
    setText(options.color ?? COLORS.blue);
    const wrapped = lines(text, CONTENT_WIDTH - indent);
    for (const line of wrapped) {
      ensure(lineHeight + 1);
      if (url) doc.textWithLink(line, PAGE.left + indent, y, { url });
      else doc.text(line, PAGE.left + indent, y);
      y += lineHeight;
    }
    y += options.after ?? 1;
  }
  function section(title: string, subtitle: string, forcePage = false) {
    if (forcePage && y > PAGE.top + 4) addPage();
    else ensure(25);
    setFont(7.5, "bold");
    setText(COLORS.blue);
    doc.text("KNOWBOTH BRIEF", PAGE.left, y);
    y += 7;
    setFont(20, "bold");
    setText(COLORS.ink);
    doc.text(title, PAGE.left, y);
    y += 6;
    paragraph(subtitle, { size: 8.5, color: COLORS.secondary, lineHeight: 4.5, after: 5 });
    rule();
  }
  function subheading(title: string) {
    ensure(12);
    y += 2;
    setFont(11, "bold");
    setText(COLORS.ink);
    doc.text(title, PAGE.left, y);
    y += 6;
  }
  function pill(text: string, x: number, top: number, fill: RGB, color: RGB) {
    setFont(6.7, "bold");
    const width = Math.min(doc.getTextWidth(text) + 5, CONTENT_WIDTH);
    setFill(fill);
    doc.roundedRect(x, top - 3.5, width, 5.4, 2.7, 2.7, "F");
    setText(color);
    doc.text(text, x + 2.5, top);
    return width;
  }
  function claimCard(claim: Claim) {
    setFont(9);
    const wrapped = lines(claim.text, CONTENT_WIDTH - 10);
    setFont(7.8);
    const rationale = claim.rationale ? lines(claim.rationale, CONTENT_WIDTH - 10) : [];
    const references = sourceRefs(claim.sourceIds);
    const height =
      8 +
      wrapped.length * 4.7 +
      (rationale.length ? rationale.length * 4 + 3 : 0) +
      (references ? 6 : 0) +
      (claim.conflict ? 7 : 0) +
      4;
    if (height > maxY - PAGE.top - 6) {
      ensure(24);
      const palette = evidenceColors(claim.kind);
      pill(evidenceLabel(claim.kind, locale), PAGE.left, y + 4, palette.fill, palette.text);
      y += 12;
      setFont(9);
      setText(COLORS.ink);
      for (const line of wrapped) {
        ensure(5);
        doc.text(line, PAGE.left, y);
        y += 4.7;
      }
      if (rationale.length) {
        y += 1;
        setFont(7.8);
        setText(COLORS.secondary);
        for (const line of rationale) {
          ensure(4.5);
          doc.text(line, PAGE.left, y);
          y += 4;
        }
      }
      if (references) {
        ensure(6);
        y += 1;
        setFont(7.2, "bold");
        setText(COLORS.blue);
        doc.text(`${labels.references} ${references}`, PAGE.left, y);
        y += 5;
      }
      if (claim.conflict) {
        ensure(8);
        y += 1;
        setFont(7.5, "bold");
        setText(COLORS.amber);
        doc.text(labels.conflict, PAGE.left, y);
        y += 6;
      }
      y += 2;
      rule();
      return;
    }
    ensure(height);
    const top = y;
    setFill(COLORS.surface);
    doc.roundedRect(PAGE.left, top, CONTENT_WIDTH, height, 3, 3, "F");
    const palette = evidenceColors(claim.kind);
    pill(evidenceLabel(claim.kind, locale), PAGE.left + 5, top + 7, palette.fill, palette.text);
    let innerY = top + 14;
    setFont(9);
    setText(COLORS.ink);
    for (const line of wrapped) {
      doc.text(line, PAGE.left + 5, innerY);
      innerY += 4.7;
    }
    if (rationale.length) {
      innerY += 1;
      setFont(7.8);
      setText(COLORS.secondary);
      for (const line of rationale) {
        doc.text(line, PAGE.left + 5, innerY);
        innerY += 4;
      }
    }
    if (references) {
      innerY += 1;
      setFont(7.2, "bold");
      setText(COLORS.blue);
      doc.text(`${labels.references} ${references}`, PAGE.left + 5, innerY);
      innerY += 5;
    }
    if (claim.conflict) {
      innerY += 1;
      setFont(7.5, "bold");
      setText(COLORS.amber);
      doc.text(labels.conflict, PAGE.left + 5, innerY);
    }
    y = top + height + 3;
  }
  function simpleCard(
    title: string,
    body: string,
    label?: {
      text: string;
      fill: RGB;
      color: RGB;
    },
  ) {
    setFont(10, "bold");
    const titleLines = lines(title, CONTENT_WIDTH - 10);
    setFont(8.5);
    const bodyLines = paragraphLines(body, CONTENT_WIDTH - 10);
    const height = 7 + titleLines.length * 5 + bodyLines.length * 4.4 + (label ? 7 : 0) + 4;
    if (height > maxY - PAGE.top - 6) {
      ensure(25);
      if (label) {
        pill(label.text, PAGE.left, y + 4, label.fill, label.color);
        y += 12;
      }
      setFont(10, "bold");
      setText(COLORS.ink);
      for (const line of titleLines) {
        ensure(5.5);
        doc.text(line, PAGE.left, y);
        y += 5;
      }
      y += 2;
      setFont(8.5);
      setText(COLORS.secondary);
      for (const line of bodyLines) {
        ensure(4.8);
        if (line) doc.text(line, PAGE.left, y);
        y += 4.4;
      }
      y += 2;
      rule();
      return;
    }
    ensure(height);
    const top = y;
    setFill(COLORS.surface);
    doc.roundedRect(PAGE.left, top, CONTENT_WIDTH, height, 3, 3, "F");
    let innerY = top + 6;
    if (label) {
      pill(label.text, PAGE.left + 5, innerY, label.fill, label.color);
      innerY += 8;
    }
    setFont(10, "bold");
    setText(COLORS.ink);
    for (const line of titleLines) {
      doc.text(line, PAGE.left + 5, innerY);
      innerY += 5;
    }
    innerY += 1;
    setFont(8.5);
    setText(COLORS.secondary);
    for (const line of bodyLines) {
      if (line) doc.text(line, PAGE.left + 5, innerY);
      innerY += 4.4;
    }
    y = top + height + 3;
  }
  function bullets(items: string[]) {
    for (const item of items) {
      setFont(8.7);
      const wrapped = lines(item, CONTENT_WIDTH - 8);
      const height = Math.max(5, wrapped.length * 4.5 + 2);
      ensure(height);
      setFill(COLORS.blue);
      doc.circle(PAGE.left + 1.5, y - 1.1, 0.65, "F");
      setText(COLORS.ink);
      for (const line of wrapped) {
        doc.text(line, PAGE.left + 6, y);
        y += 4.5;
      }
      y += 1.5;
    }
    y += 1;
  }
  // Cover
  setFont(8, "bold");
  setText(COLORS.blue);
  doc.text("KNOW THE COMPANY. KNOW YOURSELF.", PAGE.left, y);
  y += 12;
  setFont(27, "bold");
  setText(COLORS.ink);
  doc.text("KnowBoth", PAGE.left, y);
  y += 10;
  setFont(18, "bold");
  const companyLines = lines(report.job.companyDisplayName, CONTENT_WIDTH);
  for (const line of companyLines) {
    doc.text(line, PAGE.left, y);
    y += 8;
  }
  setFont(11);
  setText(COLORS.secondary);
  for (const line of lines(report.job.positionTitle, CONTENT_WIDTH)) {
    doc.text(line, PAGE.left, y);
    y += 5.5;
  }
  if (isSample) {
    y += 3;
    pill(labels.sampleNotice, PAGE.left, y + 4, COLORS.amberSoft, COLORS.amber);
    y += 11;
  }
  y += 3;
  rule();
  setFont(7.5, "bold");
  setText(COLORS.tertiary);
  doc.text(labels.analysisDate, PAGE.left, y);
  doc.text(labels.reportType, PAGE.left + 55, y);
  y += 5;
  setFont(8.5);
  setText(COLORS.ink);
  doc.text(dateLabel(report.generatedAt, locale), PAGE.left, y);
  doc.text(
    report.fitItems === null ? labels.companyReport : labels.personalizedReport,
    PAGE.left + 55,
    y,
  );
  y += 10;
  setFont(10, "bold");
  const summaryLines = lines(report.summary, CONTENT_WIDTH - 12);
  const summaryHeight = 18 + summaryLines.length * 5;
  ensure(summaryHeight + 8);
  setFill(COLORS.blueSoft);
  doc.roundedRect(PAGE.left, y, CONTENT_WIDTH, summaryHeight, 4, 4, "F");
  setFont(7.5, "bold");
  setText(COLORS.blue);
  doc.text(labels.summary, PAGE.left + 6, y + 8);
  setFont(10, "bold");
  setText(COLORS.ink);
  let summaryY = y + 15;
  for (const line of summaryLines) {
    doc.text(line, PAGE.left + 6, summaryY);
    summaryY += 5;
  }
  y += summaryHeight + 6;
  if (safeHttpUrl(report.job.sourceUrl))
    linkedText(`${labels.posting}  ${report.job.sourceUrl}`, safeHttpUrl(report.job.sourceUrl), {
      size: 7.8,
    });
  section(labels.companyTitle, labels.companySubtitle, true);
  if (report.companyClaims.length) {
    for (const claim of report.companyClaims) claimCard(claim);
  } else
    paragraph(report.sectionStates.company.reason || labels.companyEmpty, {
      color: COLORS.secondary,
    });
  subheading(labels.revenueTitle);
  if (report.revenue.selected) {
    const item = report.revenue.selected;
    simpleCard(moneyLabel(item.amountDecimal, item.currency, locale), revenueCaption(item), {
      text: labels.verified,
      fill: COLORS.greenSoft,
      color: COLORS.green,
    });
  } else
    simpleCard(labels.revenueUnavailable, report.revenue.reason || labels.revenueEmpty, {
      text: labels.evidenceLimits,
      fill: COLORS.amberSoft,
      color: COLORS.amber,
    });
  if (report.revenue.status === "conflicting" && report.revenue.observations.length) {
    subheading(labels.revenueConflict);
    for (const item of report.revenue.observations) {
      simpleCard(moneyLabel(item.amountDecimal, item.currency, locale), revenueCaption(item), {
        text: labels.comparisonNeeded,
        fill: COLORS.amberSoft,
        color: COLORS.amber,
      });
    }
  }
  if (report.businessChanges.length) {
    subheading(labels.businessChanges);
    for (const change of report.businessChanges) {
      claimCard(change.claim);
      paragraph(
        `${labels.eventDate} ${change.eventDate ? dateLabel(change.eventDate, locale) : labels.notVerified} · ${labels.publishedDate} ${change.publishedAt ? dateLabel(change.publishedAt, locale) : labels.notVerified}`,
        { size: 7.3, color: COLORS.tertiary, after: 2 },
      );
    }
  }
  section(labels.hiringTitle, labels.hiringSubtitle, true);
  if (report.roleClaims.length) {
    subheading(labels.roleTitle);
    for (const claim of report.roleClaims) claimCard(claim);
  }
  subheading(labels.hypothesesTitle);
  if (report.hiringHypotheses.length) {
    for (const item of report.hiringHypotheses) {
      const references = sourceRefs(item.evidenceSourceIds);
      simpleCard(
        item.claim,
        [
          references ? `${labels.references} ${references}` : null,
          item.alternative ? `${labels.alternative}: ${item.alternative}` : null,
          `${labels.interviewQuestion}: ${item.question}`,
        ]
          .filter(Boolean)
          .join("\n"),
        item.kind === "stated"
          ? { text: labels.stated, fill: COLORS.greenSoft, color: COLORS.green }
          : { text: labels.inference, fill: COLORS.blueSoft, color: COLORS.blue },
      );
    }
  } else
    paragraph(report.sectionStates.hiring.reason || labels.hiringEmpty, {
      color: COLORS.secondary,
    });
  if (report.requirements.length) {
    subheading(labels.requirementsTitle);
    for (const item of report.requirements) {
      const category = {
        required: labels.required,
        preferred: labels.preferred,
        work: labels.work,
        condition: labels.conditions,
      }[item.category];
      simpleCard(item.label, item.jobQuote, {
        text: category,
        fill: COLORS.surface,
        color: COLORS.secondary,
      });
    }
  }
  section(labels.fitTitle, labels.fitSubtitle, true);
  if (report.fitItems === null) {
    simpleCard(labels.noProfileTitle, labels.noProfileBody, {
      text: labels.noProfile,
      fill: COLORS.surface,
      color: COLORS.secondary,
    });
  } else if (report.fitItems.length) {
    for (const item of report.fitItems) {
      const requirement = report.requirements.find(
        (candidate) => candidate.id === item.requirementId,
      );
      const label = {
        evidence: labels.fitEvidence,
        partial: labels.fitPartial,
        gap: labels.fitGap,
        unknown: labels.fitUnknown,
      }[item.status];
      const palette =
        item.status === "evidence"
          ? { fill: COLORS.greenSoft, color: COLORS.green }
          : item.status === "partial"
            ? { fill: COLORS.blueSoft, color: COLORS.blue }
            : item.status === "gap"
              ? { fill: COLORS.redSoft, color: COLORS.red }
              : { fill: COLORS.amberSoft, color: COLORS.amber };
      const body = [
        requirement ? `${labels.jobQuote}: ${requirement.jobQuote}` : null,
        item.profileQuote ? `${labels.profileQuote}: ${item.profileQuote}` : null,
        item.reason,
        item.followUpQuestion ? `${labels.followUp}: ${item.followUpQuestion}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      simpleCard(requirement?.label || labels.competency, body, { text: label, ...palette });
    }
  } else
    paragraph(report.sectionStates.personalization.reason || labels.fitEmpty, {
      color: COLORS.secondary,
    });
  if (report.conditionChecks?.length) {
    subheading(labels.conditions);
    for (const item of report.conditionChecks) {
      const requirement = report.requirements.find(
        (candidate) => candidate.id === item.requirementId,
      );
      simpleCard(requirement?.label || labels.conditions, item.reason, {
        text: {
          met: labels.conditionMet,
          not_met: labels.conditionNotMet,
          unknown: labels.unknown,
        }[item.status],
        fill:
          item.status === "met"
            ? COLORS.greenSoft
            : item.status === "not_met"
              ? COLORS.redSoft
              : COLORS.amberSoft,
        color:
          item.status === "met"
            ? COLORS.green
            : item.status === "not_met"
              ? COLORS.red
              : COLORS.amber,
      });
    }
  }
  if (report.preferenceQuestions.length) {
    subheading(labels.preferencesTitle);
    bullets(report.preferenceQuestions.map((item) => `${item.preferenceQuote} — ${item.question}`));
  }
  section(labels.preparationTitle, labels.preparationSubtitle, true);
  const actionGroups = [
    { kind: "highlight" as const, title: labels.highlightTitle },
    { kind: "prepare" as const, title: labels.prepareTitle },
    { kind: "ask" as const, title: labels.askTitle },
  ];
  for (const group of actionGroups) {
    const items = report.actions.filter((item) => item.kind === group.kind);
    if (!items.length) continue;
    subheading(group.title);
    for (const item of items) {
      const body =
        [
          item.profileQuote ? `${labels.profileQuote}: ${item.profileQuote}` : null,
          item.deliverable ? `${labels.deliverable}: ${item.deliverable}` : null,
          item.doneWhen ? `${labels.doneWhen}: ${item.doneWhen}` : null,
        ]
          .filter(Boolean)
          .join("\n") || labels.actionFallback;
      simpleCard(item.title, body);
    }
  }
  if (!report.actions.length)
    paragraph(report.sectionStates.preparation.reason || labels.preparationEmpty, {
      color: COLORS.secondary,
    });
  if (report.warnings.length) {
    subheading(labels.warningsTitle);
    bullets(report.warnings);
  }
  section(labels.sourcesTitle, labels.sourcesSubtitle, true);
  for (let index = 0; index < report.sources.length; index++) {
    const source = report.sources[index];
    const url = safeHttpUrl(source.url);
    setFont(8.5, "bold");
    const titleLines = lines(`${index + 1}. ${source.title}`, CONTENT_WIDTH);
    ensure(titleLines.length * 4.5 + 14);
    setText(COLORS.ink);
    for (const line of titleLines) {
      doc.text(line, PAGE.left, y);
      y += 4.5;
    }
    paragraph(
      `${source.publisher || labels.unknownPublisher} · ${labels.publishedAt} ${source.publishedAt ? dateLabel(source.publishedAt, locale) : labels.notVerified} · ${labels.retrievedAt} ${dateLabel(source.retrievedAt, locale)} · ${source.evidenceMode === "raw_text" ? labels.rawText : source.evidenceMode === "provider_citation" ? labels.providerCitation : labels.userProvided}`,
      { size: 7.2, color: COLORS.secondary, lineHeight: 3.8, after: 1 },
    );
    if (url) linkedText(url, url, { size: 7, color: COLORS.blue, lineHeight: 3.8, after: 3 });
    else paragraph(labels.noLink, { size: 7, color: COLORS.tertiary, lineHeight: 3.8, after: 3 });
  }
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    setDraw(COLORS.line);
    doc.setLineWidth(0.2);
    doc.line(PAGE.left, 284, PAGE.width - PAGE.right, 284);
    setFont(6.7);
    setText(COLORS.tertiary);
    doc.text(
      `KnowBoth · ${isSample ? labels.samplePrefix : ""}${report.job.companyDisplayName} · ${report.job.positionTitle}`,
      PAGE.left,
      289,
      { maxWidth: 135 },
    );
    doc.text(`${page} / ${pageCount}`, PAGE.width - PAGE.right, 289, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
export async function downloadReportPdf(report: Report, locale: Locale = "ko"): Promise<void> {
  const labels = pdfMessages[locale];
  if (typeof window === "undefined" || typeof document === "undefined")
    throw new Error(labels.browserOnly);
  const [regular, bold] = await Promise.all([
    fetchFont("/fonts/NanumGothic-Regular.ttf", locale),
    fetchFont("/fonts/NanumGothic-Bold.ttf", locale),
  ]);
  const bytes = await buildReportPdf(report, { regular, bold }, locale);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `KnowBoth-${filenamePart(report.job.companyDisplayName)}-${filenamePart(report.job.positionTitle)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
