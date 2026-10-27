// src/services/supabaseService.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  db,
  LOCAL_CONNECTED_SYNC_KEY,
  clearLocalDataChanged,
  hasLocalDataChanged
} from '../db';
import type { SyncDataPayload } from '../types';
import {
  getLocalSyncPayload,
  mergeTwoWayData,
  applyMergedDataToIndexedDB,
  deduplicateSyncPayload
} from './syncService';
import { getCurrentDate } from '../utils/formatters';
import { sha256Hex } from '../utils/crypto';

const ENV_SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const ENV_SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export function normalizeSupabaseUrl(rawUrl: string): string {
  let cleaned = rawUrl.trim();
  if (!cleaned) return '';
  cleaned = cleaned.replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, '');
  return cleaned.replace(/\/+$/, '');
}

export interface SupabaseSyncConfig {
  url: string;
  anonKey: string;
  syncKey: string; // Mã định danh đồng bộ (Email user ID hoặc Mã đồng bộ cá nhân)
  email?: string;
}

export const SUPABASE_SETUP_SQL = `-- Chạy đoạn SQL này 1 lần trong mục SQL Editor của Supabase:
create table if not exists public.user_backups (
  sync_key text primary key,
  user_email text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_backups enable row level security;

create policy "Allow public read/write by sync_key"
  on public.user_backups
  for all
  using (true)
  with check (true);`;

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

/**
 * Lấy cấu hình Supabase hiện tại (ưu tiên từ IndexedDB settings hoặc biến môi trường VITE_SUPABASE_*)
 */
export async function getSupabaseConfig(): Promise<SupabaseSyncConfig> {
  const savedUrl = await db.settings.get('supabase_url');
  const savedKey = await db.settings.get('supabase_anon_key');
  const savedSyncKey = await db.settings.get('supabase_sync_key');
  const savedEmail = await db.settings.get('supabase_user_email');

  let localStoredSyncKey = '';
  try {
    localStoredSyncKey = localStorage.getItem(LOCAL_CONNECTED_SYNC_KEY)?.trim() || '';
  } catch {
    // ignore
  }

  const rawUrl =
    (typeof savedUrl?.value === 'string' && savedUrl.value.trim()) || ENV_SUPABASE_URL;
  const url = normalizeSupabaseUrl(rawUrl);
  const anonKey =
    (typeof savedKey?.value === 'string' && savedKey.value.trim()) || ENV_SUPABASE_ANON_KEY;
  const syncKey =
    (typeof savedSyncKey?.value === 'string' && savedSyncKey.value.trim()) ||
    localStoredSyncKey ||
    '';
  const email =
    (typeof savedEmail?.value === 'string' && savedEmail.value.trim()) || undefined;

  return { url, anonKey, syncKey, email };
}

/**
 * Lưu cấu hình Supabase Project URL, Anon Key và Mã đồng bộ vào IndexedDB & localStorage
 */
export async function saveSupabaseConfig(input: {
  url?: string;
  anonKey?: string;
  syncKey?: string;
  email?: string;
}): Promise<void> {
  if (input.url !== undefined) {
    await db.settings.put({ key: 'supabase_url', value: normalizeSupabaseUrl(input.url) });
  }
  if (input.anonKey !== undefined) {
    await db.settings.put({ key: 'supabase_anon_key', value: input.anonKey.trim() });
  }
  if (input.syncKey !== undefined) {
    const cleanSyncKey = input.syncKey.trim();
    await db.settings.put({ key: 'supabase_sync_key', value: cleanSyncKey });
    try {
      if (cleanSyncKey) {
        localStorage.setItem(LOCAL_CONNECTED_SYNC_KEY, cleanSyncKey);
      } else {
        localStorage.removeItem(LOCAL_CONNECTED_SYNC_KEY);
      }
    } catch {
      // ignore
    }
  }
  if (input.email !== undefined) {
    await db.settings.put({ key: 'supabase_user_email', value: input.email.trim() });
  }
  cachedClient = null;
  cachedConfigKey = '';
}

/**
 * Ngắt kết nối tài khoản / Mã đồng bộ Supabase
 */
