// src/components/CategoryManagerScreen.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  PARENT_MUST_HAVE_ID,
  PARENT_NICE_TO_HAVE_ID,
  PARENT_WASTED_ID
} from '../db/seed';
import type { Category, CategoryType } from '../types';
import { CategoryIcon } from './CategoryIcon';
import { CustomSelect } from './ui/CustomSelect';
import { Toast } from './ui/Toast';
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
  HelpCircle,
  ArrowUpDown,
  GripVertical,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import {
  sortCategories,
  moveCategoryPosition,
  reorderCategories,
  toggleCategoryStar,
  COLOR_PRESETS,
  isLightColor
} from '../services/categoryService';

interface CategoryManagerScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategory?: (category: Category) => void;
  initialTab?: CategoryType;
}

const FIXED_EXPENSE_PARENT_IDS = new Set([
  PARENT_MUST_HAVE_ID,
  PARENT_NICE_TO_HAVE_ID,
  PARENT_WASTED_ID
]);

const ICON_PRESETS = [
  'Soup', 'UtensilsCrossed', 'Utensils', 'Coffee', 'Beer', 'Wine', 'Pizza', 'Apple', 'Fish', 'Carrot',
  'Fuel', 'Car', 'Bus', 'Plane', 'Bike', 'Train', 'Truck', 'Ticket',
  'Home', 'Building', 'Lightbulb', 'Droplets', 'Wifi', 'Wrench', 'Hammer', 'Bed', 'Bath',
  'HeartPulse', 'Stethoscope', 'Pill', 'Activity', 'ShieldCheck', 'Smile', 'Sparkles', 'Scissors',
  'GraduationCap', 'BookOpen', 'Briefcase', 'Laptop', 'Book', 'Award', 'PenTool', 'FileText',
  'ShoppingBag', 'ShoppingCart', 'Store', 'Shirt', 'Watch', 'Tag', 'Package', 'Gift',
  'Dumbbell', 'Trophy', 'Clapperboard', 'Film', 'Music', 'Headphones', 'Camera', 'Gamepad2', 'Dice5', 'Palette',
  'Wallet', 'Banknote', 'Coins', 'CreditCard', 'Landmark', 'PiggyBank', 'TrendingUp', 'TrendingDown', 'Receipt', 'HandCoins', 'CircleDollarSign', 'Vault',
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

  // Trạng thái màn hình phẳng: Thêm / Sửa hạng mục
  const [isEditing, setIsEditing] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Chế độ sắp xếp vị trí các hạng mục
  const [isReordering, setIsReordering] = useState(false);
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<CategoryType>(activeTab);
  const [formIsChild, setFormIsChild] = useState(true);
  const [formParentId, setFormParentId] = useState<string>('');
  const [formIcon, setFormIcon] = useState('Tag');
  const [formColor, setFormColor] = useState('#3B82F6');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [tagInputText, setTagInputText] = useState('');
  const [formIsStarred, setFormIsStarred] = useState(false);
  const [formError, setFormError] = useState('');
  const [iconSearch, setIconSearch] = useState('');

  const handleToggleStar = async (cat: Category, siblings?: Category[]) => {
    try {
      await toggleCategoryStar(cat, siblings);
    } catch (err) {
      console.error('Lỗi khi gắn sao danh mục:', err);
    }
  };

  const handleMovePosition = async (
    catId: string,
    direction: 'UP' | 'DOWN',
    siblingCategories: Category[]
  ) => {
    try {
      await moveCategoryPosition(catId, direction, siblingCategories);
    } catch (err) {
      console.error('Lỗi khi di chuyển vị trí hạng mục:', err);
    }
  };

  const handleDropCategory = async (
    sourceId: string,
    targetId: string,
    siblingCategories: Category[]
  ) => {
    const sorted = sortCategories(siblingCategories);
    const sourceIdx = sorted.findIndex((c) => c.id === sourceId);
    const targetIdx = sorted.findIndex((c) => c.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;

    const sourceCat = sorted[sourceIdx];
    const targetCat = sorted[targetIdx];

    const newSorted = [...sorted];
    newSorted.splice(sourceIdx, 1);
    newSorted.splice(targetIdx, 0, sourceCat);

    // Nếu kéo qua ranh giới giữa có sao và không có sao:
    // Đồng bộ trạng thái sao theo nhóm đích để luôn duy trì trật tự có sao ở trên!
    if (Boolean(sourceCat.isStarred) !== Boolean(targetCat.isStarred)) {
      await db.categories.update(sourceCat.id, {
        isStarred: Boolean(targetCat.isStarred),
        updatedAt: new Date().toISOString()
      });
      sourceCat.isStarred = Boolean(targetCat.isStarred);
    }

    await reorderCategories(newSorted.map((c) => c.id));
  };

  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return ICON_PRESETS;
    const q = iconSearch.trim().toLowerCase();
    return ICON_PRESETS.filter((icon) => icon.toLowerCase().includes(q));
  }, [iconSearch]);

  const tabCategories = useMemo(() => {
    return categories.filter((c) => c.type === activeTab && c.id !== 'system_adjustment');
  }, [categories, activeTab]);

  const parentCategories = useMemo(() => {
    const parents = tabCategories.filter((c) => !c.parentId);
    if (activeTab === 'EXPENSE') {
      const orderMap: Record<string, number> = {
        [PARENT_MUST_HAVE_ID]: 0,
        [PARENT_NICE_TO_HAVE_ID]: 1,
        [PARENT_WASTED_ID]: 2
      };
      return [...parents].sort((a, b) => {
        const oA = orderMap[a.id] ?? 99;
        const oB = orderMap[b.id] ?? 99;
        return oA - oB;
      });
    }
    return sortCategories(parents);
  }, [tabCategories, activeTab]);

  const childCategoriesByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    tabCategories.forEach((c) => {
      if (c.parentId) {
        const arr = map.get(c.parentId) || [];
        arr.push(c);
        map.set(c.parentId, arr);
      }
    });

    // Luôn ưu tiên mục có dấu sao lên đầu và sắp xếp theo order tùy chỉnh
    for (const [pId, list] of map.entries()) {
      map.set(pId, sortCategories(list));
    }

    return map;
  }, [tabCategories]);

  if (!isOpen) return null;

  const handleOpenAdd = (presetParentId?: string) => {
    if (activeTab === 'DEBT') return; // Vay nợ chỉ dùng 4 option mặc định, không thêm mới
    setEditingCat(null);
    setFormName('');
    setFormType(activeTab);

    if (activeTab === 'EXPENSE') {
      // Khoản Chi bắt buộc là mục con thuộc 1 trong 3 nhóm cha (Must have, Nice to have, Wasted)
      const targetParentId =
        presetParentId || parentCategories[0]?.id || PARENT_MUST_HAVE_ID;
      const targetParent = parentCategories.find((p) => p.id === targetParentId);
      setFormIsChild(true);
      setFormParentId(targetParentId);
      setFormColor(targetParent?.color || '#10B981');
    } else {
      // Khoản Thu có thể là mục cha hoặc mục con
      setFormIsChild(Boolean(presetParentId));
      setFormParentId(presetParentId || (parentCategories[0]?.id || ''));
      setFormColor('#10B981');
    }

    setFormIcon('Tag');
    setFormTags([]);
    setTagInputText('');
    setFormIsStarred(false);
    setFormError('');
    setIconSearch('');
    setIsEditing(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setEditingCat(cat);
    setFormName(cat.name);
    setFormType(cat.type);
    setFormIsChild(cat.type === 'EXPENSE' ? !FIXED_EXPENSE_PARENT_IDS.has(cat.id) : !!cat.parentId);
    setFormParentId(cat.parentId || (parentCategories[0]?.id || ''));
    setFormIcon(cat.icon || 'Tag');
    setFormColor(cat.color || '#3B82F6');
    setFormTags(cat.quickTags ? [...cat.quickTags] : []);
    setTagInputText('');
    setFormIsStarred(!!cat.isStarred);
    setFormError('');
    setIconSearch('');
    setIsEditing(true);
  };

  const handleSaveCategory = async () => {
    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError('Vui lòng nhập tên hạng mục');
      return;
    }

    const isFixedExpenseParent =
      editingCat && FIXED_EXPENSE_PARENT_IDS.has(editingCat.id);

    let resolvedParentId: string | undefined = undefined;
    if (formType === 'EXPENSE') {
      if (!isFixedExpenseParent) {
        resolvedParentId = formParentId || PARENT_MUST_HAVE_ID;
      }
    } else if (formType === 'INCOME') {
      resolvedParentId = formIsChild ? formParentId || undefined : undefined;
    } else {
      // DEBT không có quan hệ cha - con
      resolvedParentId = undefined;
    }

    const now = new Date().toISOString();
    const leftover = tagInputText.trim();
    const finalTags = [...formTags];
    if (leftover) {
      const parts = leftover
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) {
        if (!finalTags.includes(p)) {
          finalTags.push(p);
        }
      }
    }

    try {
      if (editingCat) {
        await db.categories.update(editingCat.id, {
          name: trimmed,
          type: formType,
          parentId: resolvedParentId,
          icon: formIcon,
          color: formColor,
          quickTags: finalTags,
          isStarred: formIsStarred,
          updatedAt: now
        });
      } else {
        const createdId = generateUUID();
        const createdCat: Category = {
          id: createdId,
          name: trimmed,
          type: formType,
          parentId: resolvedParentId,
          icon: formIcon,
          color: formColor,
          quickTags: finalTags,
          isDefault: false,
          isStarred: formIsStarred,
          createdAt: now
        };
        await db.categories.add(createdCat);
        if (onSelectCategory) {
          onSelectCategory(createdCat);
          setIsEditing(false);
          onClose();
          return;
        }
      }
      setIsEditing(false);
    } catch (err: any) {
      setFormError(err?.message || 'Có lỗi xảy ra khi lưu hạng mục');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (FIXED_EXPENSE_PARENT_IDS.has(cat.id) || cat.type === 'DEBT') {
      return;
    }

    const isParent = !cat.parentId;
    const childs = childCategoriesByParent.get(cat.id) || [];

    const confirmMsg =
      isParent && childs.length > 0
        ? `CẢNH BÁO: Hạng mục cha "${cat.name}" đang chứa ${childs.length} mục con. Bạn có chắc muốn xóa không?`
        : `Bạn có chắc chắn muốn xóa hạng mục "${cat.name}"?`;

    if (window.confirm(confirmMsg)) {
      try {
        await db.categories.delete(cat.id);
        if (isParent && childs.length > 0) {
          for (const ch of childs) {
            await db.categories.update(ch.id, { parentId: undefined });
          }
        }
      } catch (err: any) {
        alert('Lỗi xóa: ' + (err?.message || 'Thao tác thất bại'));
      }
    }
  };

  const handleItemClick = (cat: Category) => {
    // Khoản Chi bắt buộc phải chọn mục con (có parentId)
    if (cat.type === 'EXPENSE' && !cat.parentId) {
      return;
    }
    if (onSelectCategory) {
      onSelectCategory(cat);
      onClose();
    }
  };

  // ==========================================
  // MÀN HÌNH PHẲNG CON: THÊM HOẶC SỬA HẠNG MỤC
  // ==========================================
  if (isEditing) {
    const isFixedExpenseParent =
      editingCat && FIXED_EXPENSE_PARENT_IDS.has(editingCat.id);
    const expenseParents = categories.filter(
      (c) => c.type === 'EXPENSE' && !c.parentId && c.id !== 'system_adjustment'
    );
    const incomeParents = categories.filter(
      (c) => c.type === 'INCOME' && !c.parentId && c.id !== editingCat?.id
    );

    return (
      <div className="pb-28 px-4 pt-3 flex flex-col gap-4 animate-fade-in font-body text-slate-100">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-xs font-extrabold text-slate-100 uppercase tracking-wider text-center flex-1 truncate mx-2">
            {editingCat ? 'Chỉnh sửa hạng mục' : 'Thêm hạng mục mới'}
          </span>
          <div className="w-9" />
        </div>

        <div className="bg-slate-900/90 rounded-3xl border border-white/10 p-5 flex flex-col gap-4 shadow-xl">
          {formError && (
            <Toast
              message={formError}
              type="error"
              onClose={() => setFormError('')}
            />
          )}

          {/* Tên Hạng Mục */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Tên hạng mục *
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={
                formType === 'EXPENSE'
                  ? 'Ví dụ: Ăn sáng, Đổ xăng, Tiền nhà...'
                  : 'Ví dụ: Lương tháng 13, Thưởng dự án...'
              }
              className="input-ios w-full bg-slate-800 rounded-xl px-3.5 py-2.5 text-white border border-white/10"
              autoFocus
            />
          </div>

          {/* Chọn nhóm cha cho Khoản Chi (Bắt buộc thuộc 1 trong 3 nhóm: Must have, Nice to have, Wasted) */}
          {formType === 'EXPENSE' && !isFixedExpenseParent && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Thuộc nhóm Khoản Chi *
              </label>
              <CustomSelect
                value={formParentId}
                onChange={(nextId) => {
                  setFormParentId(nextId);
                  const foundP = expenseParents.find((p) => p.id === nextId);
                  if (foundP && !editingCat) {
                    setFormColor(foundP.color);
                  }
                }}
                options={expenseParents.map((p) => ({
                  value: p.id,
                  label: p.name
                }))}
                triggerClassName="bg-slate-800 text-xs font-bold"
              />
            </div>
          )}

          {/* Phân cấp cho Khoản Thu (Có thể là Mục cha độc lập hoặc Mục con thuộc 1 mục Thu khác) */}
          {formType === 'INCOME' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Phân cấp Khoản Thu
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormIsChild(false)}
                  className={`touch-btn p-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    !formIsChild
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-800 border-white/5 text-slate-400'
                  }`}
                >
                  Hạng mục chính (Cha)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormIsChild(true);
                    if (!formParentId && incomeParents[0]) {
                      setFormParentId(incomeParents[0].id);
                    }
                  }}
                  className={`touch-btn p-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    formIsChild
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-800 border-white/5 text-slate-400'
                  }`}
                >
                  Hạng mục con
                </button>
              </div>

              {formIsChild && incomeParents.length > 0 && (
                <div className="mt-1">
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Trực thuộc khoản thu:
                  </label>
                  <CustomSelect
                    value={formParentId}
                    onChange={setFormParentId}
                    options={incomeParents.map((p) => ({
                      value: p.id,
                      label: p.name
                    }))}
                    triggerClassName="bg-slate-800 text-xs font-bold"
                  />
                </div>
              )}
            </div>
          )}

          {/* Chọn Màu Sắc (24 Màu chọn lọc kỹ đầy đủ đậm/nhạt) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">
                Màu sắc nhận diện ({COLOR_PRESETS.length} màu)
              </label>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <span
                  className="w-3 h-3 rounded-full border border-white/20 inline-block shrink-0 shadow-sm"
                  style={{ backgroundColor: formColor }}
                />
                <span className="uppercase">{formColor}</span>
              </div>
            </div>

            <div className="grid grid-cols-8 gap-2 sm:gap-2.5 p-3 rounded-2xl bg-slate-800/60 border border-white/6">
              {COLOR_PRESETS.map((color) => {
                const isSelected = formColor.toLowerCase() === color.toLowerCase();
                const isLight = isLightColor(color);

                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormColor(color)}
                    className={`touch-btn w-8 h-8 rounded-full shrink-0 flex items-center justify-center cursor-pointer transition-all border border-black/15 dark:border-white/10 ${
                      isSelected
                        ? 'ring-2 ring-white scale-110 shadow-lg z-10'
                        : 'opacity-85 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  >
                    {isSelected && (
                      <Check
                        size={14}
                        strokeWidth={3}
                        className={isLight ? 'text-slate-950' : 'text-white'}
                      />
                    )}
                  </button>
                );
              })}
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

            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-52 overflow-y-auto p-1.5 bg-slate-800/50 rounded-xl border border-white/5">
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
            </div>
          </div>

          {/* Quick tags */}
          {!isFixedExpenseParent && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Gợi ý ghi chú nhanh (Tag)
              </label>

              {/* Danh sách các tag hiện tại kèm nút X để xóa */}
              {formTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5 p-2 rounded-xl bg-slate-800/60 border border-white/5 max-h-32 overflow-y-auto">
                  {formTags.map((tag, idx) => (
                    <span
                      key={`${tag}-${idx}`}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-slate-700/80 border border-white/10 text-xs text-slate-200 hover:border-rose-400/50 transition-colors"
                    >
                      <span className="font-medium select-none">{tag}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormTags((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/80 transition-all cursor-pointer"
                        title={`Xóa tag "${tag}"`}
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Ô nhập thêm tag mới */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tagInputText}
                  onChange={(e) => setTagInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      const trimmed = tagInputText.trim();
                      if (trimmed) {
                        const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
                        setFormTags((prev) => {
                          const next = [...prev];
                          for (const p of parts) {
                            if (!next.includes(p)) next.push(p);
                          }
                          return next;
                        });
                        setTagInputText('');
                      }
                    }
                  }}
                  placeholder="Nhập tag rồi nhấn Enter hoặc dấu phẩy..."
                  className="input-ios flex-1 bg-slate-800 rounded-xl px-3.5 py-2.5 text-white border border-white/10 placeholder:text-slate-500 text-sm focus:border-sky-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = tagInputText.trim();
                    if (trimmed) {
                      const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
                      setFormTags((prev) => {
                        const next = [...prev];
                        for (const p of parts) {
                          if (!next.includes(p)) next.push(p);
                        }
                        return next;
                      });
                      setTagInputText('');
                    }
                  }}
                  className="touch-btn h-10 px-3.5 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-300 hover:bg-sky-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0"
                >
                  <Plus size={14} /> Thêm
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Bấm vào dấu <span className="text-rose-400 font-bold">✕</span> trên từng tag để xóa nhanh.
              </p>
            </div>
          )}

          {/* Toggle Gắn sao ưu tiên */}
          {!isFixedExpenseParent && (
            <div
              onClick={() => setFormIsStarred(!formIsStarred)}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-white/6 cursor-pointer hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    formIsStarred ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  <Star size={16} className={formIsStarred ? 'fill-amber-400' : ''} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Ưu tiên mục Hay dùng</span>
                    {formIsStarred && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold">
                        Đã gắn sao
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Luôn hiển thị trên cùng ngoài màn hình Ghi giao dịch
                  </div>
                </div>
              </div>

              <div
                className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ml-2 ${
                  formIsStarred ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                    formIsStarred ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Nút Hành Động */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="touch-btn py-3 px-4 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs cursor-pointer border-none"
            >
              Hủy
            </button>

            {editingCat && !isFixedExpenseParent && editingCat.type !== 'DEBT' && (
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
    );
  }

  // ==========================================
  // MÀN HÌNH PHẲNG CHÍNH: DANH SÁCH HẠNG MỤC
  // ==========================================
  return (
    <div className="w-full flex flex-col min-h-full animate-fade-in font-body text-slate-100 pb-24">
      {/* 1. Header Bar phẳng cân đối */}
      <div className="px-4 py-3 bg-slate-900/95 border-b border-white/8 flex items-center justify-between gap-3 sticky top-0 z-20 backdrop-blur-md">
        <div className="w-9 shrink-0 flex items-center justify-start">
          <button
            type="button"
            onClick={onClose}
            className="touch-btn w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-center flex-1 truncate m-0">
          {onSelectCategory ? 'Chọn & Quản lý hạng mục' : 'Quản lý hạng mục'}
        </h2>

        <div className="shrink-0 flex items-center justify-end gap-1.5">
          {activeTab !== 'DEBT' ? (
            isReordering ? (
              <button
                type="button"
                onClick={() => setIsReordering(false)}
                className="touch-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black cursor-pointer shadow-md shadow-emerald-500/25 border-none"
              >
                <Check size={14} strokeWidth={3} />
                <span>Xong</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsReordering(true)}
                  className="touch-btn flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 text-xs font-bold cursor-pointer transition-colors"
                  title="Sắp xếp vị trí các hạng mục"
                >
                  <ArrowUpDown size={13} className="text-emerald-400" />
                  <span className="hidden sm:inline">Sắp xếp</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAdd()}
                  className="touch-btn flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer hover:bg-emerald-400 border-none shadow-md shadow-emerald-500/20"
                >
                  <Plus size={15} strokeWidth={2.5} />
                  <span>Thêm mới</span>
                </button>
              </>
            )
          ) : (
            <div className="w-9 h-9" />
          )}
        </div>
      </div>

      {/* 2. 3 TAB LỚN: KHOẢN CHI, KHOẢN THU, VAY NỢ */}
      <div className="px-4 pt-3 pb-2 bg-slate-900/60 border-b border-white/5">
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-800/80 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('EXPENSE')}
            className={`touch-btn h-10 px-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center justify-center transition-all cursor-pointer border-none ${
              activeTab === 'EXPENSE'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                : 'text-slate-400 hover:text-white bg-transparent'
            }`}
          >
            Khoản Chi
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('INCOME')}
            className={`touch-btn h-10 px-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center justify-center transition-all cursor-pointer border-none ${
              activeTab === 'INCOME'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                : 'text-slate-400 hover:text-white bg-transparent'
            }`}
          >
            Khoản Thu
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DEBT')}
            className={`touch-btn h-10 px-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center justify-center transition-all cursor-pointer border-none ${
              activeTab === 'DEBT'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/25'
                : 'text-slate-400 hover:text-white bg-transparent'
            }`}
          >
            Vay / Nợ
          </button>
        </div>
      </div>

      {/* 2.5. BANNER HƯỚNG DẪN KHI Ở CHẾ ĐỘ SẮP XẾP */}
      {isReordering && (
        <div className="mx-4 mt-3 mb-1 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-between gap-2 animate-fade-in shadow-lg">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-amber-400 fill-amber-400 shrink-0" />
            <span>
              Hạng mục có dấu sao ⭐ <strong>luôn được ưu tiên trên cùng</strong>. Bấm <strong className="text-white">↑</strong> / <strong className="text-white">↓</strong> hoặc kéo thả để đổi vị trí.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsReordering(false)}
            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-[11px] cursor-pointer border-none shrink-0 shadow-md shadow-emerald-500/20"
          >
            Xong
          </button>
        </div>
      )}

      {/* 3. DANH SÁCH HẠNG MỤC THEO TỪNG TAB */}
      <div className="px-4 py-3 space-y-4">
        <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/20 text-sky-300 text-xs flex items-center gap-2">
          <HelpCircle size={15} className="shrink-0" />
          <span>
            {activeTab === 'EXPENSE'
              ? 'Khoản Chi có 3 nhóm mặc định (Must have, Nice to have, Wasted). Hãy bấm "+ Thêm con" để tạo và chọn mục con bên dưới.'
              : activeTab === 'INCOME'
              ? 'Khoản Thu có thể chạm chọn trực tiếp mục chính hoặc bấm "+ Thêm con" để tạo mục con.'
              : 'Vay / Nợ gồm 4 loại giao dịch cố định (không phân nhánh cha - con).'}
          </span>
        </div>

        {/* ====================================================
            TAB 1: KHOẢN CHI (EXPENSE) - Bắt buộc chọn mục con
           ==================================================== */}
        {activeTab === 'EXPENSE' &&
          parentCategories.map((parent) => {
            const children = childCategoriesByParent.get(parent.id) || [];

            return (
              <div
                key={parent.id}
                className="rounded-2xl bg-slate-900 border border-white/8 overflow-hidden shadow-md"
              >
                {/* Header Nhóm cha (Không cho chọn trực tiếp làm giao dịch, chỉ dùng phân nhóm & thêm mục con) */}
                <div className="px-3.5 py-3 bg-slate-800/80 border-b border-white/6 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: parent.color }}
                    >
                      <CategoryIcon name={parent.icon || 'FolderTree'} size={15} color="#ffffff" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="truncate">{parent.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300 font-normal shrink-0">
                          {children.length} mục con
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {children.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setIsReordering(!isReordering)}
                        className={`touch-btn text-xs font-bold px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all ${
                          isReordering
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-700/60 border-white/10 text-slate-300 hover:text-white hover:bg-slate-700'
                        }`}
                        title={isReordering ? 'Hoàn tất sắp xếp' : 'Sắp xếp các mục con trong nhóm này'}
                      >
                        <ArrowUpDown size={12} className={isReordering ? 'text-emerald-400' : 'text-slate-400'} />
                        <span className="text-[11px]">{isReordering ? 'Xong' : 'Sắp xếp'}</span>
                      </button>
                    )}

                    {!isReordering && (
                      <button
                        type="button"
                        onClick={() => handleOpenAdd(parent.id)}
                        className="touch-btn text-xs font-bold text-sky-400 bg-sky-500/15 px-2.5 py-1.5 rounded-xl border border-sky-400/25 flex items-center gap-1 cursor-pointer hover:bg-sky-500/25"
                        title="Thêm hạng mục con vào nhóm này"
                      >
                        <Plus size={13} strokeWidth={2.5} />
                        <span>Thêm con</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Danh sách các Hạng mục con bên dưới */}
                {children.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => handleOpenAdd(parent.id)}
                    className="w-full p-4 text-center text-xs text-slate-400 hover:text-sky-300 bg-transparent border-none cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} className="text-sky-400" />
                    <span>Chưa có mục con nào. Bấm vào đây để thêm vào "{parent.name}"</span>
                  </button>
                ) : (
                  <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {children.map((child, index) => {
                      const isUpDisabled =
                        index === 0 ||
                        Boolean(child.isStarred) !== Boolean(children[index - 1]?.isStarred);
                      const isDownDisabled =
                        index === children.length - 1 ||
                        Boolean(child.isStarred) !== Boolean(children[index + 1]?.isStarred);

                      return (
                        <div
                          key={child.id}
                          draggable={isReordering}
                          onDragStart={(e) => {
                            if (!isReordering) return;
                            e.dataTransfer.setData('text/plain', child.id);
                            setDraggedCatId(child.id);
                          }}
                          onDragOver={(e) => {
                            if (!isReordering) return;
                            e.preventDefault();
                          }}
                          onDrop={async (e) => {
                            if (!isReordering) return;
                            e.preventDefault();
                            const sourceId = e.dataTransfer.getData('text/plain') || draggedCatId;
                            if (!sourceId || sourceId === child.id) return;
                            await handleDropCategory(sourceId, child.id, children);
                            setDraggedCatId(null);
                          }}
                          onDragEnd={() => setDraggedCatId(null)}
                          onClick={() => !isReordering && handleItemClick(child)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                            isReordering
                              ? draggedCatId === child.id
                                ? 'border-amber-400/60 bg-amber-500/10 scale-[0.98]'
                                : 'border-white/12 hover:border-amber-500/40 cursor-grab active:cursor-grabbing bg-slate-800/80'
                              : `bg-slate-800/50 border-white/5 ${
                                  onSelectCategory
                                    ? 'hover:border-sky-400 hover:bg-slate-800/80 active:scale-98 cursor-pointer'
                                    : 'cursor-default'
                                }`
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            {/* Số thứ tự & Tay nắm kéo khi ở chế độ sắp xếp */}
                            {isReordering && (
                              <div className="flex items-center gap-1 shrink-0">
                                <GripVertical size={14} className="text-slate-500 shrink-0" />
                                <span
                                  className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${
                                    child.isStarred
                                      ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
                                      : 'text-slate-300 bg-slate-700/60 border-white/8'
                                  }`}
                                >
                                  #{index + 1}
                                </span>
                              </div>
                            )}

                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                              style={{ backgroundColor: child.color }}
                            >
                              <CategoryIcon name={child.icon || 'Tag'} size={15} color="#ffffff" />
                            </div>

                            <div className="truncate text-left">
                              <div className="text-xs font-semibold text-slate-100 truncate flex items-center gap-1.5">
                                <span className="truncate">{child.name}</span>
                                {child.isStarred && (
                                  <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold flex items-center gap-0.5 shrink-0">
                                    <Star size={10} className="fill-amber-400 text-amber-400" />
                                    <span>Ưu tiên</span>
                                  </span>
                                )}
                              </div>
                              {child.quickTags && child.quickTags.length > 0 && (
                                <div className="text-[10px] text-slate-400 truncate">
                                  {child.quickTags[0]}
                                  {child.quickTags.length > 1 ? ` +${child.quickTags.length - 1}` : ''}
                                </div>
                              )}
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-0.5 shrink-0 ml-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isReordering ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleMovePosition(child.id, 'UP', children)}
                                  disabled={isUpDisabled}
                                  title={
                                    isUpDisabled
                                      ? !child.isStarred && index > 0
                                        ? 'Hạng mục có sao ⭐ luôn nằm trên cùng. Bấm ⭐ để đưa lên nhóm ưu tiên!'
                                        : 'Đã ở vị trí cao nhất trong nhóm'
                                      : 'Di chuyển lên'
                                  }
                                  className="touch-btn w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                                >
                                  <ChevronUp size={16} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void handleMovePosition(child.id, 'DOWN', children)}
                                  disabled={isDownDisabled}
                                  title={
                                    isDownDisabled
                                      ? child.isStarred && index < children.length - 1
                                        ? 'Hạng mục có sao ⭐ luôn ưu tiên trên các mục thường'
                                        : 'Đã ở vị trí thấp nhất trong nhóm'
                                      : 'Di chuyển xuống'
                                  }
                                  className="touch-btn w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                                >
                                  <ChevronDown size={16} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleStar(child, children)}
                                  className={`touch-btn p-1.5 rounded-lg cursor-pointer border-none bg-transparent transition-colors ${
                                    child.isStarred
                                      ? 'text-amber-400 hover:text-amber-300'
                                      : 'text-slate-600 hover:text-slate-400'
                                  }`}
                                  title={child.isStarred ? 'Bỏ gắn sao ưu tiên' : 'Gắn sao ưu tiên'}
                                >
                                  <Star size={15} className={child.isStarred ? 'fill-amber-400' : ''} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleStar(child, children)}
                                  className={`touch-btn p-1.5 rounded-lg cursor-pointer border-none bg-transparent transition-colors ${
                                    child.isStarred
                                      ? 'text-amber-400 hover:text-amber-300'
                                      : 'text-slate-600 hover:text-slate-400'
                                  }`}
                                  title={child.isStarred ? 'Bỏ gắn sao ưu tiên' : 'Gắn sao ưu tiên'}
                                >
                                  <Star size={14} className={child.isStarred ? 'fill-amber-400' : ''} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(child)}
                                  className="touch-btn p-1.5 text-slate-400 hover:text-sky-400 rounded bg-transparent border-none cursor-pointer"
                                  title="Sửa hạng mục"
                                >
                                  <Edit2 size={13} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(child)}
                                  className="touch-btn p-1.5 text-slate-500 hover:text-rose-400 rounded bg-transparent border-none cursor-pointer"
                                  title="Xóa hạng mục"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

        {/* ====================================================
            TAB 2: KHOẢN THU (INCOME) - Chọn được cả Cha & Con
           ==================================================== */}
        {activeTab === 'INCOME' && (
          <div className="space-y-2.5">
            {parentCategories.map((parent, pIndex) => {
              const children = childCategoriesByParent.get(parent.id) || [];
              const isPUpDisabled =
                pIndex === 0 ||
                Boolean(parent.isStarred) !== Boolean(parentCategories[pIndex - 1]?.isStarred);
              const isPDownDisabled =
                pIndex === parentCategories.length - 1 ||
                Boolean(parent.isStarred) !== Boolean(parentCategories[pIndex + 1]?.isStarred);

              return (
                <div
                  key={parent.id}
                  draggable={isReordering}
                  onDragStart={(e) => {
                    if (!isReordering) return;
                    e.dataTransfer.setData('text/plain', parent.id);
                    setDraggedCatId(parent.id);
                  }}
                  onDragOver={(e) => {
                    if (!isReordering) return;
                    e.preventDefault();
                  }}
                  onDrop={async (e) => {
                    if (!isReordering) return;
                    e.preventDefault();
                    const sourceId = e.dataTransfer.getData('text/plain') || draggedCatId;
                    if (!sourceId || sourceId === parent.id) return;
                    await handleDropCategory(sourceId, parent.id, parentCategories);
                    setDraggedCatId(null);
                  }}
                  onDragEnd={() => setDraggedCatId(null)}
                  className={`rounded-2xl bg-slate-900 border overflow-hidden shadow-md transition-all ${
                    isReordering
                      ? draggedCatId === parent.id
                        ? 'border-amber-400/60 bg-amber-500/10 scale-[0.98]'
                        : 'border-white/12 hover:border-amber-500/40 cursor-grab active:cursor-grabbing'
                      : 'border-white/8'
                  }`}
                >
                  {/* Hàng Hạng mục cha: Bấm vào chọn trực tiếp được luôn */}
                  <div
                    onClick={() => !isReordering && handleItemClick(parent)}
                    className={`px-3.5 py-3 flex items-center justify-between transition-all ${
                      !isReordering && onSelectCategory ? 'hover:bg-slate-800/90 active:scale-99 cursor-pointer' : ''
                    } ${children.length > 0 ? 'border-b border-white/6 bg-slate-800/60' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isReordering && (
                        <div className="flex items-center gap-1 shrink-0">
                          <GripVertical size={14} className="text-slate-500 shrink-0" />
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${
                              parent.isStarred
                                ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
                                : 'text-slate-300 bg-slate-700/60 border-white/8'
                            }`}
                          >
                            #{pIndex + 1}
                          </span>
                        </div>
                      )}

                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: parent.color }}
                      >
                        <CategoryIcon name={parent.icon || 'Banknote'} size={16} color="#ffffff" />
                      </div>
                      <div className="truncate text-left">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span className="truncate">{parent.name}</span>
                          {parent.isStarred && (
                            <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold flex items-center gap-0.5 shrink-0">
                              <Star size={10} className="fill-amber-400 text-amber-400" />
                              <span>Ưu tiên</span>
                            </span>
                          )}
                        </div>
                        {parent.quickTags && parent.quickTags.length > 0 && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {parent.quickTags.slice(0, 2).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-0.5 shrink-0 ml-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isReordering ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleMovePosition(parent.id, 'UP', parentCategories)}
                            disabled={isPUpDisabled}
                            title="Di chuyển lên"
                            className="touch-btn w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleMovePosition(parent.id, 'DOWN', parentCategories)}
                            disabled={isPDownDisabled}
                            title="Di chuyển xuống"
                            className="touch-btn w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <ChevronDown size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStar(parent, parentCategories)}
                            className={`touch-btn p-1.5 rounded-lg cursor-pointer border-none bg-transparent transition-colors ${
                              parent.isStarred
                                ? 'text-amber-400 hover:text-amber-300'
                                : 'text-slate-600 hover:text-slate-400'
                            }`}
                          >
                            <Star size={15} className={parent.isStarred ? 'fill-amber-400' : ''} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenAdd(parent.id)}
                            className="touch-btn text-[11px] font-semibold text-sky-400 bg-sky-500/10 px-2 py-1 rounded-lg border-none flex items-center gap-0.5 cursor-pointer hover:bg-sky-500/20 mr-1"
                            title="Thêm mục con"
                          >
                            <Plus size={12} />
                            <span>Thêm con</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleStar(parent, parentCategories)}
                            className={`touch-btn p-1.5 rounded-lg cursor-pointer border-none bg-transparent transition-colors ${
                              parent.isStarred
                                ? 'text-amber-400 hover:text-amber-300'
                                : 'text-slate-600 hover:text-slate-400'
                            }`}
                          >
                            <Star size={14} className={parent.isStarred ? 'fill-amber-400' : ''} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(parent)}
                            className="touch-btn p-1.5 text-slate-400 hover:text-sky-400 rounded bg-transparent border-none cursor-pointer"
                            title="Sửa hạng mục"
                          >
                            <Edit2 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(parent)}
                            className="touch-btn p-1.5 text-slate-500 hover:text-rose-400 rounded bg-transparent border-none cursor-pointer"
                            title="Xóa hạng mục"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Nếu Khoản Thu này có tạo thêm mục con thì hiển thị bên dưới để chọn */}
                  {children.length > 0 && (
                    <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/40">
                      {children.map((child, cIndex) => {
                        const isCUpDisabled =
                          cIndex === 0 ||
                          Boolean(child.isStarred) !== Boolean(children[cIndex - 1]?.isStarred);
                        const isCDownDisabled =
                          cIndex === children.length - 1 ||
                          Boolean(child.isStarred) !== Boolean(children[cIndex + 1]?.isStarred);

                        return (
                          <div
                            key={child.id}
                            draggable={isReordering}
                            onDragStart={(e) => {
                              if (!isReordering) return;
                              e.dataTransfer.setData('text/plain', child.id);
                              setDraggedCatId(child.id);
                            }}
                            onDragOver={(e) => {
                              if (!isReordering) return;
                              e.preventDefault();
                            }}
                            onDrop={async (e) => {
                              if (!isReordering) return;
                              e.preventDefault();
                              const sourceId = e.dataTransfer.getData('text/plain') || draggedCatId;
                              if (!sourceId || sourceId === child.id) return;
                              await handleDropCategory(sourceId, child.id, children);
                              setDraggedCatId(null);
                            }}
                            onDragEnd={() => setDraggedCatId(null)}
                            onClick={() => !isReordering && handleItemClick(child)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                              isReordering
                                ? draggedCatId === child.id
                                  ? 'border-amber-400/60 bg-amber-500/10 scale-[0.98]'
                                  : 'border-white/12 hover:border-amber-500/40 cursor-grab active:cursor-grabbing bg-slate-800/80'
                                : `bg-slate-800/50 border-white/5 ${
                                    onSelectCategory
                                      ? 'hover:border-emerald-400 hover:bg-slate-800/80 active:scale-98 cursor-pointer'
                                      : 'cursor-default'
                                  }`
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              {isReordering && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <GripVertical size={14} className="text-slate-500 shrink-0" />
                                  <span
                                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${
                                      child.isStarred
                                        ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
                                        : 'text-slate-300 bg-slate-700/60 border-white/8'
                                    }`}
                                  >
                                    #{cIndex + 1}
                                  </span>
                                </div>
                              )}

                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                                style={{ backgroundColor: child.color }}
                              >
                                <CategoryIcon name={child.icon || 'Tag'} size={14} color="#ffffff" />
                              </div>
                              <div className="truncate text-left">
                                <div className="text-xs font-semibold text-slate-100 truncate flex items-center gap-1.5">
                                  <span className="truncate">{child.name}</span>
                                  {child.isStarred && (
                                    <Star size={10} className="fill-amber-400 text-amber-400 shrink-0" />
                                  )}
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex items-center gap-0.5 shrink-0 ml-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isReordering ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleMovePosition(child.id, 'UP', children)}
                                    disabled={isCUpDisabled}
                                    title="Di chuyển lên"
                                    className="touch-btn w-7 h-7 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <ChevronUp size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleMovePosition(child.id, 'DOWN', children)}
                                    disabled={isCDownDisabled}
                                    title="Di chuyển xuống"
                                    className="touch-btn w-7 h-7 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStar(child, children)}
                                    className={`touch-btn p-1.5 rounded-lg cursor-pointer border-none bg-transparent ${
                                      child.isStarred ? 'text-amber-400' : 'text-slate-600'
                                    }`}
                                  >
                                    <Star size={13} className={child.isStarred ? 'fill-amber-400' : ''} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStar(child, children)}
                                    className={`touch-btn p-1.5 rounded-lg cursor-pointer border-none bg-transparent ${
                                      child.isStarred ? 'text-amber-400' : 'text-slate-600'
                                    }`}
                                  >
                                    <Star size={13} className={child.isStarred ? 'fill-amber-400' : ''} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(child)}
                                    className="touch-btn p-1.5 text-slate-400 hover:text-sky-400 rounded bg-transparent border-none cursor-pointer"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCategory(child)}
                                    className="touch-btn p-1.5 text-slate-500 hover:text-rose-400 rounded bg-transparent border-none cursor-pointer"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ====================================================
            TAB 3: VAY / NỢ (DEBT) - 4 Option mặc định phẳng
           ==================================================== */}
        {activeTab === 'DEBT' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {tabCategories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => handleItemClick(cat)}
                className="p-3.5 rounded-2xl bg-slate-900 border border-white/8 flex items-center justify-between cursor-pointer hover:border-amber-400/50 transition-all"
              >
                <div className="flex items-center gap-3 truncate">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    <CategoryIcon name={cat.icon || 'HandCoins'} size={18} color="#ffffff" />
                  </div>
                  <div className="truncate text-left">
                    <div className="text-sm font-bold text-white truncate">{cat.name}</div>
                    {cat.quickTags && cat.quickTags.length > 0 && (
                      <div className="text-[11px] text-slate-400 truncate">
                        {cat.quickTags.slice(0, 3).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(cat)}
                    className="touch-btn p-1.5 text-slate-400 hover:text-sky-400 rounded bg-transparent border-none cursor-pointer"
                    title="Sửa gợi ý ghi chú / màu sắc"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryManagerScreen;
