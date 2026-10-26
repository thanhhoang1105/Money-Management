// src/components/ui/CategoryFilterSelect.tsx
import React, { useState, useMemo, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Layers,
  Flame,
  X
} from 'lucide-react';
import type { Category, Transaction } from '../../types';
import { CategoryIcon } from '../CategoryIcon';

export interface CategoryFilterSelectProps {
  value: string; // 'ALL' hoặc categoryId
  onChange: (value: string) => void;
  categories: Category[];
  allTransactions?: Transaction[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

interface ParentGroupData {
  id: string;
  name: string;
  type: 'EXPENSE' | 'INCOME' | 'DEBT';
  icon: string;
  color: string;
  isParentCategory: boolean; // true nếu là Category cha thực tế
  children: Category[];
  totalUsage: number;
}

export const CategoryFilterSelect: React.FC<CategoryFilterSelectProps> = ({
  value,
  onChange,
  categories,
  allTransactions = [],
  placeholder = 'Tất cả hạng mục',
  className = '',
  triggerClassName = ''
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(() => new Set());

  // 1. Thống kê số lần sử dụng của mỗi hạng mục trong toàn bộ lịch sử giao dịch
  const categoryUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of allTransactions) {
      if (tx.categoryId) {
        map[tx.categoryId] = (map[tx.categoryId] || 0) + 1;
      }
    }
    return map;
  }, [allTransactions]);

  const categoryMap = useMemo(() => {
    return new Map<string, Category>(categories.map((c) => [c.id, c]));
  }, [categories]);

  // Tự động mở thư mục cha chứa hạng mục đang được chọn
  useEffect(() => {
    if (value && value !== 'ALL') {
      const selectedCat = categoryMap.get(value);
      if (selectedCat?.parentId) {
        setExpandedParentIds((prev) => {
          const next = new Set(prev);
          next.add(selectedCat.parentId!);
          return next;
        });
      }
    }
  }, [value, categoryMap]);

