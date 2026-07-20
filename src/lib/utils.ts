export interface Currency {
  s: string; // Symbol (e.g. '$', '₹')
  n: string; // Name (e.g. 'US Dollar')
  c: string; // Code (e.g. 'USD')
}

export const worldCurrencies: Currency[] = [
  { s: 'AED', n: 'UAE Dirham', c: 'AED' },
  { s: 'AFN', n: 'Afghan Afghani', c: 'AFN' },
  { s: 'ALL', n: 'Albanian Lek', c: 'ALL' },
  { s: 'AMD', n: 'Armenian Dram', c: 'AMD' },
  { s: 'ANG', n: 'NL Antillean Guilder', c: 'ANG' },
  { s: 'AOA', n: 'Angolan Kwanza', c: 'AOA' },
  { s: 'ARS', n: 'Argentine Peso', c: 'ARS' },
  { s: 'AUD', n: 'Australian Dollar', c: 'AUD' },
  { s: 'AWG', n: 'Aruban Florin', c: 'AWG' },
  { s: 'AZN', n: 'Azerbaijani Manat', c: 'AZN' },
  { s: 'BAM', n: 'Bosnia-Herzegovina Mark', c: 'BAM' },
  { s: 'BBD', n: 'Barbadian Dollar', c: 'BBD' },
  { s: 'BDT', n: 'Bangladeshi Taka', c: 'BDT' },
  { s: 'BGN', n: 'Bulgarian Lev', c: 'BGN' },
  { s: 'BHD', n: 'Bahraini Dinar', c: 'BHD' },
  { s: 'BIF', n: 'Burundian Franc', c: 'BIF' },
  { s: 'BMD', n: 'Bermudan Dollar', c: 'BMD' },
  { s: 'BND', n: 'Brunei Dollar', c: 'BND' },
  { s: 'BOB', n: 'Bolivian Boliviano', c: 'BOB' },
  { s: 'BRL', n: 'Brazilian Real', c: 'BRL' },
  { s: 'BSD', n: 'Bahamian Dollar', c: 'BSD' },
  { s: 'BTC', n: 'Bitcoin', c: 'BTC' },
  { s: 'BTN', n: 'Bhutanese Ngultrum', c: 'BTN' },
  { s: 'BWP', n: 'Botswana Pula', c: 'BWP' },
  { s: 'BYN', n: 'Belarusian Ruble', c: 'BYN' },
  { s: 'BZD', n: 'Belize Dollar', c: 'BZD' },
  { s: 'CAD', n: 'Canadian Dollar', c: 'CAD' },
  { s: 'CDF', n: 'Congolese Franc', c: 'CDF' },
  { s: 'CHF', n: 'Swiss Franc', c: 'CHF' },
  { s: 'CLP', n: 'Chilean Peso', c: 'CLP' },
  { s: 'CNY', n: 'Chinese Yuan', c: 'CNY' },
  { s: 'COP', n: 'Colombian Peso', c: 'COP' },
  { s: 'CRC', n: 'Costa Rican Colón', c: 'CRC' },
  { s: 'CUC', n: 'Cuban Convertible Peso', c: 'CUC' },
  { s: 'CUP', n: 'Cuban Peso', c: 'CUP' },
  { s: 'CVE', n: 'Cape Verdean Escudo', c: 'CVE' },
  { s: 'CZK', n: 'Czech Koruna', c: 'CZK' },
  { s: 'DJF', n: 'Djiboutian Franc', c: 'DJF' },
  { s: 'DKK', n: 'Danish Krone', c: 'DKK' },
  { s: 'DOP', n: 'Dominican Peso', c: 'DOP' },
  { s: 'DZD', n: 'Algerian Dinar', c: 'DZD' },
  { s: 'EGP', n: 'Egyptian Pound', c: 'EGP' },
  { s: 'ERN', n: 'Eritrean Nakfa', c: 'ERN' },
  { s: 'ETB', n: 'Ethiopian Birr', c: 'ETB' },
  { s: '€', n: 'Euro', c: 'EUR' },
  { s: 'FJD', n: 'Fijian Dollar', c: 'FJD' },
  { s: 'FKP', n: 'Falkland Islands Pound', c: 'FKP' },
  { s: '£', n: 'British Pound', c: 'GBP' },
  { s: 'GEL', n: 'Georgian Lari', c: 'GEL' },
  { s: 'GGP', n: 'Guernsey Pound', c: 'GGP' },
  { s: 'GHS', n: 'Ghanaian Cedi', c: 'GHS' },
  { s: 'GIP', n: 'Gibraltar Pound', c: 'GIP' },
  { s: 'GMD', n: 'Gambian Dalasi', c: 'GMD' },
  { s: 'GNF', n: 'Guinean Franc', c: 'GNF' },
  { s: 'GTQ', n: 'Guatemalan Quetzal', c: 'GTQ' },
  { s: 'GYD', n: 'Guyanese Dollar', c: 'GYD' },
  { s: 'HKD', n: 'HK Dollar', c: 'HKD' },
  { s: 'HNL', n: 'Honduran Lempira', c: 'HNL' },
  { s: 'HRK', n: 'Croatian Kuna', c: 'HRK' },
  { s: 'HTG', n: 'Haitian Gourde', c: 'HTG' },
  { s: 'HUF', n: 'Hungarian Forint', c: 'HUF' },
  { s: 'IDR', n: 'Indonesian Rupiah', c: 'IDR' },
  { s: 'ILS', n: 'Israeli Shekel', c: 'ILS' },
  { s: 'IMP', n: 'Isle of Man Pound', c: 'IMP' },
  { s: '₹', n: 'Indian Rupee', c: 'INR' },
  { s: 'IQD', n: 'Iraqi Dinar', c: 'IQD' },
  { s: 'IRR', n: 'Iranian Rial', c: 'IRR' },
  { s: 'ISK', n: 'Icelandic Króna', c: 'ISK' },
  { s: 'JEP', n: 'Jersey Pound', c: 'JEP' },
  { s: 'JMD', n: 'Jamaican Dollar', c: 'JMD' },
  { s: 'JOD', n: 'Jordanian Dinar', c: 'JOD' },
  { s: '¥', n: 'Japanese Yen', c: 'JPY' },
  { s: 'KES', n: 'Kenyan Shilling', c: 'KES' },
  { s: 'KGS', n: 'Kyrgystani Som', c: 'KGS' },
  { s: 'KHR', n: 'Cambodian Riel', c: 'KHR' },
  { s: 'KMF', n: 'Comorian Franc', c: 'KMF' },
  { s: 'KPW', n: 'North Korean Won', c: 'KPW' },
  { s: 'KRW', n: 'South Korean Won', c: 'KRW' },
  { s: 'KWD', n: 'Kuwaiti Dinar', c: 'KWD' },
  { s: 'KYD', n: 'Cayman Islands Dollar', c: 'KYD' },
  { s: 'KZT', n: 'Kazakhstani Tenge', c: 'KZT' },
  { s: 'LAK', n: 'Laotian Kip', c: 'LAK' },
  { s: 'LBP', n: 'Lebanese Pound', c: 'LBP' },
  { s: 'LKR', n: 'Sri Lankan Rupee', c: 'LKR' },
  { s: 'LRD', n: 'Liberian Dollar', c: 'LRD' },
  { s: 'LSL', n: 'Lesotho Loti', c: 'LSL' },
  { s: 'LYD', n: 'Libyan Dinar', c: 'LYD' },
  { s: 'MAD', n: 'Moroccan Dirham', c: 'MAD' },
  { s: 'MDL', n: 'Moldovan Leu', c: 'MDL' },
  { s: 'MGA', n: 'Malagasy Ariary', c: 'MGA' },
  { s: 'MKD', n: 'Macedonian Denar', c: 'MKD' },
  { s: 'MMK', n: 'Myanmar Kyat', c: 'MMK' },
  { s: 'MNT', n: 'Mongolian Tugrik', c: 'MNT' },
  { s: 'MOP', n: 'Macanese Pataca', c: 'MOP' },
  { s: 'MRU', n: 'Mauritanian Ouguiya', c: 'MRU' },
  { s: 'MUR', n: 'Mauritian Rupee', c: 'MUR' },
  { s: 'MVR', n: 'Maldivian Rufiyaa', c: 'MVR' },
  { s: 'MWK', n: 'Malawian Kwacha', c: 'MWK' },
  { s: 'MXN', n: 'Mexican Peso', c: 'MXN' },
  { s: 'MYR', n: 'Malaysian Ringgit', c: 'MYR' },
  { s: 'MZN', n: 'Mozambican Metical', c: 'MZN' },
  { s: 'NAD', n: 'Namibian Dollar', c: 'NAD' },
  { s: 'NGN', n: 'Nigerian Naira', c: 'NGN' },
  { s: 'NIO', n: 'Nicaraguan Córdoba', c: 'NIO' },
  { s: 'NOK', n: 'Norwegian Krone', c: 'NOK' },
  { s: 'NPR', n: 'Nepalese Rupee', c: 'NPR' },
  { s: 'NZD', n: 'NZ Dollar', c: 'NZD' },
  { s: 'OMR', n: 'Omani Rial', c: 'OMR' },
  { s: 'PAB', n: 'Panamanian Balboa', c: 'PAB' },
  { s: 'PEN', n: 'Peruvian Sol', c: 'PEN' },
  { s: 'PGK', n: 'Papua New Guinean Kina', c: 'PGK' },
  { s: 'PHP', n: 'Philippine Peso', c: 'PHP' },
  { s: 'PKR', n: 'Pakistani Rupee', c: 'PKR' },
  { s: 'PLN', n: 'Polish Zloty', c: 'PLN' },
  { s: 'PYG', n: 'Paraguayan Guarani', c: 'PYG' },
  { s: 'QAR', n: 'Qatari Riyal', c: 'QAR' },
  { s: 'RON', n: 'Romanian Leu', c: 'RON' },
  { s: 'RSD', n: 'Serbian Dinar', c: 'RSD' },
  { s: 'RUB', n: 'Russian Ruble', c: 'RUB' },
  { s: 'RWF', n: 'Rwandan Franc', c: 'RWF' },
  { s: 'SAR', n: 'Saudi Riyal', c: 'SAR' },
  { s: 'SBD', n: 'Solomon Islands Dollar', c: 'SBD' },
  { s: 'SCR', n: 'Seychellois Rupee', c: 'SCR' },
  { s: 'SDG', n: 'Sudanese Pound', c: 'SDG' },
  { s: 'SEK', n: 'Swedish Krona', c: 'SEK' },
  { s: 'SGD', n: 'Singapore Dollar', c: 'SGD' },
  { s: 'SHP', n: 'St. Helena Pound', c: 'SHP' },
  { s: 'SLL', n: 'Sierra Leonean Leone', c: 'SLL' },
  { s: 'SOS', n: 'Somali Shilling', c: 'SOS' },
  { s: 'SRD', n: 'Surinamese Dollar', c: 'SRD' },
  { s: 'STN', n: 'São Tomé & Príncipe Dobra', c: 'STN' },
  { s: 'SVC', n: 'Salvadoran Colón', c: 'SVC' },
  { s: 'SYP', n: 'Syrian Pound', c: 'SYP' },
  { s: 'SZL', n: 'Swazi Lilangeni', c: 'SZL' },
  { s: '฿', n: 'Thai Baht', c: 'THB' },
  { s: 'TJS', n: 'Tajikistani Somoni', c: 'TJS' },
  { s: 'TMT', n: 'Turkmenistani Manat', c: 'TMT' },
  { s: 'TND', n: 'Tunisian Dinar', c: 'TND' },
  { s: 'TOP', n: 'Tongan Paʻanga', c: 'TOP' },
  { s: '₺', n: 'Turkish Lira', c: 'TRY' },
  { s: 'TTD', n: 'Trinidad & Tobago Dollar', c: 'TTD' },
  { s: 'TWD', n: 'New Taiwan Dollar', c: 'TWD' },
  { s: 'TZS', n: 'Tanzanian Shilling', c: 'TZS' },
  { s: 'UAH', n: 'Ukrainian Hryvnia', c: 'UAH' },
  { s: 'UGX', n: 'Ugandan Shilling', c: 'UGX' },
  { s: '$', n: 'US Dollar', c: 'USD' },
  { s: 'UYU', n: 'Uruguayan Peso', c: 'UYU' },
  { s: 'UZS', n: 'Uzbekistani Som', c: 'UZS' },
  { s: 'VES', n: 'Venezuelan Bolívar', c: 'VES' },
  { s: 'VND', n: 'Vietnamese Dong', c: 'VND' },
  { s: 'VUV', n: 'Vanuatu Vatu', c: 'VUV' },
  { s: 'WST', n: 'Samoan Tala', c: 'WST' },
  { s: 'XAF', n: 'Central African CFA Franc', c: 'XAF' },
  { s: 'XCD', n: 'East Caribbean Dollar', c: 'XCD' },
  { s: 'XOF', n: 'West African CFA Franc', c: 'XOF' },
  { s: 'XPF', n: 'CFP Franc', c: 'XPF' },
  { s: 'YER', n: 'Yemeni Rial', c: 'YER' },
  { s: 'ZAR', n: 'South African Rand', c: 'ZAR' },
  { s: 'ZMW', n: 'Zambian Kwacha', c: 'ZMW' }
];

