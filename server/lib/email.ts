import nodemailer from "nodemailer";
import { env } from "./env";
import { logger } from "./logger";

// Create reusable transporter object using SMTP transport
export function getMailTransporter() {
  const host = env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT) || 465;
  const secure = env.SMTP_SECURE === true || port === 465;
  const user = env.SMTP_USER || "novaaias014@gmail.com";
  const pass = env.SMTP_PASS || "avhdszmxuxmacmix";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false, // Prevents self-signed cert issues in enterprise environments
    },
  });
}

/**
 * Verify SMTP connection status
 */
export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const transporter = getMailTransporter();
    await transporter.verify();
    logger.info("SMTP transporter verified successfully.", { user: env.SMTP_USER });
    return { ok: true, message: "SMTP server connected and authenticated successfully." };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.warn("SMTP verification warning (Check Gmail App Password / 2FA)", { error: errMsg });
    return { ok: false, message: errMsg };
  }
}

// ─── Email Template Wrapper ──────────────────────────────────────────────────
function wrapEmailTemplate(contentHtml: string, previewText: string = ""): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sejal Glass ERP</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #0f172a;
      color: #334155;
      margin: 0;
      padding: 24px 12px;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      max-width: 580px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #0f172a 100%);
      padding: 32px 28px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .header p {
      margin: 6px 0 0 0;
      font-size: 13px;
      color: #bae6fd;
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 12px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #ffffff;
    }
    .content {
      padding: 32px 28px;
      line-height: 1.6;
      color: #1e293b;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px 28px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
    .otp-box {
      margin: 24px 0;
      padding: 20px;
      background: #f0f9ff;
      border: 2px dashed #0284c7;
      border-radius: 12px;
      text-align: center;
    }
    .otp-code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 8px;
      color: #0369a1;
      margin: 8px 0;
      display: inline-block;
    }
    .btn {
      display: inline-block;
      background-color: #0284c7;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 28px;
      border-radius: 8px;
      margin-top: 16px;
      text-align: center;
    }
    .card-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;
      margin: 20px 0;
    }
    .card-info table {
      width: 100%;
      border-collapse: collapse;
    }
    .card-info td {
      padding: 6px 0;
      font-size: 13px;
    }
    .card-info td.label {
      color: #64748b;
      width: 35%;
      font-weight: 600;
    }
    .card-info td.val {
      color: #0f172a;
      font-weight: 700;
    }
    .security-note {
      font-size: 12px;
      color: #64748b;
      border-left: 3px solid #0284c7;
      padding-left: 12px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText}
  </div>
  <div class="wrapper">
    <div class="header">
      <h1>SEJAL GLASS</h1>
      <p>Operations &amp; Production ERP Portal</p>
      <div class="badge">Enterprise Security Notification</div>
    </div>
    <div class="content">
      ${contentHtml}
    </div>
    <div class="footer">
      <p style="margin:0 0 6px 0;"><strong>Sejal Glass &amp; Glass Manufacturing Products LLC</strong></p>
      <p style="margin:0 0 8px 0;">This is an automated system email. Please do not reply directly to this message.</p>
      <p style="margin:0; font-size: 11px; color: #94a3b8;">&copy; ${new Date().getFullYear()} Sejal Glass ERP. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;
}

// ─── 1. Send Forgot Password OTP ─────────────────────────────────────────────
export interface SendOtpOptions {
  to: string;
  name: string;
  otp: string;
  role?: string;
  expiryMinutes?: number;
}

