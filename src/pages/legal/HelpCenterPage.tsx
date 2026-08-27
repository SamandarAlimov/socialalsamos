import { Link } from 'react-router-dom';

import { LegalLayout, LegalSection } from './LegalLayout';
import { ALSAMOS_MAIL_DOMAIN, MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';

export default function HelpCenterPage() {
  return (
    <LegalLayout
      title="Yordam markazi"
      subtitle="Kirish, akkauntlar va xavfsizlik bo\u2018yicha eng ko\u2018p beriladigan savollar."
    >
      <LegalSection heading="Nima uchun eski emailim bilan kira olmayapman?">
        <p>
          Alsamos endi faqat @{ALSAMOS_MAIL_DOMAIN} identifikatori bilan ishlaydi. Eski manzilingiz
          (masalan gmail.com) o\u2018chirilmadi - u tiklash manzili sifatida saqlanib qoldi va
          egalikni tasdiqlash uchun ishlatiladi.
        </p>
      </LegalSection>

      <LegalSection heading="Parolni qanday tiklayman?">
        <p>
          <Link className="underline" to="/forgot-password">Parolni tiklash</Link> sahifasiga
          o\u2018tib @{ALSAMOS_MAIL_DOMAIN} manzilingizni kiriting. Havola 1 soat amal qiladi va
          bir marta ishlatiladi. Parol yangilangach barcha qurilmalardagi sessiyalar yopiladi.
        </p>
      </LegalSection>

      <LegalSection heading={`Bitta email bilan qancha akkaunt ochsam bo\u2018ladi?`}>
        <p>
          {MAX_ACCOUNTS_PER_IDENTITY} tagacha. Har bir akkaunt o\u2018z profili, username va
          kontentiga ega. Akkauntlar orasida "Switch Accounts" oynasi orqali parol kiritmasdan
          almashishingiz mumkin - agar shu qurilmada sessiya saqlangan bo\u2018lsa.
        </p>
      </LegalSection>

      <LegalSection heading="Yangi akkaunt qanday ochiladi?">
        <p>
          "Switch Accounts" oynasidagi "Yangi akkaunt" tugmasini bosing, username tanlang.
          Yangi akkaunt uchun alohida email yoki parol talab qilinmaydi: u sizning
          identifikatoringizga bog\u2018lanadi.
        </p>
      </LegalSection>

      <LegalSection heading="Kirish bloklandi deb yozildi">
        <p>
          Xavfsizlik uchun 15 daqiqada bir necha xato urinishdan keyin kirish vaqtincha
          cheklanadi. 15 daqiqa kutib, parolni tiklash orqali davom eting.
        </p>
      </LegalSection>

      <LegalSection heading="Akkauntni qurilmadan qanday olib tashlayman?">
        <p>
          "Switch Accounts" oynasida akkaunt yonidagi olib tashlash tugmasini bosing. Bu
          amal sessiyani serverda ham bekor qiladi, ya\u2018ni o\u2018g\u2018irlangan token bilan
          qaytib kirishning imkoni bo\u2018lmaydi.
        </p>
      </LegalSection>

      <LegalSection heading="Yordam kerak">
        <p>support@{ALSAMOS_MAIL_DOMAIN} manziliga yozing yoki hisobingizdan shikoyat yuboring.</p>
      </LegalSection>
    </LegalLayout>
  );
}
