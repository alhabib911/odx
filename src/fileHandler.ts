import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';


export interface ActiveEditorCode {
  existingCode: string;
  relativePath: string;
}


/*
 * =====================================================
 * GET ACTIVE EDITOR CODE
 * =====================================================
 */

export function getActiveEditorCode(): ActiveEditorCode {

  const editor =
    vscode.window.activeTextEditor;

  if (!editor) {

    return {
      existingCode: '',
      relativePath: ''
    };
  }


  const document =
    editor.document;


  const workspaceFolder =
    vscode.workspace.getWorkspaceFolder(
      document.uri
    );


  if (!workspaceFolder) {

    return {
      existingCode:
        document.getText(),

      relativePath:
        path.basename(
          document.fileName
        )
    };
  }


  const relativePath =
    path.relative(
      workspaceFolder.uri.fsPath,
      document.fileName
    );


  return {
    existingCode:
      document.getText(),

    relativePath:
      relativePath.replace(
        /\\/g,
        '/'
      )
  };
}


/*
 * =====================================================
 * WRITE CODE TO FILE
 * =====================================================
 */

export async function writeCodeToFile(
  workspaceFolder: string,
  relativeFilePath: string,
  code: string
): Promise<void> {

  if (!workspaceFolder) {

    throw new Error(
      'Workspace folder পাওয়া যায়নি।'
    );
  }


  if (!relativeFilePath) {

    throw new Error(
      'Target file path পাওয়া যায়নি।'
    );
  }


  /*
   * Normalize path
   */

  const cleanRelativePath =
    relativeFilePath
      .replace(
        /^["']|["']$/g,
        ''
      )
      .replace(
        /\\/g,
        '/'
      )
      .trim();


  /*
   * Prevent writing outside workspace
   */

  const targetPath =
    path.resolve(
      workspaceFolder,
      cleanRelativePath
    );


  const workspacePath =
    path.resolve(
      workspaceFolder
    );


  const relativeCheck =
    path.relative(
      workspacePath,
      targetPath
    );


  if (
    relativeCheck.startsWith('..') ||
    path.isAbsolute(relativeCheck)
  ) {

    throw new Error(
      `Invalid target file path: ${relativeFilePath}`
    );
  }


  /*
   * Create parent directories
   *
   * Example:
   *
   * app/api/users/route.ts
   *
   * automatically creates:
   *
   * app/
   * app/api/
   * app/api/users/
   */

  const directory =
    path.dirname(
      targetPath
    );


  await fs.mkdir(
    directory,
    {
      recursive: true
    }
  );


  /*
   * Write file directly.
   *
   * VS Code edit apply-এর উপর
   * dependency নেই।
   */

  await fs.writeFile(
    targetPath,
    code,
    'utf8'
  );


  /*
   * Verify file was actually written.
   */

  const writtenCode =
    await fs.readFile(
      targetPath,
      'utf8'
    );


  if (
    writtenCode !== code
  ) {

    throw new Error(
      'ফাইলে কোড লেখা হয়েছে কিন্তু verification ব্যর্থ হয়েছে।'
    );
  }


  /*
   * Refresh VS Code editor/file tree
   */

  const document =
    await vscode.workspace.openTextDocument(
      vscode.Uri.file(
        targetPath
      )
    );


  await vscode.window.showTextDocument(
    document,
    {
      preview: false,
      preserveFocus: true
    }
  );
}