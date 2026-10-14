import { jsPDF } from "jspdf";
import type { JSONContent } from "@tiptap/react";
import type { TitlePageData } from "@/types/script";

// standard screenplay dimensions (us letter at 72 points per inch)
const PTS_PER_INCH = 72;
const PAGE_WIDTH_PT = 8.5 * PTS_PER_INCH; // 612pt
const PAGE_HEIGHT_PT = 11.0 * PTS_PER_INCH; // 792pt
const TOP_MARGIN_PT = 1.0 * PTS_PER_INCH; // 72pt
const BOTTOM_MARGIN_PT = 1.0 * PTS_PER_INCH; // 72pt
const USABLE_BOTTOM_PT = PAGE_HEIGHT_PT - BOTTOM_MARGIN_PT; // 720pt
const LINE_HEIGHT_PT = 12;

interface ElementSpec {
    leftPt: number;
    maxWidthPt: number;
    uppercase?: boolean;
    bold?: boolean;
    spaceBeforeLines: number;
}

const DEFAULT_SPEC: ElementSpec = {
    leftPt: 1.5 * PTS_PER_INCH,
    maxWidthPt: 6.0 * PTS_PER_INCH,
    spaceBeforeLines: 1
};

// screenplay element indents and max line widths (points)
// matching open draft and final draft specifications
const ELEMENT_SPECS: Record<string, ElementSpec> = {
    sceneHeading: {
        leftPt: 1.5 * PTS_PER_INCH, // 108pt
        maxWidthPt: 6.0 * PTS_PER_INCH, // 432pt (~60 chars)
        uppercase: true,
        bold: true,
        spaceBeforeLines: 2
    },
    action: {
        leftPt: 1.5 * PTS_PER_INCH, // 108pt
        maxWidthPt: 6.0 * PTS_PER_INCH, // 432pt (~60 chars)
        spaceBeforeLines: 1
    },
    character: {
        leftPt: 3.7 * PTS_PER_INCH, // 266.4pt (~37 chars from left margin)
        maxWidthPt: 3.8 * PTS_PER_INCH, // 273.6pt
        uppercase: true,
        bold: false,
        spaceBeforeLines: 1
    },
    parenthetical: {
        leftPt: 3.1 * PTS_PER_INCH, // 223.2pt
        maxWidthPt: 2.5 * PTS_PER_INCH, // 180pt (~25 chars)
        spaceBeforeLines: 0
    },
    dialogue: {
        leftPt: 2.5 * PTS_PER_INCH, // 180pt
        maxWidthPt: 3.5 * PTS_PER_INCH, // 252pt (~35 chars)
        spaceBeforeLines: 0
    },
    transition: {
        leftPt: 5.5 * PTS_PER_INCH, // 396pt
        maxWidthPt: 2.0 * PTS_PER_INCH, // 144pt
        uppercase: true,
        spaceBeforeLines: 1
    },
    general: DEFAULT_SPEC
};

export interface PdfExportOptions {
    includeTitlePage?: boolean;
    includeSceneNumbers?: boolean;
    headerStartingNumber?: number;
}

export interface PdfExportResult {
    bytes: Uint8Array;
    blob: Blob;
    totalPages: number;
    save: (filename: string) => void;
}

// wraps text to fit within max width using monospace courier character measurement
function wrapMonospaceText(text: string, maxWidthPt: number, pdf: jsPDF): string[] {
    if (!text) return [""];
    const paragraphs = text.split(/\r?\n/);
    const resultLines: string[] = [];

    for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
            resultLines.push("");
            continue;
        }

        const words = paragraph.split(" ");
        let currentLine = "";

        for (const word of words) {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            const candidateWidth = pdf.getTextWidth(candidate);

            if (candidateWidth <= maxWidthPt) {
                currentLine = candidate;
            } else {
                if (currentLine) {
                    resultLines.push(currentLine);
                }
                // slice single oversized token if it exceeds full line width
                if (pdf.getTextWidth(word) > maxWidthPt) {
                    let remaining = word;
                    while (pdf.getTextWidth(remaining) > maxWidthPt) {
                        let sliceIndex = remaining.length - 1;
                        while (sliceIndex > 0 && pdf.getTextWidth(remaining.slice(0, sliceIndex)) > maxWidthPt) {
                            sliceIndex--;
                        }
                        resultLines.push(remaining.slice(0, sliceIndex));
                        remaining = remaining.slice(sliceIndex);
                    }
                    currentLine = remaining;
                } else {
                    currentLine = word;
                }
            }
        }

        if (currentLine) {
            resultLines.push(currentLine);
        }
    }

    return resultLines.length > 0 ? resultLines : [""];
}

