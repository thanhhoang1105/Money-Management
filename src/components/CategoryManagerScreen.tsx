// src/components/CategoryManagerScreen.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Category, CategoryType } from '../types';
import { CategoryIcon } from './CategoryIcon';
import { generateUUID } from '../utils/uuid';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Search,
  Star,
  HelpCircle
} from 'lucide-react';

interface CategoryManagerScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategory?: (category: Category) => void;
  initialTab?: CategoryType;
}

// Bảng màu presets bắt mắt
const COLOR_PRESETS = [
  '#F97316', // Cam
  '#EF4444', // Đỏ
  '#10B981', // Xanh lá
  '#3B82F6', // Xanh dương
  '#8B5CF6', // Tím
  '#EC4899', // Hồng
  '#EAB308', // Vàng
  '#06B6D4', // Cyan
  '#14B8A6', // Teal
  '#F59E0B', // Hổ phách
  '#64748B', // Xám slate
  '#7C3AED'  // Tím đậm
];

// Danh sách Icons phong phú không trùng lặp (84 icons)
const ICON_PRESETS = [
  // 1. Ẩm thực & Nấu nướng
  'Soup', 'UtensilsCrossed', 'Utensils', 'Coffee', 'Beer', 'Wine', 'Pizza', 'Apple', 'Fish', 'Carrot',
  // 2. Di chuyển & Du lịch
  'Fuel', 'Car', 'Bus', 'Plane', 'Bike', 'Train', 'Truck', 'Ticket',
  // 3. Nhà cửa & Tiện ích
  'Home', 'Building', 'Lightbulb', 'Droplets', 'Wifi', 'Wrench', 'Hammer', 'Bed', 'Bath',
  // 4. Sức khỏe & Làm đẹp
  'HeartPulse', 'Stethoscope', 'Pill', 'Activity', 'ShieldCheck', 'Smile', 'Sparkles', 'Scissors',
  // 5. Học tập & Công việc
  'GraduationCap', 'BookOpen', 'Briefcase', 'Laptop', 'Book', 'Award', 'PenTool', 'FileText',
  // 6. Mua sắm & Tiêu dùng
  'ShoppingBag', 'ShoppingCart', 'Store', 'Shirt', 'Watch', 'Tag', 'Package', 'Gift',
  // 7. Thể thao & Giải trí
  'Dumbbell', 'Trophy', 'Clapperboard', 'Film', 'Music', 'Headphones', 'Camera', 'Gamepad2', 'Dice5', 'Palette',
  // 8. Tài chính, Tiền tệ & Ngân hàng
  'Wallet', 'Banknote', 'Coins', 'CreditCard', 'Landmark', 'PiggyBank', 'TrendingUp', 'TrendingDown', 'Receipt', 'HandCoins', 'CircleDollarSign', 'Vault',
  // 9. Gia đình, Đời sống & Cảnh báo
  'PartyPopper', 'Baby', 'Dog', 'Cat', 'Heart', 'Flame', 'AlertTriangle', 'Trash2', 'Clock', 'MoreHorizontal'
];