export async function disconnectSupabase(): Promise<void> {
  try {
    const client = await getSupabaseClient();
    if (client) {
      await client.auth.signOut();
    }
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(LOCAL_CONNECTED_SYNC_KEY);
  } catch {
    // ignore
  }
  clearLocalDataChanged();
  await db.settings.delete('supabase_sync_key');
  await db.settings.delete('supabase_user_email');
  await db.settings.delete('supabase_pin_hash');
  await db.settings.delete('supabase_recovery_question');
  await db.settings.delete('supabase_recovery_answer_hash');
}

/**
 * Khởi tạo Supabase Client từ cấu hình
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  const { url, anonKey } = await getSupabaseConfig();
  if (!url || !anonKey) return null;

  const key = `${url}::${anonKey}`;
  if (cachedClient && cachedConfigKey === key) {
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  cachedConfigKey = key;
  return cachedClient;
}

/**
 * Đăng nhập hoặc Đăng ký tài khoản bằng Email & Mật khẩu trên Supabase Auth
 */
export async function signInOrSignUpSupabase(
  email: string,
  password: string,
  mode: 'SIGN_IN' | 'SIGN_UP'
): Promise<{ syncKey: string; email: string }> {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error(
      'Chưa nhận được biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY. Vui lòng kiểm tra Environment Variables trên Vercel và Redeploy.'
    );
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error('Vui lòng nhập đầy đủ Email và Mật khẩu.');
  }

  if (mode === 'SIGN_UP') {
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password
    });
    if (error) throw new Error(error.message);
    const syncKey = data.user?.id || cleanEmail;
    await saveSupabaseConfig({ syncKey, email: cleanEmail });
    return { syncKey, email: cleanEmail };
  } else {
    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password
    });
    if (error) throw new Error(error.message);
    const syncKey = data.user?.id || cleanEmail;
    await saveSupabaseConfig({ syncKey, email: cleanEmail });
    return { syncKey, email: cleanEmail };
  }
}

/**
 * Sao lưu toàn bộ dữ liệu hiện tại lên bảng `user_backups` của Supabase
 */
export async function backupToSupabase(): Promise<{
  updatedAt: string;
  syncKey: string;
}> {
  const client = await getSupabaseClient();
  const { syncKey, email } = await getSupabaseConfig();

  if (!client) {
    throw new Error('Chưa cấu hình Supabase URL & Anon Key.');
  }
  if (!syncKey) {
    throw new Error('Vui lòng đăng nhập hoặc nhập Mã Đồng Bộ (Sync Key) trước khi sao lưu.');
  }

  const rawPayload = await getLocalSyncPayload();
  const payload = deduplicateSyncPayload(rawPayload);
  await applyMergedDataToIndexedDB(payload);
  const now = new Date().toISOString();

  const { error } = await client.from('user_backups').upsert(
    {
      sync_key: syncKey,
      user_email: email || syncKey,
      payload,
      updated_at: now
    },
    { onConflict: 'sync_key' }
  );

  if (error) {
    throw new Error(
      `Lỗi lưu lên Supabase: ${error.message}. (Hãy chắc chắn bạn đã chạy lệnh tạo bảng user_backups trong SQL Editor)`
    );
  }

  const today = getCurrentDate();
  await db.settings.put({ key: 'last_supabase_backup_date', value: today });
  await db.settings.put({ key: 'last_supabase_sync_time', value: now });
  clearLocalDataChanged();

  return { updatedAt: now, syncKey };
}

/**
 * Tải bản sao lưu từ bảng `user_backups` của Supabase theo `syncKey`
 */
