import * as vscode from 'vscode';

import {
  getTaskSummaryInBangla,
  generateCodeWithAI
} from './gemini';

import {
  getActiveEditorCode,
  writeCodeToFile
} from './fileHandler';

import {
  saveToMemory,
  searchInMemory
} from './memory';

import {
  searchOpenKnowledge
} from './openKnowledge';

import {
  AgentChatProvider
} from './chatView';

import {
  APIManager,
  AIProvider
} from './apiManager';

import {
  saveTrainingData
} from './localAI/training';

import {
  ODXInference
} from './localAI/inference';

import {
  createEmbedding
} from './embedding';


const DEFAULT_PROVIDER: AIProvider = 'groq';

const GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b'
];

const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro'
];


let apiManager: APIManager;

let chatProvider:
  | AgentChatProvider
  | undefined;

let localBrain:
  | ODXInference
  | undefined;


let pendingPrompt = '';
let pendingExistingCode = '';
let pendingFilePath = '';
let pendingWorkspaceFolder = '';

let pendingProvider: AIProvider =
  DEFAULT_PROVIDER;

let pendingModel =
  GROQ_MODELS[0];

let pendingApiKey = '';
let pendingApiId = '';

let currentProvider: AIProvider =
  DEFAULT_PROVIDER;

let currentModel =
  GROQ_MODELS[0];

let currentApiId = '';


let pendingKnowledgeText = '';
let pendingKnowledgeSource = '';

let pendingHasMemory = false;
let pendingHasOpenKnowledge = false;


/*
 * =====================================================
 * MODEL HELPERS
 * =====================================================
 */

function getDefaultModel(
  provider: AIProvider
): string {

  return provider === 'groq'
    ? GROQ_MODELS[0]
    : GEMINI_MODELS[0];
}


function getProviderModel(
  provider: AIProvider
): {
  provider: AIProvider;
  model: string;
} {

  return {
    provider,
    model: getDefaultModel(provider)
  };
}


function detectProviderFromKey(
  key: string
): AIProvider | null {

  return apiManager.detectProvider(
    key.trim()
  );
}


/*
 * =====================================================
 * TARGET FILE DETECTION
 * =====================================================
 */

function detectTargetFile(
  prompt: string,
  currentFilePath: string
): string {

  const text =
    prompt.toLowerCase();


  /*
   * Next.js API route
   */

  if (
    text.includes('api route') ||
    text.includes('api endpoint') ||
    text.includes('api') &&
      (
        text.includes('get request') ||
        text.includes('post request') ||
        text.includes('put request') ||
        text.includes('delete request')
      )
  ) {

    /*
     * Users API
     */

    if (
      text.includes('user') ||
      text.includes('users')
    ) {

      return 'app/api/users/route.ts';
    }


    /*
     * Try to detect route name
     */

    const routeMatch =
      prompt.match(
        /(?:api|route|endpoint)[\s:-]+([a-zA-Z0-9_-]+)/i
      );

    if (routeMatch?.[1]) {

      return (
        `app/api/${routeMatch[1]}/route.ts`
      );
    }


    return 'app/api/route.ts';
  }


  /*
   * Next.js page request
   */

  if (
    text.includes('next.js page') ||
    text.includes('nextjs page') ||
    text.includes('page তৈরি') ||
    text.includes('page বানাও')
  ) {

    return currentFilePath ||
      'app/page.tsx';
  }


  /*
   * Component request
   */

  if (
    text.includes('component') &&
    !text.includes('page component')
  ) {

    return currentFilePath ||
      'components/Component.tsx';
  }


  /*
   * Default:
   * current active file
   */

  return currentFilePath ||
    'app/page.tsx';
}


/*
 * =====================================================
 * ERROR HELPERS
 * =====================================================
 */

function isRateLimitError(
  error: unknown
): boolean {

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const lower =
    message.toLowerCase();

  return (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests') ||
    lower.includes('resource exhausted') ||
    lower.includes('tpm') ||
    lower.includes('request too large')
  );
}


function isInvalidApiKeyError(
  error: unknown
): boolean {

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const lower =
    message.toLowerCase();

  return (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('authentication') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('403')
  );
}


function isApiFailureError(
  error: unknown
): boolean {

  return (
    isRateLimitError(error) ||
    isInvalidApiKeyError(error)
  );
}


function trimBuildError(
  error: string
): string {

  if (error.length <= 12000) {
    return error;
  }

  return error.slice(0, 12000);
}


/*
 * =====================================================
 * GENERATED CODE CLEANER
 * =====================================================
 */

function cleanGeneratedCode(
  code: string
): string {

  let result =
    String(code || '').trim();

  result =
    result.replace(
      /^\uFEFF/,
      ''
    );


  /*
   * Remove markdown fences.
   */

  result =
    result.replace(
      /^```(?:tsx|ts|jsx|js|typescript|javascript)?\s*/i,
      ''
    );

  result =
    result.replace(
      /\s*```$/i,
      ''
    );


  /*
   * Fix escaped quotes.
   */

  result =
    result.replace(
      /\\"/g,
      '"'
    );

  result =
    result.replace(
      /\\'/g,
      "'"
    );


  /*
   * Decode JSON encoded string.
   */

  if (
    result.startsWith('"') &&
    result.endsWith('"')
  ) {

    try {

      const parsed =
        JSON.parse(result);

      if (
        typeof parsed === 'string'
      ) {

        result = parsed;
      }

    } catch {
      // Ignore.
    }
  }


  /*
   * Remove fences again.
   */

  result =
    result.replace(
      /^```(?:tsx|ts|jsx|js|typescript|javascript)?\s*/i,
      ''
    );

  result =
    result.replace(
      /\s*```$/i,
      ''
    );


  /*
   * Remove accidental explanation.
   */

  const codeMarkers = [
    '"use client";',
    "'use client';",
    '"use server";',
    "'use server';",
    'import ',
    'export ',
    'const ',
    'function ',
    'class ',
    'interface ',
    'type '
  ];

  const positions: number[] = [];

  for (
    const marker of codeMarkers
  ) {

    const position =
      result.indexOf(marker);

    if (position >= 0) {
      positions.push(position);
    }
  }

  if (
    positions.length > 0
  ) {

    const firstCodePosition =
      Math.min(...positions);

    if (
      firstCodePosition > 0
    ) {

      result =
        result.slice(
          firstCodePosition
        );
    }
  }

  return result.trim();
}