  // 2. Gom nhóm theo Hạng mục Cha và sắp xếp con theo tần suất sử dụng (Nhiều nhất lên đầu)
  const { expenseGroups, incomeGroups, debtGroups } = useMemo(() => {
    // A. KHOẢN CHI (EXPENSE)
    const expenseParents = categories.filter((c) => c.type === 'EXPENSE' && !c.parentId);
    const parentIdSet = new Set(expenseParents.map((p) => p.id));

    const expGroups: ParentGroupData[] = expenseParents.map((parent) => {
      const children = categories
        .filter((c) => c.type === 'EXPENSE' && c.parentId === parent.id)
        .sort((a, b) => {
          const starA = a.isStarred ? 1 : 0;
          const starB = b.isStarred ? 1 : 0;
          if (starB !== starA) return starB - starA; // Luôn ưu tiên mục có dấu sao lên đầu

          const orderA = typeof a.order === 'number' ? a.order : 999999;
          const orderB = typeof b.order === 'number' ? b.order : 999999;
          if (orderA !== orderB) return orderA - orderB;

          const countA = categoryUsageMap[a.id] || 0;
          const countB = categoryUsageMap[b.id] || 0;
          if (countB !== countA) return countB - countA;

          return a.name.localeCompare(b.name, 'vi');
        });

      const totalUsage = children.reduce(
        (sum, c) => sum + (categoryUsageMap[c.id] || 0),
        categoryUsageMap[parent.id] || 0
      );

      return {
        id: parent.id,
        name: parent.name,
        type: 'EXPENSE',
        icon: parent.icon,
        color: parent.color,
        isParentCategory: true,
        children,
        totalUsage
      };
    });

    // Gom các mục chi không có cha (nếu có)
    const orphanExpenses = categories.filter(
      (c) => c.type === 'EXPENSE' && c.parentId && !parentIdSet.has(c.parentId)
    );
    if (orphanExpenses.length > 0) {
      orphanExpenses.sort(
        (a, b) => (categoryUsageMap[b.id] || 0) - (categoryUsageMap[a.id] || 0)
      );
      expGroups.push({
        id: 'cat_parent_expense_other',
        name: 'Khoản chi khác',
        type: 'EXPENSE',
        icon: 'Folder',
        color: '#94A3B8',
        isParentCategory: false,
        children: orphanExpenses,
        totalUsage: orphanExpenses.reduce(
          (sum, c) => sum + (categoryUsageMap[c.id] || 0),
          0
        )
      });
    }

    // B. KHOẢN THU (INCOME)
    const incomeParents = categories.filter((c) => c.type === 'INCOME' && !c.parentId);
    const incGroups: ParentGroupData[] = [];

    // Nhóm các mục thu có con (như Thu nhập Grab)
    incomeParents.forEach((parent) => {
      const children = categories
        .filter((c) => c.type === 'INCOME' && c.parentId === parent.id)
        .sort((a, b) => {
          const starA = a.isStarred ? 1 : 0;
          const starB = b.isStarred ? 1 : 0;
          if (starB !== starA) return starB - starA;
          const orderA = typeof a.order === 'number' ? a.order : 999999;
          const orderB = typeof b.order === 'number' ? b.order : 999999;
          if (orderA !== orderB) return orderA - orderB;
          const countA = categoryUsageMap[a.id] || 0;
          const countB = categoryUsageMap[b.id] || 0;
          if (countB !== countA) return countB - countA;
          return a.name.localeCompare(b.name, 'vi');
        });

      const totalUsage =
        (categoryUsageMap[parent.id] || 0) +
        children.reduce((sum, c) => sum + (categoryUsageMap[c.id] || 0), 0);

      incGroups.push({
        id: parent.id,
        name: parent.name,
        type: 'INCOME',
        icon: parent.icon,
        color: parent.color,
        isParentCategory: true,
        children,
        totalUsage
      });
    });

    // Sắp xếp các nhóm thu theo tần suất sử dụng
    incGroups.sort((a, b) => b.totalUsage - a.totalUsage);

    // C. VAY / NỢ (DEBT)
    const debtCats = categories
      .filter((c) => c.type === 'DEBT')
      .sort((a, b) => (categoryUsageMap[b.id] || 0) - (categoryUsageMap[a.id] || 0));

    const debtGroup: ParentGroupData[] = [
      {
        id: 'cat_parent_debt',
        name: 'Vay nợ & Thu nợ',
        type: 'DEBT',
        icon: 'HandCoins',
        color: '#F59E0B',
        isParentCategory: false,
        children: debtCats,
        totalUsage: debtCats.reduce(
          (sum, c) => sum + (categoryUsageMap[c.id] || 0),
          0
        )
      }
    ];

    return {
      expenseGroups: expGroups,
      incomeGroups: incGroups,
      debtGroups: debtGroup
    };
  }, [categories, categoryUsageMap]);

