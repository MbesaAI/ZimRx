const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function explainDrugs(drugNames) {
  if (!drugNames || drugNames.length === 0) {
    return 'No drugs detected to explain.';
  }

  const drugList = drugNames.join(', ');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a friendly pharmacist assistant helping patients in Zimbabwe
understand their medication. Keep your response clear, brief, and in plain English
with no medical jargon.

The patient has been prescribed: ${drugList}

For each medication explain:
1. What it is used for
2. How to take it (general)
3. One important warning if any

Stay under 250 words. End with: "Always follow your doctor or pharmacist's instructions."

Do not diagnose. Do not recommend stopping medication.`
    }]
  });

  return message.content[0].text;
}

module.exports = { explainDrugs };
