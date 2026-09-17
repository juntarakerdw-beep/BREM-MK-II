import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar, Map, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid,
  Upload, Search, List, X, Image as ImageIcon, Edit3, Check, Loader2,
  Trash2, Save, RefreshCw, Users, Wifi, WifiOff
} from 'lucide-react';
import { supabase, supabaseConfigured } from './src/lib/supabase';

const DATES = ['18 ก.ย.', '19 ก.ย.', '20 ก.ย.'];

const ZONES = ['A', 'B'];

const ROWS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M'
];

const ZONE_COLUMNS = {
  A: [12, 11, 10, 9, 8, 7],
  B: [6, 5, 4, 3, 2, 1]
};

const ROUND_OPTIONS = {
  '18 ก.ย.': ['19:00'],
  '19 ก.ย.': ['14:00', '18:00'],
  '20 ก.ย.': ['14:00', '18:00']
};

const STATUS_CONFIG = {
  available: {
    label: 'ว่าง',
    color: '#54c4a5',
    bg: 'var(--seat-available-bg, #fff)',
    text: 'var(--seat-available-text, #54c4a5)',
    icon: <LayoutGrid size={14} />
  },

  sold: {
    label: 'จองแล้ว',
    color: '#28b5d3',
    bg: '#28b5d3',
    text: '#fff',
    icon: <CheckCircle2 size={14} />
  },

  checked_in: {
    label: 'รับบัตรแล้ว',
    color: '#10b981',
    bg: '#10b981',
    text: '#fff',
    icon: <UserCheck size={14} />
  },

  blocked: {
    label: 'ถูกบล็อก',
    color: '#c35057',
    bg: '#c35057',
    text: '#fff',
    icon: <AlertOctagon size={14} />
  }
};

const EMPTY_FORM = {
  name: '',
  date: '',
  time: '',
  venue: '',
  zone: '',
  quantity: '',
  bookingId: '',
  phone: '',
  seats: []
};

const FIELDS = [
  ['ชื่อผู้จอง', 'name', 'ไม่พบข้อมูล'],
  ['วันที่', 'date', ''],
  ['รอบการแสดง', 'time', ''],
  ['สถานที่', 'venue', 'ไม่พบข้อมูล'],
  ['Zone', 'zone', 'เช่น A หรือ B'],
  ['จำนวนบัตร', 'quantity', 'เช่น 1'],
  ['Booking ID', 'bookingId', 'ไม่พบข้อมูล'],
  ['เบอร์โทรศัพท์', 'phone', 'ไม่พบข้อมูล']
];

const toForm = b => ({
  name: b.name || '',
  date: b.date_label || b.date || '',
  time: b.time || '',
  venue: b.venue || '',
  zone: b.zone || '',
  quantity: String(b.quantity || ''),
  bookingId: b.booking_id || b.bookingId || '',
  phone: b.phone || '',
  seats: Array.isArray(b.requested_seats)
    ? b.requested_seats
    : []
});

function errorText(error) {
  if (!error) {
    return 'เกิดข้อผิดพลาด';
  }

  if (typeof error === 'string') {
    return error;
  }

  return (
    error.message ||
    error.error_description ||
    error.details ||
    error.hint ||
    'เกิดข้อผิดพลาด'
  );
}

function createSafeId() {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
  } catch (err) {
    console.warn(
      'crypto.randomUUID unavailable:',
      err
    );
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

async function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onload = () => resolve(r.result);

    r.onerror = () =>
      reject(
        new Error('อ่านไฟล์ไม่สำเร็จ')
      );

    r.readAsDataURL(file);
  });
}

async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ');
  }

  const raw = await readAsDataURL(file);

  return new Promise((resolve, reject) => {
    const img = document.createElement('img');

    img.onload = () => {
      try {
        const max = 1400;

        const scale = Math.min(
          1,
          max / img.naturalWidth
        );

        const width = Math.max(
          1,
          Math.round(img.naturalWidth * scale)
        );

        const height = Math.max(
          1,
          Math.round(img.naturalHeight * scale)
        );

        const c = document.createElement('canvas');

        c.width = width;
        c.height = height;

        const ctx = c.getContext('2d');

        if (!ctx) {
          reject(
            new Error('ไม่สามารถเตรียมรูปสำหรับ OCR ได้')
          );
          return;
        }

        ctx.drawImage(
          img,
          0,
          0,
          width,
          height
        );

        const result = c.toDataURL(
          'image/jpeg',
          0.82
        );

        if (
          !result ||
          !result.startsWith('data:image/jpeg;base64,')
        ) {
          reject(
            new Error('ไม่สามารถแปลงรูปสำหรับ OCR ได้')
          );
          return;
        }

        resolve(result);
      } catch (error) {
        reject(
          new Error(
            error?.message ||
            'ไม่สามารถเตรียมรูปสำหรับ OCR ได้'
          )
        );
      }
    };

    img.onerror = () => {
      reject(
        new Error('ไม่สามารถอ่านรูปภาพได้')
      );
    };

    img.src = raw;
  });
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] =
    dataUrl.split(',');

  const mime =
    (head.match(/:(.*?);/) || [])[1] ||
    'image/jpeg';

  const bytes = atob(b64);

  const arr =
    new Uint8Array(bytes.length);

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    arr[i] =
      bytes.charCodeAt(i);
  }

  return new Blob(
    [arr],
    { type: mime }
  );
}