  // Toggle mở rộng / thu gọn con của 1 mục cha
  const toggleParentExpand = (parentId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const handleSelectOption = (catId: string) => {
    onChange(catId);
    setOpen(false);
  };

  const selectedCategory = useMemo(() => {
    if (!value || value === 'ALL') return null;
    const direct = categoryMap.get(value);
    if (direct) return direct;
    const allGroups = [...expenseGroups, ...incomeGroups, ...debtGroups];
    const groupMatch = allGroups.find((g) => g.id === value);
    if (groupMatch) {
      return {
        id: groupMatch.id,
        name: groupMatch.name,
        icon: groupMatch.icon,
        color: groupMatch.color,
        type: groupMatch.type,
        isDefault: true,
        createdAt: ''
      } as Category;
    }
    return null;
  }, [value, categoryMap, expenseGroups, incomeGroups, debtGroups]);

  // Lọc tìm kiếm nếu người dùng nhập ô tìm kiếm
  const q = searchQuery.trim().toLowerCase();

  const filterChildrenBySearch = (children: Category[]) => {
    if (!q) return children;
    return children.filter((c) => c.name.toLowerCase().includes(q));
  };

  const isParentMatchingSearch = (group: ParentGroupData) => {
    if (!q) return true;
    if (group.name.toLowerCase().includes(q)) return true;
    return group.children.some((c) => c.name.toLowerCase().includes(q));
  };

  // Render từng nhóm cha và các mục con
  const renderGroup = (group: ParentGroupData) => {
    if (!isParentMatchingSearch(group)) return null;

    const filteredChildren = filterChildrenBySearch(group.children);
    const isExpanded = expandedParentIds.has(group.id) || Boolean(q);
    const isParentSelected = value === group.id;

    // Chỉ hiển thị top 3 mục con hay dùng nhất khi chưa mở rộng
    const visibleChildren = isExpanded ? filteredChildren : filteredChildren.slice(0, 3);
    const hiddenCount = filteredChildren.length - visibleChildren.length;

    return (
      <div key={group.id} className="mb-2 last:mb-0">
        {/* HÀNG HẠNG MỤC CHA: Luôn đứng đầu tiên */}
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-xl bg-slate-800/80 border border-white/6 hover:bg-slate-800 transition-colors">
          <button
            type="button"
            onClick={() => handleSelectOption(group.id)}
            className="flex-1 flex items-center gap-2 text-left cursor-pointer truncate min-w-0 bg-transparent border-none p-0"
          >
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${group.color}25`, color: group.color }}
            >
              <CategoryIcon name={group.icon} size={13} color={group.color} />
            </div>
            <span className="text-xs font-bold text-slate-200 truncate">
              {group.name}
            </span>
            {group.children.length > 0 && (
              <span className="text-[10px] text-slate-400 font-semibold px-1.5 py-0.2 rounded-md bg-white/6 shrink-0">
                {group.children.length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {isParentSelected && (
              <Check size={14} className="text-sky-400 shrink-0 mr-1" />
            )}

            {/* Icon mũi tên để mở ra toàn bộ con của thư mục cha đó */}
            {group.children.length > 3 && (
              <button
                type="button"
                onClick={(e) => toggleParentExpand(group.id, e)}
                title={isExpanded ? 'Thu gọn bớt' : 'Mở toàn bộ con'}
                className="w-6 h-6 rounded-lg bg-slate-700/80 hover:bg-slate-700 hover:text-white text-slate-300 flex items-center justify-center cursor-pointer border-none transition-transform"
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
        </div>

        {/* CÁC HẠNG MỤC CON: Xếp theo tần suất sử dụng, có nút Xem thêm */}
        {filteredChildren.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-1 pl-4 border-l-2 border-white/8 ml-3">
            {visibleChildren.map((child) => {
              const isSelected = value === child.id;
              const usageCount = categoryUsageMap[child.id] || 0;
              const isTopUsed = usageCount >= 3;

              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => handleSelectOption(child.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left cursor-pointer transition-colors border-none ${
                    isSelected
                      ? 'bg-sky-500/20 text-sky-300 font-bold'
                      : 'hover:bg-white/6 text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <div
                      className="w-4.5 h-4.5 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${child.color}22`, color: child.color }}
                    >
                      <CategoryIcon name={child.icon} size={11} color={child.color} />
                    </div>
                    <span className="text-xs truncate">{child.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Badge số lần sử dụng cho mục hay dùng */}
                    {usageCount > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold flex items-center gap-0.5 ${
                          isTopUsed
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                            : 'bg-white/5 text-slate-400'
                        }`}
                        title={`Đã ghi ${usageCount} giao dịch`}
                      >
                        {isTopUsed && <Flame size={9} className="text-amber-400" />}
                        {usageCount} GD
                      </span>
                    )}
                    {isSelected && <Check size={13} className="text-sky-400" />}
                  </div>
                </button>
              );
            })}

            {/* Nút Xem thêm khi có con bị ẩn */}
            {!q && hiddenCount > 0 && (
              <button
                type="button"
                onClick={(e) => toggleParentExpand(group.id, e)}
                className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 bg-sky-500/8 hover:bg-sky-500/15 rounded-lg border border-sky-400/20 cursor-pointer transition-colors mt-0.5"
              >
                <span>Xem thêm {hiddenCount} mục nữa...</span>
                <ChevronDown size={12} />
              </button>
            )}

            {/* Nút Thu gọn khi đang mở toàn bộ */}
            {!q && isExpanded && filteredChildren.length > 3 && (
              <button
                type="button"
                onClick={(e) => toggleParentExpand(group.id, e)}
                className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-300 bg-white/4 hover:bg-white/8 rounded-lg cursor-pointer transition-colors mt-0.5"
              >
                <span>Thu gọn danh sách</span>
                <ChevronUp size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`relative ${className}`}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 hover:border-sky-400/50 text-xs text-slate-100 transition-all cursor-pointer outline-none focus:ring-2 focus:ring-sky-500/40 ${triggerClassName}`}
          >
            <div className="flex items-center gap-2 truncate min-w-0">
              {selectedCategory ? (
                <>
                  <div
                    className="w-4.5 h-4.5 rounded flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${selectedCategory.color}25`,
                      color: selectedCategory.color
                    }}
                  >
                    <CategoryIcon
                      name={selectedCategory.icon}
                      size={12}
                      color={selectedCategory.color}
                    />
                  </div>
                  <span className="truncate text-slate-100 font-semibold">
                    {selectedCategory.name}
                  </span>
                </>
              ) : (
                <span className="text-slate-200 font-medium">{placeholder}</span>
              )}
            </div>
            <ChevronDown
              size={15}
              className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                open ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[260px] max-w-[340px] max-h-[380px] overflow-y-auto rounded-2xl bg-slate-900/95 border border-white/12 shadow-2xl p-2 backdrop-blur-xl animate-fade-in divide-y divide-white/6"
          >
            {/* Thanh tìm kiếm nhanh */}
            <div className="pb-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm kiếm danh mục..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-7 py-1.5 text-xs rounded-xl bg-slate-800/90 border border-white/8 text-slate-100 placeholder-slate-500 outline-none focus:border-sky-400/50"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer bg-transparent border-none p-0"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* 1. Nút Chọn Tất Cả Hạng Mục */}
            <div className="py-1.5">
              <button
                type="button"
                onClick={() => handleSelectOption('ALL')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors border-none ${
                  value === 'ALL'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-200 hover:bg-white/8 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center text-slate-300">
                    <Layers size={13} />
                  </div>
                  <span>Tất cả hạng mục</span>
                </div>
                {value === 'ALL' && <Check size={15} className="text-sky-400" />}
              </button>
            </div>

            {/* 2. Danh Sách Nhóm Khoản Chi */}
            {expenseGroups.length > 0 && (
              <div className="py-2">
                <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-400/90 select-none flex items-center gap-1">
                  <span>Khoản Chi</span>
                  <span className="text-slate-500 font-normal">
                    (Mục hay dùng hiển thị trước)
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 mt-0.5">
                  {expenseGroups.map(renderGroup)}
                </div>
              </div>
            )}

            {/* 3. Danh Sách Nhóm Khoản Thu */}
            {incomeGroups.length > 0 && (
              <div className="py-2">
                <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-400/90 select-none">
                  Khoản Thu
                </div>
                <div className="flex flex-col gap-1.5 mt-0.5">
                  {incomeGroups.map(renderGroup)}
                </div>
              </div>
            )}

            {/* 4. Danh Sách Nhóm Vay / Nợ */}
            {debtGroups.length > 0 && (
              <div className="pt-2">
                <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-400/90 select-none">
                  Vay / Nợ
                </div>
                <div className="flex flex-col gap-1.5 mt-0.5">
                  {debtGroups.map(renderGroup)}
                </div>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
};
