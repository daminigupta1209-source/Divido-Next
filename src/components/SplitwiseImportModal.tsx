import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Group, Expense } from '../lib/types';
import { escManager } from '../lib/escManager';
import { formatExactAmount } from '../lib/utils';
import {
  startSplitwiseAuth,
  SplitwiseConfigError,
  exchangeCode,
  fetchGroupExpenses,
  fetchFriendExpenses,
  SplitwiseExchangeResult,
  SplitwiseGroupSummary,
} from '../lib/splitwiseAuth';
import {
  mapSplitwiseImport,
  RawSplitwiseGroup,
  RawSplitwiseUser,
  RawSplitwiseExpense,
  SplitwiseReviewItem,
} from '../lib/splitwiseImport';

export interface SplitwiseImportModalProps {
  open: boolean;
  onClose: () => void;
  oauthCode: string | null;
  groups: Group[];
  expenses: Expense[];
  me: string;
  myEmail: string;
  onCommit: (r: { groups: Group[]; expenses: Expense[] }) => void;
  onReviewItemTap?: (expenseId: string, gId: string | number) => void;
  // Set by the parent when the OAuth callback itself reported a problem
  // (consent denied, or the CSRF state was missing/expired/mismatched — see
  // consumeOAuthState's `reason` values in lib/splitwiseAuth.ts).
  oauthError?: string | null;
}

type Step = 'connecting' | 'picking' | 'importing' | 'summary';

// One row of the "picking" step: either the single "Friends" row or one row
// per Splitwise group returned by exchangeCode().
interface RowState {
  key: string;
  kind: 'friends' | 'group';
  label: string;
  rawGroup?: RawSplitwiseGroup;
  memberCount: number | null;
  ticked: boolean;
  // An existing Divido Group already holds sw_-prefixed expenses under this
  // exact name — re-importing should update it, not duplicate it.
  alreadyImported: boolean;
  reuseGroupId?: string | number;
  // Set only when NOT alreadyImported: a different existing Divido group
  // happens to share this (normalized) name, so the user must resolve it.
  matchedExistingGroup?: Group;
  resolution: 'merge' | 'rename' | null;
  nameOverride: string;
}

interface ProcessedRow {
  key: string;
  kind: 'friends' | 'group';
  label: string;
  gId: string | number;
  group?: Group;
  expenses: Expense[];
  warnings: string[];
  review: (SplitwiseReviewItem & { gId: string | number })[];
  truncated: boolean;
  error?: string;
}

const normalizeName = (s: string): string => s.trim().toLowerCase();

function buildRows(
  exchangeGroups: SplitwiseGroupSummary[],
  existingGroups: Group[],
  existingExpenses: Expense[]
): RowState[] {
  const friendsAlreadyImported = existingExpenses.some(
    (e) => String(e.gId) === 'STANDALONE' && String(e.id).startsWith('sw_')
  );
  const friendsRow: RowState = {
    key: 'friends',
    kind: 'friends',
    label: 'Friends (non-group expenses)',
    memberCount: null,
    ticked: !friendsAlreadyImported,
    alreadyImported: friendsAlreadyImported,
    resolution: null,
    nameOverride: '',
  };

  const groupRows: RowState[] = exchangeGroups.map((g) => {
    const name = g.name || 'Untitled group';
    const matched = existingGroups.find(
      (eg) => String(eg.id) !== 'STANDALONE' && normalizeName(eg.name) === normalizeName(name)
    );
    const alreadyImported =
      !!matched &&
      existingExpenses.some((e) => String(e.gId) === String(matched.id) && String(e.id).startsWith('sw_'));
    const membersField = (g as { members?: unknown }).members;
    const rawMembers: RawSplitwiseUser[] = Array.isArray(membersField)
      ? (membersField as unknown as RawSplitwiseUser[])
      : [];
    return {
      key: String(g.id),
      kind: 'group' as const,
      label: name,
      rawGroup: { id: g.id, name, members: rawMembers },
      memberCount: rawMembers.length || null,
      ticked: !alreadyImported,
      alreadyImported,
      reuseGroupId: alreadyImported ? matched!.id : undefined,
      matchedExistingGroup: !alreadyImported && matched ? matched : undefined,
      resolution: null,
      nameOverride: `${name} (Splitwise)`,
    };
  });

  return [friendsRow, ...groupRows];
}

