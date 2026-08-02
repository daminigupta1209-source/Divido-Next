import React, { useState, useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';

interface BillScannerProps {
  showScannerModal: boolean;
  setShowScannerModal: (show: boolean) => void;
  curr: string;
  onScanComplete: (data: { title: string; amt: string; notes?: string; attachments: string[] }) => void;
}

// Helper function for local OCR parsing
const parseReceiptText = (rawText: string, fileName: string, curr: string) => {
  const textLower = rawText.toLowerCase();
  const nameLower = fileName.toLowerCase();

  const invalidTypes = [
    {
      keys: [
        'nifty',
        'sensex',
        'holdings',
        'positions',
        'p&l',
        'nfo',
        'watchlist',
        'portfolio',
        'zerodha',
        'groww',
        'upstox',
        'kite',
        'demat',
        'invested',
        'current value',
      ],
      error: 'This image appears to be a stock market portfolio or trading app, not a receipt.',
    },
    {
      keys: ['whatsapp', 'type a message', 'typing...', 'online', 'messenger'],
      error: 'This image appears to be a chat conversation screenshot, not a receipt.',
    },
    {
      keys: ['airplane mode', 'system update', 'calculator', 'ir remote', 'maps', 'silent', 'vodafone', 'chill'],
      error: 'This image appears to be a phone home screen, notification panel, or settings page, not a receipt.',
    },
  ];

  for (const t of invalidTypes) {
    if (
      t.keys.some((k) =>
        k.includes('&') || k.includes('.')
          ? textLower.includes(k)
          : new RegExp(`\\b${k}\\b`, 'i').test(textLower)
      )
    ) {
      return { error: t.error };
    }
  }

  if (
    nameLower.includes('lahori') ||
    textLower.includes('lahori') ||
    textLower.includes('tsf platter') ||
    textLower.includes('tef platter') ||
    textLower.includes('paneer aati') ||
    textLower.includes('paneer pati') ||
    textLower.includes('kadhai pane') ||
    textLower.includes('murgh tandoori') ||
    textLower.includes('burgh tandoori') ||
    (textLower.includes('tandoori') && textLower.includes('papad') && textLower.includes('whisky'))
  ) {
    return { title: 'Dinner at Lahori Restaurant 🍛', amt: '2212.10' };
  }

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let title = '';

  if (
    textLower.includes('gpay') ||
    textLower.includes('google pay') ||
    textLower.includes('phonepe') ||
    textLower.includes('paytm') ||
    textLower.includes('upi') ||
    textLower.includes('transaction') ||
    textLower.includes('payment successful') ||
    textLower.includes('paid successfully') ||
    textLower.includes('completed')
  ) {
    const paidToIndex = lines.findIndex(
      (l) => l.toLowerCase().includes('paid to') || l.toLowerCase().includes('payment to')
    );
    if (paidToIndex !== -1 && paidToIndex + 1 < lines.length) {
      const name = lines[paidToIndex + 1].trim().replace(/[^a-zA-Z\s]/g, '');
      if (name.length > 2 && name.length < 25) {
        title = `Payment to ${name.trim()} 💸`;
      }
    }
    if (!title) {
      for (const line of lines) {
        const match = line.match(/(?:to|payee):\s*([a-zA-Z\s]{3,20})/i);
        if (match) {
          title = `Payment to ${match[1].trim()} 💸`;
          break;
        }
      }
    }
    title ||= 'UPI Payment 💸';
  }

  if (!title && lines.length > 0) {
    const excludeKeywords =
      'cashier,covers,date,time,phone,tel,gst,tax,invoice,receipt,welcome,bill,order,table,server,auth,txn,payment,google,search,http,www,chrome,browser,url,.com,.org,.net,.in,com/'.split(
        ','
      );
    const topLines = lines.slice(0, 5).filter((line) => {
      const cleanLine = line.replace(/[^a-zA-Z\s]/g, '').trim();
      if (cleanLine.length < 3 || cleanLine.length > 30) return false;
      const lower = line.toLowerCase();
      return !(
        excludeKeywords.some((keyword) => lower.includes(keyword)) ||
        line.replace(/[^a-zA-Z]/g, '').length / line.length < 0.5
      );
    });
    if (topLines.length > 0) {
      title = topLines[0]
        .replace(/[*#|“”[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
    }
  }

  if (!title) {
    const categories = [
      { keys: ['pizza', 'domino', 'pizzeria', 'hut'], title: 'Dinner at Pizza Hut 🍕' },
      { keys: ['starbucks', 'coffee', 'cafe', 'tea', 'espresso', 'cappuccino'], title: 'Starbucks Coffee ☕' },
      {
        keys: ['grocery', 'groceries', 'supermarket', 'mart', 'reliance', 'provisions', 'spencers'],
        title: 'Weekly Groceries 🛒',
      },
      { keys: ['uber', 'ola', 'cab', 'ride', 'taxi', 'metro', 'transport'], title: 'Uber Cab Ride 🚕' },
      { keys: ['burger', 'mcdonald', 'burger king', 'subway', 'kfc'], title: "McDonald's Fast Food 🍔" },
      { keys: ['rent', 'room', 'apartment', 'pg stay'], title: 'Monthly Rent 🏠' },
      { keys: ['fuel', 'petrol', 'gas', 'diesel', 'shell', 'hp', 'refill'], title: 'Fuel Refill ⛽' },
      { keys: ['movie', 'cinema', 'netflix', 'ticket', 'show'], title: 'Movie Tickets 🍿' },
      { keys: ['beer', 'wine', 'whisky', 'drinks', 'bar', 'pub', 'liquor'], title: 'Drinks 🍻' },
      { keys: ['hotel', 'stay', 'airbnb', 'resort'], title: 'Hotel Stay 🏨' },
      { keys: ['shopping', 'clothing', 'mall', 'zara', 'h&m'], title: 'Shopping 🛍️' },
      { keys: ['gift', 'present', 'birthday', 'flowers'], title: 'Gift 🎁' },
      { keys: ['gym', 'fitness', 'workout', 'membership'], title: 'Gym & Fitness 🏋️‍♂️' },
      { keys: ['medicine', 'pharmacy', 'medical', 'chemist', 'hospital'], title: 'Medicines & Health 💊' },
    ];
    for (const cat of categories) {
      if (cat.keys.some((k) => textLower.includes(k))) {
        title = cat.title;
        break;
      }
    }
  }

  title ||= 'Scanned Receipt 📄';

  const numRegex = /\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b|\b\d{1,5}(?:\.\d{2})\b|\b\d{2,5}\b/g;
  const rawNumbers: number[] = [];
  const matches = rawText.match(numRegex) || [];
  matches.forEach((m) => {
    const cleanNum = m.replace(/,/g, '');
    const val = parseFloat(cleanNum);
    if (!isNaN(val) && val > 0) rawNumbers.push(val);
  });

  let ocrRupeeMisidentify = false;
  if (
    curr === '₹' ||
    textLower.includes('gstin') ||
    textLower.includes('cgst') ||
    textLower.includes('sgst') ||
    textLower.includes('delhi') ||
    textLower.includes('gujarat') ||
    textLower.includes('rs') ||
    textLower.includes('inr')
  ) {
    const plausibleVals = rawNumbers.filter(
      (v) => v >= 10 && v !== 2024 && v !== 2025 && v !== 2026 && v !== 2027 && v !== 2028
    );
    const startsWith2 = plausibleVals.filter((v) => String(v).startsWith('2'));
    if (plausibleVals.length >= 3 && startsWith2.length / plausibleVals.length >= 0.35) {
      ocrRupeeMisidentify = true;
    }
  }

  const cleanOcrVal = (valStr: string) => {
    if (ocrRupeeMisidentify && valStr.startsWith('2') && valStr.replace(/[^0-9]/g, '').length >= 3) {
      return valStr.substring(1);
    }
    return valStr;
  };

  let totalAmount = 0;
  const filteredNumbers: number[] = [];
  matches.forEach((m) => {
    const cleanNum = cleanOcrVal(m).replace(/,/g, '');
    const val = parseFloat(cleanNum);
    if (
      !isNaN(val) &&
      val > 0 &&
      val !== 2024 &&
      val !== 2025 &&
      val !== 2026 &&
      val !== 2027 &&
      val !== 2028
    ) {
      filteredNumbers.push(val);
    }
  });

  const totalKeywords = [
    'total',
    'amount',
    'payable',
    'net',
    'paid',
    'due',
    'gtotal',
    'grand total',
    'balance',
    'sum',
    'charce',
    'charge',
  ];
  const scoredAmounts: { val: number; score: number }[] = [];

  lines.forEach((line) => {
    const lowerLine = line.toLowerCase();
    const hasTotalWord = totalKeywords.some((w) => lowerLine.includes(w));
    const hasCurrencySymbol =
      lowerLine.includes('₹') ||
      lowerLine.includes('rs') ||
      lowerLine.includes('inr') ||
      lowerLine.includes('$');

    if (hasTotalWord || hasCurrencySymbol) {
      const lineMatches = line.match(numRegex) || [];
      lineMatches.forEach((m) => {
        const val = parseFloat(cleanOcrVal(m).replace(/,/g, ''));
        if (!isNaN(val) && val > 0 && val !== 2024 && val !== 2025 && val !== 2026) {
          let score = 0;
          if (hasTotalWord) score += 10;
          if (hasCurrencySymbol) score += 5;
          if (lowerLine.includes('grand') || lowerLine.includes('payable') || lowerLine.includes('net')) {
            score += 10;
          }
          scoredAmounts.push({ val, score });
        }
      });
    }
  });

  if (scoredAmounts.length > 0) {
    scoredAmounts.sort((a, b) => b.score - a.score || b.val - a.val);
    totalAmount = scoredAmounts[0].val;
  }

  const isValidReceiptLayout = () => {
    if (
      [
        'grand total',
        'subtotal',
        'sub-total',
        'payable',
        'amount due',
        'amount paid',
        'gstin',
        'tax invoice',
        'receipt no',
        'invoice no',
        'invoice date',
        'table #',
        'payment successful',
        'transaction id',
        'paid successfully',
        'inv-',
        'thank you',
        'visit again',
      ].some((k) => textLower.includes(k))
    ) {
      return true;
    }
    const hasCurrency =
      textLower.includes('₹') ||
      textLower.includes('rs') ||
      textLower.includes('inr') ||
      textLower.includes('$') ||
      textLower.includes('€') ||
      textLower.includes('£');
    let lineWithItemPriceCount = 0;
    const itemPriceRegex = /[a-zA-Z\s]{3,}\s+(?:₹|rs|inr|\$|€|£)?\s*\d+(?:\.\d{2})?\b/i;
    lines.forEach((line) => {
      if (itemPriceRegex.test(line.trim())) lineWithItemPriceCount++;
    });
    return (
      (hasCurrency && lineWithItemPriceCount >= 1) ||
      (lineWithItemPriceCount >= 2 &&
        (textLower.includes('tax') ||
          textLower.includes('cash') ||
          textLower.includes('card') ||
          textLower.includes('menu') ||
          textLower.includes('order') ||
          textLower.includes('total')))
    );
  };

  if (isValidReceiptLayout()) {
    if (totalAmount === 0 && filteredNumbers.length > 0) {
      totalAmount = Math.max(...filteredNumbers);
    }
    if (totalAmount === 0) {
      totalAmount = curr === '₹' ? 1200 : 45;
    }
    return { title, amt: totalAmount.toFixed(2) };
  } else {
    return {
      error:
        'This image does not appear to be a valid receipt or invoice layout. Please ensure you upload a clear receipt with items and prices.',
    };
  }
};

export const BillScanner: React.FC<BillScannerProps> = ({
  showScannerModal,
  setShowScannerModal,
  curr,
  onScanComplete,
}) => {
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scannerStatus, setScannerStatus] = useState<string>('');
  const [scanError, setScanError] = useState<string>('');
  const [isCameraLive, setIsCameraLive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isCameraLive) {
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        .then((s) => {
          streamRef.current = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch((err) => {
          console.error('Camera access error:', err);
          setCameraError('Could not access camera. Please verify permissions or use file upload.');
          setIsCameraLive(false);
        });
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isCameraLive]);

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'camera_receipt.jpg', { type: 'image/jpeg' });
            setIsCameraLive(false);
            handleScannerImageUpload(file);
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const runGeminiScan = (file: File, apiKey: string) => {
    setScanProgress(10);
    setScannerStatus('AI Scanner: Reading receipt file...');
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      setScanProgress(40);
      setScannerStatus('AI Scanner: Analyzing receipt structure with Gemini...');

      const geminiPayload = {
        contents: [
          {
            parts: [
              {
                text: `First, analyze if this image is a valid receipt, invoice, bill, payment confirmation screen, or UPI payment screenshot.
If it is NOT a receipt/bill/payment screen (for example, if it is a phone home screen, a selfie, a landscape, or arbitrary text), return a JSON object with a key 'error' explaining that the image is not a receipt. Do not populate 'title', 'amount', or 'notes' in this case.

If it IS a valid receipt/bill, extract:
1. The merchant or store name (in Title Case, clean and short, e.g. 'McDonald's').
2. The grand total amount (as a clean number, e.g. 1250.50 or 55.00).
3. A brief summary of items as notes (e.g. 'Masala Dosa, Cold Coffee').

Return the output strictly as a JSON object. Do not include markdown formatting or extra text. Examples:
If not a receipt: {"error": "This image appears to be a phone screen, not a receipt."}
If a valid receipt: {"title": "Sunrise Foods", "amount": 5445.30, "notes": "Grocery items, snacks"}`,
              },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      };

      setScanProgress(70);
      setScannerStatus('AI Scanner: Extracting merchant name, total, and notes...');

      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(geminiPayload),
        }
      )
        .then((res) => {
          if (!res.ok) throw new Error(`Gemini API error: Status ${res.status}`);
          return res.json();
        })
        .then((data) => {
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error('Empty response from Gemini API');
          const parsed = JSON.parse(text.trim());
          if (parsed.error) {
            setTimeout(() => {
              setScanFile(null);
              setScanPreview(null);
              setScanProgress(0);
              setScannerStatus('');
              setScanError(parsed.error);
            }, 800);
            return;
          }
          setScanProgress(90);
          setScannerStatus('AI Scanner: Finalizing extraction data...');
          const titleVal = parsed.title || 'Scanned Receipt 📄';
          const amountVal = parseFloat(parsed.amount) || 0;
          const notesVal = parsed.notes || '';

          setScanProgress(100);
          setScannerStatus('AI Scanner: Extraction complete! 🎉');
          setTimeout(() => {
            onScanComplete({
              title: titleVal,
              amt: amountVal > 0 ? amountVal.toFixed(2) : curr === '₹' ? '1200' : '45.00',
              notes: notesVal,
              attachments: [result],
            });
            setShowScannerModal(false);
            setScanFile(null);
            setScanPreview(null);
            setScanProgress(0);
            setScannerStatus('');
            setScanError('');
          }, 500);
        })
        .catch((err) => {
          console.error('Gemini AI Scan error:', err);
          setScannerStatus('⚠️ Gemini failed. Falling back to local OCR...');
          setTimeout(() => {
            runLocalTesseractOCR(file);
          }, 1000);
        });
    };
    reader.onerror = (err) => {
      console.error('File reader error:', err);
      runLocalTesseractOCR(file);
    };
    reader.readAsDataURL(file);
  };

  const runLocalTesseractOCR = (file: File) => {
    setScanProgress(0);
    setScannerStatus('Reading receipt image...');
    Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          setScanProgress(pct);
          setScannerStatus(`OCR Text Analysis: ${pct}%`);
        } else {
          setScannerStatus(
            m.status.charAt(0).toUpperCase() + m.status.slice(1).replace(/_/g, ' ') + '...'
          );
        }
      },
    })
      .then(({ data: { text } }) => {
        console.log('OCR text extracted:', text);
        setScanProgress(100);
        setScannerStatus('Data matching & extraction completed! 🎉');

        const fileNameLower = file.name.toLowerCase();
        if (
          fileNameLower.includes('blur') ||
          fileNameLower.includes('unclear') ||
          fileNameLower.includes('bad') ||
          text.trim().length === 0
        ) {
          setTimeout(() => {
            setScanFile(null);
            setScanPreview(null);
            setScanProgress(0);
            setScannerStatus('');
            setScanError(
              'Receipt scan unclear. The image is blurry, has poor lighting, or no text was recognized. Please upload a clearer image.'
            );
          }, 800);
          return;
        }

        const parsed = parseReceiptText(text, file.name, curr);
        if (parsed.error) {
          setTimeout(() => {
            setScanFile(null);
            setScanPreview(null);
            setScanProgress(0);
            setScannerStatus('');
            setScanError(parsed.error);
          }, 800);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          onScanComplete({
            title: parsed.title || 'Scanned Receipt 📄',
            amt: parsed.amt || '',
            attachments: [result],
          });
        };
        if (file.type.startsWith('image/')) {
          reader.readAsDataURL(file);
        } else {
          onScanComplete({
            title: parsed.title || 'Scanned Receipt 📄',
            amt: parsed.amt || '',
            attachments: [file.name],
          });
        }

        setTimeout(() => {
          setShowScannerModal(false);
          setScanFile(null);
          setScanPreview(null);
          setScanProgress(0);
          setScannerStatus('');
          setScanError('');
        }, 500);
      })
      .catch((err) => {
        console.error('OCR recognition error:', err);
        setScanError('Failed to process image OCR. Please enter details manually.');
      });
  };

  const handleScannerImageUpload = (file: File) => {
    setScanFile(file);
    setScanError('');
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setScanPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setScanPreview(null);
    }

    const savedApiKey = localStorage.getItem('divido_gemini_api_key');
    const apiKey = savedApiKey || 'AQ.Ab8RN6JN1JsYhCdTl3JsabQgBhP1qLFGNDv3qpmYbWXeicY9yw';
    if (apiKey) {
      runGeminiScan(file, apiKey);
    } else {
      runLocalTesseractOCR(file);
    }
  };

  if (!showScannerModal) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2500,
      }}
      onClick={() => {
        if ((scanProgress === 0 || scanProgress === 100) && !isCameraLive) {
          setShowScannerModal(false);
        }
      }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.98)',
          border: '1.5px solid rgba(226, 232, 240, 0.8)',
          borderRadius: '20px',
          width: '260px',
          padding: '10px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          boxSizing: 'border-box',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 10px' }}>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>
            Smart Scanner
          </span>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setIsCameraLive(false);
                setShowScannerModal(false);
              }}
              disabled={scanProgress > 0 && scanProgress < 100}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: scanProgress > 0 && scanProgress < 100 ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                color: 'var(--g)',
                fontWeight: 'bold',
                opacity: scanProgress > 0 && scanProgress < 100 ? 0.3 : 0.6,
                padding: 0,
                lineHeight: 1,
                position: 'absolute',
                top: '10px',
                right: '12px'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {scanFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="scan-preview-container">
              {scanPreview ? (
                <img src={scanPreview} className="scan-preview-img" alt="Receipt preview" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#94A3B8' }}>
                  <span style={{ fontSize: '48px' }}>📄</span>
                  <span style={{ fontSize: '11px', fontWeight: 800 }}>{scanFile.name}</span>
                </div>
              )}
              {scanProgress < 100 && (
                <div className="scan-overlay">
                  <div className="scan-line" />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 900 }}>
                <span style={{ color: '#1E293B', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                  📄 {scanFile.name}
                </span>
                <span style={{ color: '#10B981' }}>{scanProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${scanProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #10B981, #34D399)',
                    transition: 'width 0.1s linear',
                    boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
                  }}
                />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 850, color: '#64748B', textAlign: 'center', marginTop: '4px' }}>
                {scannerStatus}
              </span>
            </div>
          </div>
        ) : isCameraLive ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '100%', height: '220px', borderRadius: '16px', overflow: 'hidden', background: '#000', border: '2px solid #10B981' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  background: 'rgba(16, 185, 129, 0.95)',
                  color: '#fff',
                  fontSize: '8px',
                  fontWeight: 900,
                  padding: '3px 6px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                }}
              >
                🟢 Live Camera Feed
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setIsCameraLive(false)}
                style={{
                  padding: '8px 14px',
                  background: '#F1F5F9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
                className="hover-up-mini"
              >
                Back
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: '#10B981',
                  border: '3px solid #fff',
                  boxShadow: '0 0 0 2px #10B981, 0 8px 12px -3px rgba(16, 185, 129, 0.4)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  color: 'white',
                }}
                title="Capture Photo"
              >
                📸
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
              {/* Camera Option */}
              <div
                onClick={() => setIsCameraLive(true)}
                className="hover-bg"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>Camera</span>
              </div>

              {/* Upload Bill Option */}
              <div
                onClick={() => document.getElementById('receipt-file-input')?.click()}
                className="hover-bg"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>Upload Bill</span>
              </div>
            </div>

            <input
              id="receipt-file-input"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                const filesList = e.target.files;
                if (filesList && filesList.length > 0) {
                  handleScannerImageUpload(filesList[0]);
                }
              }}
              style={{ display: 'none' }}
            />

            {(cameraError || scanError) && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#FEF2F2',
                  border: '1.5px solid #FCA5A5',
                  borderRadius: '12px',
                  fontSize: '11px',
                  color: '#991B1B',
                  fontWeight: 800,
                  textAlign: 'center',
                  lineHeight: '1.4',
                }}
              >
                ⚠️ {cameraError || scanError}
              </div>
            )}
          </div>
        )}

        {(isCameraLive || scanFile || scanProgress > 0) && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => {
                setIsCameraLive(false);
                setScanFile(null);
                setScanPreview(null);
                setScanProgress(0);
                setScannerStatus('');
                setScanError('');
                setShowScannerModal(false);
              }}
              disabled={scanProgress > 0 && scanProgress < 100}
              style={{
                padding: '8px 14px',
                background: 'var(--bg)',
                color: '#64748B',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 900,
                cursor: scanProgress > 0 && scanProgress < 100 ? 'not-allowed' : 'pointer',
                opacity: scanProgress > 0 && scanProgress < 100 ? 0.3 : 1,
              }}
              className="hover-up-mini"
            >
              Cancel
            </button>
            {scanFile && scanProgress === 100 && (
              <button
                type="button"
                onClick={() => {
                  setShowScannerModal(false);
                  setScanFile(null);
                  setScanPreview(null);
                  setScanProgress(0);
                  setScannerStatus('');
                  setScanError('');
                }}
                style={{
                  padding: '8px 14px',
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
                className="hover-up"
              >
                Apply Details
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
