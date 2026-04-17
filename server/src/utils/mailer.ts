import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.majordomo.ru',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'register@moooza.ru',
    pass: process.env.SMTP_PASS || '',
  },
});

export async function sendVerificationEmail(to: string, code: string) {
  await transporter.sendMail({
    from: '"Moooza" <register@moooza.ru>',
    to,
    subject: 'Подтверждение регистрации на Moooza',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;color:#f1f5f9;border-radius:16px">
        <img src="https://moooza.ru/logo.png" alt="Moooza" style="height:36px;margin-bottom:24px" />
        <h2 style="margin:0 0 8px;font-size:20px;color:#fff">Подтвердите email</h2>
        <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">
          Введите этот код на сайте, чтобы завершить регистрацию:
        </p>
        <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#818cf8;background:#1e293b;padding:20px;border-radius:12px;text-align:center">
          ${code}
        </div>
        <p style="margin:24px 0 0;color:#64748b;font-size:12px">
          Код действителен 15 минут. Если вы не регистрировались на Moooza — просто проигнорируйте это письмо.
        </p>
      </div>
    `,
  });
}
