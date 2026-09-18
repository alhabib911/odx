import * as vscode from 'vscode';


export type AIProvider =
  | 'gemini'
  | 'groq';


export type APIStatus =
  | 'available'
  | 'warning'
  | 'cooldown'
  | 'limit'
  | 'error';


export interface APIKeyInfo {

  id: string;

  key: string;

  provider: AIProvider;

  status: APIStatus;

  usedTokens: number;

  requestCount: number;

  minuteStartedAt: number;

  cooldownUntil: number;

  lastError?: string;

  totalRequests: number;

  totalTokens: number;
}


export interface APIKeyDisplayInfo {

  id: string;

  provider: AIProvider;

  status: APIStatus;

  usedTokens: number;

  requestCount: number;

  cooldownRemaining: number;

  totalRequests: number;

  totalTokens: number;

  lastError?: string;
}


const DEFAULT_TPM_LIMIT =
  8000;


const WARNING_PERCENT =
  0.80;


const COOLDOWN_PERCENT =
  0.90;


const DEFAULT_COOLDOWN_MS =
  60 * 1000;


const STORAGE_KEY =
  'ai_api_pool';


export class APIManager {

  private keys: APIKeyInfo[] = [];

  private context:
    vscode.ExtensionContext;


  constructor(
    context: vscode.ExtensionContext
  ) {

    this.context =
      context;

    this.load();
  }


  // ==================================================
  // LOAD
  // ==================================================

  private load(): void {

    const saved =
      this.context.globalState.get<
        APIKeyInfo[]
      >(
        STORAGE_KEY
      );


    if (
      !Array.isArray(saved)
    ) {

      this.keys = [];

      return;
    }


    this.keys =
      saved.map(
        (item) => ({

          ...item,

          status:
            item.status ||
            'available',

          usedTokens:
            item.usedTokens ||
            0,

          requestCount:
            item.requestCount ||
            0,

          minuteStartedAt:
            item.minuteStartedAt ||
            Date.now(),

          cooldownUntil:
            item.cooldownUntil ||
            0,

          totalRequests:
            item.totalRequests ||
            0,

          totalTokens:
            item.totalTokens ||
            0

        })
      );
  }


  // ==================================================
  // SAVE
  // ==================================================

  private async save(): Promise<void> {

    await this.context.globalState.update(
      STORAGE_KEY,
      this.keys
    );
  }


  // ==================================================
  // DETECT PROVIDER
  // ==================================================

  detectProvider(
    key: string
  ): AIProvider | null {

    const cleanKey =
      key.trim();


    if (!cleanKey) {

      return null;
    }


    // Groq

    if (
      cleanKey.startsWith(
        'gsk_'
      )
    ) {

      return 'groq';
    }


    // Gemini / Google AI Studio

    if (
      cleanKey.startsWith(
        'AIza'
      )
    ) {

      return 'gemini';
    }


    return null;
  }


  // ==================================================
  // ADD KEY AUTO
  // ==================================================

  async addKeyAuto(
    key: string
  ): Promise<{
    id: string;
    provider: AIProvider;
  }> {

    const cleanKey =
      key.trim();


    if (!cleanKey) {

      throw new Error(
        'API Key empty.'
      );
    }


    const provider =
      this.detectProvider(
        cleanKey
      );


    if (!provider) {

      throw new Error(
        'API Key থেকে Groq অথবা Gemini provider শনাক্ত করা যায়নি।'
      );
    }


    const id =
      await this.addKey(
        provider,
        cleanKey
      );


    return {
      id,
      provider
    };
  }


  // ==================================================
  // ADD KEY
  // ==================================================

  async addKey(
    provider: AIProvider,
    key: string
  ): Promise<string> {

    const cleanKey =
      key.trim();


    if (!cleanKey) {

      throw new Error(
        'API Key empty.'
      );
    }


    const existing =
      this.keys.find(
        (item) =>
          item.provider ===
            provider &&
          item.key ===
            cleanKey
      );


    if (existing) {

      return existing.id;
    }


    const newKey:
      APIKeyInfo = {

      id:
        `${provider}-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}`,

      key:
        cleanKey,

      provider,

      status:
        'available',

      usedTokens:
        0,

      requestCount:
        0,

      minuteStartedAt:
        Date.now(),

      cooldownUntil:
        0,

      totalRequests:
        0,

      totalTokens:
        0

    };


    this.keys.push(
      newKey
    );


    await this.save();


    return newKey.id;
  }


  // ==================================================
  // REMOVE KEY
  // ==================================================

