// src/components/SettingsModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  exportFullBackupJSON,
  downloadOrShareFile,
  restoreBackupData,
  exportTransactionsToExcel,
  checkAndRunAutoBackup
} from '../services/backupService';
import { getCurrentDate, formatFriendlyDate } from '../utils/formatters';
import {
  X,
  Clock,
  Database,
  FileSpreadsheet,
  Download,
  Upload,
  ShieldCheck,
  Check,
  AlertTriangle,
  RotateCw
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const autoBackupEnabledSetting = useLiveQuery(() =>
    db.settings.get('auto_backup_enabled')
  );
  const autoBackupTimeSetting = useLiveQuery(() =>
    db.settings.get('auto_backup_time')
  );
  const lastBackupDateSetting = useLiveQuery(() =>
    db.settings.get('last_auto_backup_date')
  );

  const txCount = useLiveQuery(() => db.transactions.count()) || 0;
  const walletCount = useLiveQuery(() => db.wallets.count()) || 0;
  const categoryCount = useLiveQuery(() => db.categories.count()) || 0;

  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [backupTime, setBackupTime] = useState<string>('21:00');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPersistent, setIsPersistent] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Đồng bộ giá trị từ IndexedDB Settings khi modal mở
  useEffect(() => {
    if (autoBackupEnabledSetting !== undefined) {
      setIsEnabled(autoBackupEnabledSetting ? Boolean(autoBackupEnabledSetting.value) : true);
    }
    if (autoBackupTimeSetting?.value) {
      setBackupTime(autoBackupTimeSetting.value as string);
    }
  }, [autoBackupEnabledSetting, autoBackupTimeSetting]);

  // Kiểm tra quyền lưu trữ bền vững (Persistent Storage)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((persisted) => {
        setIsPersistent(persisted);
      }).catch(() => {
        setIsPersistent(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Bật/Tắt tự động sao lưu
  const handleToggleAutoBackup = async () => {
    const nextVal = !isEnabled;
    setIsEnabled(nextVal);
    await db.settings.put({
      key: 'auto_backup_enabled',
      value: nextVal
    });
    setStatusMsg({
      text: nextVal ? 'Đã bật Tự động sao lưu hàng ngày' : 'Đã tắt Tự động sao lưu',
      type: 'info'
    });
  };

  // Thay đổi khung giờ sao lưu
  const handleTimeChange = async (newTime: string) => {
    if (!newTime) return;
    setBackupTime(newTime);
    await db.settings.put({
      key: 'auto_backup_time',
      value: newTime
    });
    setStatusMsg({
      text: `Đã cập nhật khung giờ sao lưu thành ${newTime}`,
      type: 'info'
    });
  };

  // Kích hoạt sao lưu ngay lập tức
  const handleBackupNow = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const res = await checkAndRunAutoBackup({ force: true });
      if (res.ran) {
        setStatusMsg({
          text: 'Sao lưu thành công! File JSON đã được tạo và kích hoạt chia sẻ/tải về.',
          type: 'success'
        });
      } else {
        setStatusMsg({ text: res.message, type: 'info' });
      }
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Có lỗi khi sao lưu', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Xuất file JSON thủ công
  const handleExportManualJSON = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      const jsonStr = await exportFullBackupJSON();
      const dateStr = getCurrentDate().replace(/-/g, '');
      const fileName = `SoThuChi_Backup_${dateStr}.json`;
      await downloadOrShareFile(jsonStr, fileName, 'application/json');
      setStatusMsg({
        text: 'Đã xuất dữ liệu JSON thành công!',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi xuất file', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Xuất file Excel (.xlsx)
  const handleExportExcel = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      await exportTransactionsToExcel();
      setStatusMsg({
        text: 'Đã xuất báo cáo Excel (.xlsx) thành công!',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Lỗi xuất file Excel', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Xử lý chọn file JSON để khôi phục
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('CẢNH BÁO: Thao tác này sẽ cập nhật toàn bộ cơ sở dữ liệu từ file sao lưu. Bạn có chắc muốn tiếp tục?')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsProcessing(true);
    setStatusMsg(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const result = await restoreBackupData(content);
        setStatusMsg({
          text: `Khôi phục thành công: ${result.counts.transactions} giao dịch, ${result.counts.wallets} ví!`,
          type: 'success'
        });
      } catch (err: any) {
        setStatusMsg({
          text: err?.message || 'Lỗi đọc file sao lưu',
          type: 'error'
        });
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setStatusMsg({ text: 'Không thể đọc file từ thiết bị', type: 'error' });
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsText(file);
  };

  const lastBackupVal = lastBackupDateSetting?.value as string | undefined;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        zIndex: 110,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        maxWidth: 480,
        margin: '0 auto'
      }}
    >
      <div
        className="glass-panel animate-slide-up"
        style={{
          backgroundColor: '#0f172a',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Header Modal */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38BDF8'
              }}
            >
              <Database size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Cài đặt & Sao lưu
              </h2>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                Bảo vệ dữ liệu Local-First 100%
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="touch-btn"
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#1e293b',
              border: 'none',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Thông báo trạng thái nếu có */}
        {statusMsg && (
          <div
            style={{
              margin: '12px 16px 0',
              padding: '10px 14px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 500,
              backgroundColor:
                statusMsg.type === 'success'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : statusMsg.type === 'error'
                  ? 'rgba(244, 63, 94, 0.15)'
                  : 'rgba(56, 189, 248, 0.15)',
              color:
                statusMsg.type === 'success'
                  ? '#10B981'
                  : statusMsg.type === 'error'
                  ? '#F43F5E'
                  : '#38BDF8',
              border: `1px solid ${
                statusMsg.type === 'success'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : statusMsg.type === 'error'
                  ? 'rgba(244, 63, 94, 0.3)'
                  : 'rgba(56, 189, 248, 0.3)'
              }`,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {statusMsg.type === 'success' ? (
              <Check size={16} />
            ) : statusMsg.type === 'error' ? (
              <AlertTriangle size={16} />
            ) : (
              <Clock size={16} />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* PHẦN 1: TỰ ĐỘNG SAO LƯU HÀNG NGÀY (AUTO-BACKUP) */}
          <div
            className="glass-card"
            style={{
              backgroundColor: '#1e293b',
              borderRadius: 18,
              padding: '16px',
              border: '1px solid rgba(255,255,255,0.06)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={20} color="#38BDF8" />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                    Tự động sao lưu hàng ngày
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    Tự động xuất file JSON khi mở app
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={handleToggleAutoBackup}
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isEnabled ? '#10B981' : '#334155',
                  border: 'none',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  padding: 2
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: '#ffffff',
                    transform: isEnabled ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                />
              </button>
            </div>

            {isEnabled && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                {/* Chọn Khung giờ */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <label style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 500 }}>
                    Khung giờ sao lưu:
                  </label>
                  <input
                    type="time"
                    value={backupTime}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    style={{
                      backgroundColor: '#0f172a',
                      color: '#38BDF8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: 10,
                      padding: '6px 12px',
                      fontSize: 16,
                      fontWeight: 700,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Ngày sao lưu gần nhất */}
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Lần sao lưu gần nhất:{' '}
                  <span style={{ color: lastBackupVal ? '#10B981' : '#64748B', fontWeight: 600 }}>
                    {lastBackupVal ? formatFriendlyDate(lastBackupVal) : 'Chưa có'}
                  </span>
                </div>

                {/* Nút Sao lưu ngay */}
                <button
                  type="button"
                  onClick={handleBackupNow}
                  disabled={isProcessing}
                  className="touch-btn"
                  style={{
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    color: '#38BDF8',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    padding: '9px 14px',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 4
                  }}
                >
                  {isProcessing ? (
                    <RotateCw size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  <span>Sao lưu ngay bây giờ (Xuất JSON)</span>
                </button>
              </div>
            )}
          </div>

          {/* PHẦN 2: QUẢN LÝ DỮ LIỆU & XUẤT BÁO CÁO THỦ CÔNG */}
          <div
            className="glass-card"
            style={{
              backgroundColor: '#1e293b',
              borderRadius: 18,
              padding: '16px',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>
              SAO LƯU & KHÔI PHỤC THỦ CÔNG
            </div>

            {/* Nút Xuất JSON */}
            <button
              type="button"
              onClick={handleExportManualJSON}
              disabled={isProcessing}
              className="touch-btn"
              style={{
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '12px 14px',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Download size={18} color="#10B981" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Xuất toàn bộ dữ liệu (JSON)</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Bao gồm ví, danh mục, giao dịch, hạn mức</div>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>Tải / Chia sẻ</span>
            </button>

            {/* Nút Nhập JSON */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="touch-btn"
              style={{
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '12px 14px',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Upload size={18} color="#38BDF8" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Khôi phục từ file JSON</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Nạp lại dữ liệu từ tệp sao lưu trước đó</div>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#38BDF8', fontWeight: 600 }}>Chọn file</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Nút Xuất Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isProcessing}
              className="touch-btn"
              style={{
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '12px 14px',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileSpreadsheet size={18} color="#22C55E" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Xuất bảng tính Excel (.xlsx)</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Báo cáo giao dịch chi tiết theo bảng</div>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>Xuất Excel</span>
            </button>
          </div>

          {/* PHẦN 3: THÔNG TIN HỆ THỐNG & BẢO VỆ BỘ NHỚ */}
          <div
            className="glass-card"
            style={{
              backgroundColor: '#1e293b',
              borderRadius: 18,
              padding: '14px 16px',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color={isPersistent ? '#10B981' : '#F59E0B'} />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                Bộ nhớ thiết bị (IndexedDB)
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>
              {isPersistent
                ? 'Bộ nhớ bền vững (Persistent Storage) đã được kích hoạt. Trình duyệt sẽ không tự ý xóa dữ liệu thu chi của bạn.'
                : 'Đang lưu trữ dữ liệu an toàn trên bộ nhớ trình duyệt Safari/Chrome.'}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 16,
                paddingTop: 8,
                marginTop: 4,
                borderTop: '1px solid rgba(255,255,255,0.06)',
                fontSize: 12,
                color: '#cbd5e1'
              }}
            >
              <div>
                Giao dịch: <b>{txCount}</b>
              </div>
              <div>
                Ví: <b>{walletCount}</b>
              </div>
              <div>
                Hạng mục: <b>{categoryCount}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
