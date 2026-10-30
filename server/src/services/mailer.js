import nodemailer from 'nodemailer';

const gmailUser = process.env.GMAIL_USER;
const gmailPassword = process.env.GMAIL_PASSWORD?.replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailUser,
    pass: gmailPassword,
  },
});

export async function sendOtpEmail({ to, code, expiresInMinutes = 10 }) {
  if (!gmailUser || !gmailPassword) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Gmail credentials are not configured.');
    }

    console.warn(`[dev] OTP for ${to}: ${code}`);
    return;
  }

  const unit = expiresInMinutes === 1 ? 'minute' : 'minutes';

  await transporter.sendMail({
    from: process.env.OTP_EMAIL_FROM || gmailUser,
    to,
    subject: 'Your Finance Tracker verification code',
    text: `Your verification code is ${code}. It expires in ${expiresInMinutes} ${unit}. If you did not request this, you can ignore this email.`,
  });
}

export async function verifyMailer() {
  await transporter.verify();
}