  async removeKey(
    id: string
  ): Promise<void> {

    this.keys =
      this.keys.filter(
        (item) =>
          item.id !== id
      );


    await this.save();
  }


  // ==================================================
  // GET KEY
  // ==================================================

  getKey(
    id: string
  ): APIKeyInfo | null {

    this.refreshStatuses();


    return (
      this.keys.find(
        (item) =>
          item.id === id
      ) || null
    );
  }


  // ==================================================
  // GET ALL KEYS
  // ==================================================

  getAllKeys(): APIKeyInfo[] {

    this.refreshStatuses();


    return [
      ...this.keys
    ];
  }


  // ==================================================
  // DISPLAY INFO
  // ==================================================

  getDisplayInfo():
    APIKeyDisplayInfo[] {

    this.refreshStatuses();


    const now =
      Date.now();


    return this.keys.map(
      (item) => ({

        id:
          item.id,

        provider:
          item.provider,

        status:
          item.status,

        usedTokens:
          item.usedTokens,

        requestCount:
          item.requestCount,

        cooldownRemaining:
          item.cooldownUntil > now
            ? item.cooldownUntil - now
            : 0,

        totalRequests:
          item.totalRequests,

        totalTokens:
          item.totalTokens,

        lastError:
          item.lastError

      })
    );
  }


  // ==================================================
  // GET AVAILABLE KEY BY PROVIDER
  // ==================================================

  getAvailableKey(
    provider: AIProvider
  ): APIKeyInfo | null {

    this.refreshStatuses();


    const available =
      this.keys.filter(
        (item) =>

          item.provider ===
            provider &&

          (
            item.status ===
              'available' ||

            item.status ===
              'warning'
          )
      );


    if (
      available.length === 0
    ) {

      return null;
    }


    available.sort(
      (a, b) =>
        a.usedTokens -
        b.usedTokens
    );


    return available[0];
  }


  // ==================================================
  // GET ANY AVAILABLE KEY
  // ==================================================

  getAnyAvailableKey():
    APIKeyInfo | null {

    this.refreshStatuses();


    const available =
      this.keys.filter(
        (item) =>

          item.status ===
            'available' ||

          item.status ===
            'warning'
      );


    if (
      available.length === 0
    ) {

      return null;
    }


    available.sort(
      (a, b) =>
        a.usedTokens -
        b.usedTokens
    );


    return available[0];
  }


  // ==================================================
  // AUTO SELECT BEST KEY
  // ==================================================

  getBestAvailableKeyAuto():
    APIKeyInfo | null {

    this.refreshStatuses();


    const available =
      this.keys.filter(
        (item) =>

          item.status ===
            'available' ||

          item.status ===
            'warning'
      );


    if (
      available.length === 0
    ) {

      return null;
    }


    /*
     * কম ব্যবহৃত API key আগে।
     */

    available.sort(
      (a, b) =>
        a.usedTokens -
        b.usedTokens
    );


    return available[0];
  }


  // ==================================================
  // PROVIDER FALLBACK
  // ==================================================

  getBestAvailableKey(
    preferredProvider:
      AIProvider
  ): APIKeyInfo | null {

    const preferred =
      this.getAvailableKey(
        preferredProvider
      );


    if (preferred) {

      return preferred;
    }


    const fallbackProvider =
      preferredProvider ===
        'groq'
        ? 'gemini'
        : 'groq';


    return this.getAvailableKey(
      fallbackProvider
    );
  }


  // ==================================================
  // RECORD USAGE
  // ==================================================

  async recordUsage(
    id: string,
    tokens: number
  ): Promise<void> {

    const item =
      this.getKey(id);


    if (!item) {

      return;
    }


    this.resetMinuteIfNeeded(
      item
    );


    const safeTokens =
      Number.isFinite(tokens) &&
      tokens > 0
        ? Math.floor(tokens)
        : 0;


    item.usedTokens +=
      safeTokens;


    item.requestCount +=
      1;


    item.totalRequests +=
      1;


    item.totalTokens +=
      safeTokens;


    this.updateStatusFromUsage(
      item
    );


    await this.save();
  }


  // ==================================================
  // RECORD REQUEST
  // ==================================================

  async recordRequest(
    id: string
  ): Promise<void> {

    const item =
      this.getKey(id);


    if (!item) {

      return;
    }


    this.resetMinuteIfNeeded(
      item
    );


    item.requestCount +=
      1;


    item.totalRequests +=
      1;


    this.updateStatusFromUsage(
      item
    );


    await this.save();
  }


  // ==================================================
  // MARK LIMIT
  // ==================================================

