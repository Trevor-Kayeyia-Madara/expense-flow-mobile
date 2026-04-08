export type AuthUser = {
  id: string;
  email: string;
  companyId: string;
  role: "super_admin" | "company_admin" | "sales" | "director" | "finance" | string;
};

export type LoginResponse = {
  token: string;
  refreshToken: string;
  user: AuthUser;
};

export type MeResponse = { userId: string; companyId: string; role: string; email: string };

export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "verified" | "posted";

export type CompanyMe = {
  id: string;
  name: string;
  domain: string;
  defaultDirectorId: string | null;
  createdAt: string;
};

export type ApprovalTokenView = {
  token: string;
  companyId: string;
  expenseId: string;
  approverEmail: string;
  submittedByEmail: string;
  amountCents: number;
  currency: string;
  description: string;
  status: ExpenseStatus | string;
  expiresAt: string;
  usedAt: string | null;
};

export type ExpenseListItem = {
  id: string;
  userId: string;
  submittedBy: string;
  amountCents: number;
  currency: string;
  category: string | null;
  description: string;
  status: ExpenseStatus | string;
  currentApproverId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceListItem = ExpenseListItem;

export type ExpenseReceipt = {
  id: string;
  fileKey: string;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type ExpenseApproval = {
  id: string;
  decision: "approved" | "rejected" | string;
  comment: string | null;
  approverEmail: string;
  createdAt: string;
};

export type ExpenseDetails = ExpenseListItem & {
  receipts: ExpenseReceipt[];
  approvals: ExpenseApproval[];
  submittedAt: string | null;
  decidedAt: string | null;
  verifiedAt: string | null;
  postedAt: string | null;
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private getAccessToken: () => string | null,
    private getRefreshToken: () => string | null,
    private setTokens: (accessToken: string, refreshToken: string) => void,
    private clearTokens: () => void
  ) {}

  private headers(extra?: Record<string, string>) {
    const headers: Record<string, string> = { ...(extra ?? {}) };
    const token = this.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private async request(path: string, init: RequestInit & { retry?: boolean } = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (res.status !== 401 || init.retry === false) return res;

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return res;

    // Try refresh once, then retry original request.
    const refreshed = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ refreshToken }),
      // prevent loops
      ...(init.signal ? { signal: init.signal } : {})
    });
    if (!refreshed.ok) {
      this.clearTokens();
      return res;
    }

    const data = (await refreshed.json()) as { token: string; refreshToken: string };
    this.setTokens(data.token, data.refreshToken);

    const retryInit: RequestInit = {
      ...init,
      headers: this.headers(init.headers as any)
    };
    return fetch(`${this.baseUrl}${path}`, { ...retryInit, retry: false } as any);
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as LoginResponse;
  }

  async me(): Promise<MeResponse> {
    const res = await this.request(`/auth/me`, { method: "GET", headers: this.headers() });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as MeResponse;
  }

  async logout() {
    const refreshToken = this.getRefreshToken();
    this.clearTokens();
    if (!refreshToken) return { ok: true };
    const res = await fetch(`${this.baseUrl}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }

  async createExpense(input: {
    amount: number;
    currency?: string;
    category?: string;
    description: string;
    receipt: File;
  }) {
    const form = new FormData();
    form.set("amount", String(input.amount));
    form.set("description", input.description);
    if (input.currency) form.set("currency", input.currency);
    if (input.category) form.set("category", input.category);
    form.set("receipt", input.receipt);

    const res = await this.request(`/expenses`, {
      method: "POST",
      headers: this.headers(),
      body: form
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { id: string; status: ExpenseStatus };
  }

  async submitExpense(expenseId: string) {
    const res = await this.request(`/expenses/${expenseId}/submit`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as {
      ok: true;
      status: ExpenseStatus;
      directorEmail: string;
      emailed: boolean;
      mailProvider?: string;
      mailId?: string;
    };
  }

  async listExpenses(params?: { status?: ExpenseStatus; mine?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.mine !== undefined) qs.set("mine", params.mine ? "true" : "false");
    const res = await this.request(`/expenses${qs.toString() ? `?${qs}` : ""}`, {
      method: "GET",
      headers: this.headers()
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { items: ExpenseListItem[] };
  }

  async getExpense(expenseId: string): Promise<ExpenseDetails> {
    const res = await this.request(`/expenses/${expenseId}`, { method: "GET", headers: this.headers() });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as ExpenseDetails;
  }

  async downloadReceipt(receiptId: string): Promise<Blob> {
    const res = await this.request(`/expenses/receipts/${receiptId}/file`, { method: "GET", headers: this.headers() });
    if (!res.ok) throw new Error(await safeText(res));
    return await res.blob();
  }

  async financeList(status?: "approved" | "verified" | "posted") {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    const res = await this.request(`/finance/expenses${qs.toString() ? `?${qs}` : ""}`, {
      method: "GET",
      headers: this.headers()
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { items: FinanceListItem[] };
  }

  async financeVerify(expenseId: string) {
    const res = await this.request(`/finance/expenses/${expenseId}/verify`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }

  async financePost(expenseId: string) {
    const res = await this.request(`/finance/expenses/${expenseId}/post`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }

  async financeExportCsv(status?: "approved" | "verified" | "posted"): Promise<Blob> {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    const res = await this.request(`/finance/expenses.csv${qs.toString() ? `?${qs}` : ""}`, {
      method: "GET",
      headers: this.headers()
    });
    if (!res.ok) throw new Error(await safeText(res));
    return await res.blob();
  }

  async listUsers() {
    const res = await this.request(`/users`, { method: "GET", headers: this.headers() });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as {
      items: Array<{
        id: string;
        companyId: string;
        name: string | null;
        email: string;
        role: string;
        isActive: boolean;
        createdAt: string;
        updatedAt: string | null;
      }>;
    };
  }

  async createUser(input: {
    name?: string;
    email: string;
    password: string;
    role: string;
    isActive?: boolean;
    companyId?: string;
  }) {
    const res = await this.request(`/users`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { id: string };
  }

  async listCompanies() {
    const res = await this.request(`/companies`, { method: "GET", headers: this.headers() });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { items: Array<{ id: string; name: string; domain: string; createdAt: string }> };
  }

  async createCompany(input: { name: string; domain: string }) {
    const res = await this.request(`/companies`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { id: string };
  }

  async updateCompany(companyId: string, input: { name?: string; domain?: string }) {
    const res = await this.request(`/companies/${companyId}`, {
      method: "PATCH",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }

  async updateUser(
    userId: string,
    input: { name?: string | null; password?: string; role?: string; isActive?: boolean }
  ) {
    const res = await this.request(`/users/${userId}`, {
      method: "PATCH",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }

  async listNotifications(opts?: { unreadOnly?: boolean }) {
    const qs = new URLSearchParams();
    if (opts?.unreadOnly) qs.set("unread", "true");
    const res = await this.request(`/notifications${qs.toString() ? `?${qs}` : ""}`, {
      method: "GET",
      headers: this.headers()
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { items: NotificationItem[] };
  }

  async unreadNotificationsCount() {
    const res = await this.request(`/notifications/unread-count`, { method: "GET", headers: this.headers() });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { count: number };
  }

  async markNotificationRead(id: string) {
    const res = await this.request(`/notifications/${id}/read`, { method: "PATCH", headers: this.headers() });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }

  async companyMe(): Promise<CompanyMe> {
    const res = await this.request(`/companies/me`, { method: "GET", headers: this.headers() });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as CompanyMe;
  }

  async updateCompanyMe(input: { name?: string; domain?: string; defaultDirectorId?: string | null }) {
    const res = await this.request(`/companies/me`, {
      method: "PATCH",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(input)
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }

  async approvalTokenView(token: string): Promise<ApprovalTokenView> {
    const qs = new URLSearchParams({ token });
    const res = await fetch(`${this.baseUrl}/approval/token?${qs.toString()}`);
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as ApprovalTokenView;
  }

  async approvalApprove(token: string) {
    const res = await fetch(`${this.baseUrl}/approval/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }

  async approvalReject(token: string) {
    const res = await fetch(`${this.baseUrl}/approval/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    if (!res.ok) throw new Error(await safeText(res));
    return (await res.json()) as { ok: true };
  }
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return `HTTP ${res.status}`;
  }
}