export async function getBackupFromSupabase(): Promise<{
  payload: SyncDataPayload;
  jsonContent: string;
  updatedAt: string;
} | null> {
  const client = await getSupabaseClient();
  const { syncKey } = await getSupabaseConfig();

  if (!client) {
    throw new Error('Chưa cấu hình Supabase URL & Anon Key.');
  }
  if (!syncKey) {
    throw new Error('Vui lòng đăng nhập hoặc nhập Mã Đồng Bộ trước.');
  }

  const { data, error } = await client
    .from('user_backups')
    .select('payload, updated_at')
    .eq('sync_key', syncKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Lỗi tải dữ liệu từ Supabase: ${error.message}`);
  }

  if (!data || !data.payload) {
    return null;
  }

  const payload = data.payload as SyncDataPayload;
  return {
    payload,
    jsonContent: JSON.stringify(payload, null, 2),
    updatedAt: data.updated_at || new Date().toISOString()
  };
}

/**
 * Kết nối đồng bộ lần đầu trên thiết bị:
 * - Nếu trên Supabase ĐÃ CÓ dữ liệu của mã đồng bộ này -> Xóa sạch (clear) dữ liệu local và nạp thẳng bản từ Cloud về (chống nhân đôi ví/hạng mục mặc định).
 * - Nếu trên Supabase CHƯA CÓ dữ liệu -> Dọn trùng dữ liệu local hiện tại và đẩy lên Cloud làm gốc.
 */
export async function connectInitialSupabaseSync(): Promise<{
  success: boolean;
  action: 'UPLOADED_INITIAL' | 'RESTORED_FROM_CLOUD';
  message: string;
}> {
  const client = await getSupabaseClient();
  const { syncKey, email } = await getSupabaseConfig();

  if (!client) {
    throw new Error(
      'Chưa nhận được biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY. Vui lòng kiểm tra Environment Variables trên Vercel và Redeploy.'
    );
  }
  if (!syncKey) {
    throw new Error('Chưa kết nối tài khoản hoặc Mã đồng bộ Supabase.');
  }

  const remoteRecord = await getBackupFromSupabase();

  // Trường hợp 1: Trên Cloud chưa có dữ liệu -> Đẩy dữ liệu máy hiện tại lên làm bản gốc
  if (!remoteRecord) {
    await backupToSupabase();
    return {
      success: true,
      action: 'UPLOADED_INITIAL',
      message: 'Đã khởi tạo và đẩy dữ liệu lên Supabase Cloud thành công!'
    };
  }

  // Trường hợp 2: Trên Cloud ĐÃ CÓ dữ liệu -> Clear sạch data local và nạp bản chuẩn đã khử trùng từ Cloud
  const cleanedCloudPayload = deduplicateSyncPayload(remoteRecord.payload);
  await applyMergedDataToIndexedDB(cleanedCloudPayload);

  // Cập nhật lại bản đã khử trùng lên Cloud để đảm bảo Cloud cũng sạch hoàn toàn
  const now = new Date().toISOString();
  const { error } = await client.from('user_backups').upsert(
    {
      sync_key: syncKey,
      user_email: email || syncKey,
      payload: cleanedCloudPayload,
      updated_at: now
    },
    { onConflict: 'sync_key' }
  );

  if (error) {
    throw new Error(`Lỗi cập nhật dữ liệu đồng bộ: ${error.message}`);
  }

  const today = getCurrentDate();
  await db.settings.put({ key: 'last_supabase_backup_date', value: today });
  await db.settings.put({ key: 'last_supabase_sync_time', value: now });
  clearLocalDataChanged();

  return {
    success: true,
    action: 'RESTORED_FROM_CLOUD',
    message: `Đã xóa dữ liệu tạm ở máy và tải về ${cleanedCloudPayload.data.transactions.length} giao dịch, ${cleanedCloudPayload.data.wallets.length} ví từ Supabase!`
  };
}

/**
 * Đồng bộ 2 chiều thông minh (Smart Two-Way Merge) giữa Thiết bị hiện tại và Supabase Cloud
 */
export async function performSupabaseSmartSync(): Promise<{
  success: boolean;
  action: 'UPLOADED_INITIAL' | 'MERGED_AND_SYNCED';
  message: string;
}> {
  const client = await getSupabaseClient();
  const { syncKey, email } = await getSupabaseConfig();

  if (!client) {
    throw new Error(
      'Chưa nhận được biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY. Vui lòng kiểm tra Environment Variables trên Vercel và Redeploy.'
    );
  }
  if (!syncKey) {
    throw new Error('Chưa kết nối tài khoản hoặc Mã đồng bộ Supabase.');
  }

  const remoteRecord = await getBackupFromSupabase();

  // Nếu trên Supabase chưa có bản sao nào -> Đẩy dữ liệu hiện tại lên làm gốc
  if (!remoteRecord) {
    await backupToSupabase();
    return {
      success: true,
      action: 'UPLOADED_INITIAL',
      message: 'Đã khởi tạo và đẩy toàn bộ dữ liệu lên Supabase Cloud thành công!'
    };
  }

  // Hợp nhất 2 chiều (Two-Way Merge) giữa Local IndexedDB và Supabase Payload
  const localPayload = await getLocalSyncPayload();
  const mergedResult = mergeTwoWayData(localPayload, remoteRecord.payload);

  // Nạp lại bản đã hợp nhất vào IndexedDB
  await applyMergedDataToIndexedDB(mergedResult.mergedPayload);

  // Đẩy bản hợp nhất mới nhất lên lại Supabase
  const now = new Date().toISOString();
  const { error } = await client.from('user_backups').upsert(
    {
      sync_key: syncKey,
      user_email: email || syncKey,
      payload: mergedResult.mergedPayload,
      updated_at: now
    },
    { onConflict: 'sync_key' }
  );

  if (error) {
    throw new Error(`Lỗi cập nhật bản hợp nhất lên Supabase: ${error.message}`);
  }

  const today = getCurrentDate();
  await db.settings.put({ key: 'last_supabase_backup_date', value: today });
  await db.settings.put({ key: 'last_supabase_sync_time', value: now });
  clearLocalDataChanged();

  return {
    success: true,
    action: 'MERGED_AND_SYNCED',
    message: `Đồng bộ Supabase thành công (${mergedResult.mergedPayload.data.transactions.length} giao dịch, ${mergedResult.mergedPayload.data.wallets.length} ví)!`
  };
}

let lastStartupCheckTimestamp = 0;

/**
 * Tự động đồng bộ ngầm với Supabase:
 * - Khi mở app hoặc quay lại tab (trigger === 'STARTUP'):
 *   + Nếu local có thay đổi chưa đồng bộ -> Hợp nhất và đẩy lên Cloud ngay.
 *   + Nếu Cloud có bản cập nhật mới hơn (do thiết bị khác vừa ghi chép) -> Tự động kéo về máy ngay lập tức!
 * - Khi đang dùng app (trigger === 'DIRTY_ONLY'):
 *   + CHỈ chạy khi thực sự có thay đổi mới ở local (hasLocalDataChanged() === true).
 *   + Tuyệt đối không spam mạng liên tục khi không có thay đổi.
 */
export async function checkAndRunSupabaseAutoSync(
  trigger: 'STARTUP' | 'DIRTY_ONLY' = 'DIRTY_ONLY'
): Promise<{
  ran: boolean;
  message: string;
}> {
  try {
    const autoEnabledSetting = await db.settings.get('supabase_auto_sync_enabled');
    const isAutoEnabled =
      autoEnabledSetting === undefined ? true : Boolean(autoEnabledSetting.value);
    if (!isAutoEnabled) {
      return { ran: false, message: 'Tự động đồng bộ Supabase đang tắt' };
    }

    const { url, anonKey, syncKey } = await getSupabaseConfig();
    if (!url || !anonKey || !syncKey) {
      return { ran: false, message: 'Chưa kết nối Mã đồng bộ dưới local' };
    }

    // Đảm bảo mã đồng bộ đã được lưu cố định ở localStorage
    try {
      if (!localStorage.getItem(LOCAL_CONNECTED_SYNC_KEY)) {
        localStorage.setItem(LOCAL_CONNECTED_SYNC_KEY, syncKey);
      }
    } catch {
      // ignore
    }

    // TRƯỜNG HỢP 1: KHI MỞ APP HOẶC QUAY LẠI TAB (STARTUP)
    if (trigger === 'STARTUP') {
      const nowMs = Date.now();
      if (nowMs - lastStartupCheckTimestamp < 15000) {
        return { ran: false, message: 'Vừa mới kiểm tra đồng bộ gần đây' };
      }
      lastStartupCheckTimestamp = nowMs;

      // 1A. Nếu dưới local đang có thay đổi chưa đẩy -> Chạy đồng bộ 2 chiều đầy đủ ngay
      if (hasLocalDataChanged()) {
        const res = await performSupabaseSmartSync();
        return { ran: res.success, message: res.message };
      }

      // 1B. Nếu dưới local chưa có thay đổi gì, kiểm tra xem trên Cloud có bản mới từ thiết bị khác không
      const remoteRecord = await getBackupFromSupabase();
      if (!remoteRecord) {
        return { ran: false, message: 'Chưa có bản sao lưu trên Supabase' };
      }

      const lastSyncSetting = await db.settings.get('last_supabase_sync_time');
      const localSyncTime =
        typeof lastSyncSetting?.value === 'string'
          ? new Date(lastSyncSetting.value).getTime()
          : 0;
      const remoteTime = new Date(remoteRecord.updatedAt).getTime();

      // Nếu Cloud có bản cập nhật mới hơn thời điểm đồng bộ trước của máy này (> 1.5s):
      // Tải và nạp ngay dữ liệu mới nhất vào IndexedDB
      if (remoteTime - localSyncTime > 1500) {
        const localPayload = await getLocalSyncPayload();
        const mergedResult = mergeTwoWayData(localPayload, remoteRecord.payload);
        await applyMergedDataToIndexedDB(mergedResult.mergedPayload);

        const today = getCurrentDate();
        await db.settings.put({ key: 'last_supabase_backup_date', value: today });
        await db.settings.put({ key: 'last_supabase_sync_time', value: remoteRecord.updatedAt });
        clearLocalDataChanged();

        const addedCount = mergedResult.changes.addedTransactions;
        const msg =
          addedCount > 0
            ? `Đã tự động cập nhật ${addedCount} giao dịch mới nhất từ Cloud!`
            : 'Đã cập nhật dữ liệu mới nhất từ Supabase Cloud!';

        return { ran: true, message: msg };
      }

      return { ran: false, message: 'Dữ liệu đã ở bản mới nhất' };
    }

    // TRƯỜNG HỢP 2: KHI ĐANG DÙNG APP (DIRTY_ONLY)
    // CHỈ đồng bộ khi thực sự có thay đổi dữ liệu dưới local
    if (!hasLocalDataChanged()) {
      return { ran: false, message: 'Không có thay đổi dữ liệu mới dưới local' };
    }

    const res = await performSupabaseSmartSync();
    return { ran: res.success, message: res.message };
  } catch (err: any) {
    console.warn('[Supabase AutoSync] Bỏ qua đồng bộ tự động:', err);
    return { ran: false, message: err?.message || 'Lỗi đồng bộ ngầm Supabase' };
  }
}

/**
 * Kiểm tra trạng thái bảo mật của Mã đồng bộ trên Supabase (Đã có PIN hay chưa)
 */
export async function checkSyncKeySecurity(syncKey: string): Promise<{
  exists: boolean;
  hasPin: boolean;
  recoveryQuestion?: string;
  pinHash?: string;
  recoveryAnswerHash?: string;
  payload?: SyncDataPayload;
}> {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Chưa nhận được biến môi trường Supabase URL & Anon Key.');
  }

  const cleanKey = syncKey.trim();
  const { data, error } = await client
    .from('user_backups')
    .select('payload')
    .eq('sync_key', cleanKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Lỗi kiểm tra Supabase: ${error.message}`);
  }

  if (!data || !data.payload) {
    return { exists: false, hasPin: false };
  }

  const payload = data.payload as SyncDataPayload;
  const sec = payload.security;
  const hasPin = Boolean(sec?.pinHash);

  return {
    exists: true,
    hasPin,
    recoveryQuestion: sec?.recoveryQuestion,
    pinHash: sec?.pinHash,
    recoveryAnswerHash: sec?.recoveryAnswerHash,
    payload
  };
}

