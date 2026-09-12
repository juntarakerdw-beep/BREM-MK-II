const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { image } = req.body || {};
    if (!image || typeof image !== 'string' || !image.includes(',')) return res.status(400).json({ error: 'Missing image' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on Vercel' });
    const match=image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if(!match) return res.status(400).json({ error:'รองรับเฉพาะ JPG/PNG/WEBP' });
    const [,media_type,data]=match;
    const prompt = `อ่านข้อความจากสลิปการจอง On Stage และตอบเป็น JSON เท่านั้น โดยห้ามใส่ markdown หรือคำอธิบาย ใช้ schema นี้: {"name":"","date":"","time":"","venue":"","zone":"","quantity":"","bookingId":"","phone":""}. date ต้องเป็น 18 ก.ย., 19 ก.ย. หรือ 20 ก.ย. เท่านั้น; time ต้องเป็น 14:00, 18:00 หรือ 19:00 เท่านั้น; quantity เป็นจำนวนบัตร ถ้าไม่แน่ใจให้เว้นว่าง อย่าเดาเลขสำคัญ เช่น Booking ID หรือเบอร์โทร`;
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:MODEL,max_tokens:800,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type,data}},{type:'text',text:prompt}]}]})});
    const dataJson=await r.json();
    if(!r.ok) return res.status(r.status).json({error:dataJson?.error?.message||'Anthropic OCR failed'});
    const text=(dataJson.content||[]).find(x=>x.type==='text')?.text||'';
    const clean=text.replace(/```json|```/g,'').trim();
    const form=JSON.parse(clean);
    return res.status(200).json({form});
  } catch(e) { return res.status(500).json({error:e.message||'OCR failed'}); }
}
