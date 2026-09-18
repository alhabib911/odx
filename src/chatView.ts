import * as vscode from 'vscode';

export class AgentChatProvider
  implements vscode.WebviewViewProvider {

  public static readonly viewType =
    'my-mini-agent.chatView';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,

    private readonly _onUserPrompt:
      (prompt: string) => void,

    private readonly _onActionConfirm:
      (action: 'approve' | 'skip') => void,

    private readonly _onUpdateSettings:
      (provider: string, model: string) => void,

    private readonly _onAddApiKey:
      (
        provider: 'groq' | 'gemini',
        apiKey: string
      ) => void,

    private readonly _onRemoveApiKey:
      (id: string) => void
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html =
      this._getHtmlForWebview(
        webviewView.webview
      );

    webviewView.webview.onDidReceiveMessage(
      (data) => {

        if (data.type === 'userPrompt') {

          this._onUserPrompt(
            data.value
          );

        } else if (
          data.type === 'actionResponse'
        ) {

          this._onActionConfirm(
            data.value
          );

        } else if (
          data.type === 'updateSettings'
        ) {

          this._onUpdateSettings(
            data.provider,
            data.model
          );

        } else if (
          data.type === 'addApiKey'
        ) {

          if (
            (
              data.provider === 'groq' ||
              data.provider === 'gemini'
            ) &&
            typeof data.apiKey === 'string'
          ) {

            this._onAddApiKey(
              data.provider,
              data.apiKey
            );
          }

        } else if (
          data.type === 'removeApiKey'
        ) {

          if (
            typeof data.id === 'string'
          ) {

            this._onRemoveApiKey(
              data.id
            );
          }
        }
      }
    );
  }

  public addMessage(
    sender: 'user' | 'agent',
    text: string
  ) {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      type: 'addMessage',
      sender,
      text
    });
  }

  public showConfirmation(
    summaryText: string
  ) {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      type: 'showConfirmation',
      summaryText
    });
  }

  public syncStats(
    model: string,
    apiKey: string,
    modelStats: Record<string, number>
  ) {
    if (!this._view) {
      return;
    }

    const provider =
      model.startsWith('gemini-')
        ? 'gemini'
        : 'groq';

    this._view.webview.postMessage({
      type: 'syncStats',
      provider,
      model,
      apiKey,
      modelStats
    });
  }

  public syncCurrentApi(
    provider: 'groq' | 'gemini',
    model: string,
    apiId: string = ''
  ) {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      type: 'syncCurrentApi',
      provider,
      model,
      apiId
    });
  }

  public syncApiPool(
    apiKeys: Array<{
      id: string;
      provider:
        | 'available'
        | 'warning'
        | 'cooldown'
        | 'limit'
        | 'error'
        | 'groq'
        | 'gemini';

      status:
        | 'available'
        | 'warning'
        | 'cooldown'
        | 'limit'
        | 'error';

      usedTokens: number;
      requestCount: number;
      cooldownRemaining: number;
      totalRequests: number;
      totalTokens: number;
      lastError?: string;
    }>
  ) {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      type: 'syncApiPool',
      apiKeys
    });
  }

  public startApiCooldown(
    seconds: number
  ) {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      type: 'apiCooldown',
      seconds
    });
  }

  private _getHtmlForWebview(
    webview: vscode.Webview
  ): string {

    return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<style>

* {
  box-sizing: border-box;
}

body {
  font-family: var(--vscode-font-family);
  color: var(--vscode-foreground);
  display: flex;
  flex-direction: column;
  height: 100vh;
  margin: 0;
  padding: 10px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--vscode-widget-border);
  margin-bottom: 8px;
}

.header-title {
  font-size: 13px;
  font-weight: bold;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.current-model {
  font-size: 10px;
  opacity: 0.75;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 5px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  cursor: pointer;
}

.settings-panel {
  display: none;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--vscode-sideBar-background);
  max-height: 340px;
  overflow-y: auto;
}

.settings-panel.open {
  display: block;
}

.settings-title {
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 8px;
}

