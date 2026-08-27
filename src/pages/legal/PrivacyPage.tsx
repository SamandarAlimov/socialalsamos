import { LegalLayout, LegalSection } from './LegalLayout';
import { ALSAMOS_MAIL_DOMAIN, MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Maxfiylik siyosati"
      subtitle="Alsamos superapp qanday ma\u2018lumot yig\u2018adi, nima uchun ishlatadi va siz nimalarni boshqarishingiz mumkin."
    >
      <LegalSection heading="1. Biz yig\u2018adigan ma\u2018lumotlar">
        <ul className="list-disc pl-5">
          <li>
            <strong>Identifikator ma\u2018lumotlari:</strong> @{ALSAMOS_MAIL_DOMAIN} email manzili,
            parolning kriptografik xeshi (parolning o\u2018zi hech qachon saqlanmaydi), akkauntlar ro\u2018yxati.
          </li>
          <li>
            <strong>Profil ma\u2018lumotlari:</strong> username, ko\u2018rinadigan ism, avatar, bio va siz
            o\u2018zingiz kiritgan boshqa maydonlar.
          </li>
          <li>
            <strong>Xavfsizlik jurnali:</strong> kirish urinishlari, IP manzil, qurilma/brauzer
            ma\u2018lumoti, akkaunt yaratish va sessiyani bekor qilish hodisalari.
          </li>
          <li>
            <strong>Kontent:</strong> siz joylagan postlar, xabarlar, fayllar va reaksiyalar.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. Nima uchun ishlatiladi">
        <p>
          Xizmatni ko\u2018rsatish, akkauntni himoya qilish (brute-force va o\u2018g\u2018irlangan
          sessiyalarni aniqlash), qonuniy talablarni bajarish va xizmat sifatini yaxshilash uchun.
          Ma\u2018lumotlaringiz reklama maqsadida uchinchi tomonlarga sotilmaydi.
        </p>
      </LegalSection>

      <LegalSection heading="3. Bir email - bir necha akkaunt">
        <p>
          Bitta @{ALSAMOS_MAIL_DOMAIN} identifikatori ostida {MAX_ACCOUNTS_PER_IDENTITY} tagacha
          akkaunt ochish mumkin. Bu akkauntlar sizning egaligingizda bo\u2018lgani texnik jihatdan
          bog\u2018lanadi: parolni almashtirish, sessiyani bekor qilish va xavfsizlik hodisalari
          identifikator darajasida ko\u2018riladi. Boshqa foydalanuvchilar akkauntlaringiz
          bog\u2018liqligini ko\u2018rmaydi.
        </p>
      </LegalSection>

      <LegalSection heading="4. Cookie va sessiyalar">
        <p>
          Sessiyalar *.{ALSAMOS_MAIL_DOMAIN} domenlari uchun cookie orqali saqlanadi. Har bir
          akkaunt o\u2018z alohida kalitida saqlanadi va faqat siz tanlagan akkaunt faol bo\u2018ladi.
          Tokenlar boshqa joyga nusxalanmaydi.
        </p>
      </LegalSection>

      <LegalSection heading="5. Eski email manzillari">
        <p>
          Avval boshqa domenlardan (masalan gmail.com) ro\u2018yxatdan o\u2018tgan foydalanuvchilarning
          manzillari faqat tiklash va egalikni tasdiqlash uchun saqlanadi. Ular bilan tizimga
          kirish mumkin emas.
        </p>
      </LegalSection>

      <LegalSection heading="6. Saqlash muddati">
        <p>
          Xavfsizlik jurnali 12 oy, kirish urinishlari 30 kun saqlanadi. Akkaunt o\u2018chirilganda
          kontent 30 kunlik tiklash muddatidan keyin butunlay o\u2018chiriladi.
        </p>
      </LegalSection>

      <LegalSection heading="7. Sizning huquqlaringiz">
        <p>
          Ma\u2018lumotlaringiz nusxasini olish, tuzatish, o\u2018chirish va faol sessiyalarni bekor
          qilish huquqiga egasiz. Murojaat uchun: privacy@{ALSAMOS_MAIL_DOMAIN}.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