// True while the row's collision is still unresolved: ticked, not already
// imported, its name matches an existing Divido group, and either no choice
// has been made yet or the chosen rename still collides with another group.
function isRowUnresolved(row: RowState, existingGroups: Group[]): boolean {
  if (!row.ticked || row.alreadyImported || !row.matchedExistingGroup) return false;
  if (!row.resolution) return true;
  if (row.resolution === 'rename') {
    const trimmed = row.nameOverride.trim();
    if (!trimmed) return true;
    return existingGroups.some((g) => normalizeName(g.name) === normalizeName(trimmed));
  }
  return false;
}

function describeOAuthError(reason: string): { title: string; body: string } {
  const r = reason.toLowerCase();
  if (r.includes('denied')) {
    return { title: 'Connection cancelled', body: 'You declined to connect Splitwise, so nothing was imported.' };
  }
  if (r.includes('expire')) {
    return { title: 'That link expired', body: 'The Splitwise sign-in link expired before it was completed.' };
  }
  if (r.includes('mismatch') || r.includes('missing') || r.includes('state')) {
    return {
      title: 'Connection could not be verified',
      body: 'The sign-in response could not be verified. This can happen if the link was opened somewhere else.',
    };
  }
  return { title: 'Could not connect to Splitwise', body: reason };
}

const Spinner: React.FC = () => (
  <div
    style={{
      width: '44px', height: '44px', borderRadius: '50%',
      border: '4px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#6366F1',
      animation: 'sw-import-spin 0.8s linear infinite', margin: '0 auto',
    }}
  />
);

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#94A3B8', marginBottom: '6px',
};

const ctaButtonBaseStyle: React.CSSProperties = {
  background: '#F97316', color: '#FFFFFF', border: 'none', padding: '14px 22px', borderRadius: '14px',
  fontWeight: 700, fontSize: '14px', width: '100%',
};

const NATIVE_CONNECT_TIMEOUT_MS = 3 * 60 * 1000;

