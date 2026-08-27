import { LegalLayout, LegalSection } from './LegalLayout';
import { ALSAMOS_MAIL_DOMAIN, MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Maxfiylik siyosati"
      subtitle="Alsamos superapp qanday ma’lumot yig’adi, nima uchun ishlatadi va siz nimalarni boshqarishingiz mumkin."
    >
      <LegalSection heading="1. Biz yig’adigan ma’lumotlar">
        <ul className="list-disc pl-5">
          <li>
            <strong>Identifikator ma’lumotlari:</strong> email manzil, telefon raqam,
            parolning kriptografik xeshi (parolning o’zi hech qachon saqlanmaydi), akkauntlar
            ro’yxati.
          </li>
          <li>
            <strong>Profil ma’lumotlari:</strong> username, ko’rinadigan ism, avatar, bio va siz
            o’zingiz kiritgan boshqa maydonlar.
          </li>
          <li>
            <strong>Xavfsizlik jurnali:</strong> kirish urinishlari, IP manzil, qurilma/brauzer
            ma’lumoti, akkaunt yaratish va sessiyani bekor qilish hodisalari.
          </li>
          <li>
            <strong>Kontent:</strong> siz joylagan postlar, xabarlar, fayllar va reaksiyalar.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. Nima uchun ishlatiladi">
        <p>
          Xizmatni ko’rsatish, akkauntni himoya qilish (brute-force va o’g’irlangan
          sessiyalarni aniqlash), qonuniy talablarni bajarish va xizmat sifatini yaxshilash uchun.
          Ma’lumotlaringiz reklama maqsadida uchinchi tomonlarga sotilmaydi.
        </p>
      </LegalSection>

      <LegalSection heading="3. Kirish identifikatorlari">
        <p>
          Tizimga email, username yoki telefon raqam bilan kirishingiz mumkin. Bu uch
          identifikator bitta egalik (identity) ostida saqlanadi va faqat server tomonida
          solishtiriladi: tashqi so’rov orqali kimning qanday manzili borligini aniqlash
          mumkin emas.
        </p>
      </LegalSection>

      <LegalSection heading="4. Bir egalik - bir necha akkaunt">
        <p>
          Bitta @{ALSAMOS_MAIL_DOMAIN} identifikatori ostida {MAX_ACCOUNTS_PER_IDENTITY} tagacha
          akkaunt ochish mumkin. Bu akkauntlar sizning egaligingizda bo’lgani uchun texnik
          jihatdan bog’lanadi: parolni almashtirish, sessiyani bekor qilish va xavfsizlik
          hodisalari identifikator darajasida ko’riladi. Boshqa foydalanuvchilar
          akkauntlaringiz bog’liqligini ko’rmaydi.
        </p>
      </LegalSection>

      <LegalSection heading="5. Cookie va sessiyalar">
        <p>
          Sessiyalar *.{ALSAMOS_MAIL_DOMAIN} domenlari uchun cookie orqali saqlanadi. Har bir
          akkaunt o’z alohida kalitida saqlanadi va faqat siz tanlagan akkaunt faol bo’ladi.
          Tokenlar boshqa joyga nusxalanmaydi.
        </p>
      </LegalSection>

      <LegalSection heading="6. Eski email manzillari">
        <p>
          Avval boshqa domenlardan (masalan gmail.com) ro’yxatdan o’tgan foydalanuvchilarning
          manzillari saqlanadi: ular bilan kirish va akkauntni tiklash mumkin. Yangi
          ro’yxatdan o’tish esa @{ALSAMOS_MAIL_DOMAIN} manzili bilan amalga oshiriladi.
        </p>
      </LegalSection>

      <LegalSection heading="7. Saqlash muddati">
        <p>
          Xavfsizlik jurnali 12 oy, kirish urinishlari 30 kun saqlanadi. Akkaunt o’chirilganda
          kontent 30 kunlik tiklash muddatidan keyin butunlay o’chiriladi.
        </p>
      </LegalSection>

      <LegalSection heading="8. Sizning huquqlaringiz">
        <p>
          Ma’lumotlaringiz nusxasini olish, tuzatish, o’chirish va faol sessiyalarni bekor
          qilish huquqiga egasiz. Murojaat uchun: privacy@{ALSAMOS_MAIL_DOMAIN}.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