/**
 * Xác thực mã PIN với Supabase
 */
export async function verifySyncPin(syncKey: string, inputPin: string): Promise<boolean> {
  const sec = await checkSyncKeySecurity(syncKey);
  if (!sec.exists || !sec.hasPin || !sec.pinHash) {
    return true; // Không có PIN thì coi như hợp lệ
  }
  const inputHash = await sha256Hex(inputPin.trim());
  return inputHash === sec.pinHash;
}

/**
 * Khôi phục mã PIN bằng câu trả lời bảo mật và cập nhật PIN mới
 */
export async function recoverSyncPinWithAnswer(
  syncKey: string,
  answer: string,
  newPin: string
): Promise<{ success: boolean; message: string }> {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Chưa cấu hình Supabase URL.');

  const sec = await checkSyncKeySecurity(syncKey);
  if (!sec.exists || !sec.hasPin || !sec.recoveryAnswerHash || !sec.payload) {
    throw new Error('Mã đồng bộ này không có thông tin khôi phục bảo mật.');
  }

  const cleanAnswer = answer.trim().toLowerCase();
  const answerHash = await sha256Hex(cleanAnswer);

  if (answerHash !== sec.recoveryAnswerHash) {
    return { success: false, message: 'Câu trả lời bảo mật không chính xác. Vui lòng kiểm tra lại!' };
  }

  // Câu trả lời đúng -> Tạo hash cho PIN mới và cập nhật lên Cloud + Local
  const newPinHash = await sha256Hex(newPin.trim());
  const now = new Date().toISOString();

  const updatedSecurity = {
    ...sec.payload.security,
    pinHash: newPinHash,
    updatedAt: now
  };

  const updatedPayload: SyncDataPayload = {
    ...sec.payload,
    security: updatedSecurity
  };

  const { error } = await client.from('user_backups').upsert(
    {
      sync_key: syncKey.trim(),
      payload: updatedPayload,
      updated_at: now
    },
    { onConflict: 'sync_key' }
  );

  if (error) {
    throw new Error(`Lỗi cập nhật mã PIN lên Supabase: ${error.message}`);
  }

  // Cập nhật local settings
  await db.settings.put({ key: 'supabase_pin_hash', value: newPinHash });
  if (sec.recoveryQuestion) {
    await db.settings.put({ key: 'supabase_recovery_question', value: sec.recoveryQuestion });
  }

  return { success: true, message: 'Đã đặt lại mã PIN mới thành công!' };
}

