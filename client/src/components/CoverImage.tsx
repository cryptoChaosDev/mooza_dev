// Обложка профиля/артиста. Блок задаёт пропорцию 3:1 (как при обрезке в
// ImageCropModal). Картинка показывается целиком (object-contain), а поля, если
// пропорция у файла другая (импорт, старые загрузки, GIF), заполняются размытой
// копией той же картинки — ничего не срезается. Обложка ровно 3:1 заполняет блок.
export default function CoverImage({ src, alt = '' }: { src: string; alt?: string }) {
  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
      />
      <img src={src} alt={alt} className="relative w-full h-full object-contain" />
    </>
  );
}
