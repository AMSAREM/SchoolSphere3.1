-- ==============================================================================
-- SCHOOLSPHERE STAFF PAYROLL & COMPENSATION SYSTEM TABLES FOR SUPABASE
-- Connects Payroll to schools, teachers, school_expenses, and audit_logs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.staff_salary_profiles (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id VARCHAR(80) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  designation VARCHAR(150) NOT NULL DEFAULT 'Subject Teacher',
  phone VARCHAR(60) NULL,
  email VARCHAR(150) NULL,
  ssnit_number VARCHAR(80) NOT NULL DEFAULT 'N/A',
  tin_number VARCHAR(80) NOT NULL DEFAULT 'N/A',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
  bank_or_network VARCHAR(120) NOT NULL DEFAULT 'GCB Bank',
  account_number VARCHAR(100) NOT NULL DEFAULT '—',
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  responsibility_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  transport_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ssnit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  paye_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manual_tax_override NUMERIC(12, 2) NULL,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_staff_salary_profiles_school
  ON public.staff_salary_profiles (school_id, staff_id);

CREATE TABLE IF NOT EXISTS public.staff_payslips (
  id VARCHAR(140) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payroll_month VARCHAR(20) NOT NULL,
  period_label VARCHAR(80) NOT NULL,
  staff_id VARCHAR(80) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  designation VARCHAR(150) NOT NULL DEFAULT 'Subject Teacher',
  ssnit_number VARCHAR(80) NOT NULL DEFAULT 'N/A',
  tin_number VARCHAR(80) NOT NULL DEFAULT 'N/A',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
  bank_or_network VARCHAR(120) NOT NULL DEFAULT 'GCB Bank',
  account_number VARCHAR(100) NOT NULL DEFAULT '—',
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  responsibility_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  transport_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  gross_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ssnit_employee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ssnit_employer NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  taxable_income NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  paye_tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  loan_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  net_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  paid_at BIGINT NULL,
  receipt_ref VARCHAR(80) NOT NULL,
  notes TEXT NULL,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_staff_payslips_school_month
  ON public.staff_payslips (school_id, payroll_month, status);

CREATE TABLE IF NOT EXISTS public.staff_salary_advances (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id VARCHAR(80) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  designation VARCHAR(150) NOT NULL DEFAULT 'Subject Teacher',
  type VARCHAR(50) NOT NULL DEFAULT 'Salary Advance',
  principal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  monthly_installment NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  remaining_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  reason TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  approved_by VARCHAR(150) NULL,
  approved_at BIGINT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_salary_advances_school
  ON public.staff_salary_advances (school_id, status);

NOTIFY pgrst, 'reload schema';