.settings-section {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.settings-section:last-child {
  border-bottom: none;
}

label {
  font-size: 10px;
  display: block;
  margin-bottom: 3px;
  opacity: 0.8;
}

select,
input {
  padding: 6px;
  border: 1px solid var(--vscode-input-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 4px;
  outline: none;
  width: 100%;
}

button {
  cursor: pointer;
  border: none;
  padding: 6px 10px;
  border-radius: 4px;
  font-weight: bold;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-button {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.add-button {
  margin-top: 5px;
  width: 100%;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  font-size: 10px;
}

.api-title {
  font-size: 11px;
  font-weight: bold;
  margin-bottom: 5px;
}

.api-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  padding: 5px;
  border-radius: 4px;
  margin-bottom: 4px;
  background: var(--vscode-editor-inactiveSelectionBackground);
}

.api-left {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  min-width: 8px;
  border-radius: 50%;
}

.status-available {
  background: #28a745;
}

.status-warning {
  background: #ffc107;
}

.status-cooldown {
  background: #ff9800;
}

.status-limit,
.status-error {
  background: #dc3545;
}

.api-name {
  font-size: 10px;
}

.api-info {
  font-size: 9px;
  opacity: 0.7;
}

.api-error {
  font-size: 8px;
  color: var(--vscode-errorForeground);
}

.remove-api {
  background: transparent;
  color: var(--vscode-errorForeground);
  padding: 2px 5px;
}

.settings-status {
  font-size: 9px;
  opacity: 0.8;
  margin-top: 5px;
}

#chat-history {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 10px;
}

.msg {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  line-height: 1.4;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.user {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  margin-left: 20px;
}

.agent {
  background: var(--vscode-editor-inactiveSelectionBackground);
  border: 1px solid var(--vscode-widget-border);
}

.confirm-box {
  border: 1px solid var(--vscode-focusBorder);
  padding: 10px;
  border-radius: 6px;
  margin-top: 8px;
  margin-bottom: 8px;
  background: var(--vscode-sideBar-background);
}

.btn-group {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.btn-approve {
  background: #28a745;
  color: white;
}

.btn-skip {
  background: #dc3545;
  color: white;
}

.input-box {
  display: flex;
  gap: 6px;
}

.warning-banner {
  background: #856404;
  color: #fff3cd;
  padding: 6px;
  font-size: 10px;
  border-radius: 4px;
  margin-bottom: 6px;
  display: none;
  text-align: center;
}

</style>

</head>

<body>

<div class="header">

  <div class="header-title">
    ODX Mini Agent
  </div>

  <div class="header-right">

    <div
      id="current-model"
      class="current-model"
    >
      GROQ • GPT-OSS 20B
    </div>

    <button
      class="settings-button"
      onclick="toggleSettings()"
    >
      ⚙️
    </button>

  </div>

</div>


<div
  id="settings-panel"
  class="settings-panel"
>

  <div class="settings-title">
    ⚙️ AI Settings
  </div>


  <div class="settings-section">

    <label>
      API Provider
    </label>

    <select
      id="provider-select"
      onchange="providerChanged()"
    >

      <option value="groq">
        Groq
      </option>

      <option value="gemini">
        Gemini
      </option>

    </select>

  </div>


  <div class="settings-section">

    <label>
      Model
    </label>

    <select
      id="model-select"
      onchange="updateSettings()"
    ></select>

  </div>


  <div class="settings-section">

    <div class="api-title">
      🔑 API Keys
    </div>

    <div id="api-list">
      No API keys added
    </div>

    <input
      type="password"
      id="api-key-input"
      placeholder="Groq / Gemini API Key..."
    />

    <button
      class="add-button"
      onclick="addApiKey()"
    >
      ＋ Add API Key
    </button>

  </div>


  <div class="settings-section">

    <div class="api-title">
      📊 Requests
    </div>

    <div
      id="stats-container"
      style="font-size:10px;"
    >
      No requests yet
    </div>

  </div>


  <div
    id="settings-status"
    class="settings-status"
  ></div>

</div>


<div
  id="cooldown-banner"
  class="warning-banner"
>
  ⏳ API cooldown:
  <span id="cooldown-timer">0</span>
  seconds
</div>


<div id="chat-history"></div>


<div class="input-box">

  <input
    type="text"
    id="prompt-input"
    placeholder="আপনার নির্দেশ লিখুন..."
    onkeypress="handleKeyPress(event)"
    style="flex:1;"
  />

  <button
    id="send-btn"
    class="primary-button"
    onclick="sendPrompt()"
  >
    Send
  </button>

</div>


<script>

const vscode =
  acquireVsCodeApi();

let cooldownActive = false;
let countdownInterval = null;
let apiPool = [];
let currentApiId = '';


const models = {

  groq: [
    {
      value: 'openai/gpt-oss-20b',
      label: 'GPT-OSS 20B'
    },
    {
      value: 'openai/gpt-oss-120b',
      label: 'GPT-OSS 120B'
    }
  ],

  gemini: [
    {
      value: 'gemini-3.6-flash',
      label: 'Gemini 3.6 Flash'
    },
    {
      value: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash'
    },
    {
      value: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro'
    }
  ]

};


function toggleSettings() {

  const panel =
    document.getElementById(
      'settings-panel'
    );

  if (panel) {
    panel.classList.toggle('open');
  }
}


function loadModels(
  provider,
  selectedModel = null
) {

  const select =
    document.getElementById(
      'model-select'
    );

  if (!select) {
    return;
  }

  select.innerHTML = '';

  const providerModels =
    models[provider] || [];

  providerModels.forEach(
    model => {

      const option =
        document.createElement(
          'option'
        );

      option.value =
        model.value;

      option.textContent =
        model.label;

      select.appendChild(
        option
      );

    }
  );

  if (selectedModel) {

    const exists =
      providerModels.some(
        model =>
          model.value ===
          selectedModel
      );

    if (exists) {

      select.value =
        selectedModel;

      return;
    }
  }

  if (providerModels.length > 0) {

    select.value =
      providerModels[0].value;
  }
}


function providerChanged() {

  const providerElement =
    document.getElementById(
      'provider-select'
    );

  if (!providerElement) {
    return;
  }

  const provider =
    providerElement.value;

  loadModels(provider);

  updateSettings();

  renderApiList();
}


function updateSettings() {

  const providerElement =
    document.getElementById(
      'provider-select'
    );

  const modelElement =
    document.getElementById(
      'model-select'
    );

  if (
    !providerElement ||
    !modelElement
  ) {
    return;
  }

  const provider =
    providerElement.value;

  const model =
    modelElement.value;

  vscode.postMessage({

    type: 'updateSettings',

    provider,

    model

  });

  updateCurrentModel(
    provider,
    model
  );

  showStatus(
    'Settings saved'
  );
}


/*
 * ================================================
 * API KEY AUTO DETECTION
 * ================================================
 */

function detectProviderFromApiKey(
  apiKey
) {

  const key =
    String(apiKey || '').trim();

  /*
   * Groq
   *
   * সাধারণ Groq API key:
   * gsk_...
   */

  if (
    key.startsWith('gsk_')
  ) {

    return 'groq';
  }


  /*
   * Gemini / Google
   *
   * সাধারণ Gemini API key:
   * AIza...
   */

  if (
    key.startsWith('AIza')
  ) {

    return 'gemini';
  }


  return null;
}


/*
 * ================================================
 * ADD API KEY
 * ================================================
 */

function addApiKey() {

  const input =
    document.getElementById(
      'api-key-input'
    );

  if (!input) {
    return;
  }

  const apiKey =
    input.value.trim();

  if (!apiKey) {

    showStatus(
      'API Key লিখুন'
    );

    return;
  }


  /*
   * Provider automatically detect
   */

  const detectedProvider =
    detectProviderFromApiKey(
      apiKey
    );


  if (!detectedProvider) {

    showStatus(
      'Unknown API Key format'
    );

    return;
  }


  /*
   * Provider dropdown automatically update
   */

  const providerElement =
    document.getElementById(
      'provider-select'
    );

  if (providerElement) {

    providerElement.value =
      detectedProvider;

  }


  /*
   * Provider-এর default model load
   */

  loadModels(
    detectedProvider
  );


  const modelElement =
    document.getElementById(
      'model-select'
    );

  const model =
    modelElement?.value || '';


  /*
   * Extension host-কে settings update
   */

  vscode.postMessage({

    type: 'updateSettings',

    provider:
      detectedProvider,

    model

  });


  /*
   * API key extension host-এ পাঠানো
   */

  vscode.postMessage({

    type: 'addApiKey',

    provider:
      detectedProvider,

    apiKey

  });


  /*
   * Input clear
   */

  input.value = '';


  /*
   * Header update
   */

  updateCurrentModel(
    detectedProvider,
    model
  );


  /*
   * Status
   */

  showStatus(
    detectedProvider.toUpperCase() +
    ' API Key detected and added'
  );


  renderApiList();
}


/*
 * ================================================
 * REMOVE API KEY
 * ================================================
 */

function removeApiKey(id) {

  if (!id) {
    return;
  }

  vscode.postMessage({

    type: 'removeApiKey',

    id

  });
}


/*
 * ================================================
 * API LIST
 * ================================================
 */

function renderApiList() {

  const container =
    document.getElementById(
      'api-list'
    );

  const providerElement =
    document.getElementById(
      'provider-select'
    );

  if (
    !container ||
    !providerElement
  ) {
    return;
  }

  const provider =
    providerElement.value;

  const filtered =
    apiPool.filter(
      item =>
        item.provider === provider
    );

  if (
    filtered.length === 0
  ) {

    container.innerText =
      'No API keys added';

    return;
  }

  container.innerHTML =
    filtered
      .map(item => {

        const errorHtml =
          item.lastError
            ? '<div class="api-error">' +
              escapeHtml(
                item.lastError
              ) +
              '</div>'
            : '';

        const current =
          item.id === currentApiId
            ? ' • CURRENT'
            : '';

        return \`
          <div class="api-row">

            <div class="api-left">

              <div
                class="status-dot status-\${item.status}"
              ></div>

              <div>

                <div class="api-name">

                  \${escapeHtml(
                    item.provider.toUpperCase()
                  )}

                  ••••\${escapeHtml(
                    item.id.slice(-6)
                  )}

                  \${current}

                </div>

                <div class="api-info">

                  \${item.status}

                  •

                  \${item.usedTokens || 0}
                  tokens

                  •

                  \${item.totalRequests || 0}
                  requests

                </div>

                \${errorHtml}

              </div>

            </div>

            <button
              class="remove-api"
              onclick="removeApiKey('\${escapeAttribute(item.id)}')"
            >
              ✕
            </button>

          </div>
        \`;

      })
      .join('');
}


/*
 * ================================================
 * ESCAPE
 * ================================================
 */

function escapeHtml(value) {

  const div =
    document.createElement(
      'div'
    );

  div.textContent =
    String(value);

  return div.innerHTML;
}


function escapeAttribute(value) {

  return String(value)
    .replace(
      /\\\\/g,
      '\\\\\\\\'
    )
    .replace(
      /'/g,
      "\\\\'"
    );
}


/*
 * ================================================
 * STATS
 * ================================================
 */

function renderStats(stats) {

  const container =
    document.getElementById(
      'stats-container'
    );

  if (!container) {
    return;
  }

  if (
    !stats ||
    Object.keys(stats).length === 0
  ) {

    container.innerText =
      'No requests yet';

    return;
  }

  container.innerHTML =
    Object.entries(stats)
      .map(
        ([model, count]) =>
          '<div>• <b>' +
          escapeHtml(model) +
          '</b>: ' +
          escapeHtml(
            String(count)
          ) +
          ' requests</div>'
      )
      .join('');
}


/*
 * ================================================
 * STATUS
 * ================================================
 */

function showStatus(text) {

  const status =
    document.getElementById(
      'settings-status'
    );

  if (!status) {
    return;
  }

  status.innerText =
    text;

  setTimeout(
    () => {

      if (
        status.innerText ===
        text
      ) {

        status.innerText =
          '';

      }

    },
    2500
  );
}


/*
 * ================================================
 * COOLDOWN
 * ================================================
 */

function startCooldown(seconds) {

  cooldownActive = true;

  const promptInput =
    document.getElementById(
      'prompt-input'
    );

  const sendButton =
    document.getElementById(
      'send-btn'
    );

  if (promptInput) {
    promptInput.disabled = true;
  }

  if (sendButton) {
    sendButton.disabled = true;
  }

  const banner =
    document.getElementById(
      'cooldown-banner'
    );

  const timer =
    document.getElementById(
      'cooldown-timer'
    );

  if (
    !banner ||
    !timer
  ) {
    return;
  }

  banner.style.display =
    'block';

  let remaining =
    Math.max(
      0,
      Math.ceil(seconds)
    );

  timer.innerText =
    String(remaining);

  if (countdownInterval) {

    clearInterval(
      countdownInterval
    );
  }

  countdownInterval =
    setInterval(
      () => {

        remaining--;

        timer.innerText =
          String(
            Math.max(
              0,
              remaining
            )
          );

        if (
          remaining <= 0
        ) {

          clearInterval(
            countdownInterval
          );

          countdownInterval =
            null;

          cooldownActive =
            false;

          if (promptInput) {
            promptInput.disabled =
              false;
          }

          if (sendButton) {
            sendButton.disabled =
              false;
          }

          banner.style.display =
            'none';

        }

      },
      1000
    );
}


/*
 * ================================================
 * SEND PROMPT
 * ================================================
 */

function sendPrompt() {

  if (cooldownActive) {
    return;
  }

  const input =
    document.getElementById(
      'prompt-input'
    );

  if (!input) {
    return;
  }

  const value =
    input.value.trim();

  if (!value) {
    return;
  }

  const history =
    document.getElementById(
      'chat-history'
    );

  if (history) {

    const div =
      document.createElement(
        'div'
      );

    div.className =
      'msg user';

    div.innerText =
      'You: ' + value;

    history.appendChild(
      div
    );

    history.scrollTop =
      history.scrollHeight;
  }

  vscode.postMessage({

    type: 'userPrompt',

    value

  });

  input.value = '';
}


/*
 * ================================================
 * ENTER KEY
 * ================================================
 */

function handleKeyPress(event) {

  if (
    event.key ===
    'Enter'
  ) {

    sendPrompt();

  }
}


/*
 * ================================================
 * APPROVE / SKIP
 * ================================================
 */

function respond(action) {

  const box =
    document.getElementById(
      'active-confirm'
    );

  if (box) {
    box.remove();
  }

  vscode.postMessage({

    type: 'actionResponse',

    value: action

  });
}


/*
 * ================================================
 * CURRENT MODEL
 * ================================================
 */

function updateCurrentModel(
  provider,
  model
) {

  const element =
    document.getElementById(
      'current-model'
    );

  if (!element) {
    return;
  }

  let shortModel =
    model;

  if (
    model ===
    'openai/gpt-oss-20b'
  ) {

    shortModel =
      'GPT-OSS 20B';

  } else if (
    model ===
    'openai/gpt-oss-120b'
  ) {

    shortModel =
      'GPT-OSS 120B';

  } else if (
    model ===
    'gemini-3.6-flash'
  ) {

    shortModel =
      'Gemini 3.6 Flash';

  } else if (
    model ===
    'gemini-2.5-flash'
  ) {

    shortModel =
      'Gemini 2.5 Flash';

  } else if (
    model ===
    'gemini-2.5-pro'
  ) {

    shortModel =
      'Gemini 2.5 Pro';
  }

  element.innerText =
    provider.toUpperCase() +
    ' • ' +
    shortModel;
}


/*
 * ================================================
 * MESSAGE HANDLER
 * ================================================
 */

window.addEventListener(
  'message',
  event => {

    const msg =
      event.data;

    const history =
      document.getElementById(
        'chat-history'
      );


    /*
     * ADD MESSAGE
     */

    if (
      msg.type ===
      'addMessage'
    ) {

      if (!history) {
        return;
      }

      const div =
        document.createElement(
          'div'
        );

      div.className =
        'msg ' +
        msg.sender;

      div.innerText =
        (
          msg.sender === 'user'
            ? 'You: '
            : 'AI: '
        ) +
        msg.text;

      history.appendChild(
        div
      );

      history.scrollTop =
        history.scrollHeight;

      return;
    }


    /*
     * CONFIRMATION
     */

    if (
      msg.type ===
      'showConfirmation'
    ) {

      if (!history) {
        return;
      }

      const oldBox =
        document.getElementById(
          'active-confirm'
        );

      if (oldBox) {
        oldBox.remove();
      }

      const box =
        document.createElement(
          'div'
        );

      box.className =
        'confirm-box';

      box.id =
        'active-confirm';

      const title =
        document.createElement(
          'strong'
        );

      title.innerText =
        '📋 AI কাজের পরিকল্পনা:';

      const paragraph =
        document.createElement(
          'p'
        );

      paragraph.style.margin =
        '6px 0 0 0';

      paragraph.innerText =
        msg.summaryText || '';

      const buttons =
        document.createElement(
          'div'
        );

      buttons.className =
        'btn-group';

      const approve =
        document.createElement(
          'button'
        );

      approve.className =
        'btn-approve';

      approve.innerText =
        'Approve & Write';

      approve.onclick =
        () =>
          respond('approve');

      const skip =
        document.createElement(
          'button'
        );

      skip.className =
        'btn-skip';

      skip.innerText =
        'Skip';

      skip.onclick =
        () =>
          respond('skip');

      buttons.appendChild(
        approve
      );

      buttons.appendChild(
        skip
      );

      box.appendChild(
        title
      );

      box.appendChild(
        paragraph
      );

      box.appendChild(
        buttons
      );

      history.appendChild(
        box
      );

      history.scrollTop =
        history.scrollHeight;

      return;
    }


    /*
     * CURRENT API
     */

    if (
      msg.type ===
      'syncCurrentApi'
    ) {

      currentApiId =
        msg.apiId || '';

      const providerElement =
        document.getElementById(
          'provider-select'
        );

      if (providerElement) {

        providerElement.value =
          msg.provider;
      }

      loadModels(
        msg.provider,
        msg.model
      );

      updateCurrentModel(
        msg.provider,
        msg.model
      );

      renderApiList();

      return;
    }


    /*
     * STATS
     */

    if (
      msg.type ===
      'syncStats'
    ) {

      if (msg.model) {

        const provider =
          msg.provider ||
          (
            msg.model.startsWith(
              'gemini-'
            )
              ? 'gemini'
              : 'groq'
          );

        const providerElement =
          document.getElementById(
            'provider-select'
          );

        if (providerElement) {

          providerElement.value =
            provider;
        }

        loadModels(
          provider,
          msg.model
        );

        updateCurrentModel(
          provider,
          msg.model
        );
      }

      renderStats(
        msg.modelStats
      );

      return;
    }


    /*
     * API POOL
     */

    if (
      msg.type ===
      'syncApiPool'
    ) {

      apiPool =
        Array.isArray(
          msg.apiKeys
        )
          ? msg.apiKeys
          : [];

      renderApiList();

      return;
    }


    /*
     * COOLDOWN
     */

    if (
      msg.type ===
      'apiCooldown'
    ) {

      startCooldown(
        Math.ceil(
          msg.seconds || 60
        )
      );

      return;
    }

  }
);


/*
 * ================================================
 * INITIAL UI
 * ================================================
 */

loadModels(
  'groq',
  'openai/gpt-oss-20b'
);

updateCurrentModel(
  'groq',
  'openai/gpt-oss-20b'
);

</script>

</body>

</html>`;
  }
}