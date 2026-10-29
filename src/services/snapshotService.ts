// src/services/snapshotService.ts
import { db, clearLocalDataChanged } from '../db';
import { getSupabaseClient, getSupabaseConfig } from './supabaseService';
import {
  getLocalSyncPayload,
  deduplicateSyncPayload,
  applyMergedDataToIndexedDB,
  clearDeletedEntities
} from './syncService';
import { ensureStandardizedCategories } from '../db/seed';
import { getCurrentDate } from '../utils/formatters';

export interface CloudSnapshotItem {
  id: string;
  syncKey: string;
  backupDate: string; // 'YYYY-MM-DD'
  txCount: number;
  walletCount: number;
  createdAt: string;
}

/**
 * Tự động kiểm tra và tạo 1 bản Snapshot lưu trữ hàng ngày lên bảng `user_backup_history`.
 * - Mỗi ngày chỉ lưu đúng 1 bản chuẩn.
 * - Tự động xóa các bản snapshot cũ quá 5 ngày (Rolling 5-day retention).
 */
export async function checkAndCreateDailyCloudSnapshot(options?: {
  force?: boolean;
}): Promise<{ created: boolean; message: string; snapshotDate?: string }> {
  try {
    const client = await getSupabaseClient();
    const { syncKey } = await getSupabaseConfig();

    if (!client || !syncKey) {
      return { created: false, message: 'Chưa cấu hình hoặc kết nối Supabase Cloud.' };
    }

    const today = getCurrentDate();

    // 1. Kiểm tra nếu không ép buộc tạo lại
    if (!options?.force) {
      const lastSnapshotSetting = await db.settings.get('last_daily_cloud_snapshot_date');
      if (lastSnapshotSetting?.value === today) {
        return { created: false, message: 'Hôm nay đã có snapshot.', snapshotDate: today };
      }

      // Kiểm tra trên Supabase xem ngày hôm nay đã có bản ghi chưa
      const { data: existing } = await client
        .from('user_backup_history')
        .select('id')
        .eq('sync_key', syncKey)
        .eq('backup_date', today)
        .maybeSingle();

      if (existing) {
        await db.settings.put({ key: 'last_daily_cloud_snapshot_date', value: today });
        return { created: false, message: 'Hôm nay đã có snapshot trên Cloud.', snapshotDate: today };
      }
    }

    // 2. Thu thập dữ liệu hiện tại từ máy
    const rawPayload = await getLocalSyncPayload();
    const cleanedPayload = deduplicateSyncPayload(rawPayload);
    const now = new Date().toISOString();

    const txCount = cleanedPayload.data?.transactions?.length || 0;
    const walletCount = cleanedPayload.data?.wallets?.length || 0;

    // 3. Ghi dữ liệu vào bảng snapshot lịch sử user_backup_history
    // Kiểm tra xem đã có bản ghi của ngày hôm nay chưa
    const { data: existingRecord } = await client
      .from('user_backup_history')
      .select('id')
      .eq('sync_key', syncKey)
      .eq('backup_date', today)
      .maybeSingle();

    let writeErr: any = null;

    if (existingRecord?.id) {
      // Đã có bản ghi hôm nay -> Cập nhật payload mới, số lượng mới và mốc thời gian created_at mới nhất
      const { error } = await client
        .from('user_backup_history')
        .update({
          payload: cleanedPayload,
          tx_count: txCount,
          wallet_count: walletCount,
          created_at: now
        })
        .eq('id', existingRecord.id);
      writeErr = error;
    } else {
      // Chưa có -> Tạo mới bản ghi cho ngày hôm nay
      const { error } = await client
        .from('user_backup_history')
        .insert({
          sync_key: syncKey,
          backup_date: today,
          payload: cleanedPayload,
          tx_count: txCount,
          wallet_count: walletCount,
          created_at: now
        });
      writeErr = error;
    }

    if (writeErr) {
      // Nếu bảng chưa được tạo trong SQL Editor
      if (writeErr.message?.includes('relation') && writeErr.message?.includes('does not exist')) {
        return {
          created: false,
          message: 'Bảng user_backup_history chưa được tạo trên Supabase. Vui lòng chạy mã SQL trong Cài đặt.'
        };
      }
      throw new Error(writeErr.message);
    }

    // 4. Xóa các bản snapshot cũ hơn 5 ngày (Rolling 5-day retention)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 5);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);

    await client
      .from('user_backup_history')
      .delete()
      .eq('sync_key', syncKey)
      .lt('backup_date', cutoffDateStr);

    await db.settings.put({ key: 'last_daily_cloud_snapshot_date', value: today });

    return {
      created: true,
      message: `Đã tạo điểm khôi phục ngày ${today} (${txCount} giao dịch, ${walletCount} tài khoản)!`,
      snapshotDate: today
    };
  } catch (err: any) {
    console.warn('[checkAndCreateDailyCloudSnapshot] Lỗi:', err);
    return { created: false, message: err?.message || 'Lỗi tạo snapshot' };
  }
}

