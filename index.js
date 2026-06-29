const { createServer } = require('http');

const OPENROUTER_KEY = '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';

const PHYSIO_SYSTEM = `Ты эксперт по физиогномике. Анализируй черты лица строго по физиогномическим признакам. Всегда отвечай на русском языке. Форматируй ответ с эмодзи перед каждым блоком для удобного чтения в Telegram. Используй эмодзи: 🔷 для заголовков блоков, ✅ для положительных черт, ⚡ для сильных качеств, 💡 для выводов.`;

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  if (req.method !== 'POST') { res.writeHead(404); res.end('Not found'); return; }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body);
      const imageUrl = parsed.imageUrl || '';
      const imageBase64 = parsed.imageBase64 || '';
      const mode = parsed.mode || 'short';

      console.log('imageUrl:', imageUrl.slice(0, 80));

      let imageContent;
      if (imageUrl && imageUrl.startsWith('http')) {
        const imgResp = await fetch(imageUrl);
        const imgBuffer = await imgResp.arrayBuffer();
        const b64 = Buffer.from(imgBuffer).toString('base64');
        imageContent = { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } };
      } else if (imageBase64 && imageBase64.length > 100) {
        const clean = imageBase64.replace(/\s/g, '').replace(/^data:image\/[a-z]+;base64,/, '');
        imageContent = { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${clean}` } };
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ analysis: '❌ Ошибка: изображение не получено.' }));
        return;
      }

      let prompt = '';
      if (mode === 'full') {
        prompt = `Проведи ПОЛНЫЙ физиогномический анализ человека на фото. 
Используй такую структуру с эмодзи:
🔷 ФОРМА ЛИЦА — опиши тип и что это означает
🔷 ЛОБ — высота, ширина, что говорит о интеллекте
🔷 ГЛАЗА — форма, посадка, взгляд, что выражают
🔷 НОС — форма, размер, характер
🔷 ГУБЫ И РОТ — чувственность, коммуникация
🔷 ПОДБОРОДОК И ЧЕЛЮСТЬ — воля, упорство
🔷 СКУЛЫ — характер, энергия
💡 ОБЩИЙ ВЫВОД — главные черты личности, сильные стороны`;
      } else if (mode === 'sex') {
        prompt = `Оцени сексуальную энергию человека на фото по физиогномике.
Структура:
🔥 ОБЩИЙ УРОВЕНЬ СЕКСУАЛЬНОЙ ЭНЕРГИИ
👄 ГУБЫ — чувственность
👁 ГЛАЗА — притягательность и страстность  
🔷 ДРУГИЕ ЧЕРТЫ — скулы, подбородок
💡 ВЫВОД — общая оценка сексуальности`;
      } else if (mode === 'dominant') {
        prompt = `Определи склонность к доминированию или подчинению по физиогномике лица.
Структура:
👑 ОБЩАЯ ОЦЕНКА — доминант или подчиняется
🔷 ЧЕЛЮСТЬ И ПОДБОРОДОК — воля и власть
👁 ВЗГЛЯД — сила или мягкость
🔷 ДРУГИЕ ПРИЗНАКИ
💡 ВЫВОД — как проявляется в жизни`;
      } else {
        prompt = `Кратко опиши характер человека по физиогномике. Используй эмодзи перед каждым абзацем:
🔷 Форма лица и общее впечатление
👁 Глаза и взгляд  
🔷 Нос, губы, подбородок
💡 Главные черты характера (3-5 качеств)`;
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
      console.log('Status:', response.status, data.error ? '| Error: ' + JSON.stringify(data.error).slice(0,200) : '| OK');
      const analysis = data.choices?.[0]?.message?.content || `❌ Ошибка: ${data.error?.message || 'нет ответа'}`;

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ analysis }));
    } catch (e) {
      console.error('Server error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ analysis: '❌ Ошибка сервера: ' + e.message }));
    }
  });
}).listen(process.env.PORT || 3333, () => console.log('Proxy running on :3333'));
