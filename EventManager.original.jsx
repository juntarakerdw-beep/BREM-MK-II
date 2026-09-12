import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar, Map, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid,
  Upload, Search, List, X, Image as ImageIcon, Edit3, Check, Loader2,
  Trash2, Save
} from 'lucide-react';

// ---------- Constants ----------
const DATES = ['18 ก.ย.', '19 ก.ย.', '20 ก.ย.'];
const ZONES = ['A', 'B'];
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
// Each zone has its own 6-seat-wide numbering, matching the real venue chart
const ZONE_COLUMNS = { A: [12, 11, 10, 9, 8, 7], B: [6, 5, 4, 3, 2, 1] };
const STATUS_CYCLE = ['available', 'sold', 'checked_in', 'blocked'];

// Fixed show schedule: 18 has one round, 19 and 20 each have two rounds
const ROUND_OPTIONS = {
  '18 ก.ย.': ['19:00'],
  '19 ก.ย.': ['14:00', '18:00'],
  '20 ก.ย.': ['14:00', '18:00']
};

const STATUS_CONFIG = {
  available: { label: 'ว่าง', color: '#54c4a5', bg: '#ffffff', text: '#54c4a5', icon: <LayoutGrid size={14} /> },
  sold: { label: 'ขายแล้ว', color: '#28b5d3', bg: '#28b5d3', text: '#ffffff', icon: <CheckCircle2 size={14} /> },
  checked_in: { label: 'รับบัตรแล้ว', color: '#10b981', bg: '#10b981', text: '#ffffff', icon: <UserCheck size={14} /> },
  blocked: { label: 'ถูกบล็อก', color: '#c35057', bg: '#c35057', text: '#ffffff', icon: <AlertOctagon size={14} /> }
};

const EMPTY_FORM = { name: '', date: '', time: '', venue: '', zone: '', seat: '', quantity: '', bookingId: '', phone: '' };

const FIELDS = [
  { label: 'ชื่อผู้จอง', key: 'name', placeholder: 'ไม่พบข้อมูล' },
  { label: 'วันที่', key: 'date', placeholder: '' },
  { label: 'รอบการแสดง', key: 'time', placeholder: '' },
  { label: 'สถานที่', key: 'venue', placeholder: 'ไม่พบข้อมูล' },
  { label: 'Zone', key: 'zone', placeholder: 'เช่น A หรือ B' },
  { label: 'ที่นั่ง', key: 'seat', placeholder: 'เช่น A12' },
  { label: 'จำนวนบัตร', key: 'quantity', placeholder: 'เช่น 1' },
  { label: 'Booking ID', key: 'bookingId', placeholder: 'ไม่พบข้อมูล' },
  { label: 'เบอร์โทรศัพท์', key: 'phone', placeholder: 'ไม่พบข้อมูล' }
];

// ---------- Helpers ----------

// Plain base64 read, used as a guaranteed-to-work fallback if compression stalls
const readAsDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
  reader.readAsDataURL(file);
});

// Compress an uploaded image before storing it, so payloads stay small
const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
  reader.onload = (event) => {
    const img = new Image();
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (err) {
        reject(err);
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Races a promise against a timeout so a stalled step can never freeze the UI
const withTimeout = (promise, ms, fallbackValue) => new Promise((resolve) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) { settled = true; resolve(fallbackValue); }
  }, ms);
  promise.then((value) => {
    if (!settled) { settled = true; clearTimeout(timer); resolve(value); }
  }).catch(() => {
    if (!settled) { settled = true; clearTimeout(timer); resolve(fallbackValue); }
  });
});

