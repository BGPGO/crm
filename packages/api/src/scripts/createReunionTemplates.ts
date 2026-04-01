import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// NOTE: Meta rejects templates where {{1}} is at the very start of the body.
// Templates d2, d3, d4, d6 were fixed by prefixing "Oi "/"E a\u00ED"/"Olha" before the variable.
// All 7 templates listed below for reference (already created in Meta + DB).
const templates = [
  {
    name: 'reuniao_d1_abertura',
    body: 'Oi {{1}}, que bom que conversamos! \u{1F60A}\n\nQuero te ajudar a agendar aquele Diagn\u00F3stico Financeiro. S\u00E3o apenas 20 minutos e voc\u00EA j\u00E1 sai com uma vis\u00E3o clara da sa\u00FAde financeira do seu neg\u00F3cio. Qual o melhor hor\u00E1rio pra voc\u00EA esta semana?',
  },
  {
    name: 'reuniao_d2_facilitar',
    body: 'Oi {{1}}, pra facilitar, separei alguns hor\u00E1rios pra voc\u00EA:\n\nTer\u00E7a ou quinta, de manh\u00E3 ou \u00E0 tarde \u2014 qual funciona melhor? Se preferir outro dia, me fala que eu encaixo.',
  },
  {
    name: 'reuniao_d3_oque_acontece',
    body: 'E a\u00ED {{1}}, muita gente pergunta o que rola na reuni\u00E3o, ent\u00E3o j\u00E1 adianto: a gente analisa juntos o financeiro do seu neg\u00F3cio e identifica gargalos e oportunidades que normalmente passam despercebidos.\n\n\u00C9 r\u00E1pido (20 min), gratuito e sem compromisso. Bora agendar?',
  },
  {
    name: 'reuniao_d4_resultado',
    body: 'Olha {{1}}, na \u00FAltima reuni\u00E3o que fiz, o empres\u00E1rio descobriu que estava perdendo R$4 mil por m\u00EAs num processo que ele nem sabia que existia.\n\nCada dia sem esse diagn\u00F3stico pode ser dinheiro saindo do seu caixa. Me manda um hor\u00E1rio que eu reservo pra voc\u00EA.',
  },
  {
    name: 'reuniao_d5_objecao',
    body: 'Oi {{1}}, sei que agenda apertada \u00E9 a realidade de todo empres\u00E1rio.\n\nPor isso o diagn\u00F3stico \u00E9 de apenas 20 minutos, online, no hor\u00E1rio que for melhor pra voc\u00EA \u2014 at\u00E9 fora do hor\u00E1rio comercial. Quer que eu reserve um espa\u00E7o?',
  },
  {
    name: 'reuniao_d6_urgencia',
    body: 'Oi {{1}}, esta \u00E9 minha pen\u00FAltima mensagem. Ainda tenho hor\u00E1rios esta semana.\n\nSe marcar reuni\u00E3o ainda estiver nos seus planos, me responde aqui que agendo na hora. Sen\u00E3o, sem problema!',
  },
  {
    name: 'reuniao_d7_encerramento',
    body: 'Oi {{1}}, como n\u00E3o consegui um hor\u00E1rio com voc\u00EA, vou encerrar nosso contato por aqui.\n\nSe no futuro quiser agendar o Diagn\u00F3stico Financeiro, \u00E9 s\u00F3 responder esta mensagem que retomamos. Sucesso! \u{1F91D}',
  },
];

async function main() {
  // 1. Read CloudWaConfig
  const config = await prisma.cloudWaConfig.findFirst();
  if (!config) {
    throw new Error('CloudWaConfig not found in database');
  }
  if (!config.wabaId || !config.accessToken) {
    throw new Error('wabaId or accessToken missing in CloudWaConfig');
  }

  console.log(`Using WABA ID: ${config.wabaId}`);
  console.log(`Creating ${templates.length} templates...\n`);

  const url = `https://graph.facebook.com/v21.0/${config.wabaId}/message_templates`;

  for (const tpl of templates) {
    const components = [
      {
        type: 'BODY',
        text: tpl.body,
        example: { body_text: [['Jo\u00E3o']] },
      },
    ];

    const payload = {
      name: tpl.name,
      category: 'MARKETING',
      language: 'pt_BR',
      components,
    };

    try {
      console.log(`Creating template: ${tpl.name}...`);

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
      });

      const metaData = response.data;
      console.log(`  Meta response: id=${metaData.id}, status=${metaData.status}`);

      // Map Meta status to our enum
      let status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' = 'PENDING';
      if (metaData.status === 'APPROVED') status = 'APPROVED';
      else if (metaData.status === 'REJECTED') status = 'REJECTED';

      // Save to CloudWaTemplate
      const saved = await prisma.cloudWaTemplate.create({
        data: {
          name: tpl.name,
          language: 'pt_BR',
          category: 'MARKETING',
          status,
          metaTemplateId: metaData.id,
          body: tpl.body,
          components: components as any,
          bodyExamples: [['Jo\u00E3o']],
          headerType: null,
          headerContent: null,
          footer: null,
          buttons: null,
        },
      });

      console.log(`  Saved to DB: ${saved.id}\n`);
    } catch (error: any) {
      if (error.response) {
        console.error(`  ERROR creating ${tpl.name}:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.error(`  ERROR creating ${tpl.name}:`, error.message);
      }
      console.log('');
    }
  }

  console.log('Done!');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