function parseOCRText(rawText, seatRows = []) {
  const original = String(rawText || '');

  const text = original
    .replace(/\r/g, '\n')
    .replace(/\t+/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const compact = text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // OCR บางครั้งอ่านตัว B เป็นสัญลักษณ์ ฿
    // ใช้เฉพาะกรณีที่ตามด้วยเลขที่นั่ง
    .replace(/฿(?=\d{1,2}(?:\s*[,，]\s*\d{1,2})+)/g, 'B');

  const result = {
    ...EMPTY_FORM,
    rawText: original
  };

  // =========================================================
  // Helpers
  // =========================================================

  const normalizeTime = value => {
    if (!value) {
      return '';
    }

    let time = String(value)
      .trim()
      .replace(/[.．]/g, ':');

    const match = time.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) {
      return '';
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return '';
    }

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const normalizeDate = value => {
    if (!value) {
      return '';
    }

    const day = Number(value);

    if (![18, 19, 20].includes(day)) {
      return '';
    }

    return `${day} ก.ย.`;
  };

  // =========================================================
  // 1. วันที่ + เวลา
  // =========================================================

  const dateTimeCandidates = [];

  const addDateTimeCandidate = (day, time) => {
    const normalizedDate = normalizeDate(day);
    const normalizedTime = normalizeTime(time);

    if (
      normalizedDate &&
      normalizedTime
    ) {
      dateTimeCandidates.push({
        date: normalizedDate,
        time: normalizedTime
      });
    }
  };

  // รอบวันที่20 เวลา18:00
  for (const match of compact.matchAll(
    /รอบ\s*วันที่\s*(18|19|20)\s*(?:เวลา\s*)?(\d{1,2}[:.]\d{2})/gi
  )) {
    addDateTimeCandidate(
      match[1],
      match[2]
    );
  }

  // วันที่18 รอบ 19.00น.
  for (const match of compact.matchAll(
    /วันที่\s*(18|19|20)\s*รอบ\s*(\d{1,2}[:.]\d{2})\s*น?\.?/gi
  )) {
    addDateTimeCandidate(
      match[1],
      match[2]
    );
  }

  // วันที่18 เวลา19:00
  for (const match of compact.matchAll(
    /วันที่\s*(18|19|20)\s*(?:เวลา\s*)?(\d{1,2}[:.]\d{2})/gi
  )) {
    addDateTimeCandidate(
      match[1],
      match[2]
    );
  }

  // 20/18:00
  for (const match of compact.matchAll(
    /\b(18|19|20)\s*\/\s*(\d{1,2}[:.]\d{2})\b/g
  )) {
    addDateTimeCandidate(
      match[1],
      match[2]
    );
  }

  // 20/18.00น.
  for (const match of compact.matchAll(
    /\b(18|19|20)\s*\/\s*(\d{1,2}[:.]\d{2})\s*น?\.?/g
  )) {
    addDateTimeCandidate(
      match[1],
      match[2]
    );
  }

  // เลือก candidate แรกที่พบ
  if (dateTimeCandidates.length) {
    result.date =
      dateTimeCandidates[0].date;

    result.time =
      dateTimeCandidates[0].time;
  }

  // =========================================================
  // 2. สร้างรายการ Seat ที่มีอยู่จริงจาก Supabase
  // =========================================================

  const knownSeats = new Set();

  for (const row of seatRows) {
    const code = String(
      row?.seat_code ??
      row?.seatCode ??
      row?.code ??
      row?.seat ??
      ''
    )
      .trim()
      .toUpperCase();

    if (
      /^[A-M]\d{1,2}$/.test(code)
    ) {
      knownSeats.add(code);
    }
  }

  // =========================================================
  // 3. Expand seat expression
  // =========================================================

  const expandSeatExpression = expression => {
    if (!expression) {
      return [];
    }

    let value = String(expression)
      .toUpperCase()
      .replace(/[–—−]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    const seats = [];

    // -------------------------------------------------------
    // B5-B12 / B5–B12
    // -------------------------------------------------------

    const range = value.match(
      /^([A-M])\s*(\d{1,2})\s*-\s*([A-M])?\s*(\d{1,2})$/i
    );

    if (range) {
      const row = range[1].toUpperCase();
      const endRow =
        (range[3] || row).toUpperCase();

      const start = Number(range[2]);
      const end = Number(range[4]);

      if (
        row === endRow &&
        end >= start &&
        end - start <= 50
      ) {
        for (
          let number = start;
          number <= end;
          number++
        ) {
          seats.push(
            `${row}${number}`
          );
        }
      }

      return seats;
    }

    // -------------------------------------------------------
    // B5,6,7,8
    // -------------------------------------------------------

    const commaCompact = value.match(
      /^([A-M])\s*(\d{1,2})(?:\s*,\s*(\d{1,2}))+$/i
    );

    if (commaCompact) {
      const row =
        commaCompact[1].toUpperCase();

      const numbers =
        value
          .slice(commaCompact[0].indexOf(commaCompact[1]) + 1)
          .match(/\d{1,2}/g) || [];

      for (const number of numbers) {
        seats.push(
          `${row}${Number(number)}`
        );
      }

      return seats;
    }

    // -------------------------------------------------------
    // F1 F2 / F1,F2
    // -------------------------------------------------------

    const individual =
      value.match(
        /[A-M]\d{1,2}/gi
      ) || [];

    return individual.map(
      seat => seat.toUpperCase()
    );
  };

  // =========================================================
  // 4. หา Seat candidates
  // =========================================================

  const seatCandidates = [];

  const addCandidate = (
    expression,
    source,
    position = 0
  ) => {
    const seats =
      expandSeatExpression(expression);

    if (!seats.length) {
      return;
    }

    const uniqueSeats = [
      ...new Set(seats)
    ];

    // ถ้ามี seat map ให้ใช้เป็น validation
    if (knownSeats.size) {
      const validSeats =
        uniqueSeats.filter(seat =>
          knownSeats.has(seat)
        );

      if (!validSeats.length) {
        return;
      }

      seatCandidates.push({
        seats: validSeats,
        source,
        position
      });

      return;
    }

    seatCandidates.push({
      seats: uniqueSeats,
      source,
      position
    });
  };

  // ---------------------------------------------------------
  // 4.1 Range เช่น B7-B12 / G7-G8 / A11-A12
  // ---------------------------------------------------------

  for (const match of compact.matchAll(
    /\b([A-M]\d{1,2}\s*[-–—−]\s*[A-M]?\d{1,2})\b/gi
  )) {
    addCandidate(
      match[1],
      'range',
      match.index || 0
    );
  }

  // ---------------------------------------------------------
  // 4.2 Comma เช่น B5,6,7,8
  // ---------------------------------------------------------

  for (const match of compact.matchAll(
    /\b([A-M]\d{1,2}(?:\s*,\s*\d{1,2})+)\b/gi
  )) {
    addCandidate(
      match[1],
      'comma',
      match.index || 0
    );
  }

  // ---------------------------------------------------------
  // 4.3 Explicit seat clusters เช่น F1 F2 / C5
  // ---------------------------------------------------------

  for (const match of compact.matchAll(
    /\b([A-M]\d{1,2}(?:\s+[A-M]\d{1,2})+)\b/gi
  )) {
    addCandidate(
      match[1],
      'cluster',
      match.index || 0
    );
  }

  // ---------------------------------------------------------
  // 4.4 Seat เดี่ยว
  // ---------------------------------------------------------

  for (const match of compact.matchAll(
    /\b([A-M]\d{1,2})\b/gi
  )) {
    const seat =
      match[1].toUpperCase();

    // ถ้ามี seat map ต้องเป็น seat ที่มีจริง
    if (
      knownSeats.size &&
      !knownSeats.has(seat)
    ) {
      continue;
    }

    addCandidate(
      seat,
      'single',
      match.index || 0
    );
  }

  // =========================================================
  // 5. เลือก Seat candidate ที่ดีที่สุด
  // =========================================================

  if (seatCandidates.length) {
    const scoreCandidate = candidate => {
      let score = 0;

      if (
        candidate.source === 'range'
      ) {
        score += 50;
      }

      if (
        candidate.source === 'comma'
      ) {
        score += 45;
      }

      if (
        candidate.source === 'cluster'
      ) {
        score += 40;
      }

      if (
        candidate.source === 'single'
      ) {
        score += 10;
      }

      // อยู่ใกล้คำว่า "ที่นั่ง"
      const contextStart =
        Math.max(
          0,
          candidate.position - 20
        );

      const context =
        compact.slice(
          contextStart,
          candidate.position + 80
        );

      if (
        /ที่นั่ง|โซน/i.test(context)
      ) {
        score += 100;
      }

      // อยู่ใกล้คำว่า "ใบ"
      if (
        /ใบ/.test(context)
      ) {
        score += 30;
      }

      // ตรงกับ seat map มากขึ้น
      if (knownSeats.size) {
        score +=
          candidate.seats.length * 5;
      }

      return score;
    };

    const ranked =
      [...seatCandidates].sort(
        (a, b) =>
          scoreCandidate(b) -
          scoreCandidate(a)
      );

    const best =
      ranked[0];

    if (best?.seats?.length) {
      result.seats = [
        ...new Set(best.seats)
      ];

      result.quantity =
        String(result.seats.length);
    }
  }

  // =========================================================
  // 6. จำนวนบัตร
  // =========================================================

  // ถ้ายังหา seat ไม่ได้ ลองอ่าน "X ใบ"
  if (!result.seats.length) {
    const quantityMatch =
      compact.match(
        /\b(\d{1,2})\s*ใบ\b/i
      );

    if (quantityMatch) {
      result.quantity =
        String(
          Number(quantityMatch[1])
        );
    }
  }

  // =========================================================
  // 7. Zone จาก Supabase
  // =========================================================

  if (
    result.seats.length &&
    seatRows.length
  ) {
    const matchingRows =
      seatRows.filter(seat => {
        const rowDate =
          String(
            seat?.date_label ??
            seat?.date ??
            ''
          ).trim();

        const rowTime =
          normalizeTime(
            seat?.time
          );

        return (
          (!result.date ||
            rowDate === result.date) &&
          (!result.time ||
            rowTime === result.time)
        );
      });

    const zones =
      result.seats
        .map(code => {
          const found =
            matchingRows.find(seat => {
              const seatCode =
                String(
                  seat?.seat_code ??
                  seat?.seatCode ??
                  seat?.code ??
                  seat?.seat ??
                  ''
                )
                  .trim()
                  .toUpperCase();

              return (
                seatCode === code
              );
            });

          return found
            ? String(
                found?.zone ??
                found?.Zone ??
                ''
              )
                .trim()
                .toUpperCase()
            : '';
        })
        .filter(Boolean);

    const uniqueZones = [
      ...new Set(zones)
    ];

    if (uniqueZones.length) {
      result.zone =
        uniqueZones.join(', ');
    }
  }

  // =========================================================
  // 8. ไม่ OCR ข้อมูลอื่น
  // =========================================================

  result.name = '';
  result.phone = '';
  result.bookingId = '';
  result.venue = '';

  return result;
}

async function ocrImage(image, seatRows = []) {
  if (!image || typeof image !== 'string') {
    throw new Error('ไม่พบรูปสำหรับ OCR');
  }

  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image
    })
  });

  const raw = await res.text();

  let data = {};

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `OCR server ตอบกลับไม่ใช่ JSON (HTTP ${res.status})`
      );
    }
  }

  if (!res.ok) {
    throw new Error(
      data.error || `OCR ไม่สำเร็จ (HTTP ${res.status})`
    );
  }

  return parseOCRText(
    data.text || '',
    seatRows
  );
}

