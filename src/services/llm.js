const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LANGUAGE_CONFIG = {
  en: {
    name:     'English',
    instruction: 'Keep your response clear, brief, and in plain English with no medical jargon.',
    closing:  "Always follow your doctor or pharmacist's instructions.",
  },
  sn: {
    name:     'Shona (ChiShona)',
    instruction: 'Pindura muChiShona chete — usashandise Chirungu. Chengetedza mhinduro yako yakajeka uye pfupi pasina mashoko ezvekurapa akaoma.',
    closing:  'Gara uchiteera mirayiridzo yechiremba kana wemishonga yako.',
  },
  nd: {
    name:     'Ndebele (IsiNdebele)',
    instruction: 'Phendula ngesiNdebele kuphela — ungasebenzisi IsiNgisi. Gcina impendulo yakho icacile futhi emfushane ngaphandle kwamagama ezokwelashwa anzima.',
    closing:  'Hlala ulandela imiyalelo kadokotela wakho noma lomtho-muntu.',
  },
};

async function explainDrugs(drugNames, language = 'en') {
  if (!drugNames || drugNames.length === 0) {
    return 'No drugs detected to explain.';
  }

  const config   = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.en;
  const drugList = drugNames.join(', ');

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role:    'user',
      content: `You are a friendly pharmacist assistant helping patients in Zimbabwe understand their medication. ${config.instruction}

The patient has been prescribed: ${drugList}

For each medication explain:
1. What it is used for
2. How to take it (general)
3. One important warning if any

Stay under 250 words. End with: "${config.closing}"

Do not diagnose. Do not recommend stopping medication.`
    }]
  });

  return message.content[0].text;
}

module.exports = { explainDrugs };
