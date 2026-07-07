// Combined language-selection menu shown to new users — trilingual so any user can read it.
const LANGUAGE_MENU =
  `Welcome to *ZimRx* 🏥 | Mauya ku *ZimRx* | Siyakwamukela ku *ZimRx*\n\n` +
  `Please choose your language | Sarudza mutauro wako | Khetha ulimi lwakho:\n\n` +
  `*1* — English\n` +
  `*2* — Shona (ChiShona)\n` +
  `*3* — Ndebele (IsiNdebele)`;

const messages = {
  en: {
    MENU: `Welcome to *ZimRx* 🏥\n\nI can help you with your prescription. What would you like?\n\n*1* — 📋 Translate my prescription\n*2* — 💊 Explain my medication\n*3* — 🗺️ Find nearest pharmacy\n*4* — 📁 Retrieve my last prescription\n\nOr send a *photo* of your prescription to get started.\n\nReply *0* to change language.`,
    FULFILLMENT_PROMPT: `💊 *Quick check — were you able to fill this prescription?*\n\n*1* — Yes, I collected my medicines ✅\n*2* — Not yet, still looking 🔍\n*3* — No, I couldn't find them ❌`,
    SCANNING: `📷 Got your prescription photo. Analysing now...`,
    OCR_FAIL: `❌ Could not read the image. Please try again with a clearer photo in good lighting.`,
    NO_DRUGS: `⚠️ I could not match any medications to the MCAZ register.\n\nPlease try:\n• A clearer photo\n• Better lighting\n• Holding the phone steady\n\nOr type the medication name and I will look it up.`,
    FINDING_PHARMACIES: `🔍 Finding pharmacies near you...`,
    NO_PHARMACIES: `No registered pharmacies found near your location. Try typing your town name instead.`,
    FULFILLMENT_YES: `✅ Great! Glad you got your medicines.\n\nReply *2* to get an explanation of your medications or *3* to find another pharmacy.`,
    FULFILLMENT_NO: `😔 Sorry to hear that. Reply *3* and I'll find the nearest pharmacies for you.`,
    FULFILLMENT_LOOKING: `🔍 No problem — reply *3* to find the nearest pharmacies, or *2* to understand your medications.`,
    FULFILLMENT_INVALID: `Please reply with *1*, *2*, or *3*.`,
    SEND_PHOTO: `📸 Please send a photo of your prescription and I will read it for you.`,
    NO_PRESCRIPTION_YET: `⚠️ No prescription found yet. Please send a photo of your prescription first.`,
    LOOKING_UP: `⏳ Looking up your medications...`,
    SHARE_LOCATION: `📍 To find the nearest pharmacy, please share your location.\n\nIn WhatsApp:\n1. Tap the *paperclip* (📎) icon\n2. Tap *Location*\n3. Tap *Send Your Current Location*\n\nOr type your town name (e.g. "Harare" or "Bulawayo")`,
    NO_RECORD: `📭 No prescription on record yet.\n\nSend a photo of your prescription to get started.`,
    LANGUAGE_CHANGED: `✅ Language set to English. Here is your menu:`,

    prescriptionDetected: (drugList) => `✅ *Prescription detected:*\n\n${drugList}`,
    nearestPharmacies:    (list)     => `🏥 *Nearest pharmacies to you:*\n\n${list}\n\nSave this message so you have it offline.`,
    medicationExplained:  (text)     => `💊 *Your medication explained:*\n\n${text}`,
    lastPrescription:     (date, drugs) => `📁 *Your last prescription (${date}):*\n\n${drugs}\n\nReply *2* to get an explanation of these medications.`,
    townPharmacies:       (town, list)  => `🏥 *Pharmacies in ${town}:*\n\n${list}`,
    fulfillmentReprompt:  (prompt)   => `Please reply with *1*, *2*, or *3*.\n\n${prompt}`,
  },

  sn: {
    MENU: `Mauya ku *ZimRx* 🏥\n\nNdinogona kukubatsira nemuripo wako. Chii chaunoda?\n\n*1* — 📋 Verenga muripo wangu\n*2* — 💊 Tsanangura mishonga yangu\n*3* — 🗺️ Tsvaga chemist iri pedyo\n*4* — 📁 Bvisa muripo wangu wekupedzisira\n\nKana tumira *mufananidzo* wemuripo wako kutanga.\n\nRidza *0* kuti ushintse mutauro.`,
    FULFILLMENT_PROMPT: `💊 *Mubvunzo — makwanisa kupinda nezvidhaka zvemuripo uyu here?*\n\n*1* — Hongu, ndatora mishonga yangu ✅\n*2* — Kwete, ndicharamba nditsvaga 🔍\n*3* — Kwete, handina kuwana ❌`,
    SCANNING: `📷 Ndatora mufananidzo wemuripo. Ndinorangarira zvino...`,
    OCR_FAIL: `❌ Handina kukwanisa kuverenga mufananidzo. Ndapota edza zvakare nemufananidzo wakajeka muruvara rwakajeka.`,
    NO_DRUGS: `⚠️ Handina kukwanisa kuwana mishonga mu MCAZ.\n\nNdapota edza:\n• Mufananidzo wakajeka\n• Ruvara rwakajeka\n• Bata runhare rugere\n\nKana nyora zita remushonga ndikutsvagire.`,
    FINDING_PHARMACIES: `🔍 Ndinotsvaga vachemist vari pedyo newe...`,
    NO_PHARMACIES: `Hapana vachemist verejisize vawanwa pedyo nawe. Edza kunyora zita redhorobha rako.`,
    FULFILLMENT_YES: `✅ Zvakanaka! Ndinofara kuti watora mishonga yako.\n\nRidza *2* kuti uzive nezvezvishonga zvako kana *3* kutsvaga chemist.`,
    FULFILLMENT_NO: `😔 Ndinoshungurudzwa kunzwa izvozvo. Ridza *3* ndikutsvagire vachemist vari pedyo newe.`,
    FULFILLMENT_LOOKING: `🔍 Hakuna dambudziko — ridza *3* kutsvaga vachemist, kana *2* kunzwisisa mishonga yako.`,
    FULFILLMENT_INVALID: `Ndapota ridza *1*, *2*, kana *3*.`,
    SEND_PHOTO: `📸 Ndapota tumira mufananidzo wemuripo wako ndikuverenga.`,
    NO_PRESCRIPTION_YET: `⚠️ Hapana muripo wawanwa. Ndapota tumira mufananidzo wemuripo wako kutanga.`,
    LOOKING_UP: `⏳ Ndinotsvaga zvishonga zvako...`,
    SHARE_LOCATION: `📍 Kutsvaga chemist iri pedyo, ndapota govera nzvimbo yako.\n\nMuWhatsApp:\n1. Bata *paperclip* (📎) icon\n2. Bata *Location*\n3. Bata *Send Your Current Location*\n\nKana nyora zita redhorobha rako (semuenzaniso "Harare" kana "Bulawayo")`,
    NO_RECORD: `📭 Hapana muripo usevhiwa.\n\nTumira mufananidzo wemuripo wako kutanga.`,
    LANGUAGE_CHANGED: `✅ Mutauro washandurwa kuChiShona. Mehu yako iri pano:`,

    prescriptionDetected: (drugList) => `✅ *Muripo wawanwa:*\n\n${drugList}`,
    nearestPharmacies:    (list)     => `🏥 *Vachemist vari pedyo nawe:*\n\n${list}\n\nSevha meseji iyi kuti uive nayo usina net.`,
    medicationExplained:  (text)     => `💊 *Tsananguro yemishonga yako:*\n\n${text}`,
    lastPrescription:     (date, drugs) => `📁 *Muripo wako wekupedzisira (${date}):*\n\n${drugs}\n\nRidza *2* kuti uzive nezvezvishonga izvi.`,
    townPharmacies:       (town, list)  => `🏥 *Vachemist mu ${town}:*\n\n${list}`,
    fulfillmentReprompt:  (prompt)   => `Ndapota ridza *1*, *2*, kana *3*.\n\n${prompt}`,
  },

  nd: {
    MENU: `Siyakwamukela ku *ZimRx* 🏥\n\nNgingakusiza ngesitifiketi sakho. Ufunani?\n\n*1* — 📋 Funda isitifiketi sami\n*2* — 💊 Chaza umuthi wami\n*3* — 🗺️ Thola ikhemisi eseduze\n*4* — 📁 Landa isitifiketi sami sokugcina\n\nNoma thumela *isithombe* sesitifiketi sakho ukuqala.\n\nPhendula *0* ukuze ushintshe ulimi.`,
    FULFILLMENT_PROMPT: `💊 *Umbuzo — ukwazile ukuthola umuthi walesisitifiketi?*\n\n*1* — Yebo, ngithole umuthi wami ✅\n*2* — Cha, ngisadinga 🔍\n*3* — Cha, angikutholanga ❌`,
    SCANNING: `📷 Ngithole isithombe sesitifiketi. Ngiyahlola manje...`,
    OCR_FAIL: `❌ Angikwazanga ukufunda isithombe. Zama futhi ngesithombe esisobala ekukhanyeni okuhle.`,
    NO_DRUGS: `⚠️ Angikwazanga ukufinda umuthi ku MCAZ.\n\nZama:\n• Isithombe esisobala\n• Ukukhanya okuhle\n• Bamba ifoni uqinile\n\nNoma bhala igama lomuthi ngikutholele.`,
    FINDING_PHARMACIES: `🔍 Ngiyathola amakhemisi aseduze nawe...`,
    NO_PHARMACIES: `Awekho amakhemisi arejiswayo aseduze nendawo yakho. Zama ukubhala igama ledolobha lakho.`,
    FULFILLMENT_YES: `✅ Kulungile! Ngiyajabula ukuthi uthole umuthi wakho.\n\nPhendula *2* ukuze wazi ngomuthi wakho noma *3* ukuthola ikhemisi.`,
    FULFILLMENT_NO: `😔 Ngiyaxolisa ukuzwa lokho. Phendula *3* ngikutholele amakhemisi aseduze nawe.`,
    FULFILLMENT_LOOKING: `🔍 Kulungile — phendula *3* ukuthola amakhemisi, noma *2* ukuzwisisa umuthi wakho.`,
    FULFILLMENT_INVALID: `Sicela uphendule ngo *1*, *2*, noma *3*.`,
    SEND_PHOTO: `📸 Sicela uthumele isithombe sesitifiketi sakho ngisakufundele.`,
    NO_PRESCRIPTION_YET: `⚠️ Asikho isitifiketi esitholiwe. Sicela uthumele isithombe sesitifiketi sakho kuqala.`,
    LOOKING_UP: `⏳ Ngiyathola umuthi wakho...`,
    SHARE_LOCATION: `📍 Ukuthola ikhemisi eseduze, sicela wabelane nendawo yakho.\n\nKu WhatsApp:\n1. Thepha isitshengiso se *paperclip* (📎)\n2. Thepha *Location*\n3. Thepha *Send Your Current Location*\n\nNoma bhala igama ledolobha lakho (isibonelo "Harare" noma "Bulawayo")`,
    NO_RECORD: `📭 Awukho umthombo oserekhodi.\n\nThumela isithombe sesitifiketi sakho ukuqala.`,
    LANGUAGE_CHANGED: `✅ Ulimi lushintshelwe ku IsiNdebele. Nankhu imenyu yakho:`,

    prescriptionDetected: (drugList) => `✅ *Isitifiketi sitholiwe:*\n\n${drugList}`,
    nearestPharmacies:    (list)     => `🏥 *Amakhemisi aseduze nawe:*\n\n${list}\n\nGcina lo mlayezo ukuze uwuthole ungaxhunyiwe.`,
    medicationExplained:  (text)     => `💊 *Incazelo yomuthi wakho:*\n\n${text}`,
    lastPrescription:     (date, drugs) => `📁 *Isitifiketi sakho sokugcina (${date}):*\n\n${drugs}\n\nPhendula *2* ukuze ufumane incazelo yalomuthi.`,
    townPharmacies:       (town, list)  => `🏥 *Amakhemisi e ${town}:*\n\n${list}`,
    fulfillmentReprompt:  (prompt)   => `Sicela uphendule ngo *1*, *2*, noma *3*.\n\n${prompt}`,
  },
};

function getMessages(lang) {
  return messages[lang] || messages.en;
}

module.exports = { LANGUAGE_MENU, getMessages };