/*
 * =====================================================
 * AUTO FIX PROMPT
 * =====================================================
 */

function buildAutoFixPrompt(
  userRequest: string,
  filePath: string,
  currentCode: string,
  buildError: string
): string {

  const nextJsError =
    /use client|use server|useFormState|useFormStatus|Server Component|Server Action|react-dom/i
      .test(buildError);

  const quoteError =
    /unterminated string|unexpected token|invalid character|parsing ecmascript/i
      .test(buildError);


  return `
You are ODX Auto Fix Engine.

Fix the build error in the real project file.

USER REQUEST:

${userRequest}

TARGET FILE:

${filePath}

CURRENT BROKEN CODE:

${currentCode}

BUILD ERROR:

${buildError}

STRICT RULES:

1. Fix the EXACT build error.
2. Return the COMPLETE corrected file.
3. Return SOURCE CODE ONLY.
4. Do NOT return Markdown.
5. Do NOT use code fences.
6. Do NOT return JSON.
7. Do NOT explain anything.
8. Do NOT return escaped source code.
9. The result will be written DIRECTLY into the target file.
10. Preserve the user's requested functionality.
11. Do not add unrelated features.
12. Do not repeat the broken code.
13. Make the smallest safe change.
14. The final code MUST compile.

SOURCE CODE QUOTE RULE:

Correct:

"use client";

Incorrect:

\\"use client\\";

Incorrect:

\\\\"use client\\\\";

The final source must contain normal TypeScript/TSX syntax.

NEXT.JS RULES:

- Respect the current Next.js version.
- Respect React Client Component and Server Component rules.
- If the file contains "use client", keep it a valid Client Component.
- Do NOT create an invalid Client Component + Server Action combination.
- Do NOT use "use server" inside a Client Component incorrectly.
- Do NOT use useFormState or useFormStatus unless actually required.
- Do NOT add forms or Server Actions when the user's request does not need them.
- Preserve the requested UI/functionality.
- Prefer the simplest valid solution.

NEXT.JS FILE STRUCTURE RULES:

- API routes MUST be placed inside app/api/**/route.ts.
- Do NOT put a Next.js API GET/POST/PUT/DELETE handler inside app/page.tsx.
- Page UI must remain inside page.tsx.
- If the request is for an API route, preserve page.tsx unless the user explicitly asks to change it.
- If a required API route file does not exist, create that route file.

${
  nextJsError
    ? `
IMPORTANT:

The build error is related to Next.js/React Client-Server rules.

Inspect:

- "use client"
- "use server"
- Server Actions
- useFormState
- useFormStatus
- react-dom imports
- Client Component restrictions

Do NOT simply return the same architecture.
`
    : ''
}

${
  quoteError
    ? `
IMPORTANT:

This is a source parsing/quote error.

The generated source contains escaped quotes.

Convert escaped source-code quotes into normal source-code quotes.

Example:

BROKEN:

\\"use client\\";

CORRECT:

"use client";

The final file must be directly compilable.
`
    : ''
}

TASK:

Fix the error and return the COMPLETE corrected file:

${filePath}

ONLY SOURCE CODE.
`.trim();
}


/*
 * =====================================================
 * CHAT RESPONSE HELPERS
 * =====================================================
 */

function getGeneratorInfo(
  isLocalBrain: boolean,
  provider?: AIProvider,
  model?: string
): string {

  if (isLocalBrain) {

    return `
🤖 Code Generator:

ODX Local Brain

🧠 Model:

odx-brain

📌 Mode:

Local AI
`.trim();
  }

  return `
🤖 Code Generator:

${
  provider === 'groq'
    ? 'Groq'
    : 'Google Gemini'
}

🧠 Model:

${model || 'Unknown'}

📌 Mode:

Teacher AI
`.trim();
}


function getKnowledgeSource(
  hasMemory: boolean,
  hasOpenKnowledge: boolean
): string {

  if (
    hasMemory &&
    hasOpenKnowledge
  ) {

    return `
🧠 ODX Knowledge

+

🌐 Open Knowledge
`.trim();
  }

  if (hasMemory) {
    return '🧠 ODX Knowledge';
  }

  if (hasOpenKnowledge) {
    return '🌐 Open Knowledge';
  }

  return '⚪ No external knowledge found';
}


function buildCodeChangePreview(
  oldCode: string,
  newCode: string,
  filePath: string
): string {

  if (!oldCode.trim()) {

    return `
📄 File:

${filePath}

🟢 NEW CODE

\`\`\`

${newCode}

\`\`\`

ℹ️ এই file-এ আগে কোনো code ছিল না।

নতুন code তৈরি হবে।
`.trim();
  }


  if (
    oldCode.trim() ===
    newCode.trim()
  ) {

    return `
📄 File:

${filePath}

ℹ️ Existing code-এর কোনো পরিবর্তন পাওয়া যায়নি।
`.trim();
  }


  return `
📄 File:

${filePath}

🔴 OLD CODE

\`\`\`

${oldCode}

\`\`\`

🟢 NEW CODE

\`\`\`

${newCode}

\`\`\`

⚡ Existing code-এর প্রয়োজনীয় অংশ পরিবর্তন হবে।
`.trim();
}


function syncApiPool(): void {

  if (!chatProvider) {
    return;
  }

  chatProvider.syncApiPool(
    apiManager.getDisplayInfo()
  );
}


function setCurrentApi(
  provider: AIProvider,
  model: string,
  apiId: string
): void {

  currentProvider = provider;
  currentModel = model;
  currentApiId = apiId;

  if (!chatProvider) {
    return;
  }

  chatProvider.syncCurrentApi(
    provider,
    model,
    apiId
  );

  syncApiPool();
}


function clearCurrentApi(): void {

  currentApiId = '';

  if (!chatProvider) {
    return;
  }

  chatProvider.syncCurrentApi(
    currentProvider,
    currentModel,
    ''
  );

  syncApiPool();
}


