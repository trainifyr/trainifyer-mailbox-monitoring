import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function AttendanceCalendar({ details }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const groupedStatus = useMemo(() => {
    const map = {};
    if (!details || !Array.isArray(details)) return map;

    const rank = { PRESENT: 3, PARTIAL: 2, ACTIVE: 2, ABSENT: 1 };
    
    details.forEach(d => {
      if (!d.status) return;
      const rawDate = d.session_date || d.joined_at;
      if (!rawDate) return;
      
      const dObj = new Date(rawDate);
      const dateStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
      
      const existingRank = map[dateStr] ? rank[map[dateStr]] : 0;
      const currentRank = rank[d.status] || 0;
      
      if (currentRank > existingRank) {
        map[dateStr] = d.status === 'ACTIVE' ? 'PARTIAL' : d.status;
      }
    });
    return map;
  }, [details]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().split('T')[0];

  const gridCells = [];
  
  for (let i = startOffset - 1; i >= 0; i--) {
    gridCells.push({ day: daysInPrevMonth - i, isCurrentMonth: false, dateStr: '' });
  }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    const mStr = String(month + 1).padStart(2, '0');
    gridCells.push({ day: d, isCurrentMonth: true, dateStr: `${year}-${mStr}-${dStr}` });
  }
  
  const remainingCells = 42 - gridCells.length;
  for (let i = 1; i <= remainingCells; i++) {
    gridCells.push({ day: i, isCurrentMonth: false, dateStr: '' });
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'PRESENT': return '#10b981';
      case 'PARTIAL': return '#f59e0b';
      case 'ABSENT': return '#ef4444';
      default: return 'transparent';
    }
  };

  const hasData = details && details.length > 0;

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '0.95rem' }}>{monthName}</div>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: '0.25rem', justifyContent: 'center', marginBottom: '0.5rem', textAlign: 'center' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
          <div key={i} style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>{day}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: '0.25rem', justifyContent: 'center' }}>
        {gridCells.slice(0, 42).map((cell, idx) => {
          const status = cell.isCurrentMonth ? groupedStatus[cell.dateStr] : null;
          const isToday = cell.isCurrentMonth && cell.dateStr === todayStr;
          
          return (
            <div 
              key={idx}
              style={{
                width: '32px', height: '32px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', position: 'relative',
                opacity: cell.isCurrentMonth ? 1 : 0.2,
                borderRadius: '6px',
                border: isToday ? '2px solid var(--primary)' : '2px solid transparent',
                color: 'var(--text-heading)',
                fontSize: '0.75rem',
                fontWeight: isToday ? 600 : 400
              }}
            >
              <span>{cell.day}</span>
              {status && (
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: getStatusColor(status),
                  position: 'absolute', bottom: '2px'
                }} />
              )}
            </div>
          );
        })}
      </div>

      {hasData && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#10b981' }}>●</span> Present
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#f59e0b' }}>●</span> Partial
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#ef4444' }}>●</span> Absent
          </div>
        </div>
      )}
    </div>
  );
}
