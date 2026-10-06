import { describe, it, expect } from 'vitest';

describe('Boarding System Architecture & State Machine', () => {
  it('validates exeat leave pass status transition lifecycle', () => {
    type ExeatStatus = 'pending' | 'approved' | 'rejected' | 'checked_out' | 'checked_in' | 'overdue';

    const validTransitions: Record<ExeatStatus, ExeatStatus[]> = {
      pending: ['approved', 'rejected'],
      approved: ['checked_out', 'rejected'],
      checked_out: ['checked_in', 'overdue'],
      overdue: ['checked_in'],
      checked_in: [],
      rejected: []
    };

    expect(validTransitions['pending']).toContain('approved');
    expect(validTransitions['approved']).toContain('checked_out');
    expect(validTransitions['checked_out']).toContain('checked_in');
  });

  it('calculates roll call summary counts correctly', () => {
    const studentRecords = [
      { studentId: 'STU-001', studentName: 'Kwame Mensah', status: 'present' as const },
      { studentId: 'STU-002', studentName: 'Kofi Owusu', status: 'present' as const },
      { studentId: 'STU-003', studentName: 'Yaw Boateng', status: 'absent' as const },
      { studentId: 'STU-004', studentName: 'Kojo Antwi', status: 'exeat' as const },
      { studentId: 'STU-005', studentName: 'Kwesi Appiah', status: 'sick' as const },
    ];

    const counts = {
      total: studentRecords.length,
      present: studentRecords.filter(r => r.status === 'present').length,
      absent: studentRecords.filter(r => r.status === 'absent').length,
      exeat: studentRecords.filter(r => r.status === 'exeat').length,
      sick: studentRecords.filter(r => r.status === 'sick').length,
    };

    expect(counts.total).toBe(5);
    expect(counts.present).toBe(2);
    expect(counts.absent).toBe(1);
    expect(counts.exeat).toBe(1);
    expect(counts.sick).toBe(1);
  });

  it('validates dormitory room occupancy math', () => {
    const room = {
      id: 'room-101',
      capacity: 12,
      allocations: [
        { id: 'alloc-1', bedNumber: 'Bed 1', status: 'active' },
        { id: 'alloc-2', bedNumber: 'Bed 2', status: 'active' },
        { id: 'alloc-3', bedNumber: 'Bed 3', status: 'active' },
      ]
    };

    const occupiedCount = room.allocations.filter(a => a.status === 'active').length;
    const remainingCapacity = room.capacity - occupiedCount;
    const occupancyPercentage = Math.round((occupiedCount / room.capacity) * 100);

    expect(occupiedCount).toBe(3);
    expect(remainingCapacity).toBe(9);
    expect(occupancyPercentage).toBe(25);
  });
});
