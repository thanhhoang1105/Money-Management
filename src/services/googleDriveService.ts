// src/services/googleDriveService.ts
import { db } from '../db';
import { exportFullBackupJSON } from './backupService';
import { getCurrentDate } from '../utils/formatters';
import type { SyncDataPayload, SyncResult } from '../types';
import {
  getLocalSyncPayload,
  mergeTwoWayData,
  applyMergedDataToIndexedDB
} from './syncService';

declare global {
  interface Window {
    google?: any;
  }
}

export interface GoogleDriveUser {
  email: string;
  name: string;
  picture: string;
}

export interface GoogleDriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size?: string;
}

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const BACKUP_FOLDER_NAME = 'SoThuChi_Backups';
export const SYNC_FILE_NAME = 'SoThuChi_SyncData.json';
const TOKEN_STORAGE_KEY = 'stc_google_access_token';
const TOKEN_EXPIRY_KEY = 'stc_google_token_expiry';

/**
 * Đợi Google Identity Services (GIS) SDK tải xong
 */
export async function waitForGoogleScript(timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (!window.google?.accounts?.oauth2) {
    if (Date.now() - start > timeoutMs) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return true;
}

export const DEFAULT_GOOGLE_CLIENT_ID =
  '359469747585-d47e7j7a8a95f939585i2ngelurt5la2.apps.googleusercontent.com';

/**
 * Lấy Client ID từ biến môi trường hoặc từ cài đặt người dùng đã lưu
 */
export async function getEffectiveClientId(): Promise<string> {
  // 1. Kiểm tra biến môi trường Vite
  const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (envClientId && typeof envClientId === 'string' && envClientId.trim().length > 0) {
    return envClientId.trim();
  }

  // 2. Kiểm tra cài đặt người dùng cấu hình trong IndexedDB
  const customSetting = await db.settings.get('google_client_id');
  if (customSetting?.value && typeof customSetting.value === 'string' && customSetting.value.trim().length > 0) {
    return customSetting.value.trim();
  }

  // 3. Fallback sang Client ID tích hợp sẵn của ứng dụng
  return DEFAULT_GOOGLE_CLIENT_ID;
}

/**
 * Lưu Client ID do người dùng nhập vào IndexedDB
 */
export async function saveGoogleClientId(clientId: string): Promise<void> {
  await db.settings.put({
    key: 'google_client_id',
    value: clientId.trim()
  });
}

/**
 * Lấy Access Token còn hiệu lực từ bộ nhớ
 */
export function getStoredAccessToken(): string | null {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return null;

  const expiryTime = parseInt(expiry, 10);
  // Trừ hao 2 phút trước khi token thực sự hết hạn
  if (Date.now() > expiryTime - 120000) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

/**
 * Lưu Access Token và thời gian hết hạn
 */
function storeAccessToken(token: string, expiresInSeconds: number): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  const expiryTime = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
}

/**
 * Yêu cầu quyền truy cập Google OAuth 2.0 (mở Popup xác thực hoặc Silent Refresh)
 */
export async function requestGoogleAccessToken(promptSelect = false): Promise<string> {
  const ready = await waitForGoogleScript();
  if (!ready) {
    throw new Error('Chưa tải được thư viện Google Identity Services. Vui lòng kiểm tra kết nối mạng.');
  }

  const clientId = await getEffectiveClientId();
  if (!clientId) {
    throw new Error('Chưa cấu hình Google Client ID. Vui lòng cấu hình Client ID để kết nối Google Drive.');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error || 'Xác thực Google thất bại'));
            return;
          }
          if (response.access_token) {
            const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
            storeAccessToken(response.access_token, expiresIn);

            // Tự động lấy và lưu Profile người dùng
            try {
              await fetchAndSaveGoogleUserProfile(response.access_token);
            } catch (pErr) {
              console.warn('Không thể lấy thông tin profile Google:', pErr);
            }

            resolve(response.access_token);
          } else {
            reject(new Error('Không nhận được Access Token từ Google'));
          }
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Lỗi cửa sổ đăng nhập Google'));
        }
      });

      // Nếu cần chọn tài khoản hoặc lần đầu đăng nhập
      tokenClient.requestAccessToken({ prompt: promptSelect ? 'select_account' : '' });
    } catch (err: any) {
      reject(new Error(err?.message || 'Không thể khởi tạo phiên xác thực Google'));
    }
  });
}