/**
 * Thiết lập hoặc thay đổi Mã PIN & Câu hỏi bảo mật cho Mã đồng bộ hiện tại
 */
export async function setupOrUpdateSyncSecurity(
  pin: string,
  question: string,
  answer: string
): Promise<void> {
  const pinHash = await sha256Hex(pin.trim());
  const answerHash = await sha256Hex(answer.trim().toLowerCase());
  const cleanQuestion = question.trim();

  // Lưu vào IndexedDB settings
  await db.settings.put({ key: 'supabase_pin_hash', value: pinHash });
  await db.settings.put({ key: 'supabase_recovery_question', value: cleanQuestion });
  await db.settings.put({ key: 'supabase_recovery_answer_hash', value: answerHash });

  // Đẩy cập nhật ngay lên Supabase
  const client = await getSupabaseClient();
  const { syncKey, email } = await getSupabaseConfig();
  if (client && syncKey) {
    const rawPayload = await getLocalSyncPayload();
    const payload = deduplicateSyncPayload(rawPayload);
    const now = new Date().toISOString();

    payload.security = {
      pinHash,
      recoveryQuestion: cleanQuestion,
      recoveryAnswerHash: answerHash,
      updatedAt: now
    };

    await client.from('user_backups').upsert(
      {
        sync_key: syncKey,
        user_email: email || syncKey,
        payload,
        updated_at: now
      },
      { onConflict: 'sync_key' }
    );
  }
}

/**
 * Gỡ bỏ bảo vệ Mã PIN khỏi Mã đồng bộ
 */
export async function removeSyncSecurity(): Promise<void> {
  await db.settings.delete('supabase_pin_hash');
  await db.settings.delete('supabase_recovery_question');
  await db.settings.delete('supabase_recovery_answer_hash');

  const client = await getSupabaseClient();
  const { syncKey, email } = await getSupabaseConfig();
  if (client && syncKey) {
    const rawPayload = await getLocalSyncPayload();
    const payload = deduplicateSyncPayload(rawPayload);
    delete payload.security;
    const now = new Date().toISOString();

    await client.from('user_backups').upsert(
      {
        sync_key: syncKey,
        user_email: email || syncKey,
        payload,
        updated_at: now
      },
      { onConflict: 'sync_key' }
    );
  }
}