export async function sendOtpEmail({
  to,
  name,
  otp,
  role,
  expiryMinutes = 15,
}: SendOtpOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const from = env.SMTP_FROM || `"Sejal Glass ERP" <${env.SMTP_USER || "novaaias014@gmail.com"}>`;
    const transporter = getMailTransporter();

    const contentHtml = `
      <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Password Reset Verification</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>We received a request to reset the password for your Sejal Glass ERP account (${role ? `Role: <strong>${role}</strong>` : `User: <strong>${to}</strong>`}).</p>
      
      <p>Use the 6-digit One-Time Password (OTP) below to authorize the password change:</p>

      <div class="otp-box">
        <div style="font-size:12px; font-weight:700; color:#0369a1; text-transform:uppercase; letter-spacing:1px;">Your One-Time Code</div>
        <div class="otp-code">${otp}</div>
        <div style="font-size:12px; color:#64748b;">This OTP code will expire in <strong>${expiryMinutes} minutes</strong>.</div>
      </div>

      <div class="security-note">
        <strong>Security Notice:</strong> If you did not request a password reset, please ignore this email or notify your system administrator immediately. Never share this code with anyone.
      </div>
    `;

    const info = await transporter.sendMail({
      from,
      to,
      subject: `[Sejal Glass ERP] Password Reset OTP: ${otp}`,
      text: `Hello ${name},\n\nYour Sejal Glass ERP password reset OTP code is: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes.\nIf you did not request this, please contact your administrator.`,
      html: wrapEmailTemplate(contentHtml, `Your Sejal Glass ERP password reset code is ${otp}`),
    });

    logger.info("Password Reset OTP email dispatched successfully", { to, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.error("Failed to send Password Reset OTP email", { to, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ─── 2. Send New User / ID Welcome & Credentials ──────────────────────────────
export interface SendNewUserCredentialsOptions {
  to: string;
  name: string;
  username: string;
  role: string;
  password?: string;
  loginUrl?: string;
}

export async function sendNewUserWelcomeEmail({
  to,
  name,
  username,
  role,
  password,
  loginUrl,
}: SendNewUserCredentialsOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const from = env.SMTP_FROM || `"Sejal Glass ERP" <${env.SMTP_USER || "novaaias014@gmail.com"}>`;
    const appUrl = loginUrl || env.APP_URL || "http://localhost:8080";
    const transporter = getMailTransporter();

    const contentHtml = `
      <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Welcome to Sejal Glass ERP Portal</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>An enterprise account has been created for you on the <strong>Sejal Glass Production &amp; Operations ERP Portal</strong>.</p>
      
      <div class="card-info">
        <div style="font-size:12px; font-weight:700; color:#0369a1; text-transform:uppercase; margin-bottom:10px; letter-spacing:0.5px;">Account Credentials</div>
        <table>
          <tr>
            <td class="label">Full Name:</td>
            <td class="val">${name}</td>
          </tr>
          <tr>
            <td class="label">Assigned Role:</td>
            <td class="val"><span style="display:inline-block; padding:2px 8px; background:#e0f2fe; color:#0369a1; border-radius:4px; font-size:12px;">${role}</span></td>
          </tr>
          <tr>
            <td class="label">Username / Email:</td>
            <td class="val"><code>${username}</code> (${to})</td>
          </tr>
          ${
            password
              ? `<tr>
            <td class="label">Initial Password:</td>
            <td class="val"><code style="background:#f1f5f9; padding:3px 8px; border-radius:4px; border:1px solid #cbd5e1; font-weight:bold; color:#0f172a;">${password}</code></td>
          </tr>`
              : ""
          }
        </table>
      </div>

      <div style="text-align:center; margin: 24px 0;">
        <a href="${appUrl}/login" class="btn" target="_blank">Sign In to ERP Portal &rarr;</a>
      </div>

      <div class="security-note">
        <strong>Important:</strong> For security reasons, please change your password after logging in for the first time. Keep your login credentials confidential.
      </div>
    `;

    const info = await transporter.sendMail({
      from,
      to,
      subject: `[Sejal Glass ERP] Welcome! Your New Account Credentials (${role})`,
      text: `Hello ${name},\n\nYour Sejal Glass ERP account has been created with role: ${role}.\nUsername: ${username}\n${password ? `Initial Password: ${password}\n` : ""}\nSign in at: ${appUrl}/login\n\nPlease change your password after your initial login.`,
      html: wrapEmailTemplate(contentHtml, `Welcome to Sejal Glass ERP! Your account has been provisioned.`),
    });

    logger.info("New user welcome email dispatched successfully", { to, username, role, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.error("Failed to send new user welcome email", { to, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ─── 3. Send Password Reset Confirmation ──────────────────────────────────────
export async function sendPasswordResetSuccessEmail({
  to,
  name,
}: {
  to: string;
  name: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const from = env.SMTP_FROM || `"Sejal Glass ERP" <${env.SMTP_USER || "novaaias014@gmail.com"}>`;
    const transporter = getMailTransporter();

    const contentHtml = `
      <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Password Changed Successfully</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>This email confirms that the password for your Sejal Glass ERP account (<strong>${to}</strong>) was successfully reset.</p>
      
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:14px; margin:20px 0; color:#166534; font-size:13px;">
        <strong>✓ Security Status:</strong> Password update verified at ${new Date().toUTCString()}.
      </div>

      <div class="security-note">
        <strong>Notice:</strong> If you did NOT perform this action, your account may be compromised. Please notify your IT / System Administrator immediately.
      </div>
    `;

    const info = await transporter.sendMail({
      from,
      to,
      subject: `[Sejal Glass ERP] Security Alert: Password Changed Successfully`,
      text: `Hello ${name},\n\nYour Sejal Glass ERP account password was successfully updated. If you did not do this, please contact your administrator immediately.`,
      html: wrapEmailTemplate(contentHtml, `Your Sejal Glass ERP password was changed successfully.`),
    });

    logger.info("Password change confirmation email dispatched", { to, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.error("Failed to send password changed alert", { to, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ─── 4. Send Generic Notification / Test Email ───────────────────────────────
export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const from = env.SMTP_FROM || `"Sejal Glass ERP" <${env.SMTP_USER || "novaaias014@gmail.com"}>`;
    const transporter = getMailTransporter();

    const contentHtml = `
      <h2 style="margin-top:0; color:#0f172a; font-size:20px;">SMTP Connection Test</h2>
      <p>This is a test email sent from the <strong>Sejal Glass ERP</strong> system.</p>
      
      <div class="card-info">
        <div style="font-size:12px; font-weight:700; color:#0369a1; text-transform:uppercase; margin-bottom:10px;">Configuration Parameters</div>
        <table>
          <tr>
            <td class="label">SMTP Host:</td>
            <td class="val">${env.SMTP_HOST || "smtp.gmail.com"}</td>
          </tr>
          <tr>
            <td class="label">SMTP Port:</td>
            <td class="val">${env.SMTP_PORT || 465}</td>
          </tr>
          <tr>
            <td class="label">Sender Account:</td>
            <td class="val">${env.SMTP_USER || "novaaias014@gmail.com"}</td>
          </tr>
          <tr>
            <td class="label">Dispatched Time:</td>
            <td class="val">${new Date().toISOString()}</td>
          </tr>
        </table>
      </div>

      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:14px; margin:20px 0; color:#166534; font-size:13px;">
        <strong>✓ Operational:</strong> SMTP Email Service is active and ready to deliver password resets, new ID creations, and system notifications.
      </div>
    `;

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: `[Sejal Glass ERP] SMTP System Test Notification`,
      text: `This is a test email from Sejal Glass ERP system. SMTP is working!`,
      html: wrapEmailTemplate(contentHtml, `Sejal Glass ERP SMTP Test Email Successful`),
    });

    logger.info("Test email sent successfully", { to: toEmail, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.error("Failed to send test email", { to: toEmail, error: errMsg });
    return { success: false, error: errMsg };
  }
}
