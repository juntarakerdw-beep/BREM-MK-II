export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https' + '://' + 'localhost');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body || {};

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Missing image' });
    }

    if (!process.env.OCR_SPACE_API_KEY) {
      return res.status(500).json({
        error: 'OCR_SPACE_API_KEY is not configured'
      });
    }

    const ocrHost = 'https://' + 'api.ocr.space';
    const ocrEndpoint = ocrHost + '/parse/image';
    const response = await fetch(ocrEndpoint, {
      method: 'POST',
      headers: {
        apikey: process.env.OCR_SPACE_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        base64Image: image,
        language: 'tha',
        OCREngine: '2',
        isOverlayRequired: 'false',
        detectOrientation: 'true',
        scale: 'false',
        isTable: 'false'
      })
    });

    const raw = await response.text();

    let result = {};

    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      console.error(
        'OCR.Space non-JSON response:',
        raw.slice(0, 1000)
      );

      return res.status(502).json({
        error: `OCR.Space ตอบกลับไม่ใช่ JSON (HTTP ${response.status})`
      });
    }

    if (!response.ok || result.IsErroredOnProcessing) {
      console.error(
        'OCR.Space error:',
        JSON.stringify(result, null, 2)
      );

      return res.status(502).json({
        error:
          result.ErrorMessage?.[0] ||
          result.ErrorDetails ||
          result.OCRExitCode ||
          result.Error ||
          `OCR processing failed (HTTP ${response.status})`
      });
    }

    const parsed = result.ParsedResults?.[0];

    if (!parsed) {
      return res.status(500).json({
        error: 'ไม่พบข้อความในสลิป'
      });
    }

    return res.status(200).json({
      text: parsed.ParsedText || ''
    });

  } catch (error) {
    console.error('OCR handler error:', error);

    return res.status(500).json({
      error: error.message || 'OCR failed'
    });
  }
}
