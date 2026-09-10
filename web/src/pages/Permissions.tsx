import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

interface PageDef {
  key: string;
  labelKey: string;
  permission: string;
}

interface PermCellProps {
  role: string;
  page: PageDef;
  checked: boolean;
  disabled: boolean;
  onToggle: (role: string, permission: string) => void;
}

function PermCell({ role, page, checked, disabled, onToggle }: PermCellProps) {
  return (
    <label
      className={[
        'h-8 w-8 rounded-md flex items-center justify-center cursor-pointer transition',
        disabled
          ? 'bg-blue-600/15 text-blue-500 cursor-not-allowed'
          : checked
            ? 'bg-accent/90 text-white'
            : 'bg-[#ffffff12] hover:bg-[#ffffff22]',
      ].join(' ')}
      title={page.labelKey}
    >
      {disabled || checked ? <Check strokeWidth={2.5} className="h-4 w-4" /> : null}
      <input
        type="checkbox"
        className="sr-only"
        checked={checked || disabled}
        disabled={disabled}
        onChange={() => onToggle(role, page.permission)}
      />
    </label>
  );
}

export function Permissions() {
  const { token, refresh } = useAuth();
  const { t } = useI18n();

  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [existing, setExisting] = useState<Record<string, string[]>>({});
  const [roleList, setRoles] = useState<string[]>([]);
  const [pagesMap, setPagesMap] = useState<Record<string, PageDef>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setErrMsg('');
    setLoading(true);

    try {
      const res = await api.get<{ pages?: PageDef[]; roles?: string[]; rolePermissions?: Record<string, string[]> }>(
        '/permissions',
        authHeaders(token),
      );
      const pages = Array.isArray(res.data?.pages) ? res.data.pages : [];
      const roles = Array.isArray(res.data?.roles) ? res.data.roles : [];
      const rolePermissions =
        res.data?.rolePermissions && typeof res.data.rolePermissions === 'object' && !Array.isArray(res.data.rolePermissions)
          ? res.data.rolePermissions
          : {};
      setPagesMap(
        pages.reduce((acc, p) => {
          if (p && typeof p.permission === 'string') acc[p.permission] = p;
          return acc;
        }, {} as Record<string, PageDef>),
      );
      setRoles(roles);
      setDraft(rolePermissions);
      setExisting(rolePermissions);
      if (pages.length === 0) setErrMsg(t('permsPage.noData'));
    } catch {
      setErrMsg(t('permsPage.loadError'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = (role: string) => {
    const list = draft[role] ?? [];
    return { restricted: list.length > 0, count: list.length, total: Object.keys(pagesMap).length };
  };

  async function saveAll() {
    if (!token || busy) return;
    setBusy(true);
    setErrMsg('');
    setOkMsg('');

    try {
      for (const role of roleList) {
        const permissions = draft[role] ?? [];
        await api.put('/permissions', { role, permissions }, authHeaders(token));
      }
      setOkMsg(t('permsPage.saved'));
      await load();
      await refresh();
    } catch {
      setErrMsg(t('permsPage.saveError'));
    } finally {
      setBusy(false);
    }
  }

  function toggle(role: string, permission: string) {
    setDraft((d) => {
      const list = d[role] ?? [];
      const next = list.includes(permission) ? list.filter((p) => p !== permission) : [...list, permission];
      return { ...d, [role]: next };
    });
  }

  const changed = roleList.some(
    (r) => JSON.stringify([...(draft[r] ?? [])].sort()) !== JSON.stringify([...(existing[r] ?? [])].sort()),
  );

  return (
    <div className="min-h-screen">
      <h2>{t('permsPage.title')}</h2>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20, maxWidth: 860 }}>{t('permsPage.subtitle')}</div>

      <div className="max-w-[100rem] px-4">
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="bg-[#ffffff0d] border-b border-[#f8fafc14]">
                  <th className="py-3 px-4 text-right font-semibold text-secondary whitespace-nowrap">
                    {t('permsPage.page')}
                  </th>
                  {(roleList ?? []).map((role) => {
                    const st = status(role);
                    return (
                      <th key={role} className="py-3 px-4 text-center font-semibold text-secondary whitespace-nowrap">
                        <div>{t(`permsPage.roleNames.${role}`)}</div>
                        <div
                          className={[
                            'text-[0.68rem] rounded-full px-2 py-0.5 inline-block mt-1',
                            st.restricted ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400',
                          ].join(' ')}
                        >
                          {st.restricted ? `${st.count}/${st.total}` : t('permsPage.fullDefault')}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Object.values(pagesMap).map((page) => (
                  <tr key={page.permission} className="border-b border-[#f8fafc0d] hover:bg-[#ffffff05]">
                    <td className="py-2.5 px-4 text-secondary">{t(page.labelKey)}</td>
                    {(roleList ?? []).map((role) => {
                      const disabled = role.toUpperCase() === 'DEVELOPER';
                      return (
                        <td key={role} className="py-2.5 px-4 text-center">
                          <PermCell
                            role={role}
                            page={page}
                            disabled={disabled}
                            checked={(draft[role] ?? []).includes(page.permission)}
                            onToggle={toggle}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 px-4 py-4 bg-[#ffffff08]">
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={busy || loading || !changed}
              className={['btn-grad inline-flex items-center gap-2', busy || loading || !changed ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}
            >
              {busy || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {busy ? t('permsPage.saving') : loading ? t('permsPage.loading') : t('permsPage.save')}
            </button>
            {errMsg && <span className="text-rose-400 text-sm">{errMsg}</span>}
            {okMsg && (
              <span className="text-emerald-400 text-sm inline-flex items-center gap-1">
                <Check className="h-4 w-4" /> {okMsg}
              </span>
            )}
          </div>

          <div className="px-4 pb-4 -mt-2 text-[0.72rem] text-tertiary">
            {t('permsPage.fullDefault')} — {t('permsPage.developerAlways')}
          </div>
        </div>
      </div>
    </div>
  );
}