export const getEmoji = (t: string): string | null => {
  const text = t.toLowerCase();
  
  if (text.includes('settle') || text.includes('payback') || text.includes('refund')) return '💸';
  if (text.includes('grocery') || text.includes('groceries') || text.includes('supermarket') || text.includes('mart') || text.includes('veggie') || text.includes('vegetable')) return '🛒';
  
  const map: { keys: string[]; emoji: string }[] = [
    // Food & Groceries
    { keys: ['pizza', 'burger', 'sandwich', 'sushi', 'mcdonald', 'kfc', 'subway', 'maggi', 'noodle', 'pasta', 'cheese', 'butter', 'milk', 'snacks', 'chips', 'momo', 'roll', 'kebab', 'fries'], emoji: '🍕' },
    { keys: ['groceries', 'grocery', 'supermarket', 'mart', 'market', 'veggie', 'vegetable', 'potato', 'tomato', 'onion', 'salad', 'egg', 'eggs', 'bread', 'rice', 'flour', 'wheat', 'oil'], emoji: '🛒' },
    { keys: ['meat', 'chicken', 'mutton', 'beef', 'pork', 'steak', 'fish', 'seafood'], emoji: '🥩' },
    { keys: ['cashew', 'almond', 'walnut', 'peanut', 'nuts', 'pistachio', 'hazelnut', 'chestnut', 'coconut', 'dry fruit', 'dryfruits', 'dates', 'seeds'], emoji: '🥜' },
    { keys: ['apple', 'banana', 'mango', 'orange', 'grape', 'strawberry', 'fruit', 'fruits'], emoji: '🍎' },
    { keys: ['cake', 'chocolate', 'ice cream', 'icecream', 'dessert', 'sweet', 'sweets', 'candy', 'donut', 'waffle', 'pancake', 'pastry', 'cookie', 'cookies'], emoji: '🍰' },
    { keys: ['juice', 'shake', 'smoothie', 'water', 'soda', 'coke', 'pepsi', 'sprite', 'cold drink', 'beverage', 'mocktail'], emoji: '🥤' },
    { keys: ['coffee', 'tea', 'cafe', 'chai', 'espresso', 'cappuccino', 'latte', 'starbucks'], emoji: '☕' },
    { keys: ['beer', 'wine', 'pub', 'bar', 'club', 'alcohol', 'drink', 'cocktail', 'whiskey', 'vodka', 'rum', 'party', 'cheers'], emoji: '🍻' },
    
    // Transport & Utilities
    { keys: ['flight', 'plane', 'air', 'travel', 'trip', 'vacation', 'holiday', 'airport'], emoji: '✈️' },
    { keys: ['cab', 'taxi', 'uber', 'lyft', 'ola', 'bolt', 'auto', 'ride'], emoji: '🚗' },
    { keys: ['train', 'metro', 'subway', 'bus', 'railway', 'ticket', 'station'], emoji: '🚇' },
    { keys: ['fuel', 'gas', 'petrol', 'diesel', 'cng'], emoji: '⛽' },
    { keys: ['toll', 'parking', 'fine', 'challan'], emoji: '🎫' },
    
    // Living, Household & Bills
    { keys: ['hotel', 'stay', 'room', 'hostel', 'airbnb', 'resort', 'pg', 'palace', 'castle', 'fort', 'monument', 'temple', 'church', 'mosque', 'sightseeing'], emoji: '🏰' },
    { keys: ['towel', 'soap', 'shampoo', 'bathroom', 'washroom', 'shower', 'bath', 'toiletries', 'brush', 'paste'], emoji: '🧼' },
    { keys: ['rent', 'house', 'home', 'flat', 'apartment', 'roommate', 'broker', 'maintenance'], emoji: '🏠' },
    { keys: ['electricity', 'power', 'utility', 'utilities', 'current', 'eb', 'gas cylinder'], emoji: '⚡' },
    { keys: ['wifi', 'internet', 'broadband', 'ethernet', 'net'], emoji: '📶' },
    { keys: ['phone', 'mobile', 'recharge', 'sim', 'call'], emoji: '📱' },
    { keys: ['laundry', 'washing', 'detergent', 'cleaner', 'cleaning', 'maid', 'garbage', 'trash', 'broom'], emoji: '🧹' },
    
    // Entertainment & Office/School
    { keys: ['movie', 'cinema', 'show', 'netflix', 'spotify', 'youtube', 'prime', 'hulu', 'hbo', 'disney', 'subscription'], emoji: '🍿' },
    { keys: ['ticket', 'event', 'concert', 'gig', 'play', 'standup', 'museum', 'zoo'], emoji: '🎟️' },
    { keys: ['game', 'gaming', 'pubg', 'xbox', 'ps5', 'steam', 'playstation', 'nintendo', 'arcade'], emoji: '🎮' },
    { keys: ['party', 'celebrate', 'fun', 'dance', 'disco', 'clubbing', 'festival'], emoji: '🎉' },
    { keys: ['gift', 'present', 'birthday', 'anniversary', 'wedding', 'cake', 'chocolate', 'flowers'], emoji: '🎁' },
    { keys: ['book', 'books', 'stationery', 'notebook', 'pen', 'pencil', 'exam', 'copy', 'print', 'photocopy', 'course', 'class', 'school', 'college'], emoji: '📚' },
    
    // Electronics & Shopping
    { keys: ['laptop', 'computer', 'pc', 'monitor', 'keyboard', 'mouse', 'charger', 'cable', 'headphone', 'headphones', 'earbuds'], emoji: '💻' },
    { keys: ['shopping', 'clothes', 'shirt', 'pant', 'jeans', 'tshirt', 'shoe', 'shoes', 'bag', 'wallet', 'watch', 'zara', 'h&m', 'amazon', 'flipkart', 'myntra'], emoji: '🛍️' },
    
    // Health & Sports
    { keys: ['medicine', 'medical', 'doctor', 'clinic', 'hospital', 'pharma', 'tablet', 'health', 'dentist', 'eye'], emoji: '🏥' },
    { keys: ['gym', 'fitness', 'workout', 'running', 'sports', 'football', 'cricket', 'soccer', 'basketball', 'badminton', 'turf', 'swim', 'chess'], emoji: '🏋️‍♂️' },
    
    // Animals & Others
    { keys: ['cow', 'buffalo', 'goat', 'sheep', 'bull'], emoji: '🐄' },
    { keys: ['dog', 'puppy'], emoji: '🐶' },
    { keys: ['cat', 'kitten'], emoji: '🐱' },
    { keys: ['pig'], emoji: '🐷' },
    { keys: ['chicken', 'hen', 'rooster'], emoji: '🐔' },
    { keys: ['horse'], emoji: '🐴' },
    { keys: ['bird', 'parrot', 'sparrow'], emoji: '🐦' },
    { keys: ['fish', 'aquarium'], emoji: '🐟' },
    { keys: ['pet', 'vet', 'animal'], emoji: '🐾' }
  ];

  for (const item of map) {
    for (const key of item.keys) {
      if (text.includes(key)) {
        return item.emoji;
      }
    }
  }
  return null;
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr || dateStr === 'Today' || dateStr === 'Yesterday') return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Compact money formatter for display in tight UI (net-balance pill, group cards,
 * settle cards, activity rows). Large values are abbreviated with K/M/B so they
 * never overflow; values under 100,000 keep full comma grouping. Returns only the
 * number part — callers prepend the currency symbol/code. The exact full value is
 * still available in detail views (tap-through, modals, CSV export).
 *   1500000 -> "1.5M"   450000000 -> "450M"   75000 -> "75K"   9999 -> "9,999"
 */
