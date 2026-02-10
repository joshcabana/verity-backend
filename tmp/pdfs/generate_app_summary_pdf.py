from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


OUTPUT_PATH = "/Users/joshcabana/verity/output/pdf/verity-app-summary.pdf"

PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN_X = 44
MARGIN_TOP = 42
MARGIN_BOTTOM = 40
CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2)

TITLE_FONT = ("Helvetica-Bold", 16)
SECTION_FONT = ("Helvetica-Bold", 11)
BODY_FONT = ("Helvetica", 9.2)
BODY_LEADING = 11.4


def wrap_text(text: str, font_name: str, font_size: float, max_width: float):
    words = text.split()
    if not words:
        return [""]

    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        width = pdfmetrics.stringWidth(candidate, font_name, font_size)
        if width <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_heading(pdf: canvas.Canvas, y: float, text: str):
    pdf.setFont(*SECTION_FONT)
    pdf.drawString(MARGIN_X, y, text)
    return y - 14


def draw_lines(
    pdf: canvas.Canvas,
    y: float,
    lines: list[str],
    bullet: bool = False,
    numbered: bool = False,
):
    font_name, font_size = BODY_FONT
    pdf.setFont(font_name, font_size)

    for index, raw in enumerate(lines, start=1):
        if numbered:
            prefix = f"{index}. "
        elif bullet:
            prefix = "- "
        else:
            prefix = ""

        prefix_width = pdfmetrics.stringWidth(prefix, font_name, font_size)
        wrapped = wrap_text(raw, font_name, font_size, CONTENT_WIDTH - prefix_width)
        for wrapped_index, line in enumerate(wrapped):
            current_prefix = prefix if wrapped_index == 0 else " " * len(prefix)
            pdf.drawString(MARGIN_X, y, f"{current_prefix}{line}")
            y -= BODY_LEADING
        y -= 2.2
    return y


def build_pdf():
    pdf = canvas.Canvas(OUTPUT_PATH, pagesize=letter)
    y = PAGE_HEIGHT - MARGIN_TOP

    pdf.setFont(*TITLE_FONT)
    pdf.drawString(MARGIN_X, y, "Verity App Summary (Repo-Based)")
    y -= 19

    y = draw_heading(pdf, y, "What It Is")
    y = draw_lines(
        pdf,
        y,
        [
            "Verity is a real-time matching and short video session platform with double opt-in matching before identity reveal and chat.",
            "The repository contains a NestJS backend plus React web and React Native mobile clients, with Australia-first deployment guidance.",
        ],
    )

    y = draw_heading(pdf, y, "Who It Is For")
    y = draw_lines(
        pdf,
        y,
        [
            "Explicit primary user/persona statement: Not found in repo.",
            "Inferred from implemented flows: end users seeking brief live introductions before choosing MATCH or PASS.",
        ],
    )

    y = draw_heading(pdf, y, "What It Does")
    y = draw_lines(
        pdf,
        y,
        [
            "Anonymous onboarding/auth with JWT access plus rotating refresh tokens; optional phone/email verification endpoints.",
            "Token-gated queue join/leave using Redis, including refunds on leave when no match is made.",
            "Background matching worker pairs queued users and creates timed sessions.",
            "45-second live video sessions using server-issued Agora RTC/RTM tokens and server-authoritative session end events.",
            "Double opt-in decisions (MATCH/PASS) create mutual matches and unlock identity reveal and chat only on mutual match.",
            "Persistent and real-time chat for match participants using PostgreSQL storage and Socket.IO events.",
            "Payments (Stripe checkout/webhook), moderation (Hive webhook plus report/block), analytics, notifications, and feature flags.",
        ],
        bullet=True,
    )

    y = draw_heading(pdf, y, "How It Works (Architecture)")
    y = draw_lines(
        pdf,
        y,
        [
            "Clients: `verity-web` (Vite/React) and `verity-mobile` (React Native) call backend REST APIs and Socket.IO namespaces (`/queue`, `/video`, `/chat`).",
            "Backend: NestJS app composes modules for auth, queue, session, video, chat, payments, moderation, notifications, monitoring, analytics, and flags.",
            "State/data: Prisma persists users, sessions, matches, messages, transactions, and moderation records in PostgreSQL; Redis stores queue state, locks, and timed session metadata.",
            "Flow: join queue (token debit) -> worker match -> session + video tokens -> choices -> mutual match/non-mutual -> chat and notifications.",
            "Deployment evidence: same backend image can run API and dedicated worker, distinguished by `ENABLE_MATCHING_WORKER`.",
        ],
        bullet=True,
    )

    y = draw_heading(pdf, y, "How To Run (Minimal)")
    y = draw_lines(
        pdf,
        y,
        [
            "At repo root: `npm ci`, then configure environment using `.env.production.example` (minimum local essentials include `DATABASE_URL`, `REDIS_URL`, and JWT secrets).",
            "Bring up PostgreSQL and Redis, then sync schema for local dev: `DATABASE_URL=... npx prisma db push --accept-data-loss`.",
            "Start backend API: `npm run start:dev` (defaults to port 3000).",
            "Start web client: `cd verity-web && npm install && npm run dev` (set `VITE_API_URL`, `VITE_WS_URL`, and `VITE_AGORA_APP_ID`).",
            "Mobile local startup commands: Not found in repo.",
        ],
        numbered=True,
    )

    if y < MARGIN_BOTTOM:
        raise RuntimeError(
            f"Content overflowed one page (y={y:.2f}, min={MARGIN_BOTTOM})."
        )

    pdf.setFont("Helvetica-Oblique", 7.8)
    pdf.drawString(
        MARGIN_X,
        MARGIN_BOTTOM - 2,
        "Evidence sources: README.md, src/app.module.ts, src/main.ts, prisma/schema.prisma, verity-web/README.md, verity-mobile/README.md",
    )

    pdf.showPage()
    pdf.save()


if __name__ == "__main__":
    build_pdf()