export const SplitwiseImportModal: React.FC<SplitwiseImportModalProps> = ({
  open,
  onClose,
  oauthCode,
  oauthError,
  groups,
  expenses,
  me,
  myEmail,
  onCommit,
  onReviewItemTap,
}) => {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('connecting');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [exchangeResult, setExchangeResult] = useState<SplitwiseExchangeResult | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [multiPayer, setMultiPayer] = useState<'split' | 'review'>('split');
  const [importIndex, setImportIndex] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importingLabel, setImportingLabel] = useState('');
  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [retryingKeys, setRetryingKeys] = useState<Record<string, boolean>>({});
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  const processedCodeRef = useRef<string | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const committedRef = useRef(false);
  const tickedRowsRef = useRef<RowState[]>([]);

  const clearConnectTimeout = () => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };

  // Reset everything (including dropping the access token) whenever the sheet
  // is closed, so a re-open always starts a fresh flow.
  useEffect(() => {
    if (open) return;
    processedCodeRef.current = null;
    committedRef.current = false;
    tickedRowsRef.current = [];
    clearConnectTimeout();
    setStep('connecting');
    setConnectError(null);
    setTimedOut(false);
    setExchangeError(null);
    setExchangeResult(null);
    setRows([]);
    setMultiPayer('split');
    setImportIndex(0);
    setImportTotal(0);
    setImportingLabel('');
    setProcessedRows([]);
    setRetryingKeys({});
    setWarningsExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => sheetRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => () => clearConnectTimeout(), []);

  useEffect(() => {
    if (oauthCode || oauthError) {
      clearConnectTimeout();
      setTimedOut(false);
    }
  }, [oauthCode, oauthError]);

  // Register with escManager everywhere except the "importing" step (Esc is
  // disabled while a sequential import is running).
  useEffect(() => {
    if (!open || step === 'importing') return;
    return escManager.register(onClose);
  }, [open, step, onClose]);

  // Exchange the OAuth code exactly once. Guarded by a ref (not effect
  // cleanup) so React StrictMode's dev-only double-invoke doesn't fire a
  // second, single-use code exchange.
  useEffect(() => {
    if (!open) return;
    if (!oauthCode || oauthError) return;
    if (processedCodeRef.current === oauthCode) return;
    processedCodeRef.current = oauthCode;
    clearConnectTimeout();
    setTimedOut(false);
    setExchangeError(null);
    exchangeCode(oauthCode)
      .then((result) => {
        setExchangeResult(result);
        setRows(buildRows(result.groups, groups, expenses));
        setStep('picking');
      })
      .catch((err: unknown) => {
        setExchangeError(err instanceof Error ? err.message : 'Failed to connect to Splitwise.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, oauthCode, oauthError]);

  const handleConnect = async () => {
    setConnectError(null);
    setTimedOut(false);
    try {
      await startSplitwiseAuth();
    } catch (err) {
      setConnectError(
        err instanceof SplitwiseConfigError
          ? 'Splitwise import isn’t available yet — check back soon.'
          : err instanceof Error ? err.message : 'Could not start Splitwise sign-in.',
      );
      return;
    }
    clearConnectTimeout();
    connectTimeoutRef.current = window.setTimeout(() => setTimedOut(true), NATIVE_CONNECT_TIMEOUT_MS);
  };

  const toggleRow = (key: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ticked: !r.ticked } : r)));
  };
  const setRowResolution = (key: string, resolution: 'merge' | 'rename') => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, resolution } : r)));
  };
  const setRowNameOverride = (key: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, nameOverride: value } : r)));
  };

  async function processRow(
    row: RowState,
    accessToken: string,
    currentUserId: number,
    multiPayerMode: 'split' | 'review'
  ): Promise<ProcessedRow> {
    try {
      const fetched = row.kind === 'friends'
        ? await fetchFriendExpenses(accessToken)
        : await fetchGroupExpenses(accessToken, row.rawGroup!.id);

      const existingGroupId = row.alreadyImported
        ? row.reuseGroupId
        : row.resolution === 'merge'
          ? row.matchedExistingGroup?.id
          : undefined;
      const nameOverride = !row.alreadyImported && row.resolution === 'rename'
        ? row.nameOverride.trim()
        : undefined;

      const mapped = mapSplitwiseImport({
        target: row.kind === 'friends' ? { kind: 'friends' } : { kind: 'group', rawGroup: row.rawGroup! },
        rawExpenses: fetched.expenses as unknown as RawSplitwiseExpense[],
        currentUserId,
        meName: me,
        myEmail,
        multiPayer: multiPayerMode,
        existingGroupId,
        nameOverride,
      });

      const gId = mapped.group ? mapped.group.id : 'STANDALONE';
      return {
        key: row.key,
        kind: row.kind,
        label: row.label,
        gId,
        group: mapped.group,
        expenses: mapped.expenses,
        warnings: mapped.warnings,
        review: mapped.review.map((item) => ({ ...item, gId })),
        truncated: fetched.truncated,
      };
    } catch (err) {
      return {
        key: row.key,
        kind: row.kind,
        label: row.label,
        gId: row.alreadyImported ? (row.reuseGroupId ?? 'STANDALONE') : 'STANDALONE',
        group: undefined,
        expenses: [],
        warnings: [],
        review: [],
        truncated: false,
        error: err instanceof Error ? err.message : 'Import failed.',
      };
    }
  }

  async function runImport(ticked: RowState[], accessToken: string, currentUserId: number, multiPayerMode: 'split' | 'review') {
    for (let i = 0; i < ticked.length; i++) {
      setImportIndex(i);
      setImportingLabel(ticked[i].label);
      const result = await processRow(ticked[i], accessToken, currentUserId, multiPayerMode);
      setProcessedRows((prev) => [...prev, result]);
    }
    setStep('summary');
  }

  const handleStartImport = () => {
    if (!exchangeResult) return;
    const ticked = rows.filter((r) => r.ticked);
    tickedRowsRef.current = ticked;
    setProcessedRows([]);
    setImportIndex(0);
    setImportTotal(ticked.length);
    setStep('importing');
    void runImport(ticked, exchangeResult.accessToken, exchangeResult.currentUser.id, multiPayer);
  };

  const retryRow = async (key: string) => {
    if (!exchangeResult) return;
    const row = tickedRowsRef.current.find((r) => r.key === key);
    if (!row) return;
    setRetryingKeys((prev) => ({ ...prev, [key]: true }));
    const result = await processRow(row, exchangeResult.accessToken, exchangeResult.currentUser.id, multiPayer);
    setProcessedRows((prev) => prev.map((r) => (r.key === key ? result : r)));
    setRetryingKeys((prev) => ({ ...prev, [key]: false }));
  };

  const commitIfNeeded = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const newGroups = processedRows.map((r) => r.group).filter((g): g is Group => !!g);
    const allExpenses = processedRows.flatMap((r) => r.expenses);
    onCommit({ groups: newGroups, expenses: allExpenses });
  };

  const handleDone = () => {
    commitIfNeeded();
    onClose();
  };

  const handleReviewTap = (item: SplitwiseReviewItem & { gId: string | number }) => {
    commitIfNeeded();
    onReviewItemTap?.(String(item.id), item.gId);
    onClose();
  };

  if (!open) return null;

  const selectedCount = rows.filter((r) => r.ticked).length;
  const anyUnresolved = rows.some((r) => isRowUnresolved(r, groups));
  const ctaDisabled = selectedCount === 0 || anyUnresolved;

  const successRows = processedRows.filter((r) => !r.error);
  const failedRows = processedRows.filter((r) => !!r.error);
  const groupsCount = successRows.filter((r) => r.kind === 'group').length;
  const friendExpensesCount = successRows.find((r) => r.kind === 'friends')?.expenses.length || 0;
  const expensesCount = successRows.reduce((a, r) => a + r.expenses.length, 0);
  const reviewItems = successRows.flatMap((r) => r.review);
  const warnings = successRows.flatMap((r) => r.warnings);
  const anyTruncated = successRows.some((r) => r.truncated);
  const friendsProcessed = successRows.some((r) => r.kind === 'friends');

  const countParts: string[] = [];
  if (groupsCount > 0) countParts.push(`${groupsCount} group${groupsCount === 1 ? '' : 's'}`);
  if (friendExpensesCount > 0) countParts.push(`${friendExpensesCount} friend expense${friendExpensesCount === 1 ? '' : 's'}`);
  if (expensesCount > 0) countParts.push(`${expensesCount} expense${expensesCount === 1 ? '' : 's'}`);
  if (reviewItems.length > 0) countParts.push(`${reviewItems.length} to review`);
  if (warnings.length > 0) countParts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  const countsLine = countParts.join(' · ');

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10001,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={step === 'importing' ? undefined : onClose}
    >
      <style>{'@keyframes sw-import-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '480px', background: '#FFFFFF', borderRadius: '24px 24px 0 0',
          padding: '14px 18px calc(20px + env(safe-area-inset-bottom))', boxSizing: 'border-box',
          maxHeight: '88vh', overflowY: 'auto', outline: 'none', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: '#E2E8F0', margin: '0 auto 14px', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexShrink: 0 }}>
          <h3 id={titleId} style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#1E293B' }}>Import from Splitwise</h3>
          <button
            onClick={onClose}
            disabled={step === 'importing'}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', fontSize: '18px', color: '#94A3B8', padding: '4px',
              cursor: step === 'importing' ? 'default' : 'pointer', opacity: step === 'importing' ? 0.4 : 1,
            }}
          >
            ✕
          </button>
        </div>

        {step === 'connecting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px', padding: '28px 8px 8px' }}>
            {timedOut ? (
              <>
                <div style={{ fontSize: '40px' }}>⚠️</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>Still waiting on Splitwise</div>
                <div style={{ fontSize: '13px', color: '#64748B', maxWidth: '320px' }}>
                  We didn't hear back within a few minutes. If you finished signing in, try again.
                </div>
                <button onClick={handleConnect} style={ctaButtonBaseStyle}>Start again</button>
              </>
            ) : oauthError ? (
              (() => {
                const { title, body } = describeOAuthError(oauthError);
                return (
                  <>
                    <div style={{ fontSize: '40px' }}>⚠️</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>{title}</div>
                    <div style={{ fontSize: '13px', color: '#64748B', maxWidth: '320px' }}>{body}</div>
                    <button onClick={handleConnect} style={ctaButtonBaseStyle}>Start again</button>
                  </>
                );
              })()
            ) : exchangeError ? (
              <>
                <div style={{ fontSize: '40px' }}>⚠️</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>Could not connect to Splitwise</div>
                <div style={{ fontSize: '13px', color: '#64748B', maxWidth: '320px' }}>{exchangeError}</div>
                <button onClick={handleConnect} style={ctaButtonBaseStyle}>Start again</button>
              </>
            ) : oauthCode ? (
              <>
                <Spinner />
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>Connecting to Splitwise…</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '40px' }}>🔗</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>Connect your Splitwise account</div>
                <div style={{ fontSize: '13px', color: '#64748B', maxWidth: '320px' }}>
                  Bring your Splitwise groups and expenses into Divido. You choose exactly what gets imported.
                </div>
                <button onClick={handleConnect} style={ctaButtonBaseStyle}>Connect to Splitwise</button>
                {connectError && <div style={{ fontSize: '12px', color: '#EF4444', fontWeight: 600 }}>{connectError}</div>}
              </>
            )}
          </div>
        )}

        {step === 'picking' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '8px' }}>
              {rows.map((row) => {
                const collision = row.ticked && !row.alreadyImported && !!row.matchedExistingGroup;
                const overrideTrimmed = row.nameOverride.trim();
                const overrideCollides = collision && row.resolution === 'rename' && (
                  !overrideTrimmed || groups.some((g) => normalizeName(g.name) === normalizeName(overrideTrimmed))
                );
                const unresolved = isRowUnresolved(row, groups);
                const hintId = `sw-collision-hint-${row.key}`;

                return (
                  <div
                    key={row.key}
                    style={{
                      border: unresolved ? '1.5px solid #EF4444' : '1.5px solid #F1F5F9',
                      borderRadius: '14px', background: '#FFFFFF',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', padding: '10px 12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={row.ticked}
                        onChange={() => toggleRow(row.key)}
                        style={{ width: '20px', height: '20px', accentColor: '#F97316', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.label}
                          </span>
                          {row.alreadyImported && (
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#B45309', background: '#FEF3C7', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 }}>
                              Already imported
                            </span>
                          )}
                          {row.memberCount != null && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 }}>
                              {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        {row.kind === 'friends' && (
                          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
                            Stays private to you — not shared with your friend.
                          </div>
                        )}
                      </div>
                    </label>

                    {collision && (
                      <div style={{ padding: '0 12px 12px 44px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div id={hintId} style={{ fontSize: '11.5px', color: '#B91C1C', fontWeight: 600 }}>
                          A group named "{row.matchedExistingGroup!.name}" already exists — choose what to do.
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', cursor: 'pointer' }} aria-describedby={hintId}>
                          <input
                            type="radio"
                            name={`sw-resolve-${row.key}`}
                            checked={row.resolution === 'merge'}
                            onChange={() => setRowResolution(row.key, 'merge')}
                            style={{ width: '18px', height: '18px', accentColor: '#F97316' }}
                          />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                            Merge into existing "{row.matchedExistingGroup!.name}"
                          </span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', cursor: 'pointer' }} aria-describedby={hintId}>
                          <input
                            type="radio"
                            name={`sw-resolve-${row.key}`}
                            checked={row.resolution === 'rename'}
                            onChange={() => setRowResolution(row.key, 'rename')}
                            style={{ width: '18px', height: '18px', accentColor: '#F97316' }}
                          />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>Import as new, renamed</span>
                        </label>
                        {row.resolution === 'rename' && (
                          <>
                            <input
                              type="text"
                              value={row.nameOverride}
                              onChange={(e) => setRowNameOverride(row.key, e.target.value)}
                              aria-describedby={overrideCollides ? hintId : undefined}
                              style={{
                                height: '40px', borderRadius: '10px',
                                border: overrideCollides ? '1.5px solid #EF4444' : '1.5px solid #E2E8F0',
                                padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none',
                              }}
                            />
                            {overrideCollides && (
                              <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>
                                That name is already used — pick another.
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ marginTop: '4px' }}>
                <div style={sectionLabelStyle}>Multiple payers</div>
                <div role="radiogroup" aria-label="Multiple payers" style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '999px', background: '#F1F5F9' }}>
                  {(['split', 'review'] as const).map((mode) => {
                    const active = multiPayer === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMultiPayer(mode)}
                        style={{
                          flex: 1, padding: '9px 4px', borderRadius: '999px', border: 'none',
                          background: active ? '#1E293B' : 'transparent', color: active ? '#FFFFFF' : '#475569',
                          fontSize: '13px', fontWeight: active ? 700 : 600, cursor: 'pointer',
                        }}
                      >
                        {mode === 'split' ? 'Split automatically' : 'Flag for review'}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '6px' }}>
                  {multiPayer === 'split'
                    ? 'Expenses paid by several people become one expense per payer, with shares kept exact.'
                    : 'Imported as one expense under the biggest payer and listed for you to check.'}
                </div>
              </div>
            </div>

            <div style={{ position: 'sticky', bottom: '-1px', background: '#FFFFFF', borderTop: '1px solid #F1F5F9', margin: '8px -18px 0', padding: '12px 18px 0', flexShrink: 0 }}>
              <button onClick={handleStartImport} disabled={ctaDisabled} style={{ ...ctaButtonBaseStyle, opacity: ctaDisabled ? 0.45 : 1, cursor: ctaDisabled ? 'default' : 'pointer' }}>
                Import {selectedCount} selected
              </button>
            </div>
          </>
        )}

        {step === 'importing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '28px 8px 8px' }}>
            <Spinner />
            <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>
              Importing… {Math.min(importIndex + 1, importTotal)} of {importTotal}
            </div>
            <div style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748B' }}>
              {importingLabel}
            </div>
            <div
              role="progressbar"
              aria-valuenow={processedRows.length}
              aria-valuemin={0}
              aria-valuemax={importTotal}
              style={{ width: '100%', height: '12px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${importTotal ? (processedRows.length / importTotal) * 100 : 0}%`,
                  height: '100%', background: 'linear-gradient(90deg, #10B981, #34D399)', transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        )}

        {step === 'summary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {countsLine && <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{countsLine}</div>}

            {reviewItems.length > 0 && (
              <div>
                <div style={sectionLabelStyle}>Needs review</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {reviewItems.map((item) => (
                    <button
                      key={`${item.gId}-${item.id}`}
                      onClick={() => handleReviewTap(item)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: '#FFFFFF', border: '1.5px solid #F1F5F9', borderRadius: '12px', padding: '10px 12px', cursor: 'pointer', minHeight: '44px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', flexShrink: 0 }}>{item.currency}{formatExactAmount(item.amount)}</span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
                        {item.date} · {item.payers.map((p) => `${p.name} ${item.currency}${formatExactAmount(p.amount)}`).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {warnings.length > 0 && (
              <div>
                <div style={sectionLabelStyle}>Warnings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(warningsExpanded ? warnings : warnings.slice(0, 4)).map((w, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#B45309' }}>{w}</div>
                  ))}
                </div>
                {warnings.length > 4 && (
                  <button
                    onClick={() => setWarningsExpanded((v) => !v)}
                    style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: '4px 0', marginTop: '4px' }}
                  >
                    {warningsExpanded ? 'Show less' : `Show all ${warnings.length}`}
                  </button>
                )}
              </div>
            )}

            {failedRows.length > 0 && (
              <div>
                <div style={sectionLabelStyle}>Couldn't import</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {failedRows.map((r) => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid #FEE2E2', background: '#FEF2F2' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                        <div style={{ fontSize: '11.5px', color: '#B91C1C' }}>{r.error}</div>
                      </div>
                      <button
                        onClick={() => retryRow(r.key)}
                        disabled={!!retryingKeys[r.key]}
                        style={{ background: '#FFFFFF', border: '1.5px solid #EF4444', color: '#EF4444', fontSize: '12px', fontWeight: 700, borderRadius: '999px', padding: '8px 14px', cursor: 'pointer', flexShrink: 0, minHeight: '36px' }}
                      >
                        {retryingKeys[r.key] ? 'Retrying…' : 'Retry'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {anyTruncated && (
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                Some expenses may not have been fetched — Splitwise returned more than we could page through.
              </div>
            )}
            {friendsProcessed && (
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>Friend expenses stay private to your account.</div>
            )}

            <button onClick={handleDone} style={ctaButtonBaseStyle}>Done</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
