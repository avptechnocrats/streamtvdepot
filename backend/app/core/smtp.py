import smtplib
from email.message import EmailMessage


def send_email_via_smtp(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    to_email: str,
    from_email: str,
    subject: str,
    body_text: str | None = None,
    body_html: str | None = None,
    timeout: float = 20.0,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> None:
    """Send an email using SMTP credentials.
    
    Args:
        host: SMTP server hostname
        port: SMTP server port
        username: SMTP authentication username
        password: SMTP authentication password
        to_email: Recipient email address
        from_email: Sender email address
        subject: Email subject
        body_text: Plain text email body (used if body_html not provided)
        body_html: HTML email body (takes precedence if both provided)
        timeout: Connection timeout in seconds
        attachments: Optional list of (filename, content_bytes, subtype) e.g. ("invoice.pdf", pdf_bytes, "pdf")
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    
    if body_html:
        msg.set_content(body_text or "")  # Plain text alternative
        msg.add_alternative(body_html, subtype="html")  # HTML version
    elif body_text:
        msg.set_content(body_text)
    else:
        msg.set_content("")

    for filename, content, subtype in attachments or []:
        msg.add_attachment(content, maintype="application", subtype=subtype, filename=filename)

    if port == 465:
        with smtplib.SMTP_SSL(host=host, port=port, timeout=timeout) as server:
            server.login(username, password)
            server.send_message(msg)
        return

    with smtplib.SMTP(host=host, port=port, timeout=timeout) as server:
        server.ehlo()
        try:
            server.starttls()
            server.ehlo()
        except smtplib.SMTPNotSupportedError:
            # Some SMTP servers do not advertise STARTTLS on this port.
            pass
        server.login(username, password)
        server.send_message(msg)
