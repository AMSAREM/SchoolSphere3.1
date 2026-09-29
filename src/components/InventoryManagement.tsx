import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type InventoryItem, type SchoolExpense } from '../db/schema';
import { inventoryApi, type StockMovementRecord } from '../lib/api';
import {
  Plus,
  Trash2,
  Package,
  AlertTriangle,
  DollarSign,
  Layers,
  Search,
  Printer,
  Edit2,
  X,
  PlusCircle,
  MinusCircle,
  TrendingUp,
  MapPin,
  PhoneCall,
  Sparkles,
  RefreshCw,
  TrendingDown,
  CreditCard,
  CheckCircle,
  Database,
  Cloud,
  Copy,
  Check,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  SlidersHorizontal,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, triggerPrint } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';

export default function InventoryManagement() {
  const { user: authUser, school } = useAuth();
  const { showToast, confirm: confirmModal } = useNotifications();
  const settings = useLiveQuery(() => db.settings.toArray()) || [];
  const schoolName =
    school?.name ||
    settings.find((s) => s.key === 'schoolProfile')?.value?.schoolName ||
    'ESEPA INTERNATIONAL SCHOOL';

  // Navigation / Tabs State
  const [activeTab, setActiveTab] = useState<'registry' | 'movements' | 'expenses'>('registry');

  // ---------- SUPABASE CLOUD SYNC STATE ----------
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [activeSchoolId, setActiveSchoolId] = useState<string>('');
  const [tableStatus, setTableStatus] = useState<
    Record<string, { exists: boolean; status: string; count?: number; error?: string }>
  >({});
  const [inventorySql, setInventorySql] = useState<string>('');
  const [showSchemaDrawer, setShowSchemaDrawer] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [stockMovements, setStockMovements] = useState<StockMovementRecord[]>([]);

  // ---------- TAB 1: STOCK REGISTRY STATE ----------
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState<number | null>(null);
  const [isSubmittingStock, setIsSubmittingStock] = useState(false);

  // Form Fields for Stock Item
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<
    'Stationery' | 'Textbooks' | 'Uniforms' | 'Furniture' | 'Sports Gear' | 'Lab Equipment' | 'General'
  >('General');
  const [quantity, setQuantity] = useState(0);
  const [minQuantity, setMinQuantity] = useState(10);
  const [unitPrice, setUnitPrice] = useState(0);
  const [location, setLocation] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');

  // Custom Stock Adjustment / Issuance Modal State
  const [adjustTargetItem, setAdjustTargetItem] = useState<InventoryItem | null>(null);
  const [adjustMode, setAdjustMode] = useState<'ISSUE' | 'RESTOCK' | 'ADJUSTMENT'>('ISSUE');
  const [adjustAmount, setAdjustAmount] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustPerformedBy, setAdjustPerformedBy] = useState<string>('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  // ---------- TAB 2: STOCK MOVEMENTS LEDGER STATE ----------
  const [movementSearch, setMovementSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('All');
  const [movementItemFilter, setMovementItemFilter] = useState<string>('All');

  // ---------- TAB 3: EXPENSES STATE ----------
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('All');
  const [expensePaymentFilter, setExpensePaymentFilter] = useState<string>('All');
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Form Fields for Expense
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<
    'Inventory Restock' | 'Utilities' | 'Maintenance' | 'Salaries' | 'Administrative' | 'Events' | 'Other'
  >('Administrative');
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [selectedItemIdForRestock, setSelectedItemIdForRestock] = useState<number | null>(null);
  const [restockQuantity, setRestockQuantity] = useState(1);
  const [restockUnitPrice, setRestockUnitPrice] = useState(0);
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<
    'Cash' | 'Bank Transfer' | 'Mobile Money' | 'Cheque'
  >('Mobile Money');
  const [expenseRecordedBy, setExpenseRecordedBy] = useState('');

  // Live Local IndexedDB Queries (automatically reconciled with Supabase)
  const inventoryList = useLiveQuery(() => db.inventory.toArray()) || [];
  const expensesList = useLiveQuery(() => db.expenses.toArray()) || [];

  // Load & Synchronize Inventory Registry from Supabase
  const loadInventoryFromSupabase = useCallback(
    async (options?: { forceTwoWaySync?: boolean; silent?: boolean }) => {
      setIsSyncing(true);
      try {
        const targetSchoolId = school?.id || authUser?.schoolId || undefined;
        let data: any;
        if (options?.forceTwoWaySync) {
          data = await inventoryApi.syncState(undefined, targetSchoolId);
        } else {
          data = await inventoryApi.getState(targetSchoolId);
        }

        if (data) {
          setCloudConnected(true);
          setLastSyncedAt(data.syncedAt || Date.now());
          if (data.schoolId) setActiveSchoolId(String(data.schoolId));
          if (data.tableStatus) setTableStatus(data.tableStatus);
          if (data.inventorySql) setInventorySql(data.inventorySql);
          if (Array.isArray(data.movements)) {
            setStockMovements(data.movements);
          }
          if (!options?.silent) {
            showToast('Synchronized Inventory Registry, Stock Movements & Expenses with Supabase', 'success');
          }
        }
      } catch (err: any) {
        setCloudConnected(false);
        if (!options?.silent) {
          showToast(err?.message || 'Unable to reach Supabase Inventory Registry; using local cache.', 'error');
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [school?.id, authUser?.schoolId, showToast]
  );

  useEffect(() => {
    loadInventoryFromSupabase({ silent: true });
  }, [loadInventoryFromSupabase]);

  // Set default recorder when expense modal opens
  useEffect(() => {
    if (isExpenseFormOpen && authUser?.fullName) {
      setExpenseRecordedBy(authUser.fullName);
    }
  }, [isExpenseFormOpen, authUser]);

  // Select first stock item for restock dropdown when selection changes
  useEffect(() => {
    if (expenseCategory === 'Inventory Restock' && inventoryList.length > 0 && !selectedItemIdForRestock) {
      const firstItem = inventoryList[0];
      setSelectedItemIdForRestock(firstItem.id || null);
      setRestockUnitPrice(firstItem.unitPrice);
    }
  }, [expenseCategory, inventoryList, selectedItemIdForRestock]);

  // Auto-update restock unit price when selected item changes
  const handleItemRestockChange = (itemId: number) => {
    setSelectedItemIdForRestock(itemId);
    const item = inventoryList.find((i) => i.id === itemId);
    if (item) {
      setRestockUnitPrice(item.unitPrice);
    }
  };

  // Filter & Search Logic: Stock
  const filteredItems = useMemo(() => {
    const query = (searchQuery || '').toLowerCase().trim();
    return inventoryList.filter((item) => {
      if (!item) return false;
      const name = (item.itemName || '').toLowerCase();
      const loc = (item.location || '').toLowerCase();
      const sup = (item.supplierName || '').toLowerCase();
      const matchesSearch = !query || name.includes(query) || loc.includes(query) || sup.includes(query);
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesLowStock = !showLowStockOnly || item.quantity <= item.minQuantity;
      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [inventoryList, searchQuery, selectedCategory, showLowStockOnly]);

  // Filter & Search Logic: Stock Movements
  const filteredMovements = useMemo(() => {
    const query = (movementSearch || '').toLowerCase().trim();
    return stockMovements.filter((mov) => {
      if (!mov) return false;
      const matchesType = movementTypeFilter === 'All' || mov.movementType === movementTypeFilter;
      const matchesItem =
        movementItemFilter === 'All' || String(mov.inventoryItemId) === String(movementItemFilter);
      const matchesSearch =
        !query ||
        (mov.itemName || '').toLowerCase().includes(query) ||
        (mov.reason || '').toLowerCase().includes(query) ||
        (mov.performedBy || '').toLowerCase().includes(query) ||
        (mov.category || '').toLowerCase().includes(query);
      return matchesType && matchesItem && matchesSearch;
    });
  }, [stockMovements, movementSearch, movementTypeFilter, movementItemFilter]);

  // Filter & Search Logic: Expenses
  const filteredExpenses = useMemo(() => {
    const query = (expenseSearch || '').toLowerCase().trim();
    return expensesList
      .filter((exp) => {
        if (!exp) return false;
        const desc = (exp.description || '').toLowerCase();
        const rec = (exp.recordedBy || '').toLowerCase();
        const matchesSearch = !query || desc.includes(query) || rec.includes(query);
        const matchesCategory = expenseCategoryFilter === 'All' || exp.category === expenseCategoryFilter;
        const matchesPayment = expensePaymentFilter === 'All' || exp.paymentMethod === expensePaymentFilter;
        return matchesSearch && matchesCategory && matchesPayment;
      })
      .sort((a, b) => (b.date || 0) - (a.date || 0));
  }, [expensesList, expenseSearch, expenseCategoryFilter, expensePaymentFilter]);

  // Aggregate Metrics: Stock Registry
  const stockMetrics = useMemo(() => {
    let totalItems = 0;
    let totalAssetValue = 0;
    let lowStockCount = 0;

    inventoryList.forEach((item) => {
      totalItems += item.quantity;
      totalAssetValue += item.quantity * item.unitPrice;
      if (item.quantity <= item.minQuantity) {
        lowStockCount++;
      }
    });

    return {
      totalUniqueItems: inventoryList.length,
      totalItems,
      totalAssetValue,
      lowStockCount
    };
  }, [inventoryList]);

  // Aggregate Metrics: Stock Movements
  const movementMetrics = useMemo(() => {
    let totalAdded = 0;
    let totalIssued = 0;
    let restockCount = 0;
    let issueCount = 0;

    stockMovements.forEach((m) => {
      if (m.change > 0) {
        totalAdded += m.change;
        restockCount++;
      } else if (m.change < 0) {
        totalIssued += Math.abs(m.change);
        issueCount++;
      }
    });

    return {
      totalLogs: stockMovements.length,
      totalAdded,
      totalIssued,
      restockCount,
      issueCount
    };
  }, [stockMovements]);

  // Aggregate Metrics: Expenses
  const expenseMetrics = useMemo(() => {
    let totalSpent = 0;
    let restockSpent = 0;
    let overheadSpent = 0;
    const methodCounts: Record<string, number> = {};

    expensesList.forEach((exp) => {
      totalSpent += exp.amount;
      if (exp.category === 'Inventory Restock') {
        restockSpent += exp.amount;
      } else {
        overheadSpent += exp.amount;
      }
      methodCounts[exp.paymentMethod] = (methodCounts[exp.paymentMethod] || 0) + 1;
    });

    let topPaymentMethod = 'N/A';
    let maxCount = 0;
    Object.entries(methodCounts).forEach(([method, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topPaymentMethod = method;
      }
    });

    return {
      totalSpent,
      restockSpent,
      overheadSpent,
      topPaymentMethod
    };
  }, [expensesList]);

  // Form Reset: Stock
  const resetForm = () => {
    setItemName('');
    setCategory('General');
    setQuantity(0);
    setMinQuantity(10);
    setUnitPrice(0);
    setLocation('');
    setSupplierName('');
    setSupplierPhone('');
    setIsEditing(null);
  };

  // Form Reset: Expense
  const resetExpenseForm = () => {
    setExpenseDescription('');
    setExpenseCategory('Administrative');
    setExpenseAmount(0);
    setSelectedItemIdForRestock(inventoryList[0]?.id || null);
    setRestockQuantity(1);
    setRestockUnitPrice(inventoryList[0]?.unitPrice || 0);
    setExpensePaymentMethod('Mobile Money');
  };

  // Submit Handler: Stock Item (Connected to Supabase public.inventory_items + public.stock_movements)
  const handleSubmitStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || quantity < 0 || unitPrice < 0) return;

    setIsSubmittingStock(true);
    try {
      const data = await inventoryApi.saveItem({
        id: isEditing,
        itemName: itemName.trim(),
        category,
        quantity,
        minQuantity,
        unitPrice,
        location: location.trim() || 'General Storehouse',
        supplierName: supplierName.trim() || undefined,
        supplierPhone: supplierPhone.trim() || undefined,
        performedBy: authUser?.fullName || authUser?.username || 'Storekeeper',
        reason:
          isEditing !== null
            ? `Commodity profile updated (${itemName.trim()})`
            : `Initial registration of ${itemName.trim()} in Supabase inventory_items`
      });

      if (data?.tableStatus) setTableStatus(data.tableStatus);
      if (Array.isArray(data?.movements)) setStockMovements(data.movements);
      setLastSyncedAt(data?.syncedAt || Date.now());
      setCloudConnected(true);

      showToast(
        isEditing !== null
          ? 'Stock commodity updated in Supabase inventory_items'
          : 'New stock commodity published to Supabase inventory_items',
        'success'
      );
      resetForm();
      setIsFormOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Failed to save stock commodity in Supabase', 'error');
    } finally {
      setIsSubmittingStock(false);
    }
  };

  // Submit Handler: Expense / Stock Purchase (Connected to Supabase public.school_expenses + public.inventory_items + public.stock_movements)
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    if (expenseCategory === 'Inventory Restock') {
      if (!selectedItemIdForRestock || restockQuantity <= 0 || restockUnitPrice < 0) {
        showToast('Please fill out all stock purchase fields correctly.', 'error');
        return;
      }
      const targetItem = inventoryList.find((i) => i.id === selectedItemIdForRestock);
      if (!targetItem) {
        showToast('Selected inventory item not found.', 'error');
        return;
      }

      const totalCost = restockQuantity * restockUnitPrice;
      const desc = `Restocked ${restockQuantity}x ${targetItem.itemName}`;

      setIsSubmittingExpense(true);
      try {
        const data = await inventoryApi.createExpense({
          description: desc,
          category: 'Inventory Restock',
          amount: totalCost,
          date: Date.now(),
          inventoryItemId: selectedItemIdForRestock,
          quantityPurchased: restockQuantity,
          unitPrice: restockUnitPrice,
          paymentMethod: expensePaymentMethod,
          recordedBy: expenseRecordedBy.trim() || authUser?.fullName || 'Accountant'
        });

        if (data?.tableStatus) setTableStatus(data.tableStatus);
        if (Array.isArray(data?.movements)) setStockMovements(data.movements);
        setLastSyncedAt(data?.syncedAt || Date.now());
        setCloudConnected(true);

        showToast(
          `Restocked +${restockQuantity} units of ${targetItem.itemName} & logged expense in Supabase`,
          'success'
        );
        resetExpenseForm();
        setIsExpenseFormOpen(false);
      } catch (err: any) {
        showToast(err?.message || 'Failed to record restock purchase in Supabase', 'error');
      } finally {
        setIsSubmittingExpense(false);
      }
    } else {
      if (!expenseDescription.trim() || expenseAmount <= 0) {
        showToast('Please specify an expense description and standard amount spent.', 'error');
        return;
      }

      setIsSubmittingExpense(true);
      try {
        const data = await inventoryApi.createExpense({
          description: expenseDescription.trim(),
          category: expenseCategory,
          amount: expenseAmount,
          date: Date.now(),
          paymentMethod: expensePaymentMethod,
          recordedBy: expenseRecordedBy.trim() || authUser?.fullName || 'Accountant'
        });

        if (data?.tableStatus) setTableStatus(data.tableStatus);
        if (Array.isArray(data?.movements)) setStockMovements(data.movements);
        setLastSyncedAt(data?.syncedAt || Date.now());
        setCloudConnected(true);

        showToast('Expense recorded in Supabase school_expenses', 'success');
        resetExpenseForm();
        setIsExpenseFormOpen(false);
      } catch (err: any) {
        showToast(err?.message || 'Failed to record expense in Supabase', 'error');
      } finally {
        setIsSubmittingExpense(false);
      }
    }
  };

  // Edit Trigger: Stock
  const handleEditStock = (item: InventoryItem) => {
    setIsEditing(item.id || null);
    setItemName(item.itemName);
    setCategory(item.category);
    setQuantity(item.quantity);
    setMinQuantity(item.minQuantity);
    setUnitPrice(item.unitPrice);
    setLocation(item.location);
    setSupplierName(item.supplierName || '');
    setSupplierPhone(item.supplierPhone || '');
    setIsFormOpen(true);
  };

  // Open Custom Stock Issuance / Adjustment Modal
  const openCustomAdjustmentModal = (
    item: InventoryItem,
    defaultMode: 'ISSUE' | 'RESTOCK' | 'ADJUSTMENT' = 'ISSUE'
  ) => {
    setAdjustTargetItem(item);
    setAdjustMode(defaultMode);
    setAdjustAmount(1);
    setAdjustReason('');
    setAdjustPerformedBy(authUser?.fullName || authUser?.username || 'Storekeeper');
  };

  // Submit Custom Stock Issuance / Restock / Adjustment
  const handleCustomAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTargetItem?.id) return;
    if (adjustAmount <= 0) {
      showToast('Please enter a valid quantity greater than zero.', 'error');
      return;
    }

    const delta =
      adjustMode === 'ISSUE'
        ? -Math.abs(adjustAmount)
        : adjustMode === 'RESTOCK'
        ? Math.abs(adjustAmount)
        : adjustAmount;

    setIsSubmittingAdjust(true);
    try {
      const data = await inventoryApi.adjustQuantity({
        id: adjustTargetItem.id,
        delta,
        movementType: adjustMode,
        reason:
          adjustReason.trim() ||
          (adjustMode === 'ISSUE'
            ? `Issued ${adjustAmount} unit(s) of ${adjustTargetItem.itemName} to department/classroom`
            : adjustMode === 'RESTOCK'
            ? `Added ${adjustAmount} unit(s) of ${adjustTargetItem.itemName} to storehouse`
            : `Stock audit adjustment for ${adjustTargetItem.itemName}`),
        performedBy: adjustPerformedBy.trim() || authUser?.fullName || 'Storekeeper'
      });

      if (data?.tableStatus) setTableStatus(data.tableStatus);
      if (Array.isArray(data?.movements)) setStockMovements(data.movements);
      setLastSyncedAt(data?.syncedAt || Date.now());
      setCloudConnected(true);

      showToast(
        `${adjustTargetItem.itemName}: ${delta > 0 ? `+${delta}` : delta} units logged in Supabase stock_movements`,
        'success'
      );
      setAdjustTargetItem(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to adjust commodity stock in Supabase', 'error');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Delete Action: Stock
  const handleDeleteStock = async (id: number) => {
    confirmModal({
      title: 'Delete Inventory Commodity',
      message:
        'Are you sure you want to delete this commodity from Supabase inventory_items? Linked stock movements will also be removed.',
      confirmLabel: 'Delete Item',
      onConfirm: async () => {
        try {
          const data = await inventoryApi.deleteItem(id);
          if (data?.tableStatus) setTableStatus(data.tableStatus);
          if (Array.isArray(data?.movements)) setStockMovements(data.movements);
          setLastSyncedAt(data?.syncedAt || Date.now());
          showToast('Commodity removed from Supabase inventory_items', 'success');
        } catch (err: any) {
          showToast(err?.message || 'Failed to delete inventory item from Supabase', 'error');
        }
      }
    });
  };

  // Delete Action: Expense (with automatic quantity rollback in Supabase)
  const handleDeleteExpense = async (id: number) => {
    const expense = expensesList.find((e) => e.id === id);
    if (!expense) return;

    let confirmMsg = 'Are you sure you want to delete this expense record permanently from Supabase?';
    if (expense.category === 'Inventory Restock' && expense.inventoryItemId) {
      confirmMsg = `This is a Stock Purchase expense of GHS ${expense.amount.toFixed(2)} for ${expense.quantityPurchased} units. Deleting it will also roll back the stock addition in Supabase inventory_items and log a reversal in stock_movements.`;
    }

    confirmModal({
      title: 'Delete Expense Record',
      message: confirmMsg,
      confirmLabel: 'Delete Expense',
      onConfirm: async () => {
        try {
          const data = await inventoryApi.deleteExpense(id);
          if (data?.tableStatus) setTableStatus(data.tableStatus);
          if (Array.isArray(data?.movements)) setStockMovements(data.movements);
          setLastSyncedAt(data?.syncedAt || Date.now());
          showToast('Expense record deleted from Supabase school_expenses', 'success');
        } catch (err: any) {
          showToast(err?.message || 'Failed to delete expense record from Supabase', 'error');
        }
      }
    });
  };

  // Quick Quantity Update (+1 / -1) in Stock registry directly
  const handleAdjustQuantity = async (id: number, currentQty: number, adjustment: number) => {
    if (currentQty + adjustment < 0) return;
    try {
      const targetItem = inventoryList.find((i) => i.id === id);
      const data = await inventoryApi.adjustQuantity({
        id,
        delta: adjustment,
        movementType: adjustment > 0 ? 'RESTOCK' : 'ISSUE',
        reason:
          adjustment > 0
            ? `Quick increment (+${adjustment}) for ${targetItem?.itemName || 'commodity'}`
            : `Quick issuance (${adjustment}) for ${targetItem?.itemName || 'commodity'}`,
        performedBy: authUser?.fullName || authUser?.username || 'Storekeeper'
      });

      if (data?.tableStatus) setTableStatus(data.tableStatus);
      if (Array.isArray(data?.movements)) setStockMovements(data.movements);
      setLastSyncedAt(data?.syncedAt || Date.now());
      setCloudConnected(true);
    } catch (err: any) {
      showToast(err?.message || 'Failed to adjust stock quantity in Supabase', 'error');
    }
  };

  // Export Stock Movements CSV
  const handleExportMovementsCsv = () => {
    if (filteredMovements.length === 0) {
      showToast('No stock movements to export.', 'error');
      return;
    }
    const headers = [
      'Movement ID',
      'Date & Time',
      'Commodity Name',
      'Category',
      'Movement Type',
      'Quantity Change',
      'Previous Qty',
      'New Qty',
      'Reason / Department',
      'Performed By'
    ];
    const rows = filteredMovements.map((m) => [
      m.id || '',
      new Date(m.createdAt).toLocaleString(),
      `"${String(m.itemName || '').replace(/"/g, '""')}"`,
      `"${String(m.category || 'General').replace(/"/g, '""')}"`,
      m.movementType,
      m.change > 0 ? `+${m.change}` : String(m.change),
      m.previousQuantity !== undefined ? String(m.previousQuantity) : '',
      m.newQuantity !== undefined ? String(m.newQuantity) : '',
      `"${String(m.reason || '').replace(/"/g, '""')}"`,
      `"${String(m.performedBy || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stock_movements_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopySql = () => {
    if (!inventorySql) return;
    navigator.clipboard.writeText(inventorySql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  // Selected item's details for rendering inside the purchase form preview
  const selectedRestockItemPreview = useMemo(() => {
    if (!selectedItemIdForRestock) return null;
    return inventoryList.find((i) => i.id === selectedItemIdForRestock);
  }, [selectedItemIdForRestock, inventoryList]);

  return (
    <div className="space-y-6">
      {/* Print-Only Header */}
      <div className="only-print">
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center">
          {schoolName}
        </h1>
        <div className="mt-2 text-sm font-bold text-slate-600 uppercase tracking-widest flex items-center justify-center gap-4">
          <span>
            {activeTab === 'registry'
              ? 'Official Assets & Resource Inventory Registry'
              : activeTab === 'movements'
              ? 'Official Stock Movements & Issuance Ledger (stock_movements)'
              : 'Official School Expenses & Purchases Ledger'}
          </span>
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
          <span>Date: {new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* ==================== SUPABASE CLOUD STATUS & TABLE INSPECTOR HERO ==================== */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-lg print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border',
                  cloudConnected
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                )}
              >
                <Cloud className="w-3.5 h-3.5" />
                {cloudConnected
                  ? 'Supabase Connected • inventory_items + stock_movements + school_expenses'
                  : 'Local IndexedDB Fallback Mode'}
              </span>
              {activeSchoolId && (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px] border border-slate-700">
                  Tenant: {activeSchoolId.slice(0, 8)}...
                </span>
              )}
              {lastSyncedAt && (
                <span className="text-[10px] text-slate-400 font-semibold">
                  Synced {new Date(lastSyncedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">
              Assets, Inventory Registry & Expense Terminal
            </h2>
            <p className="text-xs text-slate-400 font-medium max-w-2xl">
              Live two-way cloud synchronization with your Supabase PostgreSQL tables (
              <code className="text-indigo-300 font-mono">public.inventory_items</code>,{' '}
              <code className="text-emerald-300 font-mono">public.stock_movements</code>, and{' '}
              <code className="text-rose-300 font-mono">public.school_expenses</code>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => loadInventoryFromSupabase({ forceTwoWaySync: true })}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
              {isSyncing ? 'Syncing...' : 'Sync Cloud'}
            </button>

            <button
              onClick={() => setShowSchemaDrawer(!showSchemaDrawer)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-xl border transition-all cursor-pointer',
                showSchemaDrawer
                  ? 'bg-slate-800 text-white border-indigo-500/50'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border-slate-700'
              )}
            >
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              Supabase Tables
            </button>
          </div>
        </div>

        {/* Collapsible Supabase Table Health & SQL Schema Drawer */}
        <AnimatePresence>
          {showSchemaDrawer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-5 pt-5 border-t border-slate-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      key: 'inventory_items',
                      label: 'public.inventory_items',
                      desc: 'Stock commodities & quantities'
                    },
                    {
                      key: 'stock_movements',
                      label: 'public.stock_movements',
                      desc: 'Restock, issuance & adjustment ledger'
                    },
                    {
                      key: 'school_expenses',
                      label: 'public.school_expenses',
                      desc: 'Overheads & restock purchases'
                    },
                    {
                      key: 'school_settings',
                      label: 'public.school_settings',
                      desc: 'JSONB stream backup mirror'
                    }
                  ].map((tbl) => {
                    const info = tableStatus[tbl.key];
                    const isReady = info?.exists && info?.status === 'ready';
                    return (
                      <div
                        key={tbl.key}
                        className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-start justify-between gap-2"
                      >
                        <div>
                          <div className="font-mono text-xs font-bold text-white">{tbl.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{tbl.desc}</div>
                          <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                            {isReady ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Ready ({info.count ?? 0} rows)
                              </span>
                            ) : (
                              <span className="text-amber-400">
                                {info?.error || 'Checking table...'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {inventorySql && (
                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Supabase PostgreSQL Schema Definition (DDL & RLS)
                      </span>
                      <button
                        onClick={handleCopySql}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        {copiedSql ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            Copied SQL
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy SQL Schema
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-[10px] font-mono text-slate-300 overflow-x-auto max-h-40 leading-relaxed">
                      {inventorySql}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
          <button
            onClick={() => setActiveTab('registry')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer',
              activeTab === 'registry'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <Package className="w-3.5 h-3.5" />
            Stock Commodities ({inventoryList.length})
          </button>

          <button
            onClick={() => setActiveTab('movements')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer',
              activeTab === 'movements'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <History className="w-3.5 h-3.5" />
            Stock Movements ({stockMovements.length})
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer',
              activeTab === 'expenses'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Expenses & Restocks ({expensesList.length})
          </button>
        </div>

        {/* Contextual Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'registry' && (
            <>
              <button
                onClick={() => triggerPrint()}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Stock Registry
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setIsFormOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Stock Item
              </button>
            </>
          )}

          {activeTab === 'movements' && (
            <>
              <button
                onClick={handleExportMovementsCsv}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                onClick={() => triggerPrint()}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Movement Ledger
              </button>
            </>
          )}

          {activeTab === 'expenses' && (
            <>
              <button
                onClick={() => triggerPrint()}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Expense Report
              </button>
              <button
                onClick={() => {
                  resetExpenseForm();
                  setIsExpenseFormOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Log Expense / Purchase
              </button>
            </>
          )}
        </div>
      </div>

      {/* ==================== TAB 1: STOCK REGISTRY VIEW ==================== */}
      {activeTab === 'registry' && (
        <>
          {/* Metrics Cards Grid - Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Unique Commodities
                </p>
                <h3 className="text-lg font-black text-slate-950 mt-0.5">
                  {stockMetrics.totalUniqueItems} Products
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  {stockMetrics.totalItems} Units total stored
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Estimated Stock Worth
                </p>
                <h3 className="text-lg font-black text-slate-950 mt-0.5">
                  GHS{' '}
                  {stockMetrics.totalAssetValue.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </h3>
                <p className="text-[9px] text-emerald-600 font-bold mt-0.5 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  <span>Full assets valuation</span>
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  stockMetrics.lowStockCount > 0
                    ? 'bg-rose-50 border border-rose-100 text-rose-600 animate-pulse'
                    : 'bg-slate-50 border border-slate-100 text-slate-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Reorder Alerts
                </p>
                <h3
                  className={`text-lg font-black mt-0.5 ${
                    stockMetrics.lowStockCount > 0 ? 'text-rose-600' : 'text-slate-950'
                  }`}
                >
                  {stockMetrics.lowStockCount} Commodities
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  Items falling below minimum threshold
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Stock Movements Logged
                </p>
                <h3 className="text-lg font-black text-slate-950 mt-0.5">
                  {stockMovements.length} Entries
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  Tracked in Supabase stock_movements
                </p>
              </div>
            </div>
          </div>

          {/* Control Filters Toolbar - Stock */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search assets by name, location room, or supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-slate-400">Classify:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Categories</option>
                  <option value="Stationery">Stationery</option>
                  <option value="Textbooks">Textbooks</option>
                  <option value="Uniforms">Uniforms</option>
                  <option value="Furniture">Furniture</option>
                  <option value="Sports Gear">Sports Gear</option>
                  <option value="Lab Equipment">Lab Equipment</option>
                  <option value="General">General</option>
                </select>
              </div>

              <button
                onClick={() => setShowLowStockOnly(!showLowStockOnly)}
                className={cn(
                  'px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-xl border transition-all cursor-pointer flex items-center gap-1.5',
                  showLowStockOnly
                    ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-inner'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                <AlertTriangle
                  className={cn('w-3.5 h-3.5', showLowStockOnly ? 'text-rose-500' : 'text-slate-400')}
                />
                Low Stock Alerts
              </button>
            </div>
          </div>

          {/* Main Stock Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Item Details</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4 text-center">In Stock</th>
                    <th className="px-6 py-4 text-right">Unit Price</th>
                    <th className="px-6 py-4 text-right">Asset Valuation</th>
                    <th className="px-6 py-4">Room/Location</th>
                    <th className="px-6 py-4 print:hidden">Supplier Contact</th>
                    <th className="px-6 py-4 text-right print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item) => {
                      const isLow = item.quantity <= item.minQuantity;
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            'hover:bg-slate-50/50 transition-colors',
                            isLow && 'bg-rose-50/10 hover:bg-rose-50/20'
                          )}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                                  isLow
                                    ? 'bg-rose-50 border-rose-100 text-rose-500'
                                    : 'bg-indigo-50 border-indigo-100 text-indigo-600'
                                )}
                              >
                                <Package className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-extrabold text-slate-900 uppercase tracking-tight leading-snug">
                                  {item.itemName}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-[9px] font-semibold text-slate-400">
                                  <span>Alert Threshold: {item.minQuantity} units</span>
                                  <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                  <span>Updated: {new Date(item.lastUpdated).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider',
                                item.category === 'Textbooks'
                                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-100/30'
                                  : item.category === 'Stationery'
                                  ? 'bg-amber-50 text-amber-600 border border-amber-100/30'
                                  : item.category === 'Uniforms'
                                  ? 'bg-teal-50 text-teal-600 border border-teal-100/30'
                                  : item.category === 'Furniture'
                                  ? 'bg-blue-50 text-blue-600 border border-blue-100/30'
                                  : item.category === 'Sports Gear'
                                  ? 'bg-orange-50 text-orange-600 border border-orange-100/30'
                                  : item.category === 'Lab Equipment'
                                  ? 'bg-purple-50 text-purple-600 border border-purple-100/30'
                                  : 'bg-slate-50 text-slate-600 border border-slate-100/30'
                              )}
                            >
                              {item.category}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={cn(
                                  'px-2.5 py-1 rounded-full text-xs font-black min-w-[50px] text-center shadow-sm',
                                  isLow
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-slate-100 text-slate-800 border border-slate-200'
                                )}
                              >
                                {item.quantity}
                              </span>

                              {/* Quick adjustments in table */}
                              <div className="flex items-center gap-1.5 mt-1.5 print:hidden">
                                <button
                                  onClick={() => handleAdjustQuantity(item.id!, item.quantity, -1)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-0.5 hover:bg-slate-100 rounded cursor-pointer"
                                  title="Quick Issue (-1 unit)"
                                >
                                  <MinusCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleAdjustQuantity(item.id!, item.quantity, 1)}
                                  className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 hover:bg-slate-100 rounded cursor-pointer"
                                  title="Quick Restock (+1 unit)"
                                >
                                  <PlusCircle className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-right font-bold text-slate-700 font-mono">
                            GHS {item.unitPrice.toFixed(2)}
                          </td>

                          <td className="px-6 py-4 text-right font-extrabold text-slate-900 font-mono">
                            GHS {(item.quantity * item.unitPrice).toFixed(2)}
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="uppercase tracking-tight truncate max-w-[150px]">
                                {item.location}
                              </span>
                            </div>
                          </td>

                          <td className="px-6 py-4 print:hidden">
                            {item.supplierName ? (
                              <div className="space-y-0.5">
                                <div className="font-extrabold text-slate-700 leading-none text-[10px]">
                                  {item.supplierName}
                                </div>
                                {item.supplierPhone && (
                                  <div className="flex items-center gap-0.5 text-[9px] text-slate-400 font-semibold font-mono mt-0.5">
                                    <PhoneCall className="w-2.5 h-2.5 text-slate-300" />
                                    <span>{item.supplierPhone}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-300 italic">No supplier info</span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-right print:hidden">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openCustomAdjustmentModal(item, 'ISSUE')}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                                title="Issue or Restock Stock with Reason Note"
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                                Issue / Adjust
                              </button>
                              <button
                                onClick={() => handleEditStock(item)}
                                className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-all cursor-pointer border border-transparent hover:border-slate-200"
                                title="Edit Item"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteStock(item.id!)}
                                className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-all cursor-pointer border border-transparent hover:border-rose-100"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400 bg-white">
                        <Package className="w-12 h-12 text-slate-100 mx-auto mb-3 animate-bounce" />
                        <p className="font-bold">No inventory matches found</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Adjust search parameters or insert a new stock commodity
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== TAB 2: STOCK MOVEMENTS LEDGER VIEW (public.stock_movements) ==================== */}
      {activeTab === 'movements' && (
        <>
          {/* Metrics Cards Grid - Stock Movements */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Total Logged Movements
                </p>
                <h3 className="text-lg font-black text-slate-950 mt-0.5">
                  {movementMetrics.totalLogs} Records
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  Synced with public.stock_movements
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Units Restocked (+IN)
                </p>
                <h3 className="text-lg font-black text-emerald-700 mt-0.5">
                  +{movementMetrics.totalAdded} Units
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  Across {movementMetrics.restockCount} restock / initial entries
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <ArrowDownRight className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Units Issued (-OUT)
                </p>
                <h3 className="text-lg font-black text-rose-700 mt-0.5">
                  -{movementMetrics.totalIssued} Units
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  Across {movementMetrics.issueCount} departmental issuances
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                <History className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Latest Stock Activity
                </p>
                <h3 className="text-sm font-black text-slate-950 mt-0.5 truncate max-w-[170px]">
                  {stockMovements[0]?.itemName || 'No recent activity'}
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  {stockMovements[0]
                    ? new Date(stockMovements[0].createdAt).toLocaleString()
                    : 'Ready to log movements'}
                </p>
              </div>
            </div>
          </div>

          {/* Control Filters Toolbar - Stock Movements */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search commodity name, reason/department, or officer..."
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-slate-400">Movement Type:</span>
                <select
                  value={movementTypeFilter}
                  onChange={(e) => setMovementTypeFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Types</option>
                  <option value="RESTOCK">Restock (+IN)</option>
                  <option value="ISSUE">Issuance (-OUT)</option>
                  <option value="ADJUSTMENT">Audit Adjustment</option>
                  <option value="INITIAL">Initial Baseline</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-slate-400">Commodity:</span>
                <select
                  value={movementItemFilter}
                  onChange={(e) => setMovementItemFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 max-w-[210px]"
                >
                  <option value="All">All Commodities</option>
                  {inventoryList.map((it) => (
                    <option key={it.id} value={String(it.id)}>
                      {it.itemName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Main Stock Movements Ledger Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Date & Time</th>
                    <th className="px-6 py-4">Commodity</th>
                    <th className="px-6 py-4">Movement Type</th>
                    <th className="px-6 py-4 text-center">Qty Change</th>
                    <th className="px-6 py-4 text-center">Stock Balance</th>
                    <th className="px-6 py-4">Reason / Department</th>
                    <th className="px-6 py-4">Performed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredMovements.length > 0 ? (
                    filteredMovements.map((mov, idx) => {
                      const isPositive = mov.change > 0;
                      return (
                        <tr
                          key={mov.id || `${mov.inventoryItemId}-${mov.createdAt}-${idx}`}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4 font-mono text-[11px] text-slate-600 font-semibold whitespace-nowrap">
                            <div>{new Date(mov.createdAt).toLocaleDateString()}</div>
                            <div className="text-[9px] text-slate-400">
                              {new Date(mov.createdAt).toLocaleTimeString()}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="font-extrabold text-slate-900 uppercase tracking-tight">
                              {mov.itemName}
                            </div>
                            <div className="text-[10px] text-slate-400 font-semibold">
                              {mov.category || 'General'} • ID #{mov.inventoryItemId}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                'px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 border',
                                mov.movementType === 'RESTOCK'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : mov.movementType === 'ISSUE'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : mov.movementType === 'INITIAL'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              )}
                            >
                              {isPositive ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3" />
                              )}
                              {mov.movementType}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center font-mono font-black">
                            <span
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs',
                                isPositive
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : mov.change < 0
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                              )}
                            >
                              {isPositive ? `+${mov.change}` : mov.change}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center font-mono text-xs text-slate-600 font-bold">
                            {mov.previousQuantity !== undefined && mov.newQuantity !== undefined ? (
                              <span>
                                {mov.previousQuantity} →{' '}
                                <strong className="text-slate-900">{mov.newQuantity}</strong>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-slate-700 font-semibold max-w-xs">
                            {mov.reason}
                          </td>

                          <td className="px-6 py-4 font-bold text-slate-700">{mov.performedBy}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 bg-white">
                        <History className="w-12 h-12 text-slate-100 mx-auto mb-3" />
                        <p className="font-bold">No stock movement records found</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Adjust stock quantities or log restock purchases to populate Supabase stock_movements
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== TAB 3: EXPENSES LEDGER VIEW ==================== */}
      {activeTab === 'expenses' && (
        <>
          {/* Metrics Cards Grid - Expenses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Total Expenses Spent
                </p>
                <h3 className="text-lg font-black text-rose-700 mt-0.5">
                  GHS{' '}
                  {expenseMetrics.totalSpent.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  Sum of all overheads & purchases
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Stock Purchase Costs
                </p>
                <h3 className="text-lg font-black text-indigo-700 mt-0.5">
                  GHS{' '}
                  {expenseMetrics.restockSpent.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </h3>
                <p className="text-[9px] text-indigo-600 font-bold mt-0.5 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  <span>Linked to Inventory registry</span>
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  General Overheads
                </p>
                <h3 className="text-lg font-black text-slate-950 mt-0.5">
                  GHS{' '}
                  {expenseMetrics.overheadSpent.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  Utilities, Maintenance, Salaries, etc.
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Common Payment Mode
                </p>
                <h3 className="text-lg font-black text-slate-950 mt-0.5">
                  {expenseMetrics.topPaymentMethod}
                </h3>
                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                  Most recurrent medium used
                </p>
              </div>
            </div>
          </div>

          {/* Control Filters Toolbar - Expenses */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search expense description, or recorder name..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-slate-400">Category:</span>
                <select
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Categories</option>
                  <option value="Inventory Restock">Inventory Restock</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Salaries">Salaries</option>
                  <option value="Administrative">Administrative</option>
                  <option value="Events">Events</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-slate-400">Payment:</span>
                <select
                  value={expensePaymentFilter}
                  onChange={(e) => setExpensePaymentFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Methods</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>
          </div>

          {/* Main Expense Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Expense Description / Commodity</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4 text-right">Amount Paid</th>
                    <th className="px-6 py-4">Transaction Date</th>
                    <th className="px-6 py-4">Payment Method</th>
                    <th className="px-6 py-4">Recorded By</th>
                    <th className="px-6 py-4 text-right print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredExpenses.length > 0 ? (
                    filteredExpenses.map((exp) => {
                      const isRestock = exp.category === 'Inventory Restock';
                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                                  isRestock
                                    ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                                    : 'bg-rose-50 border-rose-100 text-rose-500'
                                )}
                              >
                                {isRestock ? (
                                  <Package className="w-4 h-4" />
                                ) : (
                                  <DollarSign className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <div className="font-extrabold text-slate-900 uppercase tracking-tight leading-snug">
                                  {exp.description}
                                </div>
                                {isRestock && exp.inventoryItemId && (
                                  <div className="flex items-center gap-1.5 mt-1 text-[9px] font-bold text-indigo-600">
                                    <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100/50 rounded uppercase tracking-wider">
                                      Synced with inventory_items #{exp.inventoryItemId}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider',
                                exp.category === 'Inventory Restock'
                                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-100/30'
                                  : exp.category === 'Utilities'
                                  ? 'bg-cyan-50 text-cyan-600 border border-cyan-100/30'
                                  : exp.category === 'Maintenance'
                                  ? 'bg-amber-50 text-amber-600 border border-amber-100/30'
                                  : exp.category === 'Salaries'
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/30'
                                  : exp.category === 'Administrative'
                                  ? 'bg-purple-50 text-purple-600 border border-purple-100/30'
                                  : exp.category === 'Events'
                                  ? 'bg-orange-50 text-orange-600 border border-orange-100/30'
                                  : 'bg-slate-50 text-slate-600 border border-slate-100/30'
                              )}
                            >
                              {exp.category}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-right font-extrabold text-rose-600 font-mono">
                            GHS {exp.amount.toFixed(2)}
                          </td>

                          <td className="px-6 py-4 text-slate-600 font-semibold font-mono">
                            {new Date(exp.date).toLocaleDateString()}
                          </td>

                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold uppercase border border-slate-200">
                              {exp.paymentMethod}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-slate-700 font-bold">{exp.recordedBy}</td>

                          <td className="px-6 py-4 text-right print:hidden">
                            <button
                              onClick={() => handleDeleteExpense(exp.id!)}
                              className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-all cursor-pointer border border-transparent hover:border-rose-100"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 bg-white">
                        <DollarSign className="w-12 h-12 text-slate-100 mx-auto mb-3 animate-bounce" />
                        <p className="font-bold">No expenses matched your selection</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Specify different filters or record a new administrative payout above
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== MODAL: CUSTOM STOCK ISSUANCE / ADJUSTMENT ==================== */}
      <AnimatePresence>
        {adjustTargetItem && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                      Record Stock Movement
                    </h3>
                    <p className="text-[10px] text-slate-500 font-semibold truncate max-w-[240px]">
                      {adjustTargetItem.itemName} (Current Stock: {adjustTargetItem.quantity})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAdjustTargetItem(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer border border-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCustomAdjustmentSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ISSUE', label: 'Issue (-OUT)', color: 'rose' },
                    { id: 'RESTOCK', label: 'Restock (+IN)', color: 'emerald' },
                    { id: 'ADJUSTMENT', label: 'Audit Delta', color: 'amber' }
                  ].map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setAdjustMode(m.id as any)}
                      className={cn(
                        'py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer',
                        adjustMode === m.id
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      {adjustMode === 'ISSUE'
                        ? 'Quantity to Issue'
                        : adjustMode === 'RESTOCK'
                        ? 'Quantity to Add'
                        : 'Quantity Delta'}
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={adjustMode === 'ISSUE' ? Math.max(1, adjustTargetItem.quantity) : undefined}
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 1)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Resulting Stock Balance
                    </label>
                    <div className="w-full px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-900 font-mono">
                      {adjustTargetItem.quantity} →{' '}
                      {Math.max(
                        0,
                        adjustTargetItem.quantity +
                          (adjustMode === 'ISSUE' ? -Math.abs(adjustAmount) : Math.abs(adjustAmount))
                      )}{' '}
                      units
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Reason / Receiving Department or Classroom
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      adjustMode === 'ISSUE'
                        ? 'e.g. Issued to JHS 2 Form Master for Term 2 classes'
                        : 'e.g. Delivered from central supplier storehouse'
                    }
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Authorized Officer / Storekeeper
                  </label>
                  <input
                    type="text"
                    required
                    value={adjustPerformedBy}
                    onChange={(e) => setAdjustPerformedBy(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                >
                  {isSubmittingAdjust
                    ? 'Recording in Supabase...'
                    : 'Commit Stock Movement to Supabase'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== FORM DIALOG: CREATE/EDIT STOCK ITEM ==================== */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">
                      {isEditing !== null ? 'Modify Stock Commodity' : 'Create New Stock Commodity'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-semibold">
                      Synced directly to Supabase public.inventory_items
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer border border-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitStock} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Item Name / Asset Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Standard Exercise Book (A4 - Pack of 100)"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    >
                      <option value="Stationery">Stationery</option>
                      <option value="Textbooks">Textbooks</option>
                      <option value="Uniforms">Uniforms</option>
                      <option value="Furniture">Furniture</option>
                      <option value="Sports Gear">Sports Gear</option>
                      <option value="Lab Equipment">Lab Equipment</option>
                      <option value="General">General</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Storage Room / Shelf
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Storage Hall B"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Quantity
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Min. Alert Limit
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={minQuantity}
                      onChange={(e) => setMinQuantity(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Unit Cost (GHS)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min={0}
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 font-mono"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3.5 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Golden Books Ghana"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Supplier Mobile
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. +233 24 000 0000"
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingStock}
                  className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  {isSubmittingStock
                    ? 'Saving to Supabase...'
                    : isEditing !== null
                    ? 'Apply Stock Changes'
                    : 'Publish Stock Commodity'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== FORM DIALOG: LOG EXPENSE / STOCK PURCHASE ==================== */}
      <AnimatePresence>
        {isExpenseFormOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">
                      Log School Payout Expense
                    </h3>
                    <p className="text-[10px] text-slate-400 font-semibold">
                      Synced with Supabase public.school_expenses & public.stock_movements
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsExpenseFormOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer border border-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitExpense} className="p-6 space-y-4">
                {/* Category Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Expense Category
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  >
                    <option value="Administrative">Administrative Overheads</option>
                    <option value="Inventory Restock">Inventory Restock (Linked to Stock Registry)</option>
                    <option value="Utilities">Utilities (Electricity, Water, Internet)</option>
                    <option value="Maintenance">Maintenance & Repairs</option>
                    <option value="Salaries">Salaries & Allowances</option>
                    <option value="Events">School Events & Sports</option>
                    <option value="Other">Other Miscellaneous Expenses</option>
                  </select>
                </div>

                {/* Conditional Fields based on whether Inventory Restock is selected */}
                {expenseCategory === 'Inventory Restock' ? (
                  <div className="space-y-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/60">
                    <div className="text-[11px] font-black text-indigo-800 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Configure Inventory Restock</span>
                    </div>

                    {inventoryList.length > 0 ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                            Select Commodity to Restock
                          </label>
                          <select
                            value={selectedItemIdForRestock || ''}
                            onChange={(e) => handleItemRestockChange(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {inventoryList.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.itemName} (In stock: {item.quantity})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                              Restock Quantity
                            </label>
                            <input
                              type="number"
                              required
                              min={1}
                              value={restockQuantity}
                              onChange={(e) => setRestockQuantity(parseInt(e.target.value) || 1)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                              Purchase Unit Price (GHS)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              required
                              min={0}
                              value={restockUnitPrice}
                              onChange={(e) => setRestockUnitPrice(parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-mono"
                            />
                          </div>
                        </div>

                        {/* Interactive dynamic total and supplier helper widget */}
                        <div className="pt-2 border-t border-indigo-100 flex items-center justify-between text-xs font-extrabold text-indigo-900">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                              Calculated Total Payout
                            </span>
                            <span className="text-sm font-black font-mono">
                              GHS {(restockQuantity * restockUnitPrice).toFixed(2)}
                            </span>
                          </div>
                          {selectedRestockItemPreview?.supplierName && (
                            <div className="text-right text-[10px] text-slate-500 font-bold max-w-[180px]">
                              <span className="text-[9px] text-slate-400 font-medium block">
                                Default Supplier
                              </span>
                              <span className="text-slate-700 truncate block">
                                {selectedRestockItemPreview.supplierName}
                              </span>
                              <span className="text-indigo-600 font-mono block">
                                {selectedRestockItemPreview.supplierPhone}
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-rose-600 font-bold p-2 bg-rose-50 border border-rose-100 rounded">
                        No inventory stock items exist yet. Please create a Stock Commodity first in the
                        "Stock Commodities" tab before logging a restock purchase.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* General overhead description */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Expense Description
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. ECG Power Recharge Meter token purchase"
                        value={expenseDescription}
                        onChange={(e) => setExpenseDescription(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800"
                      />
                    </div>

                    {/* General overhead spent amount */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Total Amount Spent (GHS)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        min={0.01}
                        placeholder="0.00"
                        value={expenseAmount || ''}
                        onChange={(e) => setExpenseAmount(parseFloat(e.target.value) || 0)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 font-mono"
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                  {/* Payment Method selection */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Payment Method
                    </label>
                    <select
                      value={expensePaymentMethod}
                      onChange={(e) => setExpensePaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    >
                      <option value="Mobile Money">Mobile Money (MoMo)</option>
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Bank Cheque</option>
                    </select>
                  </div>

                  {/* Recorded By prefill/input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Recorded By (Officer)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Name of Accountant"
                      value={expenseRecordedBy}
                      onChange={(e) => setExpenseRecordedBy(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800"
                    />
                  </div>
                </div>

                {/* Submission action */}
                <button
                  type="submit"
                  disabled={
                    isSubmittingExpense ||
                    (expenseCategory === 'Inventory Restock' && inventoryList.length === 0)
                  }
                  className="w-full mt-2 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  {isSubmittingExpense
                    ? 'Syncing with Supabase...'
                    : 'Log Transaction & Update Stock'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
