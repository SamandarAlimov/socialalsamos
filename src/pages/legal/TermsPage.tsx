import { LegalLayout, LegalSection } from './LegalLayout';
import { ALSAMOS_MAIL_DOMAIN, MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';

export default function TermsPage() {
  return (
    <LegalLayout
      title="Foydalanish shartlari"
      subtitle="Alsamos superappdan foydalanish qoidalari."
    >
      <LegalSection heading="1. Akkaunt va identifikator">
        <p>
          Tizimga email, username yoki telefon raqam bilan kirish mumkin. Yangi ro’yxatdan
          o’tish @{ALSAMOS_MAIL_DOMAIN} manzili bilan amalga oshiriladi. Siz identifikatoringiz
          va parolining xavfsizligi uchun javobgarsiz. Parolni boshqalarga bermang va shubhali
          harakat sezsangiz darhol parolni o’zgartiring.
        </p>
      </LegalSection>

      <LegalSection heading="2. Akkauntlar soni">
        <p>
          Bitta identifikator ostida eng ko’pi bilan {MAX_ACCOUNTS_PER_IDENTITY} akkaunt
          ochish mumkin. Limitni aylanib o’tish uchun avtomatlashtirilgan usullardan
          foydalanish taqiqlanadi. Qoidabuzarlik aniqlanganda barcha bog’langan akkauntlar
          cheklanishi mumkin.
        </p>
      </LegalSection>

      <LegalSection heading="3. Taqiqlangan harakatlar">
        <ul className="list-disc pl-5">
          <li>Boshqa shaxs nomidan ro’yxatdan o’tish yoki uni aldab ma’lumot olish.</li>
          <li>Spam, firibgarlik, zararli dastur tarqatish.</li>
          <li>Tizimga ruxsatsiz kirish, zaifliklardan foydalanish, yuklamali hujumlar.</li>
          <li>Qonunga xilof kontent joylash yoki tarqatish.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Kontent huquqlari">
        <p>
          Siz joylagan kontent sizga tegishli bo’lib qoladi. Xizmatni ko’rsatish uchun
          bizga uni saqlash va ko’rsatish bo’yicha cheklangan litsenziya berasiz.
        </p>
      </LegalSection>

      <LegalSection heading="5. Xizmatni to’xtatish">
        <p>
          Qoidalar buzilganda akkaunt vaqtincha yoki butunlay to’xtatilishi mumkin.
          Asosiy akkauntni o’chirish identifikator bilan bog’liq barcha akkauntlarga
          ta’sir qiladi.
        </p>
      </LegalSection>

      <LegalSection heading="6. Shartlarga o’zgartirish">
        <p>
          Shartlar yangilanganda versiya raqami o’zgaradi va tizimga kirganingizda yangi
          versiyani qabul qilishingiz so’raladi.
        </p>
      </LegalSection>

      <LegalSection heading="7. Aloqa">
        <p>Savollar uchun: legal@{ALSAMOS_MAIL_DOMAIN}</p>
      </LegalSection>
    </LegalLayout>
  );
}
