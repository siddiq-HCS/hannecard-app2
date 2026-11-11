import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, KeyRound, Plus, Search, Users, X } from 'lucide-react';
import { api, authHeaders, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { toast } from '../components/Toast';

interface Salesperson {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string | null;
  phone: string;
  isActive: boolean;
  createdAt: string;
  assignedSalesperson: Salesperson | null;
}

export function Customers() {
  const { token } = useAuth();
  const { t, lang } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordCustomer, setPasswordCustomer] = useState<Customer | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [assignedSalespersonId, setAssignedSalespersonId] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [customerResponse, salespersonResponse] = await Promise.all([
        api.get('/manager/customers', authHeaders(token)),
        api.get('/manager/customers/salespeople', authHeaders(token)),
      ]);
      setCustomers(customerResponse.data as Customer[]);
      setSalespeople(salespersonResponse.data as Salesperson[]);
    } catch (error) {
      toast.error(apiErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => [customer.companyName, customer.contactPerson, customer.email ?? '', customer.phone]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [customers, search]);

  function resetForm() {
    setCompanyName('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setPassword('');
    setAssignedSalespersonId('');
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || saving) return;
    setSaving(true);
    try {
      await api.post('/manager/customers', {
        companyName,
        contactPerson,
        email,
        phone,
        password,
        assignedSalespersonId,
      }, authHeaders(token));
      setShowCreate(false);
      resetForm();
      await load();
      toast.success(t('customers.created'));
    } catch (error) {
      toast.error(apiErrorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  async function updateCustomerPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !passwordCustomer || saving) return;
    if (newPassword.length < 6) {
      toast.error(t('customers.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('customers.passwordMismatch'));
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/manager/customers/${encodeURIComponent(passwordCustomer.id)}/password`, { password: newPassword }, authHeaders(token));
      setPasswordCustomer(null);
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('customers.passwordUpdated'));
    } catch (error) {
      toast.error(apiErrorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('customers.title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('customers.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
        >
          <Plus size={17} />{t('customers.add')}
        </button>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-700/70 bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/70 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Users size={17} className="text-amber-400" />
            <span>{filteredCustomers.length}</span>
          </div>
          <label className="flex min-w-[240px] items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-400 focus-within:border-amber-500">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('customers.search')}
              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-start text-sm">
            <thead className="bg-slate-800/70 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('customers.company')}</th>
                <th className="px-4 py-3 font-semibold">{t('customers.contact')}</th>
                <th className="px-4 py-3 font-semibold">{t('customers.phone')}</th>
                <th className="px-4 py-3 font-semibold">{t('customers.assigned')}</th>
                <th className="px-4 py-3 font-semibold">{t('customers.status')}</th>
                <th className="px-4 py-3 text-end font-semibold">{t('customers.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('customers.loading')}</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('customers.empty')}</td></tr>
              ) : filteredCustomers.map((customer) => (
                <tr key={customer.id} className="text-slate-200 hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-800 text-amber-400"><Building2 size={16} /></span>
                      <div>
                        <div className="font-medium">{customer.companyName}</div>
                        {customer.email && <div className="mt-0.5 text-xs text-slate-500">{customer.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{customer.contactPerson}</td>
                  <td className="px-4 py-3" dir="ltr">{customer.phone}</td>
                  <td className="px-4 py-3">{customer.assignedSalesperson?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${customer.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                      {customer.isActive ? t('customers.active') : t('customers.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordCustomer(customer);
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                      title={t('customers.changePassword')}
                      aria-label={`${t('customers.changePassword')}: ${customer.companyName}`}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-amber-500 hover:text-amber-300"
                    >
                      <KeyRound size={14} />
                      <span className="hidden sm:inline">{t('customers.changePassword')}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowCreate(false); }}>
          <section className="my-auto w-full max-w-xl rounded-lg border border-slate-700 bg-slate-900 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <h2 id="customer-modal-title" className="text-lg font-semibold text-white">{t('customers.add')}</h2>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => setShowCreate(false)} aria-label={t('customers.close')} disabled={saving}>
                <X size={19} />
              </button>
            </div>
            <form onSubmit={(event) => void createCustomer(event)} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('customers.companyName')}>
                  <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required maxLength={200} autoFocus className={fieldClass} />
                </Field>
                <Field label={t('customers.contactPerson')}>
                  <input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} required maxLength={120} className={fieldClass} />
                </Field>
                <Field label={t('customers.email')}>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className={fieldClass} />
                </Field>
                <Field label={t('customers.phone')}>
                  <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={6} maxLength={30} className={fieldClass} dir="ltr" />
                </Field>
                <Field label={t('customers.password')}>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="new-password" className={fieldClass} />
                </Field>
                <Field label={t('customers.salesperson')}>
                  <select value={assignedSalespersonId} onChange={(event) => setAssignedSalespersonId(event.target.value)} required className={fieldClass}>
                    <option value="">{salespeople.length ? t('customers.selectSalesperson') : t('customers.noSalespeople')}</option>
                    {salespeople.map((salesperson) => <option key={salesperson.id} value={salesperson.id}>{salesperson.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
                <button type="button" onClick={() => setShowCreate(false)} disabled={saving} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">{t('customers.cancel')}</button>
                <button type="submit" disabled={saving || salespeople.length === 0} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">{t('customers.save')}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {passwordCustomer && (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-slate-950/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPasswordCustomer(null); }}>
          <section className="my-auto w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="customer-password-title" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <h2 id="customer-password-title" className="text-lg font-semibold text-white">{t('customers.changePassword')}</h2>
                <p className="mt-1 text-sm text-slate-400">{passwordCustomer.companyName}</p>
              </div>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => setPasswordCustomer(null)} aria-label={t('customers.close')} disabled={saving}>
                <X size={19} />
              </button>
            </div>
            <form onSubmit={(event) => void updateCustomerPassword(event)} className="space-y-4 p-5">
              <Field label={t('customers.newPassword')}>
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} maxLength={200} required autoFocus autoComplete="new-password" className={fieldClass} />
              </Field>
              <Field label={t('customers.confirmPassword')}>
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} maxLength={200} required autoComplete="new-password" className={fieldClass} />
              </Field>
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
                <button type="button" onClick={() => setPasswordCustomer(null)} disabled={saving} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">{t('customers.cancel')}</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"><KeyRound size={15} />{t('customers.updatePassword')}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

const fieldClass = 'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium text-slate-300">{label}{children}</label>;
}