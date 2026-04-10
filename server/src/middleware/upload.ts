import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  },
});

// File filter - only images
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WebP are allowed.'), false);
  }
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

// ── Banner upload ─────────────────────────────────────────────────────────────

const coversDir = path.join(process.cwd(), 'uploads', 'covers');
if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, coversDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `cover-${uniqueSuffix}${ext}`);
  },
});

export const uploadBanner = multer({
  storage: bannerStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max for banners
  },
});

// ── Portfolio upload ──────────────────────────────────────────────────────────

const portfolioDir = path.join(process.cwd(), 'uploads', 'portfolio');
if (!fs.existsSync(portfolioDir)) {
  fs.mkdirSync(portfolioDir, { recursive: true });
}

const portfolioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, portfolioDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `portfolio-${uniqueSuffix}${ext}`);
  },
});

const portfolioFileFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac',
    'audio/x-wav', 'audio/wave',
  ];
  const allowedExts = [
    '.jpg', '.jpeg', '.png', '.webp',
    '.pdf', '.doc', '.docx', '.txt',
    '.mp3', '.wav', '.ogg', '.flac',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
    return cb(new Error('Недопустимый тип файла для портфолио'), false);
  }
  cb(null, true);
};

export const uploadPortfolio = multer({
  storage: portfolioStorage,
  fileFilter: portfolioFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

// ── Channel avatar upload ─────────────────────────────────────────────────────

const channelAvatarDir = path.join(process.cwd(), 'uploads', 'channels');
if (!fs.existsSync(channelAvatarDir)) {
  fs.mkdirSync(channelAvatarDir, { recursive: true });
}

const channelAvatarStorage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, channelAvatarDir); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `channel-${uniqueSuffix}${ext}`);
  },
});

export const uploadChannelAvatar = multer({
  storage: channelAvatarStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── Post media upload (images, gifs, audio) ───────────────────────────────────

const postMediaDir = path.join(process.cwd(), 'uploads', 'posts');
if (!fs.existsSync(postMediaDir)) {
  fs.mkdirSync(postMediaDir, { recursive: true });
}

const postMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, postMediaDir); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `post-${uniqueSuffix}${ext}`);
  },
});

const postMediaFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/ogg', 'audio/flac',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

export const uploadPostMedia = multer({
  storage: postMediaStorage,
  fileFilter: postMediaFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ── Chat attachment upload ─────────────────────────────────────────────────────

const chatDir = path.join(process.cwd(), 'uploads', 'chat');
if (!fs.existsSync(chatDir)) {
  fs.mkdirSync(chatDir, { recursive: true });
}

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, chatDir); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `chat-${uniqueSuffix}${ext}`);
  },
});

const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.msi', '.msp', '.msc',
  '.sh', '.bash', '.zsh', '.fish',
  '.app', '.dmg', '.pkg',
  '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.ps1', '.ps2',
  '.jar', '.pif', '.scr', '.reg', '.dll', '.sys', '.drv',
  '.lnk', '.cpl', '.inf',
];

const chatFileFilter = (req: any, file: any, cb: any) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    cb(new Error('Executable files are not allowed'), false);
  } else {
    cb(null, true);
  }
};

export const uploadChatAttachment = multer({
  storage: chatStorage,
  fileFilter: chatFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