// Reads booking details off a slip photo using Claude's vision, no external API key required
const readSlipWithAI = async (base64Image) => {
  const base64Data = base64Image.split(',')[1];
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
            {
              type: 'text',
              text: 'อ่านข้อมูลการจองจากรูปสลิป/ใบจองนี้ แล้วตอบกลับเป็น JSON ล้วน ๆ เท่านั้น ห้ามมีคำอธิบายหรือ markdown fence ใด ๆ ' +
                'ใช้โครงสร้างนี้เท่านั้น: {"name":"","date":"","time":"","venue":"","zone":"","seat":"","quantity":"","bookingId":"","phone":""} ' +
                'สำหรับ "date" ต้องเป็นค่าใดค่าหนึ่งจาก "18 ก.ย.", "19 ก.ย.", "20 ก.ย." เท่านั้น ตามวันที่ที่อ่านได้จากสลิป ' +
                'สำหรับ "time" ให้เป็น "19:00" ถ้า date คือ "18 ก.ย." หรือเป็น "14:00" หรือ "18:00" ถ้า date คือ "19 ก.ย." หรือ "20 ก.ย." (เลือกรอบที่ใกล้เคียงเวลาที่อ่านได้ที่สุด) ' +
                'ถ้าไม่พบข้อมูลหรือไม่แน่ใจในช่องใดให้ใส่ค่าว่าง ""'
            }
          ]
        }]
      })
    });
    const data = await response.json();
    const textBlock = (data.content || []).find((c) => c.type === 'text');
    if (!textBlock) return null;
    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('อ่านสลิปด้วย AI ไม่สำเร็จ:', err);
    return null;
  }
};

