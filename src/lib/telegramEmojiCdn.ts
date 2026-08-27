/**
 * Telegramning HAQIQIY animatsion emojilari.
 *
 * Manba: Telegram'ning o'z animatsion emoji to'plami (Telegram Desktop/Web
 * ichidagi Telemoji) ochiq ko'rinishda `Tarikul-Islam-Anik/Telegram-Animated-Emojis`
 * repozitoriysida animatsion `.webp` sifatida saqlanadi va jsDelivr CDN orqali
 * bepul beriladi. Shu sababli hech qanday faylni qo'lda yuklab olish kerak emas —
 * emojilar to'g'ridan-to'g'ri Telegramning o'zidagi ko'rinishda ishlaydi.
 *
 * Agar loyihada `public/emoji/tgs/<codepoint>.tgs` fayllari bo'lsa, ular
 * ustunlikka ega (Lottie vektor animatsiyasi) — `TelegramEmoji` avval ularni
 * tekshiradi, keyin bu CDN'ga qaytadi.
 */

// URL bo'laklab yig'iladi (build/format vositalari buzmasligi uchun)
const CDN_BASE =
  'https://' +
  'cdn.jsdelivr.net/gh/Tarikul-Islam-Anik/Telegram-Animated-Emojis@main';

/** Emoji belgisi -> "<Papka>/<Fayl nomi>" (kengaytmasiz) */
const TELEGRAM_EMOJI_PATHS: Record<string, string> = {
  // ----------------------------- Smileys -----------------------------
  '\u{1F600}': 'Smileys/Grinning Face',
  '\u{1F603}': 'Smileys/Grinning Face With Big Eyes',
  '\u{1F604}': 'Smileys/Grinning Face With Smiling Eyes',
  '\u{1F601}': 'Smileys/Beaming Face With Smiling Eyes',
  '\u{1F606}': 'Smileys/Grinning Squinting Face',
  '\u{1F605}': 'Smileys/Grinning Face With Sweat',
  '\u{1F923}': 'Smileys/Rolling On The Floor Laughing',
  '\u{1F602}': 'Smileys/Face With Tears Of Joy',
  '\u{1F642}': 'Smileys/Slightly Smiling Face',
  '\u{1F643}': 'Smileys/Upside Down Face',
  '\u{1F609}': 'Smileys/Winking Face',
  '\u{1F60A}': 'Smileys/Smiling Face With Smiling Eyes',
  '\u{1F607}': 'Smileys/Smiling Face With Halo',
  '\u{1F970}': 'Smileys/Smiling Face With Hearts',
  '\u{1F618}': 'Smileys/Face Blowing A Kiss',
  '\u{1F617}': 'Smileys/Kissing Face',
  '\u{1F61A}': 'Smileys/Kissing Face With Closed Eyes',
  '\u{1F60B}': 'Smileys/Face Savoring Food',
  '\u{1F61B}': 'Smileys/Face With Tongue',
  '\u{1F61C}': 'Smileys/Winking Face With Tongue',
  '\u{1F92A}': 'Smileys/Zany Face',
  '\u{1F61D}': 'Smileys/Squinting Face With Tongue',
  '\u{1F911}': 'Smileys/Money Mouth Face',
  '\u{1F917}': 'Smileys/Hugging Face',
  '\u{1F92D}': 'Smileys/Face With Hand Over Mouth',
  '\u{1FAE2}': 'Smileys/Face With Open Eyes And Hand Over Mouth',
  '\u{1FAE3}': 'Smileys/Face With Peeking Eye',
  '\u{1F92B}': 'Smileys/Shushing Face',
  '\u{1F914}': 'Smileys/Thinking Face',
  '\u{1FAE1}': 'Smileys/Saluting Face',
  '\u{1F910}': 'Smileys/Zipper Mouth Face',
  '\u{1F928}': 'Smileys/Face With Raised Eyebrow',
  '\u{1F610}': 'Smileys/Neutral Face',
  '\u{1F611}': 'Smileys/Expressionless Face',
  '\u{1F636}': 'Smileys/Face Without Mouth',
  '\u{1FAE5}': 'Smileys/Dotted Line Face',
  '\u{1F60F}': 'Smileys/Smirking Face',
  '\u{1F612}': 'Smileys/Unamused Face',
  '\u{1F644}': 'Smileys/Face With Rolling Eyes',
  '\u{1F62C}': 'Smileys/Grimacing Face',
  '\u{1F925}': 'Smileys/Lying Face',
  '\u{1FAE0}': 'Smileys/Melting Face',
  '\u{1F60C}': 'Smileys/Relieved Face',
  '\u{1F614}': 'Smileys/Pensive Face',
  '\u{1F62A}': 'Smileys/Sleepy Face',
  '\u{1F924}': 'Smileys/Drooling Face',
  '\u{1F634}': 'Smileys/Sleeping Face',
  '\u{1F637}': 'Smileys/Face With Medical Mask',
  '\u{1F912}': 'Smileys/Face With Thermometer',
  '\u{1F915}': 'Smileys/Face With Head Bandage',
  '\u{1F922}': 'Smileys/Nauseated Face',
  '\u{1F92E}': 'Smileys/Face Vomiting',
  '\u{1F927}': 'Smileys/Sneezing Face',
  '\u{1F975}': 'Smileys/Hot Face',
  '\u{1F976}': 'Smileys/Cold Face',
  '\u{1F974}': 'Smileys/Woozy Face',
  '\u{1F635}': 'Smileys/Dizzy Face',
  '\u{1F92F}': 'Smileys/Exploding Head',
  '\u{1F920}': 'Smileys/Cowboy Hat Face',
  '\u{1F973}': 'Smileys/Partying Face',
  '\u{1F978}': 'Smileys/Disguised Face',
  '\u{1F60E}': 'Smileys/Smiling Face With Sunglasses',
  '\u{1F913}': 'Smileys/Nerd Face',
  '\u{1F9D0}': 'Smileys/Face With Monocle',
  '\u{1F615}': 'Smileys/Confused Face',
  '\u{1FAE4}': 'Smileys/Face With Diagonal Mouth',
  '\u{1F61F}': 'Smileys/Worried Face',
  '\u{1F641}': 'Smileys/Slightly Frowning Face',
  '\u{2639}': 'Smileys/Frowning Face',
  '\u{1F62E}': 'Smileys/Face With Open Mouth',
  '\u{1F62F}': 'Smileys/Hushed Face',
  '\u{1F632}': 'Smileys/Astonished Face',
  '\u{1F633}': 'Smileys/Flushed Face',
  '\u{1F97A}': 'Smileys/Pleading Face',
  '\u{1F979}': 'Smileys/Face Holding Back Tears',
  '\u{1F626}': 'Smileys/Frowning Face With Open Mouth',
  '\u{1F627}': 'Smileys/Anguished Face',
  '\u{1F628}': 'Smileys/Fearful Face',
  '\u{1F630}': 'Smileys/Anxious Face With Sweat',
  '\u{1F625}': 'Smileys/Sad But Relieved Face',
  '\u{1F622}': 'Smileys/Crying Face',
  '\u{1F62D}': 'Smileys/Loudly Crying Face',
  '\u{1F631}': 'Smileys/Face Screaming In Fear',
  '\u{1F616}': 'Smileys/Confounded Face',
  '\u{1F623}': 'Smileys/Persevering Face',
  '\u{1F61E}': 'Smileys/Disappointed Face',
  '\u{1F613}': 'Smileys/Downcast Face With Sweat',
  '\u{1F629}': 'Smileys/Weary Face',
  '\u{1F62B}': 'Smileys/Tired Face',
  '\u{1F971}': 'Smileys/Yawning Face',
  '\u{1F624}': 'Smileys/Face With Steam From Nose',
  '\u{1F621}': 'Smileys/Pouting Face',
  '\u{1F620}': 'Smileys/Angry Face',
  '\u{1F92C}': 'Smileys/Face With Symbols On Mouth',
  '\u{1F608}': 'Smileys/Smiling Face With Horns',
  '\u{1F47F}': 'Smileys/Angry Face With Horns',
  '\u{1F480}': 'Smileys/Skull',
  '\u{2620}': 'Smileys/Skull And Crossbones',
  '\u{1F4A9}': 'Smileys/Pile Of Poo',
  '\u{1F921}': 'Smileys/Clown Face',
  '\u{1F479}': 'Smileys/Ogre',
  '\u{1F47A}': 'Smileys/Goblin',
  '\u{1F47B}': 'Smileys/Ghost',
  '\u{1F47D}': 'Smileys/Alien',
  '\u{1F47E}': 'Smileys/Alien Monster',
  '\u{1F916}': 'Smileys/Robot',
  '\u{1F648}': 'Smileys/See No Evil Monkey',
  '\u{1F649}': 'Smileys/Hear No Evil Monkey',
  '\u{1F64A}': 'Smileys/Speak No Evil Monkey',
  '\u{1F63A}': 'Smileys/Grinning Cat',
  '\u{1F638}': 'Smileys/Grinning Cat With Smiling Eyes',
  '\u{1F639}': 'Smileys/Cat With Tears Of Joy',
  '\u{1F63B}': 'Smileys/Smiling Cat With Heart Eyes',
  '\u{1F63C}': 'Smileys/Cat With Wry Smile',
  '\u{1F63D}': 'Smileys/Kissing Cat',
  '\u{1F63F}': 'Smileys/Crying Cat',
  '\u{1F640}': 'Smileys/Weary Cat',
  '\u{1F63E}': 'Smileys/Pouting Cat',

  // ------------------------------ People ------------------------------
  '\u{1F44D}': 'People/Thumbs Up',
  '\u{1F44E}': 'People/Thumbs Down',
  '\u{1F44F}': 'People/Clapping Hands',
  '\u{1F64F}': 'People/Folded Hands',
  '\u{1F44B}': 'People/Waving Hand',
  '\u{270C}': 'People/Victory Hand',
  '\u{1F91D}': 'People/Handshake',
  '\u{1F4AA}': 'People/Flexed Biceps',
  '\u{1F91E}': 'People/Crossed Fingers',
  '\u{1F44C}': 'People/Ok Hand',
  '\u{1F90C}': 'People/Pinched Fingers',
  '\u{1F90F}': 'People/Pinching Hand',
  '\u{270B}': 'People/Raised Hand',
  '\u{1F590}': 'People/Hand With Fingers Splayed',
  '\u{1F596}': 'People/Vulcan Salute',
  '\u{1F91F}': 'People/Love You Gesture',
  '\u{1F918}': 'People/Sign Of The Horns',
  '\u{1F919}': 'People/Call Me Hand',
  '\u{1F448}': 'People/Backhand Index Pointing Left',
  '\u{1F449}': 'People/Backhand Index Pointing Right',
  '\u{1F446}': 'People/Backhand Index Pointing Up',
  '\u{1F447}': 'People/Backhand Index Pointing Down',
  '\u{261D}': 'People/Index Pointing Up',
  '\u{1FAF5}': 'People/Index Pointing At The Viewer',
  '\u{270A}': 'People/Raised Fist',
  '\u{1F44A}': 'People/Oncoming Fist',
  '\u{1F91B}': 'People/Left Facing Fist',
  '\u{1F91C}': 'People/Right Facing Fist',
  '\u{1F595}': 'People/Middle Finger',
  '\u{270D}': 'People/Writing Hand',
  '\u{1F64C}': 'People/Raising Hands',
  '\u{1F450}': 'People/Open Hands',
  '\u{1F932}': 'People/Palms Up Together',
  '\u{1FAF6}': 'People/Heart Hands',
  '\u{1FAF1}': 'People/Rightwards Hand',
  '\u{1FAF2}': 'People/Leftwards Hand',
  '\u{1FAF3}': 'People/Palm Down Hand',
  '\u{1FAF4}': 'People/Palm Up Hand',
  '\u{1F91A}': 'People/Raised Back Of Hand',
  '\u{1F440}': 'People/Eyes',
  '\u{1F57A}': 'People/Man Dancing',
  '\u{1F483}': 'People/Woman Dancing',
  '\u{1F937}': 'People/Person Shrugging',
  '\u{1F926}': 'People/Person Facepalming',
  '\u{1FAC2}': 'People/People Hugging',
  '\u{1F464}': 'People/Bust In Silhouette',
  '\u{1F465}': 'People/Busts In Silhouette',
  '\u{1F5E3}': 'People/Speaking Head',
  '\u{1F476}': 'People/Baby',
  '\u{1F385}': 'People/Santa Claus',
  '\u{1F936}': 'People/Mrs Claus',
  '\u{1F9DF}': 'People/Zombie',
  '\u{1F9DB}': 'People/Vampire',
  '\u{1F9B7}': 'People/Tooth',
  '\u{1F445}': 'People/Tongue',
  '\u{1F444}': 'People/Mouth',
  '\u{1F443}': 'People/Nose',
  '\u{1F442}': 'People/Ear',
  '\u{1F9B5}': 'People/Leg',
  '\u{1F9B6}': 'People/Foot',
  '\u{1F463}': 'People/Footprints',
  '\u{1F9B4}': 'People/Bone',
  '\u{1F485}': 'People/Nail Polish',
  '\u{1FAE6}': 'People/Biting Lip',

  // ------------------------------ Symbols -----------------------------
  '\u{2764}': 'Symbols/Red Heart',
  '\u{1F9E1}': 'Symbols/Orange Heart',
  '\u{1F49B}': 'Symbols/Yellow Heart',
  '\u{1F49A}': 'Symbols/Green Heart',
  '\u{1F499}': 'Symbols/Blue Heart',
  '\u{1F49C}': 'Symbols/Purple Heart',
  '\u{1F5A4}': 'Symbols/Black Heart',
  '\u{1F90D}': 'Symbols/White Heart',
  '\u{1F90E}': 'Symbols/Brown Heart',
  '\u{1F494}': 'Symbols/Broken Heart',
  '\u{2763}': 'Symbols/Heart Exclamation',
  '\u{1F495}': 'Symbols/Two Hearts',
  '\u{1F49E}': 'Symbols/Revolving Hearts',
  '\u{1F493}': 'Symbols/Beating Heart',
  '\u{1F497}': 'Symbols/Growing Heart',
  '\u{1F496}': 'Symbols/Sparkling Heart',
  '\u{1F498}': 'Symbols/Heart With Arrow',
  '\u{1F49D}': 'Symbols/Heart With Ribbon',
  '\u{1F49F}': 'Symbols/Heart Decoration',
  '\u{1F48B}': 'Symbols/Kiss Mark',
  '\u{1F48C}': 'Symbols/Love Letter',
  '\u{1F4AF}': 'Symbols/Hundred Points',
  '\u{1F4A2}': 'Symbols/Anger Symbol',
  '\u{1F4A5}': 'Symbols/Collision',
  '\u{1F4AB}': 'Symbols/Dizzy',
  '\u{1F4A4}': 'Symbols/Zzz',
  '\u{1F4AC}': 'Symbols/Speech Balloon',
  '\u{1F4AD}': 'Symbols/Thought Balloon',
  '\u{1F5EF}': 'Symbols/Right Anger Bubble',
  '\u{2757}': 'Symbols/Exclamation Mark',
  '\u{2755}': 'Symbols/White Exclamation Mark',
  '\u{2753}': 'Symbols/Question Mark',
  '\u{2754}': 'Symbols/White Question Mark',
  '\u{203C}': 'Symbols/Double Exclamation Mark',
  '\u{2049}': 'Symbols/Exclamation Question Mark',
  '\u{2705}': 'Symbols/Check Mark Button',
  '\u{2611}': 'Symbols/Check Box With Check',
  '\u{2714}': 'Symbols/Check Mark',
  '\u{274C}': 'Symbols/Cross Mark',
  '\u{1F192}': 'Symbols/Cool Button',
  '\u{1F195}': 'Symbols/New Button',
  '\u{1F193}': 'Symbols/Free Button',
  '\u{1F199}': 'Symbols/Up Button',
  '\u{1F197}': 'Symbols/Ok Button',
  '\u{1F51D}': 'Symbols/Top Arrow',
  '\u{1F4B1}': 'Symbols/Currency Exchange',
  '\u{2648}': 'Symbols/Aries',
  '\u{2649}': 'Symbols/Taurus',
  '\u{264A}': 'Symbols/Gemini',
  '\u{264B}': 'Symbols/Cancer',
  '\u{264C}': 'Symbols/Leo',
  '\u{264D}': 'Symbols/Virgo',
  '\u{264E}': 'Symbols/Libra',
  '\u{264F}': 'Symbols/Scorpio',
  '\u{2650}': 'Symbols/Sagittarius',
  '\u{2651}': 'Symbols/Capricorn',
  '\u{2652}': 'Symbols/Aquarius',
  '\u{2653}': 'Symbols/Pisces',
  '\u{26CE}': 'Symbols/Ophiuchus',
};

