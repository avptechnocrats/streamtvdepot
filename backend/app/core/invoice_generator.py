"""
Invoice generation from monthly usage records.
Exports as PDF or CSV.
"""

import io
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import BinaryIO
from urllib.request import urlopen

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

_LOGO_PATH = Path(__file__).parent / "assets" / "logo_light.png"
# Logo original: 1262x313 px – render at 1.5 in wide (maintains aspect ratio)
_LOGO_W = 1.5 * 72   # 72 points per inch
_LOGO_H = _LOGO_W * (313 / 1262)

import csv


class ExportFormat(str, Enum):
    CSV = "csv"
    PDF = "pdf"


def generate_invoice_csv(
    client_name: str,
    client_slug: str,
    plan_name: str,
    billing_year: int,
    billing_month: int,
    base_fee: float,
    overages: dict,  # {metric: amount}
    total_invoice: float,
    currency: str,
) -> BinaryIO:
    """Generate invoice as CSV."""
    output = io.BytesIO()
    writer = csv.writer(io.TextIOWrapper(output, encoding="utf-8", newline=""))

    writer.writerow(["SignalView Invoice"])
    writer.writerow([])
    writer.writerow(["Invoice Date:", f"{billing_year}-{billing_month:02d}-01"])
    writer.writerow(["Client:", client_name])
    writer.writerow(["Client Slug:", client_slug])
    writer.writerow(["Plan:", plan_name])
    writer.writerow(["Currency:", currency])
    writer.writerow([])

    writer.writerow(["Description", "Amount"])
    writer.writerow(["Base Plan Fee", f"{currency} {base_fee:.2f}"])

    for metric, amount in overages.items():
        if amount > 0:
            writer.writerow([f"Overage - {metric}", f"{currency} {amount:.2f}"])

    writer.writerow([])
    writer.writerow(["TOTAL", f"{currency} {total_invoice:.2f}"])

    output.seek(0)
    return output


def generate_invoice_pdf(
    client_name: str,
    client_slug: str,
    plan_name: str,
    billing_year: int,
    billing_month: int,
    base_fee: float,
    overages: dict,
    total_invoice: float,
    currency: str,
) -> BinaryIO:
    """Generate invoice as PDF."""
    if not HAS_REPORTLAB:
        raise ImportError("reportlab is required for PDF export. Install with: pip install reportlab")

    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, topMargin=0.5 * inch, bottomMargin=0.5 * inch)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontSize=24,
        textColor=colors.HexColor("#1F2937"),
        spaceAfter=12,
        alignment=1,  # Center
    )
    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#374151"),
        spaceAfter=6,
    )
    normal_style = ParagraphStyle("Normal", parent=styles["Normal"], fontSize=10)

    elements = []

    # Title
    elements.append(Paragraph("INVOICE", title_style))
    elements.append(Spacer(1, 0.2 * inch))

    # Header info
    info_data = [
        ["Invoice Date:", f"{billing_year}-{billing_month:02d}-01"],
        ["Client:", client_name],
        ["Client Slug:", client_slug],
        ["Plan:", plan_name],
        ["Currency:", currency],
    ]
    info_table = Table(info_data, colWidths=[2 * inch, 4 * inch])
    info_table.setStyle(
        TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6B7280")),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    elements.append(info_table)
    elements.append(Spacer(1, 0.3 * inch))

    # Line items
    elements.append(Paragraph("Charges", heading_style))
    line_items = [["Description", "Amount"]]
    line_items.append(["Base Plan Fee", f"{currency} {base_fee:.2f}"])

    for metric, amount in overages.items():
        if amount > 0:
            line_items.append([f"Overage - {metric}", f"{currency} {amount:.2f}"])

    line_items.append(["", ""])
    line_items.append(["TOTAL", f"{currency} {total_invoice:.2f}"])

    line_table = Table(line_items, colWidths=[4 * inch, 2 * inch])
    line_table.setStyle(
        TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
            ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 12),
            ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#1F2937")),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -2), 8),
            ("LINEABOVE", (0, -1), (-1, -1), 2, colors.HexColor("#E5E7EB")),
        ])
    )
    elements.append(line_table)

    doc.build(elements)
    output.seek(0)
    return output


