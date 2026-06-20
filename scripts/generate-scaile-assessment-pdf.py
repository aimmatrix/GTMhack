#!/usr/bin/env python3
"""Generate SCAILE integration assessment PDF."""

from pathlib import Path

from fpdf import FPDF


class AssessmentPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "Noodle / Lightfern Reach - SCAILE Integration Assessment", align="R")
        self.ln(4)
        self.set_draw_color(220, 220, 220)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}  |  Generated 2026-06-20", align="C")

    def section_title(self, title: str):
        self.ln(4)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(20, 20, 20)
        self.multi_cell(0, 8, title)
        self.ln(2)

    def subsection_title(self, title: str):
        self.ln(2)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 7, title)
        self.ln(1)

    def body(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def bullet(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        x = self.get_x()
        self.cell(6, 5.5, "-")
        self.multi_cell(0, 5.5, text)
        self.set_x(x)
        self.ln(0.5)

    def table_row(self, col1: str, col2: str, header: bool = False):
        if header:
            self.set_font("Helvetica", "B", 9)
            self.set_fill_color(245, 245, 245)
        else:
            self.set_font("Helvetica", "", 9)
            self.set_fill_color(255, 255, 255)

        self.set_text_color(30, 30, 30)
        w1, w2 = 45, 145
        y0 = self.get_y()
        x0 = self.get_x()

        self.multi_cell(w1, 5, col1, border=1, fill=header)
        y1 = self.get_y()
        self.set_xy(x0 + w1, y0)
        self.multi_cell(w2, 5, col2, border=1, fill=header)
        y2 = self.get_y()
        self.set_xy(x0, max(y1, y2))


def build_pdf(output: Path) -> None:
    pdf = AssessmentPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(15, 15, 15)
    pdf.multi_cell(0, 10, "SCAILE Integration Assessment")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(0, 6, "Can Noodle / Lightfern Reach integrate with scaile.tech?")
    pdf.ln(4)

    pdf.section_title("Short answer")
    pdf.body(
        "You cannot plug this project directly into scaile.tech today. SCAILE does not expose "
        "a public integration API for their content engine, and their product is built for a "
        "different job than yours. What is feasible is a complementary partnership story, or "
        "enriching your app with SCAILE's open AEO tooling - not embedding Noodle inside their "
        "platform without their team."
    )

    pdf.section_title("What each product does")
    pdf.table_row("Dimension", "Your project vs SCAILE", header=True)
    pdf.table_row(
        "Job",
        "Noodle: outbound find people/companies, research packets, Lightfern/Gmail draft. "
        "SCAILE: inbound AEO content, visibility tracking, social listening.",
    )
    pdf.table_row(
        "Flow",
        "Noodle: Who should I reach? to match cards to handoff. "
        "SCAILE: How do we show up in ChatGPT/Perplexity? to articles and analytics.",
    )
    pdf.table_row(
        "Stack",
        "Noodle: static frontend + Fastify backend (/api/brief, /api/run, /api/lightfern/handoff). "
        "SCAILE: managed content engine + marketing site + app.scaile.tech dashboard.",
    )
    pdf.table_row(
        "API",
        "Noodle: documented in backend/API-CONTRACT.md. "
        "SCAILE: no public SaaS API for the content pipeline.",
    )
    pdf.ln(3)
    pdf.body(
        "SCAILE's grounding page explicitly states they are not a CRM, sales automation, or "
        "lead enrichment tool. Your app is exactly that - a research and outreach context layer."
    )
    pdf.body(
        "This is not a natural drop-in integration. It is two different layers of GTM: "
        "SCAILE handles inbound AI visibility; Noodle handles outbound research and drafting."
    )

    pdf.section_title("Can you integrate into scaile.tech?")
    pdf.body("Not without SCAILE's involvement.")
    pdf.subsection_title("Blockers")
    pdf.bullet(
        "No public integration surface - product is a managed 9-step content pipeline, "
        "not an embeddable developer platform."
    )
    pdf.bullet(
        "app.scaile.tech is closed - the product UI lives behind their platform; "
        "you do not have access to that codebase from this repo."
    )
    pdf.bullet(
        "Product mismatch - SCAILE's dashboard is about content pipelines, mentions, "
        "and AEO scores, not find investors in London and draft outreach."
    )
    pdf.bullet(
        "Adding Noodle would mean a new product module, not a configuration toggle."
    )
    pdf.subsection_title("Where it could make sense (with SCAILE)")
    pdf.body(
        "As an add-on for clients who want to activate outbound after content identifies gaps - "
        "for example: You are invisible for query X, here are 8 companies/people to pitch. "
        "That is a partnership conversation with SCAILE leadership, not something you can ship solo."
    )

    pdf.section_title("What you can do from this repo")
    pdf.subsection_title("Option A - Integrate SCAILE data into Noodle (most practical)")
    pdf.body(
        "SCAILE open-sourced their AEO analysis stack: github.com/scailetech/openanalytics "
        "with endpoints POST /health (29-point site health), POST /mentions (AI visibility), "
        "and POST /analyze (full combined analysis)."
    )
    pdf.bullet("Run AEO score on the target's domain for company match cards.")
    pdf.bullet(
        "Surface gaps in suggested_angle - e.g. They rank F for AI visibility on logistics queries."
    )
    pdf.bullet(
        "Self-host openanalytics, or ask SCAILE for hosted API access. "
        "An aeo/ provider fits your existing backend provider pattern."
    )

    pdf.subsection_title("Option B - Wire the frontend to your existing backend")
    pdf.body(
        "script.js is still a static demo. The backend is ready at localhost:8787 per "
        "API-CONTRACT.md, but nothing calls it yet. This is the first integration step "
        "regardless of SCAILE."
    )

    pdf.subsection_title("Option C - Partnership / narrative only")
    pdf.body(
        "For a hackathon or pitch: SCAILE = inbound AI visibility; "
        "Noodle + Lightfern = outbound activation on researched targets. "
        "The story works; a live technical bridge does not exist today."
    )

    pdf.subsection_title("Option D - Light marketing cross-links (low effort)")
    pdf.body(
        "Link target company domains to SCAILE's free checker (scaile.tech/#ai-score) or "
        "leaderboard.scaile.tech - useful context, not real integration."
    )

    pdf.section_title("Recommendation")
    pdf.table_row("Goal", "Feasibility / Next step", header=True)
    pdf.table_row(
        "Embed Noodle inside scaile.tech",
        "Not without SCAILE. Email info@scaile.tech or book a strategy call.",
    )
    pdf.table_row(
        "Enrich Noodle cards with AEO scores",
        "High feasibility. Self-host openanalytics or request API access.",
    )
    pdf.table_row(
        "Complete the Noodle demo end-to-end",
        "High feasibility. Connect index.html to POST /api/brief and SSE /api/run.",
    )
    pdf.table_row(
        "Position as SCAILE inbound + Noodle outbound",
        "Easy - positioning only.",
    )

    pdf.section_title("Bottom line")
    pdf.body(
        "Integrating this project into scaile.tech's webapp is not something you can do unilaterally - "
        "different products, no public API, closed platform. The realistic paths are: "
        "(1) enrich your app with SCAILE's open AEO tooling for smarter outreach angles, or "
        "(2) partner with SCAILE if you want Noodle inside their product."
    )
    pdf.ln(2)
    pdf.body(
        "Suggested next step in this repo: wire the frontend to your backend, "
        "then add openanalytics enrichment on company cards."
    )

    pdf.output(str(output))


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "SCAILE-Integration-Assessment.pdf"
    build_pdf(out)
    print(out)
