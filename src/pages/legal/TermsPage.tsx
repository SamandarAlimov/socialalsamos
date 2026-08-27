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
          Tizimga kirish faqat @{ALSAMOS_MAIL_DOMAIN} manzili bilan amalga oshiriladi. Siz
          identifikatoringiz va paroli xavfsizligi uchun javobgarsiz. Parolni boshqalarga
          bermang va shubhali harakat sezsangiz darhol parolni o\u2018zgartiring.
        </p>
      </LegalSection>

      <LegalSection heading="2. Akkauntlar soni">
        <p>
          Bitta identifikator ostida eng ko\u2018pi bilan {MAX_ACCOUNTS_PER_IDENTITY} akkaunt
          ochish mumkin. Limitni aylanib o\u2018tish uchun avtomatlashtirilgan usullardan
          foydalanish taqiqlanadi. Qoidabuzarlik aniqlanganda barcha bog\u2018langan akkauntlar
          cheklanishi mumkin.
        </p>
      </LegalSection>

      <LegalSection heading="3. Taqiqlangan harakatlar">
        <ul className="list-disc pl-5">
          <li>Boshqa shaxs nomidan ro\u2018yxatdan o\u2018tish yoki uni aldab ma\u2018lumot olish.</li>
          <li>Spam, firibgarlik, zararli dastur tarqatish.</li>
          <li>Tizimga ruxsatsiz kirish, zaifliklardan foydalanish, yuklamali hujumlar.</li>
          <li>Qonunga xilof kontent joylash yoki tarqatish.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Kontent huquqlari">
        <p>
          Siz joylagan kontent sizga tegishli bo\u2018lib qoladi. Xizmatni ko\u2018rsatish uchun
          bizga uni saqlash va ko\u2018rsatish bo\u2018yicha cheklangan litsenziya berasiz.
        </p>
      </LegalSection>

      <LegalSection heading="5. Xizmatni to\u2018xtatish">
        <p>
          Qoidalar buzilganda akkaunt vaqtincha yoki butunlay to\u2018xtatilishi mumkin.
          Asosiy akkauntni o\u2018chirish identifikator bilan bog\u2018liq barcha akkauntlarga
          ta\u2018sir qiladi.
        </p>
      </LegalSection>

      <LegalSection heading="6. Shartlarga o\u2018zgartirish">
        <p>
          Shartlar yangilanganda versiya raqami o\u2018zgaradi va tizimga kirganingizda yangi
          versiyani qabul qilishingiz so\u2018raladi.
        </p>
      </LegalSection>

      <LegalSection heading="7. Aloqa">
        <p>Savollar uchun: legal@{ALSAMOS_MAIL_DOMAIN}</p>
      </LegalSection>
    </LegalLayout>
  );
}