# ─────────────────────────────────────────────────────────────────────────────
# Billing-record PDF generators (SaasBilling based)
# Used by the client-admin /payment-history download endpoints.
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_date(value: str | None) -> str:
    if not value:
        return "-"
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return d.strftime("%b %d, %Y")
    except Exception:
        return str(value)


def _fmt_currency(amount: float, currency: str) -> str:
    return f"{currency} {amount:,.2f}"


def generate_billing_invoice_pdf(
    invoice_number: str,
    created_at: str | None,
    amount: float,
    currency: str,
    plan_name: str | None,
    period_start: str | None,
    period_end: str | None,
    bill_to_name: str,
    bill_to_company: str | None,
    bill_to_address: str | None,
    bill_to_vat: str | None,
    issuer_footer: str | None,
) -> "io.BytesIO":
    """
    Formal Invoice PDF with BILL TO section.
    No payment status, transaction ID, or payment method.
    """
    if not HAS_REPORTLAB:
        raise ImportError("reportlab is required. Install with: pip install reportlab")

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output, pagesize=A4,
        topMargin=0.6 * inch, bottomMargin=0.5 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    page_w = A4[0]
    usable_w = page_w - 1.5 * inch
    col_half = usable_w / 2 - 0.1 * inch

    C_DARK  = colors.HexColor("#1F2937")
    C_MID   = colors.HexColor("#6B7280")
    C_LIGHT = colors.HexColor("#9CA3AF")
    C_RULE  = colors.HexColor("#E5E7EB")

    def P(text, **kw):
        s = ParagraphStyle("_", parent=styles["Normal"], **kw)
        return Paragraph(str(text), s)

    invoice_date = _fmt_date(created_at)
    elements = []

    # Header
    logo_cell = (Image(str(_LOGO_PATH), width=_LOGO_W, height=_LOGO_H)
                 if _LOGO_PATH.exists() else
                 P("SignalView", fontSize=18, fontName="Helvetica-Bold", textColor=C_DARK))
    ht = Table([[logo_cell,
                 P("INVOICE", fontSize=18, fontName="Helvetica-Bold", textColor=C_DARK, alignment=2)]],
               colWidths=[col_half, col_half])
    ht.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"BOTTOM"),
                             ("LINEBELOW",(0,0),(-1,0),1.5,C_RULE),
                             ("BOTTOMPADDING",(0,0),(-1,0),10)]))
    elements += [ht, Spacer(1, 0.25*inch)]

    # Bill-to cell
    bt = [P("BILL TO", fontSize=8, fontName="Helvetica-Bold", textColor=C_LIGHT, spaceAfter=4)]
    if bill_to_name:
        bt.append(P(bill_to_name, fontSize=11, fontName="Helvetica-Bold", textColor=C_DARK))
    if bill_to_company:
        bt.append(P(bill_to_company, fontSize=10, textColor=C_DARK, leading=16))
    if bill_to_address:
        for line in bill_to_address.split("\n"):
            if line.strip():
                bt.append(P(line.strip(), fontSize=10, textColor=C_DARK, leading=16))
    if bill_to_vat:
        bt.append(P(f"VAT ID: {bill_to_vat}", fontSize=9, textColor=C_MID))

    # Meta table (right column)
    meta_rows = [
        ("Invoice #",    invoice_number),
        ("Invoice Date", invoice_date),
        ("Terms",        "Due Upon Receipt"),
        ("Due Date",     invoice_date),
        ("Currency",     currency),
    ]
    meta_data = [[P(k, fontSize=9, textColor=C_MID),
                  P(v, fontSize=10, fontName="Helvetica-Bold", textColor=C_DARK, alignment=2)]
                 for k, v in meta_rows]
    meta_tbl = Table(meta_data, colWidths=[col_half*0.45, col_half*0.55])
    meta_tbl.setStyle(TableStyle([("ALIGN",(1,0),(1,-1),"RIGHT"),
                                   ("VALIGN",(0,0),(-1,-1),"TOP"),
                                   ("BOTTOMPADDING",(0,0),(-1,-1),5)]))

    two_col = Table([[bt, meta_tbl]], colWidths=[col_half, col_half])
    two_col.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                                  ("LINEBELOW",(0,0),(-1,0),0.5,C_RULE),
                                  ("BOTTOMPADDING",(0,0),(-1,0),12)]))
    elements += [two_col, Spacer(1, 0.25*inch)]

    # Line items
    period_note = (f" ({_fmt_date(period_start)} – {_fmt_date(period_end)})"
                   if period_start and period_end else "")
    desc = f"{plan_name or 'Subscription Plan'}{period_note}"
    items = Table(
        [[P("DESCRIPTION", fontSize=9, fontName="Helvetica-Bold", textColor=C_MID),
          P("AMOUNT",      fontSize=9, fontName="Helvetica-Bold", textColor=C_MID)],
         [P(desc, fontSize=10, textColor=C_DARK),
          P(_fmt_currency(amount, currency), fontSize=10, textColor=C_DARK, alignment=2)]],
        colWidths=[usable_w*0.72, usable_w*0.28])
    items.setStyle(TableStyle([("LINEBELOW",(0,0),(-1,0),1.5,C_RULE),
                                ("LINEBELOW",(0,1),(-1,1),0.5,C_RULE),
                                ("ALIGN",(1,0),(1,-1),"RIGHT"),
                                ("VALIGN",(0,0),(-1,-1),"TOP"),
                                ("TOPPADDING",(0,0),(-1,-1),8),
                                ("BOTTOMPADDING",(0,0),(-1,-1),8)]))
    elements += [items, Spacer(1, 0.15*inch)]

    # Totals
    totals = Table(
        [[P("Subtotal",  fontSize=9,  textColor=C_MID),
          P(_fmt_currency(amount, currency), fontSize=10, textColor=C_DARK, alignment=2)],
         [P("Total Due", fontSize=12, fontName="Helvetica-Bold", textColor=C_DARK),
          P(_fmt_currency(amount, currency), fontSize=12, fontName="Helvetica-Bold", textColor=C_DARK, alignment=2)]],
        colWidths=[usable_w*0.72, usable_w*0.28])
    totals.setStyle(TableStyle([("LINEABOVE",(0,1),(-1,1),2.0,C_DARK),
                                 ("LINEBELOW",(0,1),(-1,1),2.0,C_DARK),
                                 ("ALIGN",(1,0),(1,-1),"RIGHT"),
                                 ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                                 ("TOPPADDING",(0,0),(-1,-1),7),
                                 ("BOTTOMPADDING",(0,0),(-1,-1),7)]))
    elements.append(totals)

    if issuer_footer:
        elements += [Spacer(1, 0.5*inch),
                     P(issuer_footer, fontSize=8, textColor=C_LIGHT, alignment=1)]

    doc.build(elements)
    output.seek(0)
    return output


