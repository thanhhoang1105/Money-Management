// src/db/index.ts
import Dexie, { type Table } from 'dexie';
import type { Wallet, Category, Transaction, Budget, Setting } from '../types';

export class MoneyDatabase extends Dexie {
  wallets!: Table<Wallet, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('MoneyTrackerDB');
    this.version(1).stores({
      wallets: 'id, name, type, isExcludedFromTotal, createdAt',
      categories: 'id, name, type, isDefault, createdAt',
      transactions: 'id, walletId, toWalletId, categoryId, type, date, createdAt, [walletId+date]',
      budgets: 'id, categoryId, month, [categoryId+month]',
      settings: 'key'
    });
  }
}

export const db = new MoneyDatabase();
