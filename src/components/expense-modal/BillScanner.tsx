import React, { useState, useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { downscaleImageFile } from '../../lib/imageUtils';

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
  const priceNumbers: number[] = [];
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
      if (m.includes('.')) {
        priceNumbers.push(val);
      }
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
    if (totalAmount === 0) {
      if (priceNumbers.length > 0) {
        totalAmount = Math.max(...priceNumbers);
      } else if (filteredNumbers.length > 0) {
        totalAmount = Math.max(...filteredNumbers);
      }
    }
    if (totalAmount === 0) {
      totalAmount = curr === '₹' ? 1200 : 45;
    }
    
    // Extract item names for notes
    const itemLines: string[] = [];
    const skipKeywords = ['total', 'tax', 'gst', 'cash', 'card', 'change', 'amount', 'due', 'balance', 'pay', 'net', 'subtotal', 'bill', 'qty', 'rate', 'price', 'discount', 'cgst', 'sgst', 'igst', 'tip', 'visa', 'mastercard', 'upi', 'phonepe', 'gpay'];
    
    lines.forEach((line) => {
      const lower = line.toLowerCase();
      if (skipKeywords.some(w => lower.includes(w))) return;
      
      const match = line.match(/^[^a-zA-Z]*([a-zA-Z\s]{4,40}).*?\b\d+(?:\.\d{2})?\b/);
      if (match) {
        const itemName = match[1].trim();
        // Filter out single-word gibberish or non-item looking text
        if (itemName.length >= 4 && !itemName.toLowerCase().includes('cashier') && !itemName.toLowerCase().includes('table') && !itemName.toLowerCase().includes('date') && !itemName.toLowerCase().includes('time')) {
          itemLines.push(itemName);
        }
      }
    });

    let extractedNotes = '';
    if (itemLines.length > 0) {
      const uniqueItems = Array.from(new Set(itemLines));
      extractedNotes = uniqueItems.slice(0, 5).join(', ');
      if (uniqueItems.length > 5) {
        extractedNotes += '...';
      }
    }
    
    return { title, amt: totalAmount.toFixed(2), notes: extractedNotes };
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
  // Open on the Camera / Upload choice screen (not the low-quality in-app live
  // feed). "Camera" uses the phone's native camera; "Upload Bill" the gallery.
  const [isCameraLive, setIsCameraLive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (showScannerModal && !scanFile) {
      setIsCameraLive(true);
    } else {
      setIsCameraLive(false);
    }
  }, [showScannerModal, scanFile]);

  useEffect(() => {
    if (isCameraLive) {
      navigator.mediaDevices
        .getUserMedia({
          video: { 
            facingMode: 'environment', 
            width: { ideal: 3840 }, 
            height: { ideal: 2160 },
            // @ts-ignore
            advanced: [{ focusMode: 'continuous' }]
          },
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
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
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

  // Downscale via the memory-safe helper (createImageBitmap) — full-res camera
  // photos otherwise crash lower-RAM phones. 1000px @ 0.65 keeps receipt text
  // readable while staying small.
  const prepareScanImage = (file: File): Promise<string> => downscaleImageFile(file, 1600, 0.85);

  const runGeminiScan = (file: File, apiKey: string) => {
    setScanProgress(10);
    setScannerStatus('AI Scanner: Preparing image...');
    prepareScanImage(file)
      .then((result) => {
      const base64Data = result.split(',')[1];
      const mimeType = result.substring(5, result.indexOf(';')) || 'image/jpeg';
      // Use the small compressed image for the on-screen preview too (holding the
      // full-res data URL is what pushed memory over the edge).
      setScanPreview(result);
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
      })
      .catch((err) => {
        console.error('Image preparation error:', err);
        runLocalTesseractOCR(file);
      });
  };

  const runLocalTesseractOCR = (file: File) => {
    setScanProgress(0);
    setScannerStatus('Reading receipt image...');
    
    // Pass the downscaled memory-safe image to Tesseract to improve accuracy
    // and prevent browser memory crashes on huge native photos.
    prepareScanImage(file).then((dataUrl) => {
      Tesseract.recognize(dataUrl, 'eng', {
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

        onScanComplete({
          title: parsed.title || 'Scanned Receipt 📄',
          amt: parsed.amt || '',
          notes: parsed.notes || '',
          attachments: [dataUrl],
        });

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
    }).catch(err => {
      console.error('OCR Prep error:', err);
      setScanError('Failed to prep image for OCR. Please enter details manually.');
    });
  };

  const handleScannerImageUpload = (file: File) => {
    setScanFile(file);
    setScanError('');
    // Preview is set from the small compressed image during the scan (see
    // runGeminiScan). We deliberately do NOT read the full-res file here — that
    // extra big data URL is what tipped lower-RAM phones into "low memory".
    setScanPreview(null);

    // Prefer a locally-saved key, else the build-time env key. No hard-coded
    // fallback — an invalid key just causes 401s. With no key we skip Gemini
    // and go straight to local OCR.
    const savedApiKey = localStorage.getItem('divido_gemini_api_key');
    const apiKey = savedApiKey || import.meta.env.VITE_GEMINI_API_KEY || '';
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
        background: '#0F172A',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2500,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', zIndex: 10 }}>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '1px' }}>
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
              fontSize: '20px',
              color: '#F8FAFC',
              fontWeight: 'bold',
              opacity: scanProgress > 0 && scanProgress < 100 ? 0.3 : 0.8,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {scanFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, padding: '40px 20px', justifyContent: 'center' }}>
            <div className="scan-preview-container" style={{ background: '#1E293B', border: 'none', margin: '0 auto', maxWidth: '400px', width: '100%' }}>
              {scanPreview ? (
                <img src={scanPreview} className="scan-preview-img" alt="Receipt preview" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#94A3B8', padding: '40px 0' }}>
                  <span style={{ fontSize: '64px' }}>📄</span>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>{scanFile.name}</span>
                </div>
              )}
              {scanProgress < 100 && (
                <div className="scan-overlay">
                  <div className="scan-line" />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 20px', margin: '0 auto', maxWidth: '400px', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 600 }}>
                <span style={{ color: '#F8FAFC', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                  📄 {scanFile.name}
                </span>
                <span style={{ color: '#10B981' }}>{scanProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '12px', background: '#334155', borderRadius: '6px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${scanProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #10B981, #34D399)',
                    transition: 'width 0.1s linear',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.5)',
                  }}
                />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8', textAlign: 'center', marginTop: '8px' }}>
                {scannerStatus}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', overflow: 'hidden', background: '#000' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
            />
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                background: 'rgba(16, 185, 129, 0.95)',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
              }}
            >
              🟢 Live Camera
            </div>

            <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
              <button
                type="button"
                onClick={capturePhoto}
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  background: '#10B981',
                  border: '4px solid #fff',
                  boxShadow: '0 0 0 4px rgba(16,185,129,0.3), 0 10px 20px rgba(0,0,0,0.5)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  outline: 'none',
                }}
                title="Capture Photo"
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: '#fff',
                }} />
              </button>
              
              <span
                onClick={() => document.getElementById('receipt-file-input')?.click()}
                style={{
                  color: '#F8FAFC',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  backdropFilter: 'blur(4px)',
                }}
              >
                📂 Upload from gallery
              </span>
            </div>
          </div>
        )}

        {(cameraError || scanError) && (
          <div
            style={{
              position: 'absolute',
              bottom: '140px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.95)',
              border: '1.5px solid #FCA5A5',
              borderRadius: '12px',
              fontSize: '13px',
              color: '#fff',
              fontWeight: 600,
              textAlign: 'center',
              lineHeight: '1.4',
              zIndex: 100,
              width: '90%',
              maxWidth: '320px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            }}
          >
            ⚠️ {cameraError || scanError}
          </div>
        )}

        {/* File Input */}
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
      </div>
    </div>
  );
};