def generate_end_user_invoice_pdf(
    invoice_number: str,
    issued_at: str | None,
    amount: float,
    tax_amount: float,
    currency: str,
    client_name: str,
    client_address: str | None,
    client_email: str | None,
    user_name: str,
    user_email: str | None,
    user_address: str | None,
) -> "io.BytesIO":
    """Generate a client-issued invoice for an end-user transaction."""
    if not HAS_REPORTLAB:
        raise ImportError("reportlab is required. Install with: pip install reportlab")

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output, pagesize=A4,
        topMargin=0.6 * inch, bottomMargin=0.5 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    usable_w = A4[0] - 1.5 * inch
    C_DARK = colors.HexColor("#1F2937")
    C_MID = colors.HexColor("#6B7280")
    C_LIGHT = colors.HexColor("#9CA3AF")
    C_RULE = colors.HexColor("#E5E7EB")

    def P(value: str, **kwargs):
        style = ParagraphStyle("_", parent=styles["Normal"], **kwargs)
        return Paragraph(value, style)

    def party(label: str, name: str, email: str | None, address: str | None):
        lines = [P(label, fontSize=8, fontName="Helvetica-Bold", textColor=C_LIGHT, spaceAfter=4)]
        lines.append(P(name, fontSize=11, fontName="Helvetica-Bold", textColor=C_DARK))
        if email:
            lines.append(P(email, fontSize=9, textColor=C_MID, leading=14))
        if address:
            for line in address.split("\n"):
                if line.strip():
                    lines.append(P(line.strip(), fontSize=9, textColor=C_MID, leading=14))
        return lines

    elements = []
    heading = Table(
        [[P(client_name, fontSize=18, fontName="Helvetica-Bold", textColor=C_DARK),
          P("INVOICE", fontSize=18, fontName="Helvetica-Bold", textColor=C_DARK, alignment=2)]],
        colWidths=[usable_w * 0.6, usable_w * 0.4],
    )
    heading.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, C_RULE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    elements += [heading, Spacer(1, 0.25 * inch)]

    parties = Table(
        [[party("BILLED BY", client_name, client_email, client_address),
          party("BILLED TO", user_name, user_email, user_address)]],
        colWidths=[usable_w / 2, usable_w / 2],
    )
    parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, C_RULE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    elements += [parties, Spacer(1, 0.2 * inch)]

    metadata = Table(
        [[P("Invoice #", fontSize=9, textColor=C_MID), P(invoice_number, fontSize=10, fontName="Helvetica-Bold", textColor=C_DARK)],
         [P("Invoice Date", fontSize=9, textColor=C_MID), P(_fmt_date(issued_at), fontSize=10, fontName="Helvetica-Bold", textColor=C_DARK)],
         [P("Currency", fontSize=9, textColor=C_MID), P(currency, fontSize=10, fontName="Helvetica-Bold", textColor=C_DARK)]],
        colWidths=[usable_w * 0.2, usable_w * 0.8],
    )
    metadata.setStyle(TableStyle([("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    elements += [metadata, Spacer(1, 0.25 * inch)]

    subtotal = max(amount - tax_amount, 0)
    items = Table(
        [[P("DESCRIPTION", fontSize=9, fontName="Helvetica-Bold", textColor=C_MID),
          P("AMOUNT", fontSize=9, fontName="Helvetica-Bold", textColor=C_MID, alignment=2)],
         [P("Digital content purchase", fontSize=10, textColor=C_DARK),
          P(_fmt_currency(subtotal, currency), fontSize=10, textColor=C_DARK, alignment=2)]],
        colWidths=[usable_w * 0.72, usable_w * 0.28],
    )
    items.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, C_RULE),
        ("LINEBELOW", (0, 1), (-1, 1), 0.5, C_RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements += [items, Spacer(1, 0.15 * inch)]

    totals = [[P("Subtotal", fontSize=9, textColor=C_MID), P(_fmt_currency(subtotal, currency), fontSize=10, textColor=C_DARK, alignment=2)]]
    if tax_amount:
        totals.append([P("Tax", fontSize=9, textColor=C_MID), P(_fmt_currency(tax_amount, currency), fontSize=10, textColor=C_DARK, alignment=2)])
    totals.append([P("Total Due", fontSize=12, fontName="Helvetica-Bold", textColor=C_DARK), P(_fmt_currency(amount, currency), fontSize=12, fontName="Helvetica-Bold", textColor=C_DARK, alignment=2)])
    total_table = Table(totals, colWidths=[usable_w * 0.72, usable_w * 0.28])
    total_table.setStyle(TableStyle([
        ("LINEABOVE", (0, -1), (-1, -1), 2, C_DARK),
        ("LINEBELOW", (0, -1), (-1, -1), 2, C_DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.append(total_table)

    doc.build(elements)
    output.seek(0)
    return output


def generate_billing_receipt_pdf(
    invoice_number: str,
    created_at: str | None,
    paid_at: str | None,
    amount: float,
    currency: str,
    status: str,
    plan_name: str | None,
    period_start: str | None,
    period_end: str | None,
    transaction_id: str | None,
    payment_method: str | None,
    issuer_footer: str | None,
    logo_url: str | None = None,
    tax_amount: float = 0,
    original_amount: float | None = None,
    discount_amount: float = 0,
) -> "io.BytesIO":
    """
    Receipt PDF confirming payment.
    Includes status, transaction ID, and payment method.
    """
    if not HAS_REPORTLAB:
        raise ImportError("reportlab is required. Install with: pip install reportlab")

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output, pagesize=A4,
        topMargin=0.6 * inch, bottomMargin=0.5 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    page_w = A4[0]
    usable_w = page_w - 1.5 * inch
    col_half = usable_w / 2 - 0.1 * inch

    C_DARK  = colors.HexColor("#1F2937")
    C_MID   = colors.HexColor("#6B7280")
    C_LIGHT = colors.HexColor("#9CA3AF")
    C_RULE  = colors.HexColor("#E5E7EB")
    STATUS_COLORS = {"paid":"#10B981","pending":"#F59E0B","failed":"#EF4444",
                     "refunded":"#3B82F6","cancelled":"#9CA3AF"}
    C_STATUS = colors.HexColor(STATUS_COLORS.get(status.lower(), "#6B7280"))

    def P(text, **kw):
        s = ParagraphStyle("_", parent=styles["Normal"], **kw)
        return Paragraph(str(text), s)

    elements = []

    # Header
    logo_cell = None
    if logo_url:
        try:
            with urlopen(logo_url, timeout=8) as resp:
                logo_bytes = resp.read()
            logo_cell = Image(io.BytesIO(logo_bytes), width=_LOGO_W, height=_LOGO_H)
        except Exception:
            logo_cell = None

    if logo_cell is None and _LOGO_PATH.exists():
        logo_cell = Image(str(_LOGO_PATH), width=_LOGO_W, height=_LOGO_H)

    if logo_cell is None:
        logo_cell = P("SignalView", fontSize=18, fontName="Helvetica-Bold", textColor=C_DARK)
    ht = Table([[logo_cell,
                 P("RECEIPT", fontSize=18, fontName="Helvetica-Bold", textColor=C_DARK, alignment=2)]],
               colWidths=[col_half, col_half])
    ht.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"BOTTOM"),
                             ("LINEBELOW",(0,0),(-1,0),1.5,C_RULE),
                             ("BOTTOMPADDING",(0,0),(-1,0),10)]))
    elements += [ht, Spacer(1, 0.25*inch)]

    # Meta grid
    def _meta_block(rows: list[tuple[str, str]], status_row: str | None = None) -> list:
        block = []
        for label, value in rows:
            block.append(P(label.upper(), fontSize=8, fontName="Helvetica-Bold", textColor=C_LIGHT, spaceAfter=2))
            if label.lower() == "status":
                block.append(P(value, fontSize=10, fontName="Helvetica-Bold", textColor=C_STATUS))
            else:
                block.append(P(value, fontSize=10, fontName="Helvetica-Bold", textColor=C_DARK))
            block.append(Spacer(1, 6))
        return block

    left_rows  = [("Receipt #", invoice_number),
                  ("Date",      _fmt_date(paid_at or created_at)),
                  ("Status",    status.upper())]
    right_rows: list[tuple[str,str]] = []
    if transaction_id:  right_rows.append(("Transaction ID", transaction_id))
    if payment_method:  right_rows.append(("Payment Method", payment_method.capitalize()))
    if period_start and period_end:
        right_rows.append(("Billing Period", f"{_fmt_date(period_start)} – {_fmt_date(period_end)}"))

    two_col = Table([[_meta_block(left_rows), _meta_block(right_rows)]],
                    colWidths=[col_half, col_half])
    two_col.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                                  ("LINEBELOW",(0,0),(-1,0),0.5,C_RULE),
                                  ("BOTTOMPADDING",(0,0),(-1,0),10)]))
    elements += [two_col, Spacer(1, 0.25*inch)]

    # Line items
    period_note = (f" ({_fmt_date(period_start)} – {_fmt_date(period_end)})"
                   if period_start and period_end else "")
    desc = f"{plan_name or 'Subscription Plan'}{period_note}"
    listed_amount = original_amount if original_amount is not None else amount
    items = Table(
        [[P("DESCRIPTION", fontSize=9, fontName="Helvetica-Bold", textColor=C_MID),
          P("AMOUNT",      fontSize=9, fontName="Helvetica-Bold", textColor=C_MID)],
         [P(desc, fontSize=10, textColor=C_DARK),
          P(_fmt_currency(listed_amount, currency), fontSize=10, textColor=C_DARK, alignment=2)]],
        colWidths=[usable_w*0.72, usable_w*0.28])
    items.setStyle(TableStyle([("LINEBELOW",(0,0),(-1,0),1.5,C_RULE),
                                ("LINEBELOW",(0,1),(-1,1),0.5,C_RULE),
                                ("ALIGN",(1,0),(1,-1),"RIGHT"),
                                ("VALIGN",(0,0),(-1,-1),"TOP"),
                                ("TOPPADDING",(0,0),(-1,-1),8),
                                ("BOTTOMPADDING",(0,0),(-1,-1),8)]))
    elements += [items, Spacer(1, 0.15*inch)]

    # Totals
    subtotal = max(listed_amount, 0)
    total_rows = [[P("Subtotal", fontSize=9, textColor=C_MID),
                   P(_fmt_currency(subtotal, currency), fontSize=10, textColor=C_DARK, alignment=2)]]
    if discount_amount:
        total_rows.append([P("Discount", fontSize=9, textColor=C_MID),
                           P(f"-{_fmt_currency(discount_amount, currency)}", fontSize=10, textColor=C_DARK, alignment=2)])
    if tax_amount:
        total_rows.append([P("Tax", fontSize=9, textColor=C_MID),
                           P(_fmt_currency(tax_amount, currency), fontSize=10, textColor=C_DARK, alignment=2)])
    total_rows.append([P("Total", fontSize=12, fontName="Helvetica-Bold", textColor=C_DARK),
                       P(_fmt_currency(amount, currency), fontSize=12, fontName="Helvetica-Bold", textColor=C_DARK, alignment=2)])
    totals = Table(total_rows, colWidths=[usable_w*0.72, usable_w*0.28])
    total_row = len(total_rows) - 1
    totals.setStyle(TableStyle([("LINEABOVE",(0,total_row),(-1,total_row),2.0,C_DARK),
                                 ("LINEBELOW",(0,total_row),(-1,total_row),2.0,C_DARK),
                                 ("ALIGN",(1,0),(1,-1),"RIGHT"),
                                 ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                                 ("TOPPADDING",(0,0),(-1,-1),7),
                                 ("BOTTOMPADDING",(0,0),(-1,-1),7)]))
    elements.append(totals)

    if issuer_footer:
        elements += [Spacer(1, 0.5*inch),
                     P(issuer_footer, fontSize=8, textColor=C_LIGHT, alignment=1)]

    doc.build(elements)
    output.seek(0)
    return output