/*
 * =====================================================
 * BUILD CHECK
 * =====================================================
 */

async function checkProject(
  workspaceFolder: string
): Promise<{
  success: boolean;
  output: string;
}> {

  return new Promise(
    (resolve) => {

      const terminal =
        vscode.window.createTerminal({
          name: 'ODX Build Check',
          cwd: workspaceFolder
        });

      terminal.show(true);

      const shell =
        process.platform === 'win32'
          ? 'cmd.exe'
          : 'sh';

      const command =
        process.platform === 'win32'
          ? '/c npm run build'
          : '-c "npm run build"';

      const child =
        require('child_process').spawn(
          shell,
          [command],
          {
            cwd: workspaceFolder,
            shell: false
          }
        );

      let output = '';

      child.stdout.on(
        'data',
        (data: Buffer) => {

          const text =
            data.toString();

          output += text;

          console.log(text);
        }
      );

      child.stderr.on(
        'data',
        (data: Buffer) => {

          const text =
            data.toString();

          output += text;

          console.error(text);
        }
      );

      child.on(
        'close',
        (code: number) => {

          terminal.dispose();

          resolve({
            success: code === 0,
            output:
              trimBuildError(output)
          });
        }
      );

      child.on(
        'error',
        (error: Error) => {

          terminal.dispose();

          resolve({
            success: false,
            output: error.message
          });
        }
      );
    }
  );
}


/*
 * =====================================================
 * API MANAGEMENT
 * =====================================================
 */

function getNextApi(
  provider: AIProvider,
  triedApiIds: Set<string>
) {

  return apiManager
    .getAllKeys()
    .filter(
      (item) =>
        item.provider === provider &&
        (
          item.status === 'available' ||
          item.status === 'warning'
        ) &&
        !triedApiIds.has(item.id)
    )
    .sort(
      (a, b) =>
        a.usedTokens -
        b.usedTokens
    )[0];
}


function getAutoSelectedApi() {

  return apiManager
    .getBestAvailableKeyAuto();
}


function activateApi(
  api: {
    id: string;
    key: string;
    provider: AIProvider;
  }
): void {

  const provider =
    api.provider ||
    detectProviderFromKey(
      api.key
    );

  if (!provider) {
    return;
  }

  const model =
    getDefaultModel(provider);

  pendingProvider = provider;
  pendingModel = model;
  pendingApiKey = api.key;
  pendingApiId = api.id;

  setCurrentApi(
    provider,
    model,
    api.id
  );
}


/*
 * =====================================================
 * GENERATE WITH FALLBACK
 * =====================================================
 */

async function generateWithFallback(
  prompt: string,
  existingCode: string,
  filePath: string,
  provider: AIProvider,
  model: string,
  apiKey: string
): Promise<{
  result: {
    filePath: string;
    code: string;
  };
  provider: AIProvider;
  model: string;
  apiKey: string;
  apiId: string;
}> {

  const triedApiIds =
    new Set<string>();

  const providers: AIProvider[] =
    provider === 'groq'
      ? ['groq', 'gemini']
      : ['gemini', 'groq'];


  for (
    const currentProvider of providers
  ) {

    const currentModel =
      currentProvider === provider
        ? model
        : getDefaultModel(
            currentProvider
          );


    for (
      let attempt = 0;
      attempt < 20;
      attempt++
    ) {

      const api =
        getNextApi(
          currentProvider,
          triedApiIds
        );

      if (!api) {
        break;
      }

      triedApiIds.add(api.id);

      try {

        setCurrentApi(
          currentProvider,
          currentModel,
          api.id
        );

        const result =
          await generateCodeWithAI(
            prompt,
            existingCode,
            filePath,
            currentProvider,
            currentModel,
            api.key
          );

        result.code =
          cleanGeneratedCode(
            result.code
          );

        await apiManager.recordRequest(
          api.id
        );

        syncApiPool();

        return {
          result,
          provider: currentProvider,
          model: currentModel,
          apiKey: api.key,
          apiId: api.id
        };

      } catch (
        error: unknown
      ) {

        const message =
          error instanceof Error
            ? error.message
            : String(error);

        if (
          !isApiFailureError(error)
        ) {
          throw error;
        }

        if (
          isInvalidApiKeyError(error)
        ) {

          await apiManager.markError(
            api.id,
            `Invalid API Key: ${message}`
          );

        } else {

          await apiManager.markLimitReached(
            api.id,
            message
          );
        }

        if (
          currentApiId ===
          api.id
        ) {

          clearCurrentApi();
        }

        syncApiPool();
      }
    }
  }

  throw new Error(
    'কোনো valid/available API Key পাওয়া যায়নি।'
  );
}


/*
 * =====================================================
 * SUMMARY WITH FALLBACK
 * =====================================================
 */

async function getSummaryWithFallback(
  prompt: string,
  provider: AIProvider,
  model: string,
  apiKey: string
): Promise<{
  summary: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  apiId: string;
}> {

  const triedApiIds =
    new Set<string>();

  const providers: AIProvider[] =
    provider === 'groq'
      ? ['groq', 'gemini']
      : ['gemini', 'groq'];


  for (
    const currentProvider of providers
  ) {

    const currentModel =
      currentProvider === provider
        ? model
        : getDefaultModel(
            currentProvider
          );


    for (
      let attempt = 0;
      attempt < 20;
      attempt++
    ) {

      const api =
        getNextApi(
          currentProvider,
          triedApiIds
        );

      if (!api) {
        break;
      }

      triedApiIds.add(api.id);

      try {

        setCurrentApi(
          currentProvider,
          currentModel,
          api.id
        );

        const summary =
          await getTaskSummaryInBangla(
            prompt,
            currentProvider,
            currentModel,
            api.key
          );

        await apiManager.recordRequest(
          api.id
        );

        syncApiPool();

        return {
          summary,
          provider: currentProvider,
          model: currentModel,
          apiKey: api.key,
          apiId: api.id
        };

      } catch (
        error: unknown
      ) {

        const message =
          error instanceof Error
            ? error.message
            : String(error);

        if (
          !isApiFailureError(error)
        ) {
          throw error;
        }

        if (
          isInvalidApiKeyError(error)
        ) {

          await apiManager.markError(
            api.id,
            `Invalid API Key: ${message}`
          );

        } else {

          await apiManager.markLimitReached(
            api.id,
            message
          );
        }

        if (
          currentApiId ===
          api.id
        ) {

          clearCurrentApi();
        }

        syncApiPool();
      }
    }
  }

  throw new Error(
    'কোনো valid/available API Key পাওয়া যায়নি।'
  );
}


