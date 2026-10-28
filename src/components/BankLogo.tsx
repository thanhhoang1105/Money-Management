// src/components/BankLogo.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check, Landmark, Smartphone, CreditCard } from 'lucide-react';

export interface BankBrandInfo {
  id: string;
  code: string;
  name: string;
  shortName: string;
  category: 'BANK' | 'EWALLET' | 'CARD' | 'OTHER';
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  logoUrl?: string;
  keywords: string[];
}

export const BANK_BRANDS: BankBrandInfo[] = [
  // ================= NGÂN HÀNG VIỆT NAM =================
  {
    id: 'bank:vcb',
    code: 'VCB',
    name: 'Ngân hàng Vietcombank',
    shortName: 'Vietcombank',
    category: 'BANK',
    primaryColor: '#00703C',
    secondaryColor: '#78BE20',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/VCB.png',
    keywords: ['vietcombank', 'vcb', 'ngoai thuong', 'ngoại thương']
  },
  {
    id: 'bank:tcb',
    code: 'TCB',
    name: 'Ngân hàng Techcombank',
    shortName: 'Techcombank',
    category: 'BANK',
    primaryColor: '#E30613',
    secondaryColor: '#B5000C',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/TCB.png',
    keywords: ['techcombank', 'tcb', 'ky thuong', 'kỹ thương']
  },
  {
    id: 'bank:mb',
    code: 'MB',
    name: 'Ngân hàng MB Bank',
    shortName: 'MB Bank',
    category: 'BANK',
    primaryColor: '#141ED2',
    secondaryColor: '#E30613',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/MB.png',
    keywords: ['mbbank', 'mb bank', 'mb', 'quan doi', 'quân đội']
  },
  {
    id: 'bank:ctg',
    code: 'ICB',
    name: 'Ngân hàng VietinBank',
    shortName: 'VietinBank',
    category: 'BANK',
    primaryColor: '#005993',
    secondaryColor: '#DA251D',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/ICB.png',
    keywords: ['vietinbank', 'ctg', 'icb', 'cong thuong', 'công thương']
  },
  {
    id: 'bank:bidv',
    code: 'BIDV',
    name: 'Ngân hàng BIDV',
    shortName: 'BIDV',
    category: 'BANK',
    primaryColor: '#006B68',
    secondaryColor: '#F5A623',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/BIDV.png',
    keywords: ['bidv', 'dau tu', 'đầu tư']
  },
  {
    id: 'bank:acb',
    code: 'ACB',
    name: 'Ngân hàng ACB',
    shortName: 'ACB',
    category: 'BANK',
    primaryColor: '#00529B',
    secondaryColor: '#0072CE',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/ACB.png',
    keywords: ['acb', 'a chau', 'á châu']
  },
  {
    id: 'bank:tpb',
    code: 'TPB',
    name: 'Ngân hàng TPBank',
    shortName: 'TPBank',
    category: 'BANK',
    primaryColor: '#5E2E86',
    secondaryColor: '#F37021',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/TPB.png',
    keywords: ['tpbank', 'tpb', 'tien phong', 'tiên phong']
  },
  {
    id: 'bank:vpb',
    code: 'VPB',
    name: 'Ngân hàng VPBank',
    shortName: 'VPBank',
    category: 'BANK',
    primaryColor: '#008345',
    secondaryColor: '#E31837',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/VPB.png',
    keywords: ['vpbank', 'vpb', 'viet nam thinh vuong', 'thịnh vượng']
  },
  {
    id: 'bank:vib',
    code: 'VIB',
    name: 'Ngân hàng VIB',
    shortName: 'VIB',
    category: 'BANK',
    primaryColor: '#0055A6',
    secondaryColor: '#F37021',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/VIB.png',
    keywords: ['vib', 'quoc te', 'quốc tế']
  },
  {
    id: 'bank:stb',
    code: 'STB',
    name: 'Ngân hàng Sacombank',
    shortName: 'Sacombank',
    category: 'BANK',
    primaryColor: '#0054A6',
    secondaryColor: '#F5A623',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/STB.png',
    keywords: ['sacombank', 'stb', 'sai gon thuong tin']
  },
  {
    id: 'bank:hdb',
    code: 'HDB',
    name: 'Ngân hàng HDBank',
    shortName: 'HDBank',
    category: 'BANK',
    primaryColor: '#DA2128',
    secondaryColor: '#F5A623',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/HDB.png',
    keywords: ['hdbank', 'hdb']
  },
  {
    id: 'bank:ocb',
    code: 'OCB',
    name: 'Ngân hàng OCB',
    shortName: 'OCB',
    category: 'BANK',
    primaryColor: '#00703C',
    secondaryColor: '#F5A623',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/OCB.png',
    keywords: ['ocb', 'phuong dong', 'phương đông']
  },
  {
    id: 'bank:vba',
    code: 'VBA',
    name: 'Ngân hàng Agribank',
    shortName: 'Agribank',
    category: 'BANK',
    primaryColor: '#981B1E',
    secondaryColor: '#00703C',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/VBA.png',
    keywords: ['agribank', 'vba', 'nong nghiep', 'nông nghiệp']
  },
  {
    id: 'bank:shb',
    code: 'SHB',
    name: 'Ngân hàng SHB',
    shortName: 'SHB',
    category: 'BANK',
    primaryColor: '#F37021',
    secondaryColor: '#0054A6',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/SHB.png',
    keywords: ['shb', 'sai gon ha noi']
  },
  {
    id: 'bank:msb',
    code: 'MSB',
    name: 'Ngân hàng MSB',
    shortName: 'MSB',
    category: 'BANK',
    primaryColor: '#E30613',
    secondaryColor: '#F37021',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/MSB.png',
    keywords: ['msb', 'hang hai', 'hàng hải']
  },
  {
    id: 'bank:seabank',
    code: 'SEAB',
    name: 'Ngân hàng SeABank',
    shortName: 'SeABank',
    category: 'BANK',
    primaryColor: '#D71920',
    secondaryColor: '#333333',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/SEAB.png',
    keywords: ['seabank', 'seab', 'dong nam a']
  },
  {
    id: 'bank:lpbank',
    code: 'LPB',
    name: 'Ngân hàng LPBank',
    shortName: 'LPBank',
    category: 'BANK',
    primaryColor: '#F37021',
    secondaryColor: '#5C2D16',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/LPB.png',
    keywords: ['lpbank', 'lpb', 'lien viet', 'liên việt', 'loc phat']
  },
  {
    id: 'bank:timo',
    code: 'TIMO',
    name: 'Ngân hàng số Timo',
    shortName: 'Timo',
    category: 'BANK',
    primaryColor: '#5A2D82',
    secondaryColor: '#F5A623',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/TIMO.png',
    keywords: ['timo', 'bvbank']
  },
  {
    id: 'bank:cake',
    code: 'CAKE',
    name: 'Ngân hàng số Cake',
    shortName: 'Cake',
    category: 'BANK',
    primaryColor: '#FF2E93',
    secondaryColor: '#FFD600',
    textColor: '#FFFFFF',
    logoUrl: 'https://api.vietqr.io/img/CAKE.png',
    keywords: ['cake']
  },

  // ================= VÍ ĐIỆN TỬ & THẺ QUỐC TẾ =================
  {
    id: 'ewallet:momo',
    code: 'MOMO',
    name: 'Ví điện tử MoMo',
    shortName: 'MoMo',
    category: 'EWALLET',
    primaryColor: '#A50064',
    secondaryColor: '#D82D8B',
    textColor: '#FFFFFF',
    keywords: ['momo', 'ví momo', 'vi momo']
  },
  {
    id: 'ewallet:zalopay',
    code: 'ZALOPAY',
    name: 'Ví điện tử ZaloPay',
    shortName: 'ZaloPay',
    category: 'EWALLET',
    primaryColor: '#0068FF',
    secondaryColor: '#00B14F',
    textColor: '#FFFFFF',
    keywords: ['zalopay', 'zalo pay', 'zalo']
  },
  {
    id: 'ewallet:vnpay',
    code: 'VNPAY',
    name: 'Ví điện tử VNPay',
    shortName: 'VNPay',
    category: 'EWALLET',
    primaryColor: '#005BAA',
    secondaryColor: '#E30613',
    textColor: '#FFFFFF',
    keywords: ['vnpay', 'vn pay']
  },
  {
    id: 'ewallet:viettel',
    code: 'VIETTEL',
    name: 'Viettel Money',
    shortName: 'Viettel',
    category: 'EWALLET',
    primaryColor: '#EE0033',
    secondaryColor: '#B80028',
    textColor: '#FFFFFF',
    keywords: ['viettel money', 'viettelpay', 'viettel']
  },
  {
    id: 'ewallet:shopeepay',
    code: 'SHOPEEPAY',
    name: 'Ví ShopeePay',
    shortName: 'ShopeePay',
    category: 'EWALLET',
    primaryColor: '#EE4D2D',
    secondaryColor: '#FF7337',
    textColor: '#FFFFFF',
    keywords: ['shopeepay', 'shopee pay', 'airpay', 'shopee']
  },
  {
    id: 'ewallet:spaylater',
    code: 'SPAYLATER',
    name: 'Shopee SPayLater (Mua trước trả sau)',
    shortName: 'SPayLater',
    category: 'EWALLET',
    primaryColor: '#EE4D2D',
    secondaryColor: '#C43619',
    textColor: '#FFFFFF',
    keywords: ['spaylater', 'spay later', 'shopee spaylater', 'shopee trả góp', 'mua trước trả sau', 'trả sau shopee', 'spay']
  },
  {
    id: 'ewallet:grab',
    code: 'GRAB',
    name: 'Ví Grab (Tài xế)',
    shortName: 'Grab',
    category: 'EWALLET',
    primaryColor: '#00B14F',
    secondaryColor: '#008C3E',
    textColor: '#FFFFFF',
    keywords: ['grab', 'ví grab', 'grab driver', 'grab tín dụng', 'grab tiền mặt', 'tài xế grab']
  },
  {
    id: 'card:visa',
    code: 'VISA',
    name: 'Thẻ Quốc tế Visa',
    shortName: 'VISA',
    category: 'CARD',
    primaryColor: '#1A1F71',
    secondaryColor: '#F7B600',
    textColor: '#FFFFFF',
    keywords: ['visa']
  },
  {
    id: 'card:mastercard',
    code: 'MASTERCARD',
    name: 'Thẻ Mastercard',
    shortName: 'Mastercard',
    category: 'CARD',
    primaryColor: '#EB001B',
    secondaryColor: '#F79E1B',
    textColor: '#FFFFFF',
    keywords: ['mastercard', 'master card']
  },
  {
    id: 'other:cash',
    code: 'CASH',
    name: 'Tiền mặt (VNĐ)',
    shortName: 'Tiền mặt',
    category: 'OTHER',
    primaryColor: '#10B981',
    secondaryColor: '#059669',
    textColor: '#FFFFFF',
    keywords: ['tiền mặt', 'tien mat', 'cash', 'ví tiền mặt']
  },
  {
    id: 'other:sjc',
    code: 'SJC',
    name: 'Vàng SJC / Tiết kiệm',
    shortName: 'Vàng SJC',
    category: 'OTHER',
    primaryColor: '#D97706',
    secondaryColor: '#F59E0B',
    textColor: '#FFFFFF',
    keywords: ['vàng', 'vang', 'sjc', 'doji', 'pnj']
  },
  {
    id: 'other:gold_9999',
    code: 'GOLD9999',
    name: 'Vàng nhẫn 9999 (24K)',
    shortName: 'Nhẫn 9999',
    category: 'OTHER',
    primaryColor: '#F59E0B',
    secondaryColor: '#D97706',
    textColor: '#000000',
    keywords: ['vàng nhẫn', 'nhẫn 9999', 'nhan 9999', '24k', 'mi hồng', 'mihong', 'vàng 9999', 'vang 9999', 'nhẫn trơn', 'vàng']
  }
];

