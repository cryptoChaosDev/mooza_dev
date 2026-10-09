import nodemailer from 'nodemailer';

// SMTP endpoint is configurable so a server whose provider blocks outbound SMTP
// (ports 465/587) can route mail through a relay. SMTP_SERVERNAME pins the TLS
// certificate name when the relay host differs from the real SMTP host.
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.majordomo.ru';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SERVERNAME = process.env.SMTP_SERVERNAME || undefined;

// Fail fast instead of hanging forever when SMTP is unreachable.
const COMMON = {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  ...(SMTP_SERVERNAME ? { tls: { servername: SMTP_SERVERNAME } } : {}),
} as const;

const registerTransport = nodemailer.createTransport({
  ...COMMON,
  auth: {
    user: process.env.SMTP_USER || 'register@moooza.ru',
    pass: process.env.SMTP_PASS || '',
  },
});

const recoverTransport = nodemailer.createTransport({
  ...COMMON,
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

export async function sendWelcomeEmail(to: string, firstName: string, _lastName: string) {
  // Subject uses only the ASCII email to avoid encoding issues with non-ASCII names.
  // The name is used only inside the HTML body where charset is declared explicitly.
  const name = firstName || '';
  const greeting = name ? `${name}, ` : '';

  const html = wrapper(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#fff">
      ${greeting}аккаунт активирован!
    </h2>

    <p style="margin:0 0 12px;font-size:15px;color:#cbd5e1;line-height:1.6">
      Рады видеть вас на Moooza — профессиональной сети для музыкантов.
    </p>

    <p style="margin:0 0 20px;font-size:15px;color:#cbd5e1;line-height:1.6">
      Ваш email для входа: <strong style="color:#818cf8">${to}</strong>
    </p>

    <p style="margin:0 0 8px;font-size:14px;color:#94a3b8">Три шага для старта:</p>
    <ul style="margin:0 0 24px;padding-left:20px;color:#94a3b8;font-size:14px;line-height:1.8">
      <li>Заполните профиль и добавьте фото</li>
      <li>Укажите профессию — вас найдут в каталоге</li>
      <li>Найдите коллег и установите связи</li>
    </ul>

    <a href="https://moooza.ru"
      style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600">
      Открыть Moooza
    </a>

    <p style="margin:24px 0 0;font-size:13px;color:#475569">
      Если возникнут вопросы — пишите на
      <a href="mailto:support@moooza.ru" style="color:#6366f1;text-decoration:none">support@moooza.ru</a>
    </p>
  `);

  const textLines = [
    name ? `${name}, aккаунт на Moooza активирован!` : 'Ваш аккаунт на Moooza активирован!',
    '',
    `Ваш email для входа: ${to}`,
    '',
    'Открыть платформу: https://moooza.ru',
    'Поддержка: support@moooza.ru',
  ];

  await registerTransport.sendMail({
    from: '"Moooza" <register@moooza.ru>',
    to,
    // Subject in ASCII only — avoids encoding issues across all mail clients
    subject: 'Ваш аккаунт на Moooza активирован',
    html,
    text: textLines.join('\n'),
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

// Смена email в профиле: код уходит на НОВЫЙ адрес и подтверждает, что он
// принадлежит пользователю. Отдельный текст — письмо «Подтверждение регистрации»
// путало тех, кто давно зарегистрирован.
export async function sendEmailChangeCode(to: string, code: string) {
  await registerTransport.sendMail({
    from: '"Moooza" <register@moooza.ru>',
    to,
    subject: 'Подтверждение нового email',
    html: wrapper(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#fff">Подтвердите новый email</h2>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">Этот адрес указали как новый email аккаунта Moooza. Введите код, чтобы подтвердить смену:</p>
      ${codeBlock(code)}
      <p style="margin:24px 0 0;color:#64748b;font-size:12px">Код действителен 15 минут. Пока код не введён, вход выполняется со старым email. Если вы не меняли email — просто проигнорируйте это письмо.</p>
    `),
    text: [
      'Подтверждение нового email на Moooza',
      '',
      `Код: ${code}`,
      '',
      'Код действителен 15 минут. Если вы не меняли email — проигнорируйте это письмо.',
    ].join('\n'),
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

// ─── Лист ожидания (закрытая регистрация) ────────────────────────────────────
// Оба письма — транзакционные (ответ на заявку человека), не реклама: уходят
// независимо от consentMarketing. Вызывающий код (routes/waitlist.ts,
// lib/waitlist.ts) шлёт их best-effort и сам ловит ошибки.

const appUrl = () => (process.env.APP_URL || 'https://moooza.ru').replace(/\/+$/, '');

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const button = (href: string, label: string) =>
  `<a href="${escHtml(href)}" style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600">${label}</a>`;

// Одна строка «что вас ждёт» под тип заявки (лендинг: resident_waitlist | customer | company | listener).
const WAITLIST_TYPE_HINT: Record<string, string> = {
  resident_waitlist: 'Когда доступ откроется, вы сможете заполнить профиль, собрать визитку артиста и откликаться на заказы и лайнапы.',
  customer: 'Когда доступ откроется, вы сможете описать задачу одной фразой в «Ищу музыканта» — запрос получат подходящие исполнители.',
  company: 'Когда доступ откроется, вы сможете искать исполнителей, публиковать вакансии и собирать лайнапы на свои события.',
  listener: 'Когда доступ откроется, вы сможете следить за любимыми артистами и их релизами.',
};

/** «Заявка принята» — подтверждение записи в лист ожидания. */
export async function sendWaitlistConfirmation(to: string, type: string) {
  const site = appUrl();
  const hint = WAITLIST_TYPE_HINT[type] || '';
  await registerTransport.sendMail({
    from: '"Moooza" <register@moooza.ru>',
    to,
    subject: 'Заявка в Moooza принята',
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#fff">Заявка принята</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#cbd5e1;line-height:1.6">
        Спасибо за интерес к Moooza! Сейчас платформа открывается по приглашениям —
        мы напишем на <strong style="color:#818cf8">${escHtml(to)}</strong>, как только доступ для вас будет готов.
      </p>
      ${hint ? `<p style="margin:0 0 12px;font-size:14px;color:#94a3b8;line-height:1.6">${hint}</p>` : ''}
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.6">
        А пока можно смотреть ленту, артистов и исполнителей — для просмотра аккаунт не нужен.
      </p>
      ${button(site, 'Открыть Moooza')}
      <p style="margin:24px 0 0;font-size:14px;color:#94a3b8;line-height:1.6">
        Свежие заказы и вакансии — в Telegram-канале
        <a href="https://t.me/moooza_jobs" style="color:#818cf8;text-decoration:none">@moooza_jobs</a>.
      </p>
      <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.6">
        Вы получили это письмо, потому что оставили заявку на moooza.ru. Если это были не вы — просто
        проигнорируйте его или напишите на
        <a href="mailto:support@moooza.ru" style="color:#6366f1;text-decoration:none">support@moooza.ru</a>, и мы удалим заявку.
      </p>
    `),
    text: [
      'Заявка в Moooza принята',
      '',
      `Спасибо за интерес к Moooza! Сейчас платформа открывается по приглашениям — мы напишем на ${to}, как только доступ для вас будет готов.`,
      ...(hint ? ['', hint] : []),
      '',
      `А пока можно смотреть ленту, артистов и исполнителей: ${site}`,
      'Свежие заказы и вакансии — в Telegram-канале @moooza_jobs: https://t.me/moooza_jobs',
      '',
      'Если заявку оставляли не вы — проигнорируйте письмо или напишите на support@moooza.ru.',
    ].join('\n'),
  });
}

/**
 * «Ваш доступ в Moooza готов» — приглашение из листа ожидания.
 * `link` — полная ссылка регистрации (lib/waitlist.ts waitlistInviteUrl:
 * …/register?ref=<code>&email=<email>), одноразовая, без срока действия.
 */
export async function sendWaitlistInvite(to: string, link: string) {
  await registerTransport.sendMail({
    from: '"Moooza" <register@moooza.ru>',
    to,
    subject: 'Ваш доступ в Moooza готов',
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#fff">Ваш доступ в Moooza готов</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#cbd5e1;line-height:1.6">
        Вы оставляли заявку в листе ожидания — приглашение готово. Создайте аккаунт по кнопке ниже, это займёт пару минут.
      </p>
      ${button(link, 'Создать аккаунт')}
      <p style="margin:24px 0 8px;font-size:14px;color:#94a3b8">Что вас ждёт:</p>
      <ul style="margin:0 0 8px;padding-left:20px;color:#94a3b8;font-size:14px;line-height:1.8">
        <li><strong style="color:#cbd5e1">«Ищу музыканта»</strong> — опишите задачу одной фразой, и запрос получат подходящие исполнители</li>
        <li><strong style="color:#cbd5e1">Визитка артиста</strong> — одна ссылка на группу или проект: релизы, состав, контакты</li>
        <li><strong style="color:#cbd5e1">Лайнапы</strong> — организаторы собирают артистов на концерты, откликайтесь от имени группы</li>
      </ul>
      <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.6">
        Ссылка персональная и одноразовая: срок действия не ограничен, но после регистрации по ней она перестаёт работать.
        Если кнопка не открывается, скопируйте адрес в браузер:<br />
        <a href="${escHtml(link)}" style="color:#6366f1;text-decoration:none;word-break:break-all">${escHtml(link)}</a>
      </p>
    `),
    text: [
      'Ваш доступ в Moooza готов',
      '',
      'Вы оставляли заявку в листе ожидания — приглашение готово. Создайте аккаунт по ссылке:',
      link,
      '',
      'Что вас ждёт:',
      '— «Ищу музыканта»: опишите задачу одной фразой, и запрос получат подходящие исполнители',
      '— Визитка артиста: одна ссылка на группу или проект — релизы, состав, контакты',
      '— Лайнапы: организаторы собирают артистов на концерты, откликайтесь от имени группы',
      '',
      'Ссылка персональная и одноразовая: срок действия не ограничен, но после регистрации по ней она перестаёт работать.',
    ].join('\n'),
  });
}