/*
 * =====================================================
 * ADD API KEY
 * =====================================================
 */

async function addAPIKey(
  provider: AIProvider
): Promise<void> {

  const providerName =
    provider === 'groq'
      ? 'Groq'
      : 'Gemini';

  const key =
    await vscode.window.showInputBox({
      prompt:
        `${providerName} API Key দিন`,
      password: true,
      ignoreFocusOut: true,
      placeHolder:
        `${providerName} API Key`
    });

  if (!key) {
    return;
  }

  try {

    const result =
      await apiManager.addKeyAuto(
        key.trim()
      );

    const providerInfo =
      getProviderModel(
        result.provider
      );

    const savedApi =
      apiManager.getKey(
        result.id
      );

    if (savedApi) {
      activateApi(savedApi);
    }

    syncApiPool();

    vscode.window.showInformationMessage(
      `${result.provider.toUpperCase()} API Key added successfully. Model: ${providerInfo.model}`
    );

  } catch (
    error: unknown
  ) {

    vscode.window.showErrorMessage(
      error instanceof Error
        ? error.message
        : String(error)
    );
  }
}


/*
 * =====================================================
 * REMOVE API KEY
 * =====================================================
 */

async function removeAPIKey(): Promise<void> {

  const keys =
    apiManager.getDisplayInfo();

  if (
    keys.length === 0
  ) {

    vscode.window.showInformationMessage(
      'কোনো API Key নেই।'
    );

    return;
  }

  const items =
    keys.map(
      (item) => ({
        label:
          `${item.provider.toUpperCase()} — ${item.status}`,
        description:
          `Requests: ${item.totalRequests} | Tokens: ${item.totalTokens}`,
        id:
          item.id
      })
    );

  const selected =
    await vscode.window.showQuickPick(
      items,
      {
        placeHolder:
          'যে API Key remove করতে চান সেটি select করুন'
      }
    );

  if (!selected) {
    return;
  }

  await apiManager.removeKey(
    selected.id
  );

  if (
    currentApiId ===
    selected.id
  ) {

    clearCurrentApi();

    const nextApi =
      getAutoSelectedApi();

    if (nextApi) {
      activateApi(nextApi);
    } else {
      clearCurrentApi();
    }
  }

  syncApiPool();

  vscode.window.showInformationMessage(
    'API Key removed successfully.'
  );
}


/*
 * =====================================================
 * SHOW API KEYS
 * =====================================================
 */

async function showAPIKeys(): Promise<void> {

  const keys =
    apiManager.getDisplayInfo();

  if (
    keys.length === 0
  ) {

    vscode.window.showInformationMessage(
      'কোনো API Key added নেই।'
    );

    return;
  }

  const text =
    keys
      .map(
        (item, index) => {

          const active =
            item.id === currentApiId
              ? ' ← CURRENTLY USING'
              : '';

          return (
            `${index + 1}. ` +
            `${item.provider.toUpperCase()} | ` +
            `${item.status} | ` +
            `Requests: ${item.totalRequests} | ` +
            `Tokens: ${item.totalTokens}` +
            active
          );
        }
      )
      .join('\n');

  vscode.window.showInformationMessage(
    text
  );
}


/*
 * =====================================================
 * CLEAR ALL API KEYS
 * =====================================================
 */

async function clearAllAPIKeys(): Promise<void> {

  const confirmation =
    await vscode.window.showWarningMessage(
      'সব API Key remove করবেন?',
      {
        modal: true
      },
      'Yes',
      'Cancel'
    );

  if (
    confirmation !==
    'Yes'
  ) {
    return;
  }

  await apiManager.clearAll();

  clearCurrentApi();

  syncApiPool();

  vscode.window.showInformationMessage(
    'সব API Key remove করা হয়েছে.'
  );
}


/*
 * =====================================================
 * ACTIVATE
 * =====================================================
 */

