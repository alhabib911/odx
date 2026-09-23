import * as vscode from "vscode";

export class ChatViewProvider
  implements vscode.WebviewViewProvider
{
  constructor(
    private readonly context: vscode.ExtensionContext
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        if (message.type !== "sendCommand") {
          return;
        }

        const command = String(
          message.command || ""
        ).trim();

        if (!command) {
          return;
        }

        webviewView.webview.postMessage({
          type: "thinking",
        });

        const answer = await this.handleCommand(
          command
        );

        webviewView.webview.postMessage({
          type: "answer",
          answer,
        });
      }
    );
  }

  private async handleCommand(
    command: string
  ): Promise<string> {
    return `তোমার command পাওয়া গেছে:\n\n${command}`;
  }

  private getHtml(): string {
    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />

        <meta
          http-equiv="Content-Security-Policy"
          content="
            default-src 'none';
            style-src 'unsafe-inline';
            script-src 'unsafe-inline';
          "
        />

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
            font-family:
              -apple-system,
              BlinkMacSystemFont,
              'Segoe UI',
              sans-serif;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-foreground);
          }

          .container {
            height: 100vh;
            display: flex;
            flex-direction: column;
          }

          .header {
            padding: 14px 16px;
            border-bottom: 1px solid
              var(--vscode-panel-border);
            font-size: 15px;
            font-weight: 600;
          }

          .messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
          }

          .message {
            margin-bottom: 14px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .user {
            color: var(--vscode-textLink-foreground);
          }

          .assistant {
            color: var(--vscode-foreground);
          }

          .input-area {
            padding: 12px;
            border-top: 1px solid
              var(--vscode-panel-border);
          }

          textarea {
            width: 100%;
            min-height: 70px;
            max-height: 180px;
            resize: vertical;
            padding: 10px;
            border: 1px solid
              var(--vscode-input-border);
            border-radius: 6px;
            outline: none;
            background:
              var(--vscode-input-background);
            color:
              var(--vscode-input-foreground);
            font-family: inherit;
            font-size: 13px;
          }

          textarea:focus {
            border-color:
              var(--vscode-focusBorder);
          }

          button {
            width: 100%;
            margin-top: 8px;
            padding: 9px 12px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            background:
              var(--vscode-button-background);
            color:
              var(--vscode-button-foreground);
          }

          button:hover {
            background:
              var(--vscode-button-hoverBackground);
          }

          button:disabled {
            opacity: 0.6;
            cursor: default;
          }
        </style>
      </head>

      <body>
        <div class="container">

          <div class="header">
            ODX Chat
          </div>

          <div
            id="messages"
            class="messages"
          >
            <div class="message assistant">
              Hello! How can I help you?
            </div>
          </div>

          <div class="input-area">
            <textarea
              id="input"
              placeholder="Ask ODX..."
            ></textarea>

            <button id="send">
              Send
            </button>
          </div>

        </div>

        <script>
          const vscode =
            acquireVsCodeApi();

          const input =
            document.getElementById("input");

          const send =
            document.getElementById("send");

          const messages =
            document.getElementById("messages");

          function addMessage(
            text,
            type
          ) {
            const message =
              document.createElement("div");

            message.className =
              "message " + type;

            message.textContent = text;

            messages.appendChild(message);

            messages.scrollTop =
              messages.scrollHeight;

            return message;
          }

          function sendMessage() {
            const command =
              input.value.trim();

            if (!command) {
              return;
            }

            addMessage(
              command,
              "user"
            );

            input.value = "";

            send.disabled = true;

            vscode.postMessage({
              type: "sendCommand",
              command,
            });
          }

          send.addEventListener(
            "click",
            sendMessage
          );

          input.addEventListener(
            "keydown",
            (event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();
                sendMessage();
              }
            }
          );

          window.addEventListener(
            "message",
            (event) => {
              const message =
                event.data;

              if (
                message.type ===
                "thinking"
              ) {
                addMessage(
                  "Thinking...",
                  "assistant"
                );

                return;
              }

              if (
                message.type ===
                "answer"
              ) {
                const thinkingMessages =
                  messages.querySelectorAll(
                    ".assistant"
                  );

                const last =
                  thinkingMessages[
                    thinkingMessages.length - 1
                  ];

                if (
                  last &&
                  last.textContent ===
                    "Thinking..."
                ) {
                  last.textContent =
                    message.answer;
                } else {
                  addMessage(
                    message.answer,
                    "assistant"
                  );
                }

                send.disabled = false;
                input.focus();
              }
            }
          );

          input.focus();
        </script>
      </body>
      </html>
    `;
  }
}