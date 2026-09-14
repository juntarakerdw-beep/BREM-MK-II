export default async function handler(req, res) {
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

    const response = await fetch('https://api.ocr.space/parse/image', {
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

    const result = await response.json();

    if (!response.ok || result.IsErroredOnProcessing) {
      return res.status(500).json({
        error: result.ErrorMessage?.[0] || 'OCR processing failed'
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
    return res.status(500).json({
      error: error.message || 'OCR failed'
    });
  }
}