  async markLimitReached(
    id: string,
    errorMessage?: string,
    cooldownMs =
      DEFAULT_COOLDOWN_MS
  ): Promise<void> {

    const item =
      this.getKey(id);


    if (!item) {

      return;
    }


    item.status =
      'cooldown';


    item.cooldownUntil =
      Date.now() +
      cooldownMs;


    item.lastError =
      errorMessage ||
      'API rate limit reached';


    await this.save();
  }


  // ==================================================
  // MARK ERROR
  // ==================================================

  async markError(
    id: string,
    errorMessage?: string
  ): Promise<void> {

    const item =
      this.getKey(id);


    if (!item) {

      return;
    }


    item.status =
      'error';


    item.cooldownUntil =
      Date.now() +
      DEFAULT_COOLDOWN_MS;


    item.lastError =
      errorMessage ||
      'API request failed';


    await this.save();
  }


  // ==================================================
  // MARK AVAILABLE
  // ==================================================

  async markAvailable(
    id: string
  ): Promise<void> {

    const item =
      this.getKey(id);


    if (!item) {

      return;
    }


    item.status =
      'available';


    item.cooldownUntil =
      0;


    item.lastError =
      undefined;


    await this.save();
  }


  // ==================================================
  // REFRESH STATUS
  // ==================================================

  refreshStatuses(): void {

    const now =
      Date.now();


    for (
      const item of this.keys
    ) {

      this.resetMinuteIfNeeded(
        item
      );


      if (
        item.cooldownUntil > 0
      ) {

        if (
          now >=
          item.cooldownUntil
        ) {

          item.cooldownUntil =
            0;

          item.status =
            'available';

          item.lastError =
            undefined;

        } else {

          item.status =
            'cooldown';

          continue;
        }
      }


      this.updateStatusFromUsage(
        item
      );
    }
  }


  // ==================================================
  // RESET MINUTE
  // ==================================================

  private resetMinuteIfNeeded(
    item: APIKeyInfo
  ): void {

    const now =
      Date.now();


    const elapsed =
      now -
      item.minuteStartedAt;


    if (
      elapsed >=
      60 * 1000
    ) {

      item.minuteStartedAt =
        now;


      item.usedTokens =
        0;


      item.requestCount =
        0;


      if (
        item.status ===
          'warning' ||

        item.status ===
          'limit'
      ) {

        item.status =
          'available';
      }
    }
  }


  // ==================================================
  // UPDATE STATUS
  // ==================================================

  private updateStatusFromUsage(
    item: APIKeyInfo
  ): void {

    if (
      item.status ===
        'cooldown' ||

      item.status ===
        'error'
    ) {

      return;
    }


    const usagePercent =
      item.usedTokens /
      DEFAULT_TPM_LIMIT;


    if (
      usagePercent >= 1
    ) {

      item.status =
        'cooldown';


      item.cooldownUntil =
        Date.now() +
        DEFAULT_COOLDOWN_MS;


      item.lastError =
        'Configured token limit reached';


      return;
    }


    if (
      usagePercent >=
      COOLDOWN_PERCENT
    ) {

      item.status =
        'warning';

      return;
    }


    if (
      usagePercent >=
      WARNING_PERCENT
    ) {

      item.status =
        'warning';

      return;
    }


    item.status =
      'available';
  }


  // ==================================================
  // PROVIDER STATS
  // ==================================================

  getProviderStats(
    provider: AIProvider
  ) {

    this.refreshStatuses();


    const providerKeys =
      this.keys.filter(
        (item) =>
          item.provider ===
          provider
      );


    return {

      total:
        providerKeys.length,

      available:
        providerKeys.filter(
          (item) =>
            item.status ===
              'available' ||

            item.status ===
              'warning'
        ).length,

      cooldown:
        providerKeys.filter(
          (item) =>
            item.status ===
            'cooldown'
        ).length,

      errors:
        providerKeys.filter(
          (item) =>
            item.status ===
            'error'
        ).length,

      totalRequests:
        providerKeys.reduce(
          (sum, item) =>
            sum +
            item.totalRequests,
          0
        ),

      totalTokens:
        providerKeys.reduce(
          (sum, item) =>
            sum +
            item.totalTokens,
          0
        )

    };
  }


  // ==================================================
  // CLEAR PROVIDER
  // ==================================================

  async clearProvider(
    provider: AIProvider
  ): Promise<void> {

    this.keys =
      this.keys.filter(
        (item) =>
          item.provider !==
          provider
      );


    await this.save();
  }


  // ==================================================
  // CLEAR ALL
  // ==================================================

  async clearAll(): Promise<void> {

    this.keys = [];


    await this.save();
  }
}