/** Variation selector va teri rangi modifikatorlarini olib tashlaydi */
export function normalizeEmojiKey(emoji: string): string {
  return Array.from(emoji)
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp === 0xfe0f || cp === 0xfe0e) return false; // variation selector
      if (cp >= 0x1f3fb && cp <= 0x1f3ff) return false; // teri rangi
      return true;
    })
    .join('');
}

/**
 * Telegramning animatsion emoji faylini (`.webp`) qaytaradi.
 * Xaritada bo'lmasa `null` — bu holda chaqiruvchi eski usulga qaytadi.
 */
export function telegramAnimatedEmojiUrl(emoji: string): string | null {
  const key = normalizeEmojiKey(emoji);
  const path = TELEGRAM_EMOJI_PATHS[key];
  if (!path) return null;
  const slash = path.indexOf('/');
  const dir = path.slice(0, slash);
  const name = path.slice(slash + 1);
  return (
    CDN_BASE + '/' + encodeURIComponent(dir) + '/' + encodeURIComponent(name) + '.webp'
  );
}

/** Shu emoji Telegram to'plamida mavjudmi? */
export function hasTelegramEmoji(emoji: string): boolean {
  return Boolean(TELEGRAM_EMOJI_PATHS[normalizeEmojiKey(emoji)]);
}

export const TELEGRAM_EMOJI_COUNT = Object.keys(TELEGRAM_EMOJI_PATHS).length;
