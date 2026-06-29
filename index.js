const { createServer } = require('http');

const TELEGRAM_TOKEN = '8373581583:AAHWfVmuRcYHChHvc258Uq6kjJrL1AzFv1g';
const OPENROUTER_KEY = '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';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const PHYSIO_SYSTEM = `Ты эксперт по физиогномике. Анализируй черты лица строго по физиогномическим признакам. Всегда отвечай на русском языке. Форматируй ответ с эмодзи перед каждым блоком для удобного чтения в Telegram. Используй эмодзи: 🔷 для заголовков блоков, ✅ для положительных черт, ⚡ для сильных качеств, 💡 для выводов.`;

async function sendMessage(chat_id, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' })
  });
}

async function getFileUrl(file_id) {
  const resp = await fetch(`${TELEGRAM_API}/getFile?file_id=${file_id}`);
  const data = await resp.json();
  const path = data.result?.file_path;
  if (!path) return null;
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${path}`;
}

async function analyzeImage(imageUrl, mode) {
  // Скачиваем фото и конвертируем в base64
  const imgResp = await fetch(imageUrl);
  const imgBuffer = await imgResp.arrayBuffer();
  const b64 = Buffer.from(imgBuffer).toString('base64');
  const imageContent = { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } };

  let prompt = '';
  if (mode === 'full') {
    prompt = `Проведи ПОЛНЫЙ физиогномический анализ человека на фото.\nИспользуй такую структуру:\n🔷 ФОРМА ЛИЦА — опиши тип и что это означает\n🔷 ЛОБ — высота, ширина, интеллект\n🔷 ГЛАЗА — форма, посадка, взгляд\n🔷 НОС — форма, размер, характер\n🔷 ГУБЫ И РОТ — чувственность, коммуникация\n🔷 ПОДБОРОДОК И ЧЕЛЮСТЬ — воля, упорство\n🔷 СКУЛЫ — характер, энергия\n💡 ОБЩИЙ ВЫВОД — главные черты личности`;
  } else if (mode === 'sex') {
    prompt = `Оцени сексуальную энергию по физиогномике.\n🔥 ОБЩИЙ УРОВЕНЬ СЕКСУАЛЬНОЙ ЭНЕРГИИ\n👄 ГУБЫ — чувственность\n👁 ГЛАЗА — притягательность\n🔷 СКУЛЫ, ПОДБОРОДОК\n💡 ВЫВОД`;
  } else if (mode === 'dominant') {
    prompt = `Определи склонность к доминированию или подчинению по физиогномике.\n👑 ОБЩАЯ ОЦЕНКА\n🔷 ЧЕЛЮСТЬ И ПОДБОРОДОК\n👁 ВЗГЛЯД\n🔷 ДРУГИЕ ПРИЗНАКИ\n💡 ВЫВОД`;
  } else {
    prompt = `Кратко опиши характер по физиогномике:\n🔷 Форма лица и общее впечатление\n👁 Глаза и взгляд\n🔷 Нос, губы, подбородок\n💡 Главные черты характера (3-5 качеств)`;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://physiobot.app',
      'X-Title': 'PhysioBot'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        { role: 'system', content: PHYSIO_SYSTEM },
        { role: 'user', content: [{ type: 'text', text: prompt }, imageContent] }
      ],
      max_tokens: 1500
    })
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || `❌ Ошибка: ${data.error?.message || 'нет ответа'}`;
}

// Хранилище режимов пользователей
const userModes = {};

async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chat_id = msg.chat.id;
  const text = msg.text || '';

  // Команды
  if (text === '/start') {
    await sendMessage(chat_id,
      `👁 <b>Физиогномический анализ</b>\n\nОтправь фото лица и я проведу анализ.\n\n<b>Режимы:</b>\n/full — полный анализ\n/sex — сексуальная энергия\n/dominant — доминирование/подчинение\n/short — краткий анализ (по умолчанию)`
    );
    return;
  }

  if (text === '/full') { userModes[chat_id] = 'full'; await sendMessage(chat_id, '✅ Режим: полный анализ. Отправь фото.'); return; }
  if (text === '/sex') { userModes[chat_id] = 'sex'; await sendMessage(chat_id, '✅ Режим: сексуальная энергия. Отправь фото.'); return; }
  if (text === '/dominant') { userModes[chat_id] = 'dominant'; await sendMessage(chat_id, '✅ Режим: доминирование. Отправь фото.'); return; }
  if (text === '/short') { userModes[chat_id] = 'short'; await sendMessage(chat_id, '✅ Режим: краткий анализ. Отправь фото.'); return; }

  // Фото
  if (msg.photo) {
    const mode = userModes[chat_id] || 'full';
    await sendMessage(chat_id, '⏳ Анализирую...');

    try {
      const photos = msg.photo;
      const best = photos[photos.length - 1]; // наибольшее разрешение
      const fileUrl = await getFileUrl(best.file_id);
      if (!fileUrl) { await sendMessage(chat_id, '❌ Не удалось получить фото'); return; }

      const analysis = await analyzeImage(fileUrl, mode);
      await sendMessage(chat_id, analysis);
    } catch (e) {
      console.error('Error:', e.message);
      await sendMessage(chat_id, '❌ Ошибка при анализе: ' + e.message);
    }
    return;
  }

  if (!msg.photo && !text.startsWith('/')) {
    await sendMessage(chat_id, '📸 Отправь фото лица для анализа.\n\nКоманды: /full /sex /dominant /short');
  }
}

// HTTP сервер
createServer(async (req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        await handleUpdate(update);
      } catch (e) {
        console.error('Parse error:', e.message);
      }
      res.writeHead(200);
      res.end('OK');
    });
  } else {
    res.writeHead(200);
    res.end('Physio Bot running');
  }
}).listen(process.env.PORT || 3333, async () => {
  console.log('Bot server running on port', process.env.PORT || 3333);

  // Устанавливаем webhook
  const webhookUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : null;

  if (webhookUrl) {
    const r = await fetch(`${TELEGRAM_API}/setWebhook?url=${webhookUrl}`);
    const d = await r.json();
    console.log('Webhook set:', webhookUrl, d.ok ? '✅' : '❌', d.description || '');
  } else {
    console.log('RAILWAY_PUBLIC_DOMAIN not set — webhook not configured');
  }
});
