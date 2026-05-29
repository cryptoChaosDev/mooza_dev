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
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f172a;color:#f1f5f9;border-radius:16px">
    <img src="https://moooza.ru/logo.png" alt="Moooza" style="height:36px;margin-bottom:24px;display:block" />
    ${body}
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #1e293b;text-align:center">
      <p style="margin:0;color:#475569;font-size:12px">© ${new Date().getFullYear()} Moooza — Социальная сеть для музыкантов</p>
      <p style="margin:4px 0 0;color:#334155;font-size:12px">
        <a href="https://moooza.ru/privacy" style="color:#6366f1;text-decoration:none">Политика конфиденциальности</a>
        &nbsp;·&nbsp;
        <a href="https://moooza.ru/terms" style="color:#6366f1;text-decoration:none">Условия использования</a>
      </p>
    </div>
  </div>`;

export async function sendWelcomeEmail(to: string, firstName: string, lastName: string) {
  const fullName = `${firstName} ${lastName}`.trim();
  await registerTransport.sendMail({
    from: '"Moooza" <register@moooza.ru>',
    to,
    subject: `Добро пожаловать в Moooza, ${firstName}!`,
    html: wrapper(`
      <!-- Hero -->
      <div style="text-align:center;padding:8px 0 28px">
        <div style="font-size:48px;margin-bottom:12px">🎵</div>
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;line-height:1.3">
          Добро пожаловать,<br>${fullName}!
        </h1>
        <p style="margin:0;color:#94a3b8;font-size:15px;line-height:1.5">
          Ваш аккаунт активирован. Вы стали частью<br>первой профессиональной сети для музыкантов.
        </p>
      </div>

      <!-- Login info -->
      <div style="background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px">Ваш логин</p>
        <p style="margin:0;font-size:15px;color:#818cf8;font-weight:600">${to}</p>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:28px">
        <a href="https://moooza.ru/login"
          style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;letter-spacing:0.3px">
          Войти в профиль →
        </a>
      </div>

      <!-- Feature cards -->
      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">С чего начать</p>
      <div style="space-y:0">
        ${[
          ['🔍', 'Заполните профиль', 'Добавьте фото, профессию и услуги — вас начнут находить в каталоге'],
          ['🤝', 'Найдите коллег', 'Каталог позволяет искать музыкантов по профессии, жанру и городу'],
          ['💼', 'Оформляйте сделки', 'Структурированный процесс совместной работы с защищёнными этапами'],
        ].map(([icon, title, desc]) => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #1e293b">
            <span style="font-size:20px;flex-shrink:0;margin-top:1px">${icon}</span>
            <div>
              <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#e2e8f0">${title}</p>
              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.4">${desc}</p>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Support -->
      <div style="margin-top:20px;text-align:center">
        <p style="margin:0;font-size:13px;color:#475569">
          Вопросы? Пишите на&nbsp;
          <a href="mailto:support@moooza.ru" style="color:#6366f1;text-decoration:none">support@moooza.ru</a>
        </p>
      </div>
    `),
  });
}

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
