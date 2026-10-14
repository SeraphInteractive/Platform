import type { JSONContent } from "@tiptap/react";

function escapeXml(unsafe: string): string {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const TYPE_TO_FDX: Record<string, string> = {
    sceneHeading: "Scene Heading",
    action: "Action",
    character: "Character",
    dialogue: "Dialogue",
    parenthetical: "Parenthetical",
    transition: "Transition"
};

const FDX_TO_TYPE: Record<string, string> = {
    "Scene Heading": "sceneHeading",
    Action: "action",
    Character: "character",
    Dialogue: "dialogue",
    Parenthetical: "parenthetical",
    Transition: "transition",
    General: "action",
    Shot: "action"
};

export function exportToFdx(doc: JSONContent, title = "Untitled Script", author?: string): string {
    const paragraphs: string[] = [];

    if (doc.content && Array.isArray(doc.content)) {
        for (const node of doc.content) {
            if (node.type === "pageBreak") {
                paragraphs.push('    <Paragraph Type="Action" PageBreak="Yes">\n      <Text></Text>\n    </Paragraph>');
                continue;
            }
            const fdxType = TYPE_TO_FDX[node.type || ""] || "Action";
            let text = "";
            if (node.type === "scriptImage") {
                text = `[STORYBOARD: ${node.attrs?.caption || "Image"}]`;
            } else if (node.content && Array.isArray(node.content)) {
                text = node.content.map((c) => (c.type === "hardBreak" ? "\n" : c.text || "")).join("");
            }
            const lines = text.split(/\r?\n/);
            for (const line of lines) {
                paragraphs.push(`    <Paragraph Type="${fdxType}">\n      <Text>${escapeXml(line)}</Text>\n    </Paragraph>`);
            }
        }
    }

    const titleParagraphs = [`      <Paragraph Alignment="Center">\n        <Text>${escapeXml(title)}</Text>\n      </Paragraph>`];
    if (author) {
        titleParagraphs.push(
            `      <Paragraph Alignment="Center">\n        <Text></Text>\n      </Paragraph>`,
            `      <Paragraph Alignment="Center">\n        <Text>Written by</Text>\n      </Paragraph>`,
            `      <Paragraph Alignment="Center">\n        <Text>${escapeXml(author)}</Text>\n      </Paragraph>`
        );
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="3">
  <HeaderAndFooter AlignValue="Right" FirstPageHeader="No" FirstPageNumber="1" StartingPageNumber="1">
    <Header>
      <Paragraph Alignment="Right">
        <Text></Text>
      </Paragraph>
    </Header>
    <Footer>
      <Paragraph Alignment="Right">
        <Text></Text>
      </Paragraph>
    </Footer>
  </HeaderAndFooter>
  <TitlePage>
    <HeaderAndFooter>
      <Header><Paragraph><Text></Text></Paragraph></Header>
      <Footer><Paragraph><Text></Text></Paragraph></Footer>
    </HeaderAndFooter>
    <Content>
${titleParagraphs.join("\n")}
    </Content>
  </TitlePage>
  <Content>
${paragraphs.join("\n")}
  </Content>
</FinalDraft>`;
}

export function parseFdx(xmlString: string): JSONContent {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    const paragraphs = xmlDoc.getElementsByTagName("Paragraph");
    const content: JSONContent[] = [];

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        if (!p) continue;
        // skip paragraphs located within Header, Footer, or TitlePage
        if (p.closest("TitlePage") || p.closest("Header") || p.closest("Footer")) {
            continue;
        }

        // detect explicit FDX page break
        if (p.getAttribute("PageBreak") === "Yes" || p.getElementsByTagName("PageBreak").length > 0) {
            content.push({ type: "pageBreak" });
            continue;
        }

        const typeAttr = p.getAttribute("Type") || "Action";
        const nodeType = FDX_TO_TYPE[typeAttr] || "action";

        const textNodes = p.getElementsByTagName("Text");
        let fullText = "";
        for (let j = 0; j < textNodes.length; j++) {
            const t = textNodes[j];
            if (t) fullText += t.textContent || "";
        }

        content.push({
            type: nodeType,
            content: fullText.length > 0 ? [{ type: "text", text: fullText }] : []
        });
    }

    // fallback to a default scene if empty
    if (content.length === 0) {
        content.push({
            type: "sceneHeading",
            content: [{ type: "text", text: "INT. STUDIO - DAY" }]
        });
        content.push({
            type: "action",
            content: [{ type: "text", text: "Begin writing the screenplay here." }]
        });
    }

    return {
        type: "doc",
        content
    };
}