/**
 * Lấy danh sách tối đa 5 bản snapshot lịch sử gần nhất từ Supabase
 */
export async function getCloudSnapshotHistory(): Promise<{
  snapshots: CloudSnapshotItem[];
  tableMissing?: boolean;
  error?: string;
}> {
  try {
    const client = await getSupabaseClient();
    const { syncKey } = await getSupabaseConfig();

    if (!client || !syncKey) {
      return { snapshots: [] };
    }

    const { data, error } = await client
      .from('user_backup_history')
      .select('id, sync_key, backup_date, tx_count, wallet_count, created_at')
      .eq('sync_key', syncKey)
      .order('backup_date', { ascending: false })
      .limit(5);

    if (error) {
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return { snapshots: [], tableMissing: true };
      }
      return { snapshots: [], error: error.message };
    }

    const snapshots: CloudSnapshotItem[] = (data || []).map((row: any) => ({
      id: row.id,
      syncKey: row.sync_key,
      backupDate: row.backup_date,
      txCount: Number(row.tx_count) || 0,
      walletCount: Number(row.wallet_count) || 0,
      createdAt: row.created_at
    }));

    return { snapshots };
  } catch (err: any) {
    return { snapshots: [], error: err?.message || 'Lỗi kết nối' };
  }
}

/**
 * Khôi phục toàn bộ dữ liệu từ 1 Snapshot lịch sử trên Cloud về máy
 */
export async function restoreFromCloudSnapshot(snapshotId: string): Promise<{
  success: boolean;
  date: string;
  txCount: number;
  message: string;
}> {
  const client = await getSupabaseClient();
  const { syncKey } = await getSupabaseConfig();

  if (!client || !syncKey) {
    throw new Error('Chưa kết nối Supabase Cloud.');
  }

  // 1. Tải payload từ snapshot được chọn
  const { data, error } = await client
    .from('user_backup_history')
    .select('payload, backup_date, tx_count, wallet_count')
    .eq('id', snapshotId)
    .eq('sync_key', syncKey)
    .single();

  if (error || !data || !data.payload) {
    throw new Error(`Không thể tải điểm khôi phục: ${error?.message || 'Dữ liệu trống'}`);
  }

  const cleanPayload = deduplicateSyncPayload(data.payload);
  const now = new Date().toISOString();

  // 2. Cập nhật bản Live Sync trên Cloud để các thiết bị khác cũng kéo bản khôi phục này về
  await client.from('user_backups').upsert(
    {
      sync_key: syncKey,
      payload: cleanPayload,
      updated_at: now
    },
    { onConflict: 'sync_key' }
  );

  // 3. Nạp dữ liệu an toàn vào IndexedDB của máy
  await applyMergedDataToIndexedDB(cleanPayload);
  await ensureStandardizedCategories(true);
  await clearDeletedEntities();
  clearLocalDataChanged();

  const today = getCurrentDate();
  await db.settings.put({ key: 'last_supabase_sync_time', value: now });
  await db.settings.put({ key: 'last_supabase_backup_date', value: today });

  return {
    success: true,
    date: data.backup_date,
    txCount: Number(data.tx_count) || 0,
    message: `Đã khôi phục thành công toàn bộ dữ liệu về ngày ${data.backup_date}!`
  };
}