/**
 * Lấy token hợp lệ, nếu hết hạn sẽ tự động yêu cầu token mới
 */
export async function ensureValidAccessToken(): Promise<string> {
  const existingToken = getStoredAccessToken();
  if (existingToken) {
    return existingToken;
  }
  return await requestGoogleAccessToken(false);
}

/**
 * Lấy thông tin tài khoản Google của người dùng
 */
export async function fetchAndSaveGoogleUserProfile(accessToken: string): Promise<GoogleDriveUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error('Không thể tải thông tin tài khoản Google');
  }

  const data = await res.json();
  const user: GoogleDriveUser = {
    email: data.email || 'Google User',
    name: data.name || data.email || 'Người dùng Google',
    picture: data.picture || ''
  };

  await db.settings.put({
    key: 'google_drive_user',
    value: user
  });

  return user;
}

/**
 * Lấy thông tin người dùng Google đã lưu trong IndexedDB
 */
export async function getSavedGoogleUser(): Promise<GoogleDriveUser | null> {
  const setting = await db.settings.get('google_drive_user');
  if (setting?.value && typeof setting.value === 'object') {
    return setting.value as GoogleDriveUser;
  }
  return null;
}

/**
 * Tìm hoặc tạo thư mục 'SoThuChi_Backups' trên Google Drive
 */
async function getOrCreateBackupFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Nếu thư mục chưa tồn tại, tạo mới
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Thư mục chứa các bản sao lưu tự động của Sổ Thu Chi PWA'
    })
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Không thể tạo thư mục sao lưu trên Google Drive');
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

/**
 * TẢI LÊN GOOGLE DRIVE (1 Nút bấm - FR-E-Drive)
 * Tự động đóng gói toàn bộ dữ liệu ứng dụng và tải lên thư mục 'SoThuChi_Backups' trên Google Drive
 */
export async function backupToGoogleDrive(): Promise<{
  success: boolean;
  fileName: string;
  fileId: string;
  exportedAt: string;
}> {
  const token = await ensureValidAccessToken();
  const folderId = await getOrCreateBackupFolder(token);

  // Tạo nội dung sao lưu mới nhất
  const jsonContent = await exportFullBackupJSON();
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const fileName = `SoThuChi_Backup_${timestamp}.json`;

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
    description: `Bản sao lưu Sổ Thu Chi ngày ${getCurrentDate()}`
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonContent +
    closeDelim;

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    }
  );

  if (!uploadRes.ok) {
    const errData = await uploadRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Lỗi khi tải file sao lưu lên Google Drive');
  }

  const uploadedFile = await uploadRes.json();

  // Lưu ngày sao lưu gần nhất lên Google Drive
  await db.settings.put({
    key: 'last_google_drive_backup_date',
    value: now.toISOString()
  });

  return {
    success: true,
    fileName: uploadedFile.name,
    fileId: uploadedFile.id,
    exportedAt: uploadedFile.createdTime || now.toISOString()
  };
}

/**
 * LẤY DỮ LIỆU TỪ GOOGLE DRIVE (1 Nút bấm - FR-E-Drive)
 * Tự động tìm bản sao lưu mới nhất trong thư mục 'SoThuChi_Backups' và tải nội dung JSON về
 */
