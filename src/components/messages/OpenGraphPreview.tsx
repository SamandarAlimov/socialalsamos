import { TelegramLinkPreview } from './TelegramLinkPreview';

interface OpenGraphPreviewProps {
  url: string;
  isMine?: boolean;
  className?: string;
}

/**
 * Havola kartasi uchun moslik qatlami.
 *
 * Ilgari bu komponent o'zining soxta (fallback) OG ma'lumoti va qat'iy
 * `aspect-video` ramkasi bilan ishlagan: shu sababli vertikal (9:16) video va
 * rasmlar kesilib qolar edi. Endi barcha havola ko'rinishi YAGONA joyda -
 * `TelegramLinkPreview` da chiziladi:
 *
 *  - haqiqiy OG ma'lumot `link-preview` edge funksiyasidan olinadi,
 *  - ramka mediasining haqiqiy nisbatiga moslashadi (9:16, 3:4, 4:5, 1:1, 16:9 ...),
 *  - ichida scroll ham, kesilgan joy ham qolmaydi.
 */
export function OpenGraphPreview({ url, isMine, className }: OpenGraphPreviewProps) {
  return <TelegramLinkPreview url={url} isMine={isMine} className={className} />;
}

export default OpenGraphPreview;
