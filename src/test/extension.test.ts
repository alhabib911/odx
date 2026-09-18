import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateCodeWithAI, getTaskSummaryInBangla } from '../gemini';
import { getActiveEditorCode, writeCodeToFile } from '../fileHandler';
import { AgentChatProvider } from '../chatView';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');
  test('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
  });
});