export function activate(
  context: vscode.ExtensionContext
): void {

  apiManager =
    new APIManager(context);

  localBrain =
    new ODXInference();

  localBrain
    .initialize()
    .then(() => {

      console.log(
        'ODX Local Brain initialized successfully.'
      );

    })
    .catch((error) => {

      console.error(
        'ODX Local Brain initialization failed:',
        error
      );
    });


  chatProvider =
    new AgentChatProvider(

      context.extensionUri,

      async (
        prompt: string
      ) => {

        await handleUserPrompt(
          prompt
        );
      },

      async (
        action:
          | 'approve'
          | 'skip'
      ) => {

        if (
          action ===
          'approve'
        ) {

          await handleApproval();
        }
      },

      async (
        provider: string,
        model: string
      ) => {

        if (
          provider !== 'groq' &&
          provider !== 'gemini'
        ) {
          return;
        }

        currentProvider =
          provider as AIProvider;

        currentModel =
          model;

        pendingProvider =
          currentProvider;

        pendingModel =
          currentModel;

        const selectedApi =
          getNextApi(
            currentProvider,
            new Set<string>()
          );

        if (selectedApi) {

          setCurrentApi(
            currentProvider,
            currentModel,
            selectedApi.id
          );

        } else {

          chatProvider?.syncCurrentApi(
            currentProvider,
            currentModel,
            ''
          );

          syncApiPool();
        }
      },

      async (
        _provider:
          | 'groq'
          | 'gemini',
        apiKey: string
      ) => {

        try {

          const cleanKey =
            apiKey.trim();

          const result =
            await apiManager.addKeyAuto(
              cleanKey
            );

          const savedApi =
            apiManager.getKey(
              result.id
            );

          if (savedApi) {
            activateApi(savedApi);
          }

          syncApiPool();

          vscode.window.showInformationMessage(
            `${result.provider.toUpperCase()} API Key added successfully.`
          );

        } catch (
          error: unknown
        ) {

          vscode.window.showErrorMessage(
            error instanceof Error
              ? error.message
              : String(error)
          );
        }
      },

      async (
        id: string
      ) => {

        try {

          await apiManager.removeKey(id);

          if (
            currentApiId === id
          ) {

            clearCurrentApi();

            const nextApi =
              getAutoSelectedApi();

            if (nextApi) {
              activateApi(nextApi);
            }
          }

          syncApiPool();

          vscode.window.showInformationMessage(
            'API Key removed successfully.'
          );

        } catch (
          error: unknown
        ) {

          vscode.window.showErrorMessage(
            error instanceof Error
              ? error.message
              : String(error)
          );
        }
      }
    );


  context.subscriptions.push(

    vscode.window.registerWebviewViewProvider(
      AgentChatProvider.viewType,
      chatProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );


  context.subscriptions.push(

    vscode.commands.registerCommand(
      'my-mini-agent.start',
      async () => {

        await vscode.commands.executeCommand(
          'workbench.view.extension.my-mini-agent-sidebar'
        );
      }
    )
  );


  context.subscriptions.push(

    vscode.commands.registerCommand(
      'my-mini-agent.openChat',
      async () => {

        await vscode.commands.executeCommand(
          'workbench.view.extension.my-mini-agent-sidebar'
        );
      }
    )
  );


  context.subscriptions.push(

    vscode.commands.registerCommand(
      'my-mini-agent.addGroqKey',
      async () => {

        await addAPIKey('groq');
      }
    )
  );


  context.subscriptions.push(

    vscode.commands.registerCommand(
      'my-mini-agent.addGeminiKey',
      async () => {

        await addAPIKey('gemini');
      }
    )
  );


  context.subscriptions.push(

    vscode.commands.registerCommand(
      'my-mini-agent.removeApiKey',
      async () => {

        await removeAPIKey();
      }
    )
  );


  context.subscriptions.push(

    vscode.commands.registerCommand(
      'my-mini-agent.showApiKeys',
      async () => {

        await showAPIKeys();
      }
    )
  );


  context.subscriptions.push(

    vscode.commands.registerCommand(
      'my-mini-agent.clearApiKeys',
      async () => {

        await clearAllAPIKeys();
      }
    )
  );


  setTimeout(
    () => {

      syncApiPool();

      const autoApi =
        getAutoSelectedApi();

      if (autoApi) {

        activateApi(autoApi);

      } else {

        chatProvider?.syncCurrentApi(
          currentProvider,
          currentModel,
          currentApiId
        );
      }

    },
    300
  );


  console.log(
    'ODX Mini Agent activated successfully.'
  );
}


/*
 * =====================================================
 * USER PROMPT
 * =====================================================
 */

async function handleUserPrompt(
  prompt: string
): Promise<void> {

  const cleanPrompt =
    prompt.trim();

  if (!cleanPrompt) {
    return;
  }


  const workspace =
    vscode.workspace.workspaceFolders?.[0];

  if (!workspace) {

    vscode.window.showErrorMessage(
      'প্রথমে একটি VS Code project/workspace open করুন।'
    );

    return;
  }


  /*
   * Reset pending state
   */

  pendingPrompt =
    cleanPrompt;

  pendingWorkspaceFolder =
    workspace.uri.fsPath;

  pendingKnowledgeText = '';
  pendingKnowledgeSource = '';

  pendingHasMemory = false;
  pendingHasOpenKnowledge = false;


  /*
   * Current editor
   */

  const editorData =
    getActiveEditorCode();

  const currentFilePath =
    editorData.relativePath;


  /*
   * IMPORTANT:
   *
   * Active editor file আর সব task-এর
   * target file নয়।
   *
   * API route হলে target হবে:
   *
   * app/api/users/route.ts
   */

  pendingFilePath =
    detectTargetFile(
      cleanPrompt,
      currentFilePath
    );


  /*
   * Existing code load
   */

  pendingExistingCode = '';

  if (
    pendingFilePath ===
    currentFilePath
  ) {

    pendingExistingCode =
      editorData.existingCode;

  } else {

    try {

      const targetUri =
        vscode.Uri.joinPath(
          workspace.uri,
          pendingFilePath
        );

      const targetDocument =
        await vscode.workspace.openTextDocument(
          targetUri
        );

      pendingExistingCode =
        targetDocument.getText();

    } catch {

      /*
       * File does not exist.
       * New file will be created.
       */

      pendingExistingCode = '';
    }
  }


  /*
   * =================================================
   * ODX MEMORY SEARCH
   * =================================================
   */

  let memory: any = {
    textResults: [],
    vectorResults: []
  };

  try {

    memory =
      await searchInMemory(
        cleanPrompt
      );

  } catch (error) {

    console.error(
      'ODX Memory search failed:',
      error
    );
  }


  const hasTextMemory =
    Array.isArray(
      memory?.textResults
    ) &&
    memory.textResults.length > 0;


  const hasVectorMemory =
    Array.isArray(
      memory?.vectorResults
    ) &&
    memory.vectorResults.length > 0;


  const hasMemory =
    hasTextMemory ||
    hasVectorMemory;


  pendingHasMemory =
    hasMemory;


  /*
   * =================================================
   * BUILD MEMORY KNOWLEDGE
   * =================================================
   */

  if (hasMemory) {

    const memoryItems = [
      ...(memory.textResults || []),
      ...(memory.vectorResults || [])
    ];

    pendingKnowledgeText =
      memoryItems
        .map(
          (item: any) =>
            item.content ||
            item.code_content ||
            item.knowledge ||
            item.prompt ||
            ''
        )
        .filter(
          (item: string) =>
            item.trim().length > 0
        )
        .join('\n\n');


    if (
      pendingKnowledgeText.trim()
    ) {

      pendingKnowledgeSource =
        'ODX Knowledge';
    }
  }


  /*
   * =================================================
   * OPEN KNOWLEDGE
   * =================================================
   */

  if (!hasMemory) {

    try {

      chatProvider?.addMessage(
        'agent',
        `
🔎 ODX Knowledge-এ relevant information পাওয়া যায়নি।

🌐 Open Knowledge search করা হচ্ছে...
`.trim()
      );


      const openKnowledge =
        await searchOpenKnowledge(
          cleanPrompt
        );


      if (
        openKnowledge &&
        openKnowledge.length > 0
      ) {

        pendingKnowledgeText =
          openKnowledge
            .map(
              (item) =>
                `${item.title || ''}

${item.content || ''}

Source:

${item.source || ''}

${item.url || ''}`
            )
            .join('\n\n');


        if (
          pendingKnowledgeText.trim()
        ) {

          pendingHasOpenKnowledge =
            true;

          pendingKnowledgeSource =
            'Open Knowledge';
        }
      }

    } catch (error) {

      console.error(
        'Open Knowledge search failed:',
        error
      );
    }
  }


  /*
   * =================================================
   * API SELECT
   * =================================================
   */

  const selectedApi =
    getAutoSelectedApi();

  if (selectedApi) {

    activateApi(selectedApi);

  } else {

    pendingApiKey = '';
    pendingApiId = '';

    syncApiPool();
  }


  /*
   * =================================================
   * SUMMARY
   * =================================================
   */

  try {

    let summaryText =
      `এই কাজের জন্য ${
        pendingFilePath ||
        'বর্তমান file'
      }-এ প্রয়োজনীয় code পরিবর্তন করা হবে।`;


    if (pendingApiKey) {

      try {

        const summary =
          await getSummaryWithFallback(
            cleanPrompt,
            pendingProvider,
            pendingModel,
            pendingApiKey
          );

        pendingProvider =
          summary.provider;

        pendingModel =
          summary.model;

        pendingApiKey =
          summary.apiKey;

        pendingApiId =
          summary.apiId;


        setCurrentApi(
          summary.provider,
          summary.model,
          summary.apiId
        );


        summaryText =
          summary.summary;

      } catch (error) {

        console.log(
          'Summary API unavailable.',
          error
        );
      }
    }


    const knowledgeSource =
      getKnowledgeSource(
        pendingHasMemory,
        pendingHasOpenKnowledge
      );


    const changePlan =
      `
📋 কী Change হবে:

${summaryText}

📄 Target File:

${pendingFilePath || 'নতুন/বর্তমান file'}

${buildCodeChangePreview(
  pendingExistingCode,
  '(Generated code approval-এর পর এখানে বসবে)',
  pendingFilePath
)}
`.trim();


    chatProvider?.showConfirmation(
      `
${changePlan}

📚 Information Source:

${knowledgeSource}

🤖 Initial Code Generator:

ODX Local Brain

🧠 Local Model:

odx-brain

🔍 Bug Check:

Code generate হওয়ার পর project build/test করা হবে।

🔧 Auto Fix:

Build error পাওয়া গেলে প্রথমে ODX Local Brain দিয়ে automatic fix করার চেষ্টা হবে।

💾 Storage:

Code সফলভাবে build হলে ODX Knowledge ও ODX Training Data-তে save করা হবে।

${
  pendingApiKey
    ? `
🌐 Teacher AI:

${
  pendingProvider === 'groq'
    ? 'Groq'
    : 'Google Gemini'
}

🧠 Model:

${pendingModel}
`.trim()
    : `
🌐 Teacher AI:

কোনো API Key পাওয়া যায়নি।
`.trim()
}

আপনি Approve করলে কাজ শুরু হবে।
`.trim()
    );

  } catch (
    error: unknown
  ) {

    vscode.window.showErrorMessage(
      error instanceof Error
        ? error.message
        : String(error)
    );
  }
}


/*
 * =====================================================
 * APPROVAL
 * =====================================================
 */

async function handleApproval(): Promise<void> {

  if (
    !pendingPrompt ||
    !pendingWorkspaceFolder
  ) {

    vscode.window.showErrorMessage(
      'কোনো pending task পাওয়া যায়নি।'
    );

    return;
  }


  try {

    let generated:
      | {
          result: {
            filePath: string;
            code: string;
          };

          provider: AIProvider;
          model: string;
          apiKey: string;
          apiId: string;
        }
      | undefined;


    let generatedByLocalBrain =
      false;


    /*
     * =================================================
     * LOCAL BRAIN INITIALIZE
     * =================================================
     */

    if (
      localBrain &&
      !localBrain.isReady()
    ) {

      try {

        await localBrain.initialize();

      } catch (error) {

        console.error(
          'Local Brain initialization failed:',
          error
        );
      }
    }


    /*
     * =================================================
     * LOCAL BRAIN GENERATION
     * =================================================
     */

    if (
      localBrain &&
      localBrain.isReady()
    ) {

      try {

        chatProvider?.addMessage(
          'agent',
          `
🧠 ODX Local Brain code generate করছে...

🤖 Generator:

ODX Local Brain

🧠 Model:

odx-brain
`.trim()
        );


        const localPrompt = `
USER REQUEST:

${pendingPrompt}

TARGET FILE:

${pendingFilePath}

CURRENT FILE:

${pendingFilePath}

CURRENT CODE:

${pendingExistingCode || 'No existing code.'}

ODX KNOWLEDGE:

${pendingKnowledgeText || 'No external knowledge found.'}

IMPORTANT NEXT.JS FILE RULES:

- If the target is an API route, generate ONLY the API route source.
- Next.js App Router API routes MUST use app/api/**/route.ts.
- NEVER place API route GET/POST/PUT/DELETE handlers inside app/page.tsx.
- Do NOT mix page UI code with API route code.
- Preserve unrelated existing code.
- If the target file does not exist, generate the complete new file.
- The generated code must match the TARGET FILE.

TASK:

Generate the required code for the user's request.

Use the provided ODX Knowledge when relevant.

If existing code is present, preserve unrelated functionality.

Return ONLY the complete source code.

Do NOT return Markdown.

Do NOT return code fences.

Do NOT return explanations.
`.trim();


        const localResult =
          await localBrain.generateCode(
            localPrompt
          );


        const cleanedLocalCode =
          cleanGeneratedCode(
            localResult.code
          );


        if (
          localResult.success &&
          cleanedLocalCode.trim()
        ) {

          generated = {

            result: {

              filePath:
                pendingFilePath,

              code:
                cleanedLocalCode
            },

            provider:
              pendingProvider,

            model:
              pendingModel,

            apiKey:
              pendingApiKey,

            apiId:
              pendingApiId
          };


          generatedByLocalBrain =
            true;


          chatProvider?.addMessage(
            'agent',
            `
${getGeneratorInfo(true)}

📚 Information Source:

${pendingKnowledgeSource || 'No external knowledge'}

${buildCodeChangePreview(
  pendingExistingCode,
  cleanedLocalCode,
  pendingFilePath
)}

🔍 Bug Check:

⏳ এখন project build/test করা হবে।

🔧 Auto Fix:

Build error পাওয়া গেলে automatic fix চেষ্টা করা হবে।
`.trim()
          );
        }

      } catch (error) {

        console.log(
          'Local Brain failed.',
          error
        );
      }
    }


    /*
     * =================================================
     * TEACHER AI FALLBACK
     * =================================================
     */

    if (!generated) {

      if (!pendingApiKey) {

        const autoApi =
          getAutoSelectedApi();

        if (autoApi) {
          activateApi(autoApi);
        }
      }


      if (!pendingApiKey) {

        throw new Error(
          'Local Brain কাজটি করতে পারেনি এবং কোনো valid Groq/Gemini API Key নেই।'
        );
      }


      chatProvider?.addMessage(
        'agent',
        `
🌐 ODX Local Brain কাজটি করতে পারেনি।

${getGeneratorInfo(
  false,
  pendingProvider,
  pendingModel
)}

📚 Information Source:

${
  pendingKnowledgeSource ||
  'Open Knowledge / Teacher AI'
}

🤖 Teacher AI দিয়ে code generate করা হচ্ছে...
`.trim()
      );


      const teacherPrompt = `
USER REQUEST:

${pendingPrompt}

TARGET FILE:

${pendingFilePath}

CURRENT CODE:

${pendingExistingCode || 'No existing code.'}

ODX KNOWLEDGE:

${pendingKnowledgeText || 'No external knowledge found.'}

STRICT NEXT.JS RULES:

1. Follow the requested target file exactly.
2. If this is an API route, use app/api/**/route.ts.
3. NEVER put an API route handler inside app/page.tsx.
4. Do not modify page.tsx for an API-only request unless explicitly required.
5. If the target file does not exist, create the complete source for that file.
6. Preserve unrelated existing functionality.
7. Return COMPLETE SOURCE CODE ONLY.
8. Do NOT return Markdown.
9. Do NOT return code fences.
10. Do NOT return explanations.
11. Do NOT return JSON.
`.trim();


      generated =
        await generateWithFallback(
          teacherPrompt,
          pendingExistingCode,
          pendingFilePath,
          pendingProvider,
          pendingModel,
          pendingApiKey
        );
    }


    /*
     * =================================================
     * UPDATE CURRENT API
     * =================================================
     */

    pendingProvider =
      generated.provider;

    pendingModel =
      generated.model;

    pendingApiKey =
      generated.apiKey;

    pendingApiId =
      generated.apiId;


    generated.result.code =
      cleanGeneratedCode(
        generated.result.code
      );


    /*
     * Force correct target file
     */

    generated.result.filePath =
      pendingFilePath;


    if (generated.apiId) {

      setCurrentApi(
        generated.provider,
        generated.model,
        generated.apiId
      );
    }


    /*
     * =================================================
     * TEACHER GENERATED MESSAGE
     * =================================================
     */

    if (!generatedByLocalBrain) {

      chatProvider?.addMessage(
        'agent',
        `
${getGeneratorInfo(
  false,
  generated.provider,
  generated.model
)}

📚 Information Source:

${pendingKnowledgeSource || 'Teacher AI / Open Knowledge'}

${buildCodeChangePreview(
  pendingExistingCode,
  generated.result.code,
  generated.result.filePath
)}
`.trim()
      );
    }


    let lastBuildError = '';


    /*
     * =================================================
     * BUILD / BUG FIX LOOP
     * =================================================
     */

    for (
      let attempt = 1;
      attempt <= 3;
      attempt++
    ) {

      chatProvider?.addMessage(
        'agent',
        `
🔍 Bug Check ${attempt}/3

📄 File:

${generated.result.filePath}

⏳ Project build/test চলছে...
`.trim()
      );


      generated.result.code =
        cleanGeneratedCode(
          generated.result.code
        );


      await writeCodeToFile(
        pendingWorkspaceFolder,
        generated.result.filePath,
        generated.result.code
      );


      const build =
        await checkProject(
          pendingWorkspaceFolder
        );


      /*
       * =================================================
       * BUILD SUCCESS
       * =================================================
       */

      if (
        build.success
      ) {

        /*
         * Create embedding
         */

        let embedding:
          | number[]
          | undefined;


        try {

          embedding =
            await createEmbedding(
              `
Prompt:

${pendingPrompt}

Knowledge:

${pendingKnowledgeText}

Solution:

${generated.result.code}
`.trim()
            );

        } catch (error) {

          console.log(
            'Embedding creation failed:',
            error
          );
        }


        /*
         * Save successful solution
         */

        try {

          await saveToMemory(
            pendingPrompt,
            generated.result.filePath,
            generated.result.code,
            embedding
              ? embedding
              : []
          );

        } catch (error) {

          console.error(
            'ODX Knowledge save failed:',
            error
          );
        }


        /*
         * Save training data
         */

        const trainingSaved =
          await saveTrainingData({

            prompt:
              pendingPrompt,

            knowledge:
              pendingKnowledgeText,

            solution:
              generated.result.code
          });


        const generatorName =
          generatedByLocalBrain
            ? 'ODX Local Brain'
            : generated.provider === 'groq'
              ? 'Groq'
              : 'Google Gemini';


        chatProvider?.addMessage(
          'agent',
          `
🎉 CODE GENERATION SUCCESS

🤖 Code Generator:

${generatorName}

🧠 Model:

${
  generatedByLocalBrain
    ? 'odx-brain'
    : generated.model
}

📄 File:

${generated.result.filePath}

📚 Knowledge Source:

${pendingKnowledgeSource || 'None'}

🔍 Bug Check:

✅ Build successful

✅ No build error found

🔧 Auto Fix:

${
  attempt > 1
    ? `✅ Bug পাওয়া গিয়েছিল এবং ${attempt - 1} বার fix করা হয়েছে।`
    : '✅ কোনো bug fix প্রয়োজন হয়নি।'
}

💾 ODX Knowledge:

✅ Successful solution save হয়েছে

🧠 ODX Training:

${
  trainingSaved
    ? '✅ Training Data-তে save হয়েছে'
    : 'ℹ️ Duplicate হওয়ায় নতুন Training Data save হয়নি'
}
`.trim()
        );


        vscode.window.showInformationMessage(
          '✅ ODX কাজ সফলভাবে সম্পন্ন হয়েছে।'
        );


        return;
      }


      /*
       * =================================================
       * BUILD FAILED
       * =================================================
       */

      lastBuildError =
        build.output;


      chatProvider?.addMessage(
        'agent',
        `
❌ BUG FOUND

🔍 Build Check:

Failed

📄 File:

${generated.result.filePath}

🔴 Error:

${lastBuildError.slice(0, 3000)}

🔧 Auto Fix:

পরবর্তী ধাপে automatic fix চেষ্টা করা হবে।
`.trim()
      );


      if (
        attempt >= 3
      ) {
        break;
      }


      /*
       * =================================================
       * AUTO FIX PROMPT
       * =================================================
       */

      const fixPrompt =
        buildAutoFixPrompt(
          pendingPrompt,
          generated.result.filePath,
          generated.result.code,
          lastBuildError
        );


      /*
       * =================================================
       * LOCAL BRAIN AUTO FIX
       * =================================================
       */

      let fixedByLocalBrain =
        false;


      if (
        localBrain &&
        localBrain.isReady()
      ) {

        try {

          chatProvider?.addMessage(
            'agent',
            `
🧠 Auto Fix:

ODX Local Brain

🧠 Model:

odx-brain

⏳ Bug fix করার চেষ্টা করছে...
`.trim()
          );


          const localFix =
            await localBrain.generateCode(
              fixPrompt
            );


          const cleanedLocalFix =
            cleanGeneratedCode(
              localFix.code
            );


          if (
            localFix.success &&
            cleanedLocalFix.trim() &&
            cleanedLocalFix.trim() !==
              generated.result.code.trim()
          ) {

            generated.result.code =
              cleanedLocalFix;


            fixedByLocalBrain =
              true;


            chatProvider?.addMessage(
              'agent',
              `
🔧 AUTO FIX RESULT

🤖 Generator:

ODX Local Brain

🧠 Model:

odx-brain

✅ Corrected code তৈরি হয়েছে।

🔍 আবার Build Check করা হবে...
`.trim()
            );
          }

        } catch (error) {

          console.log(
            'Local Brain auto-fix failed.',
            error
          );
        }
      }


      /*
       * =================================================
       * TEACHER AI AUTO FIX
       * =================================================
       */

      if (!fixedByLocalBrain) {

        if (!pendingApiKey) {

          const autoApi =
            getAutoSelectedApi();

          if (autoApi) {
            activateApi(autoApi);
          }
        }


        if (!pendingApiKey) {
          break;
        }


        chatProvider?.addMessage(
          'agent',
          `
🌐 Local Brain দিয়ে Auto Fix সম্ভব হয়নি।

🤖 Teacher AI Auto Fix:

${
  pendingProvider === 'groq'
    ? 'Groq'
    : 'Google Gemini'
}

🧠 Model:

${pendingModel}

⏳ Exact build error অনুযায়ী corrected code তৈরি করা হচ্ছে...
`.trim()
        );


        const fixed =
          await generateWithFallback(
            fixPrompt,
            generated.result.code,
            generated.result.filePath,
            pendingProvider,
            pendingModel,
            pendingApiKey
          );


        const fixedCode =
          cleanGeneratedCode(
            fixed.result.code
          );


        if (
          fixedCode.trim() ===
          generated.result.code.trim()
        ) {

          chatProvider?.addMessage(
            'agent',
            `
⚠️ Teacher AI একই code ফিরিয়েছে।

🔄 এই fix attempt সফল ধরা হচ্ছে না।
`.trim()
          );

          break;
        }


        generated = {

          result: {

            filePath:
              generated.result.filePath,

            code:
              fixedCode
          },

          provider:
            fixed.provider,

          model:
            fixed.model,

          apiKey:
            fixed.apiKey,

          apiId:
            fixed.apiId
        };


        pendingProvider =
          generated.provider;

        pendingModel =
          generated.model;

        pendingApiKey =
          generated.apiKey;

        pendingApiId =
          generated.apiId;


        setCurrentApi(
          generated.provider,
          generated.model,
          generated.apiId
        );


        generatedByLocalBrain =
          false;
      }
    }


    /*
     * =================================================
     * FINAL FAILURE
     * =================================================
     */

    const errorMessage =
      `
❌ CODE GENERATION FAILED

🔍 Bug Check:

3টি build/fix attempt-এর পরও project build হয়নি।

🔴 Final Build Error:

${lastBuildError}
`.trim();


    chatProvider?.addMessage(
      'agent',
      errorMessage
    );


    vscode.window.showErrorMessage(
      '❌ ODX code generation failed.'
    );


  } catch (
    error: unknown
  ) {

    console.error(
      'ODX Agent error:',
      error
    );


    const message =
      error instanceof Error
        ? error.message
        : String(error);


    chatProvider?.addMessage(
      'agent',
      `
❌ ODX Agent Error

${message}
`.trim()
    );


    vscode.window.showErrorMessage(
      message
    );
  }
}


/*
 * =====================================================
 * DEACTIVATE
 * =====================================================
 */

export function deactivate(): void {

  if (localBrain) {
    localBrain.unload();
  }

  console.log(
    'ODX Mini Agent deactivated.'
  );
}