// extracts plain text from a tiptap node content tree
function extractNodeText(node: JSONContent): string {
    if (!node.content || !Array.isArray(node.content)) return "";
    return node.content
        .map((child) => {
            if (child.type === "text") return child.text || "";
            if (child.type === "hardBreak") return "\n";
            return "";
        })
        .join("");
}

export function exportToPdf(
    doc: JSONContent,
    title = "Untitled Script",
    titlePage?: TitlePageData,
    options: PdfExportOptions = {}
): PdfExportResult {
    const pdf = new jsPDF({
        unit: "pt",
        format: [PAGE_WIDTH_PT, PAGE_HEIGHT_PT]
    });

    // courier standard 12pt (10 cpi, 12pt line height)
    pdf.setFont("courier", "normal");
    pdf.setFontSize(12);

    const hasTitlePage = options.includeTitlePage !== false && !!(titlePage && (titlePage.title || titlePage.author));
    let currentY = TOP_MARGIN_PT;
    let pageCount = 1;
    let isFirstScriptElement = true;

    // render title page if provided
    if (hasTitlePage && titlePage) {
        const centerX = PAGE_WIDTH_PT / 2;
        const leftIndentPt = ELEMENT_SPECS.action?.leftPt ?? DEFAULT_SPEC.leftPt;

        // title (bold, uppercase, 16pt)
        const displayTitle = (titlePage.title || title).trim().toUpperCase();
        pdf.setFont("courier", "bold");
        pdf.setFontSize(16);
        const titleLines = pdf.splitTextToSize(displayTitle, 5.0 * PTS_PER_INCH);
        let titleY = 280;
        for (const line of titleLines) {
            pdf.text(line, centerX, titleY, { align: "center" });
            titleY += 18;
        }

        // byline stack
        pdf.setFont("courier", "normal");
        pdf.setFontSize(12);
        pdf.text("written by", centerX, titleY + 24, { align: "center" });

        const author = (titlePage.author || "Written by").trim();
        pdf.text(author, centerX, titleY + 48, { align: "center" });

        if (titlePage.basedOn?.trim()) {
            pdf.text(`Based on: ${titlePage.basedOn.trim()}`, centerX, titleY + 84, { align: "center" });
        }

        // contact and draft info in bottom corners
        let bottomY = 680;
        if (titlePage.draftInfo?.trim()) {
            pdf.text(titlePage.draftInfo.trim(), leftIndentPt, bottomY);
            bottomY += 16;
        }
        if (titlePage.contact?.trim()) {
            const contactLines = titlePage.contact.trim().split(/\r?\n/);
            for (const line of contactLines) {
                pdf.text(line, leftIndentPt, bottomY);
                bottomY += 14;
            }
        }

        // advance to script page 1
        pdf.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
        pageCount++;
        currentY = TOP_MARGIN_PT;
    }

    const newPage = () => {
        pdf.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
        pageCount++;
        currentY = TOP_MARGIN_PT;
        isFirstScriptElement = true;
    };

    const docNodes = doc.content ?? [];

    for (let i = 0; i < docNodes.length; i++) {
        const node = docNodes[i];
        if (!node) continue;

        const type = node.type || "action";

        if (type === "pageBreak") {
            newPage();
            continue;
        }

        // storyboard image embed
        if (type === "scriptImage") {
            const src = (node.attrs?.src as string) || "";
            const caption = (node.attrs?.caption as string) || "";

            const imgWidthPt = Math.min(4.5 * PTS_PER_INCH, 324);
            const imgHeightPt = 180;
            const requiredHeight = imgHeightPt + (caption ? 24 : 12);

            if (currentY + requiredHeight > USABLE_BOTTOM_PT && !isFirstScriptElement) {
                newPage();
            }

            const imgX = (PAGE_WIDTH_PT - imgWidthPt) / 2;
            if (src && (src.startsWith("data:image/") || src.startsWith("http"))) {
                try {
                    const format = src.includes("png") ? "PNG" : "JPEG";
                    pdf.addImage(src, format, imgX, currentY, imgWidthPt, imgHeightPt);
                } catch {
                    // draw placeholder frame if raw image decode fails
                    pdf.setDrawColor(180, 180, 180);
                    pdf.rect(imgX, currentY, imgWidthPt, imgHeightPt);
                }
            } else {
                pdf.setDrawColor(180, 180, 180);
                pdf.rect(imgX, currentY, imgWidthPt, imgHeightPt);
            }

            currentY += imgHeightPt + 12;

            if (caption) {
                pdf.setFont("courier", "italic");
                pdf.setFontSize(10);
                pdf.text(caption, PAGE_WIDTH_PT / 2, currentY, { align: "center" });
                pdf.setFont("courier", "normal");
                pdf.setFontSize(12);
                currentY += 14;
            }

            isFirstScriptElement = false;
            continue;
        }

        const spec: ElementSpec = ELEMENT_SPECS[type] ?? DEFAULT_SPEC;
        let text = extractNodeText(node);
        if (spec.uppercase) {
            text = text.toUpperCase();
        }

        // skip empty blocks that carry no structural spacing
        if (!text.trim() && type !== "sceneHeading") {
            continue;
        }

        // set font attributes
        if (spec.bold) {
            pdf.setFont("courier", "bold");
        } else {
            pdf.setFont("courier", "normal");
        }
        pdf.setFontSize(12);

        const lines = wrapMonospaceText(text, spec.maxWidthPt, pdf);
        const blockHeightPt = lines.length * LINE_HEIGHT_PT;

        // space before element unless top of page
        const spaceBeforePt = isFirstScriptElement ? 0 : spec.spaceBeforeLines * LINE_HEIGHT_PT;

        // orphan prevention:
        // scene headings need at least heading + 2 lines of scene action/character
        // characters need at least character + 2 lines of dialogue
        const orphanReserveLines = type === "sceneHeading" ? 3 : type === "character" ? 3 : 1;
        const requiredSpace = blockHeightPt + spaceBeforePt + (orphanReserveLines - 1) * LINE_HEIGHT_PT;

        if (currentY + requiredSpace > USABLE_BOTTOM_PT && !isFirstScriptElement) {
            newPage();
        } else {
            currentY += spaceBeforePt;
        }

        // render scene numbers on scene headings if enabled
        if (type === "sceneHeading" && options.includeSceneNumbers && node.attrs?.sceneNumber) {
            const sceneNum = String(node.attrs.sceneNumber);
            pdf.setFont("courier", "bold");
            pdf.text(sceneNum, 1.0 * PTS_PER_INCH, currentY + LINE_HEIGHT_PT);
            pdf.text(sceneNum, 7.5 * PTS_PER_INCH - pdf.getTextWidth(sceneNum), currentY + LINE_HEIGHT_PT);
        }

        // render lines
        for (const line of lines) {
            if (currentY + LINE_HEIGHT_PT > USABLE_BOTTOM_PT) {
                newPage();
                if (spec.bold) pdf.setFont("courier", "bold");
                else pdf.setFont("courier", "normal");
            }

            const yBaseline = currentY + LINE_HEIGHT_PT;

            if (type === "transition") {
                // right-align transitions flush to 7.5in right margin
                const rightX = 7.5 * PTS_PER_INCH;
                const textWidth = pdf.getTextWidth(line);
                pdf.text(line, rightX - textWidth, yBaseline);
            } else {
                pdf.text(line, spec.leftPt, yBaseline);
            }

            currentY += LINE_HEIGHT_PT;
        }

        isFirstScriptElement = false;
    }

    // second pass: stamp page numbers in header (script page 2 onwards)
    // industry standard: page 1 of script never carries a page number
    const totalSheets = pdf.getNumberOfPages();
    const titleSheets = hasTitlePage ? 1 : 0;

    for (let sheet = 1; sheet <= totalSheets; sheet++) {
        if (sheet <= titleSheets) continue; // title page is never numbered

        const scriptPageNumber = sheet - titleSheets;
        if (scriptPageNumber <= 1) continue; // script page 1 is never numbered

        pdf.setPage(sheet);
        pdf.setFont("courier", "normal");
        pdf.setFontSize(12);

        // header top-right at 7.5in (540pt), 0.5in (36pt) from top edge
        const pageLabel = `${scriptPageNumber}.`;
        const textWidth = pdf.getTextWidth(pageLabel);
        pdf.text(pageLabel, 7.5 * PTS_PER_INCH - textWidth, 0.5 * PTS_PER_INCH);
    }

    const outputBuffer = pdf.output("arraybuffer");
    const bytes = new Uint8Array(outputBuffer);
    const blob = new Blob([bytes], { type: "application/pdf" });

    return {
        bytes,
        blob,
        totalPages: totalSheets - titleSheets,
        save: (filename: string) => {
            const safeName = filename.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            pdf.save(`${safeName}.pdf`);
        }
    };
}

export function downloadPdf(doc: JSONContent, title: string, titlePage?: TitlePageData, options?: PdfExportOptions): void {
    const result = exportToPdf(doc, title, titlePage, options);
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
}