export default function App() {
  const [activeTab, setActiveTab] =
    useState('list');

  const [bookings, setBookings] =
    useState([]);

  const [shows, setShows] =
    useState([]);

  const [seats, setSeats] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [online, setOnline] =
    useState(false);

  const [syncing, setSyncing] =
    useState(false);

  const [processingOCR, setProcessingOCR] =
    useState(false);

  const [ocrModal, setOcrModal] =
    useState(null);

  const [search, setSearch] =
    useState('');

  const [filterStatus, setFilterStatus] =
    useState('all');

  const [filterDate, setFilterDate] =
    useState('all');

  const [filterTime, setFilterTime] =
    useState('all');

  const [viewImage, setViewImage] =
    useState(null);

  const [editing, setEditing] =
    useState(null);

  const [deleteId, setDeleteId] =
    useState(null);

  const [assigning, setAssigning] =
    useState(null);

  const [selectedSeatIds, setSelectedSeatIds] =
    useState([]);

  const [originalSeatIds, setOriginalSeatIds] =
    useState([]);

  const [requestedSeats, setRequestedSeats] =
    useState([]);

  const [currentDate, setCurrentDate] =
    useState(DATES[0]);

  const [currentRound, setCurrentRound] =
    useState(
      ROUND_OPTIONS[DATES[0]][0]
    );

  const [currentZone, setCurrentZone] =
    useState('A');

  const [saveStatus, setSaveStatus] =
    useState('idle');

  const [error, setError] =
    useState('');

  const inputRef = useRef(null);
  // Booking Glass Physical Physics V2
  const bookingPhysicsRef = useRef(new globalThis.Map());

  const handleBookingPointerMove = (event, id) => {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();

    let state = bookingPhysicsRef.current.get(id);

    if (!state) {
      state = {
        targetX: 0,
        targetY: 0,
        currentX: 0,
        currentY: 0,
        targetLift: 0,
        currentLift: 0,
        targetShadowX: 0,
        targetShadowY: 8,
        currentShadowX: 0,
        currentShadowY: 8,
        raf: null,
        active: false
      };

      bookingPhysicsRef.current.set(id, state);
    }

    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;

    // Physical force from pointer position.
    // Keep the movement restrained so the card feels heavy rather than floaty.
    state.targetY = (px - 0.5) * 5.5;
    state.targetX = -(py - 0.5) * 5.5;

    // Small vertical lift creates the sense that the card has weight.
    state.targetLift = 4;

    // Shadow moves opposite the tilt and grows slightly while lifted.
    state.targetShadowX = -(px - 0.5) * 10;
    state.targetShadowY = 11 + Math.abs(py - 0.5) * 3;

    state.active = true;

    if (state.raf) return;

    const animate = () => {
      const rotateDX = state.targetX - state.currentX;
      const rotateDY = state.targetY - state.currentY;
      const liftD = state.targetLift - state.currentLift;
      const shadowDX =
        state.targetShadowX - state.currentShadowX;
      const shadowDY =
        state.targetShadowY - state.currentShadowY;

      // Different response speeds give the card a heavier physical feel.
      state.currentX += rotateDX * 0.105;
      state.currentY += rotateDY * 0.105;
      state.currentLift += liftD * 0.085;
      state.currentShadowX += shadowDX * 0.10;
      state.currentShadowY += shadowDY * 0.10;

      card.style.setProperty(
        '--glass-rx',
        `${state.currentX}deg`
      );

      card.style.setProperty(
        '--glass-ry',
        `${state.currentY}deg`
      );

      card.style.setProperty(
        '--glass-lift',
        `${state.currentLift}px`
      );

      card.style.setProperty(
        '--glass-shadow-x',
        `${state.currentShadowX}px`
      );

      card.style.setProperty(
        '--glass-shadow-y',
        `${state.currentShadowY}px`
      );

      if (
        state.active ||
        Math.abs(rotateDX) > 0.01 ||
        Math.abs(rotateDY) > 0.01 ||
        Math.abs(liftD) > 0.01 ||
        Math.abs(shadowDX) > 0.02 ||
        Math.abs(shadowDY) > 0.02
      ) {
        state.raf = requestAnimationFrame(animate);
      } else {
        state.raf = null;
      }
    };

    state.raf = requestAnimationFrame(animate);
  };

  const handleBookingPointerLeave = (event, id) => {
    const card = event.currentTarget;
    const state = bookingPhysicsRef.current.get(id);

    if (!state) return;

    state.targetX = 0;
    state.targetY = 0;
    state.targetLift = 0;
    state.targetShadowX = 0;
    state.targetShadowY = 8;
    state.active = false;

    if (state.raf) return;

    const animate = () => {
      const rotateDX = -state.currentX;
      const rotateDY = -state.currentY;
      const liftD = -state.currentLift;
      const shadowDX = -state.currentShadowX;
      const shadowDY = 8 - state.currentShadowY;

      state.currentX += rotateDX * 0.075;
      state.currentY += rotateDY * 0.075;
      state.currentLift += liftD * 0.065;
      state.currentShadowX += shadowDX * 0.075;
      state.currentShadowY += shadowDY * 0.075;

      card.style.setProperty(
        '--glass-rx',
        `${state.currentX}deg`
      );

      card.style.setProperty(
        '--glass-ry',
        `${state.currentY}deg`
      );

      card.style.setProperty(
        '--glass-lift',
        `${state.currentLift}px`
      );

      card.style.setProperty(
        '--glass-shadow-x',
        `${state.currentShadowX}px`
      );

      card.style.setProperty(
        '--glass-shadow-y',
        `${state.currentShadowY}px`
      );

      if (
        Math.abs(state.currentX) > 0.01 ||
        Math.abs(state.currentY) > 0.01 ||
        Math.abs(state.currentLift) > 0.01 ||
        Math.abs(state.currentShadowX) > 0.02 ||
        Math.abs(shadowDY) > 0.02
      ) {
        state.raf = requestAnimationFrame(animate);
      } else {
        state.currentX = 0;
        state.currentY = 0;
        state.currentLift = 0;
        state.currentShadowX = 0;
        state.currentShadowY = 8;
        state.raf = null;
      }
    };

    state.raf = requestAnimationFrame(animate);
  };


  const seatMapViewportRef = useRef(null);
  const seatMapSurfaceRef = useRef(null);

  const [uploadMode, setUploadMode] = useState(null);

  const statusTimer = useRef(null);

  const flash = s => {
    setSaveStatus(s);

    if (statusTimer.current) {
      clearTimeout(
        statusTimer.current
      );
    }

    if (s !== 'saving') {
      statusTimer.current =
        setTimeout(
          () =>
            setSaveStatus('idle'),
          2200
        );
    }
  };

  const loadData = async () => {
    if (!supabaseConfigured) {
      setError(
        'ยังไม่ได้ตั้งค่า Supabase: ใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY'
      );

      setLoading(false);

      return;
    }

    setSyncing(true);

    const [
      {
        data: b,
        error: be
      },
      {
        data: s,
        error: se
      },
      {
        data: sh,
        error: she
      }
    ] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          *,
          booking_seats(
            seat_id,
            seats(
              seat_code,
              zone,
              row_label,
              number
            )
          ),
          booking_slips(
            id,
            storage_path,
            created_at
          )
        `)
        .order(
          'created_at',
          { ascending: false }
        ),

      supabase
        .from('seats')
        .select('*')
        .order('zone')
        .order('row_label')
        .order('number'),

      supabase
        .from('shows')
        .select('*')
        .order('sort_order')
    ]);

    if (be || se || she) {
      setError(
        errorText(
          be || se || she
        )
      );

      setOnline(false);
    } else {
      setBookings(b || []);

      setSeats(s || []);

      setShows(sh || []);

      setOnline(true);

      setError('');
    }

    setLoading(false);

    setSyncing(false);
  };

  useEffect(() => {
    loadData();

    if (!supabaseConfigured) {
      return;
    }

    const channel =
      supabase
        .channel(
          'event-manager-live'
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings'
          },
          loadData
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'booking_seats'
          },
          loadData
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'seats'
          },
          loadData
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shows'
          },
          loadData
        )

        .subscribe(status =>
          setOnline(
            status === 'SUBSCRIBED'
          )
        );

    return () => {
      supabase.removeChannel(
        channel
      );

      if (statusTimer.current) {
        clearTimeout(
          statusTimer.current
        );
      }
    };
  }, []);

  const seatMap = useMemo(() => {
    const map = {};

    seats.forEach(s => {
      map[s.id] = {
        ...s,
        status:
          s.status ||
          'available'
      };
    });

    bookings.forEach(b => {
      const state =
        b.status === 'checked_in'
          ? 'checked_in'
          : 'sold';

      (b.booking_seats || [])
        .forEach(bs => {
          if (
            bs.seat_id &&
            map[bs.seat_id]
          ) {
            map[
              bs.seat_id
            ].status = state;
          }
        });
    });

    return map;
  }, [
    seats,
    bookings
  ]);

  const seatsForCurrent =
    useMemo(
      () =>
        Object.values(
          seatMap
        ).filter(
          s =>
            s.date_label ===
              currentDate &&
            s.time ===
              currentRound &&
            s.zone ===
              currentZone
        ),
      [
        seatMap,
        currentDate,
        currentRound,
        currentZone
      ]
    );

  const seatByCode =
    useMemo(
      () =>
        Object.fromEntries(
          seatsForCurrent.map(
            s => [
              s.seat_code,
              s
            ]
          )
        ),
      [seatsForCurrent]
    );

  const assigningBooking =
    assigning
      ? bookings.find(
          b =>
            b.id ===
            assigning
        )
      : null;

  const assignedCodes =
    useMemo(
      () =>
        assigningBooking
          ?.booking_seats
          ?.map(
            x =>
              x.seats
                ?.seat_code
          )
          .filter(Boolean) ||
        [],
      [assigningBooking]
    );

  const mapSummary =
    useMemo(() => {
      const c = {
        available: 0,
        sold: 0,
        checked_in: 0,
        blocked: 0
      };

      seatsForCurrent.forEach(
        s => {
          if (
            c[s.status] !==
            undefined
          ) {
            c[s.status]++;
          }
        }
      );

      return c;
    }, [seatsForCurrent]);

  const unavailableCount =
    mapSummary.sold +
    mapSummary.checked_in;

  const filtered =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      return bookings
        .filter(b => {
          const codes =
            (b.booking_seats ||
              [])
              .map(
                x =>
                  x.seats
                    ?.seat_code ||
                  ''
              );

          const hit =
            !q ||
            [
              b.name,
              b.booking_id,
              b.phone,
              ...codes
            ].some(v =>
              String(
                v || ''
              )
                .toLowerCase()
                .includes(q)
            );

          return (
            hit &&
            (
              filterStatus ===
                'all' ||
              b.status ===
                filterStatus
            ) &&
            (
              filterDate ===
                'all' ||
              b.date_label ===
                filterDate
            ) &&
            (
              filterTime ===
                'all' ||
              b.time ===
                filterTime
            )
          );
        })
        .sort(
          (a, b) =>
            `${
              a.date_label ||
              ''
            }${
              a.time || ''
            }${
              a.name || ''
            }`.localeCompare(
              `${
                b.date_label ||
                ''
              }${
                b.time || ''
              }${
                b.name || ''
              }`
            )
        );
    }, [
      bookings,
      search,
      filterStatus,
      filterDate,
      filterTime
    ]);

  const upload = async e => {
    const files =
      Array.from(
        e.target.files || []
      );

    if (!files.length) {
      return;
    }

    const mode =
      uploadMode;

    setError('');

    if (mode === 'ocr') {
      setProcessingOCR(true);
    }

    try {
      const selectedFiles =
        files.slice(0, 8);

      const images =
        await Promise.all(
          selectedFiles.map(
            compressImage
          )
        );

      if (mode === 'manual') {
        setOcrModal({
          images,
          formData: {
            ...EMPTY_FORM,
            quantity:
              String(
                selectedFiles.length ||
                1
              )
          }
        });

        return;
      }

      const forms = [];

      for (
        const image of images
      ) {
        try {
          forms.push(
            await ocrImage(
              image,
              seats
            )
          );
        } catch (err) {
          forms.push({
            ...EMPTY_FORM
          });

          setError(
            errorText(err)
          );
        }
      }

      const merged =
        forms.reduce(
          (a, b) => ({
            ...a,
            ...Object.fromEntries(
              Object.entries(
                b
              ).filter(
                ([key, v]) =>
                  key !== 'seats' &&
                  v
              )
            ),
            seats: [
              ...new Set([
                ...(a.seats || []),
                ...(b.seats || [])
              ])
            ]
          }),
          {
            ...EMPTY_FORM,
            seats: []
          }
        );

      const quantity =
        Number(
          merged.quantity
        ) ||
        selectedFiles.length ||
        1;

      setOcrModal({
        images,
        formData: {
          ...merged,
          quantity:
            String(quantity)
        }
      });
    } catch (err) {
      setError(
        errorText(err)
      );
    } finally {
      setProcessingOCR(
        false
      );

      setUploadMode(null);

      if (inputRef.current) {
        inputRef.current.value =
          '';
      }
    }
  };

  const saveBooking = async () => {
    if (!ocrModal || !supabase) {
      return;
    }

    const f =
      ocrModal.formData;

    const show =
      shows.find(
        x =>
          x.date_label ===
            f.date &&
          x.time ===
            f.time
      );

    if (!show) {
      setError(
        'ไม่พบรอบการแสดงนี้ในฐานข้อมูล'
      );

      return;
    }

    if (
      !f.name?.trim() ||
      !f.date ||
      !f.time ||
      !Number(f.quantity)
    ) {
      setError(
        'กรุณากรอกชื่อ วันที่ รอบ และจำนวนบัตร'
      );

      return;
    }

    flash('saving');

    setError('');

    let booking = null;

    try {
      const {
        data: createdBooking,
        error: bookingError
      } =
        await supabase
          .from('bookings')
          .insert({
            name:
              f.name.trim(),

            phone:
              f.phone?.trim() ||
              '',

            date_label:
              f.date,

            time:
              f.time,

            show_id:
              show.id,

            venue:
              f.venue?.trim() ||
              '',

            zone:
              f.zone
                ?.trim()
                .toUpperCase() ||
              '',

            quantity:
              Number(
                f.quantity
              ),

            requested_seats:
              Array.isArray(
                f.seats
              )
                ? f.seats
                : [],

            booking_id:
              f.bookingId
                ?.trim() ||
              null,

            status:
              'pending'
          })
          .select()
          .single();

      if (bookingError) {
        throw new Error(
          `บันทึกข้อมูลการจองไม่สำเร็จ: ${bookingError.message}`
        );
      }

      booking =
        createdBooking;

      for (
        const image of
          ocrModal.images
      ) {
        const fileId =
          createSafeId();

        const path =
          `${booking.id}/${fileId}.jpg`;

        const blob =
          dataUrlToBlob(
            image
          );

        const {
          error: uploadError
        } =
          await supabase
            .storage
            .from('slips')
            .upload(
              path,
              blob,
              {
                contentType:
                  'image/jpeg',

                upsert:
                  false
              }
            );

        if (uploadError) {
          throw new Error(
            `อัปโหลดรูปสลิปไม่สำเร็จ: ${uploadError.message}`
          );
        }

        const {
          error: slipError
        } =
          await supabase
            .from(
              'booking_slips'
            )
            .insert({
              booking_id:
                booking.id,

              storage_path:
                path
            });

        if (slipError) {
          throw new Error(
            `บันทึกข้อมูลสลิปไม่สำเร็จ: ${slipError.message}`
          );
        }
      }

      setOcrModal(null);

      flash('saved');

      await loadData();

      startAssign(
        booking
      );
    } catch (err) {
      console.error(
        'SAVE BOOKING ERROR:',
        err
      );

      if (booking?.id) {
        try {
          const {
            error: cleanupError
          } =
            await supabase
              .from(
                'bookings'
              )
              .delete()
              .eq(
                'id',
                booking.id
              );

          if (cleanupError) {
            console.error(
              'CLEANUP BOOKING ERROR:',
              cleanupError
            );
          }
        } catch (
          cleanupError
        ) {
          console.error(
            'CLEANUP ERROR:',
            cleanupError
          );
        }
      }

      flash('error');

      setError(
        errorText(err)
      );
    }
  };

  const startAssign = b => {
    const date =
      DATES.includes(
        b.date_label
      )
        ? b.date_label
        : DATES[0];

    const availableRounds =
      ROUND_OPTIONS[
        date
      ] || [];

    const time =
      availableRounds.includes(
        b.time
      )
        ? b.time
        : availableRounds[0];

    setCurrentDate(
      date
    );

    setCurrentRound(
      time
    );

    setCurrentZone(
      ZONES.includes(
        b.zone
      )
        ? b.zone
        : 'A'
    );

    setAssigning(
      b.id
    );

    setRequestedSeats(
      Array.isArray(
        b.requested_seats
      )
        ? b.requested_seats
        : []
    );

    const originalIds =
      (b.booking_seats || [])
        .map(
          x => x.seat_id
        )
        .filter(Boolean);

    setOriginalSeatIds(
      originalIds
    );

    setSelectedSeatIds(
      originalIds
    );

    setActiveTab(
      'map'
    );
  };

  const toggleSeat = seat => {
    if (!assigningBooking) {
      return;
    }

    const isOwnSeat =
      selectedSeatIds.includes(
        seat.id
      ) ||
      assignedCodes.includes(
        seat.seat_code
      );

    if (isOwnSeat) {
      setSelectedSeatIds(
        prev =>
          prev.filter(
            id =>
              id !== seat.id
          )
      );

      return;
    }

    if (
      seat.status ===
        'sold' ||
      seat.status ===
        'checked_in' ||
      seat.status ===
        'blocked'
    ) {
      return;
    }

    setSelectedSeatIds(
      prev =>
        prev.length <
          Number(
            assigningBooking.quantity
          )
          ? [
              ...prev,
              seat.id
            ]
          : prev
    );
  };

  const confirmSeats =
    async () => {
      if (
        !assigningBooking ||
        !supabase
      ) {
        return;
      }

      if (
        selectedSeatIds.length !==
        Number(
          assigningBooking.quantity
        )
      ) {
        setError(
          `ต้องเลือกที่นั่งให้ครบ ${assigningBooking.quantity} ที่นั่ง`
        );

        return;
      }

      flash('saving');

      setError('');

      const {
        error: e
      } =
        await supabase.rpc(
          'assign_booking_seats',
          {
            p_booking_id:
              assigningBooking.id,

            p_seat_ids:
              selectedSeatIds
          }
        );

      if (e) {
        flash('error');

        setError(
          e.message?.includes(
            'already assigned'
          )
            ? 'มีคนอื่นเลือกที่นั่งบางที่ไปแล้ว กรุณาโหลดใหม่และเลือกอีกครั้ง'
            : errorText(e)
        );

        return;
      }

      setAssigning(
        null
      );

      setSelectedSeatIds(
        []
      );

      setOriginalSeatIds(
        []
      );

      flash('saved');

      await loadData();
    };

  const toggleBlock =
    async seat => {
      if (
        !supabase ||
        seat.status ===
          'sold' ||
        seat.status ===
          'checked_in'
      ) {
        return;
      }

      flash('saving');

      const next =
        seat.status ===
          'blocked'
          ? 'available'
          : 'blocked';

      const {
        error: e
      } =
        await supabase
          .from('seats')
          .update({
            status: next
          })
          .eq(
            'id',
            seat.id
          );

      if (e) {
        flash('error');

        setError(
          errorText(e)
        );
      } else {
        flash('saved');

        await loadData();
      }
    };

  const toggleCheckin =
    async b => {
      if (!supabase) {
        return;
      }

      flash('saving');

      const next =
        b.status ===
          'checked_in'
          ? 'pending'
          : 'checked_in';

      const {
        error: e
      } =
        await supabase
          .from('bookings')
          .update({
            status: next,

            updated_at:
              new Date()
                .toISOString()
          })
          .eq(
            'id',
            b.id
          );

      if (e) {
        flash('error');

        setError(
          errorText(e)
        );
      } else {
        flash('saved');

        await loadData();
      }
    };

  const saveEdit =
    async () => {
      if (
        !editing ||
        !supabase
      ) {
        return;
      }

      flash('saving');

      const f =
        editing;

      const show =
        shows.find(
          x =>
            x.date_label ===
              f.date &&
            x.time ===
              f.time
        );

      if (!show) {
        flash('error');

        setError(
          'ไม่พบรอบการแสดงนี้'
        );

        return;
      }

      const old =
        bookings.find(
          b =>
            b.id ===
            f.id
        );

      const assignedCount =
        (
          old?.booking_seats ||
          []
        ).length;

      if (
        assignedCount >
        (
          Number(
            f.quantity
          ) || 1
        )
      ) {
        flash('error');

        setError(
          `จำนวนบัตรใหม่ต้องไม่น้อยกว่าที่นั่งที่เลือกอยู่ ${assignedCount} ที่นั่ง`
        );

        return;
      }

      if (
        old?.show_id !==
          show.id &&
        assignedCount
      ) {
        flash('error');

        setError(
          'รายการนี้มีที่นั่งอยู่แล้ว กรุณาเปลี่ยน/ยกเลิกที่นั่งก่อนเปลี่ยนรอบการแสดง'
        );

        return;
      }

      const {
        error: e
      } =
        await supabase
          .from('bookings')
          .update({
            name:
              f.name,

            phone:
              f.phone,

            date_label:
              f.date,

            time:
              f.time,

            show_id:
              show.id,

            venue:
              f.venue,

            zone:
              f.zone,

            quantity:
              Number(
                f.quantity
              ) || 1,

            booking_id:
              f.bookingId ||
              null,

            updated_at:
              new Date()
                .toISOString()
          })
          .eq(
            'id',
            f.id
          );

      if (e) {
        flash('error');

        setError(
          errorText(e)
        );
      } else {
        setEditing(
          null
        );

        flash('saved');

        await loadData();
      }
    };

  const deleteBooking =
    async () => {
      if (
        !deleteId ||
        !supabase
      ) {
        return;
      }

      flash('saving');

      const {
        error: e
      } =
        await supabase
          .from('bookings')
          .delete()
          .eq(
            'id',
            deleteId
          );

      if (e) {
        flash('error');

        setError(
          errorText(e)
        );
      } else {
        setDeleteId(
          null
        );

        flash('saved');

        await loadData();
      }
    };

  const openSlip =
    async b => {
      const slip =
        b.booking_slips?.[0];

      if (
        !slip?.storage_path
      ) {
        setError(
          'ไม่พบไฟล์สลิปของรายการนี้'
        );

        return;
      }

      const {
        data
      } =
        supabase
          .storage
          .from('slips')
          .getPublicUrl(
            slip.storage_path
          );

      if (
        !data?.publicUrl
      ) {
        setError(
          'ไม่สามารถสร้างลิงก์รูปสลิปได้'
        );

        return;
      }

      setViewImage(
        data.publicUrl
      );
    };

  const fieldGrid = (
    data,
    onChange,
    highlight = false
  ) =>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {FIELDS.map(
        ([
          label,
          key,
          placeholder
        ]) => {
          const cls =
            `px-4 py-2.5 rounded-xl border focus:ring-2 focus:outline-none ${
              highlight &&
              !data[key]
                ? 'bg-red-50 border-red-200 focus:ring-red-500'
                : 'bg-white border-gray-300 focus:ring-blue-500'
            }`;

          if (key === 'date') {
            return (
              <div
                key={key}
                className="flex flex-col"
              >
                <label className="text-xs font-bold text-gray-500 mb-1">
                  {label}
                </label>

                <select
                  value={
                    data.date ||
                    ''
                  }
                  onChange={e => {
                    onChange(
                      'date',
                      e.target.value
                    );

                    const r =
                      ROUND_OPTIONS[
                        e.target.value
                      ] || [];

                    if (
                      !r.includes(
                        data.time
                      )
                    ) {
                      onChange(
                        'time',
                        r[0] || ''
                      );
                    }
                  }}
                  className={cls}
                >
                  <option value="">
                    เลือกวันที่
                  </option>

                  {DATES.map(
                    d => (
                      <option
                        key={d}
                        value={d}
                      >
                        {d}
                      </option>
                    )
                  )}
                </select>
              </div>
            );
          }

          if (key === 'time') {
            return (
              <div
                key={key}
                className="flex flex-col"
              >
                <label className="text-xs font-bold text-gray-500 mb-1">
                  {label}
                </label>

                <select
                  value={
                    data.time ||
                    ''
                  }
                  onChange={e =>
                    onChange(
                      'time',
                      e.target.value
                    )
                  }
                  disabled={
                    !data.date
                  }
                  className={cls}
                >
                  <option value="">
                    เลือกรอบ
                  </option>

                  {(
                    ROUND_OPTIONS[
                      data.date
                    ] || []
                  ).map(t => (
                    <option
                      key={t}
                      value={t}
                    >
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div
              key={key}
              className="flex flex-col"
            >
              <label className="text-xs font-bold text-gray-500 mb-1">
                {label}
              </label>

              <input
                type="text"
                value={
                  data[key] || ''
                }
                onChange={e =>
                  onChange(
                    key,
                    e.target.value
                  )
                }
                placeholder={
                  placeholder
                }
                className={cls}
              />
            </div>
          );
        }
      )}
    </div>;

  /*
   * ============================================================
   * LIST VIEW
   * ============================================================
   */

  const listView =
    <div className="space-y-6">

      {/* ACTION BAR */}
      <div className="relative rounded-[24px] border border-white/70 dark:border-white/10 bg-white/[0.72] dark:bg-white/[0.055] backdrop-blur-[24px] backdrop-saturate-[160%] shadow-[0_10px_30px_-18px_rgba(0,0,0,0.18)] dark:shadow-[0_16px_34px_-18px_rgba(0,0,0,0.55)] p-4">
        <div className="pointer-events-none absolute inset-[1px] rounded-[23px] border border-white/60 dark:border-white/10" />
        <div className="relative z-10 flex flex-col md:flex-row gap-3">

          <button
            type="button"
            onClick={() =>
              setUploadMode('choose')
            }
            disabled={processingOCR}
            className="group w-full md:w-auto px-5 py-3 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center gap-2 shadow-[0_8px_18px_-10px_rgba(37,99,235,0.65)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:shadow-[0_14px_24px_-11px_rgba(37,99,235,0.7)] active:translate-y-[1px] disabled:opacity-50"
          >
            {processingOCR ? (
              <>
                <Loader2
                  size={19}
                  className="animate-spin"
                />
                กำลังอ่านสลิป...
              </>
            ) : (
              <>
                <Upload size={19} />
                + เพิ่มสลิป
              </>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={upload}
          />

          <button
            type="button"
            onClick={loadData}
            disabled={syncing}
            className="w-full md:w-auto px-5 py-3 rounded-xl bg-gray-100 dark:bg-white/[0.07] text-gray-700 dark:text-gray-200 font-bold flex items-center justify-center gap-2 border border-transparent dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/[0.11] disabled:opacity-50 transition-colors duration-200"
          >
            <RefreshCw
              size={18}
              className={
                syncing
                  ? 'animate-spin'
                  : ''
              }
            />

            รีเฟรชข้อมูล
          </button>

        </div>
      </div>

      {uploadMode === 'choose' && (
        <div className="relative overflow-hidden rounded-[26px] border border-white/75 dark:border-white/10 bg-white/[0.62] dark:bg-[#17191d]/[0.72] backdrop-blur-[30px] backdrop-saturate-[175%] shadow-[0_22px_55px_-28px_rgba(0,0,0,0.30)] dark:shadow-[0_24px_60px_-28px_rgba(0,0,0,0.65)] p-5 transition-[transform,box-shadow,background-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.10) 24%, transparent 48%, rgba(255,255,255,0.08) 100%)'
            }}
          />
          <div className="pointer-events-none absolute inset-[1px] rounded-[25px] border border-white/55 dark:border-white/[0.08]" />
          <div className="relative z-10">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              เลือกวิธีเพิ่มสลิป
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              เลือกว่าจะให้ระบบอ่านข้อมูลจากสลิป หรือกรอกข้อมูลเอง
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setUploadMode('ocr');
                setTimeout(() => {
                  inputRef.current?.click();
                }, 0);
              }}
              className="group p-5 rounded-[20px] border border-blue-200/70 dark:border-blue-400/20 bg-blue-500/[0.075] dark:bg-blue-400/[0.075] text-left transition-[transform,box-shadow,background-color,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] hover:border-blue-300 dark:hover:border-blue-400/35 hover:bg-blue-500/[0.11] dark:hover:bg-blue-400/[0.12] hover:shadow-[0_14px_28px_-18px_rgba(37,99,235,0.38)] active:translate-y-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Upload size={21} className="shrink-0" />
                </div>

                <div>
                  <div className="font-bold text-gray-900 dark:text-white">
                    อัปโหลดแล้วสแกน
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ให้ OCR อ่านข้อมูลจากสลิปอัตโนมัติ
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setUploadMode('manual');
                setTimeout(() => {
                  inputRef.current?.click();
                }, 0);
              }}
              className="group p-5 rounded-[20px] border border-gray-200/80 dark:border-white/10 bg-white/[0.30] dark:bg-white/[0.035] text-left transition-[transform,box-shadow,background-color,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] hover:border-gray-300 dark:hover:border-white/20 hover:bg-white/[0.48] dark:hover:bg-white/[0.07] hover:shadow-[0_14px_28px_-18px_rgba(0,0,0,0.22)] dark:hover:shadow-[0_16px_30px_-18px_rgba(0,0,0,0.50)] active:translate-y-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gray-700 text-white flex items-center justify-center">
                  <Edit3 size={21} className="shrink-0" />
                </div>

                <div>
                  <div className="font-bold text-gray-900 dark:text-white">
                    อัปโหลดแล้วกรอกเอง
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ไม่ใช้ OCR และกรอกข้อมูลด้วยตัวเอง
                  </div>
                </div>
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setUploadMode(null)}
            className="mt-3 w-full py-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors duration-200"
          >
            ยกเลิก
          </button>
          </div>
        </div>
      )}

      {/* SEARCH AND FILTER */}
      <div className="bg-white rounded-2xl shadow-sm border p-4">

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              type="text"
              value={search}
              onChange={e =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="ค้นหาชื่อ / Booking ID / เบอร์ / ที่นั่ง"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filterDate}
            onChange={e =>
              setFilterDate(
                e.target.value
              )
            }
            className="px-4 py-3 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">
              ทุกวันที่
            </option>

            {DATES.map(d => (
              <option
                key={d}
                value={d}
              >
                {d}
              </option>
            ))}
          </select>

          <select
            value={filterTime}
            onChange={e =>
              setFilterTime(
                e.target.value
              )
            }
            className="px-4 py-3 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">
              ทุกรอบ
            </option>

            {[
              ...new Set(
                Object.values(
                  ROUND_OPTIONS
                ).flat()
              )
            ].map(t => (
              <option
                key={t}
                value={t}
              >
                รอบ {t} น.
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={e =>
              setFilterStatus(
                e.target.value
              )
            }
            className="px-4 py-3 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">
              ทุกสถานะ
            </option>

            <option value="pending">
              รอรับบัตร
            </option>

            <option value="checked_in">
              รับบัตรแล้ว
            </option>
          </select>

        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">

          <div>
            แสดง{' '}
            <b className="text-gray-900">
              {filtered.length}
            </b>{' '}
            รายการ

            {bookings.length !==
              filtered.length && (
              <>
                {' '}จาก{' '}
                <b className="text-gray-900">
                  {bookings.length}
                </b>{' '}
                รายการ
              </>
            )}
          </div>

          {(
            search ||
            filterStatus !==
              'all' ||
            filterDate !==
              'all' ||
            filterTime !==
              'all'
          ) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilterStatus(
                  'all'
                );
                setFilterDate(
                  'all'
                );
                setFilterTime(
                  'all'
                );
              }}
              className="text-blue-600 font-bold hover:underline"
            >
              ล้างตัวกรอง
            </button>
          )}

        </div>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            รายการทั้งหมด
          </div>

          <div className="text-2xl font-black text-gray-900 mt-1">
            {bookings.length}
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            กำลังรอรับบัตร
          </div>

          <div className="text-2xl font-black text-amber-600 mt-1">
            {
              bookings.filter(
                b =>
                  b.status !==
                  'checked_in'
              ).length
            }
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            รับบัตรแล้ว
          </div>

          <div className="text-2xl font-black text-green-600 mt-1">
            {
              bookings.filter(
                b =>
                  b.status ===
                  'checked_in'
              ).length
            }
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            จำนวนบัตรทั้งหมด
          </div>

          <div className="text-2xl font-black text-blue-600 mt-1">
            {bookings.reduce(
              (sum, b) =>
                sum +
                (Number(
                  b.quantity
                ) || 0),
              0
            )}
          </div>
        </div>

      </div>

      {/* BOOKING LIST */}
      <div className="relative space-y-4 rounded-[32px] p-3 md:p-4 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 520px 360px at 8% 12%, rgba(120,160,255,0.13), transparent 70%), radial-gradient(ellipse 460px 340px at 92% 76%, rgba(120,220,190,0.10), transparent 70%), radial-gradient(ellipse 380px 280px at 52% 48%, rgba(180,140,255,0.055), transparent 72%)',
            filter: 'blur(28px)',
            transform: 'scale(1.12)'
          }}
        />

        {loading ? (

          <div className="bg-white rounded-2xl border shadow-sm p-10 flex flex-col items-center justify-center text-gray-500">

            <Loader2
              size={32}
              className="animate-spin text-blue-600 mb-3"
            />

            <div className="font-semibold">
              กำลังโหลดข้อมูล...
            </div>

          </div>

        ) : filtered.length ===
          0 ? (

          <div className="bg-white rounded-2xl border shadow-sm p-10 text-center">

            <Users
              size={42}
              className="mx-auto text-gray-300 mb-3"
            />

            <div className="text-lg font-black text-gray-700">
              ไม่พบรายการจอง
            </div>

            <div className="text-sm text-gray-400 mt-1">
              ลองเปลี่ยนคำค้นหาหรือเพิ่มสลิปใหม่
            </div>

          </div>

        ) : (

          filtered.map(b => {

            const seatCodes =
              (
                b.booking_seats ||
                []
              )
                .map(
                  x =>
                    x.seats
                      ?.seat_code
                )
                .filter(Boolean);

            const isCheckedIn =
              b.status ===
              'checked_in';

            return (
              <div
                key={b.id}
                onPointerMove={(event) =>
                  handleBookingPointerMove(event, b.id)
                }
                onPointerLeave={(event) =>
                  handleBookingPointerLeave(event, b.id)
                }
                style={{
                  '--glass-rx': '0deg',
                  '--glass-ry': '0deg',
                  '--glass-lift': '0px',
                  '--glass-light-x': '50%',
                  '--glass-light-y': '35%',
                  '--glass-shadow-x': '0px',
                  '--glass-shadow-y': '8px'
                }}
                className={`group relative overflow-hidden
                rounded-[24px] border
                bg-white/[0.075]
                backdrop-blur-[32px]
                backdrop-saturate-[180%]
                backdrop-contrast-[110%]
                [perspective:1200px]
                [transform-style:preserve-3d]
                [transform:translate3d(0,calc(var(--glass-lift,0px)*-1),0)_rotateX(var(--glass-rx))_rotateY(var(--glass-ry))]
                transition-[box-shadow,border-color,background-color]
                duration-300 ease-out
                shadow-[var(--glass-shadow-x)_var(--glass-shadow-y)_35px_-14px_rgba(0,0,0,0.20)]
                hover:shadow-[var(--glass-shadow-x)_calc(var(--glass-shadow-y)+7px)_45px_-15px_rgba(0,0,0,0.24)]
                hover:bg-white/[0.09]
                ${
                  isCheckedIn
                    ? 'border-green-200'
                    : 'border-white/35'
                }`}
              >
                <div
                  className="pointer-events-none absolute inset-0 z-0"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.10) 14%, transparent 36%, transparent 68%, rgba(255,255,255,0.07) 100%)'
                  }}
                />

                <div
                  className="pointer-events-none absolute inset-[1px] z-0 rounded-[23px] border border-white/25"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0.20) 0%, transparent 15%, transparent 82%, rgba(255,255,255,0.06) 100%)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.48), inset 1px 0 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(255,255,255,0.07)'
                  }}
                />

                <div className="relative z-10">

                <div className="p-4 md:p-5">

                  {/* HEADER */}
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

                    <div className="min-w-0 flex-1">

                      <div className="flex flex-wrap items-center gap-2 mb-2">

                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            isCheckedIn
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {isCheckedIn
                            ? 'รับบัตรแล้ว'
                            : 'รอรับบัตร'}
                        </span>

                        {b.booking_id && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                            {b.booking_id}
                          </span>
                        )}

                      </div>

                      <h3 className="text-xl md:text-2xl font-black text-gray-900 break-words">
                        {b.name ||
                          'ไม่ระบุชื่อ'}
                      </h3>

                      {b.phone && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {b.phone}
                        </div>
                      )}

                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="flex flex-wrap gap-2">

                      <button
                        type="button"
                        onClick={() =>
                          openSlip(b)
                        }
                        disabled={
                          !b.booking_slips
                            ?.length
                        }
                        className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold text-sm flex items-center gap-1.5 hover:bg-gray-200 disabled:opacity-40"
                      >
                        <ImageIcon
                          size={16}
                        />
                        สลิป
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...toForm(b),
                            id: b.id
                          })
                        }
                        className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm flex items-center gap-1.5 hover:bg-blue-100"
                      >
                        <Edit3
                          size={16}
                        />
                        แก้ไข
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          startAssign(b)
                        }
                        className="px-3 py-2 rounded-lg bg-purple-50 text-purple-700 font-bold text-sm flex items-center gap-1.5 hover:bg-purple-100"
                      >
                        <Map
                          size={16}
                        />
                        ที่นั่ง
                      </button>

                    </div>

                  </div>

                  {/* DETAILS */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">

                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400 mb-1">
                        วันที่
                      </div>

                      <div className="font-bold text-gray-800">
                        {b.date_label ||
                          '-'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400 mb-1">
                        รอบ
                      </div>

                      <div className="font-bold text-gray-800">
                        {b.time
                          ? `${b.time} น.`
                          : '-'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400 mb-1">
                        สถานที่
                      </div>

                      <div className="font-bold text-gray-800">
                        {b.venue ||
                          '-'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-3">
                      <div className="text-xs text-gray-400 mb-1">
                        จำนวนบัตร
                      </div>

                      <div className="font-bold text-gray-800">
                        {Number(
                          b.quantity
                        ) || 0}{' '}
                        ใบ
                      </div>
                    </div>

                  </div>

                  {/* SEATS + CHECKIN */}
                  <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                    <div className="flex-1">

                      <div className="text-xs text-gray-400 mb-1">
                        ที่นั่ง
                      </div>

                      {seatCodes.length >
                      0 ? (

                        <div className="flex flex-wrap gap-1.5">

                          {seatCodes.map(
                            code => (
                              <span
                                key={code}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-black"
                              >
                                {code}
                              </span>
                            )
                          )}

                        </div>

                      ) : (

                        <span className="text-sm text-gray-400">
                          ยังไม่ได้ Assign ที่นั่ง
                        </span>

                      )}

                    </div>

                    <div className="flex flex-wrap gap-2">

                      <button
                        type="button"
                        onClick={() =>
                          toggleCheckin(
                            b
                          )
                        }
                        className={`px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 ${
                          isCheckedIn
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >

                        {isCheckedIn ? (
                          <>
                            <Check
                              size={17}
                            />
                            ยกเลิกรับบัตร
                          </>
                        ) : (
                          <>
                            <UserCheck
                              size={17}
                            />
                            เช็กอิน / รับบัตร
                          </>
                        )}

                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDeleteId(
                            b.id
                          )
                        }
                        className="px-3 py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-bold flex items-center gap-2"
                      >
                        <Trash2
                          size={17}
                        />
                        ลบ
                      </button>

                    </div>

                  </div>

                </div>

                </div>
              </div>
            );
          })
        )}

      </div>
    </div>;

  const mapView =
    <div className="space-y-6">

      {assigningBooking && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-amber-800 font-semibold">
            กำลังเลือกที่นั่งให้ “
            {assigningBooking.name ||
              'ผู้จอง'}
            ” · {currentZone} ·{' '}
            {currentDate} ·{' '}
            {currentRound} น.

            <span className="ml-1">
              — เลือกแล้ว
            </span>

            <b>
              {' '}
              {
                selectedSeatIds.length
              } /{' '}
              {
                assigningBooking.quantity
              }
            </b>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setAssigning(
                  null
                );

                setSelectedSeatIds(
                  []
                );

                setOriginalSeatIds(
                  []
                );
              }}
              className="px-4 py-2 rounded-lg font-bold text-amber-700 bg-white border border-amber-300"
            >
              ยกเลิก
            </button>

            <button
              onClick={
                confirmSeats
              }
              disabled={
                selectedSeatIds.length !==
                  Number(
                    assigningBooking.quantity
                  ) ||
                saveStatus ===
                  'saving'
              }
              className="px-4 py-2 rounded-lg font-bold text-white bg-amber-600 disabled:opacity-50"
            >
              ยืนยันการ Assign
            </button>
          </div>
        </div>
      )}

      {/* DATE */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border flex overflow-x-auto">
        {DATES.map(d => (
          <button
            key={d}
            onClick={() => {
              setCurrentDate(
                d
              );

              setCurrentRound(
                ROUND_OPTIONS[
                  d
                ][0]
              );
            }}
            className={`flex-1 min-w-[100px] py-3 px-4 rounded-xl font-bold ${
              currentDate === d
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-500'
            }`}
          >
            <Calendar
              size={18}
              className="mx-auto mb-1"
            />

            {d}
          </button>
        ))}
      </div>

      {/* ROUND */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border flex gap-2">
        {(
          ROUND_OPTIONS[
            currentDate
          ] || []
        ).map(t => (
          <button
            key={t}
            onClick={() =>
              setCurrentRound(
                t
              )
            }
            className={`flex-1 py-2.5 rounded-xl font-bold ${
              currentRound === t
                ? 'bg-blue-600 text-white'
                : 'text-gray-500'
            }`}
          >
            รอบ {t} น.
          </button>
        ))}
      </div>

      {/* CURRENT SHOW SUMMARY */}
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              สถานะรอบปัจจุบัน
            </div>

            <div className="text-xl font-black text-gray-900 mt-1">
              {currentDate} · รอบ {currentRound} น.
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-50 border">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ไม่ว่างแล้ว
            </span>

            <span className="text-xl font-black text-gray-900">
              {unavailableCount}
            </span>

            <span className="text-sm text-gray-400">
              ที่นั่ง
            </span>
          </div>
        </div>
      </div>

      {/* ZONE */}
      <div className="bg-white rounded-3xl shadow-sm border overflow-hidden">
        <div className="p-4 md:p-6 border-b flex justify-center gap-3 bg-gray-50">
          {ZONES.map(z => (
            <button
              key={z}
              onClick={() =>
                setCurrentZone(
                  z
                )
              }
              className={`px-8 md:px-12 py-3 rounded-full font-black text-lg ${
                currentZone === z
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 border'
              }`}
            >
              ZONE {z}
            </button>
          ))}
        </div>

        {/* STATUS SUMMARY */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 md:px-8 border-b">
          {Object.entries(
            STATUS_CONFIG
          ).map(
            ([k, c]) => (
              <div
                key={k}
                className="flex items-center justify-between md:flex-col md:items-center p-3 rounded-2xl bg-gray-50 border"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        c.color
                    }}
                  />

                  <span className="text-xs font-bold text-gray-500">
                    {c.label}
                  </span>
                </div>

                <span
                  className="text-2xl font-black mt-0 md:mt-1"
                  style={{
                    color:
                      c.color
                  }}
                >
                  {
                    mapSummary[
                      k
                    ]
                  }
                </span>
              </div>
            )
          )}
        </div>

        {/* UNAVAILABLE MESSAGE */}
        <div className="px-4 py-4 bg-blue-50 border-b border-blue-100">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-center">
            <CheckCircle2
              size={18}
              className="text-blue-500"
            />

            <span className="text-sm font-semibold text-blue-700">
              รอบ {currentRound} น. · Zone {currentZone}
              {' '}
              มีที่นั่งไม่ว่างแล้ว{' '}
              <b>
                {unavailableCount}
              </b>
              {' '}ที่นั่ง
            </span>
          </div>

          <div className="text-xs text-blue-500 text-center mt-1">
            ที่นั่งสีฟ้า/เขียวจะไม่สามารถเลือกให้ Booking อื่นได้
          </div>
        </div>

        {assigningBooking && (
          <div className="mx-4 mt-4 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-black text-gray-900">
                    🎟️ ต้องเลือก {assigningBooking.quantity} ที่นั่ง
                  </div>

                  {requestedSeats.length > 0 && (
                    <div className="mt-1 text-sm font-semibold text-gray-700">
                      ที่นั่งจากสลิป:{' '}
                      <span className="text-amber-700">
                        {requestedSeats.join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  className={`shrink-0 rounded-xl px-3 py-2 text-sm font-black ${
                    selectedSeatIds.length ===
                    Number(assigningBooking.quantity)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-white text-amber-700'
                  }`}
                >
                  {selectedSeatIds.length} / {assigningBooking.quantity}
                </div>
              </div>

              {requestedSeats.length > 0 && (
                <div className="text-xs font-semibold text-amber-700">
                  กรุณาเลือกที่นั่งตามรายการด้านบน
                </div>
              )}

              {selectedSeatIds.length ===
                Number(assigningBooking.quantity) && (
                <div className="text-sm font-bold text-green-700">
                  ✓ เลือกครบแล้ว สามารถกดบันทึกได้
                </div>
              )}
            </div>
          </div>
        )}

        {/* INSTRUCTION */}
        <div className="px-4 py-3 text-center text-sm text-gray-500">
          {assigningBooking
            ? 'แตะที่นั่งว่างเพื่อเลือก • แตะที่นั่งสีเทาของ Booking นี้เพื่อยกเลิก • ที่นั่งสีเหลืองคือที่นั่งที่เลือกใหม่'
            : 'แตะที่นั่งเพื่อบล็อก/ปลดบล็อก • ที่นั่งที่ขายแล้วแก้จาก Booking'}
        </div>

        {/* SEAT MAP */}
<div
  ref={seatMapViewportRef}
  className="w-full overflow-x-auto overflow-y-hidden bg-slate-50"
  style={{
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
    touchAction: 'auto'
  }}
>
  <div
    ref={seatMapSurfaceRef}
    className="w-max min-w-full px-6 py-6 md:px-12 md:py-12 flex flex-col items-center gap-2 md:gap-3"
  >
            {ROWS.map(row => (
              <div
                key={row}
                className="flex items-center gap-3 md:gap-5"
              >
                <div className="w-6 md:w-8 font-black text-gray-400 text-center text-lg">
                  {row}
                </div>

                <div className="flex gap-2 md:gap-3">
                  {ZONE_COLUMNS[
                    currentZone
                  ].map(col => {
                    const code =
                      `${row}${col}`;

                    const s =
                      seatByCode[
                        code
                      ];

                    if (!s) {
                      return null;
                    }

                    const selected =
                      selectedSeatIds.includes(
                        s.id
                      );

                    const isRequestedSeat =
                      requestedSeats.includes(
                        s.seat_code
                      );

                    const isOriginalSeat =
                      originalSeatIds.includes(
                        s.id
                      );

                    const isOwnSeat =
                      selected ||
                      assignedCodes.includes(
                        s.seat_code
                      );

                    const cfg =
                      STATUS_CONFIG[
                        s.status
                      ];

                    const displayBg =
                      selected
                        ? isOriginalSeat
                          ? '#9ca3af'
                          : '#f59e0b'
                        : cfg.bg;

                    const displayColor =
                      selected
                        ? '#fff'
                        : cfg.text;

                    const displayBorder =
                      selected
                        ? isOriginalSeat
                          ? '#6b7280'
                          : '#d97706'
                        : cfg.color;

                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() =>
                          assigningBooking
                            ? toggleSeat(
                                s
                              )
                            : toggleBlock(
                                s
                              )
                        }
                        title={
                          selected
                            ? isOriginalSeat
                              ? `${code} · ที่นั่งเดิมของ Booking นี้ · แตะเพื่อเอาออก`
                              : `${code} · ที่นั่งที่เลือกใหม่ · แตะเพื่อเอาออก`
                            : isRequestedSeat
                              ? `${code} · ที่นั่งที่ต้องเลือก`
                              : `${code} · ${cfg.label}`
                        }
                        className={`seat-btn w-11 h-11 md:w-14 md:h-14 flex items-center justify-center rounded-xl md:rounded-2xl text-sm md:text-base font-bold border-2 focus:outline-none transition ${
                          selected
                            ? isOriginalSeat
                              ? 'ring-2 ring-gray-400'
                              : 'ring-4 ring-amber-300 scale-105'
                            : isRequestedSeat
                              ? 'ring-4 ring-blue-300 scale-105'
                              : ''
                        } ${
                          !assigningBooking &&
                          s.status ===
                            'available'
                            ? 'hover:scale-105'
                            : ''
                        }`}
                        style={{
                          backgroundColor:
                            displayBg,

                          color:
                            displayColor,

                          borderColor:
                            displayBorder,

                          cursor:
                            assigningBooking &&
                            (
                              s.status ===
                                'sold' ||
                              s.status ===
                                'checked_in' ||
                              s.status ===
                                'blocked'
                            ) &&
                            !isOwnSeat
                              ? 'not-allowed'
                              : 'pointer'
                        }}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 mb-4 mx-auto max-w-md w-full h-12 bg-gray-200 border-t-4 border-gray-300 flex items-center justify-center rounded-t-[3rem]">
            <span className="font-black text-gray-400 tracking-[.3em]">
              STAGE
            </span>
          </div>
        </div>

        {/* LEGEND */}
        {assigningBooking && (
          <div className="px-4 md:px-8 py-4 border-t bg-white">
            <div className="flex flex-wrap justify-center gap-4 text-xs font-bold text-gray-600">

              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-md border-2"
                  style={{
                    backgroundColor:
                      '#9ca3af',
                    borderColor:
                      '#6b7280'
                  }}
                />
                ที่นั่งเดิม
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-md border-2"
                  style={{
                    backgroundColor:
                      '#f59e0b',
                    borderColor:
                      '#d97706'
                  }}
                />
                ที่นั่งที่เลือกใหม่
              </div>

              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md border-2 border-[#54c4a5] bg-white" />
                ว่าง
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-md"
                  style={{
                    backgroundColor:
                      '#28b5d3'
                  }}
                />
                จองแล้ว
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-md"
                  style={{
                    backgroundColor:
                      '#10b981'
                  }}
                />
                รับบัตรแล้ว
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-md"
                  style={{
                    backgroundColor:
                      '#c35057'
                  }}
                />
                ถูกบล็อก
              </div>

            </div>
          </div>
        )}

      </div>
    </div>;

  return (
    <div className="event-manager-app min-h-screen bg-gray-50 pb-12 text-gray-800">

      <style>{`
        /* The light palette remains the existing Tailwind design. */
        .event-manager-app {
          color-scheme: light dark;
          --seat-available-bg: #ffffff;
          --seat-available-text: #54c4a5;
        }

        /* Follow the device setting automatically; no stored preference or toggle is needed. */
        @media (prefers-color-scheme: dark) {
          .event-manager-app {
            --seat-available-bg: #182334;
            --seat-available-text: #70e0c1;
            color: #e5edf8;
            background-color: #0b1220;
          }

          .event-manager-app .bg-white { background-color: #162033 !important; }
          .event-manager-app .bg-gray-50,
          .event-manager-app .bg-slate-50 { background-color: #0f1726 !important; }
          .event-manager-app .bg-gray-100 { background-color: #243147 !important; }
          .event-manager-app .bg-gray-200 { background-color: #34435a !important; }
          .event-manager-app .bg-gray-900 { background-color: #e5edf8 !important; }

          .event-manager-app .bg-blue-50 { background-color: #102a4b !important; }
          .event-manager-app .bg-blue-100 { background-color: #163968 !important; }
          .event-manager-app .bg-green-100 { background-color: #123c32 !important; }
          .event-manager-app .bg-amber-50 { background-color: #442f0c !important; }
          .event-manager-app .bg-red-50 { background-color: #481d27 !important; }
          .event-manager-app .bg-red-100 { background-color: #5b2230 !important; }
          .event-manager-app .bg-purple-50 { background-color: #30204f !important; }

          .event-manager-app .text-gray-900,
          .event-manager-app .text-gray-800 { color: #f8fafc !important; }
          .event-manager-app .text-gray-700,
          .event-manager-app .text-gray-600 { color: #d6e0ee !important; }
          .event-manager-app .text-gray-500 { color: #b7c5d8 !important; }
          .event-manager-app .text-gray-400 { color: #91a4bd !important; }
          .event-manager-app .text-blue-700 { color: #a9d3ff !important; }
          .event-manager-app .text-blue-600 { color: #8fc5ff !important; }
          .event-manager-app .text-green-700 { color: #8ce8c4 !important; }
          .event-manager-app .text-amber-800,
          .event-manager-app .text-amber-700 { color: #ffd58a !important; }
          .event-manager-app .text-red-700,
          .event-manager-app .text-red-600 { color: #ffadb8 !important; }
          .event-manager-app .text-purple-700 { color: #d7beff !important; }
          .event-manager-app .text-gray-900.text-white { color: #0f1726 !important; }

          .event-manager-app .border,
          .event-manager-app .border-b,
          .event-manager-app .border-t { border-color: #304058 !important; }
          .event-manager-app .border-gray-200,
          .event-manager-app .border-gray-300 { border-color: #465875 !important; }
          .event-manager-app .border-blue-100 { border-color: #24548a !important; }
          .event-manager-app .border-red-200 { border-color: #8d3a4a !important; }
          .event-manager-app .border-amber-200,
          .event-manager-app .border-amber-300 { border-color: #926717 !important; }
          .event-manager-app .border-green-200 { border-color: #28775d !important; }

          .event-manager-app input,
          .event-manager-app select,
          .event-manager-app textarea {
            color: #f8fafc !important;
            background-color: #101a2a !important;
            border-color: #4a5e7c !important;
          }
          .event-manager-app input::placeholder,
          .event-manager-app textarea::placeholder { color: #8fa1b9 !important; }
          .event-manager-app option { color: #f8fafc; background: #101a2a; }

          .event-manager-app .hover:bg-gray-200:hover { background-color: #34435a !important; }
          .event-manager-app .hover:bg-blue-100:hover { background-color: #1c487d !important; }
          .event-manager-app .hover:bg-green-200:hover { background-color: #195742 !important; }
          .event-manager-app .hover:bg-red-100:hover { background-color: #6d2938 !important; }
          .event-manager-app .shadow-sm { box-shadow: 0 1px 3px rgb(0 0 0 / .28) !important; }
          .event-manager-app .seat-btn { box-shadow: 0 1px 2px rgb(0 0 0 / .3); }
        }
      `}</style>

      <header
        className="bg-white shadow-sm sticky top-0 z-20 border-b"
        style={{
          paddingTop: 'env(safe-area-inset-top)'
        }}
      >

        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">

          <div className="flex items-center gap-2">

            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <CheckCircle2
                size={24}
              />
            </div>

            <div>

              <h1 className="text-xl md:text-2xl font-black tracking-tight">
                Fewfew Event Management
              </h1>

              <div className="text-xs text-gray-400 flex items-center gap-1">

                {online ? (
                  <>
                    <Wifi
                      size={12}
                      className="text-green-500"
                    />

                    เชื่อมต่อฐานข้อมูลแล้ว
                  </>
                ) : (
                  <>
                    <WifiOff
                      size={12}
                      className="text-red-500"
                    />

                    ยังไม่เชื่อมต่อ
                  </>
                )}

                {syncing && (
                  <>
                    <RefreshCw
                      size={11}
                      className="animate-spin ml-1"
                    />

                    กำลังซิงก์
                  </>
                )}

              </div>
            </div>

          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">

            <button
              onClick={() =>
                setActiveTab(
                  'list'
                )
              }
              className={`flex-1 px-6 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 ${
                activeTab === 'list'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              <List size={18} />

              ระบบจัดการรายชื่อ
            </button>

            <button
              onClick={() =>
                setActiveTab(
                  'map'
                )
              }
              className={`flex-1 px-6 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 ${
                activeTab === 'map'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              <Map size={18} />

              แผนผังที่นั่ง
            </button>

          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-6">

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 flex items-start gap-2">

            <AlertOctagon
              size={18}
              className="mt-0.5 shrink-0"
            />

            <div className="flex-1">
              {error}
            </div>

            <button
              onClick={() =>
                setError('')
              }
            >
              <X size={18} />
            </button>

          </div>
        )}

        {activeTab ===
        'list'
          ? listView
          : mapView}

      </main>

      {/* OCR MODAL */}
      {ocrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">

          <div className="modal-pop bg-white rounded-3xl w-full max-w-5xl overflow-hidden flex flex-col shadow-2xl max-h-[92vh]">

            <div className="p-4 md:p-6 border-b flex justify-between items-center bg-gray-50">

              <h2 className="text-xl font-bold flex items-center gap-2">
                <Edit3 className="text-blue-600" />

                ตรวจสอบข้อมูลจากสลิป
              </h2>

              <button
                onClick={() =>
                  setOcrModal(
                    null
                  )
                }
                className="p-2 bg-white rounded-full text-gray-500"
              >
                <X size={20} />
              </button>

            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col md:flex-row gap-6">

              <div className="w-full md:w-1/2">

                <p className="font-semibold text-gray-500 text-sm mb-2">
                  รูปสลิป
                  {ocrModal.images
                    .length >
                    1 &&
                    ` (${ocrModal.images.length} รูป)`}
                </p>

                <div className="bg-gray-100 rounded-2xl border flex flex-wrap gap-2 p-2 max-h-[500px] overflow-auto">

                  {ocrModal.images.map(
                    (
                      img,
                      i
                    ) => (
                      <img
                        key={i}
                        src={img}
                        alt={`slip ${
                          i +
                          1
                        }`}
                        className="max-w-full max-h-[480px] object-contain mx-auto rounded-xl"
                      />
                    )
                  )}

                </div>
              </div>

              <div className="w-full md:w-1/2 space-y-4">

                <p className="font-semibold text-gray-500 text-sm">
                  ข้อมูลที่อ่านได้ (แก้ไขได้ก่อนบันทึก)
                </p>

                {fieldGrid(
                  ocrModal.formData,
                  (
                    k,
                    v
                  ) =>
                    setOcrModal(
                      x => ({
                        ...x,
                        formData: {
                          ...x.formData,
                          [k]: v
                        }
                      })
                    ),
                  true
                )}

              </div>

            </div>



            <div className="p-4 md:p-6 border-t bg-gray-50 flex justify-end gap-3">

              <button
                onClick={() =>
                  setOcrModal(
                    null
                  )
                }
                className="px-6 py-3 rounded-xl font-bold text-gray-600 bg-white border"
              >
                ยกเลิก
              </button>

              <button
                onClick={
                  saveBooking
                }
                disabled={
                  saveStatus ===
                  'saving'
                }
                className="px-8 py-3 rounded-xl font-bold text-white bg-blue-600 shadow-md flex items-center gap-2 disabled:opacity-50"
              >

                {saveStatus ===
                'saving' ? (
                  <Loader2
                    size={20}
                    className="animate-spin"
                  />
                ) : (
                  <Check
                    size={20}
                  />
                )}

                {saveStatus ===
                'saving'
                  ? 'กำลังบันทึก...'
                  : 'บันทึกข้อมูล'}

              </button>

            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">

          <div className="modal-pop bg-white rounded-3xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">

            <div className="p-4 md:p-6 border-b flex justify-between items-center bg-gray-50">

              <h2 className="text-xl font-bold flex items-center gap-2">
                <Edit3 className="text-blue-600" />

                แก้ไขข้อมูลการจอง
              </h2>

              <button
                onClick={() =>
                  setEditing(
                    null
                  )
                }
                className="p-2 bg-white rounded-full"
              >
                <X />
              </button>

            </div>

            <div className="p-4 md:p-6 overflow-y-auto">

              {fieldGrid(
                editing,
                (k, v) =>
                  setEditing(
                    x => ({
                      ...x,
                      [k]: v
                    })
                  )
              )}

            </div>

            <div className="p-4 md:p-6 border-t bg-gray-50 flex justify-end gap-3">

              <button
                onClick={() =>
                  setEditing(
                    null
                  )
                }
                className="px-6 py-3 rounded-xl font-bold bg-white border"
              >
                ยกเลิก
              </button>

              <button
                onClick={
                  saveEdit
                }
                disabled={
                  saveStatus ===
                  'saving'
                }
                className="px-8 py-3 rounded-xl font-bold text-white bg-blue-600 flex gap-2 items-center"
              >
                <Save
                  size={20}
                />

                บันทึกการแก้ไข
              </button>

            </div>

          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">

          <div className="modal-pop bg-white rounded-3xl w-full max-w-sm p-6 text-center shadow-2xl">

            <div className="mx-auto w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <AlertOctagon
                size={32}
              />
            </div>

            <h3 className="text-xl font-bold mb-2">
              ยืนยันการลบ?
            </h3>

            <p className="text-gray-500 mb-6 text-sm">
              การลบรายการจองจะคืนที่นั่งที่ผูกกับรายการนี้ให้ว่างด้วย
            </p>

            <div className="flex gap-3">

              <button
                onClick={() =>
                  setDeleteId(
                    null
                  )
                }
                className="flex-1 py-3 rounded-xl font-bold bg-gray-100"
              >
                ยกเลิก
              </button>

              <button
                onClick={
                  deleteBooking
                }
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600"
              >
                ลบรายการ
              </button>

            </div>
          </div>
        </div>
      )}

      {/* IMAGE VIEWER */}
      {viewImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80"
          onClick={() =>
            setViewImage(
              null
            )
          }
        >

          <button
            className="absolute top-6 right-6 text-white p-2"
            onClick={() =>
              setViewImage(
                null
              )
            }
          >
            <X size={28} />
          </button>

          <img
            src={viewImage}
            alt="Booking slip"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={e =>
              e.stopPropagation()
            }
          />

        </div>
      )}

      {/* SAVE STATUS */}
      {saveStatus !==
        'idle' && (
        <div
          className={`toast-in fixed bottom-5 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 font-bold text-sm text-white ${
            saveStatus ===
            'error'
              ? 'bg-red-600'
              : saveStatus ===
                  'saved'
                ? 'bg-green-600'
                : 'bg-blue-600'
          }`}
        >

          {saveStatus ===
          'saving' ? (
            <>
              <Loader2
                size={16}
                className="animate-spin"
              />

              กำลังบันทึก...
            </>
          ) : saveStatus ===
            'saved' ? (
            <>
              <Check
                size={16}
              />

              บันทึกข้อมูลล่าสุดแล้ว
            </>
          ) : (
            <>
              <AlertOctagon
                size={16}
              />

              บันทึกไม่สำเร็จ
            </>
          )}

        </div>
      )}

    </div>
  );
}
