/**
 * Comprehensive Audit Logging System
 * Tracks sensitive operations for security compliance and monitoring
 */

import { getSupabaseAdmin } from './supabase/server';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface AuditLogEntry {
  school_id?: string | null;
  user_id?: string | number | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: any;
  ip_address?: string;
  timestamp?: number;
}

export enum AuditAction {
  // Authentication & Authorization
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_LOGIN_FAILED = 'USER_LOGIN_FAILED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  
  // User Management
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED = 'USER_STATUS_CHANGED',
  
  // Student Management
  STUDENT_CREATED = 'STUDENT_CREATED',
  STUDENT_UPDATED = 'STUDENT_UPDATED',
  STUDENT_DELETED = 'STUDENT_DELETED',
  STUDENT_PROMOTED = 'STUDENT_PROMOTED',
  
  // Academic Operations
  ATTENDANCE_RECORDED = 'ATTENDANCE_RECORDED',
  ATTENDANCE_MODIFIED = 'ATTENDANCE_MODIFIED',
  RESULTS_ENTERED = 'RESULTS_ENTERED',
  RESULTS_MODIFIED = 'RESULTS_MODIFIED',
  RESULTS_DELETED = 'RESULTS_DELETED',
  EXAM_ANALYSIS_GENERATED = 'EXAM_ANALYSIS_GENERATED',
  
  // Financial Operations
  FEE_TRANSACTION_CREATED = 'FEE_TRANSACTION_CREATED',
  FEE_TRANSACTION_MODIFIED = 'FEE_TRANSACTION_MODIFIED',
  FEE_TRANSACTION_DELETED = 'FEE_TRANSACTION_DELETED',
  RECEIPT_GENERATED = 'RECEIPT_GENERATED',
  SCHOOL_EXPENSE_CREATED = 'SCHOOL_EXPENSE_CREATED',
  SCHOOL_EXPENSE_MODIFIED = 'SCHOOL_EXPENSE_MODIFIED',
  SCHOOL_EXPENSE_DELETED = 'SCHOOL_EXPENSE_DELETED',
  
  // School Management
  SCHOOL_CREATED = 'SCHOOL_CREATED',
  SCHOOL_UPDATED = 'SCHOOL_UPDATED',
  SCHOOL_LICENSE_ACTIVATED = 'SCHOOL_LICENSE_ACTIVATED',
  SCHOOL_LICENSE_DEACTIVATED = 'SCHOOL_LICENSE_DEACTIVATED',
  
  // System Operations
  SYSTEM_CONFIG_CHANGED = 'SYSTEM_CONFIG_CHANGED',
  EXPORT_DATA = 'EXPORT_DATA',
  IMPORT_DATA = 'IMPORT_DATA',
  BULK_OPERATION = 'BULK_OPERATION',
  
  // Security Events
  SECURITY_ALERT = 'SECURITY_ALERT',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export enum EntityType {
  USER = 'USER',
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  CLASS = 'CLASS',
  SUBJECT = 'SUBJECT',
  ATTENDANCE = 'ATTENDANCE',
  RESULT = 'RESULT',
  FEE_TRANSACTION = 'FEE_TRANSACTION',
  SCHOOL = 'SCHOOL',
  LICENSE = 'LICENSE',
  INVENTORY = 'INVENTORY',
  EXPENSE = 'EXPENSE',
  EXAM = 'EXAM',
  REPORT = 'REPORT',
  SYSTEM = 'SYSTEM',
}

/**
 * Log an audit entry to the database
 */
export async function logAuditEntry(entry: AuditLogEntry): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    
    const auditRecord = {
      id: crypto.randomUUID(),
      school_id: entry.school_id || null,
      user_id: entry.user_id || null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id || null,
      details: entry.details || {},
      ip_address: entry.ip_address || null,
      timestamp: entry.timestamp || Date.now()
    };

    const { error } = await adminClient.from('audit_logs').insert(auditRecord);
    
    if (error) {
      console.error('Audit logging failed:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Audit logging exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a comprehensive audit log for sensitive operations
 */
export async function createAuditLog(params: {
  userId?: string | number | null;
  schoolId?: string | null;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string | null;
  details?: any;
  ipAddress?: string;
}): Promise<{ success: boolean; error?: string }> {
  return logAuditEntry({
    school_id: params.schoolId,
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    details: params.details,
    ip_address: params.ipAddress
  });
}

/**
 * Extract IP address from request
 */
export function extractIpAddress(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] as string ||
    req.ip ||
    '127.0.0.1'
  );
}

/**
 * Middleware for automatic audit logging of sensitive operations
 */
export function auditLogMiddleware(action: AuditAction, entityType: EntityType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data: any) {
      // Only log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.user?.id;
        const schoolId = req.user?.school_id || req.user?.organization_id;
        const entityId = req.params.id || req.body?.id;
        const ipAddress = extractIpAddress(req);
        
        createAuditLog({
          userId,
          schoolId,
          action,
          entityType,
          entityId,
          details: {
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
          },
          ipAddress
        }).catch(err => console.error('Audit middleware logging failed:', err));
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Get recent audit logs for a school
 */
export async function getAuditLogs(params: {
  schoolId: string;
  limit?: number;
  offset?: number;
  action?: AuditAction;
  entityType?: EntityType;
  userId?: string | number;
}): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    const { schoolId, limit = 50, offset = 0, action, entityType, userId } = params;
    
    let query = adminClient
      .from('audit_logs')
      .select('*')
      .eq('school_id', schoolId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (action) {
      query = query.eq('action', action);
    }
    
    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get security alerts and suspicious activities
 */
export async function getSecurityAlerts(params: {
  schoolId: string;
  limit?: number;
}): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const adminClient = getSupabaseAdmin();
    const { schoolId, limit = 20 } = params;
    
    const { data, error } = await adminClient
      .from('audit_logs')
      .select('*')
      .eq('school_id', schoolId)
      .or('action.in.(UNAUTHORIZED_ACCESS_ATTEMPT,PERMISSION_DENIED,RATE_LIMIT_EXCEEDED,SECURITY_ALERT,USER_LOGIN_FAILED)')
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}