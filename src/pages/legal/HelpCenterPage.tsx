import { Link } from 'react-router-dom';

import { LegalLayout, LegalSection } from './LegalLayout';
import { ALSAMOS_MAIL_DOMAIN, MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';

export default function HelpCenterPage() {
  return (
    <LegalLayout
      title="Yordam markazi"
      subtitle="Kirish, akkauntlar va xavfsizlik bo’yicha eng ko’p beriladigan savollar."
    >
      <LegalSection heading="Tizimga nima bilan kiraman?">
        <p>
          Kirish maydoniga uch narsadan birini kiritishingiz mumkin: email manzil, username
          yoki telefon raqam. Eski (masalan gmail.com) manzilingiz ham saqlanib qoldi va u
          bilan ham kirishda davom etishingiz mumkin. Yangi ro’yxatdan o’tish esa
          @{ALSAMOS_MAIL_DOMAIN} manzili bilan amalga oshiriladi.
        </p>
      </LegalSection>

      <LegalSection heading="Telefon raqam nima uchun kerak?">
        <p>
          Telefon raqam ikkinchi kirish usuli va akkauntni tiklash vositasi sifatida ishlatiladi.
          Raqam xalqaro shaklda saqlanadi (masalan +998901234567), shuning uchun uni qanday
          formatda yozsangiz ham tizim bir xil taniydi.
        </p>
      </LegalSection>

      <LegalSection heading="Parolni qanday tiklayman?">
        <p>
          <Link className="underline" to="/forgot-password">Parolni tiklash</Link> sahifasiga
          o’tib email manzilingizni kiriting. Havola 1 soat amal qiladi va bir marta
          ishlatiladi. Parol yangilangach barcha qurilmalardagi sessiyalar yopiladi.
        </p>
      </LegalSection>

      <LegalSection heading="Bitta email bilan qancha akkaunt ochsam bo’ladi?">
        <p>
          {MAX_ACCOUNTS_PER_IDENTITY} tagacha. Har bir akkaunt o’z profili, username va
          kontentiga ega. Akkauntlar orasida "Switch Accounts" oynasi orqali parol kiritmasdan
          almashishingiz mumkin - agar shu qurilmada sessiya saqlangan bo’lsa.
        </p>
      </LegalSection>

      <LegalSection heading="Yangi akkaunt qanday ochiladi?">
        <p>
          "Switch Accounts" oynasidagi "Yangi akkaunt" tugmasini bosing, username tanlang.
          Yangi akkaunt uchun alohida email yoki parol talab qilinmaydi: u sizning
          identifikatoringizga bog’lanadi.
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
          amal sessiyani serverda ham bekor qiladi, ya’ni o’g’irlangan token bilan
          qaytib kirishning imkoni bo’lmaydi.
        </p>
      </LegalSection>

      <LegalSection heading="Yordam kerak">
        <p>support@{ALSAMOS_MAIL_DOMAIN} manziliga yozing yoki hisobingizdan shikoyat yuboring.</p>
      </LegalSection>
    </LegalLayout>
  );
}
