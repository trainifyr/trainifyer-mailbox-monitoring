# WI-302 — Settings Panel UI

> **GitHub Issue**: #8
> **Phase**: 3 — Cohort Configuration Controls (Slice 2)
> **Priority**: High
> **Dependencies**: WI-202, WI-301
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-202 built the admin Batches page (`/admin/batches`) with a batch list table, create form, expandable detail view showing the assigned student roster, and a student assignment form. WI-301 added two backend endpoints (`GET/PATCH /api/batches/:id/settings`) that read and update the `batch_settings` row for a batch.

This work item adds a **Settings Panel** inside the expanded batch detail area on the Batches page. The panel displays all 6 feature toggles as interactive controls (switches/toggles + a dropdown for screen share mode). Admin users can toggle any setting, and each change immediately calls `PATCH /api/batches/:id/settings`. A success notification confirms the save.

> ⚠️ **Mock Context-First Rule**: The settings panel and toggle controls are only visible when the Mock Identity Bar is set to Admin. The backend enforces this via `requireRole('ADMIN')` on the PATCH endpoint; the frontend hides the controls as a UX courtesy.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-302
- `GOALS.md` — Sub-Goal 3 (Feature & Permission Configuration)
- `prompts/WI-202-prompt.md` — The BatchesPage structure (expandable rows, student roster, assign form)
- `prompts/WI-301-prompt.md` — The settings API endpoints and the batch_settings table columns
- `prompts/WI-302-prompt.md` — This file

---

## Scope of This Work Item

- Modify `BatchesPage.jsx` to fetch and display batch settings when a batch row is expanded.
- Add toggle controls (visual switch toggles for booleans, a dropdown for `require_screen_share`).
- Each toggle change immediately calls `PATCH /api/batches/:id/settings` with the new value.
- Show a brief success notification ("Settings saved") after each update.
- Show a loading state while settings are being fetched.
- Hide all settings controls when the active role is not Admin.

This is a **frontend-only** work item. The backend endpoints from WI-301 are already in place.

---

## Step-by-Step Instructions

### 1. Understand the data model

The `batch_settings` table has these 6 user-configurable fields:

| Field | Type | Default | Control |
|-------|------|---------|---------|
| `mailbox_enabled` | boolean | `true` | Toggle switch |
| `student_to_student_messaging` | boolean | `false` | Toggle switch |
| `meeting_join_enabled` | boolean | `true` | Toggle switch |
| `require_camera` | boolean | `false` | Toggle switch |
| `require_microphone` | boolean | `true` | Toggle switch |
| `require_screen_share` | enum (`REQUIRED`, `OPTIONAL`, `OFF`) | `OPTIONAL` | Dropdown/select |

### 2. Files to modify

```
frontend/src/pages/admin/
├── BatchesPage.jsx     (MODIFY — add settings panel)
└── BatchesPage.css     (MODIFY — add settings panel styles)
```

### 3. Write the updated `BatchesPage.jsx`

The existing component from WI-202 has a batch list with expandable rows. The expanded detail currently shows an "Assigned Students" section and an "Assign Student" form. You will add a **Settings** section above or below the students section.

Here is the full updated component. The settings-related additions are clearly separated:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useMockIdentity } from '../../context/MockIdentityContext';
import apiClient from '../../api/client';
import { Plus, ChevronDown, ChevronRight, Users, Settings, Check } from 'lucide-react';
import './BatchesPage.css';

const INITIAL_BATCH_FORM = { name: '' };
const INITIAL_ASSIGN_FORM = { studentId: '' };

// Label map for display in the settings panel
const SETTINGS_LABELS = {
  mailbox_enabled: 'Mailbox Access',
  student_to_student_messaging: 'Student-to-Student Messaging',
  meeting_join_enabled: 'Meeting Join',
  require_camera: 'Require Camera',
  require_microphone: 'Require Microphone',
  require_screen_share: 'Screen Share Mode'
};

