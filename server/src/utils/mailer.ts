import nodemailer from 'nodemailer';

const registerTransport = nodemailer.createTransport({
  host: 'smtp.majordomo.ru',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'register@moooza.ru',
    pass: process.env.SMTP_PASS || '',
  },
});

const recoverTransport = nodemailer.createTransport({
  host: 'smtp.majordomo.ru',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_RECOVER_USER || 'recover@moooza.ru',
    pass: process.env.SMTP_RECOVER_PASS || '',
  },
});

const codeBlock = (code: string) =>
  `<div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#818cf8;background:#1e293b;padding:20px;border-radius:12px;text-align:center">${code}</div>`;

const wrapper = (body: string) => `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;color:#f1f5f9;border-radius:16px">
    <img src="https://moooza.ru/logo.png" alt="Moooza" style="height:36px;margin-bottom:24px" />
    ${body}
  </div>`;

export async function sendVerificationEmail(to: string, code: string) {
  await registerTransport.sendMail({
    from: '"Moooza" <register@moooza.ru>',
    to,
    subject: 'Подтверждение регистрации на Moooza',
    html: wrapper(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#fff">Подтвердите email</h2>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">Введите этот код, чтобы завершить регистрацию:</p>
      ${codeBlock(code)}
      <p style="margin:24px 0 0;color:#64748b;font-size:12px">Код действителен 15 минут. Если вы не регистрировались — проигнорируйте это письмо.</p>
    `),
  });
}

export async function sendPasswordResetEmail(to: string, code: string) {
  await recoverTransport.sendMail({
    from: '"Moooza" <recover@moooza.ru>',
    to,
    subject: 'Сброс пароля на Moooza',
    html: wrapper(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#fff">Сброс пароля</h2>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">Введите этот код на сайте, чтобы задать новый пароль:</p>
      ${codeBlock(code)}
      <p style="margin:24px 0 0;color:#64748b;font-size:12px">Код действителен 15 минут. Если вы не запрашивали сброс — проигнорируйте это письмо.</p>
    `),
  });
}
