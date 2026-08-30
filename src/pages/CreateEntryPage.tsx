import ComposePage from '@/pages/ComposePage';

/**
 * Canonical Create entry.
 *
 * Legacy CreatePage endi route fallback emas. Foundation migratsiyalari main
 * bilan birga deploy qilinadi; frontend har doim modular production composer
 * ochadi. Shu bilan foydalanuvchi eski monolit UI'ga qaytib qolmaydi.
 */
export default function CreateEntryPage() {
  return <ComposePage />;
}
