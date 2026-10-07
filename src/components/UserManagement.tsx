import { useState, useEffect, FormEvent } from 'react';
import { db, User } from '../db/schema';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../contexts/NotificationContext';
import { usersApi } from '../lib/api';
import { 
  ROLE_DEFINITIONS, 
  UserRole, 
  getRoleInfo, 
  getRolePermissions 
} from '../lib/permissions';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Shield, 
  Calendar, 
  Search, 
  MoreVertical, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Check, 
  Ban, 
  Lock, 
  KeyRound, 
  Eye, 
  Filter, 
  RefreshCw, 
  ShieldCheck, 
  Info,
  Building,
  Mail,
  Phone,
  Copy,
  Sparkles,
  Download,
  Upload,
  CheckSquare,
  Square
} from 'lucide-react';
import Papa from 'papaparse';
import { cn } from '../lib/utils';
import { validateEmail, EmailValidationResult } from '../lib/emailValidation';
import { EmailValidationFeedback } from './auth/EmailValidationFeedback';

export default function UserManagement() {
  const { user: currentUser, school, token: authToken } = useAuth();
  const { showToast, confirm } = useNotifications();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inspectUser, setInspectUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Invite worker state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('teacher');
  const [inviteEmailValidation, setInviteEmailValidation] = useState<EmailValidationResult | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState<{ token: string; invite_url: string; expires_at: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [copiedToken, setCopiedToken] = useState(false);

  // New user form
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    role: 'teacher' as UserRole,
    status: 'active',
    staffId: '',
    subjects: '',
    assignedClass: 'Basic 7',
    studentId: '',
    gender: 'Male'
  });

  useEffect(() => {
    loadUsers();
  }, [school?.id]);

  useEffect(() => {
    if (!inviteEmail) {
      setInviteEmailValidation(null);
      return;
    }
    setInviteEmailValidation(validateEmail(inviteEmail));
  }, [inviteEmail]);

  const loadPendingInvites = async () => {
    try {
      const token = authToken || localStorage.getItem('esepa_auth_token') || '';
      const res = await fetch('/api/tenant/workers', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-school-id': school?.id || ''
        }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.invitations) {
          setPendingInvites(json.invitations);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (isInviteModalOpen) {
      loadPendingInvites();
    }
  }, [isInviteModalOpen]);

  const handleCreateInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) {
      showToast('Please enter worker email', 'error');
      return;
    }
    if (inviteEmailValidation?.isDisposable) {
      showToast('Temporary throwaway emails are not permitted', 'error');
      return;
    }

    setIsInviting(true);
    try {
      const token = authToken || localStorage.getItem('esepa_auth_token') || '';
      const res = await fetch('/api/tenant/workers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-school-id': school?.id || ''
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          fullName: inviteFullName.trim()
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to generate invitation');
      }

      setGeneratedInvite(json.invitation);
      showToast('Worker invitation generated successfully!', 'success');
      loadPendingInvites();
    } catch (err: any) {
      showToast(err.message || 'Failed to generate invitation', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const isTenantUser = (u: any) => {
    if (!u) return false;
    const role = String(u?.role || '').toLowerCase();
    if (role === 'creator' || role === 'super_admin') return false;
    return true;
  };

  const loadUsers = async () => {
    try {
      const fetched = await usersApi.getAll(school?.id);
      if (Array.isArray(fetched)) {
        const validFetched = fetched.filter(isTenantUser);
        const seenIds = new Set<string>();
        const seenAuthIds = new Set<string>();
        const seenUsernames = new Set<string>();
        const seenAdminEmails = new Set<string>();
        const deduped: any[] = [];

        for (const u of validFetched) {
          const idKey = u.id !== undefined && u.id !== null ? String(u.id) : '';
          const authKey = u.auth_user_id ? String(u.auth_user_id).toLowerCase() : '';
          const unameKey = String(u.username || '').trim().toLowerCase().replace(/^@+/, '');
          const emailKey = String(u.email || '').trim().toLowerCase();
          const roleKey = String(u.role || '').trim().toLowerCase();

          if (idKey && seenIds.has(idKey)) continue;
          if (authKey && seenAuthIds.has(authKey)) continue;
          if (unameKey && seenUsernames.has(unameKey)) continue;
          if (roleKey === 'admin' && emailKey && seenAdminEmails.has(emailKey)) continue;

          if (idKey) seenIds.add(idKey);
          if (authKey) seenAuthIds.add(authKey);
          if (unameKey) seenUsernames.add(unameKey);
          if (roleKey === 'admin' && emailKey) seenAdminEmails.add(emailKey);
          deduped.push(u);
        }
        setUsers(deduped);
      }
    } catch (e) {
      // Preserve existing users in state if a transient network error occurs
    }
  };

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedback(null);
    setModalError(null);

    try {
      const cleanUsername = formData.username.trim().toLowerCase().replace(/^@+/, '');
      if (!cleanUsername) {
        const msg = 'Please enter a valid username';
        setModalError(msg);
        setFeedback({ type: 'error', msg });
        setIsLoading(false);
        return;
      }

      if (!formData.password || formData.password.length < 4) {
        const msg = 'Initial password must be at least 4 characters';
        setModalError(msg);
        setFeedback({ type: 'error', msg });
        setIsLoading(false);
        return;
      }

      const existing = users.find(u => u.username?.toLowerCase() === cleanUsername);
      if (existing) {
        const msg = `Username "@${cleanUsername}" already exists in this school`;
        setModalError(msg);
        setFeedback({ type: 'error', msg });
        setIsLoading(false);
        return;
      }

      const safeRole = (formData.role === 'creator' || formData.role === 'super_admin') ? 'admin' : formData.role;

      const newUser: any = {
        username: cleanUsername,
        fullName: formData.fullName.trim() || cleanUsername,
        full_name: formData.fullName.trim() || cleanUsername,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || '',
        password: formData.password,
        role: safeRole,
        status: formData.status || 'active',
        schoolId: school?.id,
        school_id: school?.id,
        schoolName: school?.name,
        staffId: formData.staffId.trim() || undefined,
        subjects: formData.subjects ? formData.subjects.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        assignedClasses: formData.assignedClass ? [formData.assignedClass] : undefined,
        studentId: formData.studentId.trim() || undefined,
        class: formData.assignedClass || 'Basic 7',
        gender: formData.gender || 'Male',
        createdAt: Date.now(),
        lastLogin: Date.now()
      };

      const created = await usersApi.create(newUser, school?.id);
      const profileNote = created?.linkedProfile
        ? ` and linked to ${created.linkedProfile.type === 'teacher' ? `Teacher (${created.linkedProfile.staffId})` : `Student (${created.linkedProfile.studentId})`} profile`
        : '';
      const successMsg = `User account @${cleanUsername} provisioned in Supabase${profileNote}.`;

      // Immediately display created user in the table, then sync with backend list
      setUsers(prev => {
        const withoutDup = prev.filter(u => String(u.username || '').toLowerCase() !== cleanUsername);
        return [created, ...withoutDup];
      });

      setFeedback({ type: 'success', msg: successMsg });
      showToast(successMsg, 'success');
      setIsAddModalOpen(false);
      setFormData({
        username: '',
        fullName: '',
        email: '',
        phone: '',
        password: '',
        role: 'teacher',
        status: 'active',
        staffId: '',
        subjects: '',
        assignedClass: 'Basic 7',
        studentId: '',
        gender: 'Male'
      });
      await loadUsers();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to create user account';
      setModalError(errorMsg);
      setFeedback({ type: 'error', msg: errorMsg });
      showToast(errorMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (userToUpdate: User) => {
    if (!userToUpdate.id) return;
    const isMaster = userToUpdate.role === 'super_admin' || userToUpdate.role === 'creator';
    if (isMaster) {
      showToast("Cannot modify status of master super admin account.", "error");
      return;
    }

    const newStatus = (userToUpdate.status || 'active') === 'active' ? 'suspended' : 'active';
    try {
      await usersApi.update(userToUpdate.id, { status: newStatus, school_id: school?.id });
      showToast(`User status updated to ${newStatus}`, "success");
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || "Failed to update status", "error");
    }
  };

  const handleAdminResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser || !resetPasswordUser.id || !newResetPassword) return;

    if (newResetPassword.length < 4) {
      showToast("Password must be at least 4 characters", "error");
      return;
    }

    setIsLoading(true);
    try {
      await usersApi.update(resetPasswordUser.id, { password: newResetPassword, school_id: school?.id });
      showToast(`Password successfully reset for @${resetPasswordUser.username}`, "success");
      setResetPasswordUser(null);
      setNewResetPassword('');
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || "Failed to reset password", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (id: number | string) => {
    if (id === currentUser?.id) {
      showToast("You cannot delete your own account", "error");
      return;
    }

    const targetUser = users.find(u => u.id === id);
    if (targetUser && (targetUser.role === 'super_admin' || targetUser.role === 'creator')) {
      showToast("This master super admin account is protected and cannot be deleted.", "error");
      return;
    }

    confirm({
      title: "Delete User Account",
      message: `Are you sure you want to permanently delete user @${targetUser?.username || 'account'}?`,
      confirmLabel: "Delete User",
      onConfirm: async () => {
        try {
          await usersApi.delete(id, { username: targetUser?.username, school_id: school?.id });
          await loadUsers();
          showToast("User deleted successfully!", "success");
        } catch (err) {
          showToast("Failed to delete user", "error");
        }
      }
    });
  };

  const filteredUsers = users.filter(u => {
    if (u.role === 'creator' || u.role === 'super_admin') return false;
    const matchesSearch = (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.fullName || u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = selectedRoleFilter === 'all' || u.role === selectedRoleFilter;
    return matchesSearch && matchesRole;
  });

  const [selectedUserIds, setSelectedUserIds] = useState<Array<number | string>>([]);
  const [bulkRoleValue, setBulkRoleValue] = useState<UserRole>('teacher');

  const toggleSelectUser = (id?: number | string) => {
    if (id === undefined || id === null) return;
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllUsers = () => {
    const validIds = filteredUsers
      .map(u => u.id)
      .filter((id) => id !== undefined && id !== null && id !== currentUser?.id);
    if (validIds.length > 0 && validIds.every(id => selectedUserIds.includes(id))) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(validIds);
    }
  };

  const exportUsersCsv = () => {
    const targetList = selectedUserIds.length > 0
      ? filteredUsers.filter(u => u.id !== undefined && selectedUserIds.includes(u.id))
      : filteredUsers;

    if (targetList.length === 0) {
      showToast('No user records available to export.', 'error');
      return;
    }

    const rows = targetList.map(u => ({
      username: u.username,
      fullName: u.fullName || u.full_name || '',
      role: u.role,
      email: u.email || '',
      phone: u.phone || '',
      status: u.status || 'active',
      staffId: (u as any).staffId || (u as any).staff_id || ''
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `staff_users_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${rows.length} user account(s) to CSV.`, 'success');
  };

  const downloadUsersTemplateCsv = () => {
    const sample = [
      {
        username: 'kwame.mensah',
        fullName: 'Kwame Mensah',
        role: 'teacher',
        email: 'kwame.mensah@school.edu',
        phone: '0240000001',
        password: 'password123',
        staffId: 'TEA-1001'
      }
    ];
    const csv = Papa.unparse(sample);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'staff_users_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportUsersCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = Array.isArray(results.data) ? results.data : [];
        let createdCount = 0;

        for (let i = 0; i < rows.length; i++) {
          const r: any = rows[i];
          const fullName = String(r.fullName || r.full_name || r.Name || '').trim();
          const username = String(
            r.username ||
            r.Username ||
            (fullName ? fullName.toLowerCase().replace(/\s+/g, '.') : '')
          ).trim();
          if (!username || !fullName) continue;

          const role = (String(r.role || 'teacher').trim().toLowerCase() || 'teacher') as UserRole;
          const email = String(r.email || r.Email || '').trim();
          const phone = String(r.phone || r.Phone || '').trim();
          const password = String(r.password || 'password123').trim();
          const staffId = String(r.staffId || r.staff_id || `TEA-${Date.now().toString().slice(-4)}-${i}`).trim();

          try {
            await usersApi.create({
              username,
              password,
              role,
              fullName,
              email,
              phone,
              status: 'active',
              school_id: school?.id,
              staffId: ['teacher', 'hod', 'headteacher'].includes(role) ? staffId : undefined
            });
            createdCount++;
          } catch {
            // Skip duplicate usernames gracefully
          }
        }

        if (createdCount > 0) {
          await loadUsers();
          showToast(`Imported ${createdCount} user account(s) from CSV!`, 'success');
        } else {
          showToast('No new user accounts could be imported from CSV.', 'error');
        }
      }
    });
    e.target.value = '';
  };

  const handleBulkUpdateRole = async () => {
    if (selectedUserIds.length === 0) return;
    setIsLoading(true);
    try {
      for (const id of selectedUserIds) {
        await usersApi.update(id, { role: bulkRoleValue, school_id: school?.id });
      }
      await loadUsers();
      showToast(`Updated role to "${bulkRoleValue}" for ${selectedUserIds.length} user(s).`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to bulk update roles.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkUpdateStatus = async (status: 'active' | 'suspended') => {
    if (selectedUserIds.length === 0) return;
    setIsLoading(true);
    try {
      for (const id of selectedUserIds) {
        await usersApi.update(id, { status, school_id: school?.id });
      }
      await loadUsers();
      showToast(`Marked ${selectedUserIds.length} user(s) as ${status}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to bulk update status.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkDeleteUsers = async () => {
    if (selectedUserIds.length === 0) return;
    const isOk = await confirm({
      title: `Delete ${selectedUserIds.length} User Account(s)?`,
      message: `Are you sure you want to permanently delete ${selectedUserIds.length} selected user account(s)?`,
      confirmLabel: 'Delete Selected'
    });
    if (!isOk) return;

    setIsLoading(true);
    try {
      for (const id of selectedUserIds) {
        if (id === currentUser?.id) continue;
        const target = users.find(u => u.id === id);
        await usersApi.delete(id, { username: target?.username, school_id: school?.id });
      }
      setSelectedUserIds([]);
      await loadUsers();
      showToast(`Deleted ${selectedUserIds.length} user account(s).`, 'info');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete selected users.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (currentUser?.role !== 'super_admin' && currentUser?.role !== 'creator' && currentUser?.role !== 'admin' && currentUser?.role !== 'headteacher') {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
        <Shield className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Only administrators can manage platform user accounts and permissions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight break-words">User & Role Management</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Configure authentication credentials, role matrices, and institutional permissions</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
          <input
            type="file"
            id="import-users-csv"
            className="hidden"
            accept=".csv"
            onChange={handleImportUsersCsv}
          />
          <button
            type="button"
            onClick={downloadUsersTemplateCsv}
            className="w-full sm:w-auto min-w-0 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">CSV Template</span>
          </button>
          <label
            htmlFor="import-users-csv"
            className="w-full sm:w-auto min-w-0 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">Import CSV</span>
          </label>
          <button
            type="button"
            onClick={exportUsersCsv}
            className="w-full sm:w-auto min-w-0 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate">Export CSV</span>
          </button>
          <button 
            onClick={() => {
              setModalError(null);
              setIsAddModalOpen(true);
            }}
            className="w-full sm:w-auto min-w-0 flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-500/20 text-xs sm:text-sm cursor-pointer"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span className="truncate">Add User</span>
          </button>
        </div>
      </div>

      {feedback && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragEnd={(_, info) => {
            if (Math.abs(info.offset.x) > 65 || Math.abs(info.velocity.x) > 350) {
              setFeedback(null);
            }
          }}
          className={cn(
            "p-3.5 sm:p-4 rounded-xl flex items-center gap-3 font-semibold text-xs sm:text-sm border touch-pan-y select-none min-w-0",
            feedback.type === 'success' 
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" 
              : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
          )}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="flex-1 min-w-0 break-words">{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="hover:opacity-70 shrink-0"><X className="w-4 h-4" /></button>
        </motion.div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4 min-w-0">
        {[
          { label: 'Total Users', value: users.length, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
          { label: 'Active Users', value: users.filter(u => (u.status || 'active') === 'active').length, icon: Activity, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
          { label: 'Administrators', value: users.filter(u => u.role === 'admin' || u.role === 'headteacher').length, icon: Shield, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
          { label: 'Suspended', value: users.filter(u => (u.status || 'active') === 'suspended' || u.status === 'inactive').length, icon: Ban, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-3 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <div className={cn("p-2 sm:p-3 rounded-xl shrink-0", stat.bg)}>
              <stat.icon className={cn("w-4 h-4 sm:w-6 sm:h-6", stat.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{stat.label}</p>
              <p className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Role Filter Tabs - 2-Column Grid on Small Screens */}
      <div className="space-y-1.5 min-w-0">
        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
          <Filter className="w-3 h-3" /> Filter by Role:
        </span>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 text-xs min-w-0">
          {[
            { id: 'all', label: 'All Roles' },
            { id: 'admin', label: 'Admins' },
            { id: 'headteacher', label: 'Head Teachers' },
            { id: 'hod', label: 'HODs' },
            { id: 'teacher', label: 'Teachers' },
            { id: 'accountant', label: 'Accountants' },
            { id: 'student', label: 'Students' },
            { id: 'parent', label: 'Parents' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedRoleFilter(tab.id)}
              className={cn(
                "px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg font-semibold transition-all text-center truncate min-w-0 cursor-pointer",
                selectedRoleFilter === tab.id
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search, Bulk Actions, Mobile Cards & Desktop Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden min-w-0">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 flex-1 max-w-md min-w-0">
            <button
              type="button"
              onClick={toggleSelectAllUsers}
              className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {filteredUsers.length > 0 && filteredUsers.every(u => u.id !== undefined && selectedUserIds.includes(u.id)) ? (
                <CheckSquare className="w-4 h-4 text-indigo-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span className="hidden sm:inline">Select All</span>
            </button>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Search users..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>
          <button 
            onClick={loadUsers} 
            className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            title="Refresh database records"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Bulk Action Bar when users are selected */}
        {selectedUserIds.length > 0 && (
          <div className="p-3 sm:p-4 bg-[#1c4a59] text-white border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
            <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
              <span className="px-2.5 py-1 rounded-lg bg-[#faae57] text-[#1f2a2e] text-xs font-extrabold font-mono tabular-nums shrink-0">
                {selectedUserIds.length} Selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedUserIds([])}
                className="text-xs font-bold text-[#e1c594] hover:text-white underline cursor-pointer shrink-0"
              >
                Clear Selection
              </button>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
              <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-2.5 py-1.5 min-w-0 w-full sm:w-auto">
                <select
                  value={bulkRoleValue}
                  onChange={e => setBulkRoleValue(e.target.value as UserRole)}
                  className="flex-1 min-w-0 sm:w-32 bg-transparent text-white text-xs font-bold focus:outline-none truncate"
                >
                  <option value="teacher" className="text-slate-900">Teacher</option>
                  <option value="hod" className="text-slate-900">HOD</option>
                  <option value="headteacher" className="text-slate-900">Headteacher</option>
                  <option value="accountant" className="text-slate-900">Accountant</option>
                  <option value="admin" className="text-slate-900">Admin</option>
                </select>
                <button
                  type="button"
                  onClick={handleBulkUpdateRole}
                  className="px-2.5 py-1 rounded-lg bg-[#faae57] text-[#1f2a2e] text-[11px] font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Set Role
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleBulkUpdateStatus('active')}
                className="min-w-0 px-3 py-2 rounded-xl bg-[#06d6a0] text-[#1f2a2e] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Activate</span>
              </button>

              <button
                type="button"
                onClick={() => handleBulkUpdateStatus('suspended')}
                className="min-w-0 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Suspend</span>
              </button>

              <button
                type="button"
                onClick={exportUsersCsv}
                className="min-w-0 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#06d6a0] shrink-0" />
                <span className="truncate">Export CSV</span>
              </button>

              <button
                type="button"
                onClick={handleBulkDeleteUsers}
                className="min-w-0 px-3 py-2 rounded-xl bg-[#ef476f] hover:bg-[#d93860] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Delete</span>
              </button>
            </div>
          </div>
        )}

        {/* Stacked Mobile User Cards (< 768px) */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/60 min-w-0">
          {filteredUsers.map((user) => {
            const isActive = (user.status || 'active') === 'active';
            const isMaster = user.role === 'super_admin' || user.role === 'creator';
            const roleInfo = getRoleInfo(user.role);
            const uAny = user as any;
            const linkedProfile = uAny.linkedProfile || uAny.linked_profile || null;
            const staffIdVal = uAny.staffId || uAny.staff_id || linkedProfile?.staffId || linkedProfile?.staff_id;
            const studentIdVal = uAny.studentId || uAny.student_id || linkedProfile?.studentId || linkedProfile?.student_id;
            const studentClassVal = uAny.class || linkedProfile?.class;
            const assignedClassesVal = Array.isArray(uAny.assignedClasses)
              ? uAny.assignedClasses
              : (Array.isArray(linkedProfile?.assignedClasses) ? linkedProfile.assignedClasses : []);
            const isSelected = user.id !== undefined && selectedUserIds.includes(user.id);

            return (
              <div
                key={user.id || user.username}
                className={cn(
                  "p-3.5 space-y-3 transition-colors min-w-0",
                  isSelected ? "bg-indigo-50/60 dark:bg-indigo-950/25" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                )}
              >
                <div className="flex items-start justify-between gap-2.5 min-w-0">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={user.id === currentUser?.id}
                      onChange={() => toggleSelectUser(user.id)}
                      className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40 shrink-0"
                    />
                    <div className="w-9 h-9 bg-[#1c4a59] text-white rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                      {(user.fullName || user.full_name || user.username || 'U')[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#1f2a2e] dark:text-slate-100 truncate">
                        {user.fullName || user.full_name || user.username}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono font-semibold text-[#1c4a59] dark:text-indigo-300 bg-[#f6f8f7] dark:bg-slate-800 px-1.5 py-0.5 rounded border border-[#bac4c6]/60 dark:border-slate-700 truncate max-w-full">
                          @{user.username}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1",
                          roleInfo.badgeColor.bg,
                          roleInfo.badgeColor.text,
                          roleInfo.badgeColor.border
                        )}>
                          <Shield className="w-2.5 h-2.5 shrink-0" />
                          {roleInfo.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 shrink-0",
                    isActive
                      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50"
                      : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50"
                  )}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-rose-500")} />
                    {user.status || 'active'}
                  </span>
                </div>

                {(user.email || user.phone || staffIdVal || studentIdVal || linkedProfile) && (
                  <div className="pl-6 space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6a7f84] dark:text-slate-400 font-mono min-w-0">
                      {user.email && (
                        <span className="inline-flex items-center gap-1 truncate max-w-full">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </span>
                      )}
                      {user.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 shrink-0" />
                          {user.phone}
                        </span>
                      )}
                    </div>
                    {(staffIdVal || studentIdVal || linkedProfile) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(staffIdVal || linkedProfile?.type === 'teacher') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#e1c594]/35 text-[#1f2a2e] dark:bg-indigo-950/50 dark:text-indigo-200 border border-[#e4ae67]/50 font-mono truncate max-w-full">
                            <CheckCircle2 className="w-3 h-3 text-[#06d6a0] shrink-0" />
                            <span className="truncate">
                              Staff · {staffIdVal || 'Linked'}
                              {assignedClassesVal.length > 0 ? ` · ${assignedClassesVal.join(', ')}` : ''}
                            </span>
                          </span>
                        )}
                        {(studentIdVal || linkedProfile?.type === 'student') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#06d6a0]/12 text-[#1c4a59] dark:bg-emerald-950/50 dark:text-emerald-200 border border-[#06d6a0]/35 font-mono truncate max-w-full">
                            <CheckCircle2 className="w-3 h-3 text-[#06d6a0] shrink-0" />
                            <span className="truncate">
                              Student · {studentIdVal || 'Linked'}
                              {studentClassVal ? ` · ${studentClassVal}` : ''}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2-Column Mobile Action Button Grid */}
                <div className="grid grid-cols-2 gap-1.5 pt-1 pl-6 min-w-0">
                  <button
                    type="button"
                    onClick={() => setInspectUser(user)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1.5 min-w-0 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">Permissions</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetPasswordUser(user)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1.5 min-w-0 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="truncate">Reset Pass</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(user)}
                    disabled={isMaster}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1.5 min-w-0 disabled:opacity-40 cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">{isActive ? 'Suspend' : 'Activate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => user.id && handleDeleteUser(user.id)}
                    disabled={user.id === currentUser?.id || isMaster}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center justify-center gap-1.5 min-w-0 disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div className="p-8 text-center">
              <Users className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">No matching users found in database</p>
            </div>
          )}
        </div>

        {/* Desktop Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && filteredUsers.every(u => u.id !== undefined && selectedUserIds.includes(u.id))}
                    onChange={toggleSelectAllUsers}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User Identity</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role & Privileges</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Institution</th>
                <th className="px-6 py-3.5 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredUsers.map((user) => {
                const isActive = (user.status || 'active') === 'active';
                const isMaster = user.role === 'super_admin' || user.role === 'creator';
                const roleInfo = getRoleInfo(user.role);
                const uAny = user as any;
                const linkedProfile = uAny.linkedProfile || uAny.linked_profile || null;
                const staffIdVal = uAny.staffId || uAny.staff_id || linkedProfile?.staffId || linkedProfile?.staff_id;
                const studentIdVal = uAny.studentId || uAny.student_id || linkedProfile?.studentId || linkedProfile?.student_id;
                const studentClassVal = uAny.class || linkedProfile?.class;
                const assignedClassesVal = Array.isArray(uAny.assignedClasses)
                  ? uAny.assignedClasses
                  : (Array.isArray(linkedProfile?.assignedClasses) ? linkedProfile.assignedClasses : []);
                const isSelected = user.id !== undefined && selectedUserIds.includes(user.id);

                return (
                  <tr 
                    key={user.id || user.username} 
                    className={cn("transition-colors group", isSelected ? "bg-indigo-50/60 dark:bg-indigo-950/25" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30")}
                  >
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={user.id === currentUser?.id}
                        onChange={() => toggleSelectUser(user.id)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 bg-[#1c4a59] text-white rounded-xl flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 shadow-xs">
                          {(user.fullName || user.full_name || user.username || 'U')[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-[#1f2a2e] dark:text-slate-100 truncate">
                              {user.fullName || user.full_name || user.username}
                            </p>
                            <span className="text-xs font-mono font-semibold text-[#1c4a59] dark:text-indigo-300 bg-[#f6f8f7] dark:bg-slate-800 px-2 py-0.5 rounded-md border border-[#bac4c6]/60 dark:border-slate-700">
                              @{user.username}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6a7f84] dark:text-slate-400 font-mono">
                            {user.email && (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="w-3 h-3 shrink-0 text-[#6a7f84]" />
                                {user.email}
                              </span>
                            )}
                            {user.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3 h-3 shrink-0 text-[#6a7f84]" />
                                {user.phone}
                              </span>
                            )}
                          </div>
                          {(staffIdVal || studentIdVal || linkedProfile) && (
                            <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                              {(staffIdVal || linkedProfile?.type === 'teacher') && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#e1c594]/35 text-[#1f2a2e] dark:bg-indigo-950/50 dark:text-indigo-200 border border-[#e4ae67]/50 dark:border-indigo-800/50 font-mono">
                                  <CheckCircle2 className="w-3 h-3 text-[#06d6a0] shrink-0" />
                                  Teacher Profile · {staffIdVal || 'Linked'}
                                  {assignedClassesVal.length > 0 ? ` · ${assignedClassesVal.join(', ')}` : ''}
                                </span>
                              )}
                              {(studentIdVal || linkedProfile?.type === 'student') && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#06d6a0]/12 text-[#1c4a59] dark:bg-emerald-950/50 dark:text-emerald-200 border border-[#06d6a0]/35 dark:border-emerald-800/50 font-mono">
                                  <CheckCircle2 className="w-3 h-3 text-[#06d6a0] shrink-0" />
                                  Student Profile · {studentIdVal || 'Linked'}
                                  {studentClassVal ? ` · ${studentClassVal}` : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1",
                          roleInfo.badgeColor.bg,
                          roleInfo.badgeColor.text,
                          roleInfo.badgeColor.border
                        )}>
                          <Shield className="w-3 h-3" />
                          {roleInfo.name}
                        </span>
                        <button
                          onClick={() => setInspectUser(user)}
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                          title="View Role Capabilities & Permissions"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(user)}
                        disabled={isMaster}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors",
                          isActive 
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100" 
                            : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50 hover:bg-rose-100",
                          isMaster && "cursor-default"
                        )}
                        title={isMaster ? "Protected account" : "Click to toggle active status"}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-rose-500")} />
                        {user.status || 'active'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                        {user.schoolName || school?.name || 'Assigned School'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setResetPasswordUser(user)}
                          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 transition-colors"
                          title="Reset Password for this account"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => user.id && handleDeleteUser(user.id)}
                          disabled={user.id === currentUser?.id || isMaster}
                          className={cn(
                            "p-2 rounded-lg border transition-all",
                            (user.id === currentUser?.id || isMaster)
                              ? "opacity-30 cursor-not-allowed bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-800" 
                              : "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50 hover:bg-rose-600 hover:text-white"
                          )}
                          title={isMaster ? "Protected Master Account" : (user.id === currentUser?.id ? "Cannot delete self" : "Delete User")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No matching users found in database</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create User Account</h2>
                </div>
                <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{modalError}</span>
                    <button type="button" onClick={() => setModalError(null)} className="hover:opacity-70">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Full Name</label>
                  <input 
                    required
                    type="text"
                    value={formData.fullName}
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                    placeholder="e.g. John Mensah"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Username (Login ID)</label>
                  <input 
                    required
                    type="text"
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                    placeholder="e.g. jmensah"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono"
                  />
                  <p className="text-[11px] text-slate-400">Scoped to {school?.name || 'your school'}. User logs in with plain username.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Email (Optional)</label>
                    <input 
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      placeholder="user@school.edu"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Phone (Optional)</label>
                    <input 
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      placeholder="024XXXXXXX"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Initial Password</label>
                  <input 
                    required
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="Enter secure initial password (min 4 chars)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">System Role</label>
                    <select 
                      value={formData.role}
                      onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      <option value="admin">School Administrator</option>
                      <option value="headteacher">Head Teacher / Principal</option>
                      <option value="hod">Head of Department (HOD)</option>
                      <option value="teacher">Teacher</option>
                      <option value="accountant">Accountant / Bursar</option>
                      <option value="student">Student</option>
                      <option value="parent">Parent</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Account Status</label>
                    <select 
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value})}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                </div>

                {/* Role-specific Supabase profile auto-linking fields */}
                {(formData.role === 'teacher' || formData.role === 'hod' || formData.role === 'headteacher') && (
                  <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/40 space-y-3">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Auto-links or creates Teacher Profile in Supabase</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Staff ID (Auto if blank)</label>
                        <input
                          type="text"
                          value={formData.staffId}
                          onChange={e => setFormData({...formData, staffId: e.target.value})}
                          placeholder="TEA-1001"
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Assigned Class</label>
                        <input
                          type="text"
                          value={formData.assignedClass}
                          onChange={e => setFormData({...formData, assignedClass: e.target.value})}
                          placeholder="e.g. Basic 7"
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Subjects</label>
                        <input
                          type="text"
                          value={formData.subjects}
                          onChange={e => setFormData({...formData, subjects: e.target.value})}
                          placeholder="Math, Science"
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formData.role === 'student' && (
                  <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-3">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Auto-links or creates Student Profile in Supabase</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Student ID (Auto if blank)</label>
                        <input
                          type="text"
                          value={formData.studentId}
                          onChange={e => setFormData({...formData, studentId: e.target.value})}
                          placeholder="STU-100001"
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Class / Grade</label>
                        <input
                          type="text"
                          value={formData.assignedClass}
                          onChange={e => setFormData({...formData, assignedClass: e.target.value})}
                          placeholder="e.g. Basic 7"
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Gender</label>
                        <select
                          value={formData.gender}
                          onChange={e => setFormData({...formData, gender: e.target.value})}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-3 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold transition-all text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={isLoading}
                    type="submit"
                    className="flex-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 text-xs"
                  >
                    {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Create Account"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Permissions Inspector Modal */}
      <AnimatePresence>
        {inspectUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">Role Privileges: {inspectUser.fullName || inspectUser.username}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Role: {inspectUser.role}</p>
                  </div>
                </div>
                <button onClick={() => setInspectUser(null)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300">
                  {getRoleInfo(inspectUser.role).description}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Assigned Capabilities</h4>
                  <div className="grid grid-cols-1 gap-1.5">
                    {getRolePermissions(inspectUser.role).map((perm) => (
                      <div key={perm} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-mono text-[11px]">{perm}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Reset Password Modal */}
      <AnimatePresence>
        {resetPasswordUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">Admin Password Reset</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">User: @{resetPasswordUser.username}</p>
                  </div>
                </div>
                <button onClick={() => setResetPasswordUser(null)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleAdminResetPassword} className="p-6 space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  As an administrator, you can directly set a new temporary or permanent password for this account.
                </p>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">New Password</label>
                  <input
                    type="password"
                    required
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setResetPasswordUser(null)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold transition-all text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !newResetPassword}
                    className="flex-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 text-xs"
                  >
                    {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Save New Password"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