export const formatCompactAmount = (value: number): string => {
  const abs = Math.abs(value);
  // Pin to 'en-US' so the notation is always K/M/B — leaving the locale undefined
  // would render Lakh/Crore on en-IN systems, etc. Abbreviate from 10K up so
  // amounts like 75,000 read as "75K"; keep smaller amounts exact for precision.
  if (abs >= 10000) {
    return abs.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  }
  return abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export const getExactTime = (id: string | number): string | null => {
  const timestamp = Number(id);
  if (!isNaN(timestamp) && timestamp > 1000000000000) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }
  return null;
};

export const getMonthYearKey = (dateStr: string, id: string | number): { key: string; label: string } => {
  let d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const timestamp = Number(id);
    if (!isNaN(timestamp) && timestamp > 1000000000000) {
      d = new Date(timestamp);
    } else {
      d = new Date();
    }
  }
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return {
    key: `${d.getFullYear()}-${d.getMonth()}`,
    label: `${months[d.getMonth()]} ${d.getFullYear()}`
  };
};

export interface GroupColor {
  bg: string;
  text: string;
  border: string;
}

export const GROUP_COLORS: GroupColor[] = [
  { bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD' }, // Sky
  { bg: '#E0E7FF', text: '#4338CA', border: '#C7D2FE' }, // Indigo
  { bg: '#D1FAE5', text: '#047857', border: '#A7F3D0' }, // Emerald / Mint Green
  { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' }, // Amber
  { bg: '#F3E8FF', text: '#6D28D9', border: '#E9D5FF' }, // Lavender
  { bg: '#FFE4E6', text: '#BE185D', border: '#FECDD3' }  // Pink
];