// Shared persistent storage so every staff member sees the same list & seat map
const loadShared = async (key, fallback) => {
  try {
    const res = await window.storage.get(key, true);
    return res ? JSON.parse(res.value) : fallback;
  } catch {
    return fallback;
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('list');

  const [bookings, setBookings] = useState([]);
  const [seatMap, setSeatMap] = useState({});
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMap, setIsLoadingMap] = useState(true);

  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrModalData, setOcrModalData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [filterTime, setFilterTime] = useState('all');
  const [viewImageModal, setViewImageModal] = useState(null);

  const [editingBooking, setEditingBooking] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [assigningBookingId, setAssigningBookingId] = useState(null);

  const [currentDate, setCurrentDate] = useState(DATES[0]);
  const [currentRound, setCurrentRound] = useState(ROUND_OPTIONS[DATES[0]][0]);
  const [currentZone, setCurrentZone] = useState(ZONES[0]);

  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error

  const fileInputRef = useRef(null);
  const mountedRef = useRef(true);
  const saveStatusTimerRef = useRef(null);

  // Persists to shared storage while showing a visible status, so a save never looks like it silently did nothing
  const persist = async (key, value) => {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    setSaveStatus('saving');
    try {
      await window.storage.set(key, JSON.stringify(value), true);
      if (mountedRef.current) setSaveStatus('saved');
    } catch (err) {
      console.error('บันทึกข้อมูลไม่สำเร็จ:', err);
      if (mountedRef.current) setSaveStatus('error');
    }
    saveStatusTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setSaveStatus('idle');
    }, 1800);
  };

  // Initial load + light polling so changes from other staff show up
  useEffect(() => {
    mountedRef.current = true;

    const fetchAll = async (isInitial) => {
      const [bks, sm] = await Promise.all([
        loadShared('bookings', []),
        loadShared('seat-map', {})
      ]);
      if (!mountedRef.current) return;
      setBookings(bks);
      setSeatMap(sm);
      if (isInitial) {
        setIsLoadingList(false);
        setIsLoadingMap(false);
      }
    };

    fetchAll(true);
    const poll = setInterval(() => fetchAll(false), 6000);

    return () => {
      mountedRef.current = false;
      clearInterval(poll);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessingOCR(true);

    // Get a raw preview first — this must succeed for the flow to continue at all
    let rawImage = null;
    try {
      rawImage = await readAsDataURL(file);
    } catch (err) {
      console.error('เปิดไฟล์รูปไม่สำเร็จ:', err);
      setIsProcessingOCR(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Compression is a nice-to-have — if it stalls or errors, fall back to the raw image
    const image = await withTimeout(compressImage(file), 8000, rawImage);

    // OCR is best-effort — if it stalls or errors, open the modal with blank fields to fill in by hand
    const extracted = await withTimeout(readSlipWithAI(image), 20000, null);

    setOcrModalData({ image, formData: extracted || { ...EMPTY_FORM } });
    setIsProcessingOCR(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOcrFormChange = (field, value) => {
    setOcrModalData((prev) => ({ ...prev, formData: { ...prev.formData, [field]: value } }));
  };

  // Jump to the seat map, pre-selecting the zone/date/round guessed from the booking, ready to assign
  const startAssignSeat = (booking) => {
    const zoneGuess = ZONES.find((z) => (booking.zone || '').trim().toUpperCase() === z) || currentZone;
    const dateGuess = DATES.find((d) => booking.date && (d.includes(booking.date.trim()) || booking.date.trim().includes(d))) || currentDate;
    const roundsForDate = ROUND_OPTIONS[dateGuess] || [];
    const roundGuess = roundsForDate.includes(booking.time) ? booking.time : roundsForDate[0];
    setCurrentZone(zoneGuess);
    setCurrentDate(dateGuess);
    setCurrentRound(roundGuess);
    setAssigningBookingId(booking.id);
    setActiveTab('map');
  };

  const handleSaveBooking = async () => {
    if (!ocrModalData) return;
    const newBooking = {
      id: crypto.randomUUID(),
      ...ocrModalData.formData,
      status: 'pending',
      imageUrl: ocrModalData.image,
      createdAt: Date.now()
    };
    const updated = [newBooking, ...bookings];
    setBookings(updated);
    setOcrModalData(null);
    await persist('bookings', updated);
    startAssignSeat(newBooking);
  };

  const toggleBookingStatus = async (bookingId, currentStatus) => {
    const newStatus = currentStatus === 'checked_in' ? 'pending' : 'checked_in';
    const updated = bookings.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b));
    setBookings(updated);
    await persist('bookings', updated);
  };

  const handleEditChange = (field, value) => {
    setEditingBooking((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    if (!editingBooking) return;
    const updated = bookings.map((b) => (b.id === editingBooking.id ? { ...editingBooking } : b));
    setBookings(updated);
    setEditingBooking(null);
    await persist('bookings', updated);
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    const updated = bookings.filter((b) => b.id !== deleteConfirmId);
    setBookings(updated);
    setDeleteConfirmId(null);
    await persist('bookings', updated);
  };

  const handleSeatClick = async (seatId) => {
    const docId = `${currentDate}_${currentRound}_${seatId}`;
    const currentStatus = seatMap[docId] || 'available';

    // Assign mode: clicking a seat books it to the pending booking instead of cycling status
    if (assigningBookingId) {
      if (currentStatus !== 'available') return; // don't overwrite an occupied seat
      const updatedSeatMap = { ...seatMap, [docId]: 'sold' };
      setSeatMap(updatedSeatMap);
      await persist('seat-map', updatedSeatMap);

      const updatedBookings = bookings.map((b) =>
        b.id === assigningBookingId ? { ...b, zone: currentZone, seat: seatId, date: currentDate, time: currentRound } : b
      );
      setBookings(updatedBookings);
      await persist('bookings', updatedBookings);

      setAssigningBookingId(null);
      return;
    }

    const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length];
    const updated = { ...seatMap, [docId]: nextStatus };
    setSeatMap(updated);
    await persist('seat-map', updated);
  };

  const mapSummary = useMemo(() => {
    const counts = { available: 0, sold: 0, checked_in: 0, blocked: 0 };
    ROWS.forEach((row) => ZONE_COLUMNS[currentZone].forEach((col) => {
      const status = seatMap[`${currentDate}_${currentRound}_${row}${col}`] || 'available';
      counts[status]++;
    }));
    return counts;
  }, [currentDate, currentRound, currentZone, seatMap]);

  const assigningBooking = assigningBookingId ? bookings.find((b) => b.id === assigningBookingId) : null;

  const filteredBookings = useMemo(() => {
    let result = bookings.filter((b) => {
      const matchesSearch = !searchQuery ||
        [b.name, b.bookingId, b.phone, b.seat].some((f) => f && f.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = filterStatus === 'all' || b.status === filterStatus;
      const matchesDate = filterDate === 'all' || (b.date && b.date.includes(filterDate));
      const matchesTime = filterTime === 'all' || (b.time && b.time.includes(filterTime));
      return matchesSearch && matchesStatus && matchesDate && matchesTime;
    });

    result.sort((a, b) => {
      if ((a.date || '') !== (b.date || '')) return (a.date || '').localeCompare(b.date || '');
      if ((a.time || '') !== (b.time || '')) return (a.time || '').localeCompare(b.time || '');
      if ((a.zone || '') !== (b.zone || '')) return (a.zone || '').localeCompare(b.zone || '');
      if ((a.seat || '') !== (b.seat || '')) return (a.seat || '').localeCompare(b.seat || '');
      return (a.name || '').localeCompare(b.name || '');
    });

    return result;
  }, [bookings, searchQuery, filterStatus, filterDate, filterTime]);

  const renderListView = () => (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <label className={`flex items-center justify-center gap-2 px-6 py-3 md:py-4 rounded-xl font-bold text-white shadow-md transition-colors cursor-pointer ${isProcessingOCR ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {isProcessingOCR ? <Loader2 className="animate-spin" /> : <Upload size={20} />}
          <span>{isProcessingOCR ? 'กำลังอ่านสลิป...' : 'เพิ่มสลิป'}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
            disabled={isProcessingOCR}
          />
        </label>

        <div className="flex-1 w-full flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="ค้นหาชื่อ, Booking ID, เบอร์, ที่นั่ง..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-4 py-3 rounded-xl text-sm font-bold border bg-white border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">ทุกวันที่</option>
              {DATES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={filterTime}
              onChange={(e) => setFilterTime(e.target.value)}
              className="px-4 py-3 rounded-xl text-sm font-bold border bg-white border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">ทุกเวลา</option>
              {Array.from(new Set(bookings.map((b) => b.time).filter(Boolean))).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {['all', 'pending', 'checked_in'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-3 rounded-xl text-sm font-bold border transition-colors ${
                  filterStatus === status
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {status === 'all' ? 'ทั้งหมด' : status === 'pending' ? 'ยังไม่รับ' : 'รับแล้ว'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoadingList ? (
          <div className="py-12 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="animate-spin w-8 h-8 mb-2" />
            <p>กำลังโหลดรายชื่อ...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-gray-400">
            <List className="w-12 h-12 mb-3 text-gray-300" />
            <p>ไม่พบรายการที่ตรงกัน</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ minWidth: 800 }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
                  <th className="p-4 font-bold">ชื่อ</th>
                  <th className="p-4 font-bold">วันที่</th>
                  <th className="p-4 font-bold">สถานที่</th>
                  <th className="p-4 font-bold">เวลา</th>
                  <th className="p-4 font-bold">Zone</th>
                  <th className="p-4 font-bold">ที่นั่ง</th>
                  <th className="p-4 font-bold text-center">จำนวน</th>
                  <th className="p-4 font-bold text-center">สถานะ</th>
                  <th className="p-4 font-bold text-center pr-6">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => {
                  const isCheckedIn = b.status === 'checked_in';
                  return (
                    <tr key={b.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isCheckedIn ? 'bg-red-50' : ''}`}>
                      <td className="p-4">
                        <div className="font-bold text-gray-900 text-lg">{b.name || '-'}</div>
                        <div className="text-xs text-gray-400 flex gap-2 mt-1">
                          {b.phone && <span>📞 {b.phone}</span>}
                          {b.bookingId && <span>ID: {b.bookingId}</span>}
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-gray-700">{b.date || '-'}</td>
                      <td className="p-4 text-gray-600">{b.venue || '-'}</td>
                      <td className="p-4 text-gray-600">{b.time || '-'}</td>
                      <td className="p-4 font-bold text-blue-600 text-lg">{b.zone || '-'}</td>
                      <td className="p-4 font-bold text-blue-600 text-lg">{b.seat || '-'}</td>
                      <td className="p-4 text-center font-bold text-gray-700 text-lg">{b.quantity || '1'}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => toggleBookingStatus(b.id, b.status)}
                          className={`min-w-[130px] px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors mx-auto border-2 ${
                            isCheckedIn
                              ? 'bg-red-500 border-red-500 text-white shadow-md'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {isCheckedIn ? '🟥 รับแล้ว' : '⬜ ยังไม่รับ'}
                        </button>
                      </td>
                      <td className="p-4 text-center pr-6">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setViewImageModal(b.imageUrl)} className="p-2 rounded-lg text-blue-500 bg-blue-50 hover:bg-blue-100 transition-colors" title="ดูสลิป">
                            <ImageIcon size={18} />
                          </button>
                          <button onClick={() => startAssignSeat(b)} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors" title="เลือก/ย้ายที่นั่ง">
                            <Map size={18} />
                          </button>
                          <button onClick={() => setEditingBooking(b)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors" title="แก้ไข">
                            <Edit3 size={18} />
                          </button>
                          <button onClick={() => setDeleteConfirmId(b.id)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors" title="ลบ">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderMapView = () => (
    <div className="space-y-6">
      {assigningBookingId && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-amber-800 font-semibold">
            กำลังเลือกที่นั่งให้ "{assigningBooking ? (assigningBooking.name || 'ผู้จอง') : 'ผู้จอง'}"
            {' '}(โซน {currentZone} · {currentDate} · รอบ {currentRound} น.) — แตะที่นั่งว่างที่ต้องการ หรือสลับโซน/วันที่/รอบก่อนได้
          </div>
          <button onClick={() => setAssigningBookingId(null)} className="px-4 py-2 rounded-lg font-bold text-amber-700 bg-white border border-amber-300 hover:bg-amber-100 transition-colors shrink-0">
            ยกเลิกการเลือก
          </button>
        </div>
      )}
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex overflow-x-auto hide-scrollbar">
        {DATES.map((date) => (
          <button
            key={date}
            onClick={() => {
              setCurrentDate(date);
              setCurrentRound(ROUND_OPTIONS[date][0]);
            }}
            className={`flex-1 min-w-[100px] py-3 px-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-colors ${
              currentDate === date ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Calendar size={18} className={currentDate === date ? 'text-white' : 'text-gray-400'} />
            <span>{date}</span>
          </button>
        ))}
      </div>

      <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex gap-2">
        {ROUND_OPTIONS[currentDate].map((round) => (
          <button
            key={round}
            onClick={() => setCurrentRound(round)}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-colors ${
              currentRound === round ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent text-gray-500 hover:bg-gray-50'
            }`}
          >
            รอบ {round} น.
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 flex justify-center gap-3 md:gap-4 bg-gray-50">
          {ZONES.map((zone) => (
            <button
              key={zone}
              onClick={() => setCurrentZone(zone)}
              className={`px-8 md:px-12 py-3 rounded-full font-black text-lg md:text-xl transition-colors shadow-sm ${
                currentZone === zone ? 'bg-gray-900 text-white ring-2 ring-gray-300' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              ZONE {zone}
            </button>
          ))}
        </div>

        <div className="border-b border-gray-100 bg-white">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 md:px-8">
            {Object.entries(STATUS_CONFIG).map(([statusKey, config]) => (
              <div key={statusKey} className="flex flex-col items-center p-3 rounded-2xl bg-gray-50 border border-gray-100">
                <span className="text-2xl font-black text-gray-800">{mapSummary[statusKey]}</span>
                <span className="text-xs font-bold mt-1 flex items-center gap-1" style={{ color: config.color }}>
                  {config.icon} {config.label}
                </span>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 flex flex-wrap justify-center gap-4 text-sm font-semibold text-gray-500">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span>วนลูปสถานะเมื่อคลิก:</span>
              {Object.values(STATUS_CONFIG).map((c, i) => (
                <React.Fragment key={c.label}>
                  <div className="flex items-center gap-1" style={{ color: c.color }}>
                    <div className="w-3 h-3 rounded border" style={{ backgroundColor: c.bg, borderColor: c.color }}></div> {c.label}
                  </div>
                  {i < 3 && <span>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 md:p-12 overflow-x-auto w-full hide-scrollbar bg-slate-50">
          {isLoadingMap ? (
            <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="font-medium">กำลังโหลดข้อมูลผังที่นั่ง...</p>
            </div>
          ) : (
            <div className="min-w-fit mx-auto flex flex-col items-center gap-2 md:gap-3">
              {ROWS.map((row) => (
                <div key={row} className="flex items-center gap-3 md:gap-5">
                  <div className="w-6 md:w-8 font-black text-gray-400 text-center text-lg md:text-xl">{row}</div>
                  <div className="flex gap-2 md:gap-3">
                    {ZONE_COLUMNS[currentZone].map((col) => {
                      const seatId = `${row}${col}`;
                      const docId = `${currentDate}_${currentRound}_${seatId}`;
                      const status = seatMap[docId] || 'available';
                      const config = STATUS_CONFIG[status];
                      const isAssignTarget = assigningBookingId && status === 'available';
                      return (
                        <button
                          key={seatId}
                          onClick={() => handleSeatClick(seatId)}
                          className={`seat-btn w-11 h-11 md:w-14 md:h-14 flex items-center justify-center rounded-xl md:rounded-2xl text-sm md:text-base font-bold shadow-sm select-none border-2 focus:outline-none focus:ring-2 focus:ring-blue-400 ${isAssignTarget ? 'ring-2 ring-amber-300' : ''}`}
                          style={{ backgroundColor: config.bg, color: config.text, borderColor: config.color }}
                        >
                          {seatId}
                        </button>
                      );
                    })}
                  </div>
                  <div className="w-6 md:w-8 font-black text-gray-400 text-center text-lg md:text-xl md:hidden">{row}</div>
                </div>
              ))}
            </div>
          )}

          <div
            className="mt-12 mb-4 mx-auto max-w-md w-full h-12 bg-gray-200 border-t-4 border-gray-300 flex items-center justify-center"
            style={{ borderTopLeftRadius: '3rem', borderTopRightRadius: '3rem' }}
          >
            <span className="font-black text-gray-400" style={{ letterSpacing: '0.3em' }}>STAGE</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFieldGrid = (data, onChange, highlightEmpty) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {FIELDS.map((field) => {
        const inputClass = (isEmpty) => `px-4 py-2.5 rounded-xl border focus:ring-2 focus:outline-none transition-colors disabled:bg-gray-100 disabled:text-gray-400 ${
          highlightEmpty && isEmpty ? 'bg-red-50 border-red-200 focus:ring-red-500' : 'bg-white border-gray-300 focus:ring-blue-500'
        }`;

        if (field.key === 'date') {
          return (
            <div key="date" className="flex flex-col">
              <label className="text-xs font-bold text-gray-500 mb-1">{field.label}</label>
              <select
                value={data.date || ''}
                onChange={(e) => {
                  const newDate = e.target.value;
                  onChange('date', newDate);
                  const rounds = ROUND_OPTIONS[newDate] || [];
                  if (!rounds.includes(data.time)) onChange('time', rounds[0] || '');
                }}
                className={inputClass(!data.date)}
              >
                <option value="">เลือกวันที่</option>
                {DATES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          );
        }

        if (field.key === 'time') {
          const rounds = ROUND_OPTIONS[data.date] || [];
          return (
            <div key="time" className="flex flex-col">
              <label className="text-xs font-bold text-gray-500 mb-1">{field.label}</label>
              <select
                value={data.time || ''}
                onChange={(e) => onChange('time', e.target.value)}
                disabled={!data.date}
                className={inputClass(!data.time)}
              >
                <option value="">{data.date ? 'เลือกรอบ' : 'เลือกวันที่ก่อน'}</option>
                {rounds.map((t) => <option key={t} value={t}>{t} น.</option>)}
              </select>
            </div>
          );
        }

        return (
          <div key={field.key} className="flex flex-col">
            <label className="text-xs font-bold text-gray-500 mb-1">{field.label}</label>
            <input
              type="text"
              value={data[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className={inputClass(!data[field.key])}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-12 selection:bg-blue-100 text-gray-800">
      <header className="bg-white shadow-sm sticky top-0 z-20 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <CheckCircle2 size={24} />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Event Management</h1>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex-1 md:w-auto px-6 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List size={18} /> ระบบจัดการรายชื่อ
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`flex-1 md:w-auto px-6 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'map' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Map size={18} /> แผนผังที่นั่ง
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-6">
        {activeTab === 'list' ? renderListView() : renderMapView()}
      </main>

      {ocrModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="modal-pop bg-white rounded-3xl w-full max-w-4xl overflow-hidden flex flex-col shadow-2xl" style={{ maxHeight: '90vh' }}>
            <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold flex items-center gap-2"><Edit3 className="text-blue-600" /> ตรวจสอบข้อมูลจากสลิป</h2>
              <button onClick={() => setOcrModalData(null)} className="p-2 bg-white rounded-full text-gray-500 hover:bg-gray-100 transition-colors shadow-sm"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col md:flex-row gap-6 md:gap-8">
              <div className="w-full md:w-1/2 flex flex-col gap-2">
                <p className="font-semibold text-gray-500 text-sm">รูปสลิปต้นฉบับ</p>
                <div className="bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 flex items-center justify-center h-64 md:h-full" style={{ minHeight: 300 }}>
                  <img src={ocrModalData.image} alt="Slip Preview" className="max-w-full max-h-full object-contain" />
                </div>
              </div>

              <div className="w-full md:w-1/2 space-y-4">
                <p className="font-semibold text-gray-500 text-sm">ข้อมูลที่อ่านได้ (แก้ไขได้ก่อนบันทึก)</p>
                {renderFieldGrid(ocrModalData.formData, handleOcrFormChange, true)}
              </div>
            </div>

            <div className="p-4 md:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setOcrModalData(null)} className="px-6 py-3 rounded-xl font-bold text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleSaveBooking} className="px-8 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md flex items-center gap-2 transition-transform active:scale-95">
                <Check size={20} /> บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {viewImageModal && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} onClick={() => setViewImageModal(null)}>
          <button className="absolute top-6 right-6 text-white p-2 rounded-full transition-colors" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <X size={24} />
          </button>
          <img src={viewImageModal} alt="Original Slip" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="modal-pop bg-white rounded-3xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl p-6 text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <AlertOctagon size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">ยืนยันการลบ?</h3>
            <p className="text-gray-500 mb-6 text-sm">คุณแน่ใจหรือไม่ที่จะลบรายการจองนี้? การกระทำนี้ไม่สามารถย้อนกลับได้</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">ยกเลิก</button>
              <button onClick={executeDelete} className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors">ลบรายการ</button>
            </div>
          </div>
        </div>
      )}

      {editingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="modal-pop bg-white rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl" style={{ maxHeight: '90vh' }}>
            <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold flex items-center gap-2"><Edit3 className="text-blue-600" /> แก้ไขข้อมูลการจอง</h2>
              <button onClick={() => setEditingBooking(null)} className="p-2 bg-white rounded-full text-gray-500 hover:bg-gray-100 transition-colors shadow-sm"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              {renderFieldGrid(editingBooking, handleEditChange, false)}
            </div>

            <div className="p-4 md:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setEditingBooking(null)} className="px-6 py-3 rounded-xl font-bold text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleSaveEdit} className="px-8 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md flex items-center gap-2 transition-transform active:scale-95">
                <Save size={20} /> บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {saveStatus !== 'idle' && (
        <div
          className="toast-in fixed bottom-5 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 font-bold text-sm text-white"
          style={{ backgroundColor: saveStatus === 'error' ? '#dc2626' : saveStatus === 'saved' ? '#16a34a' : '#2563eb' }}
        >
          {saveStatus === 'saving' && (<><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</>)}
          {saveStatus === 'saved' && (<><Check size={16} /> บันทึกแล้ว</>)}
          {saveStatus === 'error' && (<><AlertOctagon size={16} /> บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง</>)}
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .seat-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .seat-btn:hover { transform: scale(1.1); box-shadow: 0 4px 10px rgba(0,0,0,0.12); }
        @keyframes modalPop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .modal-pop { animation: modalPop 0.18s ease-out; }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .toast-in { animation: toastIn 0.2s ease-out; }
      `}} />
    </div>
  );
}