// Description map for tooltips / sub-text
const SETTINGS_DESCRIPTIONS = {
  mailbox_enabled: 'Allow students to access the internal mailbox',
  student_to_student_messaging: 'Allow students to message each other',
  meeting_join_enabled: 'Allow students to join batch meetings',
  require_camera: 'Require camera to be ON during meetings',
  require_microphone: 'Require microphone to be ON during meetings',
  require_screen_share: 'Screen sharing requirement for meetings'
};

export default function BatchesPage() {
  const { isAdmin } = useMockIdentity();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [batchForm, setBatchForm] = useState(INITIAL_BATCH_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Expanded batch detail state
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [batchStudents, setBatchStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [assignForm, setAssignForm] = useState(INITIAL_ASSIGN_FORM);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState(null);

  // Settings state
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(null); // field name being saved
  const [notification, setNotification] = useState(null);

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/batches');
      setBatches(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Clear notification after 2 seconds
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 2000);
    return () => clearTimeout(timer);
  }, [notification]);

  const fetchBatchStudents = useCallback(async (batchId) => {
    try {
      setStudentsLoading(true);
      const res = await apiClient.get(`/batches/${batchId}/students`);
      setBatchStudents(res.data.data);
    } catch (e) {
      console.error('Failed to fetch batch students:', e);
      setBatchStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async (batchId) => {
    try {
      setSettingsLoading(true);
      const res = await apiClient.get(`/batches/${batchId}/settings`);
      setSettings(res.data.data);
    } catch (e) {
      console.error('Failed to fetch settings:', e);
      setSettings(null);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const handleToggleExpand = (batchId) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchStudents([]);
      setSettings(null);
    } else {
      setExpandedBatchId(batchId);
      fetchBatchStudents(batchId);
      fetchSettings(batchId);
      setAssignForm(INITIAL_ASSIGN_FORM);
      setAssignError(null);
    }
  };

  const handleBatchFormChange = (e) => {
    setBatchForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!batchForm.name) {
      setFormError('Batch name is required.');
      return;
    }
    try {
      setSubmitting(true);
      setFormError(null);
      await apiClient.post('/batches', { name: batchForm.name });
      setBatchForm(INITIAL_BATCH_FORM);
      setShowForm(false);
      await fetchBatches();
    } catch (e) {
      setFormError(e.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (batch) => {
    const newStatus = batch.status === 'active' ? 'inactive' : 'active';
    try {
      await apiClient.patch(`/batches/${batch.id}`, { status: newStatus });
      await fetchBatches();
      if (expandedBatchId === batch.id) {
        setBatchStudents([]);
        await fetchBatchStudents(batch.id);
      }
    } catch (e) {
      console.error('Failed to update batch status:', e);
    }
  };

  const handleAssignFormChange = (e) => {
    setAssignForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAssignStudent = async (e) => {
    e.preventDefault();
    if (!assignForm.studentId) {
      setAssignError('Student ID is required.');
      return;
    }
    try {
      setAssignSubmitting(true);
      setAssignError(null);
      await apiClient.post(`/batches/${expandedBatchId}/students`, {
        studentId: assignForm.studentId
      });
      setAssignForm(INITIAL_ASSIGN_FORM);
      await fetchBatchStudents(expandedBatchId);
      await fetchBatches();
    } catch (e) {
      setAssignError(e.response?.data?.message || e.message);
    } finally {
      setAssignSubmitting(false);
    }
  };

  // --- Settings handlers ---

  const handleToggleSetting = async (field, currentValue) => {
    const newValue = !currentValue;
    try {
      setSettingsSaving(field);
      const res = await apiClient.patch(`/batches/${expandedBatchId}/settings`, {
        [field]: newValue
      });
      setSettings(res.data.data);
      setNotification(`Settings saved`);
    } catch (e) {
      console.error('Failed to update setting:', e);
    } finally {
      setSettingsSaving(null);
    }
  };

  const handleScreenShareChange = async (e) => {
    const newValue = e.target.value;
    try {
      setSettingsSaving('require_screen_share');
      const res = await apiClient.patch(`/batches/${expandedBatchId}/settings`, {
        require_screen_share: newValue
      });
      setSettings(res.data.data);
      setNotification(`Settings saved`);
    } catch (e) {
      console.error('Failed to update screen share setting:', e);
    } finally {
      setSettingsSaving(null);
    }
  };

  // --- Render helpers ---

  const renderSettingsPanel = () => {
    if (settingsLoading) {
      return <p className="status-message">Loading settings...</p>;
    }
    if (!settings) {
      return <p className="status-message">Settings not available.</p>;
    }

    const booleanFields = [
      'mailbox_enabled',
      'student_to_student_messaging',
      'meeting_join_enabled',
      'require_camera',
      'require_microphone'
    ];

    return (
      <div className="settings-panel">
        <h4 className="section-title"><Settings size={16} /> Batch Settings</h4>
        <div className="settings-grid">
          {booleanFields.map((field) => (
            <div key={field} className="setting-row">
              <div className="setting-info">
                <span className="setting-label">{SETTINGS_LABELS[field]}</span>
                <span className="setting-desc">{SETTINGS_DESCRIPTIONS[field]}</span>
              </div>
              <div className="setting-control">
                {isAdmin ? (
                  <button
                    className={`toggle-switch ${settings[field] ? 'active' : ''}`}
                    onClick={() => handleToggleSetting(field, settings[field])}
                    disabled={settingsSaving === field}
                    aria-label={`Toggle ${SETTINGS_LABELS[field]}`}
                  >
                    <span className="toggle-knob" />
                  </button>
                ) : (
                  <span className={`toggle-readonly ${settings[field] ? 'on' : 'off'}`}>
                    {settings[field] ? 'ON' : 'OFF'}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Screen share mode is a dropdown, not a toggle */}
          <div key="require_screen_share" className="setting-row">
            <div className="setting-info">
              <span className="setting-label">{SETTINGS_LABELS.require_screen_share}</span>
              <span className="setting-desc">{SETTINGS_DESCRIPTIONS.require_screen_share}</span>
            </div>
            <div className="setting-control">
              {isAdmin ? (
                <select
                  className="setting-select"
                  value={settings.require_screen_share}
                  onChange={handleScreenShareChange}
                  disabled={settingsSaving === 'require_screen_share'}
                >
                  <option value="OPTIONAL">Optional</option>
                  <option value="REQUIRED">Required</option>
                  <option value="OFF">Off</option>
                </select>
              ) : (
                <span className="toggle-readonly on">
                  {settings.require_screen_share}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="batches-page">
      {notification && (
        <div className="notification">
          <Check size={14} /> {notification}
        </div>
      )}

      <div className="page-header">
        <h2>Batches</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> {showForm ? 'Cancel' : 'Create Batch'}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form className="create-form" onSubmit={handleCreateBatch}>
          <h3><Plus size={16} /> New Batch</h3>
          <div className="form-row">
            <label>
              Batch Name
              <input
                name="name"
                value={batchForm.name}
                onChange={handleBatchFormChange}
                placeholder="e.g. Cohort-1"
                required
              />
            </label>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="status-message">Loading batches...</p>}
      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Name</th>
                <th>Status</th>
                <th>Students</th>
                <th>Created</th>
                {isAdmin && <th style={{ width: 100 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="empty-row">No batches found.</td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="batch-row">
                    <td>
                      <button
                        className="expand-btn"
                        onClick={() => handleToggleExpand(b.id)}
                      >
                        {expandedBatchId === b.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="batch-name">{b.name}</td>
                    <td>
                      <span className={`badge badge-${b.status}`}>{b.status}</span>
                    </td>
                    <td>{b.student_count}</td>
                    <td>{new Date(b.created_at).toLocaleDateString()}</td>
                    {isAdmin && (
                      <td>
                        <button
                          className={`btn btn-${b.status === 'active' ? 'danger' : 'success'}`}
                          onClick={() => handleToggleStatus(b)}
                        >
                          {b.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {expandedBatchId && (
            <div className="batch-detail">
              {/* Settings panel — always shown */}
              {renderSettingsPanel()}

              {/* Assigned Students section */}
              <h4 className="section-title" style={{ marginTop: '1.5rem' }}>
                <Users size={16} /> Assigned Students
              </h4>

              {isAdmin && (
                <form className="assign-form" onSubmit={handleAssignStudent}>
                  <label>
                    Student UUID
                    <input
                      name="studentId"
                      value={assignForm.studentId}
                      onChange={handleAssignFormChange}
                      placeholder="Paste student UUID"
                    />
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={assignSubmitting}>
                    {assignSubmitting ? 'Assigning...' : 'Assign'}
                  </button>
                  {assignError && <p className="form-error">{assignError}</p>}
                </form>
              )}

              {studentsLoading ? (
                <p className="status-message">Loading students...</p>
              ) : batchStudents.length === 0 ? (
                <p className="status-message">No students assigned to this batch.</p>
              ) : (
                <table className="data-table inner-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Assigned At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchStudents.map((s) => (
                      <tr key={s.id}>
                        <td>{s.full_name}</td>
                        <td>{s.email}</td>
                        <td>{new Date(s.assigned_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 4. Append to `frontend/src/pages/admin/BatchesPage.css`

Add the settings panel styles at the end of the existing file:

```css
/* --- Settings panel --- */

.section-title {
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #374151;
}

.settings-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  transition: background 0.15s;
}

.setting-row:hover {
  background: #f9fafb;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
}

.setting-desc {
  font-size: 12px;
  color: #9ca3af;
}

.setting-control {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* --- Toggle switch --- */

.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  background: #d1d5db;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  padding: 0;
}

.toggle-switch.active {
  background: #2563eb;
}

.toggle-switch:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}

/* --- Read-only toggle state (non-Admin view) --- */

.toggle-readonly {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.toggle-readonly.on {
  background: #dcfce7;
  color: #16a34a;
}

.toggle-readonly.off {
  background: #fef3c7;
  color: #d97706;
}

/* --- Select dropdown for screen share --- */

.setting-select {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  background: white;
  cursor: pointer;
  min-width: 120px;
}

.setting-select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.setting-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* --- Notification toast --- */

.notification {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #16a34a;
  color: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 9998;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

### 5. Verify the build

```bash
cd frontend
npm run build
```

Expected: Clean Vite build with no errors or warnings.

### 6. Manual verification

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173`
4. Click the **Admin** button on the Mock Identity Bar
5. Navigate to `http://localhost:5173/admin/batches`
6. Click the expand arrow on any batch row
   - Verify the Settings panel appears with all 6 controls
   - Verify the "Assigned Students" section still works (below the settings panel)
7. Toggle **Mailbox Access** (should turn OFF):
   - Verify the switch changes from blue to gray
   - Verify the green notification "Settings saved" appears at top-right
   - Refresh the page and verify the setting persists
8. Toggle **Mailbox Access** back ON (verify it reverts)
9. Change **Screen Share Mode** dropdown from "Optional" to "Required"
   - Verify the notification appears
   - Verify the dropdown shows "Required" after save
10. Click the **Student** button on the Mock Identity Bar
11. Expand the same batch row
    - Verify the settings panel shows read-only ON/OFF labels instead of toggles
    - Verify the toggle switches and dropdown are not interactive
12. Verify the "Create Batch" button and action buttons are hidden in Student mode

---

## Expected Output (File Checklist)

- [ ] `frontend/src/pages/admin/BatchesPage.jsx` — Modified: added settings panel with toggle controls and notification
- [ ] `frontend/src/pages/admin/BatchesPage.css` — Modified: added toggle switch, select dropdown, notification, and settings grid styles
- [ ] `frontend/src/routes/AppRoutes.jsx` — No changes needed (already has `/admin/batches` route from WI-202)

---

## Acceptance Criteria

- Expanding a batch row fetches settings from `GET /api/batches/:id/settings` and displays them in a panel.
- Each boolean field is rendered as a toggle switch showing the current state (active = blue, inactive = gray).
- `require_screen_share` is rendered as a `<select>` dropdown with three options (Optional, Required, Off).
- Toggling a switch or changing the dropdown calls `PATCH /api/batches/:id/settings` with the new value.
- A green notification toast appears at top-right showing "Settings saved" after each successful update.
- The notification auto-dismisses after 2 seconds.
- The toggle is visually disabled (opacity + disabled attribute) while the PATCH request is in-flight.
- When the Mock Identity Bar is set to Student or no role:
  - Toggle switches are replaced with read-only "ON" / "OFF" badges.
  - The screen share dropdown is replaced with a read-only badge showing the current value.
  - No interactive controls are shown.
- The existing "Assigned Students" section and "Assign Student" form still work unchanged.
- `npm run build` completes without errors.

---

## Risk / Impact

- **Optimistic toggle on click**: The toggle changes state optimistically (the UI updates before the API responds). If the PATCH fails, the toggle reverts on the next re-fetch (when the batch is collapsed/re-expanded). An enhancement could add error rollback, but this is acceptable for the MVP.
- **PATCH on every toggle**: Each toggle click triggers a separate PATCH request with a single field. This is intentional — it keeps the implementation simple and avoids race conditions from sending multiple fields at once. If performance becomes a concern, the toggles could batch changes and debounce, but that is out of scope.
- **Notification position**: The notification is fixed at top-right. It may overlap with the page header on small screens. Acceptable for the MVP.
- **No confirmation dialogs**: Toggling a setting (e.g., disabling mailbox access) takes effect immediately. There is no "Are you sure?" confirmation. This matches the straightforward CRUD nature of the MVP. If destructive actions need confirmation in the future, a confirmation dialog can be added.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-302** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 3 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-302: Settings Panel UI
* **Work Item ID**: WI-302
* **Summary**: Added an interactive settings panel to the expanded batch detail view on the Batches admin page. Displays 6 feature toggles (mailbox_enabled, student_to_student_messaging, meeting_join_enabled, require_camera, require_microphone) as toggle switches and require_screen_share as a dropdown. Each change triggers PATCH /api/batches/:id/settings. Green notification toast confirms saves. Admin role gating hides interactive controls for non-Admin users.
* **Files Affected**:
  - [MODIFIED] `frontend/src/pages/admin/BatchesPage.jsx` (added settings panel, notification, settings API calls)
  - [MODIFIED] `frontend/src/pages/admin/BatchesPage.css` (added toggle switch, notification, settings grid styles)
* **Verification Done**:
  - [x] Admin can toggle all 5 boolean settings with immediate PATCH save
  - [x] Admin can change screen share mode via dropdown
  - [x] Green "Settings saved" notification appears after each change
  - [x] Settings controls disabled/read-only for non-Admin roles
  - [x] Existing student roster and assign form still work
  - [x] `npm run build` completes with no errors
* **Impact on Existing Functionality**: None. Existing batch list, create form, expandable student roster, and assign form from WI-202 are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-401 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **This builds on WI-202's BatchesPage**: The component structure (expandable rows, student section, assign form) was established in WI-202. You are adding the settings panel into that existing flow. The settings panel is fetched when a row is expanded, and rendered above the Assigned Students section.
- **Use `lucide-react` icons**: The project already has this dependency. Use `Settings` for the settings section heading and `Check` for the notification toast (already imported).
- **Notification pattern**: The notification is a simple state-driven toast. It slides in from the right, stays for 2 seconds, then auto-dismisses. Use `setTimeout` in a `useEffect` keyed on `notification`.
- **No loading skeletons**: The settings panel shows "Loading settings..." while fetching, and "Settings not available." if the fetch fails. This is intentionally simple — no loading skeletons or complex error recovery.
- **Toggle switch implementation**: The toggle is a `<button>` element with CSS-driven styling (`.toggle-switch` wraps a `.toggle-knob` span). The `active` class moves the knob via `translateX`. This avoids any third-party toggle library dependency.
- **Do not modify the backend**: All settings endpoints are already implemented in WI-301. Do not touch `backend/` files.
- **Do not modify other frontend files**: Leave `AppRoutes.jsx`, `StudentsPage.jsx`, `AdminDashboard.jsx`, `Layout.jsx`, and other files unchanged.
- **Accessibility**: Toggle buttons should have an `aria-label` so they are distinguishable. The setting label serves as the visible text identifier.