/**
 * Tự động nhận diện thương hiệu Ngân hàng / Ví điện tử từ mã icon hoặc tên ví
 */
export function detectBankBrand(iconCode?: string, walletName?: string): BankBrandInfo | null {
  if (iconCode) {
    const cleanCode = iconCode.trim().toLowerCase();
    const byId = BANK_BRANDS.find(
      (b) => b.id.toLowerCase() === cleanCode || b.code.toLowerCase() === cleanCode
    );
    if (byId) return byId;
  }

  if (walletName) {
    const lowerName = walletName.trim().toLowerCase();
    for (const brand of BANK_BRANDS) {
      if (brand.keywords.some((kw) => lowerName.includes(kw))) {
        return brand;
      }
    }
  }

  return null;
}

interface BankLogoProps {
  brand: BankBrandInfo;
  size?: number;
  className?: string;
}

/**
 * Hiển thị Logo chính thức của Ngân hàng / Ví điện tử (hỗ trợ cả ảnh chuẩn VietQR & Vector SVG sắc nét 100% Offline)
 */
export const BankLogo: React.FC<BankLogoProps> = ({ brand, size = 36, className = '' }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const isSmall = size <= 20;

  // 1. Render Vector Logo chuẩn thương hiệu cho Ví điện tử, Thẻ quốc tế & Tiền mặt
  if (brand.code === 'MOMO') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
          style={{
            width: size,
            height: size,
            background: 'linear-gradient(135deg, #D82D8B 0%, #A50064 100%)'
          }}
          title={brand.name}
        >
          <span
            className="font-black text-white leading-none tracking-tighter"
            style={{ fontSize: Math.round(size * 0.6) }}
          >
            M
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #D82D8B 0%, #A50064 100%)'
        }}
        title={brand.name}
      >
        <span
          className="font-black text-white leading-none tracking-tighter"
          style={{ fontSize: Math.max(9, Math.round(size * 0.28)) }}
        >
          mo
        </span>
        <span
          className="font-black text-white leading-none tracking-tighter -mt-0.5"
          style={{ fontSize: Math.max(9, Math.round(size * 0.28)) }}
        >
          mo
        </span>
      </div>
    );
  }

  if (brand.code === 'ZALOPAY') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm overflow-hidden bg-white ${className}`}
          style={{ width: size, height: size }}
          title={brand.name}
        >
          <span
            className="font-black leading-none tracking-tight"
            style={{ color: '#0068FF', fontSize: Math.round(size * 0.6) }}
          >
            Z
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden bg-white p-0.5 ${className}`}
        style={{ width: size, height: size }}
        title={brand.name}
      >
        <span
          className="font-black leading-none tracking-tight"
          style={{ color: '#0068FF', fontSize: Math.max(8, Math.round(size * 0.26)) }}
        >
          Zalo
        </span>
        <span
          className="font-extrabold leading-none tracking-tight px-1 py-0.2 rounded mt-0.5 text-white"
          style={{
            backgroundColor: '#00B14F',
            fontSize: Math.max(7, Math.round(size * 0.22))
          }}
        >
          Pay
        </span>
      </div>
    );
  }

  if (brand.code === 'VNPAY') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm bg-white overflow-hidden ${className}`}
          style={{ width: size, height: size }}
          title={brand.name}
        >
          <span
            className="font-black tracking-tighter leading-none"
            style={{ fontSize: Math.round(size * 0.6), color: '#E30613' }}
          >
            V
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex items-center justify-center shrink-0 select-none shadow-sm bg-white px-1 overflow-hidden ${className}`}
        style={{ width: size, height: size }}
        title={brand.name}
      >
        <span
          className="font-black tracking-tighter leading-none"
          style={{ fontSize: Math.max(8, Math.round(size * 0.25)) }}
        >
          <span style={{ color: '#E30613' }}>VN</span>
          <span style={{ color: '#005BAA' }}>PAY</span>
        </span>
      </div>
    );
  }

  if (brand.code === 'VIETTEL') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
          style={{
            width: size,
            height: size,
            background: 'linear-gradient(135deg, #EE0033 0%, #B80028 100%)'
          }}
          title={brand.name}
        >
          <span
            className="font-black text-white leading-none tracking-tight"
            style={{ fontSize: Math.round(size * 0.6) }}
          >
            V
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #EE0033 0%, #B80028 100%)'
        }}
        title={brand.name}
      >
        <span
          className="font-black text-white leading-none tracking-tight"
          style={{ fontSize: Math.max(7, Math.round(size * 0.22)) }}
        >
          viettel
        </span>
        <span
          className="font-semibold text-white/90 leading-none mt-0.5"
          style={{ fontSize: Math.max(6, Math.round(size * 0.18)) }}
        >
          money
        </span>
      </div>
    );
  }

  if (brand.code === 'SHOPEEPAY') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
          style={{
            width: size,
            height: size,
            background: 'linear-gradient(135deg, #FF7337 0%, #EE4D2D 100%)'
          }}
          title={brand.name}
        >
          <span
            className="font-black text-white leading-none"
            style={{ fontSize: Math.round(size * 0.6) }}
          >
            S
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #FF7337 0%, #EE4D2D 100%)'
        }}
        title={brand.name}
      >
        <span
          className="font-black text-white leading-none"
          style={{ fontSize: Math.max(10, Math.round(size * 0.34)) }}
        >
          S
        </span>
        <span
          className="font-bold text-white leading-none"
          style={{ fontSize: Math.max(6, Math.round(size * 0.18)) }}
        >
          Pay
        </span>
      </div>
    );
  }

  if (brand.code === 'SPAYLATER') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
          style={{
            width: size,
            height: size,
            background: 'linear-gradient(135deg, #EE4D2D 0%, #C43619 100%)'
          }}
          title={brand.name}
        >
          <span
            className="font-black text-white leading-none tracking-tighter"
            style={{ fontSize: Math.round(size * 0.55) }}
          >
            SP
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #EE4D2D 0%, #C43619 100%)'
        }}
        title={brand.name}
      >
        <span
          className="font-black text-white leading-none"
          style={{ fontSize: Math.max(10, Math.round(size * 0.32)) }}
        >
          S
        </span>
        <span
          className="font-black text-amber-200 leading-none uppercase tracking-tighter"
          style={{ fontSize: Math.max(5, Math.round(size * 0.16)) }}
        >
          Later
        </span>
      </div>
    );
  }

  if (brand.code === 'MASTERCARD') {
    return (
      <div
        className={`${
          isSmall ? 'rounded-md' : 'rounded-xl'
        } flex items-center justify-center shrink-0 select-none shadow-sm bg-slate-950 border border-white/10 overflow-hidden ${className}`}
        style={{ width: size, height: size }}
        title={brand.name}
      >
        <svg viewBox="0 0 36 24" className="w-4/5 h-4/5">
          <circle cx="13" cy="12" r="8" fill="#EB001B" />
          <circle cx="23" cy="12" r="8" fill="#F79E1B" fillOpacity="0.9" />
        </svg>
      </div>
    );
  }

  if (brand.code === 'VISA') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm bg-white overflow-hidden ${className}`}
          style={{ width: size, height: size }}
          title={brand.name}
        >
          <span
            className="font-black italic tracking-tighter leading-none"
            style={{ color: '#1A1F71', fontSize: Math.round(size * 0.55) }}
          >
            V
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex items-center justify-center shrink-0 select-none shadow-sm bg-white px-1 overflow-hidden ${className}`}
        style={{ width: size, height: size }}
        title={brand.name}
      >
        <span
          className="font-black italic tracking-tighter leading-none"
          style={{ color: '#1A1F71', fontSize: Math.max(9, Math.round(size * 0.3)) }}
        >
          VISA
        </span>
      </div>
    );
  }

  if (brand.code === 'CASH') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
          style={{
            width: size,
            height: size,
            background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)'
          }}
          title={brand.name}
        >
          <span
            className="font-black text-white leading-none"
            style={{ fontSize: Math.round(size * 0.65) }}
          >
            ₫
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)'
        }}
        title={brand.name}
      >
        <span
          className="font-black text-white leading-none"
          style={{ fontSize: Math.max(12, Math.round(size * 0.42)) }}
        >
          ₫
        </span>
        <span
          className="font-bold text-emerald-100 leading-none mt-0.5"
          style={{ fontSize: Math.max(6, Math.round(size * 0.17)) }}
        >
          VNĐ
        </span>
      </div>
    );
  }

  if (brand.code === 'SJC') {
    if (isSmall) {
      return (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
          style={{
            width: size,
            height: size,
            background: 'linear-gradient(135deg, #FBBF24 0%, #D97706 100%)'
          }}
          title={brand.name}
        >
          <span
            className="font-black text-slate-950 leading-none tracking-tight"
            style={{ fontSize: Math.round(size * 0.55) }}
          >
            Au
          </span>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #FBBF24 0%, #D97706 100%)'
        }}
        title={brand.name}
      >
        <span
          className="font-black text-slate-950 leading-none tracking-tight"
          style={{ fontSize: Math.max(9, Math.round(size * 0.28)) }}
        >
          SJC
        </span>
        <span
          className="font-bold text-slate-900 leading-none mt-0.5"
          style={{ fontSize: Math.max(6, Math.round(size * 0.17)) }}
        >
          9999
        </span>
      </div>
    );
  }

  if (brand.code === 'GOLD9999') {
    return (
      <div
        className={`rounded-xl flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #FDE68A 0%, #F59E0B 50%, #D97706 100%)',
          border: '1px solid rgba(251, 191, 36, 0.4)'
        }}
        title={brand.name}
      >
        <span
          className="font-black text-amber-950 leading-none tracking-tight"
          style={{ fontSize: Math.max(8, Math.round(size * 0.28)) }}
        >
          9999
        </span>
        <span
          className="font-extrabold text-amber-900 leading-none mt-0.5"
          style={{ fontSize: Math.max(6, Math.round(size * 0.16)) }}
        >
          24K
        </span>
      </div>
    );
  }

  // 2. Render Logo chính thức của các Ngân hàng Việt Nam trên nền trắng cao cấp, fallback sang Vector Badge nếu offline chưa cache
  if (brand.logoUrl && !imgFailed) {
    return (
      <div
        className={`${
          isSmall ? 'rounded-md p-0.5' : 'rounded-xl p-1'
        } bg-white flex items-center justify-center shrink-0 shadow-sm overflow-hidden border border-white/20 ${className}`}
        style={{ width: size, height: size }}
        title={brand.name}
      >
        <img
          src={brand.logoUrl}
          alt={brand.shortName}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback Vector Badge mang màu sắc chuẩn của Ngân hàng khi hoàn toàn offline
  return (
    <div
      className={`${
        isSmall ? 'rounded-md px-0.5' : 'rounded-xl px-1'
      } flex flex-col items-center justify-center shrink-0 select-none shadow-sm overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${brand.primaryColor} 0%, ${brand.secondaryColor} 100%)`
      }}
      title={brand.name}
    >
      <span
        className="font-black text-white leading-none tracking-tighter uppercase"
        style={{
          fontSize: isSmall
            ? Math.max(7, Math.round(size * 0.45))
            : Math.max(9, Math.round(size * 0.28))
        }}
      >
        {isSmall ? brand.code.slice(0, 3) : brand.code}
      </span>
    </div>
  );
};

interface BankBrandAccordionPickerProps {
  selectedBrandId: string;
  onSelectBrand: (brand: BankBrandInfo) => void;
}

/**
 * Bộ chọn Logo Ngân hàng / Ví điện tử dạng từng Dropdown dọc (Bấm nhóm nào mở danh sách cuộn ngay bên dưới)
 * Khắc phục hoàn toàn lỗi dàn hàng ngang cái to cái nhỏ trên màn hình điện thoại.
 */
export const BankBrandAccordionPicker: React.FC<BankBrandAccordionPickerProps> = ({
  selectedBrandId,
  onSelectBrand
}) => {
  const currentBrand =
    BANK_BRANDS.find((b) => b.id === selectedBrandId) || BANK_BRANDS[0];

  // Mở sẵn nhóm chứa thương hiệu đang chọn, hoặc đóng gọn sau khi chọn
  const [openGroup, setOpenGroup] = useState<'BANK' | 'EWALLET' | 'CARD' | null>(null);

  const groups: Array<{
    id: 'BANK' | 'EWALLET' | 'CARD';
    title: string;
    subtitle: string;
    icon: React.FC<{ size?: number; className?: string }>;
    items: BankBrandInfo[];
  }> = [
    {
      id: 'BANK',
      title: 'Ngân hàng Việt Nam',
      subtitle: 'Vietcombank, Techcombank, MB, VietinBank, BIDV, ACB...',
      icon: Landmark,
      items: BANK_BRANDS.filter((b) => b.category === 'BANK')
    },
    {
      id: 'EWALLET',
      title: 'Ví điện tử & Trả sau',
      subtitle: 'MoMo, ZaloPay, VNPay, Viettel Money, ShopeePay, SPayLater',
      icon: Smartphone,
      items: BANK_BRANDS.filter((b) => b.category === 'EWALLET')
    },
    {
      id: 'CARD',
      title: 'Thẻ Quốc tế, Tiền mặt & Vàng',
      subtitle: 'Tiền mặt, Vàng nhẫn 9999, SJC, Visa, Mastercard',
      icon: CreditCard,
      items: BANK_BRANDS.filter((b) => b.category === 'CARD' || b.category === 'OTHER')
    }
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Thẻ hiển thị Logo đang được chọn */}
      <div className="p-2.5 rounded-2xl bg-slate-800/90 border border-emerald-500/35 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <BankLogo brand={currentBrand} size={38} />
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              Logo đang chọn
            </div>
            <div className="text-xs font-extrabold text-white truncate">
              {currentBrand.name}
            </div>
          </div>
        </div>
        <span className="text-[10px] font-semibold text-slate-400 bg-slate-900 px-2.5 py-1 rounded-xl border border-white/8 shrink-0">
          {openGroup ? 'Chạm nhóm để đóng' : 'Bấm nhóm dưới để đổi'}
        </span>
      </div>

      {/* Danh sách từng Dropdown dọc: bấm nhóm nào xổ danh sách cuộn ngay bên dưới */}
      <div className="flex flex-col gap-1.5">
        {groups.map((grp) => {
          const IconComp = grp.icon;
          const isOpen = openGroup === grp.id;
          const hasSelectedInside = grp.items.some((b) => b.id === currentBrand.id);

          return (
            <div
              key={grp.id}
              className={`rounded-2xl border overflow-hidden transition-colors ${
                isOpen
                  ? 'bg-slate-900 border-sky-400/50 shadow-lg'
                  : hasSelectedInside
                  ? 'bg-slate-900/90 border-emerald-500/30'
                  : 'bg-slate-900/70 border-white/8'
              }`}
            >
              {/* Thanh tiêu đề Dropdown */}
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? null : grp.id)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer bg-transparent border-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isOpen
                        ? 'bg-sky-500/20 text-sky-400'
                        : hasSelectedInside
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <IconComp size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <span className="truncate">{grp.title}</span>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-md shrink-0">
                        {grp.items.length}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {grp.subtitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {hasSelectedInside && !isOpen && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                      {currentBrand.shortName}
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronUp size={16} className="text-sky-400" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400" />
                  )}
                </div>
              </button>

              {/* Danh sách cuộn dọc bên dưới khi mở Dropdown */}
              {isOpen && (
                <div className="px-2.5 pb-2.5 pt-1 border-t border-white/6 max-h-56 overflow-y-auto flex flex-col gap-1.5">
                  {grp.items.map((brand) => {
                    const isSelected = brand.id === currentBrand.id;
                    return (
                      <button
                        key={brand.id}
                        type="button"
                        onClick={() => {
                          onSelectBrand(brand);
                          setOpenGroup(null);
                        }}
                        className={`w-full h-12 px-3 rounded-xl border flex items-center justify-between gap-2.5 text-left cursor-pointer transition-all shrink-0 ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-sm'
                            : 'bg-slate-800/75 border-white/5 text-slate-200 hover:bg-slate-800 hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BankLogo brand={brand} size={32} />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-100 truncate">
                              {brand.shortName}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {brand.name}
                            </div>
                          </div>
                        </div>

                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                            <Check size={14} strokeWidth={3} />
                          </div>
                        ) : (
                          <span className="text-[10px] font-semibold text-sky-400 shrink-0">
                            Chọn
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BankLogo;