export const CategoryManagerScreen: React.FC<CategoryManagerScreenProps> = ({
  isOpen,
  onClose,
  onSelectCategory,
  initialTab = 'EXPENSE'
}) => {
  const [activeTab, setActiveTab] = useState<CategoryType>(initialTab);
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  // Trạng thái modal Thêm / Sửa
  const [isEditing, setIsEditing] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<CategoryType>(activeTab);
  const [formIsChild, setFormIsChild] = useState(true);
  const [formParentId, setFormParentId] = useState<string>('');
  const [formIcon, setFormIcon] = useState('Tag');
  const [formColor, setFormColor] = useState('#3B82F6');
  const [formTagsStr, setFormTagsStr] = useState('');
  const [formIsStarred, setFormIsStarred] = useState(false);
  const [formError, setFormError] = useState('');

  // Tìm kiếm biểu tượng
  const [iconSearch, setIconSearch] = useState('');

  // Bật/tắt gắn sao 1 chạm trực tiếp
  const handleToggleStar = async (cat: Category) => {
    try {
      await db.categories.update(cat.id, {
        isStarred: !cat.isStarred,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Lỗi khi gắn sao danh mục:', err);
    }
  };

  // Lọc danh sách icon theo từ khóa tìm kiếm
  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return ICON_PRESETS;
    const q = iconSearch.trim().toLowerCase();
    return ICON_PRESETS.filter((icon) => icon.toLowerCase().includes(q));
  }, [iconSearch]);

  // Lọc theo Tab đang chọn
  const tabCategories = useMemo(() => {
    return categories.filter((c) => c.type === activeTab);
  }, [categories, activeTab]);

  // Các danh mục cha của Tab hiện tại
  const parentCategories = useMemo(() => {
    return tabCategories.filter((c) => !c.parentId);
  }, [tabCategories]);

  // Các danh mục con gom theo parentId
  const childCategoriesByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    tabCategories.forEach((c) => {
      if (c.parentId) {
        const arr = map.get(c.parentId) || [];
        arr.push(c);
        map.set(c.parentId, arr);
      }
    });
    return map;
  }, [tabCategories]);


  if (!isOpen) return null;

  // Mở form thêm mới
  const handleOpenAdd = (presetParentId?: string) => {
    setEditingCat(null);
    setFormName('');
    setFormType(activeTab);
    setFormIsChild(activeTab === 'EXPENSE' ? true : !!presetParentId);
    setFormParentId(presetParentId || (parentCategories[0]?.id || ''));
    setFormIcon('Tag');
    setFormColor(parentCategories[0]?.color || '#3B82F6');
    setFormTagsStr('');
    setFormIsStarred(false);
    setFormError('');
    setIconSearch('');
    setIsEditing(true);
  };

  // Mở form chỉnh sửa
  const handleOpenEdit = (cat: Category) => {
    setEditingCat(cat);
    setFormName(cat.name);
    setFormType(cat.type);
    setFormIsChild(!!cat.parentId);
    setFormParentId(cat.parentId || '');
    setFormIcon(cat.icon || 'Tag');
    setFormColor(cat.color || '#3B82F6');
    setFormTagsStr(cat.quickTags?.join(', ') || '');
    setFormIsStarred(!!cat.isStarred);
    setFormError('');
    setIconSearch('');
    setIsEditing(true);
  };

  // Lưu hạng mục (Tạo mới hoặc Sửa)
  const handleSaveCategory = async () => {
    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError('Vui lòng nhập tên hạng mục');
      return;
    }

    const now = new Date().toISOString();
    const tags = formTagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingCat) {
        await db.categories.update(editingCat.id, {
          name: trimmed,
          type: formType,
          parentId: formIsChild ? formParentId || undefined : undefined,
          icon: formIcon,
          color: formColor,
          quickTags: tags,
          isStarred: formIsStarred,
          updatedAt: now
        });
      } else {
        await db.categories.add({
          id: generateUUID(),
          name: trimmed,
          type: formType,
          parentId: formIsChild ? formParentId || undefined : undefined,
          icon: formIcon,
          color: formColor,
          quickTags: tags,
          isDefault: false,
          isStarred: formIsStarred,
          createdAt: now
        });
      }
      setIsEditing(false);
    } catch (err: any) {
      setFormError(err?.message || 'Có lỗi xảy ra khi lưu hạng mục');
    }
  };

  // Xóa hạng mục
  const handleDeleteCategory = async (cat: Category) => {
    const isParent = !cat.parentId;
    const childs = childCategoriesByParent.get(cat.id) || [];

    const confirmMsg = isParent && childs.length > 0
      ? `CẢNH BÁO: Hạng mục cha "${cat.name}" đang chứa ${childs.length} mục con. Bạn có chắc muốn xóa không?`
      : `Bạn có chắc chắn muốn xóa hạng mục "${cat.name}"?`;

    if (window.confirm(confirmMsg)) {
      try {
        await db.categories.delete(cat.id);
        if (isParent && childs.length > 0) {
          // Gỡ parentId của các con
          for (const ch of childs) {
            await db.categories.update(ch.id, { parentId: undefined });
          }
        }
      } catch (err: any) {
        alert('Lỗi xóa: ' + (err?.message || 'Thao tác thất bại'));
      }
    }
  };

  // Khi bấm vào 1 hạng mục để chọn cho giao dịch
  const handleItemClick = (cat: Category) => {
    if (onSelectCategory) {
      onSelectCategory(cat);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[#090d16] flex flex-col text-slate-100 font-body animate-fade-in">
      {/* 1. Header Bar chuẩn iOS */}
      <header className="sticky top-0 z-40 safe-padding-top px-4 py-3 bg-slate-900/95 backdrop-blur-md border-b border-white/8 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="touch-btn flex items-center gap-1 text-sky-400 font-semibold text-sm cursor-pointer border-none bg-transparent py-1 px-1 -ml-1"
        >
          <ArrowLeft size={19} />
          <span>Quay lại</span>
        </button>

        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
          {onSelectCategory ? 'Chọn hạng mục' : 'Quản lý hạng mục'}
        </h2>

        <button
          type="button"
          onClick={() => handleOpenAdd()}
          className="touch-btn flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30 text-xs font-bold cursor-pointer hover:bg-sky-500/30"
        >
          <Plus size={15} />
          <span>Thêm</span>
        </button>
      </header>

      {/* 2. 3 TAB LỚN: CHI TIỀN, THU TIỀN, VAY NỢ */}
      <div className="px-4 pt-3 pb-2 bg-slate-900/60 border-b border-white/5">
        <div className="grid grid-cols-3 gap-2 p-1 bg-slate-800/80 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('EXPENSE')}
            className={`touch-btn py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer border-none ${
              activeTab === 'EXPENSE'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                : 'text-slate-400 hover:text-white bg-transparent'
            }`}
          >
            Chi tiền
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('INCOME')}
            className={`touch-btn py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer border-none ${
              activeTab === 'INCOME'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                : 'text-slate-400 hover:text-white bg-transparent'
            }`}
          >
            Thu tiền
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DEBT')}
            className={`touch-btn py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer border-none ${
              activeTab === 'DEBT'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/25'
                : 'text-slate-400 hover:text-white bg-transparent'
            }`}
          >
            Vay nợ
          </button>
        </div>
      </div>

      {/* 3. DANH SÁCH HẠNG MỤC PHÂN CẤP */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4 pb-20">
        {onSelectCategory && (
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/20 text-sky-300 text-xs flex items-center gap-2">
            <HelpCircle size={15} className="shrink-0" />
            <span>Chạm vào một hạng mục để chọn cho giao dịch</span>
          </div>
        )}

        {/* TRƯỜNG HỢP CHI TIỀN: PHÂN THEO CÁC HẠNG MỤC CHA (MUST HAVE, NICE TO HAVE, WASTED) */}
        {parentCategories.map((parent) => {
          const children = childCategoriesByParent.get(parent.id) || [];

          return (
            <div
              key={parent.id}
              className="rounded-2xl bg-slate-900 border border-white/8 overflow-hidden shadow-md"
            >
              {/* Header Hạng mục cha */}
              <div className="px-3.5 py-3 bg-slate-800/80 border-b border-white/6 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: parent.color }}
                  >
                    <CategoryIcon name={parent.icon || 'FolderTree'} size={15} color="#ffffff" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{parent.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300 font-normal">
                        {children.length} mục
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenAdd(parent.id)}
                    className="touch-btn text-xs font-semibold text-sky-400 bg-sky-500/10 px-2 py-1 rounded-lg border-none flex items-center gap-0.5 cursor-pointer hover:bg-sky-500/20"
                    title="Thêm mục con"
                  >
                    <Plus size={13} />
                    <span>Thêm con</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(parent)}
                    className="touch-btn p-1.5 text-slate-400 hover:text-white rounded-lg bg-transparent border-none cursor-pointer"
                    title="Sửa hạng mục cha"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              </div>

              {/* Lưới các Hạng mục con */}
              {children.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Chưa có hạng mục con nào. Bấm "Thêm con" ở trên để tạo.
                </div>
              ) : (
                <div className="p-2.5 grid grid-cols-2 gap-2">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      onClick={() => handleItemClick(child)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        onSelectCategory
                          ? 'hover:border-sky-400 hover:bg-slate-800/80 active:scale-98'
                          : ''
                      } bg-slate-800/50 border-white/5`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: child.color }}
                        >
                          <CategoryIcon name={child.icon || 'Tag'} size={14} color="#ffffff" />
                        </div>
                        <div className="truncate text-left">
                          <div className="text-xs font-semibold text-slate-100 truncate">
                            {child.name}
                          </div>
                          {child.quickTags && child.quickTags.length > 0 && (
                            <div className="text-[10px] text-slate-400 truncate">
                              {child.quickTags[0]}
                              {child.quickTags.length > 1 ? ` +${child.quickTags.length - 1}` : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleStar(child)}
                          className={`touch-btn p-1.5 rounded-lg cursor-pointer border-none bg-transparent transition-colors ${
                            child.isStarred
                              ? 'text-amber-400 hover:text-amber-300'
                              : 'text-slate-600 hover:text-slate-400'
                          }`}
                          title={child.isStarred ? 'Bỏ gắn sao ưu tiên' : 'Gắn sao ưu tiên (Mục hay dùng)'}
                        >
                          <Star size={14} className={child.isStarred ? 'fill-amber-400' : ''} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(child)}
                          className="touch-btn p-1.5 text-slate-400 hover:text-white rounded bg-transparent border-none cursor-pointer"
                          title="Sửa"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Các mục độc lập không có cha (hoặc trường hợp Tab Thu tiền / Vay nợ) */}
        {parentCategories.length === 0 && (
          <div className="grid grid-cols-2 gap-2">
            {tabCategories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => handleItemClick(cat)}
                className="p-3 rounded-2xl bg-slate-900 border border-white/8 flex items-center justify-between cursor-pointer hover:border-sky-400"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    <CategoryIcon name={cat.icon || 'Tag'} size={16} color="#ffffff" />
                  </div>
                  <div className="truncate text-left">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                      <span>{cat.name}</span>
                      {cat.isStarred && (
                        <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />
                      )}
                    </div>
                    {cat.quickTags && cat.quickTags.length > 0 && (
                      <div className="text-[10px] text-slate-400 truncate">
                        {cat.quickTags.slice(0, 2).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => handleToggleStar(cat)}
                    className={`touch-btn p-1.5 rounded-lg cursor-pointer border-none bg-transparent transition-colors ${
                      cat.isStarred
                        ? 'text-amber-400 hover:text-amber-300'
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                    title={cat.isStarred ? 'Bỏ gắn sao ưu tiên' : 'Gắn sao ưu tiên (Mục hay dùng)'}
                  >
                    <Star size={14} className={cat.isStarred ? 'fill-amber-400' : ''} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(cat)}
                    className="touch-btn p-1.5 text-slate-400 hover:text-white rounded bg-transparent border-none cursor-pointer"
                  >
                    <Edit2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. MODAL THÊM / SỬA HẠNG MỤC */}
      {isEditing && (
        <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-md flex flex-col justify-end items-center">
          <div className="w-full max-w-[480px] bg-slate-900 rounded-t-[28px] border-t border-white/10 p-5 pb-[max(20px,env(safe-area-inset-bottom,0px))] flex flex-col gap-4 animate-slide-up max-h-[90vh] overflow-y-auto">
            {/* Header Form */}
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <span className="text-base font-bold text-white">
                {editingCat ? 'Chỉnh sửa hạng mục' : 'Thêm hạng mục mới'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border-none cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
                {formError}
              </div>
            )}

            {/* Tên Hạng Mục */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Tên hạng mục *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ví dụ: Ăn trưa, Đổ xăng, Tiền thưởng..."
                className="input-ios w-full bg-slate-800 rounded-xl px-3.5 py-2.5 text-white border border-white/10"
              />
            </div>

            {/* Phân cấp: Hạng mục cha hay Hạng mục con */}
            {formType === 'EXPENSE' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Phân cấp danh mục
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormIsChild(true)}
                    className={`touch-btn p-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                      formIsChild
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                        : 'bg-slate-800 border-white/5 text-slate-400'
                    }`}
                  >
                    Hạng mục con
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormIsChild(false)}
                    className={`touch-btn p-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                      !formIsChild
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                        : 'bg-slate-800 border-white/5 text-slate-400'
                    }`}
                  >
                    Hạng mục cha
                  </button>
                </div>

                {/* Chọn Hạng mục cha trực thuộc */}
                {formIsChild && (
                  <div className="mt-1">
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Trực thuộc hạng mục cha:
                    </label>
                    <select
                      value={formParentId}
                      onChange={(e) => setFormParentId(e.target.value)}
                      className="input-ios w-full bg-slate-800 rounded-xl px-3 py-2 text-white border border-white/10"
                    >
                      {parentCategories.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Chọn Màu Sắc */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Màu sắc nhận diện
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormColor(color)}
                    className={`touch-btn w-7 h-7 rounded-full shrink-0 flex items-center justify-center cursor-pointer transition-transform ${
                      formColor === color ? 'ring-2 ring-white scale-110' : 'opacity-80'
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {formColor === color && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Chọn Biểu Tượng */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Biểu tượng ({filteredIcons.length}/{ICON_PRESETS.length})
                </label>
                <div className="flex items-center gap-1.5 text-[11px] text-sky-400 font-medium">
                  <span>Đang chọn:</span>
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: formColor }}
                  >
                    <CategoryIcon name={formIcon} size={13} color="#ffffff" />
                  </div>
                  <span className="font-bold">{formIcon}</span>
                </div>
              </div>

              {/* Ô tìm kiếm biểu tượng */}
              <div className="relative mb-2">
                <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={14} />
                </div>
                <input
                  type="text"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Tìm nhanh icon (vd: soup, car, beer, home...)"
                  className="input-ios w-full bg-slate-800/90 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white border border-white/10 placeholder:text-slate-500"
                />
                {iconSearch && (
                  <button
                    type="button"
                    onClick={() => setIconSearch('')}
                    className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-white cursor-pointer bg-transparent border-none p-1"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Lưới các biểu tượng */}
              <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1.5 bg-slate-800/50 rounded-xl border border-white/5">
                {filteredIcons.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setFormIcon(iconName)}
                    className={`touch-btn p-2 rounded-xl flex items-center justify-center cursor-pointer border transition-all ${
                      formIcon === iconName
                        ? 'bg-sky-500/20 border-sky-400 shadow-sm scale-105'
                        : 'bg-slate-800 border-white/5 text-slate-400 hover:text-white'
                    }`}
                    title={iconName}
                  >
                    <CategoryIcon
                      name={iconName}
                      size={20}
                      color={formIcon === iconName ? formColor : '#94A3B8'}
                    />
                  </button>
                ))}
                {filteredIcons.length === 0 && (
                  <div className="col-span-6 py-4 text-center text-xs text-slate-500">
                    Không tìm thấy biểu tượng phù hợp với "{iconSearch}"
                  </div>
                )}
              </div>
            </div>

            {/* Quick tags */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Gợi ý ghi chú nhanh (cách nhau bằng dấu phẩy)
              </label>
              <input
                type="text"
                value={formTagsStr}
                onChange={(e) => setFormTagsStr(e.target.value)}
                placeholder="Ví dụ: Ăn sáng, Cơm trưa, Cà phê"
                className="input-ios w-full bg-slate-800 rounded-xl px-3.5 py-2.5 text-white border border-white/10"
              />
            </div>

            {/* Toggle Gắn sao ưu tiên (Mục hay dùng) */}
            <div
              onClick={() => setFormIsStarred(!formIsStarred)}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-white/6 cursor-pointer hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  formIsStarred ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  <Star size={16} className={formIsStarred ? 'fill-amber-400' : ''} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Ưu tiên mục Hay dùng</span>
                    {formIsStarred && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold">
                        ⭐ Đã gắn sao
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Luôn hiển thị trên cùng trong 2 dòng gợi ý ngoài màn hình Ghi GD
                  </div>
                </div>
              </div>

              {/* iOS Style Switch */}
              <div className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ml-2 ${
                formIsStarred ? 'bg-amber-500' : 'bg-slate-700'
              }`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                  formIsStarred ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
            </div>

            {/* Nút Hành Động */}
            <div className="flex items-center gap-2 pt-2">
              {editingCat && (
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteCategory(editingCat);
                    setIsEditing(false);
                  }}
                  className="touch-btn py-3 px-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold text-xs cursor-pointer hover:bg-rose-500/25 flex items-center gap-1"
                >
                  <Trash2 size={16} />
                  <span>Xóa</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveCategory}
                className="touch-btn flex-1 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-bold text-sm cursor-pointer shadow-lg shadow-sky-500/25 border-none flex items-center justify-center gap-1.5"
              >
                <Check size={17} strokeWidth={2.8} />
                <span>{editingCat ? 'LƯU THAY ĐỔI' : 'TẠO HẠNG MỤC'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManagerScreen;
