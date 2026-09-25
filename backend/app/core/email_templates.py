"""Professional HTML email templates with logo support."""


def generate_professional_email_html(
    subject: str,
    body_text: str,
    logo_url: str | None = None,
    company_name: str | None = None,
    footer_text: str | None = None,
) -> str:
    """Generate a professional HTML email template with optional logo.
    
    Args:
        subject: Email subject line
        body_text: Main body text/message
        logo_url: URL to company/client logo
        company_name: Company/platform name for branding
        footer_text: Custom footer text (company address, phone, etc.)
    
    Returns:
        HTML-formatted email content
    """
    # Escape HTML content for safety
    body_html = body_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br />")
    
    company_display = company_name or "SignalView"
    
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }}
        
        .email-container {{
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }}
        
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px 20px;
            text-align: center;
            border-bottom: 4px solid #667eea;
        }}
        
        .logo {{
            max-width: 180px;
            height: auto;
            margin-bottom: 15px;
        }}
        
        .header-title {{
            color: #ffffff;
            font-size: 24px;
            font-weight: 600;
            margin: 0;
        }}
        
        .content {{
            padding: 40px 30px;
        }}
        
        .content p {{
            margin-bottom: 15px;
            color: #555;
            font-size: 14px;
            line-height: 1.7;
        }}
        
        .content p:first-child {{
            font-size: 16px;
            color: #333;
            margin-bottom: 20px;
        }}
        
        .divider {{
            border-top: 1px solid #e0e0e0;
            margin: 30px 0;
        }}
        
        .footer {{
            background-color: #f9f9f9;
            padding: 25px 30px;
            text-align: center;
            border-top: 1px solid #e0e0e0;
        }}
        
        .footer-text {{
            font-size: 12px;
            color: #999;
            line-height: 1.8;
            white-space: pre-line;
        }}
        
        .footer-separator {{
            color: #ddd;
            margin: 15px 0;
        }}
        
        .company-name {{
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
            font-size: 13px;
        }}
        
        @media only screen and (max-width: 600px) {{
            .email-container {{
                width: 100% !important;
                margin: 0 !important;
            }}
            
            .content {{
                padding: 25px 15px !important;
            }}
            
            .header {{
                padding: 20px 15px !important;
            }}
            
            .footer {{
                padding: 20px 15px !important;
            }}
            
            .header-text {{
                font-size: 20px !important;
            }}
            
            .logo {{
                max-width: 120px !important;
            }}
        }}
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            {'<img src="' + logo_url + '" alt="' + company_display + '" class="logo" />' if logo_url else ''}
            <h1 class="header-title">{company_display}</h1>
        </div>
        
        <div class="content">
            <p>{body_html}</p>
        </div>
        
        <div class="divider"></div>
        
        <div class="footer">
            <p class="company-name">{company_display}</p>
            {'<p class="footer-text">' + footer_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br />") + '</p>' if footer_text else ''}
            <div class="footer-separator">—————————</div>
            <p class="footer-text">This is an automated email. Please do not reply to this message.</p>
        </div>
    </div>
</body>
</html>"""


def generate_simple_html_email(
    subject: str,
    body_text: str,
) -> str:
    """Generate a simple HTML email without logo (fallback for basic emails).
    
    Args:
        subject: Email subject line
        body_text: Main body text/message
    
    Returns:
        Simple HTML-formatted email content
    """
    return generate_professional_email_html(
        subject=subject,
        body_text=body_text,
        logo_url=None,
        company_name=None,
        footer_text=None,
    )