export async function getLatestBackupFromGoogleDrive(): Promise<{
  file: GoogleDriveBackupFile;
  jsonContent: string;
}> {
  const token = await ensureValidAccessToken();
  const folderId = await getOrCreateBackupFolder(token);

  const query = encodeURIComponent(
    `'${folderId}' in parents and mimeType = 'application/json' and trashed = false`
  );

  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&pageSize=1&fields=files(id,name,createdTime,size)`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!listRes.ok) {
    const errData = await listRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Không thể tìm kiếm tệp sao lưu trên Google Drive');
  }

  const data = await listRes.json();
  if (!data.files || data.files.length === 0) {
    throw new Error(
      'Không tìm thấy bản sao lưu nào trong thư mục "SoThuChi_Backups" trên Google Drive của bạn.'
    );
  }

  const latestFile: GoogleDriveBackupFile = data.files[0];

  // Tải nội dung tệp JSON về
  const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${latestFile.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!downloadRes.ok) {
    throw new Error('Không thể tải nội dung tệp sao lưu từ Google Drive');
  }

  const jsonContent = await downloadRes.text();

  return {
    file: latestFile,
    jsonContent
  };
}

/**
 * Ngắt kết nối Google Drive (Đăng xuất)
 */
export async function disconnectGoogleDrive(): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch (e) {
      console.warn('Lỗi thu hồi token Google:', e);
    }
  }

  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);

  await db.settings.delete('google_drive_user');
  await db.settings.delete('last_google_drive_backup_date');
}

/**
 * Tự động kiểm tra và sao lưu lên Google Drive hàng ngày (Auto-Backup to Drive)
 */
export async function checkAndRunGoogleDriveAutoBackup(): Promise<{ ran: boolean; message: string }> {
  try {
    const isAutoDriveEnabledSetting = await db.settings.get('google_drive_auto_backup_enabled');
    const isAutoDriveEnabled = isAutoDriveEnabledSetting ? Boolean(isAutoDriveEnabledSetting.value) : false;

    if (!isAutoDriveEnabled) {
      return { ran: false, message: 'Tự động sao lưu lên Google Drive đang tắt' };
    }

    const token = getStoredAccessToken();
    if (!token) {
      return { ran: false, message: 'Chưa có phiên kết nối Google Drive còn hạn' };
    }

    const todayStr = getCurrentDate();
    const lastBackupSetting = await db.settings.get('last_google_drive_backup_date');
    const lastBackupDate = typeof lastBackupSetting?.value === 'string'
      ? lastBackupSetting.value.slice(0, 10)
      : null;

    if (lastBackupDate === todayStr) {
      return { ran: false, message: 'Hôm nay đã sao lưu lên Google Drive rồi' };
    }

    const result = await backupToGoogleDrive();
    return {
      ran: true,
      message: `Đã tự động sao lưu lên Google Drive thành công: ${result.fileName}`
    };
  } catch (err: any) {
    return {
      ran: false,
      message: `Lỗi tự động sao lưu Google Drive: ${err?.message || 'Lỗi không xác định'}`
    };
  }
}

// Biến cờ chống sync chồng chéo khi có nhiều sự kiện kích hoạt cùng lúc
let isSyncInProgress = false;

/**
 * Tìm file đồng bộ cố định 'SoThuChi_SyncData.json' trong thư mục Google Drive
 */
export async function findSyncFileOnGoogleDrive(
  accessToken: string,
  folderId: string
): Promise<GoogleDriveBackupFile | null> {
  const query = encodeURIComponent(
    `'${folderId}' in parents and name = '${SYNC_FILE_NAME}' and trashed = false`
  );

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime,modifiedTime,size)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }
  return null;
}

/**
 * Tải dữ liệu đồng bộ từ Google Drive về máy.
 * Ưu tiên tìm file 'SoThuChi_SyncData.json'; nếu chưa có thì fallback sang file sao lưu mới nhất.
 */
export async function downloadSyncDataFromGoogleDrive(
  accessToken: string,
  folderId: string
): Promise<{ file: GoogleDriveBackupFile; payload: SyncDataPayload } | null> {
  // 1. Tìm file đồng bộ chuẩn
  let targetFile = await findSyncFileOnGoogleDrive(accessToken, folderId);

  // 2. Fallback: Nếu chưa có file sync chuẩn, tìm file sao lưu JSON gần nhất
  if (!targetFile) {
    const query = encodeURIComponent(
      `'${folderId}' in parents and mimeType = 'application/json' and trashed = false`
    );
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&pageSize=1&fields=files(id,name,createdTime,modifiedTime,size)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (listRes.ok) {
      const listData = await listRes.json();
      if (listData.files && listData.files.length > 0) {
        targetFile = listData.files[0];
      }
    }
  }

  if (!targetFile) {
    return null;
  }

  // Tải nội dung JSON từ Drive
  const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${targetFile.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!downloadRes.ok) {
    throw new Error('Không thể tải tệp đồng bộ từ Google Drive');
  }

  const jsonText = await downloadRes.text();
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || !parsed.data) {
      throw new Error('Cấu trúc dữ liệu trên Google Drive không đúng chuẩn');
    }

    const payload: SyncDataPayload = {
      version: parsed.version || '2.0',
      appName: parsed.appName || 'SoThuChi',
      syncedAt: parsed.syncedAt || parsed.exportedAt || targetFile.modifiedTime || targetFile.createdTime,
      data: {
        wallets: Array.isArray(parsed.data.wallets) ? parsed.data.wallets : [],
        categories: Array.isArray(parsed.data.categories) ? parsed.data.categories : [],
        transactions: Array.isArray(parsed.data.transactions) ? parsed.data.transactions : [],
        budgets: Array.isArray(parsed.data.budgets) ? parsed.data.budgets : [],
        settings: Array.isArray(parsed.data.settings) ? parsed.data.settings : []
      },
      deletedIds: parsed.deletedIds
    };

    return {
      file: targetFile,
      payload
    };
  } catch (err: any) {
    throw new Error(err?.message || 'Lỗi đọc định dạng tệp đồng bộ từ Google Drive');
  }
}

/**
 * Tải lên hoặc ghi đè nội dung file 'SoThuChi_SyncData.json' trên Google Drive
 */
export async function uploadSyncDataToGoogleDrive(
  accessToken: string,
  folderId: string,
  payload: SyncDataPayload,
  existingFileId?: string
): Promise<GoogleDriveBackupFile> {
  const jsonContent = JSON.stringify(payload, null, 2);

  // Trường hợp 1: File đã tồn tại trên Drive -> Dùng PATCH cập nhật nội dung siêu tốc
  if (existingFileId) {
    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: jsonContent
      }
    );

    if (patchRes.ok) {
      const fileData = await patchRes.json();
      return {
        id: fileData.id || existingFileId,
        name: SYNC_FILE_NAME,
        createdTime: fileData.createdTime || new Date().toISOString(),
        modifiedTime: new Date().toISOString()
      };
    }
  }

  // Trường hợp 2: Tạo mới file 'SoThuChi_SyncData.json' trong thư mục
  const metadata = {
    name: SYNC_FILE_NAME,
    parents: [folderId],
    mimeType: 'application/json',
    description: 'Tệp đồng bộ 2 chiều dữ liệu Sổ Thu Chi PWA giữa các thiết bị'
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonContent +
    closeDelim;

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    }
  );

  if (!uploadRes.ok) {
    const errData = await uploadRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Lỗi khi tải file đồng bộ lên Google Drive');
  }

  const uploaded = await uploadRes.json();
  return {
    id: uploaded.id,
    name: uploaded.name,
    createdTime: uploaded.createdTime,
    modifiedTime: uploaded.modifiedTime
  };
}

/**
 * THỰC HIỆN ĐỒNG BỘ 2 CHIỀU THÔNG MINH (Two-Way Smart Sync)
 * 1. Tải dữ liệu mới nhất từ Google Drive về.
 * 2. Hợp nhất (Smart Merge) với dữ liệu cục bộ theo ID, updatedAt và tombstones.
 * 3. Cập nhật dữ liệu hợp nhất vào IndexedDB cục bộ trong 1 transaction an toàn.
 * 4. Ghi ngược lại bản hợp nhất lên Google Drive để máy còn lại mở lên là có ngay.
 */
export async function performGoogleDriveSmartSync(): Promise<SyncResult> {
  if (isSyncInProgress) {
    return {
      success: false,
      message: 'Đang có một tiến trình đồng bộ khác đang chạy. Vui lòng đợi trong giây lát.'
    };
  }

  isSyncInProgress = true;

  try {
    const token = await ensureValidAccessToken();
    const folderId = await getOrCreateBackupFolder(token);

    // 1. Thu thập dữ liệu cục bộ của máy hiện tại
    const localPayload = await getLocalSyncPayload();

    // 2. Tải dữ liệu từ Google Drive
    const remoteData = await downloadSyncDataFromGoogleDrive(token, folderId);

    // TH 1: Google Drive chưa có dữ liệu nào (Lần đầu đăng nhập trên thiết bị đầu tiên)
    if (!remoteData) {
      await uploadSyncDataToGoogleDrive(token, folderId, localPayload);
      const nowIso = new Date().toISOString();

      await db.settings.put({
        key: 'last_google_drive_sync_time',
        value: nowIso
      });

      return {
        success: true,
        message: 'Đã khởi tạo và tải dữ liệu đồng bộ ban đầu lên Google Drive thành công!',
        syncedAt: nowIso
      };
    }

    // TH 2: Cả 2 bên đều có dữ liệu -> Kích hoạt Smart Two-Way Merge
    const { mergedPayload, changes } = mergeTwoWayData(localPayload, remoteData.payload);

    // 3. Áp dụng bản ghi hợp nhất vào IndexedDB của máy hiện tại
    await applyMergedDataToIndexedDB(mergedPayload);

    // 4. Đẩy bản ghi đã hợp nhất ngược lên Google Drive
    await uploadSyncDataToGoogleDrive(token, folderId, mergedPayload, remoteData.file.id);

    const nowIso = new Date().toISOString();
    await db.settings.put({
      key: 'last_google_drive_sync_time',
      value: nowIso
    });

    const changeSummary = [];
    if (changes.addedTransactions > 0) changeSummary.push(`+${changes.addedTransactions} mới`);
    if (changes.updatedTransactions > 0) changeSummary.push(`~${changes.updatedTransactions} cập nhật`);
    if (changes.deletedTransactions > 0) changeSummary.push(`-${changes.deletedTransactions} đã xóa`);

    const detailText = changeSummary.length > 0 ? ` (${changeSummary.join(', ')})` : ' (Dữ liệu đã trùng khớp)';

    return {
      success: true,
      message: `Đồng bộ 2 chiều thành công!${detailText}`,
      syncedAt: nowIso,
      changes
    };
  } catch (err: any) {
    console.error('Lỗi thực hiện Smart Sync:', err);
    return {
      success: false,
      message: err?.message || 'Có lỗi xảy ra khi đồng bộ với Google Drive'
    };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Tự động kiểm tra và thực hiện đồng bộ 2 chiều với Google Drive (Auto-Sync)
 * Chạy khi khởi động app hoặc khi mở lại tab/màn hình
 */
export async function checkAndRunGoogleDriveAutoSync(): Promise<{
  ran: boolean;
  message: string;
  result?: SyncResult;
}> {
  try {
    const isAutoDriveEnabledSetting = await db.settings.get('google_drive_auto_backup_enabled');
    const isAutoDriveEnabled = isAutoDriveEnabledSetting ? Boolean(isAutoDriveEnabledSetting.value) : false;

    if (!isAutoDriveEnabled) {
      return { ran: false, message: 'Tự động đồng bộ Google Drive đang tắt' };
    }

    const token = getStoredAccessToken();
    if (!token) {
      return { ran: false, message: 'Chưa có phiên kết nối Google Drive còn hạn' };
    }

    const result = await performGoogleDriveSmartSync();
    return {
      ran: result.success,
      message: result.message,
      result
    };
  } catch (err: any) {
    return {
      ran: false,
      message: `Lỗi tự động đồng bộ Google Drive: ${err?.message || 'Lỗi không xác định'}`
    };
  }
}

