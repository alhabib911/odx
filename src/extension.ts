import * as vscode from "vscode";
import { ChatViewProvider } from "./chatView";

export function activate(
  context: vscode.ExtensionContext
): void {
  const provider = new ChatViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "odx.chatView",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );
}

export function deactivate(): void {}